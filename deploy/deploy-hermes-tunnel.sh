#!/bin/bash
# Configure/update the main game production host so it can reach the dedicated
# Hermes VPS through a local SSH tunnel. Run this on the main game VPS.
#
# Usage:
#   sudo CLASH_HERMES_ORCHESTRATOR_TOKEN=horg_... bash /opt/clash/deploy/deploy-hermes-tunnel.sh

set -Eeuo pipefail

SOURCE_DIR="${CLASH_SOURCE_DIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SOURCE_DIR="$(readlink -f "$SOURCE_DIR")"

log() {
  echo "[$(date -u +%H:%M:%S)] $*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Run this script with sudo/root."
}

main() {
  require_root
  [ -f "$SOURCE_DIR/deploy/hermes/install-backend-tunnel.sh" ] || die "Tunnel script missing in $SOURCE_DIR"
  log "=== Clash Hermes backend tunnel deploy ==="
  log "Source: $SOURCE_DIR"
  bash "$SOURCE_DIR/deploy/hermes/install-backend-tunnel.sh"
  log "=== Hermes backend tunnel deploy complete ==="
}

main "$@"
