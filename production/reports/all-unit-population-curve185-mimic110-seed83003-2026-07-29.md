# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:36:03.272Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 79
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
**Elapsed:** 110.5s

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
| 5000 | 2795 | 55.9% | 0 | 25.5s | 51.6% | 40.2% | 35.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 986 | 56.2% | 0 | 23.9s | 52.0% | 41.1% |
| TH6->TH6 | 1669 | 938 | 56.2% | 0 | 26.8s | 53.3% | 40.1% |
| TH5->TH5 | 1576 | 871 | 55.3% | 0 | 25.9s | 49.2% | 39.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 182 | 44.8% | 0 | 23.8s | 46.7% | 48.4% |
| resource-shield | 381 | 185 | 48.6% | 0 | 24.3s | 47.2% | 46.7% |
| asymmetric-right | 376 | 196 | 52.1% | 0 | 24.1s | 49.2% | 44.0% |
| crossfire | 339 | 195 | 57.5% | 0 | 25.3s | 50.0% | 38.5% |
| diamond | 338 | 190 | 56.2% | 0 | 23.5s | 50.0% | 40.2% |
| kill-corridor | 336 | 197 | 58.6% | 0 | 24.6s | 48.4% | 38.2% |
| trap-lanes | 274 | 179 | 65.3% | 0 | 26.8s | 55.0% | 33.4% |
| wide-spread | 272 | 195 | 71.7% | 0 | 27.8s | 59.8% | 25.3% |
| compact-core | 250 | 112 | 44.8% | 0 | 25.4s | 48.9% | 50.0% |
| asymmetric-left | 249 | 117 | 47.0% | 0 | 26.3s | 53.0% | 48.5% |
| southern-funnel | 247 | 146 | 59.1% | 0 | 25.3s | 53.0% | 38.0% |
| defense-ring | 245 | 144 | 58.8% | 0 | 27.1s | 56.2% | 36.3% |
| split-core | 239 | 141 | 59.0% | 0 | 25.1s | 54.8% | 35.9% |
| corner-keep | 221 | 120 | 54.3% | 0 | 26.8s | 53.8% | 41.0% |
| echelon-right | 208 | 127 | 61.1% | 0 | 25.6s | 52.4% | 36.5% |
| cannon-screen | 207 | 136 | 65.7% | 0 | 27.9s | 54.0% | 32.7% |
| echelon-left | 206 | 122 | 59.2% | 0 | 28.5s | 53.7% | 36.8% |
| rear-keep | 206 | 111 | 53.9% | 0 | 25.1s | 52.3% | 43.1% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 97 | 45.8% | 0 | 21.7s | 43.5% | 49.1% |
| resource-shield\|TH7 | 185 | 102 | 55.1% | 0 | 23.2s | 46.7% | 41.1% |
| asymmetric-right\|TH7 | 184 | 101 | 54.9% | 0 | 22.2s | 45.7% | 42.0% |
| kill-corridor\|TH7 | 177 | 107 | 60.5% | 0 | 21.8s | 48.9% | 36.8% |
| crossfire\|TH7 | 176 | 101 | 57.4% | 0 | 22.3s | 48.0% | 39.3% |
| diamond\|TH7 | 175 | 102 | 58.3% | 0 | 22.3s | 50.7% | 38.8% |
| compact-core\|TH6 | 103 | 48 | 46.6% | 0 | 25.3s | 50.1% | 47.7% |
| asymmetric-left\|TH6 | 101 | 55 | 54.5% | 0 | 26.3s | 54.0% | 42.9% |
| layered-rings\|TH6 | 101 | 49 | 48.5% | 0 | 25.4s | 53.0% | 46.6% |
| resource-shield\|TH6 | 101 | 45 | 44.6% | 0 | 26.4s | 49.0% | 52.3% |
| trap-lanes\|TH6 | 101 | 60 | 59.4% | 0 | 28.2s | 53.7% | 39.0% |
| southern-funnel\|TH6 | 100 | 59 | 59.0% | 0 | 26.2s | 51.0% | 37.6% |
| split-core\|TH6 | 100 | 64 | 64.0% | 0 | 25.8s | 56.4% | 32.4% |
| wide-spread\|TH6 | 99 | 67 | 67.7% | 0 | 27.9s | 59.5% | 29.7% |
| asymmetric-right\|TH6 | 98 | 50 | 51.0% | 0 | 26.8s | 55.3% | 43.6% |
| defense-ring\|TH6 | 98 | 60 | 61.2% | 0 | 27.5s | 55.0% | 34.3% |
| resource-shield\|TH5 | 95 | 38 | 40.0% | 0 | 24.3s | 46.2% | 51.6% |
| asymmetric-left\|TH5 | 94 | 39 | 41.5% | 0 | 26.0s | 49.4% | 50.1% |
| asymmetric-right\|TH5 | 94 | 45 | 47.9% | 0 | 25.2s | 50.2% | 48.2% |
| corner-keep\|TH5 | 94 | 51 | 54.3% | 0 | 26.6s | 49.2% | 39.2% |
| split-core\|TH5 | 94 | 53 | 56.4% | 0 | 23.7s | 50.8% | 36.2% |
| compact-core\|TH5 | 93 | 45 | 48.4% | 0 | 24.8s | 45.0% | 46.0% |
| defense-ring\|TH5 | 93 | 51 | 54.8% | 0 | 26.6s | 52.7% | 37.8% |
| layered-rings\|TH5 | 93 | 36 | 38.7% | 0 | 27.0s | 47.6% | 48.8% |
| southern-funnel\|TH5 | 93 | 58 | 62.4% | 0 | 23.1s | 51.3% | 33.6% |
| trap-lanes\|TH5 | 93 | 62 | 66.7% | 0 | 25.3s | 49.3% | 31.6% |
| wide-spread\|TH5 | 93 | 68 | 73.1% | 0 | 27.9s | 57.4% | 23.0% |
| diamond\|TH6 | 85 | 46 | 54.1% | 0 | 25.7s | 51.9% | 43.0% |
| echelon-right\|TH6 | 85 | 52 | 61.2% | 0 | 24.4s | 52.7% | 36.0% |
| cannon-screen\|TH6 | 84 | 58 | 69.0% | 0 | 30.5s | 55.4% | 29.0% |
| crossfire\|TH6 | 84 | 46 | 54.8% | 0 | 29.0s | 50.5% | 39.9% |
| echelon-left\|TH6 | 83 | 47 | 56.6% | 0 | 30.2s | 54.1% | 36.1% |
| corner-keep\|TH6 | 82 | 44 | 53.7% | 0 | 26.5s | 54.5% | 41.8% |
| kill-corridor\|TH6 | 82 | 46 | 56.1% | 0 | 26.0s | 51.7% | 41.1% |
| rear-keep\|TH6 | 82 | 42 | 51.2% | 0 | 25.0s | 50.4% | 47.7% |
| trap-lanes\|TH7 | 80 | 57 | 71.3% | 0 | 26.7s | 62.5% | 28.5% |
| wide-spread\|TH7 | 80 | 60 | 75.0% | 0 | 27.5s | 62.9% | 22.5% |
| crossfire\|TH5 | 79 | 48 | 60.8% | 0 | 27.8s | 54.4% | 35.4% |
| rear-keep\|TH5 | 79 | 43 | 54.4% | 0 | 24.6s | 48.3% | 39.4% |
| cannon-screen\|TH5 | 78 | 51 | 65.4% | 0 | 26.8s | 46.2% | 32.4% |
| diamond\|TH5 | 78 | 42 | 53.8% | 0 | 23.9s | 46.4% | 40.2% |
| echelon-left\|TH5 | 78 | 49 | 62.8% | 0 | 28.1s | 49.9% | 34.7% |
| echelon-right\|TH5 | 78 | 48 | 61.5% | 0 | 25.5s | 46.6% | 35.1% |
| kill-corridor\|TH5 | 77 | 44 | 57.1% | 0 | 29.4s | 43.5% | 38.3% |
| asymmetric-left\|TH7 | 54 | 23 | 42.6% | 0 | 26.6s | 56.6% | 55.9% |
| compact-core\|TH7 | 54 | 19 | 35.2% | 0 | 26.5s | 52.8% | 61.3% |
| defense-ring\|TH7 | 54 | 33 | 61.1% | 0 | 27.1s | 63.7% | 37.5% |
| southern-funnel\|TH7 | 54 | 29 | 53.7% | 0 | 27.2s | 59.3% | 46.3% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 25.2s | 63.6% | 40.0% |
| corner-keep\|TH7 | 45 | 25 | 55.6% | 0 | 27.7s | 60.9% | 43.4% |
| echelon-left\|TH7 | 45 | 26 | 57.8% | 0 | 26.1s | 58.9% | 41.4% |
| echelon-right\|TH7 | 45 | 27 | 60.0% | 0 | 27.9s | 61.1% | 40.0% |
| rear-keep\|TH7 | 45 | 26 | 57.8% | 0 | 26.0s | 61.8% | 41.3% |
| split-core\|TH7 | 45 | 24 | 53.3% | 0 | 26.2s | 59.1% | 42.9% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 56 | 5.3% | 0 | 20.0s | 33.6% | 87.2% |
| mid | 1011 | 857 | 84.8% | 0 | 31.4s | 65.4% | 10.8% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 27.7s | 70.7% | 0.0% |
| maxed | 985 | 20 | 2.0% | 0 | 20.9s | 20.7% | 92.5% |
| mixed | 953 | 863 | 90.6% | 0 | 27.8s | 68.6% | 7.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1477 | 56.8% | 0 | 22.1s | 41.6% | 37.0% |
| pure-unit-matrix | 2398 | 1318 | 55.0% | 0 | 29.1s | 62.4% | 43.6% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 482 | 54.1% | 0 | 26.7s | 60.3% | 44.8% |
| policy-exploration\|TH5 | 869 | 487 | 56.0% | 0 | 21.8s | 36.2% | 35.5% |
| policy-exploration\|TH6 | 869 | 486 | 55.9% | 0 | 23.6s | 44.9% | 38.2% |
| policy-exploration\|TH7 | 864 | 504 | 58.3% | 0 | 21.0s | 43.4% | 37.2% |
| pure-unit-matrix\|TH6 | 800 | 452 | 56.5% | 0 | 30.3s | 62.4% | 42.2% |
| pure-unit-matrix\|TH5 | 707 | 384 | 54.3% | 0 | 30.9s | 65.3% | 43.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1705 | 994 | 58.3% | 0 | 22.1s | 42.3% | 35.2% |
| policy-exploration\|fire_dragon | 1496 | 858 | 57.4% | 0 | 20.4s | 42.5% | 37.0% |
| policy-exploration\|archer | 1416 | 817 | 57.7% | 0 | 22.1s | 41.8% | 35.8% |
| policy-exploration\|mage | 1406 | 779 | 55.4% | 0 | 20.9s | 41.1% | 39.2% |
| policy-exploration\|demon_king | 1363 | 775 | 56.9% | 0 | 21.8s | 41.9% | 36.1% |
| policy-exploration\|mimic | 1290 | 756 | 58.6% | 0 | 22.8s | 41.8% | 34.2% |
| policy-exploration\|pea_shooter | 850 | 477 | 56.1% | 0 | 21.5s | 40.8% | 38.0% |
| policy-exploration\|mechanical_dragon | 658 | 379 | 57.6% | 0 | 21.2s | 46.2% | 38.5% |
| pure-unit-matrix\|archer | 300 | 151 | 50.3% | 0 | 35.7s | 60.0% | 48.9% |
| pure-unit-matrix\|demon_king | 300 | 190 | 63.3% | 0 | 28.5s | 68.7% | 34.5% |
| pure-unit-matrix\|fire_dragon | 300 | 180 | 60.0% | 0 | 20.6s | 66.6% | 39.4% |
| pure-unit-matrix\|knight | 300 | 174 | 58.0% | 0 | 33.1s | 64.0% | 40.1% |
| pure-unit-matrix\|mage | 300 | 139 | 46.3% | 0 | 24.8s | 56.6% | 52.7% |
| pure-unit-matrix\|mimic | 300 | 173 | 57.7% | 0 | 34.4s | 62.7% | 39.2% |
| pure-unit-matrix\|pea_shooter | 300 | 151 | 50.3% | 0 | 28.2s | 59.2% | 49.1% |
| policy-exploration\|necromancer | 223 | 118 | 52.9% | 0 | 20.9s | 39.5% | 45.0% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.8s | 66.3% | 41.6% |
| pure-unit-matrix\|necromancer | 99 | 46 | 46.5% | 0 | 31.8s | 52.0% | 51.9% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 602 | 345 | 57.3% | 0 | 21.8s | 36.7% | 34.5% |
| policy-exploration\|knight\|TH6 | 568 | 330 | 58.1% | 0 | 23.1s | 45.0% | 35.5% |
| policy-exploration\|fire_dragon\|TH5 | 536 | 301 | 56.2% | 0 | 20.2s | 36.7% | 36.2% |
| policy-exploration\|knight\|TH7 | 535 | 319 | 59.6% | 0 | 21.2s | 45.3% | 35.8% |
| policy-exploration\|mage\|TH5 | 518 | 273 | 52.7% | 0 | 20.5s | 34.8% | 39.9% |
| policy-exploration\|archer\|TH5 | 513 | 292 | 56.9% | 0 | 21.6s | 35.5% | 34.0% |
| policy-exploration\|demon_king\|TH5 | 505 | 275 | 54.5% | 0 | 21.3s | 35.5% | 35.8% |
| policy-exploration\|fire_dragon\|TH6 | 498 | 287 | 57.6% | 0 | 21.5s | 45.1% | 36.4% |
| policy-exploration\|mimic\|TH5 | 493 | 274 | 55.6% | 0 | 22.4s | 35.3% | 34.8% |
| policy-exploration\|mage\|TH6 | 463 | 261 | 56.4% | 0 | 22.2s | 44.6% | 38.2% |
| policy-exploration\|fire_dragon\|TH7 | 462 | 270 | 58.4% | 0 | 19.4s | 45.9% | 38.6% |
| policy-exploration\|archer\|TH6 | 458 | 263 | 57.4% | 0 | 23.5s | 44.3% | 36.6% |
| policy-exploration\|archer\|TH7 | 445 | 262 | 58.9% | 0 | 21.1s | 45.8% | 36.9% |
| policy-exploration\|demon_king\|TH6 | 433 | 251 | 58.0% | 0 | 23.0s | 46.2% | 35.2% |
| policy-exploration\|mimic\|TH6 | 433 | 262 | 60.5% | 0 | 23.9s | 46.0% | 33.4% |
| policy-exploration\|demon_king\|TH7 | 425 | 249 | 58.6% | 0 | 20.9s | 44.8% | 37.5% |
| policy-exploration\|mage\|TH7 | 425 | 245 | 57.6% | 0 | 20.0s | 44.3% | 39.3% |
| policy-exploration\|mechanical_dragon\|TH6 | 373 | 204 | 54.7% | 0 | 22.0s | 44.7% | 39.8% |
| policy-exploration\|mimic\|TH7 | 364 | 220 | 60.4% | 0 | 22.1s | 45.2% | 34.5% |
| policy-exploration\|pea_shooter\|TH5 | 333 | 180 | 54.1% | 0 | 20.9s | 32.8% | 37.7% |
| policy-exploration\|pea_shooter\|TH6 | 306 | 167 | 54.6% | 0 | 22.6s | 44.0% | 39.4% |
| policy-exploration\|mechanical_dragon\|TH7 | 285 | 175 | 61.4% | 0 | 20.2s | 47.9% | 36.7% |
| policy-exploration\|necromancer\|TH7 | 223 | 118 | 52.9% | 0 | 20.9s | 39.5% | 45.0% |
| policy-exploration\|pea_shooter\|TH7 | 211 | 130 | 61.6% | 0 | 21.1s | 47.7% | 36.2% |
| pure-unit-matrix\|archer\|TH5 | 101 | 47 | 46.5% | 0 | 39.3s | 63.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 67 | 66.3% | 0 | 30.6s | 73.3% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.5% | 39.8% |
| pure-unit-matrix\|knight\|TH5 | 101 | 57 | 56.4% | 0 | 35.1s | 65.3% | 40.3% |
| pure-unit-matrix\|mage\|TH5 | 101 | 48 | 47.5% | 0 | 26.1s | 60.7% | 51.3% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 53 | 52.5% | 0 | 35.0s | 61.4% | 44.6% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 52 | 51.5% | 0 | 29.1s | 64.7% | 47.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.4s | 55.6% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 30.0s | 70.1% | 31.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.6s | 64.4% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 59 | 59.0% | 0 | 35.1s | 65.4% | 38.9% |
| pure-unit-matrix\|mage\|TH6 | 100 | 45 | 45.0% | 0 | 24.6s | 53.5% | 54.2% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 27.9s | 65.9% | 40.8% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 65 | 65.0% | 0 | 35.8s | 69.4% | 30.1% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 47 | 47.0% | 0 | 29.5s | 55.0% | 52.6% |
| pure-unit-matrix\|archer\|TH7 | 99 | 54 | 54.5% | 0 | 30.2s | 61.3% | 44.8% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 24.8s | 63.1% | 40.7% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 59 | 59.6% | 0 | 18.9s | 66.8% | 39.4% |
| pure-unit-matrix\|knight\|TH7 | 99 | 58 | 58.6% | 0 | 29.2s | 61.6% | 40.9% |
| pure-unit-matrix\|mage\|TH7 | 99 | 46 | 46.5% | 0 | 23.6s | 55.7% | 52.7% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 55 | 55.6% | 0 | 23.6s | 66.7% | 42.4% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 55 | 55.6% | 0 | 32.4s | 57.5% | 42.9% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 46 | 46.5% | 0 | 31.8s | 52.0% | 51.9% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 52 | 52.5% | 0 | 26.0s | 58.3% | 47.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1318 | 55.0% | 0 | 29.1s | 62.4% | 43.6% |
| policy-exploration\|cannon-focus | 479 | 284 | 59.3% | 0 | 28.3s | 65.1% | 38.9% |
| policy-exploration\|cannon-rally | 479 | 264 | 55.1% | 0 | 14.6s | 6.7% | 32.1% |
| policy-exploration\|rally-core | 454 | 245 | 54.0% | 0 | 15.2s | 5.9% | 31.0% |
| policy-exploration\|none | 444 | 249 | 56.1% | 0 | 26.5s | 64.5% | 42.9% |
| policy-exploration\|cannon-medkit | 246 | 139 | 56.5% | 0 | 26.6s | 61.1% | 42.7% |
| policy-exploration\|medkit-entry | 150 | 83 | 55.3% | 0 | 28.2s | 64.0% | 41.9% |
| policy-exploration\|freeze-rage | 105 | 69 | 65.7% | 0 | 25.1s | 70.0% | 33.8% |
| policy-exploration\|rally-rage | 105 | 64 | 61.0% | 0 | 14.1s | 8.5% | 27.6% |
| policy-exploration\|freeze-barrel | 100 | 59 | 59.0% | 0 | 25.6s | 68.3% | 39.8% |
| policy-exploration\|skeleton-barrel | 40 | 21 | 52.5% | 0 | 23.2s | 61.0% | 46.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 303 | 159 | 52.5% | 0 | 21.8s | 35.9% | 41.2% |
| policy-exploration\|wide-line | 284 | 139 | 48.9% | 0 | 22.6s | 54.5% | 46.3% |
| policy-exploration\|vanguard-wedge | 276 | 161 | 58.3% | 0 | 26.2s | 56.0% | 37.2% |
| policy-exploration\|center-column | 269 | 187 | 69.5% | 0 | 24.5s | 53.7% | 28.3% |
| policy-exploration\|right-flank | 266 | 186 | 69.9% | 0 | 23.5s | 46.3% | 25.3% |
| policy-exploration\|dual-flank | 264 | 155 | 58.7% | 0 | 25.2s | 57.3% | 37.2% |
| policy-exploration\|edge-sweep | 261 | 115 | 44.1% | 0 | 18.0s | 27.5% | 46.5% |
| pure-unit-matrix\|center-column | 240 | 128 | 53.3% | 0 | 29.8s | 60.4% | 46.0% |
| pure-unit-matrix\|diamond | 240 | 128 | 53.3% | 0 | 29.1s | 62.4% | 45.5% |
| pure-unit-matrix\|dual-flank | 240 | 130 | 54.2% | 0 | 27.6s | 63.5% | 45.3% |
| pure-unit-matrix\|inverted-wedge | 240 | 136 | 56.7% | 0 | 30.6s | 62.1% | 41.3% |
| pure-unit-matrix\|left-flank | 240 | 143 | 59.6% | 0 | 30.1s | 62.0% | 37.4% |
| pure-unit-matrix\|right-flank | 240 | 139 | 57.9% | 0 | 30.9s | 61.6% | 38.7% |
| pure-unit-matrix\|three-lane | 240 | 130 | 54.2% | 0 | 29.0s | 62.3% | 45.3% |
| pure-unit-matrix\|vanguard-wedge | 240 | 130 | 54.2% | 0 | 29.1s | 61.1% | 45.2% |
| pure-unit-matrix\|wide-line | 240 | 131 | 54.6% | 0 | 27.6s | 64.8% | 44.3% |
| pure-unit-matrix\|edge-sweep | 238 | 123 | 51.7% | 0 | 27.7s | 63.8% | 47.1% |
| policy-exploration\|left-flank | 232 | 166 | 71.6% | 0 | 18.5s | 25.5% | 20.2% |
| policy-exploration\|inverted-wedge | 224 | 124 | 55.4% | 0 | 22.4s | 30.2% | 33.4% |
| policy-exploration\|three-lane | 223 | 85 | 38.1% | 0 | 17.1s | 20.3% | 53.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 526 | 311 | 59.1% | 0 | 21.4s | 44.6% | 33.8% |
| policy-exploration\|three-waves | 526 | 293 | 55.7% | 0 | 21.8s | 39.2% | 37.8% |
| policy-exploration\|rapid | 520 | 293 | 56.3% | 0 | 22.0s | 41.7% | 36.8% |
| policy-exploration\|two-waves | 516 | 256 | 49.6% | 0 | 21.3s | 39.6% | 44.3% |
| policy-exploration\|drip | 514 | 324 | 63.0% | 0 | 24.1s | 42.8% | 32.2% |
| pure-unit-matrix\|burst | 480 | 283 | 59.0% | 0 | 29.8s | 64.1% | 39.7% |
| pure-unit-matrix\|rapid | 480 | 260 | 54.2% | 0 | 28.8s | 62.5% | 43.9% |
| pure-unit-matrix\|three-waves | 480 | 273 | 56.9% | 0 | 29.4s | 63.7% | 41.3% |
| pure-unit-matrix\|two-waves | 480 | 242 | 50.4% | 0 | 28.4s | 60.2% | 48.5% |
| pure-unit-matrix\|drip | 478 | 260 | 54.4% | 0 | 29.4s | 61.5% | 44.7% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 743 | 57.1% | 0 | 22.0s | 41.6% | 35.7% |
| policy-exploration\|tank-front-support-rear | 1301 | 734 | 56.4% | 0 | 22.2s | 41.5% | 38.2% |
| pure-unit-matrix\|roster-order | 1199 | 654 | 54.5% | 0 | 28.5s | 62.1% | 44.2% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 664 | 55.4% | 0 | 29.8s | 62.7% | 43.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 416 | 189 | 45.4% | 0 | 23.5s | 50.6% | 53.1% |
| pure-mimic | 410 | 247 | 60.2% | 0 | 32.1s | 56.0% | 35.8% |
| pure-fire_dragon | 409 | 246 | 60.1% | 0 | 20.1s | 62.4% | 38.4% |
| pure-pea_shooter | 405 | 207 | 51.1% | 0 | 27.0s | 54.1% | 47.3% |
| pure-demon_king | 404 | 245 | 60.6% | 0 | 27.1s | 61.4% | 34.0% |
| pure-archer | 393 | 199 | 50.6% | 0 | 34.3s | 54.9% | 46.7% |
| pure-knight | 388 | 231 | 59.5% | 0 | 31.3s | 58.2% | 36.8% |
| pure-mechanical_dragon | 262 | 146 | 55.7% | 0 | 24.7s | 60.8% | 42.8% |
| pure-necromancer | 131 | 60 | 45.8% | 0 | 29.9s | 46.9% | 52.5% |
| melee-pressure | 117 | 66 | 56.4% | 0 | 26.4s | 41.9% | 30.7% |
| core-fire_dragon-filled | 111 | 68 | 61.3% | 0 | 18.2s | 41.2% | 31.7% |
| balanced | 110 | 68 | 61.8% | 0 | 19.2s | 40.1% | 31.9% |
| hero-necro-dragon-mages | 110 | 65 | 59.1% | 0 | 19.2s | 44.4% | 38.5% |
| random-3 | 110 | 63 | 57.3% | 0 | 22.9s | 46.5% | 37.1% |
| random-1 | 108 | 62 | 57.4% | 0 | 20.3s | 41.4% | 37.9% |
| random-2 | 105 | 67 | 63.8% | 0 | 20.9s | 43.0% | 29.5% |
| frontline-ranged | 104 | 57 | 54.8% | 0 | 20.4s | 42.0% | 40.6% |
| random-5 | 104 | 52 | 50.0% | 0 | 20.8s | 37.7% | 44.1% |
| support-mix | 104 | 58 | 55.8% | 0 | 24.1s | 40.8% | 36.8% |
| random-4 | 97 | 50 | 51.5% | 0 | 20.9s | 37.8% | 43.0% |
| random-6 | 97 | 57 | 58.8% | 0 | 21.2s | 41.4% | 35.8% |
| core-mimic-filled | 93 | 65 | 69.9% | 0 | 29.0s | 48.7% | 21.3% |
| trap-runner-mix | 93 | 55 | 59.1% | 0 | 23.5s | 47.8% | 31.5% |
| core-mage-filled | 92 | 46 | 50.0% | 0 | 21.7s | 38.9% | 46.0% |
| ranged-pressure | 87 | 47 | 54.0% | 0 | 19.3s | 37.7% | 39.6% |
| air-pressure | 78 | 41 | 52.6% | 0 | 17.4s | 43.8% | 44.1% |
| core-mechanical_dragon-filled | 62 | 38 | 61.3% | 0 | 23.1s | 50.1% | 35.2% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__two-waves__roster-order | 57 | 31 | 54.4% | 0 | 26.5s | 48.8% | 37.3% |
| wide-line__burst__tank-front-support-rear | 57 | 33 | 57.9% | 0 | 25.2s | 58.2% | 37.8% |
| diamond__burst__roster-order | 56 | 25 | 44.6% | 0 | 20.3s | 37.5% | 51.1% |
| diamond__rapid__roster-order | 56 | 28 | 50.0% | 0 | 23.7s | 43.1% | 38.0% |
| diamond__rapid__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 25.4s | 50.0% | 46.4% |
| diamond__two-waves__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 24.4s | 44.2% | 51.8% |
| dual-flank__three-waves__roster-order | 56 | 26 | 46.4% | 0 | 25.6s | 50.9% | 46.3% |
| dual-flank__two-waves__roster-order | 56 | 33 | 58.9% | 0 | 23.9s | 61.7% | 40.0% |
| edge-sweep__drip__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 23.8s | 49.6% | 49.6% |
| edge-sweep__three-waves__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 23.9s | 47.5% | 45.4% |
| left-flank__drip__roster-order | 56 | 49 | 87.5% | 0 | 24.5s | 48.0% | 11.1% |
| right-flank__three-waves__roster-order | 56 | 38 | 67.9% | 0 | 26.4s | 54.3% | 27.1% |
| vanguard-wedge__burst__roster-order | 56 | 29 | 51.8% | 0 | 25.8s | 52.2% | 38.8% |
| vanguard-wedge__rapid__roster-order | 56 | 33 | 58.9% | 0 | 26.7s | 57.1% | 39.7% |
| wide-line__drip__tank-front-support-rear | 56 | 35 | 62.5% | 0 | 28.0s | 65.8% | 33.9% |
| center-column__burst__roster-order | 55 | 42 | 76.4% | 0 | 28.4s | 65.1% | 23.6% |
| diamond__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 27.5s | 48.7% | 36.0% |
| diamond__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 25.4s | 46.8% | 45.9% |
| dual-flank__rapid__roster-order | 55 | 31 | 56.4% | 0 | 27.3s | 63.9% | 43.0% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 34 | 61.8% | 0 | 29.3s | 62.8% | 32.6% |
| right-flank__rapid__roster-order | 55 | 35 | 63.6% | 0 | 25.1s | 53.5% | 30.8% |
| right-flank__two-waves__roster-order | 55 | 32 | 58.2% | 0 | 29.4s | 59.0% | 40.6% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 36 | 65.5% | 0 | 27.3s | 60.2% | 31.4% |
| wide-line__drip__roster-order | 55 | 34 | 61.8% | 0 | 26.6s | 67.4% | 37.9% |
| wide-line__three-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 24.6s | 54.4% | 52.2% |
| wide-line__two-waves__tank-front-support-rear | 55 | 23 | 41.8% | 0 | 25.3s | 59.8% | 57.3% |
| center-column__two-waves__roster-order | 54 | 24 | 44.4% | 0 | 23.7s | 48.3% | 52.3% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 26.4s | 54.6% | 51.6% |
| vanguard-wedge__drip__tank-front-support-rear | 54 | 30 | 55.6% | 0 | 29.0s | 63.0% | 41.4% |
| wide-line__three-waves__roster-order | 54 | 27 | 50.0% | 0 | 23.4s | 60.0% | 47.8% |
| center-column__drip__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 28.7s | 45.5% | 33.3% |
| center-column__three-waves__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 25.9s | 53.7% | 31.3% |
| diamond__drip__roster-order | 51 | 32 | 62.7% | 0 | 28.7s | 58.5% | 35.2% |
| diamond__three-waves__roster-order | 51 | 26 | 51.0% | 0 | 24.7s | 52.8% | 47.3% |
| edge-sweep__burst__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 21.0s | 36.1% | 45.6% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 23.3s | 38.7% | 47.0% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 21.3s | 45.0% | 55.8% |
| left-flank__three-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 24.7s | 44.2% | 31.5% |
| right-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 28.0s | 53.7% | 29.3% |
| right-flank__two-waves__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 25.2s | 50.4% | 34.5% |
| three-lane__three-waves__roster-order | 51 | 22 | 43.1% | 0 | 22.0s | 39.4% | 45.8% |
| three-lane__two-waves__roster-order | 51 | 15 | 29.4% | 0 | 18.8s | 31.0% | 60.6% |
| wide-line__burst__roster-order | 51 | 29 | 56.9% | 0 | 24.4s | 62.5% | 37.5% |
| wide-line__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 27.7s | 62.4% | 44.3% |
| center-column__burst__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 25.3s | 63.8% | 37.3% |
| center-column__drip__roster-order | 50 | 33 | 66.0% | 0 | 24.6s | 51.6% | 33.0% |
| center-column__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 28.4s | 59.6% | 49.0% |
| center-column__two-waves__tank-front-support-rear | 50 | 35 | 70.0% | 0 | 28.9s | 62.6% | 30.0% |
| diamond__three-waves__tank-front-support-rear | 50 | 29 | 58.0% | 0 | 23.8s | 47.0% | 41.2% |
| dual-flank__burst__roster-order | 50 | 26 | 52.0% | 0 | 26.5s | 62.7% | 46.4% |
| dual-flank__drip__roster-order | 50 | 23 | 46.0% | 0 | 25.7s | 50.7% | 53.2% |
| dual-flank__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.1s | 62.2% | 33.5% |
| dual-flank__two-waves__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.6s | 62.1% | 48.0% |
| edge-sweep__three-waves__roster-order | 50 | 22 | 44.0% | 0 | 22.9s | 43.2% | 47.5% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 24.5s | 40.0% | 33.7% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 26.5s | 46.1% | 41.6% |
| left-flank__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 24.2s | 51.5% | 30.3% |
| right-flank__burst__roster-order | 50 | 40 | 80.0% | 0 | 25.8s | 49.3% | 16.7% |
| right-flank__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.3s | 43.0% | 34.4% |
| three-lane__rapid__roster-order | 50 | 23 | 46.0% | 0 | 21.4s | 45.0% | 52.2% |
| vanguard-wedge__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 27.4s | 59.9% | 45.9% |
| center-column__rapid__roster-order | 49 | 28 | 57.1% | 0 | 25.8s | 58.8% | 41.9% |
| center-column__three-waves__roster-order | 49 | 31 | 63.3% | 0 | 30.2s | 59.5% | 34.7% |
| dual-flank__burst__tank-front-support-rear | 49 | 40 | 81.6% | 0 | 27.1s | 70.9% | 17.6% |
| dual-flank__rapid__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 28.0s | 63.2% | 32.9% |
| edge-sweep__drip__roster-order | 49 | 33 | 67.3% | 0 | 25.0s | 52.7% | 30.8% |
| inverted-wedge__burst__roster-order | 49 | 29 | 59.2% | 0 | 23.9s | 52.9% | 34.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 49 | 26 | 53.1% | 0 | 28.7s | 36.5% | 36.7% |
| left-flank__two-waves__roster-order | 49 | 31 | 63.3% | 0 | 23.9s | 40.1% | 26.3% |
| right-flank__drip__roster-order | 49 | 27 | 55.1% | 0 | 29.7s | 49.3% | 40.1% |
| vanguard-wedge__drip__roster-order | 49 | 29 | 59.2% | 0 | 30.2s | 56.6% | 38.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 49 | 24 | 49.0% | 0 | 26.5s | 57.2% | 51.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 26.3s | 54.9% | 39.4% |
| edge-sweep__burst__roster-order | 45 | 18 | 40.0% | 0 | 21.5s | 40.4% | 53.5% |
| edge-sweep__rapid__roster-order | 45 | 19 | 42.2% | 0 | 22.4s | 47.7% | 48.2% |
| edge-sweep__two-waves__roster-order | 45 | 23 | 51.1% | 0 | 21.0s | 47.3% | 44.9% |
| inverted-wedge__rapid__roster-order | 45 | 27 | 60.0% | 0 | 27.3s | 53.7% | 35.9% |
| left-flank__burst__tank-front-support-rear | 45 | 32 | 71.1% | 0 | 29.1s | 53.2% | 24.6% |
| left-flank__drip__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 26.2s | 48.3% | 44.8% |
| right-flank__burst__tank-front-support-rear | 45 | 29 | 64.4% | 0 | 25.8s | 58.4% | 31.1% |
| three-lane__burst__roster-order | 45 | 25 | 55.6% | 0 | 23.5s | 55.9% | 43.7% |
| three-lane__drip__roster-order | 45 | 21 | 46.7% | 0 | 28.5s | 38.9% | 48.0% |
| three-lane__two-waves__tank-front-support-rear | 45 | 13 | 28.9% | 0 | 23.4s | 36.3% | 67.7% |
| wide-line__rapid__roster-order | 45 | 21 | 46.7% | 0 | 21.9s | 54.0% | 52.3% |
| wide-line__two-waves__roster-order | 45 | 15 | 33.3% | 0 | 20.7s | 44.6% | 56.1% |
| inverted-wedge__drip__roster-order | 44 | 27 | 61.4% | 0 | 25.7s | 35.5% | 30.9% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 23.6s | 34.8% | 51.2% |
| left-flank__burst__roster-order | 44 | 25 | 56.8% | 0 | 21.7s | 35.4% | 34.7% |
| left-flank__rapid__roster-order | 44 | 27 | 61.4% | 0 | 21.6s | 36.5% | 32.3% |
| left-flank__rapid__tank-front-support-rear | 44 | 33 | 75.0% | 0 | 25.3s | 47.9% | 19.5% |
| left-flank__two-waves__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 22.5s | 34.1% | 38.8% |
| right-flank__drip__tank-front-support-rear | 44 | 30 | 68.2% | 0 | 30.0s | 66.0% | 31.7% |
| three-lane__burst__tank-front-support-rear | 44 | 27 | 61.4% | 0 | 29.3s | 55.6% | 36.2% |
| three-lane__drip__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 22.9s | 42.8% | 46.5% |
| three-lane__rapid__tank-front-support-rear | 44 | 24 | 54.5% | 0 | 24.0s | 45.2% | 42.6% |
| three-lane__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 20.1s | 33.9% | 45.6% |
| vanguard-wedge__three-waves__roster-order | 44 | 30 | 68.2% | 0 | 30.3s | 69.7% | 30.7% |
| dual-flank__drip__tank-front-support-rear | 39 | 18 | 46.2% | 0 | 25.8s | 53.9% | 50.8% |
| inverted-wedge__three-waves__roster-order | 39 | 26 | 66.7% | 0 | 25.8s | 44.2% | 29.4% |
| inverted-wedge__two-waves__roster-order | 39 | 18 | 46.2% | 0 | 31.2s | 59.7% | 51.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 543 | 287 | 52.9% | 0 | 25.0s | 47.6% | 43.1% |
| wide-line | 524 | 270 | 51.5% | 0 | 24.9s | 59.2% | 45.4% |
| vanguard-wedge | 516 | 291 | 56.4% | 0 | 27.5s | 58.3% | 40.9% |
| center-column | 509 | 315 | 61.9% | 0 | 27.0s | 56.9% | 36.6% |
| right-flank | 506 | 325 | 64.2% | 0 | 27.0s | 53.6% | 31.6% |
| dual-flank | 504 | 285 | 56.5% | 0 | 26.3s | 60.3% | 41.1% |
| edge-sweep | 499 | 238 | 47.7% | 0 | 22.7s | 44.9% | 46.8% |
| left-flank | 472 | 309 | 65.5% | 0 | 24.4s | 44.1% | 28.9% |
| inverted-wedge | 464 | 260 | 56.0% | 0 | 26.6s | 46.8% | 37.5% |
| three-lane | 463 | 215 | 46.4% | 0 | 23.3s | 42.2% | 49.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1006 | 594 | 59.0% | 0 | 25.4s | 53.9% | 36.6% |
| three-waves | 1006 | 566 | 56.3% | 0 | 25.4s | 50.9% | 39.4% |
| rapid | 1000 | 553 | 55.3% | 0 | 25.3s | 51.7% | 40.2% |
| two-waves | 996 | 498 | 50.0% | 0 | 24.7s | 49.5% | 46.3% |
| drip | 992 | 584 | 58.9% | 0 | 26.7s | 51.8% | 38.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1397 | 55.9% | 0 | 25.1s | 51.5% | 39.8% |
| tank-front-support-rear | 2500 | 1398 | 55.9% | 0 | 25.9s | 51.7% | 40.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2842 | 1567 | 55.1% | 0 | 28.7s | 62.7% | 43.5% |
| cannon-focus | 479 | 284 | 59.3% | 0 | 28.3s | 65.1% | 38.9% |
| cannon-rally | 479 | 264 | 55.1% | 0 | 14.6s | 6.7% | 32.1% |
| rally-core | 454 | 245 | 54.0% | 0 | 15.2s | 5.9% | 31.0% |
| cannon-medkit | 246 | 139 | 56.5% | 0 | 26.6s | 61.1% | 42.7% |
| medkit-entry | 150 | 83 | 55.3% | 0 | 28.2s | 64.0% | 41.9% |
| freeze-rage | 105 | 69 | 65.7% | 0 | 25.1s | 70.0% | 33.8% |
| rally-rage | 105 | 64 | 61.0% | 0 | 14.1s | 8.5% | 27.6% |
| freeze-barrel | 100 | 59 | 59.0% | 0 | 25.6s | 68.3% | 39.8% |
| skeleton-barrel | 40 | 21 | 52.5% | 0 | 23.2s | 61.0% | 46.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1342 | 830 | 61.8% | 0 | 22.9s | 56.2% | 34.9% |
| legendary | 725 | 400 | 55.2% | 0 | 21.6s | 44.2% | 38.5% |
| epic | 708 | 395 | 55.8% | 0 | 20.3s | 37.9% | 36.5% |
| unrevealed | 684 | 378 | 55.3% | 0 | 20.6s | 39.5% | 38.4% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 689 | 417 | 60.5% | 0 | 20.6s | 55.6% | 36.7% |
| demon_king\|common | 653 | 413 | 63.2% | 0 | 25.2s | 56.8% | 32.9% |
| fire_dragon\|legendary | 381 | 219 | 57.5% | 0 | 21.3s | 46.1% | 36.8% |
| fire_dragon\|epic | 374 | 204 | 54.5% | 0 | 19.8s | 37.8% | 38.5% |
| fire_dragon\|unrevealed | 352 | 198 | 56.3% | 0 | 19.7s | 38.5% | 38.3% |
| demon_king\|legendary | 344 | 181 | 52.6% | 0 | 22.0s | 42.0% | 40.4% |
| demon_king\|epic | 334 | 191 | 57.2% | 0 | 21.0s | 38.1% | 34.1% |
| demon_king\|unrevealed | 332 | 180 | 54.2% | 0 | 21.6s | 40.6% | 38.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1688 | 55.7% | 0 | 27.7s | 58.2% | 41.9% |
| ward-1 | 767 | 450 | 58.7% | 0 | 22.5s | 42.1% | 35.1% |
| ward-3 | 601 | 317 | 52.7% | 0 | 21.8s | 39.9% | 40.4% |
| ward-2 | 600 | 340 | 56.7% | 0 | 21.8s | 41.9% | 37.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2795 | 55.9% | 0 | 25.5s | 51.6% | 40.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2005 | 1168 | 58.3% | 0 | 23.7s | 45.6% | 35.9% |
| fire_dragon | 1796 | 1038 | 57.8% | 0 | 20.4s | 46.5% | 37.4% |
| archer | 1716 | 968 | 56.4% | 0 | 24.4s | 44.9% | 38.1% |
| mage | 1706 | 918 | 53.8% | 0 | 21.6s | 43.8% | 41.5% |
| demon_king | 1663 | 965 | 58.0% | 0 | 23.0s | 46.8% | 35.8% |
| mimic | 1590 | 929 | 58.4% | 0 | 25.0s | 45.8% | 35.2% |
| pea_shooter | 1150 | 628 | 54.6% | 0 | 23.3s | 45.6% | 40.9% |
| mechanical_dragon | 857 | 493 | 57.5% | 0 | 22.3s | 50.9% | 39.2% |
| necromancer | 322 | 164 | 50.9% | 0 | 24.3s | 43.3% | 47.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 50.3% | 44.7%-56.0% | 60.0% | 48.9% | 28.1% |
| demon_king | 300 | 63.3% | 57.7%-68.6% | 68.7% | 34.5% | 52.4% |
| fire_dragon | 300 | 60.0% | 54.4%-65.4% | 66.6% | 39.4% | 50.9% |
| knight | 300 | 58.0% | 52.3%-63.4% | 64.0% | 40.1% | 39.0% |
| mage | 300 | 46.3% | 40.8%-52.0% | 56.6% | 52.7% | 27.5% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 66.3% | 41.6% | 46.1% |
| mimic | 300 | 57.7% | 52.0%-63.1% | 62.7% | 39.2% | 50.2% |
| necromancer | 99 | 46.5% | 37.0%-56.2% | 52.0% | 51.9% | 32.7% |
| pea_shooter | 300 | 50.3% | 44.7%-56.0% | 59.2% | 49.1% | 31.4% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 46.5% | 37.1%-56.2% | 63.1% | 51.7% | 28.6% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.6% | 50.0% | 23.7% |
| archer\|TH7 | 99 | 54.5% | 44.8%-64.0% | 61.3% | 44.8% | 32.0% |
| demon_king\|TH5 | 101 | 66.3% | 56.7%-74.8% | 73.3% | 30.9% | 52.8% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 31.9% | 54.7% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 63.1% | 40.7% | 49.8% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.5% | 39.8% | 49.3% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 64.4% | 39.0% | 50.0% |
| fire_dragon\|TH7 | 99 | 59.6% | 49.7%-68.7% | 66.8% | 39.4% | 53.5% |
| knight\|TH5 | 101 | 56.4% | 46.7%-65.7% | 65.3% | 40.3% | 37.3% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.4% | 38.9% | 40.2% |
| knight\|TH7 | 99 | 58.6% | 48.7%-67.8% | 61.6% | 40.9% | 39.5% |
| mage\|TH5 | 101 | 47.5% | 38.1%-57.2% | 60.7% | 51.3% | 30.3% |
| mage\|TH6 | 100 | 45.0% | 35.6%-54.8% | 53.5% | 54.2% | 23.5% |
| mage\|TH7 | 99 | 46.5% | 37.0%-56.2% | 55.7% | 52.7% | 28.8% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.9% | 40.8% | 45.5% |
| mechanical_dragon\|TH7 | 99 | 55.6% | 45.7%-65.0% | 66.7% | 42.4% | 46.7% |
| mimic\|TH5 | 101 | 52.5% | 42.8%-61.9% | 61.4% | 44.6% | 46.3% |
| mimic\|TH6 | 100 | 65.0% | 55.3%-73.6% | 69.4% | 30.1% | 59.0% |
| mimic\|TH7 | 99 | 55.6% | 45.7%-65.0% | 57.5% | 42.9% | 45.5% |
| necromancer\|TH7 | 99 | 46.5% | 37.0%-56.2% | 52.0% | 51.9% | 32.7% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 64.7% | 47.3% | 33.7% |
| pea_shooter\|TH6 | 100 | 47.0% | 37.5%-56.7% | 55.0% | 52.6% | 27.4% |
| pea_shooter\|TH7 | 99 | 52.5% | 42.8%-62.1% | 58.3% | 47.4% | 33.0% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.2% | 50.0% | 27.0% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.8% | 50.0% | 31.9% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 58.0% | 40.0% | 37.8% |
| archer\|compact-core | 18 | 44.4% | 24.6%-66.3% | 61.2% | 53.9% | 23.5% |
| archer\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 61.5% | 49.7% | 28.2% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 56.6% | 53.3% | 25.9% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.6% | 38.9% | 30.2% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 59.8% | 53.3% | 26.2% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.2% | 41.0% | 32.0% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 57.0% | 40.0% | 33.2% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.7% | 27.9% |
| archer\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 61.2% | 64.3% | 19.5% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 53.2% | 60.0% | 28.0% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 60.6% | 55.6% | 20.2% |
| archer\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 52.7% | 55.6% | 23.2% |
| archer\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.4% | 42.7% | 34.9% |
| archer\|trap-lanes | 18 | 50.0% | 29.0%-71.0% | 59.5% | 49.8% | 29.5% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.8% | 33.3% | 29.1% |
| demon_king\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 65.2% | 43.4% | 42.0% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 68.9% | 44.2% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 72.5% | 20.0% | 63.0% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.2% | 51.7% | 36.4% |
| demon_king\|corner-keep | 16 | 68.8% | 44.4%-85.8% | 68.4% | 31.3% | 49.3% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 67.3% | 25.8% | 54.8% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.2% | 32.3% | 54.9% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 70.2% | 34.4% | 53.3% |
| demon_king\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 67.7% | 40.0% | 52.6% |
| demon_king\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 66.8% | 33.3% | 57.0% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 71.4% | 24.6% | 61.5% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 67.8% | 38.6% | 43.8% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 70.5% | 32.4% | 54.1% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 66.1% | 49.3% | 45.1% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 69.5% | 32.9% | 56.8% |
| demon_king\|split-core | 17 | 64.7% | 41.3%-82.7% | 68.6% | 35.3% | 57.5% |
| demon_king\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 67.0% | 26.0% | 58.6% |
| demon_king\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 77.1% | 19.8% | 61.7% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 63.3% | 50.0% | 45.8% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.8% | 49.6% | 44.4% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 71.1% | 33.3% | 63.3% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 60.6% | 50.0% | 38.9% |
| fire_dragon\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 64.7% | 37.8% | 45.3% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.9% | 33.3% | 51.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.3% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.3% | 40.0% | 56.7% |
| fire_dragon\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 65.5% | 40.0% | 53.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.0% | 53.3% |
| fire_dragon\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 67.5% | 40.7% | 50.0% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 63.8% | 50.0% | 45.8% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 65.0% | 37.2% | 51.7% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 62.3% | 50.0% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 69.7% | 33.3% | 59.7% |
| fire_dragon\|split-core | 17 | 52.9% | 31.0%-73.8% | 64.8% | 44.7% | 45.6% |
| fire_dragon\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 68.8% | 27.8% | 58.3% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 73.1% | 16.7% | 61.1% |
| knight\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 64.8% | 54.5% | 28.6% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 67.2% | 48.1% | 38.1% |
| knight\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 65.0% | 33.3% | 49.8% |
| knight\|compact-core | 18 | 55.6% | 33.7%-75.4% | 61.0% | 44.4% | 31.0% |
| knight\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 63.5% | 29.8% | 41.7% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 60.7% | 34.7% | 35.7% |
| knight\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 66.9% | 27.7% | 42.8% |
| knight\|diamond | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.1% | 36.0% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 65.2% | 37.6% | 43.0% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.5% | 39.6% | 41.3% |
| knight\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 65.7% | 46.6% | 41.6% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 63.3% | 52.2% | 30.4% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.1% | 40.0% | 38.2% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.1% | 51.8% | 30.0% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 64.2% | 33.3% | 42.1% |
| knight\|split-core | 17 | 58.8% | 36.0%-78.4% | 63.2% | 40.3% | 43.8% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 67.4% | 33.3% | 46.2% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.9% | 31.0% | 43.8% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 56.8% | 61.1% | 27.8% |
| mage\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 58.5% | 50.0% | 28.3% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 60.2% | 40.0% | 38.8% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 56.1% | 61.1% | 24.2% |
| mage\|corner-keep | 16 | 43.8% | 23.1%-66.8% | 55.8% | 53.2% | 23.3% |
| mage\|crossfire | 15 | 40.0% | 19.8%-64.3% | 52.0% | 60.0% | 29.1% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.4% | 46.3% | 24.7% |
| mage\|diamond | 15 | 40.0% | 19.8%-64.3% | 55.7% | 56.4% | 25.5% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.9% | 46.7% | 30.9% |
| mage\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 55.9% | 40.0% | 33.3% |
| mage\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 54.1% | 46.7% | 28.5% |
| mage\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 58.1% | 56.3% | 23.2% |
| mage\|rear-keep | 15 | 33.3% | 15.2%-58.3% | 50.9% | 66.7% | 24.8% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 54.2% | 61.1% | 19.7% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 47.9% | 66.7% | 24.2% |
| mage\|split-core | 17 | 64.7% | 41.3%-82.7% | 63.0% | 35.3% | 31.6% |
| mage\|trap-lanes | 18 | 44.4% | 24.6%-66.3% | 55.1% | 55.6% | 29.8% |
| mage\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 64.6% | 43.3% | 30.8% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.4% | 50.0% | 42.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 63.6% | 50.0% | 41.7% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 69.7% | 40.0% | 52.7% |
| mechanical_dragon\|compact-core | 12 | 41.7% | 19.3%-68.0% | 57.2% | 50.9% | 32.6% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 65.0% | 40.0% | 43.6% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 63.0% | 40.0% | 48.2% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.6% | 33.3% | 49.2% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 69.3% | 40.0% | 50.9% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 65.0% | 37.7% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 70.0% | 39.7%-89.2% | 77.7% | 30.0% | 60.9% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 65.0% | 50.0% | 38.6% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 67.3% | 40.0% | 51.8% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 62.2% | 50.0% | 37.9% |
| mechanical_dragon\|southern-funnel | 12 | 58.3% | 32.0%-80.7% | 62.8% | 41.7% | 36.4% |
| mechanical_dragon\|split-core | 11 | 54.5% | 28.0%-78.7% | 63.8% | 37.2% | 45.5% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 66.1% | 40.0% | 47.0% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.8% | 33.3% | 56.1% |
| mimic\|asymmetric-left | 18 | 44.4% | 24.6%-66.3% | 62.9% | 47.2% | 38.9% |
| mimic\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.3% | 47.6% | 41.3% |
| mimic\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 65.5% | 33.3% | 60.0% |
| mimic\|compact-core | 18 | 44.4% | 24.6%-66.3% | 54.7% | 53.7% | 38.1% |
| mimic\|corner-keep | 16 | 56.3% | 33.2%-76.9% | 63.2% | 43.8% | 48.2% |
| mimic\|crossfire | 15 | 53.3% | 30.1%-75.2% | 61.8% | 42.6% | 48.6% |
| mimic\|defense-ring | 18 | 55.6% | 33.7%-75.4% | 64.6% | 36.1% | 46.0% |
| mimic\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.3% | 42.0% | 48.6% |
| mimic\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 61.1% | 29.0% | 53.3% |
| mimic\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 64.5% | 28.2% | 61.9% |
| mimic\|kill-corridor | 15 | 66.7% | 41.7%-84.8% | 65.5% | 33.3% | 58.1% |
| mimic\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 60.2% | 55.6% | 34.1% |
| mimic\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 58.6% | 46.7% | 48.6% |
| mimic\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 58.1% | 50.0% | 46.8% |
| mimic\|southern-funnel | 18 | 72.2% | 49.1%-87.5% | 66.9% | 26.1% | 61.1% |
| mimic\|split-core | 17 | 64.7% | 41.3%-82.7% | 60.4% | 33.2% | 53.8% |
| mimic\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 66.3% | 31.2% | 57.9% |
| mimic\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 69.5% | 23.0% | 63.5% |
| necromancer\|asymmetric-left | 6 | 33.3% | 9.7%-70.0% | 48.4% | 66.7% | 33.3% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 43.0% | 66.7% | 27.8% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 48.4% | 66.7% | 27.8% |
| necromancer\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 56.5% | 33.3% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 52.7% | 53.4% | 22.2% |
| necromancer\|resource-shield | 6 | 50.0% | 18.8%-81.2% | 47.8% | 50.0% | 33.3% |
| necromancer\|southern-funnel | 6 | 33.3% | 9.7%-70.0% | 46.2% | 66.7% | 16.7% |
| necromancer\|trap-lanes | 6 | 33.3% | 9.7%-70.0% | 55.4% | 66.6% | 33.3% |
| necromancer\|wide-spread | 6 | 50.0% | 18.8%-81.2% | 61.3% | 50.0% | 38.9% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 55.9% | 61.1% | 23.5% |
| pea_shooter\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 57.4% | 50.0% | 30.9% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 57.0% | 40.0% | 35.6% |
| pea_shooter\|compact-core | 18 | 33.3% | 16.3%-56.3% | 54.9% | 66.3% | 24.1% |
| pea_shooter\|corner-keep | 16 | 37.5% | 18.5%-61.4% | 54.3% | 56.6% | 22.2% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 53.6% | 53.3% | 28.9% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 65.3% | 48.4% | 27.2% |
| pea_shooter\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.7% | 44.8% | 31.9% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 57.0% | 46.7% | 37.8% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 61.1% | 40.0% | 37.0% |
| pea_shooter\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 52.7% | 53.2% | 34.1% |
| pea_shooter\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 58.3% | 54.7% | 26.5% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 60.2% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 53.2% | 61.1% | 22.2% |
| pea_shooter\|southern-funnel | 18 | 61.1% | 38.6%-79.7% | 59.7% | 38.9% | 37.7% |
| pea_shooter\|split-core | 17 | 52.9% | 31.0%-73.8% | 64.2% | 47.1% | 37.9% |
| pea_shooter\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 64.2% | 38.9% | 36.4% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 72.5% | 33.3% | 39.5% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 94.4% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 93.8% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 92.3% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 91.7% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 96.0% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 93.8% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 93.5% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 0.0% | 92.4% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 92.0% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 90.7% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 2.8% | 91.3% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 96.6% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 96.2% |
| th6-diamond-143 | 6 | diamond | rushed-defense | 18 | 0.0% | 93.0% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 93.0% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 58.3% attacker wins across 864 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-cannon-screen-202 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-109 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-193 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-058 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-220 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-169 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-253 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-226 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-059 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-143 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-101 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-209 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-053 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 17 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-042 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-cannon-screen-204 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-087 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-060 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-144 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-102 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-210 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-105 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-213 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-kill-corridor-054 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-279 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-093 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-255 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 35 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-126 has 0 attacker wins across 36 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-287 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-069 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-177 has 0 attacker wins across 9 controlled/policy-exploration samples.
- 183 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
