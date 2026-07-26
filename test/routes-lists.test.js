import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// PUT /arrangement and POST / validate their bodies before any DB call (POST only when no
// groupId is sent — a groupId triggers a membership lookup). List PATCH/DELETE and all nested
// task routes load the list first, so their guards are post-DB and out of scope here.
describe('PUT /api/lists/arrangement (pre-DB shape validation)', () => {
  it('400 when lists is not an array', async () => {
    const res = await request(app).put('/api/lists/arrangement').set(auth).send({ lists: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/lists array required/i);
  });

  it('400 when lists is missing', async () => {
    const res = await request(app).put('/api/lists/arrangement').set(auth).send({});
    expect(res.status).toBe(400);
  });

  it('400 when an item lacks a string listId / integer position', async () => {
    const res = await request(app)
      .put('/api/lists/arrangement')
      .set(auth)
      .send({ lists: [{ listId: 5, position: 'x' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/listId and integer position/i);
  });
});

describe('POST /api/lists (pre-DB body validation, no groupId)', () => {
  it('400 on missing name', async () => {
    const res = await request(app).post('/api/lists').set(auth).send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('400 on a non-string color', async () => {
    const res = await request(app).post('/api/lists').set(auth).send({ name: 'L', color: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/color/i);
  });

  it('400 on a non-boolean showUnscheduledOnCalendar', async () => {
    const res = await request(app)
      .post('/api/lists')
      .set(auth)
      .send({ name: 'L', showUnscheduledOnCalendar: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/showUnscheduledOnCalendar/i);
  });

  it('400 on a non-boolean isDefault', async () => {
    const res = await request(app).post('/api/lists').set(auth).send({ name: 'L', isDefault: 'yes' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/isDefault/i);
  });
});