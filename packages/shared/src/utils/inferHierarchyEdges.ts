/**
 * Hierarchy Edge Inference
 *
 * Analyzes an OpenFGA authorization model to detect structural parent-child
 * relationships that can be managed via the Grouped Permissions UI.
 */

import type { AuthorizationModel, RelationReference, TypeDefinition, Userset } from '../types';
import type {
  ChildParentPointerEdge,
  DiscoveryHint,
  HierarchyEdge,
  HierarchySpec,
  ParentMembershipEdge,
} from '../types/hierarchy';

/** Relation names that strongly signal membership/structural relations */
const MEMBERSHIP_RELATION_NAMES = new Set([
  'member',
  'members',
  'user',
  'users',
  'subscriber',
  'subscribers',
  'participant',
  'participants',
]);

/** Relation names that strongly signal parent pointer relations */
const PARENT_POINTER_RELATION_NAMES = new Set([
  'parent',
  'container',
  'folder',
  'owner',
  'belongs_to',
  'organization',
  'org',
  'workspace',
  'team',
]);

/** Types that are typically "leaf" types (users, not containers) */
const LEAF_TYPE_NAMES = new Set(['user', 'users', 'account', 'service_account', 'api_key']);

/** Relation names that indicate a scope/root container */
const SCOPE_RELATION_NAMES = new Set([
  'platform',
  'org',
  'organization',
  'workspace',
  'tenant',
  'root',
]);

/**
 * Infer hierarchy edges from an OpenFGA authorization model.
 * This is a pure function with no side effects.
 */
