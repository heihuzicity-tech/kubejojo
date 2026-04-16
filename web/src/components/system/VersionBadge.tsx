import {
  ArrowRightOutlined,
  CheckOutlined,
  LinkOutlined,
  LockOutlined,
  ReloadOutlined,
  RollbackOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getBuildInfo, getUpdateStatus } from '../../services/system';
import { useAppStore } from '../../stores/appStore';

type VersionBadgeProps = {
  version?: string;
};

export function VersionBadge({ version = '' }: VersionBadgeProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sessionMode = useAppStore((state) => state.sessionMode);
  const isInteractive = sessionMode === 'token';
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const buildInfoQuery = useQuery({
    queryKey: ['system-build-info'],
    queryFn: getBuildInfo,
  });

  const updateStatusQuery = useQuery({
    queryKey: ['system-update-status'],
    queryFn: () => getUpdateStatus(false),
    enabled: isInteractive,
  });

  const currentVersion =
    (isInteractive ? updateStatusQuery.data?.currentVersion : undefined) ||
    buildInfoQuery.data?.version ||
    version ||
    '';
  const latestVersion = updateStatusQuery.data?.latestVersion || currentVersion;
  const hasUpdate = Boolean(isInteractive && updateStatusQuery.data?.hasUpdate);
  const backupAvailable = Boolean(updateStatusQuery.data?.backupAvailable);
  const loading = buildInfoQuery.isFetching || (isInteractive && updateStatusQuery.isFetching);
  const releaseLink = updateStatusQuery.data?.releaseInfo?.htmlUrl;
  const statusMessage = updateStatusQuery.data?.warning || updateStatusQuery.data?.message || '';

  const tone = hasUpdate
    ? {
        button: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
        dot: 'bg-amber-500',
        pill: 'bg-amber-100 text-amber-700',
        label: '待升级',
      }
    : backupAvailable
      ? {
          button: 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100',
          dot: 'bg-sky-500',
          pill: 'bg-sky-100 text-sky-700',
          label: '可回滚',
        }
      : isInteractive
        ? {
            button: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
            dot: 'bg-emerald-500',
            pill: 'bg-emerald-100 text-emerald-700',
            label: '已同步',
          }
        : {
            button: 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:bg-slate-200',
            dot: 'bg-slate-400',
            pill: 'bg-slate-100 text-slate-600',
            label: '只读',
          };

  const refreshVersion = async (force = true) => {
    if (!isInteractive) {
      return;
    }

    await Promise.all([
      buildInfoQuery.refetch(),
      queryClient.fetchQuery({
        queryKey: ['system-update-status'],
        queryFn: () => getUpdateStatus(force),
      }),
    ]);
  };

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (!containerRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen((current) => !current)}
        className={[
          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
          tone.button,
        ].join(' ')}
        title="打开版本状态面板"
      >
        <span className="relative flex h-2.5 w-2.5">
          {hasUpdate ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80" />
          ) : null}
          <span className={['relative inline-flex h-2.5 w-2.5 rounded-full', tone.dot].join(' ')} />
        </span>
        <span>{currentVersion ? `v${currentVersion}` : '--'}</span>
        <span className={['rounded-full px-2 py-0.5 text-[10px]', tone.pill].join(' ')}>
          {tone.label}
        </span>
      </button>

      <div
        className={[
          'absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-[26px] border border-slate-200 bg-white/96 shadow-[0_24px_56px_rgba(15,23,42,0.16)] backdrop-blur transition-all duration-200 ease-out',
          dropdownOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0',
        ].join(' ')}
      >
        <div className="border-b border-slate-100 bg-[linear-gradient(135deg,rgba(248,250,252,0.95),rgba(255,255,255,0.98))] px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
                Version Pulse
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {currentVersion ? `v${currentVersion}` : '--'}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {hasUpdate ? `最新发布 v${latestVersion}` : '更新与回滚都在独立页面执行'}
              </p>
            </div>

            {isInteractive ? (
              <button
                type="button"
                onClick={() => {
                  void refreshVersion(true);
                }}
                disabled={loading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                title="刷新版本状态"
              >
                <ReloadOutlined className={loading ? 'animate-spin' : ''} />
              </button>
            ) : (
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
                <LockOutlined />
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                Running
              </p>
              <p className="mt-2 text-lg font-semibold text-slate-950">
                {currentVersion ? `v${currentVersion}` : '--'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                State
              </p>
              <div className="mt-2 flex items-center gap-2 text-slate-950">
                {hasUpdate ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <ReloadOutlined />
                  </span>
                ) : backupAvailable ? (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <RollbackOutlined />
                  </span>
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckOutlined />
                  </span>
                )}
                <span className="text-sm font-semibold text-slate-900">{tone.label}</span>
              </div>
            </div>
          </div>

          {statusMessage ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
              {statusMessage}
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
              {isInteractive
                ? '高风险动作已从快捷入口移走，只保留状态查看和管理页跳转。'
                : '当前为演示模式，只显示版本面板和管理页入口。'}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              navigate('/system/updates');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            进入版本操作台
            <ArrowRightOutlined />
          </button>

          {releaseLink ? (
            <a
              href={releaseLink}
              target="_blank"
              rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            >
              查看 GitHub Release
              <LinkOutlined />
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
