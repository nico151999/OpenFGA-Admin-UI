import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Schema for connection profile
const connectionProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  openfgaApiUrl: z.string(),
  storeId: z.string(),
  authorizationModelId: z.string().optional(),
  modelSelectionMode: z.enum(['pinned', 'latest']),
  authMethod: z.enum(['none', 'bearer', 'oauth']),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const recentItemSchema = z.object({
  type: z.enum(['tuple', 'object', 'user']),
  value: z.string(),
  timestamp: z.string(),
});

// Full config schema
const configSchema = z.object({
  version: z.number().default(1),
  profiles: z.array(connectionProfileSchema).default([]),
  recentItems: z.array(recentItemSchema).default([]),
  activeProfileId: z.string().nullable().default(null),
  isConnected: z.boolean().default(false),
  lastUpdated: z.string().optional(),
});

type AppConfig = z.infer<typeof configSchema>;

// Config file path
const CONFIG_DIR = join(homedir(), '.openfga-admin');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    logger.info({ path: CONFIG_DIR }, 'Created config directory');
  }
}

/**
 * Read config from file
 */
function readConfig(): AppConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    const defaultConfig: AppConfig = {
      version: 1,
      profiles: [],
      recentItems: [],
      activeProfileId: null,
      isConnected: false,
    };
    writeConfig(defaultConfig);
    return defaultConfig;
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);
    return configSchema.parse(parsed);
  } catch (error) {
    logger.error({ error }, 'Failed to read config, returning default');
    return {
      version: 1,
      profiles: [],
      recentItems: [],
      activeProfileId: null,
      isConnected: false,
    };
  }
}

/**
 * Write config to file
 */
function writeConfig(config: AppConfig): void {
  ensureConfigDir();

  const configWithTimestamp = {
    ...config,
    lastUpdated: new Date().toISOString(),
  };

  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(configWithTimestamp, null, 2), 'utf-8');
    logger.debug({ path: CONFIG_FILE }, 'Config saved');
  } catch (error) {
    logger.error({ error }, 'Failed to write config');
    throw error;
  }
}

// Create Hono router
export const configRoutes = new Hono();

/**
 * GET /api/config
 * Returns the full config
 */
configRoutes.get('/', (c) => {
  try {
    const config = readConfig();
    return c.json(config);
  } catch (error) {
    logger.error({ error }, 'Failed to get config');
    return c.json({ error: 'Failed to read config' }, 500);
  }
});

/**
 * PUT /api/config
 * Replaces the entire config
 */
configRoutes.put('/', async (c) => {
  try {
    const body = await c.req.json();
    const validated = configSchema.parse(body);
    writeConfig(validated);
    return c.json({ success: true, config: validated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid config format', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to save config');
    return c.json({ error: 'Failed to save config' }, 500);
  }
});

/**
 * PATCH /api/config
 * Partially updates the config
 */
configRoutes.patch('/', async (c) => {
  try {
    const body = await c.req.json();
    const currentConfig = readConfig();
    const merged = { ...currentConfig, ...body };
    const validated = configSchema.parse(merged);
    writeConfig(validated);
    return c.json({ success: true, config: validated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid config format', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to update config');
    return c.json({ error: 'Failed to update config' }, 500);
  }
});

// ============ Profile-specific endpoints ============

/**
 * GET /api/config/profiles
 * Returns all profiles
 */
configRoutes.get('/profiles', (c) => {
  const config = readConfig();
  return c.json(config.profiles);
});

/**
 * POST /api/config/profiles
 * Creates a new profile
 */
configRoutes.post('/profiles', async (c) => {
  try {
    const body = await c.req.json();
    const config = readConfig();

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const newProfile = connectionProfileSchema.parse({
      ...body,
      id,
      createdAt: now,
      updatedAt: now,
    });

    config.profiles.push(newProfile);
    writeConfig(config);

    return c.json({ success: true, profile: newProfile }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid profile format', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to create profile');
    return c.json({ error: 'Failed to create profile' }, 500);
  }
});

/**
 * PUT /api/config/profiles/:id
 * Updates a profile
 */
configRoutes.put('/profiles/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();
    const config = readConfig();

    const index = config.profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    const updatedProfile = connectionProfileSchema.parse({
      ...config.profiles[index],
      ...body,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    });

    config.profiles[index] = updatedProfile;
    writeConfig(config);

    return c.json({ success: true, profile: updatedProfile });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid profile format', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to update profile');
    return c.json({ error: 'Failed to update profile' }, 500);
  }
});

/**
 * DELETE /api/config/profiles/:id
 * Deletes a profile
 */
configRoutes.delete('/profiles/:id', (c) => {
  try {
    const id = c.req.param('id');
    const config = readConfig();

    const index = config.profiles.findIndex((p) => p.id === id);
    if (index === -1) {
      return c.json({ error: 'Profile not found' }, 404);
    }

    config.profiles.splice(index, 1);

    // Clear active profile if it was deleted
    if (config.activeProfileId === id) {
      config.activeProfileId = null;
      config.isConnected = false;
    }

    writeConfig(config);

    return c.json({ success: true });
  } catch (error) {
    logger.error({ error }, 'Failed to delete profile');
    return c.json({ error: 'Failed to delete profile' }, 500);
  }
});

/**
 * GET /api/config/path
 * Returns the config file path (useful for debugging/manual editing)
 */
configRoutes.get('/path', (c) => {
  return c.json({
    configDir: CONFIG_DIR,
    configFile: CONFIG_FILE,
    exists: existsSync(CONFIG_FILE),
  });
});

/**
 * POST /api/config/export
 * Exports config as downloadable JSON
 */
configRoutes.get('/export', (c) => {
  const config = readConfig();
  c.header('Content-Disposition', 'attachment; filename="openfga-admin-config.json"');
  c.header('Content-Type', 'application/json');
  return c.body(JSON.stringify(config, null, 2));
});

/**
 * POST /api/config/import
 * Imports config from uploaded JSON
 */
configRoutes.post('/import', async (c) => {
  try {
    const body = await c.req.json();
    const validated = configSchema.parse(body);
    writeConfig(validated);
    return c.json({ success: true, config: validated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid config format', details: error.issues }, 400);
    }
    logger.error({ error }, 'Failed to import config');
    return c.json({ error: 'Failed to import config' }, 500);
  }
});
