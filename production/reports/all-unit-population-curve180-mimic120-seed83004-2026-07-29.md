# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:39:16.772Z
**Seed:** 83004
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 68
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.95x
**Lab late-tier troop scales:** mimic=1.2x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 124.1s

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
| 5000 | 2841 | 56.8% | 0 | 25.6s | 52.8% | 39.6% | 35.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 972 | 55.4% | 0 | 24.9s | 54.7% | 42.5% |
| TH6->TH6 | 1669 | 971 | 58.2% | 0 | 26.0s | 53.1% | 39.0% |
| TH5->TH5 | 1576 | 898 | 57.0% | 0 | 26.0s | 50.1% | 36.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 381 | 187 | 49.1% | 0 | 24.0s | 48.3% | 48.2% |
| layered-rings | 380 | 180 | 47.4% | 0 | 24.4s | 49.4% | 48.0% |
| asymmetric-right | 376 | 187 | 49.7% | 0 | 25.1s | 52.6% | 46.1% |
| crossfire | 312 | 188 | 60.3% | 0 | 25.8s | 51.5% | 36.6% |
| diamond | 312 | 169 | 54.2% | 0 | 24.4s | 52.0% | 42.3% |
| kill-corridor | 310 | 179 | 57.7% | 0 | 25.9s | 54.2% | 37.8% |
| compact-core | 276 | 114 | 41.3% | 0 | 24.8s | 46.0% | 53.3% |
| split-core | 274 | 179 | 65.3% | 0 | 25.6s | 57.7% | 30.5% |
| trap-lanes | 274 | 181 | 66.1% | 0 | 25.8s | 55.8% | 31.3% |
| wide-spread | 272 | 206 | 75.7% | 0 | 28.1s | 61.6% | 22.5% |
| asymmetric-left | 249 | 120 | 48.2% | 0 | 26.4s | 52.4% | 47.8% |
| southern-funnel | 247 | 142 | 57.5% | 0 | 25.6s | 52.3% | 39.3% |
| defense-ring | 245 | 148 | 60.4% | 0 | 27.4s | 57.4% | 34.6% |
| echelon-left | 233 | 163 | 70.0% | 0 | 27.0s | 54.5% | 29.1% |
| rear-keep | 232 | 112 | 48.3% | 0 | 23.8s | 48.4% | 47.5% |
| corner-keep | 212 | 121 | 57.1% | 0 | 25.9s | 53.1% | 38.0% |
| echelon-right | 208 | 127 | 61.1% | 0 | 26.2s | 53.4% | 34.0% |
| cannon-screen | 207 | 138 | 66.7% | 0 | 27.5s | 54.4% | 32.6% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 186 | 88 | 47.3% | 0 | 23.1s | 48.5% | 50.1% |
| resource-shield\|TH7 | 185 | 94 | 50.8% | 0 | 23.8s | 50.6% | 46.4% |
| asymmetric-right\|TH7 | 184 | 96 | 52.2% | 0 | 23.9s | 52.2% | 44.3% |
| kill-corridor\|TH7 | 151 | 88 | 58.3% | 0 | 24.6s | 54.9% | 38.5% |
| crossfire\|TH7 | 149 | 99 | 66.4% | 0 | 25.1s | 56.4% | 31.7% |
| diamond\|TH7 | 149 | 78 | 52.3% | 0 | 23.2s | 50.8% | 46.3% |
| compact-core\|TH6 | 103 | 52 | 50.5% | 0 | 25.9s | 49.9% | 45.7% |
| asymmetric-left\|TH6 | 101 | 54 | 53.5% | 0 | 26.6s | 52.1% | 43.5% |
| layered-rings\|TH6 | 101 | 53 | 52.5% | 0 | 25.2s | 51.7% | 44.7% |
| resource-shield\|TH6 | 101 | 50 | 49.5% | 0 | 23.2s | 47.0% | 49.1% |
| trap-lanes\|TH6 | 101 | 58 | 57.4% | 0 | 25.1s | 51.3% | 39.5% |
| southern-funnel\|TH6 | 100 | 57 | 57.0% | 0 | 27.0s | 50.9% | 40.9% |
| split-core\|TH6 | 100 | 64 | 64.0% | 0 | 25.8s | 57.2% | 32.8% |
| wide-spread\|TH6 | 99 | 75 | 75.8% | 0 | 27.9s | 62.9% | 22.6% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.2s | 54.5% | 47.7% |
| defense-ring\|TH6 | 98 | 62 | 63.3% | 0 | 28.2s | 56.6% | 32.3% |
| resource-shield\|TH5 | 95 | 43 | 45.3% | 0 | 25.3s | 44.6% | 50.8% |
| asymmetric-left\|TH5 | 94 | 41 | 43.6% | 0 | 26.2s | 49.1% | 49.1% |
| asymmetric-right\|TH5 | 94 | 42 | 44.7% | 0 | 27.3s | 51.5% | 48.1% |
| corner-keep\|TH5 | 94 | 54 | 57.4% | 0 | 26.2s | 51.8% | 34.3% |
| split-core\|TH5 | 94 | 54 | 57.4% | 0 | 24.7s | 49.5% | 34.4% |
| compact-core\|TH5 | 93 | 43 | 46.2% | 0 | 26.3s | 47.8% | 44.8% |
| defense-ring\|TH5 | 93 | 56 | 60.2% | 0 | 26.5s | 54.0% | 33.0% |
| layered-rings\|TH5 | 93 | 39 | 41.9% | 0 | 26.0s | 48.5% | 47.4% |
| southern-funnel\|TH5 | 93 | 57 | 61.3% | 0 | 22.6s | 51.8% | 32.5% |
| trap-lanes\|TH5 | 93 | 61 | 65.6% | 0 | 25.3s | 51.9% | 29.9% |
| wide-spread\|TH5 | 93 | 74 | 79.6% | 0 | 28.3s | 56.6% | 18.6% |
| diamond\|TH6 | 85 | 48 | 56.5% | 0 | 26.4s | 55.9% | 37.9% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 25.7s | 54.1% | 36.1% |
| cannon-screen\|TH6 | 84 | 56 | 66.7% | 0 | 26.6s | 52.7% | 32.4% |
| crossfire\|TH6 | 84 | 40 | 47.6% | 0 | 24.8s | 44.9% | 47.2% |
| echelon-left\|TH6 | 83 | 55 | 66.3% | 0 | 27.9s | 51.0% | 33.0% |
| corner-keep\|TH6 | 82 | 52 | 63.4% | 0 | 25.5s | 54.4% | 34.6% |
| kill-corridor\|TH6 | 82 | 52 | 63.4% | 0 | 26.8s | 57.7% | 33.6% |
| rear-keep\|TH6 | 82 | 42 | 51.2% | 0 | 24.9s | 51.8% | 45.2% |
| compact-core\|TH7 | 80 | 19 | 23.8% | 0 | 21.6s | 39.4% | 72.7% |
| split-core\|TH7 | 80 | 61 | 76.3% | 0 | 26.5s | 67.1% | 22.9% |
| trap-lanes\|TH7 | 80 | 62 | 77.5% | 0 | 27.1s | 65.1% | 22.5% |
| wide-spread\|TH7 | 80 | 57 | 71.3% | 0 | 28.3s | 65.2% | 27.1% |
| crossfire\|TH5 | 79 | 49 | 62.0% | 0 | 28.1s | 48.5% | 34.4% |
| rear-keep\|TH5 | 79 | 45 | 57.0% | 0 | 24.2s | 48.8% | 39.2% |
| cannon-screen\|TH5 | 78 | 57 | 73.1% | 0 | 29.5s | 53.5% | 26.3% |
| diamond\|TH5 | 78 | 43 | 55.1% | 0 | 24.7s | 50.0% | 39.6% |
| echelon-left\|TH5 | 78 | 54 | 69.2% | 0 | 25.5s | 47.8% | 28.6% |
| echelon-right\|TH5 | 78 | 47 | 60.3% | 0 | 25.0s | 46.9% | 29.4% |
| kill-corridor\|TH5 | 77 | 39 | 50.6% | 0 | 27.4s | 48.8% | 40.7% |
| echelon-left\|TH7 | 72 | 54 | 75.0% | 0 | 27.5s | 65.0% | 25.0% |
| rear-keep\|TH7 | 71 | 25 | 35.2% | 0 | 21.9s | 44.5% | 59.6% |
| asymmetric-left\|TH7 | 54 | 25 | 46.3% | 0 | 26.4s | 58.1% | 53.6% |
| defense-ring\|TH7 | 54 | 30 | 55.6% | 0 | 27.6s | 63.9% | 41.4% |
| southern-funnel\|TH7 | 54 | 28 | 51.9% | 0 | 28.3s | 55.6% | 48.1% |
| cannon-screen\|TH7 | 45 | 25 | 55.6% | 0 | 25.7s | 58.8% | 44.1% |
| echelon-right\|TH7 | 45 | 28 | 62.2% | 0 | 29.1s | 62.4% | 37.8% |
| corner-keep\|TH7 | 36 | 15 | 41.7% | 0 | 26.3s | 53.5% | 55.6% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 1052 | 1052 | 100.0% | 0 | 28.3s | 73.4% | 0.0% |
| maxed | 1037 | 45 | 4.3% | 0 | 21.0s | 21.8% | 91.4% |
| mid | 1011 | 851 | 84.2% | 0 | 31.0s | 66.0% | 11.2% |
| rushed-defense | 999 | 83 | 8.3% | 0 | 20.5s | 34.2% | 84.6% |
| mixed | 901 | 810 | 89.9% | 0 | 27.5s | 70.3% | 8.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1494 | 57.4% | 0 | 22.6s | 43.6% | 36.8% |
| pure-unit-matrix | 2398 | 1347 | 56.2% | 0 | 29.0s | 62.8% | 42.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 480 | 53.9% | 0 | 26.7s | 60.3% | 45.2% |
| policy-exploration\|TH5 | 869 | 501 | 57.7% | 0 | 21.9s | 36.9% | 32.9% |
| policy-exploration\|TH6 | 869 | 501 | 57.7% | 0 | 22.8s | 44.4% | 37.8% |
| policy-exploration\|TH7 | 864 | 492 | 56.9% | 0 | 23.1s | 49.0% | 39.7% |
| pure-unit-matrix\|TH6 | 800 | 470 | 58.8% | 0 | 29.6s | 62.7% | 40.2% |
| pure-unit-matrix\|TH5 | 707 | 397 | 56.2% | 0 | 31.2s | 66.4% | 41.9% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1740 | 1025 | 58.9% | 0 | 22.9s | 45.2% | 35.0% |
| policy-exploration\|fire_dragon | 1465 | 851 | 58.1% | 0 | 20.6s | 41.7% | 35.5% |
| policy-exploration\|archer | 1449 | 834 | 57.6% | 0 | 22.2s | 42.7% | 36.3% |
| policy-exploration\|mage | 1395 | 773 | 55.4% | 0 | 21.3s | 42.6% | 38.3% |
| policy-exploration\|demon_king | 1366 | 808 | 59.2% | 0 | 22.8s | 46.0% | 34.4% |
| policy-exploration\|mimic | 1333 | 811 | 60.8% | 0 | 23.1s | 43.6% | 32.5% |
| policy-exploration\|pea_shooter | 863 | 473 | 54.8% | 0 | 21.4s | 40.1% | 38.5% |
| policy-exploration\|mechanical_dragon | 691 | 381 | 55.1% | 0 | 20.9s | 42.3% | 39.7% |
| pure-unit-matrix\|archer | 300 | 155 | 51.7% | 0 | 35.5s | 58.9% | 48.3% |
| pure-unit-matrix\|demon_king | 300 | 188 | 62.7% | 0 | 28.8s | 68.8% | 35.1% |
| pure-unit-matrix\|fire_dragon | 300 | 184 | 61.3% | 0 | 20.5s | 67.2% | 38.3% |
| pure-unit-matrix\|knight | 300 | 172 | 57.3% | 0 | 33.1s | 63.2% | 40.7% |
| pure-unit-matrix\|mage | 300 | 136 | 45.3% | 0 | 24.4s | 55.7% | 54.0% |
| pure-unit-matrix\|mimic | 300 | 197 | 65.7% | 0 | 34.0s | 67.7% | 31.8% |
| pure-unit-matrix\|pea_shooter | 300 | 153 | 51.0% | 0 | 28.3s | 59.5% | 47.3% |
| policy-exploration\|necromancer | 225 | 127 | 56.4% | 0 | 23.8s | 46.2% | 40.7% |
| pure-unit-matrix\|mechanical_dragon | 199 | 115 | 57.8% | 0 | 25.1s | 65.3% | 42.1% |
| pure-unit-matrix\|necromancer | 99 | 47 | 47.5% | 0 | 30.9s | 53.3% | 51.1% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 663 | 388 | 58.5% | 0 | 22.3s | 38.2% | 31.7% |
| policy-exploration\|fire_dragon\|TH5 | 568 | 332 | 58.5% | 0 | 20.3s | 35.9% | 32.3% |
| policy-exploration\|archer\|TH5 | 567 | 330 | 58.2% | 0 | 21.4s | 35.0% | 32.3% |
| policy-exploration\|knight\|TH6 | 552 | 335 | 60.7% | 0 | 22.9s | 45.4% | 34.5% |
| policy-exploration\|mage\|TH5 | 531 | 295 | 55.6% | 0 | 20.7s | 35.9% | 35.0% |
| policy-exploration\|knight\|TH7 | 525 | 302 | 57.5% | 0 | 23.8s | 53.1% | 39.6% |
| policy-exploration\|demon_king\|TH5 | 513 | 300 | 58.5% | 0 | 22.0s | 37.5% | 30.5% |
| policy-exploration\|mimic\|TH5 | 513 | 310 | 60.4% | 0 | 22.8s | 36.9% | 29.1% |
| policy-exploration\|fire_dragon\|TH6 | 500 | 291 | 58.2% | 0 | 21.1s | 44.5% | 37.0% |
| policy-exploration\|mage\|TH6 | 469 | 258 | 55.0% | 0 | 21.5s | 42.3% | 39.5% |
| policy-exploration\|archer\|TH6 | 442 | 251 | 56.8% | 0 | 22.5s | 44.3% | 38.1% |
| policy-exploration\|mimic\|TH6 | 442 | 276 | 62.4% | 0 | 23.2s | 45.3% | 32.5% |
| policy-exploration\|archer\|TH7 | 440 | 253 | 57.5% | 0 | 22.9s | 50.1% | 39.5% |
| policy-exploration\|demon_king\|TH6 | 433 | 264 | 61.0% | 0 | 22.8s | 45.8% | 33.8% |
| policy-exploration\|demon_king\|TH7 | 420 | 244 | 58.1% | 0 | 23.8s | 55.5% | 39.6% |
| policy-exploration\|fire_dragon\|TH7 | 397 | 228 | 57.4% | 0 | 20.3s | 45.7% | 38.4% |
| policy-exploration\|mage\|TH7 | 395 | 220 | 55.7% | 0 | 21.8s | 51.1% | 41.1% |
| policy-exploration\|mimic\|TH7 | 378 | 225 | 59.5% | 0 | 23.7s | 50.1% | 37.1% |
| policy-exploration\|mechanical_dragon\|TH6 | 375 | 207 | 55.2% | 0 | 21.8s | 43.3% | 39.7% |
| policy-exploration\|pea_shooter\|TH5 | 327 | 180 | 55.0% | 0 | 21.2s | 34.9% | 34.8% |
| policy-exploration\|mechanical_dragon\|TH7 | 316 | 174 | 55.1% | 0 | 19.8s | 41.1% | 39.6% |
| policy-exploration\|pea_shooter\|TH6 | 297 | 163 | 54.9% | 0 | 22.1s | 43.0% | 40.1% |
| policy-exploration\|pea_shooter\|TH7 | 239 | 130 | 54.4% | 0 | 20.8s | 43.2% | 41.5% |
| policy-exploration\|necromancer\|TH7 | 225 | 127 | 56.4% | 0 | 23.8s | 46.2% | 40.7% |
| pure-unit-matrix\|archer\|TH5 | 101 | 51 | 50.5% | 0 | 36.4s | 61.9% | 49.5% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 64 | 63.4% | 0 | 30.7s | 73.2% | 32.5% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 64 | 63.4% | 0 | 22.3s | 71.2% | 36.4% |
| pure-unit-matrix\|knight\|TH5 | 101 | 55 | 54.5% | 0 | 37.3s | 63.9% | 41.7% |
| pure-unit-matrix\|mage\|TH5 | 101 | 44 | 43.6% | 0 | 25.0s | 58.9% | 55.6% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 64 | 63.4% | 0 | 37.1s | 69.5% | 34.1% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 55 | 54.5% | 0 | 29.3s | 65.8% | 43.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.9s | 55.5% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 29.7s | 70.1% | 32.3% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 20.8s | 63.2% | 38.6% |
| pure-unit-matrix\|knight\|TH6 | 100 | 60 | 60.0% | 0 | 32.5s | 64.7% | 38.6% |
| pure-unit-matrix\|mage\|TH6 | 100 | 48 | 48.0% | 0 | 25.1s | 52.9% | 52.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 57 | 57.0% | 0 | 26.8s | 64.7% | 42.9% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 77 | 77.0% | 0 | 34.6s | 74.4% | 18.7% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 51 | 51.0% | 0 | 29.1s | 56.2% | 48.4% |
| pure-unit-matrix\|archer\|TH7 | 99 | 54 | 54.5% | 0 | 32.4s | 59.5% | 45.4% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 58 | 58.6% | 0 | 25.9s | 63.5% | 40.5% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 18.4s | 67.2% | 39.9% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 29.4s | 61.1% | 41.8% |
| pure-unit-matrix\|mage\|TH7 | 99 | 44 | 44.4% | 0 | 23.0s | 55.4% | 54.2% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 58 | 58.6% | 0 | 23.3s | 66.0% | 41.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 56 | 56.6% | 0 | 30.1s | 59.7% | 42.6% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 47 | 47.5% | 0 | 30.9s | 53.3% | 51.1% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 47 | 47.5% | 0 | 26.5s | 56.7% | 50.2% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1347 | 56.2% | 0 | 29.0s | 62.8% | 42.5% |
| policy-exploration\|cannon-focus | 456 | 266 | 58.3% | 0 | 27.1s | 65.5% | 39.7% |
| policy-exploration\|none | 423 | 251 | 59.3% | 0 | 27.2s | 65.3% | 38.8% |
| policy-exploration\|cannon-rally | 418 | 236 | 56.5% | 0 | 14.8s | 6.6% | 29.7% |
| policy-exploration\|rally-core | 404 | 223 | 55.2% | 0 | 15.3s | 5.7% | 29.9% |
| policy-exploration\|medkit-entry | 246 | 143 | 58.1% | 0 | 25.8s | 62.4% | 40.8% |
| policy-exploration\|cannon-medkit | 192 | 108 | 56.3% | 0 | 27.7s | 59.8% | 43.0% |
| policy-exploration\|rally-rage | 104 | 60 | 57.7% | 0 | 13.4s | 9.4% | 33.6% |
| policy-exploration\|freeze-defense | 99 | 57 | 57.6% | 0 | 26.1s | 63.2% | 41.1% |
| policy-exploration\|freeze-rage | 92 | 56 | 60.9% | 0 | 23.1s | 67.6% | 38.8% |
| policy-exploration\|freeze-barrel | 64 | 38 | 59.4% | 0 | 29.4s | 60.4% | 40.5% |
| policy-exploration\|rage-entry | 52 | 26 | 50.0% | 0 | 27.4s | 57.7% | 49.2% |
| policy-exploration\|skeleton-barrel | 52 | 30 | 57.7% | 0 | 26.9s | 60.3% | 42.1% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 282 | 175 | 62.1% | 0 | 23.6s | 44.7% | 33.6% |
| policy-exploration\|left-flank | 272 | 185 | 68.0% | 0 | 23.3s | 41.4% | 25.4% |
| policy-exploration\|center-column | 270 | 152 | 56.3% | 0 | 22.9s | 39.0% | 38.5% |
| policy-exploration\|three-lane | 262 | 150 | 57.3% | 0 | 21.6s | 42.7% | 38.5% |
| policy-exploration\|dual-flank | 259 | 145 | 56.0% | 0 | 22.9s | 49.4% | 38.2% |
| policy-exploration\|wide-line | 259 | 135 | 52.1% | 0 | 21.8s | 45.4% | 41.4% |
| policy-exploration\|edge-sweep | 257 | 149 | 58.0% | 0 | 22.8s | 48.3% | 36.2% |
| policy-exploration\|diamond | 252 | 136 | 54.0% | 0 | 21.5s | 42.6% | 40.3% |
| policy-exploration\|vanguard-wedge | 247 | 133 | 53.8% | 0 | 22.4s | 42.1% | 41.1% |
| policy-exploration\|right-flank | 242 | 134 | 55.4% | 0 | 22.8s | 40.4% | 35.8% |
| pure-unit-matrix\|center-column | 240 | 129 | 53.8% | 0 | 29.8s | 60.5% | 45.0% |
| pure-unit-matrix\|diamond | 240 | 134 | 55.8% | 0 | 29.4s | 63.6% | 42.5% |
| pure-unit-matrix\|dual-flank | 240 | 131 | 54.6% | 0 | 27.8s | 64.4% | 45.0% |
| pure-unit-matrix\|inverted-wedge | 240 | 137 | 57.1% | 0 | 30.1s | 61.9% | 41.7% |
| pure-unit-matrix\|left-flank | 240 | 143 | 59.6% | 0 | 29.0s | 61.7% | 38.2% |
| pure-unit-matrix\|right-flank | 240 | 144 | 60.0% | 0 | 32.0s | 62.8% | 36.9% |
| pure-unit-matrix\|three-lane | 240 | 136 | 56.7% | 0 | 28.3s | 65.2% | 42.0% |
| pure-unit-matrix\|vanguard-wedge | 240 | 128 | 53.3% | 0 | 28.2s | 58.5% | 46.3% |
| pure-unit-matrix\|wide-line | 240 | 130 | 54.2% | 0 | 27.4s | 64.3% | 45.1% |
| pure-unit-matrix\|edge-sweep | 238 | 135 | 56.7% | 0 | 27.6s | 64.9% | 42.7% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|rapid | 531 | 303 | 57.1% | 0 | 22.0s | 43.6% | 37.9% |
| policy-exploration\|burst | 528 | 316 | 59.8% | 0 | 22.8s | 44.2% | 32.9% |
| policy-exploration\|drip | 521 | 300 | 57.6% | 0 | 22.3s | 42.4% | 37.4% |
| policy-exploration\|two-waves | 518 | 278 | 53.7% | 0 | 22.9s | 41.8% | 39.2% |
| policy-exploration\|three-waves | 504 | 297 | 58.9% | 0 | 22.7s | 46.1% | 36.7% |
| pure-unit-matrix\|burst | 480 | 264 | 55.0% | 0 | 27.6s | 62.3% | 43.9% |
| pure-unit-matrix\|rapid | 480 | 291 | 60.6% | 0 | 29.7s | 65.2% | 37.6% |
| pure-unit-matrix\|three-waves | 480 | 275 | 57.3% | 0 | 29.4s | 63.3% | 40.9% |
| pure-unit-matrix\|two-waves | 480 | 251 | 52.3% | 0 | 28.1s | 60.6% | 47.1% |
| pure-unit-matrix\|drip | 478 | 266 | 55.6% | 0 | 29.9s | 62.4% | 43.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 759 | 58.3% | 0 | 22.0s | 44.4% | 35.9% |
| policy-exploration\|tank-front-support-rear | 1301 | 735 | 56.5% | 0 | 23.1s | 42.8% | 37.7% |
| pure-unit-matrix\|roster-order | 1199 | 694 | 57.9% | 0 | 28.8s | 63.4% | 40.9% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 653 | 54.5% | 0 | 29.1s | 62.2% | 44.2% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 427 | 253 | 59.3% | 0 | 31.5s | 59.0% | 37.9% |
| pure-fire_dragon | 408 | 247 | 60.5% | 0 | 19.3s | 57.8% | 37.4% |
| pure-archer | 398 | 190 | 47.7% | 0 | 33.7s | 54.5% | 50.8% |
| pure-mimic | 398 | 275 | 69.1% | 0 | 31.3s | 59.2% | 27.6% |
| pure-pea_shooter | 393 | 193 | 49.1% | 0 | 26.9s | 55.2% | 49.0% |
| pure-mage | 392 | 173 | 44.1% | 0 | 23.3s | 51.3% | 54.2% |
| pure-demon_king | 383 | 246 | 64.2% | 0 | 28.2s | 66.6% | 32.6% |
| pure-mechanical_dragon | 282 | 163 | 57.8% | 0 | 24.3s | 63.0% | 41.0% |
| random-3 | 134 | 74 | 55.2% | 0 | 22.1s | 42.8% | 35.9% |
| pure-necromancer | 131 | 64 | 48.9% | 0 | 31.4s | 54.0% | 49.8% |
| random-2 | 130 | 70 | 53.8% | 0 | 21.3s | 38.5% | 36.3% |
| melee-pressure | 125 | 77 | 61.6% | 0 | 28.8s | 53.6% | 30.4% |
| frontline-ranged | 124 | 71 | 57.3% | 0 | 19.5s | 38.5% | 38.1% |
| core-fire_dragon-filled | 114 | 73 | 64.0% | 0 | 17.5s | 40.2% | 31.5% |
| balanced | 110 | 71 | 64.5% | 0 | 21.4s | 50.0% | 32.0% |
| support-mix | 107 | 58 | 54.2% | 0 | 26.3s | 48.0% | 42.8% |
| random-6 | 101 | 63 | 62.4% | 0 | 22.8s | 52.1% | 35.1% |
| core-mage-filled | 98 | 40 | 40.8% | 0 | 22.4s | 48.1% | 54.6% |
| hero-necro-dragon-mages | 94 | 59 | 62.8% | 0 | 21.8s | 54.2% | 33.9% |
| random-5 | 94 | 55 | 58.5% | 0 | 23.2s | 50.2% | 35.7% |
| random-4 | 91 | 49 | 53.8% | 0 | 21.0s | 42.6% | 40.1% |
| ranged-pressure | 87 | 46 | 52.9% | 0 | 17.6s | 28.0% | 40.6% |
| trap-runner-mix | 87 | 53 | 60.9% | 0 | 23.5s | 47.1% | 27.7% |
| core-mimic-filled | 86 | 66 | 76.7% | 0 | 29.8s | 54.2% | 20.1% |
| random-1 | 86 | 50 | 58.1% | 0 | 18.8s | 23.3% | 30.7% |
| air-pressure | 68 | 38 | 55.9% | 0 | 16.6s | 27.8% | 39.4% |
| core-mechanical_dragon-filled | 52 | 24 | 46.2% | 0 | 20.9s | 31.0% | 43.2% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank__burst__tank-front-support-rear | 57 | 27 | 47.4% | 0 | 23.0s | 45.2% | 48.4% |
| edge-sweep__three-waves__tank-front-support-rear | 57 | 30 | 52.6% | 0 | 25.1s | 58.3% | 43.6% |
| three-lane__rapid__tank-front-support-rear | 57 | 37 | 64.9% | 0 | 29.1s | 69.7% | 35.1% |
| wide-line__drip__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 23.8s | 49.9% | 43.3% |
| edge-sweep__two-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 29.4s | 57.6% | 44.0% |
| inverted-wedge__burst__roster-order | 56 | 37 | 66.1% | 0 | 27.0s | 60.0% | 29.5% |
| inverted-wedge__rapid__roster-order | 56 | 34 | 60.7% | 0 | 27.3s | 49.0% | 36.7% |
| inverted-wedge__two-waves__tank-front-support-rear | 56 | 25 | 44.6% | 0 | 26.7s | 45.1% | 49.2% |
| left-flank__drip__tank-front-support-rear | 56 | 39 | 69.6% | 0 | 25.9s | 53.8% | 28.3% |
| left-flank__three-waves__roster-order | 56 | 34 | 60.7% | 0 | 24.1s | 46.8% | 34.6% |
| left-flank__two-waves__roster-order | 56 | 32 | 57.1% | 0 | 21.0s | 32.5% | 33.5% |
| right-flank__burst__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 30.3s | 54.5% | 43.4% |
| right-flank__drip__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 24.1s | 40.3% | 38.5% |
| vanguard-wedge__burst__roster-order | 56 | 31 | 55.4% | 0 | 26.8s | 55.0% | 42.1% |
| vanguard-wedge__two-waves__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 26.3s | 56.2% | 44.6% |
| center-column__three-waves__tank-front-support-rear | 55 | 27 | 49.1% | 0 | 27.0s | 47.0% | 44.9% |
| center-column__two-waves__roster-order | 55 | 29 | 52.7% | 0 | 26.6s | 47.8% | 43.6% |
| diamond__burst__roster-order | 55 | 30 | 54.5% | 0 | 22.5s | 51.0% | 38.8% |
| dual-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 21.7s | 49.2% | 39.9% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 27.1s | 65.1% | 38.3% |
| inverted-wedge__rapid__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 24.7s | 50.7% | 39.3% |
| left-flank__three-waves__tank-front-support-rear | 55 | 40 | 72.7% | 0 | 28.2s | 61.4% | 25.1% |
| left-flank__two-waves__tank-front-support-rear | 55 | 38 | 69.1% | 0 | 26.4s | 49.3% | 28.6% |
| three-lane__drip__roster-order | 55 | 29 | 52.7% | 0 | 27.5s | 63.4% | 47.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 26.0s | 51.1% | 45.6% |
| wide-line__rapid__roster-order | 55 | 26 | 47.3% | 0 | 22.9s | 45.6% | 50.2% |
| center-column__two-waves__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 22.7s | 36.9% | 47.8% |
| three-lane__drip__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.5s | 45.1% | 44.0% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 27 | 50.0% | 0 | 25.4s | 52.5% | 48.0% |
| wide-line__rapid__tank-front-support-rear | 54 | 32 | 59.3% | 0 | 24.3s | 55.2% | 36.3% |
| center-column__drip__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 26.0s | 46.2% | 44.0% |
| center-column__rapid__roster-order | 51 | 27 | 52.9% | 0 | 24.1s | 57.0% | 44.2% |
| diamond__drip__roster-order | 51 | 26 | 51.0% | 0 | 25.5s | 56.3% | 46.8% |
| diamond__rapid__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 25.0s | 44.4% | 34.0% |
| dual-flank__burst__roster-order | 51 | 32 | 62.7% | 0 | 27.5s | 67.6% | 36.1% |
| edge-sweep__three-waves__roster-order | 51 | 34 | 66.7% | 0 | 25.7s | 62.2% | 33.3% |
| inverted-wedge__two-waves__roster-order | 51 | 35 | 68.6% | 0 | 30.4s | 67.5% | 31.4% |
| three-lane__burst__tank-front-support-rear | 51 | 30 | 58.8% | 0 | 20.3s | 39.6% | 39.0% |
| three-lane__rapid__roster-order | 51 | 33 | 64.7% | 0 | 20.6s | 45.9% | 32.7% |
| wide-line__three-waves__tank-front-support-rear | 51 | 25 | 49.0% | 0 | 25.6s | 62.9% | 49.7% |
| center-column__burst__roster-order | 50 | 28 | 56.0% | 0 | 27.0s | 51.1% | 39.2% |
| center-column__drip__roster-order | 50 | 25 | 50.0% | 0 | 32.9s | 60.6% | 48.0% |
| center-column__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 25.3s | 47.0% | 34.2% |
| diamond__burst__tank-front-support-rear | 50 | 34 | 68.0% | 0 | 23.2s | 53.5% | 32.0% |
| diamond__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.6s | 60.8% | 38.3% |
| diamond__three-waves__roster-order | 50 | 28 | 56.0% | 0 | 27.3s | 62.0% | 41.1% |
| diamond__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 21.6s | 39.9% | 43.5% |
| dual-flank__drip__roster-order | 50 | 35 | 70.0% | 0 | 29.4s | 65.3% | 29.7% |
| dual-flank__rapid__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 25.8s | 55.6% | 38.9% |
| dual-flank__three-waves__roster-order | 50 | 29 | 58.0% | 0 | 24.3s | 52.8% | 32.0% |
| edge-sweep__drip__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 26.6s | 55.9% | 36.4% |
| edge-sweep__rapid__roster-order | 50 | 30 | 60.0% | 0 | 23.9s | 56.4% | 38.4% |
| inverted-wedge__three-waves__roster-order | 50 | 31 | 62.0% | 0 | 28.0s | 57.5% | 34.9% |
| inverted-wedge__three-waves__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 22.2s | 34.3% | 34.5% |
| left-flank__burst__roster-order | 50 | 32 | 64.0% | 0 | 25.4s | 51.9% | 28.6% |
| left-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 23.0s | 42.7% | 34.5% |
| right-flank__burst__roster-order | 50 | 28 | 56.0% | 0 | 25.6s | 47.7% | 37.7% |
| right-flank__drip__roster-order | 50 | 31 | 62.0% | 0 | 24.8s | 47.6% | 32.3% |
| right-flank__three-waves__roster-order | 50 | 26 | 52.0% | 0 | 24.3s | 53.5% | 42.7% |
| three-lane__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 25.5s | 60.1% | 27.4% |
| three-lane__two-waves__roster-order | 50 | 28 | 56.0% | 0 | 23.3s | 53.5% | 41.6% |
| vanguard-wedge__rapid__roster-order | 50 | 33 | 66.0% | 0 | 26.4s | 53.5% | 30.5% |
| vanguard-wedge__two-waves__roster-order | 50 | 29 | 58.0% | 0 | 22.3s | 46.5% | 38.3% |
| wide-line__two-waves__roster-order | 50 | 22 | 44.0% | 0 | 22.7s | 46.1% | 43.8% |
| center-column__three-waves__roster-order | 49 | 34 | 69.4% | 0 | 28.2s | 63.3% | 29.2% |
| dual-flank__drip__tank-front-support-rear | 49 | 20 | 40.8% | 0 | 25.6s | 56.6% | 59.2% |
| dual-flank__two-waves__roster-order | 49 | 22 | 44.9% | 0 | 23.5s | 58.0% | 54.6% |
| edge-sweep__drip__roster-order | 49 | 33 | 67.3% | 0 | 24.4s | 47.8% | 27.3% |
| edge-sweep__rapid__tank-front-support-rear | 49 | 31 | 63.3% | 0 | 25.7s | 60.1% | 35.6% |
| inverted-wedge__drip__roster-order | 49 | 29 | 59.2% | 0 | 26.2s | 47.8% | 38.4% |
| right-flank__rapid__roster-order | 49 | 33 | 67.3% | 0 | 27.2s | 57.0% | 31.4% |
| right-flank__three-waves__tank-front-support-rear | 49 | 34 | 69.4% | 0 | 27.5s | 45.8% | 28.9% |
| wide-line__burst__roster-order | 49 | 30 | 61.2% | 0 | 20.9s | 49.6% | 36.7% |
| wide-line__two-waves__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 26.2s | 52.3% | 52.0% |
| center-column__burst__tank-front-support-rear | 45 | 27 | 60.0% | 0 | 21.4s | 34.3% | 38.7% |
| diamond__rapid__roster-order | 45 | 21 | 46.7% | 0 | 30.3s | 60.1% | 50.9% |
| diamond__three-waves__tank-front-support-rear | 45 | 26 | 57.8% | 0 | 28.6s | 57.0% | 40.1% |
| diamond__two-waves__tank-front-support-rear | 45 | 20 | 44.4% | 0 | 22.7s | 43.9% | 50.7% |
| edge-sweep__burst__roster-order | 45 | 30 | 66.7% | 0 | 24.1s | 63.9% | 33.3% |
| left-flank__burst__tank-front-support-rear | 45 | 28 | 62.2% | 0 | 32.1s | 63.4% | 34.9% |
| left-flank__rapid__tank-front-support-rear | 45 | 21 | 46.7% | 0 | 28.3s | 49.4% | 45.4% |
| three-lane__burst__roster-order | 45 | 28 | 62.2% | 0 | 23.3s | 46.2% | 32.0% |
| three-lane__two-waves__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 25.9s | 52.3% | 47.1% |
| wide-line__drip__roster-order | 45 | 26 | 57.8% | 0 | 25.3s | 66.1% | 42.2% |
| wide-line__three-waves__roster-order | 45 | 28 | 62.2% | 0 | 26.8s | 59.4% | 37.6% |
| dual-flank__three-waves__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 25.0s | 48.5% | 40.7% |
| dual-flank__two-waves__tank-front-support-rear | 44 | 29 | 65.9% | 0 | 27.8s | 70.2% | 34.1% |
| edge-sweep__burst__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 21.1s | 41.6% | 45.2% |
| edge-sweep__two-waves__roster-order | 44 | 19 | 43.2% | 0 | 23.6s | 57.4% | 56.8% |
| inverted-wedge__drip__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 26.5s | 47.8% | 41.1% |
| left-flank__rapid__roster-order | 44 | 33 | 75.0% | 0 | 26.8s | 62.2% | 22.1% |
| right-flank__two-waves__roster-order | 44 | 23 | 52.3% | 0 | 29.4s | 55.1% | 39.1% |
| three-lane__three-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 26.2s | 57.0% | 57.5% |
| vanguard-wedge__drip__roster-order | 44 | 22 | 50.0% | 0 | 22.7s | 36.1% | 39.5% |
| vanguard-wedge__three-waves__roster-order | 44 | 17 | 38.6% | 0 | 24.2s | 45.4% | 60.7% |
| wide-line__burst__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 27.2s | 61.7% | 38.4% |
| right-flank__rapid__tank-front-support-rear | 39 | 25 | 64.1% | 0 | 31.1s | 63.0% | 29.7% |
| right-flank__two-waves__tank-front-support-rear | 39 | 23 | 59.0% | 0 | 31.8s | 56.1% | 37.8% |
| vanguard-wedge__drip__tank-front-support-rear | 39 | 21 | 53.8% | 0 | 25.1s | 48.6% | 46.2% |
| vanguard-wedge__three-waves__tank-front-support-rear | 39 | 22 | 56.4% | 0 | 26.6s | 53.7% | 42.8% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 522 | 312 | 59.8% | 0 | 26.6s | 52.7% | 37.3% |
| left-flank | 512 | 328 | 64.1% | 0 | 26.0s | 50.9% | 31.4% |
| center-column | 510 | 281 | 55.1% | 0 | 26.1s | 49.1% | 41.5% |
| three-lane | 502 | 286 | 57.0% | 0 | 24.8s | 53.5% | 40.2% |
| dual-flank | 499 | 276 | 55.3% | 0 | 25.3s | 56.6% | 41.5% |
| wide-line | 499 | 265 | 53.1% | 0 | 24.5s | 54.5% | 43.2% |
| edge-sweep | 495 | 284 | 57.4% | 0 | 25.1s | 56.3% | 39.3% |
| diamond | 492 | 270 | 54.9% | 0 | 25.3s | 52.8% | 41.4% |
| vanguard-wedge | 487 | 261 | 53.6% | 0 | 25.2s | 50.2% | 43.7% |
| right-flank | 482 | 278 | 57.7% | 0 | 27.4s | 51.6% | 36.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 1011 | 594 | 58.8% | 0 | 25.7s | 53.9% | 37.7% |
| burst | 1008 | 580 | 57.5% | 0 | 25.1s | 52.9% | 38.2% |
| drip | 999 | 566 | 56.7% | 0 | 25.9s | 52.0% | 40.2% |
| two-waves | 998 | 529 | 53.0% | 0 | 25.4s | 50.8% | 43.0% |
| three-waves | 984 | 572 | 58.1% | 0 | 26.0s | 54.5% | 38.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1453 | 58.1% | 0 | 25.3s | 53.5% | 38.3% |
| tank-front-support-rear | 2500 | 1388 | 55.5% | 0 | 26.0s | 52.1% | 40.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2821 | 1598 | 56.6% | 0 | 28.7s | 63.1% | 42.0% |
| cannon-focus | 456 | 266 | 58.3% | 0 | 27.1s | 65.5% | 39.7% |
| cannon-rally | 418 | 236 | 56.5% | 0 | 14.8s | 6.6% | 29.7% |
| rally-core | 404 | 223 | 55.2% | 0 | 15.3s | 5.7% | 29.9% |
| medkit-entry | 246 | 143 | 58.1% | 0 | 25.8s | 62.4% | 40.8% |
| cannon-medkit | 192 | 108 | 56.3% | 0 | 27.7s | 59.8% | 43.0% |
| rally-rage | 104 | 60 | 57.7% | 0 | 13.4s | 9.4% | 33.6% |
| freeze-defense | 99 | 57 | 57.6% | 0 | 26.1s | 63.2% | 41.1% |
| freeze-rage | 92 | 56 | 60.9% | 0 | 23.1s | 67.6% | 38.8% |
| freeze-barrel | 64 | 38 | 59.4% | 0 | 29.4s | 60.4% | 40.5% |
| rage-entry | 52 | 26 | 50.0% | 0 | 27.4s | 57.7% | 49.2% |
| skeleton-barrel | 52 | 30 | 57.7% | 0 | 26.9s | 60.3% | 42.1% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1327 | 793 | 59.8% | 0 | 23.1s | 54.5% | 36.4% |
| epic | 714 | 432 | 60.5% | 0 | 21.2s | 43.7% | 33.2% |
| legendary | 711 | 420 | 59.1% | 0 | 21.1s | 45.5% | 33.9% |
| unrevealed | 679 | 386 | 56.8% | 0 | 22.5s | 42.5% | 36.7% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 672 | 398 | 59.2% | 0 | 20.4s | 52.0% | 37.4% |
| demon_king\|common | 655 | 395 | 60.3% | 0 | 25.9s | 57.0% | 35.3% |
| fire_dragon\|legendary | 379 | 223 | 58.8% | 0 | 20.6s | 44.5% | 33.9% |
| fire_dragon\|epic | 369 | 221 | 59.9% | 0 | 20.3s | 43.6% | 34.1% |
| demon_king\|epic | 345 | 211 | 61.2% | 0 | 22.2s | 43.8% | 32.2% |
| fire_dragon\|unrevealed | 345 | 193 | 55.9% | 0 | 21.1s | 38.7% | 37.6% |
| demon_king\|unrevealed | 334 | 193 | 57.8% | 0 | 23.9s | 46.4% | 35.9% |
| demon_king\|legendary | 332 | 197 | 59.3% | 0 | 21.6s | 46.6% | 33.9% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1731 | 57.1% | 0 | 27.7s | 59.0% | 40.7% |
| ward-1 | 767 | 448 | 58.4% | 0 | 22.6s | 44.3% | 36.2% |
| ward-2 | 601 | 340 | 56.6% | 0 | 22.9s | 43.9% | 38.5% |
| ward-3 | 600 | 322 | 53.7% | 0 | 22.0s | 41.4% | 39.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2841 | 56.8% | 0 | 25.6s | 52.8% | 39.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2040 | 1197 | 58.7% | 0 | 24.4s | 47.9% | 35.8% |
| fire_dragon | 1765 | 1035 | 58.6% | 0 | 20.6s | 46.0% | 36.0% |
| archer | 1749 | 989 | 56.5% | 0 | 24.5s | 45.5% | 38.3% |
| mage | 1695 | 909 | 53.6% | 0 | 21.8s | 44.9% | 41.1% |
| demon_king | 1666 | 996 | 59.8% | 0 | 23.9s | 50.1% | 34.5% |
| mimic | 1633 | 1008 | 61.7% | 0 | 25.1s | 48.1% | 32.4% |
| pea_shooter | 1163 | 626 | 53.8% | 0 | 23.2s | 45.1% | 40.8% |
| mechanical_dragon | 890 | 496 | 55.7% | 0 | 21.8s | 47.4% | 40.2% |
| necromancer | 324 | 174 | 53.7% | 0 | 26.0s | 48.4% | 43.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 51.7% | 46.0%-57.3% | 58.9% | 48.3% | 27.8% |
| demon_king | 300 | 62.7% | 57.1%-67.9% | 68.8% | 35.1% | 52.2% |
| fire_dragon | 300 | 61.3% | 55.7%-66.7% | 67.2% | 38.3% | 52.3% |
| knight | 300 | 57.3% | 51.7%-62.8% | 63.2% | 40.7% | 38.3% |
| mage | 300 | 45.3% | 39.8%-51.0% | 55.7% | 54.0% | 27.2% |
| mechanical_dragon | 199 | 57.8% | 50.8%-64.4% | 65.3% | 42.1% | 44.4% |
| mimic | 300 | 65.7% | 60.1%-70.8% | 67.7% | 31.8% | 56.6% |
| necromancer | 99 | 47.5% | 37.9%-57.2% | 53.3% | 51.1% | 38.7% |
| pea_shooter | 300 | 51.0% | 45.4%-56.6% | 59.5% | 47.3% | 32.8% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 50.5% | 40.9%-60.0% | 61.9% | 49.5% | 29.7% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.5% | 50.0% | 23.6% |
| archer\|TH7 | 99 | 54.5% | 44.8%-64.0% | 59.5% | 45.4% | 30.2% |
| demon_king\|TH5 | 101 | 63.4% | 53.6%-72.1% | 73.2% | 32.5% | 52.5% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 32.3% | 55.0% |
| demon_king\|TH7 | 99 | 58.6% | 48.7%-67.8% | 63.5% | 40.5% | 49.2% |
| fire_dragon\|TH5 | 101 | 63.4% | 53.6%-72.1% | 71.2% | 36.4% | 50.5% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 63.2% | 38.6% | 51.2% |
| fire_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 67.2% | 39.9% | 55.1% |
| knight\|TH5 | 101 | 54.5% | 44.8%-63.8% | 63.9% | 41.7% | 36.0% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.7% | 38.6% | 40.7% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 61.1% | 41.8% | 38.3% |
| mage\|TH5 | 101 | 43.6% | 34.3%-53.3% | 58.9% | 55.6% | 29.3% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 52.9% | 52.0% | 24.0% |
| mage\|TH7 | 99 | 44.4% | 35.0%-54.3% | 55.4% | 54.2% | 28.3% |
| mechanical_dragon\|TH6 | 100 | 57.0% | 47.2%-66.3% | 64.7% | 42.9% | 42.2% |
| mechanical_dragon\|TH7 | 99 | 58.6% | 48.7%-67.8% | 66.0% | 41.2% | 46.7% |
| mimic\|TH5 | 101 | 63.4% | 53.6%-72.1% | 69.5% | 34.1% | 51.1% |
| mimic\|TH6 | 100 | 77.0% | 67.8%-84.2% | 74.4% | 18.7% | 67.6% |
| mimic\|TH7 | 99 | 56.6% | 46.7%-65.9% | 59.7% | 42.6% | 51.1% |
| necromancer\|TH7 | 99 | 47.5% | 37.9%-57.2% | 53.3% | 51.1% | 38.7% |
| pea_shooter\|TH5 | 101 | 54.5% | 44.8%-63.8% | 65.8% | 43.3% | 36.1% |
| pea_shooter\|TH6 | 100 | 51.0% | 41.3%-60.6% | 56.2% | 48.4% | 31.4% |
| pea_shooter\|TH7 | 99 | 47.5% | 37.9%-57.2% | 56.7% | 50.2% | 30.9% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.4% | 50.0% | 28.0% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.1% | 50.0% | 32.7% |
| archer\|cannon-screen | 15 | 53.3% | 30.1%-75.2% | 56.1% | 46.6% | 33.9% |
| archer\|compact-core | 18 | 38.9% | 20.3%-61.4% | 60.4% | 61.1% | 23.7% |
| archer\|corner-keep | 15 | 60.0% | 35.7%-80.2% | 65.2% | 40.0% | 28.3% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 24.7% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 67.6% | 39.0% | 27.9% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 61.6% | 53.2% | 25.5% |
| archer\|echelon-left | 15 | 46.7% | 24.8%-69.9% | 48.9% | 53.3% | 25.2% |
| archer\|echelon-right | 15 | 53.3% | 30.1%-75.2% | 50.9% | 46.7% | 28.6% |
| archer\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 50.5% | 53.3% | 25.6% |
| archer\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 60.0% | 50.0% | 22.2% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 55.0% | 60.0% | 27.3% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.3% | 55.4% | 22.3% |
| archer\|southern-funnel | 18 | 50.0% | 29.0%-71.0% | 56.4% | 50.0% | 23.8% |
| archer\|split-core | 18 | 61.1% | 38.6%-79.7% | 63.3% | 38.9% | 35.1% |
| archer\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.6% | 38.9% | 35.3% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 62.3% | 33.3% | 30.1% |
| demon_king\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 68.0% | 50.0% | 42.0% |
| demon_king\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.7% | 50.0% | 45.7% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 72.7% | 19.1% | 62.2% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.0% | 51.4% | 37.7% |
| demon_king\|corner-keep | 15 | 66.7% | 41.7%-84.8% | 63.4% | 29.7% | 48.1% |
| demon_king\|crossfire | 15 | 66.7% | 41.7%-84.8% | 69.3% | 28.9% | 54.1% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.9% | 32.9% | 56.2% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 68.0% | 40.0% | 51.1% |
| demon_king\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 73.2% | 26.7% | 60.0% |
| demon_king\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 73.2% | 34.7% | 55.6% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 77.0% | 25.3% | 58.5% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 66.7% | 47.7% | 36.4% |
| demon_king\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.3% | 38.7% | 54.1% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.2% | 48.6% | 44.4% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.4% | 28.9% | 53.7% |
| demon_king\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.0% | 28.9% | 56.8% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 69.9% | 33.3% | 56.2% |
| demon_king\|wide-spread | 18 | 88.9% | 67.2%-96.9% | 84.7% | 10.0% | 71.6% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 65.0% | 50.0% | 41.7% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.7% | 50.0% | 41.7% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 69.8% | 33.3% | 65.0% |
| fire_dragon\|compact-core | 18 | 44.4% | 24.6%-66.3% | 57.8% | 52.5% | 38.9% |
| fire_dragon\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 63.4% | 46.7% | 41.7% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 65.9% | 33.3% | 56.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 69.5% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 67.3% | 38.2% | 56.7% |
| fire_dragon\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 69.8% | 26.7% | 55.0% |
| fire_dragon\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 72.3% | 26.7% | 63.3% |
| fire_dragon\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 77.5% | 26.7% | 65.0% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 65.2% | 50.0% | 43.1% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 67.0% | 40.0% | 53.3% |
| fire_dragon\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.0% | 55.6% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 62.1% | 38.9% | 48.6% |
| fire_dragon\|split-core | 18 | 66.7% | 43.7%-83.7% | 67.6% | 33.3% | 56.9% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 71.0% | 31.0% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 76.1% | 16.7% | 66.7% |
| knight\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.2% | 49.7% | 33.2% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 65.7% | 49.6% | 37.4% |
| knight\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 65.5% | 36.6% | 45.9% |
| knight\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.9% | 55.2% | 29.8% |
| knight\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 64.5% | 43.8% | 32.7% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 61.1% | 35.9% | 35.3% |
| knight\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 63.3% | 39.7% | 35.4% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 63.2% | 42.1% | 37.3% |
| knight\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 60.5% | 33.3% | 44.7% |
| knight\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 64.5% | 32.0% | 46.7% |
| knight\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 67.3% | 33.3% | 46.5% |
| knight\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 59.7% | 53.9% | 24.7% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 63.6% | 39.7% | 40.4% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 57.6% | 52.3% | 30.0% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 60.6% | 33.3% | 40.4% |
| knight\|split-core | 18 | 66.7% | 43.7%-83.7% | 65.9% | 33.3% | 47.3% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.3% | 33.3% | 43.7% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 68.8% | 30.6% | 42.2% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 54.4% | 58.6% | 25.8% |
| mage\|asymmetric-right | 18 | 33.3% | 16.3%-56.3% | 53.6% | 66.1% | 25.3% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.0% | 40.0% | 30.3% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 54.2% | 61.1% | 21.7% |
| mage\|corner-keep | 15 | 46.7% | 24.8%-69.9% | 56.8% | 52.3% | 26.1% |
| mage\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 29.7% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.3% | 50.0% | 26.3% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 56.8% | 53.3% | 26.7% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 32.1% |
| mage\|echelon-right | 15 | 46.7% | 24.8%-69.9% | 51.6% | 53.3% | 30.9% |
| mage\|kill-corridor | 15 | 33.3% | 15.2%-58.3% | 49.8% | 61.9% | 23.6% |
| mage\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 53.4% | 55.8% | 19.7% |
| mage\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 55.0% | 53.3% | 25.5% |
| mage\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.5% | 55.6% | 25.8% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 50.6% | 66.7% | 21.7% |
| mage\|split-core | 18 | 38.9% | 20.3%-61.4% | 56.4% | 56.9% | 29.8% |
| mage\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 58.9% | 44.4% | 35.9% |
| mage\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 67.8% | 38.9% | 34.3% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 61.9% | 49.7% | 37.1% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 65.3% | 50.0% | 40.9% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 63.0% | 40.0% | 51.8% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 60.8% | 50.0% | 34.1% |
| mechanical_dragon\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 62.5% | 44.4% | 40.4% |
| mechanical_dragon\|crossfire | 10 | 50.0% | 23.7%-76.3% | 62.3% | 49.6% | 39.1% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.0% | 33.3% | 47.7% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 66.7% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 67.7% | 40.0% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 60.0% | 31.3%-83.2% | 70.0% | 38.6% | 56.4% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 58.9% | 50.0% | 40.2% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 67.3% | 40.0% | 48.2% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 58.9% | 50.0% | 37.1% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 66.7% | 40.9% | 33.3% |
| mechanical_dragon\|split-core | 12 | 66.7% | 39.1%-86.2% | 65.8% | 33.3% | 51.5% |
| mechanical_dragon\|trap-lanes | 12 | 66.7% | 39.1%-86.2% | 68.9% | 33.3% | 46.2% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 73.3% | 33.2% | 52.3% |
| mimic\|asymmetric-left | 18 | 61.1% | 38.6%-79.7% | 67.2% | 38.6% | 48.4% |
| mimic\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 66.1% | 47.2% | 43.7% |
| mimic\|cannon-screen | 15 | 73.3% | 48.0%-89.1% | 68.6% | 26.7% | 67.6% |
| mimic\|compact-core | 18 | 55.6% | 33.7%-75.4% | 59.1% | 41.7% | 42.9% |
| mimic\|corner-keep | 15 | 73.3% | 48.0%-89.1% | 62.7% | 25.3% | 57.1% |
| mimic\|crossfire | 15 | 60.0% | 35.7%-80.2% | 65.9% | 33.5% | 50.5% |
| mimic\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.3% | 25.9% | 57.1% |
| mimic\|diamond | 15 | 66.7% | 41.7%-84.8% | 68.4% | 30.7% | 61.0% |
| mimic\|echelon-left | 15 | 66.7% | 41.7%-84.8% | 70.0% | 32.1% | 61.0% |
| mimic\|echelon-right | 15 | 73.3% | 48.0%-89.1% | 69.8% | 26.7% | 61.9% |
| mimic\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 76.1% | 20.0% | 70.5% |
| mimic\|layered-rings | 18 | 61.1% | 38.6%-79.7% | 66.5% | 36.7% | 45.2% |
| mimic\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 63.9% | 32.5% | 58.1% |
| mimic\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 58.9% | 50.0% | 39.7% |
| mimic\|southern-funnel | 18 | 72.2% | 49.1%-87.5% | 66.3% | 27.8% | 60.3% |
| mimic\|split-core | 18 | 66.7% | 43.7%-83.7% | 68.0% | 30.4% | 60.3% |
| mimic\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 70.1% | 23.5% | 65.9% |
| mimic\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 79.2% | 18.0% | 73.0% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 57.0% | 50.0% | 44.4% |
| necromancer\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 58.1% | 50.0% | 44.4% |
| necromancer\|compact-core | 6 | 16.7% | 3.0%-56.4% | 42.5% | 76.8% | 16.7% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 50.5% | 50.0% | 38.9% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 54.8% | 66.6% | 33.3% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 46.8% | 66.7% | 27.8% |
| necromancer\|southern-funnel | 6 | 33.3% | 9.7%-70.0% | 40.9% | 66.7% | 16.7% |
| necromancer\|split-core | 6 | 66.7% | 30.0%-90.3% | 56.5% | 33.3% | 61.1% |
| necromancer\|trap-lanes | 6 | 66.7% | 30.0%-90.3% | 52.7% | 33.3% | 44.4% |
| necromancer\|wide-spread | 6 | 50.0% | 18.8%-81.2% | 60.8% | 50.0% | 50.0% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 52.8% | 61.1% | 27.2% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 58.7% | 52.8% | 34.6% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 40.0% |
| pea_shooter\|compact-core | 18 | 50.0% | 29.0%-71.0% | 58.9% | 50.0% | 24.1% |
| pea_shooter\|corner-keep | 15 | 53.3% | 30.1%-75.2% | 62.2% | 44.9% | 33.3% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 54.8% | 53.3% | 29.6% |
| pea_shooter\|defense-ring | 18 | 44.4% | 24.6%-66.3% | 64.4% | 47.2% | 29.0% |
| pea_shooter\|diamond | 15 | 60.0% | 35.7%-80.2% | 65.0% | 40.0% | 41.5% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 52.7% | 43.5% | 32.6% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.8% | 37.5% | 40.7% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 60.5% | 46.5% | 37.0% |
| pea_shooter\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 55.3% | 63.0% | 20.4% |
| pea_shooter\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 56.6% | 49.2% | 30.4% |
| pea_shooter\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 56.4% | 50.0% | 29.6% |
| pea_shooter\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 57.4% | 55.6% | 31.5% |
| pea_shooter\|split-core | 18 | 55.6% | 33.7%-75.4% | 65.7% | 40.3% | 38.3% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 60.6% | 38.9% | 37.7% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 67.8% | 33.3% | 37.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 98.2% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 97.4% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 96.2% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 97.9% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 96.4% |
| th7-compact-core-272 | 7 | compact-core | maxed | 35 | 0.0% | 96.0% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 95.5% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 93.4% |
| th7-rear-keep-254 | 7 | rear-keep | maxed | 35 | 0.0% | 93.0% |
| th7-crossfire-153 | 7 | crossfire | maxed | 35 | 2.9% | 96.7% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 2.9% | 95.1% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 97.2% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 97.2% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 91.2% |
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 5.6% | 88.5% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,177 | 6,121.43 | 2,044.25 | 1,530.36 |  |
| necromancer | 7 | 15 | 37,167 | 11,349.38 | 2,477.8 | 756.63 |  |
| archer | 7 | 1 | 2,090 | 724.19 | 2,090 | 724.19 |  |
| fire_dragon | 7 | 10 | 15,693 | 7,007.14 | 1,569.3 | 700.71 |  |
| mechanical_dragon | 7 | 4 | 5,885 | 1,668.93 | 1,471.25 | 417.23 | chain x3 |
| demon_king | 7 | 5 | 19,212 | 2,075.56 | 3,842.4 | 415.11 |  |
| knight | 7 | 1 | 3,728 | 403.33 | 3,728 | 403.33 |  |
| mimic | 7 | 6 | 19,391 | 1,422.64 | 3,231.83 | 237.11 | trap immune |
| horror | 7 | 20 | 39,285 | 4,216.94 | 1,964.25 | 210.85 |  |
| pea_shooter | 7 | 5 | 12,030 | 846.29 | 2,406 | 169.26 |  |
| wind_mage | 7 | 15 | 21,546 | 2,448.64 | 1,436.4 | 163.24 |  |
| ice_golem | 7 | 10 | 39,214 | 1,517.61 | 3,921.4 | 151.76 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 57.7% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH6 has 57.7% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.4% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-trap-lanes-244 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-022 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-291 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-294 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-034 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
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
- **INFO / unbeaten-base:** th5-southern-funnel-067 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-229 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-282 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-split-core-118 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-226 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-279 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 17 samples.
- 171 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
