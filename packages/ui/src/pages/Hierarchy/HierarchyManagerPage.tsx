import {
  ApartmentOutlined,
  DeleteOutlined,
  DownOutlined,
  FileOutlined,
  FolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  useHierarchyChildren,
  useHierarchyParents,
  useHierarchySpec,
  useRemoveChildren,
  useScopeOptions,
} from '@api/hierarchy';
import { type ChildItem, getEdgeLabel, type HierarchyEdge } from '@openfga-admin/shared';
import { useConnectionStore } from '@store/connectionStore';
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Col,
  Empty,
  Input,
  List,
  Menu,
  Popconfirm,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import { useState } from 'react';
import { AddChildrenModal } from './components/AddChildrenModal';

const { Title, Text, Paragraph } = Typography;

// ============ Icon Mapping ============

function getTypeIcon(typeName: string) {
  const iconMap: Record<string, React.ReactNode> = {
    user: <UserOutlined />,
    group: <TeamOutlined />,
    team: <TeamOutlined />,
    organization: <ApartmentOutlined />,
    org: <ApartmentOutlined />,
    file: <FileOutlined />,
    folder: <FolderOutlined />,
    document: <FileOutlined />,
    knowledge_base: <FolderOutlined />,
  };
  return iconMap[typeName] || <ApartmentOutlined />;
}

// ============ Parent List Component ============

interface ParentListProps {
  edge: HierarchyEdge;
  scopeObject?: string;
  selectedParent: string | null;
  onSelectParent: (parent: string | null) => void;
}

function ParentList({ edge, scopeObject, selectedParent, onSelectParent }: ParentListProps) {
  const { data, isLoading, error, refetch } = useHierarchyParents(edge.id, scopeObject, {
    enabled: !!scopeObject || !edge.discoveryHint?.supportsScoped,
  });

  const [manualParents, setManualParents] = useState<string[]>([]);
  const [newParentInput, setNewParentInput] = useState('');

  const allParents = [...new Set([...(data?.parents || []), ...manualParents])];

  const handleAddManualParent = () => {
    if (newParentInput.trim()) {
      const parent = newParentInput.includes(':')
        ? newParentInput.trim()
        : `${edge.parentType}:${newParentInput.trim()}`;
      setManualParents((prev) => [...new Set([...prev, parent])]);
      setNewParentInput('');
    }
  };

  return (
    <Card
      title={
        <Space>
          {getTypeIcon(edge.parentType)}
          <Text strong>{edge.parentType}s</Text>
          <Badge count={allParents.length} showZero style={{ backgroundColor: '#1890ff' }} />
        </Space>
      }
      extra={
        <Space>
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} size="small" onClick={() => refetch()} />
          </Tooltip>
        </Space>
      }
      size="small"
      styles={{ body: { padding: 0 } }}
    >
      {/* Manual parent input */}
      <div style={{ padding: 12, borderBottom: '1px solid #303030' }}>
        <Space.Compact style={{ width: '100%' }}>
          <Input
            placeholder={`Add ${edge.parentType} ID...`}
            value={newParentInput}
            onChange={(e) => setNewParentInput(e.target.value)}
            onPressEnter={handleAddManualParent}
            prefix={getTypeIcon(edge.parentType)}
          />
          <Button icon={<PlusOutlined />} onClick={handleAddManualParent}>
            Add
          </Button>
        </Space.Compact>
      </div>

      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert
          message="Error loading parents"
          description={(error as Error).message}
          type="error"
        />
      ) : allParents.length === 0 ? (
        <Empty
          description={
            edge.discoveryHint?.supportsScoped && !scopeObject
              ? 'Select a scope to discover parents, or add manually'
              : 'No parents found. Add one manually.'
          }
          style={{ padding: 24 }}
        />
      ) : (
        <List
          size="small"
          dataSource={allParents}
          style={{ maxHeight: 400, overflow: 'auto' }}
          renderItem={(parent) => (
            <List.Item
              onClick={() => onSelectParent(parent === selectedParent ? null : parent)}
              style={{
                cursor: 'pointer',
                padding: '8px 12px',
                background: parent === selectedParent ? '#1890ff20' : 'transparent',
                borderLeft:
                  parent === selectedParent ? '3px solid #1890ff' : '3px solid transparent',
              }}
            >
              <Space>
                {parent === selectedParent ? <DownOutlined /> : <RightOutlined />}
                <Text>{parent}</Text>
              </Space>
            </List.Item>
          )}
        />
      )}
    </Card>
  );
}

// ============ Children Panel Component ============

interface ChildrenPanelProps {
  edge: HierarchyEdge;
  parentObject: string;
}

