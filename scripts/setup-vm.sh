#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Prepare an existing Debian/Ubuntu VM for Computer-MCP.
# This script does not create, provision, virtualize, or modify a VM.
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHECK_ONLY=0
SKIP_BUILD=0
SKIP_NODE=0

usage() {
  cat <<'EOF'
Usage: scripts/setup-vm.sh [options]

Prepare an existing Debian/Ubuntu graphical VM for Computer-MCP.
The script must run inside the VM and never creates or configures the VM itself.

Options:
  --check-only       Do not install packages or run npm; only validate prerequisites.
  --skip-build       Install/check prerequisites but do not run npm ci/build/test.
  --skip-node        Do not install nodejs/npm through apt.
  --project-dir DIR Use an existing project directory instead of this checkout.
  -h, --help         Show this help.
EOF
}

log() { printf '\n[computer-mcp] %s\n' "$*"; }
warn() { printf '[computer-mcp] WARNING: %s\n' "$*" >&2; }
die() { printf '[computer-mcp] ERROR: %s\n' "$*" >&2; exit 1; }

while (($#)); do
  case "$1" in
    --check-only) CHECK_ONLY=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-node) SKIP_NODE=1; shift ;;
    --project-dir) [[ $# -ge 2 ]] || die "--project-dir requires a path"; PROJECT_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) die "Unknown option: $1 (use --help)" ;;
  esac
done

[[ "$(uname -s)" == "Linux" ]] || die "This script supports Linux guests only."
command -v apt-get >/dev/null 2>&1 || die "apt-get was not found. Use the package-manager equivalent for your distribution or run this script on Debian/Ubuntu."
[[ "${EUID}" -ne 0 ]] || die "Run as the graphical desktop user, not as root. The MCP process needs that user's X11 session."

if [[ -z "${DISPLAY:-}" ]]; then
  warn "DISPLAY is not set. Run this script from the VM's graphical X11 session, or use --check-only to inspect other prerequisites."
fi
if [[ -n "${WAYLAND_DISPLAY:-}" ]]; then
  warn "WAYLAND_DISPLAY is set. This project implements X11; select an X11 session such as GNOME on Xorg before using GUI tools."
fi

required_tools=(ffmpeg xdotool xclip xrandr git curl)
missing_tools=()
for tool in "${required_tools[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || missing_tools+=("$tool")
done

if (( CHECK_ONLY == 0 )); then
  log "Installing guest packages with apt-get (no VM or host changes are performed)."
  sudo -v || die "sudo authentication failed."
  sudo apt-get update
  packages=(ffmpeg xdotool xclip x11-xserver-utils git curl build-essential firefox-esr)
  if (( SKIP_NODE == 0 )); then packages+=(nodejs npm); fi
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
fi

for tool in "${required_tools[@]}"; do
  command -v "$tool" >/dev/null 2>&1 || missing_tools+=("$tool")
done
# Deduplicate the diagnostic list without requiring non-portable shell features.
if ((${#missing_tools[@]})); then
  unique_missing=()
  for tool in "${missing_tools[@]}"; do
    [[ " ${unique_missing[*]} " == *" $tool "* ]] || unique_missing+=("$tool")
  done
  die "Missing required commands: ${unique_missing[*]}. Install their guest packages, then rerun."
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  die "Node.js and npm are required. Install Node.js 20 or newer inside the VM."
fi
node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
[[ "$node_major" =~ ^[0-9]+$ ]] && (( node_major >= 20 )) || die "Node.js 20 or newer is required; found $(node --version)."

if [[ -n "${DISPLAY:-}" ]]; then
  xrandr --query >/dev/null 2>&1 || die "DISPLAY=$DISPLAY is not an accessible X11 display. Run from the logged-in graphical user session."
fi

if (( CHECK_ONLY == 0 && SKIP_BUILD == 0 )); then
  [[ -f "$PROJECT_DIR/package.json" ]] || die "No package.json found in $PROJECT_DIR. Use --project-dir with the project checkout."
  log "Installing Node dependencies with npm ci."
  (cd "$PROJECT_DIR" && npm ci)
  log "Building and testing Computer-MCP."
  (cd "$PROJECT_DIR" && npm run build && npm test && npm run lint)
fi

log "VM prerequisites are ready."
printf '%s\n' "  Node.js: $(node --version)" "  npm:     $(npm --version)" "  DISPLAY: ${DISPLAY:-unset}" "  Wayland: ${WAYLAND_DISPLAY:-unset}"
printf '\nNext steps:\n  1. Start MCPO as the same graphical user:\n     mcpo --host 127.0.0.1 --port 8084 -- node %q/dist/index.js\n' "$PROJECT_DIR"
printf '  2. Discover computer_environment, computer_screen_size, and computer_screenshot first.\n  3. Keep MCPO bound to loopback unless you have separately configured authentication and network access.\n'
