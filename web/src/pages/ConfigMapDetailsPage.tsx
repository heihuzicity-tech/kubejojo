import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildConfigMapRoute,
  configMapStatusColor,
} from '../components/configmap/configMapShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SearchableKeyList,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildPodRoute, PodTextViewer, statusColor } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ConfigMapItem,
  type PodItem,
  type ResourceTextResult,
  getConfigMapYaml,
  getConfigMaps,
  getPods,
  updateConfigMapYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type ConfigMapDetailsTabKey = 'overview' | 'yaml' | 'related';

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

export function ConfigMapDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<ConfigMapDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const configMapsQuery = useQuery({
    queryKey: ['configmap-detail-list', namespace],
    queryFn: () => getConfigMaps(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const configMapItem = useMemo<ConfigMapItem | undefined>(() => {
    return (configMapsQuery.data ?? []).find(
      (item) => item.namespace === namespace && item.name === name,
    );
  }, [configMapsQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshConfigMap = async () => {
    if (allowLiveAccess) {
      await configMapsQuery.refetch();
    }
  };

  const podsQuery = useQuery({
    queryKey: ['configmap-detail-pods', namespace],
    queryFn: () => getPods(namespace),
    enabled: allowLiveAccess && Boolean(namespace && configMapItem && configMapItem.referencedPodCount > 0),
  });

  const configMapYamlQuery = useQuery({
    queryKey: ['configmap-detail-yaml', namespace, name],
    queryFn: () => getConfigMapYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const configMapYamlEditorQuery = useQuery({
    queryKey: ['configmap-detail-yaml-editor', namespace, name],
    queryFn: () => getConfigMapYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateConfigMapYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateConfigMapYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshConfigMap();
      void configMapYamlQuery.refetch();
      void configMapYamlEditorQuery.refetch();
    },
  });

  const relatedPods = useMemo<PodItem[]>(() => {
    if (!configMapItem) {
      return [];
    }

    const podNames = new Set(configMapItem.referencedPods);
    return (podsQuery.data ?? []).filter((item) => podNames.has(item.name));
  }, [configMapItem, podsQuery.data]);

  const yamlResult: ResourceTextResult | undefined = configMapYamlQuery.data;

  if (allowLiveAccess && configMapsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 ConfigMap 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!configMapItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && configMapsQuery.error ? (
          <Alert type="warning" showIcon message="ConfigMap 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 ConfigMap</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/config/configmaps')} icon={<ArrowLeftOutlined />}>
              返回 ConfigMap 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== configMapItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/config/configmaps')}
          >
            返回 ConfigMap 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {configMapItem.name}
              </Typography.Title>
              <Tag color={configMapStatusColor(configMapItem.status)}>{configMapItem.status}</Tag>
              {configMapItem.immutable ? <Tag color="blue">Immutable</Tag> : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={configMapItem.namespace} />
              ) : null}
              <HeaderMeta label="Data" value={`${configMapItem.dataCount}`} />
              <HeaderMeta label="Binary" value={`${configMapItem.binaryDataCount}`} />
              <HeaderMeta label="Pods" value={`${configMapItem.referencedPodCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ConfigMapDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Config Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Data Keys" value={`${configMapItem.dataCount}`} />
                        <InlineStat label="Binary Keys" value={`${configMapItem.binaryDataCount}`} />
                        <InlineStat label="Used By Pods" value={`${configMapItem.referencedPodCount}`} />
                        <InlineStat
                          label="Mode"
                          value={configMapItem.immutable ? 'Immutable' : 'Mutable'}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Data Keys" extra={<Tag>{configMapItem.dataCount}</Tag>}>
                      <SearchableKeyList
                        items={configMapItem.dataKeys}
                        emptyMessage="当前 ConfigMap 没有 data 键"
                        searchPlaceholder="Search data keys"
                      />
                    </SectionCard>

                    <SectionCard title="Binary Data" extra={<Tag>{configMapItem.binaryDataCount}</Tag>}>
                      <SearchableKeyList
                        items={configMapItem.binaryDataKeys}
                        emptyMessage="当前 ConfigMap 没有 binaryData 键"
                        searchPlaceholder="Search binary keys"
                      />
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={configMapItem.summary} />
                        <ContextRow label="Namespace" value={configMapItem.namespace} />
                        <ContextRow
                          label="Immutable"
                          value={configMapItem.immutable ? 'Yes' : 'No'}
                        />
                        <ContextRow
                          label="Route"
                          value={buildConfigMapRoute(configMapItem.namespace, configMapItem.name)}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{configMapItem.labels.length}</Tag>}>
                      {renderTagCollection(configMapItem.labels, '当前 ConfigMap 没有标签')}
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
                          {configMapItem.namespace}/{configMapItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void configMapYamlQuery.refetch()}
                            loading={configMapYamlQuery.isFetching}
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
                      error={allowLiveAccess ? configMapYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="ConfigMap YAML 加载失败"
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
                    {allowLiveAccess && podsQuery.error ? (
                      <Alert type="warning" showIcon message="关联 Pod 数据加载失败" />
                    ) : null}

                    <SectionCard title="Referenced Pods" extra={<Tag>{relatedPods.length}</Tag>}>
                      {relatedPods.length > 0 ? (
                        <div className="space-y-3">
                          {relatedPods.map((item) => (
                            <div
                              key={item.name}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color={statusColor(item.status)}>{item.status}</Tag>
                                    {item.ownerKind && item.ownerName ? (
                                      <Tag>{item.ownerKind}</Tag>
                                    ) : null}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.nodeName} · Restarts {item.restartCount} · {item.ownerKind || 'Pod'}{' '}
                                    {item.ownerName || item.name}
                                  </div>
                                </div>

                                <Button onClick={() => navigate(buildPodRoute(item.namespace, item.name))}>
                                  Open Pod
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 ConfigMap 尚未被 Pod 引用" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Reference Notes">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Pods" value={`${configMapItem.referencedPodCount}`} />
                        <ContextRow label="Data Keys" value={`${configMapItem.dataCount}`} />
                        <ContextRow label="Binary Keys" value={`${configMapItem.binaryDataCount}`} />
                        <ContextRow label="Immutable" value={configMapItem.immutable ? 'Yes' : 'No'} />
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
        title={`Edit ConfigMap YAML / ${configMapItem.namespace}/${configMapItem.name}`}
        resourceKind="ConfigMap"
        resourceLabel={`${configMapItem.namespace}/${configMapItem.name}`}
        result={configMapYamlEditorQuery.data}
        loading={configMapYamlEditorQuery.isFetching}
        saving={updateConfigMapYamlMutation.isPending}
        error={configMapYamlEditorQuery.error}
        errorMessage="ConfigMap YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void configMapYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateConfigMapYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
