#!/bin/bash
# Atomic deploy script for clashofperps.fun.
#
# Layout after deploy:
#   /opt/clash/current -> /opt/clash/releases/<release-id>
#   /opt/clash/releases/<release-id>/... immutable built release
#   /opt/clash/shared/.env shared production env
#   /opt/clash/shared/server/*.db shared main SQLite DB
#   /opt/clash/shared/server-futures/*.db shared futures SQLite DB
#
# Nginx serves /opt/clash/current/web/dist. A new build is prepared in a fresh
# release directory first; only after validation do we atomically swap current.

set -Eeuo pipefail

DOMAIN="clashofperps.fun"
EMAIL="egor4042007@gmail.com"
DEPLOY_ROOT="/opt/clash"
RELEASES_DIR="$DEPLOY_ROOT/releases"
SHARED_DIR="$DEPLOY_ROOT/shared"
CURRENT_LINK="$DEPLOY_ROOT/current"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

SOURCE_DIR="${CLASH_SOURCE_DIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
GIT_SHA="$(git -C "$SOURCE_DIR" rev-parse --short HEAD 2>/dev/null || echo manual)"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$GIT_SHA"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
SERVER_DIR="$RELEASE_DIR/server"
FUTURES_DIR="$RELEASE_DIR/server-futures"
WEB_DIR="$RELEASE_DIR/web"
WEB_DIST="$WEB_DIR/dist"

SHARED_SERVER_DIR="$SHARED_DIR/server"
SHARED_FUTURES_DIR="$SHARED_DIR/server-futures"
ENV_FILE="$SHARED_DIR/.env"

BOOTSTRAPPED_LEGACY_DBS=0
SWITCHED=0

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

cleanup_failed_release() {
    if [ "$SWITCHED" -eq 0 ] && [ -n "${RELEASE_DIR:-}" ] && [ -d "$RELEASE_DIR" ]; then
        rm -rf "$RELEASE_DIR"
    fi
}
trap cleanup_failed_release ERR

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

copy_db_family() {
    local src_dir="$1"
    local dst_dir="$2"
    local base="$3"
    local copied=0
    mkdir -p "$dst_dir"
    for suffix in "" "-wal" "-shm"; do
        if [ -f "$src_dir/$base$suffix" ]; then
            cp -a "$src_dir/$base$suffix" "$dst_dir/"
            copied=1
        fi
    done
    [ "$copied" -eq 1 ]
}

install_system_dependencies() {
    log "[1/9] Installing system dependencies..."
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx curl rsync brotli

    if ! command -v node >/dev/null 2>&1; then
        log "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
    fi

    if ! command -v pm2 >/dev/null 2>&1; then
        npm install -g pm2
    fi

    if ! nginx -V 2>&1 | grep -q brotli; then
        apt-get install -y -qq libnginx-mod-http-brotli-static libnginx-mod-http-brotli-filter 2>/dev/null \
            || log "brotli nginx module not available; gzip_static will still be used."
    fi
}

