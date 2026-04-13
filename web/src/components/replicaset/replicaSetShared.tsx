import { Tag, Typography } from 'antd';

import type { ReplicaSetConditionItem, ReplicaSetItem } from '../../services/cluster';

export const demoReplicaSets: ReplicaSetItem[] = [
  {
    name: 'nginx-demo-6f9c95f95f',
    namespace: 'default',
    status: 'Healthy',
    desiredReplicas: 3,
    currentReplicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
    fullyLabeledReplicas: 3,
    podCount: 3,
    restartCount: 0,
    age: '2d',
    createdAt: '2026-04-09 10:10:00',
    metricsAvailable: true,
    cpuUsage: '0m',
    memoryUsage: '8.4 MiB',
    ownerKind: 'Deployment',
    ownerName: 'nginx-demo',
    selector: ['app=nginx-demo', 'pod-template-hash=6f9c95f95f'],
    labels: ['app=nginx-demo', 'pod-template-hash=6f9c95f95f'],
    images: ['nginx=nginx:1.27-alpine'],
    conditions: [
      { type: 'ReplicaFailure', status: 'False' },
    ],
    pods: [
      {
        name: 'nginx-demo-6f9c95f95f-c6jth',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node2',
        metricsAvailable: true,
        cpuUsage: '0m',
        memoryUsage: '2.8 MiB',
      },
      {
        name: 'nginx-demo-6f9c95f95f-gzctk',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node2',
        metricsAvailable: true,
        cpuUsage: '0m',
        memoryUsage: '2.8 MiB',
      },
      {
        name: 'nginx-demo-6f9c95f95f-pm4qf',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '0m',
        memoryUsage: '2.8 MiB',
      },
    ],
  },
];

export const demoReplicaSetYaml: Record<string, string> = {
  'default/nginx-demo-6f9c95f95f': [
    'apiVersion: apps/v1',
    'kind: ReplicaSet',
    'metadata:',
    '  name: nginx-demo-6f9c95f95f',
    '  namespace: default',
    '  labels:',
    '    app: nginx-demo',
    '    pod-template-hash: 6f9c95f95f',
    'spec:',
    '  replicas: 3',
    '  selector:',
    '    matchLabels:',
    '      app: nginx-demo',
    '      pod-template-hash: 6f9c95f95f',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: nginx-demo',
    '        pod-template-hash: 6f9c95f95f',
    '    spec:',
    '      containers:',
    '        - name: nginx',
    '          image: nginx:1.27-alpine',
    'status:',
    '  readyReplicas: 3',
    '  availableReplicas: 3',
  ].join('\n'),
};

export function displayReplicaSetNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildReplicaSetRoute(namespace: string, name: string) {
  return `/workloads/replicasets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function replicaSetStatusColor(status: string) {
  switch (status) {
    case 'Healthy':
      return 'green';
    case 'Progressing':
      return 'orange';
    case 'Degraded':
      return 'red';
    case 'ScaledDown':
      return 'default';
    default:
      return 'default';
  }
}

export function replicaSetRestartTone(count: number) {
  if (count > 3) {
    return 'red';
  }

  if (count > 0) {
    return 'orange';
  }

  return 'default';
}

export function replicaSetPodStatusColor(status: string) {
  switch (status) {
    case 'Running':
      return 'green';
    case 'Pending':
    case 'ContainerCreating':
    case 'Terminating':
      return 'orange';
    case 'Failed':
    case 'Unknown':
    case 'CrashLoopBackOff':
    case 'ImagePullBackOff':
    case 'ErrImagePull':
      return 'red';
    default:
      return 'default';
  }
}

export function replicaSetConditionTagColor(condition: ReplicaSetConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'ReplicaFailure' ? 'red' : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'ReplicaFailure' ? 'green' : 'default';
  }

  return 'default';
}

export function MetricValue({
  available,
  value,
}: {
  available: boolean;
  value?: string;
}) {
  if (!available || !value) {
    return <Tag>Unavailable</Tag>;
  }

  return <Typography.Text strong>{value}</Typography.Text>;
}

export function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function replicaSetOwnerSummary(item: ReplicaSetItem) {
  if (!item.ownerKind || !item.ownerName) {
    return 'Standalone ReplicaSet';
  }

  return `${item.ownerKind} / ${item.ownerName}`;
}

export function isStandaloneReplicaSet(item: ReplicaSetItem) {
  return !item.ownerKind && !item.ownerName;
}
