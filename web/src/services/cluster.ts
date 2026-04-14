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
