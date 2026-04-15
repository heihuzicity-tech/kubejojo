import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { buildIngressRoute, ingressStatusColor } from '../components/ingress/ingressShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type IngressItem,
  deleteIngress,
  getIngressYaml,
  getIngresses,
  updateIngressYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

export function IngressesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<IngressItem>();

  const ingressesQuery = useQuery({
    queryKey: ['ingresses', currentNamespace],
    queryFn: () => getIngresses(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const ingressYamlQuery = useQuery({
    queryKey: ['ingress-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getIngressYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateIngressYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateIngressYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await ingressesQuery.refetch();
      await ingressYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteIngress(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await ingressesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? ingressesQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const hostCount = items.reduce((sum, item) => sum + item.hosts.length, 0);
    const exposedCount = items.filter((item) => item.addresses.length > 0).length;
    const tlsCount = items.filter((item) => item.tls.length > 0).length;

    return [
      {
        label: 'Ingresses',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Hosts',
        value: hostCount,
        hint: '已声明的域名规则总数',
        tone: 'blue',
      },
      {
        label: 'Exposed',
        value: `${exposedCount}/${items.length}`,
        hint: '已拿到地址的 Ingress',
        tone: 'amber',
      },
      {
        label: 'TLS',
        value: tlsCount,
        hint: '配置了 TLS 的 Ingress',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<IngressItem>[] = [
    {
      title: 'Ingress',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.ingressClass || '-'}</Tag>
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
      width: 240,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={ingressStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.backendCount > 0 ? 'green' : 'orange'}>
            Backends {item.backendCount}
          </Tag>
          {item.tls.length > 0 ? <Tag color="cyan">TLS {item.tls.length}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Hosts',
      key: 'hosts',
      width: 260,
      render: (_, item) =>
        item.hosts.length > 0 ? (
          <Typography.Text className="text-sm text-slate-700">
            {item.hosts.join(', ')}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" className="text-xs">
            Wildcard / default only
          </Typography.Text>
        ),
    },
    {
      title: 'Services',
      key: 'services',
      width: 240,
      render: (_, item) =>
        item.serviceNames.length > 0 ? (
          <Typography.Text className="text-sm text-slate-700">
            {item.serviceNames.join(', ')}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" className="text-xs">
            No Service backend
          </Typography.Text>
        ),
    },
    {
      title: 'Address',
      key: 'addresses',
      width: 220,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">
            {item.addresses.length > 0 ? item.addresses.join(', ') : '-'}
          </Typography.Text>
          {item.defaultBackend ? (
            <Typography.Text type="secondary" className="text-xs">
              Default {item.defaultBackend}
            </Typography.Text>
          ) : null}
        </Space>
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
            loading={updateIngressYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildIngressRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'Ingress',
                    namespace: item.namespace,
                    name: item.name,
                    impact:
                      'Ingress traffic that depends on this route will stop once the controller reconciles the deletion.',
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
      {sessionMode === 'token' && ingressesQuery.error ? (
        <Alert type="warning" showIcon message="Ingress 数据加载失败" />
      ) : null}

      <ResourceListPage<IngressItem>
        title="Ingress 列表"
        description="查看域名规则、后端服务、暴露地址与 TLS 配置覆盖情况，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && ingressesQuery.isLoading}
        onRefresh={() => ingressesQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="Ingress"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => ingressesQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索 Ingress、Host、Service、地址或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          (record.ingressClass || '').toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.hosts.some((item) => item.toLowerCase().includes(keyword)) ||
          record.addresses.some((item) => item.toLowerCase().includes(keyword)) ||
          record.serviceNames.some((item) => item.toLowerCase().includes(keyword)) ||
          (record.defaultBackend || '').toLowerCase().includes(keyword) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Ingress`}
        onRow={(record) => ({
          onClick: () => navigate(buildIngressRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Ingress YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Ingress YAML'
        }
        resourceKind="Ingress"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={ingressYamlQuery.data}
        loading={ingressYamlQuery.isFetching}
        saving={updateIngressYamlMutation.isPending}
        error={ingressYamlQuery.error}
        errorMessage="Ingress YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void ingressYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateIngressYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
