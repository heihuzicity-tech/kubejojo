import {
  ApartmentOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons';
import type { ReactNode } from 'react';

import type { TopologyResource } from '../../services/cluster';
import { collectLeafNodes, getNodeWeight, type TopologyGraphNode } from './graph/graphModel';

export function statusMeta(status: TopologyResource['status']) {
  switch (status) {
    case 'error':
      return {
        label: 'Error',
        tagColor: 'red',
        dotClass: 'bg-rose-500',
        borderClass: 'border-rose-200',
        ringClass: 'ring-rose-100',
        surfaceClass: 'bg-rose-50',
      };
    case 'warning':
      return {
        label: 'Warning',
        tagColor: 'orange',
        dotClass: 'bg-amber-500',
        borderClass: 'border-amber-200',
        ringClass: 'ring-amber-100',
        surfaceClass: 'bg-amber-50',
      };
    default:
      return {
        label: 'Healthy',
        tagColor: 'green',
        dotClass: 'bg-emerald-500',
        borderClass: 'border-emerald-200',
        ringClass: 'ring-emerald-100',
        surfaceClass: 'bg-emerald-50',
      };
  }
}

export function sourceMeta(source: TopologyResource['source']): {
  label: string;
  icon: ReactNode;
} {
  switch (source) {
    case 'workloads':
      return {
        label: 'Workload',
        icon: <DeploymentUnitOutlined />,
      };
    case 'network':
      return {
        label: 'Network',
        icon: <ApartmentOutlined />,
      };
    default:
      return {
        label: 'Storage',
        icon: <DatabaseOutlined />,
      };
  }
}

export function kindCode(kind: string) {
  const map: Record<string, string> = {
    Deployment: 'DP',
    StatefulSet: 'SS',
    DaemonSet: 'DS',
    ReplicaSet: 'RS',
    Pod: 'PO',
    Job: 'JB',
    CronJob: 'CJ',
    Service: 'SV',
    Endpoints: 'EP',
    Ingress: 'IG',
    IngressClass: 'IC',
    NetworkPolicy: 'NP',
    PersistentVolumeClaim: 'PVC',
    PersistentVolume: 'PV',
    StorageClass: 'SC',
  };

  return map[kind] ?? kind.slice(0, 2).toUpperCase();
}

export function getDisplayResource(node: TopologyGraphNode) {
  if (node.resource) {
    return node.resource;
  }

  const leafNodes = collectLeafNodes(node).filter((item) => item.resource);
  if (leafNodes.length === 0) {
    return undefined;
  }

  return leafNodes.sort((left, right) => getNodeWeight(right) - getNodeWeight(left))[0].resource;
}

export function getNodeIssueCount(node: TopologyGraphNode) {
  return collectLeafNodes(node).reduce((count, item) => count + (item.resource?.warnings ?? 0), 0);
}

export function getNodeAggregateStatus(
  node: TopologyGraphNode,
): TopologyResource['status'] {
  const leafResources = collectLeafNodes(node)
    .map((item) => item.resource)
    .filter(Boolean) as TopologyResource[];

  if (leafResources.some((resource) => resource.status === 'error')) {
    return 'error';
  }

  if (leafResources.some((resource) => resource.status === 'warning')) {
    return 'warning';
  }

  return 'healthy';
}

export function getGroupPreviewText(node: TopologyGraphNode) {
  const displayResource = getDisplayResource(node);
  const resourceCount = collectLeafNodes(node).length;

  if (!displayResource) {
    return `${resourceCount} 个资源`;
  }

  return `${displayResource.kind} / ${displayResource.name}`;
}
