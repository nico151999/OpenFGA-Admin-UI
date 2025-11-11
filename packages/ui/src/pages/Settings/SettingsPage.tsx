import {
  ApiOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloudDownloadOutlined,
  CloudSyncOutlined,
  CloudUploadOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { type ConfigPathInfo, exportConfig, getConfigPath, importConfig } from '@api/config';
import { useAuthorizationModel, useAuthorizationModels } from '@api/openfga';
import { useConnectionStore, useSyncStatus } from '@store/connectionStore';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Divider,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useEffect, useState } from 'react';

dayjs.extend(relativeTime);

const { Text, Paragraph } = Typography;

export default function SettingsPage() {
  const { message } = App.useApp();
  const { getActiveProfile, updateProfile, syncFromGateway } = useConnectionStore();
  const { isSyncing, lastSyncError } = useSyncStatus();
  const profile = getActiveProfile();

  const [modelSelectionMode, setModelSelectionMode] = useState<'pinned' | 'latest'>(
    profile?.modelSelectionMode || 'latest'
  );
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(
    profile?.authorizationModelId
  );
  const [configPath, setConfigPath] = useState<ConfigPathInfo | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const {
    data: models,
    isLoading: modelsLoading,
    refetch: refetchModels,
  } = useAuthorizationModels();
  const { data: currentModel, isLoading: modelLoading } = useAuthorizationModel();

  // Helper to count total relations in a model
  const countRelations = (m: typeof currentModel) => {
    if (!m?.type_definitions) return 0;
    return m.type_definitions.reduce((acc, t) => acc + Object.keys(t.relations || {}).length, 0);
  };

  // Sync state when profile changes
  useEffect(() => {
    if (profile) {
      setModelSelectionMode(profile.modelSelectionMode || 'latest');
      setSelectedModelId(profile.authorizationModelId);
    }
  }, [profile]);

  // Fetch config path on mount
  useEffect(() => {
    getConfigPath()
      .then(setConfigPath)
      .catch(() => setConfigPath(null));
  }, []);

  const handleSave = () => {
    if (!profile) return;

    updateProfile(profile.id, {
      modelSelectionMode,
      authorizationModelId: modelSelectionMode === 'pinned' ? selectedModelId : undefined,
    });

    message.success('Settings saved successfully!');
  };

  const handlePinCurrent = () => {
    if (currentModel?.id) {
      setSelectedModelId(currentModel.id);
      setModelSelectionMode('pinned');
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportConfig();
      message.success('Config exported successfully!');
    } catch (_error) {
      message.error('Failed to export config');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (file: UploadFile) => {
    if (!file.originFileObj) return false;
    setIsImporting(true);
    try {
      await importConfig(file.originFileObj);
      await syncFromGateway();
      message.success('Config imported successfully!');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Failed to import config');
    } finally {
      setIsImporting(false);
    }
    return false; // Prevent default upload behavior
  };

  const handleSync = async () => {
    try {
      await syncFromGateway();
      message.success('Synced from gateway!');
    } catch {
      message.error('Failed to sync from gateway');
    }
  };

  const latestModel = models?.[0];
  const pinnedModel = models?.find((m) => m.id === selectedModelId);

  if (!profile) {
    return (
      <Card>
        <Alert
          type="warning"
          title="No Active Connection"
          description="Please connect to an OpenFGA instance first."
          showIcon
        />
      </Card>
    );
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {/* Connection Info */}
      <Card
        title={
          <Space>
            <ApiOutlined />
            <span>Connection Details</span>
          </Space>
        }
      >
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Profile Name">{profile.name}</Descriptions.Item>
          <Descriptions.Item label="OpenFGA URL">
            <Text code>{profile.openfgaApiUrl}</Text>
          </Descriptions.Item>
          <Descriptions.Item label="Store ID">
            <Text code copyable={{ text: profile.storeId }}>
              {profile.storeId}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label="Auth Method">
            <Tag color={profile.authMethod === 'none' ? 'default' : 'blue'}>
              {profile.authMethod.toUpperCase()}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Created">
            {dayjs(profile.createdAt).format('YYYY-MM-DD HH:mm')}
          </Descriptions.Item>
          <Descriptions.Item label="Last Updated">
            {dayjs(profile.updatedAt).fromNow()}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Authorization Model Selection */}
      <Card
        title={
          <Space>
            <PushpinOutlined />
            <span>Authorization Model Selection</span>
          </Space>
        }
        extra={
          <Button icon={<ReloadOutlined />} onClick={() => refetchModels()}>
            Refresh Models
          </Button>
        }
      >
        <Alert
          type="info"
          showIcon
          icon={<InfoCircleOutlined />}
          message="Model Selection Affects Multiple Pages"
          description={
            <Paragraph style={{ marginBottom: 0 }}>
              The selected authorization model determines which relations and types are available on
              the <Text strong>Relationship Tuples</Text>, <Text strong>Access Explorer</Text>, and{' '}
              <Text strong>Changes Feed</Text> pages. Choose "Latest" to always use the most recent
              model, or "Pinned" to lock to a specific version.
            </Paragraph>
          }
          style={{ marginBottom: 24 }}
        />

        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          {/* Mode Selection */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Model Selection Mode
            </Text>
            <Radio.Group
              value={modelSelectionMode}
              onChange={(e) => setModelSelectionMode(e.target.value)}
              size="large"
            >
              <Radio.Button value="latest">
                <Space>
                  <ClockCircleOutlined />
                  Always Use Latest
                </Space>
              </Radio.Button>
              <Radio.Button value="pinned">
                <Space>
                  <PushpinFilled />
                  Pin to Specific Version
                </Space>
              </Radio.Button>
            </Radio.Group>
          </div>

          {/* Model Selector (only shown when pinned mode) */}
          {modelSelectionMode === 'pinned' && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                Select Authorization Model
              </Text>
              {modelsLoading ? (
                <Spin />
              ) : (
                <Select
                  style={{ width: '100%', maxWidth: 700 }}
                  placeholder="Select an authorization model"
                  value={selectedModelId}
                  onChange={setSelectedModelId}
                  optionLabelProp="label"
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {models?.map((m, index) => {
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
                              {m.id.slice(0, 18)}...
                            </Text>
                            {index === 0 && <Tag color="green">Latest</Tag>}
                          </Space>
                          <Space size="small">
                            <Tag>v{m.schema_version}</Tag>
                            <Tag color="blue">{typeCount} types</Tag>
                            <Tag color="purple">{relCount} relations</Tag>
                          </Space>
                        </Space>
                      </Select.Option>
                    );
                  })}
                </Select>
              )}

              {/* Quick pin current model button */}
              {currentModel && modelSelectionMode === 'pinned' && !selectedModelId && (
                <Button
                  type="link"
                  icon={<PushpinOutlined />}
                  onClick={handlePinCurrent}
                  style={{ marginTop: 8 }}
                >
                  Pin current model ({currentModel.id.slice(0, 12)}...)
                </Button>
              )}
            </div>
          )}

          <Divider />

          {/* Current Model Info */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Currently Active Model
            </Text>
            {modelLoading ? (
              <Spin />
            ) : currentModel ? (
              <Card size="small" style={{ maxWidth: 600 }}>
                <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                  <Space>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <Text strong>Model ID:</Text>
                    <Text code copyable={{ text: currentModel.id }}>
                      {currentModel.id}
                    </Text>
                  </Space>
                  <Space>
                    <Text type="secondary">Types:</Text>
                    <Space wrap>
                      {currentModel.type_definitions?.slice(0, 5).map((t) => (
                        <Tag key={t.type}>{t.type}</Tag>
                      ))}
                      {(currentModel.type_definitions?.length || 0) > 5 && (
                        <Tag>+{(currentModel.type_definitions?.length || 0) - 5} more</Tag>
                      )}
                    </Space>
                  </Space>
                  {modelSelectionMode === 'latest' && latestModel && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <InfoCircleOutlined style={{ marginRight: 4 }} />
                      Using latest model. This will automatically update when new models are
                      created.
                    </Text>
                  )}
                  {modelSelectionMode === 'pinned' && pinnedModel && (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <PushpinFilled style={{ marginRight: 4, color: '#1890ff' }} />
                      Pinned to this specific model version. Changes won't affect your queries.
                    </Text>
                  )}
                </Space>
              </Card>
            ) : (
              <Alert
                type="warning"
                message="No model found"
                description="No authorization model exists for this store. Create one in the Model Editor."
              />
            )}
          </div>

          <Divider />

          {/* Save Button */}
          <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} size="large">
            Save Settings
          </Button>
        </Space>
      </Card>

      {/* Config Management */}
      <Card
        title={
          <Space>
            <CloudSyncOutlined />
            <span>Configuration Storage</span>
          </Space>
        }
        extra={
          <Space>
            {isSyncing && <Spin size="small" />}
            <Button icon={<ReloadOutlined />} onClick={handleSync} loading={isSyncing}>
              Sync from Gateway
            </Button>
          </Space>
        }
      >
        {lastSyncError && (
          <Alert
            type="warning"
            message="Sync Warning"
            description={`Last sync failed: ${lastSyncError}. Using local storage as fallback.`}
            style={{ marginBottom: 16 }}
            showIcon
          />
        )}

        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            icon={<InfoCircleOutlined />}
            message="Configuration Persistence"
            description={
              <Paragraph style={{ marginBottom: 0 }}>
                Your connection profiles and settings are stored both locally (browser) and on the
                gateway server. The gateway storage survives browser clearing and can be shared
                across browsers on the same machine.
              </Paragraph>
            }
          />

          {/* Config File Location */}
          {configPath && (
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                <FolderOpenOutlined style={{ marginRight: 8 }} />
                Config File Location
              </Text>
              <Card size="small" style={{ maxWidth: 700 }}>
                <Space orientation="vertical" size="small">
                  <Space>
                    <Text type="secondary">Directory:</Text>
                    <Text code copyable>
                      {configPath.configDir}
                    </Text>
                  </Space>
                  <Space>
                    <Text type="secondary">File:</Text>
                    <Text code copyable>
                      {configPath.configFile}
                    </Text>
                  </Space>
                  <Space>
                    <Text type="secondary">Status:</Text>
                    {configPath.exists ? (
                      <Tag color="green">File exists</Tag>
                    ) : (
                      <Tag color="orange">Will be created on first save</Tag>
                    )}
                  </Space>
                </Space>
              </Card>
            </div>
          )}

          <Divider />

          {/* Export/Import */}
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>
              Backup & Restore
            </Text>
            <Space>
              <Button icon={<CloudDownloadOutlined />} onClick={handleExport} loading={isExporting}>
                Export Config
              </Button>
              <Upload
                accept=".json"
                showUploadList={false}
                beforeUpload={(file) => {
                  handleImport({ originFileObj: file } as UploadFile);
                  return false;
                }}
              >
                <Button icon={<CloudUploadOutlined />} loading={isImporting}>
                  Import Config
                </Button>
              </Upload>
            </Space>
            <Paragraph type="secondary" style={{ marginTop: 8, fontSize: 12 }}>
              Export your config to share with team members or restore on another machine.
            </Paragraph>
          </div>
        </Space>
      </Card>
    </Space>
  );
}