export function inferHierarchyEdges(model: AuthorizationModel): HierarchySpec {
  const edges: HierarchyEdge[] = [];
  const usersetReferences = collectUsersetReferences(model);

  // Build a set of all valid type names in the model
  const validTypes = new Set(model.type_definitions.map((td) => td.type));

  for (const typeDef of model.type_definitions) {
    // Skip leaf types as parents (users aren't parents of other things)
    if (LEAF_TYPE_NAMES.has(typeDef.type)) continue;

    if (!typeDef.relations) continue;

    for (const [relationName, _relationDef] of Object.entries(typeDef.relations)) {
      const directTypes = getDirectlyRelatedTypes(typeDef, relationName);

      // Skip if no direct types (computed-only relations)
      if (directTypes.length === 0) continue;

      // === Pattern A: Membership on Parent ===
      if (isLikelyMembershipRelation(relationName, typeDef.type, directTypes, usersetReferences)) {
        for (const childTypeRef of directTypes) {
          // Only consider simple type references (not usersets like group#member)
          if (childTypeRef.relation) continue;
          if (childTypeRef.wildcard) continue;

          // Validate that the child type exists in the model
          if (!validTypes.has(childTypeRef.type)) continue;

          const edge: ParentMembershipEdge = {
            id: `${typeDef.type}-${relationName}-${childTypeRef.type}`,
            kind: 'parent-membership',
            parentType: typeDef.type,
            parentRelation: relationName,
            childType: childTypeRef.type,
            childRefKind: 'subject',
            discoveryHint: inferDiscoveryHint(typeDef),
          };
          edges.push(edge);
        }
      }

      // === Pattern B: Parent Pointer on Child ===
      if (isLikelyParentPointerRelation(relationName, directTypes, typeDef)) {
        for (const parentTypeRef of directTypes) {
          if (parentTypeRef.relation) continue;
          if (parentTypeRef.wildcard) continue;

          // Validate that the parent type exists in the model
          if (!validTypes.has(parentTypeRef.type)) continue;

          // For parent pointers, we invert: the current type is the CHILD
          const parentTypeDef = model.type_definitions.find((td) => td.type === parentTypeRef.type);

          const edge: ChildParentPointerEdge = {
            id: `${parentTypeRef.type}-via-${typeDef.type}.${relationName}`,
            kind: 'child-parent-pointer',
            parentType: parentTypeRef.type,
            childType: typeDef.type,
            childRelationToParent: relationName,
            childRefKind: 'object',
            discoveryHint: parentTypeDef ? inferDiscoveryHint(parentTypeDef) : undefined,
          };
          edges.push(edge);
        }
      }
    }
  }

  // Deduplicate edges (same parent-child pair)
  const uniqueEdges = deduplicateEdges(edges);

  return {
    edges: uniqueEdges,
    modelId: model.id,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Collect all userset references in the model (e.g., "group#member" appearing as a subject type)
 * This helps identify structural relations that are referenced elsewhere.
 */
function collectUsersetReferences(model: AuthorizationModel): Set<string> {
  const refs = new Set<string>();

  for (const typeDef of model.type_definitions) {
    if (!typeDef.metadata?.relations) continue;

    for (const relMeta of Object.values(typeDef.metadata.relations)) {
      if (!relMeta.directly_related_user_types) continue;

      for (const typeRef of relMeta.directly_related_user_types) {
        if (typeRef.relation) {
          refs.add(`${typeRef.type}#${typeRef.relation}`);
        }
      }
    }
  }

  return refs;
}

/**
 * Get directly related user types for a relation from metadata.
 */
function getDirectlyRelatedTypes(
  typeDef: TypeDefinition,
  relationName: string
): RelationReference[] {
  const relMeta = typeDef.metadata?.relations?.[relationName];
  return relMeta?.directly_related_user_types || [];
}

/**
 * Check if a relation is likely a membership/structural relation (Pattern A).
 */
function isLikelyMembershipRelation(
  relationName: string,
  parentType: string,
  directTypes: RelationReference[],
  usersetReferences: Set<string>
): boolean {
  // Strong signal: relation name matches membership patterns
  if (MEMBERSHIP_RELATION_NAMES.has(relationName)) {
    return true;
  }

  // Strong signal: this type#relation is referenced as a userset elsewhere
  if (usersetReferences.has(`${parentType}#${relationName}`)) {
    return true;
  }

  // Weak signal: relation points to leaf types (users) and few other types
  const hasLeafChild = directTypes.some((dt) => LEAF_TYPE_NAMES.has(dt.type) && !dt.relation);
  if (hasLeafChild && directTypes.length <= 2) {
    return true;
  }

  return false;
}

/**
 * Check if a relation is likely a parent pointer (Pattern B).
 */
function isLikelyParentPointerRelation(
  relationName: string,
  directTypes: RelationReference[],
  typeDef: TypeDefinition
): boolean {
  // Strong signal: relation name matches parent pointer patterns
  if (PARENT_POINTER_RELATION_NAMES.has(relationName)) {
    return true;
  }

  // Strong signal: relation is used as tupleset in a tupleToUserset
  if (isUsedAsTupleset(relationName, typeDef)) {
    return true;
  }

  // Weak signal: single non-leaf type reference (likely a container reference)
  if (
    directTypes.length === 1 &&
    !directTypes[0].relation &&
    !LEAF_TYPE_NAMES.has(directTypes[0].type)
  ) {
    // Additional check: relation name suggests containment
    const containmentKeywords = ['parent', 'container', 'folder', 'org', 'team', 'workspace'];
    if (containmentKeywords.some((n) => relationName.toLowerCase().includes(n))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a relation is used as the tupleset in any tupleToUserset rewrite.
 */
function isUsedAsTupleset(relationName: string, typeDef: TypeDefinition): boolean {
  if (!typeDef.relations) return false;

  for (const relDef of Object.values(typeDef.relations)) {
    if (checkUsersetForTupleset(relDef, relationName)) {
      return true;
    }
  }
  return false;
}

/**
 * Recursively check a Userset for tupleToUserset using a specific tupleset relation.
 */
function checkUsersetForTupleset(userset: Userset, targetRelation: string): boolean {
  // Direct tupleToUserset
  if (userset.tupleToUserset?.tupleset?.relation === targetRelation) {
    return true;
  }

  // Check union children
  if (userset.union?.child) {
    for (const child of userset.union.child) {
      if (checkUsersetForTupleset(child, targetRelation)) return true;
    }
  }

  // Check intersection children
  if (userset.intersection?.child) {
    for (const child of userset.intersection.child) {
      if (checkUsersetForTupleset(child, targetRelation)) return true;
    }
  }

  // Check difference
  if (userset.difference) {
    if (checkUsersetForTupleset(userset.difference.base, targetRelation)) return true;
    if (checkUsersetForTupleset(userset.difference.subtract, targetRelation)) return true;
  }

  return false;
}

/**
 * Infer discovery hints for a type (how to list instances of this type).
 */
function inferDiscoveryHint(typeDef: TypeDefinition): DiscoveryHint | undefined {
  if (!typeDef.relations) return undefined;

  // Look for a scope/container relation (e.g., "platform", "org", "workspace")
  for (const relName of Object.keys(typeDef.relations)) {
    if (SCOPE_RELATION_NAMES.has(relName)) {
      const directTypes = getDirectlyRelatedTypes(typeDef, relName);
      if (directTypes.length === 1 && !directTypes[0].relation) {
        return {
          supportsScoped: true,
          scopeRelation: relName,
          scopeType: directTypes[0].type,
        };
      }
    }
  }

  return { supportsScoped: false };
}

/**
 * Deduplicate edges with same parent-child pair.
 * Prefers parent-membership over child-parent-pointer if both exist.
 */
function deduplicateEdges(edges: HierarchyEdge[]): HierarchyEdge[] {
  const seen = new Map<string, HierarchyEdge>();

  for (const edge of edges) {
    const key = `${edge.parentType}->${edge.kind === 'parent-membership' ? edge.childType : edge.childType}`;

    // Prefer parent-membership over child-parent-pointer if both exist
    const existing = seen.get(key);
    if (
      !existing ||
      (edge.kind === 'parent-membership' && existing.kind === 'child-parent-pointer')
    ) {
      seen.set(key, edge);
    }
  }

  return Array.from(seen.values());
}

/**
 * Find an edge by ID from a list of edges.
 */
export function findEdgeById(edges: HierarchyEdge[], edgeId: string): HierarchyEdge | undefined {
  return edges.find((e) => e.id === edgeId);
}

/**
 * Generate a human-readable label for a hierarchy edge.
 */
export function getEdgeLabel(edge: HierarchyEdge): string {
  const parentLabel = edge.parentType.charAt(0).toUpperCase() + edge.parentType.slice(1);
  const childLabel = edge.childType.charAt(0).toUpperCase() + edge.childType.slice(1);
  return `${parentLabel}s → ${childLabel}s`;
}
