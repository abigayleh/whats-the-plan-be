const prisma = require('./prisma');

// The portfolio demo account, handed out publicly via POST /api/auth/demo. Unset means the
// whole demo feature is off, which is the right default for any other deployment.
const demoEmail = () => (process.env.DEMO_USER_EMAIL || '').trim().toLowerCase();

let cachedId = null;

// Resolved once and held: this sits on the write path of the profile routes, and the id
// can't change while the process lives. A miss isn't cached — that only happens when the
// env var names an account that doesn't exist, and re-checking makes it self-healing.
async function demoUserId() {
  const email = demoEmail();
  if (!email) return null;
  if (cachedId) return cachedId;
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
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

module.exports = { demoEmail, demoUserId, blockDemoAccount };