# Bug Report

## Summary
- Title: Hibachi funding routes to another exchange; history ordering and execution labels mislead.
- ID: BUG-HIBACHI-HISTORY-20260916
- Severity: S2-Major (history routing); S3-Minor (presentation)
- Priority: P1-Immediate
- Status: Released; private authenticated user-session verification remains unobserved
- Reported: 2026-09-16 by owner during terminal usability review

## Classification / environment
- UI / Network, trading history, deterministic branch defects; regression unknown.
- Baseline536ec0de, web terminal desktop/mobile, authenticated Hibachi account.

## Reproduction
1. Select Hibachi, open Funding: no Hibachi branch existed, so the generic
   fallback sent the account to Pacifica's funding endpoint.
2. Open history with multiple timestamps: descending default multiplied a
   reversed comparator, showing oldest first.
3. Inspect Hibachi execution-only buy/sell records: generic normalization called
   them Open Long/Short without position-transition evidence; missing PnL showed0.

Expected: correct exchange read, newest-first history, honest execution labels,
unknown values distinct from zero, recoverable failures.

## Root causes / fixes
- Added authenticated owner-guarded funding route and cached bounded account
  settlements reader, preserving signed decimal amount and no invented rate.
- Funding loader now has an explicit Hibachi path; unknown exchanges cannot
  fall through to Pacifica. Market refresh no longer cancels ongoing funding reads.
- Both history tables fix comparator direction, offer Refresh, and distinguish
  filtered-empty data. Funding timeout becomes an error with Retry, not empty success.
- Hibachi fill IDs prefer exact clientOrderId (avoids duplicate keys for partial
  fills sharing orderId); side is Buy/Sell and missing PnL is an em dash.
- UI review additionally improved orange-button text contrast and disabled states.

## Evidence / verification
- Official schema: https://hibachi-docs.redocly.app/accountapi/trade
- Pagination reference: https://www.postman.com/hibachi-xyz/hibachi-public/request/7ox8mqo/trade-account-settlements-history
- Three backend adapter tests and six real Edge UI tests pass, plus existing six
  history-routing tests. UI tests cover display/order, error/retry, refresh,
  funding request routing, market updates and320px table containment.
- No funded transactions submitted. Fixtures do not establish a particular
  user's authenticated production history or exchange completeness beyond limits.
- Scope is recent100 results; this is not an unbounded account-history export.
- Read-only production audit08:14UTC found55081 indexed Hibachi trade rows across
  38 profiles. Six-hour client telemetry has no Hibachi-tagged entries; absence
  of telemetry is not evidence of every user's history working. No credentials
  or individual trade records were extracted for this audit.

## Related
production/reports/trading-release-2026-09-16.md

## Production release
- Commit3eef0d2d, release20260916081717-3eef0d2d; canonical deploy completed08:20:24UTC.
- Full Deploy gate and final web build passed;22 Hibachi backend tests,12 history
  UI/routing tests, plus20 focused CSS/layout/theme/ticket tests passed.
- At08:20:31UTC five services online, zero restarts; health, Hibachi markets/prices
  and LeverUp markets200; funding POST and trade-records GET401 without auth.
- Public FuturesPanel-A5Q1K3Hb.js970010bytes and main-DQxE_4oG.css both HTTP200
  and byte-identical SHA256 to release, new funding-path/disabled-state markers present.
- No new futures/MCP error bytes; client log window empty. Main API log grew13827
  bytes with no matched syntax/record errors; preexisting upstream warning issue
  is outside this history/UI change. No claim of globally clean logs.
- Rollback20260916075134-89b35e4e retained; standard retention removed older
  20260916071622-f484e531 files, rebuildable from Git. No DB migration/deletion.
