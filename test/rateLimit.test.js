import { rateLimit } from '../src/lib/rateLimit.js';

// A fake req/res/next triple: enough to observe which branch the middleware took.
function call(limiter, ip = '1.1.1.1') {
  const headers = {};
  const res = {
    statusCode: null,
    body: null,
    setHeader: (k, v) => { headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  let passed = false;
  limiter({ ip }, res, () => { passed = true; });
  return { passed, status: res.statusCode, body: res.body, headers };
}

describe('rateLimit', () => {
  it('lets requests through up to the cap', () => {
    const limiter = rateLimit({ windowMs: 1000, max: 3 });
    expect(call(limiter).passed).toBe(true);
    expect(call(limiter).passed).toBe(true);
    expect(call(limiter).passed).toBe(true);
  });

  it('rejects the request after the cap with a 429', () => {
    const limiter = rateLimit({ windowMs: 1000, max: 2 });
    call(limiter);
    call(limiter);
    const blocked = call(limiter);
    expect(blocked.passed).toBe(false);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');
  });

  it('tells the caller how long to wait', () => {
    const limiter = rateLimit({ windowMs: 60_000, max: 1 });
    call(limiter);
    const blocked = call(limiter);
    expect(Number(blocked.headers['Retry-After'])).toBeGreaterThan(0);
    expect(Number(blocked.headers['Retry-After'])).toBeLessThanOrEqual(60);
  });

  it('counts each caller separately', () => {
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    expect(call(limiter, '1.1.1.1').passed).toBe(true);
    expect(call(limiter, '1.1.1.1').passed).toBe(false);
    expect(call(limiter, '2.2.2.2').passed).toBe(true);
  });

  it('lets the caller through again once the window has passed', () => {
    vi.useFakeTimers();
    try {
      const limiter = rateLimit({ windowMs: 1000, max: 1 });
      expect(call(limiter).passed).toBe(true);
      expect(call(limiter).passed).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(call(limiter).passed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not fall over when the caller has no ip', () => {
    const limiter = rateLimit({ windowMs: 1000, max: 1 });
    const res = { setHeader() {}, status() { return this; }, json() { return this; } };
    let passed = false;
    limiter({}, res, () => { passed = true; });
    expect(passed).toBe(true);
  });
});