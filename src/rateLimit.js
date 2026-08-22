// Minimal in-memory fixed-window rate limiter, keyed by client IP. This
// server runs as a single instance (see Procfile), so there's no need for a
// shared store like Redis - a process-local Map is enough.
//
// Entries are swept periodically so the map doesn't grow unbounded under
// scanning/abuse traffic from many distinct IPs.

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export function createRateLimiter({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, resetAt }

  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(ip);
    }
  }, SWEEP_INTERVAL_MS).unref();

  return function rateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();

    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(ip, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.status(429).json({
        error: "too_many_requests",
        error_description: message || "Rate limit exceeded, try again later.",
      });
      return;
    }

    next();
  };
}
