import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { navigationItems } from '../layouts/navigation';
import { useAppStore } from '../stores/appStore';
import { LoginPage } from '../pages/LoginPage';
import { NodesPage } from '../pages/NodesPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { TopologyPage } from '../pages/TopologyPage';

const placeholderItems = navigationItems.filter((item) => !item.implemented);

function ProtectedRoutes() {
  const token = useAppStore((state) => state.token);

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/cluster/overview" element={<OverviewPage />} />
        <Route path="/cluster/nodes" element={<NodesPage />} />
        <Route path="/topology" element={<TopologyPage />} />

        {placeholderItems.map((item) => (
          <Route
            key={item.key}
            path={item.path}
            element={<PlaceholderPage title={item.label} description={item.description} />}
          />
        ))}

        <Route path="/overview" element={<Navigate to="/cluster/overview" replace />} />
        <Route path="/nodes" element={<Navigate to="/cluster/nodes" replace />} />
        <Route path="/workloads" element={<Navigate to="/workloads/pods" replace />} />
        <Route path="/workloads/overview" element={<Navigate to="/workloads/pods" replace />} />
        <Route path="/pods" element={<Navigate to="/workloads/pods" replace />} />
        <Route path="/network" element={<Navigate to="/network/services" replace />} />
        <Route path="/config" element={<Navigate to="/config/configmaps" replace />} />
        <Route
          path="/storage/pvcs"
          element={<Navigate to="/storage/persistentvolumeclaims" replace />}
        />

        <Route path="*" element={<Navigate to="/cluster/overview" replace />} />
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
