# ADR-0002: Per-Player Hermes AI Chat

## Status
Proposed

## Date
2026-05-17

## Context

### Problem Statement
Players need an in-game AI chat that can perform real game actions through the
Clash MCP server while using OpenRouter models through Hermes Agent. The system
must keep each player's game state, MCP key, memory, and chat history isolated.

### Constraints
- The browser must never receive OpenRouter, Hermes, or MCP bearer secrets.
- The existing Clash MCP server remains the only game-action surface.
- Hermes will run on a dedicated VPS separate from the current game production
  host.
- The first production version must support lazy per-player startup so idle
  players do not keep permanent agent processes alive.
- MCP attack rate limits and existing game validations remain authoritative.

### Requirements
- Use OpenRouter as the LLM provider.
- Use `openai/gpt-oss-20b:free` as the primary model.
- Fall back to `google/gemma-4-31b-it:free` after two failed primary attempts.
- Provision one isolated Hermes home per Clash player.
- Use a per-player `cop_ai_...` MCP key.
- Expose game chat through Clash backend endpoints only.
- Provide one-command VPS setup/update scripts.

## Decision

We will introduce a dedicated `clash-hermes-orchestrator` service. The game
backend talks to this service using a private bearer token. The orchestrator
creates and manages one Hermes runtime home per player under
`/srv/clash-hermes/players/<player_id>`, writes a Hermes MCP config containing
that player's MCP key, starts `hermes gateway` on an internal per-player port,
and proxies chat requests to Hermes' OpenAI-compatible Responses API.

The Clash backend stores a recoverable server-side Hermes MCP key in
`hermes_agents`. This key is not exposed to the client; it exists so the backend
can reprovision the player's Hermes home after restarts or VPS recovery.

### Architecture Diagram

```text
Browser game UI
  |
  | x-token authenticated chat request
  v
Clash backend /api/ai-chat/*
  |
  | Bearer HERMES_ORCHESTRATOR_TOKEN
  v
Hermes VPS: clash-hermes-orchestrator
  |
  | HERMES_HOME=/srv/clash-hermes/players/<player_id>
  v
Per-player Hermes gateway API server
  |
  | OpenRouter API
  v
OpenRouter model
  |
  | MCP HTTP tools with Authorization: Bearer cop_ai_...
  v
https://mcp.clashofperps.fun/mcp
  |
  v
Clash DB, replay simulation, websocket game events
```

### Key Interfaces

Game backend:

```text
GET  /api/ai-chat/status
POST /api/ai-chat/message
POST /api/ai-chat/reset
```

Hermes orchestrator:

```text
GET  /health
GET  /players/:playerId/status
POST /players/:playerId/provision
POST /players/:playerId/chat
POST /players/:playerId/reset
POST /players/:playerId/stop
```

## Alternatives Considered

### Alternative 1: One Shared Hermes Agent
- **Description**: All players use one Hermes home and one long-running Hermes
  process.
- **Pros**: Simple deployment and lowest resource use.
- **Cons**: Player memory, sessions, and MCP credentials can bleed across
  users. Prompt-injection blast radius is all players.
- **Rejection Reason**: Fails privacy and tenant-isolation requirements.

### Alternative 2: Browser Calls Hermes Directly
- **Description**: The web app calls Hermes API Server from the browser.
- **Pros**: Less backend proxy code.
- **Cons**: Exposes Hermes API surface and bearer auth to the browser; CORS and
  abuse controls become risky.
- **Rejection Reason**: The Hermes API server can expose powerful tools and
  should remain private.

### Alternative 3: Backend Implements OpenRouter Tool Loop Directly
- **Description**: Skip Hermes and convert MCP tools to OpenRouter function
  tools in the Clash backend.
- **Pros**: Fewer moving parts.
- **Cons**: Loses Hermes memory, skills, gateway, and self-hosted agent runtime.
- **Rejection Reason**: The product requirement explicitly includes Hermes.

## Consequences

### Positive
- Strong per-player isolation for sessions and memory.
- Secrets stay server-side.
- The existing MCP server remains the game authority.
- Idle shutdown keeps costs bounded.
- The orchestrator can later move from process isolation to Docker-per-player
  without changing the game frontend API.

### Negative
- More services to deploy and monitor.
- The game backend must store a recoverable MCP key for Hermes provisioning.
- First response for an idle player may be slower while Hermes starts.

### Risks
- Hermes config keys may change across versions.
  - Mitigation: keep deploy health checks and pin/retest Hermes releases.
- Free OpenRouter models may rate-limit or have weaker tool use.
  - Mitigation: fallback model and per-run error reporting.
- Orchestrator VPS exposure could become an attack surface.
  - Mitigation: bind to localhost by default, require bearer auth, use firewall
    allowlists if bound to a public interface.

## Performance Implications
- **CPU**: One active Hermes process per online/chatting player; idle shutdown
  after 15 minutes by default.
- **Memory**: Bounded by active players, not registered players.
- **Load Time**: First chat after idle includes Hermes startup time.
- **Network**: Game backend to orchestrator, orchestrator to OpenRouter and MCP.

## Migration Plan
1. Add database tables for Hermes agent records and chat audit events.
2. Add backend `/api/ai-chat/*` endpoints.
3. Add `hermes-orchestrator` service.
4. Add one-command setup scripts under `deploy/hermes`.
5. Deploy to the dedicated Hermes VPS.
6. Add frontend chat UI and stream/progress UX.
7. Add admin metrics for Hermes chat usage and failures.

## Validation Criteria
- A player can ask the AI to collect resources and the MCP action executes.
- Two players chatting concurrently receive isolated sessions and cannot access
  each other's state.
- OpenRouter primary model failures fall back after two failed attempts.
- Browser network traffic contains no OpenRouter, Hermes, or MCP secrets.
- Restarting the orchestrator preserves player homes and can recover state.

## Related Decisions
- [ADR-0001: Remote MCP Deployment](./adr-0001-remote-mcp-deployment.md)
- [MCP Deployment](../mcp-deployment.md)
