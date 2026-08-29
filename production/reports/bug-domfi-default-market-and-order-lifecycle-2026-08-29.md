# Bug Report: DomFi opens an unavailable BTC chart and hides executed positions

## Summary

The shared trading terminal starts on `BTC`, but DomFi only lists dominance
markets such as `BTCDOM` and `USDTDOM`. Its chart therefore requests an unknown
market and remains empty. Separately, DomFi's current v2 account API returns
human-readable decimal strings while the Clash adapter still interpreted those
values as contract-scaled integers. A successfully executed USDTDOM position
was reduced to near-zero margin, leverage, size and entry price in the UI.

## Classification

- Type: Exchange integration / data normalization / asynchronous lifecycle
- Severity: P1 Critical
- Priority score: 14/16 (impact 4, scope 3, blocking 4, workaround 3)
- Affected systems: DomFi chart, positions, account metrics, History, verified
  trade import, tournament volume, gold/quest attribution
- Reported: 2026-08-29
- Production build observed: `20260829110811-0dd383eb`

## Environment

- Production: `https://clashofperps.fun`
- Client: web trading terminal
- Exchange: DomFi on Base (chain ID 8453)
- Markets observed: BTCDOM, ETHDOM, USDTDOM and the other DomFi dominance pairs
- Affected order: USDTDOM long, pair index 2

## Reproduction Steps

1. Select DomFi in the shared terminal.
2. Open the trading panel before choosing a symbol.
3. Observe the chart request for `symbol=BTC` fail because BTC is not a DomFi
   market.
4. Select USDTDOM and submit a market long.
5. Wait for the wallet transaction to succeed and the DomFi oracle bot to
   execute it.
6. Observe no meaningful position/account change because the returned display
   decimals are divided by their contract precision a second time.

## Expected Behavior

- The terminal selects the first live market when its current/default symbol
  is unavailable on the selected venue.
- A mined DomFi market-order request remains pending until the protocol reports
  `executed` or `canceled`.
- Positions, History, volume and rewards use the actual collateral, leverage,
  price and USD exposure returned by DomFi.

## Actual Behavior

- Production client logs repeatedly recorded `Unknown DomFi market: BTC` from
  the candles route.
- The order transaction succeeded and DomFi later reported
  `MarketOpenExecuted`, but Clash normalized `$19.691429` collateral to
  `$0.000019691429`, `20x` leverage to `0.2x`, and the dominance entry price to
  roughly `7e-18`.
- The client stopped tracking after the request transaction receipt and did a
  single refresh 1.5 seconds later, before asynchronous execution was indexed.
- DomFi's active-position API row was absent from Clash History/import until
  the trade eventually appeared in the separate settled-trades feed.

## Technical Context

### Confirmed root causes

1. `FuturesPanel` used a venue-independent initial symbol of `BTC` and did not
   validate it after DomFi markets loaded.
2. `server-futures/domfi.js` assumed account values always used raw on-chain
   precision. Current v2 account responses already contain display decimals.
3. The adapter treated current `trade_notional` as USD notional, while the live
   response represents base-asset quantity. Protocol USD exposure is
   collateral multiplied by leverage.
4. DomFi market orders use an asynchronous request/fulfill lifecycle; receipt
   success confirms submission, not position execution.

### Implemented fix

- Validate the selected symbol against every venue's loaded market set and
  fall back to its first active market (BTCDOM for the current DomFi list).
- Normalize both current display-decimal and legacy scaled account payloads.
- Derive USD exposure from collateral × leverage, matching DomFi's protocol
  definition.
- Include DomFi order lifecycles in account snapshots and track the initiating
  transaction through `executed` or `canceled`; retain an explicit pending
  message and background refreshes if indexing exceeds the foreground budget.
- Merge active verified positions into DomFi History/import, deduplicated by
  trade ID, so open fills can update volume/gold/quests without waiting for a
  later close.
- Emit bounded DomFi submit/executed/canceled/pending client telemetry for
  future production diagnosis.

## Evidence

- Client telemetry: repeated production candle requests for DomFi `BTC`
  returned `Unknown DomFi market: BTC`.
- Official DomFi API: the affected order's initiating transaction was indexed
  as `executed`; `MarketOpenExecuted` occurred seven blocks after initiation.
- Official DomFi API position: USDTDOM pair 2, `$19.691429` collateral, `20x`
  leverage, entry `7.023670739956961086`, trade quantity
  `56.071617617202434738`.
- Corrected live-adapter result: `$393.82858` USD exposure and approximately
  `56.0716176172` USDTDOM quantity.
- Official DomFi documentation states that market execution is asynchronous
  and follows a request/fulfill flow.

## Verification

- Adapter regression covers both legacy scaled account payloads and the exact
  current v2 display-decimal shape.
- Lifecycle tests cover pending → executed matching by initiating transaction
  hash and cancellation reasons.
- Live read against the affected wallet returns the correctly valued USDTDOM
  position, the executed lifecycle and an open History record.
- DomFi HTTP integration tests pass against current markets, prices, candles,
  config, referral and account snapshot routes.
- Production web build completes successfully; ESLint reports zero errors.

## Related Issues

- `production/reports/bug-domfi-rpc-refresh-and-client-log-loss-2026-08-28.md`

## Notes

- No funded trade, approval, wallet signature or production database mutation
  was performed during diagnosis or verification.
- A fully signed browser order cannot be replayed locally without the owner's
  wallet; lifecycle behavior is verified with current official API evidence,
  focused regression tests and a live read of the already executed order.
