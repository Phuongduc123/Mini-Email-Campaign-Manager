import { Request, Response, NextFunction } from 'express';
import { createRedisConnection } from '../config/redis';

/**
 * Redis-backed rate limiter.
 * Works correctly across multiple API instances (no shared in-memory state).
 *
 * Strategy: fixed window using Redis INCR + EXPIRE.
 *   Key: ratelimit:<ip>:<windowBucket>  where windowBucket = floor(now / windowMs)
 *   First request in a window: INCR returns 1, then EXPIRE sets the TTL.
 *   Subsequent requests: INCR increments atomically; no race condition.
 */

const redis = createRedisConnection();
// Prevent unhandled 'error' events from crashing the process when Redis is unavailable
redis.on('error', () => { /* fail open — handled inside each middleware call */ });

function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const windowBucket = Math.floor(Date.now() / options.windowMs);
    const key = `ratelimit:${ip}:${windowBucket}`;

    try {
      const count = await redis.incr(key);

      if (count === 1) {
        // First request in this window — set expiry (windowMs + 1s buffer)
        await redis.pexpire(key, options.windowMs + 1000);
      }

      if (count > options.max) {
        res.status(429).json({
          error: 'TOO_MANY_REQUESTS',
          message: options.message,
          statusCode: 429,
        });
        return;
      }

      next();
    } catch {
      // If Redis is unavailable, fail open (don't block legitimate traffic)
      next();
    }
  };
}

// 5 requests per 15 minutes per IP — for /register and /login (brute-force targets)
export const strictAuthRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many attempts. Please try again in 15 minutes.',
});

// 10 requests per 15 minutes per IP — for /refresh
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many auth attempts. Please try again in 15 minutes.',
});
