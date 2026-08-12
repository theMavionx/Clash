## Hotfix: Nado One-Tap Status Mismatch
Date: 2026-08-12
Severity: S2
Reporter: Owner
Status: APPROVED FOR RELEASE

### Problem
The Nado trading panel can report that one-tap trading is configured while the
actual control remains OFF and orders cannot use one-tap signing. The issue is
currently reproduced for wallet `0x39b36f1edf2ef5a6f2e02991b3a85fb356eb5005`
and blocks normal Nado trading.

### Root Cause
Two client-side state machines had diverged:

1. The Nado OFF button routed through `linkOurReferrer()`. A successful referral
   check displayed “One tap trading enabled” without ever invoking Nado's linked
   signer setup.
2. Clash generated a random linked-signer key. Nado permits one signer per
   subaccount, so enabling one-tap in another client replaced Clash's signer.
   A locally cached signer could also be selected for orders before its remote
   approval check completed.

The affected wallet's live Nado archive response confirmed an active remote
signer (`0x627c2066ce1e8c9b03f5a325ab2c06cae9f319eb`) with 49/50 weekly link
operations remaining. Clash does not possess that other client's random key,
so it cannot use it for one-tap orders.

### Fix
- Route Nado OFF/ENABLE directly to `setOneTapTradingEnabled(true)`.
- Treat one-tap as enabled only after the locally held signer matches Nado's
  remote signer.
- Never use a cached signer for orders while remote approval is unknown/false.
- Recover missing or externally replaced keys through Nado SDK's official
  `createStandardLinkedSigner('default')`, then link and verify that signer.
- Apply the same deterministic recovery to the MM-bot setup helper.
- Fix the shared bot helper's RPC selection: `INK_RPC_URLS` is an array, so the
  old direct `.split()` call could fail before signer verification.
- Require MM-bot readiness and credential export to verify/repair the linked
  signer remotely on explicit Setup/Sync or reconnect; a passive Bots scan
  remains read-only and a stale local key can no longer be synced as ready.

### Testing
- `npm run test:nado-one-tap` — PASS.
- `npm run test:nado-referral` — PASS.
- `npm run build` — PASS.
- Focused ESLint — 0 errors; 7 existing FuturesPanel warnings.
- `git diff --check` — PASS.
- Live read-only Nado archive query for the reported wallet — HTTP 200 and a
  valid linked-signer/rate-limit response. No transaction was signed/submitted.

### Approvals
- [x] Fix reviewed by lead-programmer — APPROVED, 2026-08-12
- [x] Regression test passed (qa-tester) — GO, 2026-08-12
- [x] Release approved (producer) — GO, 2026-08-12

### Rollback Plan
Revert the dedicated Nado one-tap hotfix commit, rebuild the web bundle with the
standard deployment script, and atomically redeploy the prior known-good main
release. The deployment itself performs no on-chain write and no database
migration. A user-triggered ENABLE intentionally relinks the Nado signer; that
state is reversible by relinking the previous signer or disabling one-tap.

Pre-release main SHA: `2a1fb3a1`.

### Follow-up
Complete a short post-incident review by 2026-08-14.
