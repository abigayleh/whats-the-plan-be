import recurrence from '../src/lib/recurrence.js';

const { expandOccurrences, isValidRule } = recurrence;

const DAY_MS = 86400000;
// Local-time constructor + local getters throughout: mirrors the module's own use of
// setMonth/getDay/setHours, so assertions hold regardless of the machine's timezone.
const at = (...args) => new Date(...args);
const ev = (startAt, endAt, recurrenceRule = null) => ({ startAt, endAt, recurrenceRule });

describe('isValidRule', () => {
  it('rejects non-objects', () => {
    for (const bad of [null, undefined, 0, 1, 'daily', true]) {
      expect(isValidRule(bad)).toBe(false);
    }
  });

  it('rejects an unknown or missing frequency', () => {
    expect(isValidRule({ frequency: 'biweekly', interval: 1 })).toBe(false);
    expect(isValidRule({ frequency: 'hourly', interval: 1 })).toBe(false);
    expect(isValidRule({ interval: 1 })).toBe(false);
  });

  it('accepts every supported frequency', () => {
    for (const frequency of ['daily', 'weekly', 'monthly', 'yearly']) {
      expect(isValidRule({ frequency, interval: 1 })).toBe(true);
    }
  });

  it('rejects a non-positive or non-integer interval', () => {
    for (const interval of [0, -1, 1.5, '1', undefined, NaN]) {
      expect(isValidRule({ frequency: 'daily', interval })).toBe(false);
    }
  });

  it('accepts a valid daysOfWeek and rejects malformed ones', () => {
    expect(isValidRule({ frequency: 'weekly', interval: 1, daysOfWeek: [0, 6] })).toBe(true);
    expect(isValidRule({ frequency: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5] })).toBe(true);
    // undefined daysOfWeek is allowed (optional)
    expect(isValidRule({ frequency: 'weekly', interval: 1, daysOfWeek: undefined })).toBe(true);
    for (const bad of [[], [7], [-1], [1.5], ['1'], 'not-array', {}]) {
      expect(isValidRule({ frequency: 'weekly', interval: 1, daysOfWeek: bad })).toBe(false);
    }
  });
});

describe('expandOccurrences — non-recurring / invalid rule', () => {
  it('returns the single occurrence when it overlaps the window', () => {
    const start = at(2026, 0, 10, 10, 0);
    const end = at(2026, 0, 10, 12, 0);
    const out = expandOccurrences(ev(start, end), at(2026, 0, 1), at(2026, 0, 31, 23, 59));
    expect(out).toHaveLength(1);
    expect(out[0].startAt.getTime()).toBe(start.getTime());
    expect(out[0].endAt.getTime()).toBe(end.getTime());
  });

  it('includes an event that straddles the window start', () => {
    const out = expandOccurrences(
      ev(at(2025, 11, 31, 23, 0), at(2026, 0, 1, 1, 0)),
      at(2026, 0, 1, 0, 0), at(2026, 0, 5),
    );
    expect(out).toHaveLength(1);
  });

  it('excludes an event entirely before the window', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 1), at(2026, 0, 1, 1, 0)),
      at(2026, 1, 1), at(2026, 1, 5),
    );
    expect(out).toEqual([]);
  });

  it('excludes an event entirely after the window', () => {
    const out = expandOccurrences(
      ev(at(2026, 1, 1), at(2026, 1, 1, 1, 0)),
      at(2026, 0, 1), at(2026, 0, 31),
    );
    expect(out).toEqual([]);
  });

  it('treats an invalid rule (interval 0) as a single non-recurring event', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 5, 9, 0), at(2026, 0, 5, 10, 0), { frequency: 'daily', interval: 0 }),
      at(2026, 0, 1), at(2026, 0, 31),
    );
    expect(out).toHaveLength(1);
  });
});

describe('expandOccurrences — daily', () => {
  it('emits one occurrence per day across the window with exact 24h spacing', () => {
    const start = at(2026, 0, 1, 10, 0);
    const out = expandOccurrences(
      ev(start, at(2026, 0, 1, 11, 0), { frequency: 'daily', interval: 1 }),
      at(2026, 0, 1, 0, 0), at(2026, 0, 7, 23, 59),
    );
    expect(out).toHaveLength(7);
    out.forEach((occ, i) => {
      expect(occ.startAt.getTime()).toBe(start.getTime() + i * DAY_MS);
    });
  });

  it('honours an interval > 1', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 1, 10, 0), at(2026, 0, 1, 11, 0), { frequency: 'daily', interval: 2 }),
      at(2026, 0, 1, 0, 0), at(2026, 0, 8, 23, 59),
    );
    expect(out.map((o) => o.startAt.getDate())).toEqual([1, 3, 5, 7]);
  });

  it('finds occurrences in a window far from the origin (firstIndex fast-forward)', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 1, 10, 0), at(2026, 0, 1, 11, 0), { frequency: 'daily', interval: 1 }),
      at(2026, 0, 10, 0, 0), at(2026, 0, 12, 23, 59),
    );
    expect(out.map((o) => o.startAt.getDate())).toEqual([10, 11, 12]);
  });

  it('caps runaway expansion at MAX_OCCURRENCES', () => {
    const out = expandOccurrences(
      ev(at(2020, 0, 1, 10, 0), at(2020, 0, 1, 11, 0), { frequency: 'daily', interval: 1 }),
      at(2020, 0, 1), at(2030, 0, 1),
    );
    expect(out).toHaveLength(1000);
  });
});

