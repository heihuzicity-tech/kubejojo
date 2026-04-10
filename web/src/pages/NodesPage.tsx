import { Alert, Skeleton, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';

import { type NodeItem, getNodes } from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoNodes: NodeItem[] = [
  {
    name: 'k8s-master',
    role: 'control-plane',
    ip: '10.0.0.101',
    status: 'Ready,SchedulingDisabled',
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
  },
  {
    name: 'k8s-node1',
    role: 'worker',
    ip: '10.0.0.102',
    status: 'Ready',
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
  },
  {
    name: 'k8s-node2',
    role: 'worker',
    ip: '10.0.0.103',
    status: 'Ready',
    kubeletVersion: 'v1.35.3',
    osImage: 'Ubuntu 24.04',
    kernelVersion: '6.8.0',
    containerRuntime: 'containerd://2.0.5',
  },
];

const columns: ColumnsType<NodeItem> = [
  {
    title: 'Name',
    dataIndex: 'name',
    key: 'name',
    render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    render: (value: string) => <Tag color={value.startsWith('Ready') ? 'green' : 'red'}>{value}</Tag>,
  },
  {
    title: 'Role',
    dataIndex: 'role',
    key: 'role',
  },
  {
    title: 'Version',
    dataIndex: 'kubeletVersion',
    key: 'kubeletVersion',
  },
  {
    title: 'Internal IP',
    dataIndex: 'ip',
    key: 'ip',
  },
  {
    title: 'Container Runtime',
    dataIndex: 'containerRuntime',
    key: 'containerRuntime',
  },
];

export function NodesPage() {
  const sessionMode = useAppStore((state) => state.sessionMode);
  const nodesQuery = useQuery({
    queryKey: ['nodes'],
    queryFn: getNodes,
    enabled: sessionMode === 'token',
  });

  const nodes = sessionMode === 'demo' || !nodesQuery.data ? demoNodes : nodesQuery.data;

  if (nodesQuery.isLoading && sessionMode === 'token') {
    return <Skeleton active paragraph={{ rows: 8 }} />;
  }

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && nodesQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="节点数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Title level={4} className="!mb-1">
          节点列表
        </Typography.Title>
        <Typography.Paragraph className="!mb-4 text-sm text-slate-500">
          以高密度表格展示节点状态、角色、版本与地址。
        </Typography.Paragraph>
        <Table<NodeItem>
          rowKey="name"
          columns={columns}
          dataSource={nodes}
          pagination={false}
          size="middle"
        />
      </section>
    </section>
  );
}
