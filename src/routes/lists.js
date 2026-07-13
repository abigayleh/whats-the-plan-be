const express = require('express');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { loadListAccess, loadEditableTask, isValidAssignee } = require('../lib/listAccess');
const { emitToGroup, emitToUser } = require('../socket');

const router = express.Router();

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];

const serializeList = (list) => ({
  id: list.id,
  name: list.name,
  ownerId: list.ownerId,
  groupId: list.groupId,
  isSystem: list.isSystem,
  createdAt: list.createdAt,
  taskCount: list._count?.tasks ?? 0,
});

const serializeTask = (task) => ({
  id: task.id,
  listId: task.listId,
  title: task.title,
  description: task.description,
  status: task.status,
  dueDate: task.dueDate,
  assignedToId: task.assignedToId,
  createdById: task.createdById,
  createdAt: task.createdAt,
});

// Routes a list/task event to the group room, or the owner's room if private.
const emitScoped = (list, type, payload) =>
  list.groupId ? emitToGroup(list.groupId, type, payload) : emitToUser(list.ownerId, type, payload);

// --- Lists ---

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

  const lists = await prisma.list.findMany({ where, include: { _count: { select: { tasks: true } } } });
  res.json(lists.map(serializeList));
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'List name required' });
  const groupId = req.body?.groupId || null;
  if (groupId && !(await getMembership(req.userId, groupId)))
    return res.status(403).json({ error: 'Not a member of this group' });

  const list = await prisma.list.create({ data: { name, ownerId: req.userId, groupId } });
  const payload = serializeList(list);
  emitScoped(list, 'list:created', payload);
  res.status(201).json(payload);
});

router.patch('/:id', async (req, res) => {
  const access = await loadListAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManageList) return res.status(403).json({ error: 'Not allowed to modify this list' });
  if ('groupId' in req.body && (req.body.groupId || null) !== access.list.groupId)
    return res.status(400).json({ error: 'List scope is immutable' });
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'List name required' });

  const list = await prisma.list.update({ where: { id: req.params.id }, data: { name } });
  const payload = serializeList(list);
  emitScoped(list, 'list:updated', payload);
  res.json(payload);
});

router.delete('/:id', async (req, res) => {
  const access = await loadListAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManageList) return res.status(403).json({ error: 'Not allowed to modify this list' });

  await prisma.list.delete({ where: { id: req.params.id } });
  emitScoped(access.list, 'list:deleted', { id: req.params.id });
  res.status(204).end();
});

// --- Tasks (nested under a list) ---

router.get('/:listId/tasks', async (req, res) => {
  const access = await loadListAccess(req.params.listId, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const tasks = await prisma.task.findMany({ where: { listId: req.params.listId }, orderBy: { createdAt: 'asc' } });
  res.json(tasks.map(serializeTask));
});

router.post('/:listId/tasks', async (req, res) => {
  const access = await loadListAccess(req.params.listId, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const { title, description, status, dueDate, assignedToId } = req.body || {};
  const name = String(title || '').trim();
  if (!name) return res.status(400).json({ error: 'Title required' });
  if (status !== undefined && !TASK_STATUSES.includes(status))
    return res.status(400).json({ error: 'Invalid status' });
  let due = null;
  if (dueDate != null) {
    due = new Date(dueDate);
    if (isNaN(due.getTime())) return res.status(400).json({ error: 'Invalid dueDate' });
  }
  if (!(await isValidAssignee(assignedToId ?? null, access.list)))
    return res.status(400).json({ error: 'Invalid assignee' });

  const task = await prisma.task.create({
    data: {
      listId: req.params.listId,
      title: name,
      description: description || null,
      status: status || 'TODO',
      dueDate: due,
      assignedToId: assignedToId || null,
      createdById: req.userId,
    },
  });
  const payload = serializeTask(task);
  emitScoped(access.list, 'task:created', payload);
  res.status(201).json(payload);
});

router.patch('/:listId/tasks/:id', async (req, res) => {
  const result = await loadEditableTask(req.params.id, req.params.listId, req.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const body = req.body || {};
  const data = {};
  if (body.title !== undefined) {
    const n = String(body.title).trim();
    if (!n) return res.status(400).json({ error: 'Title required' });
    data.title = n;
  }
  if (body.description !== undefined) data.description = body.description || null;
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) return res.status(400).json({ error: 'Invalid status' });
    data.status = body.status;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate == null) data.dueDate = null;
    else {
      const d = new Date(body.dueDate);
      if (isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid dueDate' });
      data.dueDate = d;
    }
  }
  if (body.assignedToId !== undefined) {
    const assignee = body.assignedToId || null;
    if (!(await isValidAssignee(assignee, result.list))) return res.status(400).json({ error: 'Invalid assignee' });
    data.assignedToId = assignee;
  }

  const task = await prisma.task.update({ where: { id: req.params.id }, data });
  const payload = serializeTask(task);
  emitScoped(result.list, 'task:updated', payload);
  res.json(payload);
});

router.delete('/:listId/tasks/:id', async (req, res) => {
  const result = await loadEditableTask(req.params.id, req.params.listId, req.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  await prisma.task.delete({ where: { id: req.params.id } });
  emitScoped(result.list, 'task:deleted', { id: req.params.id, listId: req.params.listId });
  res.status(204).end();
});

module.exports = { router, serializeTask };
