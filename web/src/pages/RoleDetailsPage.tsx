import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ContextRow,
  EmptyState,
  HeaderMeta,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildRoleRoute, roleStatusColor } from '../components/role/roleShared';
import { buildRoleBindingRoute } from '../components/rolebinding/roleBindingShared';
import { PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type ResourceTextResult,
  type RoleBindingItem,
  type RoleItem,
  type RoleRuleItem,
  getRoleBindings,
  getRoleYaml,
  getRoles,
  updateRoleYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type RoleDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

function RuleCard({ rule, index }: { rule: RoleRuleItem; index: number }) {
  return (
    <div className="space-y-3 rounded-[16px] border border-slate-200 bg-white px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Typography.Text strong>{`Rule ${index + 1}`}</Typography.Text>
        <Tag color="cyan">{rule.verbs.length} verbs</Tag>
        <Tag color="blue">{(rule.resources.length || rule.nonResourceUrls.length) + ' targets'}</Tag>
      </div>

      <div className="space-y-2">
        <div>
          <div className="text-[12px] font-medium text-slate-500">Verbs</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {rule.verbs.map((item) => (
              <Tag key={item} color="cyan">
                {item}
              </Tag>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[12px] font-medium text-slate-500">Resources</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {rule.resources.length > 0 ? rule.resources.map((item) => <Tag key={item}>{item}</Tag>) : <Tag>-</Tag>}
            {rule.nonResourceUrls.map((item) => (
              <Tag key={item} color="purple">
                {item}
              </Tag>
            ))}
          </div>
        </div>
        {rule.apiGroups.length > 0 ? (
          <div>
            <div className="text-[12px] font-medium text-slate-500">API Groups</div>
            <div className="mt-1 flex flex-wrap gap-2">
              {rule.apiGroups.map((item) => (
                <Tag key={item}>{item || 'core'}</Tag>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RoleDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<RoleDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const rolesQuery = useQuery({
    queryKey: ['role-detail-list', namespace],
    queryFn: () => getRoles(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const roleItem = useMemo<RoleItem | undefined>(() => {
    return (rolesQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [rolesQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshRole = async () => {
    if (allowLiveAccess) {
      await rolesQuery.refetch();
    }
  };

  const roleBindingsQuery = useQuery({
    queryKey: ['role-detail-bindings', namespace],
    queryFn: () => getRoleBindings(namespace),
    enabled: allowLiveAccess && Boolean(namespace && roleItem),
  });

  const roleYamlQuery = useQuery({
    queryKey: ['role-detail-yaml', namespace, name],
    queryFn: () => getRoleYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const roleYamlEditorQuery = useQuery({
    queryKey: ['role-detail-yaml-editor', namespace, name],
    queryFn: () => getRoleYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateRoleYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateRoleYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshRole();
      void roleYamlQuery.refetch();
      void roleYamlEditorQuery.refetch();
    },
  });

  const relatedBindings = useMemo<RoleBindingItem[]>(() => {
    if (!roleItem) {
      return [];
    }

    return (roleBindingsQuery.data ?? []).filter(
      (item) => item.roleRefKind === 'Role' && item.roleRefName === roleItem.name,
    );
  }, [roleBindingsQuery.data, roleItem]);

  const yamlResult: ResourceTextResult | undefined = roleYamlQuery.data;

  if (allowLiveAccess && rolesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 Role 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!roleItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && rolesQuery.error ? (
          <Alert type="warning" showIcon message="Role 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-sm text-slate-500">未找到这个 Role</span>} />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/security/roles')} icon={<ArrowLeftOutlined />}>
              返回 Role 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== roleItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/security/roles')}
          >
            返回 Role 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {roleItem.name}
              </Typography.Title>
              <Tag color={roleStatusColor(roleItem.status)}>{roleItem.status}</Tag>
              <Tag color="blue">Rules {roleItem.ruleCount}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? <HeaderMeta label="Namespace" value={roleItem.namespace} /> : null}
              <HeaderMeta label="Subjects" value={`${roleItem.boundSubjectCount}`} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as RoleDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Role Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Rules" value={`${roleItem.ruleCount}`} />
                        <InlineStat label="Subjects" value={`${roleItem.boundSubjectCount}`} />
                        <InlineStat label="API Groups" value={`${new Set(roleItem.rules.flatMap((item) => item.apiGroups)).size}`} />
                        <InlineStat label="Labels" value={`${roleItem.labels.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Rules" extra={<Tag>{roleItem.ruleCount}</Tag>}>
                      {roleItem.rules.length > 0 ? (
                        <div className="space-y-3">
                          {roleItem.rules.map((item, index) => (
                            <RuleCard key={`${roleItem.name}-${index}`} rule={item} index={index} />
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Role 没有定义规则" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={roleItem.summary} />
                        <ContextRow label="Namespace" value={roleItem.namespace} />
                        <ContextRow label="Bindings" value={`${relatedBindings.length}`} />
                        <ContextRow label="Route" value={buildRoleRoute(roleItem.namespace, roleItem.name)} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Bound Subjects" extra={<Tag>{roleItem.boundSubjectCount}</Tag>}>
                      {roleItem.boundSubjects.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {roleItem.boundSubjects.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Role 还没有绑定主体" />
                      )}
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
                        <Typography.Text type="secondary">
                          {roleItem.namespace}/{roleItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">Generated: {yamlResult?.generatedAt || '-'}</Typography.Text>
                      </Space>
                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button onClick={() => void roleYamlQuery.refetch()} loading={roleYamlQuery.isFetching}>
                            Refresh
                          </Button>
                        ) : null}
                        <Button type="primary" onClick={() => setYamlEditOpen(true)} disabled={!allowLiveAccess}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={allowLiveAccess ? roleYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="Role YAML 加载失败"
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
                    {allowLiveAccess && roleBindingsQuery.error ? (
                      <Alert type="warning" showIcon message="关联 RoleBinding 数据加载失败" />
                    ) : null}
                    <SectionCard title="RoleBindings" extra={<Tag>{relatedBindings.length}</Tag>}>
                      {relatedBindings.length > 0 ? (
                        <div className="space-y-3">
                          {relatedBindings.map((item) => (
                            <div key={item.name} className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag>{item.roleRefKind}</Tag>
                                    <Tag color="green">Subjects {item.subjectCount}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">{item.summary}</div>
                                </div>
                                <Button onClick={() => navigate(buildRoleBindingRoute(item.namespace, item.name))}>
                                  Open RoleBinding
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 Role 还没有被 RoleBinding 引用" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Labels" extra={<Tag>{roleItem.labels.length}</Tag>}>
                      {roleItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {roleItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 Role 没有标签" />
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
        title={`Edit Role YAML / ${roleItem.namespace}/${roleItem.name}`}
        resourceKind="Role"
        resourceLabel={`${roleItem.namespace}/${roleItem.name}`}
        result={roleYamlEditorQuery.data}
        loading={roleYamlEditorQuery.isFetching}
        saving={updateRoleYamlMutation.isPending}
        error={roleYamlEditorQuery.error}
        errorMessage="Role YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void roleYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateRoleYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
