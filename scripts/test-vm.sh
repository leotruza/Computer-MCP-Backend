#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-only
# Validate an existing VM for Computer-MCP without clicking, typing, or changing clipboard.
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
QUICK=0

usage() {
  cat <<'EOF'
Usage: scripts/test-vm.sh [--quick] [--project-dir DIR]

Run non-destructive checks for the documented Computer-MCP VM setup.
The script does not install packages, alter the desktop, move the pointer,
type text, click, or modify the clipboard.

Options:
  --quick            Skip npm build/tests and MCP discovery.
  --project-dir DIR Validate a different Computer-MCP checkout.
  -h, --help         Show this help.
EOF
}

PROJECT_DIR_DEFAULT="$PROJECT_DIR"
while (($#)); do
  case "$1" in
    --quick) QUICK=1; shift ;;
    --project-dir) [[ $# -ge 2 ]] || { echo "--project-dir requires a path" >&2; exit 2; }; PROJECT_DIR="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

pass=0
warn_count=0
fail_count=0
pass_check() { printf 'PASS  %s\n' "$*"; pass=$((pass + 1)); }
warn_check() { printf 'WARN  %s\n' "$*" >&2; warn_count=$((warn_count + 1)); }
fail_check() { printf 'FAIL  %s\n' "$*" >&2; fail_count=$((fail_count + 1)); }
need() { command -v "$1" >/dev/null 2>&1 && pass_check "command available: $1" || fail_check "missing command: $1"; }

printf '%s\n' "Computer-MCP VM validation" "Project: $PROJECT_DIR" ""
[[ "$(uname -s)" == "Linux" ]] && pass_check "Linux guest" || fail_check "This must run inside a Linux guest"
[[ "$EUID" -ne 0 ]] && pass_check "running as non-root desktop user" || fail_check "run as the same non-root user that owns the graphical session"
[[ -n "${DISPLAY:-}" ]] && pass_check "DISPLAY is set: $DISPLAY" || fail_check "DISPLAY is not set; run inside the VM's graphical X11 session"
[[ -z "${WAYLAND_DISPLAY:-}" ]] && pass_check "Wayland session variable is empty (X11 path)" || fail_check "WAYLAND_DISPLAY is set; this release requires an X11 session"

for tool in node npm ffmpeg xdotool xclip xrandr git; do need "$tool"; done
if command -v firefox >/dev/null 2>&1; then pass_check "Firefox available: $(command -v firefox)"; elif command -v firefox-esr >/dev/null 2>&1; then pass_check "Firefox available: $(command -v firefox-esr)"; else warn_check "Firefox is not installed; browser_start default Firefox cannot run"; fi
if command -v node >/dev/null 2>&1; then
  node_major="$(node --version | sed -E 's/^v([0-9]+).*/\1/')"
  [[ "$node_major" =~ ^[0-9]+$ ]] && (( node_major >= 20 )) && pass_check "Node.js 20+: $(node --version)" || fail_check "Node.js 20+ required; found $(node --version)"
fi
command -v mcpo >/dev/null 2>&1 && pass_check "MCPO available: $(command -v mcpo)" || warn_check "MCPO is not installed; install it separately to expose HTTP/OpenAPI endpoints"

if [[ -n "${DISPLAY:-}" ]] && command -v xrandr >/dev/null 2>&1; then
  if xrandr --query >/tmp/computer-mcp-xrandr.$$ 2>/dev/null && grep -q ' connected' /tmp/computer-mcp-xrandr.$$; then
    pass_check "X11 display is accessible and has a connected monitor"
  else
    fail_check "xrandr cannot access DISPLAY=$DISPLAY or no monitor is connected"
  fi
  rm -f /tmp/computer-mcp-xrandr.$$
fi

if [[ -n "${DISPLAY:-}" ]] && command -v ffmpeg >/dev/null 2>&1 && command -v xrandr >/dev/null 2>&1; then
  geometry="$(xrandr --query 2>/dev/null | sed -n 's/.* connected\( primary\)\? \([0-9][0-9]*x[0-9][0-9]*\)+.*/\2/p' | head -1)"
  if [[ -n "$geometry" ]] && ffmpeg -hide_banner -loglevel error -f x11grab -video_size "$geometry" -i "${DISPLAY}.0" -frames:v 1 -f null - >/dev/null 2>&1; then
    pass_check "X11 screenshot capture works (${geometry})"
  else
    fail_check "X11 screenshot capture failed"
  fi
fi

if [[ ! -f "$PROJECT_DIR/package.json" ]]; then
  fail_check "package.json not found in $PROJECT_DIR"
elif (( QUICK == 0 )); then
  (cd "$PROJECT_DIR" && npm run build) && pass_check "TypeScript build" || fail_check "TypeScript build failed"
  (cd "$PROJECT_DIR" && npm test) && pass_check "automated tests" || fail_check "automated tests failed"
  if [[ -f "$PROJECT_DIR/test/mcp-discovery.mjs" ]]; then
    (cd "$PROJECT_DIR" && node test/mcp-discovery.mjs) && pass_check "MCP tool discovery" || fail_check "MCP tool discovery failed"
  fi
else
  pass_check "project build/tests skipped (--quick)"
fi

printf '\nSummary: %d passed, %d warnings, %d failed\n' "$pass" "$warn_count" "$fail_count"
if (( fail_count > 0 )); then
  printf 'Result: NOT READY. Fix FAIL items and rerun this script.\n' >&2
  exit 1
fi
printf 'Result: READY for the documented X11 integration checks.\n'
printf 'Next: start MCPO as this same desktop user, then call computer_environment, computer_screen_size, and computer_screenshot.\n'
