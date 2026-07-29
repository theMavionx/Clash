# All-Unit Role and Utility Balance Check

**Date:** 2026-07-29
**Verdict:** PASS for the current TH5-TH7 game; TH8-TH10 units pass a
role-aware projection against the current TH7 defense ceiling.
**Authoritative reports:**

- `all-unit-role-balance-final-balanced-seed83003-2026-07-29.{json,md}`
- `all-unit-role-balance-final-balanced-seed83004-2026-07-29.{json,md}`

## Goal

Keep same-Town-Hall attacker wins at 55% +/- 2 percentage points from TH5
onward, make every ordinary unit useful in its authored role, allow NFT units
to be modestly stronger without creating a pay-to-win rarity gap, and prove
that every generated base has at least one legal counter.

Equal usefulness does not mean equal pure-army win rate. Frontline, direct
damage, tank, utility, support, and attrition units are compared by equal ship
slots in otherwise identical attacks. Summons, evolution descendants,
survival, trap interaction, flight, and control remain part of a unit's value.

## Final tuning decision

- The shared level-6 primary-troop curve remains `1.61x`.
- The level-7 curve is `1.74x`. A tested `1.89x` candidate was rejected because
  one holdout reached 58.33% policy wins and another left two TH7 bases without
  a counter after the complete search.
- Archer level 7 is authored at `1164 HP / 250 damage`. Its earlier
  `970 / 208` version was the only ordinary unit whose pooled paired interval
  was conclusively worse than its equal-slot control.
- Mimic level 7 is authored at `11200 HP / 870 damage`. This is a narrow
  TH7-only specialist adjustment: Mimic is the legal counter for the hardest
  compact/asymmetric TH7 layouts, while its pooled ordinary pure-army result
  remains 54.50%.
- NFT rarity ratios remain unchanged. Relative to Common, Epic has `1.025x`
  HP/damage and Legendary has `1.04167x`; cadence, range, movement, and slot
  cost do not improve.

Server and Godot use the same authored values and the same level curve.

## Final authoritative coverage

The two strict holdouts executed 69,155 deterministic server replays:

| Phase | Battles |
|---|---:|
| Population, pure-unit, spawn, tactic, and boost sample | 10,000 |
| Equal-slot role utility | 4,752 |
| Paired NFT rarity | 3,600 |
| Breakability calibration, elite gate, focused rescue, adaptive rescue | 50,803 |
| **Total** | **69,155** |

Coverage includes two independent 300-base catalogs, 500 population attack
policies, 100 spawn mechanics, 12 tactical/boost plans, 19 capacity-filled
core army templates, and up to three closest distinct ordered army templates
per adaptive counter-search.

## Same-TH population result

All policy-exploration cohorts are inside the authored 53-57% band.

| Town Hall | Seed 83003 | Seed 83004 | Pooled |
|---|---:|---:|---:|
| TH5 | 55.24% | 55.24% | **55.24%** |
| TH6 | 55.12% | 56.62% | **55.87%** |
| TH7 | 56.83% | 55.67% | **56.25%** |

Overall population result: `5499/10000 = 54.99%`. Invalid population
replays: `0`.

## Ordinary-unit utility

The paired delta replaces the same number of starter-control slots with the
candidate package on the same base, spawn plan, levels, tactic, rarity, and
Ward. Current ordinary units all remain within their role-aware
non-inferiority/dominance corridor.

| Unit | Role | Pooled paired WR delta (95% CI) | Pure WR / mechanic signal |
|---|---|---:|---|
| Archer | damage | -1.52 pp (-4.13 to +1.10) | 50.83% pure |
| Knight | frontline | +1.01 pp (-0.97 to +2.99) | 56.67% pure; positive survival |
| Mage | damage | -1.01 pp (-3.44 to +1.42) | 45.33% pure; glass-cannon burst behind a frontline |
| Pea Shooter | damage | -2.53 pp (-5.13 to +0.08) | 49.33% pure; three-hit burst |
| Mechanical Dragon | damage | -1.01 pp (-3.81 to +1.79) | 57.29% pure; flight and chain damage |
| Mimic | utility | +2.53 pp (-0.43 to +5.48) | 54.50% pure; trap/targeting specialist |
| Necromancer | support | -3.54 pp (-6.47 to -0.60) | 44.95% pure; +9.62 summons per paired battle |

