import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { buildLimitRangeRoute, limitRangeStatusColor } from '../components/limitrange/limitRangeShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  deleteLimitRange,
  getLimitRangeYaml,
  getLimitRanges,
  updateLimitRangeYaml,
  type ResourceTextResult,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

type LimitRangeEntryItem = {
  type: string;
  summary: string;
  min: string[];
  max: string[];
  default: string[];
  defaultRequest: string[];
  maxLimitRequestRatio: string[];
};

type LimitRangeItem = {
  namespace: string;
  name: string;
  status: string;
  summary: string;
  age?: string;
  labels: string[];
  types: string[];
  limitCount: number;
  limits: LimitRangeEntryItem[];
};

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

function preview(items: string[]) {
  if (items.length === 0) {
    return '-';
  }

  const text = items.slice(0, 2).join(', ');
  return items.length > 2 ? `${text} +${items.length - 2}` : text;
}

function defaultsSummary(item: LimitRangeItem) {
  const defaults = item.limits.flatMap((entry) => [...entry.default, ...entry.defaultRequest]);
  return defaults.length > 0 ? preview(defaults) : 'No default values';
}

export function LimitRangesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<LimitRangeItem>();

  const limitRangesQuery = useQuery<LimitRangeItem[]>({
    queryKey: ['limitranges', currentNamespace],
    queryFn: () => getLimitRanges(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const limitRangeYamlQuery = useQuery<ResourceTextResult>({
    queryKey: ['limitrange-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getLimitRangeYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateLimitRangeYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateLimitRangeYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await limitRangesQuery.refetch();
      await limitRangeYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteLimitRange(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await limitRangesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? limitRangesQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const entries = items.reduce((sum, item) => sum + item.limitCount, 0);
    const types = new Set(items.flatMap((item) => item.types)).size;
    const defaults = items.filter((item) =>
      item.limits.some((entry) => entry.default.length > 0 || entry.defaultRequest.length > 0),
    ).length;
    const ratioRules = items.filter((item) =>
      item.limits.some((entry) => entry.maxLimitRequestRatio.length > 0),
    ).length;

    return [
      {
        label: 'LimitRanges',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Entries',
        value: entries,
        hint: 'limit 条目总数',
        tone: 'blue',
      },
      {
        label: 'Types',
        value: types,
        hint: '涉及资源对象类型数量',
        tone: 'amber',
      },
      {
        label: 'Defaults',
        value: `${defaults} / ${ratioRules}`,
        hint: '带默认值策略的对象数 / 带 ratio 规则的对象数',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<LimitRangeItem>[] = [
    {
      title: 'LimitRange',
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
          <Tag color={limitRangeStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="blue">Entries {item.limitCount}</Tag>
          <Tag color="cyan">{item.types.length > 0 ? item.types.join(', ') : 'Mixed'}</Tag>
        </Space>
      ),
    },
    {
      title: 'Rules',
      key: 'rules',
      width: 300,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-700">
          {defaultsSummary(item)}
        </Typography.Text>
      ),
    },
    {
      title: 'Type Coverage',
      key: 'types',
      width: 260,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.types.length > 0 ? preview(item.types) : 'No explicit types'}
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
            loading={updateLimitRangeYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildLimitRangeRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'LimitRange',
                    namespace: item.namespace,
                    name: item.name,
                    impact:
                      'Default resource request and limit enforcement for this namespace will be removed.',
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
      {sessionMode === 'token' && limitRangesQuery.error ? (
        <Alert type="warning" showIcon message="LimitRange 数据加载失败" />
      ) : null}

      <ResourceListPage<LimitRangeItem>
        title="LimitRange 列表"
        description="查看命名空间默认 request / limit、最小最大边界以及 limit:request ratio 约束。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && limitRangesQuery.isLoading}
        onRefresh={() => limitRangesQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="LimitRange"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => limitRangesQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索 LimitRange、命名空间、类型、默认值、边界规则或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.types.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword)) ||
          record.limits.some(
            (item) =>
              item.type.toLowerCase().includes(keyword) ||
              item.summary.toLowerCase().includes(keyword) ||
              item.min.some((value) => value.toLowerCase().includes(keyword)) ||
              item.max.some((value) => value.toLowerCase().includes(keyword)) ||
              item.default.some((value) => value.toLowerCase().includes(keyword)) ||
              item.defaultRequest.some((value) => value.toLowerCase().includes(keyword)) ||
              item.maxLimitRequestRatio.some((value) => value.toLowerCase().includes(keyword)),
          )
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 LimitRange`}
        onRow={(record) => ({
          onClick: () => navigate(buildLimitRangeRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit LimitRange YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit LimitRange YAML'
        }
        resourceKind="LimitRange"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={limitRangeYamlQuery.data}
        loading={limitRangeYamlQuery.isFetching}
        saving={updateLimitRangeYamlMutation.isPending}
        error={limitRangeYamlQuery.error}
        errorMessage="LimitRange YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void limitRangeYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateLimitRangeYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
