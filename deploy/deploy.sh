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

DOMAIN="${CLASH_DOMAIN:-clashofperps.fun}"
MCP_DOMAIN="${CLASH_MCP_DOMAIN:-mcp.$DOMAIN}"
EMAIL="egor4042007@gmail.com"
DEPLOY_ROOT="/opt/clash"
RELEASES_DIR="$DEPLOY_ROOT/releases"
SHARED_DIR="$DEPLOY_ROOT/shared"
CURRENT_LINK="$DEPLOY_ROOT/current"
KEEP_RELEASES="${KEEP_RELEASES:-2}"
BACKUP_RETENTION_DAYS="${CLASH_BACKUP_RETENTION_DAYS:-3}"
BACKUP_KEEP="${CLASH_BACKUP_KEEP:-1}"
BACKUP_SQLITE_TIMEOUT_SECONDS="${CLASH_BACKUP_SQLITE_TIMEOUT_SECONDS:-}"
BACKUP_SQLITE_TIMEOUT_MIN_SECONDS="${CLASH_BACKUP_SQLITE_TIMEOUT_MIN_SECONDS:-600}"
BACKUP_SQLITE_TIMEOUT_MIB_PER_SECOND="${CLASH_BACKUP_SQLITE_TIMEOUT_MIB_PER_SECOND:-1}"
BACKUP_SQLITE_TIMEOUT_MAX_SECONDS="${CLASH_BACKUP_SQLITE_TIMEOUT_MAX_SECONDS:-7200}"

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
OWNED_ASSETS_MANIFEST="$WEB_DIST/.clash-owned-assets"

SHARED_SERVER_DIR="$SHARED_DIR/server"
SHARED_FUTURES_DIR="$SHARED_DIR/server-futures"
ENV_FILE="$SHARED_DIR/.env"
NPM_CACHE_DIR="${CLASH_NPM_CACHE_DIR:-$SHARED_DIR/npm-cache}"
export NPM_CONFIG_CACHE="$NPM_CACHE_DIR"

BOOTSTRAPPED_LEGACY_DBS=0
SWITCHED=0
LOCK_DIR=""

log() {
    echo "[$(date -u +%H:%M:%S)] $*"
}

