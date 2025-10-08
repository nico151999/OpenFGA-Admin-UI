// SDUI Manifest Types

export interface SDUIManifest {
  version: string;
  nav: NavItem[];
  pages: Record<string, PageDefinition>;
  capabilities?: Capabilities;
}

export interface NavItem {
  id: string;
  title: string;
  page: string;
  icon?: string;
  children?: NavItem[];
}

export interface PageDefinition {
  title?: string;
  widgets: WidgetDefinition[];
}

export interface WidgetDefinition {
  type: WidgetType;
  props?: Record<string, unknown>;
}

export type WidgetType =
  // Dashboard widgets
  | 'StoreInfo'
  | 'QuickActions'
  | 'RecentItems'
  // Model widgets
  | 'ModelVersionSelector'
  | 'TypeDefinitionTree'
  | 'RelationViewer'
  | 'ConditionViewer'
  | 'ModelEditor'
  | 'ModelDiff'
  // Tuple widgets
  | 'TupleSearch'
  | 'TupleEditor'
  | 'TupleTable'
  | 'BulkImport'
  | 'BulkExport'
  // Explorer widgets
  | 'CheckForm'
  | 'BatchCheckForm'
  | 'ListObjectsForm'
  | 'ListUsersForm'
  | 'ExpandTree'
  // Changes widgets
  | 'ChangesTimeline'
  | 'ChangesFilter'
  | 'ChangesTable';

export interface Capabilities {
  identityPicker: boolean;
  resourcePicker: boolean;
  bulkImport: boolean;
  visualModelBuilder: boolean;
  streamedListObjects?: boolean;
}

// Widget Props Types
export interface TupleSearchProps {
  allowTypePrefix?: boolean;
  defaultFilters?: {
    object?: string;
    relation?: string;
    user?: string;
  };
}

export interface TupleEditorProps {
  useTypeRestrictions?: boolean;
  defaultValues?: {
    object?: string;
    relation?: string;
    user?: string;
  };
}

export interface BulkImportProps {
  formats: ('csv' | 'json')[];
  maxRows?: number;
}

export interface ModelEditorProps {
  modes: ('visual' | 'dsl' | 'json')[];
  defaultMode?: 'visual' | 'dsl' | 'json';
}
