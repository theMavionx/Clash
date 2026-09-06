# Imperial SOL TP/SL Custom25

## Summary

- ID: BUG-IMPERIAL-TPSL-CUSTOM25
- Severity: S2-Major; priority: P1; system: Imperial trading integration.
- Reported: 2026-09-06 by owner; baseline: 01a5590c (incident build 31a02aa3).
- Status: corrected locally; production release verification pending.
- Category: API/on-chain contract mismatch. Deterministic for a priced type5
  reaching the passthrough program; historical regression status unknown.

## Reproduction and evidence

Open the existing SOL long on Imperial/Phoenix and submit TP106.67 / SL104.57.
Expected: conditional reduce-only protection. Actual: HTTP400, Custom25,
UnknownTradeFailure, no signature. Client log1636333, 2026-09-06 14:32:03UTC.
Position lifecycle d64e5e33-ad27-413c-bf36-9a7f834a06d0, profile0,
size52.915USD. This is distinct from the earlier zero-size HTTP422.

Read-only mainnet simulation reproduced Custom25 from program
`pASsDHVUtgG5uomQ29SVMv1sQxon4Gi6g5bJV7KKqZ8`, with the explicit log:
`PrivateTpSl must have trigger_price = 0`.

Clash incorrectly combined PrivateTpSl(5) with a public nonzero trigger.
Ordinary priced protection is StopLimit(2), action Decrease(1). Both the
existing-position path and attached-entry close legs shared the defect.
Do not zero the user's trigger to silence this error: that changes semantics.
Do not rely on the documented Phoenix API rewrite: the incident proves the
incompatible shape can still reach the program. The exact stage at which
Imperial's rewrite failed is not visible to Clash.

## Correction

`server-futures/imperial.js` now uses one named StopLimit constant for both
priced protection paths. Wallet/profile/venue ownership, size, closeBps10000,
trigger direction, 1e9 trigger scale, preflight sequencing, partial-failure
disclosure and CLASH builder attribution are unchanged. No order retries,
new endpoints, schema changes, live protection writes or fee changes.

## Verification

- New regression failed on baseline type5, then passed with type2.
- Adapter/import suites:31 tests pass. New matrix covers long/short across
  Jupiter, Flash, Phoenix, GMTrade, Flash V2 and both market/limit attachments.
- Live OpenAPI/CLASH/router checks:2 pass; browser-client contracts:5 pass.
- Opt-in `server-futures/test-imperial-tpsl-simulation-live.cjs` calls the actual
  corrected adapter with intercepted HTTP, serializes its resulting TP/SL
  payloads using the official public SDK layout, and only simulates on Solana.
  At slot444834485, legacy type5 yields Custom25; corrected TP Above and SL
  Below both return err:null and Order created in simulation logs.
- The live order PDA remains absent and user order counter remains1. No
  signatures, broadcasts or fees. This verifies program acceptance of the
  placement shape, not mobile-JWT delegation, builder settlement or future
  trigger execution. It does not install protection on the owner's position.
- Full canonical `check-repo.ps1 -Mode Deploy`: PASS, including backend/exchange
  checks, Godot behavior probes, lint (0 errors;135 pre-existing warnings) and
  production web build. No UI code changed in this correction.

## Primary references

- [Imperial OpenAPI](https://api.imperial.space/api/v1/openapi.json): StopLimit,
  price scales, closeBps and side-effect-free preflight.
- [Official client trading flow](https://imperial.space/_next/static/chunks/0vtznbap1vmg5.js):
  createPassthroughOrder with isTakeProfit uses StopLimit.
- [Official SDK instruction layout](https://imperial.space/_next/static/chunks/16ow2xm6a2j2j.js):
  createOrderIx and createPrivateTpSlOrderIx; the latter explicitly zeroes trigger.
- [Official SDK PDA derivation](https://imperial.space/_next/static/chunks/0n.3fxycnnhg8.js).

## Release

Owner explicitly authorized completing this fix and deploying it. Release uses
the existing canonical scripts; the referenced deploy-clash skill is not present
in the available project skill directories. Production verification pending.
