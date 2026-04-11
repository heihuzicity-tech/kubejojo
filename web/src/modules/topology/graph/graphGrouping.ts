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

import { collectLeafNodes, forEachNode, getNodeWeight, type TopologyGraphEdge, type TopologyGraphNode } from './graphModel';
import { makeGraphLookup } from './graphLookup';

export type GroupByMode = 'node' | 'namespace' | 'instance';

export function getGraphSize(graph: TopologyGraphNode) {
  let size = 0;

  forEachNode(graph, () => {
    size += 1;
  });

  return size;
}

function getConnectedComponents(nodes: TopologyGraphNode[], edges: TopologyGraphEdge[]) {
  const components: TopologyGraphNode[] = [];
  const lookup = makeGraphLookup(nodes, edges);
  const visitedNodes = new Set<string>();
  const visitedEdges = new Set<string>();

  const findConnectedComponent = (
    node: TopologyGraphNode,
    componentNodes: TopologyGraphNode[],
    componentEdges: TopologyGraphEdge[],
  ) => {
    visitedNodes.add(node.id);
    componentNodes.push(node);

    lookup.getOutgoingEdges(node.id)?.forEach((edge) => {
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        componentEdges.push(edge);
      }

      if (!visitedNodes.has(edge.target)) {
        const targetNode = lookup.getNode(edge.target);
        if (targetNode) {
          findConnectedComponent(targetNode, componentNodes, componentEdges);
        }
      }
    });

    lookup.getIncomingEdges(node.id)?.forEach((edge) => {
      if (!visitedEdges.has(edge.id)) {
        visitedEdges.add(edge.id);
        componentEdges.push(edge);
      }

      if (!visitedNodes.has(edge.source)) {
        const sourceNode = lookup.getNode(edge.source);
        if (sourceNode) {
          findConnectedComponent(sourceNode, componentNodes, componentEdges);
        }
      }
    });
  };

  nodes.forEach((node) => {
    if (!visitedNodes.has(node.id)) {
      const componentNodes: TopologyGraphNode[] = [];
      const componentEdges: TopologyGraphEdge[] = [];

      findConnectedComponent(node, componentNodes, componentEdges);

      const mainNode = getMainNode(componentNodes);
      components.push({
        id: `group-${mainNode?.id ?? 'unknown'}`,
        nodes: componentNodes,
        edges: componentEdges,
      });
    }
  });

  return components.map((component) =>
    component.nodes?.length === 1 ? component.nodes[0] : component,
  );
}

export function getMainNode(nodes: TopologyGraphNode[]): TopologyGraphNode | undefined {
  if (nodes.length === 0) {
    return undefined;
  }

  if (nodes.length === 1) {
    return nodes[0];
  }

  let mainNode = nodes[0];
  let maxWeight = getNodeWeight(mainNode);

  for (let index = 1; index < nodes.length; index += 1) {
    const currentWeight = getNodeWeight(nodes[index]);
    if (currentWeight > maxWeight) {
      mainNode = nodes[index];
      maxWeight = currentWeight;
    }
  }

  return mainNode;
}

function groupEntriesByKey<T>(items: T[], accessor: (item: T) => string | null | undefined) {
  const grouped = new Map<string, T[]>();

  items.forEach((item) => {
    const key = accessor(item) ?? 'undefined';
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });

  return grouped;
}

function groupByProperty(
  nodes: TopologyGraphNode[],
  accessor: (node: TopologyGraphNode) => string | null | undefined,
  {
    label,
    allowSingleMemberGroup = false,
  }: {
    label: string;
    allowSingleMemberGroup?: boolean;
  },
) {
  const groups = Array.from(groupEntriesByKey(nodes, accessor).entries()).map(
    ([property, components]): TopologyGraphNode => ({
      id: `${label}-${property}`,
      label: property,
      subtitle: label,
      nodes: components,
      edges: [],
    }),
  );

  return groups
    .flatMap((group) => {
      const nonGroup = group.id.includes('undefined');
      const hasOneMember = group.nodes?.length === 1;
      return nonGroup || (hasOneMember && !allowSingleMemberGroup) ? (group.nodes ?? []) : [group];
    })
    .filter(Boolean);
}

