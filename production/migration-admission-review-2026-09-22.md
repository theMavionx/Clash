# Code Review: Migration admission and signing helpers

Scope: migration_gate.js, wallet-signing.js, diagnostics.js, transport.js. Backend/networking and web UI; code-review workflow applied before release.

## Standards Compliance: 5/6 passing

Helpers have scoped APIs, test seams, no mutable global state, bounded operations and narrow dependencies. Admission and timeout thresholds remain documented safety defaults in code rather than user-editable configuration. Transport method length is a minor maintainability concern.

## Architecture: MINOR ISSUES

Process-local admission does not replace the cross-process database lease. Client telemetry is best effort and cannot authorize settlement. Shared tick yields only after persistence. Independent telemetry rate budget avoids consuming deposit write quota.

## SOLID: COMPLIANT

Small queue, transport, telemetry and sign-only modules have separate responsibilities and focused tests.

## Game-Specific Concerns

Not a gameplay change. Async ownership, late wallet responses, network ambiguity and resource cleanup are the relevant hazards. No financial transaction is broadcast by browser tests.

## Positive Observations

Exact signed payload/idempotency key is retained on explicit admission rejection. Unknown write results are never replayed automatically. Signature verification, blockhash expiry, nonce accounting and cross-process fencing remain intact. Diagnostic data uses allowlists and excludes credentials and signed payloads.

## Required Changes

- Completed: make gate release handles idempotent so stale double release cannot unlock a later holder.
- Completed: move request serialization inside timer cleanup scope.
- Completed: distinguish failed wallet verification from an expired authenticated session in UI copy; record challenge existence/expiry, adapter category and signature byte length, not its content.

## Suggestions

Actual Solana Mobile association behavior still requires device evidence after deployment. Admission remains deliberately bounded; sustained overload can still return WORKER_BUSY rather than execute unbounded work. Helpers do not cancel a native wallet prompt: late results are discarded and users are instructed to close the old prompt.

## Verdict: APPROVED WITH SUGGESTIONS

Release requires passing focused regression tests and atomic deployment health checks. No manual adjustment of allocation or financial state is part of this package.
