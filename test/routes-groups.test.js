import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// Only POST / validates the name before any DB call. Every other group route sits behind
// requireMember / requireAdmin (both hit the DB), so their guards can't be reached without one.
describe('POST /api/groups (pre-DB name validation)', () => {
  it('400 on missing name', async () => {
    const res = await request(app).post('/api/groups').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('400 on blank name', async () => {
    const res = await request(app).post('/api/groups').set(auth).send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });
});