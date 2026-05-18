# Clash Hermes AI Chat Deployment

This document covers the dedicated Hermes VPS that powers in-game AI chat.

## Runtime Shape

```text
Clash backend -> Hermes orchestrator -> per-player Hermes -> OpenRouter + Clash MCP
```

The browser only talks to the Clash backend. It never receives OpenRouter,
Hermes, or MCP keys.

## Prompt And Settings Source Of Truth

The in-game AI prompt is managed in:

```text
hermes-orchestrator/src/clash_agent_prompt.cjs
```

Both the Clash backend and the Hermes orchestrator import this file. Keep all
identity, tool-use rules, battle tactics, response format, and safety rules
there so production and local tests stay aligned.

When the prompt changes, increment `CLASH_PROMPT_VERSION`. The orchestrator
clears old per-player Hermes sessions on the next provision so stale generic
assistant behavior does not leak into the game chat.

Each player runtime gets:

```text
/srv/clash-hermes/players/<player_id>/
  config.yaml  # MCP allowlist, toolsets, model, timeouts
  SOUL.md      # Clash playbook
  HERMES.md    # Clash playbook
  skills/clash-of-perps-ai-agent/SKILL.md
```

## Local Environment

The Clash backend reads:

```env
CLASH_HERMES_ORCHESTRATOR_URL=http://127.0.0.1:8600
CLASH_HERMES_ORCHESTRATOR_TOKEN=horg_...
CLASH_HERMES_MODEL_CHAIN=google/gemma-4-26b-a4b-it:free,minimax/minimax-m2.5:free,openai/gpt-oss-120b:free,nvidia/nemotron-nano-12b-v2-vl:free,liquid/lfm-2.5-1.2b-instruct:free
CLASH_HERMES_PRIMARY_MODEL=google/gemma-4-26b-a4b-it:free
CLASH_HERMES_FALLBACK_MODEL=minimax/minimax-m2.5:free
CLASH_HERMES_PRIMARY_RETRIES=3
CLASH_HERMES_FALLBACK_AFTER_RETRIES=1
CLASH_HERMES_CHAT_TIMEOUT_MS=20000
CLASH_HERMES_MODEL_CONTEXT_LENGTH=65536
```

The root `.env` file is ignored by git. Do not commit filled secrets.

## Hermes VPS Update Flow

Production updates on the dedicated Hermes VPS should mirror the existing game
host pattern:

```bash
sudo OPENROUTER_API_KEY=sk-or-v1-... \
  HERMES_ORCHESTRATOR_TOKEN=horg_... \
  bash /opt/clash/deploy/update-hermes.sh
```

This pulls `/opt/clash`, then runs `deploy/deploy-hermes.sh`, which delegates
to `deploy/hermes/setup-vps.sh`.

## Initial VPS Bootstrap

From a checked-out repo on the Hermes VPS:

```bash
sudo OPENROUTER_API_KEY=sk-or-v1-... \
  HERMES_ORCHESTRATOR_TOKEN=horg_... \
  bash deploy/hermes/setup-vps.sh
```

From Windows using PuTTY tools:

```powershell
.\deploy\hermes\deploy-vps.ps1 `
  -HostName 62.72.35.202 `
  -User root `
  -OpenRouterApiKey $env:OPENROUTER_API_KEY `
  -OrchestratorToken $env:CLASH_HERMES_ORCHESTRATOR_TOKEN
```

The setup script:

- deduplicates exact duplicate Ubuntu apt source lines;
- installs Docker, nginx, git, curl, ffmpeg, ripgrep, Python, uv;
- installs Hermes Agent if missing;
- installs the Node orchestrator;
- writes `/srv/clash-hermes/shared/orchestrator.env`;
- installs `clash-hermes-orchestrator.service`;
- runs `deploy/hermes/healthcheck.sh`.

## Production Exposure

Default orchestrator bind:

```env
CLASH_HERMES_ORCHESTRATOR_HOST=127.0.0.1
```

If the game backend is on a different host, prefer a private network or SSH
tunnel. The main game production host has the same update-style entrypoint:

```bash
sudo CLASH_HERMES_ORCHESTRATOR_TOKEN=horg_... \
  CLASH_HERMES_VPS_HOST=62.72.35.202 \
  bash /opt/clash/deploy/update-hermes-tunnel.sh
```

For a checkout that has already been pulled, the lower-level helper is:

```bash
sudo CLASH_HERMES_ORCHESTRATOR_TOKEN=horg_... \
  CLASH_HERMES_VPS_HOST=62.72.35.202 \
  bash deploy/hermes/install-backend-tunnel.sh
```

It generates `/opt/clash/shared/hermes_tunnel_ed25519`, prints the public key,
writes `clash-hermes-tunnel.service`, and sets
`CLASH_HERMES_ORCHESTRATOR_URL=http://127.0.0.1:8600` in the production env.
Install the printed public key into `/root/.ssh/authorized_keys` on the Hermes
VPS, then start the tunnel:

```bash
sudo systemctl start clash-hermes-tunnel
curl http://127.0.0.1:8600/health
```

If binding to `0.0.0.0`, set:

```env
CLASH_HERMES_BACKEND_CIDR=<game-backend-ip>/32
```

The orchestrator requires:

```text
Authorization: Bearer HERMES_ORCHESTRATOR_TOKEN
```

## Operations

```bash
systemctl status clash-hermes-orchestrator
journalctl -u clash-hermes-orchestrator -f
CLASH_HERMES_ORCHESTRATOR_PORT=8600 bash /opt/clash/deploy/hermes/healthcheck.sh
```

Player homes:

```text
/srv/clash-hermes/players/<player_id>/
  .env
  config.yaml
  sessions/
  memory/
```

State:

```text
/srv/clash-hermes/state/players.json
```

Logs:

```text
/srv/clash-hermes/logs/<player_id>.out.log
/srv/clash-hermes/logs/<player_id>.err.log
```

## Backend API

Authenticated with the normal player `x-token`:

```text
GET  /api/ai-chat/status
POST /api/ai-chat/message { "message": "collect resources" }
POST /api/ai-chat/reset { "delete_memory": false }
```

## Security Notes

- Rotate the OpenRouter key if it has ever been exposed in chat or logs.
- Replace root password SSH with key-based SSH before production launch.
- Keep Hermes API server bound to `127.0.0.1` inside each player runtime.
- Keep the Clash MCP tool allowlist tight.
- Do not expose the orchestrator to the public internet without firewall and
  bearer-token protection.
