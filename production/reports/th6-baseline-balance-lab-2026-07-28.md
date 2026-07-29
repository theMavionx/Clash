# Clash Full-Game Balance Lab

**Generated:** 2026-07-28T11:11:06.426Z
**Seed:** 727
**Town Halls:** TH6
**Unique generated bases:** 48
**Replay simulations:** 72
**Ship capacity used:** 135 slots
**Elapsed:** 10.1s

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
- Building coverage: 12/12
- Troop simulation coverage: 12/12
- Bases exercised: 48/48

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 72 | 12 | 16.7% | 0 | 32.4s | 20.8% | 76.9% | 7.0% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 41 | 9 | 22.0% | 0 | 39.2s | 26.8% | 71.5% |
| TH5->TH6 | 13 | 1 | 7.7% | 0 | 12.2s | 3.7% | 82.6% |
| TH7->TH6 | 12 | 2 | 16.7% | 0 | 42.5s | 29.0% | 77.6% |
| TH1->TH6 | 5 | 0 | 0.0% | 0 | 10.2s | 0.7% | 99.6% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right | 7 | 2 | 28.6% | 0 | 38.6s | 31.0% | 71.3% |
| compact-core | 7 | 0 | 0.0% | 0 | 35.0s | 8.1% | 85.0% |
| corner-keep | 6 | 1 | 16.7% | 0 | 38.1s | 23.0% | 80.5% |
| defense-ring | 6 | 2 | 33.3% | 0 | 25.1s | 27.6% | 52.0% |
| diamond | 6 | 1 | 16.7% | 0 | 19.0s | 13.2% | 80.0% |
| layered-rings | 6 | 1 | 16.7% | 0 | 27.3s | 37.4% | 67.0% |
| resource-shield | 6 | 1 | 16.7% | 0 | 29.5s | 23.6% | 82.6% |
| southern-funnel | 6 | 1 | 16.7% | 0 | 42.1s | 20.1% | 83.3% |
| trap-lanes | 6 | 0 | 0.0% | 0 | 40.3s | 16.7% | 93.4% |
| wide-spread | 6 | 2 | 33.3% | 0 | 26.6s | 22.8% | 66.7% |
| asymmetric-left | 5 | 1 | 20.0% | 0 | 15.0s | 6.9% | 79.4% |
| split-core | 5 | 0 | 0.0% | 0 | 51.6s | 18.0% | 82.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 27 | 0 | 0.0% | 0 | 13.7s | 5.3% | 99.8% |
| mid | 16 | 3 | 18.8% | 0 | 33.3s | 31.4% | 66.0% |
| rushed-defense | 15 | 0 | 0.0% | 0 | 10.9s | 9.3% | 99.4% |
| rushed-economy | 14 | 9 | 64.3% | 0 | 90.7s | 51.2% | 20.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 6 | 0 | 0.0% | 0 | 12.8s | 5.6% | 99.4% |
| pure-demon_king | 5 | 0 | 0.0% | 0 | 17.9s | 6.1% | 83.7% |
| balanced | 4 | 0 | 0.0% | 0 | 37.0s | 20.3% | 98.4% |
| frontline-ranged | 4 | 0 | 0.0% | 0 | 18.9s | 23.1% | 74.7% |
| pure-horror | 4 | 1 | 25.0% | 0 | 72.5s | 28.8% | 54.6% |
| pure-mechanical_dragon | 4 | 0 | 0.0% | 0 | 20.1s | 25.6% | 89.9% |
| pure-mimic | 4 | 0 | 0.0% | 0 | 62.9s | 20.7% | 85.3% |
| support-mix | 4 | 1 | 25.0% | 0 | 16.3s | 6.8% | 75.0% |
| melee-pressure | 3 | 2 | 66.7% | 0 | 46.5s | 34.8% | 33.3% |
| pure-fire_dragon | 3 | 1 | 33.3% | 0 | 20.8s | 29.9% | 66.7% |
| pure-ice_golem | 3 | 1 | 33.3% | 0 | 51.3s | 27.6% | 66.7% |
| pure-necromancer | 3 | 0 | 0.0% | 0 | 15.8s | 14.6% | 100.0% |
| pure-wind_mage | 3 | 1 | 33.3% | 0 | 19.7s | 24.1% | 66.7% |
| random-3 | 3 | 1 | 33.3% | 0 | 20.6s | 29.5% | 66.7% |
| random-5 | 3 | 0 | 0.0% | 0 | 25.5s | 21.3% | 94.0% |
| random-6 | 3 | 1 | 33.3% | 0 | 21.2s | 25.3% | 66.7% |
| air-pressure | 2 | 1 | 50.0% | 0 | 22.8s | 46.6% | 50.0% |
| random-1 | 2 | 1 | 50.0% | 0 | 37.7s | 27.1% | 50.0% |
| random-4 | 2 | 1 | 50.0% | 0 | 116.0s | 47.5% | 35.9% |
| trap-runner-mix | 2 | 0 | 0.0% | 0 | 97.0s | 35.6% | 80.3% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-push | 12 | 1 | 8.3% | 0 | 43.9s | 23.6% | 88.0% |
| dual-flank | 12 | 1 | 8.3% | 0 | 38.9s | 22.7% | 81.9% |
| left-flank | 12 | 1 | 8.3% | 0 | 18.7s | 17.4% | 81.8% |
| right-flank | 12 | 3 | 25.0% | 0 | 28.6s | 17.5% | 74.7% |
| staggered-waves | 12 | 4 | 33.3% | 0 | 31.5s | 25.4% | 63.6% |
| wide-line | 12 | 2 | 16.7% | 0 | 33.1s | 18.4% | 71.2% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| low | 19 | 1 | 5.3% | 0 | 29.1s | 13.5% | 91.3% |
| mixed | 19 | 2 | 10.5% | 0 | 42.8s | 25.6% | 73.5% |
| maxed | 17 | 7 | 41.2% | 0 | 26.3s | 30.1% | 55.0% |
| mid | 17 | 2 | 11.8% | 0 | 30.7s | 14.4% | 86.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king | 36 | 7 | 19.4% | 0 | 34.1s | 21.8% | 72.9% |
| mage | 35 | 5 | 14.3% | 0 | 30.9s | 19.5% | 80.0% |
| mimic | 35 | 7 | 20.0% | 0 | 39.7s | 24.0% | 72.7% |
| fire_dragon | 34 | 7 | 20.6% | 0 | 32.8s | 24.5% | 73.6% |
| knight | 32 | 7 | 21.9% | 0 | 36.0s | 23.6% | 72.0% |
| archer | 30 | 5 | 16.7% | 0 | 33.9s | 21.7% | 76.8% |
| pea_shooter | 30 | 5 | 16.7% | 0 | 33.9s | 21.7% | 76.8% |
| ice_golem | 28 | 7 | 25.0% | 0 | 43.2s | 28.6% | 69.4% |
| mechanical_dragon | 28 | 5 | 17.9% | 0 | 37.2s | 28.9% | 75.1% |
| necromancer | 25 | 4 | 16.0% | 0 | 38.5s | 26.3% | 77.8% |
| horror | 23 | 7 | 30.4% | 0 | 54.1s | 31.5% | 63.0% |
| wind_mage | 21 | 5 | 23.8% | 0 | 31.4s | 26.7% | 70.6% |

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
- **WARNING / overall-win-rate:** Overall attacker win rate 16.7% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH6->TH6 has 22.0% attacker wins across 41 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH5->TH6 has 7.7% attacker wins across 13 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH6 has 16.7% attacker wins across 12 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype compact-core has 0.0% attacker wins across 7 samples (reference 16.7%).
- **WARNING / base-archetype-outlier:** base-archetype defense-ring has 33.3% attacker wins across 6 samples (reference 16.7%).
- **WARNING / base-archetype-outlier:** base-archetype wide-spread has 33.3% attacker wins across 6 samples (reference 16.7%).
- **WARNING / base-archetype-outlier:** base-archetype trap-lanes has 0.0% attacker wins across 6 samples (reference 16.7%).
- **WARNING / army-outlier:** army pure-mage has 0.0% attacker wins across 6 samples (reference 16.7%).
- **INFO / unbeaten-base:** th6-compact-core-001 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-defense-ring-002 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-layered-rings-003 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-split-core-004 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-005 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-resource-shield-006 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-wide-spread-007 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-008 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-009 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-010 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-corner-keep-011 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-diamond-012 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-corner-keep-035 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-034 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-021 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-compact-core-025 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-diamond-024 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th6-asymmetric-right-045 has 100.0% attacker wins across 2 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
