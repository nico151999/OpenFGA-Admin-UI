import {
  type AuthorizationModel,
  findEdgeById,
  type HierarchySpec,
  inferHierarchyEdges,
} from '@openfga-admin/shared';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { logger } from '../utils/logger';

export const hierarchyRoutes = new Hono();

// ============ Helper Functions ============

/**
 * Get the current authorization model from OpenFGA
 */
async function getCurrentModel(
  openfgaUrl: string,
  storeId: string,
  modelId?: string
): Promise<AuthorizationModel> {
  let url: string;

  if (modelId) {
    url = `${openfgaUrl}/stores/${storeId}/authorization-models/${modelId}`;
  } else {
    // Get latest model
    url = `${openfgaUrl}/stores/${storeId}/authorization-models?page_size=1`;
  }

  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new HTTPException(response.status as 400, {
      message: `Failed to get authorization model: ${error}`,
    });
  }

  const data = (await response.json()) as {
    authorization_models?: AuthorizationModel[];
    authorization_model?: AuthorizationModel;
  };

  // If we got the list endpoint, extract the first model
  if (data.authorization_models) {
    if (data.authorization_models.length === 0) {
      throw new HTTPException(404, { message: 'No authorization models found' });
    }
    return data.authorization_models[0];
  }

  return data.authorization_model!;
}

/**
 * Read tuples from OpenFGA
 */
async function readTuples(
  openfgaUrl: string,
  storeId: string,
  tupleKey: { object?: string; relation?: string; user?: string },
  pageSize?: number,
  continuationToken?: string
): Promise<{
  tuples: Array<{ key: { user: string; relation: string; object: string }; timestamp: string }>;
  continuation_token?: string;
}> {
  const body: Record<string, unknown> = {
    tuple_key: tupleKey,
  };

  if (pageSize) {
    body.page_size = pageSize;
  }
  if (continuationToken) {
    body.continuation_token = continuationToken;
  }

  const response = await fetch(`${openfgaUrl}/stores/${storeId}/read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new HTTPException(response.status as 400, {
      message: `Read failed: ${error}`,
    });
  }

  return response.json() as Promise<{
    tuples: Array<{ key: { user: string; relation: string; object: string }; timestamp: string }>;
    continuation_token?: string;
  }>;
}

/**
 * Write tuples to OpenFGA
 */
async function writeTuples(
  openfgaUrl: string,
  storeId: string,
  writes?: Array<{ user: string; relation: string; object: string }>,
  deletes?: Array<{ user: string; relation: string; object: string }>,
  options?: { onDuplicateIgnore?: boolean; onMissingIgnore?: boolean }
): Promise<void> {
  const body: Record<string, unknown> = {};

  if (writes && writes.length > 0) {
    body.writes = {
      tuple_keys: writes,
    };
  }

  if (deletes && deletes.length > 0) {
    body.deletes = {
      tuple_keys: deletes,
    };
  }

  const response = await fetch(`${openfgaUrl}/stores/${storeId}/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');

    // Check if this is a 400 error we can potentially ignore
    if (response.status === 400) {
      const isDuplicateError = error.includes('cannot write a tuple which already exists');
      const isMissingError = error.includes('cannot delete a tuple which does not exist');

      // Only ignore if it's specifically the error type we want to ignore
      if (options?.onDuplicateIgnore && isDuplicateError) {
        return; // Silently ignore duplicate
      }
      if (options?.onMissingIgnore && isMissingError) {
        return; // Silently ignore missing on delete
      }
    }

    // Throw for all other errors
    const operation = writes && writes.length > 0 ? 'Write' : 'Delete';
    throw new HTTPException(response.status as 400, { message: `${operation} failed: ${error}` });
  }
}

/**
 * Batch check permissions
 */
