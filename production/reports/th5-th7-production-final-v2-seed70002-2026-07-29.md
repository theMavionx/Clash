# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T12:55:41.506Z
**Seed:** 70002
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2400
**Unbeaten non-adaptive bases (n >= 6):** 66
**Breakability probe:** 23051 calibration + gate + focused + adaptive rescue battles; 0/300 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 460.1s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all 18 base archetypes.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH5=100/100, TH6=100/100, TH7=100/100
- Bases exercised: 300/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 5000 | 2763 | 55.3% | 0 | 25.7s | 52.4% | 40.9% | 35.4% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab learned from its closest valid attempt and systematically crossed that army with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 15000
- Full-catalog gate battles: 6000
- Focused rescue battles: 1957
- Adaptive counter-search battles: 94
- Initially unbeaten after elite gate: 5
- Resolved by remaining-policy search: 5
- Total breakability battles: 23051
- Invalid: 0
- Tested bases: 300/300
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-layered-rings-171 | 7 | layered-rings | maxed | policy-0771 | candidate-rescue | 37 |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | adaptive-th7-asymmetric-right-189-0022 | adaptive-counter-search | 21 |
| th7-compact-core-273 | 7 | compact-core | maxed | adaptive-th7-compact-core-273-0024 | adaptive-counter-search | 23 |
| th7-corner-keep-087 | 7 | corner-keep | maxed | adaptive-th7-corner-keep-087-0022 | adaptive-counter-search | 21 |
| th7-crossfire-153 | 7 | crossfire | maxed | adaptive-th7-crossfire-153-0032 | adaptive-counter-search | 29 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1763 | 962 | 54.6% | 0 | 24.5s | 55.6% | 42.8% |
| TH6->TH6 | 1668 | 949 | 56.9% | 0 | 26.3s | 52.2% | 39.8% |
| TH5->TH5 | 1569 | 852 | 54.3% | 0 | 26.4s | 48.5% | 39.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 306 | 133 | 43.5% | 0 | 23.9s | 45.6% | 51.5% |
| asymmetric-left | 303 | 143 | 47.2% | 0 | 24.9s | 51.1% | 48.9% |
| layered-rings | 303 | 129 | 42.6% | 0 | 24.8s | 50.9% | 52.2% |
| trap-lanes | 303 | 179 | 59.1% | 0 | 25.8s | 53.3% | 36.8% |
| resource-shield | 302 | 131 | 43.4% | 0 | 23.7s | 45.2% | 52.6% |
| split-core | 300 | 186 | 62.0% | 0 | 24.7s | 55.8% | 33.4% |
| southern-funnel | 299 | 167 | 55.9% | 0 | 24.7s | 51.3% | 40.6% |
| wide-spread | 297 | 206 | 69.4% | 0 | 27.0s | 58.3% | 27.3% |
| asymmetric-right | 296 | 130 | 43.9% | 0 | 24.9s | 52.2% | 51.3% |
| defense-ring | 295 | 174 | 59.0% | 0 | 27.0s | 57.0% | 36.2% |
| echelon-right | 254 | 158 | 62.2% | 0 | 25.9s | 53.6% | 35.3% |
| diamond | 253 | 138 | 54.5% | 0 | 26.8s | 53.7% | 41.3% |
| cannon-screen | 252 | 180 | 71.4% | 0 | 28.9s | 53.8% | 26.7% |
| crossfire | 252 | 138 | 54.8% | 0 | 25.1s | 50.5% | 41.9% |
| corner-keep | 247 | 123 | 49.8% | 0 | 26.4s | 50.7% | 44.9% |
| echelon-left | 247 | 150 | 60.7% | 0 | 26.8s | 52.5% | 36.8% |
| rear-keep | 246 | 141 | 57.3% | 0 | 25.7s | 52.9% | 40.5% |
| kill-corridor | 245 | 157 | 64.1% | 0 | 27.3s | 55.3% | 32.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 107 | 51 | 47.7% | 0 | 23.3s | 53.5% | 50.3% |
| compact-core\|TH7 | 107 | 39 | 36.4% | 0 | 23.0s | 44.0% | 57.7% |
| resource-shield\|TH7 | 107 | 46 | 43.0% | 0 | 23.5s | 47.6% | 54.2% |
| split-core\|TH7 | 107 | 72 | 67.3% | 0 | 24.8s | 60.1% | 30.5% |
| trap-lanes\|TH7 | 107 | 60 | 56.1% | 0 | 25.4s | 58.1% | 39.6% |
| layered-rings\|TH7 | 106 | 40 | 37.7% | 0 | 24.0s | 52.0% | 57.7% |
| asymmetric-right\|TH7 | 105 | 46 | 43.8% | 0 | 23.3s | 52.9% | 53.7% |
| defense-ring\|TH7 | 105 | 65 | 61.9% | 0 | 25.5s | 62.2% | 34.8% |
| southern-funnel\|TH7 | 104 | 56 | 53.8% | 0 | 25.0s | 54.1% | 42.6% |
| wide-spread\|TH7 | 104 | 66 | 63.5% | 0 | 24.3s | 59.2% | 35.5% |
| compact-core\|TH6 | 103 | 47 | 45.6% | 0 | 24.2s | 47.5% | 50.3% |
| asymmetric-left\|TH6 | 101 | 49 | 48.5% | 0 | 25.4s | 52.3% | 47.0% |
| layered-rings\|TH6 | 101 | 50 | 49.5% | 0 | 23.3s | 50.7% | 49.3% |
| resource-shield\|TH6 | 101 | 46 | 45.5% | 0 | 24.4s | 46.2% | 51.5% |
| trap-lanes\|TH6 | 101 | 58 | 57.4% | 0 | 25.1s | 51.3% | 39.2% |
| southern-funnel\|TH6 | 100 | 56 | 56.0% | 0 | 27.4s | 50.0% | 40.3% |
| split-core\|TH6 | 100 | 62 | 62.0% | 0 | 25.2s | 55.8% | 32.9% |
| wide-spread\|TH6 | 99 | 70 | 70.7% | 0 | 28.4s | 60.9% | 23.8% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 24.3s | 50.4% | 47.9% |
| defense-ring\|TH6 | 98 | 64 | 65.3% | 0 | 26.9s | 54.6% | 31.2% |
| compact-core\|TH5 | 96 | 47 | 49.0% | 0 | 24.5s | 45.6% | 45.9% |
| layered-rings\|TH5 | 96 | 39 | 40.6% | 0 | 27.0s | 49.7% | 49.2% |
| asymmetric-left\|TH5 | 95 | 43 | 45.3% | 0 | 26.1s | 46.8% | 49.2% |
| southern-funnel\|TH5 | 95 | 55 | 57.9% | 0 | 21.5s | 49.4% | 38.6% |
| trap-lanes\|TH5 | 95 | 61 | 64.2% | 0 | 27.0s | 49.4% | 31.1% |
| resource-shield\|TH5 | 94 | 39 | 41.5% | 0 | 23.0s | 41.0% | 52.1% |
| wide-spread\|TH5 | 94 | 70 | 74.5% | 0 | 28.4s | 54.4% | 21.8% |
| asymmetric-right\|TH5 | 93 | 35 | 37.6% | 0 | 27.3s | 53.4% | 52.3% |
| split-core\|TH5 | 93 | 52 | 55.9% | 0 | 24.1s | 50.2% | 37.5% |
| defense-ring\|TH5 | 92 | 45 | 48.9% | 0 | 28.7s | 53.0% | 43.1% |
| crossfire\|TH7 | 90 | 51 | 56.7% | 0 | 23.8s | 56.8% | 41.7% |
| echelon-right\|TH7 | 90 | 56 | 62.2% | 0 | 24.0s | 57.0% | 36.4% |
| cannon-screen\|TH7 | 88 | 58 | 65.9% | 0 | 27.2s | 54.9% | 32.6% |
| corner-keep\|TH7 | 88 | 43 | 48.9% | 0 | 24.2s | 51.6% | 48.6% |
| diamond\|TH7 | 88 | 52 | 59.1% | 0 | 25.1s | 60.4% | 38.9% |
| rear-keep\|TH7 | 88 | 53 | 60.2% | 0 | 25.8s | 60.0% | 38.4% |
| echelon-left\|TH7 | 86 | 51 | 59.3% | 0 | 24.3s | 58.2% | 39.7% |
| kill-corridor\|TH7 | 86 | 57 | 66.3% | 0 | 25.1s | 60.9% | 31.0% |
| diamond\|TH6 | 85 | 44 | 51.8% | 0 | 27.7s | 52.6% | 42.2% |
| echelon-right\|TH6 | 85 | 51 | 60.0% | 0 | 27.4s | 54.3% | 36.9% |
| cannon-screen\|TH6 | 84 | 66 | 78.6% | 0 | 30.4s | 58.2% | 20.2% |
| crossfire\|TH6 | 84 | 43 | 51.2% | 0 | 26.5s | 46.2% | 45.9% |
| corner-keep\|TH6 | 82 | 47 | 57.3% | 0 | 26.0s | 53.4% | 38.8% |
| echelon-left\|TH6 | 82 | 50 | 61.0% | 0 | 27.6s | 47.7% | 37.2% |
| kill-corridor\|TH6 | 82 | 52 | 63.4% | 0 | 28.4s | 57.0% | 34.4% |
| rear-keep\|TH6 | 82 | 45 | 54.9% | 0 | 26.8s | 51.1% | 42.9% |
| cannon-screen\|TH5 | 80 | 56 | 70.0% | 0 | 29.2s | 47.7% | 27.1% |
| diamond\|TH5 | 80 | 42 | 52.5% | 0 | 27.8s | 46.7% | 42.9% |
| echelon-left\|TH5 | 79 | 49 | 62.0% | 0 | 28.6s | 50.8% | 33.3% |
| echelon-right\|TH5 | 79 | 51 | 64.6% | 0 | 26.4s | 48.7% | 32.5% |
| crossfire\|TH5 | 78 | 44 | 56.4% | 0 | 25.1s | 47.0% | 37.8% |
| corner-keep\|TH5 | 77 | 33 | 42.9% | 0 | 29.4s | 46.4% | 47.2% |
| kill-corridor\|TH5 | 77 | 48 | 62.3% | 0 | 28.6s | 46.3% | 32.8% |
| rear-keep\|TH5 | 76 | 43 | 56.6% | 0 | 24.4s | 45.9% | 40.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1047 | 93 | 8.9% | 0 | 20.3s | 35.0% | 85.1% |
| mid | 1003 | 790 | 78.8% | 0 | 30.7s | 64.6% | 16.0% |
| maxed | 1001 | 39 | 3.9% | 0 | 21.8s | 22.5% | 90.6% |
| rushed-economy | 997 | 997 | 100.0% | 0 | 28.0s | 73.0% | 0.0% |
| mixed | 952 | 844 | 88.7% | 0 | 28.1s | 68.4% | 9.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2600 | 1431 | 55.0% | 0 | 22.5s | 42.5% | 38.8% |
| pure-unit-matrix | 2400 | 1332 | 55.5% | 0 | 29.2s | 63.0% | 43.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 492 | 54.7% | 0 | 26.6s | 62.3% | 44.3% |
| policy-exploration\|TH5 | 869 | 475 | 54.7% | 0 | 22.0s | 35.4% | 36.3% |
| policy-exploration\|TH6 | 868 | 486 | 56.0% | 0 | 23.1s | 42.9% | 38.9% |
| policy-exploration\|TH7 | 863 | 470 | 54.5% | 0 | 22.3s | 48.6% | 41.2% |
| pure-unit-matrix\|TH6 | 800 | 463 | 57.9% | 0 | 29.9s | 62.3% | 40.7% |
| pure-unit-matrix\|TH5 | 700 | 377 | 53.9% | 0 | 31.8s | 64.9% | 44.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2400 | 1332 | 55.5% | 0 | 29.2s | 63.0% | 43.1% |
| policy-exploration\|cannon-rally | 441 | 231 | 52.4% | 0 | 14.8s | 5.7% | 33.4% |
| policy-exploration\|none | 438 | 237 | 54.1% | 0 | 27.8s | 62.6% | 44.3% |
| policy-exploration\|cannon-focus | 432 | 237 | 54.9% | 0 | 27.4s | 63.1% | 43.9% |
| policy-exploration\|rally-core | 432 | 241 | 55.8% | 0 | 15.0s | 5.6% | 29.2% |
| policy-exploration\|cannon-medkit | 224 | 123 | 54.9% | 0 | 26.2s | 62.3% | 44.2% |
| policy-exploration\|medkit-entry | 218 | 123 | 56.4% | 0 | 25.9s | 61.6% | 42.8% |
| policy-exploration\|freeze-rage | 78 | 49 | 62.8% | 0 | 24.3s | 68.9% | 36.8% |
| policy-exploration\|freeze-defense | 72 | 43 | 59.7% | 0 | 27.6s | 66.4% | 38.6% |
| policy-exploration\|rage-entry | 68 | 36 | 52.9% | 0 | 23.5s | 60.0% | 45.1% |
| policy-exploration\|skeleton-barrel | 68 | 37 | 54.4% | 0 | 24.8s | 58.5% | 45.5% |
| policy-exploration\|rally-rage | 67 | 35 | 52.2% | 0 | 14.6s | 8.7% | 29.1% |
| policy-exploration\|freeze-barrel | 62 | 39 | 62.9% | 0 | 27.2s | 66.5% | 35.6% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 309 | 155 | 50.2% | 0 | 22.7s | 38.2% | 42.8% |
| policy-exploration\|vanguard-wedge | 292 | 143 | 49.0% | 0 | 23.1s | 40.1% | 44.3% |
| policy-exploration\|three-lane | 288 | 153 | 53.1% | 0 | 22.0s | 43.9% | 41.1% |
| policy-exploration\|dual-flank | 285 | 166 | 58.2% | 0 | 20.4s | 40.1% | 36.4% |
| policy-exploration\|right-flank | 259 | 155 | 59.8% | 0 | 22.5s | 40.2% | 34.3% |
| policy-exploration\|diamond | 254 | 134 | 52.8% | 0 | 22.5s | 46.4% | 42.3% |
| policy-exploration\|left-flank | 244 | 165 | 67.6% | 0 | 24.6s | 48.9% | 27.7% |
| pure-unit-matrix\|center-column | 240 | 121 | 50.4% | 0 | 29.6s | 62.0% | 47.2% |
| pure-unit-matrix\|diamond | 240 | 132 | 55.0% | 0 | 28.8s | 64.6% | 43.5% |
| pure-unit-matrix\|dual-flank | 240 | 129 | 53.8% | 0 | 28.0s | 65.2% | 44.5% |
| pure-unit-matrix\|edge-sweep | 240 | 135 | 56.3% | 0 | 27.1s | 63.9% | 43.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 130 | 54.2% | 0 | 30.0s | 61.1% | 45.4% |
| pure-unit-matrix\|left-flank | 240 | 146 | 60.8% | 0 | 32.1s | 63.0% | 36.6% |
| pure-unit-matrix\|right-flank | 240 | 149 | 62.1% | 0 | 31.1s | 61.3% | 35.6% |
| pure-unit-matrix\|three-lane | 240 | 133 | 55.4% | 0 | 27.6s | 64.0% | 43.9% |
| pure-unit-matrix\|vanguard-wedge | 240 | 126 | 52.5% | 0 | 29.5s | 60.1% | 46.9% |
| pure-unit-matrix\|wide-line | 240 | 131 | 54.6% | 0 | 28.5s | 64.8% | 44.5% |
| policy-exploration\|center-column | 238 | 132 | 55.5% | 0 | 23.1s | 45.5% | 38.3% |
| policy-exploration\|wide-line | 224 | 118 | 52.7% | 0 | 21.4s | 42.8% | 40.5% |
| policy-exploration\|edge-sweep | 207 | 110 | 53.1% | 0 | 22.4s | 40.7% | 38.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 533 | 301 | 56.5% | 0 | 22.5s | 43.9% | 36.9% |
| policy-exploration\|three-waves | 530 | 288 | 54.3% | 0 | 22.7s | 44.1% | 39.4% |
| policy-exploration\|drip | 514 | 278 | 54.1% | 0 | 22.4s | 40.2% | 39.7% |
| policy-exploration\|two-waves | 514 | 289 | 56.2% | 0 | 21.6s | 41.5% | 37.8% |
| policy-exploration\|rapid | 509 | 275 | 54.0% | 0 | 23.0s | 42.7% | 40.3% |
| pure-unit-matrix\|burst | 480 | 269 | 56.0% | 0 | 28.4s | 62.5% | 43.4% |
| pure-unit-matrix\|drip | 480 | 258 | 53.8% | 0 | 29.5s | 62.6% | 44.3% |
| pure-unit-matrix\|rapid | 480 | 266 | 55.4% | 0 | 30.0s | 63.5% | 42.5% |
| pure-unit-matrix\|three-waves | 480 | 266 | 55.4% | 0 | 28.5s | 63.1% | 43.3% |
| pure-unit-matrix\|two-waves | 480 | 273 | 56.9% | 0 | 29.8s | 63.4% | 42.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 1305 | 717 | 54.9% | 0 | 23.1s | 42.7% | 39.0% |
| policy-exploration\|roster-order | 1295 | 714 | 55.1% | 0 | 21.8s | 42.4% | 38.6% |
| pure-unit-matrix\|roster-order | 1200 | 671 | 55.9% | 0 | 29.0s | 63.5% | 42.4% |
| pure-unit-matrix\|tank-front-support-rear | 1200 | 661 | 55.1% | 0 | 29.5s | 62.5% | 43.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 468 | 212 | 45.3% | 0 | 34.6s | 52.8% | 52.7% |
| pure-fire_dragon | 450 | 275 | 61.1% | 0 | 19.8s | 61.1% | 36.2% |
| pure-mage | 435 | 192 | 44.1% | 0 | 23.1s | 50.8% | 54.1% |
| pure-mimic | 425 | 236 | 55.5% | 0 | 32.5s | 52.8% | 40.0% |
| pure-knight | 400 | 247 | 61.8% | 0 | 31.0s | 60.4% | 35.9% |
| pure-pea_shooter | 391 | 192 | 49.1% | 0 | 27.1s | 53.7% | 48.1% |
| pure-demon_king | 371 | 266 | 71.7% | 0 | 28.1s | 66.1% | 24.6% |
| pure-mechanical_dragon | 268 | 154 | 57.5% | 0 | 24.4s | 64.6% | 41.8% |
| random-3 | 173 | 98 | 56.6% | 0 | 21.9s | 36.4% | 37.4% |
| random-1 | 168 | 89 | 53.0% | 0 | 21.1s | 39.9% | 41.0% |
| random-5 | 168 | 96 | 57.1% | 0 | 22.2s | 49.3% | 38.3% |
| melee-pressure | 163 | 94 | 57.7% | 0 | 23.9s | 42.5% | 33.9% |
| trap-runner-mix | 162 | 94 | 58.0% | 0 | 22.5s | 42.1% | 32.4% |
| balanced | 158 | 105 | 66.5% | 0 | 21.2s | 51.7% | 28.8% |
| pure-necromancer | 148 | 69 | 46.6% | 0 | 28.3s | 46.5% | 51.8% |
| air-pressure | 126 | 79 | 62.7% | 0 | 19.9s | 55.9% | 34.6% |
| support-mix | 82 | 47 | 57.3% | 0 | 21.4s | 41.6% | 37.9% |
| ranged-pressure | 77 | 35 | 45.5% | 0 | 20.9s | 38.1% | 49.4% |
| hero-necro-dragon-mages | 76 | 40 | 52.6% | 0 | 19.2s | 41.5% | 41.0% |
| random-4 | 76 | 34 | 44.7% | 0 | 21.9s | 35.6% | 42.4% |
| random-6 | 76 | 34 | 44.7% | 0 | 21.5s | 35.2% | 43.4% |
| frontline-ranged | 72 | 40 | 55.6% | 0 | 20.1s | 43.4% | 40.9% |
| random-2 | 67 | 35 | 52.2% | 0 | 21.3s | 42.1% | 42.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| edge-sweep__burst__roster-order | 57 | 31 | 54.4% | 0 | 24.2s | 60.2% | 43.3% |
| inverted-wedge__burst__roster-order | 57 | 37 | 64.9% | 0 | 24.3s | 47.5% | 31.1% |
| inverted-wedge__drip__roster-order | 57 | 24 | 42.1% | 0 | 23.7s | 42.3% | 52.7% |
| inverted-wedge__rapid__roster-order | 57 | 31 | 54.4% | 0 | 24.8s | 55.8% | 43.1% |
| inverted-wedge__two-waves__tank-front-support-rear | 57 | 29 | 50.9% | 0 | 28.3s | 46.1% | 44.1% |
| diamond__drip__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 28.4s | 54.3% | 45.9% |
| dual-flank__three-waves__tank-front-support-rear | 56 | 33 | 58.9% | 0 | 22.8s | 48.9% | 37.1% |
| inverted-wedge__burst__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 24.2s | 38.7% | 40.6% |
| inverted-wedge__three-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 27.5s | 43.6% | 43.1% |
| inverted-wedge__two-waves__roster-order | 56 | 30 | 53.6% | 0 | 25.7s | 41.8% | 43.7% |
| three-lane__burst__roster-order | 56 | 30 | 53.6% | 0 | 22.4s | 48.1% | 41.0% |
| three-lane__rapid__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 24.2s | 44.3% | 47.1% |
| three-lane__two-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 26.2s | 46.7% | 44.4% |
| vanguard-wedge__three-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 25.6s | 52.6% | 45.1% |
| vanguard-wedge__two-waves__roster-order | 56 | 36 | 64.3% | 0 | 24.3s | 43.3% | 30.2% |
| dual-flank__drip__tank-front-support-rear | 55 | 30 | 54.5% | 0 | 24.4s | 49.1% | 36.6% |
| dual-flank__rapid__roster-order | 55 | 34 | 61.8% | 0 | 23.9s | 50.8% | 33.7% |
| right-flank__drip__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.2s | 48.4% | 46.8% |
| right-flank__three-waves__roster-order | 55 | 36 | 65.5% | 0 | 25.8s | 48.1% | 27.4% |
| three-lane__rapid__roster-order | 55 | 28 | 50.9% | 0 | 22.9s | 57.2% | 45.9% |
| three-lane__three-waves__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 24.6s | 58.2% | 37.5% |
| three-lane__two-waves__roster-order | 55 | 30 | 54.5% | 0 | 22.9s | 49.7% | 43.1% |
| vanguard-wedge__burst__tank-front-support-rear | 55 | 34 | 61.8% | 0 | 26.1s | 57.7% | 36.7% |
| vanguard-wedge__drip__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 26.2s | 51.5% | 48.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 24.8s | 42.6% | 46.4% |
| vanguard-wedge__three-waves__roster-order | 55 | 26 | 47.3% | 0 | 25.1s | 53.4% | 49.4% |
| dual-flank__burst__tank-front-support-rear | 54 | 30 | 55.6% | 0 | 22.7s | 47.4% | 42.1% |
| dual-flank__three-waves__roster-order | 54 | 30 | 55.6% | 0 | 24.4s | 57.7% | 43.4% |
| dual-flank__two-waves__roster-order | 54 | 28 | 51.9% | 0 | 21.6s | 45.5% | 46.0% |
| right-flank__drip__roster-order | 54 | 39 | 72.2% | 0 | 25.0s | 51.2% | 23.7% |
| center-column__two-waves__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.3s | 51.3% | 43.2% |
| diamond__burst__tank-front-support-rear | 51 | 26 | 51.0% | 0 | 23.3s | 53.0% | 46.0% |
| diamond__rapid__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 27.1s | 55.5% | 49.9% |
| diamond__three-waves__roster-order | 51 | 21 | 41.2% | 0 | 22.3s | 47.1% | 56.2% |
| edge-sweep__burst__tank-front-support-rear | 51 | 26 | 51.0% | 0 | 22.3s | 43.0% | 44.0% |
| inverted-wedge__drip__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.9s | 59.7% | 46.0% |
| inverted-wedge__rapid__tank-front-support-rear | 51 | 29 | 56.9% | 0 | 29.4s | 60.2% | 41.8% |
| inverted-wedge__three-waves__roster-order | 51 | 21 | 41.2% | 0 | 25.3s | 49.1% | 54.0% |
| left-flank__burst__roster-order | 51 | 30 | 58.8% | 0 | 26.6s | 60.6% | 38.8% |
| left-flank__rapid__tank-front-support-rear | 51 | 39 | 76.5% | 0 | 32.8s | 55.5% | 19.9% |
| center-column__drip__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 25.3s | 44.3% | 42.1% |
| center-column__rapid__roster-order | 50 | 24 | 48.0% | 0 | 23.2s | 46.1% | 42.5% |
| center-column__three-waves__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 26.6s | 56.2% | 50.0% |
| center-column__two-waves__roster-order | 50 | 33 | 66.0% | 0 | 28.8s | 71.0% | 33.1% |
| diamond__burst__roster-order | 50 | 29 | 58.0% | 0 | 23.6s | 55.1% | 37.4% |
| diamond__drip__roster-order | 50 | 29 | 58.0% | 0 | 24.0s | 57.8% | 40.0% |
| diamond__two-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 29.2s | 67.4% | 39.2% |
| dual-flank__drip__roster-order | 50 | 27 | 54.0% | 0 | 24.7s | 51.2% | 44.6% |
| left-flank__drip__roster-order | 50 | 33 | 66.0% | 0 | 28.2s | 62.0% | 27.2% |
| left-flank__rapid__roster-order | 50 | 27 | 54.0% | 0 | 27.7s | 50.7% | 36.4% |
| left-flank__three-waves__roster-order | 50 | 31 | 62.0% | 0 | 27.6s | 55.3% | 35.1% |
| right-flank__burst__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 32.2s | 56.0% | 36.0% |
| right-flank__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 25.0s | 52.8% | 41.1% |
| three-lane__burst__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 26.7s | 63.3% | 33.1% |
| three-lane__drip__roster-order | 50 | 25 | 50.0% | 0 | 22.9s | 58.5% | 46.1% |
| three-lane__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 25.0s | 46.7% | 39.9% |
| vanguard-wedge__burst__roster-order | 50 | 23 | 46.0% | 0 | 25.9s | 48.9% | 49.0% |
| vanguard-wedge__drip__roster-order | 50 | 23 | 46.0% | 0 | 28.1s | 42.4% | 50.4% |
| vanguard-wedge__rapid__roster-order | 50 | 23 | 46.0% | 0 | 29.3s | 51.3% | 50.3% |
| vanguard-wedge__two-waves__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 24.7s | 47.2% | 51.0% |
| wide-line__drip__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 28.9s | 45.1% | 42.5% |
| wide-line__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.9s | 64.8% | 35.5% |
| wide-line__two-waves__roster-order | 50 | 32 | 64.0% | 0 | 26.1s | 64.5% | 33.7% |
| center-column__burst__tank-front-support-rear | 49 | 17 | 34.7% | 0 | 26.5s | 46.2% | 62.3% |
| dual-flank__burst__roster-order | 49 | 28 | 57.1% | 0 | 24.7s | 55.6% | 36.8% |
| dual-flank__rapid__tank-front-support-rear | 49 | 29 | 59.2% | 0 | 25.7s | 56.3% | 35.4% |
| dual-flank__two-waves__tank-front-support-rear | 49 | 26 | 53.1% | 0 | 24.6s | 54.8% | 46.0% |
| left-flank__three-waves__tank-front-support-rear | 49 | 31 | 63.3% | 0 | 27.2s | 59.7% | 36.6% |
| left-flank__two-waves__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 26.7s | 57.8% | 32.5% |
| right-flank__burst__roster-order | 49 | 35 | 71.4% | 0 | 25.7s | 46.9% | 25.9% |
| right-flank__rapid__tank-front-support-rear | 49 | 25 | 51.0% | 0 | 25.6s | 47.0% | 45.5% |
| right-flank__three-waves__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 26.6s | 49.3% | 31.2% |
| wide-line__rapid__tank-front-support-rear | 49 | 25 | 51.0% | 0 | 27.8s | 58.3% | 46.9% |
| wide-line__three-waves__roster-order | 49 | 20 | 40.8% | 0 | 25.6s | 50.0% | 50.6% |
| center-column__drip__roster-order | 45 | 21 | 46.7% | 0 | 26.7s | 51.9% | 50.8% |
| center-column__three-waves__roster-order | 45 | 30 | 66.7% | 0 | 26.8s | 55.7% | 28.8% |
| diamond__rapid__roster-order | 45 | 29 | 64.4% | 0 | 28.7s | 61.8% | 34.1% |
| diamond__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 23.0s | 47.8% | 34.7% |
| diamond__two-waves__roster-order | 45 | 23 | 51.1% | 0 | 25.7s | 52.4% | 42.7% |
| edge-sweep__rapid__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 27.7s | 52.6% | 44.7% |
| edge-sweep__three-waves__roster-order | 45 | 26 | 57.8% | 0 | 27.0s | 62.3% | 38.6% |
| left-flank__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 30.3s | 55.1% | 37.4% |
| left-flank__two-waves__roster-order | 45 | 29 | 64.4% | 0 | 29.4s | 48.9% | 30.6% |
| three-lane__drip__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 28.8s | 60.7% | 45.1% |
| wide-line__burst__tank-front-support-rear | 45 | 28 | 62.2% | 0 | 23.4s | 55.4% | 32.7% |
| center-column__burst__roster-order | 44 | 29 | 65.9% | 0 | 29.7s | 60.0% | 28.4% |
| center-column__rapid__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 25.2s | 56.6% | 44.7% |
| edge-sweep__drip__roster-order | 44 | 21 | 47.7% | 0 | 21.6s | 39.9% | 40.8% |
| edge-sweep__rapid__roster-order | 44 | 27 | 61.4% | 0 | 25.9s | 50.2% | 36.5% |
| edge-sweep__two-waves__tank-front-support-rear | 44 | 28 | 63.6% | 0 | 24.4s | 54.1% | 32.4% |
| left-flank__drip__tank-front-support-rear | 44 | 32 | 72.7% | 0 | 27.1s | 51.9% | 26.5% |
| right-flank__rapid__roster-order | 44 | 23 | 52.3% | 0 | 28.1s | 53.6% | 42.6% |
| right-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 24.9s | 50.5% | 30.3% |
| wide-line__burst__roster-order | 44 | 19 | 43.2% | 0 | 22.6s | 60.0% | 56.8% |
| wide-line__drip__roster-order | 44 | 23 | 52.3% | 0 | 22.8s | 49.7% | 42.5% |
| wide-line__two-waves__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 22.2s | 40.1% | 46.5% |
| edge-sweep__drip__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 25.8s | 49.1% | 37.1% |
| edge-sweep__three-waves__tank-front-support-rear | 39 | 19 | 48.7% | 0 | 25.4s | 60.0% | 50.6% |
| edge-sweep__two-waves__roster-order | 39 | 21 | 53.8% | 0 | 25.9s | 60.7% | 42.6% |
| wide-line__rapid__roster-order | 39 | 23 | 59.0% | 0 | 24.2s | 51.9% | 38.3% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 549 | 285 | 51.9% | 0 | 25.9s | 48.2% | 43.9% |
| vanguard-wedge | 532 | 269 | 50.6% | 0 | 26.0s | 49.2% | 45.5% |
| three-lane | 528 | 286 | 54.2% | 0 | 24.6s | 53.1% | 42.4% |
| dual-flank | 525 | 295 | 56.2% | 0 | 23.9s | 51.6% | 40.1% |
| right-flank | 499 | 304 | 60.9% | 0 | 26.6s | 50.3% | 35.0% |
| diamond | 494 | 266 | 53.8% | 0 | 25.5s | 55.2% | 42.9% |
| left-flank | 484 | 311 | 64.3% | 0 | 28.4s | 55.9% | 32.1% |
| center-column | 478 | 253 | 52.9% | 0 | 26.4s | 53.8% | 42.8% |
| wide-line | 464 | 249 | 53.7% | 0 | 25.1s | 54.2% | 42.5% |
| edge-sweep | 447 | 245 | 54.8% | 0 | 24.9s | 53.2% | 41.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1013 | 570 | 56.3% | 0 | 25.3s | 52.7% | 40.0% |
| three-waves | 1010 | 554 | 54.9% | 0 | 25.5s | 53.1% | 41.3% |
| drip | 994 | 536 | 53.9% | 0 | 25.8s | 51.0% | 41.9% |
| two-waves | 994 | 562 | 56.5% | 0 | 25.6s | 52.1% | 39.9% |
| rapid | 989 | 541 | 54.7% | 0 | 26.4s | 52.8% | 41.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2505 | 1378 | 55.0% | 0 | 26.2s | 52.2% | 41.3% |
| roster-order | 2495 | 1385 | 55.5% | 0 | 25.3s | 52.6% | 40.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2838 | 1569 | 55.3% | 0 | 29.0s | 62.9% | 43.3% |
| cannon-rally | 441 | 231 | 52.4% | 0 | 14.8s | 5.7% | 33.4% |
| cannon-focus | 432 | 237 | 54.9% | 0 | 27.4s | 63.1% | 43.9% |
| rally-core | 432 | 241 | 55.8% | 0 | 15.0s | 5.6% | 29.2% |
| cannon-medkit | 224 | 123 | 54.9% | 0 | 26.2s | 62.3% | 44.2% |
| medkit-entry | 218 | 123 | 56.4% | 0 | 25.9s | 61.6% | 42.8% |
| freeze-rage | 78 | 49 | 62.8% | 0 | 24.3s | 68.9% | 36.8% |
| freeze-defense | 72 | 43 | 59.7% | 0 | 27.6s | 66.4% | 38.6% |
| rage-entry | 68 | 36 | 52.9% | 0 | 23.5s | 60.0% | 45.1% |
| skeleton-barrel | 68 | 37 | 54.4% | 0 | 24.8s | 58.5% | 45.5% |
| rally-rage | 67 | 35 | 52.2% | 0 | 14.6s | 8.7% | 29.1% |
| freeze-barrel | 62 | 39 | 62.9% | 0 | 27.2s | 66.5% | 35.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 3045 | 1684 | 55.3% | 0 | 27.9s | 58.8% | 42.4% |
| epic | 656 | 359 | 54.7% | 0 | 21.8s | 42.5% | 38.8% |
| legendary | 655 | 369 | 56.3% | 0 | 22.5s | 42.4% | 37.9% |
| unrevealed | 644 | 351 | 54.5% | 0 | 22.6s | 41.9% | 39.0% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2900 | 1630 | 56.2% | 0 | 28.2s | 59.8% | 41.7% |
| ward-3 | 1000 | 532 | 53.2% | 0 | 21.9s | 41.8% | 40.5% |
| ward-2 | 600 | 315 | 52.5% | 0 | 22.8s | 42.0% | 41.0% |
| ward-1 | 500 | 286 | 57.2% | 0 | 22.5s | 42.9% | 37.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2763 | 55.3% | 0 | 25.7s | 52.4% | 40.9% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1853 | 1057 | 57.0% | 0 | 20.9s | 47.9% | 37.5% |
| knight | 1841 | 1053 | 57.2% | 0 | 23.7s | 46.3% | 36.9% |
| demon_king | 1812 | 1072 | 59.2% | 0 | 23.0s | 47.3% | 34.6% |
| mage | 1790 | 939 | 52.5% | 0 | 21.8s | 44.3% | 42.2% |
| archer | 1747 | 919 | 52.6% | 0 | 25.1s | 45.1% | 42.0% |
| mimic | 1634 | 923 | 56.5% | 0 | 24.7s | 44.3% | 36.8% |
| pea_shooter | 1196 | 613 | 51.3% | 0 | 23.4s | 44.7% | 43.3% |
| mechanical_dragon | 892 | 498 | 55.8% | 0 | 22.1s | 51.2% | 41.0% |
| necromancer | 382 | 192 | 50.3% | 0 | 24.1s | 46.8% | 47.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 48.7% | 43.1%-54.3% | 59.1% | 50.6% | 26.3% |
| demon_king | 300 | 70.7% | 65.3%-75.5% | 72.5% | 26.3% | 56.7% |
| fire_dragon | 300 | 61.0% | 55.4%-66.3% | 68.4% | 37.5% | 52.6% |
| knight | 300 | 58.0% | 52.3%-63.4% | 65.5% | 40.4% | 40.4% |
| mage | 300 | 46.3% | 40.8%-52.0% | 57.5% | 52.8% | 28.3% |
| mechanical_dragon | 200 | 60.0% | 53.1%-66.5% | 68.8% | 39.9% | 49.0% |
| mimic | 300 | 53.0% | 47.3%-58.6% | 58.8% | 45.2% | 45.0% |
| necromancer | 100 | 51.0% | 41.3%-60.6% | 54.7% | 48.2% | 40.3% |
| pea_shooter | 300 | 49.3% | 43.7%-55.0% | 58.3% | 49.6% | 31.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 52.0% | 42.3%-61.5% | 64.8% | 47.8% | 30.2% |
| archer\|TH6 | 100 | 49.0% | 39.4%-58.7% | 56.6% | 49.4% | 23.0% |
| archer\|TH7 | 100 | 45.0% | 35.6%-54.8% | 56.3% | 54.7% | 25.8% |
| demon_king\|TH5 | 100 | 69.0% | 59.4%-77.2% | 74.4% | 27.3% | 53.8% |
| demon_king\|TH6 | 100 | 77.0% | 67.8%-84.2% | 73.7% | 18.8% | 61.9% |
| demon_king\|TH7 | 100 | 66.0% | 56.3%-74.5% | 69.7% | 32.7% | 54.6% |
| fire_dragon\|TH5 | 100 | 60.0% | 50.2%-69.1% | 70.3% | 38.4% | 48.3% |
| fire_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.7% | 39.0% | 52.8% |
| fire_dragon\|TH7 | 100 | 63.0% | 53.2%-71.8% | 70.1% | 35.1% | 56.8% |
| knight\|TH5 | 100 | 54.0% | 44.3%-63.4% | 65.1% | 43.1% | 36.3% |
| knight\|TH6 | 100 | 61.0% | 51.2%-70.0% | 65.0% | 37.4% | 41.4% |
| knight\|TH7 | 100 | 59.0% | 49.2%-68.1% | 66.2% | 40.6% | 43.5% |
| mage\|TH5 | 100 | 43.0% | 33.7%-52.8% | 58.8% | 56.9% | 27.9% |
| mage\|TH6 | 100 | 44.0% | 34.7%-53.8% | 53.1% | 55.1% | 23.9% |
| mage\|TH7 | 100 | 52.0% | 42.3%-61.5% | 60.5% | 46.3% | 33.0% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.9% | 40.9% | 45.1% |
| mechanical_dragon\|TH7 | 100 | 61.0% | 51.2%-70.0% | 71.4% | 39.0% | 52.8% |
| mimic\|TH5 | 100 | 47.0% | 37.5%-56.7% | 57.4% | 50.6% | 37.3% |
| mimic\|TH6 | 100 | 64.0% | 54.2%-72.7% | 64.4% | 34.1% | 55.4% |
| mimic\|TH7 | 100 | 48.0% | 38.5%-57.7% | 54.8% | 50.8% | 42.3% |
| necromancer\|TH7 | 100 | 51.0% | 41.3%-60.6% | 54.7% | 48.2% | 40.3% |
| pea_shooter\|TH5 | 100 | 52.0% | 42.3%-61.5% | 63.1% | 46.4% | 35.9% |
| pea_shooter\|TH6 | 100 | 49.0% | 39.4%-58.7% | 55.1% | 51.0% | 26.6% |
| pea_shooter\|TH7 | 100 | 47.0% | 37.5%-56.7% | 56.8% | 51.4% | 31.0% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 59.3% | 55.6% | 23.3% |
| archer\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 63.6% | 60.7% | 27.2% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 55.0% | 46.7% | 33.3% |
| archer\|compact-core | 18 | 33.3% | 16.3%-56.3% | 55.3% | 63.3% | 20.0% |
| archer\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 58.9% | 52.9% | 19.9% |
| archer\|crossfire | 15 | 40.0% | 19.8%-64.3% | 55.5% | 60.0% | 25.2% |
| archer\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 68.0% | 48.3% | 24.2% |
| archer\|diamond | 15 | 53.3% | 30.1%-75.2% | 59.5% | 46.7% | 23.3% |
| archer\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 60.0% | 40.0% | 30.8% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 61.6% | 40.0% | 32.1% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 52.7% | 46.7% | 28.6% |
| archer\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.3% | 55.0% | 22.5% |
| archer\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 58.9% | 53.3% | 22.2% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 57.4% | 55.6% | 23.3% |
| archer\|southern-funnel | 18 | 38.9% | 20.3%-61.4% | 51.3% | 56.0% | 22.8% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 61.9% | 38.7% | 34.4% |
| archer\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 57.8% | 44.4% | 32.6% |
| archer\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 62.9% | 44.4% | 28.6% |
| demon_king\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 68.6% | 44.5% | 46.3% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 71.4% | 44.6% | 41.4% |
| demon_king\|cannon-screen | 15 | 100.0% | 79.6%-100.0% | 72.5% | 0.0% | 68.1% |
| demon_king\|compact-core | 18 | 55.6% | 33.7%-75.4% | 65.0% | 43.1% | 45.7% |
| demon_king\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 66.1% | 31.2% | 49.6% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 69.5% | 23.7% | 51.9% |
| demon_king\|defense-ring | 18 | 72.2% | 49.1%-87.5% | 75.6% | 23.6% | 58.6% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 73.2% | 35.9% | 53.3% |
| demon_king\|echelon-left | 15 | 86.7% | 62.1%-96.3% | 75.0% | 10.0% | 62.2% |
| demon_king\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 76.1% | 26.7% | 61.5% |
| demon_king\|kill-corridor | 15 | 100.0% | 79.6%-100.0% | 84.3% | 0.0% | 71.1% |
| demon_king\|layered-rings | 18 | 61.1% | 38.6%-79.7% | 72.2% | 37.2% | 48.8% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 70.2% | 32.1% | 59.3% |
| demon_king\|resource-shield | 18 | 55.6% | 33.7%-75.4% | 66.1% | 44.4% | 48.1% |
| demon_king\|southern-funnel | 18 | 77.8% | 54.8%-91.0% | 73.5% | 22.2% | 61.7% |
| demon_king\|split-core | 18 | 72.2% | 49.1%-87.5% | 71.4% | 24.4% | 63.0% |
| demon_king\|trap-lanes | 18 | 77.8% | 54.8%-91.0% | 75.6% | 14.9% | 63.0% |
| demon_king\|wide-spread | 18 | 88.9% | 67.2%-96.9% | 80.3% | 6.1% | 71.6% |
| fire_dragon\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 64.4% | 55.6% | 43.1% |
| fire_dragon\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 61.9% | 51.7% | 40.3% |
| fire_dragon\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 73.0% | 24.1% | 58.3% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.3% | 50.0% | 41.7% |
| fire_dragon\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 64.8% | 40.0% | 48.3% |
| fire_dragon\|crossfire | 15 | 60.0% | 35.7%-80.2% | 63.4% | 40.0% | 50.0% |
| fire_dragon\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 70.3% | 38.9% | 48.6% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 70.5% | 35.9% | 51.7% |
| fire_dragon\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 71.6% | 33.3% | 58.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 66.8% | 40.0% | 56.7% |
| fire_dragon\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 78.0% | 18.5% | 66.7% |
| fire_dragon\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 66.9% | 54.0% | 40.3% |
| fire_dragon\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 71.6% | 32.1% | 56.7% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 60.8% | 49.2% | 44.4% |
| fire_dragon\|southern-funnel | 18 | 72.2% | 49.1%-87.5% | 71.4% | 22.6% | 61.1% |
| fire_dragon\|split-core | 18 | 72.2% | 49.1%-87.5% | 69.9% | 22.7% | 61.1% |
| fire_dragon\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 70.1% | 37.5% | 56.9% |
| fire_dragon\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 78.4% | 22.2% | 66.7% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 67.2% | 49.5% | 38.4% |
| knight\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 67.8% | 52.8% | 35.8% |
| knight\|cannon-screen | 15 | 86.7% | 62.1%-96.3% | 68.6% | 13.2% | 49.5% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 57.2% | 55.6% | 32.3% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.0% | 42.3% | 36.6% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 65.9% | 39.6% | 37.9% |
| knight\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 69.7% | 41.7% | 38.6% |
| knight\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.3% | 40.0% | 40.7% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 62.0% | 40.0% | 41.8% |
| knight\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 65.5% | 33.3% | 46.4% |
| knight\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 63.9% | 38.3% | 44.7% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.9% | 53.2% | 30.6% |
| knight\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 59.8% | 46.1% | 39.9% |
| knight\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 58.9% | 50.0% | 33.0% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 66.7% | 33.3% | 44.2% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.6% | 33.3% | 49.4% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 69.7% | 31.7% | 47.4% |
| knight\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 73.5% | 27.5% | 42.3% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.0% | 61.1% | 24.2% |
| mage\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 55.9% | 55.6% | 32.8% |
| mage\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 33.3% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 56.6% | 59.3% | 21.2% |
| mage\|corner-keep | 15 | 33.3% | 15.2%-58.3% | 55.5% | 62.2% | 17.0% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 54.1% | 53.0% | 26.1% |
| mage\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 67.0% | 44.4% | 31.8% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 60.7% | 53.3% | 29.7% |
| mage\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 55.9% | 53.3% | 30.3% |
| mage\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 57.3% | 46.7% | 33.9% |
| mage\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 54.5% | 40.0% | 32.7% |
| mage\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 58.9% | 54.5% | 22.2% |
| mage\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 57.3% | 60.0% | 26.1% |
| mage\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 56.6% | 55.6% | 24.7% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 49.6% | 66.7% | 23.7% |
| mage\|split-core | 18 | 50.0% | 29.0%-71.0% | 61.7% | 45.0% | 36.9% |
| mage\|trap-lanes | 18 | 50.0% | 29.0%-71.0% | 58.7% | 47.4% | 32.3% |
| mage\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 65.5% | 44.4% | 30.3% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 68.6% | 49.8% | 43.2% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 66.1% | 50.0% | 42.4% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 72.7% | 40.0% | 53.6% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 61.1% | 50.0% | 38.6% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 65.7% | 40.0% | 50.9% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 67.0% | 40.0% | 46.4% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 72.5% | 33.3% | 52.3% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 65.0% | 40.0% | 45.5% |
| mechanical_dragon\|echelon-left | 10 | 70.0% | 39.7%-89.2% | 69.0% | 30.0% | 53.6% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 69.3% | 40.0% | 55.5% |
| mechanical_dragon\|kill-corridor | 10 | 90.0% | 59.6%-98.2% | 87.3% | 10.0% | 72.7% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 69.2% | 50.0% | 40.9% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 70.3% | 40.0% | 50.0% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.9% | 50.0% | 40.9% |
| mechanical_dragon\|southern-funnel | 12 | 66.7% | 39.1%-86.2% | 67.5% | 33.3% | 44.7% |
| mechanical_dragon\|split-core | 12 | 58.3% | 32.0%-80.7% | 65.3% | 40.7% | 50.0% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 69.2% | 41.7% | 51.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 72.8% | 33.3% | 54.5% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 57.6% | 52.9% | 38.9% |
| mimic\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 55.1% | 61.1% | 37.3% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 63.0% | 33.3% | 55.2% |
| mimic\|compact-core | 18 | 33.3% | 16.3%-56.3% | 50.4% | 66.5% | 33.3% |
| mimic\|corner-keep | 15 | 40.0% | 19.8%-64.3% | 55.2% | 58.2% | 37.1% |
| mimic\|crossfire | 15 | 53.3% | 30.1%-75.2% | 55.9% | 46.1% | 42.9% |
| mimic\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 61.4% | 44.4% | 45.2% |
| mimic\|diamond | 15 | 60.0% | 35.7%-80.2% | 58.4% | 39.7% | 41.0% |
| mimic\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 58.6% | 35.4% | 51.4% |
| mimic\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 63.0% | 26.1% | 52.4% |
| mimic\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 62.7% | 25.9% | 53.3% |
| mimic\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 56.3% | 65.0% | 31.7% |
| mimic\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 63.4% | 38.3% | 52.4% |
| mimic\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 49.8% | 65.2% | 32.5% |
| mimic\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 61.7% | 37.9% | 53.2% |
| mimic\|split-core | 18 | 50.0% | 29.0%-71.0% | 61.6% | 50.0% | 47.6% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 59.7% | 32.9% | 54.8% |
| mimic\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 66.1% | 24.6% | 54.0% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 54.8% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 47.8% | 53.5% | 33.3% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 47.3% | 66.7% | 33.3% |
| necromancer\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 62.9% | 33.3% | 61.1% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 48.4% | 66.7% | 27.8% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 40.3% | 66.7% | 22.2% |
| necromancer\|southern-funnel | 6 | 50.0% | 18.8%-81.2% | 51.6% | 50.0% | 33.3% |
| necromancer\|split-core | 6 | 66.7% | 30.0%-90.3% | 55.9% | 33.3% | 50.0% |
| necromancer\|trap-lanes | 6 | 50.0% | 18.8%-81.2% | 55.4% | 50.0% | 50.0% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 64.5% | 33.3% | 55.6% |
| pea_shooter\|asymmetric-left | 18 | 33.3% | 16.3%-56.3% | 54.2% | 66.7% | 24.1% |
| pea_shooter\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 58.3% | 55.8% | 30.2% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.9% | 40.0% | 34.1% |
| pea_shooter\|compact-core | 18 | 38.9% | 20.3%-61.4% | 52.7% | 61.1% | 24.7% |
| pea_shooter\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 57.7% | 48.3% | 23.0% |
| pea_shooter\|crossfire | 15 | 53.3% | 30.1%-75.2% | 57.3% | 46.7% | 32.6% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 64.4% | 45.4% | 27.8% |
| pea_shooter\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.1% | 53.3% | 28.9% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 56.6% | 46.7% | 33.3% |
| pea_shooter\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 58.4% | 46.3% | 37.8% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.7% | 34.1% |
| pea_shooter\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 56.3% | 55.6% | 27.2% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 61.1% | 46.7% | 36.3% |
| pea_shooter\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 55.3% | 52.4% | 25.9% |
| pea_shooter\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 57.8% | 50.0% | 30.2% |
| pea_shooter\|split-core | 18 | 61.1% | 38.6%-79.7% | 60.4% | 38.9% | 37.0% |
| pea_shooter\|trap-lanes | 18 | 50.0% | 29.0%-71.0% | 58.0% | 50.0% | 37.7% |
| pea_shooter\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 67.0% | 38.9% | 37.7% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 19 | 0.0% | 96.9% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 19 | 0.0% | 95.6% |
| th7-trap-lanes-138 | 7 | trap-lanes | maxed | 18 | 0.0% | 99.7% |
| th7-compact-core-003 | 7 | compact-core | maxed | 18 | 0.0% | 98.5% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 18 | 0.0% | 98.4% |
| th7-corner-keep-087 | 7 | corner-keep | maxed | 18 | 0.0% | 98.3% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 95.6% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 95.0% |
| th7-crossfire-153 | 7 | crossfire | maxed | 18 | 0.0% | 94.8% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 18 | 0.0% | 94.4% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 18 | 0.0% | 93.5% |
| th7-echelon-right-105 | 7 | echelon-right | maxed | 18 | 0.0% | 93.3% |
| th7-compact-core-273 | 7 | compact-core | maxed | 18 | 0.0% | 92.9% |
| th7-split-core-120 | 7 | split-core | maxed | 18 | 0.0% | 88.8% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 83.7% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 9,108 | 6,820 | 2,277 | 1,705 |  |
| necromancer | 7 | 15 | 38,352 | 11,711.11 | 2,556.8 | 780.74 |  |
| fire_dragon | 7 | 10 | 17,480 | 7,805.71 | 1,748 | 780.57 |  |
| archer | 7 | 1 | 1,848 | 638.71 | 1,848 | 638.71 |  |
| demon_king | 7 | 5 | 22,284 | 2,413.33 | 4,456.8 | 482.67 |  |
| mechanical_dragon | 7 | 4 | 6,556 | 1,858.25 | 1,639 | 464.56 | chain x3 |
| knight | 7 | 1 | 4,152 | 448.89 | 4,152 | 448.89 |  |
| mimic | 7 | 6 | 16,380 | 1,320.75 | 2,730 | 220.13 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| pea_shooter | 7 | 5 | 11,550 | 816 | 2,310 | 163.2 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 70.7% attacker wins across 300 samples (reference 55.5%).
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-271 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-034 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-286 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-136 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-292 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-295 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-287 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-wide-spread-236 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-296 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-194 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-104 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-255 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-288 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-069 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-177 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-120 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-138 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-237 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-024 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-294 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th5-compact-core-109 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-compact-core-163 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-compact-core-217 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-compact-core-271 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-193 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-corner-keep-247 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-043 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-097 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-112 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-220 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-034 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-diamond-142 has 0.0% attacker wins across 16 samples.
- 152 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
