import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type CronJobItem,
  type CronJobJobItem,
  getCronJobYaml,
  getCronJobs,
  setCronJobSuspend,
  updateCronJobYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoCronJobs: CronJobItem[] = [
  {
    name: 'demo-cronjob',
    namespace: 'demo-workloads',
    status: 'Running',
    schedule: '*/1 * * * *',
    timeZone: 'Asia/Shanghai',
    suspend: false,
    concurrencyPolicy: 'Forbid',
    activeJobs: 1,
    jobCount: 1,
    podCount: 1,
    restartCount: 0,
    successfulJobsHistory: 3,
    failedJobsHistory: 1,
    age: '1m',
    createdAt: '2026-04-11 23:31:00',
    metricsAvailable: true,
    cpuUsage: '1m',
    memoryUsage: '2.0 MiB',
    lastScheduleTime: '2026-04-11 23:32:00',
    labels: ['app.kubernetes.io/name=demo-cronjob', 'app.kubernetes.io/part-of=k8s-admin-demo'],
    images: ['worker=nginx:1.27-alpine'],
    jobs: [
      {
        name: 'demo-cronjob-29012345',
        status: 'Running',
        active: 1,
        succeeded: 0,
        failed: 0,
        startTime: '2026-04-11 23:32:03',
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

function jobStatusColor(status: string) {
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

export function CronJobsPage() {
  const { message, modal } = App.useApp();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [detailItem, setDetailItem] = useState<CronJobItem>();
  const [yamlEditTarget, setYamlEditTarget] = useState<CronJobItem>();

  const cronJobsQuery = useQuery({
    queryKey: ['cronjobs', currentNamespace],
    queryFn: () => getCronJobs(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const items = sessionMode === 'demo' || !cronJobsQuery.data ? demoCronJobs : cronJobsQuery.data;
  const namespaceLabel = displayNamespace(currentNamespace);

  const refreshCronJobs = async () => {
    await cronJobsQuery.refetch();
  };

  const suspendMutation = useMutation({
    mutationFn: ({ namespace, name, suspend }: { namespace: string; name: string; suspend: boolean }) =>
      setCronJobSuspend(namespace, name, suspend),
    onSuccess: async (result) => {
      void message.success(result.message);
      setDetailItem(undefined);
      await refreshCronJobs();
    },
  });

  const cronJobYamlQuery = useQuery({
    queryKey: ['cronjob-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getCronJobYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateCronJobYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateCronJobYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshCronJobs();
      void cronJobYamlQuery.refetch();
    },
  });

  const handleSuspendToggle = async (item: CronJobItem) => {
    await suspendMutation.mutateAsync({
      namespace: item.namespace,
      name: item.name,
      suspend: !item.suspend,
    });
  };

  const nextCronJobSuspendAction = (item: CronJobItem) => (item.suspend ? 'Resume' : 'Suspend');

  const openSuspendConfirm = (item: CronJobItem) => {
    const nextAction = nextCronJobSuspendAction(item);
    modal.confirm({
      title: `${nextAction} ${item.name} ?`,
      content: item.suspend
        ? 'This resumes CronJob scheduling.'
        : 'This suspends future runs but does not stop already created Jobs.',
      okText: nextAction,
      cancelText: 'Cancel',
      onOk: async () => handleSuspendToggle(item),
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter((item) => item.status === 'Healthy').length;
    const totalJobs = items.reduce((sum, item) => sum + item.jobCount, 0);
    const totalActiveJobs = items.reduce((sum, item) => sum + item.activeJobs, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;

    return [
      {
        label: 'CronJobs',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: `活跃 Job ${totalActiveJobs} 个`,
        tone: 'blue',
      },
      {
        label: 'Jobs',
        value: totalJobs,
        hint: '已挂接的子 Job 总数',
        tone: 'amber',
      },
      {
        label: 'Metrics',
        value: `${metricsReadyCount}/${items.length}`,
        hint: 'CronJob 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<CronJobItem>[] = [
    {
      title: 'CronJob',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.schedule}</Tag>
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.concurrencyPolicy}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 260,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={statusColor(item.status)}>{item.status}</Tag>
          {item.activeJobs > 0 ? <Tag color="blue">Active {item.activeJobs}</Tag> : null}
          {item.suspend ? <Tag>Suspended</Tag> : null}
          <Tag>{item.jobCount} jobs</Tag>
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
                { key: 'suspend', label: nextCronJobSuspendAction(item) },
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

  const detailImages = detailItem?.images ?? [];
  const detailLabels = detailItem?.labels ?? [];
  const detailJobs = detailItem?.jobs ?? [];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && cronJobsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="CronJob 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<CronJobItem>
        title="CronJob 列表"
        description="查看定时任务调度状态、最近子 Job 与聚合资源使用，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && cronJobsQuery.isLoading}
        onRefresh={refreshCronJobs}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 CronJob、Schedule、状态、镜像或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.schedule.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.concurrencyPolicy.toLowerCase().includes(keyword) ||
          (record.timeZone || '').toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 CronJob`}
        onRow={(record) => ({
          onClick: () => setDetailItem(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailItem ? `CronJob / ${detailItem.namespace}/${detailItem.name}` : 'CronJob 详情'}
        placement="right"
        width={460}
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(undefined)}
      >
        {detailItem ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={statusColor(detailItem.status)}>{detailItem.status}</Tag>
              <Tag color="blue">{detailItem.schedule}</Tag>
              <Tag>{detailItem.concurrencyPolicy}</Tag>
              <Tag color={detailItem.metricsAvailable ? 'geekblue' : 'default'}>
                {detailItem.metricsAvailable ? 'Metrics Ready' : 'Metrics Unavailable'}
              </Tag>
              {sessionMode === 'token' ? (
                <Space size={8} onClick={(event) => event.stopPropagation()}>
                  <Button size="small" onClick={() => setYamlEditTarget(detailItem)}>
                    Edit YAML
                  </Button>
                  <Button
                    size="small"
                    loading={suspendMutation.isPending}
                    onClick={() => openSuspendConfirm(detailItem)}
                  >
                    {nextCronJobSuspendAction(detailItem)}
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
              <DetailStat label="Active Jobs" value={detailItem.activeJobs} />
              <DetailStat label="Child Jobs" value={detailItem.jobCount} />
              <DetailStat label="Pods" value={detailItem.podCount} />
              <DetailStat label="Restarts" value={detailItem.restartCount} />
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
                Schedule
              </Typography.Title>
              <Space size={[8, 8]} wrap>
                <Tag>Last Schedule: {detailItem.lastScheduleTime || '-'}</Tag>
                <Tag>Last Success: {detailItem.lastSuccessfulTime || '-'}</Tag>
                <Tag>Time Zone: {detailItem.timeZone || 'Cluster Default'}</Tag>
                <Tag>Suspend: {detailItem.suspend ? 'true' : 'false'}</Tag>
              </Space>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                History Limits
              </Typography.Title>
              <Space size={[8, 8]} wrap>
                <Tag>Successful: {detailItem.successfulJobsHistory}</Tag>
                <Tag>Failed: {detailItem.failedJobsHistory}</Tag>
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
                  当前 CronJob 没有可展示的镜像信息
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Recent Jobs
              </Typography.Title>
              {detailJobs.length > 0 ? (
                <div className="space-y-2">
                  {detailJobs.map((job: CronJobJobItem) => (
                    <div key={job.name} className="rounded-[14px] border border-slate-200 bg-white px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Typography.Text strong>{job.name}</Typography.Text>
                        <Tag color={jobStatusColor(job.status)}>{job.status}</Tag>
                        {job.active > 0 ? <Tag color="blue">Active {job.active}</Tag> : null}
                        {job.failed > 0 ? <Tag color="orange">Failed {job.failed}</Tag> : null}
                        {job.succeeded > 0 ? <Tag color="green">Succeeded {job.succeeded}</Tag> : null}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Start {job.startTime || '-'} · Completion {job.completionTime || '-'}
                      </div>
                      <div className="mt-1 text-sm text-slate-600">
                        CPU {job.cpuUsage ?? '-'} · Memory {job.memoryUsage ?? '-'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前 CronJob 还没有可展示的子 Job
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
                  当前 CronJob 没有 labels
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
            ? `Edit CronJob YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit CronJob YAML'
        }
        resourceKind="CronJob"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={cronJobYamlQuery.data}
        loading={cronJobYamlQuery.isFetching}
        saving={updateCronJobYamlMutation.isPending}
        error={cronJobYamlQuery.error}
        errorMessage="CronJob YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void cronJobYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateCronJobYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
