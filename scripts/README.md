# Scripts

用于存放本地开发、构建、检查和辅助脚本。

## 当前脚本

- `build-release.sh`
  - 先构建前端生产资源，并输出到 `server/internal/web/dist/app`
  - 再构建带 `release` BuildInfo 的后端二进制
  - 最后打包为版本化 `tar.gz` 并生成 `checksums.txt`
  - 同时更新 `server/dist/release/latest` 软链接，便于本地快速验证

常用示例：

```bash
./scripts/build-release.sh
GOOS=linux GOARCH=arm64 ./scripts/build-release.sh
VERSION=0.1.0 GOOS=linux GOARCH=amd64 ./scripts/build-release.sh
NPM_INSTALL_MODE=ci GOOS=linux GOARCH=amd64 ./scripts/build-release.sh
```
