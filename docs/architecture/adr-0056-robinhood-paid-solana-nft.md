# ADR-0056: Robinhood-paid Solana NFT delivery

## Status
Accepted — owner-approved implementation, local verification passed; release pending.

## Date
2026-09-22

## Context
### Problem Statement
Move the existing $10 CLASH Dragon payment from Solana to Robinhood without
moving the NFT. Existing bridge code already creates Metaplex Core assets under
the collection authority, but generates a new asset on retries. That retry
behavior must not be reused for purchases.
### Constraints
Reuse existing paid Alchemy RPC, collection, signer and merchant treasury.
Preserve global supply, rarity and player ownership binding. No new contract.
### Requirements
Exactly one asset per verified payment; durable recovery after browser/server
failure; no unpaid mint and no reservation release on an uncertain payment.

## Decision
Persist an order before requesting payment. Bind payer, Solana recipient,
token amount, contract, deadline and supply reservation. Reconcile transfer
logs server-side even if the browser closes. Only release an unpaid reservation
after finalized Robinhood history covers its complete acceptance window.
Use one deterministic asset key per order, derived from the existing authority
key with a domain-separated HMAC. Persist signed Solana bytes before sending.
Retries use the same bytes until expiry, and the same asset thereafter.
Owner explicitly requests not waiting for long finalization. Delivery requires
a successful canonical receipt plus 12 successor blocks; only releasing an
unpaid reservation requires finalized complete history. This accepts residual
deep-reorg risk in exchange for faster NFT delivery.

### Architecture Diagram
Order + supply reservation → Robinhood transfer → confirmed receipt →
durable Solana mint → finalized asset → inventory and rarity bookkeeping.
### Key Interfaces
Authenticated quote/status endpoints and a background reconciler. Public
status contains transaction references, never signing keys or raw transactions.

## Alternatives Considered
### Alternative 1: Change the Candy Machine token address
Simple but impossible across chains; rejected.
### Alternative 2: Reuse bridge retries unchanged
Existing infrastructure, but regenerates asset keys after timeouts; rejected.

## Consequences
### Positive
Reuses funded, verified collection authority; NFT remains on Solana.
### Negative
Adds an asynchronous fulfillment queue and temporary inventory reservations.
### Risks
RPC outages retain reservations and pending payments rather than losing them.
Permanent delivery errors require an operator-visible recovery path.
Wallet approvals submitted after the quote/grace window require operator review;
the direct ERC20 transfer itself cannot enforce an expiry. Never resend payment
to resolve a delayed delivery. Fast Robinhood inclusion accepts residual reorg
risk and does not weaken Solana confirmation or unpaid-expiry proof.

## Performance Implications
- CPU: bounded receipt checks and one mint build per delivery attempt.
- Memory: bounded worker batch; durable orders in SQLite.
- Load Time: no new wallet SDK.
- Network: paid read-only log scans and signed Solana delivery submissions.

## Migration Plan
Implement disabled first, verify receipt/recovery/cap handling, then replace
the old CLASH NFT option. Preserve all other NFT payment methods and receipts.

## Validation Criteria
Wrong payer/amount/token/time rejected; duplicate and uncertain submissions
cannot produce a second asset; expiry releases only proven-unpaid orders;
restart recovers; failed RPC never marks paid or delivered; cap is maintained.

Verification on 2026-09-22: 106 migration/queue tests passed, authenticated HTTP
quote/redeem and recipient-signature tests passed, purchase replay and LeverUp
reward-flow tests passed, production web build passed. Existing production
Solana authority successfully simulated a Core mint (27,577 units), without
broadcast or funds movement. Real funded browser purchase remains owner smoke.

## Related Decisions
- [Custodial marketplace](adr-0009-server-custodial-nft-marketplace.md)
- [Expired deposit recovery](adr-0055-expired-deposit-recovery.md)
