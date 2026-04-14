import { buildCronJobRoute } from '../../components/cronjob/cronJobShared';
import { buildDaemonSetRoute } from '../../components/daemonset/daemonSetShared';
import { buildDeploymentRoute } from '../../components/deployment/deploymentShared';
import { buildJobRoute } from '../../components/job/jobShared';
import { buildPodRoute } from '../../components/pod/podShared';
import { buildReplicaSetRoute } from '../../components/replicaset/replicaSetShared';
import { buildStatefulSetRoute } from '../../components/statefulset/statefulSetShared';
import type { TopologyResource } from '../../services/cluster';

export type TopologyResourceNavigation = {
  detailsPath?: string;
  listPath?: string;
  listLabel?: string;
};

export function getTopologyResourceNavigation(
  resource: TopologyResource,
): TopologyResourceNavigation {
  switch (resource.kind) {
    case 'Pod':
      return {
        detailsPath: buildPodRoute(resource.namespace, resource.name),
        listPath: '/workloads/pods',
        listLabel: 'Pods',
      };
    case 'Deployment':
      return {
        detailsPath: buildDeploymentRoute(resource.namespace, resource.name),
        listPath: '/workloads/deployments',
        listLabel: 'Deployments',
      };
    case 'StatefulSet':
      return {
        detailsPath: buildStatefulSetRoute(resource.namespace, resource.name),
        listPath: '/workloads/statefulsets',
        listLabel: 'StatefulSets',
      };
    case 'DaemonSet':
      return {
        detailsPath: buildDaemonSetRoute(resource.namespace, resource.name),
        listPath: '/workloads/daemonsets',
        listLabel: 'DaemonSets',
      };
    case 'ReplicaSet':
      return {
        detailsPath: buildReplicaSetRoute(resource.namespace, resource.name),
        listPath: '/workloads/replicasets',
        listLabel: 'ReplicaSets',
      };
    case 'Job':
      return {
        detailsPath: buildJobRoute(resource.namespace, resource.name),
        listPath: '/workloads/jobs',
        listLabel: 'Jobs',
      };
    case 'CronJob':
      return {
        detailsPath: buildCronJobRoute(resource.namespace, resource.name),
        listPath: '/workloads/cronjobs',
        listLabel: 'CronJobs',
      };
    case 'Service':
      return {
        listPath: '/network/services',
        listLabel: 'Services',
      };
    case 'Ingress':
      return {
        listPath: '/network/ingresses',
        listLabel: 'Ingresses',
      };
    case 'PersistentVolumeClaim':
      return {
        listPath: '/storage/persistentvolumeclaims',
        listLabel: 'PersistentVolumeClaims',
      };
    default:
      return {};
  }
}

export function hasTopologyDetailsRoute(resource: TopologyResource) {
  return Boolean(getTopologyResourceNavigation(resource).detailsPath);
}
