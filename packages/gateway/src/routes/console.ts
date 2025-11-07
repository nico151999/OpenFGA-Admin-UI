import { transformer } from '@openfga/syntax-transformer';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { logger } from '../utils/logger';

export const consoleRoutes = new Hono();

// Static manifest for Phase 1 (will be derived from model in Phase 2)
const defaultManifest = {
  version: '1.0.0',
  nav: [
    { id: 'dashboard', title: 'Dashboard', page: 'Dashboard', icon: 'DashboardOutlined' },
    { id: 'model', title: 'Authorization Model', page: 'ModelBrowser', icon: 'ApartmentOutlined' },
    {
      id: 'tuples',
      title: 'Relationship Tuples',
      page: 'TupleManager',
      icon: 'UnorderedListOutlined',
    },
    { id: 'explorer', title: 'Access Explorer', page: 'AccessExplorer', icon: 'SearchOutlined' },
    { id: 'changes', title: 'Changes Feed', page: 'ChangesFeed', icon: 'HistoryOutlined' },
  ],
  pages: {
    Dashboard: {
      title: 'Dashboard',
      widgets: [
        { type: 'StoreInfo', props: {} },
        { type: 'QuickActions', props: {} },
        { type: 'RecentItems', props: {} },
      ],
    },
    ModelBrowser: {
      title: 'Authorization Model',
      widgets: [
        { type: 'ModelVersionSelector', props: {} },
        { type: 'TypeDefinitionTree', props: {} },
        { type: 'RelationViewer', props: {} },
      ],
    },
    TupleManager: {
      title: 'Relationship Tuples',
      widgets: [
        { type: 'TupleSearch', props: { allowTypePrefix: true } },
        { type: 'TupleEditor', props: { useTypeRestrictions: true } },
        { type: 'BulkImport', props: { formats: ['csv', 'json'] } },
      ],
    },
    AccessExplorer: {
      title: 'Access Explorer',
      widgets: [
        { type: 'CheckForm', props: {} },
        { type: 'ListObjectsForm', props: {} },
        { type: 'ListUsersForm', props: {} },
        { type: 'ExpandTree', props: {} },
      ],
    },
    ChangesFeed: {
      title: 'Changes Feed',
      widgets: [
        { type: 'ChangesTimeline', props: {} },
        { type: 'ChangesFilter', props: {} },
      ],
    },
  },
  capabilities: {
    identityPicker: false,
    resourcePicker: false,
    bulkImport: true,
    visualModelBuilder: false,
  },
};

// GET /api/console/manifest
consoleRoutes.get('/manifest', (c) => {
  return c.json(defaultManifest);
});

// GET /api/console/discover-stores?url=<openfga-url>
// Discover stores from an OpenFGA instance (used during connection setup)
consoleRoutes.get('/discover-stores', async (c) => {
  const openfgaUrl = c.req.query('url');

  if (!openfgaUrl) {
    throw new HTTPException(400, { message: 'Missing url query parameter' });
  }

  // Validate URL format
  try {
    new URL(openfgaUrl);
  } catch {
    throw new HTTPException(400, { message: 'Invalid URL format' });
  }

  logger.info({ openfgaUrl }, 'Discovering stores from OpenFGA');

  try {
    const response = await fetch(`${openfgaUrl}/stores`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new HTTPException(response.status as 400, {
        message: `OpenFGA returned ${response.status}: ${error}`,
      });
    }

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    logger.error({ error, openfgaUrl }, 'Failed to discover stores');
    throw new HTTPException(503, {
      message: `Cannot connect to OpenFGA at ${openfgaUrl}. Is it running?`,
    });
  }
});

// GET /api/console/discover-models?url=<openfga-url>&storeId=<store-id>
// Discover authorization models from a store (used during connection setup)
consoleRoutes.get('/discover-models', async (c) => {
  const openfgaUrl = c.req.query('url');
  const storeId = c.req.query('storeId');

  if (!openfgaUrl) {
    throw new HTTPException(400, { message: 'Missing url query parameter' });
  }

  if (!storeId) {
    throw new HTTPException(400, { message: 'Missing storeId query parameter' });
  }

  // Validate URL format
  try {
    new URL(openfgaUrl);
  } catch {
    throw new HTTPException(400, { message: 'Invalid URL format' });
  }

  logger.info({ openfgaUrl, storeId }, 'Discovering models from OpenFGA store');

  try {
    const response = await fetch(`${openfgaUrl}/stores/${storeId}/authorization-models`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      const error = await response.text().catch(() => 'Unknown error');
      throw new HTTPException(response.status as 400, {
        message: `OpenFGA returned ${response.status}: ${error}`,
      });
    }

    const data = await response.json();
    return c.json(data);
  } catch (error) {
    if (error instanceof HTTPException) throw error;
    logger.error({ error, openfgaUrl, storeId }, 'Failed to discover models');
    throw new HTTPException(503, {
      message: `Cannot connect to OpenFGA at ${openfgaUrl}. Is it running?`,
    });
  }
});

