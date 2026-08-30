# Nado chart failure and public-read proxy verification

## Summary

- **Title:** Nado chart has no historical candles and rounds KPEPE to 0.00.
- **ID:** BUG-20260831-NADO-CHART
- **Severity:** S2-Major (market chart unavailable; trading is a separate path).
- **Priority:** P2
- **Status:** Fixed and verified locally; not deployed.
- **Reported:** 2026-08-30, follow-up proxy request 2026-08-31 Europe/Kyiv.
- **Reporter:** Owner, with client console output and screenshot.

## Classification

- Category: UI / Network / market-data integration.
- System: Nado FuturesPanel -> TradingViewWidget -> historical candle source.
- Frequency: reproducible with the supplied Pyth history URL.
- Regression: unknown upstream start date; current Pyth history returned 404.

## Environment

- Base: production-matched commit 534e91d2.
- Local implementation branch: codex/log-audit-20260830.
- Worktree: C:/Users/Admin/AppData/Local/Temp/clash-etoro-4fa3e60ff21c47e99dd6c27f498f62d1.
- Production URL inspected read-only: clashofperps.fun.
- Browser: actual local React/lightweight-charts rendering in the in-app browser.
- No wallet login, funding, signing, order submission or production mutation.
- Earlier local log-audit fixes remain intact; original checkout holder-rebate
  changes were not modified or included in this work.

## Reproduction Steps

Precondition: open Nado Trade and choose BTC, PENGU or KPEPE.

1. Select the 5m chart.
2. Client requests Pyth TradingView history directly.
3. Direct response lacks usable CORS headers; client logs the supplied warning.
4. Clash's /api/futures/pyth/history fallback calls the same failed upstream.

Expected: historical candles for the selected Nado product, correctly scaled.
Actual: no real historical candles; code substitutes a two-point flat line at
the current mark. Default two-decimal formatting displays KPEPE as 0.00.

## Evidence and Root Cause

- The exact supplied BTC history request returned HTTP 404 during inspection.
- The production same-origin fallback returned:
  {"s":"error","error":"Failed to load Pyth history","errmsg":"Pyth benchmarks 404: HTTP 404"}.
- Nado was in the generic Pyth branch; it had no native candles dispatch.
- A live native Nado archive POST returned valid KPEPE candles for product 38,
  with open_x18/high_x18/low_x18/close_x18 fields and second timestamps.
- No Pyth-symbol rewriting can reliably replace native KPEPE/KBONK contract
  units. The exact active market product ID is the authoritative lookup.
- The chart used lightweight-charts' default precision, not market tick_size.

Sources:

- https://docs.nado.xyz/developer-resources/api/archive-indexer/candlesticks.md
- Installed @nadohq/indexer-client types and @nadohq/client 0.15.0.

## Local Fix

1. Added nado.getCandles and /api/futures/candles?dex=nado dispatch.
2. Validated symbol, six supported intervals, time bounds and maximum 500 bars.
3. Read native product candles with a bounded timeout; convert x18 prices,
   validate product/granularity/OHLC, deduplicate and sort ascending.
4. Added 15-second / 128-window cache and in-flight request coalescing.
5. Nado chart now uses same-origin native history, never Pyth or synthetic
   flat history. Genuine no-history and failures have visible retry states.
6. Pass tick_size from all three FuturesPanel chart layouts.
7. Clear old market/timeframe bars and abort stale loads; retain valid
   same-market history on a transient refresh failure.

## Additional Owner Request: 100 Proxies

The owner requested the latest 100 Webshare proxies for free public RPC/price
reads and local testing, not a production deployment.

- Existing pool support covered Hibachi REST only.
- Added a common public-only HTTPS request policy, Node fetch and default
  Axios SDK transport, browser fetch/Axios relay, and protected same-origin
  public-read handler. Server entrypoints install it before route/SDK creation.
- Reused existing Hibachi pool parsing/rotation/health tracking. Its existing
  account-affine authenticated transport is explicitly preserved.
