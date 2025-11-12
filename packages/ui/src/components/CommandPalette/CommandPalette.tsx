import {
  ApartmentOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
  HistoryOutlined,
  PlusOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { useConnectionStore } from '@store/connectionStore';
import { Empty, Input, List, Modal, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;

interface CommandItem {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  category: 'navigation' | 'action' | 'recent';
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { recentItems } = useConnectionStore();

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  // Convert recent items to command items
  const recentCommands: CommandItem[] = useMemo(() => {
    return recentItems.slice(0, 5).map((item, index) => ({
      id: `recent-${index}`,
      title: item.value,
      description:
        item.type === 'tuple'
          ? 'Recent tuple'
          : item.type === 'object'
            ? 'Recent object'
            : 'Recent user',
      icon: <ClockCircleOutlined />,
      category: 'recent' as const,
      action: () => {
        if (item.type === 'tuple') {
          handleNavigate('/tuples');
        } else if (item.type === 'object') {
          handleNavigate('/explorer?tab=list-objects');
        } else {
          handleNavigate('/explorer?tab=list-users');
        }
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentItems, handleNavigate]);

  const commands: CommandItem[] = useMemo(
    () => [
      // Navigation
      {
        id: 'nav-dashboard',
        title: 'Go to Dashboard',
        description: 'View overview and quick stats',
        icon: <DashboardOutlined />,
        category: 'navigation',
        action: () => handleNavigate('/dashboard'),
      },
      {
        id: 'nav-model',
        title: 'Go to Authorization Model',
        description: 'Browse types, relations, and conditions',
        icon: <ApartmentOutlined />,
        category: 'navigation',
        action: () => handleNavigate('/model'),
      },
      {
        id: 'nav-tuples',
        title: 'Go to Relationship Tuples',
        description: 'Manage relationship tuples',
        icon: <UnorderedListOutlined />,
        category: 'navigation',
        action: () => handleNavigate('/tuples'),
      },
      {
        id: 'nav-explorer',
        title: 'Go to Access Explorer',
        description: 'Check permissions and explore access',
        icon: <SearchOutlined />,
        category: 'navigation',
        action: () => handleNavigate('/explorer'),
      },
      {
        id: 'nav-changes',
        title: 'Go to Changes Feed',
        description: 'View tuple change history',
        icon: <HistoryOutlined />,
        category: 'navigation',
        action: () => handleNavigate('/changes'),
      },
      // Actions
      {
        id: 'action-add-tuple',
        title: 'Add Tuple',
        description: 'Create a new relationship tuple',
        icon: <PlusOutlined />,
        category: 'action',
        action: () => handleNavigate('/tuples?action=add'),
      },
      {
        id: 'action-check',
        title: 'Check Permission',
        description: 'Verify if a user has access',
        icon: <CheckCircleOutlined />,
        category: 'action',
        action: () => handleNavigate('/explorer?tab=check'),
      },
      {
        id: 'action-batch-check',
        title: 'Batch Check Permissions',
        description: 'Check multiple permissions at once',
        icon: <ThunderboltOutlined />,
        category: 'action',
        action: () => handleNavigate('/explorer?tab=batch-check'),
      },
      // Recent items
      ...recentCommands,
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleNavigate, recentCommands]
  );

  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    const lower = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.title.toLowerCase().includes(lower) || cmd.description?.toLowerCase().includes(lower)
    );
  }, [commands, search]);

  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      navigation: [],
      action: [],
      recent: [],
    };
    filteredCommands.forEach((cmd) => {
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  useEffect(() => {
    if (!open) {
      setSearch('');
    }
  }, [open]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const categoryLabels: Record<string, string> = {
    navigation: 'Navigation',
    action: 'Quick Actions',
    recent: 'Recent',
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={600}
      className="command-palette-modal"
      styles={{
        body: { padding: 0 },
      }}
    >
      <div style={{ borderBottom: '1px solid #f0f0f0' }}>
        <Input
          placeholder="Search commands, pages, or actions..."
          prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          variant="borderless"
          size="large"
          autoFocus
          style={{ padding: '12px 16px' }}
        />
      </div>

      <div style={{ maxHeight: 400, overflow: 'auto', padding: '8px 0' }}>
        {filteredCommands.length === 0 ? (
          <Empty
            description="No commands found"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            style={{ padding: '24px 0' }}
          />
        ) : (
          Object.entries(groupedCommands).map(
            ([category, items]) =>
              items.length > 0 && (
                <div key={category} style={{ marginBottom: 8 }}>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 12,
                      padding: '4px 16px',
                      display: 'block',
                    }}
                  >
                    {categoryLabels[category]}
                  </Text>
                  <List
                    dataSource={items}
                    renderItem={(item) => (
                      <List.Item
                        onClick={item.action}
                        style={{
                          padding: '8px 16px',
                          cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f5f5f5';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <Space>
                          <span style={{ color: '#8c8c8c' }}>{item.icon}</span>
                          <div>
                            <Text strong>{item.title}</Text>
                            {item.description && (
                              <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                                {item.description}
                              </Text>
                            )}
                          </div>
                        </Space>
                        <Tag color="default" style={{ marginLeft: 'auto' }}>
                          {category === 'navigation' ? '↵' : '⌘'}
                        </Tag>
                      </List.Item>
                    )}
                  />
                </div>
              )
          )
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #f0f0f0',
          padding: '8px 16px',
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          <Tag>↑↓</Tag> Navigate <Tag>↵</Tag> Select <Tag>esc</Tag> Close
        </Text>
      </div>
    </Modal>
  );
}
