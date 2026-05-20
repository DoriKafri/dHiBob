/**
 * One-shot: rename misnamed S3 keys that have underscores where slashes
 * should be (a bug in the old sanitizer flattened "people/x/profile_docs"
 * into "people_x_profile_docs"). Restore the / separators, copy the object
 * to the corrected key, update the DB pointer, delete the original.
 *
 * Idempotent — keys that already contain `/people/` are left alone.
 *
 * Usage:
 *   docker compose -f docker-compose.prod.yml exec app \
 *     npx tsx scripts/fix-flat-keys.ts
 */
import { PrismaClient } from '@prisma/client';
import { S3Client, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const bucket = process.env.S3_BUCKET;
const region = process.env.AWS_REGION || 'us-east-1';

if (process.env.STORAGE_DRIVER !== 's3' || !bucket) {
  console.error('Run with STORAGE_DRIVER=s3 and S3_BUCKET set.');
  process.exit(1);
}

const s3 = new S3Client({
  region,
  credentials:
    process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
      : undefined,
});

/**
 * Restore slashes between known folder boundaries:
 *   people_<slug>_profile_docs/file  →  people/<slug>/profile_docs/file
 *   people_<slug>_avatars/file       →  people/<slug>/avatars/file
 *   people_<slug>_expenses/file      →  people/<slug>/expenses/file
 * If the key already has a /people/ prefix, return null (skip).
 */
function unflattenKey(key: string): string | null {
  if (key.startsWith('people/')) return null;
  const m = key.match(/^people_(.+)_(profile_docs|avatars|expenses)\/(.+)$/);
  if (!m) return null;
  const [, slug, sub, rest] = m;
  return `people/${slug}/${sub}/${rest}`;
}

async function moveIfPossible(oldKey: string): Promise<string | null> {
  const newKey = unflattenKey(oldKey);
  if (!newKey) return null;

  // Verify the source object exists (skip silently if it never landed)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: oldKey }));
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404) {
      console.warn(`  source missing in S3, skipping: ${oldKey}`);
      return newKey; // still rewrite the DB key so reads stop pointing at the dead path
    }
    throw err;
  }

  await s3.send(new CopyObjectCommand({
    Bucket: bucket,
    CopySource: `${bucket}/${encodeURIComponent(oldKey)}`,
    Key: newKey,
  }));
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: oldKey }));
  console.log(`  ${oldKey} → ${newKey}`);
  return newKey;
}

async function fixExpenses() {
  const rows = await prisma.expenseClaim.findMany({
    where: { invoiceFileKey: { not: null } },
    select: { id: true, invoiceFileKey: true },
  });
  let n = 0;
  for (const r of rows) {
    if (!r.invoiceFileKey) continue;
    const newKey = await moveIfPossible(r.invoiceFileKey);
    if (newKey && newKey !== r.invoiceFileKey) {
      await prisma.expenseClaim.update({ where: { id: r.id }, data: { invoiceFileKey: newKey } });
      n++;
    }
  }
  console.log(`[expenses] fixed=${n}`);
}

/** Walk a parsed JSON blob and unflatten any {name, key} entries we find. */
async function fixBlob(node: any): Promise<number> {
  if (!node || typeof node !== 'object') return 0;
  let n = 0;

  if (Array.isArray(node)) {
    for (const item of node) n += await fixBlob(item);
    return n;
  }

  for (const k of Object.keys(node)) {
    const v = node[k];

    // Stringified {name, key}
    if (typeof v === 'string' && v.startsWith('{')) {
      try {
        const inner = JSON.parse(v);
        if (inner && typeof inner === 'object' && inner.name && typeof inner.key === 'string') {
          const newKey = await moveIfPossible(inner.key);
          if (newKey && newKey !== inner.key) {
            node[k] = JSON.stringify({ name: inner.name, key: newKey });
            n++;
          }
          continue;
        }
      } catch { /* not JSON */ }
    }

    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.name && typeof v.key === 'string') {
        const newKey = await moveIfPossible(v.key);
        if (newKey && newKey !== v.key) {
          node[k] = { name: v.name, key: newKey };
          n++;
        }
        continue;
      }
      n += await fixBlob(v);
    } else if (Array.isArray(v)) {
      n += await fixBlob(v);
    }
  }
  return n;
}

async function fixEmployees() {
  const employees = await prisma.employee.findMany({
    select: { id: true, avatar: true, personalInfo: true, workInfo: true },
  });
  let n = 0;
  for (const emp of employees) {
    const updates: { avatar?: string; personalInfo?: string; workInfo?: string } = {};

    // avatar — stored as `/api/files/redirect?key=<key>`
    if (emp.avatar?.startsWith('/api/files/redirect?key=')) {
      const oldKey = decodeURIComponent(emp.avatar.split('key=')[1] ?? '');
      const newKey = await moveIfPossible(oldKey);
      if (newKey && newKey !== oldKey) {
        updates.avatar = `/api/files/redirect?key=${encodeURIComponent(newKey)}`;
        n++;
      }
    }

    for (const field of ['personalInfo', 'workInfo'] as const) {
      const raw = (emp as any)[field];
      if (!raw) continue;
      try {
        const obj = JSON.parse(raw);
        const moved = await fixBlob(obj);
        if (moved > 0) {
          updates[field] = JSON.stringify(obj);
          n += moved;
        }
      } catch (err) {
        console.error(`[employees] ${emp.id} ${field}:`, err);
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.employee.update({ where: { id: emp.id }, data: updates });
    }
  }
  console.log(`[employees] fixed=${n}`);
}

async function fixDocuments() {
  const rows = await prisma.document.findMany({
    where: { filePath: { not: '' } },
    select: { id: true, filePath: true },
  });
  let n = 0;
  for (const r of rows) {
    if (!r.filePath) continue;
    const newKey = await moveIfPossible(r.filePath);
    if (newKey && newKey !== r.filePath) {
      await prisma.document.update({ where: { id: r.id }, data: { filePath: newKey } });
      n++;
    }
  }
  console.log(`[documents] fixed=${n}`);
}

async function main() {
  console.log(`Fixing flat keys in s3://${bucket}`);
  await fixExpenses();
  await fixEmployees();
  await fixDocuments();
}

main().catch(err => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
