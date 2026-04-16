#!/usr/bin/env bash

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

GITHUB_REPO="${GITHUB_REPO:-heihuzicity-tech/kubejojo}"
INSTALL_DIR="${INSTALL_DIR:-/opt/kubejojo}"
SERVICE_NAME="${SERVICE_NAME:-kubejojo}"
SERVICE_USER="${SERVICE_USER:-kubejojo}"
CONFIG_DIR="${CONFIG_DIR:-/etc/kubejojo}"
ENV_FILE="${ENV_FILE:-$CONFIG_DIR/kubejojo.env}"
SYSTEMD_UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
DEFAULT_HTTP_ADDR="${DEFAULT_HTTP_ADDR:-:8080}"
DEFAULT_KUBECONFIG_SOURCE="${DEFAULT_KUBECONFIG_SOURCE:-/etc/kubernetes/admin.conf}"
INSTALLED_KUBECONFIG="${INSTALL_DIR}/config/kubeconfig"

OS=""
ARCH=""
CHECKSUM_CMD=()
TEMP_DIR=""
PACKAGE_DIR=""

print_info() {
  printf "${BLUE}==>${NC} %s\n" "$1"
}

print_success() {
  printf "${GREEN}==>${NC} %s\n" "$1"
}

print_warning() {
  printf "${YELLOW}==>${NC} %s\n" "$1"
}

print_error() {
  printf "${RED}==>${NC} %s\n" "$1" >&2
}

cleanup() {
  if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR:-}" ]]; then
    rm -rf "$TEMP_DIR"
  fi
}

trap cleanup EXIT

usage() {
  cat <<EOF
Usage:
  install.sh install
  install.sh upgrade
  install.sh rollback <version>
  install.sh install-version <version>
  install.sh list-versions
  install.sh uninstall

Environment overrides:
  GITHUB_REPO               GitHub repository, default: ${GITHUB_REPO}
  HTTP_ADDR_VALUE           Listen address, default: ${DEFAULT_HTTP_ADDR}
  KUBECONFIG_SOURCE         Source kubeconfig to copy into ${INSTALLED_KUBECONFIG}
  KUBEJOJO_ENABLE_UPDATE    Write KUBEJOJO_UPDATE_ENABLED=true to ${ENV_FILE}
  KUBEJOJO_ALLOW_PRERELEASES
                            Write KUBEJOJO_UPDATE_ALLOW_PRERELEASES=true to ${ENV_FILE}
  KUBEJOJO_UPDATE_SUBJECTS  Comma-separated update subjects to write to ${ENV_FILE}
  KUBEJOJO_GITHUB_TOKEN     Write KUBEJOJO_UPDATE_GITHUB_TOKEN to ${ENV_FILE}
EOF
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    print_error "Please run this script as root."
    exit 1
  fi
}

detect_platform() {
  case "$(uname -s)" in
    Linux) OS="linux" ;;
    *)
      print_error "Unsupported operating system: $(uname -s). Linux with systemd is required."
      exit 1
      ;;
  esac

  case "$(uname -m)" in
    x86_64|amd64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *)
      print_error "Unsupported CPU architecture: $(uname -m)."
      exit 1
      ;;
  esac

  if ! command -v systemctl >/dev/null 2>&1; then
    print_error "systemctl is required."
    exit 1
  fi
}

select_checksum_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then
    CHECKSUM_CMD=(sha256sum)
    return
  fi
  if command -v shasum >/dev/null 2>&1; then
    CHECKSUM_CMD=(shasum -a 256)
    return
  fi
  print_error "Neither sha256sum nor shasum is available."
  exit 1
}

check_dependencies() {
  local missing=()

  for cmd in curl tar systemctl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done

  if [[ "${#missing[@]}" -gt 0 ]]; then
    print_error "Missing dependencies: ${missing[*]}"
    exit 1
  fi
}

