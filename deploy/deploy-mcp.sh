#!/bin/bash
# One-command setup/update for the Clash AI MCP service.
#
# It configures:
#   - Node.js + PM2
#   - /opt/clash/shared/.env MCP defaults
#   - npm dependencies for mcp/
#   - PM2 process: clash-mcp
#   - nginx vhost: mcp.clashofperps.fun
#   - certbot TLS certificate
#   - public smoke checks
#
# Usage on the production host:
#   sudo bash /opt/clash/deploy/deploy-mcp.sh
#
# Useful overrides:
#   CLASH_SOURCE_DIR=/opt/clash
#   CLASH_DEPLOY_ROOT=/opt/clash
#   CLASH_MCP_DOMAIN=mcp.clashofperps.fun

set -Eeuo pipefail

MCP_DOMAIN="${CLASH_MCP_DOMAIN:-mcp.clashofperps.fun}"
MAIN_DOMAIN="${CLASH_DOMAIN:-clashofperps.fun}"
EMAIL="${CLASH_CERT_EMAIL:-egor4042007@gmail.com}"
DEPLOY_ROOT="${CLASH_DEPLOY_ROOT:-/opt/clash}"
SHARED_DIR="$DEPLOY_ROOT/shared"
ENV_FILE="$SHARED_DIR/.env"

SCRIPT_ROOT="$(dirname "$(dirname "$(readlink -f "$0")")")"
if [ -n "${CLASH_SOURCE_DIR:-}" ]; then
    SOURCE_DIR="$(readlink -f "$CLASH_SOURCE_DIR")"
elif [ -d "$DEPLOY_ROOT/current/mcp" ]; then
    SOURCE_DIR="$(readlink -f "$DEPLOY_ROOT/current")"
else
    SOURCE_DIR="$(readlink -f "$SCRIPT_ROOT")"
fi
MCP_DIR="$SOURCE_DIR/mcp"

log() {
    echo "[$(date -u +%H:%M:%S)] $*"
}

die() {
    echo "ERROR: $*" >&2
    exit 1
}

require_root() {
    if [ "$(id -u)" -ne 0 ]; then
        die "Run this script with sudo/root."
    fi
}

