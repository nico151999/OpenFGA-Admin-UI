import type {
  AuthorizationModel,
  CheckRequest,
  CheckResponse,
  ListObjectsRequest,
  ListObjectsResponse,
  ListUsersRequest,
  ListUsersResponse,
  Store,
  Tuple,
  TupleChange,
  TupleKey,
} from '@openfga-admin/shared';
import { useConnectionStore } from '@store/connectionStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:4000';

// Helper to get auth headers
function useApiHeaders() {
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return {
    'Content-Type': 'application/json',
    'x-openfga-url': profile?.openfgaApiUrl || '',
    'x-openfga-store-id': profile?.storeId || '',
  };
}

// Generic fetch wrapper
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { headers: Record<string, string> }
): Promise<T> {
  // Validate required headers before making request
  const openfgaUrl = options.headers['x-openfga-url'];
  const storeId = options.headers['x-openfga-store-id'];

  if (!openfgaUrl || !storeId) {
    throw new Error('Not connected to OpenFGA. Please connect first.');
  }

  const response = await fetch(`${GATEWAY_URL}${endpoint}`, options);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ============ Store Hooks ============

// Discover stores from an OpenFGA URL (used during connection setup)
// This goes through the gateway to avoid CORS issues
export function useStores(openfgaUrl?: string) {
  return useQuery({
    queryKey: ['discover-stores', openfgaUrl],
    queryFn: async () => {
      const response = await fetch(
        `${GATEWAY_URL}/api/console/discover-stores?url=${encodeURIComponent(openfgaUrl!)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch stores' }));
        throw new Error(error.message || 'Failed to fetch stores');
      }
      const data = await response.json();
      return data.stores as Store[];
    },
    enabled: !!openfgaUrl,
    retry: 1,
  });
}

// Discover authorization models for a store (used during connection setup)
export function useDiscoverModels(openfgaUrl?: string, storeId?: string) {
  return useQuery({
    queryKey: ['discover-models', openfgaUrl, storeId],
    queryFn: async () => {
      const response = await fetch(
        `${GATEWAY_URL}/api/console/discover-models?url=${encodeURIComponent(openfgaUrl!)}&storeId=${encodeURIComponent(storeId!)}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch models' }));
        throw new Error(error.message || 'Failed to fetch models');
      }
      const data = await response.json();
      return data.authorization_models as AuthorizationModel[];
    },
    enabled: !!openfgaUrl && !!storeId,
    retry: 1,
  });
}

// ============ Authorization Model Hooks ============

export function useAuthorizationModels() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: ['models', profile?.storeId],
    queryFn: async () => {
      const data = await apiFetch<{ authorization_models: AuthorizationModel[] }>(
        `/api/openfga/stores/${profile?.storeId}/authorization-models`,
        { method: 'GET', headers }
      );
      return data.authorization_models;
    },
    enabled: !!profile?.storeId,
  });
}

export function useAuthorizationModel(modelId?: string) {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  const effectiveModelId = modelId || profile?.authorizationModelId;

  return useQuery({
    queryKey: ['model', profile?.storeId, effectiveModelId],
    queryFn: async () => {
      if (!effectiveModelId) {
        // Get latest model
        const data = await apiFetch<{ authorization_models: AuthorizationModel[] }>(
          `/api/openfga/stores/${profile?.storeId}/authorization-models?page_size=1`,
          { method: 'GET', headers }
        );
        return data.authorization_models[0];
      }
      const data = await apiFetch<{ authorization_model: AuthorizationModel }>(
        `/api/openfga/stores/${profile?.storeId}/authorization-models/${effectiveModelId}`,
        { method: 'GET', headers }
      );
      return data.authorization_model;
    },
    enabled: !!profile?.storeId,
  });
}

export function useWriteAuthorizationModel() {
  const queryClient = useQueryClient();
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async (model: Omit<AuthorizationModel, 'id'>) => {
      if (!profile?.storeId) {
        throw new Error('Not connected to OpenFGA. Please connect first.');
      }
      const data = await apiFetch<{ authorization_model_id: string }>(
        `/api/openfga/stores/${profile.storeId}/authorization-models`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(model),
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', profile?.storeId] });
      queryClient.invalidateQueries({ queryKey: ['model', profile?.storeId] });
    },
  });
}

// ============ Tuple Hooks ============

interface ReadTuplesParams {
  tupleKey?: Partial<TupleKey>;
  pageSize?: number;
  continuationToken?: string;
}

interface ReadTuplesResponse {
  tuples: Tuple[];
  continuation_token?: string;
}

export function useTuples(params: ReadTuplesParams = {}) {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: ['tuples', profile?.storeId, params],
    queryFn: async () => {
      const body: Record<string, unknown> = {};

      // OpenFGA Read API REQUIRES the 'object' field (at minimum the type like "document:")
      // if tuple_key is provided. We can only use server-side filtering when object is specified.
      // For user-only or relation-only filtering, we must filter client-side.
      if (params.tupleKey?.object) {
        const tupleKey: Partial<TupleKey> = {
          object: params.tupleKey.object,
        };
        // user and relation are optional filters when object is provided
        if (params.tupleKey.user) tupleKey.user = params.tupleKey.user;
        if (params.tupleKey.relation) tupleKey.relation = params.tupleKey.relation;
        body.tuple_key = tupleKey;
      }

      if (params.pageSize) {
        body.page_size = params.pageSize;
      }
      if (params.continuationToken) {
        body.continuation_token = params.continuationToken;
      }

      const response = await apiFetch<ReadTuplesResponse>(
        `/api/openfga/stores/${profile?.storeId}/read`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        }
      );

      // Client-side filtering for user and relation when object is not specified
      // This is necessary because OpenFGA Read API requires object for server-side filtering
      if (!params.tupleKey?.object && (params.tupleKey?.user || params.tupleKey?.relation)) {
        let filteredTuples = response.tuples;

        if (params.tupleKey?.user) {
          const userFilter = params.tupleKey.user.toLowerCase();
          filteredTuples = filteredTuples.filter((t) =>
            t.key.user.toLowerCase().includes(userFilter)
          );
        }
        if (params.tupleKey?.relation) {
          const relationFilter = params.tupleKey.relation.toLowerCase();
          filteredTuples = filteredTuples.filter((t) =>
            t.key.relation.toLowerCase().includes(relationFilter)
          );
        }

        return {
          ...response,
          tuples: filteredTuples,
        };
      }

      return response;
    },
    enabled: !!profile?.storeId,
  });
}

