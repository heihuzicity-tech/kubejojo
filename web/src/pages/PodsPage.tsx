import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Modal, Select, Space, Tabs, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { PodExecTerminalModal } from '../components/pod/PodExecTerminalModal';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type PodConditionItem,
  type PodContainerItem,
  type PodEventItem,
  type PodItem,
  type PodLogResult,
  type ResourceTextResult,
  deletePod,
  getPodDescribe,
  getPodEvents,
  getPodLogs,
  getPods,
  getPodYaml,
  updatePodYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoPods: PodItem[] = [
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

const demoPodEvents: Record<string, PodEventItem[]> = {
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
      message: 'Container image "registry.k8s.io/metrics-server/metrics-server:v0.7.2" already present on machine.',
      count: 1,
      lastSeen: '2026-04-11 08:10:05',
    },
  ],
};

const demoPodLogs: Record<string, string> = {
  'default/nginx-demo-6f9c95f95f-c6jth/nginx': [
    '10.244.1.1 - - [09/Apr/2026:10:21:03 +0800] "GET / HTTP/1.1" 200 615 "-" "curl/8.7.1" "-"',
    '10.244.1.1 - - [09/Apr/2026:10:21:09 +0800] "GET /healthz HTTP/1.1" 200 2 "-" "kube-probe/1.35" "-"',
  ].join('\n'),
  'kube-system/metrics-server-5cdb79b4f9-d7wdm/metrics-server': [
    'I0411 08:10:09.178123       1 serving.go:389] Generated self-signed cert (/tmp/apiserver.crt, /tmp/apiserver.key)',
    'I0411 08:10:10.892441       1 secure_serving.go:213] Serving securely on [::]:10250',
  ].join('\n'),
};

