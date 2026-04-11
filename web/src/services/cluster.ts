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

export type NodeItem = {
  name: string;
  role: string;
  ip: string;
  status: string;
  kubeletVersion: string;
  osImage: string;
  kernelVersion: string;
  containerRuntime: string;
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

export async function getTopologyGraph(namespace?: string, sources?: string[]) {
  const { data } = await http.get<Envelope<TopologyGraph>>('/topology/graph', {
    params: {
      namespace,
      sources: sources?.join(','),
    },
  });
  return data.data;
}
