import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());
const post = (body) => request(app).post('/api/itineraries').set(auth).send(body);

// Only POST / and PATCH /order validate the body before any DB call (POST only when no
// groupId is sent). PATCH /:id's guards sit *after* loadItineraryAccess (a DB read), so they
// can't be exercised without a database — the schedule logic behind them is unit-tested in
// itinerarySchedule.test.js instead.
describe('POST /api/itineraries (pre-DB body validation, no groupId)', () => {
  const dates = { startDate: '2026-01-01', endDate: '2026-01-05' };

  it('400 on missing title', async () => {
    const res = await post({ ...dates });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title required/i);
  });

  it('400 on invalid dates', async () => {
    const res = await post({ title: 'Trip', startDate: 'nope', endDate: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid startdate and enddate/i);
  });

  it('400 when endDate is before startDate', async () => {
    const res = await post({ title: 'Trip', startDate: '2026-01-05', endDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/enddate must be after startdate/i);
  });

  it('400 with neither dates nor dayCount', async () => {
    const res = await post({ title: 'Trip' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/both startdate and enddate, or a daycount/i);
  });

  it('400 on a partial date pair', async () => {
    const res = await post({ title: 'Trip', startDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/both startdate and enddate/i);
  });

  it('400 on a dayCount below 1', async () => {
    const res = await post({ title: 'Trip', dayCount: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/daycount must be a whole number/i);
  });
});

describe('PATCH /api/itineraries/order', () => {
  const order = (body) => request(app).patch('/api/itineraries/order').set(auth).send(body);

  it('401 without a token', async () => {
    const res = await request(app).patch('/api/itineraries/order').send({ ids: ['a'] });
    expect(res.status).toBe(401);
  });

  it('400 when ids is missing, empty, or not an array of strings', async () => {
    for (const body of [{}, { ids: [] }, { ids: 'a' }, { ids: [1, 2] }, { ids: ['a', ''] }]) {
      const res = await order(body);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/non-empty array/i);
    }
  });

  it('400 on an oversized batch', async () => {
    const res = await order({ ids: Array.from({ length: 501 }, (_, i) => `id-${i}`) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at most 500 ids/i);
  });

  it('400 on duplicate ids', async () => {
    const res = await order({ ids: ['a', 'a'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unique/i);
  });
});