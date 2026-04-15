import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildHPARoute, hpaStatusColor, listHPAs, type HPAItem } from '../components/hpa/hpaShared';
import { PodTextViewer } from '../components/pod/podShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import type { ResourceTextResult } from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import {
  buildScaleTargetRoute,
  buildVPARoute,
  extractMutationMessage,
  formatRecommendationItems,
  listVPAs,
  readVPAReadiness,
  readVPAYaml,
  saveVPAYaml,
  targetSummary,
  vpaConditionStatusColor,
  vpaInsightColor,
  vpaStatusColor,
  type VPAClusterReadinessCheck,
  type VPAConditionItem,
  type VPAContainerPolicyItem,
  type VPAInsightItem,
  type VPAItem,
  type VPARecommendationItem,
} from '../components/vpa/vpaShared';

type VPADetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function renderTagCollection(items: string[], emptyMessage: string, color?: string) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <Space size={[8, 8]} wrap>
      {items.map((item) => (
        <Tag key={item} color={color}>
          {item}
        </Tag>
      ))}
    </Space>
  );
}

function EntryBlock({
  title,
  items,
  color,
  emptyText,
}: {
  title: string;
  items: string[];
  color?: string;
  emptyText: string;
}) {
  return (
    <div>
      <div className="text-[12px] font-medium text-slate-500">{title}</div>
      <div className="mt-2">{renderTagCollection(items, emptyText, color)}</div>
    </div>
  );
}

function RecommendationCard({ item }: { item: VPARecommendationItem }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{item.containerName}</Typography.Text>
        <Tag color="blue">{item.summary}</Tag>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <EntryBlock title="Target" items={item.target} color="green" emptyText="No target recommendation" />
        <EntryBlock
          title="Lower Bound"
          items={item.lowerBound}
          color="cyan"
          emptyText="No lower bound"
        />
        <EntryBlock
          title="Upper Bound"
          items={item.upperBound}
          color="geekblue"
          emptyText="No upper bound"
        />
        <EntryBlock
          title="Uncapped Target"
          items={item.uncappedTarget}
          color="purple"
          emptyText="No uncapped target"
        />
      </div>
    </div>
  );
}

function PolicyCard({ item }: { item: VPAContainerPolicyItem }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{item.containerName}</Typography.Text>
        <Tag color="blue">{item.mode || 'Default'}</Tag>
        {item.controlledValues ? <Tag color="cyan">{item.controlledValues}</Tag> : null}
      </div>

      <Typography.Text className="text-xs text-slate-500">{item.summary}</Typography.Text>

      <div className="grid gap-4 xl:grid-cols-2">
        <EntryBlock
          title="Controlled Resources"
          items={item.controlledResources}
          color="blue"
          emptyText="Default resource set"
        />
        <EntryBlock title="Min Allowed" items={item.minAllowed} color="green" emptyText="No minimum" />
        <EntryBlock title="Max Allowed" items={item.maxAllowed} color="orange" emptyText="No maximum" />
      </div>
    </div>
  );
}

function ConditionCard({ item }: { item: VPAConditionItem }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{item.type}</Typography.Text>
        <Tag color={vpaConditionStatusColor(item.status)}>{item.status}</Tag>
      </div>
      <div className="space-y-1.5 text-xs text-slate-500">
        {item.reason ? <div>Reason: {item.reason}</div> : null}
        {item.message ? <div>{item.message}</div> : null}
        {item.lastTransitionTime ? <div>Last Transition: {item.lastTransitionTime}</div> : null}
      </div>
    </div>
  );
}

function InsightCard({ item }: { item: VPAInsightItem }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={vpaInsightColor(item.level)}>{item.level}</Tag>
        <Typography.Text strong>{item.summary}</Typography.Text>
      </div>
      {item.detail ? <div className="text-xs leading-5 text-slate-500">{item.detail}</div> : null}
    </div>
  );
}

