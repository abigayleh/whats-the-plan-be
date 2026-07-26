import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// Only POST / validates title + dates before any DB call (when no groupId is sent). PATCH's
// scope-immutable and endDate<startDate guards sit *after* loadItineraryAccess (a DB read), so
// they can't be exercised without a database and are out of scope here.
describe('POST /api/itineraries (pre-DB body validation, no groupId)', () => {
  const dates = { startDate: '2026-01-01', endDate: '2026-01-05' };

  it('400 on missing title', async () => {
    const res = await request(app).post('/api/itineraries').set(auth).send({ ...dates });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title required/i);
  });

  it('400 on invalid dates', async () => {
    const res = await request(app)
      .post('/api/itineraries')
      .set(auth)
      .send({ title: 'Trip', startDate: 'nope', endDate: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid startdate and enddate/i);
  });

  it('400 when endDate is before startDate', async () => {
    const res = await request(app)
      .post('/api/itineraries')
      .set(auth)
      .send({ title: 'Trip', startDate: '2026-01-05', endDate: '2026-01-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/enddate must be after startdate/i);
  });
});