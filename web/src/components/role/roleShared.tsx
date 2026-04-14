export function buildRoleRoute(namespace: string, name: string) {
  return `/security/roles/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function roleStatusColor(status: string) {
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
