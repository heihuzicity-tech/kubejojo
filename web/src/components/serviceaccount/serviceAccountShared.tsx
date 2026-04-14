export function buildServiceAccountRoute(namespace: string, name: string) {
  return `/security/serviceaccounts/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function serviceAccountStatusColor(status: string) {
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
