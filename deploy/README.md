# Deploy

用于存放本项目的部署清单、Kubernetes YAML、Helm Chart 或后续交付配置。

## Demo 清单

- `demo/network-storage-demo.yaml`
  - 网络与存储模块的演示资源
  - 包含 `PV / PVC / Pod / Service / Ingress / demo-shadow IngressClass`
  - 不再手工创建 `IngressClass cilium`，避免与 Helm 管理的 Cilium Ingress Controller 冲突

- `demo/cilium-ingress-foundation.yaml`
  - 为本地 `10.0.0.0/24` 实验集群提供 Cilium Ingress 对外地址
  - 预留 `10.0.0.240-10.0.0.245` 作为 `LoadBalancer` 地址池
  - 通过 `enp2s0` 发布二层通告

- `demo/network-policy-demo.yaml`
  - 用独立的 `demo-network` 命名空间演示 NetworkPolicy
  - 包含 `default deny`、`allow client ingress`、`egress allow web + DNS` 三种经典策略
