# Clash Full-Game Balance Lab

**Generated:** 2026-08-02T23:23:14.868Z
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
**Elapsed:** 92.3s

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
| 2250 | 1461 | 64.9% | 0 | 26.2s | 64.4% | 33.2% | 44.8% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 758 | 614 | 81.0% | 0 | 25.6s | 75.0% | 17.1% |
| TH8->TH8 | 755 | 410 | 54.3% | 0 | 25.3s | 59.6% | 44.0% |
| TH9->TH9 | 737 | 437 | 59.3% | 0 | 27.8s | 60.2% | 38.8% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-spread | 150 | 115 | 76.7% | 0 | 27.1s | 72.9% | 21.3% |
| asymmetric-right | 143 | 84 | 58.7% | 0 | 25.5s | 60.7% | 40.0% |
| resource-shield | 142 | 77 | 54.2% | 0 | 24.3s | 57.4% | 43.4% |
| trap-lanes | 142 | 99 | 69.7% | 0 | 28.0s | 64.7% | 29.6% |
| layered-rings | 135 | 75 | 55.6% | 0 | 25.4s | 59.6% | 42.6% |
| defense-ring | 134 | 97 | 72.4% | 0 | 26.9s | 68.1% | 26.3% |
| asymmetric-left | 133 | 77 | 57.9% | 0 | 25.0s | 57.9% | 40.4% |
| diamond | 126 | 73 | 57.9% | 0 | 27.0s | 63.1% | 38.0% |
| rear-keep | 126 | 87 | 69.0% | 0 | 26.7s | 67.6% | 28.7% |
| compact-core | 124 | 70 | 56.5% | 0 | 26.9s | 61.5% | 40.1% |
| southern-funnel | 118 | 79 | 66.9% | 0 | 25.1s | 66.6% | 32.2% |
| cannon-screen | 115 | 91 | 79.1% | 0 | 27.5s | 70.5% | 19.4% |
| echelon-right | 114 | 80 | 70.2% | 0 | 27.7s | 67.0% | 28.7% |
| crossfire | 113 | 75 | 66.4% | 0 | 28.1s | 66.9% | 31.1% |
| echelon-left | 113 | 72 | 63.7% | 0 | 26.4s | 62.4% | 34.5% |
| split-core | 112 | 85 | 75.9% | 0 | 25.0s | 70.3% | 22.3% |
| corner-keep | 107 | 71 | 66.4% | 0 | 25.4s | 67.4% | 32.2% |
| kill-corridor | 103 | 54 | 52.4% | 0 | 23.7s | 55.2% | 46.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right\|TH8 | 56 | 32 | 57.1% | 0 | 25.5s | 60.4% | 41.6% |
| trap-lanes\|TH9 | 56 | 38 | 67.9% | 0 | 31.9s | 64.9% | 32.0% |
| resource-shield\|TH8 | 55 | 26 | 47.3% | 0 | 25.4s | 53.6% | 50.4% |
| wide-spread\|TH9 | 55 | 40 | 72.7% | 0 | 27.9s | 69.6% | 25.2% |
| layered-rings\|TH8 | 51 | 23 | 45.1% | 0 | 25.4s | 55.9% | 54.3% |
| wide-spread\|TH8 | 50 | 34 | 68.0% | 0 | 27.7s | 71.7% | 28.8% |
| defense-ring\|TH8 | 48 | 33 | 68.8% | 0 | 27.0s | 65.6% | 30.5% |
| corner-keep\|TH7 | 47 | 30 | 63.8% | 0 | 23.2s | 67.2% | 34.3% |
| asymmetric-left\|TH7 | 46 | 34 | 73.9% | 0 | 26.6s | 71.3% | 23.0% |
| asymmetric-right\|TH7 | 46 | 34 | 73.9% | 0 | 25.9s | 75.3% | 24.3% |
| diamond\|TH7 | 46 | 31 | 67.4% | 0 | 24.8s | 68.0% | 29.0% |
| rear-keep\|TH7 | 46 | 43 | 93.5% | 0 | 24.1s | 80.4% | 6.2% |
| trap-lanes\|TH7 | 46 | 40 | 87.0% | 0 | 27.1s | 74.0% | 13.0% |
| asymmetric-left\|TH8 | 45 | 23 | 51.1% | 0 | 24.7s | 55.8% | 46.9% |
| compact-core\|TH7 | 45 | 35 | 77.8% | 0 | 25.2s | 75.9% | 20.0% |
| southern-funnel\|TH7 | 45 | 37 | 82.2% | 0 | 23.8s | 75.0% | 15.8% |
| southern-funnel\|TH8 | 45 | 25 | 55.6% | 0 | 23.5s | 61.7% | 44.2% |
| wide-spread\|TH7 | 45 | 41 | 91.1% | 0 | 25.6s | 79.5% | 8.1% |
| defense-ring\|TH7 | 44 | 37 | 84.1% | 0 | 26.6s | 79.5% | 14.4% |
| layered-rings\|TH7 | 44 | 36 | 81.8% | 0 | 26.9s | 74.4% | 15.3% |
| resource-shield\|TH7 | 44 | 33 | 75.0% | 0 | 25.0s | 70.1% | 21.3% |
| split-core\|TH7 | 44 | 40 | 90.9% | 0 | 24.7s | 77.8% | 7.0% |
| resource-shield\|TH9 | 43 | 18 | 41.9% | 0 | 22.1s | 51.4% | 57.2% |
| asymmetric-left\|TH9 | 42 | 20 | 47.6% | 0 | 23.6s | 48.1% | 52.4% |
| cannon-screen\|TH9 | 42 | 29 | 69.0% | 0 | 29.1s | 64.1% | 28.5% |
| crossfire\|TH9 | 42 | 27 | 64.3% | 0 | 30.4s | 65.6% | 34.1% |
| defense-ring\|TH9 | 42 | 27 | 64.3% | 0 | 27.2s | 61.3% | 34.2% |
| diamond\|TH9 | 42 | 26 | 61.9% | 0 | 31.8s | 65.6% | 32.3% |
| echelon-left\|TH9 | 42 | 25 | 59.5% | 0 | 25.8s | 59.6% | 40.5% |
| echelon-right\|TH9 | 42 | 28 | 66.7% | 0 | 31.3s | 62.2% | 30.7% |
| kill-corridor\|TH9 | 42 | 21 | 50.0% | 0 | 26.4s | 54.3% | 49.3% |
| rear-keep\|TH9 | 42 | 27 | 64.3% | 0 | 29.4s | 64.1% | 31.3% |
| asymmetric-right\|TH9 | 41 | 18 | 43.9% | 0 | 24.9s | 47.8% | 55.3% |
| compact-core\|TH9 | 41 | 19 | 46.3% | 0 | 29.3s | 55.3% | 49.1% |
| layered-rings\|TH9 | 40 | 16 | 40.0% | 0 | 23.6s | 50.8% | 57.6% |
| split-core\|TH8 | 40 | 23 | 57.5% | 0 | 24.1s | 61.4% | 41.3% |
| trap-lanes\|TH8 | 40 | 21 | 52.5% | 0 | 23.7s | 55.3% | 45.1% |
| cannon-screen\|TH8 | 38 | 30 | 78.9% | 0 | 28.3s | 71.1% | 19.3% |
| compact-core\|TH8 | 38 | 16 | 42.1% | 0 | 26.4s | 53.9% | 54.2% |
| diamond\|TH8 | 38 | 16 | 42.1% | 0 | 24.4s | 55.0% | 55.3% |
| echelon-right\|TH8 | 38 | 22 | 57.9% | 0 | 25.2s | 62.9% | 41.7% |
| rear-keep\|TH8 | 38 | 17 | 44.7% | 0 | 26.7s | 58.4% | 53.2% |
| crossfire\|TH8 | 37 | 21 | 56.8% | 0 | 25.4s | 62.1% | 41.5% |
| echelon-left\|TH8 | 37 | 21 | 56.8% | 0 | 26.0s | 57.2% | 41.0% |
| cannon-screen\|TH7 | 35 | 32 | 91.4% | 0 | 24.6s | 79.3% | 8.6% |
| crossfire\|TH7 | 34 | 27 | 79.4% | 0 | 28.2s | 74.9% | 16.2% |
| echelon-left\|TH7 | 34 | 26 | 76.5% | 0 | 27.7s | 73.0% | 19.9% |
| echelon-right\|TH7 | 34 | 30 | 88.2% | 0 | 26.1s | 79.6% | 11.8% |
| corner-keep\|TH8 | 33 | 22 | 66.7% | 0 | 26.6s | 70.3% | 33.2% |
| kill-corridor\|TH7 | 33 | 28 | 84.8% | 0 | 25.5s | 77.0% | 15.2% |
| kill-corridor\|TH8 | 28 | 5 | 17.9% | 0 | 17.3s | 34.4% | 79.9% |
| southern-funnel\|TH9 | 28 | 17 | 60.7% | 0 | 29.6s | 63.1% | 39.3% |
| split-core\|TH9 | 28 | 22 | 78.6% | 0 | 26.7s | 72.6% | 19.1% |
| corner-keep\|TH9 | 27 | 19 | 70.4% | 0 | 27.8s | 64.5% | 27.4% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mixed | 492 | 420 | 85.4% | 0 | 26.2s | 75.6% | 13.8% |
| rushed-defense | 476 | 194 | 40.8% | 0 | 22.7s | 52.6% | 56.2% |
| maxed | 471 | 142 | 30.1% | 0 | 25.1s | 44.5% | 66.7% |
| mid | 471 | 379 | 80.5% | 0 | 27.6s | 72.5% | 18.1% |
| rushed-economy | 340 | 326 | 95.9% | 0 | 30.8s | 81.3% | 3.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 1786 | 1282 | 71.8% | 0 | 27.2s | 71.7% | 26.9% |
| policy-exploration | 464 | 179 | 38.6% | 0 | 22.4s | 36.4% | 57.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 603 | 537 | 89.1% | 0 | 26.2s | 83.3% | 9.2% |
| pure-unit-matrix\|TH8 | 600 | 357 | 59.5% | 0 | 26.4s | 65.9% | 39.6% |
| pure-unit-matrix\|TH9 | 583 | 388 | 66.6% | 0 | 29.1s | 67.5% | 32.3% |
| policy-exploration\|TH7 | 155 | 77 | 49.7% | 0 | 23.2s | 42.7% | 48.0% |
| policy-exploration\|TH8 | 155 | 53 | 34.2% | 0 | 21.3s | 35.3% | 61.1% |
| policy-exploration\|TH9 | 154 | 49 | 31.8% | 0 | 22.8s | 32.3% | 63.3% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 259 | 91 | 35.1% | 0 | 21.7s | 34.9% | 60.2% |
| policy-exploration\|archer | 234 | 79 | 33.8% | 0 | 22.8s | 35.1% | 61.0% |
| policy-exploration\|demon_king | 180 | 67 | 37.2% | 0 | 22.0s | 35.9% | 58.7% |
| pure-unit-matrix\|archer | 180 | 132 | 73.3% | 0 | 24.0s | 73.9% | 26.2% |
| pure-unit-matrix\|demon_king | 180 | 158 | 87.8% | 0 | 27.4s | 81.4% | 9.5% |
| pure-unit-matrix\|fire_dragon | 180 | 180 | 100.0% | 0 | 14.4s | 87.4% | 0.0% |
| pure-unit-matrix\|knight | 180 | 118 | 65.6% | 0 | 27.4s | 66.3% | 32.8% |
| pure-unit-matrix\|mage | 180 | 132 | 73.3% | 0 | 19.3s | 76.5% | 25.2% |
| pure-unit-matrix\|mechanical_dragon | 180 | 146 | 81.1% | 0 | 27.3s | 79.6% | 17.9% |
| pure-unit-matrix\|mimic | 180 | 136 | 75.6% | 0 | 34.1s | 73.7% | 21.7% |
| pure-unit-matrix\|necromancer | 180 | 111 | 61.7% | 0 | 30.4s | 63.3% | 37.7% |
| pure-unit-matrix\|pea_shooter | 180 | 120 | 66.7% | 0 | 30.4s | 70.8% | 32.0% |
| policy-exploration\|fire_dragon | 177 | 76 | 42.9% | 0 | 20.4s | 41.5% | 51.9% |
| policy-exploration\|necromancer | 142 | 50 | 35.2% | 0 | 22.0s | 36.5% | 61.7% |
| policy-exploration\|mechanical_dragon | 141 | 53 | 37.6% | 0 | 23.2s | 37.9% | 58.9% |
| policy-exploration\|mage | 140 | 45 | 32.1% | 0 | 18.8s | 37.6% | 64.6% |
| policy-exploration\|mimic | 134 | 55 | 41.0% | 0 | 24.3s | 33.2% | 53.2% |
| pure-unit-matrix\|wind_mage | 113 | 29 | 25.7% | 0 | 28.4s | 43.7% | 73.2% |
| policy-exploration\|pea_shooter | 69 | 25 | 36.2% | 0 | 21.9s | 37.4% | 61.7% |
| pure-unit-matrix\|ice_golem | 53 | 20 | 37.7% | 0 | 58.6s | 43.6% | 62.3% |
| policy-exploration\|ice_golem | 39 | 8 | 20.5% | 0 | 25.9s | 28.5% | 72.9% |
| policy-exploration\|wind_mage | 37 | 7 | 18.9% | 0 | 21.8s | 22.8% | 80.0% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH8 | 96 | 31 | 32.3% | 0 | 20.9s | 34.0% | 62.2% |
| policy-exploration\|knight\|TH7 | 91 | 44 | 48.4% | 0 | 22.9s | 43.1% | 49.0% |
| policy-exploration\|archer\|TH7 | 87 | 38 | 43.7% | 0 | 23.5s | 42.2% | 53.5% |
| policy-exploration\|archer\|TH9 | 75 | 17 | 22.7% | 0 | 23.4s | 29.4% | 68.6% |
| policy-exploration\|archer\|TH8 | 72 | 24 | 33.3% | 0 | 21.4s | 34.1% | 62.0% |
| policy-exploration\|knight\|TH9 | 72 | 16 | 22.2% | 0 | 21.2s | 27.7% | 71.6% |
| policy-exploration\|demon_king\|TH7 | 71 | 35 | 49.3% | 0 | 22.0s | 40.2% | 48.9% |
| policy-exploration\|fire_dragon\|TH8 | 68 | 25 | 36.8% | 0 | 20.2s | 38.4% | 56.3% |
| pure-unit-matrix\|archer\|TH7 | 67 | 62 | 92.5% | 0 | 24.1s | 84.7% | 7.5% |
| pure-unit-matrix\|demon_king\|TH7 | 67 | 63 | 94.0% | 0 | 24.7s | 85.2% | 4.2% |
| pure-unit-matrix\|fire_dragon\|TH7 | 67 | 67 | 100.0% | 0 | 14.2s | 90.2% | 0.0% |
| pure-unit-matrix\|knight\|TH7 | 67 | 53 | 79.1% | 0 | 28.9s | 79.2% | 16.7% |
| pure-unit-matrix\|mage\|TH7 | 67 | 62 | 92.5% | 0 | 20.2s | 84.9% | 5.5% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 67 | 65 | 97.0% | 0 | 27.4s | 88.8% | 2.7% |
| pure-unit-matrix\|mimic\|TH7 | 67 | 57 | 85.1% | 0 | 32.2s | 80.1% | 11.5% |
| pure-unit-matrix\|necromancer\|TH7 | 67 | 53 | 79.1% | 0 | 32.7s | 73.2% | 19.1% |
| pure-unit-matrix\|pea_shooter\|TH7 | 67 | 55 | 82.1% | 0 | 31.4s | 83.1% | 15.2% |
| policy-exploration\|demon_king\|TH8 | 62 | 19 | 30.6% | 0 | 23.5s | 35.7% | 64.0% |
| policy-exploration\|mage\|TH8 | 60 | 19 | 31.7% | 0 | 18.3s | 39.7% | 65.9% |
| pure-unit-matrix\|archer\|TH8 | 60 | 35 | 58.3% | 0 | 24.2s | 67.2% | 41.5% |
| pure-unit-matrix\|demon_king\|TH8 | 60 | 46 | 76.7% | 0 | 29.6s | 76.4% | 19.7% |
| pure-unit-matrix\|fire_dragon\|TH8 | 60 | 60 | 100.0% | 0 | 15.4s | 87.2% | 0.0% |
| pure-unit-matrix\|knight\|TH8 | 60 | 32 | 53.3% | 0 | 26.8s | 56.2% | 46.5% |
| pure-unit-matrix\|mage\|TH8 | 60 | 33 | 55.0% | 0 | 18.2s | 69.7% | 45.0% |
| pure-unit-matrix\|mechanical_dragon\|TH8 | 60 | 43 | 71.7% | 0 | 28.3s | 75.4% | 27.3% |
| pure-unit-matrix\|mimic\|TH8 | 60 | 36 | 60.0% | 0 | 35.6s | 65.9% | 38.4% |
| pure-unit-matrix\|necromancer\|TH8 | 60 | 30 | 50.0% | 0 | 28.8s | 57.3% | 50.0% |
| pure-unit-matrix\|pea_shooter\|TH8 | 60 | 32 | 53.3% | 0 | 29.6s | 61.6% | 45.9% |
| pure-unit-matrix\|wind_mage\|TH8 | 60 | 10 | 16.7% | 0 | 27.6s | 42.0% | 81.4% |
| policy-exploration\|fire_dragon\|TH7 | 57 | 33 | 57.9% | 0 | 21.2s | 48.4% | 40.5% |
| policy-exploration\|necromancer\|TH7 | 57 | 26 | 45.6% | 0 | 24.9s | 43.3% | 52.9% |
| policy-exploration\|mechanical_dragon\|TH7 | 53 | 23 | 43.4% | 0 | 25.1s | 39.9% | 53.6% |
| pure-unit-matrix\|archer\|TH9 | 53 | 35 | 66.0% | 0 | 23.7s | 70.0% | 32.4% |
| pure-unit-matrix\|demon_king\|TH9 | 53 | 49 | 92.5% | 0 | 28.4s | 82.9% | 4.6% |
| pure-unit-matrix\|fire_dragon\|TH9 | 53 | 53 | 100.0% | 0 | 13.6s | 84.7% | 0.0% |
| pure-unit-matrix\|ice_golem\|TH9 | 53 | 20 | 37.7% | 0 | 58.6s | 43.6% | 62.3% |
| pure-unit-matrix\|knight\|TH9 | 53 | 33 | 62.3% | 0 | 26.2s | 63.7% | 37.7% |
| pure-unit-matrix\|mage\|TH9 | 53 | 37 | 69.8% | 0 | 19.6s | 75.1% | 27.7% |
| pure-unit-matrix\|mechanical_dragon\|TH9 | 53 | 38 | 71.7% | 0 | 26.1s | 74.7% | 26.4% |
| pure-unit-matrix\|mimic\|TH9 | 53 | 43 | 81.1% | 0 | 34.8s | 75.5% | 15.8% |
| pure-unit-matrix\|necromancer\|TH9 | 53 | 28 | 52.8% | 0 | 29.5s | 59.5% | 47.2% |
| pure-unit-matrix\|pea_shooter\|TH9 | 53 | 33 | 62.3% | 0 | 30.2s | 67.8% | 37.7% |
| pure-unit-matrix\|wind_mage\|TH9 | 53 | 19 | 35.8% | 0 | 29.3s | 45.5% | 63.8% |
| policy-exploration\|fire_dragon\|TH9 | 52 | 18 | 34.6% | 0 | 19.8s | 39.3% | 58.5% |
| policy-exploration\|mimic\|TH8 | 52 | 21 | 40.4% | 0 | 25.6s | 34.6% | 51.8% |
| policy-exploration\|mage\|TH7 | 50 | 19 | 38.0% | 0 | 20.7s | 40.4% | 58.7% |
| policy-exploration\|demon_king\|TH9 | 47 | 13 | 27.7% | 0 | 20.0s | 31.1% | 66.3% |
| policy-exploration\|mimic\|TH7 | 47 | 23 | 48.9% | 0 | 22.8s | 35.1% | 47.8% |
| policy-exploration\|necromancer\|TH9 | 47 | 13 | 27.7% | 0 | 20.1s | 31.7% | 67.8% |
| policy-exploration\|mechanical_dragon\|TH8 | 45 | 18 | 40.0% | 0 | 24.3s | 43.8% | 58.4% |
| policy-exploration\|mechanical_dragon\|TH9 | 43 | 12 | 27.9% | 0 | 19.8s | 30.3% | 65.9% |
| policy-exploration\|ice_golem\|TH9 | 39 | 8 | 20.5% | 0 | 25.9s | 28.5% | 72.9% |
| policy-exploration\|necromancer\|TH8 | 38 | 11 | 28.9% | 0 | 19.9s | 34.0% | 67.5% |
| policy-exploration\|pea_shooter\|TH7 | 36 | 16 | 44.4% | 0 | 23.4s | 41.2% | 53.7% |
| policy-exploration\|mimic\|TH9 | 35 | 11 | 31.4% | 0 | 24.3s | 29.3% | 62.8% |
| policy-exploration\|mage\|TH9 | 30 | 7 | 23.3% | 0 | 16.6s | 30.0% | 71.9% |
| policy-exploration\|wind_mage\|TH9 | 21 | 3 | 14.3% | 0 | 20.9s | 19.4% | 83.8% |
| policy-exploration\|pea_shooter\|TH9 | 19 | 3 | 15.8% | 0 | 16.3s | 24.3% | 80.9% |
| policy-exploration\|wind_mage\|TH8 | 16 | 4 | 25.0% | 0 | 23.1s | 27.6% | 75.0% |
| policy-exploration\|pea_shooter\|TH8 | 14 | 6 | 42.9% | 0 | 25.9s | 48.1% | 56.3% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 1786 | 1282 | 71.8% | 0 | 27.2s | 71.7% | 26.9% |
| policy-exploration\|none | 59 | 25 | 42.4% | 0 | 24.2s | 44.7% | 56.1% |
| policy-exploration\|cannon-medkit | 57 | 24 | 42.1% | 0 | 28.1s | 46.4% | 56.8% |
| policy-exploration\|cannon-rally | 57 | 15 | 26.3% | 0 | 14.4s | 5.1% | 62.7% |
| policy-exploration\|medkit-entry | 57 | 27 | 47.4% | 0 | 27.4s | 51.1% | 51.0% |
| policy-exploration\|freeze-defense | 54 | 21 | 38.9% | 0 | 25.2s | 46.3% | 58.8% |
| policy-exploration\|cannon-focus | 51 | 20 | 39.2% | 0 | 22.6s | 46.6% | 60.0% |
| policy-exploration\|rally-core | 49 | 16 | 32.7% | 0 | 13.9s | 7.2% | 59.0% |
| policy-exploration\|rage-entry | 29 | 12 | 41.4% | 0 | 26.6s | 49.7% | 57.9% |
| policy-exploration\|freeze-rage | 27 | 11 | 40.7% | 0 | 24.0s | 52.8% | 58.2% |
| policy-exploration\|rally-rage | 24 | 8 | 33.3% | 0 | 15.4s | 12.0% | 52.5% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 180 | 124 | 68.9% | 0 | 28.5s | 72.0% | 30.5% |
| pure-unit-matrix\|diamond | 180 | 115 | 63.9% | 0 | 26.9s | 68.5% | 34.5% |
| pure-unit-matrix\|dual-flank | 180 | 127 | 70.6% | 0 | 25.0s | 73.9% | 29.3% |
| pure-unit-matrix\|left-flank | 180 | 147 | 81.7% | 0 | 27.0s | 70.9% | 16.3% |
| pure-unit-matrix\|right-flank | 180 | 130 | 72.2% | 0 | 25.7s | 68.4% | 25.8% |
| pure-unit-matrix\|three-lane | 180 | 134 | 74.4% | 0 | 24.2s | 74.6% | 25.4% |
| pure-unit-matrix\|vanguard-wedge | 180 | 121 | 67.2% | 0 | 28.0s | 69.4% | 31.7% |
| pure-unit-matrix\|wide-line | 180 | 137 | 76.1% | 0 | 28.5s | 74.8% | 22.9% |
| pure-unit-matrix\|inverted-wedge | 176 | 117 | 66.5% | 0 | 29.2s | 69.5% | 30.1% |
| pure-unit-matrix\|edge-sweep | 170 | 130 | 76.5% | 0 | 29.3s | 74.7% | 22.6% |
| policy-exploration\|center-column | 48 | 13 | 27.1% | 0 | 15.2s | 25.1% | 69.3% |
| policy-exploration\|vanguard-wedge | 48 | 21 | 43.8% | 0 | 27.8s | 42.9% | 48.4% |
| policy-exploration\|inverted-wedge | 47 | 21 | 44.7% | 0 | 22.3s | 38.5% | 50.5% |
| policy-exploration\|right-flank | 47 | 21 | 44.7% | 0 | 26.0s | 47.9% | 52.0% |
| policy-exploration\|wide-line | 47 | 18 | 38.3% | 0 | 22.4s | 38.7% | 60.3% |
| policy-exploration\|diamond | 46 | 15 | 32.6% | 0 | 23.0s | 36.5% | 62.9% |
| policy-exploration\|edge-sweep | 46 | 18 | 39.1% | 0 | 21.8s | 35.5% | 55.5% |
| policy-exploration\|left-flank | 46 | 21 | 45.7% | 0 | 20.3s | 30.4% | 51.6% |
| policy-exploration\|three-lane | 45 | 15 | 33.3% | 0 | 20.8s | 30.9% | 64.0% |
| policy-exploration\|dual-flank | 44 | 16 | 36.4% | 0 | 24.5s | 37.7% | 60.5% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 358 | 261 | 72.9% | 0 | 26.1s | 71.1% | 25.6% |
| pure-unit-matrix\|rapid | 358 | 253 | 70.7% | 0 | 26.6s | 71.6% | 27.6% |
| pure-unit-matrix\|two-waves | 358 | 256 | 71.5% | 0 | 27.0s | 71.3% | 27.7% |
| pure-unit-matrix\|drip | 356 | 263 | 73.9% | 0 | 29.4s | 73.7% | 24.5% |
| pure-unit-matrix\|three-waves | 356 | 249 | 69.9% | 0 | 26.9s | 70.7% | 29.2% |
| policy-exploration\|burst | 96 | 39 | 40.6% | 0 | 20.2s | 39.1% | 57.0% |
| policy-exploration\|drip | 94 | 37 | 39.4% | 0 | 25.5s | 41.1% | 56.3% |
| policy-exploration\|three-waves | 92 | 35 | 38.0% | 0 | 25.6s | 40.1% | 59.9% |
| policy-exploration\|rapid | 91 | 32 | 35.2% | 0 | 20.1s | 29.6% | 59.9% |
| policy-exploration\|two-waves | 91 | 36 | 39.6% | 0 | 20.6s | 31.9% | 54.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 893 | 642 | 71.9% | 0 | 26.8s | 71.5% | 26.8% |
| pure-unit-matrix\|tank-front-support-rear | 893 | 640 | 71.7% | 0 | 27.6s | 71.8% | 27.0% |
| policy-exploration\|roster-order | 232 | 89 | 38.4% | 0 | 21.8s | 35.8% | 57.4% |
| policy-exploration\|tank-front-support-rear | 232 | 90 | 38.8% | 0 | 23.0s | 37.0% | 57.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mimic | 208 | 150 | 72.1% | 0 | 33.1s | 67.8% | 24.8% |
| pure-mechanical_dragon | 207 | 157 | 75.8% | 0 | 27.4s | 74.9% | 22.9% |
| pure-mage | 200 | 138 | 69.0% | 0 | 18.9s | 72.7% | 29.7% |
| pure-fire_dragon | 196 | 189 | 96.4% | 0 | 14.4s | 83.7% | 3.4% |
| pure-knight | 196 | 121 | 61.7% | 0 | 26.9s | 62.8% | 36.5% |
| pure-archer | 194 | 136 | 70.1% | 0 | 24.5s | 71.1% | 28.9% |
| pure-demon_king | 193 | 165 | 85.5% | 0 | 26.8s | 78.6% | 11.9% |
| pure-necromancer | 190 | 117 | 61.6% | 0 | 30.4s | 62.8% | 37.8% |
| pure-pea_shooter | 189 | 124 | 65.6% | 0 | 30.2s | 69.7% | 33.0% |
| pure-wind_mage | 119 | 30 | 25.2% | 0 | 28.2s | 42.4% | 73.7% |
| pure-ice_golem | 59 | 23 | 39.0% | 0 | 56.5s | 42.1% | 61.0% |
| trap-runner-mix | 27 | 8 | 29.6% | 0 | 22.2s | 28.6% | 59.9% |
| random-1 | 25 | 8 | 32.0% | 0 | 21.3s | 38.9% | 65.8% |
| hero-necro-dragon-mages | 23 | 9 | 39.1% | 0 | 17.8s | 40.5% | 56.3% |
| ranged-pressure | 21 | 8 | 38.1% | 0 | 21.6s | 40.6% | 57.9% |
| core-mage-filled | 20 | 5 | 25.0% | 0 | 14.4s | 35.7% | 71.1% |
| air-pressure | 19 | 12 | 63.2% | 0 | 22.0s | 49.4% | 33.6% |
| support-mix | 19 | 5 | 26.3% | 0 | 26.9s | 30.1% | 71.7% |
| random-2 | 18 | 5 | 27.8% | 0 | 24.1s | 31.9% | 72.2% |
| core-fire_dragon-filled | 16 | 9 | 56.3% | 0 | 14.5s | 47.2% | 38.9% |
| core-mimic-filled | 16 | 9 | 56.3% | 0 | 30.4s | 34.2% | 31.3% |
| core-necromancer-filled | 12 | 4 | 33.3% | 0 | 23.3s | 34.0% | 61.8% |
| melee-pressure | 12 | 6 | 50.0% | 0 | 28.9s | 31.9% | 50.0% |
| balanced | 10 | 2 | 20.0% | 0 | 18.1s | 35.1% | 74.2% |
| random-4 | 10 | 3 | 30.0% | 0 | 22.3s | 30.7% | 64.2% |
| random-5 | 10 | 6 | 60.0% | 0 | 25.7s | 49.1% | 33.2% |
| core-demon_king-filled | 9 | 4 | 44.4% | 0 | 22.4s | 36.2% | 54.2% |
| frontline-ranged | 9 | 4 | 44.4% | 0 | 20.4s | 49.8% | 45.3% |
| random-6 | 8 | 2 | 25.0% | 0 | 19.3s | 26.6% | 70.0% |
| random-3 | 7 | 1 | 14.3% | 0 | 11.7s | 20.9% | 85.2% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__drip__tank-front-support-rear | 24 | 17 | 70.8% | 0 | 27.4s | 70.3% | 27.6% |
| center-column__rapid__roster-order | 24 | 14 | 58.3% | 0 | 23.4s | 53.9% | 39.0% |
| center-column__two-waves__roster-order | 24 | 12 | 50.0% | 0 | 23.5s | 57.7% | 48.3% |
| diamond__burst__tank-front-support-rear | 24 | 15 | 62.5% | 0 | 23.9s | 58.8% | 36.9% |
| diamond__three-waves__tank-front-support-rear | 24 | 10 | 41.7% | 0 | 26.8s | 54.5% | 57.9% |
| diamond__two-waves__tank-front-support-rear | 24 | 9 | 37.5% | 0 | 22.3s | 50.9% | 59.0% |
| dual-flank__drip__tank-front-support-rear | 24 | 15 | 62.5% | 0 | 26.4s | 61.7% | 37.5% |
| inverted-wedge__rapid__roster-order | 24 | 14 | 58.3% | 0 | 27.2s | 64.1% | 35.5% |
| left-flank__rapid__tank-front-support-rear | 24 | 12 | 50.0% | 0 | 23.8s | 48.2% | 44.7% |
| right-flank__rapid__tank-front-support-rear | 24 | 12 | 50.0% | 0 | 27.1s | 60.7% | 41.7% |
| right-flank__two-waves__tank-front-support-rear | 24 | 14 | 58.3% | 0 | 25.6s | 60.6% | 40.8% |
| three-lane__burst__tank-front-support-rear | 24 | 16 | 66.7% | 0 | 21.1s | 67.6% | 32.5% |
| vanguard-wedge__burst__roster-order | 24 | 12 | 50.0% | 0 | 23.2s | 54.4% | 50.0% |
| vanguard-wedge__rapid__roster-order | 24 | 13 | 54.2% | 0 | 24.9s | 59.4% | 45.5% |
| wide-line__rapid__roster-order | 24 | 16 | 66.7% | 0 | 25.3s | 61.8% | 28.5% |
| center-column__burst__roster-order | 23 | 12 | 52.2% | 0 | 24.9s | 58.1% | 45.0% |
| center-column__drip__roster-order | 23 | 13 | 56.5% | 0 | 26.3s | 57.8% | 41.6% |
| center-column__three-waves__roster-order | 23 | 13 | 56.5% | 0 | 23.8s | 60.8% | 43.5% |
| center-column__three-waves__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 27.0s | 65.3% | 38.5% |
| diamond__burst__roster-order | 23 | 12 | 52.2% | 0 | 23.2s | 62.7% | 42.0% |
| diamond__rapid__tank-front-support-rear | 23 | 13 | 56.5% | 0 | 29.3s | 64.3% | 41.3% |
| dual-flank__burst__roster-order | 23 | 17 | 73.9% | 0 | 23.0s | 73.9% | 24.6% |
| dual-flank__three-waves__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 24.5s | 66.0% | 39.1% |
| dual-flank__two-waves__roster-order | 23 | 14 | 60.9% | 0 | 22.6s | 64.6% | 36.5% |
| dual-flank__two-waves__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 23.9s | 62.2% | 36.6% |
| edge-sweep__drip__roster-order | 23 | 18 | 78.3% | 0 | 35.9s | 74.9% | 20.4% |
| edge-sweep__three-waves__roster-order | 23 | 13 | 56.5% | 0 | 26.0s | 55.8% | 43.5% |
| inverted-wedge__burst__roster-order | 23 | 17 | 73.9% | 0 | 27.7s | 63.5% | 23.6% |
| inverted-wedge__burst__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 25.6s | 62.9% | 36.3% |
| inverted-wedge__drip__roster-order | 23 | 16 | 69.6% | 0 | 29.0s | 68.8% | 23.7% |
| inverted-wedge__three-waves__roster-order | 23 | 13 | 56.5% | 0 | 26.1s | 62.5% | 41.5% |
| inverted-wedge__two-waves__roster-order | 23 | 15 | 65.2% | 0 | 29.4s | 59.2% | 34.4% |
| left-flank__burst__tank-front-support-rear | 23 | 14 | 60.9% | 0 | 27.4s | 55.7% | 34.7% |
| left-flank__drip__roster-order | 23 | 15 | 65.2% | 0 | 28.1s | 65.8% | 30.7% |
| left-flank__drip__tank-front-support-rear | 23 | 20 | 87.0% | 0 | 28.0s | 71.1% | 12.0% |
| left-flank__two-waves__roster-order | 23 | 21 | 91.3% | 0 | 27.1s | 69.0% | 5.7% |
| right-flank__burst__roster-order | 23 | 14 | 60.9% | 0 | 23.4s | 59.4% | 37.4% |
| right-flank__burst__tank-front-support-rear | 23 | 18 | 78.3% | 0 | 27.0s | 66.5% | 19.7% |
| right-flank__drip__roster-order | 23 | 14 | 60.9% | 0 | 27.1s | 62.7% | 37.8% |
| right-flank__drip__tank-front-support-rear | 23 | 16 | 69.6% | 0 | 27.2s | 62.2% | 30.4% |
| right-flank__three-waves__tank-front-support-rear | 23 | 16 | 69.6% | 0 | 24.3s | 66.7% | 29.9% |
| three-lane__drip__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 23.6s | 67.8% | 34.8% |
| three-lane__three-waves__roster-order | 23 | 12 | 52.2% | 0 | 20.9s | 54.2% | 46.8% |
| three-lane__two-waves__roster-order | 23 | 13 | 56.5% | 0 | 19.4s | 53.5% | 40.1% |
| three-lane__two-waves__tank-front-support-rear | 23 | 17 | 73.9% | 0 | 27.5s | 70.9% | 26.1% |
| vanguard-wedge__burst__tank-front-support-rear | 23 | 16 | 69.6% | 0 | 24.4s | 60.3% | 29.1% |
| vanguard-wedge__three-waves__roster-order | 23 | 12 | 52.2% | 0 | 27.5s | 65.5% | 44.8% |
| vanguard-wedge__three-waves__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 32.7s | 68.5% | 30.3% |
| vanguard-wedge__two-waves__roster-order | 23 | 15 | 65.2% | 0 | 25.9s | 64.7% | 33.3% |
| vanguard-wedge__two-waves__tank-front-support-rear | 23 | 17 | 73.9% | 0 | 32.9s | 68.5% | 22.1% |
| wide-line__burst__roster-order | 23 | 15 | 65.2% | 0 | 23.7s | 70.3% | 34.8% |
| wide-line__drip__roster-order | 23 | 17 | 73.9% | 0 | 29.4s | 71.4% | 26.1% |
| wide-line__drip__tank-front-support-rear | 23 | 12 | 52.2% | 0 | 30.9s | 65.0% | 43.5% |
| wide-line__rapid__tank-front-support-rear | 23 | 15 | 65.2% | 0 | 27.0s | 56.5% | 34.8% |
| wide-line__three-waves__tank-front-support-rear | 23 | 18 | 78.3% | 0 | 29.0s | 76.0% | 20.5% |
| center-column__rapid__tank-front-support-rear | 22 | 14 | 63.6% | 0 | 26.6s | 63.9% | 35.7% |
| diamond__drip__roster-order | 22 | 14 | 63.6% | 0 | 27.4s | 65.3% | 36.4% |
| diamond__drip__tank-front-support-rear | 22 | 14 | 63.6% | 0 | 32.5s | 72.6% | 31.9% |
| diamond__three-waves__roster-order | 22 | 17 | 77.3% | 0 | 27.4s | 67.0% | 22.7% |
| dual-flank__burst__tank-front-support-rear | 22 | 13 | 59.1% | 0 | 24.1s | 64.1% | 40.9% |
| dual-flank__rapid__roster-order | 22 | 17 | 77.3% | 0 | 25.1s | 74.3% | 22.7% |
| dual-flank__rapid__tank-front-support-rear | 22 | 13 | 59.1% | 0 | 24.7s | 70.9% | 40.6% |
| edge-sweep__burst__tank-front-support-rear | 22 | 18 | 81.8% | 0 | 27.7s | 70.3% | 15.9% |
| edge-sweep__rapid__roster-order | 22 | 11 | 50.0% | 0 | 23.9s | 59.9% | 45.3% |
| edge-sweep__rapid__tank-front-support-rear | 22 | 16 | 72.7% | 0 | 26.7s | 67.4% | 21.7% |
| left-flank__burst__roster-order | 22 | 18 | 81.8% | 0 | 24.3s | 65.6% | 15.5% |
| left-flank__rapid__roster-order | 22 | 18 | 81.8% | 0 | 24.7s | 67.2% | 18.2% |
| left-flank__three-waves__roster-order | 22 | 18 | 81.8% | 0 | 21.9s | 63.0% | 18.2% |
| left-flank__three-waves__tank-front-support-rear | 22 | 17 | 77.3% | 0 | 26.4s | 68.1% | 22.3% |
| left-flank__two-waves__tank-front-support-rear | 22 | 15 | 68.2% | 0 | 24.4s | 53.5% | 31.5% |
| right-flank__two-waves__roster-order | 22 | 18 | 81.8% | 0 | 26.9s | 73.3% | 14.4% |
| three-lane__burst__roster-order | 22 | 12 | 54.5% | 0 | 22.1s | 61.8% | 44.7% |
| three-lane__drip__roster-order | 22 | 17 | 77.3% | 0 | 24.5s | 73.7% | 22.7% |
| three-lane__rapid__tank-front-support-rear | 22 | 18 | 81.8% | 0 | 26.0s | 70.1% | 18.1% |
| three-lane__three-waves__tank-front-support-rear | 22 | 13 | 59.1% | 0 | 26.0s | 65.1% | 40.8% |
| vanguard-wedge__drip__roster-order | 22 | 15 | 68.2% | 0 | 34.9s | 68.1% | 26.7% |
| vanguard-wedge__drip__tank-front-support-rear | 22 | 15 | 68.2% | 0 | 29.6s | 66.8% | 26.6% |
| wide-line__burst__tank-front-support-rear | 22 | 17 | 77.3% | 0 | 24.5s | 74.5% | 22.7% |
| wide-line__three-waves__roster-order | 22 | 14 | 63.6% | 0 | 33.0s | 65.7% | 36.4% |
| wide-line__two-waves__roster-order | 22 | 14 | 63.6% | 0 | 23.1s | 61.5% | 36.4% |
| wide-line__two-waves__tank-front-support-rear | 22 | 17 | 77.3% | 0 | 26.9s | 70.9% | 22.7% |
| center-column__burst__tank-front-support-rear | 21 | 15 | 71.4% | 0 | 29.0s | 70.2% | 28.6% |
| center-column__two-waves__tank-front-support-rear | 21 | 13 | 61.9% | 0 | 25.4s | 64.4% | 38.1% |
| diamond__rapid__roster-order | 21 | 13 | 61.9% | 0 | 23.4s | 59.7% | 35.8% |
| diamond__two-waves__roster-order | 21 | 13 | 61.9% | 0 | 25.5s | 66.2% | 34.9% |
| dual-flank__drip__roster-order | 21 | 13 | 61.9% | 0 | 27.6s | 63.8% | 37.7% |
| dual-flank__three-waves__roster-order | 21 | 13 | 61.9% | 0 | 27.7s | 66.3% | 38.1% |
| edge-sweep__burst__roster-order | 21 | 15 | 71.4% | 0 | 28.1s | 69.0% | 27.8% |
| edge-sweep__three-waves__tank-front-support-rear | 21 | 14 | 66.7% | 0 | 24.8s | 63.3% | 33.3% |
| edge-sweep__two-waves__roster-order | 21 | 14 | 66.7% | 0 | 25.9s | 63.4% | 29.7% |
| edge-sweep__two-waves__tank-front-support-rear | 21 | 15 | 71.4% | 0 | 27.1s | 68.5% | 28.6% |
| inverted-wedge__drip__tank-front-support-rear | 21 | 10 | 47.6% | 0 | 25.9s | 55.6% | 46.1% |
| inverted-wedge__rapid__tank-front-support-rear | 21 | 13 | 61.9% | 0 | 25.7s | 59.6% | 34.6% |
| inverted-wedge__three-waves__tank-front-support-rear | 21 | 14 | 66.7% | 0 | 31.3s | 69.1% | 29.2% |
| inverted-wedge__two-waves__tank-front-support-rear | 21 | 12 | 57.1% | 0 | 30.0s | 64.3% | 40.5% |
| right-flank__rapid__roster-order | 21 | 15 | 71.4% | 0 | 22.5s | 64.5% | 28.6% |
| right-flank__three-waves__roster-order | 21 | 14 | 66.7% | 0 | 26.2s | 66.1% | 29.7% |
| three-lane__rapid__roster-order | 21 | 16 | 76.2% | 0 | 24.4s | 75.5% | 23.7% |
| vanguard-wedge__rapid__tank-front-support-rear | 21 | 12 | 57.1% | 0 | 23.8s | 63.0% | 43.0% |
| edge-sweep__drip__tank-front-support-rear | 20 | 14 | 70.0% | 0 | 30.4s | 71.6% | 30.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 228 | 137 | 60.1% | 0 | 25.7s | 62.1% | 38.7% |
| vanguard-wedge | 228 | 142 | 62.3% | 0 | 27.9s | 63.8% | 35.3% |
| right-flank | 227 | 151 | 66.5% | 0 | 25.7s | 64.2% | 31.2% |
| wide-line | 227 | 155 | 68.3% | 0 | 27.3s | 67.3% | 30.6% |
| diamond | 226 | 130 | 57.5% | 0 | 26.1s | 62.0% | 40.2% |
| left-flank | 226 | 168 | 74.3% | 0 | 25.6s | 62.6% | 23.5% |
| three-lane | 225 | 149 | 66.2% | 0 | 23.5s | 65.9% | 33.2% |
| dual-flank | 224 | 143 | 63.8% | 0 | 24.9s | 66.8% | 35.4% |
| inverted-wedge | 223 | 138 | 61.9% | 0 | 27.8s | 63.0% | 34.4% |
| edge-sweep | 216 | 148 | 68.5% | 0 | 27.7s | 66.3% | 29.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 454 | 300 | 66.1% | 0 | 24.9s | 64.4% | 32.3% |
| drip | 450 | 300 | 66.7% | 0 | 28.6s | 66.9% | 31.2% |
| rapid | 449 | 285 | 63.5% | 0 | 25.3s | 63.1% | 34.1% |
| two-waves | 449 | 292 | 65.0% | 0 | 25.7s | 63.3% | 33.1% |
| three-waves | 448 | 284 | 63.4% | 0 | 26.6s | 64.4% | 35.5% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 1125 | 731 | 65.0% | 0 | 25.8s | 64.1% | 33.1% |
| tank-front-support-rear | 1125 | 730 | 64.9% | 0 | 26.7s | 64.7% | 33.3% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 1845 | 1307 | 70.8% | 0 | 27.1s | 70.8% | 27.9% |
| cannon-medkit | 57 | 24 | 42.1% | 0 | 28.1s | 46.4% | 56.8% |
| cannon-rally | 57 | 15 | 26.3% | 0 | 14.4s | 5.1% | 62.7% |
| medkit-entry | 57 | 27 | 47.4% | 0 | 27.4s | 51.1% | 51.0% |
| freeze-defense | 54 | 21 | 38.9% | 0 | 25.2s | 46.3% | 58.8% |
| cannon-focus | 51 | 20 | 39.2% | 0 | 22.6s | 46.6% | 60.0% |
| rally-core | 49 | 16 | 32.7% | 0 | 13.9s | 7.2% | 59.0% |
| rage-entry | 29 | 12 | 41.4% | 0 | 26.6s | 49.7% | 57.9% |
| freeze-rage | 27 | 11 | 40.7% | 0 | 24.0s | 52.8% | 58.2% |
| rally-rage | 24 | 8 | 33.3% | 0 | 15.4s | 12.0% | 52.5% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 443 | 372 | 84.0% | 0 | 20.9s | 75.6% | 14.3% |
| epic | 108 | 33 | 30.6% | 0 | 19.4s | 31.3% | 62.7% |
| unrevealed | 85 | 44 | 51.8% | 0 | 22.2s | 45.4% | 45.5% |
| legendary | 81 | 32 | 39.5% | 0 | 23.0s | 43.3% | 55.3% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 222 | 173 | 77.9% | 0 | 26.4s | 72.1% | 19.4% |
| fire_dragon\|common | 221 | 199 | 90.0% | 0 | 15.4s | 79.0% | 9.1% |
| demon_king\|epic | 60 | 17 | 28.3% | 0 | 20.4s | 30.2% | 65.3% |
| fire_dragon\|epic | 48 | 16 | 33.3% | 0 | 18.1s | 32.8% | 59.3% |
| fire_dragon\|unrevealed | 45 | 24 | 53.3% | 0 | 21.0s | 47.0% | 43.7% |
| fire_dragon\|legendary | 43 | 17 | 39.5% | 0 | 23.1s | 44.8% | 54.5% |
| demon_king\|unrevealed | 40 | 20 | 50.0% | 0 | 23.5s | 43.5% | 47.6% |
| demon_king\|legendary | 38 | 15 | 39.5% | 0 | 22.8s | 41.6% | 56.1% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1887 | 1321 | 70.0% | 0 | 26.9s | 69.8% | 28.5% |
| ward-2 | 124 | 51 | 41.1% | 0 | 23.5s | 37.3% | 55.3% |
| ward-1 | 122 | 45 | 36.9% | 0 | 24.1s | 37.3% | 58.8% |
| ward-3 | 117 | 44 | 37.6% | 0 | 20.3s | 34.0% | 59.1% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1879 | 1360 | 72.4% | 0 | 27.0s | 71.2% | 26.3% |
| low | 128 | 50 | 39.1% | 0 | 25.3s | 40.7% | 56.3% |
| mixed | 125 | 26 | 20.8% | 0 | 19.4s | 21.2% | 77.1% |
| mid | 118 | 25 | 21.2% | 0 | 21.9s | 28.4% | 72.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 439 | 209 | 47.6% | 0 | 24.1s | 47.8% | 48.9% |
| archer | 414 | 211 | 51.0% | 0 | 23.4s | 52.0% | 45.8% |
| demon_king | 360 | 225 | 62.5% | 0 | 24.7s | 58.8% | 34.1% |
| fire_dragon | 357 | 256 | 71.7% | 0 | 17.4s | 64.6% | 25.7% |
| necromancer | 322 | 161 | 50.0% | 0 | 26.7s | 51.5% | 48.3% |
| mechanical_dragon | 321 | 199 | 62.0% | 0 | 25.5s | 61.3% | 35.9% |
| mage | 320 | 177 | 55.3% | 0 | 19.1s | 59.5% | 42.5% |
| mimic | 314 | 191 | 60.8% | 0 | 29.9s | 56.4% | 35.2% |
| pea_shooter | 249 | 145 | 58.2% | 0 | 28.1s | 61.7% | 40.3% |
| wind_mage | 150 | 36 | 24.0% | 0 | 26.8s | 38.5% | 74.8% |
| ice_golem | 92 | 28 | 30.4% | 0 | 44.7s | 37.2% | 66.8% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 180 | 73.3% | 66.4%-79.3% | 73.9% | 26.2% | 46.2% |
| demon_king | 180 | 87.8% | 82.2%-91.8% | 81.4% | 9.5% | 72.4% |
| fire_dragon | 180 | 100.0% | 97.9%-100.0% | 87.4% | 0.0% | 98.1% |
| ice_golem | 53 | 37.7% | 25.9%-51.2% | 43.6% | 62.3% | 20.8% |
| knight | 180 | 65.6% | 58.4%-72.1% | 66.3% | 32.8% | 43.9% |
| mage | 180 | 73.3% | 66.4%-79.3% | 76.5% | 25.2% | 43.9% |
| mechanical_dragon | 180 | 81.1% | 74.8%-86.2% | 79.6% | 17.9% | 62.8% |
| mimic | 180 | 75.6% | 68.8%-81.3% | 73.7% | 21.7% | 68.2% |
| necromancer | 180 | 61.7% | 54.4%-68.5% | 63.3% | 37.7% | 49.7% |
| pea_shooter | 180 | 66.7% | 59.5%-73.1% | 70.8% | 32.0% | 41.1% |
| wind_mage | 113 | 25.7% | 18.5%-34.4% | 43.7% | 73.2% | 18.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 67 | 92.5% | 83.7%-96.8% | 84.7% | 7.5% | 60.5% |
| archer\|TH8 | 60 | 58.3% | 45.7%-69.9% | 67.2% | 41.5% | 32.5% |
| archer\|TH9 | 53 | 66.0% | 52.6%-77.3% | 70.0% | 32.4% | 43.5% |
| demon_king\|TH7 | 67 | 94.0% | 85.6%-97.7% | 85.2% | 4.2% | 81.2% |
| demon_king\|TH8 | 60 | 76.7% | 64.6%-85.6% | 76.4% | 19.7% | 57.6% |
| demon_king\|TH9 | 53 | 92.5% | 82.1%-97.0% | 82.9% | 4.6% | 77.9% |
| fire_dragon\|TH7 | 67 | 100.0% | 94.6%-100.0% | 90.2% | 0.0% | 98.9% |
| fire_dragon\|TH8 | 60 | 100.0% | 94.0%-100.0% | 87.2% | 0.0% | 98.3% |
| fire_dragon\|TH9 | 53 | 100.0% | 93.2%-100.0% | 84.7% | 0.0% | 96.7% |
| ice_golem\|TH9 | 53 | 37.7% | 25.9%-51.2% | 43.6% | 62.3% | 20.8% |
| knight\|TH7 | 67 | 79.1% | 67.9%-87.1% | 79.2% | 16.7% | 55.8% |
| knight\|TH8 | 60 | 53.3% | 40.9%-65.4% | 56.2% | 46.5% | 31.4% |
| knight\|TH9 | 53 | 62.3% | 48.8%-74.1% | 63.7% | 37.7% | 43.1% |
| mage\|TH7 | 67 | 92.5% | 83.7%-96.8% | 84.9% | 5.5% | 56.5% |
| mage\|TH8 | 60 | 55.0% | 42.5%-66.9% | 69.7% | 45.0% | 31.9% |
| mage\|TH9 | 53 | 69.8% | 56.5%-80.5% | 75.1% | 27.7% | 41.5% |
| mechanical_dragon\|TH7 | 67 | 97.0% | 89.8%-99.2% | 88.8% | 2.7% | 77.1% |
| mechanical_dragon\|TH8 | 60 | 71.7% | 59.2%-81.5% | 75.4% | 27.3% | 51.9% |
| mechanical_dragon\|TH9 | 53 | 71.7% | 58.4%-82.0% | 74.7% | 26.4% | 57.0% |
| mimic\|TH7 | 67 | 85.1% | 74.7%-91.7% | 80.1% | 11.5% | 78.8% |
| mimic\|TH8 | 60 | 60.0% | 47.4%-71.4% | 65.9% | 38.4% | 50.7% |
| mimic\|TH9 | 53 | 81.1% | 68.6%-89.4% | 75.5% | 15.8% | 74.7% |
| necromancer\|TH7 | 67 | 79.1% | 67.9%-87.1% | 73.2% | 19.1% | 61.2% |
| necromancer\|TH8 | 60 | 50.0% | 37.7%-62.3% | 57.3% | 50.0% | 38.3% |
| necromancer\|TH9 | 53 | 52.8% | 39.7%-65.6% | 59.5% | 47.2% | 48.1% |
| pea_shooter\|TH7 | 67 | 82.1% | 71.3%-89.4% | 83.1% | 15.2% | 54.4% |
| pea_shooter\|TH8 | 60 | 53.3% | 40.9%-65.4% | 61.6% | 45.9% | 29.8% |
| pea_shooter\|TH9 | 53 | 62.3% | 48.8%-74.1% | 67.8% | 37.7% | 37.1% |
| wind_mage\|TH8 | 60 | 16.7% | 9.3%-28.0% | 42.0% | 81.4% | 12.5% |
| wind_mage\|TH9 | 53 | 35.8% | 24.3%-49.3% | 45.5% | 63.8% | 25.5% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 11 | 63.6% | 35.4%-84.8% | 65.1% | 36.4% | 42.2% |
| archer\|asymmetric-right | 11 | 63.6% | 35.4%-84.8% | 69.8% | 36.4% | 40.2% |
| archer\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 84.8% | 0.0% | 65.7% |
| archer\|compact-core | 10 | 60.0% | 31.3%-83.2% | 71.8% | 37.0% | 33.3% |
| archer\|corner-keep | 9 | 88.9% | 56.5%-98.0% | 79.3% | 11.1% | 44.2% |
| archer\|crossfire | 9 | 66.7% | 35.4%-87.9% | 69.9% | 33.3% | 49.6% |
| archer\|defense-ring | 11 | 72.7% | 43.4%-90.3% | 76.9% | 23.6% | 50.1% |
| archer\|diamond | 10 | 50.0% | 23.7%-76.3% | 63.7% | 49.1% | 30.7% |
| archer\|echelon-left | 9 | 88.9% | 56.5%-98.0% | 75.0% | 11.1% | 50.9% |
| archer\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 76.5% | 11.1% | 48.9% |
| archer\|kill-corridor | 8 | 62.5% | 30.6%-86.3% | 67.4% | 37.5% | 34.7% |
| archer\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 71.3% | 36.4% | 35.8% |
| archer\|rear-keep | 10 | 80.0% | 49.0%-94.3% | 78.3% | 20.0% | 55.1% |
| archer\|resource-shield | 11 | 54.5% | 28.0%-78.7% | 65.4% | 45.5% | 39.8% |
| archer\|southern-funnel | 10 | 70.0% | 39.7%-89.2% | 76.2% | 30.0% | 41.1% |
| archer\|split-core | 9 | 88.9% | 56.5%-98.0% | 80.5% | 11.1% | 55.8% |
| archer\|trap-lanes | 11 | 81.8% | 52.3%-94.9% | 76.6% | 18.2% | 50.5% |
| archer\|wide-spread | 12 | 83.3% | 55.2%-95.3% | 83.0% | 15.8% | 62.6% |
| demon_king\|asymmetric-left | 11 | 81.8% | 52.3%-94.9% | 75.2% | 18.2% | 61.0% |
| demon_king\|asymmetric-right | 11 | 72.7% | 43.4%-90.3% | 75.4% | 22.3% | 62.3% |
| demon_king\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 85.1% | 0.0% | 85.7% |
| demon_king\|compact-core | 10 | 60.0% | 31.3%-83.2% | 77.0% | 16.0% | 47.1% |
| demon_king\|corner-keep | 9 | 88.9% | 56.5%-98.0% | 83.8% | 11.1% | 71.4% |
| demon_king\|crossfire | 9 | 88.9% | 56.5%-98.0% | 82.4% | 9.9% | 74.6% |
| demon_king\|defense-ring | 11 | 90.9% | 62.3%-98.4% | 86.7% | 5.9% | 83.1% |
| demon_king\|diamond | 10 | 90.0% | 59.6%-98.2% | 83.5% | 10.0% | 71.4% |
| demon_king\|echelon-left | 9 | 88.9% | 56.5%-98.0% | 82.4% | 11.1% | 69.8% |
| demon_king\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 82.1% | 5.0% | 76.2% |
| demon_king\|kill-corridor | 8 | 100.0% | 67.6%-100.0% | 83.2% | 0.0% | 78.6% |
| demon_king\|layered-rings | 11 | 81.8% | 52.3%-94.9% | 79.6% | 18.2% | 63.6% |
| demon_king\|rear-keep | 10 | 90.0% | 59.6%-98.2% | 87.0% | 6.0% | 84.3% |
| demon_king\|resource-shield | 11 | 100.0% | 74.1%-100.0% | 81.8% | 0.0% | 67.5% |
| demon_king\|southern-funnel | 10 | 90.0% | 59.6%-98.2% | 76.0% | 10.0% | 68.6% |
| demon_king\|split-core | 9 | 88.9% | 56.5%-98.0% | 75.6% | 11.1% | 77.8% |
| demon_king\|trap-lanes | 11 | 90.9% | 62.3%-98.4% | 82.0% | 9.1% | 74.0% |
| demon_king\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 87.1% | 4.1% | 88.1% |
| fire_dragon\|asymmetric-left | 11 | 100.0% | 74.1%-100.0% | 81.8% | 0.0% | 100.0% |
| fire_dragon\|asymmetric-right | 11 | 100.0% | 74.1%-100.0% | 85.0% | 0.0% | 100.0% |
| fire_dragon\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 86.6% | 0.0% | 97.2% |
| fire_dragon\|compact-core | 10 | 100.0% | 72.2%-100.0% | 88.6% | 0.0% | 95.0% |
| fire_dragon\|corner-keep | 9 | 100.0% | 70.1%-100.0% | 85.4% | 0.0% | 100.0% |
| fire_dragon\|crossfire | 9 | 100.0% | 70.1%-100.0% | 89.0% | 0.0% | 97.2% |
| fire_dragon\|defense-ring | 11 | 100.0% | 74.1%-100.0% | 89.4% | 0.0% | 100.0% |
| fire_dragon\|diamond | 10 | 100.0% | 72.2%-100.0% | 89.4% | 0.0% | 97.5% |
| fire_dragon\|echelon-left | 9 | 100.0% | 70.1%-100.0% | 88.7% | 0.0% | 100.0% |
| fire_dragon\|echelon-right | 9 | 100.0% | 70.1%-100.0% | 88.7% | 0.0% | 100.0% |
| fire_dragon\|kill-corridor | 8 | 100.0% | 67.6%-100.0% | 87.9% | 0.0% | 96.9% |
| fire_dragon\|layered-rings | 11 | 100.0% | 74.1%-100.0% | 88.7% | 0.0% | 97.7% |
| fire_dragon\|rear-keep | 10 | 100.0% | 72.2%-100.0% | 89.4% | 0.0% | 100.0% |
| fire_dragon\|resource-shield | 11 | 100.0% | 74.1%-100.0% | 86.2% | 0.0% | 90.9% |
| fire_dragon\|southern-funnel | 10 | 100.0% | 72.2%-100.0% | 88.8% | 0.0% | 97.5% |
| fire_dragon\|split-core | 9 | 100.0% | 70.1%-100.0% | 89.3% | 0.0% | 97.2% |
| fire_dragon\|trap-lanes | 11 | 100.0% | 74.1%-100.0% | 85.4% | 0.0% | 97.7% |
| fire_dragon\|wide-spread | 12 | 100.0% | 75.7%-100.0% | 85.7% | 0.0% | 100.0% |
| knight\|asymmetric-left | 11 | 54.5% | 28.0%-78.7% | 57.2% | 45.5% | 37.2% |
| knight\|asymmetric-right | 11 | 45.5% | 21.3%-72.0% | 61.4% | 54.4% | 37.6% |
| knight\|cannon-screen | 9 | 77.8% | 45.3%-93.7% | 72.3% | 22.2% | 58.5% |
| knight\|compact-core | 10 | 50.0% | 23.7%-76.3% | 62.9% | 49.6% | 34.0% |
| knight\|corner-keep | 9 | 77.8% | 45.3%-93.7% | 73.5% | 14.2% | 43.5% |
| knight\|crossfire | 9 | 77.8% | 45.3%-93.7% | 70.5% | 22.2% | 56.0% |
| knight\|defense-ring | 11 | 72.7% | 43.4%-90.3% | 70.3% | 21.6% | 49.7% |
| knight\|diamond | 10 | 50.0% | 23.7%-76.3% | 65.0% | 47.9% | 34.0% |
| knight\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 69.0% | 31.7% | 46.4% |
| knight\|echelon-right | 9 | 77.8% | 45.3%-93.7% | 67.0% | 22.0% | 48.6% |
| knight\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 47.7% | 50.0% | 20.0% |
| knight\|layered-rings | 11 | 54.5% | 28.0%-78.7% | 61.4% | 39.5% | 39.6% |
| knight\|rear-keep | 10 | 70.0% | 39.7%-89.2% | 74.3% | 30.0% | 50.9% |
| knight\|resource-shield | 11 | 54.5% | 28.0%-78.7% | 60.0% | 41.5% | 32.9% |
| knight\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 59.8% | 39.0% | 36.4% |
| knight\|split-core | 9 | 77.8% | 45.3%-93.7% | 71.0% | 22.2% | 55.8% |
| knight\|trap-lanes | 11 | 72.7% | 43.4%-90.3% | 65.1% | 27.3% | 47.7% |
| knight\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 82.6% | 8.3% | 60.4% |
| mage\|asymmetric-left | 11 | 72.7% | 43.4%-90.3% | 70.0% | 27.3% | 36.4% |
| mage\|asymmetric-right | 11 | 54.5% | 28.0%-78.7% | 65.6% | 45.5% | 36.4% |
| mage\|cannon-screen | 9 | 77.8% | 45.3%-93.7% | 79.2% | 22.2% | 54.0% |
| mage\|compact-core | 10 | 70.0% | 39.7%-89.2% | 71.5% | 30.0% | 34.3% |
| mage\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 74.4% | 38.0% | 33.3% |
| mage\|crossfire | 9 | 66.7% | 35.4%-87.9% | 78.6% | 25.3% | 46.0% |
| mage\|defense-ring | 11 | 81.8% | 52.3%-94.9% | 82.3% | 18.2% | 53.2% |
| mage\|diamond | 10 | 70.0% | 39.7%-89.2% | 77.2% | 25.6% | 41.4% |
| mage\|echelon-left | 9 | 88.9% | 56.5%-98.0% | 78.0% | 11.1% | 42.9% |
| mage\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 83.9% | 11.1% | 55.6% |
| mage\|kill-corridor | 8 | 75.0% | 40.9%-92.9% | 78.5% | 25.0% | 46.4% |
| mage\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 74.2% | 36.4% | 32.5% |
| mage\|rear-keep | 10 | 80.0% | 49.0%-94.3% | 78.3% | 20.0% | 51.4% |
| mage\|resource-shield | 11 | 63.6% | 35.4%-84.8% | 71.0% | 33.7% | 36.4% |
| mage\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 72.1% | 34.2% | 28.6% |
| mage\|split-core | 9 | 88.9% | 56.5%-98.0% | 82.0% | 11.1% | 52.4% |
| mage\|trap-lanes | 11 | 81.8% | 52.3%-94.9% | 79.8% | 18.2% | 57.1% |
| mage\|wide-spread | 12 | 83.3% | 55.2%-95.3% | 82.8% | 16.7% | 53.6% |
| mechanical_dragon\|asymmetric-left | 11 | 72.7% | 43.4%-90.3% | 72.5% | 27.3% | 58.6% |
| mechanical_dragon\|asymmetric-right | 11 | 63.6% | 35.4%-84.8% | 72.5% | 35.9% | 56.6% |
| mechanical_dragon\|cannon-screen | 9 | 100.0% | 70.1%-100.0% | 86.0% | 0.0% | 77.8% |
| mechanical_dragon\|compact-core | 10 | 80.0% | 49.0%-94.3% | 75.6% | 19.8% | 45.6% |
| mechanical_dragon\|corner-keep | 9 | 88.9% | 56.5%-98.0% | 82.3% | 10.7% | 64.2% |
| mechanical_dragon\|crossfire | 9 | 66.7% | 35.4%-87.9% | 79.8% | 25.3% | 63.0% |
| mechanical_dragon\|defense-ring | 11 | 90.9% | 62.3%-98.4% | 82.1% | 9.0% | 62.6% |
| mechanical_dragon\|diamond | 10 | 90.0% | 59.6%-98.2% | 85.4% | 5.1% | 62.2% |
| mechanical_dragon\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 74.4% | 31.2% | 54.3% |
| mechanical_dragon\|echelon-right | 9 | 100.0% | 70.1%-100.0% | 85.1% | 0.0% | 76.5% |
| mechanical_dragon\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 68.1% | 49.2% | 38.9% |
| mechanical_dragon\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 69.8% | 34.3% | 47.5% |
| mechanical_dragon\|rear-keep | 10 | 90.0% | 59.6%-98.2% | 87.5% | 9.8% | 74.4% |
| mechanical_dragon\|resource-shield | 11 | 63.6% | 35.4%-84.8% | 71.5% | 36.4% | 47.5% |
| mechanical_dragon\|southern-funnel | 10 | 90.0% | 59.6%-98.2% | 85.2% | 10.0% | 67.8% |
| mechanical_dragon\|split-core | 9 | 88.9% | 56.5%-98.0% | 81.4% | 11.1% | 70.4% |
| mechanical_dragon\|trap-lanes | 11 | 90.9% | 62.3%-98.4% | 84.1% | 9.1% | 74.7% |
| mechanical_dragon\|wide-spread | 12 | 100.0% | 75.7%-100.0% | 89.3% | 0.0% | 84.3% |
| mimic\|asymmetric-left | 11 | 54.5% | 28.0%-78.7% | 64.1% | 36.7% | 49.1% |
| mimic\|asymmetric-right | 11 | 72.7% | 43.4%-90.3% | 68.6% | 27.3% | 67.3% |
| mimic\|cannon-screen | 9 | 88.9% | 56.5%-98.0% | 83.0% | 4.7% | 84.4% |
| mimic\|compact-core | 10 | 60.0% | 31.3%-83.2% | 65.9% | 40.0% | 52.0% |
| mimic\|corner-keep | 9 | 77.8% | 45.3%-93.7% | 79.0% | 22.2% | 73.3% |
| mimic\|crossfire | 9 | 66.7% | 35.4%-87.9% | 70.5% | 33.3% | 62.2% |
| mimic\|defense-ring | 11 | 90.9% | 62.3%-98.4% | 82.8% | 9.1% | 81.8% |
| mimic\|diamond | 10 | 70.0% | 39.7%-89.2% | 72.4% | 25.4% | 62.0% |
| mimic\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 70.5% | 24.0% | 64.4% |
| mimic\|echelon-right | 9 | 77.8% | 45.3%-93.7% | 77.4% | 22.2% | 73.3% |
| mimic\|kill-corridor | 8 | 87.5% | 52.9%-97.8% | 75.8% | 12.5% | 57.5% |
| mimic\|layered-rings | 11 | 63.6% | 35.4%-84.8% | 70.8% | 27.7% | 56.4% |
| mimic\|rear-keep | 10 | 80.0% | 49.0%-94.3% | 76.7% | 10.7% | 72.0% |
| mimic\|resource-shield | 11 | 72.7% | 43.4%-90.3% | 70.3% | 27.3% | 67.3% |
| mimic\|southern-funnel | 10 | 70.0% | 39.7%-89.2% | 71.3% | 30.0% | 62.0% |
| mimic\|split-core | 9 | 88.9% | 56.5%-98.0% | 72.9% | 11.1% | 73.3% |
| mimic\|trap-lanes | 11 | 81.8% | 52.3%-94.9% | 73.9% | 18.2% | 78.2% |
| mimic\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 82.1% | 6.7% | 88.3% |
| necromancer\|asymmetric-left | 11 | 54.5% | 28.0%-78.7% | 60.4% | 45.5% | 50.0% |
| necromancer\|asymmetric-right | 11 | 45.5% | 21.3%-72.0% | 58.5% | 54.5% | 45.5% |
| necromancer\|cannon-screen | 9 | 77.8% | 45.3%-93.7% | 69.3% | 22.2% | 66.7% |
| necromancer\|compact-core | 10 | 70.0% | 39.7%-89.2% | 60.7% | 30.0% | 55.0% |
| necromancer\|corner-keep | 9 | 66.7% | 35.4%-87.9% | 63.7% | 33.3% | 44.4% |
| necromancer\|crossfire | 9 | 77.8% | 45.3%-93.7% | 68.8% | 22.2% | 55.6% |
| necromancer\|defense-ring | 11 | 72.7% | 43.4%-90.3% | 68.6% | 27.3% | 59.1% |
| necromancer\|diamond | 10 | 40.0% | 16.8%-68.7% | 61.0% | 60.0% | 30.0% |
| necromancer\|echelon-left | 9 | 55.6% | 26.7%-81.1% | 58.0% | 44.4% | 38.9% |
| necromancer\|echelon-right | 9 | 66.7% | 35.4%-87.9% | 68.8% | 33.3% | 55.6% |
| necromancer\|kill-corridor | 8 | 37.5% | 13.7%-69.4% | 54.7% | 62.5% | 37.5% |
| necromancer\|layered-rings | 11 | 45.5% | 21.3%-72.0% | 60.9% | 51.9% | 45.5% |
| necromancer\|rear-keep | 10 | 70.0% | 39.7%-89.2% | 64.2% | 30.0% | 45.0% |
| necromancer\|resource-shield | 11 | 36.4% | 15.2%-64.6% | 61.4% | 55.7% | 31.8% |
| necromancer\|southern-funnel | 10 | 70.0% | 39.7%-89.2% | 61.2% | 30.0% | 50.0% |
| necromancer\|split-core | 9 | 77.8% | 45.3%-93.7% | 68.0% | 22.2% | 72.2% |
| necromancer\|trap-lanes | 11 | 54.5% | 28.0%-78.7% | 58.3% | 45.5% | 45.5% |
| necromancer\|wide-spread | 12 | 91.7% | 64.6%-98.5% | 71.7% | 8.3% | 66.7% |
| pea_shooter\|asymmetric-left | 11 | 63.6% | 35.4%-84.8% | 63.1% | 36.4% | 35.4% |
| pea_shooter\|asymmetric-right | 11 | 54.5% | 28.0%-78.7% | 65.1% | 45.5% | 37.4% |
| pea_shooter\|cannon-screen | 9 | 88.9% | 56.5%-98.0% | 78.0% | 11.1% | 54.3% |
| pea_shooter\|compact-core | 10 | 50.0% | 23.7%-76.3% | 61.5% | 50.0% | 27.8% |
| pea_shooter\|corner-keep | 9 | 55.6% | 26.7%-81.1% | 67.7% | 44.4% | 35.8% |
| pea_shooter\|crossfire | 9 | 66.7% | 35.4%-87.9% | 74.7% | 29.6% | 44.4% |
| pea_shooter\|defense-ring | 11 | 81.8% | 52.3%-94.9% | 78.1% | 18.2% | 49.5% |
| pea_shooter\|diamond | 10 | 60.0% | 31.3%-83.2% | 72.9% | 31.3% | 37.8% |
| pea_shooter\|echelon-left | 9 | 66.7% | 35.4%-87.9% | 70.8% | 33.3% | 34.6% |
| pea_shooter\|echelon-right | 9 | 88.9% | 56.5%-98.0% | 82.1% | 11.1% | 50.6% |
| pea_shooter\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 65.4% | 50.0% | 36.1% |
| pea_shooter\|layered-rings | 11 | 45.5% | 21.3%-72.0% | 66.1% | 51.7% | 30.3% |
| pea_shooter\|rear-keep | 10 | 70.0% | 39.7%-89.2% | 70.7% | 30.0% | 42.2% |
| pea_shooter\|resource-shield | 11 | 45.5% | 21.3%-72.0% | 59.5% | 51.7% | 31.3% |
| pea_shooter\|southern-funnel | 10 | 60.0% | 31.3%-83.2% | 64.2% | 40.0% | 38.9% |
| pea_shooter\|split-core | 9 | 88.9% | 56.5%-98.0% | 76.2% | 11.1% | 49.4% |
| pea_shooter\|trap-lanes | 11 | 81.8% | 52.3%-94.9% | 76.1% | 18.2% | 51.5% |
| pea_shooter\|wide-spread | 12 | 83.3% | 55.2%-95.3% | 81.7% | 12.6% | 52.8% |
| wind_mage\|asymmetric-left | 7 | 28.6% | 8.2%-64.1% | 40.7% | 71.4% | 28.6% |
| wind_mage\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 45.8% | 57.1% | 21.4% |
| wind_mage\|cannon-screen | 6 | 33.3% | 9.7%-70.0% | 53.6% | 66.7% | 25.0% |
| wind_mage\|compact-core | 6 | 0.0% | 0.0%-39.0% | 36.3% | 99.1% | 0.0% |
| wind_mage\|crossfire | 6 | 16.7% | 3.0%-56.4% | 44.7% | 78.6% | 8.3% |
| wind_mage\|defense-ring | 7 | 14.3% | 2.6%-51.3% | 46.2% | 85.5% | 14.3% |
| wind_mage\|diamond | 6 | 50.0% | 18.8%-81.2% | 51.9% | 50.0% | 41.7% |
| wind_mage\|echelon-left | 6 | 33.3% | 9.7%-70.0% | 40.9% | 66.7% | 33.3% |
| wind_mage\|echelon-right | 6 | 0.0% | 0.0%-39.0% | 26.2% | 100.0% | 0.0% |
| wind_mage\|layered-rings | 7 | 28.6% | 8.2%-64.1% | 37.1% | 71.4% | 14.3% |
| wind_mage\|rear-keep | 6 | 33.3% | 9.7%-70.0% | 48.1% | 66.7% | 33.3% |
| wind_mage\|resource-shield | 7 | 0.0% | 0.0%-35.4% | 33.1% | 99.3% | 0.0% |
| wind_mage\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 43.6% | 83.3% | 16.7% |
| wind_mage\|trap-lanes | 7 | 28.6% | 8.2%-64.1% | 45.0% | 58.0% | 14.3% |
| wind_mage\|wide-spread | 8 | 50.0% | 21.5%-78.5% | 61.4% | 50.0% | 37.5% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th8-layered-rings-154 | 8 | layered-rings | maxed | 13 | 7.7% | 92.3% |
| th8-rear-keep-082 | 8 | rear-keep | rushed-defense | 13 | 7.7% | 89.1% |
| th8-compact-core-002 | 8 | compact-core | maxed | 13 | 7.7% | 87.4% |
| th9-layered-rings-155 | 9 | layered-rings | maxed | 13 | 7.7% | 86.8% |
| th9-compact-core-003 | 9 | compact-core | maxed | 13 | 7.7% | 83.2% |
| th8-resource-shield-111 | 8 | resource-shield | rushed-defense | 15 | 13.3% | 82.8% |
| th9-asymmetric-left-168 | 9 | asymmetric-left | maxed | 14 | 14.3% | 85.7% |
| th9-trap-lanes-124 | 9 | trap-lanes | maxed | 14 | 14.3% | 85.7% |
| th9-crossfire-139 | 9 | crossfire | maxed | 14 | 14.3% | 83.2% |
| th8-asymmetric-left-167 | 8 | asymmetric-left | maxed | 10 | 10.0% | 90.0% |
| th8-southern-funnel-062 | 8 | southern-funnel | maxed | 10 | 10.0% | 90.0% |
| th8-split-core-107 | 8 | split-core | maxed | 10 | 10.0% | 90.0% |
| th8-defense-ring-054 | 8 | defense-ring | rushed-defense | 10 | 10.0% | 86.4% |
| th8-kill-corridor-048 | 8 | kill-corridor | maxed | 13 | 15.4% | 84.6% |
| th9-asymmetric-right-171 | 9 | asymmetric-right | maxed | 13 | 15.4% | 84.6% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH8 has 34.2% attacker wins across 155 samples; authored target is 47.0%-63.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH9 has 31.8% attacker wins across 154 samples; authored target is 47.0%-63.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 38.6% is outside 55.0% +/- 8.0% across 464 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 87.8% attacker wins across 180 samples (reference 71.8%).
- **WARNING / pure-troop-outlier:** pure-troop fire_dragon has 100.0% attacker wins across 180 samples (reference 71.8%).
- **WARNING / pure-troop-outlier:** pure-troop wind_mage has 25.7% attacker wins across 113 samples (reference 71.8%).
- **WARNING / pure-troop-outlier:** pure-troop ice_golem has 37.7% attacker wins across 53 samples (reference 71.8%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 87.8% attacker wins across 180 isolated samples.
- **WARNING / degenerate-pure-army:** Pure fire_dragon armies have 100.0% attacker wins across 180 isolated samples.
- **WARNING / degenerate-pure-army:** Pure mechanical_dragon armies have 81.1% attacker wins across 180 isolated samples.
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
- **INFO / fragile-base:** th7-trap-lanes-074 has 100.0% attacker wins across 11 samples.
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
- **INFO / fragile-base:** th9-southern-funnel-013 has 100.0% attacker wins across 14 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.

