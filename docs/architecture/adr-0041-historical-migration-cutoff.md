# ADR-0041: UTC migration cutoff with historical wallet eligibility

## Status
Accepted — owner requested selecting snapshot time; supersedes ADR-0040's current-snapshot-only restriction.

## Date
2026-09-21

## Context
### Problem Statement
The existing finalized current-balance capture cannot represent a user-selected past date. An administrative timestamp must determine eligibility, not merely label today's balances.
### Constraints
Only existing paid Alchemy, fixed source mint, unchanged custody/settlement safeguards. Never choose a live cutoff for the owner. Existing requests lock eligibility permanently.
### Requirements
UTC input and display, actual finalized block boundary, historical balances including closed/transferred token accounts, no increased allowance from later purchases, explicit provider failures.

## Decision
Resolve the UTC cutoff to the last produced finalized block at or before its second, verify the next produced block is later, and persist requested time/actual block time/slot/checksum. Reject future, unfinalized and unavailable dates rather than silently shifting them. Native Solana block timestamps are the chain's time reference, not an independent transaction wall clock.

Use Alchemy `getTokenAccountsByOwnerAtSlot` for each authenticated wallet at that immutable slot. Validate every page's exact context slot, owner, mint, program, decimals, integer amount, unique accounts and pagination completion. Persist complete per-wallet results (including zero) atomically. Fail closed on incomplete history; never fall back to today's account enumeration. Old current captures remain readable.

Live verification exposed a pre-existing program mismatch: CLASH is Token-2022 with only MetadataPointer and TokenMetadata mint extensions, not the legacy Token program assumed by ADR-0040. Pin source reads, historical validation, ATA derivation, transfer instructions and sale source account to Token-2022. Account enumeration must include170-byte immutable-owner accounts. Budget170-byte ATA rent. Keep WSOL cleanup on its legacy program; reject unsupported fee/hook mint extensions rather than claiming generic Token-2022 compatibility.

### Architecture Diagram
UTC picker -> finalized time/slot boundary -> immutable cutoff -> authenticated wallet -> historical account pages -> durable entitlement -> existing quote reservations.
### Key Interfaces
`POST /api/migration/admin/snapshot {confirm:true,at:ISO8601-UTC}`. Snapshot adds `mode`, `requestedAt`, `blockTime`. Aggregate counts mean evaluated wallets, not all historical holders. `account` and direct `quote` both hydrate historical entitlement before checking it.

## Alternatives Considered
### Current balances with a chosen date label
Cheap but false and exploitable by later purchases; rejected.
### Enumerate current holders and replay transactions
Misses closed accounts/previous owners unless a full indexer is built; expensive and unnecessary given the verified historical owner index.

## Consequences
### Positive
Exact fixed-slot account evidence, no holder enumeration needed, cached eligibility and unchanged replay protections.
### Negative
First wallet lookup requires paid historical RPC; full historic population totals are not precomputed.
### Risks
Provider outage/mismatched slot/incomplete pagination: reject and preserve prior state. Snapshot replacement during a lookup: compare identity before persisting. Existing request: replacement forbidden. Large wallets: bounded pages and explicit refusal rather than partial balance.

## Performance Implications
CPU/memory bounded by at most100 pages of1000 accounts; usual wallet lookup is one page. Cutoff resolution uses bounded binary search over produced slots. Network is paid Alchemy only. Subsequent eligibility reads use SQLite.

## Migration Plan
Add separate snapshot metadata table; retain old snapshot table and current-capture compatibility. Clear cached entitlements only when replacing a snapshot before any requests. Never change production cutoff during deploy.

## Validation Criteria
UTC across browser timezones, exact/block-gap/repeated-timestamp boundary, future/unavailable refusal, historical page validation, closed-account inclusion, cached zero, post-cutoff purchases, stale snapshot race, direct quote without prior account read, lock after request, legacy compatibility and browser admin flow.

## Related Decisions
- [ADR-0040](adr-0040-clash-custodial-migration.md)
- https://www.alchemy.com/docs/chains/solana/solana-api-endpoints/get-token-accounts-by-owner-at-slot
- https://www.alchemy.com/docs/solana/account-archive