normalize_version() {
  local version="$1"
  if [[ -z "$version" ]]; then
    print_error "Version is required."
    exit 1
  fi
  if [[ "$version" != v* ]]; then
    version="v${version}"
  fi
  printf '%s' "$version"
}

fetch_latest_version() {
  local latest
  latest="$(curl -fsSL --connect-timeout 10 --max-time 30 "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
    | grep '"tag_name"' \
    | sed -E 's/.*"([^"]+)".*/\1/' \
    | head -n1)"

  if [[ -z "$latest" ]]; then
    print_error "Failed to fetch the latest release from GitHub."
    exit 1
  fi

  printf '%s' "$latest"
}

list_versions() {
  print_info "Fetching available versions from GitHub Releases"
  local versions
  versions="$(curl -fsSL --connect-timeout 10 --max-time 30 "https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20" \
    | grep '"tag_name"' \
    | sed -E 's/.*"([^"]+)".*/\1/' \
    | head -20)"

  if [[ -z "$versions" ]]; then
    print_error "Failed to fetch releases."
    exit 1
  fi

  printf '%s\n' "$versions"
}

validate_version() {
  local version
  version="$(normalize_version "$1")"

  local http_code
  http_code="$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 --max-time 30 \
    "https://api.github.com/repos/${GITHUB_REPO}/releases/tags/${version}")"
  if [[ "$http_code" != "200" ]]; then
    print_error "Version ${version} was not found in GitHub Releases."
    exit 1
  fi

  printf '%s' "$version"
}

download_and_extract() {
  local version="$1"
  local version_num="${version#v}"
  local archive_name="kubejojo_${version_num}_${OS}_${ARCH}.tar.gz"
  local download_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/${archive_name}"
  local checksum_url="https://github.com/${GITHUB_REPO}/releases/download/${version}/checksums.txt"

  TEMP_DIR="$(mktemp -d)"
  print_info "Downloading ${archive_name}"
  curl -fL --connect-timeout 10 --max-time 600 "$download_url" -o "${TEMP_DIR}/${archive_name}"

  print_info "Verifying checksum"
  curl -fL --connect-timeout 10 --max-time 60 "$checksum_url" -o "${TEMP_DIR}/checksums.txt"
  local expected actual
  expected="$(awk -v target="$archive_name" '$2 == target { print $1 }' "${TEMP_DIR}/checksums.txt")"
  if [[ -z "$expected" ]]; then
    print_error "Could not find ${archive_name} in checksums.txt."
    exit 1
  fi
  actual="$("${CHECKSUM_CMD[@]}" "${TEMP_DIR}/${archive_name}" | awk '{print $1}')"
  if [[ "$expected" != "$actual" ]]; then
    print_error "Checksum mismatch for ${archive_name}."
    print_error "Expected: ${expected}"
    print_error "Actual:   ${actual}"
    exit 1
  fi

  print_info "Extracting release package"
  tar -xzf "${TEMP_DIR}/${archive_name}" -C "${TEMP_DIR}"
  PACKAGE_DIR="$(find "${TEMP_DIR}" -mindepth 1 -maxdepth 1 -type d -name "kubejojo_${version_num}_*" | head -n1)"
  if [[ -z "$PACKAGE_DIR" || ! -d "$PACKAGE_DIR" ]]; then
    print_error "Release archive layout is invalid."
    exit 1
  fi
}

ensure_service_user() {
  if id "$SERVICE_USER" >/dev/null 2>&1; then
    return
  fi

  print_info "Creating service user ${SERVICE_USER}"
  useradd -r -s /bin/sh -d "$INSTALL_DIR" "$SERVICE_USER"
}

ensure_directories() {
  mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/config" "$CONFIG_DIR"
  chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"
}

stop_service_if_running() {
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    print_info "Stopping ${SERVICE_NAME}"
    systemctl stop "$SERVICE_NAME"
  fi
}

backup_current_binary() {
  if [[ -f "${INSTALL_DIR}/kubejojo" ]]; then
    cp "${INSTALL_DIR}/kubejojo" "${INSTALL_DIR}/kubejojo.backup"
    chown "$SERVICE_USER:$SERVICE_USER" "${INSTALL_DIR}/kubejojo.backup"
  fi
}

copy_kubeconfig() {
  local source_path="$1"

  if [[ -z "$source_path" ]]; then
    if [[ -f "$INSTALLED_KUBECONFIG" ]]; then
      print_info "Keeping existing kubeconfig at ${INSTALLED_KUBECONFIG}"
      return
    fi
    print_warning "No kubeconfig source provided. The service will need ${INSTALLED_KUBECONFIG} before it can connect to a cluster."
    return
  fi

  if [[ ! -f "$source_path" ]]; then
    if [[ -f "$INSTALLED_KUBECONFIG" ]]; then
      print_warning "Kubeconfig source ${source_path} does not exist. Keeping the existing installed kubeconfig."
      return
    fi
    print_warning "Kubeconfig source ${source_path} does not exist. You must place a kubeconfig at ${INSTALLED_KUBECONFIG} manually."
    return
  fi

  print_info "Installing kubeconfig from ${source_path}"
  install -m 0600 "$source_path" "$INSTALLED_KUBECONFIG"
  chown "$SERVICE_USER:$SERVICE_USER" "$INSTALLED_KUBECONFIG"
}

prompt_value() {
  local prompt="$1"
  local default_value="$2"
  local result="$default_value"

  if [[ -t 0 && -t 1 ]]; then
    read -r -p "${prompt} [${default_value}]: " input < /dev/tty || true
    if [[ -n "${input:-}" ]]; then
      result="$input"
    fi
  fi

  printf '%s' "$result"
}

write_env_file() {
  local http_addr="$1"

  cat > "$ENV_FILE" <<EOF
HTTP_ADDR=${http_addr}
KUBEJOJO_KUBECONFIG=${INSTALLED_KUBECONFIG}
# KUBEJOJO_UPDATE_ENABLED=true
# KUBEJOJO_UPDATE_ALLOW_PRERELEASES=true
# KUBEJOJO_UPDATE_REPOSITORY=${GITHUB_REPO}
# KUBEJOJO_UPDATE_ALLOWED_SUBJECTS=system:serviceaccount:kube-system:kubejojo-admin
# KUBEJOJO_UPDATE_GITHUB_TOKEN=
EOF

  if [[ "${KUBEJOJO_ENABLE_UPDATE:-}" == "true" ]]; then
    printf 'KUBEJOJO_UPDATE_ENABLED=true\n' >> "$ENV_FILE"
    printf 'KUBEJOJO_UPDATE_REPOSITORY=%s\n' "$GITHUB_REPO" >> "$ENV_FILE"
  fi
  if [[ "${KUBEJOJO_ALLOW_PRERELEASES:-}" == "true" ]]; then
    printf 'KUBEJOJO_UPDATE_ALLOW_PRERELEASES=true\n' >> "$ENV_FILE"
  fi
  if [[ -n "${KUBEJOJO_UPDATE_SUBJECTS:-}" ]]; then
    printf 'KUBEJOJO_UPDATE_ALLOWED_SUBJECTS=%s\n' "$KUBEJOJO_UPDATE_SUBJECTS" >> "$ENV_FILE"
  fi
  if [[ -n "${KUBEJOJO_GITHUB_TOKEN:-}" ]]; then
    printf 'KUBEJOJO_UPDATE_GITHUB_TOKEN=%s\n' "$KUBEJOJO_GITHUB_TOKEN" >> "$ENV_FILE"
  fi
}

install_service_unit() {
  local service_source="${PACKAGE_DIR}/kubejojo.service"
  if [[ ! -f "$service_source" ]]; then
    print_error "Service template is missing from the release package."
    exit 1
  fi

  install -m 0644 "$service_source" "$SYSTEMD_UNIT_PATH"
  systemctl daemon-reload
}

install_release() {
  local version="$1"
  local mode="$2"

  download_and_extract "$version"
  ensure_service_user
  ensure_directories
  stop_service_if_running
  backup_current_binary

  print_info "Installing kubejojo ${version}"
  install -m 0755 "${PACKAGE_DIR}/kubejojo" "${INSTALL_DIR}/kubejojo"
  chown "$SERVICE_USER:$SERVICE_USER" "${INSTALL_DIR}/kubejojo"
  if [[ -f "${PACKAGE_DIR}/install.sh" ]]; then
    install -m 0755 "${PACKAGE_DIR}/install.sh" "${INSTALL_DIR}/install.sh"
  fi
  install_service_unit

  local http_addr="${HTTP_ADDR_VALUE:-}"
  local kubeconfig_source="${KUBECONFIG_SOURCE:-}"

  if [[ "$mode" == "install" ]]; then
    if [[ -z "$http_addr" ]]; then
      http_addr="$(prompt_value "HTTP listen address" "$DEFAULT_HTTP_ADDR")"
    fi
    if [[ -z "$kubeconfig_source" ]]; then
      kubeconfig_source="$(prompt_value "Source kubeconfig path" "$DEFAULT_KUBECONFIG_SOURCE")"
    fi
    write_env_file "$http_addr"
    copy_kubeconfig "$kubeconfig_source"
  else
    if [[ ! -f "$ENV_FILE" ]]; then
      if [[ -z "$http_addr" ]]; then
        http_addr="$DEFAULT_HTTP_ADDR"
      fi
      write_env_file "$http_addr"
    fi
    copy_kubeconfig "$kubeconfig_source"
  fi

  chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

  print_info "Starting ${SERVICE_NAME}"
  systemctl start "$SERVICE_NAME"
  systemctl enable "$SERVICE_NAME" >/dev/null 2>&1 || true

  print_success "kubejojo ${version} is installed."
  print_info "Service status: systemctl status ${SERVICE_NAME} --no-pager"
  print_info "Logs: journalctl -u ${SERVICE_NAME} -f"
}

uninstall_release() {
  print_warning "This will remove ${SERVICE_NAME} from the host."
  stop_service_if_running || true
  systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
  rm -f "$SYSTEMD_UNIT_PATH"
  systemctl daemon-reload
  rm -rf "$INSTALL_DIR"
  print_warning "Configuration in ${CONFIG_DIR} is preserved."
  print_success "${SERVICE_NAME} has been removed."
}

main() {
  local action="${1:-install}"

  case "$action" in
    help|-h|--help)
      usage
      ;;
    list-versions)
      detect_platform
      check_dependencies
      list_versions
      ;;
    install)
      require_root
      detect_platform
      check_dependencies
      select_checksum_cmd
      install_release "$(fetch_latest_version)" "install"
      ;;
    upgrade|update)
      require_root
      detect_platform
      check_dependencies
      select_checksum_cmd
      install_release "$(fetch_latest_version)" "upgrade"
      ;;
    rollback)
      if [[ $# -lt 2 ]]; then
        print_error "rollback requires a version argument."
        usage
        exit 1
      fi
      require_root
      detect_platform
      check_dependencies
      select_checksum_cmd
      install_release "$(validate_version "$2")" "rollback"
      ;;
    install-version)
      if [[ $# -lt 2 ]]; then
        print_error "install-version requires a version argument."
        usage
        exit 1
      fi
      require_root
      detect_platform
      check_dependencies
      select_checksum_cmd
      install_release "$(validate_version "$2")" "upgrade"
      ;;
    uninstall)
      require_root
      detect_platform
      check_dependencies
      uninstall_release
      ;;
    *)
      print_error "Unknown action: ${action}"
      usage
      exit 1
      ;;
  esac
}

main "$@"
