import { App, Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useNavigate } from 'react-router-dom';

import { loginWithToken } from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type LoginFormValues = {
  token: string;
};

export function LoginPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setToken = useAppStore((state) => state.setToken);
  const setNamespace = useAppStore((state) => state.setNamespace);
  const setUserName = useAppStore((state) => state.setUserName);
  const setSessionMode = useAppStore((state) => state.setSessionMode);

  const loginMutation = useMutation({
    mutationFn: loginWithToken,
    onSuccess: (result, token) => {
      queryClient.clear();
      setToken(token);
      setUserName(result.name);
      setNamespace(result.defaultNamespace);
      setSessionMode('token');
      navigate('/cluster/overview', { replace: true });
      void message.success('ServiceAccount Token 校验通过，已接入真实集群');
    },
  });

  const handleFinish = ({ token }: LoginFormValues) => {
    loginMutation.mutate(token);
  };

  const handleDemoEnter = () => {
    queryClient.clear();
    setToken('demo-token');
    setUserName('演示用户');
    setNamespace('default');
    setSessionMode('demo');
    navigate('/cluster/overview', { replace: true });
  };

  const errorMessage =
    loginMutation.error instanceof AxiosError
      ? loginMutation.error.response?.data?.message ?? 'Token 校验失败，请检查权限或集群连通性'
      : loginMutation.error
        ? 'Token 校验失败，请稍后重试'
        : '';

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-4xl overflow-hidden rounded-[32px] border-0 shadow-[0_28px_80px_rgba(15,23,42,0.12)]">
        <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
          <section className="bg-slate-950 px-7 py-8 text-white lg:px-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-teal-300">
              Single Cluster Console
            </div>
            <Typography.Title level={1} className="!mb-4 !mt-4 !text-white">
              K8s Admin
            </Typography.Title>
            <Typography.Paragraph className="!mb-5 text-sm leading-7 text-slate-300">
              面向单集群 Kubernetes 运维场景，提供统一的资源导航与控制台入口。
            </Typography.Paragraph>
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Typography.Text className="!text-white">资源域导航</Typography.Text>
                <Typography.Paragraph className="!mb-0 !mt-2 text-slate-300">
                  集群、拓扑、工作负载、网络、存储、安全、配置、资源治理。
                </Typography.Paragraph>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Typography.Text className="!text-white">运维首页</Typography.Text>
                <Typography.Paragraph className="!mb-0 !mt-2 text-slate-300">
                  展示状态卡、资源使用、Warning 事件、节点与命名空间概览。
                </Typography.Paragraph>
              </div>
            </div>
          </section>

          <section className="px-8 py-8 lg:px-10">
            <div className="mb-7">
              <Typography.Title level={2}>接入 Kubernetes 集群</Typography.Title>
              <Typography.Paragraph type="secondary" className="!mb-0">
                当前按 Headlamp 官方推荐实践，使用 ServiceAccount Bearer Token 直接接入单集群。
              </Typography.Paragraph>
              <Typography.Paragraph type="secondary" className="!mt-3 !mb-0">
                当前仅查看前端效果时，可以直接使用演示模式进入。
              </Typography.Paragraph>
            </div>
            {errorMessage ? (
              <Alert
                showIcon
                type="error"
                className="!mb-5"
                message={errorMessage}
              />
            ) : null}
            <Form layout="vertical" onFinish={handleFinish}>
              <Form.Item
                label="ServiceAccount Token"
                name="token"
                rules={[{ required: true, message: '请输入 Bearer Token' }]}
              >
                <Input.Password placeholder="请输入 Kubernetes ServiceAccount Bearer Token" />
              </Form.Item>
              <Space direction="vertical" size="middle" className="w-full">
                <Button
                  type="primary"
                  htmlType="submit"
                  size="large"
                  block
                  loading={loginMutation.isPending}
                >
                  校验并接入
                </Button>
                <Button
                  size="large"
                  block
                  onClick={handleDemoEnter}
                  disabled={loginMutation.isPending}
                >
                  进入演示
                </Button>
              </Space>
            </Form>
          </section>
        </div>
      </Card>
    </main>
  );
}