Mage and Necromancer are intentionally not balanced for all-one-unit armies:
Mage pays for top-end direct burst with fragility, while Necromancer pays for
renewable screening bodies and needs a frontline. Neither crosses its
role-aware underpower floor.

## Future-unit projection

Town Hall 8-10 defenses do not exist yet, so these are not future-tier win-rate
claims. They compare the authored units against the current TH7 defense
ceiling and guard against grossly useless or dominant content.

| Unit | Intended unlock | Paired WR delta (95% CI) | Role signal |
|---|---:|---:|---|
| Wind Mage | TH8 | -4.04 pp (-7.71 to -0.37) | +18.69 temporary summons per battle |
| Ice Golem | TH9 | -3.54 pp (-6.11 to -0.96) | positive survival; defense priority and death freeze |
| Horror | TH10 | -4.55 pp (-8.59 to -0.50) | +3.76 descendants per battle |

All three are well inside the projected +/-20 pp safety gate. They require a
new same-tier validation when TH8-TH10 defenses are authored.

## NFT result

Common NFT pure armies are modestly stronger than the ordinary pure baseline:
Demon King is 62.83% and Fire Dragon is 60.33%. The paired rarity test changes
only rarity on the same 600 battles per comparison.

| NFT unit | Epic vs Common | Legendary vs Common |
|---|---:|---:|
| Demon King | +0.83 pp (-0.15 to +1.81) | +1.17 pp (+0.09 to +2.25) |
| Fire Dragon | +0.83 pp (-0.03 to +1.70) | +1.33 pp (+0.31 to +2.36) |

The observed lifts are far below the 5 pp Epic and 8 pp Legendary ceilings.
A few deterministic target-timing reversals occurred, but every pooled net
effect is positive and no rarity comparison is systemically weaker than
Common.

## Base breakability

| Seed | Bases | Initially without an elite-gate win | Focused rescues | Adaptive rescues | Final unbeaten |
|---|---:|---:|---:|---:|---:|
| 83003 | 300 | 3 | 1 | 2 | **0** |
| 83004 | 300 | 9 | 0 | 9 | **0** |
| **Total** | **600** | **12** | **1** | **11** | **0** |

Final untested bases: `0`. Invalid-only bases: `0`. Invalid breakability
replays: `0`. Population warnings about bases with no sampled random-policy
win are therefore not unbreakable-base failures; the exhaustive counter phase
found a legal win for every one.

## Verification

Passed locally:

- Node client/server combat parity for all active troops, defenses, slots,
  rarity, summons, traps, and tactical constants.
- Node troop power-curve, role-registry, Town Hall level-cap, unlock,
  TH7 progression, Cannon, Necromancer, Wind Mage, Mechanical Dragon, and
  Shark Trap tests.
- Godot headless troop power-curve, Town Hall cap, unlock, TH7 progression,
  and Cannon-level tests.
- Full Godot headless editor import/parse startup.
- Both final balance reports completed with strict exit `0`, no lab
  overrides, zero critical issues, and zero invalid replays.

The Godot editor emitted its existing resource/object leak warnings while
quitting headlessly; the process exited successfully and no parse/runtime
error was reported.

## Residual risk

- TH7 pooled policy wins are 56.25%, leaving 0.75 percentage points below the
  upper target edge. Avoid another broad TH7 offense buff without rerunning
  both holdouts.
- Wind Mage, Ice Golem, and Horror need same-tier tests once TH8-TH10 bases
  and upgrades exist.
- Necromancer passes its support floor through a strong summon signal but has
  a negative paired direct-outcome delta; confirm that its mixed-army controls
  and visual feedback feel worthwhile in an owner playtest. Ice Golem's
  death-freeze contribution is authored and parity-tested but is not isolated
  as a separate utility counter in this report.
- Live telemetry should still watch role pick rate, not only win rate: a
  statistically fair unit can remain unpopular because of controls, clarity,
  or army-building friction.
