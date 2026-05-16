#!/bin/bash
# One-command MCP update:
#   1. pulls the canonical checkout
#   2. installs MCP dependencies
#   3. configures nginx/certbot if needed
#   4. restarts PM2 clash-mcp
#   5. runs smoke checks
#
# Usage:
#   sudo bash /opt/clash/deploy/update-mcp.sh

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

echo "=== MCP Update ==="
echo "Source: $SOURCE_DIR"
echo "Branch: $BRANCH"

cd "$SOURCE_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

CLASH_SOURCE_DIR="$SOURCE_DIR" bash "$SOURCE_DIR/deploy/deploy-mcp.sh"
