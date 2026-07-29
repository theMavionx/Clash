# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:11:12.852Z
**Seed:** 83004
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 85
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=0.99x, L7=1.05x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 157.2s

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
| 5000 | 2787 | 55.7% | 0 | 25.6s | 52.4% | 40.8% | 35.7% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 983 | 56.0% | 0 | 24.9s | 55.5% | 41.9% |
| TH6->TH6 | 1669 | 946 | 56.7% | 0 | 26.0s | 52.2% | 40.7% |
| TH5->TH5 | 1576 | 858 | 54.4% | 0 | 26.1s | 48.7% | 39.8% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 182 | 47.8% | 0 | 23.6s | 47.9% | 49.5% |
| layered-rings | 380 | 172 | 45.3% | 0 | 24.4s | 49.2% | 50.1% |
| asymmetric-right | 376 | 186 | 49.5% | 0 | 25.0s | 52.3% | 46.9% |
| crossfire | 312 | 184 | 59.0% | 0 | 25.5s | 51.0% | 38.1% |
| diamond | 312 | 163 | 52.2% | 0 | 24.6s | 51.4% | 43.9% |
| kill-corridor | 310 | 179 | 57.7% | 0 | 26.3s | 54.0% | 38.1% |
| compact-core | 276 | 110 | 39.9% | 0 | 24.6s | 45.7% | 54.9% |
| split-core | 274 | 176 | 64.2% | 0 | 25.6s | 57.0% | 31.6% |
| trap-lanes | 274 | 180 | 65.7% | 0 | 26.4s | 55.5% | 32.1% |
| wide-spread | 272 | 201 | 73.9% | 0 | 28.2s | 60.9% | 24.4% |
| asymmetric-left | 249 | 117 | 47.0% | 0 | 26.0s | 51.1% | 50.1% |
| southern-funnel | 247 | 140 | 56.7% | 0 | 25.7s | 52.1% | 39.8% |
| defense-ring | 245 | 147 | 60.0% | 0 | 27.4s | 56.9% | 35.7% |
| echelon-left | 233 | 161 | 69.1% | 0 | 27.4s | 53.6% | 29.9% |
| rear-keep | 232 | 112 | 48.3% | 0 | 24.2s | 48.4% | 48.3% |
| corner-keep | 212 | 117 | 55.2% | 0 | 26.2s | 52.8% | 39.8% |
| echelon-right | 208 | 123 | 59.1% | 0 | 25.6s | 52.6% | 36.3% |
| cannon-screen | 207 | 137 | 66.2% | 0 | 27.5s | 53.9% | 33.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 87 | 46.8% | 0 | 23.3s | 49.8% | 50.3% |
| resource-shield\|TH7 | 185 | 91 | 49.2% | 0 | 23.4s | 50.9% | 47.7% |
| asymmetric-right\|TH7 | 184 | 99 | 53.8% | 0 | 23.7s | 52.8% | 43.3% |
| kill-corridor\|TH7 | 151 | 93 | 61.6% | 0 | 25.3s | 56.0% | 35.6% |
| crossfire\|TH7 | 149 | 98 | 65.8% | 0 | 25.1s | 56.8% | 32.3% |
| diamond\|TH7 | 149 | 76 | 51.0% | 0 | 23.2s | 51.2% | 46.8% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 25.2s | 48.5% | 49.0% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 26.1s | 50.9% | 47.0% |
| layered-rings\|TH6 | 101 | 51 | 50.5% | 0 | 25.3s | 50.6% | 46.8% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 23.2s | 46.2% | 49.3% |
| trap-lanes\|TH6 | 101 | 57 | 56.4% | 0 | 25.4s | 51.3% | 41.2% |
| southern-funnel\|TH6 | 100 | 54 | 54.0% | 0 | 27.5s | 49.5% | 42.6% |
| split-core\|TH6 | 100 | 63 | 63.0% | 0 | 25.9s | 56.2% | 33.9% |
| wide-spread\|TH6 | 99 | 72 | 72.7% | 0 | 28.1s | 61.6% | 25.7% |
| asymmetric-right\|TH6 | 98 | 47 | 48.0% | 0 | 25.3s | 53.4% | 49.0% |
| defense-ring\|TH6 | 98 | 63 | 64.3% | 0 | 28.4s | 56.3% | 33.3% |
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
| diamond\|TH6 | 85 | 48 | 56.5% | 0 | 26.4s | 55.1% | 38.4% |
| echelon-right\|TH6 | 85 | 51 | 60.0% | 0 | 25.8s | 53.3% | 38.0% |
| cannon-screen\|TH6 | 84 | 55 | 65.5% | 0 | 26.2s | 51.6% | 33.5% |
| crossfire\|TH6 | 84 | 40 | 47.6% | 0 | 24.8s | 44.1% | 47.6% |
| echelon-left\|TH6 | 83 | 54 | 65.1% | 0 | 27.9s | 49.3% | 34.4% |
| corner-keep\|TH6 | 82 | 51 | 62.2% | 0 | 25.7s | 53.9% | 36.2% |
| kill-corridor\|TH6 | 82 | 48 | 58.5% | 0 | 26.8s | 56.1% | 37.2% |
| rear-keep\|TH6 | 82 | 41 | 50.0% | 0 | 24.9s | 51.6% | 46.9% |
| compact-core\|TH7 | 80 | 22 | 27.5% | 0 | 22.1s | 41.4% | 70.0% |
| split-core\|TH7 | 80 | 61 | 76.3% | 0 | 25.8s | 66.7% | 23.6% |
| trap-lanes\|TH7 | 80 | 63 | 78.8% | 0 | 27.6s | 65.9% | 21.3% |
| wide-spread\|TH7 | 80 | 57 | 71.3% | 0 | 28.4s | 66.8% | 27.4% |
| crossfire\|TH5 | 79 | 46 | 58.2% | 0 | 27.0s | 46.4% | 39.1% |
| rear-keep\|TH5 | 79 | 44 | 55.7% | 0 | 24.5s | 48.1% | 40.8% |
| cannon-screen\|TH5 | 78 | 55 | 70.5% | 0 | 29.7s | 51.7% | 28.8% |
| diamond\|TH5 | 78 | 39 | 50.0% | 0 | 25.1s | 47.8% | 44.4% |
| echelon-left\|TH5 | 78 | 53 | 67.9% | 0 | 26.8s | 46.7% | 29.7% |
| echelon-right\|TH5 | 78 | 46 | 59.0% | 0 | 24.5s | 45.4% | 32.9% |
| kill-corridor\|TH5 | 77 | 38 | 49.4% | 0 | 27.6s | 47.4% | 43.7% |
| echelon-left\|TH7 | 72 | 54 | 75.0% | 0 | 27.5s | 65.0% | 25.0% |
| rear-keep\|TH7 | 71 | 27 | 38.0% | 0 | 23.0s | 45.3% | 58.4% |
| asymmetric-left\|TH7 | 54 | 24 | 44.4% | 0 | 26.2s | 58.8% | 53.9% |
| defense-ring\|TH7 | 54 | 33 | 61.1% | 0 | 27.2s | 64.0% | 38.9% |
| southern-funnel\|TH7 | 54 | 30 | 55.6% | 0 | 27.4s | 58.3% | 43.9% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 25.8s | 61.4% | 39.4% |
| echelon-right\|TH7 | 45 | 26 | 57.8% | 0 | 26.9s | 62.7% | 38.9% |
| corner-keep\|TH7 | 36 | 15 | 41.7% | 0 | 26.3s | 54.3% | 55.5% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.7s | 73.3% | 0.0% |
| maxed | 1037 | 34 | 3.3% | 0 | 20.6s | 21.3% | 92.6% |
| mid | 1011 | 836 | 82.7% | 0 | 31.1s | 65.5% | 12.9% |
| rushed-defense | 999 | 58 | 5.8% | 0 | 19.9s | 33.0% | 87.9% |
| mixed | 901 | 807 | 89.6% | 0 | 28.2s | 70.2% | 8.2% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1464 | 56.3% | 0 | 22.6s | 43.2% | 38.2% |
| pure-unit-matrix | 2398 | 1323 | 55.2% | 0 | 29.0s | 62.2% | 43.7% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 491 | 55.1% | 0 | 26.7s | 61.3% | 44.0% |
| policy-exploration\|TH5 | 869 | 480 | 55.2% | 0 | 21.8s | 35.9% | 35.9% |
| policy-exploration\|TH6 | 869 | 492 | 56.6% | 0 | 22.8s | 43.6% | 39.1% |
| policy-exploration\|TH7 | 864 | 492 | 56.9% | 0 | 23.0s | 49.5% | 39.7% |
| pure-unit-matrix\|TH6 | 800 | 454 | 56.8% | 0 | 29.5s | 61.6% | 42.4% |
| pure-unit-matrix\|TH5 | 707 | 378 | 53.5% | 0 | 31.3s | 64.3% | 44.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1740 | 996 | 57.2% | 0 | 22.9s | 44.6% | 37.1% |
| policy-exploration\|fire_dragon | 1465 | 847 | 57.8% | 0 | 20.5s | 41.4% | 36.6% |
| policy-exploration\|archer | 1449 | 808 | 55.8% | 0 | 22.2s | 42.0% | 38.6% |
| policy-exploration\|mage | 1395 | 769 | 55.1% | 0 | 21.2s | 42.4% | 39.3% |
| policy-exploration\|demon_king | 1366 | 791 | 57.9% | 0 | 22.7s | 45.6% | 36.3% |
| policy-exploration\|mimic | 1333 | 771 | 57.8% | 0 | 23.2s | 42.3% | 36.1% |
| policy-exploration\|pea_shooter | 863 | 469 | 54.3% | 0 | 21.3s | 40.0% | 39.4% |
| policy-exploration\|mechanical_dragon | 691 | 388 | 56.2% | 0 | 20.9s | 42.4% | 39.4% |
| pure-unit-matrix\|archer | 300 | 154 | 51.3% | 0 | 34.3s | 59.3% | 48.6% |
| pure-unit-matrix\|demon_king | 300 | 189 | 63.0% | 0 | 28.9s | 69.6% | 34.6% |
| pure-unit-matrix\|fire_dragon | 300 | 187 | 62.3% | 0 | 20.6s | 67.9% | 37.4% |
| pure-unit-matrix\|knight | 300 | 172 | 57.3% | 0 | 32.9s | 63.6% | 40.2% |
| pure-unit-matrix\|mage | 300 | 141 | 47.0% | 0 | 24.4s | 56.7% | 52.6% |
| pure-unit-matrix\|mimic | 300 | 154 | 51.3% | 0 | 35.3s | 58.1% | 46.4% |
| pure-unit-matrix\|pea_shooter | 300 | 158 | 52.7% | 0 | 28.1s | 60.5% | 46.4% |
| policy-exploration\|necromancer | 225 | 125 | 55.6% | 0 | 23.5s | 47.0% | 42.0% |
| pure-unit-matrix\|mechanical_dragon | 199 | 118 | 59.3% | 0 | 25.6s | 66.4% | 40.5% |
| pure-unit-matrix\|necromancer | 99 | 50 | 50.5% | 0 | 31.2s | 54.2% | 48.4% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 663 | 369 | 55.7% | 0 | 22.2s | 37.0% | 35.3% |
| policy-exploration\|fire_dragon\|TH5 | 568 | 323 | 56.9% | 0 | 20.2s | 35.4% | 34.6% |
| policy-exploration\|archer\|TH5 | 567 | 312 | 55.0% | 0 | 21.3s | 33.9% | 36.1% |
| policy-exploration\|knight\|TH6 | 552 | 327 | 59.2% | 0 | 23.0s | 44.6% | 36.2% |
| policy-exploration\|mage\|TH5 | 531 | 286 | 53.9% | 0 | 20.6s | 35.3% | 37.5% |
| policy-exploration\|knight\|TH7 | 525 | 300 | 57.1% | 0 | 23.8s | 53.3% | 40.4% |
| policy-exploration\|demon_king\|TH5 | 513 | 290 | 56.5% | 0 | 21.9s | 36.6% | 33.7% |
| policy-exploration\|mimic\|TH5 | 513 | 289 | 56.3% | 0 | 22.7s | 35.2% | 34.1% |
| policy-exploration\|fire_dragon\|TH6 | 500 | 288 | 57.6% | 0 | 21.1s | 43.9% | 38.1% |
| policy-exploration\|mage\|TH6 | 469 | 256 | 54.6% | 0 | 21.5s | 41.6% | 40.6% |
| policy-exploration\|archer\|TH6 | 442 | 244 | 55.2% | 0 | 22.5s | 43.4% | 40.2% |
| policy-exploration\|mimic\|TH6 | 442 | 266 | 60.2% | 0 | 23.3s | 43.7% | 35.3% |
| policy-exploration\|archer\|TH7 | 440 | 252 | 57.3% | 0 | 23.0s | 50.1% | 40.4% |
| policy-exploration\|demon_king\|TH6 | 433 | 259 | 59.8% | 0 | 22.9s | 45.0% | 35.4% |
| policy-exploration\|demon_king\|TH7 | 420 | 242 | 57.6% | 0 | 23.5s | 56.0% | 40.5% |
| policy-exploration\|fire_dragon\|TH7 | 397 | 236 | 59.4% | 0 | 20.1s | 46.4% | 37.4% |
| policy-exploration\|mage\|TH7 | 395 | 227 | 57.5% | 0 | 21.6s | 52.0% | 40.3% |
| policy-exploration\|mimic\|TH7 | 378 | 216 | 57.1% | 0 | 23.6s | 49.4% | 39.5% |
| policy-exploration\|mechanical_dragon\|TH6 | 375 | 205 | 54.7% | 0 | 21.9s | 42.8% | 40.4% |
| policy-exploration\|pea_shooter\|TH5 | 327 | 174 | 53.2% | 0 | 20.8s | 34.4% | 37.3% |
| policy-exploration\|mechanical_dragon\|TH7 | 316 | 183 | 57.9% | 0 | 19.7s | 42.0% | 38.1% |
| policy-exploration\|pea_shooter\|TH6 | 297 | 161 | 54.2% | 0 | 22.2s | 42.4% | 41.0% |
| policy-exploration\|pea_shooter\|TH7 | 239 | 134 | 56.1% | 0 | 20.8s | 44.1% | 40.2% |
| policy-exploration\|necromancer\|TH7 | 225 | 125 | 55.6% | 0 | 23.5s | 47.0% | 42.0% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 45 | 44.6% | 0 | 37.9s | 55.3% | 53.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.9s | 55.7% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 29.7s | 70.2% | 32.2% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.8s | 63.3% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 32.5s | 64.8% | 38.5% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.4s | 53.2% | 52.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.8s | 64.7% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 60 | 60.0% | 0 | 34.1s | 64.5% | 37.3% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 52 | 52.0% | 0 | 28.9s | 56.1% | 48.0% |
| pure-unit-matrix\|archer\|TH7 | 99 | 53 | 53.5% | 0 | 28.4s | 60.4% | 46.3% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 59 | 59.6% | 0 | 26.1s | 65.7% | 39.3% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 62 | 62.6% | 0 | 18.7s | 69.3% | 37.2% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 28.6s | 62.1% | 40.5% |
| pure-unit-matrix\|mage\|TH7 | 99 | 49 | 49.5% | 0 | 22.9s | 58.0% | 50.2% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 61 | 61.6% | 0 | 24.4s | 68.0% | 38.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 49 | 49.5% | 0 | 33.8s | 54.5% | 48.0% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 50 | 50.5% | 0 | 31.2s | 54.2% | 48.4% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 51 | 51.5% | 0 | 26.0s | 59.7% | 47.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1323 | 55.2% | 0 | 29.0s | 62.2% | 43.7% |
| policy-exploration\|cannon-focus | 456 | 256 | 56.1% | 0 | 26.7s | 64.6% | 42.4% |
| policy-exploration\|none | 423 | 247 | 58.4% | 0 | 27.3s | 64.2% | 40.5% |
| policy-exploration\|cannon-rally | 418 | 234 | 56.0% | 0 | 14.8s | 6.5% | 30.6% |
| policy-exploration\|rally-core | 404 | 216 | 53.5% | 0 | 15.4s | 5.6% | 32.1% |
| policy-exploration\|medkit-entry | 246 | 145 | 58.9% | 0 | 25.9s | 62.4% | 40.9% |
| policy-exploration\|cannon-medkit | 192 | 103 | 53.6% | 0 | 28.2s | 57.8% | 45.0% |
| policy-exploration\|rally-rage | 104 | 61 | 58.7% | 0 | 13.3s | 9.5% | 32.5% |
| policy-exploration\|freeze-defense | 99 | 56 | 56.6% | 0 | 26.0s | 64.5% | 41.4% |
| policy-exploration\|freeze-rage | 92 | 57 | 62.0% | 0 | 23.5s | 69.4% | 36.7% |
| policy-exploration\|freeze-barrel | 64 | 34 | 53.1% | 0 | 28.5s | 59.7% | 46.9% |
| policy-exploration\|rage-entry | 52 | 26 | 50.0% | 0 | 27.3s | 58.6% | 46.8% |
| policy-exploration\|skeleton-barrel | 52 | 29 | 55.8% | 0 | 26.5s | 59.7% | 44.2% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 282 | 176 | 62.4% | 0 | 23.5s | 44.4% | 34.6% |
| policy-exploration\|left-flank | 272 | 178 | 65.4% | 0 | 23.5s | 41.3% | 27.3% |
| policy-exploration\|center-column | 270 | 151 | 55.9% | 0 | 23.2s | 38.3% | 38.9% |
| policy-exploration\|three-lane | 262 | 147 | 56.1% | 0 | 21.6s | 42.7% | 39.6% |
| policy-exploration\|dual-flank | 259 | 145 | 56.0% | 0 | 23.2s | 49.3% | 38.6% |
| policy-exploration\|wide-line | 259 | 138 | 53.3% | 0 | 21.5s | 45.4% | 42.2% |
| policy-exploration\|edge-sweep | 257 | 142 | 55.3% | 0 | 22.9s | 47.5% | 39.2% |
| policy-exploration\|diamond | 252 | 133 | 52.8% | 0 | 21.5s | 41.8% | 41.8% |
| policy-exploration\|vanguard-wedge | 247 | 125 | 50.6% | 0 | 22.1s | 41.5% | 43.4% |
| policy-exploration\|right-flank | 242 | 129 | 53.3% | 0 | 22.4s | 39.8% | 37.9% |
| pure-unit-matrix\|center-column | 240 | 131 | 54.6% | 0 | 29.7s | 60.7% | 44.6% |
| pure-unit-matrix\|diamond | 240 | 131 | 54.6% | 0 | 28.8s | 62.8% | 44.3% |
| pure-unit-matrix\|dual-flank | 240 | 125 | 52.1% | 0 | 28.2s | 63.3% | 47.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 134 | 55.8% | 0 | 30.0s | 61.7% | 42.9% |
| pure-unit-matrix\|left-flank | 240 | 143 | 59.6% | 0 | 29.0s | 61.5% | 38.8% |
| pure-unit-matrix\|right-flank | 240 | 141 | 58.8% | 0 | 31.9s | 62.3% | 37.9% |
| pure-unit-matrix\|three-lane | 240 | 134 | 55.8% | 0 | 28.0s | 64.6% | 43.1% |
| pure-unit-matrix\|vanguard-wedge | 240 | 125 | 52.1% | 0 | 28.5s | 58.1% | 47.5% |
| pure-unit-matrix\|wide-line | 240 | 128 | 53.3% | 0 | 27.6s | 63.3% | 45.7% |
| pure-unit-matrix\|edge-sweep | 238 | 131 | 55.0% | 0 | 28.0s | 64.2% | 44.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 299 | 56.3% | 0 | 21.9s | 43.0% | 38.9% |
| policy-exploration\|burst | 528 | 307 | 58.1% | 0 | 22.6s | 43.6% | 35.4% |
| policy-exploration\|drip | 521 | 294 | 56.4% | 0 | 22.5s | 42.1% | 38.4% |
| policy-exploration\|two-waves | 518 | 274 | 52.9% | 0 | 22.9s | 41.6% | 40.7% |
| policy-exploration\|three-waves | 504 | 290 | 57.5% | 0 | 22.9s | 45.8% | 37.8% |
| pure-unit-matrix\|burst | 480 | 259 | 54.0% | 0 | 27.9s | 62.0% | 44.9% |
| pure-unit-matrix\|rapid | 480 | 285 | 59.4% | 0 | 29.2s | 64.1% | 39.7% |
| pure-unit-matrix\|three-waves | 480 | 269 | 56.0% | 0 | 29.5s | 63.1% | 42.0% |
| pure-unit-matrix\|two-waves | 480 | 245 | 51.0% | 0 | 28.5s | 60.0% | 48.0% |
| pure-unit-matrix\|drip | 478 | 265 | 55.4% | 0 | 29.9s | 62.1% | 43.7% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 749 | 57.6% | 0 | 22.1s | 44.2% | 37.0% |
| policy-exploration\|tank-front-support-rear | 1301 | 715 | 55.0% | 0 | 23.0s | 42.2% | 39.5% |
| pure-unit-matrix\|roster-order | 1199 | 678 | 56.5% | 0 | 28.6s | 62.8% | 42.4% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 645 | 53.8% | 0 | 29.3s | 61.7% | 44.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 427 | 253 | 59.3% | 0 | 31.3s | 59.4% | 37.6% |
| pure-fire_dragon | 408 | 250 | 61.3% | 0 | 19.4s | 58.3% | 36.5% |
| pure-archer | 398 | 189 | 47.5% | 0 | 32.7s | 55.0% | 51.0% |
| pure-mimic | 398 | 225 | 56.5% | 0 | 32.4s | 51.1% | 39.9% |
| pure-pea_shooter | 393 | 198 | 50.4% | 0 | 26.7s | 56.1% | 48.0% |
| pure-mage | 392 | 179 | 45.7% | 0 | 23.3s | 52.2% | 52.9% |
| pure-demon_king | 383 | 247 | 64.5% | 0 | 28.3s | 67.4% | 32.2% |
| pure-mechanical_dragon | 282 | 167 | 59.2% | 0 | 24.6s | 63.9% | 39.7% |
| random-3 | 134 | 71 | 53.0% | 0 | 22.3s | 42.3% | 38.1% |
| pure-necromancer | 131 | 67 | 51.1% | 0 | 31.5s | 54.8% | 47.7% |
| random-2 | 130 | 73 | 56.2% | 0 | 20.7s | 38.5% | 37.6% |
| melee-pressure | 125 | 73 | 58.4% | 0 | 28.8s | 51.7% | 34.8% |
| frontline-ranged | 124 | 71 | 57.3% | 0 | 19.5s | 38.4% | 38.5% |
| core-fire_dragon-filled | 114 | 74 | 64.9% | 0 | 17.5s | 40.7% | 31.0% |
| balanced | 110 | 69 | 62.7% | 0 | 21.7s | 49.5% | 34.2% |
| support-mix | 107 | 55 | 51.4% | 0 | 25.7s | 47.2% | 47.3% |
| random-6 | 101 | 63 | 62.4% | 0 | 23.5s | 52.7% | 34.4% |
| core-mage-filled | 98 | 42 | 42.9% | 0 | 22.3s | 49.2% | 52.7% |
| hero-necro-dragon-mages | 94 | 59 | 62.8% | 0 | 21.6s | 54.9% | 34.4% |
| random-5 | 94 | 53 | 56.4% | 0 | 22.8s | 49.6% | 37.2% |
| random-4 | 91 | 48 | 52.7% | 0 | 20.3s | 42.2% | 41.8% |
| ranged-pressure | 87 | 48 | 55.2% | 0 | 17.3s | 27.9% | 40.1% |
| trap-runner-mix | 87 | 51 | 58.6% | 0 | 23.0s | 44.3% | 33.8% |
| core-mimic-filled | 86 | 50 | 58.1% | 0 | 31.4s | 47.5% | 36.0% |
| random-1 | 86 | 47 | 54.7% | 0 | 18.9s | 23.5% | 32.8% |
| air-pressure | 68 | 39 | 57.4% | 0 | 16.6s | 28.0% | 38.1% |
| core-mechanical_dragon-filled | 52 | 26 | 50.0% | 0 | 21.4s | 31.6% | 41.4% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__burst__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 23.0s | 45.5% | 48.2% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 30 | 52.6% | 0 | 25.1s | 57.8% | 45.1% |
| three-lane__rapid__tank-front-support-rear | 57 | 36 | 63.2% | 0 | 29.9s | 69.4% | 36.1% |
| wide-line__drip__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 23.7s | 50.2% | 44.6% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 29.0s | 56.7% | 48.0% |
| inverted-wedge__burst__roster-order | 56 | 39 | 69.6% | 0 | 27.1s | 61.9% | 28.2% |
| inverted-wedge__rapid__roster-order | 56 | 33 | 58.9% | 0 | 25.2s | 48.5% | 39.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 56 | 24 | 42.9% | 0 | 27.4s | 45.3% | 51.3% |
| left-flank__drip__tank-front-support-rear | 56 | 40 | 71.4% | 0 | 26.4s | 55.0% | 27.1% |
| left-flank__three-waves__roster-order | 56 | 33 | 58.9% | 0 | 23.7s | 46.6% | 37.0% |
| left-flank__two-waves__roster-order | 56 | 31 | 55.4% | 0 | 21.5s | 32.2% | 35.5% |
| right-flank__burst__tank-front-support-rear | 56 | 25 | 44.6% | 0 | 29.1s | 52.9% | 45.4% |
| right-flank__drip__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 24.3s | 40.9% | 36.6% |
| vanguard-wedge__burst__roster-order | 56 | 28 | 50.0% | 0 | 28.2s | 54.0% | 46.9% |
| vanguard-wedge__two-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 25.8s | 55.3% | 48.2% |
| center-column__three-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.7s | 46.4% | 47.2% |
| center-column__two-waves__roster-order | 55 | 30 | 54.5% | 0 | 27.5s | 48.8% | 41.7% |
| diamond__burst__roster-order | 55 | 30 | 54.5% | 0 | 23.3s | 50.2% | 40.3% |
| dual-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 21.6s | 48.8% | 42.0% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 27.1s | 63.7% | 41.7% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 25.1s | 49.1% | 40.3% |
| left-flank__three-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 28.6s | 61.6% | 27.2% |
| left-flank__two-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 26.4s | 48.4% | 29.0% |
| three-lane__drip__roster-order | 55 | 29 | 52.7% | 0 | 27.0s | 63.2% | 47.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 28 | 50.9% | 0 | 25.2s | 50.2% | 46.3% |
| wide-line__rapid__roster-order | 55 | 25 | 45.5% | 0 | 22.2s | 44.3% | 52.6% |
| center-column__two-waves__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 22.8s | 37.2% | 49.4% |
| three-lane__drip__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.3s | 45.6% | 44.8% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.3s | 52.8% | 47.9% |
| wide-line__rapid__tank-front-support-rear | 54 | 34 | 63.0% | 0 | 24.8s | 55.8% | 34.5% |
| center-column__drip__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 26.2s | 45.2% | 44.8% |
| center-column__rapid__roster-order | 51 | 27 | 52.9% | 0 | 23.7s | 56.3% | 44.7% |
| diamond__drip__roster-order | 51 | 26 | 51.0% | 0 | 24.7s | 54.3% | 47.1% |
| diamond__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 24.3s | 43.4% | 38.3% |
| dual-flank__burst__roster-order | 51 | 31 | 60.8% | 0 | 27.7s | 66.2% | 39.2% |
| edge-sweep__three-waves__roster-order | 51 | 33 | 64.7% | 0 | 25.8s | 61.9% | 35.3% |
| inverted-wedge__two-waves__roster-order | 51 | 34 | 66.7% | 0 | 30.0s | 66.5% | 32.7% |
| three-lane__burst__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 21.0s | 40.2% | 36.6% |
| three-lane__rapid__roster-order | 51 | 32 | 62.7% | 0 | 20.7s | 44.6% | 33.8% |
| wide-line__three-waves__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 25.7s | 63.0% | 49.4% |
| center-column__burst__roster-order | 50 | 27 | 54.0% | 0 | 27.3s | 51.1% | 38.4% |
| center-column__drip__roster-order | 50 | 25 | 50.0% | 0 | 30.8s | 59.6% | 49.2% |
| center-column__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 26.5s | 46.6% | 33.7% |
| diamond__burst__tank-front-support-rear | 50 | 33 | 66.0% | 0 | 23.3s | 54.0% | 32.3% |
| diamond__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.8s | 61.0% | 38.3% |
| diamond__three-waves__roster-order | 50 | 25 | 50.0% | 0 | 28.1s | 59.8% | 45.9% |
| diamond__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 21.6s | 40.3% | 43.3% |
| dual-flank__drip__roster-order | 50 | 34 | 68.0% | 0 | 30.2s | 64.6% | 31.7% |
| dual-flank__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 25.5s | 52.6% | 43.7% |
| dual-flank__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 23.9s | 53.1% | 32.6% |
| edge-sweep__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 27.4s | 54.7% | 38.1% |
| edge-sweep__rapid__roster-order | 50 | 30 | 60.0% | 0 | 24.1s | 56.1% | 38.4% |
| inverted-wedge__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 27.8s | 57.4% | 35.4% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 22.1s | 33.6% | 35.5% |
| left-flank__burst__roster-order | 50 | 30 | 60.0% | 0 | 25.1s | 52.3% | 32.3% |
| left-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 23.2s | 42.2% | 35.8% |
| right-flank__burst__roster-order | 50 | 24 | 48.0% | 0 | 25.3s | 46.5% | 46.4% |
| right-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 25.4s | 47.9% | 31.5% |
| right-flank__three-waves__roster-order | 50 | 26 | 52.0% | 0 | 24.5s | 54.5% | 42.9% |
| three-lane__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 25.1s | 59.3% | 28.2% |
| three-lane__two-waves__roster-order | 50 | 26 | 52.0% | 0 | 21.9s | 52.7% | 44.5% |
| vanguard-wedge__rapid__roster-order | 50 | 32 | 64.0% | 0 | 26.0s | 52.4% | 32.7% |
| vanguard-wedge__two-waves__roster-order | 50 | 29 | 58.0% | 0 | 21.8s | 46.5% | 38.3% |
| wide-line__two-waves__roster-order | 50 | 24 | 48.0% | 0 | 22.8s | 46.1% | 43.2% |
| center-column__three-waves__roster-order | 49 | 35 | 71.4% | 0 | 28.6s | 63.6% | 27.2% |
| dual-flank__drip__tank-front-support-rear | 49 | 19 | 38.8% | 0 | 25.1s | 56.0% | 60.6% |
| dual-flank__two-waves__roster-order | 49 | 23 | 46.9% | 0 | 24.3s | 58.4% | 52.7% |
| edge-sweep__drip__roster-order | 49 | 30 | 61.2% | 0 | 25.1s | 46.4% | 32.7% |
| edge-sweep__rapid__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 25.4s | 58.6% | 41.8% |
| inverted-wedge__drip__roster-order | 49 | 28 | 57.1% | 0 | 26.3s | 47.5% | 39.7% |
| right-flank__rapid__roster-order | 49 | 32 | 65.3% | 0 | 25.6s | 56.5% | 34.0% |
| right-flank__three-waves__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 28.0s | 45.4% | 29.6% |
| wide-line__burst__roster-order | 49 | 30 | 61.2% | 0 | 20.7s | 48.8% | 36.8% |
| wide-line__two-waves__tank-front-support-rear | 49 | 21 | 42.9% | 0 | 26.2s | 50.5% | 54.5% |
| center-column__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 21.0s | 33.4% | 37.7% |
| diamond__rapid__roster-order | 45 | 21 | 46.7% | 0 | 26.7s | 58.9% | 52.0% |
| diamond__three-waves__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 28.7s | 57.2% | 41.5% |
| diamond__two-waves__tank-front-support-rear | 45 | 19 | 42.2% | 0 | 22.6s | 42.5% | 53.3% |
| edge-sweep__burst__roster-order | 45 | 29 | 64.4% | 0 | 24.9s | 63.0% | 35.5% |
| left-flank__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 32.2s | 62.3% | 37.0% |
| left-flank__rapid__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 28.0s | 48.6% | 45.7% |
| three-lane__burst__roster-order | 45 | 26 | 57.8% | 0 | 22.7s | 45.4% | 35.5% |
| three-lane__two-waves__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 25.7s | 52.2% | 49.6% |
| wide-line__drip__roster-order | 45 | 26 | 57.8% | 0 | 26.7s | 66.5% | 41.9% |
| wide-line__three-waves__roster-order | 45 | 28 | 62.2% | 0 | 26.4s | 58.3% | 37.8% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 25.3s | 48.5% | 42.1% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 30.9s | 69.7% | 34.1% |
| edge-sweep__burst__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 21.4s | 41.3% | 48.1% |
| edge-sweep__two-waves__roster-order | 44 | 19 | 43.2% | 0 | 24.2s | 57.4% | 55.3% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 26.9s | 48.6% | 38.9% |
| left-flank__rapid__roster-order | 44 | 33 | 75.0% | 0 | 27.4s | 62.9% | 21.5% |
| right-flank__two-waves__roster-order | 44 | 22 | 50.0% | 0 | 29.7s | 54.5% | 41.6% |
| three-lane__three-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 26.5s | 57.0% | 58.6% |
| vanguard-wedge__drip__roster-order | 44 | 22 | 50.0% | 0 | 23.3s | 36.7% | 40.0% |
| vanguard-wedge__three-waves__roster-order | 44 | 16 | 36.4% | 0 | 24.7s | 45.1% | 63.0% |
| wide-line__burst__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 26.0s | 60.0% | 42.3% |
| right-flank__rapid__tank-front-support-rear | 39 | 26 | 66.7% | 0 | 30.6s | 60.7% | 30.4% |
| right-flank__two-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 31.2s | 54.8% | 38.6% |
| vanguard-wedge__drip__tank-front-support-rear | 39 | 18 | 46.2% | 0 | 24.5s | 46.4% | 51.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 27.0s | 54.1% | 40.5% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 522 | 310 | 59.4% | 0 | 26.5s | 52.4% | 38.4% |
| left-flank | 512 | 321 | 62.7% | 0 | 26.1s | 50.8% | 32.7% |
| center-column | 510 | 282 | 55.3% | 0 | 26.2s | 48.8% | 41.6% |
| three-lane | 502 | 281 | 56.0% | 0 | 24.7s | 53.2% | 41.3% |
| dual-flank | 499 | 270 | 54.1% | 0 | 25.6s | 56.0% | 42.8% |
| wide-line | 499 | 266 | 53.3% | 0 | 24.4s | 54.0% | 43.9% |
| edge-sweep | 495 | 273 | 55.2% | 0 | 25.3s | 55.5% | 41.8% |
| diamond | 492 | 264 | 53.7% | 0 | 25.1s | 52.1% | 43.0% |
| vanguard-wedge | 487 | 250 | 51.3% | 0 | 25.2s | 49.7% | 45.4% |
| right-flank | 482 | 270 | 56.0% | 0 | 27.2s | 51.0% | 37.9% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 584 | 57.8% | 0 | 25.3s | 53.0% | 39.3% |
| burst | 1008 | 566 | 56.2% | 0 | 25.1s | 52.4% | 39.9% |
| drip | 999 | 559 | 56.0% | 0 | 26.0s | 51.7% | 41.0% |
| two-waves | 998 | 519 | 52.0% | 0 | 25.6s | 50.5% | 44.2% |
| three-waves | 984 | 559 | 56.8% | 0 | 26.1s | 54.2% | 39.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1427 | 57.1% | 0 | 25.2s | 53.1% | 39.6% |
| tank-front-support-rear | 2500 | 1360 | 54.4% | 0 | 26.1s | 51.6% | 42.1% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2821 | 1570 | 55.7% | 0 | 28.7s | 62.5% | 43.2% |
| cannon-focus | 456 | 256 | 56.1% | 0 | 26.7s | 64.6% | 42.4% |
| cannon-rally | 418 | 234 | 56.0% | 0 | 14.8s | 6.5% | 30.6% |
| rally-core | 404 | 216 | 53.5% | 0 | 15.4s | 5.6% | 32.1% |
| medkit-entry | 246 | 145 | 58.9% | 0 | 25.9s | 62.4% | 40.9% |
| cannon-medkit | 192 | 103 | 53.6% | 0 | 28.2s | 57.8% | 45.0% |
| rally-rage | 104 | 61 | 58.7% | 0 | 13.3s | 9.5% | 32.5% |
| freeze-defense | 99 | 56 | 56.6% | 0 | 26.0s | 64.5% | 41.4% |
| freeze-rage | 92 | 57 | 62.0% | 0 | 23.5s | 69.4% | 36.7% |
| freeze-barrel | 64 | 34 | 53.1% | 0 | 28.5s | 59.7% | 46.9% |
| rage-entry | 52 | 26 | 50.0% | 0 | 27.3s | 58.6% | 46.8% |
| skeleton-barrel | 52 | 29 | 55.8% | 0 | 26.5s | 59.7% | 44.2% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1327 | 792 | 59.7% | 0 | 23.2s | 54.6% | 36.8% |
| epic | 714 | 431 | 60.4% | 0 | 21.2s | 43.6% | 34.4% |
| legendary | 711 | 416 | 58.5% | 0 | 20.9s | 45.3% | 35.1% |
| unrevealed | 679 | 375 | 55.2% | 0 | 22.2s | 41.9% | 38.9% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 672 | 399 | 59.4% | 0 | 20.5s | 52.2% | 37.6% |
| demon_king\|common | 655 | 393 | 60.0% | 0 | 26.0s | 57.1% | 36.0% |
| fire_dragon\|legendary | 379 | 222 | 58.6% | 0 | 20.4s | 44.4% | 34.7% |
| fire_dragon\|epic | 369 | 223 | 60.4% | 0 | 20.3s | 43.5% | 34.7% |
| demon_king\|epic | 345 | 208 | 60.3% | 0 | 22.1s | 43.7% | 34.1% |
| fire_dragon\|unrevealed | 345 | 190 | 55.1% | 0 | 20.8s | 38.2% | 39.3% |
| demon_king\|unrevealed | 334 | 185 | 55.4% | 0 | 23.6s | 45.7% | 38.5% |
| demon_king\|legendary | 332 | 194 | 58.4% | 0 | 21.4s | 46.3% | 35.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1702 | 56.1% | 0 | 27.7s | 58.5% | 41.8% |
| ward-1 | 767 | 437 | 57.0% | 0 | 22.6s | 44.0% | 37.6% |
| ward-2 | 601 | 334 | 55.6% | 0 | 22.7s | 43.4% | 39.9% |
| ward-3 | 600 | 314 | 52.3% | 0 | 22.0s | 40.8% | 41.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2787 | 55.7% | 0 | 25.6s | 52.4% | 40.8% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2040 | 1168 | 57.3% | 0 | 24.4s | 47.4% | 37.6% |
| fire_dragon | 1765 | 1034 | 58.6% | 0 | 20.5s | 46.0% | 36.7% |
| archer | 1749 | 962 | 55.0% | 0 | 24.3s | 45.0% | 40.3% |
| mage | 1695 | 910 | 53.7% | 0 | 21.8s | 45.0% | 41.7% |
| demon_king | 1666 | 980 | 58.8% | 0 | 23.8s | 49.9% | 36.0% |
| mimic | 1633 | 925 | 56.6% | 0 | 25.4s | 45.2% | 37.9% |
| pea_shooter | 1163 | 627 | 53.9% | 0 | 23.0s | 45.3% | 41.2% |
| mechanical_dragon | 890 | 506 | 56.9% | 0 | 22.0s | 47.8% | 39.6% |
| necromancer | 324 | 175 | 54.0% | 0 | 25.8s | 49.2% | 43.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 51.3% | 45.7%-56.9% | 59.3% | 48.6% | 28.6% |
| demon_king | 300 | 63.0% | 57.4%-68.3% | 69.6% | 34.6% | 52.9% |
| fire_dragon | 300 | 62.3% | 56.7%-67.6% | 67.9% | 37.4% | 52.8% |
| knight | 300 | 57.3% | 51.7%-62.8% | 63.6% | 40.2% | 39.0% |
| mage | 300 | 47.0% | 41.4%-52.7% | 56.7% | 52.6% | 28.4% |
| mechanical_dragon | 199 | 59.3% | 52.4%-65.9% | 66.4% | 40.5% | 45.7% |
| mimic | 300 | 51.3% | 45.7%-56.9% | 58.1% | 46.4% | 43.6% |
| necromancer | 99 | 50.5% | 40.8%-60.1% | 54.2% | 48.4% | 40.1% |
| pea_shooter | 300 | 52.7% | 47.0%-58.2% | 60.5% | 46.4% | 34.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.7% | 50.0% | 23.6% |
| archer\|TH7 | 99 | 53.5% | 43.8%-63.0% | 60.4% | 46.3% | 32.5% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.2% | 32.2% | 55.0% |
| demon_king\|TH7 | 99 | 59.6% | 49.7%-68.7% | 65.7% | 39.3% | 51.3% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.3% | 38.6% | 51.2% |
| fire_dragon\|TH7 | 99 | 62.6% | 52.8%-71.5% | 69.3% | 37.2% | 56.6% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.8% | 38.5% | 40.7% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 62.1% | 40.5% | 40.4% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 53.2% | 52.0% | 24.0% |
| mage\|TH7 | 99 | 49.5% | 39.9%-59.2% | 58.0% | 50.2% | 32.0% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 64.7% | 42.9% | 42.3% |
| mechanical_dragon\|TH7 | 99 | 61.6% | 51.8%-70.6% | 68.0% | 38.2% | 49.2% |
| mimic\|TH5 | 101 | 44.6% | 35.2%-54.3% | 55.3% | 53.7% | 34.8% |
| mimic\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.5% | 37.3% | 55.7% |
| mimic\|TH7 | 99 | 49.5% | 39.9%-59.2% | 54.5% | 48.0% | 40.3% |
| necromancer\|TH7 | 99 | 50.5% | 40.8%-60.1% | 54.2% | 48.4% | 40.1% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 52.0% | 42.3%-61.5% | 56.1% | 48.0% | 31.7% |
| pea_shooter\|TH7 | 99 | 51.5% | 41.8%-61.1% | 59.7% | 47.9% | 34.5% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.6% | 50.0% | 28.3% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.1% | 50.0% | 33.7% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 55.9% | 46.7% | 33.6% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 61.6% | 61.1% | 24.2% |
| archer\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 65.2% | 40.0% | 28.1% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.5% | 53.3% | 25.9% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.0% | 39.0% | 29.0% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.6% | 53.2% | 26.7% |
| archer\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 49.3% | 53.3% | 26.1% |
| archer\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 50.2% | 53.3% | 28.7% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 51.1% | 53.3% | 27.6% |
| archer\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 60.6% | 50.0% | 22.5% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 55.0% | 60.0% | 27.3% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.7% | 55.6% | 23.0% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 57.6% | 49.2% | 26.4% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 63.1% | 38.9% | 36.0% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.7% | 38.9% | 35.8% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.4% | 33.3% | 30.4% |
| demon_king\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 68.4% | 50.0% | 42.0% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.2% | 50.0% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 73.6% | 18.2% | 63.0% |
| demon_king\|compact-core | 18 | 50.0% | 29.0%-71.0% | 60.2% | 47.6% | 39.5% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 63.2% | 28.7% | 48.9% |
| demon_king\|crossfire | 15 | 66.7% | 41.7%-84.8% | 69.3% | 27.3% | 54.8% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 73.9% | 32.9% | 56.8% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 68.9% | 40.0% | 51.1% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 73.4% | 26.7% | 60.0% |
| demon_king\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 73.0% | 33.6% | 56.3% |
| demon_king\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 77.7% | 20.0% | 59.3% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 68.9% | 47.2% | 38.3% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 68.0% | 38.7% | 54.1% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.6% | 48.6% | 44.4% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 66.3% | 28.9% | 56.2% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.3% | 28.9% | 57.4% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 71.0% | 33.3% | 58.0% |
| demon_king\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 84.3% | 15.6% | 70.4% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.9% | 50.0% | 41.7% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 68.0% | 50.0% | 43.1% |
| fire_dragon\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 73.0% | 26.7% | 66.7% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.1% | 50.0% | 41.7% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.8% | 45.7% | 41.7% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 66.8% | 33.3% | 56.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 69.5% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.7% | 38.2% | 56.7% |
| fire_dragon\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 70.5% | 26.7% | 55.0% |
| fire_dragon\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 72.3% | 26.7% | 65.0% |
| fire_dragon\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 77.7% | 26.7% | 65.0% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 65.5% | 50.0% | 43.1% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.7% | 40.0% | 53.3% |
| fire_dragon\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.3% | 55.6% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.2% | 33.3% | 50.0% |
| fire_dragon\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.6% | 32.9% | 56.9% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 71.4% | 31.3% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 76.5% | 16.7% | 66.7% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.7% | 49.7% | 33.6% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.7% | 49.6% | 38.4% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 65.7% | 36.6% | 46.1% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.8% | 53.2% | 29.6% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 64.5% | 43.8% | 33.2% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.7% | 35.9% | 36.3% |
| knight\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 62.7% | 37.7% | 37.2% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 60.5% | 42.1% | 37.0% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 60.9% | 33.3% | 45.2% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 65.5% | 29.7% | 45.8% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 68.9% | 32.8% | 47.1% |
| knight\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 60.2% | 53.9% | 25.7% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 64.5% | 39.7% | 40.9% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.7% | 52.3% | 31.7% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 62.5% | 33.3% | 43.3% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 66.5% | 32.9% | 47.5% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.3% | 33.3% | 44.9% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.5% | 29.9% | 42.3% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.7% | 58.6% | 27.3% |
| mage\|asymmetric-right | 18 | 33.3% | 16.3%-56.3% | 52.8% | 66.1% | 25.3% |
| mage\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 58.4% | 33.3% | 32.7% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 55.5% | 61.1% | 21.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 57.2% | 52.3% | 26.7% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 30.3% |
| mage\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 66.7% | 38.9% | 27.8% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 58.4% | 53.3% | 28.5% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 32.1% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 53.0% | 53.3% | 31.5% |
| mage\|kill-corridor | 15 | 40.0% | 19.8%-64.3% | 50.5% | 60.0% | 24.8% |
| mage\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 56.3% | 53.8% | 22.7% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.2% | 53.3% | 26.7% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 54.4% | 61.1% | 25.3% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 50.9% | 66.7% | 23.7% |
| mage\|split-core | 18 | 44.4% | 24.6%-66.3% | 57.6% | 55.0% | 32.8% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.5% | 44.4% | 37.4% |
| mage\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.1% | 33.3% | 35.4% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 62.5% | 49.7% | 37.1% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 65.3% | 50.0% | 40.9% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 64.0% | 40.0% | 51.8% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 61.4% | 50.0% | 35.6% |
| mechanical_dragon\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 62.8% | 44.4% | 41.4% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 63.0% | 49.6% | 40.9% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.0% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 48.2% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 68.3% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 66.7% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 80.0% | 49.0%-94.3% | 77.7% | 20.0% | 60.0% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 62.8% | 50.0% | 43.2% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 66.0% | 40.0% | 49.1% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.3% | 50.0% | 37.9% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 67.8% | 39.7% | 37.9% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 65.8% | 33.3% | 52.3% |
| mechanical_dragon\|trap-lanes | 12 | 75.0% | 46.8%-91.1% | 71.1% | 25.0% | 47.0% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.6% | 33.2% | 54.5% |
| mimic\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 55.5% | 56.4% | 36.5% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.3% | 55.6% | 40.5% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 56.8% | 33.3% | 53.3% |
| mimic\|compact-core | 18 | 38.9% | 20.3%-61.4% | 50.0% | 60.0% | 34.1% |
| mimic\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 60.6% | 43.0% | 48.6% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 55.0% | 40.0% | 43.8% |
| mimic\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.4% | 47.0% | 46.0% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 61.6% | 41.1% | 43.8% |
| mimic\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 57.7% | 40.0% | 50.5% |
| mimic\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.2% | 40.0% | 52.4% |
| mimic\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 61.6% | 36.9% | 49.5% |
| mimic\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 51.3% | 66.7% | 26.2% |
| mimic\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 60.2% | 44.1% | 46.7% |
| mimic\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 48.5% | 66.3% | 29.4% |
| mimic\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 57.2% | 41.9% | 43.7% |
| mimic\|split-core | 18 | 50.0% | 29.0%-71.0% | 59.1% | 44.9% | 46.8% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.7% | 36.8% | 51.6% |
| mimic\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 68.2% | 31.8% | 47.6% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 57.5% | 50.0% | 44.4% |
| necromancer\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 58.6% | 50.0% | 44.4% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 45.7% | 66.7% | 22.2% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 48.4% | 50.0% | 33.3% |
| necromancer\|layered-rings | 6 | 50.0% | 18.8%-81.2% | 60.2% | 50.0% | 44.4% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 48.4% | 59.9% | 27.8% |
| necromancer\|southern-funnel | 6 | 33.3% | 9.7%-70.0% | 41.9% | 66.7% | 16.7% |
| necromancer\|split-core | 6 | 66.7% | 30.0%-90.3% | 53.8% | 33.3% | 61.1% |
| necromancer\|trap-lanes | 6 | 66.7% | 30.0%-90.3% | 54.8% | 33.3% | 50.0% |
| necromancer\|wide-spread | 6 | 50.0% | 18.8%-81.2% | 59.1% | 50.0% | 44.4% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 53.6% | 61.1% | 27.8% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 59.3% | 52.7% | 34.6% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 62.3% | 40.0% | 40.7% |
| pea_shooter\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.3% | 50.0% | 25.3% |
| pea_shooter\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 62.9% | 40.3% | 35.6% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 56.1% | 52.6% | 29.6% |
| pea_shooter\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 66.1% | 44.4% | 34.0% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.5% | 40.0% | 40.7% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.9% | 43.5% | 32.6% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.2% | 37.5% | 41.5% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 60.5% | 46.5% | 37.8% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 57.6% | 63.0% | 19.8% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 58.4% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 56.8% | 50.0% | 30.2% |
| pea_shooter\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 59.3% | 50.0% | 33.3% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 66.3% | 40.3% | 40.7% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.0% | 38.9% | 37.7% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.9% | 33.3% | 40.7% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.3% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 96.9% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 97.7% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 0.0% | 96.8% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 96.0% |
| th7-compact-core-272 | 7 | compact-core | maxed | 35 | 0.0% | 95.9% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 95.7% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 95.2% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 93.1% |
| th7-rear-keep-254 | 7 | rear-keep | maxed | 35 | 0.0% | 92.7% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 2.8% | 95.1% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.9% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 97.6% |
| th6-compact-core-271 | 6 | compact-core | maxed | 18 | 0.0% | 96.7% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 96.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,607 | 6,445.71 | 2,151.75 | 1,611.43 |  |
| necromancer | 7 | 15 | 39,123 | 11,946.91 | 2,608.2 | 796.46 |  |
| archer | 7 | 1 | 2,200 | 762.9 | 2,200 | 762.9 |  |
| fire_dragon | 7 | 10 | 16,519 | 7,377.14 | 1,651.9 | 737.71 |  |
| mechanical_dragon | 7 | 4 | 6,195 | 1,756.31 | 1,548.75 | 439.08 | chain x3 |
| demon_king | 7 | 5 | 20,223 | 2,184.44 | 4,044.6 | 436.89 |  |
| knight | 7 | 1 | 3,924 | 424.44 | 3,924 | 424.44 |  |
| horror | 7 | 20 | 41,353 | 4,438.71 | 2,067.65 | 221.94 |  |
| mimic | 7 | 6 | 17,010 | 1,248.11 | 2,835 | 208.02 | trap immune |
| pea_shooter | 7 | 5 | 12,663 | 890.86 | 2,532.6 | 178.17 |  |
| wind_mage | 7 | 15 | 22,680 | 2,577.27 | 1,512 | 171.82 |  |
| ice_golem | 7 | 10 | 41,278 | 1,597.18 | 4,127.8 | 159.72 | defense priority |

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
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-120 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-228 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-138 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-075 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-237 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-024 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-293 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-296 has 0 attacker wins across 9 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 9 controlled/policy-exploration samples.
- 202 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
