import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, InputNumber, Modal, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildDeploymentRoute,
  demoDeployments,
  deploymentStatusColor,
  displayDeploymentNamespace,
  isDeploymentHealthy,
  MetricValue,
  restartTone,
} from '../components/deployment/deploymentShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type DeploymentItem,
  deleteDeployment,
  getDeploymentYaml,
  getDeployments,
  restartDeployment,
  scaleDeployment,
  updateDeploymentYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

export function DeploymentsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [scaleTarget, setScaleTarget] = useState<DeploymentItem>();
  const [scaleValue, setScaleValue] = useState(1);
  const [yamlEditTarget, setYamlEditTarget] = useState<DeploymentItem>();

  const deploymentsQuery = useQuery({
    queryKey: ['deployments', currentNamespace],
    queryFn: () => getDeployments(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const demoItems = useMemo(() => {
    const namespace = currentNamespace.trim();
    return namespace === ''
      ? demoDeployments
      : demoDeployments.filter((item) => item.namespace === namespace);
  }, [currentNamespace]);
  const items =
    sessionMode === 'demo' || !deploymentsQuery.data
      ? demoItems
      : deploymentsQuery.data;

  const refreshDeployments = async () => {
    await deploymentsQuery.refetch();
  };

  const scaleMutation = useMutation({
    mutationFn: ({ namespace, name, replicas }: { namespace: string; name: string; replicas: number }) =>
      scaleDeployment(namespace, name, replicas),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleTarget(undefined);
      await refreshDeployments();
    },
  });

  const restartMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      restartDeployment(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshDeployments();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteDeployment(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setScaleTarget(undefined);
      setYamlEditTarget(undefined);
      await refreshDeployments();
    },
  });

  const deploymentYamlQuery = useQuery({
    queryKey: ['deployment-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getDeploymentYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateDeploymentYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateDeploymentYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshDeployments();
      void deploymentYamlQuery.refetch();
    },
  });

  const namespaceLabel = displayDeploymentNamespace(currentNamespace);

  const openScaleModal = (item: DeploymentItem) => {
    setScaleTarget(item);
    setScaleValue(item.desiredReplicas);
  };

  const handleScaleSubmit = async () => {
    if (!scaleTarget) {
      return;
    }

    await scaleMutation.mutateAsync({
      namespace: scaleTarget.namespace,
      name: scaleTarget.name,
      replicas: scaleValue,
    });
  };

  const openRestartConfirm = (item: DeploymentItem) => {
    modal.confirm({
      title: `重启 ${item.name} ?`,
      content: '会通过 rollout restart 触发新一轮 Pod 滚动更新。',
      okText: '重启',
      cancelText: '取消',
      onOk: async () =>
        restartMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
    });
  };

  const openDeleteConfirm = (item: DeploymentItem) => {
    confirmResourceDelete({
      resourceKind: 'Deployment',
      namespace: item.namespace,
      name: item.name,
      impact:
        'This removes the Deployment and its managed ReplicaSets and Pods will be reconciled away by Kubernetes.',
      onConfirm: () =>
        deleteMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter(isDeploymentHealthy).length;
    const totalPods = items.reduce((sum, item) => sum + item.podCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const restartCount = items.reduce((sum, item) => sum + item.restartCount, 0);

    return [
      {
        label: 'Deployments',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: '按副本可用性与更新进度判断',
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
        hint: 'Deployment 聚合 CPU / Memory 覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<DeploymentItem>[] = [
    {
      title: 'Deployment',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.strategy}</Tag>
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
          <Tag color={deploymentStatusColor(item.status)}>{item.status}</Tag>
          <Tag color={item.availableReplicas >= item.desiredReplicas ? 'green' : 'orange'}>
            Ready {item.availableReplicas}/{item.desiredReplicas}
          </Tag>
          {item.unavailableReplicas > 0 ? (
            <Tag color="orange">Unavailable {item.unavailableReplicas}</Tag>
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
      render: (value) => <Tag color={restartTone(value as number)}>{value}</Tag>,
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
        sessionMode === 'demo' ? (
          <Tag>Demo</Tag>
        ) : (
          <ActionMenuButton
            loading={restartMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'scale', label: 'Scale' },
                { key: 'restart', label: <span className="text-amber-700">Restart</span> },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildDeploymentRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'scale') {
                  openScaleModal(item);
                  return;
                }
                if (key === 'restart') {
                  openRestartConfirm(item);
                  return;
                }
                if (key === 'delete') {
                  openDeleteConfirm(item);
                }
              },
            }}
          />
        ),
    },
  ];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && deploymentsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="Deployment 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<DeploymentItem>
        title="Deployment 列表"
        description="查看副本可用性、滚动发布状态和聚合资源使用，点击行可查看匹配 Pod 与条件详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && deploymentsQuery.isLoading}
        onRefresh={refreshDeployments}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <Tag color="cyan">
              Metrics Ready: {items.filter((item) => item.metricsAvailable).length}/{items.length}
            </Tag>
            <ResourceYamlCreateButton
              resourceKind="Deployment"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={refreshDeployments}
            />
          </Space>
        }
        searchPlaceholder="搜索 Deployment、状态、镜像、selector 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.images.some((image) => image.toLowerCase().includes(keyword)) ||
          record.selector.some((label) => label.toLowerCase().includes(keyword)) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Deployment`}
        onRow={(record) => ({
          onClick: () => navigate(buildDeploymentRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <Modal
        title={
          scaleTarget
            ? `Scale Deployment / ${scaleTarget.namespace}/${scaleTarget.name}`
            : 'Scale Deployment'
        }
        open={Boolean(scaleTarget)}
        onCancel={() => setScaleTarget(undefined)}
        onOk={() => void handleScaleSubmit()}
        okText="确认"
        cancelText="取消"
        confirmLoading={scaleMutation.isPending}
      >
        <section className="space-y-4">
          <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
            Adjust the Deployment replica target. Current value: {scaleTarget?.desiredReplicas ?? 0}.
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
            ? `Edit Deployment YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Deployment YAML'
        }
        resourceKind="Deployment"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={deploymentYamlQuery.data}
        loading={deploymentYamlQuery.isFetching}
        saving={updateDeploymentYamlMutation.isPending}
        error={deploymentYamlQuery.error}
        errorMessage="Deployment YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void deploymentYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateDeploymentYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
