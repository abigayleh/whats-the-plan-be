const prisma = require('./prisma');

// The portfolio demo account — the one handed out publicly via POST /api/auth/demo, which
// signs anyone in as it without a password. Hardcoded rather than configured, matching
// scripts/seed-demo.mjs, which targets this same address to build the demo's contents.
const DEMO_EMAIL = 'abigayle100@icloud.com';

let cachedId = null;

// Resolved once and held: this sits on the write path of the profile routes, and the id
// can't change while the process lives. A miss isn't cached — that only happens on a
// database without this account, and re-checking makes it self-healing.
async function demoUserId() {
  if (cachedId) return cachedId;
  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  cachedId = user?.id ?? null;
  return cachedId;
}

// Anyone with the demo link is fully signed in as that account. Changing its password or
// deleting it would take the demo away from everyone else — including its owner — so those
// two are refused. Everything else stays editable; that's the point of a demo.
async function blockDemoAccount(req, res, next) {
  try {
    const id = await demoUserId();
    if (id && req.userId === id)
      return res.status(403).json({ error: 'Not available on the demo account', code: 'DEMO_ACCOUNT' });
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { DEMO_EMAIL, demoUserId, blockDemoAccount };