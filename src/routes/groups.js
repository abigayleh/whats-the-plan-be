const express = require('express');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { publicUser } = require('../lib/serializers');
const { requireMember, requireAdmin } = require('../middleware/groupAuth');
const {
  emitToGroup,
  addUserToGroupRoom,
  removeUserFromGroupRoom,
  clearGroupRoom,
} = require('../socket');

const router = express.Router();

const memberKey = (userId, groupId) => ({ userId_groupId: { userId, groupId } });
const countAdmins = (groupId) =>
  prisma.groupMember.count({ where: { groupId, role: 'ADMIN' } });

// Creates an invite code, retrying on the rare code collision.
async function createInvite(groupId, expiresAt) {
  for (let i = 0; i < 5; i++) {
    try {
      const code = crypto.randomBytes(6).toString('base64url');
      return await prisma.inviteCode.create({ data: { code, groupId, expiresAt } });
    } catch (err) {
      if (err.code === 'P2002') continue;
      throw err;
    }
  }
  throw new Error('Failed to generate unique invite code');
}

// --- Collection ---

router.get('/', async (req, res) => {
  const memberships = await prisma.groupMember.findMany({
    where: { userId: req.userId },
    include: { group: { include: { _count: { select: { members: true } } } } },
  });
  res.json(
    memberships.map((m) => ({
      id: m.group.id,
      name: m.group.name,
      createdAt: m.group.createdAt,
      role: m.role,
      color: m.color,
      memberCount: m.group._count.members,
    }))
  );
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name required' });
  const color = req.body?.color || null;
  const group = await prisma.group.create({
    data: { name, members: { create: { userId: req.userId, role: 'ADMIN', color } } },
  });
  res.status(201).json({ id: group.id, name: group.name, createdAt: group.createdAt, role: 'ADMIN', color });
});

// Join must be declared before "/:id" routes so the code isn't read as an id.
router.post('/join/:code', async (req, res) => {
  const invite = await prisma.inviteCode.findUnique({ where: { code: req.params.code } });
  const valid = invite && !invite.revoked && (!invite.expiresAt || invite.expiresAt > new Date());
  if (!valid) return res.status(404).json({ error: 'Invalid or expired invite' });

  const existing = await prisma.groupMember.findUnique({ where: memberKey(req.userId, invite.groupId) });
  if (existing) return res.status(409).json({ error: 'Already a member', code: 'ALREADY_MEMBER' });

  await prisma.groupMember.create({ data: { userId: req.userId, groupId: invite.groupId, role: 'MEMBER' } });
  const [group, user] = await Promise.all([
    prisma.group.findUnique({ where: { id: invite.groupId } }),
    prisma.user.findUnique({ where: { id: req.userId } }),
  ]);
  addUserToGroupRoom(req.userId, invite.groupId);
  emitToGroup(invite.groupId, 'group:member-joined', {
    groupId: invite.groupId,
    member: { ...publicUser(user), role: 'MEMBER' },
  });
  res.status(201).json({ id: group.id, name: group.name, createdAt: group.createdAt, role: 'MEMBER' });
});

// --- Single group ---

router.get('/:id', requireMember, async (req, res) => {
  const group = await prisma.group.findUnique({
    where: { id: req.params.id },
    include: { members: { include: { user: true } } },
  });
  const body = {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    role: req.membership.role,
    members: group.members.map((m) => ({
      ...publicUser(m.user),
      role: m.role,
      color: m.color,
      joinedAt: m.joinedAt,
    })),
  };
  if (req.membership.role === 'ADMIN') {
    body.inviteCodes = await prisma.inviteCode.findMany({
      where: { groupId: group.id, revoked: false },
      select: { code: true, expiresAt: true, createdAt: true },
    });
  }
  res.json(body);
});

router.patch('/:id', requireAdmin, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Group name required' });
  const group = await prisma.group.update({ where: { id: req.params.id }, data: { name } });
  res.json({ id: group.id, name: group.name, createdAt: group.createdAt });
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await prisma.group.delete({ where: { id: req.params.id } });
  emitToGroup(req.params.id, 'group:deleted', { groupId: req.params.id });
  clearGroupRoom(req.params.id);
  res.status(204).end();
});

// --- Invites ---

router.post('/:id/invite', requireAdmin, async (req, res) => {
  let expiresAt = null;
  if (req.body?.expiresAt) {
    expiresAt = new Date(req.body.expiresAt);
    if (isNaN(expiresAt.getTime()) || expiresAt <= new Date())
      return res.status(400).json({ error: 'expiresAt must be a valid future date' });
  }
  const invite = await createInvite(req.params.id, expiresAt);
  res.status(201).json({ code: invite.code, expiresAt: invite.expiresAt, createdAt: invite.createdAt });
});

router.delete('/:id/invite/:code', requireAdmin, async (req, res) => {
  await prisma.inviteCode.updateMany({
    where: { code: req.params.code, groupId: req.params.id },
    data: { revoked: true },
  });
  res.status(204).end();
});

// Sets the requester's own color for a group (per-member, used for calendar layering).
router.patch('/:id/color', requireMember, async (req, res) => {
  const color = req.body?.color || null;
  await prisma.groupMember.update({ where: memberKey(req.userId, req.params.id), data: { color } });
  res.json({ groupId: req.params.id, color });
});

// --- Members ---

router.delete('/:id/members/:userId', requireAdmin, async (req, res) => {
  if (req.params.userId === req.userId)
    return res.status(400).json({ error: 'Use the leave endpoint to remove yourself' });
  const target = await prisma.groupMember.findUnique({ where: memberKey(req.params.userId, req.params.id) });
  if (!target) return res.status(404).json({ error: 'Member not found' });
  await prisma.groupMember.delete({ where: memberKey(req.params.userId, req.params.id) });
  emitToGroup(req.params.id, 'group:member-left', { groupId: req.params.id, userId: req.params.userId });
  removeUserFromGroupRoom(req.params.userId, req.params.id);
  res.status(204).end();
});

router.patch('/:id/members/:userId', requireAdmin, async (req, res) => {
  const role = req.body?.role;
  if (role !== 'ADMIN' && role !== 'MEMBER')
    return res.status(400).json({ error: 'role must be ADMIN or MEMBER' });
  const target = await prisma.groupMember.findUnique({ where: memberKey(req.params.userId, req.params.id) });
  if (!target) return res.status(404).json({ error: 'Member not found' });

  if (target.role === 'ADMIN' && role === 'MEMBER' && (await countAdmins(req.params.id)) <= 1)
    return res.status(403).json({ error: 'Cannot demote the last admin', code: 'LAST_ADMIN' });

  const updated = await prisma.groupMember.update({
    where: memberKey(req.params.userId, req.params.id),
    data: { role },
  });
  res.json({ userId: updated.userId, role: updated.role });
});

router.post('/:id/leave', requireMember, async (req, res) => {
  if (req.membership.role === 'ADMIN' && (await countAdmins(req.params.id)) <= 1)
    return res.status(403).json({ error: 'You are the last admin', code: 'LAST_ADMIN' });
  await prisma.groupMember.delete({ where: memberKey(req.userId, req.params.id) });
  emitToGroup(req.params.id, 'group:member-left', { groupId: req.params.id, userId: req.userId });
  removeUserFromGroupRoom(req.userId, req.params.id);
  res.status(204).end();
});

module.exports = router;
