# ADR-0040: CLASH custodial migration with immutable eligibility and settlement

## Status
Accepted — owner approved implementation and production deployment. Activation requires configured paid RPC, token, treasuries, inventory and snapshot.

## Date
2026-09-21

## Context
Owner requests wallet-to-wallet Solana CLASH migration to an existing Robinhood mainnet ERC-20, without deploying contracts. Default ratio 1:1, $2 SOL service fee inclusive of sponsored transaction costs, automatic inventory payouts and liquidation of deposited Solana tokens. Custody and off-chain accounting create material replay, crash recovery, eligibility and inventory risks.

### Constraints and requirements
- Source mint from existing application: `9mM1Mc4Ta9UJJ32v5qsHef91PiXi7EWyiSsqF5WXpump`; verify owner program, decimals and supply before activation.
- Destination chain 4663; ETH gas. Destination token configurable by admin and validated by eth_chainId, bytecode, decimals, totalSupply and inventory checks. Existing supply must be 1 billion; this application cannot create or enforce token supply without a contract.
- Only paid Alchemy RPC; never silently fall back to public nodes or proxies.
- Same admin authentication, but secrets are write-only encrypted records, not generic configuration values. Encryption key lives outside the database; no secrets in logs, browser storage, response payloads or audit events. A dedicated migration treasury is required.
- Disabled by missing prerequisites, not by an artificial one-user test requirement. Owner may enable automation after all readiness gates pass.

## Decision
Separate public presentation, administrator configuration, transactional ledger and settlement worker. Monetary values use integer base units/BigInt and exact rational conversion, never floating-point token balances.

### Flow
Signed wallet authentication -> eligibility -> expiring immutable quote/reservation -> exact sponsored Solana transaction -> finalized receipt -> inventory-backed EVM payout -> receipt reconciliation.

Liquidation is an independent queue over confirmed deposited lots; payout does not wait for liquidation. Each lot can be sold at most once. Never infer unsold deposits from a treasury's entire token balance.

### Eligibility
Capture an actual finalized Solana token-account enumeration and its returned context slot, aggregate by owner, checksum, record mint/supply and make the activated snapshot immutable. `minContextSlot` is not historical state. Arbitrary historical dates require a separately verified historical dataset; never pretend current balances are historical. Only a connected owner that verifies a nonce-bound, domain-bound, expiring signature can claim. Pool/off-curve addresses cannot pass ordinary wallet ownership verification. Later purchases do not increase entitlement. Snapshot changes must not reset consumed/reserved allowances.

### Deposit and payout safety
Reserve eligibility and destination inventory atomically before offering payment. Bind source wallet, target recipient/chain/token, ratio, integer input/output, fee, expiry and snapshot to the quote. Token-address or ratio edits only affect new quotes. Never retarget in-flight or accepted deposits.

Server sponsors an allowlisted exact deposit transaction (CLASH transfer and fee payment) instead of accepting arbitrary client instructions. User signs token/fee spend; server verifies identical message before adding fee-payer signature. Persist signed bytes, expected transaction hash and validity bounds before broadcast. Validate finalized success, exact mint/owner/amount, fee transfer and unique signature; no credit for merely submitted signatures.

EVM payout similarly persists nonce, raw transaction and expected hash before any broadcast. Retry identical bytes; reconcile receipt, canonical block and exact token Transfer log. A timeout/unknown broadcast is not permission to create a fresh payment. On nonce conflict or ambiguous settlement, pause and require reconciliation. Shared SQLite transactions plus a durable worker lease prevent competing allocation; unique constraints cover deposit signatures and settlement identity.

### Liquidation
Configurable $400 normal batch, ten-minute oldest-unsold-lot timer, residual batches up to $100 including a smaller final remainder. Quote output is SOL; bound slippage, price impact, transaction fees and retries. Escalate only after a confirmed slippage failure, never after an unknown transaction outcome. Use fresh, mint-validated price data for threshold valuation; refuse stale/manipulable outliers or missing liquid routes. Persist sale transaction before broadcast and reconcile exact inputs/outputs before consuming lots. Protect gas reserve and do not sell untracked treasury tokens.

### Fees
$2 SOL quote expires; sponsor cost must fit a configured gas budget. Destination treasury separately needs ETH. SOL fees cannot directly pay Robinhood ETH gas. Do not silently add fees or submit when cost/liquidity checks fail.

### Interfaces
Public: status/config without secrets; authentication challenge/verify; wallet eligibility; quote; exact deposit signing/submission; authenticated own-request status.
Admin: readiness, versioned configuration, write-only key rotation, snapshot preview/activation, inventory/ETH/SOL balances, queues/audit and pause controls. No generic signing or arbitrary treasury withdrawal endpoint.

## Alternatives Considered
1. Smart-contract bridge: stronger on-chain enforcement, explicitly excluded by owner.
2. Balance-only polling and direct send: simple but double-pays on crashes and allows replay; rejected.
3. Unbounded slippage/retry: risks near-total loss and duplicate trades; rejected in favor of explicit configurable caps.

## Consequences
Positive: auditable claims, exact math, crash-safe delivery and isolation from trading/game state.
Negative: trusted operator custody, pre-funded token inventory and ETH, operational key management, snapshot data limits.
Risks: key compromise, chain reorg, provider outage, price manipulation, inventory exhaustion and configuration races. Mitigations above are mandatory activation criteria, not guarantees of zero risk.

## Performance Implications
Snapshot scans are bounded background jobs; no full scan per user request. Worker uses small batches, bounded RPC concurrency/timeouts/backoff and a paid-provider allowlist. No secret-bearing response caching.

## Migration Plan
Add isolated additive ledger tables and paused-by-readiness routes; implement/tests before production activation. Reuse admin auth/dashboard styling, not generic admin settings for secret plaintext. Deploy only verified components with health checks and preserved rollback; stopping the worker must preserve all pending settlement records.

## Validation Criteria
Replay/wallet-spoofing, duplicate submit, two workers, process crash before/after broadcast, finalized failure, expiry/reorg, nonce conflicts, snapshot changes, ratio/address edits, decimals/rounding, inventory exhaustion, malicious transactions, fee bounds, stale prices, key redaction, RPC allowlist, pause/resume and responsive UI must be tested without funded agent trades.

## References
- https://docs.robinhood.com/chain/connecting/
- https://www.alchemy.com/docs/reference/node-supported-chains
- Existing `server/solana_rpc.js`, `server/routes.js` admin auth, `web/src/admin/api.js`, dashboard web entry.

## Implemented operational limits
- Current finalized snapshot only; no arbitrary historical-date reconstruction. Snapshot is replaceable only before the first request exists.
- Slippage escalation is performed during transaction simulation (5%, 7.5%, maximum 10%). A failed or ambiguous broadcast is held for reconciliation, not replaced automatically.
- RPC errors preserve liabilities. Manual review states have no generic force-pay or release button; reconcile chain evidence before any operational recovery.
- Price checks validate mint, active trading and minimum liquidity, but DexScreener is not a manipulation-proof oracle.
- Secrets use private keys, not seed phrases. Back up both the database and the separate shared `server/migration-master.key` securely; losing the latter makes saved keys unreadable. Never commit or place that file in a public backup.
- Read-only source verification found 798,350,493.182067 CLASH circulating in the source mint supply; destination validation still requires exactly 1 billion. The service does not mint tokens.
- Existing Alchemy credentials returned Robinhood HTTP 403. Configure a paid Robinhood-enabled key in the write-only admin RPC field before activation.
- No funded production deposit, sale or payout has been tested by the agent.
