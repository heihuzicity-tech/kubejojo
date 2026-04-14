import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildLimitRangeRoute, limitRangeStatusColor } from '../components/limitrange/limitRangeShared';
import { PodTextViewer } from '../components/pod/podShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildResourceQuotaRoute } from '../components/resourcequota/resourceQuotaShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  getLimitRangeYaml,
  getLimitRanges,
  getResourceQuotas,
  updateLimitRangeYaml,
  type ResourceTextResult,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type LimitRangeDetailsTabKey = 'overview' | 'yaml' | 'related';

type LimitRangeEntryItem = {
  type: string;
  summary: string;
  min: string[];
  max: string[];
  default: string[];
  defaultRequest: string[];
  maxLimitRequestRatio: string[];
};

type LimitRangeItem = {
  namespace: string;
  name: string;
  status: string;
  summary: string;
  age?: string;
  labels: string[];
  types: string[];
  limitCount: number;
  limits: LimitRangeEntryItem[];
};

type ResourceQuotaReferenceItem = {
  namespace: string;
  name: string;
  status: string;
  summary: string;
  trackedResourceCount: number;
  exceededResourceCount: number;
};

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
      <div className="mt-2">
        {items.length > 0 ? (
          <Space size={[8, 8]} wrap>
            {items.map((item) => (
              <Tag key={`${title}-${item}`} color={color}>
                {item}
              </Tag>
            ))}
          </Space>
        ) : (
          <Typography.Text type="secondary" className="text-xs">
            {emptyText}
          </Typography.Text>
        )}
      </div>
    </div>
  );
}

function LimitEntryCard({ item, index }: { item: LimitRangeEntryItem; index: number }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{`Entry ${index + 1}`}</Typography.Text>
        <Tag color="blue">{item.type}</Tag>
        <Tag color="cyan">{item.summary || 'Limit policy'}</Tag>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <EntryBlock title="Min" items={item.min} color="geekblue" emptyText="No minimum limits" />
        <EntryBlock title="Max" items={item.max} color="blue" emptyText="No maximum limits" />
        <EntryBlock title="Default" items={item.default} color="green" emptyText="No default limits" />
        <EntryBlock
          title="Default Request"
          items={item.defaultRequest}
          color="cyan"
          emptyText="No default requests"
        />
      </div>

      <EntryBlock
        title="Max Limit / Request Ratio"
        items={item.maxLimitRequestRatio}
        color="purple"
        emptyText="No ratio rules"
      />
    </div>
  );
}

