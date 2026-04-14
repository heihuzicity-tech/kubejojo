export function buildRoleBindingRoute(namespace: string, name: string) {
  return `/security/rolebindings/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function roleBindingStatusColor(status: string) {
  switch (status) {
    case 'healthy':
      return 'green';
    case 'warning':
      return 'orange';
    case 'error':
      return 'red';
    default:
      return 'default';
  }
}
