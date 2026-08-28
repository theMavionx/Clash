# Balance Check: Hibachi Ranked Raid Limits

**Date:** 2026-08-27  
**Tournament:** `27` — Clash of Perps x Hibachi Trading Competition

## Data Sources Analyzed

- Production tournament configuration and current UTC-day raid counters
- `server/ranked_raid_tournaments.js`
- `server/raid_trophy_progression.js`
- `server/db.js` Altar Glory values
- `design/balance/raid-trophy-progression-2026-07-29.md`
- `design/balance/production-winrate-and-ranked-power-fit-2026-08-27.md`

## Health Summary: CONCERNS

The requested configuration is internally valid when the attack and defense
capacities both move from 20 to 50. Enabling Altar without a tournament cap
would expose the global Glory values of +5, +7, and +10. A dedicated ranked
Altar cap of +5 keeps all owned Glory levels useful while preventing the higher
levels from widening the event score gap beyond the owner's requested value.

## Outliers Detected

| Item/Value | Previous | Requested | Impact |
|---|---:|---:|---|
| Attacks per player / tournament round | 20 | 50 | 2.5x more attempts |
| Defenses per player / tournament round | 20 | 50 | Keeps server fairness invariant valid |
| Ranked Altar bonus | Disabled | Enabled, max +5 | Up to 250 extra trophies across 50 wins |
| TH5 perfect daily offense | 600 | 1,750 | 1,500 base + 250 capped Altar |

## Degenerate Strategies Found

- The production review still shows homogeneous maxed armies, especially Fire
  Dragon stacks, at very high win rates. More daily attempts amplify the value
  of that advantage even though adaptive ranked matchmaking remains enabled.
- Uncapped Glory would add +10 per win at level 3, or 500 trophies across 50
  wins. The +5 tournament cap removes that extra progression-based spread.

## Progression Analysis

The Altar cap is tournament-specific. It does not downgrade the player's Altar,
change ordinary raid rewards, or modify previously finalized tournament raids.
At Glory levels 1–3 the ranked bonus resolves to +5, +5, and +5 respectively;
players without Glory still receive +0.

## Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| Applied | Altar only had an on/off switch | Add per-tournament cap; set Hibachi to 5 | Matches requested ceiling |
| Applied | Attack 50 with defense 20 violates config invariant | Set both capacities to 50 | Keeps target availability valid |
| Monitor | 50 attempts amplify high-win armies | Review daily win rate and trophy concentration | Detect runaway standings early |

## Values That Need Attention

- Tournament `27`: attack limit `50`, defense cap `50`, Altar enabled, Altar cap `5`.
- Existing completed raid rows remain immutable; the new rules apply only when
  reserving/finalizing subsequent raids.

## 2026-08-28 Round-Boundary Correction

The tournament's daily-pool cutoff is `22:00 UTC`, so its competitive day is
`22:00 -> 22:00`, not the UTC calendar day. Ranked raids previously reset their
quota and wrote daily activity at `00:00 UTC`. That split one competitive round
across two storage keys and made current-round trophies appear frozen after
midnight even though the lifetime tournament ledger was still credited.

Ranked quotas, repeat-opponent checks, defense capacity, battle-session metadata,
and daily activity now share the daily-pool round key. This does not change the
50-attempt ceiling, trophy values, Altar cap, or total credited trophies. The
historical reconciliation only moves existing event rows between round buckets
and forces recalculation of an already-closed pool, preventing both missing and
double-awarded points.
