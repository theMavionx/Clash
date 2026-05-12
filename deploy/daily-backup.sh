#!/bin/bash
# Daily backup of /opt/clash/shared/ databases + .env, with 7-day retention.
#
# Mirrors backup_shared_databases from deploy.sh but runs on a schedule
# (independent of deploys) and prunes anything in /opt/clash/shared/backups
# older than RETENTION_DAYS. The same /opt/clash/shared/backups directory
# is used for both deploy-triggered and scheduled backups, so retention
# applies uniformly.
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
RETENTION_DAYS="${CLASH_BACKUP_RETENTION_DAYS:-7}"

ts="$(date -u +%Y%m%d%H%M%S)"
backup_dir="$BACKUPS_DIR/$ts"

mkdir -p "$backup_dir/server" "$backup_dir/server-futures"

copy_db_family() {
    local src_dir="$1"
    local dst_dir="$2"
    local base="$3"
    for suffix in "" "-wal" "-shm"; do
        if [ -f "$src_dir/$base$suffix" ]; then
            cp -a "$src_dir/$base$suffix" "$dst_dir/"
        fi
    done
}

copy_db_family "$SHARED_DIR/server" "$backup_dir/server" "clash.db"
copy_db_family "$SHARED_DIR/server-futures" "$backup_dir/server-futures" "futures.db"

if [ -f "$SHARED_DIR/.env" ]; then
    cp -a "$SHARED_DIR/.env" "$backup_dir/.env"
    chmod 600 "$backup_dir/.env" || true
fi

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backup written to $backup_dir"

# Retention: drop anything older than RETENTION_DAYS days (mtime-based).
# -mtime +N matches files modified more than N*24 hours ago, which matches
# common "older than N days" intuition. Both deploy-triggered and
# scheduled backups share this directory, so retention applies uniformly.
pruned=0
while IFS= read -r -d '' old; do
    rm -rf -- "$old"
    pruned=$((pruned + 1))
done < <(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$RETENTION_DAYS" -print0)

if [ "$pruned" -gt 0 ]; then
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) pruned $pruned backup(s) older than $RETENTION_DAYS days"
fi
