const prisma = require('./prisma');
const { captureException } = require('./sentry');

const DAY_MS = 24 * 60 * 60 * 1000;
const RETAIN_DAYS = 7;
const SWEEP_EVERY_MS = DAY_MS;

// Cutoff for "done long enough ago to drop". Exported so a test can pin the clock.
const cutoffFrom = (now = new Date(), retainDays = RETAIN_DAYS) =>
  new Date(now.getTime() - retainDays * DAY_MS);

// The delete filter, kept separate from the query so it can be tested — Prisma itself isn't
// mockable through the CJS app graph (see TESTING.md), and this predicate is the risky part.
// Recurring series are never swept: they have no single completion, and deleting one would
// take every future occurrence with it. `completedAt: not null` also spares any row that
// predates the column and was never backfilled.
const sweepFilter = (now = new Date()) => ({
  status: 'DONE',
  recurrenceRule: { equals: null },
  completedAt: { not: null, lt: cutoffFrom(now) },
});

// Deletes finished one-off to-dos once they're a week old.
async function sweepCompletedTasks(now = new Date()) {
  const { count } = await prisma.task.deleteMany({ where: sweepFilter(now) });
  if (count) console.log(`task cleanup: removed ${count} completed to-do(s) older than ${RETAIN_DAYS} days`);
  return count;
}

// Runs on boot and daily after. Boot matters more than the interval on a host that restarts
// often. Failures are logged, never thrown — a bad sweep must not take the server down.
function startTaskCleanup() {
  const run = () => sweepCompletedTasks().catch((err) => {
    console.error('task cleanup failed:', err);
    captureException(err, { tags: { area: 'taskCleanup' } });
  });
  run();
  const timer = setInterval(run, SWEEP_EVERY_MS);
  timer.unref?.(); // never hold the process open on its own
  return timer;
}

module.exports = {
  sweepCompletedTasks, startTaskCleanup, sweepFilter, cutoffFrom, RETAIN_DAYS,
};
