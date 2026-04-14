import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildPersistentVolumeClaimRoute,
  persistentVolumeClaimStatusColor,
} from '../components/persistentvolumeclaim/persistentVolumeClaimShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PersistentVolumeClaimItem,
  getPersistentVolumeClaimYaml,
  getPersistentVolumeClaims,
  updatePersistentVolumeClaimYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

export function PersistentVolumeClaimsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<PersistentVolumeClaimItem>();

  const claimsQuery = useQuery({
    queryKey: ['persistentvolumeclaims', currentNamespace],
    queryFn: () => getPersistentVolumeClaims(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const claimYamlQuery = useQuery({
    queryKey: ['persistentvolumeclaim-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getPersistentVolumeClaimYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateClaimYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updatePersistentVolumeClaimYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await claimsQuery.refetch();
      await claimYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? claimsQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const boundCount = items.filter((item) => item.status === 'healthy').length;
    const mountedCount = items.filter((item) => item.mountedPodCount > 0).length;
    const pendingCount = items.filter((item) => item.status === 'warning').length;

    return [
      {
        label: 'PVCs',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Bound',
        value: `${boundCount}/${items.length}`,
        hint: '已成功绑定卷的 PVC',
        tone: 'blue',
      },
      {
        label: 'Mounted',
        value: mountedCount,
        hint: '当前被 Pod 引用的 PVC',
        tone: 'amber',
      },
      {
        label: 'Pending',
        value: pendingCount,
        hint: '尚未完成绑定或供应',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<PersistentVolumeClaimItem>[] = [
    {
      title: 'Claim',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.storageClass || '-'}</Tag>
          </Space>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.summary}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Status',
      key: 'status',
      width: 260,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={persistentVolumeClaimStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="default">{item.volumeMode}</Tag>
          {item.accessModes.map((mode) => (
            <Tag key={mode}>{mode}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: 'Capacity',
      key: 'capacity',
      width: 200,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">Request {item.requestedStorage}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            Capacity {item.capacity || '-'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Volume',
      key: 'volume',
      width: 260,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-sm">{item.volumeName || '-'}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            Mounted by {item.mountedPodCount} Pod{item.mountedPodCount === 1 ? '' : 's'}
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
            loading={updateClaimYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildPersistentVolumeClaimRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
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
      {sessionMode === 'token' && claimsQuery.error ? (
        <Alert type="warning" showIcon message="PersistentVolumeClaim 数据加载失败" />
      ) : null}

      <ResourceListPage<PersistentVolumeClaimItem>
        title="PersistentVolumeClaim 列表"
        description="查看绑定状态、容量请求、挂载关系与存储类分布，点击行可查看详情。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && claimsQuery.isLoading}
        onRefresh={() => claimsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 PVC、StorageClass、Volume、访问模式或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.storageClass.toLowerCase().includes(keyword) ||
          (record.volumeName || '').toLowerCase().includes(keyword) ||
          record.volumeMode.toLowerCase().includes(keyword) ||
          record.requestedStorage.toLowerCase().includes(keyword) ||
          (record.capacity || '').toLowerCase().includes(keyword) ||
          record.accessModes.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 PersistentVolumeClaim`}
        onRow={(record) => ({
          onClick: () => navigate(buildPersistentVolumeClaimRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit PersistentVolumeClaim YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit PersistentVolumeClaim YAML'
        }
        resourceKind="PersistentVolumeClaim"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={claimYamlQuery.data}
        loading={claimYamlQuery.isFetching}
        saving={updateClaimYamlMutation.isPending}
        error={claimYamlQuery.error}
        errorMessage="PersistentVolumeClaim YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void claimYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateClaimYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
