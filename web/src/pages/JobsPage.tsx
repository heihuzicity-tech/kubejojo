import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildJobRoute,
  canToggleJobSuspend,
  demoJobs,
  displayJobNamespace,
  jobCompletionSummary,
  jobOwnerSummary,
  jobStatusColor,
  MetricValue,
  nextJobSuspendAction,
} from '../components/job/jobShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type JobItem,
  deleteJob,
  getJobYaml,
  getJobs,
  setJobSuspend,
  updateJobYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

export function JobsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<JobItem>();

  const jobsQuery = useQuery({
    queryKey: ['jobs', currentNamespace],
    queryFn: () => getJobs(currentNamespace),
    enabled: sessionMode === 'token',
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(jobsQuery.error) && !jobsQuery.data);
  const allowOperations = sessionMode === 'token' && !useDemoData;

  const demoItems = useMemo(() => {
    const namespace = currentNamespace.trim();
    return namespace === '' ? demoJobs : demoJobs.filter((item) => item.namespace === namespace);
  }, [currentNamespace]);
  const items = useDemoData ? demoItems : jobsQuery.data ?? [];
  const namespaceLabel = displayJobNamespace(currentNamespace);

  const refreshJobs = async () => {
    await jobsQuery.refetch();
  };

  const suspendMutation = useMutation({
    mutationFn: ({ namespace, name, suspend }: { namespace: string; name: string; suspend: boolean }) =>
      setJobSuspend(namespace, name, suspend),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshJobs();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteJob(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await refreshJobs();
    },
  });

  const jobYamlQuery = useQuery({
    queryKey: ['job-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getJobYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: allowOperations && Boolean(yamlEditTarget),
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
      onOk: async () =>
        suspendMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
          suspend: item.status !== 'Suspended',
        }),
    });
  };

  const openDeleteConfirm = (item: JobItem) => {
    confirmResourceDelete({
      resourceKind: 'Job',
      namespace: item.namespace,
      name: item.name,
      impact: 'This removes the Job and any active Pods may be terminated by Kubernetes.',
      onConfirm: () =>
        deleteMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
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
          <Tag color={jobStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.succeeded >= item.desiredCompletions ? 'green' : 'default'}>
            Done {jobCompletionSummary(item)}
          </Tag>
          {item.active > 0 ? <Tag color="blue">Active {item.active}</Tag> : null}
          {item.failed > 0 ? (
            <Tag color={item.status === 'Failed' ? 'red' : 'orange'}>Failed {item.failed}</Tag>
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
                ...(canToggleJobSuspend(item)
                  ? [{ key: 'suspend', label: nextJobSuspendAction(item) }]
                  : []),
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildJobRoute(item.namespace, item.name));
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
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="Job"
              namespace={currentNamespace}
              enabled={allowOperations}
              disabledReason={useDemoData ? 'Live cluster access is unavailable.' : undefined}
              onCreated={refreshJobs}
            />
          </Space>
        }
        searchPlaceholder="搜索 Job、Owner、状态、镜像或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          jobOwnerSummary(record).toLowerCase().includes(keyword) ||
          (record.completionMode || '').toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Job`}
        onRow={(record) => ({
          onClick: () => navigate(buildJobRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

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
