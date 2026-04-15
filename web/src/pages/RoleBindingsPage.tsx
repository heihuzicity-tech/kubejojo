import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import {
  buildRoleBindingRoute,
  roleBindingStatusColor,
} from '../components/rolebinding/roleBindingShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type RoleBindingItem,
  deleteRoleBinding,
  getRoleBindingYaml,
  getRoleBindings,
  updateRoleBindingYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';

function displayNamespace(namespace: string) {
  return namespace.trim() === '' ? 'All Namespaces' : namespace;
}

function preview(items: string[]) {
  if (items.length === 0) {
    return '-';
  }

  const text = items.slice(0, 3).join(', ');
  return items.length > 3 ? `${text} +${items.length - 3}` : text;
}

export function RoleBindingsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<RoleBindingItem>();

  const bindingsQuery = useQuery({
    queryKey: ['rolebindings', currentNamespace],
    queryFn: () => getRoleBindings(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const bindingYamlQuery = useQuery({
    queryKey: ['rolebinding-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getRoleBindingYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateBindingYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateRoleBindingYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await bindingsQuery.refetch();
      await bindingYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ namespace, name }: { namespace: string; name: string }) =>
      deleteRoleBinding(namespace, name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await bindingsQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? bindingsQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const subjects = items.reduce((sum, item) => sum + item.subjectCount, 0);
    const targetRoles = new Set(items.map((item) => `${item.namespace}/${item.roleRefKind}/${item.roleRefName}`)).size;
    const warningCount = items.filter((item) => item.status === 'warning').length;

    return [
      { label: 'Bindings', value: items.length, hint: `当前上下文: ${namespaceLabel}`, tone: 'teal' },
      { label: 'Subjects', value: subjects, hint: '绑定主体总数', tone: 'blue' },
      { label: 'Targets', value: targetRoles, hint: '被引用 Role / ClusterRole 数量', tone: 'amber' },
      { label: 'Warnings', value: warningCount, hint: '当前没有主体或配置异常的绑定数', tone: 'slate' },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<RoleBindingItem>[] = [
    {
      title: 'RoleBinding',
      key: 'name',
      dataIndex: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{item.name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.namespace} · {item.summary}
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
          <Tag color={roleBindingStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="blue">{item.roleRefKind}</Tag>
          <Tag color={item.subjectCount > 0 ? 'green' : 'default'}>Subjects {item.subjectCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'RoleRef',
      key: 'roleRef',
      width: 260,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.roleRefKind} · {item.roleRefName}
        </Typography.Text>
      ),
    },
    {
      title: 'Subjects',
      key: 'subjects',
      width: 320,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.subjectCount > 0 ? preview(item.subjectSummaries) : 'No subjects'}
        </Typography.Text>
      ),
    },
    {
      title: 'Age',
      key: 'age',
      dataIndex: 'age',
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
            loading={updateBindingYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildRoleBindingRoute(item.namespace, item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'RoleBinding',
                    namespace: item.namespace,
                    name: item.name,
                    impact:
                      'Subjects bound by this RoleBinding will lose the referenced permissions immediately.',
                    onConfirm: () =>
                      deleteMutation.mutateAsync({
                        namespace: item.namespace,
                        name: item.name,
                      }),
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
      {sessionMode === 'token' && bindingsQuery.error ? (
        <Alert type="warning" showIcon message="RoleBinding 数据加载失败" />
      ) : null}

      <ResourceListPage<RoleBindingItem>
        title="RoleBinding 列表"
        description="查看命名空间内 Role 与主体的绑定关系，明确权限授予路径与作用对象。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && bindingsQuery.isLoading}
        onRefresh={() => bindingsQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">当前上下文: {namespaceLabel}</Tag>
            <ResourceYamlCreateButton
              resourceKind="RoleBinding"
              namespace={currentNamespace}
              enabled={sessionMode === 'token'}
              onCreated={() => bindingsQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索绑定、命名空间、RoleRef、subjects 或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.roleRefKind.toLowerCase().includes(keyword) ||
          record.roleRefName.toLowerCase().includes(keyword) ||
          record.subjectSummaries.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword))
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 RoleBinding`}
        onRow={(record) => ({
          onClick: () => navigate(buildRoleBindingRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit RoleBinding YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit RoleBinding YAML'
        }
        resourceKind="RoleBinding"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={bindingYamlQuery.data}
        loading={bindingYamlQuery.isFetching}
        saving={updateBindingYamlMutation.isPending}
        error={bindingYamlQuery.error}
        errorMessage="RoleBinding YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void bindingYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateBindingYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
