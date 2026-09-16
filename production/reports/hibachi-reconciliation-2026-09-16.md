# Hibachi records and proxy routing — 2026-09-16

Status: implemented and tested locally; no commit, push, deployment or production DB mutation.

## Record contract

Mandatory for each imported verified execution: trade_id, username, market,
volume_quote (exported as volume) and volume_currency. Also account_id, player_id,
quantity, price, side, order_id, executed_at and recorded_at. Trade and order IDs
are TEXT; exact decimal amounts use BigNumber. Username comes from authenticated
server player.name, never request body, and is retained from first observation.

Table: hibachi_trade_records. Its upsert is atomic with trade_history and unique
by account_id/trade_id. Failed writes return HIBACHI_RECORD_PERSIST_FAILED and
roll back that fill's credit. Both history-read and import routes persist observed
executions. Order aggregates remain display fallback, not reconciliation fills.

Authenticated GET /api/futures/hibachi/trade-records returns only the caller's
records (limit max500, offset max1000000); responses cannot be cached. No keys,
signatures, raw credential objects or proxy addresses are stored in these records.
No records have been sent to an external recipient.

## Proxy verification

Source: owner's 100-entry Webshare file, never copied into Git. Two workers;
read-only public exchange-info and unauthenticated /auth/csrf checks, eight-second
timeout, no redirect and no retry after refusal. Result from local workstation:

- 100/100 market endpoint passed.
- 45/100 main API origin checks passed.
- 55/100 main API origin checks returned HTTP401. Bodies were not retained, so
  this report does not infer a specific regional or credential cause.
- Checked at 2026-09-16T06:16:53Z. Row numbers and hashed IDs only in
  [sanitized report](hibachi-proxy-probe-2026-09-16.json).

This does not prove authenticated account permissions, actual trading, or VPS
connectivity. Before production activation, run probe-hibachi-proxies.js on the
deployment host with the protected proxy file and a sanitized output path. Set
HIBACHI_PROXY_HEALTH_FILE to that report to admit only dual-success routes;
startup rejects stale (>24h), invalid or empty eligible reports. No runtime
production pool was changed here. Public reads retain the existing shared manager.

## Routing changes

Private account pool: max32 total / max4 per proxy, retains affinity while allowing
busy-route distribution. Reads retry transport failures only within one12s budget.
POST/DELETE never replay. Redirects refused. 429 honors Retry-After including HTTP
dates and pauses the API origin; explicit regional401/403/451 pauses without
rotating routes. Shared pool compatibility checked against public and LeverUp
transports. Pilotbot's server/egress.mjs and probe script informed cooldown,
non-replay, response classification and credential-redaction design.

Official [Account API documentation](https://hibachi-docs.redocly.app/accountapi)
confirms authenticated account/trade operations; the inspected page does not state
a numeric rate quota. Existing configured REST rate ceiling was not increased.

## Verification and remaining limits

- Final focused suite: 65 tests passed; server syntax and git diff checks passed.
- Local SQLite: exact u64 ID, decimal volume, immutable first username, duplicate
  import, reopened DB durability, induced write failure rollback, missing identity.
- Actual GET route handler over local HTTP with stub auth: player isolation,
  missing-auth401, bounded pagination, no-store and text IDs.
- Network mocks: transport failover, no signed replay, cross-account429 cooldown,
  HTTP-date Retry-After, region refusal, deadline and fresh-health filtering.
- Existing public proxy and LeverUp tests include real local CONNECT tunnels.
- Existing UI-driven sync remains the ingestion trigger; an offline worker is
  not added. Old records populate only when executions can be re-read. Complete
  historical coverage and live exchange-authenticated/VPS behavior not claimed.
- UI redesign draft remains separate and untouched by these server changes.
