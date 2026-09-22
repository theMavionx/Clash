# ADR-0058: Read-only wallet assertion targets

## Status
Accepted locally; production incident replay remains unverified.

## Date
2026-09-22

## Context
### Problem Statement
Solflare submitted eight instructions for a six-instruction quote; two were Lighthouse. Existing diagnostics do not retain rejected transaction bytes or opcode details, so this exact rejection cannot be reconstructed. Independently, ADR-0047 unnecessarily rejects pure guards reading accounts outside the original quote.
### Constraints
Preserve all original monetary instructions, permissions, signatures and full simulation. Do not bypass validation or send funds during testing.
### Requirements
Allow bounded read-only targets for already supported pure one-account guards; identify remaining rejections without storing signature bytes.

## Decision
Extend ADR-0047 only for additional non-signer, non-writable accounts referenced by its existing allowed guard variants. Up to sixteen added targets plus the immutable pinned Lighthouse program. All original global privileges and ordered original instructions remain exact. New targets must actually be used by a guard. Memory, delta, CPI and unknown opcodes remain rejected. Log an enumerated policy reason and bounded opcode/account-count arrays; never transaction bytes, signatures or arbitrary errors.
### Architecture Diagram
Quote → wallet-signed message → exact/guard policy → immutable program pin → signatures → full simulation → existing durable submission flow.
### Key Interfaces
`lighthouseRejection(actual, expected)` returns a fixed reason or null. Existing boolean wrapper remains compatible.

## Alternatives Considered
### Blanket program allowlist
Rejected: memory/CPI operations must not gain treasury co-signing authority.
### Strip added instructions
Rejected: invalidates the user's signature and removes wallet protection.
### Keep only original targets
Safe but rejects documented pure account inspection without financial benefit.

## Consequences
### Positive
Pure guards can inspect additional read-only state. Safer diagnosis of future unsupported mutations.
### Negative
The exact user's Solflare augmentation is still unknown; this is a tested compatibility fix, not proof that their next submission succeeds.
### Risks
Guard failures can still reject transactions. The immutable deployment pin, bounded inputs and full simulation remain mandatory. No retry/broadcast behavior changes.

## Performance Implications
- CPU: bounded account-set walk.
- Memory: at most sixteen extra targets.
- Load Time: unchanged.
- Network: existing program verification and simulation only.

## Migration Plan
Additive code update, no database rewrite or recovery resend. Unrelated QFEX changes are excluded from this work.

## Validation Criteria
Round-trip serialization with valid local signatures; accept external read-only guards; reject privilege escalation, changed recipient/amount, memory/CPI/unknown variants and simulation failures; run migration regressions and unsigned paid-RPC simulation. User-signed production test is still required.

## Related Decisions
- ADR-0047.
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/instruction.rs
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/processor/assert_target_account.rs
- https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/signtransaction
