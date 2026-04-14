export function buildPersistentVolumeClaimRoute(namespace: string, name: string) {
  return `/storage/persistentvolumeclaims/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function persistentVolumeClaimStatusColor(status: string) {
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
