const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const prisma = require('../lib/prisma');
const { loadEditableTask } = require('../lib/listAccess');
const { loadPageAccess } = require('../lib/pageAccess');
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

// An attachment hangs off exactly one owner. Tasks cap the count per type because a
// to-do with 30 photos is a mistake; a page is a document, so images there are capped
// only by file size (multer, above) -- the client downscales before uploading anyway.
router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const taskId = req.body?.taskId || null;
  const pageId = req.body?.pageId || null;
  if (!taskId === !pageId)
    return res.status(400).json({ error: 'exactly one of taskId or pageId is required' });

  if (taskId) {
    const result = await loadEditableTask(taskId, null, req.userId);
    if (result.error) return res.status(result.status).json({ error: result.error });

    const existing = await prisma.attachment.findMany({ where: { taskId }, select: { mimeType: true } });
    const image = isImage(req.file.mimetype);
    const sameType = existing.filter((a) => isImage(a.mimeType) === image).length;
    if (sameType >= MAX_PER_TYPE)
      return res.status(400).json({ error: `Max ${MAX_PER_TYPE} ${image ? 'photos' : 'files'} per task` });
  } else {
    // Uploading is an edit, so it needs the same rights as editing the page's content.
    const access = await loadPageAccess(pageId, req.userId);
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!access.canManage) return res.status(403).json({ error: 'Not allowed' });
  }

  const storedName = `${crypto.randomUUID()}${safeExt(req.file.originalname)}`;
  const storedPath = await saveFile(req.file.buffer, {
    userId: req.userId,
    entityType: taskId ? 'task' : 'page',
    entityId: taskId || pageId,
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
      pageId,
    },
  });
  // No page equivalent: the content save that follows carries the new reference, and
  // that already emits page:updated.
  if (taskId) await emitTaskUpdated(taskId);
  res.status(201).json(serializeAttachment(att));
});

router.delete('/:id', async (req, res) => {
  const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!att) return res.status(404).json({ error: 'Attachment not found' });

  if (att.uploadedBy !== req.userId) {
    if (att.taskId) {
      const result = await loadEditableTask(att.taskId, null, req.userId);
      if (result.error) return res.status(result.status).json({ error: result.error });
    } else if (att.pageId) {
      const access = await loadPageAccess(att.pageId, req.userId);
      if (access.error) return res.status(access.status).json({ error: access.error });
      if (!access.canManage) return res.status(403).json({ error: 'Not allowed' });
    } else {
      return res.status(403).json({ error: 'Not allowed' });
    }
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
