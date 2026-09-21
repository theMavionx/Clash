# Deposit review isolation

## Scope

Owner requests that disputed deposits do not block other users and asks a second agent to investigate the AW4q wallet request independently. No manual deposit release, broadcast or target payout for that review is authorized by this change.

## Implementation

ADR0053 amendment: bypass global payout barrier only for identified deposit-only review with a stored source signature and no EVM hash/raw/nonce. Preserve all allocation/liability reservations, automatic reconciliation and sale exclusion. Unknown/outgoing reviews still block shared nonce progression. Preserve review reason through RPC errors, store transient diagnostic separately.

## Verification

112 migration tests passed, including second wallet paid during first wallet review/RPC failure after restart, late confirmation paying the first wallet exactly once, reservation retention, cancellation rejection, and five conservative unknown/outgoing-marker variants. First test exposed transient error overwrite; corrected and full suite rerun green. Canonical Deploy gate passed, with pre-existing lint/build/asset warnings. Production verification pending.

## Request evidence

e9e4ce97 expired after two simulation failures with no stored signature. Later81f01d62 has expired signed hash absent from finalized RPC history; source wallet retains3m CLASH. Fresh-blockhash read-only simulation succeeds but does not prove historical delivery or authorize new signature. Current review must remain unresolved.

Second agent prescribed additional read-only diagnostics, executed via root's existing secure connection: original blockhash invalid, finalized height427186597 versus last valid427185192, signature/receipt absent. Agent independently reviewed evidence and code and found no blocker in queue isolation, including canonical reason preservation. Exact historical failure remains unknown because simulation detail/per-broadcast timing were not stored. No credentials transferred to agent, no funds or statuses modified during diagnosis.

## Production verification

Release20260921191517-eb2296a6 completed19:18:02UTC; health passed,112 migration tests also passed on Linux. At19:18:29 both previously blocked payouts had exact canonical1:1 inclusion while incoming reviews stayed unchanged:

- ff1825ce:866,894.740711CLASH, nonce97, hash0xf5b99173a324e545cd30b875864070a354c48af8b10cfab4fd4dc7fdc9edec3e.
- 262ed666:577,628.172995CLASH, nonce98, hash0xfb1c94629bb45f45edd017253cdc85214a6582e970d5da627b4f11697faf6bdc.

Prior1f4f53bd release retained; compiled41f8ca68 removed by normal retention, source remains in Git. Owner next asks to resolve the reviewed user's dead-end UI; strict expired/unlanded recovery is separate pending work.
