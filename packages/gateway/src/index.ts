import path from 'node:path';
import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { config } from './config';
import {
  getMetrics,
  metricsMiddleware,
  rateLimitMiddleware,
  requestIdMiddleware,
} from './middleware';
import { configRoutes } from './routes/config';
import { consoleRoutes } from './routes/console';
import { healthRoutes } from './routes/health';
import { hierarchyRoutes } from './routes/hierarchy';
import { proxyRoutes } from './routes/proxy';
import { logger } from './utils/logger';

const app = new Hono();

// Request ID middleware (first, so all other middleware can use it)
app.use('*', requestIdMiddleware);

// Metrics middleware (second, to track all requests)
app.use('*', metricsMiddleware);

// CORS middleware
app.use(
  '*',
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);

// Request logging
app.use('*', honoLogger());

// Rate limiting for API routes (100 requests per minute)
app.use(
  '/api/*',
  rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 100,
  })
);

// Error handling
app.onError((err, c) => {
  const requestId = c.req.header('X-Request-ID') || 'unknown';
  logger.error({ err, requestId }, 'Request error');

  const status = 'status' in err ? (err.status as number) : 500;
  return c.json(
    {
      error: {
        message: err.message || 'Internal Server Error',
        code: 'code' in err ? err.code : 'INTERNAL_ERROR',
        requestId,
      },
    },
    status as 200 | 400 | 401 | 403 | 404 | 500 | 502
  );
});

// Routes
app.route('/health', healthRoutes);
app.route('/api/config', configRoutes);
app.route('/api/console', consoleRoutes);
app.route('/api/console/hierarchy', hierarchyRoutes);
app.route('/api/openfga', proxyRoutes);

// Serve static UI files (production)
const uiDistPath = path.resolve(import.meta.dir, '../../../packages/ui/dist');
const uiDist = Bun.file(path.join(uiDistPath, 'index.html'));

if (await uiDist.exists()) {
  app.use('/assets/*', serveStatic({ root: uiDistPath }));
  app.use('/*', serveStatic({ root: uiDistPath }));
  // SPA fallback: non-file requests serve index.html
  app.get('/*', serveStatic({ root: uiDistPath, path: 'index.html' }));
}

// Metrics endpoint
app.get('/metrics', (c) => {
  return c.json(getMetrics());
});

// Start server
logger.info(`Gateway running on http://localhost:${config.port}`);
logger.info(`Environment: ${config.nodeEnv}`);
logger.info('Middleware enabled: Request ID, Metrics, Rate Limiting');

export default {
  port: config.port,
  fetch: app.fetch,
};
