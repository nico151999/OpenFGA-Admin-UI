import {
  ApartmentOutlined,
  ApiOutlined,
  DashboardOutlined,
  HistoryOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined,
  SettingOutlined,
  TeamOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import CommandPalette from '@components/CommandPalette/CommandPalette';
import { useConnectionStore } from '@store/connectionStore';
import { Avatar, Breadcrumb, Button, Dropdown, Layout, Menu, Space, Typography, theme } from 'antd';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const menuItems = [
  {
    key: '/dashboard',
    icon: <DashboardOutlined />,
    label: 'Dashboard',
  },
  {
    key: '/model',
    icon: <ApartmentOutlined />,
    label: 'Authorization Model',
  },
  {
    key: '/tuples',
    icon: <UnorderedListOutlined />,
    label: 'Relationship Tuples',
  },
  {
    key: '/explorer',
    icon: <SearchOutlined />,
    label: 'Access Explorer',
  },
  {
    key: '/hierarchy',
    icon: <TeamOutlined />,
    label: 'Grouped Permissions',
  },
  {
    key: '/changes',
    icon: <HistoryOutlined />,
    label: 'Changes Feed',
  },
  {
    type: 'divider' as const,
  },
  {
    key: '/settings',
    icon: <SettingOutlined />,
    label: 'Settings',
  },
];

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = theme.useToken();
  const { getActiveProfile, disconnect } = useConnectionStore();

  const activeProfile = getActiveProfile();

  // Keyboard shortcut for command palette
  useState(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const getBreadcrumbItems = () => {
    const pathSegments = location.pathname.split('/').filter(Boolean);
    return [
      { title: 'Home', href: '/' },
      ...pathSegments.map((segment, index) => ({
        title: segment.charAt(0).toUpperCase() + segment.slice(1),
        href: `/${pathSegments.slice(0, index + 1).join('/')}`,
      })),
    ];
  };

  const handleLogout = () => {
    disconnect();
    navigate('/connect');
  };

  const userMenuItems = [
    {
      key: 'profile',
      icon: <SettingOutlined />,
      label: 'Connection Settings',
      onClick: () => navigate('/connect'),
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: 'Disconnect',
      onClick: handleLogout,
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="dark"
        width={240}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'fixed',
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? 0 : '0 16px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <ApiOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          {!collapsed && (
            <Text
              strong
              style={{
                color: '#fff',
                marginLeft: 12,
                fontSize: 16,
              }}
            >
              OpenFGA Admin
            </Text>
          )}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0 }}
        />
      </Sider>

      <Layout style={{ marginLeft: collapsed ? 80 : 240, transition: 'all 0.2s' }}>
        <Header
          style={{
            padding: '0 24px',
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Space>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
            />
            <Breadcrumb items={getBreadcrumbItems()} />
          </Space>

          <Space size="middle">
            <Button
              type="text"
              icon={<SearchOutlined />}
              onClick={() => setCommandPaletteOpen(true)}
            >
              Search (⌘K)
            </Button>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size="small" style={{ backgroundColor: token.colorPrimary }}>
                  {activeProfile?.name?.charAt(0).toUpperCase() || 'U'}
                </Avatar>
                <Text>{activeProfile?.name || 'Unknown'}</Text>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: 24,
            minHeight: 280,
          }}
        >
          <Outlet />
        </Content>
      </Layout>

      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
    </Layout>
  );
}
