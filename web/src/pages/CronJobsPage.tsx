import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildCronJobRoute,
  cronJobStatusColor,
  demoCronJobs,
  displayCronJobNamespace,
  MetricValue,
  nextCronJobSuspendAction,
} from '../components/cronjob/cronJobShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type CronJobItem,
  deleteCronJob,
  getCronJobYaml,
  getCronJobs,
  setCronJobSuspend,
  updateCronJobYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

export function CronJobsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<CronJobItem>();

  const cronJobsQuery = useQuery({
    queryKey: ['cronjobs', currentNamespace],
    queryFn: () => getCronJobs(currentNamespace),
    enabled: sessionMode === 'token',
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(cronJobsQuery.error) && !cronJobsQuery.data);
  const allowOperations = sessionMode === 'token' && !useDemoData;

  const demoItems = useMemo(() => {
    const namespace = currentNamespace.trim();
    return namespace === '' ? demoCronJobs : demoCronJobs.filter((item) => item.namespace === namespace);
  }, [currentNamespace]);
  const items = useDemoData ? demoItems : cronJobsQuery.data ?? [];
  const namespaceLabel = displayCronJobNamespace(currentNamespace);

  const refreshCronJobs = async () => {
    await cronJobsQuery.refetch();
  };

  const suspendMutation = useMutation({
    mutationFn: ({ namespace, name, suspend }: { namespace: string; name: string; suspend: boolean }) =>
      setCronJobSuspend(namespace, name, suspend),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshCronJobs();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteCronJob(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await refreshCronJobs();
    },
  });

  const cronJobYamlQuery = useQuery({
    queryKey: ['cronjob-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getCronJobYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: allowOperations && Boolean(yamlEditTarget),
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

  const openSuspendConfirm = (item: CronJobItem) => {
    const nextAction = nextCronJobSuspendAction(item);
    modal.confirm({
      title: `${nextAction} ${item.name} ?`,
      content: item.suspend
        ? 'This resumes CronJob scheduling.'
        : 'This suspends future runs but does not stop already created Jobs.',
      okText: nextAction,
      cancelText: 'Cancel',
      onOk: async () =>
        suspendMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
          suspend: !item.suspend,
        }),
    });
  };

  const openDeleteConfirm = (item: CronJobItem) => {
    confirmResourceDelete({
      resourceKind: 'CronJob',
      namespace: item.namespace,
      name: item.name,
      impact:
        'This removes the CronJob and future schedules stop immediately. Existing Jobs are not deleted automatically.',
      onConfirm: () =>
        deleteMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
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
          <Tag color={cronJobStatusColor(item.status)}>{item.status}</Tag>
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
        allowOperations ? (
          <ActionMenuButton
            loading={suspendMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'suspend', label: nextCronJobSuspendAction(item) },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildCronJobRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'suspend') {
                  openSuspendConfirm(item);
                  return;
                }
                if (key === 'delete') {
                  openDeleteConfirm(item);
                }
              },
            }}
          />
        ) : (
          <Tag>{useDemoData ? 'Demo' : 'ReadOnly'}</Tag>
        ),
    },
  ];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && useDemoData ? (
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
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="CronJob"
              namespace={currentNamespace}
              enabled={allowOperations}
              disabledReason={useDemoData ? 'Live cluster access is unavailable.' : undefined}
              onCreated={refreshCronJobs}
            />
          </Space>
        }
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
          onClick: () => navigate(buildCronJobRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

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
