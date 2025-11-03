import type { Context, Next } from 'hono';

// Metrics storage
interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  latencySum: number;
  latencyCount: number;
  statusCodes: Record<number, number>;
  pathMetrics: Record<
    string,
    {
      count: number;
      latencySum: number;
      errors: number;
    }
  >;
  lastReset: number;
}

const metrics: RequestMetrics = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  latencySum: 0,
  latencyCount: 0,
  statusCodes: {},
  pathMetrics: {},
  lastReset: Date.now(),
};

/**
 * Metrics collection middleware
 */
export async function metricsMiddleware(c: Context, next: Next) {
  const startTime = performance.now();
  const path = new URL(c.req.url).pathname;

  metrics.totalRequests++;

  // Initialize path metrics if needed
  if (!metrics.pathMetrics[path]) {
    metrics.pathMetrics[path] = { count: 0, latencySum: 0, errors: 0 };
  }
  metrics.pathMetrics[path].count++;

  try {
    await next();

    const duration = performance.now() - startTime;
    const status = c.res.status;

    // Update latency metrics
    metrics.latencySum += duration;
    metrics.latencyCount++;
    metrics.pathMetrics[path].latencySum += duration;

    // Update status code counts
    metrics.statusCodes[status] = (metrics.statusCodes[status] || 0) + 1;

    // Track success/failure
    if (status >= 200 && status < 400) {
      metrics.successfulRequests++;
    } else {
      metrics.failedRequests++;
      metrics.pathMetrics[path].errors++;
    }

    // Add timing header
    c.header('X-Response-Time', `${duration.toFixed(2)}ms`);
  } catch (error) {
    metrics.failedRequests++;
    metrics.pathMetrics[path].errors++;
    throw error;
  }
}

/**
 * Get current metrics summary
 */
export function getMetrics(): {
  uptime: number;
  requests: {
    total: number;
    successful: number;
    failed: number;
    successRate: string;
  };
  latency: {
    average: string;
    count: number;
  };
  statusCodes: Record<number, number>;
  topPaths: Array<{
    path: string;
    count: number;
    avgLatency: string;
    errorRate: string;
  }>;
} {
  const avgLatency = metrics.latencyCount > 0 ? metrics.latencySum / metrics.latencyCount : 0;

  const successRate =
    metrics.totalRequests > 0
      ? ((metrics.successfulRequests / metrics.totalRequests) * 100).toFixed(2)
      : '0.00';

  // Get top 10 paths by request count
  const topPaths = Object.entries(metrics.pathMetrics)
    .map(([path, data]) => ({
      path,
      count: data.count,
      avgLatency: data.count > 0 ? `${(data.latencySum / data.count).toFixed(2)}ms` : '0ms',
      errorRate: data.count > 0 ? `${((data.errors / data.count) * 100).toFixed(2)}%` : '0%',
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    uptime: Date.now() - metrics.lastReset,
    requests: {
      total: metrics.totalRequests,
      successful: metrics.successfulRequests,
      failed: metrics.failedRequests,
      successRate: `${successRate}%`,
    },
    latency: {
      average: `${avgLatency.toFixed(2)}ms`,
      count: metrics.latencyCount,
    },
    statusCodes: { ...metrics.statusCodes },
    topPaths,
  };
}
