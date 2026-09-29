# ADR-0059: Durable QFEX fill reconciliation

## Status
Accepted for local implementation; production release pending.

## Date
2026-09-22

## Context
### Problem Statement
Reading the first 1000 REST fills and WebSocket executions on every poll silently
excluded older trades. The feeds can have different ordering and indexing delays.
Quest synchronization also depended on an open trading panel.

### Constraints
- API keys stay in the player-scoped encrypted vault and same-origin headers.
- No synthetic volume; accepted server builder intents and matching execution evidence remain mandatory.
- Bounded network batches; existing ledger uniqueness protects repeated claims.

### Requirements
Resume history beyond 1000 fills after restart, join feeds across page boundaries,
prevent concurrent cursor regression, and make incomplete/failed sync visible.

## Decision
Persist independent feed offsets and a fixed scan-end timestamp per verified QFEX
account. Store REST and execution evidence keyed by account and fill ID, joining
only with accepted builder-attributed intents. A database lease serializes passes
across processes. Each pass reads at most 1000 rows per feed, including a small
head refresh while backfilling. Completed sweeps restart to catch delayed indexing.
Cursor updates and evidence staging are atomic; ledger uniqueness permits replay
after a crash before evidence is marked processed. Successful account refreshes do
not clear reward synchronization errors.

### Architecture Diagram
Authenticated vault → terminal or quests → account lease → paginated REST + WS
→ persisted evidence → accepted builder intent → verified ledger → Gold/tasks/tournament.

### Key Interfaces
`POST /api/futures/qfex/import-trades` retains existing counts and adds durable
offsets, pending matching information and `syncing`. `has_more` means continuation,
not lost history. No API credential enters these tables.

## Alternatives Considered
### Alternative 1: Raise the hard limit
- Simple, but leaves an eventual cap and unbounded request cost; rejected.
### Alternative 2: A single shared offset
- Smaller schema, but different feed ordering loses valid matches; rejected.

## Consequences
### Positive
Resumable history, transparent failures, independent quest authentication and no
reward eligibility relaxation.
### Negative
Additional evidence storage and recurring full scans; indexing is eventual while
an authenticated client remains active. This is not a credential-retaining worker.
### Risks
Offset drift from delayed upstream insertion is repaired by repeated sweeps.
Partial reads never advance cursors. Expired leases are recoverable; unique ledger
fill IDs prevent duplicate rewards. Live exchange behavior still needs authenticated validation.

## Performance Implications
- CPU: bounded JSON normalization and indexed SQL joins.
- Memory: at most one bounded batch per feed.
- Load Time: local schema creation on first synchronization.
- Network: bounded 100-row pages; no unbounded history loop per HTTP request.

## Migration Plan
Create additive SQLite tables on demand; preserve existing trade/proof ledgers.
First pass starts at offset zero and deduplicates against already imported fills.

## Validation Criteria
More than 1000 differently ordered fills, restart resume, delayed evidence,
concurrent calls, partial failure, duplicate claims and missing builder proof.
Standalone quest sync and visible error/retry states must also be exercised.

## Related Decisions
- [QFEX API-key trading](adr-0057-qfex-api-key-trading.md)
- https://docs.qfex.com/api-reference/rest/user/user-trades
- https://docs.qfex.com/websocket/channels/trade/get_user_trades
