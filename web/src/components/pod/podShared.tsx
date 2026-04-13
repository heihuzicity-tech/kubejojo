import { Alert, Tag, Typography } from 'antd';

import type {
  PodConditionItem,
  PodEventItem,
  PodItem,
  ResourceTextResult,
} from '../../services/cluster';

export const demoPods: PodItem[] = [
  {
    name: 'nginx-demo-6f9c95f95f-c6jth',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node2',
    podIP: '10.244.1.80',
    qosClass: 'BestEffort',
    age: '2d',
    createdAt: '2026-04-09 10:20:00',
    metricsAvailable: true,
    cpuUsage: '0m',
    memoryUsage: '2.0 MiB',
    ownerKind: 'ReplicaSet',
    ownerName: 'nginx-demo-6f9c95f95f',
    labels: ['app=nginx-demo', 'pod-template-hash=6f9c95f95f'],
    containers: [
      {
        name: 'nginx',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'nginx:stable',
        cpuUsage: '0m',
        memoryUsage: '2.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'metrics-server-5cdb79b4f9-d7wdm',
    namespace: 'kube-system',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node1',
    podIP: '10.244.0.81',
    qosClass: 'Burstable',
    age: '14h',
    createdAt: '2026-04-11 08:10:00',
    metricsAvailable: true,
    cpuUsage: '4m',
    memoryUsage: '20.0 MiB',
    ownerKind: 'ReplicaSet',
    ownerName: 'metrics-server-5cdb79b4f9',
    labels: ['k8s-app=metrics-server'],
    containers: [
      {
        name: 'metrics-server',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'registry.k8s.io/metrics-server/metrics-server:v0.7.2',
        cpuUsage: '4m',
        memoryUsage: '20.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
];

export const demoPodEvents: Record<string, PodEventItem[]> = {
  'default/nginx-demo-6f9c95f95f-c6jth': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/nginx-demo-6f9c95f95f-c6jth to k8s-node2.',
      count: 1,
      lastSeen: '2026-04-09 10:20:02',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "nginx:stable" already present on machine.',
      count: 1,
      lastSeen: '2026-04-09 10:20:06',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container nginx.',
      count: 1,
      lastSeen: '2026-04-09 10:20:08',
    },
  ],
  'kube-system/metrics-server-5cdb79b4f9-d7wdm': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned kube-system/metrics-server-5cdb79b4f9-d7wdm to k8s-node1.',
      count: 1,
      lastSeen: '2026-04-11 08:10:02',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message:
        'Container image "registry.k8s.io/metrics-server/metrics-server:v0.7.2" already present on machine.',
      count: 1,
      lastSeen: '2026-04-11 08:10:05',
    },
  ],
};

export const demoPodLogs: Record<string, string> = {
  'default/nginx-demo-6f9c95f95f-c6jth/nginx': [
    '10.244.1.1 - - [09/Apr/2026:10:21:03 +0800] "GET / HTTP/1.1" 200 615 "-" "curl/8.7.1" "-"',
    '10.244.1.1 - - [09/Apr/2026:10:21:09 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.35" "-"',
  ].join('\n'),
  'kube-system/metrics-server-5cdb79b4f9-d7wdm/metrics-server': [
    'I0411 08:10:09.178123       1 serving.go:389] Generated self-signed cert (/tmp/apiserver.crt, /tmp/apiserver.key)',
    'I0411 08:10:10.892441       1 secure_serving.go:213] Serving securely on [::]:10250',
  ].join('\n'),
};

export const demoPodYaml: Record<string, string> = {
  'default/nginx-demo-6f9c95f95f-c6jth': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: nginx-demo-6f9c95f95f-c6jth',
    '  namespace: default',
    '  labels:',
    '    app: nginx-demo',
    'spec:',
    '  containers:',
    '    - name: nginx',
    '      image: nginx:stable',
    '  restartPolicy: Always',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'kube-system/metrics-server-5cdb79b4f9-d7wdm': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: metrics-server-5cdb79b4f9-d7wdm',
    '  namespace: kube-system',
    '  labels:',
    '    k8s-app: metrics-server',
    'spec:',
    '  containers:',
    '    - name: metrics-server',
    '      image: registry.k8s.io/metrics-server/metrics-server:v0.7.2',
    'status:',
    '  phase: Running',
  ].join('\n'),
};

