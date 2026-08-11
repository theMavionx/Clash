## Hotfix: Phoenix Isolated Limit Order Payload

Date: 2026-08-11
Severity: S2
Reporter: Papa via owner
Status: APPROVED FOR DEPLOYMENT

### Problem

Players with an existing Phoenix position cannot place an isolated limit order.
Phoenix rejects `POST /v1/ix/place-isolated-limit-order` with HTTP 400 and reports
that neither a complete `price_in_ticks`/`num_base_lots` pair nor a complete
`price`/`quantity` pair was supplied.

### Root Cause

The Phoenix instruction API treats its two supported sizing forms as mutually
exclusive. Clash sent the decimal pair (`price`, `quantity`) and also appended
`priceInTicks` from the already-quantized order packet, but omitted the matching
`numBaseLots`. The resulting mixed payload fails Phoenix validation even though
the decimal pair is otherwise complete. A live read-only instruction-builder
probe reproduced HTTP 400 for the mixed request and HTTP 200 for either exact
pair.

### Fix

Use the exact native pair from the Phoenix order packet:
`priceInTicks` plus `numBaseLots`. Do not send decimal `price` or `quantity` on
the isolated-limit API path. Validate both native values as positive safe
integers before making the request. This applies equally to isolated limit
orders with and without attached TP/SL.

### Testing

- Added and passed `npm run test:phoenix-isolated-limit`.
- Passed existing Phoenix fee/PnL and all-venue PnL regressions.
- Passed full frontend ESLint with zero errors (pre-existing warnings remain).
- Passed full Vite production build.
- Passed the repository's complete `Deploy` preflight, including server,
  combat, Godot, ESLint, and production web-build gates.
- Live Phoenix SDK instruction-builder smoke returned HTTP 200 / four valid
  instructions for the native isolated-limit request.
- The full market-metadata/order-packet path returned native BTC fields
  `priceInTicks=60000`, `numBaseLots=10` and four valid instructions.
- The configured Flight smoke retained the builder wrapper program
  `F1ightu9cujFYo34k9CabifLrJT8qzfDVM2Q7BqhJn2W` in the returned instructions.
- Live Phoenix SDK instruction-builder smoke returned HTTP 200 / four valid
  instructions for the native isolated-limit-with-conditionals request.
- No transaction was signed or submitted during the live probes.

### Approvals

- [x] Fix reviewed by lead-programmer
- [x] Regression test passed (qa-tester)
- [x] Release approved (producer)

### Rollback Plan

Revert the isolated-limit hotfix commit from `main`, rebuild the web bundle, and
redeploy the previously healthy production revision `7e895f3b`. No database
migration or production data mutation is part of this hotfix.

### Post-Incident Review

Schedule within 48 hours of deployment.
