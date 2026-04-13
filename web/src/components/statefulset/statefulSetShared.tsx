import { Tag, Typography } from 'antd';

import type { StatefulSetConditionItem, StatefulSetItem } from '../../services/cluster';

export const demoStatefulSets: StatefulSetItem[] = [
  {
    name: 'mysql-demo',
    namespace: 'default',
    status: 'Healthy',
    serviceName: 'mysql-demo-headless',
    podManagementPolicy: 'OrderedReady',
    updateStrategy: 'RollingUpdate',
    desiredReplicas: 2,
    readyReplicas: 2,
    currentReplicas: 2,
    updatedReplicas: 2,
    availableReplicas: 2,
    podCount: 2,
    restartCount: 0,
    age: '6h',
    createdAt: '2026-04-13 09:10:00',
    metricsAvailable: true,
    cpuUsage: '6m',
    memoryUsage: '96.0 MiB',
    currentRevision: 'mysql-demo-7d4d6c45ff',
    updateRevision: 'mysql-demo-7d4d6c45ff',
    selector: ['app=mysql-demo'],
    labels: ['app=mysql-demo', 'tier=database'],
    images: ['mysql=mysql:8.4'],
    conditions: [
      { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' },
      { type: 'Ready', status: 'True', reason: 'AllPodsReady' },
    ],
    pods: [
      {
        name: 'mysql-demo-0',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '3m',
        memoryUsage: '48.0 MiB',
      },
      {
        name: 'mysql-demo-1',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node2',
        metricsAvailable: true,
        cpuUsage: '3m',
        memoryUsage: '48.0 MiB',
      },
    ],
  },
];

export const demoStatefulSetYaml: Record<string, string> = {
  'default/mysql-demo': [
    'apiVersion: apps/v1',
    'kind: StatefulSet',
    'metadata:',
    '  name: mysql-demo',
    '  namespace: default',
    '  labels:',
    '    app: mysql-demo',
    'spec:',
    '  serviceName: mysql-demo-headless',
    '  replicas: 2',
    '  selector:',
    '    matchLabels:',
    '      app: mysql-demo',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: mysql-demo',
    '    spec:',
    '      containers:',
    '        - name: mysql',
    '          image: mysql:8.4',
    'status:',
    '  readyReplicas: 2',
    '  currentReplicas: 2',
  ].join('\n'),
};

export function displayStatefulSetNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildStatefulSetRoute(namespace: string, name: string) {
  return `/workloads/statefulsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function statefulSetStatusColor(status: string) {
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

export function statefulSetRestartTone(count: number) {
  if (count > 3) {
    return 'red';
  }

  if (count > 0) {
    return 'orange';
  }

  return 'default';
}

export function statefulSetPodStatusColor(status: string) {
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

export function statefulSetConditionTagColor(condition: StatefulSetConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'Ready' || condition.type === 'Available' ? 'green' : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'Ready' || condition.type === 'Available' ? 'red' : 'default';
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
