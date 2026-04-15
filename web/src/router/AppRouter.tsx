import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppLayout } from '../layouts/AppLayout';
import { navigationItems } from '../layouts/navigation';
import { useAppStore } from '../stores/appStore';
import { ConfigMapDetailsPage } from '../pages/ConfigMapDetailsPage';
import { ConfigMapsPage } from '../pages/ConfigMapsPage';
import { EndpointDetailsPage } from '../pages/EndpointDetailsPage';
import { EndpointsPage } from '../pages/EndpointsPage';
import { IngressClassDetailsPage } from '../pages/IngressClassDetailsPage';
import { IngressClassesPage } from '../pages/IngressClassesPage';
import { StorageClassesPage } from '../pages/StorageClassesPage';
import { StorageClassDetailsPage } from '../pages/StorageClassDetailsPage';
import { LoginPage } from '../pages/LoginPage';
import { DaemonSetsPage } from '../pages/DaemonSetsPage';
import { DaemonSetDetailsPage } from '../pages/DaemonSetDetailsPage';
import { CronJobsPage } from '../pages/CronJobsPage';
import { CronJobDetailsPage } from '../pages/CronJobDetailsPage';
import { DeploymentDetailsPage } from '../pages/DeploymentDetailsPage';
import { DeploymentsPage } from '../pages/DeploymentsPage';
import { JobDetailsPage } from '../pages/JobDetailsPage';
import { JobsPage } from '../pages/JobsPage';
import { IngressDetailsPage } from '../pages/IngressDetailsPage';
import { IngressesPage } from '../pages/IngressesPage';
import { NetworkPoliciesPage } from '../pages/NetworkPoliciesPage';
import { NetworkPolicyDetailsPage } from '../pages/NetworkPolicyDetailsPage';
import { NamespacesPage } from '../pages/NamespacesPage';
import { NodesPage } from '../pages/NodesPage';
import { OverviewPage } from '../pages/OverviewPage';
import { PersistentVolumeClaimDetailsPage } from '../pages/PersistentVolumeClaimDetailsPage';
import { PersistentVolumeClaimsPage } from '../pages/PersistentVolumeClaimsPage';
import { PersistentVolumeDetailsPage } from '../pages/PersistentVolumeDetailsPage';
import { PersistentVolumesPage } from '../pages/PersistentVolumesPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';
import { PodDetailsPage } from '../pages/PodDetailsPage';
import { PodsPage } from '../pages/PodsPage';
import { ReplicaSetDetailsPage } from '../pages/ReplicaSetDetailsPage';
import { ReplicaSetsPage } from '../pages/ReplicaSetsPage';
import { HPADetailsPage } from '../pages/HPADetailsPage';
import { HPAsPage } from '../pages/HPAsPage';
import { LimitRangeDetailsPage } from '../pages/LimitRangeDetailsPage';
import { LimitRangesPage } from '../pages/LimitRangesPage';
import { RoleBindingDetailsPage } from '../pages/RoleBindingDetailsPage';
import { RoleBindingsPage } from '../pages/RoleBindingsPage';
import { RoleDetailsPage } from '../pages/RoleDetailsPage';
import { RolesPage } from '../pages/RolesPage';
import { ResourceQuotaDetailsPage } from '../pages/ResourceQuotaDetailsPage';
import { ResourceQuotasPage } from '../pages/ResourceQuotasPage';
import { SecretDetailsPage } from '../pages/SecretDetailsPage';
import { SecretsPage } from '../pages/SecretsPage';
import { ServiceDetailsPage } from '../pages/ServiceDetailsPage';
import { ServiceAccountDetailsPage } from '../pages/ServiceAccountDetailsPage';
import { ServiceAccountsPage } from '../pages/ServiceAccountsPage';
import { ServicesPage } from '../pages/ServicesPage';
import { StatefulSetDetailsPage } from '../pages/StatefulSetDetailsPage';
import { StatefulSetsPage } from '../pages/StatefulSetsPage';
import { TopologyPage } from '../pages/TopologyPage';
import { VPADetailsPage } from '../pages/VPADetailsPage';
import { VPAsPage } from '../pages/VPAsPage';

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
        <Route path="/network/services" element={<ServicesPage />} />
        <Route path="/network/services/:namespace/:name" element={<ServiceDetailsPage />} />
        <Route path="/network/endpoints" element={<EndpointsPage />} />
        <Route path="/network/endpoints/:namespace/:name" element={<EndpointDetailsPage />} />
        <Route path="/network/ingresses" element={<IngressesPage />} />
        <Route path="/network/ingresses/:namespace/:name" element={<IngressDetailsPage />} />
        <Route path="/network/ingressclasses" element={<IngressClassesPage />} />
        <Route path="/network/ingressclasses/:name" element={<IngressClassDetailsPage />} />
        <Route path="/network/networkpolicies" element={<NetworkPoliciesPage />} />
        <Route
          path="/network/networkpolicies/:namespace/:name"
          element={<NetworkPolicyDetailsPage />}
        />
        <Route path="/config/configmaps" element={<ConfigMapsPage />} />
        <Route path="/config/configmaps/:namespace/:name" element={<ConfigMapDetailsPage />} />
        <Route path="/config/secrets" element={<SecretsPage />} />
        <Route path="/config/secrets/:namespace/:name" element={<SecretDetailsPage />} />
        <Route path="/security/serviceaccounts" element={<ServiceAccountsPage />} />
        <Route
          path="/security/serviceaccounts/:namespace/:name"
          element={<ServiceAccountDetailsPage />}
        />
        <Route path="/security/roles" element={<RolesPage />} />
        <Route path="/security/roles/:namespace/:name" element={<RoleDetailsPage />} />
        <Route path="/security/rolebindings" element={<RoleBindingsPage />} />
        <Route
          path="/security/rolebindings/:namespace/:name"
          element={<RoleBindingDetailsPage />}
        />
        <Route path="/resources/hpas" element={<HPAsPage />} />
        <Route path="/resources/hpas/:namespace/:name" element={<HPADetailsPage />} />
        <Route path="/resources/vpas" element={<VPAsPage />} />
        <Route path="/resources/vpas/:namespace/:name" element={<VPADetailsPage />} />
        <Route path="/resources/resourcequotas" element={<ResourceQuotasPage />} />
        <Route
          path="/resources/resourcequotas/:namespace/:name"
          element={<ResourceQuotaDetailsPage />}
        />
        <Route path="/resources/limitranges" element={<LimitRangesPage />} />
        <Route
          path="/resources/limitranges/:namespace/:name"
          element={<LimitRangeDetailsPage />}
        />
        <Route
          path="/storage/persistentvolumeclaims"
          element={<PersistentVolumeClaimsPage />}
        />
        <Route
          path="/storage/persistentvolumeclaims/:namespace/:name"
          element={<PersistentVolumeClaimDetailsPage />}
        />
        <Route path="/storage/persistentvolumes" element={<PersistentVolumesPage />} />
        <Route path="/storage/persistentvolumes/:name" element={<PersistentVolumeDetailsPage />} />
        <Route path="/storage/storageclasses" element={<StorageClassesPage />} />
        <Route path="/storage/storageclasses/:name" element={<StorageClassDetailsPage />} />
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
