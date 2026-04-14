import { http } from './http';

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

function readNullableNumber(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) {
    return null;
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

  return null;
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
    const nested = asRecord(value);
    if (nested) {
      return Object.entries(nested)
        .map(([nestedKey, nestedValue]) =>
          typeof nestedValue === 'string' && nestedValue.trim() !== ''
            ? `${nestedKey}=${nestedValue.trim()}`
            : '',
        )
        .filter((item) => item !== '');
    }
  }

  return [];
}

function readArray(record: UnknownRecord | undefined, keys: string[]) {
  if (!record) {
    return [];
  }

  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

export type AuthMe = {
  name: string;
  authMode: string;
  currentContext: string;
  kubeconfigPath: string;
};

export type TokenLoginResult = {
  name: string;
  authMode: string;
  currentContext: string;
  kubeconfigPath: string;
  namespaces: string[];
  defaultNamespace: string;
};

export type OverviewSummary = {
  kubernetesVersion: string;
  clusterStatus: string;
  nodesReady: string;
  namespaces: number;
  podsRunningTotal: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
};

export type WarningEvent = {
  kind: string;
  name: string;
  namespace: string;
  reason: string;
  message: string;
  count: number;
  lastSeen: string;
};

export type NamespacePodStat = {
  namespace: string;
  pods: number;
};

export type NamespaceItem = {
  name: string;
  status: string;
  labels: string[];
  pods: number;
  services: number;
  age: string;
  createdAt: string;
};

export type PodContainerItem = {
  name: string;
  ready: boolean;
  restartCount: number;
  state: string;
  stateReason?: string;
  stateMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number;
  lastState?: string;
  lastStateReason?: string;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastExitCode?: number;
  image?: string;
  cpuUsage?: string;
  memoryUsage?: string;
};

export type PodConditionItem = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
};

export type PodEventItem = {
  type: string;
  reason: string;
  message: string;
  count: number;
  lastSeen: string;
};

export type PodLogResult = {
  namespace: string;
  name: string;
  container: string;
  content: string;
  generatedAt: string;
};

export type ResourceTextResult = {
  namespace: string;
  name: string;
  content: string;
  generatedAt: string;
};

export type PodItem = {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  readyContainers: number;
  totalContainers: number;
  restartCount: number;
  nodeName: string;
  podIP: string;
  qosClass: string;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  ownerKind?: string;
  ownerName?: string;
  labels: string[];
  containers: PodContainerItem[];
  conditions: PodConditionItem[];
};

export type DeploymentPodItem = {
  name: string;
  status: string;
  readyContainers: number;
  totalContainers: number;
  restartCount: number;
  nodeName: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
};

export type DeploymentConditionItem = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastUpdateTime?: string;
};

export type DeploymentItem = {
  name: string;
  namespace: string;
  status: string;
  desiredReplicas: number;
  updatedReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  unavailableReplicas: number;
  podCount: number;
  restartCount: number;
  strategy: string;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  selector: string[];
  labels: string[];
  images: string[];
  conditions: DeploymentConditionItem[];
  pods: DeploymentPodItem[];
};

export type WorkloadActionResult = {
  kind: string;
  namespace: string;
  name: string;
  operation: string;
  message: string;
  timestamp: string;
};

export type ReplicaSetConditionItem = DeploymentConditionItem;
export type ReplicaSetPodItem = DeploymentPodItem;
export type DaemonSetConditionItem = DeploymentConditionItem;
export type DaemonSetPodItem = DeploymentPodItem;
export type StatefulSetConditionItem = DeploymentConditionItem;
export type StatefulSetPodItem = DeploymentPodItem;

export type StatefulSetItem = {
  name: string;
  namespace: string;
  status: string;
  serviceName: string;
  podManagementPolicy: string;
  updateStrategy: string;
  desiredReplicas: number;
  readyReplicas: number;
  currentReplicas: number;
  updatedReplicas: number;
  availableReplicas: number;
  podCount: number;
  restartCount: number;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  currentRevision?: string;
  updateRevision?: string;
  selector: string[];
  labels: string[];
  images: string[];
  conditions: StatefulSetConditionItem[];
  pods: StatefulSetPodItem[];
};

