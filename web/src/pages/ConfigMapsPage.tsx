import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildConfigMapRoute,
  configMapStatusColor,
} from '../components/configmap/configMapShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ConfigMapItem,
  getConfigMapYaml,
  getConfigMaps,
  updateConfigMapYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

function keyPreview(keys: string[]) {
  if (keys.length === 0) {
    return 'No keys';
  }

  const preview = keys.slice(0, 3).join(', ');
  return keys.length > 3 ? `${preview} +${keys.length - 3}` : preview;
}

export function ConfigMapsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<ConfigMapItem>();

  const configMapsQuery = useQuery({
    queryKey: ['configmaps', currentNamespace],
    queryFn: () => getConfigMaps(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const configMapYamlQuery = useQuery({
    queryKey: ['configmap-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getConfigMapYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateConfigMapYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateConfigMapYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await configMapsQuery.refetch();
      await configMapYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? configMapsQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const totalDataKeys = items.reduce((sum, item) => sum + item.dataCount, 0);
    const totalBinaryKeys = items.reduce((sum, item) => sum + item.binaryDataCount, 0);
    const totalReferencedPods = items.reduce((sum, item) => sum + item.referencedPodCount, 0);
    const immutableCount = items.filter((item) => item.immutable).length;

    return [
      {
        label: 'ConfigMaps',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Keys',
        value: totalDataKeys,
        hint: '普通 data 键总数',
        tone: 'blue',
      },
      {
        label: 'Binary Keys',
        value: totalBinaryKeys,
        hint: 'binaryData 键总数',
        tone: 'amber',
      },
      {
        label: 'Used By Pods',
        value: `${totalReferencedPods} / ${immutableCount}`,
        hint: '引用 Pod 总数 / Immutable 数量',
        tone: 'slate',
      },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<ConfigMapItem>[] = [
    {
      title: 'ConfigMap',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            {item.immutable ? <Tag color="blue">Immutable</Tag> : null}
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
      width: 220,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={configMapStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="cyan">Data {item.dataCount}</Tag>
          {item.binaryDataCount > 0 ? <Tag color="purple">Binary {item.binaryDataCount}</Tag> : null}
        </Space>
      ),
    },
    {
      title: 'Keys',
      key: 'keys',
      width: 320,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-xs text-slate-700">
            {keyPreview(item.dataKeys)}
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.binaryDataCount > 0
              ? `binaryData: ${keyPreview(item.binaryDataKeys)}`
              : 'No binaryData'}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Used By',
      key: 'usedBy',
      width: 280,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.referencedPods.length > 0 ? keyPreview(item.referencedPods) : 'Unused'}
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
            loading={updateConfigMapYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildConfigMapRoute(item.namespace, item.name));
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
      {sessionMode === 'token' && configMapsQuery.error ? (
        <Alert type="warning" showIcon message="ConfigMap 数据加载失败" />
      ) : null}

      <ResourceListPage<ConfigMapItem>
        title="ConfigMap 列表"
        description="查看命名空间内配置数据、binaryData 键以及 Pod 引用关系，支持 YAML 快速编辑。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && configMapsQuery.isLoading}
        onRefresh={() => configMapsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 ConfigMap、命名空间、Key、Pod、状态或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.dataKeys.some((item) => item.toLowerCase().includes(keyword)) ||
          record.binaryDataKeys.some((item) => item.toLowerCase().includes(keyword)) ||
          record.referencedPods.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 ConfigMap`}
        onRow={(record) => ({
          onClick: () => navigate(buildConfigMapRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit ConfigMap YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit ConfigMap YAML'
        }
        resourceKind="ConfigMap"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={configMapYamlQuery.data}
        loading={configMapYamlQuery.isFetching}
        saving={updateConfigMapYamlMutation.isPending}
        error={configMapYamlQuery.error}
        errorMessage="ConfigMap YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void configMapYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateConfigMapYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
