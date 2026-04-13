import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { navigationItems } from '../layouts/navigation';
import { useAppStore } from '../stores/appStore';
import { LoginPage } from '../pages/LoginPage';
import { DaemonSetsPage } from '../pages/DaemonSetsPage';
import { DaemonSetDetailsPage } from '../pages/DaemonSetDetailsPage';
import { CronJobsPage } from '../pages/CronJobsPage';
import { CronJobDetailsPage } from '../pages/CronJobDetailsPage';
import { DeploymentDetailsPage } from '../pages/DeploymentDetailsPage';
import { DeploymentsPage } from '../pages/DeploymentsPage';
import { JobDetailsPage } from '../pages/JobDetailsPage';
import { JobsPage } from '../pages/JobsPage';
import { NamespacesPage } from '../pages/NamespacesPage';
import { NodesPage } from '../pages/NodesPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { PodDetailsPage } from '../pages/PodDetailsPage';
import { PodsPage } from '../pages/PodsPage';
import { ReplicaSetDetailsPage } from '../pages/ReplicaSetDetailsPage';
import { ReplicaSetsPage } from '../pages/ReplicaSetsPage';
import { StatefulSetDetailsPage } from '../pages/StatefulSetDetailsPage';
import { StatefulSetsPage } from '../pages/StatefulSetsPage';
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
        <Route path="/cluster/namespaces" element={<NamespacesPage />} />
        <Route path="/cluster/nodes" element={<NodesPage />} />
        <Route path="/workloads/pods" element={<PodsPage />} />
        <Route path="/workloads/pods/:namespace/:name" element={<PodDetailsPage />} />
        <Route path="/workloads/deployments" element={<DeploymentsPage />} />
        <Route
          path="/workloads/deployments/:namespace/:name"
          element={<DeploymentDetailsPage />}
        />
        <Route path="/workloads/statefulsets" element={<StatefulSetsPage />} />
        <Route
          path="/workloads/statefulsets/:namespace/:name"
          element={<StatefulSetDetailsPage />}
        />
        <Route path="/workloads/daemonsets" element={<DaemonSetsPage />} />
        <Route path="/workloads/daemonsets/:namespace/:name" element={<DaemonSetDetailsPage />} />
        <Route path="/workloads/replicasets" element={<ReplicaSetsPage />} />
        <Route
          path="/workloads/replicasets/:namespace/:name"
          element={<ReplicaSetDetailsPage />}
        />
        <Route path="/workloads/jobs" element={<JobsPage />} />
        <Route path="/workloads/jobs/:namespace/:name" element={<JobDetailsPage />} />
        <Route path="/workloads/cronjobs" element={<CronJobsPage />} />
        <Route path="/workloads/cronjobs/:namespace/:name" element={<CronJobDetailsPage />} />
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
