const express = require('express');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { loadListAccess, loadEditableTask, isValidAssignee } = require('../lib/listAccess');
const { serializeAttachment, publicUser } = require('../lib/serializers');
const { isValidRule } = require('../lib/recurrence');
const { isValidSubtasks } = require('../lib/subtasks');
const { emitToGroup, emitToUser } = require('../socket');

const router = express.Router();

const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'];
const DATE_FIELDS = ['dueDate', 'scheduledStart', 'scheduledEnd'];

const serializeList = (list) => ({
  id: list.id,
  name: list.name,
  ownerId: list.ownerId,
  groupId: list.groupId,
  isSystem: list.isSystem,
  isDefault: list.isDefault,
  icon: list.icon,
  color: list.color,
  showUnscheduledOnCalendar: list.showUnscheduledOnCalendar,
  createdAt: list.createdAt,
  taskCount: list._count?.tasks ?? 0,
});

// Color is a palette key (e.g. "coral"), same convention as GroupMember.color — not a hex string.
const isValidColor = (value) => value == null || typeof value === 'string';

const serializeTask = (task) => ({
  id: task.id,
  listId: task.listId,
  title: task.title,
  description: task.description,
  status: task.status,
  dueDate: task.dueDate,
  scheduledStart: task.scheduledStart,
  scheduledEnd: task.scheduledEnd,
  recurrenceRule: task.recurrenceRule,
  subtasks: task.subtasks || [],
  assignedToId: task.assignedToId,
  assignee: task.assignee ? publicUser(task.assignee) : null,
  createdById: task.createdById,
  createdAt: task.createdAt,
  attachments: (task.attachments || []).map(serializeAttachment),
});

const taskInclude = { attachments: true, assignee: true };

// Validates the fields present in body. `partial` skips required checks (PATCH).
function buildTaskData(body, { partial }) {
  const data = {};
  if (body.title !== undefined || !partial) {
    const title = String(body.title || '').trim();
    if (!title) return { error: 'Title required' };
    data.title = title;
  }
  if (body.description !== undefined) data.description = body.description || null;
  if (body.status !== undefined) {
    if (!TASK_STATUSES.includes(body.status)) return { error: 'Invalid status' };
    data.status = body.status;
  }
  for (const field of DATE_FIELDS) {
    if (body[field] === undefined) continue;
    if (body[field] == null) {
      data[field] = null;
      continue;
    }
    const date = new Date(body[field]);
    if (isNaN(date.getTime())) return { error: `Invalid ${field}` };
    data[field] = date;
  }
  if (body.recurrenceRule !== undefined) {
    if (body.recurrenceRule == null) data.recurrenceRule = null;
    else if (!isValidRule(body.recurrenceRule)) return { error: 'Invalid recurrenceRule' };
    else data.recurrenceRule = body.recurrenceRule;
  }
  if (body.subtasks !== undefined) {
    if (body.subtasks == null) data.subtasks = [];
    else if (!isValidSubtasks(body.subtasks)) return { error: 'Invalid subtasks' };
    else data.subtasks = body.subtasks;
  }
  return { data };
}

// A task is either date-only (dueDate) or timed (scheduledStart+End), never half-timed.
function validateSchedule(task) {
  if ((task.scheduledStart == null) !== (task.scheduledEnd == null))
    return 'scheduledStart and scheduledEnd must be set together';
  if (task.scheduledStart && task.scheduledEnd < task.scheduledStart)
    return 'scheduledEnd must be after scheduledStart';
  if (task.recurrenceRule && !task.dueDate && !task.scheduledStart)
    return 'A recurring task needs a dueDate or a scheduled time';
  return null;
}

// Routes a list/task event to the group room, or the owner's room if private.
const emitScoped = (list, type, payload) =>
  list.groupId ? emitToGroup(list.groupId, type, payload) : emitToUser(list.ownerId, type, payload);

