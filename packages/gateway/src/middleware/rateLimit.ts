import type { Context, Next } from 'hono';
import { logger } from '../utils/logger';
import { getRequestId } from './requestId';

// Simple in-memory rate limiter (for single instance)
// For production, use Redis-backed rate limiting
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  keyGenerator?: (c: Context) => string; // Custom key generator
}

const DEFAULT_CONFIG: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
};

/**
 * Simple rate limiting middleware
 */
export function rateLimitMiddleware(customConfig: Partial<RateLimitConfig> = {}) {
  const config = { ...DEFAULT_CONFIG, ...customConfig };

  return async (c: Context, next: Next) => {
    const key = config.keyGenerator
      ? config.keyGenerator(c)
      : c.req.header('X-Forwarded-For') || c.req.header('CF-Connecting-IP') || 'default';

    const now = Date.now();
    const entry = rateLimitMap.get(key);

    if (entry) {
      // Check if window has expired
      if (now - entry.windowStart > config.windowMs) {
        // Reset window
        entry.count = 1;
        entry.windowStart = now;
      } else {
        entry.count++;
      }

      if (entry.count > config.maxRequests) {
        const retryAfter = Math.ceil((entry.windowStart + config.windowMs - now) / 1000);

        logger.warn(
          {
            requestId: getRequestId(c),
            key,
            count: entry.count,
            limit: config.maxRequests,
          },
          'Rate limit exceeded'
        );

        c.header('Retry-After', retryAfter.toString());
        c.header('X-RateLimit-Limit', config.maxRequests.toString());
        c.header('X-RateLimit-Remaining', '0');
        c.header(
          'X-RateLimit-Reset',
          Math.ceil((entry.windowStart + config.windowMs) / 1000).toString()
        );

        return c.json(
          {
            error: {
              message: 'Rate limit exceeded. Please slow down.',
              code: 'RATE_LIMIT_EXCEEDED',
              retryAfter,
            },
          },
          429
        );
      }
    } else {
      rateLimitMap.set(key, { count: 1, windowStart: now });
    }

    // Add rate limit headers
    const currentEntry = rateLimitMap.get(key)!;
    c.header('X-RateLimit-Limit', config.maxRequests.toString());
    c.header(
      'X-RateLimit-Remaining',
      Math.max(0, config.maxRequests - currentEntry.count).toString()
    );
    c.header(
      'X-RateLimit-Reset',
      Math.ceil((currentEntry.windowStart + config.windowMs) / 1000).toString()
    );

    await next();
  };
}

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > DEFAULT_CONFIG.windowMs * 2) {
      rateLimitMap.delete(key);
    }
  }
}, 60 * 1000); // Clean up every minute
