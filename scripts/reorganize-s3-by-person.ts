/**
 * One-shot: move S3 objects from the old flat layout (e.g. profile_docs/...,
 * avatars/..., expense_invoices/...) into the per-person layout
 * (people/<slug>-<id>/profile_docs/..., etc.).
 *
 * Walks every DB row that holds a storage key, computes the new key based on
 * the owning employee, copies the object to the new key, updates the DB
 * pointer, then deletes the original. Idempotent — rows already on the new
 * layout are left alone.
 *
 * Usage (run inside the app container so STORAGE_DRIVER and AWS creds are
 * loaded from .env):
 *   docker compose -f docker-compose.prod.yml exec app \
 *     npx tsx scripts/reorganize-s3-by-person.ts
 */
import { PrismaClient } from '@prisma/client';
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { profileDocsFolder, avatarsFolder, expensesFolder } from '../src/lib/people-folder';

const prisma = new PrismaClient();
const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION || 'us-east-1';

if (process.env.STORAGE_DRIVER !== 's3' || !bucket) {
  console.error('This script only runs against S3 storage. Set STORAGE_DRIVER=s3 and S3_BUCKET.');
  process.exit(1);
}

const s3 = new S3Client({
  region,
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.S3_ACCESS_KEY_ID,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        }
      : undefined,
});

async function moveObject(oldKey: string, newKey: string): Promise<boolean> {
  if (oldKey === newKey) return false;
  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${encodeURIComponent(oldKey)}`,
    Key: newKey,
  }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
  console.log(`  moved ${oldKey} → ${newKey}`);
  return true;
}

/** Re-key the trailing filename portion of an old key into a new folder. */
function rekey(oldKey: string, newFolder: string): string {
  const lastSlash = oldKey.lastIndexOf('/');
  const filename = lastSlash >= 0 ? oldKey.slice(lastSlash + 1) : oldKey;
  return `${newFolder}/${filename}`;
}

async function reorganizeExpenses() {
  const rows = await prisma.expenseClaim.findMany({
    where: { invoiceFileKey: { not: null } },
    select: {
      id: true,
      invoiceFileKey: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  console.log(`[expenses] ${rows.length} keyed rows`);

  let moved = 0;
  for (const row of rows) {
    if (!row.invoiceFileKey || !row.employee) continue;
    const desiredFolder = expensesFolder(row.employee);
    if (row.invoiceFileKey.startsWith(`${desiredFolder}/`)) continue; // already in place
    const newKey = rekey(row.invoiceFileKey, desiredFolder);
    try {
      const did = await moveObject(row.invoiceFileKey, newKey);
      if (!did) continue;
      await prisma.expenseClaim.update({ where: { id: row.id }, data: { invoiceFileKey: newKey } });
      moved++;
    } catch (err) {
      console.error(`[expenses] ${row.id} failed:`, err);
    }
  }
  console.log(`[expenses] moved=${moved}`);
}

async function reorganizeProfileBlobs() {
  const employees = await prisma.employee.findMany({
    select: { id: true, firstName: true, lastName: true, avatar: true, personalInfo: true, workInfo: true },
  });
  console.log(`[employees] ${employees.length} rows to scan`);

  let moved = 0;
  for (const emp of employees) {
    const updates: { avatar?: string; personalInfo?: string; workInfo?: string } = {};
    const docsFolder = profileDocsFolder(emp);
    const avFolder = avatarsFolder(emp);

    // 1. Avatar — stored as a redirect URL; extract the key, move, update.
    if (emp.avatar && emp.avatar.startsWith('/api/files/redirect?key=')) {
      const oldKey = decodeURIComponent(emp.avatar.split('key=')[1] ?? '');
      if (oldKey && !oldKey.startsWith(`${avFolder}/`)) {
        const newKey = rekey(oldKey, avFolder);
        try {
          if (await moveObject(oldKey, newKey)) {
            updates.avatar = `/api/files/redirect?key=${encodeURIComponent(newKey)}`;
            moved++;
          }
        } catch (err) {
          console.error(`[employees] ${emp.id} avatar failed:`, err);
        }
      }
    }

    // 2. personalInfo / workInfo — JSON blobs containing {name, key} pairs
    for (const field of ['personalInfo', 'workInfo'] as const) {
      const raw = (emp as any)[field];
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        const localMoved = await rewriteKeysInBlob(obj, docsFolder);
        if (localMoved > 0) {
          updates[field] = JSON.stringify(obj);
          moved += localMoved;
        }
      } catch (err) {
        console.error(`[employees] ${emp.id} ${field} failed:`, err);
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.employee.update({ where: { id: emp.id }, data: updates });
    }
  }
  console.log(`[employees] moved=${moved}`);
}

/**
 * Walk an arbitrary JSON value, finding {name, key} entries (whether nested
 * as a stringified-JSON value or a real object) and re-keying them under the
 * given folder.
 */
async function rewriteKeysInBlob(node: any, folder: string): Promise<number> {
  if (!node || typeof node !== 'object') return 0;
  let moved = 0;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      moved += await rewriteKeysInBlob(node[i], folder);
    }
    return moved;
  }

  for (const k of Object.keys(node)) {
    const v = node[k];

    // Stringified {name, key}
    if (typeof v === 'string' && v.startsWith('{')) {
      try {
        const inner = JSON.parse(v);
        if (inner && typeof inner === 'object' && inner.name && typeof inner.key === 'string') {
          if (!inner.key.startsWith(`${folder}/`)) {
            const newKey = rekey(inner.key, folder);
            if (await moveObject(inner.key, newKey)) {
              node[k] = JSON.stringify({ name: inner.name, key: newKey });
              moved++;
            }
          }
          continue;
        }
      } catch { /* not JSON */ }
    }

    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.name && typeof v.key === 'string') {
        if (!v.key.startsWith(`${folder}/`)) {
          const newKey = rekey(v.key, folder);
          if (await moveObject(v.key, newKey)) {
            node[k] = { name: v.name, key: newKey };
            moved++;
          }
        }
        continue;
      }
      moved += await rewriteKeysInBlob(v, folder);
    } else if (Array.isArray(v)) {
      moved += await rewriteKeysInBlob(v, folder);
    }
  }
  return moved;
}

async function reorganizeDocuments() {
  // The Document model already lives at <folder>/<file>; we don't have a
  // strong "owner" link there beyond optional employeeId, so leave it.
  const rows = await prisma.document.findMany({
    where: { employeeId: { not: null } },
    select: { id: true, filePath: true, employee: { select: { id: true, firstName: true, lastName: true } } },
  });
  console.log(`[documents] ${rows.length} keyed rows with owner`);

  let moved = 0;
  for (const row of rows) {
    if (!row.employee || !row.filePath) continue;
    const desired = profileDocsFolder(row.employee);
    if (row.filePath.startsWith(`${desired}/`)) continue;
    const newKey = rekey(row.filePath, desired);
    try {
      if (await moveObject(row.filePath, newKey)) {
        await prisma.document.update({ where: { id: row.id }, data: { filePath: newKey } });
        moved++;
      }
    } catch (err) {
      console.error(`[documents] ${row.id} failed:`, err);
    }
  }
  console.log(`[documents] moved=${moved}`);
}

async function main() {
  console.log(`Reorganizing s3://${bucket} into per-person folders`);
  await reorganizeExpenses();
  await reorganizeProfileBlobs();
  await reorganizeDocuments();
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
