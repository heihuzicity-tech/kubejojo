import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

type PvcRecord = {
  key: string;
  name: string;
  namespace: string;
  status: string;
  storageClass: string;
  capacity: string;
};

const columns: ColumnsType<PvcRecord> = [
  { title: 'PVC', dataIndex: 'name' },
  { title: '命名空间', dataIndex: 'namespace' },
  {
    title: '状态',
    dataIndex: 'status',
    render: (value: string) => <Tag color="green">{value}</Tag>,
  },
  { title: '存储类', dataIndex: 'storageClass' },
  { title: '容量', dataIndex: 'capacity' },
];

const data: PvcRecord[] = [
  { key: '1', name: 'data-k8s-admin-postgres-0', namespace: 'default', status: 'Bound', storageClass: 'local-path', capacity: '10Gi' },
];

export function StoragePage() {
  return (
    <Card>
      <Table rowKey="key" columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />
    </Card>
  );
}
