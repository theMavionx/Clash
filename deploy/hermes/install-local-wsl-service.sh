#!/usr/bin/env bash
# Install a persistent local WSL systemd service for Clash Hermes.
#
# Run from Windows:
#   wsl -d Ubuntu -u root -- bash /mnt/c/.../deploy/hermes/install-local-wsl-service.sh

set -Eeuo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run as root in WSL." >&2; exit 1; }

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ORCH_DIR="$REPO_DIR/hermes-orchestrator"
SERVICE_NAME="${CLASH_HERMES_LOCAL_SERVICE:-clash-hermes-local}"
RUN_USER="${CLASH_HERMES_LOCAL_USER:-$(stat -c '%U' "$REPO_DIR")}"
RUN_HOME="$(getent passwd "$RUN_USER" | cut -d: -f6)"
ROOT_DIR="${CLASH_HERMES_ROOT:-$RUN_HOME/.clash-hermes-local}"
ENV_FILE="$ROOT_DIR/orchestrator.env"

die() { echo "ERROR: $*" >&2; exit 1; }
log() { echo "[$(date -u +%H:%M:%S)] $*"; }

[ -d "$RUN_HOME" ] || die "Cannot resolve home for $RUN_USER"
[ -f "$ORCH_DIR/src/server.mjs" ] || die "Missing orchestrator server: $ORCH_DIR"

command -v node >/dev/null 2>&1 || die "Linux node is missing in WSL"

read_env_value() {
  local key="$1"
  local file line value
  for file in "$REPO_DIR/.env" "$REPO_DIR/server/.env" "$REPO_DIR/web/.env"; do
    [ -f "$file" ] || continue
    while IFS= read -r line || [ -n "$line" ]; do
      line="${line%$'\r'}"
      line="${line#$'\xef\xbb\xbf'}"
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      if [[ "$line" =~ ^[[:space:]]*$key[[:space:]]*=(.*)$ ]]; then
        value="${BASH_REMATCH[1]}"
        value="${value#"${value%%[![:space:]]*}"}"
        value="${value%"${value##*[![:space:]]}"}"
        if [[ "$value" == \"*\" && "$value" == *\" ]]; then
          value="${value:1:${#value}-2}"
        elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
          value="${value:1:${#value}-2}"
        fi
        printf '%s' "$value"
        return 0
      fi
    done < "$file"
  done
  return 1
}

OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-$(read_env_value OPENROUTER_API_KEY || true)}"
HERMES_ORCHESTRATOR_TOKEN="${HERMES_ORCHESTRATOR_TOKEN:-$(read_env_value HERMES_ORCHESTRATOR_TOKEN || true)}"
HERMES_ORCHESTRATOR_TOKEN="${HERMES_ORCHESTRATOR_TOKEN:-$(read_env_value CLASH_HERMES_ORCHESTRATOR_TOKEN || true)}"
MODEL_CHAIN="${CLASH_HERMES_MODEL_CHAIN:-$(read_env_value CLASH_HERMES_MODEL_CHAIN || true)}"
PRIMARY_MODEL="${CLASH_HERMES_PRIMARY_MODEL:-$(read_env_value CLASH_HERMES_PRIMARY_MODEL || true)}"
FALLBACK_MODEL="${CLASH_HERMES_FALLBACK_MODEL:-$(read_env_value CLASH_HERMES_FALLBACK_MODEL || true)}"
WINDOWS_HOST_IP="${CLASH_WINDOWS_HOST_IP:-$(ip route show default 2>/dev/null | awk '{print $3; exit}')}"
[ -n "$WINDOWS_HOST_IP" ] || WINDOWS_HOST_IP="127.0.0.1"

[ -n "$OPENROUTER_API_KEY" ] || die "OPENROUTER_API_KEY missing"
[ -n "$HERMES_ORCHESTRATOR_TOKEN" ] || die "Hermes orchestrator token missing"

MODEL_CHAIN="${MODEL_CHAIN:-qwen/qwen3-30b-a3b-instruct-2507:nitro,google/gemma-4-26b-a4b-it:nitro}"
PRIMARY_MODEL="${PRIMARY_MODEL:-${MODEL_CHAIN%%,*}}"
FALLBACK_MODEL="${FALLBACK_MODEL:-$(echo "$MODEL_CHAIN" | cut -d, -f2)}"

mkdir -p "$ROOT_DIR" "$ROOT_DIR/logs" "$ROOT_DIR/state" "$ROOT_DIR/players"
cat > "$ENV_FILE" <<ENV
NODE_ENV=development
HOME=$RUN_HOME
PATH=$RUN_HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
CLASH_HERMES_ROOT=$ROOT_DIR
CLASH_HERMES_ORCHESTRATOR_HOST=0.0.0.0
CLASH_HERMES_ORCHESTRATOR_PORT=8600
HERMES_ORCHESTRATOR_TOKEN=$HERMES_ORCHESTRATOR_TOKEN
OPENROUTER_API_KEY=$OPENROUTER_API_KEY
CLASH_HERMES_PROVIDER=openrouter
CLASH_HERMES_MODEL_CHAIN=$MODEL_CHAIN
CLASH_HERMES_PRIMARY_MODEL=$PRIMARY_MODEL
CLASH_HERMES_FALLBACK_MODEL=$FALLBACK_MODEL
CLASH_HERMES_PRIMARY_RETRIES=${CLASH_HERMES_PRIMARY_RETRIES:-1}
CLASH_HERMES_FALLBACK_AFTER_RETRIES=${CLASH_HERMES_FALLBACK_AFTER_RETRIES:-1}
CLASH_HERMES_CHAT_TIMEOUT_MS=${CLASH_HERMES_CHAT_TIMEOUT_MS:-20000}
CLASH_HERMES_ACTION_PRIMARY_RETRIES=${CLASH_HERMES_ACTION_PRIMARY_RETRIES:-1}
CLASH_HERMES_ACTION_FALLBACK_RETRIES=${CLASH_HERMES_ACTION_FALLBACK_RETRIES:-1}
CLASH_HERMES_ACTION_CHAT_TIMEOUT_MS=${CLASH_HERMES_ACTION_CHAT_TIMEOUT_MS:-45000}
CLASH_HERMES_MODEL_CONTEXT_LENGTH=${CLASH_HERMES_MODEL_CONTEXT_LENGTH:-65536}
CLASH_MCP_URL=${CLASH_MCP_URL:-http://$WINDOWS_HOST_IP:4100/mcp}
CLASH_HERMES_IDLE_SHUTDOWN_MS=${CLASH_HERMES_IDLE_SHUTDOWN_MS:-900000}
CLASH_HERMES_PLAYER_PORT_START=${CLASH_HERMES_PLAYER_PORT_START:-8700}
HERMES_BIN=$RUN_HOME/.local/bin/hermes
ENV
chmod 600 "$ENV_FILE"
chown -R "$RUN_USER:$RUN_USER" "$ROOT_DIR"

cat > "/etc/systemd/system/$SERVICE_NAME.service" <<SERVICE
[Unit]
Description=Local Clash Hermes Orchestrator for WSL
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$ORCH_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $ORCH_DIR/src/server.mjs
Restart=always
RestartSec=2
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable "$SERVICE_NAME" >/dev/null
systemctl restart "$SERVICE_NAME"
sleep 2
systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'
log "Installed $SERVICE_NAME. Env: $ENV_FILE"
log "Hermes will call local Windows MCP at ${CLASH_MCP_URL:-http://$WINDOWS_HOST_IP:4100/mcp}. Start MCP on Windows with CLASH_MCP_HOST=0.0.0.0."
