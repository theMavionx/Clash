# ADR-0055: Recover proven expired and unlanded Solana deposits

## Status

Accepted — owner requests fixing the deposit reconciliation dead end.

## Date

2026-09-21

## Context

### Problem Statement

Expired signed deposits remain reserved indefinitely even when a healthy historical RPC reports no transaction. The UI offers only contact support. Null receipt or wallet balance alone is insufficient to release allocation.

### Constraints

Paid Alchemy only. Preserve immutable signed history, explicit wallet signatures, eligibility/supply/inventory/fee/deadline gates and outgoing payout protections. Never infer execution from simulation.

### Requirements

Prove blockheight expiry and historical absence with fresh contexts twice; retain review on ambiguity. New attempt must be a separate quote with a fresh signature.

## Decision

Adapter validates original raw signatures, expected quote identity (including already supported Lighthouse assertions), hash, treasury fee payer, wallet signer and recent blockhash; durable nonce rejected. Finalized height must exceed stored lastValidBlockHeight by more than32 blocks. Original blockhash must be invalid with fresh context, and history-enabled signature absence must bracket an absent finalized receipt.

Core observes this evidence twice at least30 seconds apart with strictly advancing finalized height and slot. RPC errors, uncertainty or a discovered transaction reset the probe or reconcile the deposit normally. Only deposit-only review with no outgoing payout evidence or sold lots qualifies. After verification mark the original row deposit_failed with DEPOSIT_EXPIRED_UNLANDED, retaining raw/hash/sends and recorded proof. No signing or broadcasting in recovery. This uses the existing terminal accounting rules to restore allocation.

UI explains verification in progress and offers Create new quote only after verified terminal recovery. Button prefills editable amount/recipient, never signs or submits. Normal admission and fresh wallet approval are mandatory; recovery does not extend deadline or waive fees.

### Architecture Diagram

Review -> exact finalized expiry/absence probe -> wait30s and advancing chain -> second proof -> terminal failed attempt + restored allocation -> user requests new quote -> new wallet signature.

### Key Interfaces

depositExpiryEvidence(request) returns {kind:expired_unlanded,slot,height}, null, or RPC error. Existing JSON persists probe/evidence/verifiedAt; no SQL migration or replacement of old signed bytes.

## Alternatives Considered

### Release every wall-clock timeout

Simple but unsafe for delayed successful transactions; rejected.

### Keep every expired deposit in manual review forever

Conservative but creates permanent user dead ends for ordinary expiry; replaced only where strict evidence succeeds.

## Consequences

### Positive

Expired unlanded attempts become recoverable without manual database edits or duplicate original payments.

### Negative

Additional RPC reads and at least30 seconds verification; user signs a new transaction.

### Risks

RPC history completeness is a trust assumption, not cryptographic absence proof. Use configured paid provider, fresh contexts, repeated advancing evidence and fail closed on errors. Original unexplained broadcast failure is not thereby diagnosed. A new attempt can still expire if the user delays signing.

## Performance Implications

- CPU: signature verification on reviewed requests only.
- Memory: small proof JSON.
- Load time: small UI affordance, no dependency.
- Network: bounded proof reads per reviewed request within existing20-row worker window.

## Migration Plan

Run core/adapter and browser regressions, deploy normally. Existing valid reviews recover through the worker without manual reset. Keep unrelated reviews unchanged. Verify affected production row and restored allocation read-only; never sign for the user.

## Validation Criteria

Reject stale context, wrong identity, durable nonce, valid blockhash, insufficient expiry, late receipt/status and RPC errors. Verify restart, advancing proof fence, reservations before recovery, immutable history, one audit event, no automatic broadcasts and normal pause/deadline gates. Browser tests verify no payment from retry button.

## Related Decisions

- ADR0053 review isolation and payout nonce barrier.
- [Solana confirmation and expiration](https://solana.com/developers/cookbook/transactions/confirmation).
- [Historical signature status](https://solana.com/docs/rpc/http/getsignaturestatuses).
- [Blockhash validity and context](https://solana.com/docs/rpc/http/isblockhashvalid).
