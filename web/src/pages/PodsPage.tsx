import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Modal, Select, Space, Tabs, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { PodExecTerminalModal } from '../components/pod/PodExecTerminalModal';
import {
  buildPodRoute,
  demoPodDescribe,
  demoPodLogs,
  demoPods,
  demoPodYaml,
  DetailStat,
  displayNamespace,
  isPodReady,
  MetricValue,
  ownerSummary,
  PodTextViewer,
  restartTone,
  statusColor,
} from '../components/pod/podShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  type PodItem,
  type PodLogResult,
  deletePod,
  getPodDescribe,
  getPodLogs,
  getPods,
  getPodYaml,
  updatePodYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

export function PodsPage() {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const token = useAppStore((state) => state.token);
  const [logTarget, setLogTarget] = useState<PodItem>();
  const [logContainer, setLogContainer] = useState<string>();
  const [execTarget, setExecTarget] = useState<PodItem>();
  const [inspectTarget, setInspectTarget] = useState<PodItem>();
  const [inspectTab, setInspectTab] = useState<'yaml' | 'describe'>('yaml');
  const [yamlEditTarget, setYamlEditTarget] = useState<PodItem>();

  const podsQuery = useQuery({
    queryKey: ['pods', currentNamespace],
    queryFn: () => getPods(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const demoItems = useMemo(() => {
    const namespace = currentNamespace.trim();
    return namespace === '' ? demoPods : demoPods.filter((item) => item.namespace === namespace);
  }, [currentNamespace]);
  const items = sessionMode === 'demo' || !podsQuery.data ? demoItems : podsQuery.data;
  const namespaceLabel = displayNamespace(currentNamespace);

  const refreshPods = async () => {
    await podsQuery.refetch();
  };

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) => deletePod(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setLogTarget(undefined);
      setLogContainer(undefined);
      await refreshPods();
    },
  });

  const updatePodYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updatePodYaml(namespace, name, content),
    onSuccess: (result) => {
      void message.success(result.message);
      void refreshPods();
      void podYamlEditorQuery.refetch();
      if (inspectTarget && inspectTab === 'yaml') {
        void podYamlQuery.refetch();
      }
    },
  });

  const podLogsQuery = useQuery({
    queryKey: ['pod-logs', logTarget?.namespace, logTarget?.name, logContainer],
    queryFn: () => getPodLogs(logTarget!.namespace, logTarget!.name, logContainer!),
    enabled: sessionMode === 'token' && Boolean(logTarget && logContainer),
  });

  const podYamlQuery = useQuery({
    queryKey: ['pod-yaml', inspectTarget?.namespace, inspectTarget?.name],
    queryFn: () => getPodYaml(inspectTarget!.namespace, inspectTarget!.name),
    enabled: sessionMode === 'token' && Boolean(inspectTarget),
  });

  const podDescribeQuery = useQuery({
    queryKey: ['pod-describe', inspectTarget?.namespace, inspectTarget?.name],
    queryFn: () => getPodDescribe(inspectTarget!.namespace, inspectTarget!.name),
    enabled: sessionMode === 'token' && Boolean(inspectTarget),
  });

  const podYamlEditorQuery = useQuery({
    queryKey: ['pod-yaml-editor', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getPodYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const openLogModal = (item: PodItem) => {
    setLogTarget(item);
    setLogContainer(item.containers[0]?.name);
  };

  const openExecModal = (item: PodItem) => {
    setExecTarget(item);
  };

  const openInspectModal = (item: PodItem, tab: 'yaml' | 'describe') => {
    setInspectTarget(item);
    setInspectTab(tab);
  };

  const openDeleteConfirm = (item: PodItem) => {
    const owner = ownerSummary(item);
    modal.confirm({
      title: `Delete ${item.name} ?`,
      content:
        owner === '-'
          ? 'This deletes the current Pod immediately.'
          : `This deletes the current Pod. If it is managed by ${owner}, Kubernetes may recreate it automatically.`,
      okText: 'Delete',
      cancelText: 'Cancel',
      okButtonProps: { danger: true },
      onOk: async () =>
        deleteMutation.mutateAsync({
          namespace: item.namespace,
          name: item.name,
        }),
    });
  };

  const metrics = useMemo<ResourceMetric[]>(() => {
    const readyCount = items.filter(isPodReady).length;
    const totalRestarts = items.reduce((sum, item) => sum + item.restartCount, 0);
    const metricsReadyCount = items.filter((item) => item.metricsAvailable).length;
    const unhealthyCount = items.filter((item) => !isPodReady(item)).length;

    return [
      {
        label: 'Pods',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Ready',
        value: `${readyCount}/${items.length}`,
        hint: unhealthyCount > 0 ? `${unhealthyCount} 个 Pod 需要关注` : '当前未发现就绪异常',
        tone: 'blue',
      },
      {
        label: 'Restarts',
        value: totalRestarts,
        hint: '汇总所有容器的重启次数',
        tone: 'amber',
      },
      {
        label: 'Metrics',
        value: `${metricsReadyCount}/${items.length}`,
        hint: 'Pod 级 CPU / Memory 实时指标覆盖度',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<PodItem>[] = [
    {
      title: 'Pod',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.ownerKind ? <Tag color="blue">{item.ownerKind}</Tag> : null}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.nodeName || '-'} · {item.podIP || '-'}
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
          <Tag color={statusColor(item.status)}>{item.status}</Tag>
          <Tag color={isPodReady(item) ? 'green' : 'orange'}>
            Ready {item.readyContainers}/{item.totalContainers}
          </Tag>
          {item.qosClass ? <Tag>{item.qosClass}</Tag> : null}
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
            loading={deleteMutation.isPending}
            menu={{
              items: [
                { key: 'yaml', label: 'YAML' },
                { key: 'describe', label: 'Describe' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'exec', label: 'Exec' },
                { key: 'logs', label: 'Logs' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'yaml') {
                  openInspectModal(item, 'yaml');
                }
                if (key === 'describe') {
                  openInspectModal(item, 'describe');
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                }
                if (key === 'exec') {
                  openExecModal(item);
                }
                if (key === 'logs') {
                  openLogModal(item);
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

  const logContainerOptions =
    logTarget?.containers.map((item) => ({
      label: item.name,
      value: item.name,
    })) ?? [];
  const logResult: PodLogResult | undefined =
    sessionMode === 'demo' && logTarget
      ? {
          namespace: logTarget.namespace,
          name: logTarget.name,
          container: logContainer ?? logTarget.containers[0]?.name ?? '',
          content:
            demoPodLogs[
              `${logTarget.namespace}/${logTarget.name}/${logContainer ?? logTarget.containers[0]?.name ?? ''}`
            ] ?? 'No logs captured for this demo container.',
          generatedAt: '2026-04-13 10:35:00',
        }
      : podLogsQuery.data;

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && podsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="Pod 数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<PodItem>
        title="Pod 列表"
        description="查看当前命名空间内的 Pod 运行状态、重启次数与实时资源使用，点击行可查看容器级详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && podsQuery.isLoading}
        onRefresh={refreshPods}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 Pod、节点、状态、所属资源或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.nodeName.toLowerCase().includes(keyword) ||
          record.podIP.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          `${record.ownerKind ?? ''} ${record.ownerName ?? ''}`.toLowerCase().includes(keyword) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Pod`}
        onRow={(record) => ({
          onClick: () => navigate(buildPodRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <PodExecTerminalModal
        open={Boolean(execTarget)}
        target={execTarget}
        token={token}
        onClose={() => setExecTarget(undefined)}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Pod YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Pod YAML'
        }
        resourceKind="Pod"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={podYamlEditorQuery.data}
        loading={podYamlEditorQuery.isFetching}
        saving={updatePodYamlMutation.isPending}
        error={podYamlEditorQuery.error}
        errorMessage="Pod YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void podYamlEditorQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updatePodYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />

      <Modal
        title={inspectTarget ? `Pod Inspector / ${inspectTarget.namespace}/${inspectTarget.name}` : 'Pod Inspector'}
        open={Boolean(inspectTarget)}
        onCancel={() => setInspectTarget(undefined)}
        footer={null}
        width={980}
      >
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space wrap>
              <Tag color="blue">{inspectTab.toUpperCase()}</Tag>
              <Typography.Text type="secondary">
                {inspectTarget ? `${inspectTarget.namespace}/${inspectTarget.name}` : '-'}
              </Typography.Text>
            </Space>
            {sessionMode === 'token' ? (
              <Button
                onClick={() => {
                  if (inspectTab === 'yaml') {
                    void podYamlQuery.refetch();
                    return;
                  }

                  void podDescribeQuery.refetch();
                }}
                loading={inspectTab === 'yaml' ? podYamlQuery.isFetching : podDescribeQuery.isFetching}
              >
                Refresh
              </Button>
            ) : null}
          </div>

          <Tabs
            activeKey={inspectTab}
            onChange={(key) => setInspectTab(key as 'yaml' | 'describe')}
            items={[
              {
                key: 'yaml',
                label: 'YAML',
                children: (
                  <PodTextViewer
                    error={sessionMode === 'token' ? podYamlQuery.error : undefined}
                    result={
                      sessionMode === 'demo' && inspectTarget
                        ? {
                            namespace: inspectTarget.namespace,
                            name: inspectTarget.name,
                            content:
                              demoPodYaml[`${inspectTarget.namespace}/${inspectTarget.name}`] ??
                              'No YAML available for this demo pod.',
                            generatedAt: '2026-04-13 12:20:00',
                          }
                        : podYamlQuery.data
                    }
                    errorMessage="Pod YAML 加载失败"
                    emptyMessage="No YAML available."
                  />
                ),
              },
              {
                key: 'describe',
                label: 'Describe',
                children: (
                  <PodTextViewer
                    error={sessionMode === 'token' ? podDescribeQuery.error : undefined}
                    result={
                      sessionMode === 'demo' && inspectTarget
                        ? {
                            namespace: inspectTarget.namespace,
                            name: inspectTarget.name,
                            content:
                              demoPodDescribe[`${inspectTarget.namespace}/${inspectTarget.name}`] ??
                              'No describe output available for this demo pod.',
                            generatedAt: '2026-04-13 12:20:00',
                          }
                        : podDescribeQuery.data
                    }
                    errorMessage="Pod describe 加载失败"
                    emptyMessage="No describe output available."
                  />
                ),
              },
            ]}
          />
        </section>
      </Modal>

      <Modal
        title={
          logTarget ? `Pod Logs / ${logTarget.namespace}/${logTarget.name}` : 'Pod Logs'
        }
        open={Boolean(logTarget)}
        onCancel={() => {
          setLogTarget(undefined);
          setLogContainer(undefined);
        }}
        footer={null}
        width={860}
      >
        <section className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Space wrap>
              <Typography.Text type="secondary">Container</Typography.Text>
              <Select
                value={logContainer}
                options={logContainerOptions}
                onChange={setLogContainer}
                style={{ minWidth: 220 }}
              />
            </Space>
            {sessionMode === 'token' ? (
              <Button onClick={() => void podLogsQuery.refetch()} loading={podLogsQuery.isFetching}>
                Refresh
              </Button>
            ) : null}
          </div>

          {sessionMode === 'token' && podLogsQuery.error ? (
            <Alert type="warning" showIcon message="Pod logs 加载失败" />
          ) : null}

          <div className="rounded-[16px] border border-slate-200 bg-slate-950 px-4 py-3 text-slate-100">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span>Container: {logResult?.container || '-'}</span>
              <span>Generated: {logResult?.generatedAt || '-'}</span>
            </div>
            <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-slate-100">
              {logResult?.content || 'No logs available.'}
            </pre>
          </div>
        </section>
      </Modal>
    </section>
  );
}
