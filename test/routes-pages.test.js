import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// POST /reorder validates orderedIds shape before loading any page (the only reliably pre-DB
// guard). POST / defaults title to 'Untitled' and only checks membership/parent via the DB, so
// it has no pre-DB 400; PATCH/DELETE/GET :id all load the page first — out of scope.
describe('POST /api/pages/reorder (pre-DB shape validation)', () => {
  it('400 when orderedIds is missing', async () => {
    const res = await request(app).post('/api/pages/reorder').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/orderedIds/i);
  });

  it('400 when orderedIds is not an array', async () => {
    const res = await request(app).post('/api/pages/reorder').set(auth).send({ orderedIds: 'nope' });
    expect(res.status).toBe(400);
  });

  it('400 when orderedIds is empty', async () => {
    const res = await request(app).post('/api/pages/reorder').set(auth).send({ orderedIds: [] });
    expect(res.status).toBe(400);
  });

  it('400 when orderedIds contains a non-string', async () => {
    const res = await request(app).post('/api/pages/reorder').set(auth).send({ orderedIds: ['a', 7] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/orderedIds/i);
  });
});