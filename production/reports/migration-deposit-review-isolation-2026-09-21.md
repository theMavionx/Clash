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
