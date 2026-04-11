import { http } from './http';

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

export async function getDeployments(namespace?: string) {
  const { data } = await http.get<Envelope<DeploymentItem[]>>('/deployments', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getStatefulSets(namespace?: string) {
  const { data } = await http.get<Envelope<StatefulSetItem[]>>('/statefulsets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getReplicaSets(namespace?: string) {
  const { data } = await http.get<Envelope<ReplicaSetItem[]>>('/replicasets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getDaemonSets(namespace?: string) {
  const { data } = await http.get<Envelope<DaemonSetItem[]>>('/daemonsets', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getJobs(namespace?: string) {
  const { data } = await http.get<Envelope<JobItem[]>>('/jobs', {
    params: namespace ? { namespace } : undefined,
  });
  return data.data;
}

export async function getCronJobs(namespace?: string) {
  const { data } = await http.get<Envelope<CronJobItem[]>>('/cronjobs', {
    params: namespace ? { namespace } : undefined,
  });
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
