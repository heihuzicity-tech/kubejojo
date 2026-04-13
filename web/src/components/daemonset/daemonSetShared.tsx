import { Tag, Typography } from 'antd';

import type { DaemonSetConditionItem, DaemonSetItem } from '../../services/cluster';

export const demoDaemonSets: DaemonSetItem[] = [
  {
    name: 'log-agent-demo',
    namespace: 'default',
    status: 'Healthy',
    updateStrategy: 'RollingUpdate',
    desiredNumberScheduled: 2,
    currentNumberScheduled: 2,
    updatedNumberScheduled: 2,
    numberReady: 2,
    numberAvailable: 2,
    numberUnavailable: 0,
    numberMisscheduled: 0,
    podCount: 2,
    restartCount: 0,
    age: '5h',
    createdAt: '2026-04-13 10:06:00',
    metricsAvailable: true,
    cpuUsage: '2m',
    memoryUsage: '24.0 MiB',
    selector: ['app=log-agent-demo'],
    labels: ['app=log-agent-demo', 'tier=observability'],
    images: ['fluent-bit=cr.fluentbit.io/fluent/fluent-bit:3.0'],
    conditions: [
      { type: 'Available', status: 'True', reason: 'AllPodsAvailable' },
      { type: 'Progressing', status: 'True', reason: 'RollingUpdateComplete' },
    ],
    pods: [
      {
        name: 'log-agent-demo-4j2k9',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '1m',
        memoryUsage: '12.0 MiB',
      },
      {
        name: 'log-agent-demo-z8x7m',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node2',
        metricsAvailable: true,
        cpuUsage: '1m',
        memoryUsage: '12.0 MiB',
      },
    ],
  },
];

export const demoDaemonSetYaml: Record<string, string> = {
  'default/log-agent-demo': [
    'apiVersion: apps/v1',
    'kind: DaemonSet',
    'metadata:',
    '  name: log-agent-demo',
    '  namespace: default',
    '  labels:',
    '    app: log-agent-demo',
    'spec:',
    '  selector:',
    '    matchLabels:',
    '      app: log-agent-demo',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: log-agent-demo',
    '    spec:',
    '      containers:',
    '        - name: fluent-bit',
    '          image: cr.fluentbit.io/fluent/fluent-bit:3.0',
    'status:',
    '  numberReady: 2',
    '  numberAvailable: 2',
  ].join('\n'),
};

export function displayDaemonSetNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildDaemonSetRoute(namespace: string, name: string) {
  return `/workloads/daemonsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function daemonSetStatusColor(status: string) {
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

export function daemonSetRestartTone(count: number) {
  if (count > 3) {
    return 'red';
  }

  if (count > 0) {
    return 'orange';
  }

  return 'default';
}

export function daemonSetPodStatusColor(status: string) {
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

export function daemonSetConditionTagColor(condition: DaemonSetConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'Available' ? 'green' : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'Available' ? 'red' : 'default';
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
