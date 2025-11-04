import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  ExpandOutlined,
  FileOutlined,
  PlusOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  useAuthorizationModel,
  useBatchCheck,
  useCheck,
  useExpand,
  useListObjects,
  useListUsers,
  useTuples,
} from '@api/openfga';
import { useConnectionStore } from '@store/connectionStore';
import {
  Alert,
  AutoComplete,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  Input,
  List,
  message,
  Result,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { DataNode } from 'antd/es/tree';
import { useMemo, useState } from 'react';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

export default function AccessExplorerPage() {
  const [activeTab, setActiveTab] = useState('check');
  useConnectionStore();

  const { data: model } = useAuthorizationModel();

  // Fetch tuples for autocomplete suggestions
  const { data: tuplesData } = useTuples({ pageSize: 100 });

  const types = useMemo(() => {
    return model?.type_definitions?.map((t) => t.type) || [];
  }, [model]);

  // Extract unique users from tuples for autocomplete
  const userSuggestions = useMemo(() => {
    const users = new Set<string>();
    tuplesData?.tuples?.forEach((tuple) => {
      if (tuple.key?.user) users.add(tuple.key.user);
    });
    return Array.from(users).map((u) => ({ value: u, label: u }));
  }, [tuplesData]);

  // Extract unique objects from tuples for autocomplete (grouped by type)
  const objectSuggestions = useMemo(() => {
    const objects = new Set<string>();
    tuplesData?.tuples?.forEach((tuple) => {
      if (tuple.key?.object) objects.add(tuple.key.object);
    });
    return Array.from(objects).map((o) => ({ value: o, label: o }));
  }, [tuplesData]);

  // Get object IDs for a specific type
  const getObjectIdsForType = (type: string): { value: string; label: string }[] => {
    const ids = new Set<string>();
    tuplesData?.tuples?.forEach((tuple) => {
      if (tuple.key?.object?.startsWith(`${type}:`)) {
        const id = tuple.key.object.split(':').slice(1).join(':');
        ids.add(id);
      }
    });
    return Array.from(ids).map((id) => ({ value: id, label: id }));
  };

  const getRelationsForType = (type: string): string[] => {
    const typeDef = model?.type_definitions?.find((t) => t.type === type);
    return typeDef?.relations ? Object.keys(typeDef.relations) : [];
  };

  return (
    <Card>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'check',
            label: (
              <Space>
                <CheckCircleOutlined />
                Check
              </Space>
            ),
            children: (
              <CheckTab
                types={types}
                getRelationsForType={getRelationsForType}
                userSuggestions={userSuggestions}
                getObjectIdsForType={getObjectIdsForType}
              />
            ),
          },
          {
            key: 'batch-check',
            label: (
              <Space>
                <ThunderboltOutlined />
                Batch Check
              </Space>
            ),
            children: (
              <BatchCheckTab
                types={types}
                getRelationsForType={getRelationsForType}
                userSuggestions={userSuggestions}
                objectSuggestions={objectSuggestions}
              />
            ),
          },
          {
            key: 'list-objects',
            label: (
              <Space>
                <FileOutlined />
                List Objects
              </Space>
            ),
            children: (
              <ListObjectsTab
                types={types}
                getRelationsForType={getRelationsForType}
                userSuggestions={userSuggestions}
              />
            ),
          },
          {
            key: 'list-users',
            label: (
              <Space>
                <UserOutlined />
                List Users
              </Space>
            ),
            children: (
              <ListUsersTab
                types={types}
                getRelationsForType={getRelationsForType}
                objectSuggestions={objectSuggestions}
              />
            ),
          },
          {
            key: 'expand',
            label: (
              <Space>
                <ExpandOutlined />
                Expand
              </Space>
            ),
            children: (
              <ExpandTab
                types={types}
                getRelationsForType={getRelationsForType}
                objectSuggestions={objectSuggestions}
              />
            ),
          },
        ]}
      />
    </Card>
  );
}

