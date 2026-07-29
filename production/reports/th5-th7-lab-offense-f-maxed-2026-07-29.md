# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:19:04.820Z
**Seed:** 55001
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 12):** 9
**Lab offense scales:** L5=1.1x, L6=1.47x, L7=1.7x
**Lab defense damage scale:** 1x
**Replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 110.9s

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
| 5000 | 3235 | 64.7% | 0 | 24.6s | 59.1% | 32.0% | 44.9% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 1275 | 72.6% | 0 | 23.0s | 64.7% | 25.2% |
| TH6->TH6 | 1669 | 1101 | 66.0% | 0 | 25.2s | 62.7% | 31.2% |
| TH5->TH5 | 1576 | 859 | 54.5% | 0 | 25.8s | 48.3% | 40.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 233 | 57.4% | 0 | 22.4s | 56.4% | 38.0% |
| resource-shield | 381 | 212 | 55.6% | 0 | 23.0s | 54.1% | 40.1% |
| asymmetric-right | 376 | 228 | 60.6% | 0 | 24.0s | 59.2% | 35.0% |
| crossfire | 339 | 228 | 67.3% | 0 | 24.6s | 57.3% | 30.6% |
| diamond | 338 | 228 | 67.5% | 0 | 23.8s | 61.2% | 29.9% |
| kill-corridor | 336 | 241 | 71.7% | 0 | 24.2s | 61.5% | 25.0% |
| trap-lanes | 274 | 200 | 73.0% | 0 | 24.8s | 60.7% | 24.4% |
| wide-spread | 272 | 222 | 81.6% | 0 | 27.5s | 66.6% | 16.1% |
| compact-core | 250 | 129 | 51.6% | 0 | 25.0s | 55.2% | 44.5% |
| asymmetric-left | 249 | 134 | 53.8% | 0 | 25.0s | 57.7% | 42.9% |
| southern-funnel | 247 | 164 | 66.4% | 0 | 24.1s | 58.6% | 31.0% |
| defense-ring | 245 | 156 | 63.7% | 0 | 25.5s | 63.0% | 31.9% |
| split-core | 239 | 152 | 63.6% | 0 | 23.8s | 57.9% | 32.6% |
| corner-keep | 221 | 128 | 57.9% | 0 | 25.6s | 59.7% | 38.2% |
| echelon-right | 208 | 151 | 72.6% | 0 | 26.0s | 59.8% | 25.2% |
| cannon-screen | 207 | 152 | 73.4% | 0 | 28.3s | 59.6% | 24.6% |
| echelon-left | 206 | 140 | 68.0% | 0 | 24.7s | 60.0% | 28.6% |
| rear-keep | 206 | 137 | 66.5% | 0 | 24.4s | 58.6% | 31.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 135 | 63.7% | 0 | 20.8s | 58.0% | 33.0% |
| resource-shield\|TH7 | 185 | 119 | 64.3% | 0 | 22.1s | 58.3% | 31.7% |
| asymmetric-right\|TH7 | 184 | 128 | 69.6% | 0 | 21.8s | 61.5% | 27.2% |
| kill-corridor\|TH7 | 177 | 142 | 80.2% | 0 | 22.2s | 65.3% | 17.4% |
| crossfire\|TH7 | 176 | 128 | 72.7% | 0 | 22.3s | 60.8% | 26.1% |
| diamond\|TH7 | 175 | 130 | 74.3% | 0 | 22.4s | 63.6% | 23.6% |
| compact-core\|TH6 | 103 | 56 | 54.4% | 0 | 23.9s | 58.4% | 41.9% |
| asymmetric-left\|TH6 | 101 | 57 | 56.4% | 0 | 24.3s | 59.5% | 39.6% |
| layered-rings\|TH6 | 101 | 60 | 59.4% | 0 | 23.5s | 59.9% | 35.4% |
| resource-shield\|TH6 | 101 | 53 | 52.5% | 0 | 23.7s | 56.8% | 43.9% |
| trap-lanes\|TH6 | 101 | 68 | 67.3% | 0 | 24.1s | 61.7% | 28.9% |
| southern-funnel\|TH6 | 100 | 67 | 67.0% | 0 | 25.7s | 61.3% | 30.3% |
| split-core\|TH6 | 100 | 64 | 64.0% | 0 | 23.5s | 61.7% | 33.8% |
| wide-spread\|TH6 | 99 | 87 | 87.9% | 0 | 28.0s | 73.6% | 9.2% |
| asymmetric-right\|TH6 | 98 | 54 | 55.1% | 0 | 24.9s | 62.6% | 40.7% |
| defense-ring\|TH6 | 98 | 68 | 69.4% | 0 | 24.0s | 65.7% | 28.1% |
| resource-shield\|TH5 | 95 | 40 | 42.1% | 0 | 24.0s | 42.2% | 52.4% |
| asymmetric-left\|TH5 | 94 | 42 | 44.7% | 0 | 25.8s | 47.8% | 51.8% |
| asymmetric-right\|TH5 | 94 | 46 | 48.9% | 0 | 27.2s | 50.6% | 44.4% |
| corner-keep\|TH5 | 94 | 47 | 50.0% | 0 | 26.2s | 49.7% | 44.7% |
| split-core\|TH5 | 94 | 53 | 56.4% | 0 | 23.5s | 46.9% | 37.4% |
| compact-core\|TH5 | 93 | 42 | 45.2% | 0 | 25.4s | 44.9% | 49.6% |
| defense-ring\|TH5 | 93 | 46 | 49.5% | 0 | 27.3s | 53.1% | 42.8% |
| layered-rings\|TH5 | 93 | 38 | 40.9% | 0 | 24.9s | 48.2% | 52.1% |
| southern-funnel\|TH5 | 93 | 57 | 61.3% | 0 | 22.8s | 49.4% | 34.7% |
| trap-lanes\|TH5 | 93 | 63 | 67.7% | 0 | 26.5s | 49.2% | 28.7% |
| wide-spread\|TH5 | 93 | 65 | 69.9% | 0 | 29.5s | 55.6% | 27.4% |
| diamond\|TH6 | 85 | 58 | 68.2% | 0 | 24.8s | 65.5% | 31.2% |
| echelon-right\|TH6 | 85 | 62 | 72.9% | 0 | 25.8s | 61.7% | 24.3% |
| cannon-screen\|TH6 | 84 | 72 | 85.7% | 0 | 31.7s | 65.6% | 14.2% |
| crossfire\|TH6 | 84 | 54 | 64.3% | 0 | 26.0s | 58.4% | 32.6% |
| echelon-left\|TH6 | 83 | 60 | 72.3% | 0 | 25.8s | 64.9% | 23.3% |
| corner-keep\|TH6 | 82 | 50 | 61.0% | 0 | 24.8s | 64.7% | 36.3% |
| kill-corridor\|TH6 | 82 | 57 | 69.5% | 0 | 26.1s | 67.2% | 29.8% |
| rear-keep\|TH6 | 82 | 54 | 65.9% | 0 | 24.0s | 60.5% | 33.5% |
| trap-lanes\|TH7 | 80 | 69 | 86.3% | 0 | 23.6s | 71.5% | 13.7% |
| wide-spread\|TH7 | 80 | 70 | 87.5% | 0 | 24.7s | 69.9% | 11.3% |
| crossfire\|TH5 | 79 | 46 | 58.2% | 0 | 28.3s | 47.5% | 38.7% |
| rear-keep\|TH5 | 79 | 47 | 59.5% | 0 | 24.3s | 45.8% | 36.5% |
| cannon-screen\|TH5 | 78 | 46 | 59.0% | 0 | 26.0s | 45.0% | 36.9% |
| diamond\|TH5 | 78 | 40 | 51.3% | 0 | 25.7s | 50.4% | 42.5% |
| echelon-left\|TH5 | 78 | 46 | 59.0% | 0 | 23.5s | 47.1% | 37.2% |
| echelon-right\|TH5 | 78 | 53 | 67.9% | 0 | 26.9s | 49.2% | 29.1% |
| kill-corridor\|TH5 | 77 | 42 | 54.5% | 0 | 26.6s | 45.5% | 37.3% |
| asymmetric-left\|TH7 | 54 | 35 | 64.8% | 0 | 24.9s | 70.3% | 33.6% |
| compact-core\|TH7 | 54 | 31 | 57.4% | 0 | 26.5s | 65.6% | 40.5% |
| defense-ring\|TH7 | 54 | 42 | 77.8% | 0 | 25.2s | 73.8% | 20.2% |
| southern-funnel\|TH7 | 54 | 40 | 74.1% | 0 | 23.2s | 68.3% | 25.9% |
| cannon-screen\|TH7 | 45 | 34 | 75.6% | 0 | 25.8s | 72.2% | 22.8% |
| corner-keep\|TH7 | 45 | 31 | 68.9% | 0 | 25.6s | 69.9% | 28.3% |
| echelon-left\|TH7 | 45 | 34 | 75.6% | 0 | 25.1s | 71.9% | 23.4% |
| echelon-right\|TH7 | 45 | 36 | 80.0% | 0 | 24.6s | 73.0% | 20.0% |
| rear-keep\|TH7 | 45 | 36 | 80.0% | 0 | 25.1s | 75.5% | 20.0% |
| split-core\|TH7 | 45 | 35 | 77.8% | 0 | 25.4s | 70.8% | 20.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 353 | 33.6% | 0 | 22.3s | 49.2% | 59.2% |
| mid | 1011 | 844 | 83.5% | 0 | 26.6s | 69.1% | 13.1% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 25.3s | 73.8% | 0.0% |
| maxed | 985 | 178 | 18.1% | 0 | 24.2s | 33.7% | 77.7% |
| mixed | 953 | 861 | 90.3% | 0 | 24.8s | 70.3% | 8.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1673 | 64.3% | 0 | 21.6s | 50.4% | 30.7% |
| pure-unit-matrix | 2398 | 1562 | 65.1% | 0 | 27.8s | 68.5% | 33.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 642 | 72.1% | 0 | 25.1s | 71.5% | 26.6% |
| policy-exploration\|TH5 | 869 | 469 | 54.0% | 0 | 21.3s | 35.6% | 37.8% |
| policy-exploration\|TH6 | 869 | 571 | 65.7% | 0 | 22.8s | 56.7% | 30.6% |
| policy-exploration\|TH7 | 864 | 633 | 73.3% | 0 | 20.9s | 57.8% | 23.8% |
| pure-unit-matrix\|TH6 | 800 | 530 | 66.3% | 0 | 27.8s | 69.1% | 31.9% |
| pure-unit-matrix\|TH5 | 707 | 390 | 55.2% | 0 | 31.4s | 63.8% | 43.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1562 | 65.1% | 0 | 27.8s | 68.5% | 33.4% |
| policy-exploration\|none | 395 | 239 | 60.5% | 0 | 26.2s | 66.7% | 37.6% |
| policy-exploration\|rally-core | 365 | 204 | 55.9% | 0 | 14.4s | 6.3% | 29.4% |
| policy-exploration\|cannon-focus | 357 | 216 | 60.5% | 0 | 26.7s | 68.9% | 37.2% |
| policy-exploration\|cannon-rally | 340 | 212 | 62.4% | 0 | 14.0s | 7.1% | 27.3% |
| policy-exploration\|freeze-rage | 165 | 118 | 71.5% | 0 | 24.4s | 73.9% | 27.5% |
| policy-exploration\|freeze-barrel | 157 | 108 | 68.8% | 0 | 24.4s | 71.9% | 29.6% |
| policy-exploration\|freeze-defense | 157 | 109 | 69.4% | 0 | 24.0s | 71.8% | 29.5% |
| policy-exploration\|rage-entry | 148 | 99 | 66.9% | 0 | 23.5s | 71.0% | 31.3% |
| policy-exploration\|medkit-entry | 137 | 93 | 67.9% | 0 | 24.6s | 70.5% | 32.0% |
| policy-exploration\|cannon-medkit | 129 | 91 | 70.5% | 0 | 23.8s | 72.1% | 27.4% |
| policy-exploration\|skeleton-barrel | 128 | 98 | 76.6% | 0 | 25.5s | 74.3% | 22.9% |
| policy-exploration\|rally-rage | 124 | 86 | 69.4% | 0 | 13.2s | 8.6% | 20.5% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 278 | 164 | 59.0% | 0 | 21.2s | 47.6% | 35.5% |
| policy-exploration\|center-column | 272 | 176 | 64.7% | 0 | 21.5s | 51.2% | 30.9% |
| policy-exploration\|left-flank | 266 | 189 | 71.1% | 0 | 21.0s | 42.6% | 23.6% |
| policy-exploration\|diamond | 263 | 157 | 59.7% | 0 | 22.2s | 52.9% | 33.6% |
| policy-exploration\|edge-sweep | 262 | 172 | 65.6% | 0 | 21.8s | 53.8% | 30.1% |
| policy-exploration\|dual-flank | 258 | 158 | 61.2% | 0 | 21.2s | 50.5% | 32.2% |
| policy-exploration\|vanguard-wedge | 257 | 165 | 64.2% | 0 | 22.5s | 49.7% | 31.4% |
| policy-exploration\|three-lane | 255 | 149 | 58.4% | 0 | 20.4s | 50.5% | 37.4% |
| policy-exploration\|right-flank | 250 | 177 | 70.8% | 0 | 23.1s | 49.3% | 24.1% |
| policy-exploration\|wide-line | 241 | 166 | 68.9% | 0 | 21.4s | 56.3% | 28.0% |
| pure-unit-matrix\|center-column | 240 | 150 | 62.5% | 0 | 27.9s | 67.6% | 35.4% |
| pure-unit-matrix\|diamond | 240 | 156 | 65.0% | 0 | 27.4s | 68.3% | 33.9% |
| pure-unit-matrix\|dual-flank | 240 | 156 | 65.0% | 0 | 27.3s | 71.0% | 33.7% |
| pure-unit-matrix\|inverted-wedge | 240 | 156 | 65.0% | 0 | 29.1s | 67.8% | 33.0% |
| pure-unit-matrix\|left-flank | 240 | 169 | 70.4% | 0 | 29.7s | 66.5% | 27.6% |
| pure-unit-matrix\|right-flank | 240 | 163 | 67.9% | 0 | 28.6s | 67.0% | 29.7% |
| pure-unit-matrix\|three-lane | 240 | 152 | 63.3% | 0 | 26.1s | 69.0% | 35.8% |
| pure-unit-matrix\|vanguard-wedge | 240 | 146 | 60.8% | 0 | 28.2s | 66.2% | 38.1% |
| pure-unit-matrix\|wide-line | 240 | 162 | 67.5% | 0 | 27.3s | 71.3% | 32.1% |
| pure-unit-matrix\|edge-sweep | 238 | 152 | 63.9% | 0 | 26.9s | 70.7% | 34.7% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|three-waves | 528 | 336 | 63.6% | 0 | 22.2s | 50.6% | 30.5% |
| policy-exploration\|burst | 526 | 341 | 64.8% | 0 | 22.0s | 52.7% | 29.5% |
| policy-exploration\|rapid | 525 | 349 | 66.5% | 0 | 20.9s | 51.5% | 29.4% |
| policy-exploration\|drip | 515 | 303 | 58.8% | 0 | 21.4s | 46.4% | 35.8% |
| policy-exploration\|two-waves | 508 | 344 | 67.7% | 0 | 21.6s | 50.6% | 28.4% |
| pure-unit-matrix\|burst | 480 | 316 | 65.8% | 0 | 26.9s | 68.6% | 32.4% |
| pure-unit-matrix\|rapid | 480 | 316 | 65.8% | 0 | 27.8s | 68.6% | 33.0% |
| pure-unit-matrix\|three-waves | 480 | 307 | 64.0% | 0 | 28.0s | 68.0% | 35.0% |
| pure-unit-matrix\|two-waves | 480 | 321 | 66.9% | 0 | 27.5s | 69.0% | 31.8% |
| pure-unit-matrix\|drip | 478 | 302 | 63.2% | 0 | 29.0s | 68.4% | 34.8% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 1306 | 840 | 64.3% | 0 | 22.5s | 51.0% | 31.1% |
| policy-exploration\|roster-order | 1296 | 833 | 64.3% | 0 | 20.8s | 49.8% | 30.4% |
| pure-unit-matrix\|roster-order | 1199 | 780 | 65.1% | 0 | 27.6s | 68.7% | 33.4% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 782 | 65.2% | 0 | 28.0s | 68.4% | 33.4% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 442 | 410 | 92.8% | 0 | 24.5s | 76.5% | 6.2% |
| pure-fire_dragon | 442 | 337 | 76.2% | 0 | 20.5s | 76.8% | 20.9% |
| pure-mimic | 432 | 243 | 56.3% | 0 | 31.4s | 57.3% | 42.0% |
| pure-pea_shooter | 418 | 233 | 55.7% | 0 | 25.3s | 60.0% | 42.6% |
| pure-archer | 411 | 216 | 52.6% | 0 | 30.9s | 58.3% | 44.5% |
| pure-knight | 409 | 319 | 78.0% | 0 | 29.5s | 66.0% | 18.8% |
| pure-mage | 408 | 132 | 32.4% | 0 | 22.0s | 40.7% | 65.5% |
| pure-mechanical_dragon | 265 | 209 | 78.9% | 0 | 24.4s | 75.4% | 18.0% |
| pure-necromancer | 147 | 71 | 48.3% | 0 | 29.7s | 50.9% | 49.9% |
| random-2 | 133 | 83 | 62.4% | 0 | 21.6s | 46.2% | 32.7% |
| random-3 | 132 | 83 | 62.9% | 0 | 23.4s | 60.6% | 32.1% |
| ranged-pressure | 126 | 66 | 52.4% | 0 | 17.7s | 43.5% | 40.4% |
| trap-runner-mix | 124 | 79 | 63.7% | 0 | 25.2s | 63.4% | 33.4% |
| random-5 | 123 | 82 | 66.7% | 0 | 18.6s | 38.3% | 29.4% |
| melee-pressure | 119 | 90 | 75.6% | 0 | 26.8s | 65.1% | 21.6% |
| support-mix | 119 | 64 | 53.8% | 0 | 20.1s | 41.0% | 33.8% |
| random-1 | 116 | 70 | 60.3% | 0 | 18.6s | 35.3% | 33.6% |
| random-6 | 114 | 80 | 70.2% | 0 | 25.1s | 55.8% | 26.8% |
| balanced | 112 | 95 | 84.8% | 0 | 18.8s | 44.7% | 10.1% |
| frontline-ranged | 112 | 72 | 64.3% | 0 | 20.8s | 58.4% | 29.8% |
| hero-necro-dragon-mages | 109 | 73 | 67.0% | 0 | 21.3s | 62.1% | 30.2% |
| random-4 | 108 | 64 | 59.3% | 0 | 18.9s | 40.9% | 31.6% |
| air-pressure | 79 | 64 | 81.0% | 0 | 18.0s | 61.6% | 14.8% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__drip__tank-front-support-rear | 57 | 34 | 59.6% | 0 | 23.6s | 52.8% | 32.8% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 39 | 68.4% | 0 | 25.8s | 73.7% | 29.7% |
| inverted-wedge__burst__roster-order | 57 | 34 | 59.6% | 0 | 23.0s | 61.3% | 32.1% |
| three-lane__rapid__roster-order | 57 | 31 | 54.4% | 0 | 24.9s | 67.3% | 42.7% |
| center-column__burst__roster-order | 56 | 37 | 66.1% | 0 | 24.4s | 60.2% | 32.3% |
| center-column__three-waves__roster-order | 56 | 39 | 69.6% | 0 | 23.2s | 60.7% | 28.0% |
| dual-flank__two-waves__roster-order | 56 | 32 | 57.1% | 0 | 24.5s | 70.9% | 38.8% |
| inverted-wedge__rapid__roster-order | 56 | 32 | 57.1% | 0 | 23.8s | 49.6% | 32.5% |
| left-flank__three-waves__roster-order | 56 | 38 | 67.9% | 0 | 23.4s | 51.9% | 28.7% |
| left-flank__three-waves__tank-front-support-rear | 56 | 38 | 67.9% | 0 | 22.7s | 45.6% | 29.2% |
| left-flank__two-waves__roster-order | 56 | 45 | 80.4% | 0 | 24.1s | 51.2% | 16.3% |
| right-flank__three-waves__tank-front-support-rear | 56 | 32 | 57.1% | 0 | 23.3s | 49.8% | 41.7% |
| center-column__burst__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 28.2s | 71.9% | 31.3% |
| diamond__burst__roster-order | 55 | 32 | 58.2% | 0 | 21.3s | 50.1% | 33.7% |
| dual-flank__rapid__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 23.9s | 65.8% | 28.4% |
| dual-flank__three-waves__roster-order | 55 | 42 | 76.4% | 0 | 26.0s | 63.4% | 20.2% |
| edge-sweep__drip__tank-front-support-rear | 55 | 30 | 54.5% | 0 | 28.1s | 54.6% | 44.6% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 35 | 63.6% | 0 | 23.6s | 52.5% | 35.8% |
| inverted-wedge__drip__roster-order | 55 | 25 | 45.5% | 0 | 25.8s | 56.1% | 54.5% |
| left-flank__drip__tank-front-support-rear | 55 | 40 | 72.7% | 0 | 27.6s | 50.7% | 24.4% |
| three-lane__three-waves__roster-order | 55 | 30 | 54.5% | 0 | 23.6s | 53.6% | 43.9% |
| three-lane__two-waves__roster-order | 55 | 38 | 69.1% | 0 | 23.3s | 67.2% | 30.8% |
| vanguard-wedge__burst__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 23.0s | 46.8% | 42.6% |
| wide-line__burst__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 22.4s | 66.4% | 32.7% |
| wide-line__drip__tank-front-support-rear | 55 | 34 | 61.8% | 0 | 28.4s | 72.8% | 36.9% |
| dual-flank__two-waves__tank-front-support-rear | 54 | 29 | 53.7% | 0 | 25.1s | 64.2% | 44.4% |
| left-flank__drip__roster-order | 54 | 38 | 70.4% | 0 | 23.4s | 53.7% | 23.4% |
| vanguard-wedge__rapid__tank-front-support-rear | 54 | 34 | 63.0% | 0 | 24.0s | 57.7% | 34.8% |
| center-column__rapid__roster-order | 51 | 33 | 64.7% | 0 | 25.1s | 63.8% | 34.4% |
| diamond__burst__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 25.2s | 66.6% | 31.4% |
| diamond__three-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 26.3s | 66.0% | 35.2% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 22.3s | 48.4% | 33.3% |
| inverted-wedge__two-waves__roster-order | 51 | 30 | 58.8% | 0 | 21.9s | 45.4% | 36.5% |
| left-flank__two-waves__tank-front-support-rear | 51 | 30 | 58.8% | 0 | 25.8s | 54.0% | 36.2% |
| right-flank__rapid__tank-front-support-rear | 51 | 38 | 74.5% | 0 | 24.8s | 63.2% | 21.3% |
| right-flank__two-waves__tank-front-support-rear | 51 | 44 | 86.3% | 0 | 28.5s | 60.4% | 9.9% |
| three-lane__rapid__tank-front-support-rear | 51 | 26 | 51.0% | 0 | 23.8s | 63.7% | 46.8% |
| vanguard-wedge__burst__roster-order | 51 | 27 | 52.9% | 0 | 23.2s | 49.8% | 44.0% |
| vanguard-wedge__drip__roster-order | 51 | 35 | 68.6% | 0 | 23.1s | 51.8% | 24.0% |
| center-column__drip__roster-order | 50 | 25 | 50.0% | 0 | 23.3s | 49.8% | 47.8% |
| center-column__rapid__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 24.8s | 47.7% | 28.0% |
| center-column__three-waves__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 24.1s | 54.1% | 38.4% |
| center-column__two-waves__roster-order | 50 | 30 | 60.0% | 0 | 21.6s | 56.8% | 33.9% |
| center-column__two-waves__tank-front-support-rear | 50 | 36 | 72.0% | 0 | 22.5s | 51.6% | 26.4% |
| diamond__rapid__roster-order | 50 | 39 | 78.0% | 0 | 21.6s | 59.9% | 22.0% |
| diamond__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.3s | 58.1% | 38.5% |
| diamond__two-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 26.1s | 68.5% | 38.3% |
| dual-flank__burst__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 25.1s | 59.8% | 46.4% |
| dual-flank__rapid__roster-order | 50 | 27 | 54.0% | 0 | 25.0s | 59.3% | 42.9% |
| edge-sweep__burst__roster-order | 50 | 33 | 66.0% | 0 | 23.6s | 66.5% | 30.7% |
| edge-sweep__drip__roster-order | 50 | 23 | 46.0% | 0 | 24.3s | 65.6% | 49.7% |
| edge-sweep__rapid__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 23.2s | 57.9% | 37.3% |
| edge-sweep__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 24.4s | 64.9% | 31.0% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 26.9s | 69.5% | 34.1% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 22.7s | 58.4% | 30.8% |
| inverted-wedge__three-waves__roster-order | 50 | 38 | 76.0% | 0 | 26.4s | 68.6% | 19.8% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 27.9s | 43.8% | 33.0% |
| left-flank__burst__roster-order | 50 | 37 | 74.0% | 0 | 28.4s | 63.5% | 21.2% |
| right-flank__burst__tank-front-support-rear | 50 | 36 | 72.0% | 0 | 31.9s | 62.3% | 22.6% |
| right-flank__drip__roster-order | 50 | 30 | 60.0% | 0 | 23.6s | 43.9% | 36.2% |
| right-flank__drip__tank-front-support-rear | 50 | 33 | 66.0% | 0 | 24.7s | 54.3% | 30.2% |
| three-lane__two-waves__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 25.3s | 71.6% | 30.9% |
| vanguard-wedge__drip__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 27.2s | 61.8% | 33.6% |
| wide-line__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 22.1s | 54.8% | 34.5% |
| wide-line__three-waves__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 21.9s | 57.7% | 35.2% |
| diamond__two-waves__roster-order | 49 | 32 | 65.3% | 0 | 25.5s | 71.9% | 34.7% |
| dual-flank__three-waves__tank-front-support-rear | 49 | 34 | 69.4% | 0 | 23.2s | 52.2% | 23.8% |
| edge-sweep__rapid__roster-order | 49 | 40 | 81.6% | 0 | 22.9s | 73.6% | 17.5% |
| right-flank__burst__roster-order | 49 | 36 | 73.5% | 0 | 24.1s | 68.8% | 22.0% |
| three-lane__drip__roster-order | 49 | 28 | 57.1% | 0 | 24.9s | 57.6% | 36.7% |
| vanguard-wedge__rapid__roster-order | 49 | 29 | 59.2% | 0 | 22.6s | 58.5% | 38.0% |
| vanguard-wedge__two-waves__roster-order | 49 | 39 | 79.6% | 0 | 26.5s | 64.1% | 20.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 36 | 73.5% | 0 | 25.7s | 55.5% | 26.0% |
| wide-line__burst__roster-order | 49 | 36 | 73.5% | 0 | 25.6s | 76.1% | 26.3% |
| wide-line__rapid__roster-order | 49 | 39 | 79.6% | 0 | 24.2s | 57.0% | 18.9% |
| diamond__drip__roster-order | 45 | 25 | 55.6% | 0 | 22.5s | 46.7% | 34.9% |
| diamond__three-waves__roster-order | 45 | 27 | 60.0% | 0 | 28.2s | 63.1% | 36.6% |
| dual-flank__burst__roster-order | 45 | 33 | 73.3% | 0 | 20.4s | 45.2% | 21.7% |
| dual-flank__drip__roster-order | 45 | 27 | 60.0% | 0 | 23.5s | 62.8% | 34.4% |
| left-flank__rapid__tank-front-support-rear | 45 | 34 | 75.6% | 0 | 25.6s | 68.1% | 24.4% |
| right-flank__two-waves__roster-order | 45 | 27 | 60.0% | 0 | 24.4s | 54.0% | 37.6% |
| three-lane__burst__roster-order | 45 | 25 | 55.6% | 0 | 20.2s | 46.8% | 42.8% |
| three-lane__burst__tank-front-support-rear | 45 | 34 | 75.6% | 0 | 21.3s | 61.4% | 19.5% |
| vanguard-wedge__three-waves__roster-order | 45 | 25 | 55.6% | 0 | 27.5s | 67.2% | 43.7% |
| wide-line__drip__roster-order | 45 | 33 | 73.3% | 0 | 27.4s | 72.1% | 26.7% |
| wide-line__three-waves__roster-order | 45 | 24 | 53.3% | 0 | 21.5s | 55.6% | 40.1% |
| center-column__drip__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 27.8s | 72.4% | 30.6% |
| edge-sweep__burst__tank-front-support-rear | 44 | 35 | 79.5% | 0 | 27.6s | 68.4% | 19.4% |
| edge-sweep__two-waves__roster-order | 44 | 31 | 70.5% | 0 | 19.5s | 43.5% | 26.1% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 27.2s | 66.8% | 32.5% |
| left-flank__rapid__roster-order | 44 | 30 | 68.2% | 0 | 26.8s | 42.7% | 28.5% |
| right-flank__rapid__roster-order | 44 | 36 | 81.8% | 0 | 25.2s | 66.6% | 15.0% |
| right-flank__three-waves__roster-order | 44 | 28 | 63.6% | 0 | 27.4s | 58.4% | 30.4% |
| three-lane__drip__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 20.2s | 36.4% | 41.8% |
| three-lane__three-waves__tank-front-support-rear | 44 | 31 | 70.5% | 0 | 23.4s | 64.6% | 27.9% |
| vanguard-wedge__three-waves__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 30.9s | 67.4% | 39.9% |
| wide-line__two-waves__tank-front-support-rear | 44 | 33 | 75.0% | 0 | 25.5s | 59.7% | 23.2% |
| dual-flank__drip__tank-front-support-rear | 39 | 28 | 71.8% | 0 | 23.9s | 55.1% | 25.2% |
| left-flank__burst__tank-front-support-rear | 39 | 28 | 71.8% | 0 | 24.5s | 62.3% | 22.5% |
| wide-line__two-waves__roster-order | 39 | 30 | 76.9% | 0 | 23.8s | 64.8% | 23.1% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 518 | 320 | 61.8% | 0 | 24.8s | 57.0% | 34.4% |
| center-column | 512 | 326 | 63.7% | 0 | 24.5s | 58.9% | 33.0% |
| left-flank | 506 | 358 | 70.8% | 0 | 25.2s | 54.0% | 25.5% |
| diamond | 503 | 313 | 62.2% | 0 | 24.7s | 60.3% | 33.7% |
| edge-sweep | 500 | 324 | 64.8% | 0 | 24.2s | 61.9% | 32.3% |
| dual-flank | 498 | 314 | 63.1% | 0 | 24.1s | 60.4% | 32.9% |
| vanguard-wedge | 497 | 311 | 62.6% | 0 | 25.2s | 57.7% | 34.6% |
| three-lane | 495 | 301 | 60.8% | 0 | 23.2s | 59.5% | 36.7% |
| right-flank | 490 | 340 | 69.4% | 0 | 25.8s | 58.0% | 26.8% |
| wide-line | 481 | 328 | 68.2% | 0 | 24.3s | 63.8% | 30.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| three-waves | 1008 | 643 | 63.8% | 0 | 25.0s | 58.9% | 32.7% |
| burst | 1006 | 657 | 65.3% | 0 | 24.4s | 60.3% | 30.9% |
| rapid | 1005 | 665 | 66.2% | 0 | 24.2s | 59.7% | 31.1% |
| drip | 993 | 605 | 60.9% | 0 | 25.1s | 57.0% | 35.3% |
| two-waves | 988 | 665 | 67.3% | 0 | 24.5s | 59.6% | 30.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2505 | 1622 | 64.8% | 0 | 25.1s | 59.3% | 32.2% |
| roster-order | 2495 | 1613 | 64.6% | 0 | 24.1s | 58.9% | 31.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2793 | 1801 | 64.5% | 0 | 27.6s | 68.3% | 34.0% |
| rally-core | 365 | 204 | 55.9% | 0 | 14.4s | 6.3% | 29.4% |
| cannon-focus | 357 | 216 | 60.5% | 0 | 26.7s | 68.9% | 37.2% |
| cannon-rally | 340 | 212 | 62.4% | 0 | 14.0s | 7.1% | 27.3% |
| freeze-rage | 165 | 118 | 71.5% | 0 | 24.4s | 73.9% | 27.5% |
| freeze-barrel | 157 | 108 | 68.8% | 0 | 24.4s | 71.9% | 29.6% |
| freeze-defense | 157 | 109 | 69.4% | 0 | 24.0s | 71.8% | 29.5% |
| rage-entry | 148 | 99 | 66.9% | 0 | 23.5s | 71.0% | 31.3% |
| medkit-entry | 137 | 93 | 67.9% | 0 | 24.6s | 70.5% | 32.0% |
| cannon-medkit | 129 | 91 | 70.5% | 0 | 23.8s | 72.1% | 27.4% |
| skeleton-barrel | 128 | 98 | 76.6% | 0 | 25.5s | 74.3% | 22.9% |
| rally-rage | 124 | 86 | 69.4% | 0 | 13.2s | 8.6% | 20.5% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 3060 | 1981 | 64.7% | 0 | 26.6s | 64.8% | 32.8% |
| legendary | 660 | 432 | 65.5% | 0 | 21.7s | 51.3% | 29.8% |
| epic | 657 | 415 | 63.2% | 0 | 21.2s | 50.2% | 31.3% |
| unrevealed | 623 | 407 | 65.3% | 0 | 21.7s | 48.9% | 31.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1998 | 65.9% | 0 | 26.7s | 65.3% | 32.0% |
| ward-1 | 767 | 503 | 65.6% | 0 | 21.9s | 52.0% | 30.4% |
| ward-3 | 601 | 362 | 60.2% | 0 | 21.5s | 49.0% | 34.1% |
| ward-2 | 600 | 372 | 62.0% | 0 | 20.7s | 46.9% | 31.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 3235 | 64.7% | 0 | 24.6s | 59.1% | 32.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1887 | 1277 | 67.7% | 0 | 20.7s | 56.4% | 27.3% |
| demon_king | 1863 | 1345 | 72.2% | 0 | 22.3s | 57.1% | 23.5% |
| mage | 1836 | 1043 | 56.8% | 0 | 21.1s | 47.3% | 38.3% |
| knight | 1830 | 1254 | 68.5% | 0 | 23.4s | 54.4% | 26.7% |
| archer | 1730 | 1054 | 60.9% | 0 | 23.2s | 50.6% | 33.9% |
| mimic | 1626 | 1024 | 63.0% | 0 | 24.4s | 51.6% | 32.4% |
| pea_shooter | 1270 | 761 | 59.9% | 0 | 22.1s | 50.6% | 35.8% |
| mechanical_dragon | 906 | 645 | 71.2% | 0 | 21.7s | 60.7% | 25.1% |
| necromancer | 436 | 261 | 59.9% | 0 | 23.6s | 54.2% | 38.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 55.7% | 50.0%-61.2% | 64.3% | 44.1% | 34.4% |
| demon_king | 300 | 93.0% | 89.5%-95.4% | 83.5% | 6.4% | 78.3% |
| fire_dragon | 300 | 77.7% | 72.6%-82.0% | 79.1% | 19.9% | 67.0% |
| knight | 300 | 75.0% | 69.8%-79.6% | 74.9% | 21.5% | 51.7% |
| mage | 300 | 34.3% | 29.2%-39.9% | 47.2% | 65.0% | 20.4% |
| mechanical_dragon | 199 | 80.9% | 74.9%-85.8% | 81.4% | 16.8% | 62.7% |
| mimic | 300 | 57.3% | 51.7%-62.8% | 62.3% | 41.1% | 50.2% |
| necromancer | 99 | 47.5% | 37.9%-57.2% | 51.2% | 50.6% | 35.0% |
| pea_shooter | 300 | 58.3% | 52.7%-63.8% | 65.9% | 41.2% | 40.4% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 48.5% | 39.0%-58.1% | 62.0% | 51.2% | 28.1% |
| archer\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.2% | 40.0% | 35.7% |
| archer\|TH7 | 99 | 58.6% | 48.7%-67.8% | 66.5% | 41.1% | 39.5% |
| demon_king\|TH5 | 101 | 83.2% | 74.7%-89.2% | 80.3% | 15.3% | 67.1% |
| demon_king\|TH6 | 100 | 96.0% | 90.2%-98.4% | 85.1% | 3.8% | 81.8% |
| demon_king\|TH7 | 99 | 100.0% | 96.3%-100.0% | 84.8% | 0.0% | 86.3% |
| fire_dragon\|TH5 | 101 | 66.3% | 56.7%-74.8% | 74.8% | 32.3% | 56.4% |
| fire_dragon\|TH6 | 100 | 76.0% | 66.8%-83.3% | 77.9% | 20.1% | 66.5% |
| fire_dragon\|TH7 | 99 | 90.9% | 83.6%-95.1% | 84.2% | 7.2% | 78.3% |
| knight\|TH5 | 101 | 65.3% | 55.7%-73.9% | 69.1% | 31.6% | 40.9% |
| knight\|TH6 | 100 | 71.0% | 61.5%-79.0% | 74.7% | 23.1% | 51.4% |
| knight\|TH7 | 99 | 88.9% | 81.2%-93.7% | 80.5% | 9.4% | 63.0% |
| mage\|TH5 | 101 | 29.7% | 21.7%-39.2% | 45.4% | 70.3% | 19.9% |
| mage\|TH6 | 100 | 34.0% | 25.5%-43.7% | 46.0% | 65.0% | 18.5% |
| mage\|TH7 | 99 | 39.4% | 30.3%-49.2% | 50.0% | 59.5% | 22.9% |
| mechanical_dragon\|TH6 | 100 | 73.0% | 63.6%-80.7% | 77.7% | 24.3% | 58.0% |
| mechanical_dragon\|TH7 | 99 | 88.9% | 81.2%-93.7% | 84.9% | 9.3% | 67.4% |
| mimic\|TH5 | 101 | 38.6% | 29.7%-48.4% | 51.1% | 60.3% | 32.4% |
| mimic\|TH6 | 100 | 61.0% | 51.2%-70.0% | 62.0% | 37.9% | 53.7% |
| mimic\|TH7 | 99 | 72.7% | 63.2%-80.5% | 73.0% | 24.6% | 64.9% |
| necromancer\|TH7 | 99 | 47.5% | 37.9%-57.2% | 51.2% | 50.6% | 35.0% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 64.0% | 45.1% | 36.6% |
| pea_shooter\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.2% | 40.9% | 41.1% |
| pea_shooter\|TH7 | 99 | 61.6% | 51.8%-70.6% | 68.2% | 37.4% | 43.5% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 67.0% | 48.1% | 33.8% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.0% | 50.0% | 34.2% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 58.9% | 40.0% | 38.7% |
| archer\|compact-core | 18 | 44.4% | 24.6%-66.3% | 61.6% | 55.5% | 25.7% |
| archer\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 69.0% | 50.0% | 30.6% |
| archer\|crossfire | 15 | 53.3% | 30.1%-75.2% | 58.9% | 46.5% | 29.0% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 72.7% | 38.9% | 36.3% |
| archer\|diamond | 15 | 53.3% | 30.1%-75.2% | 63.6% | 46.7% | 33.5% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.0% | 46.7% | 36.6% |
| archer\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 60.0% | 46.7% | 37.6% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 63.9% | 46.7% | 35.3% |
| archer\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 63.8% | 54.0% | 27.9% |
| archer\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 60.0% | 46.7% | 32.4% |
| archer\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 60.8% | 50.0% | 29.9% |
| archer\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 59.8% | 38.9% | 33.8% |
| archer\|split-core | 17 | 64.7% | 41.3%-82.7% | 66.2% | 35.3% | 43.8% |
| archer\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 68.0% | 33.3% | 41.0% |
| archer\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 76.1% | 22.2% | 39.6% |
| demon_king\|asymmetric-left | 18 | 83.3% | 60.8%-94.2% | 79.2% | 16.7% | 67.3% |
| demon_king\|asymmetric-right | 18 | 88.9% | 67.2%-96.9% | 85.0% | 9.0% | 72.2% |
| demon_king\|cannon-screen | 15 | 100.0% | 79.6%-100.0% | 87.5% | 0.0% | 84.4% |
| demon_king\|compact-core | 18 | 88.9% | 67.2%-96.9% | 83.3% | 11.1% | 70.4% |
| demon_king\|corner-keep | 16 | 81.3% | 57.0%-93.4% | 82.7% | 15.5% | 72.2% |
| demon_king\|crossfire | 15 | 100.0% | 79.6%-100.0% | 86.4% | 0.0% | 79.3% |
| demon_king\|defense-ring | 18 | 94.4% | 74.2%-99.0% | 83.3% | 5.6% | 80.9% |
| demon_king\|diamond | 15 | 100.0% | 79.6%-100.0% | 86.1% | 0.0% | 85.2% |
| demon_king\|echelon-left | 15 | 93.3% | 70.2%-98.8% | 82.7% | 6.7% | 82.2% |
| demon_king\|echelon-right | 15 | 100.0% | 79.6%-100.0% | 83.9% | 0.0% | 85.2% |
| demon_king\|kill-corridor | 15 | 100.0% | 79.6%-100.0% | 76.1% | 0.0% | 81.5% |
| demon_king\|layered-rings | 18 | 94.4% | 74.2%-99.0% | 83.1% | 2.5% | 79.0% |
| demon_king\|rear-keep | 15 | 93.3% | 70.2%-98.8% | 84.3% | 6.7% | 80.0% |
| demon_king\|resource-shield | 18 | 83.3% | 60.8%-94.2% | 83.9% | 15.5% | 68.5% |
| demon_king\|southern-funnel | 18 | 94.4% | 74.2%-99.0% | 87.9% | 5.2% | 87.7% |
| demon_king\|split-core | 17 | 88.2% | 65.7%-96.7% | 78.7% | 11.8% | 75.8% |
| demon_king\|trap-lanes | 18 | 100.0% | 82.4%-100.0% | 86.7% | 0.0% | 83.3% |
| demon_king\|wide-spread | 18 | 94.4% | 74.2%-99.0% | 81.4% | 5.6% | 79.0% |
| fire_dragon\|asymmetric-left | 18 | 72.2% | 49.1%-87.5% | 78.0% | 27.8% | 65.3% |
| fire_dragon\|asymmetric-right | 18 | 61.1% | 38.6%-79.7% | 74.6% | 33.1% | 48.6% |
| fire_dragon\|cannon-screen | 15 | 100.0% | 79.6%-100.0% | 81.8% | 0.0% | 78.3% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 66.7% | 47.0% | 47.2% |
| fire_dragon\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 76.1% | 26.6% | 54.7% |
| fire_dragon\|crossfire | 15 | 73.3% | 48.0%-89.1% | 76.6% | 20.8% | 66.7% |
| fire_dragon\|defense-ring | 18 | 72.2% | 49.1%-87.5% | 79.0% | 24.8% | 65.3% |
| fire_dragon\|diamond | 15 | 86.7% | 62.1%-96.3% | 85.0% | 13.3% | 73.3% |
| fire_dragon\|echelon-left | 15 | 86.7% | 62.1%-96.3% | 81.6% | 9.2% | 75.0% |
| fire_dragon\|echelon-right | 15 | 86.7% | 62.1%-96.3% | 82.7% | 11.8% | 78.3% |
| fire_dragon\|kill-corridor | 15 | 93.3% | 70.2%-98.8% | 85.7% | 2.6% | 83.3% |
| fire_dragon\|layered-rings | 18 | 61.1% | 38.6%-79.7% | 75.8% | 38.0% | 55.6% |
| fire_dragon\|rear-keep | 15 | 80.0% | 54.8%-93.0% | 78.0% | 20.0% | 73.3% |
| fire_dragon\|resource-shield | 18 | 61.1% | 38.6%-79.7% | 73.3% | 34.2% | 52.8% |
| fire_dragon\|southern-funnel | 18 | 88.9% | 67.2%-96.9% | 79.2% | 11.1% | 75.0% |
| fire_dragon\|split-core | 17 | 82.4% | 59.0%-93.8% | 81.7% | 17.6% | 67.6% |
| fire_dragon\|trap-lanes | 18 | 88.9% | 67.2%-96.9% | 83.7% | 11.1% | 76.4% |
| fire_dragon\|wide-spread | 18 | 100.0% | 82.4%-100.0% | 87.3% | 0.0% | 77.8% |
| knight\|asymmetric-left | 18 | 61.1% | 38.6%-79.7% | 71.0% | 33.2% | 43.5% |
| knight\|asymmetric-right | 18 | 61.1% | 38.6%-79.7% | 76.7% | 29.2% | 47.0% |
| knight\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 78.2% | 16.9% | 55.7% |
| knight\|compact-core | 18 | 61.1% | 38.6%-79.7% | 71.6% | 38.9% | 42.7% |
| knight\|corner-keep | 16 | 75.0% | 50.5%-89.8% | 76.1% | 20.9% | 48.5% |
| knight\|crossfire | 15 | 73.3% | 48.0%-89.1% | 75.9% | 23.8% | 47.9% |
| knight\|defense-ring | 18 | 72.2% | 49.1%-87.5% | 79.4% | 25.0% | 50.5% |
| knight\|diamond | 15 | 73.3% | 48.0%-89.1% | 75.9% | 23.6% | 51.1% |
| knight\|echelon-left | 15 | 93.3% | 70.2%-98.8% | 76.8% | 6.3% | 58.4% |
| knight\|echelon-right | 15 | 100.0% | 79.6%-100.0% | 75.7% | 0.0% | 59.4% |
| knight\|kill-corridor | 15 | 86.7% | 62.1%-96.3% | 74.5% | 7.7% | 61.0% |
| knight\|layered-rings | 18 | 61.1% | 38.6%-79.7% | 72.0% | 33.1% | 42.8% |
| knight\|rear-keep | 15 | 86.7% | 62.1%-96.3% | 76.4% | 13.3% | 57.8% |
| knight\|resource-shield | 18 | 55.6% | 33.7%-75.4% | 69.1% | 43.5% | 41.9% |
| knight\|southern-funnel | 18 | 83.3% | 60.8%-94.2% | 79.9% | 11.4% | 57.0% |
| knight\|split-core | 17 | 76.5% | 52.7%-90.4% | 69.4% | 23.0% | 54.1% |
| knight\|trap-lanes | 18 | 83.3% | 60.8%-94.2% | 76.5% | 14.9% | 58.4% |
| knight\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 74.8% | 11.8% | 57.9% |
| mage\|asymmetric-left | 18 | 27.8% | 12.5%-50.9% | 52.5% | 72.2% | 21.7% |
| mage\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 55.9% | 60.8% | 22.7% |
| mage\|cannon-screen | 15 | 46.7% | 24.8%-69.9% | 44.8% | 53.3% | 21.2% |
| mage\|compact-core | 18 | 16.7% | 5.8%-39.2% | 40.9% | 78.1% | 13.1% |
| mage\|corner-keep | 16 | 25.0% | 10.2%-49.5% | 45.7% | 75.0% | 17.0% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 46.1% | 53.3% | 21.8% |
| mage\|defense-ring | 18 | 38.9% | 20.3%-61.4% | 49.6% | 61.3% | 17.2% |
| mage\|diamond | 15 | 33.3% | 15.2%-58.3% | 46.1% | 66.7% | 20.6% |
| mage\|echelon-left | 15 | 40.0% | 19.8%-64.3% | 44.1% | 60.0% | 23.0% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 52.3% | 53.3% | 28.5% |
| mage\|kill-corridor | 15 | 26.7% | 10.9%-52.0% | 43.2% | 72.3% | 22.4% |
| mage\|layered-rings | 18 | 22.2% | 9.0%-45.2% | 48.3% | 75.5% | 15.2% |
| mage\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 45.7% | 60.0% | 20.6% |
| mage\|resource-shield | 18 | 22.2% | 9.0%-45.2% | 41.1% | 77.8% | 14.1% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 41.5% | 66.7% | 19.2% |
| mage\|split-core | 17 | 35.3% | 17.3%-58.7% | 49.7% | 64.7% | 23.0% |
| mage\|trap-lanes | 18 | 33.3% | 16.3%-56.3% | 43.6% | 66.7% | 24.2% |
| mage\|wide-spread | 18 | 50.0% | 29.0%-71.0% | 56.6% | 46.5% | 23.7% |
| mechanical_dragon\|asymmetric-left | 12 | 66.7% | 39.1%-86.2% | 80.6% | 32.1% | 56.1% |
| mechanical_dragon\|asymmetric-right | 12 | 75.0% | 46.8%-91.1% | 80.6% | 25.0% | 56.1% |
| mechanical_dragon\|compact-core | 12 | 66.7% | 39.1%-86.2% | 75.3% | 32.4% | 47.7% |
| mechanical_dragon\|defense-ring | 12 | 83.3% | 55.2%-95.3% | 77.5% | 16.7% | 63.6% |
| mechanical_dragon\|layered-rings | 12 | 66.7% | 39.1%-86.2% | 79.7% | 27.5% | 53.0% |
| mechanical_dragon\|resource-shield | 12 | 58.3% | 32.0%-80.7% | 75.0% | 34.1% | 47.7% |
| mechanical_dragon\|southern-funnel | 12 | 91.7% | 64.6%-98.5% | 80.3% | 6.1% | 60.6% |
| mechanical_dragon\|trap-lanes | 12 | 91.7% | 64.6%-98.5% | 84.7% | 1.0% | 71.2% |
| mechanical_dragon\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 82.8% | 5.4% | 70.5% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 59.7% | 52.7% | 40.5% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 59.8% | 48.1% | 44.4% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 64.1% | 33.1% | 58.1% |
| mimic\|compact-core | 18 | 50.0% | 29.0%-71.0% | 54.2% | 48.1% | 43.7% |
| mimic\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 66.2% | 37.5% | 52.7% |
| mimic\|crossfire | 15 | 66.7% | 41.7%-84.8% | 63.9% | 32.2% | 48.6% |
| mimic\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 67.4% | 41.9% | 52.4% |
| mimic\|diamond | 15 | 60.0% | 35.7%-80.2% | 64.8% | 37.5% | 53.3% |
| mimic\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 64.1% | 33.3% | 56.2% |
| mimic\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 63.0% | 33.3% | 60.0% |
| mimic\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 62.3% | 45.3% | 45.7% |
| mimic\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 57.8% | 55.6% | 40.5% |
| mimic\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 60.9% | 40.0% | 48.6% |
| mimic\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 55.1% | 50.3% | 40.5% |
| mimic\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.8% | 33.3% | 60.3% |
| mimic\|split-core | 17 | 52.9% | 31.0%-73.8% | 62.6% | 44.2% | 52.1% |
| mimic\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 64.8% | 32.1% | 57.9% |
| mimic\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 68.2% | 34.9% | 52.4% |
| pea_shooter\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.9% | 50.0% | 33.3% |
| pea_shooter\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.0% | 50.0% | 37.0% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 62.5% | 40.0% | 41.5% |
| pea_shooter\|compact-core | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 34.0% |
| pea_shooter\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 65.6% | 37.5% | 41.7% |
| pea_shooter\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.9% | 40.0% | 37.8% |
| pea_shooter\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 69.3% | 38.9% | 42.6% |
| pea_shooter\|diamond | 15 | 53.3% | 30.1%-75.2% | 66.6% | 45.9% | 40.7% |
| pea_shooter\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 67.5% | 36.8% | 48.1% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.0% | 43.0% |
| pea_shooter\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 74.1% | 33.3% | 52.6% |
| pea_shooter\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.5% | 55.6% | 32.1% |
| pea_shooter\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 65.7% | 40.0% | 41.5% |
| pea_shooter\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.0% | 55.1% | 33.3% |
| pea_shooter\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 61.9% | 38.1% | 39.5% |
| pea_shooter\|split-core | 17 | 64.7% | 41.3%-82.7% | 64.8% | 32.1% | 39.9% |
| pea_shooter\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.3% | 33.3% | 45.7% |
| pea_shooter\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 82.4% | 21.6% | 46.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 96.8% |
| th5-asymmetric-left-184 | 5 | asymmetric-left | maxed | 17 | 0.0% | 98.0% |
| th6-asymmetric-left-185 | 6 | asymmetric-left | maxed | 17 | 0.0% | 96.7% |
| th5-asymmetric-left-022 | 5 | asymmetric-left | rushed-defense | 17 | 0.0% | 93.5% |
| th6-resource-shield-286 | 6 | resource-shield | maxed | 16 | 0.0% | 98.7% |
| th5-southern-funnel-067 | 5 | southern-funnel | maxed | 15 | 0.0% | 97.6% |
| th5-defense-ring-220 | 5 | defense-ring | maxed | 15 | 0.0% | 93.3% |
| th5-asymmetric-right-294 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 80.7% |
| th5-echelon-left-100 | 5 | echelon-left | maxed | 14 | 0.0% | 98.4% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 11.1% | 86.8% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 5.6% | 89.2% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 5.6% | 80.8% |
| th6-compact-core-002 | 6 | compact-core | maxed | 17 | 5.9% | 94.1% |
| th6-rear-keep-254 | 6 | rear-keep | maxed | 17 | 5.9% | 91.2% |
| th5-asymmetric-right-187 | 5 | asymmetric-right | maxed | 17 | 5.9% | 90.9% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,038 | 5,270 | 1,759.5 | 1,317.5 |  |
| fire_dragon | 7 | 10 | 27,200 | 12,142.86 | 2,720 | 1,214.29 |  |
| archer | 7 | 1 | 2,856 | 987.1 | 2,856 | 987.1 |  |
| demon_king | 7 | 5 | 38,760 | 4,193.33 | 7,752 | 838.67 |  |
| necromancer | 7 | 15 | 38,352 | 11,711.11 | 2,556.8 | 780.74 |  |
| mechanical_dragon | 7 | 4 | 10,200 | 2,891.26 | 2,550 | 722.82 | chain x3 |
| knight | 7 | 1 | 6,460 | 698.89 | 6,460 | 698.89 |  |
| horror | 7 | 20 | 66,412 | 7,129.03 | 3,320.6 | 356.45 |  |
| mimic | 7 | 6 | 26,520 | 1,963.21 | 4,420 | 327.2 | trap immune |
| ice_golem | 7 | 10 | 71,400 | 2,765.49 | 7,140 | 276.55 | defense priority |
| pea_shooter | 7 | 5 | 18,700 | 1,321.14 | 3,740 | 264.23 |  |
| wind_mage | 7 | 15 | 31,960 | 3,307.27 | 2,130.67 | 220.48 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-hp-outlier:** demon_king HP/slot is 2.51x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 64.3% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 93.0% attacker wins across 300 samples (reference 65.1%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 34.3% attacker wins across 300 samples (reference 65.1%).
- **WARNING / pure-troop-outlier:** pure-troop mechanical_dragon has 80.9% attacker wins across 199 samples (reference 65.1%).
- **WARNING / pure-troop-outlier:** pure-troop necromancer has 47.5% attacker wins across 99 samples (reference 65.1%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 93.0% attacker wins across 300 isolated samples.
- **WARNING / degenerate-pure-army:** Pure mechanical_dragon armies have 80.9% attacker wins across 199 isolated samples.
- **WARNING / town-hall-target-band:** policy-exploration|TH6 has 65.7% attacker wins across 869 samples; authored target is 45.0%-55.0%.
- **WARNING / town-hall-target-band:** policy-exploration|TH7 has 73.3% attacker wins across 864 samples; authored target is 45.0%-55.0%.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-294 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-100 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-echelon-right-265 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-kill-corridor-214 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-layered-rings-061 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-145 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-178 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-southern-funnel-013 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-067 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-229 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-split-core-280 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-trap-lanes-297 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-127 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-022 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-left-076 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-184 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-right-079 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-133 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-294 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-163 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-corner-keep-247 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-043 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-defense-ring-112 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-220 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-196 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-echelon-left-046 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-echelon-left-100 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-echelon-left-262 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-left-077 has 100.0% attacker wins across 18 samples.
- **INFO / fragile-base:** th6-asymmetric-left-131 has 100.0% attacker wins across 18 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-185 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-asymmetric-right-080 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-right-242 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-cannon-screen-095 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-cannon-screen-149 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-compact-core-164 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-corner-keep-140 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-corner-keep-248 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-crossfire-044 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-defense-ring-113 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-diamond-197 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-echelon-left-155 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-echelon-left-263 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-echelon-right-266 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th6-kill-corridor-215 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-layered-rings-062 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-rear-keep-146 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-resource-shield-071 has 100.0% attacker wins across 18 samples.
- **INFO / fragile-base:** th6-resource-shield-179 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-resource-shield-286 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-southern-funnel-230 has 100.0% attacker wins across 18 samples.
- **INFO / fragile-base:** th6-split-core-011 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th6-split-core-119 has 0.0% attacker wins across 18 samples.
- **INFO / fragile-base:** th6-split-core-281 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-029 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-298 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-wide-spread-128 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-wide-spread-182 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-wide-spread-289 has 100.0% attacker wins across 18 samples.
- 36 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
