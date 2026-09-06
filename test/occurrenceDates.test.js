process.env.TZ = 'Europe/London';

import occurrenceDates from '../src/lib/occurrenceDates.js';

const { occurrenceOnDay, remapOccurrenceDates, toggleOccurrenceDate } = occurrenceDates;

// Mondays and Tuesdays, anchored Tuesday 6 October 2026 at 09:00.
const MON_TUE = [1, 2];
const anchor = new Date(2026, 9, 6, 9, 0);
const task = (over = {}) => ({
  dueDate: anchor,
  scheduledStart: null,
  recurrenceRule: { frequency: 'weekly', interval: 1, daysOfWeek: MON_TUE },
  completedDates: [],
  skippedDates: [],
  ...over,
});
const iso = (...args) => new Date(...args).toISOString();

describe('occurrenceOnDay', () => {
  it('resolves a day the series recurs on to that day’s instant', () => {
    const found = occurrenceOnDay(task(), new Date(2026, 9, 12));  // Monday
    expect(found.toDateString()).toBe('Mon Oct 12 2026');
    expect(found.getHours()).toBe(9);
  });

  it('returns null for a day the series skips', () => {
    expect(occurrenceOnDay(task(), new Date(2026, 9, 14))).toBeNull(); // Wednesday
  });

  it('returns null when the task does not recur', () => {
    expect(occurrenceOnDay(task({ recurrenceRule: null }), new Date(2026, 9, 12))).toBeNull();
  });

  it('resolves correctly after the clocks change', () => {
    const found = occurrenceOnDay(task(), new Date(2026, 10, 9)); // Monday, post-DST
    expect(found.toDateString()).toBe('Mon Nov 09 2026');
    expect(found.getHours()).toBe(9);
  });
});

describe('toggleOccurrenceDate', () => {
  it('adds a day that is not yet ticked', () => {
    const next = toggleOccurrenceDate([], new Date(2026, 9, 12, 9, 0));
    expect(next).toEqual([iso(2026, 9, 12, 9, 0)]);
  });

  it('removes a day that is already ticked', () => {
    const existing = [iso(2026, 9, 12, 9, 0)];
    expect(toggleOccurrenceDate(existing, new Date(2026, 9, 12, 9, 0))).toEqual([]);
  });

  // The bug this exists for: an instant that drifted by an hour used to append a duplicate
  // for a day already ticked, so the row could never be un-ticked.
  it('clears a day even when the stored instant drifted', () => {
    const existing = [iso(2026, 9, 12, 8, 0)];
    expect(toggleOccurrenceDate(existing, new Date(2026, 9, 12, 9, 0))).toEqual([]);
  });

  it('leaves other days untouched', () => {
    const existing = [iso(2026, 9, 5, 9, 0), iso(2026, 9, 12, 9, 0)];
    expect(toggleOccurrenceDate(existing, new Date(2026, 9, 12, 9, 0)))
      .toEqual([iso(2026, 9, 5, 9, 0)]);
  });

  it('tolerates a null list', () => {
    expect(toggleOccurrenceDate(null, new Date(2026, 9, 12, 9, 0)))
      .toEqual([iso(2026, 9, 12, 9, 0)]);
  });
});

describe('remapOccurrenceDates when the schedule changes', () => {
  it('keeps a tick whose day still recurs, re-anchored to the new time', () => {
    const moved = task({ dueDate: new Date(2026, 9, 6, 14, 0) }); // 09:00 → 14:00
    const next = remapOccurrenceDates([iso(2026, 9, 12, 9, 0)], moved);
    expect(next).toHaveLength(1);
    expect(new Date(next[0]).getHours()).toBe(14);
    expect(new Date(next[0]).toDateString()).toBe('Mon Oct 12 2026');
  });

  it('drops a tick whose day no longer recurs', () => {
    // Mondays only now — the Tuesday tick has nothing to attach to.
    const narrowed = task({ recurrenceRule: { frequency: 'weekly', interval: 1, daysOfWeek: [1] } });
    expect(remapOccurrenceDates([iso(2026, 9, 13, 9, 0)], narrowed)).toEqual([]);
  });

  it('keeps the days that survive a narrowed rule and drops the rest', () => {
    const narrowed = task({ recurrenceRule: { frequency: 'weekly', interval: 1, daysOfWeek: [1] } });
    const next = remapOccurrenceDates(
      [iso(2026, 9, 12, 9, 0), iso(2026, 9, 13, 9, 0)], narrowed,
    );
    expect(next.map((d) => new Date(d).toDateString())).toEqual(['Mon Oct 12 2026']);
  });

  it('never returns duplicates for one day', () => {
    const next = remapOccurrenceDates([iso(2026, 9, 12, 9, 0), iso(2026, 9, 12, 8, 0)], task());
    expect(next).toHaveLength(1);
  });

  it('returns empty for an empty or missing list', () => {
    expect(remapOccurrenceDates([], task())).toEqual([]);
    expect(remapOccurrenceDates(null, task())).toEqual([]);
    expect(remapOccurrenceDates(undefined, task())).toEqual([]);
  });

  it('drops everything when the series stops recurring', () => {
    expect(remapOccurrenceDates([iso(2026, 9, 12, 9, 0)], task({ recurrenceRule: null })))
      .toEqual([]);
  });

  it('survives moving the anchor across the clock change', () => {
    const movedPastDst = task({ dueDate: new Date(2026, 10, 3, 9, 0) }); // Tue 3 Nov
    const next = remapOccurrenceDates([iso(2026, 10, 9, 9, 0)], movedPastDst); // Mon 9 Nov
    expect(next.map((d) => new Date(d).toDateString())).toEqual(['Mon Nov 09 2026']);
    expect(new Date(next[0]).getHours()).toBe(9);
  });
});
