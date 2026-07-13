const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { expandOccurrences, isValidRule } = require('../lib/recurrence');
const { emitToGroup, emitToUser } = require('../socket');

const router = express.Router();

const DAY_MS = 86400000;
const MAX_WINDOW_DAYS = 400;

const serialize = (event, occ) => {
  const startAt = occ ? occ.startAt : event.startAt;
  const endAt = occ ? occ.endAt : event.endAt;
  const isRecurring = !!event.recurrenceRule;
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    colorLabel: event.colorLabel,
    groupId: event.groupId,
    itineraryId: event.itineraryId,
    createdById: event.createdById,
    recurrenceRule: event.recurrenceRule,
    startAt,
    endAt,
    isRecurring,
    instanceId: isRecurring && occ ? `${event.id}@${new Date(startAt).toISOString()}` : event.id,
  };
};

// Routes an event mutation to the group room, or the creator's room if private.
const emitEvent = (event, type, payload) =>
  event.groupId ? emitToGroup(event.groupId, type, payload) : emitToUser(event.createdById, type, payload);

// Loads an event the user is allowed to edit/delete (creator or group admin).
async function loadEditableEvent(eventId, userId) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { status: 404, error: 'Event not found' };
  if (event.groupId === null)
    return event.createdById === userId ? { event } : { status: 404, error: 'Event not found' };
  const membership = await getMembership(userId, event.groupId);
  if (!membership) return { status: 404, error: 'Event not found' };
  if (event.createdById === userId || membership.role === 'ADMIN') return { event };
  return { status: 403, error: 'Not allowed to modify this event' };
}

// Validates that an itinerary is accessible and shares the event's scope.
async function validateItineraryLink(itineraryId, userId, eventGroupId) {
  const itin = await prisma.itinerary.findUnique({ where: { id: itineraryId } });
  if (!itin) return { status: 404, error: 'Itinerary not found' };
  if (itin.groupId === null) {
    if (itin.createdById !== userId) return { status: 404, error: 'Itinerary not found' };
  } else if (!(await getMembership(userId, itin.groupId))) {
    return { status: 404, error: 'Itinerary not found' };
  }
  if (itin.groupId !== (eventGroupId || null))
    return { status: 400, error: 'Itinerary scope must match the event' };
  return { ok: true };
}

// Validates + creates an event and emits event:created. Returns { event, payload } or { status, error }.
async function createEventForUser(userId, input) {
  const { title, description, startAt, endAt, colorLabel, groupId, recurrenceRule, itineraryId } = input;
  const name = String(title || '').trim();
  if (!name) return { status: 400, error: 'Title required' };
  const sDate = new Date(startAt);
  const eDate = new Date(endAt);
  if (isNaN(sDate.getTime()) || isNaN(eDate.getTime()))
    return { status: 400, error: 'Valid startAt and endAt required' };
  if (eDate < sDate) return { status: 400, error: 'endAt must be after startAt' };
  if (recurrenceRule != null && !isValidRule(recurrenceRule))
    return { status: 400, error: 'Invalid recurrenceRule' };

  const gId = groupId || null;
  if (gId && !(await getMembership(userId, gId)))
    return { status: 403, error: 'Not a member of this group' };
  if (itineraryId != null) {
    const check = await validateItineraryLink(itineraryId, userId, gId);
    if (!check.ok) return check;
  }

  const event = await prisma.event.create({
    data: {
      title: name,
      description: description || null,
      startAt: sDate,
      endAt: eDate,
      colorLabel: colorLabel || null,
      groupId: gId,
      createdById: userId,
      recurrenceRule: recurrenceRule ?? undefined,
      itineraryId: itineraryId || null,
    },
  });
  const payload = serialize(event);
  emitEvent(event, 'event:created', payload);
  return { event, payload };
}

