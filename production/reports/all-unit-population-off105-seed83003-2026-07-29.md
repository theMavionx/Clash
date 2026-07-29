# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:08:12.627Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 80
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
**Elapsed:** 139.7s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`; imported base and building IDs must be non-empty and unique.
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
| 5000 | 2781 | 55.6% | 0 | 25.4s | 51.5% | 40.7% | 35.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 989 | 56.4% | 0 | 23.9s | 52.3% | 41.2% |
| TH6->TH6 | 1669 | 933 | 55.9% | 0 | 26.4s | 53.2% | 40.7% |
| TH5->TH5 | 1576 | 859 | 54.5% | 0 | 26.0s | 48.6% | 40.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 179 | 44.1% | 0 | 23.6s | 46.3% | 49.2% |
| resource-shield | 381 | 184 | 48.3% | 0 | 24.2s | 47.5% | 46.7% |
| asymmetric-right | 376 | 194 | 51.6% | 0 | 23.8s | 49.0% | 44.6% |
| crossfire | 339 | 193 | 56.9% | 0 | 25.5s | 49.5% | 39.6% |
| diamond | 338 | 190 | 56.2% | 0 | 23.7s | 50.0% | 40.4% |
| kill-corridor | 336 | 196 | 58.3% | 0 | 24.9s | 48.7% | 37.9% |
| trap-lanes | 274 | 179 | 65.3% | 0 | 26.6s | 55.1% | 33.5% |
| wide-spread | 272 | 196 | 72.1% | 0 | 27.9s | 60.0% | 24.9% |
| compact-core | 250 | 113 | 45.2% | 0 | 25.2s | 48.8% | 50.5% |
| asymmetric-left | 249 | 116 | 46.6% | 0 | 26.1s | 52.5% | 49.8% |
| southern-funnel | 247 | 143 | 57.9% | 0 | 25.7s | 53.0% | 39.1% |
| defense-ring | 245 | 143 | 58.4% | 0 | 26.9s | 56.3% | 37.8% |
| split-core | 239 | 144 | 60.3% | 0 | 24.9s | 54.6% | 35.9% |
| corner-keep | 221 | 115 | 52.0% | 0 | 26.0s | 53.2% | 43.0% |
| echelon-right | 208 | 127 | 61.1% | 0 | 25.6s | 52.2% | 37.3% |
| cannon-screen | 207 | 137 | 66.2% | 0 | 26.8s | 53.7% | 32.3% |
| echelon-left | 206 | 123 | 59.7% | 0 | 28.8s | 53.6% | 37.1% |
| rear-keep | 206 | 109 | 52.9% | 0 | 24.7s | 51.9% | 44.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 94 | 44.3% | 0 | 21.5s | 43.2% | 50.5% |
| resource-shield\|TH7 | 185 | 100 | 54.1% | 0 | 23.0s | 47.3% | 41.2% |
| asymmetric-right\|TH7 | 184 | 101 | 54.9% | 0 | 22.0s | 45.8% | 42.6% |
| kill-corridor\|TH7 | 177 | 107 | 60.5% | 0 | 21.6s | 49.0% | 36.2% |
| crossfire\|TH7 | 176 | 101 | 57.4% | 0 | 22.9s | 48.3% | 39.4% |
| diamond\|TH7 | 175 | 103 | 58.9% | 0 | 22.2s | 50.7% | 38.7% |
| compact-core\|TH6 | 103 | 49 | 47.6% | 0 | 25.2s | 50.4% | 47.5% |
| asymmetric-left\|TH6 | 101 | 54 | 53.5% | 0 | 26.0s | 53.1% | 44.5% |
| layered-rings\|TH6 | 101 | 50 | 49.5% | 0 | 25.3s | 52.6% | 45.7% |
| resource-shield\|TH6 | 101 | 46 | 45.5% | 0 | 25.7s | 49.6% | 51.3% |
| trap-lanes\|TH6 | 101 | 58 | 57.4% | 0 | 26.3s | 53.6% | 40.9% |
| southern-funnel\|TH6 | 100 | 56 | 56.0% | 0 | 26.3s | 50.8% | 39.8% |
| split-core\|TH6 | 100 | 65 | 65.0% | 0 | 25.5s | 56.0% | 32.2% |
| wide-spread\|TH6 | 99 | 67 | 67.7% | 0 | 27.3s | 59.4% | 29.6% |
| asymmetric-right\|TH6 | 98 | 49 | 50.0% | 0 | 25.6s | 54.9% | 44.8% |
| defense-ring\|TH6 | 98 | 60 | 61.2% | 0 | 27.5s | 55.0% | 34.7% |
| resource-shield\|TH5 | 95 | 38 | 40.0% | 0 | 24.8s | 45.7% | 52.5% |
| asymmetric-left\|TH5 | 94 | 39 | 41.5% | 0 | 25.8s | 49.0% | 51.2% |
| asymmetric-right\|TH5 | 94 | 44 | 46.8% | 0 | 25.2s | 49.6% | 48.5% |
| corner-keep\|TH5 | 94 | 48 | 51.1% | 0 | 25.7s | 47.8% | 41.3% |
| split-core\|TH5 | 94 | 53 | 56.4% | 0 | 23.9s | 50.2% | 36.9% |
| compact-core\|TH5 | 93 | 45 | 48.4% | 0 | 25.0s | 44.6% | 46.6% |
| defense-ring\|TH5 | 93 | 50 | 53.8% | 0 | 26.3s | 52.4% | 40.5% |
| layered-rings\|TH5 | 93 | 35 | 37.6% | 0 | 26.7s | 46.9% | 49.9% |
| southern-funnel\|TH5 | 93 | 58 | 62.4% | 0 | 23.2s | 50.9% | 34.0% |
| trap-lanes\|TH5 | 93 | 62 | 66.7% | 0 | 26.7s | 48.7% | 32.0% |
| wide-spread\|TH5 | 93 | 67 | 72.0% | 0 | 28.7s | 57.4% | 23.1% |
| diamond\|TH6 | 85 | 46 | 54.1% | 0 | 26.2s | 52.5% | 42.8% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 24.4s | 52.5% | 37.7% |
| cannon-screen\|TH6 | 84 | 58 | 69.0% | 0 | 27.5s | 55.1% | 28.9% |
| crossfire\|TH6 | 84 | 44 | 52.4% | 0 | 27.6s | 49.1% | 43.7% |
| echelon-left\|TH6 | 83 | 49 | 59.0% | 0 | 31.2s | 54.4% | 35.8% |
| corner-keep\|TH6 | 82 | 43 | 52.4% | 0 | 25.9s | 54.6% | 43.4% |
| kill-corridor\|TH6 | 82 | 45 | 54.9% | 0 | 27.3s | 52.4% | 40.8% |
| rear-keep\|TH6 | 82 | 42 | 51.2% | 0 | 24.5s | 50.7% | 47.7% |
| trap-lanes\|TH7 | 80 | 59 | 73.8% | 0 | 26.9s | 63.6% | 25.8% |
| wide-spread\|TH7 | 80 | 62 | 77.5% | 0 | 27.8s | 63.4% | 21.0% |
| crossfire\|TH5 | 79 | 48 | 60.8% | 0 | 29.1s | 52.9% | 35.8% |
| rear-keep\|TH5 | 79 | 40 | 50.6% | 0 | 24.1s | 47.0% | 42.5% |
| cannon-screen\|TH5 | 78 | 51 | 65.4% | 0 | 26.9s | 45.8% | 32.6% |
| diamond\|TH5 | 78 | 41 | 52.6% | 0 | 24.2s | 45.6% | 41.8% |
| echelon-left\|TH5 | 78 | 48 | 61.5% | 0 | 27.8s | 49.1% | 36.1% |
| echelon-right\|TH5 | 78 | 48 | 61.5% | 0 | 25.8s | 46.5% | 35.1% |
| kill-corridor\|TH5 | 77 | 44 | 57.1% | 0 | 29.8s | 43.6% | 38.4% |
| asymmetric-left\|TH7 | 54 | 23 | 42.6% | 0 | 26.9s | 57.0% | 57.0% |
| compact-core\|TH7 | 54 | 19 | 35.2% | 0 | 25.8s | 52.6% | 62.9% |
| defense-ring\|TH7 | 54 | 33 | 61.1% | 0 | 26.9s | 64.9% | 38.9% |
| southern-funnel\|TH7 | 54 | 29 | 53.7% | 0 | 28.9s | 60.2% | 46.3% |
| cannon-screen\|TH7 | 45 | 28 | 62.2% | 0 | 25.4s | 63.7% | 37.8% |
| corner-keep\|TH7 | 45 | 24 | 53.3% | 0 | 27.0s | 60.9% | 46.0% |
| echelon-left\|TH7 | 45 | 26 | 57.8% | 0 | 26.1s | 59.3% | 41.3% |
| echelon-right\|TH7 | 45 | 27 | 60.0% | 0 | 27.5s | 60.7% | 40.0% |
| rear-keep\|TH7 | 45 | 27 | 60.0% | 0 | 26.0s | 61.9% | 40.0% |
| split-core\|TH7 | 45 | 26 | 57.8% | 0 | 25.6s | 59.7% | 42.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 53 | 5.0% | 0 | 19.7s | 33.5% | 87.8% |
| mid | 1011 | 859 | 85.0% | 0 | 31.1s | 65.0% | 11.6% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 27.8s | 70.7% | 0.0% |
| maxed | 985 | 17 | 1.7% | 0 | 20.6s | 20.7% | 92.9% |
| mixed | 953 | 853 | 89.5% | 0 | 28.1s | 68.5% | 8.3% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1466 | 56.3% | 0 | 22.1s | 41.4% | 37.6% |
| pure-unit-matrix | 2398 | 1315 | 54.8% | 0 | 29.0s | 62.3% | 44.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 485 | 54.4% | 0 | 26.7s | 60.7% | 45.0% |
| policy-exploration\|TH5 | 869 | 480 | 55.2% | 0 | 21.9s | 35.6% | 36.5% |
| policy-exploration\|TH6 | 869 | 482 | 55.5% | 0 | 23.3s | 44.8% | 39.0% |
| policy-exploration\|TH7 | 864 | 504 | 58.3% | 0 | 21.0s | 43.6% | 37.1% |
| pure-unit-matrix\|TH6 | 800 | 451 | 56.4% | 0 | 29.6s | 62.3% | 42.6% |
| pure-unit-matrix\|TH5 | 707 | 379 | 53.6% | 0 | 31.2s | 64.6% | 44.6% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1705 | 982 | 57.6% | 0 | 21.9s | 42.0% | 36.3% |
| policy-exploration\|fire_dragon | 1496 | 861 | 57.6% | 0 | 20.2s | 42.6% | 37.1% |
| policy-exploration\|archer | 1416 | 806 | 56.9% | 0 | 21.8s | 41.4% | 36.7% |
| policy-exploration\|mage | 1406 | 782 | 55.6% | 0 | 20.7s | 41.1% | 39.3% |
| policy-exploration\|demon_king | 1363 | 770 | 56.5% | 0 | 21.6s | 41.8% | 36.9% |
| policy-exploration\|mimic | 1290 | 737 | 57.1% | 0 | 22.7s | 41.1% | 36.0% |
| policy-exploration\|pea_shooter | 850 | 477 | 56.1% | 0 | 21.3s | 40.7% | 38.3% |
| policy-exploration\|mechanical_dragon | 658 | 378 | 57.4% | 0 | 21.1s | 46.3% | 38.7% |
| pure-unit-matrix\|archer | 300 | 154 | 51.3% | 0 | 34.7s | 60.0% | 48.0% |
| pure-unit-matrix\|demon_king | 300 | 189 | 63.0% | 0 | 28.2s | 68.9% | 34.6% |
| pure-unit-matrix\|fire_dragon | 300 | 182 | 60.7% | 0 | 20.5s | 67.2% | 39.1% |
| pure-unit-matrix\|knight | 300 | 173 | 57.7% | 0 | 32.4s | 64.1% | 40.2% |
| pure-unit-matrix\|mage | 300 | 143 | 47.7% | 0 | 24.7s | 57.3% | 51.7% |
| pure-unit-matrix\|mimic | 300 | 159 | 53.0% | 0 | 34.9s | 58.7% | 45.6% |
| pure-unit-matrix\|pea_shooter | 300 | 153 | 51.0% | 0 | 28.4s | 59.8% | 48.3% |
| policy-exploration\|necromancer | 223 | 115 | 51.6% | 0 | 20.9s | 39.5% | 45.2% |
| pure-unit-matrix\|mechanical_dragon | 199 | 118 | 59.3% | 0 | 26.3s | 67.3% | 40.3% |
| pure-unit-matrix\|necromancer | 99 | 44 | 44.4% | 0 | 31.7s | 52.9% | 54.9% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 602 | 341 | 56.6% | 0 | 21.8s | 36.2% | 35.7% |
| policy-exploration\|knight\|TH6 | 568 | 324 | 57.0% | 0 | 22.9s | 44.6% | 37.0% |
| policy-exploration\|fire_dragon\|TH5 | 536 | 302 | 56.3% | 0 | 20.1s | 36.5% | 36.6% |
| policy-exploration\|knight\|TH7 | 535 | 317 | 59.3% | 0 | 21.0s | 45.3% | 36.2% |
| policy-exploration\|mage\|TH5 | 518 | 274 | 52.9% | 0 | 20.3s | 34.6% | 40.4% |
| policy-exploration\|archer\|TH5 | 513 | 289 | 56.3% | 0 | 21.5s | 34.9% | 35.0% |
| policy-exploration\|demon_king\|TH5 | 505 | 275 | 54.5% | 0 | 21.3s | 35.3% | 36.6% |
| policy-exploration\|fire_dragon\|TH6 | 498 | 286 | 57.4% | 0 | 21.3s | 45.1% | 36.9% |
| policy-exploration\|mimic\|TH5 | 493 | 267 | 54.2% | 0 | 22.5s | 34.4% | 36.7% |
| policy-exploration\|mage\|TH6 | 463 | 258 | 55.7% | 0 | 22.1s | 44.5% | 38.8% |
| policy-exploration\|fire_dragon\|TH7 | 462 | 273 | 59.1% | 0 | 19.3s | 46.4% | 37.9% |
| policy-exploration\|archer\|TH6 | 458 | 257 | 56.1% | 0 | 23.0s | 43.9% | 38.0% |
| policy-exploration\|archer\|TH7 | 445 | 260 | 58.4% | 0 | 21.1s | 45.7% | 37.4% |
| policy-exploration\|demon_king\|TH6 | 433 | 247 | 57.0% | 0 | 22.8s | 46.0% | 36.4% |
| policy-exploration\|mimic\|TH6 | 433 | 255 | 58.9% | 0 | 23.5s | 45.2% | 35.3% |
| policy-exploration\|demon_king\|TH7 | 425 | 248 | 58.4% | 0 | 20.8s | 44.8% | 37.7% |
| policy-exploration\|mage\|TH7 | 425 | 250 | 58.8% | 0 | 19.8s | 44.9% | 38.5% |
| policy-exploration\|mechanical_dragon\|TH6 | 373 | 203 | 54.4% | 0 | 21.7s | 44.6% | 40.3% |
| policy-exploration\|mimic\|TH7 | 364 | 215 | 59.1% | 0 | 22.1s | 44.7% | 35.9% |
| policy-exploration\|pea_shooter\|TH5 | 333 | 180 | 54.1% | 0 | 20.6s | 32.6% | 38.2% |
| policy-exploration\|pea_shooter\|TH6 | 306 | 165 | 53.9% | 0 | 22.2s | 43.8% | 40.1% |
| policy-exploration\|mechanical_dragon\|TH7 | 285 | 175 | 61.4% | 0 | 20.3s | 48.4% | 36.5% |
| policy-exploration\|necromancer\|TH7 | 223 | 115 | 51.6% | 0 | 20.9s | 39.5% | 45.2% |
| policy-exploration\|pea_shooter\|TH7 | 211 | 132 | 62.6% | 0 | 20.9s | 48.2% | 35.8% |
| pure-unit-matrix\|archer\|TH5 | 101 | 47 | 46.5% | 0 | 39.3s | 63.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 67 | 66.3% | 0 | 30.6s | 73.3% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.5% | 39.8% |
| pure-unit-matrix\|knight\|TH5 | 101 | 57 | 56.4% | 0 | 35.1s | 65.3% | 40.3% |
| pure-unit-matrix\|mage\|TH5 | 101 | 48 | 47.5% | 0 | 26.1s | 60.7% | 51.3% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 48 | 47.5% | 0 | 36.7s | 56.5% | 50.7% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 52 | 51.5% | 0 | 29.1s | 64.7% | 47.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 51 | 51.0% | 0 | 34.9s | 55.7% | 49.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 65 | 65.0% | 0 | 29.0s | 70.4% | 32.7% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.4s | 65.1% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 58 | 58.0% | 0 | 33.3s | 65.4% | 39.6% |
| pure-unit-matrix\|mage\|TH6 | 100 | 45 | 45.0% | 0 | 24.6s | 53.6% | 54.3% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 28.5s | 66.6% | 40.4% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 62 | 62.0% | 0 | 34.6s | 65.4% | 35.9% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 50 | 50.0% | 0 | 30.8s | 56.1% | 49.6% |
| pure-unit-matrix\|archer\|TH7 | 99 | 56 | 56.6% | 0 | 29.9s | 61.3% | 43.2% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 25.0s | 63.3% | 40.4% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 61 | 61.6% | 0 | 18.8s | 68.1% | 38.3% |
| pure-unit-matrix\|knight\|TH7 | 99 | 58 | 58.6% | 0 | 28.8s | 61.9% | 40.9% |
| pure-unit-matrix\|mage\|TH7 | 99 | 50 | 50.5% | 0 | 23.4s | 57.7% | 49.4% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 24.0s | 68.0% | 40.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 49 | 49.5% | 0 | 33.4s | 54.2% | 50.1% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 44 | 44.4% | 0 | 31.7s | 52.9% | 54.9% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 51 | 51.5% | 0 | 25.3s | 58.8% | 48.1% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1315 | 54.8% | 0 | 29.0s | 62.3% | 44.1% |
| policy-exploration\|cannon-focus | 479 | 282 | 58.9% | 0 | 28.5s | 64.5% | 39.7% |
| policy-exploration\|cannon-rally | 479 | 265 | 55.3% | 0 | 14.6s | 6.7% | 32.1% |
| policy-exploration\|rally-core | 454 | 239 | 52.6% | 0 | 15.2s | 5.8% | 32.0% |
| policy-exploration\|none | 444 | 246 | 55.4% | 0 | 26.6s | 64.5% | 43.5% |
| policy-exploration\|cannon-medkit | 246 | 137 | 55.7% | 0 | 25.7s | 61.3% | 43.5% |
| policy-exploration\|medkit-entry | 150 | 80 | 53.3% | 0 | 27.5s | 63.1% | 45.1% |
| policy-exploration\|freeze-rage | 105 | 69 | 65.7% | 0 | 25.3s | 70.0% | 32.5% |
| policy-exploration\|rally-rage | 105 | 66 | 62.9% | 0 | 14.1s | 8.5% | 27.5% |
| policy-exploration\|freeze-barrel | 100 | 59 | 59.0% | 0 | 25.7s | 67.6% | 40.2% |
| policy-exploration\|skeleton-barrel | 40 | 23 | 57.5% | 0 | 23.1s | 62.8% | 42.5% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 303 | 157 | 51.8% | 0 | 21.9s | 35.8% | 42.0% |
| policy-exploration\|wide-line | 284 | 136 | 47.9% | 0 | 22.3s | 54.0% | 47.4% |
| policy-exploration\|vanguard-wedge | 276 | 162 | 58.7% | 0 | 26.5s | 55.8% | 37.2% |
| policy-exploration\|center-column | 269 | 187 | 69.5% | 0 | 24.2s | 53.8% | 28.6% |
| policy-exploration\|right-flank | 266 | 188 | 70.7% | 0 | 23.7s | 46.3% | 25.0% |
| policy-exploration\|dual-flank | 264 | 150 | 56.8% | 0 | 24.7s | 56.9% | 38.8% |
| policy-exploration\|edge-sweep | 261 | 113 | 43.3% | 0 | 18.0s | 27.5% | 47.0% |
| pure-unit-matrix\|center-column | 240 | 130 | 54.2% | 0 | 29.2s | 60.7% | 45.2% |
| pure-unit-matrix\|diamond | 240 | 127 | 52.9% | 0 | 29.2s | 62.3% | 46.2% |
| pure-unit-matrix\|dual-flank | 240 | 128 | 53.3% | 0 | 27.3s | 63.2% | 46.2% |
| pure-unit-matrix\|inverted-wedge | 240 | 135 | 56.3% | 0 | 30.1s | 61.9% | 42.9% |
| pure-unit-matrix\|left-flank | 240 | 147 | 61.3% | 0 | 30.3s | 62.0% | 36.7% |
| pure-unit-matrix\|right-flank | 240 | 140 | 58.3% | 0 | 31.3s | 61.5% | 38.6% |
| pure-unit-matrix\|three-lane | 240 | 126 | 52.5% | 0 | 28.4s | 62.3% | 46.8% |
| pure-unit-matrix\|vanguard-wedge | 240 | 130 | 54.2% | 0 | 29.1s | 61.1% | 45.4% |
| pure-unit-matrix\|wide-line | 240 | 133 | 55.4% | 0 | 27.9s | 64.7% | 43.8% |
| pure-unit-matrix\|edge-sweep | 238 | 119 | 50.0% | 0 | 27.2s | 63.4% | 49.0% |
| policy-exploration\|left-flank | 232 | 165 | 71.1% | 0 | 18.5s | 25.4% | 20.2% |
| policy-exploration\|inverted-wedge | 224 | 121 | 54.0% | 0 | 22.3s | 29.7% | 34.7% |
| policy-exploration\|three-lane | 223 | 87 | 39.0% | 0 | 17.1s | 20.5% | 53.6% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 526 | 308 | 58.6% | 0 | 21.4s | 44.5% | 34.5% |
| policy-exploration\|three-waves | 526 | 288 | 54.8% | 0 | 21.7s | 39.0% | 38.8% |
| policy-exploration\|rapid | 520 | 285 | 54.8% | 0 | 21.9s | 41.4% | 38.0% |
| policy-exploration\|two-waves | 516 | 263 | 51.0% | 0 | 21.3s | 39.6% | 43.5% |
| policy-exploration\|drip | 514 | 322 | 62.6% | 0 | 24.1s | 42.7% | 33.0% |
| pure-unit-matrix\|burst | 480 | 281 | 58.5% | 0 | 29.5s | 64.1% | 40.4% |
| pure-unit-matrix\|rapid | 480 | 263 | 54.8% | 0 | 28.9s | 62.7% | 43.8% |
| pure-unit-matrix\|three-waves | 480 | 269 | 56.0% | 0 | 28.9s | 63.7% | 42.5% |
| pure-unit-matrix\|two-waves | 480 | 243 | 50.6% | 0 | 28.4s | 59.8% | 48.6% |
| pure-unit-matrix\|drip | 478 | 259 | 54.2% | 0 | 29.4s | 61.2% | 45.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 739 | 56.8% | 0 | 21.9s | 41.6% | 36.1% |
| policy-exploration\|tank-front-support-rear | 1301 | 727 | 55.9% | 0 | 22.2s | 41.3% | 39.0% |
| pure-unit-matrix\|roster-order | 1199 | 651 | 54.3% | 0 | 28.3s | 61.9% | 44.6% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 664 | 55.4% | 0 | 29.7s | 62.7% | 43.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 416 | 196 | 47.1% | 0 | 23.5s | 51.6% | 51.7% |
| pure-mimic | 410 | 228 | 55.6% | 0 | 32.7s | 52.2% | 41.4% |
| pure-fire_dragon | 409 | 250 | 61.1% | 0 | 20.1s | 63.2% | 37.5% |
| pure-pea_shooter | 405 | 210 | 51.9% | 0 | 27.1s | 54.6% | 46.7% |
| pure-demon_king | 404 | 244 | 60.4% | 0 | 26.8s | 61.6% | 34.1% |
| pure-archer | 393 | 202 | 51.4% | 0 | 33.3s | 55.0% | 46.0% |
| pure-knight | 388 | 231 | 59.5% | 0 | 30.7s | 58.3% | 36.8% |
| pure-mechanical_dragon | 262 | 150 | 57.3% | 0 | 25.2s | 61.7% | 41.8% |
| pure-necromancer | 131 | 57 | 43.5% | 0 | 29.6s | 47.7% | 55.0% |
| melee-pressure | 117 | 64 | 54.7% | 0 | 26.6s | 41.8% | 34.1% |
| core-fire_dragon-filled | 111 | 68 | 61.3% | 0 | 18.3s | 41.5% | 31.8% |
| balanced | 110 | 67 | 60.9% | 0 | 19.0s | 40.0% | 33.0% |
| hero-necro-dragon-mages | 110 | 66 | 60.0% | 0 | 19.4s | 44.3% | 38.1% |
| random-3 | 110 | 62 | 56.4% | 0 | 22.2s | 46.6% | 37.3% |
| random-1 | 108 | 61 | 56.5% | 0 | 20.0s | 41.4% | 39.0% |
| random-2 | 105 | 67 | 63.8% | 0 | 20.9s | 43.2% | 30.2% |
| frontline-ranged | 104 | 58 | 55.8% | 0 | 19.8s | 41.7% | 40.6% |
| random-5 | 104 | 54 | 51.9% | 0 | 20.9s | 38.2% | 43.3% |
| support-mix | 104 | 53 | 51.0% | 0 | 23.8s | 39.1% | 40.1% |
| random-4 | 97 | 50 | 51.5% | 0 | 20.9s | 37.7% | 43.1% |
| random-6 | 97 | 58 | 59.8% | 0 | 20.8s | 41.2% | 35.8% |
| core-mimic-filled | 93 | 58 | 62.4% | 0 | 29.2s | 44.4% | 29.3% |
| trap-runner-mix | 93 | 55 | 59.1% | 0 | 23.5s | 47.8% | 32.4% |
| core-mage-filled | 92 | 46 | 50.0% | 0 | 21.6s | 39.0% | 46.6% |
| ranged-pressure | 87 | 47 | 54.0% | 0 | 19.2s | 37.9% | 39.4% |
| air-pressure | 78 | 42 | 53.8% | 0 | 17.3s | 44.4% | 43.6% |
| core-mechanical_dragon-filled | 62 | 37 | 59.7% | 0 | 22.9s | 50.2% | 36.1% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__two-waves__roster-order | 57 | 32 | 56.1% | 0 | 26.9s | 48.4% | 38.5% |
| wide-line__burst__tank-front-support-rear | 57 | 31 | 54.4% | 0 | 24.5s | 57.5% | 41.6% |
| diamond__burst__roster-order | 56 | 25 | 44.6% | 0 | 20.5s | 37.7% | 51.2% |
| diamond__rapid__roster-order | 56 | 26 | 46.4% | 0 | 23.9s | 43.2% | 40.2% |
| diamond__rapid__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 25.6s | 49.6% | 47.4% |
| diamond__two-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 24.6s | 43.8% | 51.8% |
| dual-flank__three-waves__roster-order | 56 | 26 | 46.4% | 0 | 25.3s | 50.7% | 47.0% |
| dual-flank__two-waves__roster-order | 56 | 34 | 60.7% | 0 | 24.0s | 62.1% | 37.7% |
| edge-sweep__drip__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 23.2s | 49.5% | 50.0% |
| edge-sweep__three-waves__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 23.8s | 48.0% | 45.3% |
| left-flank__drip__roster-order | 56 | 49 | 87.5% | 0 | 24.6s | 47.6% | 11.1% |
| right-flank__three-waves__roster-order | 56 | 37 | 66.1% | 0 | 27.4s | 54.6% | 27.0% |
| vanguard-wedge__burst__roster-order | 56 | 30 | 53.6% | 0 | 26.1s | 52.6% | 37.2% |
| vanguard-wedge__rapid__roster-order | 56 | 33 | 58.9% | 0 | 26.3s | 57.4% | 39.7% |
| wide-line__drip__tank-front-support-rear | 56 | 34 | 60.7% | 0 | 27.7s | 64.8% | 36.7% |
| center-column__burst__roster-order | 55 | 41 | 74.5% | 0 | 27.2s | 65.2% | 25.5% |
| diamond__burst__tank-front-support-rear | 55 | 31 | 56.4% | 0 | 25.7s | 49.1% | 36.8% |
| diamond__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 26.8s | 46.8% | 46.4% |
| dual-flank__rapid__roster-order | 55 | 30 | 54.5% | 0 | 27.0s | 63.3% | 44.9% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 35 | 63.6% | 0 | 30.1s | 61.4% | 33.0% |
| right-flank__rapid__roster-order | 55 | 36 | 65.5% | 0 | 25.3s | 53.8% | 29.2% |
| right-flank__two-waves__roster-order | 55 | 32 | 58.2% | 0 | 29.4s | 57.7% | 40.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 27.2s | 61.3% | 31.1% |
| wide-line__drip__roster-order | 55 | 35 | 63.6% | 0 | 26.4s | 67.2% | 36.4% |
| wide-line__three-waves__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 24.7s | 54.7% | 52.6% |
| wide-line__two-waves__tank-front-support-rear | 55 | 24 | 43.6% | 0 | 25.0s | 59.1% | 56.4% |
| center-column__two-waves__roster-order | 54 | 26 | 48.1% | 0 | 22.9s | 48.5% | 49.9% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 26.6s | 54.0% | 51.3% |
| vanguard-wedge__drip__tank-front-support-rear | 54 | 31 | 57.4% | 0 | 31.0s | 62.3% | 40.5% |
| wide-line__three-waves__roster-order | 54 | 27 | 50.0% | 0 | 23.9s | 59.6% | 47.8% |
| center-column__drip__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 29.2s | 45.4% | 33.0% |
| center-column__three-waves__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 25.7s | 54.3% | 31.3% |
| diamond__drip__roster-order | 51 | 32 | 62.7% | 0 | 29.0s | 58.5% | 35.4% |
| diamond__three-waves__roster-order | 51 | 26 | 51.0% | 0 | 25.0s | 53.7% | 48.7% |
| edge-sweep__burst__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 21.0s | 35.9% | 46.6% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 23.7s | 38.6% | 47.4% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 21.1s | 45.0% | 55.8% |
| left-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 25.0s | 44.0% | 31.4% |
| right-flank__three-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 27.1s | 53.5% | 33.4% |
| right-flank__two-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 25.3s | 50.8% | 34.4% |
| three-lane__three-waves__roster-order | 51 | 22 | 43.1% | 0 | 22.1s | 39.4% | 47.2% |
| three-lane__two-waves__roster-order | 51 | 16 | 31.4% | 0 | 18.7s | 31.0% | 60.6% |
| wide-line__burst__roster-order | 51 | 29 | 56.9% | 0 | 24.5s | 62.6% | 38.1% |
| wide-line__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 28.5s | 61.6% | 44.4% |
| center-column__burst__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 25.4s | 64.2% | 37.1% |
| center-column__drip__roster-order | 50 | 32 | 64.0% | 0 | 23.9s | 51.5% | 35.0% |
| center-column__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 28.9s | 60.5% | 49.0% |
| center-column__two-waves__tank-front-support-rear | 50 | 36 | 72.0% | 0 | 29.0s | 63.0% | 28.0% |
| diamond__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 23.6s | 45.8% | 41.6% |
| dual-flank__burst__roster-order | 50 | 26 | 52.0% | 0 | 27.0s | 62.5% | 46.4% |
| dual-flank__drip__roster-order | 50 | 23 | 46.0% | 0 | 22.7s | 51.2% | 53.2% |
| dual-flank__three-waves__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 27.4s | 61.0% | 37.9% |
| dual-flank__two-waves__tank-front-support-rear | 50 | 27 | 54.0% | 0 | 27.0s | 62.6% | 46.0% |
| edge-sweep__three-waves__roster-order | 50 | 20 | 40.0% | 0 | 22.3s | 42.8% | 50.9% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 24.3s | 39.8% | 34.1% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 26.1s | 45.9% | 42.7% |
| left-flank__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 24.5s | 51.8% | 30.2% |
| right-flank__burst__roster-order | 50 | 40 | 80.0% | 0 | 26.3s | 48.8% | 18.0% |
| right-flank__rapid__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 26.3s | 43.7% | 33.0% |
| three-lane__rapid__roster-order | 50 | 23 | 46.0% | 0 | 21.4s | 45.2% | 52.2% |
| vanguard-wedge__two-waves__roster-order | 50 | 26 | 52.0% | 0 | 28.0s | 59.0% | 46.6% |
| center-column__rapid__roster-order | 49 | 28 | 57.1% | 0 | 26.0s | 58.8% | 41.3% |
| center-column__three-waves__roster-order | 49 | 31 | 63.3% | 0 | 27.5s | 59.5% | 34.8% |
| dual-flank__burst__tank-front-support-rear | 49 | 39 | 79.6% | 0 | 26.8s | 71.5% | 19.3% |
| dual-flank__rapid__tank-front-support-rear | 49 | 30 | 61.2% | 0 | 27.2s | 61.6% | 37.2% |
| edge-sweep__drip__roster-order | 49 | 32 | 65.3% | 0 | 24.8s | 52.5% | 33.0% |
| inverted-wedge__burst__roster-order | 49 | 29 | 59.2% | 0 | 23.9s | 52.6% | 35.9% |
| inverted-wedge__three-waves__tank-front-support-rear | 49 | 26 | 53.1% | 0 | 27.1s | 36.5% | 38.6% |
| left-flank__two-waves__roster-order | 49 | 32 | 65.3% | 0 | 24.8s | 40.4% | 25.7% |
| right-flank__drip__roster-order | 49 | 28 | 57.1% | 0 | 29.9s | 48.6% | 38.6% |
| vanguard-wedge__drip__roster-order | 49 | 28 | 57.1% | 0 | 30.0s | 55.8% | 41.9% |
| vanguard-wedge__three-waves__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 25.9s | 57.5% | 52.5% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 26.2s | 54.6% | 39.5% |
| edge-sweep__burst__roster-order | 45 | 18 | 40.0% | 0 | 21.7s | 40.4% | 53.6% |
| edge-sweep__rapid__roster-order | 45 | 17 | 37.8% | 0 | 21.1s | 46.5% | 50.7% |
| edge-sweep__two-waves__roster-order | 45 | 22 | 48.9% | 0 | 20.7s | 46.6% | 46.5% |
| inverted-wedge__rapid__roster-order | 45 | 25 | 55.6% | 0 | 26.6s | 53.5% | 38.7% |
| left-flank__burst__tank-front-support-rear | 45 | 32 | 71.1% | 0 | 29.2s | 54.1% | 24.3% |
| left-flank__drip__tank-front-support-rear | 45 | 23 | 51.1% | 0 | 26.0s | 47.8% | 44.7% |
| right-flank__burst__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 25.5s | 58.1% | 31.7% |
| three-lane__burst__roster-order | 45 | 24 | 53.3% | 0 | 22.9s | 55.0% | 46.0% |
| three-lane__drip__roster-order | 45 | 20 | 44.4% | 0 | 28.1s | 39.6% | 50.5% |
| three-lane__two-waves__tank-front-support-rear | 45 | 13 | 28.9% | 0 | 22.8s | 35.5% | 67.4% |
| wide-line__rapid__roster-order | 45 | 21 | 46.7% | 0 | 21.8s | 53.7% | 52.3% |
| wide-line__two-waves__roster-order | 45 | 16 | 35.6% | 0 | 20.5s | 45.2% | 53.6% |
| inverted-wedge__drip__roster-order | 44 | 28 | 63.6% | 0 | 26.3s | 35.9% | 30.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 18 | 40.9% | 0 | 22.6s | 34.8% | 55.1% |
| left-flank__burst__roster-order | 44 | 24 | 54.5% | 0 | 21.4s | 34.9% | 34.4% |
| left-flank__rapid__roster-order | 44 | 28 | 63.6% | 0 | 22.0s | 37.4% | 31.2% |
| left-flank__rapid__tank-front-support-rear | 44 | 34 | 77.3% | 0 | 24.6s | 47.6% | 18.9% |
| left-flank__two-waves__tank-front-support-rear | 44 | 25 | 56.8% | 0 | 22.6s | 33.6% | 38.2% |
| right-flank__drip__tank-front-support-rear | 44 | 31 | 70.5% | 0 | 30.6s | 67.0% | 28.7% |
| three-lane__burst__tank-front-support-rear | 44 | 27 | 61.4% | 0 | 28.4s | 57.0% | 36.3% |
| three-lane__drip__tank-front-support-rear | 44 | 21 | 47.7% | 0 | 22.7s | 42.6% | 48.9% |
| three-lane__rapid__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 23.9s | 45.5% | 42.7% |
| three-lane__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 19.8s | 33.7% | 47.5% |
| vanguard-wedge__three-waves__roster-order | 44 | 31 | 70.5% | 0 | 29.9s | 69.7% | 29.5% |
| dual-flank__drip__tank-front-support-rear | 39 | 16 | 41.0% | 0 | 25.4s | 52.0% | 55.6% |
| inverted-wedge__three-waves__roster-order | 39 | 24 | 61.5% | 0 | 24.3s | 43.2% | 32.1% |
| inverted-wedge__two-waves__roster-order | 39 | 18 | 46.2% | 0 | 31.9s | 59.5% | 51.6% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 543 | 284 | 52.3% | 0 | 25.1s | 47.5% | 43.9% |
| wide-line | 524 | 269 | 51.3% | 0 | 24.9s | 58.9% | 45.8% |
| vanguard-wedge | 516 | 292 | 56.6% | 0 | 27.7s | 58.2% | 41.0% |
| center-column | 509 | 317 | 62.3% | 0 | 26.6s | 57.1% | 36.5% |
| right-flank | 506 | 328 | 64.8% | 0 | 27.3s | 53.5% | 31.5% |
| dual-flank | 504 | 278 | 55.2% | 0 | 26.0s | 59.9% | 42.3% |
| edge-sweep | 499 | 232 | 46.5% | 0 | 22.4s | 44.6% | 47.9% |
| left-flank | 472 | 312 | 66.1% | 0 | 24.5s | 44.1% | 28.6% |
| inverted-wedge | 464 | 256 | 55.2% | 0 | 26.3s | 46.5% | 39.0% |
| three-lane | 463 | 213 | 46.0% | 0 | 23.0s | 42.3% | 50.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1006 | 589 | 58.5% | 0 | 25.3s | 53.9% | 37.3% |
| three-waves | 1006 | 557 | 55.4% | 0 | 25.1s | 50.8% | 40.5% |
| rapid | 1000 | 548 | 54.8% | 0 | 25.2s | 51.7% | 40.8% |
| two-waves | 996 | 506 | 50.8% | 0 | 24.7s | 49.4% | 46.0% |
| drip | 992 | 581 | 58.6% | 0 | 26.6s | 51.6% | 38.9% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1390 | 55.6% | 0 | 25.0s | 51.4% | 40.2% |
| tank-front-support-rear | 2500 | 1391 | 55.6% | 0 | 25.8s | 51.6% | 41.2% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2842 | 1561 | 54.9% | 0 | 28.6s | 62.6% | 44.0% |
| cannon-focus | 479 | 282 | 58.9% | 0 | 28.5s | 64.5% | 39.7% |
| cannon-rally | 479 | 265 | 55.3% | 0 | 14.6s | 6.7% | 32.1% |
| rally-core | 454 | 239 | 52.6% | 0 | 15.2s | 5.8% | 32.0% |
| cannon-medkit | 246 | 137 | 55.7% | 0 | 25.7s | 61.3% | 43.5% |
| medkit-entry | 150 | 80 | 53.3% | 0 | 27.5s | 63.1% | 45.1% |
| freeze-rage | 105 | 69 | 65.7% | 0 | 25.3s | 70.0% | 32.5% |
| rally-rage | 105 | 66 | 62.9% | 0 | 14.1s | 8.5% | 27.5% |
| freeze-barrel | 100 | 59 | 59.0% | 0 | 25.7s | 67.6% | 40.2% |
| skeleton-barrel | 40 | 23 | 57.5% | 0 | 23.1s | 62.8% | 42.5% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1342 | 833 | 62.1% | 0 | 22.8s | 56.4% | 34.9% |
| legendary | 725 | 400 | 55.2% | 0 | 21.5s | 44.2% | 38.8% |
| epic | 708 | 395 | 55.8% | 0 | 20.1s | 37.9% | 37.0% |
| unrevealed | 684 | 374 | 54.7% | 0 | 20.5s | 39.4% | 38.9% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 689 | 421 | 61.1% | 0 | 20.6s | 56.0% | 36.4% |
| demon_king\|common | 653 | 412 | 63.1% | 0 | 25.0s | 56.9% | 33.3% |
| fire_dragon\|legendary | 381 | 220 | 57.7% | 0 | 21.2s | 46.3% | 36.9% |
| fire_dragon\|epic | 374 | 204 | 54.5% | 0 | 19.5s | 37.8% | 39.0% |
| fire_dragon\|unrevealed | 352 | 198 | 56.3% | 0 | 19.5s | 38.4% | 38.4% |
| demon_king\|legendary | 344 | 180 | 52.3% | 0 | 21.8s | 41.9% | 41.0% |
| demon_king\|epic | 334 | 191 | 57.2% | 0 | 20.7s | 38.0% | 34.8% |
| demon_king\|unrevealed | 332 | 176 | 53.0% | 0 | 21.5s | 40.4% | 39.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1685 | 55.6% | 0 | 27.6s | 58.1% | 42.3% |
| ward-1 | 767 | 441 | 57.5% | 0 | 22.2s | 41.9% | 36.2% |
| ward-3 | 601 | 317 | 52.7% | 0 | 22.0s | 39.7% | 40.8% |
| ward-2 | 600 | 338 | 56.3% | 0 | 21.6s | 41.8% | 38.1% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2781 | 55.6% | 0 | 25.4s | 51.5% | 40.7% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2005 | 1155 | 57.6% | 0 | 23.5s | 45.3% | 36.9% |
| fire_dragon | 1796 | 1043 | 58.1% | 0 | 20.3s | 46.7% | 37.4% |
| archer | 1716 | 960 | 55.9% | 0 | 24.1s | 44.7% | 38.7% |
| mage | 1706 | 925 | 54.2% | 0 | 21.5s | 44.0% | 41.5% |
| demon_king | 1663 | 959 | 57.7% | 0 | 22.8s | 46.7% | 36.5% |
| mimic | 1590 | 896 | 56.4% | 0 | 25.0s | 44.4% | 37.8% |
| pea_shooter | 1150 | 630 | 54.8% | 0 | 23.1s | 45.8% | 40.9% |
| mechanical_dragon | 857 | 496 | 57.9% | 0 | 22.3s | 51.2% | 39.0% |
| necromancer | 322 | 159 | 49.4% | 0 | 24.2s | 43.6% | 48.2% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 51.3% | 45.7%-56.9% | 60.0% | 48.0% | 28.7% |
| demon_king | 300 | 63.0% | 57.4%-68.3% | 68.9% | 34.6% | 52.7% |
| fire_dragon | 300 | 60.7% | 55.0%-66.0% | 67.2% | 39.1% | 51.8% |
| knight | 300 | 57.7% | 52.0%-63.1% | 64.1% | 40.2% | 39.2% |
| mage | 300 | 47.7% | 42.1%-53.3% | 57.3% | 51.7% | 28.2% |
| mechanical_dragon | 199 | 59.3% | 52.4%-65.9% | 67.3% | 40.3% | 46.7% |
| mimic | 300 | 53.0% | 47.3%-58.6% | 58.7% | 45.6% | 44.6% |
| necromancer | 99 | 44.4% | 35.0%-54.3% | 52.9% | 54.9% | 33.0% |
| pea_shooter | 300 | 51.0% | 45.4%-56.6% | 59.8% | 48.3% | 31.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 46.5% | 37.1%-56.2% | 63.1% | 51.7% | 28.6% |
| archer\|TH6 | 100 | 51.0% | 41.3%-60.6% | 55.7% | 49.0% | 24.7% |
| archer\|TH7 | 99 | 56.6% | 46.7%-65.9% | 61.3% | 43.2% | 32.7% |
| demon_king\|TH5 | 101 | 66.3% | 56.7%-74.8% | 73.3% | 30.9% | 52.8% |
| demon_king\|TH6 | 100 | 65.0% | 55.3%-73.6% | 70.4% | 32.7% | 55.1% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 63.3% | 40.4% | 50.3% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.5% | 39.8% | 49.3% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 65.1% | 39.0% | 52.0% |
| fire_dragon\|TH7 | 99 | 61.6% | 51.8%-70.6% | 68.1% | 38.3% | 54.3% |
| knight\|TH5 | 101 | 56.4% | 46.7%-65.7% | 65.3% | 40.3% | 37.3% |
| knight\|TH6 | 100 | 58.0% | 48.2%-67.2% | 65.4% | 39.6% | 40.5% |
| knight\|TH7 | 99 | 58.6% | 48.7%-67.8% | 61.9% | 40.9% | 39.9% |
| mage\|TH5 | 101 | 47.5% | 38.1%-57.2% | 60.7% | 51.3% | 30.3% |
| mage\|TH6 | 100 | 45.0% | 35.6%-54.8% | 53.6% | 54.3% | 23.7% |
| mage\|TH7 | 99 | 50.5% | 40.8%-60.1% | 57.7% | 49.4% | 30.5% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 66.6% | 40.4% | 45.1% |
| mechanical_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 68.0% | 40.2% | 48.4% |
| mimic\|TH5 | 101 | 47.5% | 38.1%-57.2% | 56.5% | 50.7% | 38.5% |
| mimic\|TH6 | 100 | 62.0% | 52.2%-70.9% | 65.4% | 35.9% | 56.9% |
| mimic\|TH7 | 99 | 49.5% | 39.9%-59.2% | 54.2% | 50.1% | 38.4% |
| necromancer\|TH7 | 99 | 44.4% | 35.0%-54.3% | 52.9% | 54.9% | 33.0% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 64.7% | 47.3% | 33.7% |
| pea_shooter\|TH6 | 100 | 50.0% | 40.4%-59.6% | 56.1% | 49.6% | 27.7% |
| pea_shooter\|TH7 | 99 | 51.5% | 41.8%-61.1% | 58.8% | 48.1% | 34.5% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 59.8% | 50.0% | 26.3% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.6% | 50.0% | 32.0% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 55.9% | 40.0% | 35.9% |
| archer\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.6% | 54.2% | 23.1% |
| archer\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 62.2% | 49.7% | 28.7% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 56.4% | 53.3% | 26.2% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.9% | 38.9% | 33.1% |
| archer\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.0% | 46.7% | 26.7% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.4% | 41.0% | 32.0% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 58.2% | 40.0% | 35.0% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.7% | 28.1% |
| archer\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 61.4% | 60.3% | 21.7% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 53.2% | 60.0% | 27.4% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 61.4% | 55.6% | 21.6% |
| archer\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 52.3% | 55.6% | 23.2% |
| archer\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.0% | 42.7% | 35.2% |
| archer\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 60.4% | 44.4% | 30.6% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 63.8% | 33.3% | 31.2% |
| demon_king\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 65.3% | 43.4% | 42.0% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 69.3% | 44.1% | 46.9% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 74.1% | 20.0% | 65.2% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.4% | 51.1% | 37.0% |
| demon_king\|corner-keep | 16 | 68.8% | 44.4%-85.8% | 68.4% | 31.3% | 49.3% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 67.5% | 25.6% | 55.6% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.7% | 31.9% | 54.9% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 70.0% | 34.7% | 54.1% |
| demon_king\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 68.2% | 40.0% | 53.3% |
| demon_king\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 67.3% | 33.3% | 57.0% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 71.1% | 24.6% | 61.5% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 68.2% | 38.4% | 44.4% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 70.5% | 32.4% | 54.1% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 65.3% | 49.1% | 45.1% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 69.9% | 32.7% | 56.8% |
| demon_king\|split-core | 17 | 64.7% | 41.3%-82.7% | 69.0% | 35.3% | 57.5% |
| demon_king\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.1% | 31.6% | 58.0% |
| demon_king\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 77.3% | 18.1% | 61.7% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 63.1% | 50.0% | 45.8% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 64.2% | 49.6% | 44.4% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 72.3% | 33.3% | 63.3% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 61.0% | 50.0% | 40.3% |
| fire_dragon\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 65.6% | 37.8% | 46.9% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 69.5% | 33.3% | 51.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.7% | 33.3% | 54.2% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 70.2% | 40.0% | 56.7% |
| fire_dragon\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 65.9% | 40.0% | 53.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.3% | 40.0% | 53.3% |
| fire_dragon\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 69.1% | 37.7% | 55.0% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 64.2% | 49.6% | 45.8% |
| fire_dragon\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 66.1% | 33.3% | 53.3% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 63.4% | 50.0% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 70.1% | 33.3% | 59.7% |
| fire_dragon\|split-core | 17 | 52.9% | 31.0%-73.8% | 65.8% | 44.7% | 50.0% |
| fire_dragon\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 69.1% | 27.8% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 74.2% | 16.7% | 61.1% |
| knight\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 64.2% | 54.5% | 28.1% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.4% | 48.1% | 38.6% |
| knight\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 64.1% | 33.3% | 49.9% |
| knight\|compact-core | 18 | 50.0% | 29.0%-71.0% | 58.9% | 46.4% | 31.0% |
| knight\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 63.9% | 29.7% | 42.8% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 61.6% | 35.0% | 35.7% |
| knight\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 68.4% | 28.6% | 43.3% |
| knight\|diamond | 15 | 60.0% | 35.7%-80.2% | 63.0% | 40.1% | 35.4% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 63.6% | 37.4% | 43.0% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.5% | 39.6% | 41.3% |
| knight\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 66.1% | 46.1% | 42.1% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 64.2% | 52.2% | 30.4% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.8% | 40.0% | 39.0% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 59.8% | 51.8% | 32.0% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.4% | 33.3% | 41.6% |
| knight\|split-core | 17 | 58.8% | 36.0%-78.4% | 63.0% | 40.3% | 44.3% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 68.2% | 33.3% | 45.8% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 70.6% | 31.8% | 44.7% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 57.4% | 61.1% | 27.8% |
| mage\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 58.3% | 50.0% | 28.3% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 60.2% | 40.0% | 38.2% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 57.2% | 61.1% | 25.8% |
| mage\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 56.2% | 50.0% | 23.9% |
| mage\|crossfire | 15 | 40.0% | 19.8%-64.3% | 53.4% | 59.2% | 28.5% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 62.9% | 46.3% | 25.3% |
| mage\|diamond | 15 | 46.7% | 24.8%-69.9% | 56.8% | 52.4% | 26.7% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 55.0% | 46.4% | 30.3% |
| mage\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 55.5% | 40.0% | 34.5% |
| mage\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.5% | 46.7% | 30.3% |
| mage\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 57.4% | 61.6% | 21.7% |
| mage\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 52.5% | 60.0% | 25.5% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 55.9% | 61.1% | 22.7% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 49.4% | 66.7% | 24.2% |
| mage\|split-core | 17 | 64.7% | 41.3%-82.7% | 61.6% | 35.3% | 30.5% |
| mage\|trap-lanes | 18 | 50.0% | 29.0%-71.0% | 57.8% | 50.0% | 30.8% |
| mage\|wide-spread | 18 | 61.1% | 38.6%-79.7% | 66.9% | 38.4% | 34.8% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.2% | 50.0% | 43.2% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 63.3% | 50.0% | 43.9% |
| mechanical_dragon\|cannon-screen | 10 | 70.0% | 39.7%-89.2% | 72.3% | 30.0% | 56.4% |
| mechanical_dragon\|compact-core | 12 | 50.0% | 25.4%-74.6% | 59.2% | 50.0% | 34.8% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 65.3% | 40.0% | 42.7% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 62.3% | 40.0% | 47.3% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 71.1% | 33.3% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 69.7% | 40.0% | 51.8% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 66.0% | 37.8% | 46.4% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 67.7% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 70.0% | 39.7%-89.2% | 79.7% | 30.0% | 60.9% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 65.8% | 50.0% | 39.4% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 67.7% | 40.0% | 50.9% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 62.5% | 50.0% | 39.4% |
| mechanical_dragon\|southern-funnel | 12 | 66.7% | 39.1%-86.2% | 66.9% | 33.3% | 37.9% |
| mechanical_dragon\|split-core | 11 | 63.6% | 35.4%-84.8% | 66.3% | 36.4% | 49.6% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 67.8% | 39.3% | 44.7% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.8% | 31.0% | 56.1% |
| mimic\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 58.5% | 60.2% | 34.1% |
| mimic\|asymmetric-right | 18 | 38.9% | 20.3%-61.4% | 55.5% | 61.1% | 38.9% |
| mimic\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 61.6% | 40.0% | 54.3% |
| mimic\|compact-core | 18 | 33.3% | 16.3%-56.3% | 50.6% | 65.7% | 31.7% |
| mimic\|corner-keep | 16 | 43.8% | 23.1%-66.8% | 57.5% | 52.9% | 41.1% |
| mimic\|crossfire | 15 | 53.3% | 30.1%-75.2% | 55.2% | 44.6% | 37.1% |
| mimic\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 61.9% | 50.0% | 42.1% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 59.8% | 43.8% | 49.5% |
| mimic\|echelon-left | 15 | 73.3% | 48.0%-89.1% | 59.5% | 26.7% | 52.4% |
| mimic\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 61.4% | 32.9% | 49.5% |
| mimic\|kill-corridor | 15 | 60.0% | 35.7%-80.2% | 63.0% | 32.4% | 54.3% |
| mimic\|layered-rings | 18 | 27.8% | 12.5%-50.9% | 52.5% | 70.7% | 26.2% |
| mimic\|rear-keep | 15 | 46.7% | 24.8%-69.9% | 53.6% | 53.3% | 45.7% |
| mimic\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.4% | 55.6% | 41.3% |
| mimic\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 63.4% | 32.6% | 54.8% |
| mimic\|split-core | 17 | 64.7% | 41.3%-82.7% | 57.7% | 34.2% | 50.4% |
| mimic\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 63.8% | 33.2% | 50.0% |
| mimic\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 66.3% | 23.1% | 54.0% |
| necromancer\|asymmetric-left | 6 | 33.3% | 9.7%-70.0% | 48.9% | 66.7% | 27.8% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 45.2% | 66.7% | 27.8% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 49.5% | 66.6% | 27.8% |
| necromancer\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 59.7% | 33.3% | 38.9% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 52.7% | 62.1% | 22.2% |
| necromancer\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 47.8% | 62.1% | 22.2% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 46.2% | 83.3% | 11.1% |
| necromancer\|trap-lanes | 6 | 33.3% | 9.7%-70.0% | 56.5% | 64.4% | 33.3% |
| necromancer\|wide-spread | 6 | 50.0% | 18.8%-81.2% | 62.4% | 50.0% | 38.9% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 57.6% | 60.8% | 23.5% |
| pea_shooter\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 57.4% | 50.0% | 30.9% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 57.5% | 40.0% | 35.6% |
| pea_shooter\|compact-core | 18 | 33.3% | 16.3%-56.3% | 54.7% | 66.7% | 24.7% |
| pea_shooter\|corner-keep | 16 | 31.3% | 14.2%-55.6% | 54.9% | 61.1% | 22.2% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 53.9% | 53.3% | 29.6% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 65.7% | 48.4% | 26.5% |
| pea_shooter\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.7% | 44.6% | 31.9% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 57.3% | 46.7% | 37.8% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 61.4% | 40.0% | 37.8% |
| pea_shooter\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.5% | 35.6% |
| pea_shooter\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 58.3% | 50.0% | 26.5% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 61.1% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 54.7% | 55.6% | 23.5% |
| pea_shooter\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 60.0% | 38.5% | 38.3% |
| pea_shooter\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.6% | 47.1% | 37.3% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 65.5% | 38.9% | 39.5% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 73.1% | 33.3% | 42.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 94.1% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 93.5% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 91.3% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 91.2% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 95.6% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 93.7% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 93.3% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 91.1% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 90.6% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 2.8% | 91.5% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 2.9% | 92.0% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 99.1% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 96.5% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 96.4% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 92.3% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 58.3% attacker wins across 864 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-187 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-cannon-screen-202 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-058 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-100 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-253 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-wide-spread-235 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-143 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-053 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-176 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-295 has 0 attacker wins across 17 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-204 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-213 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-255 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-287 has 0 attacker wins across 9 controlled/policy-exploration samples.
- 186 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
