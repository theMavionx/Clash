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
- No funded migration transaction performed. Full Deploy gate and production verification pending at implementation commit.

## Production

Pending rollout. Apply one server-relative 86400-second deadline only after deployment; retain paused state and verify unrelated configuration/ledger unchanged.
