import { type ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Drawer,
  Progress,
  Space,
  Tag,
  Typography,
} from 'antd';
import { useMemo, useState } from 'react';

import {
  ResourceListPage,
  type ResourceMetric,
} from '../components/resource-list/ResourceListPage';
import {
  type NodeConditionItem,
  type NodeItem,
  getNodes,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoNodes: NodeItem[] = [
  {
    name: 'k8s-master',
    role: 'control-plane',
    ip: '10.0.0.101',
    status: 'Ready,SchedulingDisabled',
    ready: true,
    schedulable: false,
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
    architecture: 'arm64',
    podCount: 8,
    age: '120d',
    createdAt: '2025-12-12 10:00:00',
    metricsAvailable: true,
    cpuUsage: '730m / 4000m',
    cpuUsagePercent: 18.3,
    memoryUsage: '2.3 GiB / 7.6 GiB',
    memoryUsagePercent: 30.1,
    cpuAllocatable: '4000m',
    memoryAllocatable: '7.6 GiB',
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2026-04-01 08:00:00',
      },
      {
        type: 'MemoryPressure',
        status: 'False',
      },
      {
        type: 'DiskPressure',
        status: 'False',
      },
    ],
    taints: [
      {
        key: 'node-role.kubernetes.io/control-plane',
        effect: 'NoSchedule',
      },
    ],
    labels: [
      'kubernetes.io/arch=arm64',
      'kubernetes.io/os=linux',
      'node-role.kubernetes.io/control-plane=',
    ],
  },
  {
    name: 'k8s-node1',
    role: 'worker',
    ip: '10.0.0.102',
    status: 'Ready',
    ready: true,
    schedulable: true,
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
    architecture: 'arm64',
    podCount: 7,
    age: '120d',
    createdAt: '2025-12-12 10:00:00',
    metricsAvailable: true,
    cpuUsage: '520m / 4000m',
    cpuUsagePercent: 13,
    memoryUsage: '1.9 GiB / 7.6 GiB',
    memoryUsagePercent: 25.2,
    cpuAllocatable: '4000m',
    memoryAllocatable: '7.6 GiB',
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2026-04-01 08:00:00',
      },
      {
        type: 'MemoryPressure',
        status: 'False',
      },
      {
        type: 'DiskPressure',
        status: 'False',
      },
    ],
    taints: [],
    labels: ['kubernetes.io/arch=arm64', 'kubernetes.io/os=linux'],
  },
  {
    name: 'k8s-node2',
    role: 'worker',
    ip: '10.0.0.103',
    status: 'Ready',
    ready: true,
    schedulable: true,
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
    architecture: 'arm64',
    podCount: 4,
    age: '120d',
    createdAt: '2025-12-12 10:00:00',
    metricsAvailable: false,
    cpuAllocatable: '4000m',
    memoryAllocatable: '7.6 GiB',
    conditions: [
      {
        type: 'Ready',
        status: 'True',
        lastTransitionTime: '2026-04-01 08:00:00',
      },
      {
        type: 'MemoryPressure',
        status: 'False',
      },
      {
        type: 'DiskPressure',
        status: 'False',
      },
    ],
    taints: [],
    labels: ['kubernetes.io/arch=arm64', 'kubernetes.io/os=linux'],
  },
];

function isNodeReady(node: NodeItem) {
  return node.ready ?? node.status.startsWith('Ready');
}

function isNodeSchedulable(node: NodeItem) {
  if (typeof node.schedulable === 'boolean') {
    return node.schedulable;
  }

  return !node.status.includes('SchedulingDisabled');
}

function isConditionIssue(condition: NodeConditionItem) {
  if (condition.type === 'Ready') {
    return condition.status !== 'True';
  }

  return (
    ['MemoryPressure', 'DiskPressure', 'PIDPressure', 'NetworkUnavailable'].includes(
      condition.type,
    ) && condition.status === 'True'
  );
}

function nodeIssueCount(node: NodeItem) {
  if (node.conditions && node.conditions.length > 0) {
    return node.conditions.filter(isConditionIssue).length;
  }

  return isNodeReady(node) ? 0 : 1;
}

function statusColor(node: NodeItem) {
  if (!isNodeReady(node)) {
    return 'red';
  }

  if (nodeIssueCount(node) > 0 || !isNodeSchedulable(node)) {
    return 'orange';
  }

  return 'green';
}

