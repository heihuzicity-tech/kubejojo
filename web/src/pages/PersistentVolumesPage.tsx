import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildPersistentVolumeRoute,
  persistentVolumeStatusColor,
} from '../components/persistentvolume/persistentVolumeShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';
import {
  deletePersistentVolume,
  type PersistentVolumeItem,
  getPersistentVolumeYaml,
  getPersistentVolumes,
  updatePersistentVolumeYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

export function PersistentVolumesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const [yamlEditTarget, setYamlEditTarget] = useState<PersistentVolumeItem>();

  const volumesQuery = useQuery({
    queryKey: ['persistentvolumes'],
    queryFn: () => getPersistentVolumes(),
    enabled: sessionMode === 'token',
  });

  const volumeYamlQuery = useQuery({
    queryKey: ['persistentvolume-yaml', yamlEditTarget?.name],
    queryFn: () => getPersistentVolumeYaml(yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateVolumeYamlMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      updatePersistentVolumeYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await volumesQuery.refetch();
      await volumeYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deletePersistentVolume(name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await volumesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? volumesQuery.data ?? [] : [];

  const metrics = useMemo<ResourceMetric[]>(() => {
    const healthyCount = items.filter((item) => item.status === 'healthy').length;
    const claimedCount = items.filter((item) => Boolean(item.claimName)).length;
    const classCount = new Set(items.map((item) => item.storageClass || '-')).size;

    return [
      {
        label: 'PVs',
        value: items.length,
        hint: '集群级存储卷总数',
        tone: 'teal',
      },
      {
        label: 'Healthy',
        value: `${healthyCount}/${items.length}`,
        hint: 'Available 或 Bound 状态',
        tone: 'blue',
      },
      {
        label: 'Claimed',
        value: claimedCount,
        hint: '已绑定到 PVC 的卷',
        tone: 'amber',
      },
      {
        label: 'Classes',
        value: classCount,
        hint: '涉及的 StorageClass 数量',
        tone: 'slate',
      },
    ];
  }, [items]);

  const columns: ProColumns<PersistentVolumeItem>[] = [
    {
      title: 'PersistentVolume',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.storageClass || '-'}</Tag>
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.source} · {item.capacity}
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
          <Tag color={persistentVolumeStatusColor(item.status)}>{item.status}</Tag>
          <Tag>{item.phase || '-'}</Tag>
          {item.claimName ? <Tag color="green">Claimed</Tag> : <Tag>Unclaimed</Tag>}
        </Space>
      ),
    },
    {
      title: 'Policy',
      key: 'policy',
      width: 220,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">{item.reclaimPolicy}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.volumeMode} · {item.accessModes.join(', ')}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Claim',
      key: 'claim',
      width: 220,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.claimName ? `${item.claimNamespace}/${item.claimName}` : 'Not bound'}
        </Typography.Text>
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
            loading={updateVolumeYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildPersistentVolumeRoute(item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'PersistentVolume',
                    name: item.name,
                    impact:
                      'Deleting a PersistentVolume can break bound claims or trigger reclaim policy behavior on the underlying storage.',
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
      {sessionMode === 'token' && volumesQuery.error ? (
        <Alert type="warning" showIcon message="PersistentVolume 数据加载失败" />
      ) : null}

      <ResourceListPage<PersistentVolumeItem>
        title="PersistentVolume 列表"
        description="查看集群级存储卷、绑定关系、回收策略与容量分布，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => record.name}
        loading={sessionMode === 'token' && volumesQuery.isLoading}
        onRefresh={() => volumesQuery.refetch()}
        searchPlaceholder="搜索 PV、StorageClass、Claim、Source 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.phase.toLowerCase().includes(keyword) ||
          record.storageClass.toLowerCase().includes(keyword) ||
          record.reclaimPolicy.toLowerCase().includes(keyword) ||
          record.source.toLowerCase().includes(keyword) ||
          (record.claimNamespace || '').toLowerCase().includes(keyword) ||
          (record.claimName || '').toLowerCase().includes(keyword) ||
          record.accessModes.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription="当前没有可展示的 PersistentVolume"
        onRow={(record) => ({
          onClick: () => navigate(buildPersistentVolumeRoute(record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={yamlEditTarget ? `Edit PersistentVolume YAML / ${yamlEditTarget.name}` : 'Edit PersistentVolume YAML'}
        resourceKind="PersistentVolume"
        resourceLabel={yamlEditTarget ? yamlEditTarget.name : '-'}
        result={volumeYamlQuery.data}
        loading={volumeYamlQuery.isFetching}
        saving={updateVolumeYamlMutation.isPending}
        error={volumeYamlQuery.error}
        errorMessage="PersistentVolume YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void volumeYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateVolumeYamlMutation.mutateAsync({
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
