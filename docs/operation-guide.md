# K8s Admin 开发与实验集群操作指南

## 1. 文档范围

- 本文档用于说明 `K8s Admin` 当前对接的本地实验集群信息、日常运维入口以及本机开发联调方式。
- 当前实验环境对应仓库：`/Users/zhangya/workspace/k8s-dev`
- 当前产品仓库：`/Users/zhangya/workspace/k8s-admin`

## 2. 实验集群概况

- 集群形态：`1` 个控制平面 + `2` 个工作节点
- Kubernetes 版本：`v1.35.3`
- 容器运行时：`containerd 2.2.1`
- 网络插件：`Cilium 1.19.2`
- 架构：`arm64`
- Pod CIDR：`10.244.0.0/16`
- Service CIDR：`10.96.0.0/12`
- `kube-proxy`：未部署，由 `Cilium` 替代
- 默认 `StorageClass`：`local-path`
- 已安装组件：
  - `Metrics Server`
  - `Hubble Relay`
  - `Hubble UI`
  - `local-path-provisioner`

## 3. 节点信息

| 角色 | 主机名 | IP |
| --- | --- | --- |
| 控制平面 | `k8s-master` | `10.0.0.101` |
| 工作节点 | `k8s-node1` | `10.0.0.102` |
| 工作节点 | `k8s-node2` | `10.0.0.103` |

## 4. 默认运维入口

优先使用统一入口脚本：

```bash
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh status
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh start
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh restart
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh stop
```

直接脚本入口：

```bash
/Users/zhangya/workspace/k8s-dev/scripts/start-k8s-cluster.sh
/Users/zhangya/workspace/k8s-dev/scripts/shutdown-k8s-cluster.sh
/Users/zhangya/workspace/k8s-dev/scripts/reset-k8s-node.sh
```

## 5. 集群基础访问

在控制平面节点上可直接使用：

```bash
ssh root@10.0.0.101
export KUBECONFIG=/etc/kubernetes/admin.conf
kubectl get nodes -o wide
```

控制平面节点 root 已配置常用别名：

- `k`
- `kgp`
- `kgn`

## 6. 本机开发机直连联调

### 6.1 kubeconfig 约束

后端启动时按以下顺序读取集群配置：

1. `K8S_ADMIN_KUBECONFIG`
2. `KUBECONFIG`
3. `~/.kube/config`

要求：

- 该 `kubeconfig` 中的 `apiserver` 地址必须能从本机开发机访问
- `certificate-authority-data` 或相关证书路径必须可用
- 该 `kubeconfig` 仅用于让后端连上目标集群，不等同于前端登录身份

### 6.2 启动后端

```bash
cd /Users/zhangya/workspace/k8s-admin/server
export K8S_ADMIN_KUBECONFIG=/path/to/your/dev-kubeconfig
go run ./cmd/k8s-admin
```

默认监听端口：

- `http://127.0.0.1:8080`

### 6.3 启动前端

```bash
cd /Users/zhangya/workspace/k8s-admin/web
npm install
npm run dev
```

默认访问地址：

- `http://127.0.0.1:5174`

说明：

- Vite 开发代理会将 `/api` 请求转发到 `http://127.0.0.1:8080`
- 如果你在 feature worktree 中开发，请将路径替换成对应 worktree 目录

### 6.4 登录真实集群

当前登录页使用 `ServiceAccount Bearer Token` 接入真实集群。

前端登录流程：

1. 打开 `http://127.0.0.1:5174`
2. 在登录页输入 `ServiceAccount Token`
3. 前端调用 `/api/v1/auth/login`
4. 后端校验 Token，并返回可访问命名空间与默认命名空间

说明：

- `演示模式` 只用于查看页面骨架
- 真实联调必须使用真实 Token

## 7. ServiceAccount Token 获取示例

仅用于实验环境的管理员 Token 示例：

```bash
kubectl create serviceaccount k8s-admin-dev -n kube-system
kubectl create clusterrolebinding k8s-admin-dev \
  --clusterrole=cluster-admin \
  --serviceaccount=kube-system:k8s-admin-dev
kubectl create token k8s-admin-dev -n kube-system
```

