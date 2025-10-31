import { InboxOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAddChildren } from '@api/hierarchy';
import type { HierarchyEdge } from '@openfga-admin/shared';
import {
  Alert,
  App,
  Checkbox,
  Form,
  Input,
  Modal,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import { useMemo, useState } from 'react';

const { TextArea } = Input;
const { Text } = Typography;

interface AddChildrenModalProps {
  open: boolean;
  edge: HierarchyEdge;
  parentObject: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface PreviewItem {
  id: string;
  status: 'valid' | 'duplicate' | 'invalid';
  message?: string;
}

export function AddChildrenModal({
  open,
  edge,
  parentObject,
  onClose,
  onSuccess,
}: AddChildrenModalProps) {
  const { message } = App.useApp();
  const addChildren = useAddChildren();

  const [inputValue, setInputValue] = useState('');
  const [ensurePlatformMembership, setEnsurePlatformMembership] = useState(true);

  // Parse and validate input
  const preview = useMemo((): PreviewItem[] => {
    if (!inputValue.trim()) return [];

    const lines = inputValue
      .split(/[\n,]/)
      .map((line) => line.trim())
      .filter(Boolean);

    const seen = new Set<string>();
    const items: PreviewItem[] = [];

    for (const line of lines) {
      // Auto-prefix with child type if missing
      const id = line.includes(':') ? line : `${edge.childType}:${line}`;

      // Check for duplicates in input
      if (seen.has(id)) {
        items.push({ id, status: 'duplicate', message: 'Duplicate in input' });
      } else {
        // Basic format validation
        const parts = id.split(':');
        if (parts.length < 2 || !parts[0] || !parts[1]) {
          items.push({ id, status: 'invalid', message: 'Invalid format (expected type:id)' });
        } else {
          items.push({ id, status: 'valid' });
        }
        seen.add(id);
      }
    }

    return items;
  }, [inputValue, edge.childType]);

  const validItems = preview.filter((p) => p.status === 'valid');
  const hasErrors = preview.some((p) => p.status === 'invalid');
  const hasDuplicates = preview.some((p) => p.status === 'duplicate');

  const handleSubmit = async () => {
    if (validItems.length === 0) {
      message.warning('No valid items to add');
      return;
    }

    try {
      const result = await addChildren.mutateAsync({
        edgeId: edge.id,
        parentObject,
        children: validItems.map((p) => p.id),
        options: {
          ensurePlatformMembership: ensurePlatformMembership && edge.kind === 'parent-membership',
        },
      });

      if (result.errors.length > 0) {
        message.warning(
          `Added ${result.added} ${edge.childType}(s), ${result.errors.length} failed`
        );
      } else {
        message.success(`Added ${result.added} ${edge.childType}(s)`);
        if (result.platformMembershipsAdded && result.platformMembershipsAdded > 0) {
          message.info(`Also added ${result.platformMembershipsAdded} platform membership(s)`);
        }
      }

      setInputValue('');
      onSuccess();
    } catch (err) {
      message.error(`Failed to add: ${(err as Error).message}`);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        // Parse CSV - assume first column is the ID
        const lines = content
          .split('\n')
          .slice(1) // Skip header
          .map((line) => line.split(',')[0]?.trim())
          .filter(Boolean);
        setInputValue(lines.join('\n'));
      }
    };
    reader.readAsText(file);
    return false; // Prevent default upload
  };

  const previewColumns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: PreviewItem) => {
        if (status === 'valid') {
          return <Tag color="green">Valid</Tag>;
        }
        if (status === 'duplicate') {
          return (
            <Tooltip title={record.message}>
              <Tag color="orange">Duplicate (will skip)</Tag>
            </Tooltip>
          );
        }
        return (
          <Tooltip title={record.message}>
            <Tag color="red">Invalid</Tag>
          </Tooltip>
        );
      },
    },
  ];

  // Check if this edge supports platform membership helper
  const showPlatformHelper =
    edge.kind === 'parent-membership' &&
    edge.discoveryHint?.supportsScoped &&
    edge.discoveryHint?.scopeType === 'platform';

  return (
    <Modal
      title={
        <Space>
          Add {edge.childType}s to <Text code>{parentObject}</Text>
        </Space>
      }
      open={open}
      onCancel={() => {
        setInputValue('');
        onClose();
      }}
      onOk={handleSubmit}
      okText={`Add ${validItems.length} ${edge.childType}(s)`}
      okButtonProps={{
        disabled: validItems.length === 0 || hasErrors,
        loading: addChildren.isPending,
      }}
      width={600}
    >
      <Space orientation="vertical" style={{ width: '100%' }} size="middle">
        {/* Instructions */}
        <Alert
          message="Enter IDs"
          description={
            <Text>
              Enter {edge.childType} IDs, one per line. You can also paste comma-separated values.
              IDs without a type prefix will automatically use <Tag>{edge.childType}:</Tag>
            </Text>
          }
          type="info"
          showIcon
        />

        {/* Input area */}
        <Form layout="vertical">
          <Form.Item label={`${edge.childType} IDs (one per line)`}>
            <TextArea
              rows={6}
              placeholder={`${edge.childType}:alice\n${edge.childType}:bob\nor just:\nalice\nbob`}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
          </Form.Item>

          {/* CSV Upload */}
          <Form.Item label="Or upload CSV">
            <Upload.Dragger accept=".csv" showUploadList={false} beforeUpload={handleFileUpload}>
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">Click or drag CSV file</p>
              <p className="ant-upload-hint">First column should contain IDs</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>

        {/* Preview table */}
        {preview.length > 0 && (
          <>
            <Text strong>
              Preview ({validItems.length} valid, {preview.length - validItems.length} issues)
            </Text>
            <Table
              size="small"
              columns={previewColumns}
              dataSource={preview}
              rowKey="id"
              pagination={false}
              scroll={{ y: 200 }}
            />
          </>
        )}

        {/* Warnings */}
        {hasDuplicates && (
          <Alert
            message="Duplicates will be skipped"
            description="Duplicate entries in your input will be ignored."
            type="warning"
            showIcon
          />
        )}

        {hasErrors && (
          <Alert
            message="Invalid entries detected"
            description="Please fix invalid entries before submitting."
            type="error"
            showIcon
          />
        )}

        {/* Options */}
        <div style={{ borderTop: '1px solid #303030', paddingTop: 12 }}>
          <Text strong>Options</Text>

          <div style={{ marginTop: 8 }}>
            <Checkbox defaultChecked disabled>
              <Space>
                Ignore if already exists
                <Tooltip title="Uses on_duplicate: ignore to prevent errors">
                  <InfoCircleOutlined />
                </Tooltip>
              </Space>
            </Checkbox>
          </div>

          {showPlatformHelper && (
            <div style={{ marginTop: 8 }}>
              <Checkbox
                checked={ensurePlatformMembership}
                onChange={(e) => setEnsurePlatformMembership(e.target.checked)}
              >
                <Space>
                  Ensure {edge.childType}s are members of the platform
                  <Tooltip title="Automatically adds platform membership tuples for users who aren't already members">
                    <InfoCircleOutlined />
                  </Tooltip>
                </Space>
              </Checkbox>
            </div>
          )}
        </div>
      </Space>
    </Modal>
  );
}
