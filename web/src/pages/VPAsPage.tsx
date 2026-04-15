import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import {
  buildVPARoute,
  extractMutationMessage,
  listVPAs,
  policyPreview,
  readVPAReadiness,
  readVPAYaml,
  recommendationPreview,
  saveVPAYaml,
  targetSummary,
  vpaStatusColor,
  type VPAItem,
} from '../components/vpa/vpaShared';
import { useAppStore } from '../stores/appStore';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

export function VPAsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<VPAItem>();

  const vpasQuery = useQuery({
    queryKey: ['vpas', currentNamespace],
    queryFn: () => listVPAs(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const readinessQuery = useQuery({
    queryKey: ['vpa-readiness'],
    queryFn: () => readVPAReadiness(),
    enabled: sessionMode === 'token',
  });

  const vpaYamlQuery = useQuery({
    queryKey: ['vpa-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => readVPAYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateVPAYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      saveVPAYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(extractMutationMessage(result, 'VPA YAML updated'));
      await vpasQuery.refetch();
      await vpaYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? vpasQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const targetCount = new Set(items.map((item) => `${item.namespace}/${targetSummary(item)}`)).size;
    const effectiveCount = items.filter((item) =>
      ['healthy', 'ready', 'stable'].includes(item.effectivenessStatus.toLowerCase()),
    ).length;
    const attentionCount = items.filter((item) =>
      ['warning', 'error', 'failed', 'scaling'].includes(item.effectivenessStatus.toLowerCase()),
    ).length;

    return [
      {
        label: 'VPAs',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Targets',
        value: targetCount,
        hint: '受 VPA 管理的工作负载数量',
        tone: 'blue',
      },
      {
        label: 'Effective',
        value: effectiveCount,
        hint: '已看到 VPA 更新痕迹的工作负载',
        tone: 'blue',
      },
      {
        label: 'Attention',
        value: attentionCount,
        hint: '仍需人工关注生效链路的 VPA',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<VPAItem>[] = [
    {
      title: 'VPA',
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
      width: 340,
      render: (_, item) => (
        <Space direction="vertical" size={4}>
          <Space size={[6, 6]} wrap>
            <Tag color={vpaStatusColor(item.status)}>{item.status}</Tag>
            <Tag color={vpaStatusColor(item.effectivenessStatus)}>{item.effectivenessStatus}</Tag>
            <Tag color="blue">{item.updateMode}</Tag>
          </Space>
          <Typography.Text className="text-xs text-slate-700">
            {item.effectivenessSummary}
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            Pods {item.appliedPodCount}/{item.matchedPodCount}
            {item.targetReplicaCount > 0 ? ` · Target ${item.targetReplicaCount}` : ''}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Target',
      key: 'target',
      width: 240,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{targetSummary(item)}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.scaleTargetApiVersion}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Policies',
      key: 'policies',
      width: 320,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-xs text-slate-700">
            {policyPreview(item.resourcePolicies)}
          </Typography.Text>
          <Space size={[6, 6]} wrap>
            <Tag color="blue">Policies {item.containerPolicyCount}</Tag>
            <Tag color="purple">Conditions {item.conditionCount}</Tag>
          </Space>
        </Space>
      ),
    },
    {
      title: 'Recommendations',
      key: 'recommendations',
      width: 320,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-700">
          {recommendationPreview(item.recommendations)}
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
            loading={updateVPAYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildVPARoute(item.namespace, item.name));
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
      {sessionMode === 'token' && vpasQuery.error ? (
        <Alert type="warning" showIcon message="VPA 数据加载失败" />
      ) : null}

      {sessionMode === 'token' && readinessQuery.data && readinessQuery.data.status !== 'healthy' ? (
        <Alert
          type={readinessQuery.data.status === 'error' ? 'error' : 'warning'}
          showIcon
          message={`VPA readiness: ${readinessQuery.data.summary}`}
          description={readinessQuery.data.checks
            .filter((item) => item.status !== 'healthy')
            .slice(0, 2)
            .map((item) => `${item.label}: ${item.summary}`)
            .join(' · ')}
        />
      ) : null}

      <ResourceListPage<VPAItem>
        title="VPA 列表"
        description="查看垂直自动伸缩策略、集群 readiness，以及每个工作负载是否真正落地了资源更新。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && vpasQuery.isLoading}
        onRefresh={() => vpasQuery.refetch()}
        toolbarExtra={
          <Space size={[8, 8]} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            {readinessQuery.data ? (
              <Tag color={vpaStatusColor(readinessQuery.data.status)}>
                Readiness {readinessQuery.data.status}
              </Tag>
            ) : null}
          </Space>
        }
        searchPlaceholder="搜索 VPA、命名空间、目标工作负载、update mode、容器策略或建议"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.effectivenessStatus.toLowerCase().includes(keyword) ||
          record.effectivenessSummary.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.updateMode.toLowerCase().includes(keyword) ||
          record.scaleTargetKind.toLowerCase().includes(keyword) ||
          record.scaleTargetName.toLowerCase().includes(keyword) ||
          record.scaleTargetApiVersion.toLowerCase().includes(keyword) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword)) ||
          record.resourcePolicies.some(
            (item) =>
              item.containerName.toLowerCase().includes(keyword) ||
              item.mode?.toLowerCase().includes(keyword) ||
              item.summary.toLowerCase().includes(keyword) ||
              item.controlledResources.some((value) => value.toLowerCase().includes(keyword)) ||
              item.minAllowed.some((value) => value.toLowerCase().includes(keyword)) ||
              item.maxAllowed.some((value) => value.toLowerCase().includes(keyword)),
          ) ||
          record.recommendations.some(
            (item) =>
              item.containerName.toLowerCase().includes(keyword) ||
              item.summary.toLowerCase().includes(keyword) ||
              item.target.some((value) => value.toLowerCase().includes(keyword)) ||
              item.lowerBound.some((value) => value.toLowerCase().includes(keyword)) ||
              item.upperBound.some((value) => value.toLowerCase().includes(keyword)),
          ) ||
          record.conditions.some(
            (item) =>
              item.type.toLowerCase().includes(keyword) ||
              item.status.toLowerCase().includes(keyword) ||
              (item.reason ?? '').toLowerCase().includes(keyword) ||
              (item.message ?? '').toLowerCase().includes(keyword),
          ) ||
          record.insights.some(
            (item) =>
              item.level.toLowerCase().includes(keyword) ||
              item.code.toLowerCase().includes(keyword) ||
              item.summary.toLowerCase().includes(keyword) ||
              (item.detail ?? '').toLowerCase().includes(keyword),
          )
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 VPA。若当前集群未安装 VPA CRD，这里会保持为空。`}
        onRow={(record) => ({
          onClick: () => navigate(buildVPARoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit VPA YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit VPA YAML'
        }
        resourceKind="VerticalPodAutoscaler"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={vpaYamlQuery.data}
        loading={vpaYamlQuery.isFetching}
        saving={updateVPAYamlMutation.isPending}
        error={vpaYamlQuery.error}
        errorMessage="VPA YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void vpaYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateVPAYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
