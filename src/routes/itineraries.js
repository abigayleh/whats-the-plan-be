const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { parseSchedule, resolvePatchedSchedule } = require('../lib/itinerarySchedule');
const { moveScopedChildren } = require('../lib/itineraryScope');
const { emitToGroup, emitToUser } = require('../socket');
const { serializeEvent, createEventForUser } = require('./events');
const { expandTask } = require('./tasks');
const { serializePoll, parsePollInput } = require('./polls');

const router = express.Router();

const serializeItinerary = (it) => ({
  id: it.id,
  title: it.title,
  destination: it.destination,
  description: it.description,
  startDate: it.startDate,
  endDate: it.endDate,
  dayCount: it.dayCount ?? null,
  sortOrder: it.sortOrder ?? 0,
  colorLabel: it.colorLabel,
  icon: it.icon ?? null,
  completedAt: it.completedAt ?? null,
  groupId: it.groupId,
  createdById: it.createdById,
  listId: it.lists?.[0]?.id ?? null,
  createdAt: it.createdAt,
});

// The itinerary's to-dos live in one auto-created list; include just its id for serialization.
const withList = { lists: { select: { id: true }, take: 1 } };

const emitItinerary = (it, type, payload) =>
  it.groupId ? emitToGroup(it.groupId, type, payload) : emitToUser(it.createdById, type, payload);

// Loads an itinerary the user can view (owner for private, member for group).
async function loadItineraryAccess(id, userId) {
  const itinerary = await prisma.itinerary.findUnique({ where: { id }, include: withList });
  if (!itinerary) return { status: 404, error: 'Itinerary not found' };
  if (itinerary.groupId === null)
    return itinerary.createdById === userId
      ? { itinerary, canManage: true }
      : { status: 404, error: 'Itinerary not found' };
  const membership = await getMembership(userId, itinerary.groupId);
  if (!membership) return { status: 404, error: 'Itinerary not found' };
  const canManage = itinerary.createdById === userId || membership.role === 'ADMIN';
  return { itinerary, membership, canManage };
}

// Validates a requested scope change. Returns { groupId } when one is wanted
// (undefined when not), or { status, error }. The caller has already proved it can manage.
async function parseScopeMove(body, itinerary, userId) {
  if (!('groupId' in body)) return {};
  const groupId = body.groupId || null;
  if (groupId === itinerary.groupId) return {};
  if (groupId && !(await getMembership(userId, groupId)))
    return { status: 403, error: 'Not a member of this group' };
  // Going personal hands the itinerary to its creator alone, so only they may do it.
  if (!groupId && itinerary.createdById !== userId)
    return { status: 403, error: 'Only the creator can make this itinerary personal' };
  if (!groupId && (await prisma.poll.count({ where: { itineraryId: itinerary.id } })) > 0)
    return {
      status: 409,
      error: 'Delete the itinerary polls before making it personal',
      code: 'ITINERARY_HAS_POLLS',
    };
  return { groupId };
}

const memberGroupIdsFor = async (userId) =>
  (await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } })).map((m) => m.groupId);

// Manual order first; createdAt breaks ties so the sequence is stable.
const itineraryOrder = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

router.get('/', async (req, res) => {
  const { groupId } = req.query;
  const memberGroupIds = await memberGroupIdsFor(req.userId);

  let where;
  if (groupId === 'personal') {
    where = { groupId: null, createdById: req.userId };
  } else if (groupId !== undefined) {
    if (!memberGroupIds.includes(groupId)) return res.status(403).json({ error: 'Not a member of this group' });
    where = { groupId };
  } else {
    where = { OR: [{ groupId: null, createdById: req.userId }, { groupId: { in: memberGroupIds } }] };
  }

  const itineraries = await prisma.itinerary.findMany({
    where,
    include: withList,
    orderBy: itineraryOrder,
  });
  res.json(itineraries.map(serializeItinerary));
});