function ReadinessCheckRow({ item }: { item: VPAClusterReadinessCheck }) {
  return (
    <div className="space-y-1 rounded-[14px] border border-slate-200 bg-white px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography.Text strong>{item.label}</Typography.Text>
        <Tag color={vpaStatusColor(item.status)}>{item.status}</Tag>
      </div>
      <div className="text-sm text-slate-700">{item.summary}</div>
      {item.detail ? <div className="text-xs leading-5 text-slate-500">{item.detail}</div> : null}
    </div>
  );
}

export function VPADetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<VPADetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const vpasQuery = useQuery({
    queryKey: ['vpa-detail-list', namespace],
    queryFn: () => listVPAs(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const readinessQuery = useQuery({
    queryKey: ['vpa-detail-readiness'],
    queryFn: () => readVPAReadiness(),
    enabled: allowLiveAccess,
  });

  const vpaItem = useMemo<VPAItem | undefined>(() => {
    return (vpasQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [name, namespace, vpasQuery.data]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name, namespace]);

  const refreshVPA = async () => {
    if (allowLiveAccess) {
      await vpasQuery.refetch();
    }
  };

  const vpaYamlQuery = useQuery({
    queryKey: ['vpa-detail-yaml', namespace, name],
    queryFn: () => readVPAYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const vpaYamlEditorQuery = useQuery({
    queryKey: ['vpa-detail-yaml-editor', namespace, name],
    queryFn: () => readVPAYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const relatedHPAsQuery = useQuery({
    queryKey: ['vpa-detail-related-hpas', namespace],
    queryFn: () => listHPAs(namespace),
    enabled: allowLiveAccess && activeTab === 'related' && Boolean(namespace),
  });

  const updateVPAYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => saveVPAYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(extractMutationMessage(result, 'VPA YAML updated'));
      await refreshVPA();
      void vpaYamlQuery.refetch();
      void vpaYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined = vpaYamlQuery.data;

  if (allowLiveAccess && vpasQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 VPA 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!vpaItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && vpasQuery.error ? (
          <Alert type="warning" showIcon message="VPA 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span className="text-sm text-slate-500">
                未找到这个 VPA。若当前集群未安装 VPA CRD，这个页面不会有可用数据。
              </span>
            }
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/resources/vpas')} icon={<ArrowLeftOutlined />}>
              返回 VPA 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader = currentNamespace.trim() === '' || currentNamespace !== vpaItem.namespace;
  const scaleTargetRoute = buildScaleTargetRoute(
    vpaItem.namespace,
    vpaItem.scaleTargetKind,
    vpaItem.scaleTargetName,
  );
  const relatedHPAs = (relatedHPAsQuery.data ?? []).filter(
    (item: HPAItem) =>
      item.namespace === vpaItem.namespace &&
      item.scaleTargetKind.toLowerCase() === vpaItem.scaleTargetKind.toLowerCase() &&
      item.scaleTargetName === vpaItem.scaleTargetName,
  );
  const readinessChecks = readinessQuery.data?.checks ?? [];
  const failingReadinessChecks = readinessChecks.filter((item) => item.status !== 'healthy');

  return (
    <section className="space-y-4">
      {allowLiveAccess && readinessQuery.data && readinessQuery.data.status !== 'healthy' ? (
        <Alert
          type={readinessQuery.data.status === 'error' ? 'error' : 'warning'}
          showIcon
          message={`VPA readiness: ${readinessQuery.data.summary}`}
        />
      ) : null}

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/resources/vpas')}
          >
            返回 VPA 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {vpaItem.name}
              </Typography.Title>
              <Tag color={vpaStatusColor(vpaItem.status)}>{vpaItem.status}</Tag>
              <Tag color={vpaStatusColor(vpaItem.effectivenessStatus)}>{vpaItem.effectivenessStatus}</Tag>
              <Tag color="blue">{vpaItem.updateMode}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? <HeaderMeta label="Namespace" value={vpaItem.namespace} /> : null}
              <HeaderMeta label="Target" value={targetSummary(vpaItem)} />
              <HeaderMeta label="Applied Pods" value={`${vpaItem.appliedPodCount}/${vpaItem.matchedPodCount}`} />
              <HeaderMeta label="Recommendations" value={`${vpaItem.recommendationCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as VPADetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Autoscaling Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Update Mode" value={vpaItem.updateMode} />
                        <InlineStat label="Policies" value={`${vpaItem.containerPolicyCount}`} />
                        <InlineStat label="Recommendations" value={`${vpaItem.recommendationCount}`} />
                        <InlineStat label="Conditions" value={`${vpaItem.conditionCount}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Apply Status">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Effective" value={vpaItem.effectivenessStatus} />
                        <InlineStat label="Applied Pods" value={`${vpaItem.appliedPodCount}`} />
                        <InlineStat label="Matched Pods" value={`${vpaItem.matchedPodCount}`} />
                        <InlineStat
                          label="Target Replicas"
                          value={vpaItem.targetReplicaCount > 0 ? `${vpaItem.targetReplicaCount}` : '-'}
                        />
                      </div>
                      <div className="rounded-[14px] border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-600">
                        {vpaItem.effectivenessSummary}
                      </div>
                    </SectionCard>

                    <SectionCard title="Insights" extra={<Tag>{vpaItem.insights.length}</Tag>}>
                      {vpaItem.insights.length > 0 ? (
                        <div className="space-y-3">
                          {vpaItem.insights.map((item) => (
                            <InsightCard key={`${item.code}-${item.level}`} item={item} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="No rollout insight is currently available for this VPA." />
                      )}
                    </SectionCard>

                    <SectionCard
                      title="Container Recommendations"
                      extra={<Tag>{vpaItem.recommendationCount}</Tag>}
                    >
                      {vpaItem.recommendations.length > 0 ? (
                        <div className="space-y-3">
                          {vpaItem.recommendations.map((item) => (
                            <RecommendationCard key={item.containerName} item={item} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 VPA 还没有生成容器推荐。可能是 VPA 刚创建、没有历史样本，或 CRD 控制器尚未运行。" />
                      )}
                    </SectionCard>

                    <SectionCard title="Resource Policies" extra={<Tag>{vpaItem.containerPolicyCount}</Tag>}>
                      {vpaItem.resourcePolicies.length > 0 ? (
                        <div className="space-y-3">
                          {vpaItem.resourcePolicies.map((item) => (
                            <PolicyCard key={item.containerName} item={item} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 VPA 没有显式容器策略，表示使用默认推荐行为。" />
                      )}
                    </SectionCard>

                    <SectionCard title="Conditions" extra={<Tag>{vpaItem.conditionCount}</Tag>}>
                      {vpaItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {vpaItem.conditions.map((item) => (
                            <ConditionCard key={`${item.type}-${item.status}`} item={item} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 VPA 没有条件状态信息。" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard
                      title="Cluster Readiness"
                      extra={readinessQuery.data ? <Tag color={vpaStatusColor(readinessQuery.data.status)}>{readinessQuery.data.status}</Tag> : null}
                    >
                      {allowLiveAccess && readinessQuery.error ? (
                        <Alert type="warning" showIcon message="VPA readiness 加载失败" />
                      ) : null}

                      {readinessChecks.length > 0 ? (
                        <div className="space-y-3">
                          <div className="rounded-[14px] border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-600">
                            {readinessQuery.data?.summary}
                          </div>
                          {(failingReadinessChecks.length > 0 ? failingReadinessChecks : readinessChecks).map((item) => (
                            <ReadinessCheckRow key={item.key} item={item} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="No readiness diagnostics available." />
                      )}
                    </SectionCard>

                    <SectionCard title="Target Workload">
                      <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                        <InlineStat label="Kind" value={vpaItem.scaleTargetKind} />
                        <InlineStat label="Name" value={vpaItem.scaleTargetName} />
                        <InlineStat label="API Version" value={vpaItem.scaleTargetApiVersion || '-'} />
                        {scaleTargetRoute ? (
                          <Button type="primary" block onClick={() => navigate(scaleTargetRoute)}>
                            打开目标工作负载
                          </Button>
                        ) : (
                          <Typography.Text type="secondary" className="text-xs">
                            当前目标类型暂未接入详情跳转。
                          </Typography.Text>
                        )}
                      </div>
                    </SectionCard>

                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={vpaItem.summary} />
                        <ContextRow label="Namespace" value={vpaItem.namespace} />
                        <ContextRow label="Age" value={vpaItem.age ?? '-'} />
                        <ContextRow label="Route" value={buildVPARoute(vpaItem.namespace, vpaItem.name)} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{vpaItem.labels.length}</Tag>}>
                      {renderTagCollection(vpaItem.labels, '当前 VPA 没有标签')}
                    </SectionCard>
                  </div>
                </div>
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
                          {vpaItem.namespace}/{vpaItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void vpaYamlQuery.refetch()}
                            loading={vpaYamlQuery.isFetching}
                          >
                            Refresh YAML
                          </Button>
                        ) : null}
                        {allowLiveAccess ? (
                          <Button type="primary" onClick={() => setYamlEditOpen(true)}>
                            Edit YAML
                          </Button>
                        ) : null}
                      </Space>
                    </div>

                    <PodTextViewer
                      error={vpaYamlQuery.error}
                      result={yamlResult}
                      errorMessage="VPA YAML 加载失败"
                      emptyMessage="暂无可展示的 VPA YAML。"
                    />
                  </section>
                </SectionCard>
              ),
            },
            {
              key: 'related',
              label: 'Related',
              children: (
                <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
                  <SectionCard title="Target Workload">
                    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                      <Typography.Text strong>{targetSummary(vpaItem)}</Typography.Text>
                      <Typography.Text type="secondary" className="text-xs">
                        API Version: {vpaItem.scaleTargetApiVersion || '-'}
                      </Typography.Text>
                      {scaleTargetRoute ? (
                        <Button type="primary" block onClick={() => navigate(scaleTargetRoute)}>
                          打开目标工作负载
                        </Button>
                      ) : (
                        <Typography.Text type="secondary" className="text-xs">
                          当前目标类型暂未接入详情跳转。
                        </Typography.Text>
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard title="Related HPAs" extra={<Tag>{relatedHPAs.length}</Tag>}>
                    {allowLiveAccess && relatedHPAsQuery.error ? (
                      <Alert type="warning" showIcon message="关联 HPA 加载失败" />
                    ) : null}

                    {relatedHPAs.length > 0 ? (
                      <div className="space-y-3">
                        {relatedHPAs.map((item) => (
                          <div
                            key={`${item.namespace}/${item.name}`}
                            className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="space-y-1">
                                <Typography.Text strong>{item.name}</Typography.Text>
                                <div className="text-xs text-slate-500">{item.summary}</div>
                              </div>
                              <Button onClick={() => navigate(buildHPARoute(item.namespace, item.name))}>
                                打开 HPA
                              </Button>
                            </div>
                            <Space size={[6, 6]} wrap>
                              <Tag color={hpaStatusColor(item.status)}>{item.status}</Tag>
                              <Tag color="blue">Metrics {item.metricCount}</Tag>
                              <Tag color="cyan">{formatRecommendationItems(item.metrics.map((metric) => metric.target))}</Tag>
                            </Space>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState message="当前目标工作负载没有关联的 HPA。" />
                    )}
                  </SectionCard>
                </div>
              ),
            },
          ]}
        />
      </section>

      <ResourceYamlEditorModal
        open={yamlEditOpen}
        title={`Edit VPA YAML / ${vpaItem.namespace}/${vpaItem.name}`}
        resourceKind="VerticalPodAutoscaler"
        resourceLabel={`${vpaItem.namespace}/${vpaItem.name}`}
        result={vpaYamlEditorQuery.data}
        loading={vpaYamlEditorQuery.isFetching}
        saving={updateVPAYamlMutation.isPending}
        error={vpaYamlEditorQuery.error}
        errorMessage="VPA YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void vpaYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateVPAYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
