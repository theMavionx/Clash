#!/bin/bash
# Quick update — pull latest code, rebuild frontend, restart backend
set -e

APP_DIR="/opt/clash"

echo "=== Quick Update ==="

# Pull latest
cd "$APP_DIR"
git pull origin main

# Rebuild frontend
echo "Building frontend..."
cd "$APP_DIR/web"
npm ci
npm run build

# Restart backend
echo "Restarting backend..."
cd "$APP_DIR/server"
npm ci --production
pm2 restart clash-api

echo "=== Update complete! ==="
