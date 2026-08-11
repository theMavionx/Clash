# Ondo Perps integration verification — 2026-08-11

## Scope

- Ethereum wallet login through Ondo's SIWE challenge and JWT session flow.
- Public markets, marks, volume, open interest, order book, candles, funding, and WebSocket updates.
- Account, balances, positions, open orders, fills, funding history, leverage, TP/SL, cancel, deposit, address-book setup, and withdrawal.
- Market and limit orders with a server-enforced Ondo builder payload.
- Clash fill import, earnings snapshots, balance telemetry, tournament/reward proofing, and admin exchange filters.
- Official Ondo Perps favicon stored locally as `web/public/ondo-perps.svg`.
- Ondo-only regional access gate for the United States, Canada, U.S.
  territories, comprehensively sanctioned countries, and restricted Ukrainian
  regions, enforced in both React and private server routes.

## Builder routing

The browser cannot supply or override builder attribution. `server-futures/ondo.js` removes any client-provided builder fields and, once `ONDO_PERPS_BUILDER_CODE` is configured, injects:

```json
{
  "builderCode": {
    "code": "<server configured code>",
    "feeRateBps": 1
  }
}
```

The fee is hard-locked to 1 bps. Clash records the accepted order ID and only imports fills whose wallet/order proof matches the stored builder-routed order. Child fills can also match their official `parentOrderID`.

## Official-contract audit

- Compared against the official integration guide, REST OpenAPI, and WebSocket specification published by Ondo Perps.
- All 20 REST endpoint/method pairs used by Clash exist in the official specification.
- Corrected JWT invalidation to the official `GET /v1/auth/invalidate_jwt` method.
- Corrected the authenticated-session shape so the normalized wallet address cannot be overwritten by the raw account object. This protects builder proofs, fill imports, and withdrawal address-book calls.
- Terms acceptance is now idempotent for accounts that already accepted the required versions and fails closed for a real onboarding error.
- Concurrent route authorization now shares one `/v1/account` read, and the account summary no longer duplicates the dedicated positions/orders requests.
- `clientOrderId` now enforces Ondo's alphanumeric/underscore/dash and 64-character contract.
- Fill pagination follows `nextCursor`; a short page can no longer prematurely stop reward ingestion.
- The browser heartbeat follows the official ping shape and cadence, and the order book now uses the official `depthBooksPerps` stream with a REST snapshot fallback.
- Flip fills now display the side that was closed (`flipLongToShort` closes long, `flipShortToLong` closes short).
- EVM registration uses Ethereum mainnet, and Ondo account balances are included in shared balance telemetry.

## Verification evidence

- `server-futures`: `npm run test:ondo` — PASS.
  - 37 enabled markets, 40 mark prices, 5 bid + 5 ask levels from REST, and 5 + 5 from `depthBooksPerps`.
  - Public WebSocket mark, funding, depth, and heartbeat received live data.
  - Client builder overrides were rejected and the server fee remained exactly 1 bps.
  - Session identity preserves the EVM owner and JWT invalidation uses GET.
- `web`: `npm run test:ondo` — PASS.
  - Tick/step alignment, order schema, official WS heartbeat, wallet-scoped JWT storage, balance telemetry, and server-only builder routing.
- `web`: `npm run test:position-pnl` — PASS for all 19 venues.
- `web`: `npm run build` — PASS.
- Node syntax checks for the Ondo adapter and central route/database files — PASS.
- Local browser guest flow — PASS through venue selection and the Ondo login screen.
  - Correct label: `Ethereum · SELF-CUSTODY · EVM`.
  - Official logo rendered.
  - Email and Ethereum wallet login options rendered without application errors.
  - Only the expected localhost Privy iframe warning was present.

### Regional access verification

- A local edge-country simulation for `US` showed the blocking screen before wallet/email login and prevented the private Ondo flow from starting.
- The unauthenticated eligibility endpoint reported `allowed: false`; a direct private Ondo config request returned HTTP `451` before authentication.
- A local edge-country simulation for `DE` showed the normal Ondo email/wallet login screen.
- The registration flow also completed correctly when Ondo was selected before the asynchronous region check had settled.
- Pacifica still entered its normal sign-in flow, confirming that the gate is scoped to Ondo only.
- Country/region values are accepted only from trusted edge headers; arbitrary client country headers are ignored.
- Production fails closed with an unavailable/retry state when Cloudflare does not provide a usable country code; local development keeps its explicit test override.

## Remaining external activation

Ondo has not issued the builder code yet, so no real builder-routed order was submitted. After Ondo activates the builder account:

1. Set `ONDO_PERPS_BUILDER_CODE` in the production futures service environment.
2. Restart/deploy the futures service.
3. Confirm `/api/futures/ondo/config?dex=ondo` reports builder routing as configured for the signed-in owner.
4. With explicit owner authorization, submit one minimal order and verify the stored order proof and resulting fill attribution.
