import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildCronJobRoute,
  cronChildJobStatusColor,
  demoCronJobs,
  demoCronJobYaml,
  DetailStat,
  nextCronJobSuspendAction,
} from '../components/cronjob/cronJobShared';
import { buildJobRoute } from '../components/job/jobShared';
import { PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type CronJobItem,
  type ResourceTextResult,
  getCronJobYaml,
  getCronJobs,
  setCronJobSuspend,
  updateCronJobYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type CronJobDetailsTabKey = 'overview' | 'jobs' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function CronJobDetailsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<CronJobDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const cronJobsQuery = useQuery({
    queryKey: ['cronjob-detail-list', namespace],
    queryFn: () => getCronJobs(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(cronJobsQuery.error) && !cronJobsQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const cronJobItem = useMemo<CronJobItem | undefined>(() => {
    const source = useDemoData ? demoCronJobs : cronJobsQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [cronJobsQuery.data, name, namespace, useDemoData]);

  const refreshCronJob = async () => {
    if (allowLiveAccess) {
      await cronJobsQuery.refetch();
    }
  };

  const suspendMutation = useMutation({
    mutationFn: ({ suspend }: { suspend: boolean }) => setCronJobSuspend(namespace, name, suspend),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshCronJob();
    },
  });

  const cronJobYamlQuery = useQuery({
    queryKey: ['cronjob-detail-yaml', namespace, name],
    queryFn: () => getCronJobYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const cronJobYamlEditorQuery = useQuery({
    queryKey: ['cronjob-detail-yaml-editor', namespace, name],
    queryFn: () => getCronJobYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateCronJobYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateCronJobYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshCronJob();
      void cronJobYamlQuery.refetch();
      void cronJobYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && cronJobItem
      ? {
          namespace: cronJobItem.namespace,
          name: cronJobItem.name,
          content:
            demoCronJobYaml[`${cronJobItem.namespace}/${cronJobItem.name}`] ??
            'No YAML available for this demo cronjob.',
          generatedAt: '2026-04-13 16:24:00',
        }
      : cronJobYamlQuery.data;

  if (sessionMode === 'token' && cronJobsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 CronJob 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!cronJobItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && cronJobsQuery.error ? (
          <Alert type="warning" showIcon message="CronJob 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            未找到这个 CronJob
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/cronjobs')} icon={<ArrowLeftOutlined />}>
              返回 CronJob 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== cronJobItem.namespace;

  const openSuspendConfirm = () => {
    const nextAction = nextCronJobSuspendAction(cronJobItem);
    modal.confirm({
      title: `${nextAction} ${cronJobItem.name} ?`,
      content: cronJobItem.suspend
        ? 'This resumes CronJob scheduling.'
        : 'This suspends future runs but does not stop already created Jobs.',
      okText: nextAction,
      cancelText: 'Cancel',
      onOk: async () => suspendMutation.mutateAsync({ suspend: !cronJobItem.suspend }),
    });
  };

  return (
    <section className="space-y-4">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="CronJob 详情当前显示的是安全回退的演示数据，Suspend/Resume 与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/cronjobs')}
          >
            返回 CronJob 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {cronJobItem.name}
              </Typography.Title>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? <HeaderMeta label="Namespace" value={cronJobItem.namespace} /> : null}
              <HeaderMeta label="Schedule" value={cronJobItem.schedule} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as CronJobDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Schedule Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Status" value={cronJobItem.status} />
                        <DetailStat label="Active Jobs" value={cronJobItem.activeJobs} />
                        <DetailStat label="Child Jobs" value={cronJobItem.jobCount} />
                        <DetailStat label="Pods" value={cronJobItem.podCount} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Policy">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Schedule" value={cronJobItem.schedule} />
                        <InlineStat label="TZ" value={cronJobItem.timeZone || 'Cluster Default'} />
                        <InlineStat label="Concurrency" value={cronJobItem.concurrencyPolicy} />
                        <InlineStat label="Suspend" value={cronJobItem.suspend ? 'true' : 'false'} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Health">
                      {cronJobItem.suspend ? (
                        <Alert type="info" showIcon message="CronJob scheduling is currently suspended." />
                      ) : (
                        <Alert type="success" showIcon message="CronJob scheduling is active." />
                      )}
                    </SectionCard>

                    <SectionCard title="Operations">
                      {allowLiveAccess ? (
                        <Button onClick={openSuspendConfirm} loading={suspendMutation.isPending}>
                          {nextCronJobSuspendAction(cronJobItem)}
                        </Button>
                      ) : (
                        <Alert type="info" showIcon message="当前为回退只读模式，运维操作已禁用。" />
                      )}
                    </SectionCard>
                  </div>
                </div>
              ),
            },
            {
              key: 'jobs',
              label: 'Jobs',
              children: (
                <SectionCard title="Recent Jobs" extra={<Tag>{cronJobItem.jobs.length}</Tag>}>
                  {cronJobItem.jobs.length > 0 ? (
                    <div className="space-y-3">
                      {cronJobItem.jobs.map((job) => (
                        <div
                          key={job.name}
                          className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{job.name}</Typography.Text>
                                <Tag color={cronChildJobStatusColor(job.status)}>{job.status}</Tag>
                                {job.active > 0 ? <Tag color="blue">Active {job.active}</Tag> : null}
                                {job.failed > 0 ? <Tag color="orange">Failed {job.failed}</Tag> : null}
                                {job.succeeded > 0 ? <Tag color="green">Succeeded {job.succeeded}</Tag> : null}
                              </div>
                              <div className="text-xs text-slate-500">
                                Start {job.startTime || '-'} · Completion {job.completionTime || '-'}
                              </div>
                              <div className="text-xs text-slate-500">
                                CPU {job.cpuUsage ?? 'Unavailable'} · Memory {job.memoryUsage ?? 'Unavailable'}
                              </div>
                            </div>

                            <Button onClick={() => navigate(buildJobRoute(cronJobItem.namespace, job.name))}>
                              Open Job
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 CronJob 还没有可展示的子 Job" />
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
                          {cronJobItem.namespace}/{cronJobItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>
                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void cronJobYamlQuery.refetch()}
                            loading={cronJobYamlQuery.isFetching}
                          >
                            Refresh
                          </Button>
                        ) : null}
                        <Button type="primary" onClick={() => setYamlEditOpen(true)} disabled={!allowLiveAccess}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? cronJobYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="CronJob YAML 加载失败"
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
                    <SectionCard title="Images" extra={<Tag>{cronJobItem.images.length}</Tag>}>
                      {cronJobItem.images.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {cronJobItem.images.map((image) => (
                            <Tag key={image}>{image}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 CronJob 没有可展示的镜像信息" />
                      )}
                    </SectionCard>

                    <SectionCard title="History Limits">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <InlineStat label="Successful" value={`${cronJobItem.successfulJobsHistory}`} />
                        <InlineStat label="Failed" value={`${cronJobItem.failedJobsHistory}`} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={cronJobItem.namespace} />
                        <ContextRow label="Schedule" value={cronJobItem.schedule} />
                        <ContextRow label="Concurrency" value={cronJobItem.concurrencyPolicy} />
                        <ContextRow label="Last Schedule" value={cronJobItem.lastScheduleTime || '-'} />
                        <ContextRow label="Last Success" value={cronJobItem.lastSuccessfulTime || '-'} />
                        <ContextRow label="Created" value={cronJobItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{cronJobItem.labels.length}</Tag>}>
                      {cronJobItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {cronJobItem.labels.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 CronJob 没有 labels" />
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
        title={`Edit CronJob YAML / ${cronJobItem.namespace}/${cronJobItem.name}`}
        resourceKind="CronJob"
        resourceLabel={`${cronJobItem.namespace}/${cronJobItem.name}`}
        result={cronJobYamlEditorQuery.data}
        loading={cronJobYamlEditorQuery.isFetching}
        saving={updateCronJobYamlMutation.isPending}
        error={cronJobYamlEditorQuery.error}
        errorMessage="CronJob YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void cronJobYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateCronJobYamlMutation.mutateAsync({ content })}
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
