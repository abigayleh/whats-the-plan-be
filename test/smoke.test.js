import request from 'supertest';
import app from '../src/app.js';

// Smoke tests for the harness. These exercise routing, JSON parsing, the auth middleware, and
// input validation — all paths that return before any database call, so they need no Prisma.
// Database-backed happy paths are covered by unit-testing the pure lib/ modules directly (see
// TESTING.md); driving them through the app would need a real test database.
describe('app smoke', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('a protected route without a token is 401', async () => {
    const res = await request(app).get('/api/groups');
    expect(res.status).toBe(401);
  });

  it('a protected route with a garbage token is 401', async () => {
    const res = await request(app).get('/api/groups').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/register rejects an invalid email with 400 (before any DB call)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short', name: '' });
    expect(res.status).toBe(400);
  });
});