prepare_shared_runtime() {
    log "[2/9] Preparing shared runtime..."
    mkdir -p "$RELEASES_DIR" "$SHARED_SERVER_DIR" "$SHARED_FUTURES_DIR" "$SHARED_DIR/backups"

    if [ ! -f "$ENV_FILE" ]; then
        if [ -f "$DEPLOY_ROOT/.env" ]; then
            cp -a "$DEPLOY_ROOT/.env" "$ENV_FILE"
            log "Copied legacy .env to $ENV_FILE"
        else
            ADMIN_KEY="$(openssl rand -hex 16)"
            REWARD_SECRET="$(openssl rand -hex 32)"
            WALLET_ENC_KEY="$(openssl rand -hex 32)"
            cat > "$ENV_FILE" << EOF
ADMIN_KEY=$ADMIN_KEY
REWARD_SECRET=$REWARD_SECRET
NODE_ENV=production
ELFA_API_KEY=
DECIBEL_API_KEY=
DECIBEL_API_WALLET_PRIVATE_KEY=
DECIBEL_ALLOWED_BUILDER_ADDRS=
DECIBEL_BUILDER_FEE_BPS=1
CLASH_WALLET_ENCRYPTION_KEY=$WALLET_ENC_KEY
EOF
            chmod 600 "$ENV_FILE"
            log "Generated new shared .env with ADMIN_KEY=$ADMIN_KEY"
        fi
    fi

    ensure_env_default "ADMIN_KEY" "$(openssl rand -hex 16)"
    ensure_env_default "REWARD_SECRET" "$(openssl rand -hex 32)"
    ensure_env_default "NODE_ENV" "production"
    ensure_env_default "ELFA_API_KEY" ""
    ensure_env_default "DECIBEL_API_KEY" ""
    ensure_env_default "DECIBEL_API_WALLET_PRIVATE_KEY" ""
    ensure_env_default "DECIBEL_ALLOWED_BUILDER_ADDRS" ""
    ensure_env_default "DECIBEL_BUILDER_FEE_BPS" "1"
    ensure_env_default "CLASH_WALLET_ENCRYPTION_KEY" "$(openssl rand -hex 32)"

    set_env_value "NODE_ENV" "production"
    set_env_value "CLASH_MAIN_DB" "$SHARED_SERVER_DIR/clash.db"
    set_env_value "CLASH_FUTURES_DB" "$SHARED_FUTURES_DIR/futures.db"

    if [ ! -f "$SHARED_SERVER_DIR/clash.db" ]; then
        if copy_db_family "$DEPLOY_ROOT/server" "$SHARED_SERVER_DIR" "clash.db"; then
            BOOTSTRAPPED_LEGACY_DBS=1
            log "Bootstrapped main DB from legacy /opt/clash/server"
        elif [ -L "$CURRENT_LINK" ]; then
            copy_db_family "$CURRENT_LINK/server" "$SHARED_SERVER_DIR" "clash.db" || true
        fi
    fi

    if [ ! -f "$SHARED_FUTURES_DIR/futures.db" ]; then
        if copy_db_family "$DEPLOY_ROOT/server-futures" "$SHARED_FUTURES_DIR" "futures.db"; then
            BOOTSTRAPPED_LEGACY_DBS=1
            log "Bootstrapped futures DB from legacy /opt/clash/server-futures"
        elif [ -L "$CURRENT_LINK" ]; then
            copy_db_family "$CURRENT_LINK/server-futures" "$SHARED_FUTURES_DIR" "futures.db" || true
        fi
    fi
}

backup_shared_databases() {
    local ts
    ts="$(date -u +%Y%m%d%H%M%S)"
    local backup_dir="$SHARED_DIR/backups/$ts"
    mkdir -p "$backup_dir/server" "$backup_dir/server-futures"
    copy_db_family "$SHARED_SERVER_DIR" "$backup_dir/server" "clash.db" || true
    copy_db_family "$SHARED_FUTURES_DIR" "$backup_dir/server-futures" "futures.db" || true
    log "Database backup written to $backup_dir"
}

copy_source_to_release() {
    log "[3/9] Copying source to release $RELEASE_ID..."
    mkdir -p "$RELEASE_DIR"
    rsync -a --delete \
        --exclude='.git' \
        --exclude='.claude' \
        --exclude='.godot' \
        --exclude='node_modules' \
        --exclude='web/node_modules' \
        --exclude='web/dist' \
        --exclude='server/node_modules' \
        --exclude='server/*.db*' \
        --exclude='server-futures/node_modules' \
        --exclude='server-futures/*.db*' \
        --exclude='server-futures/server.log' \
        --exclude='.env' \
        --exclude='*.log' \
        --exclude='*.orig' \
        --exclude='aptos-test-wallet.txt' \
        --exclude='android-keystore' \
        --exclude='twa' \
        --exclude='backups' \
        "$SOURCE_DIR/" "$RELEASE_DIR/"

    [ -f "$WEB_DIR/public/godot/Work.pck" ] \
        || die "Godot export missing at $WEB_DIR/public/godot/Work.pck. Export locally and upload web/public/godot before deploy."
}

install_release_dependencies() {
    log "[4/9] Installing release dependencies..."
    cd "$SERVER_DIR"
    npm ci --omit=dev

    if [ -d "$FUTURES_DIR" ]; then
        cd "$FUTURES_DIR"
        npm install --omit=dev --legacy-peer-deps
    fi

    if ! grep -q '^DIAG_SERVER_SECRET_B58=' "$ENV_FILE"; then
        DIAG_SECRET="$(cd "$SERVER_DIR" && node -e "const n=require('tweetnacl');const b=require('bs58').default||require('bs58');console.log(b.encode(n.box.keyPair().secretKey))")"
        echo "DIAG_SERVER_SECRET_B58=$DIAG_SECRET" >> "$ENV_FILE"
        log "Generated persistent DIAG_SERVER_SECRET_B58"
    fi
}

