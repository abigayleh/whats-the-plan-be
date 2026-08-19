const { verifyAccessToken } = require('../lib/tokens');
const prisma = require('../lib/prisma');
const { captureException, isRoutineTokenError } = require('../lib/sentry');

let io = null;

const userRoom = (userId) => `user:${userId}`;
const groupRoom = (groupId) => `group:${groupId}`;
const conversationRoom = (id) => `conversation:${id}`;

// Socket.io runs outside Express, so its failures never reach the app's error handler.
const SOCKET_TAG = { tags: { subsystem: 'socket' } };

function initSocket(server) {
  io = server;

  // Reject unauthenticated sockets before they join any room.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      socket.userId = verifyAccessToken(token).sub;
      next();
    } catch (err) {
      // Expired access tokens are routine; a broken secret or a verifier bug is not.
      if (!isRoutineTokenError(err)) captureException(err, SOCKET_TAG);
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    socket.on('error', (err) => captureException(err, SOCKET_TAG));
    try {
      socket.join(userRoom(socket.userId));
      const memberships = await prisma.groupMember.findMany({
        where: { userId: socket.userId },
        select: { groupId: true },
      });
      memberships.forEach((m) => socket.join(groupRoom(m.groupId)));
    } catch (err) {
      // Without this the room join rejects into an unhandled promise and the user silently
      // receives no realtime updates for the whole session.
      captureException(err, SOCKET_TAG);
    }
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
