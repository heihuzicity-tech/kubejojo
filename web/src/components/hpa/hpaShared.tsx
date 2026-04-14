import type { ResourceTextResult } from '../../services/cluster';
import * as clusterService from '../../services/cluster';

type UnknownRecord = Record<string, unknown>;

export type HPAMetricItem = {
  type: string;
  name: string;
  current: string;
  target: string;
  summary: string;
};

export type HPAConditionItem = {
  type: string;
  status: string;
  reason: string;
  message: string;
  lastTransitionTime: string;
};

export type HPAItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  age: string;
  labels: string[];
  scaleTargetKind: string;
  scaleTargetName: string;
  scaleTargetApiVersion: string;
  minReplicas: number;
  maxReplicas: number;
  currentReplicas: number;
  desiredReplicas: number;
  metricCount: number;
  metrics: HPAMetricItem[];
  conditionCount: number;
  conditions: HPAConditionItem[];
  lastScaleTime: string;
  behaviorSummary: string;
};

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

function readNumber(record: UnknownRecord | undefined, keys: string[], fallback = 0) {
  if (!record) {
    return fallback;
  }

  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function readStringArray(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter((item) => item !== '');
    }
  }

  return [];
}

function buildMetricSummary(metric: HPAMetricItem) {
  const parts = [metric.type, metric.name].filter(Boolean);
  const base = parts.join(' · ');

  if (metric.current && metric.target) {
    return `${base} ${metric.current} -> ${metric.target}`.trim();
  }
  if (metric.current) {
    return `${base} current ${metric.current}`.trim();
  }
  if (metric.target) {
    return `${base} target ${metric.target}`.trim();
  }

  return base || 'Metric';
}

function normalizeMetric(value: unknown): HPAMetricItem | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const type = readString(record, ['type', 'metricType'], 'Metric');
  const name = readString(record, ['name', 'metricName', 'resource', 'resourceName'], type);
  const current = readString(record, [
    'current',
    'currentValue',
    'currentAverageValue',
    'currentAverageUtilization',
    'currentUtilization',
    'value',
  ]);
  const target = readString(record, [
    'target',
    'targetValue',
    'targetAverageValue',
    'targetAverageUtilization',
    'targetUtilization',
  ]);
  const summary = readString(record, ['summary'], buildMetricSummary({ type, name, current, target, summary: '' }));

  return {
    type,
    name,
    current,
    target,
    summary,
  };
}

function normalizeCondition(value: unknown): HPAConditionItem | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    type: readString(record, ['type'], 'Condition'),
    status: readString(record, ['status'], 'Unknown'),
    reason: readString(record, ['reason']),
    message: readString(record, ['message']),
    lastTransitionTime: readString(record, ['lastTransitionTime', 'lastTransition']),
  };
}

export function normalizeHPAItem(value: unknown): HPAItem {
  const record = asRecord(value);
  const metrics =
    ((record?.metrics as unknown[]) ?? (record?.metricSpecs as unknown[]) ?? (record?.metricStatuses as unknown[]) ?? [])
      .map(normalizeMetric)
      .filter((item): item is HPAMetricItem => Boolean(item));
  const conditions =
    ((record?.conditions as unknown[]) ?? [])
      .map(normalizeCondition)
      .filter((item): item is HPAConditionItem => Boolean(item));

  const minReplicas = readNumber(record, ['minReplicas'], 1);
  const maxReplicas = readNumber(record, ['maxReplicas'], 1);
  const currentReplicas = readNumber(record, ['currentReplicas'], 0);
  const desiredReplicas = readNumber(record, ['desiredReplicas', 'targetReplicas'], currentReplicas);
  const scaleTargetKind = readString(record, ['scaleTargetKind', 'targetKind', 'referenceKind'], 'Workload');
  const scaleTargetName = readString(record, ['scaleTargetName', 'targetName', 'referenceName'], '-');
  const scaleTargetApiVersion = readString(record, ['scaleTargetApiVersion', 'targetApiVersion', 'apiVersion'], '-');

  return {
    name: readString(record, ['name'], 'unknown-hpa'),
    namespace: readString(record, ['namespace'], 'default'),
    status: readString(record, ['status'], currentReplicas !== desiredReplicas ? 'scaling' : 'healthy'),
    summary: readString(
      record,
      ['summary'],
      `${scaleTargetKind}/${scaleTargetName} · ${currentReplicas} -> ${desiredReplicas}`,
    ),
    age: readString(record, ['age'], '-'),
    labels: readStringArray(record, ['labels']),
    scaleTargetKind,
    scaleTargetName,
    scaleTargetApiVersion,
    minReplicas,
    maxReplicas,
    currentReplicas,
    desiredReplicas,
    metricCount: readNumber(record, ['metricCount'], metrics.length),
    metrics,
    conditionCount: readNumber(record, ['conditionCount'], conditions.length),
    conditions,
    lastScaleTime: readString(record, ['lastScaleTime'], '-'),
    behaviorSummary: readString(record, ['behaviorSummary', 'behavior'], metrics.length > 0 ? 'Metrics-driven scaling' : '-'),
  };
}

export function normalizeHPAItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeHPAItem);
}

function resolveClusterFn<T extends (...args: never[]) => unknown>(name: string) {
  const fn = (clusterService as UnknownRecord)[name];
  if (typeof fn !== 'function') {
    throw new Error(`Missing cluster API export: ${name}`);
  }

  return fn as T;
}

export async function listHPAs(namespace: string) {
  const fn = resolveClusterFn<(namespace: string) => Promise<unknown>>('getHPAs');
  return normalizeHPAItems(await fn(namespace));
}

export async function readHPAYaml(namespace: string, name: string) {
  const fn = resolveClusterFn<(namespace: string, name: string) => Promise<ResourceTextResult>>('getHPAYaml');
  return fn(namespace, name);
}

export async function saveHPAYaml(namespace: string, name: string, content: string) {
  const fn = resolveClusterFn<
    (namespace: string, name: string, content: string) => Promise<{ message?: string }>
  >('updateHPAYaml');
  return fn(namespace, name, content);
}

export function extractMutationMessage(result: unknown, fallback: string) {
  const record = asRecord(result);
  return readString(record, ['message'], fallback);
}

export function buildHPARoute(namespace: string, name: string) {
  return `/resources/hpas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function buildScaleTargetRoute(
  namespace: string,
  kind: string,
  name: string,
) {
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

export function hpaStatusColor(status: string) {
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

export function hpaConditionStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'true':
      return 'green';
    case 'false':
      return 'red';
    default:
      return 'default';
  }
}

export function metricPreview(metrics: HPAMetricItem[]) {
  if (metrics.length === 0) {
    return 'No metrics';
  }

  const text = metrics
    .slice(0, 2)
    .map((item) => item.summary)
    .join(' · ');

  return metrics.length > 2 ? `${text} +${metrics.length - 2}` : text;
}

export function targetSummary(item: Pick<HPAItem, 'scaleTargetKind' | 'scaleTargetName'>) {
  return `${item.scaleTargetKind}/${item.scaleTargetName}`;
}

export function replicaSummary(item: Pick<HPAItem, 'currentReplicas' | 'desiredReplicas' | 'minReplicas' | 'maxReplicas'>) {
  return `${item.currentReplicas} / ${item.desiredReplicas} · ${item.minReplicas}-${item.maxReplicas}`;
}
