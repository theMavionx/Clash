# Trading release — 2026-09-16

## Released scope
Owner approved «все на прод». Includes terminal reference layout, mouse-wheel
repair, exact Hibachi reconciliation records, bounded REST proxy behavior and
public price streaming/private WS lifecycle improvements.

- Commit `aa8f3f81`; release `/opt/clash/releases/20260916065900-aa8f3f81`.
- Canonical Deploy gate passed (existing lint/Godot/chunk-size warnings remain).
- Additional trusted-username reconciliation regression fixed before release.
- Canonical export/upload/deploy completed 07:04:21 UTC; Godot unchanged/reused.
- Backup `/opt/clash/shared/hibachi-release-backups/futures-before-20260916-trading.db`:
  845705216 bytes, mode0600, SQLite quick_check=ok before activation.
- Immediate rollback retained: `/opt/clash/releases/20260915201518-665fef02`.
- Standard retention removed release `20260915105335-8892890c`; reconstructable
  from Git. No user DB rows removed by this migration.

## Live verification at 07:04:31 UTC
- Five Clash PM2 services online, zero post-release restarts.
- Public /api/online, Hibachi markets/prices and LeverUp markets HTTP200.
- Private trade-records route returns401 without authentication.
- FuturesPanel-ClCcDRzo.js HTTP200, 968372 bytes, exact SHA256 byte match to
  current release; wheel-fix marker present.
- New reconciliation table has all required columns; zero rows at audit time.
  This proves schema installation, not real funded execution/import.
- Client log window since07:03:16: one debug, no warnings/errors observed.
- No new futures/MCP error-log bytes. Main API log grew16043 bytes; no new
  syntax/module/SQLite/record-write errors matched. Its inspected increment
  contains upstream429 retry warnings (500/1000/2000/4000ms backoff); provider
  is not identified by these generic lines. Do not represent this as a clean
  error log or proven Hibachi failure. Short window is not proof every user flow succeeds.
- No funded test orders submitted. Existing standard deployment payment-sync
  updated dragon:clash quote to154249.575814 CLASH per10USD.
- Dependency audit/deprecation/Node-engine warnings pre-exist in unchanged
  lockfiles; not auto-upgraded during this trading/UI release.

## Follow-up explicitly requested during release
Remove leverage presets; compact Market/Limit + selected Long/Short + single
submit; replace oversized entry TP/SL dialog with compact inline controls.
These follow-up changes are not in aa8f3f81; second release prepared after verification.

## Ticket / inline protection follow-up verification
- Compact Market/Limit tabs, selected Buy/Long or Sell/Short, one orange submit.
- Leverage preset buttons removed; slider and validated numeric control retained.
  Empty/nonfinite/below-one input cannot change local state or venue settings.
- Entry TP/SL now inline with price/%margin/USD PnL modes and trigger previews.
  Side follows the ticket; existing-position editor is unchanged. Enabled empty
  protection blocks submission instead of silently submitting an unprotected order.
- Full canonical Deploy gate passed; 14 focused regression tests and seven real
  Edge inline-editor tests passed. Existing dependency/lint/chunk warnings remain.
- Integrated localhost browser verified empty-target guard, mock short market
  and long limit callbacks with attached TP/SL, valid12x/invalid-5x leverage,
  desktop and390/320px phone layouts without document horizontal overflow.
- Mock callbacks are not funded exchange execution. No real orders placed.
- team-ui workflow guided shared ticket direction, inline controls and responsive
  verification. Keyboard/label coverage is focused; no gamepad certification claimed.

## Follow-up production result
- UI commit `f484e531`; current release `/opt/clash/releases/20260916071622-f484e531`.
  Canonical deployment completed07:19:52UTC; live verification07:20:09UTC.
- All five services online, zero restarts. Hibachi markets/prices, LeverUp markets,
  /api/online HTTP200; private records route401 without authentication.
- Public FuturesPanel-C4yzOkmw.js HTTP200, 966957bytes, exact SHA256 match to
  release; inline TP/SL, side selector and enabled-empty guard markers present.
- New client log window empty; no new futures/MCP error bytes. Main API log
  increment remains predominantly upstream429 retry warnings (227/229 lines in
  follow-up sample); no matched syntax/SQLite/record errors. Unrelated upstream
  rate limits remain a limitation, not proven fixed by this UI release.
- Real trade-record import remains unobserved (zero rows); no funded trades used.
- Additional integrated check: keyboard Space toggles protection; wheel over
  focused SL scrolls parent166.4->248.8 while preserving value75000.
- Rollback retained: `20260916065900-aa8f3f81`. Standard last-two retention removed
  older `20260915201518-665fef02` deployment files, recoverable by rebuilding Git.
  Shared databases and pre-migration backup were retained.
