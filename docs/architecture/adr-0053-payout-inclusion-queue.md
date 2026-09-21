# ADR-0053: Advance payout queue after verified inclusion, retain finality accounting

## Status
Accepted — owner explicitly asks not to block payouts on Robinhood finalization. Amends ADR0046 queue sequencing, not final settlement.

## Date
2026-09-21

## Context
### Problem Statement
A successful Robinhood payout blocks every other recipient while the finalized RPC head lags latest by about15minutes. User requestd4ed39d3... delay expired21:34Kyiv but no transaction was created by21:45.
### Constraints
Maintain exact Transfer verification, canonical block checks, immutable signed bytes, existing lease, nonce uniqueness, review barriers, deposit finality and final paid accounting. No duplicate/manual rescue transaction.
### Requirements
Process next payout after previous transfer is included successfully, without trusting a stored flag. Explain included versus finalized in user/admin UI. Apply to existing signed/queued requests without database rewrite.

## Decision
payoutStatus validates canonical block and exact token/from/to/amount first. Returns included before finality and confirmed after finality. inclusionOnly mode skips finalized RPC entirely for sequencing. Before preparing a new payout, verify each outstanding payout_signed receipt afresh; pending/failed/conflict/RPC errors and review rows retain the barrier. preparePayout retains pending/latest nonce check. Before persistence, fence lease, recheck enabled and reject a nonce already reserved by any other request from that treasury, even after reorg.

Persist payoutIncludedAt only for display/audit; never use it as authorization. Included transactions are not rebroadcast. Pending/orphaned transactions clear inclusion and retry only existing signed bytes, no new nonce. Final confirmed receipt alone marks paid. UI says Tokens transferred — awaiting network finality, and remains distinct from Migration complete.

### Architecture Diagram
Signed bytes -> canonical exact included receipt -> next nonce may proceed; independently -> finalized receipt -> paid. Reorg -> same bytes pending/review -> queue waits.
### Key Interfaces
payoutStatus(request,{inclusionOnly:true}) returns included/pending/failed/conflict; ordinary status also returns confirmed. Public/admin ledger adds nullable payoutIncludedAt. No new request status or schema change.

## Alternatives Considered
### Mark paid at latest receipt
Quick but erases finality reconciliation and overstates completion. Rejected.
### Trust cached included flag or permit all pending nonces
Fewer reads but unsafe after reorg/RPC inconsistency. Rejected; persisted signed identity and fresh verification retained.

## Consequences
### Positive
Recipient payouts no longer wait for unrelated finalized-head lag. Successful mined sends are not repeatedly broadcast as nonce-too-low errors.
### Negative
Additional canonical receipt checks scale with outstanding included payouts. Inventory reservation remains conservative: included but unfinalized payouts can temporarily reduce new quote capacity until finality.
### Risks
Reorg after a check: reservation guard prevents reuse of a persisted nonce; immutable-byte recovery handles orphaned sends. External treasury use can still force manual reconciliation. Live reorg behavior cannot be fully proven by mocks. Failed/unknown receipts never count as successful transfers.

## Performance Implications
CPU/memory: small predicate/nullable metadata; no dependency. Network: canonical receipt/exact-transfer verification per outstanding send before new signing. No finalized RPC in sequencing checks; existing worker window remains20requests/cycle.

## Migration Plan
Run focused tests, browser status flow, independent safety review and canonical Deploy gate; atomic deploy with current enabled state/config unchanged. Observe worker sending queued requestd4ed39d3... and verify exact receipt read-only. Do not resend manually. Rollback restores conservative queue; extra JSON field tolerated.

## Validation Criteria
Success before finality advances queue; wrong token/from/to/amount, failed/orphaned receipt or RPC failure blocks. Restart and multi-payout reorg reuse original bytes. Nonce rollback cannot persist duplicate. Pause during preparation prevents persistence. Included UI never claims final settlement. Finality alone marks paid.

## Related Decisions
- ADR0046 current treasury inventory vs settlement finality
- ADR0052 independent confirmed-deposit sales
