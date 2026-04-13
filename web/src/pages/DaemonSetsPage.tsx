import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildDaemonSetRoute,
  daemonSetRestartTone,
  daemonSetStatusColor,
  demoDaemonSets,
  displayDaemonSetNamespace,
  MetricValue,
} from '../components/daemonset/daemonSetShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type DaemonSetItem,
  getDaemonSetYaml,
  getDaemonSets,
  restartDaemonSet,
  updateDaemonSetYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

export function DaemonSetsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<DaemonSetItem>();

  const daemonSetsQuery = useQuery({
    queryKey: ['daemonsets', currentNamespace],
    queryFn: () => getDaemonSets(currentNamespace),
    enabled: sessionMode === 'token',
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(daemonSetsQuery.error) && !daemonSetsQuery.data);
  const allowOperations = sessionMode === 'token' && !useDemoData;

  const demoItems = useMemo(() => {
    const namespace = currentNamespace.trim();
    return namespace === ''
      ? demoDaemonSets
      : demoDaemonSets.filter((item) => item.namespace === namespace);
  }, [currentNamespace]);
  const items = useDemoData ? demoItems : daemonSetsQuery.data ?? [];
  const namespaceLabel = displayDaemonSetNamespace(currentNamespace);

  const refreshDaemonSets = async () => {
    await daemonSetsQuery.refetch();
  };

  const restartMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      restartDaemonSet(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshDaemonSets();
    },
  });

  const daemonSetYamlQuery = useQuery({
    queryKey: ['daemonset-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getDaemonSetYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: allowOperations && Boolean(yamlEditTarget),
  });

  const updateDaemonSetYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateDaemonSetYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshDaemonSets();
      void daemonSetYamlQuery.refetch();
    },
  });

  const openRestartConfirm = (item: DaemonSetItem) => {
    modal.confirm({
      title: `Restart ${item.name} ?`,
      content: 'This triggers a rolling update and recreates DaemonSet Pods.',
      okText: 'Restart',
      cancelText: 'Cancel',
      onOk: async () =>
        restartMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter((item) => item.status === 'Healthy' || item.status === 'ScaledDown').length;
    const totalPods = items.reduce((sum, item) => sum + item.podCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const restartCount = items.reduce((sum, item) => sum + item.restartCount, 0);

    return [
      {
        label: 'DaemonSets',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: '按调度覆盖与可用状态判断',
        tone: 'blue',
      },
      {
        label: 'Pods',
        value: totalPods,
        hint: `关联 Pod 总数，重启累计 ${restartCount}`,
        tone: 'amber',
      },
      {
        label: 'Metrics',
        value: `${metricsReadyCount}/${items.length}`,
        hint: 'DaemonSet 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<DaemonSetItem>[] = [
    {
      title: 'DaemonSet',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.updateStrategy}</Tag>
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.podCount} pods
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
          <Tag color={daemonSetStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.numberReady >= item.desiredNumberScheduled ? 'green' : 'orange'}>
            Ready {item.numberReady}/{item.desiredNumberScheduled}
          </Tag>
          {item.numberUnavailable > 0 ? (
            <Tag color="orange">Unavailable {item.numberUnavailable}</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'CPU',
      key: 'cpu',
      width: 120,
      render: (_, item) => <MetricValue available={item.metricsAvailable} value={item.cpuUsage} />,
    },
    {
      title: 'Memory',
      key: 'memory',
      width: 140,
      render: (_, item) => (
        <MetricValue available={item.metricsAvailable} value={item.memoryUsage} />
      ),
    },
    {
      title: 'Restarts',
      dataIndex: 'restartCount',
      key: 'restartCount',
      width: 110,
      render: (value) => <Tag color={daemonSetRestartTone(value as number)}>{value}</Tag>,
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
        allowOperations ? (
          <ActionMenuButton
            loading={restartMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'restart', label: <span className="text-amber-700">Restart</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildDaemonSetRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'restart') {
                  openRestartConfirm(item);
                }
              },
            }}
          />
        ) : (
          <Tag>{useDemoData ? 'Demo' : 'ReadOnly'}</Tag>
        ),
    },
  ];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && useDemoData ? (
        <Alert
          type="warning"
          showIcon
          message="DaemonSet 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<DaemonSetItem>
        title="DaemonSet 列表"
        description="查看节点覆盖、可用副本与聚合资源使用，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && daemonSetsQuery.isLoading}
        onRefresh={refreshDaemonSets}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 DaemonSet、状态、镜像、selector 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.selector.some((label) => label.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 DaemonSet`}
        onRow={(record) => ({
          onClick: () => navigate(buildDaemonSetRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit DaemonSet YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit DaemonSet YAML'
        }
        resourceKind="DaemonSet"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={daemonSetYamlQuery.data}
        loading={daemonSetYamlQuery.isFetching}
        saving={updateDaemonSetYamlMutation.isPending}
        error={daemonSetYamlQuery.error}
        errorMessage="DaemonSet YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void daemonSetYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateDaemonSetYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
