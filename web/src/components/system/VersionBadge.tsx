import {
  CheckOutlined,
  CloudDownloadOutlined,
  CloseOutlined,
  LinkOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  getBuildInfo,
  getUpdateStatus,
  performSystemUpdate,
  restartSystemService,
} from '../../services/system';
import { useAppStore } from '../../stores/appStore';

type VersionBadgeProps = {
  version?: string;
};

async function checkServiceAndReload() {
  const maxRetries = 5;
  const retryDelayMs = 1000;

  for (let index = 0; index < maxRetries; index += 1) {
    try {
      const response = await fetch('/healthz', {
        method: 'GET',
        cache: 'no-store',
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
    } catch {
      // Service is expected to be temporarily unavailable during restart.
    }

    if (index < maxRetries - 1) {
      await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
    }
  }

  window.location.reload();
}

export function VersionBadge({ version = '' }: VersionBadgeProps) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sessionMode = useAppStore((state) => state.sessionMode);
  const isInteractive = sessionMode === 'token';

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState(false);
  const [needRestart, setNeedRestart] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [restartCountdown, setRestartCountdown] = useState(0);

  const buildInfoQuery = useQuery({
    queryKey: ['system-build-info'],
    queryFn: getBuildInfo,
  });

  const updateStatusQuery = useQuery({
    queryKey: ['system-update-status'],
    queryFn: () => getUpdateStatus(false),
    enabled: isInteractive,
  });

  const restartMutation = useMutation({
    mutationFn: restartSystemService,
  });

  const currentVersion = useMemo(() => {
    if (isInteractive && updateStatusQuery.data?.currentVersion) {
      return updateStatusQuery.data.currentVersion;
    }
    return buildInfoQuery.data?.version || version || '';
  }, [buildInfoQuery.data?.version, isInteractive, updateStatusQuery.data?.currentVersion, version]);

  const latestVersion = updateStatusQuery.data?.latestVersion || currentVersion;
  const hasUpdate = Boolean(isInteractive && updateStatusQuery.data?.hasUpdate);
  const releaseInfo = updateStatusQuery.data?.releaseInfo;
  const buildType = updateStatusQuery.data?.buildType || buildInfoQuery.data?.buildType || 'source';
  const isReleaseBuild = buildType === 'release';
  const canInstall = Boolean(updateStatusQuery.data?.canInstall);
  const canRestart = Boolean(updateStatusQuery.data?.canRestart);
  const statusMessage = updateStatusQuery.data?.message || '';
  const statusWarning = updateStatusQuery.data?.warning || '';
  const loading =
    buildInfoQuery.isFetching ||
    (isInteractive && updateStatusQuery.isFetching);

  const resetTransientState = () => {
    setUpdateError('');
    setUpdateSuccess(false);
    setNeedRestart(false);
  };

  const refreshVersion = async (force = true) => {
    if (!isInteractive) {
      return;
    }

    resetTransientState();
    await Promise.all([
      buildInfoQuery.refetch(),
      queryClient.fetchQuery({
        queryKey: ['system-update-status'],
        queryFn: () => getUpdateStatus(force),
      }),
    ]);
  };

  const handleUpdate = async () => {
    if (updating || !canInstall) {
      return;
    }

    setUpdating(true);
    setUpdateError('');
    setUpdateSuccess(false);

    try {
      const result = await performSystemUpdate();
      setUpdateSuccess(true);
      setNeedRestart(Boolean(result.needRestart));
      queryClient.invalidateQueries({ queryKey: ['system-update-status'] });
    } catch (error) {
      const normalized = error as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      setUpdateError(
        normalized.response?.data?.message || normalized.message || '更新失败',
      );
    } finally {
      setUpdating(false);
    }
  };

  const handleRestart = async () => {
    if (restarting || !canRestart) {
      return;
    }

    setRestarting(true);
    setRestartCountdown(8);

    try {
      await restartMutation.mutateAsync();
    } catch {
      // The request may be interrupted by the service shutdown. Continue with recovery polling.
    }

    const countdownInterval = window.setInterval(() => {
      setRestartCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(countdownInterval);
          void checkServiceAndReload();
          return 0;
        }
        return current - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    if (!isInteractive) {
      return;
    }
    void queryClient.ensureQueryData({
      queryKey: ['system-update-status'],
      queryFn: () => getUpdateStatus(false),
    });
  }, [isInteractive, queryClient]);

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
      {isInteractive ? (
        <>
          <button
            type="button"
            onClick={() => setDropdownOpen((current) => !current)}
            className={[
              'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition-colors',
              hasUpdate
                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            ].join(' ')}
            title={hasUpdate ? '有新版本可用！' : '已是最新版本'}
          >
            <span className="font-medium">{currentVersion ? `v${currentVersion}` : '--'}</span>
            {hasUpdate ? (
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
              </span>
            ) : null}
          </button>

          <div
            className={[
              'absolute left-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg transition-all duration-200 ease-out',
              dropdownOpen
                ? 'pointer-events-auto scale-100 opacity-100'
                : 'pointer-events-none scale-95 opacity-0',
            ].join(' ')}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-medium text-gray-700">当前版本</span>
              <button
                type="button"
                onClick={() => {
                  void refreshVersion(true);
                }}
                className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                disabled={loading}
                title="刷新"
              >
                <ReloadOutlined className={loading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="p-4">
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <ReloadOutlined className="animate-spin text-[24px] text-teal-600" />
                </div>
              ) : (
                <>
                  <div className="mb-4 text-center">
                    <div className="inline-flex items-center gap-2">
                      <span className="text-2xl font-bold text-gray-900">
                        {currentVersion ? `v${currentVersion}` : '--'}
                      </span>
                      {!hasUpdate ? (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
                          <CheckOutlined className="text-[12px] text-green-600" />
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {hasUpdate ? `最新版本: v${latestVersion}` : '已是最新版本'}
                    </p>
                  </div>

                  {updateError ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                          <CloseOutlined className="text-red-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-red-700">更新失败</p>
                          <p className="truncate text-xs text-red-600/70">{updateError}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void handleUpdate();
                        }}
                        disabled={updating}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        重试
                      </button>
                    </div>
                  ) : updateSuccess && needRestart ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                          <CheckOutlined className="text-green-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-green-700">更新完成</p>
                          <p className="text-xs text-green-600/70">请重启服务以应用更新</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void handleRestart();
                        }}
                        disabled={restarting || !canRestart}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ReloadOutlined className={restarting ? 'animate-spin' : ''} />
                        {restarting
                          ? `正在重启...${restartCountdown > 0 ? ` (${restartCountdown}s)` : ''}`
                          : '立即重启'}
                      </button>
                    </div>
                  ) : hasUpdate && !isReleaseBuild ? (
                    <div className="space-y-2">
                      {releaseInfo?.htmlUrl ? (
                        <a
                          href={releaseInfo.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 transition-colors hover:bg-amber-100"
                        >
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                            <CloudDownloadOutlined className="text-amber-600" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-amber-700">有新版本可用！</p>
                            <p className="text-xs text-amber-600/70">{`v${latestVersion}`}</p>
                          </div>
                          <LinkOutlined className="text-amber-500 transition-transform group-hover:translate-x-0.5" />
                        </a>
                      ) : null}

                      <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
                        <svg
                          className="h-3.5 w-3.5 flex-shrink-0 text-blue-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <p className="text-xs text-blue-600">源码构建请使用 git pull 更新</p>
                      </div>
                    </div>
                  ) : hasUpdate && isReleaseBuild ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                          <CloudDownloadOutlined className="text-amber-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-amber-700">有新版本可用！</p>
                          <p className="text-xs text-amber-600/70">{`v${latestVersion}`}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          void handleUpdate();
                        }}
                        disabled={updating || !canInstall}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <ReloadOutlined className={updating ? 'animate-spin' : ''} />
                        {updating ? '正在更新...' : '立即更新'}
                      </button>

                      {releaseInfo?.htmlUrl ? (
                        <a
                          href={releaseInfo.htmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
                        >
                          查看更新日志
                          <LinkOutlined />
                        </a>
                      ) : null}

                      {!canInstall && statusMessage ? (
                        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-2">
                          <svg
                            className="h-3.5 w-3.5 flex-shrink-0 text-blue-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <p className="text-xs text-blue-600">{statusMessage}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : releaseInfo?.htmlUrl ? (
                    <a
                      href={releaseInfo.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 py-2 text-sm text-gray-500 transition-colors hover:text-gray-700"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                        <path
                          fillRule="evenodd"
                          clipRule="evenodd"
                          d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z"
                        />
                      </svg>
                      查看发布
                    </a>
                  ) : null}

                  {!updateError && !updateSuccess && statusWarning ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
                      <svg
                        className="h-3.5 w-3.5 flex-shrink-0 text-amber-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                      <p className="text-xs text-amber-700">{statusWarning}</p>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
        </>
      ) : currentVersion ? (
        <span className="text-xs text-gray-500">{`v${currentVersion}`}</span>
      ) : null}
    </div>
  );
}
