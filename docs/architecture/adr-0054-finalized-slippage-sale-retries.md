# ADR-0054: Bounded replacement of proven failed Jupiter sales

## Status

Accepted — owner explicitly approved safe retries.

## Date

2026-09-21

## Context

### Problem Statement

A finalized Jupiter error 6001 stopped liquidation despite no CLASH debit. Unknown outcomes cannot be treated as failed trades.

### Constraints

Preserve the $100 floor, $400 batch, residual timing, configured slippage cap, shared lease, signed bytes, audit history and deposit-based eligibility.

### Requirements

Positive failure proof, bounded funded attempts, restart safety and no failed-lot accounting.

## Decision

Verify finalized signature/receipt slot agreement, exact persisted message/hash, sole valid treasury signature, matching Jupiter instruction error 6001, derived source ATA, and unchanged source/aggregate treasury CLASH balances. Missing evidence returns null; RPC failures never authorize replacement.

Archive proven failure and wait 30 seconds. Increase actual slippage along 50/100/200/500/1000 bps (including an intermediate configured cap), never beyond current cap or 1000 bps. At most four replacement attempts per lineage. Exhaustion, other errors and ambiguous/expired transactions remain in review.

Rebuild prices, eligible batch/lots and simulation each attempt. Parent retry consumption and child insertion/audit are atomic under the shared lease. Only successful finalized child updates soldUnits. Recheck emergency pause after preparation. Original failure remains in admin history; retryOf denotes execution lineage, not identical amount/lots.

### Architecture Diagram

Signed sale -> positive finalized failure proof -> failed parent / cooldown -> fresh simulation -> atomic linked child. Ambiguous or exhausted -> review. Successful receipt -> sold accounting once.

### Key Interfaces

saleFailureEvidence(sale) returns {kind: "slippage", slot, code: 6001}, null, or throws on unavailable RPC. Persist failedSlot, retryPending, retryNotBefore, retryOf, retryRoot, retryCount and retriedBy in existing JSON. No SQL schema change.

## Alternatives Considered

### Retry any error

Simple but risks duplicate sales after unavailable successful receipts; rejected.

### Delete/reset review rows manually

Fast but loses auditability and bounds; rejected in favor of normal worker reconciliation.

## Consequences

### Positive

Known slippage failures recover without losing audit history or accounting safety.

### Negative

Up to four replacements can consume additional network fees; failed rows remain stored.

### Risks

Thin liquidity can exhaust the cap; retain review, not infinite retries. Incomplete RPC evidence blocks safely. Execution is not guaranteed.

## Performance Implications

- CPU: failure-only signature verification.
- Memory: small receipt/lineage records.
- Load time: no frontend change.
- Network: finalized failure reads plus fresh quote/simulation per replacement.

## Migration Plan

Deploy adapter/core together through canonical scripts. Existing review rows recover only with positive proof. No manual DB reset or unknown transaction replacement.

## Validation Criteria

Reject mismatched evidence; test cooldown/restart/cap exhaustion, failed-lot accounting, successful-child idempotency, pause and atomic insertion rollback. Verify production recovery read-only.

## Related Decisions

- ADR-0052 confirmed-deposit sales.
- ADR-0053 inclusion-based payout sequencing.
