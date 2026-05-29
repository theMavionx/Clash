#!/bin/bash
# Daily backup of /opt/clash/shared/ databases + .env.
#
# Mirrors backup_shared_databases from deploy.sh but runs on a schedule
# (independent of deploys) and prunes /opt/clash/shared/backups by both age
# and count. The same /opt/clash/shared/backups directory is used for both
# deploy-triggered and scheduled backups, so retention applies uniformly.
#
# Install (one-time, on server as root):
#   cp /opt/clash/deploy/clash-backup.service /etc/systemd/system/
#   cp /opt/clash/deploy/clash-backup.timer   /etc/systemd/system/
#   systemctl daemon-reload
#   systemctl enable --now clash-backup.timer
#
# Run manually:
#   sudo bash /opt/clash/deploy/daily-backup.sh

set -Eeuo pipefail

SHARED_DIR="${CLASH_SHARED_DIR:-/opt/clash/shared}"
BACKUPS_DIR="$SHARED_DIR/backups"
RETENTION_DAYS="${CLASH_BACKUP_RETENTION_DAYS:-3}"
BACKUP_KEEP="${CLASH_BACKUP_KEEP:-10}"

ts="$(date -u +%Y%m%d%H%M%S)"
backup_dir="$BACKUPS_DIR/$ts"

mkdir -p "$backup_dir/server" "$backup_dir/server-futures"

compress_backup_file() {
    local file="$1"
    if command -v zstd >/dev/null 2>&1; then
        zstd -q -T1 -6 --rm "$file"
    else
        gzip -f -9 "$file"
    fi
}

backup_sqlite_db() {
    local src="$1"
    local dst="$2"
    [ -f "$src" ] || return 0

    mkdir -p "$(dirname "$dst")"
    rm -f "$dst" "$dst.zst" "$dst.gz"
    sqlite3 "$src" ".backup '$dst'"
    chmod 600 "$dst" || true
    compress_backup_file "$dst"
}

backup_sqlite_db "$SHARED_DIR/server/clash.db" "$backup_dir/server/clash.db"
backup_sqlite_db "$SHARED_DIR/server-futures/futures.db" "$backup_dir/server-futures/futures.db"

if [ -f "$SHARED_DIR/.env" ]; then
    cp -a "$SHARED_DIR/.env" "$backup_dir/.env"
    chmod 600 "$backup_dir/.env" || true
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup written to $backup_dir"

# Retention: drop anything older than RETENTION_DAYS days (mtime-based), then
# keep only the newest BACKUP_KEEP directories by timestamp-like name.
pruned=0
while IFS= read -r -d '' old; do
    rm -rf -- "$old"
    pruned=$((pruned + 1))
done < <(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -print0)

if [[ "$BACKUP_KEEP" =~ ^[0-9]+$ ]] && [ "$BACKUP_KEEP" -gt 0 ]; then
    kept=0
    while IFS= read -r backup; do
        [ -n "$backup" ] || continue
        kept=$((kept + 1))
        if [ "$kept" -gt "$BACKUP_KEEP" ]; then
            rm -rf -- "$backup"
            pruned=$((pruned + 1))
        fi
    done < <(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%f\t%p\n' | sort -r | cut -f2-)
fi

if [ "$pruned" -gt 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) pruned $pruned backup(s); retention=${RETENTION_DAYS}d keep=$BACKUP_KEEP"
fi
