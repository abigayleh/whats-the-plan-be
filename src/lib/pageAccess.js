const prisma = require('./prisma');
const { getMembership } = require('./membership');

// Loads a page the user can view (owner for private, member for group).
// Edit/delete/move all require canManage (owner or group admin), same as lists.
// Returns { page, membership, canManage } or { status, error }.
async function loadPageAccess(pageId, userId) {
  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) return { status: 404, error: 'Page not found' };
  if (page.groupId === null)
    return page.ownerId === userId
      ? { page, canManage: true }
      : { status: 404, error: 'Page not found' };
  const membership = await getMembership(userId, page.groupId);
  if (!membership) return { status: 404, error: 'Page not found' };
  const canManage = page.ownerId === userId || membership.role === 'ADMIN';
  return { page, membership, canManage };
}

// Validates a parent for a page in the given scope: it must exist, be viewable,
// and share the same groupId (nesting stays within one scope).
async function resolveParent(parentId, userId, groupId) {
  if (parentId == null) return { ok: true };
  const access = await loadPageAccess(parentId, userId);
  if (access.error) return { error: 'Invalid parent page' };
  if ((access.page.groupId || null) !== (groupId || null))
    return { error: 'Parent page must be in the same scope' };
  return { ok: true, parent: access.page };
}

module.exports = { loadPageAccess, resolveParent };
