import { roleBindingStatusColor } from '../rolebinding/roleBindingShared';

export function buildClusterRoleBindingRoute(name: string) {
  return `/security/clusterrolebindings/${encodeURIComponent(name)}`;
}

export { roleBindingStatusColor as clusterRoleBindingStatusColor };