建议：

- 实验环境可以临时使用 `cluster-admin`
- 正式环境必须按最小权限原则绑定 `Role` 或 `ClusterRole`

## 8. 常用检查命令

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl top nodes
kubectl top pods -A
kubectl get events -A --sort-by=.lastTimestamp | tail -n 100
kubectl describe node k8s-node1
```

## 9. Cilium 与 Hubble

```bash
cilium status
cilium config view
cilium endpoint list
cilium service list
cilium bpf lb list
cilium sysdump
```

```bash
cilium hubble port-forward &
hubble status
hubble observe --last 20
hubble observe --protocol http
```

## 10. Metrics 与存储

### 10.1 Metrics

```bash
kubectl top nodes
kubectl top pods -A
kubectl get deployment -n kube-system metrics-server
kubectl get apiservice v1beta1.metrics.k8s.io
```

如需重新安装或校正 `metrics-server`：

```bash
kubectl apply -f /Users/zhangya/workspace/k8s-dev/manifests/addons/metrics-server.yaml
kubectl rollout status deployment/metrics-server -n kube-system
kubectl get apiservice v1beta1.metrics.k8s.io
```

说明：

- 当前环境使用仓库内维护的 `metrics-server` manifest
- 镜像已固定为 `registry.aliyuncs.com/google_containers/metrics-server:v0.8.1`
- 不建议在该实验环境直接回切默认上游镜像源

### 10.2 存储

```bash
kubectl get storageclass
kubectl get pvc,pv -A
kubectl describe storageclass local-path
```

## 11. 故障排查

```bash
systemctl status containerd
systemctl status kubelet
journalctl -u kubelet -n 200 --no-pager
kubectl describe pod -n kube-system <pod-name>
kubectl logs -n kube-system <pod-name> --all-containers
cilium status --verbose
```

## 12. 启停与恢复

### 12.1 平滑停机

```bash
/Users/zhangya/workspace/k8s-dev/scripts/shutdown-k8s-cluster.sh
```

停机后顺手关机：

```bash
/Users/zhangya/workspace/k8s-dev/scripts/shutdown-k8s-cluster.sh --poweroff
```

### 12.2 平滑启动

```bash
/Users/zhangya/workspace/k8s-dev/scripts/start-k8s-cluster.sh
```

恢复后先保持节点不可调度：

```bash
/Users/zhangya/workspace/k8s-dev/scripts/start-k8s-cluster.sh --skip-uncordon
```

### 12.3 统一入口

```bash
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh start --skip-uncordon
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh restart
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh restart --skip-uncordon
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh stop --poweroff
/Users/zhangya/workspace/k8s-dev/scripts/clusterctl.sh status
```

## 13. 节点扩容

1. 在 `k8s-master` 上生成新的 join 命令：

```bash
kubeadm token create --print-join-command
```

2. 在新节点执行生成的命令，并追加：

```bash
--cri-socket unix:///run/containerd/containerd.sock
```

3. 回控制平面验证：

```bash
kubectl get nodes -o wide
```

## 14. 节点重置与回滚

```bash
kubeadm reset -f
rm -rf /etc/cni/net.d/*
rm -rf /var/lib/cni/*
rm -rf /var/lib/kubelet/*
rm -rf /etc/kubernetes/*
```

清理 `Cilium`：

```bash
cilium uninstall
```

项目辅助脚本：

```bash
/Users/zhangya/workspace/k8s-dev/scripts/reset-k8s-node.sh
```

## 15. 当前已知说明

- 当前实验集群的一般验证项已通过：
  - 节点就绪
  - 核心系统 Pod 正常
  - `Cilium` 健康
  - DNS 解析正常
  - Service 路由正常
  - 跨节点 Pod 访问正常
  - `local-path` PVC 绑定正常
  - Metrics API 正常
- 当前残留说明：
  - `cilium connectivity test --test dns-only` 的部分子测试在该环境中表现异常，但普通外部 DNS 与 HTTP 访问是正常的
