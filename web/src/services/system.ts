import { http } from './http';

const longRunningActionTimeoutMs = 10 * 60 * 1000;

type Envelope<T> = {
  code: string;
  message: string;
  data: T;
};

export type BuildInfo = {
  version: string;
  commit: string;
  date: string;
  buildType: string;
  embeddedFrontend: boolean;
};

export type UpdateReleaseInfo = {
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
};

export type UpdateStatus = {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  cached: boolean;
  warning?: string;
  buildType: string;
  repository: string;
  updateEnabled: boolean;
  authorized: boolean;
  canInstall: boolean;
  canRollback: boolean;
  canRestart: boolean;
  message: string;
  currentActor: string;
  allowedSubjects?: string[];
  releaseInfo?: UpdateReleaseInfo;
  embeddedFrontend: boolean;
  backupAvailable: boolean;
};

export type UpdateActionResult = {
  message: string;
  needRestart?: boolean;
};

export async function getBuildInfo() {
  const { data } = await http.get<Envelope<BuildInfo>>('/system/build-info', {
    headers: {
      'X-Skip-Auth': 'true',
    },
  });
  return data.data;
}

export async function getUpdateStatus(force = false) {
  const { data } = await http.get<Envelope<UpdateStatus>>('/system/update-status', {
    params: force ? { force: 'true' } : undefined,
  });
  return data.data;
}

export async function performSystemUpdate() {
  const { data } = await http.post<Envelope<UpdateActionResult>>('/system/update', undefined, {
    timeout: longRunningActionTimeoutMs,
  });
  return data.data;
}

export async function rollbackSystemUpdate() {
  const { data } = await http.post<Envelope<UpdateActionResult>>('/system/rollback', undefined, {
    timeout: longRunningActionTimeoutMs,
  });
  return data.data;
}

export async function restartSystemService() {
  const { data } = await http.post<Envelope<UpdateActionResult>>('/system/restart');
  return data.data;
}
