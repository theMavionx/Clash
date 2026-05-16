# Clash AI MCP

Remote endpoint target:

```text
https://mcp.clashofperps.fun/mcp
```

Local run:

```bash
cd mcp
npm start
```

The local endpoint is:

```text
http://127.0.0.1:4100/mcp
```

Auth:

```text
Authorization: Bearer cop_ai_...
```

Players create and revoke `cop_ai_...` keys from the in-game Profile modal under `AI Agent`.

Useful local smoke check:

```bash
curl http://127.0.0.1:4100/health
curl http://127.0.0.1:4100/skills.md
curl -i http://127.0.0.1:4100/mcp
```

Production shape:

- Public host: `mcp.clashofperps.fun`
- Local PM2 process: `clash-mcp`
- Local bind: `127.0.0.1:4100`
- Public MCP endpoint: `https://mcp.clashofperps.fun/mcp`
- Public skill document: `https://mcp.clashofperps.fun/skills.md`
- MCP resource: `clash://agent/skill`
- MCP prompt: `clash_agent_onboarding`

`SKILLS.md` is the canonical human-readable playbook for agents. `AGENT_SKILL.md`
is kept as a backwards-compatible alias for older local workflows.

Environment:

```bash
CLASH_MCP_PORT=4100
CLASH_MCP_HOST=127.0.0.1
CLASH_MCP_PUBLIC_URL=https://mcp.clashofperps.fun
CLASH_GAME_API_URL=http://127.0.0.1:4000/api
CLASH_MCP_CORS_ORIGINS=https://clashofperps.fun,https://www.clashofperps.fun,https://mcp.clashofperps.fun
```

When hosting, proxy the whole subdomain to this service and preserve the
`Authorization` and `MCP-Protocol-Version` headers. Nginx must keep streaming
buffering disabled for `/mcp` so Streamable HTTP/SSE responses are not delayed.

Write tools notify the main game server after a successful action so online
players can watch the AI build, collect, upgrade, and manage ships live over
`/ws`. Set `CLASH_GAME_API_URL` if the game API is not at
`http://127.0.0.1:4000/api`.
