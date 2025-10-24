import {
  ApartmentOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DeleteOutlined,
  DiffOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  SaveOutlined,
  SwapOutlined,
  UndoOutlined,
  UploadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import {
  useAuthorizationModel,
  useAuthorizationModels,
  useTransformDSLToJSON,
  useTransformJSONToDSL,
  useValidateDSL,
  useWriteAuthorizationModel,
} from '@api/openfga';
import { CodeEditor } from '@components/CodeEditor';
import { ModelDiffViewer } from '@components/ModelDiff';
import { ModelGraphBuilder } from '@components/ModelGraph';
import type { AuthorizationModel } from '@openfga-admin/shared';
import { useConnectionStore } from '@store/connectionStore';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

// Sample DSL template
const SAMPLE_DSL = `model
  schema 1.1

type user

type document
  relations
    define viewer: [user]
    define editor: [user]
    define owner: [user]
    define can_view: viewer or editor or owner
    define can_edit: editor or owner
    define can_delete: owner
`;

// Sample JSON template
const SAMPLE_JSON: Omit<AuthorizationModel, 'id'> = {
  schema_version: '1.1',
  type_definitions: [
    { type: 'user' },
    {
      type: 'document',
      relations: {
        viewer: { this: {} },
        editor: { this: {} },
        owner: { this: {} },
        can_view: {
          union: {
            child: [
              { computedUserset: { relation: 'viewer' } },
              { computedUserset: { relation: 'editor' } },
              { computedUserset: { relation: 'owner' } },
            ],
          },
        },
        can_edit: {
          union: {
            child: [
              { computedUserset: { relation: 'editor' } },
              { computedUserset: { relation: 'owner' } },
            ],
          },
        },
        can_delete: { computedUserset: { relation: 'owner' } },
      },
      metadata: {
        relations: {
          viewer: { directly_related_user_types: [{ type: 'user' }] },
          editor: { directly_related_user_types: [{ type: 'user' }] },
          owner: { directly_related_user_types: [{ type: 'user' }] },
        },
      },
    },
  ],
};

const MODEL_TEMPLATES = [
  {
    name: 'Document Sharing',
    description: 'Basic document sharing with viewer/editor/owner roles',
    dsl: SAMPLE_DSL,
    json: SAMPLE_JSON,
  },
  {
    name: 'Organization Hierarchy',
    description: 'Org → Team → User hierarchy with membership',
    dsl: `model
  schema 1.1

type user

type team
  relations
    define member: [user]
    define admin: [user]

type organization
  relations
    define member: [user] or member from team
    define admin: [user] or admin from team
    define team: [team]
`,
  },
  {
    name: 'RBAC',
    description: 'Role-based access control with permissions',
    dsl: `model
  schema 1.1

type user

type role
  relations
    define assignee: [user]

type resource
  relations
    define reader: [user] or assignee from reader_role
    define writer: [user] or assignee from writer_role
    define reader_role: [role]
    define writer_role: [role]
`,
  },
];

// ============ Visual Builder Types ============
interface VisualRelation {
  id: string;
  name: string;
  type: 'direct' | 'computed' | 'tupleset';
  directTypes: string[]; // For direct relations: [user], [user, team#member]
  computedFrom?: string; // For computed: relation name
  tuplesetRelation?: string; // For tupleset: parent relation
  tuplesetComputed?: string; // For tupleset: computed relation on parent
  combineWith?: { operator: 'or' | 'and' | 'but not'; relation: string }[];
}

interface VisualTypeDefinition {
  id: string;
  name: string;
  relations: VisualRelation[];
}

// Convert OpenFGA model format to visual types
function modelToVisualTypes(model: AuthorizationModel): VisualTypeDefinition[] {
  if (!model.type_definitions) return [];

  return model.type_definitions.map((typeDef, typeIndex) => {
    const relations: VisualRelation[] = [];

    if (typeDef.relations) {
      // biome-ignore lint/suspicious/noExplicitAny: OpenFGA model has complex nested types
      const relEntries = Object.entries(typeDef.relations) as [string, any][];

      for (const [relName, relDef] of relEntries) {
        const relId = `${typeIndex}-${relName}`;

        // Determine relation type by checking the structure
        // biome-ignore lint/suspicious/noExplicitAny: OpenFGA model structures vary
        const extractRelationType = (def: any): VisualRelation => {
          // Direct relation (this: {})
          if (def.this !== undefined) {
            // Get direct types from metadata
            const directTypes: string[] = [];
            const metaRelations = typeDef.metadata?.relations;
            if (metaRelations && relName in metaRelations) {
              // biome-ignore lint/suspicious/noExplicitAny: Metadata structure
              const relMeta = (metaRelations as any)[relName];
              if (relMeta?.directly_related_user_types) {
                for (const drt of relMeta.directly_related_user_types) {
                  directTypes.push(drt.relation ? `${drt.type}#${drt.relation}` : drt.type);
                }
              }
            }
            return {
              id: relId,
              name: relName,
              type: 'direct',
              directTypes: directTypes.length > 0 ? directTypes : ['user'],
            };
          }

          // Computed relation
          if (def.computedUserset) {
            return {
              id: relId,
              name: relName,
              type: 'computed',
              directTypes: [],
              computedFrom: def.computedUserset.relation,
            };
          }

          // Tupleset relation
          if (def.tupleToUserset) {
            return {
              id: relId,
              name: relName,
              type: 'tupleset',
              directTypes: [],
              tuplesetRelation: def.tupleToUserset.tupleset?.relation,
              tuplesetComputed: def.tupleToUserset.computedUserset?.relation,
            };
          }

          // Union (or)
          if (def.union?.child) {
            const firstChild = def.union.child[0];
            const baseRel = extractRelationType(firstChild);
            baseRel.combineWith = def.union.child
              .slice(1)
              .map((c: { computedUserset?: { relation: string } }) => ({
                operator: 'or' as const,
                relation: c.computedUserset?.relation || '',
              }));
            return baseRel;
          }

          // Intersection (and)
          if (def.intersection?.child) {
            const firstChild = def.intersection.child[0];
            const baseRel = extractRelationType(firstChild);
            baseRel.combineWith = def.intersection.child
              .slice(1)
              .map((c: { computedUserset?: { relation: string } }) => ({
                operator: 'and' as const,
                relation: c.computedUserset?.relation || '',
              }));
            return baseRel;
          }

          // Difference (but not)
          if (def.difference) {
            const baseRel = extractRelationType(def.difference.base);
            baseRel.combineWith = [
              {
                operator: 'but not' as const,
                relation: def.difference.subtract?.computedUserset?.relation || '',
              },
            ];
            return baseRel;
          }

          // Default to direct if unknown structure
          return {
            id: relId,
            name: relName,
            type: 'direct',
            directTypes: ['user'],
          };
        };

        relations.push(extractRelationType(relDef));
      }
    }

    return {
      id: `type-${typeIndex}`,
      name: typeDef.type,
      relations,
    };
  });
}

// Convert visual types to OpenFGA model format
function visualTypesToModel(types: VisualTypeDefinition[]): Omit<AuthorizationModel, 'id'> {
  // biome-ignore lint/suspicious/noExplicitAny: OpenFGA model has complex nested types
  const type_definitions: any[] = types.map((t) => {
    if (t.relations.length === 0) {
      return { type: t.name };
    }

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic relation building
    const relations: Record<string, any> = {};
    const metadata: {
      relations: Record<
        string,
        { directly_related_user_types: Array<{ type: string; relation?: string }> }
      >;
    } = { relations: {} };

    for (const rel of t.relations) {
      if (rel.type === 'direct') {
        relations[rel.name] = { this: {} };
        metadata.relations[rel.name] = {
          directly_related_user_types: rel.directTypes.map((dt) => {
            const parts = dt.split('#');
            return parts.length > 1 ? { type: parts[0], relation: parts[1] } : { type: parts[0] };
          }),
        };
      } else if (rel.type === 'computed') {
        relations[rel.name] = { computedUserset: { relation: rel.computedFrom } };
      } else if (rel.type === 'tupleset' && rel.tuplesetRelation && rel.tuplesetComputed) {
        relations[rel.name] = {
          tupleToUserset: {
            tupleset: { relation: rel.tuplesetRelation },
            computedUserset: { relation: rel.tuplesetComputed },
          },
        };
      }

      // Handle combinations (or, and, but not)
      if (rel.combineWith && rel.combineWith.length > 0) {
        const base = relations[rel.name];
        const children = [
          base,
          ...rel.combineWith.map((c) => ({ computedUserset: { relation: c.relation } })),
        ];
        const op = rel.combineWith[0].operator;
        if (op === 'or') {
          relations[rel.name] = { union: { child: children } };
        } else if (op === 'and') {
          relations[rel.name] = { intersection: { child: children } };
        } else if (op === 'but not') {
          relations[rel.name] = {
            difference: {
              base,
              subtract: { computedUserset: { relation: rel.combineWith[0].relation } },
            },
          };
        }
      }
    }

    return {
      type: t.name,
      relations,
      metadata: Object.keys(metadata.relations).length > 0 ? metadata : undefined,
    };
  });

  return {
    schema_version: '1.1',
    type_definitions,
  };
}

// ============ Visual Builder Component ============
interface VisualBuilderProps {
  types: VisualTypeDefinition[];
  setTypes: (types: VisualTypeDefinition[]) => void;
  allTypeNames: string[];
}

function VisualBuilder({ types, setTypes, allTypeNames }: VisualBuilderProps) {
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingRelation, setEditingRelation] = useState<{ typeId: string; relId: string } | null>(
    null
  );
  const [relationForm] = Form.useForm();

  const addType = () => {
    const newType: VisualTypeDefinition = {
      id: Date.now().toString(),
      name: `type_${types.length + 1}`,
      relations: [],
    };
    setTypes([...types, newType]);
  };

  const removeType = (id: string) => {
    setTypes(types.filter((t) => t.id !== id));
  };

  const updateTypeName = (id: string, name: string) => {
    setTypes(types.map((t) => (t.id === id ? { ...t, name } : t)));
  };

  const addRelation = (typeId: string) => {
    setTypes(
      types.map((t) => {
        if (t.id !== typeId) return t;
        const newRel: VisualRelation = {
          id: Date.now().toString(),
          name: `relation_${t.relations.length + 1}`,
          type: 'direct',
          directTypes: ['user'],
        };
        return { ...t, relations: [...t.relations, newRel] };
      })
    );
  };

  const removeRelation = (typeId: string, relId: string) => {
    setTypes(
      types.map((t) => {
        if (t.id !== typeId) return t;
        return { ...t, relations: t.relations.filter((r) => r.id !== relId) };
      })
    );
  };

  const updateRelation = (typeId: string, relId: string, updates: Partial<VisualRelation>) => {
    setTypes(
      types.map((t) => {
        if (t.id !== typeId) return t;
        return {
          ...t,
          relations: t.relations.map((r) => (r.id === relId ? { ...r, ...updates } : r)),
        };
      })
    );
  };

  const openRelationEditor = (typeId: string, relId: string) => {
    const type = types.find((t) => t.id === typeId);
    const relation = type?.relations.find((r) => r.id === relId);
    if (relation) {
      relationForm.setFieldsValue({
        name: relation.name,
        type: relation.type,
        directTypes: relation.directTypes,
        computedFrom: relation.computedFrom,
        tuplesetRelation: relation.tuplesetRelation,
        tuplesetComputed: relation.tuplesetComputed,
      });
      setEditingRelation({ typeId, relId });
    }
  };

  const saveRelation = () => {
    if (!editingRelation) return;
    const values = relationForm.getFieldsValue();
    updateRelation(editingRelation.typeId, editingRelation.relId, {
      name: values.name,
      type: values.type,
      directTypes: values.directTypes || [],
      computedFrom: values.computedFrom,
      tuplesetRelation: values.tuplesetRelation,
      tuplesetComputed: values.tuplesetComputed,
    });
    setEditingRelation(null);
    relationForm.resetFields();
  };

  const getRelationsForType = (typeId: string): string[] => {
    const type = types.find((t) => t.id === typeId);
    return type?.relations.map((r) => r.name) || [];
  };

  return (
    <div style={{ padding: 16 }}>
      <Alert
        message="Visual Model Builder"
        description="Build your authorization model visually. Add types and define their relations using the interface below."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {types.map((type) => (
          <Card
            key={type.id}
            size="small"
            title={
              editingType === type.id ? (
                <Input
                  size="small"
                  value={type.name}
                  onChange={(e) => updateTypeName(type.id, e.target.value)}
                  onBlur={() => setEditingType(null)}
                  onPressEnter={() => setEditingType(null)}
                  autoFocus
                  style={{ width: 200 }}
                />
              ) : (
                <Space>
                  <Tag color="blue">type</Tag>
                  <Text
                    strong
                    style={{ cursor: 'pointer' }}
                    onClick={() => setEditingType(type.id)}
                  >
                    {type.name}
                  </Text>
                </Space>
              )
            }
            extra={
              <Popconfirm
                title="Delete this type?"
                onConfirm={() => removeType(type.id)}
                okText="Yes"
                cancelText="No"
              >
                <Button type="text" danger size="small" icon={<DeleteOutlined />} />
              </Popconfirm>
            }
          >
            {type.relations.length === 0 ? (
              <Text type="secondary" italic>
                No relations defined. This is a base type (like "user").
              </Text>
            ) : (
              <Space orientation="vertical" style={{ width: '100%' }} size="small">
                {type.relations.map((rel) => (
                  <Card
                    key={rel.id}
                    size="small"
                    style={{ backgroundColor: '#fafafa' }}
                    styles={{ body: { padding: '8px 12px' } }}
                  >
                    <Row justify="space-between" align="middle">
                      <Col>
                        <Space>
                          <Tag
                            color={
                              rel.type === 'direct'
                                ? 'green'
                                : rel.type === 'computed'
                                  ? 'orange'
                                  : 'purple'
                            }
                          >
                            {rel.type}
                          </Tag>
                          <Text strong>{rel.name}</Text>
                          {rel.type === 'direct' && (
                            <Text type="secondary">← [{rel.directTypes.join(', ')}]</Text>
                          )}
                          {rel.type === 'computed' && (
                            <Text type="secondary">← {rel.computedFrom}</Text>
                          )}
                          {rel.type === 'tupleset' && (
                            <Text type="secondary">
                              ← {rel.tuplesetComputed} from {rel.tuplesetRelation}
                            </Text>
                          )}
                        </Space>
                      </Col>
                      <Col>
                        <Space size="small">
                          <Button
                            type="text"
                            size="small"
                            onClick={() => openRelationEditor(type.id, rel.id)}
                          >
                            Edit
                          </Button>
                          <Popconfirm
                            title="Delete this relation?"
                            onConfirm={() => removeRelation(type.id, rel.id)}
                          >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      </Col>
                    </Row>
                  </Card>
                ))}
              </Space>
            )}
            <Divider style={{ margin: '12px 0' }} />
            <Button
              type="dashed"
              size="small"
              icon={<PlusOutlined />}
              onClick={() => addRelation(type.id)}
            >
              Add Relation
            </Button>
          </Card>
        ))}

        <Button type="dashed" block icon={<PlusOutlined />} onClick={addType}>
          Add Type
        </Button>
      </Space>

      {/* Relation Editor Modal */}
      <Modal
        title="Edit Relation"
        open={!!editingRelation}
        onOk={saveRelation}
        onCancel={() => setEditingRelation(null)}
        width={500}
      >
        <Form form={relationForm} layout="vertical">
          <Form.Item name="name" label="Relation Name" rules={[{ required: true }]}>
            <Input placeholder="e.g., viewer, editor, owner" />
          </Form.Item>

          <Form.Item name="type" label="Relation Type" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="direct">
                <Space>
                  <Tag color="green">Direct</Tag>
                  Users can be directly assigned
                </Space>
              </Select.Option>
              <Select.Option value="computed">
                <Space>
                  <Tag color="orange">Computed</Tag>
                  Inherited from another relation
                </Space>
              </Select.Option>
              <Select.Option value="tupleset">
                <Space>
                  <Tag color="purple">Tupleset</Tag>
                  Inherited through a parent object
                </Space>
              </Select.Option>
            </Select>
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.type !== cur.type}>
            {({ getFieldValue }) => {
              const relType = getFieldValue('type');

              if (relType === 'direct') {
                return (
                  <Form.Item
                    name="directTypes"
                    label="Allowed Subject Types"
                    tooltip="Types that can be assigned this relation (e.g., user, team#member)"
                  >
                    <Select mode="tags" placeholder="e.g., user, team#member">
                      {allTypeNames.map((t) => (
                        <Select.Option key={t} value={t}>
                          {t}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                );
              }

              if (relType === 'computed') {
                return (
                  <Form.Item
                    name="computedFrom"
                    label="Computed From Relation"
                    tooltip="The relation to inherit from"
                  >
                    <Select placeholder="Select relation">
                      {editingRelation &&
                        getRelationsForType(editingRelation.typeId)
                          .filter((r) => r !== relationForm.getFieldValue('name'))
                          .map((r) => (
                            <Select.Option key={r} value={r}>
                              {r}
                            </Select.Option>
                          ))}
                    </Select>
                  </Form.Item>
                );
              }

              if (relType === 'tupleset') {
                return (
                  <>
                    <Form.Item
                      name="tuplesetRelation"
                      label="Parent Relation"
                      tooltip="The relation pointing to the parent object"
                    >
                      <Select placeholder="Select parent relation">
                        {editingRelation &&
                          getRelationsForType(editingRelation.typeId)
                            .filter((r) => r !== relationForm.getFieldValue('name'))
                            .map((r) => (
                              <Select.Option key={r} value={r}>
                                {r}
                              </Select.Option>
                            ))}
                      </Select>
                    </Form.Item>
                    <Form.Item
                      name="tuplesetComputed"
                      label="Computed Relation on Parent"
                      tooltip="The relation on the parent type to inherit"
                    >
                      <Input placeholder="e.g., member, viewer" />
                    </Form.Item>
                  </>
                );
              }

              return null;
            }}
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default function ModelEditorPage() {
  useNavigate();
  const { message, modal } = App.useApp();
  const { getActiveProfile, updateProfile } = useConnectionStore();
  const profile = getActiveProfile();

  const { data: currentModel, isLoading } = useAuthorizationModel();
  const { data: allModels } = useAuthorizationModels();
  const writeModel = useWriteAuthorizationModel();
  const transformToJSON = useTransformDSLToJSON();
  const transformToDSL = useTransformJSONToDSL();
  const validateDSL = useValidateDSL();

  const [activeTab, setActiveTab] = useState<'dsl' | 'json' | 'visual' | 'graph' | 'diff'>('dsl');
  const [dslContent, setDslContent] = useState(SAMPLE_DSL);
  const [jsonContent, setJsonContent] = useState(JSON.stringify(SAMPLE_JSON, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [dslValid, setDslValid] = useState<boolean | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Diff viewer state
  const [leftModelId, setLeftModelId] = useState<string | undefined>();
  const [rightModelId, setRightModelId] = useState<string | undefined>();

  // Visual Builder state
  const [visualTypes, setVisualTypes] = useState<VisualTypeDefinition[]>([
    { id: '1', name: 'user', relations: [] },
  ]);

  // Auto-load current model into visual builder when it changes
  useEffect(() => {
    if (currentModel) {
      const types = modelToVisualTypes(currentModel);
      if (types.length > 0) {
        setVisualTypes(types);
      }
    }
  }, [currentModel]);

  // Validate DSL on change
  useEffect(() => {
    if (activeTab === 'dsl' && dslContent.trim()) {
      const timer = setTimeout(async () => {
        try {
          const result = await validateDSL.mutateAsync(dslContent);
          setDslValid(result.valid);
          if (!result.valid && result.error) {
            setParseError(result.error);
          } else {
            setParseError(null);
          }
        } catch {
          setDslValid(false);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [dslContent, activeTab, validateDSL.mutateAsync]);

  // Sync DSL to JSON
  const syncDSLToJSON = useCallback(async () => {
    setIsSyncing(true);
    try {
      const json = await transformToJSON.mutateAsync(dslContent);
      setJsonContent(JSON.stringify(json, null, 2));
      setParseError(null);
      setActiveTab('json'); // Switch to JSON tab to show result
      message.success('Converted DSL to JSON');
    } catch (error) {
      message.error(`Conversion failed: ${(error as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [dslContent, transformToJSON, message]);

  // Sync JSON to DSL
  const syncJSONToDSL = useCallback(async () => {
    setIsSyncing(true);
    try {
      const parsed = JSON.parse(jsonContent);
      const dsl = await transformToDSL.mutateAsync(parsed);
      setDslContent(dsl);
      setParseError(null);
      setActiveTab('dsl'); // Switch to DSL tab to show result
      message.success('Converted JSON to DSL');
    } catch (error) {
      message.error(`Conversion failed: ${(error as Error).message}`);
    } finally {
      setIsSyncing(false);
    }
  }, [jsonContent, transformToDSL, message]);

  // Sync Visual to JSON
  const syncVisualToJSON = useCallback(() => {
    const model = visualTypesToModel(visualTypes);
    setJsonContent(JSON.stringify(model, null, 2));
    setActiveTab('json'); // Switch to JSON tab to show result
    message.success('Exported Visual Builder to JSON');
  }, [visualTypes, message]);

  // Load current model into editor
  const loadCurrentModel = useCallback(async () => {
    if (currentModel) {
      const modelJson = {
        schema_version: currentModel.schema_version,
        type_definitions: currentModel.type_definitions,
        conditions: currentModel.conditions,
      };
      setJsonContent(JSON.stringify(modelJson, null, 2));

      // Also load into visual builder
      const visualTypes = modelToVisualTypes(currentModel);
      setVisualTypes(
        visualTypes.length > 0 ? visualTypes : [{ id: '1', name: 'user', relations: [] }]
      );

      // Also convert to DSL
      try {
        const dsl = await transformToDSL.mutateAsync(modelJson);
        setDslContent(dsl);
        message.success('Loaded current model');
      } catch {
        message.info('Loaded to JSON editor (DSL conversion not available)');
      }
      setActiveTab('json');
    }
  }, [currentModel, transformToDSL, message]);

  // Validate JSON
  const validateJson = useCallback((content: string): AuthorizationModel | null => {
    try {
      const parsed = JSON.parse(content);
      if (!parsed.schema_version || !parsed.type_definitions) {
        setParseError('Model must have schema_version and type_definitions');
        return null;
      }
      setParseError(null);
      return parsed;
    } catch (e) {
      setParseError(`Invalid JSON: ${(e as Error).message}`);
      return null;
    }
  }, []);

  // Handle publish
  const handlePublish = async () => {
    const model = validateJson(jsonContent);
    if (!model) {
      message.error('Please fix JSON errors before publishing');
      return;
    }

    try {
      const result = await writeModel.mutateAsync({
        schema_version: model.schema_version,
        type_definitions: model.type_definitions,
        conditions: model.conditions,
      });

      message.success(`Model published successfully! ID: ${result.authorization_model_id}`);
      setShowPublishModal(false);

      // Optionally pin the new model
      if (profile) {
        modal.confirm({
          title: 'Pin New Model?',
          content: 'Do you want to pin this new model version for your connection profile?',
          onOk: () => {
            updateProfile(profile.id, {
              authorizationModelId: result.authorization_model_id,
              modelSelectionMode: 'pinned',
            });
            message.success('Model pinned to profile');
          },
        });
      }
    } catch (error) {
      message.error(`Failed to publish: ${(error as Error).message}`);
    }
  };

  // Apply template
  const applyTemplate = (template: (typeof MODEL_TEMPLATES)[0]) => {
    setDslContent(template.dsl);
    if (template.json) {
      setJsonContent(JSON.stringify(template.json, null, 2));
    }
    setShowTemplateModal(false);
    message.success(`Applied "${template.name}" template`);
  };

  // Copy to clipboard
  const copyToClipboard = () => {
    const content = activeTab === 'dsl' ? dslContent : jsonContent;
    navigator.clipboard.writeText(content);
    message.success('Copied to clipboard');
  };

  // Download
  const downloadModel = () => {
    const content = activeTab === 'dsl' ? dslContent : jsonContent;
    const ext = activeTab === 'dsl' ? 'fga' : 'json';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `authorization-model.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>Loading...</Paragraph>
        </div>
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {/* Header */}
      <Col span={24}>
        <Card size="small">
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Title level={4} style={{ margin: 0 }}>
                  Model Editor
                </Title>
                {currentModel && <Tag color="blue">Current: {currentModel.id.slice(0, 12)}...</Tag>}
              </Space>
            </Col>
            <Col>
              <Space>
                <Button icon={<UploadOutlined />} onClick={() => setShowTemplateModal(true)}>
                  Templates
                </Button>
                {currentModel && (
                  <Button icon={<UndoOutlined />} onClick={loadCurrentModel}>
                    Load Current
                  </Button>
                )}
                <Button icon={<CopyOutlined />} onClick={copyToClipboard}>
                  Copy
                </Button>
                <Button icon={<DownloadOutlined />} onClick={downloadModel}>
                  Download
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={() => setShowPublishModal(true)}
                  loading={writeModel.isPending}
                >
                  Publish Model
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Col>

      {/* Editor */}
      <Col span={24}>
        <Card styles={{ body: { padding: 0 } }}>
          <Tabs
            activeKey={activeTab}
            onChange={(key) => setActiveTab(key as 'dsl' | 'json' | 'visual')}
            tabBarStyle={{ padding: '0 16px', marginBottom: 0 }}
            tabBarExtraContent={
              <Space style={{ marginRight: 16 }}>
                {activeTab === 'dsl' && (
                  <>
                    <Badge dot={dslValid === true} color="green" offset={[-5, 5]}>
                      <Tooltip
                        title={
                          dslValid === true
                            ? 'Valid DSL'
                            : dslValid === false
                              ? 'Invalid DSL'
                              : 'Not validated'
                        }
                      >
                        {dslValid === true ? (
                          <CheckCircleOutlined style={{ color: '#52c41a' }} />
                        ) : dslValid === false ? (
                          <WarningOutlined style={{ color: '#faad14' }} />
                        ) : null}
                      </Tooltip>
                    </Badge>
                    <Tooltip title="Convert DSL to JSON">
                      <Button
                        size="small"
                        icon={<SwapOutlined />}
                        loading={isSyncing}
                        onClick={syncDSLToJSON}
                      >
                        → JSON
                      </Button>
                    </Tooltip>
                  </>
                )}
                {activeTab === 'json' && (
                  <Tooltip title="Convert JSON to DSL">
                    <Button
                      size="small"
                      icon={<SwapOutlined />}
                      loading={isSyncing}
                      onClick={syncJSONToDSL}
                    >
                      → DSL
                    </Button>
                  </Tooltip>
                )}
                {activeTab === 'visual' && (
                  <Tooltip title="Export Visual Builder to JSON">
                    <Button size="small" icon={<SwapOutlined />} onClick={syncVisualToJSON}>
                      → JSON
                    </Button>
                  </Tooltip>
                )}
              </Space>
            }
            items={[
              {
                key: 'dsl',
                label: (
                  <Space>
                    <FileTextOutlined />
                    DSL Editor
                  </Space>
                ),
                children: (
                  <div style={{ padding: 16 }}>
                    <Row gutter={16} style={{ marginBottom: 16 }}>
                      <Col flex="auto">
                        <Alert
                          message="DSL Mode"
                          description="Write your authorization model using OpenFGA DSL syntax. Syntax highlighting and autocomplete enabled."
                          type="info"
                          showIcon
                        />
                      </Col>
                    </Row>
                    {parseError && activeTab === 'dsl' && (
                      <Alert
                        message="DSL Syntax Error"
                        description={parseError}
                        type="error"
                        showIcon
                        style={{ marginBottom: 16 }}
                      />
                    )}
                    <div
                      style={{ border: '1px solid #303030', borderRadius: 6, overflow: 'hidden' }}
                    >
                      <CodeEditor
                        value={dslContent}
                        onChange={setDslContent}
                        language="openfga-dsl"
                        height={500}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'json',
                label: (
                  <Space>
                    <CodeOutlined />
                    JSON Editor
                  </Space>
                ),
                children: (
                  <div style={{ padding: 16 }}>
                    {parseError && activeTab === 'json' && (
                      <Alert
                        message="Validation Error"
                        description={parseError}
                        type="error"
                        showIcon
                        style={{ marginBottom: 16 }}
                      />
                    )}
                    <div
                      style={{ border: '1px solid #303030', borderRadius: 6, overflow: 'hidden' }}
                    >
                      <CodeEditor
                        value={jsonContent}
                        onChange={(value) => {
                          setJsonContent(value);
                          validateJson(value);
                        }}
                        language="json"
                        height={500}
                      />
                    </div>
                  </div>
                ),
              },
              {
                key: 'visual',
                label: (
                  <Space>
                    <AppstoreOutlined />
                    Visual Builder
                  </Space>
                ),
                children: (
                  <VisualBuilder
                    types={visualTypes}
                    setTypes={setVisualTypes}
                    allTypeNames={visualTypes.map((t) => t.name)}
                  />
                ),
              },
              {
                key: 'graph',
                label: (
                  <Space>
                    <ApartmentOutlined />
                    Graph View
                  </Space>
                ),
                children: (
                  <div style={{ height: 600 }}>
                    <ModelGraphBuilder
                      model={currentModel || null}
                      onChange={(model) => {
                        setJsonContent(JSON.stringify(model, null, 2));
                      }}
                    />
                  </div>
                ),
              },
              {
                key: 'diff',
                label: (
                  <Space>
                    <DiffOutlined />
                    Compare Versions
                  </Space>
                ),
                children: (
                  <div style={{ padding: 16 }}>
                    <ModelDiffViewer
                      models={allModels || []}
                      leftModelId={leftModelId}
                      rightModelId={rightModelId}
                      onLeftModelChange={setLeftModelId}
                      onRightModelChange={setRightModelId}
                    />
                  </div>
                ),
              },
            ]}
          />
        </Card>
      </Col>

      {/* Publish Modal */}
      <Modal
        title="Publish Authorization Model"
        open={showPublishModal}
        onOk={handlePublish}
        onCancel={() => setShowPublishModal(false)}
        confirmLoading={writeModel.isPending}
        okText="Publish"
        width={600}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Alert
            message="Important"
            description="Publishing creates a new immutable version of your authorization model. Existing tuples will be evaluated against the new model."
            type="warning"
            showIcon
          />

          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Store">{profile?.name}</Descriptions.Item>
            <Descriptions.Item label="Current Model">
              {currentModel?.id || 'None'}
            </Descriptions.Item>
            <Descriptions.Item label="Action">Create new model version</Descriptions.Item>
          </Descriptions>

          <Text type="secondary">
            After publishing, you can optionally pin this model version to your profile.
          </Text>
        </Space>
      </Modal>

      {/* Template Modal */}
      <Modal
        title="Model Templates"
        open={showTemplateModal}
        onCancel={() => setShowTemplateModal(false)}
        footer={null}
        width={600}
      >
        <Space orientation="vertical" style={{ width: '100%' }}>
          {MODEL_TEMPLATES.map((template) => (
            <Card
              key={template.name}
              hoverable
              size="small"
              onClick={() => applyTemplate(template)}
            >
              <Row justify="space-between" align="middle">
                <Col>
                  <Text strong>{template.name}</Text>
                  <br />
                  <Text type="secondary">{template.description}</Text>
                </Col>
                <Col>
                  <Button type="link" icon={<EyeOutlined />}>
                    Apply
                  </Button>
                </Col>
              </Row>
            </Card>
          ))}
        </Space>
      </Modal>
    </Row>
  );
}
