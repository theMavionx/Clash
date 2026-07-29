# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:47:09.184Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 59
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.9206349206x
**Lab late-tier troop scales:** mimic=1.2444444444x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 5000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 95.3s

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
| 5000 | 2829 | 56.6% | 0 | 25.6s | 51.9% | 39.6% | 35.6% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 956 | 54.5% | 0 | 24.1s | 51.1% | 42.8% |
| TH6->TH6 | 1669 | 963 | 57.7% | 0 | 26.7s | 54.0% | 38.7% |
| TH5->TH5 | 1576 | 910 | 57.7% | 0 | 26.0s | 50.4% | 37.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 183 | 45.1% | 0 | 23.9s | 46.7% | 47.8% |
| resource-shield | 381 | 178 | 46.7% | 0 | 24.3s | 46.9% | 47.3% |
| asymmetric-right | 376 | 197 | 52.4% | 0 | 24.3s | 49.7% | 43.8% |
| crossfire | 339 | 195 | 57.5% | 0 | 25.1s | 50.0% | 38.4% |
| diamond | 338 | 192 | 56.8% | 0 | 23.8s | 50.2% | 39.9% |
| kill-corridor | 336 | 200 | 59.5% | 0 | 25.4s | 48.5% | 37.3% |
| trap-lanes | 274 | 179 | 65.3% | 0 | 27.1s | 55.3% | 33.1% |
| wide-spread | 272 | 199 | 73.2% | 0 | 27.9s | 60.5% | 24.3% |
| compact-core | 250 | 117 | 46.8% | 0 | 25.3s | 49.4% | 48.8% |
| asymmetric-left | 249 | 123 | 49.4% | 0 | 26.5s | 53.7% | 46.5% |
| southern-funnel | 247 | 143 | 57.9% | 0 | 24.9s | 52.9% | 38.9% |
| defense-ring | 245 | 147 | 60.0% | 0 | 27.4s | 57.2% | 35.9% |
| split-core | 239 | 145 | 60.7% | 0 | 24.8s | 54.7% | 35.3% |
| corner-keep | 221 | 121 | 54.8% | 0 | 26.6s | 54.3% | 41.0% |
| echelon-right | 208 | 129 | 62.0% | 0 | 25.4s | 52.4% | 36.2% |
| cannon-screen | 207 | 141 | 68.1% | 0 | 27.6s | 55.0% | 30.5% |
| echelon-left | 206 | 126 | 61.2% | 0 | 28.8s | 53.8% | 35.5% |
| rear-keep | 206 | 114 | 55.3% | 0 | 25.2s | 52.9% | 42.4% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 93 | 43.9% | 0 | 21.8s | 42.8% | 50.6% |
| resource-shield\|TH7 | 185 | 94 | 50.8% | 0 | 23.4s | 45.5% | 43.3% |
| asymmetric-right\|TH7 | 184 | 100 | 54.3% | 0 | 22.3s | 45.2% | 43.2% |
| kill-corridor\|TH7 | 177 | 107 | 60.5% | 0 | 22.3s | 47.8% | 37.6% |
| crossfire\|TH7 | 176 | 96 | 54.5% | 0 | 22.4s | 47.3% | 41.3% |
| diamond\|TH7 | 175 | 101 | 57.7% | 0 | 22.3s | 49.9% | 40.1% |
| compact-core\|TH6 | 103 | 51 | 49.5% | 0 | 25.2s | 51.2% | 45.7% |
| asymmetric-left\|TH6 | 101 | 57 | 56.4% | 0 | 26.1s | 54.4% | 41.2% |
| layered-rings\|TH6 | 101 | 51 | 50.5% | 0 | 25.5s | 53.8% | 43.0% |
| resource-shield\|TH6 | 101 | 46 | 45.5% | 0 | 26.4s | 49.6% | 51.0% |
| trap-lanes\|TH6 | 101 | 60 | 59.4% | 0 | 28.0s | 54.4% | 38.4% |
| southern-funnel\|TH6 | 100 | 59 | 59.0% | 0 | 26.2s | 51.5% | 37.0% |
| split-core\|TH6 | 100 | 65 | 65.0% | 0 | 25.7s | 56.4% | 31.4% |
| wide-spread\|TH6 | 99 | 67 | 67.7% | 0 | 27.8s | 60.4% | 29.6% |
| asymmetric-right\|TH6 | 98 | 51 | 52.0% | 0 | 26.0s | 56.3% | 42.5% |
| defense-ring\|TH6 | 98 | 61 | 62.2% | 0 | 27.8s | 55.6% | 33.1% |
| resource-shield\|TH5 | 95 | 38 | 40.0% | 0 | 24.0s | 46.8% | 51.0% |
| asymmetric-left\|TH5 | 94 | 42 | 44.7% | 0 | 26.1s | 50.7% | 47.3% |
| asymmetric-right\|TH5 | 94 | 46 | 48.9% | 0 | 26.3s | 52.2% | 46.2% |
| corner-keep\|TH5 | 94 | 55 | 58.5% | 0 | 26.1s | 51.3% | 36.4% |
| split-core\|TH5 | 94 | 56 | 59.6% | 0 | 23.6s | 51.7% | 34.0% |
| compact-core\|TH5 | 93 | 49 | 52.7% | 0 | 24.8s | 46.1% | 43.2% |
| defense-ring\|TH5 | 93 | 54 | 58.1% | 0 | 26.6s | 54.6% | 37.0% |
| layered-rings\|TH5 | 93 | 39 | 41.9% | 0 | 26.8s | 48.5% | 46.5% |
| southern-funnel\|TH5 | 93 | 59 | 63.4% | 0 | 23.0s | 52.0% | 32.5% |
| trap-lanes\|TH5 | 93 | 63 | 67.7% | 0 | 25.1s | 49.7% | 30.8% |
| wide-spread\|TH5 | 93 | 71 | 76.3% | 0 | 27.9s | 58.6% | 20.7% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 26.3s | 53.1% | 41.9% |
| echelon-right\|TH6 | 85 | 54 | 63.5% | 0 | 24.0s | 53.1% | 35.5% |
| cannon-screen\|TH6 | 84 | 60 | 71.4% | 0 | 29.2s | 57.1% | 26.5% |
| crossfire\|TH6 | 84 | 50 | 59.5% | 0 | 28.5s | 51.6% | 37.1% |
| echelon-left\|TH6 | 83 | 49 | 59.0% | 0 | 29.6s | 54.3% | 35.5% |
| corner-keep\|TH6 | 82 | 44 | 53.7% | 0 | 26.3s | 54.7% | 41.5% |
| kill-corridor\|TH6 | 82 | 48 | 58.5% | 0 | 26.6s | 52.8% | 38.0% |
| rear-keep\|TH6 | 82 | 43 | 52.4% | 0 | 25.2s | 51.6% | 46.3% |
| trap-lanes\|TH7 | 80 | 56 | 70.0% | 0 | 28.2s | 62.1% | 29.2% |
| wide-spread\|TH7 | 80 | 61 | 76.3% | 0 | 28.0s | 62.5% | 22.1% |
| crossfire\|TH5 | 79 | 49 | 62.0% | 0 | 27.5s | 55.2% | 33.5% |
| rear-keep\|TH5 | 79 | 46 | 58.2% | 0 | 24.8s | 49.5% | 37.3% |
| cannon-screen\|TH5 | 78 | 54 | 69.2% | 0 | 27.0s | 47.4% | 29.4% |
| diamond\|TH5 | 78 | 44 | 56.4% | 0 | 24.5s | 47.8% | 37.1% |
| echelon-left\|TH5 | 78 | 51 | 65.4% | 0 | 29.0s | 50.7% | 31.8% |
| echelon-right\|TH5 | 78 | 49 | 62.8% | 0 | 25.7s | 47.7% | 33.5% |
| kill-corridor\|TH5 | 77 | 45 | 58.4% | 0 | 31.3s | 45.7% | 35.9% |
| asymmetric-left\|TH7 | 54 | 24 | 44.4% | 0 | 27.6s | 57.2% | 54.9% |
| compact-core\|TH7 | 54 | 17 | 31.5% | 0 | 26.5s | 51.1% | 64.1% |
| defense-ring\|TH7 | 54 | 32 | 59.3% | 0 | 27.9s | 63.9% | 39.0% |
| southern-funnel\|TH7 | 54 | 25 | 46.3% | 0 | 25.6s | 56.8% | 53.6% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 25.8s | 63.4% | 40.0% |
| corner-keep\|TH7 | 45 | 22 | 48.9% | 0 | 28.2s | 59.1% | 49.6% |
| echelon-left\|TH7 | 45 | 26 | 57.8% | 0 | 26.8s | 57.8% | 41.8% |
| echelon-right\|TH7 | 45 | 26 | 57.8% | 0 | 27.3s | 58.7% | 42.2% |
| rear-keep\|TH7 | 45 | 25 | 55.6% | 0 | 26.0s | 60.4% | 44.4% |
| split-core\|TH7 | 45 | 24 | 53.3% | 0 | 25.3s | 56.6% | 46.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 91 | 8.7% | 0 | 20.2s | 34.5% | 84.4% |
| mid | 1011 | 853 | 84.4% | 0 | 31.6s | 65.3% | 11.2% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 27.6s | 70.8% | 0.0% |
| maxed | 985 | 33 | 3.4% | 0 | 21.2s | 21.1% | 91.5% |
| mixed | 953 | 853 | 89.5% | 0 | 27.5s | 68.6% | 8.3% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1492 | 57.3% | 0 | 22.2s | 41.8% | 36.5% |
| pure-unit-matrix | 2398 | 1337 | 55.8% | 0 | 29.3s | 62.7% | 43.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 466 | 52.3% | 0 | 26.9s | 59.3% | 46.8% |
| policy-exploration\|TH5 | 869 | 507 | 58.3% | 0 | 21.7s | 37.1% | 33.9% |
| policy-exploration\|TH6 | 869 | 495 | 57.0% | 0 | 23.5s | 45.5% | 37.0% |
| policy-exploration\|TH7 | 864 | 490 | 56.7% | 0 | 21.2s | 42.6% | 38.7% |
| pure-unit-matrix\|TH6 | 800 | 468 | 58.5% | 0 | 30.1s | 63.3% | 40.6% |
| pure-unit-matrix\|TH5 | 707 | 403 | 57.0% | 0 | 31.3s | 66.8% | 41.1% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1705 | 1001 | 58.7% | 0 | 22.1s | 42.6% | 34.7% |
| policy-exploration\|fire_dragon | 1496 | 859 | 57.4% | 0 | 20.5s | 42.6% | 36.7% |
| policy-exploration\|archer | 1416 | 824 | 58.2% | 0 | 22.1s | 42.0% | 35.3% |
| policy-exploration\|mage | 1406 | 778 | 55.3% | 0 | 21.0s | 41.2% | 38.9% |
| policy-exploration\|demon_king | 1363 | 778 | 57.1% | 0 | 21.9s | 42.2% | 35.7% |
| policy-exploration\|mimic | 1290 | 780 | 60.5% | 0 | 22.7s | 42.7% | 32.7% |
| policy-exploration\|pea_shooter | 850 | 477 | 56.1% | 0 | 21.6s | 40.9% | 37.6% |
| policy-exploration\|mechanical_dragon | 658 | 374 | 56.8% | 0 | 21.4s | 46.0% | 38.5% |
| pure-unit-matrix\|archer | 300 | 152 | 50.7% | 0 | 36.5s | 59.6% | 48.7% |
| pure-unit-matrix\|demon_king | 300 | 190 | 63.3% | 0 | 28.5s | 68.2% | 34.9% |
| pure-unit-matrix\|fire_dragon | 300 | 178 | 59.3% | 0 | 20.5s | 66.1% | 40.2% |
| pure-unit-matrix\|knight | 300 | 170 | 56.7% | 0 | 33.4s | 63.1% | 40.8% |
| pure-unit-matrix\|mage | 300 | 135 | 45.0% | 0 | 24.6s | 56.0% | 54.1% |
| pure-unit-matrix\|mimic | 300 | 209 | 69.7% | 0 | 34.3s | 69.6% | 28.5% |
| pure-unit-matrix\|pea_shooter | 300 | 145 | 48.3% | 0 | 28.2s | 58.4% | 50.8% |
| policy-exploration\|necromancer | 223 | 115 | 51.6% | 0 | 21.0s | 38.5% | 46.5% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.8s | 65.5% | 42.0% |
| pure-unit-matrix\|necromancer | 99 | 44 | 44.4% | 0 | 32.8s | 51.5% | 55.2% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 602 | 360 | 59.8% | 0 | 21.8s | 37.6% | 32.5% |
| policy-exploration\|knight\|TH6 | 568 | 333 | 58.6% | 0 | 23.0s | 45.7% | 34.4% |
| policy-exploration\|fire_dragon\|TH5 | 536 | 307 | 57.3% | 0 | 20.2s | 37.3% | 35.1% |
| policy-exploration\|knight\|TH7 | 535 | 308 | 57.6% | 0 | 21.5s | 44.6% | 37.4% |
| policy-exploration\|mage\|TH5 | 518 | 279 | 53.9% | 0 | 20.5s | 35.4% | 38.8% |
| policy-exploration\|archer\|TH5 | 513 | 304 | 59.3% | 0 | 21.6s | 36.4% | 32.3% |
| policy-exploration\|demon_king\|TH5 | 505 | 284 | 56.2% | 0 | 21.5s | 36.4% | 34.1% |
| policy-exploration\|fire_dragon\|TH6 | 498 | 288 | 57.8% | 0 | 21.6s | 45.6% | 35.7% |
| policy-exploration\|mimic\|TH5 | 493 | 294 | 59.6% | 0 | 22.3s | 36.9% | 32.1% |
| policy-exploration\|mage\|TH6 | 463 | 262 | 56.6% | 0 | 22.4s | 45.2% | 37.4% |
| policy-exploration\|fire_dragon\|TH7 | 462 | 264 | 57.1% | 0 | 19.6s | 45.2% | 39.7% |
| policy-exploration\|archer\|TH6 | 458 | 266 | 58.1% | 0 | 23.4s | 45.0% | 35.5% |
| policy-exploration\|archer\|TH7 | 445 | 254 | 57.1% | 0 | 21.4s | 45.0% | 38.6% |
| policy-exploration\|demon_king\|TH6 | 433 | 252 | 58.2% | 0 | 23.1s | 46.9% | 34.2% |
| policy-exploration\|mimic\|TH6 | 433 | 271 | 62.6% | 0 | 23.7s | 47.3% | 30.8% |
| policy-exploration\|demon_king\|TH7 | 425 | 242 | 56.9% | 0 | 21.1s | 43.9% | 39.1% |
| policy-exploration\|mage\|TH7 | 425 | 237 | 55.8% | 0 | 20.2s | 43.5% | 40.6% |
| policy-exploration\|mechanical_dragon\|TH6 | 373 | 205 | 55.0% | 0 | 22.0s | 45.0% | 39.0% |
| policy-exploration\|mimic\|TH7 | 364 | 215 | 59.1% | 0 | 22.2s | 44.7% | 35.7% |
| policy-exploration\|pea_shooter\|TH5 | 333 | 185 | 55.6% | 0 | 20.9s | 33.4% | 36.6% |
| policy-exploration\|pea_shooter\|TH6 | 306 | 168 | 54.9% | 0 | 22.7s | 44.4% | 38.5% |
| policy-exploration\|mechanical_dragon\|TH7 | 285 | 169 | 59.3% | 0 | 20.5s | 47.2% | 37.8% |
| policy-exploration\|necromancer\|TH7 | 223 | 115 | 51.6% | 0 | 21.0s | 38.5% | 46.5% |
| policy-exploration\|pea_shooter\|TH7 | 211 | 124 | 58.8% | 0 | 21.2s | 46.9% | 37.9% |
| pure-unit-matrix\|archer\|TH5 | 101 | 47 | 46.5% | 0 | 39.3s | 63.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 67 | 66.3% | 0 | 30.6s | 73.3% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.5% | 39.8% |
| pure-unit-matrix\|knight\|TH5 | 101 | 57 | 56.4% | 0 | 35.1s | 65.3% | 40.3% |
| pure-unit-matrix\|mage\|TH5 | 101 | 48 | 47.5% | 0 | 26.1s | 60.7% | 51.3% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 72 | 71.3% | 0 | 37.8s | 72.3% | 26.1% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 52 | 51.5% | 0 | 29.1s | 64.7% | 47.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.4s | 55.6% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 30.0s | 70.1% | 31.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.6s | 64.4% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 59 | 59.0% | 0 | 35.1s | 65.4% | 38.9% |
| pure-unit-matrix\|mage\|TH6 | 100 | 45 | 45.0% | 0 | 24.6s | 53.5% | 54.2% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 27.9s | 65.9% | 40.8% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 81 | 81.0% | 0 | 34.2s | 76.5% | 17.5% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 47 | 47.0% | 0 | 29.5s | 55.0% | 52.6% |
| pure-unit-matrix\|archer\|TH7 | 99 | 55 | 55.6% | 0 | 32.7s | 60.3% | 44.4% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 24.9s | 61.7% | 41.9% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 57 | 57.6% | 0 | 18.6s | 65.6% | 41.7% |
| pure-unit-matrix\|knight\|TH7 | 99 | 54 | 54.5% | 0 | 29.9s | 59.0% | 43.2% |
| pure-unit-matrix\|mage\|TH7 | 99 | 42 | 42.4% | 0 | 23.0s | 54.0% | 56.9% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 55 | 55.6% | 0 | 23.7s | 65.2% | 43.2% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 56 | 56.6% | 0 | 30.8s | 60.5% | 42.1% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 44 | 44.4% | 0 | 32.8s | 51.5% | 55.2% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 46 | 46.5% | 0 | 25.9s | 55.8% | 52.5% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1337 | 55.8% | 0 | 29.3s | 62.7% | 43.0% |
| policy-exploration\|cannon-focus | 479 | 288 | 60.1% | 0 | 28.5s | 65.8% | 38.3% |
| policy-exploration\|cannon-rally | 479 | 266 | 55.5% | 0 | 14.6s | 6.7% | 31.9% |
| policy-exploration\|rally-core | 454 | 254 | 55.9% | 0 | 15.0s | 6.0% | 30.1% |
| policy-exploration\|none | 444 | 251 | 56.5% | 0 | 26.4s | 65.2% | 42.1% |
| policy-exploration\|cannon-medkit | 246 | 139 | 56.5% | 0 | 26.9s | 61.3% | 42.0% |
| policy-exploration\|medkit-entry | 150 | 88 | 58.7% | 0 | 27.5s | 64.9% | 40.1% |
| policy-exploration\|freeze-rage | 105 | 68 | 64.8% | 0 | 25.4s | 68.5% | 34.3% |
| policy-exploration\|rally-rage | 105 | 59 | 56.2% | 0 | 14.2s | 8.2% | 30.1% |
| policy-exploration\|freeze-barrel | 100 | 57 | 57.0% | 0 | 25.9s | 67.0% | 41.6% |
| policy-exploration\|skeleton-barrel | 40 | 22 | 55.0% | 0 | 23.6s | 61.1% | 43.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 303 | 163 | 53.8% | 0 | 21.8s | 35.9% | 41.4% |
| policy-exploration\|wide-line | 284 | 138 | 48.6% | 0 | 22.9s | 55.2% | 46.0% |
| policy-exploration\|vanguard-wedge | 276 | 165 | 59.8% | 0 | 26.5s | 56.1% | 36.9% |
| policy-exploration\|center-column | 269 | 188 | 69.9% | 0 | 24.5s | 53.9% | 27.6% |
| policy-exploration\|right-flank | 266 | 184 | 69.2% | 0 | 23.4s | 46.0% | 25.9% |
| policy-exploration\|dual-flank | 264 | 158 | 59.8% | 0 | 24.8s | 58.0% | 36.1% |
| policy-exploration\|edge-sweep | 261 | 119 | 45.6% | 0 | 18.5s | 27.9% | 45.6% |
| pure-unit-matrix\|center-column | 240 | 132 | 55.0% | 0 | 30.4s | 60.9% | 44.6% |
| pure-unit-matrix\|diamond | 240 | 127 | 52.9% | 0 | 29.0s | 62.3% | 46.0% |
| pure-unit-matrix\|dual-flank | 240 | 131 | 54.6% | 0 | 27.7s | 63.7% | 44.6% |
| pure-unit-matrix\|inverted-wedge | 240 | 139 | 57.9% | 0 | 30.4s | 62.1% | 41.1% |
| pure-unit-matrix\|left-flank | 240 | 145 | 60.4% | 0 | 30.1s | 62.2% | 37.5% |
| pure-unit-matrix\|right-flank | 240 | 142 | 59.2% | 0 | 30.8s | 61.9% | 38.4% |
| pure-unit-matrix\|three-lane | 240 | 130 | 54.2% | 0 | 29.2s | 62.5% | 45.3% |
| pure-unit-matrix\|vanguard-wedge | 240 | 130 | 54.2% | 0 | 29.2s | 61.7% | 44.9% |
| pure-unit-matrix\|wide-line | 240 | 133 | 55.4% | 0 | 27.9s | 65.3% | 42.9% |
| pure-unit-matrix\|edge-sweep | 238 | 128 | 53.8% | 0 | 27.9s | 64.7% | 45.2% |
| policy-exploration\|left-flank | 232 | 164 | 70.7% | 0 | 18.6s | 25.6% | 20.1% |
| policy-exploration\|inverted-wedge | 224 | 130 | 58.0% | 0 | 22.2s | 30.9% | 31.6% |
| policy-exploration\|three-lane | 223 | 83 | 37.2% | 0 | 17.0s | 20.2% | 52.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 526 | 313 | 59.5% | 0 | 21.7s | 45.2% | 33.4% |
| policy-exploration\|three-waves | 526 | 301 | 57.2% | 0 | 21.9s | 39.5% | 36.5% |
| policy-exploration\|rapid | 520 | 291 | 56.0% | 0 | 21.8s | 41.7% | 37.1% |
| policy-exploration\|two-waves | 516 | 257 | 49.8% | 0 | 21.2s | 39.3% | 44.5% |
| policy-exploration\|drip | 514 | 330 | 64.2% | 0 | 24.3s | 43.3% | 31.2% |
| pure-unit-matrix\|burst | 480 | 288 | 60.0% | 0 | 29.9s | 64.2% | 39.0% |
| pure-unit-matrix\|rapid | 480 | 265 | 55.2% | 0 | 28.7s | 62.8% | 43.1% |
| pure-unit-matrix\|three-waves | 480 | 276 | 57.5% | 0 | 29.5s | 63.8% | 40.9% |
| pure-unit-matrix\|two-waves | 480 | 246 | 51.2% | 0 | 28.6s | 60.9% | 47.8% |
| pure-unit-matrix\|drip | 478 | 262 | 54.8% | 0 | 29.7s | 61.9% | 44.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 750 | 57.6% | 0 | 22.1s | 41.9% | 35.6% |
| policy-exploration\|tank-front-support-rear | 1301 | 742 | 57.0% | 0 | 22.3s | 41.7% | 37.4% |
| pure-unit-matrix\|roster-order | 1199 | 660 | 55.0% | 0 | 28.7s | 62.3% | 43.7% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 677 | 56.5% | 0 | 29.8s | 63.1% | 42.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 416 | 184 | 44.2% | 0 | 23.4s | 50.1% | 54.3% |
| pure-mimic | 410 | 295 | 72.0% | 0 | 31.8s | 62.0% | 25.9% |
| pure-fire_dragon | 409 | 244 | 59.7% | 0 | 20.0s | 62.0% | 39.1% |
| pure-pea_shooter | 405 | 199 | 49.1% | 0 | 26.9s | 53.3% | 48.9% |
| pure-demon_king | 404 | 245 | 60.6% | 0 | 27.0s | 60.8% | 34.5% |
| pure-archer | 393 | 199 | 50.6% | 0 | 35.2s | 54.6% | 47.0% |
| pure-knight | 388 | 225 | 58.0% | 0 | 31.6s | 57.3% | 37.6% |
| pure-mechanical_dragon | 262 | 146 | 55.7% | 0 | 24.7s | 60.0% | 43.2% |
| pure-necromancer | 131 | 59 | 45.0% | 0 | 30.8s | 46.5% | 54.7% |
| melee-pressure | 117 | 69 | 59.0% | 0 | 26.6s | 43.9% | 28.1% |
| core-fire_dragon-filled | 111 | 68 | 61.3% | 0 | 18.3s | 40.9% | 32.3% |
| balanced | 110 | 68 | 61.8% | 0 | 19.0s | 40.1% | 31.7% |
| hero-necro-dragon-mages | 110 | 65 | 59.1% | 0 | 19.3s | 44.3% | 38.6% |
| random-3 | 110 | 66 | 60.0% | 0 | 23.7s | 46.9% | 34.7% |
| random-1 | 108 | 62 | 57.4% | 0 | 20.4s | 41.4% | 37.3% |
| random-2 | 105 | 66 | 62.9% | 0 | 21.1s | 42.9% | 30.7% |
| frontline-ranged | 104 | 57 | 54.8% | 0 | 20.4s | 42.3% | 40.0% |
| random-5 | 104 | 53 | 51.0% | 0 | 21.3s | 37.9% | 42.2% |
| support-mix | 104 | 55 | 52.9% | 0 | 23.9s | 40.8% | 39.1% |
| random-4 | 97 | 49 | 50.5% | 0 | 20.2s | 36.9% | 43.6% |
| random-6 | 97 | 58 | 59.8% | 0 | 21.0s | 42.1% | 35.6% |
| core-mimic-filled | 93 | 74 | 79.6% | 0 | 27.4s | 51.4% | 15.8% |
| trap-runner-mix | 93 | 55 | 59.1% | 0 | 24.3s | 49.3% | 29.6% |
| core-mage-filled | 92 | 45 | 48.9% | 0 | 21.7s | 38.6% | 47.4% |
| ranged-pressure | 87 | 46 | 52.9% | 0 | 19.4s | 37.4% | 39.9% |
| air-pressure | 78 | 41 | 52.6% | 0 | 17.3s | 43.3% | 44.3% |
| core-mechanical_dragon-filled | 62 | 36 | 58.1% | 0 | 23.6s | 49.8% | 36.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__two-waves__roster-order | 57 | 35 | 61.4% | 0 | 26.3s | 48.8% | 35.9% |
| wide-line__burst__tank-front-support-rear | 57 | 33 | 57.9% | 0 | 25.1s | 58.2% | 37.7% |
| diamond__burst__roster-order | 56 | 25 | 44.6% | 0 | 20.3s | 37.0% | 52.0% |
| diamond__rapid__roster-order | 56 | 29 | 51.8% | 0 | 22.6s | 42.6% | 38.7% |
| diamond__rapid__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 25.7s | 50.0% | 46.8% |
| diamond__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 25.8s | 45.3% | 53.4% |
| dual-flank__three-waves__roster-order | 56 | 30 | 53.6% | 0 | 26.6s | 52.6% | 40.7% |
| dual-flank__two-waves__roster-order | 56 | 32 | 57.1% | 0 | 23.5s | 60.9% | 40.0% |
| edge-sweep__drip__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 24.4s | 50.5% | 48.3% |
| edge-sweep__three-waves__tank-front-support-rear | 56 | 29 | 51.8% | 0 | 23.7s | 47.7% | 45.8% |
| left-flank__drip__roster-order | 56 | 47 | 83.9% | 0 | 24.6s | 47.8% | 12.8% |
| right-flank__three-waves__roster-order | 56 | 39 | 69.6% | 0 | 27.6s | 54.7% | 26.0% |
| vanguard-wedge__burst__roster-order | 56 | 29 | 51.8% | 0 | 27.2s | 52.6% | 38.9% |
| vanguard-wedge__rapid__roster-order | 56 | 33 | 58.9% | 0 | 26.6s | 58.6% | 39.6% |
| wide-line__drip__tank-front-support-rear | 56 | 36 | 64.3% | 0 | 28.3s | 65.8% | 31.2% |
| center-column__burst__roster-order | 55 | 41 | 74.5% | 0 | 30.2s | 65.7% | 24.3% |
| diamond__burst__tank-front-support-rear | 55 | 32 | 58.2% | 0 | 27.6s | 49.3% | 35.5% |
| diamond__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 25.7s | 46.9% | 46.6% |
| dual-flank__rapid__roster-order | 55 | 31 | 56.4% | 0 | 26.2s | 64.2% | 43.5% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 40 | 72.7% | 0 | 29.2s | 64.1% | 25.1% |
| right-flank__rapid__roster-order | 55 | 35 | 63.6% | 0 | 24.7s | 53.2% | 32.4% |
| right-flank__two-waves__roster-order | 55 | 31 | 56.4% | 0 | 28.9s | 57.6% | 41.6% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 27.1s | 60.1% | 31.8% |
| wide-line__drip__roster-order | 55 | 34 | 61.8% | 0 | 27.6s | 69.8% | 36.6% |
| wide-line__three-waves__tank-front-support-rear | 55 | 26 | 47.3% | 0 | 24.5s | 54.1% | 52.0% |
| wide-line__two-waves__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 25.9s | 61.7% | 52.8% |
| center-column__two-waves__roster-order | 54 | 25 | 46.3% | 0 | 24.3s | 47.9% | 50.6% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 26.3s | 54.9% | 52.0% |
| vanguard-wedge__drip__tank-front-support-rear | 54 | 33 | 61.1% | 0 | 29.3s | 63.8% | 37.4% |
| wide-line__three-waves__roster-order | 54 | 25 | 46.3% | 0 | 23.7s | 59.8% | 49.8% |
| center-column__drip__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 29.3s | 46.9% | 31.1% |
| center-column__three-waves__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 25.8s | 53.7% | 31.2% |
| diamond__drip__roster-order | 51 | 31 | 60.8% | 0 | 28.0s | 58.4% | 38.2% |
| diamond__three-waves__roster-order | 51 | 26 | 51.0% | 0 | 24.7s | 52.0% | 46.9% |
| edge-sweep__burst__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 20.6s | 35.9% | 45.1% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 22.7s | 38.4% | 45.2% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 21.8s | 45.5% | 54.0% |
| left-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 24.2s | 44.3% | 31.6% |
| right-flank__three-waves__tank-front-support-rear | 51 | 32 | 62.7% | 0 | 27.2s | 54.4% | 29.4% |
| right-flank__two-waves__tank-front-support-rear | 51 | 30 | 58.8% | 0 | 24.6s | 49.7% | 37.0% |
| three-lane__three-waves__roster-order | 51 | 22 | 43.1% | 0 | 22.1s | 39.0% | 43.7% |
| three-lane__two-waves__roster-order | 51 | 13 | 25.5% | 0 | 18.8s | 30.9% | 63.0% |
| wide-line__burst__roster-order | 51 | 28 | 54.9% | 0 | 24.3s | 62.7% | 39.2% |
| wide-line__rapid__tank-front-support-rear | 51 | 27 | 52.9% | 0 | 28.0s | 63.2% | 43.8% |
| center-column__burst__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.9s | 63.4% | 38.1% |
| center-column__drip__roster-order | 50 | 34 | 68.0% | 0 | 24.4s | 52.1% | 31.5% |
| center-column__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 28.6s | 60.0% | 48.9% |
| center-column__two-waves__tank-front-support-rear | 50 | 36 | 72.0% | 0 | 27.1s | 63.0% | 28.0% |
| diamond__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 23.3s | 46.4% | 39.8% |
| dual-flank__burst__roster-order | 50 | 26 | 52.0% | 0 | 25.7s | 63.6% | 46.4% |
| dual-flank__drip__roster-order | 50 | 23 | 46.0% | 0 | 25.8s | 51.1% | 53.0% |
| dual-flank__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.2s | 62.0% | 31.9% |
| dual-flank__two-waves__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.8s | 62.6% | 48.0% |
| edge-sweep__three-waves__roster-order | 50 | 27 | 54.0% | 0 | 23.1s | 45.0% | 42.9% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 24.6s | 40.2% | 32.8% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 25.8s | 45.6% | 42.2% |
| left-flank__three-waves__roster-order | 50 | 32 | 64.0% | 0 | 24.7s | 52.1% | 29.7% |
| right-flank__burst__roster-order | 50 | 41 | 82.0% | 0 | 25.4s | 49.3% | 16.4% |
| right-flank__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.3s | 43.7% | 35.3% |
| three-lane__rapid__roster-order | 50 | 23 | 46.0% | 0 | 22.0s | 44.4% | 50.7% |
| vanguard-wedge__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 28.0s | 60.1% | 45.6% |
| center-column__rapid__roster-order | 49 | 30 | 61.2% | 0 | 27.0s | 58.9% | 38.4% |
| center-column__three-waves__roster-order | 49 | 31 | 63.3% | 0 | 30.3s | 60.4% | 34.4% |
| dual-flank__burst__tank-front-support-rear | 49 | 40 | 81.6% | 0 | 27.1s | 71.4% | 17.7% |
| dual-flank__rapid__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 27.2s | 63.5% | 32.9% |
| edge-sweep__drip__roster-order | 49 | 33 | 67.3% | 0 | 26.1s | 53.7% | 30.6% |
| inverted-wedge__burst__roster-order | 49 | 30 | 61.2% | 0 | 24.1s | 53.6% | 32.3% |
| inverted-wedge__three-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 30.3s | 37.4% | 34.0% |
| left-flank__two-waves__roster-order | 49 | 31 | 63.3% | 0 | 23.4s | 41.1% | 27.0% |
| right-flank__drip__roster-order | 49 | 27 | 55.1% | 0 | 29.6s | 50.1% | 40.3% |
| vanguard-wedge__drip__roster-order | 49 | 28 | 57.1% | 0 | 31.0s | 56.9% | 41.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 49 | 24 | 49.0% | 0 | 26.5s | 57.1% | 51.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 26.1s | 54.9% | 39.1% |
| edge-sweep__burst__roster-order | 45 | 19 | 42.2% | 0 | 22.6s | 41.1% | 51.3% |
| edge-sweep__rapid__roster-order | 45 | 20 | 44.4% | 0 | 22.2s | 48.8% | 45.6% |
| edge-sweep__two-waves__roster-order | 45 | 23 | 51.1% | 0 | 22.2s | 48.0% | 44.8% |
| inverted-wedge__rapid__roster-order | 45 | 28 | 62.2% | 0 | 26.3s | 54.4% | 35.7% |
| left-flank__burst__tank-front-support-rear | 45 | 32 | 71.1% | 0 | 30.0s | 53.5% | 23.6% |
| left-flank__drip__tank-front-support-rear | 45 | 25 | 55.6% | 0 | 26.6s | 48.6% | 43.4% |
| right-flank__burst__tank-front-support-rear | 45 | 30 | 66.7% | 0 | 26.1s | 58.1% | 30.4% |
| three-lane__burst__roster-order | 45 | 25 | 55.6% | 0 | 23.6s | 56.5% | 43.2% |
| three-lane__drip__roster-order | 45 | 22 | 48.9% | 0 | 28.1s | 39.8% | 45.2% |
| three-lane__two-waves__tank-front-support-rear | 45 | 13 | 28.9% | 0 | 23.2s | 36.3% | 68.7% |
| wide-line__rapid__roster-order | 45 | 22 | 48.9% | 0 | 22.4s | 54.4% | 51.1% |
| wide-line__two-waves__roster-order | 45 | 15 | 33.3% | 0 | 21.1s | 45.3% | 55.3% |
| inverted-wedge__drip__roster-order | 44 | 27 | 61.4% | 0 | 24.9s | 34.4% | 32.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 20 | 45.5% | 0 | 23.5s | 35.8% | 51.3% |
| left-flank__burst__roster-order | 44 | 25 | 56.8% | 0 | 21.7s | 35.3% | 34.8% |
| left-flank__rapid__roster-order | 44 | 26 | 59.1% | 0 | 21.5s | 36.0% | 33.2% |
| left-flank__rapid__tank-front-support-rear | 44 | 32 | 72.7% | 0 | 25.2s | 47.8% | 19.6% |
| left-flank__two-waves__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 22.4s | 34.6% | 37.7% |
| right-flank__drip__tank-front-support-rear | 44 | 31 | 70.5% | 0 | 30.3s | 66.1% | 28.6% |
| three-lane__burst__tank-front-support-rear | 44 | 27 | 61.4% | 0 | 28.8s | 56.2% | 35.8% |
| three-lane__drip__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 22.9s | 41.8% | 46.1% |
| three-lane__rapid__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 23.8s | 45.1% | 42.5% |
| three-lane__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 20.7s | 34.1% | 46.3% |
| vanguard-wedge__three-waves__roster-order | 44 | 31 | 70.5% | 0 | 30.4s | 69.5% | 29.5% |
| dual-flank__drip__tank-front-support-rear | 39 | 19 | 48.7% | 0 | 26.3s | 54.7% | 48.3% |
| inverted-wedge__three-waves__roster-order | 39 | 25 | 64.1% | 0 | 23.8s | 43.5% | 31.8% |
| inverted-wedge__two-waves__roster-order | 39 | 18 | 46.2% | 0 | 31.3s | 59.6% | 51.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 543 | 290 | 53.4% | 0 | 25.0s | 47.6% | 43.4% |
| wide-line | 524 | 271 | 51.7% | 0 | 25.2s | 59.8% | 44.6% |
| vanguard-wedge | 516 | 295 | 57.2% | 0 | 27.8s | 58.7% | 40.7% |
| center-column | 509 | 320 | 62.9% | 0 | 27.3s | 57.2% | 35.6% |
| right-flank | 506 | 326 | 64.4% | 0 | 26.9s | 53.5% | 31.8% |
| dual-flank | 504 | 289 | 57.3% | 0 | 26.2s | 60.7% | 40.2% |
| edge-sweep | 499 | 247 | 49.5% | 0 | 23.0s | 45.5% | 45.4% |
| left-flank | 472 | 309 | 65.5% | 0 | 24.4s | 44.3% | 28.9% |
| inverted-wedge | 464 | 269 | 58.0% | 0 | 26.4s | 47.1% | 36.5% |
| three-lane | 463 | 213 | 46.0% | 0 | 23.3s | 42.2% | 48.7% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1006 | 601 | 59.7% | 0 | 25.6s | 54.2% | 36.1% |
| three-waves | 1006 | 577 | 57.4% | 0 | 25.5s | 51.1% | 38.6% |
| rapid | 1000 | 556 | 55.6% | 0 | 25.1s | 51.9% | 40.0% |
| two-waves | 996 | 503 | 50.5% | 0 | 24.8s | 49.8% | 46.1% |
| drip | 992 | 592 | 59.7% | 0 | 26.9s | 52.3% | 37.5% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1410 | 56.4% | 0 | 25.2s | 51.7% | 39.5% |
| tank-front-support-rear | 2500 | 1419 | 56.8% | 0 | 25.9s | 52.0% | 39.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2842 | 1588 | 55.9% | 0 | 28.8s | 63.1% | 42.9% |
| cannon-focus | 479 | 288 | 60.1% | 0 | 28.5s | 65.8% | 38.3% |
| cannon-rally | 479 | 266 | 55.5% | 0 | 14.6s | 6.7% | 31.9% |
| rally-core | 454 | 254 | 55.9% | 0 | 15.0s | 6.0% | 30.1% |
| cannon-medkit | 246 | 139 | 56.5% | 0 | 26.9s | 61.3% | 42.0% |
| medkit-entry | 150 | 88 | 58.7% | 0 | 27.5s | 64.9% | 40.1% |
| freeze-rage | 105 | 68 | 64.8% | 0 | 25.4s | 68.5% | 34.3% |
| rally-rage | 105 | 59 | 56.2% | 0 | 14.2s | 8.2% | 30.1% |
| freeze-barrel | 100 | 57 | 57.0% | 0 | 25.9s | 67.0% | 41.6% |
| skeleton-barrel | 40 | 22 | 55.0% | 0 | 23.6s | 61.1% | 43.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1342 | 830 | 61.8% | 0 | 22.9s | 56.1% | 34.8% |
| legendary | 725 | 401 | 55.3% | 0 | 21.5s | 44.2% | 38.3% |
| epic | 708 | 393 | 55.5% | 0 | 20.6s | 38.1% | 36.3% |
| unrevealed | 684 | 381 | 55.7% | 0 | 20.8s | 39.7% | 37.8% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 689 | 417 | 60.5% | 0 | 20.7s | 55.6% | 36.7% |
| demon_king\|common | 653 | 413 | 63.2% | 0 | 25.2s | 56.7% | 32.9% |
| fire_dragon\|legendary | 381 | 218 | 57.2% | 0 | 21.2s | 46.1% | 36.7% |
| fire_dragon\|epic | 374 | 203 | 54.3% | 0 | 20.0s | 37.9% | 38.5% |
| fire_dragon\|unrevealed | 352 | 199 | 56.5% | 0 | 19.8s | 38.5% | 37.7% |
| demon_king\|legendary | 344 | 183 | 53.2% | 0 | 21.8s | 42.1% | 40.0% |
| demon_king\|epic | 334 | 190 | 56.9% | 0 | 21.2s | 38.4% | 33.9% |
| demon_king\|unrevealed | 332 | 182 | 54.8% | 0 | 21.9s | 40.9% | 37.8% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1711 | 56.4% | 0 | 27.8s | 58.5% | 41.4% |
| ward-1 | 767 | 454 | 59.2% | 0 | 22.5s | 42.1% | 34.7% |
| ward-3 | 601 | 324 | 53.9% | 0 | 21.9s | 40.4% | 39.5% |
| ward-2 | 600 | 340 | 56.7% | 0 | 21.9s | 42.1% | 37.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2829 | 56.6% | 0 | 25.6s | 51.9% | 39.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2005 | 1171 | 58.4% | 0 | 23.8s | 45.7% | 35.6% |
| fire_dragon | 1796 | 1037 | 57.7% | 0 | 20.5s | 46.6% | 37.3% |
| archer | 1716 | 976 | 56.9% | 0 | 24.6s | 45.1% | 37.7% |
| mage | 1706 | 913 | 53.5% | 0 | 21.7s | 43.8% | 41.6% |
| demon_king | 1663 | 968 | 58.2% | 0 | 23.1s | 46.9% | 35.5% |
| mimic | 1590 | 989 | 62.2% | 0 | 24.9s | 47.8% | 31.9% |
| pea_shooter | 1150 | 622 | 54.1% | 0 | 23.3s | 45.5% | 41.0% |
| mechanical_dragon | 857 | 488 | 56.9% | 0 | 22.4s | 50.5% | 39.3% |
| necromancer | 322 | 159 | 49.4% | 0 | 24.7s | 42.5% | 49.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 50.7% | 45.0%-56.3% | 59.6% | 48.7% | 27.5% |
| demon_king | 300 | 63.3% | 57.7%-68.6% | 68.2% | 34.9% | 51.8% |
| fire_dragon | 300 | 59.3% | 53.7%-64.7% | 66.1% | 40.2% | 50.2% |
| knight | 300 | 56.7% | 51.0%-62.2% | 63.1% | 40.8% | 37.8% |
| mage | 300 | 45.0% | 39.5%-50.7% | 56.0% | 54.1% | 26.9% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 65.5% | 42.0% | 45.4% |
| mimic | 300 | 69.7% | 64.2%-74.6% | 69.6% | 28.5% | 59.4% |
| necromancer | 99 | 44.4% | 35.0%-54.3% | 51.5% | 55.2% | 32.7% |
| pea_shooter | 300 | 48.3% | 42.7%-54.0% | 58.4% | 50.8% | 30.7% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 46.5% | 37.1%-56.2% | 63.1% | 51.7% | 28.6% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.6% | 50.0% | 23.7% |
| archer\|TH7 | 99 | 55.6% | 45.7%-65.0% | 60.3% | 44.4% | 30.2% |
| demon_king\|TH5 | 101 | 66.3% | 56.7%-74.8% | 73.3% | 30.9% | 52.8% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 31.9% | 54.7% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 61.7% | 41.9% | 47.8% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.5% | 39.8% | 49.3% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 64.4% | 39.0% | 50.0% |
| fire_dragon\|TH7 | 99 | 57.6% | 47.7%-66.8% | 65.6% | 41.7% | 51.5% |
| knight\|TH5 | 101 | 56.4% | 46.7%-65.7% | 65.3% | 40.3% | 37.3% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.4% | 38.9% | 40.2% |
| knight\|TH7 | 99 | 54.5% | 44.8%-64.0% | 59.0% | 43.2% | 35.8% |
| mage\|TH5 | 101 | 47.5% | 38.1%-57.2% | 60.7% | 51.3% | 30.3% |
| mage\|TH6 | 100 | 45.0% | 35.6%-54.8% | 53.5% | 54.2% | 23.5% |
| mage\|TH7 | 99 | 42.4% | 33.2%-52.3% | 54.0% | 56.9% | 26.8% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.9% | 40.8% | 45.5% |
| mechanical_dragon\|TH7 | 99 | 55.6% | 45.7%-65.0% | 65.2% | 43.2% | 45.4% |
| mimic\|TH5 | 101 | 71.3% | 61.8%-79.2% | 72.3% | 26.1% | 55.9% |
| mimic\|TH6 | 100 | 81.0% | 72.2%-87.5% | 76.5% | 17.5% | 72.1% |
| mimic\|TH7 | 99 | 56.6% | 46.7%-65.9% | 60.5% | 42.1% | 50.1% |
| necromancer\|TH7 | 99 | 44.4% | 35.0%-54.3% | 51.5% | 55.2% | 32.7% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 64.7% | 47.3% | 33.7% |
| pea_shooter\|TH6 | 100 | 47.0% | 37.5%-56.7% | 55.0% | 52.6% | 27.4% |
| pea_shooter\|TH7 | 99 | 46.5% | 37.0%-56.2% | 55.8% | 52.5% | 30.9% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.1% | 50.0% | 25.8% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 31.4% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 58.4% | 40.0% | 37.6% |
| archer\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.0% | 55.4% | 22.8% |
| archer\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 60.7% | 49.7% | 25.6% |
| archer\|crossfire | 15 | 46.7% | 24.8%-69.9% | 55.7% | 53.3% | 25.0% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.8% | 38.9% | 29.8% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 59.8% | 53.3% | 25.6% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.4% | 41.0% | 31.0% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 57.5% | 40.0% | 34.1% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.7% | 46.7% | 27.1% |
| archer\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 61.2% | 60.3% | 20.0% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 53.4% | 60.0% | 26.4% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 60.2% | 55.6% | 19.6% |
| archer\|southern-funnel | 18 | 38.9% | 20.3%-61.4% | 50.8% | 61.1% | 23.0% |
| archer\|split-core | 17 | 52.9% | 31.0%-73.8% | 62.6% | 42.7% | 34.6% |
| archer\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.3% | 44.4% | 29.3% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 63.4% | 33.3% | 28.8% |
| demon_king\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 64.8% | 43.7% | 40.7% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 68.0% | 44.2% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 71.6% | 20.0% | 62.2% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 58.9% | 54.1% | 36.4% |
| demon_king\|corner-keep | 16 | 68.8% | 44.4%-85.8% | 66.2% | 31.3% | 46.5% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 68.2% | 25.8% | 55.6% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 71.0% | 32.3% | 53.7% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.8% | 34.4% | 51.9% |
| demon_king\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 68.9% | 40.0% | 53.3% |
| demon_king\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 66.1% | 33.3% | 57.0% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 69.5% | 24.6% | 60.7% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 67.6% | 38.6% | 42.6% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 68.9% | 32.4% | 52.6% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 65.7% | 49.3% | 43.8% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 70.1% | 32.9% | 57.4% |
| demon_king\|split-core | 17 | 64.7% | 41.3%-82.7% | 67.6% | 35.3% | 57.5% |
| demon_king\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 67.8% | 26.0% | 56.8% |
| demon_king\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 77.3% | 23.5% | 61.7% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 45.8% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.6% | 49.6% | 44.4% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 70.2% | 33.3% | 63.3% |
| fire_dragon\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.5% | 53.7% | 36.1% |
| fire_dragon\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 64.1% | 37.8% | 45.3% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.2% | 33.3% | 51.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.2% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.1% | 40.0% | 56.7% |
| fire_dragon\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 64.8% | 40.0% | 53.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 63.9% | 40.0% | 53.3% |
| fire_dragon\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 67.3% | 43.1% | 46.7% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 63.4% | 50.0% | 45.8% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.0% | 48.3% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 62.5% | 50.0% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 68.9% | 33.3% | 58.3% |
| fire_dragon\|split-core | 17 | 52.9% | 31.0%-73.8% | 64.2% | 44.7% | 45.6% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 68.9% | 32.2% | 56.9% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 73.1% | 16.7% | 61.1% |
| knight\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 63.4% | 58.2% | 28.0% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.1% | 48.1% | 37.9% |
| knight\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 65.7% | 33.3% | 49.6% |
| knight\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.3% | 45.7% | 28.3% |
| knight\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 62.4% | 29.8% | 41.1% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 61.8% | 35.1% | 34.4% |
| knight\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 68.2% | 27.7% | 41.9% |
| knight\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.0% | 42.2% | 33.8% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 62.0% | 38.7% | 41.6% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.1% | 39.6% | 40.6% |
| knight\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 63.6% | 46.6% | 41.0% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.3% | 52.2% | 28.5% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.4% | 40.0% | 37.9% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 57.2% | 51.8% | 29.8% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 62.7% | 33.3% | 39.8% |
| knight\|split-core | 17 | 58.8% | 36.0%-78.4% | 62.8% | 40.3% | 42.6% |
| knight\|trap-lanes | 18 | 61.1% | 38.6%-79.7% | 66.1% | 37.7% | 43.2% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 69.1% | 31.0% | 43.0% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 56.1% | 61.1% | 27.3% |
| mage\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 58.7% | 50.0% | 28.3% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 38.2% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 55.7% | 61.1% | 22.2% |
| mage\|corner-keep | 16 | 37.5% | 18.5%-61.4% | 55.1% | 59.3% | 22.7% |
| mage\|crossfire | 15 | 40.0% | 19.8%-64.3% | 51.8% | 60.0% | 28.5% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.3% | 46.3% | 24.7% |
| mage\|diamond | 15 | 40.0% | 19.8%-64.3% | 55.0% | 56.9% | 24.8% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 28.5% |
| mage\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 54.5% | 40.0% | 32.7% |
| mage\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 53.6% | 53.3% | 27.9% |
| mage\|layered-rings | 18 | 33.3% | 16.3%-56.3% | 57.2% | 61.6% | 21.7% |
| mage\|rear-keep | 15 | 33.3% | 15.2%-58.3% | 50.5% | 66.7% | 24.8% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 53.4% | 61.1% | 18.2% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 47.3% | 66.7% | 24.2% |
| mage\|split-core | 17 | 58.8% | 36.0%-78.4% | 61.0% | 41.2% | 30.5% |
| mage\|trap-lanes | 18 | 44.4% | 24.6%-66.3% | 54.4% | 55.6% | 29.8% |
| mage\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 65.2% | 44.0% | 31.3% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.4% | 50.0% | 42.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 62.8% | 50.0% | 41.7% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 69.7% | 40.0% | 51.8% |
| mechanical_dragon\|compact-core | 12 | 41.7% | 19.3%-68.0% | 56.9% | 50.8% | 32.6% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 65.0% | 39.8% | 43.6% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 63.7% | 40.0% | 47.3% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.6% | 32.8% | 49.2% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 68.0% | 40.0% | 50.0% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 64.3% | 37.7% | 46.4% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 64.3% | 40.0% | 52.7% |
| mechanical_dragon\|kill-corridor | 10 | 70.0% | 39.7%-89.2% | 74.7% | 30.0% | 58.2% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 64.7% | 50.0% | 37.1% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 65.7% | 40.0% | 50.9% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.4% | 50.0% | 36.4% |
| mechanical_dragon\|southern-funnel | 12 | 50.0% | 25.4%-74.6% | 59.2% | 49.5% | 34.8% |
| mechanical_dragon\|split-core | 11 | 63.6% | 35.4%-84.8% | 64.4% | 36.4% | 48.8% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 65.6% | 39.9% | 45.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.6% | 33.3% | 54.5% |
| mimic\|asymmetric-left | 18 | 61.1% | 38.6%-79.7% | 70.6% | 34.3% | 48.4% |
| mimic\|asymmetric-right | 18 | 61.1% | 38.6%-79.7% | 69.9% | 37.9% | 52.4% |
| mimic\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 75.0% | 20.0% | 72.4% |
| mimic\|compact-core | 18 | 55.6% | 33.7%-75.4% | 61.0% | 43.7% | 46.0% |
| mimic\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 69.2% | 37.5% | 56.3% |
| mimic\|crossfire | 15 | 73.3% | 48.0%-89.1% | 71.1% | 26.7% | 66.7% |
| mimic\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 70.3% | 29.9% | 50.0% |
| mimic\|diamond | 15 | 73.3% | 48.0%-89.1% | 73.0% | 24.8% | 61.0% |
| mimic\|echelon-left | 15 | 86.7% | 62.1%-96.3% | 68.2% | 13.3% | 67.6% |
| mimic\|echelon-right | 15 | 80.0% | 54.8%-93.0% | 69.8% | 20.0% | 67.6% |
| mimic\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 73.6% | 19.8% | 63.8% |
| mimic\|layered-rings | 18 | 55.6% | 33.7%-75.4% | 67.2% | 35.3% | 43.7% |
| mimic\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 69.3% | 32.5% | 60.0% |
| mimic\|resource-shield | 18 | 55.6% | 33.7%-75.4% | 62.9% | 44.4% | 52.4% |
| mimic\|southern-funnel | 18 | 77.8% | 54.8%-91.0% | 72.3% | 22.2% | 73.8% |
| mimic\|split-core | 17 | 70.6% | 46.9%-86.7% | 60.4% | 28.6% | 60.5% |
| mimic\|trap-lanes | 18 | 77.8% | 54.8%-91.0% | 73.3% | 21.2% | 63.5% |
| mimic\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 76.7% | 14.8% | 69.8% |
| necromancer\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 54.3% | 50.0% | 38.9% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 44.1% | 66.7% | 27.8% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 49.5% | 66.6% | 16.7% |
| necromancer\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 55.4% | 50.0% | 33.3% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 51.6% | 60.5% | 22.2% |
| necromancer\|resource-shield | 6 | 50.0% | 18.8%-81.2% | 40.9% | 50.0% | 27.8% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 43.5% | 83.3% | 11.1% |
| necromancer\|trap-lanes | 6 | 50.0% | 18.8%-81.2% | 58.6% | 50.0% | 44.4% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 62.4% | 33.3% | 50.0% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 55.1% | 61.1% | 23.5% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 57.2% | 55.1% | 30.2% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 56.8% | 40.0% | 34.8% |
| pea_shooter\|compact-core | 18 | 33.3% | 16.3%-56.3% | 54.0% | 66.7% | 24.7% |
| pea_shooter\|corner-keep | 16 | 31.3% | 14.2%-55.6% | 52.8% | 62.2% | 18.8% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 52.7% | 53.3% | 28.1% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 65.0% | 48.4% | 27.2% |
| pea_shooter\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.7% | 44.8% | 33.3% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 55.5% | 46.7% | 34.8% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 34.8% |
| pea_shooter\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 52.7% | 53.2% | 34.1% |
| pea_shooter\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 58.1% | 54.7% | 28.4% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 59.8% | 46.7% | 34.1% |
| pea_shooter\|resource-shield | 18 | 27.8% | 12.5%-50.9% | 50.8% | 67.5% | 19.8% |
| pea_shooter\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 57.6% | 44.4% | 36.4% |
| pea_shooter\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.6% | 47.1% | 36.6% |
| pea_shooter\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 63.3% | 44.4% | 36.4% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 71.8% | 33.3% | 38.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 94.8% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 93.7% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 93.7% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 93.0% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 97.0% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 95.2% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 94.1% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 93.0% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 92.2% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 2.8% | 92.4% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 2.9% | 93.4% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 96.4% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 95.8% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 92.6% |
| th6-rear-keep-254 | 6 | rear-keep | maxed | 17 | 0.0% | 99.5% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,924 | 5,932.86 | 1,981 | 1,483.21 |  |
| necromancer | 7 | 15 | 36,018 | 10,998.77 | 2,401.2 | 733.25 |  |
| archer | 7 | 1 | 2,025 | 701.61 | 2,025 | 701.61 |  |
| fire_dragon | 7 | 10 | 15,208 | 6,790 | 1,520.8 | 679 |  |
| mechanical_dragon | 7 | 4 | 5,703 | 1,616.5 | 1,425.75 | 404.13 | chain x3 |
| demon_king | 7 | 5 | 18,618 | 2,011.11 | 3,723.6 | 402.22 |  |
| knight | 7 | 1 | 3,613 | 391.11 | 3,613 | 391.11 |  |
| mimic | 7 | 6 | 19,488 | 1,430.19 | 3,248 | 238.36 | trap immune |
| horror | 7 | 20 | 38,071 | 4,086.29 | 1,903.55 | 204.31 |  |
| pea_shooter | 7 | 5 | 11,658 | 820 | 2,331.6 | 164 |  |
| wind_mage | 7 | 15 | 20,880 | 2,372.73 | 1,392 | 158.18 |  |
| ice_golem | 7 | 10 | 38,002 | 1,470.42 | 3,800.2 | 147.04 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 58.3% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.3% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-253 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-124 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-285 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-067 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-118 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-035 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-188 has 0 attacker wins across 16 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-120 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-asymmetric-left-076 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-130 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-184 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-025 has 0.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-asymmetric-right-079 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-133 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-148 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-256 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-163 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-compact-core-217 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-247 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-043 has 100.0% attacker wins across 17 samples.
- **INFO / fragile-base:** th5-crossfire-097 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-crossfire-151 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-defense-ring-112 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-166 has 100.0% attacker wins across 16 samples.
- 143 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