async function batchCheck(
  openfgaUrl: string,
  storeId: string,
  checks: Array<{ user: string; relation: string; object: string }>
): Promise<Map<string, boolean>> {
  const response = await fetch(`${openfgaUrl}/stores/${storeId}/batch-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      checks: checks.map((c, i) => ({
        tuple_key: c,
        correlation_id: `check-${i}`,
      })),
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new HTTPException(response.status as 400, { message: `BatchCheck failed: ${error}` });
  }

  const data = (await response.json()) as {
    result?: Array<{ correlation_id?: string; allowed?: boolean }>;
  };
  const results = new Map<string, boolean>();

  for (const result of data.result || []) {
    const checkIndex = Number.parseInt(result.correlation_id?.replace('check-', '') || '0', 10);
    const key = `${checks[checkIndex].user}|${checks[checkIndex].relation}|${checks[checkIndex].object}`;
    results.set(key, result.allowed === true);
  }

  return results;
}

// ============ Schema Definitions ============

const listParentsSchema = z.object({
  edgeId: z.string(),
  scopeObject: z.string().optional(),
  pageSize: z.number().optional(),
  continuationToken: z.string().optional(),
});

const listChildrenSchema = z.object({
  edgeId: z.string(),
  parentObject: z.string(),
  pageSize: z.number().optional(),
  continuationToken: z.string().optional(),
});

const addChildrenSchema = z.object({
  edgeId: z.string(),
  parentObject: z.string(),
  children: z.array(z.string()),
  options: z
    .object({
      ensurePlatformMembership: z.boolean().optional(),
    })
    .optional(),
});

const removeChildrenSchema = z.object({
  edgeId: z.string(),
  parentObject: z.string(),
  children: z.array(z.string()),
});

const listScopeOptionsSchema = z.object({
  edgeId: z.string(),
  pageSize: z.number().optional(),
  continuationToken: z.string().optional(),
});

// ============ Cache for hierarchy spec ============

let cachedSpec: { spec: HierarchySpec; modelId: string; timestamp: number } | null = null;
const CACHE_TTL = 60000; // 1 minute

// ============ Routes ============

/**
 * GET /api/console/hierarchy/spec
 * Returns inferred hierarchy edges from the current model
 */
hierarchyRoutes.get('/spec', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const modelId = c.req.header('x-openfga-model-id');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  // Check cache
  if (
    cachedSpec &&
    modelId === cachedSpec.modelId &&
    Date.now() - cachedSpec.timestamp < CACHE_TTL
  ) {
    return c.json(cachedSpec.spec);
  }

  logger.info({ storeId, modelId }, 'Inferring hierarchy edges from model');

  const model = await getCurrentModel(openfgaUrl, storeId, modelId);
  const spec = inferHierarchyEdges(model);

  // Update cache
  cachedSpec = { spec, modelId: model.id, timestamp: Date.now() };

  logger.info({ edges: spec.edges.length }, 'Inferred hierarchy edges');

  return c.json(spec);
});

/**
 * POST /api/console/hierarchy/list-scope-options
 * List available scope objects for an edge that supports scoped discovery
 */
hierarchyRoutes.post('/list-scope-options', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const modelId = c.req.header('x-openfga-model-id');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  const body = await c.req.json();
  const parsed = listScopeOptionsSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` });
  }

  const { edgeId, pageSize, continuationToken } = parsed.data;

  // Get hierarchy spec
  const model = await getCurrentModel(openfgaUrl, storeId, modelId);
  const spec = inferHierarchyEdges(model);
  const edge = findEdgeById(spec.edges, edgeId);

  if (!edge) {
    throw new HTTPException(404, { message: `Hierarchy edge not found: ${edgeId}` });
  }

  if (!edge.discoveryHint?.supportsScoped || !edge.discoveryHint?.scopeType) {
    return c.json({ options: [], continuationToken: undefined });
  }

  // Use Changes API to list all objects of the scope type
  const result = await listChanges(
    openfgaUrl,
    storeId,
    edge.discoveryHint.scopeType,
    pageSize || 100,
    continuationToken
  );

  // Extract unique scope objects from WRITE operations
  const optionsSet = new Set<string>();

  for (const change of result.changes) {
    if (change.operation === 'TUPLE_OPERATION_WRITE') {
      optionsSet.add(change.tuple_key.object);
    }
  }

  return c.json({
    options: [...optionsSet],
    continuationToken: result.continuation_token,
  });
});

/**
 * Read changes/tuples from OpenFGA to discover objects
 * This uses the Changes API which can list all tuples that have been written
 */
