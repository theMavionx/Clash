#!/usr/bin/env bash
# Local WSL setup for Clash Hermes AI chat.
#
# Run from WSL at the repo root:
#   bash deploy/hermes/setup-local-wsl.sh
#
# The script intentionally avoids the production VPS bootstrap. For local
# Windows + WSL development we only need Linux npm deps, Hermes CLI, and the
# Node orchestrator bound to localhost:8600.

set -Eeuo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ORCH_DIR="$REPO_DIR/hermes-orchestrator"
ROOT="${CLASH_HERMES_ROOT:-$HOME/.clash-hermes-local}"
LOG_DIR="$ROOT/logs"
PID_FILE="$ROOT/orchestrator.pid"
LOG_FILE="$LOG_DIR/orchestrator.log"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

load_env_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  local line key value
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    line="${line#$'\xef\xbb\xbf'}"
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)[[:space:]]*=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      value="${value#"${value%%[![:space:]]*}"}"
      value="${value%"${value##*[![:space:]]}"}"
      if [[ "$value" == \"*\" && "$value" == *\" ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
        value="${value:1:${#value}-2}"
      fi
      export "$key=$value"
    fi
  done < "$file"
}

ensure_linux_npm() {
  if command -v npm >/dev/null 2>&1 && [[ "$(command -v npm)" != /mnt/c/* ]]; then
    return 0
  fi
  if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    log "Installing Linux npm via sudo..."
    sudo apt-get update -qq
    sudo apt-get install -y -qq npm ca-certificates curl git python3 python3-venv ripgrep ffmpeg
  elif [ "$(id -u)" -eq 0 ]; then
    log "Installing Linux npm..."
    apt-get update -qq
    apt-get install -y -qq npm ca-certificates curl git python3 python3-venv ripgrep ffmpeg
  else
    die "Linux npm is missing and sudo is unavailable. Run: wsl -u root -- apt-get install -y npm"
  fi
}

ensure_uv() {
  export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
  if command -v uv >/dev/null 2>&1; then
    return 0
  fi
  log "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv >/dev/null 2>&1 || die "uv install failed"
}

ensure_hermes() {
  export PATH="$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
  if command -v hermes >/dev/null 2>&1; then
    log "Hermes already installed: $(hermes --version 2>/dev/null || echo present)"
    return 0
  fi
  local hermes_src="$HOME/.hermes/hermes-agent"
  if [ ! -d "$hermes_src/.git" ]; then
    log "Cloning Hermes Agent..."
    mkdir -p "$HOME/.hermes"
    git clone --depth 1 https://github.com/NousResearch/hermes-agent.git "$hermes_src"
  fi
  log "Installing Hermes Agent CLI with uv..."
  uv tool install --force --editable "$hermes_src[cli,mcp,messaging]"
  export PATH="$HOME/.local/bin:$PATH"
  command -v hermes >/dev/null 2>&1 || die "Hermes install did not put hermes on PATH"
}

stop_existing() {
  if [ -f "$PID_FILE" ]; then
    local pid
    pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [ -n "$pid" ] && kill -0 "$pid" >/dev/null 2>&1; then
      log "Stopping previous local orchestrator pid=$pid"
      kill "$pid" >/dev/null 2>&1 || true
      sleep 1
    fi
  fi
  rm -f "$PID_FILE"
}

main() {
  [ -f "$ORCH_DIR/package.json" ] || die "Missing $ORCH_DIR/package.json"
  load_env_file "$REPO_DIR/.env"
  load_env_file "$REPO_DIR/server/.env"
  load_env_file "$REPO_DIR/web/.env"

  export CLASH_HERMES_ROOT="$ROOT"
  # WSL loopback is separate from Windows loopback. Binding to 0.0.0.0 lets
  # the Windows backend reach the local orchestrator through localhost
  # forwarding / the WSL NAT IP while the bearer token still protects it.
  export CLASH_HERMES_ORCHESTRATOR_HOST="${CLASH_HERMES_ORCHESTRATOR_HOST:-0.0.0.0}"
  export CLASH_HERMES_ORCHESTRATOR_PORT="${CLASH_HERMES_ORCHESTRATOR_PORT:-8600}"
  export HERMES_ORCHESTRATOR_TOKEN="${HERMES_ORCHESTRATOR_TOKEN:-${CLASH_HERMES_ORCHESTRATOR_TOKEN:-}}"
  local windows_host_ip
  windows_host_ip="$(ip route show default 2>/dev/null | awk '{print $3; exit}')"
  windows_host_ip="${windows_host_ip:-127.0.0.1}"
  export CLASH_MCP_URL="${CLASH_MCP_URL:-http://$windows_host_ip:4100/mcp}"

  [ -n "${OPENROUTER_API_KEY:-}" ] || die "OPENROUTER_API_KEY is missing in repo .env"
  [ -n "${HERMES_ORCHESTRATOR_TOKEN:-}" ] || die "Hermes orchestrator token is missing in repo .env"

  ensure_linux_npm
  ensure_uv
  ensure_hermes
  export HERMES_BIN="${HERMES_BIN:-$(command -v hermes)}"

  mkdir -p "$LOG_DIR" "$ROOT/state" "$ROOT/players"

  log "Installing orchestrator npm dependencies..."
  cd "$ORCH_DIR"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev
  else
    npm install --omit=dev
  fi
  npm run check

  stop_existing
  log "Starting local Clash Hermes orchestrator on ${CLASH_HERMES_ORCHESTRATOR_HOST}:${CLASH_HERMES_ORCHESTRATOR_PORT}"
  nohup node "$ORCH_DIR/src/server.mjs" > "$LOG_FILE" 2>&1 &
  echo "$!" > "$PID_FILE"
  local ok=""
  for _ in $(seq 1 20); do
    if ! kill -0 "$(cat "$PID_FILE")" >/dev/null 2>&1; then
      tail -n 120 "$LOG_FILE" >&2 || true
      die "orchestrator exited during startup"
    fi
    if curl -fsS "http://${CLASH_HERMES_ORCHESTRATOR_HOST}:${CLASH_HERMES_ORCHESTRATOR_PORT}/health" >/dev/null 2>&1; then
      ok="1"
      break
    fi
    sleep 0.5
  done
  if [ -z "$ok" ]; then
    tail -n 120 "$LOG_FILE" >&2 || true
    die "orchestrator did not answer health check"
  fi
  log "Local Hermes orchestrator is healthy. pid=$(cat "$PID_FILE") log=$LOG_FILE"
}

main "$@"
