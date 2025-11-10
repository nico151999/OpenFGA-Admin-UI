import {
  DownloadOutlined,
  FilterOutlined,
  HistoryOutlined,
  MinusOutlined,
  PlusOutlined,
  ReloadOutlined,
  TableOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useAuthorizationModel, useChanges } from '@api/openfga';
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Empty,
  Row,
  Segmented,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useMemo, useState } from 'react';

dayjs.extend(relativeTime);

const { Title, Text, Paragraph } = Typography;

interface TupleChange {
  tuple_key: {
    user: string;
    relation: string;
    object: string;
  };
  operation: 'TUPLE_OPERATION_WRITE' | 'TUPLE_OPERATION_DELETE';
  timestamp: string;
}

export default function ChangesFeedPage() {
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');

  const { data: model } = useAuthorizationModel();
  const { data, isLoading, refetch, error } = useChanges({ type: typeFilter });

  const types = useMemo(() => {
    return model?.type_definitions?.map((t) => t.type) || [];
  }, [model]);

  const changes = (data?.changes || []) as TupleChange[];

  // Stats
  const writeCount = changes.filter((c) => c.operation === 'TUPLE_OPERATION_WRITE').length;
  const deleteCount = changes.filter((c) => c.operation === 'TUPLE_OPERATION_DELETE').length;

  const handleExport = () => {
    const csv = [
      ['Timestamp', 'Operation', 'User', 'Relation', 'Object'].join(','),
      ...changes.map((c) =>
        [
          c.timestamp,
          c.operation === 'TUPLE_OPERATION_WRITE' ? 'WRITE' : 'DELETE',
          c.tuple_key.user,
          c.tuple_key.relation,
          c.tuple_key.object,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openfga-changes-${dayjs().format('YYYY-MM-DD-HHmmss')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<TupleChange> = [
    {
      title: 'Timestamp',
      dataIndex: 'timestamp',
      key: 'timestamp',
      width: 180,
      render: (ts: string) => (
        <Tooltip title={dayjs(ts).format('YYYY-MM-DD HH:mm:ss.SSS')}>
          <Text>{dayjs(ts).fromNow()}</Text>
        </Tooltip>
      ),
      sorter: (a, b) => dayjs(a.timestamp).unix() - dayjs(b.timestamp).unix(),
    },
    {
      title: 'Operation',
      dataIndex: 'operation',
      key: 'operation',
      width: 100,
      render: (op: string) => (
        <Tag
          color={op === 'TUPLE_OPERATION_WRITE' ? 'green' : 'red'}
          icon={op === 'TUPLE_OPERATION_WRITE' ? <PlusOutlined /> : <MinusOutlined />}
        >
          {op === 'TUPLE_OPERATION_WRITE' ? 'WRITE' : 'DELETE'}
        </Tag>
      ),
      filters: [
        { text: 'Write', value: 'TUPLE_OPERATION_WRITE' },
        { text: 'Delete', value: 'TUPLE_OPERATION_DELETE' },
      ],
      onFilter: (value, record) => record.operation === value,
    },
    {
      title: 'User',
      dataIndex: ['tuple_key', 'user'],
      key: 'user',
      render: (user: string) => <Tag color="blue">{user}</Tag>,
    },
    {
      title: 'Relation',
      dataIndex: ['tuple_key', 'relation'],
      key: 'relation',
      render: (relation: string) => <Tag color="purple">{relation}</Tag>,
    },
    {
      title: 'Object',
      dataIndex: ['tuple_key', 'object'],
      key: 'object',
      render: (object: string) => <Tag color="cyan">{object}</Tag>,
    },
  ];

  return (
    <Card>
      <Row gutter={[16, 16]}>
        {/* Stats Row */}
        <Col span={24}>
          <Row gutter={16}>
            <Col xs={8}>
              <Statistic
                title="Total Changes"
                value={changes.length}
                prefix={<HistoryOutlined />}
              />
            </Col>
            <Col xs={8}>
              <Statistic
                title="Writes"
                value={writeCount}
                valueStyle={{ color: '#52c41a' }}
                prefix={<PlusOutlined />}
              />
            </Col>
            <Col xs={8}>
              <Statistic
                title="Deletes"
                value={deleteCount}
                valueStyle={{ color: '#ff4d4f' }}
                prefix={<MinusOutlined />}
              />
            </Col>
          </Row>
        </Col>

        {/* Filters Row */}
        <Col span={24}>
          <Space wrap>
            <FilterOutlined />
            <Select
              placeholder="Filter by type"
              style={{ width: 200 }}
              allowClear
              value={typeFilter}
              onChange={setTypeFilter}
              options={types.map((t) => ({ value: t, label: t }))}
            />
            <Segmented
              options={[
                { value: 'timeline', icon: <UnorderedListOutlined />, label: 'Timeline' },
                { value: 'table', icon: <TableOutlined />, label: 'Table' },
              ]}
              value={viewMode}
              onChange={(v) => setViewMode(v as 'timeline' | 'table')}
            />
            <Button icon={<ReloadOutlined />} onClick={() => refetch()}>
              Refresh
            </Button>
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExport}
              disabled={changes.length === 0}
            >
              Export CSV
            </Button>
          </Space>
        </Col>

        {/* Content */}
        <Col span={24}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 48 }}>
              <Spin size="large" />
            </div>
          ) : error ? (
            <Alert
              type="error"
              message="Failed to load changes"
              description={(error as Error).message}
              showIcon
            />
          ) : changes.length === 0 ? (
            <Empty
              image={<HistoryOutlined style={{ fontSize: 64, color: '#bfbfbf' }} />}
              description={
                <>
                  <Title level={5}>No Changes Found</Title>
                  <Paragraph type="secondary">
                    {typeFilter
                      ? `No changes found for type "${typeFilter}". Try clearing the filter.`
                      : 'No tuple changes have been recorded yet. Changes appear here when tuples are written or deleted.'}
                  </Paragraph>
                </>
              }
            />
          ) : viewMode === 'timeline' ? (
            <TimelineView changes={changes} />
          ) : (
            <Table
              columns={columns}
              dataSource={changes}
              rowKey={(r) =>
                `${r.timestamp}-${r.tuple_key.user}-${r.tuple_key.relation}-${r.tuple_key.object}`
              }
              size="small"
              pagination={{ pageSize: 20, showSizeChanger: true }}
            />
          )}
        </Col>
      </Row>
    </Card>
  );
}

