const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { MIN_PASSWORD } = require('./auth');
const { publicUser } = require('../lib/serializers');
const { deleteFile } = require('../lib/storage');
const { emitToGroup, clearGroupRoom, removeUserFromGroupRoom } = require('../socket');
const { blockDemoAccount } = require('../lib/demoAccount');

const router = express.Router();

const MAX_NAME_LENGTH = 100;

router.patch('/me', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name || name.length > MAX_NAME_LENGTH)
    return res.status(400).json({ error: `Name must be 1-${MAX_NAME_LENGTH} characters`, code: 'INVALID_NAME' });

  const user = await prisma.user.update({ where: { id: req.userId }, data: { name } });
  res.json({ user: publicUser(user) });
});

router.post('/me/password', blockDemoAccount, async (req, res) => {
  const currentPassword = req.body?.currentPassword || '';
  const newPassword = req.body?.newPassword || '';

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const ok = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!ok) return res.status(400).json({ error: 'Current password is incorrect', code: 'INVALID_PASSWORD' });

  if (newPassword.length < MIN_PASSWORD)
    return res
      .status(400)
      .json({ error: `Password must be at least ${MIN_PASSWORD} characters`, code: 'WEAK_PASSWORD' });

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({ where: { id: req.userId }, data: { passwordHash } });
  // Simple session policy: existing refresh tokens stay valid, no rotation on password change.
  res.status(204).end();
});

router.delete('/me', blockDemoAccount, async (req, res) => {
  const userId = req.userId;

  const { soleAdminGroupIds, remainingGroupIds, orphanedFilePaths } = await prisma.$transaction(async (tx) => {
    const memberships = await tx.groupMember.findMany({ where: { userId } });

    // Groups where this user is the only admin get fully cascade-deleted (mirrors the
    // existing "sole admin leaving" flow: DELETE /api/groups/:id).
    const soleAdminGroupIds = [];
    for (const m of memberships) {
      if (m.role !== 'ADMIN') continue;
      const adminCount = await tx.groupMember.count({ where: { groupId: m.groupId, role: 'ADMIN' } });
      if (adminCount <= 1) soleAdminGroupIds.push(m.groupId);
    }
    const remainingGroupIds = memberships.map((m) => m.groupId).filter((id) => !soleAdminGroupIds.includes(id));

    for (const groupId of soleAdminGroupIds) {
      await tx.group.delete({ where: { id: groupId } }); // DB cascades members/lists/tasks/events/polls/conversations
    }
    // Other groups: just leave. Created content is orphaned, same as the existing leave endpoint.
    if (remainingGroupIds.length) {
      await tx.groupMember.deleteMany({ where: { userId, groupId: { in: remainingGroupIds } } });
    }

    // Private content has no other viewer once the account is gone — delete it outright.
    const personalLists = await tx.list.findMany({
      where: { groupId: null, ownerId: userId },
      include: { tasks: { include: { attachments: true } } },
    });
    const orphanedFilePaths = personalLists.flatMap((l) =>
      l.tasks.flatMap((t) => t.attachments.map((a) => a.storedPath))
    );
    await tx.list.deleteMany({ where: { groupId: null, ownerId: userId } }); // cascades tasks -> attachments
    await tx.event.deleteMany({ where: { groupId: null, createdById: userId } });
    await tx.itinerary.deleteMany({ where: { groupId: null, createdById: userId } });

    // Hard FK constraints on User that must be cleared before the row can be deleted.
    // (Task.assignedToId is onDelete: SetNull, so the DB handles that one automatically.)
    await tx.conversationParticipant.deleteMany({ where: { userId } });
    await tx.refreshToken.deleteMany({ where: { userId } });

    await tx.user.delete({ where: { id: userId } });

    return { soleAdminGroupIds, remainingGroupIds, orphanedFilePaths };
  });

  // Best-effort disk cleanup for the personal attachments just removed — not part of the DB transaction.
  await Promise.all(orphanedFilePaths.map((p) => deleteFile(p).catch(() => {})));

  for (const groupId of soleAdminGroupIds) {
    emitToGroup(groupId, 'group:deleted', { groupId });
    clearGroupRoom(groupId);
  }
  for (const groupId of remainingGroupIds) {
    emitToGroup(groupId, 'group:member-left', { groupId, userId });
    removeUserFromGroupRoom(userId, groupId);
  }

  res.status(204).end();
});

module.exports = router;
