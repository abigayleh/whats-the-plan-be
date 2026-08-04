const express = require('express');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { serializeTask } = require('./lists');
const { expandOccurrences, isValidRule, withoutSkipped } = require('../lib/recurrence');

const router = express.Router();

const taskInclude = { attachments: true, assignee: true };

// Lists visible to the user: private ones they own + group lists in their groups.
// Itinerary-owned lists are excluded — their to-dos are siloed to the itinerary's own views.
const visibleListFilter = (userId, memberGroupIds) => ({
  itineraryId: null,
  OR: [{ groupId: null, ownerId: userId }, { groupId: { in: memberGroupIds } }],
});

const memberGroups = async (userId) =>
  (await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } })).map((m) => m.groupId);

// A task sits on the calendar at its scheduled time, or else its due date.
const anchorOf = (task) => task.scheduledStart || task.dueDate;

// Expands a task into calendar instances, reusing the event expander via its anchor.
function expandTask(task, windowStart, windowEnd) {
  const start = anchorOf(task);
  if (!start) return [];
  const shim = { startAt: start, endAt: task.scheduledEnd || start, recurrenceRule: task.recurrenceRule };
  const isRecurring = isValidRule(task.recurrenceRule);

  const base = serializeTask(task);
  const completed = new Set(base.completedDates);
  // Days removed from the series stop expanding entirely — the calendar must never draw a
  // day the list says is gone.
  return withoutSkipped(expandOccurrences(shim, windowStart, windowEnd), base.skippedDates)
    .map((occ) => ({
      ...base,
      // A recurring series never completes as a whole — each day's done state is per-occurrence.
      ...(isRecurring && { status: completed.has(occ.startAt.toISOString()) ? 'DONE' : 'TODO' }),
      groupId: task.list.groupId,
      isRecurring,
      instanceId: isRecurring ? `${task.id}@${occ.startAt.toISOString()}` : task.id,
      ...(task.scheduledStart
        ? { scheduledStart: occ.startAt, scheduledEnd: occ.endAt }
        : { dueDate: occ.startAt }),
    }));
}

router.get('/assigned-to-me', async (req, res) => {
  const groupIds = await memberGroups(req.userId);
  const tasks = await prisma.task.findMany({
    where: { assignedToId: req.userId, list: visibleListFilter(req.userId, groupIds) },
    include: taskInclude,
    orderBy: { dueDate: 'asc' },
  });
  res.json(tasks.map(serializeTask));
});

router.get('/calendar', async (req, res) => {
  const { start, end } = req.query;
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (!start || !end || isNaN(startDate.getTime()) || isNaN(endDate.getTime()))
    return res.status(400).json({ error: 'Valid start and end are required' });
  if (endDate < startDate) return res.status(400).json({ error: 'end must be after start' });

  const groupIds = await memberGroups(req.userId);
  const tasks = await prisma.task.findMany({
    where: {
      list: visibleListFilter(req.userId, groupIds),
      // Recurring tasks are fetched whatever their anchor — expansion decides if they land in-window.
      OR: [
        { dueDate: { gte: startDate, lte: endDate } },
        { scheduledStart: { gte: startDate, lte: endDate } },
        { recurrenceRule: { not: Prisma.DbNull } },
      ],
    },
    include: { ...taskInclude, list: { select: { groupId: true } } },
    orderBy: { dueDate: 'asc' },
  });
  res.json(tasks.flatMap((task) => expandTask(task, startDate, endDate)));
});

module.exports = router;
// Shared with the itineraries router, which expands its own scoped task query the same way.
module.exports.expandTask = expandTask;
