import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { memo } from 'react';

type EdgeSectionPoint = {
  x: number;
  y: number;
};

type EdgeSection = {
  startPoint: EdgeSectionPoint;
  endPoint: EdgeSectionPoint;
  bendPoints?: EdgeSectionPoint[];
};

type TopologyEdgeData = {
  sections?: EdgeSection[];
  parentOffset?: {
    x: number;
    y: number;
  };
};

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

export const TopologyEdge = memo((props: EdgeProps) => {
  const data = props.data as TopologyEdgeData | undefined;
  const section = data?.sections?.[0];

  if (!section) {
    return null;
  }

  const offsetX = data?.parentOffset?.x ?? 0;
  const offsetY = data?.parentOffset?.y ?? 0;

  return (
    <BaseEdge
      id={props.id}
      path={buildPath(section, offsetX, offsetY)}
      markerEnd={props.markerEnd}
      style={{
        stroke: '#94a3b8',
        strokeWidth: 1.35,
      }}
    />
  );
});
