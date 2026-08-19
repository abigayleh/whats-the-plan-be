// Sentry has to initialise before any instrumented module (express, http, prisma) is loaded,
// which in CommonJS means its own file required on the first line of src/index.js.
require('dotenv').config();
const Sentry = require('@sentry/node');

// Prisma error codes the app uses as control flow: P2002 (unique violation) is the expected
// path for a duplicate signup and for the invite-code retry loop, so it is never a bug.
const CONTROL_FLOW_PRISMA_CODES = new Set(['P2002']);

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    beforeSend(event, hint) {
      return CONTROL_FLOW_PRISMA_CODES.has(hint?.originalException?.code) ? null : event;
    },
  });
}
