#!/bin/bash
# Atomic deploy script for clashofperps.fun and mcp.clashofperps.fun.
#
# Layout after deploy:
#   /opt/clash/current -> /opt/clash/releases/<release-id>
#   /opt/clash/releases/<release-id>/... immutable built release
#   /opt/clash/shared/.env shared production env
#   /opt/clash/shared/server/*.db shared main SQLite DB
#   /opt/clash/shared/server-futures/*.db shared futures SQLite DB
#
# Nginx serves /opt/clash/current/web/dist and proxies API/MCP processes.
# A new build is prepared in a fresh release directory first; only after
# validation do we atomically swap current.

set -Eeuo pipefail

DOMAIN="clashofperps.fun"
MCP_DOMAIN="${CLASH_MCP_DOMAIN:-mcp.clashofperps.fun}"
EMAIL="egor4042007@gmail.com"
DEPLOY_ROOT="/opt/clash"
RELEASES_DIR="$DEPLOY_ROOT/releases"
SHARED_DIR="$DEPLOY_ROOT/shared"
CURRENT_LINK="$DEPLOY_ROOT/current"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

SOURCE_DIR="${CLASH_SOURCE_DIR:-$(dirname "$(dirname "$(readlink -f "$0")")")}"
SOURCE_DIR="$(readlink -f "$SOURCE_DIR")"
GIT_SHA="$(git -C "$SOURCE_DIR" rev-parse --short HEAD 2>/dev/null || echo manual)"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$GIT_SHA"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
SERVER_DIR="$RELEASE_DIR/server"
FUTURES_DIR="$RELEASE_DIR/server-futures"
MCP_DIR="$RELEASE_DIR/mcp"
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

