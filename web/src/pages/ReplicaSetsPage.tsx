import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, InputNumber, Modal, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type ReplicaSetConditionItem,
  type ReplicaSetItem,
  type ReplicaSetPodItem,
  getReplicaSetYaml,
  getReplicaSets,
  scaleReplicaSet,
  updateReplicaSetYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoReplicaSets: ReplicaSetItem[] = [
  {
    name: 'demo-replicaset',
    namespace: 'demo-workloads',
    status: 'Healthy',
    desiredReplicas: 2,
    currentReplicas: 2,
    readyReplicas: 2,
    availableReplicas: 2,
    fullyLabeledReplicas: 2,
    podCount: 2,
    restartCount: 0,
    age: '8m',
    createdAt: '2026-04-11 22:48:00',
    metricsAvailable: true,
    cpuUsage: '2m',
    memoryUsage: '4.0 MiB',
    selector: ['app=demo-replicaset'],
    labels: ['app.kubernetes.io/name=demo-replicaset', 'app.kubernetes.io/part-of=k8s-admin-demo'],
    images: ['nginx=nginx:1.27-alpine'],
    conditions: [],
    pods: [
      {
        name: 'demo-replicaset-7hj9l',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node2',
        metricsAvailable: true,
        cpuUsage: '2m',
        memoryUsage: '2.0 MiB',
      },
      {
        name: 'demo-replicaset-bmwd9',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '0m',
        memoryUsage: '2.0 MiB',
      },
    ],
  },
];

