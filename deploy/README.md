# Deploy

用于存放本项目的部署清单、Kubernetes YAML、Helm Chart 或后续交付配置。

## Release 托管

- `kubejojo.service`
  - `systemd` 单元模板
  - 面向 release 模式部署
  - 通过 `/etc/kubejojo/kubejojo.env` 覆盖部署环境变量
  - 为在线更新预留了 `Restart=always` 和可写工作目录前提

- `install.sh`
  - Linux 主机一键安装、升级、按版本回滚脚本
  - 基于 GitHub Releases 获取匹配平台的 `tar.gz` 资产
  - 安装到 `/opt/kubejojo`，并写入 `systemd` 服务与环境文件

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

- `demo/config-demo.yaml`
  - 用独立的 `demo-config` 命名空间演示 ConfigMaps / Secrets
  - 包含 `ConfigMap / Opaque Secret / dockerconfigjson Secret / Deployment`
  - 同时覆盖 `env`、`envFrom`、`configMap` 卷、`secret` 卷、`projected` 卷和 `imagePullSecrets` 引用

- `demo/security-demo.yaml`
  - 用独立的 `demo-security` 命名空间演示 ServiceAccounts / Roles / RoleBindings
  - 包含 `Opaque Secret / dockerconfigjson Secret / ServiceAccount / Role / RoleBinding / Deployment`
  - 同时覆盖 `secrets`、`imagePullSecrets`、`automountServiceAccountToken`、`ServiceAccount subjects`、`User/Group subjects`

- `demo/resource-governance-demo.yaml`
  - 用独立的 `demo-governance` 命名空间演示 HPA / ResourceQuota / LimitRange
  - 包含 `LimitRange / ResourceQuota / Deployment / HorizontalPodAutoscaler`
  - 同时覆盖 `min/max/default/defaultRequest`、`count/*` 配额、CPU/Memory utilization HPA 与 behavior 策略

- `demo/resource-governance-vpa-demo.yaml`
  - 用于补充演示 `VerticalPodAutoscaler`
  - 包含 `Deployment / VerticalPodAutoscaler`
  - 使用持续消耗 CPU / Memory 的 `python:3.12-alpine` 测试容器，便于在几分钟内观察 recommendation
  - 需要目标集群已安装 `VPA CRD` 与对应控制器，未安装时不要直接 apply
