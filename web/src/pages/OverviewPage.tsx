import { Card, Col, List, Progress, Row, Statistic, Tag, Typography } from 'antd';

const abnormalPods = [
  { name: 'api-gateway-7d8fcbf4c7-8n2mq', namespace: 'default', status: 'CrashLoopBackOff' },
  { name: 'job-runner-59d8f7b8b6-2bz3m', namespace: 'ops', status: 'Pending' },
];

export function OverviewPage() {
  return (
    <div className="space-y-6">
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="集群状态" value="Healthy" />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="节点状态" value="3 / 3 Ready" />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="命名空间数" value={4} />
          </Card>
        </Col>
        <Col xs={24} md={12} xl={6}>
          <Card>
            <Statistic title="异常 Pod" value={2} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="资源使用率">
            <div className="space-y-4">
              <div>
                <Typography.Text>CPU</Typography.Text>
                <Progress percent={43} />
              </div>
              <div>
                <Typography.Text>内存</Typography.Text>
                <Progress percent={58} status="active" />
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="异常 Pod 摘要">
            <List
              dataSource={abnormalPods}
              renderItem={(item) => (
                <List.Item>
                  <List.Item.Meta
                    title={item.name}
                    description={`命名空间：${item.namespace}`}
                  />
                  <Tag color="red">{item.status}</Tag>
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
