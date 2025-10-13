import { Hono } from 'hono';

export const healthRoutes = new Hono();

healthRoutes.get('/', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    runtime: 'bun',
  });
});

healthRoutes.get('/ready', (c) => {
  // Add readiness checks here (e.g., can connect to OpenFGA)
  return c.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
  });
});
