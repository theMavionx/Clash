# Decibel MM bulk-volume reconciliation — 2026-08-03

## Production audit

- Player: `Clashbot` (`62364127-cf8b-4cd1-b044-52fa2833d871`).
- Tournament: `#24 Decibel Trading Competition #7 Daily Edition`.
- Tournament window: 2026-07-31 22:00:00 UTC through 2026-08-07 22:00:00 UTC.
- Existing regular Decibel credit: 6 fills / $5,311.974101.
- Existing manual bulk ledger: 32 fills / $11,922.725767.
- Decibel bulk ledger at audit time: 49 eligible fills / $18,518.036474.
- Missing after the earlier day-one correction: 17 fills / $6,595.310707, all on 2026-08-02 UTC.

The 17 missing fills line up with the recorded Phantom `symmetric_mm:decibel:BTC-USD`
run on 2026-08-02. Phantom's production database has the strategy lifecycle but does not
persist `orders` or `fills`, so its process-local volume counter is not acceptable as a
reward source.

## Verification rule

`server-futures/decibel-bulk-rewards.js` accepts a bulk fill only when all of the following
hold:

1. Decibel's authenticated `bulk_order_fills` response names the player's active Phantom
   Decibel subaccount.
2. The Aptos transaction contains the matching `BulkOrderFilledEvent` by fill id, account,
   and market.
3. The same transaction contains the maker-side `TradeEvent` for that account and fill.
4. The event routes a positive builder fee to an allowed Clash Decibel builder subaccount.

The production sample checked during the audit routed to the active Clash builder subaccount
at 1 bps. Missing, malformed, wrong-account, wrong-market, taker-side, or wrong-builder events
are rejected.

## Durable flow

- The Decibel rewards worker resolves the player's tenant-scoped Decibel account through the
  trusted localhost Phantom API.
- Verified bulk fills are idempotently imported into `server-futures/trade_history` as
  `verified_source='decibel_fill'`, with the on-chain fill id and builder proof in `proof_json`.
- Existing reward, quest, gold, and tournament readers can consume those rows normally.
- Tournament synchronization skips a trade-history row when its bulk fill id already exists
  in the legacy `decibel_bulk_fill` ledger. This preserves the earlier 32-fill correction
  without double-counting it.
- `deploy/reconcile-decibel-bulk-volume.js` provides an explicit dry-run/apply path for an
  immediate, idempotent production reconciliation after deployment.

## Expected post-reconciliation tournament total

Provided no additional fill lands between the audit and apply step, the expected total is
55 trades / $23,830.010575: 6 regular fills plus 49 bulk fills.
