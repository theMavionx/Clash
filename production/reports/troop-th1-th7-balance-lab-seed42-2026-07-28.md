# Clash Full-Game Balance Lab

**Generated:** 2026-07-28T16:39:56.179Z
**Seed:** 42
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique generated bases:** 350
**Replay simulations:** 1400
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 95.8s

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
| 1400 | 838 | 59.9% | 0 | 38.7s | 42.6% | 30.8% | 33.6% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH1->TH1 | 203 | 136 | 67.0% | 0 | 92.3s | 35.9% | 23.9% |
| TH7->TH7 | 203 | 109 | 53.7% | 0 | 21.1s | 43.4% | 38.9% |
| TH5->TH5 | 201 | 104 | 51.7% | 0 | 23.8s | 42.5% | 39.5% |
| TH6->TH6 | 200 | 99 | 49.5% | 0 | 23.3s | 37.0% | 44.9% |
| TH2->TH2 | 198 | 123 | 62.1% | 0 | 54.6s | 43.7% | 22.9% |
| TH3->TH3 | 198 | 130 | 65.7% | 0 | 31.8s | 43.1% | 24.5% |
| TH4->TH4 | 197 | 137 | 69.5% | 0 | 23.6s | 49.7% | 20.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 140 | 82 | 58.6% | 0 | 36.3s | 29.5% | 27.8% |
| defense-ring | 140 | 76 | 54.3% | 0 | 35.3s | 41.8% | 33.8% |
| asymmetric-left | 113 | 75 | 66.4% | 0 | 33.4s | 51.9% | 22.8% |
| diamond | 113 | 64 | 56.6% | 0 | 40.5s | 33.6% | 34.3% |
| layered-rings | 113 | 68 | 60.2% | 0 | 35.1s | 44.7% | 28.6% |
| wide-spread | 113 | 87 | 77.0% | 0 | 38.8s | 48.9% | 19.9% |
| asymmetric-right | 112 | 61 | 54.5% | 0 | 40.1s | 38.2% | 37.5% |
| corner-keep | 112 | 50 | 44.6% | 0 | 48.1s | 44.3% | 38.7% |
| trap-lanes | 112 | 73 | 65.2% | 0 | 38.8s | 45.6% | 31.0% |
| resource-shield | 111 | 57 | 51.4% | 0 | 45.9s | 44.7% | 37.2% |
| southern-funnel | 111 | 84 | 75.7% | 0 | 37.0s | 50.1% | 22.3% |
| split-core | 110 | 61 | 55.5% | 0 | 36.9s | 41.9% | 36.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 282 | 73 | 25.9% | 0 | 40.5s | 25.6% | 60.4% |
| rushed-defense | 282 | 84 | 29.8% | 0 | 38.5s | 35.9% | 56.3% |
| mid | 281 | 203 | 72.2% | 0 | 42.5s | 51.5% | 17.5% |
| mixed | 278 | 211 | 75.9% | 0 | 36.3s | 49.8% | 16.1% |
| rushed-economy | 277 | 267 | 96.4% | 0 | 35.7s | 50.7% | 3.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| balanced | 127 | 93 | 73.2% | 0 | 61.4s | 42.8% | 19.3% |
| pure-archer | 127 | 71 | 55.9% | 0 | 41.0s | 31.7% | 32.0% |
| support-mix | 102 | 68 | 66.7% | 0 | 61.0s | 49.1% | 24.3% |
| pure-knight | 98 | 46 | 46.9% | 0 | 53.5s | 45.7% | 40.9% |
| random-2 | 82 | 52 | 63.4% | 0 | 62.4s | 47.4% | 24.9% |
| random-3 | 82 | 53 | 64.6% | 0 | 34.5s | 44.3% | 24.0% |
| random-5 | 76 | 45 | 59.2% | 0 | 32.3s | 44.2% | 33.2% |
| trap-runner-mix | 76 | 48 | 63.2% | 0 | 30.6s | 36.3% | 28.9% |
| pure-demon_king | 69 | 42 | 60.9% | 0 | 31.9s | 54.9% | 29.4% |
| random-1 | 69 | 45 | 65.2% | 0 | 23.9s | 43.3% | 26.8% |
| random-4 | 64 | 39 | 60.9% | 0 | 32.2s | 41.6% | 29.6% |
| melee-pressure | 62 | 37 | 59.7% | 0 | 30.1s | 42.8% | 33.2% |
| pure-fire_dragon | 62 | 37 | 59.7% | 0 | 24.9s | 43.6% | 27.8% |
| ranged-pressure | 58 | 42 | 72.4% | 0 | 34.8s | 41.8% | 20.3% |
| pure-mage | 51 | 12 | 23.5% | 0 | 23.9s | 30.7% | 69.3% |
| pure-pea_shooter | 42 | 21 | 50.0% | 0 | 23.1s | 43.9% | 42.4% |
| random-6 | 36 | 25 | 69.4% | 0 | 28.3s | 46.1% | 15.6% |
| frontline-ranged | 30 | 22 | 73.3% | 0 | 18.6s | 43.2% | 23.5% |
| pure-mechanical_dragon | 28 | 12 | 42.9% | 0 | 20.1s | 47.5% | 52.2% |
| air-pressure | 27 | 18 | 66.7% | 0 | 15.8s | 41.1% | 31.0% |
| pure-mimic | 25 | 7 | 28.0% | 0 | 28.5s | 32.6% | 59.2% |
| pure-necromancer | 7 | 3 | 42.9% | 0 | 29.0s | 37.8% | 44.9% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-push | 234 | 146 | 62.4% | 0 | 36.5s | 43.8% | 29.7% |
| dual-flank | 234 | 144 | 61.5% | 0 | 38.2s | 42.8% | 31.5% |
| right-flank | 234 | 147 | 62.8% | 0 | 40.9s | 44.6% | 26.6% |
| wide-line | 234 | 132 | 56.4% | 0 | 37.8s | 44.0% | 34.3% |
| left-flank | 232 | 136 | 58.6% | 0 | 38.2s | 38.9% | 31.4% |
| staggered-waves | 232 | 133 | 57.3% | 0 | 40.8s | 41.8% | 31.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1400 | 838 | 59.9% | 0 | 38.7s | 42.6% | 30.8% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 929 | 603 | 64.9% | 0 | 42.3s | 42.1% | 25.7% |
| knight | 904 | 573 | 63.4% | 0 | 43.3s | 43.7% | 27.4% |
| demon_king | 733 | 471 | 64.3% | 0 | 30.1s | 44.6% | 26.6% |
| mage | 670 | 412 | 61.5% | 0 | 28.4s | 42.4% | 29.6% |
| fire_dragon | 666 | 430 | 64.6% | 0 | 25.5s | 42.9% | 26.6% |
| mimic | 344 | 189 | 54.9% | 0 | 23.0s | 39.9% | 37.9% |
| pea_shooter | 316 | 189 | 59.8% | 0 | 23.0s | 43.5% | 32.1% |
| mechanical_dragon | 170 | 99 | 58.2% | 0 | 21.0s | 41.7% | 36.3% |
| necromancer | 55 | 32 | 58.2% | 0 | 22.2s | 43.8% | 38.3% |

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
- **WARNING / base-archetype-outlier:** base-archetype southern-funnel has 75.7% attacker wins across 111 samples (reference 59.9%).
- **WARNING / base-archetype-outlier:** base-archetype wide-spread has 77.0% attacker wins across 113 samples (reference 59.9%).
- **WARNING / base-archetype-outlier:** base-archetype corner-keep has 44.6% attacker wins across 112 samples (reference 59.9%).
- **WARNING / army-outlier:** army pure-mechanical_dragon has 42.9% attacker wins across 28 samples (reference 59.9%).
- **WARNING / army-outlier:** army pure-mimic has 28.0% attacker wins across 25 samples (reference 59.9%).
- **WARNING / army-outlier:** army pure-necromancer has 42.9% attacker wins across 7 samples (reference 59.9%).
- **WARNING / army-outlier:** army pure-mage has 23.5% attacker wins across 51 samples (reference 59.9%).
- **INFO / fragile-base:** th1-compact-core-001 has 100.0% attacker wins across 5 samples.
- **INFO / fragile-base:** th1-defense-ring-008 has 100.0% attacker wins across 5 samples.
- **INFO / fragile-base:** th1-layered-rings-015 has 100.0% attacker wins across 5 samples.
- **INFO / fragile-base:** th7-split-core-028 has 100.0% attacker wins across 5 samples.
- **INFO / unbeaten-base:** th1-wide-spread-043 has 0.0% attacker wins across 5 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-055 has 0.0% attacker wins across 5 samples.
- **INFO / fragile-base:** th5-asymmetric-right-061 has 100.0% attacker wins across 5 samples.
- **INFO / fragile-base:** th4-asymmetric-left-137 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-diamond-246 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th5-diamond-250 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-southern-funnel-199 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-asymmetric-left-305 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-asymmetric-left-134 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-diamond-330 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-corner-keep-155 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-146 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-trap-lanes-066 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th1-layered-rings-267 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-286 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th5-layered-rings-271 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-056 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th1-layered-rings-099 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-defense-ring-010 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-defense-ring-011 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th3-corner-keep-157 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-asymmetric-right-309 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-trap-lanes-151 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-230 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-asymmetric-right-311 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th7-asymmetric-right-315 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-compact-core-006 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th3-asymmetric-right-143 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th5-asymmetric-left-138 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th5-wide-spread-047 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th2-trap-lanes-233 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-asymmetric-right-060 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th4-compact-core-004 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-compact-core-090 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th5-southern-funnel-201 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th7-layered-rings-105 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-resource-shield-206 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-defense-ring-095 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th7-southern-funnel-119 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-defense-ring-344 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-split-core-277 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-split-core-027 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-corner-keep-239 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th4-trap-lanes-319 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-wide-spread-048 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-resource-shield-290 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-asymmetric-left-050 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th5-split-core-026 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th5-corner-keep-075 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-compact-core-342 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-compact-core-172 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th4-split-core-109 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th5-compact-core-005 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th3-corner-keep-073 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th7-layered-rings-189 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th5-split-core-194 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th5-compact-core-341 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th1-diamond-162 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-asymmetric-right-062 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th3-corner-keep-241 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-diamond-165 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th7-resource-shield-126 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-wide-spread-130 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th2-southern-funnel-198 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th5-compact-core-089 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th4-layered-rings-270 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th7-asymmetric-left-308 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-defense-ring-013 has 100.0% attacker wins across 4 samples.
- 161 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
