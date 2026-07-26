import jwt from 'jsonwebtoken';
import tokens from '../src/lib/tokens.js';

const { verifyAccessToken, signVerifyToken, verifyVerifyToken } = tokens;
const SECRET = process.env.JWT_ACCESS_SECRET; // set by test/setup.js

describe('verifyAccessToken', () => {
  it('returns the payload (with sub) for a valid token', () => {
    const token = jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: '15m' });
    expect(verifyAccessToken(token).sub).toBe('u1');
  });

  it('throws for a tampered token', () => {
    const token = jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: '15m' });
    const tampered = `${token.slice(0, -3)}xyz`;
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('throws for a token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'u1' }, 'other-secret', { expiresIn: '15m' });
    expect(() => verifyAccessToken(token)).toThrow();
  });

  it('throws for an expired token', () => {
    const token = jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: '-10s' });
    expect(() => verifyAccessToken(token)).toThrow(jwt.TokenExpiredError);
  });

  it('throws for garbage input', () => {
    expect(() => verifyAccessToken('not-a-token')).toThrow();
  });
});

describe('signVerifyToken / verifyVerifyToken', () => {
  it('round-trips the sub and stamps a verify purpose', () => {
    const payload = verifyVerifyToken(signVerifyToken('u42'));
    expect(payload.sub).toBe('u42');
    expect(payload.purpose).toBe('verify');
  });

  it('rejects a token that lacks the verify purpose', () => {
    const accessLike = jwt.sign({ sub: 'u1' }, SECRET, { expiresIn: '15m' });
    expect(() => verifyVerifyToken(accessLike)).toThrow('Not a verification token');
  });

  it('rejects a token with a different purpose', () => {
    const wrong = jwt.sign({ sub: 'u1', purpose: 'reset' }, SECRET, { expiresIn: '15m' });
    expect(() => verifyVerifyToken(wrong)).toThrow('Not a verification token');
  });

  it('throws for a tampered verify token (signature check runs first)', () => {
    const token = signVerifyToken('u1');
    const tampered = `${token.slice(0, -3)}xyz`;
    expect(() => verifyVerifyToken(tampered)).toThrow();
  });

  it('throws for a verify token signed with a different secret', () => {
    const token = jwt.sign({ sub: 'u1', purpose: 'verify' }, 'other-secret', { expiresIn: '24h' });
    expect(() => verifyVerifyToken(token)).toThrow();
  });
});