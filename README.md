# kubejojo

基于 `React` 和 `Go` 的 Kubernetes 单集群企业级管理系统。

## 当前定位

- 当前定位：`单集群增强版`
- 设计基线：功能分组参考 `Headlamp`，页面体验参考 `Kubernetes Dashboard`
- 认证方式：`ServiceAccount Bearer Token`
- 运行形态：
  - `source`：前后端分离开发，前端由 `Vite` 提供
  - `release`：前端生产资源内嵌进后端二进制，由单一服务统一交付

当前产品覆盖：

- 统一资源导航
- 真实集群状态总览
- 资源列表与详情
- YAML 读写与常见运维动作
- 基于 `GitHub Releases` 的版本检查、安装、回滚和重启

## 当前技术栈

- 前端：`React 19`、`TypeScript`、`Vite`、`Ant Design`、`Ant Design Pro Components`、`TanStack Query`、`Zustand`、`Axios`、`Tailwind CSS`
- 后端：`Go`、`Gin`、`client-go`
- 实时能力：`WebSocket` 用于 `Pod Exec Terminal`

## 当前范围

- 资源域：
  - 集群
  - 资源全景图
  - 工作负载
  - 网络管理
  - 存储管理
  - 安全管理
  - 配置管理
  - 资源管理
  - 系统管理
- 当前已落地主线：
  - 登录页、演示模式与全局导航
  - `Overview`、`Namespaces`、`Nodes`
  - `Topology`
  - 工作负载、网络、存储、安全、配置、资源治理的大部分列表页与详情页
  - 多数资源的 YAML 查看与编辑
  - 常见资源删除与部分 YAML 创建
- 当前运维能力：
  - `Pods` 支持事件、日志、`describe`、`exec terminal`
  - 工作负载支持 `scale`、`restart`、`suspend`
  - `系统管理 / 更新管理` 支持构建信息查询、远端发布检查、安装更新、回滚和重启

更细的当前状态和产品边界见 [docs/产品方案与需求基线.md](docs/产品方案与需求基线.md)。

## 快速启动

### 后端

```bash
cd server
export KUBEJOJO_KUBECONFIG=/path/to/your/dev-kubeconfig
go run ./cmd/kubejojo
```

### 前端

```bash
cd web
npm install
npm run dev
```

默认地址：

- 前端：`http://127.0.0.1:5174`
- 后端：`http://127.0.0.1:8080`

说明：

- 后端会按以下顺序读取集群配置：
  - `KUBEJOJO_KUBECONFIG`
  - `KUBECONFIG`
  - `~/.kube/config`
- 前端开发代理会将 `/api` 请求转发到后端

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
VERSION=0.1.6 GOOS=linux GOARCH=amd64 ./scripts/build-release.sh
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

说明：

- `KUBEJOJO_UPDATE_ENABLED`
  - 是否启用在线更新入口
- `KUBEJOJO_UPDATE_ALLOW_PRERELEASES`
  - 是否允许检测和安装 `rc / beta / alpha` 预发布版本
- `KUBEJOJO_UPDATE_REPOSITORY`
  - GitHub Releases 仓库，默认 `heihuzicity-tech/kubejojo`
- `KUBEJOJO_UPDATE_ALLOWED_SUBJECTS`
  - 允许执行更新、回滚、重启的 Kubernetes 身份白名单，逗号分隔
- `KUBEJOJO_UPDATE_GITHUB_TOKEN`
  - 可选，用于提升 GitHub API 访问稳定性和速率限制配额
- `KUBEJOJO_UPDATE_TARGET_PATH`
  - 可选，显式指定受管二进制路径，便于 release 模式下准确执行更新和回滚

## GitHub Release

当前仓库已公开，可通过 tag 触发 `GitHub Release`。

- `CI`
  - 执行前端安装与生产构建
  - 执行后端 `go test ./...`
  - 执行一次 Linux release 打包校验
- `Release`
  - 通过 `v*` tag 触发
  - 默认产出：
    - `linux/amd64`
    - `linux/arm64`
    - `darwin/arm64`
  - 自动汇总 `checksums.txt`
  - 自动发布 GitHub Release

推荐发布方式：

```bash
git tag v0.1.6
git push origin v0.1.6
```

## 文档

- [产品方案与需求基线](docs/产品方案与需求基线.md)
- [开发与实验集群操作指南](docs/operation-guide.md)
