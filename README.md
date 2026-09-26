# Computer-MCP-Backend

Linux VM guest runtime for Computer-MCP. This repository contains the MCP server that performs desktop GUI, X11, shell/filesystem, and Selenium operations. It is intentionally separate from the host-side [Computer-MCP SSH proxy](https://github.com/leotruza/Computer-MCP).

## Requirements

The guest needs Linux, Node.js 20+, a logged-in X11 desktop session, Firefox, `ffmpeg`, `xdotool`, `xclip`, `xrandr`, Git, curl, and build tools. Wayland is detected but direct GUI capture/input is not implemented. Run the server as the same user that owns the X11 session.

On Debian/Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg xdotool xclip x11-xserver-utils git curl build-essential nodejs npm firefox-esr
```

The included `scripts/setup-vm.sh` installs exactly those APT packages, runs the project checks, and never creates or modifies a VM. Run it as the graphical user, not with `sudo` for the whole script. If the checkout is under `/opt` and was created by root, the helper uses `sudo chown -R` on that project directory so the current user can create `node_modules` and `dist`; subsequent `npm ci`, build, tests, and MCPO execution run without sudo. For Fedora/RHEL-like, Arch/Manjaro, openSUSE, and Alpine package equivalents, see the package table in this README and the man page.

| Distribution | Packages or command |
|---|---|
| Fedora/RHEL-like | `sudo dnf install ffmpeg-free xdotool xclip xrandr git curl gcc gcc-c++ make firefox nodejs npm` |
| Arch/Manjaro | `sudo pacman -S --needed ffmpeg xdotool xclip xorg-xrandr git curl base-devel firefox nodejs npm` |
| openSUSE | `sudo zypper install ffmpeg xdotool xclip xrandr git curl gcc gcc-c++ make firefox nodejs npm` |
| Alpine | `sudo apk add ffmpeg xdotool xclip xrandr git curl build-base firefox nodejs npm` |

Package availability and codec repositories vary; confirm names with the target distribution.

## Installation and validation

```bash
npm ci
npm run build
npm test
npm run lint
./scripts/test-vm.sh
```

The validator checks X11, required commands, Firefox, monitor access, FFmpeg capture, build, tests, and MCP discovery without moving the mouse or changing the clipboard. Use `./scripts/setup-vm.sh` for Debian/Ubuntu preparation.

## Run directly in the guest

```bash
node dist/index.js
```

The server uses MCP over stdio. It exposes 36 tools for screenshots, mouse, keyboard, clipboard, display information, shell/filesystem, and visible or headless Selenium browser automation. Use `scripts/benchmark-browsers.mjs` to compare installed Firefox-based candidates under the same workload.

## Run through the host proxy

On the host, configure the SSH proxy repository:

```bash
COMPUTER_MCP_SSH_TARGET=vmuser@192.168.122.50
COMPUTER_MCP_REMOTE_COMMAND='node /opt/computer-mcp-backend/dist/index.js'
```

The guest must accept the host SSH key and keep the X11 session active. The host proxy forwards MCP stdio only; all tool execution and browser state remain here in the guest.

## Security boundary

The VM is the execution boundary. Do not mount host filesystems, expose the host Docker socket, copy host browser profiles or credentials, or disable SSH host-key verification. The guest server does not implement host command execution, host filesystem access, hypervisor control, or VM escape mechanisms.

## License and AI notice

This project was generated with assistance from artificial intelligence and may contain errors or vulnerabilities. Review, test, and audit it before security-sensitive or production use.
