# Clash AI MCP Deployment

This project has two MCP deployment paths:

1. Full game deploy:

```bash
sudo bash /opt/clash/deploy/update.sh
```

2. MCP-only one-command deploy/update:

```bash
sudo bash /opt/clash/deploy/update-mcp.sh
```

The MCP-only path is safe for quick AI-agent server changes because it does not
rebuild the frontend or require a new Godot export.

## Production Target

- Public endpoint: `https://mcp.clashofperps.fun/mcp`
- Public skill document: `https://mcp.clashofperps.fun/skills.md`
- Public health check: `https://mcp.clashofperps.fun/health`
- Local service: `127.0.0.1:4100`
- PM2 process: `clash-mcp`
- Nginx site: `/etc/nginx/sites-available/mcp.clashofperps.fun`
- Runtime env: `/opt/clash/shared/.env`

## Agent Skill Location

`mcp/SKILLS.md` is the canonical agent playbook. It is exposed three ways:

- HTTP: `GET /skills.md`
- MCP resource: `clash://agent/skill`
- MCP prompt: `clash_agent_onboarding`

`mcp/AGENT_SKILL.md` remains as a backwards-compatible alias for older local
workflows.

## Auth

Phase 1 uses player-created `cop_ai_...` bearer keys:

```text
Authorization: Bearer cop_ai_...
```

Unauthenticated MCP requests return `401` with a `WWW-Authenticate` challenge
that points to `/.well-known/oauth-protected-resource`. This prepares the
server for a future OAuth layer while keeping the current player-profile key
flow working.

## One-Command MCP Deploy

Run:

```bash
sudo bash /opt/clash/deploy/update-mcp.sh
```

The script automatically:

- pulls the configured git branch;
- installs Node.js, nginx, certbot, and PM2 if missing;
- creates/updates `/opt/clash/shared/.env` MCP defaults;
- installs `mcp/` npm dependencies;
- validates `mcp/src/server.mjs`;
- writes the nginx vhost for `mcp.clashofperps.fun`;
- provisions TLS with certbot if needed;
- restarts PM2 `clash-mcp`;
- runs `deploy/check-mcp.sh`.

Useful overrides:

```bash
CLASH_BRANCH=main
CLASH_SOURCE_DIR=/opt/clash
CLASH_DEPLOY_ROOT=/opt/clash
CLASH_MCP_DOMAIN=mcp.clashofperps.fun
CLASH_CERT_EMAIL=egor4042007@gmail.com
```

## Smoke Checks

Local:

```bash
MCP_BASE_URL=http://127.0.0.1:4100 AI_AGENT_KEY=cop_ai_... bash deploy/check-mcp.sh
```

Production:

```bash
MCP_BASE_URL=https://mcp.clashofperps.fun AI_AGENT_KEY=cop_ai_... bash deploy/check-mcp.sh
```

Without `AI_AGENT_KEY`, the smoke check still verifies health, skill document,
and unauthenticated `401` challenge.

## Operational Notes

- DNS for `mcp.clashofperps.fun` must already point at the production host
  before certbot can issue the certificate.
- Nginx disables proxy buffering for MCP so Streamable HTTP/SSE responses are
  delivered immediately.
- The proxy preserves `Authorization`, `MCP-Protocol-Version`,
  `Mcp-Session-Id`, and `Last-Event-ID` headers.
- Rate limiting is enforced in the MCP process with
  `CLASH_MCP_RATE_WINDOW_MS` and `CLASH_MCP_RATE_LIMIT`.

## References

- MCP Streamable HTTP transport: https://modelcontextprotocol.io/specification/2025-06-18/basic/transports
- MCP authorization guidance: https://modelcontextprotocol.io/docs/tutorials/security/authorization
- MCP security best practices: https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices
- MCP prompts/resources: https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
