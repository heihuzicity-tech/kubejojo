import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildServiceAccountRoute,
  serviceAccountStatusColor,
} from '../components/serviceaccount/serviceAccountShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ServiceAccountItem,
  getServiceAccounts,
  getServiceAccountYaml,
  updateServiceAccountYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

function preview(items: string[]) {
  if (items.length === 0) {
    return '-';
  }

  const text = items.slice(0, 3).join(', ');
  return items.length > 3 ? `${text} +${items.length - 3}` : text;
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

export function ServiceAccountsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<ServiceAccountItem>();

  const accountsQuery = useQuery({
    queryKey: ['serviceaccounts', currentNamespace],
    queryFn: () => getServiceAccounts(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const accountYamlQuery = useQuery({
    queryKey: ['serviceaccount-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getServiceAccountYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateAccountYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateServiceAccountYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await accountsQuery.refetch();
      await accountYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? accountsQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const pods = items.reduce((sum, item) => sum + item.referencedPodCount, 0);
    const pullSecrets = items.reduce((sum, item) => sum + item.imagePullSecretCount, 0);
    const disabledAutomount = items.filter((item) => item.automountToken === 'Disabled').length;

    return [
      { label: 'Accounts', value: items.length, hint: `当前上下文: ${namespaceLabel}`, tone: 'teal' },
      { label: 'Referenced Pods', value: pods, hint: '使用这些 ServiceAccount 的 Pod 总数', tone: 'blue' },
      { label: 'Pull Secrets', value: pullSecrets, hint: 'imagePullSecrets 关联总数', tone: 'amber' },
      { label: 'Disabled Automount', value: disabledAutomount, hint: '显式关闭 token automount 的账号数', tone: 'slate' },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<ServiceAccountItem>[] = [
    {
      title: 'ServiceAccount',
      key: 'name',
      dataIndex: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{item.name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.summary}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 250,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={serviceAccountStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={automountColor(item.automountToken)}>{item.automountToken}</Tag>
          <Tag color={item.referencedPodCount > 0 ? 'green' : 'default'}>Pods {item.referencedPodCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'Secrets',
      key: 'secrets',
      width: 260,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          Secrets {item.secretCount} · Pull {item.imagePullSecretCount}
        </Typography.Text>
      ),
    },
    {
      title: 'Referenced Pods',
      key: 'pods',
      width: 300,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.referencedPodCount > 0 ? preview(item.referencedPods) : 'Unused'}
        </Typography.Text>
      ),
    },
    {
      title: 'Age',
      key: 'age',
      dataIndex: 'age',
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
            loading={updateAccountYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildServiceAccountRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
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
      {sessionMode === 'token' && accountsQuery.error ? (
        <Alert type="warning" showIcon message="ServiceAccount 数据加载失败" />
      ) : null}

      <ResourceListPage<ServiceAccountItem>
        title="ServiceAccount 列表"
        description="查看命名空间内的服务账号、token 自动挂载策略、镜像拉取密钥以及 Pod 引用关系。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && accountsQuery.isLoading}
        onRefresh={() => accountsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索账号、命名空间、Pod、secret、automount 状态或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.automountToken.toLowerCase().includes(keyword) ||
          record.secretNames.some((item) => item.toLowerCase().includes(keyword)) ||
          record.imagePullSecrets.some((item) => item.toLowerCase().includes(keyword)) ||
          record.referencedPods.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 ServiceAccount`}
        onRow={(record) => ({
          onClick: () => navigate(buildServiceAccountRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit ServiceAccount YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit ServiceAccount YAML'
        }
        resourceKind="ServiceAccount"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={accountYamlQuery.data}
        loading={accountYamlQuery.isFetching}
        saving={updateAccountYamlMutation.isPending}
        error={accountYamlQuery.error}
        errorMessage="ServiceAccount YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void accountYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateAccountYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
