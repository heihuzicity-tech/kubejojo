import { roleStatusColor } from '../role/roleShared';

export function buildClusterRoleRoute(name: string) {
  return `/security/clusterroles/${encodeURIComponent(name)}`;
}

export { roleStatusColor as clusterRoleStatusColor };