const demoPodYaml: Record<string, string> = {
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

const demoPodDescribe: Record<string, string> = {
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

function displayNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

function isPodReady(pod: PodItem) {
  return pod.status === 'Running' && pod.totalContainers > 0 && pod.readyContainers === pod.totalContainers;
}

function statusColor(status: string) {
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

function eventTypeColor(type: string) {
  return type === 'Warning' ? 'red' : 'blue';
}

function conditionTagColor(condition: PodConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'Ready' || condition.type === 'ContainersReady' ? 'green' : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'Ready' || condition.type === 'ContainersReady' ? 'red' : 'default';
  }

  return 'default';
}

function containerStateColor(state: string) {
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

function restartTone(count: number) {
  if (count > 3) {
    return 'red';
  }

  if (count > 0) {
    return 'orange';
  }

  return 'default';
}

function hasContainerDiagnostics(container: PodContainerItem) {
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

function MetricValue({
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

function DetailStat({
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

function ownerSummary(item: PodItem) {
  if (!item.ownerKind || !item.ownerName) {
    return '-';
  }

  return `${item.ownerKind} / ${item.ownerName}`;
}

function PodTextViewer({
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

export function PodsPage() {
  const { message, modal } = App.useApp();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const token = useAppStore((state) => state.token);
  const [detailItem, setDetailItem] = useState<PodItem>();
  const [logTarget, setLogTarget] = useState<PodItem>();
  const [logContainer, setLogContainer] = useState<string>();
  const [execTarget, setExecTarget] = useState<PodItem>();
  const [inspectTarget, setInspectTarget] = useState<PodItem>();
  const [inspectTab, setInspectTab] = useState<'yaml' | 'describe'>('yaml');
  const [yamlEditTarget, setYamlEditTarget] = useState<PodItem>();

  const podsQuery = useQuery({
    queryKey: ['pods', currentNamespace],
    queryFn: () => getPods(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const items = sessionMode === 'demo' || !podsQuery.data ? demoPods : podsQuery.data;
  const namespaceLabel = displayNamespace(currentNamespace);

  const refreshPods = async () => {
    await podsQuery.refetch();
  };

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) => deletePod(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setDetailItem(undefined);
      setLogTarget(undefined);
      setLogContainer(undefined);
      await refreshPods();
    },
  });

  const updatePodYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updatePodYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshPods();
      void podYamlEditorQuery.refetch();
      if (inspectTarget && inspectTab === 'yaml') {
        void podYamlQuery.refetch();
      }
    },
  });

  const podEventsQuery = useQuery({
    queryKey: ['pod-events', detailItem?.namespace, detailItem?.name],
    queryFn: () => getPodEvents(detailItem!.namespace, detailItem!.name),
    enabled: sessionMode === 'token' && Boolean(detailItem),
  });

  const podLogsQuery = useQuery({
    queryKey: ['pod-logs', logTarget?.namespace, logTarget?.name, logContainer],
    queryFn: () => getPodLogs(logTarget!.namespace, logTarget!.name, logContainer!),
    enabled: sessionMode === 'token' && Boolean(logTarget && logContainer),
  });

  const podYamlQuery = useQuery({
    queryKey: ['pod-yaml', inspectTarget?.namespace, inspectTarget?.name],
    queryFn: () => getPodYaml(inspectTarget!.namespace, inspectTarget!.name),
    enabled: sessionMode === 'token' && Boolean(inspectTarget),
  });

  const podDescribeQuery = useQuery({
    queryKey: ['pod-describe', inspectTarget?.namespace, inspectTarget?.name],
    queryFn: () => getPodDescribe(inspectTarget!.namespace, inspectTarget!.name),
    enabled: sessionMode === 'token' && Boolean(inspectTarget),
  });

  const podYamlEditorQuery = useQuery({
    queryKey: ['pod-yaml-editor', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getPodYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const openLogModal = (item: PodItem) => {
    setLogTarget(item);
    setLogContainer(item.containers[0]?.name);
  };

  const openExecModal = (item: PodItem) => {
    setExecTarget(item);
  };

  const openInspectModal = (item: PodItem, tab: 'yaml' | 'describe') => {
    setInspectTarget(item);
    setInspectTab(tab);
  };

  const openDeleteConfirm = (item: PodItem) => {
    const owner = ownerSummary(item);
    modal.confirm({
      title: `Delete ${item.name} ?`,
      content:
        owner === '-'
          ? 'This deletes the current Pod immediately.'
          : `This deletes the current Pod. If it is managed by ${owner}, Kubernetes may recreate it automatically.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      okButtonProps: { danger: true },
      onOk: async () =>
        deleteMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const readyCount = items.filter(isPodReady).length;
    const totalRestarts = items.reduce((sum, item) => sum + item.restartCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const unhealthyCount = items.filter((item) => !isPodReady(item)).length;

    return [
      {
        label: 'Pods',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Ready',
        value: `${readyCount}/${items.length}`,
        hint: unhealthyCount > 0 ? `${unhealthyCount} 个 Pod 需要关注` : '当前未发现就绪异常',
        tone: 'blue',
      },
      {
        label: 'Restarts',
        value: totalRestarts,
        hint: '汇总所有容器的重启次数',
        tone: 'amber',
      },
      {
        label: 'Metrics',
        value: `${metricsReadyCount}/${items.length}`,
        hint: 'Pod 级 CPU / Memory 实时指标覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<PodItem>[] = [
    {
      title: 'Pod',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.ownerKind ? <Tag color="blue">{item.ownerKind}</Tag> : null}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.nodeName || '-'} · {item.podIP || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 240,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={statusColor(item.status)}>{item.status}</Tag>
          <Tag color={isPodReady(item) ? 'green' : 'orange'}>
            Ready {item.readyContainers}/{item.totalContainers}
          </Tag>
          {item.qosClass ? <Tag>{item.qosClass}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'CPU',
      key: 'cpu',
      width: 120,
      render: (_, item) => <MetricValue available={item.metricsAvailable} value={item.cpuUsage} />,
    },
    {
      title: 'Memory',
      key: 'memory',
      width: 140,
      render: (_, item) => (
        <MetricValue available={item.metricsAvailable} value={item.memoryUsage} />
      ),
    },
    {
      title: 'Restarts',
      dataIndex: 'restartCount',
      key: 'restartCount',
      width: 110,
      render: (value) => <Tag color={restartTone(value as number)}>{value}</Tag>,
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
      render: (value) => value ?? '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 124,
      fixed: 'right',
      render: (_, item) =>
        sessionMode === 'demo' ? (
          <Tag>Demo</Tag>
        ) : (
          <ActionMenuButton
            loading={deleteMutation.isPending}
            menu={{
              items: [
                { key: 'yaml', label: 'YAML' },
                { key: 'describe', label: 'Describe' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'exec', label: 'Exec' },
                { key: 'logs', label: 'Logs' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'yaml') {
                  openInspectModal(item, 'yaml');
                }
                if (key === 'describe') {
                  openInspectModal(item, 'describe');
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                }
                if (key === 'exec') {
                  openExecModal(item);
                }
                if (key === 'logs') {
                  openLogModal(item);
                }
                if (key === 'delete') {
                  openDeleteConfirm(item);
                }
              },
            }}
          />
        ),
    },
  ];

  const detailContainers = detailItem?.containers ?? [];
  const detailConditions = detailItem?.conditions ?? [];
  const detailLabels = detailItem?.labels ?? [];
  const detailEvents =
    sessionMode === 'demo'
      ? detailItem
        ? demoPodEvents[`${detailItem.namespace}/${detailItem.name}`] ?? []
        : []
      : podEventsQuery.data ?? [];
  const logContainerOptions =
    logTarget?.containers.map((item) => ({
      label: item.name,
      value: item.name,
    })) ?? [];
  const logResult: PodLogResult | undefined =
    sessionMode === 'demo' && logTarget
      ? {
          namespace: logTarget.namespace,
          name: logTarget.name,
          container: logContainer ?? logTarget.containers[0]?.name ?? '',
          content:
            demoPodLogs[
              `${logTarget.namespace}/${logTarget.name}/${logContainer ?? logTarget.containers[0]?.name ?? ''}`
            ] ?? 'No logs captured for this demo container.',
          generatedAt: '2026-04-13 10:35:00',
        }
      : podLogsQuery.data;

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && podsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="Pod 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<PodItem>
        title="Pod 列表"
        description="查看当前命名空间内的 Pod 运行状态、重启次数与实时资源使用，点击行可查看容器级详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && podsQuery.isLoading}
        onRefresh={refreshPods}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 Pod、节点、状态、所属资源或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.nodeName.toLowerCase().includes(keyword) ||
          record.podIP.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          `${record.ownerKind ?? ''} ${record.ownerName ?? ''}`.toLowerCase().includes(keyword) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Pod`}
        onRow={(record) => ({
          onClick: () => setDetailItem(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailItem ? `Pod / ${detailItem.namespace}/${detailItem.name}` : 'Pod 详情'}
        placement="right"
        width={440}
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(undefined)}
      >
        {detailItem ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={statusColor(detailItem.status)}>{detailItem.status}</Tag>
              <Tag color={isPodReady(detailItem) ? 'green' : 'orange'}>
                Ready {detailItem.readyContainers}/{detailItem.totalContainers}
              </Tag>
              {detailItem.ownerKind ? <Tag color="blue">{ownerSummary(detailItem)}</Tag> : null}
              {detailItem.qosClass ? <Tag>{detailItem.qosClass}</Tag> : null}
              <Tag color={detailItem.metricsAvailable ? 'geekblue' : 'default'}>
                {detailItem.metricsAvailable ? 'Metrics Ready' : 'Metrics Unavailable'}
              </Tag>
              {sessionMode === 'token' ? (
                <Button size="small" onClick={() => openInspectModal(detailItem, 'yaml')}>
                  YAML
                </Button>
              ) : null}
              {sessionMode === 'token' ? (
                <Button size="small" onClick={() => openInspectModal(detailItem, 'describe')}>
                  Describe
                </Button>
              ) : null}
              {sessionMode === 'token' ? (
                <Button size="small" onClick={() => setYamlEditTarget(detailItem)}>
                  Edit YAML
                </Button>
              ) : null}
              {sessionMode === 'token' ? (
                <Button size="small" onClick={() => openExecModal(detailItem)}>
                  Exec
                </Button>
              ) : null}
              <Button size="small" onClick={() => openLogModal(detailItem)}>
                Logs
              </Button>
              {sessionMode === 'token' ? (
                <Button danger size="small" loading={deleteMutation.isPending} onClick={() => openDeleteConfirm(detailItem)}>
                  Delete
                </Button>
              ) : null}
            </div>

            <div>
              <Typography.Title level={4} className="!mb-1">
                {detailItem.name}
              </Typography.Title>
              <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
                {detailItem.createdAt
                  ? `创建于 ${detailItem.createdAt}，已运行 ${detailItem.age}`
                  : `命名空间 ${detailItem.namespace}`}
              </Typography.Paragraph>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailStat
                label="Ready"
                value={`${detailItem.readyContainers}/${detailItem.totalContainers}`}
              />
              <DetailStat label="Restarts" value={detailItem.restartCount} />
              <DetailStat label="Node" value={detailItem.nodeName || '-'} />
              <DetailStat label="Pod IP" value={detailItem.podIP || '-'} />
            </div>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  CPU
                </div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.metricsAvailable && detailItem.cpuUsage
                    ? detailItem.cpuUsage
                    : 'Unavailable'}
                </div>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Memory
                </div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.metricsAvailable && detailItem.memoryUsage
                    ? detailItem.memoryUsage
                    : 'Unavailable'}
                </div>
              </div>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Containers
              </Typography.Title>
              <div className="space-y-2">
                {detailContainers.map((container: PodContainerItem) => (
                  <div
                    key={container.name}
                    className="rounded-[14px] border border-slate-200 bg-white px-3 py-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Typography.Text strong>{container.name}</Typography.Text>
                      <Tag color={container.ready ? 'green' : 'orange'}>
                        {container.ready ? 'Ready' : 'NotReady'}
                      </Tag>
                      <Tag color={containerStateColor(container.state)}>{container.state}</Tag>
                      <Tag color={restartTone(container.restartCount)}>
                        Restarts {container.restartCount}
                      </Tag>
                    </div>
                    <div className="mt-2 text-sm text-slate-600">
                      CPU: {container.cpuUsage ?? '-'} · Memory: {container.memoryUsage ?? '-'}
                    </div>
                    {hasContainerDiagnostics(container) ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {container.stateReason ? <Tag>Reason: {container.stateReason}</Tag> : null}
                        {container.exitCode != null ? <Tag color="orange">Exit {container.exitCode}</Tag> : null}
                        {container.startedAt ? <Tag>Started: {container.startedAt}</Tag> : null}
                        {container.finishedAt ? <Tag>Finished: {container.finishedAt}</Tag> : null}
                        {container.lastState ? <Tag color="purple">Last: {container.lastState}</Tag> : null}
                        {container.lastStateReason ? <Tag>Last Reason: {container.lastStateReason}</Tag> : null}
                        {container.lastExitCode != null ? <Tag color="red">Last Exit {container.lastExitCode}</Tag> : null}
                        {container.lastFinishedAt ? <Tag>Last Finished: {container.lastFinishedAt}</Tag> : null}
                      </div>
                    ) : null}
                    {container.stateMessage ? (
                      <div className="mt-2 text-xs text-slate-500">{container.stateMessage}</div>
                    ) : null}
                    {container.image ? (
                      <div className="mt-1 text-xs text-slate-500 break-all">{container.image}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Events
              </Typography.Title>
              {sessionMode === 'token' && podEventsQuery.error ? (
                <Alert
                  type="warning"
                  showIcon
                  className="!mb-3"
                  message="Pod events 加载失败"
                />
              ) : null}
              {detailEvents.length > 0 ? (
                <div className="space-y-2">
                  {detailEvents.map((event, index) => (
                    <div
                      key={`${event.reason}-${event.lastSeen}-${index}`}
                      className="rounded-[14px] border border-slate-200 bg-white px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Tag color={eventTypeColor(event.type)}>{event.type}</Tag>
                        <Typography.Text strong>{event.reason}</Typography.Text>
                        <Tag>Count {event.count}</Tag>
                        <Typography.Text type="secondary">{event.lastSeen}</Typography.Text>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">{event.message}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Pod 没有可展示的 events
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Conditions
              </Typography.Title>
              {detailConditions.length > 0 ? (
                <div className="space-y-2">
                  {detailConditions.map((condition) => (
                    <div
                      key={condition.type}
                      className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography.Text strong>{condition.type}</Typography.Text>
                        <Tag color={conditionTagColor(condition)}>{condition.status}</Tag>
                      </div>
                      {condition.reason ? (
                        <div className="mt-1 text-sm text-slate-600">{condition.reason}</div>
                      ) : null}
                      {condition.message ? (
                        <div className="mt-1 text-xs text-slate-500">{condition.message}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Pod 没有可展示的 conditions
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Labels
              </Typography.Title>
              {detailLabels.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailLabels.map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Pod 没有 labels
                </div>
              )}
            </section>
          </section>
        ) : null}
      </Drawer>

      <PodExecTerminalModal
        open={Boolean(execTarget)}
        target={execTarget}
        token={token}
        onClose={() => setExecTarget(undefined)}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Pod YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Pod YAML'
        }
        resourceKind="Pod"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={podYamlEditorQuery.data}
        loading={podYamlEditorQuery.isFetching}
        saving={updatePodYamlMutation.isPending}
        error={podYamlEditorQuery.error}
        errorMessage="Pod YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void podYamlEditorQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updatePodYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />

      <Modal
        title={inspectTarget ? `Pod Inspector / ${inspectTarget.namespace}/${inspectTarget.name}` : 'Pod Inspector'}
        open={Boolean(inspectTarget)}
        onCancel={() => setInspectTarget(undefined)}
        footer={null}
        width={980}
      >
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space wrap>
              <Tag color="blue">{inspectTab.toUpperCase()}</Tag>
              <Typography.Text type="secondary">
                {inspectTarget ? `${inspectTarget.namespace}/${inspectTarget.name}` : '-'}
              </Typography.Text>
            </Space>
            {sessionMode === 'token' ? (
              <Button
                onClick={() => {
                  if (inspectTab === 'yaml') {
                    void podYamlQuery.refetch();
                    return;
                  }

                  void podDescribeQuery.refetch();
                }}
                loading={inspectTab === 'yaml' ? podYamlQuery.isFetching : podDescribeQuery.isFetching}
              >
                Refresh
              </Button>
            ) : null}
          </div>

          <Tabs
            activeKey={inspectTab}
            onChange={(key) => setInspectTab(key as 'yaml' | 'describe')}
            items={[
              {
                key: 'yaml',
                label: 'YAML',
                children: (
                  <PodTextViewer
                    error={sessionMode === 'token' ? podYamlQuery.error : undefined}
                    result={
                      sessionMode === 'demo' && inspectTarget
                        ? {
                            namespace: inspectTarget.namespace,
                            name: inspectTarget.name,
                            content:
                              demoPodYaml[`${inspectTarget.namespace}/${inspectTarget.name}`] ??
                              'No YAML available for this demo pod.',
                            generatedAt: '2026-04-13 12:20:00',
                          }
                        : podYamlQuery.data
                    }
                    errorMessage="Pod YAML 加载失败"
                    emptyMessage="No YAML available."
                  />
                ),
              },
              {
                key: 'describe',
                label: 'Describe',
                children: (
                  <PodTextViewer
                    error={sessionMode === 'token' ? podDescribeQuery.error : undefined}
                    result={
                      sessionMode === 'demo' && inspectTarget
                        ? {
                            namespace: inspectTarget.namespace,
                            name: inspectTarget.name,
                            content:
                              demoPodDescribe[`${inspectTarget.namespace}/${inspectTarget.name}`] ??
                              'No describe output available for this demo pod.',
                            generatedAt: '2026-04-13 12:20:00',
                          }
                        : podDescribeQuery.data
                    }
                    errorMessage="Pod describe 加载失败"
                    emptyMessage="No describe output available."
                  />
                ),
              },
            ]}
          />
        </section>
      </Modal>

      <Modal
        title={
          logTarget ? `Pod Logs / ${logTarget.namespace}/${logTarget.name}` : 'Pod Logs'
        }
        open={Boolean(logTarget)}
        onCancel={() => {
          setLogTarget(undefined);
          setLogContainer(undefined);
        }}
        footer={null}
        width={860}
      >
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space wrap>
              <Typography.Text type="secondary">Container</Typography.Text>
              <Select
                value={logContainer}
                options={logContainerOptions}
                onChange={setLogContainer}
                style={{ minWidth: 220 }}
              />
            </Space>
            {sessionMode === 'token' ? (
              <Button onClick={() => void podLogsQuery.refetch()} loading={podLogsQuery.isFetching}>
                Refresh
              </Button>
            ) : null}
          </div>

          {sessionMode === 'token' && podLogsQuery.error ? (
            <Alert type="warning" showIcon message="Pod logs 加载失败" />
          ) : null}

          <div className="rounded-[16px] border border-slate-200 bg-slate-950 px-4 py-3 text-slate-100">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Container: {logResult?.container || '-'}</span>
              <span>Generated: {logResult?.generatedAt || '-'}</span>
            </div>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-100">
              {logResult?.content || 'No logs available.'}
            </pre>
          </div>
        </section>
      </Modal>
    </section>
  );
}
