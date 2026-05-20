/**
 * One-shot migration: decode legacy base64 blobs from Postgres and hand
 * them to the active storage provider (S3 in prod, local disk in dev).
 *
 * Idempotent — run it as many times as you want. It only touches rows
 * where the legacy column is set AND the new key column is still null.
 *
 * Usage:
 *   # Local (writes to ./uploads/):
 *   npx tsx scripts/migrate-base64-to-storage.ts
 *
 *   # Production (EC2, inside the app container):
 *   docker compose -f docker-compose.prod.yml run --rm app \
 *     npx tsx scripts/migrate-base64-to-storage.ts
 */
import { PrismaClient } from '@prisma/client';
import { storage, isDataUrl } from '../src/lib/storage';
import { profileDocsFolder, avatarsFolder, expensesFolder } from '../src/lib/people-folder';

const prisma = new PrismaClient();

async function uploadBase64(value: string, fileName: string, folder: string): Promise<string | null> {
  // Strip optional data:<mime>;base64, prefix. Legacy rows sometimes stored
  // raw base64 with no header, sometimes a full data URL.
  let payload = value;
  if (isDataUrl(value)) {
    const comma = value.indexOf(',');
    if (comma < 0) return null;
    payload = value.slice(comma + 1);
  }
  const buffer = Buffer.from(payload, 'base64');
  if (buffer.length === 0) return null;
  return storage.uploadFile(buffer, fileName || 'file', folder);
}

async function migrateExpenses() {
  const rows = await prisma.expenseClaim.findMany({
    where: { invoiceFile: { not: null }, invoiceFileKey: null },
    select: {
      id: true,
      invoiceFile: true,
      invoiceFileName: true,
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  console.log(`[expenses] ${rows.length} rows to migrate`);

  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const folder = row.employee ? expensesFolder(row.employee) : 'expenses';
      const key = await uploadBase64(row.invoiceFile!, row.invoiceFileName ?? 'invoice', folder);
      if (!key) { skipped++; continue; }
      await prisma.expenseClaim.update({
        where: { id: row.id },
        data: { invoiceFileKey: key, invoiceFile: null },
      });
      migrated++;
    } catch (err) {
      console.error(`[expenses] ${row.id} failed:`, err);
    }
  }
  console.log(`[expenses] migrated=${migrated} skipped=${skipped}`);
}

async function migrateHrPortal() {
  const rows = await prisma.hrPortalItem.findMany({
    where: { fileData: { not: null }, fileKey: null },
    select: { id: true, fileData: true, fileName: true },
  });
  console.log(`[hr-portal] ${rows.length} rows to migrate`);

  let migrated = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      const key = await uploadBase64(row.fileData!, row.fileName ?? 'file', 'hr_portal');
      if (!key) { skipped++; continue; }
      await prisma.hrPortalItem.update({
        where: { id: row.id },
        data: { fileKey: key, fileData: null },
      });
      migrated++;
    } catch (err) {
      console.error(`[hr-portal] ${row.id} failed:`, err);
    }
  }
  console.log(`[hr-portal] migrated=${migrated} skipped=${skipped}`);
}

/**
 * Try to parse a string as JSON without ever swallowing non-JSON exceptions
 * past the parse itself.
 */
function tryParseJson(s: string): any | undefined {
  if (typeof s !== 'string' || !s.startsWith('{')) return undefined;
  try { return JSON.parse(s); } catch { return undefined; }
}

/**
 * Walk an arbitrary JSON value. For any object shaped like
 * { name, url: "data:<mime>;base64,..." } (whether nested as an object or
 * as a stringified-JSON value), decode the base64, upload to storage, and
 * rewrite the slot to { name, key }. Returns true if anything was rewritten.
 *
 * Upload errors are NOT silently swallowed — they bubble up so the caller
 * can log them and decide to skip vs abort.
 */
async function rewriteDocFields(node: any, folder: string, path: string = '$'): Promise<boolean> {
  if (!node || typeof node !== 'object') return false;
  let mutated = false;

  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (await rewriteDocFields(node[i], folder, `${path}[${i}]`)) mutated = true;
    }
    return mutated;
  }

  for (const k of Object.keys(node)) {
    const v = node[k];

    // Case 1: value is a *stringified* doc JSON ({"name":..,"url":"data:.."})
    const inner = tryParseJson(v);
    if (inner && typeof inner === 'object' && !Array.isArray(inner)
        && inner.name && typeof inner.url === 'string' && isDataUrl(inner.url)) {
      console.log(`  upload ${path}.${k}: ${inner.name} (${inner.url.length} chars)`);
      const key = await uploadBase64(inner.url, inner.name ?? 'file', folder);
      if (key) {
        node[k] = JSON.stringify({ name: inner.name, key });
        mutated = true;
      }
      continue;
    }

    // Case 2: value is a doc *object* directly
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (v.name && typeof v.url === 'string' && isDataUrl(v.url)) {
        console.log(`  upload ${path}.${k}: ${v.name} (${v.url.length} chars)`);
        const key = await uploadBase64(v.url, v.name ?? 'file', folder);
        if (key) {
          node[k] = { name: v.name, key };
          mutated = true;
        }
        continue;
      }
      // recurse into plain nested objects
      if (await rewriteDocFields(v, folder, `${path}.${k}`)) mutated = true;
    } else if (Array.isArray(v)) {
      if (await rewriteDocFields(v, folder, `${path}.${k}`)) mutated = true;
    }
  }
  return mutated;
}

async function migrateEmployeeProfiles() {
  const employees = await prisma.employee.findMany({
    select: { id: true, firstName: true, lastName: true, avatar: true, personalInfo: true, workInfo: true },
  });
  console.log(`[employees] ${employees.length} rows to scan`);

  let migrated = 0;
  for (const emp of employees) {
    const updates: { avatar?: string; personalInfo?: string; workInfo?: string } = {};

    // Avatar — stored as a plain string (data URL or redirect URL).
    if (emp.avatar && isDataUrl(emp.avatar)) {
      try {
        const key = await uploadBase64(emp.avatar, 'avatar', avatarsFolder(emp));
        if (key) updates.avatar = `/api/files/redirect?key=${encodeURIComponent(key)}`;
      } catch (err) {
        console.error(`[employees] ${emp.id} avatar:`, err);
      }
    }

    // personalInfo (JSON string) — scan for {name, url:data:} shapes
    const docsFolder = profileDocsFolder(emp);
    for (const [field, folder] of [['personalInfo', docsFolder], ['workInfo', docsFolder]] as const) {
      const raw = (emp as any)[field];
      if (!raw) continue;
      let obj: any;
      try {
        obj = JSON.parse(raw);
      } catch (err) {
        console.error(`[employees] ${emp.id} ${field} JSON parse failed:`, err);
        continue;
      }
      try {
        if (await rewriteDocFields(obj, folder, `${field}`)) {
          updates[field] = JSON.stringify(obj);
        }
      } catch (err) {
        console.error(`[employees] ${emp.id} ${field} upload failed:`, err);
      }
    }

    if (Object.keys(updates).length > 0) {
      await prisma.employee.update({ where: { id: emp.id }, data: updates });
      migrated++;
    }
  }
  console.log(`[employees] migrated=${migrated}`);
}

async function main() {
  console.log(`Using storage driver: ${process.env.STORAGE_DRIVER ?? 'local'}`);
  await migrateExpenses();
  await migrateHrPortal();
  await migrateEmployeeProfiles();
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
