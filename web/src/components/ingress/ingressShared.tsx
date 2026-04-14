export function buildIngressRoute(namespace: string, name: string) {
  return `/network/ingresses/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function ingressStatusColor(status: string) {
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
