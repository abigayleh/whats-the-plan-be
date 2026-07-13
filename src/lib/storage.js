const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// Local-filesystem storage. To move to S3, swap the bodies here — schema/API unchanged.
const UPLOAD_ROOT = path.join(process.cwd(), 'uploads');

// Writes a buffer and returns a path relative to UPLOAD_ROOT (stored in the DB).
async function saveFile(buffer, { userId, entityType, entityId, storedName }) {
  const dir = path.join(UPLOAD_ROOT, userId, entityType, entityId);
  await fsp.mkdir(dir, { recursive: true });
  const full = path.join(dir, storedName);
  await fsp.writeFile(full, buffer);
  return path.relative(UPLOAD_ROOT, full);
}

const fileStream = (storedPath) => fs.createReadStream(path.join(UPLOAD_ROOT, storedPath));

const deleteFile = (storedPath) => fsp.rm(path.join(UPLOAD_ROOT, storedPath), { force: true });

module.exports = { saveFile, fileStream, deleteFile };
