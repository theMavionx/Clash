# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:44:21.515Z
**Seed:** 83004
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 66
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.9259259259x
**Lab late-tier troop scales:** mimic=1.2342857143x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 137.3s

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
| 5000 | 2836 | 56.7% | 0 | 25.6s | 52.7% | 39.8% | 35.6% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 954 | 54.4% | 0 | 24.8s | 54.0% | 43.8% |
| TH6->TH6 | 1669 | 979 | 58.7% | 0 | 26.1s | 53.3% | 38.6% |
| TH5->TH5 | 1576 | 903 | 57.3% | 0 | 25.9s | 50.3% | 36.6% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 184 | 48.3% | 0 | 24.0s | 48.2% | 48.9% |
| layered-rings | 380 | 174 | 45.8% | 0 | 24.2s | 49.1% | 49.4% |
| asymmetric-right | 376 | 188 | 50.0% | 0 | 25.1s | 52.4% | 46.1% |
| crossfire | 312 | 185 | 59.3% | 0 | 25.4s | 51.1% | 37.4% |
| diamond | 312 | 171 | 54.8% | 0 | 24.4s | 51.7% | 42.1% |
| kill-corridor | 310 | 178 | 57.4% | 0 | 25.9s | 54.3% | 38.4% |
| compact-core | 276 | 113 | 40.9% | 0 | 24.4s | 45.6% | 53.7% |
| split-core | 274 | 180 | 65.7% | 0 | 25.7s | 57.7% | 30.4% |
| trap-lanes | 274 | 183 | 66.8% | 0 | 26.1s | 55.7% | 30.7% |
| wide-spread | 272 | 208 | 76.5% | 0 | 28.2s | 61.3% | 22.5% |
| asymmetric-left | 249 | 121 | 48.6% | 0 | 26.2s | 52.5% | 47.6% |
| southern-funnel | 247 | 139 | 56.3% | 0 | 25.4s | 51.7% | 40.6% |
| defense-ring | 245 | 148 | 60.4% | 0 | 27.3s | 57.2% | 34.7% |
| echelon-left | 233 | 164 | 70.4% | 0 | 27.2s | 54.4% | 28.6% |
| rear-keep | 232 | 114 | 49.1% | 0 | 24.1s | 48.2% | 47.3% |
| corner-keep | 212 | 121 | 57.1% | 0 | 25.9s | 53.1% | 38.1% |
| echelon-right | 208 | 126 | 60.6% | 0 | 25.7s | 53.4% | 34.3% |
| cannon-screen | 207 | 139 | 67.1% | 0 | 27.3s | 54.5% | 32.1% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 82 | 44.1% | 0 | 22.9s | 47.7% | 53.1% |
| resource-shield\|TH7 | 185 | 91 | 49.2% | 0 | 23.8s | 50.3% | 48.0% |
| asymmetric-right\|TH7 | 184 | 97 | 52.7% | 0 | 23.9s | 51.6% | 44.9% |
| kill-corridor\|TH7 | 151 | 87 | 57.6% | 0 | 24.6s | 54.9% | 39.8% |
| crossfire\|TH7 | 149 | 96 | 64.4% | 0 | 24.7s | 55.3% | 33.6% |
| diamond\|TH7 | 149 | 78 | 52.3% | 0 | 23.1s | 50.3% | 46.4% |
| compact-core\|TH6 | 103 | 52 | 50.5% | 0 | 25.9s | 49.9% | 45.7% |
| asymmetric-left\|TH6 | 101 | 55 | 54.5% | 0 | 26.2s | 52.3% | 43.7% |
| layered-rings\|TH6 | 101 | 53 | 52.5% | 0 | 25.1s | 52.0% | 44.7% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 23.3s | 47.2% | 49.0% |
| trap-lanes\|TH6 | 101 | 59 | 58.4% | 0 | 25.1s | 51.4% | 39.3% |
| southern-funnel\|TH6 | 100 | 57 | 57.0% | 0 | 26.9s | 51.0% | 40.8% |
| split-core\|TH6 | 100 | 65 | 65.0% | 0 | 25.8s | 57.4% | 31.7% |
| wide-spread\|TH6 | 99 | 76 | 76.8% | 0 | 28.1s | 63.3% | 21.5% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.2s | 54.6% | 47.3% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 28.3s | 56.5% | 31.9% |
| resource-shield\|TH5 | 95 | 43 | 45.3% | 0 | 25.1s | 44.8% | 50.7% |
| asymmetric-left\|TH5 | 94 | 41 | 43.6% | 0 | 26.1s | 49.2% | 48.3% |
| asymmetric-right\|TH5 | 94 | 42 | 44.7% | 0 | 27.6s | 51.8% | 47.1% |
| corner-keep\|TH5 | 94 | 54 | 57.4% | 0 | 26.1s | 52.0% | 34.1% |
| split-core\|TH5 | 94 | 55 | 58.5% | 0 | 24.5s | 49.8% | 34.3% |
| compact-core\|TH5 | 93 | 43 | 46.2% | 0 | 25.2s | 47.6% | 44.6% |
| defense-ring\|TH5 | 93 | 56 | 60.2% | 0 | 26.4s | 54.5% | 32.8% |
| layered-rings\|TH5 | 93 | 39 | 41.9% | 0 | 25.7s | 48.8% | 47.0% |
| southern-funnel\|TH5 | 93 | 58 | 62.4% | 0 | 22.4s | 51.5% | 32.2% |
| trap-lanes\|TH5 | 93 | 62 | 66.7% | 0 | 25.6s | 52.0% | 28.6% |
| wide-spread\|TH5 | 93 | 75 | 80.6% | 0 | 28.4s | 56.9% | 18.3% |
| diamond\|TH6 | 85 | 50 | 58.8% | 0 | 26.4s | 55.7% | 37.2% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 25.7s | 54.1% | 36.0% |
| cannon-screen\|TH6 | 84 | 57 | 67.9% | 0 | 27.0s | 52.9% | 31.1% |
| crossfire\|TH6 | 84 | 40 | 47.6% | 0 | 24.9s | 45.0% | 47.0% |
| echelon-left\|TH6 | 83 | 56 | 67.5% | 0 | 28.4s | 51.2% | 31.7% |
| corner-keep\|TH6 | 82 | 52 | 63.4% | 0 | 25.5s | 54.5% | 34.6% |
| kill-corridor\|TH6 | 82 | 52 | 63.4% | 0 | 26.8s | 58.1% | 33.6% |
| rear-keep\|TH6 | 82 | 42 | 51.2% | 0 | 25.0s | 51.9% | 44.9% |
| compact-core\|TH7 | 80 | 18 | 22.5% | 0 | 21.5s | 38.4% | 74.7% |
| split-core\|TH7 | 80 | 60 | 75.0% | 0 | 26.8s | 66.5% | 24.3% |
| trap-lanes\|TH7 | 80 | 62 | 77.5% | 0 | 27.8s | 64.8% | 22.2% |
| wide-spread\|TH7 | 80 | 57 | 71.3% | 0 | 28.0s | 63.6% | 28.7% |
| crossfire\|TH5 | 79 | 49 | 62.0% | 0 | 27.2s | 49.1% | 34.3% |
| rear-keep\|TH5 | 79 | 45 | 57.0% | 0 | 24.0s | 48.6% | 39.2% |
| cannon-screen\|TH5 | 78 | 57 | 73.1% | 0 | 29.3s | 53.7% | 26.3% |
| diamond\|TH5 | 78 | 43 | 55.1% | 0 | 24.7s | 50.0% | 39.4% |
| echelon-left\|TH5 | 78 | 54 | 69.2% | 0 | 25.6s | 48.2% | 28.6% |
| echelon-right\|TH5 | 78 | 48 | 61.5% | 0 | 24.7s | 47.3% | 28.9% |
| kill-corridor\|TH5 | 77 | 39 | 50.6% | 0 | 27.3s | 49.1% | 40.6% |
| echelon-left\|TH7 | 72 | 54 | 75.0% | 0 | 27.7s | 64.0% | 25.0% |
| rear-keep\|TH7 | 71 | 27 | 38.0% | 0 | 23.1s | 43.7% | 59.0% |
| asymmetric-left\|TH7 | 54 | 25 | 46.3% | 0 | 26.4s | 57.9% | 53.7% |
| defense-ring\|TH7 | 54 | 30 | 55.6% | 0 | 27.0s | 62.5% | 42.9% |
| southern-funnel\|TH7 | 54 | 24 | 44.4% | 0 | 27.6s | 53.3% | 54.5% |
| cannon-screen\|TH7 | 45 | 25 | 55.6% | 0 | 24.2s | 58.4% | 44.2% |
| echelon-right\|TH7 | 45 | 26 | 57.8% | 0 | 27.3s | 61.6% | 40.2% |
| corner-keep\|TH7 | 36 | 15 | 41.7% | 0 | 26.3s | 53.0% | 56.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.4s | 73.4% | 0.0% |
| maxed | 1037 | 51 | 4.9% | 0 | 21.0s | 21.7% | 91.2% |
| mid | 1011 | 844 | 83.5% | 0 | 30.7s | 65.6% | 12.2% |
| rushed-defense | 999 | 87 | 8.7% | 0 | 20.4s | 34.2% | 84.1% |
| mixed | 901 | 802 | 89.0% | 0 | 27.4s | 70.1% | 8.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1496 | 57.5% | 0 | 22.5s | 43.5% | 37.0% |
| pure-unit-matrix | 2398 | 1340 | 55.9% | 0 | 28.8s | 62.5% | 42.8% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 469 | 52.6% | 0 | 26.5s | 59.4% | 46.5% |
| policy-exploration\|TH5 | 869 | 504 | 58.0% | 0 | 21.7s | 37.1% | 32.6% |
| policy-exploration\|TH6 | 869 | 507 | 58.3% | 0 | 22.8s | 44.5% | 37.3% |
| policy-exploration\|TH7 | 864 | 485 | 56.1% | 0 | 23.0s | 48.4% | 41.1% |
| pure-unit-matrix\|TH6 | 800 | 472 | 59.0% | 0 | 29.6s | 62.8% | 39.9% |
| pure-unit-matrix\|TH5 | 707 | 399 | 56.4% | 0 | 31.0s | 66.6% | 41.5% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1740 | 1026 | 59.0% | 0 | 22.8s | 45.1% | 35.2% |
| policy-exploration\|fire_dragon | 1465 | 854 | 58.3% | 0 | 20.5s | 41.6% | 35.7% |
| policy-exploration\|archer | 1449 | 834 | 57.6% | 0 | 22.1s | 42.6% | 36.6% |
| policy-exploration\|mage | 1395 | 776 | 55.6% | 0 | 21.3s | 42.5% | 38.4% |
| policy-exploration\|demon_king | 1366 | 808 | 59.2% | 0 | 22.7s | 45.9% | 34.7% |
| policy-exploration\|mimic | 1333 | 815 | 61.1% | 0 | 23.1s | 43.6% | 32.5% |
| policy-exploration\|pea_shooter | 863 | 474 | 54.9% | 0 | 21.3s | 40.1% | 38.5% |
| policy-exploration\|mechanical_dragon | 691 | 382 | 55.3% | 0 | 20.9s | 42.2% | 40.0% |
| pure-unit-matrix\|archer | 300 | 154 | 51.3% | 0 | 35.3s | 58.9% | 48.7% |
| pure-unit-matrix\|demon_king | 300 | 187 | 62.3% | 0 | 28.7s | 68.4% | 35.5% |
| pure-unit-matrix\|fire_dragon | 300 | 184 | 61.3% | 0 | 20.5s | 67.1% | 38.3% |
| pure-unit-matrix\|knight | 300 | 169 | 56.3% | 0 | 33.3s | 62.6% | 41.1% |
| pure-unit-matrix\|mage | 300 | 134 | 44.7% | 0 | 24.3s | 55.4% | 54.4% |
| pure-unit-matrix\|mimic | 300 | 201 | 67.0% | 0 | 33.6s | 68.6% | 30.2% |
| pure-unit-matrix\|pea_shooter | 300 | 152 | 50.7% | 0 | 28.1s | 59.3% | 48.1% |
| policy-exploration\|necromancer | 225 | 122 | 54.2% | 0 | 23.7s | 45.2% | 43.7% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.1s | 64.9% | 42.5% |
| pure-unit-matrix\|necromancer | 99 | 45 | 45.5% | 0 | 30.6s | 51.2% | 54.5% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 663 | 391 | 59.0% | 0 | 22.0s | 38.3% | 31.3% |
| policy-exploration\|fire_dragon\|TH5 | 568 | 333 | 58.6% | 0 | 20.1s | 36.0% | 32.0% |
| policy-exploration\|archer\|TH5 | 567 | 332 | 58.6% | 0 | 21.2s | 35.1% | 32.0% |
| policy-exploration\|knight\|TH6 | 552 | 338 | 61.2% | 0 | 22.9s | 45.5% | 34.3% |
| policy-exploration\|mage\|TH5 | 531 | 296 | 55.7% | 0 | 20.6s | 36.0% | 34.7% |
| policy-exploration\|knight\|TH7 | 525 | 297 | 56.6% | 0 | 23.8s | 52.5% | 41.1% |
| policy-exploration\|demon_king\|TH5 | 513 | 302 | 58.9% | 0 | 21.8s | 37.7% | 30.0% |
| policy-exploration\|mimic\|TH5 | 513 | 313 | 61.0% | 0 | 22.4s | 37.1% | 28.6% |
| policy-exploration\|fire_dragon\|TH6 | 500 | 294 | 58.8% | 0 | 21.1s | 44.7% | 36.7% |
| policy-exploration\|mage\|TH6 | 469 | 261 | 55.7% | 0 | 21.6s | 42.5% | 39.3% |
| policy-exploration\|archer\|TH6 | 442 | 254 | 57.5% | 0 | 22.5s | 44.5% | 37.8% |
| policy-exploration\|mimic\|TH6 | 442 | 282 | 63.8% | 0 | 23.3s | 45.6% | 31.5% |
| policy-exploration\|archer\|TH7 | 440 | 248 | 56.4% | 0 | 22.9s | 49.6% | 41.2% |
| policy-exploration\|demon_king\|TH6 | 433 | 267 | 61.7% | 0 | 22.8s | 45.9% | 33.5% |
| policy-exploration\|demon_king\|TH7 | 420 | 239 | 56.9% | 0 | 23.8s | 54.8% | 41.5% |
| policy-exploration\|fire_dragon\|TH7 | 397 | 227 | 57.2% | 0 | 20.3s | 45.3% | 39.8% |
| policy-exploration\|mage\|TH7 | 395 | 219 | 55.4% | 0 | 21.8s | 50.5% | 42.5% |
| policy-exploration\|mimic\|TH7 | 378 | 220 | 58.2% | 0 | 23.6s | 49.4% | 38.9% |
| policy-exploration\|mechanical_dragon\|TH6 | 375 | 208 | 55.5% | 0 | 21.9s | 43.5% | 39.3% |
| policy-exploration\|pea_shooter\|TH5 | 327 | 181 | 55.4% | 0 | 20.9s | 35.0% | 34.3% |
| policy-exploration\|mechanical_dragon\|TH7 | 316 | 174 | 55.1% | 0 | 19.8s | 40.8% | 40.8% |
| policy-exploration\|pea_shooter\|TH6 | 297 | 164 | 55.2% | 0 | 22.2s | 43.3% | 39.6% |
| policy-exploration\|pea_shooter\|TH7 | 239 | 129 | 54.0% | 0 | 20.7s | 42.8% | 42.8% |
| policy-exploration\|necromancer\|TH7 | 225 | 122 | 54.2% | 0 | 23.7s | 45.2% | 43.7% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 66 | 65.3% | 0 | 36.2s | 71.3% | 31.5% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.9s | 55.5% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 29.7s | 70.1% | 32.3% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.8s | 63.2% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 32.5s | 64.7% | 38.6% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.1s | 52.9% | 52.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.8s | 64.7% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 79 | 79.0% | 0 | 34.5s | 75.3% | 16.7% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 51 | 51.0% | 0 | 29.1s | 56.2% | 48.4% |
| pure-unit-matrix\|archer\|TH7 | 99 | 53 | 53.5% | 0 | 31.5s | 59.3% | 46.5% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 25.8s | 62.4% | 41.7% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 18.5s | 66.9% | 39.9% |
| pure-unit-matrix\|knight\|TH7 | 99 | 54 | 54.5% | 0 | 29.9s | 59.3% | 43.0% |
| pure-unit-matrix\|mage\|TH7 | 99 | 42 | 42.4% | 0 | 22.7s | 54.5% | 55.5% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 57 | 57.6% | 0 | 23.4s | 65.1% | 42.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 56 | 56.6% | 0 | 30.1s | 59.6% | 42.6% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 45 | 45.5% | 0 | 30.6s | 51.2% | 54.5% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 46 | 46.5% | 0 | 25.8s | 56.1% | 52.5% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1340 | 55.9% | 0 | 28.8s | 62.5% | 42.8% |
| policy-exploration\|cannon-focus | 456 | 268 | 58.8% | 0 | 26.9s | 65.5% | 39.6% |
| policy-exploration\|none | 423 | 253 | 59.8% | 0 | 27.2s | 65.5% | 38.6% |
| policy-exploration\|cannon-rally | 418 | 239 | 57.2% | 0 | 14.8s | 6.5% | 29.6% |
| policy-exploration\|rally-core | 404 | 224 | 55.4% | 0 | 15.3s | 5.8% | 29.7% |
| policy-exploration\|medkit-entry | 246 | 143 | 58.1% | 0 | 25.6s | 62.1% | 41.2% |
| policy-exploration\|cannon-medkit | 192 | 109 | 56.8% | 0 | 27.9s | 59.9% | 42.6% |
| policy-exploration\|rally-rage | 104 | 60 | 57.7% | 0 | 13.4s | 9.4% | 34.5% |
| policy-exploration\|freeze-defense | 99 | 57 | 57.6% | 0 | 26.0s | 62.7% | 42.1% |
| policy-exploration\|freeze-rage | 92 | 56 | 60.9% | 0 | 23.4s | 67.6% | 39.1% |
| policy-exploration\|freeze-barrel | 64 | 34 | 53.1% | 0 | 29.0s | 58.3% | 46.1% |
| policy-exploration\|rage-entry | 52 | 24 | 46.2% | 0 | 27.0s | 56.5% | 52.0% |
| policy-exploration\|skeleton-barrel | 52 | 29 | 55.8% | 0 | 27.4s | 59.9% | 42.4% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 282 | 176 | 62.4% | 0 | 23.7s | 44.6% | 33.3% |
| policy-exploration\|left-flank | 272 | 186 | 68.4% | 0 | 22.8s | 41.2% | 25.8% |
| policy-exploration\|center-column | 270 | 153 | 56.7% | 0 | 22.9s | 39.0% | 38.3% |
| policy-exploration\|three-lane | 262 | 149 | 56.9% | 0 | 21.5s | 42.8% | 38.9% |
| policy-exploration\|dual-flank | 259 | 146 | 56.4% | 0 | 22.9s | 49.3% | 38.5% |
| policy-exploration\|wide-line | 259 | 137 | 52.9% | 0 | 21.7s | 45.3% | 41.4% |
| policy-exploration\|edge-sweep | 257 | 146 | 56.8% | 0 | 22.8s | 48.0% | 37.2% |
| policy-exploration\|diamond | 252 | 136 | 54.0% | 0 | 21.6s | 42.6% | 40.3% |
| policy-exploration\|vanguard-wedge | 247 | 133 | 53.8% | 0 | 22.4s | 41.9% | 41.5% |
| policy-exploration\|right-flank | 242 | 134 | 55.4% | 0 | 22.7s | 40.3% | 35.9% |
| pure-unit-matrix\|center-column | 240 | 128 | 53.3% | 0 | 29.6s | 60.2% | 45.4% |
| pure-unit-matrix\|diamond | 240 | 133 | 55.4% | 0 | 28.9s | 63.2% | 42.9% |
| pure-unit-matrix\|dual-flank | 240 | 130 | 54.2% | 0 | 27.7s | 64.2% | 45.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 136 | 56.7% | 0 | 29.4s | 61.4% | 42.5% |
| pure-unit-matrix\|left-flank | 240 | 142 | 59.2% | 0 | 29.0s | 61.5% | 38.6% |
| pure-unit-matrix\|right-flank | 240 | 140 | 58.3% | 0 | 31.8s | 62.6% | 37.6% |
| pure-unit-matrix\|three-lane | 240 | 136 | 56.7% | 0 | 28.1s | 65.1% | 42.6% |
| pure-unit-matrix\|vanguard-wedge | 240 | 128 | 53.3% | 0 | 28.2s | 58.2% | 46.4% |
| pure-unit-matrix\|wide-line | 240 | 130 | 54.2% | 0 | 27.6s | 64.4% | 44.7% |
| pure-unit-matrix\|edge-sweep | 238 | 137 | 57.6% | 0 | 28.1s | 64.7% | 42.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 299 | 56.3% | 0 | 22.0s | 43.5% | 38.6% |
| policy-exploration\|burst | 528 | 321 | 60.8% | 0 | 22.8s | 44.3% | 32.3% |
| policy-exploration\|drip | 521 | 299 | 57.4% | 0 | 22.3s | 42.3% | 37.8% |
| policy-exploration\|two-waves | 518 | 279 | 53.9% | 0 | 22.8s | 41.6% | 39.8% |
| policy-exploration\|three-waves | 504 | 298 | 59.1% | 0 | 22.8s | 45.9% | 36.6% |
| pure-unit-matrix\|burst | 480 | 265 | 55.2% | 0 | 27.6s | 62.1% | 43.8% |
| pure-unit-matrix\|rapid | 480 | 287 | 59.8% | 0 | 29.2s | 64.9% | 38.6% |
| pure-unit-matrix\|three-waves | 480 | 274 | 57.1% | 0 | 29.7s | 63.1% | 41.0% |
| pure-unit-matrix\|two-waves | 480 | 249 | 51.9% | 0 | 28.1s | 60.5% | 47.4% |
| pure-unit-matrix\|drip | 478 | 265 | 55.4% | 0 | 29.6s | 62.1% | 43.4% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 757 | 58.2% | 0 | 22.0s | 44.3% | 36.2% |
| policy-exploration\|tank-front-support-rear | 1301 | 739 | 56.8% | 0 | 23.1s | 42.7% | 37.8% |
| pure-unit-matrix\|roster-order | 1199 | 691 | 57.6% | 0 | 28.6s | 63.1% | 41.3% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 649 | 54.1% | 0 | 29.1s | 62.0% | 44.4% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 427 | 250 | 58.5% | 0 | 31.6s | 58.4% | 38.2% |
| pure-fire_dragon | 408 | 247 | 60.5% | 0 | 19.3s | 57.7% | 37.4% |
| pure-archer | 398 | 189 | 47.5% | 0 | 33.4s | 54.5% | 51.1% |
| pure-mimic | 398 | 282 | 70.9% | 0 | 31.2s | 60.1% | 25.6% |
| pure-pea_shooter | 393 | 191 | 48.6% | 0 | 26.7s | 54.9% | 49.9% |
| pure-mage | 392 | 171 | 43.6% | 0 | 23.2s | 51.0% | 54.5% |
| pure-demon_king | 383 | 245 | 64.0% | 0 | 28.2s | 66.3% | 33.0% |
| pure-mechanical_dragon | 282 | 162 | 57.4% | 0 | 24.4s | 62.7% | 41.5% |
| random-3 | 134 | 72 | 53.7% | 0 | 21.6s | 42.2% | 37.0% |
| pure-necromancer | 131 | 61 | 46.6% | 0 | 31.1s | 52.0% | 53.1% |
| random-2 | 130 | 73 | 56.2% | 0 | 21.4s | 39.0% | 35.1% |
| melee-pressure | 125 | 78 | 62.4% | 0 | 28.4s | 53.7% | 29.8% |
| frontline-ranged | 124 | 70 | 56.5% | 0 | 19.7s | 38.6% | 38.4% |
| core-fire_dragon-filled | 114 | 73 | 64.0% | 0 | 17.5s | 40.4% | 31.7% |
| balanced | 110 | 71 | 64.5% | 0 | 21.6s | 49.9% | 32.2% |
| support-mix | 107 | 55 | 51.4% | 0 | 25.2s | 46.9% | 45.8% |
| random-6 | 101 | 63 | 62.4% | 0 | 23.2s | 52.3% | 34.7% |
| core-mage-filled | 98 | 40 | 40.8% | 0 | 22.3s | 47.6% | 55.0% |
| hero-necro-dragon-mages | 94 | 59 | 62.8% | 0 | 21.6s | 53.8% | 34.9% |
| random-5 | 94 | 55 | 58.5% | 0 | 23.3s | 50.4% | 35.6% |
| random-4 | 91 | 49 | 53.8% | 0 | 20.8s | 42.2% | 40.9% |
| ranged-pressure | 87 | 46 | 52.9% | 0 | 17.6s | 27.9% | 41.1% |
| trap-runner-mix | 87 | 55 | 63.2% | 0 | 23.4s | 47.0% | 27.9% |
| core-mimic-filled | 86 | 67 | 77.9% | 0 | 29.5s | 54.5% | 19.5% |
| random-1 | 86 | 50 | 58.1% | 0 | 18.9s | 23.3% | 30.6% |
| air-pressure | 68 | 38 | 55.9% | 0 | 16.6s | 27.8% | 39.8% |
| core-mechanical_dragon-filled | 52 | 24 | 46.2% | 0 | 20.9s | 30.9% | 43.9% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__burst__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 22.8s | 44.6% | 48.1% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 25.5s | 58.0% | 43.1% |
| three-lane__rapid__tank-front-support-rear | 57 | 37 | 64.9% | 0 | 29.2s | 70.2% | 35.1% |
| wide-line__drip__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 23.7s | 49.6% | 44.6% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 29.3s | 57.5% | 44.8% |
| inverted-wedge__burst__roster-order | 56 | 38 | 67.9% | 0 | 27.0s | 60.0% | 28.5% |
| inverted-wedge__rapid__roster-order | 56 | 33 | 58.9% | 0 | 25.0s | 48.7% | 38.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 56 | 25 | 44.6% | 0 | 26.5s | 44.9% | 49.3% |
| left-flank__drip__tank-front-support-rear | 56 | 38 | 67.9% | 0 | 25.8s | 53.6% | 30.1% |
| left-flank__three-waves__roster-order | 56 | 34 | 60.7% | 0 | 24.1s | 46.6% | 34.5% |
| left-flank__two-waves__roster-order | 56 | 33 | 58.9% | 0 | 21.0s | 32.7% | 34.1% |
| right-flank__burst__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 30.5s | 54.2% | 43.2% |
| right-flank__drip__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 24.3s | 40.7% | 38.8% |
| vanguard-wedge__burst__roster-order | 56 | 31 | 55.4% | 0 | 26.9s | 55.2% | 42.1% |
| vanguard-wedge__two-waves__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 26.2s | 56.1% | 46.4% |
| center-column__three-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 26.7s | 46.8% | 44.5% |
| center-column__two-waves__roster-order | 55 | 29 | 52.7% | 0 | 26.5s | 47.9% | 43.4% |
| diamond__burst__roster-order | 55 | 30 | 54.5% | 0 | 22.3s | 50.6% | 39.1% |
| dual-flank__rapid__roster-order | 55 | 31 | 56.4% | 0 | 21.7s | 49.1% | 39.8% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 34 | 61.8% | 0 | 27.8s | 65.6% | 35.5% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 24.6s | 50.2% | 39.3% |
| left-flank__three-waves__tank-front-support-rear | 55 | 40 | 72.7% | 0 | 27.8s | 61.0% | 25.0% |
| left-flank__two-waves__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 26.1s | 49.0% | 28.5% |
| three-lane__drip__roster-order | 55 | 29 | 52.7% | 0 | 27.4s | 63.7% | 47.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 25.7s | 50.9% | 47.4% |
| wide-line__rapid__roster-order | 55 | 24 | 43.6% | 0 | 22.3s | 44.7% | 52.9% |
| center-column__two-waves__tank-front-support-rear | 54 | 26 | 48.1% | 0 | 23.0s | 37.1% | 47.6% |
| three-lane__drip__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.5s | 45.5% | 44.3% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.4s | 52.4% | 48.0% |
| wide-line__rapid__tank-front-support-rear | 54 | 34 | 63.0% | 0 | 24.9s | 55.8% | 34.1% |
| center-column__drip__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.5s | 45.4% | 44.9% |
| center-column__rapid__roster-order | 51 | 27 | 52.9% | 0 | 24.0s | 57.0% | 44.9% |
| diamond__drip__roster-order | 51 | 26 | 51.0% | 0 | 25.0s | 55.7% | 47.1% |
| diamond__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 24.9s | 44.3% | 35.6% |
| dual-flank__burst__roster-order | 51 | 31 | 60.8% | 0 | 27.1s | 67.1% | 38.0% |
| edge-sweep__three-waves__roster-order | 51 | 34 | 66.7% | 0 | 27.7s | 62.2% | 33.3% |
| inverted-wedge__two-waves__roster-order | 51 | 33 | 64.7% | 0 | 29.7s | 66.4% | 34.2% |
| three-lane__burst__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 20.0s | 39.0% | 39.0% |
| three-lane__rapid__roster-order | 51 | 33 | 64.7% | 0 | 20.8s | 45.9% | 32.7% |
| wide-line__three-waves__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 26.1s | 63.2% | 48.1% |
| center-column__burst__roster-order | 50 | 29 | 58.0% | 0 | 28.0s | 52.1% | 37.0% |
| center-column__drip__roster-order | 50 | 25 | 50.0% | 0 | 32.6s | 59.9% | 48.5% |
| center-column__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 25.1s | 47.0% | 34.4% |
| diamond__burst__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 23.3s | 53.3% | 31.7% |
| diamond__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.6s | 60.4% | 38.3% |
| diamond__three-waves__roster-order | 50 | 28 | 56.0% | 0 | 27.0s | 62.2% | 40.9% |
| diamond__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 21.6s | 39.9% | 43.6% |
| dual-flank__drip__roster-order | 50 | 34 | 68.0% | 0 | 28.2s | 64.7% | 31.7% |
| dual-flank__rapid__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 26.2s | 55.7% | 38.4% |
| dual-flank__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 24.2s | 52.6% | 31.9% |
| edge-sweep__drip__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 26.6s | 55.3% | 36.8% |
| edge-sweep__rapid__roster-order | 50 | 29 | 58.0% | 0 | 24.0s | 56.1% | 38.7% |
| inverted-wedge__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 28.1s | 57.3% | 34.6% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 22.0s | 33.8% | 36.0% |
| left-flank__burst__roster-order | 50 | 32 | 64.0% | 0 | 25.7s | 52.1% | 28.7% |
| left-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 22.8s | 42.4% | 34.4% |
| right-flank__burst__roster-order | 50 | 27 | 54.0% | 0 | 25.1s | 48.2% | 38.1% |
| right-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 24.7s | 47.4% | 32.6% |
| right-flank__three-waves__roster-order | 50 | 26 | 52.0% | 0 | 24.5s | 53.7% | 42.7% |
| three-lane__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 25.0s | 59.4% | 30.2% |
| three-lane__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 22.4s | 52.8% | 43.5% |
| vanguard-wedge__rapid__roster-order | 50 | 33 | 66.0% | 0 | 26.3s | 52.4% | 30.7% |
| vanguard-wedge__two-waves__roster-order | 50 | 29 | 58.0% | 0 | 22.1s | 46.0% | 39.8% |
| wide-line__two-waves__roster-order | 50 | 22 | 44.0% | 0 | 22.7s | 45.7% | 44.0% |
| center-column__three-waves__roster-order | 49 | 33 | 67.3% | 0 | 27.9s | 62.8% | 31.2% |
| dual-flank__drip__tank-front-support-rear | 49 | 20 | 40.8% | 0 | 26.2s | 57.0% | 59.2% |
| dual-flank__two-waves__roster-order | 49 | 22 | 44.9% | 0 | 23.5s | 58.0% | 54.6% |
| edge-sweep__drip__roster-order | 49 | 33 | 67.3% | 0 | 24.4s | 48.3% | 27.2% |
| edge-sweep__rapid__tank-front-support-rear | 49 | 29 | 59.2% | 0 | 25.4s | 59.1% | 39.7% |
| inverted-wedge__drip__roster-order | 49 | 29 | 59.2% | 0 | 26.1s | 47.3% | 38.4% |
| right-flank__rapid__roster-order | 49 | 31 | 63.3% | 0 | 25.7s | 56.1% | 35.5% |
| right-flank__three-waves__tank-front-support-rear | 49 | 34 | 69.4% | 0 | 27.8s | 46.3% | 27.1% |
| wide-line__burst__roster-order | 49 | 30 | 61.2% | 0 | 21.3s | 49.8% | 36.6% |
| wide-line__two-waves__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 26.3s | 52.1% | 52.1% |
| center-column__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 21.4s | 33.9% | 38.1% |
| diamond__rapid__roster-order | 45 | 21 | 46.7% | 0 | 29.1s | 60.2% | 50.8% |
| diamond__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 28.8s | 56.7% | 40.1% |
| diamond__two-waves__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 22.7s | 43.8% | 50.6% |
| edge-sweep__burst__roster-order | 45 | 30 | 66.7% | 0 | 24.2s | 63.7% | 33.3% |
| left-flank__burst__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 29.9s | 62.9% | 34.4% |
| left-flank__rapid__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 28.4s | 48.4% | 47.6% |
| three-lane__burst__roster-order | 45 | 28 | 62.2% | 0 | 23.4s | 46.4% | 31.8% |
| three-lane__two-waves__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 25.9s | 52.5% | 47.0% |
| wide-line__drip__roster-order | 45 | 26 | 57.8% | 0 | 25.4s | 65.9% | 42.2% |
| wide-line__three-waves__roster-order | 45 | 28 | 62.2% | 0 | 26.8s | 59.2% | 37.2% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 25.5s | 48.5% | 40.6% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 27.6s | 70.2% | 34.1% |
| edge-sweep__burst__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 21.0s | 41.2% | 44.8% |
| edge-sweep__two-waves__roster-order | 44 | 20 | 45.5% | 0 | 24.1s | 57.7% | 54.5% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 26.4s | 47.5% | 41.1% |
| left-flank__rapid__roster-order | 44 | 33 | 75.0% | 0 | 26.7s | 62.7% | 22.5% |
| right-flank__two-waves__roster-order | 44 | 25 | 56.8% | 0 | 29.9s | 55.8% | 36.8% |
| three-lane__three-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 26.6s | 57.0% | 57.7% |
| vanguard-wedge__drip__roster-order | 44 | 23 | 52.3% | 0 | 22.4s | 35.8% | 38.5% |
| vanguard-wedge__three-waves__roster-order | 44 | 17 | 38.6% | 0 | 24.3s | 44.8% | 60.7% |
| wide-line__burst__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 27.0s | 62.4% | 36.1% |
| right-flank__rapid__tank-front-support-rear | 39 | 25 | 64.1% | 0 | 30.8s | 62.2% | 29.1% |
| right-flank__two-waves__tank-front-support-rear | 39 | 21 | 53.8% | 0 | 31.3s | 54.3% | 41.8% |
| vanguard-wedge__drip__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 25.6s | 49.0% | 43.6% |
| vanguard-wedge__three-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 27.0s | 53.4% | 42.1% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 522 | 312 | 59.8% | 0 | 26.3s | 52.4% | 37.5% |
| left-flank | 512 | 328 | 64.1% | 0 | 25.7s | 50.7% | 31.8% |
| center-column | 510 | 281 | 55.1% | 0 | 26.1s | 49.0% | 41.6% |
| three-lane | 502 | 285 | 56.8% | 0 | 24.7s | 53.5% | 40.7% |
| dual-flank | 499 | 276 | 55.3% | 0 | 25.2s | 56.5% | 41.8% |
| wide-line | 499 | 267 | 53.5% | 0 | 24.6s | 54.5% | 43.0% |
| edge-sweep | 495 | 283 | 57.2% | 0 | 25.4s | 56.0% | 39.6% |
| diamond | 492 | 269 | 54.7% | 0 | 25.2s | 52.7% | 41.6% |
| vanguard-wedge | 487 | 261 | 53.6% | 0 | 25.2s | 49.9% | 43.9% |
| right-flank | 482 | 274 | 56.8% | 0 | 27.3s | 51.4% | 36.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 586 | 58.0% | 0 | 25.4s | 53.6% | 38.6% |
| burst | 1008 | 586 | 58.1% | 0 | 25.1s | 52.8% | 37.8% |
| drip | 999 | 564 | 56.5% | 0 | 25.8s | 51.8% | 40.5% |
| two-waves | 998 | 528 | 52.9% | 0 | 25.3s | 50.7% | 43.4% |
| three-waves | 984 | 572 | 58.1% | 0 | 26.2s | 54.3% | 38.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1448 | 57.9% | 0 | 25.1s | 53.4% | 38.7% |
| tank-front-support-rear | 2500 | 1388 | 55.5% | 0 | 26.0s | 51.9% | 40.9% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2821 | 1593 | 56.5% | 0 | 28.6s | 63.0% | 42.2% |
| cannon-focus | 456 | 268 | 58.8% | 0 | 26.9s | 65.5% | 39.6% |
| cannon-rally | 418 | 239 | 57.2% | 0 | 14.8s | 6.5% | 29.6% |
| rally-core | 404 | 224 | 55.4% | 0 | 15.3s | 5.8% | 29.7% |
| medkit-entry | 246 | 143 | 58.1% | 0 | 25.6s | 62.1% | 41.2% |
| cannon-medkit | 192 | 109 | 56.8% | 0 | 27.9s | 59.9% | 42.6% |
| rally-rage | 104 | 60 | 57.7% | 0 | 13.4s | 9.4% | 34.5% |
| freeze-defense | 99 | 57 | 57.6% | 0 | 26.0s | 62.7% | 42.1% |
| freeze-rage | 92 | 56 | 60.9% | 0 | 23.4s | 67.6% | 39.1% |
| freeze-barrel | 64 | 34 | 53.1% | 0 | 29.0s | 58.3% | 46.1% |
| rage-entry | 52 | 24 | 46.2% | 0 | 27.0s | 56.5% | 52.0% |
| skeleton-barrel | 52 | 29 | 55.8% | 0 | 27.4s | 59.9% | 42.4% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1327 | 790 | 59.5% | 0 | 23.1s | 54.2% | 36.7% |
| epic | 714 | 435 | 60.9% | 0 | 21.2s | 43.7% | 33.4% |
| legendary | 711 | 420 | 59.1% | 0 | 21.2s | 45.4% | 34.1% |
| unrevealed | 679 | 388 | 57.1% | 0 | 22.2s | 42.5% | 36.7% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 672 | 397 | 59.1% | 0 | 20.4s | 51.8% | 37.8% |
| demon_king\|common | 655 | 393 | 60.0% | 0 | 25.8s | 56.7% | 35.7% |
| fire_dragon\|legendary | 379 | 224 | 59.1% | 0 | 20.7s | 44.5% | 33.9% |
| fire_dragon\|epic | 369 | 223 | 60.4% | 0 | 20.3s | 43.6% | 34.2% |
| demon_king\|epic | 345 | 212 | 61.4% | 0 | 22.1s | 43.8% | 32.6% |
| fire_dragon\|unrevealed | 345 | 194 | 56.2% | 0 | 20.9s | 38.7% | 37.6% |
| demon_king\|unrevealed | 334 | 194 | 58.1% | 0 | 23.6s | 46.3% | 35.8% |
| demon_king\|legendary | 332 | 196 | 59.0% | 0 | 21.8s | 46.4% | 34.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1723 | 56.8% | 0 | 27.6s | 58.8% | 41.0% |
| ward-1 | 767 | 450 | 58.7% | 0 | 22.6s | 44.3% | 36.3% |
| ward-2 | 601 | 341 | 56.7% | 0 | 22.8s | 43.8% | 38.4% |
| ward-3 | 600 | 322 | 53.7% | 0 | 21.8s | 41.3% | 39.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2836 | 56.7% | 0 | 25.6s | 52.7% | 39.8% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2040 | 1195 | 58.6% | 0 | 24.4s | 47.7% | 36.1% |
| fire_dragon | 1765 | 1038 | 58.8% | 0 | 20.5s | 46.0% | 36.1% |
| archer | 1749 | 988 | 56.5% | 0 | 24.4s | 45.4% | 38.6% |
| mage | 1695 | 910 | 53.7% | 0 | 21.8s | 44.8% | 41.3% |
| demon_king | 1666 | 995 | 59.7% | 0 | 23.8s | 49.9% | 34.8% |
| mimic | 1633 | 1016 | 62.2% | 0 | 25.0s | 48.2% | 32.1% |
| pea_shooter | 1163 | 626 | 53.8% | 0 | 23.0s | 45.1% | 41.0% |
| mechanical_dragon | 890 | 496 | 55.7% | 0 | 21.9s | 47.3% | 40.6% |
| necromancer | 324 | 167 | 51.5% | 0 | 25.8s | 47.0% | 47.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 51.3% | 45.7%-56.9% | 58.9% | 48.7% | 27.5% |
| demon_king | 300 | 62.3% | 56.7%-67.6% | 68.4% | 35.5% | 51.9% |
| fire_dragon | 300 | 61.3% | 55.7%-66.7% | 67.1% | 38.3% | 52.1% |
| knight | 300 | 56.3% | 50.7%-61.8% | 62.6% | 41.1% | 37.7% |
| mage | 300 | 44.7% | 39.1%-50.3% | 55.4% | 54.4% | 27.0% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 64.9% | 42.5% | 44.2% |
| mimic | 300 | 67.0% | 61.5%-72.1% | 68.6% | 30.2% | 58.3% |
| necromancer | 99 | 45.5% | 36.0%-55.2% | 51.2% | 54.5% | 36.0% |
| pea_shooter | 300 | 50.7% | 45.0%-56.3% | 59.3% | 48.1% | 32.8% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.5% | 50.0% | 23.6% |
| archer\|TH7 | 99 | 53.5% | 43.8%-63.0% | 59.3% | 46.5% | 29.2% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 32.3% | 55.0% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 62.4% | 41.7% | 48.0% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.2% | 38.6% | 51.2% |
| fire_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 66.9% | 39.9% | 54.5% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.7% | 38.6% | 40.7% |
| knight\|TH7 | 99 | 54.5% | 44.8%-64.0% | 59.3% | 43.0% | 36.4% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 52.9% | 52.0% | 24.0% |
| mage\|TH7 | 99 | 42.4% | 33.2%-52.3% | 54.5% | 55.5% | 27.7% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 64.7% | 42.9% | 42.2% |
| mechanical_dragon\|TH7 | 99 | 57.6% | 47.7%-66.8% | 65.1% | 42.2% | 46.2% |
| mimic\|TH5 | 101 | 65.3% | 55.7%-73.9% | 71.3% | 31.5% | 54.6% |
| mimic\|TH6 | 100 | 79.0% | 70.0%-85.8% | 75.3% | 16.7% | 69.1% |
| mimic\|TH7 | 99 | 56.6% | 46.7%-65.9% | 59.6% | 42.6% | 51.1% |
| necromancer\|TH7 | 99 | 45.5% | 36.0%-55.2% | 51.2% | 54.5% | 36.0% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 51.0% | 41.3%-60.6% | 56.2% | 48.4% | 31.4% |
| pea_shooter\|TH7 | 99 | 46.5% | 37.0%-56.2% | 56.1% | 52.5% | 30.9% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.6% | 50.0% | 27.7% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.1% | 50.0% | 32.6% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 55.5% | 46.7% | 33.8% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 60.4% | 61.1% | 23.3% |
| archer\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 64.5% | 40.1% | 27.3% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 24.7% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 67.4% | 39.0% | 27.7% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.1% | 53.2% | 25.2% |
| archer\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 48.4% | 53.3% | 24.9% |
| archer\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 50.0% | 53.3% | 28.4% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 50.9% | 53.3% | 25.2% |
| archer\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 59.8% | 50.0% | 21.6% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 54.3% | 60.0% | 25.9% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.7% | 55.6% | 22.5% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 56.3% | 50.0% | 24.0% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 63.1% | 38.9% | 34.7% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.0% | 38.9% | 35.2% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.2% | 33.3% | 29.6% |
| demon_king\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 67.2% | 50.0% | 42.0% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.7% | 50.0% | 45.1% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 73.2% | 19.3% | 62.2% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 57.4% | 51.4% | 37.7% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 63.4% | 30.4% | 47.4% |
| demon_king\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.2% | 28.9% | 54.1% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.9% | 32.9% | 56.2% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.7% | 40.0% | 51.1% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 72.7% | 26.7% | 58.5% |
| demon_king\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 73.0% | 34.7% | 55.6% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 76.6% | 25.5% | 58.5% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 67.0% | 47.7% | 37.0% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 65.2% | 38.7% | 51.9% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.0% | 48.6% | 43.2% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.4% | 28.9% | 54.9% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 64.4% | 28.9% | 56.2% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 69.9% | 33.3% | 56.2% |
| demon_king\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 83.3% | 15.9% | 69.8% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.2% | 50.0% | 41.7% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.5% | 50.0% | 41.7% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 69.8% | 33.3% | 65.0% |
| fire_dragon\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.1% | 52.6% | 38.9% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 62.9% | 46.7% | 41.7% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 65.9% | 33.3% | 56.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 70.1% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.3% | 38.2% | 56.7% |
| fire_dragon\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 69.3% | 26.7% | 55.0% |
| fire_dragon\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 72.0% | 26.7% | 63.3% |
| fire_dragon\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 77.5% | 26.7% | 63.3% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 64.4% | 50.0% | 43.1% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.0% | 40.0% | 53.3% |
| fire_dragon\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.0% | 55.6% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 62.1% | 38.9% | 47.2% |
| fire_dragon\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.4% | 33.3% | 56.9% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 70.8% | 31.0% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 75.6% | 16.7% | 66.7% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 60.4% | 49.7% | 33.2% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.2% | 49.6% | 36.9% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 65.7% | 36.6% | 45.8% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.9% | 55.2% | 29.1% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.8% | 43.8% | 31.9% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.5% | 35.9% | 34.7% |
| knight\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 61.2% | 39.1% | 34.9% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 60.9% | 42.1% | 36.3% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 60.2% | 33.3% | 44.0% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.1% | 32.8% | 45.5% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 67.3% | 33.3% | 46.5% |
| knight\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 58.7% | 59.4% | 24.2% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 63.0% | 39.7% | 39.9% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.1% | 52.3% | 30.5% |
| knight\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 59.5% | 35.8% | 37.8% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.7% | 33.3% | 46.7% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.5% | 31.9% | 43.5% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 67.2% | 30.6% | 41.2% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.5% | 58.6% | 25.8% |
| mage\|asymmetric-right | 18 | 33.3% | 16.3%-56.3% | 51.7% | 66.1% | 24.7% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.0% | 40.0% | 30.3% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 54.0% | 61.1% | 21.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 57.0% | 52.3% | 26.1% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.5% | 53.3% | 29.7% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 62.7% | 50.0% | 26.3% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 56.6% | 53.3% | 26.7% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 31.5% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 52.3% | 53.3% | 30.9% |
| mage\|kill-corridor | 15 | 33.3% | 15.2%-58.3% | 49.8% | 62.4% | 23.6% |
| mage\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 53.0% | 56.6% | 19.7% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.2% | 53.3% | 26.1% |
| mage\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.7% | 55.6% | 24.7% |
| mage\|southern-funnel | 18 | 27.8% | 12.5%-50.9% | 48.9% | 72.2% | 20.2% |
| mage\|split-core | 18 | 38.9% | 20.3%-61.4% | 56.3% | 57.3% | 29.8% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.1% | 44.4% | 36.4% |
| mage\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 66.3% | 38.9% | 33.8% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 61.7% | 49.8% | 37.1% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 65.3% | 50.0% | 40.2% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 62.7% | 40.0% | 50.9% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 60.0% | 50.0% | 34.1% |
| mechanical_dragon\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 62.8% | 44.4% | 40.4% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 61.0% | 49.6% | 39.1% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 69.4% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.0% | 40.0% | 46.4% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 67.0% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 65.7% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 60.0% | 31.3%-83.2% | 70.3% | 38.1% | 56.4% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 60.3% | 50.0% | 40.2% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 67.0% | 40.0% | 48.2% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.6% | 50.0% | 37.9% |
| mechanical_dragon\|southern-funnel | 12 | 50.0% | 25.4%-74.6% | 63.1% | 49.1% | 30.3% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 65.8% | 33.3% | 50.8% |
| mechanical_dragon\|trap-lanes | 12 | 66.7% | 39.1%-86.2% | 68.3% | 33.3% | 45.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 73.6% | 33.2% | 53.0% |
| mimic\|asymmetric-left | 18 | 61.1% | 38.6%-79.7% | 69.1% | 34.9% | 51.6% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 67.2% | 42.5% | 43.7% |
| mimic\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 69.1% | 26.7% | 68.6% |
| mimic\|compact-core | 18 | 55.6% | 33.7%-75.4% | 57.8% | 41.7% | 42.1% |
| mimic\|corner-keep | 15 | 73.3% | 48.0%-89.1% | 64.3% | 25.3% | 61.0% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 67.5% | 32.9% | 51.4% |
| mimic\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 73.9% | 23.4% | 59.5% |
| mimic\|diamond | 15 | 66.7% | 41.7%-84.8% | 68.6% | 28.1% | 60.0% |
| mimic\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 70.5% | 31.3% | 58.1% |
| mimic\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 70.5% | 26.7% | 62.9% |
| mimic\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 76.8% | 20.0% | 71.4% |
| mimic\|layered-rings | 18 | 61.1% | 38.6%-79.7% | 67.8% | 36.0% | 53.2% |
| mimic\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 63.9% | 33.3% | 59.0% |
| mimic\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 60.0% | 50.0% | 41.3% |
| mimic\|southern-funnel | 18 | 72.2% | 49.1%-87.5% | 65.5% | 27.1% | 60.3% |
| mimic\|split-core | 18 | 72.2% | 49.1%-87.5% | 69.7% | 27.8% | 65.1% |
| mimic\|trap-lanes | 18 | 83.3% | 60.8%-94.2% | 71.6% | 16.9% | 68.3% |
| mimic\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 80.7% | 16.7% | 76.2% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 57.0% | 50.0% | 44.4% |
| necromancer\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 58.6% | 50.0% | 44.4% |
| necromancer\|compact-core | 6 | 16.7% | 3.0%-56.4% | 38.7% | 83.3% | 16.7% |
| necromancer\|defense-ring | 6 | 33.3% | 9.7%-70.0% | 47.3% | 66.6% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 53.8% | 66.6% | 33.3% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 47.3% | 66.7% | 27.8% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 37.1% | 83.3% | 11.1% |
| necromancer\|split-core | 6 | 50.0% | 18.8%-81.2% | 54.8% | 50.0% | 44.4% |
| necromancer\|trap-lanes | 6 | 66.7% | 30.0%-90.3% | 48.9% | 33.3% | 44.4% |
| necromancer\|wide-spread | 6 | 50.0% | 18.8%-81.2% | 58.1% | 50.0% | 38.9% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 53.0% | 61.1% | 27.2% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.5% | 53.5% | 34.6% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 59.1% | 40.0% | 40.0% |
| pea_shooter\|compact-core | 18 | 44.4% | 24.6%-66.3% | 57.2% | 55.6% | 22.8% |
| pea_shooter\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 62.2% | 45.2% | 33.3% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 54.3% | 53.3% | 29.6% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.8% | 46.8% | 30.2% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.0% | 40.0% | 40.7% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 52.5% | 43.5% | 31.9% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.8% | 37.5% | 41.5% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 60.7% | 46.5% | 37.0% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 54.9% | 63.0% | 20.4% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 57.7% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 55.7% | 58.8% | 27.2% |
| pea_shooter\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 57.2% | 55.6% | 31.5% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 65.7% | 40.3% | 38.3% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.4% | 38.9% | 37.0% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.4% | 33.3% | 37.7% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 98.3% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.3% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 97.8% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 98.2% |
| th7-compact-core-272 | 7 | compact-core | maxed | 35 | 0.0% | 96.6% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 96.4% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 95.6% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 94.1% |
| th7-rear-keep-254 | 7 | rear-keep | maxed | 35 | 0.0% | 94.0% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 2.9% | 96.7% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 2.9% | 95.2% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 97.2% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.0% |
| th6-rear-keep-253 | 6 | rear-keep | maxed | 17 | 0.0% | 98.3% |
| th6-compact-core-002 | 6 | compact-core | maxed | 17 | 0.0% | 97.7% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,969 | 5,967.14 | 1,992.25 | 1,491.79 |  |
| necromancer | 7 | 15 | 36,225 | 11,061.73 | 2,415 | 737.45 |  |
| archer | 7 | 1 | 2,037 | 706.45 | 2,037 | 706.45 |  |
| fire_dragon | 7 | 10 | 15,295 | 6,830 | 1,529.5 | 683 |  |
| mechanical_dragon | 7 | 4 | 5,736 | 1,626.21 | 1,434 | 406.55 | chain x3 |
| demon_king | 7 | 5 | 18,725 | 2,022.22 | 3,745 | 404.44 |  |
| knight | 7 | 1 | 3,633 | 393.33 | 3,633 | 393.33 |  |
| mimic | 7 | 6 | 19,440 | 1,426.42 | 3,240 | 237.74 | trap immune |
| horror | 7 | 20 | 38,290 | 4,109.68 | 1,914.5 | 205.48 |  |
| pea_shooter | 7 | 5 | 11,725 | 825.14 | 2,345 | 165.03 |  |
| wind_mage | 7 | 15 | 21,000 | 2,386.36 | 1,400 | 159.09 |  |
| ice_golem | 7 | 10 | 38,220 | 1,478.87 | 3,822 | 147.89 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 58.0% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH6 has 58.3% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.5% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-291 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-294 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-034 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-104 has 0 attacker wins across 17 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-260 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-278 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-093 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-254 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-southern-funnel-229 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-282 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-split-core-226 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-279 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-trap-lanes-082 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-trap-lanes-297 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-019 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-wide-spread-127 has 100.0% attacker wins across 15 samples.
- 167 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
