import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { withRetry } from '../middleware';
import { logger } from '../utils/logger';

export const proxyRoutes = new Hono();

// Allowed OpenFGA API paths (whitelist approach)
const allowedPaths = [
  // Stores
  '/stores',
  /^\/stores\/[^/]+$/,
  // Authorization Models
  /^\/stores\/[^/]+\/authorization-models$/,
  /^\/stores\/[^/]+\/authorization-models\/[^/]+$/,
  // Tuples
  /^\/stores\/[^/]+\/read$/,
  /^\/stores\/[^/]+\/write$/,
  /^\/stores\/[^/]+\/changes$/,
  // Queries
  /^\/stores\/[^/]+\/check$/,
  /^\/stores\/[^/]+\/batch-check$/,
  /^\/stores\/[^/]+\/expand$/,
  /^\/stores\/[^/]+\/list-objects$/,
  /^\/stores\/[^/]+\/streamed-list-objects$/,
  /^\/stores\/[^/]+\/list-users$/,
  // Assertions
  /^\/stores\/[^/]+\/assertions\/[^/]+$/,
];

function isPathAllowed(path: string): boolean {
  return allowedPaths.some((allowed) => {
    if (typeof allowed === 'string') {
      return path === allowed;
    }
    return allowed.test(path);
  });
}

// Proxy middleware for all methods
proxyRoutes.all('/*', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const authorization = c.req.header('authorization');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  const path = c.req.path.replace('/api/openfga', '');

  // Validate path is allowed
  if (!isPathAllowed(path)) {
    throw new HTTPException(403, {
      message: `Path not allowed: ${path}`,
    });
  }

  const targetUrl = `${openfgaUrl}${path}`;
  const method = c.req.method;

  logger.info({ method, targetUrl, storeId }, 'Proxying request to OpenFGA');

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authorization) {
      headers.Authorization = authorization;
    }

    const requestInit: RequestInit = {
      method,
      headers,
    };

    // Add body for non-GET requests
    if (method !== 'GET' && method !== 'HEAD') {
      const body = await c.req.text();
      if (body) {
        requestInit.body = body;
      }
    }

    // Add query params
    const url = new URL(targetUrl);
    const queryParams = c.req.query();
    for (const [key, value] of Object.entries(queryParams)) {
      if (value) url.searchParams.set(key, value);
    }

    const requestId = c.req.header('X-Request-ID') || 'unknown';

    // Use retry middleware for resilient requests
    const response = await withRetry(
      () => fetch(url.toString(), requestInit),
      {
        maxRetries: 3,
        retryableStatuses: [429, 409, 503, 502, 504],
      },
      requestId
    );

    const data = await response.json();

    // Forward request ID to client
    return c.json(data, response.status as 200);
  } catch (error) {
    logger.error({ error, targetUrl }, 'OpenFGA request failed');

    if (error instanceof Error) {
      throw new HTTPException(502, {
        message: `Failed to connect to OpenFGA: ${error.message}`,
      });
    }

    throw new HTTPException(502, {
      message: 'Failed to connect to OpenFGA',
    });
  }
});
