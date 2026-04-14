import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  ContextRow,
  EmptyState,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import {
  buildPersistentVolumeRoute,
  persistentVolumeStatusColor,
} from '../components/persistentvolume/persistentVolumeShared';
import { buildPersistentVolumeClaimRoute } from '../components/persistentvolumeclaim/persistentVolumeClaimShared';
import {
  buildStorageClassRoute,
  storageClassStatusColor,
} from '../components/storageclass/storageClassShared';
import { PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PersistentVolumeClaimItem,
  type PersistentVolumeItem,
  type ResourceTextResult,
  type StorageClassItem,
  getPersistentVolumeClaims,
  getPersistentVolumes,
  getStorageClassYaml,
  getStorageClasses,
  updateStorageClassYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type StorageClassDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function StorageClassDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);

  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<StorageClassDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const classesQuery = useQuery({
    queryKey: ['storageclass-detail-list'],
    queryFn: () => getStorageClasses(),
    enabled: allowLiveAccess,
  });

  const storageClassItem = useMemo<StorageClassItem | undefined>(() => {
    return (classesQuery.data ?? []).find((item) => item.name === name);
  }, [classesQuery.data, name]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name]);

  const refreshStorageClass = async () => {
    if (allowLiveAccess) {
      await classesQuery.refetch();
    }
  };

  const volumesQuery = useQuery({
    queryKey: ['storageclass-detail-persistentvolumes'],
    queryFn: () => getPersistentVolumes(),
    enabled: allowLiveAccess && Boolean(storageClassItem),
  });

  const claimsQuery = useQuery({
    queryKey: ['storageclass-detail-persistentvolumeclaims'],
    queryFn: () => getPersistentVolumeClaims(),
    enabled: allowLiveAccess && Boolean(storageClassItem),
  });

  const storageClassYamlQuery = useQuery({
    queryKey: ['storageclass-detail-yaml', name],
    queryFn: () => getStorageClassYaml(name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(name),
  });

  const storageClassYamlEditorQuery = useQuery({
    queryKey: ['storageclass-detail-yaml-editor', name],
    queryFn: () => getStorageClassYaml(name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(name),
  });

  const updateStorageClassYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updateStorageClassYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStorageClass();
      void storageClassYamlQuery.refetch();
      void storageClassYamlEditorQuery.refetch();
    },
  });

  const relatedVolumes = useMemo<PersistentVolumeItem[]>(() => {
    if (!storageClassItem) {
      return [];
    }
    return (volumesQuery.data ?? []).filter((item) => item.storageClass === storageClassItem.name);
  }, [storageClassItem, volumesQuery.data]);

  const relatedClaims = useMemo<PersistentVolumeClaimItem[]>(() => {
    if (!storageClassItem) {
      return [];
    }
    return (claimsQuery.data ?? []).filter((item) => item.storageClass === storageClassItem.name);
  }, [claimsQuery.data, storageClassItem]);

  const yamlResult: ResourceTextResult | undefined = storageClassYamlQuery.data;

  if (allowLiveAccess && classesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 StorageClass 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!storageClassItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && classesQuery.error ? (
          <Alert type="warning" showIcon message="StorageClass 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 StorageClass</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/storage/storageclasses')} icon={<ArrowLeftOutlined />}>
              返回 StorageClass 列表
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
            onClick={() => navigate('/storage/storageclasses')}
          >
            返回 StorageClass 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {storageClassItem.name}
              </Typography.Title>
              <Tag color={storageClassStatusColor(storageClassItem.status)}>
                {storageClassItem.status}
              </Tag>
              {storageClassItem.isDefault ? <Tag color="blue">Default</Tag> : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              <span>{storageClassItem.provisioner}</span>
              <span>{storageClassItem.volumeBindingMode}</span>
              <span>{storageClassItem.reclaimPolicy}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as StorageClassDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Provisioning Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="PVs" value={`${relatedVolumes.length}`} />
                        <InlineStat label="PVCs" value={`${relatedClaims.length}`} />
                        <InlineStat
                          label="Binding"
                          value={storageClassItem.volumeBindingMode || '-'}
                        />
                        <InlineStat
                          label="Expansion"
                          value={storageClassItem.allowVolumeExpansion ? 'Enabled' : 'Disabled'}
                        />
                      </div>
                    </SectionCard>

                    <SectionCard title="Policies">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Provisioner" value={storageClassItem.provisioner} />
                        <ContextRow label="Reclaim" value={storageClassItem.reclaimPolicy} />
                        <ContextRow
                          label="BindingMode"
                          value={storageClassItem.volumeBindingMode || '-'}
                        />
                        <ContextRow
                          label="Default"
                          value={storageClassItem.isDefault ? 'Yes' : 'No'}
                        />
                        <ContextRow
                          label="Route"
                          value={buildStorageClassRoute(storageClassItem.name)}
                        />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard
                      title="Parameters"
                      extra={<Tag>{storageClassItem.parameters.length}</Tag>}
                    >
                      {storageClassItem.parameters.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {storageClassItem.parameters.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 StorageClass 没有可展示的参数" />
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
                        <Typography.Text type="secondary">{storageClassItem.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        <Button
                          onClick={() => void storageClassYamlQuery.refetch()}
                          loading={storageClassYamlQuery.isFetching}
                        >
                          Refresh
                        </Button>
                        <Button type="primary" onClick={() => setYamlEditOpen(true)}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={storageClassYamlQuery.error}
                      result={yamlResult}
                      errorMessage="StorageClass YAML 加载失败"
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
                    <SectionCard title="PersistentVolumes" extra={<Tag>{relatedVolumes.length}</Tag>}>
                      {relatedVolumes.length > 0 ? (
                        <div className="space-y-3">
                          {relatedVolumes.map((item) => (
                            <div
                              key={item.name}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>{item.name}</Typography.Text>
                                    <Tag color={persistentVolumeStatusColor(item.status)}>
                                      {item.status}
                                    </Tag>
                                    <Tag>{item.phase || '-'}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.capacity} · {item.source} · {item.reclaimPolicy}
                                  </div>
                                </div>
                                <Button onClick={() => navigate(buildPersistentVolumeRoute(item.name))}>
                                  Open PV
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 StorageClass 还没有关联的 PersistentVolume" />
                      )}
                    </SectionCard>

                    <SectionCard
                      title="PersistentVolumeClaims"
                      extra={<Tag>{relatedClaims.length}</Tag>}
                    >
                      {relatedClaims.length > 0 ? (
                        <div className="space-y-3">
                          {relatedClaims.map((item) => (
                            <div
                              key={`${item.namespace}/${item.name}`}
                              className="rounded-[16px] border border-slate-200 bg-white px-4 py-4"
                            >
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Typography.Text strong>
                                      {item.namespace}/{item.name}
                                    </Typography.Text>
                                    <Tag>{item.status}</Tag>
                                  </div>
                                  <div className="text-xs text-slate-500">
                                    {item.requestedStorage}
                                    {item.capacity ? ` · ${item.capacity}` : ''}
                                    {item.volumeName ? ` · ${item.volumeName}` : ''}
                                    {item.mountedPodCount > 0
                                      ? ` · Mounted Pods ${item.mountedPodCount}`
                                      : ''}
                                  </div>
                                </div>
                                <Button
                                  onClick={() =>
                                    navigate(buildPersistentVolumeClaimRoute(item.namespace, item.name))
                                  }
                                >
                                  Open PVC
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <EmptyState message="当前 StorageClass 还没有关联的 PersistentVolumeClaim" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Usage Summary">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Default" value={storageClassItem.isDefault ? 'Yes' : 'No'} />
                        <ContextRow
                          label="Provisioner"
                          value={storageClassItem.provisioner}
                        />
                        <ContextRow label="PVs" value={`${relatedVolumes.length}`} />
                        <ContextRow label="PVCs" value={`${relatedClaims.length}`} />
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
        title={`Edit StorageClass YAML / ${storageClassItem.name}`}
        resourceKind="StorageClass"
        resourceLabel={storageClassItem.name}
        result={storageClassYamlEditorQuery.data}
        loading={storageClassYamlEditorQuery.isFetching}
        saving={updateStorageClassYamlMutation.isPending}
        error={storageClassYamlEditorQuery.error}
        errorMessage="StorageClass YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void storageClassYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateStorageClassYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