// Only one list can be the default per space (a group, or an owner's private lists).
// Clears the flag on every other list in the same space so setting a new default is exclusive.
const clearOtherDefaults = (tx, list) =>
  tx.list.updateMany({
    where: {
      id: { not: list.id },
      isDefault: true,
      ...(list.groupId ? { groupId: list.groupId } : { groupId: null, ownerId: list.ownerId }),
    },
    data: { isDefault: false },
  });

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
  if (!isValidColor(req.body?.color)) return res.status(400).json({ error: 'Invalid color' });
  const showUnscheduledOnCalendar = req.body?.showUnscheduledOnCalendar;
  if (showUnscheduledOnCalendar !== undefined && typeof showUnscheduledOnCalendar !== 'boolean')
    return res.status(400).json({ error: 'Invalid showUnscheduledOnCalendar' });
  const isDefault = req.body?.isDefault === true;
  if (req.body?.isDefault !== undefined && typeof req.body.isDefault !== 'boolean')
    return res.status(400).json({ error: 'Invalid isDefault' });

  const data = {
    name,
    ownerId: req.userId,
    groupId,
    isDefault,
    icon: req.body?.icon || null,
    color: req.body?.color || null,
    ...(showUnscheduledOnCalendar !== undefined && { showUnscheduledOnCalendar }),
  };
  // A new default demotes the old one in the same space — do both writes atomically.
  const list = isDefault
    ? await prisma.$transaction(async (tx) => {
      const created = await tx.list.create({ data });
      await clearOtherDefaults(tx, created);
      return created;
    })
    : await prisma.list.create({ data });
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
  const data = { name };
  if (req.body.icon !== undefined) data.icon = req.body.icon || null;
  if (req.body.color !== undefined) {
    if (!isValidColor(req.body.color)) return res.status(400).json({ error: 'Invalid color' });
    data.color = req.body.color || null;
  }
  if (req.body.showUnscheduledOnCalendar !== undefined) {
    if (typeof req.body.showUnscheduledOnCalendar !== 'boolean')
      return res.status(400).json({ error: 'Invalid showUnscheduledOnCalendar' });
    data.showUnscheduledOnCalendar = req.body.showUnscheduledOnCalendar;
  }
  if (req.body.isDefault !== undefined) {
    if (typeof req.body.isDefault !== 'boolean')
      return res.status(400).json({ error: 'Invalid isDefault' });
    data.isDefault = req.body.isDefault;
  }

  // Promoting this list to default demotes the old one in the same space — one atomic write.
  const list = data.isDefault === true
    ? await prisma.$transaction(async (tx) => {
      const updated = await tx.list.update({ where: { id: req.params.id }, data });
      await clearOtherDefaults(tx, updated);
      return updated;
    })
    : await prisma.list.update({ where: { id: req.params.id }, data });
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
  const tasks = await prisma.task.findMany({
    where: { listId: req.params.listId },
    include: taskInclude,
    orderBy: { createdAt: 'asc' },
  });
  res.json(tasks.map(serializeTask));
});

router.post('/:listId/tasks', async (req, res) => {
  const access = await loadListAccess(req.params.listId, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const built = buildTaskData(req.body || {}, { partial: false });
  if (built.error) return res.status(400).json({ error: built.error });
  const { data } = built;

  const scheduleError = validateSchedule({
    dueDate: data.dueDate ?? null,
    scheduledStart: data.scheduledStart ?? null,
    scheduledEnd: data.scheduledEnd ?? null,
    recurrenceRule: data.recurrenceRule ?? null,
  });
  if (scheduleError) return res.status(400).json({ error: scheduleError });

  const assignedToId = req.body?.assignedToId || null;
  if (!(await isValidAssignee(assignedToId, access.list)))
    return res.status(400).json({ error: 'Invalid assignee' });

  const task = await prisma.task.create({
    data: { ...data, listId: req.params.listId, assignedToId, createdById: req.userId },
    include: taskInclude,
  });
  const payload = serializeTask(task);
  emitScoped(access.list, 'task:created', payload);
  res.status(201).json(payload);
});

router.patch('/:listId/tasks/:id', async (req, res) => {
  const result = await loadEditableTask(req.params.id, req.params.listId, req.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });

  const body = req.body || {};
  const built = buildTaskData(body, { partial: true });
  if (built.error) return res.status(400).json({ error: built.error });
  const { data } = built;

  const scheduleError = validateSchedule({ ...result.task, ...data });
  if (scheduleError) return res.status(400).json({ error: scheduleError });

  // Moving a task re-scopes it, so the target list drives the assignee check.
  let targetList = result.list;
  if (body.listId !== undefined && body.listId !== result.task.listId) {
    const target = await loadListAccess(body.listId, req.userId);
    if (target.error) return res.status(400).json({ error: 'Invalid target list' });
    targetList = target.list;
    data.listId = targetList.id;
  }

  if (body.assignedToId !== undefined) {
    const assignee = body.assignedToId || null;
    if (!(await isValidAssignee(assignee, targetList))) return res.status(400).json({ error: 'Invalid assignee' });
    data.assignedToId = assignee;
  } else if (targetList.id !== result.list.id && !(await isValidAssignee(result.task.assignedToId, targetList))) {
    data.assignedToId = null; // the old assignee isn't in the target scope — drop rather than reject
  }

  const task = await prisma.task.update({ where: { id: req.params.id }, data, include: taskInclude });
  const payload = serializeTask(task);

  // A cross-scope move leaves the old room and joins a new one, so mirror it as delete + create.
  if (targetList.groupId !== result.list.groupId || targetList.ownerId !== result.list.ownerId) {
    emitScoped(result.list, 'task:deleted', { id: task.id, listId: result.task.listId });
    emitScoped(targetList, 'task:created', payload);
  } else {
    emitScoped(targetList, 'task:updated', payload);
  }
  res.json(payload);
});

router.delete('/:listId/tasks/:id', async (req, res) => {
  const result = await loadEditableTask(req.params.id, req.params.listId, req.userId);
  if (result.error) return res.status(result.status).json({ error: result.error });
  await prisma.task.delete({ where: { id: req.params.id } });
  emitScoped(result.list, 'task:deleted', { id: req.params.id, listId: req.params.listId });
  res.status(204).end();
});

// Broadcasts a fresh task:updated (with current attachments) after an attachment change.
async function emitTaskUpdated(taskId) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { ...taskInclude, list: true },
  });
  if (task) emitScoped(task.list, 'task:updated', serializeTask(task));
}

module.exports = { router, serializeTask, emitTaskUpdated };
