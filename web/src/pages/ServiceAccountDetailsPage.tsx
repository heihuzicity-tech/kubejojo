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
  SectionCard,
} from '../components/resource-detail/detailShared';
import {
  buildServiceAccountRoute,
  serviceAccountStatusColor,
} from '../components/serviceaccount/serviceAccountShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PodItem,
  type ResourceTextResult,
  type ServiceAccountItem,
  getPods,
  getServiceAccounts,
  getServiceAccountYaml,
  updateServiceAccountYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type ServiceAccountDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function automountColor(value: string) {
  switch (value) {
    case 'Disabled':
      return 'orange';
    case 'Enabled':
      return 'green';
    default:
      return 'blue';
  }
}

export function ServiceAccountDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<ServiceAccountDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const accountsQuery = useQuery({
    queryKey: ['serviceaccount-detail-list', namespace],
    queryFn: () => getServiceAccounts(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const accountItem = useMemo<ServiceAccountItem | undefined>(() => {
    return (accountsQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [accountsQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshAccount = async () => {
    if (allowLiveAccess) {
      await accountsQuery.refetch();
    }
  };

  const podsQuery = useQuery({
    queryKey: ['serviceaccount-detail-pods', namespace],
    queryFn: () => getPods(namespace),
    enabled: allowLiveAccess && Boolean(namespace && accountItem && accountItem.referencedPodCount > 0),
  });

  const accountYamlQuery = useQuery({
    queryKey: ['serviceaccount-detail-yaml', namespace, name],
    queryFn: () => getServiceAccountYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const accountYamlEditorQuery = useQuery({
    queryKey: ['serviceaccount-detail-yaml-editor', namespace, name],
    queryFn: () => getServiceAccountYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateAccountYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateServiceAccountYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshAccount();
      void accountYamlQuery.refetch();
      void accountYamlEditorQuery.refetch();
    },
  });

  const relatedPods = useMemo<PodItem[]>(() => {
    if (!accountItem) {
      return [];
    }

    const podNames = new Set(accountItem.referencedPods);
    return (podsQuery.data ?? []).filter((item) => podNames.has(item.name));
  }, [accountItem, podsQuery.data]);

  const yamlResult: ResourceTextResult | undefined = accountYamlQuery.data;

  if (allowLiveAccess && accountsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 ServiceAccount 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!accountItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && accountsQuery.error ? (
          <Alert type="warning" showIcon message="ServiceAccount 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 ServiceAccount</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/security/serviceaccounts')} icon={<ArrowLeftOutlined />}>
              返回 ServiceAccount 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== accountItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/security/serviceaccounts')}
          >
            返回 ServiceAccount 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {accountItem.name}
              </Typography.Title>
              <Tag color={serviceAccountStatusColor(accountItem.status)}>{accountItem.status}</Tag>
              <Tag color={automountColor(accountItem.automountToken)}>{accountItem.automountToken}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={accountItem.namespace} />
              ) : null}
              <HeaderMeta label="Pods" value={`${accountItem.referencedPodCount}`} />
              <HeaderMeta label="Secrets" value={`${accountItem.secretCount}/${accountItem.imagePullSecretCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ServiceAccountDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Account Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Pods" value={`${accountItem.referencedPodCount}`} />
                        <InlineStat label="Secrets" value={`${accountItem.secretCount}`} />
                        <InlineStat label="Pull Secrets" value={`${accountItem.imagePullSecretCount}`} />
                        <InlineStat label="Automount" value={accountItem.automountToken} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Image Pull Secrets" extra={<Tag>{accountItem.imagePullSecretCount}</Tag>}>
                      {accountItem.imagePullSecrets.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {accountItem.imagePullSecrets.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ServiceAccount 没有关联 imagePullSecrets" />
                      )}
                    </SectionCard>

                    <SectionCard title="Secrets" extra={<Tag>{accountItem.secretCount}</Tag>}>
                      {accountItem.secretNames.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {accountItem.secretNames.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ServiceAccount 没有显式 Secret 引用" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={accountItem.summary} />
                        <ContextRow label="Namespace" value={accountItem.namespace} />
                        <ContextRow label="Automount" value={accountItem.automountToken} />
                        <ContextRow label="Route" value={buildServiceAccountRoute(accountItem.namespace, accountItem.name)} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{accountItem.labels.length}</Tag>}>
                      {accountItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {accountItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ServiceAccount 没有标签" />
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
                          {accountItem.namespace}/{accountItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button onClick={() => void accountYamlQuery.refetch()} loading={accountYamlQuery.isFetching}>
                            Refresh
                          </Button>
                        ) : null}
                        <Button type="primary" onClick={() => setYamlEditOpen(true)} disabled={!allowLiveAccess}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? accountYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="ServiceAccount YAML 加载失败"
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
                            <div key={item.name} className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color={statusColor(item.status)}>{item.status}</Tag>
                                    {item.ownerKind ? <Tag>{item.ownerKind}</Tag> : null}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.nodeName} · Restarts {item.restartCount}
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
                        <EmptyState message="当前 ServiceAccount 还没有被 Pod 使用" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Notes">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Automount" value={accountItem.automountToken} />
                        <ContextRow label="Pods" value={`${accountItem.referencedPodCount}`} />
                        <ContextRow label="Pull Secrets" value={`${accountItem.imagePullSecretCount}`} />
                        <ContextRow label="Secrets" value={`${accountItem.secretCount}`} />
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
        title={`Edit ServiceAccount YAML / ${accountItem.namespace}/${accountItem.name}`}
        resourceKind="ServiceAccount"
        resourceLabel={`${accountItem.namespace}/${accountItem.name}`}
        result={accountYamlEditorQuery.data}
        loading={accountYamlEditorQuery.isFetching}
        saving={updateAccountYamlMutation.isPending}
        error={accountYamlEditorQuery.error}
        errorMessage="ServiceAccount YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void accountYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateAccountYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
