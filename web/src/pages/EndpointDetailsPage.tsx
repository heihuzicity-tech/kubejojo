import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { buildEndpointRoute, endpointStatusColor } from '../components/endpoint/endpointShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import { buildServiceRoute, serviceStatusColor } from '../components/service/serviceShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type EndpointItem,
  type ResourceTextResult,
  type ServiceItem,
  getEndpointYaml,
  getEndpoints,
  getServices,
  updateEndpointYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type EndpointDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function EndpointDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<EndpointDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const endpointsQuery = useQuery({
    queryKey: ['endpoint-detail-list', namespace],
    queryFn: () => getEndpoints(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const endpointItem = useMemo<EndpointItem | undefined>(() => {
    return (endpointsQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [endpointsQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshEndpoint = async () => {
    if (allowLiveAccess) {
      await endpointsQuery.refetch();
    }
  };

  const servicesQuery = useQuery({
    queryKey: ['endpoint-detail-services', namespace],
    queryFn: () => getServices(namespace),
    enabled: allowLiveAccess && Boolean(namespace && endpointItem?.serviceName),
  });

  const endpointYamlQuery = useQuery({
    queryKey: ['endpoint-detail-yaml', namespace, name],
    queryFn: () => getEndpointYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const endpointYamlEditorQuery = useQuery({
    queryKey: ['endpoint-detail-yaml-editor', namespace, name],
    queryFn: () => getEndpointYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateEndpointYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateEndpointYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshEndpoint();
      void endpointYamlQuery.refetch();
      void endpointYamlEditorQuery.refetch();
    },
  });

  const relatedService = useMemo<ServiceItem | undefined>(() => {
    if (!endpointItem?.serviceName) {
      return undefined;
    }

    return (servicesQuery.data ?? []).find((item) => item.name === endpointItem.serviceName);
  }, [endpointItem?.serviceName, servicesQuery.data]);

  const yamlResult: ResourceTextResult | undefined = endpointYamlQuery.data;

  if (allowLiveAccess && endpointsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Endpoints 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!endpointItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && endpointsQuery.error ? (
          <Alert type="warning" showIcon message="Endpoints 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 Endpoints</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/network/endpoints')} icon={<ArrowLeftOutlined />}>
              返回 Endpoints 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== endpointItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/network/endpoints')}
          >
            返回 Endpoints 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {endpointItem.name}
              </Typography.Title>
              <Tag color={endpointStatusColor(endpointItem.status)}>{endpointItem.status}</Tag>
              {endpointItem.serviceName ? <Tag color="blue">Service</Tag> : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={endpointItem.namespace} />
              ) : null}
              <HeaderMeta label="Ready" value={`${endpointItem.readyAddresses}`} />
              <HeaderMeta label="Ports" value={endpointItem.portsSummary || '-'} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as EndpointDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Endpoint Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Subsets" value={`${endpointItem.subsets}`} />
                        <InlineStat label="Ready" value={`${endpointItem.readyAddresses}`} />
                        <InlineStat label="NotReady" value={`${endpointItem.notReadyAddresses}`} />
                        <InlineStat label="Addresses" value={`${endpointItem.addresses.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Addresses">
                      {endpointItem.addresses.length > 0 ? (
                        <div className="space-y-3">
                          {endpointItem.addresses.map((item) => (
                            <div
                              key={`${item.ip}-${item.targetName || ''}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{item.targetName || item.ip}</Typography.Text>
                                <Tag color={item.ready ? 'green' : 'orange'}>
                                  {item.ready ? 'Ready' : 'NotReady'}
                                </Tag>
                                {item.targetKind ? <Tag>{item.targetKind}</Tag> : null}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {item.ip} {item.nodeName ? `· ${item.nodeName}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Endpoints 没有可展示的地址" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Binding">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Ports" value={endpointItem.portsSummary || '-'} />
                        <ContextRow label="Service" value={endpointItem.serviceName || '-'} />
                        <ContextRow label="Route" value={buildEndpointRoute(endpointItem.namespace, endpointItem.name)} />
                      </div>
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
                          {endpointItem.namespace}/{endpointItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        <Button onClick={() => void endpointYamlQuery.refetch()} loading={endpointYamlQuery.isFetching}>
                          Refresh
                        </Button>
                        <Button type="primary" onClick={() => setYamlEditOpen(true)}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={endpointYamlQuery.error}
                      result={yamlResult}
                      errorMessage="Endpoints YAML 加载失败"
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
                    <SectionCard title="Target References" extra={<Tag>{endpointItem.addresses.length}</Tag>}>
                      {endpointItem.addresses.length > 0 ? (
                        <div className="space-y-3">
                          {endpointItem.addresses.map((item) => (
                            <div
                              key={`${item.ip}-${item.targetName || ''}-related`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.targetName || item.ip}</Typography.Text>
                                    <Tag color={item.ready ? 'green' : 'orange'}>
                                      {item.ready ? 'Ready' : 'NotReady'}
                                    </Tag>
                                    {item.targetKind ? <Tag>{item.targetKind}</Tag> : null}
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.ip} {item.nodeName ? `· ${item.nodeName}` : ''}
                                  </div>
                                </div>

                                {item.targetKind === 'Pod' && item.targetName ? (
                                  <Button onClick={() => navigate(buildPodRoute(endpointItem.namespace, item.targetName!))}>
                                    Open Pod
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Endpoints 没有关联目标" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Service">
                      {relatedService ? (
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{relatedService.name}</Typography.Text>
                                <Tag color={serviceStatusColor(relatedService.status)}>{relatedService.status}</Tag>
                              </div>
                              <div className="text-xs text-slate-500">
                                {relatedService.summary} · Ports {relatedService.portsSummary}
                              </div>
                            </div>

                            <Button onClick={() => navigate(buildServiceRoute(relatedService.namespace, relatedService.name))}>
                              Open Service
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <EmptyState message="当前 Endpoints 没有同名 Service 绑定" />
                      )}
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{endpointItem.labels.length}</Tag>}>
                      {endpointItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {endpointItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Endpoints 没有 labels" />
                      )}
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
        title={`Edit Endpoints YAML / ${endpointItem.namespace}/${endpointItem.name}`}
        resourceKind="Endpoints"
        resourceLabel={`${endpointItem.namespace}/${endpointItem.name}`}
        result={endpointYamlEditorQuery.data}
        loading={endpointYamlEditorQuery.isFetching}
        saving={updateEndpointYamlMutation.isPending}
        error={endpointYamlEditorQuery.error}
        errorMessage="Endpoints YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void endpointYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateEndpointYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
