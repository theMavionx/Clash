#!/bin/bash
# Deploy/update only the dedicated Clash Hermes VPS runtime.
#
# Usage on the Hermes VPS:
#   sudo OPENROUTER_API_KEY=... HERMES_ORCHESTRATOR_TOKEN=... bash /opt/clash/deploy/deploy-hermes.sh

set -Eeuo pipefail

SOURCE_DIR="${CLASH_SOURCE_DIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SOURCE_DIR="$(readlink -f "$SOURCE_DIR")"
HERMES_ROOT="${CLASH_HERMES_ROOT:-/srv/clash-hermes}"
HERMES_ENV_FILE="${CLASH_HERMES_ENV_FILE:-$HERMES_ROOT/shared/orchestrator.env}"

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
  [ -d "$SOURCE_DIR" ] || die "Source checkout not found: $SOURCE_DIR"
  [ -f "$SOURCE_DIR/hermes-orchestrator/src/server.mjs" ] || die "Hermes orchestrator source missing in $SOURCE_DIR"
  [ -f "$SOURCE_DIR/deploy/hermes/setup-vps.sh" ] || die "Hermes setup script missing in $SOURCE_DIR"

  log "=== Clash Hermes deploy ==="
  log "Source: $SOURCE_DIR"
  log "Runtime root: $HERMES_ROOT"
  log "Env file: $HERMES_ENV_FILE"

  CLASH_HERMES_ORCHESTRATOR_SOURCE="$SOURCE_DIR/hermes-orchestrator" \
  CLASH_HERMES_ROOT="$HERMES_ROOT" \
  CLASH_HERMES_ENV_FILE="$HERMES_ENV_FILE" \
    bash "$SOURCE_DIR/deploy/hermes/setup-vps.sh"

  log "=== Clash Hermes deploy complete ==="
}

main "$@"
