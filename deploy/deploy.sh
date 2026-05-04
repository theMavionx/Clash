#!/bin/bash
# Deploy script for clashofperps.fun
# Backend: Node.js on port 4000
# Frontend: Vite build served by nginx on port 3999 (proxied)
# Nginx: SSL termination + proxy to both

set -e

DOMAIN="clashofperps.fun"
EMAIL="egor4042007@gmail.com"
APP_DIR="/opt/clash"
SERVER_DIR="$APP_DIR/server"
WEB_DIR="$APP_DIR/web"
WEB_DIST="$WEB_DIR/dist"

echo "=== Deploying $DOMAIN ==="

# ── 1. Install dependencies ──
echo "[1/7] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl

# Install Node.js 20 if not present
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
fi

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
fi

# ── 2. Copy project files ──
echo "[2/7] Copying project files..."
mkdir -p "$APP_DIR"
rsync -a --delete \
    --exclude='node_modules' --exclude='.git' --exclude='clash.db*' \
    --exclude='.env' \
    --exclude='server-futures/node_modules' --exclude='server-futures/*.db*' \
    --exclude='server-futures/server.log' \
    "$(dirname "$(dirname "$(readlink -f "$0")")")/" "$APP_DIR/"

# ── 3. Install backend dependencies ──
echo "[3/7] Installing backend dependencies..."
cd "$SERVER_DIR"
npm ci --production

# Install brotli for pre-compression + nginx brotli module
if ! command -v brotli &> /dev/null; then
    echo "Installing brotli..."
    apt-get install -y -qq brotli
fi
# Install nginx brotli module if available
if ! nginx -V 2>&1 | grep -q brotli; then
    apt-get install -y -qq libnginx-mod-http-brotli-static libnginx-mod-http-brotli-filter 2>/dev/null || echo "  (brotli module not available — gzip_static will be used as fallback)"
fi

# ── 4. Build frontend ──
echo "[4/7] Building frontend..."
cd "$WEB_DIR"
# --legacy-peer-deps: @privy-io/react-auth@3.21.2 pins @farcaster/mini-app-solana@^1,
# but we're on 2.0.0 (works fine at runtime — Privy gracefully degrades).
# Using `install` over `ci` so a slightly stale lockfile on the server still works.
npm install --legacy-peer-deps
npm run build

# Stamp build hash into sw.js so browsers pick up new cache on deploy
BUILD_HASH=$(date +%s)
sed -i "s/__BUILD_HASH__/$BUILD_HASH/g" "$WEB_DIST/sw.js"
echo "  SW cache version: clash-godot-$BUILD_HASH"

# Patch Work.js — remove side.wasm from dynamicLibraries (thread support disabled)
if [ -f "$WEB_DIST/godot/Work.js" ]; then
    sed -i "s|\[\`\${loadPath}.side.wasm\`\].concat(this.gdextensionLibs)|[].concat(this.gdextensionLibs)|g" "$WEB_DIST/godot/Work.js"
    rm -f "$WEB_DIST/godot/Work.side.wasm"
    echo "  Patched Work.js: removed side.wasm reference"
fi

# Pre-compress Godot assets with brotli + gzip for nginx static serving
# Use brotli quality 9 for big files (much smaller, slower to compress but done once at deploy)
echo "Compressing Godot assets..."
for f in "$WEB_DIST/godot/Work.pck"; do
    if [ -f "$f" ]; then
        brotli -f -q 9 -o "$f.br" "$f" && echo "  brotli-9: $(basename $f) → $(du -h "$f.br" | cut -f1)"
        gzip -f -k -9 "$f" && echo "  gzip-9:   $(basename $f) → $(du -h "$f.gz" | cut -f1)"
    fi
done
for f in "$WEB_DIST/godot/Work.wasm" "$WEB_DIST/godot/Work.js"; do
    if [ -f "$f" ]; then
        brotli -f -q 6 -o "$f.br" "$f" && echo "  brotli-6: $(basename $f) → $(du -h "$f.br" | cut -f1)"
        gzip -f -k -9 "$f" && echo "  gzip-9:   $(basename $f) → $(du -h "$f.gz" | cut -f1)"
    fi
