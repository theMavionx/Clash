# Clash Full-Game Balance Lab

**Generated:** 2026-07-28T11:10:40.669Z
**Seed:** 727
**Town Halls:** TH7
**Unique generated bases:** 48
**Replay simulations:** 72
**Ship capacity used:** 135 slots
**Elapsed:** 9.3s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 12 logical base archetypes and 5 progression profiles.
- Samples base, army, level, matchup, deployment, cannon, and rally dimensions without requiring a full Cartesian run.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 12/12
- Bases exercised: 48/48

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 72 | 5 | 6.9% | 0 | 21.4s | 12.2% | 90.1% | 1.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 48 | 4 | 8.3% | 0 | 27.3s | 17.9% | 87.9% |
| TH6->TH7 | 17 | 1 | 5.9% | 0 | 9.6s | 1.1% | 92.5% |
| TH1->TH7 | 5 | 0 | 0.0% | 0 | 8.0s | 0.0% | 99.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right | 7 | 2 | 28.6% | 0 | 35.0s | 22.1% | 71.3% |
| compact-core | 7 | 0 | 0.0% | 0 | 17.8s | 6.7% | 98.8% |
| corner-keep | 6 | 1 | 16.7% | 0 | 28.1s | 12.4% | 82.7% |
| defense-ring | 6 | 0 | 0.0% | 0 | 19.7s | 16.1% | 87.6% |
| diamond | 6 | 0 | 0.0% | 0 | 14.0s | 7.0% | 99.3% |
| layered-rings | 6 | 0 | 0.0% | 0 | 24.4s | 24.2% | 90.9% |
| resource-shield | 6 | 0 | 0.0% | 0 | 26.0s | 8.1% | 91.6% |
| southern-funnel | 6 | 1 | 16.7% | 0 | 15.9s | 17.2% | 83.3% |
| trap-lanes | 6 | 0 | 0.0% | 0 | 23.4s | 4.2% | 100.0% |
| wide-spread | 6 | 0 | 0.0% | 0 | 19.5s | 14.1% | 100.0% |
| asymmetric-left | 5 | 1 | 20.0% | 0 | 12.4s | 4.5% | 77.4% |
| split-core | 5 | 0 | 0.0% | 0 | 16.1s | 7.5% | 99.9% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 27 | 0 | 0.0% | 0 | 10.1s | 1.8% | 99.8% |
| mid | 16 | 0 | 0.0% | 0 | 19.9s | 13.2% | 98.5% |
| rushed-defense | 15 | 0 | 0.0% | 0 | 9.1s | 6.2% | 99.8% |
| rushed-economy | 14 | 5 | 35.7% | 0 | 58.1s | 37.7% | 51.4% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 4 | 0 | 0.0% | 0 | 11.9s | 0.8% | 95.8% |
| pure-horror | 4 | 0 | 0.0% | 0 | 34.5s | 16.7% | 99.4% |
| pure-mage | 4 | 0 | 0.0% | 0 | 7.3s | 2.4% | 100.0% |
| pure-mechanical_dragon | 4 | 0 | 0.0% | 0 | 13.1s | 11.2% | 100.0% |
| pure-pea_shooter | 4 | 0 | 0.0% | 0 | 8.3s | 0.0% | 99.3% |
| frontline-ranged | 3 | 0 | 0.0% | 0 | 11.6s | 10.6% | 100.0% |
| melee-pressure | 3 | 0 | 0.0% | 0 | 45.0s | 23.2% | 83.6% |
| pure-demon_king | 3 | 0 | 0.0% | 0 | 10.3s | 3.2% | 100.0% |
| pure-fire_dragon | 3 | 1 | 33.3% | 0 | 24.5s | 25.8% | 66.7% |
| pure-ice_golem | 3 | 1 | 33.3% | 0 | 43.6s | 19.4% | 66.7% |
| pure-knight | 3 | 0 | 0.0% | 0 | 11.0s | 0.0% | 99.1% |
| pure-mimic | 3 | 0 | 0.0% | 0 | 33.9s | 19.4% | 81.9% |
| pure-necromancer | 3 | 0 | 0.0% | 0 | 9.5s | 3.2% | 100.0% |
| pure-wind_mage | 3 | 1 | 33.3% | 0 | 29.0s | 20.4% | 66.7% |
| random-3 | 3 | 0 | 0.0% | 0 | 29.3s | 25.5% | 75.4% |
| random-6 | 3 | 1 | 33.3% | 0 | 21.0s | 30.1% | 66.7% |
| support-mix | 3 | 0 | 0.0% | 0 | 12.9s | 5.3% | 100.0% |
| air-pressure | 2 | 0 | 0.0% | 0 | 22.1s | 30.6% | 100.0% |
| balanced | 2 | 0 | 0.0% | 0 | 27.3s | 12.7% | 100.0% |
| random-1 | 2 | 0 | 0.0% | 0 | 30.3s | 14.3% | 100.0% |
| random-2 | 2 | 0 | 0.0% | 0 | 10.0s | 1.6% | 96.3% |
| random-4 | 2 | 0 | 0.0% | 0 | 27.6s | 19.0% | 100.0% |
| random-5 | 2 | 0 | 0.0% | 0 | 16.3s | 3.2% | 100.0% |
| ranged-pressure | 2 | 1 | 50.0% | 0 | 11.8s | 6.3% | 49.7% |
| trap-runner-mix | 2 | 0 | 0.0% | 0 | 51.1s | 11.1% | 100.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-push | 12 | 0 | 0.0% | 0 | 20.8s | 9.3% | 98.8% |
| dual-flank | 12 | 0 | 0.0% | 0 | 18.2s | 10.9% | 99.9% |
| left-flank | 12 | 1 | 8.3% | 0 | 18.4s | 14.4% | 86.9% |
| right-flank | 12 | 1 | 8.3% | 0 | 19.2s | 7.1% | 87.5% |
| staggered-waves | 12 | 2 | 16.7% | 0 | 32.1s | 18.4% | 76.3% |
| wide-line | 12 | 1 | 8.3% | 0 | 19.5s | 13.0% | 91.5% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| low | 19 | 1 | 5.3% | 0 | 19.8s | 7.9% | 93.9% |
| mixed | 19 | 2 | 10.5% | 0 | 24.7s | 13.4% | 89.3% |
| maxed | 17 | 2 | 11.8% | 0 | 22.6s | 20.5% | 80.5% |
| mid | 17 | 0 | 0.0% | 0 | 18.2s | 7.3% | 96.5% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mechanical_dragon | 32 | 2 | 6.3% | 0 | 20.9s | 14.3% | 91.2% |
| fire_dragon | 31 | 3 | 9.7% | 0 | 22.3s | 15.8% | 87.7% |
| archer | 30 | 2 | 6.7% | 0 | 20.7s | 11.8% | 90.0% |
| demon_king | 30 | 1 | 3.3% | 0 | 23.9s | 13.9% | 92.3% |
| ice_golem | 30 | 2 | 6.7% | 0 | 27.2s | 15.5% | 89.0% |
| knight | 30 | 1 | 3.3% | 0 | 23.9s | 13.6% | 92.2% |
| mage | 30 | 2 | 6.7% | 0 | 20.1s | 12.0% | 90.6% |
| mimic | 30 | 1 | 3.3% | 0 | 26.2s | 15.5% | 90.5% |
| pea_shooter | 30 | 2 | 6.7% | 0 | 20.2s | 11.7% | 90.5% |
| necromancer | 29 | 2 | 6.9% | 0 | 20.8s | 12.4% | 90.3% |
| horror | 25 | 1 | 4.0% | 0 | 30.0s | 17.0% | 90.7% |
| wind_mage | 25 | 3 | 12.0% | 0 | 20.1s | 14.6% | 84.7% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 2,070 | 1,550 | 517.5 | 387.5 |  |
| fire_dragon | 7 | 10 | 8,000 | 3,571.43 | 800 | 357.14 |  |
| archer | 7 | 1 | 840 | 290.32 | 840 | 290.32 |  |
| demon_king | 7 | 5 | 11,400 | 1,233.33 | 2,280 | 246.67 |  |
| necromancer | 7 | 15 | 11,280 | 3,444.44 | 752 | 229.63 |  |
| mechanical_dragon | 7 | 4 | 3,000 | 850.49 | 750 | 212.62 | chain x3 |
| knight | 7 | 1 | 1,900 | 205.56 | 1,900 | 205.56 |  |
| horror | 7 | 20 | 19,533 | 2,096.77 | 976.65 | 104.84 |  |
| mimic | 7 | 6 | 7,800 | 577.36 | 1,300 | 96.23 | trap immune |
| ice_golem | 7 | 10 | 21,000 | 813.38 | 2,100 | 81.34 | defense priority |
| pea_shooter | 7 | 5 | 5,500 | 388.57 | 1,100 | 77.71 |  |
| wind_mage | 7 | 15 | 9,400 | 972.73 | 626.67 | 64.85 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-hp-outlier:** demon_king HP/slot is 2.51x median.
- **WARNING / overall-win-rate:** Overall attacker win rate 6.9% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH6->TH7 has 5.9% attacker wins across 17 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH7 has 8.3% attacker wins across 48 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype asymmetric-right has 28.6% attacker wins across 7 samples (reference 6.9%).
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-defense-ring-002 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-004 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-005 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-006 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-wide-spread-007 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-008 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-009 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-010 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-011 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-012 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-035 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-015 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-034 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-021 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-compact-core-025 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-014 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-024 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-asymmetric-right-045 has 100.0% attacker wins across 2 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
