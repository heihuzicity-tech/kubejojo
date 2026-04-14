export function buildNetworkPolicyRoute(namespace: string, name: string) {
  return `/network/networkpolicies/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;
}

export function networkPolicyStatusColor(status: string) {
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
