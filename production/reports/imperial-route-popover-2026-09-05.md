# Imperial compact routing and order side correction — 2026-09-05

## Findings and changes

- Shared ticket Long/Short passes bid/ask. Imperial getRoute accepted only
  long/short, so both market and limit submissions failed before order creation.
  The client now maps the values; server normalization also supports older clients.
- Auto-route was static text; candidate buttons only expanded fees. The new
  compact trigger sits at the top of the order ticket, before Market/Limit
  and immediately after the chart in the mobile layout. Native modal dialogs
  provide venue selection, fee details, exclusions and trading profile.
- Manual venue and exclusions are passed to both preview and fresh server
  routing. Numeric Jupiter ID 0 is preserved. Server refuses an unexpected
  substituted venue or a clamped leverage before submitting an order.
- Removed the separate boost toggle. Loan amount is derived exclusively from
  the fresh Imperial route. The route's native maxLeverage no longer shrinks
  the client's effective leverage slider.
- Phoenix, Jupiter, Flash/Flash V2 and GMTrade use local logos; Imperial Pairs
  and Touch use the Imperial mark.

## Official contract evidence

- https://api.imperial.space/api/v1/openapi.json : GET /api/v1/route defines
  stickyVenue, excludedVenues, desiredLeverage, wallet/profileIndex and native
  venue caps. Existing positions can override exclusions.
- Live public SOL long quote, notional USD 100, desiredLeverage 50:
  Phoenix native cap 24.78, clamped=false, loanSplit.loanAmountUsd=2.75,
  requiredDeposit.requiredDepositUsd=2.00. Pinning Jupiter returned Jupiter;
  excluding Phoenix returned Jupiter; clearing exclusions restored Phoenix.
- Official https://www.imperial.space/perps/sol client bundle
  0vtznbap1vmg5.js was inspected on 2026-09-05. It computes reach and safer-liq
  loan splits and serializes loanAmountUsd to micro-USD when a split is present.
  This is not simply a toggle activated only above the venue's native cap.
- OpenAPI still omits loanAmountUsd from MobileCreateOrderRequest although the
  official client sends it and the live route returns loanSplit. This preexisting
  schema gap remains; funded end-to-end loan execution was not tested.

## Verification

- Server adapter: 18 tests, including both order types × bid/ask, Jupiter=0,
  fresh automatic loan, exclusions reset, CLASH attribution, fail-closed
  venue substitution/clamping, preflight and TP/SL regressions.
- Client: 5 tests, including directional mapping and credential/account tests.
- Browser: actual useImperial hook + actual route UI and server adapter in
  web/tests/imperial-route-preview.mjs. Quotes use live public Imperial reads;
  authenticated order preflight/submission are mocked, never sent externally.
  Market Long Jupiter -> side 0, underwriter 0; limit Short Jupiter -> side 1,
  underwriter 0, orderType 1; Phoenix 50x -> loanAmountUsd 2750000, collateral
  2000000, builder CLASH. Manual/auto switch, exclusion/restore, fee details,
  Escape and close tested. Responsive viewport checks at 320, 390 and 1280.
- Canonical Deploy preflight passed (existing lint/chunk warnings remain).
- No real wallet signatures, funded trades, or player database changes.
