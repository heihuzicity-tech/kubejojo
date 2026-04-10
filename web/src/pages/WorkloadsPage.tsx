import { Button, Card, Space, Tabs, Tag } from 'antd';
import type { TabsProps } from 'antd';
import { ProColumns, ProTable } from '@ant-design/pro-components';

type WorkloadRecord = {
  key: string;
  name: string;
  namespace: string;
  ready: string;
  status: string;
  createdAt: string;
};

const columns: ProColumns<WorkloadRecord>[] = [
  { title: '名称', dataIndex: 'name' },
  { title: '命名空间', dataIndex: 'namespace' },
  { title: 'Ready', dataIndex: 'ready', search: false },
  {
    title: '状态',
    dataIndex: 'status',
    search: false,
    render: (_, record) => <Tag color="green">{record.status}</Tag>,
  },
  { title: '创建时间', dataIndex: 'createdAt', search: false },
  {
    title: '操作',
    valueType: 'option',
    render: () => [
      <a key="scale">扩缩容</a>,
      <a key="restart">重启</a>,
      <a key="delete">删除</a>,
    ],
  },
];

const data: WorkloadRecord[] = [
  {
    key: '1',
    name: 'k8s-admin-api',
    namespace: 'default',
    ready: '2/2',
    status: 'Running',
    createdAt: '2026-04-10 20:00:00',
  },
];

export function WorkloadsPage() {
  const items: TabsProps['items'] = ['Deployment', 'StatefulSet', 'DaemonSet'].map((label) => ({
    key: label,
    label,
    children: (
      <ProTable<WorkloadRecord>
        rowKey="key"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
        columns={columns}
        dataSource={data}
        cardBordered
        toolBarRender={() => [<Button key="create" type="primary">创建 {label}</Button>]}
      />
    ),
  }));

  return (
    <Card>
      <Tabs defaultActiveKey="Deployment" items={items} />
    </Card>
  );
}
