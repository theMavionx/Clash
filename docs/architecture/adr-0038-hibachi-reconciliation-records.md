# ADR-0038: Durable Hibachi execution records and bounded account proxy routing

## Status
Accepted for local implementation under the owner's 2026-09-16 request. Not deployed.

## Date
2026-09-16

## Context
### Problem Statement
Hibachi reconciliation needs trade ID, username, volume and market. Existing
trade_history has a composite client ID and player ID, but no immutable name
snapshot or exact quote-volume record. Existing private GET retries could rotate
on 429 and restart a 12-second timeout for each proxy.

### Constraints
Preserve rewards, existing execution/signing, ownership and public-read fallback.
Never store secrets or fabricate exchange IDs. No production migration without
owner deployment approval. Pilotbot is read-only reference, not a copied backend.

### Requirements
Verified fills only; text u64 IDs; precise decimal quote volume; stable owner;
idempotency; visible/retryable persistence failure; bounded transport retries.

## Decision
Use a dedicated hibachi_trade_records table keyed by account_id + trade_id.
Store the authenticated Clash username at first observation, exact quantity/price/
quote volume as TEXT, original market, quote currency and exchange execution time.
Trade-history upsert and record upsert are one SQLite transaction per fill. A
failure rolls back that fill and returns an unsuccessful import; retry the sync,
never the order. Order aggregates do not become execution records.

### Architecture Diagram
Authenticated Clash identity + exchange executions -> owner validation ->
SQLite transaction (trade_history + hibachi_trade_records) -> player-scoped read.

### Key Interfaces
- GET /api/futures/hibachi/trade-records: authenticated own records, limit<=500,
  offset<=1000000, Cache-Control:no-store. `volume` is quote currency, not assumed USD.
- Both import-fills and trade-history persist observed executions.
- HIBACHI_PROXY_HEALTH_FILE: optional sanitized probe report from the deployment
  host; must be fresh at startup (<24h). Only dual-success routes are admitted.
- Dedicated account pool defaults: 32 requests total, 4 per proxy concurrently.
  Shared pool consumers retain their existing higher capacity defaults.
- GET network failures may retry within one 12s budget. Writes never replay;
  redirects are refused. 429 pauses that API origin using Retry-After (seconds or
  HTTP date). Explicit regional refusal pauses it for 30min without route hopping.

## Alternatives Considered
### Existing history only
Pros: no new table. Cons: no username snapshot/exact original market/quote amount,
and legacy order_id INTEGER affinity may coerce large identifiers. Rejected.
### Best-effort async logging and rotation on any failure
Pros: fewer visible errors. Cons: silent record loss, duplicated orders and
provider/account-limit bypass. Rejected.

## Consequences
### Positive
Reconciliation records are durable, precise, deduplicated and profile-scoped.
### Negative
Record failure prevents successful sync acknowledgement; API-origin cooldown is
conservative and can pause unaffected accounts in this process too.
### Risks
Existing UI-driven history synchronization remains the ingestion trigger. This
does not add an offline reconciliation worker or recover execution history no
longer supplied by Hibachi. Historical records fill when executions are re-read.
Health reports are startup snapshots; transport cooldown handles later failures.
Origin cooldowns/concurrency are process-local, not cross-process durable limits.

## Performance Implications
- CPU: decimal arithmetic and one additional upsert per observed execution.
- Memory: bounded pool counters and two API-origin cooldown maps.
- Load time: additive indexed table initialization and optional health validation.
- Network: no extra requests for records; probe uses two unauthenticated reads per
  proxy with two workers, pacing and eight-second timeouts.

## Migration Plan
Deploy only with approval, backup existing DB, initialize additive schema, probe
the protected pool on production host, configure a fresh health report and verify
services. Existing history is untouched. Re-read available fills for backfill;
do not invent historical usernames or missing exchange IDs. No production steps
were executed in this task.

## Validation Criteria
SQLite rollback/dedup/u64/decimal/name-snapshot tests; player-scoped HTTP handler;
transport failure versus 429/region behavior; shared LeverUp/public transport
regressions. Sanitized read-only probe evidence, no funded trades.

## Related Decisions
- [ADR-0036](adr-0036-public-read-direct-fallback.md)
- [Implementation report](../../production/reports/hibachi-reconciliation-2026-09-16.md)
