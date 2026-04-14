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
import { buildPodRoute, PodTextViewer, statusColor } from '../components/pod/podShared';
import { buildServiceRoute, serviceStatusColor } from '../components/service/serviceShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type IngressItem,
  type PodItem,
  type ResourceTextResult,
  type ServiceItem,
  getIngresses,
  getPods,
  getServiceYaml,
  getServices,
  updateServiceYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type ServiceDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function parseLabelPairs(items: string[]) {
  const labels = new Map<string, string>();
  items.forEach((item) => {
    const separatorIndex = item.indexOf('=');
    if (separatorIndex <= 0) {
      return;
    }
    labels.set(item.slice(0, separatorIndex), item.slice(separatorIndex + 1));
  });
  return labels;
}

function matchesSelector(serviceItem: ServiceItem, pod: PodItem) {
  if (serviceItem.selector.length === 0) {
    return false;
  }

  const labels = parseLabelPairs(pod.labels);
  return serviceItem.selector.every((item) => {
    const separatorIndex = item.indexOf('=');
    if (separatorIndex <= 0) {
      return false;
    }

    return labels.get(item.slice(0, separatorIndex)) === item.slice(separatorIndex + 1);
  });
}

export function ServiceDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<ServiceDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const servicesQuery = useQuery({
    queryKey: ['service-detail-list', namespace],
    queryFn: () => getServices(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const serviceItem = useMemo<ServiceItem | undefined>(() => {
    return (servicesQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [name, namespace, servicesQuery.data]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshService = async () => {
    if (allowLiveAccess) {
      await servicesQuery.refetch();
    }
  };

  const podsQuery = useQuery({
    queryKey: ['service-detail-pods', namespace],
    queryFn: () => getPods(namespace),
    enabled: allowLiveAccess && Boolean(namespace && serviceItem && serviceItem.selector.length > 0),
  });

  const ingressesQuery = useQuery({
    queryKey: ['service-detail-ingresses', namespace],
    queryFn: () => getIngresses(namespace),
    enabled: allowLiveAccess && Boolean(namespace && serviceItem),
  });

  const serviceYamlQuery = useQuery({
    queryKey: ['service-detail-yaml', namespace, name],
    queryFn: () => getServiceYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const serviceYamlEditorQuery = useQuery({
    queryKey: ['service-detail-yaml-editor', namespace, name],
    queryFn: () => getServiceYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateServiceYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateServiceYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshService();
      void serviceYamlQuery.refetch();
      void serviceYamlEditorQuery.refetch();
    },
  });

  const relatedPods = useMemo(() => {
    if (!serviceItem) {
      return [];
    }

    return (podsQuery.data ?? []).filter((item) => matchesSelector(serviceItem, item));
  }, [podsQuery.data, serviceItem]);

  const relatedIngresses = useMemo<IngressItem[]>(() => {
    if (!serviceItem) {
      return [];
    }

    return (ingressesQuery.data ?? []).filter((item) => item.serviceNames.includes(serviceItem.name));
  }, [ingressesQuery.data, serviceItem]);

  const yamlResult: ResourceTextResult | undefined = serviceYamlQuery.data;

  if (allowLiveAccess && servicesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Service 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!serviceItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && servicesQuery.error ? (
          <Alert type="warning" showIcon message="Service 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 Service</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/network/services')} icon={<ArrowLeftOutlined />}>
              返回 Service 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== serviceItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/network/services')}
          >
            返回 Service 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {serviceItem.name}
              </Typography.Title>
              <Tag color={serviceStatusColor(serviceItem.status)}>{serviceItem.status}</Tag>
              <Tag color="blue">{serviceItem.type}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={serviceItem.namespace} />
              ) : null}
              <HeaderMeta label="ClusterIP" value={serviceItem.clusterIP} />
              <HeaderMeta label="Ports" value={serviceItem.portsSummary || '-'} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ServiceDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Service Shape">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Type" value={serviceItem.type} />
                        <InlineStat label="ClusterIP" value={serviceItem.clusterIP} />
                        <InlineStat label="Pods" value={`${relatedPods.length}`} />
                        <InlineStat label="Ingresses" value={`${relatedIngresses.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Ports">
                      {serviceItem.ports.length > 0 ? (
                        <div className="space-y-3">
                          {serviceItem.ports.map((port) => (
                            <div
                              key={`${port.protocol}-${port.port}-${port.targetPort || ''}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{port.name || `Port ${port.port}`}</Typography.Text>
                                <Tag>{port.protocol}</Tag>
                                <Tag color="blue">Service {port.port}</Tag>
                                <Tag color="default">Target {port.targetPort || '-'}</Tag>
                                {port.nodePort ? <Tag color="purple">NodePort {port.nodePort}</Tag> : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Service 没有可展示的端口信息" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Exposure">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={serviceItem.summary} />
                        <ContextRow label="Session" value={serviceItem.sessionAffinity} />
                        <ContextRow
                          label="External"
                          value={
                            serviceItem.externalName ||
                            (serviceItem.externalAddresses.length > 0
                              ? serviceItem.externalAddresses.join(', ')
                              : '-')
                          }
                        />
                        <ContextRow label="Route" value={buildServiceRoute(serviceItem.namespace, serviceItem.name)} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Selector" extra={<Tag>{serviceItem.selector.length}</Tag>}>
                      {serviceItem.selector.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {serviceItem.selector.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <Alert type="info" showIcon message="当前 Service 没有 selector，通常表示外部服务或手工绑定。"/>
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
                          {serviceItem.namespace}/{serviceItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void serviceYamlQuery.refetch()}
                            loading={serviceYamlQuery.isFetching}
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
                      error={allowLiveAccess ? serviceYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Service YAML 加载失败"
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
                    <SectionCard title="Backing Pods" extra={<Tag>{relatedPods.length}</Tag>}>
                      {relatedPods.length > 0 ? (
                        <div className="space-y-3">
                          {relatedPods.map((pod) => (
                            <div
                              key={pod.name}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{pod.name}</Typography.Text>
                                    <Tag color={statusColor(pod.status)}>{pod.status}</Tag>
                                    <Tag color={pod.readyContainers === pod.totalContainers ? 'green' : 'orange'}>
                                      Ready {pod.readyContainers}/{pod.totalContainers}
                                    </Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {pod.nodeName || '-'} · CPU {pod.cpuUsage ?? 'Unavailable'} · Memory{' '}
                                    {pod.memoryUsage ?? 'Unavailable'}
                                  </div>
                                </div>

                                <Button onClick={() => navigate(buildPodRoute(serviceItem.namespace, pod.name))}>
                                  Open Pod
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Service 没有关联 Pod" />
                      )}
                    </SectionCard>

                    <SectionCard title="Ingress Consumers" extra={<Tag>{relatedIngresses.length}</Tag>}>
                      {relatedIngresses.length > 0 ? (
                        <div className="space-y-3">
                          {relatedIngresses.map((item) => (
                            <div
                              key={item.name}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color={ingressStatusColor(item.status)}>{item.status}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.hosts.length > 0 ? item.hosts.join(', ') : 'No host rule'} · Backends{' '}
                                    {item.backendCount}
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
                        <EmptyState message="当前 Service 没有被 Ingress 引用" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Labels" extra={<Tag>{serviceItem.labels.length}</Tag>}>
                      {serviceItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {serviceItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Service 没有 labels" />
                      )}
                    </SectionCard>

                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={serviceItem.namespace} />
                        <ContextRow label="Created" value={serviceItem.createdAt || '-'} />
                        <ContextRow label="Age" value={serviceItem.age || '-'} />
                        <ContextRow label="Selector Count" value={`${serviceItem.selector.length}`} />
                        <ContextRow label="Port Count" value={`${serviceItem.ports.length}`} />
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
        title={`Edit Service YAML / ${serviceItem.namespace}/${serviceItem.name}`}
        resourceKind="Service"
        resourceLabel={`${serviceItem.namespace}/${serviceItem.name}`}
        result={serviceYamlEditorQuery.data}
        loading={serviceYamlEditorQuery.isFetching}
        saving={updateServiceYamlMutation.isPending}
        error={serviceYamlEditorQuery.error}
        errorMessage="Service YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void serviceYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateServiceYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
