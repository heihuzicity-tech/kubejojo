import { Button, Card, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import { ProColumns, ProTable } from '@ant-design/pro-components';

type NetworkRecord = {
  key: string;
  name: string;
  namespace: string;
  type: string;
  createdAt: string;
};

const columns: ProColumns<NetworkRecord>[] = [
  { title: '名称', dataIndex: 'name' },
  { title: '命名空间', dataIndex: 'namespace' },
  { title: '类型', dataIndex: 'type', search: false },
  { title: '创建时间', dataIndex: 'createdAt', search: false },
  {
    title: '操作',
    valueType: 'option',
    render: () => [<a key="edit">编辑</a>, <a key="delete">删除</a>],
  },
];

const services: NetworkRecord[] = [
  { key: 'svc-1', name: 'k8s-admin-api', namespace: 'default', type: 'ClusterIP', createdAt: '2026-04-10 20:10:00' },
];

const ingresses: NetworkRecord[] = [
  { key: 'ing-1', name: 'k8s-admin-web', namespace: 'default', type: 'Ingress', createdAt: '2026-04-10 20:12:00' },
];

export function NetworkPage() {
  const items: TabsProps['items'] = [
    {
      key: 'service',
      label: 'Service',
      children: (
        <ProTable
          rowKey="key"
          columns={columns}
          dataSource={services}
          search={{ labelWidth: 'auto' }}
          toolBarRender={() => [<Button key="create-svc" type="primary">创建 Service</Button>]}
        />
      ),
    },
    {
      key: 'ingress',
      label: 'Ingress',
      children: (
        <ProTable
          rowKey="key"
          columns={columns}
          dataSource={ingresses}
          search={{ labelWidth: 'auto' }}
          toolBarRender={() => [<Button key="create-ing" type="primary">创建 Ingress</Button>]}
        />
      ),
    },
  ];

  return (
    <Card>
      <Tabs defaultActiveKey="service" items={items} />
    </Card>
  );
}