router.post('/', async (req, res) => {
  const { title, destination, description, colorLabel, icon, groupId } = req.body || {};
  const name = String(title || '').trim();
  if (!name) return res.status(400).json({ error: 'Title required' });
  const schedule = parseSchedule(req.body || {});
  if (schedule.error) return res.status(400).json({ error: schedule.error });
  const gId = groupId || null;
  if (gId && !(await getMembership(req.userId, gId)))
    return res.status(403).json({ error: 'Not a member of this group' });

  const scopeWhere = gId ? { groupId: gId } : { groupId: null, createdById: req.userId };

  // Create the itinerary and its one to-do list together so the pair can never half-exist.
  const itinerary = await prisma.$transaction(async (tx) => {
    // New itineraries land at the end of their scope's manual order.
    const last = await tx.itinerary.aggregate({ where: scopeWhere, _max: { sortOrder: true } });
    const created = await tx.itinerary.create({
      data: {
        title: name,
        destination: destination || null,
        description: description || null,
        ...schedule,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        colorLabel: colorLabel || null,
        icon: icon || null,
        groupId: gId,
        createdById: req.userId,
      },
    });
    await tx.list.create({
      data: { name, ownerId: req.userId, groupId: gId, itineraryId: created.id },
    });
    return tx.itinerary.findUnique({ where: { id: created.id }, include: withList });
  });
  const payload = serializeItinerary(itinerary);
  emitItinerary(itinerary, 'itinerary:created', payload);
  res.status(201).json(payload);
});

const MAX_REORDER = 500;

// Declared before /:id so "order" is never read as an itinerary id.
router.patch('/order', async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every((id) => typeof id === 'string' && id))
    return res.status(400).json({ error: 'ids must be a non-empty array of itinerary ids' });
  if (ids.length > MAX_REORDER) return res.status(400).json({ error: `At most ${MAX_REORDER} ids` });
  if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'ids must be unique' });

  const memberGroupIds = await memberGroupIdsFor(req.userId);
  const visible = await prisma.itinerary.findMany({
    where: {
      id: { in: ids },
      OR: [{ groupId: null, createdById: req.userId }, { groupId: { in: memberGroupIds } }],
    },
    select: { id: true },
  });
  if (visible.length !== ids.length)
    return res.status(404).json({ error: 'One or more itineraries were not found' });

  await prisma.$transaction(
    ids.map((id, index) => prisma.itinerary.update({ where: { id }, data: { sortOrder: index } })),
  );
  res.json({ ids });
});

router.patch('/:id', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManage) return res.status(403).json({ error: 'Not allowed to modify this itinerary' });
  const body = req.body || {};

  const schedule = resolvePatchedSchedule(body, access.itinerary);
  if (schedule?.error) return res.status(400).json({ error: schedule.error });

  const move = await parseScopeMove(body, access.itinerary, req.userId);
  if (move.error) return res.status(move.status).json({ error: move.error, code: move.code });

  const data = { ...schedule };
  if (body.title !== undefined) {
    const n = String(body.title).trim();
    if (!n) return res.status(400).json({ error: 'Title required' });
    data.title = n;
  }
  if (body.destination !== undefined) data.destination = body.destination || null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.colorLabel !== undefined) data.colorLabel = body.colorLabel || null;
  if (body.icon !== undefined) data.icon = body.icon || null;
  if (body.content !== undefined) data.content = body.content ?? null;
  if (body.completedAt !== undefined) {
    if (body.completedAt === null) data.completedAt = null;
    else {
      const completed = new Date(body.completedAt);
      if (isNaN(completed.getTime())) return res.status(400).json({ error: 'Invalid completedAt' });
      data.completedAt = completed;
    }
  }

  if (move.groupId !== undefined) data.groupId = move.groupId;

  // One transaction so the itinerary and its scoped children never disagree.
  const itinerary = await prisma.$transaction(async (tx) => {
    await tx.itinerary.update({ where: { id: req.params.id }, data });
    if (move.groupId !== undefined) await moveScopedChildren(tx, req.params.id, move.groupId);
    return tx.itinerary.findUnique({ where: { id: req.params.id }, include: withList });
  });

  const payload = serializeItinerary(itinerary);
  emitItinerary(itinerary, 'itinerary:updated', payload);
  // The old scope needs the same update or it keeps showing an itinerary that left.
  if (move.groupId !== undefined) emitItinerary(access.itinerary, 'itinerary:updated', payload);
  res.json(payload);
});

