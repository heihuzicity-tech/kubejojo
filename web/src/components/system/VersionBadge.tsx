import {
  ArrowRightOutlined,
  CheckOutlined,
  LinkOutlined,
  LockOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getBuildInfo, getUpdateStatus } from '../../services/system';
import { useAppStore } from '../../stores/appStore';

type VersionBadgeProps = {
  version?: string;
};

function getTone(
  isInteractive: boolean,
  primaryState: string | undefined,
  hasWarning: boolean,
) {
  if (!isInteractive) {
    return {
      button: 'border-slate-200 bg-slate-100 text-slate-600 hover:border-slate-300 hover:bg-slate-200',
      dot: 'bg-slate-400',
      pill: 'bg-slate-100 text-slate-600',
      label: '只读',
    };
  }

  if (hasWarning) {
    return {
      button: 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100',
      dot: 'bg-red-500',
      pill: 'bg-red-100 text-red-700',
      label: '异常',
    };
  }

  if (primaryState === 'restart_required') {
    return {
      button:
        'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
      dot: 'bg-emerald-500',
      pill: 'bg-emerald-100 text-emerald-700',
      label: '待重启',
    };
  }

  if (primaryState === 'update_available') {
    return {
      button:
        'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
      dot: 'bg-amber-500',
      pill: 'bg-amber-100 text-amber-700',
      label: '待升级',
    };
  }

  return {
    button:
      'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-100 text-emerald-700',
    label: '已同步',
  };
}

function getPrimaryCopy(
  primaryState: string | undefined,
  runningVersion: string,
  installedVersion: string,
  latestVersion: string,
  warning?: string,
) {
  if (warning) {
    return {
      title: '状态检查异常',
      description: warning,
    };
  }

  if (primaryState === 'restart_required') {
    return {
      title: `已安装 v${installedVersion}`,
      description: `当前运行仍是 v${runningVersion}，重启后才会切换到新版本。`,
    };
  }

  if (primaryState === 'update_available') {
    return {
      title: `发现新版本 v${latestVersion}`,
      description: `当前已安装 v${installedVersion}，可进入更新页面执行安装。`,
    };
  }

  return {
    title: '当前已同步',
    description: `运行版本与已安装版本一致，当前为 v${runningVersion}。`,
  };
}

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

  const status = updateStatusQuery.data;
  const runningVersion =
    (isInteractive ? status?.runningVersion : undefined) || buildInfoQuery.data?.version || version || '';
  const installedVersion = status?.installedVersion || runningVersion;
  const latestVersion = status?.latestVersion || installedVersion || runningVersion;
  const backupVersion = status?.backupVersion;
  const loading = buildInfoQuery.isFetching || (isInteractive && updateStatusQuery.isFetching);
  const tone = getTone(isInteractive, status?.primaryState, Boolean(status?.warning));
  const primaryCopy = getPrimaryCopy(
    status?.primaryState,
    runningVersion || '--',
    installedVersion || '--',
    latestVersion || '--',
    status?.warning,
  );

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
          {status?.primaryState === 'update_available' ? (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-80" />
          ) : null}
          <span className={['relative inline-flex h-2.5 w-2.5 rounded-full', tone.dot].join(' ')} />
        </span>
        <span>{runningVersion ? `v${runningVersion}` : '--'}</span>
        <span className={['rounded-full px-2 py-0.5 text-[10px]', tone.pill].join(' ')}>
          {tone.label}
        </span>
      </button>

      <div
        className={[
          'absolute left-0 z-50 mt-2 w-80 overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_24px_56px_rgba(15,23,42,0.16)] transition-all duration-200 ease-out',
          dropdownOpen
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0',
        ].join(' ')}
      >
        <div className="border-b border-slate-100 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                版本状态
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {runningVersion ? `v${runningVersion}` : '--'}
              </p>
              <p className="mt-1 text-xs text-slate-500">{primaryCopy.title}</p>
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
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">{primaryCopy.title}</div>
                <div className="mt-1 text-xs leading-6 text-slate-600">{primaryCopy.description}</div>
              </div>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-600 shadow-sm">
                {status?.primaryState === 'update_available' ? <ReloadOutlined /> : <CheckOutlined />}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
            <div className="flex justify-between gap-4">
              <span>运行版本</span>
              <span className="font-medium text-slate-900">{runningVersion ? `v${runningVersion}` : '--'}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span>已安装版本</span>
              <span className="font-medium text-slate-900">
                {installedVersion ? `v${installedVersion}` : '--'}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span>最新发布</span>
              <span className="font-medium text-slate-900">{latestVersion ? `v${latestVersion}` : '--'}</span>
            </div>
            <div className="mt-1 flex justify-between gap-4">
              <span>回滚备份</span>
              <span className="font-medium text-slate-900">
                {backupVersion ? `v${backupVersion}` : '无'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setDropdownOpen(false);
              navigate('/system/updates');
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            进入更新管理
            <ArrowRightOutlined />
          </button>

          {status?.releaseInfo?.htmlUrl ? (
            <a
              href={status.releaseInfo.htmlUrl}
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
