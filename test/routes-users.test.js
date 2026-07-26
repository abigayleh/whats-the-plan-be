import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// Only PATCH /me validates before touching the DB. /me/password loads the user first, and
// DELETE /me goes straight into a transaction, so their guards are out of scope (post-DB).
describe('PATCH /api/users/me (pre-DB name validation)', () => {
  it('400 on empty name', async () => {
    const res = await request(app).patch('/api/users/me').set(auth).send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_NAME');
  });

  it('400 on missing name', async () => {
    const res = await request(app).patch('/api/users/me').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_NAME');
  });

  it('400 on a name longer than 100 chars', async () => {
    const res = await request(app).patch('/api/users/me').set(auth).send({ name: 'x'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_NAME');
  });
});