function findResourceValue(
  node: TopologyGraphNode,
  accessor: (resource: NonNullable<TopologyGraphNode['resource']>) => string | null | undefined,
) {
  const leafNodes = collectLeafNodes(node);
  const targetNode =
    leafNodes.find((item) => item.resource?.kind === 'Pod' && accessor(item.resource) != null) ??
    leafNodes.find((item) => item.resource && accessor(item.resource) != null);

  return targetNode?.resource ? accessor(targetNode.resource) : undefined;
}

export function groupGraph(
  nodes: TopologyGraphNode[],
  edges: TopologyGraphEdge[],
  { groupBy }: { groupBy?: GroupByMode },
) {
  const root: TopologyGraphNode = {
    id: 'root',
    label: 'root',
    nodes: [],
    edges: [],
  };

  let components = getConnectedComponents(nodes, edges);

  if (groupBy === 'namespace') {
    components = groupByProperty(
      components,
      (component) => findResourceValue(component, (resource) => resource.namespace),
      { label: 'Namespace', allowSingleMemberGroup: true },
    );
  }

  if (groupBy === 'node') {
    components = groupByProperty(
      components,
      (component) => findResourceValue(component, (resource) => resource.nodeName),
      { label: 'Node', allowSingleMemberGroup: true },
    );
  }

  if (groupBy === 'instance') {
    components = groupByProperty(
      components,
      (component) => {
        const mainNode = getMainNode(collectLeafNodes(component));
        return mainNode?.resource?.instanceName;
      },
      { label: 'Instance' },
    );
  }

  root.nodes?.push(...components);

  forEachNode(root, (node) => {
    const getSortedWeight = (currentNode: TopologyGraphNode): number => {
      let weight = getNodeWeight(currentNode);

      if (currentNode.nodes && currentNode.edges) {
        if (currentNode.edges.length > 0) {
          weight += 10000;
        }
        weight += currentNode.nodes.length * 10;
      }

      return weight;
    };

    if (node.nodes) {
      node.nodes.sort((left, right) => getSortedWeight(right) - getSortedWeight(left));
    }
  });

  return root;
}

export function getParentNode(graph: TopologyGraphNode, elementID: string) {
  let result: TopologyGraphNode | undefined;

  forEachNode(graph, (node) => {
    if (node.nodes?.find((item) => item.id === elementID)) {
      result = node;
    }
  });

  return result;
}

export function findGroupContaining(
  graph: TopologyGraphNode,
  elementID: string,
  strict?: boolean,
): TopologyGraphNode | undefined {
  if (graph.id === elementID && !strict) {
    return graph;
  }

  if (graph.nodes?.find((item) => (strict ? item.id === elementID : item.id === elementID && !item.nodes))) {
    return graph;
  }

  if (graph.nodes) {
    let result: TopologyGraphNode | undefined;

    graph.nodes.some((node) => {
      const group = findGroupContaining(node, elementID, strict);
      if (group) {
        result = group;
        return true;
      }
      return false;
    });

    return result;
  }

  return undefined;
}

export function collapseGraph(
  graph: TopologyGraphNode,
  { selectedNodeID = 'root', expandAll }: { selectedNodeID?: string; expandAll: boolean },
) {
  let root: TopologyGraphNode = { ...graph };
  let selectedGroup: TopologyGraphNode | undefined;

  if (selectedNodeID) {
    selectedGroup = findGroupContaining(graph, selectedNodeID);
  }

  const collapseGroup = (group: TopologyGraphNode): TopologyGraphNode => {
    const isBig = (group.nodes?.length ?? 0) > 10 || (group.edges?.length ?? 0) > 0;
    const isSelectedGroup = selectedGroup?.id === group.id;
    const isRoot = group.id === 'root';
    const collapsed = !expandAll && !isRoot && !isSelectedGroup && isBig;

    return {
      ...group,
      nodes: group.nodes?.map(collapseGroup),
      edges: group.edges,
      collapsed,
    };
  };

  if (selectedGroup && selectedGroup.id !== 'root') {
    root.nodes = [selectedGroup];
  }

  root = collapseGroup(root);

  return root;
}
