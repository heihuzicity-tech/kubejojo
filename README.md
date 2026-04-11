# K8s Admin

基于 `React` 和 `Go` 的 Kubernetes 单集群企业级管理系统。

## 当前定位

- 一期目标：`单集群增强版`
- 设计基线：功能分组参考 `Headlamp`，页面体验参考 `Kubernetes Dashboard`
- 接入方式：本机开发机启动前后端，使用 `ServiceAccount Bearer Token` 直连真实实验集群

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
export K8S_ADMIN_KUBECONFIG=/path/to/your/dev-kubeconfig
go run ./cmd/k8s-admin
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

## 文档

- [产品方案与需求基线](docs/产品方案与需求基线.md)
- [开发与实验集群操作指南](docs/operation-guide.md)
