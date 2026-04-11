import { type ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import { Alert, Drawer, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type PodConditionItem,
  type PodContainerItem,
  type PodItem,
  getPods,
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

export function PodsPage() {
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [detailItem, setDetailItem] = useState<PodItem>();

  const podsQuery = useQuery({
    queryKey: ['pods', currentNamespace],
    queryFn: () => getPods(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const items = sessionMode === 'demo' || !podsQuery.data ? demoPods : podsQuery.data;
  const namespaceLabel = displayNamespace(currentNamespace);

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
  ];

  const detailContainers = detailItem?.containers ?? [];
  const detailConditions = detailItem?.conditions ?? [];
  const detailLabels = detailItem?.labels ?? [];

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
        onRefresh={() => podsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 Pod、节点、状态、Owner 或标签"
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
                    {container.image ? (
                      <div className="mt-1 text-xs text-slate-500 break-all">{container.image}</div>
                    ) : null}
                  </div>
                ))}
              </div>
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
    </section>
  );
}
