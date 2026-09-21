# ADR-0050: Guarded later cutoff after settled migration testing

## Status
Accepted — owner explicitly requested a new cutoff after completed testing. Supersedes only ADR-0041's permanent replacement prohibition; unresolved requests still lock the snapshot.

## Date
2026-09-21

## Context
### Problem Statement
Owner requests2026-09-21T17:28:00Z after one completed migration and four expired quotes. Deleting requests or relabeling the timestamp would destroy financial evidence or misrepresent eligibility.
### Constraints
Keep migration paused, historical payment assets/amounts and used allocations unchanged. No new campaign/reset, public RPC, funded tests or token transfers.
### Requirements
Replacement requires explicit admin intent, matching current checksum, later historical cutoff/slot, no unresolved requests or sales, atomic archive and cache invalidation.

## Decision
Extend the existing snapshot endpoint with opt-in `replaceSettled:true` and `expectedChecksum`. Existing capture behavior remains locked after requests unless this explicit path is selected. Replacement is allowed only while disabled and all requests are paid/expired/deposit_failed and all sales completed; unknown states fail closed. Validate before historical RPC and again inside the publishing transaction under the existing lease. Require later time and slot. Archive old snapshot metadata and all hydrated entitlement entries atomically, then publish new cutoff and clear only current eligibility cache. Retain requests, immutable per-request snapshot references, sales, sends and all used-unit accounting. New remaining allocation is max(new historical balance minus previously used CLASH,0).

### Architecture Diagram
Admin confirmation + expected checksum -> paused/settled gate -> paid historical RPC -> transactional recheck -> archive old snapshot/cache -> publish later cutoff -> existing historical entitlement hydration and unchanged used-unit deductions.

### Key Interfaces
`POST /api/migration/admin/snapshot {confirm:true,at,replaceSettled:true,expectedChecksum}`. Admin response adds `canReplaceSettledSnapshot`. Additive archive tables use old checksum as key; no private keys or signed transactions copied there.

## Alternatives Considered
### Edit production timestamp or delete test requests
Fast but does not rebuild correct eligibility and erases accounting. Rejected.
### Reset or start a new campaign
Could intentionally grant fresh allocation but changes economic policy beyond requested cutoff update. Rejected; historical usage remains consumed.

## Consequences
### Positive
Owner can advance a paused, fully settled cutoff without losing evidence or double-paying used allocation.
### Negative
Not an arbitrary rollback/earlier-cutoff mechanism. Prior migrated units are still deducted even when a later snapshot already reflects that earlier outgoing balance; admin copy explicitly discloses this conservative policy.
### Risks
Concurrent lookup: existing checksum fence prevents stale cache writes. Concurrent state change: existing lease and transaction recheck. Failed RPC/archive: preserve old state atomically. Archived eligibility is incomplete when historical wallets were never queried; metadata preserves original historical slot for reconstruction.

## Performance Implications
- CPU: indexed state checks plus existing bounded cutoff lookup.
- Memory: archive copied by SQL, not materialized as a new JSON wallet list.
- Load Time: additive tables only, no existing-data rewrite at startup.
- Network: existing paid Alchemy historical lookup; no additional signing or transfers.

## Migration Plan
Run focused server/HTTP/browser tests and deployment gate, deploy additive support, take protected production backup, recheck paused/settled state and expected checksum, invoke authenticated endpoint for owner's exact cutoff. Verify archive, ledger preservation and public UTC cutoff; keep acceptance disabled.

## Validation Criteria
Explicit opt-in, pause/all-state gating, stale checksum, monotonic time/slot, archive rollback, provider failure, concurrent state changes, old paid usage/history preserved, zero remaining when new balance is below used, stale account-cache race and admin payload across non-UTC browser timezone.

## Related Decisions
- [ADR-0041](adr-0041-historical-migration-cutoff.md)
- [ADR-0040](adr-0040-clash-custodial-migration.md)
