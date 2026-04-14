export function buildResourceQuotaRoute(namespace: string, name: string) {
  return `/resources/resourcequotas/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function resourceQuotaStatusColor(status: string) {
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

export function resourceQuotaUsageColor(status?: string) {
  switch ((status ?? '').toLowerCase()) {
    case 'within':
      return 'green';
    case 'warning':
      return 'orange';
    case 'exceeded':
      return 'red';
    default:
      return 'default';
  }
}

export function formatResourceQuotaUsagePercent(usagePercent?: number | null) {
  if (usagePercent == null || !Number.isFinite(usagePercent)) {
    return undefined;
  }

  return `${Math.round(usagePercent)}%`;
}
