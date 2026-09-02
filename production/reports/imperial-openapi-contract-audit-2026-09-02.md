# Imperial API contract audit — 2026-09-02

## Result

All 30 Imperial API operations used by Clash were compared against the live
production OpenAPI document at
`https://api.imperial.space/api/v1/openapi.json`. Every method and path exists.
Authenticated routes use the Imperial JWT and public reads remain wallet-scoped.
No funded transaction was submitted during this audit.

The live `CLASH` builder lookup returned:

- code: `CLASH`
- builder name: `Clash of Perps`
- active: `true`
- fee: `10 bps` on open and close legs
- accrued / paid / claimable: `0 / 0 / 0` USDC at audit time

A live public route quote for SOL, $100 notional, 2x long returned Phoenix,
`self_funding`, maximum leverage `24.78x`, required deposit `$50`, expected cost
`$0.091271`, ILP loan `$2.75`, venue leverage `1.895735x`, and loan rate `1481 bps`.
These are dynamic values and are recorded only as audit evidence, not constants.

## Function-by-function contract matrix

| Clash function | Imperial operation | Auth | Contract result |
| --- | --- | --- | --- |
| `configStatus` health probe | `GET /status` | Public | Match; read-only availability probe. |
| `getBuilderStatus` / earnings | `GET /mobile/builder/summary?code=CLASH` | Public | Match; `feeBps` and 6-decimal `accruedUsdcBase`, `paidUsdcBase`, `claimableUsdcBase` are normalized. |
| `connect` phase 1 | `POST /mobile/connect` | Wallet signature | Match; body is `wallet`, signed message and base58 signature. |
| `connect` phase 2 | `POST /mobile/exchange` | One-time code | Match; `expiresAt` is Unix seconds and is converted correctly by the browser. |
| `revoke` | `POST /mobile/revoke` | JWT | Match. |
| `partnerStatus` | `GET /mobile/partner/registration` | JWT | Match. |
| `registerPartner` | `POST /mobile/partner/register` | JWT | Match; existing attribution is preserved. No partner code is sent unless explicitly configured. |
| `getRoute` | `GET /route` | Public | Match; required `asset`, `side`, `notional`; optional leverage, hold time, wallet/profile and venue controls. Uses documented `stickyVenue`, not obsolete `pinnedUnderwriter`. |
| `placeOrder` preflight | `POST /mobile/orders/preflight` | JWT | Match; a negative `ok` prevents submission. |
| `placeOrder` entry | `POST /mobile/orders` | JWT | Match; server injects `CLASH`, the routed underwriter, fixed-point size/collateral and venue-scaled market price. |
| `placeOrder` + attached TP/SL | `POST /mobile/orders/batch` | JWT | Match; sequential, not atomic. Entry failure skips close legs; close-leg failure is returned as partial success and never hidden. |
| `authoritativePosition` / snapshot | `GET /positions?walletAddress=` | Public | Match; uses `LifecycleResponse`, including `sizeTokenAmount`, `sizeUsd`, `pnlUsd`, Imperial liquidation price and underlying venue. |
| order lookup / snapshot | `GET /orders?walletAddress=` | Public | Match; combines Jupiter and passthrough order lists. |
| `cancelOrder` | `POST /mobile/orders/cancel` | JWT | Match; wallet, authoritative profile and order PDA; child cancellation enabled. |
| `updateOrder` | `POST /mobile/orders/update` | JWT | Match; only documented trigger, size, close bps, slippage and priority fields are forwarded. |
| `editCollateral` | `POST /mobile/orders/collateral` | JWT | Match; market mint/side/profile/underwriter come from the authoritative position; price uses the documented venue scale. |
| `getMarketInfo` / `getPrices` | `GET /mark-prices` | Public | Match. |
| funding snapshot | `GET /funding-rates` | Public | Match; hourly percent is normalized to a decimal rate. |
| Flash price encoding | `GET /flash/markets` | Public | Match; uses each market's `priceExponent`. |
| profile balances | `GET /mobile/balances` | JWT | Match; `profiles[].usdc` is converted from 6-decimal USDC. |
| Flash V2 balances | `GET /mobile/v2/balance` | JWT | Match; `profiles[].availableUsdc` is converted from 6-decimal USDC. |
| snapshot / proof fallback | `GET /trades?walletAddress=` | Public | Match; action-level data is used only when its signature matches a stored Clash order proof. |
| `history` orders | `GET /order-history?walletAddress=` | Public | Match; profile filtering is applied locally. |
| exact reward import | `GET /order-history/{order_pda}` | Public | Match; `sizeUsd`, `price`, `feesUsd` are decimal USD strings and are no longer divided as base units. |
| `history` PnL | `GET /pnl-history?walletAddress=&resolution=` | Public | Match; a required `1h` or `1d` resolution is always sent. |
| `history` funding | `GET /funding-history?walletAddress=` | Public | Match. |
| `buildDeposit` | `POST /deposit/build-tx` | Public build, wallet signs | Match; amount is 6-decimal USDC and response is a base64 `VersionedTransaction`. |
| `depositToV2` | `POST /mobile/v2/deposit` | JWT | Match; amount is 6-decimal USDC. |
| `setMarginMode` | `PUT /passthrough/users/{wallet}/profiles/{index}/margin-mode` | JWT | Match; body is `isolated` or `unified`. |
| `syncProfile` | `POST /passthrough/users/{wallet}/profiles/{index}/sync` | Public | Match; request has no body. |

## Fixed during the audit

1. Replaced the non-contract route query `pinnedUnderwriter` with
   `stickyVenue`, while preserving the old Clash UI input as an internal alias.
2. Added the required per-underwriter `marketPrice` encoding: Jupiter/Phoenix
   `1e6`, GMTrade `1e9`, Flash by `priceExponent`, Flash V2 `0`; limit and TP/SL
   resting orders use `0`.
3. Corrected Imperial session expiry handling from milliseconds-only to Unix
   seconds and made restored sessions fail closed on wallet mismatch.
4. Corrected positions to consume `sizeTokenAmount` and `pnlUsd`.
5. Corrected exact trade import to treat history/action USD fields as decimal
   USD strings instead of guessing base-unit scale.
6. Corrected builder earnings to use the documented 6-decimal USDC base-unit
   fields.
7. Removed a JSON body from profile sync because the operation defines none.
8. Added explicit partial-success handling for non-atomic entry + TP/SL batches.

## Known contract boundary

Imperial's production `/route` currently returns `loanSplit` and the production
client accepts `loanAmountUsd`, but those two ILP boost fields are not declared in
the formal `RouteResult` and `MobileCreateOrderRequest` OpenAPI schemas. Clash
therefore treats them as a narrowly isolated extension: the amount is accepted
only from a fresh server-side route, never from the browser. Standard non-boosted
routing uses only documented fields. A funded boost order remains the one test
that requires an owner-approved wallet transaction.

## Automated evidence

- `server-futures/test-imperial-openapi-live.js`: asserts every operation still
  exists, verifies methods, JWT requirements, required request fields, units,
  response fields, live builder activation, public prices and a public route.
- `server-futures/test-imperial-adapter.js`: verifies routing, preflight,
  server-only builder injection, open/close/TP-SL, partial batch behavior,
  market-price scales, balances and proof-gated volume import.
- `web/test-imperial-client.mjs`: verifies session expiry and wallet binding.
- `server/test-imperial-schema.js`: verifies proof-ledger schema and exact
  deduplication constraints.
- `server/test-imperial-earnings.js`: verifies proof gating and builder base-unit
  conversion.
