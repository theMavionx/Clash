# Migration: sell confirmed deposits without waiting for payouts

## Scope

Owner explicitly removed the paid-only prerequisite. Eligibility now accepts finalized source deposits in deposited/payout_signed/paid states with persisted confirmation time and transaction hash. Unknown/review/unconfirmed states remain excluded. Price floor$100, normal batch$400, residual$100 after600seconds, gas reserve, shared lease, simulation/slippage checks and exact receipt accounting remain unchanged. No config/schema rewrite.

The sale does not cancel or reduce the Robinhood payout obligation. Custody trade-off documented in ADR0052: tokens may already be sold if EVM payout later needs reconciliation; operator still owes full CLASH amount.

## Verification

-99 focused tests passed, including three new scenarios: sell before delayed payout/restart/exact1:1 and once-only consumption; eligibility state/confirmation-proof matrix; retained residual wait and minimum floor.
-Read-only live checks before release: four confirmed deposits have exact1:1 integer conversion (Solana6decimals -> Robinhood18decimals). No new manual trade initiated. Old seller reports NO_PAID_LOTS while payouts wait.
-Actual Robinhood receipt0x53f16f22e967f4adf4a5bb291719945b4c46b3fd5ac4ff3519877406a0cf882c succeeded: exact token/from/to Transfer sum7383457750202000000000000units, matching7,383,457.750202CLASH deposited1:1. At read time DB payout_signed awaits finalized block. This is mined success, not a claim of finalized settlement.
-Canonical Deploy gate passed, including lint/build (existing warnings remain).84 isolated Linux migration tests passed in release candidate20260921183819-66212b86. Live post-release verification pending.

## Release

Released20260921183819-66212b86; runtime health passed18:41UTC. Existing enabled worker applied eligibility automatically; no separate manual execution or threshold reduction. Canonical deployment includes the normal collectible payment-price sync workflow. Retention removed compiled20260921174301-b0bb9a4f; previous20260921180004-620ae4e2 retained and Git source remains rebuildable.

Live read-only verification at18:42:29UTC:
- Enabled/ready true; ratio1, targetCLASH,21:00Kyivsnapshot, closing deadline1790100250842, batch400/residual100/idle600 unchanged.
- Two new sales completed and independently verified by chain.saleStatus against finalized receipts: c93bdc61-204c-4a86-8400-a1044ceff8b8 (4,081,632.653062CLASH) and5572ca74-c2e4-4515-aed0-df4486f5b30d (4,166,666.666667CLASH). Both50bps, no sale errors; sum8,248,299.319729CLASH.
- Sale lots belong to request665efe81-cf32-4981-ac76-cc0ec505135c, still deposited/payout queued. soldUnits8248299319729 exactly matches finalized sales; payout output amount remains25,284,853.173919CLASH1:1, not reduced by sales.
- All four current requests preserve exact1:1 amounts. One Robinhood receipt is mined success/exact Transfer as above; finalized settlement remains pending, other payouts queued. Do not claim all payouts completed. Stored UPSTREAM_RETRY on mined payout is not proof of transaction failure; existing rebroadcast/finality handling remains unchanged.
- Read-only next-sale preview ready, eligibleUnits24918383536649. No additional signing/broadcast by the diagnostic command. Existing dependency audit warnings remain outside this change.
