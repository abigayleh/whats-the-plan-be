const express = require('express');
const prisma = require('../lib/prisma');
const { serializeTask } = require('./lists');

const router = express.Router();

// Lists visible to the user: private ones they own + group lists in their groups.
const visibleListFilter = (userId, memberGroupIds) => ({
  OR: [{ groupId: null, ownerId: userId }, { groupId: { in: memberGroupIds } }],
});

const memberGroups = async (userId) =>
  (await prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } })).map((m) => m.groupId);

router.get('/assigned-to-me', async (req, res) => {
  const groupIds = await memberGroups(req.userId);
  const tasks = await prisma.task.findMany({
    where: { assignedToId: req.userId, list: visibleListFilter(req.userId, groupIds) },
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
    where: { dueDate: { gte: startDate, lte: endDate }, list: visibleListFilter(req.userId, groupIds) },
    orderBy: { dueDate: 'asc' },
  });
  res.json(tasks.map(serializeTask));
});

module.exports = router;
