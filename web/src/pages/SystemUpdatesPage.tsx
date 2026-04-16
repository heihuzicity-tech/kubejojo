import {
  Alert,
  App,
  Button,
  Descriptions,
  Empty,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd';
import {
  CloudDownloadOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import {
  getBuildInfo,
  getUpdateStatus,
  performSystemUpdate,
  restartSystemService,
  rollbackSystemUpdate,
  type UpdateStatus,
} from '../services/system';
import { useAppStore } from '../stores/appStore';

function Panel({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Typography.Title level={4} className="!mb-0">
          {title}
        </Typography.Title>
        {extra}
      </div>
      {children}
    </section>
  );
}

function toneTag(value: boolean, trueLabel: string, falseLabel: string) {
  return <Tag color={value ? 'green' : 'default'}>{value ? trueLabel : falseLabel}</Tag>;
}

async function waitForHealthz() {
  const maxAttempts = 45;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const response = await fetch('/healthz', {
        cache: 'no-store',
      });
      if (response.ok) {
        return;
      }
    } catch {
      // Service is expected to be unavailable during restart.
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('Service did not recover within the expected time window.');
}

export function SystemUpdatesPage() {
  const { message, modal } = App.useApp();
  const queryClient = useQueryClient();
  const sessionMode = useAppStore((state) => state.sessionMode);

  const buildInfoQuery = useQuery({
    queryKey: ['system-build-info'],
    queryFn: getBuildInfo,
  });

  const updateStatusQuery = useQuery({
    queryKey: ['system-update-status'],
    queryFn: () => getUpdateStatus(false),
    enabled: sessionMode === 'token',
  });

  const refreshStatus = (force = false) =>
    queryClient.fetchQuery({
      queryKey: ['system-update-status'],
      queryFn: () => getUpdateStatus(force),
    });

  const updateMutation = useMutation({
    mutationFn: performSystemUpdate,
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatus(true);
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: rollbackSystemUpdate,
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatus(true);
    },
  });

  const restartMutation = useMutation({
    mutationFn: restartSystemService,
    onSuccess: async (result) => {
      void message.success(result.message);
      const hide = message.loading('Waiting for the service to restart...', 0);
      try {
        await waitForHealthz();
        hide();
        window.location.reload();
      } catch (error) {
        hide();
        void message.error(
          error instanceof Error
            ? error.message
            : 'Service restart was triggered, but automatic recovery verification timed out.',
        );
      }
    },
  });

  const updateStatus = updateStatusQuery.data;
  const busy =
    updateMutation.isPending || rollbackMutation.isPending || restartMutation.isPending;

  const openUpdateConfirm = (status: UpdateStatus) => {
    modal.confirm({
      title: 'Install latest release',
      content: `Current version ${status.currentVersion}, latest version ${status.latestVersion}. The server binary will be replaced in place and a restart will be required.`,
      okText: 'Install Update',
      cancelText: 'Cancel',
      okButtonProps: {
        danger: false,
      },
      onOk: async () => updateMutation.mutateAsync(),
    });
  };

  const openRollbackConfirm = () => {
    modal.confirm({
      title: 'Rollback to previous binary',
      content: 'The current executable will be swapped with the .backup binary. A restart will still be required after rollback.',
      okText: 'Rollback',
      cancelText: 'Cancel',
      okButtonProps: {
        danger: true,
      },
      onOk: async () => rollbackMutation.mutateAsync(),
    });
  };

  const openRestartConfirm = () => {
    modal.confirm({
      title: 'Restart service',
      content: 'The server process will exit and rely on systemd Restart=always to come back. The page will poll /healthz and reload after recovery.',
      okText: 'Restart',
      cancelText: 'Cancel',
      onOk: async () => restartMutation.mutateAsync(),
    });
  };

  return (
    <div className="space-y-5">
      {sessionMode === 'demo' ? (
        <Alert
          showIcon
          type="info"
          message="Demo mode"
          description="System update controls are unavailable in demo mode. Sign in with a real Kubernetes ServiceAccount token to inspect update permissions."
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.94fr_1.06fr]">
        <Panel
          title="Build"
          extra={
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                void buildInfoQuery.refetch();
                if (sessionMode === 'token') {
                  void updateStatusQuery.refetch();
                }
              }}
            >
              Refresh
            </Button>
          }
        >
          {buildInfoQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 4 }} />
          ) : (
            <Descriptions column={1} size="small" colon={false}>
              <Descriptions.Item label="Version">
                <Space size={8}>
                  <Tag color="blue">{buildInfoQuery.data?.version || '-'}</Tag>
                  <Tag color={buildInfoQuery.data?.buildType === 'release' ? 'green' : 'default'}>
                    {buildInfoQuery.data?.buildType || '-'}
                  </Tag>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="Commit">
                <Typography.Text code>{buildInfoQuery.data?.commit || '-'}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Built At">
                <Typography.Text>{buildInfoQuery.data?.date || '-'}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Embedded Frontend">
                {toneTag(Boolean(buildInfoQuery.data?.embeddedFrontend), 'Ready', 'Missing')}
              </Descriptions.Item>
            </Descriptions>
          )}
        </Panel>

        <Panel
          title="Update Controls"
          extra={
            <Button
              icon={<SyncOutlined />}
              loading={updateStatusQuery.isFetching}
              disabled={sessionMode !== 'token'}
              onClick={() => {
                void refreshStatus(true);
              }}
            >
              Check Latest
            </Button>
          }
        >
          {sessionMode !== 'token' ? (
            <Alert
              showIcon
              type="warning"
              message="Update controls require a real cluster identity"
              description="The server authorizes update actions against your Kubernetes identity and the configured allowlist."
            />
          ) : updateStatusQuery.isLoading ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : updateStatusQuery.error ? (
            <Alert
              showIcon
              type="error"
              message="Failed to load update status"
              description="Check server logs or verify the current identity still has access."
            />
          ) : (
            <div className="space-y-4">
              <Space size={[8, 8]} wrap>
                <Tag color={updateStatus?.hasUpdate ? 'gold' : 'green'}>
                  {updateStatus?.hasUpdate ? 'Update Available' : 'Up to Date'}
                </Tag>
                {toneTag(Boolean(updateStatus?.updateEnabled), 'Update Enabled', 'Update Disabled')}
                {toneTag(Boolean(updateStatus?.authorized), 'Authorized', 'Unauthorized')}
                {updateStatus?.cached ? <Tag>Cached</Tag> : null}
              </Space>

              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="Current Version">
                  <Typography.Text>{updateStatus?.currentVersion || '-'}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Latest Version">
                  <Typography.Text>{updateStatus?.latestVersion || '-'}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Repository">
                  <Typography.Text code>{updateStatus?.repository || '-'}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Current Actor">
                  <Typography.Text>{updateStatus?.currentActor || '-'}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Allowed Subjects">
                  <Typography.Text>
                    {updateStatus?.allowedSubjects?.length
                      ? updateStatus.allowedSubjects.join(', ')
                      : 'No allowlist configured'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="Rollback Backup">
                  {toneTag(Boolean(updateStatus?.backupAvailable), 'Available', 'Missing')}
                </Descriptions.Item>
              </Descriptions>

              <Alert
                showIcon
                type={
                  updateStatus?.canInstall
                    ? 'success'
                    : updateStatus?.hasUpdate
                      ? 'warning'
                      : 'info'
                }
                message={updateStatus?.message || 'Update status is not available.'}
                description={updateStatus?.warning || undefined}
              />

              <Space wrap>
                <Button
                  type="primary"
                  icon={<CloudDownloadOutlined />}
                  disabled={!updateStatus?.canInstall || busy}
                  loading={updateMutation.isPending}
                  onClick={() => {
                    if (updateStatus) {
                      openUpdateConfirm(updateStatus);
                    }
                  }}
                >
                  Install Update
                </Button>
                <Button
                  danger
                  icon={<RollbackOutlined />}
                  disabled={!updateStatus?.canRollback || busy}
                  loading={rollbackMutation.isPending}
                  onClick={openRollbackConfirm}
                >
                  Rollback
                </Button>
                <Button
                  icon={<SafetyCertificateOutlined />}
                  disabled={!updateStatus?.canRestart || busy}
                  loading={restartMutation.isPending}
                  onClick={openRestartConfirm}
                >
                  Restart Service
                </Button>
              </Space>
            </div>
          )}
        </Panel>
      </div>

      <Panel title="Latest Release Notes">
        {updateStatus?.releaseInfo ? (
          <div className="space-y-3">
            <Space size={[8, 8]} wrap>
              <Tag color="blue">{updateStatus.releaseInfo.name || updateStatus.latestVersion}</Tag>
              {updateStatus.releaseInfo.publishedAt ? (
                <Tag>{updateStatus.releaseInfo.publishedAt}</Tag>
              ) : null}
              {updateStatus.releaseInfo.htmlUrl ? (
                <a
                  href={updateStatus.releaseInfo.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-teal-700 hover:text-teal-800"
                >
                  Open Release Notes
                </a>
              ) : null}
            </Space>
            <pre className="max-h-[480px] overflow-auto rounded-2xl bg-slate-950/95 p-4 text-sm leading-6 text-slate-100">
              {updateStatus.releaseInfo.body || 'No release notes provided.'}
            </pre>
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No release metadata is available yet."
          />
        )}
      </Panel>
    </div>
  );
}