function clampPercent(value?: number) {
  if (!value) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function usageStrokeColor(percent?: number) {
  const value = percent ?? 0;
  if (value >= 85) {
    return '#dc2626';
  }
  if (value >= 65) {
    return '#d97706';
  }
  return '#0f766e';
}

function conditionTagColor(condition: NodeConditionItem) {
  if (condition.type === 'Ready') {
    return condition.status === 'True' ? 'green' : 'red';
  }

  if (condition.status === 'True') {
    return 'orange';
  }

  if (condition.status === 'False') {
    return 'default';
  }

  return 'blue';
}

function NodeUsageCell({
  available,
  summary,
  percent,
}: {
  available?: boolean;
  summary?: string;
  percent?: number;
}) {
  if (!available || !summary) {
    return <Tag>Metrics Unavailable</Tag>;
  }

  return (
    <div className="min-w-[150px]">
      <div className="text-sm font-medium text-slate-900 whitespace-nowrap">{summary}</div>
      <div className="mt-1.5 max-w-[136px]">
        <Progress
          percent={Math.round(clampPercent(percent))}
          showInfo={false}
          size="small"
          strokeColor={usageStrokeColor(percent)}
          trailColor="#dbe7ec"
        />
      </div>
    </div>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

export function NodesPage() {
  const sessionMode = useAppStore((state) => state.sessionMode);
  const [detailNode, setDetailNode] = useState<NodeItem>();

  const nodesQuery = useQuery({
    queryKey: ['nodes'],
    queryFn: getNodes,
    enabled: sessionMode === 'token',
  });

  const nodes =
    sessionMode === 'demo' || !nodesQuery.data ? demoNodes : nodesQuery.data;

  const metrics = useMemo<ResourceMetric[]>(() => {
    const readyCount = nodes.filter(isNodeReady).length;
    const unschedulableCount = nodes.filter((node) => !isNodeSchedulable(node)).length;
    const warningCount = nodes.filter((node) => nodeIssueCount(node) > 0).length;
    const metricsReadyCount = nodes.filter((node) => node.metricsAvailable).length;

    return [
      {
        label: 'Nodes',
        value: nodes.length,
        hint: '当前集群中的节点总数',
        tone: 'teal',
      },
      {
        label: 'Ready',
        value: `${readyCount}/${nodes.length}`,
        hint: '可正常接收调度与流量的节点',
        tone: 'blue',
      },
      {
        label: 'Cordoned',
        value: unschedulableCount,
        hint: '当前被标记为不可调度的节点',
        tone: 'amber',
      },
      {
        label: 'Metrics',
        value: `${metricsReadyCount}/${nodes.length}`,
        hint: warningCount > 0 ? `${warningCount} 个节点存在异常信号` : '当前未发现节点异常',
        tone: 'slate',
      },
    ];
  }, [nodes]);

  const columns: ProColumns<NodeItem>[] = [
    {
      title: 'Node',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color={item.role === 'control-plane' ? 'purple' : 'blue'}>
              {item.role}
            </Tag>
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.ip} · {item.architecture ?? '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Health',
      key: 'health',
      width: 250,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={statusColor(item)}>{item.status}</Tag>
          <Tag color={isNodeSchedulable(item) ? 'cyan' : 'orange'}>
            {isNodeSchedulable(item) ? 'Schedulable' : 'Cordoned'}
          </Tag>
          {nodeIssueCount(item) > 0 ? (
            <Tag color="orange">{nodeIssueCount(item)} issues</Tag>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'CPU',
      key: 'cpu',
      width: 200,
      render: (_, item) => (
        <NodeUsageCell
          available={item.metricsAvailable}
          summary={item.cpuUsage}
          percent={item.cpuUsagePercent}
        />
      ),
    },
    {
      title: 'Memory',
      key: 'memory',
      width: 200,
      render: (_, item) => (
        <NodeUsageCell
          available={item.metricsAvailable}
          summary={item.memoryUsage}
          percent={item.memoryUsagePercent}
        />
      ),
    },
    {
      title: 'Pods',
      dataIndex: 'podCount',
      key: 'podCount',
      width: 90,
      render: (_, item) => item.podCount ?? 0,
    },
    {
      title: 'Version',
      dataIndex: 'kubeletVersion',
      key: 'kubeletVersion',
      width: 120,
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
      render: (value) => value ?? '-',
    },
  ];

  const detailConditions = detailNode?.conditions ?? [];
  const detailTaints = detailNode?.taints ?? [];
  const detailLabels = detailNode?.labels ?? [];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && nodesQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="节点数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<NodeItem>
        title="节点列表"
        description="聚焦节点健康、调度状态、资源使用与工作负载分布，点击行可查看节点详情。"
        metrics={metrics}
        dataSource={nodes}
        columns={columns}
        rowKey="name"
        loading={sessionMode === 'token' && nodesQuery.isLoading}
        onRefresh={() => nodesQuery.refetch()}
        toolbarExtra={
          <Tag color="blue">
            Metrics Ready: {nodes.filter((node) => node.metricsAvailable).length}/{nodes.length}
          </Tag>
        }
        searchPlaceholder="搜索节点名、IP、角色或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.ip.toLowerCase().includes(keyword) ||
          record.role.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          (record.labels ?? []).some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription="当前没有可展示的节点"
        onRow={(record) => ({
          onClick: () => setDetailNode(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailNode ? `Node / ${detailNode.name}` : '节点详情'}
        placement="right"
        width={440}
        open={Boolean(detailNode)}
        onClose={() => setDetailNode(undefined)}
      >
        {detailNode ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={statusColor(detailNode)}>{detailNode.status}</Tag>
              <Tag color={detailNode.role === 'control-plane' ? 'purple' : 'blue'}>
                {detailNode.role}
              </Tag>
              <Tag color={isNodeSchedulable(detailNode) ? 'cyan' : 'orange'}>
                {isNodeSchedulable(detailNode) ? 'Schedulable' : 'Cordoned'}
              </Tag>
              <Tag color={detailNode.metricsAvailable ? 'geekblue' : 'default'}>
                {detailNode.metricsAvailable ? 'Metrics Ready' : 'Metrics Unavailable'}
              </Tag>
            </div>

            <div>
              <Typography.Title level={4} className="!mb-1">
                {detailNode.name}
              </Typography.Title>
              <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
                {detailNode.createdAt
                  ? `创建于 ${detailNode.createdAt}，已运行 ${detailNode.age ?? '-'}`
                  : `节点地址 ${detailNode.ip}`}
              </Typography.Paragraph>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DetailStat label="Pods" value={detailNode.podCount ?? 0} />
              <DetailStat label="Architecture" value={detailNode.architecture ?? '-'} />
              <DetailStat label="CPU Allocatable" value={detailNode.cpuAllocatable ?? '-'} />
              <DetailStat
                label="Memory Allocatable"
                value={detailNode.memoryAllocatable ?? '-'}
              />
            </div>

            <section className="space-y-3">
              <Typography.Title level={5} className="!mb-0">
                系统信息
              </Typography.Title>
              {[
                ['Internal IP', detailNode.ip],
                ['Kubelet', detailNode.kubeletVersion],
                ['Container Runtime', detailNode.containerRuntime],
                ['OS Image', detailNode.osImage],
                ['Kernel', detailNode.kernelVersion],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                    {label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{value}</div>
                </div>
              ))}
            </section>

            <section className="space-y-3">
              <Typography.Title level={5} className="!mb-0">
                资源使用
              </Typography.Title>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-sm font-medium text-slate-900">
                  CPU
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {detailNode.metricsAvailable && detailNode.cpuUsage
                    ? detailNode.cpuUsage
                    : 'Metrics Unavailable'}
                </div>
                {detailNode.metricsAvailable ? (
                  <Progress
                    percent={Math.round(clampPercent(detailNode.cpuUsagePercent))}
                    showInfo={false}
                    strokeColor={usageStrokeColor(detailNode.cpuUsagePercent)}
                    trailColor="#dbe7ec"
                  />
                ) : null}
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-sm font-medium text-slate-900">
                  Memory
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  {detailNode.metricsAvailable && detailNode.memoryUsage
                    ? detailNode.memoryUsage
                    : 'Metrics Unavailable'}
                </div>
                {detailNode.metricsAvailable ? (
                  <Progress
                    percent={Math.round(clampPercent(detailNode.memoryUsagePercent))}
                    showInfo={false}
                    strokeColor={usageStrokeColor(detailNode.memoryUsagePercent)}
                    trailColor="#dbe7ec"
                  />
                ) : null}
              </div>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Conditions
              </Typography.Title>
              <div className="space-y-2">
                {detailConditions.map((condition) => (
                  <div
                    key={condition.type}
                    className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Typography.Text strong>{condition.type}</Typography.Text>
                      <Tag color={conditionTagColor(condition)}>{condition.status}</Tag>
                    </div>
                    {condition.reason ? (
                      <div className="mt-1 text-sm text-slate-600">{condition.reason}</div>
                    ) : null}
                    {condition.lastTransitionTime ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Last Transition: {condition.lastTransitionTime}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Taints
              </Typography.Title>
              {detailTaints.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailTaints.map((taint) => (
                    <Tag key={`${taint.key}:${taint.effect}`}>
                      {taint.key}
                      {taint.value ? `=${taint.value}` : ''}
                      :{taint.effect}
                    </Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前节点没有 taints
                </div>
              )}
            </section>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Labels
              </Typography.Title>
              {detailLabels.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailLabels.map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前节点没有额外标签
                </div>
              )}
            </section>
          </section>
        ) : null}
      </Drawer>
    </section>
  );
}
