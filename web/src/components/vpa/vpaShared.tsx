import type {
  ResourceTextResult,
  VPAClusterReadiness,
  VPAClusterReadinessCheck,
  VPAConditionItem,
  VPAContainerPolicyItem,
  VPAInsightItem,
  VPAItem,
  VPARecommendationItem,
} from '../../services/cluster';
import * as clusterService from '../../services/cluster';

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }

  return value as UnknownRecord;
}

function readString(record: UnknownRecord | undefined, keys: string[], fallback = '') {
  if (!record) {
    return fallback;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') {
      return value;
    }
  }

  return fallback;
}

function resolveClusterFn<T extends (...args: never[]) => unknown>(name: string) {
  const fn = (clusterService as UnknownRecord)[name];
  if (typeof fn !== 'function') {
    throw new Error(`Missing cluster API export: ${name}`);
  }

  return fn as T;
}

export type {
  VPAClusterReadiness,
  VPAClusterReadinessCheck,
  VPAConditionItem,
  VPAContainerPolicyItem,
  VPAInsightItem,
  VPAItem,
  VPARecommendationItem,
};

export async function listVPAs(namespace: string) {
  const fn = resolveClusterFn<(namespace: string) => Promise<VPAItem[]>>('getVPAs');
  return fn(namespace);
}

export async function readVPAReadiness() {
  const fn = resolveClusterFn<() => Promise<VPAClusterReadiness>>('getVPAReadiness');
  return fn();
}

export async function readVPAYaml(namespace: string, name: string) {
  const fn = resolveClusterFn<(namespace: string, name: string) => Promise<ResourceTextResult>>('getVPAYaml');
  return fn(namespace, name);
}

export async function saveVPAYaml(namespace: string, name: string, content: string) {
  const fn = resolveClusterFn<
    (namespace: string, name: string, content: string) => Promise<{ message?: string }>
  >('updateVPAYaml');
  return fn(namespace, name, content);
}

export async function removeVPA(namespace: string, name: string) {
  const fn = resolveClusterFn<
    (namespace: string, name: string) => Promise<{ message?: string }>
  >('deleteVPA');
  return fn(namespace, name);
}

export function extractMutationMessage(result: unknown, fallback: string) {
  return readString(asRecord(result), ['message'], fallback);
}

export function buildVPARoute(namespace: string, name: string) {
  return `/resources/vpas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function buildScaleTargetRoute(namespace: string, kind: string, name: string) {
  switch (kind.toLowerCase()) {
    case 'deployment':
      return `/workloads/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    case 'statefulset':
      return `/workloads/statefulsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    case 'replicaset':
      return `/workloads/replicasets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    case 'daemonset':
      return `/workloads/daemonsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
    default:
      return undefined;
  }
}

export function vpaStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'ready':
    case 'stable':
      return 'green';
    case 'warning':
    case 'scaling':
      return 'orange';
    case 'error':
    case 'failed':
      return 'red';
    default:
      return 'default';
  }
}

export function vpaConditionStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'true':
      return 'green';
    case 'false':
      return 'red';
    default:
      return 'default';
  }
}

export function vpaInsightColor(level: string) {
  switch (level.toLowerCase()) {
    case 'error':
      return 'red';
    case 'warning':
      return 'orange';
    case 'info':
      return 'blue';
    default:
      return 'default';
  }
}

export function targetSummary(item: Pick<VPAItem, 'scaleTargetKind' | 'scaleTargetName'>) {
  return `${item.scaleTargetKind}/${item.scaleTargetName}`;
}

export function policyPreview(policies: VPAContainerPolicyItem[]) {
  if (policies.length === 0) {
    return 'No explicit policies';
  }

  const text = policies
    .slice(0, 2)
    .map((item) => `${item.containerName} · ${item.summary}`)
    .join(' · ');

  return policies.length > 2 ? `${text} +${policies.length - 2}` : text;
}

export function recommendationPreview(recommendations: VPARecommendationItem[]) {
  if (recommendations.length === 0) {
    return 'No recommendations';
  }

  const text = recommendations
    .slice(0, 2)
    .map((item) => `${item.containerName} · ${item.summary}`)
    .join(' · ');

  return recommendations.length > 2 ? `${text} +${recommendations.length - 2}` : text;
}

export function formatRecommendationItems(items: string[]) {
  if (items.length === 0) {
    return '-';
  }

  const text = items.slice(0, 2).join(', ');
  return items.length > 2 ? `${text} +${items.length - 2}` : text;
}
