export function buildSecretRoute(namespace: string, name: string) {
  return `/config/secrets/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function secretStatusColor(status: string) {
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
