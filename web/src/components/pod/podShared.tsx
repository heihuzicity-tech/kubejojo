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
    name: 'nginx-demo-6f9c95f95f-gzctk',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node2',
    podIP: '10.244.1.81',
    qosClass: 'BestEffort',
    age: '2d',
    createdAt: '2026-04-09 10:20:03',
    metricsAvailable: true,
    cpuUsage: '0m',
    memoryUsage: '2.8 MiB',
    ownerKind: 'ReplicaSet',
    ownerName: 'nginx-demo-6f9c95f95f',
    labels: ['app=nginx-demo', 'pod-template-hash=6f9c95f95f'],
    containers: [
      {
        name: 'nginx',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'nginx:1.27-alpine',
        cpuUsage: '0m',
        memoryUsage: '2.8 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'nginx-demo-6f9c95f95f-pm4qf',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node1',
    podIP: '10.244.0.182',
    qosClass: 'BestEffort',
    age: '2d',
    createdAt: '2026-04-09 10:20:05',
    metricsAvailable: true,
    cpuUsage: '0m',
    memoryUsage: '2.8 MiB',
    ownerKind: 'ReplicaSet',
    ownerName: 'nginx-demo-6f9c95f95f',
    labels: ['app=nginx-demo', 'pod-template-hash=6f9c95f95f'],
    containers: [
      {
        name: 'nginx',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'nginx:1.27-alpine',
        cpuUsage: '0m',
        memoryUsage: '2.8 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'api-crash-7d9f6c8d4b-kx2mp',
    namespace: 'default',
    status: 'CrashLoopBackOff',
    phase: 'Running',
    readyContainers: 0,
    totalContainers: 1,
    restartCount: 7,
    nodeName: 'k8s-node1',
    podIP: '10.244.0.145',
    qosClass: 'Burstable',
    age: '38m',
    createdAt: '2026-04-13 09:42:10',
    metricsAvailable: false,
    ownerKind: 'ReplicaSet',
    ownerName: 'api-crash-7d9f6c8d4b',
    labels: ['app=api-crash', 'pod-template-hash=7d9f6c8d4b'],
    containers: [
      {
        name: 'api',
        ready: false,
        restartCount: 7,
        state: 'CrashLoopBackOff',
        image: 'ghcr.io/example/api:1.4.2',
        stateReason: 'CrashLoopBackOff',
        stateMessage: 'back-off 5m0s restarting failed container api',
        startedAt: '2026-04-13 10:19:41',
        finishedAt: '2026-04-13 10:19:44',
        exitCode: 1,
        lastState: 'Terminated',
        lastStateReason: 'Error',
        lastStartedAt: '2026-04-13 10:16:02',
        lastFinishedAt: '2026-04-13 10:16:05',
        lastExitCode: 1,
      },
    ],
    conditions: [
      {
        type: 'Ready',
        status: 'False',
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [api]',
      },
      {
        type: 'ContainersReady',
        status: 'False',
        reason: 'ContainersNotReady',
        message: 'containers with unready status: [api]',
      },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'mysql-demo-0',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node1',
    podIP: '10.244.0.210',
    qosClass: 'Burstable',
    age: '6h',
    createdAt: '2026-04-13 09:10:04',
    metricsAvailable: true,
    cpuUsage: '3m',
    memoryUsage: '48.0 MiB',
    ownerKind: 'StatefulSet',
    ownerName: 'mysql-demo',
    labels: ['app=mysql-demo', 'apps.kubernetes.io/pod-index=0', 'statefulset.kubernetes.io/pod-name=mysql-demo-0'],
    containers: [
      {
        name: 'mysql',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'mysql:8.4',
        cpuUsage: '3m',
        memoryUsage: '48.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'mysql-demo-1',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node2',
    podIP: '10.244.1.211',
    qosClass: 'Burstable',
    age: '6h',
    createdAt: '2026-04-13 09:10:17',
    metricsAvailable: true,
    cpuUsage: '3m',
    memoryUsage: '48.0 MiB',
    ownerKind: 'StatefulSet',
    ownerName: 'mysql-demo',
    labels: ['app=mysql-demo', 'apps.kubernetes.io/pod-index=1', 'statefulset.kubernetes.io/pod-name=mysql-demo-1'],
    containers: [
      {
        name: 'mysql',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'mysql:8.4',
        cpuUsage: '3m',
        memoryUsage: '48.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'log-agent-demo-4j2k9',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node1',
    podIP: '10.244.0.220',
    qosClass: 'Burstable',
    age: '5h',
    createdAt: '2026-04-13 10:06:05',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '12.0 MiB',
    ownerKind: 'DaemonSet',
    ownerName: 'log-agent-demo',
    labels: ['app=log-agent-demo', 'controller-revision-hash=7d4d6c45ff'],
    containers: [
      {
        name: 'fluent-bit',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'cr.fluentbit.io/fluent/fluent-bit:3.0',
        cpuUsage: '1m',
        memoryUsage: '12.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'log-agent-demo-z8x7m',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node2',
    podIP: '10.244.1.221',
    qosClass: 'Burstable',
    age: '5h',
    createdAt: '2026-04-13 10:06:11',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '12.0 MiB',
    ownerKind: 'DaemonSet',
    ownerName: 'log-agent-demo',
    labels: ['app=log-agent-demo', 'controller-revision-hash=7d4d6c45ff'],
    containers: [
      {
        name: 'fluent-bit',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'cr.fluentbit.io/fluent/fluent-bit:3.0',
        cpuUsage: '1m',
        memoryUsage: '12.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'db-backfill-job-k6d9n',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node1',
    podIP: '10.244.0.230',
    qosClass: 'Burstable',
    age: '42m',
    createdAt: '2026-04-13 14:10:12',
    metricsAvailable: true,
    cpuUsage: '2m',
    memoryUsage: '18.0 MiB',
    ownerKind: 'Job',
    ownerName: 'db-backfill-job',
    labels: ['app=db-backfill-job', 'batch.kubernetes.io/job-name=db-backfill-job'],
    containers: [
      {
        name: 'worker',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'ghcr.io/example/backfill:2.1.0',
        cpuUsage: '2m',
        memoryUsage: '18.0 MiB',
      },
    ],
    conditions: [
      { type: 'Ready', status: 'True' },
      { type: 'ContainersReady', status: 'True' },
      { type: 'PodScheduled', status: 'True' },
    ],
  },
  {
    name: 'report-cleanup-29123456-tx2sl',
    namespace: 'default',
    status: 'Running',
    phase: 'Running',
    readyContainers: 1,
    totalContainers: 1,
    restartCount: 0,
    nodeName: 'k8s-node2',
    podIP: '10.244.1.231',
    qosClass: 'Burstable',
    age: '11m',
    createdAt: '2026-04-13 14:41:06',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '10.0 MiB',
    ownerKind: 'Job',
    ownerName: 'report-cleanup-29123456',
    labels: ['app=report-cleanup', 'batch.kubernetes.io/job-name=report-cleanup-29123456'],
    containers: [
      {
        name: 'worker',
        ready: true,
        restartCount: 0,
        state: 'Running',
        image: 'ghcr.io/example/report-cleanup:1.7.4',
        cpuUsage: '1m',
        memoryUsage: '10.0 MiB',
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
  'default/nginx-demo-6f9c95f95f-gzctk': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/nginx-demo-6f9c95f95f-gzctk to k8s-node2.',
      count: 1,
      lastSeen: '2026-04-09 10:20:04',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "nginx:1.27-alpine" already present on machine.',
      count: 1,
      lastSeen: '2026-04-09 10:20:07',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container nginx.',
      count: 1,
      lastSeen: '2026-04-09 10:20:10',
    },
  ],
  'default/nginx-demo-6f9c95f95f-pm4qf': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/nginx-demo-6f9c95f95f-pm4qf to k8s-node1.',
      count: 1,
      lastSeen: '2026-04-09 10:20:06',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "nginx:1.27-alpine" already present on machine.',
      count: 1,
      lastSeen: '2026-04-09 10:20:09',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container nginx.',
      count: 1,
      lastSeen: '2026-04-09 10:20:12',
    },
  ],
  'default/api-crash-7d9f6c8d4b-kx2mp': [
    {
      type: 'Warning',
      reason: 'BackOff',
      message: 'Back-off restarting failed container api in pod api-crash-7d9f6c8d4b-kx2mp_default.',
      count: 7,
      lastSeen: '2026-04-13 10:19:46',
    },
    {
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'Readiness probe failed: Get \"http://10.244.0.145:8080/ready\": connection refused',
      count: 5,
      lastSeen: '2026-04-13 10:18:58',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image \"ghcr.io/example/api:1.4.2\" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 09:42:22',
    },
  ],
  'default/mysql-demo-0': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/mysql-demo-0 to k8s-node1.',
      count: 1,
      lastSeen: '2026-04-13 09:10:05',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "mysql:8.4" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 09:10:11',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container mysql.',
      count: 1,
      lastSeen: '2026-04-13 09:10:14',
    },
  ],
  'default/mysql-demo-1': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/mysql-demo-1 to k8s-node2.',
      count: 1,
      lastSeen: '2026-04-13 09:10:18',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "mysql:8.4" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 09:10:25',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container mysql.',
      count: 1,
      lastSeen: '2026-04-13 09:10:28',
    },
  ],
  'default/log-agent-demo-4j2k9': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/log-agent-demo-4j2k9 to k8s-node1.',
      count: 1,
      lastSeen: '2026-04-13 10:06:06',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "cr.fluentbit.io/fluent/fluent-bit:3.0" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 10:06:09',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container fluent-bit.',
      count: 1,
      lastSeen: '2026-04-13 10:06:12',
    },
  ],
  'default/log-agent-demo-z8x7m': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/log-agent-demo-z8x7m to k8s-node2.',
      count: 1,
      lastSeen: '2026-04-13 10:06:12',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "cr.fluentbit.io/fluent/fluent-bit:3.0" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 10:06:15',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container fluent-bit.',
      count: 1,
      lastSeen: '2026-04-13 10:06:17',
    },
  ],
  'default/db-backfill-job-k6d9n': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/db-backfill-job-k6d9n to k8s-node1.',
      count: 1,
      lastSeen: '2026-04-13 14:10:13',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "ghcr.io/example/backfill:2.1.0" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 14:10:16',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container worker.',
      count: 1,
      lastSeen: '2026-04-13 14:10:18',
    },
  ],
  'default/report-cleanup-29123456-tx2sl': [
    {
      type: 'Normal',
      reason: 'Scheduled',
      message: 'Successfully assigned default/report-cleanup-29123456-tx2sl to k8s-node2.',
      count: 1,
      lastSeen: '2026-04-13 14:41:07',
    },
    {
      type: 'Normal',
      reason: 'Pulled',
      message: 'Container image "ghcr.io/example/report-cleanup:1.7.4" already present on machine.',
      count: 1,
      lastSeen: '2026-04-13 14:41:09',
    },
    {
      type: 'Normal',
      reason: 'Started',
      message: 'Started container worker.',
      count: 1,
      lastSeen: '2026-04-13 14:41:12',
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
  'default/nginx-demo-6f9c95f95f-gzctk/nginx': [
    '10.244.1.1 - - [09/Apr/2026:10:22:03 +0800] "GET / HTTP/1.1" 200 615 "-" "curl/8.7.1" "-"',
    '10.244.1.1 - - [09/Apr/2026:10:22:10 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.35" "-"',
  ].join('\n'),
  'default/nginx-demo-6f9c95f95f-pm4qf/nginx': [
    '10.244.0.1 - - [09/Apr/2026:10:22:33 +0800] "GET / HTTP/1.1" 200 615 "-" "curl/8.7.1" "-"',
    '10.244.0.1 - - [09/Apr/2026:10:22:40 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.35" "-"',
  ].join('\n'),
  'default/api-crash-7d9f6c8d4b-kx2mp/api': [
    '2026-04-13T10:19:43.121Z ERROR bootstrap failed to connect to postgres: dial tcp 10.0.0.25:5432: connect: connection refused',
    '2026-04-13T10:19:43.122Z FATAL api startup aborted after dependency check failure',
    'panic: startup dependency validation failed',
    '',
    'goroutine 1 [running]:',
    'main.main()',
    '\t/app/cmd/api/main.go:44 +0x2b7',
  ].join('\n'),
  'default/mysql-demo-0/mysql': [
    '2026-04-13T09:15:04.008Z [Note] [Entrypoint]: Entrypoint script for MySQL Server 8.4 started.',
    '2026-04-13T09:15:08.114Z [System] [MY-010116] [Server] /usr/sbin/mysqld: ready for connections.',
  ].join('\n'),
  'default/mysql-demo-1/mysql': [
    '2026-04-13T09:15:17.228Z [Note] [Entrypoint]: Entrypoint script for MySQL Server 8.4 started.',
    '2026-04-13T09:15:20.337Z [System] [MY-010116] [Server] /usr/sbin/mysqld: ready for connections.',
  ].join('\n'),
  'default/log-agent-demo-4j2k9/fluent-bit': [
    '[2026/04/13 10:06:13] [ info] [engine] started (pid=1)',
    '[2026/04/13 10:06:14] [ info] [input:tail:tail.0] inotify_fs_add(): inode=12884902522 watch_fd=1 name=/var/log/containers/*.log',
  ].join('\n'),
  'default/log-agent-demo-z8x7m/fluent-bit': [
    '[2026/04/13 10:06:18] [ info] [engine] started (pid=1)',
    '[2026/04/13 10:06:19] [ info] [input:tail:tail.0] inotify_fs_add(): inode=12884902526 watch_fd=1 name=/var/log/containers/*.log',
  ].join('\n'),
  'default/db-backfill-job-k6d9n/worker': [
    '2026-04-13T14:10:22.118Z INFO backfill started for tenant=acme range=2026-01',
    '2026-04-13T14:10:26.441Z INFO processed rows=128000 checkpoint=chunk-04',
  ].join('\n'),
  'default/report-cleanup-29123456-tx2sl/worker': [
    '2026-04-13T14:41:15.014Z INFO cleanup job started retention=30d',
    '2026-04-13T14:41:21.903Z INFO deleted reports=428 dryRun=false',
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
  'default/nginx-demo-6f9c95f95f-gzctk': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: nginx-demo-6f9c95f95f-gzctk',
    '  namespace: default',
    '  labels:',
    '    app: nginx-demo',
    '    pod-template-hash: 6f9c95f95f',
    'spec:',
    '  containers:',
    '    - name: nginx',
    '      image: nginx:1.27-alpine',
    '  restartPolicy: Always',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/nginx-demo-6f9c95f95f-pm4qf': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: nginx-demo-6f9c95f95f-pm4qf',
    '  namespace: default',
    '  labels:',
    '    app: nginx-demo',
    '    pod-template-hash: 6f9c95f95f',
    'spec:',
    '  containers:',
    '    - name: nginx',
    '      image: nginx:1.27-alpine',
    '  restartPolicy: Always',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/api-crash-7d9f6c8d4b-kx2mp': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: api-crash-7d9f6c8d4b-kx2mp',
    '  namespace: default',
    '  labels:',
    '    app: api-crash',
    'spec:',
    '  containers:',
    '    - name: api',
    '      image: ghcr.io/example/api:1.4.2',
    '      env:',
    '        - name: DATABASE_URL',
    '          value: postgres://postgres.default.svc:5432/app',
    '      readinessProbe:',
    '        httpGet:',
    '          path: /ready',
    '          port: 8080',
    '  restartPolicy: Always',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/mysql-demo-0': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: mysql-demo-0',
    '  namespace: default',
    '  labels:',
    '    app: mysql-demo',
    'spec:',
    '  containers:',
    '    - name: mysql',
    '      image: mysql:8.4',
    '  hostname: mysql-demo-0',
    '  subdomain: mysql-demo-headless',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/mysql-demo-1': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: mysql-demo-1',
    '  namespace: default',
    '  labels:',
    '    app: mysql-demo',
    'spec:',
    '  containers:',
    '    - name: mysql',
    '      image: mysql:8.4',
    '  hostname: mysql-demo-1',
    '  subdomain: mysql-demo-headless',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/log-agent-demo-4j2k9': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: log-agent-demo-4j2k9',
    '  namespace: default',
    '  labels:',
    '    app: log-agent-demo',
    'spec:',
    '  containers:',
    '    - name: fluent-bit',
    '      image: cr.fluentbit.io/fluent/fluent-bit:3.0',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/log-agent-demo-z8x7m': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: log-agent-demo-z8x7m',
    '  namespace: default',
    '  labels:',
    '    app: log-agent-demo',
    'spec:',
    '  containers:',
    '    - name: fluent-bit',
    '      image: cr.fluentbit.io/fluent/fluent-bit:3.0',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/db-backfill-job-k6d9n': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: db-backfill-job-k6d9n',
    '  namespace: default',
    '  labels:',
    '    app: db-backfill-job',
    'spec:',
    '  containers:',
    '    - name: worker',
    '      image: ghcr.io/example/backfill:2.1.0',
    '  restartPolicy: Never',
    'status:',
    '  phase: Running',
  ].join('\n'),
  'default/report-cleanup-29123456-tx2sl': [
    'apiVersion: v1',
    'kind: Pod',
    'metadata:',
    '  name: report-cleanup-29123456-tx2sl',
    '  namespace: default',
    '  labels:',
    '    app: report-cleanup',
    'spec:',
    '  containers:',
    '    - name: worker',
    '      image: ghcr.io/example/report-cleanup:1.7.4',
    '  restartPolicy: Never',
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
  'default/nginx-demo-6f9c95f95f-gzctk': [
    'Name:         nginx-demo-6f9c95f95f-gzctk',
    'Namespace:    default',
    'Node:         k8s-node2/10.0.0.103',
    'Status:       Running',
    'IP:           10.244.1.81',
    'Controlled By: ReplicaSet/nginx-demo-6f9c95f95f',
    'Containers:',
    '  nginx:',
    '    Image:      nginx:1.27-alpine',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    2d    kubelet            Started container nginx',
  ].join('\n'),
  'default/nginx-demo-6f9c95f95f-pm4qf': [
    'Name:         nginx-demo-6f9c95f95f-pm4qf',
    'Namespace:    default',
    'Node:         k8s-node1/10.0.0.102',
    'Status:       Running',
    'IP:           10.244.0.182',
    'Controlled By: ReplicaSet/nginx-demo-6f9c95f95f',
    'Containers:',
    '  nginx:',
    '    Image:      nginx:1.27-alpine',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    2d    kubelet            Started container nginx',
  ].join('\n'),
  'default/api-crash-7d9f6c8d4b-kx2mp': [
    'Name:         api-crash-7d9f6c8d4b-kx2mp',
    'Namespace:    default',
    'Node:         k8s-node1/10.0.0.102',
    'Status:       Running',
    'IP:           10.244.0.145',
    'Controlled By: ReplicaSet/api-crash-7d9f6c8d4b',
    'Containers:',
    '  api:',
    '    Image:      ghcr.io/example/api:1.4.2',
    '    State:      Waiting',
    '      Reason:   CrashLoopBackOff',
    '    Last State: Terminated',
    '      Reason:   Error',
    '      Exit Code: 1',
    '    Ready:      False',
    'Events:',
    '  Type     Reason      Age   From               Message',
    '  Warning  BackOff     2m    kubelet            Back-off restarting failed container api',
    '  Warning  Unhealthy   3m    kubelet            Readiness probe failed: connection refused',
  ].join('\n'),
  'default/mysql-demo-0': [
    'Name:         mysql-demo-0',
    'Namespace:    default',
    'Node:         k8s-node1/10.0.0.102',
    'Status:       Running',
    'IP:           10.244.0.210',
    'Controlled By: StatefulSet/mysql-demo',
    'Containers:',
    '  mysql:',
    '    Image:      mysql:8.4',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    6h    kubelet            Started container mysql',
  ].join('\n'),
  'default/mysql-demo-1': [
    'Name:         mysql-demo-1',
    'Namespace:    default',
    'Node:         k8s-node2/10.0.0.103',
    'Status:       Running',
    'IP:           10.244.1.211',
    'Controlled By: StatefulSet/mysql-demo',
    'Containers:',
    '  mysql:',
    '    Image:      mysql:8.4',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    6h    kubelet            Started container mysql',
  ].join('\n'),
  'default/log-agent-demo-4j2k9': [
    'Name:         log-agent-demo-4j2k9',
    'Namespace:    default',
    'Node:         k8s-node1/10.0.0.102',
    'Status:       Running',
    'IP:           10.244.0.220',
    'Controlled By: DaemonSet/log-agent-demo',
    'Containers:',
    '  fluent-bit:',
    '    Image:      cr.fluentbit.io/fluent/fluent-bit:3.0',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    5h    kubelet            Started container fluent-bit',
  ].join('\n'),
  'default/log-agent-demo-z8x7m': [
    'Name:         log-agent-demo-z8x7m',
    'Namespace:    default',
    'Node:         k8s-node2/10.0.0.103',
    'Status:       Running',
    'IP:           10.244.1.221',
    'Controlled By: DaemonSet/log-agent-demo',
    'Containers:',
    '  fluent-bit:',
    '    Image:      cr.fluentbit.io/fluent/fluent-bit:3.0',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    5h    kubelet            Started container fluent-bit',
  ].join('\n'),
  'default/db-backfill-job-k6d9n': [
    'Name:         db-backfill-job-k6d9n',
    'Namespace:    default',
    'Node:         k8s-node1/10.0.0.102',
    'Status:       Running',
    'IP:           10.244.0.230',
    'Controlled By: Job/db-backfill-job',
    'Containers:',
    '  worker:',
    '    Image:      ghcr.io/example/backfill:2.1.0',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    42m   kubelet            Started container worker',
  ].join('\n'),
  'default/report-cleanup-29123456-tx2sl': [
    'Name:         report-cleanup-29123456-tx2sl',
    'Namespace:    default',
    'Node:         k8s-node2/10.0.0.103',
    'Status:       Running',
    'IP:           10.244.1.231',
    'Controlled By: Job/report-cleanup-29123456',
    'Containers:',
    '  worker:',
    '    Image:      ghcr.io/example/report-cleanup:1.7.4',
    '    State:      Running',
    '    Ready:      True',
    'Events:',
    '  Type    Reason     Age   From               Message',
    '  Normal  Started    11m   kubelet            Started container worker',
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
