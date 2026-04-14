export function buildServiceRoute(namespace: string, name: string) {
  return `/network/services/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function serviceStatusColor(status: string) {
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
