process.env.TZ = 'Europe/London';

import recurrence from '../src/lib/recurrence.js';

const { expandOccurrences } = recurrence;

// Clocks go back on Sunday 25 October 2026 in Europe/London.
const weekly = (startAt, daysOfWeek, interval = 1) => ({
  startAt,
  endAt: new Date(startAt.getTime() + 30 * 60 * 1000),
  recurrenceRule: { frequency: 'weekly', interval, daysOfWeek },
});

const dayNames = (occurrences) => occurrences.map((o) => o.startAt.toDateString());

describe('daily expansion across a DST boundary', () => {
  it('keeps the original time of day, and one occurrence per calendar day', () => {
    const task = {
      startAt: new Date(2026, 9, 23, 9, 0),
      endAt: new Date(2026, 9, 23, 9, 30),
      recurrenceRule: { frequency: 'daily', interval: 1 },
    };
    const occ = expandOccurrences(task, new Date(2026, 9, 23), new Date(2026, 9, 30));

    for (const o of occ) expect(o.startAt.getHours()).toBe(9);
    const days = occ.map((o) => o.startAt.toDateString());
    expect(new Set(days).size, `duplicate days in ${days.join(', ')}`).toBe(days.length);
  });
});

describe('weekly expansion across a DST boundary', () => {
  it('confirms the test really runs in a DST-observing zone', () => {
    expect(new Date(2026, 9, 1).getTimezoneOffset())
      .not.toBe(new Date(2026, 11, 1).getTimezoneOffset());
  });

  it('only ever emits the selected weekdays, after the clocks change', () => {
    // Anchored Tuesday 6 Oct 2026 09:00, repeating Mondays and Tuesdays.
    const task = weekly(new Date(2026, 9, 6, 9, 0), [1, 2]);
    const occ = expandOccurrences(task, new Date(2026, 10, 1), new Date(2026, 10, 30));

    const weekdays = [...new Set(occ.map((o) => o.startAt.getDay()))].sort();
    expect(weekdays, `got ${dayNames(occ).join(', ')}`).toEqual([1, 2]);
  });

  it('keeps the original time of day after the clocks change', () => {
    const task = weekly(new Date(2026, 9, 6, 9, 0), [2]);
    const occ = expandOccurrences(task, new Date(2026, 10, 1), new Date(2026, 10, 30));

    for (const o of occ) expect(o.startAt.getHours()).toBe(9);
  });
});
