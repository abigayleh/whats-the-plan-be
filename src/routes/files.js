const express = require('express');
const prisma = require('../lib/prisma');
const { loadListAccess } = require('../lib/listAccess');
const { fileStream } = require('../lib/storage');

const router = express.Router();

// Strip characters that could break the Content-Disposition header.
const safeName = (name) => String(name || 'file').replace(/[^\w.\- ]+/g, '_');

router.get('/:id', async (req, res) => {
  const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!att) return res.status(404).json({ error: 'File not found' });

  // Access is derived from the attachment's entity (task for now; message in Step 13).
  if (!att.taskId) return res.status(404).json({ error: 'File not found' });
  const task = await prisma.task.findUnique({ where: { id: att.taskId } });
  if (!task) return res.status(404).json({ error: 'File not found' });
  const access = await loadListAccess(task.listId, req.userId);
  if (access.error) return res.status(404).json({ error: 'File not found' });

  res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${safeName(att.filename)}"`);
  const stream = fileStream(att.storedPath);
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ error: 'File not found' });
  });
  stream.pipe(res);
});

module.exports = router;
