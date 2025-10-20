import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  HistoryOutlined,
  PlusOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useConnectionStore } from '@store/connectionStore';
import { Button, Card, Col, Row, Space, Statistic, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { getActiveProfile, recentItems } = useConnectionStore();
  const activeProfile = getActiveProfile();

  const quickActions = [
    {
      title: 'Add Tuple',
      description: 'Create a new relationship tuple',
      icon: <PlusOutlined />,
      action: () => navigate('/tuples?action=add'),
      color: '#1890ff',
    },
    {
      title: 'Check Permission',
      description: 'Verify user access to a resource',
      icon: <CheckCircleOutlined />,
      action: () => navigate('/explorer?tab=check'),
      color: '#52c41a',
    },
    {
      title: 'Browse Model',
      description: 'View types and relations',
      icon: <ApartmentOutlined />,
      action: () => navigate('/model'),
      color: '#722ed1',
    },
    {
      title: 'View Changes',
      description: 'See recent tuple changes',
      icon: <HistoryOutlined />,
      action: () => navigate('/changes'),
      color: '#fa8c16',
    },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {/* Welcome Section */}
      <Card>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              Welcome to OpenFGA Admin Console
            </Title>
            <Text type="secondary">
              Connected to: {activeProfile?.name} ({activeProfile?.openfgaApiUrl})
            </Text>
          </Col>
          <Col>
            <Tag color="green">Connected</Tag>
          </Col>
        </Row>
      </Card>

      {/* Stats Row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/model')}>
            <Statistic
              title="Authorization Model"
              value="Active"
              prefix={<ApartmentOutlined style={{ color: '#722ed1' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {activeProfile?.modelSelectionMode === 'pinned'
                ? `Pinned: ${activeProfile?.authorizationModelId?.slice(0, 12)}...`
                : 'Using latest model'}
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/tuples')}>
            <Statistic
              title="Relationship Tuples"
              value="Browse"
              prefix={<UnorderedListOutlined style={{ color: '#1890ff' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Manage tuples for this store
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/explorer')}>
            <Statistic
              title="Access Explorer"
              value="Check"
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Debug permissions and access
            </Text>
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card hoverable onClick={() => navigate('/changes')}>
            <Statistic
              title="Change Feed"
              value="Audit"
              prefix={<HistoryOutlined style={{ color: '#fa8c16' }} />}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              Track tuple modifications
            </Text>
          </Card>
        </Col>
      </Row>

      {/* Quick Actions & Recent */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card title="Quick Actions" extra={<Text type="secondary">Common tasks</Text>}>
            <Row gutter={[16, 16]}>
              {quickActions.map((item) => (
                <Col key={item.title} xs={24} sm={12}>
                  <Card
                    hoverable
                    size="small"
                    onClick={item.action}
                    style={{ borderLeft: `3px solid ${item.color}` }}
                  >
                    <Space>
                      <span style={{ color: item.color, fontSize: 20 }}>{item.icon}</span>
                      <div>
                        <Text strong>{item.title}</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {item.description}
                        </Text>
                      </div>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <Card
            title="Recent Items"
            extra={
              <Button type="link" size="small">
                View All
              </Button>
            }
          >
            {recentItems.length > 0 ? (
              <Space orientation="vertical" style={{ width: '100%' }}>
                {recentItems.slice(0, 5).map((item, index) => (
                  <div key={`${item.type}-${item.value}-${index}`}>
                    <Space>
                      <Tag>{item.type}</Tag>
                      <Text code>{item.value}</Text>
                    </Space>
                  </div>
                ))}
              </Space>
            ) : (
              <Paragraph type="secondary" style={{ textAlign: 'center', padding: 24 }}>
                No recent items yet. Start exploring your data!
              </Paragraph>
            )}
          </Card>
        </Col>
      </Row>

      {/* Getting Started */}
      <Card title="Getting Started" size="small">
        <Row gutter={[24, 16]}>
          <Col xs={24} md={8}>
            <Space orientation="vertical">
              <Text strong>1. Browse your model</Text>
              <Text type="secondary">
                View the types, relations, and conditions defined in your authorization model.
              </Text>
              <Button type="link" onClick={() => navigate('/model')} style={{ padding: 0 }}>
                View Model <ArrowRightOutlined />
              </Button>
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space orientation="vertical">
              <Text strong>2. Manage tuples</Text>
              <Text type="secondary">
                Add, remove, or search relationship tuples that define who has access to what.
              </Text>
              <Button type="link" onClick={() => navigate('/tuples')} style={{ padding: 0 }}>
                Manage Tuples <ArrowRightOutlined />
              </Button>
            </Space>
          </Col>
          <Col xs={24} md={8}>
            <Space orientation="vertical">
              <Text strong>3. Explore access</Text>
              <Text type="secondary">
                Check permissions, list objects a user can access, or see who has access to an
                object.
              </Text>
              <Button type="link" onClick={() => navigate('/explorer')} style={{ padding: 0 }}>
                Explore Access <ArrowRightOutlined />
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>
    </Space>
  );
}