router.delete('/:id', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManage) return res.status(403).json({ error: 'Not allowed to modify this itinerary' });
  await prisma.itinerary.delete({ where: { id: req.params.id } });
  emitItinerary(access.itinerary, 'itinerary:deleted', { id: req.params.id });
  res.status(204).end();
});

router.get('/:id', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  // The single-itinerary fetch carries the notes doc; the list omits it to stay light.
  res.json({ ...serializeItinerary(access.itinerary), content: access.itinerary.content ?? null });
});

// --- Polls (scoped to the itinerary's group; only for group itineraries) ---

async function loadItineraryForPolls(itineraryId, userId) {
  const itinerary = await prisma.itinerary.findUnique({ where: { id: itineraryId } });
  if (!itinerary) return { status: 404, error: 'Itinerary not found' };
  if (!itinerary.groupId) return { status: 400, error: 'Personal itineraries have no polls' };
  if (!(await getMembership(userId, itinerary.groupId))) return { status: 404, error: 'Itinerary not found' };
  return { itinerary };
}

router.get('/:id/polls', async (req, res) => {
  const access = await loadItineraryForPolls(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const polls = await prisma.poll.findMany({
    where: { itineraryId: req.params.id },
    include: { options: true, votes: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(polls.map((p) => serializePoll(p, req.userId)));
});

router.post('/:id/polls', async (req, res) => {
  const access = await loadItineraryForPolls(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const parsed = parsePollInput(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const poll = await prisma.poll.create({
    data: {
      question: parsed.question,
      groupId: access.itinerary.groupId,
      itineraryId: req.params.id,
      createdById: req.userId,
      expiresAt: parsed.expiresAt,
      options: { create: parsed.options.map((text) => ({ text })) },
    },
    include: { options: true, votes: true },
  });
  emitToGroup(access.itinerary.groupId, 'poll:created', serializePoll(poll, null));
  res.status(201).json(serializePoll(poll, req.userId));
});

router.get('/:id/events', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const events = await prisma.event.findMany({
    where: { itineraryId: req.params.id },
    orderBy: { startAt: 'asc' },
  });
  res.json(events.map((e) => serializeEvent(e)));
});

// Expanded to-do occurrences for the itinerary's own week/day views. Mirrors
// /api/tasks/calendar but scoped to this itinerary's list (which the silo filter hides there).
router.get('/:id/tasks', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const { start, end } = req.query;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!start || !end || isNaN(startDate.getTime()) || isNaN(endDate.getTime()))
    return res.status(400).json({ error: 'Valid start and end are required' });
  if (endDate < startDate) return res.status(400).json({ error: 'end must be after start' });

  const listId = access.itinerary.lists?.[0]?.id;
  if (!listId) return res.json([]);

  const tasks = await prisma.task.findMany({
    where: {
      listId,
      OR: [
        { dueDate: { gte: startDate, lte: endDate } },
        { scheduledStart: { gte: startDate, lte: endDate } },
        { recurrenceRule: { not: Prisma.DbNull } },
      ],
    },
    include: { attachments: true, assignee: true, list: { select: { groupId: true, itineraryId: true } } },
    orderBy: { dueDate: 'asc' },
  });
  res.json(tasks.flatMap((task) => expandTask(task, startDate, endDate)));
});

router.post('/:id/events', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  // Child events inherit the itinerary's scope.
  const input = { ...req.body, groupId: access.itinerary.groupId, itineraryId: req.params.id };
  const result = await createEventForUser(req.userId, input);
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result.payload);
});

module.exports = router;