function displayNamespace(namespace: string) {
  const value = namespace.trim();
  return value === '' ? 'all-namespaces' : value;
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

function podStatusColor(status: string) {
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

function conditionTagColor(condition: ReplicaSetConditionItem) {
  if (condition.status === 'True') {
    return 'blue';
  }
  if (condition.status === 'False') {
    return 'default';
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

function ownerSummary(item: ReplicaSetItem) {
  if (!item.ownerKind || !item.ownerName) {
    return 'Standalone ReplicaSet';
  }

  return `${item.ownerKind} / ${item.ownerName}`;
}

function isStandaloneReplicaSet(item: ReplicaSetItem) {
  return !item.ownerKind && !item.ownerName;
}

export function ReplicaSetsPage() {
  const { message } = App.useApp();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [detailItem, setDetailItem] = useState<ReplicaSetItem>();
  const [scaleTarget, setScaleTarget] = useState<ReplicaSetItem>();
  const [scaleValue, setScaleValue] = useState(1);
  const [yamlEditTarget, setYamlEditTarget] = useState<ReplicaSetItem>();

  const replicaSetsQuery = useQuery({
    queryKey: ['replicasets', currentNamespace],
    queryFn: () => getReplicaSets(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const items =
    sessionMode === 'demo' || !replicaSetsQuery.data
      ? demoReplicaSets
      : replicaSetsQuery.data;
  const namespaceLabel = displayNamespace(currentNamespace);

  const refreshReplicaSets = async () => {
    await replicaSetsQuery.refetch();
  };

  const scaleMutation = useMutation({
    mutationFn: ({ namespace, name, replicas }: { namespace: string; name: string; replicas: number }) =>
      scaleReplicaSet(namespace, name, replicas),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleTarget(undefined);
      setDetailItem(undefined);
      await refreshReplicaSets();
    },
  });

  const replicaSetYamlQuery = useQuery({
    queryKey: ['replicaset-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getReplicaSetYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateReplicaSetYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateReplicaSetYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshReplicaSets();
      void replicaSetYamlQuery.refetch();
    },
  });

  const openScaleModal = (item: ReplicaSetItem) => {
    setScaleTarget(item);
    setScaleValue(item.desiredReplicas);
  };

  const handleScaleSubmit = async () => {
    if (!scaleTarget) {
      return;
    }

    await scaleMutation.mutateAsync({
      namespace: scaleTarget.namespace,
      name: scaleTarget.name,
      replicas: scaleValue,
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter((item) => item.status === 'Healthy' || item.status === 'ScaledDown').length;
    const totalPods = items.reduce((sum, item) => sum + item.podCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const restartCount = items.reduce((sum, item) => sum + item.restartCount, 0);

    return [
      {
        label: 'ReplicaSets',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: '按副本就绪与可用状态判断',
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
        hint: 'ReplicaSet 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<ReplicaSetItem>[] = [
    {
      title: 'ReplicaSet',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.ownerKind ? <Tag color="blue">{item.ownerKind}</Tag> : <Tag>Standalone</Tag>}
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
          <Tag color={item.readyReplicas >= item.desiredReplicas ? 'green' : 'orange'}>
            Ready {item.readyReplicas}/{item.desiredReplicas}
          </Tag>
          {item.availableReplicas < item.desiredReplicas ? (
            <Tag color="orange">Available {item.availableReplicas}</Tag>
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
            loading={scaleMutation.isPending}
            menu={{
              items: [
                ...(isStandaloneReplicaSet(item) ? [{ key: 'scale', label: 'Scale' }] : []),
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'scale') {
                  openScaleModal(item);
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                }
              },
            }}
          />
        ),
    },
  ];

  const detailConditions = detailItem?.conditions ?? [];
  const detailSelector = detailItem?.selector ?? [];
  const detailImages = detailItem?.images ?? [];
  const detailLabels = detailItem?.labels ?? [];
  const detailPods = detailItem?.pods ?? [];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && replicaSetsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="ReplicaSet 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<ReplicaSetItem>
        title="ReplicaSet 列表"
        description="查看副本保持情况、匹配 Pod 与聚合资源使用，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && replicaSetsQuery.isLoading}
        onRefresh={refreshReplicaSets}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 ReplicaSet、Owner、镜像、selector 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          ownerSummary(record).toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.selector.some((label) => label.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 ReplicaSet`}
        onRow={(record) => ({
          onClick: () => setDetailItem(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailItem ? `ReplicaSet / ${detailItem.namespace}/${detailItem.name}` : 'ReplicaSet 详情'}
        placement="right"
        width={460}
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(undefined)}
      >
        {detailItem ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={statusColor(detailItem.status)}>{detailItem.status}</Tag>
              <Tag color={detailItem.metricsAvailable ? 'geekblue' : 'default'}>
                {detailItem.metricsAvailable ? 'Metrics Ready' : 'Metrics Unavailable'}
              </Tag>
              <Tag color="blue">{ownerSummary(detailItem)}</Tag>
              {sessionMode === 'token' ? (
                <Space size={8} onClick={(event) => event.stopPropagation()}>
                  {isStandaloneReplicaSet(detailItem) ? (
                    <Button size="small" onClick={() => openScaleModal(detailItem)}>
                      Scale
                    </Button>
                  ) : null}
                  <Button size="small" onClick={() => setYamlEditTarget(detailItem)}>
                    Edit YAML
                  </Button>
                </Space>
              ) : null}
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
              <DetailStat label="Current" value={detailItem.currentReplicas} />
              <DetailStat label="Ready" value={detailItem.readyReplicas} />
              <DetailStat label="Available" value={detailItem.availableReplicas} />
            </div>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">CPU</div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.metricsAvailable && detailItem.cpuUsage ? detailItem.cpuUsage : 'Unavailable'}
                </div>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Memory</div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.metricsAvailable && detailItem.memoryUsage ? detailItem.memoryUsage : 'Unavailable'}
                </div>
              </div>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">Images</Typography.Title>
              {detailImages.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailImages.map((image) => (
                    <Tag key={image}>{image}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 ReplicaSet 没有可展示的镜像信息
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">Selector</Typography.Title>
              {detailSelector.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailSelector.map((item) => (
                    <Tag key={item}>{item}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 ReplicaSet 没有 selector
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">Matched Pods</Typography.Title>
              {detailPods.length > 0 ? (
                <div className="space-y-2">
                  {detailPods.map((pod: ReplicaSetPodItem) => (
                    <div key={pod.name} className="rounded-[14px] border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography.Text strong>{pod.name}</Typography.Text>
                        <Tag color={podStatusColor(pod.status)}>{pod.status}</Tag>
                        <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                          Ready {pod.readyContainers}/{pod.totalContainers}
                        </Tag>
                        <Tag color={restartTone(pod.restartCount)}>Restarts {pod.restartCount}</Tag>
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? '-'} · Memory {pod.memoryUsage ?? '-'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 ReplicaSet 没有关联 Pod
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">Conditions</Typography.Title>
              {detailConditions.length > 0 ? (
                <div className="space-y-2">
                  {detailConditions.map((condition) => (
                    <div key={condition.type} className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography.Text strong>{condition.type}</Typography.Text>
                        <Tag color={conditionTagColor(condition)}>{condition.status}</Tag>
                      </div>
                      {condition.reason ? <div className="mt-1 text-sm text-slate-600">{condition.reason}</div> : null}
                      {condition.message ? <div className="mt-1 text-xs text-slate-500">{condition.message}</div> : null}
                      {condition.lastUpdateTime ? (
                        <div className="mt-1 text-xs text-slate-500">Last Update: {condition.lastUpdateTime}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 ReplicaSet 没有可展示的 conditions
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">Labels</Typography.Title>
              {detailLabels.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailLabels.map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 ReplicaSet 没有 labels
                </div>
              )}
            </section>
          </section>
        ) : null}
      </Drawer>

      <Modal
        title={
          scaleTarget
            ? `Scale ReplicaSet / ${scaleTarget.namespace}/${scaleTarget.name}`
            : 'Scale ReplicaSet'
        }
        open={Boolean(scaleTarget)}
        onCancel={() => setScaleTarget(undefined)}
        onOk={() => void handleScaleSubmit()}
        okText="Confirm"
        cancelText="Cancel"
        confirmLoading={scaleMutation.isPending}
      >
        <section className="space-y-4">
          <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
            Adjust the ReplicaSet replica target. Current value: {scaleTarget?.desiredReplicas ?? 0}.
          </Typography.Paragraph>
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Replicas</div>
            <InputNumber
              min={0}
              precision={0}
              value={scaleValue}
              onChange={(value) => setScaleValue(value == null ? 0 : value)}
              className="w-full"
            />
          </div>
        </section>
      </Modal>

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit ReplicaSet YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit ReplicaSet YAML'
        }
        resourceKind="ReplicaSet"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={replicaSetYamlQuery.data}
        loading={replicaSetYamlQuery.isFetching}
        saving={updateReplicaSetYamlMutation.isPending}
        error={replicaSetYamlQuery.error}
        errorMessage="ReplicaSet YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void replicaSetYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateReplicaSetYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
