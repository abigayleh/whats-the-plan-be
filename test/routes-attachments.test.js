import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// POST / validates presence of a file and exactly one owner before loading anything from
// the DB (the only pre-DB guards). DELETE /:id looks the attachment up immediately, so
// it's out of scope.
describe('POST /api/attachments (pre-DB presence checks)', () => {
  it('400 when no file is uploaded', async () => {
    const res = await request(app).post('/api/attachments').set(auth).send({ taskId: 't1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file is required/i);
  });

  it('400 when a file is present but neither taskId nor pageId is given', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set(auth)
      .attach('file', Buffer.from('hello'), 'note.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one of taskId or pageId/i);
  });

  // An attachment hangs off exactly one owner; both would make its access rules ambiguous.
  it('400 when both taskId and pageId are given', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set(auth)
      .field('taskId', 't1')
      .field('pageId', 'p1')
      .attach('file', Buffer.from('hello'), 'note.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/exactly one of taskId or pageId/i);
  });

  it('401 without a token', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .attach('file', Buffer.from('hello'), 'note.txt');
    expect(res.status).toBe(401);
  });
});