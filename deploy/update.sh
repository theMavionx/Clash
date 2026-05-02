#!/bin/bash
# Quick update — pull latest code, rebuild frontend, restart backend
set -e

APP_DIR="/opt/clash"
DB_BACKUP="/opt/clash-db-backup"

echo "=== Quick Update ==="

# Backup databases before pull
mkdir -p "$DB_BACKUP"
for db in \
    "$APP_DIR/server/clash.db" "$APP_DIR/server/clash.db-wal" "$APP_DIR/server/clash.db-shm" \
    "$APP_DIR/server-futures/futures.db" "$APP_DIR/server-futures/futures.db-wal" "$APP_DIR/server-futures/futures.db-shm"; do
    [ -f "$db" ] && cp "$db" "$DB_BACKUP/" && echo "Backed up $(basename $db)"
done

# Pull latest (discard local changes to tracked files)
cd "$APP_DIR"
git reset --hard HEAD
git pull origin main

# Restore databases after pull
for db in "$DB_BACKUP/clash.db" "$DB_BACKUP/clash.db-wal" "$DB_BACKUP/clash.db-shm"; do
    [ -f "$db" ] && cp "$db" "$APP_DIR/server/"
done
mkdir -p "$APP_DIR/server-futures"
for db in "$DB_BACKUP/futures.db" "$DB_BACKUP/futures.db-wal" "$DB_BACKUP/futures.db-shm"; do
    [ -f "$db" ] && cp "$db" "$APP_DIR/server-futures/"
done
echo "DB restored"

# Ensure brotli is installed
command -v brotli &>/dev/null || sudo apt-get install -y -qq brotli

# Install & rebuild frontend
echo "Building frontend..."
cd "$APP_DIR/web"
npm install --legacy-peer-deps
npm run build

# Stamp build hash into sw.js so browsers pick up new cache on deploy
BUILD_HASH=$(date +%s)
sed -i "s/__BUILD_HASH__/$BUILD_HASH/g" "$APP_DIR/web/dist/sw.js"
echo "  SW cache version: clash-godot-$BUILD_HASH"

# Pre-compress Godot assets with brotli + gzip for nginx static serving
echo "Compressing Godot assets..."
for f in "$APP_DIR/web/dist/godot/Work.pck" "$APP_DIR/web/dist/godot/Work.wasm" "$APP_DIR/web/dist/godot/Work.side.wasm" "$APP_DIR/web/dist/godot/Work.js"; do
    if [ -f "$f" ]; then
        brotli -f -q 6 -o "$f.br" "$f" && echo "  brotli: $(basename $f) → $(du -h "$f.br" | cut -f1)"
        gzip -f -k -9 "$f" && echo "  gzip:   $(basename $f) → $(du -h "$f.gz" | cut -f1)"
    fi
done
if [ -f "$APP_DIR/web/dist/godot/Work.js" ]; then
    sed -i "s|\[\`\${loadPath}.side.wasm\`\].concat(this.gdextensionLibs)|[].concat(this.gdextensionLibs)|g" "$APP_DIR/web/dist/godot/Work.js"
    rm -f "$APP_DIR/web/dist/godot/Work.side.wasm"
fi

# Install & restart backend
echo "Restarting backend..."
cd "$APP_DIR/server"
npm ci --production
pm2 restart clash-api

if [ -d "$APP_DIR/server-futures" ]; then
    echo "Restarting futures backend..."
    cd "$APP_DIR/server-futures"
    npm install --production --legacy-peer-deps
    pm2 restart clash-futures || pm2 start index.js --name clash-futures --env production --node-args="--env-file=$APP_DIR/.env"
fi

echo "=== Update complete! ==="
