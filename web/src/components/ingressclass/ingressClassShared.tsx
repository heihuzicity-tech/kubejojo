export function buildIngressClassRoute(name: string) {
  return `/network/ingressclasses/${encodeURIComponent(name)}`;
}

export function ingressClassStatusColor(status: string) {
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
