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
import {
  buildPersistentVolumeClaimRoute,
  persistentVolumeClaimStatusColor,
} from '../components/persistentvolumeclaim/persistentVolumeClaimShared';
import { buildPodRoute, PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PersistentVolumeClaimItem,
  type ResourceTextResult,
  getPersistentVolumeClaimYaml,
  getPersistentVolumeClaims,
  updatePersistentVolumeClaimYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type PersistentVolumeClaimDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function PersistentVolumeClaimDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const currentNamespace = useAppStore((state) => state.namespace);

  const namespace = decodeRouteParam(params.namespace);
  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<PersistentVolumeClaimDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const claimsQuery = useQuery({
    queryKey: ['persistentvolumeclaim-detail-list', namespace],
    queryFn: () => getPersistentVolumeClaims(namespace),
    enabled: allowLiveAccess && Boolean(namespace),
  });

  const claimItem = useMemo<PersistentVolumeClaimItem | undefined>(() => {
    return (claimsQuery.data ?? []).find((item) => item.namespace === namespace && item.name === name);
  }, [claimsQuery.data, name, namespace]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [namespace, name]);

  const refreshClaim = async () => {
    if (allowLiveAccess) {
      await claimsQuery.refetch();
    }
  };

  const claimYamlQuery = useQuery({
    queryKey: ['persistentvolumeclaim-detail-yaml', namespace, name],
    queryFn: () => getPersistentVolumeClaimYaml(namespace, name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(namespace && name),
  });

  const claimYamlEditorQuery = useQuery({
    queryKey: ['persistentvolumeclaim-detail-yaml-editor', namespace, name],
    queryFn: () => getPersistentVolumeClaimYaml(namespace, name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(namespace && name),
  });

  const updateClaimYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) =>
      updatePersistentVolumeClaimYaml(namespace, name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshClaim();
      void claimYamlQuery.refetch();
      void claimYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined = claimYamlQuery.data;

  if (allowLiveAccess && claimsQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 PersistentVolumeClaim 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!claimItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && claimsQuery.error ? (
          <Alert type="warning" showIcon message="PersistentVolumeClaim 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 PersistentVolumeClaim</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => navigate('/storage/persistentvolumeclaims')}
              icon={<ArrowLeftOutlined />}
            >
              返回 PersistentVolumeClaim 列表
            </Button>
          </div>
        </section>
      </section>
    );
  }

  const showNamespaceInHeader =
    currentNamespace.trim() === '' || currentNamespace !== claimItem.namespace;

  return (
    <section className="space-y-4">
      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="min-w-0 space-y-3">
          <Button
            type="text"
            className="!h-auto !px-0 !text-[13px] !text-slate-500"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate('/storage/persistentvolumeclaims')}
          >
            返回 PersistentVolumeClaim 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {claimItem.name}
              </Typography.Title>
              <Tag color={persistentVolumeClaimStatusColor(claimItem.status)}>{claimItem.status}</Tag>
              <Tag color="blue">{claimItem.storageClass || '-'}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              {showNamespaceInHeader ? (
                <HeaderMeta label="Namespace" value={claimItem.namespace} />
              ) : null}
              <HeaderMeta label="Request" value={claimItem.requestedStorage} />
              <HeaderMeta label="Volume" value={claimItem.volumeName || '-'} />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as PersistentVolumeClaimDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Storage Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Request" value={claimItem.requestedStorage} />
                        <InlineStat label="Capacity" value={claimItem.capacity || '-'} />
                        <InlineStat label="Mounted Pods" value={`${claimItem.mountedPodCount}`} />
                        <InlineStat label="Access Modes" value={`${claimItem.accessModes.length}`} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Claim Settings">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Summary" value={claimItem.summary} />
                        <ContextRow label="StorageClass" value={claimItem.storageClass || '-'} />
                        <ContextRow label="VolumeMode" value={claimItem.volumeMode} />
                        <ContextRow label="Volume" value={claimItem.volumeName || '-'} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Access Modes" extra={<Tag>{claimItem.accessModes.length}</Tag>}>
                      {claimItem.accessModes.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {claimItem.accessModes.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 PVC 没有可展示的访问模式" />
                      )}
                    </SectionCard>

                    <SectionCard title="Route">
                      <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 break-all">
                        {buildPersistentVolumeClaimRoute(claimItem.namespace, claimItem.name)}
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
                        <Typography.Text type="secondary">
                          {claimItem.namespace}/{claimItem.name}
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        {allowLiveAccess ? (
                          <Button
                            onClick={() => void claimYamlQuery.refetch()}
                            loading={claimYamlQuery.isFetching}
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
                      error={allowLiveAccess ? claimYamlQuery.error : undefined}
                      result={yamlResult}
                      errorMessage="PersistentVolumeClaim YAML 加载失败"
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
                    <SectionCard title="Mounted Pods" extra={<Tag>{claimItem.mountedPods.length}</Tag>}>
                      {claimItem.mountedPods.length > 0 ? (
                        <div className="space-y-3">
                          {claimItem.mountedPods.map((item) => (
                            <div
                              key={item}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <Typography.Text strong>{item}</Typography.Text>
                                  <div className="text-xs text-slate-500">
                                    Namespace {claimItem.namespace}
                                  </div>
                                </div>

                                <Button onClick={() => navigate(buildPodRoute(claimItem.namespace, item))}>
                                  Open Pod
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 PVC 没有被 Pod 挂载" />
                      )}
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{claimItem.labels.length}</Tag>}>
                      {claimItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {claimItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 PVC 没有 labels" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Namespace" value={claimItem.namespace} />
                        <ContextRow label="Created" value={claimItem.createdAt || '-'} />
                        <ContextRow label="Age" value={claimItem.age || '-'} />
                        <ContextRow label="Mounted Pod Count" value={`${claimItem.mountedPodCount}`} />
                      </div>
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
        title={`Edit PersistentVolumeClaim YAML / ${claimItem.namespace}/${claimItem.name}`}
        resourceKind="PersistentVolumeClaim"
        resourceLabel={`${claimItem.namespace}/${claimItem.name}`}
        result={claimYamlEditorQuery.data}
        loading={claimYamlEditorQuery.isFetching}
        saving={updateClaimYamlMutation.isPending}
        error={claimYamlEditorQuery.error}
        errorMessage="PersistentVolumeClaim YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void claimYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateClaimYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
