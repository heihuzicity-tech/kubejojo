import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import {
  buildJobRoute,
  canToggleJobSuspend,
  demoJobYaml,
  demoJobs,
  DetailStat,
  jobConditionTagColor,
  jobOwnerSummary,
  jobPodStatusColor,
  jobRestartTone,
  jobStatusColor,
  nextJobSuspendAction,
} from '../components/job/jobShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type JobItem,
  type ResourceTextResult,
  getJobYaml,
  getJobs,
  setJobSuspend,
  updateJobYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type JobDetailsTabKey = 'overview' | 'pods' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function JobDetailsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<JobDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const jobsQuery = useQuery({
    queryKey: ['job-detail-list', namespace],
    queryFn: () => getJobs(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(jobsQuery.error) && !jobsQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const jobItem = useMemo<JobItem | undefined>(() => {
    const source = useDemoData ? demoJobs : jobsQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [jobsQuery.data, name, namespace, useDemoData]);

  const refreshJob = async () => {
    if (allowLiveAccess) {
      await jobsQuery.refetch();
    }
  };

  const suspendMutation = useMutation({
    mutationFn: ({ suspend }: { suspend: boolean }) => setJobSuspend(namespace, name, suspend),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshJob();
    },
  });

  const jobYamlQuery = useQuery({
    queryKey: ['job-detail-yaml', namespace, name],
    queryFn: () => getJobYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const jobYamlEditorQuery = useQuery({
    queryKey: ['job-detail-yaml-editor', namespace, name],
    queryFn: () => getJobYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateJobYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateJobYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshJob();
      void jobYamlQuery.refetch();
      void jobYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && jobItem
      ? {
          namespace: jobItem.namespace,
          name: jobItem.name,
          content: demoJobYaml[`${jobItem.namespace}/${jobItem.name}`] ?? 'No YAML available for this demo job.',
          generatedAt: '2026-04-13 16:22:00',
        }
      : jobYamlQuery.data;

  if (sessionMode === 'token' && jobsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Job 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!jobItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && jobsQuery.error ? (
          <Alert type="warning" showIcon message="Job 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            未找到这个 Job
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/jobs')} icon={<ArrowLeftOutlined />}>
              返回 Job 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader = currentNamespace.trim() === '' || currentNamespace !== jobItem.namespace;
  const hasFailedCondition =
    jobItem.status === 'Failed' ||
    jobItem.conditions.some((condition) => condition.type === 'Failed' && condition.status === 'True');
  const isCompleted =
    jobItem.status === 'Completed' ||
    jobItem.conditions.some((condition) => condition.type === 'Complete' && condition.status === 'True');

  const openSuspendConfirm = () => {
    const nextAction = nextJobSuspendAction(jobItem);
    modal.confirm({
      title: `${nextAction} ${jobItem.name} ?`,
      content:
        jobItem.status === 'Suspended'
          ? 'This resumes Job scheduling.'
          : 'This suspends the Job and prevents new Pods from being created.',
      okText: nextAction,
      cancelText: 'Cancel',
      onOk: async () =>
        suspendMutation.mutateAsync({
          suspend: jobItem.status !== 'Suspended',
        }),
    });
  };

  return (
    <section className="space-y-4">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="Job 详情当前显示的是安全回退的演示数据，Suspend/Resume 与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/jobs')}
          >
            返回 Job 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {jobItem.name}
              </Typography.Title>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? <HeaderMeta label="Namespace" value={jobItem.namespace} /> : null}
              <HeaderMeta label="Owner" value={jobOwnerSummary(jobItem)} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as JobDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Execution Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Status" value={jobItem.status} />
                        <DetailStat label="Active" value={jobItem.active} />
                        <DetailStat label="Succeeded" value={jobItem.succeeded} />
                        <DetailStat label="Failed" value={jobItem.failed} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Timing">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Parallelism" value={`${jobItem.parallelism}`} />
                        <InlineStat label="Desired" value={`${jobItem.desiredCompletions}`} />
                        <InlineStat label="Start" value={jobItem.startTime || '-'} />
                        <InlineStat label="Mode" value={jobItem.completionMode || 'NonIndexed'} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Health">
                      {hasFailedCondition ? (
                        <Alert type="error" showIcon message="Job execution failed and needs attention." />
                      ) : isCompleted ? (
                        <Alert type="success" showIcon message="Job completed successfully." />
                      ) : jobItem.status === 'Suspended' ? (
                        <Alert type="info" showIcon message="Job is currently suspended." />
                      ) : (
                        <Alert type="info" showIcon message="Job is currently running." />
                      )}
                    </SectionCard>

                    <SectionCard title="Operations">
                      {allowLiveAccess && canToggleJobSuspend(jobItem) ? (
                        <Button onClick={openSuspendConfirm} loading={suspendMutation.isPending}>
                          {nextJobSuspendAction(jobItem)}
                        </Button>
                      ) : allowLiveAccess ? (
                        <Alert type="info" showIcon message="当前 Job 已完成，无法再切换调度状态。" />
                      ) : (
                        <Alert type="info" showIcon message="当前为回退只读模式，运维操作已禁用。" />
                      )}
                    </SectionCard>
                  </div>
                </div>
              ),
            },
            {
              key: 'pods',
              label: 'Pods',
              children: (
                <SectionCard title="Matched Pods" extra={<Tag>{jobItem.pods.length}</Tag>}>
                  {jobItem.pods.length > 0 ? (
                    <div className="space-y-3">
                      {jobItem.pods.map((pod) => (
                        <div
                          key={pod.name}
                          className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{pod.name}</Typography.Text>
                                <Tag color={jobPodStatusColor(pod.status)}>{pod.status}</Tag>
                                <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                                  Ready {pod.readyContainers}/{pod.totalContainers}
                                </Tag>
                                <Tag color={jobRestartTone(pod.restartCount)}>
                                  Restarts {pod.restartCount}
                                </Tag>
                              </div>
                              <div className="text-xs text-slate-500">
                                {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? 'Unavailable'} · Memory{' '}
                                {pod.memoryUsage ?? 'Unavailable'}
                              </div>
                            </div>

                            <Button onClick={() => navigate(buildPodRoute(jobItem.namespace, pod.name))}>
                              Open Pod
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 Job 没有关联 Pod" />
                  )}
                </SectionCard>
              ),
            },
            {
              key: 'yaml',
              label: 'YAML',
              children: (
                <SectionCard title="YAML">
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <Space wrap>
                        <Tag color="blue">Manifest</Tag>
                        <Typography.Text type="secondary">
                          {jobItem.namespace}/{jobItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>
                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button onClick={() => void jobYamlQuery.refetch()} loading={jobYamlQuery.isFetching}>
                            Refresh
                          </Button>
                        ) : null}
                        <Button type="primary" onClick={() => setYamlEditOpen(true)} disabled={!allowLiveAccess}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? jobYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Job YAML 加载失败"
                      emptyMessage="No YAML available."
                    />
                  </section>
                </SectionCard>
              ),
            },
            {
              key: 'related',
              label: 'Related',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Conditions" extra={<Tag>{jobItem.conditions.length}</Tag>}>
                      {jobItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {jobItem.conditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={jobConditionTagColor(condition)}>{condition.status}</Tag>
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
                        <EmptyState message="当前 Job 没有可展示的 conditions" />
                      )}
                    </SectionCard>

                    <SectionCard title="Images" extra={<Tag>{jobItem.images.length}</Tag>}>
                      {jobItem.images.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {jobItem.images.map((image) => (
                            <Tag key={image}>{image}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Job 没有可展示的镜像信息" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={jobItem.namespace} />
                        <ContextRow label="Owner" value={jobOwnerSummary(jobItem)} />
                        <ContextRow label="Mode" value={jobItem.completionMode || 'NonIndexed'} />
                        <ContextRow
                          label="Done"
                          value={`${jobItem.succeeded}/${jobItem.desiredCompletions}`}
                        />
                        <ContextRow label="Age" value={jobItem.age || '-'} />
                        <ContextRow label="Created" value={jobItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{jobItem.labels.length}</Tag>}>
                      {jobItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {jobItem.labels.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Job 没有 labels" />
                      )}
                    </SectionCard>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </section>

      <ResourceYamlEditorModal
        open={yamlEditOpen}
        title={`Edit Job YAML / ${jobItem.namespace}/${jobItem.name}`}
        resourceKind="Job"
        resourceLabel={`${jobItem.namespace}/${jobItem.name}`}
        result={jobYamlEditorQuery.data}
        loading={jobYamlEditorQuery.isFetching}
        saving={updateJobYamlMutation.isPending}
        error={jobYamlEditorQuery.error}
        errorMessage="Job YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void jobYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateJobYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}

function SectionCard({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <Typography.Title level={4} className="!mb-0 !text-[16px]">
          {title}
        </Typography.Title>
        {extra ?? null}
      </div>
      {children}
    </section>
  );
}

function InlineStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900 break-all">
        {value}
      </div>
    </div>
  );
}

function ContextRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
      <span className="shrink-0 text-[12px] font-medium text-slate-500">{label}</span>
      <span className="text-right text-[13px] font-medium leading-5 text-slate-900 break-all">
        {value}
      </span>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-slate-300 bg-white px-4 py-8 text-sm text-slate-500">
      {message}
    </div>
  );
}

function HeaderMeta({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="text-slate-600 break-all">{value}</span>
    </div>
  );
}
