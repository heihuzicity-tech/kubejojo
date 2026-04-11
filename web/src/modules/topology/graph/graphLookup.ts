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

import type { TopologyGraphEdge, TopologyGraphNode } from './graphModel';

export interface GraphLookup<N, E> {
  getOutgoingEdges(nodeID: string): E[] | undefined;
  getIncomingEdges(nodeID: string): E[] | undefined;
  getNode(nodeID: string): N | undefined;
}

export function makeGraphLookup<N extends TopologyGraphNode, E extends TopologyGraphEdge>(
  nodes: N[],
  edges: E[],
): GraphLookup<N, E> {
  const nodeMap = new Map<string, N>();
  const outgoingEdges = new Map<string, E[]>();
  const incomingEdges = new Map<string, E[]>();

  nodes.forEach((node) => {
    nodeMap.set(node.id, node);
  });

  edges.forEach((edge) => {
    outgoingEdges.set(edge.source, [...(outgoingEdges.get(edge.source) ?? []), edge]);
    incomingEdges.set(edge.target, [...(incomingEdges.get(edge.target) ?? []), edge]);
  });

  return {
    getOutgoingEdges(nodeID) {
      return outgoingEdges.get(nodeID);
    },
    getIncomingEdges(nodeID) {
      return incomingEdges.get(nodeID);
    },
    getNode(nodeID) {
      return nodeMap.get(nodeID);
    },
  };
}
