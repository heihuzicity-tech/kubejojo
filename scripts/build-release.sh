#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/web"
SERVER_DIR="$ROOT_DIR/server"
SERVICE_FILE="$ROOT_DIR/deploy/kubejojo.service"

VERSION_FILE="$SERVER_DIR/cmd/kubejojo/VERSION"
VERSION="${VERSION:-$(tr -d '[:space:]' < "$VERSION_FILE")}"
COMMIT="${COMMIT:-$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)}"
DATE="${DATE:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
GOOS="${GOOS:-$(go env GOOS)}"
GOARCH="${GOARCH:-$(go env GOARCH)}"

ASSET_OUT_DIR="$SERVER_DIR/internal/web/dist/app"
RELEASE_DIR="$SERVER_DIR/dist/release"
PACKAGE_STEM="kubejojo_${VERSION}_${GOOS}_${GOARCH}"
PACKAGE_DIR="$RELEASE_DIR/$PACKAGE_STEM"
ARCHIVE_PATH="$RELEASE_DIR/${PACKAGE_STEM}.tar.gz"
CHECKSUM_PATH="$RELEASE_DIR/checksums.txt"
LATEST_SYMLINK="$RELEASE_DIR/latest"

if [[ -z "$VERSION" ]]; then
  echo "VERSION is empty" >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  CHECKSUM_CMD=(sha256sum)
elif command -v shasum >/dev/null 2>&1; then
  CHECKSUM_CMD=(shasum -a 256)
else
  echo "Neither sha256sum nor shasum is available" >&2
  exit 1
fi

echo "==> Release build"
echo "Version:   $VERSION"
echo "Commit:    $COMMIT"
echo "Date:      $DATE"
echo "Platform:  $GOOS/$GOARCH"

if [[ "${SKIP_NPM_INSTALL:-0}" != "1" ]]; then
  echo "==> Installing frontend dependencies"
  NPM_INSTALL_MODE="${NPM_INSTALL_MODE:-install}"
  (
    cd "$WEB_DIR"
    npm "$NPM_INSTALL_MODE"
  )
fi

echo "==> Building frontend"
rm -rf "$ASSET_OUT_DIR"
mkdir -p "$ASSET_OUT_DIR"
(
  cd "$WEB_DIR"
  KUBEJOJO_WEB_OUT_DIR=../server/internal/web/dist/app npm run build
)

echo "==> Building backend"
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"
(
  cd "$SERVER_DIR"
  GOOS="$GOOS" GOARCH="$GOARCH" go build \
    -trimpath \
    -ldflags="-s -w -X 'main.Version=$VERSION' -X 'main.Commit=$COMMIT' -X 'main.Date=$DATE' -X 'main.BuildType=release'" \
    -o "$PACKAGE_DIR/kubejojo" \
    ./cmd/kubejojo
)

cp "$SERVICE_FILE" "$PACKAGE_DIR/kubejojo.service"

echo "==> Packaging release archive"
mkdir -p "$RELEASE_DIR"
rm -f "$ARCHIVE_PATH"
tar -C "$RELEASE_DIR" -czf "$ARCHIVE_PATH" "$PACKAGE_STEM"
ln -sfn "$PACKAGE_STEM" "$LATEST_SYMLINK"

echo "==> Writing checksum"
(
  cd "$RELEASE_DIR"
  "${CHECKSUM_CMD[@]}" "$(basename "$ARCHIVE_PATH")" > "$(basename "$CHECKSUM_PATH")"
)

echo "Release archive: $ARCHIVE_PATH"
echo "Checksums file:  $CHECKSUM_PATH"
