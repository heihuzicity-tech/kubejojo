import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, InputNumber, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import {
  demoStatefulSets,
  demoStatefulSetYaml,
  DetailStat,
  statefulSetConditionTagColor,
  statefulSetPodStatusColor,
  statefulSetRestartTone,
} from '../components/statefulset/statefulSetShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ResourceTextResult,
  type StatefulSetItem,
  getStatefulSetYaml,
  getStatefulSets,
  restartStatefulSet,
  scaleStatefulSet,
  updateStatefulSetYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type StatefulSetDetailsTabKey = 'overview' | 'pods' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function StatefulSetDetailsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<StatefulSetDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleValue, setScaleValue] = useState(1);

  const statefulSetsQuery = useQuery({
    queryKey: ['statefulset-detail-list', namespace],
    queryFn: () => getStatefulSets(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(statefulSetsQuery.error) && !statefulSetsQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const statefulSetItem = useMemo<StatefulSetItem | undefined>(() => {
    const source = useDemoData ? demoStatefulSets : statefulSetsQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [name, namespace, statefulSetsQuery.data, useDemoData]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
    setScaleOpen(false);
  }, [namespace, name]);

  useEffect(() => {
    if (!statefulSetItem) {
      return;
    }

    setScaleValue(statefulSetItem.desiredReplicas);
  }, [statefulSetItem]);

  const refreshStatefulSet = async () => {
    if (allowLiveAccess) {
      await statefulSetsQuery.refetch();
    }
  };

  const scaleMutation = useMutation({
    mutationFn: ({ replicas }: { replicas: number }) => scaleStatefulSet(namespace, name, replicas),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleOpen(false);
      await refreshStatefulSet();
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => restartStatefulSet(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatefulSet();
    },
  });

  const statefulSetYamlQuery = useQuery({
    queryKey: ['statefulset-detail-yaml', namespace, name],
    queryFn: () => getStatefulSetYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const statefulSetYamlEditorQuery = useQuery({
    queryKey: ['statefulset-detail-yaml-editor', namespace, name],
    queryFn: () => getStatefulSetYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateStatefulSetYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateStatefulSetYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatefulSet();
      void statefulSetYamlQuery.refetch();
      void statefulSetYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && statefulSetItem
      ? {
          namespace: statefulSetItem.namespace,
          name: statefulSetItem.name,
          content:
            demoStatefulSetYaml[`${statefulSetItem.namespace}/${statefulSetItem.name}`] ??
            'No YAML available for this demo statefulset.',
          generatedAt: '2026-04-13 15:35:00',
        }
      : statefulSetYamlQuery.data;

  if (sessionMode === 'token' && statefulSetsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 StatefulSet 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!statefulSetItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && statefulSetsQuery.error ? (
          <Alert type="warning" showIcon message="StatefulSet 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            未找到这个 StatefulSet
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/statefulsets')} icon={<ArrowLeftOutlined />}>
              返回 StatefulSet 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const abnormalConditions =
    statefulSetItem.conditions.filter((condition) => condition.status !== 'True') ?? [];
  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== statefulSetItem.namespace;

  const openRestartConfirm = () => {
    modal.confirm({
      title: `重启 ${statefulSetItem.name} ?`,
      content: '会通过滚动更新触发 StatefulSet Pod 重新创建。',
      okText: '重启',
      cancelText: '取消',
      onOk: async () => restartMutation.mutateAsync(),
    });
  };

  return (
    <section className="space-y-4">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="StatefulSet 详情当前显示的是安全回退的演示数据，伸缩、重启与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/statefulsets')}
          >
            返回 StatefulSet 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {statefulSetItem.name}
              </Typography.Title>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={statefulSetItem.namespace} />
              ) : null}
              <HeaderMeta label="Service" value={statefulSetItem.serviceName || '-'} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400">Strategy</span>
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] font-medium text-slate-600">
                  {statefulSetItem.updateStrategy}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as StatefulSetDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Status Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Status" value={statefulSetItem.status} />
                        <DetailStat
                          label="Replicas"
                          value={`${statefulSetItem.readyReplicas}/${statefulSetItem.desiredReplicas}`}
                        />
                        <DetailStat label="Current" value={statefulSetItem.currentReplicas} />
                        <DetailStat label="Updated" value={statefulSetItem.updatedReplicas} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Runtime">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Pods" value={`${statefulSetItem.podCount}`} />
                        <InlineStat label="Policy" value={statefulSetItem.podManagementPolicy} />
                        <InlineStat label="CPU" value={statefulSetItem.cpuUsage ?? 'Unavailable'} />
                        <InlineStat
                          label="Memory"
                          value={statefulSetItem.memoryUsage ?? 'Unavailable'}
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
                            message="当前 StatefulSet 存在需要关注的 conditions"
                          />
                          {abnormalConditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={statefulSetConditionTagColor(condition)}>
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
                        <Alert type="success" showIcon message="No abnormal stateful conditions detected." />
                      )}
                    </SectionCard>

                    <SectionCard title="Revisions">
                      <div className="space-y-2">
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                            Current Revision
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-900 break-all">
                            {statefulSetItem.currentRevision || '-'}
                          </div>
                        </div>
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3">
                          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                            Update Revision
                          </div>
                          <div className="mt-1 text-sm font-medium text-slate-900 break-all">
                            {statefulSetItem.updateRevision || '-'}
                          </div>
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Operations">
                      {allowLiveAccess ? (
                        <Space wrap>
                          <Button type="primary" onClick={() => setScaleOpen(true)}>
                            Scale
                          </Button>
                          <Button onClick={openRestartConfirm} loading={restartMutation.isPending}>
                            Restart
                          </Button>
                        </Space>
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
                <SectionCard title="Matched Pods" extra={<Tag>{statefulSetItem.pods.length}</Tag>}>
                  {statefulSetItem.pods.length > 0 ? (
                    <div className="space-y-3">
                      {statefulSetItem.pods.map((pod) => (
                        <div
                          key={pod.name}
                          className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{pod.name}</Typography.Text>
                                <Tag color={statefulSetPodStatusColor(pod.status)}>{pod.status}</Tag>
                                <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                                  Ready {pod.readyContainers}/{pod.totalContainers}
                                </Tag>
                                <Tag color={statefulSetRestartTone(pod.restartCount)}>
                                  Restarts {pod.restartCount}
                                </Tag>
                              </div>
                              <div className="text-xs text-slate-500">
                                {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? 'Unavailable'} · Memory{' '}
                                {pod.memoryUsage ?? 'Unavailable'}
                              </div>
                            </div>

                            <Button
                              onClick={() => navigate(buildPodRoute(statefulSetItem.namespace, pod.name))}
                            >
                              Open Pod
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 StatefulSet 没有关联 Pod" />
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
                          {statefulSetItem.namespace}/{statefulSetItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void statefulSetYamlQuery.refetch()}
                            loading={statefulSetYamlQuery.isFetching}
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
                      error={allowLiveAccess ? statefulSetYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="StatefulSet YAML 加载失败"
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
                    <SectionCard title="Conditions" extra={<Tag>{statefulSetItem.conditions.length}</Tag>}>
                      {statefulSetItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {statefulSetItem.conditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={statefulSetConditionTagColor(condition)}>
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
                        <EmptyState message="当前 StatefulSet 没有可展示的 conditions" />
                      )}
                    </SectionCard>

                    <SectionCard title="Images" extra={<Tag>{statefulSetItem.images.length}</Tag>}>
                      {statefulSetItem.images.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {statefulSetItem.images.map((image) => (
                            <Tag key={image}>{image}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 StatefulSet 没有可展示的镜像信息" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={statefulSetItem.namespace} />
                        <ContextRow label="Service" value={statefulSetItem.serviceName || '-'} />
                        <ContextRow label="Policy" value={statefulSetItem.podManagementPolicy} />
                        <ContextRow
                          label="Replicas"
                          value={`${statefulSetItem.readyReplicas}/${statefulSetItem.desiredReplicas}`}
                        />
                        <ContextRow label="Age" value={statefulSetItem.age || '-'} />
                        <ContextRow label="Created" value={statefulSetItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Selector" extra={<Tag>{statefulSetItem.selector.length}</Tag>}>
                      {statefulSetItem.selector.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {statefulSetItem.selector.map((selector) => (
                            <Tag key={selector}>{selector}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 StatefulSet 没有 selector" />
                      )}
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{statefulSetItem.labels.length}</Tag>}>
                      {statefulSetItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {statefulSetItem.labels.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 StatefulSet 没有 labels" />
                      )}
                    </SectionCard>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </section>

      <Modal
        title={`Scale StatefulSet / ${statefulSetItem.namespace}/${statefulSetItem.name}`}
        open={scaleOpen}
        onCancel={() => setScaleOpen(false)}
        onOk={() => void scaleMutation.mutateAsync({ replicas: scaleValue })}
        okText="确认"
        cancelText="取消"
        confirmLoading={scaleMutation.isPending}
      >
        <section className="space-y-4">
          <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
            Adjust the StatefulSet replica target. Current value: {statefulSetItem.desiredReplicas}.
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
        open={yamlEditOpen}
        title={`Edit StatefulSet YAML / ${statefulSetItem.namespace}/${statefulSetItem.name}`}
        resourceKind="StatefulSet"
        resourceLabel={`${statefulSetItem.namespace}/${statefulSetItem.name}`}
        result={statefulSetYamlEditorQuery.data}
        loading={statefulSetYamlEditorQuery.isFetching}
        saving={updateStatefulSetYamlMutation.isPending}
        error={statefulSetYamlEditorQuery.error}
        errorMessage="StatefulSet YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void statefulSetYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateStatefulSetYamlMutation.mutateAsync({ content })}
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
