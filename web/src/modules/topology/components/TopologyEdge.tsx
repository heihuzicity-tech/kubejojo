import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

import type { TopologyFlowEdgeData, TopologyViewState } from '../graph/graphLayout';

type EdgeSection = NonNullable<TopologyFlowEdgeData['sections']>[number];

function buildPath(section: EdgeSection, offsetX: number, offsetY: number) {
  const bendPoints = section.bendPoints ?? [];

  if (bendPoints.length >= 2) {
    return `M ${section.startPoint.x + offsetX},${section.startPoint.y + offsetY} C ${
      bendPoints[0].x + offsetX
    },${bendPoints[0].y + offsetY} ${bendPoints[1].x + offsetX},${
      bendPoints[1].y + offsetY
    } ${section.endPoint.x + offsetX},${section.endPoint.y + offsetY}`;
  }

  return `M ${section.startPoint.x + offsetX},${section.startPoint.y + offsetY} L ${
    section.endPoint.x + offsetX
  },${section.endPoint.y + offsetY}`;
}

function edgeStyle(viewState: TopologyViewState | undefined) {
  switch (viewState) {
    case 'focused':
      return {
        stroke: '#475569',
        strokeWidth: 1.8,
        opacity: 0.96,
      };
    case 'context':
      return {
        stroke: '#94a3b8',
        strokeWidth: 1.45,
        opacity: 0.6,
      };
    case 'muted':
      return {
        stroke: '#cbd5e1',
        strokeWidth: 1.1,
        opacity: 0.16,
      };
    default:
      return {
        stroke: '#94a3b8',
        strokeWidth: 1.35,
        opacity: 0.9,
      };
  }
}

export const TopologyEdge = memo((props: EdgeProps) => {
  const data = props.data as TopologyFlowEdgeData | undefined;
  const section = data?.sections?.[0];

  if (!section) {
    return null;
  }

  const offsetX = data?.parentOffset?.x ?? 0;
  const offsetY = data?.parentOffset?.y ?? 0;
  const style = edgeStyle(data?.viewState);

  return (
    <BaseEdge
      id={props.id}
      path={buildPath(section, offsetX, offsetY)}
      markerEnd={props.markerEnd}
      style={{
        stroke: style.stroke,
        strokeWidth: style.strokeWidth,
        opacity: style.opacity,
        transition: 'stroke 180ms ease, stroke-width 180ms ease, opacity 180ms ease',
      }}
    />
  );
});
