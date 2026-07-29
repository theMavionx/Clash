# Clash Full-Game Balance Lab

**Generated:** 2026-07-28T16:39:20.722Z
**Seed:** 1337
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 350
**Replay simulations:** 700
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 60.3s

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
- Troop simulation coverage: 9/9
- Bases exercised: 350/350

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 700 | 408 | 58.3% | 0 | 38.5s | 41.3% | 32.0% | 33.7% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 104 | 56 | 53.8% | 0 | 19.7s | 38.8% | 41.1% |
| TH1->TH1 | 101 | 65 | 64.4% | 0 | 95.9s | 41.1% | 22.6% |
| TH4->TH4 | 100 | 65 | 65.0% | 0 | 22.2s | 46.4% | 22.6% |
| TH5->TH5 | 100 | 44 | 44.0% | 0 | 22.7s | 39.6% | 46.2% |
| TH2->TH2 | 99 | 71 | 71.7% | 0 | 50.9s | 43.8% | 15.9% |
| TH6->TH6 | 99 | 45 | 45.5% | 0 | 22.2s | 36.6% | 48.5% |
| TH3->TH3 | 97 | 62 | 63.9% | 0 | 35.6s | 47.5% | 26.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| defense-ring | 71 | 41 | 57.7% | 0 | 37.2s | 38.6% | 35.0% |
| compact-core | 70 | 40 | 57.1% | 0 | 39.8s | 44.5% | 34.0% |
| asymmetric-right | 57 | 28 | 49.1% | 0 | 32.4s | 37.3% | 40.2% |
| corner-keep | 57 | 20 | 35.1% | 0 | 45.7s | 41.8% | 52.1% |
| split-core | 57 | 32 | 56.1% | 0 | 37.7s | 39.5% | 32.9% |
| asymmetric-left | 56 | 36 | 64.3% | 0 | 34.3s | 42.4% | 25.2% |
| diamond | 56 | 31 | 55.4% | 0 | 42.0s | 43.6% | 34.5% |
| southern-funnel | 56 | 41 | 73.2% | 0 | 34.6s | 43.8% | 23.2% |
| trap-lanes | 56 | 36 | 64.3% | 0 | 35.7s | 38.3% | 27.5% |
| layered-rings | 55 | 38 | 69.1% | 0 | 38.0s | 42.4% | 21.7% |
| wide-spread | 55 | 40 | 72.7% | 0 | 43.5s | 43.3% | 21.4% |
| resource-shield | 54 | 25 | 46.3% | 0 | 40.7s | 40.0% | 33.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 142 | 34 | 23.9% | 0 | 36.0s | 33.3% | 61.3% |
| mid | 141 | 99 | 70.2% | 0 | 42.4s | 49.8% | 17.2% |
| maxed | 140 | 34 | 24.3% | 0 | 36.7s | 23.5% | 62.1% |
| mixed | 139 | 108 | 77.7% | 0 | 39.3s | 48.0% | 16.2% |
| rushed-economy | 138 | 133 | 96.4% | 0 | 37.8s | 51.7% | 2.2% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 68 | 35 | 51.5% | 0 | 44.6s | 36.8% | 36.7% |
| pure-knight | 54 | 18 | 33.3% | 0 | 63.7s | 41.1% | 47.3% |
| balanced | 50 | 36 | 72.0% | 0 | 59.3s | 45.0% | 21.5% |
| support-mix | 49 | 34 | 69.4% | 0 | 59.6s | 47.9% | 25.4% |
| random-5 | 46 | 28 | 60.9% | 0 | 27.7s | 43.1% | 27.7% |
| random-3 | 43 | 28 | 65.1% | 0 | 61.0s | 41.2% | 30.2% |
| trap-runner-mix | 39 | 23 | 59.0% | 0 | 27.3s | 34.5% | 30.7% |
| pure-pea_shooter | 37 | 14 | 37.8% | 0 | 22.2s | 38.9% | 50.9% |
| random-1 | 34 | 26 | 76.5% | 0 | 29.7s | 43.9% | 16.6% |
| pure-demon_king | 32 | 27 | 84.4% | 0 | 31.5s | 50.2% | 13.4% |
| pure-mage | 29 | 9 | 31.0% | 0 | 22.0s | 31.2% | 60.2% |
| ranged-pressure | 29 | 13 | 44.8% | 0 | 26.9s | 35.3% | 41.0% |
| pure-fire_dragon | 27 | 19 | 70.4% | 0 | 22.6s | 46.5% | 19.2% |
| pure-mechanical_dragon | 25 | 13 | 52.0% | 0 | 22.8s | 41.8% | 40.0% |
| random-2 | 25 | 14 | 56.0% | 0 | 27.7s | 41.8% | 27.2% |
| melee-pressure | 24 | 18 | 75.0% | 0 | 35.9s | 47.0% | 16.8% |
| random-4 | 23 | 17 | 73.9% | 0 | 40.3s | 46.5% | 14.8% |
| random-6 | 22 | 15 | 68.2% | 0 | 35.7s | 39.6% | 21.1% |
| air-pressure | 17 | 8 | 47.1% | 0 | 15.5s | 38.3% | 47.0% |
| frontline-ranged | 12 | 9 | 75.0% | 0 | 19.5s | 54.5% | 23.1% |
| pure-mimic | 8 | 3 | 37.5% | 0 | 34.1s | 45.0% | 50.5% |
| pure-necromancer | 7 | 1 | 14.3% | 0 | 18.5s | 19.1% | 76.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-push | 117 | 68 | 58.1% | 0 | 36.4s | 40.6% | 34.7% |
| dual-flank | 117 | 65 | 55.6% | 0 | 41.8s | 42.2% | 33.4% |
| right-flank | 117 | 65 | 55.6% | 0 | 36.1s | 39.9% | 34.7% |
| wide-line | 117 | 59 | 50.4% | 0 | 34.2s | 39.1% | 38.3% |
| left-flank | 116 | 76 | 65.5% | 0 | 40.1s | 39.7% | 24.8% |
| staggered-waves | 116 | 75 | 64.7% | 0 | 42.1s | 46.6% | 25.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 700 | 408 | 58.3% | 0 | 38.5s | 41.3% | 32.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 435 | 276 | 63.4% | 0 | 41.9s | 41.8% | 27.1% |
| knight | 421 | 266 | 63.2% | 0 | 44.6s | 43.1% | 27.0% |
| demon_king | 338 | 224 | 66.3% | 0 | 29.7s | 43.6% | 25.3% |
| mage | 312 | 179 | 57.4% | 0 | 27.5s | 41.1% | 32.5% |
| fire_dragon | 300 | 179 | 59.7% | 0 | 24.0s | 41.8% | 30.9% |
| pea_shooter | 158 | 83 | 52.5% | 0 | 21.2s | 39.9% | 36.7% |
| mimic | 141 | 74 | 52.5% | 0 | 21.5s | 38.7% | 42.0% |
| mechanical_dragon | 89 | 48 | 53.9% | 0 | 19.8s | 39.7% | 41.5% |
| necromancer | 46 | 23 | 50.0% | 0 | 19.4s | 34.5% | 46.1% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 4,140 | 3,100 | 1,035 | 775 |  |
| fire_dragon | 7 | 10 | 16,000 | 7,142.86 | 1,600 | 714.29 |  |
| archer | 7 | 1 | 1,680 | 580.65 | 1,680 | 580.65 |  |
| demon_king | 7 | 5 | 22,800 | 2,466.67 | 4,560 | 493.33 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| mechanical_dragon | 7 | 4 | 6,000 | 1,700.97 | 1,500 | 425.24 | chain x3 |
| knight | 7 | 1 | 3,800 | 411.11 | 3,800 | 411.11 |  |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| mimic | 7 | 6 | 15,600 | 1,154.72 | 2,600 | 192.45 | trap immune |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-hp-outlier:** demon_king HP/slot is 2.51x median.
- **WARNING / matchup-outlier:** matchup TH2->TH2 has 71.7% attacker wins across 99 samples (reference 55.0%).
- **WARNING / base-archetype-outlier:** base-archetype corner-keep has 35.1% attacker wins across 57 samples (reference 58.3%).
- **WARNING / army-outlier:** army pure-knight has 33.3% attacker wins across 54 samples (reference 58.3%).
- **WARNING / army-outlier:** army pure-mimic has 37.5% attacker wins across 8 samples (reference 58.3%).
- **WARNING / army-outlier:** army pure-necromancer has 14.3% attacker wins across 7 samples (reference 58.3%).
- **WARNING / army-outlier:** army pure-pea_shooter has 37.8% attacker wins across 37 samples (reference 58.3%).
- **WARNING / army-outlier:** army pure-demon_king has 84.4% attacker wins across 32 samples (reference 58.3%).
- **WARNING / army-outlier:** army melee-pressure has 75.0% attacker wins across 24 samples (reference 58.3%).
- **WARNING / army-outlier:** army random-1 has 76.5% attacker wins across 34 samples (reference 58.3%).
- **WARNING / army-outlier:** army random-4 has 73.9% attacker wins across 23 samples (reference 58.3%).
- **WARNING / army-outlier:** army pure-mage has 31.0% attacker wins across 29 samples (reference 58.3%).
- **WARNING / army-outlier:** army frontline-ranged has 75.0% attacker wins across 12 samples (reference 58.3%).
- **INFO / fragile-base:** th1-defense-ring-008 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th7-split-core-028 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th7-southern-funnel-035 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th1-resource-shield-036 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-055 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th5-asymmetric-right-061 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th4-corner-keep-074 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th3-asymmetric-right-143 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-southern-funnel-113 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th1-trap-lanes-232 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-corner-keep-161 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th5-trap-lanes-068 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-321 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-056 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th4-trap-lanes-151 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th3-compact-core-087 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-resource-shield-209 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th4-diamond-333 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-defense-ring-012 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th4-southern-funnel-284 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th2-defense-ring-261 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-wide-spread-127 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th6-asymmetric-right-062 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-trap-lanes-154 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-286 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th2-wide-spread-128 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-diamond-164 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-defense-ring-176 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-compact-core-253 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th4-asymmetric-left-053 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-229 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-diamond-334 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-defense-ring-265 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th2-southern-funnel-114 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-defense-ring-092 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-split-core-194 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th4-diamond-081 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th2-resource-shield-121 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-322 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-resource-shield-040 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th4-split-core-025 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th2-trap-lanes-233 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-asymmetric-right-309 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-asymmetric-right-315 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th4-layered-rings-102 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-asymmetric-right-311 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-split-core-276 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th4-wide-spread-046 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th3-asymmetric-left-052 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th1-layered-rings-183 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th4-split-core-109 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th3-defense-ring-178 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-resource-shield-125 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-split-core-110 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th4-diamond-249 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th1-trap-lanes-148 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th6-diamond-167 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-trap-lanes-150 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th1-corner-keep-071 has 0.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th6-corner-keep-076 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th7-corner-keep-245 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-resource-shield-290 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-layered-rings-017 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th1-diamond-162 has 100.0% attacker wins across 2 samples.
- **INFO / unbeaten-base:** th5-resource-shield-124 has 0.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th3-asymmetric-right-059 has 100.0% attacker wins across 2 samples.
- **INFO / fragile-base:** th6-compact-core-174 has 100.0% attacker wins across 2 samples.
- 202 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
