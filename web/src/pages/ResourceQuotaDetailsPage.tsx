import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildLimitRangeRoute } from '../components/limitrange/limitRangeShared';
import { PodTextViewer } from '../components/pod/podShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import {
  buildResourceQuotaRoute,
  formatResourceQuotaUsagePercent,
  resourceQuotaStatusColor,
  resourceQuotaUsageColor,
} from '../components/resourcequota/resourceQuotaShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  getLimitRanges,
  getResourceQuotaYaml,
  getResourceQuotas,
  updateResourceQuotaYaml,
  type ResourceTextResult,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type ResourceQuotaDetailsTabKey = 'overview' | 'yaml' | 'related';

type ResourceQuotaUsageItem = {
  resource: string;
  used: string;
  hard: string;
  usagePercent?: number | null;
  status?: string;
};

type ResourceQuotaItem = {
  namespace: string;
  name: string;
  status: string;
  summary: string;
  age?: string;
  labels: string[];
  scopes: string[];
  scopeSelectorExpressions: string[];
  usage: ResourceQuotaUsageItem[];
  trackedResourceCount: number;
  exceededResourceCount: number;
};

type LimitRangeReferenceItem = {
  namespace: string;
  name: string;
  status: string;
  summary: string;
  limitCount: number;
  types: string[];
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

function UsageCard({ entry }: { entry: ResourceQuotaUsageItem }) {
  const percent = formatResourceQuotaUsagePercent(entry.usagePercent) ?? '-';

  return (
    <div className="space-y-2 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{entry.resource}</Typography.Text>
        <Tag color={resourceQuotaUsageColor(entry.status)}>{entry.status ?? 'unknown'}</Tag>
        <Tag color="blue">{percent}</Tag>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <InlineStat label="Used" value={entry.used} />
        <InlineStat label="Hard" value={entry.hard} />
      </div>
    </div>
  );
}

export function ResourceQuotaDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<ResourceQuotaDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const resourceQuotasQuery = useQuery<ResourceQuotaItem[]>({
    queryKey: ['resourcequota-detail-list', namespace],
    queryFn: () => getResourceQuotas(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const resourceQuotaItem = useMemo<ResourceQuotaItem | undefined>(() => {
    return (resourceQuotasQuery.data ?? []).find(
      (item) => item.namespace === namespace && item.name === name,
    );
  }, [name, namespace, resourceQuotasQuery.data]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name, namespace]);

  const refreshResourceQuota = async () => {
    if (allowLiveAccess) {
      await resourceQuotasQuery.refetch();
    }
  };

  const siblingLimitRangesQuery = useQuery<LimitRangeReferenceItem[]>({
    queryKey: ['resourcequota-detail-related-limitranges', namespace],
    queryFn: () => getLimitRanges(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const resourceQuotaYamlQuery = useQuery<ResourceTextResult>({
    queryKey: ['resourcequota-detail-yaml', namespace, name],
    queryFn: () => getResourceQuotaYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const resourceQuotaYamlEditorQuery = useQuery<ResourceTextResult>({
    queryKey: ['resourcequota-detail-yaml-editor', namespace, name],
    queryFn: () => getResourceQuotaYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateResourceQuotaYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateResourceQuotaYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshResourceQuota();
      void resourceQuotaYamlQuery.refetch();
      void resourceQuotaYamlEditorQuery.refetch();
    },
  });

  const relatedLimitRanges = useMemo(() => {
    return (siblingLimitRangesQuery.data ?? []).filter((item) => item.namespace === namespace);
  }, [namespace, siblingLimitRangesQuery.data]);

  const yamlResult: ResourceTextResult | undefined = resourceQuotaYamlQuery.data;

  if (allowLiveAccess && resourceQuotasQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 ResourceQuota 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!resourceQuotaItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && resourceQuotasQuery.error ? (
          <Alert type="warning" showIcon message="ResourceQuota 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 ResourceQuota</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/resources/resourcequotas')} icon={<ArrowLeftOutlined />}>
              返回 ResourceQuota 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== resourceQuotaItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/resources/resourcequotas')}
          >
            返回 ResourceQuota 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {resourceQuotaItem.name}
              </Typography.Title>
              <Tag color={resourceQuotaStatusColor(resourceQuotaItem.status)}>
                {resourceQuotaItem.status}
              </Tag>
              <Tag color="blue">Tracked {resourceQuotaItem.trackedResourceCount}</Tag>
              {resourceQuotaItem.exceededResourceCount > 0 ? (
                <Tag color="red">Exceeded {resourceQuotaItem.exceededResourceCount}</Tag>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={resourceQuotaItem.namespace} />
              ) : null}
              <HeaderMeta label="Resources" value={`${resourceQuotaItem.trackedResourceCount}`} />
              <HeaderMeta
                label="Scopes"
                value={`${resourceQuotaItem.scopes.length + resourceQuotaItem.scopeSelectorExpressions.length}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ResourceQuotaDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Quota Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Tracked" value={`${resourceQuotaItem.trackedResourceCount}`} />
                        <InlineStat label="Exceeded" value={`${resourceQuotaItem.exceededResourceCount}`} />
                        <InlineStat
                          label="Scopes"
                          value={`${resourceQuotaItem.scopes.length + resourceQuotaItem.scopeSelectorExpressions.length}`}
                        />
                        <InlineStat label="Labels" value={`${resourceQuotaItem.labels.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Quota Usage" extra={<Tag>{resourceQuotaItem.usage.length}</Tag>}>
                      {resourceQuotaItem.usage.length > 0 ? (
                        <div className="space-y-3">
                          {resourceQuotaItem.usage.map((entry) => (
                            <UsageCard key={entry.resource} entry={entry} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 ResourceQuota 没有可展示的资源配额条目" />
                      )}
                    </SectionCard>

                    <SectionCard title="Scopes">
                      <div className="space-y-4">
                        <div>
                          <div className="mb-2 text-[12px] font-medium text-slate-500">Scopes</div>
                          {renderTagCollection(resourceQuotaItem.scopes, '当前 ResourceQuota 未设置 scopes')}
                        </div>
                        <div>
                          <div className="mb-2 text-[12px] font-medium text-slate-500">
                            Scope Selectors
                          </div>
                          {renderTagCollection(
                            resourceQuotaItem.scopeSelectorExpressions,
                            '当前 ResourceQuota 未设置 scope selector expressions',
                            'purple',
                          )}
                        </div>
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={resourceQuotaItem.summary} />
                        <ContextRow label="Namespace" value={resourceQuotaItem.namespace} />
                        <ContextRow label="Age" value={resourceQuotaItem.age ?? '-'} />
                        <ContextRow
                          label="Route"
                          value={buildResourceQuotaRoute(
                            resourceQuotaItem.namespace,
                            resourceQuotaItem.name,
                          )}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{resourceQuotaItem.labels.length}</Tag>}>
                      {renderTagCollection(resourceQuotaItem.labels, '当前 ResourceQuota 没有标签')}
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
                          {resourceQuotaItem.namespace}/{resourceQuotaItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void resourceQuotaYamlQuery.refetch()}
                            loading={resourceQuotaYamlQuery.isFetching}
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
                      error={resourceQuotaYamlQuery.error}
                      result={yamlResult}
                      errorMessage="ResourceQuota YAML 加载失败"
                      emptyMessage="暂无可展示的 ResourceQuota YAML。"
                    />
                  </section>
                </SectionCard>
              ),
            },
            {
              key: 'related',
              label: 'Related',
              children: (
                <SectionCard title="Related LimitRanges" extra={<Tag>{relatedLimitRanges.length}</Tag>}>
                  {allowLiveAccess && siblingLimitRangesQuery.error ? (
                    <Alert type="warning" showIcon message="关联 LimitRange 加载失败" />
                  ) : null}

                  {relatedLimitRanges.length > 0 ? (
                    <div className="space-y-3">
                      {relatedLimitRanges.map((item) => (
                        <button
                          key={`${item.namespace}/${item.name}`}
                          type="button"
                          className="w-full rounded-[16px] border border-slate-200 bg-white px-4 py-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                          onClick={() => navigate(buildLimitRangeRoute(item.namespace, item.name))}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Typography.Text strong>{item.name}</Typography.Text>
                            <Tag color="blue">Entries {item.limitCount}</Tag>
                            <Tag color="cyan">{item.types.join(', ') || 'Mixed'}</Tag>
                          </div>
                          <div className="mt-2 text-xs text-slate-500">
                            {item.namespace} · {item.summary}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState message="当前命名空间没有可关联展示的 LimitRange" />
                  )}
                </SectionCard>
              ),
            },
          ]}
        />
      </section>

      <ResourceYamlEditorModal
        open={yamlEditOpen}
        title={`Edit ResourceQuota YAML / ${resourceQuotaItem.namespace}/${resourceQuotaItem.name}`}
        resourceKind="ResourceQuota"
        resourceLabel={`${resourceQuotaItem.namespace}/${resourceQuotaItem.name}`}
        result={resourceQuotaYamlEditorQuery.data}
        loading={resourceQuotaYamlEditorQuery.isFetching}
        saving={updateResourceQuotaYamlMutation.isPending}
        error={resourceQuotaYamlEditorQuery.error}
        errorMessage="ResourceQuota YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void resourceQuotaYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateResourceQuotaYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
