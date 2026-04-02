import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Simple in-memory rate limiter per IP.
 * Suitable for single-instance deployments.
 * For multi-instance, replace with Redis-backed store.
 */
function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  const store = new Map<string, RateLimitEntry>();

  // Cleanup expired entries every 10 minutes to prevent memory leak
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt < now) store.delete(key);
    }
  }, 10 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const now = Date.now();
    const entry = store.get(ip);

    if (!entry || entry.resetAt < now) {
      store.set(ip, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    entry.count += 1;

    if (entry.count > options.max) {
      res.status(429).json({
        error: 'TOO_MANY_REQUESTS',
        message: options.message,
        statusCode: 429,
      });
      return;
    }

    next();
  };
}

// 10 requests per 15 minutes per IP on auth endpoints
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts. Please try again in 15 minutes.',
});