export type ReplicaSetItem = {
  name: string;
  namespace: string;
  status: string;
  desiredReplicas: number;
  currentReplicas: number;
  readyReplicas: number;
  availableReplicas: number;
  fullyLabeledReplicas: number;
  podCount: number;
  restartCount: number;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  ownerKind?: string;
  ownerName?: string;
  selector: string[];
  labels: string[];
  images: string[];
  conditions: ReplicaSetConditionItem[];
  pods: ReplicaSetPodItem[];
};

export type DaemonSetItem = {
  name: string;
  namespace: string;
  status: string;
  updateStrategy: string;
  desiredNumberScheduled: number;
  currentNumberScheduled: number;
  updatedNumberScheduled: number;
  numberReady: number;
  numberAvailable: number;
  numberUnavailable: number;
  numberMisscheduled: number;
  podCount: number;
  restartCount: number;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  selector: string[];
  labels: string[];
  images: string[];
  conditions: DaemonSetConditionItem[];
  pods: DaemonSetPodItem[];
};

export type JobConditionItem = DeploymentConditionItem;
export type JobPodItem = DeploymentPodItem;

export type JobItem = {
  name: string;
  namespace: string;
  status: string;
  parallelism: number;
  desiredCompletions: number;
  active: number;
  succeeded: number;
  failed: number;
  completionMode?: string;
  podCount: number;
  restartCount: number;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  startTime?: string;
  completionTime?: string;
  ownerKind?: string;
  ownerName?: string;
  labels: string[];
  images: string[];
  conditions: JobConditionItem[];
  pods: JobPodItem[];
};

export type CronJobJobItem = {
  name: string;
  status: string;
  active: number;
  succeeded: number;
  failed: number;
  startTime?: string;
  completionTime?: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
};

export type CronJobItem = {
  name: string;
  namespace: string;
  status: string;
  schedule: string;
  timeZone?: string;
  suspend: boolean;
  concurrencyPolicy: string;
  activeJobs: number;
  jobCount: number;
  podCount: number;
  restartCount: number;
  successfulJobsHistory: number;
  failedJobsHistory: number;
  age: string;
  createdAt: string;
  metricsAvailable: boolean;
  cpuUsage?: string;
  memoryUsage?: string;
  lastScheduleTime?: string;
  lastSuccessfulTime?: string;
  labels: string[];
  images: string[];
  jobs: CronJobJobItem[];
};

export type ServicePortItem = {
  name?: string;
  protocol: string;
  port: number;
  targetPort?: string;
  nodePort?: number;
};

