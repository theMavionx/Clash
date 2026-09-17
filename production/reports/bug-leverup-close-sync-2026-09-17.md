# LeverUp confirmed close can remain visible

## Summary
- ID: BUG-LEVERUP-CLOSE-SYNC-20260917; severity S2; priority P1.
- Owner report 2026-09-17; baseline app 79fc4046; status: released and live assets/health verified.
- Trading UI / asynchronous reconciliation; regression unknown.

## Evidence and reproduction
Production audit found a successful full close at 02:27:39 UTC and another close for the same trader and target at 02:28:03 UTC, rejected with `TradingOneClickPortalFacet: not position owner`. This is consistent with stale UI but does not prove what that user saw.

Actual hook previously returned successful close without removing the row, scheduled account refresh at +1.5 seconds, and accepted every later position snapshot. A failed refresh or lagging snapshot could leave the closed position actionable.

Reproduce locally: defer account read, confirm full close, then return the old position snapshot and invoke the old row callback. Expected: no visible closed position and no second submission. Before fix: row can remain/reappear and callback sends another intent.

## Fix
- Synchronous per-position in-flight guard blocks double click before React rerender.
- Only explicit successful full-close execution records a confirmed-close tombstone and immediately removes the row.
- Wallet/hash/open-timestamp keys isolate accounts and allow a new instance with a later timestamp even if the venue reuses a hash.
- Account and TP/SL indexing refreshes filter confirmed closed instances, including reads started before confirmation.
- Account reads validate captured credential scope before updating state.
- Post-success refresh runs immediately; read failures do not convert an executed trade into failure or produce unhandled timer/poll rejections.
- Partial closes preserve the row. Failed closes preserve the row and allow deliberate retry; no automatic transaction retry was introduced.

## Verification
- Seven actual-hook deterministic regressions: full close and stale row retry, double click, explicit rejection/retry, partial close, failed refresh after success, delayed snapshot, wallet scope/new timestamp.
- Existing collateral/order/protocol tests pass.
- Mounted React fixture using actual close/account callbacks passed: double click submits once, confirmed close removes row, stale refresh cannot restore it, stale row callback cannot submit again.
- Full canonical Deploy gate passed (existing lint, asset-UID and chunk-size warnings remain).

## Limits
No funded transaction or user-wallet signature performed. Tombstones are local to this mounted trading hook, not persisted across full reloads; reload reads authoritative account state. Uncertain relayer outcomes are not inferred to be success. Partial-close quantity reconciliation remains authoritative-server driven.

## Release
- App commit `34257b81`; canonical deploy completed 14:44:30 UTC, current `/opt/clash/releases/20260917143924-34257b81`.
- At 14:44:43 UTC: five Clash services online, zero restarts; online/LeverUp prices HTTP 200; anonymous positions correctly HTTP 401.
- Public shared chunk `useOstium-COVJIf3j.js` contains both LeverUp close guards and SHA256 byte-matches the active release. Bundler chunk name is shared, not an Ostium behavior change.
- Futures error log unchanged at 375233 bytes from predeploy baseline.
- Previous `20260917071700-79fc4046` retained for rollback. Standard retention removed older `20260917065142-3c6a6b2d`, rebuildable from Git; shared user data retained.
