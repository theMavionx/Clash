# Late-building strength rebalance — 2026-08-01

## Goal

Bring max-level TH5, TH6, and TH7 attacks against genuinely difficult ranked bases
into the configured 55–60% attacker-win band without increasing attack speed, weakening
troops, or turning the full matchmaking catalog into deliberately easy bases.

The exact production Digger layout was also retained as a separate release gate because
it originally behaved like a nearly unbreakable TH7 base despite not being fully maxed.

## Root cause

Geometry and authored level profiles affected difficulty as much as raw building stats.
An old temporary production report marked some under-levelled bases as `maxed`, while
the current matchmaking generator actually creates 360 hard TH5 layouts and 720 hard
layouts at both TH6 and TH7 with defenses at their legal Town Hall caps.

The existing casual strong-player path already restricted challenge matches to the
empirically difficult `corner-keep` and `rear-keep` archetypes. Ranked bot selection did
not apply that filter and could draw from the whole normal/hard catalog. Ranked now uses
the same validated hard challenge geometries, still enforces exact Town Hall matching,
and keeps the one-defender-per-day rule.

## Balance changes

- TH1–TH4 combat and building HP are unchanged.
- TH5 and TH6 durability and defense damage are reduced more than TH7 because their
  challenge geometries were materially harder for equal-TH maxed armies.
- TH7 receives a smaller reduction relative to the old production curve so the broad
  challenge pool and the exact Digger layout converge on the same target band.
- Every damage and HP progression remains monotonic. No upgrade lowers a stat.
- Defense fire rate, range, targeting rules, projectile behavior, and splash radii are
  unchanged.
- Troop stats and Skeleton Guard stats are unchanged. This also avoids indirectly
  changing Necromancer summons, which share the guard table.
- Harpoon keeps its long-range control identity. L6 and L7 still survive the first
  same-level Fire Dragon direct hit and require a second hit to be destroyed.
- Existing database rows are normalized to authored HP on startup while preserving the
  current health percentage.

## Balance-lab support

The deterministic balance runner now supports:

- direct replay of the current in-code matchmaking pool with
  `--bot-template-difficulty`;
- exact archetype filtering with `--base-archetypes`;
- imported-base HP normalization;
- separate lab-only building HP and late-defense damage scales.

This prevents stale JSON snapshots from being mistaken for the current production bot
pool and makes ranked challenge bases directly reproducible in the balance lab.

## Final verification

The broader cohort below records the original late-building checkpoint. It is
superseded for release by the real-combat/FPS pass after movement-parity and
slot-capacity corrections. The release cohorts are TH5 55.1%, TH6 53.7%, TH7
56.6% (56.3% combined over 1,800 battles), with Digger at 53.9% over 800
battles and zero invalid results. See
`production/reports/th5-th7-real-combat-fps-balance-2026-08-01.md`.

All results below use final production values with no lab multipliers, maxed equal-TH
attack levels, deterministic attack-policy populations, and zero invalid battles.

| Cohort | Bases | Battles | Attacker wins | Invalid |
|---|---:|---:|---:|---:|
| Ranked hard challenge TH5 | 40 | 2,000 | 58.6% | 0 |
| Ranked hard challenge TH6 | 80 | 2,000 | 59.5% | 0 |
| Ranked hard challenge TH7 | 77 | 2,000 | 58.3% | 0 |
| Exact live Digger layout | 1 | 1,200 | 56.1% | 0 |

The TH7 challenge catalog contains 77 currently valid unique layouts after filtering;
ranked matchmaking exposes the available, non-reserved members of that pool and does
not repeat a defender for the same attacker within the UTC day.

Focused server combat/progression tests, client/server stat parity, ranked exact-TH
matchmaking tests, the full raid-bot-pool test, Godot TH7 progression, Cannon behavior,
and Cannon level/visual tests all pass.

## Result

The difficult ranked cohorts now sit between 56.1% and 59.5% attacker wins. TH5–TH7
remain challenging, Digger is no longer nearly impossible, and ranked players receive
varied hard exact-TH opponents instead of weak or mislabeled layouts.
