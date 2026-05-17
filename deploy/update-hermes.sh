#!/bin/bash
# One-command Hermes VPS update:
#   1. pulls the canonical checkout
#   2. installs/updates Hermes Agent runtime dependencies
#   3. installs/updates clash-hermes-orchestrator
#   4. restarts systemd service
#   5. runs health checks
#
# Usage on the dedicated Hermes VPS:
#   sudo OPENROUTER_API_KEY=... HERMES_ORCHESTRATOR_TOKEN=... bash /opt/clash/deploy/update-hermes.sh

set -Eeuo pipefail

BRANCH="${CLASH_BRANCH:-main}"
SOURCE_DIR="${CLASH_SOURCE_DIR:-/opt/clash}"

if [ ! -d "$SOURCE_DIR/.git" ]; then
  SCRIPT_ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
  if [ -d "$SCRIPT_ROOT/.git" ]; then
    SOURCE_DIR="$SCRIPT_ROOT"
  else
    echo "ERROR: source checkout not found at $SOURCE_DIR" >&2
    echo "Set CLASH_SOURCE_DIR=/path/to/Clash and run again." >&2
    exit 1
  fi
fi

echo "=== Hermes Update ==="
echo "Source: $SOURCE_DIR"
echo "Branch: $BRANCH"

cd "$SOURCE_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

CLASH_SOURCE_DIR="$SOURCE_DIR" bash "$SOURCE_DIR/deploy/deploy-hermes.sh"