async function listChanges(
  openfgaUrl: string,
  storeId: string,
  type: string,
  pageSize?: number,
  continuationToken?: string
): Promise<{
  changes: Array<{
    tuple_key: { user: string; relation: string; object: string };
    operation: string;
    timestamp: string;
  }>;
  continuation_token?: string;
}> {
  const params = new URLSearchParams();
  params.set('type', type);
  if (pageSize) params.set('page_size', String(pageSize));
  if (continuationToken) params.set('continuation_token', continuationToken);

  const response = await fetch(`${openfgaUrl}/stores/${storeId}/changes?${params}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const error = await response.text().catch(() => 'Unknown error');
    throw new HTTPException(response.status as 400, {
      message: `ListChanges failed: ${error}`,
    });
  }

  return response.json() as Promise<{
    changes: Array<{
      tuple_key: { user: string; relation: string; object: string };
      operation: string;
      timestamp: string;
    }>;
    continuation_token?: string;
  }>;
}

/**
 * POST /api/console/hierarchy/list-parents
 * List parent objects for a hierarchy edge
 */
hierarchyRoutes.post('/list-parents', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const modelId = c.req.header('x-openfga-model-id');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  const body = await c.req.json();
  const parsed = listParentsSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` });
  }

  const { edgeId, scopeObject, pageSize, continuationToken } = parsed.data;

  // Get hierarchy spec
  const model = await getCurrentModel(openfgaUrl, storeId, modelId);
  const spec = inferHierarchyEdges(model);
  const edge = findEdgeById(spec.edges, edgeId);

  if (!edge) {
    throw new HTTPException(404, { message: `Hierarchy edge not found: ${edgeId}` });
  }

  // If we have a scope object and the edge supports scoped discovery, use Read API
  if (scopeObject && edge.discoveryHint?.supportsScoped) {
    const tupleKey = {
      object: `${edge.parentType}:`,
      relation: edge.discoveryHint.scopeRelation,
      user: scopeObject,
    };

    const result = await readTuples(
      openfgaUrl,
      storeId,
      tupleKey,
      pageSize || 100,
      continuationToken
    );
    const parents = result.tuples.map((t) => t.key.object);

    return c.json({
      parents: [...new Set(parents)],
      continuationToken: result.continuation_token,
    });
  }

  // Otherwise, use the Changes API to discover parent objects
  // This lists all changes for the parent type and extracts unique objects with the relevant relation
  const targetType = edge.kind === 'parent-membership' ? edge.parentType : edge.childType;
  const targetRelation =
    edge.kind === 'parent-membership' ? edge.parentRelation : edge.childRelationToParent;

  logger.debug({ targetType, targetRelation, edgeId }, 'Using Changes API to discover parents');

  const result = await listChanges(
    openfgaUrl,
    storeId,
    targetType,
    pageSize || 100,
    continuationToken
  );

  // Filter to only the relevant relation and extract unique parents
  const parentsSet = new Set<string>();

  for (const change of result.changes) {
    if (
      change.operation === 'TUPLE_OPERATION_WRITE' &&
      change.tuple_key.relation === targetRelation
    ) {
      if (edge.kind === 'parent-membership') {
        // For membership edges, the parent is the object
        parentsSet.add(change.tuple_key.object);
      } else {
        // For pointer edges, the parent is the user
        parentsSet.add(change.tuple_key.user);
      }
    }
  }

  return c.json({
    parents: [...parentsSet],
    continuationToken: result.continuation_token,
  });
});

/**
 * POST /api/console/hierarchy/list-children
 * List children for a specific parent
 */
hierarchyRoutes.post('/list-children', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const modelId = c.req.header('x-openfga-model-id');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  const body = await c.req.json();
  const parsed = listChildrenSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` });
  }

  const { edgeId, parentObject, pageSize, continuationToken } = parsed.data;

  // Get hierarchy spec
  const model = await getCurrentModel(openfgaUrl, storeId, modelId);
  const spec = inferHierarchyEdges(model);
  const edge = findEdgeById(spec.edges, edgeId);

  if (!edge) {
    throw new HTTPException(404, { message: `Hierarchy edge not found: ${edgeId}` });
  }

  let tupleKey: { object?: string; relation?: string; user?: string };

  if (edge.kind === 'parent-membership') {
    // Children are in tuple.user field
    // Read: { object: parentObject, relation: edge.parentRelation }
    tupleKey = {
      object: parentObject,
      relation: edge.parentRelation,
    };
  } else {
    // child-parent-pointer: children are in tuple.object field
    // Read: { object: `${edge.childType}:`, relation: edge.childRelationToParent, user: parentObject }
    tupleKey = {
      object: `${edge.childType}:`,
      relation: edge.childRelationToParent,
      user: parentObject,
    };
  }

  const result = await readTuples(openfgaUrl, storeId, tupleKey, pageSize || 50, continuationToken);

  // Extract child IDs from tuples based on edge kind
  const children = result.tuples.map((t) => ({
    id: edge.kind === 'parent-membership' ? t.key.user : t.key.object,
    condition: undefined, // TODO: extract condition if present
  }));

  return c.json({
    children,
    continuationToken: result.continuation_token,
  });
});

/**
 * POST /api/console/hierarchy/add
 * Add children to a parent
 */
hierarchyRoutes.post('/add', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const modelId = c.req.header('x-openfga-model-id');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  const body = await c.req.json();
  const parsed = addChildrenSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` });
  }

  const { edgeId, parentObject, children, options } = parsed.data;

  // Get hierarchy spec
  const model = await getCurrentModel(openfgaUrl, storeId, modelId);
  const spec = inferHierarchyEdges(model);
  const edge = findEdgeById(spec.edges, edgeId);

  if (!edge) {
    throw new HTTPException(404, { message: `Hierarchy edge not found: ${edgeId}` });
  }

  // Deduplicate children
  const uniqueChildren = [...new Set(children)];
  const errors: Array<{ child: string; error: string }> = [];
  let platformMembershipsAdded = 0;

  // Build tuple keys based on edge kind
  const tuples: Array<{ user: string; relation: string; object: string }> = [];

  for (const child of uniqueChildren) {
    if (edge.kind === 'parent-membership') {
      tuples.push({
        object: parentObject,
        relation: edge.parentRelation,
        user: child,
      });
    } else {
      tuples.push({
        object: child,
        relation: edge.childRelationToParent,
        user: parentObject,
      });
    }
  }

  // Optional: ensure platform membership for group→user
  if (options?.ensurePlatformMembership && edge.kind === 'parent-membership') {
    try {
      // Find the parent's platform
      const platformResult = await readTuples(openfgaUrl, storeId, {
        object: parentObject,
        relation: 'platform',
      });

      if (platformResult.tuples.length > 0) {
        const platformId = platformResult.tuples[0].key.user;

        // Check which users are NOT members of the platform
        const checks = uniqueChildren.map((child) => ({
          user: child,
          relation: 'member',
          object: platformId,
        }));

        const checkResults = await batchCheck(openfgaUrl, storeId, checks);

        // Add missing platform memberships
        for (const child of uniqueChildren) {
          const key = `${child}|member|${platformId}`;
          if (!checkResults.get(key)) {
            tuples.push({
              object: platformId,
              relation: 'member',
              user: child,
            });
            platformMembershipsAdded++;
          }
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to ensure platform membership');
    }
  }

  // Write tuples (in batches of 100 to avoid hitting limits)
  const batchSize = 100;
  let added = 0;

  for (let i = 0; i < tuples.length; i += batchSize) {
    const batch = tuples.slice(i, i + batchSize);

    try {
      await writeTuples(openfgaUrl, storeId, batch, undefined, { onDuplicateIgnore: true });
      added += batch.length;
    } catch (error) {
      // Record errors for this batch
      for (const tuple of batch) {
        const childId = edge.kind === 'parent-membership' ? tuple.user : tuple.object;
        errors.push({
          child: childId,
          error: (error as Error).message,
        });
      }
    }
  }

  logger.info({ edgeId, parentObject, added, errors: errors.length }, 'Added children to parent');

  return c.json({
    added: added - errors.length,
    platformMembershipsAdded,
    errors,
  });
});

