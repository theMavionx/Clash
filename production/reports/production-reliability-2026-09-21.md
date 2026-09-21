# Production readiness, durable diagnostics and migration ledger

Date: 2026-09-21. Owner authorized deployment after verification and asked to preserve per-user migration records. This report supplements the earlier security review; it does not certify the entire service as bug-free or immune to DDoS.

## Changes and scope

- Migration fetches have a 25-second deadline, reject malformed/scalar JSON and never automatically retry writes. Signed submissions remain locked for same-request reconciliation after ambiguous failures.
- Read polling runs without a connected wallet and schedules the next poll only after completion. Request sequence and wallet generation prevent stale refreshes from overwriting newer state. Account history is read independently of treasury status; failed readiness fails closed for new deposits.
- Main API assigns a server-generated X-Request-Id and persists safe failure metadata into existing `client_logs` (`source=server.http`), visible in the protected admin Client Logs view. Stored data: request ID, registered route template, status, method, duration and exception fingerprint. No exception body/message/stack, request headers, query values or signed payloads are stored by this logger. Maximum 120 persisted runtime errors/minute/process; excess events are deliberately not written. Existing seven-day log retention applies. Storage failure cannot change the business response.
- Public client-log admission is bounded before parsing (100 KiB, no compression, 60 requests/client/minute and 600 global/minute), with bounded event buckets, trusted client identity, strict event containers and known levels. Public uploads cannot label themselves `server.*`. Retention cleanup is no longer executed on every public POST.
- Browser error objects and explicit stacks now pass credential redaction. URL metadata excludes query/fragment. Mnemonic/seed object fields and common credential query parameters are redacted. This is not a guarantee that arbitrary free-form user text can never contain sensitive information.
- Protected `/api/migration/admin/ledger` reads all persisted migration requests with pagination (50/page) and exact wallet filter. UI displays verified source wallet, destination, CLASH amount, payout token/amount, SOL fee, request/status/timestamps, deposit/payout hashes and error code. Totals use integer arithmetic and confirmed timestamps; quotes and pending submissions do not inflate received/paid totals. Assets are totaled separately. No financial transaction or authorization fields are exposed.
- Ledger retains historical requests beyond the previous latest-200 admin list. This records migration requests through the application, not unsolicited transfers to the treasury or inferred game username ownership. Existing custody ledger persistence is reused; no settlement state is rewritten by reporting.
- Prior security fixes and sales runner/$100 hard minimum remain part of the owner-approved release candidate. Admin guidance now describes the bounded lower-slippage simulation ladder.

## Bug Report: BUG-0901

**Title:** Migration readiness never recovers for disconnected users after initial failure.
**Severity:** S2-Major. **Priority:** P1-Immediate. **Status:** Fixed locally, browser verified. **Reporter:** owner/agent. **Reported:** 2026-09-21.
**Classification:** Network/UI, public migration; always under trigger; regression unknown.
**Environment:** candidate based on 9ceebc00, Windows/Edge, disconnected public migration page.
**Preconditions:** first status request fails or stalls.
**Reproduction:** open migration without connecting a wallet; return 503 for initial status; restore upstream availability; wait.
**Expected:** availability recovers and controls do not remain indefinitely busy.
**Actual before fix:** initial request had no deadline, and polling only existed for verified sessions.
**Root cause/files:** `web/src/migration/main.jsx`; raw fetch and session-only interval.
**Evidence:** browser test fails once and verifies automatic recovery on the second read without wallet connection; transport tests cover one-request timed-out writes and serial polling.
**Related issues:** earlier Phantom submission/reconciliation fixes. No automatic payment retry introduced.

## Bug Report: BUG-0902

**Title:** Public client-log malformed events throw and untrusted levels/proxy headers poison telemetry.
**Severity:** S2-Major. **Priority:** P1-Immediate. **Status:** Fixed locally, actual route HTTP tests passed. **Reporter:** agent. **Reported:** 2026-09-21.
**Classification:** Network/diagnostics; always for malformed-event trigger; regression unknown.
**Environment:** Node API `server/routes.js` client-log ingress.
**Reproduction:** POST an events array containing null; submit an arbitrary SQL-like level or forged x-real-ip; observe persisted metadata/error behavior.
**Expected:** malformed input rejected without exception; known levels and trusted proxy identity; bounded ingestion.
**Actual before fix:** null property access threw; arbitrary sanitized levels and unvalidated x-real-ip were accepted; every POST triggered retention deletion.
**Evidence:** read-only production aggregation found scanner-like level strings, including SQL/XSS/command probes. This is evidence of scanning, not successful injection or compromise. Isolated HTTP tests prove 400/413, trusted IP and reserved server provenance handling.
**Related issues:** [security review](security-hardening-2026-09-21.md). No production attack traffic generated.

