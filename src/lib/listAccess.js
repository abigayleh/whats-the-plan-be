const prisma = require('./prisma');
const { getMembership } = require('./membership');

// Loads a list the user can view (owner for private, member for group).
// Returns { list, membership, canManageList } or { status, error }.
async function loadListAccess(listId, userId) {
  const list = await prisma.list.findUnique({ where: { id: listId } });
  if (!list) return { status: 404, error: 'List not found' };
  if (list.groupId === null)
    return list.ownerId === userId
      ? { list, canManageList: true }
      : { status: 404, error: 'List not found' };
  const membership = await getMembership(userId, list.groupId);
  if (!membership) return { status: 404, error: 'List not found' };
  const canManageList = list.ownerId === userId || membership.role === 'ADMIN';
  return { list, membership, canManageList };
}

// Loads a task the user can edit/delete (creator or group admin).
// listId is optional; when given, the task must belong to it.
async function loadEditableTask(taskId, listId, userId) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task || (listId != null && task.listId !== listId)) return { status: 404, error: 'Task not found' };
  const access = await loadListAccess(task.listId, userId);
  if (access.error) return { status: 404, error: 'Task not found' };
  const isAdmin = access.membership?.role === 'ADMIN';
  if (task.createdById === userId || isAdmin) return { task, list: access.list };
  return { status: 403, error: 'Not allowed to modify this task' };
}

// An assignee must be a group member (group list) or the owner (private list).
async function isValidAssignee(assignedToId, list) {
  if (assignedToId == null) return true;
  if (list.groupId === null) return assignedToId === list.ownerId;
  return !!(await getMembership(assignedToId, list.groupId));
}

module.exports = { loadListAccess, loadEditableTask, isValidAssignee };