validate_source_dir() {
    local current_real releases_real
    current_real="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"
    releases_real="$(readlink -f "$RELEASES_DIR" 2>/dev/null || true)"

    [ -d "$SOURCE_DIR" ] || die "Source checkout not found: $SOURCE_DIR"
    [ -d "$SOURCE_DIR/.git" ] || die "Source checkout must be a git repo: $SOURCE_DIR"

    if [ -n "$current_real" ] && [[ "$SOURCE_DIR" == "$current_real"* ]]; then
        die "Refusing to deploy from current release ($SOURCE_DIR). Use /opt/clash as the source checkout."
    fi
    if [ -n "$releases_real" ] && [[ "$SOURCE_DIR" == "$releases_real"* ]]; then
        die "Refusing to deploy from an immutable release ($SOURCE_DIR). Use /opt/clash as the source checkout."
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

load_vite_env_for_build() {
    # Vite only embeds variables that are present in the build process env and
    # start with VITE_. Release copies intentionally exclude .env files, so
    # production-only public config (Privy app id, Aptos/Arbitrum API keys)
    # must be lifted from /opt/clash/shared/.env before npm run build.
    [ -f "$ENV_FILE" ] || return 0

    local count=0
    local loaded_keys=()
    local line key value
    while IFS= read -r line || [ -n "$line" ]; do
        line="${line%$'\r'}"
        case "$line" in
            ''|\#*) continue ;;
        esac
        key="${line%%=*}"
        value="${line#*=}"
        case "$key" in
            VITE_*)
                if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
                    export "$key=$value"
                    loaded_keys+=("$key")
                    count=$((count + 1))
                fi
                ;;
        esac
    done < "$ENV_FILE"

    if [ "$count" -gt 0 ]; then
        log "Loaded $count Vite build env key(s): ${loaded_keys[*]}"
    else
        log "No VITE_* build env keys found in $ENV_FILE"
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
            generated_admin="$(openssl rand -hex 16)"
            generated_reward="$(openssl rand -hex 32)"
            generated_wallet_enc="$(openssl rand -hex 32)"
            {
                printf '%s=%s\n' ADMIN_KEY "$generated_admin"
                printf '%s=%s\n' REWARD_SECRET "$generated_reward"
                printf '%s\n' NODE_ENV=production
                printf '%s\n' ELFA_API_KEY=
                printf '%s\n' DECIBEL_API_KEY=
                printf '%s\n' DECIBEL_API_WALLET_PRIVATE_KEY=
                printf '%s\n' DECIBEL_ALLOWED_BUILDER_ADDRS=
                printf '%s\n' DECIBEL_BUILDER_FEE_BPS=10
                printf '%s=%s\n' CLASH_WALLET_ENCRYPTION_KEY "$generated_wallet_enc"
            } > "$ENV_FILE"
            chmod 600 "$ENV_FILE"
            log "Generated new shared .env with fresh ADMIN_KEY/REWARD_SECRET/CLASH_WALLET_ENCRYPTION_KEY"
        fi
    fi

    ensure_env_default "ADMIN_KEY" "$(openssl rand -hex 16)"
    ensure_env_default "REWARD_SECRET" "$(openssl rand -hex 32)"
    ensure_env_default "NODE_ENV" "production"
    ensure_env_default "ELFA_API_KEY" ""
    ensure_env_default "DECIBEL_API_KEY" ""
    ensure_env_default "DECIBEL_API_WALLET_PRIVATE_KEY" ""
    ensure_env_default "DECIBEL_ALLOWED_BUILDER_ADDRS" ""
    ensure_env_default "DECIBEL_BUILDER_FEE_BPS" "10"
    ensure_env_default "CLASH_WALLET_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
    ensure_env_default "VITE_PRIVY_APP_ID" ""
    ensure_env_default "VITE_APTOS_NODE_API_KEY" ""
    ensure_env_default "VITE_ARBITRUM_RPC_URL" ""
    ensure_env_default "VITE_SOLANA_RPC_URL" ""
    ensure_env_default "VITE_PHOENIX_ACCESS_CODE" ""
    ensure_env_default "VITE_PHOENIX_REFERRAL_CODE" ""
    ensure_env_default "VITE_APTOS_GAS_STATION_API_KEY" ""
    ensure_env_default "VITE_DECIBEL_GAS_STATION_API_KEY" ""
    ensure_env_default "CLASH_MCP_PORT" "4100"
    ensure_env_default "CLASH_MCP_HOST" "127.0.0.1"
    ensure_env_default "CLASH_MCP_PUBLIC_URL" "https://$MCP_DOMAIN"
    ensure_env_default "CLASH_GAME_API_URL" "http://127.0.0.1:4000/api"
    ensure_env_default "CLASH_MCP_CORS_ORIGINS" "https://$DOMAIN,https://www.$DOMAIN,https://$MCP_DOMAIN"
    ensure_env_default "CLASH_MCP_RATE_WINDOW_MS" "60000"
    ensure_env_default "CLASH_MCP_RATE_LIMIT" "180"
    ensure_env_default "CLASH_MCP_AI_ATTACK_COOLDOWN_MS" "60000"

    set_env_value "NODE_ENV" "production"
    set_env_value "DECIBEL_BUILDER_FEE_BPS" "10"
    set_env_value "CLASH_MAIN_DB" "$SHARED_SERVER_DIR/clash.db"
    set_env_value "CLASH_FUTURES_DB" "$SHARED_FUTURES_DIR/futures.db"
    set_env_value "CLASH_MCP_PUBLIC_URL" "https://$MCP_DOMAIN"
    set_env_value "CLASH_GAME_API_URL" "http://127.0.0.1:4000/api"

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
    if [ -f "$ENV_FILE" ]; then
        cp -a "$ENV_FILE" "$backup_dir/.env"
        chmod 600 "$backup_dir/.env" || true
    fi
    log "Shared backup written to $backup_dir"
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
        --exclude='current' \
        --exclude='releases' \
        --exclude='shared' \
        "$SOURCE_DIR/" "$RELEASE_DIR/"

    [ -f "$WEB_DIR/public/godot/Work.pck" ] \
        || die "Godot export missing at $WEB_DIR/public/godot/Work.pck. Export locally and upload web/public/godot before deploy."
    validate_godot_export_freshness
}

validate_godot_export_freshness() {
    local export_pck="$WEB_DIR/public/godot/Work.pck"
    local stale_source=""
    local paths=(
        "$RELEASE_DIR/project.godot"
        "$RELEASE_DIR/export_presets.cfg"
        "$RELEASE_DIR/scripts"
        "$RELEASE_DIR/scenes"
        "$RELEASE_DIR/shaders"
        "$RELEASE_DIR/Model"
        "$RELEASE_DIR/textures"
        "$RELEASE_DIR/assets"
    )

    stale_source="$(
        find "${paths[@]}" \
            -type f \
            \( -name '*.gd' -o -name '*.tscn' -o -name '*.tres' -o -name '*.res' -o -name '*.glb' -o -name '*.gltf' -o -name '*.png' -o -name '*.jpg' -o -name '*.jpeg' -o -name '*.webp' -o -name 'project.godot' -o -name 'export_presets.cfg' \) \
            -newer "$export_pck" \
            -print -quit 2>/dev/null || true
    )"

    if [ -n "$stale_source" ] && [ "${CLASH_ALLOW_STALE_GODOT_EXPORT:-0}" != "1" ]; then
        die "Godot export is older than $stale_source. Export locally, upload web/public/godot to $SOURCE_DIR/web/public/godot, then deploy again. Set CLASH_ALLOW_STALE_GODOT_EXPORT=1 only if you are sure no Godot-visible files changed."
    fi
}

