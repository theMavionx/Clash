# Live log audit and CSS chunk recovery

## Summary

- BUG-CLIENT-CSS-20260915; S2-Major / P1; Network / client boot.
- Owner requested fresh user-log inspection and immediate repair of actionable issues.
- Baseline production: `20260915105335-8892890c`. Audit began 20:07 UTC.
- Status: CSS recovery defect reproduced, fixed and deployed.

## Evidence

- All three inspected API/futures/jobs processes online with zero restarts.
- Last 30 minutes: two browser network errors (HEAD / and COOP check), no
  recorded LeverUp error. Browser telemetry is incomplete; unassigned player IDs
  must not be interpreted as a count of affected users.
- Last-hour nginx sample had no >=400 responses on API/RPC/assets/Godot routes;
  included four HTTP 200 Decibel order-place responses. HTTP success alone is not
  fill confirmation.
- Database verification at 20:12:32 UTC found 21 Decibel fills with `decibel_fill`
  proof in the preceding hour (timestamps normalized with julianday; ISO and SQLite
  timestamp strings must not be compared lexicographically). No new LeverUp fills.
- Post-release nginx sample: 4,299 LeverUp reads returned 200 or 304, including
  prices, markets, accounts, positions, orders and fee configuration. This includes
  operator checks and does not establish that every user/trade is working.
- No post-release LeverUp intent-proof records; latest recorded intent 09:46:15 UTC.
- Old LeverUp timeout stack traces reference release `20260914105559-5aff5fd8`,
  not the deployed transport. Three later GMX Subsquid HTTP 502 warnings are
  external indexer failures, not evidence of a new LeverUp regression.
- Browser errors include two `Unable to preload CSS for /assets/GameUI-BUuIXdIE.css`
  failures, latest 17:02:24 UTC, plus intermittent failed dynamic JS imports.
- The exact reported CSS and two JS files now return public HTTP 200 with correct
  MIME types. Public LeverUp markets/prices/fee-config also return HTTP 200.
- Other observed warnings include expired/absent authentication (401), user-rejected
  wallet requests and Pacifica account 404s; no evidence here justifies changing
  authentication, submitting trades, or treating missing exchange accounts as funded.

## Reproduction and root cause

1. A lazy GameUI import fails while preloading its CSS after a network interruption.
2. Vite rejects with `Unable to preload CSS for /assets/GameUI-BUuIXdIE.css`.
3. `reportLazyChunkError` reports the error but `isLazyChunkError` recognizes only
   JavaScript chunk errors, so it never requests the normal boot recovery.

Expected: recognize CSS asset loading failures and use the existing bounded update
coordinator. Actual: error boundary requires manual recovery, despite automatic
boot recovery already existing for equivalent JS failures.

## Fix and verification

- Added exact CSS-preload failure recognition and CSS URL extraction in clientLogger.
- No new auto-reload mechanism; reuse existing once-per-chunk session guard and
  critical-activity/interactive-boot protections.
- Four behavioral tests execute real recovery functions with the real update
  coordinator and simulated browser navigation/storage: boot recovery, duplicate
  reports, deferred recovery while busy/signing, activity changing before reload,
  JS compatibility and no reload for normal network/trading/wallet errors.
- Real local in-app browser fixture passed: a CSS preload error was deferred during
  critical activity, then triggered an actual cache-busted recovery navigation once
  activity cleared. Fixture displayed PASS after navigation; temporary tab/server stopped.
- Existing log retry regression and canonical Deploy gate passed, including web
  lint/build, trading regressions and Godot behavior probes (existing warnings only).
- No funded trades, authentication changes, user record repairs or proxy changes.

## Release verification

- Application commit `665fef02`, release `/opt/clash/releases/20260915201518-665fef02`;
  canonical deployment completed 20:20:23 UTC. All five Clash services online,
  zero post-release restarts and runtime health verification passed.
- Public `clientLogger-D-B9_jb3.js` returned HTTP 200, contains the corrected CSS
  error matcher and matches the current release bytes exactly (20,210 bytes).
- API/MCP health and LeverUp markets/prices/fee-config return HTTP 200. Reported
  `GameUI-BUuIXdIE.css` remains available publicly with HTTP 200.
- Previous release `20260915105335-8892890c` retained for rollback; standard
  retention removed `20260915101711-3bc445d9` (rebuildable from Git).
- Standard deploy-time payment sync refreshed dragon:clash to 134643.866972 CLASH
  per 10 USD at price 0.00007427. No LeverUp test orders were submitted.
- Existing open error pages may require one manual reload to obtain the fix.
  Point-in-time health checks and a quiet short log window cannot prove every
  user's experience or unobserved LeverUp trade execution.
