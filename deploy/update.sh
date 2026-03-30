#!/bin/bash
# Quick update — pull latest code, rebuild frontend, restart backend
set -e

APP_DIR="/opt/clash"
DB_BACKUP="/opt/clash-db-backup"

echo "=== Quick Update ==="

# Backup databases before pull
mkdir -p "$DB_BACKUP"
for db in "$APP_DIR/server/clash.db" "$APP_DIR/server/clash.db-wal" "$APP_DIR/server/clash.db-shm"; do
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
echo "DB restored"

# Install & rebuild frontend
echo "Building frontend..."
cd "$APP_DIR/web"
npm ci
npm run build

# Install & restart backend
echo "Restarting backend..."
cd "$APP_DIR/server"
npm ci --production
pm2 restart clash-api

echo "=== Update complete! ==="
