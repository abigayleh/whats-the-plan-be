const express = require('express');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { loadPageAccess, resolveParent } = require('../lib/pageAccess');
const { emitToGroup, emitToUser } = require('../socket');

const router = express.Router();

// List responses omit `content` to keep the tree light; the editor fetches it per-page.
const serializeMeta = (page) => ({
  id: page.id,
  title: page.title,
  icon: page.icon,
  ownerId: page.ownerId,
  createdById: page.createdById,
  groupId: page.groupId,
  parentId: page.parentId,
  position: page.position,
  createdAt: page.createdAt,
  updatedAt: page.updatedAt,
});

const serializePage = (page) => ({ ...serializeMeta(page), content: page.content });

// Routes a page event to the group room, or the owner's room if private.
const emitScoped = (page, type, payload) =>
  page.groupId ? emitToGroup(page.groupId, type, payload) : emitToUser(page.ownerId, type, payload);

// Metadata only — the tree endpoint never pulls the (potentially large) content JSON.
const metaSelect = {
  id: true, title: true, icon: true, ownerId: true, createdById: true,
  groupId: true, parentId: true, position: true, createdAt: true, updatedAt: true,
};

// Validates title/icon/content present in body. `partial` skips required checks (PATCH).
function buildPageData(body, { partial }) {
  const data = {};
  if (body.title !== undefined || !partial) {
    const title = String(body.title ?? '').trim() || 'Untitled';
    data.title = title;
  }
  if (body.icon !== undefined) data.icon = body.icon || null;
  if (body.content !== undefined) data.content = body.content ?? null;
  return { data };
}

// True if `candidateParentId` is `pageId` itself or one of its descendants.
async function wouldCycle(pageId, candidateParentId) {
  let cursor = candidateParentId;
  while (cursor) {
    if (cursor === pageId) return true;
    const parent = await prisma.page.findUnique({ where: { id: cursor }, select: { parentId: true } });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

router.get('/', async (req, res) => {
  const { groupId } = req.query;
  const memberGroupIds = (
    await prisma.groupMember.findMany({ where: { userId: req.userId }, select: { groupId: true } })
  ).map((m) => m.groupId);

  let where;
  if (groupId === 'personal') {
    where = { groupId: null, ownerId: req.userId };
  } else if (groupId !== undefined) {
    if (!memberGroupIds.includes(groupId)) return res.status(403).json({ error: 'Not a member of this group' });
    where = { groupId };
  } else {
    where = { OR: [{ groupId: null, ownerId: req.userId }, { groupId: { in: memberGroupIds } }] };
  }

  const pages = await prisma.page.findMany({
    where, select: metaSelect, orderBy: [{ position: 'asc' }, { title: 'asc' }],
  });
  res.json(pages.map(serializeMeta));
});

// Reorder/reparent pages within one scope. Body: { parentId: string|null, orderedIds: [] }.
// Sets each page's parentId + position (= its index) transactionally. Shared order, so it
// emits to the scope like other page mutations. Caller must manage every page in the list.
router.post('/reorder', async (req, res) => {
  const parentId = req.body?.parentId || null;
  const orderedIds = req.body?.orderedIds;
  if (!Array.isArray(orderedIds) || !orderedIds.length || orderedIds.some((id) => typeof id !== 'string'))
    return res.status(400).json({ error: 'orderedIds must be a non-empty array of ids' });

  const accesses = await Promise.all(orderedIds.map((id) => loadPageAccess(id, req.userId)));
  for (const access of accesses) {
    if (access.error) return res.status(access.status).json({ error: access.error });
    if (!access.canManage) return res.status(403).json({ error: 'Not allowed to reorder these pages' });
  }

  // Every page — and the new parent — must live in one scope, and no page may nest under itself.
  const scope = accesses[0].page.groupId || null;
  if (accesses.some((a) => (a.page.groupId || null) !== scope))
    return res.status(400).json({ error: 'All pages must be in the same scope' });
  const parentCheck = await resolveParent(parentId, req.userId, scope);
  if (parentCheck.error) return res.status(400).json({ error: parentCheck.error });
  for (const id of orderedIds) {
    if (parentId && (await wouldCycle(id, parentId)))
      return res.status(400).json({ error: 'A page cannot be nested under itself' });
  }

  const updated = await prisma.$transaction(orderedIds.map((id, index) =>
    prisma.page.update({ where: { id }, data: { parentId, position: index }, select: metaSelect })));
  updated.forEach((p) => emitScoped(p, 'page:updated', serializeMeta(p)));
  res.json(updated.map(serializeMeta));
});

router.get('/:id', async (req, res) => {
  const access = await loadPageAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  res.json(serializePage(access.page));
});

router.post('/', async (req, res) => {
  const groupId = req.body?.groupId || null;
  if (groupId && !(await getMembership(req.userId, groupId)))
    return res.status(403).json({ error: 'Not a member of this group' });

  const parentId = req.body?.parentId || null;
  const parentCheck = await resolveParent(parentId, req.userId, groupId);
  if (parentCheck.error) return res.status(400).json({ error: parentCheck.error });

  const { data } = buildPageData(req.body || {}, { partial: false });
  const page = await prisma.page.create({
    data: { ...data, ownerId: req.userId, createdById: req.userId, groupId, parentId },
  });
  const payload = serializePage(page);
  emitScoped(page, 'page:created', payload);
  res.status(201).json(payload);
});

router.patch('/:id', async (req, res) => {
  const access = await loadPageAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManage) return res.status(403).json({ error: 'Not allowed to modify this page' });
  if ('groupId' in req.body && (req.body.groupId || null) !== access.page.groupId)
    return res.status(400).json({ error: 'Page scope is immutable' });

  const { data } = buildPageData(req.body || {}, { partial: true });

  if (req.body.parentId !== undefined) {
    const parentId = req.body.parentId || null;
    const parentCheck = await resolveParent(parentId, req.userId, access.page.groupId);
    if (parentCheck.error) return res.status(400).json({ error: parentCheck.error });
    if (parentId && (await wouldCycle(req.params.id, parentId)))
      return res.status(400).json({ error: 'A page cannot be nested under itself' });
    data.parentId = parentId;
  }

  const page = await prisma.page.update({ where: { id: req.params.id }, data });
  const payload = serializePage(page);
  emitScoped(page, 'page:updated', payload);
  res.json(payload);
});

router.delete('/:id', async (req, res) => {
  const access = await loadPageAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManage) return res.status(403).json({ error: 'Not allowed to modify this page' });

  // Reparent direct children up to the deleted page's parent, then delete — never drop a subtree.
  const reparented = await prisma.$transaction(async (tx) => {
    const children = await tx.page.findMany({ where: { parentId: req.params.id }, select: metaSelect });
    await tx.page.updateMany({
      where: { parentId: req.params.id },
      data: { parentId: access.page.parentId },
    });
    await tx.page.delete({ where: { id: req.params.id } });
    return children.map((c) => ({ ...c, parentId: access.page.parentId }));
  });

  emitScoped(access.page, 'page:deleted', { id: req.params.id });
  reparented.forEach((c) => emitScoped(c, 'page:updated', serializeMeta(c)));
  res.status(204).end();
});

module.exports = { router, serializePage };
