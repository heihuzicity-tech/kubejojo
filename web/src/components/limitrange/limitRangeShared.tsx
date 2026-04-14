export function buildLimitRangeRoute(namespace: string, name: string) {
  return `/resources/limitranges/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function limitRangeStatusColor(status: string) {
  switch (status.toLowerCase()) {
    case 'healthy':
    case 'ready':
    case 'stable':
      return 'green';
    case 'warning':
    case 'scaling':
      return 'orange';
    case 'error':
    case 'failed':
      return 'red';
    default:
      return 'default';
  }
}
