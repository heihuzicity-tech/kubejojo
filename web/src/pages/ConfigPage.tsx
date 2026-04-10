import { Button, Card, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import { ProColumns, ProTable } from '@ant-design/pro-components';

type ConfigRecord = {
  key: string;
  name: string;
  namespace: string;
  keys: number;
  createdAt: string;
};

const columns: ProColumns<ConfigRecord>[] = [
  { title: '名称', dataIndex: 'name' },
  { title: '命名空间', dataIndex: 'namespace' },
  { title: '键数量', dataIndex: 'keys', search: false },
  { title: '创建时间', dataIndex: 'createdAt', search: false },
  {
    title: '操作',
    valueType: 'option',
    render: () => [<a key="edit">编辑</a>, <a key="delete">删除</a>],
  },
];

const configMaps: ConfigRecord[] = [
  { key: 'cm-1', name: 'k8s-admin-web-config', namespace: 'default', keys: 4, createdAt: '2026-04-10 20:14:00' },
];

const secrets: ConfigRecord[] = [
  { key: 'secret-1', name: 'k8s-admin-api-secret', namespace: 'default', keys: 2, createdAt: '2026-04-10 20:15:00' },
];

export function ConfigPage() {
  const items: TabsProps['items'] = [
    {
      key: 'configmap',
      label: 'ConfigMap',
      children: (
        <ProTable
          rowKey="key"
          columns={columns}
          dataSource={configMaps}
          search={{ labelWidth: 'auto' }}
          toolBarRender={() => [<Button key="create-cm" type="primary">创建 ConfigMap</Button>]}
        />
      ),
    },
    {
      key: 'secret',
      label: 'Secret',
      children: (
        <ProTable
          rowKey="key"
          columns={columns}
          dataSource={secrets}
          search={{ labelWidth: 'auto' }}
          toolBarRender={() => [<Button key="create-secret" type="primary">创建 Secret</Button>]}
        />
      ),
    },
  ];

  return (
    <Card>
      <Tabs defaultActiveKey="configmap" items={items} />
    </Card>
  );
}
