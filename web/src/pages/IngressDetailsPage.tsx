import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildIngressRoute, ingressStatusColor } from '../components/ingress/ingressShared';
import { buildServiceRoute, serviceStatusColor } from '../components/service/serviceShared';
import { PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type IngressItem,
  type ResourceTextResult,
  type ServiceItem,
  getIngressYaml,
  getIngresses,
  getServices,
  updateIngressYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type IngressDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function IngressDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<IngressDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const ingressesQuery = useQuery({
    queryKey: ['ingress-detail-list', namespace],
    queryFn: () => getIngresses(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const ingressItem = useMemo<IngressItem | undefined>(() => {
    return (ingressesQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [ingressesQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshIngress = async () => {
    if (allowLiveAccess) {
      await ingressesQuery.refetch();
    }
  };

  const servicesQuery = useQuery({
    queryKey: ['ingress-detail-services', namespace],
    queryFn: () => getServices(namespace),
    enabled: allowLiveAccess && Boolean(namespace && ingressItem),
  });

  const ingressYamlQuery = useQuery({
    queryKey: ['ingress-detail-yaml', namespace, name],
    queryFn: () => getIngressYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const ingressYamlEditorQuery = useQuery({
    queryKey: ['ingress-detail-yaml-editor', namespace, name],
    queryFn: () => getIngressYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateIngressYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateIngressYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshIngress();
      void ingressYamlQuery.refetch();
      void ingressYamlEditorQuery.refetch();
    },
  });

  const relatedServices = useMemo<ServiceItem[]>(() => {
    if (!ingressItem) {
      return [];
    }

    return (servicesQuery.data ?? []).filter((item) => ingressItem.serviceNames.includes(item.name));
  }, [ingressItem, servicesQuery.data]);

  const yamlResult: ResourceTextResult | undefined = ingressYamlQuery.data;

  if (allowLiveAccess && ingressesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Ingress 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!ingressItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && ingressesQuery.error ? (
          <Alert type="warning" showIcon message="Ingress 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 Ingress</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/network/ingresses')} icon={<ArrowLeftOutlined />}>
              返回 Ingress 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== ingressItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/network/ingresses')}
          >
            返回 Ingress 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {ingressItem.name}
              </Typography.Title>
              <Tag color={ingressStatusColor(ingressItem.status)}>{ingressItem.status}</Tag>
              <Tag color="blue">{ingressItem.ingressClass || '-'}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={ingressItem.namespace} />
              ) : null}
              <HeaderMeta label="Hosts" value={`${ingressItem.hosts.length}`} />
              <HeaderMeta label="Backends" value={`${ingressItem.backendCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as IngressDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Routing Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Hosts" value={`${ingressItem.hosts.length}`} />
                        <InlineStat label="Services" value={`${relatedServices.length}`} />
                        <InlineStat label="TLS" value={`${ingressItem.tls.length}`} />
                        <InlineStat label="Addresses" value={`${ingressItem.addresses.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Hosts">
                      {ingressItem.hosts.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {ingressItem.hosts.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Ingress 没有显式 Host 规则" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Exposure">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={ingressItem.summary} />
                        <ContextRow label="IngressClass" value={ingressItem.ingressClass || '-'} />
                        <ContextRow
                          label="Addresses"
                          value={ingressItem.addresses.length > 0 ? ingressItem.addresses.join(', ') : '-'}
                        />
                        <ContextRow label="Default Backend" value={ingressItem.defaultBackend || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Services" extra={<Tag>{ingressItem.serviceNames.length}</Tag>}>
                      {ingressItem.serviceNames.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {ingressItem.serviceNames.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Ingress 没有关联的 Service" />
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
                          {ingressItem.namespace}/{ingressItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void ingressYamlQuery.refetch()}
                            loading={ingressYamlQuery.isFetching}
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
                      error={allowLiveAccess ? ingressYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Ingress YAML 加载失败"
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
                    <SectionCard title="Backend Services" extra={<Tag>{relatedServices.length}</Tag>}>
                      {relatedServices.length > 0 ? (
                        <div className="space-y-3">
                          {relatedServices.map((item) => (
                            <div
                              key={item.name}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color={serviceStatusColor(item.status)}>{item.status}</Tag>
                                    <Tag color="blue">{item.type}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.summary} · Pods {item.podCount} · Ports {item.portsSummary}
                                  </div>
                                </div>

                                <Button onClick={() => navigate(buildServiceRoute(item.namespace, item.name))}>
                                  Open Service
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Ingress 没有关联的 Service" />
                      )}
                    </SectionCard>

                    <SectionCard title="TLS Configuration" extra={<Tag>{ingressItem.tls.length}</Tag>}>
                      {ingressItem.tls.length > 0 ? (
                        <div className="space-y-3">
                          {ingressItem.tls.map((item, index) => (
                            <div
                              key={`${item.secretName || 'tls'}-${index}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{item.secretName || 'Unnamed Secret'}</Typography.Text>
                                <Tag color="cyan">TLS</Tag>
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.hosts.length > 0 ? item.hosts.join(', ') : 'No host binding'}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Ingress 没有 TLS 配置" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Labels" extra={<Tag>{ingressItem.labels.length}</Tag>}>
                      {ingressItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {ingressItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Ingress 没有 labels" />
                      )}
                    </SectionCard>

                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={ingressItem.namespace} />
                        <ContextRow label="Created" value={ingressItem.createdAt || '-'} />
                        <ContextRow label="Age" value={ingressItem.age || '-'} />
                        <ContextRow label="Route" value={buildIngressRoute(ingressItem.namespace, ingressItem.name)} />
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
        title={`Edit Ingress YAML / ${ingressItem.namespace}/${ingressItem.name}`}
        resourceKind="Ingress"
        resourceLabel={`${ingressItem.namespace}/${ingressItem.name}`}
        result={ingressYamlEditorQuery.data}
        loading={ingressYamlEditorQuery.isFetching}
        saving={updateIngressYamlMutation.isPending}
        error={ingressYamlEditorQuery.error}
        errorMessage="Ingress YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void ingressYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateIngressYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
