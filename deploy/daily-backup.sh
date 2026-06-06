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
BACKUP_KEEP="${CLASH_BACKUP_KEEP:-1}"
BACKUP_SQLITE_TIMEOUT_SECONDS="${CLASH_BACKUP_SQLITE_TIMEOUT_SECONDS:-}"
BACKUP_SQLITE_TIMEOUT_MIN_SECONDS="${CLASH_BACKUP_SQLITE_TIMEOUT_MIN_SECONDS:-600}"
BACKUP_SQLITE_TIMEOUT_MIB_PER_SECOND="${CLASH_BACKUP_SQLITE_TIMEOUT_MIB_PER_SECOND:-1}"
BACKUP_SQLITE_TIMEOUT_MAX_SECONDS="${CLASH_BACKUP_SQLITE_TIMEOUT_MAX_SECONDS:-7200}"

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
    if [ "$computed" -gt "$max_seconds" ]; then
        echo "$max_seconds"
        return 0
    fi
    echo "$computed"
}

checkpoint_sqlite_db() {
    local src="$1"
    timeout 30s sqlite3 "$src" "PRAGMA busy_timeout=5000; PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null 2>&1 || \
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WARNING: SQLite WAL checkpoint failed before backup for $src"
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
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) backing up SQLite DB $src (${size_label}) with ${timeout_seconds}s timeout"
    if ! timeout "${timeout_seconds}s" sqlite3 "$src" ".backup '$tmp'"; then
        rm -f "$tmp" "$tmp.zst" "$tmp.gz" "$tmp-journal"
        echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) WARNING: SQLite backup timed out or failed for $src after ${timeout_seconds}s"
        return 1
    fi
    mv -f "$tmp" "$dst"
    chmod 600 "$dst" || true
    compress_backup_file "$dst"
}

backup_sqlite_db "$SHARED_DIR/server/clash.db" "$backup_dir/server/clash.db" || true
backup_sqlite_db "$SHARED_DIR/server-futures/futures.db" "$backup_dir/server-futures/futures.db" || true

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
