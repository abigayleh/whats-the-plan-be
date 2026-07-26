import jwt from 'jsonwebtoken';
import app from '../src/app.js';

// A valid, well-formed access token for `id`. requireAuth only decodes `sub` (no DB),
// so any id lets a request reach the route's pre-DB validation.
export const tokenFor = (id = 'user-1') => jwt.sign({ sub: id }, process.env.JWT_ACCESS_SECRET);

// An access token whose exp is already in the past — verifyAccessToken throws → 401.
export const expiredToken = (id = 'user-1') =>
  jwt.sign({ sub: id }, process.env.JWT_ACCESS_SECRET, { expiresIn: '-10s' });

export const bearer = (token) => ({ Authorization: `Bearer ${token}` });

export { app };