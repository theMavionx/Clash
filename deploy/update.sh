#!/bin/bash
# Pull the source checkout, then run the atomic deploy script.
#
# Production source checkout defaults to /home/bloxxdotfun/Clash. The live app
# is served from /opt/clash/current and should not be edited directly.

set -Eeuo pipefail

BRANCH="${CLASH_BRANCH:-main}"
SOURCE_DIR="${CLASH_SOURCE_DIR:-/home/bloxxdotfun/Clash}"
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
echo "Branch: $BRANCH"

cd "$SOURCE_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

# web/public/godot is intentionally gitignored because the export is large.
# If the source checkout lacks it, preserve the currently-live export so
# backend/frontend-only updates can still deploy without producing 404s.
if [ ! -f "$SOURCE_DIR/web/public/godot/Work.pck" ]; then
    if [ -f "$DEPLOY_ROOT/current/web/public/godot/Work.pck" ]; then
        echo "Source Godot export missing; reusing current live export."
        mkdir -p "$SOURCE_DIR/web/public"
        rsync -a --delete "$DEPLOY_ROOT/current/web/public/godot" "$SOURCE_DIR/web/public/"
    else
        echo "ERROR: source Godot export missing at web/public/godot/Work.pck" >&2
        echo "Export Godot locally and upload web/public/godot before deploying." >&2
        exit 1
    fi
fi

exec bash "$SOURCE_DIR/deploy/deploy.sh"
