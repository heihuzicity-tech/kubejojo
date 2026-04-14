import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildHPARoute,
  buildScaleTargetRoute,
  extractMutationMessage,
  hpaConditionStatusColor,
  hpaStatusColor,
  listHPAs,
  metricPreview,
  readHPAYaml,
  replicaSummary,
  saveHPAYaml,
  targetSummary,
  type HPAConditionItem,
  type HPAItem,
  type HPAMetricItem,
} from '../components/hpa/hpaShared';
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

type HPADetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function MetricCard({ metric }: { metric: HPAMetricItem }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{metric.name}</Typography.Text>
        <Tag color="blue">{metric.type}</Tag>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="text-[12px] font-medium text-slate-500">Current</div>
          <div className="mt-1 text-[13px] font-medium text-slate-900">{metric.current || '-'}</div>
        </div>
        <div>
          <div className="text-[12px] font-medium text-slate-500">Target</div>
          <div className="mt-1 text-[13px] font-medium text-slate-900">{metric.target || '-'}</div>
        </div>
      </div>
      <Typography.Text className="text-xs text-slate-500">{metric.summary}</Typography.Text>
    </div>
  );
}

function ConditionCard({ condition }: { condition: HPAConditionItem }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{condition.type}</Typography.Text>
        <Tag color={hpaConditionStatusColor(condition.status)}>{condition.status}</Tag>
      </div>
      <div className="space-y-1.5 text-xs text-slate-500">
        {condition.reason ? <div>Reason: {condition.reason}</div> : null}
        {condition.message ? <div>{condition.message}</div> : null}
        {condition.lastTransitionTime && condition.lastTransitionTime !== '-' ? (
          <div>Last Transition: {condition.lastTransitionTime}</div>
        ) : null}
      </div>
    </div>
  );
}