ensure_env_file() {
    mkdir -p "$SHARED_DIR"
    if [ ! -f "$ENV_FILE" ]; then
        {
            printf '%s\n' NODE_ENV=production
            printf '%s\n' CLASH_MCP_PORT=4100
            printf '%s\n' CLASH_MCP_HOST=127.0.0.1
            printf '%s=%s\n' CLASH_MCP_PUBLIC_URL "https://$MCP_DOMAIN"
            printf '%s\n' CLASH_GAME_API_URL=http://127.0.0.1:4000/api
            printf '%s=%s\n' CLASH_MCP_CORS_ORIGINS "https://$MAIN_DOMAIN,https://www.$MAIN_DOMAIN,https://$MCP_DOMAIN"
            printf '%s\n' CLASH_MCP_RATE_WINDOW_MS=60000
            printf '%s\n' CLASH_MCP_RATE_LIMIT=180
        } > "$ENV_FILE"
        chmod 600 "$ENV_FILE"
        log "Created $ENV_FILE"
    fi
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

ensure_env_default() {
    local key="$1"
    local value="$2"
    if ! grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
        echo "${key}=${value}" >> "$ENV_FILE"
    fi
}

prepare_env() {
    ensure_env_file
    ensure_env_default NODE_ENV production
    ensure_env_default CLASH_MCP_PORT 4100
    ensure_env_default CLASH_MCP_HOST 127.0.0.1
    ensure_env_default CLASH_MCP_RATE_WINDOW_MS 60000
    ensure_env_default CLASH_MCP_RATE_LIMIT 180
    set_env_value CLASH_MCP_PUBLIC_URL "https://$MCP_DOMAIN"
    set_env_value CLASH_GAME_API_URL "http://127.0.0.1:4000/api"
    set_env_value CLASH_MCP_CORS_ORIGINS "https://$MAIN_DOMAIN,https://www.$MAIN_DOMAIN,https://$MCP_DOMAIN"
}

install_system_dependencies() {
    log "Installing system dependencies..."
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx curl

    if ! command -v node >/dev/null 2>&1; then
        log "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
    fi

    if ! command -v pm2 >/dev/null 2>&1; then
        npm install -g pm2
    fi
}

install_mcp_dependencies() {
    [ -d "$MCP_DIR" ] || die "MCP directory not found: $MCP_DIR"
    [ -f "$MCP_DIR/src/server.mjs" ] || die "MCP server missing: $MCP_DIR/src/server.mjs"
    [ -f "$MCP_DIR/SKILLS.md" ] || die "MCP skills missing: $MCP_DIR/SKILLS.md"

    log "Installing MCP dependencies in $MCP_DIR..."
    cd "$MCP_DIR"
    if [ -f package-lock.json ]; then
        npm ci --omit=dev --legacy-peer-deps
    else
        npm install --omit=dev --legacy-peer-deps
    fi
    node --check "$MCP_DIR/src/server.mjs"
}

write_nginx_config() {
    log "Configuring nginx for $MCP_DOMAIN..."

    if [ ! -f "/etc/letsencrypt/live/$MCP_DOMAIN/fullchain.pem" ]; then
        cat > /etc/nginx/sites-available/$MCP_DOMAIN << MCPTEMPCONF
server {
    listen 80;
    server_name $MCP_DOMAIN;
    location / { return 200 'clash-ai-mcp certificate bootstrap'; add_header Content-Type text/plain; }
}
MCPTEMPCONF
        ln -sf /etc/nginx/sites-available/$MCP_DOMAIN /etc/nginx/sites-enabled/
        nginx -t
        systemctl reload nginx
        certbot --nginx -d "$MCP_DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
    fi

    cat > /etc/nginx/sites-available/$MCP_DOMAIN << MCPCONF
server {
    listen 80;
    server_name $MCP_DOMAIN;
    location / { return 301 https://\$host\$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name $MCP_DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$MCP_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$MCP_DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:4100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header MCP-Protocol-Version \$http_mcp_protocol_version;
        proxy_set_header Mcp-Session-Id \$http_mcp_session_id;
        proxy_set_header Last-Event-ID \$http_last_event_id;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        gzip off;
        add_header X-Accel-Buffering no always;
    }

    client_max_body_size 5M;
}
MCPCONF

    ln -sf /etc/nginx/sites-available/$MCP_DOMAIN /etc/nginx/sites-enabled/
    nginx -t
    systemctl reload nginx
}

restart_mcp() {
    log "Restarting PM2 clash-mcp..."
    pm2 delete clash-mcp 2>/dev/null || true
    pm2 start "$MCP_DIR/src/server.mjs" \
        --name clash-mcp \
        --cwd "$MCP_DIR" \
        --env production \
        --node-args="--env-file=$ENV_FILE"
    pm2 save
    pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
}

smoke_check() {
    log "Running MCP smoke checks..."
    MCP_BASE_URL="https://$MCP_DOMAIN" bash "$SOURCE_DIR/deploy/check-mcp.sh"
}

main() {
    require_root
    log "=== Clash MCP one-click deploy ==="
    log "Source: $SOURCE_DIR"
    log "MCP domain: $MCP_DOMAIN"

    install_system_dependencies
    prepare_env
    install_mcp_dependencies
    write_nginx_config
    restart_mcp
    smoke_check

    log "=== MCP deploy complete ==="
    echo "MCP:    https://$MCP_DOMAIN/mcp"
    echo "Skills: https://$MCP_DOMAIN/skills.md"
    echo "Logs:   pm2 logs clash-mcp"
}

main "$@"
