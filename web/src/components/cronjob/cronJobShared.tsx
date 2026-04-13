import { Tag, Typography } from 'antd';

import type { CronJobItem } from '../../services/cluster';

export const demoCronJobs: CronJobItem[] = [
  {
    name: 'report-cleanup',
    namespace: 'default',
    status: 'Healthy',
    schedule: '*/15 * * * *',
    timeZone: 'Asia/Shanghai',
    suspend: false,
    concurrencyPolicy: 'Forbid',
    activeJobs: 1,
    jobCount: 1,
    podCount: 1,
    restartCount: 0,
    successfulJobsHistory: 3,
    failedJobsHistory: 1,
    age: '2d',
    createdAt: '2026-04-11 23:31:00',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '10.0 MiB',
    lastScheduleTime: '2026-04-13 14:41:00',
    lastSuccessfulTime: '2026-04-13 14:26:00',
    labels: ['app=report-cleanup', 'tier=batch'],
    images: ['worker=ghcr.io/example/report-cleanup:1.7.4'],
    jobs: [
      {
        name: 'report-cleanup-29123456',
        status: 'Running',
        active: 1,
        succeeded: 0,
        failed: 0,
        startTime: '2026-04-13 14:41:06',
        metricsAvailable: true,
        cpuUsage: '1m',
        memoryUsage: '10.0 MiB',
      },
    ],
  },
];

export const demoCronJobYaml: Record<string, string> = {
  'default/report-cleanup': [
    'apiVersion: batch/v1',
    'kind: CronJob',
    'metadata:',
    '  name: report-cleanup',
    '  namespace: default',
    'spec:',
    '  schedule: "*/15 * * * *"',
    '  concurrencyPolicy: Forbid',
    '  suspend: false',
    '  jobTemplate:',
    '    spec:',
    '      template:',
    '        spec:',
    '          restartPolicy: Never',
    '          containers:',
    '            - name: worker',
    '              image: ghcr.io/example/report-cleanup:1.7.4',
    'status:',
    '  active:',
    '    - name: report-cleanup-29123456',
  ].join('\n'),
};

export function displayCronJobNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

export function buildCronJobRoute(namespace: string, name: string) {
  return `/workloads/cronjobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function cronJobStatusColor(status: string) {
  switch (status) {
    case 'Healthy':
      return 'green';
    case 'Running':
      return 'blue';
    case 'Failed':
      return 'red';
    case 'Scheduled':
      return 'gold';
    case 'Suspended':
      return 'default';
    default:
      return 'default';
  }
}

export function cronChildJobStatusColor(status: string) {
  switch (status) {
    case 'Completed':
      return 'green';
    case 'Running':
      return 'blue';
    case 'Failed':
      return 'red';
    case 'Retrying':
      return 'orange';
    case 'Pending':
      return 'gold';
    default:
      return 'default';
  }
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

export function nextCronJobSuspendAction(item: CronJobItem) {
  return item.suspend ? 'Resume' : 'Suspend';
}
