import {
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  FilterOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useAuthorizationModel, useTuples, useWriteTuples } from '@api/openfga';
import type { Tuple, TupleKey } from '@openfga-admin/shared';
import { useConnectionStore } from '@store/connectionStore';
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Card,
  Col,
  Collapse,
  Divider,
  Drawer,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Progress,
  Row,
  Space,
  Steps,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';

const { Title, Text } = Typography;

interface TupleFilter {
  user?: string;
  relation?: string;
  object?: string;
}

// Idempotency options for writes
interface IdempotencyOptions {
  ignoreDuplicates: boolean; // on_duplicate: ignore
  ignoreMissing: boolean; // on_missing: ignore (for deletes)
}

export default function TupleManagerPage() {
  const { getActiveProfile, addRecentItem } = useConnectionStore();
  const { notification } = App.useApp();
  getActiveProfile();

  const [filter, setFilter] = useState<TupleFilter>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [selectedTuples, setSelectedTuples] = useState<TupleKey[]>([]);
  const [continuationToken, setContinuationToken] = useState<string | undefined>();

  // Idempotency settings
  const [idempotencyOptions, setIdempotencyOptions] = useState<IdempotencyOptions>({
    ignoreDuplicates: false,
    ignoreMissing: false,
  });

  // Track selected object type for relation dropdown
  const [selectedObjectType, setSelectedObjectType] = useState<string | undefined>();

  const [addForm] = Form.useForm();

  // Watch form values for preview (only renders when form is mounted)
  const watchUser = Form.useWatch('user', addForm);
  const watchRelation = Form.useWatch('relation', addForm);
  const watchObject = Form.useWatch('object', addForm);

  const { data: model } = useAuthorizationModel();

  // Build clean filter object with only non-empty values
  const cleanFilter = useMemo(() => {
    const clean: TupleFilter = {};
    if (filter.user) clean.user = filter.user;
    if (filter.relation) clean.relation = filter.relation;
    if (filter.object) clean.object = filter.object;
    return Object.keys(clean).length > 0 ? clean : undefined;
  }, [filter]);

  const {
    data: tuplesData,
    isLoading,
    refetch,
  } = useTuples({
    tupleKey: cleanFilter,
    pageSize: 50,
    continuationToken,
  });
  const writeTuples = useWriteTuples();

  // Get types from model for dropdowns
  const types = useMemo(() => {
    return model?.type_definitions?.map((t) => t.type) || [];
  }, [model]);

  // Get relations for selected type
  const getRelationsForType = (type: string): string[] => {
    const typeDef = model?.type_definitions?.find((t) => t.type === type);
    return typeDef?.relations ? Object.keys(typeDef.relations) : [];
  };

  // Parse object to get type
  const getObjectType = (object: string): string | undefined => {
    const match = object.match(/^([^:]+):/);
    return match?.[1];
  };

  // Table columns
  const columns: ColumnsType<Tuple> = [
    {
      title: 'User',
      dataIndex: ['key', 'user'],
      key: 'user',
      render: (user: string) => (
        <Tooltip title={user}>
          <Tag color="blue">{user.length > 30 ? `${user.slice(0, 30)}...` : user}</Tag>
        </Tooltip>
      ),
      width: '30%',
    },
    {
      title: 'Relation',
      dataIndex: ['key', 'relation'],
      key: 'relation',
      render: (relation: string) => <Tag color="purple">{relation}</Tag>,
      width: '15%',
    },
    {
      title: 'Object',
      dataIndex: ['key', 'object'],
      key: 'object',
      render: (object: string) => (
        <Tooltip title={object}>
          <Tag color="green">{object.length > 30 ? `${object.slice(0, 30)}...` : object}</Tag>
        </Tooltip>
      ),
      width: '30%',
    },
    {
      title: 'Condition',
      dataIndex: ['key', 'condition'],
      key: 'condition',
      render: (condition?: { name: string }) =>
        condition ? <Tag color="orange">{condition.name}</Tag> : <Text type="secondary">-</Text>,
      width: '10%',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: '15%',
      render: (_, record) => (
        <Space>
          <Tooltip title="Copy tuple">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                const tupleStr = `${record.key.user} ${record.key.relation} ${record.key.object}`;
                navigator.clipboard.writeText(tupleStr);
                message.success('Copied to clipboard');
              }}
            />
          </Tooltip>
          <Popconfirm
            title="Delete this tuple?"
            onConfirm={() => handleDeleteTuple(record.key)}
            okText="Delete"
            okButtonProps={{ danger: true }}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // Handlers
  const handleAddTuple = async (values: TupleKey) => {
    try {
      await writeTuples.mutateAsync({ writes: [values] });
      notification.success({
        message: 'Tuple Added Successfully',
        description: (
          <>
            <Text>{`${values.user} → ${values.relation} → ${values.object}`}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Permission changes may take a moment to propagate.
            </Text>
          </>
        ),
        duration: 4,
      });
      addRecentItem({ type: 'tuple', value: `${values.user} ${values.relation} ${values.object}` });
      setShowAddModal(false);
      setSelectedObjectType(undefined);
      addForm.resetFields();
      refetch();
    } catch (error) {
      message.error(`Failed to add tuple: ${(error as Error).message}`);
    }
  };

  const handleDeleteTuple = async (key: TupleKey) => {
    try {
      await writeTuples.mutateAsync({ deletes: [key] });
      notification.success({
        message: 'Tuple Deleted',
        description: (
          <>
            <Text>{`${key.user} → ${key.relation} → ${key.object}`}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Permission changes may take a moment to propagate.
            </Text>
          </>
        ),
        duration: 4,
      });
      refetch();
    } catch (error) {
      message.error(`Failed to delete tuple: ${(error as Error).message}`);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTuples.length === 0) return;

    try {
      await writeTuples.mutateAsync({ deletes: selectedTuples });
      notification.success({
        message: `Deleted ${selectedTuples.length} Tuples`,
        description: (
          <Text type="secondary" style={{ fontSize: 12 }}>
            Permission changes may take a moment to propagate.
          </Text>
        ),
        duration: 4,
      });
      setSelectedTuples([]);
      refetch();
    } catch (error) {
      message.error(`Failed to delete tuples: ${(error as Error).message}`);
    }
  };

  const clearFilter = () => {
    setFilter({});
    setContinuationToken(undefined);
  };

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {/* Header Card */}
      <Card size="small">
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              Relationship Tuples
            </Title>
          </Col>
          <Col>
            <Space>
              <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isLoading}>
                Refresh
              </Button>
              <Button icon={<UploadOutlined />} onClick={() => setShowBulkImport(true)}>
                Import
              </Button>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAddModal(true)}>
                Add Tuple
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Filter Card */}
      <Card size="small">
        <Row gutter={16} align="middle">
          <Col flex="auto">
            <Space wrap>
              <Input
                placeholder="Filter by user..."
                prefix={<SearchOutlined />}
                value={filter.user}
                onChange={(e) => setFilter({ ...filter, user: e.target.value || undefined })}
                style={{ width: 200 }}
                allowClear
              />
              <Input
                placeholder="Filter by relation..."
                value={filter.relation}
                onChange={(e) => setFilter({ ...filter, relation: e.target.value || undefined })}
                style={{ width: 150 }}
                allowClear
              />
              <Input
                placeholder="Filter by object..."
                value={filter.object}
                onChange={(e) => setFilter({ ...filter, object: e.target.value || undefined })}
                style={{ width: 200 }}
                allowClear
              />
              <Button icon={<FilterOutlined />} onClick={() => refetch()}>
                Apply
              </Button>
              {Object.keys(filter).some((k) => filter[k as keyof TupleFilter]) && (
                <Button icon={<ClearOutlined />} onClick={clearFilter}>
                  Clear
                </Button>
              )}
            </Space>
          </Col>
          {selectedTuples.length > 0 && (
            <Col>
              <Space>
                <Tooltip title="Ignore if tuple doesn't exist">
                  <Space>
                    <Switch
                      size="small"
                      checked={idempotencyOptions.ignoreMissing}
                      onChange={(checked) =>
                        setIdempotencyOptions((prev) => ({ ...prev, ignoreMissing: checked }))
                      }
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Ignore missing
                    </Text>
                  </Space>
                </Tooltip>
                <Popconfirm
                  title={`Delete ${selectedTuples.length} selected tuples?`}
                  description={
                    idempotencyOptions.ignoreMissing ? 'Missing tuples will be ignored' : undefined
                  }
                  onConfirm={handleBulkDelete}
                  okText="Delete All"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />}>
                    Delete {selectedTuples.length} Selected
                  </Button>
                </Popconfirm>
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      {/* Tuples Table */}
      <Card styles={{ body: { padding: 0 } }}>
        <Table
          columns={columns}
          dataSource={tuplesData?.tuples || []}
          rowKey={(record) => `${record.key.user}-${record.key.relation}-${record.key.object}`}
          loading={isLoading}
          rowSelection={{
            selectedRowKeys: selectedTuples.map((t) => `${t.user}-${t.relation}-${t.object}`),
            onChange: (_, records) => {
              setSelectedTuples(records.map((r) => r.key));
            },
          }}
          pagination={{
            showSizeChanger: true,
            showTotal: (total) => `${total} tuples`,
            pageSize: 50,
          }}
          footer={() =>
            tuplesData?.continuation_token ? (
              <Button
                onClick={() => setContinuationToken(tuplesData.continuation_token)}
                loading={isLoading}
              >
                Load More
              </Button>
            ) : null
          }
        />
      </Card>

      {/* Add Tuple Modal */}
      <Modal
        title="Add Relationship Tuple"
        open={showAddModal}
        onCancel={() => {
          setShowAddModal(false);
          setSelectedObjectType(undefined);
          addForm.resetFields();
        }}
        onOk={() => addForm.submit()}
        confirmLoading={writeTuples.isPending}
        width={600}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddTuple}>
          <Alert
            message="Create a new relationship tuple"
            description={
              <Text>
                A tuple represents: <Text code>user</Text> has <Text code>relation</Text> to{' '}
                <Text code>object</Text>
              </Text>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="user"
            label="User"
            rules={[{ required: true, message: 'User is required' }]}
            tooltip="The user/subject (e.g., user:alice, group:engineers#member)"
          >
            <AutoComplete
              placeholder="e.g., user:alice"
              options={types.flatMap((t) => [
                { value: `${t}:`, label: `${t}:` },
                { value: `${t}:*`, label: `${t}:* (wildcard)` },
              ])}
              filterOption={(input, option) =>
                (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            name="object"
            label="Object"
            rules={[{ required: true, message: 'Object is required' }]}
            tooltip="The object/resource (e.g., document:readme)"
          >
            <AutoComplete
              placeholder="e.g., document:readme"
              options={types.map((t) => ({ value: `${t}:`, label: `${t}:` }))}
              filterOption={(input, option) =>
                (option?.value as string)?.toLowerCase().includes(input.toLowerCase())
              }
              onChange={(value) => {
                addForm.setFieldValue('relation', undefined);
                setSelectedObjectType(getObjectType(value));
              }}
            />
          </Form.Item>

          <Form.Item
            name="relation"
            label="Relation"
            rules={[{ required: true, message: 'Relation is required' }]}
            tooltip="The relationship type (e.g., viewer, editor, member)"
          >
            <AutoComplete
              placeholder={selectedObjectType ? 'Select a relation' : 'Select object first'}
              disabled={!selectedObjectType}
              options={
                selectedObjectType
                  ? getRelationsForType(selectedObjectType).map((r) => ({ value: r, label: r }))
                  : []
              }
            />
          </Form.Item>

          <Collapse
            ghost
            size="small"
            style={{ marginTop: 8 }}
            items={[
              {
                key: 'idempotency',
                label: 'Advanced Options (Idempotency)',
                children: (
                  <Space orientation="vertical" style={{ width: '100%' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <Text>Ignore Duplicates</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          Skip if tuple already exists (on_duplicate: ignore)
                        </Text>
                      </div>
                      <Switch
                        checked={idempotencyOptions.ignoreDuplicates}
                        onChange={(checked) =>
                          setIdempotencyOptions((prev) => ({ ...prev, ignoreDuplicates: checked }))
                        }
                      />
                    </div>
                    {idempotencyOptions.ignoreDuplicates && (
                      <Alert
                        message="Duplicate tuples will be silently ignored"
                        type="info"
                        showIcon
                        style={{ fontSize: 12 }}
                      />
                    )}
                  </Space>
                ),
              },
            ]}
          />

          <Divider />

          <Text type="secondary">
            Preview: <Text code>{watchUser || '?'}</Text> has{' '}
            <Text code>{watchRelation || '?'}</Text> on <Text code>{watchObject || '?'}</Text>
          </Text>
        </Form>
      </Modal>

      {/* Bulk Import Drawer */}
      <BulkImportDrawer
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onComplete={() => {
          setShowBulkImport(false);
          refetch();
        }}
        types={types}
      />
    </Space>
  );
}

// Bulk Import Drawer Component
interface BulkImportDrawerProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
  types: string[];
}

function BulkImportDrawer({ open, onClose, onComplete }: BulkImportDrawerProps) {
  const { notification } = App.useApp();
  const [currentStep, setCurrentStep] = useState(0);
  const [parsedTuples, setParsedTuples] = useState<TupleKey[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importProgress, setImportProgress] = useState(0);
  const [isImporting, setIsImporting] = useState(false);

  const writeTuples = useWriteTuples();

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      parseContent(content, file.name.endsWith('.json') ? 'json' : 'csv');
    };
    reader.readAsText(file);
    return false;
  };

  const parseContent = (content: string, format: 'csv' | 'json') => {
    const tuples: TupleKey[] = [];
    const parseErrors: string[] = [];

    try {
      if (format === 'json') {
        const data = JSON.parse(content);
        const items = Array.isArray(data) ? data : data.tuples || data.tuple_keys || [];
        items.forEach(
          (item: { user?: string; relation?: string; object?: string }, idx: number) => {
            if (item.user && item.relation && item.object) {
              tuples.push({ user: item.user, relation: item.relation, object: item.object });
            } else {
              parseErrors.push(`Row ${idx + 1}: Missing required fields`);
            }
          }
        );
      } else {
        const lines = content.trim().split('\n');
        const hasHeader = lines[0]?.toLowerCase().includes('user');
        const dataLines = hasHeader ? lines.slice(1) : lines;

        dataLines.forEach((line, idx) => {
          const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
          if (parts.length >= 3) {
            tuples.push({ user: parts[0], relation: parts[1], object: parts[2] });
          } else {
            parseErrors.push(`Row ${idx + 1}: Expected 3 columns, got ${parts.length}`);
          }
        });
      }
    } catch (e) {
      parseErrors.push(`Parse error: ${(e as Error).message}`);
    }

    setParsedTuples(tuples);
    setErrors(parseErrors);
    if (tuples.length > 0) {
      setCurrentStep(1);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    setImportProgress(0);

    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < parsedTuples.length; i += batchSize) {
      batches.push(parsedTuples.slice(i, i + batchSize));
    }

    let successCount = 0;
    const importErrors: string[] = [];

    for (let i = 0; i < batches.length; i++) {
      try {
        await writeTuples.mutateAsync({ writes: batches[i] });
        successCount += batches[i].length;
      } catch (e) {
        importErrors.push(`Batch ${i + 1}: ${(e as Error).message}`);
      }
      setImportProgress(Math.round(((i + 1) / batches.length) * 100));
    }

    setIsImporting(false);
    setErrors(importErrors);

    if (importErrors.length === 0) {
      notification.success({
        message: 'Import Complete',
        description: (
          <>
            <Text>{`Successfully imported ${successCount} tuples`}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Permission changes may take a moment to propagate.
            </Text>
          </>
        ),
        duration: 5,
      });
      setCurrentStep(2);
    } else {
      message.warning(`Imported ${successCount} tuples with ${importErrors.length} errors`);
    }
  };

  const resetImport = () => {
    setCurrentStep(0);
    setParsedTuples([]);
    setErrors([]);
    setImportProgress(0);
  };

  return (
    <Drawer
      title="Bulk Import Tuples"
      open={open}
      onClose={onClose}
      width={600}
      footer={
        <Space>
          <Button onClick={onClose}>Cancel</Button>
          {currentStep === 1 && (
            <Button type="primary" onClick={handleImport} loading={isImporting}>
              Import {parsedTuples.length} Tuples
            </Button>
          )}
          {currentStep === 2 && (
            <Button type="primary" onClick={onComplete}>
              Done
            </Button>
          )}
        </Space>
      }
    >
      <Steps
        current={currentStep}
        style={{ marginBottom: 24 }}
        items={[{ title: 'Upload' }, { title: 'Preview' }, { title: 'Complete' }]}
      />

      {currentStep === 0 && (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Upload.Dragger
            accept=".csv,.json"
            beforeUpload={handleFileUpload}
            showUploadList={false}
          >
            <p className="ant-upload-drag-icon">
              <UploadOutlined style={{ fontSize: 48, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text">Click or drag file to upload</p>
            <p className="ant-upload-hint">Supports CSV or JSON format</p>
          </Upload.Dragger>

          <Alert
            message="Supported Formats"
            description={
              <>
                <Text strong>CSV:</Text> user,relation,object (with optional header)
                <br />
                <Text strong>JSON:</Text> {`[{"user": "...", "relation": "...", "object": "..."}]`}
              </>
            }
            type="info"
          />
        </Space>
      )}

      {currentStep === 1 && (
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Alert
            message={`Found ${parsedTuples.length} tuples to import`}
            type={errors.length > 0 ? 'warning' : 'success'}
            showIcon
          />

          {errors.length > 0 && (
            <Alert
              message={`${errors.length} parsing errors`}
              description={errors.slice(0, 5).join('\n')}
              type="error"
            />
          )}

          {isImporting && <Progress percent={importProgress} />}

          <Table
            size="small"
            dataSource={parsedTuples.slice(0, 10)}
            rowKey={(r) => `${r.user}-${r.relation}-${r.object}`}
            columns={[
              { title: 'User', dataIndex: 'user', ellipsis: true },
              { title: 'Relation', dataIndex: 'relation' },
              { title: 'Object', dataIndex: 'object', ellipsis: true },
            ]}
            pagination={false}
            footer={() =>
              parsedTuples.length > 10 ? (
                <Text type="secondary">...and {parsedTuples.length - 10} more</Text>
              ) : null
            }
          />
        </Space>
      )}

      {currentStep === 2 && (
        <Alert
          message="Import Complete"
          description={`Successfully imported tuples. ${errors.length > 0 ? `${errors.length} batches had errors.` : ''}`}
          type="success"
          showIcon
          action={<Button onClick={resetImport}>Import More</Button>}
        />
      )}
    </Drawer>
  );
}
