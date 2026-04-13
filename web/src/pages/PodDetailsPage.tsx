import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Select, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { PodExecTerminalPanel } from '../components/pod/PodExecTerminalModal';
import {
  conditionTagColor,
  containerStateColor,
  demoPodDescribe,
  demoPodEvents,
  demoPodLogs,
  demoPods,
  demoPodYaml,
  eventTypeColor,
  hasContainerDiagnostics,
  isPodReady,
  ownerSummary,
  PodTextViewer,
  restartTone,
  statusColor,
} from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PodEventItem,
  type PodItem,
  type PodLogResult,
  type ResourceTextResult,
  getPodDescribe,
  getPodEvents,
  getPodLogs,
  getPods,
  getPodYaml,
  updatePodYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type PodDetailsTabKey =
  | 'overview'
  | 'containers'
  | 'events'
  | 'logs'
  | 'terminal'
  | 'yaml'
  | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function eventPriority(type: string) {
  return type === 'Warning' ? 0 : 1;
}

function parseEventTimestamp(value: string) {
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function PodDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const token = useAppStore((state) => state.token);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<PodDetailsTabKey>('overview');
  const [logContainer, setLogContainer] = useState<string>();
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const podListQuery = useQuery({
    queryKey: ['pod-detail-list', namespace],
    queryFn: () => getPods(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(podListQuery.error) && !podListQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const podItem = useMemo<PodItem | undefined>(() => {
    const source = useDemoData ? demoPods : podListQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [name, namespace, podListQuery.data, useDemoData]);

  useEffect(() => {
    setActiveTab('overview');
    setLogContainer(undefined);
  }, [namespace, name]);

  useEffect(() => {
    if (!podItem || logContainer) {
      return;
    }

    setLogContainer(podItem.containers[0]?.name);
  }, [logContainer, podItem]);

  const refreshPod = async () => {
    if (sessionMode === 'token') {
      await podListQuery.refetch();
    }
  };

  const updatePodYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updatePodYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshPod();
      void podYamlEditorQuery.refetch();
      if (activeTab === 'yaml') {
        void podYamlQuery.refetch();
      }
      if (activeTab === 'related') {
        void podDescribeQuery.refetch();
      }
    },
  });

  const podEventsQuery = useQuery({
    queryKey: ['pod-detail-events', namespace, name],
    queryFn: () => getPodEvents(namespace, name),
    enabled: allowLiveAccess && Boolean(namespace && name && podItem),
  });

  const podLogsQuery = useQuery({
    queryKey: ['pod-detail-logs', namespace, name, logContainer],
    queryFn: () => getPodLogs(namespace, name, logContainer!),
    enabled: allowLiveAccess && activeTab === 'logs' && Boolean(namespace && name && logContainer),
  });

  const podYamlQuery = useQuery({
    queryKey: ['pod-detail-yaml', namespace, name],
    queryFn: () => getPodYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const podDescribeQuery = useQuery({
    queryKey: ['pod-detail-describe', namespace, name],
    queryFn: () => getPodDescribe(namespace, name),
    enabled: allowLiveAccess && activeTab === 'related' && Boolean(namespace && name),
  });

  const podYamlEditorQuery = useQuery({
    queryKey: ['pod-detail-yaml-editor', namespace, name],
    queryFn: () => getPodYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const detailEventsSource =
    useDemoData && podItem
      ? demoPodEvents[`${podItem.namespace}/${podItem.name}`] ?? []
      : podEventsQuery.data ?? [];
  const detailEvents = useMemo(() => {
    return [...detailEventsSource].sort((left, right) => {
      const priorityDelta = eventPriority(left.type) - eventPriority(right.type);
      if (priorityDelta !== 0) {
        return priorityDelta;
      }

      const timeDelta = parseEventTimestamp(right.lastSeen) - parseEventTimestamp(left.lastSeen);
      if (timeDelta !== 0) {
        return timeDelta;
      }

      return left.reason.localeCompare(right.reason);
    });
  }, [detailEventsSource]);
  const overviewEvents = detailEvents.slice(0, 3);
  const hasOverviewEvents = overviewEvents.length > 0;
  const abnormalConditions = podItem?.conditions.filter(
    (condition) =>
      condition.status !== 'True' || Boolean(condition.reason) || Boolean(condition.message),
  ) ?? [];
  const labelsPreview = podItem?.labels.slice(0, 6) ?? [];
  const hiddenLabelCount = Math.max((podItem?.labels.length ?? 0) - labelsPreview.length, 0);

  const logResult: PodLogResult | undefined =
    useDemoData && podItem
      ? {
          namespace: podItem.namespace,
          name: podItem.name,
          container: logContainer ?? podItem.containers[0]?.name ?? '',
          content:
            demoPodLogs[
              `${podItem.namespace}/${podItem.name}/${logContainer ?? podItem.containers[0]?.name ?? ''}`
            ] ?? 'No logs captured for this demo container.',
          generatedAt: '2026-04-13 10:35:00',
        }
      : podLogsQuery.data;

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && podItem
      ? {
          namespace: podItem.namespace,
          name: podItem.name,
          content:
            demoPodYaml[`${podItem.namespace}/${podItem.name}`] ??
            'No YAML available for this demo pod.',
          generatedAt: '2026-04-13 12:20:00',
        }
      : podYamlQuery.data;

  const describeResult: ResourceTextResult | undefined =
    useDemoData && podItem
      ? {
          namespace: podItem.namespace,
          name: podItem.name,
          content:
            demoPodDescribe[`${podItem.namespace}/${podItem.name}`] ??
            'No describe output available for this demo pod.',
          generatedAt: '2026-04-13 12:20:00',
        }
      : podDescribeQuery.data;

  if (sessionMode === 'token' && podListQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Pod 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!podItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && podListQuery.error ? (
          <Alert type="warning" showIcon message="Pod 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 Pod</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/pods')} icon={<ArrowLeftOutlined />}>
              返回 Pod 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const logContainerOptions = podItem.containers.map((item) => ({
    label: item.name,
    value: item.name,
  }));
  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== podItem.namespace;

  const openTab = (nextTab: PodDetailsTabKey) => {
    setActiveTab(nextTab);
    if (nextTab === 'logs' && !logContainer) {
      setLogContainer(podItem.containers[0]?.name);
    }
  };

  return (
    <section className="space-y-4">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="Pod 详情当前显示的是安全回退的演示数据，实时日志、终端与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/pods')}
          >
            返回 Pod 列表
          </Button>

            <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {podItem.name}
              </Typography.Title>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={podItem.namespace} />
              ) : null}
              {podItem.ownerKind && podItem.ownerName ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-slate-400">Owner</span>
                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] font-medium text-slate-600">
                    {podItem.ownerKind}
                  </span>
                  <span className="text-slate-600">{podItem.ownerName}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => openTab(key as PodDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Status Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <SummaryStat label="Phase" value={podItem.status} />
                        <SummaryStat
                          label="Ready"
                          value={`${podItem.readyContainers}/${podItem.totalContainers}`}
                        />
                        <SummaryStat label="Containers" value={podItem.containers.length} />
                        <SummaryStat label="Restarts" value={podItem.restartCount} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Containers Snapshot" extra={<Tag>{podItem.containers.length}</Tag>}>
                      <div className="space-y-3">
                        {podItem.containers.map((container) => (
                          <div
                            key={container.name}
                            className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3"
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
                            {container.image ? (
                              <div className="mt-2 text-xs text-slate-500 break-all">{container.image}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Health">
                      {abnormalConditions.length > 0 ? (
                        <div className="space-y-2">
                          <Alert
                            type="warning"
                            showIcon
                            message="当前 Pod 存在异常 condition"
                          />
                          {abnormalConditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-3"
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
                        <Alert
                          type="success"
                          showIcon
                          message="No abnormal conditions detected."
                        />
                      )}
                    </SectionCard>

                    {hasOverviewEvents ? (
                      <SectionCard title="Latest Events" extra={<Tag>{detailEvents.length}</Tag>}>
                        <div className="space-y-2">
                          {overviewEvents.map((event, index) => (
                            <EventRow key={`${event.reason}-${event.lastSeen}-${index}`} event={event} compact />
                          ))}
                        </div>
                      </SectionCard>
                    ) : null}
                  </div>
                </div>
              ),
            },
            {
              key: 'containers',
              label: 'Containers',
              children: (
                <div className="space-y-4">
                  <SectionCard title="Containers" extra={<Tag>{podItem.containers.length}</Tag>}>
                    <div className="space-y-3">
                      {podItem.containers.map((container) => (
                        <div
                          key={container.name}
                          className="rounded-[16px] border border-slate-200 bg-slate-50 px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
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
                              {container.image ? (
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                  <span className="shrink-0 font-medium uppercase tracking-[0.12em] text-slate-400">
                                    Image
                                  </span>
                                  <span className="break-all">{container.image}</span>
                                </div>
                              ) : null}
                            </div>

                            <div className="grid grid-cols-2 gap-2 sm:max-w-[260px] lg:min-w-[220px]">
                              <InlineStat label="CPU" value={container.cpuUsage ?? '-'} />
                              <InlineStat label="Memory" value={container.memoryUsage ?? '-'} />
                            </div>
                          </div>

                          {hasContainerDiagnostics(container) ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {container.stateReason ? <Tag>Reason: {container.stateReason}</Tag> : null}
                              {container.exitCode != null ? (
                                <Tag color="orange">Exit {container.exitCode}</Tag>
                              ) : null}
                              {container.startedAt ? <Tag>Started: {container.startedAt}</Tag> : null}
                              {container.finishedAt ? <Tag>Finished: {container.finishedAt}</Tag> : null}
                              {container.lastState ? <Tag color="purple">Last: {container.lastState}</Tag> : null}
                              {container.lastStateReason ? (
                                <Tag>Last Reason: {container.lastStateReason}</Tag>
                              ) : null}
                              {container.lastExitCode != null ? (
                                <Tag color="red">Last Exit {container.lastExitCode}</Tag>
                              ) : null}
                            </div>
                          ) : null}

                          {container.stateMessage ? (
                            <div className="mt-2 text-xs text-slate-500">{container.stateMessage}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              ),
            },
            {
              key: 'events',
              label: 'Events',
              children: (
                <SectionCard title="Events" extra={<Tag>{detailEvents.length}</Tag>}>
                  {allowLiveAccess && podEventsQuery.error ? (
                    <Alert type="warning" showIcon className="!mb-3" message="Pod events 加载失败" />
                  ) : null}
                  {detailEvents.length > 0 ? (
                    <div className="space-y-3">
                      {detailEvents.map((event, index) => (
                        <EventRow key={`${event.reason}-${event.lastSeen}-${index}`} event={event} />
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 Pod 没有可展示的 events" />
                  )}
                </SectionCard>
              ),
            },
            {
              key: 'logs',
              label: 'Logs',
              children: (
                <SectionCard title="Logs">
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <Space wrap>
                        <Typography.Text type="secondary">Container</Typography.Text>
                        <Select
                          value={logContainer}
                          options={logContainerOptions}
                          onChange={setLogContainer}
                          style={{ minWidth: 220 }}
                        />
                      </Space>
                      {allowLiveAccess ? (
                        <Button onClick={() => void podLogsQuery.refetch()} loading={podLogsQuery.isFetching}>
                          Refresh
                        </Button>
                      ) : null}
                    </div>

                    {allowLiveAccess && podLogsQuery.error ? (
                      <Alert type="warning" showIcon message="Pod logs 加载失败" />
                    ) : null}

                    <div className="rounded-[16px] border border-slate-200 bg-slate-950 px-4 py-3 text-slate-100">
                      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>Container: {logResult?.container || '-'}</span>
                        <span>Generated: {logResult?.generatedAt || '-'}</span>
                      </div>
                      <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-100">
                        {logResult?.content || 'No logs available.'}
                      </pre>
                    </div>
                  </section>
                </SectionCard>
              ),
            },
            {
              key: 'terminal',
              label: 'Terminal',
              children: (
                <SectionCard title="Terminal">
                  <PodExecTerminalPanel
                    active={activeTab === 'terminal'}
                    target={podItem}
                    token={useDemoData ? '' : token}
                  />
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
                          {podItem.namespace}/{podItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>
                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button onClick={() => void podYamlQuery.refetch()} loading={podYamlQuery.isFetching}>
                            Refresh
                          </Button>
                        ) : null}
                        <Button
                          type="primary"
                          onClick={() => setYamlEditOpen(true)}
                          disabled={!allowLiveAccess}
                        >
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? podYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Pod YAML 加载失败"
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
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_340px]">
                  <SectionCard title="Describe">
                    <PodTextViewer
                      error={allowLiveAccess ? podDescribeQuery.error : undefined}
                      result={describeResult}
                      errorMessage="Pod describe 加载失败"
                      emptyMessage="No describe output available."
                    />
                  </SectionCard>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-slate-50">
                        <ContextRow label="Namespace" value={podItem.namespace} />
                        <ContextRow label="Owner" value={ownerSummary(podItem)} />
                        <ContextRow label="Node" value={podItem.nodeName || '-'} />
                        <ContextRow label="Pod IP" value={podItem.podIP || '-'} />
                        <ContextRow label="QoS" value={podItem.qosClass || '-'} />
                        <ContextRow label="Age" value={podItem.age || '-'} />
                        <ContextRow label="Created" value={podItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{podItem.labels.length}</Tag>}>
                      {labelsPreview.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {labelsPreview.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                          {hiddenLabelCount > 0 ? <Tag>+{hiddenLabelCount}</Tag> : null}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Pod 没有 labels" />
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
        title={`Edit Pod YAML / ${podItem.namespace}/${podItem.name}`}
        resourceKind="Pod"
        resourceLabel={`${podItem.namespace}/${podItem.name}`}
        result={podYamlEditorQuery.data}
        loading={podYamlEditorQuery.isFetching}
        saving={updatePodYamlMutation.isPending}
        error={podYamlEditorQuery.error}
        errorMessage="Pod YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void podYamlEditorQuery.refetch();
        }}
        onSave={(content) => updatePodYamlMutation.mutateAsync({ content })}
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

function SummaryStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1.5 text-[18px] font-semibold text-slate-900">{value}</div>
    </div>
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
      <div className="mt-1 text-[13px] font-semibold leading-5 text-slate-900">{value}</div>
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

function EventRow({
  event,
  compact = false,
}: {
  event: PodEventItem;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[16px] border border-slate-200 bg-white px-4 py-3 ${compact ? '' : ''}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={eventTypeColor(event.type)}>{event.type}</Tag>
        <Typography.Text strong>{event.reason}</Typography.Text>
        <Tag>Count {event.count}</Tag>
        <Typography.Text type="secondary">{event.lastSeen}</Typography.Text>
      </div>
      <div className="mt-2 text-sm text-slate-600">{event.message}</div>
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
      <span className="text-slate-600">{value}</span>
    </div>
  );
}
