# LeverUp non-Pyth chart coverage

## Cause

- Official public LeverUp `/v1/pairs` metadata contains 52 HYPERLIQUID execution markets and exact `venueSymbol`, including 30 stocks, indices, commodities, forex and pre-IPO perps. The existing adapter discarded executionVenue/venueSymbol and the chart guessed a Pyth/crypto symbol.
- These are derivatives on the specific declared venue, not necessarily US cash stocks or spot commodities. Examples: SAMSUNG -> xyz:SMSN, SKHYNIX -> xyz:SKHX, GOPRO -> io:GPRO, QQQ -> mkts:USTECH. Guessing generic ticker/USD would show the wrong market.

## Change

- Preserve official venue metadata and add separate `chart_symbol`; do not repurpose `pyth_symbol` or change order execution.
- All three terminal layouts pass the identifier. Exact context changes clear prior candles. Server reads public Hyperliquid candleSnapshot with bounded timeout, validated namespace, symbol/interval matching, OHLC validation and existing query/cache bounds.
- Source/price_type remain explicit in API and tooltip. Empty/error does not fall through to another asset or invented history. Existing Binance/Kraken/Coinbase crypto path unchanged.
- Primary documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint (Candle snapshot; HIP-3 namespace; recent 5000-bar upstream limit).

## Verification

- 2026-09-18 10:30:28 UTC live public reads: all 52 official HYPERLIQUID market mappings returned valid 5m candles over a 12-hour window, 132-144 bars each. Includes all listed stocks/commodities, forex, indices and pre-IPO mappings.
- 31 focused provider, actual market-adapter/hook and mounted widget regression tests pass. Native six intervals, exact namespaces, wrong-symbol exclusion, metadata propagation and context invalidation covered.
- Full canonical Deploy gate passed. Actual mounted GOLD terminal chart, native source routing, 1D switch and no horizontal overflow passed at 1280px and 390px. No funded transactions.

## Reporter setup recheck

- At 10:25:49 UTC account for owner-supplied wallet suffix 804a had zero client logs after allowance release at 10:08:15 UTC. No successful or failed retry can be inferred from that absence. Previously confirmed finite-allowance compatibility defect is fixed in deployed 9fa7dd51; do not claim a funded user retry was verified.
- Rechecked at 10:37:58 UTC: still zero post-release logs for this account. Nine actual setup/privacy/amount regression tests passed again.

## Production release and remaining risk

- Released application `9992eb4e` as `20260918103439-9992eb4e`; canonical deploy completed 10:37:19 UTC.
- At 10:40:20 UTC public API passed all 52 native mappings: 30 STOCKS, 8 COMMODITIES, 7 INDICES, 3 FOREX, 2 PRE_IPO and 2 CRYPTO. Exact venue symbol and price_type matched, each returned multiple bars. GOLD all six UI timeframes passed.
- Public `FuturesPanel-Dtng22QG.js` byte-matched. Five services online, zero restarts; online/prices HTTP200 and unauthenticated positions HTTP401.
- First complete public pass had one COPPER upstream timeout (51/52); repeated full pass after error cache expiry passed52/52. Futures log grew64 bytes for that timeout, zero code errors. Provider availability is not guaranteed; existing error responses are cached up to60s, so immediate retry can repeat that temporary failure. No fake candles or different asset fallback was used.
- Rollback `20260918101946-75de0e9c` retained. Standard retention removed `20260918100251-9fa7dd51`; its allowance fixes remain in current source, shared databases preserved, old source recoverable from Git.
