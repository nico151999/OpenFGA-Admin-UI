import type { ThemeConfig } from 'antd';

export const theme: ThemeConfig = {
  token: {
    // Primary brand color
    colorPrimary: '#1890ff',

    // Border radius
    borderRadius: 6,

    // Typography
    fontFamily: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`,

    // Layout
    colorBgLayout: '#f5f5f5',

    // Success/Error/Warning
    colorSuccess: '#52c41a',
    colorError: '#ff4d4f',
    colorWarning: '#faad14',
    colorInfo: '#1890ff',
  },
  components: {
    Layout: {
      siderBg: '#001529',
      triggerBg: '#002140',
    },
    Menu: {
      darkItemBg: '#001529',
      darkSubMenuItemBg: '#000c17',
    },
    Card: {
      paddingLG: 20,
    },
    Table: {
      headerBg: '#fafafa',
    },
    Button: {
      primaryShadow: '0 2px 0 rgba(24, 144, 255, 0.1)',
    },
  },
};
