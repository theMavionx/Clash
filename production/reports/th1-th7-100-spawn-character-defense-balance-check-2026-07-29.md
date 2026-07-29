# TH1-TH7 Character, Spawn, and Defense Balance Check

**Date:** 2026-07-29
**Verdict:** CONCERNS
**Primary simulator:** production `server/combat_session.js`

## Data Sources Analyzed

- `tools/pvp-balance/run.js`
- `production/reports/th1-th7-100-spawn-training-balance-lab-2026-07-29.json`
- `production/reports/th1-th7-100-spawn-trained-v2-balance-lab-2026-07-29.json`
- `production/reports/th1-th7-100-spawn-trained-v3-balance-lab-2026-07-29.json`
- `production/reports/th1-th7-100-spawn-final-balance-lab-2026-07-29.json`
- `production/reports/server-godot-combat-parity-50-2026-07-29.json`
- `design/balance/troop-town-hall-winrate-rebalance-2026-07-28.md`
- `design/gdd/troop-unlock-progression.md`

## Method and Coverage

- Four full search/training runs were executed: seed `290729`, then trainer
  revisions and final regeneration on seed `290730`.
- Total executed: **20,000 simulated battles**, **0 invalid replays**.
- Character/base pooling below uses only the two distinct seeds; repeated
  seed-290730 regeneration is deterministic and is counted only once.
- Each run contained 5,000 battles:
  - 1,797 controlled pure-unit battles over all 300 initial bases;
  - 1,703 policy-exploration battles over 500 attack policies;
  - three adversarial training rounds of 500 battles.
- Controlled pure-unit conditions fixed abilities to none, NFT rarity to common,
  defender Ward to 0, and troop level to the attacker Town Hall cap.
- Spawn catalog: **10 formations x 5 timings x 2 role orders = 100 configured
  mechanics**.
- Final run exercised 100/100 mechanics globally. TH2-TH7 each exercised
  100/100; TH1 exercised 96/100.
- Final training population contained 605/605 semantically unique policies and
  405 exercised bases. Each final-round attack policy and base received 7-8
  adversarial battles.
- The prior real Godot parity sample agreed with the server outcome in 47/50
  battles (94%); strict final-state agreement was 22/50 (44%). Results below
  are decision-quality for server balance exploration, not exact Godot
  animation-level truth.

## Health Summary

| Cohort | Battles | Attacker Win Rate | Interpretation |
|---|---:|---:|---|
| Controlled pure units, seed 290730 | 1,797 | 49.0% | Best character-comparison cohort |
| Policy exploration, seed 290730 | 1,703 | 38.5% | Mixed levels, armies, tactics, boosts, and spawns |
| Training round 1 | 500 | 13.4% | Hard-frontier attacks versus selected defenses |
| Training round 2 | 500 | 16.2% | Hard-frontier search, not normal matchmaking |
| Training round 3 | 500 | 15.2% | Final hard-frontier evaluation |

The overall 35.2% rate in the final run must not be treated as the production
win rate because it deliberately includes 1,500 selected hard-frontier battles.

## Controlled Character Results

The table pools both seeds. Wilson 95% intervals show sampling uncertainty;
they do not correct for repeated use of the same bases.

| Character | Battles | Win Rate | Wilson 95% CI | Destruction | TH HP Left | Assessment |
|---|---:|---:|---:|---:|---:|---|
| Demon King | 514 | 72.2% | 68.2-75.9% | 72.8% | 25.0% | Strong outlier |
| Fire Dragon | 514 | 60.3% | 56.0-64.4% | 66.2% | 38.6% | Above desired mature-tier center |
| Mechanical Dragon | 170 | 57.1% | 49.5-64.3% | 63.4% | 42.9% | Healthy, interval still broad |
| Knight | 600 | 54.7% | 50.7-58.6% | 59.4% | 41.9% | Healthy reference unit |
| Pea Shooter | 342 | 48.5% | 43.3-53.8% | 57.5% | 50.7% | Healthy |
| Archer | 600 | 42.5% | 38.6-46.5% | 54.9% | 54.2% | Mildly weak |
| Mimic | 256 | 35.2% | 29.6-41.2% | 44.4% | 62.7% | Weak |
| Necromancer | 84 | 31.0% | 22.1-41.5% | 38.4% | 69.0% | Weak; needs more samples |
| Mage | 514 | 27.4% | 23.8-31.4% | 40.3% | 72.5% | Severe weak outlier |

Character-specific progression findings:

- Demon King peaks at TH4 **83.7%** and TH5 **81.4%**.
- Fire Dragon remains between **54.7% and 68.6%** from TH2-TH7.
- Knight remains comparatively stable at **44.2-62.8%**.
- Mage falls to **20.9%** at TH6 and **23.8%** at TH7.
- Pea Shooter starts at **62.8%** on TH4 and falls to **39.3%** on TH7.
- Necromancer has only its TH7 cell: **31.0%, n=84**.