function ChildrenPanel({ edge, parentObject }: ChildrenPanelProps) {
  const { message } = App.useApp();
  const { data, isLoading, error, refetch } = useHierarchyChildren(edge.id, parentObject);
  const removeChildren = useRemoveChildren();

  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const handleRemoveSelected = async () => {
    if (selectedChildren.length === 0) return;

    try {
      const result = await removeChildren.mutateAsync({
        edgeId: edge.id,
        parentObject,
        children: selectedChildren,
      });

      if (result.errors.length > 0) {
        message.warning(`Removed ${result.removed}, ${result.errors.length} failed`);
      } else {
        message.success(`Removed ${result.removed} ${edge.childType}(s)`);
      }
      setSelectedChildren([]);
      refetch();
    } catch (err) {
      message.error(`Failed to remove: ${(err as Error).message}`);
    }
  };

  const handleRemoveSingle = async (childId: string) => {
    try {
      await removeChildren.mutateAsync({
        edgeId: edge.id,
        parentObject,
        children: [childId],
      });
      message.success(`Removed ${childId}`);
      refetch();
    } catch (err) {
      message.error(`Failed to remove: ${(err as Error).message}`);
    }
  };

  const toggleSelect = (childId: string) => {
    setSelectedChildren((prev) =>
      prev.includes(childId) ? prev.filter((c) => c !== childId) : [...prev, childId]
    );
  };

  const children = data?.children || [];

  return (
    <Card
      title={
        <Space>
          {getTypeIcon(edge.childType)}
          <Text strong>
            {edge.childType}s in <Text code>{parentObject}</Text>
          </Text>
          <Badge count={children.length} showZero style={{ backgroundColor: '#52c41a' }} />
        </Space>
      }
      extra={
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAddModal(true)}>
            Add {edge.childType}s
          </Button>
          {selectedChildren.length > 0 && (
            <Popconfirm
              title={`Remove ${selectedChildren.length} ${edge.childType}(s)?`}
              onConfirm={handleRemoveSelected}
              okButtonProps={{ danger: true }}
            >
              <Button danger icon={<DeleteOutlined />}>
                Remove ({selectedChildren.length})
              </Button>
            </Popconfirm>
          )}
          <Tooltip title="Refresh">
            <Button icon={<ReloadOutlined />} onClick={() => refetch()} />
          </Tooltip>
        </Space>
      }
      size="small"
      styles={{ body: { padding: 0 } }}
    >
      {isLoading ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : error ? (
        <Alert
          message="Error loading children"
          description={(error as Error).message}
          type="error"
        />
      ) : children.length === 0 ? (
        <Empty description={`No ${edge.childType}s found`} style={{ padding: 24 }}>
          <Button type="primary" onClick={() => setShowAddModal(true)}>
            Add {edge.childType}s
          </Button>
        </Empty>
      ) : (
        <List
          size="small"
          dataSource={children}
          style={{ maxHeight: 400, overflow: 'auto' }}
          renderItem={(child: ChildItem) => (
            <List.Item
              actions={[
                <Popconfirm
                  key="delete"
                  title={`Remove ${child.id}?`}
                  onConfirm={() => handleRemoveSingle(child.id)}
                  okButtonProps={{ danger: true }}
                >
                  <Button type="text" danger icon={<DeleteOutlined />} size="small" />
                </Popconfirm>,
              ]}
              style={{
                padding: '8px 12px',
                background: selectedChildren.includes(child.id) ? '#1890ff10' : 'transparent',
              }}
            >
              <Space>
                <input
                  type="checkbox"
                  checked={selectedChildren.includes(child.id)}
                  onChange={() => toggleSelect(child.id)}
                />
                {getTypeIcon(edge.childType)}
                <Text>{child.id}</Text>
                {child.condition && <Tag color="purple">{child.condition}</Tag>}
              </Space>
            </List.Item>
          )}
        />
      )}

      {/* Add Children Modal */}
      <AddChildrenModal
        open={showAddModal}
        edge={edge}
        parentObject={parentObject}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => {
          setShowAddModal(false);
          refetch();
        }}
      />
    </Card>
  );
}

// ============ Hierarchy Tab Content ============

interface HierarchyTabProps {
  edge: HierarchyEdge;
}

