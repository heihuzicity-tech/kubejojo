import type { ReactNode } from 'react';

import {
  CheckCircleFilled,
  CloudDownloadOutlined,
  LinkOutlined,
  LockOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { App, Alert, Button, Skeleton, Tag, Typography } from 'antd';
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

type ActionStripProps = {
  step: string;
  title: string;
  description: string;
  status: string;
  meta: string;
  tone: 'teal' | 'slate' | 'rose';
  icon: ReactNode;
  action: ReactNode;
};

type InfoRowProps = {
  label: string;
  value: ReactNode;
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

function getHeadline(
  sessionMode: 'demo' | 'token',
  status: UpdateStatus | undefined,
  hasError: boolean,
) {
  if (sessionMode === 'demo') {
    return {
      title: '当前为只读演示模式',
      description: '页面结构与流程完整保留，但不会真正执行安装、回滚和重启动作。',
    };
  }

  if (hasError) {
    return {
      title: '更新状态暂时不可用',
      description: '请先检查服务日志和当前授权主体，再决定是否进行版本操作。',
    };
  }

  if (status?.hasUpdate) {
    return {
      title: `发现待安装版本 v${status.latestVersion}`,
      description: '新发布已经可用。先安装二进制，再手动重启服务，新的运行版本才会真正切换。',
    };
  }

  if (status?.backupAvailable) {
    return {
      title: '当前运行稳定，且保留回滚点',
      description: '如果升级后的行为不符合预期，可以直接在这个工作台切回到本地备份版本。',
    };
  }

  return {
    title: '当前版本已同步到最新发布',
    description: '版本入口不再直接执行动作。所有升级、切换、回滚都统一在这个工作台完成。',
  };
}

function ActionStrip({
  step,
  title,
  description,
  status,
  meta,
  tone,
  icon,
  action,
}: ActionStripProps) {
  const toneClasses =
    tone === 'teal'
      ? {
          shell:
            'border-teal-200/70 bg-[linear-gradient(135deg,rgba(240,253,250,0.96),rgba(255,255,255,0.98))]',
          rail: 'bg-teal-500',
          icon: 'bg-teal-100 text-teal-700',
          pill: 'bg-teal-100 text-teal-700',
        }
      : tone === 'rose'
        ? {
            shell:
              'border-rose-200/70 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,255,255,0.98))]',
            rail: 'bg-rose-500',
            icon: 'bg-rose-100 text-rose-700',
            pill: 'bg-rose-100 text-rose-700',
          }
        : {
            shell:
              'border-slate-200/80 bg-[linear-gradient(135deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]',
            rail: 'bg-slate-700',
            icon: 'bg-slate-100 text-slate-700',
            pill: 'bg-slate-100 text-slate-700',
          };

  return (
    <article
      className={[
        'updates-card-lift relative overflow-hidden rounded-[30px] border p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] lg:p-6',
        toneClasses.shell,
      ].join(' ')}
    >
      <div className={['absolute inset-y-0 left-0 w-1.5', toneClasses.rail].join(' ')} />

      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center">
        <div className="pl-1 lg:pl-4">
          <div className="flex items-center gap-3">
            <span
              className={[
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg',
                toneClasses.icon,
              ].join(' ')}
            >
              {icon}
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                {step}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{title}</h3>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm leading-7 text-slate-600">{description}</p>
          <div className="flex flex-wrap gap-2">
            <span
              className={[
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium',
                toneClasses.pill,
              ].join(' ')}
            >
              {status}
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">
              {meta}
            </span>
          </div>
          <div className="pt-1 lg:max-w-[240px]">{action}</div>
        </div>
      </div>
    </article>
  );
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
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
  const actor =
    updateStatus?.currentActor || (sessionMode === 'demo' ? '演示用户' : '未知主体');
  const repository = updateStatus?.repository || '未配置';
  const releaseName =
    updateStatus?.releaseInfo?.name ||
    (updateStatus?.hasUpdate ? `kubejojo v${latestVersion}` : '当前没有新的发布说明');
  const headline = getHeadline(sessionMode, updateStatus, statusError);
  const releasePublishedAt = formatTimestamp(updateStatus?.releaseInfo?.publishedAt);
  const releaseBody = updateStatus?.releaseInfo?.body?.trim() || '暂无可展示的发布说明。';
  const canManage = sessionMode === 'token' && !statusError;
  const releaseLink = updateStatus?.releaseInfo?.htmlUrl;

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
    <div className="updates-workbench space-y-6">
      <section className="updates-surface overflow-hidden rounded-[34px] border border-white/70 p-3 shadow-[0_24px_80px_rgba(15,23,42,0.10)] lg:p-4">
        {loading ? (
          <div className="rounded-[28px] bg-white px-6 py-7">
            <Skeleton active paragraph={{ rows: 10 }} />
          </div>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.18fr_0.82fr]">
            <section className="updates-hero relative overflow-hidden rounded-[30px] p-6 text-white lg:p-7">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:26px_26px] opacity-20" />
              <div className="updates-orb absolute -left-16 top-8 h-40 w-40 rounded-full bg-white/12 blur-3xl" />
              <div className="updates-orb absolute bottom-0 right-10 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl" />

              <div className="relative space-y-6">
                <div className="space-y-3">
                  <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100">
                    Version Control Desk
                  </span>

                  <div>
                    <Typography.Title
                      level={2}
                      className="!mb-2 !text-[clamp(2rem,3vw,3rem)] !font-semibold !text-white"
                    >
                      版本操作台
                    </Typography.Title>
                    <Typography.Paragraph className="!mb-0 max-w-3xl !text-[15px] !leading-7 !text-slate-200">
                      升级、切换、回滚都只在这里进行。顶部快捷入口不再直接执行动作，避免在日常浏览里误触版本变更。
                    </Typography.Paragraph>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                      Running
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-white">v{runningVersion}</p>
                  </div>

                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                      Latest
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-white">v{latestVersion}</p>
                  </div>

                  <div className="rounded-[24px] border border-white/12 bg-white/8 p-4 backdrop-blur">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300">
                      Build
                    </p>
                    <p className="mt-2 text-3xl font-semibold text-white">{buildType}</p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-3">
                  <div className="rounded-[22px] border border-white/12 bg-black/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                      01 / Install
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      拉取最新发布并替换本地二进制。
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-white/12 bg-black/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                      02 / Activate
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      通过重启切换到新的运行版本。
                    </p>
                  </div>

                  <div className="rounded-[22px] border border-white/12 bg-black/10 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
                      03 / Rollback
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-200">
                      异常时再切回上一个备份版本。
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="updates-card-lift rounded-[30px] border border-slate-200/80 bg-slate-950 p-5 text-white shadow-[0_20px_56px_rgba(15,23,42,0.20)] lg:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                      Status Pulse
                    </p>
                    <div>
                      <h2 className="text-[28px] font-semibold leading-tight text-white">
                        {headline.title}
                      </h2>
                      <p className="mt-2 text-sm leading-7 text-slate-300">
                        {headline.description}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      void refreshStatus(true);
                    }}
                    disabled={loading || busy}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60"
                    title="刷新版本状态"
                  >
                    <ReloadOutlined className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {updateStatus?.hasUpdate ? (
                    <Tag color="gold">有新版本</Tag>
                  ) : (
                    <Tag color="green">已同步</Tag>
                  )}
                  {statusTone(canManage, '允许执行版本操作', '只读模式')}
                  {statusTone(Boolean(updateStatus?.backupAvailable), '存在回滚备份', '没有备份')}
                </div>

                {updateStatus?.warning ? (
                  <div className="mt-4 rounded-[22px] border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm leading-6 text-amber-100">
                    {updateStatus.warning}
                  </div>
                ) : null}

                {updateStatus?.message ? (
                  <div className="mt-4 rounded-[22px] border border-white/10 bg-white/6 px-4 py-3 text-sm leading-6 text-slate-300">
                    {updateStatus.message}
                  </div>
                ) : null}
              </section>

              <section className="updates-card-lift rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                      Quick View
                    </p>
                    <Typography.Title level={4} className="!mb-0 !mt-2">
                      当前环境镜像
                    </Typography.Title>
                  </div>
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
                    {sessionMode === 'demo' ? <LockOutlined /> : <CheckCircleFilled />}
                  </span>
                </div>

                <div className="mt-4">
                  <InfoRow label="当前主体" value={actor} />
                  <InfoRow label="更新仓库" value={<span className="break-all">{repository}</span>} />
                  <InfoRow label="前端嵌入" value={statusTone(Boolean(buildInfoQuery.data?.embeddedFrontend), '已内嵌', '缺失')} />
                  <InfoRow
                    label="构建时间"
                    value={formatTimestamp(buildInfoQuery.data?.date)}
                  />
                </div>
              </section>
            </aside>
          </div>
        )}
      </section>

      {statusError ? (
        <Alert
          showIcon
          type="error"
          message="无法读取更新状态"
          description="当前页面仍会展示本地构建信息，但具体升级与回滚动作已临时锁定。请先检查服务日志、GitHub 访问以及当前授权主体。"
        />
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-4">
          <ActionStrip
            step="01 / INSTALL"
            title="安装最新发布"
            description="这一步只会替换本地二进制文件，不会立即切换当前运行进程。完成后必须再执行一次重启，新的版本才会真正生效。"
            status={
              sessionMode === 'demo'
                ? '演示模式不可执行'
                : updateStatus?.canInstall
                  ? `可安装到 v${latestVersion}`
                  : '当前无需安装'
            }
            meta={
              updateStatus?.hasUpdate
                ? `待升级版本 v${latestVersion}`
                : '安装动作只在检测到新发布时开放'
            }
            tone="teal"
            icon={<CloudDownloadOutlined />}
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
                    ? `安装 v${latestVersion}`
                    : '已是最新版本'}
              </Button>
            }
          />

          <ActionStrip
            step="02 / ACTIVATE"
            title="重启并切换运行版本"
            description="无论是刚完成安装，还是刚执行回滚，都需要通过这一步重新拉起服务。页面会自动轮询健康检查，恢复后刷新到新的运行态。"
            status={
              sessionMode === 'demo'
                ? '演示模式不可执行'
                : updateStatus?.canRestart
                  ? '允许立即重启'
                  : '当前不可重启'
            }
            meta="这是让新二进制真正接管进程的唯一入口"
            tone="slate"
            icon={<SafetyCertificateOutlined />}
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

          <ActionStrip
            step="03 / ROLLBACK"
            title="回滚到备份版本"
            description="当升级结果不符合预期时，回滚会把当前二进制与本地 `.backup` 文件交换。完成后同样需要重启，备份版本才会重新接管服务。"
            status={
              sessionMode === 'demo'
                ? '演示模式不可执行'
                : updateStatus?.canRollback
                  ? '已具备回滚条件'
                  : '当前没有可用备份'
            }
            meta="回滚按钮被单独隔离，降低误触升级后的混乱操作"
            tone="rose"
            icon={<RollbackOutlined />}
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
                {sessionMode === 'demo' ? '需要真实 Token' : '回滚到备份版本'}
              </Button>
            }
          />
        </div>

        <div className="space-y-5">
          <section className="updates-card-lift rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] lg:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Release Snapshot
                </p>
                <Typography.Title level={4} className="!mb-1 !mt-2">
                  发布摘要
                </Typography.Title>
                <Typography.Paragraph className="!mb-0 !text-slate-600">
                  这里只保留决策最需要的摘要。完整变更说明仍然建议跳到 GitHub Release 查看。
                </Typography.Paragraph>
              </div>

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
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <p className="text-lg font-semibold text-slate-950">{releaseName}</p>
              <p className="mt-1 text-sm text-slate-500">发布时间：{releasePublishedAt}</p>
              <pre className="updates-release-scroll mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-600">
                {releaseBody}
              </pre>
            </div>
          </section>

          <section className="updates-card-lift rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] lg:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Operating Rules
            </p>
            <Typography.Title level={4} className="!mb-4 !mt-2">
              操作原则
            </Typography.Title>

            <div className="space-y-3">
              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">升级不是立即生效</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  安装更新只会替换二进制文件，真正切换到新版本还要依赖一次服务重启。
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">回滚依赖本地备份</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  只有本地 `.backup` 存在时才允许回滚，所以每次升级后都要确认备份链路完整。
                </p>
              </div>

              <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm font-semibold text-slate-950">风险动作集中管理</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  快捷入口不再直接提供升级和回滚按钮，所有版本动作都要求进入这个独立页面后再确认。
                </p>
              </div>
            </div>
          </section>

          <section className="updates-card-lift rounded-[30px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] lg:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              Environment Ledger
            </p>
            <Typography.Title level={4} className="!mb-4 !mt-2">
              版本账本
            </Typography.Title>

            <InfoRow label="当前运行版本" value={`v${runningVersion}`} />
            <InfoRow label="最新发布版本" value={`v${latestVersion}`} />
            <InfoRow label="回滚备份" value={statusTone(Boolean(updateStatus?.backupAvailable), '已存在', '不存在')} />
            <InfoRow
              label="当前授权"
              value={canManage ? '允许执行更新' : sessionMode === 'demo' ? '只读演示' : '状态待修复'}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