export const demoPodDescribe: Record<string, string> = {
  'default/nginx-demo-6f9c95f95f-c6jth': [
    'Name:         nginx-demo-6f9c95f95f-c6jth',
    'Namespace:    default',
    'Node:         k8s-node2/10.0.0.103',
    'Status:       Running',
    'IP:           10.244.1.80',
    'Controlled By: ReplicaSet/nginx-demo-6f9c95f95f',
    'Containers:',
    '  nginx:',
    '    Image:      nginx:stable',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    2d    kubelet            Started container nginx',
  ].join('\n'),
  'kube-system/metrics-server-5cdb79b4f9-d7wdm': [
    'Name:         metrics-server-5cdb79b4f9-d7wdm',
    'Namespace:    kube-system',
    'Node:         k8s-node1/10.0.0.102',
    'Status:       Running',
    'IP:           10.244.0.81',
    'Controlled By: ReplicaSet/metrics-server-5cdb79b4f9',
    'Containers:',
    '  metrics-server:',
    '    Image:      registry.k8s.io/metrics-server/metrics-server:v0.7.2',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    14h   kubelet            Started container metrics-server',
  ].join('\n'),
};

export function displayNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildPodRoute(namespace: string, name: string) {
  return `/workloads/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function isPodReady(pod: PodItem) {
  return (
    pod.status === 'Running' &&
    pod.totalContainers > 0 &&
    pod.readyContainers === pod.totalContainers
  );
}

export function statusColor(status: string) {
  switch (status) {
    case 'Running':
      return 'green';
    case 'Succeeded':
    case 'Completed':
      return 'blue';
    case 'Pending':
    case 'ContainerCreating':
    case 'Terminating':
      return 'orange';
    case 'Failed':
    case 'Unknown':
    case 'CrashLoopBackOff':
    case 'ImagePullBackOff':
    case 'ErrImagePull':
    case 'CreateContainerConfigError':
    case 'RunContainerError':
      return 'red';
    default:
      return 'default';
  }
}

export function eventTypeColor(type: string) {
  return type === 'Warning' ? 'red' : 'blue';
}

export function conditionTagColor(condition: PodConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'Ready' || condition.type === 'ContainersReady'
      ? 'green'
      : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'Ready' || condition.type === 'ContainersReady'
      ? 'red'
      : 'default';
  }

  return 'default';
}

export function containerStateColor(state: string) {
  switch (state) {
    case 'Running':
      return 'green';
    case 'Waiting':
    case 'ContainerCreating':
      return 'orange';
    case 'Terminated':
    case 'CrashLoopBackOff':
    case 'ImagePullBackOff':
    case 'ErrImagePull':
    case 'CreateContainerConfigError':
    case 'RunContainerError':
      return 'red';
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

export function hasContainerDiagnostics(container: PodItem['containers'][number]) {
  return Boolean(
    container.stateReason ||
      container.stateMessage ||
      container.startedAt ||
      container.finishedAt ||
      container.exitCode != null ||
      container.lastState ||
      container.lastStateReason ||
      container.lastStartedAt ||
      container.lastFinishedAt ||
      container.lastExitCode != null,
  );
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

export function ownerSummary(item: PodItem) {
  if (!item.ownerKind || !item.ownerName) {
    return '-';
  }

  return `${item.ownerKind} / ${item.ownerName}`;
}

export function PodTextViewer({
  error,
  result,
  errorMessage,
  emptyMessage,
}: {
  error: unknown;
  result?: ResourceTextResult;
  errorMessage: string;
  emptyMessage: string;
}) {
  return (
    <section className="space-y-4">
      {error ? <Alert type="warning" showIcon message={errorMessage} /> : null}

      <div className="rounded-[16px] border border-slate-200 bg-slate-950 px-4 py-3 text-slate-100">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>Generated: {result?.generatedAt || '-'}</span>
        </div>
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-100">
          {result?.content || emptyMessage}
        </pre>
      </div>
    </section>
  );
}
