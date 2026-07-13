const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { loadEditableTask } = require('../lib/listAccess');
const { serializeAttachment } = require('../lib/serializers');
const { saveFile, deleteFile } = require('../lib/storage');
const { emitTaskUpdated } = require('./lists');

const router = express.Router();

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_PER_TYPE = 5;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES } });

const isImage = (mime) => (mime || '').startsWith('image/');
// Keep only a safe extension from the original name (never used to build the path).
const safeExt = (name) => {
  const ext = path.extname(name || '').toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : '';
};

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const taskId = req.body?.taskId;
  if (!taskId) return res.status(400).json({ error: 'taskId is required' });

  const result = await loadEditableTask(taskId, null, req.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const existing = await prisma.attachment.findMany({ where: { taskId }, select: { mimeType: true } });
  const image = isImage(req.file.mimetype);
  const sameType = existing.filter((a) => isImage(a.mimeType) === image).length;
  if (sameType >= MAX_PER_TYPE)
    return res.status(400).json({ error: `Max ${MAX_PER_TYPE} ${image ? 'photos' : 'files'} per task` });

  const storedName = `${crypto.randomUUID()}${safeExt(req.file.originalname)}`;
  const storedPath = await saveFile(req.file.buffer, {
    userId: req.userId,
    entityType: 'task',
    entityId: taskId,
    storedName,
  });
  const att = await prisma.attachment.create({
    data: {
      filename: req.file.originalname,
      storedPath,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      uploadedBy: req.userId,
      taskId,
    },
  });
  await emitTaskUpdated(taskId);
  res.status(201).json(serializeAttachment(att));
});

router.delete('/:id', async (req, res) => {
  const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  if (att.uploadedBy !== req.userId) {
    if (!att.taskId) return res.status(403).json({ error: 'Not allowed' });
    const result = await loadEditableTask(att.taskId, null, req.userId);
    if (result.error) return res.status(result.status).json({ error: result.error });
  }

  await deleteFile(att.storedPath);
  await prisma.attachment.delete({ where: { id: att.id } });
  if (att.taskId) await emitTaskUpdated(att.taskId);
  res.status(204).end();
});

// Multer errors (e.g. file too large) → 413/400 instead of a 500.
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
