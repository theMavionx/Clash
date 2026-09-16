# ADR-0039: Hibachi public price streaming and non-blocking private WS warmup

## Status
Accepted for local implementation. Not deployed.

## Date
2026-09-16

## Context
### Problem Statement
The Hibachi hook refreshes prices/account/wallet balances every 45 seconds.
Cold order reads wait up to four seconds for WS before trying working REST.
Account stream heartbeat is 15s despite the documented 10s lease. Nested
position deltas and unrelated order messages are not correctly distinguished.

### Constraints
Preserve signing, reconciliation, account isolation and REST availability. No
funded trades for benchmarking. No credentials in public market sockets.

### Requirements
Continuous public marks; bounded reconnect and rendering; no ambiguous write
replay; cold WS failure must not serialize the REST read behind its deadline.

## Decision
Use one public Hibachi market socket per active hook, with mark-price subscriptions
for its markets. Batch latest values per symbol every 100ms. Stop on hidden tab,
unmount or venue change, resubscribe after reconnect, and reconnect after 15s
without valid data. Keep 45s REST metadata/fallback reads. Only overlay marks
received within 10s onto arriving REST payloads.

Cold orders use REST immediately while a single background handshake warms WS.
Warm reads use existing orders.status RPC. Failed warmup cools for 30s. Force-live
reads remain REST; trading writes are unchanged and never hedged or replayed.
Account WS uses 5s heartbeats, exact-integer JSON parsing, nested position deltas,
snapshot invalidation on disconnect/expiry, and bounded idle stream maps.

### Architecture Diagram
Public Hibachi WS → batched mark overlay → existing React price rows.
Private read → warm WS if open / REST if cold; background WS warmup is read-only.

### Key Interfaces
`openHibachiPriceStream({symbols,onPrices}) → stop()`;
`mergeHibachiStreamPrices(rows,updates)`; existing REST/API contracts unchanged.

## Alternatives Considered
### Alternative 1: Increase polling frequency
- Simple, but raises quota/load and retains request latency; rejected for live marks.
### Alternative 2: Move every operation to WS immediately
- Potential private-update gains, but requires authenticated stream/proxy validation,
  browser relay authorization, history catch-up and mutation-ambiguity handling.
- Deferred, not represented as completed. Current account REST-first default stays.

## Consequences
### Positive
Continuous marks, no cold-handshake penalty before REST, safer reconnect and IDs.
### Negative
Additional browser socket; REST metadata traffic retained. Account UI still polls.
### Risks
Browser networks/CSP may block direct WS: REST remains available. Public smoke does
not establish private account performance or authenticated trading correctness.
Direct private WS still uses existing transport, not the REST proxy pool; proxy
integration and provider/account limits must be validated before WS-first rollout.

## Performance Implications
- CPU: at most ten render batches/sec, latest value per subscribed symbol.
- Memory: bounded by market set; private stream maps capped at existing 500-entry budget.
- Load Time: public WS handshake measured about 0.9s from production host.
- Network: one public subscription socket; no increased account polling.

## Migration Plan
Local verification first. No migration or runtime configuration changes required.
Production release remains separate from this local implementation.

## Validation Criteria
Public live transport smoke, protocol delta/expiry tests, exact IDs, warm/cold
read tests, old-socket close race, frontend cleanup/reconnect tests and web build.

## Related Decisions
- [ADR-0038](adr-0038-hibachi-reconciliation-records.md)
- [Official account WS protocol](https://hibachi-docs.redocly.app/wsapi/account)
- [Official market WS protocol](https://hibachi-docs.redocly.app/wsapi/market)
