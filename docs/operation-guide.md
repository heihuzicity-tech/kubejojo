# Operation Guide

## Basic Access

- On `k8s-master`, root can use the cluster immediately:
  - `export KUBECONFIG=/etc/kubernetes/admin.conf`
  - `kubectl get nodes -o wide`
- Handy aliases configured for root:
  - `k`
  - `kgp`
  - `kgn`

## Core Commands

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl top nodes
kubectl top pods -A
kubectl describe node k8s-node1
kubectl get events -A --sort-by=.lastTimestamp | tail -n 100
```

## Cilium Operations

```bash
cilium status
cilium config view
cilium endpoint list
cilium service list
cilium bpf lb list
cilium sysdump
```

## Hubble Operations

```bash
cilium hubble port-forward &
hubble status
hubble observe --last 20
hubble observe --protocol http
```

## Storage Operations

```bash
kubectl get storageclass
kubectl get pvc,pv -A
kubectl describe storageclass local-path
```

## Metrics Operations

```bash
kubectl top nodes
kubectl top pods -A
kubectl get deployment -n kube-system metrics-server
```

## Troubleshooting

```bash
systemctl status containerd
systemctl status kubelet
journalctl -u kubelet -n 200 --no-pager
kubectl describe pod -n kube-system <pod-name>
kubectl logs -n kube-system <pod-name> --all-containers
cilium status --verbose
```

## Scale Out Worker

1. On `k8s-master`, generate a fresh join command:
   ```bash
   kubeadm token create --print-join-command
   ```
2. Run the printed command on the new worker with:
   ```bash
   --cri-socket unix:///run/containerd/containerd.sock
   ```
3. Verify:
   ```bash
   kubectl get nodes -o wide
   ```

## Reset and Rollback

```bash
kubeadm reset -f
rm -rf /etc/cni/net.d/*
rm -rf /var/lib/cni/*
rm -rf /var/lib/kubelet/*
rm -rf /etc/kubernetes/*
```

For Cilium cleanup:

```bash
cilium uninstall
```

Project helper script:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/reset-k8s-node.sh
```

## Graceful Shutdown

Graceful cluster shutdown helper:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/shutdown-k8s-cluster.sh
```

Optional poweroff after kubelet and containerd are stopped:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/shutdown-k8s-cluster.sh --poweroff
```

## Graceful Startup

Cluster startup helper after the VMs are already powered on and reachable:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/start-k8s-cluster.sh
```

Keep nodes cordoned after service recovery:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/start-k8s-cluster.sh --skip-uncordon
```

## Unified Control Entry

Single entrypoint for routine cluster operations:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh status
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh start
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh restart
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh stop
```

Examples:

```bash
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh start --skip-uncordon
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh restart
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh restart --skip-uncordon
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh stop --poweroff
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh status
```
