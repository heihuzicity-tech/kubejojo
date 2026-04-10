import { Card, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

type PodRecord = {
  key: string;
  name: string;
  namespace: string;
  status: string;
  node: string;
};

const columns: ColumnsType<PodRecord> = [
  { title: 'Pod', dataIndex: 'name' },
  { title: '命名空间', dataIndex: 'namespace' },
  {
    title: '状态',
    dataIndex: 'status',
    render: (value: string) => <Tag color={value === 'Running' ? 'green' : 'red'}>{value}</Tag>,
  },
  { title: '节点', dataIndex: 'node' },
  {
    title: '快捷入口',
    render: () => (
      <Space>
        <a>日志</a>
        <a>事件</a>
        <a>终端</a>
      </Space>
    ),
  },
];

const data: PodRecord[] = [
  { key: '1', name: 'k8s-admin-api-69f4d8b5c5-j7n2x', namespace: 'default', status: 'Running', node: 'k8s-node1' },
  { key: '2', name: 'k8s-admin-web-6467ff7db4-lx7kj', namespace: 'default', status: 'Running', node: 'k8s-node2' },
];

export function PodsPage() {
  return (
    <Card>
      <Table rowKey="key" columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />
    </Card>
  );
}
