const fsp = require('fs/promises');
const path = require('path');

// Blob storage. Supabase Storage when it is configured, the local filesystem otherwise, so
// dev and the E2E suite need no bucket. `storedPath` is the object key in both cases, so a
// row written by one backend reads back through the other unchanged.
//
// The local branch is not viable in production: `uploads/` is gitignored, so a deployed host
// starts empty on every release while the Attachment rows survive in Postgres — every older
// image then 404s.
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// Read lazily, like the Resend key: tests and the E2E backend set env per-process.
function remote() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  return url && key && bucket ? { url: url.replace(/\/+$/, ''), key, bucket } : null;
}

const objectUrl = (cfg, storedPath) =>
  `${cfg.url}/storage/v1/object/${cfg.bucket}/${storedPath.split(path.sep).join('/')}`;

// The service key goes in both headers: Supabase's gateway routes on `apikey`, storage
// authorizes on the bearer token.
const authHeaders = (cfg) => ({ Authorization: `Bearer ${cfg.key}`, apikey: cfg.key });

// `status` is carried on the error so the route can tell a missing object (404) from an
// outage or a misconfigured bucket — both would otherwise read as "image unavailable".
const fail = async (action, res) => {
  const err = new Error(`Supabase storage ${action} failed (${res.status}): ${await res.text()}`);
  err.status = res.status;
  throw err;
};

const localPath = (storedPath) => path.join(UPLOAD_ROOT, storedPath);

/** Writes a buffer and returns the object key (stored in the DB). */
async function saveFile(buffer, { userId, entityType, entityId, storedName, contentType }) {
  const storedPath = path.join(userId, entityType, entityId, storedName);
  const cfg = remote();
  if (!cfg) {
    await fsp.mkdir(path.dirname(localPath(storedPath)), { recursive: true });
    await fsp.writeFile(localPath(storedPath), buffer);
    return storedPath;
  }
  const res = await fetch(objectUrl(cfg, storedPath), {
    method: 'POST',
    headers: {
      ...authHeaders(cfg),
      'Content-Type': contentType || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: buffer,
  });
  if (!res.ok) await fail('upload', res);
  return storedPath;
}

/** Reads a stored object. Rejects when it is missing, which the route turns into a 404. */
async function readFile(storedPath) {
  const cfg = remote();
  if (!cfg) return fsp.readFile(localPath(storedPath));
  const res = await fetch(objectUrl(cfg, storedPath), { headers: authHeaders(cfg) });
  if (!res.ok) await fail('download', res);
  return Buffer.from(await res.arrayBuffer());
}

/** Idempotent, matching `fs.rm(..., { force: true })` — a missing object is not an error. */
async function deleteFile(storedPath) {
  const cfg = remote();
  if (!cfg) return fsp.rm(localPath(storedPath), { force: true });
  const res = await fetch(objectUrl(cfg, storedPath), { method: 'DELETE', headers: authHeaders(cfg) });
  if (!res.ok && res.status !== 404) await fail('delete', res);
  return undefined;
}

module.exports = { saveFile, readFile, deleteFile, isRemote: () => Boolean(remote()) };
