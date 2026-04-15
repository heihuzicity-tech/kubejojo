import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { buildServiceRoute, serviceStatusColor } from '../components/service/serviceShared';
import {
  type ServiceItem,
  deleteService,
  getServiceYaml,
  getServices,
  updateServiceYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

export function ServicesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<ServiceItem>();

  const servicesQuery = useQuery({
    queryKey: ['services', currentNamespace],
    queryFn: () => getServices(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const serviceYamlQuery = useQuery({
    queryKey: ['service-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getServiceYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateServiceYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateServiceYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await servicesQuery.refetch();
      await serviceYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteService(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await servicesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? servicesQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const exposedCount = items.filter(
      (item) =>
        item.type === 'LoadBalancer' ||
        item.type === 'NodePort' ||
        item.type === 'ExternalName' ||
        item.externalAddresses.length > 0,
    ).length;
    const routedCount = items.filter((item) => item.podCount > 0).length;
    const headlessCount = items.filter((item) => item.clusterIP === 'None').length;

    return [
      {
        label: 'Services',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Exposed',
        value: `${exposedCount}/${items.length}`,
        hint: 'NodePort / LoadBalancer / ExternalName',
        tone: 'blue',
      },
      {
        label: 'Backends',
        value: routedCount,
        hint: '至少选择到 1 个 Pod 的 Service',
        tone: 'amber',
      },
      {
        label: 'Headless',
        value: headlessCount,
        hint: 'ClusterIP = None',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<ServiceItem>[] = [
    {
      title: 'Service',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
          <Tag color="blue">{item.type}</Tag>
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
      width: 260,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={serviceStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.podCount > 0 ? 'green' : item.selector.length > 0 ? 'orange' : 'default'}>
            Pods {item.podCount}
          </Tag>
          {item.sessionAffinity !== 'None' ? <Tag color="purple">{item.sessionAffinity}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Ports',
      dataIndex: 'portsSummary',
      key: 'portsSummary',
      width: 220,
      render: (value) => (
        <Typography.Text className="font-mono text-xs text-slate-700">{String(value || '-')}</Typography.Text>
      ),
    },
    {
      title: 'Access',
      key: 'access',
      width: 260,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">ClusterIP {item.clusterIP}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.externalName ||
              (item.externalAddresses.length > 0 ? item.externalAddresses.join(', ') : 'Internal only')}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Selector',
      key: 'selector',
      width: 240,
      render: (_, item) =>
        item.selector.length > 0 ? (
          <Typography.Text className="text-xs text-slate-600">
            {item.selector.join(', ')}
          </Typography.Text>
        ) : (
          <Typography.Text type="secondary" className="text-xs">
            No selector
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
            loading={updateServiceYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildServiceRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'Service',
                    namespace: item.namespace,
                    name: item.name,
                    impact:
                      'Traffic routed through this Service will stop immediately for clients that depend on it.',
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
      {sessionMode === 'token' && servicesQuery.error ? (
        <Alert type="warning" showIcon message="Service 数据加载失败" />
      ) : null}

      <ResourceListPage<ServiceItem>
        title="Service 列表"
        description="查看服务暴露方式、端口映射、选择器与后端 Pod 覆盖情况，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && servicesQuery.isLoading}
        onRefresh={() => servicesQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="Service"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => servicesQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索 Service、类型、端口、地址或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.type.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.clusterIP.toLowerCase().includes(keyword) ||
          (record.externalName || '').toLowerCase().includes(keyword) ||
          record.externalAddresses.some((item) => item.toLowerCase().includes(keyword)) ||
          record.portsSummary.toLowerCase().includes(keyword) ||
          record.selector.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Service`}
        onRow={(record) => ({
          onClick: () => navigate(buildServiceRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Service YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Service YAML'
        }
        resourceKind="Service"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={serviceYamlQuery.data}
        loading={serviceYamlQuery.isFetching}
        saving={updateServiceYamlMutation.isPending}
        error={serviceYamlQuery.error}
        errorMessage="Service YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void serviceYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateServiceYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
