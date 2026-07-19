// Shapes a User row for API responses — never leaks passwordHash.
const publicUser = (user) => ({
  id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified,
});

// Shapes an Attachment for API responses — never leaks storedPath.
const serializeAttachment = (att) => ({
  id: att.id,
  filename: att.filename,
  mimeType: att.mimeType,
  sizeBytes: att.sizeBytes,
  uploadedBy: att.uploadedBy,
  taskId: att.taskId,
  messageId: att.messageId,
  createdAt: att.createdAt,
});

module.exports = { publicUser, serializeAttachment };
