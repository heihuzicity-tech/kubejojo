export function buildConfigMapRoute(namespace: string, name: string) {
  return `/config/configmaps/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function configMapStatusColor(status: string) {
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
