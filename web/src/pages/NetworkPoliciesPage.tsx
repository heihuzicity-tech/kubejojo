import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildNetworkPolicyRoute,
  networkPolicyStatusColor,
} from '../components/networkpolicy/networkPolicyShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type NetworkPolicyItem,
  deleteNetworkPolicy,
  getNetworkPolicies,
  getNetworkPolicyYaml,
  updateNetworkPolicyYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

function selectorSummary(item: NetworkPolicyItem) {
  return item.podSelector.length > 0 ? item.podSelector.join(', ') : 'All pods in namespace';
}

export function NetworkPoliciesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<NetworkPolicyItem>();

  const networkPoliciesQuery = useQuery({
    queryKey: ['networkpolicies', currentNamespace],
    queryFn: () => getNetworkPolicies(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const networkPolicyYamlQuery = useQuery({
    queryKey: ['networkpolicy-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getNetworkPolicyYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateNetworkPolicyYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateNetworkPolicyYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await networkPoliciesQuery.refetch();
      await networkPolicyYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteNetworkPolicy(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await networkPoliciesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? networkPoliciesQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const selectedPodCount = items.reduce((sum, item) => sum + item.selectedPodCount, 0);
    const ingressCount = items.filter((item) => item.policyTypes.includes('Ingress')).length;
    const egressCount = items.filter((item) => item.policyTypes.includes('Egress')).length;
    const warningCount = items.filter((item) => item.status === 'warning').length;

    return [
      {
        label: 'Policies',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Selected Pods',
        value: selectedPodCount,
        hint: '被策略选中的 Pod 总数',
        tone: 'blue',
      },
      {
        label: 'Ingress / Egress',
        value: `${ingressCount}/${egressCount}`,
        hint: '具备 Ingress / Egress 管控的策略数',
        tone: 'amber',
      },
      {
        label: 'Warnings',
        value: warningCount,
        hint: '当前未匹配 Pod 或配置不完整',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<NetworkPolicyItem>[] = [
    {
      title: 'NetworkPolicy',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.policyTypes.map((policyType) => (
              <Tag key={policyType} color={policyType === 'Ingress' ? 'blue' : 'purple'}>
                {policyType}
              </Tag>
            ))}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.summary}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 220,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={networkPolicyStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.selectedPodCount > 0 ? 'green' : 'orange'}>
            Pods {item.selectedPodCount}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Selector',
      key: 'selector',
      width: 280,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-700">{selectorSummary(item)}</Typography.Text>
      ),
    },
    {
      title: 'Rules',
      key: 'rules',
      width: 180,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color="cyan">Ingress {item.ingressRuleCount}</Tag>
          <Tag color="geekblue">Egress {item.egressRuleCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'Selected Pods',
      key: 'pods',
      width: 280,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.selectedPods.slice(0, 3).join(', ') || 'No matching pods'}
          {item.selectedPods.length > 3 ? ` +${item.selectedPods.length - 3}` : ''}
        </Typography.Text>
      ),
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
      render: (value) => value ?? '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 124,
      fixed: 'right',
      render: (_, item) =>
        sessionMode === 'token' ? (
          <ActionMenuButton
            loading={updateNetworkPolicyYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildNetworkPolicyRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'NetworkPolicy',
                    namespace: item.namespace,
                    name: item.name,
                    impact:
                      'Traffic rules for matching Pods may change immediately after this NetworkPolicy is removed.',
                    onConfirm: () =>
                      deleteMutation.mutateAsync({
                        namespace: item.namespace,
                        name: item.name,
                      }),
                  });
                }
              },
            }}
          />
        ) : (
          <Tag>ReadOnly</Tag>
        ),
    },
  ];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && networkPoliciesQuery.error ? (
        <Alert type="warning" showIcon message="NetworkPolicy 数据加载失败" />
      ) : null}

      <ResourceListPage<NetworkPolicyItem>
        title="NetworkPolicy 列表"
        description="查看命名空间内的网络隔离策略、Pod 选中范围以及 Ingress / Egress 规则覆盖情况。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && networkPoliciesQuery.isLoading}
        onRefresh={() => networkPoliciesQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="NetworkPolicy"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => networkPoliciesQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索策略、命名空间、Pod Selector、Pod 名称或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.policyTypes.some((item) => item.toLowerCase().includes(keyword)) ||
          record.podSelector.some((item) => item.toLowerCase().includes(keyword)) ||
          record.selectedPods.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword)) ||
          record.ingressRules.some(
            (rule) =>
              rule.peers.some((item) => item.toLowerCase().includes(keyword)) ||
              rule.ports.some((item) => item.toLowerCase().includes(keyword)),
          ) ||
          record.egressRules.some(
            (rule) =>
              rule.peers.some((item) => item.toLowerCase().includes(keyword)) ||
              rule.ports.some((item) => item.toLowerCase().includes(keyword)),
          )
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 NetworkPolicy`}
        onRow={(record) => ({
          onClick: () => navigate(buildNetworkPolicyRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit NetworkPolicy YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit NetworkPolicy YAML'
        }
        resourceKind="NetworkPolicy"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={networkPolicyYamlQuery.data}
        loading={networkPolicyYamlQuery.isFetching}
        saving={updateNetworkPolicyYamlMutation.isPending}
        error={networkPolicyYamlQuery.error}
        errorMessage="NetworkPolicy YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void networkPolicyYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateNetworkPolicyYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