build_frontend() {
    log "[5/9] Building frontend..."
    cd "$WEB_DIR"
    npm install --legacy-peer-deps
    npm run build

    BUILD_HASH="$(date +%s)"
    if [ -f "$WEB_DIST/sw.js" ]; then
        sed -i "s/__BUILD_HASH__/$BUILD_HASH/g" "$WEB_DIST/sw.js"
        log "SW cache version: clash-godot-$BUILD_HASH"
    fi

    if [ -f "$WEB_DIST/godot/Work.js" ]; then
        sed -i 's|\[`${loadPath}.side.wasm`\].concat(this.gdextensionLibs)|[].concat(this.gdextensionLibs)|g' "$WEB_DIST/godot/Work.js"
        rm -f "$WEB_DIST/godot/Work.side.wasm"
        log "Patched Work.js side.wasm reference"
    fi

    log "Compressing static assets..."
    for f in "$WEB_DIST/godot/Work.pck"; do
        if [ -f "$f" ]; then
            brotli -f -q 9 -o "$f.br" "$f"
            gzip -f -k -9 "$f"
        fi
    done
    for f in "$WEB_DIST/godot/Work.wasm" "$WEB_DIST/godot/Work.js"; do
        if [ -f "$f" ]; then
            brotli -f -q 6 -o "$f.br" "$f"
            gzip -f -k -9 "$f"
        fi
    done
    for f in "$WEB_DIST"/assets/*.js "$WEB_DIST"/assets/*.css; do
        if [ -f "$f" ]; then
            brotli -f -q 6 -o "$f.br" "$f"
            gzip -f -k -9 "$f"
        fi
    done
}

validate_release() {
    log "[6/9] Validating release..."
    [ -f "$WEB_DIST/index.html" ] || die "Missing web/dist/index.html"
    [ -f "$WEB_DIST/godot/Work.pck" ] || die "Missing web/dist/godot/Work.pck"
    [ -f "$WEB_DIST/godot/Work.wasm" ] || die "Missing web/dist/godot/Work.wasm"
    [ -f "$WEB_DIST/godot/Work.js" ] || die "Missing web/dist/godot/Work.js"
    node --check "$SERVER_DIR/db.js"
    node --check "$SERVER_DIR/routes.js"
    if [ -f "$FUTURES_DIR/index.js" ]; then
        node --check "$FUTURES_DIR/index.js"
    fi
}

sync_legacy_databases_before_switch() {
    if [ "$BOOTSTRAPPED_LEGACY_DBS" -ne 1 ]; then
        return
    fi

    log "Stopping old services briefly for one-time DB migration..."
    pm2 stop clash-api 2>/dev/null || true
    pm2 stop clash-futures 2>/dev/null || true
    copy_db_family "$DEPLOY_ROOT/server" "$SHARED_SERVER_DIR" "clash.db" || true
    copy_db_family "$DEPLOY_ROOT/server-futures" "$SHARED_FUTURES_DIR" "futures.db" || true
}

switch_current_release() {
    log "[7/9] Switching current symlink atomically..."
    local tmp_link="$DEPLOY_ROOT/.current.new"
    ln -sfn "$RELEASE_DIR" "$tmp_link"
    mv -Tf "$tmp_link" "$CURRENT_LINK"
    SWITCHED=1

    mkdir -p "$DEPLOY_ROOT/deploy"
    cat > "$DEPLOY_ROOT/deploy/update.sh" << 'EOF'
#!/bin/bash
exec /opt/clash/current/deploy/update.sh "$@"
EOF
    chmod +x "$DEPLOY_ROOT/deploy/update.sh"
}

write_nginx_config() {
    log "[8/9] Configuring nginx..."
    if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
        cat > /etc/nginx/sites-available/$DOMAIN << HTTPCONF
server {
    listen 80;
    server_name $DOMAIN;
    root $CURRENT_LINK/web/dist;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
HTTPCONF

        ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
        rm -f /etc/nginx/sites-enabled/default
        nginx -t
        systemctl reload nginx
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"
    fi

    cat > /etc/nginx/sites-available/$DOMAIN << 'SSLCONF'
server {
    listen 80;
    server_name clashofperps.fun;
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    server_name clashofperps.fun;

    ssl_certificate /etc/letsencrypt/live/clashofperps.fun/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/clashofperps.fun/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;

    location /api/futures/ {
        proxy_pass http://127.0.0.1:3999/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location /rpc/arb-alchemy {
        proxy_pass https://arb-mainnet.g.alchemy.com/v2/_wtFjwex46SgJDz2fx2c6;
        proxy_http_version 1.1;
        proxy_set_header Host arb-mainnet.g.alchemy.com;
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }
    location /rpc/arb-pokt {
        proxy_pass https://arb-pokt.nodies.app/;
        proxy_http_version 1.1;
        proxy_set_header Host arb-pokt.nodies.app;
        proxy_ssl_server_name on;
        gzip off;
    }
    location /rpc/arb-onfinality {
        proxy_pass https://arbitrum.api.onfinality.io/public;
        proxy_http_version 1.1;
        proxy_set_header Host arbitrum.api.onfinality.io;
        proxy_ssl_server_name on;
        gzip off;
    }
    location /rpc/arb-public {
        proxy_pass https://arbitrum-one.publicnode.com/;
        proxy_http_version 1.1;
        proxy_set_header Host arbitrum-one.publicnode.com;
        proxy_ssl_server_name on;
        gzip off;
    }
    location /rpc/arb-tenderly {
        proxy_pass https://arbitrum.gateway.tenderly.co/;
        proxy_http_version 1.1;
        proxy_set_header Host arbitrum.gateway.tenderly.co;
        proxy_ssl_server_name on;
        gzip off;
    }
    location /rpc/arb {
        proxy_pass https://1rpc.io/arb;
        proxy_http_version 1.1;
        proxy_set_header Host 1rpc.io;
        proxy_ssl_server_name on;
        gzip off;
    }

    location = /api/client-log {
        access_log off;
        add_header Cache-Control "no-store" always;
        return 204;
    }
    location = /api/client-log/ {
        access_log off;
        add_header Cache-Control "no-store" always;
        return 204;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location /ws {
        proxy_pass http://127.0.0.1:4000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    location /dashboard {
        proxy_pass http://127.0.0.1:4000/;
        proxy_set_header Host $host;
    }

    location /trading-stats {
        proxy_pass http://127.0.0.1:4000/trading-stats;
        proxy_set_header Host $host;
    }

    root /opt/clash/current/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
    }

    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
    }

    location /godot/ {
        try_files $uri =404;
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
        add_header Cache-Control "public, max-age=86400, must-revalidate";
        etag on;
        types { application/wasm wasm; application/javascript js; application/octet-stream pck; }
        gzip_static on;
    }

    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable";
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
    }

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/wasm application/octet-stream;
    gzip_min_length 1000;
    gzip_comp_level 6;
    client_max_body_size 200M;
}
SSLCONF

    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    if nginx -V 2>&1 | grep -q brotli; then
        sed -i '/gzip_static on;/a\        brotli_static on;' /etc/nginx/sites-available/$DOMAIN
        log "brotli_static enabled in nginx"
    fi

    nginx -t
    systemctl reload nginx
}

restart_services() {
    log "[9/9] Restarting PM2 services..."

    pm2 delete clash-api 2>/dev/null || true
    pm2 start "$CURRENT_LINK/server/index.js" \
        --name clash-api \
        --cwd "$CURRENT_LINK/server" \
        --env production \
        --node-args="--env-file=$ENV_FILE"

    if [ -d "$CURRENT_LINK/server-futures" ]; then
        pm2 delete clash-futures 2>/dev/null || true
        pm2 start "$CURRENT_LINK/server-futures/index.js" \
            --name clash-futures \
            --cwd "$CURRENT_LINK/server-futures" \
            --env production \
            --node-args="--env-file=$ENV_FILE"
    fi

    pm2 save
    pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
}

cleanup_old_releases() {
    log "Keeping last $KEEP_RELEASES release(s)."
    local count=0
    local release
    while IFS= read -r release; do
        count=$((count + 1))
        if [ "$count" -gt "$KEEP_RELEASES" ] && [ "$release" != "$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)" ]; then
            rm -rf "$release"
            log "Removed old release $(basename "$release")"
        fi
    done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | awk '{print $2}')
}

main() {
    require_root
    log "=== Atomic deploy $DOMAIN ($RELEASE_ID) ==="
    log "Source: $SOURCE_DIR"

    install_system_dependencies
    prepare_shared_runtime
    backup_shared_databases
    copy_source_to_release
    install_release_dependencies
    build_frontend
    validate_release
    sync_legacy_databases_before_switch
    switch_current_release
    write_nginx_config
    restart_services
    cleanup_old_releases

    log "=== Deploy complete ==="
    echo "Frontend:  https://$DOMAIN"
    echo "API:       https://$DOMAIN/api/"
    echo "Release:   $RELEASE_DIR"
    echo "Current:   $(readlink -f "$CURRENT_LINK")"
    echo ""
    echo "Useful commands:"
    echo "  pm2 logs clash-api"
    echo "  pm2 logs clash-futures"
    echo "  bash $DEPLOY_ROOT/deploy/update.sh"
    echo "  ln -sfn <release-dir> $DEPLOY_ROOT/.current.rollback && mv -Tf $DEPLOY_ROOT/.current.rollback $CURRENT_LINK"
}

main "$@"