// ============ Check Tab ============
interface TabProps {
  types: string[];
  getRelationsForType: (type: string) => string[];
  userSuggestions?: { value: string; label: string }[];
  objectSuggestions?: { value: string; label: string }[];
  getObjectIdsForType?: (type: string) => { value: string; label: string }[];
}

function CheckTab({
  types,
  getRelationsForType,
  userSuggestions = [],
  getObjectIdsForType,
}: TabProps) {
  const [form] = Form.useForm();
  const [result, setResult] = useState<{ allowed: boolean; resolution?: string } | null>(null);
  const check = useCheck();
  const { addRecentItem } = useConnectionStore();

  const [objectType, setObjectType] = useState<string>('');
  const [contextTuples, setContextTuples] = useState<string>('');
  const [contextError, setContextError] = useState<string>('');

  // Update object ID when type changes
  const handleTypeChange = (type: string) => {
    setObjectType(type);
    form.setFieldValue('relation', undefined); // Clear relation when type changes
    const currentObject = form.getFieldValue('object') || '';
    // Update object field with new type prefix if it has the old format
    const objectId = currentObject.includes(':')
      ? currentObject.split(':').slice(1).join(':')
      : currentObject;
    if (objectId) {
      form.setFieldValue('object', `${type}:${objectId}`);
    }
  };

  const parseContextTuples = (text: string) => {
    if (!text.trim()) return [];
    try {
      const parsed = JSON.parse(text);
      setContextError('');
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (_e) {
      setContextError('Invalid JSON format');
      return [];
    }
  };

  const handleCheck = async (values: {
    user: string;
    type: string;
    relation: string;
    object: string;
  }) => {
    try {
      const context = parseContextTuples(contextTuples);
      // Construct full object reference: type:id
      const fullObject = values.object.includes(':')
        ? values.object
        : `${values.type}:${values.object}`;
      const response = await check.mutateAsync({
        tuple_key: {
          user: values.user,
          relation: values.relation,
          object: fullObject,
        },
        contextual_tuples: context.length > 0 ? { tuple_keys: context } : undefined,
      });
      setResult(response);
      addRecentItem({ type: 'tuple', value: `${values.user} ${values.relation} ${fullObject}` });
    } catch (_error) {
      setResult(null);
    }
  };

  return (
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <Form form={form} layout="vertical" onFinish={handleCheck}>
          <Alert
            message="Permission Check"
            description="Check if a user has a specific permission on an object. Add contextual tuples for temporary relationships."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="user"
            label="User"
            rules={[{ required: true }]}
            tooltip="The user to check (e.g., user:alice)"
          >
            <AutoComplete
              placeholder="user:alice"
              options={userSuggestions}
              filterOption={(inputValue, option) =>
                option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
              }
            >
              <Input prefix={<UserOutlined />} />
            </AutoComplete>
          </Form.Item>

          <Form.Item
            name="type"
            label="Object Type"
            rules={[{ required: true }]}
            tooltip="The type of object to check"
          >
            <Select
              placeholder="Select type"
              onChange={handleTypeChange}
              options={types.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>

          <Form.Item
            name="object"
            label="Object ID"
            rules={[{ required: true }]}
            tooltip="The object to check access on (type:id format will be constructed from type + ID)"
          >
            <AutoComplete
              placeholder="readme"
              options={getObjectIdsForType?.(objectType) || []}
              filterOption={(inputValue, option) =>
                option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
              }
            >
              <Input prefix={<FileOutlined />} />
            </AutoComplete>
          </Form.Item>

          <Form.Item
            name="relation"
            label="Relation"
            rules={[{ required: true }]}
            tooltip="The permission/relation to check"
          >
            <Select placeholder="Select relation">
              {getRelationsForType(objectType).map((r) => (
                <Select.Option key={r} value={r}>
                  {r}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Collapse
            ghost
            style={{ marginBottom: 16 }}
            items={[
              {
                key: 'context',
                label: 'Contextual Tuples (Optional)',
                children: (
                  <>
                    <TextArea
                      rows={4}
                      placeholder={`[{"user": "user:bob", "relation": "viewer", "object": "document:readme"}]`}
                      value={contextTuples}
                      onChange={(e) => setContextTuples(e.target.value)}
                      status={contextError ? 'error' : undefined}
                    />
                    {contextError && (
                      <Text type="danger" style={{ fontSize: 12 }}>
                        {contextError}
                      </Text>
                    )}
                    <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                      Add temporary tuples that exist only for this check (JSON array format)
                    </Text>
                  </>
                ),
              },
            ]}
          />

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={check.isPending}
              icon={<SearchOutlined />}
            >
              Check Permission
            </Button>
          </Form.Item>
        </Form>
      </Col>

      <Col xs={24} lg={12}>
        {check.isPending ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : result ? (
          <Result
            status={result.allowed ? 'success' : 'error'}
            icon={result.allowed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
            title={result.allowed ? 'Access Allowed' : 'Access Denied'}
            subTitle={
              <>
                <Text>
                  {form.getFieldValue('user')} <Tag>{form.getFieldValue('relation')}</Tag>{' '}
                  {form.getFieldValue('object')}
                </Text>
                {result.resolution && (
                  <Paragraph type="secondary" style={{ marginTop: 8 }}>
                    Resolution: {result.resolution}
                  </Paragraph>
                )}
              </>
            }
            extra={[
              <Button
                key="copy"
                icon={<CopyOutlined />}
                onClick={() => {
                  navigator.clipboard.writeText(
                    JSON.stringify({ ...form.getFieldsValue(), result }, null, 2)
                  );
                }}
              >
                Copy Result
              </Button>,
            ]}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
            <QuestionCircleOutlined style={{ fontSize: 48 }} />
            <Paragraph style={{ marginTop: 16 }}>
              Enter details and click "Check Permission"
            </Paragraph>
          </div>
        )}
      </Col>
    </Row>
  );
}

// ============ Batch Check Tab ============
interface BatchCheckItem {
  key: string;
  user: string;
  relation: string;
  object: string;
  allowed?: boolean;
  checked?: boolean;
}

function BatchCheckTab({
  types: _types,
  getRelationsForType,
  userSuggestions = [],
  objectSuggestions = [],
}: TabProps) {
  const [checks, setChecks] = useState<BatchCheckItem[]>([
    { key: '1', user: '', relation: '', object: '' },
  ]);
  const [results, setResults] = useState<BatchCheckItem[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const batchCheck = useBatchCheck();

  const addRow = () => {
    setChecks([...checks, { key: Date.now().toString(), user: '', relation: '', object: '' }]);
  };

  const removeRow = (key: string) => {
    if (checks.length > 1) {
      setChecks(checks.filter((c) => c.key !== key));
    }
  };

  const updateRow = (key: string, field: string, value: string) => {
    setChecks(checks.map((c) => (c.key === key ? { ...c, [field]: value } : c)));
  };

  const handleBatchCheck = async () => {
    const validChecks = checks.filter((c) => c.user && c.relation && c.object);
    if (validChecks.length === 0) {
      message.warning('Add at least one complete check');
      return;
    }

    setIsChecking(true);
    try {
      const response = await batchCheck.mutateAsync({
        checks: validChecks.map((c) => ({
          tuple_key: { user: c.user, relation: c.relation, object: c.object },
          correlation_id: c.key,
        })),
      });

      // API returns "result" (singular)
      const resultMap = new Map(
        Object.entries(response.result || {}).map(([corrId, data]) => [
          corrId,
          (data as { allowed?: boolean }).allowed ?? false,
        ])
      );

      setResults(
        validChecks.map((c) => ({
          ...c,
          allowed: resultMap.get(c.key) ?? false,
          checked: true,
        }))
      );
    } catch (_error) {
      message.error('Batch check failed');
    } finally {
      setIsChecking(false);
    }
  };

  const columns: ColumnsType<BatchCheckItem> = [
    {
      title: 'User',
      dataIndex: 'user',
      key: 'user',
      render: (_, record) => (
        <AutoComplete
          size="small"
          placeholder="user:alice"
          value={record.user}
          options={userSuggestions}
          onChange={(v) => updateRow(record.key, 'user', v)}
          filterOption={(inputValue, option) =>
            option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
          }
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: 'Relation',
      dataIndex: 'relation',
      key: 'relation',
      render: (_, record) => {
        const objType = record.object.split(':')[0];
        return (
          <Select
            size="small"
            style={{ width: '100%' }}
            placeholder="Select"
            value={record.relation || undefined}
            onChange={(v) => updateRow(record.key, 'relation', v)}
          >
            {getRelationsForType(objType).map((r) => (
              <Select.Option key={r} value={r}>
                {r}
              </Select.Option>
            ))}
          </Select>
        );
      },
    },
    {
      title: 'Object',
      dataIndex: 'object',
      key: 'object',
      render: (_, record) => (
        <AutoComplete
          size="small"
          placeholder="document:readme"
          value={record.object}
          options={objectSuggestions}
          onChange={(v) => updateRow(record.key, 'object', v)}
          filterOption={(inputValue, option) =>
            option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
          }
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 40,
      render: (_, record) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => removeRow(record.key)}
          disabled={checks.length === 1}
        />
      ),
    },
  ];

  const resultColumns: ColumnsType<BatchCheckItem> = [
    { title: 'User', dataIndex: 'user', key: 'user' },
    { title: 'Relation', dataIndex: 'relation', key: 'relation' },
    { title: 'Object', dataIndex: 'object', key: 'object' },
    {
      title: 'Result',
      key: 'result',
      render: (_, record) => (
        <Tag
          color={record.allowed ? 'success' : 'error'}
          icon={record.allowed ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
        >
          {record.allowed ? 'Allowed' : 'Denied'}
        </Tag>
      ),
    },
  ];

  return (
    <div>
      <Alert
        message="Batch Permission Check"
        description="Check multiple permissions at once. Enter user, object, and relation for each check."
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Row gutter={24}>
        <Col xs={24} lg={12}>
          <Card title="Checks to Perform" size="small">
            <Table
              dataSource={checks}
              columns={columns}
              pagination={false}
              size="small"
              rowKey="key"
              footer={() => (
                <Button type="dashed" block icon={<PlusOutlined />} onClick={addRow}>
                  Add Check
                </Button>
              )}
            />
            <Button
              type="primary"
              block
              style={{ marginTop: 16 }}
              icon={<ThunderboltOutlined />}
              loading={isChecking}
              onClick={handleBatchCheck}
            >
              Run Batch Check ({checks.filter((c) => c.user && c.relation && c.object).length})
            </Button>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card title="Results" size="small">
            {results.length > 0 ? (
              <>
                <Table
                  dataSource={results}
                  columns={resultColumns}
                  pagination={false}
                  size="small"
                  rowKey="key"
                />
                <Space style={{ marginTop: 16 }}>
                  <Text type="secondary">
                    {results.filter((r) => r.allowed).length} allowed,{' '}
                    {results.filter((r) => !r.allowed).length} denied
                  </Text>
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      navigator.clipboard.writeText(JSON.stringify(results, null, 2));
                      message.success('Results copied');
                    }}
                  >
                    Copy
                  </Button>
                </Space>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 48, color: '#999' }}>
                <ThunderboltOutlined style={{ fontSize: 48 }} />
                <Paragraph style={{ marginTop: 16 }}>
                  Add checks and click "Run Batch Check"
                </Paragraph>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

// ============ List Objects Tab ============
function ListObjectsTab({ types, getRelationsForType, userSuggestions = [] }: TabProps) {
  const [form] = Form.useForm();
  const [results, setResults] = useState<string[]>([]);
  const [streamingResults, setStreamingResults] = useState<string[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const listObjects = useListObjects();

  const [selectedType, setSelectedType] = useState<string>('');

  // Simulate streaming by revealing results progressively
  const simulateStreaming = (objects: string[]) => {
    setIsStreaming(true);
    setStreamingResults([]);
    setResults([]);

    let index = 0;
    const interval = setInterval(() => {
      if (index < objects.length) {
        setStreamingResults((prev) => [...prev, objects[index]]);
        index++;
      } else {
        clearInterval(interval);
        setIsStreaming(false);
        setResults(objects);
      }
    }, 100); // Reveal one item every 100ms

    return () => clearInterval(interval);
  };

  const handleListObjects = async (values: { user: string; type: string; relation: string }) => {
    try {
      console.log('[ListObjects] Request:', values);
      const response = await listObjects.mutateAsync({
        user: values.user,
        type: values.type,
        relation: values.relation,
      });
      console.log('[ListObjects] Response:', response);
      console.log('[ListObjects] Objects:', response.objects);
      // Use streaming simulation for better UX
      simulateStreaming(response.objects || []);
    } catch (error) {
      console.error('[ListObjects] Error:', error);
      setResults([]);
      setStreamingResults([]);
      setIsStreaming(false);
    }
  };

  const displayResults = isStreaming ? streamingResults : results;
  const showSkeleton = isStreaming && streamingResults.length < 5;

  return (
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <Form form={form} layout="vertical" onFinish={handleListObjects}>
          <Alert
            message="List Objects"
            description="Find all objects of a type that a user has a specific relation to."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Alert
            message="Streaming Results"
            description="Results are displayed progressively as they arrive. Large result sets may take time."
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item name="user" label="User" rules={[{ required: true }]}>
            <AutoComplete
              placeholder="user:alice"
              options={userSuggestions}
              filterOption={(inputValue, option) =>
                option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
              }
            >
              <Input prefix={<UserOutlined />} />
            </AutoComplete>
          </Form.Item>

          <Form.Item name="type" label="Object Type" rules={[{ required: true }]}>
            <Select
              placeholder="Select type"
              onChange={setSelectedType}
              options={types.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>

          <Form.Item name="relation" label="Relation" rules={[{ required: true }]}>
            <Select placeholder="Select relation">
              {getRelationsForType(selectedType).map((r) => (
                <Select.Option key={r} value={r}>
                  {r}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={listObjects.isPending}
              icon={<SearchOutlined />}
            >
              List Objects
            </Button>
          </Form.Item>
        </Form>
      </Col>

      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              {`Results (${displayResults.length})`}
              {isStreaming && <Spin size="small" />}
            </Space>
          }
          size="small"
        >
          {listObjects.isPending ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : displayResults.length > 0 || isStreaming ? (
            <List
              size="small"
              dataSource={displayResults}
              renderItem={(item) => (
                <List.Item>
                  <Tag color="green">{item}</Tag>
                </List.Item>
              )}
            >
              {showSkeleton && (
                <>
                  <List.Item>
                    <Skeleton.Input active size="small" style={{ width: 150 }} />
                  </List.Item>
                  <List.Item>
                    <Skeleton.Input active size="small" style={{ width: 120 }} />
                  </List.Item>
                  <List.Item>
                    <Skeleton.Input active size="small" style={{ width: 180 }} />
                  </List.Item>
                </>
              )}
            </List>
          ) : (
            <Text type="secondary">No objects found</Text>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ============ List Users Tab ============
function ListUsersTab({ types, getRelationsForType, objectSuggestions = [] }: TabProps) {
  const [form] = Form.useForm();
  const [results, setResults] = useState<
    Array<{
      object?: { type: string; id: string };
      userset?: { type: string; id: string; relation: string };
    }>
  >([]);
  const listUsers = useListUsers();

  const [selectedType, setSelectedType] = useState<string>('');

  // Get object IDs for the selected type from suggestions
  const objectIdSuggestions = useMemo(() => {
    return objectSuggestions
      .filter((o) => o.value.startsWith(`${selectedType}:`))
      .map((o) => {
        const id = o.value.split(':').slice(1).join(':');
        return { value: id, label: id };
      });
  }, [objectSuggestions, selectedType]);

  const handleListUsers = async (values: {
    objectType: string;
    objectId: string;
    relation: string;
    userType: string;
  }) => {
    try {
      const response = await listUsers.mutateAsync({
        object: { type: values.objectType, id: values.objectId },
        relation: values.relation,
        user_filters: [{ type: values.userType }],
      });
      setResults(response.users);
    } catch (_error) {
      setResults([]);
    }
  };

  return (
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <Form form={form} layout="vertical" onFinish={handleListUsers}>
          <Alert
            message="List Users"
            description="Find all users that have a specific relation to an object."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="objectType" label="Object Type" rules={[{ required: true }]}>
                <Select
                  placeholder="Type"
                  onChange={setSelectedType}
                  options={types.map((t) => ({ value: t, label: t }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="objectId" label="Object ID" rules={[{ required: true }]}>
                <AutoComplete
                  placeholder="readme"
                  options={objectIdSuggestions}
                  filterOption={(inputValue, option) =>
                    option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="relation" label="Relation" rules={[{ required: true }]}>
            <Select placeholder="Select relation">
              {getRelationsForType(selectedType).map((r) => (
                <Select.Option key={r} value={r}>
                  {r}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item name="userType" label="User Type Filter" rules={[{ required: true }]}>
            <Select
              placeholder="Filter by user type"
              options={types.map((t) => ({ value: t, label: t }))}
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={listUsers.isPending}
              icon={<SearchOutlined />}
            >
              List Users
            </Button>
          </Form.Item>
        </Form>
      </Col>

      <Col xs={24} lg={12}>
        <Card title={`Results (${results.length})`} size="small">
          {listUsers.isPending ? (
            <Spin />
          ) : results.length > 0 ? (
            <List
              size="small"
              dataSource={results}
              renderItem={(user) => (
                <List.Item>
                  {user.object ? (
                    <Tag color="blue">{`${user.object.type}:${user.object.id}`}</Tag>
                  ) : user.userset ? (
                    <Tooltip title="Userset reference">
                      <Tag color="purple">{`${user.userset.type}:${user.userset.id}#${user.userset.relation}`}</Tag>
                    </Tooltip>
                  ) : (
                    <Tag color="orange">Wildcard (*)</Tag>
                  )}
                </List.Item>
              )}
            />
          ) : (
            <Text type="secondary">No users found</Text>
          )}
        </Card>
      </Col>
    </Row>
  );
}

// ============ Expand Tab ============
function ExpandTab({ types, getRelationsForType, objectSuggestions = [] }: TabProps) {
  const [form] = Form.useForm();
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const expand = useExpand();

  const [selectedType, setSelectedType] = useState<string>('');

  // Get object IDs for the selected type from suggestions
  const objectIdSuggestions = useMemo(() => {
    return objectSuggestions
      .filter((o) => o.value.startsWith(`${selectedType}:`))
      .map((o) => {
        const id = o.value.split(':').slice(1).join(':');
        return { value: id, label: id };
      });
  }, [objectSuggestions, selectedType]);

  const handleExpand = async (values: {
    objectType: string;
    objectId: string;
    relation: string;
  }) => {
    try {
      const response = await expand.mutateAsync({
        tuple_key: {
          object: `${values.objectType}:${values.objectId}`,
          relation: values.relation,
        },
      });
      setTreeData(convertExpandTree(response.tree));
    } catch (_error) {
      setTreeData([]);
    }
  };

  // Convert expand response to tree data
  const convertExpandTree = (tree: unknown): DataNode[] => {
    const root = (tree as { root?: unknown }).root;
    if (!root) return [];

    const convertNode = (node: unknown, key: string): DataNode => {
      const n = node as {
        name?: string;
        leaf?: {
          users?: {
            users?: Array<{
              object?: { type: string; id: string };
              userset?: { type: string; id: string; relation: string };
            }>;
          };
        };
        union?: { nodes?: unknown[] };
        intersection?: { nodes?: unknown[] };
        difference?: { base?: unknown; subtract?: unknown };
      };

      if (n.leaf) {
        const users = n.leaf.users?.users || [];
        return {
          key,
          title: (
            <Space>
              <Tag color="blue">{n.name || 'leaf'}</Tag>
              <Text type="secondary">{users.length} users</Text>
            </Space>
          ),
          children: users.map((u, idx) => ({
            key: `${key}-user-${idx}`,
            title: u.object ? (
              <Tag color="green">{`${u.object.type}:${u.object.id}`}</Tag>
            ) : u.userset ? (
              <Tag color="purple">{`${u.userset.type}:${u.userset.id}#${u.userset.relation}`}</Tag>
            ) : (
              <Tag color="orange">*</Tag>
            ),
            isLeaf: true,
          })),
        };
      }

      if (n.union) {
        return {
          key,
          title: (
            <Space>
              <Tag color="green">UNION</Tag>
              <Text>{n.name}</Text>
            </Space>
          ),
          children: (n.union.nodes || []).map((child, idx) =>
            convertNode(child, `${key}-union-${idx}`)
          ),
        };
      }

      if (n.intersection) {
        return {
          key,
          title: (
            <Space>
              <Tag color="orange">INTERSECTION</Tag>
              <Text>{n.name}</Text>
            </Space>
          ),
          children: (n.intersection.nodes || []).map((child, idx) =>
            convertNode(child, `${key}-int-${idx}`)
          ),
        };
      }

      if (n.difference) {
        return {
          key,
          title: (
            <Space>
              <Tag color="red">DIFFERENCE</Tag>
              <Text>{n.name}</Text>
            </Space>
          ),
          children: [
            n.difference.base && convertNode(n.difference.base, `${key}-base`),
            n.difference.subtract && convertNode(n.difference.subtract, `${key}-subtract`),
          ].filter(Boolean) as DataNode[],
        };
      }

      return {
        key,
        title: <Text>{n.name || 'unknown'}</Text>,
        isLeaf: true,
      };
    };

    return [convertNode(root, 'root')];
  };

  return (
    <Row gutter={24}>
      <Col xs={24} lg={12}>
        <Form form={form} layout="vertical" onFinish={handleExpand}>
          <Alert
            message="Expand"
            description="Visualize how a permission is resolved by expanding the relation tree."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="objectType" label="Object Type" rules={[{ required: true }]}>
                <Select
                  placeholder="Type"
                  onChange={setSelectedType}
                  options={types.map((t) => ({ value: t, label: t }))}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="objectId" label="Object ID" rules={[{ required: true }]}>
                <AutoComplete
                  placeholder="readme"
                  options={objectIdSuggestions}
                  filterOption={(inputValue, option) =>
                    option?.value.toLowerCase().includes(inputValue.toLowerCase()) ?? false
                  }
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="relation" label="Relation" rules={[{ required: true }]}>
            <Select placeholder="Select relation">
              {getRelationsForType(selectedType).map((r) => (
                <Select.Option key={r} value={r}>
                  {r}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={expand.isPending}
              icon={<ExpandOutlined />}
            >
              Expand
            </Button>
          </Form.Item>
        </Form>
      </Col>

      <Col xs={24} lg={12}>
        <Card
          title="Resolution Tree"
          size="small"
          extra={
            <Button
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(treeData, null, 2));
              }}
            >
              Copy JSON
            </Button>
          }
        >
          {expand.isPending ? (
            <Spin />
          ) : treeData.length > 0 ? (
            <Tree treeData={treeData} defaultExpandAll showLine={{ showLeafIcon: false }} />
          ) : (
            <Text type="secondary">Run an expand query to see the resolution tree</Text>
          )}
        </Card>
      </Col>
    </Row>
  );
}
