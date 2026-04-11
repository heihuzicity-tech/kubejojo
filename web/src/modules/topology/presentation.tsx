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
  cardBorderClass: string;
  cardRingClass: string;
  stackBorderClass: string;
  stackSurfaceClass: string;
  iconBorderClass: string;
  iconSurfaceClass: string;
  iconTextClass: string;
  badgeClass: string;
  badgeTextClass: string;
  groupBorderClass: string;
  groupSurfaceClass: string;
  groupChipBorderClass: string;
  groupChipSurfaceClass: string;
  selectedClass: string;
} {
  switch (source) {
    case 'workloads':
      return {
        label: 'Workload',
        icon: <DeploymentUnitOutlined />,
        cardBorderClass: 'border-emerald-200',
        cardRingClass: 'ring-emerald-100',
        stackBorderClass: 'border-emerald-100',
        stackSurfaceClass: 'bg-emerald-50/55',
        iconBorderClass: 'border-emerald-200',
        iconSurfaceClass: 'bg-emerald-50',
        iconTextClass: 'text-emerald-950',
        badgeClass: 'bg-emerald-50',
        badgeTextClass: 'text-emerald-700',
        groupBorderClass: 'border-emerald-200',
        groupSurfaceClass: 'bg-emerald-50/30',
        groupChipBorderClass: 'border-emerald-100',
        groupChipSurfaceClass: 'bg-white/92',
        selectedClass: 'border-emerald-400 ring-2 ring-emerald-200 shadow-[0_12px_26px_rgba(16,185,129,0.14)]',
      };
    case 'network':
      return {
        label: 'Network',
        icon: <ApartmentOutlined />,
        cardBorderClass: 'border-violet-200',
        cardRingClass: 'ring-violet-100',
        stackBorderClass: 'border-violet-100',
        stackSurfaceClass: 'bg-violet-50/55',
        iconBorderClass: 'border-violet-200',
        iconSurfaceClass: 'bg-violet-50',
        iconTextClass: 'text-violet-950',
        badgeClass: 'bg-violet-50',
        badgeTextClass: 'text-violet-700',
        groupBorderClass: 'border-violet-200',
        groupSurfaceClass: 'bg-violet-50/30',
        groupChipBorderClass: 'border-violet-100',
        groupChipSurfaceClass: 'bg-white/92',
        selectedClass: 'border-violet-400 ring-2 ring-violet-200 shadow-[0_12px_26px_rgba(139,92,246,0.14)]',
      };
    default:
      return {
        label: 'Storage',
        icon: <DatabaseOutlined />,
        cardBorderClass: 'border-amber-200',
        cardRingClass: 'ring-amber-100',
        stackBorderClass: 'border-amber-100',
        stackSurfaceClass: 'bg-amber-50/55',
        iconBorderClass: 'border-amber-200',
        iconSurfaceClass: 'bg-amber-50',
        iconTextClass: 'text-amber-950',
        badgeClass: 'bg-amber-50',
        badgeTextClass: 'text-amber-700',
        groupBorderClass: 'border-amber-200',
        groupSurfaceClass: 'bg-amber-50/30',
        groupChipBorderClass: 'border-amber-100',
        groupChipSurfaceClass: 'bg-white/92',
        selectedClass: 'border-amber-400 ring-2 ring-amber-200 shadow-[0_12px_26px_rgba(245,158,11,0.14)]',
      };
  }
}

export function kindCode(kind: string) {
  const map: Record<string, string> = {
    Deployment: 'DP',
    StatefulSet: 'SS',
    DaemonSet: 'DS',
    ReplicaSet: 'RS',
    Pod: 'POD',
    Job: 'JB',
    CronJob: 'CJ',
    Service: 'SVC',
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

export function getNodeSourceStats(node: TopologyGraphNode) {
  const counts = new Map<TopologyResource['source'], number>();

  collectLeafNodes(node).forEach((item) => {
    if (!item.resource) {
      return;
    }

    counts.set(item.resource.source, (counts.get(item.resource.source) ?? 0) + 1);
  });

  const orderedSources: TopologyResource['source'][] = ['workloads', 'network', 'storage'];

  return orderedSources
    .filter((source) => counts.has(source))
    .map((source) => ({
      source,
      count: counts.get(source) ?? 0,
      meta: sourceMeta(source),
    }));
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
