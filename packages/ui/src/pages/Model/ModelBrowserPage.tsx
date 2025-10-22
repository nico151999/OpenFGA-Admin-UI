import {
  ApartmentOutlined,
  CodeOutlined,
  EditOutlined,
  LinkOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useAuthorizationModel, useAuthorizationModels } from '@api/openfga';
import type { RelationReference, Userset } from '@openfga-admin/shared';
import { useConnectionStore } from '@store/connectionStore';
import {
  Badge,
  Button,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

export default function ModelBrowserPage() {
  const navigate = useNavigate();
  const { getActiveProfile, updateProfile } = useConnectionStore();
  const profile = getActiveProfile();

  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedRelation, setSelectedRelation] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(
    profile?.authorizationModelId
  );

  const { data: models, isLoading: modelsLoading } = useAuthorizationModels();
  const { data: model, isLoading: modelLoading, refetch } = useAuthorizationModel(selectedModelId);

  const isLoading = modelsLoading || modelLoading;

  // Helper to count total relations in a model
  const countRelations = (m: typeof model) => {
    if (!m?.type_definitions) return 0;
    return m.type_definitions.reduce((acc, t) => acc + Object.keys(t.relations || {}).length, 0);
  };

  // Handle model selection change
  const handleModelChange = (modelId: string) => {
    setSelectedModelId(modelId);
    // Also update profile if in pinned mode
    if (profile?.modelSelectionMode === 'pinned') {
      updateProfile(profile.id, { authorizationModelId: modelId });
    }
  };

  // Build tree data from model
  const treeData = useMemo((): DataNode[] => {
    if (!model?.type_definitions) return [];

    return model.type_definitions.map((typeDef) => ({
      key: typeDef.type,
      title: (
        <Space>
          <ApartmentOutlined />
          <Text strong>{typeDef.type}</Text>
          <Badge
            count={Object.keys(typeDef.relations || {}).length}
            style={{ backgroundColor: '#1890ff' }}
          />
        </Space>
      ),
      children: Object.entries(typeDef.relations || {}).map(([relName, relDef]) => ({
        key: `${typeDef.type}#${relName}`,
        title: (
          <Space>
            <LinkOutlined />
            <Text>{relName}</Text>
            <Tag color={getRelationTypeColor(relDef)}>{getRelationType(relDef)}</Tag>
          </Space>
        ),
        isLeaf: true,
      })),
    }));
  }, [model]);

  // Get selected type definition
  const selectedTypeDef = useMemo(() => {
    if (!selectedType || !model?.type_definitions) return null;
    return model.type_definitions.find((t) => t.type === selectedType);
  }, [model, selectedType]);

  // Get relation details
  const selectedRelationDef = useMemo(() => {
    if (!selectedRelation || !selectedTypeDef?.relations) return null;
    const [, relName] = selectedRelation.split('#');
    return {
      name: relName,
      definition: selectedTypeDef.relations[relName],
      metadata: selectedTypeDef.metadata?.relations?.[relName],
    };
  }, [selectedTypeDef, selectedRelation]);

  const handleSelect = (keys: React.Key[]) => {
    const key = keys[0]?.toString();
    if (!key) return;

    if (key.includes('#')) {
      setSelectedRelation(key);
      setSelectedType(key.split('#')[0]);
    } else {
      setSelectedType(key);
      setSelectedRelation(null);
    }
  };

  const handlePinModel = () => {
    if (profile && model?.id) {
      updateProfile(profile.id, {
        authorizationModelId: model.id,
        modelSelectionMode: 'pinned',
      });
    }
  };

  const handleUnpinModel = () => {
    if (profile) {
      updateProfile(profile.id, {
        authorizationModelId: undefined,
        modelSelectionMode: 'latest',
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Spin size="large" />
          <Paragraph style={{ marginTop: 16 }}>Loading authorization model...</Paragraph>
        </div>
      </Card>
    );
  }

  if (!model) {
    return (
      <Card>
        <Empty
          image={<ApartmentOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
          description={
            <>
              <Title level={4}>No Authorization Model Found</Title>
              <Paragraph type="secondary">
                This store doesn't have an authorization model yet. Create one to define your
                permission structure.
              </Paragraph>
            </>
          }
        >
          <Button type="primary" icon={<EditOutlined />} onClick={() => navigate('/model/edit')}>
            Create Model
          </Button>
        </Empty>
      </Card>
    );
  }

  return (
    <Row gutter={[16, 16]}>
      {/* Model Version Selector */}
      <Col span={24}>
        <Card size="small">
          <Row justify="space-between" align="middle">
            <Col>
              <Space>
                <Text strong>Authorization Model</Text>
                <Select
                  style={{ width: 400 }}
                  value={selectedModelId || model?.id}
                  onChange={handleModelChange}
                  loading={modelsLoading}
                  optionLabelProp="label"
                  options={models?.map((m, index) => ({
                    value: m.id,
                    label: `${m.id.slice(0, 12)}... (v${m.schema_version})`,
                    desc: m,
                    index,
                  }))}
                  optionRender={(option) => {
                    const m = option.data.desc;
                    const idx = option.data.index;
                    const typeCount = m?.type_definitions?.length || 0;
                    const relCount = countRelations(m);
                    return (
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space>
                          <Text code style={{ fontSize: 12 }}>
                            {m?.id?.slice(0, 16)}...
                          </Text>
                          {idx === 0 && (
                            <Tag color="green" style={{ marginLeft: 4 }}>
                              Latest
                            </Tag>
                          )}
                        </Space>
                        <Space size="small">
                          <Tag>v{m?.schema_version}</Tag>
                          <Tag color="blue">{typeCount} types</Tag>
                          <Tag color="purple">{relCount} relations</Tag>
                        </Space>
                      </Space>
                    );
                  }}
                />
                {profile?.modelSelectionMode === 'pinned' ? (
                  <Tooltip title="Unpin to use latest model">
                    <Button
                      type="text"
                      icon={<PushpinFilled style={{ color: '#1890ff' }} />}
                      onClick={handleUnpinModel}
                    />
                  </Tooltip>
                ) : (
                  <Tooltip title="Pin this model version">
                    <Button type="text" icon={<PushpinOutlined />} onClick={handlePinModel} />
                  </Tooltip>
                )}
              </Space>
            </Col>
            <Col>
              <Space>
                <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
                  Refresh
                </Button>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => navigate('/model/edit')}
                >
                  Edit Model
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>
      </Col>

      {/* Type Tree */}
      <Col xs={24} lg={8}>
        <Card
          title={
            <Space>
              <ApartmentOutlined />
              <span>Types & Relations</span>
            </Space>
          }
          styles={{ body: { padding: 0 } }}
        >
          {treeData.length > 0 ? (
            <Tree
              treeData={treeData}
              selectedKeys={
                selectedRelation ? [selectedRelation] : selectedType ? [selectedType] : []
              }
              expandedKeys={expandedKeys}
              onSelect={handleSelect}
              onExpand={(keys) => setExpandedKeys(keys as string[])}
              showLine={{ showLeafIcon: false }}
              style={{ padding: 16 }}
            />
          ) : (
            <Empty description="No types defined" style={{ padding: 24 }} />
          )}
        </Card>
      </Col>

      {/* Details Panel */}
      <Col xs={24} lg={16}>
        {selectedTypeDef ? (
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            {/* Type Info */}
            <Card
              title={
                <Space>
                  <ApartmentOutlined />
                  <span>Type: {selectedTypeDef.type}</span>
                </Space>
              }
            >
              <Descriptions column={2} size="small">
                <Descriptions.Item label="Type Name">{selectedTypeDef.type}</Descriptions.Item>
                <Descriptions.Item label="Relations">
                  {Object.keys(selectedTypeDef.relations || {}).length}
                </Descriptions.Item>
                {selectedTypeDef.metadata?.module && (
                  <Descriptions.Item label="Module">
                    {selectedTypeDef.metadata.module}
                  </Descriptions.Item>
                )}
              </Descriptions>

              {/* Relations List */}
              <Title level={5} style={{ marginTop: 16 }}>
                Relations
              </Title>
              <Collapse
                accordion
                items={Object.entries(selectedTypeDef.relations || {}).map(([relName, relDef]) => {
                  const metadata = selectedTypeDef.metadata?.relations?.[relName];
                  return {
                    key: relName,
                    label: (
                      <Space>
                        <LinkOutlined />
                        <Text strong>{relName}</Text>
                        <Tag color={getRelationTypeColor(relDef)}>{getRelationType(relDef)}</Tag>
                      </Space>
                    ),
                    children: (
                      <RelationDetails name={relName} definition={relDef} metadata={metadata} />
                    ),
                  };
                })}
              />
            </Card>

            {/* Selected Relation Details */}
            {selectedRelationDef && (
              <Card
                title={
                  <Space>
                    <LinkOutlined />
                    <span>
                      Relation: {selectedTypeDef.type}#{selectedRelationDef.name}
                    </span>
                  </Space>
                }
              >
                <RelationDetails
                  name={selectedRelationDef.name}
                  definition={selectedRelationDef.definition}
                  metadata={selectedRelationDef.metadata}
                  detailed
                />
              </Card>
            )}
          </Space>
        ) : (
          <Card>
            <Empty description="Select a type or relation from the tree to view details" />
          </Card>
        )}
      </Col>

      {/* Conditions Panel */}
      {model.conditions && Object.keys(model.conditions).length > 0 && (
        <Col span={24}>
          <Card
            title={
              <Space>
                <CodeOutlined />
                <span>Conditions</span>
                <Badge
                  count={Object.keys(model.conditions).length}
                  style={{ backgroundColor: '#722ed1' }}
                />
              </Space>
            }
          >
            <Collapse
              items={Object.entries(model.conditions).map(([name, condition]) => ({
                key: name,
                label: <Text strong>{name}</Text>,
                children: (
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="Expression">
                      <Text code>{condition.expression}</Text>
                    </Descriptions.Item>
                    {condition.parameters && (
                      <Descriptions.Item label="Parameters">
                        <Space wrap>
                          {Object.entries(condition.parameters).map(([paramName, paramType]) => (
                            <Tag key={paramName}>
                              {paramName}: {paramType.type_name}
                            </Tag>
                          ))}
                        </Space>
                      </Descriptions.Item>
                    )}
                  </Descriptions>
                ),
              }))}
            />
          </Card>
        </Col>
      )}
    </Row>
  );
}

// Helper Components
interface RelationDetailsProps {
  name: string;
  definition: Userset;
  metadata?: {
    directly_related_user_types?: RelationReference[];
  };
  detailed?: boolean;
}

function RelationDetails({ definition, metadata }: RelationDetailsProps) {
  return (
    <Space orientation="vertical" style={{ width: '100%' }}>
      <Descriptions column={2} size="small">
        <Descriptions.Item label="Type">
          <Tag color={getRelationTypeColor(definition)}>{getRelationType(definition)}</Tag>
        </Descriptions.Item>
        {definition.computedUserset && (
          <Descriptions.Item label="Computed From">
            <Tag color="purple">{definition.computedUserset.relation}</Tag>
          </Descriptions.Item>
        )}
        {definition.tupleToUserset && (
          <>
            <Descriptions.Item label="Tupleset">
              <Tag color="cyan">{definition.tupleToUserset.tupleset.relation}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Computed Userset">
              <Tag color="purple">{definition.tupleToUserset.computedUserset.relation}</Tag>
            </Descriptions.Item>
          </>
        )}
      </Descriptions>

      {metadata?.directly_related_user_types && metadata.directly_related_user_types.length > 0 && (
        <>
          <Text type="secondary">Allowed User Types:</Text>
          <Space wrap>
            {metadata.directly_related_user_types.map((ref, idx) => (
              <Tag key={idx} color="blue">
                {ref.type}
                {ref.relation && `#${ref.relation}`}
                {ref.wildcard && ':*'}
                {ref.condition && ` with ${ref.condition}`}
              </Tag>
            ))}
          </Space>
        </>
      )}

      {definition.union && (
        <>
          <Text type="secondary">Union of:</Text>
          <Space wrap>
            {definition.union.child.map((child, idx) => (
              <Tag key={idx} color="green">
                {getUsersetLabel(child)}
              </Tag>
            ))}
          </Space>
        </>
      )}

      {definition.intersection && (
        <>
          <Text type="secondary">Intersection of:</Text>
          <Space wrap>
            {definition.intersection.child.map((child, idx) => (
              <Tag key={idx} color="orange">
                {getUsersetLabel(child)}
              </Tag>
            ))}
          </Space>
        </>
      )}

      {definition.difference && (
        <>
          <Text type="secondary">Difference:</Text>
          <Space>
            <Tag color="green">{getUsersetLabel(definition.difference.base)}</Tag>
            <Text>minus</Text>
            <Tag color="red">{getUsersetLabel(definition.difference.subtract)}</Tag>
          </Space>
        </>
      )}
    </Space>
  );
}

// Helper functions
function getRelationType(userset: Userset): string {
  if (userset.this) return 'direct';
  if (userset.computedUserset) return 'computed';
  if (userset.tupleToUserset) return 'tuple-to-userset';
  if (userset.union) return 'union';
  if (userset.intersection) return 'intersection';
  if (userset.difference) return 'difference';
  return 'unknown';
}

function getRelationTypeColor(userset: Userset): string {
  if (userset.this) return 'blue';
  if (userset.computedUserset) return 'purple';
  if (userset.tupleToUserset) return 'cyan';
  if (userset.union) return 'green';
  if (userset.intersection) return 'orange';
  if (userset.difference) return 'red';
  return 'default';
}

function getUsersetLabel(userset: Userset): string {
  if (userset.this) return '[direct]';
  if (userset.computedUserset) return userset.computedUserset.relation;
  if (userset.tupleToUserset) {
    return `${userset.tupleToUserset.tupleset.relation}->${userset.tupleToUserset.computedUserset.relation}`;
  }
  if (userset.union) return `union(${userset.union.child.length})`;
  if (userset.intersection) return `intersection(${userset.intersection.child.length})`;
  if (userset.difference) return 'difference';
  return 'unknown';
}
