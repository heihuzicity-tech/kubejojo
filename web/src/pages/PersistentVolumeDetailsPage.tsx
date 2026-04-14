import { ArrowLeftOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, Space, Tabs, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import {
  buildPersistentVolumeRoute,
  persistentVolumeStatusColor,
} from '../components/persistentvolume/persistentVolumeShared';
import {
  ContextRow,
  EmptyState,
  InlineStat,
  SectionCard,
} from '../components/resource-detail/detailShared';
import { buildPersistentVolumeClaimRoute } from '../components/persistentvolumeclaim/persistentVolumeClaimShared';
import { PodTextViewer } from '../components/pod/podShared';
import { ResourceYamlEditorModal } from '../components/workload/ResourceYamlEditorModal';
import {
  type PersistentVolumeItem,
  type ResourceTextResult,
  getPersistentVolumeYaml,
  getPersistentVolumes,
  updatePersistentVolumeYaml,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

type PersistentVolumeDetailsTabKey = 'overview' | 'yaml' | 'related';

function decodeRouteParam(value?: string) {
  return value ? decodeURIComponent(value) : '';
}

export function PersistentVolumeDetailsPage() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const params = useParams();
  const sessionMode = useAppStore((state) => state.sessionMode);

  const name = decodeRouteParam(params.name);

  const [activeTab, setActiveTab] = useState<PersistentVolumeDetailsTabKey>('overview');
  const [yamlEditOpen, setYamlEditOpen] = useState(false);

  const allowLiveAccess = sessionMode === 'token';

  const volumesQuery = useQuery({
    queryKey: ['persistentvolume-detail-list'],
    queryFn: () => getPersistentVolumes(),
    enabled: allowLiveAccess,
  });

  const volumeItem = useMemo<PersistentVolumeItem | undefined>(() => {
    return (volumesQuery.data ?? []).find((item) => item.name === name);
  }, [name, volumesQuery.data]);

  useEffect(() => {
    setActiveTab('overview');
    setYamlEditOpen(false);
  }, [name]);

  const refreshVolume = async () => {
    if (allowLiveAccess) {
      await volumesQuery.refetch();
    }
  };

  const volumeYamlQuery = useQuery({
    queryKey: ['persistentvolume-detail-yaml', name],
    queryFn: () => getPersistentVolumeYaml(name),
    enabled: allowLiveAccess && activeTab === 'yaml' && Boolean(name),
  });

  const volumeYamlEditorQuery = useQuery({
    queryKey: ['persistentvolume-detail-yaml-editor', name],
    queryFn: () => getPersistentVolumeYaml(name),
    enabled: allowLiveAccess && yamlEditOpen && Boolean(name),
  });

  const updateVolumeYamlMutation = useMutation({
    mutationFn: ({ content }: { content: string }) => updatePersistentVolumeYaml(name, content),
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshVolume();
      void volumeYamlQuery.refetch();
      void volumeYamlEditorQuery.refetch();
    },
  });

  const yamlResult: ResourceTextResult | undefined = volumeYamlQuery.data;

  if (allowLiveAccess && volumesQuery.isLoading) {
    return (
      <section className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          正在加载 PersistentVolume 详情...
        </Typography.Paragraph>
      </section>
    );
  }

  if (!volumeItem) {
    return (
      <section className="space-y-4">
        {allowLiveAccess && volumesQuery.error ? (
          <Alert type="warning" showIcon message="PersistentVolume 详情加载失败" />
        ) : null}
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span className="text-sm text-slate-500">未找到这个 PersistentVolume</span>}
          />
          <div className="mt-6 flex justify-center">
            <Button onClick={() => navigate('/storage/persistentvolumes')} icon={<ArrowLeftOutlined />}>
              返回 PersistentVolume 列表
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
            onClick={() => navigate('/storage/persistentvolumes')}
          >
            返回 PersistentVolume 列表
          </Button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Typography.Title className="!mb-0 !text-[26px] !font-semibold !leading-8 !tracking-[-0.03em] break-all">
                {volumeItem.name}
              </Typography.Title>
              <Tag color={persistentVolumeStatusColor(volumeItem.status)}>{volumeItem.status}</Tag>
              <Tag color="blue">{volumeItem.storageClass || '-'}</Tag>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-slate-500">
              <span>Capacity {volumeItem.capacity}</span>
              <span>Source {volumeItem.source}</span>
              <span>{volumeItem.reclaimPolicy}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[20px] border border-slate-200 bg-white px-5 py-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as PersistentVolumeDetailsTabKey)}
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                  <div className="space-y-4">
                    <SectionCard title="Volume Summary">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <InlineStat label="Capacity" value={volumeItem.capacity} />
                        <InlineStat label="Phase" value={volumeItem.phase || '-'} />
                        <InlineStat label="Mode" value={volumeItem.volumeMode} />
                        <InlineStat label="Source" value={volumeItem.source} />
                      </div>
                    </SectionCard>

                    <SectionCard title="Policies">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Reclaim" value={volumeItem.reclaimPolicy} />
                        <ContextRow label="StorageClass" value={volumeItem.storageClass || '-'} />
                        <ContextRow label="AccessModes" value={volumeItem.accessModes.join(', ') || '-'} />
                        <ContextRow label="Route" value={buildPersistentVolumeRoute(volumeItem.name)} />
                      </div>
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Claim">
                      {volumeItem.claimName ? (
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-medium text-slate-900">
                            {volumeItem.claimNamespace}/{volumeItem.claimName}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">Bound claim reference</div>
                        </div>
                      ) : (
                        <EmptyState message="当前 PV 还没有绑定到 PVC" />
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
                        <Typography.Text type="secondary">{volumeItem.name}</Typography.Text>
                        <Typography.Text type="secondary">
                          Generated: {yamlResult?.generatedAt || '-'}
                        </Typography.Text>
                      </Space>

                      <Space wrap>
                        <Button onClick={() => void volumeYamlQuery.refetch()} loading={volumeYamlQuery.isFetching}>
                          Refresh
                        </Button>
                        <Button type="primary" onClick={() => setYamlEditOpen(true)}>
                          Edit YAML
                        </Button>
                      </Space>
                    </div>

                    <PodTextViewer
                      error={volumeYamlQuery.error}
                      result={yamlResult}
                      errorMessage="PersistentVolume YAML 加载失败"
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
                    <SectionCard title="Claim Reference">
                      {volumeItem.claimName ? (
                        <div className="rounded-[16px] border border-slate-200 bg-white px-4 py-4">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0 space-y-1">
                              <Typography.Text strong>
                                {volumeItem.claimNamespace}/{volumeItem.claimName}
                              </Typography.Text>
                              <div className="text-xs text-slate-500">PersistentVolumeClaim</div>
                            </div>
                            <Button
                              onClick={() =>
                                navigate(
                                  buildPersistentVolumeClaimRoute(
                                    volumeItem.claimNamespace || '',
                                    volumeItem.claimName || '',
                                  ),
                                )
                              }
                            >
                              Open PVC
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <EmptyState message="当前 PV 没有绑定的 PVC" />
                      )}
                    </SectionCard>

                    <SectionCard title="Labels" extra={<Tag>{volumeItem.labels.length}</Tag>}>
                      {volumeItem.labels.length > 0 ? (
                        <Space size={[8, 8]} wrap>
                          {volumeItem.labels.map((item) => (
                            <Tag key={item}>{item}</Tag>
                          ))}
                        </Space>
                      ) : (
                        <EmptyState message="当前 PV 没有 labels" />
                      )}
                    </SectionCard>
                  </div>

                  <div className="space-y-4">
                    <SectionCard title="Context">
                      <div className="divide-y divide-slate-200 rounded-[16px] border border-slate-200 bg-white">
                        <ContextRow label="Created" value={volumeItem.createdAt || '-'} />
                        <ContextRow label="Age" value={volumeItem.age || '-'} />
                        <ContextRow label="Name" value={volumeItem.name} />
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
        title={`Edit PersistentVolume YAML / ${volumeItem.name}`}
        resourceKind="PersistentVolume"
        resourceLabel={volumeItem.name}
        result={volumeYamlEditorQuery.data}
        loading={volumeYamlEditorQuery.isFetching}
        saving={updateVolumeYamlMutation.isPending}
        error={volumeYamlEditorQuery.error}
        errorMessage="PersistentVolume YAML 加载失败"
        onClose={() => setYamlEditOpen(false)}
        onRefresh={() => {
          void volumeYamlEditorQuery.refetch();
        }}
        onSave={(content) => updateVolumeYamlMutation.mutateAsync({ content })}
      />
    </section>
  );
}
