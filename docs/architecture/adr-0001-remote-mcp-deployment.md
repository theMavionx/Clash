# ADR-0001: Remote MCP Deployment

## Status
Accepted

## Date
2026-05-16

## Context

### Problem Statement
AI agents need a stable remote MCP endpoint for playing Clash of Perps outside
the local test environment. The endpoint must be reachable at
`mcp.clashofperps.fun`, expose the agent playbook, keep the current `cop_ai_...`
key flow, and be deployable without manually editing nginx, PM2, or env files.

### Constraints
- The main game server remains on `127.0.0.1:4000`.
- The MCP server remains a Node/Express Streamable HTTP service.
- Current players already create bearer keys in Profile -> AI Agent.
- Godot/frontend deploys are heavier than MCP updates and should not be
  required for every MCP change.
- DNS for `mcp.clashofperps.fun` must be configured outside the repo.

### Requirements
- Public MCP endpoint: `https://mcp.clashofperps.fun/mcp`.
- Public agent playbook: `https://mcp.clashofperps.fun/skills.md`.
- Preserve `Authorization` and MCP protocol/session headers through nginx.
- Disable proxy buffering for streaming responses.
- Start the process under PM2 as `clash-mcp`.
- Provide a one-command MCP-only update path.

## Decision

Host the MCP server as a separate subdomain and PM2 process:

```text
AI client
  -> https://mcp.clashofperps.fun/mcp
  -> nginx TLS vhost
  -> 127.0.0.1:4100
  -> PM2 clash-mcp
  -> mcp/src/server.mjs
  -> server/db.js + server/combat_session.js
```

The canonical agent playbook lives at `mcp/SKILLS.md`. The MCP server exposes it
as:

- HTTP `GET /skills.md`
- MCP resource `clash://agent/skill`
- MCP prompt `clash_agent_onboarding`

`mcp/AGENT_SKILL.md` remains for backwards compatibility.

Deployment is automated with:

- `deploy/update.sh` for full game deploys including MCP;
- `deploy/update-mcp.sh` for MCP-only one-command updates;
- `deploy/deploy-mcp.sh` for MCP provisioning/start/restart;
- `deploy/check-mcp.sh` for local or production smoke checks.

### Architecture Diagram

```text
                         +----------------------+
                         |  clashofperps.fun    |
                         |  web/api/ws nginx    |
                         +----------+-----------+
                                    |
                                    | /api, /ws
                                    v
                              clash-api :4000

+---------------------+      +----------------------+      +----------------+
| MCP-capable client  +----->| mcp.clashofperps.fun |----->| clash-mcp :4100|
+---------------------+      | nginx TLS vhost      |      +-------+--------+
                             +----------------------+              |
                                                                    v
                                                        server DB/combat code
```

### Key Interfaces

- `GET /health`
- `GET /skills.md`
- `GET /.well-known/oauth-protected-resource`
- `ALL /mcp` with `Authorization: Bearer cop_ai_...`

## Alternatives Considered

### Alternative 1: Serve MCP under `clashofperps.fun/mcp`
- **Description**: Reuse the main web/API domain and proxy `/mcp`.
- **Pros**: One certificate and one nginx site.
- **Cons**: Harder cache/proxy isolation, less clear agent endpoint, more risk
  of frontend route collision.
- **Rejection Reason**: A dedicated subdomain is cleaner for agent clients and
  future OAuth metadata.

### Alternative 2: Deploy MCP only inside the full app deploy
- **Description**: Always update MCP through `deploy/update.sh`.
- **Pros**: One deployment flow.
- **Cons**: Requires frontend build and Godot export freshness for MCP-only
  changes.
- **Rejection Reason**: AI iteration needs fast MCP-only updates.

### Alternative 3: Expose only `AGENT_SKILL.md`
- **Description**: Keep the original file and tell agents to fetch `/skill`.
- **Pros**: Minimal change.
- **Cons**: Ambiguous naming, no MCP-native prompt, no stable public
  `skills.md` URL.
- **Rejection Reason**: `SKILLS.md` plus MCP resource/prompt is clearer and
  easier for agents to discover.

## Consequences

### Positive
- MCP can be updated independently from Godot/frontend deploys.
- Agent clients have a stable subdomain and public playbook URL.
- PM2/nginx/certbot setup is reproducible from scripts.
- The server is prepared for future OAuth-style discovery while retaining
  current player-created keys.

### Negative
- There is one more nginx site and one more PM2 process to monitor.
- DNS for `mcp.clashofperps.fun` is an external prerequisite.
- Phase 1 bearer-key auth is not full OAuth.

### Risks
- **DNS missing**: certbot cannot issue the TLS certificate.
  Mitigation: `deploy/deploy-mcp.sh` fails early during certbot; docs call out
  DNS as a prerequisite.
- **Streaming buffered by proxy**: MCP responses may stall.
  Mitigation: nginx config disables proxy buffering and preserves streaming
  headers.
- **Unauthorized action abuse**: exposed tools can mutate game state.
  Mitigation: bearer key auth, server-side player scoping, and rate limiting.

## Performance Implications
- **CPU**: Low; MCP is request/response except combat simulation during attacks.
- **Memory**: One extra Node process.
- **Load Time**: No frontend impact.
- **Network**: Streamable HTTP may hold requests open; nginx read/send timeout is
  set to 3600s.

## Migration Plan
1. Commit MCP deployment scripts and docs.
2. Point DNS `mcp.clashofperps.fun` to the production host.
3. Run `sudo bash /opt/clash/deploy/update-mcp.sh`.
4. Smoke-check `/health`, `/skills.md`, unauthenticated `401`, and authenticated
   MCP initialize.
5. Use full `deploy/update.sh` when game/frontend changes also need shipping.

## Validation Criteria
- `node --check mcp/src/server.mjs` passes.
- `https://mcp.clashofperps.fun/health` returns `ok: true`.
- `https://mcp.clashofperps.fun/skills.md` returns the current playbook.
- Unauthenticated `/mcp` returns `401` with `WWW-Authenticate`.
- Authenticated MCP `initialize` succeeds with a `cop_ai_...` key.

## Related Decisions
- `docs/mcp-deployment.md`
- `mcp/SKILLS.md`
