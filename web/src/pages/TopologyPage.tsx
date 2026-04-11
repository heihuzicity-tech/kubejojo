import {
  AimOutlined,
  LinkOutlined,
  SettingOutlined,
  ShrinkOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Popover,
  Segmented,
  Skeleton,
  Space,
  Switch,
  Tag,
  Typography,
} from 'antd';
import {
  Background,
  type Edge,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { TopologyEdge } from '../modules/topology/components/TopologyEdge';
import { TopologyGroupNode, TopologyObjectNode } from '../modules/topology/components/TopologyNodes';
import {
  collapseGraph,
  findGroupContaining,
  getGraphSize,
  type GroupByMode,
  groupGraph,
} from '../modules/topology/graph/graphGrouping';
import { maxZoom, minZoom } from '../modules/topology/graph/graphConstants';
import {
  applyGraphLayout,
  type TopologyFlowEdgeData,
  type TopologyFlowNodeData,
  type TopologyViewState,
} from '../modules/topology/graph/graphLayout';
import {
  collectLeafNodes,
  forEachNode,
  graphContainsNode,
  makeTopologyElements,
  type TopologyGraphNode,
} from '../modules/topology/graph/graphModel';
import {
  useTopologyGraphViewport,
  type ZoomMode,
} from '../modules/topology/graph/useTopologyGraphViewport';
import {
  getDisplayResource,
  getNodeIssueCount,
  sourceMeta,
  statusMeta,
} from '../modules/topology/presentation';
import {
  getTopologyGraph,
  type TopologyGraph,
  type TopologyResource,
} from '../services/cluster';
import { useAppStore } from '../stores/appStore';

import '@xyflow/react/dist/base.css';

type SourceType = TopologyResource['source'];
type SourceFocusMode = 'all' | SourceType;
type FocusContext = {
  focusedIDs: Set<string>;
  relatedIDs: Set<string>;
};
type CanvasMotionPreset = 'none' | 'boot';

const canvasMotionDurationMs: Record<Exclude<CanvasMotionPreset, 'none'>, number> = {
  boot: 680,
};

const sourceFilterOptions: Array<{ label: string; value: SourceFocusMode }> = [
  { label: '全部', value: 'all' },
  { label: '工作负载', value: 'workloads' },
  { label: '网络', value: 'network' },
  { label: '存储', value: 'storage' },
];

const allGroupOptions: Array<{ label: string; value: GroupByMode }> = [
  { label: '命名空间', value: 'namespace' },
  { label: '实例', value: 'instance' },
  { label: '节点', value: 'node' },
];

const defaultSources: SourceType[] = ['workloads', 'network', 'storage'];

const nodeTypes = {
  topologyObject: TopologyObjectNode,
  topologyGroup: TopologyGroupNode,
};

const edgeTypes = {
  topologyEdge: TopologyEdge,
};

function isClusterWideNamespace(namespace: string) {
  const value = namespace.trim().toLowerCase();
  return value === '' || value === 'all' || value === 'all-namespaces';
}

function createFocusContext(
  graph: TopologyGraph,
  sourceFocus: SourceFocusMode,
): FocusContext | null {
  if (sourceFocus === 'all') {
    return null;
  }

  const focusedIDs = new Set(
    graph.resources
      .filter((resource) => resource.source === sourceFocus)
      .map((resource) => resource.id),
  );
  const relatedIDs = new Set(focusedIDs);

  graph.relations.forEach((relation) => {
    if (focusedIDs.has(relation.source) || focusedIDs.has(relation.target)) {
      relatedIDs.add(relation.source);
      relatedIDs.add(relation.target);
    }
  });

  return {
    focusedIDs,
    relatedIDs,
  };
}

function resolveNodeViewState(
  node: TopologyGraphNode,
  focusContext: FocusContext | null,
): TopologyViewState {
  if (!focusContext) {
    return 'default';
  }

  const leafIDs = collectLeafNodes(node)
    .map((item) => item.resource?.id)
    .filter((id): id is string => Boolean(id));

  if (leafIDs.some((id) => focusContext.focusedIDs.has(id))) {
    return 'focused';
  }

  if (leafIDs.some((id) => focusContext.relatedIDs.has(id))) {
    return 'context';
  }

  return 'muted';
}

function resolveEdgeViewState(
  edge: Edge,
  leafIDsByNodeID: Map<string, string[]>,
  focusContext: FocusContext | null,
): TopologyViewState {
  if (!focusContext) {
    return 'default';
  }

  const sourceLeafIDs = leafIDsByNodeID.get(edge.source) ?? [edge.source];
  const targetLeafIDs = leafIDsByNodeID.get(edge.target) ?? [edge.target];
  const sourceHasFocus = sourceLeafIDs.some((id) => focusContext.focusedIDs.has(id));
  const targetHasFocus = targetLeafIDs.some((id) => focusContext.focusedIDs.has(id));
  const sourceHasContext = sourceLeafIDs.some((id) => focusContext.relatedIDs.has(id));
  const targetHasContext = targetLeafIDs.some((id) => focusContext.relatedIDs.has(id));

  if (sourceHasFocus || targetHasFocus) {
    return 'focused';
  }

  if (sourceHasContext || targetHasContext) {
    return 'context';
  }

  return 'muted';
}

function issueFilteredGraph(graph: TopologyGraph, onlyIssues: boolean): TopologyGraph {
  if (!onlyIssues) {
    return graph;
  }

  const issueIDs = new Set(
    graph.resources
      .filter((resource) => resource.status === 'warning' || resource.status === 'error')
      .map((resource) => resource.id),
  );

  if (issueIDs.size === 0) {
    return {
      resources: [],
      relations: [],
    };
  }

  const relatedIDs = new Set(issueIDs);
  graph.relations.forEach((relation) => {
    if (issueIDs.has(relation.source) || issueIDs.has(relation.target)) {
      relatedIDs.add(relation.source);
      relatedIDs.add(relation.target);
    }
  });

  return {
    resources: graph.resources.filter((resource) => relatedIDs.has(resource.id)),
    relations: graph.relations.filter(
      (relation) => relatedIDs.has(relation.source) && relatedIDs.has(relation.target),
    ),
  };
}

function connectedGraph(graph: TopologyGraph): TopologyGraph {
  if (graph.relations.length === 0) {
    return graph;
  }

  const connectedIDs = new Set<string>();
  graph.relations.forEach((relation) => {
    connectedIDs.add(relation.source);
    connectedIDs.add(relation.target);
  });

  return {
    resources: graph.resources.filter((resource) => connectedIDs.has(resource.id)),
    relations: graph.relations.filter(
      (relation) => connectedIDs.has(relation.source) && connectedIDs.has(relation.target),
    ),
  };
}

function getCanvasMotionClass(motionPreset: CanvasMotionPreset) {
  switch (motionPreset) {
    case 'boot':
      return 'topology-canvas-motion topology-canvas-motion--boot';
    default:
      return '';
  }
}

function getOverlayMotionClass(motionPreset: Exclude<CanvasMotionPreset, 'none'> | null) {
  switch (motionPreset) {
    case 'boot':
      return 'topology-overlay-motion topology-overlay-motion--boot';
    default:
      return '';
  }
}

function DetailsPanel({
  resource,
  graph,
}: {
  resource?: TopologyResource;
  graph: TopologyGraph;
}) {
  if (!resource) {
    return null;
  }

  const related = graph.relations.filter(
    (relation) => relation.source === resource.id || relation.target === resource.id,
  );
  const status = statusMeta(resource.status);
  const source = sourceMeta(resource.source);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={status.tagColor}>{status.label}</Tag>
        <Tag color="blue">{resource.kind}</Tag>
        <Tag>{resource.namespace}</Tag>
        {resource.instanceName ? <Tag color="purple-inverse">{resource.instanceName}</Tag> : null}
        {resource.warnings > 0 ? <Tag color="orange">{resource.warnings} warnings</Tag> : null}
      </div>

      <div>
        <Typography.Title level={4} className="!mb-1">
          {resource.name}
        </Typography.Title>
        <Typography.Paragraph className="!mb-0 text-sm text-slate-500">
          {resource.summary}
        </Typography.Paragraph>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Domain
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-sm font-medium text-slate-900">
            {source.icon}
            {source.label}
          </div>
        </div>
        <div className="rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">
            Node
          </div>
          <div className="mt-1.5 text-sm font-medium text-slate-900">
            {resource.nodeName ?? 'Namespace scoped'}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {resource.detailLines.map((line) => (
          <div
            key={line}
            className="rounded-[14px] border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
          >
            {line}
          </div>
        ))}
      </div>

      <section>
        <Typography.Title level={5} className="!mb-3">
          关联关系
        </Typography.Title>
        <div className="space-y-2">
          {related.length > 0 ? (
            related.map((relation) => {
              const targetID = relation.source === resource.id ? relation.target : relation.source;
              const target = graph.resources.find((item) => item.id === targetID);

              return (
                <div
                  key={relation.id}
                  className="rounded-[14px] border border-slate-200 bg-white px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-slate-400">
                    <LinkOutlined />
                    {relation.label}
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {target ? `${target.kind} / ${target.name}` : relation.label}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-3 py-5 text-sm text-slate-500">
              当前资源没有可展示的关联关系
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function FloatingPanel({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[18px] border border-slate-200 bg-white/96 p-2 shadow-[0_10px_28px_rgba(15,23,42,0.10)] backdrop-blur">
      {children}
    </div>
  );
}

function TopologyWorkspace() {
  const namespace = useAppStore((state) => state.namespace);
  const sessionMode = useAppStore((state) => state.sessionMode);
  const reactFlow = useReactFlow<Node<TopologyFlowNodeData>, Edge>();
  const viewport = useTopologyGraphViewport();
  const viewportMovedRef = useRef(false);
  const layoutRequestRef = useRef(0);
  const initialViewportSettledRef = useRef(false);
  const motionFrameRef = useRef<number | null>(null);
  const motionTimeoutRef = useRef<number | null>(null);

  const [sourceFocus, setSourceFocus] = useState<SourceFocusMode>('all');
  const [groupMode, setGroupMode] = useState<GroupByMode>('instance');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [expandAll, setExpandAll] = useState(false);
  const [focusedID, setFocusedID] = useState<string>();
  const [detailResourceID, setDetailResourceID] = useState<string>();
  const [canvasReady, setCanvasReady] = useState(false);
  const [canvasMotionPreset, setCanvasMotionPreset] = useState<CanvasMotionPreset>('none');
  const [overlayMotionPreset, setOverlayMotionPreset] = useState<
    Exclude<CanvasMotionPreset, 'none'> | null
  >(null);
  const [layoutedGraph, setLayoutedGraph] = useState<{
    nodes: Node<TopologyFlowNodeData>[];
    edges: Edge[];
  }>({
    nodes: [],
    edges: [],
  });
  const topologyQuery = useQuery({
    queryKey: ['topology-graph', namespace, sessionMode],
    queryFn: () => getTopologyGraph(namespace, defaultSources),
    enabled: sessionMode === 'token',
  });

  const clearCanvasMotion = () => {
    if (motionFrameRef.current) {
      window.cancelAnimationFrame(motionFrameRef.current);
      motionFrameRef.current = null;
    }

    if (motionTimeoutRef.current) {
      window.clearTimeout(motionTimeoutRef.current);
      motionTimeoutRef.current = null;
    }
  };

  const triggerCanvasMotion = (preset: Exclude<CanvasMotionPreset, 'none'>) => {
    clearCanvasMotion();
    setCanvasMotionPreset('none');
    setOverlayMotionPreset(null);

    motionFrameRef.current = window.requestAnimationFrame(() => {
      setCanvasMotionPreset(preset);
      setOverlayMotionPreset(preset);
      motionTimeoutRef.current = window.setTimeout(() => {
        setCanvasMotionPreset('none');
        setOverlayMotionPreset(null);
        motionTimeoutRef.current = null;
      }, canvasMotionDurationMs[preset]);
      motionFrameRef.current = null;
    });
  };

  const graph = useMemo<TopologyGraph>(() => {
    if (!topologyQuery.data) {
      return {
        resources: [],
        relations: [],
      };
    }

    return connectedGraph(
      issueFilteredGraph(
        {
          resources: topologyQuery.data.resources ?? [],
          relations: topologyQuery.data.relations ?? [],
        },
        onlyIssues,
      ),
    );
  }, [onlyIssues, topologyQuery.data]);

  const clusterWideNamespace = useMemo(
    () => isClusterWideNamespace(namespace),
    [namespace],
  );

  const availableGroupOptions = useMemo(
    () =>
      clusterWideNamespace
        ? allGroupOptions
        : allGroupOptions.filter((option) => option.value !== 'namespace'),
    [clusterWideNamespace],
  );

  const graphSourceCounts = useMemo(
    () =>
      graph.resources.reduce<Record<SourceType, number>>(
        (counts, resource) => ({
          ...counts,
          [resource.source]: counts[resource.source] + 1,
        }),
        {
          workloads: 0,
          network: 0,
          storage: 0,
        },
      ),
    [graph.resources],
  );
  const focusContext = useMemo(
    () => createFocusContext(graph, sourceFocus),
    [graph, sourceFocus],
  );

  const groupedGraph = useMemo(() => {
    const elements = makeTopologyElements(graph.resources, graph.relations);
    return groupGraph(elements.nodes, elements.edges, { groupBy: groupMode });
  }, [graph.relations, graph.resources, groupMode]);

  const visibleGraph = useMemo(
    () => collapseGraph(groupedGraph, { selectedNodeID: focusedID, expandAll }),
    [expandAll, focusedID, groupedGraph],
  );

  const focusedGroup = useMemo(
    () => (focusedID ? findGroupContaining(groupedGraph, focusedID) : undefined),
    [focusedID, groupedGraph],
  );

  useEffect(() => {
    if (focusedID && !graphContainsNode(groupedGraph, focusedID)) {
      setFocusedID(undefined);
    }
  }, [focusedID, groupedGraph]);

  useEffect(() => {
    if (detailResourceID && !graph.resources.some((resource) => resource.id === detailResourceID)) {
      setDetailResourceID(undefined);
    }
  }, [detailResourceID, graph.resources]);

  useEffect(() => {
    if (!clusterWideNamespace && groupMode === 'namespace') {
      setGroupMode('instance');
    }
  }, [clusterWideNamespace, groupMode]);

  useEffect(() => {
    if (topologyQuery.isLoading) {
      clearCanvasMotion();
      setCanvasReady(false);
      setCanvasMotionPreset('none');
      setOverlayMotionPreset(null);
    }
  }, [topologyQuery.isLoading]);

  useEffect(
    () => () => {
      clearCanvasMotion();
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const requestId = layoutRequestRef.current + 1;
    layoutRequestRef.current = requestId;
    const isInitialReveal = !initialViewportSettledRef.current;

    if (isInitialReveal) {
      setCanvasReady(false);
    }

    void applyGraphLayout(visibleGraph, viewport.aspectRatio).then(async (nextGraph) => {
      if (!active) {
        return;
      }

      if (!viewportMovedRef.current) {
        await viewport.updateViewport({
          nodes: nextGraph.nodes,
          mode: 'fit',
          animate: false,
        });
      }

      if (!active || requestId !== layoutRequestRef.current) {
        return;
      }

      setLayoutedGraph(nextGraph);
      initialViewportSettledRef.current = true;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!active || requestId !== layoutRequestRef.current) {
            return;
          }

          setCanvasReady(true);
          if (isInitialReveal) {
            triggerCanvasMotion('boot');
          }
        });
      });
    });

    return () => {
      active = false;
    };
  }, [viewport, visibleGraph]);

  useEffect(() => {
    viewportMovedRef.current = false;
    viewport.setZoomMode('fit');
  }, [expandAll, focusedID, groupMode, namespace, onlyIssues]);

  useEffect(() => {
    const graphSize = getGraphSize(visibleGraph);
    if (expandAll && graphSize > 50) {
      setExpandAll(false);
    }
  }, [expandAll, visibleGraph]);

  const selectedResource = graph.resources.find((resource) => resource.id === detailResourceID);
  const selectedGroupMainNode =
    focusedGroup && focusedGroup.id !== 'root' ? getDisplayResource(focusedGroup) : undefined;
  const issueCount = graph.resources.filter(
    (resource) => resource.status === 'warning' || resource.status === 'error',
  ).length;
  const leafIDsByVisibleNodeID = useMemo(() => {
    const map = new Map<string, string[]>();

    forEachNode(visibleGraph, (node) => {
      map.set(
        node.id,
        collectLeafNodes(node)
          .map((item) => item.resource?.id)
          .filter((id): id is string => Boolean(id)),
      );
    });

    return map;
  }, [visibleGraph]);
  const renderedNodes = useMemo(
    () =>
      layoutedGraph.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          viewState: resolveNodeViewState(node.data.graphNode, focusContext),
        },
        selected: detailResourceID ? node.id === detailResourceID : node.id === focusedID,
      })),
    [detailResourceID, focusContext, focusedID, layoutedGraph.nodes],
  );
  const renderedEdges = useMemo(
    () =>
      layoutedGraph.edges.map((edge) => ({
        ...edge,
        data: {
          ...(edge.data as TopologyFlowEdgeData | undefined),
          viewState: resolveEdgeViewState(edge, leafIDsByVisibleNodeID, focusContext),
        },
      })),
    [focusContext, leafIDsByVisibleNodeID, layoutedGraph.edges],
  );
  const zoomTo = (mode: ZoomMode) => {
    viewportMovedRef.current = false;
    viewport.updateViewport({ mode, animate: true });
  };
  const exitFocus = () => {
    setFocusedID(undefined);
    setDetailResourceID(undefined);
  };
  const handleNodeClick = (_event: unknown, node: Node<TopologyFlowNodeData>) => {
    const graphNode = node.data.graphNode;

    if (graphNode.nodes?.length) {
      if (graphNode.id !== 'root') {
        setFocusedID(graphNode.id);
      }
      setDetailResourceID(undefined);
      return;
    }

    setDetailResourceID(node.id);
  };
  const viewSettingsContent = (
    <div className="w-[280px] space-y-4">
      <div className="space-y-2">
        <div className="text-[12px] font-medium text-slate-500">当前视角</div>
        <div className="rounded-[12px] border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-700">
          {sourceFocus === 'all' ? '全部资源' : sourceMeta(sourceFocus).label}
        </div>
        <div className="rounded-[12px] bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          当前图谱：
          {' '}
          {defaultSources
            .map((source) => `${sourceMeta(source).label} ${graphSourceCounts[source]}`)
            .join(' · ')}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-[12px] font-medium text-slate-500">分组方式</div>
        <Segmented
          block
          size="small"
          options={availableGroupOptions}
          value={groupMode}
          onChange={(value) => setGroupMode(value as GroupByMode)}
        />
      </div>

      <div className="flex items-center justify-between gap-3 rounded-[14px] bg-slate-50 px-3 py-2">
        <div>
          <div className="text-[12px] font-medium text-slate-700">展开全部</div>
          <div className="text-[11px] text-slate-500">关闭折叠分组，查看完整画布</div>
        </div>
        <Switch size="small" checked={expandAll} onChange={setExpandAll} />
      </div>

      <div className="rounded-[14px] border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
        {graph.resources.length} 个资源 · {graph.relations.length} 条关系 · {issueCount} 个异常
      </div>
    </div>
  );

  if (sessionMode !== 'token') {
    return (
      <section className="space-y-4">
        <Alert
          type="warning"
          showIcon
          message="资源全景图仅支持真实集群数据。请先使用 ServiceAccount Token 接入集群。"
        />
        <section className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前为演示模式，不展示拓扑测试数据"
          />
        </section>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {topologyQuery.error ? (
        <Alert
          type="error"
          showIcon
          message="资源全景图加载失败"
          description={
            topologyQuery.error instanceof Error
              ? topologyQuery.error.message
              : '请检查集群连通性和 Token 权限'
          }
        />
      ) : null}

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_14px_40px_rgba(15,23,42,0.06)]">
        <div className="relative h-[calc(100vh-164px)] min-h-[700px]">
        <div className="absolute left-4 top-4 z-10 space-y-2">
          <FloatingPanel>
            <div className="flex items-center gap-2">
              <Segmented
                size="small"
                options={sourceFilterOptions}
                value={sourceFocus}
                onChange={(value) => setSourceFocus(value as SourceFocusMode)}
              />
              <Button
                size="small"
                type={onlyIssues ? 'primary' : 'default'}
                onClick={() => setOnlyIssues((current) => !current)}
              >
                仅异常
              </Button>
              <Popover trigger="click" placement="bottomLeft" content={viewSettingsContent}>
                <Button size="small" icon={<SettingOutlined />} />
              </Popover>
            </div>
          </FloatingPanel>
            {focusedGroup && focusedGroup.id !== 'root' ? (
              <FloatingPanel>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="small" icon={<ShrinkOutlined />} onClick={exitFocus}>
                    返回全局
                  </Button>
                  <div className="min-w-0 text-sm text-slate-500">
                    <span className="mr-1">当前聚焦：</span>
                    <span className="font-medium text-slate-900">
                      {selectedGroupMainNode
                        ? `${selectedGroupMainNode.kind} / ${selectedGroupMainNode.name}`
                        : focusedGroup.label ?? focusedGroup.id}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    {getNodeIssueCount(focusedGroup)} warnings
                  </span>
                </div>
              </FloatingPanel>
            ) : null}
          </div>
          <div className="absolute right-4 top-4 z-10">
            <FloatingPanel>
              <Space.Compact size="small">
                <Button
                  size="small"
                  icon={<ZoomOutOutlined />}
                  onClick={() => {
                    viewport.setZoomMode('100%');
                    void reactFlow.zoomOut({ duration: 180 });
                  }}
                />
                <Button
                  size="small"
                  icon={<ZoomInOutlined />}
                  onClick={() => {
                    viewport.setZoomMode('100%');
                    void reactFlow.zoomIn({ duration: 180 });
                  }}
                />
                <Button
                  size="small"
                  type={viewport.zoomMode === 'fit' ? 'primary' : 'default'}
                  icon={<AimOutlined />}
                  onClick={() => zoomTo('fit')}
                >
                  适配视图
                </Button>
              </Space.Compact>
            </FloatingPanel>
          </div>

          {topologyQuery.isLoading ? (
            <div className="p-5 pt-20">
              <Skeleton active paragraph={{ rows: 12 }} />
            </div>
          ) : graph.resources.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  onlyIssues
                    ? '当前命名空间没有异常资源链路'
                    : '当前筛选条件下没有可展示的资源关系'
                }
              />
            </div>
          ) : (
            <>
              <div
                className={[
                  'h-full origin-center',
                  canvasReady ? 'opacity-100' : 'pointer-events-none opacity-0',
                  getCanvasMotionClass(canvasMotionPreset),
                ].join(' ')}
              >
                <ReactFlow<Node<TopologyFlowNodeData>, Edge>
                  nodes={renderedNodes}
                  edges={renderedEdges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  elementsSelectable={false}
                  minZoom={minZoom}
                  maxZoom={maxZoom}
                  zoomOnDoubleClick={false}
                  onMoveStart={() => {
                    viewportMovedRef.current = true;
                  }}
                  onNodeClick={handleNodeClick}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#d8e0e7" gap={18} size={1} />
                </ReactFlow>
              </div>

              {!canvasReady ? (
                <div
                  className={[
                    'pointer-events-none absolute inset-0',
                    initialViewportSettledRef.current
                      ? 'bg-white/30 backdrop-blur-[4px]'
                      : 'flex items-center justify-center bg-white/92 opacity-100',
                  ].join(' ')}
                >
                  {!initialViewportSettledRef.current ? (
                    <div className="w-[220px]">
                      <Skeleton active title={false} paragraph={{ rows: 5 }} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              {canvasReady && overlayMotionPreset ? (
                <div className={['pointer-events-none absolute inset-0', getOverlayMotionClass(overlayMotionPreset)].join(' ')}>
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_34%,rgba(255,255,255,0.92),rgba(255,255,255,0.42)_42%,rgba(255,255,255,0.12)_68%,transparent_84%)]" />
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>

      <Drawer
        title={selectedResource ? `${selectedResource.kind} / ${selectedResource.name}` : '资源详情'}
        placement="right"
        width={380}
        open={Boolean(selectedResource)}
        onClose={() => setDetailResourceID(undefined)}
      >
        <DetailsPanel resource={selectedResource} graph={graph} />
      </Drawer>
    </section>
  );
}

export function TopologyPage() {
  return (
    <ReactFlowProvider>
      <TopologyWorkspace />
    </ReactFlowProvider>
  );
}
