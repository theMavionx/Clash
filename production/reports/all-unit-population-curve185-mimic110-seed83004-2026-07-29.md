# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:36:07.328Z
**Seed:** 83004
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 84
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.98x
**Lab late-tier troop scales:** mimic=1.1x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 114.5s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`; imported base and building IDs must be non-empty and unique.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
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
| 5000 | 2819 | 56.4% | 0 | 25.6s | 52.6% | 40.3% | 35.7% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 980 | 55.8% | 0 | 24.9s | 55.1% | 42.2% |
| TH6->TH6 | 1669 | 955 | 57.2% | 0 | 26.0s | 52.6% | 40.2% |
| TH5->TH5 | 1576 | 884 | 56.1% | 0 | 26.0s | 49.3% | 38.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 184 | 48.3% | 0 | 23.9s | 48.3% | 48.7% |
| layered-rings | 380 | 174 | 45.8% | 0 | 24.2s | 49.3% | 49.8% |
| asymmetric-right | 376 | 187 | 49.7% | 0 | 25.0s | 52.5% | 46.6% |
| crossfire | 312 | 183 | 58.7% | 0 | 25.6s | 51.1% | 37.6% |
| diamond | 312 | 169 | 54.2% | 0 | 24.6s | 51.8% | 42.4% |
| kill-corridor | 310 | 183 | 59.0% | 0 | 26.2s | 54.0% | 37.4% |
| compact-core | 276 | 112 | 40.6% | 0 | 24.5s | 45.9% | 54.6% |
| split-core | 274 | 179 | 65.3% | 0 | 25.6s | 57.1% | 30.8% |
| trap-lanes | 274 | 181 | 66.1% | 0 | 26.2s | 55.5% | 31.6% |
| wide-spread | 272 | 204 | 75.0% | 0 | 28.0s | 61.1% | 23.8% |
| asymmetric-left | 249 | 118 | 47.4% | 0 | 26.0s | 51.7% | 49.8% |
| southern-funnel | 247 | 142 | 57.5% | 0 | 25.5s | 52.1% | 39.3% |
| defense-ring | 245 | 146 | 59.6% | 0 | 27.5s | 57.0% | 35.9% |
| echelon-left | 233 | 162 | 69.5% | 0 | 27.0s | 54.1% | 29.6% |
| rear-keep | 232 | 112 | 48.3% | 0 | 23.7s | 48.5% | 48.4% |
| corner-keep | 212 | 119 | 56.1% | 0 | 26.2s | 52.9% | 38.1% |
| echelon-right | 208 | 126 | 60.6% | 0 | 26.1s | 53.1% | 34.9% |
| cannon-screen | 207 | 138 | 66.7% | 0 | 28.0s | 54.1% | 32.6% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 87 | 46.8% | 0 | 23.0s | 49.1% | 51.0% |
| resource-shield\|TH7 | 185 | 92 | 49.7% | 0 | 23.9s | 51.2% | 47.0% |
| asymmetric-right\|TH7 | 184 | 98 | 53.3% | 0 | 24.0s | 52.7% | 43.4% |
| kill-corridor\|TH7 | 151 | 93 | 61.6% | 0 | 25.0s | 55.3% | 36.3% |
| crossfire\|TH7 | 149 | 97 | 65.1% | 0 | 25.3s | 56.4% | 31.6% |
| diamond\|TH7 | 149 | 78 | 52.3% | 0 | 23.3s | 50.9% | 46.1% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 25.4s | 49.2% | 48.5% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 26.2s | 51.6% | 46.7% |
| layered-rings\|TH6 | 101 | 51 | 50.5% | 0 | 25.2s | 51.2% | 46.8% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 23.2s | 46.7% | 49.2% |
| trap-lanes\|TH6 | 101 | 58 | 57.4% | 0 | 25.3s | 51.2% | 40.2% |
| southern-funnel\|TH6 | 100 | 57 | 57.0% | 0 | 27.5s | 50.6% | 40.9% |
| split-core\|TH6 | 100 | 64 | 64.0% | 0 | 25.8s | 56.4% | 33.5% |
| wide-spread\|TH6 | 99 | 74 | 74.7% | 0 | 28.1s | 62.2% | 23.6% |
| asymmetric-right\|TH6 | 98 | 48 | 49.0% | 0 | 25.2s | 53.8% | 48.8% |
| defense-ring\|TH6 | 98 | 61 | 62.2% | 0 | 28.3s | 56.1% | 34.5% |
| resource-shield\|TH5 | 95 | 42 | 44.2% | 0 | 24.5s | 43.6% | 51.3% |
| asymmetric-left\|TH5 | 94 | 41 | 43.6% | 0 | 25.7s | 47.2% | 50.9% |
| asymmetric-right\|TH5 | 94 | 41 | 43.6% | 0 | 27.0s | 50.6% | 50.4% |
| corner-keep\|TH5 | 94 | 52 | 55.3% | 0 | 26.6s | 51.6% | 34.6% |
| split-core\|TH5 | 94 | 54 | 57.4% | 0 | 25.0s | 49.0% | 34.5% |
| compact-core\|TH5 | 93 | 42 | 45.2% | 0 | 25.9s | 47.2% | 47.3% |
| defense-ring\|TH5 | 93 | 54 | 58.1% | 0 | 26.7s | 53.8% | 33.5% |
| layered-rings\|TH5 | 93 | 36 | 38.7% | 0 | 25.5s | 47.6% | 50.7% |
| southern-funnel\|TH5 | 93 | 57 | 61.3% | 0 | 22.9s | 51.4% | 32.6% |
| trap-lanes\|TH5 | 93 | 61 | 65.6% | 0 | 26.5s | 50.8% | 30.4% |
| wide-spread\|TH5 | 93 | 73 | 78.5% | 0 | 27.9s | 55.2% | 20.5% |
| diamond\|TH6 | 85 | 48 | 56.5% | 0 | 26.4s | 55.5% | 38.2% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 26.0s | 54.2% | 36.5% |
| cannon-screen\|TH6 | 84 | 56 | 66.7% | 0 | 26.5s | 51.8% | 32.4% |
| crossfire\|TH6 | 84 | 39 | 46.4% | 0 | 24.5s | 44.5% | 48.4% |
| echelon-left\|TH6 | 83 | 54 | 65.1% | 0 | 27.8s | 50.2% | 34.4% |
| corner-keep\|TH6 | 82 | 51 | 62.2% | 0 | 25.6s | 54.0% | 35.0% |
| kill-corridor\|TH6 | 82 | 50 | 61.0% | 0 | 27.2s | 56.6% | 35.7% |
| rear-keep\|TH6 | 82 | 41 | 50.0% | 0 | 24.8s | 51.6% | 47.1% |
| compact-core\|TH7 | 80 | 21 | 26.3% | 0 | 21.9s | 40.6% | 71.0% |
| split-core\|TH7 | 80 | 61 | 76.3% | 0 | 26.2s | 66.5% | 23.1% |
| trap-lanes\|TH7 | 80 | 62 | 77.5% | 0 | 27.1s | 65.4% | 22.3% |
| wide-spread\|TH7 | 80 | 57 | 71.3% | 0 | 28.1s | 66.1% | 27.9% |
| crossfire\|TH5 | 79 | 47 | 59.5% | 0 | 27.4s | 47.3% | 37.5% |
| rear-keep\|TH5 | 79 | 45 | 57.0% | 0 | 24.2s | 48.2% | 39.6% |
| cannon-screen\|TH5 | 78 | 55 | 70.5% | 0 | 29.5s | 52.7% | 28.8% |
| diamond\|TH5 | 78 | 43 | 55.1% | 0 | 25.0s | 49.4% | 39.9% |
| echelon-left\|TH5 | 78 | 54 | 69.2% | 0 | 26.0s | 47.1% | 28.7% |
| echelon-right\|TH5 | 78 | 47 | 60.3% | 0 | 24.5s | 45.8% | 31.3% |
| kill-corridor\|TH5 | 77 | 40 | 51.9% | 0 | 27.6s | 48.4% | 41.6% |
| echelon-left\|TH7 | 72 | 54 | 75.0% | 0 | 27.0s | 65.1% | 25.0% |
| rear-keep\|TH7 | 71 | 26 | 36.6% | 0 | 21.9s | 45.4% | 59.6% |
| asymmetric-left\|TH7 | 54 | 25 | 46.3% | 0 | 26.3s | 58.8% | 53.6% |
| defense-ring\|TH7 | 54 | 31 | 57.4% | 0 | 27.6s | 63.4% | 42.4% |
| southern-funnel\|TH7 | 54 | 28 | 51.9% | 0 | 26.3s | 56.0% | 48.1% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 28.0s | 60.4% | 39.4% |
| echelon-right\|TH7 | 45 | 27 | 60.0% | 0 | 29.0s | 62.7% | 38.3% |
| corner-keep\|TH7 | 36 | 16 | 44.4% | 0 | 26.6s | 53.7% | 54.3% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.5s | 73.5% | 0.0% |
| maxed | 1037 | 37 | 3.6% | 0 | 20.7s | 21.5% | 92.2% |
| mid | 1011 | 856 | 84.7% | 0 | 31.3s | 66.0% | 11.1% |
| rushed-defense | 999 | 66 | 6.6% | 0 | 20.2s | 33.3% | 87.1% |
| mixed | 901 | 808 | 89.7% | 0 | 27.6s | 70.3% | 8.3% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1485 | 57.1% | 0 | 22.6s | 43.4% | 37.4% |
| pure-unit-matrix | 2398 | 1334 | 55.6% | 0 | 28.9s | 62.4% | 43.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 487 | 54.7% | 0 | 26.6s | 60.7% | 44.7% |
| policy-exploration\|TH5 | 869 | 496 | 57.1% | 0 | 22.0s | 36.4% | 34.0% |
| policy-exploration\|TH6 | 869 | 496 | 57.1% | 0 | 22.8s | 43.9% | 38.7% |
| policy-exploration\|TH7 | 864 | 493 | 57.1% | 0 | 23.2s | 49.3% | 39.5% |
| pure-unit-matrix\|TH6 | 800 | 459 | 57.4% | 0 | 29.6s | 62.1% | 41.8% |
| pure-unit-matrix\|TH5 | 707 | 388 | 54.9% | 0 | 31.0s | 65.2% | 43.4% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1740 | 1016 | 58.4% | 0 | 23.0s | 45.0% | 35.9% |
| policy-exploration\|fire_dragon | 1465 | 852 | 58.2% | 0 | 20.6s | 41.5% | 36.0% |
| policy-exploration\|archer | 1449 | 825 | 56.9% | 0 | 22.3s | 42.4% | 37.3% |
| policy-exploration\|mage | 1395 | 773 | 55.4% | 0 | 21.3s | 42.4% | 38.8% |
| policy-exploration\|demon_king | 1366 | 803 | 58.8% | 0 | 22.9s | 45.8% | 35.2% |
| policy-exploration\|mimic | 1333 | 796 | 59.7% | 0 | 23.3s | 43.0% | 34.1% |
| policy-exploration\|pea_shooter | 863 | 473 | 54.8% | 0 | 21.4s | 40.0% | 38.9% |
| policy-exploration\|mechanical_dragon | 691 | 385 | 55.7% | 0 | 21.0s | 42.3% | 39.5% |
| pure-unit-matrix\|archer | 300 | 156 | 52.0% | 0 | 35.2s | 59.2% | 48.0% |
| pure-unit-matrix\|demon_king | 300 | 189 | 63.0% | 0 | 28.8s | 69.3% | 34.7% |
| pure-unit-matrix\|fire_dragon | 300 | 185 | 61.7% | 0 | 20.5s | 67.5% | 38.1% |
| pure-unit-matrix\|knight | 300 | 172 | 57.3% | 0 | 33.0s | 63.2% | 40.7% |
| pure-unit-matrix\|mage | 300 | 139 | 46.3% | 0 | 24.5s | 56.1% | 53.3% |
| pure-unit-matrix\|mimic | 300 | 173 | 57.7% | 0 | 34.0s | 62.6% | 40.6% |
| pure-unit-matrix\|pea_shooter | 300 | 155 | 51.7% | 0 | 28.1s | 60.1% | 47.1% |
| policy-exploration\|necromancer | 225 | 127 | 56.4% | 0 | 23.9s | 46.9% | 40.7% |
| pure-unit-matrix\|mechanical_dragon | 199 | 116 | 58.3% | 0 | 25.0s | 65.6% | 41.6% |
| pure-unit-matrix\|necromancer | 99 | 49 | 49.5% | 0 | 31.0s | 53.5% | 49.8% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 663 | 383 | 57.8% | 0 | 22.3s | 37.6% | 33.1% |
| policy-exploration\|fire_dragon\|TH5 | 568 | 330 | 58.1% | 0 | 20.2s | 35.5% | 33.4% |
| policy-exploration\|archer\|TH5 | 567 | 325 | 57.3% | 0 | 21.5s | 34.5% | 33.8% |
| policy-exploration\|knight\|TH6 | 552 | 331 | 60.0% | 0 | 23.0s | 45.0% | 35.6% |
| policy-exploration\|mage\|TH5 | 531 | 293 | 55.2% | 0 | 20.7s | 35.5% | 36.1% |
| policy-exploration\|knight\|TH7 | 525 | 302 | 57.5% | 0 | 24.0s | 53.4% | 39.7% |
| policy-exploration\|demon_king\|TH5 | 513 | 298 | 58.1% | 0 | 22.0s | 36.9% | 31.9% |
| policy-exploration\|mimic\|TH5 | 513 | 305 | 59.5% | 0 | 22.9s | 36.1% | 31.0% |
| policy-exploration\|fire_dragon\|TH6 | 500 | 289 | 57.8% | 0 | 21.1s | 44.2% | 37.7% |
| policy-exploration\|mage\|TH6 | 469 | 256 | 54.6% | 0 | 21.6s | 41.9% | 40.3% |
| policy-exploration\|archer\|TH6 | 442 | 247 | 55.9% | 0 | 22.6s | 43.8% | 39.4% |
| policy-exploration\|mimic\|TH6 | 442 | 271 | 61.3% | 0 | 23.2s | 44.4% | 34.2% |
| policy-exploration\|archer\|TH7 | 440 | 253 | 57.5% | 0 | 23.2s | 50.3% | 39.7% |
| policy-exploration\|demon_king\|TH6 | 433 | 262 | 60.5% | 0 | 22.9s | 45.3% | 34.7% |
| policy-exploration\|demon_king\|TH7 | 420 | 243 | 57.9% | 0 | 23.9s | 55.9% | 39.7% |
| policy-exploration\|fire_dragon\|TH7 | 397 | 233 | 58.7% | 0 | 20.5s | 46.1% | 37.7% |
| policy-exploration\|mage\|TH7 | 395 | 224 | 56.7% | 0 | 22.0s | 51.5% | 40.6% |
| policy-exploration\|mimic\|TH7 | 378 | 220 | 58.2% | 0 | 23.8s | 49.9% | 38.1% |
| policy-exploration\|mechanical_dragon\|TH6 | 375 | 206 | 54.9% | 0 | 21.9s | 43.0% | 40.1% |
| policy-exploration\|pea_shooter\|TH5 | 327 | 179 | 54.7% | 0 | 21.0s | 34.6% | 35.7% |
| policy-exploration\|mechanical_dragon\|TH7 | 316 | 179 | 56.6% | 0 | 20.0s | 41.5% | 38.7% |
| policy-exploration\|pea_shooter\|TH6 | 297 | 162 | 54.5% | 0 | 22.2s | 42.7% | 40.6% |
| policy-exploration\|pea_shooter\|TH7 | 239 | 132 | 55.2% | 0 | 21.0s | 43.6% | 41.1% |
| policy-exploration\|necromancer\|TH7 | 225 | 127 | 56.4% | 0 | 23.9s | 46.9% | 40.7% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 55 | 54.5% | 0 | 35.8s | 61.3% | 44.6% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.9s | 55.5% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 29.7s | 70.1% | 32.3% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.8s | 63.2% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 32.5s | 64.7% | 38.6% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.1s | 52.9% | 52.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.8s | 64.7% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 66 | 66.0% | 0 | 34.6s | 69.8% | 31.5% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 51 | 51.0% | 0 | 29.1s | 56.2% | 48.4% |
| pure-unit-matrix\|archer\|TH7 | 99 | 55 | 55.6% | 0 | 31.3s | 60.3% | 44.4% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 59 | 59.6% | 0 | 26.0s | 64.9% | 39.6% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 60 | 60.6% | 0 | 18.5s | 68.0% | 39.4% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 29.2s | 61.2% | 41.8% |
| pure-unit-matrix\|mage\|TH7 | 99 | 47 | 47.5% | 0 | 23.3s | 56.6% | 52.2% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 23.1s | 66.5% | 40.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 52 | 52.5% | 0 | 31.6s | 57.1% | 45.7% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 49 | 49.5% | 0 | 31.0s | 53.5% | 49.8% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 49 | 49.5% | 0 | 25.8s | 58.5% | 49.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1334 | 55.6% | 0 | 28.9s | 62.4% | 43.4% |
| policy-exploration\|cannon-focus | 456 | 263 | 57.7% | 0 | 27.3s | 65.0% | 40.7% |
| policy-exploration\|none | 423 | 251 | 59.3% | 0 | 27.2s | 64.7% | 39.7% |
| policy-exploration\|cannon-rally | 418 | 235 | 56.2% | 0 | 14.9s | 6.5% | 30.1% |
| policy-exploration\|rally-core | 404 | 220 | 54.5% | 0 | 15.3s | 5.7% | 30.9% |
| policy-exploration\|medkit-entry | 246 | 143 | 58.1% | 0 | 25.8s | 62.3% | 41.5% |
| policy-exploration\|cannon-medkit | 192 | 107 | 55.7% | 0 | 27.9s | 58.9% | 43.8% |
| policy-exploration\|rally-rage | 104 | 61 | 58.7% | 0 | 13.3s | 9.5% | 32.7% |
| policy-exploration\|freeze-defense | 99 | 57 | 57.6% | 0 | 26.1s | 64.2% | 40.7% |
| policy-exploration\|freeze-rage | 92 | 57 | 62.0% | 0 | 23.4s | 68.4% | 37.0% |
| policy-exploration\|freeze-barrel | 64 | 36 | 56.3% | 0 | 29.4s | 61.3% | 42.9% |
| policy-exploration\|rage-entry | 52 | 26 | 50.0% | 0 | 27.6s | 58.1% | 48.5% |
| policy-exploration\|skeleton-barrel | 52 | 29 | 55.8% | 0 | 26.8s | 60.2% | 42.8% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 282 | 175 | 62.1% | 0 | 23.5s | 44.5% | 34.6% |
| policy-exploration\|left-flank | 272 | 184 | 67.6% | 0 | 23.5s | 41.5% | 25.7% |
| policy-exploration\|center-column | 270 | 150 | 55.6% | 0 | 23.1s | 38.4% | 39.3% |
| policy-exploration\|three-lane | 262 | 149 | 56.9% | 0 | 21.7s | 42.8% | 38.6% |
| policy-exploration\|dual-flank | 259 | 144 | 55.6% | 0 | 23.0s | 49.2% | 38.8% |
| policy-exploration\|wide-line | 259 | 139 | 53.7% | 0 | 21.6s | 45.5% | 41.2% |
| policy-exploration\|edge-sweep | 257 | 147 | 57.2% | 0 | 23.1s | 48.2% | 36.9% |
| policy-exploration\|diamond | 252 | 137 | 54.4% | 0 | 21.6s | 42.0% | 41.0% |
| policy-exploration\|vanguard-wedge | 247 | 129 | 52.2% | 0 | 22.3s | 41.8% | 42.1% |
| policy-exploration\|right-flank | 242 | 131 | 54.1% | 0 | 22.8s | 40.2% | 37.0% |
| pure-unit-matrix\|center-column | 240 | 128 | 53.3% | 0 | 29.1s | 60.3% | 46.2% |
| pure-unit-matrix\|diamond | 240 | 132 | 55.0% | 0 | 28.9s | 62.9% | 43.9% |
| pure-unit-matrix\|dual-flank | 240 | 130 | 54.2% | 0 | 28.3s | 64.0% | 45.4% |
| pure-unit-matrix\|inverted-wedge | 240 | 137 | 57.1% | 0 | 30.2s | 61.7% | 42.1% |
| pure-unit-matrix\|left-flank | 240 | 143 | 59.6% | 0 | 29.0s | 61.6% | 38.5% |
| pure-unit-matrix\|right-flank | 240 | 143 | 59.6% | 0 | 32.1s | 62.5% | 37.8% |
| pure-unit-matrix\|three-lane | 240 | 134 | 55.8% | 0 | 27.8s | 64.6% | 43.3% |
| pure-unit-matrix\|vanguard-wedge | 240 | 126 | 52.5% | 0 | 28.4s | 58.6% | 46.5% |
| pure-unit-matrix\|wide-line | 240 | 128 | 53.3% | 0 | 27.2s | 63.7% | 46.2% |
| pure-unit-matrix\|edge-sweep | 238 | 133 | 55.9% | 0 | 27.9s | 64.6% | 43.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 302 | 56.9% | 0 | 22.2s | 43.4% | 38.4% |
| policy-exploration\|burst | 528 | 314 | 59.5% | 0 | 22.7s | 43.9% | 34.1% |
| policy-exploration\|drip | 521 | 298 | 57.2% | 0 | 22.4s | 42.4% | 37.7% |
| policy-exploration\|two-waves | 518 | 276 | 53.3% | 0 | 22.9s | 41.6% | 40.0% |
| policy-exploration\|three-waves | 504 | 295 | 58.5% | 0 | 23.0s | 45.9% | 36.9% |
| pure-unit-matrix\|burst | 480 | 260 | 54.2% | 0 | 27.5s | 61.8% | 44.8% |
| pure-unit-matrix\|rapid | 480 | 287 | 59.8% | 0 | 29.4s | 64.6% | 39.2% |
| pure-unit-matrix\|three-waves | 480 | 271 | 56.5% | 0 | 29.4s | 63.1% | 41.9% |
| pure-unit-matrix\|two-waves | 480 | 248 | 51.7% | 0 | 28.2s | 60.4% | 47.6% |
| pure-unit-matrix\|drip | 478 | 268 | 56.1% | 0 | 30.0s | 62.3% | 43.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 758 | 58.3% | 0 | 22.1s | 44.3% | 36.2% |
| policy-exploration\|tank-front-support-rear | 1301 | 727 | 55.9% | 0 | 23.1s | 42.5% | 38.7% |
| pure-unit-matrix\|roster-order | 1199 | 684 | 57.0% | 0 | 28.6s | 63.0% | 42.0% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 650 | 54.2% | 0 | 29.2s | 61.9% | 44.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 427 | 252 | 59.0% | 0 | 31.4s | 59.1% | 38.0% |
| pure-fire_dragon | 408 | 248 | 60.8% | 0 | 19.3s | 58.0% | 37.1% |
| pure-archer | 398 | 191 | 48.0% | 0 | 33.4s | 54.9% | 50.6% |
| pure-mimic | 398 | 248 | 62.3% | 0 | 31.4s | 54.8% | 34.9% |
| pure-pea_shooter | 393 | 195 | 49.6% | 0 | 26.7s | 55.7% | 48.8% |
| pure-mage | 392 | 176 | 44.9% | 0 | 23.4s | 51.6% | 53.6% |
| pure-demon_king | 383 | 247 | 64.5% | 0 | 28.2s | 67.0% | 32.4% |
| pure-mechanical_dragon | 282 | 165 | 58.5% | 0 | 24.2s | 63.3% | 40.4% |
| random-3 | 134 | 72 | 53.7% | 0 | 22.1s | 42.1% | 37.4% |
| pure-necromancer | 131 | 66 | 50.4% | 0 | 31.4s | 54.1% | 48.9% |
| random-2 | 130 | 73 | 56.2% | 0 | 21.2s | 38.5% | 36.2% |
| melee-pressure | 125 | 76 | 60.8% | 0 | 28.9s | 52.9% | 31.8% |
| frontline-ranged | 124 | 72 | 58.1% | 0 | 19.5s | 38.2% | 37.9% |
| core-fire_dragon-filled | 114 | 74 | 64.9% | 0 | 17.6s | 40.4% | 31.1% |
| balanced | 110 | 69 | 62.7% | 0 | 21.5s | 49.3% | 34.2% |
| support-mix | 107 | 58 | 54.2% | 0 | 26.0s | 48.2% | 43.9% |
| random-6 | 101 | 63 | 62.4% | 0 | 23.4s | 52.3% | 34.7% |
| core-mage-filled | 98 | 41 | 41.8% | 0 | 22.3s | 48.5% | 53.9% |
| hero-necro-dragon-mages | 94 | 60 | 63.8% | 0 | 21.8s | 55.0% | 33.4% |
| random-5 | 94 | 54 | 57.4% | 0 | 23.3s | 49.9% | 36.5% |
| random-4 | 91 | 47 | 51.6% | 0 | 20.7s | 42.4% | 41.5% |
| ranged-pressure | 87 | 47 | 54.0% | 0 | 17.6s | 28.2% | 40.3% |
| trap-runner-mix | 87 | 52 | 59.8% | 0 | 23.8s | 46.2% | 30.9% |
| core-mimic-filled | 86 | 60 | 69.8% | 0 | 30.9s | 52.1% | 26.3% |
| random-1 | 86 | 49 | 57.0% | 0 | 18.8s | 23.4% | 31.7% |
| air-pressure | 68 | 39 | 57.4% | 0 | 16.7s | 27.9% | 38.6% |
| core-mechanical_dragon-filled | 52 | 25 | 48.1% | 0 | 21.0s | 31.2% | 42.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__burst__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 22.9s | 45.0% | 48.8% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 30 | 52.6% | 0 | 25.1s | 57.9% | 45.0% |
| three-lane__rapid__tank-front-support-rear | 57 | 37 | 64.9% | 0 | 29.5s | 69.9% | 35.1% |
| wide-line__drip__tank-front-support-rear | 57 | 32 | 56.1% | 0 | 23.9s | 50.5% | 42.9% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 29.3s | 57.1% | 45.5% |
| inverted-wedge__burst__roster-order | 56 | 39 | 69.6% | 0 | 27.2s | 61.3% | 28.2% |
| inverted-wedge__rapid__roster-order | 56 | 34 | 60.7% | 0 | 26.9s | 48.6% | 37.7% |
| inverted-wedge__two-waves__tank-front-support-rear | 56 | 25 | 44.6% | 0 | 26.9s | 45.2% | 50.1% |
| left-flank__drip__tank-front-support-rear | 56 | 40 | 71.4% | 0 | 26.3s | 54.6% | 27.0% |
| left-flank__three-waves__roster-order | 56 | 34 | 60.7% | 0 | 24.0s | 47.2% | 34.9% |
| left-flank__two-waves__roster-order | 56 | 31 | 55.4% | 0 | 21.5s | 32.8% | 34.5% |
| right-flank__burst__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 29.6s | 53.8% | 44.0% |
| right-flank__drip__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 24.6s | 40.4% | 37.0% |
| vanguard-wedge__burst__roster-order | 56 | 28 | 50.0% | 0 | 26.6s | 53.9% | 45.5% |
| vanguard-wedge__two-waves__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 27.0s | 56.2% | 44.6% |
| center-column__three-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.6s | 46.0% | 46.0% |
| center-column__two-waves__roster-order | 55 | 29 | 52.7% | 0 | 26.7s | 47.5% | 44.0% |
| diamond__burst__roster-order | 55 | 30 | 54.5% | 0 | 22.6s | 50.3% | 40.5% |
| dual-flank__rapid__roster-order | 55 | 31 | 56.4% | 0 | 21.8s | 49.2% | 40.0% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 26.7s | 63.5% | 41.2% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 24.8s | 49.9% | 40.1% |
| left-flank__three-waves__tank-front-support-rear | 55 | 39 | 70.9% | 0 | 28.3s | 61.0% | 25.5% |
| left-flank__two-waves__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 26.2s | 48.8% | 28.8% |
| three-lane__drip__roster-order | 55 | 29 | 52.7% | 0 | 27.2s | 63.4% | 47.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 25.5s | 50.9% | 45.6% |
| wide-line__rapid__roster-order | 55 | 26 | 47.3% | 0 | 22.3s | 44.7% | 51.0% |
| center-column__two-waves__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 23.0s | 37.4% | 48.2% |
| three-lane__drip__tank-front-support-rear | 54 | 26 | 48.1% | 0 | 25.1s | 45.4% | 44.2% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.3s | 52.8% | 48.0% |
| wide-line__rapid__tank-front-support-rear | 54 | 32 | 59.3% | 0 | 24.6s | 55.9% | 36.9% |
| center-column__drip__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.5s | 45.8% | 46.5% |
| center-column__rapid__roster-order | 51 | 27 | 52.9% | 0 | 24.1s | 56.9% | 45.6% |
| diamond__drip__roster-order | 51 | 26 | 51.0% | 0 | 25.0s | 55.0% | 47.6% |
| diamond__rapid__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 24.7s | 44.0% | 37.0% |
| dual-flank__burst__roster-order | 51 | 32 | 62.7% | 0 | 27.5s | 67.3% | 36.8% |
| edge-sweep__three-waves__roster-order | 51 | 33 | 64.7% | 0 | 25.8s | 62.2% | 35.1% |
| inverted-wedge__two-waves__roster-order | 51 | 34 | 66.7% | 0 | 30.2s | 67.0% | 33.0% |
| three-lane__burst__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 20.5s | 40.1% | 38.5% |
| three-lane__rapid__roster-order | 51 | 33 | 64.7% | 0 | 20.6s | 44.9% | 32.7% |
| wide-line__three-waves__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 25.4s | 62.9% | 50.1% |
| center-column__burst__roster-order | 50 | 27 | 54.0% | 0 | 26.2s | 51.2% | 39.5% |
| center-column__drip__roster-order | 50 | 25 | 50.0% | 0 | 31.1s | 59.7% | 49.3% |
| center-column__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.6s | 46.1% | 36.0% |
| diamond__burst__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 23.4s | 53.2% | 32.0% |
| diamond__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.8s | 60.7% | 38.3% |
| diamond__three-waves__roster-order | 50 | 27 | 54.0% | 0 | 26.9s | 61.0% | 43.0% |
| diamond__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 21.6s | 40.1% | 43.3% |
| dual-flank__drip__roster-order | 50 | 36 | 72.0% | 0 | 31.5s | 65.9% | 27.8% |
| dual-flank__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 25.9s | 54.0% | 43.6% |
| dual-flank__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 24.3s | 52.8% | 32.5% |
| edge-sweep__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 26.9s | 55.0% | 37.4% |
| edge-sweep__rapid__roster-order | 50 | 30 | 60.0% | 0 | 23.9s | 56.2% | 38.4% |
| inverted-wedge__three-waves__roster-order | 50 | 31 | 62.0% | 0 | 27.9s | 57.3% | 35.7% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 22.2s | 34.1% | 34.6% |
| left-flank__burst__roster-order | 50 | 30 | 60.0% | 0 | 25.6s | 51.9% | 30.5% |
| left-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 23.0s | 42.8% | 35.8% |
| right-flank__burst__roster-order | 50 | 27 | 54.0% | 0 | 26.1s | 47.4% | 40.8% |
| right-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 25.5s | 47.8% | 32.1% |
| right-flank__three-waves__roster-order | 50 | 26 | 52.0% | 0 | 24.6s | 54.1% | 42.5% |
| three-lane__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 25.4s | 58.7% | 28.2% |
| three-lane__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 22.0s | 52.8% | 43.5% |
| vanguard-wedge__rapid__roster-order | 50 | 34 | 68.0% | 0 | 26.3s | 53.3% | 29.9% |
| vanguard-wedge__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 22.3s | 46.8% | 38.2% |
| wide-line__two-waves__roster-order | 50 | 24 | 48.0% | 0 | 22.4s | 45.9% | 42.4% |
| center-column__three-waves__roster-order | 49 | 34 | 69.4% | 0 | 28.0s | 63.1% | 29.2% |
| dual-flank__drip__tank-front-support-rear | 49 | 20 | 40.8% | 0 | 25.2s | 56.0% | 59.1% |
| dual-flank__two-waves__roster-order | 49 | 22 | 44.9% | 0 | 23.8s | 57.9% | 54.6% |
| edge-sweep__drip__roster-order | 49 | 33 | 67.3% | 0 | 25.7s | 48.6% | 27.2% |
| edge-sweep__rapid__tank-front-support-rear | 49 | 30 | 61.2% | 0 | 26.6s | 60.5% | 37.1% |
| inverted-wedge__drip__roster-order | 49 | 29 | 59.2% | 0 | 26.3s | 47.6% | 38.4% |
| right-flank__rapid__roster-order | 49 | 32 | 65.3% | 0 | 25.8s | 56.3% | 33.7% |
| right-flank__three-waves__tank-front-support-rear | 49 | 33 | 67.3% | 0 | 28.0s | 46.3% | 30.0% |
| wide-line__burst__roster-order | 49 | 30 | 61.2% | 0 | 20.7s | 49.1% | 36.7% |
| wide-line__two-waves__tank-front-support-rear | 49 | 22 | 44.9% | 0 | 25.8s | 51.4% | 54.1% |
| center-column__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 21.2s | 33.4% | 39.4% |
| diamond__rapid__roster-order | 45 | 20 | 44.4% | 0 | 28.9s | 58.3% | 53.1% |
| diamond__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 28.7s | 56.9% | 40.1% |
| diamond__two-waves__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 22.8s | 43.2% | 51.0% |
| edge-sweep__burst__roster-order | 45 | 29 | 64.4% | 0 | 24.6s | 63.1% | 34.3% |
| left-flank__burst__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 31.9s | 62.6% | 34.4% |
| left-flank__rapid__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 28.2s | 48.8% | 45.1% |
| three-lane__burst__roster-order | 45 | 26 | 57.8% | 0 | 22.7s | 45.2% | 35.0% |
| three-lane__two-waves__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 25.5s | 52.2% | 49.5% |
| wide-line__drip__roster-order | 45 | 26 | 57.8% | 0 | 25.8s | 66.2% | 42.2% |
| wide-line__three-waves__roster-order | 45 | 28 | 62.2% | 0 | 26.5s | 58.8% | 37.8% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 25.2s | 48.4% | 41.5% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 28.5s | 69.7% | 34.1% |
| edge-sweep__burst__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 21.1s | 41.4% | 46.2% |
| edge-sweep__two-waves__roster-order | 44 | 19 | 43.2% | 0 | 23.9s | 57.5% | 55.2% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 26.3s | 47.9% | 41.2% |
| left-flank__rapid__roster-order | 44 | 33 | 75.0% | 0 | 27.0s | 62.5% | 21.6% |
| right-flank__two-waves__roster-order | 44 | 22 | 50.0% | 0 | 29.8s | 54.5% | 41.2% |
| three-lane__three-waves__tank-front-support-rear | 44 | 19 | 43.2% | 0 | 27.1s | 57.4% | 56.5% |
| vanguard-wedge__drip__roster-order | 44 | 23 | 52.3% | 0 | 22.7s | 36.4% | 39.3% |
| vanguard-wedge__three-waves__roster-order | 44 | 16 | 36.4% | 0 | 24.6s | 45.5% | 62.7% |
| wide-line__burst__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 26.6s | 60.3% | 41.2% |
| right-flank__rapid__tank-front-support-rear | 39 | 25 | 64.1% | 0 | 30.9s | 62.2% | 32.6% |
| right-flank__two-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 31.4s | 55.6% | 38.7% |
| vanguard-wedge__drip__tank-front-support-rear | 39 | 19 | 48.7% | 0 | 25.5s | 47.6% | 48.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 26.9s | 54.3% | 41.9% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 522 | 312 | 59.8% | 0 | 26.6s | 52.4% | 38.0% |
| left-flank | 512 | 327 | 63.9% | 0 | 26.1s | 50.9% | 31.7% |
| center-column | 510 | 278 | 54.5% | 0 | 25.9s | 48.7% | 42.5% |
| three-lane | 502 | 283 | 56.4% | 0 | 24.6s | 53.3% | 40.8% |
| dual-flank | 499 | 274 | 54.9% | 0 | 25.6s | 56.3% | 42.0% |
| wide-line | 499 | 267 | 53.5% | 0 | 24.3s | 54.2% | 43.6% |
| edge-sweep | 495 | 280 | 56.6% | 0 | 25.4s | 56.1% | 40.1% |
| diamond | 492 | 269 | 54.7% | 0 | 25.2s | 52.2% | 42.4% |
| vanguard-wedge | 487 | 255 | 52.4% | 0 | 25.3s | 50.1% | 44.3% |
| right-flank | 482 | 274 | 56.8% | 0 | 27.4s | 51.4% | 37.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 589 | 58.3% | 0 | 25.6s | 53.5% | 38.8% |
| burst | 1008 | 574 | 56.9% | 0 | 25.0s | 52.4% | 39.2% |
| drip | 999 | 566 | 56.7% | 0 | 26.0s | 51.9% | 40.3% |
| two-waves | 998 | 524 | 52.5% | 0 | 25.5s | 50.6% | 43.6% |
| three-waves | 984 | 566 | 57.5% | 0 | 26.1s | 54.3% | 39.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1442 | 57.7% | 0 | 25.2s | 53.3% | 39.0% |
| tank-front-support-rear | 2500 | 1377 | 55.1% | 0 | 26.0s | 51.8% | 41.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2821 | 1585 | 56.2% | 0 | 28.6s | 62.8% | 42.8% |
| cannon-focus | 456 | 263 | 57.7% | 0 | 27.3s | 65.0% | 40.7% |
| cannon-rally | 418 | 235 | 56.2% | 0 | 14.9s | 6.5% | 30.1% |
| rally-core | 404 | 220 | 54.5% | 0 | 15.3s | 5.7% | 30.9% |
| medkit-entry | 246 | 143 | 58.1% | 0 | 25.8s | 62.3% | 41.5% |
| cannon-medkit | 192 | 107 | 55.7% | 0 | 27.9s | 58.9% | 43.8% |
| rally-rage | 104 | 61 | 58.7% | 0 | 13.3s | 9.5% | 32.7% |
| freeze-defense | 99 | 57 | 57.6% | 0 | 26.1s | 64.2% | 40.7% |
| freeze-rage | 92 | 57 | 62.0% | 0 | 23.4s | 68.4% | 37.0% |
| freeze-barrel | 64 | 36 | 56.3% | 0 | 29.4s | 61.3% | 42.9% |
| rage-entry | 52 | 26 | 50.0% | 0 | 27.6s | 58.1% | 48.5% |
| skeleton-barrel | 52 | 29 | 55.8% | 0 | 26.8s | 60.2% | 42.8% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1327 | 788 | 59.4% | 0 | 23.2s | 54.5% | 36.8% |
| epic | 714 | 439 | 61.5% | 0 | 21.5s | 43.7% | 33.3% |
| legendary | 711 | 417 | 58.6% | 0 | 21.0s | 45.3% | 34.5% |
| unrevealed | 679 | 385 | 56.7% | 0 | 22.3s | 42.3% | 37.7% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 672 | 396 | 58.9% | 0 | 20.5s | 52.0% | 37.8% |
| demon_king\|common | 655 | 392 | 59.8% | 0 | 26.0s | 57.1% | 35.7% |
| fire_dragon\|legendary | 379 | 222 | 58.6% | 0 | 20.5s | 44.3% | 34.3% |
| fire_dragon\|epic | 369 | 226 | 61.2% | 0 | 20.6s | 43.6% | 34.0% |
| demon_king\|epic | 345 | 213 | 61.7% | 0 | 22.4s | 43.8% | 32.5% |
| fire_dragon\|unrevealed | 345 | 193 | 55.9% | 0 | 20.9s | 38.4% | 38.4% |
| demon_king\|unrevealed | 334 | 192 | 57.5% | 0 | 23.8s | 46.2% | 37.0% |
| demon_king\|legendary | 332 | 195 | 58.7% | 0 | 21.6s | 46.4% | 34.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1717 | 56.6% | 0 | 27.6s | 58.7% | 41.4% |
| ward-1 | 767 | 446 | 58.1% | 0 | 22.8s | 44.3% | 36.6% |
| ward-2 | 601 | 338 | 56.2% | 0 | 23.0s | 43.7% | 39.0% |
| ward-3 | 600 | 318 | 53.0% | 0 | 21.9s | 41.1% | 40.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2819 | 56.4% | 0 | 25.6s | 52.6% | 40.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2040 | 1188 | 58.2% | 0 | 24.5s | 47.7% | 36.6% |
| fire_dragon | 1765 | 1037 | 58.8% | 0 | 20.6s | 45.9% | 36.4% |
| archer | 1749 | 981 | 56.1% | 0 | 24.5s | 45.3% | 39.1% |
| mage | 1695 | 912 | 53.8% | 0 | 21.9s | 44.9% | 41.4% |
| demon_king | 1666 | 992 | 59.5% | 0 | 23.9s | 50.0% | 35.1% |
| mimic | 1633 | 969 | 59.3% | 0 | 25.2s | 46.6% | 35.3% |
| pea_shooter | 1163 | 628 | 54.0% | 0 | 23.1s | 45.2% | 41.0% |
| mechanical_dragon | 890 | 501 | 56.3% | 0 | 21.9s | 47.5% | 39.9% |
| necromancer | 324 | 176 | 54.3% | 0 | 26.0s | 48.9% | 43.5% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 52.0% | 46.4%-57.6% | 59.2% | 48.0% | 28.3% |
| demon_king | 300 | 63.0% | 57.4%-68.3% | 69.3% | 34.7% | 52.8% |
| fire_dragon | 300 | 61.7% | 56.1%-67.0% | 67.5% | 38.1% | 52.5% |
| knight | 300 | 57.3% | 51.7%-62.8% | 63.2% | 40.7% | 38.5% |
| mage | 300 | 46.3% | 40.8%-52.0% | 56.1% | 53.3% | 27.6% |
| mechanical_dragon | 199 | 58.3% | 51.3%-64.9% | 65.6% | 41.6% | 45.1% |
| mimic | 300 | 57.7% | 52.0%-63.1% | 62.6% | 40.6% | 50.0% |
| necromancer | 99 | 49.5% | 39.9%-59.2% | 53.5% | 49.8% | 38.7% |
| pea_shooter | 300 | 51.7% | 46.0%-57.3% | 60.1% | 47.1% | 33.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.5% | 50.0% | 23.6% |
| archer\|TH7 | 99 | 55.6% | 45.7%-65.0% | 60.3% | 44.4% | 31.6% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 32.3% | 55.0% |
| demon_king\|TH7 | 99 | 59.6% | 49.7%-68.7% | 64.9% | 39.6% | 50.8% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.2% | 38.6% | 51.2% |
| fire_dragon\|TH7 | 99 | 60.6% | 50.8%-69.7% | 68.0% | 39.4% | 55.8% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.7% | 38.6% | 40.7% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 61.2% | 41.8% | 38.9% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 52.9% | 52.0% | 24.0% |
| mage\|TH7 | 99 | 47.5% | 37.9%-57.2% | 56.6% | 52.2% | 29.6% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 64.7% | 42.9% | 42.2% |
| mechanical_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 66.5% | 40.2% | 48.0% |
| mimic\|TH5 | 101 | 54.5% | 44.8%-63.8% | 61.3% | 44.6% | 44.0% |
| mimic\|TH6 | 100 | 66.0% | 56.3%-74.5% | 69.8% | 31.5% | 60.3% |
| mimic\|TH7 | 99 | 52.5% | 42.8%-62.1% | 57.1% | 45.7% | 45.7% |
| necromancer\|TH7 | 99 | 49.5% | 39.9%-59.2% | 53.5% | 49.8% | 38.7% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 51.0% | 41.3%-60.6% | 56.2% | 48.4% | 31.4% |
| pea_shooter\|TH7 | 99 | 49.5% | 39.9%-59.2% | 58.5% | 49.7% | 33.2% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.3% | 50.0% | 28.4% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.3% | 50.0% | 33.2% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 56.8% | 40.0% | 34.2% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 61.2% | 61.1% | 23.5% |
| archer\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 65.4% | 40.0% | 28.7% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.2% | 53.3% | 24.9% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 67.6% | 39.0% | 28.5% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.4% | 53.2% | 25.6% |
| archer\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 48.6% | 53.3% | 25.5% |
| archer\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 50.7% | 46.7% | 28.7% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 50.5% | 53.3% | 26.5% |
| archer\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 60.4% | 50.0% | 22.2% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 55.5% | 60.0% | 27.6% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.9% | 55.6% | 22.6% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 57.8% | 49.9% | 25.8% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 62.9% | 38.9% | 35.2% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.4% | 38.9% | 36.2% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 63.6% | 33.3% | 30.7% |
| demon_king\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 68.4% | 50.0% | 42.0% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.2% | 50.0% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 73.4% | 18.2% | 63.0% |
| demon_king\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.8% | 47.6% | 39.5% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 63.2% | 29.1% | 48.1% |
| demon_king\|crossfire | 15 | 66.7% | 41.7%-84.8% | 69.1% | 28.4% | 54.8% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 73.5% | 32.9% | 56.2% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 68.4% | 40.0% | 51.1% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 73.2% | 26.7% | 60.0% |
| demon_king\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 73.0% | 33.6% | 56.3% |
| demon_king\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 77.5% | 20.0% | 59.3% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 67.8% | 47.7% | 38.3% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 68.2% | 38.7% | 54.1% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.2% | 48.6% | 44.4% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 65.3% | 28.9% | 54.9% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.2% | 28.9% | 57.4% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 70.5% | 33.3% | 58.0% |
| demon_king\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 84.1% | 15.7% | 70.4% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.3% | 50.0% | 41.7% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.6% | 50.0% | 43.1% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 70.2% | 33.3% | 65.0% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 58.3% | 50.0% | 41.7% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.4% | 46.7% | 41.7% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 66.8% | 33.3% | 56.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 69.7% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.5% | 38.2% | 56.7% |
| fire_dragon\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 70.2% | 26.7% | 55.0% |
| fire_dragon\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 72.3% | 26.7% | 63.3% |
| fire_dragon\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 77.5% | 26.7% | 65.0% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 65.3% | 50.0% | 43.1% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.3% | 40.0% | 53.3% |
| fire_dragon\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.1% | 55.6% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 62.3% | 38.9% | 48.6% |
| fire_dragon\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.8% | 33.3% | 56.9% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 71.0% | 31.0% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 76.3% | 16.7% | 66.7% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.0% | 49.7% | 32.8% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.3% | 49.6% | 37.5% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 65.2% | 36.6% | 45.9% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.3% | 55.2% | 30.2% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 64.8% | 43.8% | 33.2% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 59.8% | 35.9% | 35.3% |
| knight\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 62.1% | 37.7% | 35.9% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 63.2% | 42.1% | 37.5% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 60.5% | 33.3% | 45.3% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 65.9% | 34.6% | 45.5% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 68.2% | 33.3% | 46.8% |
| knight\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 60.0% | 53.9% | 25.4% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 63.6% | 39.7% | 40.0% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.3% | 52.3% | 30.7% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 60.0% | 33.3% | 40.5% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.3% | 33.3% | 47.7% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 67.0% | 33.2% | 44.2% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.0% | 30.6% | 42.1% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.4% | 58.6% | 26.3% |
| mage\|asymmetric-right | 18 | 33.3% | 16.3%-56.3% | 53.8% | 66.1% | 25.3% |
| mage\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 58.2% | 33.3% | 31.5% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 54.5% | 61.1% | 21.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 56.8% | 52.3% | 26.1% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.5% | 53.3% | 30.3% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 64.2% | 49.7% | 26.3% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 56.6% | 53.3% | 26.7% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.4% | 46.7% | 32.7% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 53.2% | 53.3% | 32.1% |
| mage\|kill-corridor | 15 | 40.0% | 19.8%-64.3% | 49.8% | 60.0% | 24.8% |
| mage\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 54.0% | 55.6% | 20.2% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.0% | 53.3% | 26.1% |
| mage\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.7% | 55.6% | 26.3% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 50.2% | 66.7% | 22.2% |
| mage\|split-core | 18 | 44.4% | 24.6%-66.3% | 56.6% | 55.0% | 30.3% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 58.9% | 44.4% | 35.9% |
| mage\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 68.9% | 37.2% | 34.3% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 62.8% | 49.7% | 36.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 65.0% | 50.0% | 40.9% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 63.7% | 40.0% | 50.9% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 61.4% | 50.0% | 36.4% |
| mechanical_dragon\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 62.8% | 44.4% | 41.4% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 62.7% | 49.6% | 39.1% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 69.4% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 68.3% | 40.0% | 48.2% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 70.0% | 39.7%-89.2% | 71.3% | 30.0% | 58.2% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 60.0% | 50.0% | 40.9% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 67.3% | 40.0% | 49.1% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.9% | 50.0% | 37.1% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 65.6% | 41.0% | 36.4% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 65.8% | 33.3% | 51.5% |
| mechanical_dragon\|trap-lanes | 12 | 66.7% | 39.1%-86.2% | 69.7% | 32.3% | 47.0% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 73.9% | 33.2% | 53.0% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 59.8% | 55.0% | 40.5% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 60.6% | 55.6% | 44.4% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 63.4% | 33.3% | 60.0% |
| mimic\|compact-core | 18 | 38.9% | 20.3%-61.4% | 53.2% | 58.1% | 34.1% |
| mimic\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 61.3% | 26.8% | 54.3% |
| mimic\|crossfire | 15 | 53.3% | 30.1%-75.2% | 60.9% | 45.4% | 47.6% |
| mimic\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.6% | 37.9% | 48.4% |
| mimic\|diamond | 15 | 66.7% | 41.7%-84.8% | 64.3% | 29.9% | 56.2% |
| mimic\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 63.6% | 39.8% | 54.3% |
| mimic\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 63.9% | 33.3% | 55.2% |
| mimic\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 64.5% | 33.3% | 60.0% |
| mimic\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 59.7% | 61.0% | 34.9% |
| mimic\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.6% | 40.0% | 53.3% |
| mimic\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 54.5% | 57.3% | 31.0% |
| mimic\|southern-funnel | 18 | 72.2% | 49.1%-87.5% | 65.0% | 26.8% | 59.5% |
| mimic\|split-core | 18 | 61.1% | 38.6%-79.7% | 62.1% | 35.8% | 52.4% |
| mimic\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 67.4% | 26.6% | 61.9% |
| mimic\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 72.9% | 27.1% | 58.7% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 57.0% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 56.5% | 50.0% | 38.9% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 44.1% | 66.7% | 22.2% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 51.1% | 50.0% | 38.9% |
| necromancer\|layered-rings | 6 | 50.0% | 18.8%-81.2% | 57.0% | 50.0% | 44.4% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 48.4% | 66.7% | 27.8% |
| necromancer\|southern-funnel | 6 | 33.3% | 9.7%-70.0% | 41.4% | 66.7% | 16.7% |
| necromancer\|split-core | 6 | 66.7% | 30.0%-90.3% | 55.9% | 33.3% | 61.1% |
| necromancer\|trap-lanes | 6 | 66.7% | 30.0%-90.3% | 52.7% | 33.3% | 44.4% |
| necromancer\|wide-spread | 6 | 50.0% | 18.8%-81.2% | 59.1% | 50.0% | 38.9% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.2% | 61.1% | 27.8% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.7% | 53.4% | 34.6% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 60.7% | 40.0% | 38.5% |
| pea_shooter\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.1% | 53.0% | 24.7% |
| pea_shooter\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 62.7% | 40.5% | 34.1% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.9% | 53.3% | 29.6% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 64.8% | 46.8% | 30.9% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.5% | 40.0% | 40.7% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.4% | 43.5% | 33.3% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.2% | 37.5% | 41.5% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 60.5% | 46.5% | 37.8% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 57.4% | 63.0% | 20.4% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 58.4% | 46.7% | 34.8% |
| pea_shooter\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 56.8% | 50.0% | 30.9% |
| pea_shooter\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 57.8% | 55.6% | 32.1% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 66.1% | 40.3% | 40.1% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.0% | 38.9% | 38.3% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.2% | 33.3% | 38.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.0% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 97.3% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 97.7% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 0.0% | 96.9% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 96.5% |
| th7-compact-core-272 | 7 | compact-core | maxed | 35 | 0.0% | 95.5% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 95.4% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 93.0% |
| th7-rear-keep-254 | 7 | rear-keep | maxed | 35 | 0.0% | 92.7% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 2.8% | 94.1% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 2.9% | 94.9% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.6% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 97.5% |
| th6-compact-core-271 | 6 | compact-core | maxed | 18 | 0.0% | 95.5% |
| th6-layered-rings-277 | 6 | layered-rings | rushed-defense | 18 | 0.0% | 95.5% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,435 | 6,315.71 | 2,108.75 | 1,578.93 |  |
| necromancer | 7 | 15 | 38,341 | 11,707.41 | 2,556.07 | 780.49 |  |
| archer | 7 | 1 | 2,156 | 748.39 | 2,156 | 748.39 |  |
| fire_dragon | 7 | 10 | 16,189 | 7,228.57 | 1,618.9 | 722.86 |  |
| mechanical_dragon | 7 | 4 | 6,071 | 1,721.36 | 1,517.75 | 430.34 | chain x3 |
| demon_king | 7 | 5 | 19,819 | 2,141.11 | 3,963.8 | 428.22 |  |
| knight | 7 | 1 | 3,846 | 415.56 | 3,846 | 415.56 |  |
| mimic | 7 | 6 | 18,337 | 1,345.28 | 3,056.17 | 224.21 | trap immune |
| horror | 7 | 20 | 40,526 | 4,350 | 2,026.3 | 217.5 |  |
| pea_shooter | 7 | 5 | 12,410 | 873.14 | 2,482 | 174.63 |  |
| wind_mage | 7 | 15 | 22,226 | 2,525.91 | 1,481.73 | 168.39 |  |
| ice_golem | 7 | 10 | 40,452 | 1,565.49 | 4,045.2 | 156.55 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 57.1% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH6 has 57.1% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 57.1% attacker wins across 864 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.1% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-244 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-294 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-058 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-034 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-right-211 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-276 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-292 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-110 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-271 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-104 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-277 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-253 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-287 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-069 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-177 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-120 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-228 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-138 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-246 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-075 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-237 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-024 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-293 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-296 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-042 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-204 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-272 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-153 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-260 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- 205 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
