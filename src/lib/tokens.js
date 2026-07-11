const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;

const signAccessToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');

// Creates a refresh token row, returns the raw token (only the hash is stored).
async function issueRefreshToken(userId) {
  const raw = crypto.randomBytes(40).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000);
  await prisma.refreshToken.create({ data: { tokenHash: hashToken(raw), userId, expiresAt } });
  return raw;
}

// Issues both tokens for a user.
async function issueTokens(userId) {
  return { accessToken: signAccessToken(userId), refreshToken: await issueRefreshToken(userId) };
}

// Validates + rotates a refresh token. Returns the new token pair, or null if invalid/expired.
async function rotateRefreshToken(raw) {
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!existing) return null;
  await prisma.refreshToken.delete({ where: { id: existing.id } });
  if (existing.expiresAt < new Date()) return null;
  return issueTokens(existing.userId);
}

// Revokes a refresh token if it exists (idempotent).
async function revokeRefreshToken(raw) {
  await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(raw) } });
}

module.exports = {
  verifyAccessToken,
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
};
