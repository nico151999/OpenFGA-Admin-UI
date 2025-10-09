import { z } from 'zod';

const configSchema = z.object({
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  port: z.coerce.number().default(4000),
  corsOrigin: z.string().default('http://localhost:3000'),

  // OpenFGA defaults (can be overridden per-request)
  defaultOpenfgaUrl: z.string().optional(),

  // Security
  allowedStoreIds: z
    .string()
    .transform((s) => (s ? s.split(',') : []))
    .optional(),

  // Rate limiting
  rateLimitWindowMs: z.coerce.number().default(60000),
  rateLimitMaxRequests: z.coerce.number().default(100),

  // Logging
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = configSchema.safeParse({
  nodeEnv: Bun.env.NODE_ENV,
  port: Bun.env.PORT,
  corsOrigin: Bun.env.CORS_ORIGIN,
  defaultOpenfgaUrl: Bun.env.DEFAULT_OPENFGA_URL,
  allowedStoreIds: Bun.env.ALLOWED_STORE_IDS,
  rateLimitWindowMs: Bun.env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: Bun.env.RATE_LIMIT_MAX_REQUESTS,
  logLevel: Bun.env.LOG_LEVEL,
});

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
