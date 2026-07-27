// Fixed-window, in-memory rate limiter. Deliberately not a dependency: this guards one
// unauthenticated route against being hammered, it is not a distributed quota. Behind more
// than one instance each keeps its own count, so the effective limit multiplies.
function rateLimit({ windowMs, max }) {
  const hits = new Map(); // key -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now();
    // Swept on use, so the map only ever holds keys seen within the current window.
    for (const [key, entry] of hits) if (entry.resetAt <= now) hits.delete(key);

    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
    }
    return next();
  };
}

module.exports = { rateLimit };