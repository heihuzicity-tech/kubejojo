import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { buildRoleRoute, roleStatusColor } from '../components/role/roleShared';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type RoleItem,
  getRoleYaml,
  getRoles,
  updateRoleYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

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

function firstRuleSummary(item: RoleItem) {
  const rule = item.rules[0];
  if (!rule) {
    return 'No rules';
  }

  const verbs = rule.verbs.slice(0, 2).join(', ') || 'no verbs';
  const resources = rule.resources.slice(0, 2).join(', ') || rule.nonResourceUrls.slice(0, 1).join(', ') || 'no resources';
  return `${verbs} · ${resources}`;
}

export function RolesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);
  const [yamlEditTarget, setYamlEditTarget] = useState<RoleItem>();

  const rolesQuery = useQuery({
    queryKey: ['roles', currentNamespace],
    queryFn: () => getRoles(currentNamespace),
    enabled: sessionMode === 'token',
  });

  const roleYamlQuery = useQuery({
    queryKey: ['role-yaml', yamlEditTarget?.namespace, yamlEditTarget?.name],
    queryFn: () => getRoleYaml(yamlEditTarget!.namespace, yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateRoleYamlMutation = useMutation({
    mutationFn: ({ namespace, name, content }: { namespace: string; name: string; content: string }) =>
      updateRoleYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await rolesQuery.refetch();
      await roleYamlQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? rolesQuery.data ?? [] : [];
  const namespaceLabel = displayNamespace(currentNamespace);

  const metrics = useMemo<ResourceMetric[]>(() => {
    const rules = items.reduce((sum, item) => sum + item.ruleCount, 0);
    const subjects = items.reduce((sum, item) => sum + item.boundSubjectCount, 0);
    const warnings = items.filter((item) => item.status === 'warning').length;

    return [
      { label: 'Roles', value: items.length, hint: `当前上下文: ${namespaceLabel}`, tone: 'teal' },
      { label: 'Rules', value: rules, hint: '命名空间内规则总数', tone: 'blue' },
      { label: 'Subjects', value: subjects, hint: '被角色覆盖的绑定主体总数', tone: 'amber' },
      { label: 'Warnings', value: warnings, hint: '当前没有规则或配置异常的角色数', tone: 'slate' },
    ];
  }, [items, namespaceLabel]);

  const columns: ProColumns<RoleItem>[] = [
    {
      title: 'Role',
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
      width: 230,
      render: (_, item) => (
        <Space size={[6, 6]} wrap>
          <Tag color={roleStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="cyan">Rules {item.ruleCount}</Tag>
          <Tag color={item.boundSubjectCount > 0 ? 'green' : 'default'}>Subjects {item.boundSubjectCount}</Tag>
        </Space>
      ),
    },
    {
      title: 'Rules Preview',
      key: 'rulesPreview',
      width: 260,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">{firstRuleSummary(item)}</Typography.Text>
      ),
    },
    {
      title: 'Bound Subjects',
      key: 'subjects',
      width: 300,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {item.boundSubjectCount > 0 ? preview(item.boundSubjects) : 'Unbound'}
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
            loading={updateRoleYamlMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildRoleRoute(item.namespace, item.name));
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
      {sessionMode === 'token' && rolesQuery.error ? (
        <Alert type="warning" showIcon message="Role 数据加载失败" />
      ) : null}

      <ResourceListPage<RoleItem>
        title="Role 列表"
        description="查看命名空间内角色规则、覆盖资源与绑定主体，支持 YAML 快速编辑。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => `${record.namespace}/${record.name}`}
        loading={sessionMode === 'token' && rolesQuery.isLoading}
        onRefresh={() => rolesQuery.refetch()}
        toolbarExtra={<Tag color="blue">当前上下文: {namespaceLabel}</Tag>}
        searchPlaceholder="搜索角色、命名空间、资源、verbs、绑定主体或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
          record.namespace.toLowerCase().includes(keyword) ||
          record.status.toLowerCase().includes(keyword) ||
          record.summary.toLowerCase().includes(keyword) ||
          record.boundSubjects.some((item) => item.toLowerCase().includes(keyword)) ||
          record.labels.some((item) => item.toLowerCase().includes(keyword)) ||
          record.rules.some(
            (rule) =>
              rule.apiGroups.some((item) => item.toLowerCase().includes(keyword)) ||
              rule.resources.some((item) => item.toLowerCase().includes(keyword)) ||
              rule.resourceNames.some((item) => item.toLowerCase().includes(keyword)) ||
              rule.nonResourceUrls.some((item) => item.toLowerCase().includes(keyword)) ||
              rule.verbs.some((item) => item.toLowerCase().includes(keyword)),
          )
        }
        emptyDescription={`${namespaceLabel} 下没有可展示的 Role`}
        onRow={(record) => ({
          onClick: () => navigate(buildRoleRoute(record.namespace, record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={
          yamlEditTarget
            ? `Edit Role YAML / ${yamlEditTarget.namespace}/${yamlEditTarget.name}`
            : 'Edit Role YAML'
        }
        resourceKind="Role"
        resourceLabel={yamlEditTarget ? `${yamlEditTarget.namespace}/${yamlEditTarget.name}` : '-'}
        result={roleYamlQuery.data}
        loading={roleYamlQuery.isFetching}
        saving={updateRoleYamlMutation.isPending}
        error={roleYamlQuery.error}
        errorMessage="Role YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void roleYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateRoleYamlMutation.mutateAsync({
            namespace: yamlEditTarget.namespace,
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
