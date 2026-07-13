const prisma = require('./prisma');

// Returns the user's GroupMember row for a group, or null if not a member.
const getMembership = (userId, groupId) =>
  prisma.groupMember.findUnique({ where: { userId_groupId: { userId, groupId } } });

module.exports = { getMembership };
