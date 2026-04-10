import { ClockCircleOutlined, ToolOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

type PlaceholderPageProps = {
  title: string;
  description: string;
};

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  const navigate = useNavigate();

  return (
    <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <Tag color="gold" className="mb-4 rounded-full px-3 py-1">
        Placeholder
      </Tag>
      <Typography.Title level={2} className="!mb-3">
        {title}
      </Typography.Title>
      <Typography.Paragraph className="!mb-6 max-w-3xl text-base text-slate-600">
        {description}。旧的早期演示页面已经移除，当前保留稳定的信息架构与页面骨架，后续将按资源域逐步接入真实列表、详情和操作能力。
      </Typography.Paragraph>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <Space align="start">
            <ClockCircleOutlined className="mt-1 text-slate-500" />
            <div>
              <Typography.Text strong>当前状态</Typography.Text>
              <Typography.Paragraph className="!mt-2 !mb-0 text-slate-600">
                导航、路由和资源分组已经稳定，这个页面现在只承担占位和后续承接作用。
              </Typography.Paragraph>
            </div>
          </Space>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <Space align="start">
            <ToolOutlined className="mt-1 text-slate-500" />
            <div>
              <Typography.Text strong>后续实现</Typography.Text>
              <Typography.Paragraph className="!mt-2 !mb-0 text-slate-600">
                后续会优先补齐统一列表页骨架，再接入详情抽屉、创建表单和资源操作。
              </Typography.Paragraph>
            </div>
          </Space>
        </div>
      </div>

      <div className="mt-8">
        <Button type="primary" onClick={() => navigate('/cluster/overview')}>
          返回集群总览
        </Button>
      </div>
    </section>
  );
}
