import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// GET / validates the date window before querying. POST / validates title/dates/recurrence/
// subtasks before any DB call (as long as no groupId is sent, which would trigger a membership
// lookup). PATCH/DELETE load the event first, so their guards are post-DB and out of scope.
describe('GET /api/events (pre-DB window validation)', () => {
  it('400 when start/end are missing', async () => {
    const res = await request(app).get('/api/events').set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/start and end/i);
  });

  it('400 on invalid dates', async () => {
    const res = await request(app).get('/api/events?start=nope&end=also-nope').set(auth);
    expect(res.status).toBe(400);
  });

  it('400 when end is before start', async () => {
    const res = await request(app)
      .get('/api/events?start=2026-02-01T00:00:00Z&end=2026-01-01T00:00:00Z')
      .set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/end must be after start/i);
  });

  it('400 when the range exceeds 400 days', async () => {
    const res = await request(app)
      .get('/api/events?start=2020-01-01T00:00:00Z&end=2026-01-01T00:00:00Z')
      .set(auth);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/400 days/i);
  });
});

describe('POST /api/events (pre-DB body validation, no groupId)', () => {
  const base = { startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z' };

  it('400 on missing title', async () => {
    const res = await request(app).post('/api/events').set(auth).send({ ...base });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title required/i);
  });

  it('400 on invalid dates', async () => {
    const res = await request(app).post('/api/events').set(auth).send({ title: 'x', startAt: 'nope', endAt: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid startat and endat/i);
  });

  it('400 when endAt is before startAt', async () => {
    const res = await request(app)
      .post('/api/events')
      .set(auth)
      .send({ title: 'x', startAt: '2026-01-02T10:00:00Z', endAt: '2026-01-01T10:00:00Z' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/endat must be after startat/i);
  });

  it('400 on an invalid recurrenceRule', async () => {
    const res = await request(app)
      .post('/api/events')
      .set(auth)
      .send({ title: 'x', ...base, recurrenceRule: { frequency: 'nonsense' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/recurrencerule/i);
  });

  it('400 on invalid subtasks', async () => {
    const res = await request(app)
      .post('/api/events')
      .set(auth)
      .send({ title: 'x', ...base, subtasks: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/subtasks/i);
  });
});