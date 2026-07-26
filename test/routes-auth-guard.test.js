import request from 'supertest';
import { app, tokenFor, expiredToken, bearer } from './helpers.js';

// Every protected mount enforces requireAuth before the sub-router runs. A missing,
// malformed, or expired token is rejected with 401 before any DB call. One representative
// path per mount (the mount-level middleware fires whether or not the sub-path matches).
const PROTECTED = [
  ['GET', '/api/users'],
  ['GET', '/api/groups'],
  ['GET', '/api/events'],
  ['GET', '/api/lists'],
  ['GET', '/api/tasks/assigned-to-me'],
  ['POST', '/api/attachments'],
  ['GET', '/api/files/some-id'],
  ['GET', '/api/groups/g1/polls'],
  ['GET', '/api/polls/p1'],
  ['GET', '/api/itineraries'],
  ['GET', '/api/geocode'],
  ['GET', '/api/pages'],
  ['GET', '/api/auth/me'], // requireAuth lives inside the auth router, not at the mount
];

const call = (method, path) => request(app)[method.toLowerCase()](path);

describe('auth middleware 401 sweep', () => {
  describe.each(PROTECTED)('%s %s', (method, path) => {
    it('401 with no token', async () => {
      const res = await call(method, path);
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('401 with a garbage token', async () => {
      const res = await call(method, path).set(bearer('not-a-jwt'));
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('401 with an expired token', async () => {
      const res = await call(method, path).set(bearer(expiredToken()));
      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });
  });

  it('a non-Bearer Authorization header is treated as missing → 401', async () => {
    const res = await request(app).get('/api/groups').set({ Authorization: tokenFor() });
    expect(res.status).toBe(401);
  });
});

describe('unknown paths', () => {
  it('unmatched path is 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
  });

  it('wrong method on a real path is 404 (Express default, no 405)', async () => {
    const res = await request(app).patch('/api/health');
    expect(res.status).toBe(404);
  });
});