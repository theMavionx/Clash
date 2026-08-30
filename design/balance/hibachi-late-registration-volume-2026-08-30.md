# Balance Check: Hibachi Late-Registration Trade Credit

**Date:** 2026-08-30  
**Tournament:** `27` — Clash of Perps x Hibachi Trading Competition

## Data Sources Analyzed

- Production tournament `27` configuration and daily-pool awards
- Production `trade_history`, `tournament_trade_credits`,
  `tournament_daily_activity`, and `tournament_participants` rows for Tango
- `server/db.js` tournament trade-window and idempotent credit ledger
- `server/test-tournament-trade-credit-sync.js`
- `design/balance/hibachi-ranked-raid-config-2026-08-27.md`
- No relevant tournament-scoring document exists under `design/gdd/`, and the
  project has no `assets/data/` directory.

## Health Summary: HEALTHY

Tournament `27` can opt in to credit verified trades from the configured
tournament start rather than the player's later registration timestamp. The
default for every other tournament remains registration-bounded. Tournament
end, player leave time, pause periods, DEX eligibility, exact-fill proof, and
duplicate guards remain enforced.

## Outliers Detected

| Item/Value | Expected Range | Actual | Issue |
|---|---:|---:|---|
| Tango pre-registration delay | Minutes | 4m 36s | Short registration delay excluded a large imported batch |
| Verified fills excluded | 0 after opt-in | 76 | All occurred after tournament start |
| Verified volume excluded | $0 after opt-in | $138,759.861449 | Exact rows were blocked only by `joined_at` |
| Day `2026-08-25` volume before correction | — | $4,683,384.381384 | Existing awarded denominator |
| Day `2026-08-25` volume after correction | — | $4,822,144.242833 | Adds only Tango's exact volume |

## Degenerate Strategies Found

- Enabling this rule globally would let future players register late after
  seeing standings and still import earlier activity. The implementation avoids
  that by requiring an explicit per-tournament opt-in.
- Directly adding participant volume would bypass the per-fill ledger and risk
  duplicate credit. Reconciliation instead inserts the 76 exact trade IDs into
  `tournament_trade_credits` and derives participant totals from those rows.

## Progression Analysis

The closed day `2026-08-25` has a fixed 840-point volume pool. After including
Tango, the player owns 2.877555% of the day's eligible volume and receives an
expected 24.171464 volume points. Existing volume awards decrease
proportionally; the total daily pool remains 840 points, so the correction does
not inflate the tournament economy.

## Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| Applied | Verified pre-registration fills were excluded | Enable `credit_trades_from_tournament_start` only for tournament `27` | Credits exact in-window activity |
| Applied | Closed daily points used the old denominator | Force-recalculate day `2026-08-25` after ledger reconciliation | Keeps the fixed pool zero-sum |
| Applied | Manual total edits could duplicate later syncs | Reconcile through `tournament_trade_credits` | Idempotent on repeated runs |
| Monitor | Future late-registration policy | Keep opt-in disabled by default | Prevents unintended retroactive eligibility |

## Values That Need Attention

- Tango corrected tournament totals should be 210 trades and
  `$140,539.384790` volume before any later authenticated Hibachi backfill.
- Tango expected awarded points after the forced closed-day recalculation:
  existing `12.047661` plus approximately `24.171464`, subject only to exact
  persisted rounding.
- No lifetime trading Gold is changed by this tournament-only correction.