/**
 * POST /api/console/hierarchy/remove
 * Remove children from a parent
 */
hierarchyRoutes.post('/remove', async (c) => {
  const openfgaUrl = c.req.header('x-openfga-url');
  const storeId = c.req.header('x-openfga-store-id');
  const modelId = c.req.header('x-openfga-model-id');

  if (!openfgaUrl || !storeId) {
    throw new HTTPException(400, {
      message: 'Missing required headers: x-openfga-url and x-openfga-store-id',
    });
  }

  const body = await c.req.json();
  const parsed = removeChildrenSchema.safeParse(body);

  if (!parsed.success) {
    throw new HTTPException(400, { message: `Invalid request: ${parsed.error.message}` });
  }

  const { edgeId, parentObject, children } = parsed.data;

  // Get hierarchy spec
  const model = await getCurrentModel(openfgaUrl, storeId, modelId);
  const spec = inferHierarchyEdges(model);
  const edge = findEdgeById(spec.edges, edgeId);

  if (!edge) {
    throw new HTTPException(404, { message: `Hierarchy edge not found: ${edgeId}` });
  }

  // Deduplicate children
  const uniqueChildren = [...new Set(children)];
  const errors: Array<{ child: string; error: string }> = [];

  // Build tuple keys for deletion based on edge kind
  const tuples: Array<{ user: string; relation: string; object: string }> = [];

  for (const child of uniqueChildren) {
    if (edge.kind === 'parent-membership') {
      tuples.push({
        object: parentObject,
        relation: edge.parentRelation,
        user: child,
      });
    } else {
      tuples.push({
        object: child,
        relation: edge.childRelationToParent,
        user: parentObject,
      });
    }
  }

  // Delete tuples (in batches of 100)
  const batchSize = 100;
  let removed = 0;

  for (let i = 0; i < tuples.length; i += batchSize) {
    const batch = tuples.slice(i, i + batchSize);

    try {
      await writeTuples(openfgaUrl, storeId, undefined, batch, { onMissingIgnore: true });
      removed += batch.length;
    } catch (error) {
      // Record errors for this batch
      for (const tuple of batch) {
        const childId = edge.kind === 'parent-membership' ? tuple.user : tuple.object;
        errors.push({
          child: childId,
          error: (error as Error).message,
        });
      }
    }
  }

  logger.info(
    { edgeId, parentObject, removed, errors: errors.length },
    'Removed children from parent'
  );

  return c.json({
    removed: removed - errors.length,
    errors,
  });
});