// POST /api/console/test-connection
const testConnectionSchema = z.object({
  openfgaApiUrl: z.string().url(),
  storeId: z.string().min(1),
  authorizationModelId: z.string().optional(),
});

consoleRoutes.post('/test-connection', async (c) => {
  const body = await c.req.json();
  const result = testConnectionSchema.safeParse(body);

  if (!result.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: result.error.issues,
    });
  }

  const { openfgaApiUrl, storeId, authorizationModelId } = result.data;

  logger.info({ openfgaApiUrl, storeId }, 'Testing connection to OpenFGA');

  try {
    // Test connection to OpenFGA
    const response = await fetch(`${openfgaApiUrl}/stores/${storeId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new HTTPException(response.status as 400 | 401 | 403 | 404 | 500 | 502, {
        message: (error as { message?: string }).message || 'Failed to connect to OpenFGA',
      });
    }

    const store = (await response.json()) as { id: string; name: string };

    return c.json({
      success: true,
      message: 'Connection successful',
      store: {
        id: store.id,
        name: store.name,
      },
      model: authorizationModelId ? { id: authorizationModelId } : null,
    });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    logger.error({ error }, 'Connection test failed');
    throw new HTTPException(502, {
      message: 'Failed to connect to OpenFGA. Please check the URL and try again.',
    });
  }
});

// GET /api/console/config
consoleRoutes.get('/config', (c) => {
  return c.json({
    features: {
      dslEditor: true,
      jsonEditor: true,
      visualBuilder: true,
      bulkImport: true,
      streamedListObjects: false,
      dslTransformer: true,
    },
    limits: {
      maxTuplesPerWrite: 100,
      maxBulkImportSize: 10000,
      maxContextualTuples: 100,
    },
  });
});

// POST /api/console/transform/dsl-to-json
const dslToJsonSchema = z.object({
  dsl: z.string().min(1),
});

consoleRoutes.post('/transform/dsl-to-json', async (c) => {
  const body = await c.req.json();
  const result = dslToJsonSchema.safeParse(body);

  if (!result.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: result.error.issues,
    });
  }

  try {
    const json = transformer.transformDSLToJSONObject(result.data.dsl);
    return c.json({
      success: true,
      json,
    });
  } catch (error) {
    logger.error({ error }, 'DSL to JSON transformation failed');
    throw new HTTPException(400, {
      message: `DSL parsing error: ${(error as Error).message}`,
    });
  }
});

// POST /api/console/transform/json-to-dsl
const jsonToDslSchema = z.object({
  json: z.object({
    schema_version: z.string(),
    type_definitions: z.array(z.any()),
    conditions: z.array(z.any()).optional(),
  }),
});

consoleRoutes.post('/transform/json-to-dsl', async (c) => {
  const body = await c.req.json();
  const result = jsonToDslSchema.safeParse(body);

  if (!result.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: result.error.issues,
    });
  }

  try {
    // Cast to expected type - the zod schema validates the structure
    const model = result.data.json as Parameters<typeof transformer.transformJSONToDSL>[0];
    const dsl = transformer.transformJSONToDSL(model);
    return c.json({
      success: true,
      dsl,
    });
  } catch (error) {
    logger.error({ error }, 'JSON to DSL transformation failed');
    throw new HTTPException(400, {
      message: `JSON to DSL error: ${(error as Error).message}`,
    });
  }
});

// POST /api/console/validate/dsl
consoleRoutes.post('/validate/dsl', async (c) => {
  const body = await c.req.json();
  const result = dslToJsonSchema.safeParse(body);

  if (!result.success) {
    throw new HTTPException(400, {
      message: 'Invalid request body',
      cause: result.error.issues,
    });
  }

  try {
    const json = transformer.transformDSLToJSONObject(result.data.dsl);
    return c.json({
      valid: true,
      typeCount: json.type_definitions?.length || 0,
      conditionCount: json.conditions?.length || 0,
    });
  } catch (error) {
    return c.json({
      valid: false,
      error: (error as Error).message,
    });
  }
});
