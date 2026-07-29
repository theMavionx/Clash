# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:52:26.310Z
**Seed:** 83004
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 87
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 151.6s

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
| 5000 | 2755 | 55.1% | 0 | 25.6s | 51.7% | 41.6% | 34.9% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 952 | 54.2% | 0 | 24.8s | 53.8% | 43.9% |
| TH6->TH6 | 1669 | 945 | 56.6% | 0 | 26.1s | 52.1% | 40.8% |
| TH5->TH5 | 1576 | 858 | 54.4% | 0 | 26.1s | 48.7% | 39.8% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 182 | 47.8% | 0 | 23.8s | 47.4% | 49.7% |
| layered-rings | 380 | 167 | 43.9% | 0 | 24.2s | 48.1% | 51.7% |
| asymmetric-right | 376 | 183 | 48.7% | 0 | 25.1s | 51.7% | 47.7% |
| crossfire | 312 | 181 | 58.0% | 0 | 25.3s | 50.2% | 38.8% |
| diamond | 312 | 164 | 52.6% | 0 | 24.6s | 51.0% | 44.0% |
| kill-corridor | 310 | 173 | 55.8% | 0 | 26.0s | 53.3% | 40.2% |
| compact-core | 276 | 106 | 38.4% | 0 | 24.5s | 44.9% | 56.3% |
| split-core | 274 | 176 | 64.2% | 0 | 25.9s | 56.7% | 31.6% |
| trap-lanes | 274 | 179 | 65.3% | 0 | 26.5s | 55.0% | 32.4% |
| wide-spread | 272 | 202 | 74.3% | 0 | 28.2s | 59.8% | 24.3% |
| asymmetric-left | 249 | 118 | 47.4% | 0 | 26.1s | 50.8% | 50.0% |
| southern-funnel | 247 | 135 | 54.7% | 0 | 25.6s | 50.7% | 41.9% |
| defense-ring | 245 | 143 | 58.4% | 0 | 27.4s | 56.4% | 36.7% |
| echelon-left | 233 | 159 | 68.2% | 0 | 27.3s | 53.2% | 30.8% |
| rear-keep | 232 | 111 | 47.8% | 0 | 24.2s | 47.9% | 49.0% |
| corner-keep | 212 | 117 | 55.2% | 0 | 26.1s | 52.6% | 39.8% |
| echelon-right | 208 | 123 | 59.1% | 0 | 25.6s | 52.4% | 36.9% |
| cannon-screen | 207 | 136 | 65.7% | 0 | 27.3s | 53.2% | 33.6% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 82 | 44.1% | 0 | 22.9s | 47.6% | 53.5% |
| resource-shield\|TH7 | 185 | 91 | 49.2% | 0 | 23.8s | 50.0% | 48.0% |
| asymmetric-right\|TH7 | 184 | 96 | 52.2% | 0 | 23.9s | 51.6% | 45.0% |
| kill-corridor\|TH7 | 151 | 87 | 57.6% | 0 | 24.6s | 54.5% | 39.9% |
| crossfire\|TH7 | 149 | 95 | 63.8% | 0 | 24.7s | 55.2% | 33.7% |
| diamond\|TH7 | 149 | 78 | 52.3% | 0 | 23.4s | 50.4% | 46.4% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 25.3s | 48.6% | 49.0% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 26.1s | 51.0% | 47.1% |
| layered-rings\|TH6 | 101 | 51 | 50.5% | 0 | 25.3s | 50.6% | 46.9% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 23.2s | 46.2% | 49.3% |
| trap-lanes\|TH6 | 101 | 57 | 56.4% | 0 | 25.4s | 51.0% | 41.1% |
| southern-funnel\|TH6 | 100 | 54 | 54.0% | 0 | 27.3s | 49.1% | 42.6% |
| split-core\|TH6 | 100 | 63 | 63.0% | 0 | 25.9s | 56.1% | 33.8% |
| wide-spread\|TH6 | 99 | 72 | 72.7% | 0 | 28.0s | 61.5% | 25.8% |
| asymmetric-right\|TH6 | 98 | 47 | 48.0% | 0 | 25.3s | 53.4% | 49.1% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 28.5s | 56.1% | 33.7% |
| resource-shield\|TH5 | 95 | 41 | 43.2% | 0 | 24.4s | 43.2% | 53.2% |
| asymmetric-left\|TH5 | 94 | 41 | 43.6% | 0 | 25.7s | 46.5% | 51.1% |
| asymmetric-right\|TH5 | 94 | 40 | 42.6% | 0 | 27.2s | 50.0% | 51.6% |
| corner-keep\|TH5 | 94 | 51 | 54.3% | 0 | 26.5s | 51.3% | 36.9% |
| split-core\|TH5 | 94 | 52 | 55.3% | 0 | 25.1s | 48.8% | 36.0% |
| compact-core\|TH5 | 93 | 39 | 41.9% | 0 | 26.2s | 46.7% | 48.6% |
| defense-ring\|TH5 | 93 | 51 | 54.8% | 0 | 26.5s | 53.0% | 36.4% |
| layered-rings\|TH5 | 93 | 34 | 36.6% | 0 | 25.5s | 46.2% | 53.3% |
| southern-funnel\|TH5 | 93 | 56 | 60.2% | 0 | 22.7s | 51.0% | 34.4% |
| trap-lanes\|TH5 | 93 | 60 | 64.5% | 0 | 26.4s | 50.3% | 31.7% |
| wide-spread\|TH5 | 93 | 72 | 77.4% | 0 | 28.2s | 54.6% | 20.6% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 26.2s | 54.9% | 39.4% |
| echelon-right\|TH6 | 85 | 51 | 60.0% | 0 | 25.8s | 53.3% | 38.0% |
| cannon-screen\|TH6 | 84 | 56 | 66.7% | 0 | 26.7s | 51.8% | 32.4% |
| crossfire\|TH6 | 84 | 40 | 47.6% | 0 | 24.8s | 44.1% | 47.6% |
| echelon-left\|TH6 | 83 | 54 | 65.1% | 0 | 27.9s | 49.1% | 34.4% |
| corner-keep\|TH6 | 82 | 51 | 62.2% | 0 | 25.7s | 54.0% | 36.2% |
| kill-corridor\|TH6 | 82 | 48 | 58.5% | 0 | 27.1s | 56.2% | 37.3% |
| rear-keep\|TH6 | 82 | 41 | 50.0% | 0 | 24.9s | 51.6% | 47.1% |
| compact-core\|TH7 | 80 | 18 | 22.5% | 0 | 21.5s | 38.5% | 74.6% |
| split-core\|TH7 | 80 | 61 | 76.3% | 0 | 27.1s | 65.8% | 23.7% |
| trap-lanes\|TH7 | 80 | 62 | 77.5% | 0 | 27.9s | 64.6% | 22.3% |
| wide-spread\|TH7 | 80 | 58 | 72.5% | 0 | 28.3s | 63.1% | 26.7% |
| crossfire\|TH5 | 79 | 46 | 58.2% | 0 | 27.0s | 46.4% | 39.1% |
| rear-keep\|TH5 | 79 | 44 | 55.7% | 0 | 24.5s | 48.1% | 40.8% |
| cannon-screen\|TH5 | 78 | 55 | 70.5% | 0 | 29.7s | 51.7% | 28.8% |
| diamond\|TH5 | 78 | 39 | 50.0% | 0 | 25.1s | 47.8% | 44.4% |
| echelon-left\|TH5 | 78 | 53 | 67.9% | 0 | 26.8s | 46.7% | 29.7% |
| echelon-right\|TH5 | 78 | 46 | 59.0% | 0 | 24.5s | 45.4% | 32.9% |
| kill-corridor\|TH5 | 77 | 38 | 49.4% | 0 | 27.6s | 47.4% | 43.7% |
| echelon-left\|TH7 | 72 | 52 | 72.2% | 0 | 27.1s | 63.8% | 27.8% |
| rear-keep\|TH7 | 71 | 26 | 36.6% | 0 | 23.1s | 43.8% | 60.4% |
| asymmetric-left\|TH7 | 54 | 25 | 46.3% | 0 | 26.9s | 57.3% | 53.7% |
| defense-ring\|TH7 | 54 | 30 | 55.6% | 0 | 27.0s | 62.3% | 42.7% |
| southern-funnel\|TH7 | 54 | 25 | 46.3% | 0 | 27.4s | 52.9% | 53.6% |
| cannon-screen\|TH7 | 45 | 25 | 55.6% | 0 | 24.2s | 58.1% | 44.2% |
| echelon-right\|TH7 | 45 | 26 | 57.8% | 0 | 27.0s | 61.6% | 41.6% |
| corner-keep\|TH7 | 36 | 15 | 41.7% | 0 | 26.2s | 53.0% | 55.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.9s | 73.3% | 0.0% |
| maxed | 1037 | 35 | 3.4% | 0 | 20.5s | 20.6% | 93.0% |
| mid | 1011 | 817 | 80.8% | 0 | 31.4s | 64.6% | 14.3% |
| rushed-defense | 999 | 51 | 5.1% | 0 | 19.5s | 32.0% | 88.8% |
| mixed | 901 | 800 | 88.8% | 0 | 28.1s | 69.7% | 9.2% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1453 | 55.8% | 0 | 22.6s | 42.8% | 38.8% |
| pure-unit-matrix | 2398 | 1302 | 54.3% | 0 | 28.9s | 61.4% | 44.6% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 471 | 52.9% | 0 | 26.5s | 59.2% | 46.5% |
| policy-exploration\|TH5 | 869 | 480 | 55.2% | 0 | 21.8s | 35.9% | 35.9% |
| policy-exploration\|TH6 | 869 | 492 | 56.6% | 0 | 22.9s | 43.6% | 39.2% |
| policy-exploration\|TH7 | 864 | 481 | 55.7% | 0 | 23.1s | 48.3% | 41.3% |
| pure-unit-matrix\|TH6 | 800 | 453 | 56.6% | 0 | 29.5s | 61.5% | 42.5% |
| pure-unit-matrix\|TH5 | 707 | 378 | 53.5% | 0 | 31.3s | 64.3% | 44.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1740 | 989 | 56.8% | 0 | 23.0s | 44.3% | 37.4% |
| policy-exploration\|fire_dragon | 1465 | 839 | 57.3% | 0 | 20.6s | 41.1% | 37.2% |
| policy-exploration\|archer | 1449 | 804 | 55.5% | 0 | 22.2s | 41.8% | 38.8% |
| policy-exploration\|mage | 1395 | 760 | 54.5% | 0 | 21.3s | 42.0% | 40.0% |
| policy-exploration\|demon_king | 1366 | 787 | 57.6% | 0 | 22.8s | 45.1% | 36.6% |
| policy-exploration\|mimic | 1333 | 774 | 58.1% | 0 | 23.2s | 42.3% | 35.9% |
| policy-exploration\|pea_shooter | 863 | 465 | 53.9% | 0 | 21.4s | 39.6% | 40.0% |
| policy-exploration\|mechanical_dragon | 691 | 380 | 55.0% | 0 | 21.1s | 41.9% | 40.5% |
| pure-unit-matrix\|archer | 300 | 153 | 51.0% | 0 | 35.2s | 58.8% | 48.9% |
| pure-unit-matrix\|demon_king | 300 | 187 | 62.3% | 0 | 28.8s | 68.4% | 35.5% |
| pure-unit-matrix\|fire_dragon | 300 | 184 | 61.3% | 0 | 20.5s | 67.0% | 38.3% |
| pure-unit-matrix\|knight | 300 | 170 | 56.7% | 0 | 33.2s | 62.3% | 41.3% |
| pure-unit-matrix\|mage | 300 | 137 | 45.7% | 0 | 24.4s | 55.5% | 53.9% |
| pure-unit-matrix\|mimic | 300 | 161 | 53.7% | 0 | 34.0s | 59.8% | 44.6% |
| pure-unit-matrix\|pea_shooter | 300 | 151 | 50.3% | 0 | 28.1s | 59.1% | 48.3% |
| policy-exploration\|necromancer | 225 | 121 | 53.8% | 0 | 23.7s | 45.0% | 44.1% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.2s | 64.8% | 42.6% |
| pure-unit-matrix\|necromancer | 99 | 45 | 45.5% | 0 | 30.8s | 50.7% | 54.0% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 663 | 369 | 55.7% | 0 | 22.2s | 37.0% | 35.3% |
| policy-exploration\|fire_dragon\|TH5 | 568 | 323 | 56.9% | 0 | 20.2s | 35.4% | 34.6% |
| policy-exploration\|archer\|TH5 | 567 | 312 | 55.0% | 0 | 21.3s | 33.9% | 36.1% |
| policy-exploration\|knight\|TH6 | 552 | 327 | 59.2% | 0 | 23.1s | 44.6% | 36.2% |
| policy-exploration\|mage\|TH5 | 531 | 286 | 53.9% | 0 | 20.6s | 35.3% | 37.5% |
| policy-exploration\|knight\|TH7 | 525 | 293 | 55.8% | 0 | 23.9s | 52.3% | 41.3% |
| policy-exploration\|demon_king\|TH5 | 513 | 290 | 56.5% | 0 | 21.9s | 36.6% | 33.7% |
| policy-exploration\|mimic\|TH5 | 513 | 289 | 56.3% | 0 | 22.7s | 35.2% | 34.1% |
| policy-exploration\|fire_dragon\|TH6 | 500 | 289 | 57.8% | 0 | 21.2s | 44.0% | 37.9% |
| policy-exploration\|mage\|TH6 | 469 | 256 | 54.6% | 0 | 21.7s | 41.7% | 40.6% |
| policy-exploration\|archer\|TH6 | 442 | 245 | 55.4% | 0 | 22.7s | 43.5% | 40.0% |
| policy-exploration\|mimic\|TH6 | 442 | 267 | 60.4% | 0 | 23.4s | 43.7% | 35.1% |
| policy-exploration\|archer\|TH7 | 440 | 247 | 56.1% | 0 | 23.0s | 49.4% | 41.3% |
| policy-exploration\|demon_king\|TH6 | 433 | 260 | 60.0% | 0 | 23.0s | 45.0% | 35.2% |
| policy-exploration\|demon_king\|TH7 | 420 | 237 | 56.4% | 0 | 23.8s | 54.6% | 41.6% |
| policy-exploration\|fire_dragon\|TH7 | 397 | 227 | 57.2% | 0 | 20.4s | 45.2% | 39.8% |
| policy-exploration\|mage\|TH7 | 395 | 218 | 55.2% | 0 | 21.9s | 50.4% | 42.6% |
| policy-exploration\|mimic\|TH7 | 378 | 218 | 57.7% | 0 | 23.7s | 49.2% | 39.1% |
| policy-exploration\|mechanical_dragon\|TH6 | 375 | 206 | 54.9% | 0 | 22.1s | 42.9% | 40.2% |
| policy-exploration\|pea_shooter\|TH5 | 327 | 174 | 53.2% | 0 | 20.8s | 34.4% | 37.3% |
| policy-exploration\|mechanical_dragon\|TH7 | 316 | 174 | 55.1% | 0 | 19.8s | 40.7% | 40.9% |
| policy-exploration\|pea_shooter\|TH6 | 297 | 162 | 54.5% | 0 | 22.4s | 42.6% | 40.7% |
| policy-exploration\|pea_shooter\|TH7 | 239 | 129 | 54.0% | 0 | 20.7s | 42.6% | 42.9% |
| policy-exploration\|necromancer\|TH7 | 225 | 121 | 53.8% | 0 | 23.7s | 45.0% | 44.1% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 45 | 44.6% | 0 | 37.9s | 55.3% | 53.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.9s | 55.5% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 29.7s | 70.1% | 32.3% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.8s | 63.2% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 32.5s | 64.7% | 38.6% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.1s | 52.9% | 52.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.8s | 64.7% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 60 | 60.0% | 0 | 33.9s | 64.4% | 37.3% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 51 | 51.0% | 0 | 29.1s | 56.2% | 48.4% |
| pure-unit-matrix\|archer\|TH7 | 99 | 52 | 52.5% | 0 | 31.3s | 59.0% | 47.0% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 25.9s | 62.4% | 41.8% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 18.5s | 66.7% | 39.9% |
| pure-unit-matrix\|knight\|TH7 | 99 | 55 | 55.6% | 0 | 29.7s | 58.6% | 43.5% |
| pure-unit-matrix\|mage\|TH7 | 99 | 45 | 45.5% | 0 | 23.0s | 54.8% | 53.9% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 57 | 57.6% | 0 | 23.5s | 64.9% | 42.4% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 56 | 56.6% | 0 | 30.1s | 59.7% | 42.6% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 45 | 45.5% | 0 | 30.8s | 50.7% | 54.0% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 45 | 45.5% | 0 | 25.8s | 55.6% | 53.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1302 | 54.3% | 0 | 28.9s | 61.4% | 44.6% |
| policy-exploration\|cannon-focus | 456 | 252 | 55.3% | 0 | 26.9s | 64.0% | 43.2% |
| policy-exploration\|none | 423 | 246 | 58.2% | 0 | 27.4s | 64.0% | 40.8% |
| policy-exploration\|cannon-rally | 418 | 231 | 55.3% | 0 | 14.8s | 6.5% | 31.2% |
| policy-exploration\|rally-core | 404 | 218 | 54.0% | 0 | 15.3s | 5.6% | 32.0% |
| policy-exploration\|medkit-entry | 246 | 142 | 57.7% | 0 | 26.1s | 61.3% | 41.7% |
| policy-exploration\|cannon-medkit | 192 | 106 | 55.2% | 0 | 27.8s | 58.8% | 43.8% |
| policy-exploration\|rally-rage | 104 | 60 | 57.7% | 0 | 13.4s | 9.4% | 34.7% |
| policy-exploration\|freeze-defense | 99 | 57 | 57.6% | 0 | 26.0s | 62.6% | 42.1% |
| policy-exploration\|freeze-rage | 92 | 56 | 60.9% | 0 | 23.4s | 67.4% | 39.0% |
| policy-exploration\|freeze-barrel | 64 | 33 | 51.6% | 0 | 29.1s | 57.8% | 46.7% |
| policy-exploration\|rage-entry | 52 | 24 | 46.2% | 0 | 26.9s | 56.1% | 53.0% |
| policy-exploration\|skeleton-barrel | 52 | 28 | 53.8% | 0 | 27.2s | 59.5% | 42.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 282 | 174 | 61.7% | 0 | 23.6s | 43.8% | 35.1% |
| policy-exploration\|left-flank | 272 | 178 | 65.4% | 0 | 23.4s | 40.8% | 27.7% |
| policy-exploration\|center-column | 270 | 151 | 55.9% | 0 | 23.2s | 38.0% | 39.8% |
| policy-exploration\|three-lane | 262 | 146 | 55.7% | 0 | 21.5s | 42.2% | 40.1% |
| policy-exploration\|dual-flank | 259 | 143 | 55.2% | 0 | 23.2s | 48.6% | 39.4% |
| policy-exploration\|wide-line | 259 | 135 | 52.1% | 0 | 21.7s | 44.5% | 42.9% |
| policy-exploration\|edge-sweep | 257 | 141 | 54.9% | 0 | 23.1s | 47.1% | 39.7% |
| policy-exploration\|diamond | 252 | 132 | 52.4% | 0 | 21.4s | 41.7% | 41.9% |
| policy-exploration\|vanguard-wedge | 247 | 125 | 50.6% | 0 | 22.3s | 41.3% | 43.6% |
| policy-exploration\|right-flank | 242 | 128 | 52.9% | 0 | 22.7s | 39.9% | 38.6% |
| pure-unit-matrix\|center-column | 240 | 125 | 52.1% | 0 | 29.3s | 58.9% | 47.5% |
| pure-unit-matrix\|diamond | 240 | 130 | 54.2% | 0 | 29.0s | 62.1% | 44.6% |
| pure-unit-matrix\|dual-flank | 240 | 126 | 52.5% | 0 | 28.0s | 62.8% | 47.1% |
| pure-unit-matrix\|inverted-wedge | 240 | 129 | 53.8% | 0 | 29.8s | 60.5% | 44.9% |
| pure-unit-matrix\|left-flank | 240 | 140 | 58.3% | 0 | 29.1s | 60.8% | 39.9% |
| pure-unit-matrix\|right-flank | 240 | 139 | 57.9% | 0 | 31.7s | 61.5% | 39.1% |
| pure-unit-matrix\|three-lane | 240 | 129 | 53.8% | 0 | 28.0s | 63.7% | 45.1% |
| pure-unit-matrix\|vanguard-wedge | 240 | 126 | 52.5% | 0 | 28.3s | 57.2% | 46.9% |
| pure-unit-matrix\|wide-line | 240 | 127 | 52.9% | 0 | 27.5s | 62.8% | 46.7% |
| pure-unit-matrix\|edge-sweep | 238 | 131 | 55.0% | 0 | 28.3s | 63.4% | 44.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 296 | 55.7% | 0 | 21.9s | 42.7% | 39.6% |
| policy-exploration\|burst | 528 | 305 | 57.8% | 0 | 22.7s | 43.0% | 35.5% |
| policy-exploration\|drip | 521 | 291 | 55.9% | 0 | 22.4s | 41.6% | 39.3% |
| policy-exploration\|two-waves | 518 | 270 | 52.1% | 0 | 23.0s | 41.1% | 41.5% |
| policy-exploration\|three-waves | 504 | 291 | 57.7% | 0 | 23.0s | 45.6% | 37.8% |
| pure-unit-matrix\|burst | 480 | 257 | 53.5% | 0 | 27.7s | 61.1% | 45.8% |
| pure-unit-matrix\|rapid | 480 | 279 | 58.1% | 0 | 29.1s | 63.2% | 40.6% |
| pure-unit-matrix\|three-waves | 480 | 266 | 55.4% | 0 | 29.7s | 62.2% | 42.7% |
| pure-unit-matrix\|two-waves | 480 | 239 | 49.8% | 0 | 28.2s | 59.1% | 49.5% |
| pure-unit-matrix\|drip | 478 | 261 | 54.6% | 0 | 29.8s | 61.2% | 44.6% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 740 | 56.9% | 0 | 22.0s | 43.7% | 37.7% |
| policy-exploration\|tank-front-support-rear | 1301 | 713 | 54.8% | 0 | 23.2s | 41.9% | 39.9% |
| pure-unit-matrix\|roster-order | 1199 | 669 | 55.8% | 0 | 28.6s | 61.9% | 43.3% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 633 | 52.8% | 0 | 29.2s | 60.9% | 46.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 427 | 250 | 58.5% | 0 | 31.6s | 58.2% | 38.3% |
| pure-fire_dragon | 408 | 247 | 60.5% | 0 | 19.3s | 57.6% | 37.4% |
| pure-archer | 398 | 188 | 47.2% | 0 | 33.4s | 54.4% | 51.3% |
| pure-mimic | 398 | 236 | 59.3% | 0 | 31.4s | 52.4% | 38.1% |
| pure-pea_shooter | 393 | 190 | 48.3% | 0 | 26.7s | 54.8% | 50.1% |
| pure-mage | 392 | 174 | 44.4% | 0 | 23.3s | 51.1% | 54.1% |
| pure-demon_king | 383 | 245 | 64.0% | 0 | 28.3s | 66.3% | 33.0% |
| pure-mechanical_dragon | 282 | 162 | 57.4% | 0 | 24.4s | 62.6% | 41.5% |
| random-3 | 134 | 69 | 51.5% | 0 | 22.2s | 41.7% | 39.6% |
| pure-necromancer | 131 | 61 | 46.6% | 0 | 31.3s | 51.6% | 53.1% |
| random-2 | 130 | 72 | 55.4% | 0 | 20.8s | 38.2% | 37.7% |
| melee-pressure | 125 | 73 | 58.4% | 0 | 29.0s | 51.7% | 34.1% |
| frontline-ranged | 124 | 69 | 55.6% | 0 | 19.7s | 38.1% | 39.5% |
| core-fire_dragon-filled | 114 | 73 | 64.0% | 0 | 17.5s | 40.4% | 31.7% |
| balanced | 110 | 69 | 62.7% | 0 | 21.8s | 49.2% | 34.2% |
| support-mix | 107 | 54 | 50.5% | 0 | 25.9s | 46.3% | 47.1% |
| random-6 | 101 | 63 | 62.4% | 0 | 23.3s | 51.7% | 35.5% |
| core-mage-filled | 98 | 39 | 39.8% | 0 | 22.3s | 47.5% | 55.3% |
| hero-necro-dragon-mages | 94 | 59 | 62.8% | 0 | 21.7s | 53.7% | 34.9% |
| random-5 | 94 | 54 | 57.4% | 0 | 23.5s | 49.7% | 36.2% |
| random-4 | 91 | 47 | 51.6% | 0 | 20.4s | 41.5% | 42.9% |
| ranged-pressure | 87 | 46 | 52.9% | 0 | 17.6s | 27.9% | 41.2% |
| trap-runner-mix | 87 | 52 | 59.8% | 0 | 23.3s | 44.8% | 33.2% |
| core-mimic-filled | 86 | 53 | 61.6% | 0 | 30.3s | 50.3% | 32.9% |
| random-1 | 86 | 48 | 55.8% | 0 | 18.9s | 23.3% | 32.9% |
| air-pressure | 68 | 38 | 55.9% | 0 | 16.7s | 27.8% | 39.8% |
| core-mechanical_dragon-filled | 52 | 24 | 46.2% | 0 | 20.9s | 30.9% | 44.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__burst__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 22.2s | 43.9% | 49.0% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 30 | 52.6% | 0 | 25.2s | 57.4% | 45.1% |
| three-lane__rapid__tank-front-support-rear | 57 | 36 | 63.2% | 0 | 29.5s | 69.3% | 36.1% |
| wide-line__drip__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 24.1s | 49.0% | 44.6% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 29.5s | 56.3% | 48.0% |
| inverted-wedge__burst__roster-order | 56 | 38 | 67.9% | 0 | 27.4s | 60.3% | 30.2% |
| inverted-wedge__rapid__roster-order | 56 | 32 | 57.1% | 0 | 25.0s | 47.5% | 41.3% |
| inverted-wedge__two-waves__tank-front-support-rear | 56 | 23 | 41.1% | 0 | 27.7s | 44.2% | 51.7% |
| left-flank__drip__tank-front-support-rear | 56 | 38 | 67.9% | 0 | 26.0s | 53.7% | 30.2% |
| left-flank__three-waves__roster-order | 56 | 33 | 58.9% | 0 | 23.6s | 45.4% | 37.0% |
| left-flank__two-waves__roster-order | 56 | 32 | 57.1% | 0 | 21.4s | 32.2% | 34.7% |
| right-flank__burst__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 29.8s | 53.6% | 44.4% |
| right-flank__drip__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 24.4s | 40.7% | 39.0% |
| vanguard-wedge__burst__roster-order | 56 | 27 | 48.2% | 0 | 26.5s | 52.9% | 47.1% |
| vanguard-wedge__two-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 26.0s | 55.3% | 47.3% |
| center-column__three-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.9s | 45.9% | 47.5% |
| center-column__two-waves__roster-order | 55 | 29 | 52.7% | 0 | 26.6s | 47.3% | 44.2% |
| diamond__burst__roster-order | 55 | 29 | 52.7% | 0 | 23.1s | 49.9% | 41.0% |
| dual-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 21.7s | 48.1% | 41.9% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 26.7s | 62.9% | 41.7% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 24.7s | 48.9% | 41.1% |
| left-flank__three-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 28.7s | 61.1% | 27.2% |
| left-flank__two-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 26.7s | 48.6% | 29.4% |
| three-lane__drip__roster-order | 55 | 28 | 50.9% | 0 | 26.9s | 62.2% | 49.1% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 24.9s | 49.2% | 49.2% |
| wide-line__rapid__roster-order | 55 | 24 | 43.6% | 0 | 22.0s | 43.7% | 53.7% |
| center-column__two-waves__tank-front-support-rear | 54 | 24 | 44.4% | 0 | 23.0s | 36.0% | 51.4% |
| three-lane__drip__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 25.0s | 44.7% | 48.0% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.3s | 52.2% | 48.0% |
| wide-line__rapid__tank-front-support-rear | 54 | 33 | 61.1% | 0 | 25.1s | 55.6% | 36.0% |
| center-column__drip__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 25.7s | 44.2% | 46.5% |
| center-column__rapid__roster-order | 51 | 27 | 52.9% | 0 | 23.6s | 55.9% | 46.1% |
| diamond__drip__roster-order | 51 | 26 | 51.0% | 0 | 24.5s | 53.7% | 47.7% |
| diamond__rapid__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 24.1s | 43.2% | 37.2% |
| dual-flank__burst__roster-order | 51 | 30 | 58.8% | 0 | 27.7s | 65.6% | 40.5% |
| edge-sweep__three-waves__roster-order | 51 | 33 | 64.7% | 0 | 28.0s | 61.0% | 35.3% |
| inverted-wedge__two-waves__roster-order | 51 | 33 | 64.7% | 0 | 29.9s | 65.8% | 34.9% |
| three-lane__burst__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 20.4s | 39.2% | 39.0% |
| three-lane__rapid__roster-order | 51 | 32 | 62.7% | 0 | 21.1s | 44.7% | 34.0% |
| wide-line__three-waves__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 25.6s | 62.3% | 50.1% |
| center-column__burst__roster-order | 50 | 28 | 56.0% | 0 | 28.1s | 50.7% | 38.1% |
| center-column__drip__roster-order | 50 | 24 | 48.0% | 0 | 31.0s | 58.7% | 51.2% |
| center-column__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.3s | 44.6% | 36.4% |
| diamond__burst__tank-front-support-rear | 50 | 33 | 66.0% | 0 | 23.6s | 52.9% | 32.3% |
| diamond__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 28.2s | 60.4% | 38.3% |
| diamond__three-waves__roster-order | 50 | 27 | 54.0% | 0 | 26.6s | 61.3% | 43.2% |
| diamond__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 22.0s | 39.9% | 43.6% |
| dual-flank__drip__roster-order | 50 | 33 | 66.0% | 0 | 29.6s | 63.3% | 33.7% |
| dual-flank__rapid__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 25.8s | 53.4% | 41.7% |
| dual-flank__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 24.1s | 52.5% | 32.8% |
| edge-sweep__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 27.6s | 54.0% | 38.8% |
| edge-sweep__rapid__roster-order | 50 | 29 | 58.0% | 0 | 24.2s | 55.5% | 38.7% |
| inverted-wedge__three-waves__roster-order | 50 | 31 | 62.0% | 0 | 27.6s | 56.3% | 36.5% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 22.4s | 33.1% | 37.3% |
| left-flank__burst__roster-order | 50 | 30 | 60.0% | 0 | 25.0s | 51.0% | 32.7% |
| left-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 23.1s | 41.8% | 35.9% |
| right-flank__burst__roster-order | 50 | 23 | 46.0% | 0 | 25.2s | 46.0% | 47.2% |
| right-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 24.9s | 47.2% | 32.9% |
| right-flank__three-waves__roster-order | 50 | 26 | 52.0% | 0 | 24.5s | 53.3% | 43.2% |
| three-lane__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 25.0s | 59.0% | 30.2% |
| three-lane__two-waves__roster-order | 50 | 25 | 50.0% | 0 | 21.8s | 51.1% | 46.5% |
| vanguard-wedge__rapid__roster-order | 50 | 32 | 64.0% | 0 | 26.7s | 51.5% | 31.8% |
| vanguard-wedge__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 22.1s | 45.4% | 40.3% |
| wide-line__two-waves__roster-order | 50 | 23 | 46.0% | 0 | 22.6s | 45.3% | 45.7% |
| center-column__three-waves__roster-order | 49 | 33 | 67.3% | 0 | 28.1s | 62.1% | 31.2% |
| dual-flank__drip__tank-front-support-rear | 49 | 20 | 40.8% | 0 | 25.6s | 55.5% | 59.2% |
| dual-flank__two-waves__roster-order | 49 | 22 | 44.9% | 0 | 23.8s | 57.6% | 54.6% |
| edge-sweep__drip__roster-order | 49 | 30 | 61.2% | 0 | 25.3s | 46.4% | 32.9% |
| edge-sweep__rapid__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 25.1s | 57.8% | 41.8% |
| inverted-wedge__drip__roster-order | 49 | 28 | 57.1% | 0 | 26.6s | 46.7% | 39.7% |
| right-flank__rapid__roster-order | 49 | 32 | 65.3% | 0 | 25.7s | 55.9% | 33.4% |
| right-flank__three-waves__tank-front-support-rear | 49 | 33 | 67.3% | 0 | 27.9s | 45.8% | 28.8% |
| wide-line__burst__roster-order | 49 | 30 | 61.2% | 0 | 20.8s | 48.6% | 36.8% |
| wide-line__two-waves__tank-front-support-rear | 49 | 22 | 44.9% | 0 | 26.0s | 50.1% | 54.1% |
| center-column__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 20.9s | 32.7% | 39.6% |
| diamond__rapid__roster-order | 45 | 19 | 42.2% | 0 | 27.7s | 56.9% | 55.2% |
| diamond__three-waves__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 29.4s | 56.7% | 42.5% |
| diamond__two-waves__tank-front-support-rear | 45 | 19 | 42.2% | 0 | 22.6s | 42.4% | 53.7% |
| edge-sweep__burst__roster-order | 45 | 30 | 66.7% | 0 | 25.0s | 63.3% | 33.3% |
| left-flank__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 32.4s | 61.7% | 37.1% |
| left-flank__rapid__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 28.0s | 47.6% | 49.0% |
| three-lane__burst__roster-order | 45 | 27 | 60.0% | 0 | 22.8s | 45.1% | 34.7% |
| three-lane__two-waves__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 26.0s | 51.6% | 49.6% |
| wide-line__drip__roster-order | 45 | 26 | 57.8% | 0 | 26.1s | 65.1% | 42.2% |
| wide-line__three-waves__roster-order | 45 | 28 | 62.2% | 0 | 26.7s | 58.3% | 37.8% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 25.5s | 47.8% | 42.5% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 30.5s | 69.6% | 34.1% |
| edge-sweep__burst__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 21.4s | 40.6% | 48.1% |
| edge-sweep__two-waves__roster-order | 44 | 18 | 40.9% | 0 | 23.2s | 55.8% | 58.9% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 27.1s | 47.4% | 41.2% |
| left-flank__rapid__roster-order | 44 | 33 | 75.0% | 0 | 27.3s | 63.0% | 22.5% |
| right-flank__two-waves__roster-order | 44 | 22 | 50.0% | 0 | 29.8s | 54.2% | 42.3% |
| three-lane__three-waves__tank-front-support-rear | 44 | 17 | 38.6% | 0 | 26.8s | 56.0% | 59.8% |
| vanguard-wedge__drip__roster-order | 44 | 22 | 50.0% | 0 | 23.0s | 35.7% | 40.6% |
| vanguard-wedge__three-waves__roster-order | 44 | 17 | 38.6% | 0 | 24.9s | 44.5% | 60.7% |
| wide-line__burst__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 26.4s | 58.3% | 45.4% |
| right-flank__rapid__tank-front-support-rear | 39 | 25 | 64.1% | 0 | 30.9s | 60.9% | 31.3% |
| right-flank__two-waves__tank-front-support-rear | 39 | 20 | 51.3% | 0 | 30.4s | 52.7% | 44.7% |
| vanguard-wedge__drip__tank-front-support-rear | 39 | 20 | 51.3% | 0 | 25.1s | 47.3% | 46.6% |
| vanguard-wedge__three-waves__tank-front-support-rear | 39 | 23 | 59.0% | 0 | 27.7s | 54.0% | 39.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 522 | 303 | 58.0% | 0 | 26.5s | 51.5% | 39.6% |
| left-flank | 512 | 318 | 62.1% | 0 | 26.1s | 50.2% | 33.4% |
| center-column | 510 | 276 | 54.1% | 0 | 26.1s | 47.8% | 43.4% |
| three-lane | 502 | 275 | 54.8% | 0 | 24.6s | 52.5% | 42.5% |
| dual-flank | 499 | 269 | 53.9% | 0 | 25.5s | 55.4% | 43.1% |
| wide-line | 499 | 262 | 52.5% | 0 | 24.5s | 53.3% | 44.8% |
| edge-sweep | 495 | 272 | 54.9% | 0 | 25.6s | 55.0% | 42.0% |
| diamond | 492 | 262 | 53.3% | 0 | 25.1s | 51.7% | 43.2% |
| vanguard-wedge | 487 | 251 | 51.5% | 0 | 25.2s | 49.1% | 45.2% |
| right-flank | 482 | 267 | 55.4% | 0 | 27.2s | 50.6% | 38.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 575 | 56.9% | 0 | 25.3s | 52.5% | 40.1% |
| burst | 1008 | 562 | 55.8% | 0 | 25.1s | 51.7% | 40.4% |
| drip | 999 | 552 | 55.3% | 0 | 26.0s | 51.0% | 41.9% |
| two-waves | 998 | 509 | 51.0% | 0 | 25.5s | 49.8% | 45.3% |
| three-waves | 984 | 557 | 56.6% | 0 | 26.3s | 53.7% | 40.2% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1409 | 56.4% | 0 | 25.2s | 52.4% | 40.4% |
| tank-front-support-rear | 2500 | 1346 | 53.8% | 0 | 26.1s | 51.0% | 42.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2821 | 1548 | 54.9% | 0 | 28.7s | 61.8% | 44.0% |
| cannon-focus | 456 | 252 | 55.3% | 0 | 26.9s | 64.0% | 43.2% |
| cannon-rally | 418 | 231 | 55.3% | 0 | 14.8s | 6.5% | 31.2% |
| rally-core | 404 | 218 | 54.0% | 0 | 15.3s | 5.6% | 32.0% |
| medkit-entry | 246 | 142 | 57.7% | 0 | 26.1s | 61.3% | 41.7% |
| cannon-medkit | 192 | 106 | 55.2% | 0 | 27.8s | 58.8% | 43.8% |
| rally-rage | 104 | 60 | 57.7% | 0 | 13.4s | 9.4% | 34.7% |
| freeze-defense | 99 | 57 | 57.6% | 0 | 26.0s | 62.6% | 42.1% |
| freeze-rage | 92 | 56 | 60.9% | 0 | 23.4s | 67.4% | 39.0% |
| freeze-barrel | 64 | 33 | 51.6% | 0 | 29.1s | 57.8% | 46.7% |
| rage-entry | 52 | 24 | 46.2% | 0 | 26.9s | 56.1% | 53.0% |
| skeleton-barrel | 52 | 28 | 53.8% | 0 | 27.2s | 59.5% | 42.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1327 | 782 | 58.9% | 0 | 23.2s | 53.9% | 37.6% |
| epic | 714 | 427 | 59.8% | 0 | 21.3s | 43.1% | 34.7% |
| legendary | 711 | 412 | 57.9% | 0 | 21.0s | 44.8% | 35.8% |
| unrevealed | 679 | 376 | 55.4% | 0 | 22.4s | 41.8% | 38.9% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 672 | 394 | 58.6% | 0 | 20.5s | 51.6% | 38.5% |
| demon_king\|common | 655 | 388 | 59.2% | 0 | 26.0s | 56.3% | 36.7% |
| fire_dragon\|legendary | 379 | 220 | 58.0% | 0 | 20.5s | 43.9% | 35.4% |
| fire_dragon\|epic | 369 | 220 | 59.6% | 0 | 20.4s | 43.1% | 35.3% |
| demon_king\|epic | 345 | 207 | 60.0% | 0 | 22.3s | 43.0% | 34.2% |
| fire_dragon\|unrevealed | 345 | 189 | 54.8% | 0 | 21.0s | 38.2% | 39.5% |
| demon_king\|unrevealed | 334 | 187 | 56.0% | 0 | 23.8s | 45.6% | 38.3% |
| demon_king\|legendary | 332 | 192 | 57.8% | 0 | 21.6s | 45.7% | 36.3% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1679 | 55.4% | 0 | 27.7s | 57.7% | 42.7% |
| ward-1 | 767 | 435 | 56.7% | 0 | 22.6s | 43.5% | 38.4% |
| ward-2 | 601 | 329 | 54.7% | 0 | 22.9s | 43.1% | 40.3% |
| ward-3 | 600 | 312 | 52.0% | 0 | 21.9s | 40.5% | 41.5% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2755 | 55.1% | 0 | 25.6s | 51.7% | 41.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2040 | 1159 | 56.8% | 0 | 24.5s | 47.0% | 38.0% |
| fire_dragon | 1765 | 1023 | 58.0% | 0 | 20.6s | 45.6% | 37.3% |
| archer | 1749 | 957 | 54.7% | 0 | 24.5s | 44.7% | 40.6% |
| mage | 1695 | 897 | 52.9% | 0 | 21.9s | 44.4% | 42.4% |
| demon_king | 1666 | 974 | 58.5% | 0 | 23.9s | 49.3% | 36.4% |
| mimic | 1633 | 935 | 57.3% | 0 | 25.2s | 45.5% | 37.5% |
| pea_shooter | 1163 | 616 | 53.0% | 0 | 23.1s | 44.7% | 42.2% |
| mechanical_dragon | 890 | 494 | 55.5% | 0 | 22.0s | 47.0% | 41.0% |
| necromancer | 324 | 166 | 51.2% | 0 | 25.9s | 46.7% | 47.2% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 51.0% | 45.4%-56.6% | 58.8% | 48.9% | 27.5% |
| demon_king | 300 | 62.3% | 56.7%-67.6% | 68.4% | 35.5% | 51.7% |
| fire_dragon | 300 | 61.3% | 55.7%-66.7% | 67.0% | 38.3% | 52.1% |
| knight | 300 | 56.7% | 51.0%-62.2% | 62.3% | 41.3% | 37.7% |
| mage | 300 | 45.7% | 40.1%-51.3% | 55.5% | 53.9% | 27.1% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 64.8% | 42.6% | 44.1% |
| mimic | 300 | 53.7% | 48.0%-59.2% | 59.8% | 44.6% | 47.1% |
| necromancer | 99 | 45.5% | 36.0%-55.2% | 50.7% | 54.0% | 35.7% |
| pea_shooter | 300 | 50.3% | 44.7%-56.0% | 59.1% | 48.3% | 32.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.5% | 50.0% | 23.6% |
| archer\|TH7 | 99 | 52.5% | 42.8%-62.1% | 59.0% | 47.0% | 29.3% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 32.3% | 55.0% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 62.4% | 41.8% | 47.5% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.2% | 38.6% | 51.2% |
| fire_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 66.7% | 39.9% | 54.5% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.7% | 38.6% | 40.7% |
| knight\|TH7 | 99 | 55.6% | 45.7%-65.0% | 58.6% | 43.5% | 36.3% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 52.9% | 52.0% | 24.0% |
| mage\|TH7 | 99 | 45.5% | 36.0%-55.2% | 54.8% | 53.9% | 27.8% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 64.7% | 42.9% | 42.2% |
| mechanical_dragon\|TH7 | 99 | 57.6% | 47.7%-66.8% | 64.9% | 42.4% | 46.0% |
| mimic\|TH5 | 101 | 44.6% | 35.2%-54.3% | 55.3% | 53.7% | 34.8% |
| mimic\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.4% | 37.3% | 55.7% |
| mimic\|TH7 | 99 | 56.6% | 46.7%-65.9% | 59.7% | 42.6% | 51.1% |
| necromancer\|TH7 | 99 | 45.5% | 36.0%-55.2% | 50.7% | 54.0% | 35.7% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 51.0% | 41.3%-60.6% | 56.2% | 48.4% | 31.4% |
| pea_shooter\|TH7 | 99 | 45.5% | 36.0%-55.2% | 55.6% | 53.4% | 30.2% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.2% | 50.0% | 27.4% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.3% | 50.0% | 32.6% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 55.2% | 46.7% | 33.8% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 60.4% | 61.1% | 23.3% |
| archer\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 64.5% | 43.7% | 27.3% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.5% | 53.3% | 24.7% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 67.4% | 39.0% | 27.7% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.4% | 53.2% | 25.2% |
| archer\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 48.9% | 53.3% | 24.3% |
| archer\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 50.0% | 53.3% | 28.3% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 50.2% | 53.3% | 25.3% |
| archer\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 60.0% | 50.0% | 21.9% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 54.3% | 60.0% | 25.9% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.7% | 55.6% | 22.3% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 56.1% | 50.0% | 24.1% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 63.1% | 38.9% | 34.9% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.6% | 38.9% | 35.4% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 63.3% | 33.3% | 30.1% |
| demon_king\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 67.4% | 50.0% | 40.7% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.7% | 50.0% | 45.1% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 73.2% | 19.3% | 62.2% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 57.4% | 51.5% | 37.7% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 62.7% | 30.7% | 47.4% |
| demon_king\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.2% | 28.9% | 54.1% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.9% | 32.9% | 56.2% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.7% | 40.0% | 49.6% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 72.7% | 26.7% | 58.5% |
| demon_king\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 73.0% | 34.7% | 55.6% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 76.6% | 25.7% | 58.5% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 67.0% | 47.7% | 37.0% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 65.2% | 38.7% | 51.9% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.0% | 48.6% | 43.2% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.4% | 28.9% | 54.9% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 64.4% | 28.9% | 55.6% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 69.9% | 33.3% | 56.2% |
| demon_king\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 83.3% | 15.9% | 69.8% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.2% | 50.0% | 41.7% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.5% | 50.0% | 41.7% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 69.5% | 33.3% | 65.0% |
| fire_dragon\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.0% | 52.6% | 38.9% |
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
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 61.9% | 38.9% | 47.2% |
| fire_dragon\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.0% | 33.3% | 56.9% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 70.8% | 31.0% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 75.6% | 16.7% | 66.7% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 59.8% | 49.7% | 32.2% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.2% | 49.6% | 37.0% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 65.5% | 36.6% | 45.6% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.7% | 55.2% | 29.3% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.6% | 43.8% | 32.0% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.5% | 35.9% | 34.7% |
| knight\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 61.0% | 41.0% | 34.8% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 61.8% | 42.1% | 36.4% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 60.2% | 33.3% | 44.1% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.5% | 36.8% | 45.3% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 67.0% | 33.3% | 46.4% |
| knight\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 58.5% | 59.4% | 24.1% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 62.7% | 39.7% | 39.7% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 57.8% | 52.3% | 30.1% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 59.3% | 33.3% | 40.0% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 63.8% | 33.3% | 45.4% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 65.7% | 32.2% | 43.5% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 67.0% | 30.6% | 41.0% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.2% | 58.6% | 25.8% |
| mage\|asymmetric-right | 18 | 33.3% | 16.3%-56.3% | 51.9% | 66.1% | 24.7% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.0% | 40.0% | 30.3% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 54.0% | 61.1% | 21.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 57.0% | 52.3% | 26.1% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.5% | 53.3% | 29.7% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 62.7% | 50.0% | 26.3% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 56.4% | 53.3% | 26.7% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 31.5% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 52.3% | 53.3% | 30.9% |
| mage\|kill-corridor | 15 | 33.3% | 15.2%-58.3% | 49.8% | 62.4% | 23.6% |
| mage\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 53.6% | 55.6% | 20.2% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.2% | 53.3% | 26.1% |
| mage\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.5% | 55.6% | 24.2% |
| mage\|southern-funnel | 18 | 27.8% | 12.5%-50.9% | 48.9% | 72.2% | 20.2% |
| mage\|split-core | 18 | 44.4% | 24.6%-66.3% | 56.6% | 55.0% | 30.3% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.1% | 44.4% | 36.4% |
| mage\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 67.8% | 33.3% | 33.8% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 61.7% | 49.8% | 36.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 65.0% | 50.0% | 39.4% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 62.7% | 40.0% | 50.9% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 60.0% | 50.0% | 34.1% |
| mechanical_dragon\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 62.5% | 44.4% | 40.4% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 61.0% | 49.6% | 39.1% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 69.4% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 46.4% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 67.0% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 65.3% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 60.0% | 31.3%-83.2% | 68.7% | 40.0% | 56.4% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 60.3% | 50.0% | 40.2% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 67.0% | 40.0% | 48.2% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.6% | 50.0% | 37.9% |
| mechanical_dragon\|southern-funnel | 12 | 50.0% | 25.4%-74.6% | 62.8% | 49.1% | 30.3% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 65.8% | 33.3% | 50.8% |
| mechanical_dragon\|trap-lanes | 12 | 66.7% | 39.1%-86.2% | 68.9% | 33.3% | 45.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 73.6% | 33.2% | 53.0% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 58.0% | 55.6% | 39.7% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 59.3% | 55.6% | 42.9% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 60.0% | 33.3% | 57.1% |
| mimic\|compact-core | 18 | 38.9% | 20.3%-61.4% | 50.2% | 60.1% | 34.9% |
| mimic\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 62.2% | 38.3% | 51.4% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 54.5% | 40.0% | 43.8% |
| mimic\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 66.9% | 41.1% | 52.4% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 60.9% | 41.1% | 46.7% |
| mimic\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 53.3% |
| mimic\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 61.6% | 40.0% | 54.3% |
| mimic\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 64.5% | 36.9% | 52.4% |
| mimic\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 54.5% | 64.4% | 30.2% |
| mimic\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 60.0% | 44.2% | 52.4% |
| mimic\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 52.8% | 55.6% | 34.9% |
| mimic\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 57.6% | 41.9% | 46.8% |
| mimic\|split-core | 18 | 55.6% | 33.7%-75.4% | 61.9% | 39.4% | 50.8% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 62.7% | 36.8% | 54.8% |
| mimic\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 70.6% | 30.8% | 55.6% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 55.9% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 59.1% | 50.0% | 44.4% |
| necromancer\|compact-core | 6 | 16.7% | 3.0%-56.4% | 40.3% | 83.3% | 16.7% |
| necromancer\|defense-ring | 6 | 33.3% | 9.7%-70.0% | 46.2% | 58.4% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 54.3% | 66.6% | 27.8% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 41.9% | 66.7% | 22.2% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 37.1% | 83.3% | 11.1% |
| necromancer\|split-core | 6 | 50.0% | 18.8%-81.2% | 52.2% | 50.0% | 44.4% |
| necromancer\|trap-lanes | 6 | 66.7% | 30.0%-90.3% | 48.9% | 33.3% | 44.4% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 57.0% | 33.3% | 50.0% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 52.8% | 61.1% | 27.2% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.5% | 53.6% | 34.6% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 58.9% | 40.0% | 40.0% |
| pea_shooter\|compact-core | 18 | 44.4% | 24.6%-66.3% | 57.4% | 54.9% | 24.1% |
| pea_shooter\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 62.2% | 45.4% | 33.3% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 54.3% | 53.3% | 29.6% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.8% | 46.8% | 30.2% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.0% | 40.0% | 40.0% |
| pea_shooter\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 51.6% | 50.2% | 31.1% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.8% | 37.5% | 40.0% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 60.7% | 46.5% | 37.0% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 54.5% | 63.0% | 20.4% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 57.7% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 55.7% | 58.7% | 27.2% |
| pea_shooter\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 56.6% | 55.6% | 31.5% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 65.2% | 40.3% | 37.0% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.4% | 38.9% | 37.0% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.0% | 33.3% | 36.4% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.6% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 98.4% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 97.8% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 98.2% |
| th7-compact-core-272 | 7 | compact-core | maxed | 35 | 0.0% | 96.6% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 96.4% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 96.0% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 94.1% |
| th7-rear-keep-254 | 7 | rear-keep | maxed | 35 | 0.0% | 94.0% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 2.9% | 96.7% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 2.9% | 95.2% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.8% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 97.6% |
| th6-compact-core-271 | 6 | compact-core | maxed | 18 | 0.0% | 96.7% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 96.1% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,924 | 5,932.86 | 1,981 | 1,483.21 |  |
| necromancer | 7 | 15 | 36,018 | 10,998.77 | 2,401.2 | 733.25 |  |
| archer | 7 | 1 | 2,025 | 701.61 | 2,025 | 701.61 |  |
| fire_dragon | 7 | 10 | 15,208 | 6,791.43 | 1,520.8 | 679.14 |  |
| mechanical_dragon | 7 | 4 | 5,704 | 1,616.5 | 1,426 | 404.13 | chain x3 |
| demon_king | 7 | 5 | 18,618 | 2,011.11 | 3,723.6 | 402.22 |  |
| knight | 7 | 1 | 3,612 | 390 | 3,612 | 390 |  |
| mimic | 7 | 6 | 19,488 | 1,428.3 | 3,248 | 238.05 | trap immune |
| horror | 7 | 20 | 38,071 | 4,086.29 | 1,903.55 | 204.31 |  |
| pea_shooter | 7 | 5 | 11,658 | 820.57 | 2,331.6 | 164.11 |  |
| wind_mage | 7 | 15 | 20,880 | 2,372.73 | 1,392 | 158.18 |  |
| ice_golem | 7 | 10 | 38,002 | 1,470.42 | 3,800.2 | 147.04 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
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
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-270 has 0 attacker wins across 15 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-245 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-292 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-295 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-110 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-271 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-104 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-212 has 0 attacker wins across 17 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-260 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 9 controlled/policy-exploration samples.
- 203 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
