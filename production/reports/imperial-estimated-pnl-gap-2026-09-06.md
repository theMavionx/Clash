# Bug report: Imperial venue mark versus Clash index estimate

## Summary

- ID: BUG-IMPERIAL-ESTIMATE-20260906; reported2026-09-06 by owner; severity S2/Major, priority P2; category market data/UI; frequency unknown, regression unknown.
- Status: cause localized to quote-source mismatch for this screenshot pair; production remedy not implemented.
- Build: production b93f6eb1; web positions table, BTC Phoenix long, effective leverage190.74x, notional846.04.
- Request: UR-2026-09-06-IMPERIAL-PNL-ESTIMATE.

## Reproduction and evidence

Open the same Phoenix BTC position in Imperial and Clash. Compare mark and PnL with native quote freshness unavailable in Clash. Expected: matching venue-based PnL for synchronized observations, or an unambiguous indication that the value is an estimate from a different source. Actual screenshot: Imperial mark80012, PnL+1.72/+41.55%; Clash mark79982.02, Est.+1.40/+33.87%. Screenshot capture timestamps and exact accrued fee values are not available.

The known full-precision position amount is846.0401/79815.103773 =0.010600000000077681BTC. Holding fees and capital fixed:

- Mark difference29.98 × token amount =0.317788USD PnL.
- Capital4.135005 gives7.685311 percentage points.
- Rounded screenshot differences are0.32USD and7.68 percentage points. These are consistent within independent rounding. This is not evidence of an additional PnL formula error in these screenshots.

## Read-only live verification

At2026-09-06T12:07:18UTC, official `/mark-prices` returned BTC Phoenix price79655, sourcephoenix_orderbook_ws, fetchedAtUnixMs1788607210980, age24.785hours. An8-second public `/ws/market` subscribe_mark_prices probe returned the same stale Phoenix timestamp, while index/pyth_lazer quotes were less than1second old.14 BTC frames arrived; only8 were printed. A socket error during requested shutdown means this short probe is not a long-term connection reliability certification.

Official [OpenAPI](https://api.imperial.space/api/v1/openapi.json) documents per-venue provenance/fetchedAtUnixMs for [mark prices](https://api.imperial.space/api/v1/mark-prices). This is a current upstream observation, not proof of the exact historical feed state at screenshot time. The screenshot's Est. label and current code do identify the index-fallback path.

## Technical context

- `web/src/lib/imperialData.js`: imperialLivePosition prefers a fresh execution-venue quote, otherwise uses a fresh index and sets live_mark_basis=index. Quotes older than60seconds are rejected; unchanged fees, token size and capital feed both calculations.
- `web/src/hooks/useImperial.js`: receives price source/timestamps through the public market stream.
- `web/src/components/FuturesPanel.jsx`: only PnL gets the compact Est. label; the Mark column does not clearly identify index versus venue. This ambiguity contributes to the reported mismatch.
- The original Imperial screenshot has a different Phoenix mark. Its exact live frontend source was not re-audited during this bounded diagnosis.

## Verification and next action

Added a local regression using screenshot prices and the known position, keeping fee input identical. Confirms index fallback, fresh-venue precedence, delta0.317788USD and7.685311percentage points, unchanged fees/quantity/leverage.11/11 Imperial data/stream tests and git diff --check passed.

No application runtime change, deploy, live order or permission mutation performed. To match native Imperial continuously, obtain a reliable fresh Phoenix venue feed (or have Imperial repair its public feed); label the current Mark source explicitly in the UI. Do not drop timestamp validation or substitute a fixed price correction. Separate related report: `imperial-market-close-prod-2026-09-06.md`.
