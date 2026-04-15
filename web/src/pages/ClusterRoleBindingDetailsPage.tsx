import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildClusterRoleBindingRoute,
  clusterRoleBindingStatusColor,
} from '../components/clusterrolebinding/clusterRoleBindingShared';
import { buildClusterRoleRoute } from '../components/clusterrole/clusterRoleShared';
import { PodTextViewer } from '../components/pod/podShared';
import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildServiceAccountRoute } from '../components/serviceaccount/serviceAccountShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ClusterRoleBindingItem,
  type ClusterRoleItem,
  type ResourceTextResult,
  type ServiceAccountItem,
  getClusterRoleBindingYaml,
  getClusterRoleBindings,
  getClusterRoles,
  getServiceAccounts,
  updateClusterRoleBindingYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type ClusterRoleBindingDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function subjectKindColor(kind: string) {
  switch (kind) {
    case 'ServiceAccount':
      return 'blue';
    case 'Group':
      return 'purple';
    case 'User':
      return 'cyan';
    default:
      return 'default';
  }
}

export function ClusterRoleBindingDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);

  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<ClusterRoleBindingDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const bindingsQuery = useQuery({
    queryKey: ['clusterrolebinding-detail-list'],
    queryFn: () => getClusterRoleBindings(),
    enabled: allowLiveAccess,
  });

  const bindingItem = useMemo<ClusterRoleBindingItem | undefined>(() => {
    return (bindingsQuery.data ?? []).find((item) => item.name === name);
  }, [bindingsQuery.data, name]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name]);

  const refreshBinding = async () => {
    if (allowLiveAccess) {
      await bindingsQuery.refetch();
    }
  };

  const rolesQuery = useQuery({
    queryKey: ['clusterrolebinding-detail-clusterroles'],
    queryFn: () => getClusterRoles(),
    enabled: allowLiveAccess && Boolean(bindingItem && bindingItem.roleRefKind === 'ClusterRole'),
  });

  const serviceAccountsQuery = useQuery({
    queryKey: ['clusterrolebinding-detail-serviceaccounts'],
    queryFn: () => getServiceAccounts(),
    enabled:
      allowLiveAccess &&
      Boolean(
        bindingItem &&
          bindingItem.subjects.some((item) => item.kind === 'ServiceAccount'),
      ),
  });

  const bindingYamlQuery = useQuery({
    queryKey: ['clusterrolebinding-detail-yaml', name],
    queryFn: () => getClusterRoleBindingYaml(name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(name),
  });

  const bindingYamlEditorQuery = useQuery({
    queryKey: ['clusterrolebinding-detail-yaml-editor', name],
    queryFn: () => getClusterRoleBindingYaml(name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(name),
  });

  const updateBindingYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) =>
      updateClusterRoleBindingYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshBinding();
      void bindingYamlQuery.refetch();
      void bindingYamlEditorQuery.refetch();
    },
  });

  const targetRole = useMemo<ClusterRoleItem | undefined>(() => {
    if (!bindingItem || bindingItem.roleRefKind !== 'ClusterRole') {
      return undefined;
    }

    return (rolesQuery.data ?? []).find((item) => item.name === bindingItem.roleRefName);
  }, [bindingItem, rolesQuery.data]);

  const relatedServiceAccounts = useMemo<ServiceAccountItem[]>(() => {
    if (!bindingItem) {
      return [];
    }

    const keys = new Set(
      bindingItem.subjects
        .filter((item) => item.kind === 'ServiceAccount')
        .map((item) => `${item.namespace || 'default'}/${item.name}`),
    );

    return (serviceAccountsQuery.data ?? []).filter((item) =>
      keys.has(`${item.namespace}/${item.name}`),
    );
  }, [bindingItem, serviceAccountsQuery.data]);

  const yamlResult: ResourceTextResult | undefined = bindingYamlQuery.data;

  if (allowLiveAccess && bindingsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 ClusterRoleBinding 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!bindingItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && bindingsQuery.error ? (
          <Alert type="warning" showIcon message="ClusterRoleBinding 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 ClusterRoleBinding</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => navigate('/security/clusterrolebindings')}
              icon={<ArrowLeftOutlined />}
            >
              返回 ClusterRoleBinding 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/security/clusterrolebindings')}
          >
            返回 ClusterRoleBinding 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {bindingItem.name}
              </Typography.Title>
              <Tag color={clusterRoleBindingStatusColor(bindingItem.status)}>
                {bindingItem.status}
              </Tag>
              <Tag color="blue">{bindingItem.roleRefKind}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              <HeaderMeta label="RoleRef" value={bindingItem.roleRefName} />
              <HeaderMeta label="Subjects" value={`${bindingItem.subjectCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ClusterRoleBindingDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Binding Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Subjects" value={`${bindingItem.subjectCount}`} />
                        <InlineStat label="RoleRef" value={bindingItem.roleRefKind} />
                        <InlineStat
                          label="ServiceAccounts"
                          value={`${bindingItem.subjects.filter((item) => item.kind === 'ServiceAccount').length}`}
                        />
                        <InlineStat label="Labels" value={`${bindingItem.labels.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Subjects" extra={<Tag>{bindingItem.subjectCount}</Tag>}>
                      {bindingItem.subjects.length > 0 ? (
                        <div className="space-y-3">
                          {bindingItem.subjects.map((item) => (
                            <div
                              key={`${item.kind}-${item.namespace || '-'}-${item.name}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color={subjectKindColor(item.kind)}>{item.kind}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.namespace ? `${item.namespace} · ` : ''}
                                    {item.apiGroup || 'core'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 ClusterRoleBinding 没有配置主体" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="RoleRef">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={bindingItem.summary} />
                        <ContextRow label="Kind" value={bindingItem.roleRefKind} />
                        <ContextRow label="Name" value={bindingItem.roleRefName} />
                        <ContextRow label="API Group" value={bindingItem.roleRefApiGroup || '-'} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Route">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Binding" value={buildClusterRoleBindingRoute(bindingItem.name)} />
                      </div>
                    </SectionCard>
                  </div>
                </div>
              ),
            },
            {
              key: 'yaml',
              label: 'YAML',
              children: (
                <SectionCard title="YAML">
                  <section className="space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <Space wrap>
                        <Tag color="blue">Manifest</Tag>
                        <Typography.Text type="secondary">{bindingItem.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>
                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void bindingYamlQuery.refetch()}
                            loading={bindingYamlQuery.isFetching}
                          >
                            Refresh
                          </Button>
                        ) : null}
                        <Button
                          type="primary"
                          onClick={() => setYamlEditOpen(true)}
                          disabled={!allowLiveAccess}
                        >
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? bindingYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="ClusterRoleBinding YAML 加载失败"
                      emptyMessage="No YAML available."
                    />
                  </section>
                </SectionCard>
              ),
            },
            {
              key: 'related',
              label: 'Related',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Target ClusterRole" extra={<Tag>{targetRole ? 1 : 0}</Tag>}>
                      {targetRole ? (
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Typography.Text strong>{targetRole.name}</Typography.Text>
                                <Tag color="blue">ClusterRole</Tag>
                                <Tag color="cyan">Rules {targetRole.ruleCount}</Tag>
                              </div>
                              <div className="text-xs text-slate-500">{targetRole.summary}</div>
                            </div>
                            <Button onClick={() => navigate(buildClusterRoleRoute(targetRole.name))}>
                              Open ClusterRole
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <EmptyState message="未找到对应的 ClusterRole，可能已被删除或当前无权限读取" />
                      )}
                    </SectionCard>

                    <SectionCard
                      title="ServiceAccount Subjects"
                      extra={<Tag>{relatedServiceAccounts.length}</Tag>}
                    >
                      {relatedServiceAccounts.length > 0 ? (
                        <div className="space-y-3">
                          {relatedServiceAccounts.map((item) => (
                            <div
                              key={`${item.namespace}/${item.name}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color="blue">ServiceAccount</Tag>
                                    <Tag>{item.namespace}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">{item.summary}</div>
                                </div>
                                <Button onClick={() => navigate(buildServiceAccountRoute(item.namespace, item.name))}>
                                  Open ServiceAccount
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前绑定没有可关联的 ServiceAccount 主体" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Labels" extra={<Tag>{bindingItem.labels.length}</Tag>}>
                      {bindingItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {bindingItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 ClusterRoleBinding 没有标签" />
                      )}
                    </SectionCard>
                  </div>
                </div>
              ),
            },
          ]}
        />
      </section>

      <ResourceYamlEditorModal
        open={yamlEditOpen}
        title={`Edit ClusterRoleBinding YAML / ${bindingItem.name}`}
        resourceKind="ClusterRoleBinding"
        resourceLabel={bindingItem.name}
        result={bindingYamlEditorQuery.data}
        loading={bindingYamlEditorQuery.isFetching}
        saving={updateBindingYamlMutation.isPending}
        error={bindingYamlEditorQuery.error}
        errorMessage="ClusterRoleBinding YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void bindingYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateBindingYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
