import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// A query shorter than 3 chars short-circuits to an empty array before the upstream fetch —
// no DB, no network. Longer queries hit Nominatim (external), so they're out of scope.
describe('GET /api/geocode (short-query short-circuit)', () => {
  it('200 [] when q is missing', async () => {
    const res = await request(app).get('/api/geocode').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('200 [] when q is shorter than 3 chars', async () => {
    const res = await request(app).get('/api/geocode?q=ab').set(auth);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});