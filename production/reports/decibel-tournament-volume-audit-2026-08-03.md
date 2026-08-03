# Decibel Tournament #24 Volume Audit — 2026-08-03

## Scope

- Audited every active participant in Decibel Trading Competition #7 Daily Edition.
- Compared tournament credits with Decibel regular trade history and bulk-fill history.
- Required an existing approved order proof or an exact Aptos `TradeEvent` with an allowed
  Clash builder and a positive builder fee.
- Excluded fills that could not be tied to the Clash builder.

## Production Corrections

The corrections are append-only and idempotent under source
`decibel_onchain_audit_v2`. They add volume only; they do not invent trade count or PnL.

First audit correction: **$135,388.130247** total.

| Player | Proven missing volume added |
|---|---:|
| 0xtuananh | $32,679.745191 |
| Clashbot | $24,345.720243 |
| Michael | $22,393.247461 |
| monomono | $5,024.786900 |
| okcrypto | $49,691.807266 |
| Onimu | $27.631750 |
| Winterghost | $1,193.694000 |
| zorro | $31.497436 |

The claim that zorro was missing roughly half of the account volume was not supported by
the exact fill audit. The proven deficit at that cutoff was $31.497436.

A second fixed-cutoff audit at `2026-08-03T07:27:55.374Z` found one additional net
displayed-volume gap for Clashbot: **$1,999.563700**. After correction, Clashbot's
tournament volume at the cutoff was **$70,361.115556**, equal to the proven upstream total.

Total proven volume added across both corrections: **$137,387.693947**.

Backups:

- `/opt/clash/shared/backups/decibel-tournament-24-volume-20260803070107363-before.json`
- `/opt/clash/shared/backups/decibel-tournament-24-volume-20260803073200096-before.json`

No negative adjustments were applied. Eleven unproven/different-builder fill groups were
excluded rather than credited. An old Clashbot bulk-fill duplicate remains visible in legacy
credit history; the correction used the net displayed deficit, so it did not amplify that
duplicate.

## Root Cause

1. Regular fills were aggregated by order/client order ID and inserted with
   `INSERT OR IGNORE`. Later partial fills for an already-seen order could not increase the
   recorded notional.
2. Market and IOC orders were excluded from the durable limit-fill reconciliation path.
3. Decibel 128-bit order IDs were written into a SQLite numeric-affinity column, allowing
   precision loss and incorrect order-proof matching.
4. A fixed recent-row lookback had no persistent cursor, so a sufficiently long API outage or
   process downtime could leave older fills outside the next polling window.

## Durable Fix

- One canonical row per immutable Decibel `trade_id`:
  `decibel:trade-fill:<trade_id>`.
- Partial, Market, IOC, limit, close, and trigger fills use the same exact-fill ledger.
- Exchange IDs remain strings in the canonical key and proof JSON; the unsafe numeric
  `order_id` path is no longer used for Decibel reconciliation.
- A persisted per-subaccount cursor, thirty-minute overlap, and bounded pagination catch up after
  restarts and temporary 401/429/API failures.
- A failed/incomplete page holds the cursor instead of silently advancing it.
- Stored builder-order proof is preferred; when necessary, the worker verifies the exact fill
  directly against the Aptos `TradeEvent` and requires a positive fee for an allowed builder.
- Bulk market-maker fills remain owned by the separate exact bulk-fill ledger, preventing
  regular/bulk double counting.
- The fixed audit cutoff and new-ledger cutover are adjacent milliseconds, leaving no
  unowned deployment window.

## Verification

- Exact-fill reconciliation regression: partial fills, Market/IOC, large IDs, idempotent retry.
- Pagination regression: multi-page catch-up and truncated-page cursor hold.
- API degradation regression: 401/429-style failure does not advance the cursor.
- Direct Aptos builder-fee proof regression.
- Immediate route regression: two partial fills create two exact rows; retry creates none.
- Existing Decibel bulk, TP/SL builder lifecycle, and verified-upsert tests pass.
- Full repository deploy preflight, web lint, and production web build pass.
