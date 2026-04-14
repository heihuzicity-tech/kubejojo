import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildPodRoute, PodTextViewer, statusColor } from '../components/pod/podShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SearchableKeyList,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildSecretRoute, secretStatusColor } from '../components/secret/secretShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PodItem,
  type ResourceTextResult,
  type SecretItem,
  getPods,
  getSecretYaml,
  getSecrets,
  updateSecretYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type SecretDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function renderTagCollection(items: string[], emptyMessage: string) {
  if (items.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <Space size={[8, 8]} wrap>
      {items.map((item) => (
        <Tag key={item}>{item}</Tag>
      ))}
    </Space>
  );
}

export function SecretDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<SecretDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const secretsQuery = useQuery({
    queryKey: ['secret-detail-list', namespace],
    queryFn: () => getSecrets(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const secretItem = useMemo<SecretItem | undefined>(() => {
    return (secretsQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [name, namespace, secretsQuery.data]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshSecret = async () => {
    if (allowLiveAccess) {
      await secretsQuery.refetch();
    }
  };

  const podsQuery = useQuery({
    queryKey: ['secret-detail-pods', namespace],
    queryFn: () => getPods(namespace),
    enabled: allowLiveAccess && Boolean(namespace && secretItem && secretItem.referencedPodCount > 0),
  });

  const secretYamlQuery = useQuery({
    queryKey: ['secret-detail-yaml', namespace, name],
    queryFn: () => getSecretYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const secretYamlEditorQuery = useQuery({
    queryKey: ['secret-detail-yaml-editor', namespace, name],
    queryFn: () => getSecretYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateSecretYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateSecretYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshSecret();
      void secretYamlQuery.refetch();
      void secretYamlEditorQuery.refetch();
    },
  });

  const relatedPods = useMemo<PodItem[]>(() => {
    if (!secretItem) {
      return [];
    }

    const podNames = new Set(secretItem.referencedPods);
    return (podsQuery.data ?? []).filter((item) => podNames.has(item.name));
  }, [podsQuery.data, secretItem]);

  const yamlResult: ResourceTextResult | undefined = secretYamlQuery.data;

  if (allowLiveAccess && secretsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Secret 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!secretItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && secretsQuery.error ? (
          <Alert type="warning" showIcon message="Secret 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 Secret</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/config/secrets')} icon={<ArrowLeftOutlined />}>
              返回 Secret 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== secretItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/config/secrets')}
          >
            返回 Secret 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {secretItem.name}
              </Typography.Title>
              <Tag color={secretStatusColor(secretItem.status)}>{secretItem.status}</Tag>
              <Tag color="blue">{secretItem.type}</Tag>
              {secretItem.immutable ? <Tag color="geekblue">Immutable</Tag> : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={secretItem.namespace} />
              ) : null}
              <HeaderMeta label="Keys" value={`${secretItem.dataCount}`} />
              <HeaderMeta label="Pods" value={`${secretItem.referencedPodCount}`} />
              <HeaderMeta label="Visibility" value="Values hidden" />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as SecretDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Secret Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Type" value={secretItem.type} />
                        <InlineStat label="Keys" value={`${secretItem.dataCount}`} />
                        <InlineStat label="Used By Pods" value={`${secretItem.referencedPodCount}`} />
                        <InlineStat
                          label="Mode"
                          value={secretItem.immutable ? 'Immutable' : 'Mutable'}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Visible Keys" extra={<Tag>{secretItem.dataCount}</Tag>}>
                      <SearchableKeyList
                        items={secretItem.dataKeys}
                        emptyMessage="当前 Secret 没有可展示的键名"
                        searchPlaceholder="Search secret keys"
                      />
                    </SectionCard>

                    <SectionCard title="Handling Notes">
                      <div className="space-y-3">
                        <Alert
                          type="info"
                          showIcon
                          message="详情页默认只展示键名，不展示 value，避免在日常巡检中泄露敏感信息。"
                        />
                        <Alert
                          type="warning"
                          showIcon
                          message="只有在确有需要时再打开 YAML，Secret 内容仍可能以 base64 形式出现在清单中。"
                        />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={secretItem.summary} />
                        <ContextRow label="Namespace" value={secretItem.namespace} />
                        <ContextRow label="Type" value={secretItem.type} />
                        <ContextRow label="Immutable" value={secretItem.immutable ? 'Yes' : 'No'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{secretItem.labels.length}</Tag>}>
                      {renderTagCollection(secretItem.labels, '当前 Secret 没有标签')}
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
                    <Alert
                      type="warning"
                      showIcon
                      message="Secret YAML 可能包含 base64 编码的数据，请仅在必要时查看或修改。"
                    />

                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <Space wrap>
                        <Tag color="blue">Manifest</Tag>
                        <Typography.Text type="secondary">
                          {secretItem.namespace}/{secretItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void secretYamlQuery.refetch()}
                            loading={secretYamlQuery.isFetching}
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
                      error={allowLiveAccess ? secretYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Secret YAML 加载失败"
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
                        <EmptyState message="当前 Secret 尚未被 Pod 引用" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Reference Notes">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Pods" value={`${secretItem.referencedPodCount}`} />
                        <ContextRow label="Type" value={secretItem.type} />
                        <ContextRow label="Keys" value={`${secretItem.dataCount}`} />
                        <ContextRow label="Visibility" value="Values hidden" />
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
        title={`Edit Secret YAML / ${secretItem.namespace}/${secretItem.name}`}
        resourceKind="Secret"
        resourceLabel={`${secretItem.namespace}/${secretItem.name}`}
        result={secretYamlEditorQuery.data}
        loading={secretYamlEditorQuery.isFetching}
        saving={updateSecretYamlMutation.isPending}
        error={secretYamlEditorQuery.error}
        errorMessage="Secret YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void secretYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateSecretYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
