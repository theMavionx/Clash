---
paths:
  - "hermes-orchestrator/**"
  - "server/hermes_client.js"
  - "server/hermes_jobs_worker.js"
  - "server/routes.js"
  - "mcp/**"
---

# AI And Agent Code Rules

- Treat AI agent keys, wallet data, and trading permissions as sensitive.
- Verify action completion with authoritative server or MCP results before reporting success.
- Keep agent prompts/tool policies explicit and auditable.
- Log enough context to debug failures without leaking secrets.
- Bound loops, retries, and scheduled jobs.
- Validate AI-provided arguments before passing them to gameplay, trading, or wallet operations.
- Keep player-facing AI errors actionable and concise.
