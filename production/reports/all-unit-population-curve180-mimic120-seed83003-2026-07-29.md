# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:39:11.018Z
**Seed:** 83003
**Town Halls:** TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83003-2026-07-29.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 2398
**Unbeaten non-adaptive bases (n >= 6):** 63
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
**Elapsed:** 118.3s

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
| 5000 | 2835 | 56.7% | 0 | 25.5s | 51.9% | 39.6% | 35.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1755 | 974 | 55.5% | 0 | 23.9s | 51.6% | 41.8% |
| TH6->TH6 | 1669 | 960 | 57.5% | 0 | 26.8s | 53.9% | 39.0% |
| TH5->TH5 | 1576 | 901 | 57.2% | 0 | 26.0s | 50.1% | 37.8% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 406 | 186 | 45.8% | 0 | 23.9s | 46.8% | 47.4% |
| resource-shield | 381 | 181 | 47.5% | 0 | 24.5s | 47.2% | 46.9% |
| asymmetric-right | 376 | 195 | 51.9% | 0 | 24.0s | 49.5% | 44.1% |
| crossfire | 339 | 198 | 58.4% | 0 | 25.0s | 49.9% | 38.4% |
| diamond | 338 | 191 | 56.5% | 0 | 23.7s | 50.4% | 40.2% |
| kill-corridor | 336 | 200 | 59.5% | 0 | 25.0s | 48.5% | 36.9% |
| trap-lanes | 274 | 179 | 65.3% | 0 | 26.9s | 55.1% | 33.4% |
| wide-spread | 272 | 198 | 72.8% | 0 | 27.7s | 60.5% | 24.6% |
| compact-core | 250 | 119 | 47.6% | 0 | 25.3s | 49.5% | 48.4% |
| asymmetric-left | 249 | 120 | 48.2% | 0 | 26.5s | 53.7% | 47.7% |
| southern-funnel | 247 | 143 | 57.9% | 0 | 25.0s | 53.1% | 38.9% |
| defense-ring | 245 | 148 | 60.4% | 0 | 27.4s | 56.9% | 35.8% |
| split-core | 239 | 144 | 60.3% | 0 | 24.8s | 54.8% | 35.3% |
| corner-keep | 221 | 123 | 55.7% | 0 | 26.6s | 54.4% | 39.9% |
| echelon-right | 208 | 130 | 62.5% | 0 | 25.7s | 52.6% | 35.8% |
| cannon-screen | 207 | 140 | 67.6% | 0 | 27.6s | 54.8% | 31.0% |
| echelon-left | 206 | 125 | 60.7% | 0 | 28.5s | 54.0% | 36.1% |
| rear-keep | 206 | 115 | 55.8% | 0 | 25.2s | 53.0% | 41.9% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH7 | 212 | 96 | 45.3% | 0 | 21.8s | 43.2% | 49.3% |
| resource-shield\|TH7 | 185 | 98 | 53.0% | 0 | 23.6s | 46.2% | 42.2% |
| asymmetric-right\|TH7 | 184 | 99 | 53.8% | 0 | 22.1s | 45.4% | 43.1% |
| kill-corridor\|TH7 | 177 | 107 | 60.5% | 0 | 22.0s | 48.3% | 36.6% |
| crossfire\|TH7 | 176 | 99 | 56.3% | 0 | 22.0s | 47.3% | 41.0% |
| diamond\|TH7 | 175 | 102 | 58.3% | 0 | 22.2s | 50.5% | 39.5% |
| compact-core\|TH6 | 103 | 51 | 49.5% | 0 | 25.4s | 51.0% | 45.8% |
| asymmetric-left\|TH6 | 101 | 55 | 54.5% | 0 | 26.2s | 54.6% | 42.8% |
| layered-rings\|TH6 | 101 | 52 | 51.5% | 0 | 25.7s | 53.8% | 43.1% |
| resource-shield\|TH6 | 101 | 45 | 44.6% | 0 | 26.5s | 49.5% | 51.6% |
| trap-lanes\|TH6 | 101 | 60 | 59.4% | 0 | 27.8s | 54.3% | 38.6% |
| southern-funnel\|TH6 | 100 | 59 | 59.0% | 0 | 26.3s | 51.5% | 37.3% |
| split-core\|TH6 | 100 | 64 | 64.0% | 0 | 25.7s | 56.4% | 31.8% |
| wide-spread\|TH6 | 99 | 67 | 67.7% | 0 | 27.9s | 60.5% | 29.6% |
| asymmetric-right\|TH6 | 98 | 51 | 52.0% | 0 | 26.0s | 56.0% | 42.8% |
| defense-ring\|TH6 | 98 | 61 | 62.2% | 0 | 28.4s | 55.6% | 33.4% |
| resource-shield\|TH5 | 95 | 38 | 40.0% | 0 | 24.1s | 46.8% | 50.9% |
| asymmetric-left\|TH5 | 94 | 42 | 44.7% | 0 | 26.4s | 50.5% | 48.0% |
| asymmetric-right\|TH5 | 94 | 45 | 47.9% | 0 | 25.6s | 51.5% | 47.4% |
| corner-keep\|TH5 | 94 | 54 | 57.4% | 0 | 26.1s | 51.3% | 36.7% |
| split-core\|TH5 | 94 | 56 | 59.6% | 0 | 23.6s | 51.3% | 34.2% |
| compact-core\|TH5 | 93 | 49 | 52.7% | 0 | 24.8s | 46.0% | 43.3% |
| defense-ring\|TH5 | 93 | 54 | 58.1% | 0 | 26.5s | 53.8% | 37.6% |
| layered-rings\|TH5 | 93 | 38 | 40.9% | 0 | 26.9s | 48.2% | 47.8% |
| southern-funnel\|TH5 | 93 | 58 | 62.4% | 0 | 23.1s | 51.8% | 33.1% |
| trap-lanes\|TH5 | 93 | 63 | 67.7% | 0 | 25.1s | 49.4% | 30.9% |
| wide-spread\|TH5 | 93 | 70 | 75.3% | 0 | 27.8s | 58.3% | 21.7% |
| diamond\|TH6 | 85 | 47 | 55.3% | 0 | 26.0s | 52.8% | 42.1% |
| echelon-right\|TH6 | 85 | 54 | 63.5% | 0 | 24.1s | 53.0% | 35.5% |
| cannon-screen\|TH6 | 84 | 60 | 71.4% | 0 | 29.5s | 56.7% | 26.5% |
| crossfire\|TH6 | 84 | 50 | 59.5% | 0 | 28.7s | 51.5% | 37.2% |
| echelon-left\|TH6 | 83 | 49 | 59.0% | 0 | 29.6s | 54.3% | 35.6% |
| corner-keep\|TH6 | 82 | 44 | 53.7% | 0 | 26.3s | 54.7% | 41.7% |
| kill-corridor\|TH6 | 82 | 48 | 58.5% | 0 | 26.8s | 52.8% | 38.2% |
| rear-keep\|TH6 | 82 | 43 | 52.4% | 0 | 25.1s | 51.4% | 46.4% |
| trap-lanes\|TH7 | 80 | 56 | 70.0% | 0 | 28.0s | 62.0% | 29.6% |
| wide-spread\|TH7 | 80 | 61 | 76.3% | 0 | 27.2s | 63.0% | 21.8% |
| crossfire\|TH5 | 79 | 49 | 62.0% | 0 | 27.8s | 54.6% | 33.7% |
| rear-keep\|TH5 | 79 | 46 | 58.2% | 0 | 24.7s | 49.2% | 37.5% |
| cannon-screen\|TH5 | 78 | 53 | 67.9% | 0 | 26.8s | 47.3% | 30.7% |
| diamond\|TH5 | 78 | 42 | 53.8% | 0 | 24.6s | 47.3% | 39.5% |
| echelon-left\|TH5 | 78 | 50 | 64.1% | 0 | 28.8s | 50.7% | 33.4% |
| echelon-right\|TH5 | 78 | 49 | 62.8% | 0 | 26.2s | 47.5% | 33.6% |
| kill-corridor\|TH5 | 77 | 45 | 58.4% | 0 | 30.2s | 44.6% | 36.3% |
| asymmetric-left\|TH7 | 54 | 23 | 42.6% | 0 | 27.2s | 57.1% | 56.1% |
| compact-core\|TH7 | 54 | 19 | 35.2% | 0 | 25.9s | 52.1% | 62.4% |
| defense-ring\|TH7 | 54 | 33 | 61.1% | 0 | 26.9s | 63.8% | 37.3% |
| southern-funnel\|TH7 | 54 | 26 | 48.1% | 0 | 25.9s | 57.9% | 51.7% |
| cannon-screen\|TH7 | 45 | 27 | 60.0% | 0 | 25.4s | 63.5% | 40.0% |
| corner-keep\|TH7 | 45 | 25 | 55.6% | 0 | 28.0s | 59.8% | 43.4% |
| echelon-left\|TH7 | 45 | 26 | 57.8% | 0 | 26.0s | 58.9% | 41.7% |
| echelon-right\|TH7 | 45 | 27 | 60.0% | 0 | 27.5s | 59.8% | 40.0% |
| rear-keep\|TH7 | 45 | 26 | 57.8% | 0 | 26.3s | 61.8% | 41.6% |
| split-core\|TH7 | 45 | 24 | 53.3% | 0 | 25.5s | 58.1% | 45.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 1052 | 82 | 7.8% | 0 | 20.3s | 34.6% | 85.2% |
| mid | 1011 | 861 | 85.2% | 0 | 31.3s | 65.4% | 10.7% |
| rushed-economy | 999 | 999 | 100.0% | 0 | 27.5s | 70.8% | 0.0% |
| maxed | 985 | 33 | 3.4% | 0 | 21.0s | 21.1% | 91.7% |
| mixed | 953 | 860 | 90.2% | 0 | 27.6s | 68.7% | 7.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 2602 | 1499 | 57.6% | 0 | 22.1s | 41.8% | 36.4% |
| pure-unit-matrix | 2398 | 1336 | 55.7% | 0 | 29.2s | 62.8% | 43.1% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 891 | 474 | 53.2% | 0 | 26.6s | 59.8% | 45.8% |
| policy-exploration\|TH5 | 869 | 505 | 58.1% | 0 | 21.7s | 36.8% | 34.3% |
| policy-exploration\|TH6 | 869 | 494 | 56.8% | 0 | 23.6s | 45.4% | 37.3% |
| policy-exploration\|TH7 | 864 | 500 | 57.9% | 0 | 21.1s | 43.0% | 37.7% |
| pure-unit-matrix\|TH6 | 800 | 466 | 58.3% | 0 | 30.2s | 63.2% | 40.8% |
| pure-unit-matrix\|TH5 | 707 | 396 | 56.0% | 0 | 31.3s | 66.4% | 42.1% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 1705 | 1008 | 59.1% | 0 | 22.1s | 42.6% | 34.6% |
| policy-exploration\|fire_dragon | 1496 | 861 | 57.6% | 0 | 20.4s | 42.6% | 36.7% |
| policy-exploration\|archer | 1416 | 831 | 58.7% | 0 | 22.2s | 42.1% | 35.0% |
| policy-exploration\|mage | 1406 | 782 | 55.6% | 0 | 21.0s | 41.2% | 38.8% |
| policy-exploration\|demon_king | 1363 | 781 | 57.3% | 0 | 21.8s | 42.2% | 35.6% |
| policy-exploration\|mimic | 1290 | 782 | 60.6% | 0 | 22.7s | 42.6% | 32.7% |
| policy-exploration\|pea_shooter | 850 | 477 | 56.1% | 0 | 21.6s | 40.8% | 37.6% |
| policy-exploration\|mechanical_dragon | 658 | 376 | 57.1% | 0 | 21.3s | 46.1% | 38.3% |
| pure-unit-matrix\|archer | 300 | 152 | 50.7% | 0 | 36.3s | 59.8% | 48.7% |
| pure-unit-matrix\|demon_king | 300 | 190 | 63.3% | 0 | 28.5s | 68.3% | 34.8% |
| pure-unit-matrix\|fire_dragon | 300 | 179 | 59.7% | 0 | 20.6s | 66.4% | 39.8% |
| pure-unit-matrix\|knight | 300 | 173 | 57.7% | 0 | 33.1s | 63.7% | 40.2% |
| pure-unit-matrix\|mage | 300 | 138 | 46.0% | 0 | 24.7s | 56.2% | 53.1% |
| pure-unit-matrix\|mimic | 300 | 200 | 66.7% | 0 | 34.5s | 68.1% | 31.5% |
| pure-unit-matrix\|pea_shooter | 300 | 146 | 48.7% | 0 | 28.1s | 58.7% | 50.4% |
| policy-exploration\|necromancer | 223 | 117 | 52.5% | 0 | 21.0s | 38.9% | 46.0% |
| pure-unit-matrix\|mechanical_dragon | 199 | 114 | 57.3% | 0 | 25.7s | 65.9% | 42.1% |
| pure-unit-matrix\|necromancer | 99 | 44 | 44.4% | 0 | 31.9s | 51.6% | 53.5% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH5 | 602 | 359 | 59.6% | 0 | 21.7s | 37.4% | 32.9% |
| policy-exploration\|knight\|TH6 | 568 | 334 | 58.8% | 0 | 23.1s | 45.6% | 34.7% |
| policy-exploration\|fire_dragon\|TH5 | 536 | 306 | 57.1% | 0 | 20.2s | 37.2% | 35.3% |
| policy-exploration\|knight\|TH7 | 535 | 315 | 58.9% | 0 | 21.3s | 45.0% | 36.2% |
| policy-exploration\|mage\|TH5 | 518 | 278 | 53.7% | 0 | 20.5s | 35.2% | 39.0% |
| policy-exploration\|archer\|TH5 | 513 | 303 | 59.1% | 0 | 21.5s | 36.2% | 32.5% |
| policy-exploration\|demon_king\|TH5 | 505 | 283 | 56.0% | 0 | 21.3s | 36.1% | 34.5% |
| policy-exploration\|fire_dragon\|TH6 | 498 | 288 | 57.8% | 0 | 21.6s | 45.5% | 36.0% |
| policy-exploration\|mimic\|TH5 | 493 | 292 | 59.2% | 0 | 22.2s | 36.5% | 32.7% |
| policy-exploration\|mage\|TH6 | 463 | 262 | 56.6% | 0 | 22.4s | 45.1% | 37.7% |
| policy-exploration\|fire_dragon\|TH7 | 462 | 267 | 57.8% | 0 | 19.5s | 45.4% | 39.1% |
| policy-exploration\|archer\|TH6 | 458 | 267 | 58.3% | 0 | 23.6s | 45.0% | 35.7% |
| policy-exploration\|archer\|TH7 | 445 | 261 | 58.7% | 0 | 21.4s | 45.4% | 37.1% |
| policy-exploration\|demon_king\|TH6 | 433 | 252 | 58.2% | 0 | 23.1s | 46.8% | 34.7% |
| policy-exploration\|mimic\|TH6 | 433 | 270 | 62.4% | 0 | 23.9s | 47.1% | 31.5% |
| policy-exploration\|demon_king\|TH7 | 425 | 246 | 57.9% | 0 | 21.0s | 44.3% | 38.0% |
| policy-exploration\|mage\|TH7 | 425 | 242 | 56.9% | 0 | 20.1s | 43.8% | 39.7% |
| policy-exploration\|mechanical_dragon\|TH6 | 373 | 205 | 55.0% | 0 | 22.0s | 45.0% | 39.2% |
| policy-exploration\|mimic\|TH7 | 364 | 220 | 60.4% | 0 | 22.1s | 45.2% | 34.1% |
| policy-exploration\|pea_shooter\|TH5 | 333 | 183 | 55.0% | 0 | 20.8s | 33.2% | 37.0% |
| policy-exploration\|pea_shooter\|TH6 | 306 | 168 | 54.9% | 0 | 22.7s | 44.4% | 38.7% |
| policy-exploration\|mechanical_dragon\|TH7 | 285 | 171 | 60.0% | 0 | 20.4s | 47.4% | 37.1% |
| policy-exploration\|necromancer\|TH7 | 223 | 117 | 52.5% | 0 | 21.0s | 38.9% | 46.0% |
| policy-exploration\|pea_shooter\|TH7 | 211 | 126 | 59.7% | 0 | 21.1s | 47.0% | 37.0% |
| pure-unit-matrix\|archer\|TH5 | 101 | 47 | 46.5% | 0 | 39.3s | 63.1% | 51.7% |
| pure-unit-matrix\|demon_king\|TH5 | 101 | 67 | 66.3% | 0 | 30.6s | 73.3% | 30.9% |
| pure-unit-matrix\|fire_dragon\|TH5 | 101 | 60 | 59.4% | 0 | 21.3s | 68.5% | 39.8% |
| pure-unit-matrix\|knight\|TH5 | 101 | 57 | 56.4% | 0 | 35.1s | 65.3% | 40.3% |
| pure-unit-matrix\|mage\|TH5 | 101 | 48 | 47.5% | 0 | 26.1s | 60.7% | 51.3% |
| pure-unit-matrix\|mimic\|TH5 | 101 | 65 | 64.4% | 0 | 37.8s | 69.1% | 33.2% |
| pure-unit-matrix\|pea_shooter\|TH5 | 101 | 52 | 51.5% | 0 | 29.1s | 64.7% | 47.3% |
| pure-unit-matrix\|archer\|TH6 | 100 | 50 | 50.0% | 0 | 37.4s | 55.6% | 50.0% |
| pure-unit-matrix\|demon_king\|TH6 | 100 | 66 | 66.0% | 0 | 30.0s | 70.1% | 31.9% |
| pure-unit-matrix\|fire_dragon\|TH6 | 100 | 61 | 61.0% | 0 | 21.6s | 64.4% | 39.0% |
| pure-unit-matrix\|knight\|TH6 | 100 | 59 | 59.0% | 0 | 35.1s | 65.4% | 38.9% |
| pure-unit-matrix\|mage\|TH6 | 100 | 45 | 45.0% | 0 | 24.6s | 53.5% | 54.2% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 100 | 59 | 59.0% | 0 | 27.9s | 65.9% | 40.8% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 79 | 79.0% | 0 | 35.1s | 75.6% | 19.3% |
| pure-unit-matrix\|pea_shooter\|TH6 | 100 | 47 | 47.0% | 0 | 29.5s | 55.0% | 52.6% |
| pure-unit-matrix\|archer\|TH7 | 99 | 55 | 55.6% | 0 | 32.2s | 60.6% | 44.4% |
| pure-unit-matrix\|demon_king\|TH7 | 99 | 57 | 57.6% | 0 | 24.8s | 61.9% | 41.8% |
| pure-unit-matrix\|fire_dragon\|TH7 | 99 | 58 | 58.6% | 0 | 18.7s | 66.4% | 40.6% |
| pure-unit-matrix\|knight\|TH7 | 99 | 57 | 57.6% | 0 | 29.0s | 60.7% | 41.4% |
| pure-unit-matrix\|mage\|TH7 | 99 | 45 | 45.5% | 0 | 23.3s | 54.7% | 53.8% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 99 | 55 | 55.6% | 0 | 23.4s | 65.9% | 43.4% |
| pure-unit-matrix\|mimic\|TH7 | 99 | 56 | 56.6% | 0 | 30.6s | 60.2% | 42.1% |
| pure-unit-matrix\|necromancer\|TH7 | 99 | 44 | 44.4% | 0 | 31.9s | 51.6% | 53.5% |
| pure-unit-matrix\|pea_shooter\|TH7 | 99 | 47 | 47.5% | 0 | 25.7s | 56.6% | 51.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 2398 | 1336 | 55.7% | 0 | 29.2s | 62.8% | 43.1% |
| policy-exploration\|cannon-focus | 479 | 291 | 60.8% | 0 | 28.5s | 65.8% | 37.6% |
| policy-exploration\|cannon-rally | 479 | 266 | 55.5% | 0 | 14.6s | 6.7% | 31.8% |
| policy-exploration\|rally-core | 454 | 255 | 56.2% | 0 | 15.0s | 6.0% | 30.2% |
| policy-exploration\|none | 444 | 249 | 56.1% | 0 | 26.3s | 65.2% | 42.7% |
| policy-exploration\|cannon-medkit | 246 | 139 | 56.5% | 0 | 27.0s | 61.3% | 42.5% |
| policy-exploration\|medkit-entry | 150 | 88 | 58.7% | 0 | 27.7s | 64.5% | 40.3% |
| policy-exploration\|freeze-rage | 105 | 68 | 64.8% | 0 | 24.9s | 69.0% | 34.8% |
| policy-exploration\|rally-rage | 105 | 62 | 59.0% | 0 | 14.3s | 8.3% | 28.2% |
| policy-exploration\|freeze-barrel | 100 | 59 | 59.0% | 0 | 25.9s | 68.1% | 39.5% |
| policy-exploration\|skeleton-barrel | 40 | 22 | 55.0% | 0 | 23.0s | 61.3% | 45.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 303 | 165 | 54.5% | 0 | 21.9s | 36.0% | 41.1% |
| policy-exploration\|wide-line | 284 | 140 | 49.3% | 0 | 22.9s | 55.3% | 46.1% |
| policy-exploration\|vanguard-wedge | 276 | 164 | 59.4% | 0 | 26.2s | 55.9% | 36.7% |
| policy-exploration\|center-column | 269 | 191 | 71.0% | 0 | 24.4s | 54.0% | 27.2% |
| policy-exploration\|right-flank | 266 | 186 | 69.9% | 0 | 23.7s | 46.5% | 25.1% |
| policy-exploration\|dual-flank | 264 | 156 | 59.1% | 0 | 24.8s | 57.9% | 36.6% |
| policy-exploration\|edge-sweep | 261 | 118 | 45.2% | 0 | 18.1s | 27.8% | 45.9% |
| pure-unit-matrix\|center-column | 240 | 131 | 54.6% | 0 | 30.3s | 61.0% | 44.8% |
| pure-unit-matrix\|diamond | 240 | 128 | 53.3% | 0 | 28.9s | 62.5% | 45.5% |
| pure-unit-matrix\|dual-flank | 240 | 130 | 54.2% | 0 | 27.6s | 63.8% | 44.9% |
| pure-unit-matrix\|inverted-wedge | 240 | 138 | 57.5% | 0 | 30.4s | 62.5% | 41.4% |
| pure-unit-matrix\|left-flank | 240 | 147 | 61.3% | 0 | 29.8s | 62.0% | 36.9% |
| pure-unit-matrix\|right-flank | 240 | 143 | 59.6% | 0 | 30.9s | 62.0% | 38.0% |
| pure-unit-matrix\|three-lane | 240 | 127 | 52.9% | 0 | 28.9s | 62.5% | 45.9% |
| pure-unit-matrix\|vanguard-wedge | 240 | 131 | 54.6% | 0 | 29.2s | 61.6% | 45.0% |
| pure-unit-matrix\|wide-line | 240 | 133 | 55.4% | 0 | 27.7s | 65.3% | 43.3% |
| pure-unit-matrix\|edge-sweep | 238 | 128 | 53.8% | 0 | 28.2s | 64.6% | 45.1% |
| policy-exploration\|left-flank | 232 | 165 | 71.1% | 0 | 18.5s | 25.6% | 20.2% |
| policy-exploration\|inverted-wedge | 224 | 130 | 58.0% | 0 | 22.3s | 30.8% | 31.6% |
| policy-exploration\|three-lane | 223 | 84 | 37.7% | 0 | 17.0s | 20.2% | 52.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 526 | 315 | 59.9% | 0 | 21.5s | 45.1% | 33.3% |
| policy-exploration\|three-waves | 526 | 298 | 56.7% | 0 | 21.9s | 39.4% | 36.9% |
| policy-exploration\|rapid | 520 | 295 | 56.7% | 0 | 21.8s | 41.7% | 36.6% |
| policy-exploration\|two-waves | 516 | 262 | 50.8% | 0 | 21.4s | 39.7% | 43.8% |
| policy-exploration\|drip | 514 | 329 | 64.0% | 0 | 24.1s | 43.2% | 31.6% |
| pure-unit-matrix\|burst | 480 | 287 | 59.8% | 0 | 29.7s | 64.2% | 39.3% |
| pure-unit-matrix\|rapid | 480 | 263 | 54.8% | 0 | 28.7s | 62.7% | 43.5% |
| pure-unit-matrix\|three-waves | 480 | 281 | 58.5% | 0 | 29.5s | 64.1% | 40.1% |
| pure-unit-matrix\|two-waves | 480 | 244 | 50.8% | 0 | 28.5s | 60.8% | 48.1% |
| pure-unit-matrix\|drip | 478 | 261 | 54.6% | 0 | 29.5s | 62.0% | 44.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 1301 | 755 | 58.0% | 0 | 21.9s | 42.0% | 35.3% |
| policy-exploration\|tank-front-support-rear | 1301 | 744 | 57.2% | 0 | 22.3s | 41.7% | 37.6% |
| pure-unit-matrix\|roster-order | 1199 | 661 | 55.1% | 0 | 28.6s | 62.4% | 43.6% |
| pure-unit-matrix\|tank-front-support-rear | 1199 | 675 | 56.3% | 0 | 29.8s | 63.1% | 42.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 416 | 188 | 45.2% | 0 | 23.4s | 50.3% | 53.5% |
| pure-mimic | 410 | 283 | 69.0% | 0 | 32.0s | 60.8% | 28.6% |
| pure-fire_dragon | 409 | 245 | 59.9% | 0 | 20.1s | 62.3% | 38.8% |
| pure-pea_shooter | 405 | 201 | 49.6% | 0 | 26.8s | 53.5% | 48.6% |
| pure-demon_king | 404 | 245 | 60.6% | 0 | 27.1s | 61.0% | 34.4% |
| pure-archer | 393 | 200 | 50.9% | 0 | 35.0s | 54.7% | 46.7% |
| pure-knight | 388 | 229 | 59.0% | 0 | 31.3s | 57.9% | 37.1% |
| pure-mechanical_dragon | 262 | 146 | 55.7% | 0 | 24.6s | 60.5% | 43.2% |
| pure-necromancer | 131 | 58 | 44.3% | 0 | 29.8s | 46.5% | 54.1% |
| melee-pressure | 117 | 69 | 59.0% | 0 | 26.0s | 43.4% | 29.2% |
| core-fire_dragon-filled | 111 | 68 | 61.3% | 0 | 18.2s | 41.0% | 32.2% |
| balanced | 110 | 68 | 61.8% | 0 | 19.0s | 40.2% | 31.8% |
| hero-necro-dragon-mages | 110 | 64 | 58.2% | 0 | 19.2s | 44.1% | 39.4% |
| random-3 | 110 | 65 | 59.1% | 0 | 23.2s | 46.4% | 35.9% |
| random-1 | 108 | 60 | 55.6% | 0 | 20.3s | 41.4% | 37.7% |
| random-2 | 105 | 67 | 63.8% | 0 | 21.2s | 43.1% | 28.7% |
| frontline-ranged | 104 | 58 | 55.8% | 0 | 20.5s | 42.4% | 39.9% |
| random-5 | 104 | 53 | 51.0% | 0 | 21.1s | 37.9% | 43.3% |
| support-mix | 104 | 57 | 54.8% | 0 | 24.1s | 41.4% | 37.4% |
| random-4 | 97 | 50 | 51.5% | 0 | 20.3s | 37.0% | 42.7% |
| random-6 | 97 | 58 | 59.8% | 0 | 21.2s | 41.7% | 35.6% |
| core-mimic-filled | 93 | 75 | 80.6% | 0 | 28.3s | 51.2% | 15.8% |
| trap-runner-mix | 93 | 57 | 61.3% | 0 | 24.2s | 49.6% | 29.2% |
| core-mage-filled | 92 | 46 | 50.0% | 0 | 21.8s | 39.1% | 46.2% |
| ranged-pressure | 87 | 47 | 54.0% | 0 | 19.5s | 37.7% | 39.6% |
| air-pressure | 78 | 41 | 52.6% | 0 | 17.3s | 43.5% | 44.3% |
| core-mechanical_dragon-filled | 62 | 37 | 59.7% | 0 | 23.3s | 49.7% | 35.3% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond__two-waves__roster-order | 57 | 35 | 61.4% | 0 | 26.4s | 49.6% | 35.2% |
| wide-line__burst__tank-front-support-rear | 57 | 33 | 57.9% | 0 | 25.0s | 58.4% | 37.7% |
| diamond__burst__roster-order | 56 | 25 | 44.6% | 0 | 20.2s | 37.3% | 51.7% |
| diamond__rapid__roster-order | 56 | 29 | 51.8% | 0 | 22.6s | 42.6% | 38.8% |
| diamond__rapid__tank-front-support-rear | 56 | 28 | 50.0% | 0 | 25.4s | 50.0% | 46.4% |
| diamond__two-waves__tank-front-support-rear | 56 | 26 | 46.4% | 0 | 26.4s | 44.7% | 53.4% |
| dual-flank__three-waves__roster-order | 56 | 28 | 50.0% | 0 | 26.0s | 52.5% | 42.1% |
| dual-flank__two-waves__roster-order | 56 | 32 | 57.1% | 0 | 23.3s | 60.8% | 40.5% |
| edge-sweep__drip__tank-front-support-rear | 56 | 27 | 48.2% | 0 | 24.3s | 50.5% | 48.4% |
| edge-sweep__three-waves__tank-front-support-rear | 56 | 30 | 53.6% | 0 | 24.2s | 47.7% | 44.0% |
| left-flank__drip__roster-order | 56 | 48 | 85.7% | 0 | 24.3s | 47.6% | 12.3% |
| right-flank__three-waves__roster-order | 56 | 39 | 69.6% | 0 | 27.7s | 55.4% | 24.7% |
| vanguard-wedge__burst__roster-order | 56 | 29 | 51.8% | 0 | 26.3s | 52.4% | 38.8% |
| vanguard-wedge__rapid__roster-order | 56 | 34 | 60.7% | 0 | 26.9s | 58.0% | 37.8% |
| wide-line__drip__tank-front-support-rear | 56 | 37 | 66.1% | 0 | 27.9s | 66.4% | 31.0% |
| center-column__burst__roster-order | 55 | 42 | 76.4% | 0 | 29.4s | 65.9% | 23.2% |
| diamond__burst__tank-front-support-rear | 55 | 33 | 60.0% | 0 | 27.5s | 49.1% | 35.3% |
| diamond__drip__tank-front-support-rear | 55 | 29 | 52.7% | 0 | 25.2s | 46.8% | 46.6% |
| dual-flank__rapid__roster-order | 55 | 31 | 56.4% | 0 | 26.4s | 64.0% | 43.5% |
| inverted-wedge__burst__tank-front-support-rear | 55 | 39 | 70.9% | 0 | 29.2s | 64.3% | 27.1% |
| right-flank__rapid__roster-order | 55 | 35 | 63.6% | 0 | 25.1s | 52.8% | 32.0% |
| right-flank__two-waves__roster-order | 55 | 32 | 58.2% | 0 | 29.4s | 59.5% | 40.5% |
| vanguard-wedge__rapid__tank-front-support-rear | 55 | 37 | 67.3% | 0 | 26.8s | 60.1% | 32.3% |
| wide-line__drip__roster-order | 55 | 34 | 61.8% | 0 | 27.4s | 69.7% | 37.6% |
| wide-line__three-waves__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 24.4s | 54.0% | 53.9% |
| wide-line__two-waves__tank-front-support-rear | 55 | 25 | 45.5% | 0 | 26.1s | 61.6% | 53.6% |
| center-column__two-waves__roster-order | 54 | 26 | 48.1% | 0 | 24.8s | 48.7% | 49.7% |
| vanguard-wedge__burst__tank-front-support-rear | 54 | 25 | 46.3% | 0 | 26.3s | 54.6% | 51.7% |
| vanguard-wedge__drip__tank-front-support-rear | 54 | 31 | 57.4% | 0 | 29.5s | 63.3% | 40.7% |
| wide-line__three-waves__roster-order | 54 | 27 | 50.0% | 0 | 23.6s | 60.4% | 47.8% |
| center-column__drip__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 29.1s | 46.2% | 31.2% |
| center-column__three-waves__tank-front-support-rear | 51 | 34 | 66.7% | 0 | 25.9s | 53.7% | 31.3% |
| diamond__drip__roster-order | 51 | 32 | 62.7% | 0 | 28.5s | 59.0% | 35.2% |
| diamond__three-waves__roster-order | 51 | 26 | 51.0% | 0 | 24.7s | 52.5% | 47.0% |
| edge-sweep__burst__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 20.9s | 36.2% | 44.6% |
| edge-sweep__rapid__tank-front-support-rear | 51 | 22 | 43.1% | 0 | 22.7s | 37.9% | 46.9% |
| edge-sweep__two-waves__tank-front-support-rear | 51 | 23 | 45.1% | 0 | 22.4s | 46.1% | 54.0% |
| left-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 24.3s | 44.2% | 31.6% |
| right-flank__three-waves__tank-front-support-rear | 51 | 33 | 64.7% | 0 | 27.3s | 54.6% | 29.6% |
| right-flank__two-waves__tank-front-support-rear | 51 | 31 | 60.8% | 0 | 24.8s | 50.0% | 34.6% |
| three-lane__three-waves__roster-order | 51 | 22 | 43.1% | 0 | 21.8s | 39.3% | 44.2% |
| three-lane__two-waves__roster-order | 51 | 14 | 27.5% | 0 | 18.9s | 31.2% | 61.2% |
| wide-line__burst__roster-order | 51 | 27 | 52.9% | 0 | 24.1s | 62.2% | 40.1% |
| wide-line__rapid__tank-front-support-rear | 51 | 28 | 54.9% | 0 | 28.0s | 63.3% | 42.5% |
| center-column__burst__tank-front-support-rear | 50 | 31 | 62.0% | 0 | 25.6s | 64.0% | 37.3% |
| center-column__drip__roster-order | 50 | 33 | 66.0% | 0 | 24.5s | 51.8% | 32.5% |
| center-column__rapid__tank-front-support-rear | 50 | 25 | 50.0% | 0 | 28.6s | 60.3% | 49.4% |
| center-column__two-waves__tank-front-support-rear | 50 | 36 | 72.0% | 0 | 26.8s | 63.2% | 28.0% |
| diamond__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 23.4s | 46.6% | 39.8% |
| dual-flank__burst__roster-order | 50 | 26 | 52.0% | 0 | 25.7s | 63.8% | 46.4% |
| dual-flank__drip__roster-order | 50 | 23 | 46.0% | 0 | 25.6s | 50.9% | 53.0% |
| dual-flank__three-waves__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 27.4s | 62.2% | 32.6% |
| dual-flank__two-waves__tank-front-support-rear | 50 | 26 | 52.0% | 0 | 26.8s | 62.5% | 48.0% |
| edge-sweep__three-waves__roster-order | 50 | 27 | 54.0% | 0 | 23.7s | 45.1% | 42.9% |
| inverted-wedge__drip__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 24.5s | 40.5% | 33.1% |
| inverted-wedge__rapid__tank-front-support-rear | 50 | 23 | 46.0% | 0 | 25.5s | 46.1% | 42.2% |
| left-flank__three-waves__roster-order | 50 | 33 | 66.0% | 0 | 24.4s | 51.9% | 27.9% |
| right-flank__burst__roster-order | 50 | 41 | 82.0% | 0 | 25.6s | 49.6% | 16.4% |
| right-flank__rapid__tank-front-support-rear | 50 | 30 | 60.0% | 0 | 25.4s | 43.6% | 33.6% |
| three-lane__rapid__roster-order | 50 | 22 | 44.0% | 0 | 21.1s | 44.1% | 53.3% |
| vanguard-wedge__two-waves__roster-order | 50 | 27 | 54.0% | 0 | 27.6s | 60.2% | 45.9% |
| center-column__rapid__roster-order | 49 | 30 | 61.2% | 0 | 27.5s | 59.5% | 38.4% |
| center-column__three-waves__roster-order | 49 | 31 | 63.3% | 0 | 30.0s | 59.9% | 34.5% |
| dual-flank__burst__tank-front-support-rear | 49 | 40 | 81.6% | 0 | 26.9s | 71.5% | 17.8% |
| dual-flank__rapid__tank-front-support-rear | 49 | 32 | 65.3% | 0 | 27.9s | 63.7% | 33.1% |
| edge-sweep__drip__roster-order | 49 | 33 | 67.3% | 0 | 25.0s | 53.3% | 30.8% |
| inverted-wedge__burst__roster-order | 49 | 30 | 61.2% | 0 | 24.4s | 53.5% | 33.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 30.0s | 37.4% | 33.9% |
| left-flank__two-waves__roster-order | 49 | 31 | 63.3% | 0 | 23.7s | 40.8% | 26.6% |
| right-flank__drip__roster-order | 49 | 27 | 55.1% | 0 | 29.4s | 50.0% | 40.3% |
| vanguard-wedge__drip__roster-order | 49 | 30 | 61.2% | 0 | 30.0s | 56.7% | 37.4% |
| vanguard-wedge__three-waves__tank-front-support-rear | 49 | 23 | 46.9% | 0 | 26.3s | 56.9% | 51.7% |
| vanguard-wedge__two-waves__tank-front-support-rear | 49 | 28 | 57.1% | 0 | 26.3s | 55.0% | 39.2% |
| edge-sweep__burst__roster-order | 45 | 18 | 40.0% | 0 | 21.4s | 40.2% | 53.6% |
| edge-sweep__rapid__roster-order | 45 | 20 | 44.4% | 0 | 23.1s | 48.8% | 45.7% |
| edge-sweep__two-waves__roster-order | 45 | 23 | 51.1% | 0 | 21.1s | 47.4% | 44.8% |
| inverted-wedge__rapid__roster-order | 45 | 28 | 62.2% | 0 | 26.6s | 54.1% | 35.7% |
| left-flank__burst__tank-front-support-rear | 45 | 33 | 73.3% | 0 | 29.4s | 53.2% | 22.9% |
| left-flank__drip__tank-front-support-rear | 45 | 24 | 53.3% | 0 | 26.1s | 48.8% | 45.7% |
| right-flank__burst__tank-front-support-rear | 45 | 30 | 66.7% | 0 | 26.2s | 58.3% | 30.1% |
| three-lane__burst__roster-order | 45 | 25 | 55.6% | 0 | 23.6s | 56.7% | 43.6% |
| three-lane__drip__roster-order | 45 | 20 | 44.4% | 0 | 27.9s | 39.1% | 47.2% |
| three-lane__two-waves__tank-front-support-rear | 45 | 13 | 28.9% | 0 | 23.2s | 36.3% | 68.5% |
| wide-line__rapid__roster-order | 45 | 22 | 48.9% | 0 | 22.3s | 54.6% | 50.8% |
| wide-line__two-waves__roster-order | 45 | 15 | 33.3% | 0 | 20.9s | 44.8% | 56.5% |
| inverted-wedge__drip__roster-order | 44 | 27 | 61.4% | 0 | 25.4s | 35.6% | 31.1% |
| inverted-wedge__two-waves__tank-front-support-rear | 44 | 19 | 43.2% | 0 | 23.5s | 35.1% | 52.8% |
| left-flank__burst__roster-order | 44 | 25 | 56.8% | 0 | 21.6s | 35.4% | 34.6% |
| left-flank__rapid__roster-order | 44 | 27 | 61.4% | 0 | 21.5s | 35.9% | 32.7% |
| left-flank__rapid__tank-front-support-rear | 44 | 32 | 72.7% | 0 | 25.0s | 47.7% | 19.5% |
| left-flank__two-waves__tank-front-support-rear | 44 | 26 | 59.1% | 0 | 22.4s | 34.3% | 37.2% |
| right-flank__drip__tank-front-support-rear | 44 | 31 | 70.5% | 0 | 30.2s | 66.3% | 29.4% |
| three-lane__burst__tank-front-support-rear | 44 | 27 | 61.4% | 0 | 28.8s | 56.3% | 35.9% |
| three-lane__drip__tank-front-support-rear | 44 | 22 | 50.0% | 0 | 22.8s | 42.2% | 46.0% |
| three-lane__rapid__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 23.6s | 45.1% | 42.6% |
| three-lane__three-waves__tank-front-support-rear | 44 | 23 | 52.3% | 0 | 20.7s | 34.1% | 46.1% |
| vanguard-wedge__three-waves__roster-order | 44 | 31 | 70.5% | 0 | 30.2s | 70.0% | 29.5% |
| dual-flank__drip__tank-front-support-rear | 39 | 18 | 46.2% | 0 | 25.8s | 54.7% | 49.2% |
| inverted-wedge__three-waves__roster-order | 39 | 26 | 66.7% | 0 | 24.1s | 44.1% | 29.5% |
| inverted-wedge__two-waves__roster-order | 39 | 18 | 46.2% | 0 | 31.2s | 60.0% | 51.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 543 | 293 | 54.0% | 0 | 25.0s | 47.7% | 43.0% |
| wide-line | 524 | 273 | 52.1% | 0 | 25.1s | 59.8% | 44.8% |
| vanguard-wedge | 516 | 295 | 57.2% | 0 | 27.6s | 58.5% | 40.6% |
| center-column | 509 | 322 | 63.3% | 0 | 27.2s | 57.3% | 35.5% |
| right-flank | 506 | 329 | 65.0% | 0 | 27.1s | 53.9% | 31.2% |
| dual-flank | 504 | 286 | 56.7% | 0 | 26.1s | 60.7% | 40.5% |
| edge-sweep | 499 | 246 | 49.3% | 0 | 22.9s | 45.4% | 45.6% |
| left-flank | 472 | 312 | 66.1% | 0 | 24.3s | 44.2% | 28.7% |
| inverted-wedge | 464 | 268 | 57.8% | 0 | 26.5s | 47.3% | 36.6% |
| three-lane | 463 | 211 | 45.6% | 0 | 23.1s | 42.3% | 49.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 1006 | 602 | 59.8% | 0 | 25.4s | 54.3% | 36.2% |
| three-waves | 1006 | 579 | 57.6% | 0 | 25.5s | 51.3% | 38.4% |
| rapid | 1000 | 558 | 55.8% | 0 | 25.2s | 51.8% | 39.9% |
| two-waves | 996 | 506 | 50.8% | 0 | 24.8s | 49.9% | 45.9% |
| drip | 992 | 590 | 59.5% | 0 | 26.7s | 52.3% | 37.7% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 2500 | 1416 | 56.6% | 0 | 25.2s | 51.8% | 39.3% |
| tank-front-support-rear | 2500 | 1419 | 56.8% | 0 | 25.9s | 52.0% | 39.9% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 2842 | 1585 | 55.8% | 0 | 28.7s | 63.1% | 43.0% |
| cannon-focus | 479 | 291 | 60.8% | 0 | 28.5s | 65.8% | 37.6% |
| cannon-rally | 479 | 266 | 55.5% | 0 | 14.6s | 6.7% | 31.8% |
| rally-core | 454 | 255 | 56.2% | 0 | 15.0s | 6.0% | 30.2% |
| cannon-medkit | 246 | 139 | 56.5% | 0 | 27.0s | 61.3% | 42.5% |
| medkit-entry | 150 | 88 | 58.7% | 0 | 27.7s | 64.5% | 40.3% |
| freeze-rage | 105 | 68 | 64.8% | 0 | 24.9s | 69.0% | 34.8% |
| rally-rage | 105 | 62 | 59.0% | 0 | 14.3s | 8.3% | 28.2% |
| freeze-barrel | 100 | 59 | 59.0% | 0 | 25.9s | 68.1% | 39.5% |
| skeleton-barrel | 40 | 22 | 55.0% | 0 | 23.0s | 61.3% | 45.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1342 | 831 | 61.9% | 0 | 22.9s | 56.2% | 34.8% |
| legendary | 725 | 398 | 54.9% | 0 | 21.5s | 44.2% | 38.6% |
| epic | 708 | 397 | 56.1% | 0 | 20.5s | 38.3% | 35.9% |
| unrevealed | 684 | 385 | 56.3% | 0 | 20.7s | 39.7% | 37.6% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 689 | 417 | 60.5% | 0 | 20.7s | 55.6% | 36.7% |
| demon_king\|common | 653 | 414 | 63.4% | 0 | 25.2s | 56.7% | 32.9% |
| fire_dragon\|legendary | 381 | 217 | 57.0% | 0 | 21.2s | 46.1% | 36.9% |
| fire_dragon\|epic | 374 | 205 | 54.8% | 0 | 19.9s | 38.1% | 38.1% |
| fire_dragon\|unrevealed | 352 | 201 | 57.1% | 0 | 19.8s | 38.6% | 37.6% |
| demon_king\|legendary | 344 | 181 | 52.6% | 0 | 21.9s | 42.1% | 40.4% |
| demon_king\|epic | 334 | 192 | 57.5% | 0 | 21.2s | 38.5% | 33.5% |
| demon_king\|unrevealed | 332 | 184 | 55.4% | 0 | 21.7s | 40.9% | 37.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 3032 | 1712 | 56.5% | 0 | 27.7s | 58.6% | 41.4% |
| ward-1 | 767 | 456 | 59.5% | 0 | 22.5s | 42.1% | 34.7% |
| ward-3 | 601 | 325 | 54.1% | 0 | 21.8s | 40.5% | 39.5% |
| ward-2 | 600 | 342 | 57.0% | 0 | 21.7s | 42.2% | 37.2% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 5000 | 2835 | 56.7% | 0 | 25.5s | 51.9% | 39.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 2005 | 1181 | 58.9% | 0 | 23.7s | 45.8% | 35.4% |
| fire_dragon | 1796 | 1040 | 57.9% | 0 | 20.5s | 46.6% | 37.2% |
| archer | 1716 | 983 | 57.3% | 0 | 24.6s | 45.2% | 37.4% |
| mage | 1706 | 920 | 53.9% | 0 | 21.6s | 43.8% | 41.3% |
| demon_king | 1663 | 971 | 58.4% | 0 | 23.0s | 46.9% | 35.5% |
| mimic | 1590 | 982 | 61.8% | 0 | 25.0s | 47.5% | 32.5% |
| pea_shooter | 1150 | 623 | 54.2% | 0 | 23.3s | 45.5% | 41.0% |
| mechanical_dragon | 857 | 490 | 57.2% | 0 | 22.4s | 50.7% | 39.2% |
| necromancer | 322 | 161 | 50.0% | 0 | 24.3s | 42.8% | 48.3% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 300 | 50.7% | 45.0%-56.3% | 59.8% | 48.7% | 27.6% |
| demon_king | 300 | 63.3% | 57.7%-68.6% | 68.3% | 34.8% | 52.1% |
| fire_dragon | 300 | 59.7% | 54.0%-65.1% | 66.4% | 39.8% | 50.5% |
| knight | 300 | 57.7% | 52.0%-63.1% | 63.7% | 40.2% | 38.6% |
| mage | 300 | 46.0% | 40.4%-51.7% | 56.2% | 53.1% | 27.3% |
| mechanical_dragon | 199 | 57.3% | 50.3%-64.0% | 65.9% | 42.1% | 45.8% |
| mimic | 300 | 66.7% | 61.2%-71.8% | 68.1% | 31.5% | 56.7% |
| necromancer | 99 | 44.4% | 35.0%-54.3% | 51.6% | 53.5% | 32.0% |
| pea_shooter | 300 | 48.7% | 43.1%-54.3% | 58.7% | 50.4% | 31.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 101 | 46.5% | 37.1%-56.2% | 63.1% | 51.7% | 28.6% |
| archer\|TH6 | 100 | 50.0% | 40.4%-59.6% | 55.6% | 50.0% | 23.7% |
| archer\|TH7 | 99 | 55.6% | 45.7%-65.0% | 60.6% | 44.4% | 30.5% |
| demon_king\|TH5 | 101 | 66.3% | 56.7%-74.8% | 73.3% | 30.9% | 52.8% |
| demon_king\|TH6 | 100 | 66.0% | 56.3%-74.5% | 70.1% | 31.9% | 54.7% |
| demon_king\|TH7 | 99 | 57.6% | 47.7%-66.8% | 61.9% | 41.8% | 48.8% |
| fire_dragon\|TH5 | 101 | 59.4% | 49.7%-68.5% | 68.5% | 39.8% | 49.3% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 64.4% | 39.0% | 50.0% |
| fire_dragon\|TH7 | 99 | 58.6% | 48.7%-67.8% | 66.4% | 40.6% | 52.3% |
| knight\|TH5 | 101 | 56.4% | 46.7%-65.7% | 65.3% | 40.3% | 37.3% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.4% | 38.9% | 40.2% |
| knight\|TH7 | 99 | 57.6% | 47.7%-66.8% | 60.7% | 41.4% | 38.5% |
| mage\|TH5 | 101 | 47.5% | 38.1%-57.2% | 60.7% | 51.3% | 30.3% |
| mage\|TH6 | 100 | 45.0% | 35.6%-54.8% | 53.5% | 54.2% | 23.5% |
| mage\|TH7 | 99 | 45.5% | 36.0%-55.2% | 54.7% | 53.8% | 28.1% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 65.9% | 40.8% | 45.5% |
| mechanical_dragon\|TH7 | 99 | 55.6% | 45.7%-65.0% | 65.9% | 43.4% | 46.2% |
| mimic\|TH5 | 101 | 64.4% | 54.6%-73.0% | 69.1% | 33.2% | 51.8% |
| mimic\|TH6 | 100 | 79.0% | 70.0%-85.8% | 75.6% | 19.3% | 68.4% |
| mimic\|TH7 | 99 | 56.6% | 46.7%-65.9% | 60.2% | 42.1% | 49.9% |
| necromancer\|TH7 | 99 | 44.4% | 35.0%-54.3% | 51.6% | 53.5% | 32.0% |
| pea_shooter\|TH5 | 101 | 51.5% | 41.9%-61.0% | 64.7% | 47.3% | 33.7% |
| pea_shooter\|TH6 | 100 | 47.0% | 37.5%-56.7% | 55.0% | 52.6% | 27.4% |
| pea_shooter\|TH7 | 99 | 47.5% | 37.9%-57.2% | 56.6% | 51.4% | 32.1% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 61.4% | 50.0% | 26.4% |
| archer\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.6% | 50.0% | 31.2% |
| archer\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 57.5% | 40.0% | 36.7% |
| archer\|compact-core | 18 | 44.4% | 24.6%-66.3% | 60.8% | 55.3% | 23.2% |
| archer\|corner-keep | 16 | 50.0% | 28.0%-72.0% | 60.9% | 49.7% | 26.4% |
| archer\|crossfire | 15 | 40.0% | 19.8%-64.3% | 53.9% | 60.0% | 24.6% |
| archer\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.6% | 38.9% | 30.2% |
| archer\|diamond | 15 | 46.7% | 24.8%-69.9% | 59.8% | 53.3% | 25.9% |
| archer\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 58.9% | 41.0% | 31.3% |
| archer\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 56.8% | 40.0% | 33.2% |
| archer\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 55.9% | 46.7% | 27.4% |
| archer\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 61.2% | 60.3% | 20.1% |
| archer\|rear-keep | 15 | 40.0% | 19.8%-64.3% | 53.9% | 60.0% | 26.5% |
| archer\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 60.4% | 55.6% | 19.8% |
| archer\|southern-funnel | 18 | 44.4% | 24.6%-66.3% | 51.9% | 55.6% | 23.3% |
| archer\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.2% | 42.7% | 34.4% |
| archer\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 59.8% | 44.4% | 29.4% |
| archer\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 64.2% | 33.3% | 28.6% |
| demon_king\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 65.7% | 43.5% | 41.4% |
| demon_king\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 68.0% | 44.2% | 46.3% |
| demon_king\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 72.5% | 20.0% | 63.0% |
| demon_king\|compact-core | 18 | 44.4% | 24.6%-66.3% | 59.1% | 53.8% | 36.4% |
| demon_king\|corner-keep | 16 | 68.8% | 44.4%-85.8% | 66.5% | 31.3% | 46.5% |
| demon_king\|crossfire | 15 | 73.3% | 48.0%-89.1% | 67.3% | 25.8% | 54.8% |
| demon_king\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 71.2% | 32.3% | 54.3% |
| demon_king\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.8% | 34.4% | 52.6% |
| demon_king\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 67.3% | 40.0% | 52.6% |
| demon_king\|echelon-right | 15 | 66.7% | 41.7%-84.8% | 66.4% | 33.3% | 57.0% |
| demon_king\|kill-corridor | 15 | 73.3% | 48.0%-89.1% | 70.0% | 24.6% | 61.5% |
| demon_king\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 68.0% | 38.6% | 43.2% |
| demon_king\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 69.3% | 32.4% | 53.3% |
| demon_king\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 65.7% | 49.3% | 43.8% |
| demon_king\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 69.9% | 32.9% | 58.0% |
| demon_king\|split-core | 17 | 64.7% | 41.3%-82.7% | 68.4% | 35.3% | 57.5% |
| demon_king\|trap-lanes | 18 | 72.2% | 49.1%-87.5% | 67.0% | 26.0% | 58.6% |
| demon_king\|wide-spread | 18 | 72.2% | 49.1%-87.5% | 77.1% | 23.6% | 61.7% |
| fire_dragon\|asymmetric-left | 18 | 50.0% | 29.0%-71.0% | 62.9% | 50.0% | 45.8% |
| fire_dragon\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 63.8% | 49.6% | 44.4% |
| fire_dragon\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 70.9% | 33.3% | 63.3% |
| fire_dragon\|compact-core | 18 | 50.0% | 29.0%-71.0% | 60.6% | 50.0% | 38.9% |
| fire_dragon\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 64.7% | 37.8% | 45.3% |
| fire_dragon\|crossfire | 15 | 66.7% | 41.7%-84.8% | 68.9% | 33.3% | 51.7% |
| fire_dragon\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 72.2% | 33.3% | 51.4% |
| fire_dragon\|diamond | 15 | 60.0% | 35.7%-80.2% | 69.3% | 40.0% | 56.7% |
| fire_dragon\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 65.2% | 40.0% | 53.3% |
| fire_dragon\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 64.1% | 40.0% | 53.3% |
| fire_dragon\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 67.3% | 42.1% | 46.7% |
| fire_dragon\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 63.4% | 50.0% | 45.8% |
| fire_dragon\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 64.3% | 38.2% | 48.3% |
| fire_dragon\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 62.3% | 50.0% | 43.1% |
| fire_dragon\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 69.5% | 33.3% | 59.7% |
| fire_dragon\|split-core | 17 | 52.9% | 31.0%-73.8% | 64.8% | 44.7% | 45.6% |
| fire_dragon\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 68.8% | 32.2% | 56.9% |
| fire_dragon\|wide-spread | 18 | 83.3% | 60.8%-94.2% | 73.1% | 16.7% | 61.1% |
| knight\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 63.8% | 56.4% | 28.1% |
| knight\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 66.7% | 48.1% | 37.9% |
| knight\|cannon-screen | 15 | 66.7% | 41.7%-84.8% | 65.0% | 33.3% | 49.5% |
| knight\|compact-core | 18 | 55.6% | 33.7%-75.4% | 60.0% | 44.4% | 30.5% |
| knight\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 63.0% | 29.8% | 41.4% |
| knight\|crossfire | 15 | 60.0% | 35.7%-80.2% | 61.1% | 34.7% | 35.7% |
| knight\|defense-ring | 18 | 66.7% | 43.7%-83.7% | 66.7% | 27.7% | 41.6% |
| knight\|diamond | 15 | 60.0% | 35.7%-80.2% | 64.5% | 40.1% | 37.0% |
| knight\|echelon-left | 15 | 60.0% | 35.7%-80.2% | 64.5% | 38.3% | 42.5% |
| knight\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 59.5% | 39.6% | 41.0% |
| knight\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 64.3% | 46.6% | 41.6% |
| knight\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 62.7% | 52.2% | 29.0% |
| knight\|rear-keep | 15 | 60.0% | 35.7%-80.2% | 61.6% | 40.0% | 38.5% |
| knight\|resource-shield | 18 | 44.4% | 24.6%-66.3% | 58.1% | 51.8% | 30.6% |
| knight\|southern-funnel | 18 | 66.7% | 43.7%-83.7% | 63.8% | 33.3% | 40.5% |
| knight\|split-core | 17 | 58.8% | 36.0%-78.4% | 63.2% | 40.3% | 43.3% |
| knight\|trap-lanes | 18 | 66.7% | 43.7%-83.7% | 67.0% | 33.3% | 45.7% |
| knight\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 70.3% | 31.0% | 44.1% |
| mage\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 56.6% | 61.1% | 27.8% |
| mage\|asymmetric-right | 18 | 50.0% | 29.0%-71.0% | 58.7% | 50.0% | 28.3% |
| mage\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 59.8% | 40.0% | 38.8% |
| mage\|compact-core | 18 | 38.9% | 20.3%-61.4% | 55.9% | 61.1% | 23.7% |
| mage\|corner-keep | 16 | 43.8% | 23.1%-66.8% | 55.3% | 53.6% | 23.3% |
| mage\|crossfire | 15 | 40.0% | 19.8%-64.3% | 51.8% | 60.0% | 28.5% |
| mage\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 63.3% | 46.3% | 25.3% |
| mage\|diamond | 15 | 40.0% | 19.8%-64.3% | 55.7% | 56.5% | 24.8% |
| mage\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 53.2% | 46.7% | 28.5% |
| mage\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 55.5% | 40.0% | 33.3% |
| mage\|kill-corridor | 15 | 53.3% | 30.1%-75.2% | 54.1% | 46.7% | 28.5% |
| mage\|layered-rings | 18 | 38.9% | 20.3%-61.4% | 57.4% | 56.3% | 22.2% |
| mage\|rear-keep | 15 | 33.3% | 15.2%-58.3% | 50.9% | 66.7% | 24.8% |
| mage\|resource-shield | 18 | 38.9% | 20.3%-61.4% | 53.8% | 61.1% | 19.2% |
| mage\|southern-funnel | 18 | 33.3% | 16.3%-56.3% | 47.5% | 66.7% | 24.2% |
| mage\|split-core | 17 | 58.8% | 36.0%-78.4% | 61.2% | 41.2% | 31.6% |
| mage\|trap-lanes | 18 | 44.4% | 24.6%-66.3% | 54.4% | 55.6% | 29.8% |
| mage\|wide-spread | 18 | 55.6% | 33.7%-75.4% | 65.0% | 43.3% | 31.3% |
| mechanical_dragon\|asymmetric-left | 12 | 50.0% | 25.4%-74.6% | 64.4% | 50.0% | 42.4% |
| mechanical_dragon\|asymmetric-right | 12 | 50.0% | 25.4%-74.6% | 63.6% | 50.0% | 41.7% |
| mechanical_dragon\|cannon-screen | 10 | 60.0% | 31.3%-83.2% | 69.7% | 40.0% | 52.7% |
| mechanical_dragon\|compact-core | 12 | 41.7% | 19.3%-68.0% | 57.5% | 51.5% | 32.6% |
| mechanical_dragon\|corner-keep | 10 | 60.0% | 31.3%-83.2% | 65.3% | 39.5% | 43.6% |
| mechanical_dragon\|crossfire | 10 | 60.0% | 31.3%-83.2% | 64.0% | 39.8% | 47.3% |
| mechanical_dragon\|defense-ring | 12 | 66.7% | 39.1%-86.2% | 70.3% | 33.1% | 48.5% |
| mechanical_dragon\|diamond | 10 | 60.0% | 31.3%-83.2% | 69.0% | 40.0% | 50.9% |
| mechanical_dragon\|echelon-left | 10 | 60.0% | 31.3%-83.2% | 65.0% | 37.7% | 47.3% |
| mechanical_dragon\|echelon-right | 10 | 60.0% | 31.3%-83.2% | 65.7% | 40.0% | 53.6% |
| mechanical_dragon\|kill-corridor | 10 | 70.0% | 39.7%-89.2% | 75.7% | 30.0% | 58.2% |
| mechanical_dragon\|layered-rings | 12 | 50.0% | 25.4%-74.6% | 64.7% | 50.0% | 38.6% |
| mechanical_dragon\|rear-keep | 10 | 60.0% | 31.3%-83.2% | 66.3% | 40.0% | 51.8% |
| mechanical_dragon\|resource-shield | 12 | 50.0% | 25.4%-74.6% | 61.9% | 50.0% | 37.9% |
| mechanical_dragon\|southern-funnel | 12 | 50.0% | 25.4%-74.6% | 59.4% | 49.5% | 34.8% |
| mechanical_dragon\|split-core | 11 | 63.6% | 35.4%-84.8% | 64.4% | 36.4% | 48.8% |
| mechanical_dragon\|trap-lanes | 12 | 58.3% | 32.0%-80.7% | 65.6% | 40.9% | 45.5% |
| mechanical_dragon\|wide-spread | 12 | 66.7% | 39.1%-86.2% | 75.8% | 33.3% | 55.3% |
| mimic\|asymmetric-left | 18 | 55.6% | 33.7%-75.4% | 71.0% | 42.3% | 43.7% |
| mimic\|asymmetric-right | 18 | 55.6% | 33.7%-75.4% | 68.6% | 41.0% | 49.2% |
| mimic\|cannon-screen | 15 | 80.0% | 54.8%-93.0% | 74.8% | 20.0% | 70.5% |
| mimic\|compact-core | 18 | 50.0% | 29.0%-71.0% | 59.5% | 47.0% | 42.1% |
| mimic\|corner-keep | 16 | 62.5% | 38.6%-81.5% | 68.8% | 37.5% | 57.1% |
| mimic\|crossfire | 15 | 73.3% | 48.0%-89.1% | 68.0% | 26.7% | 62.9% |
| mimic\|defense-ring | 18 | 61.1% | 38.6%-79.7% | 68.9% | 33.3% | 48.4% |
| mimic\|diamond | 15 | 66.7% | 41.7%-84.8% | 69.5% | 33.3% | 57.1% |
| mimic\|echelon-left | 15 | 80.0% | 54.8%-93.0% | 66.4% | 20.0% | 64.8% |
| mimic\|echelon-right | 15 | 80.0% | 54.8%-93.0% | 68.4% | 20.0% | 63.8% |
| mimic\|kill-corridor | 15 | 80.0% | 54.8%-93.0% | 70.0% | 20.0% | 61.0% |
| mimic\|layered-rings | 18 | 50.0% | 29.0%-71.0% | 65.2% | 42.4% | 39.7% |
| mimic\|rear-keep | 15 | 66.7% | 41.7%-84.8% | 68.0% | 32.7% | 61.0% |
| mimic\|resource-shield | 18 | 50.0% | 29.0%-71.0% | 61.9% | 47.4% | 48.4% |
| mimic\|southern-funnel | 18 | 72.2% | 49.1%-87.5% | 71.0% | 24.9% | 69.0% |
| mimic\|split-core | 17 | 70.6% | 46.9%-86.7% | 60.6% | 28.8% | 60.5% |
| mimic\|trap-lanes | 18 | 77.8% | 54.8%-91.0% | 71.4% | 22.3% | 62.7% |
| mimic\|wide-spread | 18 | 77.8% | 54.8%-91.0% | 75.6% | 20.6% | 66.7% |
| necromancer\|asymmetric-left | 6 | 33.3% | 9.7%-70.0% | 48.4% | 66.7% | 33.3% |
| necromancer\|asymmetric-right | 6 | 33.3% | 9.7%-70.0% | 43.5% | 66.7% | 27.8% |
| necromancer\|compact-core | 6 | 33.3% | 9.7%-70.0% | 47.3% | 66.7% | 27.8% |
| necromancer\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 57.0% | 33.3% | 38.9% |
| necromancer\|layered-rings | 6 | 33.3% | 9.7%-70.0% | 51.6% | 56.0% | 16.7% |
| necromancer\|resource-shield | 6 | 50.0% | 18.8%-81.2% | 44.6% | 50.0% | 27.8% |
| necromancer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 43.5% | 83.3% | 11.1% |
| necromancer\|trap-lanes | 6 | 33.3% | 9.7%-70.0% | 53.8% | 66.7% | 33.3% |
| necromancer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 65.1% | 33.3% | 55.6% |
| pea_shooter\|asymmetric-left | 18 | 38.9% | 20.3%-61.4% | 55.7% | 61.1% | 23.5% |
| pea_shooter\|asymmetric-right | 18 | 44.4% | 24.6%-66.3% | 57.2% | 55.0% | 30.2% |
| pea_shooter\|cannon-screen | 15 | 60.0% | 35.7%-80.2% | 57.0% | 40.0% | 35.6% |
| pea_shooter\|compact-core | 18 | 33.3% | 16.3%-56.3% | 54.4% | 66.3% | 24.7% |
| pea_shooter\|corner-keep | 16 | 37.5% | 18.5%-61.4% | 53.4% | 56.6% | 20.1% |
| pea_shooter\|crossfire | 15 | 46.7% | 24.8%-69.9% | 53.0% | 53.3% | 28.1% |
| pea_shooter\|defense-ring | 18 | 50.0% | 29.0%-71.0% | 65.7% | 48.4% | 28.4% |
| pea_shooter\|diamond | 15 | 53.3% | 30.1%-75.2% | 62.7% | 44.8% | 33.3% |
| pea_shooter\|echelon-left | 15 | 53.3% | 30.1%-75.2% | 55.9% | 46.7% | 37.0% |
| pea_shooter\|echelon-right | 15 | 60.0% | 35.7%-80.2% | 60.0% | 40.0% | 35.6% |
| pea_shooter\|kill-corridor | 15 | 46.7% | 24.8%-69.9% | 53.0% | 53.2% | 34.8% |
| pea_shooter\|layered-rings | 18 | 44.4% | 24.6%-66.3% | 58.1% | 54.7% | 27.8% |
| pea_shooter\|rear-keep | 15 | 53.3% | 30.1%-75.2% | 60.2% | 46.7% | 33.3% |
| pea_shooter\|resource-shield | 18 | 27.8% | 12.5%-50.9% | 50.8% | 67.1% | 19.8% |
| pea_shooter\|southern-funnel | 18 | 55.6% | 33.7%-75.4% | 58.0% | 44.4% | 37.0% |
| pea_shooter\|split-core | 17 | 52.9% | 31.0%-73.8% | 63.8% | 47.1% | 36.6% |
| pea_shooter\|trap-lanes | 18 | 55.6% | 33.7%-75.4% | 63.4% | 44.4% | 36.4% |
| pea_shooter\|wide-spread | 18 | 66.7% | 43.7%-83.7% | 72.2% | 33.3% | 39.5% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-kill-corridor-054 | 7 | kill-corridor | maxed | 36 | 0.0% | 94.8% |
| th7-crossfire-261 | 7 | crossfire | rushed-defense | 36 | 0.0% | 94.7% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 36 | 0.0% | 93.4% |
| th7-resource-shield-126 | 7 | resource-shield | rushed-defense | 36 | 0.0% | 92.9% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 36 | 0.0% | 91.9% |
| th7-diamond-036 | 7 | diamond | maxed | 35 | 0.0% | 96.4% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 35 | 0.0% | 94.4% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 35 | 0.0% | 93.9% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 35 | 0.0% | 92.8% |
| th7-layered-rings-279 | 7 | layered-rings | rushed-defense | 35 | 0.0% | 91.5% |
| th7-diamond-144 | 7 | diamond | rushed-defense | 35 | 2.9% | 92.5% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 18 | 0.0% | 97.4% |
| th6-split-core-119 | 6 | split-core | maxed | 18 | 0.0% | 95.8% |
| th6-resource-shield-125 | 6 | resource-shield | rushed-defense | 18 | 0.0% | 93.4% |
| th6-compact-core-272 | 6 | compact-core | maxed | 18 | 0.0% | 92.6% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH5 has 58.1% attacker wins across 869 samples; authored target is 53.0%-57.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 57.9% attacker wins across 864 samples; authored target is 53.0%-57.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.6% is outside 55.0% +/- 2.0% across 2602 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-184 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-151 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-142 has 0 attacker wins across 15 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-286 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 18 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 16 controlled/policy-exploration samples.
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
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-261 has 0 attacker wins across 36 controlled/policy-exploration samples.
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
- 153 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
