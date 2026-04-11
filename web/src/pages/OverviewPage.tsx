import {
  Alert,
  Button,
  Empty,
  Progress,
  Statistic,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FireOutlined,
  ReloadOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import type { ReactNode } from 'react';

import {
  type NamespacePodStat,
  type NodeItem,
  type OverviewSummary,
  type WarningEvent,
  getNamespacePodTop,
  getNodes,
  getOverviewSummary,
  getOverviewWarnings,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoSummary: OverviewSummary = {
  kubernetesVersion: 'v1.35.3',
  clusterStatus: 'Healthy',
  nodesReady: '3/3',
  namespaces: 6,
  podsRunningTotal: '19/23',
  metricsAvailable: true,
  cpuUsage: '43.0%',
  memoryUsage: '58.0%',
};

const demoWarnings: WarningEvent[] = [
  {
    kind: 'Pod',
    name: 'metrics-server-5554f7697c-lj8vb',
    namespace: 'kube-system',
    reason: 'ImagePullBackOff',
    message: '拉取 registry.k8s.io 镜像失败，Metrics API 当前不可用。',
    count: 2,
    lastSeen: '12m ago',
  },
  {
    kind: 'Pod',
    name: 'local-path-provisioner-9c88668cf-pchw7',
    namespace: 'local-path-storage',
    reason: 'ErrImagePull',
    message: '本地存储组件镜像拉取异常，导致 PVC 管理能力受影响。',
    count: 3,
    lastSeen: '14m ago',
  },
];

const demoNodes: NodeItem[] = [
  {
    name: 'k8s-master',
    role: 'control-plane',
    ip: '10.0.0.101',
    status: 'Ready,SchedulingDisabled',
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
  },
  {
    name: 'k8s-node1',
    role: 'worker',
    ip: '10.0.0.102',
    status: 'Ready',
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
  },
  {
    name: 'k8s-node2',
    role: 'worker',
    ip: '10.0.0.103',
    status: 'Ready',
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
  },
];

const demoNamespaceStats: NamespacePodStat[] = [
  { namespace: 'kube-system', pods: 10 },
  { namespace: 'default', pods: 6 },
  { namespace: 'local-path-storage', pods: 1 },
  { namespace: 'cilium-secrets', pods: 1 },
  { namespace: 'kube-public', pods: 1 },
];

function statusColor(status: string) {
  switch (status) {
    case 'Healthy':
      return 'green';
    case 'Degraded':
      return 'orange';
    case 'Unavailable':
      return 'red';
    default:
      return 'default';
  }
}

function parsePercent(value?: string) {
  return Number.parseFloat(value ?? '0') || 0;
}

function Panel({
  title,
  extra,
  children,
  className,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        'rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]',
        className ?? '',
      ].join(' ')}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Typography.Title level={5} className="!mb-0">
          {title}
        </Typography.Title>
        {extra}
      </div>
      {children}
    </section>
  );
}

function SummaryCard({
  icon,
  title,
  value,
  meta,
  accentClass,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  meta: string;
  accentClass: string;
}) {
  return (
    <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <div
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base',
            accentClass,
          ].join(' ')}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-500">{title}</div>
          <div className="mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-slate-950">
            {value}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">{meta}</div>
        </div>
      </div>
    </section>
  );
}

function CompactMetricCard({
  title,
  value,
  suffix,
  extra,
}: {
  title: string;
  value: string | number;
  suffix?: string;
  extra?: string;
}) {
  return (
    <section className="rounded-[18px] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-slate-400">{title}</div>
      <div className="mt-2 flex items-end gap-2">
        <div className="text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-slate-950">
          {value}
        </div>
        {suffix ? <div className="pb-0.5 text-sm font-medium text-slate-500">{suffix}</div> : null}
      </div>
      {extra ? <div className="mt-1.5 text-xs text-slate-500">{extra}</div> : null}
    </section>
  );
}

function parseReadyCount(nodesReady: string) {
  const [ready = '0', total = '0'] = nodesReady.split('/');
  return {
    ready: Number.parseInt(ready, 10) || 0,
    total: Number.parseInt(total, 10) || 0,
  };
}

function parseRunningPods(podsRunningTotal: string) {
  const [running = '0', total = '0'] = podsRunningTotal.split('/');
  return {
    running: Number.parseInt(running, 10) || 0,
    total: Number.parseInt(total, 10) || 0,
  };
}

const warningColumns: ColumnsType<WarningEvent> = [
  {
    title: 'Resource',
    key: 'resource',
    render: (_, item) => (
      <div>
        <Typography.Text strong>
          {item.kind} / {item.name}
        </Typography.Text>
        <div className="mt-1 text-xs text-slate-500">{item.message}</div>
      </div>
    ),
  },
  {
    title: 'Namespace',
    dataIndex: 'namespace',
    key: 'namespace',
    width: 180,
  },
  {
    title: 'Reason',
    dataIndex: 'reason',
    key: 'reason',
    width: 160,
    render: (value: string) => <Tag color="red">{value}</Tag>,
  },
  {
    title: 'Count',
    dataIndex: 'count',
    key: 'count',
    width: 90,
  },
  {
    title: 'Last Seen',
    dataIndex: 'lastSeen',
    key: 'lastSeen',
    width: 120,
  },
];

