#!/usr/bin/env bash
# One-command setup/update for the dedicated Clash Hermes VPS.
#
# Run on the Hermes VPS from a checked-out Clash repo:
#   sudo OPENROUTER_API_KEY=... HERMES_ORCHESTRATOR_TOKEN=... bash deploy/hermes/setup-vps.sh
#
# The script installs system dependencies, Hermes Agent, the Clash Hermes
# orchestrator, and a systemd service. It is idempotent and safe to re-run.

set -Eeuo pipefail
export PATH="/root/.local/bin:/usr/local/bin:$PATH"

ROOT="${CLASH_HERMES_ROOT:-/srv/clash-hermes}"
SHARED_DIR="$ROOT/shared"
ENV_FILE="${CLASH_HERMES_ENV_FILE:-$SHARED_DIR/orchestrator.env}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ORCH_SRC="${CLASH_HERMES_ORCHESTRATOR_SOURCE:-$REPO_DIR/hermes-orchestrator}"
ORCH_DIR="$ROOT/orchestrator/current"
SERVICE_NAME="${CLASH_HERMES_SERVICE_NAME:-clash-hermes-orchestrator}"
HOST="${CLASH_HERMES_ORCHESTRATOR_HOST:-127.0.0.1}"
PORT="${CLASH_HERMES_ORCHESTRATOR_PORT:-8600}"
PRIMARY_MODEL="${CLASH_HERMES_PRIMARY_MODEL:-openai/gpt-oss-20b:free}"
FALLBACK_MODEL="${CLASH_HERMES_FALLBACK_MODEL:-google/gemma-4-31b-it:free}"
MCP_URL="${CLASH_MCP_URL:-https://mcp.clashofperps.fun/mcp}"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Run as root/sudo."
}

dedupe_apt_sources() {
  local file="/etc/apt/sources.list.d/ubuntu-mirrors.list"
  [ -f "$file" ] || return 0
  local tmp
  tmp="$(mktemp)"
  awk '!seen[$0]++' "$file" > "$tmp"
  if ! cmp -s "$file" "$tmp"; then
    cp "$file" "$file.bak.$(date -u +%Y%m%d%H%M%S)"
    cat "$tmp" > "$file"
    log "Deduplicated $file"
  fi
  rm -f "$tmp"
}

install_system_dependencies() {
  log "Installing system dependencies..."
  dedupe_apt_sources
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl git jq nginx ufw ripgrep ffmpeg python3 python3-venv openssl rsync nodejs npm docker.io
  if apt-cache show docker-compose-plugin >/dev/null 2>&1; then
    apt-get install -y -qq docker-compose-plugin
  else
    log "docker-compose-plugin not available from current apt sources; continuing without it"
  fi
  systemctl enable --now docker >/dev/null 2>&1 || true
}

install_uv() {
  if command -v uv >/dev/null 2>&1; then
    log "uv already installed: $(uv --version)"
    return
  fi
  log "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="/root/.local/bin:$PATH"
  command -v uv >/dev/null 2>&1 || die "uv install failed"
}

install_hermes() {
  if command -v hermes >/dev/null 2>&1; then
    log "Hermes already installed: $(hermes --version 2>/dev/null || echo present)"
    return
  fi
  log "Installing Hermes Agent..."
  curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash
  export PATH="/root/.local/bin:$PATH"
  command -v hermes >/dev/null 2>&1 || die "Hermes install did not put hermes on PATH"
}

