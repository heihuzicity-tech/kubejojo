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

import type { Edge, EdgeMarker, Node } from '@xyflow/react';
import ELK, { type ElkExtendedEdge, type ElkNode } from 'elkjs/lib/elk.bundled.js';

import { forEachNode, getNodeWeight, type TopologyGraphEdge, type TopologyGraphNode } from './graphModel';

export type TopologyFlowNodeData = {
  graphNode: TopologyGraphNode;
};

type ElkNodeWithData = ElkNode & {
  type: string;
  data: TopologyFlowNodeData;
  edges?: ElkEdgeWithData[];
  children?: ElkNodeWithData[];
};

type ElkEdgeWithData = ElkExtendedEdge & {
  type?: string;
  data?: TopologyGraphEdge;
};

const elk = new ELK();

const layoutOptions = {
  nodeWidth: 228,
  nodeHeight: 96,
  groupWidth: 284,
  groupHeight: 156,
};

function getPartitionLayer(node: TopologyGraphNode) {
  return -getNodeWeight(node);
}

function convertToElkNode(node: TopologyGraphNode, aspectRatio: number): ElkNodeWithData {
  const convertedEdges = node.edges
    ? (() => {
        if (node.edges.length === 0) {
          return [];
        }

        const nodeIDs = new Set<string>();
        forEachNode(node, (currentNode) => {
          nodeIDs.add(currentNode.id);
        });

        return node.edges
          .filter((edge) => nodeIDs.has(edge.source) && nodeIDs.has(edge.target))
          .map(
            (edge) =>
              ({
                id: edge.id,
                type: 'topologyEdge',
                sources: [edge.source],
                targets: [edge.target],
                labels:
                  typeof edge.label === 'string'
                    ? [{ text: edge.label, width: 60, height: 18 }]
                    : undefined,
                data: edge,
              }) as ElkEdgeWithData,
          );
      })()
    : [];

  const elkNode: ElkNodeWithData = {
    id: node.id,
    type: node.nodes?.length && !node.collapsed ? 'topologyGroup' : 'topologyObject',
    data: {
      graphNode: node,
    },
  };

  if (node.nodes?.length) {
    if (node.collapsed) {
      elkNode.width = layoutOptions.nodeWidth;
      elkNode.height = layoutOptions.nodeHeight;
      return elkNode;
    }

    elkNode.layoutOptions =
      convertedEdges.length > 0
        ? {
          'partitioning.activate': 'true',
          'elk.direction': 'UNDEFINED',
          'elk.edgeRouting': 'SPLINES',
          'elk.algorithm': 'layered',
          'elk.nodeSize.minimum': '(228.0,96.0)',
          'elk.nodeSize.constraints': '[MINIMUM_SIZE]',
          'elk.spacing.nodeNode': '52',
          'elk.layered.spacing.nodeNodeBetweenLayers': '58',
          'elk.padding': '[left=20, top=76, right=20, bottom=24]',
        }
      : {
          'elk.algorithm': 'rectpacking',
          'elk.aspectRatio': String(aspectRatio),
          'elk.edgeRouting': 'SPLINES',
          'elk.spacing.nodeNode': '20',
          'elk.padding': '[left=20, top=84, right=20, bottom=24]',
        };
    elkNode.edges = convertedEdges;
    elkNode.children = node.nodes.map((childNode) => convertToElkNode(childNode, aspectRatio));
    elkNode.width = layoutOptions.groupWidth;
    elkNode.height = layoutOptions.groupHeight;
    return elkNode;
  }

  elkNode.layoutOptions = {
    'partitioning.partition': String(getPartitionLayer(node)),
  };
  elkNode.width = layoutOptions.nodeWidth;
  elkNode.height = layoutOptions.nodeHeight;

  return elkNode;
}

function makeEdgePathData(
  edge: ElkExtendedEdge,
  node?: ElkNode,
  parent?: ElkNode,
): Edge['data'] | undefined {
  if (!edge.sections || edge.sections.length === 0) {
    return undefined;
  }

  return {
    edge: (edge as ElkEdgeWithData).data,
    sections: edge.sections,
    parentOffset: {
      x: (node?.x ?? 0) + (parent?.x ?? 0),
      y: (node?.y ?? 0) + (parent?.y ?? 0),
    },
  };
}

function convertToReactFlowGraph(elkGraph: ElkNodeWithData) {
  const nodes: Node<TopologyFlowNodeData>[] = [];
  const edges: Edge[] = [];

  const pushEdges = (node: ElkNode, parent?: ElkNode) => {
    (node.edges as ElkExtendedEdge[] | undefined)?.forEach((edge) => {
      const edgeData = makeEdgePathData(edge, node, parent);
      if (!edgeData) {
        return;
      }

      edges.push({
        id: edge.id,
        source: edge.sources?.[0] ?? '',
        target: edge.targets?.[0] ?? '',
        type: (edge as ElkEdgeWithData).type ?? 'topologyEdge',
        selectable: false,
        focusable: false,
        markerEnd: {
          type: 'arrowclosed',
        } as EdgeMarker,
        data: edgeData,
      });
    });
  };

  const pushNode = (node: ElkNodeWithData, parent?: ElkNodeWithData) => {
    nodes.push({
      id: node.id,
      type: node.type,
      position: {
        x: node.x ?? 0,
        y: node.y ?? 0,
      },
      width: node.width,
      height: node.height,
      draggable: false,
      selectable: true,
      parentId: parent?.id,
      style: {
        width: node.width,
        height: node.height,
      },
      data: node.data,
    });
  };

  const convertNode = (node: ElkNodeWithData, parent?: ElkNodeWithData) => {
    pushNode(node, parent);
    pushEdges(node, parent);
    node.children?.forEach((childNode) => {
      convertNode(childNode as ElkNodeWithData, node);
    });
  };

  pushEdges(elkGraph);
  elkGraph.children?.forEach((childNode) => {
    convertNode(childNode as ElkNodeWithData, undefined);
  });

  return { nodes, edges };
}

export function applyGraphLayout(graph: TopologyGraphNode, aspectRatio: number) {
  if (!graph.nodes?.length) {
    return Promise.resolve({ nodes: [], edges: [] });
  }

  const elkGraph = convertToElkNode(graph, aspectRatio);

  return elk
    .layout(elkGraph, {
      layoutOptions: {
        'elk.aspectRatio': String(aspectRatio || 1.6),
      },
    })
    .then((layouted) => convertToReactFlowGraph(layouted as ElkNodeWithData));
}
