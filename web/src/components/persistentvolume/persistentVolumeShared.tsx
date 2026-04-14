export function buildPersistentVolumeRoute(name: string) {
  return `/storage/persistentvolumes/${encodeURIComponent(name)}`;
}

export function persistentVolumeStatusColor(status: string) {
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
