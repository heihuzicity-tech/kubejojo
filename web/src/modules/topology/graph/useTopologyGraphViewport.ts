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
    }: {
      nodes?: Node[];
      mode?: ZoomMode;
    }) => {
      if (!nodes.length || reactFlowWidth <= 0 || reactFlowHeight <= 0) {
        return;
      }

      if (mode !== zoomMode) {
        setZoomMode(mode);
      }

      if (mode === 'fit') {
        void reactFlow.fitView({
          nodes,
          minZoom,
          maxZoom: fitMaxZoom,
          duration: 220,
          padding: {
            top: `${viewportPaddingPx}px`,
            right: `${viewportPaddingPx}px`,
            bottom: `${viewportPaddingPx}px`,
            left: `${viewportPaddingPx}px`,
          },
        });
        return;
      }

      const bounds = reactFlow.getNodesBounds(nodes);
      const topLeftOrigin = { x: viewportPaddingPx, y: viewportPaddingPx };
      const centerOrigin = {
        x: reactFlowWidth / 2 - bounds.width / 2,
        y: reactFlowHeight / 2 - bounds.height / 2,
      };
      const xFits = bounds.width + viewportPaddingPx * 2 <= reactFlowWidth;
      const yFits = bounds.height + viewportPaddingPx * 2 <= reactFlowHeight;

      reactFlow.setViewport(
        {
          x: xFits ? centerOrigin.x : topLeftOrigin.x,
          y: yFits ? centerOrigin.y : topLeftOrigin.y,
          zoom: 1,
        },
        { duration: 220 },
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
