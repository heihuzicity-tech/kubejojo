import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildIngressClassRoute,
  ingressClassStatusColor,
} from '../components/ingressclass/ingressClassShared';
import { buildIngressRoute, ingressStatusColor } from '../components/ingress/ingressShared';
import {
  ContextRow,
  EmptyState,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type IngressClassItem,
  type IngressItem,
  type ResourceTextResult,
  getIngressClassYaml,
  getIngressClasses,
  getIngresses,
  updateIngressClassYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type IngressClassDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function parameterScope(item: IngressClassItem) {
  return item.parameters?.scope || 'Cluster';
}

function parameterReference(item: IngressClassItem) {
  if (!item.parameters) {
    return '-';
  }

  const namespace = item.parameters.namespace ? `${item.parameters.namespace}/` : '';
  return `${item.parameters.kind} ${namespace}${item.parameters.name}`;
}

export function IngressClassDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);

  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<IngressClassDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const classesQuery = useQuery({
    queryKey: ['ingressclass-detail-list'],
    queryFn: () => getIngressClasses(),
    enabled: allowLiveAccess,
  });

  const ingressesQuery = useQuery({
    queryKey: ['ingressclass-detail-ingresses'],
    queryFn: () => getIngresses(),
    enabled: allowLiveAccess,
  });

  const ingressClassItem = useMemo<IngressClassItem | undefined>(() => {
    return (classesQuery.data ?? []).find((item) => item.name === name);
  }, [classesQuery.data, name]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name]);

  const refreshIngressClass = async () => {
    if (allowLiveAccess) {
      await classesQuery.refetch();
      await ingressesQuery.refetch();
    }
  };

  const ingressClassYamlQuery = useQuery({
    queryKey: ['ingressclass-detail-yaml', name],
    queryFn: () => getIngressClassYaml(name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(name),
  });

  const ingressClassYamlEditorQuery = useQuery({
    queryKey: ['ingressclass-detail-yaml-editor', name],
    queryFn: () => getIngressClassYaml(name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(name),
  });

  const updateIngressClassYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateIngressClassYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshIngressClass();
      void ingressClassYamlQuery.refetch();
      void ingressClassYamlEditorQuery.refetch();
    },
  });

  const relatedIngresses = useMemo<IngressItem[]>(() => {
    if (!ingressClassItem) {
      return [];
    }

    return (ingressesQuery.data ?? []).filter((item) => {
      if (item.ingressClass === ingressClassItem.name) {
        return true;
      }
      return ingressClassItem.isDefault && item.ingressClass === '-';
    });
  }, [ingressClassItem, ingressesQuery.data]);

  const yamlResult: ResourceTextResult | undefined = ingressClassYamlQuery.data;

  if (allowLiveAccess && classesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 IngressClass 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!ingressClassItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && classesQuery.error ? (
          <Alert type="warning" showIcon message="IngressClass 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 IngressClass</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/network/ingressclasses')} icon={<ArrowLeftOutlined />}>
              返回 IngressClass 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/network/ingressclasses')}
          >
            返回 IngressClass 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {ingressClassItem.name}
              </Typography.Title>
              <Tag color={ingressClassStatusColor(ingressClassItem.status)}>
                {ingressClassItem.status}
              </Tag>
              {ingressClassItem.isDefault ? <Tag color="blue">Default</Tag> : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              <span>{ingressClassItem.controller}</span>
              <span>{parameterScope(ingressClassItem)}</span>
              <span>{parameterReference(ingressClassItem)}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as IngressClassDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Controller Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Ingresses" value={`${relatedIngresses.length}`} />
                        <InlineStat
                          label="Default"
                          value={ingressClassItem.isDefault ? 'Yes' : 'No'}
                        />
                        <InlineStat label="Scope" value={parameterScope(ingressClassItem)} />
                        <InlineStat
                          label="Parameters"
                          value={ingressClassItem.parameters ? 'Attached' : 'None'}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Controller">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Controller" value={ingressClassItem.controller} />
                        <ContextRow
                          label="Default"
                          value={ingressClassItem.isDefault ? 'Yes' : 'No'}
                        />
                        <ContextRow
                          label="Route"
                          value={buildIngressClassRoute(ingressClassItem.name)}
                        />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Parameters">
                      {ingressClassItem.parameters ? (
                        <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                          <ContextRow label="API Group" value={ingressClassItem.parameters.apiGroup || '-'} />
                          <ContextRow label="Kind" value={ingressClassItem.parameters.kind} />
                          <ContextRow label="Name" value={ingressClassItem.parameters.name} />
                          <ContextRow label="Scope" value={parameterScope(ingressClassItem)} />
                          <ContextRow
                            label="Namespace"
                            value={ingressClassItem.parameters.namespace || '-'}
                          />
                        </div>
                      ) : (
                        <EmptyState message="当前 IngressClass 没有参数引用" />
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
                        <Typography.Text type="secondary">{ingressClassItem.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        <Button
                          onClick={() => void ingressClassYamlQuery.refetch()}
                          loading={ingressClassYamlQuery.isFetching}
                        >
                          Refresh
                        </Button>
                        <Button type="primary" onClick={() => setYamlEditOpen(true)}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={ingressClassYamlQuery.error}
                      result={yamlResult}
                      errorMessage="IngressClass YAML 加载失败"
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
                    <SectionCard title="Ingresses" extra={<Tag>{relatedIngresses.length}</Tag>}>
                      {relatedIngresses.length > 0 ? (
                        <div className="space-y-3">
                          {relatedIngresses.map((item) => (
                            <div
                              key={`${item.namespace}/${item.name}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>
                                      {item.namespace}/{item.name}
                                    </Typography.Text>
                                    <Tag color={ingressStatusColor(item.status)}>{item.status}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.hosts.join(', ') || 'Wildcard'}
                                    {item.addresses.length > 0
                                      ? ` · ${item.addresses.join(', ')}`
                                      : ''}
                                  </div>
                                </div>
                                <Button onClick={() => navigate(buildIngressRoute(item.namespace, item.name))}>
                                  Open Ingress
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 IngressClass 还没有关联的 Ingress" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Usage Summary">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow
                          label="Default"
                          value={ingressClassItem.isDefault ? 'Yes' : 'No'}
                        />
                        <ContextRow label="Controller" value={ingressClassItem.controller} />
                        <ContextRow label="Ingresses" value={`${relatedIngresses.length}`} />
                        <ContextRow
                          label="Parameters"
                          value={ingressClassItem.parameters ? parameterReference(ingressClassItem) : '-'}
                        />
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
        title={`Edit IngressClass YAML / ${ingressClassItem.name}`}
        resourceKind="IngressClass"
        resourceLabel={ingressClassItem.name}
        result={ingressClassYamlEditorQuery.data}
        loading={ingressClassYamlEditorQuery.isFetching}
        saving={updateIngressClassYamlMutation.isPending}
        error={ingressClassYamlEditorQuery.error}
        errorMessage="IngressClass YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void ingressClassYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateIngressClassYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
