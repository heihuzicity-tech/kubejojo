import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { memo } from 'react';

import { collectLeafNodes } from '../graph/graphModel';
import type { TopologyFlowNodeData } from '../graph/graphLayout';
import {
  getDisplayResource,
  getGroupPreviewText,
  getNodeAggregateStatus,
  getNodeIssueCount,
  kindCode,
  sourceMeta,
  statusMeta,
} from '../presentation';

function hiddenHandle(position: Position) {
  return (
    <Handle
      type={position === Position.Top ? 'target' : 'source'}
      position={position}
      style={{ opacity: 0, width: 8, height: 8, border: 0, background: 'transparent' }}
    />
  );
}

export const TopologyObjectNode = memo(
  ({ data, selected }: NodeProps<Node<TopologyFlowNodeData>>) => {
    const graphNode = data.graphNode;
    const displayResource = getDisplayResource(graphNode);
    const aggregateStatus = statusMeta(getNodeAggregateStatus(graphNode));
    const issueCount = getNodeIssueCount(graphNode);
    const resourceCount = graphNode.nodes ? collectLeafNodes(graphNode).length : 1;
    const previewMode = Boolean(graphNode.nodes?.length);
    const source = displayResource ? sourceMeta(displayResource.source) : null;
    const summary = previewMode
      ? getGroupPreviewText(graphNode)
      : displayResource?.summary ?? graphNode.subtitle ?? '暂无摘要';
    const title = graphNode.label ?? displayResource?.name ?? '未知资源';
    const secondaryText = previewMode
      ? `${resourceCount} 个资源`
      : displayResource?.kind ?? graphNode.subtitle ?? 'Resource';

    return (
      <div className="relative h-[96px] w-[228px]">
        {previewMode ? (
          <>
            <div className="absolute inset-x-0 top-[10px] h-[96px] translate-x-[10px] rounded-[20px] border border-slate-200 bg-white/65 shadow-[0_8px_18px_rgba(15,23,42,0.04)]" />
            <div className="absolute inset-x-0 top-[5px] h-[96px] translate-x-[5px] rounded-[20px] border border-slate-200 bg-white/80 shadow-[0_8px_18px_rgba(15,23,42,0.05)]" />
          </>
        ) : null}

        <div
          className={[
            'relative z-10 flex h-[96px] w-[228px] items-start gap-3 rounded-[20px] border bg-white px-3.5 py-3 shadow-[0_10px_22px_rgba(15,23,42,0.08)] transition-[border-color,box-shadow] duration-200',
            selected
              ? 'border-teal-500 shadow-[0_12px_26px_rgba(13,148,136,0.16)]'
              : `${aggregateStatus.borderClass} ring-1 ${aggregateStatus.ringClass}`,
          ].join(' ')}
        >
          {hiddenHandle(Position.Top)}
          {hiddenHandle(Position.Bottom)}

          <div
            className={[
              'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border text-[12px] font-semibold tracking-[0.08em]',
              aggregateStatus.surfaceClass,
              aggregateStatus.borderClass,
              'text-slate-700',
            ].join(' ')}
          >
            {kindCode(displayResource?.kind ?? graphNode.label ?? 'GR')}
            {previewMode ? (
              <span className="absolute -right-2 -top-2 inline-flex min-w-6 items-center justify-center rounded-full border border-slate-200 bg-white px-1.5 text-[10px] font-semibold text-slate-600">
                {resourceCount}
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold text-slate-950">{title}</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-slate-500">
                  {secondaryText}
                </div>
              </div>
              <span className={['mt-1 h-2.5 w-2.5 rounded-full', aggregateStatus.dotClass].join(' ')} />
            </div>

            <div className="mt-2 truncate text-[12px] text-slate-500">{summary}</div>

            <div className="mt-2 flex items-center gap-2">
              {source ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {source.icon}
                  {source.label}
                </span>
              ) : null}
              {issueCount > 0 ? (
                <span className="inline-flex h-5 items-center rounded-full bg-amber-50 px-2 text-[10px] font-semibold text-amber-700">
                  {issueCount} warnings
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  },
);

export const TopologyGroupNode = memo(
  ({ data, selected }: NodeProps<Node<TopologyFlowNodeData>>) => {
    const graphNode = data.graphNode;
    const displayResource = getDisplayResource(graphNode);
    const aggregateStatus = statusMeta(getNodeAggregateStatus(graphNode));
    const resourceCount = collectLeafNodes(graphNode).length;

    return (
      <div
        className={[
          'h-full w-full rounded-[26px] border bg-slate-50/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]',
          selected ? 'border-teal-400' : 'border-slate-200',
        ].join(' ')}
      >
        {hiddenHandle(Position.Top)}
        {hiddenHandle(Position.Bottom)}

        <div className="absolute left-4 top-4 flex max-w-[calc(100%-32px)] items-center gap-2 rounded-full border border-slate-200 bg-white/92 px-3 py-1.5 text-xs shadow-sm backdrop-blur">
          <span className={['h-2 w-2 rounded-full', aggregateStatus.dotClass].join(' ')} />
          <span className="text-slate-500">{graphNode.subtitle ?? 'Group'}</span>
          <span className="truncate font-medium text-slate-900">
            {graphNode.label ?? displayResource?.name ?? 'Untitled'}
          </span>
          <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">
            {resourceCount}
          </span>
        </div>
      </div>
    );
  },
);