install_release_dependencies() {
    log "[4/9] Installing release dependencies..."
    cd "$SERVER_DIR"
    npm ci --omit=dev --legacy-peer-deps

    if [ -d "$FUTURES_DIR" ]; then
        cd "$FUTURES_DIR"
        npm install --omit=dev --legacy-peer-deps
    fi

    if [ -d "$MCP_DIR" ]; then
        cd "$MCP_DIR"
        if [ -f package-lock.json ]; then
            npm ci --omit=dev --legacy-peer-deps
        else
            npm install --omit=dev --legacy-peer-deps
        fi
    fi

    if ! grep -q '^DIAG_SERVER_SECRET_B58=' "$ENV_FILE"; then
        DIAG_SECRET="$(cd "$SERVER_DIR" && node -e "const n=require('tweetnacl');const b=require('bs58').default||require('bs58');console.log(b.encode(n.box.keyPair().secretKey))")"
        echo "DIAG_SERVER_SECRET_B58=$DIAG_SECRET" >> "$ENV_FILE"
        log "Generated persistent DIAG_SERVER_SECRET_B58"
    fi
}

patch_godot_work_js() {
    local file="$1"
    [ -f "$file" ] || return 0

    sed -i 's|\[`${loadPath}.side.wasm`\].concat(this.gdextensionLibs)|[].concat(this.gdextensionLibs)|g' "$file"

    node - "$file" <<'NODE'
const fs = require('fs');
const file = process.argv[2];
let source = fs.readFileSync(file, 'utf8');

const safariGuard = 'var currentSafariVersion=userAgent.includes("Safari/")&&userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)?humanReadableVersionToPacked(userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)[1]):TARGET_NOT_SUPPORTED;';
const patchedSafariGuard = 'var currentSafariVersion=!(userAgent.includes("Android")&&(/; wv\\)|Version\\/4\\.0|Phantom\\/android/i.test(userAgent)))&&userAgent.includes("Safari/")&&userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)?humanReadableVersionToPacked(userAgent.match(/Version\\/(\\d+\\.?\\d*\\.?\\d*)/)[1]):TARGET_NOT_SUPPORTED;';

if (source.includes(safariGuard)) {
    source = source.replace(safariGuard, patchedSafariGuard);
} else if (!source.includes(patchedSafariGuard) && source.includes('requires Safari')) {
    console.error('ERROR: Work.js Safari guard pattern not found; refusing to deploy unpatched Godot runtime.');
    process.exit(1);
}

fs.writeFileSync(file, source);
NODE
}

preserve_previous_frontend_assets() {
    local previous_assets="$CURRENT_LINK/web/dist/assets"
    local new_assets="$WEB_DIST/assets"
    [ -d "$previous_assets" ] || return 0
    [ -d "$new_assets" ] || return 0

    local copied=0
    while IFS= read -r -d '' src; do
        local dest="$new_assets/$(basename "$src")"
        if [ ! -e "$dest" ]; then
            cp -a "$src" "$dest"
            copied=$((copied + 1))
        fi
    done < <(find "$previous_assets" -maxdepth 1 -type f -print0)

    if [ "$copied" -gt 0 ]; then
        log "Preserved $copied previous frontend asset(s) for active browser sessions"
    fi
}

build_frontend() {
    log "[5/9] Building frontend..."
    cd "$WEB_DIR"
    npm install --legacy-peer-deps
    load_vite_env_for_build
    export VITE_BUILD_ID="$RELEASE_ID"
    export VITE_COMMIT_SHA="$GIT_SHA"
    npm run build

    BUILD_HASH="$(date +%s)"
    if [ -f "$WEB_DIST/sw.js" ]; then
        sed -i "s/__BUILD_HASH__/$BUILD_HASH/g" "$WEB_DIST/sw.js"
        if grep -q "__BUILD_HASH__" "$WEB_DIST/sw.js"; then
            die "Service worker cache placeholder was not replaced."
        fi
        log "SW cache version: clash-runtime-$BUILD_HASH"
    fi

    if [ -f "$WEB_DIST/godot/Work.js" ]; then
        patch_godot_work_js "$WEB_DIST/godot/Work.js"
        rm -f "$WEB_DIST/godot/Work.side.wasm"
        log "Patched Work.js runtime guards"
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

    preserve_previous_frontend_assets
}

