# Migration: sell confirmed deposits without waiting for payouts

## Scope

Owner explicitly removed the paid-only prerequisite. Eligibility now accepts finalized source deposits in deposited/payout_signed/paid states with persisted confirmation time and transaction hash. Unknown/review/unconfirmed states remain excluded. Price floor$100, normal batch$400, residual$100 after600seconds, gas reserve, shared lease, simulation/slippage checks and exact receipt accounting remain unchanged. No config/schema rewrite.

The sale does not cancel or reduce the Robinhood payout obligation. Custody trade-off documented in ADR0052: tokens may already be sold if EVM payout later needs reconciliation; operator still owes full CLASH amount.

## Verification

-99 focused tests passed, including three new scenarios: sell before delayed payout/restart/exact1:1 and once-only consumption; eligibility state/confirmation-proof matrix; retained residual wait and minimum floor.
-Read-only live checks before release: four confirmed deposits have exact1:1 integer conversion (Solana6decimals -> Robinhood18decimals). No new manual trade initiated. Old seller reports NO_PAID_LOTS while payouts wait.
-Actual Robinhood receipt0x53f16f22e967f4adf4a5bb291719945b4c46b3fd5ac4ff3519877406a0cf882c succeeded: exact token/from/to Transfer sum7383457750202000000000000units, matching7,383,457.750202CLASH deposited1:1. At read time DB payout_signed awaits finalized block. This is mined success, not a claim of finalized settlement.
-Canonical Deploy gate and live post-release verification pending.

## Release

Pending. Existing enabled worker will apply new eligibility to existing confirmed unsold deposits after canonical deployment. No separate manual execution or threshold reduction.
