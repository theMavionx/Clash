# ADR-0051: Shared migration closing deadline, separate from settlement pause

## Status
Accepted — owner requested one-day public countdown and editable admin deadline.

## Date
2026-09-21

## Context
### Problem Statement
A public "Bridge will close in" timer must reflect a real shared cutoff, not reset per visitor or leave deposits accepted after zero.
### Constraints
Preserve existing snapshot, ratio, token, eligibility, payout delay and pause status. Never strand accepted deposits. No automatic activation/funded tests.
### Requirements
Persistent server time; UTC admin editing, server-relative24h reset and disable. Enforce expiry at quote/deposit acceptance, including asynchronous boundary races. Continue processing already accepted requests.

## Decision
Nullable `closesAt` epoch milliseconds in existing config (null means unscheduled). Dedicated authenticated PUT admin/deadline accepts exactly one of `closesAt` or bounded `durationSeconds`. It updates only deadline under worker lease and increments revision to invalidate in-flight quote config. Ordinary config saves cannot overwrite the timer. Defaults remain null until explicit production setting of24h after rollout.

### Architecture Diagram
Admin deadline -> persistent config -> public status + fresh server clock -> monotonic elapsed browser timer; same config -> authoritative quote and submit admission guards. Existing settlement worker does not consult closing deadline.
### Key Interfaces
`PUT /api/migration/admin/deadline {closesAt:ms|null}` or `{durationSeconds:86400}`. Public status exposes closesAt/serverTime/closed; server clock and closed recomputed outside readiness cache. Client uses server time plus monotonic elapsed time. Countdown has no live-region second-by-second announcements. Quote expiry is capped at closing deadline. Existing accepted submissions retain idempotent retry semantics; unsigned submissions recheck after signing but before saving/broadcast.

## Alternatives Considered
### Browser-only countdown
Easy but manipulates urgency, resets on refresh, trusts user clock and does not enforce closure. Rejected.
### Automatically set enabledfalse on expiry
Reuses pause but stops accepted payouts/sales too. Rejected: closing new admission must not abandon existing obligations.

## Consequences
### Positive
One honest editable deadline; restart/refresh persistence; accepted transactions settle normally.
### Negative
Timer keeps running while migration is paused. Administrator must intentionally extend/remove it if launch is delayed. Past deadlines close immediately. Removing/extending a deadline permits new admission only if migration was already enabled and ready.
### Risks
Client network latency affects displayed seconds, but server remains authoritative. Cached readiness cannot freeze deadline state. A rollback to older code without deadline enforcement requires pausing admission first.

## Performance Implications
CPU: one existing1Hz UI refresh and cheap config checks. Memory: one number. Load time: no new dependency/schema rewrite. Network: reuse existing polling; no new per-second requests.

## Migration Plan
Test time boundaries, async races, validation, cache freshness, restart, admin controls and mismatched client clock. Deploy canonical release, then set86400seconds once via admin endpoint. Verify public countdown and unrelated config unchanged; do not enable migration.

## Validation Criteria
One day means86400000ms from server application time. At boundary no new deposits accepted; prior accepted deposits/payouts finish. Admin custom UTC works independently of browser timezone;24h and disable work; refresh does not reset. Desktop/mobile has no overflow or JS errors.

## Related Decisions
- [ADR-0050](adr-0050-settled-snapshot-replacement.md)
- [ADR-0040](adr-0040-clash-custodial-migration.md)
