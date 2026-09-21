# Safe Jupiter sale retry release

## Evidence and scope

Owner approved safe retries of finalized Jupiter slippage failures. Live sale 89573677-6d68-475e-9e09-661df5f51bca failed at slot449139557 with Jupiter6001 and unchanged CLASH source balance. Four prior sales totaling17,193,826.556112 CLASH completed. No threshold reduction, manual reset or ambiguous resend.

## Implementation

ADR0054: adapter proves finalized exact signed transaction failure and zero source/aggregate CLASH debit. Core persists failed parent, 30-second cooldown, fresh simulated replacement, atomic lineage and max4 retries within current cap/10%. Successful finalized child alone increments soldUnits. Admin projection includes retry metadata; existing failures remain visible. Shared config/worker lease and emergency pause retained.

## Local verification

-98 focused core/adapter/sales tests passed (68 core,16 sales,14 chain), including positive proof plus23 rejection mutations, restart/cooldown, bounded ladder, ambiguous/RPC failures, accounting idempotency, lowered cap and atomic rollback.
-Independent agent review found no blocker. Replacements deliberately rebuild current eligible batch/lots; lineage does not imply identical amount.
-105 full migration tests passed. Canonical Deploy gate completed successfully, including lint/build (pre-existing warnings). Production outcome will be appended after rollout.

## Residual risk

Failed attempts consume network fees. Execution can still fail at the maximum or when RPC evidence is incomplete; review remains intentional. Tests cannot prove all live provider/reorg behavior. Existing dependency audit warnings are not addressed by this focused change.

## Production checkpoint

Release 20260921190236-1f4f53bd completed at19:05:32 UTC, runtime health passed. All105 migration tests also passed against Linux release dependencies. Before activation, new adapter independently verified the actual prior failure at slot449139557. Worker archived that parent and automatically created child95a66d37-016c-47e3-b03c-92be23560793 with fresh7,272,727.272728 CLASH batch, successful1% simulation and persistent lineage. Receipt confirmation pending at this checkpoint. Config remains enabled/ready, ratio1, batch400, minimum/residual100, max1000bps; no manual DB update or direct manual trade.

Public migration page checked at1440/390px: HTTP200, no page errors or horizontal overflow. Canonical deploy retains prior release41f8ca68 for rollback; old compiled66212b86 cleaned by normal two-release retention (source remains in Git).

At19:06:36 UTC adapter independently verified finalized successful sale95a66d37, hash5jEq1YAQyewgg1Rn1ptVrMKDzRXFfLJSkSwERfGtfaWEwN37F892CueJnCrZAZo35CNLVmvrhF16zp8kqA3v9JjM: exact7,272,727.272728 CLASH debit and required SOL receipt. Slippage100bps. DB reconciliation/next batch checked separately below.

At19:08:02 UTC both95a66d37 and subsequent normal saleeed0f5db-5922-4451-b988-e1f1ea35c841 were completed in DB and independently confirmed from finalized receipts: total14,545,454.545456 CLASH since rollout. Second hash2r7HTYeJyLDsQVjgbqLAMGr3EJgi5XyWUnpYLoCBAvWrDj7sCXAKZnh1w4b8QbeQtaAAqiQHqncHJjkqAXggje7L used50bps. Original request665efe81 soldUnits equals its exact25,284,853.173919 input; failed parent was not counted. Next normal batchb485ea1a was signed/pending for10,526,315.789474 CLASH.

A single SALE_PRICE_IMPACT_EXCEEDED deferral occurred after the first recovered sale. A read-only Jupiter quote against fresh DexScreener prices subsequently passed the unchanged10% guard; normal worker resumed automatically. No guard relaxation. Batch400 is reference USD not guaranteed exact SOL execution proceeds, which vary with price/impact/fees. Read-only quote access decrypted only the Jupiter API credential inside the server, never printed credentials and did not sign/broadcast.
