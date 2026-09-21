# Migration sales runner — local verification

## Follow-up: minimum $100 sale rule (local only)

Owner subsequently required that no new sale be below $100. Added a hard estimated input-value floor in batch selection and again on the fresh price before simulation/signing. Normal/residual configuration below $100 is rejected. Idle time no longer permits a smaller remainder. Target token quantities round upward by at most one source base unit, so a $100 residual target cannot round down to $99.999999. Existing signed transactions still reconcile rather than being silently discarded/replaced.

All 60 focused tests pass, including a seven-day wait at $99.999999, accumulation to exactly $100 across two lots, a $50 remainder after a completed $100 batch, non-divisible token-price rounding, unchanged $400 normal batching, configuration-floor enforcement and a fresh price drop before signing. The minimum concerns estimated CLASH/USD input value, not guaranteed after-fee SOL proceeds. No deployment, production threshold mutation or real transaction occurred.

## Subsequent read-only production check (13:05 UTC)

Owner asked to lower the minimum and try a sale. Read-only DB/Alchemy checks instead found the existing embedded production worker had already sold the owner's test lot at 12:52:07 UTC. No threshold change or execution was performed by this agent, and no new low-threshold local fixture was needed to trigger that completed sale.

- Request `31983103-c05c-42b9-8cdd-35378390be0c`: `paid`, input/sold units both `4000000000`.
- Sale `41d69d29-8a8b-41df-8dcb-068500688383`: `completed`.
- Transaction `5sRe9dKBSCaF1EiJ7th876g7Zv56HjESNa8ZpHoHpdYw88TYqCA8oUcBb2k6xJU6J2koYZuSQFaTefK26sqhvciA`: finalized successful receipt, slot 449060768. Exact treasury-owned CLASH decrease: 4000 tokens. Native SOL balance delta: +8281313 lamports; network fee: 19000 lamports. This is the native balance change, not an independently decoded gross DEX swap amount.
- Current finalized treasury balance: 134941.657583 CLASH, 0.110558086 SOL. Unsold paid migration allocation: zero; remaining treasury CLASH is not eligible for this seller.
- Existing config remains enabled, batch $400, residual ceiling $100, idle 600 seconds, slippage 500/max 1000 bps. The smaller final remainder is already supported. The new local runner/lower-slippage changes remain undeployed; this receipt verifies the old embedded worker, not the new CLI.

Owner requested an automatic balance-waiting seller. Implemented locally on `codex/leverup-order-precision`; no production file/config/DB changes, activation, commit, push or funded trade.

## Changed

- Owner-operated `server/migration_sales_worker.js`, read-only by default, continuous or one-shot, explicit execution flag, existing absolute DB path required.
- Existing ledger exposes read-only batch preview and sales-only tick using its shared durable lease. No separate seller, queue, API auth or key store.
- Finalized Token-2022 ATA/SOL checks; only unsold paid migration lots, preserving $400/$100/600-second admin settings and ignoring unrelated treasury holdings.
- Start at at most 0.5% slippage; bounded fresh-quote simulation ladder up to admin cap. Only structured Jupiter slippage simulation failure permits escalation. Unknown sends are not replaced.
- Deduplicated/redacted waiting and simulation audit events; CLI provider backoff, no raw transaction/private-key/provider URL logs. Pause rechecked after async preparation and before persistence.
- Architecture decision ADR-0048 and operator guide `docs/migration-sales-worker.md`.

## Verification

55 focused tests passed across migration core, chain, HTTP and sales runner. Covers original deposit/payout/signature/finality regressions plus finalized balance/gas waits, untracked balance isolation, paid-only processing, read-only DB byte stability, shared worker lease, restart with identical bytes, expired sale review, late confirmation exactly once, emergency pause race, safe log redaction, typed simulation errors, exact low-to-high slippage/caps, no escalation on network/other errors, backoff, shutdown and log-sink failure.

An actual child CLI process ran against a local isolated paused SQLite database: emitted `check` / `MIGRATION_PAUSED`, exited successfully and left database bytes unchanged. Missing DB path failed without creating a file. All RPC/quote/simulation responses in execution tests are mocked; keys are generated test keys. No real treasury key was loaded by this task. Syntax checks and `git diff --check` passed.

Existing optional native bigint-binding and deprecated extra-signature warnings in baseline tests remain; tests pass using the existing JS fallback. A funded sale, live Jupiter route acceptance and full deploy gate were not run. Simulated success does not guarantee future transaction inclusion or price.

## Code Review: Migration sales CLI

### Standards Compliance: 4/6 passing

Public exports are documented, service/wait/logger dependencies are injectable, operational config remains external, and the runner consumes a service interface. Argument dispatch and the loop/bootstrap exceed the skill's strict complexity/40-line targets (`parseArgs`, `runWorker`, `main`); these are readability follow-ups rather than monetary-path changes. The pre-existing core state machine is longer and is deliberately reused rather than replaced.

### Architecture: CLEAN

CLI imports core/chain; core does not import CLI. No second database or treasury authority. Read-only preview cannot write through SQLite. Default invocation has no signing path. The shared lease prevents overlap with embedded processing.

### SOLID: COMPLIANT

CLI owns argument handling, polling and safe output, not monetary settlement. Core retains transaction/lot ownership; chain retains validation and simulation. Dependencies permit offline verification.

### Game-Specific Concerns

No game frame/UI changes. Sequential awaits avoid overlapping polling; database and signal handlers close in finally blocks. Stop does not imply cancellation of a persisted or already-broadcast trade.

### Positive Observations

Explicit execution mode, missing-DB protection, default read-only connection, unchanged receipt finality, typed slippage checks, exact integer amounts, no secret command-line arguments and real child-process smoke verification.

### Required Changes

None outstanding for the local deliverable. Production execution remains an owner action after deployment/review; do not activate via an automated development check.

### Suggestions

Split argument parsing and safe-record formatting if CLI options grow. At higher migration volume, replace full-history row reads inherited from the existing core with indexed pending-lot queries. Review states require operational chain reconciliation, not a force-retry button.

### Verdict: APPROVED WITH SUGGESTIONS

## Rollout checkpoint — 2026-09-21

Included in owner-approved release `20260921141323-563e93cf`; canonical Deploy gate and live health passed. Hard $100 floor verified in deployed module; financial config remains batch $400/residual $100/idle 600 seconds. No CLI execution or funded sale was initiated for verification. Existing embedded worker remains active and one earlier completed sale remains recorded. See the production reliability report for the distinct collectible payment-price sync performed by the canonical deployment script.
