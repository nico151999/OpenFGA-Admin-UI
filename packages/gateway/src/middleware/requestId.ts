import type { Context, Next } from 'hono';

/**
 * Generates a unique request ID using crypto.randomUUID
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Request ID middleware - adds X-Request-ID to all requests and responses
 */
export async function requestIdMiddleware(c: Context, next: Next) {
  // Check if request already has an ID (forwarded from client)
  const existingId = c.req.header('X-Request-ID');
  const requestId = existingId || generateRequestId();

  // Store in context for use by other middleware and routes
  c.set('requestId', requestId);

  // Add to response headers
  c.header('X-Request-ID', requestId);

  await next();
}

/**
 * Get request ID from context
 */
export function getRequestId(c: Context): string {
  return c.get('requestId') || 'unknown';
}
