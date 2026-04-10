import {
  AuditOutlined,
  ClusterOutlined,
  DeploymentUnitOutlined,
  HddOutlined,
  NodeExpandOutlined,
  OrderedListOutlined,
  PartitionOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Select, Space, Tag, Typography } from 'antd';
import { PropsWithChildren } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAppStore } from '../stores/appStore';

const { Header, Sider, Content } = Layout;

const menuItems = [
  { key: '/overview', icon: <OrderedListOutlined />, label: '概览' },
  { key: '/nodes', icon: <NodeExpandOutlined />, label: '节点' },
  { key: '/workloads', icon: <DeploymentUnitOutlined />, label: '工作负载' },
  { key: '/pods', icon: <ClusterOutlined />, label: 'Pod' },
  { key: '/network', icon: <ShareAltOutlined />, label: '网络' },
  { key: '/config', icon: <PartitionOutlined />, label: '配置' },
  { key: '/storage/pvcs', icon: <HddOutlined />, label: 'PVC' },
  { key: '/audit', icon: <AuditOutlined />, label: '审计日志' },
];

const namespaceOptions = ['default', 'kube-system', 'kube-public', 'kube-node-lease'];

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const namespace = useAppStore((state) => state.namespace);
  const setNamespace = useAppStore((state) => state.setNamespace);
  const userName = useAppStore((state) => state.userName);

  return (
    <Layout className="min-h-screen">
      <Sider theme="light" width={240} className="border-r border-slate-200">
        <div className="border-b border-slate-200 px-6 py-5">
          <Typography.Title level={4} className="!mb-1">
            K8s Admin
          </Typography.Title>
          <Typography.Text type="secondary">企业级管理系统骨架</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          className="border-r-0 pt-3"
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <div>
            <Typography.Title level={5} className="!mb-0">
              {menuItems.find((item) => item.key === location.pathname)?.label ?? 'K8s Admin'}
            </Typography.Title>
          </div>
          <Space size="middle">
            <Space size="small">
              <Typography.Text type="secondary">命名空间</Typography.Text>
              <Select
                value={namespace}
                style={{ width: 180 }}
                options={namespaceOptions.map((item) => ({ label: item, value: item }))}
                onChange={setNamespace}
              />
            </Space>
            <Tag color="blue">{userName}</Tag>
          </Space>
        </Header>
        <Content className="bg-slate-50 p-6">{children}</Content>
      </Layout>
    </Layout>
  );
}
