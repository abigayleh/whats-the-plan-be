const DAY_MS = 86400000;
const MAX_OCCURRENCES = 1000; // safety cap per event

const FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

// Validates a recurrenceRule; returns true only for a well-formed rule.
function isValidRule(rule) {
  if (!rule || typeof rule !== 'object') return false;
  return FREQUENCIES.includes(rule.frequency) && Number.isInteger(rule.interval) && rule.interval >= 1;
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

// Occurrence at step index i, measured from the event's original start.
function occurrenceAt(start, rule, i) {
  switch (rule.frequency) {
    case 'daily':
      return new Date(start.getTime() + i * rule.interval * DAY_MS);
    case 'weekly':
      return new Date(start.getTime() + i * rule.interval * 7 * DAY_MS);
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
  if (rule.frequency === 'weekly') return Math.floor(elapsed / (rule.interval * 7 * DAY_MS));
  const months = (windowStart.getFullYear() - start.getFullYear()) * 12 + (windowStart.getMonth() - start.getMonth());
  const unit = rule.frequency === 'monthly' ? rule.interval : rule.interval * 12;
  return Math.max(0, Math.floor(months / unit) - 1);
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

  const occurrences = [];
  for (let i = firstIndex(start, rule, windowStart), n = 0; n < MAX_OCCURRENCES; i++, n++) {
    const occStart = occurrenceAt(start, rule, i);
    if (occStart > windowEnd) break;
    const occEnd = new Date(occStart.getTime() + duration);
    if (occEnd >= windowStart) occurrences.push({ startAt: occStart, endAt: occEnd });
  }
  return occurrences;
}

module.exports = { expandOccurrences, isValidRule };
