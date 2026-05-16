#!/bin/bash
# Smoke-check a local or hosted Clash MCP endpoint.
#
# Usage:
#   MCP_BASE_URL=https://mcp.clashofperps.fun AI_AGENT_KEY=cop_ai_... bash deploy/check-mcp.sh
#   MCP_BASE_URL=http://127.0.0.1:4100 AI_AGENT_KEY=cop_ai_... bash deploy/check-mcp.sh

set -Eeuo pipefail

BASE_URL="${MCP_BASE_URL:-https://mcp.clashofperps.fun}"
BASE_URL="${BASE_URL%/}"
KEY="${AI_AGENT_KEY:-}"

echo "MCP base: $BASE_URL"

health_code="$(curl -fsS -o /tmp/clash-mcp-health.json -w '%{http_code}' "$BASE_URL/health")"
[ "$health_code" = "200" ] || { cat /tmp/clash-mcp-health.json >&2 || true; echo "health failed: $health_code" >&2; exit 1; }
echo "health ok"

skills_code="$(curl -fsS -o /tmp/clash-mcp-skills.md -w '%{http_code}' "$BASE_URL/skills.md")"
[ "$skills_code" = "200" ] || { cat /tmp/clash-mcp-skills.md >&2 || true; echo "skills failed: $skills_code" >&2; exit 1; }
grep -q "Clash of Perps AI Agent Skill" /tmp/clash-mcp-skills.md
echo "skills ok"

unauth_code="$(curl -sS -o /tmp/clash-mcp-unauth.json -w '%{http_code}' "$BASE_URL/mcp")"
[ "$unauth_code" = "401" ] || { cat /tmp/clash-mcp-unauth.json >&2 || true; echo "expected unauth 401, got $unauth_code" >&2; exit 1; }
echo "unauth challenge ok"

if [ -n "$KEY" ]; then
    auth_code="$(curl -sS -o /tmp/clash-mcp-auth.json -w '%{http_code}' \
        -H "Authorization: Bearer $KEY" \
        -H "Accept: application/json, text/event-stream" \
        -H "Content-Type: application/json" \
        -H "MCP-Protocol-Version: 2025-06-18" \
        --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"clash-smoke","version":"1.0.0"}}}' \
        "$BASE_URL/mcp")"
    case "$auth_code" in
        200|202) echo "authenticated initialize ok ($auth_code)" ;;
        *) cat /tmp/clash-mcp-auth.json >&2 || true; echo "authenticated initialize failed: $auth_code" >&2; exit 1 ;;
    esac
else
    echo "AI_AGENT_KEY not set; skipped authenticated initialize"
fi
