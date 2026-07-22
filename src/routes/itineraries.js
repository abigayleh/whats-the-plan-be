const express = require('express');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { emitToGroup, emitToUser } = require('../socket');
const { serializeEvent, createEventForUser } = require('./events');

const router = express.Router();

const serializeItinerary = (it) => ({
  id: it.id,
  title: it.title,
  destination: it.destination,
  description: it.description,
  startDate: it.startDate,
  endDate: it.endDate,
  colorLabel: it.colorLabel,
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

router.get('/', async (req, res) => {
  const { groupId } = req.query;
  const memberGroupIds = (
    await prisma.groupMember.findMany({ where: { userId: req.userId }, select: { groupId: true } })
  ).map((m) => m.groupId);

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
    orderBy: { startDate: 'asc' },
  });
  res.json(itineraries.map(serializeItinerary));
});

router.post('/', async (req, res) => {
  const { title, destination, description, startDate, endDate, colorLabel, groupId } = req.body || {};
  const name = String(title || '').trim();
  if (!name) return res.status(400).json({ error: 'Title required' });
  const sDate = new Date(startDate);
  const eDate = new Date(endDate);
  if (isNaN(sDate.getTime()) || isNaN(eDate.getTime()))
    return res.status(400).json({ error: 'Valid startDate and endDate required' });
  if (eDate < sDate) return res.status(400).json({ error: 'endDate must be after startDate' });
  const gId = groupId || null;
  if (gId && !(await getMembership(req.userId, gId)))
    return res.status(403).json({ error: 'Not a member of this group' });

  // Create the itinerary and its one to-do list together so the pair can never half-exist.
  const itinerary = await prisma.$transaction(async (tx) => {
    const created = await tx.itinerary.create({
      data: {
        title: name,
        destination: destination || null,
        description: description || null,
        startDate: sDate,
        endDate: eDate,
        colorLabel: colorLabel || null,
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

router.patch('/:id', async (req, res) => {
  const access = await loadItineraryAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (!access.canManage) return res.status(403).json({ error: 'Not allowed to modify this itinerary' });
  const body = req.body || {};
  if ('groupId' in body && (body.groupId || null) !== access.itinerary.groupId)
    return res.status(400).json({ error: 'Itinerary scope is immutable' });

  const newStart = body.startDate !== undefined ? new Date(body.startDate) : access.itinerary.startDate;
  const newEnd = body.endDate !== undefined ? new Date(body.endDate) : access.itinerary.endDate;
  if (isNaN(new Date(newStart).getTime()) || isNaN(new Date(newEnd).getTime()))
    return res.status(400).json({ error: 'Valid startDate and endDate required' });
  if (new Date(newEnd) < new Date(newStart))
    return res.status(400).json({ error: 'endDate must be after startDate' });

  const data = {};
  if (body.title !== undefined) {
    const n = String(body.title).trim();
    if (!n) return res.status(400).json({ error: 'Title required' });
    data.title = n;
  }
  if (body.destination !== undefined) data.destination = body.destination || null;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.colorLabel !== undefined) data.colorLabel = body.colorLabel || null;
  if (body.startDate !== undefined) data.startDate = newStart;
  if (body.endDate !== undefined) data.endDate = newEnd;
  if (body.completedAt !== undefined) {
    if (body.completedAt === null) data.completedAt = null;
    else {
      const completed = new Date(body.completedAt);
      if (isNaN(completed.getTime())) return res.status(400).json({ error: 'Invalid completedAt' });
      data.completedAt = completed;
    }
  }

  const itinerary = await prisma.itinerary.update({
    where: { id: req.params.id },
    data,
    include: withList,
  });
  const payload = serializeItinerary(itinerary);
  emitItinerary(itinerary, 'itinerary:updated', payload);
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
  res.json(serializeItinerary(access.itinerary));
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
