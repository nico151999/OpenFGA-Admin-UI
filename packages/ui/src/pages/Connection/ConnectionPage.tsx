import {
  ApiOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  LoadingOutlined,
  RocketOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useDiscoverModels, useStores, useTestConnection } from '@api/openfga';
import { type ConnectionProfile, useConnectionStore } from '@store/connectionStore';
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Form,
  Input,
  List,
  Result,
  Select,
  Space,
  Spin,
  Steps,
  Tag,
  Typography,
} from 'antd';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const { Title, Text, Paragraph } = Typography;

interface FormValues {
  openfgaApiUrl?: string;
  storeId?: string;
  name?: string;
  authorizationModelId?: string;
  modelSelectionMode?: 'pinned' | 'latest';
  authMethod?: 'none' | 'bearer' | 'oauth';
}

export default function ConnectionPage() {
  const [currentStep, setCurrentStep] = useState(0);
  const [form] = Form.useForm();
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [discoveredUrl, setDiscoveredUrl] = useState<string | null>(null);
  // Store form values across steps
  const [formValues, setFormValues] = useState<FormValues>({
    openfgaApiUrl: 'http://localhost:8080',
    modelSelectionMode: 'latest',
    authMethod: 'none',
  });
  const navigate = useNavigate();
  const { message } = App.useApp();

  const { profiles, addProfile, deleteProfile, connect, defaultOpenfgaUrl } = useConnectionStore();
  useTestConnection(); // Initialize hook for availability

  // Update form URL when defaultOpenfgaUrl loads from gateway
  useEffect(() => {
    if (defaultOpenfgaUrl && formValues.openfgaApiUrl === 'http://localhost:8080') {
      setFormValues((prev) => ({ ...prev, openfgaApiUrl: defaultOpenfgaUrl }));
      form.setFieldValue('openfgaApiUrl', defaultOpenfgaUrl);
    }
  }, [defaultOpenfgaUrl]);

  // Auto-discover stores when URL changes
  const {
    data: stores,
    isLoading: storesLoading,
    error: storesError,
  } = useStores(discoveredUrl || undefined);

  // Auto-discover models when store is selected
  const { data: discoveredModels, isLoading: modelsLoading } = useDiscoverModels(
    formValues.openfgaApiUrl,
    formValues.storeId
  );

  // Helper to count total relations in a model
  const countRelations = (m: { type_definitions?: { relations?: Record<string, unknown> }[] }) => {
    if (!m?.type_definitions) return 0;
    return m.type_definitions.reduce((acc, t) => acc + Object.keys(t.relations || {}).length, 0);
  };

  const steps = [
    { title: 'Connect', description: 'OpenFGA URL' },
    { title: 'Select Store', description: 'Choose store' },
    { title: 'Configure', description: 'Name & options' },
    { title: 'Ready', description: 'Start using' },
  ];

  const handleTestConnection = async () => {
    try {
      await form.validateFields(['openfgaApiUrl']);
      setConnectionError(null);
      const url = form.getFieldValue('openfgaApiUrl');
      // Save values before moving to next step
      setFormValues((prev) => ({ ...prev, openfgaApiUrl: url }));
      setDiscoveredUrl(url);

      // Wait a moment for stores to load
      setTimeout(() => {
        setCurrentStep(1);
      }, 500);
    } catch (_error) {
      setConnectionError('Please enter a valid URL');
    }
  };

  const handleSelectStore = async () => {
    try {
      await form.validateFields(['storeId']);
      const storeId = form.getFieldValue('storeId');
      // Save values before moving to next step
      setFormValues((prev) => ({ ...prev, storeId }));
      setCurrentStep(2);
    } catch {
      // Validation failed
    }
  };

  const handleConfigureStore = async () => {
    try {
      await form.validateFields(['name']);
      const currentValues = form.getFieldsValue();
      // Save all values from this step
      setFormValues((prev) => ({
        ...prev,
        name: currentValues.name,
        authorizationModelId: currentValues.authorizationModelId,
        modelSelectionMode: currentValues.modelSelectionMode,
        authMethod: currentValues.authMethod,
      }));
      setCurrentStep(3);
    } catch {
      // Validation failed
    }
  };

  const handleFinish = async () => {
    // Use stored formValues instead of form.getFieldsValue()
    console.log('Stored form values:', formValues);

    // Validate required fields
    if (!formValues.openfgaApiUrl || !formValues.storeId) {
      message.error('Missing required fields. Please complete all steps.');
      return;
    }

    const profileId = await addProfile({
      name: formValues.name || 'My Connection',
      openfgaApiUrl: formValues.openfgaApiUrl,
      storeId: formValues.storeId,
      authorizationModelId: formValues.authorizationModelId || undefined,
      modelSelectionMode: formValues.modelSelectionMode || 'latest',
      authMethod: formValues.authMethod || 'none',
    });
    connect(profileId);
    message.success('Connected successfully!');
    navigate('/dashboard');
  };

  const handleQuickConnect = (profile: ConnectionProfile) => {
    connect(profile.id);
    message.success(`Connected to ${profile.name}`);
    navigate('/dashboard');
  };

  // Set store name as default connection name when store is selected
  useEffect(() => {
    if (formValues.storeId && stores && currentStep === 2) {
      const store = stores.find((s) => s.id === formValues.storeId);
      if (store && !formValues.name) {
        setFormValues((prev) => ({ ...prev, name: store.name }));
        form.setFieldValue('name', store.name);
      }
    }
  }, [formValues.storeId, formValues.name, stores, currentStep, form]);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <Card
        style={{
          width: '100%',
          maxWidth: 650,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <ApiOutlined style={{ fontSize: 48, color: '#1890ff' }} />
          <Title level={2} style={{ marginTop: 16, marginBottom: 8 }}>
            OpenFGA Admin Console
          </Title>
          <Text type="secondary">Connect to your OpenFGA instance to manage authorization</Text>
        </div>

        {/* Only show profiles that have valid data */}
        {profiles.filter((p) => p.openfgaApiUrl && p.storeId).length > 0 && currentStep === 0 && (
          <>
            <Divider>Quick Connect</Divider>
            <List
              dataSource={profiles.filter((p) => p.openfgaApiUrl && p.storeId)}
              renderItem={(profile) => (
                <List.Item
                  actions={[
                    <Button
                      key="connect"
                      type="primary"
                      onClick={() => handleQuickConnect(profile)}
                    >
                      Connect
                    </Button>,
                    <Button
                      key="delete"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => deleteProfile(profile.id)}
                    />,
                  ]}
                >
                  <List.Item.Meta
                    title={profile.name}
                    description={`${profile.openfgaApiUrl} • Store: ${profile.storeId?.slice(0, 12) || 'N/A'}...`}
                  />
                </List.Item>
              )}
              style={{ marginBottom: 24 }}
            />
            <Divider>Or Add New Connection</Divider>
          </>
        )}

        <Steps current={currentStep} items={steps} style={{ marginBottom: 32 }} size="small" />

        <Form form={form} layout="vertical" initialValues={formValues} preserve={false}>
          {currentStep === 0 && (
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              <Form.Item
                name="openfgaApiUrl"
                label="OpenFGA API URL"
                rules={[
                  { required: true, message: 'Please enter the OpenFGA API URL' },
                  { type: 'url', message: 'Please enter a valid URL' },
                ]}
                extra="Example: http://localhost:8080 or https://api.openfga.example.com"
              >
                <Input placeholder="http://localhost:8080" prefix={<ApiOutlined />} size="large" />
              </Form.Item>

              {connectionError && (
                <Alert
                  type="error"
                  message={connectionError}
                  showIcon
                  closable
                  onClose={() => setConnectionError(null)}
                />
              )}

              <Button
                type="primary"
                size="large"
                block
                onClick={handleTestConnection}
                icon={<SearchOutlined />}
              >
                Discover Stores & Continue
              </Button>
            </Space>
          )}

          {currentStep === 1 && (
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              <Alert
                message="Stores Found!"
                description={`Found ${stores?.length || 0} store(s) at ${discoveredUrl}`}
                type="success"
                showIcon
              />

              <Form.Item
                name="storeId"
                label="Select Store"
                rules={[{ required: true, message: 'Please select a store' }]}
              >
                {storesLoading ? (
                  <Spin indicator={<LoadingOutlined spin />} />
                ) : (
                  <Select
                    size="large"
                    placeholder="Choose a store"
                    notFoundContent={storesError ? 'Error loading stores' : 'No stores found'}
                  >
                    {stores?.map((store) => (
                      <Select.Option key={store.id} value={store.id}>
                        <Space>
                          <Text strong>{store.name}</Text>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {store.id.slice(0, 12)}...
                          </Text>
                        </Space>
                      </Select.Option>
                    ))}
                  </Select>
                )}
              </Form.Item>

              <Space style={{ width: '100%' }}>
                <Button size="large" onClick={() => setCurrentStep(0)}>
                  Back
                </Button>
                <Button
                  type="primary"
                  size="large"
                  style={{ flex: 1 }}
                  onClick={handleSelectStore}
                  disabled={storesLoading}
                >
                  Continue
                </Button>
              </Space>
            </Space>
          )}

          {currentStep === 2 && (
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              <Form.Item
                name="name"
                label="Connection Name"
                rules={[{ required: true, message: 'Please name this connection' }]}
              >
                <Input placeholder="Production Store" size="large" />
              </Form.Item>

              <Form.Item name="modelSelectionMode" label="Authorization Model Selection">
                <Select size="large">
                  <Select.Option value="latest">
                    Always Use Latest Model (Development)
                  </Select.Option>
                  <Select.Option value="pinned">Pin to Specific Model (Production)</Select.Option>
                </Select>
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prev, curr) => prev.modelSelectionMode !== curr.modelSelectionMode}
              >
                {({ getFieldValue }) =>
                  getFieldValue('modelSelectionMode') === 'pinned' && (
                    <Form.Item
                      name="authorizationModelId"
                      label="Select Authorization Model"
                      rules={[{ required: true, message: 'Please select a model' }]}
                    >
                      <Select
                        size="large"
                        loading={modelsLoading}
                        placeholder="Select an authorization model"
                        optionLabelProp="label"
                        notFoundContent={
                          modelsLoading ? (
                            <Space>
                              <Spin size="small" /> Loading models...
                            </Space>
                          ) : (
                            'No models found'
                          )
                        }
                      >
                        {discoveredModels?.map((m, index) => {
                          const typeCount = m.type_definitions?.length || 0;
                          const relCount = countRelations(m);
                          return (
                            <Select.Option
                              key={m.id}
                              value={m.id}
                              label={`${m.id.slice(0, 12)}... (v${m.schema_version})`}
                            >
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Space>
                                  <Text code style={{ fontSize: 11 }}>
                                    {m.id.slice(0, 16)}...
                                  </Text>
                                  {index === 0 && <Tag color="green">Latest</Tag>}
                                </Space>
                                <Space size="small">
                                  <Tag>v{m.schema_version}</Tag>
                                  <Tag color="blue">{typeCount} types</Tag>
                                  <Tag color="purple">{relCount} rels</Tag>
                                </Space>
                              </Space>
                            </Select.Option>
                          );
                        })}
                      </Select>
                    </Form.Item>
                  )
                }
              </Form.Item>

              <Space style={{ width: '100%' }}>
                <Button size="large" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button
                  type="primary"
                  size="large"
                  style={{ flex: 1 }}
                  onClick={handleConfigureStore}
                >
                  Continue
                </Button>
              </Space>
            </Space>
          )}

          {currentStep === 3 && (
            <Result
              icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              title="Ready to Connect!"
              subTitle="Your connection profile is configured. Click below to start managing your OpenFGA instance."
              extra={[
                <Button key="back" onClick={() => setCurrentStep(2)}>
                  Back
                </Button>,
                <Button
                  key="connect"
                  type="primary"
                  size="large"
                  icon={<RocketOutlined />}
                  onClick={handleFinish}
                >
                  Connect & Launch Console
                </Button>,
              ]}
            />
          )}
        </Form>

        {currentStep === 0 && profiles.length === 0 && (
          <Paragraph type="secondary" style={{ textAlign: 'center', marginTop: 24 }}>
            New to OpenFGA?{' '}
            <a
              href="https://openfga.dev/docs/getting-started"
              target="_blank"
              rel="noopener noreferrer"
            >
              Check out the getting started guide
            </a>
          </Paragraph>
        )}
      </Card>
    </div>
  );
}
