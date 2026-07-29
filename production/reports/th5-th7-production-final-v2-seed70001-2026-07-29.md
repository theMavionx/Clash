# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T12:55:15.100Z
**Seed:** 70001
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 300
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2400
**Unbeaten non-adaptive bases (n >= 6):** 69
**Breakability probe:** 21000 calibration + gate + focused + adaptive rescue battles; 0/300 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 433.7s

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
| 5000 | 2776 | 55.5% | 0 | 25.8s | 52.7% | 40.8% | 35.1% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab learned from its closest valid attempt and systematically crossed that army with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 15000
- Full-catalog gate battles: 6000
- Focused rescue battles: 0
- Adaptive counter-search battles: 0
- Initially unbeaten after elite gate: 0
- Resolved by remaining-policy search: 0
- Total breakability battles: 21000
- Invalid: 0
- Tested bases: 300/300
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1763 | 983 | 55.8% | 0 | 24.7s | 55.4% | 42.0% |
| TH6->TH6 | 1668 | 935 | 56.1% | 0 | 27.0s | 52.7% | 40.8% |
| TH5->TH5 | 1569 | 858 | 54.7% | 0 | 25.9s | 49.3% | 39.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 306 | 128 | 41.8% | 0 | 24.4s | 47.5% | 53.9% |
| asymmetric-left | 303 | 149 | 49.2% | 0 | 26.0s | 53.3% | 47.4% |
| layered-rings | 303 | 135 | 44.6% | 0 | 24.9s | 51.4% | 50.7% |
| trap-lanes | 303 | 190 | 62.7% | 0 | 25.8s | 54.2% | 35.1% |
| resource-shield | 302 | 134 | 44.4% | 0 | 24.6s | 47.5% | 50.8% |
| split-core | 300 | 186 | 62.0% | 0 | 24.7s | 54.7% | 32.6% |
| southern-funnel | 299 | 176 | 58.9% | 0 | 25.4s | 52.7% | 38.9% |
| wide-spread | 297 | 208 | 70.0% | 0 | 28.3s | 60.6% | 26.9% |
| asymmetric-right | 296 | 131 | 44.3% | 0 | 24.4s | 51.4% | 50.4% |
| defense-ring | 295 | 172 | 58.3% | 0 | 26.0s | 53.9% | 38.1% |
| echelon-right | 254 | 155 | 61.0% | 0 | 25.3s | 51.8% | 37.3% |
| diamond | 253 | 136 | 53.8% | 0 | 26.5s | 56.1% | 42.8% |
| cannon-screen | 252 | 170 | 67.5% | 0 | 27.2s | 54.5% | 31.4% |
| crossfire | 252 | 142 | 56.3% | 0 | 25.6s | 49.8% | 39.9% |
| corner-keep | 247 | 130 | 52.6% | 0 | 27.0s | 50.7% | 43.2% |
| echelon-left | 247 | 153 | 61.9% | 0 | 27.5s | 53.1% | 35.3% |
| rear-keep | 246 | 132 | 53.7% | 0 | 26.1s | 48.4% | 41.1% |
| kill-corridor | 245 | 149 | 60.8% | 0 | 26.0s | 56.5% | 35.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 107 | 51 | 47.7% | 0 | 25.7s | 55.1% | 50.2% |
| compact-core\|TH7 | 107 | 38 | 35.5% | 0 | 23.3s | 48.5% | 61.5% |
| resource-shield\|TH7 | 107 | 48 | 44.9% | 0 | 23.1s | 47.5% | 52.3% |
| split-core\|TH7 | 107 | 70 | 65.4% | 0 | 24.0s | 57.3% | 31.1% |
| trap-lanes\|TH7 | 107 | 66 | 61.7% | 0 | 25.5s | 58.7% | 36.4% |
| layered-rings\|TH7 | 106 | 45 | 42.5% | 0 | 23.8s | 52.3% | 55.3% |
| asymmetric-right\|TH7 | 105 | 44 | 41.9% | 0 | 22.1s | 52.0% | 56.6% |
| defense-ring\|TH7 | 105 | 61 | 58.1% | 0 | 25.3s | 56.7% | 39.9% |
| southern-funnel\|TH7 | 104 | 60 | 57.7% | 0 | 25.5s | 54.9% | 41.6% |
| wide-spread\|TH7 | 104 | 72 | 69.2% | 0 | 27.3s | 61.9% | 28.7% |
| compact-core\|TH6 | 103 | 50 | 48.5% | 0 | 25.3s | 48.4% | 49.6% |
| asymmetric-left\|TH6 | 101 | 54 | 53.5% | 0 | 27.6s | 53.2% | 44.6% |
| layered-rings\|TH6 | 101 | 49 | 48.5% | 0 | 25.3s | 53.4% | 47.9% |
| resource-shield\|TH6 | 101 | 45 | 44.6% | 0 | 24.8s | 48.1% | 50.6% |
| trap-lanes\|TH6 | 101 | 60 | 59.4% | 0 | 25.9s | 53.2% | 39.1% |
| southern-funnel\|TH6 | 100 | 54 | 54.0% | 0 | 26.5s | 51.8% | 43.2% |
| split-core\|TH6 | 100 | 61 | 61.0% | 0 | 25.1s | 54.5% | 33.4% |
| wide-spread\|TH6 | 99 | 70 | 70.7% | 0 | 30.2s | 64.0% | 26.9% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.4s | 52.7% | 45.4% |
| defense-ring\|TH6 | 98 | 60 | 61.2% | 0 | 26.6s | 55.1% | 35.1% |
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
| crossfire\|TH7 | 90 | 54 | 60.0% | 0 | 24.7s | 55.4% | 37.0% |
| echelon-right\|TH7 | 90 | 57 | 63.3% | 0 | 25.2s | 54.6% | 36.0% |
| cannon-screen\|TH7 | 88 | 56 | 63.6% | 0 | 25.5s | 59.6% | 35.8% |
| corner-keep\|TH7 | 88 | 49 | 55.7% | 0 | 24.5s | 53.2% | 40.7% |
| diamond\|TH7 | 88 | 53 | 60.2% | 0 | 26.2s | 59.9% | 38.6% |
| rear-keep\|TH7 | 88 | 47 | 53.4% | 0 | 24.1s | 50.8% | 40.7% |
| echelon-left\|TH7 | 86 | 53 | 61.6% | 0 | 24.8s | 56.8% | 38.1% |
| kill-corridor\|TH7 | 86 | 59 | 68.6% | 0 | 24.6s | 63.9% | 28.6% |
| diamond\|TH6 | 85 | 44 | 51.8% | 0 | 27.7s | 56.2% | 45.2% |
| echelon-right\|TH6 | 85 | 57 | 67.1% | 0 | 26.5s | 52.3% | 32.0% |
| cannon-screen\|TH6 | 84 | 58 | 69.0% | 0 | 29.3s | 56.0% | 29.6% |
| crossfire\|TH6 | 84 | 40 | 47.6% | 0 | 26.6s | 45.9% | 47.6% |
| corner-keep\|TH6 | 82 | 44 | 53.7% | 0 | 28.3s | 52.6% | 44.4% |
| echelon-left\|TH6 | 82 | 51 | 62.2% | 0 | 32.1s | 52.1% | 33.6% |
| kill-corridor\|TH6 | 82 | 46 | 56.1% | 0 | 24.9s | 50.9% | 39.9% |
| rear-keep\|TH6 | 82 | 43 | 52.4% | 0 | 28.6s | 47.4% | 43.3% |
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
| rushed-defense | 1047 | 93 | 8.9% | 0 | 20.6s | 35.1% | 85.2% |
| mid | 1003 | 813 | 81.1% | 0 | 31.8s | 66.4% | 14.0% |
| maxed | 1001 | 27 | 2.7% | 0 | 21.6s | 22.0% | 92.1% |
| rushed-economy | 997 | 997 | 100.0% | 0 | 28.0s | 72.6% | 0.0% |
| mixed | 952 | 846 | 88.9% | 0 | 27.4s | 68.9% | 9.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2600 | 1439 | 55.3% | 0 | 22.4s | 43.1% | 38.8% |
| pure-unit-matrix | 2400 | 1337 | 55.7% | 0 | 29.5s | 62.9% | 43.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 497 | 55.2% | 0 | 27.3s | 61.8% | 43.7% |
| policy-exploration\|TH5 | 869 | 474 | 54.5% | 0 | 21.7s | 36.4% | 36.4% |
| policy-exploration\|TH6 | 868 | 479 | 55.2% | 0 | 23.5s | 43.8% | 39.8% |
| policy-exploration\|TH7 | 863 | 486 | 56.3% | 0 | 22.0s | 48.6% | 40.3% |
| pure-unit-matrix\|TH6 | 800 | 456 | 57.0% | 0 | 30.7s | 62.4% | 41.9% |
| pure-unit-matrix\|TH5 | 700 | 384 | 54.9% | 0 | 31.1s | 65.2% | 43.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2400 | 1337 | 55.7% | 0 | 29.5s | 62.9% | 43.0% |
| policy-exploration\|cannon-focus | 441 | 255 | 57.8% | 0 | 27.9s | 65.4% | 40.7% |
| policy-exploration\|none | 438 | 240 | 54.8% | 0 | 27.1s | 62.9% | 43.8% |
| policy-exploration\|rally-core | 438 | 234 | 53.4% | 0 | 15.1s | 5.9% | 32.1% |
| policy-exploration\|cannon-rally | 422 | 223 | 52.8% | 0 | 14.8s | 5.4% | 32.5% |
| policy-exploration\|medkit-entry | 224 | 130 | 58.0% | 0 | 27.2s | 63.5% | 40.6% |
| policy-exploration\|cannon-medkit | 219 | 119 | 54.3% | 0 | 26.1s | 61.1% | 45.1% |
| policy-exploration\|skeleton-barrel | 74 | 40 | 54.1% | 0 | 24.3s | 59.9% | 44.6% |
| policy-exploration\|rage-entry | 70 | 36 | 51.4% | 0 | 23.4s | 59.8% | 47.6% |
| policy-exploration\|rally-rage | 70 | 37 | 52.9% | 0 | 13.1s | 7.7% | 38.5% |
| policy-exploration\|freeze-barrel | 68 | 43 | 63.2% | 0 | 25.2s | 66.3% | 36.6% |
| policy-exploration\|freeze-defense | 68 | 38 | 55.9% | 0 | 24.7s | 63.8% | 44.0% |
| policy-exploration\|freeze-rage | 68 | 44 | 64.7% | 0 | 25.6s | 68.8% | 32.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 266 | 159 | 59.8% | 0 | 24.1s | 42.3% | 33.0% |
| policy-exploration\|wide-line | 266 | 137 | 51.5% | 0 | 21.2s | 43.8% | 43.0% |
| policy-exploration\|center-column | 265 | 155 | 58.5% | 0 | 21.0s | 40.5% | 35.0% |
| policy-exploration\|right-flank | 265 | 143 | 54.0% | 0 | 22.0s | 36.6% | 36.6% |
| policy-exploration\|vanguard-wedge | 264 | 140 | 53.0% | 0 | 22.3s | 38.8% | 40.5% |
| policy-exploration\|left-flank | 261 | 154 | 59.0% | 0 | 23.1s | 46.1% | 37.3% |
| policy-exploration\|dual-flank | 255 | 137 | 53.7% | 0 | 22.7s | 44.7% | 40.7% |
| policy-exploration\|three-lane | 255 | 141 | 55.3% | 0 | 21.8s | 45.0% | 38.7% |
| policy-exploration\|edge-sweep | 254 | 126 | 49.6% | 0 | 21.0s | 42.9% | 46.3% |
| policy-exploration\|diamond | 249 | 147 | 59.0% | 0 | 25.2s | 51.4% | 37.2% |
| pure-unit-matrix\|center-column | 240 | 127 | 52.9% | 0 | 30.6s | 61.5% | 46.5% |
| pure-unit-matrix\|diamond | 240 | 133 | 55.4% | 0 | 29.9s | 64.8% | 42.8% |
| pure-unit-matrix\|dual-flank | 240 | 134 | 55.8% | 0 | 27.7s | 66.2% | 43.1% |
| pure-unit-matrix\|edge-sweep | 240 | 131 | 54.6% | 0 | 28.3s | 63.9% | 44.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 134 | 55.8% | 0 | 31.0s | 61.1% | 43.7% |
| pure-unit-matrix\|left-flank | 240 | 147 | 61.3% | 0 | 30.1s | 62.2% | 35.5% |
| pure-unit-matrix\|right-flank | 240 | 153 | 63.7% | 0 | 31.6s | 62.7% | 34.8% |
| pure-unit-matrix\|three-lane | 240 | 131 | 54.6% | 0 | 29.1s | 64.0% | 44.9% |
| pure-unit-matrix\|vanguard-wedge | 240 | 122 | 50.8% | 0 | 29.5s | 60.2% | 47.6% |
| pure-unit-matrix\|wide-line | 240 | 125 | 52.1% | 0 | 27.3s | 62.8% | 46.9% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|three-waves | 532 | 284 | 53.4% | 0 | 22.4s | 42.8% | 40.1% |
| policy-exploration\|drip | 526 | 284 | 54.0% | 0 | 22.9s | 44.3% | 40.9% |
| policy-exploration\|burst | 525 | 305 | 58.1% | 0 | 22.7s | 44.3% | 35.4% |
| policy-exploration\|two-waves | 514 | 292 | 56.8% | 0 | 22.4s | 42.3% | 38.6% |
| policy-exploration\|rapid | 503 | 274 | 54.5% | 0 | 21.6s | 41.9% | 38.9% |
| pure-unit-matrix\|burst | 480 | 283 | 59.0% | 0 | 29.7s | 64.5% | 39.6% |
| pure-unit-matrix\|drip | 480 | 257 | 53.5% | 0 | 30.4s | 61.9% | 44.9% |
| pure-unit-matrix\|rapid | 480 | 265 | 55.2% | 0 | 29.0s | 62.1% | 43.8% |
| pure-unit-matrix\|three-waves | 480 | 257 | 53.5% | 0 | 28.8s | 62.0% | 45.1% |
| pure-unit-matrix\|two-waves | 480 | 275 | 57.3% | 0 | 29.7s | 64.3% | 41.6% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1300 | 725 | 55.8% | 0 | 22.0s | 44.0% | 38.3% |
| policy-exploration\|tank-front-support-rear | 1300 | 714 | 54.9% | 0 | 22.8s | 42.3% | 39.4% |
| pure-unit-matrix\|roster-order | 1200 | 673 | 56.1% | 0 | 29.2s | 63.0% | 42.9% |
| pure-unit-matrix\|tank-front-support-rear | 1200 | 664 | 55.3% | 0 | 29.8s | 62.9% | 43.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 439 | 203 | 46.2% | 0 | 27.1s | 52.3% | 51.0% |
| pure-archer | 429 | 198 | 46.2% | 0 | 35.9s | 52.9% | 50.6% |
| pure-mimic | 417 | 230 | 55.2% | 0 | 33.2s | 54.9% | 41.6% |
| pure-mage | 407 | 184 | 45.2% | 0 | 23.4s | 51.8% | 53.2% |
| pure-knight | 404 | 243 | 60.1% | 0 | 30.8s | 58.5% | 36.4% |
| pure-fire_dragon | 403 | 243 | 60.3% | 0 | 20.1s | 61.9% | 37.8% |
| pure-demon_king | 392 | 267 | 68.1% | 0 | 28.1s | 68.4% | 27.8% |
| pure-mechanical_dragon | 293 | 181 | 61.8% | 0 | 24.4s | 64.6% | 37.5% |
| balanced | 144 | 95 | 66.0% | 0 | 19.7s | 42.8% | 27.5% |
| random-4 | 144 | 78 | 54.2% | 0 | 21.3s | 39.6% | 38.9% |
| random-5 | 140 | 72 | 51.4% | 0 | 22.1s | 40.4% | 43.6% |
| melee-pressure | 138 | 83 | 60.1% | 0 | 24.1s | 40.6% | 32.3% |
| frontline-ranged | 134 | 67 | 50.0% | 0 | 20.6s | 43.9% | 44.1% |
| random-2 | 133 | 76 | 57.1% | 0 | 21.0s | 41.9% | 37.2% |
| random-6 | 133 | 75 | 56.4% | 0 | 21.3s | 42.2% | 38.0% |
| pure-necromancer | 131 | 60 | 45.8% | 0 | 30.0s | 48.4% | 52.4% |
| trap-runner-mix | 121 | 65 | 53.7% | 0 | 22.9s | 45.0% | 36.0% |
| random-1 | 113 | 66 | 58.4% | 0 | 22.5s | 50.2% | 38.2% |
| ranged-pressure | 113 | 62 | 54.9% | 0 | 20.0s | 44.7% | 40.1% |
| random-3 | 111 | 66 | 59.5% | 0 | 21.8s | 42.2% | 36.4% |
| support-mix | 98 | 62 | 63.3% | 0 | 21.0s | 44.7% | 33.5% |
| hero-necro-dragon-mages | 96 | 59 | 61.5% | 0 | 19.2s | 41.5% | 33.4% |
| air-pressure | 67 | 41 | 61.2% | 0 | 18.6s | 52.4% | 37.6% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__three-waves__roster-order | 57 | 34 | 59.6% | 0 | 26.0s | 64.5% | 38.5% |
| inverted-wedge__two-waves__roster-order | 57 | 30 | 52.6% | 0 | 26.8s | 50.6% | 44.5% |
| left-flank__burst__roster-order | 57 | 38 | 66.7% | 0 | 23.0s | 50.7% | 31.0% |
| left-flank__drip__roster-order | 57 | 32 | 56.1% | 0 | 26.3s | 54.4% | 41.5% |
| wide-line__rapid__roster-order | 57 | 34 | 59.6% | 0 | 24.3s | 55.9% | 36.0% |
| center-column__burst__roster-order | 56 | 34 | 60.7% | 0 | 25.1s | 53.3% | 35.0% |
| center-column__drip__roster-order | 56 | 33 | 58.9% | 0 | 27.1s | 56.0% | 38.3% |
| center-column__drip__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 26.2s | 51.2% | 46.7% |
| center-column__two-waves__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 24.5s | 41.5% | 40.8% |
| diamond__three-waves__roster-order | 56 | 36 | 64.3% | 0 | 25.5s | 53.3% | 32.7% |
| dual-flank__drip__roster-order | 56 | 26 | 46.4% | 0 | 23.1s | 48.2% | 48.6% |
| edge-sweep__rapid__roster-order | 56 | 25 | 44.6% | 0 | 24.1s | 50.7% | 50.7% |
| edge-sweep__three-waves__tank-front-support-rear | 56 | 22 | 39.3% | 0 | 22.1s | 38.2% | 55.5% |
| right-flank__three-waves__tank-front-support-rear | 56 | 33 | 58.9% | 0 | 27.5s | 56.7% | 37.5% |
| vanguard-wedge__two-waves__roster-order | 56 | 29 | 51.8% | 0 | 23.3s | 41.7% | 44.2% |
| wide-line__burst__roster-order | 56 | 31 | 55.4% | 0 | 22.0s | 52.2% | 40.1% |
| wide-line__three-waves__tank-front-support-rear | 56 | 33 | 58.9% | 0 | 23.4s | 47.5% | 35.8% |
| diamond__burst__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 27.8s | 65.6% | 29.6% |
| diamond__rapid__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 29.6s | 53.8% | 43.7% |
| dual-flank__two-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.8s | 46.7% | 46.7% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 28.0s | 47.1% | 37.7% |
| inverted-wedge__drip__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 24.4s | 36.0% | 43.1% |
| left-flank__three-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 31.0s | 60.4% | 29.5% |
| right-flank__three-waves__roster-order | 55 | 28 | 50.9% | 0 | 25.2s | 49.1% | 43.4% |
| vanguard-wedge__burst__tank-front-support-rear | 55 | 30 | 54.5% | 0 | 24.2s | 46.8% | 39.2% |
| vanguard-wedge__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 27.5s | 54.9% | 44.4% |
| wide-line__burst__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 22.7s | 47.7% | 41.6% |
| wide-line__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 29.7s | 62.7% | 46.9% |
| right-flank__two-waves__tank-front-support-rear | 54 | 37 | 68.5% | 0 | 28.5s | 51.4% | 26.7% |
| three-lane__rapid__tank-front-support-rear | 54 | 32 | 59.3% | 0 | 26.6s | 55.3% | 38.7% |
| center-column__burst__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 26.8s | 55.4% | 43.9% |
| diamond__two-waves__roster-order | 51 | 29 | 56.9% | 0 | 25.6s | 56.2% | 40.2% |
| dual-flank__burst__tank-front-support-rear | 51 | 35 | 68.6% | 0 | 26.4s | 63.6% | 26.3% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 25.4s | 64.0% | 44.7% |
| inverted-wedge__rapid__roster-order | 51 | 28 | 54.9% | 0 | 24.2s | 41.5% | 38.7% |
| right-flank__drip__roster-order | 51 | 23 | 45.1% | 0 | 27.3s | 48.0% | 47.4% |
| right-flank__rapid__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 27.4s | 61.1% | 28.6% |
| three-lane__drip__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 25.0s | 54.5% | 49.5% |
| three-lane__three-waves__roster-order | 51 | 24 | 47.1% | 0 | 22.3s | 44.1% | 47.9% |
| dual-flank__rapid__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.2s | 58.1% | 46.7% |
| edge-sweep__burst__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 23.1s | 48.6% | 50.8% |
| edge-sweep__drip__roster-order | 50 | 23 | 46.0% | 0 | 25.0s | 42.0% | 50.9% |
| edge-sweep__two-waves__roster-order | 50 | 32 | 64.0% | 0 | 25.6s | 67.5% | 36.0% |
| inverted-wedge__burst__roster-order | 50 | 35 | 70.0% | 0 | 35.1s | 58.4% | 27.5% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 26.4s | 51.1% | 34.9% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 29.5s | 63.8% | 31.5% |
| left-flank__rapid__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 24.1s | 49.3% | 42.4% |
| left-flank__two-waves__roster-order | 50 | 32 | 64.0% | 0 | 26.7s | 54.3% | 35.3% |
| left-flank__two-waves__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 27.3s | 50.6% | 46.2% |
| right-flank__burst__roster-order | 50 | 27 | 54.0% | 0 | 27.9s | 48.8% | 38.4% |
| right-flank__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 26.8s | 42.8% | 37.9% |
| right-flank__rapid__roster-order | 50 | 28 | 56.0% | 0 | 23.1s | 38.0% | 37.3% |
| three-lane__burst__roster-order | 50 | 30 | 60.0% | 0 | 31.7s | 68.8% | 37.3% |
| three-lane__drip__roster-order | 50 | 30 | 60.0% | 0 | 26.5s | 63.9% | 38.7% |
| three-lane__three-waves__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 21.6s | 39.6% | 47.1% |
| three-lane__two-waves__roster-order | 50 | 32 | 64.0% | 0 | 25.1s | 59.1% | 35.0% |
| three-lane__two-waves__tank-front-support-rear | 50 | 32 | 64.0% | 0 | 24.6s | 49.3% | 32.8% |
| vanguard-wedge__rapid__roster-order | 50 | 26 | 52.0% | 0 | 23.1s | 35.6% | 39.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 24.1s | 39.0% | 37.7% |
| vanguard-wedge__three-waves__roster-order | 50 | 20 | 40.0% | 0 | 23.2s | 47.2% | 56.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 29.0s | 53.6% | 47.8% |
| wide-line__three-waves__roster-order | 50 | 19 | 38.0% | 0 | 22.4s | 41.3% | 57.4% |
| wide-line__two-waves__tank-front-support-rear | 50 | 24 | 48.0% | 0 | 22.0s | 54.7% | 51.1% |
| center-column__three-waves__tank-front-support-rear | 49 | 20 | 40.8% | 0 | 25.4s | 38.6% | 55.0% |
| center-column__two-waves__roster-order | 49 | 33 | 67.3% | 0 | 23.0s | 43.2% | 27.5% |
| diamond__rapid__roster-order | 49 | 24 | 49.0% | 0 | 26.4s | 55.6% | 49.7% |
| dual-flank__burst__roster-order | 49 | 33 | 67.3% | 0 | 22.5s | 60.7% | 29.3% |
| dual-flank__two-waves__roster-order | 49 | 27 | 55.1% | 0 | 26.0s | 58.8% | 43.2% |
| edge-sweep__drip__tank-front-support-rear | 49 | 29 | 59.2% | 0 | 25.4s | 44.7% | 38.4% |
| edge-sweep__three-waves__roster-order | 49 | 30 | 61.2% | 0 | 26.2s | 63.4% | 36.9% |
| inverted-wedge__drip__roster-order | 49 | 29 | 59.2% | 0 | 27.1s | 58.0% | 38.3% |
| left-flank__rapid__roster-order | 49 | 31 | 63.3% | 0 | 24.8s | 53.2% | 30.6% |
| left-flank__three-waves__roster-order | 49 | 33 | 67.3% | 0 | 27.1s | 59.6% | 28.8% |
| vanguard-wedge__burst__roster-order | 49 | 29 | 59.2% | 0 | 27.3s | 50.3% | 37.5% |
| diamond__drip__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 29.4s | 55.7% | 39.2% |
| diamond__three-waves__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 28.7s | 62.1% | 44.4% |
| diamond__two-waves__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 28.0s | 53.5% | 50.3% |
| dual-flank__three-waves__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 25.0s | 51.9% | 42.0% |
| inverted-wedge__two-waves__tank-front-support-rear | 45 | 30 | 66.7% | 0 | 27.6s | 60.8% | 31.8% |
| left-flank__drip__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 25.3s | 49.0% | 36.0% |
| three-lane__burst__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 25.9s | 56.4% | 47.4% |
| vanguard-wedge__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 28.2s | 64.1% | 42.2% |
| center-column__rapid__roster-order | 44 | 24 | 54.5% | 0 | 28.7s | 63.7% | 45.5% |
| center-column__rapid__tank-front-support-rear | 44 | 28 | 63.6% | 0 | 25.5s | 58.7% | 32.3% |
| center-column__three-waves__roster-order | 44 | 24 | 54.5% | 0 | 23.3s | 44.8% | 38.9% |
| diamond__burst__roster-order | 44 | 23 | 52.3% | 0 | 25.7s | 54.1% | 44.1% |
| diamond__drip__roster-order | 44 | 31 | 70.5% | 0 | 28.8s | 70.8% | 27.5% |
| dual-flank__drip__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 25.0s | 48.3% | 43.5% |
| edge-sweep__burst__roster-order | 44 | 25 | 56.8% | 0 | 22.8s | 53.8% | 39.9% |
| inverted-wedge__three-waves__roster-order | 44 | 19 | 43.2% | 0 | 24.3s | 48.7% | 52.5% |
| right-flank__burst__tank-front-support-rear | 44 | 28 | 63.6% | 0 | 24.9s | 39.9% | 29.6% |
| right-flank__two-waves__roster-order | 44 | 30 | 68.2% | 0 | 26.6s | 52.3% | 28.6% |
| three-lane__rapid__roster-order | 44 | 22 | 50.0% | 0 | 24.1s | 50.9% | 43.5% |
| vanguard-wedge__drip__roster-order | 44 | 21 | 47.7% | 0 | 28.2s | 60.3% | 51.7% |
| wide-line__drip__roster-order | 44 | 23 | 52.3% | 0 | 26.6s | 56.6% | 45.2% |
| wide-line__two-waves__roster-order | 44 | 23 | 52.3% | 0 | 24.6s | 58.3% | 45.6% |
| dual-flank__rapid__roster-order | 39 | 16 | 41.0% | 0 | 22.3s | 48.4% | 56.9% |
| edge-sweep__two-waves__tank-front-support-rear | 39 | 20 | 51.3% | 0 | 26.6s | 62.2% | 46.8% |
| left-flank__burst__tank-front-support-rear | 39 | 19 | 48.7% | 0 | 29.1s | 57.1% | 45.8% |
| wide-line__rapid__tank-front-support-rear | 39 | 17 | 43.6% | 0 | 23.2s | 51.8% | 54.1% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 506 | 293 | 57.9% | 0 | 27.3s | 51.3% | 38.1% |
| wide-line | 506 | 262 | 51.8% | 0 | 24.1s | 52.8% | 44.9% |
| center-column | 505 | 282 | 55.8% | 0 | 25.6s | 50.5% | 40.4% |
| right-flank | 505 | 296 | 58.6% | 0 | 26.6s | 49.0% | 35.7% |
| vanguard-wedge | 504 | 262 | 52.0% | 0 | 25.7s | 49.0% | 43.9% |
| left-flank | 501 | 301 | 60.1% | 0 | 26.4s | 53.9% | 36.5% |
| dual-flank | 495 | 271 | 54.7% | 0 | 25.1s | 55.2% | 41.9% |
| three-lane | 495 | 272 | 54.9% | 0 | 25.4s | 54.2% | 41.7% |
| edge-sweep | 494 | 257 | 52.0% | 0 | 24.6s | 53.1% | 45.3% |
| diamond | 489 | 280 | 57.3% | 0 | 27.5s | 58.0% | 39.9% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| three-waves | 1012 | 541 | 53.5% | 0 | 25.4s | 51.9% | 42.5% |
| drip | 1006 | 541 | 53.8% | 0 | 26.5s | 52.7% | 42.8% |
| burst | 1005 | 588 | 58.5% | 0 | 26.1s | 53.9% | 37.4% |
| two-waves | 994 | 567 | 57.0% | 0 | 25.9s | 53.0% | 40.1% |
| rapid | 983 | 539 | 54.8% | 0 | 25.2s | 51.8% | 41.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1398 | 55.9% | 0 | 25.5s | 53.1% | 40.5% |
| tank-front-support-rear | 2500 | 1378 | 55.1% | 0 | 26.2s | 52.2% | 41.2% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2838 | 1577 | 55.6% | 0 | 29.1s | 62.9% | 43.1% |
| cannon-focus | 441 | 255 | 57.8% | 0 | 27.9s | 65.4% | 40.7% |
| rally-core | 438 | 234 | 53.4% | 0 | 15.1s | 5.9% | 32.1% |
| cannon-rally | 422 | 223 | 52.8% | 0 | 14.8s | 5.4% | 32.5% |
| medkit-entry | 224 | 130 | 58.0% | 0 | 27.2s | 63.5% | 40.6% |
| cannon-medkit | 219 | 119 | 54.3% | 0 | 26.1s | 61.1% | 45.1% |
| skeleton-barrel | 74 | 40 | 54.1% | 0 | 24.3s | 59.9% | 44.6% |
| rage-entry | 70 | 36 | 51.4% | 0 | 23.4s | 59.8% | 47.6% |
| rally-rage | 70 | 37 | 52.9% | 0 | 13.1s | 7.7% | 38.5% |
| freeze-barrel | 68 | 43 | 63.2% | 0 | 25.2s | 66.3% | 36.6% |
| freeze-defense | 68 | 38 | 55.9% | 0 | 24.7s | 63.8% | 44.0% |
| freeze-rage | 68 | 44 | 64.7% | 0 | 25.6s | 68.8% | 32.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 3045 | 1698 | 55.8% | 0 | 28.0s | 58.7% | 42.2% |
| epic | 659 | 361 | 54.8% | 0 | 22.1s | 42.1% | 38.6% |
| unrevealed | 651 | 368 | 56.5% | 0 | 22.7s | 43.6% | 38.1% |
| legendary | 645 | 349 | 54.1% | 0 | 22.5s | 44.2% | 39.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 2900 | 1629 | 56.2% | 0 | 28.3s | 59.8% | 41.7% |
| ward-3 | 1000 | 530 | 53.0% | 0 | 22.2s | 42.4% | 41.1% |
| ward-2 | 600 | 327 | 54.5% | 0 | 22.2s | 42.6% | 39.3% |
| ward-1 | 500 | 290 | 58.0% | 0 | 22.8s | 44.0% | 36.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2776 | 55.5% | 0 | 25.8s | 52.7% | 40.8% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 1909 | 1107 | 58.0% | 0 | 23.5s | 46.1% | 36.6% |
| demon_king | 1897 | 1131 | 59.6% | 0 | 22.9s | 48.1% | 34.9% |
| fire_dragon | 1872 | 1089 | 58.2% | 0 | 20.8s | 47.5% | 37.0% |
| mage | 1846 | 1006 | 54.5% | 0 | 21.6s | 45.1% | 40.7% |
| archer | 1813 | 982 | 54.2% | 0 | 24.7s | 45.5% | 40.7% |
| mimic | 1795 | 1019 | 56.8% | 0 | 24.4s | 45.7% | 37.8% |
| pea_shooter | 1285 | 674 | 52.5% | 0 | 23.4s | 45.9% | 43.1% |
| mechanical_dragon | 823 | 484 | 58.8% | 0 | 22.4s | 53.7% | 39.3% |
| necromancer | 430 | 230 | 53.5% | 0 | 23.7s | 45.0% | 44.7% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 48.3% | 42.7%-54.0% | 58.4% | 50.1% | 26.5% |
| demon_king | 300 | 69.0% | 63.6%-74.0% | 73.2% | 28.3% | 56.8% |
| fire_dragon | 300 | 61.3% | 55.7%-66.7% | 68.6% | 37.8% | 52.3% |
| knight | 300 | 59.7% | 54.0%-65.1% | 65.0% | 38.6% | 40.2% |
| mage | 300 | 46.7% | 41.1%-52.3% | 57.1% | 52.9% | 28.4% |
| mechanical_dragon | 200 | 62.0% | 55.1%-68.4% | 68.6% | 37.9% | 48.4% |
| mimic | 300 | 55.7% | 50.0%-61.2% | 59.8% | 43.4% | 46.1% |
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
| mimic\|TH7 | 100 | 52.0% | 42.3%-61.5% | 54.5% | 47.0% | 41.6% |
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
| mechanical_dragon\|cannon-screen | 10 | 80.0% | 49.0%-94.3% | 75.3% | 20.0% | 54.5% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 63.1% | 49.8% | 39.4% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 66.0% | 39.5% | 43.6% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 69.0% | 39.8% | 47.3% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 73.6% | 33.3% | 51.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 68.7% | 40.0% | 45.5% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 61.3% | 40.0% | 54.5% |
| mechanical_dragon\|echelon-right | 10 | 70.0% | 39.7%-89.2% | 73.7% | 29.8% | 58.2% |
| mechanical_dragon\|kill-corridor | 10 | 80.0% | 49.0%-94.3% | 80.3% | 20.0% | 59.1% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 64.2% | 50.0% | 40.9% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 68.7% | 40.0% | 49.1% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.4% | 50.0% | 40.2% |
| mechanical_dragon\|southern-funnel | 12 | 66.7% | 39.1%-86.2% | 64.2% | 33.3% | 45.5% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 68.3% | 33.3% | 56.8% |
| mechanical_dragon\|trap-lanes | 12 | 66.7% | 39.1%-86.2% | 68.9% | 33.3% | 51.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.6% | 32.4% | 54.5% |
| mimic\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 59.1% | 59.1% | 35.7% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 59.1% | 55.6% | 39.7% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 58.9% | 33.3% | 52.4% |
| mimic\|compact-core | 18 | 33.3% | 16.3%-56.3% | 49.1% | 66.7% | 30.2% |
| mimic\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 55.5% | 52.4% | 37.1% |
| mimic\|crossfire | 15 | 66.7% | 41.7%-84.8% | 60.7% | 33.3% | 47.6% |
| mimic\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 66.7% | 33.3% | 57.1% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 57.7% | 46.2% | 49.5% |
| mimic\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 61.8% | 21.6% | 54.3% |
| mimic\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.5% | 39.6% | 53.3% |
| mimic\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 65.7% | 33.2% | 56.2% |
| mimic\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 55.1% | 50.0% | 33.3% |
| mimic\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.7% | 49.7% | 43.8% |
| mimic\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 55.3% | 59.6% | 33.3% |
| mimic\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 65.3% | 32.4% | 55.6% |
| mimic\|split-core | 18 | 55.6% | 33.7%-75.4% | 60.6% | 42.0% | 47.6% |
| mimic\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 61.7% | 33.3% | 57.9% |
| mimic\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 63.4% | 33.3% | 49.2% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 58.6% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 51.1% | 66.7% | 33.3% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 40.3% | 66.7% | 22.2% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 57.0% | 50.0% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 48.9% | 66.7% | 22.2% |
| necromancer\|resource-shield | 6 | 50.0% | 18.8%-81.2% | 48.9% | 50.0% | 38.9% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 35.5% | 83.3% | 11.1% |
| necromancer\|split-core | 6 | 66.7% | 30.0%-90.3% | 61.8% | 33.3% | 50.0% |
| necromancer\|trap-lanes | 6 | 33.3% | 9.7%-70.0% | 50.5% | 66.6% | 27.8% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 63.4% | 33.3% | 38.9% |
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
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 19 | 0.0% | 98.2% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 19 | 0.0% | 95.7% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 19 | 0.0% | 95.5% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 19 | 0.0% | 92.4% |
| th7-asymmetric-right-297 | 7 | asymmetric-right | rushed-defense | 18 | 0.0% | 100.0% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 18 | 0.0% | 99.6% |
| th7-echelon-right-105 | 7 | echelon-right | maxed | 18 | 0.0% | 99.6% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 18 | 0.0% | 99.6% |
| th7-compact-core-273 | 7 | compact-core | maxed | 18 | 0.0% | 99.4% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 18 | 0.0% | 98.8% |
| th7-crossfire-153 | 7 | crossfire | maxed | 18 | 0.0% | 98.7% |
| th7-cannon-screen-204 | 7 | cannon-screen | maxed | 18 | 0.0% | 98.4% |
| th7-trap-lanes-138 | 7 | trap-lanes | maxed | 18 | 0.0% | 98.4% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 18 | 0.0% | 97.6% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 97.4% |

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
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-287 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
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
- 162 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
