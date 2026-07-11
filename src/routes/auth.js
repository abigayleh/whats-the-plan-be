const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { issueTokens, rotateRefreshToken, revokeRefreshToken } = require('../lib/tokens');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const publicUser = (user) => ({ id: user.id, email: user.email });

router.post('/register', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Valid email required' });
  if (password.length < MIN_PASSWORD)
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD} characters` });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ data: { email, passwordHash } });
    const tokens = await issueTokens(user.id);
    return res.status(201).json({ user: publicUser(user), ...tokens });
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

  const tokens = await issueTokens(user.id);
  return res.json({ user: publicUser(user), ...tokens });
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

module.exports = router;
