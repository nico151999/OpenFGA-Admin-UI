import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { AuthorizationModel } from '@openfga-admin/shared';
import { Button, Card, Form, Input, Modal, Select, Space, Tag, Tooltip, Typography } from 'antd';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Connection, Edge, Node, NodeProps } from 'reactflow';
import ReactFlow, {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';

const { Text, Title } = Typography;

// ============ Custom Node Types ============

interface TypeNodeData {
  label: string;
  relations: Array<{
    name: string;
    type: 'direct' | 'computed' | 'tupleset';
    directTypes?: string[];
    computedFrom?: string;
  }>;
  onAddRelation: (typeName: string) => void;
  onDeleteRelation: (typeName: string, relationName: string) => void;
  onDeleteType: (typeName: string) => void;
}

function TypeNode({ data, selected }: NodeProps<TypeNodeData>) {
  const relationColors = {
    direct: '#52c41a',
    computed: '#1890ff',
    tupleset: '#722ed1',
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <Text strong style={{ color: '#fff' }}>
            {data.label}
          </Text>
          <Tooltip title="Delete type">
            <Button
              type="text"
              size="small"
              danger
              icon={<DeleteOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                data.onDeleteType(data.label);
              }}
            />
          </Tooltip>
        </Space>
      }
      style={{
        minWidth: 200,
        border: selected ? '2px solid #1890ff' : '1px solid #303030',
        background: '#1f1f1f',
      }}
      styles={{
        header: { background: '#141414', borderBottom: '1px solid #303030' },
        body: { padding: 8 },
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#1890ff' }} />

      {data.relations.length === 0 ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          No relations defined
        </Text>
      ) : (
        <Space orientation="vertical" size={4} style={{ width: '100%' }}>
          {data.relations.map((rel) => (
            <div
              key={rel.name}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                background: '#262626',
                borderRadius: 4,
                borderLeft: `3px solid ${relationColors[rel.type]}`,
              }}
            >
              <Space size={4}>
                <Text style={{ fontSize: 12 }}>{rel.name}</Text>
                <Tag color={relationColors[rel.type]} style={{ fontSize: 10, margin: 0 }}>
                  {rel.type}
                </Tag>
              </Space>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined style={{ fontSize: 10 }} />}
                onClick={(e) => {
                  e.stopPropagation();
                  data.onDeleteRelation(data.label, rel.name);
                }}
              />
            </div>
          ))}
        </Space>
      )}

      <Button
        type="dashed"
        size="small"
        icon={<PlusOutlined />}
        style={{ width: '100%', marginTop: 8 }}
        onClick={(e) => {
          e.stopPropagation();
          data.onAddRelation(data.label);
        }}
      >
        Add Relation
      </Button>

      <Handle type="source" position={Position.Right} style={{ background: '#52c41a' }} />
    </Card>
  );
}

const nodeTypes = {
  typeNode: TypeNode,
};

// ============ Model Conversion Utilities ============

interface GraphRelation {
  name: string;
  type: 'direct' | 'computed' | 'tupleset';
  directTypes: string[];
  computedFrom?: string;
  tuplesetRelation?: string;
  tuplesetComputed?: string;
}

interface GraphType {
  name: string;
  relations: GraphRelation[];
}

function modelToGraph(model: AuthorizationModel | null): GraphType[] {
  if (!model?.type_definitions) return [];

  return model.type_definitions.map((typeDef) => {
    const relations: GraphRelation[] = [];

    if (typeDef.relations) {
      // biome-ignore lint/suspicious/noExplicitAny: OpenFGA model structures vary
      for (const [relName, relDef] of Object.entries(typeDef.relations) as [string, any][]) {
        const relation: GraphRelation = {
          name: relName,
          type: 'direct',
          directTypes: [],
        };

        // Determine relation type
        if (relDef.this !== undefined) {
          relation.type = 'direct';
          // Get direct types from metadata
          const metaRelations = typeDef.metadata?.relations;
          if (metaRelations && relName in metaRelations) {
            // biome-ignore lint/suspicious/noExplicitAny: Metadata structure
            const relMeta = (metaRelations as any)[relName];
            if (relMeta?.directly_related_user_types) {
              for (const drt of relMeta.directly_related_user_types) {
                relation.directTypes.push(drt.relation ? `${drt.type}#${drt.relation}` : drt.type);
              }
            }
          }
        } else if (relDef.computedUserset) {
          relation.type = 'computed';
          relation.computedFrom = relDef.computedUserset.relation;
        } else if (relDef.tupleToUserset) {
          relation.type = 'tupleset';
          relation.tuplesetRelation = relDef.tupleToUserset.tupleset?.relation;
          relation.tuplesetComputed = relDef.tupleToUserset.computedUserset?.relation;
        } else if (relDef.union?.child) {
          // Handle union - mark as direct for simplicity, with combined types
          relation.type = 'direct';
          for (const child of relDef.union.child) {
            if (child.this !== undefined) {
              // Look up in metadata
              const metaRelations = typeDef.metadata?.relations;
              if (metaRelations && relName in metaRelations) {
                // biome-ignore lint/suspicious/noExplicitAny: Metadata structure
                const relMeta = (metaRelations as any)[relName];
                if (relMeta?.directly_related_user_types) {
                  for (const drt of relMeta.directly_related_user_types) {
                    relation.directTypes.push(
                      drt.relation ? `${drt.type}#${drt.relation}` : drt.type
                    );
                  }
                }
              }
            } else if (child.computedUserset) {
              relation.computedFrom = child.computedUserset.relation;
            }
          }
        }

        relations.push(relation);
      }
    }

    return {
      name: typeDef.type,
      relations,
    };
  });
}

