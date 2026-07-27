import request from 'supertest';
import { app } from './helpers.js';

// POST /api/auth/demo hands out a session with no credentials, so the only pre-DB branch
// worth asserting is the one that keeps it switched off. The success path queries the DB
// immediately and is out of scope here (Prisma isn't mockable through the CJS app graph).
describe('POST /api/auth/demo', () => {
  const original = process.env.DEMO_USER_EMAIL;
  afterEach(() => {
    if (original === undefined) delete process.env.DEMO_USER_EMAIL;
    else process.env.DEMO_USER_EMAIL = original;
  });

  it('404s when no demo account is configured', async () => {
    delete process.env.DEMO_USER_EMAIL;
    const res = await request(app).post('/api/auth/demo');
    expect(res.status).toBe(404);
  });

  // Blank or whitespace-only counts as unset, so a half-filled env file can't accidentally
  // switch public auto-login on.
  it('treats a blank setting as switched off', async () => {
    process.env.DEMO_USER_EMAIL = '   ';
    const res = await request(app).post('/api/auth/demo');
    expect(res.status).toBe(404);
  });

  it('needs no auth header to be reached', async () => {
    delete process.env.DEMO_USER_EMAIL;
    const res = await request(app).post('/api/auth/demo');
    expect(res.status).not.toBe(401);
  });
});