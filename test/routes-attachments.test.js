import request from 'supertest';
import { app, tokenFor, bearer } from './helpers.js';

const auth = bearer(tokenFor());

// POST / validates presence of a file and a taskId before loading the task (the only pre-DB
// guards). DELETE /:id looks the attachment up immediately, so it's out of scope.
describe('POST /api/attachments (pre-DB presence checks)', () => {
  it('400 when no file is uploaded', async () => {
    const res = await request(app).post('/api/attachments').set(auth).send({ taskId: 't1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/file is required/i);
  });

  it('400 when a file is present but taskId is missing', async () => {
    const res = await request(app)
      .post('/api/attachments')
      .set(auth)
      .attach('file', Buffer.from('hello'), 'note.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/taskId is required/i);
  });
});