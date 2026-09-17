# LeverUp terminal missing market data

## Summary
- ID: BUG-LEVERUP-MARKET-DATA-20260917; severity S2; priority P1.
- Reported by owner, 2026-09-17; status: released, live API/assets verified.
- Trading UI/data integration; reproducible on desktop/mobile; regression unknown.
- Baseline production 3c6a6b2d.

## Reproduction and evidence
1. Open LeverUp BTC trading terminal.
2. Oracle and OI show dashes despite upstream values; 24h change defaults to zero without supporting data.
3. An empty oracle-pricing placeholder occupies the orderbook column.
4. If Pyth history fails, the chart fabricates flat historical candles from the current price.

Live public market read returned BTC `pyth_symbol=Crypto.BTC/USD`, long quantity 0.243399243 and short quantity 0.0317389922. A live last-day 5m history request returned `s:error`, `Pyth benchmarks 404: HTTP 404`.

Expected: available market metrics are displayed, unavailable data is explicitly unavailable, no fake historical candles. Owner clarified to remove the LeverUp book for now; do not substitute a foreign exchange's depth.

## Root cause / implementation
- Server prices returned `oracle_price`; client header expects `oracle`. Add the adapter alias without changing order prices.
- Market OI was returned as long/short base quantities; publish their sum marked to current oracle as USD OI. Preserve unknown versus zero using availability flag.
- Hide LeverUp from supported-book UI list; existing responsive layout expands chart, no empty column/tab.
- Unknown 24h change is a dash, not fabricated +0.00%.
- LeverUp Pyth history reads have 10-second per-attempt deadline. Empty/error responses produce an explicit Retry chart state, not synthetic candles. Other venues' behavior is unchanged.

## Verification
- 13 protocol/collateral/market-data test entries pass, including actual adapter and hook functions.
- Mounted real FuturesPanel/TradingViewWidget at 1280px and 390px: no book column/tab, explicit history error and Retry, lvUSD selection/submit regression, no document overflow or runtime errors.
- Fixtures intercept failed history; no real wallet signature or order.
- Full canonical Deploy gate passed (existing lint/asset UID/chunk-size warnings remain).

## Remaining limitation
Pyth BTC history is currently unavailable; this change does not restore upstream candles or provide another history provider. Live oracle/market reads remain available. No genuine LeverUp L2 source was established, and no depth is invented.

## Release evidence
- Commit `79fc4046`, current `/opt/clash/releases/20260917071700-79fc4046`; canonical deploy completed 07:20:18 UTC.
- Verified 07:21:04 UTC: five services online with zero restarts, online/prices HTTP 200, BTC oracle 76470.26010896 and marked OI 21039.892411664212 USD.
- Public `FuturesPanel-DYqQ_mjD.js` byte-matches release; corresponding canonical source commit confirms LeverUp excluded from book capability. Runtime release intentionally omits source-only files; verifier uses commit-checked canonical checkout for source assertion.
- Futures error log unchanged at 374072 bytes from predeploy baseline.
- Rollback retained `20260917065142-3c6a6b2d`; standard retention removed `20260916081717-3eef0d2d` release (rebuildable from Git), not shared data.
