# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:08:14.825Z
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
**Lab offense scales:** L5=1x, L6=1x, L7=1.05x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 141.9s

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
| 5000 | 2795 | 55.9% | 0 | 25.7s | 52.5% | 40.7% | 35.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 983 | 56.0% | 0 | 24.9s | 55.5% | 41.9% |
| TH6->TH6 | 1669 | 954 | 57.2% | 0 | 26.1s | 52.6% | 40.2% |
| TH5->TH5 | 1576 | 858 | 54.4% | 0 | 26.1s | 48.7% | 39.8% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 182 | 47.8% | 0 | 23.6s | 47.9% | 49.5% |
| layered-rings | 380 | 173 | 45.5% | 0 | 24.3s | 49.3% | 49.9% |
| asymmetric-right | 376 | 187 | 49.7% | 0 | 24.9s | 52.2% | 46.9% |
| crossfire | 312 | 185 | 59.3% | 0 | 25.5s | 51.1% | 38.1% |
| diamond | 312 | 164 | 52.6% | 0 | 25.0s | 51.4% | 43.5% |
| kill-corridor | 310 | 179 | 57.7% | 0 | 26.9s | 54.3% | 38.0% |
| compact-core | 276 | 110 | 39.9% | 0 | 24.5s | 45.8% | 54.9% |
| split-core | 274 | 176 | 64.2% | 0 | 25.5s | 57.2% | 31.5% |
| trap-lanes | 274 | 181 | 66.1% | 0 | 26.4s | 55.7% | 31.6% |
| wide-spread | 272 | 202 | 74.3% | 0 | 28.3s | 61.1% | 23.9% |
| asymmetric-left | 249 | 117 | 47.0% | 0 | 25.9s | 51.2% | 50.0% |
| southern-funnel | 247 | 142 | 57.5% | 0 | 25.4s | 52.3% | 39.2% |
| defense-ring | 245 | 148 | 60.4% | 0 | 27.0s | 57.2% | 35.2% |
| echelon-left | 233 | 161 | 69.1% | 0 | 27.2s | 53.7% | 29.9% |
| rear-keep | 232 | 112 | 48.3% | 0 | 24.4s | 48.6% | 48.4% |
| corner-keep | 212 | 117 | 55.2% | 0 | 26.2s | 53.1% | 39.5% |
| echelon-right | 208 | 122 | 58.7% | 0 | 26.2s | 52.8% | 36.1% |
| cannon-screen | 207 | 137 | 66.2% | 0 | 27.1s | 54.0% | 33.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 87 | 46.8% | 0 | 23.3s | 49.8% | 50.3% |
| resource-shield\|TH7 | 185 | 91 | 49.2% | 0 | 23.4s | 50.9% | 47.7% |
| asymmetric-right\|TH7 | 184 | 99 | 53.8% | 0 | 23.7s | 52.8% | 43.3% |
| kill-corridor\|TH7 | 151 | 93 | 61.6% | 0 | 25.3s | 56.0% | 35.6% |
| crossfire\|TH7 | 149 | 98 | 65.8% | 0 | 25.1s | 56.8% | 32.3% |
| diamond\|TH7 | 149 | 76 | 51.0% | 0 | 23.2s | 51.2% | 46.8% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 24.8s | 48.7% | 48.8% |
| asymmetric-left\|TH6 | 101 | 52 | 51.5% | 0 | 25.9s | 51.1% | 46.9% |
| layered-rings\|TH6 | 101 | 52 | 51.5% | 0 | 25.0s | 50.9% | 46.2% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 23.2s | 46.4% | 49.2% |
| trap-lanes\|TH6 | 101 | 58 | 57.4% | 0 | 25.4s | 51.9% | 39.8% |
| southern-funnel\|TH6 | 100 | 56 | 56.0% | 0 | 26.8s | 50.0% | 41.1% |
| split-core\|TH6 | 100 | 63 | 63.0% | 0 | 25.6s | 56.7% | 33.6% |
| wide-spread\|TH6 | 99 | 73 | 73.7% | 0 | 28.2s | 62.1% | 24.2% |
| asymmetric-right\|TH6 | 98 | 48 | 49.0% | 0 | 25.1s | 53.2% | 48.9% |
| defense-ring\|TH6 | 98 | 64 | 65.3% | 0 | 27.3s | 57.1% | 32.1% |
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
| diamond\|TH6 | 85 | 49 | 57.6% | 0 | 27.9s | 55.2% | 37.1% |
| echelon-right\|TH6 | 85 | 50 | 58.8% | 0 | 27.3s | 53.7% | 37.6% |
| cannon-screen\|TH6 | 84 | 55 | 65.5% | 0 | 25.4s | 52.0% | 33.5% |
| crossfire\|TH6 | 84 | 41 | 48.8% | 0 | 24.8s | 44.4% | 47.3% |
| echelon-left\|TH6 | 83 | 54 | 65.1% | 0 | 27.3s | 49.5% | 34.4% |
| corner-keep\|TH6 | 82 | 51 | 62.2% | 0 | 25.8s | 54.5% | 35.5% |
| kill-corridor\|TH6 | 82 | 48 | 58.5% | 0 | 29.0s | 57.3% | 37.0% |
| rear-keep\|TH6 | 82 | 41 | 50.0% | 0 | 25.6s | 52.0% | 47.0% |
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
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.6s | 73.4% | 0.0% |
| maxed | 1037 | 35 | 3.4% | 0 | 20.7s | 21.5% | 92.4% |
| mid | 1011 | 837 | 82.8% | 0 | 31.0s | 65.6% | 12.8% |
| rushed-defense | 999 | 59 | 5.9% | 0 | 19.9s | 33.3% | 87.6% |
| mixed | 901 | 812 | 90.1% | 0 | 28.2s | 70.4% | 7.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1470 | 56.5% | 0 | 22.5s | 43.3% | 38.1% |
| pure-unit-matrix | 2398 | 1325 | 55.3% | 0 | 29.0s | 62.4% | 43.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 491 | 55.1% | 0 | 26.7s | 61.3% | 44.0% |
| policy-exploration\|TH5 | 869 | 480 | 55.2% | 0 | 21.8s | 35.9% | 35.9% |
| policy-exploration\|TH6 | 869 | 498 | 57.3% | 0 | 22.7s | 43.9% | 38.6% |
| policy-exploration\|TH7 | 864 | 492 | 56.9% | 0 | 23.0s | 49.5% | 39.7% |
| pure-unit-matrix\|TH6 | 800 | 456 | 57.0% | 0 | 29.7s | 62.0% | 41.9% |
| pure-unit-matrix\|TH5 | 707 | 378 | 53.5% | 0 | 31.3s | 64.3% | 44.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1740 | 1000 | 57.5% | 0 | 22.9s | 44.7% | 37.0% |
| policy-exploration\|fire_dragon | 1465 | 849 | 58.0% | 0 | 20.4s | 41.6% | 36.4% |
| policy-exploration\|archer | 1449 | 810 | 55.9% | 0 | 22.2s | 42.1% | 38.5% |
| policy-exploration\|mage | 1395 | 773 | 55.4% | 0 | 21.2s | 42.6% | 39.0% |
| policy-exploration\|demon_king | 1366 | 794 | 58.1% | 0 | 22.7s | 45.6% | 36.2% |
| policy-exploration\|mimic | 1333 | 774 | 58.1% | 0 | 23.1s | 42.4% | 35.9% |
| policy-exploration\|pea_shooter | 863 | 470 | 54.5% | 0 | 21.2s | 40.1% | 39.3% |
| policy-exploration\|mechanical_dragon | 691 | 390 | 56.4% | 0 | 20.9s | 42.6% | 39.2% |
| pure-unit-matrix\|archer | 300 | 154 | 51.3% | 0 | 34.7s | 59.7% | 48.4% |
| pure-unit-matrix\|demon_king | 300 | 190 | 63.3% | 0 | 28.9s | 69.7% | 34.2% |
| pure-unit-matrix\|fire_dragon | 300 | 187 | 62.3% | 0 | 20.6s | 68.0% | 37.4% |
| pure-unit-matrix\|knight | 300 | 172 | 57.3% | 0 | 33.0s | 63.7% | 40.0% |
| pure-unit-matrix\|mage | 300 | 141 | 47.0% | 0 | 24.4s | 56.8% | 52.6% |
| pure-unit-matrix\|mimic | 300 | 154 | 51.3% | 0 | 35.3s | 58.2% | 46.2% |
| pure-unit-matrix\|pea_shooter | 300 | 159 | 53.0% | 0 | 28.0s | 60.7% | 46.1% |
| policy-exploration\|necromancer | 225 | 125 | 55.6% | 0 | 23.5s | 47.0% | 42.0% |
| pure-unit-matrix\|mechanical_dragon | 199 | 118 | 59.3% | 0 | 25.6s | 66.7% | 40.5% |
| pure-unit-matrix\|necromancer | 99 | 50 | 50.5% | 0 | 31.2s | 54.2% | 48.4% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 663 | 369 | 55.7% | 0 | 22.2s | 37.0% | 35.3% |
| policy-exploration\|fire_dragon\|TH5 | 568 | 323 | 56.9% | 0 | 20.2s | 35.4% | 34.6% |
| policy-exploration\|archer\|TH5 | 567 | 312 | 55.0% | 0 | 21.3s | 33.9% | 36.1% |
| policy-exploration\|knight\|TH6 | 552 | 331 | 60.0% | 0 | 22.8s | 44.8% | 35.8% |
| policy-exploration\|mage\|TH5 | 531 | 286 | 53.9% | 0 | 20.6s | 35.3% | 37.5% |
| policy-exploration\|knight\|TH7 | 525 | 300 | 57.1% | 0 | 23.8s | 53.3% | 40.4% |
| policy-exploration\|demon_king\|TH5 | 513 | 290 | 56.5% | 0 | 21.9s | 36.6% | 33.7% |
| policy-exploration\|mimic\|TH5 | 513 | 289 | 56.3% | 0 | 22.7s | 35.2% | 34.1% |
| policy-exploration\|fire_dragon\|TH6 | 500 | 290 | 58.0% | 0 | 21.0s | 44.3% | 37.6% |
| policy-exploration\|mage\|TH6 | 469 | 260 | 55.4% | 0 | 21.6s | 42.0% | 39.7% |
| policy-exploration\|archer\|TH6 | 442 | 246 | 55.7% | 0 | 22.4s | 43.7% | 39.7% |
| policy-exploration\|mimic\|TH6 | 442 | 269 | 60.9% | 0 | 23.3s | 44.0% | 34.9% |
| policy-exploration\|archer\|TH7 | 440 | 252 | 57.3% | 0 | 23.0s | 50.1% | 40.4% |
| policy-exploration\|demon_king\|TH6 | 433 | 262 | 60.5% | 0 | 22.8s | 45.2% | 34.9% |
| policy-exploration\|demon_king\|TH7 | 420 | 242 | 57.6% | 0 | 23.5s | 56.0% | 40.5% |
| policy-exploration\|fire_dragon\|TH7 | 397 | 236 | 59.4% | 0 | 20.1s | 46.4% | 37.4% |
| policy-exploration\|mage\|TH7 | 395 | 227 | 57.5% | 0 | 21.6s | 52.0% | 40.3% |
| policy-exploration\|mimic\|TH7 | 378 | 216 | 57.1% | 0 | 23.6s | 49.4% | 39.5% |
| policy-exploration\|mechanical_dragon\|TH6 | 375 | 207 | 55.2% | 0 | 21.9s | 43.1% | 40.1% |
| policy-exploration\|pea_shooter\|TH5 | 327 | 174 | 53.2% | 0 | 20.8s | 34.4% | 37.3% |
| policy-exploration\|mechanical_dragon\|TH7 | 316 | 183 | 57.9% | 0 | 19.7s | 42.0% | 38.1% |
| policy-exploration\|pea_shooter\|TH6 | 297 | 162 | 54.5% | 0 | 22.1s | 42.6% | 40.8% |
| policy-exploration\|pea_shooter\|TH7 | 239 | 134 | 56.1% | 0 | 20.8s | 44.1% | 40.2% |
| policy-exploration\|necromancer\|TH7 | 225 | 125 | 55.6% | 0 | 23.5s | 47.0% | 42.0% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 45 | 44.6% | 0 | 37.9s | 55.3% | 53.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 39.2s | 56.7% | 49.4% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 67 | 67.0% | 0 | 29.8s | 70.6% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.7s | 63.4% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 33.0s | 65.1% | 37.8% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.4s | 53.4% | 51.8% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.7s | 65.2% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 60 | 60.0% | 0 | 34.2s | 64.9% | 36.8% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 53 | 53.0% | 0 | 28.6s | 56.8% | 47.0% |
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
| pure-unit-matrix\|none | 2398 | 1325 | 55.3% | 0 | 29.0s | 62.4% | 43.5% |
| policy-exploration\|cannon-focus | 456 | 257 | 56.4% | 0 | 26.8s | 64.7% | 42.2% |
| policy-exploration\|none | 423 | 247 | 58.4% | 0 | 27.1s | 64.2% | 40.5% |
| policy-exploration\|cannon-rally | 418 | 235 | 56.2% | 0 | 14.8s | 6.5% | 30.4% |
| policy-exploration\|rally-core | 404 | 217 | 53.7% | 0 | 15.4s | 5.6% | 31.9% |
| policy-exploration\|medkit-entry | 246 | 146 | 59.3% | 0 | 25.8s | 62.7% | 40.6% |
| policy-exploration\|cannon-medkit | 192 | 105 | 54.7% | 0 | 28.2s | 58.5% | 44.3% |
| policy-exploration\|rally-rage | 104 | 61 | 58.7% | 0 | 13.3s | 9.5% | 32.5% |
| policy-exploration\|freeze-defense | 99 | 56 | 56.6% | 0 | 26.0s | 64.5% | 41.4% |
| policy-exploration\|freeze-rage | 92 | 57 | 62.0% | 0 | 23.5s | 69.4% | 36.7% |
| policy-exploration\|freeze-barrel | 64 | 34 | 53.1% | 0 | 28.5s | 59.7% | 46.9% |
| policy-exploration\|rage-entry | 52 | 26 | 50.0% | 0 | 27.3s | 58.6% | 46.8% |
| policy-exploration\|skeleton-barrel | 52 | 29 | 55.8% | 0 | 26.5s | 59.7% | 44.2% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 282 | 176 | 62.4% | 0 | 23.3s | 44.6% | 34.5% |
| policy-exploration\|left-flank | 272 | 179 | 65.8% | 0 | 23.5s | 41.4% | 27.2% |
| policy-exploration\|center-column | 270 | 151 | 55.9% | 0 | 23.1s | 38.3% | 38.8% |
| policy-exploration\|three-lane | 262 | 148 | 56.5% | 0 | 21.5s | 42.9% | 39.1% |
| policy-exploration\|dual-flank | 259 | 145 | 56.0% | 0 | 23.1s | 49.4% | 38.6% |
| policy-exploration\|wide-line | 259 | 138 | 53.3% | 0 | 21.5s | 45.5% | 42.1% |
| policy-exploration\|edge-sweep | 257 | 143 | 55.6% | 0 | 22.9s | 47.6% | 38.8% |
| policy-exploration\|diamond | 252 | 133 | 52.8% | 0 | 21.5s | 41.9% | 41.8% |
| policy-exploration\|vanguard-wedge | 247 | 127 | 51.4% | 0 | 22.2s | 41.7% | 42.8% |
| policy-exploration\|right-flank | 242 | 130 | 53.7% | 0 | 22.5s | 39.9% | 37.7% |
| pure-unit-matrix\|center-column | 240 | 131 | 54.6% | 0 | 29.5s | 60.8% | 44.6% |
| pure-unit-matrix\|diamond | 240 | 134 | 55.8% | 0 | 29.4s | 63.0% | 43.3% |
| pure-unit-matrix\|dual-flank | 240 | 125 | 52.1% | 0 | 28.2s | 63.4% | 47.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 134 | 55.8% | 0 | 30.6s | 61.9% | 42.6% |
| pure-unit-matrix\|left-flank | 240 | 143 | 59.6% | 0 | 29.2s | 61.8% | 38.6% |
| pure-unit-matrix\|right-flank | 240 | 141 | 58.8% | 0 | 32.1s | 62.3% | 37.5% |
| pure-unit-matrix\|three-lane | 240 | 134 | 55.8% | 0 | 27.5s | 64.7% | 43.1% |
| pure-unit-matrix\|vanguard-wedge | 240 | 124 | 51.7% | 0 | 28.6s | 58.2% | 47.7% |
| pure-unit-matrix\|wide-line | 240 | 128 | 53.3% | 0 | 27.2s | 63.4% | 45.7% |
| pure-unit-matrix\|edge-sweep | 238 | 131 | 55.0% | 0 | 28.2s | 64.5% | 44.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 300 | 56.5% | 0 | 21.9s | 43.3% | 38.7% |
| policy-exploration\|burst | 528 | 307 | 58.1% | 0 | 22.6s | 43.6% | 35.4% |
| policy-exploration\|drip | 521 | 295 | 56.6% | 0 | 22.4s | 42.2% | 38.3% |
| policy-exploration\|two-waves | 518 | 278 | 53.7% | 0 | 22.8s | 41.7% | 40.2% |
| policy-exploration\|three-waves | 504 | 290 | 57.5% | 0 | 22.9s | 45.8% | 37.7% |
| pure-unit-matrix\|burst | 480 | 259 | 54.0% | 0 | 28.2s | 62.2% | 44.9% |
| pure-unit-matrix\|rapid | 480 | 285 | 59.4% | 0 | 29.2s | 64.2% | 39.7% |
| pure-unit-matrix\|three-waves | 480 | 269 | 56.0% | 0 | 29.4s | 63.2% | 41.7% |
| pure-unit-matrix\|two-waves | 480 | 246 | 51.2% | 0 | 28.6s | 60.2% | 47.8% |
| pure-unit-matrix\|drip | 478 | 266 | 55.6% | 0 | 29.8s | 62.2% | 43.5% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 750 | 57.6% | 0 | 22.0s | 44.2% | 36.9% |
| policy-exploration\|tank-front-support-rear | 1301 | 720 | 55.3% | 0 | 23.1s | 42.4% | 39.2% |
| pure-unit-matrix\|roster-order | 1199 | 678 | 56.5% | 0 | 28.8s | 62.9% | 42.3% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 647 | 54.0% | 0 | 29.3s | 61.9% | 44.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 427 | 253 | 59.3% | 0 | 31.2s | 59.4% | 37.4% |
| pure-fire_dragon | 408 | 250 | 61.3% | 0 | 19.3s | 58.4% | 36.5% |
| pure-archer | 398 | 189 | 47.5% | 0 | 33.0s | 55.3% | 50.8% |
| pure-mimic | 398 | 225 | 56.5% | 0 | 32.4s | 51.1% | 39.8% |
| pure-pea_shooter | 393 | 199 | 50.6% | 0 | 26.6s | 56.3% | 47.8% |
| pure-mage | 392 | 181 | 46.2% | 0 | 23.5s | 52.4% | 52.3% |
| pure-demon_king | 383 | 248 | 64.8% | 0 | 28.3s | 67.5% | 31.8% |
| pure-mechanical_dragon | 282 | 167 | 59.2% | 0 | 24.6s | 64.1% | 39.7% |
| random-3 | 134 | 71 | 53.0% | 0 | 22.3s | 42.4% | 38.1% |
| pure-necromancer | 131 | 67 | 51.1% | 0 | 31.5s | 54.8% | 47.7% |
| random-2 | 130 | 73 | 56.2% | 0 | 20.7s | 38.6% | 37.5% |
| melee-pressure | 125 | 74 | 59.2% | 0 | 29.0s | 51.7% | 34.6% |
| frontline-ranged | 124 | 71 | 57.3% | 0 | 19.5s | 38.4% | 38.5% |
| core-fire_dragon-filled | 114 | 74 | 64.9% | 0 | 17.4s | 40.7% | 31.0% |
| balanced | 110 | 69 | 62.7% | 0 | 21.7s | 49.7% | 34.1% |
| support-mix | 107 | 55 | 51.4% | 0 | 25.7s | 47.3% | 47.3% |
| random-6 | 101 | 63 | 62.4% | 0 | 23.4s | 52.6% | 34.4% |
| core-mage-filled | 98 | 42 | 42.9% | 0 | 22.3s | 49.2% | 52.7% |
| hero-necro-dragon-mages | 94 | 59 | 62.8% | 0 | 21.5s | 54.9% | 34.4% |
| random-5 | 94 | 53 | 56.4% | 0 | 22.8s | 49.7% | 37.2% |
| random-4 | 91 | 49 | 53.8% | 0 | 20.2s | 42.4% | 41.3% |
| ranged-pressure | 87 | 48 | 55.2% | 0 | 17.4s | 28.1% | 40.2% |
| trap-runner-mix | 87 | 52 | 59.8% | 0 | 23.1s | 44.6% | 32.5% |
| core-mimic-filled | 86 | 50 | 58.1% | 0 | 31.4s | 47.5% | 36.1% |
| random-1 | 86 | 47 | 54.7% | 0 | 18.6s | 23.5% | 32.7% |
| air-pressure | 68 | 39 | 57.4% | 0 | 16.7s | 28.6% | 37.6% |
| core-mechanical_dragon-filled | 52 | 27 | 51.9% | 0 | 21.4s | 31.8% | 41.1% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__burst__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 23.0s | 45.5% | 48.1% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 30 | 52.6% | 0 | 25.1s | 57.9% | 45.1% |
| three-lane__rapid__tank-front-support-rear | 57 | 36 | 63.2% | 0 | 29.9s | 69.4% | 36.1% |
| wide-line__drip__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 23.6s | 50.3% | 44.6% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 29.2s | 57.1% | 46.2% |
| inverted-wedge__burst__roster-order | 56 | 39 | 69.6% | 0 | 29.4s | 62.3% | 28.1% |
| inverted-wedge__rapid__roster-order | 56 | 33 | 58.9% | 0 | 25.3s | 48.7% | 39.2% |
| inverted-wedge__two-waves__tank-front-support-rear | 56 | 24 | 42.9% | 0 | 27.6s | 45.4% | 51.0% |
| left-flank__drip__tank-front-support-rear | 56 | 40 | 71.4% | 0 | 26.4s | 55.5% | 27.1% |
| left-flank__three-waves__roster-order | 56 | 33 | 58.9% | 0 | 23.8s | 46.7% | 36.8% |
| left-flank__two-waves__roster-order | 56 | 31 | 55.4% | 0 | 21.6s | 32.4% | 35.4% |
| right-flank__burst__tank-front-support-rear | 56 | 25 | 44.6% | 0 | 29.1s | 52.8% | 45.5% |
| right-flank__drip__tank-front-support-rear | 56 | 31 | 55.4% | 0 | 24.7s | 41.1% | 36.1% |
| vanguard-wedge__burst__roster-order | 56 | 28 | 50.0% | 0 | 28.2s | 54.0% | 46.8% |
| vanguard-wedge__two-waves__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 25.6s | 55.1% | 48.2% |
| center-column__three-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.7s | 46.4% | 47.4% |
| center-column__two-waves__roster-order | 55 | 30 | 54.5% | 0 | 27.3s | 49.0% | 41.7% |
| diamond__burst__roster-order | 55 | 30 | 54.5% | 0 | 23.1s | 50.1% | 40.3% |
| dual-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 21.6s | 49.1% | 42.0% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 27.0s | 63.7% | 41.7% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 25.0s | 49.7% | 40.3% |
| left-flank__three-waves__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 28.4s | 61.7% | 26.3% |
| left-flank__two-waves__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 27.2s | 48.9% | 28.9% |
| three-lane__drip__roster-order | 55 | 29 | 52.7% | 0 | 24.5s | 63.4% | 47.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 26.0s | 51.6% | 44.2% |
| wide-line__rapid__roster-order | 55 | 25 | 45.5% | 0 | 22.2s | 44.4% | 52.6% |
| center-column__two-waves__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 22.7s | 37.4% | 49.2% |
| three-lane__drip__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.2s | 45.6% | 44.8% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 24.4s | 52.9% | 47.9% |
| wide-line__rapid__tank-front-support-rear | 54 | 34 | 63.0% | 0 | 24.8s | 56.1% | 34.5% |
| center-column__drip__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 26.0s | 45.5% | 44.8% |
| center-column__rapid__roster-order | 51 | 27 | 52.9% | 0 | 23.7s | 56.9% | 44.7% |
| diamond__drip__roster-order | 51 | 27 | 52.9% | 0 | 27.3s | 54.5% | 45.2% |
| diamond__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 24.4s | 43.3% | 38.4% |
| dual-flank__burst__roster-order | 51 | 31 | 60.8% | 0 | 27.6s | 66.6% | 39.2% |
| edge-sweep__three-waves__roster-order | 51 | 33 | 64.7% | 0 | 25.8s | 62.0% | 35.3% |
| inverted-wedge__two-waves__roster-order | 51 | 34 | 66.7% | 0 | 28.7s | 66.6% | 32.7% |
| three-lane__burst__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 21.2s | 40.4% | 36.6% |
| three-lane__rapid__roster-order | 51 | 32 | 62.7% | 0 | 20.7s | 44.6% | 33.7% |
| wide-line__three-waves__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 25.7s | 63.1% | 49.4% |
| center-column__burst__roster-order | 50 | 27 | 54.0% | 0 | 27.0s | 51.1% | 38.4% |
| center-column__drip__roster-order | 50 | 25 | 50.0% | 0 | 30.6s | 59.5% | 49.2% |
| center-column__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 26.4s | 46.5% | 33.7% |
| diamond__burst__tank-front-support-rear | 50 | 33 | 66.0% | 0 | 23.2s | 54.0% | 32.3% |
| diamond__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.7s | 61.0% | 38.3% |
| diamond__three-waves__roster-order | 50 | 25 | 50.0% | 0 | 28.0s | 59.8% | 45.7% |
| diamond__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 21.6s | 40.1% | 43.3% |
| dual-flank__drip__roster-order | 50 | 34 | 68.0% | 0 | 30.3s | 64.5% | 31.7% |
| dual-flank__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 25.6s | 52.7% | 43.9% |
| dual-flank__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 23.8s | 52.9% | 32.6% |
| edge-sweep__drip__tank-front-support-rear | 50 | 28 | 56.0% | 0 | 27.0s | 55.0% | 38.1% |
| edge-sweep__rapid__roster-order | 50 | 30 | 60.0% | 0 | 24.0s | 56.0% | 38.4% |
| inverted-wedge__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 27.8s | 57.4% | 35.4% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 22.2s | 33.8% | 35.2% |
| left-flank__burst__roster-order | 50 | 30 | 60.0% | 0 | 25.3s | 52.4% | 32.3% |
| left-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 23.2s | 42.2% | 35.7% |
| right-flank__burst__roster-order | 50 | 24 | 48.0% | 0 | 25.4s | 46.8% | 46.1% |
| right-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 25.3s | 48.0% | 31.1% |
| right-flank__three-waves__roster-order | 50 | 26 | 52.0% | 0 | 24.3s | 54.2% | 42.9% |
| three-lane__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 25.0s | 59.5% | 28.2% |
| three-lane__two-waves__roster-order | 50 | 26 | 52.0% | 0 | 22.0s | 52.8% | 44.5% |
| vanguard-wedge__rapid__roster-order | 50 | 32 | 64.0% | 0 | 26.0s | 52.2% | 32.5% |
| vanguard-wedge__two-waves__roster-order | 50 | 30 | 60.0% | 0 | 21.9s | 47.0% | 38.0% |
| wide-line__two-waves__roster-order | 50 | 24 | 48.0% | 0 | 22.8s | 46.1% | 43.2% |
| center-column__three-waves__roster-order | 49 | 35 | 71.4% | 0 | 28.1s | 63.4% | 27.2% |
| dual-flank__drip__tank-front-support-rear | 49 | 19 | 38.8% | 0 | 24.9s | 56.1% | 60.6% |
| dual-flank__two-waves__roster-order | 49 | 23 | 46.9% | 0 | 24.2s | 58.4% | 52.7% |
| edge-sweep__drip__roster-order | 49 | 30 | 61.2% | 0 | 25.0s | 46.5% | 32.6% |
| edge-sweep__rapid__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 25.3s | 58.8% | 41.8% |
| inverted-wedge__drip__roster-order | 49 | 28 | 57.1% | 0 | 26.3s | 47.3% | 39.1% |
| right-flank__rapid__roster-order | 49 | 32 | 65.3% | 0 | 25.6s | 56.9% | 34.0% |
| right-flank__three-waves__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 28.2s | 45.4% | 28.3% |
| wide-line__burst__roster-order | 49 | 30 | 61.2% | 0 | 20.7s | 48.9% | 36.4% |
| wide-line__two-waves__tank-front-support-rear | 49 | 21 | 42.9% | 0 | 26.2s | 50.2% | 54.5% |
| center-column__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 21.0s | 33.5% | 37.5% |
| diamond__rapid__roster-order | 45 | 21 | 46.7% | 0 | 26.8s | 59.1% | 52.1% |
| diamond__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 28.5s | 57.6% | 40.4% |
| diamond__two-waves__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 22.9s | 43.3% | 51.0% |
| edge-sweep__burst__roster-order | 45 | 29 | 64.4% | 0 | 26.3s | 63.6% | 35.5% |
| left-flank__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 31.9s | 62.3% | 37.0% |
| left-flank__rapid__tank-front-support-rear | 45 | 22 | 48.9% | 0 | 27.9s | 48.6% | 45.7% |
| three-lane__burst__roster-order | 45 | 26 | 57.8% | 0 | 22.7s | 45.4% | 35.5% |
| three-lane__two-waves__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 25.9s | 53.0% | 47.4% |
| wide-line__drip__roster-order | 45 | 26 | 57.8% | 0 | 26.6s | 66.5% | 41.9% |
| wide-line__three-waves__roster-order | 45 | 28 | 62.2% | 0 | 24.4s | 58.5% | 37.8% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 25.1s | 48.6% | 42.1% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 30.9s | 69.7% | 34.1% |
| edge-sweep__burst__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 21.4s | 41.5% | 47.8% |
| edge-sweep__two-waves__roster-order | 44 | 19 | 43.2% | 0 | 24.1s | 57.5% | 55.3% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 26.8s | 48.7% | 38.9% |
| left-flank__rapid__roster-order | 44 | 33 | 75.0% | 0 | 27.3s | 62.7% | 21.5% |
| right-flank__two-waves__roster-order | 44 | 22 | 50.0% | 0 | 29.6s | 54.3% | 41.6% |
| three-lane__three-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 26.5s | 57.2% | 58.6% |
| vanguard-wedge__drip__roster-order | 44 | 22 | 50.0% | 0 | 23.2s | 36.7% | 40.0% |
| vanguard-wedge__three-waves__roster-order | 44 | 15 | 34.1% | 0 | 26.5s | 44.8% | 63.7% |
| wide-line__burst__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 26.0s | 60.1% | 42.3% |
| right-flank__rapid__tank-front-support-rear | 39 | 26 | 66.7% | 0 | 30.8s | 60.8% | 30.0% |
| right-flank__two-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 31.8s | 54.8% | 38.7% |
| vanguard-wedge__drip__tank-front-support-rear | 39 | 18 | 46.2% | 0 | 24.6s | 46.6% | 51.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 26.9s | 54.1% | 40.5% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 522 | 310 | 59.4% | 0 | 26.6s | 52.5% | 38.2% |
| left-flank | 512 | 322 | 62.9% | 0 | 26.2s | 51.0% | 32.5% |
| center-column | 510 | 282 | 55.3% | 0 | 26.1s | 48.9% | 41.6% |
| three-lane | 502 | 282 | 56.2% | 0 | 24.4s | 53.4% | 41.0% |
| dual-flank | 499 | 270 | 54.1% | 0 | 25.6s | 56.1% | 42.8% |
| wide-line | 499 | 266 | 53.3% | 0 | 24.2s | 54.1% | 43.9% |
| edge-sweep | 495 | 274 | 55.4% | 0 | 25.4s | 55.7% | 41.5% |
| diamond | 492 | 267 | 54.3% | 0 | 25.3s | 52.2% | 42.5% |
| vanguard-wedge | 487 | 251 | 51.5% | 0 | 25.4s | 49.9% | 45.2% |
| right-flank | 482 | 271 | 56.2% | 0 | 27.3s | 51.1% | 37.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 585 | 57.9% | 0 | 25.4s | 53.2% | 39.1% |
| burst | 1008 | 566 | 56.2% | 0 | 25.3s | 52.5% | 39.9% |
| drip | 999 | 561 | 56.2% | 0 | 26.0s | 51.8% | 40.8% |
| two-waves | 998 | 524 | 52.5% | 0 | 25.6s | 50.6% | 43.8% |
| three-waves | 984 | 559 | 56.8% | 0 | 26.1s | 54.3% | 39.7% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1428 | 57.1% | 0 | 25.2s | 53.2% | 39.5% |
| tank-front-support-rear | 2500 | 1367 | 54.7% | 0 | 26.1s | 51.8% | 41.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2821 | 1572 | 55.7% | 0 | 28.8s | 62.7% | 43.0% |
| cannon-focus | 456 | 257 | 56.4% | 0 | 26.8s | 64.7% | 42.2% |
| cannon-rally | 418 | 235 | 56.2% | 0 | 14.8s | 6.5% | 30.4% |
| rally-core | 404 | 217 | 53.7% | 0 | 15.4s | 5.6% | 31.9% |
| medkit-entry | 246 | 146 | 59.3% | 0 | 25.8s | 62.7% | 40.6% |
| cannon-medkit | 192 | 105 | 54.7% | 0 | 28.2s | 58.5% | 44.3% |
| rally-rage | 104 | 61 | 58.7% | 0 | 13.3s | 9.5% | 32.5% |
| freeze-defense | 99 | 56 | 56.6% | 0 | 26.0s | 64.5% | 41.4% |
| freeze-rage | 92 | 57 | 62.0% | 0 | 23.5s | 69.4% | 36.7% |
| freeze-barrel | 64 | 34 | 53.1% | 0 | 28.5s | 59.7% | 46.9% |
| rage-entry | 52 | 26 | 50.0% | 0 | 27.3s | 58.6% | 46.8% |
| skeleton-barrel | 52 | 29 | 55.8% | 0 | 26.5s | 59.7% | 44.2% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1327 | 793 | 59.8% | 0 | 23.2s | 54.7% | 36.7% |
| epic | 714 | 433 | 60.6% | 0 | 21.3s | 43.8% | 34.1% |
| legendary | 711 | 418 | 58.8% | 0 | 20.8s | 45.3% | 35.0% |
| unrevealed | 679 | 376 | 55.4% | 0 | 22.1s | 42.0% | 38.9% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 672 | 399 | 59.4% | 0 | 20.5s | 52.3% | 37.5% |
| demon_king\|common | 655 | 394 | 60.2% | 0 | 26.0s | 57.2% | 35.8% |
| fire_dragon\|legendary | 379 | 223 | 58.8% | 0 | 20.3s | 44.4% | 34.6% |
| fire_dragon\|epic | 369 | 224 | 60.7% | 0 | 20.4s | 43.8% | 34.4% |
| demon_king\|epic | 345 | 209 | 60.6% | 0 | 22.2s | 43.8% | 33.8% |
| fire_dragon\|unrevealed | 345 | 190 | 55.1% | 0 | 20.7s | 38.3% | 39.3% |
| demon_king\|unrevealed | 334 | 186 | 55.7% | 0 | 23.6s | 45.8% | 38.5% |
| demon_king\|legendary | 332 | 195 | 58.7% | 0 | 21.4s | 46.3% | 35.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1705 | 56.2% | 0 | 27.8s | 58.7% | 41.6% |
| ward-1 | 767 | 440 | 57.4% | 0 | 22.5s | 44.2% | 37.2% |
| ward-2 | 601 | 335 | 55.7% | 0 | 22.7s | 43.5% | 39.8% |
| ward-3 | 600 | 315 | 52.5% | 0 | 22.0s | 40.9% | 41.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2795 | 55.9% | 0 | 25.7s | 52.5% | 40.7% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2040 | 1172 | 57.5% | 0 | 24.4s | 47.5% | 37.5% |
| fire_dragon | 1765 | 1036 | 58.7% | 0 | 20.5s | 46.1% | 36.6% |
| archer | 1749 | 964 | 55.1% | 0 | 24.3s | 45.1% | 40.2% |
| mage | 1695 | 914 | 53.9% | 0 | 21.8s | 45.1% | 41.4% |
| demon_king | 1666 | 984 | 59.1% | 0 | 23.8s | 50.0% | 35.8% |
| mimic | 1633 | 928 | 56.8% | 0 | 25.4s | 45.3% | 37.8% |
| pea_shooter | 1163 | 629 | 54.1% | 0 | 23.0s | 45.4% | 41.1% |
| mechanical_dragon | 890 | 508 | 57.1% | 0 | 21.9s | 48.0% | 39.5% |
| necromancer | 324 | 175 | 54.0% | 0 | 25.8s | 49.2% | 43.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 51.3% | 45.7%-56.9% | 59.7% | 48.4% | 28.7% |
| demon_king | 300 | 63.3% | 57.7%-68.6% | 69.7% | 34.2% | 53.2% |
| fire_dragon | 300 | 62.3% | 56.7%-67.6% | 68.0% | 37.4% | 53.0% |
| knight | 300 | 57.3% | 51.7%-62.8% | 63.7% | 40.0% | 39.2% |
| mage | 300 | 47.0% | 41.4%-52.7% | 56.8% | 52.6% | 28.5% |
| mechanical_dragon | 199 | 59.3% | 52.4%-65.9% | 66.7% | 40.5% | 45.8% |
| mimic | 300 | 51.3% | 45.7%-56.9% | 58.2% | 46.2% | 43.8% |
| necromancer | 99 | 50.5% | 40.8%-60.1% | 54.2% | 48.4% | 40.1% |
| pea_shooter | 300 | 53.0% | 47.3%-58.6% | 60.7% | 46.1% | 34.2% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 56.7% | 49.4% | 23.9% |
| archer\|TH7 | 99 | 53.5% | 43.8%-63.0% | 60.4% | 46.3% | 32.5% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 67.0% | 57.3%-75.4% | 70.6% | 30.9% | 55.8% |
| demon_king\|TH7 | 99 | 59.6% | 49.7%-68.7% | 65.7% | 39.3% | 51.3% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.4% | 38.6% | 52.0% |
| fire_dragon\|TH7 | 99 | 62.6% | 52.8%-71.5% | 69.3% | 37.2% | 56.6% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 65.1% | 37.8% | 41.1% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 62.1% | 40.5% | 40.4% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 53.4% | 51.8% | 24.3% |
| mage\|TH7 | 99 | 49.5% | 39.9%-59.2% | 58.0% | 50.2% | 32.0% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 65.2% | 42.9% | 42.5% |
| mechanical_dragon\|TH7 | 99 | 61.6% | 51.8%-70.6% | 68.0% | 38.2% | 49.2% |
| mimic\|TH5 | 101 | 44.6% | 35.2%-54.3% | 55.3% | 53.7% | 34.8% |
| mimic\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.9% | 36.8% | 56.3% |
| mimic\|TH7 | 99 | 49.5% | 39.9%-59.2% | 54.5% | 48.0% | 40.3% |
| necromancer\|TH7 | 99 | 50.5% | 40.8%-60.1% | 54.2% | 48.4% | 40.1% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 53.0% | 43.3%-62.5% | 56.8% | 47.0% | 32.0% |
| pea_shooter\|TH7 | 99 | 51.5% | 41.8%-61.1% | 59.7% | 47.9% | 34.5% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 29.0% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 61.4% | 50.0% | 33.5% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 56.1% | 46.7% | 33.5% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 61.9% | 61.1% | 24.2% |
| archer\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 65.0% | 40.0% | 27.7% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 56.1% | 53.3% | 25.9% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.6% | 38.9% | 30.1% |
| archer\|diamond | 15 | 53.3% | 30.1%-75.2% | 61.6% | 46.7% | 27.7% |
| archer\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 49.5% | 53.3% | 26.7% |
| archer\|echelon-right | 15 | 40.0% | 19.8%-64.3% | 50.9% | 55.9% | 28.6% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 50.9% | 53.4% | 26.7% |
| archer\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 60.4% | 50.0% | 21.9% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 56.8% | 60.0% | 27.6% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 59.1% | 55.6% | 22.5% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 58.0% | 49.2% | 26.8% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 63.3% | 38.9% | 36.5% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 62.3% | 38.9% | 36.4% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.6% | 33.3% | 29.8% |
| demon_king\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 68.4% | 50.0% | 42.0% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.2% | 50.0% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 74.3% | 18.2% | 63.0% |
| demon_king\|compact-core | 18 | 50.0% | 29.0%-71.0% | 60.0% | 47.6% | 39.5% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 64.1% | 25.3% | 49.6% |
| demon_king\|crossfire | 15 | 66.7% | 41.7%-84.8% | 69.3% | 26.4% | 54.8% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 73.9% | 32.9% | 56.8% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 68.9% | 40.0% | 51.1% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 73.4% | 26.7% | 60.0% |
| demon_king\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 73.0% | 33.6% | 57.0% |
| demon_king\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 77.7% | 20.0% | 59.3% |
| demon_king\|layered-rings | 18 | 55.6% | 33.7%-75.4% | 69.5% | 44.4% | 40.7% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 68.0% | 38.7% | 54.1% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.6% | 48.6% | 44.4% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 66.3% | 27.9% | 56.2% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.3% | 28.9% | 57.4% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 71.2% | 33.3% | 58.6% |
| demon_king\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 84.3% | 15.6% | 70.4% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.3% | 50.0% | 41.7% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 68.0% | 50.0% | 43.1% |
| fire_dragon\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 73.0% | 26.7% | 66.7% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.1% | 50.0% | 41.7% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.8% | 45.7% | 41.7% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 66.8% | 33.3% | 56.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 69.9% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.7% | 38.2% | 56.7% |
| fire_dragon\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 70.5% | 26.7% | 55.0% |
| fire_dragon\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 72.3% | 26.7% | 65.0% |
| fire_dragon\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 77.7% | 26.7% | 66.7% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 65.7% | 50.0% | 44.4% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.7% | 40.0% | 53.3% |
| fire_dragon\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.3% | 55.6% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.4% | 33.3% | 50.0% |
| fire_dragon\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.8% | 32.9% | 56.9% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 71.4% | 31.3% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 76.7% | 16.7% | 68.1% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.3% | 49.5% | 33.6% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.7% | 49.6% | 38.4% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 66.1% | 36.6% | 46.2% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.5% | 53.2% | 29.6% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 64.8% | 43.5% | 33.2% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.7% | 36.3% | 36.4% |
| knight\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 62.9% | 37.7% | 38.3% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 60.2% | 41.8% | 36.7% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 61.4% | 33.3% | 45.0% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 65.5% | 25.8% | 45.8% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 69.8% | 32.8% | 47.7% |
| knight\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 60.0% | 53.9% | 26.0% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 64.8% | 39.5% | 40.6% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.5% | 52.3% | 32.0% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 62.5% | 33.3% | 43.3% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 66.9% | 32.9% | 47.8% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.1% | 33.3% | 44.2% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.7% | 29.6% | 43.0% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.7% | 58.6% | 27.3% |
| mage\|asymmetric-right | 18 | 33.3% | 16.3%-56.3% | 52.8% | 66.1% | 25.3% |
| mage\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 58.4% | 33.3% | 32.7% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 55.5% | 61.1% | 21.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 57.4% | 52.3% | 26.7% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.5% | 53.3% | 30.9% |
| mage\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 66.7% | 38.9% | 27.8% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 58.6% | 53.3% | 29.1% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 32.1% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 53.0% | 53.3% | 31.5% |
| mage\|kill-corridor | 15 | 40.0% | 19.8%-64.3% | 50.7% | 60.0% | 25.5% |
| mage\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 56.3% | 53.8% | 22.7% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.2% | 53.3% | 26.7% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 54.4% | 61.1% | 25.3% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 50.9% | 66.7% | 23.7% |
| mage\|split-core | 18 | 44.4% | 24.6%-66.3% | 58.0% | 54.0% | 33.3% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.8% | 44.4% | 37.4% |
| mage\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.3% | 33.3% | 34.8% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 62.8% | 49.7% | 37.9% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 65.3% | 50.0% | 40.9% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 64.7% | 40.0% | 51.8% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 61.7% | 50.0% | 35.6% |
| mechanical_dragon\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 62.8% | 44.4% | 41.4% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 63.3% | 49.6% | 40.9% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.6% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.0% | 40.0% | 48.2% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 69.0% | 40.0% | 48.2% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 67.0% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 80.0% | 49.0%-94.3% | 78.0% | 20.0% | 60.0% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 63.3% | 50.0% | 42.4% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 66.0% | 40.0% | 50.0% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.9% | 50.0% | 37.9% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 67.8% | 39.6% | 37.9% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 65.8% | 33.3% | 52.3% |
| mechanical_dragon\|trap-lanes | 12 | 75.0% | 46.8%-91.1% | 71.7% | 25.0% | 47.0% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.6% | 33.2% | 54.5% |
| mimic\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 55.7% | 56.4% | 36.5% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.3% | 55.6% | 40.5% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 56.8% | 33.3% | 53.3% |
| mimic\|compact-core | 18 | 38.9% | 20.3%-61.4% | 50.2% | 60.0% | 34.1% |
| mimic\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 60.9% | 43.0% | 48.6% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 55.2% | 40.0% | 43.8% |
| mimic\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.4% | 47.0% | 46.0% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 61.6% | 40.9% | 43.8% |
| mimic\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 57.7% | 40.0% | 50.5% |
| mimic\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.2% | 40.0% | 52.4% |
| mimic\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 61.6% | 36.9% | 49.5% |
| mimic\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 51.3% | 66.7% | 26.2% |
| mimic\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 60.2% | 44.3% | 46.7% |
| mimic\|resource-shield | 18 | 33.3% | 16.3%-56.3% | 48.5% | 66.3% | 29.4% |
| mimic\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 57.8% | 41.3% | 45.2% |
| mimic\|split-core | 18 | 50.0% | 29.0%-71.0% | 59.7% | 44.9% | 47.6% |
| mimic\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.7% | 35.4% | 51.6% |
| mimic\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 68.2% | 31.1% | 48.4% |
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
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.2% | 61.1% | 27.8% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.7% | 52.7% | 35.2% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 62.3% | 40.0% | 40.7% |
| pea_shooter\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.8% | 50.0% | 26.5% |
| pea_shooter\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 62.9% | 40.3% | 35.6% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 56.4% | 52.6% | 29.6% |
| pea_shooter\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 67.8% | 38.9% | 35.8% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.5% | 40.0% | 40.7% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.9% | 43.5% | 32.6% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.5% | 37.5% | 40.7% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 60.9% | 46.5% | 37.8% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 57.6% | 63.0% | 19.8% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 58.6% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 56.8% | 50.0% | 30.2% |
| pea_shooter\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 59.1% | 50.0% | 33.3% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 66.3% | 40.3% | 40.7% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 61.0% | 38.9% | 37.7% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.3% | 33.3% | 39.5% |

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
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 97.9% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.8% |
| th6-compact-core-271 | 6 | compact-core | maxed | 18 | 0.0% | 95.9% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 95.8% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH6 has 57.3% attacker wins across 869 samples; authored target is 53.0%-57.0%.
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
- 201 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