- Ignored local .env.public-proxy points CLASH_PUBLIC_PROXY_FILE and
  HIBACHI_PROXY_FILE to the owner's latest Webshare file. No credentials were
  copied into source, browser code, Git, or this report.
- Added direct declarations for already installed Axios 1.14.0. Each lockfile
  changed by one root dependency line; no dependency versions changed.
- Plain web lockfile regeneration encountered pre-existing peer conflicts.
  The project's canonical --legacy-peer-deps mode completed successfully.

### Scope and Safety

Only allowlisted public HTTPS operations use this new route. Private/offchain
account APIs, auth/signing, transaction broadcast, keyed RPC providers, wallet
extension networking, WebSockets, custom agents/adapters and unknown operations
keep their prior transport. It is not an unrestricted generic proxy.

The shared policy rejects unknown/local/IP targets, URL credentials, non-HTTPS,
non-standard ports, secret headers/query/body fields, write RPC methods and
mixed read/write batches. The relay never forwards arbitrary request headers
or cookies, refuses redirects, and bounds bodies, responses and concurrency.
Large getProgramAccounts reads remain on their existing path.

Two bounded proxy attempts apply only to transport failures. Provider
401/403/404/429/5xx are returned without proxy rotation. 429 uses provider-wide
Retry-After cooldown. No direct fallback is used when the pool is configured.

Design and tradeoffs: docs/architecture/adr-0032-public-read-proxy-pool.md.

## Live Read-Only Verification

| Check | Result |
| --- | --- |
| HTTPS CONNECT for all supplied proxies | 100/100 pass |
| Ink eth_chainId, one check per proxy | 100/100 pass, expected 0xdef1 |
| Native KPEPE historical prices, one check per proxy | 100/100 pass |
| Base, Arbitrum, Ethereum, Monad RPC | HTTP 200, expected chain IDs |
| Solana public RPC getVersion | HTTP 200, valid JSON |
| Pyth Hermes feed metadata | HTTP 200, nonempty feed list |
| Pacifica /info/prices | HTTP 200, valid JSON |
| Bulk and Katana markets | HTTP 200, nonempty market arrays |
| DomFi markets and Hyperliquid prices | HTTP 200, valid JSON |
| Original Pyth history through a proxy | Still 404; not a proxy connectivity fault |

All provider-matrix requests were observed using a proxy, with no transport
failures or direct fallback in that run. An initial manual Pacifica probe used
/prices, got 404, and was corrected to the existing adapter's /info/prices;
there was no Pacifica adapter bug or endpoint change.

These are point-in-time checks, not a guarantee of future provider availability
or verification of every market operation on every exchange.

## Behavior, Regression and Build Checks

- Final combined suite: 70 passing checks covering native candles, chart
  behavior, public proxy policy/transport, browser relay/Axios, existing
  Hibachi proxy behavior, private prefetch, theme and position actions.
- Shared proxy transport's 20 checks also pass under Node 20.
- Production web build passes; existing large-chunk warning remains.
- Full web lint: 0 errors, 132 pre-existing warnings.
- Node syntax and git diff --check pass.
- Frontend JS credential scan: no Webshare credentials found.
- Actual browser shows native BTC/KPEPE/PENGU/KBONK charts, interval changes,
  visible simulated-outage state and working Retry chart.
- Browser public RPC returned visible "Ink chain: 0xdef1 · proxy".
- No live trade/signature or production smoke is claimed.

## Reproduction Helpers

- node --test server-futures/test-nado-candles.js web/test-nado-chart.mjs
- node --test server-futures/test-public-read-proxy.js web/test-public-read-fetch.mjs
- node tools/codex/test-public-read-proxies.cjs --file "<owner proxy file>" --all
- node web/tests/nado-chart-preview.mjs (localhost only; public reads).

## Handoff

All changes remain local and uncommitted. No push, production deploy, restart,
production data update, treasury action or trading action was performed.
For a future approved release, configure an absolute Linux server proxy file
or reuse the already configured HIBACHI_PROXY_FILE; never deploy the Windows
local env file. Deploy the new server relay and client together.
