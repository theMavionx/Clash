# Bug Report: Hibachi History is cancelled before the server responds

## Summary

The Hibachi `History` tab can remain empty because the browser aborts its authenticated history request after eight seconds. A valid Hibachi read can legitimately exceed that window while the server waits for the upstream API and performs bounded proxy retries. The History effect also depended on the live market array, so ordinary market-price refreshes could cancel and restart an otherwise healthy request.

## Classification

- Type: Integration / client request lifecycle
- Severity: P2 Major
- Priority score: 10/16 (impact 3, scope 2, blocking 3, workaround 2)
- Affected systems: Hibachi History UI, Hibachi authenticated history adapter, generic trade prefetch
- Reported: 2026-08-29
- Production build observed: `20260828163553-9031caf3`

## Environment

- Production: `https://clashofperps.fun`
- Client: web trading terminal
- Exchange: Hibachi
- Endpoint: `POST /api/futures/hibachi/trade-history`
- Hibachi credentials: browser-local encrypted storage

## Reproduction Steps

1. Connect Hibachi with valid account credentials.
2. Open the trading terminal and select `History`.
3. Let the authenticated Hibachi request take longer than eight seconds, or let the markets poll update while it is pending.
4. Observe an empty History state and a client telemetry event ending in `aborted`.

## Expected Behavior

The request should remain active for the server's complete bounded Hibachi read window, should not restart because unrelated price data refreshed, and should show an actionable Retry state when an actual timeout or credential problem occurs.

## Actual Behavior

- Production client telemetry recorded three `fetch POST /api/futures/hibachi/trade-history aborted` events in the inspected 72-hour window.
- No matching Hibachi server exception was recorded for those requests.
- The component used a fixed eight-second client timeout.
- The component effect depended directly on the frequently refreshed `markets` array.
- The current Hibachi order-history response field `avgFillPrice` was not recognized by the normalizer.
- Generic private prefetch also emitted unsupported Hibachi `GET` account/positions/orders requests, producing unrelated 404 noise.

## Technical Context

### Confirmed root causes

1. `web/src/components/TradeHistory.jsx` aborted every History load after eight seconds.
2. Hibachi server reads allow a 12-second upstream attempt and bounded retries, so the client deadline was shorter than the server contract.
3. Market-array identity changes retriggered the History effect and aborted in-flight reads.
4. `server-futures/hibachi.js` normalized legacy average-price keys but not Hibachi's current `avgFillPrice` field.

### Implemented fix

- Hibachi History now has a 60-second client read budget; other exchanges use a 15-second budget.
- Market data is read through a ref and no longer controls the request lifecycle.
- Timeouts and missing credentials produce an explicit error with a Retry action.
- The Hibachi normalizer accepts `avgFillPrice` and `avg_fill_price`.
- Hibachi was removed from the unsupported generic private GET prefetch set.

## Cross-exchange History Audit

- All 24 selectable exchanges have an explicit History loading strategy or an intentional local indexed-history strategy.
- Production futures history data in the inspected period exists for Avantis, Decibel, GMTrade, Hibachi, Hyperliquid, Katana, Nado, Ondo, Ostium, Phoenix and RISEx.
- No matching trading-History backend failure was found for the other configured exchanges in the inspected 72-hour client/server logs.
- A RISEx upstream `bridge/history` 404 was observed. It belongs to transfer/bridge history, not the trading `History` tab route, and is tracked as a related issue rather than folded into this fix.

## Evidence

- Production client telemetry: three aborted Hibachi trade-history POST requests in the inspected 72-hour window.
- Production server logs: no corresponding Hibachi route failure for those cancellations.
- Official Hibachi API documentation: account trade history is authenticated, paginated, and order history currently returns `avgFillPrice`.
- Regression test enumerates every exchange in `DEX_ORDER` and fails if no History strategy exists.

## Verification

- Hibachi adapter tests cover the current `avgFillPrice` response.
- Trade History regression tests cover all configured exchange strategies, the Hibachi timeout, stable market refresh behavior, Retry messaging and prefetch exclusion.
- Tournament synchronization tests cover browser credentials, a bounded 429 retry, missing credentials and server-side importer failure propagation.
- Server tournament cursor/credit tests and the production web build complete successfully.

## Related Issues

- `production/reports/bug-hibachi-tournament-volume-stuck-browser-sync-2026-08-28.md`
- RISEx bridge/transfer-history upstream 404; not the trading History tab.

## Notes

- This change performs no funded trade, withdrawal, wallet signature, or production database mutation.
- Live authenticated History cannot be exercised for every exchange without each user's private exchange credentials; the audit therefore combines route/adapter coverage, focused contract tests, production telemetry, and available indexed production data.
