import { Card, Col, Row, Space, Tag, Typography } from 'antd';

const nodes = [
  { name: 'k8s-master', role: 'control-plane', ip: '10.0.0.101', status: 'Ready' },
  { name: 'k8s-node1', role: 'worker', ip: '10.0.0.102', status: 'Ready' },
  { name: 'k8s-node2', role: 'worker', ip: '10.0.0.103', status: 'Ready' },
];

export function NodesPage() {
  return (
    <div className="grid gap-4">
      {nodes.map((node) => (
        <Card key={node.name}>
          <Space direction="vertical" size={4}>
            <Typography.Title level={5} className="!mb-0">
              {node.name}
            </Typography.Title>
            <Typography.Text type="secondary">{node.ip}</Typography.Text>
            <Row gutter={12}>
              <Col>
                <Tag color="blue">{node.role}</Tag>
              </Col>
              <Col>
                <Tag color="green">{node.status}</Tag>
              </Col>
            </Row>
          </Space>
        </Card>
      ))}
    </div>
  );
}
