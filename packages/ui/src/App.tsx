import AppLayout from '@layouts/AppLayout';
import ChangesFeedPage from '@pages/Changes/ChangesFeedPage';
import ConnectionPage from '@pages/Connection/ConnectionPage';
import DashboardPage from '@pages/Dashboard/DashboardPage';
import AccessExplorerPage from '@pages/Explorer/AccessExplorerPage';
import { HierarchyManagerPage } from '@pages/Hierarchy';
import ModelBrowserPage from '@pages/Model/ModelBrowserPage';
import ModelEditorPage from '@pages/Model/ModelEditorPage';
import SettingsPage from '@pages/Settings/SettingsPage';
import TupleManagerPage from '@pages/Tuples/TupleManagerPage';
import { useConnectionStore, useHasHydrated } from '@store/connectionStore';
import { Spin } from 'antd';
import { Navigate, Route, Routes } from 'react-router-dom';

function App() {
  const hasHydrated = useHasHydrated();
  const { isConnected } = useConnectionStore();

  // Wait for Zustand to hydrate from localStorage before rendering
  if (!hasHydrated) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        }}
      >
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Connection/Setup flow */}
      <Route path="/connect" element={<ConnectionPage />} />

      {/* Protected routes - require connection */}
      <Route path="/" element={isConnected ? <AppLayout /> : <Navigate to="/connect" replace />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="model" element={<ModelBrowserPage />} />
        <Route path="model/edit" element={<ModelEditorPage />} />
        <Route path="tuples" element={<TupleManagerPage />} />
        <Route path="explorer" element={<AccessExplorerPage />} />
        <Route path="hierarchy" element={<HierarchyManagerPage />} />
        <Route path="changes" element={<ChangesFeedPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
