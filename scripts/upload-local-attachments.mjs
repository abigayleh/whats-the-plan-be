// Uploads attachment files still sitting in ./uploads into Supabase Storage, under the exact
// key each Attachment row already records — so existing rows start resolving with no DB change.
//   node scripts/upload-local-attachments.mjs          list what would be uploaded
//   node scripts/upload-local-attachments.mjs --write  actually upload
// Re-runnable: the upload upserts, so a partial run can simply be repeated.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

const UPLOAD_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../uploads');
const write = process.argv.includes('--write');
const prisma = new PrismaClient();

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_STORAGE_BUCKET } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_STORAGE_BUCKET) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_STORAGE_BUCKET first.');
  process.exit(1);
}
const base = SUPABASE_URL.replace(/\/+$/, '');

async function upload(storedPath, body, contentType) {
  const res = await fetch(`${base}/storage/v1/object/${SUPABASE_STORAGE_BUCKET}/${storedPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      apikey: SUPABASE_SERVICE_KEY,
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
}

const rows = await prisma.attachment.findMany({
  select: { id: true, storedPath: true, mimeType: true, filename: true },
});

const missing = [];
let done = 0;
for (const row of rows) {
  const local = join(UPLOAD_ROOT, row.storedPath);
  if (!existsSync(local)) { missing.push(row); continue; }
  if (!write) { console.log(`would upload ${row.storedPath} (${row.filename})`); done += 1; continue; }
  try {
    await upload(row.storedPath, await readFile(local), row.mimeType);
    console.log(`uploaded ${row.storedPath}`);
    done += 1;
  } catch (err) {
    console.error(`FAILED ${row.storedPath}: ${err.message}`);
  }
}

console.log(`\n${rows.length} attachment rows, ${done} ${write ? 'uploaded' : 'to upload'}, ${missing.length} with no local file.`);
// These rows point at files that no host still has — they are the ones already showing
// "Image unavailable", and only deleting the row (and its reference) can clear them.
for (const row of missing) console.log(`  no local file: ${row.storedPath} (${row.filename})`);

await prisma.$disconnect();
