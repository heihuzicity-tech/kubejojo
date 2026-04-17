import type { ReactNode } from 'react';

import {
  CloudDownloadOutlined,
  LinkOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { App, Alert, Button, Descriptions, Skeleton, Tag, Typography } from 'antd';
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

type SummaryCardProps = {
  title: string;
  value: string;
  meta: string;
  accentClass: string;
  icon: ReactNode;
};

type ActionRowProps = {
  step: string;
  title: string;
  description: string;
  status: ReactNode;
  action: ReactNode;
};

type PrimaryState = {
  label: string;
  meta: string;
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
      // The service is expected to be temporarily unavailable while restarting.
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

function statusTone(value: boolean, trueLabel: string, falseLabel: string) {
  return <Tag color={value ? 'green' : 'default'}>{value ? trueLabel : falseLabel}</Tag>;
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

function SummaryCard({ title, value, meta, accentClass, icon }: SummaryCardProps) {
  return (
    <section className="rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 shadow-[0_8px_22px_rgba(15,23,42,0.05)]">
      <div className="flex items-start gap-3">
        <div
          className={[
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base',
            accentClass,
          ].join(' ')}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-medium text-slate-500">{title}</div>
          <div className="mt-1 text-[1.75rem] font-semibold leading-none tracking-[-0.03em] text-slate-950">
            {value}
          </div>
          <div className="mt-1.5 text-xs text-slate-500">{meta}</div>
        </div>
      </div>
    </section>
  );
}

function ActionRow({ step, title, description, status, action }: ActionRowProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-100 py-4 first:pt-0 last:border-b-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
          {step}
        </div>
        <div className="mt-1 text-base font-semibold text-slate-950">{title}</div>
        <div className="mt-1 text-sm leading-6 text-slate-600">{description}</div>
        <div className="mt-3 flex flex-wrap gap-2">{status}</div>
      </div>
      <div className="w-full lg:w-[220px]">{action}</div>
    </div>
  );
}

function getStatusAlert(
  sessionMode: 'demo' | 'token',
  status: UpdateStatus | undefined,
  hasError: boolean,
) {
  if (sessionMode === 'demo') {
    return {
      type: 'info' as const,
      message: '当前为演示模式',
      description: '页面可以查看版本状态，但不会真正执行安装、回滚和重启动作。',
    };
  }

  if (hasError) {
    return {
      type: 'error' as const,
      message: '无法读取更新状态',
      description: '请先检查服务日志、GitHub 访问以及当前授权主体。',
    };
  }

  if (status?.warning) {
    return {
      type: 'warning' as const,
      message: '版本检查已完成，但存在额外提示',
      description: status.warning,
    };
  }

  if (status?.hasUpdate) {
    return {
      type: 'warning' as const,
      message: `发现新版本 v${status.latestVersion}`,
      description: '安装更新后仍需手动重启服务，新版本才会真正生效。',
    };
  }

  if (status?.backupAvailable) {
    return {
      type: 'success' as const,
      message: '当前已是最新版本',
      description: '同时保留了本地备份，必要时可以直接回滚。',
    };
  }

  return {
    type: 'success' as const,
    message: '当前已是最新版本',
    description: '安装、回滚和重启都统一在本页执行，避免在快捷入口误触。',
  };
}

function getPrimaryState(
  sessionMode: 'demo' | 'token',
  status: UpdateStatus | undefined,
  hasError: boolean,
): PrimaryState {
  if (sessionMode === 'demo') {
    return {
      label: '只读演示',
      meta: '仅展示页面效果',
    };
  }

  if (hasError || status?.warning) {
    return {
      label: '检查异常',
      meta: '请先处理更新检查告警',
    };
  }

  if (status?.hasUpdate) {
    return {
      label: '可安装更新',
      meta: `目标版本 v${status.latestVersion}`,
    };
  }

  if (status?.backupAvailable) {
    return {
      label: '可回滚',
      meta: '当前已是最新版本',
    };
  }

  return {
    label: '已同步',
    meta: '当前已是最新版本',
  };
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
    mutationFn: performSystemUpdate,
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatus(true);
    },
    onError: (error) => {
      void message.error(getActionErrorMessage(error, '安装更新失败，请稍后重试。'));
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: rollbackSystemUpdate,
    onSuccess: async (result) => {
      void message.success(result.message);
      await refreshStatus(true);
    },
    onError: (error) => {
      void message.error(getActionErrorMessage(error, '回滚失败，请稍后重试。'));
    },
  });

  const restartMutation = useMutation({
    mutationFn: restartSystemService,
    onSuccess: async (result) => {
      void message.success(result.message);
      const hide = message.loading('正在等待服务重启...', 0);
      try {
        await waitForHealthz();
        hide();
        window.location.reload();
      } catch (error) {
        hide();
        void message.error(
          error instanceof Error ? error.message : '服务已触发重启，请稍后手动刷新页面。',
        );
      }
    },
    onError: (error) => {
      void message.error(getActionErrorMessage(error, '重启失败，请稍后重试。'));
    },
  });

  const busy =
    updateMutation.isPending || rollbackMutation.isPending || restartMutation.isPending;
  const loading = buildInfoQuery.isLoading || (sessionMode === 'token' && updateStatusQuery.isLoading);
  const updateStatus = updateStatusQuery.data;
  const statusError = sessionMode === 'token' && Boolean(updateStatusQuery.error);

  const runningVersion = buildInfoQuery.data?.version || updateStatus?.currentVersion || '-';
  const latestVersion = updateStatus?.latestVersion || runningVersion;
  const buildType = buildInfoQuery.data?.buildType || updateStatus?.buildType || 'unknown';
  const canManage = sessionMode === 'token' && !statusError;
  const actor =
    updateStatus?.currentActor || (sessionMode === 'demo' ? '演示用户' : '未知主体');
  const repository = updateStatus?.repository || '未配置';
  const releaseName =
    updateStatus?.releaseInfo?.name ||
    (updateStatus?.hasUpdate ? `kubejojo v${latestVersion}` : '当前没有新的发布说明');
  const releasePublishedAt = formatTimestamp(updateStatus?.releaseInfo?.publishedAt);
  const releaseBody = updateStatus?.releaseInfo?.body?.trim() || '暂无可展示的发布说明。';
  const releaseLink = updateStatus?.releaseInfo?.htmlUrl;
  const statusAlert = getStatusAlert(sessionMode, updateStatus, statusError);
  const primaryState = getPrimaryState(sessionMode, updateStatus, statusError);

  const openUpdateConfirm = (status: UpdateStatus) => {
    modal.confirm({
      title: '确认安装新版本',
      content: `当前运行版本为 v${status.currentVersion}，将安装到 v${status.latestVersion}。安装完成后不会立即生效，仍需要手动重启服务。`,
      okText: '确认安装',
      cancelText: '取消',
      onOk: async () => updateMutation.mutateAsync(),
    });
  };

  const openRollbackConfirm = () => {
    modal.confirm({
      title: '确认回滚到上一个备份版本',
      content: '当前二进制会与 .backup 备份版本交换，回滚完成后仍需要手动重启服务才能生效。',
      okText: '确认回滚',
      cancelText: '取消',
      okButtonProps: {
        danger: true,
      },
      onOk: async () => rollbackMutation.mutateAsync(),
    });
  };

  const openRestartConfirm = () => {
    modal.confirm({
      title: '确认重启服务',
      content: '服务会主动退出并依赖 systemd 自动拉起，页面会在健康检查恢复后自动刷新。',
      okText: '立即重启',
      cancelText: '取消',
      onOk: async () => restartMutation.mutateAsync(),
    });
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Typography.Title level={3} className="!mb-1">
            更新管理
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-slate-500">
            安装更新、重启生效和回滚都集中在这里处理，避免在快捷入口里误操作。
          </Typography.Paragraph>
        </div>

        <Button
          icon={<ReloadOutlined />}
          loading={loading}
          disabled={busy}
          onClick={() => {
            void refreshStatus(true);
          }}
        >
          刷新状态
        </Button>
      </section>

      {loading ? (
        <section className="rounded-[20px] border border-slate-200 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <SummaryCard
              title="当前运行版本"
              value={`v${runningVersion}`}
              meta={`构建类型：${buildType}`}
              icon={<SafetyCertificateOutlined />}
              accentClass="bg-teal-50 text-teal-700"
            />
            <SummaryCard
              title="最新发布版本"
              value={`v${latestVersion}`}
              meta={updateStatus?.hasUpdate ? '检测到可安装的新版本' : '当前没有新的发布'}
              icon={<CloudDownloadOutlined />}
              accentClass="bg-sky-50 text-sky-700"
            />
            <SummaryCard
              title="当前状态"
              value={primaryState.label}
              meta={primaryState.meta}
              icon={<RollbackOutlined />}
              accentClass="bg-amber-50 text-amber-700"
            />
          </div>

          <Alert
            showIcon
            type={statusAlert.type}
            message={statusAlert.message}
            description={statusAlert.description}
          />

          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <Panel
              title="版本操作"
              description="安装更新和回滚都不会立即生效，完成后还需要执行一次服务重启。"
            >
              <ActionRow
                step="01 / INSTALL"
                title="安装最新发布"
                description="下载并替换本地二进制文件，但不会立刻切换当前进程版本。"
                status={
                  <>
                    <Tag color={updateStatus?.canInstall ? 'gold' : 'default'}>
                      {sessionMode === 'demo'
                        ? '演示模式不可执行'
                        : updateStatus?.canInstall
                          ? `可安装到 v${latestVersion}`
                          : '当前无需安装'}
                    </Tag>
                    <span className="text-xs text-slate-500">
                      {updateStatus?.hasUpdate
                        ? `检测到新版本 v${latestVersion}`
                        : '仅在存在新版本时开放'}
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
                      if (updateStatus) {
                        openUpdateConfirm(updateStatus);
                      }
                    }}
                  >
                    {sessionMode === 'demo'
                      ? '需要真实 Token'
                      : updateStatus?.canInstall
                        ? '安装更新'
                        : '已是最新版本'}
                  </Button>
                }
              />

              <ActionRow
                step="02 / RESTART"
                title="重启服务并切换版本"
                description="让刚安装或刚回滚的二进制真正接管当前运行进程。"
                status={
                  <>
                    <Tag color={updateStatus?.canRestart ? 'blue' : 'default'}>
                      {sessionMode === 'demo'
                        ? '演示模式不可执行'
                        : updateStatus?.canRestart
                          ? '允许立即重启'
                          : '当前不可重启'}
                    </Tag>
                    <span className="text-xs text-slate-500">安装或回滚完成后，再执行这一步生效</span>
                  </>
                }
                action={
                  <Button
                    size="large"
                    block
                    icon={<SafetyCertificateOutlined />}
                    disabled={!updateStatus?.canRestart || !canManage || busy}
                    loading={restartMutation.isPending}
                    onClick={openRestartConfirm}
                  >
                    {sessionMode === 'demo' ? '需要真实 Token' : '重启服务'}
                  </Button>
                }
              />

              <ActionRow
                step="03 / ROLLBACK"
                title="回滚到备份版本"
                description="把当前二进制切回本地备份版本，适合升级后快速恢复。"
                status={
                  <>
                    <Tag color={updateStatus?.canRollback ? 'red' : 'default'}>
                      {sessionMode === 'demo'
                        ? '演示模式不可执行'
                        : updateStatus?.canRollback
                          ? '存在本地备份'
                          : '当前没有可用备份'}
                    </Tag>
                    <span className="text-xs text-slate-500">这是备份能力，不代表当前主状态发生变化</span>
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
                    onClick={openRollbackConfirm}
                  >
                    {sessionMode === 'demo' ? '需要真实 Token' : '回滚版本'}
                  </Button>
                }
              />
            </Panel>

            <Panel
              title="当前环境"
              description="保留当前版本状态、授权信息和发布摘要。"
              extra={
                releaseLink ? (
                  <a
                    href={releaseLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                  >
                    GitHub
                    <LinkOutlined />
                  </a>
                ) : null
              }
            >
              <Descriptions column={1} size="small" colon={false}>
                <Descriptions.Item label="当前运行版本">
                  <Typography.Text strong>v{runningVersion}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="最新发布版本">
                  <Typography.Text>v{latestVersion}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="当前主体">
                  <Typography.Text>{actor}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="更新仓库">
                  <Typography.Text code>{repository}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="构建类型">
                  <Typography.Text>{buildType}</Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="前端内嵌">
                  {statusTone(Boolean(buildInfoQuery.data?.embeddedFrontend), '已就绪', '缺失')}
                </Descriptions.Item>
                <Descriptions.Item label="回滚备份">
                  {statusTone(Boolean(updateStatus?.backupAvailable), '已存在', '不存在')}
                </Descriptions.Item>
                <Descriptions.Item label="当前授权">
                  <Typography.Text>
                    {canManage
                      ? '允许执行更新'
                      : sessionMode === 'demo'
                        ? '只读演示'
                        : '状态待修复'}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>

              <div className="mt-5 rounded-[18px] border border-slate-200 bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-950">{releaseName}</div>
                <div className="mt-1 text-xs text-slate-500">发布时间：{releasePublishedAt}</div>
                <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words font-sans text-sm leading-6 text-slate-600">
                  {releaseBody}
                </pre>
              </div>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