## Town Hall Progression

These values pool only the controlled pure-unit cohorts from both seeds.

| Town Hall | Battles | Win Rate | Wilson 95% CI | Authored Target | Result |
|---|---:|---:|---:|---:|---|
| TH1 | 172 | 57.6% | 50.1-64.7% | 60-70% | Slightly low |
| TH2 | 430 | 46.3% | 41.6-51.0% | 60-70% | Low |
| TH3 | 430 | 51.9% | 47.1-56.5% | 60-70% | Low |
| TH4 | 516 | 60.9% | 56.6-65.0% | 60-70% | On target |
| TH5 | 602 | 48.2% | 44.2-52.2% | 45-55% | On target |
| TH6 | 688 | 46.1% | 42.4-49.8% | 45-55% | On target |
| TH7 | 756 | 45.2% | 41.7-48.8% | 45-55% | On lower edge |

Policy exploration is materially weaker than the controlled max-level cohort:
TH1 is 67.8%, TH2 55.9%, TH3 25.7%, TH4 30.2%, TH5 33.1%, TH6 30.2%,
and TH7 26.0%. This cohort includes low/mid/mixed troop levels and tactical
policies, so it diagnoses the full progression experience rather than isolated
max-level troop power.

## Defensive Base Results

Controlled pure-unit results pooled across both seeds rank the archetypes as
follows. Lower attacker win rate means stronger defense.

| Rank | Archetype | Battles | Attacker Win Rate | Wilson 95% CI | TH HP Left |
|---:|---|---:|---:|---:|---:|
| 1 | asymmetric-left | 168 | 2.4% | 0.9-6.0% | 96.4% |
| 2 | rear-keep | 168 | 13.1% | 8.8-19.0% | 85.6% |
| 3 | kill-corridor | 168 | 28.0% | 21.7-35.2% | 69.3% |
| 4 | layered-rings | 252 | 31.8% | 26.3-37.7% | 67.4% |
| 5 | southern-funnel | 252 | 33.3% | 27.8-39.4% | 64.8% |
| 6 | trap-lanes | 168 | 41.7% | 34.5-49.2% | 56.0% |
| 7 | defense-ring | 252 | 42.5% | 36.5-48.6% | 54.7% |
| 8 | compact-core | 252 | 48.0% | 41.9-54.2% | 50.4% |
| 9 | corner-keep | 168 | 48.2% | 40.8-55.7% | 50.9% |
| 10 | crossfire | 168 | 50.0% | 42.5-57.5% | 46.5% |
| 11 | resource-shield | 252 | 51.2% | 45.0-57.3% | 47.1% |
| 12 | echelon-left | 168 | 60.1% | 52.6-67.2% | 39.4% |
| 13 | diamond | 168 | 63.1% | 55.6-70.0% | 34.0% |
| 14 | wide-spread | 234 | 65.4% | 59.1-71.2% | 32.5% |
| 15 | asymmetric-right | 168 | 73.2% | 66.1-79.3% | 23.9% |
| 16 | split-core | 252 | 75.0% | 69.3-79.9% | 21.1% |
| 17 | echelon-right | 168 | 78.6% | 71.8-84.1% | 21.0% |
| 18 | cannon-screen | 168 | 89.9% | 84.4-93.6% | 9.5% |

The left/right asymmetry is too large to explain as ordinary balance noise:
`asymmetric-left` allows 2.4% attacker wins while `asymmetric-right` allows
73.2%. Attack direction, pathfinding, or layout mirroring should be audited
before tuning defense damage.

Strongest individual original-base candidates with at least 20 mixed samples:

| Base | TH | Archetype | Progression | Battles | Attacker Win Rate |
|---|---:|---|---|---:|---:|
| th6-rear-keep-216 | 6 | rear-keep | maxed | 35 | 0% |
| th7-corner-keep-077 | 7 | corner-keep | maxed | 30 | 0% |
| th7-compact-core-007 | 7 | compact-core | maxed | 29 | 0% |
| th5-layered-rings-019 | 5 | layered-rings | rushed-defense | 28 | 0% |
| th5-compact-core-005 | 5 | compact-core | maxed | 27 | 0% |
| th6-resource-shield-041 | 6 | resource-shield | maxed | 23 | 0% |
| th7-southern-funnel-287 | 7 | southern-funnel | maxed | 23 | 0% |

These individual-base rankings are exploratory because opponent exposure is
not identical and the 95% upper bound for a 0/20 result is still about 16%.

## Spawn and Tactical Strategy Results

Policy-exploration formation results from the final seed:

