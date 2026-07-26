import request from 'supertest';
import { app } from './helpers.js';

// /api/auth is public. Only register + verify have guards that fire before any DB call;
// login / refresh / resend / logout query the DB immediately, so they're out of scope here.
describe('POST /api/auth/register (pre-DB validation)', () => {
  it('400 on invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'nope', password: 'longenough', name: 'Ada' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('400 on missing email', async () => {
    const res = await request(app).post('/api/auth/register').send({ password: 'longenough', name: 'Ada' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  it('400 on short password (valid email)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'short', name: 'Ada' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  it('400 on missing name (valid email + password)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'a@b.com', password: 'longenough', name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  it('400 on empty body', async () => {
    const res = await request(app).post('/api/auth/register').send({});
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/verify (pre-DB token check)', () => {
  it('400 on missing token', async () => {
    const res = await request(app).post('/api/auth/verify').send({});
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });

  it('400 on a garbage token', async () => {
    const res = await request(app).post('/api/auth/verify').send({ token: 'not-a-jwt' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TOKEN');
  });
});