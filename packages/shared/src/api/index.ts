// API client utilities

export interface ApiClientConfig {
  baseUrl: string;
  storeId: string;
  authorizationModelId?: string;
  authToken?: string;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
}

export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  data: T[];
  continuation_token?: string;
}

// Request/Response helpers
export function buildTupleKey(
  object: string,
  relation: string,
  user: string
): { user: string; relation: string; object: string } {
  return { user, relation, object };
}

export function parseTupleString(tupleString: string): {
  type: string;
  id: string;
} | null {
  const match = tupleString.match(/^([^:]+):(.+)$/);
  if (!match) return null;
  return { type: match[1], id: match[2] };
}

export function formatTupleKey(object: string, relation: string, user: string): string {
  return `${user} is ${relation} of ${object}`;
}

// Validation helpers
export function isValidObjectFormat(object: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*:[^:]+$/.test(object);
}

export function isValidUserFormat(user: string): boolean {
  // user:id or type:id#relation or type:*
  return (
    /^[a-zA-Z_][a-zA-Z0-9_-]*:[^:#]+$/.test(user) ||
    /^[a-zA-Z_][a-zA-Z0-9_-]*:[^:#]+#[a-zA-Z_][a-zA-Z0-9_-]*$/.test(user) ||
    /^[a-zA-Z_][a-zA-Z0-9_-]*:\*$/.test(user)
  );
}

export function isValidRelationFormat(relation: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(relation);
}