| Formation | Battles | Win Rate |
|---|---:|---:|
| inverted-wedge | 182 | 45.6% |
| diamond | 194 | 44.8% |
| right-flank | 174 | 40.8% |
| vanguard-wedge | 190 | 40.0% |
| left-flank | 154 | 39.0% |
| three-lane | 168 | 38.1% |
| dual-flank | 167 | 36.5% |
| edge-sweep | 163 | 35.6% |
| center-column | 150 | 30.7% |
| wide-line | 161 | 30.4% |

Timing results: three-waves 42.3%, two-waves 39.8%, burst 39.2%, drip 37.5%,
rapid 33.6%. Roster order scored 40.1%; tank-front/support-rear scored 36.8%.
These are marginal, non-causal comparisons because army, TH, tactics, and base
mix differ between buckets.

Policy-exploration tactical results:

| Tactic | Battles | Win Rate |
|---|---:|---:|
| cannon-focus | 355 | 43.4% |
| none | 337 | 41.0% |
| rally-core | 336 | 40.2% |
| freeze-barrel | 41 | 39.0% |
| cannon-rally | 346 | 37.9% |
| freeze-rage | 41 | 36.6% |
| freeze-defense | 42 | 35.7% |
| rage-entry | 41 | 29.3% |
| cannon-medkit | 40 | 27.5% |
| medkit-entry | 37 | 27.0% |
| rally-rage | 45 | 22.2% |
| skeleton-barrel | 42 | 19.0% |

Top trained candidates:

| Policy | TH | Army | Spawn | Tactic | Battles | Win Rate |
|---|---:|---|---|---|---:|---:|
| policy-0270 | 4 | melee-pressure | center-column / drip / roster | rally-core | 17 | 100.0% |
| policy-0270-r2-m17 | 4 | melee-pressure | center-column / drip / roster | cannon-rally | 15 | 100.0% |
| policy-0232 | 1 | pure-archer | diamond / rapid / roster | cannon-focus | 18 | 88.9% |
| policy-0232-r1-m01 | 1 | pure-archer | diamond / rapid / roster | cannon-focus | 14 | 85.7% |
| policy-0190 | 1 | support-mix | diamond / drip / roster | cannon-focus | 12 | 83.3% |

These are search candidates, not a solved meta: their intervals are broad,
they were selected adaptively, and four of five are TH1 policies.

## Outliers and Degenerate Strategies

- Demon King pure armies are a high-power outlier; Mage, Mimic, and
  Necromancer are low-power outliers.
- `asymmetric-left` and `rear-keep` are overly strong; `cannon-screen`,
  `echelon-right`, and `split-core` are overly weak.
- Some rally policies win by reaching the Town Hall with very low total
  destruction. `policy-0270` won 100% in the final trainer and previously
  reached 94.1% with only 4.5% aggregate destruction;
  this is a possible Town Hall snipe strategy and needs a real Godot replay
  review before balance tuning.
- TH5-TH7 hard-frontier bases produced almost no attacker wins in later
  training rounds. This shows defense-frontier collapse, not normal
  matchmaking health.
- The role-aware tank-front/support-rear order did not outperform roster order
  marginally. It remains a valid tactic but is not automatically superior.

## Recommendations

1. **P0:** Audit attack-direction/pathfinding symmetry using
   `asymmetric-left` versus `asymmetric-right` before changing numeric balance.
2. **P0:** Inspect the rally Town Hall-snipe candidates in Godot and confirm
   whether low-destruction victories are intended.
3. **P0:** Bring Demon King down and Mage/Mimic/Necromancer up in isolated
   test branches, then rerun the same two seeds. Do not tune from mixed-army
   presence buckets.
4. **P1:** Rework or constrain the strongest and weakest base archetypes so
   their attacker win-rate intervals overlap the 45-55% mature target.
5. **P1:** Add per-unit damage, damage taken, kills, ability value, summon
   contribution, and lifetime telemetry. Current results measure whole-army
   success, not individual contribution inside mixed armies.
6. **P1:** Add an untouched holdout seed and cluster-bootstrap by base/policy
   before calling a strategy decision-grade.
7. **P2:** Complete TH1 spawn coverage from 96/100 to 100/100 and report
   behavior signatures as well as configured labels.

## Values That Need Attention

| Value | Current evidence | Attention |
|---|---:|---|
| Demon King controlled win rate | 72.2% | Too high |
| Mage controlled win rate | 27.4% | Too low |
| Mimic controlled win rate | 35.2% | Low |
| Necromancer controlled win rate | 31.0% | Low and under-sampled |
| asymmetric-left attacker win rate | 2.4% | Likely geometry/pathing issue |
| cannon-screen attacker win rate | 89.9% | Defense archetype too weak |
| TH3 policy-exploration win rate | 25.7% | Far below authored onboarding target |
| TH7 policy-exploration win rate | 26.0% | Below mature target |
| Elite minimum samples | 3 | Adequate only for exploratory search |
| Configured spawn mechanics | 100 | Validated globally; TH1 has 96 |
