import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildIngressClassRoute,
  ingressClassStatusColor,
} from '../components/ingressclass/ingressClassShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';
import {
  deleteIngressClass,
  type IngressClassItem,
  type IngressItem,
  getIngressClassYaml,
  getIngressClasses,
  getIngresses,
  updateIngressClassYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

function parameterSummary(item: IngressClassItem) {
  if (!item.parameters) {
    return 'No parameters';
  }

  const scope = item.parameters.scope || 'Cluster';
  const namespace = item.parameters.namespace ? `${item.parameters.namespace}/` : '';
  return `${scope} · ${item.parameters.kind} ${namespace}${item.parameters.name}`;
}

export function IngressClassesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const [yamlEditTarget, setYamlEditTarget] = useState<IngressClassItem>();

  const classesQuery = useQuery({
    queryKey: ['ingressclasses'],
    queryFn: () => getIngressClasses(),
    enabled: sessionMode === 'token',
  });

  const ingressesQuery = useQuery({
    queryKey: ['ingressclasses-ingresses'],
    queryFn: () => getIngresses(),
    enabled: sessionMode === 'token',
  });

  const classYamlQuery = useQuery({
    queryKey: ['ingressclass-yaml', yamlEditTarget?.name],
    queryFn: () => getIngressClassYaml(yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateClassYamlMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      updateIngressClassYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await classesQuery.refetch();
      await classYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteIngressClass(name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await classesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? classesQuery.data ?? [] : [];
  const ingresses = sessionMode === 'token' ? ingressesQuery.data ?? [] : [];

  const ingressCounts = useMemo(() => {
    const counts = new Map<string, number>();

    ingresses.forEach((item: IngressItem) => {
      const ingressClassName = item.ingressClass === '-' ? '' : item.ingressClass;
      if (ingressClassName) {
        counts.set(ingressClassName, (counts.get(ingressClassName) || 0) + 1);
      }
    });

    return counts;
  }, [ingresses]);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const defaultCount = items.filter((item) => item.isDefault).length;
    const parameterizedCount = items.filter((item) => Boolean(item.parameters)).length;
    const controllerCount = new Set(items.map((item) => item.controller)).size;

    return [
      {
        label: 'Classes',
        value: items.length,
        hint: '集群级 IngressClass 总数',
        tone: 'teal',
      },
      {
        label: 'Default',
        value: defaultCount,
        hint: '当前默认入口类',
        tone: 'blue',
      },
      {
        label: 'Parameters',
        value: parameterizedCount,
        hint: '带参数引用的 IngressClass',
        tone: 'amber',
      },
      {
        label: 'Controllers',
        value: controllerCount,
        hint: '不同控制器数量',
        tone: 'slate',
      },
    ];
  }, [items]);

  const columns: ProColumns<IngressClassItem>[] = [
    {
      title: 'IngressClass',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.isDefault ? <Tag color="blue">Default</Tag> : null}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.controller}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 220,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={ingressClassStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="default">Ingresses {ingressCounts.get(item.name) || 0}</Tag>
        </Space>
      ),
    },
    {
      title: 'Parameters',
      key: 'parameters',
      width: 320,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">
            {item.parameters?.kind || 'None'}
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {parameterSummary(item)}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Age',
      dataIndex: 'age',
      key: 'age',
      width: 100,
      render: (value) => value ?? '-',
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 124,
      fixed: 'right',
      render: (_, item) =>
        sessionMode === 'token' ? (
          <ActionMenuButton
            loading={updateClassYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildIngressClassRoute(item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'IngressClass',
                    name: item.name,
                    impact:
                      'Ingresses that still reference this class may fail admission or route traffic unpredictably after it is removed.',
                    onConfirm: () => deleteMutation.mutateAsync(item.name),
                  });
                }
              },
            }}
          />
        ) : (
          <Tag>ReadOnly</Tag>
        ),
    },
  ];

  return (
    <section className="space-y-5">
      {sessionMode === 'token' && classesQuery.error ? (
        <Alert type="warning" showIcon message="IngressClass 数据加载失败" />
      ) : null}

      <ResourceListPage<IngressClassItem>
        title="IngressClass 列表"
        description="查看入口控制器、默认类、参数引用与使用情况，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => record.name}
        loading={
          sessionMode === 'token' && (classesQuery.isLoading || ingressesQuery.isLoading)
        }
        onRefresh={() => {
          void classesQuery.refetch();
          void ingressesQuery.refetch();
        }}
        searchPlaceholder="搜索 IngressClass、Controller、参数或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.controller.toLowerCase().includes(keyword) ||
          (record.parameters?.kind || '').toLowerCase().includes(keyword) ||
          (record.parameters?.name || '').toLowerCase().includes(keyword) ||
          (record.parameters?.namespace || '').toLowerCase().includes(keyword) ||
          (record.parameters?.apiGroup || '').toLowerCase().includes(keyword) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription="当前没有可展示的 IngressClass"
        onRow={(record) => ({
          onClick: () => navigate(buildIngressClassRoute(record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={yamlEditTarget ? `Edit IngressClass YAML / ${yamlEditTarget.name}` : 'Edit IngressClass YAML'}
        resourceKind="IngressClass"
        resourceLabel={yamlEditTarget ? yamlEditTarget.name : '-'}
        result={classYamlQuery.data}
        loading={classYamlQuery.isFetching}
        saving={updateClassYamlMutation.isPending}
        error={classYamlQuery.error}
        errorMessage="IngressClass YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void classYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateClassYamlMutation.mutateAsync({
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
