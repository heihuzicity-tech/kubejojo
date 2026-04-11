import { type ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import { Alert, Drawer, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type DeploymentConditionItem,
  type DeploymentItem,
  type DeploymentPodItem,
  getDeployments,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoDeployments: DeploymentItem[] = [
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

function displayNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
}

function isDeploymentHealthy(item: DeploymentItem) {
  return item.status === 'Healthy' || item.status === 'ScaledDown';
}

function statusColor(status: string) {
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

function conditionTagColor(condition: DeploymentConditionItem) {
  if (condition.status === 'True') {
    return condition.type === 'Available' ? 'green' : 'blue';
  }

  if (condition.status === 'False') {
    return condition.type === 'Available' ? 'red' : 'default';
  }

  return 'default';
}

function deploymentPodStatusColor(status: string) {
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

export function DeploymentsPage() {
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [detailItem, setDetailItem] = useState<DeploymentItem>();

  const deploymentsQuery = useQuery({
    queryKey: ['deployments', currentNamespace],
    queryFn: () => getDeployments(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const items =
    sessionMode === 'demo' || !deploymentsQuery.data
      ? demoDeployments
      : deploymentsQuery.data;

  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter(isDeploymentHealthy).length;
    const totalPods = items.reduce((sum, item) => sum + item.podCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const restartCount = items.reduce((sum, item) => sum + item.restartCount, 0);

    return [
      {
        label: 'Deployments',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: '按副本可用性与更新进度判断',
        tone: 'blue',
      },
      {
        label: 'Pods',
        value: totalPods,
        hint: `关联 Pod 总数，重启累计 ${restartCount}`,
        tone: 'amber',
      },
      {
        label: 'Metrics',
        value: `${metricsReadyCount}/${items.length}`,
        hint: 'Deployment 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<DeploymentItem>[] = [
    {
      title: 'Deployment',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.strategy}</Tag>
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.podCount} pods
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
          <Tag color={item.availableReplicas >= item.desiredReplicas ? 'green' : 'orange'}>
            Ready {item.availableReplicas}/{item.desiredReplicas}
          </Tag>
          {item.unavailableReplicas > 0 ? (
            <Tag color="orange">Unavailable {item.unavailableReplicas}</Tag>
          ) : null}
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

  const detailConditions = detailItem?.conditions ?? [];
  const detailSelector = detailItem?.selector ?? [];
  const detailImages = detailItem?.images ?? [];
  const detailLabels = detailItem?.labels ?? [];
  const detailPods = detailItem?.pods ?? [];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && deploymentsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="Deployment 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<DeploymentItem>
        title="Deployment 列表"
        description="查看副本可用性、滚动发布状态和聚合资源使用，点击行可查看匹配 Pod 与条件详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && deploymentsQuery.isLoading}
        onRefresh={() => deploymentsQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <Tag color="cyan">
              Metrics Ready: {items.filter((item) => item.metricsAvailable).length}/{items.length}
            </Tag>
          </Space>
        }
        searchPlaceholder="搜索 Deployment、状态、镜像、selector 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.selector.some((label) => label.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Deployment`}
        onRow={(record) => ({
          onClick: () => setDetailItem(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailItem ? `Deployment / ${detailItem.namespace}/${detailItem.name}` : 'Deployment 详情'}
        placement="right"
        width={460}
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(undefined)}
      >
        {detailItem ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={statusColor(detailItem.status)}>{detailItem.status}</Tag>
              <Tag color="blue">{detailItem.strategy}</Tag>
              <Tag color={detailItem.metricsAvailable ? 'geekblue' : 'default'}>
                {detailItem.metricsAvailable ? 'Metrics Ready' : 'Metrics Unavailable'}
              </Tag>
            </div>

            <div>
              <Typography.Title level={4} className="!mb-1">
                {detailItem.name}
              </Typography.Title>
              <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
                {detailItem.namespace} · 创建于 {detailItem.createdAt} · 已运行 {detailItem.age}
              </Typography.Paragraph>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailStat label="Desired" value={detailItem.desiredReplicas} />
              <DetailStat label="Updated" value={detailItem.updatedReplicas} />
              <DetailStat label="Available" value={detailItem.availableReplicas} />
              <DetailStat label="Restarts" value={detailItem.restartCount} />
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
                Images
              </Typography.Title>
              {detailImages.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailImages.map((image) => (
                    <Tag key={image}>{image}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Deployment 没有可展示的镜像信息
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Selector
              </Typography.Title>
              {detailSelector.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailSelector.map((item) => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Deployment 没有 selector
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Matched Pods
              </Typography.Title>
              {detailPods.length > 0 ? (
                <div className="space-y-2">
                  {detailPods.map((pod: DeploymentPodItem) => (
                    <div
                      key={pod.name}
                      className="rounded-[14px] border border-slate-200 bg-white px-3 py-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography.Text strong>{pod.name}</Typography.Text>
                        <Tag color={deploymentPodStatusColor(pod.status)}>{pod.status}</Tag>
                        <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                          Ready {pod.readyContainers}/{pod.totalContainers}
                        </Tag>
                        <Tag color={restartTone(pod.restartCount)}>Restarts {pod.restartCount}</Tag>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? '-'} · Memory{' '}
                        {pod.memoryUsage ?? '-'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Deployment 没有关联 Pod
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
                      {condition.lastUpdateTime ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Last Update: {condition.lastUpdateTime}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 Deployment 没有可展示的 conditions
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
                  当前 Deployment 没有 labels
                </div>
              )}
            </section>
          </section>
        ) : null}
      </Drawer>
    </section>
  );
}
