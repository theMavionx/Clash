# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T12:00:27.986Z
**Seed:** 70002
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2400
**Unbeaten non-adaptive bases (n >= 12):** 63
**Breakability probe:** 11000 calibration + gate battles; 6/300 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 261.3s

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
| 5000 | 2761 | 55.2% | 0 | 25.9s | 53.2% | 41.2% | 35.2% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 500
- Hard-base calibration battles: 5000
- Full-catalog gate battles: 6000
- Total breakability battles: 11000
- Invalid: 0
- Tested bases: 300
- Bases with zero successful elite attacks: 6

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 20 |
| th7-compact-core-273 | 7 | compact-core | maxed | 20 |
| th7-corner-keep-087 | 7 | corner-keep | maxed | 20 |
| th7-crossfire-153 | 7 | crossfire | maxed | 20 |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 20 |
| th7-rear-keep-255 | 7 | rear-keep | maxed | 20 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1763 | 958 | 54.3% | 0 | 24.7s | 55.5% | 43.0% |
| TH6->TH6 | 1668 | 951 | 57.0% | 0 | 26.6s | 54.8% | 40.4% |
| TH5->TH5 | 1569 | 852 | 54.3% | 0 | 26.4s | 48.5% | 39.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 306 | 133 | 43.5% | 0 | 24.2s | 46.5% | 51.9% |
| asymmetric-left | 303 | 143 | 47.2% | 0 | 25.2s | 51.8% | 49.0% |
| layered-rings | 303 | 130 | 42.9% | 0 | 25.1s | 52.2% | 51.8% |
| trap-lanes | 303 | 179 | 59.1% | 0 | 25.9s | 54.0% | 36.9% |
| resource-shield | 302 | 134 | 44.4% | 0 | 24.0s | 47.2% | 52.3% |
| split-core | 300 | 187 | 62.3% | 0 | 24.9s | 56.1% | 33.8% |
| southern-funnel | 299 | 169 | 56.5% | 0 | 24.6s | 52.5% | 40.6% |
| wide-spread | 297 | 206 | 69.4% | 0 | 26.8s | 58.1% | 27.4% |
| asymmetric-right | 296 | 132 | 44.6% | 0 | 25.4s | 54.2% | 51.0% |
| defense-ring | 295 | 174 | 59.0% | 0 | 27.4s | 58.6% | 36.8% |
| echelon-right | 254 | 158 | 62.2% | 0 | 26.1s | 53.7% | 36.0% |
| diamond | 253 | 140 | 55.3% | 0 | 26.5s | 55.0% | 41.1% |
| cannon-screen | 252 | 178 | 70.6% | 0 | 28.9s | 54.5% | 27.8% |
| crossfire | 252 | 137 | 54.4% | 0 | 25.5s | 51.8% | 42.4% |
| corner-keep | 247 | 121 | 49.0% | 0 | 26.6s | 50.7% | 45.9% |
| echelon-left | 247 | 146 | 59.1% | 0 | 26.6s | 53.3% | 38.2% |
| rear-keep | 246 | 137 | 55.7% | 0 | 26.0s | 53.2% | 40.7% |
| kill-corridor | 245 | 157 | 64.1% | 0 | 26.8s | 54.9% | 32.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 107 | 51 | 47.7% | 0 | 23.8s | 53.6% | 50.2% |
| compact-core\|TH7 | 107 | 39 | 36.4% | 0 | 23.0s | 44.0% | 58.1% |
| resource-shield\|TH7 | 107 | 46 | 43.0% | 0 | 23.5s | 47.3% | 54.5% |
| split-core\|TH7 | 107 | 72 | 67.3% | 0 | 24.8s | 60.1% | 30.5% |
| trap-lanes\|TH7 | 107 | 60 | 56.1% | 0 | 25.6s | 58.0% | 39.8% |
| layered-rings\|TH7 | 106 | 40 | 37.7% | 0 | 24.1s | 51.7% | 57.9% |
| asymmetric-right\|TH7 | 105 | 46 | 43.8% | 0 | 23.3s | 52.7% | 53.8% |
| defense-ring\|TH7 | 105 | 64 | 61.0% | 0 | 25.7s | 62.1% | 35.8% |
| southern-funnel\|TH7 | 104 | 56 | 53.8% | 0 | 24.8s | 54.1% | 42.9% |
| wide-spread\|TH7 | 104 | 66 | 63.5% | 0 | 24.5s | 58.8% | 35.4% |
| compact-core\|TH6 | 103 | 47 | 45.6% | 0 | 25.1s | 49.9% | 51.0% |
| asymmetric-left\|TH6 | 101 | 49 | 48.5% | 0 | 25.9s | 54.2% | 47.6% |
| layered-rings\|TH6 | 101 | 51 | 50.5% | 0 | 24.4s | 54.9% | 47.9% |
| resource-shield\|TH6 | 101 | 49 | 48.5% | 0 | 25.5s | 52.5% | 50.1% |
| trap-lanes\|TH6 | 101 | 58 | 57.4% | 0 | 25.3s | 53.7% | 39.2% |
| southern-funnel\|TH6 | 100 | 58 | 58.0% | 0 | 27.5s | 53.7% | 40.2% |
| split-core\|TH6 | 100 | 63 | 63.0% | 0 | 25.6s | 56.9% | 33.9% |
| wide-spread\|TH6 | 99 | 70 | 70.7% | 0 | 27.7s | 60.7% | 24.2% |
| asymmetric-right\|TH6 | 98 | 51 | 52.0% | 0 | 25.9s | 56.6% | 47.0% |
| defense-ring\|TH6 | 98 | 65 | 66.3% | 0 | 28.1s | 59.5% | 32.0% |
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
| crossfire\|TH7 | 90 | 51 | 56.7% | 0 | 23.9s | 56.7% | 41.8% |
| echelon-right\|TH7 | 90 | 56 | 62.2% | 0 | 24.6s | 56.5% | 36.5% |
| cannon-screen\|TH7 | 88 | 59 | 67.0% | 0 | 27.4s | 55.1% | 31.8% |
| corner-keep\|TH7 | 88 | 43 | 48.9% | 0 | 24.3s | 51.5% | 48.6% |
| diamond\|TH7 | 88 | 51 | 58.0% | 0 | 25.3s | 60.4% | 39.4% |
| rear-keep\|TH7 | 88 | 52 | 59.1% | 0 | 26.5s | 59.9% | 38.7% |
| echelon-left\|TH7 | 86 | 49 | 57.0% | 0 | 24.4s | 58.0% | 41.3% |
| kill-corridor\|TH7 | 86 | 57 | 66.3% | 0 | 25.3s | 60.8% | 31.1% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 26.6s | 56.5% | 41.3% |
| echelon-right\|TH6 | 85 | 51 | 60.0% | 0 | 27.5s | 55.0% | 38.7% |
| cannon-screen\|TH6 | 84 | 63 | 75.0% | 0 | 30.3s | 60.3% | 24.2% |
| crossfire\|TH6 | 84 | 42 | 50.0% | 0 | 27.8s | 50.5% | 47.5% |
| corner-keep\|TH6 | 82 | 45 | 54.9% | 0 | 26.4s | 53.7% | 41.8% |
| echelon-left\|TH6 | 82 | 48 | 58.5% | 0 | 26.8s | 50.2% | 39.5% |
| kill-corridor\|TH6 | 82 | 52 | 63.4% | 0 | 26.6s | 56.1% | 34.3% |
| rear-keep\|TH6 | 82 | 42 | 51.2% | 0 | 26.9s | 52.0% | 43.4% |
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
| rushed-defense | 1047 | 93 | 8.9% | 0 | 20.4s | 35.4% | 85.4% |
| mid | 1003 | 784 | 78.2% | 0 | 31.2s | 66.0% | 16.4% |
| maxed | 1001 | 41 | 4.1% | 0 | 21.8s | 22.8% | 91.2% |
| rushed-economy | 997 | 997 | 100.0% | 0 | 28.3s | 73.8% | 0.0% |
| mixed | 952 | 846 | 88.9% | 0 | 27.9s | 69.7% | 9.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2600 | 1433 | 55.1% | 0 | 22.7s | 44.2% | 39.2% |
| pure-unit-matrix | 2400 | 1328 | 55.3% | 0 | 29.3s | 62.9% | 43.2% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 488 | 54.2% | 0 | 26.8s | 62.1% | 44.6% |
| policy-exploration\|TH5 | 869 | 475 | 54.7% | 0 | 22.0s | 35.4% | 36.3% |
| policy-exploration\|TH6 | 868 | 488 | 56.2% | 0 | 23.6s | 48.0% | 40.0% |
| policy-exploration\|TH7 | 863 | 470 | 54.5% | 0 | 22.5s | 48.6% | 41.4% |
| pure-unit-matrix\|TH6 | 800 | 463 | 57.9% | 0 | 29.9s | 62.3% | 40.7% |
| pure-unit-matrix\|TH5 | 700 | 377 | 53.9% | 0 | 31.8s | 64.9% | 44.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2400 | 1328 | 55.3% | 0 | 29.3s | 62.9% | 43.2% |
| policy-exploration\|none | 375 | 207 | 55.2% | 0 | 27.5s | 63.4% | 43.0% |
| policy-exploration\|rally-core | 364 | 205 | 56.3% | 0 | 14.9s | 5.8% | 29.3% |
| policy-exploration\|cannon-rally | 362 | 191 | 52.8% | 0 | 14.9s | 6.1% | 33.1% |
| policy-exploration\|cannon-focus | 349 | 187 | 53.6% | 0 | 27.2s | 62.4% | 45.3% |
| policy-exploration\|medkit-entry | 156 | 97 | 62.2% | 0 | 25.9s | 64.7% | 37.5% |
| policy-exploration\|cannon-medkit | 146 | 73 | 50.0% | 0 | 25.3s | 58.9% | 49.0% |
| policy-exploration\|freeze-barrel | 146 | 89 | 61.0% | 0 | 26.2s | 65.7% | 37.9% |
| policy-exploration\|freeze-rage | 146 | 91 | 62.3% | 0 | 26.4s | 66.5% | 37.0% |
| policy-exploration\|rage-entry | 142 | 79 | 55.6% | 0 | 25.4s | 60.5% | 43.4% |
| policy-exploration\|rally-rage | 140 | 68 | 48.6% | 0 | 14.9s | 7.1% | 35.3% |
| policy-exploration\|freeze-defense | 139 | 80 | 57.6% | 0 | 27.0s | 65.1% | 40.7% |
| policy-exploration\|skeleton-barrel | 135 | 66 | 48.9% | 0 | 26.1s | 58.0% | 50.2% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 309 | 145 | 46.9% | 0 | 21.9s | 38.7% | 46.7% |
| policy-exploration\|vanguard-wedge | 292 | 153 | 52.4% | 0 | 23.8s | 42.0% | 41.8% |
| policy-exploration\|three-lane | 287 | 158 | 55.1% | 0 | 21.5s | 44.4% | 39.9% |
| policy-exploration\|dual-flank | 285 | 156 | 54.7% | 0 | 21.0s | 41.0% | 39.8% |
| policy-exploration\|edge-sweep | 255 | 139 | 54.5% | 0 | 23.6s | 46.6% | 39.2% |
| policy-exploration\|diamond | 246 | 128 | 52.0% | 0 | 23.1s | 48.4% | 43.2% |
| pure-unit-matrix\|center-column | 240 | 120 | 50.0% | 0 | 29.6s | 61.9% | 47.6% |
| pure-unit-matrix\|diamond | 240 | 132 | 55.0% | 0 | 28.9s | 64.6% | 43.5% |
| pure-unit-matrix\|dual-flank | 240 | 128 | 53.3% | 0 | 28.1s | 65.1% | 44.6% |
| pure-unit-matrix\|edge-sweep | 240 | 135 | 56.3% | 0 | 27.2s | 63.9% | 43.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 130 | 54.2% | 0 | 30.1s | 61.1% | 45.4% |
| pure-unit-matrix\|left-flank | 240 | 144 | 60.0% | 0 | 32.2s | 62.9% | 36.9% |
| pure-unit-matrix\|right-flank | 240 | 149 | 62.1% | 0 | 31.1s | 61.1% | 35.6% |
| pure-unit-matrix\|three-lane | 240 | 133 | 55.4% | 0 | 27.5s | 63.8% | 44.0% |
| pure-unit-matrix\|vanguard-wedge | 240 | 126 | 52.5% | 0 | 29.5s | 60.1% | 46.9% |
| pure-unit-matrix\|wide-line | 240 | 131 | 54.6% | 0 | 28.5s | 64.8% | 44.5% |
| policy-exploration\|right-flank | 239 | 159 | 66.5% | 0 | 22.6s | 41.7% | 28.5% |
| policy-exploration\|center-column | 238 | 140 | 58.8% | 0 | 23.2s | 47.0% | 35.5% |
| policy-exploration\|wide-line | 230 | 117 | 50.9% | 0 | 22.0s | 45.7% | 42.0% |
| policy-exploration\|left-flank | 219 | 138 | 63.0% | 0 | 24.8s | 48.9% | 32.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|three-waves | 530 | 293 | 55.3% | 0 | 22.9s | 45.2% | 38.4% |
| policy-exploration\|burst | 527 | 293 | 55.6% | 0 | 22.2s | 45.3% | 39.2% |
| policy-exploration\|two-waves | 519 | 285 | 54.9% | 0 | 22.3s | 43.1% | 39.9% |
| policy-exploration\|drip | 515 | 274 | 53.2% | 0 | 23.2s | 43.3% | 41.0% |
| policy-exploration\|rapid | 509 | 288 | 56.6% | 0 | 22.9s | 44.0% | 37.8% |
| pure-unit-matrix\|burst | 480 | 268 | 55.8% | 0 | 28.5s | 62.4% | 43.5% |
| pure-unit-matrix\|drip | 480 | 258 | 53.8% | 0 | 29.5s | 62.5% | 44.4% |
| pure-unit-matrix\|rapid | 480 | 266 | 55.4% | 0 | 30.0s | 63.4% | 42.5% |
| pure-unit-matrix\|three-waves | 480 | 264 | 55.0% | 0 | 28.6s | 63.0% | 43.4% |
| pure-unit-matrix\|two-waves | 480 | 272 | 56.7% | 0 | 29.8s | 63.3% | 42.4% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 721 | 55.4% | 0 | 21.8s | 44.1% | 38.9% |
| policy-exploration\|tank-front-support-rear | 1299 | 712 | 54.8% | 0 | 23.6s | 44.3% | 39.6% |
| pure-unit-matrix\|roster-order | 1200 | 669 | 55.8% | 0 | 29.1s | 63.4% | 42.5% |
| pure-unit-matrix\|tank-front-support-rear | 1200 | 659 | 54.9% | 0 | 29.5s | 62.4% | 44.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 473 | 220 | 46.5% | 0 | 34.1s | 52.3% | 51.4% |
| pure-fire_dragon | 450 | 275 | 61.1% | 0 | 19.8s | 61.2% | 36.3% |
| pure-mage | 440 | 195 | 44.3% | 0 | 23.4s | 52.0% | 54.4% |
| pure-mimic | 429 | 239 | 55.7% | 0 | 32.3s | 50.8% | 40.0% |
| pure-knight | 395 | 236 | 59.7% | 0 | 31.6s | 62.3% | 38.0% |
| pure-pea_shooter | 392 | 189 | 48.2% | 0 | 27.1s | 53.3% | 48.9% |
| pure-demon_king | 366 | 261 | 71.3% | 0 | 28.3s | 68.3% | 25.1% |
| pure-mechanical_dragon | 263 | 160 | 60.8% | 0 | 24.4s | 64.4% | 38.5% |
| random-5 | 178 | 96 | 53.9% | 0 | 22.6s | 50.9% | 42.3% |
| random-1 | 173 | 92 | 53.2% | 0 | 22.9s | 48.4% | 41.3% |
| random-3 | 173 | 100 | 57.8% | 0 | 22.1s | 37.3% | 36.5% |
| melee-pressure | 168 | 94 | 56.0% | 0 | 25.0s | 45.9% | 37.0% |
| trap-runner-mix | 167 | 99 | 59.3% | 0 | 23.6s | 45.0% | 32.2% |
| balanced | 158 | 107 | 67.7% | 0 | 21.1s | 52.6% | 27.9% |
| pure-necromancer | 148 | 69 | 46.6% | 0 | 28.3s | 46.5% | 51.8% |
| air-pressure | 126 | 77 | 61.1% | 0 | 18.7s | 53.5% | 35.6% |
| ranged-pressure | 77 | 36 | 46.8% | 0 | 19.0s | 34.9% | 45.1% |
| support-mix | 77 | 44 | 57.1% | 0 | 21.3s | 39.1% | 37.0% |
| hero-necro-dragon-mages | 71 | 38 | 53.5% | 0 | 20.1s | 48.1% | 41.1% |
| random-4 | 71 | 33 | 46.5% | 0 | 21.4s | 36.3% | 42.5% |
| random-6 | 71 | 35 | 49.3% | 0 | 22.8s | 45.2% | 42.4% |
| frontline-ranged | 67 | 35 | 52.2% | 0 | 20.8s | 51.2% | 44.7% |
| random-2 | 67 | 31 | 46.3% | 0 | 19.8s | 31.2% | 46.4% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| edge-sweep__burst__roster-order | 57 | 33 | 57.9% | 0 | 25.2s | 61.3% | 40.0% |
| inverted-wedge__burst__roster-order | 57 | 38 | 66.7% | 0 | 24.6s | 43.2% | 28.1% |
| inverted-wedge__drip__roster-order | 57 | 26 | 45.6% | 0 | 25.1s | 49.1% | 49.6% |
| inverted-wedge__rapid__roster-order | 57 | 29 | 50.9% | 0 | 24.3s | 52.4% | 46.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 28.3s | 45.7% | 48.6% |
| diamond__drip__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 29.6s | 55.1% | 44.3% |
| dual-flank__three-waves__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 23.0s | 47.4% | 41.6% |
| inverted-wedge__burst__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 25.6s | 48.9% | 45.2% |
| inverted-wedge__three-waves__tank-front-support-rear | 56 | 25 | 44.6% | 0 | 27.3s | 45.9% | 50.2% |
| inverted-wedge__two-waves__roster-order | 56 | 25 | 44.6% | 0 | 25.4s | 45.9% | 52.1% |
| three-lane__burst__roster-order | 56 | 30 | 53.6% | 0 | 21.9s | 48.4% | 42.8% |
| three-lane__rapid__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 23.5s | 45.4% | 45.1% |
| three-lane__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 24.9s | 44.0% | 48.7% |
| vanguard-wedge__three-waves__tank-front-support-rear | 56 | 31 | 55.4% | 0 | 24.0s | 46.2% | 40.0% |
| vanguard-wedge__two-waves__roster-order | 56 | 34 | 60.7% | 0 | 25.2s | 48.2% | 33.3% |
| dual-flank__drip__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 25.5s | 51.3% | 44.8% |
| dual-flank__rapid__roster-order | 55 | 29 | 52.7% | 0 | 23.4s | 48.7% | 41.4% |
| right-flank__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 27.6s | 54.1% | 44.1% |
| right-flank__three-waves__roster-order | 55 | 36 | 65.5% | 0 | 27.7s | 53.3% | 29.1% |
| three-lane__rapid__roster-order | 55 | 30 | 54.5% | 0 | 23.2s | 59.1% | 42.3% |
| three-lane__three-waves__tank-front-support-rear | 55 | 35 | 63.6% | 0 | 27.7s | 64.6% | 33.9% |
| three-lane__two-waves__roster-order | 55 | 26 | 47.3% | 0 | 23.0s | 52.9% | 51.9% |
| vanguard-wedge__burst__tank-front-support-rear | 55 | 30 | 54.5% | 0 | 27.2s | 57.6% | 41.6% |
| vanguard-wedge__drip__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 26.7s | 47.0% | 46.1% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 25.2s | 44.5% | 40.6% |
| vanguard-wedge__three-waves__roster-order | 55 | 25 | 45.5% | 0 | 25.0s | 49.6% | 49.8% |
| dual-flank__burst__tank-front-support-rear | 54 | 26 | 48.1% | 0 | 22.3s | 39.9% | 47.9% |
| dual-flank__three-waves__roster-order | 54 | 33 | 61.1% | 0 | 26.8s | 66.8% | 36.9% |
| dual-flank__two-waves__roster-order | 54 | 28 | 51.9% | 0 | 21.5s | 41.9% | 43.6% |
| right-flank__drip__roster-order | 54 | 41 | 75.9% | 0 | 26.8s | 53.3% | 20.0% |
| center-column__two-waves__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.1s | 50.8% | 44.1% |
| edge-sweep__burst__tank-front-support-rear | 51 | 21 | 41.2% | 0 | 21.9s | 40.4% | 52.8% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 30 | 58.8% | 0 | 29.7s | 55.3% | 39.4% |
| edge-sweep__three-waves__roster-order | 51 | 30 | 58.8% | 0 | 26.9s | 63.8% | 37.9% |
| inverted-wedge__drip__tank-front-support-rear | 51 | 26 | 51.0% | 0 | 25.3s | 52.0% | 47.5% |
| inverted-wedge__rapid__tank-front-support-rear | 51 | 29 | 56.9% | 0 | 27.3s | 59.5% | 41.8% |
| inverted-wedge__three-waves__roster-order | 51 | 21 | 41.2% | 0 | 21.9s | 43.3% | 52.0% |
| left-flank__burst__roster-order | 51 | 28 | 54.9% | 0 | 25.6s | 58.0% | 42.8% |
| left-flank__rapid__tank-front-support-rear | 51 | 41 | 80.4% | 0 | 31.8s | 49.6% | 16.0% |
| center-column__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 27.2s | 50.5% | 39.5% |
| center-column__rapid__roster-order | 50 | 26 | 52.0% | 0 | 23.3s | 45.8% | 39.8% |
| center-column__three-waves__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.6s | 59.0% | 46.0% |
| center-column__two-waves__roster-order | 50 | 33 | 66.0% | 0 | 28.1s | 64.6% | 32.7% |
| diamond__burst__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 24.5s | 59.5% | 44.0% |
| diamond__drip__roster-order | 50 | 26 | 52.0% | 0 | 23.3s | 49.5% | 44.5% |
| diamond__rapid__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 27.6s | 60.9% | 55.1% |
| diamond__three-waves__roster-order | 50 | 21 | 42.0% | 0 | 22.1s | 45.7% | 55.4% |
| dual-flank__drip__roster-order | 50 | 25 | 50.0% | 0 | 23.8s | 49.2% | 48.6% |
| edge-sweep__drip__roster-order | 50 | 27 | 54.0% | 0 | 23.5s | 49.5% | 37.7% |
| edge-sweep__rapid__roster-order | 50 | 32 | 64.0% | 0 | 24.9s | 53.9% | 34.1% |
| edge-sweep__two-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 26.2s | 63.1% | 37.4% |
| left-flank__rapid__roster-order | 50 | 28 | 56.0% | 0 | 29.5s | 56.7% | 36.0% |
| right-flank__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 25.3s | 52.1% | 40.4% |
| three-lane__burst__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 26.5s | 64.4% | 29.2% |
| three-lane__drip__roster-order | 50 | 24 | 48.0% | 0 | 22.2s | 52.4% | 47.9% |
| three-lane__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 24.3s | 47.1% | 32.7% |
| vanguard-wedge__burst__roster-order | 50 | 24 | 48.0% | 0 | 26.0s | 52.4% | 50.7% |
| vanguard-wedge__drip__roster-order | 50 | 23 | 46.0% | 0 | 29.4s | 48.3% | 51.1% |
| vanguard-wedge__rapid__roster-order | 50 | 29 | 58.0% | 0 | 28.9s | 56.1% | 39.2% |
| vanguard-wedge__two-waves__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 27.2s | 53.3% | 50.2% |
| wide-line__burst__roster-order | 50 | 19 | 38.0% | 0 | 22.2s | 54.0% | 58.3% |
| wide-line__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 29.6s | 50.2% | 40.9% |
| wide-line__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 26.4s | 64.2% | 34.1% |
| wide-line__two-waves__roster-order | 50 | 32 | 64.0% | 0 | 25.5s | 63.4% | 34.2% |
| center-column__burst__tank-front-support-rear | 49 | 18 | 36.7% | 0 | 25.8s | 48.1% | 60.2% |
| diamond__burst__roster-order | 49 | 28 | 57.1% | 0 | 25.8s | 66.2% | 41.9% |
| diamond__two-waves__tank-front-support-rear | 49 | 27 | 55.1% | 0 | 27.1s | 60.5% | 41.3% |
| dual-flank__burst__roster-order | 49 | 30 | 61.2% | 0 | 25.0s | 63.3% | 37.9% |
| dual-flank__rapid__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 26.5s | 61.7% | 39.4% |
| dual-flank__two-waves__tank-front-support-rear | 49 | 30 | 61.2% | 0 | 25.1s | 52.0% | 37.3% |
| right-flank__three-waves__tank-front-support-rear | 49 | 33 | 67.3% | 0 | 25.7s | 52.0% | 29.4% |
| wide-line__rapid__tank-front-support-rear | 49 | 24 | 49.0% | 0 | 27.0s | 52.6% | 47.1% |
| wide-line__three-waves__roster-order | 49 | 19 | 38.8% | 0 | 24.7s | 45.8% | 52.5% |
| center-column__drip__roster-order | 45 | 21 | 46.7% | 0 | 27.7s | 53.0% | 50.0% |
| center-column__three-waves__roster-order | 45 | 29 | 64.4% | 0 | 26.8s | 55.5% | 31.1% |
| edge-sweep__drip__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 24.9s | 48.1% | 43.6% |
| edge-sweep__three-waves__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 24.9s | 53.8% | 49.4% |
| edge-sweep__two-waves__roster-order | 45 | 26 | 57.8% | 0 | 24.7s | 59.7% | 40.3% |
| left-flank__burst__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 28.0s | 47.1% | 39.2% |
| left-flank__drip__roster-order | 45 | 30 | 66.7% | 0 | 27.7s | 67.1% | 29.3% |
| left-flank__three-waves__roster-order | 45 | 25 | 55.6% | 0 | 28.0s | 60.2% | 41.2% |
| left-flank__two-waves__roster-order | 45 | 29 | 64.4% | 0 | 28.9s | 43.4% | 28.3% |
| right-flank__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 29.5s | 54.7% | 37.2% |
| wide-line__burst__tank-front-support-rear | 45 | 30 | 66.7% | 0 | 25.3s | 63.1% | 31.1% |
| center-column__burst__roster-order | 44 | 29 | 65.9% | 0 | 27.6s | 59.8% | 30.0% |
| center-column__rapid__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 26.4s | 58.9% | 40.8% |
| diamond__rapid__roster-order | 44 | 26 | 59.1% | 0 | 26.9s | 51.6% | 36.0% |
| diamond__three-waves__tank-front-support-rear | 44 | 30 | 68.2% | 0 | 25.0s | 56.0% | 25.2% |
| diamond__two-waves__roster-order | 44 | 23 | 52.3% | 0 | 27.4s | 58.9% | 42.3% |
| left-flank__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 27.2s | 55.1% | 45.7% |
| left-flank__two-waves__tank-front-support-rear | 44 | 28 | 63.6% | 0 | 29.8s | 62.5% | 35.9% |
| right-flank__burst__roster-order | 44 | 35 | 79.5% | 0 | 24.6s | 40.9% | 18.2% |
| right-flank__rapid__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 26.1s | 45.0% | 43.0% |
| right-flank__two-waves__tank-front-support-rear | 44 | 33 | 75.0% | 0 | 28.3s | 52.0% | 22.8% |
| three-lane__drip__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 25.6s | 56.4% | 41.8% |
| wide-line__drip__roster-order | 44 | 22 | 50.0% | 0 | 23.8s | 56.4% | 45.0% |
| wide-line__two-waves__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 22.9s | 46.9% | 49.6% |
| left-flank__drip__tank-front-support-rear | 39 | 25 | 64.1% | 0 | 29.8s | 64.3% | 34.8% |
| right-flank__rapid__roster-order | 39 | 23 | 59.0% | 0 | 26.9s | 55.6% | 36.5% |
| wide-line__rapid__roster-order | 39 | 23 | 59.0% | 0 | 25.7s | 58.3% | 38.8% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 549 | 275 | 50.1% | 0 | 25.5s | 48.5% | 46.1% |
| vanguard-wedge | 532 | 279 | 52.4% | 0 | 26.4s | 50.2% | 44.1% |
| three-lane | 527 | 291 | 55.2% | 0 | 24.2s | 53.3% | 41.8% |
| dual-flank | 525 | 284 | 54.1% | 0 | 24.3s | 52.0% | 42.0% |
| edge-sweep | 495 | 274 | 55.4% | 0 | 25.3s | 55.0% | 41.2% |
| diamond | 486 | 260 | 53.5% | 0 | 26.0s | 56.4% | 43.3% |
| right-flank | 479 | 308 | 64.3% | 0 | 26.9s | 51.4% | 32.1% |
| center-column | 478 | 260 | 54.4% | 0 | 26.4s | 54.5% | 41.6% |
| wide-line | 470 | 248 | 52.8% | 0 | 25.3s | 55.5% | 43.3% |
| left-flank | 459 | 282 | 61.4% | 0 | 28.6s | 56.3% | 34.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| three-waves | 1010 | 557 | 55.1% | 0 | 25.6s | 53.7% | 40.8% |
| burst | 1007 | 561 | 55.7% | 0 | 25.2s | 53.5% | 41.2% |
| two-waves | 999 | 557 | 55.8% | 0 | 25.9s | 52.8% | 41.1% |
| drip | 995 | 532 | 53.5% | 0 | 26.3s | 52.6% | 42.7% |
| rapid | 989 | 554 | 56.0% | 0 | 26.3s | 53.4% | 40.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2501 | 1390 | 55.6% | 0 | 25.3s | 53.4% | 40.6% |
| tank-front-support-rear | 2499 | 1371 | 54.9% | 0 | 26.4s | 53.0% | 41.7% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2775 | 1535 | 55.3% | 0 | 29.0s | 63.0% | 43.2% |
| rally-core | 364 | 205 | 56.3% | 0 | 14.9s | 5.8% | 29.3% |
| cannon-rally | 362 | 191 | 52.8% | 0 | 14.9s | 6.1% | 33.1% |
| cannon-focus | 349 | 187 | 53.6% | 0 | 27.2s | 62.4% | 45.3% |
| medkit-entry | 156 | 97 | 62.2% | 0 | 25.9s | 64.7% | 37.5% |
| cannon-medkit | 146 | 73 | 50.0% | 0 | 25.3s | 58.9% | 49.0% |
| freeze-barrel | 146 | 89 | 61.0% | 0 | 26.2s | 65.7% | 37.9% |
| freeze-rage | 146 | 91 | 62.3% | 0 | 26.4s | 66.5% | 37.0% |
| rage-entry | 142 | 79 | 55.6% | 0 | 25.4s | 60.5% | 43.4% |
| rally-rage | 140 | 68 | 48.6% | 0 | 14.9s | 7.1% | 35.3% |
| freeze-defense | 139 | 80 | 57.6% | 0 | 27.0s | 65.1% | 40.7% |
| skeleton-barrel | 135 | 66 | 48.9% | 0 | 26.1s | 58.0% | 50.2% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 3065 | 1696 | 55.3% | 0 | 27.9s | 58.9% | 42.3% |
| legendary | 666 | 379 | 56.9% | 0 | 22.7s | 45.3% | 38.1% |
| epic | 661 | 355 | 53.7% | 0 | 22.0s | 43.2% | 40.5% |
| unrevealed | 608 | 331 | 54.4% | 0 | 23.1s | 43.9% | 39.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2900 | 1614 | 55.7% | 0 | 28.3s | 59.9% | 42.1% |
| ward-3 | 1000 | 539 | 53.9% | 0 | 22.0s | 43.2% | 40.5% |
| ward-2 | 600 | 315 | 52.5% | 0 | 23.2s | 43.7% | 41.8% |
| ward-1 | 500 | 293 | 58.6% | 0 | 22.8s | 45.5% | 36.2% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2761 | 55.2% | 0 | 25.9s | 53.2% | 41.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 1848 | 1054 | 57.0% | 0 | 21.1s | 49.6% | 37.8% |
| knight | 1836 | 1040 | 56.6% | 0 | 24.3s | 48.9% | 38.1% |
| demon_king | 1807 | 1065 | 58.9% | 0 | 23.6s | 49.9% | 35.5% |
| mage | 1790 | 941 | 52.6% | 0 | 22.2s | 46.4% | 42.5% |
| archer | 1752 | 928 | 53.0% | 0 | 25.2s | 46.6% | 42.0% |
| mimic | 1643 | 926 | 56.4% | 0 | 25.1s | 46.0% | 37.7% |
| pea_shooter | 1202 | 612 | 50.9% | 0 | 23.6s | 46.1% | 43.9% |
| mechanical_dragon | 892 | 504 | 56.5% | 0 | 22.2s | 52.7% | 40.7% |
| necromancer | 382 | 192 | 50.3% | 0 | 24.3s | 46.7% | 47.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 48.7% | 43.1%-54.3% | 59.1% | 50.6% | 26.3% |
| demon_king | 300 | 70.7% | 65.3%-75.5% | 72.5% | 26.3% | 56.7% |
| fire_dragon | 300 | 61.0% | 55.4%-66.3% | 68.4% | 37.5% | 52.6% |
| knight | 300 | 58.0% | 52.3%-63.4% | 65.5% | 40.4% | 40.4% |
| mage | 300 | 46.3% | 40.8%-52.0% | 57.5% | 52.8% | 28.3% |
| mechanical_dragon | 200 | 60.0% | 53.1%-66.5% | 68.8% | 39.9% | 49.0% |
| mimic | 300 | 51.7% | 46.0%-57.3% | 58.2% | 46.0% | 44.1% |
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
| mimic\|TH7 | 100 | 44.0% | 34.7%-53.8% | 53.1% | 53.2% | 39.6% |
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
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 61.1% | 50.0% | 38.6% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 72.5% | 33.3% | 52.3% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 69.2% | 50.0% | 40.9% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.9% | 50.0% | 40.9% |
| mechanical_dragon\|southern-funnel | 12 | 66.7% | 39.1%-86.2% | 67.5% | 33.3% | 44.7% |
| mechanical_dragon\|split-core | 12 | 58.3% | 32.0%-80.7% | 65.3% | 40.7% | 50.0% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 69.2% | 41.7% | 51.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 72.8% | 33.3% | 54.5% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 58.1% | 52.9% | 37.3% |
| mimic\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 54.5% | 61.1% | 37.3% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 63.4% | 33.3% | 55.2% |
| mimic\|compact-core | 18 | 33.3% | 16.3%-56.3% | 50.0% | 66.7% | 33.3% |
| mimic\|corner-keep | 15 | 40.0% | 19.8%-64.3% | 54.1% | 58.2% | 37.1% |
| mimic\|crossfire | 15 | 53.3% | 30.1%-75.2% | 55.0% | 46.1% | 42.9% |
| mimic\|defense-ring | 18 | 44.4% | 24.6%-66.3% | 60.8% | 49.7% | 42.9% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 58.0% | 42.3% | 39.0% |
| mimic\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.4% | 38.4% | 48.6% |
| mimic\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 61.1% | 26.1% | 52.4% |
| mimic\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 62.0% | 25.9% | 52.4% |
| mimic\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 55.5% | 65.1% | 31.0% |
| mimic\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 62.7% | 39.4% | 48.6% |
| mimic\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 48.5% | 66.4% | 32.5% |
| mimic\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 61.7% | 38.9% | 53.2% |
| mimic\|split-core | 18 | 50.0% | 29.0%-71.0% | 60.8% | 50.0% | 47.6% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 59.5% | 32.9% | 54.0% |
| mimic\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 64.8% | 24.6% | 52.4% |
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
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 19 | 0.0% | 95.8% |
| th7-trap-lanes-138 | 7 | trap-lanes | maxed | 18 | 0.0% | 99.7% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 18 | 0.0% | 98.6% |
| th7-corner-keep-087 | 7 | corner-keep | maxed | 18 | 0.0% | 98.3% |
| th7-compact-core-003 | 7 | compact-core | maxed | 18 | 0.0% | 98.3% |
| th7-crossfire-153 | 7 | crossfire | maxed | 18 | 0.0% | 95.2% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 18 | 0.0% | 94.5% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 93.9% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 18 | 0.0% | 93.9% |
| th7-echelon-right-105 | 7 | echelon-right | maxed | 18 | 0.0% | 93.8% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 93.6% |
| th7-compact-core-273 | 7 | compact-core | maxed | 18 | 0.0% | 93.2% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 92.4% |
| th6-diamond-143 | 6 | diamond | rushed-defense | 18 | 0.0% | 90.1% |

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
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| mimic | 7 | 6 | 16,380 | 1,213.21 | 2,730 | 202.2 | trap immune |
| pea_shooter | 7 | 5 | 11,550 | 816 | 2,310 | 163.2 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 6/300 bases survived every one of 20 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 70.7% attacker wins across 300 samples (reference 55.3%).
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
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-wide-spread-236 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-293 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-194 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-143 has 0 attacker wins across 18 controlled/policy-exploration samples.
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
- **INFO / fragile-base:** th5-diamond-196 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-echelon-left-046 has 100.0% attacker wins across 16 samples.
- 151 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
