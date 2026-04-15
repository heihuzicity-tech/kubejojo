import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildHPARoute,
  extractMutationMessage,
  hpaStatusColor,
  listHPAs,
  metricPreview,
  readHPAYaml,
  removeHPA,
  replicaSummary,
  saveHPAYaml,
  targetSummary,
  type HPAItem,
} from '../components/hpa/hpaShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

export function HPAsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<HPAItem>();

  const hpasQuery = useQuery({
    queryKey: ['hpas', currentNamespace],
    queryFn: () => listHPAs(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const hpaYamlQuery = useQuery({
    queryKey: ['hpa-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => readHPAYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateHPAYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      saveHPAYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(extractMutationMessage(result, 'HPA YAML updated'));
      await hpasQuery.refetch();
      await hpaYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) => removeHPA(namespace, name),
    onSuccess: async (result) => {
      void message.success(extractMutationMessage(result, 'HPA deleted'));
      setYamlEditTarget(undefined);
      await hpasQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? hpasQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const targetCount = new Set(items.map((item) => `${item.namespace}/${targetSummary(item)}`)).size;
    const desiredReplicas = items.reduce((sum, item) => sum + item.desiredReplicas, 0);
    const currentReplicas = items.reduce((sum, item) => sum + item.currentReplicas, 0);
    const warningCount = items.filter(
      (item) =>
        ['warning', 'error', 'failed', 'scaling'].includes(item.status.toLowerCase()) ||
        item.currentReplicas !== item.desiredReplicas,
    ).length;

    return [
      {
        label: 'HPAs',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Targets',
        value: targetCount,
        hint: '被 HPA 控制的工作负载数量',
        tone: 'blue',
      },
      {
        label: 'Current / Desired',
        value: `${currentReplicas}/${desiredReplicas}`,
        hint: '聚合副本数',
        tone: 'amber',
      },
      {
        label: 'Warnings',
        value: warningCount,
        hint: '缩容中、扩容中或状态异常的 HPA',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<HPAItem>[] = [
    {
      title: 'HPA',
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
      width: 240,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={hpaStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.currentReplicas === item.desiredReplicas ? 'green' : 'orange'}>
            {item.currentReplicas === item.desiredReplicas ? 'Stable' : 'Scaling'}
          </Tag>
          <Tag color="blue">Metrics {item.metricCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'Target',
      key: 'target',
      width: 240,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-xs text-slate-700">{targetSummary(item)}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.scaleTargetApiVersion}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Replicas',
      key: 'replicas',
      width: 220,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-700">{replicaSummary(item)}</Typography.Text>
      ),
    },
    {
      title: 'Metrics',
      key: 'metrics',
      width: 320,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">{metricPreview(item.metrics)}</Typography.Text>
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
            loading={updateHPAYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildHPARoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'HorizontalPodAutoscaler',
                    namespace: item.namespace,
                    name: item.name,
                    impact:
                      'Automatic horizontal scaling for the target workload will stop after this HPA is removed.',
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
      {sessionMode === 'token' && hpasQuery.error ? (
        <Alert type="warning" showIcon message="HPA 数据加载失败" />
      ) : null}

      <ResourceListPage<HPAItem>
        title="HPA 列表"
        description="查看水平自动伸缩规则、目标工作负载、副本范围和当前度量指标，支持 YAML 编辑入口接线。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && hpasQuery.isLoading}
        onRefresh={() => hpasQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="HorizontalPodAutoscaler"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => hpasQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索 HPA、命名空间、目标工作负载、状态、指标或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.scaleTargetKind.toLowerCase().includes(keyword) ||
          record.scaleTargetName.toLowerCase().includes(keyword) ||
          record.scaleTargetApiVersion.toLowerCase().includes(keyword) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword)) ||
          record.metrics.some(
            (item) =>
              item.type.toLowerCase().includes(keyword) ||
              item.name.toLowerCase().includes(keyword) ||
              item.summary.toLowerCase().includes(keyword) ||
              item.current.toLowerCase().includes(keyword) ||
              item.target.toLowerCase().includes(keyword),
          ) ||
          record.conditions.some(
            (item) =>
              item.type.toLowerCase().includes(keyword) ||
              item.status.toLowerCase().includes(keyword) ||
              item.reason.toLowerCase().includes(keyword) ||
              item.message.toLowerCase().includes(keyword),
          )
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 HPA`}
        onRow={(record) => ({
          onClick: () => navigate(buildHPARoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit HPA YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit HPA YAML'
        }
        resourceKind="HorizontalPodAutoscaler"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={hpaYamlQuery.data}
        loading={hpaYamlQuery.isFetching}
        saving={updateHPAYamlMutation.isPending}
        error={hpaYamlQuery.error}
        errorMessage="HPA YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void hpaYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateHPAYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
