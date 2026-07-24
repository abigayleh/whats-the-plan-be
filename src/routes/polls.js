const express = require('express');
const prisma = require('../lib/prisma');
const { getMembership } = require('../lib/membership');
const { emitToGroup } = require('../socket');

const pollsRouter = express.Router();
const groupPollsRouter = express.Router({ mergeParams: true });

const MAX_OPTIONS = 20;
const pollInclude = { options: true, votes: true };

// Builds results; myVote is per-user, so pass null for broadcasts.
const serializePoll = (poll, userId) => {
  const votes = poll.votes || [];
  const counts = {};
  for (const v of votes) counts[v.pollOptionId] = (counts[v.pollOptionId] || 0) + 1;
  return {
    id: poll.id,
    question: poll.question,
    groupId: poll.groupId,
    createdById: poll.createdById,
    expiresAt: poll.expiresAt,
    createdAt: poll.createdAt,
    options: poll.options.map((o) => ({ id: o.id, text: o.text, voteCount: counts[o.id] || 0 })),
    totalVotes: votes.length,
    myVote: votes.find((v) => v.userId === userId)?.pollOptionId ?? null,
    closed: !!poll.expiresAt && new Date(poll.expiresAt) <= new Date(),
  };
};

// Validates a poll body → { question, options, expiresAt } or { error }. Shared by the
// group-nested and itinerary-nested create routes.
function parsePollInput(body) {
  const question = String(body?.question || '').trim();
  if (!question) return { error: 'Question required' };
  const options = (Array.isArray(body?.options) ? body.options : [])
    .map((o) => String(o || '').trim())
    .filter(Boolean);
  if (options.length < 2) return { error: 'At least 2 options required' };
  if (options.length > MAX_OPTIONS) return { error: `At most ${MAX_OPTIONS} options` };
  let expiresAt = null;
  if (body?.expiresAt) {
    expiresAt = new Date(body.expiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt <= new Date())
      return { error: 'expiresAt must be a valid future date' };
  }
  return { question, options, expiresAt };
}

// Loads a poll the user can access (member of its group), or { status, error }.
async function loadPollAccess(pollId, userId) {
  const poll = await prisma.poll.findUnique({ where: { id: pollId }, include: pollInclude });
  if (!poll) return { status: 404, error: 'Poll not found' };
  const membership = await getMembership(userId, poll.groupId);
  if (!membership) return { status: 404, error: 'Poll not found' };
  return { poll, membership };
}

// --- Group-nested: list + create ---

groupPollsRouter.get('/', async (req, res) => {
  if (!(await getMembership(req.userId, req.params.groupId)))
    return res.status(404).json({ error: 'Group not found' });
  const polls = await prisma.poll.findMany({
    where: { groupId: req.params.groupId },
    include: pollInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json(polls.map((p) => serializePoll(p, req.userId)));
});

groupPollsRouter.post('/', async (req, res) => {
  const groupId = req.params.groupId;
  if (!(await getMembership(req.userId, groupId)))
    return res.status(404).json({ error: 'Group not found' });

  const parsed = parsePollInput(req.body);
  if (parsed.error) return res.status(400).json({ error: parsed.error });

  const poll = await prisma.poll.create({
    data: {
      question: parsed.question,
      groupId,
      createdById: req.userId,
      expiresAt: parsed.expiresAt,
      options: { create: parsed.options.map((text) => ({ text })) },
    },
    include: pollInclude,
  });
  emitToGroup(groupId, 'poll:created', serializePoll(poll, null));
  res.status(201).json(serializePoll(poll, req.userId));
});

// --- By id: get, delete, vote ---

pollsRouter.get('/:id', async (req, res) => {
  const access = await loadPollAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  res.json(serializePoll(access.poll, req.userId));
});

pollsRouter.delete('/:id', async (req, res) => {
  const access = await loadPollAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  if (access.poll.createdById !== req.userId && access.membership.role !== 'ADMIN')
    return res.status(403).json({ error: 'Not allowed to delete this poll' });
  await prisma.poll.delete({ where: { id: req.params.id } });
  emitToGroup(access.poll.groupId, 'poll:deleted', { id: req.params.id });
  res.status(204).end();
});

pollsRouter.post('/:id/vote', async (req, res) => {
  const access = await loadPollAccess(req.params.id, req.userId);
  if (access.error) return res.status(access.status).json({ error: access.error });
  const poll = access.poll;
  if (poll.expiresAt && new Date(poll.expiresAt) <= new Date())
    return res.status(400).json({ error: 'Poll closed' });
  const optionId = req.body?.optionId;
  if (!poll.options.some((o) => o.id === optionId))
    return res.status(400).json({ error: 'Invalid optionId' });

  await prisma.pollVote.upsert({
    where: { pollId_userId: { pollId: poll.id, userId: req.userId } },
    update: { pollOptionId: optionId },
    create: { pollId: poll.id, pollOptionId: optionId, userId: req.userId },
  });

  const updated = await prisma.poll.findUnique({ where: { id: poll.id }, include: pollInclude });
  emitToGroup(poll.groupId, 'poll:vote', serializePoll(updated, null));
  res.json(serializePoll(updated, req.userId));
});

module.exports = {
  pollsRouter, groupPollsRouter, serializePoll, parsePollInput,
};