function HierarchyTab({ edge }: HierarchyTabProps) {
  const [selectedParent, setSelectedParent] = useState<string | null>(null);
  const [scopeObject, setScopeObject] = useState<string | undefined>(undefined);

  // Fetch scope options for dropdown
  const { data: scopeData, isLoading: scopeLoading } = useScopeOptions(edge.id, {
    enabled: !!edge.discoveryHint?.supportsScoped,
  });

  return (
    <div style={{ padding: 16 }}>
      {/* Scope selector if supported */}
      {edge.discoveryHint?.supportsScoped && (
        <Alert
          message="Scoped Discovery"
          description={
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Text>
                Select a {edge.discoveryHint.scopeType} to list {edge.parentType}s.
              </Text>
              <Select
                style={{ width: '100%', maxWidth: 400 }}
                placeholder={`Select ${edge.discoveryHint.scopeType}...`}
                value={scopeObject}
                onChange={(value) => {
                  setScopeObject(value);
                  setSelectedParent(null); // Reset parent selection when scope changes
                }}
                loading={scopeLoading}
                allowClear
                showSearch
                filterOption={(input, option) =>
                  (option?.value?.toString() || '').toLowerCase().includes(input.toLowerCase())
                }
                options={scopeData?.options.map((opt) => ({
                  value: opt,
                  label: opt,
                }))}
                notFoundContent={
                  scopeLoading ? (
                    <Spin size="small" />
                  ) : (
                    <Text type="secondary">No {edge.discoveryHint.scopeType}s found</Text>
                  )
                }
              />
            </Space>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        {/* Parent List */}
        <Col xs={24} md={10} lg={8}>
          <ParentList
            edge={edge}
            scopeObject={scopeObject}
            selectedParent={selectedParent}
            onSelectParent={setSelectedParent}
          />
        </Col>

        {/* Children Panel */}
        <Col xs={24} md={14} lg={16}>
          {selectedParent ? (
            <ChildrenPanel edge={edge} parentObject={selectedParent} />
          ) : (
            <Card>
              <Empty
                description="Select a parent from the left to view and manage its children"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            </Card>
          )}
        </Col>
      </Row>
    </div>
  );
}

// ============ Main Page ============

export default function HierarchyManagerPage() {
  const { getActiveProfile } = useConnectionStore();
  const profile = getActiveProfile();
  const { data: spec, isLoading, error } = useHierarchySpec();
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  if (!profile) {
    return (
      <Alert
        message="Not Connected"
        description="Please connect to an OpenFGA store to use the Grouped Permissions page."
        type="warning"
        showIcon
      />
    );
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin size="large" />
        <Paragraph style={{ marginTop: 16 }}>Analyzing authorization model...</Paragraph>
      </div>
    );
  }

  if (error) {
    return <Alert title="Error" description={(error as Error).message} type="error" showIcon />;
  }

  const edges = spec?.edges || [];

  if (edges.length === 0) {
    return (
      <Card>
        <Empty
          description={
            <Space orientation="vertical" align="center">
              <Title level={4}>No Hierarchies Detected</Title>
              <Paragraph type="secondary">
                The current authorization model doesn't have any detectable parent-child
                hierarchies.
              </Paragraph>
              <Paragraph type="secondary">Hierarchies are detected from:</Paragraph>
              <ul style={{ textAlign: 'left' }}>
                <li>
                  Relations named <Tag>member</Tag>, <Tag>members</Tag>, etc.
                </li>
                <li>
                  Relations named <Tag>parent</Tag>, <Tag>container</Tag>, etc.
                </li>
                <li>
                  Relations used as tuplesets in <code>from</code> rewrites
                </li>
              </ul>
            </Space>
          }
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  // Auto-select first edge if none selected
  const activeEdgeId = selectedEdgeId || edges[0]?.id;
  const activeEdge = edges.find((e) => e.id === activeEdgeId);

  // Group edges by parent type for better organization
  const edgesByParentType = edges.reduce(
    (acc, edge) => {
      if (!acc[edge.parentType]) {
        acc[edge.parentType] = [];
      }
      acc[edge.parentType].push(edge);
      return acc;
    },
    {} as Record<string, HierarchyEdge[]>
  );

  const menuItems = Object.entries(edgesByParentType).map(([parentType, typeEdges]) => ({
    key: `group-${parentType}`,
    label: (
      <Space>
        {getTypeIcon(parentType)}
        <span style={{ textTransform: 'capitalize' }}>{parentType}</span>
      </Space>
    ),
    type: 'group' as const,
    children: typeEdges.map((edge) => ({
      key: edge.id,
      icon: getTypeIcon(edge.childType),
      label: getEdgeLabel(edge),
    })),
  }));

  return (
    <Card styles={{ body: { padding: 0, display: 'flex', minHeight: 'calc(100vh - 200px)' } }}>
      {/* Side Menu */}
      <div
        style={{
          width: 240,
          borderRight: '1px solid #f0f0f0',
        }}
      >
        <div style={{ padding: '16px 16px 8px' }}>
          <Space>
            <ApartmentOutlined style={{ fontSize: 18, color: '#1890ff' }} />
            <Text strong>Hierarchies</Text>
          </Space>
          <div style={{ marginTop: 4 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {edges.length} detected from model
            </Text>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={activeEdgeId ? [activeEdgeId] : []}
          onClick={({ key }) => {
            if (!key.startsWith('group-')) {
              setSelectedEdgeId(key);
            }
          }}
          items={menuItems}
          style={{
            background: 'transparent',
            border: 'none',
          }}
        />
      </div>

      {/* Content Area */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeEdge ? (
          <HierarchyTab edge={activeEdge} />
        ) : (
          <div style={{ padding: 24 }}>
            <Empty description="Select a hierarchy from the menu" />
          </div>
        )}
      </div>
    </Card>
  );
}
