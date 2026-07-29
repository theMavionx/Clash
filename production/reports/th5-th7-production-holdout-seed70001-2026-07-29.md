# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T12:00:45.553Z
**Seed:** 70001
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2400
**Unbeaten non-adaptive bases (n >= 12):** 68
**Breakability probe:** 11000 calibration + gate battles; 7/300 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 278.9s

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
| 5000 | 2781 | 55.6% | 0 | 26.0s | 53.5% | 41.0% | 35.6% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 500
- Hard-base calibration battles: 5000
- Full-catalog gate battles: 6000
- Total breakability battles: 11000
- Invalid: 0
- Tested bases: 300
- Bases with zero successful elite attacks: 7

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th7-asymmetric-left-294 | 7 | asymmetric-left | rushed-defense | 20 |
| th7-compact-core-003 | 7 | compact-core | maxed | 20 |
| th7-compact-core-111 | 7 | compact-core | rushed-defense | 20 |
| th7-compact-core-273 | 7 | compact-core | maxed | 20 |
| th7-corner-keep-087 | 7 | corner-keep | maxed | 20 |
| th7-defense-ring-222 | 7 | defense-ring | maxed | 20 |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 20 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1763 | 973 | 55.2% | 0 | 24.8s | 55.2% | 42.5% |
| TH6->TH6 | 1668 | 950 | 57.0% | 0 | 27.3s | 55.4% | 40.7% |
| TH5->TH5 | 1569 | 858 | 54.7% | 0 | 25.9s | 49.3% | 39.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 306 | 127 | 41.5% | 0 | 24.9s | 48.9% | 54.3% |
| asymmetric-left | 303 | 149 | 49.2% | 0 | 26.1s | 54.4% | 47.7% |
| layered-rings | 303 | 134 | 44.2% | 0 | 25.2s | 51.3% | 51.0% |
| trap-lanes | 303 | 190 | 62.7% | 0 | 25.9s | 54.2% | 35.1% |
| resource-shield | 302 | 135 | 44.7% | 0 | 24.5s | 48.4% | 51.5% |
| split-core | 300 | 187 | 62.3% | 0 | 24.7s | 55.5% | 33.1% |
| southern-funnel | 299 | 176 | 58.9% | 0 | 25.0s | 53.0% | 39.1% |
| wide-spread | 297 | 208 | 70.0% | 0 | 28.3s | 60.5% | 27.0% |
| asymmetric-right | 296 | 131 | 44.3% | 0 | 24.5s | 51.7% | 50.6% |
| defense-ring | 295 | 170 | 57.6% | 0 | 26.8s | 55.8% | 39.4% |
| echelon-right | 254 | 154 | 60.6% | 0 | 25.7s | 53.4% | 37.5% |
| diamond | 253 | 136 | 53.8% | 0 | 26.3s | 56.6% | 42.5% |
| cannon-screen | 252 | 176 | 69.8% | 0 | 28.7s | 55.4% | 29.3% |
| crossfire | 252 | 140 | 55.6% | 0 | 26.1s | 51.3% | 40.5% |
| corner-keep | 247 | 130 | 52.6% | 0 | 26.8s | 52.1% | 42.9% |
| echelon-left | 247 | 152 | 61.5% | 0 | 27.3s | 53.0% | 35.7% |
| rear-keep | 246 | 134 | 54.5% | 0 | 26.0s | 49.8% | 41.3% |
| kill-corridor | 245 | 152 | 62.0% | 0 | 26.2s | 57.3% | 35.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 107 | 51 | 47.7% | 0 | 25.6s | 54.9% | 50.2% |
| compact-core\|TH7 | 107 | 37 | 34.6% | 0 | 23.3s | 48.3% | 61.9% |
| resource-shield\|TH7 | 107 | 47 | 43.9% | 0 | 22.9s | 47.1% | 53.6% |
| split-core\|TH7 | 107 | 69 | 64.5% | 0 | 24.1s | 57.1% | 31.4% |
| trap-lanes\|TH7 | 107 | 65 | 60.7% | 0 | 25.7s | 58.5% | 37.4% |
| layered-rings\|TH7 | 106 | 44 | 41.5% | 0 | 24.0s | 52.2% | 55.5% |
| asymmetric-right\|TH7 | 105 | 44 | 41.9% | 0 | 22.1s | 51.9% | 56.6% |
| defense-ring\|TH7 | 105 | 59 | 56.2% | 0 | 25.8s | 56.1% | 41.8% |
| southern-funnel\|TH7 | 104 | 59 | 56.7% | 0 | 25.6s | 54.5% | 42.5% |
| wide-spread\|TH7 | 104 | 72 | 69.2% | 0 | 27.5s | 62.1% | 28.8% |
| compact-core\|TH6 | 103 | 50 | 48.5% | 0 | 26.7s | 52.8% | 50.5% |
| asymmetric-left\|TH6 | 101 | 54 | 53.5% | 0 | 27.8s | 56.8% | 45.6% |
| layered-rings\|TH6 | 101 | 49 | 48.5% | 0 | 25.8s | 52.9% | 48.6% |
| resource-shield\|TH6 | 101 | 47 | 46.5% | 0 | 24.8s | 51.3% | 51.4% |
| trap-lanes\|TH6 | 101 | 61 | 60.4% | 0 | 25.8s | 53.4% | 38.1% |
| southern-funnel\|TH6 | 100 | 55 | 55.0% | 0 | 25.3s | 53.2% | 42.7% |
| split-core\|TH6 | 100 | 63 | 63.0% | 0 | 25.0s | 57.0% | 34.6% |
| wide-spread\|TH6 | 99 | 70 | 70.7% | 0 | 30.1s | 63.7% | 27.1% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.7s | 53.8% | 45.9% |
| defense-ring\|TH6 | 98 | 60 | 61.2% | 0 | 28.5s | 61.4% | 37.0% |
| compact-core\|TH5 | 96 | 40 | 41.7% | 0 | 24.8s | 45.2% | 49.9% |
| layered-rings\|TH5 | 96 | 41 | 42.7% | 0 | 25.7s | 48.4% | 48.5% |
| asymmetric-left\|TH5 | 95 | 44 | 46.3% | 0 | 24.8s | 51.3% | 47.2% |
| southern-funnel\|TH5 | 95 | 62 | 65.3% | 0 | 24.0s | 50.9% | 31.5% |
| trap-lanes\|TH5 | 95 | 64 | 67.4% | 0 | 26.1s | 49.9% | 29.4% |
| resource-shield\|TH5 | 94 | 41 | 43.6% | 0 | 25.9s | 46.7% | 49.1% |
| wide-spread\|TH5 | 94 | 66 | 70.2% | 0 | 27.4s | 55.2% | 25.0% |
| asymmetric-right\|TH5 | 93 | 38 | 40.9% | 0 | 25.8s | 49.2% | 48.7% |
| split-core\|TH5 | 93 | 55 | 59.1% | 0 | 25.2s | 51.7% | 33.5% |
| defense-ring\|TH5 | 92 | 51 | 55.4% | 0 | 26.1s | 49.3% | 39.3% |
| crossfire\|TH7 | 90 | 54 | 60.0% | 0 | 25.2s | 55.2% | 37.0% |
| echelon-right\|TH7 | 90 | 57 | 63.3% | 0 | 25.3s | 54.6% | 36.0% |
| cannon-screen\|TH7 | 88 | 56 | 63.6% | 0 | 25.8s | 59.2% | 35.8% |
| corner-keep\|TH7 | 88 | 49 | 55.7% | 0 | 24.4s | 53.0% | 40.9% |
| diamond\|TH7 | 88 | 52 | 59.1% | 0 | 26.4s | 60.0% | 39.3% |
| rear-keep\|TH7 | 88 | 46 | 52.3% | 0 | 23.8s | 50.3% | 42.5% |
| echelon-left\|TH7 | 86 | 53 | 61.6% | 0 | 24.9s | 56.3% | 38.1% |
| kill-corridor\|TH7 | 86 | 59 | 68.6% | 0 | 24.9s | 63.8% | 28.7% |
| diamond\|TH6 | 85 | 45 | 52.9% | 0 | 26.9s | 57.8% | 43.7% |
| echelon-right\|TH6 | 85 | 56 | 65.9% | 0 | 27.5s | 57.2% | 32.6% |
| cannon-screen\|TH6 | 84 | 64 | 76.2% | 0 | 33.7s | 58.9% | 23.5% |
| crossfire\|TH6 | 84 | 38 | 45.2% | 0 | 27.7s | 50.8% | 49.2% |
| corner-keep\|TH6 | 82 | 44 | 53.7% | 0 | 27.8s | 57.4% | 43.4% |
| echelon-left\|TH6 | 82 | 50 | 61.0% | 0 | 31.3s | 52.4% | 34.5% |
| kill-corridor\|TH6 | 82 | 49 | 59.8% | 0 | 25.0s | 53.2% | 39.1% |
| rear-keep\|TH6 | 82 | 46 | 56.1% | 0 | 28.4s | 52.2% | 42.2% |
| cannon-screen\|TH5 | 80 | 56 | 70.0% | 0 | 26.7s | 46.9% | 28.3% |
| diamond\|TH5 | 80 | 39 | 48.8% | 0 | 25.5s | 51.2% | 44.7% |
| echelon-left\|TH5 | 79 | 49 | 62.0% | 0 | 25.8s | 49.6% | 34.2% |
| echelon-right\|TH5 | 79 | 41 | 51.9% | 0 | 24.2s | 47.8% | 44.4% |
| crossfire\|TH5 | 78 | 48 | 61.5% | 0 | 25.5s | 46.9% | 35.0% |
| corner-keep\|TH5 | 77 | 37 | 48.1% | 0 | 28.5s | 45.4% | 44.6% |
| kill-corridor\|TH5 | 77 | 44 | 57.1% | 0 | 28.9s | 53.6% | 37.5% |
| rear-keep\|TH5 | 76 | 42 | 55.3% | 0 | 25.8s | 46.3% | 39.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1047 | 97 | 9.3% | 0 | 20.8s | 35.6% | 84.9% |
| mid | 1003 | 814 | 81.2% | 0 | 31.7s | 67.1% | 14.1% |
| maxed | 1001 | 33 | 3.3% | 0 | 22.1s | 22.8% | 92.2% |
| rushed-economy | 997 | 997 | 100.0% | 0 | 28.3s | 74.0% | 0.0% |
| mixed | 952 | 840 | 88.2% | 0 | 27.5s | 69.5% | 10.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2600 | 1452 | 55.8% | 0 | 22.7s | 44.8% | 38.9% |
| pure-unit-matrix | 2400 | 1329 | 55.4% | 0 | 29.6s | 62.8% | 43.3% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 489 | 54.3% | 0 | 27.4s | 61.4% | 44.4% |
| policy-exploration\|TH5 | 869 | 474 | 54.5% | 0 | 21.7s | 36.4% | 36.4% |
| policy-exploration\|TH6 | 868 | 494 | 56.9% | 0 | 24.3s | 48.9% | 39.7% |
| policy-exploration\|TH7 | 863 | 484 | 56.1% | 0 | 22.2s | 48.6% | 40.5% |
| pure-unit-matrix\|TH6 | 800 | 456 | 57.0% | 0 | 30.7s | 62.4% | 41.9% |
| pure-unit-matrix\|TH5 | 700 | 384 | 54.9% | 0 | 31.1s | 65.2% | 43.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2400 | 1329 | 55.4% | 0 | 29.6s | 62.8% | 43.3% |
| policy-exploration\|none | 371 | 199 | 53.6% | 0 | 27.2s | 63.3% | 45.1% |
| policy-exploration\|cannon-focus | 363 | 207 | 57.0% | 0 | 27.1s | 65.3% | 41.4% |
| policy-exploration\|rally-core | 359 | 201 | 56.0% | 0 | 15.1s | 6.0% | 30.0% |
| policy-exploration\|cannon-rally | 355 | 195 | 54.9% | 0 | 14.7s | 6.0% | 30.8% |
| policy-exploration\|medkit-entry | 156 | 100 | 64.1% | 0 | 27.6s | 65.0% | 35.6% |
| policy-exploration\|skeleton-barrel | 147 | 79 | 53.7% | 0 | 25.0s | 60.2% | 45.2% |
| policy-exploration\|cannon-medkit | 146 | 79 | 54.1% | 0 | 27.7s | 61.4% | 43.9% |
| policy-exploration\|rally-rage | 143 | 74 | 51.7% | 0 | 13.9s | 6.7% | 37.4% |
| policy-exploration\|freeze-barrel | 141 | 77 | 54.6% | 0 | 25.7s | 62.2% | 43.5% |
| policy-exploration\|freeze-defense | 141 | 80 | 56.7% | 0 | 24.8s | 63.7% | 43.1% |
| policy-exploration\|freeze-rage | 141 | 83 | 58.9% | 0 | 26.6s | 64.9% | 39.9% |
| policy-exploration\|rage-entry | 137 | 78 | 56.9% | 0 | 26.3s | 62.9% | 42.4% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|wide-line | 266 | 137 | 51.5% | 0 | 22.4s | 47.0% | 43.4% |
| policy-exploration\|right-flank | 265 | 142 | 53.6% | 0 | 22.4s | 34.9% | 37.3% |
| policy-exploration\|left-flank | 262 | 157 | 59.9% | 0 | 24.7s | 50.3% | 36.1% |
| policy-exploration\|center-column | 260 | 152 | 58.5% | 0 | 22.0s | 43.3% | 36.2% |
| policy-exploration\|diamond | 260 | 155 | 59.6% | 0 | 25.5s | 54.4% | 37.8% |
| policy-exploration\|three-lane | 260 | 137 | 52.7% | 0 | 21.3s | 44.5% | 42.3% |
| policy-exploration\|edge-sweep | 259 | 138 | 53.3% | 0 | 21.5s | 43.2% | 42.8% |
| policy-exploration\|inverted-wedge | 259 | 141 | 54.4% | 0 | 22.6s | 38.6% | 38.7% |
| policy-exploration\|vanguard-wedge | 259 | 145 | 56.0% | 0 | 22.5s | 42.7% | 37.1% |
| policy-exploration\|dual-flank | 250 | 148 | 59.2% | 0 | 22.3s | 49.2% | 36.9% |
| pure-unit-matrix\|center-column | 240 | 125 | 52.1% | 0 | 30.8s | 61.3% | 47.0% |
| pure-unit-matrix\|diamond | 240 | 131 | 54.6% | 0 | 30.0s | 64.6% | 43.3% |
| pure-unit-matrix\|dual-flank | 240 | 134 | 55.8% | 0 | 27.7s | 66.0% | 43.4% |
| pure-unit-matrix\|edge-sweep | 240 | 131 | 54.6% | 0 | 28.4s | 63.7% | 44.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 134 | 55.8% | 0 | 31.0s | 61.0% | 43.7% |
| pure-unit-matrix\|left-flank | 240 | 147 | 61.3% | 0 | 30.1s | 62.0% | 35.5% |
| pure-unit-matrix\|right-flank | 240 | 152 | 63.3% | 0 | 31.7s | 62.6% | 34.9% |
| pure-unit-matrix\|three-lane | 240 | 129 | 53.8% | 0 | 29.1s | 63.7% | 45.7% |
| pure-unit-matrix\|vanguard-wedge | 240 | 122 | 50.8% | 0 | 29.6s | 60.3% | 47.6% |
| pure-unit-matrix\|wide-line | 240 | 124 | 51.7% | 0 | 27.3s | 62.5% | 47.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 526 | 305 | 58.0% | 0 | 22.7s | 44.8% | 36.1% |
| policy-exploration\|three-waves | 526 | 294 | 55.9% | 0 | 22.2s | 45.2% | 38.6% |
| policy-exploration\|drip | 521 | 277 | 53.2% | 0 | 23.5s | 46.7% | 42.3% |
| policy-exploration\|two-waves | 518 | 295 | 56.9% | 0 | 22.5s | 44.0% | 38.5% |
| policy-exploration\|rapid | 509 | 281 | 55.2% | 0 | 22.8s | 43.3% | 38.9% |
| pure-unit-matrix\|burst | 480 | 281 | 58.5% | 0 | 29.6s | 64.1% | 40.0% |
| pure-unit-matrix\|drip | 480 | 256 | 53.3% | 0 | 30.4s | 61.9% | 45.1% |
| pure-unit-matrix\|rapid | 480 | 265 | 55.2% | 0 | 29.1s | 62.0% | 43.8% |
| pure-unit-matrix\|three-waves | 480 | 255 | 53.1% | 0 | 28.9s | 61.9% | 45.3% |
| pure-unit-matrix\|two-waves | 480 | 272 | 56.7% | 0 | 29.7s | 64.1% | 42.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1306 | 748 | 57.3% | 0 | 22.7s | 46.8% | 37.7% |
| policy-exploration\|tank-front-support-rear | 1294 | 704 | 54.4% | 0 | 22.7s | 42.8% | 40.1% |
| pure-unit-matrix\|roster-order | 1200 | 669 | 55.8% | 0 | 29.2s | 62.8% | 43.2% |
| pure-unit-matrix\|tank-front-support-rear | 1200 | 660 | 55.0% | 0 | 29.9s | 62.7% | 43.4% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 434 | 199 | 45.9% | 0 | 27.3s | 53.1% | 51.4% |
| pure-mimic | 420 | 230 | 54.8% | 0 | 33.5s | 54.0% | 42.2% |
| pure-mage | 417 | 189 | 45.3% | 0 | 23.6s | 51.9% | 53.4% |
| pure-demon_king | 410 | 281 | 68.5% | 0 | 27.7s | 67.6% | 27.6% |
| pure-archer | 409 | 190 | 46.5% | 0 | 35.5s | 53.5% | 50.6% |
| pure-fire_dragon | 401 | 243 | 60.6% | 0 | 20.4s | 63.6% | 37.7% |
| pure-knight | 397 | 239 | 60.2% | 0 | 31.2s | 59.8% | 36.8% |
| pure-mechanical_dragon | 286 | 175 | 61.2% | 0 | 24.6s | 64.4% | 38.2% |
| balanced | 150 | 99 | 66.0% | 0 | 20.5s | 46.9% | 28.7% |
| random-5 | 149 | 81 | 54.4% | 0 | 22.8s | 40.4% | 40.7% |
| melee-pressure | 142 | 86 | 60.6% | 0 | 24.5s | 40.7% | 31.3% |
| frontline-ranged | 135 | 77 | 57.0% | 0 | 21.2s | 50.1% | 36.4% |
| random-4 | 132 | 71 | 53.8% | 0 | 23.1s | 45.2% | 39.2% |
| pure-necromancer | 131 | 60 | 45.8% | 0 | 30.0s | 48.4% | 52.4% |
| random-6 | 131 | 71 | 54.2% | 0 | 23.4s | 44.1% | 39.8% |
| random-2 | 126 | 72 | 57.1% | 0 | 21.4s | 46.2% | 35.8% |
| random-3 | 126 | 73 | 57.9% | 0 | 21.4s | 40.8% | 38.7% |
| hero-necro-dragon-mages | 118 | 70 | 59.3% | 0 | 19.3s | 44.6% | 36.6% |
| trap-runner-mix | 108 | 65 | 60.2% | 0 | 23.0s | 45.3% | 33.3% |
| ranged-pressure | 106 | 52 | 49.1% | 0 | 19.0s | 41.0% | 47.0% |
| random-1 | 105 | 55 | 52.4% | 0 | 21.5s | 45.3% | 43.7% |
| support-mix | 96 | 58 | 60.4% | 0 | 22.0s | 48.9% | 37.3% |
| air-pressure | 71 | 45 | 63.4% | 0 | 20.0s | 55.5% | 36.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__three-waves__roster-order | 57 | 37 | 64.9% | 0 | 27.2s | 60.6% | 34.1% |
| dual-flank__three-waves__roster-order | 57 | 36 | 63.2% | 0 | 24.0s | 60.1% | 35.0% |
| edge-sweep__rapid__roster-order | 57 | 28 | 49.1% | 0 | 24.3s | 46.9% | 46.0% |
| inverted-wedge__rapid__roster-order | 57 | 30 | 52.6% | 0 | 24.2s | 43.3% | 43.2% |
| left-flank__burst__roster-order | 57 | 42 | 73.7% | 0 | 23.7s | 54.6% | 24.0% |
| three-lane__three-waves__roster-order | 57 | 28 | 49.1% | 0 | 23.1s | 50.7% | 48.5% |
| center-column__drip__roster-order | 56 | 28 | 50.0% | 0 | 27.1s | 52.5% | 47.2% |
| diamond__two-waves__roster-order | 56 | 34 | 60.7% | 0 | 27.3s | 63.6% | 38.4% |
| dual-flank__rapid__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 25.8s | 54.6% | 46.4% |
| edge-sweep__burst__tank-front-support-rear | 56 | 22 | 39.3% | 0 | 23.1s | 42.6% | 57.0% |
| left-flank__drip__roster-order | 56 | 33 | 58.9% | 0 | 27.0s | 55.3% | 38.4% |
| left-flank__three-waves__tank-front-support-rear | 56 | 36 | 64.3% | 0 | 27.9s | 60.0% | 32.5% |
| right-flank__burst__roster-order | 56 | 33 | 58.9% | 0 | 27.6s | 49.0% | 34.5% |
| right-flank__drip__roster-order | 56 | 23 | 41.1% | 0 | 26.6s | 44.6% | 49.3% |
| right-flank__three-waves__tank-front-support-rear | 56 | 31 | 55.4% | 0 | 26.3s | 51.5% | 39.2% |
| vanguard-wedge__drip__tank-front-support-rear | 56 | 34 | 60.7% | 0 | 27.7s | 53.7% | 32.6% |
| wide-line__burst__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 21.9s | 42.4% | 42.0% |
| wide-line__rapid__roster-order | 56 | 36 | 64.3% | 0 | 23.8s | 51.6% | 30.6% |
| center-column__three-waves__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 26.1s | 46.2% | 44.3% |
| center-column__two-waves__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 26.8s | 52.0% | 41.4% |
| left-flank__two-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.5s | 46.2% | 43.2% |
| three-lane__rapid__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 25.0s | 51.2% | 35.1% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 25.9s | 47.4% | 36.6% |
| wide-line__drip__tank-front-support-rear | 55 | 24 | 43.6% | 0 | 27.3s | 59.7% | 56.0% |
| diamond__rapid__tank-front-support-rear | 54 | 31 | 57.4% | 0 | 28.9s | 56.0% | 38.9% |
| edge-sweep__drip__tank-front-support-rear | 54 | 34 | 63.0% | 0 | 25.2s | 47.7% | 34.8% |
| inverted-wedge__drip__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 25.3s | 40.5% | 48.6% |
| right-flank__two-waves__tank-front-support-rear | 54 | 40 | 74.1% | 0 | 27.7s | 47.3% | 21.3% |
| center-column__burst__roster-order | 51 | 32 | 62.7% | 0 | 25.6s | 52.8% | 32.5% |
| center-column__burst__tank-front-support-rear | 51 | 29 | 56.9% | 0 | 26.9s | 57.2% | 40.6% |
| diamond__drip__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 27.0s | 48.7% | 41.3% |
| dual-flank__drip__roster-order | 51 | 27 | 52.9% | 0 | 25.4s | 58.6% | 45.9% |
| inverted-wedge__two-waves__roster-order | 51 | 27 | 52.9% | 0 | 27.0s | 51.8% | 43.9% |
| right-flank__rapid__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 27.3s | 51.4% | 32.1% |
| three-lane__drip__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 24.7s | 53.2% | 53.4% |
| vanguard-wedge__two-waves__roster-order | 51 | 28 | 54.9% | 0 | 27.0s | 50.9% | 41.2% |
| vanguard-wedge__two-waves__tank-front-support-rear | 51 | 24 | 47.1% | 0 | 25.3s | 48.2% | 48.0% |
| wide-line__burst__roster-order | 51 | 24 | 47.1% | 0 | 21.3s | 46.4% | 48.0% |
| center-column__drip__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.0s | 49.5% | 44.3% |
| center-column__two-waves__roster-order | 50 | 32 | 64.0% | 0 | 24.4s | 46.7% | 30.8% |
| diamond__burst__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 28.9s | 65.4% | 27.3% |
| diamond__rapid__roster-order | 50 | 27 | 54.0% | 0 | 29.5s | 57.3% | 44.8% |
| dual-flank__burst__roster-order | 50 | 37 | 74.0% | 0 | 25.0s | 75.3% | 25.5% |
| dual-flank__burst__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.8s | 61.5% | 33.3% |
| dual-flank__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 25.0s | 53.3% | 37.2% |
| edge-sweep__drip__roster-order | 50 | 23 | 46.0% | 0 | 25.3s | 48.6% | 51.4% |
| edge-sweep__rapid__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 25.1s | 61.8% | 34.7% |
| edge-sweep__three-waves__tank-front-support-rear | 50 | 19 | 38.0% | 0 | 22.8s | 42.4% | 56.5% |
| inverted-wedge__drip__roster-order | 50 | 30 | 60.0% | 0 | 27.8s | 59.7% | 37.0% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 26.0s | 48.1% | 38.9% |
| left-flank__two-waves__roster-order | 50 | 31 | 62.0% | 0 | 28.2s | 57.5% | 37.0% |
| right-flank__three-waves__roster-order | 50 | 27 | 54.0% | 0 | 24.7s | 43.2% | 39.5% |
| three-lane__burst__roster-order | 50 | 28 | 56.0% | 0 | 31.5s | 66.1% | 41.3% |
| three-lane__burst__tank-front-support-rear | 50 | 22 | 44.0% | 0 | 25.7s | 54.3% | 52.7% |
| three-lane__three-waves__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 22.0s | 45.3% | 47.2% |
| three-lane__two-waves__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 25.4s | 54.8% | 33.3% |
| vanguard-wedge__rapid__roster-order | 50 | 26 | 52.0% | 0 | 24.3s | 48.3% | 43.6% |
| wide-line__drip__roster-order | 50 | 30 | 60.0% | 0 | 29.8s | 61.5% | 37.7% |
| wide-line__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 26.0s | 57.0% | 37.8% |
| wide-line__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 24.7s | 60.8% | 42.1% |
| wide-line__two-waves__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 23.5s | 59.3% | 53.6% |
| center-column__rapid__roster-order | 49 | 24 | 49.0% | 0 | 28.3s | 57.8% | 51.0% |
| diamond__burst__roster-order | 49 | 25 | 51.0% | 0 | 23.6s | 55.8% | 45.7% |
| dual-flank__two-waves__roster-order | 49 | 32 | 65.3% | 0 | 26.7s | 65.0% | 33.0% |
| dual-flank__two-waves__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 22.8s | 37.5% | 49.5% |
| edge-sweep__three-waves__roster-order | 49 | 32 | 65.3% | 0 | 27.6s | 63.8% | 33.8% |
| inverted-wedge__burst__roster-order | 49 | 32 | 65.3% | 0 | 31.1s | 56.8% | 32.0% |
| inverted-wedge__burst__tank-front-support-rear | 49 | 31 | 63.3% | 0 | 29.2s | 52.1% | 34.7% |
| inverted-wedge__three-waves__roster-order | 49 | 20 | 40.8% | 0 | 24.6s | 43.8% | 52.4% |
| left-flank__rapid__roster-order | 49 | 34 | 69.4% | 0 | 31.3s | 66.3% | 26.9% |
| right-flank__two-waves__roster-order | 49 | 31 | 63.3% | 0 | 25.5s | 46.6% | 31.9% |
| three-lane__two-waves__roster-order | 49 | 31 | 63.3% | 0 | 24.3s | 53.8% | 34.7% |
| vanguard-wedge__burst__roster-order | 49 | 27 | 55.1% | 0 | 25.4s | 44.3% | 41.0% |
| vanguard-wedge__burst__tank-front-support-rear | 49 | 29 | 59.2% | 0 | 23.5s | 47.3% | 35.3% |
| vanguard-wedge__three-waves__roster-order | 49 | 22 | 44.9% | 0 | 23.1s | 49.3% | 51.5% |
| wide-line__three-waves__roster-order | 49 | 22 | 44.9% | 0 | 24.9s | 54.6% | 51.6% |
| diamond__two-waves__tank-front-support-rear | 45 | 17 | 37.8% | 0 | 29.0s | 56.7% | 59.2% |
| edge-sweep__two-waves__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 28.0s | 62.7% | 45.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 27.8s | 51.7% | 36.2% |
| inverted-wedge__two-waves__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 23.7s | 48.2% | 42.6% |
| left-flank__burst__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 31.7s | 59.2% | 43.9% |
| left-flank__drip__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 25.5s | 48.4% | 38.2% |
| left-flank__rapid__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 26.4s | 59.6% | 46.6% |
| right-flank__drip__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 30.2s | 54.0% | 39.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 29.2s | 63.7% | 42.5% |
| center-column__three-waves__roster-order | 44 | 23 | 52.3% | 0 | 24.1s | 50.3% | 43.9% |
| diamond__drip__roster-order | 44 | 28 | 63.6% | 0 | 27.7s | 67.1% | 34.3% |
| diamond__three-waves__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 27.7s | 62.8% | 43.2% |
| edge-sweep__burst__roster-order | 44 | 28 | 63.6% | 0 | 23.0s | 53.6% | 34.5% |
| edge-sweep__two-waves__roster-order | 44 | 27 | 61.4% | 0 | 24.2s | 66.2% | 38.6% |
| left-flank__three-waves__roster-order | 44 | 29 | 65.9% | 0 | 24.3s | 52.5% | 29.8% |
| right-flank__burst__tank-front-support-rear | 44 | 28 | 63.6% | 0 | 26.4s | 46.9% | 31.9% |
| right-flank__rapid__roster-order | 44 | 23 | 52.3% | 0 | 25.7s | 47.0% | 42.3% |
| three-lane__drip__roster-order | 44 | 23 | 52.3% | 0 | 25.6s | 59.8% | 46.4% |
| three-lane__rapid__roster-order | 44 | 21 | 47.7% | 0 | 23.3s | 49.0% | 47.1% |
| vanguard-wedge__drip__roster-order | 44 | 21 | 47.7% | 0 | 27.7s | 60.8% | 52.3% |
| center-column__rapid__tank-front-support-rear | 39 | 23 | 59.0% | 0 | 26.1s | 55.9% | 36.5% |
| dual-flank__drip__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 27.7s | 63.2% | 43.6% |
| dual-flank__rapid__roster-order | 39 | 17 | 43.6% | 0 | 20.5s | 43.3% | 55.4% |
| wide-line__rapid__tank-front-support-rear | 39 | 16 | 41.0% | 0 | 24.1s | 51.4% | 56.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 506 | 261 | 51.6% | 0 | 24.7s | 54.4% | 45.3% |
| right-flank | 505 | 294 | 58.2% | 0 | 26.8s | 48.1% | 36.2% |
| left-flank | 502 | 304 | 60.6% | 0 | 27.3s | 55.9% | 35.8% |
| center-column | 500 | 277 | 55.4% | 0 | 26.2s | 52.0% | 41.4% |
| diamond | 500 | 286 | 57.2% | 0 | 27.7s | 59.3% | 40.4% |
| three-lane | 500 | 266 | 53.2% | 0 | 25.0s | 53.8% | 43.9% |
| edge-sweep | 499 | 269 | 53.9% | 0 | 24.8s | 53.1% | 43.6% |
| inverted-wedge | 499 | 275 | 55.1% | 0 | 26.6s | 49.4% | 41.1% |
| vanguard-wedge | 499 | 267 | 53.5% | 0 | 25.9s | 51.2% | 42.2% |
| dual-flank | 490 | 282 | 57.6% | 0 | 24.9s | 57.5% | 40.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1006 | 586 | 58.3% | 0 | 26.0s | 54.1% | 38.0% |
| three-waves | 1006 | 549 | 54.6% | 0 | 25.4s | 53.1% | 41.8% |
| drip | 1001 | 533 | 53.2% | 0 | 26.8s | 54.0% | 43.7% |
| two-waves | 998 | 567 | 56.8% | 0 | 26.0s | 53.7% | 40.3% |
| rapid | 989 | 546 | 55.2% | 0 | 25.9s | 52.4% | 41.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2506 | 1417 | 56.5% | 0 | 25.8s | 54.5% | 40.3% |
| tank-front-support-rear | 2494 | 1364 | 54.7% | 0 | 26.2s | 52.4% | 41.7% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2771 | 1528 | 55.1% | 0 | 29.2s | 62.9% | 43.5% |
| cannon-focus | 363 | 207 | 57.0% | 0 | 27.1s | 65.3% | 41.4% |
| rally-core | 359 | 201 | 56.0% | 0 | 15.1s | 6.0% | 30.0% |
| cannon-rally | 355 | 195 | 54.9% | 0 | 14.7s | 6.0% | 30.8% |
| medkit-entry | 156 | 100 | 64.1% | 0 | 27.6s | 65.0% | 35.6% |
| skeleton-barrel | 147 | 79 | 53.7% | 0 | 25.0s | 60.2% | 45.2% |
| cannon-medkit | 146 | 79 | 54.1% | 0 | 27.7s | 61.4% | 43.9% |
| rally-rage | 143 | 74 | 51.7% | 0 | 13.9s | 6.7% | 37.4% |
| freeze-barrel | 141 | 77 | 54.6% | 0 | 25.7s | 62.2% | 43.5% |
| freeze-defense | 141 | 80 | 56.7% | 0 | 24.8s | 63.7% | 43.1% |
| freeze-rage | 141 | 83 | 58.9% | 0 | 26.6s | 64.9% | 39.9% |
| rage-entry | 137 | 78 | 56.9% | 0 | 26.3s | 62.9% | 42.4% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 3056 | 1697 | 55.5% | 0 | 28.0s | 58.6% | 42.4% |
| unrevealed | 656 | 376 | 57.3% | 0 | 22.8s | 45.9% | 37.4% |
| legendary | 649 | 362 | 55.8% | 0 | 23.4s | 46.7% | 39.1% |
| epic | 639 | 346 | 54.1% | 0 | 22.2s | 43.3% | 39.8% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2900 | 1628 | 56.1% | 0 | 28.5s | 59.9% | 41.9% |
| ward-3 | 1000 | 533 | 53.3% | 0 | 22.2s | 44.1% | 41.3% |
| ward-2 | 600 | 328 | 54.7% | 0 | 22.5s | 44.5% | 39.6% |
| ward-1 | 500 | 292 | 58.4% | 0 | 23.5s | 45.7% | 36.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2781 | 55.6% | 0 | 26.0s | 53.5% | 41.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king | 1928 | 1159 | 60.1% | 0 | 23.2s | 49.6% | 34.7% |
| knight | 1915 | 1117 | 58.3% | 0 | 23.9s | 47.9% | 36.6% |
| fire_dragon | 1876 | 1094 | 58.3% | 0 | 21.2s | 49.3% | 37.3% |
| mage | 1858 | 1012 | 54.5% | 0 | 22.0s | 46.6% | 41.2% |
| mimic | 1789 | 1022 | 57.1% | 0 | 25.0s | 47.0% | 37.7% |
| archer | 1773 | 964 | 54.4% | 0 | 24.9s | 46.9% | 40.9% |
| pea_shooter | 1268 | 650 | 51.3% | 0 | 23.8s | 46.5% | 44.2% |
| mechanical_dragon | 808 | 462 | 57.2% | 0 | 23.1s | 54.5% | 41.0% |
| necromancer | 430 | 230 | 53.5% | 0 | 23.9s | 45.1% | 44.7% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 48.3% | 42.7%-54.0% | 58.4% | 50.1% | 26.5% |
| demon_king | 300 | 69.0% | 63.6%-74.0% | 73.2% | 28.3% | 56.8% |
| fire_dragon | 300 | 61.3% | 55.7%-66.7% | 68.6% | 37.8% | 52.3% |
| knight | 300 | 59.7% | 54.0%-65.1% | 65.0% | 38.6% | 40.2% |
| mage | 300 | 46.7% | 41.1%-52.3% | 57.1% | 52.9% | 28.4% |
| mechanical_dragon | 200 | 62.0% | 55.1%-68.4% | 68.6% | 37.9% | 48.4% |
| mimic | 300 | 53.0% | 47.3%-58.6% | 58.5% | 45.7% | 44.3% |
| necromancer | 100 | 49.0% | 39.4%-58.7% | 53.0% | 51.0% | 36.7% |
| pea_shooter | 300 | 47.3% | 41.8%-53.0% | 58.2% | 50.7% | 30.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 53.0% | 43.3%-62.5% | 64.6% | 46.0% | 31.5% |
| archer\|TH6 | 100 | 47.0% | 37.5%-56.7% | 55.2% | 50.7% | 21.9% |
| archer\|TH7 | 100 | 45.0% | 35.6%-54.8% | 55.8% | 53.7% | 26.0% |
| demon_king\|TH5 | 100 | 69.0% | 59.4%-77.2% | 74.9% | 28.5% | 55.1% |
| demon_king\|TH6 | 100 | 75.0% | 65.7%-82.5% | 75.6% | 22.2% | 60.9% |
| demon_king\|TH7 | 100 | 63.0% | 53.2%-71.8% | 69.5% | 34.3% | 54.4% |
| fire_dragon\|TH5 | 100 | 61.0% | 51.2%-70.0% | 70.3% | 37.7% | 49.3% |
| fire_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 63.9% | 40.0% | 52.3% |
| fire_dragon\|TH7 | 100 | 63.0% | 53.2%-71.8% | 71.5% | 35.7% | 55.3% |
| knight\|TH5 | 100 | 57.0% | 47.2%-66.3% | 65.1% | 39.9% | 37.6% |
| knight\|TH6 | 100 | 63.0% | 53.2%-71.8% | 64.7% | 36.8% | 40.0% |
| knight\|TH7 | 100 | 59.0% | 49.2%-68.1% | 65.1% | 38.9% | 43.1% |
| mage\|TH5 | 100 | 43.0% | 33.7%-52.8% | 59.1% | 56.1% | 27.9% |
| mage\|TH6 | 100 | 42.0% | 32.8%-51.8% | 52.0% | 57.6% | 22.9% |
| mage\|TH7 | 100 | 55.0% | 45.2%-64.4% | 59.9% | 45.0% | 34.3% |
| mechanical_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 65.9% | 38.8% | 46.0% |
| mechanical_dragon\|TH7 | 100 | 63.0% | 53.2%-71.8% | 71.2% | 36.9% | 50.8% |
| mimic\|TH5 | 100 | 50.0% | 40.4%-59.6% | 57.5% | 49.0% | 40.4% |
| mimic\|TH6 | 100 | 65.0% | 55.3%-73.6% | 67.5% | 34.1% | 56.3% |
| mimic\|TH7 | 100 | 44.0% | 34.7%-53.8% | 51.0% | 53.8% | 36.1% |
| necromancer\|TH7 | 100 | 49.0% | 39.4%-58.7% | 53.0% | 51.0% | 36.7% |
| pea_shooter\|TH5 | 100 | 51.0% | 41.3%-60.6% | 65.0% | 46.7% | 34.1% |
| pea_shooter\|TH6 | 100 | 43.0% | 33.7%-52.8% | 54.3% | 54.7% | 25.9% |
| pea_shooter\|TH7 | 100 | 48.0% | 38.5%-57.7% | 55.8% | 50.6% | 30.2% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 63.4% | 53.0% | 25.6% |
| archer\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 63.4% | 55.6% | 28.3% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 51.4% | 46.7% | 32.0% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 57.6% | 58.7% | 22.1% |
| archer\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 60.0% | 53.3% | 20.9% |
| archer\|crossfire | 15 | 40.0% | 19.8%-64.3% | 53.4% | 53.9% | 23.0% |
| archer\|defense-ring | 18 | 44.4% | 24.6%-66.3% | 63.8% | 49.3% | 22.0% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 60.9% | 53.3% | 23.1% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.8% | 26.7% |
| archer\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 50.7% | 53.6% | 31.4% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 58.9% | 46.7% | 33.6% |
| archer\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 60.2% | 61.5% | 20.0% |
| archer\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 25.8% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 56.3% | 55.6% | 19.3% |
| archer\|southern-funnel | 18 | 38.9% | 20.3%-61.4% | 49.2% | 61.1% | 24.2% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 62.3% | 34.5% | 35.2% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.6% | 38.9% | 33.6% |
| archer\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 66.3% | 27.8% | 31.0% |
| demon_king\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 72.3% | 41.0% | 45.7% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 75.4% | 35.8% | 47.5% |
| demon_king\|cannon-screen | 15 | 86.7% | 62.1%-96.3% | 73.6% | 12.1% | 71.1% |
| demon_king\|compact-core | 18 | 55.6% | 33.7%-75.4% | 66.7% | 39.3% | 43.2% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 66.4% | 31.4% | 55.6% |
| demon_king\|crossfire | 15 | 80.0% | 54.8%-93.0% | 71.4% | 14.6% | 62.2% |
| demon_king\|defense-ring | 18 | 72.2% | 49.1%-87.5% | 71.8% | 23.3% | 58.6% |
| demon_king\|diamond | 15 | 66.7% | 41.7%-84.8% | 78.2% | 33.3% | 59.3% |
| demon_king\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 74.8% | 31.8% | 55.6% |
| demon_king\|echelon-right | 15 | 80.0% | 54.8%-93.0% | 72.0% | 20.0% | 57.8% |
| demon_king\|kill-corridor | 15 | 86.7% | 62.1%-96.3% | 81.4% | 13.3% | 66.7% |
| demon_king\|layered-rings | 18 | 55.6% | 33.7%-75.4% | 70.1% | 43.8% | 47.5% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 69.8% | 37.5% | 53.3% |
| demon_king\|resource-shield | 18 | 55.6% | 33.7%-75.4% | 68.6% | 44.4% | 47.5% |
| demon_king\|southern-funnel | 18 | 77.8% | 54.8%-91.0% | 75.4% | 19.0% | 63.0% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 73.5% | 32.9% | 61.1% |
| demon_king\|trap-lanes | 18 | 77.8% | 54.8%-91.0% | 75.0% | 19.9% | 61.7% |
| demon_king\|wide-spread | 18 | 88.9% | 67.2%-96.9% | 81.6% | 11.1% | 69.8% |
| fire_dragon\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 64.8% | 44.4% | 44.4% |
| fire_dragon\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 63.6% | 55.2% | 41.7% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 71.1% | 33.3% | 61.7% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 63.3% | 50.0% | 44.4% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 66.4% | 46.7% | 45.0% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.4% | 33.3% | 53.3% |
| fire_dragon\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 71.0% | 44.1% | 45.8% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 70.5% | 38.2% | 55.0% |
| fire_dragon\|echelon-left | 15 | 80.0% | 54.8%-93.0% | 71.4% | 20.3% | 61.7% |
| fire_dragon\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 71.6% | 26.7% | 66.7% |
| fire_dragon\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 72.3% | 30.1% | 55.0% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 63.6% | 50.0% | 41.7% |
| fire_dragon\|rear-keep | 15 | 80.0% | 54.8%-93.0% | 72.3% | 20.0% | 65.0% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 64.8% | 49.2% | 45.8% |
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 68.2% | 38.9% | 54.2% |
| fire_dragon\|split-core | 18 | 61.1% | 38.6%-79.7% | 71.0% | 33.2% | 52.8% |
| fire_dragon\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 67.4% | 36.4% | 51.4% |
| fire_dragon\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 76.5% | 21.5% | 62.5% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 69.1% | 50.0% | 33.3% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.4% | 47.0% | 38.0% |
| knight\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 66.8% | 18.6% | 50.7% |
| knight\|compact-core | 18 | 50.0% | 29.0%-71.0% | 57.2% | 50.0% | 29.9% |
| knight\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 63.9% | 37.3% | 40.4% |
| knight\|crossfire | 15 | 53.3% | 30.1%-75.2% | 63.4% | 46.2% | 36.9% |
| knight\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 67.8% | 38.9% | 38.6% |
| knight\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.5% | 39.9% | 40.0% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 67.3% | 32.9% | 44.9% |
| knight\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 65.5% | 26.7% | 49.3% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 69.8% | 28.8% | 44.6% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.5% | 51.1% | 31.4% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 63.6% | 35.8% | 39.0% |
| knight\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 57.6% | 50.0% | 31.6% |
| knight\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 63.8% | 38.3% | 42.6% |
| knight\|split-core | 18 | 61.1% | 38.6%-79.7% | 66.3% | 31.0% | 50.6% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 62.7% | 32.9% | 42.5% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 70.3% | 31.6% | 44.0% |
| mage\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 58.0% | 55.6% | 29.3% |
| mage\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 61.7% | 55.6% | 28.8% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.2% | 40.0% | 33.3% |
| mage\|compact-core | 18 | 33.3% | 16.3%-56.3% | 54.5% | 66.7% | 23.2% |
| mage\|corner-keep | 15 | 40.0% | 19.8%-64.3% | 55.7% | 60.0% | 21.8% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 49.8% | 53.3% | 23.0% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 58.1% | 50.0% | 27.3% |
| mage\|diamond | 15 | 40.0% | 19.8%-64.3% | 60.0% | 58.8% | 25.5% |
| mage\|echelon-left | 15 | 40.0% | 19.8%-64.3% | 46.8% | 60.0% | 27.9% |
| mage\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 56.6% | 46.7% | 38.2% |
| mage\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 57.3% | 53.3% | 30.3% |
| mage\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 56.8% | 61.1% | 22.7% |
| mage\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 52.0% | 60.0% | 23.6% |
| mage\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 53.4% | 65.2% | 22.2% |
| mage\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 51.1% | 50.0% | 24.2% |
| mage\|split-core | 18 | 55.6% | 33.7%-75.4% | 62.3% | 43.0% | 38.9% |
| mage\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 62.7% | 38.9% | 38.9% |
| mage\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 71.0% | 35.2% | 30.8% |
| mechanical_dragon\|asymmetric-left | 12 | 58.3% | 32.0%-80.7% | 73.1% | 41.7% | 40.9% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 62.5% | 50.0% | 42.4% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 63.1% | 49.8% | 39.4% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 73.6% | 33.3% | 51.5% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 64.2% | 50.0% | 40.9% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.4% | 50.0% | 40.2% |
| mechanical_dragon\|southern-funnel | 12 | 66.7% | 39.1%-86.2% | 64.2% | 33.3% | 45.5% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 68.3% | 33.3% | 56.8% |
| mechanical_dragon\|trap-lanes | 12 | 66.7% | 39.1%-86.2% | 68.9% | 33.3% | 51.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.6% | 32.4% | 54.5% |
| mimic\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 58.1% | 59.1% | 35.7% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.3% | 55.6% | 39.7% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 56.8% | 33.3% | 49.5% |
| mimic\|compact-core | 18 | 33.3% | 16.3%-56.3% | 48.3% | 66.7% | 29.4% |
| mimic\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 53.9% | 53.3% | 37.1% |
| mimic\|crossfire | 15 | 66.7% | 41.7%-84.8% | 59.8% | 33.3% | 45.7% |
| mimic\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 63.4% | 43.1% | 51.6% |
| mimic\|diamond | 15 | 46.7% | 24.8%-69.9% | 57.5% | 50.3% | 44.8% |
| mimic\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 58.9% | 21.9% | 51.4% |
| mimic\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.5% | 39.6% | 52.4% |
| mimic\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 65.0% | 33.2% | 55.2% |
| mimic\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 54.9% | 51.2% | 30.2% |
| mimic\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 54.5% | 53.3% | 43.8% |
| mimic\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 52.3% | 66.4% | 31.0% |
| mimic\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 63.6% | 37.7% | 53.2% |
| mimic\|split-core | 18 | 50.0% | 29.0%-71.0% | 59.8% | 43.8% | 46.8% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 59.8% | 38.9% | 53.2% |
| mimic\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.0% | 33.3% | 50.8% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 60.2% | 55.5% | 26.5% |
| pea_shooter\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 58.9% | 56.9% | 26.5% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.5% | 40.0% | 39.3% |
| pea_shooter\|compact-core | 18 | 27.8% | 12.5%-50.9% | 50.2% | 72.2% | 21.0% |
| pea_shooter\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 59.5% | 53.3% | 26.7% |
| pea_shooter\|crossfire | 15 | 53.3% | 30.1%-75.2% | 53.6% | 46.7% | 31.1% |
| pea_shooter\|defense-ring | 18 | 38.9% | 20.3%-61.4% | 60.8% | 59.8% | 27.8% |
| pea_shooter\|diamond | 15 | 46.7% | 24.8%-69.9% | 63.2% | 52.5% | 28.1% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 57.3% | 46.7% | 34.8% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 58.4% | 40.0% | 41.5% |
| pea_shooter\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 58.2% | 52.9% | 34.8% |
| pea_shooter\|layered-rings | 18 | 27.8% | 12.5%-50.9% | 54.7% | 63.7% | 19.1% |
| pea_shooter\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 54.8% | 52.9% | 26.7% |
| pea_shooter\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 51.5% | 55.6% | 23.5% |
| pea_shooter\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 53.2% | 50.0% | 26.5% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 63.8% | 39.3% | 40.7% |
| pea_shooter\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 60.6% | 40.6% | 34.0% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 72.9% | 29.8% | 36.4% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 19 | 0.0% | 98.3% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 19 | 0.0% | 95.8% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 19 | 0.0% | 95.5% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 19 | 0.0% | 92.4% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 100.0% |
| th7-asymmetric-right-297 | 7 | asymmetric-right | rushed-defense | 18 | 0.0% | 100.0% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 99.8% |
| th7-echelon-right-105 | 7 | echelon-right | maxed | 18 | 0.0% | 99.6% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 18 | 0.0% | 99.6% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 18 | 0.0% | 99.6% |
| th7-compact-core-273 | 7 | compact-core | maxed | 18 | 0.0% | 99.4% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 18 | 0.0% | 98.8% |
| th7-crossfire-153 | 7 | crossfire | maxed | 18 | 0.0% | 98.8% |
| th7-trap-lanes-138 | 7 | trap-lanes | maxed | 18 | 0.0% | 98.5% |
| th7-cannon-screen-204 | 7 | cannon-screen | maxed | 18 | 0.0% | 98.4% |

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

- **CRITICAL / unbreakable-base-probe:** 7/300 bases survived every one of 20 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-277 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-253 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-286 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-136 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-292 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-295 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-271 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-right-103 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-kill-corridor-052 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-278 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-194 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-101 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-053 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-255 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-069 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-177 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-120 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-228 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-138 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-237 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-294 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 19 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-297 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-204 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-layered-rings-061 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-layered-rings-115 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-169 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-layered-rings-277 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-145 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-199 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-rear-keep-253 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-016 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-resource-shield-124 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-178 has 100.0% attacker wins across 15 samples.
- 158 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
