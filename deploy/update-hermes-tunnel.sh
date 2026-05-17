#!/bin/bash
# One-command update for the main game production host's Hermes tunnel config.
# This pulls the repo and runs deploy-hermes-tunnel.sh.
#
# Usage on the main game VPS:
#   sudo CLASH_HERMES_ORCHESTRATOR_TOKEN=horg_... bash /opt/clash/deploy/update-hermes-tunnel.sh

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

echo "=== Hermes Tunnel Update ==="
echo "Source: $SOURCE_DIR"
echo "Branch: $BRANCH"

cd "$SOURCE_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

CLASH_SOURCE_DIR="$SOURCE_DIR" bash "$SOURCE_DIR/deploy/deploy-hermes-tunnel.sh"