export function HPADetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<HPADetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const hpasQuery = useQuery({
    queryKey: ['hpa-detail-list', namespace],
    queryFn: () => listHPAs(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const hpaItem = useMemo<HPAItem | undefined>(() => {
    return (hpasQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [hpasQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshHPA = async () => {
    if (allowLiveAccess) {
      await hpasQuery.refetch();
    }
  };

  const hpaYamlQuery = useQuery({
    queryKey: ['hpa-detail-yaml', namespace, name],
    queryFn: () => readHPAYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const hpaYamlEditorQuery = useQuery({
    queryKey: ['hpa-detail-yaml-editor', namespace, name],
    queryFn: () => readHPAYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateHPAYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => saveHPAYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(extractMutationMessage(result, 'HPA YAML updated'));
      await refreshHPA();
      void hpaYamlQuery.refetch();
      void hpaYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined = hpaYamlQuery.data;

  if (allowLiveAccess && hpasQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 HPA 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!hpaItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && hpasQuery.error ? (
          <Alert type="warning" showIcon message="HPA 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 HPA</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/resources/hpas')} icon={<ArrowLeftOutlined />}>
              返回 HPA 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader = currentNamespace.trim() === '' || currentNamespace !== hpaItem.namespace;
  const scaleTargetRoute = buildScaleTargetRoute(
    hpaItem.namespace,
    hpaItem.scaleTargetKind,
    hpaItem.scaleTargetName,
  );

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/resources/hpas')}
          >
            返回 HPA 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {hpaItem.name}
              </Typography.Title>
              <Tag color={hpaStatusColor(hpaItem.status)}>{hpaItem.status}</Tag>
              <Tag color={hpaItem.currentReplicas === hpaItem.desiredReplicas ? 'green' : 'orange'}>
                {hpaItem.currentReplicas === hpaItem.desiredReplicas ? 'Stable' : 'Scaling'}
              </Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? <HeaderMeta label="Namespace" value={hpaItem.namespace} /> : null}
              <HeaderMeta label="Target" value={targetSummary(hpaItem)} />
              <HeaderMeta label="Replicas" value={`${hpaItem.currentReplicas}/${hpaItem.desiredReplicas}`} />
              <HeaderMeta label="Metrics" value={`${hpaItem.metricCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as HPADetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Autoscaling Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Current" value={`${hpaItem.currentReplicas}`} />
                        <InlineStat label="Desired" value={`${hpaItem.desiredReplicas}`} />
                        <InlineStat label="Min / Max" value={`${hpaItem.minReplicas} / ${hpaItem.maxReplicas}`} />
                        <InlineStat label="Metrics" value={`${hpaItem.metricCount}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Metrics" extra={<Tag>{hpaItem.metricCount}</Tag>}>
                      {hpaItem.metrics.length > 0 ? (
                        <div className="space-y-3">
                          {hpaItem.metrics.map((metric, index) => (
                            <MetricCard key={`${metric.type}-${metric.name}-${index}`} metric={metric} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 HPA 没有可展示的指标配置" />
                      )}
                    </SectionCard>

                    <SectionCard title="Conditions" extra={<Tag>{hpaItem.conditionCount}</Tag>}>
                      {hpaItem.conditions.length > 0 ? (
                        <div className="space-y-3">
                          {hpaItem.conditions.map((condition, index) => (
                            <ConditionCard
                              key={`${condition.type}-${condition.status}-${index}`}
                              condition={condition}
                            />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 HPA 没有条件状态信息" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={hpaItem.summary} />
                        <ContextRow label="Namespace" value={hpaItem.namespace} />
                        <ContextRow label="Scale Target" value={targetSummary(hpaItem)} />
                        <ContextRow label="API Version" value={hpaItem.scaleTargetApiVersion} />
                        <ContextRow label="Last Scale" value={hpaItem.lastScaleTime} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Scaling Strategy">
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                        {hpaItem.behaviorSummary !== '-' ? hpaItem.behaviorSummary : '当前未返回行为策略摘要。'}
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{hpaItem.labels.length}</Tag>}>
                      {hpaItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {hpaItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 HPA 没有标签" />
                      )}
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
                          {hpaItem.namespace}/{hpaItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">Generated: {yamlResult?.generatedAt || '-'}</Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button onClick={() => void hpaYamlQuery.refetch()} loading={hpaYamlQuery.isFetching}>
                            Refresh
                          </Button>
                        ) : null}
                        <Button type="primary" onClick={() => setYamlEditOpen(true)} disabled={!allowLiveAccess}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? hpaYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="HPA YAML 加载失败"
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
                    <SectionCard title="Scale Target" extra={<Tag>{hpaItem.scaleTargetKind}</Tag>}>
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="space-y-1">
                            <Typography.Text strong>{targetSummary(hpaItem)}</Typography.Text>
                            <div className="text-xs text-slate-500">
                              {hpaItem.scaleTargetApiVersion}
                            </div>
                          </div>
                          {scaleTargetRoute ? (
                            <Button onClick={() => navigate(scaleTargetRoute)}>Open Target</Button>
                          ) : (
                            <Tag>Unsupported Route</Tag>
                          )}
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard title="Metric Snapshot" extra={<Tag>{hpaItem.metricCount}</Tag>}>
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                        {metricPreview(hpaItem.metrics)}
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Replica Window">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Current / Desired" value={`${hpaItem.currentReplicas} / ${hpaItem.desiredReplicas}`} />
                        <ContextRow label="Range" value={`${hpaItem.minReplicas} - ${hpaItem.maxReplicas}`} />
                        <ContextRow label="Summary" value={replicaSummary(hpaItem)} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Detail Route">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="HPA" value={buildHPARoute(hpaItem.namespace, hpaItem.name)} />
                        {scaleTargetRoute ? <ContextRow label="Target" value={scaleTargetRoute} /> : null}
                      </div>
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
        title={`Edit HPA YAML / ${hpaItem.namespace}/${hpaItem.name}`}
        resourceKind="HorizontalPodAutoscaler"
        resourceLabel={`${hpaItem.namespace}/${hpaItem.name}`}
        result={hpaYamlEditorQuery.data}
        loading={hpaYamlEditorQuery.isFetching}
        saving={updateHPAYamlMutation.isPending}
        error={hpaYamlEditorQuery.error}
        errorMessage="HPA YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void hpaYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateHPAYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
