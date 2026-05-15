# Clash AI MCP

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
curl http://127.0.0.1:4100/skill
```

When hosting on the main site, proxy `/mcp` to this service and keep the same Authorization header.

Write tools notify the main game server after a successful action so online
players can watch the AI build, collect, upgrade, and manage ships live over
`/ws`. Set `CLASH_GAME_API_URL` if the game API is not at
`http://127.0.0.1:4000/api`.
