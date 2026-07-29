# Troop Town Hall Level and Win-Rate Rebalance

**Date:** 2026-07-28
**Runtime sources:** `server/db.js`, `server/combat_defs.js`,
`scripts/building_system.gd`, `scripts/base_troop.gd`
**Verification source:** `tools/pvp-balance/run.js`

## Progression contract

The effective primary troop level is capped by the current Town Hall:

| Town Hall | Maximum effective troop level |
| ---: | ---: |
| 1 | 1 |
| 2 | 2 |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 |
| 7+ | 7, until additional authored troop levels exist |

This cap is authoritative in upgrade validation, API reads, combat replays,
matchmaking power, Godot UI state, and React UI state. Legacy rows above the
cap are retained but cannot provide active power before the Town Hall reaches
the stored level.

## Balance targets

- TH1-TH4: 60-70% attacker wins for a maxed same-TH army.
- TH5-TH7: 55% attacker wins, enforced with a 53-57% same-TH iteration
  band.
- No invalid authoritative replays.
- Every generated legal base must have at least one valid same-TH counter at
  common NFT rarity.

## Effective primary-troop curve

Primary deployed troops apply one shared HP/damage multiplier after their
authored unit-specific level stats:

| Troop level | Multiplier |
| ---: | ---: |
| 1 | 0.82 |
| 2 | 0.82 |
| 3 | 1.20 |
| 4 | 1.85 |
| 5 | 1.68 |
| 6 | 1.63 |
| 7 | 1.80 |

The resulting HP and damage remain monotonic for every primary troop. Attack
speed, movement, range, targeting, slot cost, and special mechanics are not
changed. Necromancer Skeletons, Windlings, and Skeleton Barrel helpers keep
their separately authored values. Horror's root and split descendants all use
the primary curve because the full `1 -> 2 -> 4` family is one deployed troop.

## Simulator corrections

The balance lab now:

- caps every generated troop level at the attacker's Town Hall;
- can force `--same-th-only` and `--attack-level-profile maxed`;
- uses the real ship capacity for each Town Hall instead of 45 slots at every
  tier;
- passes the correct Main Ship level into the authoritative replay verifier;
- distributes archetypes and five base-level profiles independently per Town
  Hall, preventing tier/profile correlation.

## Final deterministic result

Seed 42 used 350 unique bases and 1,400 authoritative replays, exactly 200
samples per Town Hall apart from deterministic coverage rounding:

| Matchup | Battles | Attacker win rate | Target |
| --- | ---: | ---: | --- |
| TH1 -> TH1 | 203 | 67.0% | 60-70% |
| TH2 -> TH2 | 198 | 62.1% | 60-70% |
| TH3 -> TH3 | 198 | 65.7% | 60-70% |
| TH4 -> TH4 | 197 | 69.5% | 60-70% |
| TH5 -> TH5 | 201 | 51.7% | 45-55% |
| TH6 -> TH6 | 200 | 49.5% | 45-55% |
| TH7 -> TH7 | 203 | 53.7% | 45-55% |

All 1,400 replays were valid. A second seed with 700 replays produced 58.3%
overall wins and no invalid replays; per-tier variance was wider at roughly
100 samples, while the combined early and late tier averages remained aligned
with the intended bands.

## Interpretation

This curve deliberately strengthens offense instead of weakening Cannon or
Archer Tower parity. It resolves the defense-only power spikes at TH5-TH7
while preserving unit roles and the requested defense identities. The broad
lab still contains intentionally weak pure armies and intentionally weak or
maxed base profiles; those are retained as stress cases rather than tuned out
of the sample.

## 2026-07-29 TH5-TH7 final checkpoint

The production values were refined against 300 organized bases, 500 main
attack policies, 100 spawn mechanics, and a separate breakability catalog of
1,500 policies: exactly 500 per Town Hall. The breakability probe uses common
NFT rarity and does not contribute battles to the reported population win
rate.

Two independent seeds produced:

| Seed | TH5 | TH6 | TH7 | Overall main sample | Unbreakable bases |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 70001 | 54.55% | 55.18% | 56.32% | 55.52% / 5,000 | 0 / 300 |
| 70002 | 54.66% | 55.99% | 54.46% | 55.26% / 5,000 | 0 / 300 |
| Combined | 54.60% | 55.59% | 55.39% | 55.39% / 10,000 | 0 / 600 |

Both runs had zero invalid, untested, or invalid-only breakability cases and
zero critical balance findings. The strict gate treats any TH5+ tier outside
53-57%, any unbreakable base, incomplete breakability coverage, or invalid
probe battle as a failed run.

The last unresolved maxed TH7 crossfire layout reached 5.34% Town Hall HP with
a legal common pure-Mimic counter. Raising only Mimic L7 raw damage from 643 to
700 (effective damage 1,286 to 1,400 after the shared L7 multiplier) made the
layout breakable while moving TH7 by only +0.24 percentage points on the
higher holdout seed.

The simulator now:

- separates the 500-policy population sample from the larger breakability
  catalog, so counter-search battles cannot inflate the reported win rate;
- calibrates elite same-TH attacks, exhausts the remaining candidate policies
  only for unbeaten bases, and then crosses the closest valid army with every
  legal spawn/tactic combination;
- derives tactic availability from the authoritative Main Ship unlock flags;
- classifies valid wins, invalid-only, untested, rescued, and unbeaten bases
  separately and enforces a runtime classification invariant;
- fixes troop-level seeds across adaptive spawn/tactic variants, preventing a
  mixed-profile counter from winning through a different random level roll.

The deterministic counter search proves that a legal winning policy exists;
it does not claim that the counter has a high population win rate. Maxed
defense profiles remain intentionally much harder than the mixed population
and should still be surfaced selectively by matchmaking.

## 2026-07-29 all-unit role checkpoint

This checkpoint supersedes the earlier Mimic/L7 values above. After adding
capacity-filled army templates and exhaustive top-three distinct-army
counter-search, the final shared level-7 curve is `1.74x`, Archer level 7 is
authored at `1164 HP / 250 damage`, and Mimic level 7 is authored at
`11200 HP / 870 damage`.

Two strict actual-code holdouts produce:

| Seed | TH5 policy WR | TH6 policy WR | TH7 policy WR | Final unbeaten |
| ---: | ---: | ---: | ---: | ---: |
| 83003 | 55.24% | 55.12% | 56.83% | 0 / 300 |
| 83004 | 55.24% | 56.62% | 55.67% | 0 / 300 |
| Combined | 55.24% | 55.87% | 56.25% | 0 / 600 |

All current ordinary units pass the equal-slot role corridor. Common NFT pure
armies remain modestly stronger, while paired Epic/Legendary rarity lifts are
only 0.83-1.33 percentage points. The two reports contain 69,155 replay
executions with zero invalid or critical results. Full evidence and residual
TH8-TH10 projection limits are recorded in
`production/reports/all-unit-role-utility-balance-check-2026-07-29.md`.
