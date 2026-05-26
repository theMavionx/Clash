---
paths:
  - "server/**"
  - "mcp/**"
  - "web/**"
---

# Network And Server Rules

- Server is authoritative for gameplay-critical state.
- Validate request bodies, auth state, IDs, numeric ranges, wallet addresses, and agent keys.
- Keep endpoint responses backward-compatible when possible; document breaking changes.
- Rate-limit noisy logs and protect endpoints that can be spammed.
- Treat client input as untrusted, including replay, battle, trading, NFT, and AI chat flows.
- Make SQLite migrations idempotent and safe to run repeatedly.
- For live integrations, prefer explicit failure states over silent partial success.
