# Clash Full-Game Balance Lab

**Generated:** 2026-07-28T11:44:48.348Z
**Seed:** 727
**Town Halls:** TH7
**Unique generated bases:** 144
**Replay simulations:** 288
**Ship capacity used:** 135 slots
**Elapsed:** 38.6s

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
- Bases exercised: 144/144

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 288 | 22 | 7.6% | 0 | 29.6s | 14.4% | 89.0% | 2.6% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 221 | 20 | 9.0% | 0 | 34.7s | 18.3% | 89.6% |
| TH6->TH7 | 60 | 2 | 3.3% | 0 | 13.4s | 1.8% | 85.7% |
| TH1->TH7 | 5 | 0 | 0.0% | 0 | 7.9s | 0.0% | 99.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 25 | 2 | 8.0% | 0 | 16.7s | 10.7% | 86.0% |
| split-core | 25 | 1 | 4.0% | 0 | 34.8s | 18.8% | 93.8% |
| asymmetric-left | 24 | 3 | 12.5% | 0 | 28.6s | 16.8% | 87.3% |
| asymmetric-right | 24 | 1 | 4.2% | 0 | 18.9s | 14.5% | 91.4% |
| compact-core | 24 | 2 | 8.3% | 0 | 31.3s | 11.6% | 88.2% |
| corner-keep | 24 | 4 | 16.7% | 0 | 52.0s | 17.6% | 79.3% |
| defense-ring | 24 | 0 | 0.0% | 0 | 22.3s | 12.4% | 96.0% |
| southern-funnel | 24 | 2 | 8.3% | 0 | 29.8s | 10.1% | 88.4% |
| trap-lanes | 24 | 1 | 4.2% | 0 | 30.9s | 13.4% | 92.4% |
| wide-spread | 24 | 4 | 16.7% | 0 | 30.2s | 22.5% | 80.9% |
| diamond | 23 | 2 | 8.7% | 0 | 24.5s | 14.3% | 86.1% |
| layered-rings | 23 | 0 | 0.0% | 0 | 35.8s | 10.2% | 98.6% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 80 | 0 | 0.0% | 0 | 18.5s | 2.1% | 99.9% |
| mid | 68 | 1 | 1.5% | 0 | 19.9s | 12.5% | 96.0% |
| rushed-defense | 47 | 0 | 0.0% | 0 | 14.5s | 7.1% | 99.6% |
| rushed-economy | 47 | 17 | 36.2% | 0 | 75.6s | 39.9% | 51.7% |
| mixed | 46 | 4 | 8.7% | 0 | 31.8s | 20.4% | 87.2% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 13 | 0 | 0.0% | 0 | 13.5s | 0.2% | 84.6% |
| pure-ice_golem | 13 | 1 | 7.7% | 0 | 20.1s | 7.6% | 92.3% |
| pure-mechanical_dragon | 13 | 1 | 7.7% | 0 | 33.6s | 27.5% | 92.2% |
| pure-wind_mage | 13 | 1 | 7.7% | 0 | 36.9s | 14.9% | 92.3% |
| melee-pressure | 12 | 1 | 8.3% | 0 | 52.5s | 22.1% | 82.6% |
| pure-demon_king | 12 | 2 | 16.7% | 0 | 24.8s | 23.7% | 83.3% |
| pure-horror | 12 | 0 | 0.0% | 0 | 16.8s | 6.1% | 100.0% |
| pure-knight | 12 | 1 | 8.3% | 0 | 16.7s | 0.3% | 75.4% |
| pure-mimic | 12 | 0 | 0.0% | 0 | 29.4s | 15.6% | 96.2% |
| pure-necromancer | 12 | 1 | 8.3% | 0 | 18.8s | 12.5% | 91.7% |
| pure-pea_shooter | 12 | 0 | 0.0% | 0 | 12.9s | 4.0% | 93.6% |
| random-4 | 12 | 1 | 8.3% | 0 | 90.8s | 22.1% | 91.5% |
| trap-runner-mix | 12 | 0 | 0.0% | 0 | 25.8s | 9.8% | 99.6% |
| air-pressure | 11 | 2 | 18.2% | 0 | 15.1s | 19.4% | 81.8% |
| balanced | 11 | 0 | 0.0% | 0 | 23.6s | 11.9% | 100.0% |
| pure-fire_dragon | 11 | 4 | 36.4% | 0 | 24.8s | 34.0% | 62.7% |
| pure-mage | 11 | 2 | 18.2% | 0 | 31.8s | 16.1% | 81.8% |
| random-1 | 11 | 0 | 0.0% | 0 | 41.2s | 20.5% | 100.0% |
| random-3 | 11 | 0 | 0.0% | 0 | 44.2s | 18.8% | 90.9% |
| random-5 | 11 | 0 | 0.0% | 0 | 44.1s | 18.0% | 97.2% |
| ranged-pressure | 11 | 0 | 0.0% | 0 | 11.7s | 2.0% | 90.9% |
| frontline-ranged | 10 | 1 | 10.0% | 0 | 42.0s | 21.2% | 90.0% |
| random-2 | 10 | 1 | 10.0% | 0 | 13.9s | 3.2% | 81.5% |
| random-6 | 10 | 1 | 10.0% | 0 | 22.8s | 15.1% | 90.0% |
| support-mix | 10 | 2 | 20.0% | 0 | 32.5s | 16.9% | 80.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-push | 48 | 7 | 14.6% | 0 | 32.1s | 17.0% | 78.7% |
| dual-flank | 48 | 3 | 6.3% | 0 | 20.6s | 13.1% | 92.3% |
| left-flank | 48 | 5 | 10.4% | 0 | 32.2s | 17.3% | 86.6% |
| right-flank | 48 | 2 | 4.2% | 0 | 29.8s | 12.4% | 92.0% |
| staggered-waves | 48 | 1 | 2.1% | 0 | 25.5s | 10.8% | 95.9% |
| wide-line | 48 | 4 | 8.3% | 0 | 37.5s | 16.1% | 88.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| low | 73 | 5 | 6.8% | 0 | 31.5s | 13.0% | 91.3% |
| mixed | 73 | 3 | 4.1% | 0 | 35.9s | 11.6% | 90.4% |
| maxed | 71 | 11 | 15.5% | 0 | 22.4s | 22.0% | 80.0% |
| mid | 71 | 3 | 4.2% | 0 | 28.4s | 11.3% | 94.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mechanical_dragon | 143 | 9 | 6.3% | 0 | 34.5s | 16.1% | 91.4% |
| fire_dragon | 141 | 12 | 8.5% | 0 | 33.8s | 16.4% | 89.1% |
| ice_golem | 133 | 8 | 6.0% | 0 | 38.3s | 15.6% | 91.5% |
| archer | 132 | 6 | 4.5% | 0 | 34.1s | 13.1% | 91.5% |
| demon_king | 132 | 9 | 6.8% | 0 | 38.8s | 17.1% | 90.7% |
| knight | 132 | 8 | 6.1% | 0 | 38.1s | 15.0% | 89.9% |
| mimic | 132 | 7 | 5.3% | 0 | 39.2s | 16.4% | 91.8% |
| necromancer | 131 | 7 | 5.3% | 0 | 34.7s | 14.4% | 92.2% |
| pea_shooter | 131 | 6 | 4.6% | 0 | 34.2s | 13.6% | 92.4% |
| mage | 130 | 8 | 6.2% | 0 | 35.9s | 14.7% | 91.4% |
| horror | 112 | 4 | 3.6% | 0 | 38.2s | 14.9% | 93.5% |
| wind_mage | 109 | 7 | 6.4% | 0 | 38.8s | 15.4% | 90.7% |

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
- **WARNING / overall-win-rate:** Overall attacker win rate 7.6% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH6->TH7 has 3.3% attacker wins across 60 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH7 has 9.0% attacker wins across 221 samples (reference 55.0%).
- **WARNING / army-outlier:** army pure-fire_dragon has 36.4% attacker wins across 11 samples (reference 7.6%).
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-defense-ring-002 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-layered-rings-003 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-split-core-004 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-005 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-resource-shield-006 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-wide-spread-007 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-008 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-009 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-010 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-corner-keep-011 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th7-diamond-012 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-051 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-corner-keep-107 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-116 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-083 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-046 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-wide-spread-031 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-080 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-027 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-144 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-050 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-142 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-014 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-028 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-069 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-059 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-068 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-052 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-076 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-compact-core-049 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-wide-spread-103 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-084 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-072 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-075 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-141 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-040 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-wide-spread-127 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-132 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-070 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-065 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-087 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-compact-core-121 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-036 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-098 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-compact-core-037 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-140 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-123 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-034 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-057 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-039 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-077 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-099 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-088 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-106 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-022 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-056 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-138 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-095 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-086 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-032 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-021 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-035 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-094 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-129 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-130 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-030 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-026 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-016 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-143 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-074 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-126 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-066 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-wide-spread-139 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-018 has 0.0% attacker wins across 2 samples.
- 44 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