## Bug Report: BUG-0903

**Title:** Parser errors misclassified as 500 and browser Error objects bypass credential redaction.
**Severity:** S2-Major. **Priority:** P1-Immediate. **Status:** Fixed locally, regressions passed. **Reporter:** agent. **Reported:** 2026-09-21.
**Classification:** Network/security/diagnostics; always for tested triggers; regression unknown.
**Environment:** global Express error handler and browser clientLogger.
**Reproduction:** send invalid/oversized JSON; log an Error whose message/stack contains token/API-key URL parameters.
**Expected:** 400/413 respectively, safe diagnostic reference, redacted log message/stack/payload.
**Actual before fix:** generic error handler always returned 500; special Error serialization and explicit stack bypassed string redaction.
**Files:** `server/runtime_diagnostics.js`, `server/index.js`, `web/src/lib/clientLogger.js`.
**Evidence:** real HTTP tests confirm status and persisted reference; tests using actual logger functions assert synthetic credentials absent. Storage failure remains nonfatal.
**Related issues:** owner-requested persistent errors and earlier safe logging controls.

## Verification

- Canonical `tools/codex/check-repo.ps1 -Mode Deploy` passed: trading/vault/gameplay/schema regressions, Godot probes, lint and web build. Windows-only vault skips remain as documented in the security report.
- Latest focused suite: **84 passed, zero failed/skipped** (security, migration core/chain/HTTP/sales/ledger, runtime diagnostics, admin storage, redaction and transport).
- Latest lint: zero errors, 138 warnings; existing large frontend bundle warning remains.
- Real mocked Edge browser: desktop 1440 and mobile 390/320, wallet connect/verify/change, MAX, review, rejection/cancel, same-submission recovery, expired/401 recovery, initial status failure recovery, admin key/snapshot flow and ledger desktop/mobile layout. No funded transaction or external wallet seed used.
- Screenshots under `web/artifacts/migration/` are local evidence, not part of source/deployment.
- Deployment script shell syntax and isolated changed nginx configuration already validated in prior security review. Full generated nginx and live health must be verified during deployment.

## Code Review: reliability and admin ledger

### Standards Compliance: 4/6 passing for new focused modules

Public contracts documented; function interfaces and injected DB/network/clock dependencies used; new helpers are short except the ledger aggregation. Complexity/40-line enforcement needs lint tooling; fixed security limits are code constants rather than external data configuration.

### Architecture: MINOR ISSUES

Durable records reuse existing tables and admin authentication. Read-only ledger projection never invokes settlement. Summary scans all matching ledger rows; suitable for current volume, but indexed/materialized summaries should precede large-scale growth. Counters are per process, not shared across replicas.

### SOLID: ISSUES FOUND

Transport, diagnostic persistence and ledger projections are separated. Legacy large main/route files remain integration points. Ledger projection/aggregation share a module; separate them if reporting expands.

### Game-Specific Concerns

No balance changes. No new funded flow; signed-byte and receipt gates retained. Tests validate existing game/trading functionality; no claim of all venues' funded end-to-end validation.

### Positive Observations

Actual HTTP/browser regressions; no automatic payment replay; exact financial arithmetic; all-page history with explicit confirmed-state accounting; bounded diagnostic write amplification.

### Required Changes

Complete authorized release and live smoke, then record release ID/results. Port8080/origin firewall, remaining dependency advisories, key-backup/service privilege review and exhaustive external tests from the security report remain independent open items. Owner declined Tatum rotation in this task; do not repeat its value or silently remove its diagnostic record.

### Suggestions

Add infrastructure-level origin protection and alerting; refine per-route budgets using observed traffic; migrate admin authentication to short-lived HttpOnly sessions/MFA in a separately tested change.

### Verdict: APPROVED WITH SUGGESTIONS

Focused release candidate passed; no unconditional production-security or zero-downtime sign-off. Deployment result follows below.

## Deployment

Pending. Owner approval received in this conversation. `deploy-clash` skill is not available in the loaded catalog or checked skill directories; use the canonical repository deployment script with existing credentials, health gates and rollback instead. No new firewall restrictions or Tatum rotation in this release.
