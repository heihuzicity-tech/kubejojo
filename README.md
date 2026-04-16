# kubejojo

基于 `React` 和 `Go` 的 Kubernetes 单集群企业级管理系统。

## 当前定位

- 一期目标：`单集群增强版`
- 设计基线：功能分组参考 `Headlamp`，页面体验参考 `Kubernetes Dashboard`
- 接入方式：本机开发机启动前后端，使用 `ServiceAccount Bearer Token` 直连真实实验集群
- 运行形态：
  - `source`：前后端分离开发，前端由 `Vite` 提供
  - `release`：前端生产资源内嵌进后端二进制，由单一服务统一交付

## 当前技术栈

- 前端：`React`、`TypeScript`、`Vite`、`Ant Design`、`TanStack Query`、`Zustand`、`Axios`、`Tailwind CSS`
- 后端：`Go`、`Gin`、`client-go`

## 当前已落地

- 登录页已支持 `ServiceAccount Token` 接入
- 全局布局与左侧资源域导航已重构
- `Overview` 已接入真实集群摘要、告警和监控数据
- `Nodes` 已接入真实集群节点数据
- `Topology` 已接入真实集群资源关系数据

## 快速启动

后端：

```bash
cd server
export KUBEJOJO_KUBECONFIG=/path/to/your/dev-kubeconfig
go run ./cmd/kubejojo
```

前端：

```bash
cd web
npm install
npm run dev
```

默认地址：

- 前端：`http://127.0.0.1:5174`
- 后端：`http://127.0.0.1:8080`

## Release 构建

构建当前平台 release：

```bash
./scripts/build-release.sh
```

构建指定平台 release：

```bash
GOOS=linux GOARCH=arm64 ./scripts/build-release.sh
```

构建完成后输出位于：

- `server/dist/release/`

release 产物包含：

- 版本化 `tar.gz`
- `checksums.txt`
- 内嵌前端静态资源的 `kubejojo` 二进制
- `kubejojo.service`

查看二进制版本：

```bash
./server/dist/release/<package-dir>/kubejojo --version
```

在线更新相关环境变量：

```bash
KUBEJOJO_UPDATE_ENABLED=true
KUBEJOJO_UPDATE_REPOSITORY=heihuzicity-tech/kubejojo
KUBEJOJO_UPDATE_ALLOWED_SUBJECTS=system:serviceaccount:kube-system:kubejojo-dev
KUBEJOJO_UPDATE_GITHUB_TOKEN=<optional-github-token>
```

说明：

- `KUBEJOJO_UPDATE_ENABLED`
  - 是否启用在线更新入口
- `KUBEJOJO_UPDATE_REPOSITORY`
  - GitHub Releases 仓库，默认 `heihuzicity-tech/kubejojo`
- `KUBEJOJO_UPDATE_ALLOWED_SUBJECTS`
  - 允许执行更新、回滚、重启的 Kubernetes 身份白名单，逗号分隔
- `KUBEJOJO_UPDATE_GITHUB_TOKEN`
  - 可选，用于提升 GitHub API 访问稳定性和速率限制配额

## GitHub Release

仓库已预留 GitHub Actions 流程：

- `CI`
  - 执行前端 `npm ci`
  - 执行前端生产构建
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
git tag v0.1.0
git push origin v0.1.0
```

## 文档

- [产品方案与需求基线](docs/产品方案与需求基线.md)
- [开发与实验集群操作指南](docs/operation-guide.md)
