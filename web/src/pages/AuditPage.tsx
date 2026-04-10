import { Card, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';

type AuditRecord = {
  key: string;
  actor: string;
  action: string;
  resource: string;
  namespace: string;
  time: string;
};

const columns: ColumnsType<AuditRecord> = [
  { title: '操作人', dataIndex: 'actor' },
  { title: '动作', dataIndex: 'action', render: (value: string) => <Tag color="blue">{value}</Tag> },
  { title: '资源', dataIndex: 'resource' },
  { title: '命名空间', dataIndex: 'namespace' },
  { title: '时间', dataIndex: 'time' },
];

const data: AuditRecord[] = [
  {
    key: '1',
    actor: 'zhangya',
    action: 'UPDATE',
    resource: 'configmaps/k8s-admin-web-config',
    namespace: 'default',
    time: '2026-04-10 20:16:00',
  },
];

export function AuditPage() {
  return (
    <Card>
      <Table rowKey="key" columns={columns} dataSource={data} pagination={{ pageSize: 10 }} />
    </Card>
  );
}
