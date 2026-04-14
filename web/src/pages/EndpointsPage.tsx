import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { buildEndpointRoute, endpointStatusColor } from '../components/endpoint/endpointShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type EndpointItem,
  getEndpointYaml,
  getEndpoints,
  updateEndpointYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

export function EndpointsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<EndpointItem>();

  const endpointsQuery = useQuery({
    queryKey: ['endpoints', currentNamespace],
    queryFn: () => getEndpoints(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const endpointYamlQuery = useQuery({
    queryKey: ['endpoint-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getEndpointYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateEndpointYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateEndpointYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await endpointsQuery.refetch();
      await endpointYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? endpointsQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter((item) => item.status === 'healthy').length;
    const readyAddresses = items.reduce((sum, item) => sum + item.readyAddresses, 0);
    const notReadyAddresses = items.reduce((sum, item) => sum + item.notReadyAddresses, 0);
    const serviceLinked = items.filter((item) => Boolean(item.serviceName)).length;

    return [
      {
        label: 'Endpoints',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: '至少包含 Ready 地址',
        tone: 'blue',
      },
      {
        label: 'Ready',
        value: readyAddresses,
        hint: `NotReady ${notReadyAddresses}`,
        tone: 'amber',
      },
      {
        label: 'Service',
        value: serviceLinked,
        hint: '与同名 Service 绑定的 Endpoints',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<EndpointItem>[] = [
    {
      title: 'Endpoint',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.serviceName ? <Tag color="blue">Service</Tag> : <Tag>Standalone</Tag>}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.subsets} subsets
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 260,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={endpointStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.readyAddresses > 0 ? 'green' : 'orange'}>
            Ready {item.readyAddresses}
          </Tag>
          {item.notReadyAddresses > 0 ? <Tag color="orange">NotReady {item.notReadyAddresses}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Ports',
      dataIndex: 'portsSummary',
      key: 'portsSummary',
      width: 180,
      render: (value) => (
        <Typography.Text className="font-mono text-xs text-slate-700">{String(value || '-')}</Typography.Text>
      ),
    },
    {
      title: 'Addresses',
      key: 'addresses',
      width: 320,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.addresses.slice(0, 3).map((entry) => entry.targetName || entry.ip).join(', ') || '-'}
          {item.addresses.length > 3 ? ` +${item.addresses.length - 3}` : ''}
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
            loading={updateEndpointYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildEndpointRoute(item.namespace, item.name));
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
      {sessionMode === 'token' && endpointsQuery.error ? (
        <Alert type="warning" showIcon message="Endpoints 数据加载失败" />
      ) : null}

      <ResourceListPage<EndpointItem>
        title="Endpoints 列表"
        description="查看后端地址映射、就绪状态与同名 Service 的服务发现关系，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && endpointsQuery.isLoading}
        onRefresh={() => endpointsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 Endpoint、地址、目标 Pod、端口或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          (record.serviceName || '').toLowerCase().includes(keyword) ||
          record.portsSummary.toLowerCase().includes(keyword) ||
          record.addresses.some(
            (item) =>
              item.ip.toLowerCase().includes(keyword) ||
              (item.targetName || '').toLowerCase().includes(keyword) ||
              (item.targetKind || '').toLowerCase().includes(keyword),
          ) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Endpoints`}
        onRow={(record) => ({
          onClick: () => navigate(buildEndpointRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Endpoints YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Endpoints YAML'
        }
        resourceKind="Endpoints"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={endpointYamlQuery.data}
        loading={endpointYamlQuery.isFetching}
        saving={updateEndpointYamlMutation.isPending}
        error={endpointYamlQuery.error}
        errorMessage="Endpoints YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void endpointYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateEndpointYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