export type ServiceItem = {
  name: string;
  namespace: string;
  status: string;
  type: string;
  summary: string;
  clusterIP: string;
  externalName?: string;
  externalAddresses: string[];
  sessionAffinity: string;
  portsSummary: string;
  podCount: number;
  selector: string[];
  ports: ServicePortItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type IngressTLSItem = {
  secretName?: string;
  hosts: string[];
};

export type IngressItem = {
  name: string;
  namespace: string;
  status: string;
  ingressClass?: string;
  summary: string;
  hosts: string[];
  addresses: string[];
  serviceNames: string[];
  defaultBackend?: string;
  backendCount: number;
  tls: IngressTLSItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type IngressClassParameterRefItem = {
  apiGroup?: string;
  kind: string;
  name: string;
  scope?: string;
  namespace?: string;
};

export type IngressClassItem = {
  name: string;
  status: string;
  controller: string;
  isDefault: boolean;
  parameters?: IngressClassParameterRefItem;
  labels: string[];
  age: string;
  createdAt: string;
};

export type ServiceAccountItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  automountToken: string;
  secretNames: string[];
  secretCount: number;
  imagePullSecrets: string[];
  imagePullSecretCount: number;
  referencedPodCount: number;
  referencedPods: string[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type RoleRuleItem = {
  apiGroups: string[];
  resources: string[];
  resourceNames: string[];
  nonResourceUrls: string[];
  verbs: string[];
};

export type RoleItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  ruleCount: number;
  boundSubjectCount: number;
  boundSubjects: string[];
  rules: RoleRuleItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type RoleBindingSubjectItem = {
  kind: string;
  name: string;
  namespace?: string;
  apiGroup?: string;
};

export type RoleBindingItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  roleRefKind: string;
  roleRefName: string;
  roleRefApiGroup?: string;
  subjectCount: number;
  subjectSummaries: string[];
  subjects: RoleBindingSubjectItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type ConfigMapItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  immutable: boolean;
  dataKeys: string[];
  binaryDataKeys: string[];
  dataCount: number;
  binaryDataCount: number;
  referencedPodCount: number;
  referencedPods: string[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type SecretItem = {
  name: string;
  namespace: string;
  status: string;
  type: string;
  summary: string;
  immutable: boolean;
  dataKeys: string[];
  dataCount: number;
  referencedPodCount: number;
  referencedPods: string[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type NetworkPolicyRuleItem = {
  peers: string[];
  ports: string[];
};

export type NetworkPolicyItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  podSelector: string[];
  policyTypes: string[];
  selectedPodCount: number;
  selectedPods: string[];
  ingressRuleCount: number;
  egressRuleCount: number;
  ingressRules: NetworkPolicyRuleItem[];
  egressRules: NetworkPolicyRuleItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type HPAMetricItem = {
  type: string;
  name: string;
  target?: string;
  current?: string;
  summary?: string;
  container?: string;
  selector?: string;
};

export type HPAConditionItem = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
};

export type HPAItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
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
  behaviorSummary?: string;
  labels: string[];
  age: string;
  createdAt: string;
  lastScaleTime?: string;
};

export type ResourceValueItem = {
  name: string;
  value: string;
};

export type ResourceQuotaUsageItem = {
  resource: string;
  used: string;
  hard: string;
  usagePercent?: number | null;
  status?: string;
};

export type ResourceQuotaItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  trackedResourceCount: number;
  exceededResourceCount: number;
  usage: ResourceQuotaUsageItem[];
  scopes: string[];
  scopeSelectorExpressions: string[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type LimitRangeEntryItem = {
  type: string;
  summary: string;
  default: string[];
  defaultRequest: string[];
  min: string[];
  max: string[];
  maxLimitRequestRatio: string[];
};

export type LimitRangeItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  limitCount: number;
  types: string[];
  limits: LimitRangeEntryItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

function normalizeResourceQuotaUsageItem(value: unknown): ResourceQuotaUsageItem | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    resource: readString(record, ['resource', 'name'], 'resource'),
    used: readString(record, ['used'], '-'),
    hard: readString(record, ['hard'], '-'),
    usagePercent: readNullableNumber(record, ['usagePercent', 'percent']),
    status: readString(record, ['status'], 'default'),
  };
}

function normalizeResourceQuotaItem(value: unknown): ResourceQuotaItem {
  const record = asRecord(value);
  const usage = readArray(record, ['usage'])
    .map(normalizeResourceQuotaUsageItem)
    .filter((item): item is ResourceQuotaUsageItem => Boolean(item));
  const trackedResourceCount = readNumber(record, ['trackedResourceCount'], usage.length);
  const exceededResourceCount = readNumber(
    record,
    ['exceededResourceCount'],
    usage.filter((item) => item.status?.toLowerCase() === 'exceeded').length,
  );

  return {
    name: readString(record, ['name'], 'unknown-resourcequota'),
    namespace: readString(record, ['namespace'], 'default'),
    status: readString(record, ['status'], exceededResourceCount > 0 ? 'warning' : 'healthy'),
    summary: readString(
      record,
      ['summary'],
      `Tracked ${trackedResourceCount} · Exceeded ${exceededResourceCount}`,
    ),
    trackedResourceCount,
    exceededResourceCount,
    usage,
    scopes: readStringArray(record, ['scopes']),
    scopeSelectorExpressions: readStringArray(record, ['scopeSelectorExpressions']),
    labels: readStringArray(record, ['labels']),
    age: readString(record, ['age'], '-'),
    createdAt: readString(record, ['createdAt']),
  };
}

function normalizeResourceQuotaItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeResourceQuotaItem);
}

function normalizeLimitRangeEntryItem(value: unknown): LimitRangeEntryItem | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  return {
    type: readString(record, ['type'], 'Container'),
    summary: readString(record, ['summary'], 'Limit policy'),
    default: readStringArray(record, ['default']),
    defaultRequest: readStringArray(record, ['defaultRequest']),
    min: readStringArray(record, ['min']),
    max: readStringArray(record, ['max']),
    maxLimitRequestRatio: readStringArray(record, ['maxLimitRequestRatio']),
  };
}

