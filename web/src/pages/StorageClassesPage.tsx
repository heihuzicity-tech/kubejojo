import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { buildStorageClassRoute, storageClassStatusColor } from '../components/storageclass/storageClassShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';
import {
  deleteStorageClass,
  type StorageClassItem,
  getStorageClassYaml,
  getStorageClasses,
  updateStorageClassYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

export function StorageClassesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const [yamlEditTarget, setYamlEditTarget] = useState<StorageClassItem>();

  const classesQuery = useQuery({
    queryKey: ['storageclasses'],
    queryFn: () => getStorageClasses(),
    enabled: sessionMode === 'token',
  });

  const classYamlQuery = useQuery({
    queryKey: ['storageclass-yaml', yamlEditTarget?.name],
    queryFn: () => getStorageClassYaml(yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateClassYamlMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      updateStorageClassYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await classesQuery.refetch();
      await classYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteStorageClass(name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await classesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? classesQuery.data ?? [] : [];

  const metrics = useMemo<ResourceMetric[]>(() => {
    const defaultCount = items.filter((item) => item.isDefault).length;
    const expandableCount = items.filter((item) => item.allowVolumeExpansion).length;
    const provisionerCount = new Set(items.map((item) => item.provisioner)).size;

    return [
      {
        label: 'Classes',
        value: items.length,
        hint: '集群可用 StorageClass 总数',
        tone: 'teal',
      },
      {
        label: 'Default',
        value: defaultCount,
        hint: '当前默认存储类',
        tone: 'blue',
      },
      {
        label: 'Expandable',
        value: expandableCount,
        hint: '支持卷扩容的 StorageClass',
        tone: 'amber',
      },
      {
        label: 'Provisioners',
        value: provisionerCount,
        hint: '不同 provisioner 数量',
        tone: 'slate',
      },
    ];
  }, [items]);

  const columns: ProColumns<StorageClassItem>[] = [
    {
      title: 'StorageClass',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.isDefault ? <Tag color="blue">Default</Tag> : null}
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.provisioner}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 240,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={storageClassStatusColor(item.status)}>{item.status}</Tag>
          <Tag>{item.reclaimPolicy}</Tag>
          {item.allowVolumeExpansion ? <Tag color="green">Expandable</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Binding',
      key: 'binding',
      width: 220,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">{item.volumeBindingMode}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.parameters.length} parameters
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
                  navigate(buildStorageClassRoute(item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'StorageClass',
                    name: item.name,
                    impact:
                      'PersistentVolumeClaims that rely on this StorageClass may no longer provision storage after it is removed.',
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
        <Alert type="warning" showIcon message="StorageClass 数据加载失败" />
      ) : null}

      <ResourceListPage<StorageClassItem>
        title="StorageClass 列表"
        description="查看 provisioner、回收策略、绑定模式与默认类设置，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => record.name}
        loading={sessionMode === 'token' && classesQuery.isLoading}
        onRefresh={() => classesQuery.refetch()}
        searchPlaceholder="搜索 StorageClass、Provisioner、Policy 或参数"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.provisioner.toLowerCase().includes(keyword) ||
          record.reclaimPolicy.toLowerCase().includes(keyword) ||
          record.volumeBindingMode.toLowerCase().includes(keyword) ||
          record.parameters.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription="当前没有可展示的 StorageClass"
        onRow={(record) => ({
          onClick: () => navigate(buildStorageClassRoute(record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={yamlEditTarget ? `Edit StorageClass YAML / ${yamlEditTarget.name}` : 'Edit StorageClass YAML'}
        resourceKind="StorageClass"
        resourceLabel={yamlEditTarget ? yamlEditTarget.name : '-'}
        result={classYamlQuery.data}
        loading={classYamlQuery.isFetching}
        saving={updateClassYamlMutation.isPending}
        error={classYamlQuery.error}
        errorMessage="StorageClass YAML 加载失败"
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
