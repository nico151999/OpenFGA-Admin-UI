// OpenFGA API Types (subset for console use)
// Full types should be generated from swagger

export interface Store {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface AuthorizationModel {
  id: string;
  schema_version: string;
  type_definitions: TypeDefinition[];
  conditions?: Record<string, Condition>;
}

export interface TypeDefinition {
  type: string;
  relations?: Record<string, Userset>;
  metadata?: TypeDefinitionMetadata;
}

export interface TypeDefinitionMetadata {
  relations?: Record<string, RelationMetadata>;
  module?: string;
  source_info?: SourceInfo;
}

export interface RelationMetadata {
  directly_related_user_types?: RelationReference[];
  module?: string;
  source_info?: SourceInfo;
}

export interface RelationReference {
  type: string;
  relation?: string;
  wildcard?: Record<string, never>;
  condition?: string;
}

export interface SourceInfo {
  file?: string;
}

export interface Userset {
  this?: Record<string, never>;
  computedUserset?: { relation: string };
  tupleToUserset?: {
    tupleset: { relation: string };
    computedUserset: { relation: string };
  };
  union?: { child: Userset[] };
  intersection?: { child: Userset[] };
  difference?: { base: Userset; subtract: Userset };
}

export interface Condition {
  name: string;
  expression: string;
  parameters?: Record<string, ConditionParamTypeRef>;
  metadata?: ConditionMetadata;
}

export interface ConditionParamTypeRef {
  type_name: string;
  generic_types?: ConditionParamTypeRef[];
}

export interface ConditionMetadata {
  module?: string;
  source_info?: SourceInfo;
}

// Tuple Types
export interface TupleKey {
  user: string;
  relation: string;
  object: string;
  condition?: RelationshipCondition;
}

export interface RelationshipCondition {
  name: string;
  context?: Record<string, unknown>;
}

export interface Tuple {
  key: TupleKey;
  timestamp: string;
}

export interface TupleChange {
  tuple_key: TupleKey;
  operation: 'TUPLE_OPERATION_WRITE' | 'TUPLE_OPERATION_DELETE';
  timestamp: string;
}

// Query Types
export interface CheckRequest {
  tuple_key: {
    user: string;
    relation: string;
    object: string;
  };
  contextual_tuples?: { tuple_keys: TupleKey[] };
  context?: Record<string, unknown>;
  authorization_model_id?: string;
  consistency?: 'UNSPECIFIED' | 'MINIMIZE_LATENCY' | 'HIGHER_CONSISTENCY';
}

export interface CheckResponse {
  allowed: boolean;
  resolution?: string;
}

export interface ListObjectsRequest {
  user: string;
  relation: string;
  type: string;
  contextual_tuples?: { tuple_keys: TupleKey[] };
  context?: Record<string, unknown>;
  authorization_model_id?: string;
}

export interface ListObjectsResponse {
  objects: string[];
}

export interface ListUsersRequest {
  object: { type: string; id: string };
  relation: string;
  user_filters: UserTypeFilter[];
  contextual_tuples?: { tuple_keys: TupleKey[] };
  context?: Record<string, unknown>;
  authorization_model_id?: string;
}

export interface UserTypeFilter {
  type: string;
  relation?: string;
}

export interface ListUsersResponse {
  users: User[];
}

export interface User {
  object?: { type: string; id: string };
  userset?: { type: string; id: string; relation: string };
  wildcard?: { type: string };
}

export interface ExpandRequest {
  tuple_key: {
    relation: string;
    object: string;
  };
  authorization_model_id?: string;
}

export interface ExpandResponse {
  tree?: UsersetTree;
}

export interface UsersetTree {
  root?: UsersetTreeNode;
}

export interface UsersetTreeNode {
  name: string;
  leaf?: {
    users?: { users: string[] };
    computed?: { userset: string };
    tupleToUserset?: { tupleset: string; computed: UsersetTreeNode[] };
  };
  difference?: {
    base: UsersetTreeNode;
    subtract: UsersetTreeNode;
  };
  union?: { nodes: UsersetTreeNode[] };
  intersection?: { nodes: UsersetTreeNode[] };
}

// Error Types
export interface OpenFGAError {
  code: string;
  message: string;
  details?: unknown;
}

export * from './hierarchy';
export * from './manifest';
