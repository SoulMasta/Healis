// Lightweight in-memory rate limiter (good enough for a single-instance deployment).
// For multi-instance / production, replace with Redis-based limiter.

function createRateLimit({ windowMs = 60_000, max = 20, keyPrefix = 'rl' } = {}) {
  const buckets = new Map(); // key -> { count, resetAt }

  function cleanup(now) {
    // Best-effort cleanup; keep it cheap.
    if (buckets.size < 5_000) return;
    for (const [k, v] of buckets) {
      if (!v || v.resetAt <= now) buckets.delete(k);
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    cleanup(now);

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;

    const cur = buckets.get(key);
    if (!cur || cur.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (cur.count >= max) {
      const retryAfterSec = Math.ceil((cur.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    cur.count += 1;
    return next();
  };
}

module.exports = { createRateLimit };