done
# Also compress the React bundle
for f in "$WEB_DIST"/assets/*.js "$WEB_DIST"/assets/*.css; do
    if [ -f "$f" ] && [ ! -f "$f.br" ]; then
        brotli -f -q 6 -o "$f.br" "$f"
        gzip -f -k -9 "$f"
    fi
done
echo "  Compression complete."

# ── 5. Setup nginx — Step 1: HTTP only (for certbot) ──
echo "[5/8] Configuring nginx (HTTP)..."
cat > /etc/nginx/sites-available/$DOMAIN << HTTPCONF
server {
    listen 80;
    server_name $DOMAIN $DOMAIN;
    root $WEB_DIST;
    index index.html;
    location / { try_files \$uri \$uri/ /index.html; }
}
HTTPCONF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# ── 6. SSL Certificate ──
echo "[6/8] Setting up SSL certificate..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    certbot --nginx -d $DOMAIN -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
fi

# ── 7. Setup nginx — Step 2: Full config with SSL + proxy ──
echo "[7/8] Configuring nginx (SSL + proxy)..."
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

    # COOP allows popups (Coinbase/Base/Privy email). COEP intentionally omitted:
    # credentialless strips cookies from Privy's auth.privy.io iframe, which breaks
    # embedded-wallet creation ("Exceeded max attempts"). Godot runs single-threaded.
    add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;

    # Futures proxy → server-futures on port 3999 (Avantis + optional Pacifica).
    # Must come BEFORE /api/ because nginx matches longest prefix first.
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

    # Arbitrum RPC proxy for GMX SDK reads. Routed server-side so the
    # Alchemy API key never ships in the browser bundle and MetaMask's
    # injected.js content script can't intercept the call (it scans
    # browser fetches for known RPC hosts and re-routes them through its
    # own provider, stripping ACAO and breaking CORS). Same-origin
    # localhost-style paths aren't in MM's intercept list.
    location /rpc/arb-alchemy {
        proxy_pass https://arb-mainnet.g.alchemy.com/v2/_wtFjwex46SgJDz2fx2c6;
        proxy_http_version 1.1;
        proxy_set_header Host arb-mainnet.g.alchemy.com;
        proxy_ssl_server_name on;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Accept-Encoding "";
        gzip off;
    }
    # Anonymous Arbitrum RPC fallback chain — used when env override
    # is not set. Pocket Network primary (most generous), then
    # OnFinality / publicnode / tenderly. 1rpc.io kept last (250
    # req/IP/day cap). Path layout matches web/vite.config.js so the
    # production bundle's same VITE_ARBITRUM_RPC_URL env override works
    # against either Vite or nginx without rebuilding.
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

    # API proxy → backend port 4000 (gzip off — Godot web can't decompress)
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

    # WebSocket proxy
    location /ws {
        proxy_pass http://127.0.0.1:4000/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }

    # Server dashboard
    location /dashboard {
        proxy_pass http://127.0.0.1:4000/;
        proxy_set_header Host $host;
    }

    # Trading stats
    location /trading-stats {
        proxy_pass http://127.0.0.1:4000/trading-stats;
        proxy_set_header Host $host;
    }

    # Frontend static files
    root /opt/clash/web/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # HTML entry — never cache so new deploys are picked up immediately
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
    }

    # Service worker — never cache (browser must always check for updates)
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
    }

    # Godot assets — long cache with ETag revalidation, SW caches after first load
    location /godot/ {
        try_files $uri =404;
        add_header Cross-Origin-Opener-Policy "same-origin-allow-popups" always;
        add_header Cache-Control "public, max-age=86400, must-revalidate";
        etag on;
        types { application/wasm wasm; application/javascript js; application/octet-stream pck; }

        # Serve pre-compressed brotli/gzip (30-60% smaller than raw)
        gzip_static on;
    }

    # Hashed JS/CSS assets — immutable cache (filename changes on rebuild)
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

# If nginx brotli module is available, enable brotli_static for Godot assets
if nginx -V 2>&1 | grep -q brotli; then
    sed -i '/gzip_static on;/a\        brotli_static on;' /etc/nginx/sites-available/$DOMAIN
    echo "  brotli_static enabled in nginx"
fi

nginx -t
systemctl reload nginx

# ── 8. Start/restart services with PM2 ──
echo "[8/9] Starting services..."
cd "$SERVER_DIR"

# Generate admin key + wallet encryption key if not exists
if [ ! -f "$APP_DIR/.env" ]; then
    ADMIN_KEY=$(openssl rand -hex 16)
    REWARD_SECRET=$(openssl rand -hex 32)
    WALLET_ENC_KEY=$(openssl rand -hex 32)
    cat > "$APP_DIR/.env" << EOF
ADMIN_KEY=$ADMIN_KEY
REWARD_SECRET=$REWARD_SECRET
NODE_ENV=production
ELFA_API_KEY=
DECIBEL_API_KEY=
DECIBEL_API_WALLET_PRIVATE_KEY=
DECIBEL_ALLOWED_BUILDER_ADDRS=
DECIBEL_BUILDER_FEE_BPS=1
CLASH_WALLET_ENCRYPTION_KEY=$WALLET_ENC_KEY
CLASH_MAIN_DB=$SERVER_DIR/clash.db
EOF
    echo "Generated .env with ADMIN_KEY=$ADMIN_KEY"
else
    # Backfill missing keys on existing .env (idempotent)
    grep -q '^CLASH_WALLET_ENCRYPTION_KEY=' "$APP_DIR/.env" || \
        echo "CLASH_WALLET_ENCRYPTION_KEY=$(openssl rand -hex 32)" >> "$APP_DIR/.env"
    grep -q '^CLASH_MAIN_DB=' "$APP_DIR/.env" || \
        echo "CLASH_MAIN_DB=$SERVER_DIR/clash.db" >> "$APP_DIR/.env"
    grep -q '^DECIBEL_API_KEY=' "$APP_DIR/.env" || \
        echo "DECIBEL_API_KEY=" >> "$APP_DIR/.env"
    grep -q '^DECIBEL_API_WALLET_PRIVATE_KEY=' "$APP_DIR/.env" || \
        echo "DECIBEL_API_WALLET_PRIVATE_KEY=" >> "$APP_DIR/.env"
    grep -q '^DECIBEL_ALLOWED_BUILDER_ADDRS=' "$APP_DIR/.env" || \
        echo "DECIBEL_ALLOWED_BUILDER_ADDRS=" >> "$APP_DIR/.env"
    grep -q '^DECIBEL_BUILDER_FEE_BPS=' "$APP_DIR/.env" || \
        echo "DECIBEL_BUILDER_FEE_BPS=1" >> "$APP_DIR/.env"
fi

pm2 delete clash-api 2>/dev/null || true
pm2 start index.js --name clash-api --env production --node-args="--env-file=$APP_DIR/.env"

# ── Futures service (port 3999) — Avantis custodial trading ──
FUTURES_DIR="$APP_DIR/server-futures"
if [ -d "$FUTURES_DIR" ]; then
    echo "Installing server-futures dependencies..."
    cd "$FUTURES_DIR"
    npm install --production --legacy-peer-deps
    pm2 delete clash-futures 2>/dev/null || true
    pm2 start index.js --name clash-futures --env production --node-args="--env-file=$APP_DIR/.env"
    cd "$SERVER_DIR"
fi

pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

# ── 9. Setup auto-deploy watcher ──
echo "[9/9] Setting up auto-deploy watcher..."
cp "$APP_DIR/deploy/clash-autopull.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable clash-autopull
systemctl restart clash-autopull

echo ""
echo "=== Deploy complete! ==="
echo "  Frontend:    https://$DOMAIN"
echo "  API:         https://$DOMAIN/api/"
echo "  Dashboard:   https://$DOMAIN/dashboard"
echo "  WebSocket:   wss://$DOMAIN/ws"
echo "  Auto-deploy: watching git every 30s"
echo ""
echo "Useful commands:"
echo "  pm2 logs clash-api                    # Backend logs"
echo "  pm2 restart clash-api                 # Restart backend"
echo "  journalctl -u clash-autopull -f       # Auto-deploy logs"
echo "  systemctl stop clash-autopull          # Stop auto-deploy"
echo "  nginx -t && systemctl reload nginx    # Reload nginx"
