import { type ProColumns } from '@ant-design/pro-components';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Drawer, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { type NamespaceItem, getNamespaceItems } from '../services/cluster';
import { useAppStore } from '../stores/appStore';

const demoNamespaceItems: NamespaceItem[] = [
  {
    name: 'default',
    status: 'Active',
    labels: ['environment=demo', 'team=platform'],
    pods: 6,
    services: 3,
    age: '12d',
    createdAt: '2026-03-30 09:40:00',
  },
  {
    name: 'kube-system',
    status: 'Active',
    labels: ['kubernetes.io/metadata.name=kube-system'],
    pods: 10,
    services: 6,
    age: '120d',
    createdAt: '2025-12-12 10:00:00',
  },
  {
    name: 'kube-public',
    status: 'Active',
    labels: ['kubernetes.io/metadata.name=kube-public'],
    pods: 1,
    services: 0,
    age: '120d',
    createdAt: '2025-12-12 10:00:00',
  },
  {
    name: 'kube-node-lease',
    status: 'Active',
    labels: ['kubernetes.io/metadata.name=kube-node-lease'],
    pods: 0,
    services: 0,
    age: '120d',
    createdAt: '2025-12-12 10:00:00',
  },
];

function statusColor(status: string) {
  switch (status) {
    case 'Active':
      return 'green';
    case 'Terminating':
      return 'orange';
    default:
      return 'default';
  }
}

export function NamespacesPage() {
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const setNamespace = useAppStore((state) => state.setNamespace);
  const [detailItem, setDetailItem] = useState<NamespaceItem>();

  const namespaceItemsQuery = useQuery({
    queryKey: ['namespace-items'],
    queryFn: getNamespaceItems,
    enabled: sessionMode === 'token',
  });

  const items =
    sessionMode === 'demo' || !namespaceItemsQuery.data
      ? demoNamespaceItems
      : namespaceItemsQuery.data;

  const metrics = useMemo<ResourceMetric[]>(() => {
    const activeCount = items.filter((item) => item.status === 'Active').length;
    const totalPods = items.reduce((sum, item) => sum + item.pods, 0);
    const totalServices = items.reduce((sum, item) => sum + item.services, 0);

    return [
      {
        label: 'Namespaces',
        value: items.length,
        hint: '当前可访问的命名空间总数',
        tone: 'teal',
      },
      {
        label: 'Active',
        value: activeCount,
        hint: '当前处于 Active 状态的命名空间',
        tone: 'blue',
      },
      {
        label: 'Pods',
        value: totalPods,
        hint: '跨命名空间汇总的 Pod 数量',
        tone: 'amber',
      },
      {
        label: 'Services',
        value: totalServices,
        hint: `当前上下文: ${currentNamespace}`,
        tone: 'slate',
      },
    ];
  }, [currentNamespace, items]);

  const columns: ProColumns<NamespaceItem>[] = [
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.name === currentNamespace ? <Tag color="geekblue">Current</Tag> : null}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            创建于 {item.createdAt}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (_, item) => <Tag color={statusColor(item.status)}>{item.status}</Tag>,
    },
    {
      title: 'Labels',
      dataIndex: 'labels',
      key: 'labels',
      render: (_, item) =>
        item.labels.length > 0 ? (
          <Space size={[6, 6]} wrap>
            {item.labels.slice(0, 2).map((label) => (
              <Tag key={label}>{label}</Tag>
            ))}
            {item.labels.length > 2 ? <Tag>+{item.labels.length - 2}</Tag> : null}
          </Space>
        ) : (
          <Typography.Text type="secondary">-</Typography.Text>
        ),
    },
    {
      title: 'Pods',
      dataIndex: 'pods',
      key: 'pods',
      width: 100,
    },
    {
      title: 'Services',
      dataIndex: 'services',
      key: 'services',
      width: 110,
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
    },
    {
      title: '操作',
      key: 'option',
      valueType: 'option',
      render: (_, record) => [
        <Button
          key="detail"
          type="link"
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            setDetailItem(record);
          }}
        >
          详情
        </Button>,
        <Button
          key="context"
          type="link"
          size="small"
          disabled={record.name === currentNamespace}
          onClick={(event) => {
            event.stopPropagation();
            setNamespace(record.name);
          }}
        >
          设为当前上下文
        </Button>,
      ],
    },
  ];

  const detailLabels = detailItem?.labels ?? [];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && namespaceItemsQuery.error ? (
        <Alert
          type="warning"
          showIcon
          message="命名空间数据加载失败，当前显示的是安全回退的演示数据。"
        />
      ) : null}

      <ResourceListPage<NamespaceItem>
        title="命名空间列表"
        description="查看命名空间状态、标签与基础资源分布，为后续工作负载、网络和配置页面提供统一上下文。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey="name"
        loading={sessionMode === 'token' && namespaceItemsQuery.isLoading}
        onRefresh={() => namespaceItemsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {currentNamespace}</Tag>}
        searchPlaceholder="搜索命名空间、状态或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.labels.some((label) => label.toLowerCase().includes(keyword))
        }
        emptyDescription="当前没有可展示的命名空间"
        onRow={(record) => ({
          onClick: () => setDetailItem(record),
          style: { cursor: 'pointer' },
        })}
      />

      <Drawer
        title={detailItem ? `Namespace / ${detailItem.name}` : '命名空间详情'}
        placement="right"
        width={380}
        open={Boolean(detailItem)}
        onClose={() => setDetailItem(undefined)}
        extra={
          detailItem && detailItem.name !== currentNamespace ? (
            <Button
              type="primary"
              size="small"
              onClick={() => {
                setNamespace(detailItem.name);
                setDetailItem(undefined);
              }}
            >
              设为当前上下文
            </Button>
          ) : null
        }
      >
        {detailItem ? (
          <section className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Tag color={statusColor(detailItem.status)}>{detailItem.status}</Tag>
              <Tag color={detailItem.name === currentNamespace ? 'geekblue' : 'default'}>
                {detailItem.name === currentNamespace ? 'Current Context' : 'Namespace'}
              </Tag>
            </div>

            <div>
              <Typography.Title level={4} className="!mb-1">
                {detailItem.name}
              </Typography.Title>
              <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
                创建于 {detailItem.createdAt}，当前已存在 {detailItem.age}。
              </Typography.Paragraph>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Pods
                </div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">{detailItem.pods}</div>
              </div>
              <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
                <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
                  Services
                </div>
                <div className="mt-1.5 text-2xl font-semibold text-slate-950">
                  {detailItem.services}
                </div>
              </div>
            </div>

            <section>
              <Typography.Title level={5} className="!mb-3">
                Labels
              </Typography.Title>
              {detailLabels.length > 0 ? (
                <Space size={[8, 8]} wrap>
                  {detailLabels.map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                </Space>
              ) : (
                <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
                  当前命名空间没有额外标签
                </div>
              )}
            </section>
          </section>
        ) : null}
      </Drawer>
    </section>
  );
}
