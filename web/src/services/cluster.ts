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

export async function getOverviewSummary() {
  const { data } = await http.get<Envelope<OverviewSummary>>('/overview/summary');
  return data.data;
}

export async function getOverviewWarnings() {
  const { data } = await http.get<Envelope<WarningEvent[]>>('/overview/events/warnings');
  return data.data;
}

export async function getNamespacePodTop() {
  const { data } = await http.get<Envelope<NamespacePodStat[]>>('/overview/namespaces/pod-top');
  return data.data;
}

export async function getNodes() {
  const { data } = await http.get<Envelope<NodeItem[]>>('/nodes');
  return data.data;
}
