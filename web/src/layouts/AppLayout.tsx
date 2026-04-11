import { LogoutOutlined, MenuOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { Button, Drawer, Grid, Select, Space, Tag, Typography } from 'antd';
import { PropsWithChildren, startTransition, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { PageErrorBoundary } from '../app/PageErrorBoundary';
import { getAuthMe, getNamespaces } from '../services/cluster';
import { useAppStore } from '../stores/appStore';
import { findNavigationItem, navigationSections } from './navigation';

type NavigationPanelProps = {
  currentPath: string;
  currentContext?: string;
  sessionMode: 'demo' | 'token';
  expandedSection: string | null;
  onNavigate: (path: string) => void;
  onToggleSection: (key: string, defaultPath: string, isActive: boolean) => void;
};

const demoNamespaces = ['default', 'kube-system', 'kube-public', 'kube-node-lease'];

function NavigationPanel({
  currentPath,
  currentContext,
  sessionMode,
  expandedSection,
  onNavigate,
  onToggleSection,
}: NavigationPanelProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-teal-700">
          Single Cluster
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <Typography.Title level={4} className="!mb-0">
              K8s Admin
            </Typography.Title>
            <div className="mt-1 text-xs text-slate-500">Kubernetes 管理控制台</div>
          </div>
          <Tag color={sessionMode === 'demo' ? 'gold' : 'cyan'} className="rounded-full px-2 py-0.5">
            {sessionMode === 'demo' ? 'Demo' : 'Token'}
          </Tag>
        </div>
        {currentContext ? (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Context: <span className="font-medium text-slate-700">{currentContext}</span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="space-y-1.5">
          {navigationSections.map((section) => {
            const sectionActive = section.items.some(
              (item) => currentPath === item.path || currentPath.startsWith(`${item.path}/`),
            );
            const expanded = expandedSection === section.key;

            return (
              <section key={section.key} className="rounded-xl">
                <button
                  type="button"
                  onClick={() =>
                    onToggleSection(section.key, section.items[0]?.path ?? '/', sectionActive)
                  }
                  className={[
                    'flex w-full items-center rounded-lg px-3 py-2 text-left transition-[background-color,color,box-shadow] duration-250 ease-out',
                    sectionActive
                      ? 'bg-slate-950 text-white shadow-[inset_0_0_0_1px_rgba(148,163,184,0.12),0_10px_24px_rgba(15,23,42,0.18)]'
                      : 'text-slate-800 hover:bg-teal-50 hover:text-teal-700',
                  ].join(' ')}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={sectionActive ? 'text-teal-300' : 'text-slate-500'}>
                      {section.icon}
                    </span>
                    <div className="min-w-0">
                      <div className={['text-[14px]', sectionActive ? 'font-semibold' : 'font-medium'].join(' ')}>
                        {section.label}
                      </div>
                    </div>
                  </div>
                </button>

                <div
                  className={[
                    'grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-300 ease-out',
                    expanded ? 'mt-1 grid-rows-[1fr] opacity-100' : 'mt-0 grid-rows-[0fr] opacity-0',
                  ].join(' ')}
                >
                  <div className="min-h-0 overflow-hidden">
                    <div className="space-y-0.5 pl-4">
                    {section.items.map((item) => {
                      const active =
                        currentPath === item.path || currentPath.startsWith(`${item.path}/`);

                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => onNavigate(item.path)}
                          className={[
                            'flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left transition-[background-color,color] duration-200 ease-out',
                            active
                              ? 'bg-teal-50 text-slate-950 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.10)]'
                              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                          ].join(' ')}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={[
                                'shrink-0 transition-all duration-200 ease-out',
                                active
                                  ? 'h-4 w-1 rounded-full bg-teal-600'
                                  : 'h-1.5 w-1.5 rounded-full bg-slate-300',
                              ].join(' ')}
                            />
                            <span className={['truncate text-[13px]', active ? 'font-semibold' : 'font-medium'].join(' ')}>
                              {item.label}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function AppLayout({ children }: PropsWithChildren) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const screens = Grid.useBreakpoint();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const token = useAppStore((state) => state.token);
  const namespace = useAppStore((state) => state.namespace);
  const setNamespace = useAppStore((state) => state.setNamespace);
  const userName = useAppStore((state) => state.userName);
  const setUserName = useAppStore((state) => state.setUserName);
  const sessionMode = useAppStore((state) => state.sessionMode);
  const clearToken = useAppStore((state) => state.clearToken);

  const authQuery = useQuery({
    queryKey: ['auth-me'],
    queryFn: getAuthMe,
    enabled: sessionMode === 'token' && Boolean(token),
  });

  const namespacesQuery = useQuery({
    queryKey: ['namespaces'],
    queryFn: getNamespaces,
    enabled: sessionMode === 'token' && Boolean(token),
  });

  useEffect(() => {
    if (authQuery.data?.name) {
      setUserName(authQuery.data.name);
    }
  }, [authQuery.data?.name, setUserName]);

  useEffect(() => {
    const status = authQuery.error instanceof AxiosError ? authQuery.error.response?.status : undefined;
    if (sessionMode === 'token' && (status === 401 || status === 403)) {
      queryClient.clear();
      clearToken();
      navigate('/login', { replace: true });
    }
  }, [authQuery.error, clearToken, navigate, queryClient, sessionMode]);

  const namespaceOptions =
    sessionMode === 'demo' ? demoNamespaces : namespacesQuery.data ?? [];

  const activeItem = useMemo(() => findNavigationItem(location.pathname), [location.pathname]);
  const activeSectionKey = activeItem?.sectionKey ?? navigationSections[0]?.key ?? 'cluster';
  const [expandedSection, setExpandedSection] = useState<string | null>(activeSectionKey);

  useEffect(() => {
    setExpandedSection(activeSectionKey);
  }, [activeSectionKey]);

  const handleNavigate = (path: string) => {
    startTransition(() => navigate(path));
    setDrawerOpen(false);
  };

  const handleToggleSection = (key: string, defaultPath: string, isActive: boolean) => {
    if (!isActive) {
      setExpandedSection(key);
      startTransition(() => navigate(defaultPath));
      setDrawerOpen(false);
      return;
    }

    setExpandedSection((current) => (current === key ? null : key));
  };

  const handleLogout = () => {
    queryClient.clear();
    clearToken();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-transparent">
      {screens.lg ? (
        <aside className="fixed inset-y-0 left-0 z-30 w-[256px] border-r border-slate-200 bg-white">
          <NavigationPanel
            currentPath={location.pathname}
            currentContext={authQuery.data?.currentContext}
            sessionMode={sessionMode}
            expandedSection={expandedSection}
            onNavigate={handleNavigate}
            onToggleSection={handleToggleSection}
          />
        </aside>
      ) : (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={256}
          closable={false}
          styles={{ body: { padding: 0 } }}
        >
          <NavigationPanel
            currentPath={location.pathname}
            currentContext={authQuery.data?.currentContext}
            sessionMode={sessionMode}
            expandedSection={expandedSection}
            onNavigate={handleNavigate}
            onToggleSection={handleToggleSection}
          />
        </Drawer>
      )}

      <div className="min-h-screen lg:pl-[256px]">
        <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              {!screens.lg ? (
                <Button icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />
              ) : null}
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {activeItem?.sectionLabel ?? 'K8s Admin'}
                </div>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <Typography.Title level={4} className="!mb-0 truncate">
                    {activeItem?.label ?? 'Overview'}
                  </Typography.Title>
                </div>
              </div>
            </div>

            <Space size={10} wrap className="justify-end">
              <Space size={8}>
                <Typography.Text type="secondary">Namespace</Typography.Text>
                <Select
                  value={namespace}
                  style={{ width: 180 }}
                  options={namespaceOptions.map((item) => ({ label: item, value: item }))}
                  onChange={setNamespace}
                />
              </Space>
              <Tag color={sessionMode === 'demo' ? 'gold' : 'geekblue'} className="rounded-full px-3 py-1">
                {userName}
              </Tag>
              <Button icon={<LogoutOutlined />} onClick={handleLogout}>
                退出
              </Button>
            </Space>
          </div>
        </header>

        <main className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6">
          <PageErrorBoundary resetKey={`${location.pathname}:${namespace}`}>
            {children}
          </PageErrorBoundary>
        </main>
      </div>
    </div>
  );
}
