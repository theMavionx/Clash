# Solflare migration compatibility — 2026-09-22

## Incident
Wallet 2NxurAq8xcQ9KT7kZpDohkYFMCvWFqSB3cc5xaAFXL8f successfully verified and signed via Solflare. Request 5936f973-5a7d-40b6-9b25-2e88e9a90ab0 was rejected by POST /submit with TRANSACTION_CHANGED: six original instructions, eight received, two Lighthouse instructions. No accepted deposit hash. Rejected signed messages were deliberately not persisted, so the exact failing policy predicate is unknown.

## Local implementation
ADR-0058 extends existing pure-assertion support to bounded additional read-only/non-signer targets. All original instructions, global permissions, payer, blockhash, amount and recipient remain exact. Immutable executable pin, owner signature, treasury signature and full simulation remain mandatory. Memory/delta/CPI/unknown instructions remain blocked. Diagnostics now include a fixed policy reason, opcode list and account counts, never signed transaction bytes.

## Verification
- `node --test server/test-migration.js server/test-migration-chain.js server/test-migration-solflare.js server/test-migration-http.js server/test-migration-gate.js server/test-migration-ledger.js`: 109 passed, zero failed.
- Generated local keys test real user/treasury signatures, accepted extra read-only targets, changed recipient/amount, writable/signer escalation, extra payments and simulation failure.
- HTTP test verifies diagnostic persistence and secret redaction.
- Paid Alchemy simulation: reconstructed stored quote with fresh blockhash, two Executable=false Lighthouse assertions (user and additional Rent sysvar), unsigned `sigVerify:false`, no broadcast. Immutable deployment pin true, policy accepted, simulation err=null, 31,763 compute units. Does not prove the user's original signed packet is accepted.
- `git diff --check` passes. Existing native bigint fallback/deprecation warnings remain.

## Status
Local changes only; no commit, production deployment, user-wallet signature or funded operation performed. This fixes a reproduced compatibility restriction; the reported user's exact unsupported augmentation still requires new diagnostics or their message-level fixture. Do not claim the live incident resolved.

## Sources
- https://docs.solflare.com/solflare/technical/deeplinks/provider-methods/signtransaction
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/instruction.rs
- https://github.com/Jac0xb/lighthouse/blob/main/programs/lighthouse/src/processor/assert_target_account.rs
