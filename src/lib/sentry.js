const Sentry = require('@sentry/node');
const { demoUserId } = require('./demoAccount');

// One gate for every capture site: without SENTRY_DSN (tests, local dev) nothing is reported
// and instrument.js never called init.
const enabled = () => Boolean(process.env.SENTRY_DSN);

const captureException = (err, context) => {
  if (enabled()) Sentry.captureException(err, context);
};

// The public demo account is shared by everyone who opens the demo link, so anyone on the
// internet can generate errors under it. Tagged so those issues can be weighted down later.
const tagDemo = () => {
  if (enabled()) Sentry.setTag('demo_account', true);
};

// Error middleware, registered just before Sentry's handler. The demo id lookup is cached and
// only runs on an already-failed request, so it stays off the hot path.
async function tagDemoAccountErrors(err, req, _res, next) {
  try {
    const id = await demoUserId();
    if (id && req.userId === id) tagDemo();
  } catch {
    // Tagging must never replace the error we were about to report.
  }
  next(err);
}

// An expired or tampered token is a user event, not a bug — reporting those would bury the
// signal. A missing or wrong signing secret also arrives as a JsonWebTokenError, so routine
// failures are matched by message rather than by name and config bugs still get through.
const ROUTINE_JWT_MESSAGES = new Set([
  'jwt expired', 'invalid signature', 'jwt malformed', 'jwt must be provided',
  'invalid token', 'jwt not active',
]);
const isRoutineTokenError = (err) =>
  err?.name === 'TokenExpiredError' ||
  (err?.name === 'JsonWebTokenError' && ROUTINE_JWT_MESSAGES.has(err.message));

module.exports = { captureException, tagDemo, tagDemoAccountErrors, isRoutineTokenError };
