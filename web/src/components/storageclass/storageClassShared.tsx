export function buildStorageClassRoute(name: string) {
  return `/storage/storageclasses/${encodeURIComponent(name)}`;
}

export function storageClassStatusColor(status: string) {
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
