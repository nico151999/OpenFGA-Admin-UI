import type {
  AddChildrenRequest,
  AddChildrenResponse,
  HierarchySpec,
  ListChildrenRequest,
  ListChildrenResponse,
  ListParentsRequest,
  ListParentsResponse,
  RemoveChildrenRequest,
  RemoveChildrenResponse,
} from '@openfga-admin/shared';
import { useConnectionStore } from '@store/connectionStore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const GATEWAY_URL = import.meta.env.VITE_GATEWAY_URL || '';

// Helper to get auth headers
function useApiHeaders() {
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return {
    'Content-Type': 'application/json',
    'x-openfga-url': profile?.openfgaApiUrl || '',
    'x-openfga-store-id': profile?.storeId || '',
    'x-openfga-model-id': profile?.authorizationModelId || '',
  };
}

// Generic fetch wrapper
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { headers: Record<string, string> }
): Promise<T> {
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

// ============ Query Keys ============

const hierarchyKeys = {
  all: ['hierarchy'] as const,
  spec: () => [...hierarchyKeys.all, 'spec'] as const,
  scopeOptions: (edgeId: string) => [...hierarchyKeys.all, 'scopeOptions', edgeId] as const,
  parents: (edgeId: string, scopeObject?: string) =>
    [...hierarchyKeys.all, 'parents', edgeId, scopeObject] as const,
  children: (edgeId: string, parentObject: string) =>
    [...hierarchyKeys.all, 'children', edgeId, parentObject] as const,
};

// ============ Hooks ============

/**
 * Fetch the hierarchy spec (inferred edges) from the current model
 */
export function useHierarchySpec() {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: hierarchyKeys.spec(),
    queryFn: () =>
      apiFetch<HierarchySpec>('/api/console/hierarchy/spec', {
        method: 'GET',
        headers,
      }),
    enabled: !!profile?.openfgaApiUrl && !!profile?.storeId,
    staleTime: 60000, // 1 minute
  });
}

/**
 * Fetch scope options for an edge that supports scoped discovery
 */
export function useScopeOptions(edgeId: string, options?: { enabled?: boolean }) {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: hierarchyKeys.scopeOptions(edgeId),
    queryFn: () =>
      apiFetch<{ options: string[]; continuationToken?: string }>(
        '/api/console/hierarchy/list-scope-options',
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ edgeId, pageSize: 100 }),
        }
      ),
    enabled:
      options?.enabled !== false && !!profile?.openfgaApiUrl && !!profile?.storeId && !!edgeId,
  });
}

/**
 * Fetch parent objects for a hierarchy edge
 */
export function useHierarchyParents(
  edgeId: string,
  scopeObject?: string,
  options?: { enabled?: boolean }
) {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: hierarchyKeys.parents(edgeId, scopeObject),
    queryFn: () =>
      apiFetch<ListParentsResponse>('/api/console/hierarchy/list-parents', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          edgeId,
          scopeObject,
          pageSize: 100,
        } satisfies ListParentsRequest),
      }),
    enabled:
      options?.enabled !== false && !!profile?.openfgaApiUrl && !!profile?.storeId && !!edgeId,
  });
}

/**
 * Fetch children for a specific parent
 */
export function useHierarchyChildren(
  edgeId: string,
  parentObject: string,
  options?: { enabled?: boolean }
) {
  const headers = useApiHeaders();
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();

  return useQuery({
    queryKey: hierarchyKeys.children(edgeId, parentObject),
    queryFn: () =>
      apiFetch<ListChildrenResponse>('/api/console/hierarchy/list-children', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          edgeId,
          parentObject,
          pageSize: 100,
        } satisfies ListChildrenRequest),
      }),
    enabled:
      options?.enabled !== false &&
      !!profile?.openfgaApiUrl &&
      !!profile?.storeId &&
      !!edgeId &&
      !!parentObject,
  });
}

/**
 * Add children to a parent
 */
export function useAddChildren() {
  const headers = useApiHeaders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: AddChildrenRequest) =>
      apiFetch<AddChildrenResponse>('/api/console/hierarchy/add', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      // Invalidate children query for this parent
      queryClient.invalidateQueries({
        queryKey: hierarchyKeys.children(variables.edgeId, variables.parentObject),
      });
    },
  });
}

/**
 * Remove children from a parent
 */
export function useRemoveChildren() {
  const headers = useApiHeaders();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: RemoveChildrenRequest) =>
      apiFetch<RemoveChildrenResponse>('/api/console/hierarchy/remove', {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      }),
    onSuccess: (_, variables) => {
      // Invalidate children query for this parent
      queryClient.invalidateQueries({
        queryKey: hierarchyKeys.children(variables.edgeId, variables.parentObject),
      });
    },
  });
}
