import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type JobConditionItem,
  type JobItem,
  type JobPodItem,
  getJobYaml,
  getJobs,
  setJobSuspend,
  updateJobYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoJobs: JobItem[] = [
  {
    name: 'demo-job',
    namespace: 'demo-workloads',
    status: 'Running',
    parallelism: 1,
    desiredCompletions: 1,
    active: 1,
    succeeded: 0,
    failed: 0,
    completionMode: 'NonIndexed',
    podCount: 1,
    restartCount: 0,
    age: '1m',
    createdAt: '2026-04-11 23:30:00',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '2.0 MiB',
    startTime: '2026-04-11 23:30:10',
    ownerKind: '',
    ownerName: '',
    labels: ['app.kubernetes.io/name=demo-job', 'app.kubernetes.io/part-of=k8s-admin-demo'],
    images: ['worker=nginx:1.27-alpine'],
    conditions: [
      {
        type: 'Complete',
        status: 'False',
      },
    ],
    pods: [
      {
        name: 'demo-job-4p97m',
        status: 'Running',
        readyContainers: 1,
        totalContainers: 1,
        restartCount: 0,
        nodeName: 'k8s-node1',
        metricsAvailable: true,
        cpuUsage: '1m',
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

function conditionTagColor(condition: JobConditionItem) {
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

function ownerSummary(item: JobItem) {
  if (!item.ownerKind || !item.ownerName) {
    return 'Standalone Job';
  }

  return `${item.ownerKind} / ${item.ownerName}`;
}

function completionSummary(item: JobItem) {
  return `${item.succeeded}/${item.desiredCompletions}`;
}

function canToggleJobSuspend(item: JobItem) {
  return item.status !== 'Completed' && item.status !== 'Failed';
}

function nextJobSuspendAction(item: JobItem) {
  return item.status === 'Suspended' ? 'Resume' : 'Suspend';
}

export function JobsPage() {
  const { message, modal } = App.useApp();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [detailItem, setDetailItem] = useState<JobItem>();
  const [yamlEditTarget, setYamlEditTarget] = useState<JobItem>();

  const jobsQuery = useQuery({
    queryKey: ['jobs', currentNamespace],
    queryFn: () => getJobs(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const items = sessionMode === 'demo' || !jobsQuery.data ? demoJobs : jobsQuery.data;
  const namespaceLabel = displayNamespace(currentNamespace);

  const refreshJobs = async () => {
    await jobsQuery.refetch();
  };

  const suspendMutation = useMutation({
    mutationFn: ({ namespace, name, suspend }: { namespace: string; name: string; suspend: boolean }) =>
      setJobSuspend(namespace, name, suspend),
    onSuccess: async (result) => {
      void message.success(result.message);
      setDetailItem(undefined);
      await refreshJobs();
    },
  });

  const jobYamlQuery = useQuery({
    queryKey: ['job-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getJobYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateJobYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateJobYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshJobs();
      void jobYamlQuery.refetch();
    },
  });

  const handleSuspendToggle = async (item: JobItem) => {
    await suspendMutation.mutateAsync({
      namespace: item.namespace,
      name: item.name,
      suspend: item.status !== 'Suspended',
    });
  };

  const openSuspendConfirm = (item: JobItem) => {
    const nextAction = nextJobSuspendAction(item);
    modal.confirm({
      title: `${nextAction} ${item.name} ?`,
      content:
        item.status === 'Suspended'
          ? 'This resumes Job scheduling.'
          : 'This suspends the Job and prevents new Pods from being created.',
      okText: nextAction,
      cancelText: 'Cancel',
      onOk: async () => handleSuspendToggle(item),
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const completedCount = items.filter((item) => item.status === 'Completed').length;
    const totalPods = items.reduce((sum, item) => sum + item.podCount, 0);
    const restartCount = items.reduce((sum, item) => sum + item.restartCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;

    return [
      {
        label: 'Jobs',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Completed',
        value: `${completedCount}/${items.length}`,
        hint: '按 Job 完成态统计',
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
        hint: 'Job 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<JobItem>[] = [
    {
      title: 'Job',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.ownerKind ? <Tag color="blue">{item.ownerKind}</Tag> : <Tag>Standalone</Tag>}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.completionMode || 'NonIndexed'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 280,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={statusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.succeeded >= item.desiredCompletions ? 'green' : 'default'}>
            Done {completionSummary(item)}
          </Tag>
          {item.active > 0 ? <Tag color="blue">Active {item.active}</Tag> : null}
          {item.failed > 0 ? <Tag color={item.status === 'Failed' ? 'red' : 'orange'}>Failed {item.failed}</Tag> : null}
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
            loading={suspendMutation.isPending}
            menu={{
              items: [
                { key: 'edit-yaml', label: 'Edit YAML' },
                ...(canToggleJobSuspend(item)
                  ? [{ key: 'suspend', label: nextJobSuspendAction(item) }]
                  : []),
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'suspend') {
                  openSuspendConfirm(item);
                }
              },
            }}
          />
        ),
    },
  ];

  const detailConditions = detailItem?.conditions ?? [];
  const detailImages = detailItem?.images ?? [];
  const detailLabels = detailItem?.labels ?? [];
  const detailPods = detailItem?.pods ?? [];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && jobsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="Job 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<JobItem>
        title="Job 列表"
        description="查看一次性任务执行状态、关联 Pod 与聚合资源使用，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && jobsQuery.isLoading}
        onRefresh={refreshJobs}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 Job、Owner、状态、镜像或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          ownerSummary(record).toLowerCase().includes(keyword) ||
          (record.completionMode || '').toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Job`}
        onRow={(record) => ({
          onClick: () => setDetailItem(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailItem ? `Job / ${detailItem.namespace}/${detailItem.name}` : 'Job 详情'}
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
                  <Button size="small" onClick={() => setYamlEditTarget(detailItem)}>
                    Edit YAML
                  </Button>
                  {canToggleJobSuspend(detailItem) ? (
                    <Button
                      size="small"
                      loading={suspendMutation.isPending}
                      onClick={() => openSuspendConfirm(detailItem)}
                    >
                      {nextJobSuspendAction(detailItem)}
                    </Button>
                  ) : null}
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
              <DetailStat label="Parallelism" value={detailItem.parallelism} />
              <DetailStat label="Desired" value={detailItem.desiredCompletions} />
              <DetailStat label="Succeeded" value={detailItem.succeeded} />
              <DetailStat label="Failed" value={detailItem.failed} />
            </div>

            <section className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  CPU
                </div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.metricsAvailable && detailItem.cpuUsage ? detailItem.cpuUsage : 'Unavailable'}
                </div>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Memory
                </div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.metricsAvailable && detailItem.memoryUsage ? detailItem.memoryUsage : 'Unavailable'}
                </div>
              </div>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Timing
              </Typography.Title>
              <Space size={[8, 8]} wrap>
                <Tag>Start: {detailItem.startTime || '-'}</Tag>
                <Tag>Completion: {detailItem.completionTime || '-'}</Tag>
                <Tag>Mode: {detailItem.completionMode || 'NonIndexed'}</Tag>
                <Tag>Active: {detailItem.active}</Tag>
              </Space>
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
                  当前 Job 没有可展示的镜像信息
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Matched Pods
              </Typography.Title>
              {detailPods.length > 0 ? (
                <div className="space-y-2">
                  {detailPods.map((pod: JobPodItem) => (
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
                  当前 Job 没有关联 Pod
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
                  当前 Job 没有可展示的 conditions
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
                  当前 Job 没有 labels
                </div>
              )}
            </section>
          </section>
        ) : null}
      </Drawer>

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Job YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Job YAML'
        }
        resourceKind="Job"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={jobYamlQuery.data}
        loading={jobYamlQuery.isFetching}
        saving={updateJobYamlMutation.isPending}
        error={jobYamlQuery.error}
        errorMessage="Job YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void jobYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateJobYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
