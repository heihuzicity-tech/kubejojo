import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildNetworkPolicyRoute,
  networkPolicyStatusColor,
} from '../components/networkpolicy/networkPolicyShared';
import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type NetworkPolicyItem,
  type NetworkPolicyRuleItem,
  type ResourceTextResult,
  getNetworkPolicies,
  getNetworkPolicyYaml,
  updateNetworkPolicyYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type NetworkPolicyDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function selectorSummary(item: NetworkPolicyItem) {
  return item.podSelector.length > 0 ? item.podSelector.join(', ') : 'All pods in namespace';
}

function RuleSection({
  title,
  rules,
  emptyMessage,
  peerFallback,
}: {
  title: string;
  rules: NetworkPolicyRuleItem[];
  emptyMessage: string;
  peerFallback: string;
}) {
  return (
    <SectionCard title={title} extra={<Tag>{rules.length}</Tag>}>
      {rules.length > 0 ? (
        <div className="space-y-3">
          {rules.map((rule, index) => (
            <div
              key={`${title}-${index}`}
              className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Typography.Text strong>{`Rule ${index + 1}`}</Typography.Text>
                <Tag color="blue">{rule.peers.length > 0 ? `${rule.peers.length} Peers` : peerFallback}</Tag>
                <Tag color="cyan">{rule.ports.length > 0 ? `${rule.ports.length} Ports` : 'All ports'}</Tag>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-[12px] font-medium text-slate-500">Peers</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {rule.peers.length > 0 ? (
                      rule.peers.map((item) => <Tag key={item}>{item}</Tag>)
                    ) : (
                      <Tag>{peerFallback}</Tag>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[12px] font-medium text-slate-500">Ports</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {rule.ports.length > 0 ? (
                      rule.ports.map((item) => (
                        <Tag key={item} color="cyan">
                          {item}
                        </Tag>
                      ))
                    ) : (
                      <Tag color="cyan">All ports</Tag>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message={emptyMessage} />
      )}
    </SectionCard>
  );
}

export function NetworkPolicyDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<NetworkPolicyDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const networkPoliciesQuery = useQuery({
    queryKey: ['networkpolicy-detail-list', namespace],
    queryFn: () => getNetworkPolicies(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const networkPolicyItem = useMemo<NetworkPolicyItem | undefined>(() => {
    return (networkPoliciesQuery.data ?? []).find(
      (item) => item.namespace === namespace && item.name === name,
    );
  }, [networkPoliciesQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshNetworkPolicy = async () => {
    if (allowLiveAccess) {
      await networkPoliciesQuery.refetch();
    }
  };

  const networkPolicyYamlQuery = useQuery({
    queryKey: ['networkpolicy-detail-yaml', namespace, name],
    queryFn: () => getNetworkPolicyYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const networkPolicyYamlEditorQuery = useQuery({
    queryKey: ['networkpolicy-detail-yaml-editor', namespace, name],
    queryFn: () => getNetworkPolicyYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateNetworkPolicyYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateNetworkPolicyYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshNetworkPolicy();
      void networkPolicyYamlQuery.refetch();
      void networkPolicyYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined = networkPolicyYamlQuery.data;

  if (allowLiveAccess && networkPoliciesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 NetworkPolicy 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!networkPolicyItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && networkPoliciesQuery.error ? (
          <Alert type="warning" showIcon message="NetworkPolicy 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 NetworkPolicy</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/network/networkpolicies')} icon={<ArrowLeftOutlined />}>
              返回 NetworkPolicy 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== networkPolicyItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/network/networkpolicies')}
          >
            返回 NetworkPolicy 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {networkPolicyItem.name}
              </Typography.Title>
              <Tag color={networkPolicyStatusColor(networkPolicyItem.status)}>
                {networkPolicyItem.status}
              </Tag>
              {networkPolicyItem.policyTypes.map((policyType) => (
                <Tag key={policyType} color={policyType === 'Ingress' ? 'blue' : 'purple'}>
                  {policyType}
                </Tag>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={networkPolicyItem.namespace} />
              ) : null}
              <HeaderMeta label="Pods" value={`${networkPolicyItem.selectedPodCount}`} />
              <HeaderMeta
                label="Rules"
                value={`${networkPolicyItem.ingressRuleCount}/${networkPolicyItem.egressRuleCount}`}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as NetworkPolicyDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Coverage Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Selected Pods" value={`${networkPolicyItem.selectedPodCount}`} />
                        <InlineStat label="Policy Types" value={`${networkPolicyItem.policyTypes.length}`} />
                        <InlineStat label="Ingress Rules" value={`${networkPolicyItem.ingressRuleCount}`} />
                        <InlineStat label="Egress Rules" value={`${networkPolicyItem.egressRuleCount}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Pod Selector">
                      {networkPolicyItem.podSelector.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {networkPolicyItem.podSelector.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前策略作用于命名空间内的全部 Pod" />
                      )}
                    </SectionCard>

                    <RuleSection
                      title="Ingress Rules"
                      rules={networkPolicyItem.ingressRules}
                      emptyMessage="当前策略没有显式 Ingress 规则"
                      peerFallback="All sources"
                    />

                    <RuleSection
                      title="Egress Rules"
                      rules={networkPolicyItem.egressRules}
                      emptyMessage="当前策略没有显式 Egress 规则"
                      peerFallback="All destinations"
                    />
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={networkPolicyItem.summary} />
                        <ContextRow label="Namespace" value={networkPolicyItem.namespace} />
                        <ContextRow label="Selector" value={selectorSummary(networkPolicyItem)} />
                        <ContextRow
                          label="Policy Types"
                          value={networkPolicyItem.policyTypes.join(', ') || '-'}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Selected Pods" extra={<Tag>{networkPolicyItem.selectedPodCount}</Tag>}>
                      {networkPolicyItem.selectedPods.length > 0 ? (
                        <div className="space-y-2">
                          {networkPolicyItem.selectedPods.slice(0, 8).map((item) => (
                            <Button
                              key={item}
                              block
                              className="!text-left"
                              onClick={() => navigate(buildPodRoute(networkPolicyItem.namespace, item))}
                            >
                              {item}
                            </Button>
                          ))}
                          {networkPolicyItem.selectedPods.length > 8 ? (
                            <Typography.Text type="secondary" className="text-xs">
                              还有 {networkPolicyItem.selectedPods.length - 8} 个 Pod，请到 Related 标签查看。
                            </Typography.Text>
                          ) : null}
                        </div>
                      ) : (
                        <EmptyState message="当前策略还没有匹配到 Pod" />
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
                          {networkPolicyItem.namespace}/{networkPolicyItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void networkPolicyYamlQuery.refetch()}
                            loading={networkPolicyYamlQuery.isFetching}
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
                      error={allowLiveAccess ? networkPolicyYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="NetworkPolicy YAML 加载失败"
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
                    <SectionCard title="Selected Pods" extra={<Tag>{networkPolicyItem.selectedPodCount}</Tag>}>
                      {networkPolicyItem.selectedPods.length > 0 ? (
                        <div className="space-y-3">
                          {networkPolicyItem.selectedPods.map((item) => (
                            <div
                              key={item}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <Typography.Text strong>{item}</Typography.Text>
                                  <div className="text-xs text-slate-500">
                                    Namespace {networkPolicyItem.namespace}
                                  </div>
                                </div>

                                <Button onClick={() => navigate(buildPodRoute(networkPolicyItem.namespace, item))}>
                                  Open Pod
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前策略还没有匹配到 Pod" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Labels" extra={<Tag>{networkPolicyItem.labels.length}</Tag>}>
                      {networkPolicyItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {networkPolicyItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 NetworkPolicy 没有 labels" />
                      )}
                    </SectionCard>

                    <SectionCard title="Lifecycle">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Created At" value={networkPolicyItem.createdAt || '-'} />
                        <ContextRow label="Age" value={networkPolicyItem.age || '-'} />
                        <ContextRow label="Detail Path" value={buildNetworkPolicyRoute(namespace, name)} />
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
        title={`Edit NetworkPolicy YAML / ${networkPolicyItem.namespace}/${networkPolicyItem.name}`}
        resourceKind="NetworkPolicy"
        resourceLabel={`${networkPolicyItem.namespace}/${networkPolicyItem.name}`}
        result={networkPolicyYamlEditorQuery.data}
        loading={networkPolicyYamlEditorQuery.isFetching}
        saving={updateNetworkPolicyYamlMutation.isPending}
        error={networkPolicyYamlEditorQuery.error}
        errorMessage="NetworkPolicy YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void networkPolicyYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateNetworkPolicyYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