describe('expandOccurrences — weekly', () => {
  it('with no daysOfWeek, recurs on the start day-of-week once per week', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 5, 10, 0), at(2026, 0, 5, 11, 0), { frequency: 'weekly', interval: 1 }),
      at(2026, 0, 5, 0, 0), at(2026, 0, 26, 23, 59),
    );
    expect(out.map((o) => o.startAt.getDate())).toEqual([5, 12, 19, 26]);
    out.forEach((o) => expect(o.startAt.getDay()).toBe(1)); // all Mondays
  });

  it('emits one occurrence per selected weekday, sorted ascending within a week', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 5, 10, 0), at(2026, 0, 5, 11, 0), { frequency: 'weekly', interval: 1, daysOfWeek: [5, 1, 3] }),
      at(2026, 0, 5, 0, 0), at(2026, 0, 18, 23, 59),
    );
    expect(out).toHaveLength(6);
    out.forEach((o) => expect([1, 3, 5]).toContain(o.startAt.getDay()));
    // first week is Mon, Wed, Fri in ascending order
    expect(out.slice(0, 3).map((o) => o.startAt.getDate())).toEqual([5, 7, 9]);
  });

  it('skips weeks for a bi-weekly (interval 2) rule', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 5, 10, 0), at(2026, 0, 5, 11, 0), { frequency: 'weekly', interval: 2, daysOfWeek: [1] }),
      at(2026, 0, 5, 0, 0), at(2026, 1, 1, 23, 59),
    );
    expect(out.map((o) => o.startAt.getDate())).toEqual([5, 19]);
    expect(out[1].startAt.getTime() - out[0].startAt.getTime()).toBe(14 * DAY_MS);
  });

  it('never emits a selected weekday that falls before the event start', () => {
    const start = at(2026, 0, 5, 10, 0); // Monday
    const out = expandOccurrences(
      ev(start, at(2026, 0, 5, 11, 0), { frequency: 'weekly', interval: 1, daysOfWeek: [0, 1, 5] }),
      at(2026, 0, 5, 0, 0), at(2026, 0, 11, 23, 59),
    );
    // Sunday Jan 4 (same week, earlier than start) is excluded
    out.forEach((o) => expect(o.startAt.getTime()).toBeGreaterThanOrEqual(start.getTime()));
    expect(out.some((o) => o.startAt.getDate() === 4)).toBe(false);
  });
});

describe('expandOccurrences — monthly', () => {
  it('recurs on the same day-of-month each month', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 15, 10, 0), at(2026, 0, 15, 11, 0), { frequency: 'monthly', interval: 1 }),
      at(2026, 0, 15, 0, 0), at(2026, 5, 30, 23, 59),
    );
    expect(out).toHaveLength(6);
    out.forEach((o) => expect(o.startAt.getDate()).toBe(15));
    expect(out.map((o) => o.startAt.getMonth())).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('honours an interval > 1', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 15, 10, 0), at(2026, 0, 15, 11, 0), { frequency: 'monthly', interval: 2 }),
      at(2026, 0, 1), at(2026, 6, 31, 23, 59),
    );
    expect(out.map((o) => o.startAt.getMonth())).toEqual([0, 2, 4, 6]);
  });

  it('rolls a day-31 start over short months (JS Date overflow quirk)', () => {
    // Jan 31 + 1 month overflows Feb (28 days) into Mar 3; Feb has no occurrence.
    const out = expandOccurrences(
      ev(at(2026, 0, 31, 10, 0), at(2026, 0, 31, 11, 0), { frequency: 'monthly', interval: 1 }),
      at(2026, 0, 1), at(2026, 3, 30, 23, 59),
    );
    expect(out).toHaveLength(3);
    expect(out.map((o) => [o.startAt.getMonth(), o.startAt.getDate()])).toEqual([
      [0, 31], [2, 3], [2, 31],
    ]);
  });

  it('preserves the wall-clock time across months (DST-safe via setMonth)', () => {
    const out = expandOccurrences(
      ev(at(2026, 0, 15, 10, 30), at(2026, 0, 15, 11, 30), { frequency: 'monthly', interval: 1 }),
      at(2026, 0, 1), at(2026, 11, 31, 23, 59),
    );
    out.forEach((o) => {
      expect(o.startAt.getHours()).toBe(10);
      expect(o.startAt.getMinutes()).toBe(30);
    });
  });
});

describe('expandOccurrences — yearly', () => {
  it('recurs on the same month/day each year', () => {
    const out = expandOccurrences(
      ev(at(2026, 5, 15, 10, 0), at(2026, 5, 15, 11, 0), { frequency: 'yearly', interval: 1 }),
      at(2026, 0, 1), at(2028, 11, 31, 23, 59),
    );
    expect(out.map((o) => o.startAt.getFullYear())).toEqual([2026, 2027, 2028]);
    out.forEach((o) => {
      expect(o.startAt.getMonth()).toBe(5);
      expect(o.startAt.getDate()).toBe(15);
    });
  });

  it('rolls a Feb-29 start over non-leap years (JS Date overflow quirk)', () => {
    const out = expandOccurrences(
      ev(at(2024, 1, 29, 10, 0), at(2024, 1, 29, 11, 0), { frequency: 'yearly', interval: 1 }),
      at(2024, 0, 1), at(2026, 11, 31, 23, 59),
    );
    expect(out).toHaveLength(3);
    // 2024 is a leap year; 2025 and 2026 overflow Feb 29 into Mar 1.
    expect(out.map((o) => [o.startAt.getFullYear(), o.startAt.getMonth(), o.startAt.getDate()])).toEqual([
      [2024, 1, 29], [2025, 2, 1], [2026, 2, 1],
    ]);
  });
});