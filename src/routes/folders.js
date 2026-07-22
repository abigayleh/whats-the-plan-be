const express = require('express');
const prisma = require('../lib/prisma');
const { emitToUser } = require('../socket');

const router = express.Router();

const serializeFolder = (folder) => ({
  id: folder.id,
  name: folder.name,
  position: folder.position,
  createdAt: folder.createdAt,
});

// Loads a folder only if the caller owns it (folders are a personal overlay).
async function loadOwnedFolder(id, userId) {
  const folder = await prisma.folder.findUnique({ where: { id } });
  if (!folder || folder.ownerId !== userId) return null;
  return folder;
}

router.get('/', async (req, res) => {
  const folders = await prisma.folder.findMany({
    where: { ownerId: req.userId },
    orderBy: { position: 'asc' },
  });
  res.json(folders.map(serializeFolder));
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Folder name required' });

  // Land the new folder after every current top-level item (folders + unfoldered lists).
  const [maxFolder, maxTop] = await Promise.all([
    prisma.folder.aggregate({ where: { ownerId: req.userId }, _max: { position: true } }),
    prisma.listPlacement.aggregate({ where: { userId: req.userId, folderId: null }, _max: { position: true } }),
  ]);
  const position = Math.max(maxFolder._max.position ?? -1, maxTop._max.position ?? -1) + 1;

  const folder = await prisma.folder.create({ data: { name, ownerId: req.userId, position } });
  const payload = serializeFolder(folder);
  emitToUser(req.userId, 'folder:created', payload);
  res.status(201).json(payload);
});

router.patch('/:id', async (req, res) => {
  const folder = await loadOwnedFolder(req.params.id, req.userId);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const data = {};
  if (req.body?.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Folder name required' });
    data.name = name;
  }
  if (req.body?.position !== undefined) {
    if (!Number.isInteger(req.body.position)) return res.status(400).json({ error: 'Invalid position' });
    data.position = req.body.position;
  }

  const updated = await prisma.folder.update({ where: { id: req.params.id }, data });
  const payload = serializeFolder(updated);
  emitToUser(req.userId, 'folder:updated', payload);
  res.json(payload);
});

// Deleting a folder sets its lists' placements back to top level (folderId → null),
// via the ON DELETE SET NULL relation — no lists or tasks are lost.
router.delete('/:id', async (req, res) => {
  const folder = await loadOwnedFolder(req.params.id, req.userId);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  await prisma.folder.delete({ where: { id: req.params.id } });
  emitToUser(req.userId, 'folder:deleted', { id: req.params.id });
  res.status(204).end();
});

module.exports = { router };
