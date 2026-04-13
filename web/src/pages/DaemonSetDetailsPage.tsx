import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import {
  daemonSetConditionTagColor,
  daemonSetPodStatusColor,
  daemonSetRestartTone,
  demoDaemonSets,
  demoDaemonSetYaml,
  DetailStat,
} from '../components/daemonset/daemonSetShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type DaemonSetItem,
  type ResourceTextResult,
  getDaemonSetYaml,
  getDaemonSets,
  restartDaemonSet,
  updateDaemonSetYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type DaemonSetDetailsTabKey = 'overview' | 'pods' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function DaemonSetDetailsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<DaemonSetDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const daemonSetsQuery = useQuery({
    queryKey: ['daemonset-detail-list', namespace],
    queryFn: () => getDaemonSets(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(daemonSetsQuery.error) && !daemonSetsQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const daemonSetItem = useMemo<DaemonSetItem | undefined>(() => {
    const source = useDemoData ? demoDaemonSets : daemonSetsQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [daemonSetsQuery.data, name, namespace, useDemoData]);

  const refreshDaemonSet = async () => {
    if (allowLiveAccess) {
      await daemonSetsQuery.refetch();
    }
  };

  const restartMutation = useMutation({
    mutationFn: () => restartDaemonSet(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshDaemonSet();
    },
  });

  const daemonSetYamlQuery = useQuery({
    queryKey: ['daemonset-detail-yaml', namespace, name],
    queryFn: () => getDaemonSetYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const daemonSetYamlEditorQuery = useQuery({
    queryKey: ['daemonset-detail-yaml-editor', namespace, name],
    queryFn: () => getDaemonSetYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateDaemonSetYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateDaemonSetYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshDaemonSet();
      void daemonSetYamlQuery.refetch();
      void daemonSetYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && daemonSetItem
      ? {
          namespace: daemonSetItem.namespace,
          name: daemonSetItem.name,
          content:
            demoDaemonSetYaml[`${daemonSetItem.namespace}/${daemonSetItem.name}`] ??
            'No YAML available for this demo daemonset.',
          generatedAt: '2026-04-13 15:58:00',
        }
      : daemonSetYamlQuery.data;

  if (sessionMode === 'token' && daemonSetsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 DaemonSet 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!daemonSetItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && daemonSetsQuery.error ? (
          <Alert type="warning" showIcon message="DaemonSet 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            未找到这个 DaemonSet
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/daemonsets')} icon={<ArrowLeftOutlined />}>
              返回 DaemonSet 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const abnormalConditions =
    daemonSetItem.conditions.filter((condition) => condition.status !== 'True') ?? [];
  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== daemonSetItem.namespace;

  const openRestartConfirm = () => {
    modal.confirm({
      title: `Restart ${daemonSetItem.name} ?`,
      content: 'This triggers a rolling update and recreates DaemonSet Pods.',
      okText: 'Restart',
      cancelText: 'Cancel',
      onOk: async () => restartMutation.mutateAsync(),
    });
  };

  return (
    <section className="space-y-4">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="DaemonSet 详情当前显示的是安全回退的演示数据，重启与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/daemonsets')}
          >
            返回 DaemonSet 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {daemonSetItem.name}
              </Typography.Title>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={daemonSetItem.namespace} />
              ) : null}
              <HeaderMeta
                label="Strategy"
                value={daemonSetItem.updateStrategy || '-'}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as DaemonSetDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Status Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Status" value={daemonSetItem.status} />
                        <DetailStat
                          label="Ready"
                          value={`${daemonSetItem.numberReady}/${daemonSetItem.desiredNumberScheduled}`}
                        />
                        <DetailStat label="Current" value={daemonSetItem.currentNumberScheduled} />
                        <DetailStat label="Available" value={daemonSetItem.numberAvailable} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Coverage">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Pods" value={`${daemonSetItem.podCount}`} />
                        <InlineStat
                          label="Updated"
                          value={`${daemonSetItem.updatedNumberScheduled}`}
                        />
                        <InlineStat
                          label="CPU"
                          value={daemonSetItem.cpuUsage ?? 'Unavailable'}
                        />
                        <InlineStat
                          label="Memory"
                          value={daemonSetItem.memoryUsage ?? 'Unavailable'}
                        />
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
                            message="当前 DaemonSet 存在需要关注的 conditions"
                          />
                          {abnormalConditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={daemonSetConditionTagColor(condition)}>
                                  {condition.status}
                                </Tag>
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
                        <Alert type="success" showIcon message="No abnormal daemonset conditions detected." />
                      )}
                    </SectionCard>

                    <SectionCard title="Operations">
                      {allowLiveAccess ? (
                        <Button onClick={openRestartConfirm} loading={restartMutation.isPending}>
                          Restart
                        </Button>
                      ) : (
                        <Alert
                          type="info"
                          showIcon
                          message="当前为回退只读模式，运维操作已禁用。"
                        />
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
                <SectionCard title="Matched Pods" extra={<Tag>{daemonSetItem.pods.length}</Tag>}>
                  {daemonSetItem.pods.length > 0 ? (
                    <div className="space-y-3">
                      {daemonSetItem.pods.map((pod) => (
                        <div
                          key={pod.name}
                          className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{pod.name}</Typography.Text>
                                <Tag color={daemonSetPodStatusColor(pod.status)}>{pod.status}</Tag>
                                <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                                  Ready {pod.readyContainers}/{pod.totalContainers}
                                </Tag>
                                <Tag color={daemonSetRestartTone(pod.restartCount)}>
                                  Restarts {pod.restartCount}
                                </Tag>
                              </div>
                              <div className="text-xs text-slate-500">
                                {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? 'Unavailable'} · Memory{' '}
                                {pod.memoryUsage ?? 'Unavailable'}
                              </div>
                            </div>

                            <Button
                              onClick={() => navigate(buildPodRoute(daemonSetItem.namespace, pod.name))}
                            >
                              Open Pod
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 DaemonSet 没有关联 Pod" />
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
                          {daemonSetItem.namespace}/{daemonSetItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void daemonSetYamlQuery.refetch()}
                            loading={daemonSetYamlQuery.isFetching}
                          >
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
                      error={allowLiveAccess ? daemonSetYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="DaemonSet YAML 加载失败"
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
                    <SectionCard title="Conditions" extra={<Tag>{daemonSetItem.conditions.length}</Tag>}>
                      {daemonSetItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {daemonSetItem.conditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={daemonSetConditionTagColor(condition)}>
                                  {condition.status}
                                </Tag>
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
                        <EmptyState message="当前 DaemonSet 没有可展示的 conditions" />
                      )}
                    </SectionCard>

                    <SectionCard title="Images" extra={<Tag>{daemonSetItem.images.length}</Tag>}>
                      {daemonSetItem.images.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {daemonSetItem.images.map((image) => (
                            <Tag key={image}>{image}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 DaemonSet 没有可展示的镜像信息" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={daemonSetItem.namespace} />
                        <ContextRow label="Strategy" value={daemonSetItem.updateStrategy || '-'} />
                        <ContextRow
                          label="Coverage"
                          value={`${daemonSetItem.numberReady}/${daemonSetItem.desiredNumberScheduled}`}
                        />
                        <ContextRow label="Pods" value={`${daemonSetItem.podCount}`} />
                        <ContextRow label="Age" value={daemonSetItem.age || '-'} />
                        <ContextRow label="Created" value={daemonSetItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Selector" extra={<Tag>{daemonSetItem.selector.length}</Tag>}>
                      {daemonSetItem.selector.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {daemonSetItem.selector.map((selector) => (
                            <Tag key={selector}>{selector}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 DaemonSet 没有 selector" />
                      )}
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{daemonSetItem.labels.length}</Tag>}>
                      {daemonSetItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {daemonSetItem.labels.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 DaemonSet 没有 labels" />
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
        title={`Edit DaemonSet YAML / ${daemonSetItem.namespace}/${daemonSetItem.name}`}
        resourceKind="DaemonSet"
        resourceLabel={`${daemonSetItem.namespace}/${daemonSetItem.name}`}
        result={daemonSetYamlEditorQuery.data}
        loading={daemonSetYamlEditorQuery.isFetching}
        saving={updateDaemonSetYamlMutation.isPending}
        error={daemonSetYamlEditorQuery.error}
        errorMessage="DaemonSet YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void daemonSetYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateDaemonSetYamlMutation.mutateAsync({ content })}
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