die() {
    echo "ERROR: $*" >&2
    if declare -F cleanup_failed_release >/dev/null 2>&1; then
        cleanup_failed_release || true
    fi
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

cleanup_deploy_lock() {
    if [ -n "${LOCK_DIR:-}" ] && [ -d "$LOCK_DIR" ]; then
        rmdir "$LOCK_DIR" 2>/dev/null || true
    fi
}

on_deploy_error() {
    cleanup_failed_release
}

on_deploy_interrupt() {
    cleanup_failed_release
    exit 130
}

trap on_deploy_error ERR
trap on_deploy_interrupt INT TERM
trap cleanup_deploy_lock EXIT

acquire_deploy_lock() {
    mkdir -p "$DEPLOY_ROOT"
    if command -v flock >/dev/null 2>&1; then
        exec 9>"$DEPLOY_ROOT/.deploy.lock"
        flock -n 9 || die "Another deploy is already running. Stop it first or wait for it to finish."
        return
    fi

    LOCK_DIR="$DEPLOY_ROOT/.deploy.lock.d"
    mkdir "$LOCK_DIR" 2>/dev/null || die "Another deploy is already running. Stop it first or wait for it to finish."
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

env_file_value() {
    local key="$1"
    [ -f "$ENV_FILE" ] || return 0
    grep -E "^${key}=" "$ENV_FILE" 2>/dev/null \
        | tail -n 1 \
        | cut -d= -f2- \
        | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//" \
        || true
}

first_env_file_value() {
    local key value
    for key in "$@"; do
        value="$(env_file_value "$key")"
        if [ -n "$value" ]; then
            printf '%s' "$value"
            return 0
        fi
    done
}

sed_escape_replacement() {
    printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'
}

load_vite_env_for_build() {
    # Vite only embeds variables that are present in the build process env and
    # start with VITE_. Release copies intentionally exclude .env files, so
    # production-only public config (Privy app id, Aptos/Arbitrum API keys)
    # must be lifted from /opt/clash/shared/.env before npm run build.
    unset VITE_HELIUS_API_KEY VITE_SOLANA_HELIUS_API_KEY VITE_SOLANA_TATUM_API_KEY VITE_TATUM_API_KEY VITE_SOLANA_ALCHEMY_API_KEY VITE_ALCHEMY_SOLANA_API_KEY
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
                case "$key" in
                    VITE_HELIUS_API_KEY|VITE_SOLANA_HELIUS_API_KEY|VITE_SOLANA_TATUM_API_KEY|VITE_TATUM_API_KEY|VITE_SOLANA_ALCHEMY_API_KEY|VITE_ALCHEMY_SOLANA_API_KEY|VITE_SOLANA_PRE_SIGN_SIMULATION)
                        continue
                        ;;
                esac
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
    apt-get install -y -qq nginx certbot python3-certbot-nginx curl rsync brotli sqlite3 zstd

    if ! command -v node >/dev/null 2>&1; then
        log "Installing Node.js 20..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y -qq nodejs
    fi

    if ! command -v pm2 >/dev/null 2>&1; then
        mkdir -p "$NPM_CACHE_DIR"
        npm install -g pm2
    fi

    if ! nginx -V 2>&1 | grep -qi brotli \
        && [ ! -f /usr/lib/nginx/modules/ngx_http_brotli_static_module.so ]; then
        apt-get install -y -qq libnginx-mod-http-brotli-static libnginx-mod-http-brotli-filter 2>/dev/null \
            || log "brotli nginx module not available; gzip_static will still be used."
    fi
}

prepare_shared_runtime() {
    log "[2/9] Preparing shared runtime..."
    mkdir -p "$RELEASES_DIR" "$SHARED_SERVER_DIR" "$SHARED_FUTURES_DIR" "$SHARED_DIR/backups" "$NPM_CACHE_DIR"
    local hermes_model_chain="openai/gpt-oss-120b,qwen/qwen3-30b-a3b-instruct-2507:nitro,google/gemma-4-26b-a4b-it:nitro"
    local hermes_primary_model="openai/gpt-oss-120b"
    local hermes_fallback_model="qwen/qwen3-30b-a3b-instruct-2507:nitro"

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
                printf '%s\n' DECIBEL_BUILDER_FEE_BPS=1
                printf '%s\n' NADO_SUBACCOUNT_NAME=default
                printf '%s\n' NADO_FILL_LOOKBACK_LIMIT=100
                printf '%s\n' VITE_NADO_SUBACCOUNT_NAME=default
                printf '%s\n' VITE_NADO_BUILDER_ID=3600
                printf '%s\n' VITE_NADO_BUILDER_FEE_RATE=10
                printf '%s\n' GRVT_BUILDER_ACCOUNT_ID=0x5d2c800b71f71fcf6bbf990f25ec39de09a87b45
                printf '%s\n' GRVT_BUILDER_X_ACCOUNT_ID=3973781287105049
                printf '%s\n' GRVT_BUILDER_API_KEY=
                printf '%s\n' GRVT_BUILDER_FEE_BPS=1
                printf '%s\n' GRVT_BUILDER_FEE_RATE=0.01
                printf '%s\n' VITE_GRVT_BUILDER_ACCOUNT_ID=0x5d2c800b71f71fcf6bbf990f25ec39de09a87b45
                printf '%s\n' VITE_GRVT_BUILDER_FEE_BPS=1
                printf '%s\n' VITE_GRVT_BUILDER_FEE_RATE=0.01
                printf '%s\n' HOTSTUFF_BROKER_ADDRESS=0xB36402e87a86206D3a114a98B53f31362291fe1B
                printf '%s\n' HOTSTUFF_BROKER_FEE_RATE=0.0001
                printf '%s\n' VITE_HOTSTUFF_BROKER_ADDRESS=0xB36402e87a86206D3a114a98B53f31362291fe1B
                printf '%s\n' VITE_HOTSTUFF_BROKER_FEE_RATE=0.0001
                printf '%s\n' VITE_HIBACHI_REFERRAL_URL=https://hibachi.xyz/r/M4S4XNAGP4
                printf '%s\n' KATANA_PERPS_REFERRAL_CODE=CLASHOFPERPS
                printf '%s\n' VITE_KATANA_PERPS_REFERRAL_CODE=CLASHOFPERPS
                printf '%s\n' GMTRADE_APP_URL=https://gmtrade.xyz/trade
                printf '%s\n' GMTRADE_SOLANA_RPC_URL=https://rpc-1.gmtrade.xyz/
                printf '%s\n' GMTRADE_RPC_ORIGIN=https://gmtrade.xyz
                printf '%s\n' GMTRADE_ENABLE_NODE_SDK_BUILDER=1
                printf '%s\n' GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS=0
                printf '%s\n' NFT_INK_RPC_URL=https://rpc-gel.inkonchain.com
                printf '%s\n' INK_RPC_URL=https://rpc-gel.inkonchain.com
                printf '%s\n' GAME_SHOP_INK_RPC_URL=https://rpc-gel.inkonchain.com
                printf '%s\n' NFT_INK_USDC_TOKEN=0x2D270e6886d130D724215A266106e6832161EAEd
                printf '%s\n' GAME_SHOP_INK_USDC_TOKEN=0x2D270e6886d130D724215A266106e6832161EAEd
                printf '%s\n' MARKETPLACE_INK_USDC=0x2D270e6886d130D724215A266106e6832161EAEd
                printf '%s\n' MARKETPLACE_INK_CONTRACT=0x8290ab5e90db8bbf46c900b536bb5fdd7500d5e2
                printf '%s\n' NFT_INK_CONTRACT=0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F
                printf '%s\n' NFT_INK_SHOP_CONTRACT=0x4500d3fe42ad88f541e9e382b21bda3535dfd96b
                printf '%s\n' NFT_INK_TOKEN_URI=https://clashofperps.fun/api/nft/ink/
                printf '%s\n' NFT_INK_BASE_TOKEN_URI=https://clashofperps.fun/api/nft/ink/
                printf '%s\n' NFT_INK_USD_PRICE=8.9
                printf '%s\n' NFT_INK_USD_PRICE_E6=8900000
                printf '%s\n' NFT_INK_SHOP_SALE_ACTIVE=1
                printf '%s\n' GAME_SHOP_INK_SALE_ACTIVE=1
                printf '%s\n' NFT_INK_NATIVE_ALLOWED=1
                printf '%s\n' NFT_INK_USDC_ALLOWED=1
                printf '%s\n' VITE_INK_CHAIN_ID=57073
                printf '%s\n' VITE_INK_RPC_URL=https://rpc-gel.inkonchain.com
                printf '%s\n' VITE_INK_RPC_URLS=https://rpc-gel.inkonchain.com,https://rpc-qnd.inkonchain.com,https://ink.drpc.org
                printf '%s\n' VITE_INK_EXPLORER_URL=https://explorer.inkonchain.com
                printf '%s\n' VITE_NFT_INK_CONTRACT=0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F
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
    ensure_env_default "DECIBEL_BUILDER_FEE_BPS" "1"
    ensure_env_default "HYPERLIQUID_BUILDER_FEE_TENTH_BPS" "10"
    ensure_env_default "VITE_HYPERLIQUID_BUILDER_FEE_TENTH_BPS" "10"
    ensure_env_default "PHOENIX_FLIGHT_BUILDER_FEE_BPS" "1"
    ensure_env_default "VITE_PHOENIX_FLIGHT_BUILDER_FEE_BPS" "1"
    ensure_env_default "NADO_SUBACCOUNT_NAME" "default"
    ensure_env_default "NADO_FILL_LOOKBACK_LIMIT" "100"
    ensure_env_default "VITE_NADO_SUBACCOUNT_NAME" "default"
    ensure_env_default "VITE_NADO_BUILDER_ID" "3600"
    ensure_env_default "VITE_NADO_BUILDER_FEE_RATE" "10"
    ensure_env_default "GRVT_BUILDER_ACCOUNT_ID" "0x5d2c800b71f71fcf6bbf990f25ec39de09a87b45"
    ensure_env_default "GRVT_BUILDER_X_ACCOUNT_ID" "3973781287105049"
    ensure_env_default "GRVT_BUILDER_API_KEY" ""
    ensure_env_default "GRVT_BUILDER_FEE_BPS" "1"
    ensure_env_default "GRVT_BUILDER_FEE_RATE" "0.01"
    ensure_env_default "VITE_GRVT_BUILDER_ACCOUNT_ID" "0x5d2c800b71f71fcf6bbf990f25ec39de09a87b45"
    ensure_env_default "VITE_GRVT_BUILDER_FEE_BPS" "1"
    ensure_env_default "VITE_GRVT_BUILDER_FEE_RATE" "0.01"
    ensure_env_default "HOTSTUFF_BROKER_ADDRESS" "0xB36402e87a86206D3a114a98B53f31362291fe1B"
    ensure_env_default "HOTSTUFF_BROKER_FEE_RATE" "0.0001"
    ensure_env_default "VITE_HOTSTUFF_BROKER_ADDRESS" "0xB36402e87a86206D3a114a98B53f31362291fe1B"
    ensure_env_default "VITE_HOTSTUFF_BROKER_FEE_RATE" "0.0001"
    ensure_env_default "VITE_HIBACHI_REFERRAL_URL" "https://hibachi.xyz/r/M4S4XNAGP4"
    ensure_env_default "KATANA_PERPS_API_URL" "https://api-perps.katana.network/v1"
    ensure_env_default "KATANA_PERPS_APP_URL" "https://perps.katana.network"
    ensure_env_default "KATANA_PERPS_REFERRAL_CODE" "CLASHOFPERPS"
    ensure_env_default "VITE_KATANA_PERPS_REFERRAL_CODE" "CLASHOFPERPS"
    ensure_env_default "GMTRADE_APP_URL" "https://gmtrade.xyz/trade"
    ensure_env_default "GMTRADE_SOLANA_RPC_URL" "https://rpc-1.gmtrade.xyz/"
    ensure_env_default "GMTRADE_RPC_ORIGIN" "https://gmtrade.xyz"
    ensure_env_default "GMTRADE_ENABLE_NODE_SDK_BUILDER" "1"
    ensure_env_default "GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS" "0"
    ensure_env_default "NFT_INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    ensure_env_default "INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    ensure_env_default "GAME_SHOP_INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    ensure_env_default "NFT_INK_USDC_TOKEN" "0x2D270e6886d130D724215A266106e6832161EAEd"
    ensure_env_default "GAME_SHOP_INK_USDC_TOKEN" "0x2D270e6886d130D724215A266106e6832161EAEd"
    ensure_env_default "MARKETPLACE_INK_USDC" "0x2D270e6886d130D724215A266106e6832161EAEd"
    ensure_env_default "MARKETPLACE_INK_CONTRACT" "0x8290ab5e90db8bbf46c900b536bb5fdd7500d5e2"
    ensure_env_default "NFT_INK_CONTRACT" "0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F"
    ensure_env_default "NFT_INK_SHOP_CONTRACT" "0x4500d3fe42ad88f541e9e382b21bda3535dfd96b"
    ensure_env_default "NFT_INK_TOKEN_URI" "https://clashofperps.fun/api/nft/ink/"
    ensure_env_default "NFT_INK_BASE_TOKEN_URI" "https://clashofperps.fun/api/nft/ink/"
    ensure_env_default "NFT_INK_USD_PRICE" "8.9"
    ensure_env_default "NFT_INK_USD_PRICE_E6" "8900000"
    ensure_env_default "NFT_INK_SHOP_SALE_ACTIVE" "1"
    ensure_env_default "GAME_SHOP_INK_SALE_ACTIVE" "1"
    ensure_env_default "NFT_INK_NATIVE_ALLOWED" "1"
    ensure_env_default "NFT_INK_USDC_ALLOWED" "1"
    ensure_env_default "VITE_INK_CHAIN_ID" "57073"
    ensure_env_default "VITE_INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    ensure_env_default "VITE_INK_RPC_URLS" "https://rpc-gel.inkonchain.com,https://rpc-qnd.inkonchain.com,https://ink.drpc.org"
    ensure_env_default "VITE_INK_EXPLORER_URL" "https://explorer.inkonchain.com"
    ensure_env_default "VITE_NFT_INK_CONTRACT" "0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F"
    ensure_env_default "CLASH_WALLET_ENCRYPTION_KEY" "$(openssl rand -hex 32)"
    ensure_env_default "VITE_PRIVY_APP_ID" ""
    ensure_env_default "VITE_APTOS_NODE_API_KEY" ""
    ensure_env_default "VITE_ARBITRUM_RPC_URL" ""
    ensure_env_default "VITE_SOLANA_RPC_URL" ""
    ensure_env_default "ETHEREUM_ALCHEMY_KEY" ""
    ensure_env_default "BASE_ALCHEMY_KEY" ""
    ensure_env_default "SOLANA_ALCHEMY_API_KEY" ""
    ensure_env_default "SOLANA_HELIUS_API_KEY" ""
    ensure_env_default "SOLANA_TATUM_API_KEY" ""
    ensure_env_default "VITE_ETHEREUM_ENABLE_PUBLIC_RPC" "1"
    ensure_env_default "VITE_ETHEREUM_ENABLE_ALCHEMY_RPC" "1"
    ensure_env_default "VITE_BASE_ENABLE_PUBLIC_RPC" "1"
    ensure_env_default "VITE_BASE_ENABLE_ALCHEMY_RPC" "1"
    ensure_env_default "VITE_ARBITRUM_ENABLE_PUBLIC_RPC" "1"
    ensure_env_default "VITE_ARBITRUM_ENABLE_ALCHEMY_RPC" "1"
    ensure_env_default "VITE_SOLANA_ENABLE_ALCHEMY_RPC" "1"
    ensure_env_default "VITE_SOLANA_ENABLE_PUBLIC_RPC" "1"
    ensure_env_default "VITE_SOLANA_ENABLE_TATUM_RPC" "0"
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
    ensure_env_default "CLASH_HERMES_ORCHESTRATOR_URL" "http://127.0.0.1:8600"
    ensure_env_default "CLASH_HERMES_ORCHESTRATOR_TOKEN" ""
    ensure_env_default "CLASH_HERMES_MODEL_CHAIN" "$hermes_model_chain"
    ensure_env_default "CLASH_HERMES_PRIMARY_MODEL" "$hermes_primary_model"
    ensure_env_default "CLASH_HERMES_FALLBACK_MODEL" "$hermes_fallback_model"
    ensure_env_default "CLASH_HERMES_PROVIDER_ORDER" "cerebras"
    ensure_env_default "CLASH_HERMES_PRIMARY_RETRIES" "3"
    ensure_env_default "CLASH_HERMES_FALLBACK_AFTER_RETRIES" "3"
    ensure_env_default "CLASH_HERMES_ACTION_PRIMARY_RETRIES" "1"
    ensure_env_default "CLASH_HERMES_ACTION_FALLBACK_RETRIES" "1"
    ensure_env_default "CLASH_HERMES_ACTION_CHAT_TIMEOUT_MS" "240000"
    ensure_env_default "CLASH_HERMES_BACKEND_TIMEOUT_MS" "300000"

    set_env_value "NODE_ENV" "production"
    set_env_value "DECIBEL_BUILDER_FEE_BPS" "1"
    set_env_value "HYPERLIQUID_BUILDER_FEE_TENTH_BPS" "10"
    set_env_value "VITE_HYPERLIQUID_BUILDER_FEE_TENTH_BPS" "10"
    set_env_value "PHOENIX_FLIGHT_BUILDER_FEE_BPS" "1"
    set_env_value "VITE_PHOENIX_FLIGHT_BUILDER_FEE_BPS" "1"
    set_env_value "NADO_SUBACCOUNT_NAME" "default"
    set_env_value "NADO_FILL_LOOKBACK_LIMIT" "100"
    set_env_value "VITE_NADO_SUBACCOUNT_NAME" "default"
    set_env_value "VITE_NADO_BUILDER_ID" "3600"
    set_env_value "VITE_NADO_BUILDER_FEE_RATE" "10"
    set_env_value "GRVT_BUILDER_ACCOUNT_ID" "0x5d2c800b71f71fcf6bbf990f25ec39de09a87b45"
    set_env_value "GRVT_BUILDER_X_ACCOUNT_ID" "3973781287105049"
    set_env_value "GRVT_BUILDER_FEE_BPS" "1"
    set_env_value "GRVT_BUILDER_FEE_RATE" "0.01"
    set_env_value "VITE_GRVT_BUILDER_ACCOUNT_ID" "0x5d2c800b71f71fcf6bbf990f25ec39de09a87b45"
    set_env_value "VITE_GRVT_BUILDER_FEE_BPS" "1"
    set_env_value "VITE_GRVT_BUILDER_FEE_RATE" "0.01"
    set_env_value "HOTSTUFF_BROKER_ADDRESS" "0xB36402e87a86206D3a114a98B53f31362291fe1B"
    set_env_value "HOTSTUFF_BROKER_FEE_RATE" "0.0001"
    set_env_value "VITE_HOTSTUFF_BROKER_ADDRESS" "0xB36402e87a86206D3a114a98B53f31362291fe1B"
    set_env_value "VITE_HOTSTUFF_BROKER_FEE_RATE" "0.0001"
    set_env_value "VITE_HIBACHI_REFERRAL_URL" "https://hibachi.xyz/r/M4S4XNAGP4"
    set_env_value "KATANA_PERPS_REFERRAL_CODE" "CLASHOFPERPS"
    set_env_value "VITE_KATANA_PERPS_REFERRAL_CODE" "CLASHOFPERPS"
    set_env_value "GMTRADE_ENABLE_NODE_SDK_BUILDER" "1"
    set_env_value "GMTRADE_ALLOW_CLIENT_NOTIONAL_REPORTS" "0"
    set_env_value "NFT_INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    set_env_value "INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    set_env_value "GAME_SHOP_INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    set_env_value "NFT_INK_USDC_TOKEN" "0x2D270e6886d130D724215A266106e6832161EAEd"
    set_env_value "GAME_SHOP_INK_USDC_TOKEN" "0x2D270e6886d130D724215A266106e6832161EAEd"
    set_env_value "MARKETPLACE_INK_USDC" "0x2D270e6886d130D724215A266106e6832161EAEd"
    set_env_value "MARKETPLACE_INK_CONTRACT" "0x8290ab5e90db8bbf46c900b536bb5fdd7500d5e2"
    set_env_value "NFT_INK_CONTRACT" "0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F"
    set_env_value "NFT_INK_SHOP_CONTRACT" "0x4500d3fe42ad88f541e9e382b21bda3535dfd96b"
    set_env_value "NFT_INK_TOKEN_URI" "https://clashofperps.fun/api/nft/ink/"
    set_env_value "NFT_INK_BASE_TOKEN_URI" "https://clashofperps.fun/api/nft/ink/"
    set_env_value "NFT_INK_USD_PRICE" "8.9"
    set_env_value "NFT_INK_USD_PRICE_E6" "8900000"
    set_env_value "NFT_INK_SHOP_SALE_ACTIVE" "1"
    set_env_value "GAME_SHOP_INK_SALE_ACTIVE" "1"
    set_env_value "NFT_INK_NATIVE_ALLOWED" "1"
    set_env_value "NFT_INK_USDC_ALLOWED" "1"
    set_env_value "VITE_INK_CHAIN_ID" "57073"
    set_env_value "VITE_INK_RPC_URL" "https://rpc-gel.inkonchain.com"
    set_env_value "VITE_INK_RPC_URLS" "https://rpc-gel.inkonchain.com,https://rpc-qnd.inkonchain.com,https://ink.drpc.org"
    set_env_value "VITE_INK_EXPLORER_URL" "https://explorer.inkonchain.com"
    set_env_value "VITE_NFT_INK_CONTRACT" "0x5Cc846B2bA0f030A5165a456eD903A5989E19F3F"
    set_env_value "CLASH_MAIN_DB" "$SHARED_SERVER_DIR/clash.db"
    set_env_value "CLASH_FUTURES_DB" "$SHARED_FUTURES_DIR/futures.db"
    set_env_value "CLASH_MCP_PUBLIC_URL" "https://$MCP_DOMAIN"
    set_env_value "CLASH_GAME_API_URL" "http://127.0.0.1:4000/api"
    set_env_value "CLASH_HERMES_MODEL_CHAIN" "$hermes_model_chain"
    set_env_value "CLASH_HERMES_PRIMARY_MODEL" "$hermes_primary_model"
    set_env_value "CLASH_HERMES_FALLBACK_MODEL" "$hermes_fallback_model"
    set_env_value "CLASH_HERMES_PROVIDER_ORDER" "cerebras"
    set_env_value "CLASH_HERMES_PRIMARY_RETRIES" "3"
    set_env_value "CLASH_HERMES_FALLBACK_AFTER_RETRIES" "3"
    set_env_value "CLASH_HERMES_ACTION_PRIMARY_RETRIES" "1"
    set_env_value "CLASH_HERMES_ACTION_FALLBACK_RETRIES" "1"
    set_env_value "CLASH_HERMES_ACTION_CHAT_TIMEOUT_MS" "240000"
    set_env_value "CLASH_HERMES_BACKEND_TIMEOUT_MS" "300000"
    set_env_value "VITE_SOLANA_ENABLE_TATUM_RPC" "0"
    set_env_value "SOLANA_ENABLE_TATUM_RPC" "0"

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
    if [ "${CLASH_SKIP_SHARED_BACKUP:-0}" = "1" ]; then
        log "Skipping shared DB backup because CLASH_SKIP_SHARED_BACKUP=1"
        return 0
    fi

    local ts
    ts="$(date -u +%Y%m%d%H%M%S)"
    local backup_dir="$SHARED_DIR/backups/$ts"
    mkdir -p "$backup_dir/server" "$backup_dir/server-futures"
    stop_services_for_database_backup
    backup_sqlite_db "$SHARED_SERVER_DIR/clash.db" "$backup_dir/server/clash.db" || true
    backup_sqlite_db "$SHARED_FUTURES_DIR/futures.db" "$backup_dir/server-futures/futures.db" || true
    resume_services_after_database_backup
    if [ -f "$ENV_FILE" ]; then
        cp -a "$ENV_FILE" "$backup_dir/.env"
        chmod 600 "$backup_dir/.env" || true
    fi
    log "Shared backup written to $backup_dir"
    prune_shared_backups
}

compress_backup_file() {
    local file="$1"
    if command -v zstd >/dev/null 2>&1; then
        zstd -q -T1 -6 --rm "$file"
    else
        gzip -f -9 "$file"
    fi
}

nginx_brotli_static_available() {
    nginx -V 2>&1 | grep -qi brotli && return 0
    [ -f /usr/lib/nginx/modules/ngx_http_brotli_static_module.so ] && return 0
    [ -e /etc/nginx/modules-enabled/50-mod-http-brotli-static.conf ] && return 0
    return 1
}

sqlite_backup_timeout_seconds() {
    local src="$1"

    if [[ "$BACKUP_SQLITE_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] && [ "$BACKUP_SQLITE_TIMEOUT_SECONDS" -gt 0 ]; then
        echo "$BACKUP_SQLITE_TIMEOUT_SECONDS"
        return 0
    fi

    local min_seconds="$BACKUP_SQLITE_TIMEOUT_MIN_SECONDS"
    if ! [[ "$min_seconds" =~ ^[0-9]+$ ]] || [ "$min_seconds" -le 0 ]; then
        min_seconds=600
    fi

    local mib_per_second="$BACKUP_SQLITE_TIMEOUT_MIB_PER_SECOND"
    if ! [[ "$mib_per_second" =~ ^[0-9]+$ ]] || [ "$mib_per_second" -le 0 ]; then
        mib_per_second=1
    fi

    local bytes mib size_timeout
    bytes="$(stat -c '%s' "$src" 2>/dev/null || echo 0)"
    if ! [[ "$bytes" =~ ^[0-9]+$ ]]; then
        bytes=0
    fi
    mib=$(( (bytes + 1048575) / 1048576 ))
    size_timeout=$(( (mib + mib_per_second - 1) / mib_per_second ))
    local computed=$(( min_seconds + size_timeout ))
    local max_seconds="$BACKUP_SQLITE_TIMEOUT_MAX_SECONDS"
    if ! [[ "$max_seconds" =~ ^[0-9]+$ ]] || [ "$max_seconds" -le 0 ]; then
        echo "$computed"
        return 0
    fi
    if [ "$max_seconds" -lt "$min_seconds" ]; then
        max_seconds="$min_seconds"
    fi
    if [[ "$max_seconds" =~ ^[0-9]+$ ]] && [ "$max_seconds" -gt 0 ] && [ "$computed" -gt "$max_seconds" ]; then
        echo "$max_seconds"
        return 0
    fi
    echo "$computed"
}

checkpoint_sqlite_db() {
    local src="$1"
    timeout 30s sqlite3 "$src" "PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || \
        log "WARNING: SQLite WAL checkpoint failed before backup for $src"
}

backup_sqlite_db() {
    local src="$1"
    local dst="$2"
    [ -f "$src" ] || return 0

    local tmp="${dst}.tmp"
    local timeout_seconds size_label
    timeout_seconds="$(sqlite_backup_timeout_seconds "$src")"
    size_label="$(du -h "$src" 2>/dev/null | awk '{print $1}' || true)"
    [ -n "$size_label" ] || size_label="unknown size"
    mkdir -p "$(dirname "$dst")"
    rm -f "$dst" "$dst.zst" "$dst.gz" "$tmp" "$tmp.zst" "$tmp.gz" "$tmp-journal"
    checkpoint_sqlite_db "$src"
    log "Backing up SQLite DB $src (${size_label}) with ${timeout_seconds}s timeout"
    if ! timeout "${timeout_seconds}s" sqlite3 "$src" ".backup '$tmp'"; then
        rm -f "$tmp" "$tmp.zst" "$tmp.gz" "$tmp-journal"
        log "WARNING: SQLite backup timed out or failed for $src after ${timeout_seconds}s"
        return 1
    fi
    mv -f "$tmp" "$dst"
    chmod 600 "$dst" || true
    compress_backup_file "$dst"
}

prune_shared_backups() {
    local backups_dir="$SHARED_DIR/backups"
    [ -d "$backups_dir" ] || return 0

    local pruned=0
    while IFS= read -r -d '' old; do
        rm -rf -- "$old"
        pruned=$((pruned + 1))
    done < <(find "$backups_dir" -mindepth 1 -maxdepth 1 -type d -mtime "+$BACKUP_RETENTION_DAYS" -print0)

    if [[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] && [ "$BACKUP_KEEP" -gt 0 ]; then
        local kept=0 backup
        while IFS= read -r backup; do
            [ -n "$backup" ] || continue
            kept=$((kept + 1))
            if [ "$kept" -gt "$BACKUP_KEEP" ]; then
                rm -rf -- "$backup"
                pruned=$((pruned + 1))
            fi
        done < <(find "$backups_dir" -mindepth 1 -maxdepth 1 -type d -printf '%f\t%p\n' | sort -r | cut -f2-)
    fi

    if [ "$pruned" -gt 0 ]; then
        log "Pruned $pruned shared backup(s); retention=${BACKUP_RETENTION_DAYS}d keep=$BACKUP_KEEP"
    fi
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
        --exclude='relaunch' \
        --exclude='deploy/migration' \
        --exclude='clash-migration-portal.zip' \
        --exclude='lv_*.mp4' \
        --exclude='tmp' \
        --exclude='.tmp' \
        --exclude='.tmp-*' \
        --exclude='android-keystore' \
        --exclude='twa' \
        --exclude='backups' \
        --exclude='server-futures/gmtrade-builder/target' \
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

previous_dist_file() {
    local rel_path="$1"
    local previous_file="$CURRENT_LINK/web/dist/$rel_path"
    [ -f "$previous_file" ] || return 1
    printf '%s' "$previous_file"
}

compress_static_file() {
    local rel_path="$1"
    local brotli_quality="$2"
    local file="$WEB_DIST/$rel_path"
    local previous_file=""

    [ -f "$file" ] || return 0

    if previous_file="$(previous_dist_file "$rel_path")" \
        && [ -f "$previous_file.br" ] \
        && [ -f "$previous_file.gz" ] \
        && cmp -s "$file" "$previous_file"; then
        cp -a "$previous_file.br" "$file.br"
        cp -a "$previous_file.gz" "$file.gz"
        touch -r "$file" "$file.br" "$file.gz" 2>/dev/null || true
        STATIC_REUSED=$((STATIC_REUSED + 1))
        case "$rel_path" in
            godot/*) GODOT_REUSED=$((GODOT_REUSED + 1)) ;;
        esac
        return 0
    fi

    brotli -f -q "$brotli_quality" -o "$file.br" "$file"
    gzip -f -k -9 "$file"
    STATIC_COMPRESSED=$((STATIC_COMPRESSED + 1))
    case "$rel_path" in
        godot/*) GODOT_COMPRESSED=$((GODOT_COMPRESSED + 1)) ;;
    esac
}

write_owned_assets_manifest() {
    [ -d "$WEB_DIST/assets" ] || return 0
    find "$WEB_DIST/assets" -maxdepth 1 -type f -printf '%f\n' | sort > "$OWNED_ASSETS_MANIFEST"
}

preserve_previous_frontend_assets() {
    local previous_assets="$CURRENT_LINK/web/dist/assets"
    local previous_manifest="$CURRENT_LINK/web/dist/.clash-owned-assets"
    local new_assets="$WEB_DIST/assets"
    [ -d "$previous_assets" ] || return 0
    [ -d "$new_assets" ] || return 0

    local copied=0
    if [ -f "$previous_manifest" ]; then
        local name src dest
        while IFS= read -r name || [ -n "$name" ]; do
            [ -n "$name" ] || continue
            src="$previous_assets/$name"
            dest="$new_assets/$name"
            if [ -f "$src" ] && [ ! -e "$dest" ]; then
                cp -a "$src" "$dest"
                copied=$((copied + 1))
            fi
        done < "$previous_manifest"
    else
        log "No previous asset manifest; preserving one legacy asset set."
        while IFS= read -r -d '' src; do
            local dest="$new_assets/$(basename "$src")"
            if [ ! -e "$dest" ]; then
                cp -a "$src" "$dest"
                copied=$((copied + 1))
            fi
        done < <(find "$previous_assets" -maxdepth 1 -type f -print0)
    fi

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

    node "$WEB_DIR/write-godot-runtime-manifest.cjs" "$WEB_DIST/godot" "$RELEASE_ID"

    if [ "${CLASH_SKIP_STATIC_COMPRESSION:-0}" = "1" ]; then
        log "Static compression skipped by CLASH_SKIP_STATIC_COMPRESSION=1"
        write_owned_assets_manifest
        preserve_previous_frontend_assets
        slim_runtime_release
        return
    fi

    log "Compressing static assets..."
    STATIC_COMPRESSED=0
    STATIC_REUSED=0
    GODOT_COMPRESSED=0
    GODOT_REUSED=0

    compress_static_file "godot/Work.pck" 9
    compress_static_file "godot/Work.wasm" 6
    compress_static_file "godot/Work.js" 6

    for f in "$WEB_DIST"/assets/*.js "$WEB_DIST"/assets/*.css; do
        if [ -f "$f" ]; then
            compress_static_file "assets/$(basename "$f")" 6
        fi
    done

    if [ "$GODOT_REUSED" -gt 0 ] && [ "$GODOT_COMPRESSED" -eq 0 ]; then
        log "Godot export unchanged; reused compressed Godot artifacts from current release."
    fi
    log "Static compression: compressed=$STATIC_COMPRESSED reused=$STATIC_REUSED godot_compressed=$GODOT_COMPRESSED godot_reused=$GODOT_REUSED"
    write_owned_assets_manifest
    preserve_previous_frontend_assets
    slim_runtime_release
}

slim_runtime_release() {
    log "Slimming runtime release..."

    local path removed=0
    for path in \
        "$RELEASE_DIR/.codex" \
        "$RELEASE_DIR/.logs" \
        "$RELEASE_DIR/.tmp" \
        "$RELEASE_DIR/Model" \
        "$RELEASE_DIR/Musik" \
        "$RELEASE_DIR/assets" \
        "$RELEASE_DIR/docs" \
        "$RELEASE_DIR/scenes" \
        "$RELEASE_DIR/scripts" \
        "$RELEASE_DIR/shaders" \
        "$RELEASE_DIR/textures" \
        "$RELEASE_DIR/tools" \
        "$RELEASE_DIR/youtube-example-ai-studio-main" \
        "$WEB_DIR/node_modules" \
        "$WEB_DIR/public" \
        "$WEB_DIR/src" \
        "$WEB_DIR/.codex" \
        "$WEB_DIR/index.html" \
        "$WEB_DIR/eslint.config.js" \
        "$WEB_DIR/generate-godot-export-manifest.cjs" \
        "$WEB_DIR/optimize-images.cjs" \
        "$WEB_DIR/package-lock.json" \
        "$WEB_DIR/package.json" \
        "$WEB_DIR/vite.config.js" \
        "$WEB_DIR/watch-export.js" \
        "$WEB_DIR/write-godot-runtime-manifest.cjs" \
        "$RELEASE_DIR/project.godot" \
        "$RELEASE_DIR/export_presets.cfg"; do
        if [ -e "$path" ]; then
            rm -rf "$path"
            removed=$((removed + 1))
        fi
    done

    log "Slimmed runtime release; removed $removed source-only path(s)"
}

validate_release() {
    log "[6/9] Validating release..."
    [ -f "$WEB_DIST/index.html" ] || die "Missing web/dist/index.html"
    [ -f "$WEB_DIST/godot/Work.pck" ] || die "Missing web/dist/godot/Work.pck"
    [ -f "$WEB_DIST/godot/Work.wasm" ] || die "Missing web/dist/godot/Work.wasm"
    [ -f "$WEB_DIST/godot/Work.js" ] || die "Missing web/dist/godot/Work.js"
    [ -f "$WEB_DIST/godot/godot-runtime-manifest.json" ] || die "Missing web/dist/godot/godot-runtime-manifest.json"
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

stop_services_for_database_backup() {
    if [ "${CLASH_BACKUP_QUIESCE_SERVICES:-0}" != "1" ]; then
        return
    fi

    log "Stopping runtime services briefly for SQLite backup..."
    pm2 stop clash-api 2>/dev/null || true
    pm2 stop clash-hermes-jobs 2>/dev/null || true
    pm2 stop clash-futures 2>/dev/null || true
    pm2 stop clash-mcp 2>/dev/null || true
}

resume_services_after_database_backup() {
    if [ "${CLASH_BACKUP_QUIESCE_SERVICES:-0}" != "1" ]; then
        return
    fi

    log "Resuming current runtime services after SQLite backup..."
    pm2 start clash-api 2>/dev/null || true
    pm2 start clash-hermes-jobs 2>/dev/null || true
    pm2 start clash-futures 2>/dev/null || true
    pm2 start clash-mcp 2>/dev/null || true
}

sync_legacy_databases_before_switch() {
    if [ "$BOOTSTRAPPED_LEGACY_DBS" -ne 1 ]; then
        return
    fi

    log "Stopping old services briefly for one-time DB migration..."
    pm2 stop clash-api 2>/dev/null || true
    pm2 stop clash-hermes-jobs 2>/dev/null || true
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

    ARBITRUM_ALCHEMY_KEY="$(env_file_value "ARBITRUM_ALCHEMY_KEY")"
    ETHEREUM_ALCHEMY_KEY="$(first_env_file_value "ETHEREUM_ALCHEMY_KEY" "ALCHEMY_ETHEREUM_API_KEY" "ETH_ALCHEMY_KEY" "ALCHEMY_API_KEY" "BASE_ALCHEMY_KEY" "ALCHEMY_BASE_API_KEY")"
    BASE_ALCHEMY_KEY="$(first_env_file_value "BASE_ALCHEMY_KEY" "ALCHEMY_BASE_API_KEY")"
    SOLANA_ALCHEMY_API_KEY="$(first_env_file_value "SOLANA_ALCHEMY_API_KEY" "ALCHEMY_SOLANA_API_KEY")"
    SOLANA_HELIUS_API_KEY="$(first_env_file_value \
        "SOLANA_HELIUS_API_KEY" \
        "HELIUS_API_KEY" \
        "VITE_HELIUS_API_KEY" \
        "VITE_SOLANA_HELIUS_API_KEY")"
    SOLANA_TATUM_API_KEY="$(first_env_file_value "SOLANA_TATUM_API_KEY" "TATUM_API_KEY")"

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
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Accept-Encoding "";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
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

    location = /rpc/solana-ws {
        proxy_pass __SOLANA_RPC_WS_PROXY_PASS__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host __SOLANA_RPC_WS_HOST__;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location = /rpc/solana-alchemy {
        proxy_pass https://solana-mainnet.g.alchemy.com/v2/__SOLANA_ALCHEMY_API_KEY__;
        proxy_http_version 1.1;
        proxy_set_header Host solana-mainnet.g.alchemy.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location = /rpc/solana-alchemy-ws {
        proxy_pass https://solana-mainnet.g.alchemy.com/v2/__SOLANA_ALCHEMY_API_KEY__;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host solana-mainnet.g.alchemy.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location = /rpc/solana-tatum {
        proxy_pass https://solana-mainnet.gateway.tatum.io/;
        proxy_http_version 1.1;
        proxy_set_header Host solana-mainnet.gateway.tatum.io;
        proxy_set_header x-api-key "__SOLANA_TATUM_API_KEY__";
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location = /rpc/solana {
        proxy_pass __SOLANA_RPC_PROXY_PASS__;
        proxy_http_version 1.1;
        proxy_set_header Host __SOLANA_RPC_HOST__;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }

    location = /rpc/solana-leorpc {
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
    location = /rpc/base-alchemy {
        proxy_pass https://base-mainnet.g.alchemy.com/v2/__BASE_ALCHEMY_KEY__;
        proxy_http_version 1.1;
        proxy_set_header Host base-mainnet.g.alchemy.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }
    location = /rpc/eth-alchemy {
        proxy_pass https://eth-mainnet.g.alchemy.com/v2/__ETHEREUM_ALCHEMY_KEY__;
        proxy_http_version 1.1;
        proxy_set_header Host eth-mainnet.g.alchemy.com;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }
    location = /rpc/base {
        proxy_pass https://mainnet.base.org/;
        proxy_http_version 1.1;
        proxy_set_header Host mainnet.base.org;
        proxy_set_header Origin "";
        proxy_set_header Referer "";
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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
        proxy_connect_timeout 10s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
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
        proxy_pass http://127.0.0.1:4000/api/admin/panel;
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

    location = /godot/godot-runtime-manifest.json {
        try_files $uri =404;
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        etag on;
    }

    location /godot/ {
        try_files $uri =404;
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
        add_header Cache-Control "public, max-age=31536000, immutable";
        etag on;
        types { application/wasm wasm; application/javascript js; application/octet-stream pck; }
        gzip_static on;
        tcp_nodelay on;
        http2_chunk_size 256k;
        sendfile_max_chunk 4m;
        open_file_cache max=64 inactive=10m;
        open_file_cache_valid 30m;
        open_file_cache_min_uses 1;
        open_file_cache_errors on;
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
    sed -i "s|clashofperps.fun|$DOMAIN|g" /etc/nginx/sites-available/$DOMAIN

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

    if [ -n "$BASE_ALCHEMY_KEY" ]; then
        sed -i "s|__BASE_ALCHEMY_KEY__|$(sed_escape_replacement "$BASE_ALCHEMY_KEY")|g" /etc/nginx/sites-available/$DOMAIN
        log "BASE_ALCHEMY_KEY is set; /rpc/base-alchemy will proxy to Alchemy server-side."
    else
        sed -i 's|proxy_pass https://base-mainnet.g.alchemy.com/v2/__BASE_ALCHEMY_KEY__;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        log "BASE_ALCHEMY_KEY is not set; /rpc/base-alchemy will return 503 and clients should use /rpc/base fallback."
    fi

    if [ -n "$ETHEREUM_ALCHEMY_KEY" ]; then
        sed -i "s|__ETHEREUM_ALCHEMY_KEY__|$(sed_escape_replacement "$ETHEREUM_ALCHEMY_KEY")|g" /etc/nginx/sites-available/$DOMAIN
        log "ETHEREUM_ALCHEMY_KEY is set; /rpc/eth-alchemy will proxy to Alchemy server-side."
    else
        sed -i 's|proxy_pass https://eth-mainnet.g.alchemy.com/v2/__ETHEREUM_ALCHEMY_KEY__;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        log "ETHEREUM_ALCHEMY_KEY is not set; /rpc/eth-alchemy will return 503."
    fi

    if [ -n "$SOLANA_ALCHEMY_API_KEY" ]; then
        sed -i "s|__SOLANA_ALCHEMY_API_KEY__|$(sed_escape_replacement "$SOLANA_ALCHEMY_API_KEY")|g" /etc/nginx/sites-available/$DOMAIN
        log "SOLANA_ALCHEMY_API_KEY is set; /rpc/solana-alchemy will proxy to Alchemy server-side."
    else
        sed -i 's|proxy_pass https://solana-mainnet.g.alchemy.com/v2/__SOLANA_ALCHEMY_API_KEY__;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        log "SOLANA_ALCHEMY_API_KEY is not set; /rpc/solana-alchemy will return 503."
    fi

    if [ -n "$SOLANA_TATUM_API_KEY" ]; then
        sed -i "s|__SOLANA_TATUM_API_KEY__|$(sed_escape_replacement "$SOLANA_TATUM_API_KEY")|g" /etc/nginx/sites-available/$DOMAIN
        log "SOLANA_TATUM_API_KEY is set; /rpc/solana-tatum will proxy to Tatum server-side."
    else
        sed -i 's|proxy_pass https://solana-mainnet.gateway.tatum.io/;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        sed -i 's|        proxy_set_header x-api-key "__SOLANA_TATUM_API_KEY__";||g' /etc/nginx/sites-available/$DOMAIN
        log "SOLANA_TATUM_API_KEY is not set; /rpc/solana-tatum will return 503."
    fi

    local solana_rpc_proxy_pass solana_rpc_host solana_rpc_ws_proxy_pass solana_rpc_ws_host
    if [ -n "$SOLANA_HELIUS_API_KEY" ]; then
        solana_rpc_proxy_pass="https://mainnet.helius-rpc.com/?api-key=$SOLANA_HELIUS_API_KEY"
        solana_rpc_host="mainnet.helius-rpc.com"
        solana_rpc_ws_proxy_pass="https://mainnet.helius-rpc.com/?api-key=$SOLANA_HELIUS_API_KEY"
        solana_rpc_ws_host="mainnet.helius-rpc.com"
        sed -i "s|__SOLANA_RPC_PROXY_PASS__|$(sed_escape_replacement "$solana_rpc_proxy_pass")|g" /etc/nginx/sites-available/$DOMAIN
        sed -i "s|__SOLANA_RPC_HOST__|$(sed_escape_replacement "$solana_rpc_host")|g" /etc/nginx/sites-available/$DOMAIN
        sed -i "s|__SOLANA_RPC_WS_PROXY_PASS__|$(sed_escape_replacement "$solana_rpc_ws_proxy_pass")|g" /etc/nginx/sites-available/$DOMAIN
        sed -i "s|__SOLANA_RPC_WS_HOST__|$(sed_escape_replacement "$solana_rpc_ws_host")|g" /etc/nginx/sites-available/$DOMAIN
        log "SOLANA_HELIUS_API_KEY is set; /rpc/solana will proxy to Helius server-side."
    else
        sed -i 's|proxy_pass __SOLANA_RPC_PROXY_PASS__;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        sed -i 's|        proxy_set_header Host __SOLANA_RPC_HOST__;||g' /etc/nginx/sites-available/$DOMAIN
        sed -i 's|proxy_pass __SOLANA_RPC_WS_PROXY_PASS__;|return 503;|g' /etc/nginx/sites-available/$DOMAIN
        sed -i 's|        proxy_set_header Host __SOLANA_RPC_WS_HOST__;||g' /etc/nginx/sites-available/$DOMAIN
        log "SOLANA_HELIUS_API_KEY is not set; /rpc/solana and /rpc/solana-ws will return 503."
    fi

    ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    ln -sf /etc/nginx/sites-available/$MCP_DOMAIN /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default

    if nginx_brotli_static_available; then
        sed -i '/gzip_static on;/a\        brotli_static on;' /etc/nginx/sites-available/$DOMAIN
        log "brotli_static enabled in nginx"
    fi

    nginx -t
    systemctl reload nginx
}

restart_services() {
    log "[9/9] Restarting PM2 services..."

    pm2 delete clash-api 2>/dev/null || true
    pm2 start node \
        --name clash-api \
        --cwd "$CURRENT_LINK/server" \
        --env production \
        -- --env-file="$ENV_FILE" "$CURRENT_LINK/server/index.js"

    pm2 delete clash-hermes-jobs 2>/dev/null || true
    pm2 start node \
        --name clash-hermes-jobs \
        --cwd "$CURRENT_LINK/server" \
        --env production \
        -- --env-file="$ENV_FILE" "$CURRENT_LINK/server/hermes_jobs_worker.js"

    if [ -d "$CURRENT_LINK/server-futures" ]; then
        pm2 delete clash-futures 2>/dev/null || true
        pm2 start node \
            --name clash-futures \
            --cwd "$CURRENT_LINK/server-futures" \
            --env production \
            -- --experimental-wasm-modules --env-file="$ENV_FILE" "$CURRENT_LINK/server-futures/index.js"
    fi

    if [ -f "$CURRENT_LINK/mcp/src/server.mjs" ]; then
        pm2 delete clash-mcp 2>/dev/null || true
        pm2 start node \
            --name clash-mcp \
            --cwd "$CURRENT_LINK/mcp" \
            --env production \
            -- --env-file="$ENV_FILE" "$CURRENT_LINK/mcp/src/server.mjs"
    fi

    pm2 save
    pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
}

cleanup_old_releases() {
    if ! [[ "$KEEP_RELEASES" =~ ^[0-9]+$ ]] || [ "$KEEP_RELEASES" -lt 1 ]; then
        die "KEEP_RELEASES must be a positive integer, got '$KEEP_RELEASES'."
    fi

    log "Keeping last $KEEP_RELEASES release(s)."

    local current_real=""
    current_real="$(readlink -f "$CURRENT_LINK" 2>/dev/null || true)"

    local kept=0
    local release release_real keep_current=0
    if [ -n "$current_real" ] && [ -d "$current_real" ]; then
        keep_current=1
        kept=1
    fi

    # Release directories are named YYYYMMDDHHMMSS-<git-sha>. Sort by that
    # stable release id instead of directory mtime, because rsync -a can rewrite
    # mtimes and make mtime-based pruning keep the wrong directories.
    while IFS= read -r release; do
        [ -n "$release" ] || continue
        release_real="$(readlink -f "$release" 2>/dev/null || true)"

        if [ "$keep_current" -eq 1 ] && [ "$release_real" = "$current_real" ]; then
            continue
        fi

        if [ "$kept" -lt "$KEEP_RELEASES" ]; then
            kept=$((kept + 1))
            continue
        fi

        rm -rf "$release"
        log "Removed old release $(basename "$release")"
    done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\t%p\n' | sort -r | cut -f2-)
}

main() {
    require_root
    acquire_deploy_lock
    validate_source_dir
    log "=== Atomic deploy $DOMAIN ($RELEASE_ID) ==="
    log "Source: $SOURCE_DIR"

    install_system_dependencies
    prepare_shared_runtime
    copy_source_to_release
    install_release_dependencies
    build_frontend
    validate_release
    sync_legacy_databases_before_switch
    switch_current_release
    write_nginx_config
    restart_services
    backup_shared_databases
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
    echo "  pm2 logs clash-hermes-jobs"
    echo "  pm2 logs clash-futures"
    echo "  pm2 logs clash-mcp"
    echo "  bash $DEPLOY_ROOT/deploy/update.sh"
    echo "  ln -sfn <release-dir> $DEPLOY_ROOT/.current.rollback && mv -Tf $DEPLOY_ROOT/.current.rollback $CURRENT_LINK"
}

main "$@"
