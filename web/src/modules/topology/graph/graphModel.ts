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

import type { ReactNode } from 'react';

import type { TopologyRelation, TopologyResource } from '../../../services/cluster';

export type TopologyGraphNode = {
  id: string;
  label?: string;
  subtitle?: string;
  icon?: ReactNode;
  resource?: TopologyResource;
  nodes?: TopologyGraphNode[];
  edges?: TopologyGraphEdge[];
  collapsed?: boolean;
  weight?: number;
  data?: Record<string, unknown>;
};

export type TopologyGraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: ReactNode;
  data?: TopologyRelation | Record<string, unknown>;
};

const defaultNodeWeights: Record<string, number> = {
  HorizontalPodAutoscaler: 1000,
  Deployment: 980,
  StatefulSet: 960,
  DaemonSet: 960,
  CronJob: 960,
  ReplicaSet: 940,
  Job: 920,
  Pod: 820,
  ServiceAccount: 800,
  Service: 790,
  RoleBinding: 790,
  Role: 780,
  NetworkPolicy: 780,
  PersistentVolumeClaim: 780,
  ConfigMap: 770,
  Secret: 770,
  Endpoints: 760,
  EndpointSlice: 760,
  Ingress: 760,
  IngressClass: 750,
  PersistentVolume: 740,
  StorageClass: 730,
};

export function makeTopologyElements(
  resources: TopologyResource[],
  relations: TopologyRelation[],
): { nodes: TopologyGraphNode[]; edges: TopologyGraphEdge[] } {
  return {
    nodes: resources.map((resource) => ({
      id: resource.id,
      label: resource.name,
      subtitle: resource.kind,
      resource,
      weight: resource.weight,
    })),
    edges: relations.map((relation) => ({
      id: relation.id,
      source: relation.source,
      target: relation.target,
      label: relation.label,
      data: relation,
    })),
  };
}

export function forEachNode(graph: TopologyGraphNode, cb: (node: TopologyGraphNode) => void) {
  cb(graph);
  graph.nodes?.forEach((node) => {
    forEachNode(node, cb);
  });
}

export function collectLeafNodes(graph: TopologyGraphNode): TopologyGraphNode[] {
  if (!graph.nodes?.length) {
    return [graph];
  }

  return graph.nodes.flatMap((node) => collectLeafNodes(node));
}

export function graphContainsNode(graph: TopologyGraphNode, nodeID: string) {
  let exists = false;

  forEachNode(graph, (node) => {
    if (node.id === nodeID) {
      exists = true;
    }
  });

  return exists;
}

export function getNodeWeight(node: TopologyGraphNode): number {
  if (typeof node.weight === 'number') {
    return node.weight;
  }

  if (typeof node.resource?.weight === 'number') {
    return node.resource.weight;
  }

  if (node.resource?.kind && defaultNodeWeights[node.resource.kind]) {
    return defaultNodeWeights[node.resource.kind];
  }

  return 500;
}
