import { Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

import { useAppStore } from '../stores/appStore';

type LoginFormValues = {
  token: string;
};

export function LoginPage() {
  const navigate = useNavigate();
  const setToken = useAppStore((state) => state.setToken);

  const handleFinish = ({ token }: LoginFormValues) => {
    setToken(token);
    navigate('/overview', { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <Card className="w-full max-w-xl rounded-2xl shadow-lg">
        <div className="mb-8">
          <Typography.Title level={2}>登录 Kubernetes 集群</Typography.Title>
          <Typography.Paragraph type="secondary" className="!mb-0">
            第一阶段使用 Bearer Token 登录。后续会接入真实集群校验与命名空间加载。
          </Typography.Paragraph>
        </div>
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item
            label="Bearer Token"
            name="token"
            rules={[{ required: true, message: '请输入 Bearer Token' }]}
          >
            <Input.Password placeholder="请输入 Kubernetes Bearer Token" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block>
            登录
          </Button>
        </Form>
      </Card>
    </main>
  );
}
