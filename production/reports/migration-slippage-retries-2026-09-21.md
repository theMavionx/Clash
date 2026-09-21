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
