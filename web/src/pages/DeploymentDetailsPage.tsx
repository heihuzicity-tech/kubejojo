import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, InputNumber, Modal, Space, Tabs, Tag, Typography } from 'antd';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  demoDeployments,
  demoDeploymentYaml,
  deploymentConditionTagColor,
  deploymentPodStatusColor,
  deploymentStatusColor,
  DetailStat,
  restartTone,
} from '../components/deployment/deploymentShared';
import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type DeploymentItem,
  type ResourceTextResult,
  getDeploymentYaml,
  getDeployments,
  restartDeployment,
  scaleDeployment,
  updateDeploymentYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type DeploymentDetailsTabKey = 'overview' | 'pods' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function DeploymentDetailsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<DeploymentDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [scaleValue, setScaleValue] = useState(1);

  const deploymentsQuery = useQuery({
    queryKey: ['deployment-detail-list', namespace],
    queryFn: () => getDeployments(namespace),
    enabled: sessionMode === 'token' && Boolean(namespace),
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(deploymentsQuery.error) && !deploymentsQuery.data);
  const allowLiveAccess = sessionMode === 'token' && !useDemoData;

  const deploymentItem = useMemo<DeploymentItem | undefined>(() => {
    const source = useDemoData ? demoDeployments : deploymentsQuery.data ?? [];
    return source.find((item) => item.namespace === namespace && item.name === name);
  }, [deploymentsQuery.data, name, namespace, useDemoData]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
    setScaleOpen(false);
  }, [namespace, name]);

  useEffect(() => {
    if (!deploymentItem) {
      return;
    }

    setScaleValue(deploymentItem.desiredReplicas);
  }, [deploymentItem]);

  const refreshDeployment = async () => {
    if (allowLiveAccess) {
      await deploymentsQuery.refetch();
    }
  };

  const scaleMutation = useMutation({
    mutationFn: ({ replicas }: { replicas: number }) => scaleDeployment(namespace, name, replicas),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleOpen(false);
      await refreshDeployment();
    },
  });

  const restartMutation = useMutation({
    mutationFn: () => restartDeployment(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshDeployment();
    },
  });

  const deploymentYamlQuery = useQuery({
    queryKey: ['deployment-detail-yaml', namespace, name],
    queryFn: () => getDeploymentYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const deploymentYamlEditorQuery = useQuery({
    queryKey: ['deployment-detail-yaml-editor', namespace, name],
    queryFn: () => getDeploymentYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateDeploymentYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateDeploymentYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshDeployment();
      void deploymentYamlQuery.refetch();
      void deploymentYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined =
    useDemoData && deploymentItem
      ? {
          namespace: deploymentItem.namespace,
          name: deploymentItem.name,
          content:
            demoDeploymentYaml[`${deploymentItem.namespace}/${deploymentItem.name}`] ??
            'No YAML available for this demo deployment.',
          generatedAt: '2026-04-13 15:12:00',
        }
      : deploymentYamlQuery.data;

  if (sessionMode === 'token' && deploymentsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Deployment 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!deploymentItem) {
    return (
      <section className="space-y-4">
        {sessionMode === 'token' && deploymentsQuery.error ? (
          <Alert type="warning" showIcon message="Deployment 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <div className="rounded-[16px] border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            未找到这个 Deployment
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/workloads/deployments')} icon={<ArrowLeftOutlined />}>
              返回 Deployment 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const abnormalConditions =
    deploymentItem.conditions.filter((condition) => condition.status !== 'True') ?? [];
  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== deploymentItem.namespace;

  const openRestartConfirm = () => {
    modal.confirm({
      title: `重启 ${deploymentItem.name} ?`,
      content: '会通过 rollout restart 触发新一轮 Pod 滚动更新。',
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
          message="Deployment 详情当前显示的是安全回退的演示数据，伸缩、重启与 YAML 编辑已自动降级。"
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/workloads/deployments')}
          >
            返回 Deployment 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {deploymentItem.name}
              </Typography.Title>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={deploymentItem.namespace} />
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400">Strategy</span>
                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] font-medium text-slate-600">
                  {deploymentItem.strategy}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as DeploymentDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Status Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Status" value={deploymentItem.status} />
                        <DetailStat
                          label="Replicas"
                          value={`${deploymentItem.availableReplicas}/${deploymentItem.desiredReplicas}`}
                        />
                        <DetailStat label="Updated" value={deploymentItem.updatedReplicas} />
                        <DetailStat label="Restarts" value={deploymentItem.restartCount} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Workload Shape">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Pods" value={`${deploymentItem.podCount}`} />
                        <InlineStat
                          label="Unavailable"
                          value={`${deploymentItem.unavailableReplicas}`}
                        />
                        <InlineStat
                          label="CPU"
                          value={
                            deploymentItem.metricsAvailable && deploymentItem.cpuUsage
                              ? deploymentItem.cpuUsage
                              : 'Unavailable'
                          }
                        />
                        <InlineStat
                          label="Memory"
                          value={
                            deploymentItem.metricsAvailable && deploymentItem.memoryUsage
                              ? deploymentItem.memoryUsage
                              : 'Unavailable'
                          }
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
                            message="当前 Deployment 存在需要关注的 conditions"
                          />
                          {abnormalConditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={deploymentConditionTagColor(condition)}>
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
                        <Alert type="success" showIcon message="No abnormal rollout conditions detected." />
                      )}
                    </SectionCard>

                    <SectionCard title="Operations">
                      {allowLiveAccess ? (
                        <div className="space-y-3">
                          <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                            Replica target: {deploymentItem.desiredReplicas}
                          </div>
                          <Space wrap>
                            <Button type="primary" onClick={() => setScaleOpen(true)}>
                              Scale
                            </Button>
                            <Button onClick={openRestartConfirm} loading={restartMutation.isPending}>
                              Restart
                            </Button>
                          </Space>
                        </div>
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
                <SectionCard title="Matched Pods" extra={<Tag>{deploymentItem.pods.length}</Tag>}>
                  {deploymentItem.pods.length > 0 ? (
                    <div className="space-y-3">
                      {deploymentItem.pods.map((pod) => (
                        <div
                          key={pod.name}
                          className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{pod.name}</Typography.Text>
                                <Tag color={deploymentPodStatusColor(pod.status)}>{pod.status}</Tag>
                                <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                                  Ready {pod.readyContainers}/{pod.totalContainers}
                                </Tag>
                                <Tag color={restartTone(pod.restartCount)}>
                                  Restarts {pod.restartCount}
                                </Tag>
                              </div>
                              <div className="text-xs text-slate-500">
                                {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? 'Unavailable'} · Memory{' '}
                                {pod.memoryUsage ?? 'Unavailable'}
                              </div>
                            </div>

                            <Button
                              onClick={() => navigate(buildPodRoute(deploymentItem.namespace, pod.name))}
                            >
                              Open Pod
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前 Deployment 没有关联 Pod" />
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
                          {deploymentItem.namespace}/{deploymentItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void deploymentYamlQuery.refetch()}
                            loading={deploymentYamlQuery.isFetching}
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
                      error={allowLiveAccess ? deploymentYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Deployment YAML 加载失败"
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
                    <SectionCard title="Conditions" extra={<Tag>{deploymentItem.conditions.length}</Tag>}>
                      {deploymentItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {deploymentItem.conditions.map((condition) => (
                            <div
                              key={condition.type}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{condition.type}</Typography.Text>
                                <Tag color={deploymentConditionTagColor(condition)}>
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
                        <EmptyState message="当前 Deployment 没有可展示的 conditions" />
                      )}
                    </SectionCard>

                    <SectionCard title="Images" extra={<Tag>{deploymentItem.images.length}</Tag>}>
                      {deploymentItem.images.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {deploymentItem.images.map((image) => (
                            <Tag key={image}>{image}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Deployment 没有可展示的镜像信息" />
                      )}
                    </SectionCard>

                    <SectionCard title="Selector" extra={<Tag>{deploymentItem.selector.length}</Tag>}>
                      {deploymentItem.selector.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {deploymentItem.selector.map((selector) => (
                            <Tag key={selector}>{selector}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Deployment 没有 selector" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Relationships">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={deploymentItem.namespace} />
                        <ContextRow label="Strategy" value={deploymentItem.strategy} />
                        <ContextRow
                          label="Replicas"
                          value={`${deploymentItem.availableReplicas}/${deploymentItem.desiredReplicas}`}
                        />
                        <ContextRow label="Pods" value={`${deploymentItem.podCount}`} />
                        <ContextRow label="Age" value={deploymentItem.age || '-'} />
                        <ContextRow label="Created" value={deploymentItem.createdAt || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{deploymentItem.labels.length}</Tag>}>
                      {deploymentItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {deploymentItem.labels.map((label) => (
                            <Tag key={label}>{label}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Deployment 没有 labels" />
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
        title={`Scale Deployment / ${deploymentItem.namespace}/${deploymentItem.name}`}
        open={scaleOpen}
        onCancel={() => setScaleOpen(false)}
        onOk={() => void scaleMutation.mutateAsync({ replicas: scaleValue })}
        okText="确认"
        cancelText="取消"
        confirmLoading={scaleMutation.isPending}
      >
        <section className="space-y-4">
          <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
            Adjust the Deployment replica target. Current value: {deploymentItem.desiredReplicas}.
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
        title={`Edit Deployment YAML / ${deploymentItem.namespace}/${deploymentItem.name}`}
        resourceKind="Deployment"
        resourceLabel={`${deploymentItem.namespace}/${deploymentItem.name}`}
        result={deploymentYamlEditorQuery.data}
        loading={deploymentYamlEditorQuery.isFetching}
        saving={updateDeploymentYamlMutation.isPending}
        error={deploymentYamlEditorQuery.error}
        errorMessage="Deployment YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void deploymentYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateDeploymentYamlMutation.mutateAsync({ content })}
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
