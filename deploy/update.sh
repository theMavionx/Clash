#!/bin/bash
# Pull the canonical source checkout, then run the atomic deploy script.
# The deploy script updates the frontend/API plus the remote MCP host:
#   https://mcp.clashofperps.fun/mcp
#
# MCP-only one-click update:
#   sudo bash /opt/clash/deploy/update-mcp.sh
#
# Production is intentionally anchored at /opt/clash:
#   /opt/clash/.git      canonical checkout
#   /opt/clash/current   live symlink
#   /opt/clash/releases  immutable releases
#   /opt/clash/shared    env + databases
#
# Godot web export is produced locally and uploaded into:
#   /opt/clash/web/public/godot

set -Eeuo pipefail

BRANCH="${CLASH_BRANCH:-main}"
SOURCE_DIR="${CLASH_SOURCE_DIR:-/opt/clash}"
DEPLOY_ROOT="${CLASH_DEPLOY_ROOT:-/opt/clash}"

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

echo "=== Atomic Update ==="
echo "Source: $SOURCE_DIR"
echo "Deploy root: $DEPLOY_ROOT"
echo "Branch: $BRANCH"

cd "$SOURCE_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

# web/public/godot is intentionally gitignored because the export is large.
# Normal flow: export Godot locally and upload it here before deploying.
if [ ! -f "$SOURCE_DIR/web/public/godot/Work.pck" ]; then
    if [ "${CLASH_REUSE_GODOT_EXPORT:-0}" = "1" ] && [ -f "$DEPLOY_ROOT/current/web/public/godot/Work.pck" ]; then
        echo "Source Godot export missing; reusing current live export."
        mkdir -p "$SOURCE_DIR/web/public"
        rsync -a --delete "$DEPLOY_ROOT/current/web/public/godot" "$SOURCE_DIR/web/public/"
    else
        echo "ERROR: source Godot export missing at web/public/godot/Work.pck" >&2
        echo "Export Godot locally and upload it to $SOURCE_DIR/web/public/godot before deploying." >&2
        echo "Set CLASH_REUSE_GODOT_EXPORT=1 only for backend/frontend-only emergency deploys." >&2
        exit 1
    fi
fi

exec bash "$SOURCE_DIR/deploy/deploy.sh"
