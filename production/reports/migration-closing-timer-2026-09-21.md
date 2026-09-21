# Migration closing timer — 2026-09-21

Owner requested a shared one-day countdown and clarified that administrators must be able to change it.

## Implementation

- Persistent nullable deadline, fresh server clock and monotonic browser elapsed time. Refresh does not restart it.
- Public top-of-page countdown; UTC admin editor, server-relative 24-hour restart and disable controls.
- Expiry rejects new quote/deposit acceptance, including async signing boundary races. Previously accepted deposits retain reconciliation/idempotency and payouts continue subject to the existing pause control.
- Dedicated authenticated endpoint changes deadline only. Snapshot, payout token, ratio and financial ledger are preserved. Timer runs even while migration is paused.
- Architecture rationale: ADR-0051.

## Verification

- 96 focused migration server/client tests passed, including exact expiry, persistence, boundary races, admin authentication and cached-status clock freshness.
- Mocked headless Edge flows passed at 1440/390/320px; admin custom UTC, 24-hour restart and disable; client clock five days wrong; real countdown expiry and no overflow. Mobile screenshot inspected.
- Full canonical Deploy gate passed (existing lint/build warnings remain); 81 isolated migration tests also passed on Linux in the release candidate. Desktop and mobile screenshots inspected.
- No funded migration transaction performed. Production verification pending at implementation commit.

## Production

- Released `20260921180004-620ae4e2`; runtime health passed. Applied exactly86400seconds via authenticated endpoint: closesAt1790100250842, 2026-09-22T18:04:10.842Z /22September21:04Kyiv. Verified unrelated config, snapshot and financial ledger hash unchanged, enabledfalse retained.
- Live read-only Edge1440/390/320px: HTTP200, countdown decreases, reload preserves deadline, old payout timing paragraph absent, no overflow/page errors. Mobile screenshot inspected. No funded migration transfer.
- Canonical deploy performed its existing collectible payment-price on-chain sync. Retention removed older compiled release20260921173928-a83e0d8e; previous20260921174301-b0bb9a4f retained, source remains rebuildable from Git. Existing dependency advisories remain outside this change.

## Follow-up: confirmed21:00Kyiv snapshot

- Owner explicitly confirmed21September21:00Europe/Kyiv =18:00UTC. Guarded admin replacement succeeded after checking paused state and all liabilities settled. An initial diagnostic checked the ordinary replacement flag instead of the settled-replacement flag and stopped before any mutation; corrected check passed.
- New requestedAt/blockTime1790013600000, finalized slot449129586, checksumd11bea7378654376fa333dc6da42d6e65e2704e26a2560a8d48f1f4cf4a70913. Public API confirms exact cutoff.
- Previous snapshot/eligibility archived atomically; complete requests/sales/sends hash unchanged, complete config (including deadline) unchanged. Historical entitlement cache starts empty and resolves per wallet; zero cached wallets is not zero eligible supply. Existing consumed allocation remains based on preserved request history.
