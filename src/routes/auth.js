const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const {
  issueTokens, rotateRefreshToken, revokeRefreshToken, signVerifyToken, verifyVerifyToken,
} = require('../lib/tokens');
const { sendVerificationEmail, notifyAdminOfNewUser } = require('../lib/email');
const { publicUser } = require('../lib/serializers');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

// The frontend origin, where the verification link lands (a /verify page that calls us back).
const appUrl = (path) => `${process.env.CORS_ORIGIN || 'http://localhost:5173'}${path}`;
const verifyLink = (userId) => appUrl(`/verify?token=${signVerifyToken(userId)}`);

router.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  const name = String(req.body?.name || '').trim();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });
  if (!name) return res.status(400).json({ error: 'Name required' });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { email, name, passwordHash } });
      // Every user starts with a personal to-do list; no socket emit needed, nobody's connected yet.
      await tx.list.create({ data: { name: 'My to dos', ownerId: created.id, groupId: null } });
      return created;
    });
    // No tokens yet — the account is unverified. Email them a verification link and tell the
    // owner. Both sends are best-effort so a mail hiccup never fails the signup.
    void sendVerificationEmail(user, verifyLink(user.id));
    void notifyAdminOfNewUser(user);
    return res.status(201).json({ status: 'verification_sent', email: user.email });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Email already registered' });
    throw err;
  }
});

router.post('/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.emailVerified)
    return res.status(403).json({ error: 'Please verify your email before logging in', code: 'EMAIL_UNVERIFIED' });

  const tokens = await issueTokens(user.id);
  return res.json({ user: publicUser(user), ...tokens });
});

// Called by the frontend /verify page with the token from the email link.
router.post('/verify', async (req, res) => {
  const token = String(req.body?.token || '');
  let payload;
  try {
    payload = verifyVerifyToken(token);
  } catch {
    return res.status(400).json({ error: 'Invalid or expired verification link', code: 'INVALID_TOKEN' });
  }
  // updateMany so a missing user (e.g. deleted account) yields count 0 rather than throwing;
  // re-verifying an already-verified user is a harmless no-op.
  const { count } = await prisma.user.updateMany({ where: { id: payload.sub }, data: { emailVerified: true } });
  if (count === 0) return res.status(400).json({ error: 'Account not found', code: 'INVALID_TOKEN' });
  return res.json({ success: true });
});

// Re-sends the verification email. Always 200 with a generic body so it can't be used to probe
// which emails are registered.
router.post('/resend-verification', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified) void sendVerificationEmail(user, verifyLink(user.id));
  return res.json({ status: 'ok' });
});

router.post('/refresh', async (req, res) => {
  const refreshToken = req.body?.refreshToken || '';
  const tokens = await rotateRefreshToken(refreshToken);
  if (!tokens) return res.status(401).json({ error: 'Invalid or expired refresh token' });
  return res.json(tokens);
});

router.post('/logout', async (req, res) => {
  await revokeRefreshToken(req.body?.refreshToken || '');
  return res.status(204).end();
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.json({ user: publicUser(user) });
});

module.exports = { router, MIN_PASSWORD };
