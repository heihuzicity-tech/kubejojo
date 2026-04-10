import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { useAppStore } from '../stores/appStore';
import { AuditPage } from '../pages/AuditPage';
import { ConfigPage } from '../pages/ConfigPage';
import { LoginPage } from '../pages/LoginPage';
import { NetworkPage } from '../pages/NetworkPage';
import { NodesPage } from '../pages/NodesPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PodsPage } from '../pages/PodsPage';
import { StoragePage } from '../pages/StoragePage';
import { WorkloadsPage } from '../pages/WorkloadsPage';

function ProtectedRoutes() {
  const token = useAppStore((state) => state.token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/overview" element={<OverviewPage />} />
        <Route path="/nodes" element={<NodesPage />} />
        <Route path="/workloads" element={<WorkloadsPage />} />
        <Route path="/pods" element={<PodsPage />} />
        <Route path="/network" element={<NetworkPage />} />
        <Route path="/config" element={<ConfigPage />} />
        <Route path="/storage/pvcs" element={<StoragePage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
    </AppLayout>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
