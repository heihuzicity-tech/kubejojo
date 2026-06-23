# kubejojo

面向企业内部运维场景的 Kubernetes 单集群管理控制台。

`kubejojo` 不是一个只看资源列表的 Demo。它把集群总览、资源拓扑、工作负载排障、YAML 运维、RBAC 资源、版本更新与回滚放在同一套控制台里，适合用于企业内部单集群的日常巡检、问题定位和轻量运维。

![kubejojo 集群总览](docs/assets/readme/overview.jpg)

## 核心亮点

| 能力 | 说明 |
| --- | --- |
| 单集群增强控制台 | 面向一个真实 Kubernetes 集群，避免多集群产品常见的重配置和重心分散。 |
| ServiceAccount Token 接入 | 使用 Kubernetes 原生身份与 RBAC，不自建第二套用户权限系统。 |
| 运维视角的信息架构 | 左侧按集群、拓扑、工作负载、网络、存储、安全、配置、资源治理、系统管理分组。 |
| 真实资源拓扑 | 从真实集群资源关系生成拓扑，支持命名空间切换、来源筛选、分组视图和异常标记。 |
| 排障入口集中 | Pod 详情内聚合状态、事件、日志、YAML、关联资源和 Web Terminal。 |
| YAML 读写与常见动作 | 支持多数资源的 YAML 查看、编辑、创建、删除，以及工作负载 scale、restart、suspend 等操作。 |
| 单二进制交付 | Release 模式下前端静态资源内嵌到 Go 后端二进制，由一个服务统一交付。 |
| 在线更新闭环 | 支持基于 GitHub Releases 的版本检查、安装、回滚和服务重启。 |

## 产品预览

### 资源拓扑

Topology 页面把工作负载、网络和存储资源放到同一个关系视图里，用异常标记帮助快速定位风险点。

![资源拓扑动图演示](docs/assets/readme/topology-demo.gif)

### 工作负载与详情

工作负载页面保留高密度列表、命名空间上下文、健康状态和资源指标。进入详情后可以继续查看匹配的 Pod、事件、日志、YAML 和关联资源。

| Pod 列表 | Deployment 详情 |
| --- | --- |
| ![Pod 列表](docs/assets/readme/pods.jpg) | ![Deployment 详情](docs/assets/readme/deployment-detail.jpg) |

### Pod 排障

Pod 详情页把日志、状态、事件和终端放在同一条排障路径里，避免在多个工具之间来回切换。

![Pod 排障动图演示](docs/assets/readme/pod-debug-demo.gif)

| 日志查看 | 交互式终端 |
| --- | --- |
| ![Pod 日志](docs/assets/readme/pod-logs.jpg) | ![Pod 终端](docs/assets/readme/pod-terminal.jpg) |

### 安全与系统管理

RBAC 资源可以按 ServiceAccount、Role、ClusterRole、Binding 维度查看和编辑。系统管理页提供版本状态、远端发布检测、安装、回滚和重启入口。

| ServiceAccounts | 更新管理 |
| --- | --- |
| ![ServiceAccounts](docs/assets/readme/serviceaccounts.jpg) | ![更新管理](docs/assets/readme/system-updates.jpg) |

## 功能范围

当前产品定位是 `单集群增强版`，覆盖以下资源域：

- 集群：`Overview`、`Namespaces`、`Nodes`
- 资源全景图：`Topology`
- 工作负载：`Pods`、`Deployments`、`StatefulSets`、`DaemonSets`、`ReplicaSets`、`Jobs`、`CronJobs`
- 网络管理：`Services`、`Endpoints`、`Ingresses`、`IngressClasses`、`NetworkPolicies`
- 存储管理：`PersistentVolumeClaims`、`PersistentVolumes`、`StorageClasses`
- 安全管理：`ServiceAccounts`、`Roles`、`ClusterRoles`、`RoleBindings`、`ClusterRoleBindings`
- 配置管理：`ConfigMaps`、`Secrets`
- 资源管理：`HPAs`、`VPAs`、`ResourceQuotas`、`LimitRanges`
- 系统管理：版本检查、更新安装、回滚、服务重启

当前已落地主线：

- 登录页、演示模式与全局导航
- 集群总览、命名空间、节点列表与详情
- 工作负载、网络、存储、安全、配置、资源治理的大部分列表页与详情页
- 多数资源的 YAML 查看与编辑
- 常见资源删除与部分 YAML 创建
- Pod 事件、日志、`describe`、Web Terminal
- 工作负载 `scale`、`restart`、`suspend`
- 基于 GitHub Releases 的在线更新、回滚和重启

更细的产品边界见 [产品方案与需求基线](docs/产品方案与需求基线.md)。

## 技术栈

- 前端：`React 19`、`TypeScript`、`Vite`、`Ant Design`、`Ant Design Pro Components`、`TanStack Query`、`Zustand`、`Axios`、`Tailwind CSS`
- 后端：`Go`、`Gin`、`client-go`
- 实时能力：`WebSocket` 用于 Pod Exec Terminal
- 交付方式：
  - `source`：前后端分离开发，前端由 Vite 提供
  - `release`：前端生产资源内嵌进后端二进制，由单一服务统一交付