random_token() {
  openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped="${value//\\/\\\\}"
  escaped="${escaped//&/\\&}"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

ensure_env() {
  mkdir -p "$SHARED_DIR"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  local token="${HERMES_ORCHESTRATOR_TOKEN:-}"
  if [ -z "$token" ]; then
    token="$(grep '^HERMES_ORCHESTRATOR_TOKEN=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  fi
  if [ -z "$token" ] || [ "$token" = "replace-with-long-random-token" ]; then
    token="horg_$(random_token)"
  fi

  local openrouter="${OPENROUTER_API_KEY:-}"
  if [ -z "$openrouter" ]; then
    openrouter="$(grep '^OPENROUTER_API_KEY=' "$ENV_FILE" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
  fi
  [ -n "$openrouter" ] || die "OPENROUTER_API_KEY is required."

  set_env_value NODE_ENV production
  set_env_value CLASH_HERMES_ROOT "$ROOT"
  set_env_value CLASH_HERMES_ORCHESTRATOR_HOST "$HOST"
  set_env_value CLASH_HERMES_ORCHESTRATOR_PORT "$PORT"
  set_env_value HERMES_ORCHESTRATOR_TOKEN "$token"
  set_env_value OPENROUTER_API_KEY "$openrouter"
  set_env_value CLASH_HERMES_PROVIDER openrouter
  set_env_value CLASH_HERMES_PRIMARY_MODEL "$PRIMARY_MODEL"
  set_env_value CLASH_HERMES_FALLBACK_MODEL "$FALLBACK_MODEL"
  set_env_value CLASH_HERMES_FALLBACK_AFTER_RETRIES "${CLASH_HERMES_FALLBACK_AFTER_RETRIES:-2}"
  set_env_value CLASH_MCP_URL "$MCP_URL"
  set_env_value CLASH_HERMES_IDLE_SHUTDOWN_MS "${CLASH_HERMES_IDLE_SHUTDOWN_MS:-900000}"
  set_env_value CLASH_HERMES_PLAYER_PORT_START "${CLASH_HERMES_PLAYER_PORT_START:-8700}"
  set_env_value HERMES_BIN "${HERMES_BIN:-$(command -v hermes || echo hermes)}"

  log "Wrote $ENV_FILE"
}

install_orchestrator() {
  [ -f "$ORCH_SRC/package.json" ] || die "orchestrator source missing: $ORCH_SRC"
  mkdir -p "$ORCH_DIR" "$ROOT/state" "$ROOT/players" "$ROOT/logs"
  rsync -a --delete "$ORCH_SRC/" "$ORCH_DIR/"
  cd "$ORCH_DIR"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev
  else
    npm install --omit=dev
  fi
  npm run check
}

write_systemd_service() {
  log "Writing systemd service..."
  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<SERVICE
[Unit]
Description=Clash Hermes Orchestrator
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ORCH_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node $ORCH_DIR/src/server.mjs
Restart=always
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=$ROOT
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
SERVICE
  systemctl daemon-reload
  systemctl enable --now "$SERVICE_NAME"
}

configure_firewall() {
  if [ "${CLASH_HERMES_CONFIGURE_UFW:-1}" != "1" ]; then
    return
  fi
  ufw allow OpenSSH >/dev/null 2>&1 || true
  if [ "$HOST" = "0.0.0.0" ] || [ "$HOST" = "::" ]; then
    if [ -n "${CLASH_HERMES_BACKEND_CIDR:-}" ]; then
      ufw allow from "$CLASH_HERMES_BACKEND_CIDR" to any port "$PORT" proto tcp >/dev/null 2>&1 || true
    else
      log "HOST=$HOST but CLASH_HERMES_BACKEND_CIDR is empty; not opening port $PORT publicly."
    fi
  fi
  ufw --force enable >/dev/null 2>&1 || true
}

smoke_check() {
  log "Running health check..."
  sleep 3
  CLASH_HERMES_ORCHESTRATOR_PORT="$PORT" bash "$SCRIPT_DIR/healthcheck.sh"
}

main() {
  require_root
  log "=== Clash Hermes VPS setup ==="
  log "Root: $ROOT"
  log "Orchestrator source: $ORCH_SRC"
  install_system_dependencies
  install_uv
  install_hermes
  ensure_env
  install_orchestrator
  write_systemd_service
  configure_firewall
  smoke_check
  log "=== Hermes setup complete ==="
  echo "Service: systemctl status $SERVICE_NAME"
  echo "Logs:    journalctl -u $SERVICE_NAME -f"
  echo "Env:     $ENV_FILE"
}

main "$@"
