const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prisma = require('./prisma');

const ACCESS_TTL = '15m';
const REFRESH_TTL_DAYS = 7;
const VERIFY_TTL = '24h';

const signAccessToken = (userId) =>
  jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL });

const verifyAccessToken = (token) =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET);

// Email-verification link token: a short-lived JWT (no DB row), scoped by a purpose claim so
// an access token can't be swapped in for it and vice versa.
const signVerifyToken = (userId) =>
  jwt.sign({ sub: userId, purpose: 'verify' }, process.env.JWT_ACCESS_SECRET, { expiresIn: VERIFY_TTL });

const verifyVerifyToken = (token) => {
  const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
  if (payload.purpose !== 'verify') throw new Error('Not a verification token');
  return payload;
};

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
  signVerifyToken,
  verifyVerifyToken,
  issueTokens,
  rotateRefreshToken,
  revokeRefreshToken,
};
