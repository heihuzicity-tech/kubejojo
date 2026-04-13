import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, InputNumber, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import {
  demoReplicaSets,
  demoReplicaSetYaml,
  DetailStat,
  isStandaloneReplicaSet,
  replicaSetConditionTagColor,
  replicaSetOwnerSummary,
  replicaSetPodStatusColor,
  replicaSetRestartTone,
} from '../components/replicaset/replicaSetShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ReplicaSetItem,
  type ResourceTextResult,
  getReplicaSetYaml,
  getReplicaSets,
  scaleReplicaSet,
  updateReplicaSetYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type ReplicaSetDetailsTabKey = 'overview' | 'pods' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function ReplicaSetDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<ReplicaSetDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleValue, setScaleValue] = useState(1);

  const replicaSetsQuery = useQuery({
    queryKey: ['replicaset-detail-list', namespace],
    queryFn: () => getReplicaSets(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(replicaSetsQuery.error) && !replicaSetsQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const replicaSetItem = useMemo<ReplicaSetItem | undefined>(() => {
    const source = useDemoData ? demoReplicaSets : replicaSetsQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [name, namespace, replicaSetsQuery.data, useDemoData]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
    setScaleOpen(false);
  }, [namespace, name]);

  useEffect(() => {
    if (!replicaSetItem) {
      return;
    }

    setScaleValue(replicaSetItem.desiredReplicas);
  }, [replicaSetItem]);

  const refreshReplicaSet = async () => {
    if (allowLiveAccess) {
      await replicaSetsQuery.refetch();
    }
  };

  const scaleMutation = useMutation({
    mutationFn: ({ replicas }: { replicas: number }) => scaleReplicaSet(namespace, name, replicas),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleOpen(false);
      await refreshReplicaSet();
    },
  });

  const replicaSetYamlQuery = useQuery({
    queryKey: ['replicaset-detail-yaml', namespace, name],
    queryFn: () => getReplicaSetYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const replicaSetYamlEditorQuery = useQuery({
    queryKey: ['replicaset-detail-yaml-editor', namespace, name],
    queryFn: () => getReplicaSetYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateReplicaSetYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateReplicaSetYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshReplicaSet();
      void replicaSetYamlQuery.refetch();
      void replicaSetYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && replicaSetItem
      ? {
          namespace: replicaSetItem.namespace,
          name: replicaSetItem.name,
          content:
            demoReplicaSetYaml[`${replicaSetItem.namespace}/${replicaSetItem.name}`] ??
            'No YAML available for this demo replicaset.',
          generatedAt: '2026-04-13 16:20:00',
        }
      : replicaSetYamlQuery.data;

  if (sessionMode === 'token' && replicaSetsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 ReplicaSet 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!replicaSetItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && replicaSetsQuery.error ? (
          <Alert type="warning" showIcon message="ReplicaSet 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            未找到这个 ReplicaSet
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/replicasets')} icon={<ArrowLeftOutlined />}>
              返回 ReplicaSet 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const abnormalConditions =
    replicaSetItem.conditions.filter(
      (condition) => condition.type === 'ReplicaFailure' && condition.status === 'True',
    ) ?? [];
  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== replicaSetItem.namespace;

  return (
    <section className="space-y-4">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="ReplicaSet 详情当前显示的是安全回退的演示数据，伸缩与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/replicasets')}
          >
            返回 ReplicaSet 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {replicaSetItem.name}
              </Typography.Title>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={replicaSetItem.namespace} />
              ) : null}
              <HeaderMeta label="Owner" value={replicaSetOwnerSummary(replicaSetItem)} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ReplicaSetDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Status Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Status" value={replicaSetItem.status} />
                        <DetailStat
                          label="Ready"
                          value={`${replicaSetItem.readyReplicas}/${replicaSetItem.desiredReplicas}`}
                        />
                        <DetailStat label="Current" value={replicaSetItem.currentReplicas} />
                        <DetailStat label="Available" value={replicaSetItem.availableReplicas} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Replica Shape">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Pods" value={`${replicaSetItem.podCount}`} />
                        <InlineStat
                          label="Labeled"
                          value={`${replicaSetItem.fullyLabeledReplicas}`}
                        />
                        <InlineStat label="CPU" value={replicaSetItem.cpuUsage ?? 'Unavailable'} />
                        <InlineStat
                          label="Memory"
                          value={replicaSetItem.memoryUsage ?? 'Unavailable'}
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
                            message="当前 ReplicaSet 存在副本异常"
                          />
                          {abnormalConditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={replicaSetConditionTagColor(condition)}>
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
                        <Alert type="success" showIcon message="No replica failure detected." />
                      )}
                    </SectionCard>

                    <SectionCard title="Operations">
                      {allowLiveAccess && isStandaloneReplicaSet(replicaSetItem) ? (
                        <Button type="primary" onClick={() => setScaleOpen(true)}>
                          Scale
                        </Button>
                      ) : allowLiveAccess ? (
                        <Alert
                          type="info"
                          showIcon
                          message="当前 ReplicaSet 由上层工作负载管理，建议在 Owner 上操作副本。"
                        />
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
                <SectionCard title="Matched Pods" extra={<Tag>{replicaSetItem.pods.length}</Tag>}>
                  {replicaSetItem.pods.length > 0 ? (
                    <div className="space-y-3">
                      {replicaSetItem.pods.map((pod) => (
                        <div
                          key={pod.name}
                          className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{pod.name}</Typography.Text>
                                <Tag color={replicaSetPodStatusColor(pod.status)}>{pod.status}</Tag>
                                <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                                  Ready {pod.readyContainers}/{pod.totalContainers}
                                </Tag>
                                <Tag color={replicaSetRestartTone(pod.restartCount)}>
                                  Restarts {pod.restartCount}
                                </Tag>
                              </div>
                              <div className="text-xs text-slate-500">
                                {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? 'Unavailable'} · Memory{' '}
                                {pod.memoryUsage ?? 'Unavailable'}
                              </div>
                            </div>

                            <Button
                              onClick={() => navigate(buildPodRoute(replicaSetItem.namespace, pod.name))}
                            >
                              Open Pod
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 ReplicaSet 没有关联 Pod" />
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
                          {replicaSetItem.namespace}/{replicaSetItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>
                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void replicaSetYamlQuery.refetch()}
                            loading={replicaSetYamlQuery.isFetching}
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
                      error={allowLiveAccess ? replicaSetYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="ReplicaSet YAML 加载失败"
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
                    <SectionCard title="Conditions" extra={<Tag>{replicaSetItem.conditions.length}</Tag>}>
                      {replicaSetItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {replicaSetItem.conditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={replicaSetConditionTagColor(condition)}>
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
                        <EmptyState message="当前 ReplicaSet 没有可展示的 conditions" />
                      )}
                    </SectionCard>

                    <SectionCard title="Images" extra={<Tag>{replicaSetItem.images.length}</Tag>}>
                      {replicaSetItem.images.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {replicaSetItem.images.map((image) => (
                            <Tag key={image}>{image}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ReplicaSet 没有可展示的镜像信息" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={replicaSetItem.namespace} />
                        <ContextRow label="Owner" value={replicaSetOwnerSummary(replicaSetItem)} />
                        <ContextRow
                          label="Replicas"
                          value={`${replicaSetItem.readyReplicas}/${replicaSetItem.desiredReplicas}`}
                        />
                        <ContextRow label="Pods" value={`${replicaSetItem.podCount}`} />
                        <ContextRow label="Age" value={replicaSetItem.age || '-'} />
                        <ContextRow label="Created" value={replicaSetItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Selector" extra={<Tag>{replicaSetItem.selector.length}</Tag>}>
                      {replicaSetItem.selector.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {replicaSetItem.selector.map((selector) => (
                            <Tag key={selector}>{selector}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ReplicaSet 没有 selector" />
                      )}
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{replicaSetItem.labels.length}</Tag>}>
                      {replicaSetItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {replicaSetItem.labels.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ReplicaSet 没有 labels" />
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
        title={`Scale ReplicaSet / ${replicaSetItem.namespace}/${replicaSetItem.name}`}
        open={scaleOpen}
        onCancel={() => setScaleOpen(false)}
        onOk={() => void scaleMutation.mutateAsync({ replicas: scaleValue })}
        okText="确认"
        cancelText="取消"
        confirmLoading={scaleMutation.isPending}
      >
        <section className="space-y-4">
          <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
            Adjust the ReplicaSet replica target. Current value: {replicaSetItem.desiredReplicas}.
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
        title={`Edit ReplicaSet YAML / ${replicaSetItem.namespace}/${replicaSetItem.name}`}
        resourceKind="ReplicaSet"
        resourceLabel={`${replicaSetItem.namespace}/${replicaSetItem.name}`}
        result={replicaSetYamlEditorQuery.data}
        loading={replicaSetYamlEditorQuery.isFetching}
        saving={updateReplicaSetYamlMutation.isPending}
        error={replicaSetYamlEditorQuery.error}
        errorMessage="ReplicaSet YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void replicaSetYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateReplicaSetYamlMutation.mutateAsync({ content })}
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
