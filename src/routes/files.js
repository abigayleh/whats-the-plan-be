const express = require('express');
const prisma = require('../lib/prisma');
const { captureException } = require('../lib/sentry');
const { loadListAccess } = require('../lib/listAccess');
const { loadPageAccess } = require('../lib/pageAccess');
const { readFile } = require('../lib/storage');

const router = express.Router();

// Strip characters that could break the Content-Disposition header.
const safeName = (name) => String(name || 'file').replace(/[^\w.\- ]+/g, '_');

router.get('/:id', async (req, res) => {
  const att = await prisma.attachment.findUnique({ where: { id: req.params.id } });
  if (!att) return res.status(404).json({ error: 'File not found' });

  // Access is derived from the attachment's entity (message still to come in Step 13).
  // Serving only ever needs *read* access: a group member who can't edit a page must
  // still be able to see the images embedded in it.
  if (att.pageId) {
    const access = await loadPageAccess(att.pageId, req.userId);
    if (access.error) return res.status(404).json({ error: 'File not found' });
  } else if (att.taskId) {
    const task = await prisma.task.findUnique({ where: { id: att.taskId } });
    if (!task) return res.status(404).json({ error: 'File not found' });
    const access = await loadListAccess(task.listId, req.userId);
    if (access.error) return res.status(404).json({ error: 'File not found' });
  } else {
    return res.status(404).json({ error: 'File not found' });
  }

  // Read before any header is set, so a missing object is still a clean 404 rather than a
  // truncated 200. Attachments are capped at 10 MB, so buffering one is cheap.
  let body;
  try {
    body = await readFile(att.storedPath);
  } catch (err) {
    // Only a genuinely missing object is a 404. An outage or a misconfigured bucket must not
    // masquerade as one — that reads to the user as a broken image and hides the real fault.
    if (err.status && err.status !== 404) {
      captureException(err, { tags: { area: 'storage' } });
      return res.status(502).json({ error: 'File storage unavailable' });
    }
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${safeName(att.filename)}"`);
  return res.send(body);
});

module.exports = router;
