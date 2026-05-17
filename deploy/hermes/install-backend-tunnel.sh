#!/usr/bin/env bash
# Install a secure local SSH tunnel from the game backend host to the dedicated
# Hermes VPS. This keeps the Hermes orchestrator bound to 127.0.0.1 on the VPS
# while exposing it to the game backend as http://127.0.0.1:8600.

set -Eeuo pipefail

DEPLOY_ROOT="${CLASH_DEPLOY_ROOT:-/opt/clash}"
SHARED_DIR="$DEPLOY_ROOT/shared"
ENV_FILE="${CLASH_ENV_FILE:-$SHARED_DIR/.env}"
SERVICE_NAME="${CLASH_HERMES_TUNNEL_SERVICE:-clash-hermes-tunnel}"
VPS_HOST="${CLASH_HERMES_VPS_HOST:-62.72.35.202}"
VPS_USER="${CLASH_HERMES_VPS_USER:-root}"
SSH_KEY="${CLASH_HERMES_SSH_KEY:-$SHARED_DIR/hermes_tunnel_ed25519}"
LOCAL_PORT="${CLASH_HERMES_TUNNEL_LOCAL_PORT:-8600}"
REMOTE_PORT="${CLASH_HERMES_TUNNEL_REMOTE_PORT:-8600}"

log() { echo "[$(date -u +%H:%M:%S)] $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Run as root/sudo."
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped="${value//\\/\\\\}"
  escaped="${escaped//&/\\&}"
  mkdir -p "$SHARED_DIR"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

install_deps() {
  apt-get update -qq
  apt-get install -y -qq openssh-client curl
}

ensure_key() {
  mkdir -p "$SHARED_DIR"
  chmod 700 "$SHARED_DIR"
  if [ ! -f "$SSH_KEY" ]; then
    ssh-keygen -t ed25519 -N '' -f "$SSH_KEY" -C "clash-hermes-tunnel@$(hostname -f)"
    chmod 600 "$SSH_KEY"
    echo
    echo "Install this public key on the Hermes VPS before starting the tunnel:"
    echo
    cat "$SSH_KEY.pub"
    echo
  fi
}

write_systemd_service() {
  mkdir -p /etc/systemd/system
  ssh-keyscan -H "$VPS_HOST" >> /etc/ssh/ssh_known_hosts 2>/dev/null || true
  cat > "/etc/systemd/system/$SERVICE_NAME.service" <<SERVICE
[Unit]
Description=Clash Hermes Orchestrator SSH Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/ssh -NT \
  -o ExitOnForwardFailure=yes \
  -o ServerAliveInterval=30 \
  -o ServerAliveCountMax=3 \
  -o StrictHostKeyChecking=yes \
  -i $SSH_KEY \
  -L 127.0.0.1:$LOCAL_PORT:127.0.0.1:$REMOTE_PORT \
  $VPS_USER@$VPS_HOST
Restart=always
RestartSec=5
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
SERVICE
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
}

main() {
  require_root
  install_deps
  ensure_key
  write_systemd_service
  set_env_value CLASH_HERMES_ORCHESTRATOR_URL "http://127.0.0.1:$LOCAL_PORT"
  if [ -n "${CLASH_HERMES_ORCHESTRATOR_TOKEN:-}" ]; then
    set_env_value CLASH_HERMES_ORCHESTRATOR_TOKEN "$CLASH_HERMES_ORCHESTRATOR_TOKEN"
  fi
  echo "Tunnel service installed: $SERVICE_NAME"
  echo "Start after installing the public key on the Hermes VPS:"
  echo "  sudo systemctl start $SERVICE_NAME"
  echo "Smoke check:"
  echo "  curl http://127.0.0.1:$LOCAL_PORT/health"
}

main "$@"