interface WriteTuplesParams {
  writes?: TupleKey[];
  deletes?: TupleKey[];
}

export function useWriteTuples() {
  const queryClient = useQueryClient();
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async ({ writes, deletes }: WriteTuplesParams) => {
      const body: Record<string, unknown> = {};
      if (writes?.length) {
        body.writes = { tuple_keys: writes };
      }
      if (deletes?.length) {
        body.deletes = { tuple_keys: deletes };
      }

      return apiFetch<Record<string, never>>(`/api/openfga/stores/${profile?.storeId}/write`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tuples', profile?.storeId] });
      queryClient.invalidateQueries({ queryKey: ['changes', profile?.storeId] });
    },
  });
}

// ============ Changes Hooks ============

interface ChangesParams {
  type?: string;
  pageSize?: number;
  continuationToken?: string;
}

interface ChangesResponse {
  changes: TupleChange[];
  continuation_token?: string;
}

export function useChanges(params: ChangesParams = {}) {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: ['changes', profile?.storeId, params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.type) searchParams.set('type', params.type);
      if (params.pageSize) searchParams.set('page_size', String(params.pageSize));
      if (params.continuationToken)
        searchParams.set('continuation_token', params.continuationToken);

      const queryString = searchParams.toString();
      return apiFetch<ChangesResponse>(
        `/api/openfga/stores/${profile?.storeId}/changes${queryString ? `?${queryString}` : ''}`,
        { method: 'GET', headers }
      );
    },
    enabled: !!profile?.storeId,
  });
}

// ============ Query Hooks ============

export function useCheck() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async (request: CheckRequest) => {
      return apiFetch<CheckResponse>(`/api/openfga/stores/${profile?.storeId}/check`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
    },
  });
}

interface BatchCheckRequest {
  checks: CheckRequest[];
}

interface BatchCheckResponse {
  result: Record<string, { allowed: boolean; error?: string }>;
}

export function useBatchCheck() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async (request: BatchCheckRequest) => {
      return apiFetch<BatchCheckResponse>(`/api/openfga/stores/${profile?.storeId}/batch-check`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
    },
  });
}

export function useListObjects() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async (request: ListObjectsRequest) => {
      return apiFetch<ListObjectsResponse>(`/api/openfga/stores/${profile?.storeId}/list-objects`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
    },
  });
}

export function useListUsers() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async (request: ListUsersRequest) => {
      return apiFetch<ListUsersResponse>(`/api/openfga/stores/${profile?.storeId}/list-users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
    },
  });
}

interface ExpandRequest {
  tuple_key: {
    relation: string;
    object: string;
  };
  authorization_model_id?: string;
}

interface ExpandResponse {
  tree: ExpandNode;
}

interface ExpandNode {
  root?: {
    name: string;
    leaf?: {
      users: {
        users: Array<{
          object?: { type: string; id: string };
          userset?: { type: string; id: string; relation: string };
        }>;
      };
    };
    union?: { nodes: ExpandNode[] };
    intersection?: { nodes: ExpandNode[] };
    difference?: { base: ExpandNode; subtract: ExpandNode };
  };
}

export function useExpand() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useMutation({
    mutationFn: async (request: ExpandRequest) => {
      return apiFetch<ExpandResponse>(`/api/openfga/stores/${profile?.storeId}/expand`, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });
    },
  });
}

// ============ Test Connection ============

export function useTestConnection() {
  return useMutation({
    mutationFn: async (params: {
      openfgaApiUrl: string;
      storeId: string;
      authorizationModelId?: string;
    }) => {
      const response = await fetch(`${GATEWAY_URL}/api/console/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Connection failed' }));
        throw new Error(error.message);
      }

      return response.json();
    },
  });
}

// ============ DSL Transformation ============

export function useTransformDSLToJSON() {
  return useMutation({
    mutationFn: async (dsl: string) => {
      const response = await fetch(`${GATEWAY_URL}/api/console/transform/dsl-to-json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsl }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Transformation failed' }));
        throw new Error(error.message);
      }

      const result = await response.json();
      return result.json as Omit<AuthorizationModel, 'id'>;
    },
  });
}

export function useTransformJSONToDSL() {
  return useMutation({
    mutationFn: async (json: Omit<AuthorizationModel, 'id'>) => {
      const response = await fetch(`${GATEWAY_URL}/api/console/transform/json-to-dsl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ json }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Transformation failed' }));
        throw new Error(error.message);
      }

      const result = await response.json();
      return result.dsl as string;
    },
  });
}

export function useValidateDSL() {
  return useMutation({
    mutationFn: async (dsl: string) => {
      const response = await fetch(`${GATEWAY_URL}/api/console/validate/dsl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dsl }),
      });

      if (!response.ok) {
        throw new Error('Validation request failed');
      }

      return response.json() as Promise<{
        valid: boolean;
        typeCount?: number;
        conditionCount?: number;
        error?: string;
      }>;
    },
  });
}
