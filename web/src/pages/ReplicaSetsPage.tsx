import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, InputNumber, Modal, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildReplicaSetRoute,
  demoReplicaSets,
  displayReplicaSetNamespace,
  isStandaloneReplicaSet,
  MetricValue,
  replicaSetOwnerSummary,
  replicaSetRestartTone,
  replicaSetStatusColor,
} from '../components/replicaset/replicaSetShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type ReplicaSetItem,
  getReplicaSetYaml,
  getReplicaSets,
  scaleReplicaSet,
  updateReplicaSetYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

export function ReplicaSetsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [scaleTarget, setScaleTarget] = useState<ReplicaSetItem>();
  const [scaleValue, setScaleValue] = useState(1);
  const [yamlEditTarget, setYamlEditTarget] = useState<ReplicaSetItem>();

  const replicaSetsQuery = useQuery({
    queryKey: ['replicasets', currentNamespace],
    queryFn: () => getReplicaSets(currentNamespace),
    enabled: sessionMode === 'token',
  });
  const useDemoData =
    sessionMode === 'demo' ||
    (sessionMode === 'token' && Boolean(replicaSetsQuery.error) && !replicaSetsQuery.data);
  const allowOperations = sessionMode === 'token' && !useDemoData;

  const demoItems = useMemo(() => {
    const namespace = currentNamespace.trim();
    return namespace === ''
      ? demoReplicaSets
      : demoReplicaSets.filter((item) => item.namespace === namespace);
  }, [currentNamespace]);
  const items = useDemoData ? demoItems : replicaSetsQuery.data ?? [];
  const namespaceLabel = displayReplicaSetNamespace(currentNamespace);

  const refreshReplicaSets = async () => {
    await replicaSetsQuery.refetch();
  };

  const scaleMutation = useMutation({
    mutationFn: ({ namespace, name, replicas }: { namespace: string; name: string; replicas: number }) =>
      scaleReplicaSet(namespace, name, replicas),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleTarget(undefined);
      await refreshReplicaSets();
    },
  });

  const replicaSetYamlQuery = useQuery({
    queryKey: ['replicaset-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getReplicaSetYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: allowOperations && Boolean(yamlEditTarget),
  });

  const updateReplicaSetYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateReplicaSetYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshReplicaSets();
      void replicaSetYamlQuery.refetch();
    },
  });

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter((item) => item.status === 'Healthy' || item.status === 'ScaledDown').length;
    const totalPods = items.reduce((sum, item) => sum + item.podCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const restartCount = items.reduce((sum, item) => sum + item.restartCount, 0);

    return [
      {
        label: 'ReplicaSets',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: '按副本就绪与可用状态判断',
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
        hint: 'ReplicaSet 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<ReplicaSetItem>[] = [
    {
      title: 'ReplicaSet',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.ownerKind ? <Tag color="blue">{item.ownerKind}</Tag> : <Tag>Standalone</Tag>}
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
      width: 240,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={replicaSetStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.readyReplicas >= item.desiredReplicas ? 'green' : 'orange'}>
            Ready {item.readyReplicas}/{item.desiredReplicas}
          </Tag>
          {item.availableReplicas < item.desiredReplicas ? (
            <Tag color="orange">Available {item.availableReplicas}</Tag>
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
      render: (value) => <Tag color={replicaSetRestartTone(value as number)}>{value}</Tag>,
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
            loading={scaleMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                ...(isStandaloneReplicaSet(item) ? [{ key: 'scale', label: 'Scale' }] : []),
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildReplicaSetRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'scale') {
                  setScaleTarget(item);
                  setScaleValue(item.desiredReplicas);
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
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
          message="ReplicaSet 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<ReplicaSetItem>
        title="ReplicaSet 列表"
        description="查看副本保持情况、匹配 Pod 与聚合资源使用，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && replicaSetsQuery.isLoading}
        onRefresh={refreshReplicaSets}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 ReplicaSet、Owner、镜像、selector 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          replicaSetOwnerSummary(record).toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.selector.some((label) => label.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 ReplicaSet`}
        onRow={(record) => ({
          onClick: () => navigate(buildReplicaSetRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <Modal
        title={
          scaleTarget
            ? `Scale ReplicaSet / ${scaleTarget.namespace}/${scaleTarget.name}`
            : 'Scale ReplicaSet'
        }
        open={Boolean(scaleTarget)}
        onCancel={() => setScaleTarget(undefined)}
        onOk={() => {
          if (!scaleTarget) {
            return;
          }
          void scaleMutation.mutateAsync({
            namespace: scaleTarget.namespace,
            name: scaleTarget.name,
            replicas: scaleValue,
          });
        }}
        okText="确认"
        cancelText="取消"
        confirmLoading={scaleMutation.isPending}
      >
        <section className="space-y-4">
          <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
            Adjust the ReplicaSet replica target. Current value: {scaleTarget?.desiredReplicas ?? 0}.
          </Typography.Paragraph>
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Replicas</div>
            <InputNumber
              min={0}
              precision={0}
              value={scaleValue}
              onChange={(value) => setScaleValue(value == null ? 0 : value)}
              className="w-full"
            />
          </div>
        </section>
      </Modal>

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit ReplicaSet YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit ReplicaSet YAML'
        }
        resourceKind="ReplicaSet"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={replicaSetYamlQuery.data}
        loading={replicaSetYamlQuery.isFetching}
        saving={updateReplicaSetYamlMutation.isPending}
        error={replicaSetYamlQuery.error}
        errorMessage="ReplicaSet YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void replicaSetYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateReplicaSetYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