function normalizeLimitRangeItem(value: unknown): LimitRangeItem {
  const record = asRecord(value);
  const limits = readArray(record, ['limits'])
    .map(normalizeLimitRangeEntryItem)
    .filter((item): item is LimitRangeEntryItem => Boolean(item));
  const types = readStringArray(record, ['types']);

  return {
    name: readString(record, ['name'], 'unknown-limitrange'),
    namespace: readString(record, ['namespace'], 'default'),
    status: readString(record, ['status'], 'healthy'),
    summary: readString(
      record,
      ['summary'],
      `Entries ${limits.length} · Types ${types.length || new Set(limits.map((item) => item.type)).size}`,
    ),
    limitCount: readNumber(record, ['limitCount'], limits.length),
    types: types.length > 0 ? types : [...new Set(limits.map((item) => item.type).filter(Boolean))],
    limits,
    labels: readStringArray(record, ['labels']),
    age: readString(record, ['age'], '-'),
    createdAt: readString(record, ['createdAt']),
  };
}

function normalizeLimitRangeItems(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeLimitRangeItem);
}

export type PersistentVolumeClaimItem = {
  name: string;
  namespace: string;
  status: string;
  summary: string;
  storageClass: string;
  volumeName?: string;
  volumeMode: string;
  accessModes: string[];
  requestedStorage: string;
  capacity?: string;
  mountedPodCount: number;
  mountedPods: string[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type EndpointAddressItem = {
  ip: string;
  ready: boolean;
  nodeName?: string;
  targetKind?: string;
  targetName?: string;
};

export type EndpointItem = {
  name: string;
  namespace: string;
  status: string;
  serviceName?: string;
  subsets: number;
  readyAddresses: number;
  notReadyAddresses: number;
  portsSummary: string;
  addresses: EndpointAddressItem[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type PersistentVolumeItem = {
  name: string;
  status: string;
  phase: string;
  capacity: string;
  accessModes: string[];
  reclaimPolicy: string;
  storageClass: string;
  volumeMode: string;
  claimNamespace?: string;
  claimName?: string;
  source: string;
  labels: string[];
  age: string;
  createdAt: string;
};

export type StorageClassItem = {
  name: string;
  status: string;
  provisioner: string;
  reclaimPolicy: string;
  volumeBindingMode: string;
  allowVolumeExpansion: boolean;
  isDefault: boolean;
  parameters: string[];
  labels: string[];
  age: string;
  createdAt: string;
};

export type NodeConditionItem = {
  type: string;
  status: string;
  reason?: string;
  message?: string;
  lastTransitionTime?: string;
};

export type NodeTaintItem = {
  key: string;
  value?: string;
  effect: string;
};

export type NodeItem = {
  name: string;
  role: string;
  ip: string;
  status: string;
  ready?: boolean;
  schedulable?: boolean;
  kubeletVersion: string;
  osImage: string;
  kernelVersion: string;
  containerRuntime: string;
  architecture?: string;
  podCount?: number;
  age?: string;
  createdAt?: string;
  metricsAvailable?: boolean;
  cpuUsage?: string;
  cpuUsagePercent?: number;
  memoryUsage?: string;
  memoryUsagePercent?: number;
  cpuAllocatable?: string;
  memoryAllocatable?: string;
  conditions?: NodeConditionItem[];
  taints?: NodeTaintItem[];
  labels?: string[];
};

export type TopologyResource = {
  id: string;
  kind: string;
  name: string;
  namespace: string;
  instanceName?: string;
  source: 'workloads' | 'network' | 'storage';
  status: 'healthy' | 'warning' | 'error';
  summary: string;
  detailLines: string[];
  nodeName?: string;
  tags?: string[];
  weight: number;
  warnings: number;
};

export type TopologyRelation = {
  id: string;
  source: string;
  target: string;
  label: string;
};

export type TopologyGraph = {
  resources: TopologyResource[];
  relations: TopologyRelation[];
};

type Envelope<T> = {
  code: string;
  message: string;
  data: T;
};

export async function getAuthMe() {
  const { data } = await http.get<Envelope<AuthMe>>('/auth/me');
  return data.data;
}

export async function loginWithToken(token: string) {
  const { data } = await http.post<Envelope<TokenLoginResult>>(
    '/auth/login',
    { token },
    {
      headers: {
        'X-Skip-Auth': 'true',
      },
    },
  );
  return data.data;
}

export async function getNamespaces() {
  const { data } = await http.get<Envelope<string[]>>('/namespaces');
  return data.data;
}

export async function getNamespaceItems() {
  const { data } = await http.get<Envelope<NamespaceItem[]>>('/namespaces/items');
  return data.data;
}

export async function getOverviewSummary(namespace?: string) {
  const { data } = await http.get<Envelope<OverviewSummary>>('/overview/summary', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getOverviewWarnings(namespace?: string) {
  const { data } = await http.get<Envelope<WarningEvent[]>>('/overview/events/warnings', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getNamespacePodTop(namespace?: string) {
  const { data } = await http.get<Envelope<NamespacePodStat[]>>('/overview/namespaces/pod-top', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getNodes() {
  const { data } = await http.get<Envelope<NodeItem[]>>('/nodes');
  return data.data;
}

export async function getPods(namespace?: string) {
  const { data } = await http.get<Envelope<PodItem[]>>('/pods', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getPodEvents(namespace: string, name: string) {
  const { data } = await http.get<Envelope<PodEventItem[]>>(
    `/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/events`,
  );
  return data.data;
}

export async function getPodLogs(namespace: string, name: string, container: string, tailLines = 200) {
  const { data } = await http.get<Envelope<PodLogResult>>(
    `/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`,
    {
      params: {
        container,
        tailLines,
      },
    },
  );
  return data.data;
}

export async function getPodYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updatePodYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getPodDescribe(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/describe`,
  );
  return data.data;
}

export async function deletePod(namespace: string, name: string) {
  const { data } = await http.delete<Envelope<WorkloadActionResult>>(
    `/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
  );
  return data.data;
}

export function buildPodExecWebSocketUrl(
  token: string,
  namespace: string,
  name: string,
  container: string,
  command: string,
) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const query = new URLSearchParams({
    token,
    container,
    command,
  });

  return `${protocol}//${window.location.host}/api/v1/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/exec/ws?${query.toString()}`;
}

export async function getDeployments(namespace?: string) {
  const { data } = await http.get<Envelope<DeploymentItem[]>>('/deployments', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getDeploymentYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateDeploymentYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function scaleDeployment(namespace: string, name: string, replicas: number) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`,
    { replicas },
  );
  return data.data;
}

export async function restartDeployment(namespace: string, name: string) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`,
  );
  return data.data;
}

export async function scaleStatefulSet(namespace: string, name: string, replicas: number) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/statefulsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`,
    { replicas },
  );
  return data.data;
}

export async function restartStatefulSet(namespace: string, name: string) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/statefulsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`,
  );
  return data.data;
}

export async function getStatefulSets(namespace?: string) {
  const { data } = await http.get<Envelope<StatefulSetItem[]>>('/statefulsets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getStatefulSetYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/statefulsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateStatefulSetYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/statefulsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getReplicaSets(namespace?: string) {
  const { data } = await http.get<Envelope<ReplicaSetItem[]>>('/replicasets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getReplicaSetYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/replicasets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function scaleReplicaSet(namespace: string, name: string, replicas: number) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/replicasets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/scale`,
    { replicas },
  );
  return data.data;
}

export async function updateReplicaSetYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/replicasets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getDaemonSets(namespace?: string) {
  const { data } = await http.get<Envelope<DaemonSetItem[]>>('/daemonsets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getDaemonSetYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/daemonsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function restartDaemonSet(namespace: string, name: string) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/daemonsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/restart`,
  );
  return data.data;
}

export async function updateDaemonSetYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/daemonsets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getJobs(namespace?: string) {
  const { data } = await http.get<Envelope<JobItem[]>>('/jobs', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getJobYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/jobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function setJobSuspend(namespace: string, name: string, suspend: boolean) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/jobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/suspend`,
    { suspend },
  );
  return data.data;
}

export async function updateJobYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/jobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getCronJobs(namespace?: string) {
  const { data } = await http.get<Envelope<CronJobItem[]>>('/cronjobs', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getCronJobYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/cronjobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function setCronJobSuspend(namespace: string, name: string, suspend: boolean) {
  const { data } = await http.post<Envelope<WorkloadActionResult>>(
    `/cronjobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/suspend`,
    { suspend },
  );
  return data.data;
}

export async function updateCronJobYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/cronjobs/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getServices(namespace?: string) {
  const { data } = await http.get<Envelope<ServiceItem[]>>('/services', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getServiceYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateServiceYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getEndpoints(namespace?: string) {
  const { data } = await http.get<Envelope<EndpointItem[]>>('/endpoints', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getEndpointYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/endpoints/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateEndpointYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/endpoints/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getIngresses(namespace?: string) {
  const { data } = await http.get<Envelope<IngressItem[]>>('/ingresses', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getIngressYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/ingresses/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateIngressYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/ingresses/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getIngressClasses() {
  const { data } = await http.get<Envelope<IngressClassItem[]>>('/ingressclasses');
  return data.data;
}

export async function getIngressClassYaml(name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/ingressclasses/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateIngressClassYaml(name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/ingressclasses/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getServiceAccounts(namespace?: string) {
  const { data } = await http.get<Envelope<ServiceAccountItem[]>>('/serviceaccounts', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getServiceAccountYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/serviceaccounts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateServiceAccountYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/serviceaccounts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getRoles(namespace?: string) {
  const { data } = await http.get<Envelope<RoleItem[]>>('/roles', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getRoleYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/roles/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateRoleYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/roles/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getRoleBindings(namespace?: string) {
  const { data } = await http.get<Envelope<RoleBindingItem[]>>('/rolebindings', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getRoleBindingYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/rolebindings/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateRoleBindingYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/rolebindings/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getConfigMaps(namespace?: string) {
  const { data } = await http.get<Envelope<ConfigMapItem[]>>('/configmaps', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getConfigMapYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/configmaps/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateConfigMapYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/configmaps/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getSecrets(namespace?: string) {
  const { data } = await http.get<Envelope<SecretItem[]>>('/secrets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getSecretYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateSecretYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getNetworkPolicies(namespace?: string) {
  const { data } = await http.get<Envelope<NetworkPolicyItem[]>>('/networkpolicies', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getNetworkPolicyYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/networkpolicies/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateNetworkPolicyYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/networkpolicies/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getHPAs(namespace?: string) {
  const { data } = await http.get<Envelope<HPAItem[]>>('/hpas', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getHPAYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/hpas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateHPAYaml(namespace: string, name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/hpas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getResourceQuotas(namespace?: string) {
  const { data } = await http.get<Envelope<ResourceQuotaItem[]>>('/resourcequotas', {
    params: namespace ? { namespace } : undefined,
  });
  return normalizeResourceQuotaItems(data.data);
}

export async function getResourceQuotaYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/resourcequotas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateResourceQuotaYaml(
  namespace: string,
  name: string,
  content: string,
) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/resourcequotas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getLimitRanges(namespace?: string) {
  const { data } = await http.get<Envelope<LimitRangeItem[]>>('/limitranges', {
    params: namespace ? { namespace } : undefined,
  });
  return normalizeLimitRangeItems(data.data);
}

export async function getLimitRangeYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/limitranges/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateLimitRangeYaml(
  namespace: string,
  name: string,
  content: string,
) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/limitranges/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getPersistentVolumeClaims(namespace?: string) {
  const { data } = await http.get<Envelope<PersistentVolumeClaimItem[]>>(
    '/persistentvolumeclaims',
    {
      params: namespace ? { namespace } : undefined,
    },
  );
  return data.data;
}

export async function getPersistentVolumeClaimYaml(namespace: string, name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/persistentvolumeclaims/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updatePersistentVolumeClaimYaml(
  namespace: string,
  name: string,
  content: string,
) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/persistentvolumeclaims/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getPersistentVolumes() {
  const { data } = await http.get<Envelope<PersistentVolumeItem[]>>('/persistentvolumes');
  return data.data;
}

export async function getPersistentVolumeYaml(name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/persistentvolumes/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updatePersistentVolumeYaml(name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/persistentvolumes/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getStorageClasses() {
  const { data } = await http.get<Envelope<StorageClassItem[]>>('/storageclasses');
  return data.data;
}

export async function getStorageClassYaml(name: string) {
  const { data } = await http.get<Envelope<ResourceTextResult>>(
    `/storageclasses/${encodeURIComponent(name)}/yaml`,
  );
  return data.data;
}

export async function updateStorageClassYaml(name: string, content: string) {
  const { data } = await http.put<Envelope<WorkloadActionResult>>(
    `/storageclasses/${encodeURIComponent(name)}/yaml`,
    { content },
  );
  return data.data;
}

export async function getTopologyGraph(namespace?: string, sources?: string[]) {
  const { data } = await http.get<Envelope<TopologyGraph>>('/topology/graph', {
    params: {
      namespace,
      sources: sources?.join(','),
    },
  });
  return data.data;
}
