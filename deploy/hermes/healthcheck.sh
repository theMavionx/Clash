#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${CLASH_HERMES_ORCHESTRATOR_URL:-http://127.0.0.1:${CLASH_HERMES_ORCHESTRATOR_PORT:-8600}}"

echo "[hermes-health] checking $BASE_URL/health"
curl -fsS "$BASE_URL/health"
echo

if [ -n "${HERMES_ORCHESTRATOR_TOKEN:-}" ] && [ -n "${CLASH_HERMES_TEST_PLAYER_ID:-}" ]; then
  echo "[hermes-health] checking player status for $CLASH_HERMES_TEST_PLAYER_ID"
  curl -fsS \
    -H "Authorization: Bearer $HERMES_ORCHESTRATOR_TOKEN" \
    "$BASE_URL/players/$CLASH_HERMES_TEST_PLAYER_ID/status"
  echo
fi
