# ADR-0047: Bounded wallet assertion compatibility

## Status
Accepted

## Date
2026-09-21

## Context
### Problem statement
Phantom documents adding Lighthouse assertions to app transactions. A production migration returned twelve instructions for a six-instruction quote, unchanged fee payer and blockhash. The logged historical structure does not prove the identities of the additions. Byte-equality rejects all augmentations, including documented read-only wallet assertions.
### Constraints and requirements
Do not permit arbitrary mutations or remove safety checks. Keep owner consent/signature, immutable original transfer instructions and permissions, fee budget, persisted-before-broadcast idempotency and finalized receipt verification. Never discard guard instructions after signing.

## Decision
Keep byte-exact path. Alternative path permits 1–16 additional instructions only from Lighthouse L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95, restricted to one-account pure assertions (Borsh tags 2,3,5,6,7,8,9,10). Targets must already occur in the quoted account set. No new accounts except the read-only non-signer Lighthouse program; all original global signer/writable privileges remain exact. Every original instruction must appear exactly once in original order, with byte-exact data and ordered account metas; no fee/payer/blockhash changes. Reject memory writes/closes, delta/Merkle/CPI variants and unknown tags.

Before co-signing, finalized RPC must prove the program is executable, points at the pinned ProgramData account, is non-upgradeable, and matches SHA-256 a89179ae024ac36aa5fc308251caa84cd0a3390ae66d8523514004a86d5148bb. Cache only successful immutable verification for adapter lifetime. Verify owner signature over actual message, add treasury signature, verify all signatures and simulate the complete guarded transaction. Existing fail-closed simulation handles malformed assertion data.

### Architecture and key interfaces
Quote → wallet signature → exact or bounded assertion policy → immutable code pin → signatures → full simulation → durable accepted raw transaction → broadcast → finalized receipt matched to accepted raw message. Pure policy and injected chain verification remain independently testable. No new public endpoint.

## Alternatives considered
### Ignore arbitrary added instructions
Simple but enables changed transfers/fees/privileges and unsafe co-signing. Rejected.
### Strip guard instructions after wallet signing
Invalidates the signature and removes wallet protection. Rejected.
### Pre-sign the quote with treasury
May stop wallet augmentation but changes the deposit authority and reconciliation model: user could broadcast outside submit handling. Rejected without a separate design.

## Consequences
### Positive
Compatible documented safety assertions without weakening original monetary instructions. Receipt verification uses the exact accepted message, retaining the wallet's protections.
### Negative and risks
A narrowly supported set may still reject some wallets; fail closed with structural diagnostics. Historical extra instruction identities remain unverified, so real Phantom acceptance must still be checked. Pinned deployed executable identity is verified onchain, not a new independent reproducible-build audit. Immutable code cannot later change under this policy. Malicious assertions can cause failure but cannot introduce write/CPI opcodes; simulation and existing sponsored retry bounds remain.

## Performance implications
- CPU: bounded instruction/account comparison and one executable hash.
- Memory: first verification reads ~424KB program data; only boolean cached.
- Load time: no client changes.
- Network: one finalized multiple-account RPC on first augmented acceptance per adapter.

## Migration plan
Deploy additive validation module. Preserve existing rows; receipt checks use depositRaw where present, original quote only as legacy fallback. Never alter/resubmit existing requests. Keep structural diagnostics for unsupported additions.

## Validation criteria
Allow six valid assertions with real generated test signatures; reject changed transfers/fees/payer/blockhash/privileges, unknown programs, memory/CPI variants, missing/reordered base instructions and unknown target accounts. Fail on missing/mutable/replaced deployment. Match finalized accepted message; reject original unaugmented receipt. Run ledger idempotency tests and unsigned paid-RPC simulation; owner performs actual Phantom test separately.

## Related decisions and sources
- ADR-0046: treasury readiness versus finality.
- https://docs.phantom.com/developer-powertools/lighthouse
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/instruction.rs
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/processor/assert_target_account.rs
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/processor/assert_token_account.rs
