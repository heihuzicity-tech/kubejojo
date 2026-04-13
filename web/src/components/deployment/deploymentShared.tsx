import { Tag, Typography } from 'antd';

import type { DeploymentConditionItem, DeploymentItem } from '../../services/cluster';

export const demoDeployments: DeploymentItem[] = [
  {
    name: 'nginx-demo',
    namespace: 'default',
    status: 'Healthy',
    desiredReplicas: 3,
    updatedReplicas: 3,
    readyReplicas: 3,
    availableReplicas: 3,
    unavailableReplicas: 0,
    podCount: 3,
    restartCount: 0,
    strategy: 'RollingUpdate',
    age: '2d',
    createdAt: '2026-04-09 10:10:00',
    metricsAvailable: true,
    cpuUsage: '0m',
    memoryUsage: '8.4 MiB',
    selector: ['app=nginx-demo'],
    labels: ['app=nginx-demo'],
    images: ['nginx=nginx:1.27-alpine'],
    conditions: [
      { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' },
      { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable' },
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
  {
    name: 'metrics-server',
    namespace: 'kube-system',
    status: 'Healthy',
    desiredReplicas: 1,
    updatedReplicas: 1,
    readyReplicas: 1,
    availableReplicas: 1,
    unavailableReplicas: 0,
    podCount: 1,
    restartCount: 0,
    strategy: 'RollingUpdate',
    age: '2d',
    createdAt: '2026-04-09 08:10:00',
    metricsAvailable: true,
    cpuUsage: '4m',
    memoryUsage: '20.0 MiB',
    selector: ['k8s-app=metrics-server'],
    labels: ['k8s-app=metrics-server'],
    images: ['metrics-server=registry.k8s.io/metrics-server/metrics-server:v0.8.1'],
    conditions: [
      { type: 'Available', status: 'True', reason: 'MinimumReplicasAvailable' },
      { type: 'Progressing', status: 'True', reason: 'NewReplicaSetAvailable' },
    ],
    pods: [
      {
        name: 'metrics-server-5cdb79b4f9-d7wdm',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '4m',
        memoryUsage: '20.0 MiB',
      },
    ],
  },
];

export const demoDeploymentYaml: Record<string, string> = {
  'default/nginx-demo': [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: nginx-demo',
    '  namespace: default',
    '  labels:',
    '    app: nginx-demo',
    'spec:',
    '  replicas: 3',
    '  selector:',
    '    matchLabels:',
    '      app: nginx-demo',
    '  template:',
    '    metadata:',
    '      labels:',
    '        app: nginx-demo',
    '    spec:',
    '      containers:',
    '        - name: nginx',
    '          image: nginx:1.27-alpine',
    'status:',
    '  readyReplicas: 3',
    '  availableReplicas: 3',
  ].join('\n'),
  'kube-system/metrics-server': [
    'apiVersion: apps/v1',
    'kind: Deployment',
    'metadata:',
    '  name: metrics-server',
    '  namespace: kube-system',
    '  labels:',
    '    k8s-app: metrics-server',
    'spec:',
    '  replicas: 1',
    '  selector:',
    '    matchLabels:',
    '      k8s-app: metrics-server',
    '  template:',
    '    metadata:',
    '      labels:',
    '        k8s-app: metrics-server',
    '    spec:',
    '      containers:',
    '        - name: metrics-server',
    '          image: registry.k8s.io/metrics-server/metrics-server:v0.8.1',
    'status:',
    '  readyReplicas: 1',
    '  availableReplicas: 1',
  ].join('\n'),
};

export function displayDeploymentNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildDeploymentRoute(namespace: string, name: string) {
  return `/workloads/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function isDeploymentHealthy(item: DeploymentItem) {
  return item.status === 'Healthy' || item.status === 'ScaledDown';
}

export function deploymentStatusColor(status: string) {
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

export function restartTone(count: number) {
  if (count > 3) {
    return 'red';
  }

  if (count > 0) {
    return 'orange';
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

export function deploymentConditionTagColor(condition: DeploymentConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'Available' ? 'green' : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'Available' ? 'red' : 'default';
  }

  return 'default';
}

export function deploymentPodStatusColor(status: string) {
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
