# Clash Full-Game Balance Lab

**Generated:** 2026-07-28T11:37:08.170Z
**Seed:** 727
**Town Halls:** TH7
**Unique generated bases:** 144
**Replay simulations:** 288
**Ship capacity used:** 135 slots
**Elapsed:** 35.2s

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
| 288 | 26 | 9.0% | 0 | 32.5s | 16.0% | 86.1% | 3.5% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 221 | 23 | 10.4% | 0 | 38.3s | 20.4% | 86.5% |
| TH6->TH7 | 60 | 3 | 5.0% | 0 | 13.7s | 1.8% | 83.3% |
| TH1->TH7 | 5 | 0 | 0.0% | 0 | 8.0s | 0.0% | 99.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 25 | 2 | 8.0% | 0 | 17.5s | 11.0% | 84.9% |
| split-core | 25 | 2 | 8.0% | 0 | 40.3s | 21.3% | 88.9% |
| asymmetric-left | 24 | 3 | 12.5% | 0 | 31.7s | 19.0% | 84.8% |
| asymmetric-right | 24 | 1 | 4.2% | 0 | 20.7s | 15.1% | 91.2% |
| compact-core | 24 | 2 | 8.3% | 0 | 36.9s | 14.8% | 80.6% |
| corner-keep | 24 | 4 | 16.7% | 0 | 51.7s | 17.7% | 79.1% |
| defense-ring | 24 | 2 | 8.3% | 0 | 30.7s | 15.2% | 91.0% |
| southern-funnel | 24 | 2 | 8.3% | 0 | 31.2s | 11.0% | 85.7% |
| trap-lanes | 24 | 2 | 8.3% | 0 | 30.3s | 14.1% | 91.0% |
| wide-spread | 24 | 4 | 16.7% | 0 | 32.4s | 23.8% | 80.4% |
| diamond | 23 | 2 | 8.7% | 0 | 26.9s | 16.1% | 82.1% |
| layered-rings | 23 | 0 | 0.0% | 0 | 39.9s | 12.9% | 93.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 80 | 0 | 0.0% | 0 | 19.4s | 2.4% | 99.9% |
| mid | 68 | 1 | 1.5% | 0 | 22.0s | 14.4% | 95.3% |
| rushed-defense | 47 | 0 | 0.0% | 0 | 14.9s | 7.7% | 99.6% |
| rushed-economy | 47 | 19 | 40.4% | 0 | 81.0s | 42.8% | 40.0% |
| mixed | 46 | 6 | 13.0% | 0 | 39.2s | 23.4% | 82.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 13 | 1 | 7.7% | 0 | 13.8s | 0.2% | 80.9% |
| pure-ice_golem | 13 | 1 | 7.7% | 0 | 21.5s | 8.1% | 92.3% |
| pure-mechanical_dragon | 13 | 1 | 7.7% | 0 | 33.6s | 27.5% | 92.2% |
| pure-wind_mage | 13 | 1 | 7.7% | 0 | 37.4s | 16.1% | 92.3% |
| melee-pressure | 12 | 1 | 8.3% | 0 | 58.2s | 23.9% | 73.8% |
| pure-demon_king | 12 | 2 | 16.7% | 0 | 28.1s | 26.9% | 83.1% |
| pure-horror | 12 | 0 | 0.0% | 0 | 17.9s | 6.9% | 100.0% |
| pure-knight | 12 | 0 | 0.0% | 0 | 16.8s | 0.3% | 73.9% |
| pure-mimic | 12 | 2 | 16.7% | 0 | 42.0s | 19.6% | 81.4% |
| pure-necromancer | 12 | 1 | 8.3% | 0 | 24.4s | 14.4% | 85.9% |
| pure-pea_shooter | 12 | 1 | 8.3% | 0 | 12.2s | 4.0% | 90.7% |
| random-4 | 12 | 1 | 8.3% | 0 | 96.8s | 26.4% | 85.9% |
| trap-runner-mix | 12 | 0 | 0.0% | 0 | 25.7s | 10.4% | 99.6% |
| air-pressure | 11 | 2 | 18.2% | 0 | 15.1s | 19.4% | 81.8% |
| balanced | 11 | 0 | 0.0% | 0 | 24.5s | 13.1% | 99.4% |
| pure-fire_dragon | 11 | 4 | 36.4% | 0 | 24.8s | 34.0% | 62.7% |
| pure-mage | 11 | 2 | 18.2% | 0 | 34.4s | 17.9% | 81.8% |
| random-1 | 11 | 0 | 0.0% | 0 | 41.1s | 25.1% | 99.7% |
| random-3 | 11 | 1 | 9.1% | 0 | 66.3s | 27.7% | 79.7% |
| random-5 | 11 | 1 | 9.1% | 0 | 48.7s | 18.9% | 86.6% |
| ranged-pressure | 11 | 0 | 0.0% | 0 | 12.0s | 2.0% | 90.3% |
| frontline-ranged | 10 | 1 | 10.0% | 0 | 42.2s | 22.8% | 90.0% |
| random-2 | 10 | 1 | 10.0% | 0 | 15.7s | 3.2% | 77.8% |
| random-6 | 10 | 1 | 10.0% | 0 | 25.8s | 16.4% | 84.6% |
| support-mix | 10 | 1 | 10.0% | 0 | 33.5s | 18.5% | 83.6% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-push | 48 | 8 | 16.7% | 0 | 32.6s | 18.1% | 77.8% |
| dual-flank | 48 | 4 | 8.3% | 0 | 22.3s | 13.7% | 89.4% |
| left-flank | 48 | 5 | 10.4% | 0 | 37.4s | 18.5% | 83.1% |
| right-flank | 48 | 3 | 6.3% | 0 | 32.4s | 14.4% | 85.8% |
| staggered-waves | 48 | 1 | 2.1% | 0 | 27.8s | 12.9% | 95.7% |
| wide-line | 48 | 5 | 10.4% | 0 | 42.4s | 18.6% | 85.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| low | 73 | 6 | 8.2% | 0 | 36.5s | 15.2% | 86.9% |
| mixed | 73 | 3 | 4.1% | 0 | 37.8s | 12.6% | 89.6% |
| maxed | 71 | 14 | 19.7% | 0 | 24.1s | 23.5% | 76.8% |
| mid | 71 | 3 | 4.2% | 0 | 31.3s | 12.9% | 91.1% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mechanical_dragon | 143 | 10 | 7.0% | 0 | 37.5s | 18.0% | 88.8% |
| fire_dragon | 141 | 13 | 9.2% | 0 | 36.9s | 18.4% | 86.4% |
| ice_golem | 133 | 9 | 6.8% | 0 | 42.2s | 17.9% | 87.9% |
| archer | 132 | 8 | 6.1% | 0 | 37.4s | 15.2% | 88.3% |
| demon_king | 132 | 10 | 7.6% | 0 | 42.9s | 19.7% | 87.0% |
| knight | 132 | 8 | 6.1% | 0 | 41.9s | 17.2% | 86.2% |
| mimic | 132 | 10 | 7.6% | 0 | 44.2s | 19.0% | 86.9% |
| necromancer | 131 | 8 | 6.1% | 0 | 38.6s | 16.6% | 88.8% |
| pea_shooter | 131 | 8 | 6.1% | 0 | 37.5s | 15.7% | 89.2% |
| mage | 130 | 9 | 6.9% | 0 | 39.5s | 17.0% | 88.5% |
| horror | 112 | 6 | 5.4% | 0 | 42.7s | 17.3% | 88.9% |
| wind_mage | 109 | 8 | 7.3% | 0 | 42.8s | 17.9% | 87.2% |

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
- **WARNING / overall-win-rate:** Overall attacker win rate 9.0% is outside 55.0% +/- 8.0%.
- **WARNING / matchup-outlier:** matchup TH6->TH7 has 5.0% attacker wins across 60 samples (reference 55.0%).
- **WARNING / matchup-outlier:** matchup TH7->TH7 has 10.4% attacker wins across 221 samples (reference 55.0%).
- **WARNING / army-outlier:** army pure-fire_dragon has 36.4% attacker wins across 11 samples (reference 9.0%).
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
- **INFO / fragile-base:** th7-wide-spread-103 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-084 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-072 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-075 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-141 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-wide-spread-127 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-132 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-070 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-065 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-087 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-compact-core-121 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-036 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-defense-ring-098 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-compact-core-037 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-140 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-123 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-034 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-057 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-039 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-077 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-layered-rings-099 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-split-core-088 has 0.0% attacker wins across 2 samples.
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
- **INFO / unbeaten-base:** th7-asymmetric-right-081 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-resource-shield-078 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-diamond-024 has 0.0% attacker wins across 2 samples.
- 41 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