// Timeline View Component
function TimelineView({ changes }: { changes: TupleChange[] }) {
  // Group changes by day
  const groupedChanges = useMemo(() => {
    const groups: Record<string, TupleChange[]> = {};
    for (const change of changes) {
      const day = dayjs(change.timestamp).format('YYYY-MM-DD');
      if (!groups[day]) groups[day] = [];
      groups[day].push(change);
    }
    return groups;
  }, [changes]);

  return (
    <Collapse
      defaultActiveKey={Object.keys(groupedChanges)}
      ghost
      items={Object.entries(groupedChanges).map(([day, dayChanges]) => ({
        key: day,
        label: (
          <Space>
            <Text strong>{dayjs(day).format('dddd, MMMM D, YYYY')}</Text>
            <Tag>{dayChanges.length} changes</Tag>
          </Space>
        ),
        children: (
          <Timeline
            mode="left"
            items={dayChanges.map((change, idx) => ({
              key: `${change.timestamp}-${idx}`,
              color: change.operation === 'TUPLE_OPERATION_WRITE' ? 'green' : 'red',
              label: (
                <Tooltip title={dayjs(change.timestamp).format('YYYY-MM-DD HH:mm:ss.SSS')}>
                  <Text type="secondary">{dayjs(change.timestamp).format('HH:mm:ss')}</Text>
                </Tooltip>
              ),
              children: (
                <Space orientation="vertical" size={0}>
                  <Space>
                    <Tag
                      color={change.operation === 'TUPLE_OPERATION_WRITE' ? 'green' : 'red'}
                      icon={
                        change.operation === 'TUPLE_OPERATION_WRITE' ? (
                          <PlusOutlined />
                        ) : (
                          <MinusOutlined />
                        )
                      }
                    >
                      {change.operation === 'TUPLE_OPERATION_WRITE' ? 'WRITE' : 'DELETE'}
                    </Tag>
                    <Text>{change.tuple_key.relation}</Text>
                  </Space>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <Tag color="blue" style={{ marginRight: 4 }}>
                      {change.tuple_key.user}
                    </Tag>
                    →
                    <Tag color="cyan" style={{ marginLeft: 4 }}>
                      {change.tuple_key.object}
                    </Tag>
                  </Text>
                </Space>
              ),
            }))}
          />
        ),
      }))}
    />
  );
}