## 快速启动

### 后端

```bash
cd server
export KUBEJOJO_KUBECONFIG=/path/to/your/dev-kubeconfig
go run ./cmd/kubejojo
```

默认监听：

- 后端：`http://127.0.0.1:8080`

后端会按以下顺序读取集群配置：

1. `KUBEJOJO_KUBECONFIG`
2. `KUBECONFIG`
3. `~/.kube/config`

### 前端

```bash
cd web
npm install
npm run dev
```

默认访问：

- 前端：`http://127.0.0.1:5174`

说明：

- 前端开发代理会将 `/api` 请求转发到后端。
- 登录真实集群时需要输入 `ServiceAccount Bearer Token`。
- 只想查看页面骨架时，可以使用演示模式。

## ServiceAccount Token 示例

实验环境可以用下面的方式快速创建管理员 Token：

```bash
kubectl create serviceaccount kubejojo-dev -n kube-system
kubectl create clusterrolebinding kubejojo-dev \
  --clusterrole=cluster-admin \
  --serviceaccount=kube-system:kubejojo-dev
kubectl create token kubejojo-dev -n kube-system
```

正式环境建议按最小权限原则绑定 `Role` 或 `ClusterRole`，不要直接使用 `cluster-admin`。

## Release 构建

构建当前平台 release：

```bash
./scripts/build-release.sh
```

构建指定平台 release：

```bash
GOOS=linux GOARCH=arm64 ./scripts/build-release.sh
```

常见可选参数：

```bash
VERSION=0.1.1 GOOS=linux GOARCH=amd64 ./scripts/build-release.sh
NPM_INSTALL_MODE=ci GOOS=linux GOARCH=amd64 ./scripts/build-release.sh
SKIP_NPM_INSTALL=1 ./scripts/build-release.sh
```

构建完成后输出位于：

- `server/dist/release/`

release 产物包含：

- 版本化 `tar.gz`
- `checksums.txt`
- 内嵌前端静态资源的 `kubejojo` 二进制
- `kubejojo.service`
- `latest` 软链接

查看二进制版本：

```bash
./server/dist/release/<package-dir>/kubejojo --version
```

## 在线更新配置

启用在线更新相关环境变量：

```bash
KUBEJOJO_UPDATE_ENABLED=true
KUBEJOJO_UPDATE_ALLOW_PRERELEASES=true
KUBEJOJO_UPDATE_REPOSITORY=heihuzicity-tech/kubejojo
KUBEJOJO_UPDATE_ALLOWED_SUBJECTS=system:serviceaccount:kube-system:kubejojo-dev
KUBEJOJO_UPDATE_GITHUB_TOKEN=<optional-github-token>
KUBEJOJO_UPDATE_TARGET_PATH=<optional-installed-binary-path>
```

配置说明：

| 环境变量 | 说明 |
| --- | --- |
| `KUBEJOJO_UPDATE_ENABLED` | 是否启用在线更新入口。 |
| `KUBEJOJO_UPDATE_ALLOW_PRERELEASES` | 是否允许检测和安装 `rc`、`beta`、`alpha` 预发布版本。 |
| `KUBEJOJO_UPDATE_REPOSITORY` | GitHub Releases 仓库，默认 `heihuzicity-tech/kubejojo`。 |
| `KUBEJOJO_UPDATE_ALLOWED_SUBJECTS` | 允许执行更新、回滚、重启的 Kubernetes 身份白名单，逗号分隔。 |
| `KUBEJOJO_UPDATE_GITHUB_TOKEN` | 可选，用于提升 GitHub API 访问稳定性和速率限制配额。 |
| `KUBEJOJO_UPDATE_TARGET_PATH` | 可选，显式指定受管二进制路径，便于 release 模式下准确执行更新和回滚。 |

## GitHub Release

仓库可通过 `v*` tag 触发 GitHub Release。

- `CI`
  - 执行前端安装与生产构建
  - 执行后端 `go test ./...`
  - 执行一次 Linux release 打包校验
- `Release`
  - 通过 `v*` tag 触发
  - 默认产出 `linux/amd64`、`linux/arm64`、`darwin/arm64`
  - 自动汇总 `checksums.txt`
  - 自动发布 GitHub Release

推荐发布方式：

```bash
git tag v0.1.1
git push origin v0.1.1
```

## 项目结构

```text
kubejojo
├── docs/                 # 产品边界、操作指南和 README 截图素材
├── scripts/              # release 构建脚本
├── server/               # Go 后端、Kubernetes client、更新服务、静态资源嵌入
└── web/                  # React 前端控制台
```

## 文档

- [产品方案与需求基线](docs/产品方案与需求基线.md)
- [开发与实验集群操作指南](docs/operation-guide.md)
