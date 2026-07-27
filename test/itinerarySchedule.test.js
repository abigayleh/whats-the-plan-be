import schedule from '../src/lib/itinerarySchedule.js';

const { parseSchedule, resolvePatchedSchedule } = schedule;

const planned = { startDate: new Date('2026-01-01'), endDate: new Date('2026-01-05'), dayCount: null };
const unplanned = { startDate: null, endDate: null, dayCount: 4 };

describe('parseSchedule', () => {
  it('accepts both dates and clears dayCount', () => {
    const out = parseSchedule({ startDate: '2026-01-01', endDate: '2026-01-05', dayCount: 9 });
    expect(out).toEqual(planned);
  });

  it('accepts a dayCount with no dates', () => {
    expect(parseSchedule({ dayCount: 4 })).toEqual(unplanned);
  });

  it('rejects a payload with neither dates nor dayCount', () => {
    expect(parseSchedule({}).error).toMatch(/both startdate and enddate, or a daycount/i);
    expect(parseSchedule({ startDate: null, endDate: null, dayCount: null }).error).toBeTruthy();
  });

  it('rejects a partial date pair', () => {
    expect(parseSchedule({ startDate: '2026-01-01' }).error).toMatch(/both startdate and enddate/i);
    expect(parseSchedule({ endDate: '2026-01-05', dayCount: 3 }).error).toMatch(/both startdate and enddate/i);
  });

  it('rejects unparseable dates', () => {
    expect(parseSchedule({ startDate: 'nope', endDate: 'nope' }).error).toMatch(/valid startdate and enddate/i);
  });

  it('rejects endDate before startDate', () => {
    expect(parseSchedule({ startDate: '2026-01-05', endDate: '2026-01-01' }).error).toMatch(
      /enddate must be after startdate/i,
    );
  });

  it('rejects a dayCount below 1 or not a whole number', () => {
    for (const bad of [0, -1, 1.5, '3', true]) {
      expect(parseSchedule({ dayCount: bad }).error).toMatch(/daycount must be a whole number/i);
    }
  });
});

describe('resolvePatchedSchedule', () => {
  it('returns null when the body leaves the schedule alone', () => {
    expect(resolvePatchedSchedule({ title: 'Trip' }, planned)).toBeNull();
  });

  it('setting both dates on an unplanned itinerary clears dayCount', () => {
    const out = resolvePatchedSchedule({ startDate: '2026-01-01', endDate: '2026-01-05' }, unplanned);
    expect(out).toEqual(planned);
  });

  it('setting dayCount on a planned itinerary clears the dates', () => {
    expect(resolvePatchedSchedule({ dayCount: 4 }, planned)).toEqual(unplanned);
  });

  it('keeps the untouched half of an existing date pair', () => {
    const out = resolvePatchedSchedule({ endDate: '2026-01-09' }, planned);
    expect(out.startDate).toEqual(planned.startDate);
    expect(out.endDate).toEqual(new Date('2026-01-09'));
  });

  it('rejects nulling the dates without supplying a dayCount', () => {
    expect(resolvePatchedSchedule({ startDate: null, endDate: null }, planned).error).toBeTruthy();
  });

  it('rejects setting only one date on an unplanned itinerary', () => {
    expect(resolvePatchedSchedule({ startDate: '2026-01-01' }, unplanned).error).toMatch(
      /both startdate and enddate/i,
    );
  });

  it('rejects nulling dayCount when there are no dates to fall back on', () => {
    expect(resolvePatchedSchedule({ dayCount: null }, unplanned).error).toBeTruthy();
  });
});