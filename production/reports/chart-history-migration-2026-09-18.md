# Free reference chart history

## Cause and evidence
- Pyth retired `/v1/shims/tradingview/*` on 2026-08-26; official https://docs.pyth.network/price-feeds/core/create-tradingview-charts and https://docs.pyth.network/price-feeds/pro/api/history confirm migration requires authenticated Pro history.
- Production read-only probe: old history HTTP 404, Pro history HTTP 401, no Pyth/Lazer key configured in futures process or server environment files. Proxies cannot restore retired endpoints or replace authentication.

## Implementation
- Shared display-history endpoint uses Binance COIN-M **USD index** candles first, native-USD Kraken spot second, Coinbase spot last. No USDT=USD assumption. Primary is an index, not Pyth's own aggregated history.
- `/chart/history` primary path, legacy `/pyth/history` alias for old clients; source/price_type in JSON, no prominent new badge, factual tooltip/accessibility source.
- Provider calls bounded at five seconds each; existing coalescing, bounded query windows and cache reused. Coinbase 4H derived from actual hourly OHLC, limited to 299 hours on that last-resort path. Kraken max 720 bars; no unlimited backfill claims.
- Native chart paths retained. Shared path covers Avantis, GMX, Ostium, Hyperliquid, Risex, LeverUp, Hotstuff, GRVT, GMTrade, Flash; native fallback paths also use it. No venue tick is merged into reference candles. Market/timeframe switches clear old candles; no fabricated flat-history replacement on failure.
- Trading amounts, signed requests, official oracle/mark and PnL sources unchanged.

## Scope limits / audit
- Free native USD index/spot data does not cover every equity, commodity, FX or niche asset. Unsupported assets return explicit no_data, never mapped to tokenized substitutes. Initial Kraken/Coinbase catalog comparison directly matches 23/76 LeverUp feed symbols; many other markets have no Pyth symbol and require independent native-provider work. This is not a claim that all 76 charts are fixed.
- Separate legacy Benchmarks calls remain in Avantis prior-day-price and GMTrade price fallback helpers; they affect price metadata, not the new chart path. Deliberately not repointed to reference data to avoid altering execution/accounting sources under a chart fix.
- No provider was selected by a claim of empirically minimum error to Pyth; native USD index/spot is a reference with possible differences. Binance is a Pyth data contributor, not equivalent to Pyth consensus.

## Verification
- Live server reads: Kraken BTC/ETH/SOL 144 genuine 5m candles; Binance BTC USD index all six UI timeframes (1m,5m,15m,1H,4H,1D), 40 bars each.
- Provider unit tests: normalization/validation, bounds/order, Binance preference, fallback, 4H aggregation, unsupported market behavior, fail-closed errors.
- Mounted browser actual chart retry recovery and canvas at desktop 1280 and phone 390, collateral persistence/mock order regression pass. No funded trade.
- Full canonical Deploy gate passed, including production web build; provider/widget focused suites: 25 passing tests.
