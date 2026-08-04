const DAY_MS = 86400000;
const MAX_OCCURRENCES = 1000; // safety cap per event

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

// Validates a recurrenceRule; returns true only for a well-formed rule. daysOfWeek is optional
// (weekly/bi-weekly day-of-week picker) — when present it must be a non-empty array of 0-6 ints.
function isValidRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  if (!FREQUENCIES.includes(rule.frequency) || !Number.isInteger(rule.interval) || rule.interval < 1) return false;
  if (rule.daysOfWeek !== undefined) {
    if (!Array.isArray(rule.daysOfWeek) || rule.daysOfWeek.length === 0) return false;
    if (!rule.daysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return false;
  }
  return true;
}

const addMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};
const addYears = (date, n) => {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
};

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Sunday-anchored week start — mirrors the frontend's date.js startOfWeek, so weekly/bi-weekly
// expansion (see weeklyOccurrencesInBlock below) matches identically between client and server.
function startOfWeek(date) {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

// Same calendar day as `dayStart` (midnight), but at the original event's time-of-day.
function atOriginalTime(dayStart, start) {
  const d = new Date(dayStart);
  d.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds());
  return d;
}

// Occurrence at step index i, measured from the event's original start. Weekly isn't handled
// here — a weekly rule can produce more than one occurrence per step (one per selected weekday),
// so it's expanded separately by weeklyOccurrencesInBlock/firstWeeklyBlockIndex below.
function occurrenceAt(start, rule, i) {
  switch (rule.frequency) {
    case 'daily':
      return new Date(start.getTime() + i * rule.interval * DAY_MS);
    case 'monthly':
      return addMonths(start, i * rule.interval);
    case 'yearly':
      return addYears(start, i * rule.interval);
  }
}

// Estimated first step index near windowStart, so we don't iterate from the origin.
function firstIndex(start, rule, windowStart) {
  if (windowStart <= start) return 0;
  const elapsed = windowStart.getTime() - start.getTime();
  if (rule.frequency === 'daily') return Math.floor(elapsed / (rule.interval * DAY_MS));
  const months = (windowStart.getFullYear() - start.getFullYear()) * 12 + (windowStart.getMonth() - start.getMonth());
  const unit = rule.frequency === 'monthly' ? rule.interval : rule.interval * 12;
  return Math.max(0, Math.floor(months / unit) - 1);
}

// All occurrences of a weekly/bi-weekly rule that fall in week-block `blockIndex`, where block 0
// is the event's own week and each block spans `rule.interval` weeks. No daysOfWeek (incl. every
// rule saved before this feature existed) falls back to "just the start date's own weekday" —
// the same single-occurrence-per-week behavior this rule had before.
function weeklyOccurrencesInBlock(start, rule, blockIndex) {
  const anchorWeek = startOfWeek(start);
  const blockWeekStart = new Date(anchorWeek.getTime() + blockIndex * rule.interval * 7 * DAY_MS);
  const daysOfWeek = rule.daysOfWeek?.length ? rule.daysOfWeek : [start.getDay()];
  return [...daysOfWeek]
    .sort((a, b) => a - b)
    .map((dow) => atOriginalTime(new Date(blockWeekStart.getTime() + dow * DAY_MS), start))
    .filter((d) => d >= start); // never emit an occurrence before the event's own start
}

// Nearest week-block index at/before windowStart, so we don't walk from the origin.
function firstWeeklyBlockIndex(start, rule, windowStart) {
  if (windowStart <= start) return 0;
  const weeksBetween = Math.round((startOfWeek(windowStart) - startOfWeek(start)) / (7 * DAY_MS));
  return Math.max(0, Math.floor(weeksBetween / rule.interval));
}

function expandWeekly(start, rule, duration, windowStart, windowEnd) {
  const occurrences = [];
  for (let block = firstWeeklyBlockIndex(start, rule, windowStart), n = 0; n < MAX_OCCURRENCES; block++) {
    const blockOccurrences = weeklyOccurrencesInBlock(start, rule, block);
    if (blockOccurrences.length && blockOccurrences[0] > windowEnd) break;
    for (const occStart of blockOccurrences) {
      if (occStart > windowEnd) continue;
      const occEnd = new Date(occStart.getTime() + duration);
      if (occEnd >= windowStart) occurrences.push({ startAt: occStart, endAt: occEnd });
      n++;
      if (n >= MAX_OCCURRENCES) break;
    }
  }
  return occurrences;
}

// Expands a recurring event into occurrences overlapping [windowStart, windowEnd].
// Non-recurring events return a single occurrence at their own times.
function expandOccurrences(event, windowStart, windowEnd) {
  const start = new Date(event.startAt);
  const duration = new Date(event.endAt).getTime() - start.getTime();
  const rule = event.recurrenceRule;

  if (!isValidRule(rule)) {
    const end = new Date(event.endAt);
    return start <= windowEnd && end >= windowStart ? [{ startAt: start, endAt: end }] : [];
  }

  if (rule.frequency === 'weekly') return expandWeekly(start, rule, duration, windowStart, windowEnd);

  const occurrences = [];
  for (let i = firstIndex(start, rule, windowStart), n = 0; n < MAX_OCCURRENCES; i++, n++) {
    const occStart = occurrenceAt(start, rule, i);
    if (occStart > windowEnd) break;
    const occEnd = new Date(occStart.getTime() + duration);
    if (occEnd >= windowStart) occurrences.push({ startAt: occStart, endAt: occEnd });
  }
  return occurrences;
}

// The task occurrence closest to `date` — completedDates must hold exact occurrence starts,
// but a client ticking a past day only knows the day, not the expansion's time-of-day (which
// is derived server-side and shifts with DST). Ties go to the earlier occurrence, so a date
// sent at midday lands on that day's occurrence even when it starts at midnight.
// Returns `date` untouched when the task doesn't recur or has no anchor to expand from.
function snapToOccurrence(task, date) {
  const anchor = task.scheduledStart || task.dueDate;
  if (!anchor || !isValidRule(task.recurrenceRule)) return date;
  const shim = { startAt: anchor, endAt: anchor, recurrenceRule: task.recurrenceRule };
  const window = 36 * 3600 * 1000; // a day either side, so the nearest occurrence is always in range
  const found = expandOccurrences(shim, new Date(date.getTime() - window), new Date(date.getTime() + window))
    .map((occ) => occ.startAt)
    .sort((a, b) => Math.abs(a - date) - Math.abs(b - date) || a - b);
  return found[0] || date;
}

// Drops occurrences the user removed from the series. Lives here rather than inline in the
// route so "a skipped day never expands" is testable without a database.
function withoutSkipped(occurrences, skippedDates) {
  if (!skippedDates?.length) return occurrences;
  const skipped = new Set(skippedDates);
  return occurrences.filter((occ) => !skipped.has(occ.startAt.toISOString()));
}

module.exports = {
  expandOccurrences, isValidRule, snapToOccurrence, withoutSkipped,
};
