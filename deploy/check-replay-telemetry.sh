#!/bin/bash
# Inspect whether replay_telemetry exists in prod DB, and create it if not.
set -e
DB=/opt/clash/shared/server/clash.db
echo "--- prod DB:" "$DB"
sudo -u root sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='replay_telemetry';"
echo "--- attempting CREATE (idempotent) ---"
sudo -u root sqlite3 "$DB" <<'SQL'
CREATE TABLE IF NOT EXISTS replay_telemetry (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id           TEXT REFERENCES players(id) ON DELETE SET NULL,
  battle_session_id   TEXT,
  replay_label        TEXT,
  attacker_name       TEXT,
  expected_result     TEXT,
  expected_duration   REAL,
  actual_elapsed      REAL,
  summary             TEXT,
  events              TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_replay_telemetry_recent ON replay_telemetry(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_telemetry_player_recent ON replay_telemetry(player_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_replay_telemetry_session ON replay_telemetry(battle_session_id);
SQL
echo "--- verify after CREATE ---"
sudo -u root sqlite3 "$DB" "SELECT name FROM sqlite_master WHERE type='table' AND name='replay_telemetry';"
echo "--- schema ---"
sudo -u root sqlite3 "$DB" ".schema replay_telemetry"
