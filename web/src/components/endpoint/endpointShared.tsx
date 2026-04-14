export function buildEndpointRoute(namespace: string, name: string) {
  return `/network/endpoints/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function endpointStatusColor(status: string) {
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
