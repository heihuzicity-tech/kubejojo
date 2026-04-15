import { App } from 'antd';
import { type ProColumns } from '@ant-design/pro-components';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Space, Tag, Typography } from 'antd';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  buildClusterRoleRoute,
  clusterRoleStatusColor,
} from '../components/clusterrole/clusterRoleShared';
import { ResourceListPage, type ResourceMetric } from '../components/resource-list/ResourceListPage';
import { ActionMenuButton } from '../components/workload/ActionMenuButton';
import { ResourceYamlCreateButton } from '../components/workload/ResourceYamlCreateButton';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import { confirmResourceDelete } from '../components/workload/deleteConfirmation';
import {
  type ClusterRoleItem,
  deleteClusterRole,
  getClusterRoleYaml,
  getClusterRoles,
  updateClusterRoleYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

function preview(items: string[]) {
  if (items.length === 0) {
    return '-';
  }

  const text = items.slice(0, 3).join(', ');
  return items.length > 3 ? `${text} +${items.length - 3}` : text;
}

function firstRuleSummary(item: ClusterRoleItem) {
  const rule = item.rules[0];
  if (!rule) {
    return 'No rules';
  }

  const verbs = rule.verbs.slice(0, 2).join(', ') || 'no verbs';
  const resources =
    rule.resources.slice(0, 2).join(', ') ||
    rule.nonResourceUrls.slice(0, 1).join(', ') ||
    'no resources';
  return `${verbs} · ${resources}`;
}

export function ClusterRolesPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const [yamlEditTarget, setYamlEditTarget] = useState<ClusterRoleItem>();

  const rolesQuery = useQuery({
    queryKey: ['clusterroles'],
    queryFn: () => getClusterRoles(),
    enabled: sessionMode === 'token',
  });

  const roleYamlQuery = useQuery({
    queryKey: ['clusterrole-yaml', yamlEditTarget?.name],
    queryFn: () => getClusterRoleYaml(yamlEditTarget!.name),
    enabled: sessionMode === 'token' && Boolean(yamlEditTarget),
  });

  const updateRoleYamlMutation = useMutation({
    mutationFn: ({ name, content }: { name: string; content: string }) =>
      updateClusterRoleYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await rolesQuery.refetch();
      await roleYamlQuery.refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteClusterRole(name),
    onSuccess: async (result) => {
      void message.success(result.message);
      setYamlEditTarget(undefined);
      await rolesQuery.refetch();
    },
  });

  const items = sessionMode === 'token' ? rolesQuery.data ?? [] : [];

  const metrics = useMemo<ResourceMetric[]>(() => {
    const rules = items.reduce((sum, item) => sum + item.ruleCount, 0);
    const subjects = items.reduce((sum, item) => sum + item.boundSubjectCount, 0);
    const warnings = items.filter((item) => item.status === 'warning').length;

    return [
      { label: 'ClusterRoles', value: items.length, hint: '集群级角色总数', tone: 'teal' },
      { label: 'Rules', value: rules, hint: '集群级规则总数', tone: 'blue' },
      {
        label: 'Subjects',
        value: subjects,
        hint: '通过 RoleBinding 与 ClusterRoleBinding 覆盖的主体总数',
        tone: 'amber',
      },
      {
        label: 'Warnings',
        value: warnings,
        hint: '当前没有规则或配置异常的 ClusterRole 数量',
        tone: 'slate',
      },
    ];
  }, [items]);

  const columns: ProColumns<ClusterRoleItem>[] = [
    {
      title: 'ClusterRole',
      key: 'name',
      dataIndex: 'name',
      render: (_, item) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{item.name}</Typography.Text>
          <Typography.Text type="secondary" className="text-xs">
            {item.summary}
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
          <Tag color={clusterRoleStatusColor(item.status)}>{item.status}</Tag>
          <Tag color="cyan">Rules {item.ruleCount}</Tag>
          <Tag color={item.boundSubjectCount > 0 ? 'green' : 'default'}>
            Subjects {item.boundSubjectCount}
          </Tag>
        </Space>
      ),
    },
    {
      title: 'Rules Preview',
      key: 'rulesPreview',
      width: 260,
      render: (_, item) => (
        <Typography.Text className="text-xs text-slate-600">
          {firstRuleSummary(item)}
        </Typography.Text>
      ),
    },
    {
      title: 'Bound Subjects',
      key: 'subjects',
      width: 320,
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
            loading={updateRoleYamlMutation.isPending || deleteMutation.isPending}
            menu={{
              items: [
                { key: 'open', label: 'Open' },
                { key: 'edit-yaml', label: 'Edit YAML' },
                { key: 'delete', label: <span className="text-red-600">Delete</span> },
              ],
              onClick: ({ key, domEvent }) => {
                domEvent.stopPropagation();
                if (key === 'open') {
                  navigate(buildClusterRoleRoute(item.name));
                  return;
                }
                if (key === 'edit-yaml') {
                  setYamlEditTarget(item);
                  return;
                }
                if (key === 'delete') {
                  confirmResourceDelete({
                    resourceKind: 'ClusterRole',
                    name: item.name,
                    impact:
                      'Subjects bound through ClusterRoleBinding or namespaced RoleBinding may lose permissions immediately after it is removed.',
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
      {sessionMode === 'token' && rolesQuery.error ? (
        <Alert type="warning" showIcon message="ClusterRole 数据加载失败" />
      ) : null}

      <ResourceListPage<ClusterRoleItem>
        title="ClusterRole 列表"
        description="查看集群级角色规则、覆盖资源与绑定主体，支持 YAML 快速编辑。"
        metrics={metrics}
        dataSource={items}
        columns={columns}
        rowKey={(record) => record.name}
        loading={sessionMode === 'token' && rolesQuery.isLoading}
        onRefresh={() => rolesQuery.refetch()}
        toolbarExtra={
          <Space size={8} wrap>
            <Tag color="blue">Cluster-scoped</Tag>
            <ResourceYamlCreateButton
              resourceKind="ClusterRole"
              namespace=""
              enabled={sessionMode === 'token'}
              onCreated={() => rolesQuery.refetch()}
            />
          </Space>
        }
        searchPlaceholder="搜索 ClusterRole、资源、verbs、绑定主体或标签"
        searchPredicate={(record, keyword) =>
          record.name.toLowerCase().includes(keyword) ||
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
        emptyDescription="当前没有可展示的 ClusterRole"
        onRow={(record) => ({
          onClick: () => navigate(buildClusterRoleRoute(record.name)),
          style: { cursor: 'pointer' },
        })}
      />

      <ResourceYamlEditorModal
        open={Boolean(yamlEditTarget)}
        title={yamlEditTarget ? `Edit ClusterRole YAML / ${yamlEditTarget.name}` : 'Edit ClusterRole YAML'}
        resourceKind="ClusterRole"
        resourceLabel={yamlEditTarget ? yamlEditTarget.name : '-'}
        result={roleYamlQuery.data}
        loading={roleYamlQuery.isFetching}
        saving={updateRoleYamlMutation.isPending}
        error={roleYamlQuery.error}
        errorMessage="ClusterRole YAML 加载失败"
        onClose={() => setYamlEditTarget(undefined)}
        onRefresh={() => {
          void roleYamlQuery.refetch();
        }}
        onSave={(content) => {
          if (!yamlEditTarget) {
            return Promise.resolve();
          }

          return updateRoleYamlMutation.mutateAsync({
            name: yamlEditTarget.name,
            content,
          });
        }}
      />
    </section>
  );
}