function graphToModel(types: GraphType[]): Omit<AuthorizationModel, 'id'> {
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
      } else if (rel.type === 'computed' && rel.computedFrom) {
        relations[rel.name] = { computedUserset: { relation: rel.computedFrom } };
      } else if (rel.type === 'tupleset' && rel.tuplesetRelation && rel.tuplesetComputed) {
        relations[rel.name] = {
          tupleToUserset: {
            tupleset: { relation: rel.tuplesetRelation },
            computedUserset: { relation: rel.tuplesetComputed },
          },
        };
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

// ============ Main Component ============

interface ModelGraphBuilderProps {
  model: AuthorizationModel | null;
  onChange: (model: Omit<AuthorizationModel, 'id'>) => void;
}

export function ModelGraphBuilder({ model, onChange }: ModelGraphBuilderProps) {
  const [graphTypes, setGraphTypes] = useState<GraphType[]>([]);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  // Modal state for adding relations
  const [relationModal, setRelationModal] = useState<{ open: boolean; typeName: string | null }>({
    open: false,
    typeName: null,
  });
  const [relationForm] = Form.useForm();

  // Convert model to graph types on mount/change
  useEffect(() => {
    const types = modelToGraph(model);
    setGraphTypes(types.length > 0 ? types : [{ name: 'user', relations: [] }]);
  }, [model]);

  // Callbacks for node actions
  const handleAddRelation = useCallback(
    (typeName: string) => {
      setRelationModal({ open: true, typeName });
      relationForm.resetFields();
    },
    [relationForm]
  );

  const handleDeleteRelation = useCallback(
    (typeName: string, relationName: string) => {
      setGraphTypes((prev) => {
        const updated = prev.map((t) => {
          if (t.name === typeName) {
            return { ...t, relations: t.relations.filter((r) => r.name !== relationName) };
          }
          return t;
        });
        // Trigger onChange
        setTimeout(() => onChange(graphToModel(updated)), 0);
        return updated;
      });
    },
    [onChange]
  );

  const handleDeleteType = useCallback(
    (typeName: string) => {
      setGraphTypes((prev) => {
        const updated = prev.filter((t) => t.name !== typeName);
        setTimeout(() => onChange(graphToModel(updated)), 0);
        return updated;
      });
    },
    [onChange]
  );

  // Generate nodes and edges from graph types
  useEffect(() => {
    const VERTICAL_SPACING = 220;
    const HORIZONTAL_SPACING = 350;
    const ITEMS_PER_ROW = 3;

    const newNodes: Node<TypeNodeData>[] = graphTypes.map((type, index) => ({
      id: type.name,
      type: 'typeNode',
      position: {
        x: (index % ITEMS_PER_ROW) * HORIZONTAL_SPACING + 50,
        y: Math.floor(index / ITEMS_PER_ROW) * VERTICAL_SPACING + 50,
      },
      data: {
        label: type.name,
        relations: type.relations,
        onAddRelation: handleAddRelation,
        onDeleteRelation: handleDeleteRelation,
        onDeleteType: handleDeleteType,
      },
    }));

    // Create edges for direct type relationships
    const newEdges: Edge[] = [];
    for (const type of graphTypes) {
      for (const rel of type.relations) {
        if (rel.type === 'direct' && rel.directTypes) {
          for (const directType of rel.directTypes) {
            const targetType = directType.split('#')[0];
            if (graphTypes.some((t) => t.name === targetType)) {
              newEdges.push({
                id: `${type.name}-${rel.name}-${directType}`,
                source: targetType,
                target: type.name,
                label: rel.name,
                labelStyle: { fill: '#fff', fontSize: 10 },
                labelBgStyle: { fill: '#1f1f1f', fillOpacity: 0.8 },
                labelBgPadding: [4, 4] as [number, number],
                animated: true,
                style: { stroke: '#52c41a' },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#52c41a' },
              });
            }
          }
        } else if (rel.type === 'computed' && rel.computedFrom) {
          // Computed relations are internal - show as self-referencing edge
          newEdges.push({
            id: `${type.name}-${rel.name}-computed`,
            source: type.name,
            target: type.name,
            label: `${rel.name} = ${rel.computedFrom}`,
            labelStyle: { fill: '#fff', fontSize: 10 },
            labelBgStyle: { fill: '#1f1f1f', fillOpacity: 0.8 },
            labelBgPadding: [4, 4] as [number, number],
            style: { stroke: '#1890ff' },
            type: 'smoothstep',
          });
        } else if (rel.type === 'tupleset' && rel.tuplesetRelation) {
          // Show tupleset as edge to the relation's target
          newEdges.push({
            id: `${type.name}-${rel.name}-tupleset`,
            source: type.name,
            target: type.name,
            label: `${rel.name} = ${rel.tuplesetRelation}->${rel.tuplesetComputed}`,
            labelStyle: { fill: '#fff', fontSize: 10 },
            labelBgStyle: { fill: '#1f1f1f', fillOpacity: 0.8 },
            labelBgPadding: [4, 4] as [number, number],
            style: { stroke: '#722ed1' },
            type: 'smoothstep',
          });
        }
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [graphTypes, handleAddRelation, handleDeleteRelation, handleDeleteType, setNodes, setEdges]);

  // Handle edge connection (creates a new direct relation)
  const onConnect = useCallback(
    (params: Connection) => {
      const { source, target } = params;
      if (!source || !target) return;

      // Adding an edge from source to target creates a direct relation
      setGraphTypes((prev) => {
        const updated = prev.map((t) => {
          if (t.name === target) {
            // Check if there's already a relation we can add to
            const existingDirect = t.relations.find((r) => r.type === 'direct');
            if (existingDirect) {
              if (!existingDirect.directTypes.includes(source)) {
                existingDirect.directTypes.push(source);
              }
              return { ...t };
            }
            // Create new relation
            return {
              ...t,
              relations: [
                ...t.relations,
                {
                  name: `${source}_ref`,
                  type: 'direct' as const,
                  directTypes: [source],
                },
              ],
            };
          }
          return t;
        });
        setTimeout(() => onChange(graphToModel(updated)), 0);
        return updated;
      });

      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#52c41a' },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#52c41a' },
          },
          eds
        )
      );
    },
    [onChange, setEdges]
  );

  // Add new type
  const addType = useCallback(() => {
    const existingNames = graphTypes.map((t) => t.name);
    let newName = 'new_type';
    let counter = 1;
    while (existingNames.includes(newName)) {
      newName = `new_type_${counter}`;
      counter++;
    }

    setGraphTypes((prev) => {
      const updated = [...prev, { name: newName, relations: [] }];
      setTimeout(() => onChange(graphToModel(updated)), 0);
      return updated;
    });
  }, [graphTypes, onChange]);

  // Handle relation form submit
  const handleRelationSubmit = useCallback(() => {
    relationForm.validateFields().then((values) => {
      const { typeName } = relationModal;
      if (!typeName) return;

      setGraphTypes((prev) => {
        const updated = prev.map((t) => {
          if (t.name === typeName) {
            const newRelation: GraphRelation = {
              name: values.name,
              type: values.type,
              directTypes: values.type === 'direct' ? values.directTypes || ['user'] : [],
              computedFrom: values.type === 'computed' ? values.computedFrom : undefined,
              tuplesetRelation: values.type === 'tupleset' ? values.tuplesetRelation : undefined,
              tuplesetComputed: values.type === 'tupleset' ? values.tuplesetComputed : undefined,
            };
            return { ...t, relations: [...t.relations, newRelation] };
          }
          return t;
        });
        setTimeout(() => onChange(graphToModel(updated)), 0);
        return updated;
      });

      setRelationModal({ open: false, typeName: null });
    });
  }, [relationForm, relationModal, onChange]);

  // Get all type names for dropdowns
  const allTypeNames = useMemo(() => graphTypes.map((t) => t.name), [graphTypes]);

  // Get all relation names for computed relation dropdowns
  const getRelationsForType = useCallback(
    (typeName: string) => {
      const type = graphTypes.find((t) => t.name === typeName);
      return type?.relations.map((r) => r.name) || [];
    },
    [graphTypes]
  );

  const [relationType, setRelationType] = useState<'direct' | 'computed' | 'tupleset'>('direct');

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        style={{ background: '#141414' }}
        defaultEdgeOptions={{
          animated: true,
          style: { stroke: '#52c41a' },
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#303030" />
        <Controls style={{ background: '#1f1f1f', borderColor: '#303030' }} />
        <MiniMap
          style={{ background: '#1f1f1f' }}
          nodeColor="#303030"
          maskColor="rgba(0, 0, 0, 0.8)"
        />

        <Panel position="top-left">
          <Space orientation="vertical">
            <Card size="small" style={{ background: '#1f1f1f', border: '1px solid #303030' }}>
              <Space orientation="vertical" size={4}>
                <Title level={5} style={{ margin: 0 }}>
                  Graph Model Builder
                </Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Drag to connect types • Click nodes to edit
                </Text>
                <Button type="primary" icon={<PlusOutlined />} onClick={addType}>
                  Add Type
                </Button>
              </Space>
            </Card>

            <Card size="small" style={{ background: '#1f1f1f', border: '1px solid #303030' }}>
              <Space orientation="vertical" size={2}>
                <Text strong style={{ fontSize: 12 }}>
                  Legend:
                </Text>
                <Space>
                  <Tag color="#52c41a">Direct</Tag>
                  <Tag color="#1890ff">Computed</Tag>
                  <Tag color="#722ed1">Tupleset</Tag>
                </Space>
              </Space>
            </Card>
          </Space>
        </Panel>
      </ReactFlow>

      {/* Add Relation Modal */}
      <Modal
        title={`Add Relation to "${relationModal.typeName}"`}
        open={relationModal.open}
        onOk={handleRelationSubmit}
        onCancel={() => setRelationModal({ open: false, typeName: null })}
        destroyOnClose
      >
        <Form form={relationForm} layout="vertical" initialValues={{ type: 'direct' }}>
          <Form.Item
            name="name"
            label="Relation Name"
            rules={[{ required: true, message: 'Please enter a relation name' }]}
          >
            <Input placeholder="e.g., viewer, editor, owner" />
          </Form.Item>

          <Form.Item name="type" label="Relation Type" rules={[{ required: true }]}>
            <Select onChange={(v) => setRelationType(v)}>
              <Select.Option value="direct">Direct (assignable)</Select.Option>
              <Select.Option value="computed">Computed (from another relation)</Select.Option>
              <Select.Option value="tupleset">Tupleset (from related object)</Select.Option>
            </Select>
          </Form.Item>

          {relationType === 'direct' && (
            <Form.Item
              name="directTypes"
              label="Allowed Types"
              rules={[{ required: true, message: 'Select at least one type' }]}
              initialValue={['user']}
            >
              <Select mode="tags" placeholder="Select or enter types">
                {allTypeNames.map((t) => (
                  <Select.Option key={t} value={t}>
                    {t}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {relationType === 'computed' && (
            <Form.Item
              name="computedFrom"
              label="Computed From Relation"
              rules={[{ required: true, message: 'Select the source relation' }]}
            >
              <Select placeholder="Select relation">
                {relationModal.typeName &&
                  getRelationsForType(relationModal.typeName).map((r) => (
                    <Select.Option key={r} value={r}>
                      {r}
                    </Select.Option>
                  ))}
              </Select>
            </Form.Item>
          )}

          {relationType === 'tupleset' && (
            <>
              <Form.Item
                name="tuplesetRelation"
                label="Parent Relation"
                rules={[{ required: true }]}
              >
                <Select placeholder="Select parent relation">
                  {relationModal.typeName &&
                    getRelationsForType(relationModal.typeName).map((r) => (
                      <Select.Option key={r} value={r}>
                        {r}
                      </Select.Option>
                    ))}
                </Select>
              </Form.Item>
              <Form.Item
                name="tuplesetComputed"
                label="Computed Relation on Parent"
                rules={[{ required: true }]}
              >
                <Input placeholder="e.g., member, viewer" />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
