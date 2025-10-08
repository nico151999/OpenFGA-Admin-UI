/**
 * Hierarchy Types for Grouped Permissions
 *
 * These types represent inferred parent-child relationships in an OpenFGA model.
 * They are computed at runtime from the model, not persisted.
 */

/**
 * Represents a detected parent-child relationship in the authorization model.
 */
export type HierarchyEdge = ParentMembershipEdge | ChildParentPointerEdge;

/**
 * Pattern A: Membership on the parent (e.g., group.member → user)
 * Tuples are written as: parent#relation@child
 * Example: group:marketing#member@user:anne
 */
export interface ParentMembershipEdge {
  id: string;
  kind: 'parent-membership';
  /** The parent type (e.g., "group") */
  parentType: string;
  /** The relation on the parent that holds children (e.g., "member") */
  parentRelation: string;
  /** The child type (e.g., "user") */
  childType: string;
  /** Children are in the tuple.user field */
  childRefKind: 'subject';
  /** Hints for discovering parent instances */
  discoveryHint?: DiscoveryHint;
}

/**
 * Pattern B: Parent pointer on the child (e.g., file.parent → knowledge_base)
 * Tuples are written as: child#relation@parent
 * Example: file:doc-1#parent@knowledge_base:kb-123
 */
export interface ChildParentPointerEdge {
  id: string;
  kind: 'child-parent-pointer';
  /** The parent type (e.g., "knowledge_base") */
  parentType: string;
  /** The child type (e.g., "file") */
  childType: string;
  /** The relation on the child that points to parent (e.g., "parent") */
  childRelationToParent: string;
  /** Children are in the tuple.object field */
  childRefKind: 'object';
  /** Hints for discovering parent instances */
  discoveryHint?: DiscoveryHint;
}

/**
 * Hints for discovering parent objects via scoped queries
 */
export interface DiscoveryHint {
  /** If true, parents can be discovered via a scope relation */
  supportsScoped: boolean;
  /** The relation on the parent that links to a scope (e.g., "platform") */
  scopeRelation?: string;
  /** The expected scope type (e.g., "platform") */
  scopeType?: string;
}

/**
 * Result of hierarchy inference from a model
 */
export interface HierarchySpec {
  /** Detected hierarchy edges */
  edges: HierarchyEdge[];
  /** The model ID this was generated from */
  modelId: string;
  /** When this spec was generated */
  generatedAt: string;
}

// ============ API Request/Response Types ============

export interface ListParentsRequest {
  edgeId: string;
  scopeObject?: string;
  pageSize?: number;
  continuationToken?: string;
}

export interface ListParentsResponse {
  parents: string[];
  continuationToken?: string;
}

export interface ListChildrenRequest {
  edgeId: string;
  parentObject: string;
  pageSize?: number;
  continuationToken?: string;
}

export interface ChildItem {
  id: string;
  condition?: string;
}

export interface ListChildrenResponse {
  children: ChildItem[];
  continuationToken?: string;
}

export interface AddChildrenRequest {
  edgeId: string;
  parentObject: string;
  children: string[];
  options?: {
    /** For group→user: also ensure users are members of the group's platform */
    ensurePlatformMembership?: boolean;
  };
}

export interface AddChildrenResponse {
  added: number;
  platformMembershipsAdded?: number;
  errors: Array<{ child: string; error: string }>;
}

export interface RemoveChildrenRequest {
  edgeId: string;
  parentObject: string;
  children: string[];
}

export interface RemoveChildrenResponse {
  removed: number;
  errors: Array<{ child: string; error: string }>;
}
