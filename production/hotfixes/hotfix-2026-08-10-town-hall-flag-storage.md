## Hotfix: Paid Town Hall Flags Disappear After Deploys

Date: 2026-08-10
Severity: S2
Reporter: Myrdin
Status: READY FOR DEPLOY

### Problem

Paid custom Town Hall flag images disappear after release retention removes the
release directory that received the upload. The payment and upload history stay
in SQLite, but the image returns HTTP 404 and the player cannot upload it again
without another payment.

Production audit on 2026-08-10 found two paid uploads and no surviving image
files. Myrdin's $5 purchase `#817` and transaction remain recorded.

### Root Cause

`server/routes.js` stored uploads under `server/public/town-hall-flags` relative
to `__dirname`. In production, `__dirname` belongs to an immutable timestamped
release. The atomic deploy retains only the newest releases, so uploaded player
data was deleted as if it were build output.

### Fix

- Resolve the upload root from `TOWN_HALL_FLAG_UPLOAD_ROOT` and configure
  production to use `/opt/clash/shared/server/town-hall-flags`.
- Migrate any surviving legacy release uploads into shared storage without
  overwriting newer files.
- Include flag assets in atomic-deploy and daily backups.
- Detect a paid history record whose asset is missing and allow an authenticated
  recovery upload without another Solana payment.
- Update the original purchase history and current flag atomically, with a
  compare-and-swap recovery counter to prevent concurrent duplicate recovery.
- Block the client payment button until entitlement status is known and show a
  dedicated free-recovery flow for affected buyers.

### Testing

- `node server/test-town-hall-flag-storage.js` — PASS.
- `node server/test-town-hall-flag-routes.js` — PASS, including authenticated
  status, no-payment recovery POST, asset GET, and post-recovery status.
- `node web/test-town-hall-flag-entitlement.mjs` — PASS.
- `node --check` for changed server JavaScript — PASS.
- `bash -n deploy/deploy.sh deploy/daily-backup.sh` — PASS.
- ESLint for the changed component/helper — 0 errors; four unrelated existing
  unused-symbol warnings in `BuildingInfoPanel.jsx`.
- Clean Vite production build — PASS.

### Approvals

- [x] Scoped code and race-condition review completed by primary agent
- [x] Targeted and route-level regression tests passed
- [x] Release requested by owner

### Rollback Plan

Revert the scoped hotfix commit and redeploy the previous release. The shared
upload directory is additive and can remain in place during rollback. Before
any production recovery write, save the affected flag and purchase rows to a
timestamped JSON/SQLite backup so they can be restored independently.

### Follow-up

Complete a post-incident review by 2026-08-12, including an audit of every
other mutable file path under timestamped releases.
