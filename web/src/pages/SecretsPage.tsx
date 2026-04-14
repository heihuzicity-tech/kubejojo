import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { buildSecretRoute, secretStatusColor } from '../components/secret/secretShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type SecretItem,
  getSecretYaml,
  getSecrets,
  updateSecretYaml,
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

export function SecretsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<SecretItem>();

  const secretsQuery = useQuery({
    queryKey: ['secrets', currentNamespace],
    queryFn: () => getSecrets(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const secretYamlQuery = useQuery({
    queryKey: ['secret-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getSecretYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateSecretYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateSecretYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await secretsQuery.refetch();
      await secretYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? secretsQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const totalKeys = items.reduce((sum, item) => sum + item.dataCount, 0);
    const totalReferencedPods = items.reduce((sum, item) => sum + item.referencedPodCount, 0);
    const immutableCount = items.filter((item) => item.immutable).length;
    const secretTypeCount = new Set(items.map((item) => item.type)).size;

    return [
      {
        label: 'Secrets',
        value: items.length,
        hint: `当前上下文: ${namespaceLabel}`,
        tone: 'teal',
      },
      {
        label: 'Keys',
        value: totalKeys,
        hint: 'Secret data 键总数',
        tone: 'blue',
      },
      {
        label: 'Types',
        value: secretTypeCount,
        hint: '不同 Secret 类型数量',
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

  const columns: ProColumns<SecretItem>[] = [
    {
      title: 'Secret',
      dataIndex: 'name',
      key: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Space size={6} wrap>
            <Typography.Text strong>{item.name}</Typography.Text>
            <Tag color="blue">{item.type}</Tag>
            {item.immutable ? <Tag color="geekblue">Immutable</Tag> : null}
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
          <Tag color={secretStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="red">Sensitive</Tag>
          <Tag color="cyan">Keys {item.dataCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'Visible Keys',
      key: 'keys',
      width: 320,
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text className="text-xs text-slate-700">
            {keyPreview(item.dataKeys)}
          </Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            Values are intentionally hidden
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
            loading={updateSecretYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildSecretRoute(item.namespace, item.name));
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
      {sessionMode === 'token' && secretsQuery.error ? (
        <Alert type="warning" showIcon message="Secret 数据加载失败" />
      ) : null}

      <ResourceListPage<SecretItem>
        title="Secret 列表"
        description="查看 Secret 类型、键名与 Pod 引用关系，默认隐藏 value，仅在 YAML 中受控查看与编辑。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && secretsQuery.isLoading}
        onRefresh={() => secretsQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索 Secret、命名空间、类型、Key、Pod、状态或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.type.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.dataKeys.some((item) => item.toLowerCase().includes(keyword)) ||
          record.referencedPods.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Secret`}
        onRow={(record) => ({
          onClick: () => navigate(buildSecretRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Secret YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Secret YAML'
        }
        resourceKind="Secret"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={secretYamlQuery.data}
        loading={secretYamlQuery.isFetching}
        saving={updateSecretYamlMutation.isPending}
        error={secretYamlQuery.error}
        errorMessage="Secret YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void secretYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateSecretYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