router.get('/', async (req, res) => {
  const { start, end, groups } = req.query;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!start || !end || isNaN(startDate.getTime()) || isNaN(endDate.getTime()))
    return res.status(400).json({ error: 'Valid start and end are required' });
  if (endDate < startDate) return res.status(400).json({ error: 'end must be after start' });
  if (endDate - startDate > MAX_WINDOW_DAYS * DAY_MS)
    return res.status(400).json({ error: `Range must be at most ${MAX_WINDOW_DAYS} days` });

  const memberGroupIds = (
    await prisma.groupMember.findMany({ where: { userId: req.userId }, select: { groupId: true } })
  ).map((m) => m.groupId);

  let includePersonal, selectedGroupIds;
  if (groups !== undefined) {
    const tokens = String(groups).split(',').map((s) => s.trim()).filter(Boolean);
    includePersonal = tokens.includes('personal');
    selectedGroupIds = tokens.filter((t) => t !== 'personal' && memberGroupIds.includes(t));
  } else {
    includePersonal = true;
    selectedGroupIds = memberGroupIds;
  }

  const scopeOr = [];
  if (includePersonal) scopeOr.push({ groupId: null, createdById: req.userId });
  if (selectedGroupIds.length) scopeOr.push({ groupId: { in: selectedGroupIds } });
  if (!scopeOr.length) return res.json([]);

  const events = await prisma.event.findMany({
    where: { startAt: { lte: endDate }, OR: scopeOr },
  });

  const result = [];
  for (const ev of events)
    for (const occ of expandOccurrences(ev, startDate, endDate)) result.push(serialize(ev, occ));
  result.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  res.json(result);
});

router.post('/', async (req, res) => {
  const result = await createEventForUser(req.userId, req.body || {});
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(201).json(result.payload);
});

router.patch('/:id', async (req, res) => {
  const { event, status, error } = await loadEditableEvent(req.params.id, req.userId);
  if (error) return res.status(status).json({ error });

  const body = req.body || {};
  if ('groupId' in body && (body.groupId || null) !== event.groupId)
    return res.status(400).json({ error: 'Event scope is immutable' });

  const newStart = body.startAt !== undefined ? new Date(body.startAt) : event.startAt;
  const newEnd = body.endAt !== undefined ? new Date(body.endAt) : event.endAt;
  if (isNaN(new Date(newStart).getTime()) || isNaN(new Date(newEnd).getTime()))
    return res.status(400).json({ error: 'Valid startAt and endAt required' });
  if (new Date(newEnd) < new Date(newStart))
    return res.status(400).json({ error: 'endAt must be after startAt' });

  const data = {};
  if (body.title !== undefined) {
    const name = String(body.title).trim();
    if (!name) return res.status(400).json({ error: 'Title required' });
    data.title = name;
  }
  if (body.description !== undefined) data.description = body.description || null;
  if (body.colorLabel !== undefined) data.colorLabel = body.colorLabel || null;
  if (body.startAt !== undefined) data.startAt = newStart;
  if (body.endAt !== undefined) data.endAt = newEnd;
  if ('recurrenceRule' in body) {
    if (body.recurrenceRule == null) data.recurrenceRule = Prisma.DbNull;
    else if (isValidRule(body.recurrenceRule)) data.recurrenceRule = body.recurrenceRule;
    else return res.status(400).json({ error: 'Invalid recurrenceRule' });
  }
  if ('itineraryId' in body) {
    if (body.itineraryId == null) data.itineraryId = null;
    else {
      const check = await validateItineraryLink(body.itineraryId, req.userId, event.groupId);
      if (!check.ok) return res.status(check.status).json({ error: check.error });
      data.itineraryId = body.itineraryId;
    }
  }

  const updated = await prisma.event.update({ where: { id: event.id }, data });
  const payload = serialize(updated);
  emitEvent(updated, 'event:updated', payload);
  res.json(payload);
});

router.delete('/:id', async (req, res) => {
  const { event, status, error } = await loadEditableEvent(req.params.id, req.userId);
  if (error) return res.status(status).json({ error });
  await prisma.event.delete({ where: { id: event.id } });
  emitEvent(event, 'event:deleted', { id: event.id });
  res.status(204).end();
});

module.exports = { router, serializeEvent: serialize, createEventForUser };
