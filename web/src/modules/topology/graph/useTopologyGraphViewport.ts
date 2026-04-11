/*
 * Adapted from Headlamp resource map internals.
 * Copyright 2025 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

import { type Node, useReactFlow, useStore } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';

import { fitMaxZoom, maxZoom, minZoom, viewportPaddingPx } from './graphConstants';

export type ZoomMode = '100%' | 'fit';

function getTopLevelBounds(nodes: Node[]) {
  const topLevelNodes = nodes.filter((node) => !node.parentId);

  if (!topLevelNodes.length) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  topLevelNodes.forEach((node) => {
    const width = node.width ?? 0;
    const height = node.height ?? 0;
    const x = node.position.x;
    const y = node.position.y;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  });

  return {
    x: minX,
    y: minY,
    width: Math.max(maxX - minX, 1),
    height: Math.max(maxY - minY, 1),
  };
}

export function useTopologyGraphViewport(defaultMode: ZoomMode = 'fit') {
  const [zoomMode, setZoomMode] = useState<ZoomMode>(defaultMode);
  const reactFlowWidth = useStore((state) => state.width);
  const reactFlowHeight = useStore((state) => state.height);
  const aspectRatio = useStore((state) =>
    state.height > 0 ? state.width / state.height : 1.6,
  );
  const reactFlow = useReactFlow();

  const updateViewport = useCallback(
    ({
      nodes = reactFlow.getNodes(),
      mode = zoomMode,
      animate = false,
    }: {
      nodes?: Node[];
      mode?: ZoomMode;
      animate?: boolean;
    }) => {
      if (!nodes.length || reactFlowWidth <= 0 || reactFlowHeight <= 0) {
        return Promise.resolve(false);
      }

      const bounds = getTopLevelBounds(nodes);
      if (!bounds) {
        return Promise.resolve(false);
      }

      if (mode !== zoomMode) {
        setZoomMode(mode);
      }

      if (mode === 'fit') {
        const paddedWidth = Math.max(reactFlowWidth - viewportPaddingPx * 2, 1);
        const paddedHeight = Math.max(reactFlowHeight - viewportPaddingPx * 2, 1);
        const zoom = Math.min(
          fitMaxZoom,
          maxZoom,
          Math.max(
            minZoom,
            Math.min(
              paddedWidth / bounds.width,
              paddedHeight / bounds.height,
            ),
          ),
        );
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;

        return reactFlow.setViewport(
          {
            x: reactFlowWidth / 2 - centerX * zoom,
            y: reactFlowHeight / 2 - centerY * zoom,
            zoom,
          },
          { duration: animate ? 220 : 0 },
        );
      }
      const topLeftOrigin = { x: viewportPaddingPx, y: viewportPaddingPx };
      const centerOrigin = {
        x: reactFlowWidth / 2 - bounds.width / 2,
        y: reactFlowHeight / 2 - bounds.height / 2,
      };
      const xFits = bounds.width + viewportPaddingPx * 2 <= reactFlowWidth;
      const yFits = bounds.height + viewportPaddingPx * 2 <= reactFlowHeight;

      return reactFlow.setViewport(
        {
          x: xFits ? centerOrigin.x : topLeftOrigin.x,
          y: yFits ? centerOrigin.y : topLeftOrigin.y,
          zoom: 1,
        },
        { duration: animate ? 220 : 0 },
      );
    },
    [reactFlow, reactFlowHeight, reactFlowWidth, zoomMode],
  );

  return useMemo(
    () => ({
      zoomMode,
      setZoomMode,
      updateViewport,
      aspectRatio,
    }),
    [aspectRatio, updateViewport, zoomMode],
  );
}