validate_release() {
    log "[6/9] Validating release..."
    [ -f "$WEB_DIST/index.html" ] || die "Missing web/dist/index.html"
    [ -f "$WEB_DIST/godot/Work.pck" ] || die "Missing web/dist/godot/Work.pck"
    [ -f "$WEB_DIST/godot/Work.wasm" ] || die "Missing web/dist/godot/Work.wasm"
    [ -f "$WEB_DIST/godot/Work.js" ] || die "Missing web/dist/godot/Work.js"
    node --check "$SERVER_DIR/db.js"
    node --check "$SERVER_DIR/routes.js"
    if [ -f "$MCP_DIR/src/server.mjs" ]; then
        node --check "$MCP_DIR/src/server.mjs"
        [ -f "$MCP_DIR/SKILLS.md" ] || die "Missing mcp/SKILLS.md"
    fi
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
    pm2 stop clash-mcp 2>/dev/null || true
    copy_db_family "$DEPLOY_ROOT/server" "$SHARED_SERVER_DIR" "clash.db" || true
    copy_db_family "$DEPLOY_ROOT/server-futures" "$SHARED_FUTURES_DIR" "futures.db" || true
}

switch_current_release() {
    log "[7/9] Switching current symlink atomically..."
    local tmp_link="$DEPLOY_ROOT/.current.new"
    ln -sfn "$RELEASE_DIR" "$tmp_link"
    mv -Tf "$tmp_link" "$CURRENT_LINK"
    SWITCHED=1
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

    ARBITRUM_ALCHEMY_KEY=""
    if [ -f "$ENV_FILE" ]; then
        ARBITRUM_ALCHEMY_KEY="$(grep -E '^ARBITRUM_ALCHEMY_KEY=' "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- | tr -d '\"'\''[:space:]' || true)"
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

    location /perpl-api/ {
        proxy_pass https://app.perpl.xyz/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host app.perpl.xyz;
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Origin "https://app.perpl.xyz";
        proxy_set_header Referer "https://app.perpl.xyz/";
        proxy_set_header Accept-Encoding "";
        proxy_cookie_domain app.perpl.xyz $host;
        proxy_cookie_domain .perpl.xyz $host;
        proxy_cookie_path /api/v1/ /;
        proxy_cookie_path / /;
        gzip off;
    }

    location /perpl-ws/ {
        proxy_pass https://app.perpl.xyz/ws/v1/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host app.perpl.xyz;
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Origin "https://app.perpl.xyz";
        proxy_set_header Referer "https://app.perpl.xyz/";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /rpc/solana-ws {
        proxy_pass https://api.mainnet-beta.solana.com/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host api.mainnet-beta.solana.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /rpc/solana {
        proxy_pass https://solana-rpc.publicnode.com/;
        proxy_http_version 1.1;
        proxy_set_header Host solana-rpc.publicnode.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location /rpc/solana-leorpc {
        proxy_pass https://solana.leorpc.com/?api_key=FREE;
        proxy_http_version 1.1;
        proxy_set_header Host solana.leorpc.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location /rpc/arb-alchemy {
        proxy_pass https://arb-mainnet.g.alchemy.com/v2/__ARBITRUM_ALCHEMY_KEY__;
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
        add_header Cache-Control "no-cache, no-store, must-revalidate";
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

    if [ -n "$ARBITRUM_ALCHEMY_KEY" ]; then
        sed -i "s|__ARBITRUM_ALCHEMY_KEY__|$ARBITRUM_ALCHEMY_KEY|g" /etc/nginx/sites-available/$DOMAIN
    else
        sed -i 's|proxy_pass https://arb-mainnet.g.alchemy.com/v2/__ARBITRUM_ALCHEMY_KEY__;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        log "ARBITRUM_ALCHEMY_KEY is not set; /rpc/arb-alchemy will return 503 and clients should use fallback RPCs."
    fi

    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    ln -sf /etc/nginx/sites-available/$MCP_DOMAIN /etc/nginx/sites-enabled/
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

    if [ -f "$CURRENT_LINK/mcp/src/server.mjs" ]; then
        pm2 delete clash-mcp 2>/dev/null || true
        pm2 start "$CURRENT_LINK/mcp/src/server.mjs" \
            --name clash-mcp \
            --cwd "$CURRENT_LINK/mcp" \
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
    validate_source_dir
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
    echo "MCP:       https://$MCP_DOMAIN/mcp"
    echo "Skills:    https://$MCP_DOMAIN/skills.md"
    echo "Release:   $RELEASE_DIR"
    echo "Current:   $(readlink -f "$CURRENT_LINK")"
    echo ""
    echo "Useful commands:"
    echo "  pm2 logs clash-api"
    echo "  pm2 logs clash-futures"
    echo "  pm2 logs clash-mcp"
    echo "  bash $DEPLOY_ROOT/deploy/update.sh"
    echo "  ln -sfn <release-dir> $DEPLOY_ROOT/.current.rollback && mv -Tf $DEPLOY_ROOT/.current.rollback $CURRENT_LINK"
}

main "$@"
