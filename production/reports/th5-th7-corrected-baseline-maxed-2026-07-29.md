# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:11:27.270Z
**Seed:** 55001
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 12):** 56
**Replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 114.8s

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
| 5000 | 2367 | 47.3% | 0 | 25.7s | 47.9% | 49.4% | 30.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 805 | 45.9% | 0 | 23.8s | 48.8% | 51.9% |
| TH6->TH6 | 1669 | 800 | 47.9% | 0 | 26.9s | 49.2% | 49.7% |
| TH5->TH5 | 1576 | 762 | 48.4% | 0 | 26.6s | 45.3% | 46.4% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 147 | 36.2% | 0 | 22.6s | 43.0% | 59.9% |
| resource-shield | 381 | 145 | 38.1% | 0 | 23.6s | 42.0% | 58.9% |
| asymmetric-right | 376 | 165 | 43.9% | 0 | 25.2s | 47.7% | 52.9% |
| crossfire | 339 | 160 | 47.2% | 0 | 24.7s | 45.3% | 49.9% |
| diamond | 338 | 156 | 46.2% | 0 | 23.9s | 48.3% | 50.1% |
| kill-corridor | 336 | 178 | 53.0% | 0 | 25.3s | 48.6% | 44.3% |
| trap-lanes | 274 | 159 | 58.0% | 0 | 27.4s | 51.6% | 38.4% |
| wide-spread | 272 | 169 | 62.1% | 0 | 29.2s | 57.1% | 34.9% |
| compact-core | 250 | 91 | 36.4% | 0 | 25.9s | 44.1% | 59.5% |
| asymmetric-left | 249 | 101 | 40.6% | 0 | 26.9s | 48.2% | 55.9% |
| southern-funnel | 247 | 122 | 49.4% | 0 | 25.4s | 46.8% | 47.8% |
| defense-ring | 245 | 110 | 44.9% | 0 | 27.6s | 52.6% | 50.9% |
| split-core | 239 | 122 | 51.0% | 0 | 25.3s | 49.8% | 45.0% |
| corner-keep | 221 | 94 | 42.5% | 0 | 26.8s | 49.0% | 53.0% |
| echelon-right | 208 | 118 | 56.7% | 0 | 28.2s | 49.5% | 40.5% |
| cannon-screen | 207 | 118 | 57.0% | 0 | 25.3s | 48.4% | 41.9% |
| echelon-left | 206 | 106 | 51.5% | 0 | 27.4s | 48.7% | 46.8% |
| rear-keep | 206 | 106 | 51.5% | 0 | 26.7s | 47.8% | 45.8% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 73 | 34.4% | 0 | 20.2s | 40.9% | 62.4% |
| resource-shield\|TH7 | 185 | 66 | 35.7% | 0 | 21.8s | 42.2% | 61.2% |
| asymmetric-right\|TH7 | 184 | 86 | 46.7% | 0 | 23.0s | 48.2% | 50.9% |
| kill-corridor\|TH7 | 177 | 99 | 55.9% | 0 | 24.0s | 50.1% | 42.2% |
| crossfire\|TH7 | 176 | 88 | 50.0% | 0 | 23.0s | 47.2% | 47.5% |
| diamond\|TH7 | 175 | 87 | 49.7% | 0 | 23.1s | 49.2% | 47.3% |
| compact-core\|TH6 | 103 | 40 | 38.8% | 0 | 25.6s | 45.0% | 58.2% |
| asymmetric-left\|TH6 | 101 | 46 | 45.5% | 0 | 27.8s | 50.2% | 51.3% |
| layered-rings\|TH6 | 101 | 43 | 42.6% | 0 | 24.5s | 46.4% | 56.0% |
| resource-shield\|TH6 | 101 | 43 | 42.6% | 0 | 27.2s | 43.9% | 55.8% |
| trap-lanes\|TH6 | 101 | 48 | 47.5% | 0 | 25.7s | 48.2% | 49.2% |
| southern-funnel\|TH6 | 100 | 48 | 48.0% | 0 | 24.6s | 45.7% | 50.1% |
| split-core\|TH6 | 100 | 56 | 56.0% | 0 | 26.9s | 53.1% | 41.8% |
| wide-spread\|TH6 | 99 | 65 | 65.7% | 0 | 30.2s | 62.8% | 32.6% |
| asymmetric-right\|TH6 | 98 | 42 | 42.9% | 0 | 26.6s | 48.4% | 55.1% |
| defense-ring\|TH6 | 98 | 51 | 52.0% | 0 | 27.7s | 54.1% | 45.2% |
| resource-shield\|TH5 | 95 | 36 | 37.9% | 0 | 23.2s | 39.5% | 57.8% |
| asymmetric-left\|TH5 | 94 | 35 | 37.2% | 0 | 26.9s | 44.2% | 56.9% |
| asymmetric-right\|TH5 | 94 | 37 | 39.4% | 0 | 28.1s | 45.8% | 54.4% |
| corner-keep\|TH5 | 94 | 38 | 40.4% | 0 | 26.1s | 45.4% | 51.8% |
| split-core\|TH5 | 94 | 47 | 50.0% | 0 | 23.1s | 44.2% | 43.0% |
| compact-core\|TH5 | 93 | 35 | 37.6% | 0 | 27.0s | 42.5% | 55.4% |
| defense-ring\|TH5 | 93 | 38 | 40.9% | 0 | 28.1s | 49.0% | 52.7% |
| layered-rings\|TH5 | 93 | 31 | 33.3% | 0 | 25.9s | 44.4% | 58.2% |
| southern-funnel\|TH5 | 93 | 52 | 55.9% | 0 | 26.2s | 47.0% | 39.4% |
| trap-lanes\|TH5 | 93 | 58 | 62.4% | 0 | 29.7s | 46.8% | 32.6% |
| wide-spread\|TH5 | 93 | 58 | 62.4% | 0 | 29.0s | 52.4% | 34.2% |
| diamond\|TH6 | 85 | 33 | 38.8% | 0 | 25.7s | 48.1% | 55.2% |
| echelon-right\|TH6 | 85 | 47 | 55.3% | 0 | 27.9s | 48.6% | 41.9% |
| cannon-screen\|TH6 | 84 | 51 | 60.7% | 0 | 26.2s | 50.2% | 39.0% |
| crossfire\|TH6 | 84 | 31 | 36.9% | 0 | 24.7s | 41.8% | 60.4% |
| echelon-left\|TH6 | 83 | 39 | 47.0% | 0 | 30.9s | 49.4% | 51.3% |
| corner-keep\|TH6 | 82 | 37 | 45.1% | 0 | 28.3s | 51.7% | 51.8% |
| kill-corridor\|TH6 | 82 | 41 | 50.0% | 0 | 26.9s | 51.3% | 49.2% |
| rear-keep\|TH6 | 82 | 39 | 47.6% | 0 | 26.9s | 45.9% | 50.0% |
| trap-lanes\|TH7 | 80 | 53 | 66.3% | 0 | 26.8s | 60.5% | 31.7% |
| wide-spread\|TH7 | 80 | 46 | 57.5% | 0 | 28.2s | 55.2% | 38.3% |
| crossfire\|TH5 | 79 | 41 | 51.9% | 0 | 28.3s | 44.7% | 44.0% |
| rear-keep\|TH5 | 79 | 43 | 54.4% | 0 | 26.9s | 44.4% | 40.9% |
| cannon-screen\|TH5 | 78 | 44 | 56.4% | 0 | 24.0s | 42.1% | 41.0% |
| diamond\|TH5 | 78 | 36 | 46.2% | 0 | 23.7s | 46.3% | 50.9% |
| echelon-left\|TH5 | 78 | 45 | 57.7% | 0 | 24.3s | 45.9% | 40.0% |
| echelon-right\|TH5 | 78 | 50 | 64.1% | 0 | 31.0s | 47.8% | 31.8% |
| kill-corridor\|TH5 | 77 | 38 | 49.4% | 0 | 26.7s | 41.7% | 44.0% |
| asymmetric-left\|TH7 | 54 | 20 | 37.0% | 0 | 25.3s | 50.8% | 62.9% |
| compact-core\|TH7 | 54 | 16 | 29.6% | 0 | 24.5s | 45.0% | 69.0% |
| defense-ring\|TH7 | 54 | 21 | 38.9% | 0 | 26.6s | 55.4% | 58.4% |
| southern-funnel\|TH7 | 54 | 22 | 40.7% | 0 | 25.6s | 48.4% | 58.2% |
| cannon-screen\|TH7 | 45 | 23 | 51.1% | 0 | 25.9s | 55.0% | 48.9% |
| corner-keep\|TH7 | 45 | 19 | 42.2% | 0 | 25.6s | 51.0% | 57.8% |
| echelon-left\|TH7 | 45 | 22 | 48.9% | 0 | 26.4s | 52.1% | 50.5% |
| echelon-right\|TH7 | 45 | 21 | 46.7% | 0 | 24.0s | 53.6% | 53.1% |
| rear-keep\|TH7 | 45 | 24 | 53.3% | 0 | 26.2s | 56.5% | 46.7% |
| split-core\|TH7 | 45 | 19 | 42.2% | 0 | 26.5s | 53.7% | 56.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 60 | 5.7% | 0 | 17.7s | 28.8% | 90.5% |
| mid | 1011 | 606 | 59.9% | 0 | 32.1s | 58.9% | 34.0% |
| rushed-economy | 999 | 998 | 99.9% | 0 | 30.6s | 73.3% | 0.1% |
| maxed | 985 | 25 | 2.5% | 0 | 19.9s | 17.1% | 95.2% |
| mixed | 953 | 678 | 71.1% | 0 | 28.6s | 62.4% | 24.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1253 | 48.2% | 0 | 22.9s | 41.1% | 46.9% |
| pure-unit-matrix | 2398 | 1114 | 46.5% | 0 | 28.8s | 55.2% | 52.2% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 387 | 43.4% | 0 | 25.7s | 53.2% | 55.5% |
| policy-exploration\|TH5 | 869 | 411 | 47.3% | 0 | 21.8s | 33.1% | 44.8% |
| policy-exploration\|TH6 | 869 | 424 | 48.8% | 0 | 25.0s | 45.3% | 47.6% |
| policy-exploration\|TH7 | 864 | 418 | 48.4% | 0 | 21.8s | 44.3% | 48.3% |
| pure-unit-matrix\|TH6 | 800 | 376 | 47.0% | 0 | 28.9s | 53.4% | 52.0% |
| pure-unit-matrix\|TH5 | 707 | 351 | 49.6% | 0 | 32.4s | 60.2% | 48.3% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1114 | 46.5% | 0 | 28.8s | 55.2% | 52.2% |
| policy-exploration\|none | 395 | 197 | 49.9% | 0 | 27.9s | 58.1% | 48.5% |
| policy-exploration\|rally-core | 365 | 157 | 43.0% | 0 | 14.8s | 5.3% | 41.5% |
| policy-exploration\|cannon-focus | 357 | 165 | 46.2% | 0 | 27.3s | 57.8% | 52.2% |
| policy-exploration\|cannon-rally | 340 | 171 | 50.3% | 0 | 14.2s | 5.9% | 38.6% |
| policy-exploration\|freeze-rage | 165 | 87 | 52.7% | 0 | 27.3s | 59.9% | 45.4% |
| policy-exploration\|freeze-barrel | 157 | 75 | 47.8% | 0 | 26.5s | 55.2% | 51.3% |
| policy-exploration\|freeze-defense | 157 | 79 | 50.3% | 0 | 25.7s | 56.8% | 48.5% |
| policy-exploration\|rage-entry | 148 | 70 | 47.3% | 0 | 25.2s | 56.1% | 51.0% |
| policy-exploration\|medkit-entry | 137 | 66 | 48.2% | 0 | 26.8s | 55.9% | 51.0% |
| policy-exploration\|cannon-medkit | 129 | 63 | 48.8% | 0 | 26.3s | 56.2% | 51.1% |
| policy-exploration\|skeleton-barrel | 128 | 66 | 51.6% | 0 | 26.0s | 57.7% | 47.6% |
| policy-exploration\|rally-rage | 124 | 57 | 46.0% | 0 | 13.6s | 6.5% | 44.1% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 278 | 127 | 45.7% | 0 | 23.0s | 38.7% | 48.3% |
| policy-exploration\|center-column | 272 | 134 | 49.3% | 0 | 22.9s | 42.2% | 45.0% |
| policy-exploration\|left-flank | 266 | 145 | 54.5% | 0 | 22.5s | 35.0% | 40.3% |
| policy-exploration\|diamond | 263 | 115 | 43.7% | 0 | 21.9s | 41.6% | 52.3% |
| policy-exploration\|edge-sweep | 262 | 129 | 49.2% | 0 | 24.4s | 44.4% | 46.6% |
| policy-exploration\|dual-flank | 258 | 116 | 45.0% | 0 | 21.9s | 41.7% | 49.0% |
| policy-exploration\|vanguard-wedge | 257 | 116 | 45.1% | 0 | 24.0s | 38.4% | 49.2% |
| policy-exploration\|three-lane | 255 | 118 | 46.3% | 0 | 22.5s | 42.9% | 50.4% |
| policy-exploration\|right-flank | 250 | 130 | 52.0% | 0 | 23.0s | 39.4% | 43.1% |
| policy-exploration\|wide-line | 241 | 123 | 51.0% | 0 | 22.7s | 46.9% | 44.1% |
| pure-unit-matrix\|center-column | 240 | 111 | 46.3% | 0 | 28.2s | 54.6% | 52.5% |
| pure-unit-matrix\|diamond | 240 | 113 | 47.1% | 0 | 27.8s | 54.2% | 52.5% |
| pure-unit-matrix\|dual-flank | 240 | 116 | 48.3% | 0 | 28.1s | 57.6% | 51.0% |
| pure-unit-matrix\|inverted-wedge | 240 | 114 | 47.5% | 0 | 30.7s | 54.6% | 51.6% |
| pure-unit-matrix\|left-flank | 240 | 121 | 50.4% | 0 | 31.7s | 54.5% | 46.9% |
| pure-unit-matrix\|right-flank | 240 | 120 | 50.0% | 0 | 30.1s | 55.0% | 47.8% |
| pure-unit-matrix\|three-lane | 240 | 105 | 43.8% | 0 | 26.6s | 55.0% | 55.7% |
| pure-unit-matrix\|vanguard-wedge | 240 | 102 | 42.5% | 0 | 29.6s | 52.8% | 55.4% |
| pure-unit-matrix\|wide-line | 240 | 107 | 44.6% | 0 | 28.4s | 57.3% | 53.7% |
| pure-unit-matrix\|edge-sweep | 238 | 105 | 44.1% | 0 | 26.4s | 56.6% | 55.1% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|three-waves | 528 | 231 | 43.8% | 0 | 22.9s | 39.3% | 50.8% |
| policy-exploration\|burst | 526 | 260 | 49.4% | 0 | 23.2s | 43.5% | 45.6% |
| policy-exploration\|rapid | 525 | 277 | 52.8% | 0 | 22.9s | 43.5% | 42.5% |
| policy-exploration\|drip | 515 | 224 | 43.5% | 0 | 21.7s | 36.5% | 52.0% |
| policy-exploration\|two-waves | 508 | 261 | 51.4% | 0 | 23.7s | 42.4% | 43.3% |
| pure-unit-matrix\|burst | 480 | 225 | 46.9% | 0 | 27.4s | 55.8% | 52.3% |
| pure-unit-matrix\|rapid | 480 | 224 | 46.7% | 0 | 28.9s | 55.2% | 51.9% |
| pure-unit-matrix\|three-waves | 480 | 214 | 44.6% | 0 | 28.8s | 54.3% | 53.7% |
| pure-unit-matrix\|two-waves | 480 | 231 | 48.1% | 0 | 28.4s | 55.7% | 51.2% |
| pure-unit-matrix\|drip | 478 | 220 | 46.0% | 0 | 30.3s | 55.1% | 52.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 1306 | 619 | 47.4% | 0 | 23.4s | 41.1% | 47.3% |
| policy-exploration\|roster-order | 1296 | 634 | 48.9% | 0 | 22.3s | 41.0% | 46.4% |
| pure-unit-matrix\|roster-order | 1199 | 556 | 46.4% | 0 | 28.4s | 55.1% | 52.4% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 558 | 46.5% | 0 | 29.1s | 55.3% | 52.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 442 | 297 | 67.2% | 0 | 26.8s | 64.9% | 28.8% |
| pure-fire_dragon | 442 | 264 | 59.7% | 0 | 20.2s | 64.4% | 39.2% |
| pure-mimic | 432 | 146 | 33.8% | 0 | 33.3s | 40.4% | 63.4% |
| pure-pea_shooter | 418 | 172 | 41.1% | 0 | 27.1s | 49.6% | 56.9% |
| pure-archer | 411 | 148 | 36.0% | 0 | 33.9s | 47.9% | 60.4% |
| pure-knight | 409 | 235 | 57.5% | 0 | 31.2s | 52.7% | 38.4% |
| pure-mage | 408 | 92 | 22.5% | 0 | 21.0s | 31.6% | 76.3% |
| pure-mechanical_dragon | 265 | 147 | 55.5% | 0 | 24.2s | 59.0% | 43.5% |
| pure-necromancer | 147 | 39 | 26.5% | 0 | 26.9s | 36.3% | 72.8% |
| random-2 | 133 | 60 | 45.1% | 0 | 22.9s | 38.7% | 47.5% |
| random-3 | 132 | 60 | 45.5% | 0 | 27.3s | 50.2% | 52.2% |
| ranged-pressure | 126 | 51 | 40.5% | 0 | 19.4s | 38.0% | 52.2% |
| trap-runner-mix | 124 | 61 | 49.2% | 0 | 27.2s | 53.8% | 46.4% |
| random-5 | 123 | 68 | 55.3% | 0 | 21.0s | 32.3% | 39.7% |
| melee-pressure | 119 | 70 | 58.8% | 0 | 27.6s | 53.9% | 39.3% |
| support-mix | 119 | 49 | 41.2% | 0 | 19.6s | 32.7% | 48.7% |
| random-1 | 116 | 54 | 46.6% | 0 | 19.5s | 27.1% | 48.6% |
| random-6 | 114 | 63 | 55.3% | 0 | 27.4s | 48.8% | 40.3% |
| balanced | 112 | 81 | 72.3% | 0 | 19.0s | 36.5% | 24.7% |
| frontline-ranged | 112 | 63 | 56.3% | 0 | 22.1s | 49.7% | 41.2% |
| hero-necro-dragon-mages | 109 | 59 | 54.1% | 0 | 21.2s | 51.3% | 43.5% |
| random-4 | 108 | 46 | 42.6% | 0 | 19.0s | 33.3% | 48.8% |
| air-pressure | 79 | 42 | 53.2% | 0 | 17.6s | 48.3% | 43.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__drip__tank-front-support-rear | 57 | 20 | 35.1% | 0 | 23.7s | 38.2% | 57.5% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 32 | 56.1% | 0 | 27.0s | 62.9% | 43.5% |
| inverted-wedge__burst__roster-order | 57 | 28 | 49.1% | 0 | 25.8s | 52.5% | 46.6% |
| three-lane__rapid__roster-order | 57 | 23 | 40.4% | 0 | 25.4s | 52.8% | 59.5% |
| center-column__burst__roster-order | 56 | 27 | 48.2% | 0 | 26.3s | 51.3% | 48.1% |
| center-column__three-waves__roster-order | 56 | 32 | 57.1% | 0 | 24.4s | 48.9% | 42.4% |
| dual-flank__two-waves__roster-order | 56 | 26 | 46.4% | 0 | 25.4s | 59.9% | 52.9% |
| inverted-wedge__rapid__roster-order | 56 | 23 | 41.1% | 0 | 24.7s | 39.5% | 49.5% |
| left-flank__three-waves__roster-order | 56 | 32 | 57.1% | 0 | 25.4s | 43.2% | 40.6% |
| left-flank__three-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 26.5s | 36.3% | 48.8% |
| left-flank__two-waves__roster-order | 56 | 35 | 62.5% | 0 | 23.4s | 43.7% | 33.2% |
| right-flank__three-waves__tank-front-support-rear | 56 | 21 | 37.5% | 0 | 24.7s | 37.2% | 57.6% |
| center-column__burst__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 28.1s | 59.5% | 47.3% |
| diamond__burst__roster-order | 55 | 19 | 34.5% | 0 | 20.5s | 37.8% | 58.7% |
| dual-flank__rapid__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 26.1s | 58.2% | 41.6% |
| dual-flank__three-waves__roster-order | 55 | 30 | 54.5% | 0 | 26.1s | 51.0% | 42.3% |
| edge-sweep__drip__tank-front-support-rear | 55 | 23 | 41.8% | 0 | 23.9s | 42.8% | 57.1% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 24.2s | 41.2% | 53.2% |
| inverted-wedge__drip__roster-order | 55 | 20 | 36.4% | 0 | 26.8s | 43.8% | 62.3% |
| left-flank__drip__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 27.6s | 36.6% | 49.1% |
| three-lane__three-waves__roster-order | 55 | 20 | 36.4% | 0 | 24.4s | 41.5% | 62.5% |
| three-lane__two-waves__roster-order | 55 | 28 | 50.9% | 0 | 23.6s | 53.4% | 48.6% |
| vanguard-wedge__burst__tank-front-support-rear | 55 | 19 | 34.5% | 0 | 23.3s | 35.3% | 56.4% |
| wide-line__burst__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 23.8s | 57.8% | 42.3% |
| wide-line__drip__tank-front-support-rear | 55 | 22 | 40.0% | 0 | 28.4s | 59.3% | 57.7% |
| dual-flank__two-waves__tank-front-support-rear | 54 | 26 | 48.1% | 0 | 26.3s | 54.4% | 51.1% |
| left-flank__drip__roster-order | 54 | 30 | 55.6% | 0 | 25.6s | 46.2% | 38.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 23.4s | 44.0% | 52.7% |
| center-column__rapid__roster-order | 51 | 28 | 54.9% | 0 | 30.5s | 57.2% | 42.7% |
| diamond__burst__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.2s | 54.2% | 46.8% |
| diamond__three-waves__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 26.9s | 50.4% | 53.9% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 26.5s | 40.7% | 48.2% |
| inverted-wedge__two-waves__roster-order | 51 | 20 | 39.2% | 0 | 25.2s | 31.6% | 58.8% |
| left-flank__two-waves__tank-front-support-rear | 51 | 18 | 35.3% | 0 | 29.4s | 40.8% | 58.0% |
| right-flank__rapid__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 27.4s | 53.4% | 44.3% |
| right-flank__two-waves__tank-front-support-rear | 51 | 35 | 68.6% | 0 | 29.7s | 49.8% | 30.8% |
| three-lane__rapid__tank-front-support-rear | 51 | 21 | 41.2% | 0 | 25.3s | 54.5% | 58.1% |
| vanguard-wedge__burst__roster-order | 51 | 19 | 37.3% | 0 | 24.5s | 40.4% | 56.8% |
| vanguard-wedge__drip__roster-order | 51 | 27 | 52.9% | 0 | 25.4s | 43.7% | 45.9% |
| center-column__drip__roster-order | 50 | 17 | 34.0% | 0 | 21.2s | 38.4% | 63.3% |
| center-column__rapid__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 24.7s | 38.3% | 40.0% |
| center-column__three-waves__tank-front-support-rear | 50 | 16 | 32.0% | 0 | 25.0s | 38.5% | 60.2% |
| center-column__two-waves__roster-order | 50 | 19 | 38.0% | 0 | 21.2s | 45.0% | 55.5% |
| center-column__two-waves__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 24.6s | 43.1% | 40.4% |
| diamond__rapid__roster-order | 50 | 32 | 64.0% | 0 | 24.5s | 49.1% | 36.0% |
| diamond__rapid__tank-front-support-rear | 50 | 21 | 42.0% | 0 | 26.7s | 45.5% | 56.5% |
| diamond__two-waves__tank-front-support-rear | 50 | 21 | 42.0% | 0 | 23.4s | 52.2% | 58.0% |
| dual-flank__burst__tank-front-support-rear | 50 | 17 | 34.0% | 0 | 23.2s | 48.8% | 66.0% |
| dual-flank__rapid__roster-order | 50 | 18 | 36.0% | 0 | 26.5s | 46.3% | 62.2% |
| edge-sweep__burst__roster-order | 50 | 25 | 50.0% | 0 | 25.7s | 52.3% | 48.1% |
| edge-sweep__drip__roster-order | 50 | 19 | 38.0% | 0 | 26.8s | 56.2% | 61.8% |
| edge-sweep__rapid__tank-front-support-rear | 50 | 14 | 28.0% | 0 | 23.8s | 42.1% | 65.0% |
| edge-sweep__three-waves__roster-order | 50 | 23 | 46.0% | 0 | 27.5s | 53.9% | 51.1% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 29.4s | 59.5% | 44.0% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 25.4s | 51.6% | 32.3% |
| inverted-wedge__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 31.0s | 58.9% | 35.5% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 15 | 30.0% | 0 | 23.3s | 31.8% | 59.8% |
| left-flank__burst__roster-order | 50 | 25 | 50.0% | 0 | 32.3s | 49.3% | 47.6% |
| right-flank__burst__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 33.3s | 53.0% | 44.7% |
| right-flank__drip__roster-order | 50 | 25 | 50.0% | 0 | 25.0s | 36.9% | 46.9% |
| right-flank__drip__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 23.5s | 40.5% | 48.8% |
| three-lane__two-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 30.9s | 66.3% | 38.0% |
| vanguard-wedge__drip__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 33.6s | 46.5% | 52.5% |
| wide-line__rapid__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 27.5s | 45.6% | 48.4% |
| wide-line__three-waves__tank-front-support-rear | 50 | 16 | 32.0% | 0 | 22.4s | 43.8% | 62.9% |
| diamond__two-waves__roster-order | 49 | 26 | 53.1% | 0 | 26.7s | 60.8% | 46.9% |
| dual-flank__three-waves__tank-front-support-rear | 49 | 18 | 36.7% | 0 | 23.3s | 37.3% | 53.1% |
| edge-sweep__rapid__roster-order | 49 | 29 | 59.2% | 0 | 26.3s | 61.2% | 40.0% |
| right-flank__burst__roster-order | 49 | 27 | 55.1% | 0 | 24.5s | 56.1% | 43.4% |
| three-lane__drip__roster-order | 49 | 16 | 32.7% | 0 | 22.3s | 43.5% | 58.8% |
| vanguard-wedge__rapid__roster-order | 49 | 22 | 44.9% | 0 | 24.3s | 45.4% | 53.5% |
| vanguard-wedge__two-waves__roster-order | 49 | 28 | 57.1% | 0 | 31.5s | 56.5% | 36.7% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 26 | 53.1% | 0 | 27.8s | 47.4% | 41.5% |
| wide-line__burst__roster-order | 49 | 28 | 57.1% | 0 | 26.4s | 63.7% | 41.4% |
| wide-line__rapid__roster-order | 49 | 27 | 55.1% | 0 | 24.2s | 46.2% | 39.6% |
| diamond__drip__roster-order | 45 | 21 | 46.7% | 0 | 24.2s | 38.6% | 51.3% |
| diamond__three-waves__roster-order | 45 | 18 | 40.0% | 0 | 26.3s | 51.4% | 57.2% |
| dual-flank__burst__roster-order | 45 | 24 | 53.3% | 0 | 22.3s | 36.8% | 39.1% |
| dual-flank__drip__roster-order | 45 | 23 | 51.1% | 0 | 22.8s | 50.7% | 46.9% |
| left-flank__rapid__tank-front-support-rear | 45 | 30 | 66.7% | 0 | 27.9s | 62.1% | 31.5% |
| right-flank__two-waves__roster-order | 45 | 19 | 42.2% | 0 | 23.4s | 43.4% | 56.3% |
| three-lane__burst__roster-order | 45 | 14 | 31.1% | 0 | 20.2s | 35.6% | 65.7% |
| three-lane__burst__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 24.5s | 54.2% | 35.2% |
| vanguard-wedge__three-waves__roster-order | 45 | 15 | 33.3% | 0 | 23.9s | 46.9% | 66.2% |
| wide-line__drip__roster-order | 45 | 20 | 44.4% | 0 | 30.2s | 57.2% | 50.9% |
| wide-line__three-waves__roster-order | 45 | 19 | 42.2% | 0 | 23.2s | 47.7% | 53.4% |
| center-column__drip__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 28.1s | 59.1% | 46.0% |
| edge-sweep__burst__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 24.6s | 52.2% | 49.1% |
| edge-sweep__two-waves__roster-order | 44 | 25 | 56.8% | 0 | 20.8s | 36.0% | 41.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 30.6s | 52.3% | 55.9% |
| left-flank__rapid__roster-order | 44 | 19 | 43.2% | 0 | 25.1s | 33.0% | 50.9% |
| right-flank__rapid__roster-order | 44 | 30 | 68.2% | 0 | 25.6s | 57.2% | 30.7% |
| right-flank__three-waves__roster-order | 44 | 18 | 40.9% | 0 | 27.2s | 44.8% | 49.6% |
| three-lane__drip__tank-front-support-rear | 44 | 19 | 43.2% | 0 | 21.4s | 28.4% | 54.5% |
| three-lane__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 25.9s | 54.6% | 46.2% |
| vanguard-wedge__three-waves__tank-front-support-rear | 44 | 15 | 34.1% | 0 | 29.9s | 49.7% | 61.6% |
| wide-line__two-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 24.0s | 46.4% | 45.6% |
| dual-flank__drip__tank-front-support-rear | 39 | 19 | 48.7% | 0 | 26.1s | 45.2% | 42.6% |
| left-flank__burst__tank-front-support-rear | 39 | 24 | 61.5% | 0 | 25.4s | 56.7% | 35.0% |
| wide-line__two-waves__roster-order | 39 | 20 | 51.3% | 0 | 25.0s | 51.4% | 46.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 518 | 241 | 46.5% | 0 | 26.5s | 46.1% | 49.8% |
| center-column | 512 | 245 | 47.9% | 0 | 25.4s | 48.0% | 48.5% |
| left-flank | 506 | 266 | 52.6% | 0 | 26.8s | 44.3% | 43.4% |
| diamond | 503 | 228 | 45.3% | 0 | 24.8s | 47.6% | 52.4% |
| edge-sweep | 500 | 234 | 46.8% | 0 | 25.4s | 50.2% | 50.6% |
| dual-flank | 498 | 232 | 46.6% | 0 | 24.9s | 49.4% | 50.0% |
| vanguard-wedge | 497 | 218 | 43.9% | 0 | 26.7s | 45.4% | 52.2% |
| three-lane | 495 | 223 | 45.1% | 0 | 24.5s | 48.8% | 53.0% |
| right-flank | 490 | 250 | 51.0% | 0 | 26.5s | 47.1% | 45.4% |
| wide-line | 481 | 230 | 47.8% | 0 | 25.5s | 52.1% | 48.9% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| three-waves | 1008 | 445 | 44.1% | 0 | 25.7s | 46.5% | 52.1% |
| burst | 1006 | 485 | 48.2% | 0 | 25.2s | 49.4% | 48.8% |
| rapid | 1005 | 501 | 49.9% | 0 | 25.8s | 49.1% | 47.0% |
| drip | 993 | 444 | 44.7% | 0 | 25.8s | 45.5% | 52.0% |
| two-waves | 988 | 492 | 49.8% | 0 | 26.0s | 48.9% | 47.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 2505 | 1177 | 47.0% | 0 | 26.1s | 47.9% | 49.6% |
| roster-order | 2495 | 1190 | 47.7% | 0 | 25.2s | 47.8% | 49.3% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2793 | 1311 | 46.9% | 0 | 28.6s | 55.6% | 51.7% |
| rally-core | 365 | 157 | 43.0% | 0 | 14.8s | 5.3% | 41.5% |
| cannon-focus | 357 | 165 | 46.2% | 0 | 27.3s | 57.8% | 52.2% |
| cannon-rally | 340 | 171 | 50.3% | 0 | 14.2s | 5.9% | 38.6% |
| freeze-rage | 165 | 87 | 52.7% | 0 | 27.3s | 59.9% | 45.4% |
| freeze-barrel | 157 | 75 | 47.8% | 0 | 26.5s | 55.2% | 51.3% |
| freeze-defense | 157 | 79 | 50.3% | 0 | 25.7s | 56.8% | 48.5% |
| rage-entry | 148 | 70 | 47.3% | 0 | 25.2s | 56.1% | 51.0% |
| medkit-entry | 137 | 66 | 48.2% | 0 | 26.8s | 55.9% | 51.0% |
| cannon-medkit | 129 | 63 | 48.8% | 0 | 26.3s | 56.2% | 51.1% |
| skeleton-barrel | 128 | 66 | 51.6% | 0 | 26.0s | 57.7% | 47.6% |
| rally-rage | 124 | 57 | 46.0% | 0 | 13.6s | 6.5% | 44.1% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 3060 | 1424 | 46.5% | 0 | 27.6s | 52.3% | 51.2% |
| legendary | 660 | 315 | 47.7% | 0 | 22.7s | 41.3% | 47.3% |
| epic | 657 | 320 | 48.7% | 0 | 22.2s | 41.2% | 45.7% |
| unrevealed | 623 | 308 | 49.4% | 0 | 23.0s | 40.1% | 46.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1438 | 47.4% | 0 | 27.6s | 52.7% | 50.6% |
| ward-1 | 767 | 384 | 50.1% | 0 | 23.3s | 42.1% | 46.4% |
| ward-3 | 601 | 267 | 44.4% | 0 | 22.4s | 40.0% | 49.9% |
| ward-2 | 600 | 278 | 46.3% | 0 | 22.4s | 38.6% | 47.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2367 | 47.3% | 0 | 25.7s | 47.9% | 49.4% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1887 | 999 | 52.9% | 0 | 21.5s | 47.2% | 42.9% |
| demon_king | 1863 | 1031 | 55.3% | 0 | 23.8s | 47.8% | 40.1% |
| mage | 1836 | 807 | 44.0% | 0 | 22.0s | 39.0% | 51.7% |
| knight | 1830 | 969 | 53.0% | 0 | 24.8s | 44.7% | 42.4% |
| archer | 1730 | 804 | 46.5% | 0 | 25.1s | 42.1% | 48.5% |
| mimic | 1626 | 767 | 47.2% | 0 | 25.9s | 41.1% | 48.3% |
| pea_shooter | 1270 | 574 | 45.2% | 0 | 24.0s | 42.2% | 50.4% |
| mechanical_dragon | 906 | 455 | 50.2% | 0 | 23.0s | 48.5% | 46.7% |
| necromancer | 436 | 171 | 39.2% | 0 | 23.7s | 41.4% | 58.6% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 38.7% | 33.3%-44.3% | 53.1% | 60.3% | 22.2% |
| demon_king | 300 | 68.3% | 62.9%-73.3% | 71.2% | 29.7% | 56.0% |
| fire_dragon | 300 | 60.0% | 54.4%-65.4% | 66.7% | 38.8% | 51.1% |
| knight | 300 | 53.7% | 48.0%-59.2% | 60.1% | 42.9% | 35.0% |
| mage | 300 | 24.3% | 19.8%-29.5% | 37.1% | 75.6% | 14.1% |
| mechanical_dragon | 199 | 56.3% | 49.3%-63.0% | 63.6% | 43.4% | 44.3% |
| mimic | 300 | 36.3% | 31.1%-41.9% | 44.5% | 62.1% | 29.3% |
| necromancer | 99 | 26.3% | 18.6%-35.7% | 36.8% | 73.7% | 21.2% |
| pea_shooter | 300 | 44.0% | 38.5%-49.7% | 54.6% | 54.8% | 26.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 39.6% | 30.6%-49.4% | 57.7% | 57.6% | 25.6% |
| archer\|TH6 | 100 | 43.0% | 33.7%-52.8% | 52.3% | 57.0% | 19.8% |
| archer\|TH7 | 99 | 33.3% | 24.8%-43.1% | 49.6% | 66.5% | 21.0% |
| demon_king\|TH5 | 101 | 78.2% | 69.2%-85.2% | 77.3% | 19.2% | 59.4% |
| demon_king\|TH6 | 100 | 65.0% | 55.3%-73.6% | 69.5% | 33.0% | 55.3% |
| demon_king\|TH7 | 99 | 61.6% | 51.8%-70.6% | 67.2% | 37.0% | 53.2% |
| fire_dragon\|TH5 | 101 | 61.4% | 51.6%-70.3% | 71.2% | 36.8% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 62.4% | 38.5% | 51.5% |
| fire_dragon\|TH7 | 99 | 57.6% | 47.7%-66.8% | 66.5% | 41.2% | 51.3% |
| knight\|TH5 | 101 | 53.5% | 43.8%-62.9% | 63.9% | 40.4% | 34.8% |
| knight\|TH6 | 100 | 54.0% | 44.3%-63.4% | 58.2% | 44.2% | 34.0% |
| knight\|TH7 | 99 | 53.5% | 43.8%-63.0% | 58.5% | 44.0% | 36.1% |
| mage\|TH5 | 101 | 27.7% | 19.9%-37.1% | 42.5% | 72.3% | 18.8% |
| mage\|TH6 | 100 | 21.0% | 14.2%-30.0% | 33.4% | 79.0% | 9.7% |
| mage\|TH7 | 99 | 24.2% | 16.9%-33.5% | 35.5% | 75.6% | 13.6% |
| mechanical_dragon\|TH6 | 100 | 55.0% | 45.2%-64.4% | 61.3% | 44.7% | 43.7% |
| mechanical_dragon\|TH7 | 99 | 57.6% | 47.7%-66.8% | 65.7% | 42.1% | 44.9% |
| mimic\|TH5 | 101 | 35.6% | 27.0%-45.4% | 47.8% | 63.7% | 30.7% |
| mimic\|TH6 | 100 | 35.0% | 26.4%-44.7% | 38.8% | 62.9% | 23.6% |
| mimic\|TH7 | 99 | 38.4% | 29.4%-48.2% | 46.8% | 59.7% | 33.8% |
| necromancer\|TH7 | 99 | 26.3% | 18.6%-35.7% | 36.8% | 73.7% | 21.2% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 60.9% | 48.4% | 31.6% |
| pea_shooter\|TH6 | 100 | 42.0% | 32.8%-51.8% | 51.4% | 56.6% | 23.9% |
| pea_shooter\|TH7 | 99 | 38.4% | 29.4%-48.2% | 51.8% | 59.6% | 25.3% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 59.8% | 55.6% | 22.7% |
| archer\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 57.6% | 60.9% | 23.6% |
| archer\|cannon-screen | 15 | 46.7% | 24.8%-69.9% | 45.0% | 53.3% | 28.9% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 52.1% | 61.1% | 15.4% |
| archer\|corner-keep | 16 | 31.3% | 14.2%-55.6% | 54.1% | 68.8% | 17.2% |
| archer\|crossfire | 15 | 26.7% | 10.9%-52.0% | 48.2% | 67.1% | 19.3% |
| archer\|defense-ring | 18 | 33.3% | 16.3%-56.3% | 62.1% | 64.7% | 17.3% |
| archer\|diamond | 15 | 33.3% | 15.2%-58.3% | 51.1% | 66.7% | 21.5% |
| archer\|echelon-left | 15 | 33.3% | 15.2%-58.3% | 47.0% | 66.7% | 24.4% |
| archer\|echelon-right | 15 | 33.3% | 15.2%-58.3% | 45.9% | 66.7% | 23.6% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 50.7% | 53.6% | 23.1% |
| archer\|layered-rings | 18 | 27.8% | 12.5%-50.9% | 54.5% | 67.3% | 16.0% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 46.8% | 60.0% | 20.9% |
| archer\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 49.2% | 66.7% | 18.3% |
| archer\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 43.6% | 61.7% | 21.1% |
| archer\|split-core | 17 | 52.9% | 31.0%-73.8% | 60.2% | 46.9% | 32.0% |
| archer\|trap-lanes | 18 | 50.0% | 29.0%-71.0% | 57.6% | 50.0% | 29.0% |
| archer\|wide-spread | 18 | 50.0% | 29.0%-71.0% | 64.8% | 50.2% | 25.8% |
| demon_king\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 66.5% | 44.0% | 42.0% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 68.4% | 43.2% | 46.3% |
| demon_king\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 70.5% | 26.7% | 61.5% |
| demon_king\|compact-core | 18 | 55.6% | 33.7%-75.4% | 64.0% | 44.4% | 44.4% |
| demon_king\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 72.2% | 37.5% | 53.5% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 74.1% | 23.1% | 57.0% |
| demon_king\|defense-ring | 18 | 72.2% | 49.1%-87.5% | 72.9% | 26.2% | 59.9% |
| demon_king\|diamond | 15 | 66.7% | 41.7%-84.8% | 75.0% | 33.3% | 60.0% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 72.7% | 26.5% | 60.7% |
| demon_king\|echelon-right | 15 | 86.7% | 62.1%-96.3% | 74.1% | 10.0% | 65.2% |
| demon_king\|kill-corridor | 15 | 93.3% | 70.2%-98.8% | 71.6% | 6.7% | 66.7% |
| demon_king\|layered-rings | 18 | 55.6% | 33.7%-75.4% | 66.7% | 38.7% | 47.5% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 71.8% | 29.3% | 53.3% |
| demon_king\|resource-shield | 18 | 55.6% | 33.7%-75.4% | 66.9% | 44.4% | 46.9% |
| demon_king\|southern-funnel | 18 | 77.8% | 54.8%-91.0% | 76.5% | 22.2% | 65.4% |
| demon_king\|split-core | 17 | 64.7% | 41.3%-82.7% | 70.2% | 29.3% | 57.5% |
| demon_king\|trap-lanes | 18 | 77.8% | 54.8%-91.0% | 74.2% | 21.0% | 61.7% |
| demon_king\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 74.8% | 20.1% | 63.6% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 63.3% | 50.0% | 43.1% |
| fire_dragon\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 60.4% | 55.6% | 38.9% |
| fire_dragon\|cannon-screen | 15 | 86.7% | 62.1%-96.3% | 73.0% | 13.3% | 60.0% |
| fire_dragon\|compact-core | 18 | 38.9% | 20.3%-61.4% | 56.8% | 58.8% | 34.7% |
| fire_dragon\|corner-keep | 16 | 56.3% | 33.2%-76.9% | 66.7% | 43.8% | 45.3% |
| fire_dragon\|crossfire | 15 | 60.0% | 35.7%-80.2% | 67.5% | 40.0% | 55.0% |
| fire_dragon\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 70.5% | 37.3% | 52.8% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 70.5% | 40.0% | 56.7% |
| fire_dragon\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 70.0% | 32.5% | 56.7% |
| fire_dragon\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 69.1% | 32.4% | 63.3% |
| fire_dragon\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 68.0% | 32.1% | 53.3% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 59.1% | 50.0% | 41.7% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.0% | 51.7% |
| fire_dragon\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 59.5% | 51.6% | 40.3% |
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 65.5% | 38.9% | 54.2% |
| fire_dragon\|split-core | 17 | 58.8% | 36.0%-78.4% | 66.0% | 41.2% | 48.5% |
| fire_dragon\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 74.2% | 24.3% | 61.1% |
| fire_dragon\|wide-spread | 18 | 88.9% | 67.2%-96.9% | 78.6% | 11.1% | 68.1% |
| knight\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 58.7% | 51.6% | 26.8% |
| knight\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 60.2% | 55.0% | 33.3% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 57.3% | 40.0% | 46.1% |
| knight\|compact-core | 18 | 38.9% | 20.3%-61.4% | 51.9% | 56.6% | 26.0% |
| knight\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 63.9% | 46.0% | 31.3% |
| knight\|crossfire | 15 | 53.3% | 30.1%-75.2% | 58.6% | 46.7% | 33.3% |
| knight\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 66.5% | 40.8% | 28.6% |
| knight\|diamond | 15 | 60.0% | 35.7%-80.2% | 62.3% | 39.1% | 37.9% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 58.9% | 36.2% | 39.1% |
| knight\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 64.1% | 25.6% | 44.3% |
| knight\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 56.6% | 35.3% | 39.7% |
| knight\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 56.3% | 54.0% | 26.3% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.4% | 40.0% | 37.0% |
| knight\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 54.0% | 58.6% | 24.4% |
| knight\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 60.2% | 36.5% | 35.3% |
| knight\|split-core | 17 | 58.8% | 36.0%-78.4% | 61.6% | 41.2% | 42.7% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.3% | 30.8% | 42.3% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.0% | 31.6% | 40.0% |
| mage\|asymmetric-left | 18 | 22.2% | 9.0%-45.2% | 43.4% | 77.8% | 11.1% |
| mage\|asymmetric-right | 18 | 27.8% | 12.5%-50.9% | 45.8% | 72.2% | 15.7% |
| mage\|cannon-screen | 15 | 26.7% | 10.9%-52.0% | 34.5% | 73.3% | 13.3% |
| mage\|compact-core | 18 | 16.7% | 5.8%-39.2% | 32.0% | 83.3% | 10.6% |
| mage\|corner-keep | 16 | 18.8% | 6.6%-43.0% | 32.9% | 81.3% | 12.5% |
| mage\|crossfire | 15 | 20.0% | 7.0%-45.2% | 33.9% | 80.0% | 14.5% |
| mage\|defense-ring | 18 | 16.7% | 5.8%-39.2% | 35.2% | 83.3% | 9.1% |
| mage\|diamond | 15 | 20.0% | 7.0%-45.2% | 35.7% | 80.0% | 15.2% |
| mage\|echelon-left | 15 | 33.3% | 15.2%-58.3% | 35.5% | 66.7% | 15.2% |
| mage\|echelon-right | 15 | 26.7% | 10.9%-52.0% | 38.4% | 73.3% | 18.8% |
| mage\|kill-corridor | 15 | 26.7% | 10.9%-52.0% | 35.5% | 73.3% | 19.4% |
| mage\|layered-rings | 18 | 16.7% | 5.8%-39.2% | 38.6% | 83.3% | 12.6% |
| mage\|rear-keep | 15 | 33.3% | 15.2%-58.3% | 36.4% | 66.7% | 10.3% |
| mage\|resource-shield | 18 | 16.7% | 5.8%-39.2% | 33.7% | 83.3% | 11.1% |
| mage\|southern-funnel | 18 | 22.2% | 9.0%-45.2% | 30.1% | 77.8% | 14.6% |
| mage\|split-core | 17 | 29.4% | 13.3%-53.1% | 40.6% | 69.9% | 16.0% |
| mage\|trap-lanes | 18 | 33.3% | 16.3%-56.3% | 36.7% | 66.7% | 18.2% |
| mage\|wide-spread | 18 | 33.3% | 16.3%-56.3% | 46.6% | 66.7% | 16.2% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.4% | 49.8% | 42.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 61.1% | 50.0% | 40.2% |
| mechanical_dragon\|compact-core | 12 | 41.7% | 19.3%-68.0% | 58.1% | 55.6% | 30.3% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 68.6% | 33.1% | 50.8% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 60.8% | 50.0% | 37.1% |
| mechanical_dragon\|resource-shield | 12 | 41.7% | 19.3%-68.0% | 54.2% | 57.9% | 34.8% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 59.2% | 41.7% | 37.9% |
| mechanical_dragon\|trap-lanes | 12 | 50.0% | 25.4%-74.6% | 62.5% | 50.0% | 43.9% |
| mechanical_dragon\|wide-spread | 12 | 75.0% | 46.8%-91.1% | 66.9% | 25.0% | 53.8% |
| mimic\|asymmetric-left | 18 | 27.8% | 12.5%-50.9% | 43.4% | 72.2% | 22.2% |
| mimic\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 46.0% | 60.4% | 31.7% |
| mimic\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 53.6% | 40.0% | 46.7% |
| mimic\|compact-core | 18 | 27.8% | 12.5%-50.9% | 38.6% | 70.7% | 23.8% |
| mimic\|corner-keep | 16 | 43.8% | 23.1%-66.8% | 47.9% | 55.5% | 33.0% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 52.5% | 40.0% | 41.9% |
| mimic\|defense-ring | 18 | 16.7% | 5.8%-39.2% | 43.6% | 80.5% | 16.7% |
| mimic\|diamond | 15 | 33.3% | 15.2%-58.3% | 44.1% | 59.5% | 27.6% |
| mimic\|echelon-left | 15 | 40.0% | 19.8%-64.3% | 44.3% | 59.7% | 35.2% |
| mimic\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 44.8% | 53.3% | 34.3% |
| mimic\|kill-corridor | 15 | 40.0% | 19.8%-64.3% | 43.4% | 60.0% | 36.2% |
| mimic\|layered-rings | 18 | 16.7% | 5.8%-39.2% | 36.6% | 82.2% | 14.3% |
| mimic\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 42.5% | 60.0% | 34.3% |
| mimic\|resource-shield | 18 | 27.8% | 12.5%-50.9% | 35.4% | 71.7% | 19.8% |
| mimic\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 46.0% | 61.0% | 28.6% |
| mimic\|split-core | 17 | 35.3% | 17.3%-58.7% | 44.3% | 61.8% | 30.3% |
| mimic\|trap-lanes | 18 | 44.4% | 24.6%-66.3% | 47.5% | 55.5% | 35.7% |
| mimic\|wide-spread | 18 | 33.3% | 16.3%-56.3% | 49.4% | 63.0% | 24.6% |
| pea_shooter\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 57.4% | 55.6% | 29.0% |
| pea_shooter\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 56.4% | 59.2% | 24.7% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 54.5% | 40.0% | 32.6% |
| pea_shooter\|compact-core | 18 | 27.8% | 12.5%-50.9% | 46.8% | 72.2% | 19.1% |
| pea_shooter\|corner-keep | 16 | 43.8% | 23.1%-66.8% | 54.1% | 54.0% | 27.8% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 50.2% | 53.3% | 23.0% |
| pea_shooter\|defense-ring | 18 | 38.9% | 20.3%-61.4% | 55.9% | 60.1% | 17.9% |
| pea_shooter\|diamond | 15 | 40.0% | 19.8%-64.3% | 55.5% | 52.4% | 25.9% |
| pea_shooter\|echelon-left | 15 | 40.0% | 19.8%-64.3% | 55.9% | 58.6% | 34.8% |
| pea_shooter\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 56.1% | 46.7% | 33.3% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 59.5% | 46.7% | 40.7% |
| pea_shooter\|layered-rings | 18 | 27.8% | 12.5%-50.9% | 50.0% | 69.8% | 18.5% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 55.0% | 46.7% | 28.9% |
| pea_shooter\|resource-shield | 18 | 27.8% | 12.5%-50.9% | 46.2% | 72.1% | 18.5% |
| pea_shooter\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 50.9% | 55.6% | 28.4% |
| pea_shooter\|split-core | 17 | 47.1% | 26.2%-69.0% | 57.1% | 52.6% | 28.8% |
| pea_shooter\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 52.8% | 40.1% | 29.0% |
| pea_shooter\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 69.7% | 44.3% | 29.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 99.5% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 98.1% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.1% |
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 97.5% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 97.9% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 97.6% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 97.2% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 0.0% | 96.4% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 96.3% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 95.3% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 2.8% | 95.8% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 2.9% | 94.3% |
| th6-diamond-143 | 6 | diamond | rushed-defense | 18 | 0.0% | 100.0% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 99.8% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 98.9% |

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
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 48.2% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 68.3% attacker wins across 300 samples (reference 46.5%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 24.3% attacker wins across 300 samples (reference 46.5%).
- **WARNING / pure-troop-outlier:** pure-troop necromancer has 26.3% attacker wins across 99 samples (reference 46.5%).
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-291 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-294 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-100 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-292 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-295 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-110 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-194 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-260 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-143 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-101 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-209 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-212 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-278 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-245 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-echelon-right-265 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-kill-corridor-214 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-layered-rings-061 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-145 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-178 has 100.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-resource-shield-285 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-067 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-229 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-split-core-118 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-226 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-280 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-trap-lanes-297 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-127 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-022 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-left-076 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-184 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-291 has 0.0% attacker wins across 15 samples.
- 125 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
