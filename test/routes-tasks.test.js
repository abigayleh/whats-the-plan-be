import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// GET /calendar validates the date window before querying. GET /assigned-to-me queries
// immediately (no pre-DB guard beyond auth, covered by the 401 sweep).
describe('GET /api/tasks/calendar (pre-DB window validation)', () => {
  it('400 when start/end are missing', async () => {
    const res = await request(app).get('/api/tasks/calendar').set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start and end/i);
  });

  it('400 on invalid dates', async () => {
    const res = await request(app).get('/api/tasks/calendar?start=nope&end=nope').set(auth);
    expect(res.status).toBe(400);
  });

  it('400 when end is before start', async () => {
    const res = await request(app)
      .get('/api/tasks/calendar?start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z')
      .set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end must be after start/i);
  });
});