const nodeColumns: ColumnsType<NodeItem> = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
    render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 180,
    render: (value: string) => <Tag color={value.startsWith('Ready') ? 'green' : 'red'}>{value}</Tag>,
  },
  {
    title: 'Role',
    dataIndex: 'role',
    key: 'role',
    width: 140,
  },
  {
    title: 'Internal IP',
    dataIndex: 'ip',
    key: 'ip',
    width: 160,
  },
  {
    title: 'Version',
    dataIndex: 'kubeletVersion',
    key: 'kubeletVersion',
    width: 120,
  },
  {
    title: 'Container Runtime',
    dataIndex: 'containerRuntime',
    key: 'containerRuntime',
    width: 180,
  },
];

export function OverviewPage() {
  const sessionMode = useAppStore((state) => state.sessionMode);
  const namespace = useAppStore((state) => state.namespace);
  const enabled = sessionMode === 'token';

  const summaryQuery = useQuery({
    queryKey: ['overview-summary', namespace],
    queryFn: () => getOverviewSummary(namespace),
    enabled,
  });

  const warningQuery = useQuery({
    queryKey: ['overview-warning-events', namespace],
    queryFn: () => getOverviewWarnings(namespace),
    enabled,
  });

  const nodesQuery = useQuery({
    queryKey: ['overview-nodes'],
    queryFn: getNodes,
    enabled,
  });

  const namespaceQuery = useQuery({
    queryKey: ['overview-namespace-pod-top', namespace],
    queryFn: () => getNamespacePodTop(namespace),
    enabled,
  });

  if (enabled && summaryQuery.isLoading && nodesQuery.isLoading) {
    return <Skeleton active paragraph={{ rows: 12 }} />;
  }

  const summary = enabled && summaryQuery.data ? summaryQuery.data : demoSummary;
  const warnings = enabled && warningQuery.data ? warningQuery.data : demoWarnings;
  const nodes = enabled && nodesQuery.data ? nodesQuery.data : demoNodes;
  const namespaceStats =
    enabled && namespaceQuery.data ? namespaceQuery.data : demoNamespaceStats;

  const maxNamespacePods = Math.max(...namespaceStats.map((item) => item.pods), 1);
  const readyStats = parseReadyCount(summary.nodesReady);
  const podStats = parseRunningPods(summary.podsRunningTotal);
  const warningCount = warnings.length;
  const queryErrors = [
    summaryQuery.error,
    warningQuery.error,
    nodesQuery.error,
    namespaceQuery.error,
  ].filter(Boolean);

  const handleRefresh = async () => {
    await Promise.allSettled([
      summaryQuery.refetch(),
      warningQuery.refetch(),
      nodesQuery.refetch(),
      namespaceQuery.refetch(),
    ]);
  };

  const summaryCards = [
    {
      title: 'Cluster Status',
      value: summary.clusterStatus,
      extra: `Kubernetes ${summary.kubernetesVersion}`,
    },
    {
      title: 'Nodes Ready',
      value: readyStats.ready,
      suffix: `/ ${readyStats.total}`,
      extra: `${nodes.length} 个节点已纳入监控`,
    },
    {
      title: 'Pods Running',
      value: podStats.running,
      suffix: `/ ${podStats.total}`,
      extra: `${namespace} 范围内运行中 Pod`,
    },
    {
      title: 'Warning Events',
      value: warningCount,
      extra: warningCount > 0 ? '需要优先排查异常资源' : '当前没有告警事件',
    },
  ];

  const podOverviewItems =
    namespaceStats.length > 0
      ? namespaceStats
      : [{ namespace, pods: podStats.running }];

  const recentWarnings = warnings.slice(0, 4);

  return (
    <section className="space-y-4">
      {enabled && queryErrors.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          message="部分概览数据暂不可用，当前页面已使用可获取的数据和回退内容继续展示。"
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((item) => (
          <CompactMetricCard
            key={item.title}
            title={item.title}
            value={item.value}
            suffix={item.suffix}
            extra={item.extra}
          />
        ))}
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Tag color={statusColor(summary.clusterStatus)}>{summary.clusterStatus}</Tag>
            <Tag color="blue">{summary.kubernetesVersion}</Tag>
            <Tag color={summary.metricsAvailable ? 'cyan' : 'default'}>
              {summary.metricsAvailable ? 'Metrics Ready' : 'Metrics Unavailable'}
            </Tag>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
              Namespace: <span className="font-semibold text-slate-950">{namespace}</span>
            </div>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm text-slate-700">
              模式: <span className="font-semibold text-slate-950">{sessionMode === 'token' ? 'Real Cluster' : 'Demo'}</span>
            </div>
          </div>

          <Space size={10} wrap>
            <Button icon={<ReloadOutlined />} onClick={() => void handleRefresh()}>
              刷新概览
            </Button>
          </Space>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Pod 状态概览"
          extra={<Tag color="blue">{podStats.running}/{podStats.total}</Tag>}
        >
          {podStats.total > 0 ? (
            <div className="space-y-2.5">
              {podOverviewItems.map((item) => {
                const percent = podStats.total > 0 ? Math.round((item.pods / podStats.total) * 100) : 0;

                return (
                  <section
                    key={item.namespace}
                    className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                  >
                    <div className="mb-1.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-950">
                          {item.namespace}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">当前范围内 Pod 数量</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-base font-semibold text-slate-950">{item.pods}</div>
                        <div className="text-xs text-slate-500">Pods</div>
                      </div>
                    </div>
                    <Progress
                      percent={percent}
                      size="small"
                      showInfo={false}
                      strokeColor="#0f766e"
                      trailColor="#dbe7ec"
                    />
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span className="text-sm text-slate-500">
                    当前命名空间没有可展示的 Pod 数据
                  </span>
                }
              />
            </div>
          )}
        </Panel>

        <Panel
          title="资源使用"
          extra={
            <Tag color={summary.metricsAvailable ? 'cyan' : 'default'}>
              {summary.metricsAvailable ? 'Live Metrics' : 'Unavailable'}
            </Tag>
          }
        >
          {summary.metricsAvailable ? (
            <div className="space-y-3">
              {[
                {
                  label: 'CPU Usage',
                  value: summary.cpuUsage ?? '0%',
                  percent: parsePercent(summary.cpuUsage),
                  strokeColor: '#0f766e',
                },
                {
                  label: 'Memory Usage',
                  value: summary.memoryUsage ?? '0%',
                  percent: parsePercent(summary.memoryUsage),
                  strokeColor: '#2563eb',
                },
              ].map((item) => (
                <section
                  key={item.label}
                  className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Typography.Text strong className="!text-sm">
                      {item.label}
                    </Typography.Text>
                    <span className="text-sm font-semibold text-slate-950">{item.value}</span>
                  </div>
                  <Progress
                    percent={item.percent}
                    strokeColor={item.strokeColor}
                    trailColor="#dbe7ec"
                  />
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              当前集群 Metrics API 不可用，资源使用率暂时无法展示。
            </div>
          )}
        </Panel>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Panel title="最近异常">
          {recentWarnings.length > 0 ? (
            <div className="space-y-2.5">
              {recentWarnings.map((item) => (
                <section
                  key={`${item.namespace}-${item.kind}-${item.name}-${item.reason}`}
                  className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-950">
                        {item.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {item.namespace} / {item.reason}
                      </div>
                    </div>
                    <Tag color="orange">{item.count}</Tag>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-8">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span className="text-sm text-slate-500">当前没有 Warning 事件</span>}
              />
            </div>
          )}
        </Panel>

        <Panel title="健康摘要">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {[
              {
                label: '控制面版本',
                value: summary.kubernetesVersion,
                icon: <ClusterOutlined />,
              },
              {
                label: 'Node Ready',
                value: `${readyStats.ready}/${readyStats.total}`,
                icon: <CheckCircleOutlined />,
              },
              {
                label: '运行中 Pods',
                value: `${podStats.running}/${podStats.total}`,
                icon: <AppstoreOutlined />,
              },
              {
                label: 'Warning 数量',
                value: String(warningCount),
                icon: <WarningOutlined />,
              },
            ].map((item) => (
              <section
                key={item.label}
                className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-600 shadow-[inset_0_0_0_1px_rgba(226,232,240,1)]">
                    {item.icon}
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">{item.label}</div>
                    <div className="mt-0.5 text-base font-semibold text-slate-950">{item.value}</div>
                  </div>
                </div>
              </section>
            ))}
          </div>
        </Panel>
      </section>

      <Panel
        title="节点状态"
        extra={<Tag color="geekblue">{nodes.length} nodes</Tag>}
        className="overflow-hidden"
      >
        <Table<NodeItem>
          rowKey="name"
          columns={nodeColumns}
          dataSource={nodes}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
        />
      </Panel>

      <Panel
        title="异常事件"
        extra={<Tag color={warningCount > 0 ? 'orange' : 'green'}>{warningCount} warnings</Tag>}
        className="overflow-hidden"
      >
        <Table<WarningEvent>
          rowKey={(item) => `${item.namespace}-${item.kind}-${item.name}-${item.reason}`}
          columns={warningColumns}
          dataSource={warnings}
          pagination={false}
          size="small"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '当前没有 Warning 事件' }}
        />
      </Panel>
    </section>
  );
}
