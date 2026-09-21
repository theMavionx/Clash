# Code Review: migration launch readiness

Read-only recheck on 2026-09-21 after verification-tag replacement deployment. Reviewed migration_core.js, migration_chain.js, migration_routes.js, frontend main.jsx, model.js, transport.js and target-asset.js. No production settings changed, no wallet signing/broadcast, no deployment. This is a focused readiness review, not a full security certification.

## Standards Compliance: 2/6 passing, 2 partial, 1 failed, 1 unmeasured

- Dependency injection and data-backed configuration pass. Public method documentation and explicit interface contracts are partial (CommonJS adapter conventions, not formal interface types). Several methods exceed the skill's 40-line guideline, notably quote/tick/prepareSale and the JSX component. Cyclomatic complexity was not quantitatively measured. Existing project conventions take precedence over game-engine-specific recommendations.

## Architecture: MINOR ISSUES

- Backend owns eligibility, exact amounts, signing restrictions, immutable request asset metadata, leases and nonce reconciliation. Client cannot authorize settlement solely through UI state.
- `migration_core.js:298`: readiness short-circuits chain health while targetToken is blank. TARGET_TOKEN_REQUIRED alone therefore does not prove token supply, inventory, transfer compatibility or gas readiness of the eventual target contract.
- `migration_chain.js:53`: a non-USDG target requires exactly 1,000,000,000 totalSupply, decimals0–18; transfer compatibility must be checked on the actual contract before accepting deposits. Symbol labeling alone is not contract identity verification.
- `migration_core.js:439`: snapshot replacement locks after any request; existing test requests are intentionally retained.
- Current implementation reads request arrays for several operations and serializes financial work. No high-volume/load test performed; do not claim unrestricted throughput.

## SOLID: ISSUES FOUND

- Core and chain modules combine multiple responsibilities and contain long methods. Injected chain/time/database boundaries make focused testing feasible; no refactor made during this inspection.

## Game-Specific Concerns

- Engine frame-time concerns are not applicable. Operational concern is custodial availability, external RPC/DEX failures and treasury inventory. Finality/queues may exceed the intentional 150–420second delay.

## Positive Observations

- Public migration page returned200 with application root. Live authenticated admin: paused, targetToken empty, ratio1, fee$2, batch$400/residual$100 after600s, delay enabled150–420s. Stored Solana/EVM/Jupiter/Robinhood RPC credentials present (values never printed).
- Historical snapshot at2026-09-21T10:43:00Z (13:43 Kyiv), slot449031692; canReplaceSnapshot=false. One hydrated eligibility wallet is a lazy historical cache, not proof that only one wallet is eligible.
- Ledger: one paid and four expired requests; no pending/review obligations. One completed sale. Historical4000CLASH->4USDG remains immutable and consumes4000CLASH of that wallet's allocation.
- Fresh paid-provider read: Robinhood chain4663, ETH0.028235504055928932, latest/pending nonce both81. Solana finalized slot449122067, SOL0.110453086. These exceed current gas readiness thresholds, not a guarantee of indefinite future funding.
- DexScreener prices available; authenticated Jupiter read-only build200 with route at50bps. No signing/sale or subscription mutation.
- Persisted diagnostics contain earlier TRANSACTION_CHANGED errors followed by successful submission; no later worker errors in the returned200-event window. Pause means this is not evidence of ongoing user throughput.
- Reran79 focused core/chain/HTTP/sales/ledger/model/asset-label/transport tests:79 passed, no failures/skips. Actual replacement CLASH token flow cannot be tested until its contract/inventory exists. Wallet UI was source-reviewed and public HTML fetched; no new connected-wallet/browser or funded end-to-end run performed.

## Required Changes / Launch Prerequisites

1. Owner supplies verified Robinhood CLASH contract (chain4663). Inspect code/metadata/supply and transfer behavior without broadcasting.
2. Fund the configured payout wallet with enough of that exact CLASH token for allocations to be served; maintain ETH and SOL reserves. Existing USDG inventory does not provide CLASH payouts.
3. Confirm existing snapshot cutoff and consumed test allocation are intentional. If a new campaign/snapshot is desired, implement an explicit safe campaign transition, not deletion/relabeling of historical financial records.
4. Re-run target-specific readiness and read-only transfer simulation, then explicitly enable migration. An owner-signed small CLASH-to-CLASH test remains necessary before claiming that exact live flow verified.

## Suggestions

- Retain monitoring and independently recoverable DB/encryption-key backups; earlier host/dependency risks are not resolved by this review.
- Consider separating configuration completeness from independently observable provider health, and perform load verification before broad launch.

## Verdict: CHANGES REQUIRED before launch

Existing implementation and prior USDG flow are operationally demonstrated, but inserting a contract alone is insufficient: actual CLASH inventory, target-specific checks, activation and owner test remain. No application changes were requested or made during this review.
