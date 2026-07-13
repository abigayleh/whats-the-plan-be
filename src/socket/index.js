const { verifyAccessToken } = require('../lib/tokens');
const prisma = require('../lib/prisma');

let io = null;

const userRoom = (userId) => `user:${userId}`;
const groupRoom = (groupId) => `group:${groupId}`;
const conversationRoom = (id) => `conversation:${id}`;

function initSocket(server) {
  io = server;

  // Reject unauthenticated sockets before they join any room.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      socket.userId = verifyAccessToken(token).sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    socket.join(userRoom(socket.userId));
    const memberships = await prisma.groupMember.findMany({
      where: { userId: socket.userId },
      select: { groupId: true },
    });
    memberships.forEach((m) => socket.join(groupRoom(m.groupId)));
  });
}

const emitToUser = (userId, event, payload) => io?.to(userRoom(userId)).emit(event, payload);
const emitToGroup = (groupId, event, payload) => io?.to(groupRoom(groupId)).emit(event, payload);
const emitToConversation = (id, event, payload) => io?.to(conversationRoom(id)).emit(event, payload);

// Sync a user's live sockets in/out of a group room across all their devices.
const addUserToGroupRoom = (userId, groupId) => io?.in(userRoom(userId)).socketsJoin(groupRoom(groupId));
const removeUserFromGroupRoom = (userId, groupId) => io?.in(userRoom(userId)).socketsLeave(groupRoom(groupId));
const clearGroupRoom = (groupId) => io?.in(groupRoom(groupId)).socketsLeave(groupRoom(groupId));

module.exports = {
  initSocket,
  emitToUser,
  emitToGroup,
  emitToConversation,
  addUserToGroupRoom,
  removeUserFromGroupRoom,
  clearGroupRoom,
};
