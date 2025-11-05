import { DiffOutlined } from '@ant-design/icons';
import type { AuthorizationModel } from '@openfga-admin/shared';
import { Alert, Badge, Card, Col, Empty, Row, Select, Space, Tag, Typography } from 'antd';
import { useMemo } from 'react';

const { Text } = Typography;

interface ModelDiffViewerProps {
  models: AuthorizationModel[];
  leftModelId?: string;
  rightModelId?: string;
  onLeftModelChange?: (modelId: string) => void;
  onRightModelChange?: (modelId: string) => void;
}

interface TypeDiff {
  typeName: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  leftRelations: string[];
  rightRelations: string[];
  addedRelations: string[];
  removedRelations: string[];
  changedRelations: string[];
}

function compareModels(
  leftModel?: AuthorizationModel,
  rightModel?: AuthorizationModel
): TypeDiff[] {
  if (!leftModel || !rightModel) return [];

  const leftTypes = new Map<string, Record<string, unknown>>();
  const rightTypes = new Map<string, Record<string, unknown>>();

  for (const td of leftModel.type_definitions || []) {
    leftTypes.set(td.type, td.relations || {});
  }

  for (const td of rightModel.type_definitions || []) {
    rightTypes.set(td.type, td.relations || {});
  }

  const allTypeNames = new Set([...leftTypes.keys(), ...rightTypes.keys()]);
  const diffs: TypeDiff[] = [];

  for (const typeName of allTypeNames) {
    const leftRelations = leftTypes.get(typeName);
    const rightRelations = rightTypes.get(typeName);

    const leftRelationNames = leftRelations ? Object.keys(leftRelations) : [];
    const rightRelationNames = rightRelations ? Object.keys(rightRelations) : [];

    if (!leftRelations) {
      // Type was added
      diffs.push({
        typeName,
        status: 'added',
        leftRelations: [],
        rightRelations: rightRelationNames,
        addedRelations: rightRelationNames,
        removedRelations: [],
        changedRelations: [],
      });
    } else if (!rightRelations) {
      // Type was removed
      diffs.push({
        typeName,
        status: 'removed',
        leftRelations: leftRelationNames,
        rightRelations: [],
        addedRelations: [],
        removedRelations: leftRelationNames,
        changedRelations: [],
      });
    } else {
      // Type exists in both - compare relations
      const allRelations = new Set([...leftRelationNames, ...rightRelationNames]);
      const addedRelations: string[] = [];
      const removedRelations: string[] = [];
      const changedRelations: string[] = [];

      for (const rel of allRelations) {
        const leftRel = leftRelations[rel];
        const rightRel = rightRelations[rel];

        if (!leftRel) {
          addedRelations.push(rel);
        } else if (!rightRel) {
          removedRelations.push(rel);
        } else if (JSON.stringify(leftRel) !== JSON.stringify(rightRel)) {
          changedRelations.push(rel);
        }
      }

      const hasChanges =
        addedRelations.length > 0 || removedRelations.length > 0 || changedRelations.length > 0;

      diffs.push({
        typeName,
        status: hasChanges ? 'changed' : 'unchanged',
        leftRelations: leftRelationNames,
        rightRelations: rightRelationNames,
        addedRelations,
        removedRelations,
        changedRelations,
      });
    }
  }

  // Sort: changed/added/removed first, then unchanged
  return diffs.sort((a, b) => {
    const statusOrder = { added: 0, removed: 1, changed: 2, unchanged: 3 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
}

function getStatusColor(status: TypeDiff['status']): string {
  switch (status) {
    case 'added':
      return '#52c41a';
    case 'removed':
      return '#ff4d4f';
    case 'changed':
      return '#faad14';
    default:
      return '#d9d9d9';
  }
}

function getStatusTag(status: TypeDiff['status']): React.ReactNode {
  switch (status) {
    case 'added':
      return <Tag color="success">Added</Tag>;
    case 'removed':
      return <Tag color="error">Removed</Tag>;
    case 'changed':
      return <Tag color="warning">Modified</Tag>;
    case 'unchanged':
      return <Tag>Unchanged</Tag>;
  }
}

export function ModelDiffViewer({
  models,
  leftModelId,
  rightModelId,
  onLeftModelChange,
  onRightModelChange,
}: ModelDiffViewerProps) {
  const leftModel = useMemo(() => models.find((m) => m.id === leftModelId), [models, leftModelId]);

  const rightModel = useMemo(
    () => models.find((m) => m.id === rightModelId),
    [models, rightModelId]
  );

  const diffs = useMemo(() => compareModels(leftModel, rightModel), [leftModel, rightModel]);

  const summary = useMemo(() => {
    const added = diffs.filter((d) => d.status === 'added').length;
    const removed = diffs.filter((d) => d.status === 'removed').length;
    const changed = diffs.filter((d) => d.status === 'changed').length;
    return { added, removed, changed };
  }, [diffs]);

  const modelOptions = models.map((m) => ({
    value: m.id,
    label: `${m.id?.slice(0, 8)}... (${m.type_definitions?.length || 0} types)`,
  }));

  if (models.length < 2) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="At least 2 model versions are required for comparison"
      />
    );
  }

  return (
    <div>
      {/* Model Selection */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={12}>
          <Card size="small" title="Base Model (Left)">
            <Select
              style={{ width: '100%' }}
              value={leftModelId}
              onChange={onLeftModelChange}
              options={modelOptions}
              placeholder="Select base model..."
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="Compare Model (Right)">
            <Select
              style={{ width: '100%' }}
              value={rightModelId}
              onChange={onRightModelChange}
              options={modelOptions}
              placeholder="Select model to compare..."
            />
          </Card>
        </Col>
      </Row>

      {/* Summary */}
      {leftModel && rightModel && (
        <>
          <Alert
            type="info"
            showIcon
            icon={<DiffOutlined />}
            message="Diff Summary"
            description={
              <Space size="large">
                <Badge color="#52c41a" text={`${summary.added} types added`} />
                <Badge color="#ff4d4f" text={`${summary.removed} types removed`} />
                <Badge color="#faad14" text={`${summary.changed} types modified`} />
              </Space>
            }
            style={{ marginBottom: 16 }}
          />

          {/* Diff View */}
          <Row gutter={16}>
            <Col span={24}>
              {diffs.length === 0 ? (
                <Empty description="No differences found" />
              ) : (
                diffs.map((diff) => (
                  <Card
                    key={diff.typeName}
                    size="small"
                    style={{
                      marginBottom: 8,
                      borderLeft: `4px solid ${getStatusColor(diff.status)}`,
                    }}
                  >
                    <Row gutter={16}>
                      <Col span={24}>
                        <Space style={{ marginBottom: 8 }}>
                          <Text strong style={{ fontSize: 16 }}>
                            type {diff.typeName}
                          </Text>
                          {getStatusTag(diff.status)}
                        </Space>
                      </Col>
                    </Row>

                    {diff.status !== 'unchanged' && (
                      <Row gutter={16}>
                        {/* Left side - Base model */}
                        <Col span={12}>
                          <div
                            style={{
                              backgroundColor: '#141414',
                              padding: 12,
                              borderRadius: 4,
                              minHeight: 80,
                            }}
                          >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Base Model
                            </Text>
                            <div style={{ marginTop: 8 }}>
                              {diff.leftRelations.length === 0 ? (
                                <Text type="secondary" italic>
                                  (type not present)
                                </Text>
                              ) : (
                                diff.leftRelations.map((rel) => {
                                  const isRemoved = diff.removedRelations.includes(rel);
                                  const isChanged = diff.changedRelations.includes(rel);
                                  return (
                                    <div
                                      key={rel}
                                      style={{
                                        padding: '2px 8px',
                                        marginBottom: 4,
                                        borderRadius: 2,
                                        backgroundColor: isRemoved
                                          ? 'rgba(255, 77, 79, 0.2)'
                                          : isChanged
                                            ? 'rgba(250, 173, 20, 0.2)'
                                            : 'transparent',
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color: isRemoved
                                            ? '#ff4d4f'
                                            : isChanged
                                              ? '#faad14'
                                              : '#d9d9d9',
                                          textDecoration: isRemoved ? 'line-through' : 'none',
                                        }}
                                      >
                                        define {rel}
                                      </Text>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </Col>

                        {/* Right side - Compare model */}
                        <Col span={12}>
                          <div
                            style={{
                              backgroundColor: '#141414',
                              padding: 12,
                              borderRadius: 4,
                              minHeight: 80,
                            }}
                          >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              Compare Model
                            </Text>
                            <div style={{ marginTop: 8 }}>
                              {diff.rightRelations.length === 0 ? (
                                <Text type="secondary" italic>
                                  (type not present)
                                </Text>
                              ) : (
                                diff.rightRelations.map((rel) => {
                                  const isAdded = diff.addedRelations.includes(rel);
                                  const isChanged = diff.changedRelations.includes(rel);
                                  return (
                                    <div
                                      key={rel}
                                      style={{
                                        padding: '2px 8px',
                                        marginBottom: 4,
                                        borderRadius: 2,
                                        backgroundColor: isAdded
                                          ? 'rgba(82, 196, 26, 0.2)'
                                          : isChanged
                                            ? 'rgba(250, 173, 20, 0.2)'
                                            : 'transparent',
                                      }}
                                    >
                                      <Text
                                        style={{
                                          color: isAdded
                                            ? '#52c41a'
                                            : isChanged
                                              ? '#faad14'
                                              : '#d9d9d9',
                                        }}
                                      >
                                        {isAdded && '+ '}
                                        define {rel}
                                      </Text>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        </Col>
                      </Row>
                    )}
                  </Card>
                ))
              )}
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
