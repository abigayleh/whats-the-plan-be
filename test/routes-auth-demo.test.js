import request from 'supertest';
import { app } from './helpers.js';

// The demo account is a hardcoded constant now, so this route has no pre-DB branch left to
// assert — it queries Prisma immediately, which isn't mockable through the CJS app graph
// (see TESTING.md). What's still worth pinning is that it stays public: putting it behind
// auth would break the portfolio link, and nothing else here exercises the route.
describe('POST /api/auth/demo', () => {
  it('is reachable without an auth header', async () => {
    const res = await request(app).post('/api/auth/demo');
    // A 500 here is the unreachable test database, not a rejection. The point is only that
    // no auth middleware turned the request away before the handler ran.
    expect(res.status).not.toBe(401);
  });
});