export function LimitRangeDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<LimitRangeDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const limitRangesQuery = useQuery<LimitRangeItem[]>({
    queryKey: ['limitrange-detail-list', namespace],
    queryFn: () => getLimitRanges(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const limitRangeItem = useMemo<LimitRangeItem | undefined>(() => {
    return (limitRangesQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [limitRangesQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name, namespace]);

  const refreshLimitRange = async () => {
    if (allowLiveAccess) {
      await limitRangesQuery.refetch();
    }
  };

  const siblingResourceQuotasQuery = useQuery<ResourceQuotaReferenceItem[]>({
    queryKey: ['limitrange-detail-related-resourcequotas', namespace],
    queryFn: () => getResourceQuotas(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const limitRangeYamlQuery = useQuery<ResourceTextResult>({
    queryKey: ['limitrange-detail-yaml', namespace, name],
    queryFn: () => getLimitRangeYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const limitRangeYamlEditorQuery = useQuery<ResourceTextResult>({
    queryKey: ['limitrange-detail-yaml-editor', namespace, name],
    queryFn: () => getLimitRangeYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateLimitRangeYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateLimitRangeYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshLimitRange();
      void limitRangeYamlQuery.refetch();
      void limitRangeYamlEditorQuery.refetch();
    },
  });

  const relatedResourceQuotas = useMemo(() => {
    return (siblingResourceQuotasQuery.data ?? []).filter((item) => item.namespace === namespace);
  }, [namespace, siblingResourceQuotasQuery.data]);

  const yamlResult: ResourceTextResult | undefined = limitRangeYamlQuery.data;

  if (allowLiveAccess && limitRangesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 LimitRange 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!limitRangeItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && limitRangesQuery.error ? (
          <Alert type="warning" showIcon message="LimitRange 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 LimitRange</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/resources/limitranges')} icon={<ArrowLeftOutlined />}>
              返回 LimitRange 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== limitRangeItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/resources/limitranges')}
          >
            返回 LimitRange 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {limitRangeItem.name}
              </Typography.Title>
              <Tag color={limitRangeStatusColor(limitRangeItem.status)}>{limitRangeItem.status}</Tag>
              <Tag color="blue">Entries {limitRangeItem.limitCount}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={limitRangeItem.namespace} />
              ) : null}
              <HeaderMeta label="Types" value={`${limitRangeItem.types.length}`} />
              <HeaderMeta label="Labels" value={`${limitRangeItem.labels.length}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as LimitRangeDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Policy Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Entries" value={`${limitRangeItem.limitCount}`} />
                        <InlineStat label="Types" value={`${limitRangeItem.types.length}`} />
                        <InlineStat
                          label="Defaults"
                          value={`${
                            limitRangeItem.limits.filter(
                              (item) => item.default.length > 0 || item.defaultRequest.length > 0,
                            ).length
                          }`}
                        />
                        <InlineStat
                          label="Ratios"
                          value={`${
                            limitRangeItem.limits.filter(
                              (item) => item.maxLimitRequestRatio.length > 0,
                            ).length
                          }`}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Limit Entries" extra={<Tag>{limitRangeItem.limitCount}</Tag>}>
                      {limitRangeItem.limits.length > 0 ? (
                        <div className="space-y-3">
                          {limitRangeItem.limits.map((item, index) => (
                            <LimitEntryCard key={`${item.type}-${index}`} item={item} index={index} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 LimitRange 没有可展示的 limit 条目" />
                      )}
                    </SectionCard>

                    <SectionCard title="Covered Types">
                      {renderTagCollection(limitRangeItem.types, '当前 LimitRange 没有显式类型范围', 'blue')}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={limitRangeItem.summary} />
                        <ContextRow label="Namespace" value={limitRangeItem.namespace} />
                        <ContextRow label="Age" value={limitRangeItem.age ?? '-'} />
                        <ContextRow
                          label="Route"
                          value={buildLimitRangeRoute(limitRangeItem.namespace, limitRangeItem.name)}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{limitRangeItem.labels.length}</Tag>}>
                      {renderTagCollection(limitRangeItem.labels, '当前 LimitRange 没有标签')}
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
                          {limitRangeItem.namespace}/{limitRangeItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void limitRangeYamlQuery.refetch()}
                            loading={limitRangeYamlQuery.isFetching}
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
                      error={limitRangeYamlQuery.error}
                      result={yamlResult}
                      errorMessage="LimitRange YAML 加载失败"
                      emptyMessage="暂无可展示的 LimitRange YAML。"
                    />
                  </section>
                </SectionCard>
              ),
            },
            {
              key: 'related',
              label: 'Related',
              children: (
                <SectionCard
                  title="Related ResourceQuotas"
                  extra={<Tag>{relatedResourceQuotas.length}</Tag>}
                >
                  {allowLiveAccess && siblingResourceQuotasQuery.error ? (
                    <Alert type="warning" showIcon message="关联 ResourceQuota 加载失败" />
                  ) : null}

                  {relatedResourceQuotas.length > 0 ? (
                    <div className="space-y-3">
                      {relatedResourceQuotas.map((item) => (
                        <button
                          key={`${item.namespace}/${item.name}`}
                          type="button"
                          className="w-full rounded-[16px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => navigate(buildResourceQuotaRoute(item.namespace, item.name))}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Typography.Text strong>{item.name}</Typography.Text>
                            <Tag color="blue">Tracked {item.trackedResourceCount}</Tag>
                            <Tag color={item.exceededResourceCount > 0 ? 'red' : 'green'}>
                              Exceeded {item.exceededResourceCount}
                            </Tag>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            {item.namespace} · {item.summary}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前命名空间没有可关联展示的 ResourceQuota" />
                  )}
                </SectionCard>
              ),
            },
          ]}
        />
      </section>

      <ResourceYamlEditorModal
        open={yamlEditOpen}
        title={`Edit LimitRange YAML / ${limitRangeItem.namespace}/${limitRangeItem.name}`}
        resourceKind="LimitRange"
        resourceLabel={`${limitRangeItem.namespace}/${limitRangeItem.name}`}
        result={limitRangeYamlEditorQuery.data}
        loading={limitRangeYamlEditorQuery.isFetching}
        saving={updateLimitRangeYamlMutation.isPending}
        error={limitRangeYamlEditorQuery.error}
        errorMessage="LimitRange YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void limitRangeYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateLimitRangeYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
