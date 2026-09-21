# ADR-0052: Liquidate confirmed source deposits independently of payout completion

## Status
Accepted — owner explicitly requested selling without waiting for Robinhood payment completion. Supersedes ADR-0048's paid-only lot gate; all other sale safeguards remain.

## Date
2026-09-21

## Context
### Problem Statement
The current seller waits for Robinhood payout finality even though deposited Solana CLASH is already finalized and available. Owner wants this dependency removed.
### Constraints
Keep confirmed-deposit verification, one authoritative sales ledger, exact1:1 payout obligations, existing pause, shared lease, paid Alchemy, minimum$100, normal$400 and ten-minute residual batch rules.
### Requirements
Confirmed Solana deposits may sell during payout delay or pending EVM transaction. Unconfirmed, failed, unknown and review states must not create new sale lots. No new signing endpoint or manual funded testing.

## Decision
Select unsold lots in deposited/payout_signed/paid state with a persisted positive integer depositedAt and nonempty depositHash. These states are reached through existing finalized exact-deposit verification; a current wallet balance alone never establishes eligibility. Exclude review until reconciled. Use NO_CONFIRMED_DEPOSIT_LOTS as the waiting reason. CLI help reflects the policy.

### Architecture Diagram
Finalized verified Solana deposit -> durable deposit record -> two independent existing paths: (1) delay/nonce/finality-controlled Robinhood payout; (2) balance/price/threshold/simulation-controlled CLASH-to-SOL sale. Both remain serialized by the shared worker lease.
### Key Interfaces
No API/schema/config changes. salesPreview and tickSales share updated eligibility. Existing signed sale bytes, lots, soldUnits accounting and payout commitments remain authoritative.

## Alternatives Considered
### Keep paid-only gate
Simple but unnecessarily delays liquidation; rejected per explicit owner instruction.
### Sell all wallet holdings or signed/unconfirmed deposits
Faster but risks unrelated holdings or unconfirmed transfers; rejected. No removal of source finality or price floor.

## Consequences
### Positive
Large batches become eligible in the cycle confirming deposits, without waiting for payout delay/finality.
### Negative
Solana tokens may already be sold if Robinhood payout later fails. Operator retains full outstanding CLASH obligation and must reconcile/fund payout; source-token refund is not automatically available.
### Risks
Double sale after restart or payout update: retain existing signed-sale reservation, shared lease and atomic soldUnits updates. Review excludes new liquidation but never erases already-signed sales or payout liabilities. Existing enabled migration means deployment activates this behavior for current confirmed unsold deposits too.

## Performance Implications
- CPU: small additional predicate in existing lot scan.
- Memory/load time: unchanged; no dependency.
- Network: batches may execute earlier, same bounded read/simulation/broadcast mechanisms.

## Migration Plan
Run focused and canonical deploy checks, ship via existing atomic deploy. No financial configuration or ledger rewrite. Verify live actual receipt/lot state read-only, never initiate an extra manual trade. Rollback restores paid-only eligibility but existing signed sales still reconcile.

## Validation Criteria
Tests demonstrate a finalized$400 deposit sells while420s payout delay is still active; completed sale consumes once across restart and later payout preserves destination, exact1:1 units and soldUnits. Pending source deposits, invalid confirmation metadata and unknown/review states stay excluded. Residual ten-minute rule/$100floor remain. Existing pause/race/lease/receipt tests must pass.

## Related Decisions
- [ADR-0048](adr-0048-migration-sales-runner.md)
- [ADR-0051](adr-0051-migration-closing-deadline.md)
