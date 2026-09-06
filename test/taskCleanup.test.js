import cleanup from '../src/lib/taskCleanup.js';

const { sweepFilter, cutoffFrom, RETAIN_DAYS } = cleanup;
const NOW = new Date('2026-09-06T12:00:00.000Z');

describe('cutoffFrom', () => {
  it('is a week before now by default', () => {
    expect(cutoffFrom(NOW)).toEqual(new Date('2026-08-30T12:00:00.000Z'));
    expect(RETAIN_DAYS).toBe(7);
  });

  it('honours a custom retention window', () => {
    expect(cutoffFrom(NOW, 1)).toEqual(new Date('2026-09-05T12:00:00.000Z'));
  });
});

describe('sweepFilter', () => {
  const where = sweepFilter(NOW);

  it('only matches finished to-dos', () => {
    expect(where.status).toBe('DONE');
  });

  // Deleting one would take every future occurrence of the series with it.
  it('never matches a recurring series', () => {
    expect(where.recurrenceRule).toEqual({ equals: null });
  });

  it('only matches ones completed before the cutoff', () => {
    expect(where.completedAt.lt).toEqual(cutoffFrom(NOW));
  });

  // Rows predating the completedAt column would otherwise match a bare `lt` comparison.
  it('spares rows with no completion date', () => {
    expect(where.completedAt.not).toBeNull();
  });
});
