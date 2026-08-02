# Clash Full-Game Balance Lab

**Generated:** 2026-08-02T23:15:14.630Z
**Seed:** 8035
**Town Halls:** TH7, TH8, TH9
**Unique generated bases:** 180
**Unique attack policies:** 300
**Capacity-filled core army templates:** 40
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 1786
**Unbeaten non-adaptive bases (n >= 6):** 0
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 0 battles; 0 bases x 15 selected same-TH compositions x 0 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x, L8=1x, L9=1x
**Lab late-tier troop scales:** none
**Lab troop slot costs:** canonical
**Lab defense damage scale:** 1x
**Lab targetable building HP scale:** 1x from L1
**Lab L5+ defense/guard scale:** 1x
**Lab L5+ defense damage-only scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Lab Mimic concealment ends on first attack:** no
**Lab Mimic trap damage scale while immune:** 0x
**Imported base HP normalized to current definitions:** no
**Balance replay simulations:** 2250
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45, TH8=45, TH9=45, TH10=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 108.5s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The base-counter response matrix fixes common rarity, Ward 0, maxed same-TH levels, and paired deployment contexts across 15 capacity-filled representative pure/mixed compositions per base. It ranks compositions by win, destruction, Town Hall damage, and survival, then replays the locked top-two and the strongest universal family on guaranteed distinct contexts. These battles are excluded from population win rate and do not replace the broader adaptive breakability search.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: air_bomb, altar, archer_tower, barn, cannon, flamethrower, harpoon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 16/16
- Troop simulation coverage: 11/11
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH7=100/100, TH8=100/100, TH9=100/100
- Bases exercised: 180/180

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 2250 | 1449 | 64.4% | 0 | 26.3s | 63.9% | 33.8% | 44.9% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 758 | 601 | 79.3% | 0 | 25.4s | 74.6% | 18.6% |
| TH8->TH8 | 755 | 413 | 54.7% | 0 | 25.6s | 59.4% | 43.7% |
| TH9->TH9 | 737 | 435 | 59.0% | 0 | 27.8s | 59.4% | 39.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-spread | 150 | 112 | 74.7% | 0 | 27.0s | 72.4% | 23.9% |
| asymmetric-right | 143 | 83 | 58.0% | 0 | 25.3s | 60.4% | 40.2% |
| resource-shield | 142 | 75 | 52.8% | 0 | 25.7s | 58.1% | 43.2% |
| trap-lanes | 142 | 96 | 67.6% | 0 | 27.1s | 64.4% | 31.1% |
| layered-rings | 135 | 75 | 55.6% | 0 | 25.5s | 59.1% | 41.1% |
| defense-ring | 134 | 98 | 73.1% | 0 | 26.5s | 67.9% | 26.5% |
| asymmetric-left | 133 | 74 | 55.6% | 0 | 25.2s | 57.3% | 41.5% |
| diamond | 126 | 72 | 57.1% | 0 | 27.0s | 62.5% | 39.0% |
| rear-keep | 126 | 89 | 70.6% | 0 | 26.6s | 67.2% | 28.4% |
| compact-core | 124 | 71 | 57.3% | 0 | 26.3s | 60.2% | 41.2% |
| southern-funnel | 118 | 77 | 65.3% | 0 | 25.4s | 65.4% | 34.7% |
| cannon-screen | 115 | 93 | 80.9% | 0 | 27.4s | 71.1% | 18.3% |
| echelon-right | 114 | 77 | 67.5% | 0 | 27.7s | 65.8% | 31.3% |
| crossfire | 113 | 77 | 68.1% | 0 | 28.7s | 67.0% | 30.5% |
| echelon-left | 113 | 75 | 66.4% | 0 | 26.4s | 62.9% | 33.2% |
| split-core | 112 | 83 | 74.1% | 0 | 25.6s | 69.2% | 23.8% |
| corner-keep | 107 | 70 | 65.4% | 0 | 25.8s | 66.0% | 32.6% |
| kill-corridor | 103 | 52 | 50.5% | 0 | 23.3s | 54.6% | 46.3% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right\|TH8 | 56 | 33 | 58.9% | 0 | 25.4s | 60.3% | 40.1% |
| trap-lanes\|TH9 | 56 | 38 | 67.9% | 0 | 30.9s | 64.9% | 32.0% |
| resource-shield\|TH8 | 55 | 25 | 45.5% | 0 | 26.4s | 54.2% | 51.8% |
| wide-spread\|TH9 | 55 | 39 | 70.9% | 0 | 28.3s | 69.1% | 26.8% |
| layered-rings\|TH8 | 51 | 23 | 45.1% | 0 | 25.0s | 54.8% | 54.6% |
| wide-spread\|TH8 | 50 | 33 | 66.0% | 0 | 27.2s | 70.8% | 32.8% |
| defense-ring\|TH8 | 48 | 33 | 68.8% | 0 | 27.1s | 65.8% | 30.6% |
| corner-keep\|TH7 | 47 | 30 | 63.8% | 0 | 23.1s | 66.8% | 33.2% |
| asymmetric-left\|TH7 | 46 | 33 | 71.7% | 0 | 26.5s | 70.8% | 25.5% |
| asymmetric-right\|TH7 | 46 | 33 | 71.7% | 0 | 25.8s | 74.8% | 25.5% |
| diamond\|TH7 | 46 | 29 | 63.0% | 0 | 25.6s | 66.9% | 30.6% |
| rear-keep\|TH7 | 46 | 42 | 91.3% | 0 | 23.9s | 79.6% | 8.3% |
| trap-lanes\|TH7 | 46 | 37 | 80.4% | 0 | 25.3s | 72.3% | 17.9% |
| asymmetric-left\|TH8 | 45 | 22 | 48.9% | 0 | 25.1s | 54.7% | 47.5% |
| compact-core\|TH7 | 45 | 36 | 80.0% | 0 | 24.9s | 75.4% | 19.3% |
| southern-funnel\|TH7 | 45 | 36 | 80.0% | 0 | 23.6s | 73.7% | 20.0% |
| southern-funnel\|TH8 | 45 | 25 | 55.6% | 0 | 24.2s | 61.5% | 44.3% |
| wide-spread\|TH7 | 45 | 40 | 88.9% | 0 | 25.2s | 79.5% | 10.5% |
| defense-ring\|TH7 | 44 | 38 | 86.4% | 0 | 26.3s | 79.8% | 13.5% |
| layered-rings\|TH7 | 44 | 34 | 77.3% | 0 | 26.7s | 74.0% | 15.3% |
| resource-shield\|TH7 | 44 | 31 | 70.5% | 0 | 25.0s | 70.7% | 22.4% |
| split-core\|TH7 | 44 | 38 | 86.4% | 0 | 24.8s | 77.2% | 11.6% |
| resource-shield\|TH9 | 43 | 19 | 44.2% | 0 | 25.5s | 52.4% | 53.6% |
| asymmetric-left\|TH9 | 42 | 19 | 45.2% | 0 | 24.0s | 48.0% | 52.6% |
| cannon-screen\|TH9 | 42 | 30 | 71.4% | 0 | 28.6s | 63.8% | 26.4% |
| crossfire\|TH9 | 42 | 26 | 61.9% | 0 | 29.2s | 62.8% | 37.4% |
| defense-ring\|TH9 | 42 | 27 | 64.3% | 0 | 26.1s | 60.0% | 35.5% |
| diamond\|TH9 | 42 | 27 | 64.3% | 0 | 30.3s | 64.4% | 32.8% |
| echelon-left\|TH9 | 42 | 25 | 59.5% | 0 | 25.5s | 59.8% | 40.5% |
| echelon-right\|TH9 | 42 | 28 | 66.7% | 0 | 32.2s | 61.5% | 31.9% |
| kill-corridor\|TH9 | 42 | 19 | 45.2% | 0 | 25.6s | 53.1% | 50.2% |
| rear-keep\|TH9 | 42 | 29 | 69.0% | 0 | 29.6s | 63.8% | 29.5% |
| asymmetric-right\|TH9 | 41 | 17 | 41.5% | 0 | 24.4s | 47.4% | 56.8% |
| compact-core\|TH9 | 41 | 18 | 43.9% | 0 | 27.7s | 53.0% | 54.1% |
| layered-rings\|TH9 | 40 | 18 | 45.0% | 0 | 24.8s | 51.0% | 52.0% |
| split-core\|TH8 | 40 | 23 | 57.5% | 0 | 23.9s | 59.9% | 41.3% |
| trap-lanes\|TH8 | 40 | 21 | 52.5% | 0 | 24.0s | 55.7% | 45.1% |
| cannon-screen\|TH8 | 38 | 31 | 81.6% | 0 | 29.1s | 72.8% | 18.2% |
| compact-core\|TH8 | 38 | 17 | 44.7% | 0 | 26.3s | 53.0% | 53.3% |
| diamond\|TH8 | 38 | 16 | 42.1% | 0 | 25.0s | 55.5% | 56.1% |
| echelon-right\|TH8 | 38 | 21 | 55.3% | 0 | 25.0s | 62.3% | 42.9% |
| rear-keep\|TH8 | 38 | 18 | 47.4% | 0 | 26.7s | 58.3% | 51.6% |
| crossfire\|TH8 | 37 | 22 | 59.5% | 0 | 26.5s | 64.0% | 38.2% |
| echelon-left\|TH8 | 37 | 23 | 62.2% | 0 | 26.6s | 57.0% | 36.8% |
| cannon-screen\|TH7 | 35 | 32 | 91.4% | 0 | 24.0s | 80.0% | 8.6% |
| crossfire\|TH7 | 34 | 29 | 85.3% | 0 | 30.4s | 77.0% | 13.6% |
| echelon-left\|TH7 | 34 | 27 | 79.4% | 0 | 27.3s | 75.0% | 20.4% |
| echelon-right\|TH7 | 34 | 28 | 82.4% | 0 | 25.3s | 76.8% | 17.6% |
| corner-keep\|TH8 | 33 | 22 | 66.7% | 0 | 27.1s | 68.4% | 31.4% |
| kill-corridor\|TH7 | 33 | 28 | 84.8% | 0 | 24.9s | 76.9% | 15.2% |
| kill-corridor\|TH8 | 28 | 5 | 17.9% | 0 | 17.9s | 34.0% | 77.0% |
| southern-funnel\|TH9 | 28 | 16 | 57.1% | 0 | 30.1s | 60.4% | 42.9% |
| split-core\|TH9 | 28 | 22 | 78.6% | 0 | 29.3s | 71.3% | 18.1% |
| corner-keep\|TH9 | 27 | 18 | 66.7% | 0 | 29.0s | 62.1% | 33.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mixed | 492 | 421 | 85.6% | 0 | 26.1s | 75.6% | 13.6% |
| rushed-defense | 476 | 189 | 39.7% | 0 | 22.7s | 51.5% | 57.2% |
| maxed | 471 | 135 | 28.7% | 0 | 25.6s | 43.6% | 68.1% |
| mid | 471 | 378 | 80.3% | 0 | 27.4s | 72.4% | 18.4% |
| rushed-economy | 340 | 326 | 95.9% | 0 | 30.8s | 81.3% | 3.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 1786 | 1266 | 70.9% | 0 | 27.3s | 71.1% | 27.8% |
| policy-exploration | 464 | 183 | 39.4% | 0 | 22.4s | 36.4% | 57.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 603 | 527 | 87.4% | 0 | 26.1s | 82.9% | 10.6% |
| pure-unit-matrix\|TH8 | 600 | 357 | 59.5% | 0 | 26.7s | 65.7% | 39.4% |
| pure-unit-matrix\|TH9 | 583 | 382 | 65.5% | 0 | 29.1s | 66.5% | 33.6% |
| policy-exploration\|TH7 | 155 | 74 | 47.7% | 0 | 22.6s | 42.4% | 49.6% |
| policy-exploration\|TH8 | 155 | 56 | 36.1% | 0 | 21.4s | 35.2% | 60.3% |
| policy-exploration\|TH9 | 154 | 53 | 34.4% | 0 | 23.1s | 32.6% | 60.9% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 259 | 94 | 36.3% | 0 | 21.5s | 34.6% | 59.9% |
| policy-exploration\|archer | 234 | 81 | 34.6% | 0 | 22.8s | 35.0% | 60.9% |
| policy-exploration\|demon_king | 180 | 70 | 38.9% | 0 | 22.0s | 36.3% | 57.3% |
| pure-unit-matrix\|archer | 180 | 132 | 73.3% | 0 | 24.7s | 73.6% | 26.6% |
| pure-unit-matrix\|demon_king | 180 | 159 | 88.3% | 0 | 27.8s | 82.0% | 8.7% |
| pure-unit-matrix\|fire_dragon | 180 | 180 | 100.0% | 0 | 14.4s | 87.1% | 0.0% |
| pure-unit-matrix\|knight | 180 | 122 | 67.8% | 0 | 27.6s | 67.3% | 31.4% |
| pure-unit-matrix\|mage | 180 | 130 | 72.2% | 0 | 19.6s | 76.2% | 25.7% |
| pure-unit-matrix\|mechanical_dragon | 180 | 142 | 78.9% | 0 | 28.1s | 78.5% | 20.2% |
| pure-unit-matrix\|mimic | 180 | 137 | 76.1% | 0 | 34.1s | 73.1% | 22.7% |
| pure-unit-matrix\|necromancer | 180 | 102 | 56.7% | 0 | 30.4s | 61.3% | 41.1% |
| pure-unit-matrix\|pea_shooter | 180 | 116 | 64.4% | 0 | 30.4s | 69.5% | 33.1% |
| policy-exploration\|fire_dragon | 177 | 81 | 45.8% | 0 | 20.6s | 42.0% | 50.1% |
| policy-exploration\|necromancer | 142 | 52 | 36.6% | 0 | 22.1s | 36.9% | 61.0% |
| policy-exploration\|mechanical_dragon | 141 | 54 | 38.3% | 0 | 23.2s | 38.1% | 58.7% |
| policy-exploration\|mage | 140 | 47 | 33.6% | 0 | 18.8s | 37.5% | 64.2% |
| policy-exploration\|mimic | 134 | 55 | 41.0% | 0 | 24.1s | 33.1% | 53.3% |
| pure-unit-matrix\|wind_mage | 113 | 29 | 25.7% | 0 | 27.9s | 43.1% | 73.2% |
| policy-exploration\|pea_shooter | 69 | 26 | 37.7% | 0 | 22.1s | 37.7% | 60.8% |
| pure-unit-matrix\|ice_golem | 53 | 17 | 32.1% | 0 | 54.8s | 40.7% | 67.9% |
| policy-exploration\|ice_golem | 39 | 9 | 23.1% | 0 | 25.9s | 28.3% | 70.1% |
| policy-exploration\|wind_mage | 37 | 7 | 18.9% | 0 | 21.9s | 22.5% | 80.1% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH8 | 96 | 33 | 34.4% | 0 | 21.0s | 34.0% | 61.4% |
| policy-exploration\|knight\|TH7 | 91 | 41 | 45.1% | 0 | 22.0s | 41.9% | 51.6% |
| policy-exploration\|archer\|TH7 | 87 | 36 | 41.4% | 0 | 22.5s | 41.6% | 56.3% |
| policy-exploration\|archer\|TH9 | 75 | 21 | 28.0% | 0 | 24.2s | 29.9% | 64.9% |
| policy-exploration\|archer\|TH8 | 72 | 24 | 33.3% | 0 | 21.7s | 33.8% | 62.2% |
| policy-exploration\|knight\|TH9 | 72 | 20 | 27.8% | 0 | 21.7s | 27.9% | 68.4% |
| policy-exploration\|demon_king\|TH7 | 71 | 34 | 47.9% | 0 | 21.5s | 40.2% | 49.4% |
| policy-exploration\|fire_dragon\|TH8 | 68 | 27 | 39.7% | 0 | 20.4s | 38.4% | 55.4% |
| pure-unit-matrix\|archer\|TH7 | 67 | 61 | 91.0% | 0 | 23.9s | 83.8% | 8.8% |
| pure-unit-matrix\|demon_king\|TH7 | 67 | 63 | 94.0% | 0 | 25.2s | 84.9% | 2.9% |
| pure-unit-matrix\|fire_dragon\|TH7 | 67 | 67 | 100.0% | 0 | 14.2s | 90.2% | 0.0% |
| pure-unit-matrix\|knight\|TH7 | 67 | 56 | 83.6% | 0 | 28.5s | 80.0% | 14.8% |
| pure-unit-matrix\|mage\|TH7 | 67 | 59 | 88.1% | 0 | 19.7s | 84.2% | 9.6% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 67 | 65 | 97.0% | 0 | 28.4s | 88.8% | 2.0% |
| pure-unit-matrix\|mimic\|TH7 | 67 | 57 | 85.1% | 0 | 31.3s | 78.7% | 13.6% |
| pure-unit-matrix\|necromancer\|TH7 | 67 | 47 | 70.1% | 0 | 32.4s | 73.2% | 25.5% |
| pure-unit-matrix\|pea_shooter\|TH7 | 67 | 52 | 77.6% | 0 | 31.4s | 82.4% | 18.2% |
| policy-exploration\|demon_king\|TH8 | 62 | 20 | 32.3% | 0 | 23.7s | 35.6% | 63.1% |
| policy-exploration\|mage\|TH8 | 60 | 20 | 33.3% | 0 | 18.6s | 39.6% | 65.5% |
| pure-unit-matrix\|archer\|TH8 | 60 | 36 | 60.0% | 0 | 24.4s | 67.2% | 39.9% |
| pure-unit-matrix\|demon_king\|TH8 | 60 | 47 | 78.3% | 0 | 29.5s | 77.9% | 18.6% |
| pure-unit-matrix\|fire_dragon\|TH8 | 60 | 60 | 100.0% | 0 | 15.2s | 86.4% | 0.0% |
| pure-unit-matrix\|knight\|TH8 | 60 | 32 | 53.3% | 0 | 27.6s | 57.5% | 46.0% |
| pure-unit-matrix\|mage\|TH8 | 60 | 34 | 56.7% | 0 | 19.2s | 71.2% | 41.8% |
| pure-unit-matrix\|mechanical_dragon\|TH8 | 60 | 42 | 70.0% | 0 | 29.2s | 73.8% | 29.1% |
| pure-unit-matrix\|mimic\|TH8 | 60 | 36 | 60.0% | 0 | 36.0s | 65.6% | 38.4% |
| pure-unit-matrix\|necromancer\|TH8 | 60 | 27 | 45.0% | 0 | 29.0s | 55.1% | 53.7% |
| pure-unit-matrix\|pea_shooter\|TH8 | 60 | 33 | 55.0% | 0 | 29.8s | 61.3% | 45.0% |
| pure-unit-matrix\|wind_mage\|TH8 | 60 | 10 | 16.7% | 0 | 26.9s | 40.9% | 81.4% |
| policy-exploration\|fire_dragon\|TH7 | 57 | 33 | 57.9% | 0 | 20.9s | 49.3% | 40.5% |
| policy-exploration\|necromancer\|TH7 | 57 | 26 | 45.6% | 0 | 24.5s | 44.1% | 53.6% |
| policy-exploration\|mechanical_dragon\|TH7 | 53 | 23 | 43.4% | 0 | 24.7s | 40.8% | 54.6% |
| pure-unit-matrix\|archer\|TH9 | 53 | 35 | 66.0% | 0 | 25.9s | 69.8% | 33.9% |
| pure-unit-matrix\|demon_king\|TH9 | 53 | 49 | 92.5% | 0 | 29.0s | 83.3% | 5.0% |
| pure-unit-matrix\|fire_dragon\|TH9 | 53 | 53 | 100.0% | 0 | 13.9s | 84.8% | 0.0% |
| pure-unit-matrix\|ice_golem\|TH9 | 53 | 17 | 32.1% | 0 | 54.8s | 40.7% | 67.9% |
| pure-unit-matrix\|knight\|TH9 | 53 | 34 | 64.2% | 0 | 26.4s | 64.7% | 35.7% |
| pure-unit-matrix\|mage\|TH9 | 53 | 37 | 69.8% | 0 | 19.9s | 73.3% | 28.0% |
| pure-unit-matrix\|mechanical_dragon\|TH9 | 53 | 35 | 66.0% | 0 | 26.5s | 72.9% | 33.0% |
| pure-unit-matrix\|mimic\|TH9 | 53 | 44 | 83.0% | 0 | 35.4s | 75.3% | 16.4% |
| pure-unit-matrix\|necromancer\|TH9 | 53 | 28 | 52.8% | 0 | 29.7s | 55.8% | 46.6% |
| pure-unit-matrix\|pea_shooter\|TH9 | 53 | 31 | 58.5% | 0 | 29.6s | 65.1% | 38.6% |
| pure-unit-matrix\|wind_mage\|TH9 | 53 | 19 | 35.8% | 0 | 28.9s | 45.4% | 63.8% |
| policy-exploration\|fire_dragon\|TH9 | 52 | 21 | 40.4% | 0 | 20.6s | 39.8% | 53.9% |
| policy-exploration\|mimic\|TH8 | 52 | 22 | 42.3% | 0 | 25.9s | 34.5% | 50.3% |
| policy-exploration\|mage\|TH7 | 50 | 18 | 36.0% | 0 | 19.8s | 39.9% | 61.5% |
| policy-exploration\|demon_king\|TH9 | 47 | 16 | 34.0% | 0 | 20.6s | 32.2% | 61.7% |
| policy-exploration\|mimic\|TH7 | 47 | 21 | 44.7% | 0 | 21.8s | 34.1% | 50.2% |
| policy-exploration\|necromancer\|TH9 | 47 | 14 | 29.8% | 0 | 20.7s | 31.8% | 65.4% |
| policy-exploration\|mechanical_dragon\|TH8 | 45 | 18 | 40.0% | 0 | 24.7s | 43.1% | 59.0% |
| policy-exploration\|mechanical_dragon\|TH9 | 43 | 13 | 30.2% | 0 | 19.8s | 30.6% | 63.3% |
| policy-exploration\|ice_golem\|TH9 | 39 | 9 | 23.1% | 0 | 25.9s | 28.3% | 70.1% |
| policy-exploration\|necromancer\|TH8 | 38 | 12 | 31.6% | 0 | 20.3s | 34.4% | 66.7% |
| policy-exploration\|pea_shooter\|TH7 | 36 | 16 | 44.4% | 0 | 22.9s | 41.8% | 54.7% |
| policy-exploration\|mimic\|TH9 | 35 | 12 | 34.3% | 0 | 24.6s | 30.0% | 62.0% |
| policy-exploration\|mage\|TH9 | 30 | 9 | 30.0% | 0 | 17.3s | 30.2% | 66.0% |
| policy-exploration\|wind_mage\|TH9 | 21 | 3 | 14.3% | 0 | 20.9s | 18.7% | 83.9% |
| policy-exploration\|pea_shooter\|TH9 | 19 | 4 | 21.1% | 0 | 17.5s | 24.4% | 75.6% |
| policy-exploration\|wind_mage\|TH8 | 16 | 4 | 25.0% | 0 | 23.1s | 27.8% | 75.0% |
| policy-exploration\|pea_shooter\|TH8 | 14 | 6 | 42.9% | 0 | 26.4s | 47.9% | 56.6% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 1786 | 1266 | 70.9% | 0 | 27.3s | 71.1% | 27.8% |
| policy-exploration\|none | 59 | 25 | 42.4% | 0 | 23.7s | 43.6% | 57.1% |
| policy-exploration\|cannon-medkit | 57 | 26 | 45.6% | 0 | 28.6s | 47.0% | 54.4% |
| policy-exploration\|cannon-rally | 57 | 15 | 26.3% | 0 | 14.5s | 5.3% | 64.4% |
| policy-exploration\|medkit-entry | 57 | 28 | 49.1% | 0 | 27.2s | 51.1% | 49.8% |
| policy-exploration\|freeze-defense | 54 | 22 | 40.7% | 0 | 25.4s | 46.2% | 57.8% |
| policy-exploration\|cannon-focus | 51 | 20 | 39.2% | 0 | 22.3s | 47.4% | 59.5% |
| policy-exploration\|rally-core | 49 | 15 | 30.6% | 0 | 14.0s | 6.8% | 59.2% |
| policy-exploration\|rage-entry | 29 | 13 | 44.8% | 0 | 26.6s | 50.5% | 54.4% |
| policy-exploration\|freeze-rage | 27 | 11 | 40.7% | 0 | 23.8s | 51.9% | 58.2% |
| policy-exploration\|rally-rage | 24 | 8 | 33.3% | 0 | 15.6s | 11.6% | 51.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 180 | 119 | 66.1% | 0 | 27.6s | 71.1% | 33.2% |
| pure-unit-matrix\|diamond | 180 | 117 | 65.0% | 0 | 27.4s | 68.4% | 34.6% |
| pure-unit-matrix\|dual-flank | 180 | 126 | 70.0% | 0 | 24.8s | 73.2% | 29.8% |
| pure-unit-matrix\|left-flank | 180 | 145 | 80.6% | 0 | 27.2s | 70.5% | 17.9% |
| pure-unit-matrix\|right-flank | 180 | 129 | 71.7% | 0 | 26.2s | 67.9% | 26.7% |
| pure-unit-matrix\|three-lane | 180 | 133 | 73.9% | 0 | 24.6s | 74.7% | 25.3% |
| pure-unit-matrix\|vanguard-wedge | 180 | 121 | 67.2% | 0 | 28.4s | 68.8% | 31.0% |
| pure-unit-matrix\|wide-line | 180 | 137 | 76.1% | 0 | 29.1s | 74.4% | 23.0% |
| pure-unit-matrix\|inverted-wedge | 176 | 113 | 64.2% | 0 | 28.7s | 68.3% | 32.4% |
| pure-unit-matrix\|edge-sweep | 170 | 126 | 74.1% | 0 | 29.0s | 74.0% | 23.4% |
| policy-exploration\|center-column | 48 | 13 | 27.1% | 0 | 15.9s | 25.4% | 67.3% |
| policy-exploration\|vanguard-wedge | 48 | 22 | 45.8% | 0 | 27.5s | 43.2% | 46.4% |
| policy-exploration\|inverted-wedge | 47 | 22 | 46.8% | 0 | 22.7s | 37.9% | 50.0% |
| policy-exploration\|right-flank | 47 | 21 | 44.7% | 0 | 25.8s | 47.8% | 52.6% |
| policy-exploration\|wide-line | 47 | 18 | 38.3% | 0 | 22.8s | 38.5% | 58.5% |
| policy-exploration\|diamond | 46 | 18 | 39.1% | 0 | 23.0s | 37.3% | 59.7% |
| policy-exploration\|edge-sweep | 46 | 17 | 37.0% | 0 | 21.0s | 34.3% | 58.7% |
| policy-exploration\|left-flank | 46 | 21 | 45.7% | 0 | 20.1s | 30.7% | 52.3% |
| policy-exploration\|three-lane | 45 | 15 | 33.3% | 0 | 20.6s | 30.9% | 64.0% |
| policy-exploration\|dual-flank | 44 | 16 | 36.4% | 0 | 24.4s | 37.6% | 60.6% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 358 | 256 | 71.5% | 0 | 26.1s | 70.1% | 27.3% |
| pure-unit-matrix\|rapid | 358 | 250 | 69.8% | 0 | 26.6s | 71.3% | 29.2% |
| pure-unit-matrix\|two-waves | 358 | 252 | 70.4% | 0 | 26.9s | 70.6% | 28.5% |
| pure-unit-matrix\|drip | 356 | 259 | 72.8% | 0 | 29.5s | 73.1% | 25.2% |
| pure-unit-matrix\|three-waves | 356 | 249 | 69.9% | 0 | 27.2s | 70.5% | 28.5% |
| policy-exploration\|burst | 96 | 39 | 40.6% | 0 | 19.7s | 39.1% | 57.1% |
| policy-exploration\|drip | 94 | 38 | 40.4% | 0 | 25.6s | 41.4% | 55.8% |
| policy-exploration\|three-waves | 92 | 36 | 39.1% | 0 | 25.7s | 39.7% | 59.1% |
| policy-exploration\|rapid | 91 | 32 | 35.2% | 0 | 20.1s | 29.5% | 59.4% |
| policy-exploration\|two-waves | 91 | 38 | 41.8% | 0 | 20.8s | 31.9% | 53.4% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 893 | 628 | 70.3% | 0 | 27.0s | 71.2% | 28.1% |
| pure-unit-matrix\|tank-front-support-rear | 893 | 638 | 71.4% | 0 | 27.5s | 71.0% | 27.5% |
| policy-exploration\|roster-order | 232 | 93 | 40.1% | 0 | 21.8s | 36.1% | 56.6% |
| policy-exploration\|tank-front-support-rear | 232 | 90 | 38.8% | 0 | 23.0s | 36.7% | 57.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mimic | 208 | 152 | 73.1% | 0 | 33.1s | 67.4% | 25.3% |
| pure-mechanical_dragon | 207 | 154 | 74.4% | 0 | 28.1s | 74.0% | 24.4% |
| pure-mage | 200 | 136 | 68.0% | 0 | 19.1s | 72.3% | 30.2% |
| pure-fire_dragon | 196 | 189 | 96.4% | 0 | 14.4s | 83.5% | 3.4% |
| pure-knight | 196 | 125 | 63.8% | 0 | 26.9s | 63.6% | 35.2% |
| pure-archer | 194 | 136 | 70.1% | 0 | 25.1s | 70.9% | 29.2% |
| pure-demon_king | 193 | 166 | 86.0% | 0 | 27.1s | 79.2% | 11.2% |
| pure-necromancer | 190 | 108 | 56.8% | 0 | 30.4s | 61.1% | 41.0% |
| pure-pea_shooter | 189 | 120 | 63.5% | 0 | 30.1s | 68.5% | 34.1% |
| pure-wind_mage | 119 | 30 | 25.2% | 0 | 27.7s | 41.8% | 73.7% |
| pure-ice_golem | 59 | 19 | 32.2% | 0 | 53.1s | 39.5% | 66.2% |
| trap-runner-mix | 27 | 8 | 29.6% | 0 | 22.2s | 28.6% | 59.5% |
| random-1 | 25 | 9 | 36.0% | 0 | 22.6s | 39.6% | 63.3% |
| hero-necro-dragon-mages | 23 | 10 | 43.5% | 0 | 17.8s | 40.8% | 53.7% |
| ranged-pressure | 21 | 8 | 38.1% | 0 | 22.2s | 41.2% | 58.1% |
| core-mage-filled | 20 | 4 | 20.0% | 0 | 13.7s | 33.6% | 76.1% |
| air-pressure | 19 | 12 | 63.2% | 0 | 22.0s | 50.3% | 33.6% |
| support-mix | 19 | 5 | 26.3% | 0 | 26.8s | 29.7% | 72.5% |
| random-2 | 18 | 5 | 27.8% | 0 | 23.2s | 32.7% | 72.2% |
| core-fire_dragon-filled | 16 | 10 | 62.5% | 0 | 14.5s | 47.2% | 37.0% |
| core-mimic-filled | 16 | 9 | 56.3% | 0 | 29.4s | 32.8% | 35.5% |
| core-necromancer-filled | 12 | 4 | 33.3% | 0 | 23.0s | 32.0% | 61.9% |
| melee-pressure | 12 | 5 | 41.7% | 0 | 27.6s | 31.9% | 50.9% |
| balanced | 10 | 4 | 40.0% | 0 | 19.0s | 37.0% | 57.6% |
| random-4 | 10 | 3 | 30.0% | 0 | 22.7s | 30.4% | 63.9% |
| random-5 | 10 | 6 | 60.0% | 0 | 25.1s | 50.6% | 34.6% |
| core-demon_king-filled | 9 | 4 | 44.4% | 0 | 21.2s | 33.2% | 55.9% |
| frontline-ranged | 9 | 4 | 44.4% | 0 | 20.2s | 49.2% | 47.9% |
| random-6 | 8 | 2 | 25.0% | 0 | 18.7s | 25.6% | 70.3% |
| random-3 | 7 | 1 | 14.3% | 0 | 12.2s | 21.7% | 85.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__drip__tank-front-support-rear | 24 | 17 | 70.8% | 0 | 27.5s | 70.0% | 27.9% |
| center-column__rapid__roster-order | 24 | 13 | 54.2% | 0 | 24.2s | 52.9% | 44.8% |
| center-column__two-waves__roster-order | 24 | 12 | 50.0% | 0 | 24.4s | 57.7% | 50.0% |
| diamond__burst__tank-front-support-rear | 24 | 14 | 58.3% | 0 | 24.2s | 58.6% | 40.7% |
| diamond__three-waves__tank-front-support-rear | 24 | 11 | 45.8% | 0 | 28.8s | 54.6% | 53.9% |
| diamond__two-waves__tank-front-support-rear | 24 | 9 | 37.5% | 0 | 21.8s | 49.2% | 62.5% |
| dual-flank__drip__tank-front-support-rear | 24 | 15 | 62.5% | 0 | 26.6s | 61.8% | 37.5% |
| inverted-wedge__rapid__roster-order | 24 | 15 | 62.5% | 0 | 27.4s | 64.2% | 33.7% |
| left-flank__rapid__tank-front-support-rear | 24 | 13 | 54.2% | 0 | 24.3s | 48.8% | 44.8% |
| right-flank__rapid__tank-front-support-rear | 24 | 12 | 50.0% | 0 | 25.7s | 57.6% | 47.6% |
| right-flank__two-waves__tank-front-support-rear | 24 | 14 | 58.3% | 0 | 26.0s | 61.0% | 39.3% |
| three-lane__burst__tank-front-support-rear | 24 | 16 | 66.7% | 0 | 21.1s | 66.2% | 32.5% |
| vanguard-wedge__burst__roster-order | 24 | 12 | 50.0% | 0 | 22.1s | 52.1% | 50.0% |
| vanguard-wedge__rapid__roster-order | 24 | 13 | 54.2% | 0 | 25.3s | 59.5% | 45.8% |
| wide-line__rapid__roster-order | 24 | 15 | 62.5% | 0 | 25.0s | 61.4% | 34.7% |
| center-column__burst__roster-order | 23 | 11 | 47.8% | 0 | 24.6s | 56.5% | 47.1% |
| center-column__drip__roster-order | 23 | 12 | 52.2% | 0 | 23.7s | 56.8% | 46.1% |
| center-column__three-waves__roster-order | 23 | 14 | 60.9% | 0 | 23.2s | 62.6% | 39.1% |
| center-column__three-waves__tank-front-support-rear | 23 | 13 | 56.5% | 0 | 26.3s | 62.8% | 40.9% |
| diamond__burst__roster-order | 23 | 11 | 47.8% | 0 | 23.1s | 59.4% | 50.7% |
| diamond__rapid__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 29.8s | 65.5% | 39.1% |
| dual-flank__burst__roster-order | 23 | 17 | 73.9% | 0 | 22.7s | 73.7% | 24.6% |
| dual-flank__three-waves__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 24.0s | 65.2% | 39.1% |
| dual-flank__two-waves__roster-order | 23 | 14 | 60.9% | 0 | 22.0s | 62.6% | 37.5% |
| dual-flank__two-waves__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 24.2s | 62.8% | 36.1% |
| edge-sweep__drip__roster-order | 23 | 18 | 78.3% | 0 | 34.6s | 74.6% | 20.4% |
| edge-sweep__three-waves__roster-order | 23 | 11 | 47.8% | 0 | 24.3s | 53.2% | 49.3% |
| inverted-wedge__burst__roster-order | 23 | 15 | 65.2% | 0 | 25.6s | 59.4% | 35.0% |
| inverted-wedge__burst__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 25.6s | 62.7% | 34.8% |
| inverted-wedge__drip__roster-order | 23 | 14 | 60.9% | 0 | 28.8s | 67.8% | 29.3% |
| inverted-wedge__three-waves__roster-order | 23 | 14 | 60.9% | 0 | 28.6s | 64.6% | 35.0% |
| inverted-wedge__two-waves__roster-order | 23 | 13 | 56.5% | 0 | 29.4s | 57.4% | 39.9% |
| left-flank__burst__tank-front-support-rear | 23 | 13 | 56.5% | 0 | 26.2s | 55.3% | 38.0% |
| left-flank__drip__roster-order | 23 | 14 | 60.9% | 0 | 28.0s | 66.2% | 32.6% |
| left-flank__drip__tank-front-support-rear | 23 | 20 | 87.0% | 0 | 28.0s | 70.3% | 13.0% |
| left-flank__two-waves__roster-order | 23 | 21 | 91.3% | 0 | 26.8s | 68.1% | 6.5% |
| right-flank__burst__roster-order | 23 | 13 | 56.5% | 0 | 22.5s | 58.1% | 39.9% |
| right-flank__burst__tank-front-support-rear | 23 | 18 | 78.3% | 0 | 27.1s | 65.9% | 19.9% |
| right-flank__drip__roster-order | 23 | 15 | 65.2% | 0 | 29.3s | 63.3% | 31.2% |
| right-flank__drip__tank-front-support-rear | 23 | 16 | 69.6% | 0 | 30.5s | 63.3% | 30.4% |
| right-flank__three-waves__tank-front-support-rear | 23 | 16 | 69.6% | 0 | 24.2s | 65.9% | 30.4% |
| three-lane__drip__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 23.4s | 66.6% | 34.8% |
| three-lane__three-waves__roster-order | 23 | 10 | 43.5% | 0 | 21.0s | 52.9% | 50.9% |
| three-lane__two-waves__roster-order | 23 | 13 | 56.5% | 0 | 20.2s | 54.3% | 40.0% |
| three-lane__two-waves__tank-front-support-rear | 23 | 17 | 73.9% | 0 | 27.4s | 70.7% | 26.1% |
| vanguard-wedge__burst__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 24.2s | 56.5% | 30.8% |
| vanguard-wedge__three-waves__roster-order | 23 | 13 | 56.5% | 0 | 28.0s | 67.4% | 40.3% |
| vanguard-wedge__three-waves__tank-front-support-rear | 23 | 16 | 69.6% | 0 | 36.1s | 69.5% | 28.0% |
| vanguard-wedge__two-waves__roster-order | 23 | 16 | 69.6% | 0 | 27.9s | 64.2% | 29.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 29.1s | 65.8% | 30.5% |
| wide-line__burst__roster-order | 23 | 17 | 73.9% | 0 | 25.5s | 71.6% | 26.1% |
| wide-line__drip__roster-order | 23 | 17 | 73.9% | 0 | 33.3s | 69.1% | 26.1% |
| wide-line__drip__tank-front-support-rear | 23 | 12 | 52.2% | 0 | 29.8s | 63.0% | 46.7% |
| wide-line__rapid__tank-front-support-rear | 23 | 13 | 56.5% | 0 | 26.0s | 55.6% | 37.2% |
| wide-line__three-waves__tank-front-support-rear | 23 | 18 | 78.3% | 0 | 28.4s | 74.7% | 18.6% |
| center-column__rapid__tank-front-support-rear | 22 | 13 | 59.1% | 0 | 25.1s | 61.7% | 35.4% |
| diamond__drip__roster-order | 22 | 15 | 68.2% | 0 | 28.9s | 66.7% | 31.8% |
| diamond__drip__tank-front-support-rear | 22 | 17 | 77.3% | 0 | 31.7s | 73.7% | 22.3% |
| diamond__three-waves__roster-order | 22 | 18 | 81.8% | 0 | 27.9s | 69.4% | 18.2% |
| dual-flank__burst__tank-front-support-rear | 22 | 13 | 59.1% | 0 | 24.7s | 63.6% | 40.9% |
| dual-flank__rapid__roster-order | 22 | 17 | 77.3% | 0 | 25.0s | 73.6% | 22.7% |
| dual-flank__rapid__tank-front-support-rear | 22 | 13 | 59.1% | 0 | 24.4s | 69.0% | 40.6% |
| edge-sweep__burst__tank-front-support-rear | 22 | 18 | 81.8% | 0 | 28.6s | 69.7% | 15.9% |
| edge-sweep__rapid__roster-order | 22 | 11 | 50.0% | 0 | 24.6s | 60.5% | 45.6% |
| edge-sweep__rapid__tank-front-support-rear | 22 | 15 | 68.2% | 0 | 26.5s | 65.7% | 26.4% |
| left-flank__burst__roster-order | 22 | 18 | 81.8% | 0 | 24.8s | 65.5% | 18.2% |
| left-flank__rapid__roster-order | 22 | 18 | 81.8% | 0 | 25.1s | 68.8% | 18.2% |
| left-flank__three-waves__roster-order | 22 | 18 | 81.8% | 0 | 22.1s | 63.3% | 18.2% |
| left-flank__three-waves__tank-front-support-rear | 22 | 17 | 77.3% | 0 | 26.9s | 66.1% | 22.7% |
| left-flank__two-waves__tank-front-support-rear | 22 | 14 | 63.6% | 0 | 24.9s | 52.0% | 35.7% |
| right-flank__two-waves__roster-order | 22 | 19 | 86.4% | 0 | 26.4s | 72.6% | 13.6% |
| three-lane__burst__roster-order | 22 | 13 | 59.1% | 0 | 26.1s | 64.5% | 40.2% |
| three-lane__drip__roster-order | 22 | 16 | 72.7% | 0 | 23.5s | 73.4% | 27.3% |
| three-lane__rapid__tank-front-support-rear | 22 | 18 | 81.8% | 0 | 25.1s | 70.7% | 18.1% |
| three-lane__three-waves__tank-front-support-rear | 22 | 14 | 63.6% | 0 | 25.9s | 65.8% | 36.4% |
| vanguard-wedge__drip__roster-order | 22 | 15 | 68.2% | 0 | 34.6s | 69.1% | 27.2% |
| vanguard-wedge__drip__tank-front-support-rear | 22 | 14 | 63.6% | 0 | 29.7s | 64.7% | 26.4% |
| wide-line__burst__tank-front-support-rear | 22 | 18 | 81.8% | 0 | 25.0s | 76.0% | 18.2% |
| wide-line__three-waves__roster-order | 22 | 14 | 63.6% | 0 | 33.5s | 65.3% | 36.4% |
| wide-line__two-waves__roster-order | 22 | 14 | 63.6% | 0 | 23.8s | 62.7% | 36.4% |
| wide-line__two-waves__tank-front-support-rear | 22 | 17 | 77.3% | 0 | 27.4s | 70.8% | 22.7% |
| center-column__burst__tank-front-support-rear | 21 | 14 | 66.7% | 0 | 26.1s | 70.2% | 33.3% |
| center-column__two-waves__tank-front-support-rear | 21 | 13 | 61.9% | 0 | 26.3s | 65.2% | 38.1% |
| diamond__rapid__roster-order | 21 | 12 | 57.1% | 0 | 23.3s | 59.7% | 40.8% |
| diamond__two-waves__roster-order | 21 | 14 | 66.7% | 0 | 25.5s | 65.9% | 33.1% |
| dual-flank__drip__roster-order | 21 | 11 | 52.4% | 0 | 24.8s | 63.0% | 46.8% |
| dual-flank__three-waves__roster-order | 21 | 14 | 66.7% | 0 | 28.9s | 66.8% | 33.3% |
| edge-sweep__burst__roster-order | 21 | 14 | 66.7% | 0 | 26.7s | 68.2% | 33.3% |
| edge-sweep__three-waves__tank-front-support-rear | 21 | 14 | 66.7% | 0 | 23.8s | 62.1% | 33.3% |
| edge-sweep__two-waves__roster-order | 21 | 14 | 66.7% | 0 | 26.8s | 64.3% | 24.2% |
| edge-sweep__two-waves__tank-front-support-rear | 21 | 15 | 71.4% | 0 | 26.6s | 65.8% | 28.6% |
| inverted-wedge__drip__tank-front-support-rear | 21 | 11 | 52.4% | 0 | 26.5s | 55.1% | 44.1% |
| inverted-wedge__rapid__tank-front-support-rear | 21 | 12 | 57.1% | 0 | 23.7s | 55.2% | 41.9% |
| inverted-wedge__three-waves__tank-front-support-rear | 21 | 14 | 66.7% | 0 | 31.2s | 67.8% | 30.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 21 | 12 | 57.1% | 0 | 27.6s | 64.0% | 38.0% |
| right-flank__rapid__roster-order | 21 | 15 | 71.4% | 0 | 23.8s | 67.2% | 28.6% |
| right-flank__three-waves__roster-order | 21 | 12 | 57.1% | 0 | 25.4s | 63.9% | 37.9% |
| three-lane__rapid__roster-order | 21 | 16 | 76.2% | 0 | 24.7s | 76.0% | 23.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 21 | 14 | 66.7% | 0 | 25.5s | 66.2% | 32.4% |
| edge-sweep__drip__tank-front-support-rear | 20 | 13 | 65.0% | 0 | 30.4s | 71.9% | 31.9% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 228 | 132 | 57.9% | 0 | 25.1s | 61.5% | 40.4% |
| vanguard-wedge | 228 | 143 | 62.7% | 0 | 28.2s | 63.4% | 34.3% |
| right-flank | 227 | 150 | 66.1% | 0 | 26.1s | 63.8% | 32.1% |
| wide-line | 227 | 155 | 68.3% | 0 | 27.8s | 67.0% | 30.3% |
| diamond | 226 | 135 | 59.7% | 0 | 26.5s | 62.1% | 39.7% |
| left-flank | 226 | 166 | 73.5% | 0 | 25.7s | 62.3% | 24.9% |
| three-lane | 225 | 148 | 65.8% | 0 | 23.8s | 66.0% | 33.1% |
| dual-flank | 224 | 142 | 63.4% | 0 | 24.7s | 66.2% | 35.9% |
| inverted-wedge | 223 | 135 | 60.5% | 0 | 27.4s | 61.9% | 36.1% |
| edge-sweep | 216 | 143 | 66.2% | 0 | 27.3s | 65.5% | 30.9% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 454 | 295 | 65.0% | 0 | 24.8s | 63.5% | 33.6% |
| drip | 450 | 297 | 66.0% | 0 | 28.7s | 66.5% | 31.6% |
| rapid | 449 | 282 | 62.8% | 0 | 25.2s | 62.8% | 35.3% |
| two-waves | 449 | 290 | 64.6% | 0 | 25.7s | 62.7% | 33.6% |
| three-waves | 448 | 285 | 63.6% | 0 | 26.9s | 64.1% | 34.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 1125 | 721 | 64.1% | 0 | 25.9s | 63.9% | 33.9% |
| tank-front-support-rear | 1125 | 728 | 64.7% | 0 | 26.6s | 64.0% | 33.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 1845 | 1291 | 70.0% | 0 | 27.2s | 70.2% | 28.7% |
| cannon-medkit | 57 | 26 | 45.6% | 0 | 28.6s | 47.0% | 54.4% |
| cannon-rally | 57 | 15 | 26.3% | 0 | 14.5s | 5.3% | 64.4% |
| medkit-entry | 57 | 28 | 49.1% | 0 | 27.2s | 51.1% | 49.8% |
| freeze-defense | 54 | 22 | 40.7% | 0 | 25.4s | 46.2% | 57.8% |
| cannon-focus | 51 | 20 | 39.2% | 0 | 22.3s | 47.4% | 59.5% |
| rally-core | 49 | 15 | 30.6% | 0 | 14.0s | 6.8% | 59.2% |
| rage-entry | 29 | 13 | 44.8% | 0 | 26.6s | 50.5% | 54.4% |
| freeze-rage | 27 | 11 | 40.7% | 0 | 23.8s | 51.9% | 58.2% |
| rally-rage | 24 | 8 | 33.3% | 0 | 15.6s | 11.6% | 51.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 443 | 373 | 84.2% | 0 | 21.0s | 75.8% | 13.9% |
| epic | 108 | 41 | 38.0% | 0 | 20.1s | 32.3% | 57.5% |
| unrevealed | 85 | 44 | 51.8% | 0 | 21.9s | 45.5% | 45.6% |
| legendary | 81 | 32 | 39.5% | 0 | 22.9s | 43.2% | 55.8% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 222 | 173 | 77.9% | 0 | 26.7s | 72.7% | 18.9% |
| fire_dragon\|common | 221 | 200 | 90.5% | 0 | 15.4s | 78.9% | 8.9% |
| demon_king\|epic | 60 | 21 | 35.0% | 0 | 20.9s | 30.9% | 60.8% |
| fire_dragon\|epic | 48 | 20 | 41.7% | 0 | 19.1s | 34.2% | 53.3% |
| fire_dragon\|unrevealed | 45 | 24 | 53.3% | 0 | 21.0s | 47.3% | 43.5% |
| fire_dragon\|legendary | 43 | 17 | 39.5% | 0 | 23.0s | 44.7% | 55.4% |
| demon_king\|unrevealed | 40 | 20 | 50.0% | 0 | 22.9s | 43.3% | 48.0% |
| demon_king\|legendary | 38 | 15 | 39.5% | 0 | 22.9s | 41.5% | 56.1% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1887 | 1306 | 69.2% | 0 | 27.0s | 69.3% | 29.3% |
| ward-2 | 124 | 52 | 41.9% | 0 | 23.3s | 37.3% | 54.5% |
| ward-1 | 122 | 49 | 40.2% | 0 | 24.5s | 37.7% | 57.1% |
| ward-3 | 117 | 42 | 35.9% | 0 | 19.9s | 33.7% | 60.1% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1879 | 1344 | 71.5% | 0 | 27.1s | 70.7% | 27.0% |
| low | 128 | 53 | 41.4% | 0 | 25.3s | 41.0% | 55.1% |
| mixed | 125 | 26 | 20.8% | 0 | 19.1s | 20.3% | 77.9% |
| mid | 118 | 26 | 22.0% | 0 | 22.0s | 28.6% | 71.7% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 439 | 216 | 49.2% | 0 | 24.0s | 48.0% | 48.2% |
| archer | 414 | 213 | 51.4% | 0 | 23.6s | 51.7% | 46.0% |
| demon_king | 360 | 229 | 63.6% | 0 | 24.9s | 59.2% | 33.0% |
| fire_dragon | 357 | 261 | 73.1% | 0 | 17.5s | 64.7% | 24.9% |
| necromancer | 322 | 154 | 47.8% | 0 | 26.8s | 50.6% | 49.9% |
| mechanical_dragon | 321 | 196 | 61.1% | 0 | 25.9s | 60.8% | 37.1% |
| mage | 320 | 177 | 55.3% | 0 | 19.2s | 59.3% | 42.5% |
| mimic | 314 | 192 | 61.1% | 0 | 29.8s | 56.0% | 35.8% |
| pea_shooter | 249 | 142 | 57.0% | 0 | 28.1s | 60.9% | 40.8% |
| wind_mage | 150 | 36 | 24.0% | 0 | 26.4s | 38.0% | 74.9% |
| ice_golem | 92 | 26 | 28.3% | 0 | 42.5s | 35.5% | 68.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 180 | 73.3% | 66.4%-79.3% | 73.6% | 26.6% | 45.8% |
| demon_king | 180 | 88.3% | 82.8%-92.2% | 82.0% | 8.7% | 73.1% |
| fire_dragon | 180 | 100.0% | 97.9%-100.0% | 87.1% | 0.0% | 97.2% |
| ice_golem | 53 | 32.1% | 21.1%-45.5% | 40.7% | 67.9% | 19.8% |
| knight | 180 | 67.8% | 60.6%-74.2% | 67.3% | 31.4% | 45.1% |
| mage | 180 | 72.2% | 65.3%-78.2% | 76.2% | 25.7% | 43.9% |
| mechanical_dragon | 180 | 78.9% | 72.4%-84.2% | 78.5% | 20.2% | 61.1% |
| mimic | 180 | 76.1% | 69.4%-81.8% | 73.1% | 22.7% | 68.0% |
| necromancer | 180 | 56.7% | 49.4%-63.7% | 61.3% | 41.1% | 46.7% |
| pea_shooter | 180 | 64.4% | 57.2%-71.1% | 69.5% | 33.1% | 40.4% |
| wind_mage | 113 | 25.7% | 18.5%-34.4% | 43.1% | 73.2% | 18.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 67 | 91.0% | 81.8%-95.8% | 83.8% | 8.8% | 59.6% |
| archer\|TH8 | 60 | 60.0% | 47.4%-71.4% | 67.2% | 39.9% | 33.4% |
| archer\|TH9 | 53 | 66.0% | 52.6%-77.3% | 69.8% | 33.9% | 42.3% |
| demon_king\|TH7 | 67 | 94.0% | 85.6%-97.7% | 84.9% | 2.9% | 82.3% |
| demon_king\|TH8 | 60 | 78.3% | 66.4%-86.9% | 77.9% | 18.6% | 59.8% |
| demon_king\|TH9 | 53 | 92.5% | 82.1%-97.0% | 83.3% | 5.0% | 76.5% |
| fire_dragon\|TH7 | 67 | 100.0% | 94.6%-100.0% | 90.2% | 0.0% | 98.5% |
| fire_dragon\|TH8 | 60 | 100.0% | 94.0%-100.0% | 86.4% | 0.0% | 97.1% |
| fire_dragon\|TH9 | 53 | 100.0% | 93.2%-100.0% | 84.8% | 0.0% | 95.8% |
| ice_golem\|TH9 | 53 | 32.1% | 21.1%-45.5% | 40.7% | 67.9% | 19.8% |
| knight\|TH7 | 67 | 83.6% | 72.9%-90.6% | 80.0% | 14.8% | 58.7% |
| knight\|TH8 | 60 | 53.3% | 40.9%-65.4% | 57.5% | 46.0% | 31.4% |
| knight\|TH9 | 53 | 64.2% | 50.7%-75.7% | 64.7% | 35.7% | 43.4% |
| mage\|TH7 | 67 | 88.1% | 78.2%-93.8% | 84.2% | 9.6% | 56.9% |
| mage\|TH8 | 60 | 56.7% | 44.1%-68.4% | 71.2% | 41.8% | 32.6% |
| mage\|TH9 | 53 | 69.8% | 56.5%-80.5% | 73.3% | 28.0% | 40.2% |
| mechanical_dragon\|TH7 | 67 | 97.0% | 89.8%-99.2% | 88.8% | 2.0% | 75.6% |
| mechanical_dragon\|TH8 | 60 | 70.0% | 57.5%-80.1% | 73.8% | 29.1% | 50.7% |
| mechanical_dragon\|TH9 | 53 | 66.0% | 52.6%-77.3% | 72.9% | 33.0% | 54.5% |
| mimic\|TH7 | 67 | 85.1% | 74.7%-91.7% | 78.7% | 13.6% | 79.7% |
| mimic\|TH8 | 60 | 60.0% | 47.4%-71.4% | 65.6% | 38.4% | 50.7% |
| mimic\|TH9 | 53 | 83.0% | 70.8%-90.8% | 75.3% | 16.4% | 72.8% |
| necromancer\|TH7 | 67 | 70.1% | 58.3%-79.8% | 73.2% | 25.5% | 59.0% |
| necromancer\|TH8 | 60 | 45.0% | 33.1%-57.5% | 55.1% | 53.7% | 34.2% |
| necromancer\|TH9 | 53 | 52.8% | 39.7%-65.6% | 55.8% | 46.6% | 45.3% |
| pea_shooter\|TH7 | 67 | 77.6% | 66.3%-85.9% | 82.4% | 18.2% | 54.4% |
| pea_shooter\|TH8 | 60 | 55.0% | 42.5%-66.9% | 61.3% | 45.0% | 29.8% |
| pea_shooter\|TH9 | 53 | 58.5% | 45.1%-70.7% | 65.1% | 38.6% | 34.8% |
| wind_mage\|TH8 | 60 | 16.7% | 9.3%-28.0% | 40.9% | 81.4% | 12.5% |
| wind_mage\|TH9 | 53 | 35.8% | 24.3%-49.3% | 45.4% | 63.8% | 25.5% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 11 | 63.6% | 35.4%-84.8% | 64.1% | 36.4% | 42.0% |
| archer\|asymmetric-right | 11 | 63.6% | 35.4%-84.8% | 73.0% | 36.0% | 42.4% |
| archer\|cannon-screen | 9 | 88.9% | 56.5%-98.0% | 81.5% | 11.1% | 63.7% |
| archer\|compact-core | 10 | 60.0% | 31.3%-83.2% | 70.2% | 39.9% | 32.2% |
| archer\|corner-keep | 9 | 88.9% | 56.5%-98.0% | 77.4% | 11.1% | 41.7% |
| archer\|crossfire | 9 | 77.8% | 45.3%-93.7% | 73.2% | 22.2% | 50.1% |
| archer\|defense-ring | 11 | 72.7% | 43.4%-90.3% | 74.4% | 27.3% | 49.5% |
| archer\|diamond | 10 | 50.0% | 23.7%-76.3% | 59.1% | 50.0% | 31.1% |
| archer\|echelon-left | 9 | 88.9% | 56.5%-98.0% | 75.0% | 11.1% | 50.4% |
| archer\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 77.7% | 11.1% | 48.6% |
| archer\|kill-corridor | 8 | 62.5% | 30.6%-86.3% | 65.8% | 37.5% | 31.4% |
| archer\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 71.5% | 36.4% | 37.6% |
| archer\|rear-keep | 10 | 80.0% | 49.0%-94.3% | 78.9% | 20.0% | 55.1% |
| archer\|resource-shield | 11 | 63.6% | 35.4%-84.8% | 67.3% | 36.4% | 39.0% |
| archer\|southern-funnel | 10 | 70.0% | 39.7%-89.2% | 76.0% | 30.0% | 41.3% |
| archer\|split-core | 9 | 88.9% | 56.5%-98.0% | 80.5% | 11.1% | 55.8% |
| archer\|trap-lanes | 11 | 72.7% | 43.4%-90.3% | 76.3% | 26.4% | 48.9% |
| archer\|wide-spread | 12 | 83.3% | 55.2%-95.3% | 82.8% | 16.4% | 62.4% |
| demon_king\|asymmetric-left | 11 | 81.8% | 52.3%-94.9% | 77.9% | 16.2% | 63.6% |
| demon_king\|asymmetric-right | 11 | 72.7% | 43.4%-90.3% | 78.4% | 18.8% | 63.6% |
| demon_king\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 86.6% | 0.0% | 90.5% |
| demon_king\|compact-core | 10 | 100.0% | 72.2%-100.0% | 79.4% | 0.4% | 54.3% |
| demon_king\|corner-keep | 9 | 77.8% | 45.3%-93.7% | 83.5% | 7.6% | 69.8% |
| demon_king\|crossfire | 9 | 88.9% | 56.5%-98.0% | 83.3% | 10.5% | 76.2% |
| demon_king\|defense-ring | 11 | 90.9% | 62.3%-98.4% | 86.7% | 6.3% | 81.8% |
| demon_king\|diamond | 10 | 70.0% | 39.7%-89.2% | 79.9% | 20.4% | 65.7% |
| demon_king\|echelon-left | 9 | 100.0% | 70.1%-100.0% | 85.4% | 0.0% | 77.8% |
| demon_king\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 82.1% | 5.0% | 77.8% |
| demon_king\|kill-corridor | 8 | 100.0% | 67.6%-100.0% | 83.9% | 0.0% | 76.8% |
| demon_king\|layered-rings | 11 | 81.8% | 52.3%-94.9% | 81.6% | 10.1% | 64.9% |
| demon_king\|rear-keep | 10 | 100.0% | 72.2%-100.0% | 87.5% | 0.0% | 87.1% |
| demon_king\|resource-shield | 11 | 90.9% | 62.3%-98.4% | 83.3% | 9.1% | 63.6% |
| demon_king\|southern-funnel | 10 | 80.0% | 49.0%-94.3% | 73.5% | 20.0% | 65.7% |
| demon_king\|split-core | 9 | 88.9% | 56.5%-98.0% | 73.5% | 11.1% | 76.2% |
| demon_king\|trap-lanes | 11 | 90.9% | 62.3%-98.4% | 82.4% | 9.1% | 75.3% |
| demon_king\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 86.6% | 7.5% | 88.1% |
| fire_dragon\|asymmetric-left | 11 | 100.0% | 74.1%-100.0% | 81.1% | 0.0% | 100.0% |
| fire_dragon\|asymmetric-right | 11 | 100.0% | 74.1%-100.0% | 84.8% | 0.0% | 100.0% |
| fire_dragon\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 86.9% | 0.0% | 97.2% |
| fire_dragon\|compact-core | 10 | 100.0% | 72.2%-100.0% | 86.2% | 0.0% | 92.5% |
| fire_dragon\|corner-keep | 9 | 100.0% | 70.1%-100.0% | 85.1% | 0.0% | 100.0% |
| fire_dragon\|crossfire | 9 | 100.0% | 70.1%-100.0% | 89.0% | 0.0% | 97.2% |
| fire_dragon\|defense-ring | 11 | 100.0% | 74.1%-100.0% | 89.4% | 0.0% | 100.0% |
| fire_dragon\|diamond | 10 | 100.0% | 72.2%-100.0% | 89.2% | 0.0% | 95.0% |
| fire_dragon\|echelon-left | 9 | 100.0% | 70.1%-100.0% | 88.7% | 0.0% | 100.0% |
| fire_dragon\|echelon-right | 9 | 100.0% | 70.1%-100.0% | 89.0% | 0.0% | 100.0% |
| fire_dragon\|kill-corridor | 8 | 100.0% | 67.6%-100.0% | 88.3% | 0.0% | 96.9% |
| fire_dragon\|layered-rings | 11 | 100.0% | 74.1%-100.0% | 88.5% | 0.0% | 95.5% |
| fire_dragon\|rear-keep | 10 | 100.0% | 72.2%-100.0% | 89.4% | 0.0% | 100.0% |
| fire_dragon\|resource-shield | 11 | 100.0% | 74.1%-100.0% | 86.7% | 0.0% | 88.6% |
| fire_dragon\|southern-funnel | 10 | 100.0% | 72.2%-100.0% | 88.8% | 0.0% | 97.5% |
| fire_dragon\|split-core | 9 | 100.0% | 70.1%-100.0% | 88.1% | 0.0% | 94.4% |
| fire_dragon\|trap-lanes | 11 | 100.0% | 74.1%-100.0% | 85.4% | 0.0% | 97.7% |
| fire_dragon\|wide-spread | 12 | 100.0% | 75.7%-100.0% | 85.7% | 0.0% | 97.9% |
| knight\|asymmetric-left | 11 | 54.5% | 28.0%-78.7% | 57.0% | 45.5% | 39.0% |
| knight\|asymmetric-right | 11 | 54.5% | 28.0%-78.7% | 63.4% | 45.5% | 41.6% |
| knight\|cannon-screen | 9 | 88.9% | 56.5%-98.0% | 77.1% | 11.1% | 61.7% |
| knight\|compact-core | 10 | 50.0% | 23.7%-76.3% | 60.2% | 50.0% | 34.2% |
| knight\|corner-keep | 9 | 77.8% | 45.3%-93.7% | 74.1% | 18.7% | 44.0% |
| knight\|crossfire | 9 | 77.8% | 45.3%-93.7% | 71.1% | 22.2% | 57.8% |
| knight\|defense-ring | 11 | 81.8% | 52.3%-94.9% | 71.5% | 18.2% | 52.9% |
| knight\|diamond | 10 | 60.0% | 31.3%-83.2% | 69.9% | 39.5% | 39.1% |
| knight\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 67.0% | 33.1% | 44.7% |
| knight\|echelon-right | 9 | 77.8% | 45.3%-93.7% | 68.2% | 22.0% | 47.2% |
| knight\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 48.0% | 50.0% | 24.2% |
| knight\|layered-rings | 11 | 54.5% | 28.0%-78.7% | 63.4% | 38.8% | 39.4% |
| knight\|rear-keep | 10 | 70.0% | 39.7%-89.2% | 73.2% | 30.0% | 50.7% |
| knight\|resource-shield | 11 | 54.5% | 28.0%-78.7% | 61.2% | 45.5% | 34.1% |
| knight\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 61.7% | 40.0% | 36.4% |
| knight\|split-core | 9 | 77.8% | 45.3%-93.7% | 72.3% | 22.2% | 56.3% |
| knight\|trap-lanes | 11 | 72.7% | 43.4%-90.3% | 66.6% | 27.3% | 48.1% |
| knight\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 83.3% | 5.4% | 59.3% |
| mage\|asymmetric-left | 11 | 72.7% | 43.4%-90.3% | 71.0% | 27.3% | 37.7% |
| mage\|asymmetric-right | 11 | 45.5% | 21.3%-72.0% | 61.2% | 51.9% | 32.5% |
| mage\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 85.1% | 0.0% | 57.1% |
| mage\|compact-core | 10 | 60.0% | 31.3%-83.2% | 71.5% | 35.6% | 30.0% |
| mage\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 68.6% | 41.2% | 34.9% |
| mage\|crossfire | 9 | 66.7% | 35.4%-87.9% | 79.8% | 30.4% | 47.6% |
| mage\|defense-ring | 11 | 81.8% | 52.3%-94.9% | 81.3% | 18.2% | 46.8% |
| mage\|diamond | 10 | 70.0% | 39.7%-89.2% | 74.3% | 30.0% | 38.6% |
| mage\|echelon-left | 9 | 88.9% | 56.5%-98.0% | 78.3% | 11.1% | 42.9% |
| mage\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 82.4% | 11.1% | 60.3% |
| mage\|kill-corridor | 8 | 75.0% | 40.9%-92.9% | 79.5% | 18.4% | 48.2% |
| mage\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 76.7% | 32.4% | 36.4% |
| mage\|rear-keep | 10 | 80.0% | 49.0%-94.3% | 77.5% | 20.0% | 52.9% |
| mage\|resource-shield | 11 | 45.5% | 21.3%-72.0% | 70.8% | 41.4% | 33.8% |
| mage\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 74.6% | 40.0% | 27.1% |
| mage\|split-core | 9 | 88.9% | 56.5%-98.0% | 80.5% | 11.1% | 58.7% |
| mage\|trap-lanes | 11 | 81.8% | 52.3%-94.9% | 80.0% | 18.2% | 55.8% |
| mage\|wide-spread | 12 | 83.3% | 55.2%-95.3% | 80.8% | 16.7% | 53.6% |
| mechanical_dragon\|asymmetric-left | 11 | 63.6% | 35.4%-84.8% | 71.5% | 36.4% | 54.5% |
| mechanical_dragon\|asymmetric-right | 11 | 63.6% | 35.4%-84.8% | 70.5% | 36.4% | 55.6% |
| mechanical_dragon\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 83.6% | 0.0% | 75.3% |
| mechanical_dragon\|compact-core | 10 | 80.0% | 49.0%-94.3% | 74.0% | 20.0% | 48.9% |
| mechanical_dragon\|corner-keep | 9 | 77.8% | 45.3%-93.7% | 77.7% | 22.2% | 58.0% |
| mechanical_dragon\|crossfire | 9 | 77.8% | 45.3%-93.7% | 81.3% | 17.1% | 65.4% |
| mechanical_dragon\|defense-ring | 11 | 81.8% | 52.3%-94.9% | 79.1% | 18.2% | 62.6% |
| mechanical_dragon\|diamond | 10 | 90.0% | 59.6%-98.2% | 83.7% | 7.4% | 54.4% |
| mechanical_dragon\|echelon-left | 9 | 77.8% | 45.3%-93.7% | 76.5% | 22.2% | 59.3% |
| mechanical_dragon\|echelon-right | 9 | 100.0% | 70.1%-100.0% | 84.5% | 0.0% | 71.6% |
| mechanical_dragon\|kill-corridor | 8 | 62.5% | 30.6%-86.3% | 72.1% | 36.7% | 38.9% |
| mechanical_dragon\|layered-rings | 11 | 54.5% | 28.0%-78.7% | 66.3% | 39.5% | 46.5% |
| mechanical_dragon\|rear-keep | 10 | 90.0% | 59.6%-98.2% | 87.3% | 9.6% | 74.4% |
| mechanical_dragon\|resource-shield | 11 | 63.6% | 35.4%-84.8% | 72.0% | 35.6% | 48.5% |
| mechanical_dragon\|southern-funnel | 10 | 80.0% | 49.0%-94.3% | 82.0% | 19.5% | 63.3% |
| mechanical_dragon\|split-core | 9 | 77.8% | 45.3%-93.7% | 79.0% | 22.2% | 63.0% |
| mechanical_dragon\|trap-lanes | 11 | 90.9% | 62.3%-98.4% | 83.9% | 9.1% | 73.7% |
| mechanical_dragon\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 88.2% | 8.1% | 82.4% |
| mimic\|asymmetric-left | 11 | 63.6% | 35.4%-84.8% | 63.6% | 29.4% | 50.9% |
| mimic\|asymmetric-right | 11 | 63.6% | 35.4%-84.8% | 67.8% | 36.4% | 61.8% |
| mimic\|cannon-screen | 9 | 88.9% | 56.5%-98.0% | 81.5% | 11.1% | 88.9% |
| mimic\|compact-core | 10 | 60.0% | 31.3%-83.2% | 65.0% | 40.0% | 50.0% |
| mimic\|corner-keep | 9 | 88.9% | 56.5%-98.0% | 79.3% | 11.1% | 73.3% |
| mimic\|crossfire | 9 | 66.7% | 35.4%-87.9% | 69.9% | 33.3% | 64.4% |
| mimic\|defense-ring | 11 | 90.9% | 62.3%-98.4% | 83.3% | 9.1% | 81.8% |
| mimic\|diamond | 10 | 70.0% | 39.7%-89.2% | 70.7% | 27.5% | 62.0% |
| mimic\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 70.5% | 33.3% | 64.4% |
| mimic\|echelon-right | 9 | 77.8% | 45.3%-93.7% | 74.1% | 22.2% | 68.9% |
| mimic\|kill-corridor | 8 | 75.0% | 40.9%-92.9% | 74.5% | 22.6% | 67.5% |
| mimic\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 68.3% | 33.7% | 56.4% |
| mimic\|rear-keep | 10 | 90.0% | 59.6%-98.2% | 80.8% | 10.0% | 78.0% |
| mimic\|resource-shield | 11 | 72.7% | 43.4%-90.3% | 71.5% | 27.3% | 65.5% |
| mimic\|southern-funnel | 10 | 80.0% | 49.0%-94.3% | 69.9% | 20.0% | 62.0% |
| mimic\|split-core | 9 | 88.9% | 56.5%-98.0% | 71.6% | 11.1% | 73.3% |
| mimic\|trap-lanes | 11 | 72.7% | 43.4%-90.3% | 71.2% | 21.2% | 69.1% |
| mimic\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 82.6% | 8.3% | 86.7% |
| necromancer\|asymmetric-left | 11 | 45.5% | 21.3%-72.0% | 58.0% | 54.5% | 45.5% |
| necromancer\|asymmetric-right | 11 | 54.5% | 28.0%-78.7% | 58.2% | 40.6% | 50.0% |
| necromancer\|cannon-screen | 9 | 77.8% | 45.3%-93.7% | 69.9% | 22.2% | 72.2% |
| necromancer\|compact-core | 10 | 60.0% | 31.3%-83.2% | 57.2% | 37.3% | 45.0% |
| necromancer\|corner-keep | 9 | 66.7% | 35.4%-87.9% | 60.4% | 33.3% | 50.0% |
| necromancer\|crossfire | 9 | 66.7% | 35.4%-87.9% | 65.2% | 33.3% | 44.4% |
| necromancer\|defense-ring | 11 | 72.7% | 43.4%-90.3% | 68.1% | 27.3% | 63.6% |
| necromancer\|diamond | 10 | 30.0% | 10.8%-60.3% | 64.8% | 64.2% | 30.0% |
| necromancer\|echelon-left | 9 | 55.6% | 26.7%-81.1% | 58.3% | 44.3% | 38.9% |
| necromancer\|echelon-right | 9 | 55.6% | 26.7%-81.1% | 60.7% | 44.4% | 44.4% |
| necromancer\|kill-corridor | 8 | 37.5% | 13.7%-69.4% | 51.0% | 62.5% | 37.5% |
| necromancer\|layered-rings | 11 | 36.4% | 15.2%-64.6% | 56.8% | 58.3% | 36.4% |
| necromancer\|rear-keep | 10 | 70.0% | 39.7%-89.2% | 62.6% | 30.0% | 45.0% |
| necromancer\|resource-shield | 11 | 36.4% | 15.2%-64.6% | 58.2% | 47.8% | 31.8% |
| necromancer\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 56.3% | 40.0% | 40.0% |
| necromancer\|split-core | 9 | 66.7% | 35.4%-87.9% | 67.4% | 33.3% | 61.1% |
| necromancer\|trap-lanes | 11 | 54.5% | 28.0%-78.7% | 58.0% | 45.5% | 40.9% |
| necromancer\|wide-spread | 12 | 75.0% | 46.8%-91.1% | 71.4% | 22.5% | 62.5% |
| pea_shooter\|asymmetric-left | 11 | 45.5% | 21.3%-72.0% | 62.7% | 40.0% | 32.3% |
| pea_shooter\|asymmetric-right | 11 | 45.5% | 21.3%-72.0% | 60.9% | 53.8% | 33.3% |
| pea_shooter\|cannon-screen | 9 | 88.9% | 56.5%-98.0% | 78.0% | 11.1% | 54.3% |
| pea_shooter\|compact-core | 10 | 50.0% | 23.7%-76.3% | 59.3% | 50.0% | 27.8% |
| pea_shooter\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 65.5% | 44.4% | 35.8% |
| pea_shooter\|crossfire | 9 | 66.7% | 35.4%-87.9% | 75.3% | 33.3% | 48.1% |
| pea_shooter\|defense-ring | 11 | 81.8% | 52.3%-94.9% | 77.9% | 18.2% | 51.5% |
| pea_shooter\|diamond | 10 | 50.0% | 23.7%-76.3% | 69.6% | 37.7% | 35.6% |
| pea_shooter\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 72.6% | 33.3% | 34.6% |
| pea_shooter\|echelon-right | 9 | 66.7% | 35.4%-87.9% | 75.6% | 33.3% | 43.2% |
| pea_shooter\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 63.4% | 42.2% | 36.1% |
| pea_shooter\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 66.6% | 36.4% | 36.4% |
| pea_shooter\|rear-keep | 10 | 70.0% | 39.7%-89.2% | 70.5% | 30.0% | 42.2% |
| pea_shooter\|resource-shield | 11 | 45.5% | 21.3%-72.0% | 61.9% | 47.2% | 31.3% |
| pea_shooter\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 63.4% | 40.0% | 37.8% |
| pea_shooter\|split-core | 9 | 88.9% | 56.5%-98.0% | 73.8% | 11.1% | 40.7% |
| pea_shooter\|trap-lanes | 11 | 81.8% | 52.3%-94.9% | 75.4% | 18.2% | 50.5% |
| pea_shooter\|wide-spread | 12 | 83.3% | 55.2%-95.3% | 79.2% | 16.7% | 54.6% |
| wind_mage\|asymmetric-left | 7 | 28.6% | 8.2%-64.1% | 38.5% | 71.4% | 28.6% |
| wind_mage\|asymmetric-right | 7 | 28.6% | 8.2%-64.1% | 42.2% | 71.4% | 14.3% |
| wind_mage\|cannon-screen | 6 | 33.3% | 9.7%-70.0% | 52.7% | 66.7% | 25.0% |
| wind_mage\|compact-core | 6 | 0.0% | 0.0%-39.0% | 34.2% | 99.1% | 0.0% |
| wind_mage\|crossfire | 6 | 33.3% | 9.7%-70.0% | 46.0% | 64.1% | 16.7% |
| wind_mage\|defense-ring | 7 | 28.6% | 8.2%-64.1% | 49.5% | 71.3% | 28.6% |
| wind_mage\|diamond | 6 | 50.0% | 18.8%-81.2% | 53.6% | 50.0% | 41.7% |
| wind_mage\|echelon-left | 6 | 33.3% | 9.7%-70.0% | 42.2% | 66.7% | 25.0% |
| wind_mage\|echelon-right | 6 | 0.0% | 0.0%-39.0% | 26.2% | 100.0% | 0.0% |
| wind_mage\|layered-rings | 7 | 28.6% | 8.2%-64.1% | 34.5% | 71.4% | 14.3% |
| wind_mage\|rear-keep | 6 | 33.3% | 9.7%-70.0% | 47.3% | 66.7% | 33.3% |
| wind_mage\|resource-shield | 7 | 0.0% | 0.0%-35.4% | 35.6% | 99.3% | 0.0% |
| wind_mage\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 42.7% | 83.3% | 16.7% |
| wind_mage\|trap-lanes | 7 | 28.6% | 8.2%-64.1% | 44.6% | 57.9% | 14.3% |
| wind_mage\|wide-spread | 8 | 50.0% | 21.5%-78.5% | 60.8% | 50.0% | 37.5% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th9-crossfire-139 | 9 | crossfire | maxed | 14 | 7.1% | 92.2% |
| th8-layered-rings-154 | 8 | layered-rings | maxed | 13 | 7.7% | 92.3% |
| th8-wide-spread-068 | 8 | wide-spread | rushed-defense | 15 | 13.3% | 83.1% |
| th8-resource-shield-111 | 8 | resource-shield | rushed-defense | 15 | 13.3% | 81.4% |
| th9-asymmetric-left-168 | 9 | asymmetric-left | maxed | 14 | 14.3% | 85.7% |
| th9-southern-funnel-063 | 9 | southern-funnel | maxed | 14 | 14.3% | 85.7% |
| th9-trap-lanes-124 | 9 | trap-lanes | maxed | 14 | 14.3% | 85.7% |
| th8-asymmetric-left-167 | 8 | asymmetric-left | maxed | 10 | 10.0% | 90.0% |
| th8-southern-funnel-062 | 8 | southern-funnel | maxed | 10 | 10.0% | 90.0% |
| th8-split-core-107 | 8 | split-core | maxed | 10 | 10.0% | 90.0% |
| th8-defense-ring-054 | 8 | defense-ring | rushed-defense | 10 | 10.0% | 87.0% |
| th8-rear-keep-082 | 8 | rear-keep | rushed-defense | 13 | 15.4% | 84.3% |
| th8-compact-core-002 | 8 | compact-core | maxed | 13 | 15.4% | 84.3% |
| th9-compact-core-003 | 9 | compact-core | maxed | 13 | 15.4% | 84.2% |
| th9-asymmetric-right-171 | 9 | asymmetric-right | maxed | 13 | 15.4% | 81.6% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 9 | 6 | 11,840 | 8,867.2 | 1,973.33 | 1,477.87 |  |
| archer | 9 | 1 | 3,026 | 1,047.62 | 3,026 | 1,047.62 |  |
| fire_dragon | 9 | 11 | 22,724 | 10,148 | 2,065.82 | 922.55 |  |
| necromancer | 9 | 18 | 53,820 | 16,434.07 | 2,990 | 913 |  |
| knight | 9 | 1 | 5,398 | 582.86 | 5,398 | 582.86 |  |
| demon_king | 9 | 6 | 27,820 | 3,005 | 4,636.67 | 500.83 |  |
| mechanical_dragon | 9 | 5 | 8,523 | 2,415.53 | 1,704.6 | 483.11 | chain x3 |
| mimic | 9 | 8 | 29,120 | 2,134 | 3,640 | 266.75 | trap immune |
| pea_shooter | 9 | 5 | 17,420 | 1,225.71 | 3,484 | 245.14 |  |
| ice_golem | 9 | 11 | 56,784 | 2,197.18 | 5,162.18 | 199.74 | defense priority |
| wind_mage | 9 | 18 | 31,200 | 3,545.45 | 1,733.33 | 196.97 |  |
| horror | 7 | 22 | 38,071 | 4,086.29 | 1,730.5 | 185.74 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / town-hall-target-band:** policy-exploration|TH8 has 36.1% attacker wins across 155 samples; authored target is 47.0%-63.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH9 has 34.4% attacker wins across 154 samples; authored target is 47.0%-63.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 39.4% is outside 55.0% +/- 8.0% across 464 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 88.3% attacker wins across 180 samples (reference 70.9%).
- **WARNING / pure-troop-outlier:** pure-troop fire_dragon has 100.0% attacker wins across 180 samples (reference 70.9%).
- **WARNING / pure-troop-outlier:** pure-troop wind_mage has 25.7% attacker wins across 113 samples (reference 70.9%).
- **WARNING / pure-troop-outlier:** pure-troop ice_golem has 32.1% attacker wins across 53 samples (reference 70.9%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 88.3% attacker wins across 180 isolated samples.
- **WARNING / degenerate-pure-army:** Pure fire_dragon armies have 100.0% attacker wins across 180 isolated samples.
- **INFO / fragile-base:** th7-compact-core-149 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-crossfire-038 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-defense-ring-101 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-echelon-right-044 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th7-layered-rings-056 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-layered-rings-103 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-rear-keep-131 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th7-rear-keep-180 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-resource-shield-064 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-resource-shield-161 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-southern-funnel-108 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-split-core-010 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-trap-lanes-026 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-wide-spread-113 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th7-asymmetric-left-070 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-asymmetric-right-072 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th7-cannon-screen-084 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th8-cannon-screen-085 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th8-corner-keep-029 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-defense-ring-102 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th8-wide-spread-114 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-asymmetric-left-071 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-asymmetric-right-073 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th9-defense-ring-152 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th9-southern-funnel-013 has 100.0% attacker wins across 14 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.

