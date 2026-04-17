import { useState, type ReactNode } from 'react';

import {
  CloudDownloadOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  InfoCircleFilled,
  LinkOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { App, Button, Skeleton, Tag, Typography } from 'antd';
import { AxiosError } from 'axios';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getBuildInfo,
  getUpdateStatus,
  performSystemUpdate,
  restartSystemService,
  rollbackSystemUpdate,
  type UpdateStatus,
} from '../services/system';
import { useAppStore } from '../stores/appStore';

type PanelProps = {
  title: string;
  description?: string;
  extra?: ReactNode;
  children: ReactNode;
};

type InfoItemProps = {
  label: string;
  value: ReactNode;
  span?: 'full' | 'normal';
};

type ActionRowProps = {
  title: string;
  description: string;
  status: ReactNode;
  action: ReactNode;
};

type AlertState = {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  description: string;
};

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
      // Service is expected to be temporarily unavailable while restarting.
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error('服务在预期时间内没有恢复，请手动刷新页面确认状态。');
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof AxiosError) {
    const responseMessage = error.response?.data?.message;
    if (typeof responseMessage === 'string' && responseMessage.trim()) {
      return responseMessage;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function formatTimestamp(value?: string) {
  if (!value) {
    return '未记录';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

function normalizeReleaseBody(value?: string) {
  const trimmed = value?.trim() || '';
  if (!trimmed) {
    return '';
  }

  if (/^\*\*Full Changelog\*\*:\s*https?:\/\/\S+$/i.test(trimmed)) {
    return '';
  }

  return trimmed;
}

function Panel({ title, description, extra, children }: PanelProps) {
  return (
    <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <Typography.Title level={4} className="!mb-1">
            {title}
          </Typography.Title>
          {description ? (
            <Typography.Paragraph className="!mb-0 !text-slate-500">
              {description}
            </Typography.Paragraph>
          ) : null}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

function InfoItem({ label, value, span = 'normal' }: InfoItemProps) {
  return (
    <div
      className={[
        'border-b border-slate-100 py-3 last:border-b-0 sm:last:border-b sm:pb-3',
        span === 'full' ? 'sm:col-span-2' : '',
      ].join(' ')}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-sm font-semibold leading-6 text-slate-950">{value}</div>
    </div>
  );
}

function ActionRow({ title, description, status, action }: ActionRowProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 py-4 first:pt-0 last:border-b-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-base font-semibold text-slate-950">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div>
        <div className="mt-3 flex flex-wrap gap-2">{status}</div>
      </div>
      <div className="w-full lg:w-[220px]">{action}</div>
    </div>
  );
}

function StatusNotice({ state }: { state: AlertState }) {
  const toneClass =
    state.type === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : state.type === 'error'
        ? 'border-rose-200 bg-rose-50 text-rose-900'
        : state.type === 'warning'
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-sky-200 bg-sky-50 text-sky-900';

  const icon =
    state.type === 'success' ? (
      <CheckCircleFilled className="text-emerald-500" />
    ) : state.type === 'error' ? (
      <CloseCircleFilled className="text-rose-500" />
    ) : state.type === 'warning' ? (
      <ExclamationCircleFilled className="text-amber-500" />
    ) : (
      <InfoCircleFilled className="text-sky-500" />
    );

  return (
    <div className={`mb-5 rounded-[18px] border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="pt-0.5 text-lg">{icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{state.message}</div>
          <div className="mt-1 text-sm leading-6 opacity-90">{state.description}</div>
        </div>
      </div>
    </div>
  );
}

function getPrimaryAlert(
  sessionMode: 'demo' | 'token',
  status: UpdateStatus | undefined,
  hasError: boolean,
): AlertState {
  if (sessionMode === 'demo') {
    return {
      type: 'info',
      message: '当前为演示模式',
      description: '页面只展示版本状态，不会真正执行安装、回滚和重启动作。',
    };
  }

  if (hasError) {
    return {
      type: 'error',
      message: '无法读取更新状态',
      description: '请先检查服务日志、GitHub 访问以及当前授权主体。',
    };
  }

  if (status?.primaryState === 'restart_required') {
    const description = `已安装 v${status.installedVersion}，当前运行仍是 v${status.runningVersion}。请执行一次服务重启使新版本生效。`;
    return {
      type: 'success',
      message: '已安装，等待重启',
      description: status.warning ? `${description} ${status.warning}` : description,
    };
  }

  if (status?.primaryState === 'update_available') {
    const description = `最新发布是 v${status.latestVersion}，当前已安装 v${status.installedVersion}。安装后仍需手动重启。`;
    return {
      type: 'warning',
      message: `发现新版本 v${status.latestVersion}`,
      description: status.warning ? `${description} ${status.warning}` : description,
    };
  }

  if (status?.warning) {
    return {
      type: 'warning',
      message: '状态检查完成，但存在告警',
      description: status.warning,
    };
  }

  return {
    type: 'success',
    message: '当前已是最新版本',
    description: '运行版本与已安装版本一致，当前无需安装或重启。',
  };
}

export function SystemUpdatesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const sessionMode = useAppStore((state) => state.sessionMode);
  const [updateError, setUpdateError] = useState('');
  const [rollbackError, setRollbackError] = useState('');
  const [restartError, setRestartError] = useState('');

  const buildInfoQuery = useQuery({
    queryKey: ['system-build-info'],
    queryFn: getBuildInfo,
  });

  const updateStatusQuery = useQuery({
    queryKey: ['system-update-status'],
    queryFn: () => getUpdateStatus(false),
    enabled: sessionMode === 'token',
  });

  const clearErrors = () => {
    setUpdateError('');
    setRollbackError('');
    setRestartError('');
  };

  const refreshStatus = async (force = false) => {
    const tasks: Array<Promise<unknown>> = [buildInfoQuery.refetch()];

    if (sessionMode === 'token') {
      tasks.push(
        queryClient.fetchQuery({
          queryKey: ['system-update-status'],
          queryFn: () => getUpdateStatus(force),
        }),
      );
    }

    await Promise.all(tasks);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      clearErrors();
      return performSystemUpdate();
    },
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatus(true);
    },
    onError: (error) => {
      setUpdateError(getActionErrorMessage(error, '安装更新失败，请稍后重试。'));
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: async () => {
      clearErrors();
      return rollbackSystemUpdate();
    },
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatus(true);
    },
    onError: (error) => {
      setRollbackError(getActionErrorMessage(error, '回滚失败，请稍后重试。'));
    },
  });

  const restartMutation = useMutation({
    mutationFn: async () => {
      clearErrors();
      return restartSystemService();
    },
    onSuccess: async (result) => {
      void message.success(result.message);
      const hide = message.loading('正在等待服务重启...', 0);
      try {
        await waitForHealthz();
        hide();
        window.location.reload();
      } catch (error) {
        hide();
        const errorMessage =
          error instanceof Error ? error.message : '服务已触发重启，请稍后手动刷新页面。';
        setRestartError(errorMessage);
        void message.error(errorMessage);
      }
    },
    onError: (error) => {
      const errorMessage = getActionErrorMessage(error, '重启失败，请稍后重试。');
      setRestartError(errorMessage);
      void message.error(errorMessage);
    },
  });

  const busy =
    updateMutation.isPending || rollbackMutation.isPending || restartMutation.isPending;
  const loading = buildInfoQuery.isLoading || (sessionMode === 'token' && updateStatusQuery.isLoading);
  const updateStatus = updateStatusQuery.data;
  const statusError = sessionMode === 'token' && Boolean(updateStatusQuery.error);

  const runningVersion = updateStatus?.runningVersion || buildInfoQuery.data?.version || '-';
  const installedVersion = updateStatus?.installedVersion || runningVersion;
  const latestVersion = updateStatus?.latestVersion || installedVersion;
  const backupVersion = updateStatus?.backupVersion || '';
  const buildType = buildInfoQuery.data?.buildType || updateStatus?.buildType || 'unknown';
  const actor =
    updateStatus?.currentActor || (sessionMode === 'demo' ? '演示用户' : '未知主体');
  const repository = updateStatus?.repository || '未配置';
  const releaseName =
    updateStatus?.releaseInfo?.name ||
    (updateStatus?.primaryState === 'update_available'
      ? `kubejojo v${latestVersion}`
      : '当前没有新的发布说明');
  const releasePublishedAt = formatTimestamp(updateStatus?.releaseInfo?.publishedAt);
  const releaseBody = normalizeReleaseBody(updateStatus?.releaseInfo?.body);
  const releaseLink = updateStatus?.releaseInfo?.htmlUrl;
  const canManage = sessionMode === 'token' && !statusError;
  const primaryAlert = getPrimaryAlert(sessionMode, updateStatus, statusError);
  const actionAlert: AlertState | null = updateMutation.isPending
    ? {
        type: 'info',
        message: '正在安装更新',
        description: '正在下载并替换本地二进制，页面其他操作不会被锁死，但请勿重复发起安装。',
      }
    : rollbackMutation.isPending
      ? {
          type: 'info',
          message: '正在回滚版本',
          description: '正在切换主二进制与备份二进制，完成后仍需要手动重启。',
        }
      : restartMutation.isPending
        ? {
            type: 'info',
            message: '正在重启服务',
            description: '服务会短暂中断，页面会在健康检查恢复后自动刷新。',
          }
        : updateError
          ? {
              type: 'error',
              message: '安装更新失败',
              description: updateError,
            }
          : rollbackError
            ? {
                type: 'error',
                message: '回滚失败',
                description: rollbackError,
              }
            : restartError
              ? {
                  type: 'error',
                  message: '重启失败',
                  description: restartError,
                }
              : null;
  const activeStatus = actionAlert ?? primaryAlert;

  return (
    <div className="space-y-5">
      {loading ? (
        <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr] xl:items-start">
          <Panel
            title="版本状态"
            description="运行版本、已安装版本和最新发布由服务端统一判断。"
            extra={
              <div className="flex flex-wrap items-center justify-end gap-2">
                {releaseLink ? (
                  <a
                    href={releaseLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    GitHub
                    <LinkOutlined />
                  </a>
                ) : null}
                <Button
                  icon={<ReloadOutlined />}
                  loading={loading}
                  disabled={busy}
                  onClick={() => {
                    clearErrors();
                    void refreshStatus(true);
                  }}
                >
                  刷新状态
                </Button>
              </div>
            }
          >
            <>
              <StatusNotice state={activeStatus} />

              <div className="grid gap-x-6 sm:grid-cols-2">
                  <InfoItem
                    label="当前主状态"
                    value={
                      updateStatus?.primaryState === 'restart_required'
                        ? '已安装，等待重启'
                        : updateStatus?.primaryState === 'update_available'
                          ? '可安装更新'
                          : sessionMode === 'demo'
                            ? '只读演示'
                            : '已是最新版本'
                    }
                  />
                  <InfoItem label="当前运行版本" value={`v${runningVersion}`} />
                  <InfoItem label="当前已安装版本" value={`v${installedVersion}`} />
                  <InfoItem label="最新发布版本" value={`v${latestVersion}`} />
                  <InfoItem label="回滚备份版本" value={backupVersion ? `v${backupVersion}` : '无'} />
                  <InfoItem label="构建类型" value={buildType} />
                  <InfoItem label="最新发布" value={releaseName} span="full" />
                  <InfoItem label="发布时间" value={releasePublishedAt} />
                  <InfoItem label="当前主体" value={actor} span="full" />
                  <InfoItem
                    label="更新仓库"
                    value={<Typography.Text code>{repository}</Typography.Text>}
                    span="full"
                  />
                </div>

                {releaseBody ? (
                  <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-semibold text-slate-950">更新摘要</div>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-600">
                      {releaseBody}
                    </pre>
                  </div>
                ) : null}
              </>
            </Panel>

            <Panel
              title="可执行操作"
              description="安装和回滚都只是替换磁盘中的受管二进制，真正切换版本要靠重启。"
            >
              <ActionRow
                title="安装最新发布"
                description="仅在“可安装更新”状态下开放；如果已经安装完成但还没重启，这里会明确停用。"
                status={
                  <>
                    <Tag color={updateStatus?.canInstall ? 'gold' : 'default'}>
                      {sessionMode === 'demo'
                        ? '演示模式不可执行'
                        : updateMutation.isPending
                          ? '安装进行中'
                          : updateStatus?.primaryState === 'restart_required'
                            ? '等待重启后再处理'
                            : updateStatus?.canInstall
                              ? `可安装到 v${latestVersion}`
                              : '当前无需安装'}
                    </Tag>
                    <span className="text-xs text-slate-500">
                      以“已安装版本”和“最新发布版本”的差异来判断是否可安装
                    </span>
                  </>
                }
                action={
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<CloudDownloadOutlined />}
                    disabled={!updateStatus?.canInstall || !canManage || busy}
                    loading={updateMutation.isPending}
                    onClick={() => {
                      void updateMutation.mutateAsync();
                    }}
                  >
                    {updateMutation.isPending
                      ? '正在安装'
                      : sessionMode === 'demo'
                        ? '需要真实 Token'
                        : updateStatus?.primaryState === 'restart_required'
                          ? '等待重启'
                          : updateStatus?.canInstall
                            ? '安装更新'
                            : '已是最新版本'}
                  </Button>
                }
              />

              <ActionRow
                title="重启服务并切换版本"
                description="只有当服务端判定存在“已安装但未生效”的版本差异时，才允许执行重启。"
                status={
                  <>
                    <Tag color={updateStatus?.canRestart ? 'blue' : 'default'}>
                      {sessionMode === 'demo'
                        ? '演示模式不可执行'
                        : restartMutation.isPending
                          ? '正在重启'
                          : updateStatus?.canRestart
                            ? `重启后切换到 v${installedVersion}`
                            : '当前无需重启'}
                    </Tag>
                    <span className="text-xs text-slate-500">
                      只有运行版本和已安装版本不一致时才开放
                    </span>
                  </>
                }
                action={
                  <Button
                    size="large"
                    block
                    icon={<SafetyCertificateOutlined />}
                    disabled={!updateStatus?.canRestart || !canManage || busy}
                    loading={restartMutation.isPending}
                    onClick={() => {
                      void restartMutation.mutateAsync();
                    }}
                  >
                    {restartMutation.isPending
                      ? '正在重启'
                      : sessionMode === 'demo'
                        ? '需要真实 Token'
                        : updateStatus?.canRestart
                          ? '立即重启'
                          : '无需重启'}
                  </Button>
                }
              />

              <ActionRow
                title="回滚到备份版本"
                description="回滚只依赖本地备份链。它不是主状态，只是一个备用操作入口。"
                status={
                  <>
                    <Tag color={updateStatus?.canRollback ? 'red' : 'default'}>
                      {sessionMode === 'demo'
                        ? '演示模式不可执行'
                        : rollbackMutation.isPending
                          ? '回滚进行中'
                          : updateStatus?.canRollback
                            ? `可回滚到 v${backupVersion}`
                            : '当前没有可用备份'}
                    </Tag>
                    <span className="text-xs text-slate-500">
                      备份版本与已安装版本相同的残留文件不会再被当作可回滚版本
                    </span>
                  </>
                }
                action={
                  <Button
                    danger
                    size="large"
                    block
                    icon={<RollbackOutlined />}
                    disabled={!updateStatus?.canRollback || !canManage || busy}
                    loading={rollbackMutation.isPending}
                    onClick={() => {
                      void rollbackMutation.mutateAsync();
                    }}
                  >
                    {rollbackMutation.isPending
                      ? '正在回滚'
                      : sessionMode === 'demo'
                        ? '需要真实 Token'
                        : updateStatus?.canRollback
                          ? '回滚版本'
                          : '无可回滚版本'}
                  </Button>
                }
              />
            </Panel>
          </div>
      )}
    </div>
  );
}
