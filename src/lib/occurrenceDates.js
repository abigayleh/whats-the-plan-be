const { expandOccurrences, isValidRule } = require('./recurrence');

// Stored completedDates/skippedDates are exact occurrence instants, but every reader — the
// client especially — thinks in calendar days. These helpers keep the two in step: identity
// is the day, the stored value is that day's real occurrence.

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = startOfDay(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const isSameDay = (a, b) => startOfDay(a).getTime() === startOfDay(b).getTime();

// The occurrence instant falling on the same calendar day as `date`, or null when the series
// doesn't recur that day. A non-recurring task has no occurrences to resolve against.
function occurrenceOnDay(task, date) {
  const anchor = task.scheduledStart || task.dueDate;
  if (!anchor || !isValidRule(task.recurrenceRule)) return null;
  const shim = { startAt: anchor, endAt: anchor, recurrenceRule: task.recurrenceRule };
  const found = expandOccurrences(shim, startOfDay(date), endOfDay(date))
    .map((occ) => occ.startAt)
    .filter((occ) => isSameDay(occ, date));
  return found[0] || null;
}

// Re-anchors stored instants onto a changed schedule: a day that still recurs keeps its tick
// at the new instant, a day that no longer recurs is dropped. Without this, moving a recurring
// to-do's date orphans every completion it had — they point at instants that aren't
// occurrences any more, so the day silently un-completes.
function remapOccurrenceDates(isoDates, task) {
  if (!Array.isArray(isoDates) || !isoDates.length) return [];
  const remapped = isoDates
    .map((iso) => occurrenceOnDay(task, new Date(iso)))
    .filter(Boolean)
    .map((date) => date.toISOString());
  return [...new Set(remapped)];
}

// Adds or removes `date`'s occurrence, matching on the calendar day rather than the exact
// string — otherwise an instant that drifted (a changed time, a DST shift) appends a second
// entry for a day that is already ticked instead of clearing it.
function toggleOccurrenceDate(isoDates, occurrence) {
  const current = Array.isArray(isoDates) ? isoDates : [];
  const iso = occurrence.toISOString();
  const sameDayEntries = current.filter((d) => isSameDay(new Date(d), occurrence));
  if (sameDayEntries.length) return current.filter((d) => !isSameDay(new Date(d), occurrence));
  return [...current, iso];
}

module.exports = {
  occurrenceOnDay, remapOccurrenceDates, toggleOccurrenceDate, isSameDay,
};
