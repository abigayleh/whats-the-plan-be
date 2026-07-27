const NEEDS_ONE = 'Itinerary needs both startDate and endDate, or a dayCount';

// An itinerary is either planned (both dates, no dayCount) or to be planned
// (dayCount, no dates). Returns { startDate, endDate, dayCount } or { error }.
function parseSchedule({ startDate, endDate, dayCount }) {
  if (startDate != null || endDate != null) {
    if (startDate == null || endDate == null) return { error: NEEDS_ONE };
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return { error: 'Valid startDate and endDate required' };
    if (end < start) return { error: 'endDate must be after startDate' };
    return { startDate: start, endDate: end, dayCount: null };
  }
  if (dayCount == null) return { error: NEEDS_ONE };
  if (!Number.isInteger(dayCount) || dayCount < 1)
    return { error: 'dayCount must be a whole number of at least 1' };
  return { startDate: null, endDate: null, dayCount };
}

// Resolves a PATCH body against the stored row. Returns null when the body
// leaves the schedule alone, otherwise parseSchedule's result.
function resolvePatchedSchedule(body, current) {
  const keys = ['startDate', 'endDate', 'dayCount'];
  if (!keys.some((k) => k in body)) return null;
  const merged = Object.fromEntries(keys.map((k) => [k, k in body ? body[k] : current[k]]));
  // Dates and dayCount are mutually exclusive, so a body setting only dayCount drops the dates.
  if (!('startDate' in body) && !('endDate' in body) && body.dayCount != null) {
    merged.startDate = null;
    merged.endDate = null;
  }
  return parseSchedule(merged);
}

module.exports = { parseSchedule, resolvePatchedSchedule };