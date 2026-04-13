import { Tag, Typography } from 'antd';

import type { JobConditionItem, JobItem } from '../../services/cluster';

export const demoJobs: JobItem[] = [
  {
    name: 'db-backfill-job',
    namespace: 'default',
    status: 'Running',
    parallelism: 1,
    desiredCompletions: 1,
    active: 1,
    succeeded: 0,
    failed: 0,
    completionMode: 'NonIndexed',
    podCount: 1,
    restartCount: 0,
    age: '42m',
    createdAt: '2026-04-13 14:10:00',
    metricsAvailable: true,
    cpuUsage: '2m',
    memoryUsage: '18.0 MiB',
    startTime: '2026-04-13 14:10:12',
    ownerKind: '',
    ownerName: '',
    labels: ['app=db-backfill-job', 'tier=batch'],
    images: ['worker=ghcr.io/example/backfill:2.1.0'],
    conditions: [{ type: 'Complete', status: 'False' }],
    pods: [
      {
        name: 'db-backfill-job-k6d9n',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '2m',
        memoryUsage: '18.0 MiB',
      },
    ],
  },
  {
    name: 'report-cleanup-29123456',
    namespace: 'default',
    status: 'Running',
    parallelism: 1,
    desiredCompletions: 1,
    active: 1,
    succeeded: 0,
    failed: 0,
    completionMode: 'NonIndexed',
    podCount: 1,
    restartCount: 0,
    age: '11m',
    createdAt: '2026-04-13 14:41:00',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '10.0 MiB',
    startTime: '2026-04-13 14:41:06',
    ownerKind: 'CronJob',
    ownerName: 'report-cleanup',
    labels: ['app=report-cleanup', 'cronjob.kubernetes.io/name=report-cleanup'],
    images: ['worker=ghcr.io/example/report-cleanup:1.7.4'],
    conditions: [{ type: 'Complete', status: 'False' }],
    pods: [
      {
        name: 'report-cleanup-29123456-tx2sl',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node2',
        metricsAvailable: true,
        cpuUsage: '1m',
        memoryUsage: '10.0 MiB',
      },
    ],
  },
];

export const demoJobYaml: Record<string, string> = {
  'default/db-backfill-job': [
    'apiVersion: batch/v1',
    'kind: Job',
    'metadata:',
    '  name: db-backfill-job',
    '  namespace: default',
    'spec:',
    '  completions: 1',
    '  parallelism: 1',
    '  template:',
    '    spec:',
    '      restartPolicy: Never',
    '      containers:',
    '        - name: worker',
    '          image: ghcr.io/example/backfill:2.1.0',
    'status:',
    '  active: 1',
  ].join('\n'),
  'default/report-cleanup-29123456': [
    'apiVersion: batch/v1',
    'kind: Job',
    'metadata:',
    '  name: report-cleanup-29123456',
    '  namespace: default',
    'spec:',
    '  completions: 1',
    '  parallelism: 1',
    '  template:',
    '    spec:',
    '      restartPolicy: Never',
    '      containers:',
    '        - name: worker',
    '          image: ghcr.io/example/report-cleanup:1.7.4',
    'status:',
    '  active: 1',
  ].join('\n'),
};

export function displayJobNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildJobRoute(namespace: string, name: string) {
  return `/workloads/jobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function jobStatusColor(status: string) {
  switch (status) {
    case 'Completed':
      return 'green';
    case 'Running':
      return 'blue';
    case 'Failed':
      return 'red';
    case 'Retrying':
      return 'orange';
    case 'Suspended':
      return 'default';
    case 'Pending':
      return 'gold';
    default:
      return 'default';
  }
}

export function jobRestartTone(count: number) {
  if (count > 3) {
    return 'red';
  }

  if (count > 0) {
    return 'orange';
  }

  return 'default';
}

export function jobPodStatusColor(status: string) {
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

export function jobConditionTagColor(condition: JobConditionItem) {
  if (condition.type === 'Failed' && condition.status === 'True') {
    return 'red';
  }

  if (condition.type === 'Complete' && condition.status === 'True') {
    return 'green';
  }

  if (condition.status === 'True') {
    return 'blue';
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

export function jobOwnerSummary(item: JobItem) {
  if (!item.ownerKind || !item.ownerName) {
    return 'Standalone Job';
  }

  return `${item.ownerKind} / ${item.ownerName}`;
}

export function jobCompletionSummary(item: JobItem) {
  return `${item.succeeded}/${item.desiredCompletions}`;
}

export function canToggleJobSuspend(item: JobItem) {
  return item.status !== 'Completed' && item.status !== 'Failed';
}

export function nextJobSuspendAction(item: JobItem) {
  return item.status === 'Suspended' ? 'Resume' : 'Suspend';
}
