import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildResourceQuotaRoute,
  formatResourceQuotaUsagePercent,
  resourceQuotaStatusColor,
  resourceQuotaUsageColor,
} from '../components/resourcequota/resourceQuotaShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  deleteResourceQuota,
  getResourceQuotaYaml,
  getResourceQuotas,
  updateResourceQuotaYaml,
  type ResourceTextResult,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

type ResourceQuotaUsageItem = {
  resource: string;
  used: string;
  hard: string;
  usagePercent?: number | null;
  status?: string;
};

type ResourceQuotaItem = {
  namespace: string;
  name: string;
  status: string;
  summary: string;
  age?: string;
  labels: string[];
  scopes: string[];
  scopeSelectorExpressions: string[];
  usage: ResourceQuotaUsageItem[];
  trackedResourceCount: number;
  exceededResourceCount: number;
};

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

function quotaPreview(items: ResourceQuotaUsageItem[]) {
  if (items.length === 0) {
    return 'No tracked resources';
  }

  const preview = items
    .slice(0, 2)
    .map((item) => `${item.resource} ${item.used}/${item.hard}`)
    .join(' · ');

  return items.length > 2 ? `${preview} +${items.length - 2}` : preview;
}

function scopePreview(item: ResourceQuotaItem) {
  if (item.scopes.length === 0 && item.scopeSelectorExpressions.length === 0) {
    return 'Namespace default scope';
  }

  const summary = [...item.scopes, ...item.scopeSelectorExpressions];
  const preview = summary.slice(0, 2).join(', ');
  return summary.length > 2 ? `${preview} +${summary.length - 2}` : preview;
}

export function ResourceQuotasPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<ResourceQuotaItem>();

  const resourceQuotasQuery = useQuery<ResourceQuotaItem[]>({
    queryKey: ['resourcequotas', currentNamespace],
    queryFn: () => getResourceQuotas(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const resourceQuotaYamlQuery = useQuery<ResourceTextResult>({
    queryKey: ['resourcequota-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getResourceQuotaYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateResourceQuotaYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateResourceQuotaYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await resourceQuotasQuery.refetch();
      await resourceQuotaYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteResourceQuota(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await resourceQuotasQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? resourceQuotasQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const trackedResources = items.reduce((sum, item) => sum + item.trackedResourceCount, 0);
    const exceeded = items.reduce((sum, item) => sum + item.exceededResourceCount, 0);
    const scoped = items.filter(
      (item) => item.scopes.length > 0 || item.scopeSelectorExpressions.length > 0,
    ).length;
    const namespaces = new Set(items.map((item) => item.namespace)).size;

    return [
      {
        label: 'Quotas',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Tracked',
        value: trackedResources,
        hint: '受限资源条目总数',
        tone: 'blue',
      },
      {
        label: 'Exceeded',
        value: exceeded,
        hint: '当前已超过 hard 限额的条目数',
        tone: 'amber',
      },
      {
        label: 'Scoped',
        value: `${scoped} / ${namespaces || 0}`,
        hint: '带 scopes 的 quota 数 / 涉及命名空间数',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<ResourceQuotaItem>[] = [
    {
      title: 'ResourceQuota',
      dataIndex: 'name',
      key: 'name',
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
      width: 220,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={resourceQuotaStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="blue">Tracked {item.trackedResourceCount}</Tag>
          <Tag color={item.exceededResourceCount > 0 ? 'red' : 'green'}>
            Exceeded {item.exceededResourceCount}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Scopes',
      key: 'scopes',
      width: 260,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-700">{scopePreview(item)}</Typography.Text>
      ),
    },
    {
      title: 'Usage',
      key: 'usage',
      width: 320,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-xs text-slate-700">
            {quotaPreview(item.usage)}
          </Typography.Text>
          <Space size={[6, 6]} wrap>
            {item.usage.slice(0, 2).map((entry) => (
              <Tag key={`${item.name}-${entry.resource}`} color={resourceQuotaUsageColor(entry.status)}>
                {formatResourceQuotaUsagePercent(entry.usagePercent) ?? entry.resource}
              </Tag>
            ))}
          </Space>
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
            loading={updateResourceQuotaYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildResourceQuotaRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'ResourceQuota',
                    namespace: item.namespace,
                    name: item.name,
                    impact: 'Namespace quota enforcement for these resources will be removed immediately.',
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
      {sessionMode === 'token' && resourceQuotasQuery.error ? (
        <Alert type="warning" showIcon message="ResourceQuota 数据加载失败" />
      ) : null}

      <ResourceListPage<ResourceQuotaItem>
        title="ResourceQuota 列表"
        description="查看命名空间资源配额、已用量与 hard 限额，快速识别高占用或已触顶的资源策略。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && resourceQuotasQuery.isLoading}
        onRefresh={() => resourceQuotasQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="ResourceQuota"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => resourceQuotasQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索 ResourceQuota、命名空间、资源项、scope、标签或状态"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword)) ||
          record.scopes.some((item) => item.toLowerCase().includes(keyword)) ||
          record.scopeSelectorExpressions.some((item) => item.toLowerCase().includes(keyword)) ||
          record.usage.some(
            (item) =>
              item.resource.toLowerCase().includes(keyword) ||
              item.used.toLowerCase().includes(keyword) ||
              item.hard.toLowerCase().includes(keyword) ||
              (item.status ?? '').toLowerCase().includes(keyword),
          )
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 ResourceQuota`}
        onRow={(record) => ({
          onClick: () => navigate(buildResourceQuotaRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit ResourceQuota YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit ResourceQuota YAML'
        }
        resourceKind="ResourceQuota"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={resourceQuotaYamlQuery.data}
        loading={resourceQuotaYamlQuery.isFetching}
        saving={updateResourceQuotaYamlMutation.isPending}
        error={resourceQuotaYamlQuery.error}
        errorMessage="ResourceQuota YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void resourceQuotaYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateResourceQuotaYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
