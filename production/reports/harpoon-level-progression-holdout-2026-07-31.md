# Clash Full-Game Balance Lab

**Generated:** 2026-07-31T20:10:09.661Z
**Seed:** 731
**Town Halls:** TH6, TH7
**Unique generated bases:** 90
**Unique attack policies:** 120
**Capacity-filled core army templates:** 23
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 765
**Unbeaten non-adaptive bases (n >= 6):** 33
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 0 battles; 0 bases x 15 selected same-TH compositions x 0 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Lab Mimic concealment ends on first attack:** no
**Lab Mimic trap damage scale while immune:** 0x
**Balance replay simulations:** 1200
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45, TH8=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 35.1s

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

- Buildings: altar, archer_tower, barn, cannon, harpoon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 14/14
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100, TH7=100/100
- Bases exercised: 90/90

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1200 | 636 | 53.0% | 0 | 25.8s | 53.4% | 45.1% | 32.2% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 622 | 314 | 50.5% | 0 | 25.5s | 52.9% | 47.2% |
| TH6->TH6 | 578 | 322 | 55.7% | 0 | 26.1s | 54.0% | 42.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 83 | 18 | 21.7% | 0 | 21.6s | 36.2% | 74.9% |
| southern-funnel | 82 | 50 | 61.0% | 0 | 26.2s | 52.6% | 37.6% |
| compact-core | 81 | 21 | 25.9% | 0 | 21.8s | 38.9% | 70.8% |
| wide-spread | 81 | 52 | 64.2% | 0 | 26.7s | 61.5% | 32.7% |
| asymmetric-left | 80 | 43 | 53.8% | 0 | 26.8s | 59.8% | 42.0% |
| defense-ring | 80 | 49 | 61.3% | 0 | 26.7s | 61.2% | 37.5% |
| split-core | 80 | 52 | 65.0% | 0 | 24.7s | 54.8% | 34.2% |
| layered-rings | 79 | 44 | 55.7% | 0 | 24.5s | 59.1% | 42.6% |
| asymmetric-right | 78 | 51 | 65.4% | 0 | 26.4s | 62.9% | 33.8% |
| rear-keep | 55 | 21 | 38.2% | 0 | 24.2s | 47.3% | 61.3% |
| diamond | 54 | 19 | 35.2% | 0 | 26.0s | 47.0% | 61.7% |
| cannon-screen | 53 | 31 | 58.5% | 0 | 27.2s | 52.3% | 41.0% |
| echelon-right | 53 | 18 | 34.0% | 0 | 26.0s | 39.1% | 62.9% |
| kill-corridor | 53 | 23 | 43.4% | 0 | 27.5s | 41.2% | 54.4% |
| corner-keep | 52 | 25 | 48.1% | 0 | 22.9s | 46.6% | 51.8% |
| crossfire | 52 | 50 | 96.2% | 0 | 32.5s | 81.4% | 2.4% |
| echelon-left | 52 | 25 | 48.1% | 0 | 26.5s | 47.3% | 51.6% |
| trap-lanes | 52 | 44 | 84.6% | 0 | 29.9s | 72.0% | 15.1% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH7 | 43 | 6 | 14.0% | 0 | 20.1s | 32.9% | 82.6% |
| defense-ring\|TH7 | 42 | 27 | 64.3% | 0 | 27.5s | 61.3% | 33.6% |
| layered-rings\|TH7 | 42 | 18 | 42.9% | 0 | 23.9s | 52.9% | 54.8% |
| resource-shield\|TH7 | 42 | 7 | 16.7% | 0 | 21.4s | 35.3% | 77.5% |
| southern-funnel\|TH7 | 42 | 25 | 59.5% | 0 | 23.7s | 50.1% | 40.5% |
| split-core\|TH7 | 42 | 29 | 69.0% | 0 | 24.8s | 55.2% | 30.8% |
| asymmetric-left\|TH7 | 41 | 23 | 56.1% | 0 | 28.2s | 61.9% | 37.5% |
| resource-shield\|TH6 | 41 | 11 | 26.8% | 0 | 21.7s | 37.2% | 72.2% |
| wide-spread\|TH7 | 41 | 23 | 56.1% | 0 | 26.6s | 58.8% | 40.1% |
| asymmetric-right\|TH7 | 40 | 28 | 70.0% | 0 | 25.8s | 67.4% | 28.4% |
| southern-funnel\|TH6 | 40 | 25 | 62.5% | 0 | 28.8s | 55.5% | 34.6% |
| wide-spread\|TH6 | 40 | 29 | 72.5% | 0 | 26.9s | 64.4% | 25.2% |
| asymmetric-left\|TH6 | 39 | 20 | 51.3% | 0 | 25.2s | 57.3% | 46.7% |
| asymmetric-right\|TH6 | 38 | 23 | 60.5% | 0 | 27.1s | 57.7% | 39.5% |
| compact-core\|TH6 | 38 | 15 | 39.5% | 0 | 23.8s | 45.8% | 57.3% |
| defense-ring\|TH6 | 38 | 22 | 57.9% | 0 | 25.8s | 61.1% | 41.8% |
| split-core\|TH6 | 38 | 23 | 60.5% | 0 | 24.6s | 54.2% | 38.1% |
| layered-rings\|TH6 | 37 | 26 | 70.3% | 0 | 25.1s | 66.6% | 28.7% |
| cannon-screen\|TH7 | 28 | 14 | 50.0% | 0 | 26.3s | 54.0% | 49.1% |
| crossfire\|TH7 | 28 | 28 | 100.0% | 0 | 32.2s | 88.1% | 0.0% |
| echelon-left\|TH7 | 28 | 15 | 53.6% | 0 | 29.8s | 51.0% | 45.7% |
| echelon-right\|TH7 | 28 | 5 | 17.9% | 0 | 21.8s | 33.2% | 78.3% |
| kill-corridor\|TH7 | 28 | 14 | 50.0% | 0 | 28.9s | 41.3% | 46.0% |
| rear-keep\|TH7 | 28 | 12 | 42.9% | 0 | 26.1s | 51.3% | 57.1% |
| diamond\|TH6 | 27 | 11 | 40.7% | 0 | 27.8s | 49.9% | 56.8% |
| diamond\|TH7 | 27 | 8 | 29.6% | 0 | 24.1s | 44.3% | 66.5% |
| rear-keep\|TH6 | 27 | 9 | 33.3% | 0 | 22.2s | 42.9% | 65.7% |
| corner-keep\|TH6 | 26 | 12 | 46.2% | 0 | 23.7s | 46.4% | 53.6% |
| corner-keep\|TH7 | 26 | 13 | 50.0% | 0 | 22.1s | 46.7% | 50.0% |
| trap-lanes\|TH6 | 26 | 25 | 96.2% | 0 | 30.2s | 75.1% | 3.4% |
| trap-lanes\|TH7 | 26 | 19 | 73.1% | 0 | 29.6s | 69.0% | 26.9% |
| cannon-screen\|TH6 | 25 | 17 | 68.0% | 0 | 28.3s | 50.1% | 32.0% |
| echelon-right\|TH6 | 25 | 13 | 52.0% | 0 | 30.8s | 46.3% | 45.5% |
| kill-corridor\|TH6 | 25 | 9 | 36.0% | 0 | 25.9s | 41.1% | 63.9% |
| crossfire\|TH6 | 24 | 22 | 91.7% | 0 | 32.8s | 73.1% | 5.2% |
| echelon-left\|TH6 | 24 | 10 | 41.7% | 0 | 22.6s | 42.9% | 58.3% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mixed | 261 | 220 | 84.3% | 0 | 30.7s | 74.0% | 13.9% |
| rushed-defense | 244 | 5 | 2.0% | 0 | 18.2s | 29.6% | 95.4% |
| maxed | 238 | 1 | 0.4% | 0 | 17.8s | 16.8% | 97.9% |
| rushed-economy | 238 | 238 | 100.0% | 0 | 30.8s | 78.3% | 0.0% |
| mid | 219 | 172 | 78.5% | 0 | 31.6s | 68.2% | 18.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 765 | 403 | 52.7% | 0 | 28.1s | 59.0% | 46.3% |
| policy-exploration | 435 | 233 | 53.6% | 0 | 21.8s | 43.5% | 43.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 405 | 206 | 50.9% | 0 | 27.0s | 57.5% | 47.9% |
| pure-unit-matrix\|TH6 | 360 | 197 | 54.7% | 0 | 29.2s | 60.8% | 44.6% |
| policy-exploration\|TH6 | 218 | 125 | 57.3% | 0 | 20.9s | 42.7% | 40.1% |
| policy-exploration\|TH7 | 217 | 108 | 49.8% | 0 | 22.6s | 44.2% | 46.0% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 250 | 142 | 56.8% | 0 | 22.0s | 42.7% | 40.0% |
| policy-exploration\|mage | 240 | 122 | 50.8% | 0 | 20.9s | 42.6% | 46.4% |
| policy-exploration\|fire_dragon | 231 | 134 | 58.0% | 0 | 19.3s | 44.6% | 39.5% |
| policy-exploration\|archer | 206 | 115 | 55.8% | 0 | 22.1s | 46.7% | 41.8% |
| policy-exploration\|demon_king | 169 | 95 | 56.2% | 0 | 21.4s | 43.1% | 40.8% |
| policy-exploration\|mimic | 150 | 86 | 57.3% | 0 | 22.9s | 43.7% | 38.0% |
| policy-exploration\|mechanical_dragon | 132 | 73 | 55.3% | 0 | 21.1s | 47.5% | 43.3% |
| policy-exploration\|pea_shooter | 98 | 49 | 50.0% | 0 | 22.5s | 47.6% | 48.8% |
| pure-unit-matrix\|archer | 90 | 36 | 40.0% | 0 | 36.4s | 52.8% | 58.7% |
| pure-unit-matrix\|demon_king | 90 | 55 | 61.1% | 0 | 26.4s | 62.6% | 38.0% |
| pure-unit-matrix\|fire_dragon | 90 | 51 | 56.7% | 0 | 19.2s | 64.6% | 42.4% |
| pure-unit-matrix\|knight | 90 | 50 | 55.6% | 0 | 30.0s | 57.6% | 41.1% |
| pure-unit-matrix\|mage | 90 | 39 | 43.3% | 0 | 23.7s | 54.6% | 56.5% |
| pure-unit-matrix\|mechanical_dragon | 90 | 53 | 58.9% | 0 | 25.7s | 65.9% | 41.0% |
| pure-unit-matrix\|mimic | 90 | 54 | 60.0% | 0 | 32.9s | 62.3% | 39.6% |
| pure-unit-matrix\|pea_shooter | 90 | 46 | 51.1% | 0 | 28.5s | 55.8% | 48.0% |
| policy-exploration\|necromancer | 87 | 43 | 49.4% | 0 | 23.4s | 42.6% | 48.5% |
| pure-unit-matrix\|necromancer | 45 | 19 | 42.2% | 0 | 31.6s | 51.6% | 56.9% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|fire_dragon\|TH6 | 142 | 86 | 60.6% | 0 | 20.0s | 46.6% | 37.4% |
| policy-exploration\|knight\|TH6 | 135 | 80 | 59.3% | 0 | 22.1s | 43.7% | 37.9% |
| policy-exploration\|mage\|TH6 | 134 | 72 | 53.7% | 0 | 20.8s | 41.6% | 43.7% |
| policy-exploration\|archer\|TH7 | 121 | 63 | 52.1% | 0 | 22.9s | 46.4% | 45.4% |
| policy-exploration\|knight\|TH7 | 115 | 62 | 53.9% | 0 | 21.8s | 41.5% | 42.4% |
| policy-exploration\|mage\|TH7 | 106 | 50 | 47.2% | 0 | 21.2s | 43.8% | 49.7% |
| policy-exploration\|mimic\|TH7 | 98 | 52 | 53.1% | 0 | 23.1s | 41.7% | 41.3% |
| policy-exploration\|demon_king\|TH7 | 97 | 50 | 51.5% | 0 | 21.6s | 40.7% | 45.0% |
| policy-exploration\|fire_dragon\|TH7 | 89 | 48 | 53.9% | 0 | 18.3s | 41.6% | 42.9% |
| policy-exploration\|necromancer\|TH7 | 87 | 43 | 49.4% | 0 | 23.4s | 42.6% | 48.5% |
| policy-exploration\|archer\|TH6 | 85 | 52 | 61.2% | 0 | 21.0s | 47.0% | 36.5% |
| policy-exploration\|mechanical_dragon\|TH6 | 73 | 44 | 60.3% | 0 | 20.1s | 45.7% | 38.0% |
| policy-exploration\|demon_king\|TH6 | 72 | 45 | 62.5% | 0 | 21.2s | 46.5% | 35.1% |
| policy-exploration\|mechanical_dragon\|TH7 | 59 | 29 | 49.2% | 0 | 22.4s | 49.6% | 49.8% |
| policy-exploration\|mimic\|TH6 | 52 | 34 | 65.4% | 0 | 22.4s | 47.8% | 31.9% |
| policy-exploration\|pea_shooter\|TH7 | 52 | 25 | 48.1% | 0 | 24.9s | 51.2% | 51.5% |
| policy-exploration\|pea_shooter\|TH6 | 46 | 24 | 52.2% | 0 | 19.8s | 43.2% | 45.8% |
| pure-unit-matrix\|archer\|TH6 | 45 | 16 | 35.6% | 0 | 39.1s | 50.8% | 61.9% |
| pure-unit-matrix\|archer\|TH7 | 45 | 20 | 44.4% | 0 | 33.7s | 54.6% | 55.5% |
| pure-unit-matrix\|demon_king\|TH6 | 45 | 28 | 62.2% | 0 | 27.7s | 67.7% | 36.4% |
| pure-unit-matrix\|demon_king\|TH7 | 45 | 27 | 60.0% | 0 | 25.1s | 57.8% | 39.6% |
| pure-unit-matrix\|fire_dragon\|TH6 | 45 | 26 | 57.8% | 0 | 19.7s | 63.5% | 41.3% |
| pure-unit-matrix\|fire_dragon\|TH7 | 45 | 25 | 55.6% | 0 | 18.6s | 65.6% | 43.4% |
| pure-unit-matrix\|knight\|TH6 | 45 | 27 | 60.0% | 0 | 30.4s | 61.3% | 40.0% |
| pure-unit-matrix\|knight\|TH7 | 45 | 23 | 51.1% | 0 | 29.6s | 54.2% | 42.1% |
| pure-unit-matrix\|mage\|TH6 | 45 | 21 | 46.7% | 0 | 24.7s | 54.5% | 53.3% |
| pure-unit-matrix\|mage\|TH7 | 45 | 18 | 40.0% | 0 | 22.7s | 54.6% | 59.6% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 45 | 26 | 57.8% | 0 | 26.8s | 66.4% | 42.1% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 45 | 27 | 60.0% | 0 | 24.6s | 65.3% | 40.0% |
| pure-unit-matrix\|mimic\|TH6 | 45 | 28 | 62.2% | 0 | 34.7s | 65.3% | 37.1% |
| pure-unit-matrix\|mimic\|TH7 | 45 | 26 | 57.8% | 0 | 31.1s | 59.5% | 42.0% |
| pure-unit-matrix\|necromancer\|TH7 | 45 | 19 | 42.2% | 0 | 31.6s | 51.6% | 56.9% |
| pure-unit-matrix\|pea_shooter\|TH6 | 45 | 25 | 55.6% | 0 | 30.7s | 57.1% | 44.4% |
| pure-unit-matrix\|pea_shooter\|TH7 | 45 | 21 | 46.7% | 0 | 26.3s | 54.6% | 51.6% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 765 | 403 | 52.7% | 0 | 28.1s | 59.0% | 46.3% |
| policy-exploration\|cannon-rally | 56 | 33 | 58.9% | 0 | 14.1s | 7.2% | 32.9% |
| policy-exploration\|cannon-focus | 55 | 37 | 67.3% | 0 | 24.9s | 64.6% | 32.7% |
| policy-exploration\|cannon-medkit | 54 | 26 | 48.1% | 0 | 23.9s | 57.4% | 51.6% |
| policy-exploration\|none | 54 | 33 | 61.1% | 0 | 24.4s | 62.4% | 38.9% |
| policy-exploration\|rally-core | 54 | 24 | 44.4% | 0 | 14.1s | 4.9% | 41.4% |
| policy-exploration\|medkit-entry | 53 | 26 | 49.1% | 0 | 22.5s | 56.7% | 50.9% |
| policy-exploration\|skeleton-barrel | 22 | 8 | 36.4% | 0 | 27.2s | 49.1% | 60.3% |
| policy-exploration\|freeze-barrel | 19 | 12 | 63.2% | 0 | 28.6s | 64.2% | 35.6% |
| policy-exploration\|freeze-rage | 18 | 7 | 38.9% | 0 | 25.4s | 54.1% | 61.1% |
| policy-exploration\|rage-entry | 18 | 8 | 44.4% | 0 | 26.3s | 52.2% | 53.0% |
| policy-exploration\|rally-rage | 17 | 10 | 58.8% | 0 | 13.5s | 8.7% | 35.3% |
| policy-exploration\|freeze-defense | 15 | 9 | 60.0% | 0 | 29.0s | 56.9% | 40.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 80 | 38 | 47.5% | 0 | 29.6s | 55.0% | 50.2% |
| pure-unit-matrix\|dual-flank | 80 | 43 | 53.8% | 0 | 27.5s | 60.2% | 46.3% |
| pure-unit-matrix\|left-flank | 80 | 43 | 53.8% | 0 | 29.8s | 56.3% | 44.5% |
| pure-unit-matrix\|right-flank | 80 | 43 | 53.8% | 0 | 29.7s | 56.0% | 44.6% |
| pure-unit-matrix\|three-lane | 80 | 45 | 56.3% | 0 | 25.8s | 63.2% | 43.1% |
| pure-unit-matrix\|wide-line | 80 | 42 | 52.5% | 0 | 27.8s | 59.5% | 46.3% |
| pure-unit-matrix\|diamond | 75 | 42 | 56.0% | 0 | 28.4s | 62.9% | 44.0% |
| pure-unit-matrix\|edge-sweep | 70 | 35 | 50.0% | 0 | 25.3s | 61.3% | 48.7% |
| pure-unit-matrix\|inverted-wedge | 70 | 31 | 44.3% | 0 | 26.4s | 53.4% | 54.9% |
| pure-unit-matrix\|vanguard-wedge | 70 | 41 | 58.6% | 0 | 30.1s | 62.6% | 41.2% |
| policy-exploration\|wide-line | 47 | 29 | 61.7% | 0 | 23.4s | 49.0% | 36.7% |
| policy-exploration\|diamond | 44 | 18 | 40.9% | 0 | 22.9s | 43.4% | 55.3% |
| policy-exploration\|edge-sweep | 44 | 22 | 50.0% | 0 | 20.9s | 46.4% | 48.4% |
| policy-exploration\|left-flank | 44 | 26 | 59.1% | 0 | 22.8s | 42.5% | 35.4% |
| policy-exploration\|right-flank | 44 | 27 | 61.4% | 0 | 22.3s | 41.1% | 35.9% |
| policy-exploration\|three-lane | 44 | 17 | 38.6% | 0 | 18.6s | 38.9% | 55.3% |
| policy-exploration\|center-column | 43 | 25 | 58.1% | 0 | 21.8s | 43.6% | 40.4% |
| policy-exploration\|inverted-wedge | 43 | 24 | 55.8% | 0 | 21.0s | 42.1% | 42.5% |
| policy-exploration\|vanguard-wedge | 43 | 23 | 53.5% | 0 | 23.0s | 40.4% | 39.5% |
| policy-exploration\|dual-flank | 39 | 22 | 56.4% | 0 | 20.5s | 47.4% | 41.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 154 | 81 | 52.6% | 0 | 27.7s | 57.8% | 46.2% |
| pure-unit-matrix\|rapid | 154 | 84 | 54.5% | 0 | 29.4s | 60.6% | 44.7% |
| pure-unit-matrix\|two-waves | 153 | 88 | 57.5% | 0 | 27.8s | 60.8% | 41.4% |
| pure-unit-matrix\|drip | 152 | 72 | 47.4% | 0 | 27.3s | 56.5% | 52.3% |
| pure-unit-matrix\|three-waves | 152 | 78 | 51.3% | 0 | 28.1s | 59.4% | 47.1% |
| policy-exploration\|three-waves | 88 | 53 | 60.2% | 0 | 21.3s | 45.4% | 36.9% |
| policy-exploration\|burst | 87 | 44 | 50.6% | 0 | 22.3s | 47.2% | 47.3% |
| policy-exploration\|rapid | 87 | 43 | 49.4% | 0 | 22.0s | 40.6% | 47.1% |
| policy-exploration\|two-waves | 87 | 49 | 56.3% | 0 | 19.7s | 35.7% | 37.0% |
| policy-exploration\|drip | 86 | 44 | 51.2% | 0 | 23.4s | 48.7% | 47.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 383 | 210 | 54.8% | 0 | 27.9s | 60.7% | 43.8% |
| pure-unit-matrix\|tank-front-support-rear | 382 | 193 | 50.5% | 0 | 28.3s | 57.4% | 48.9% |
| policy-exploration\|tank-front-support-rear | 218 | 112 | 51.4% | 0 | 23.0s | 42.3% | 44.1% |
| policy-exploration\|roster-order | 217 | 121 | 55.8% | 0 | 20.5s | 44.7% | 41.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 122 | 51 | 41.8% | 0 | 23.0s | 50.2% | 57.1% |
| pure-knight | 121 | 66 | 54.5% | 0 | 28.5s | 51.5% | 41.2% |
| pure-fire_dragon | 118 | 66 | 55.9% | 0 | 18.7s | 59.8% | 43.0% |
| pure-mechanical_dragon | 113 | 66 | 58.4% | 0 | 24.6s | 61.6% | 40.9% |
| pure-archer | 104 | 41 | 39.4% | 0 | 35.2s | 52.7% | 58.7% |
| pure-mimic | 104 | 62 | 59.6% | 0 | 31.6s | 57.2% | 37.2% |
| pure-pea_shooter | 98 | 49 | 50.0% | 0 | 28.7s | 55.7% | 49.0% |
| pure-demon_king | 94 | 57 | 60.6% | 0 | 26.3s | 62.3% | 38.5% |
| pure-necromancer | 55 | 23 | 41.8% | 0 | 31.5s | 51.8% | 57.5% |
| support-mix | 34 | 20 | 58.8% | 0 | 22.4s | 40.2% | 38.6% |
| ranged-pressure | 33 | 15 | 45.5% | 0 | 18.9s | 44.7% | 53.7% |
| hero-necro-dragon-mages | 30 | 16 | 53.3% | 0 | 17.5s | 37.0% | 43.1% |
| trap-runner-mix | 28 | 19 | 67.9% | 0 | 22.9s | 49.9% | 29.5% |
| core-mage-filled | 27 | 13 | 48.1% | 0 | 23.2s | 40.7% | 49.4% |
| core-fire_dragon-filled | 23 | 17 | 73.9% | 0 | 19.9s | 51.6% | 25.1% |
| air-pressure | 19 | 14 | 73.7% | 0 | 19.3s | 53.8% | 25.2% |
| random-1 | 16 | 10 | 62.5% | 0 | 28.7s | 61.5% | 37.5% |
| random-5 | 15 | 6 | 40.0% | 0 | 17.5s | 28.7% | 54.4% |
| frontline-ranged | 12 | 8 | 66.7% | 0 | 20.3s | 47.0% | 25.7% |
| random-3 | 12 | 5 | 41.7% | 0 | 27.4s | 53.3% | 58.3% |
| balanced | 6 | 2 | 33.3% | 0 | 17.0s | 34.0% | 61.3% |
| random-2 | 6 | 3 | 50.0% | 0 | 20.6s | 56.7% | 50.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 24.5s | 42.6% | 48.4% |
| diamond__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.6s | 54.2% | 50.0% |
| dual-flank__rapid__roster-order | 16 | 11 | 68.8% | 0 | 27.2s | 53.3% | 29.0% |
| left-flank__rapid__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 20.6s | 35.3% | 65.9% |
| right-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.2s | 39.0% | 43.3% |
| right-flank__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 21.0s | 39.5% | 40.4% |
| three-lane__burst__roster-order | 16 | 7 | 43.8% | 0 | 19.7s | 46.0% | 55.1% |
| wide-line__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.8s | 46.4% | 37.5% |
| wide-line__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 25.8s | 52.1% | 58.2% |
| center-column__rapid__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 27.6s | 57.5% | 53.3% |
| center-column__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 26.2s | 51.2% | 38.4% |
| diamond__drip__tank-front-support-rear | 15 | 4 | 26.7% | 0 | 27.0s | 43.9% | 68.3% |
| diamond__rapid__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 32.6s | 59.4% | 40.0% |
| dual-flank__two-waves__roster-order | 15 | 8 | 53.3% | 0 | 20.2s | 45.1% | 46.7% |
| edge-sweep__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 23.9s | 69.1% | 33.3% |
| inverted-wedge__drip__roster-order | 15 | 6 | 40.0% | 0 | 19.9s | 38.6% | 60.0% |
| left-flank__three-waves__roster-order | 15 | 7 | 46.7% | 0 | 21.7s | 46.0% | 50.7% |
| right-flank__rapid__roster-order | 15 | 9 | 60.0% | 0 | 26.4s | 51.3% | 39.1% |
| right-flank__three-waves__roster-order | 15 | 9 | 60.0% | 0 | 26.8s | 60.1% | 40.0% |
| three-lane__drip__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 24.6s | 59.8% | 58.9% |
| three-lane__rapid__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 24.4s | 52.6% | 23.8% |
| vanguard-wedge__three-waves__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 26.9s | 41.3% | 43.2% |
| wide-line__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 23.5s | 46.3% | 50.6% |
| wide-line__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 28.9s | 64.4% | 33.3% |
| center-column__drip__roster-order | 14 | 7 | 50.0% | 0 | 23.9s | 43.4% | 50.0% |
| dual-flank__two-waves__tank-front-support-rear | 14 | 10 | 71.4% | 0 | 28.4s | 72.0% | 28.6% |
| edge-sweep__burst__roster-order | 14 | 6 | 42.9% | 0 | 20.1s | 46.7% | 52.2% |
| edge-sweep__drip__tank-front-support-rear | 14 | 8 | 57.1% | 0 | 26.6s | 51.1% | 42.9% |
| inverted-wedge__burst__roster-order | 14 | 8 | 57.1% | 0 | 28.8s | 61.1% | 42.9% |
| inverted-wedge__three-waves__roster-order | 14 | 6 | 42.9% | 0 | 23.4s | 43.3% | 51.4% |
| vanguard-wedge__burst__tank-front-support-rear | 14 | 8 | 57.1% | 0 | 30.0s | 54.9% | 43.0% |
| vanguard-wedge__drip__roster-order | 14 | 11 | 78.6% | 0 | 29.3s | 73.2% | 21.4% |
| vanguard-wedge__rapid__roster-order | 13 | 9 | 69.2% | 0 | 24.7s | 50.6% | 30.8% |
| center-column__rapid__roster-order | 12 | 7 | 58.3% | 0 | 30.3s | 62.6% | 38.5% |
| center-column__three-waves__roster-order | 12 | 7 | 58.3% | 0 | 20.6s | 37.8% | 40.7% |
| center-column__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 25.3s | 60.1% | 45.2% |
| diamond__burst__roster-order | 12 | 5 | 41.7% | 0 | 23.9s | 57.2% | 58.3% |
| dual-flank__burst__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 23.0s | 44.0% | 44.5% |
| dual-flank__rapid__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 27.0s | 57.6% | 50.0% |
| dual-flank__three-waves__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 25.9s | 59.3% | 58.3% |
| left-flank__burst__roster-order | 12 | 10 | 83.3% | 0 | 29.3s | 66.8% | 16.5% |
| left-flank__drip__roster-order | 12 | 6 | 50.0% | 0 | 28.6s | 57.3% | 48.0% |
| left-flank__rapid__roster-order | 12 | 8 | 66.7% | 0 | 41.5s | 67.7% | 26.9% |
| left-flank__two-waves__roster-order | 12 | 9 | 75.0% | 0 | 26.4s | 47.2% | 21.7% |
| left-flank__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 24.2s | 42.9% | 23.5% |
| right-flank__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 32.8s | 63.3% | 41.2% |
| right-flank__rapid__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 23.4s | 38.1% | 46.0% |
| three-lane__burst__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 24.3s | 61.1% | 41.7% |
| three-lane__drip__roster-order | 12 | 3 | 25.0% | 0 | 19.7s | 43.7% | 75.0% |
| three-lane__rapid__roster-order | 12 | 5 | 41.7% | 0 | 23.3s | 54.3% | 58.2% |
| three-lane__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 21.6s | 46.1% | 34.0% |
| wide-line__burst__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 27.0s | 56.3% | 50.0% |
| wide-line__three-waves__roster-order | 12 | 7 | 58.3% | 0 | 25.8s | 63.8% | 41.7% |
| center-column__burst__roster-order | 11 | 6 | 54.5% | 0 | 41.0s | 58.2% | 37.7% |
| diamond__drip__roster-order | 11 | 7 | 63.6% | 0 | 26.3s | 68.8% | 36.4% |
| diamond__rapid__roster-order | 11 | 6 | 54.5% | 0 | 23.4s | 62.7% | 45.5% |
| diamond__three-waves__roster-order | 11 | 8 | 72.7% | 0 | 25.6s | 57.5% | 25.9% |
| diamond__two-waves__roster-order | 11 | 3 | 27.3% | 0 | 18.1s | 34.6% | 65.9% |
| dual-flank__burst__roster-order | 11 | 6 | 54.5% | 0 | 29.1s | 64.2% | 45.5% |
| dual-flank__drip__roster-order | 11 | 7 | 63.6% | 0 | 24.6s | 66.2% | 36.4% |
| edge-sweep__drip__roster-order | 11 | 5 | 45.5% | 0 | 22.9s | 61.0% | 54.5% |
| edge-sweep__rapid__tank-front-support-rear | 11 | 5 | 45.5% | 0 | 22.4s | 54.0% | 54.5% |
| edge-sweep__three-waves__tank-front-support-rear | 11 | 7 | 63.6% | 0 | 29.1s | 66.9% | 28.3% |
| edge-sweep__two-waves__tank-front-support-rear | 11 | 4 | 36.4% | 0 | 26.3s | 51.5% | 63.6% |
| inverted-wedge__rapid__roster-order | 11 | 4 | 36.4% | 0 | 23.9s | 46.1% | 63.6% |
| inverted-wedge__three-waves__tank-front-support-rear | 11 | 8 | 72.7% | 0 | 28.0s | 68.6% | 27.3% |
| inverted-wedge__two-waves__tank-front-support-rear | 11 | 6 | 54.5% | 0 | 23.9s | 37.1% | 42.8% |
| left-flank__burst__tank-front-support-rear | 11 | 4 | 36.4% | 0 | 24.5s | 48.9% | 63.6% |
| left-flank__drip__tank-front-support-rear | 11 | 5 | 45.5% | 0 | 28.5s | 47.7% | 53.4% |
| left-flank__three-waves__tank-front-support-rear | 11 | 7 | 63.6% | 0 | 31.9s | 61.7% | 34.5% |
| right-flank__three-waves__tank-front-support-rear | 11 | 4 | 36.4% | 0 | 30.2s | 47.0% | 62.7% |
| right-flank__two-waves__tank-front-support-rear | 11 | 6 | 54.5% | 0 | 28.2s | 55.3% | 44.7% |
| three-lane__three-waves__roster-order | 11 | 4 | 36.4% | 0 | 21.4s | 51.6% | 63.6% |
| three-lane__two-waves__roster-order | 11 | 7 | 63.6% | 0 | 25.0s | 63.7% | 36.4% |
| vanguard-wedge__burst__roster-order | 11 | 6 | 54.5% | 0 | 27.5s | 63.9% | 45.5% |
| vanguard-wedge__drip__tank-front-support-rear | 11 | 5 | 45.5% | 0 | 29.9s | 55.0% | 54.5% |
| vanguard-wedge__two-waves__roster-order | 11 | 7 | 63.6% | 0 | 25.7s | 51.6% | 30.7% |
| wide-line__burst__roster-order | 11 | 6 | 54.5% | 0 | 19.2s | 49.9% | 42.9% |
| wide-line__drip__roster-order | 11 | 7 | 63.6% | 0 | 24.5s | 53.4% | 33.0% |
| wide-line__rapid__roster-order | 11 | 8 | 72.7% | 0 | 28.2s | 73.9% | 27.3% |
| diamond__three-waves__tank-front-support-rear | 10 | 4 | 40.0% | 0 | 25.2s | 52.2% | 60.0% |
| edge-sweep__burst__tank-front-support-rear | 10 | 3 | 30.0% | 0 | 20.6s | 42.7% | 70.0% |
| edge-sweep__two-waves__roster-order | 10 | 6 | 60.0% | 0 | 18.1s | 44.7% | 40.0% |
| inverted-wedge__burst__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 24.6s | 54.7% | 50.0% |
| inverted-wedge__drip__tank-front-support-rear | 10 | 3 | 30.0% | 0 | 22.8s | 47.1% | 70.0% |
| inverted-wedge__rapid__tank-front-support-rear | 10 | 3 | 30.0% | 0 | 21.3s | 28.2% | 68.1% |
| vanguard-wedge__two-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 27.3s | 48.6% | 39.2% |
| center-column__burst__tank-front-support-rear | 8 | 4 | 50.0% | 0 | 26.0s | 56.6% | 50.0% |
| center-column__drip__tank-front-support-rear | 8 | 2 | 25.0% | 0 | 24.9s | 42.0% | 75.0% |
| dual-flank__drip__tank-front-support-rear | 8 | 4 | 50.0% | 0 | 26.8s | 56.0% | 50.0% |
| dual-flank__three-waves__roster-order | 8 | 2 | 25.0% | 0 | 18.8s | 39.2% | 75.0% |
| right-flank__burst__roster-order | 8 | 5 | 62.5% | 0 | 32.4s | 64.9% | 24.6% |
| right-flank__drip__roster-order | 8 | 6 | 75.0% | 0 | 36.5s | 62.5% | 25.0% |
| three-lane__three-waves__tank-front-support-rear | 8 | 6 | 75.0% | 0 | 32.0s | 78.2% | 18.7% |
| wide-line__rapid__tank-front-support-rear | 8 | 4 | 50.0% | 0 | 38.3s | 54.4% | 50.0% |
| diamond__two-waves__tank-front-support-rear | 7 | 6 | 85.7% | 0 | 35.4s | 79.0% | 14.3% |
| edge-sweep__rapid__roster-order | 7 | 3 | 42.9% | 0 | 26.4s | 70.1% | 57.0% |
| inverted-wedge__two-waves__roster-order | 7 | 6 | 85.7% | 0 | 29.2s | 78.2% | 14.3% |
| vanguard-wedge__rapid__tank-front-support-rear | 7 | 2 | 28.6% | 0 | 23.4s | 43.7% | 71.4% |
| vanguard-wedge__three-waves__roster-order | 7 | 4 | 57.1% | 0 | 27.2s | 56.1% | 42.9% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 127 | 71 | 55.9% | 0 | 26.2s | 55.6% | 42.7% |
| left-flank | 124 | 69 | 55.6% | 0 | 27.3s | 51.4% | 41.3% |
| right-flank | 124 | 70 | 56.5% | 0 | 27.1s | 50.7% | 41.5% |
| three-lane | 124 | 62 | 50.0% | 0 | 23.3s | 54.6% | 47.4% |
| center-column | 123 | 63 | 51.2% | 0 | 26.9s | 51.0% | 46.8% |
| diamond | 119 | 60 | 50.4% | 0 | 26.3s | 55.7% | 48.2% |
| dual-flank | 119 | 65 | 54.6% | 0 | 25.2s | 56.0% | 44.5% |
| edge-sweep | 114 | 57 | 50.0% | 0 | 23.6s | 55.6% | 48.6% |
| inverted-wedge | 113 | 55 | 48.7% | 0 | 24.4s | 49.1% | 50.2% |
| vanguard-wedge | 113 | 64 | 56.6% | 0 | 27.4s | 54.2% | 40.5% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 241 | 125 | 51.9% | 0 | 25.7s | 54.0% | 46.6% |
| rapid | 241 | 127 | 52.7% | 0 | 26.7s | 53.4% | 45.5% |
| three-waves | 240 | 131 | 54.6% | 0 | 25.6s | 54.3% | 43.4% |
| two-waves | 240 | 137 | 57.1% | 0 | 24.9s | 51.7% | 39.8% |
| drip | 238 | 116 | 48.7% | 0 | 25.9s | 53.7% | 50.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 600 | 331 | 55.2% | 0 | 25.2s | 54.9% | 43.1% |
| tank-front-support-rear | 600 | 305 | 50.8% | 0 | 26.4s | 51.9% | 47.2% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 819 | 436 | 53.2% | 0 | 27.8s | 59.3% | 45.8% |
| cannon-rally | 56 | 33 | 58.9% | 0 | 14.1s | 7.2% | 32.9% |
| cannon-focus | 55 | 37 | 67.3% | 0 | 24.9s | 64.6% | 32.7% |
| cannon-medkit | 54 | 26 | 48.1% | 0 | 23.9s | 57.4% | 51.6% |
| rally-core | 54 | 24 | 44.4% | 0 | 14.1s | 4.9% | 41.4% |
| medkit-entry | 53 | 26 | 49.1% | 0 | 22.5s | 56.7% | 50.9% |
| skeleton-barrel | 22 | 8 | 36.4% | 0 | 27.2s | 49.1% | 60.3% |
| freeze-barrel | 19 | 12 | 63.2% | 0 | 28.6s | 64.2% | 35.6% |
| freeze-rage | 18 | 7 | 38.9% | 0 | 25.4s | 54.1% | 61.1% |
| rage-entry | 18 | 8 | 44.4% | 0 | 26.3s | 52.2% | 53.0% |
| rally-rage | 17 | 10 | 58.8% | 0 | 13.5s | 8.7% | 35.3% |
| freeze-defense | 15 | 9 | 60.0% | 0 | 29.0s | 56.9% | 40.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 272 | 159 | 58.5% | 0 | 22.3s | 56.4% | 39.8% |
| unrevealed | 116 | 63 | 54.3% | 0 | 18.6s | 42.6% | 44.2% |
| epic | 97 | 58 | 59.8% | 0 | 20.0s | 46.1% | 38.5% |
| legendary | 95 | 55 | 57.9% | 0 | 21.3s | 45.0% | 37.5% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 149 | 84 | 56.4% | 0 | 19.3s | 55.2% | 42.0% |
| demon_king\|common | 123 | 75 | 61.0% | 0 | 26.0s | 57.9% | 37.2% |
| fire_dragon\|unrevealed | 70 | 37 | 52.9% | 0 | 18.1s | 41.8% | 45.5% |
| fire_dragon\|epic | 53 | 34 | 64.2% | 0 | 19.8s | 50.5% | 34.3% |
| fire_dragon\|legendary | 49 | 30 | 61.2% | 0 | 20.6s | 47.0% | 34.3% |
| demon_king\|legendary | 46 | 25 | 54.3% | 0 | 22.1s | 42.8% | 40.9% |
| demon_king\|unrevealed | 46 | 26 | 56.5% | 0 | 19.4s | 43.8% | 42.1% |
| demon_king\|epic | 44 | 24 | 54.5% | 0 | 20.3s | 41.0% | 43.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 765 | 403 | 52.7% | 0 | 28.1s | 59.0% | 46.3% |
| ward-3 | 219 | 107 | 48.9% | 0 | 21.0s | 40.1% | 47.7% |
| ward-1 | 216 | 126 | 58.3% | 0 | 22.5s | 46.9% | 38.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1200 | 636 | 53.0% | 0 | 25.8s | 53.4% | 45.1% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 340 | 192 | 56.5% | 0 | 24.1s | 46.6% | 40.3% |
| mage | 330 | 161 | 48.8% | 0 | 21.7s | 45.9% | 49.1% |
| fire_dragon | 321 | 185 | 57.6% | 0 | 19.3s | 50.2% | 40.3% |
| archer | 296 | 151 | 51.0% | 0 | 26.5s | 48.5% | 46.9% |
| demon_king | 259 | 150 | 57.9% | 0 | 23.2s | 49.9% | 39.8% |
| mimic | 240 | 140 | 58.3% | 0 | 26.6s | 50.6% | 38.6% |
| mechanical_dragon | 222 | 126 | 56.8% | 0 | 23.0s | 55.0% | 42.4% |
| pea_shooter | 188 | 95 | 50.5% | 0 | 25.4s | 51.5% | 48.4% |
| necromancer | 132 | 62 | 47.0% | 0 | 26.2s | 45.7% | 51.4% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 90 | 40.0% | 30.5%-50.3% | 52.8% | 58.7% | 21.1% |
| demon_king | 90 | 61.1% | 50.8%-70.5% | 62.6% | 38.0% | 50.7% |
| fire_dragon | 90 | 56.7% | 46.4%-66.4% | 64.6% | 42.4% | 51.7% |
| knight | 90 | 55.6% | 45.3%-65.4% | 57.6% | 41.1% | 35.2% |
| mage | 90 | 43.3% | 33.6%-53.6% | 54.6% | 56.5% | 24.3% |
| mechanical_dragon | 90 | 58.9% | 48.6%-68.5% | 65.9% | 41.0% | 46.8% |
| mimic | 90 | 60.0% | 49.7%-69.5% | 62.3% | 39.6% | 53.0% |
| necromancer | 45 | 42.2% | 29.0%-56.7% | 51.6% | 56.9% | 35.6% |
| pea_shooter | 90 | 51.1% | 41.0%-61.2% | 55.8% | 48.0% | 28.8% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 45 | 35.6% | 23.2%-50.2% | 50.8% | 61.9% | 17.9% |
| archer\|TH7 | 45 | 44.4% | 30.9%-58.8% | 54.6% | 55.5% | 24.2% |
| demon_king\|TH6 | 45 | 62.2% | 47.6%-74.9% | 67.7% | 36.4% | 54.8% |
| demon_king\|TH7 | 45 | 60.0% | 45.5%-73.0% | 57.8% | 39.6% | 46.7% |
| fire_dragon\|TH6 | 45 | 57.8% | 43.3%-71.0% | 63.5% | 41.3% | 52.8% |
| fire_dragon\|TH7 | 45 | 55.6% | 41.2%-69.1% | 65.6% | 43.4% | 50.6% |
| knight\|TH6 | 45 | 60.0% | 45.5%-73.0% | 61.3% | 40.0% | 37.9% |
| knight\|TH7 | 45 | 51.1% | 37.0%-65.0% | 54.2% | 42.1% | 32.5% |
| mage\|TH6 | 45 | 46.7% | 32.9%-60.9% | 54.5% | 53.3% | 23.6% |
| mage\|TH7 | 45 | 40.0% | 27.0%-54.5% | 54.6% | 59.6% | 25.1% |
| mechanical_dragon\|TH6 | 45 | 57.8% | 43.3%-71.0% | 66.4% | 42.1% | 46.9% |
| mechanical_dragon\|TH7 | 45 | 60.0% | 45.5%-73.0% | 65.3% | 40.0% | 46.7% |
| mimic\|TH6 | 45 | 62.2% | 47.6%-74.9% | 65.3% | 37.1% | 56.5% |
| mimic\|TH7 | 45 | 57.8% | 43.3%-71.0% | 59.5% | 42.0% | 49.5% |
| necromancer\|TH7 | 45 | 42.2% | 29.0%-56.7% | 51.6% | 56.9% | 35.6% |
| pea_shooter\|TH6 | 45 | 55.6% | 41.2%-69.1% | 57.1% | 44.4% | 29.1% |
| pea_shooter\|TH7 | 45 | 46.7% | 32.9%-60.9% | 54.6% | 51.6% | 28.4% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 6 | 33.3% | 9.7%-70.0% | 59.3% | 66.3% | 25.9% |
| archer\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 64.5% | 33.3% | 37.0% |
| archer\|compact-core | 6 | 16.7% | 3.0%-56.4% | 45.5% | 83.1% | 3.0% |
| archer\|defense-ring | 6 | 33.3% | 9.7%-70.0% | 56.1% | 66.7% | 26.7% |
| archer\|layered-rings | 6 | 66.7% | 30.0%-90.3% | 69.4% | 33.3% | 40.4% |
| archer\|resource-shield | 6 | 0.0% | 0.0%-39.0% | 32.8% | 99.8% | 0.0% |
| archer\|southern-funnel | 6 | 16.7% | 3.0%-56.4% | 43.4% | 70.4% | 5.9% |
| archer\|split-core | 6 | 50.0% | 18.8%-81.2% | 56.6% | 46.0% | 25.6% |
| archer\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 59.8% | 33.3% | 31.1% |
| demon_king\|asymmetric-left | 6 | 66.7% | 30.0%-90.3% | 65.1% | 33.3% | 53.7% |
| demon_king\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 63.4% | 33.3% | 63.0% |
| demon_king\|compact-core | 6 | 33.3% | 9.7%-70.0% | 43.4% | 66.7% | 20.4% |
| demon_king\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 73.5% | 33.3% | 59.3% |
| demon_king\|layered-rings | 6 | 66.7% | 30.0%-90.3% | 71.0% | 31.6% | 57.4% |
| demon_king\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 45.7% | 66.7% | 22.2% |
| demon_king\|southern-funnel | 6 | 66.7% | 30.0%-90.3% | 63.0% | 33.3% | 44.4% |
| demon_king\|split-core | 6 | 66.7% | 30.0%-90.3% | 60.8% | 33.3% | 63.0% |
| demon_king\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 78.8% | 21.6% | 64.8% |
| fire_dragon\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 68.8% | 43.1% | 45.8% |
| fire_dragon\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 71.0% | 33.3% | 62.5% |
| fire_dragon\|compact-core | 6 | 33.3% | 9.7%-70.0% | 51.3% | 66.7% | 25.0% |
| fire_dragon\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 72.5% | 33.3% | 54.2% |
| fire_dragon\|layered-rings | 6 | 50.0% | 18.8%-81.2% | 71.0% | 50.0% | 50.0% |
| fire_dragon\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 46.2% | 66.7% | 25.0% |
| fire_dragon\|southern-funnel | 6 | 66.7% | 30.0%-90.3% | 66.1% | 33.3% | 58.3% |
| fire_dragon\|split-core | 6 | 66.7% | 30.0%-90.3% | 66.1% | 33.3% | 58.3% |
| fire_dragon\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 75.1% | 33.3% | 62.5% |
| knight\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 65.1% | 35.1% | 34.4% |
| knight\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 68.3% | 33.3% | 50.7% |
| knight\|compact-core | 6 | 16.7% | 3.0%-56.4% | 42.9% | 71.9% | 10.7% |
| knight\|defense-ring | 6 | 50.0% | 18.8%-81.2% | 64.0% | 35.1% | 34.1% |
| knight\|layered-rings | 6 | 66.7% | 30.0%-90.3% | 70.4% | 33.3% | 55.2% |
| knight\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 39.2% | 66.7% | 14.8% |
| knight\|southern-funnel | 6 | 66.7% | 30.0%-90.3% | 50.8% | 33.3% | 31.5% |
| knight\|split-core | 6 | 66.7% | 30.0%-90.3% | 59.3% | 33.3% | 45.9% |
| knight\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 70.4% | 33.3% | 44.4% |
| mage\|asymmetric-left | 6 | 33.3% | 9.7%-70.0% | 58.7% | 63.8% | 24.2% |
| mage\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 65.1% | 33.3% | 36.4% |
| mage\|compact-core | 6 | 16.7% | 3.0%-56.4% | 34.4% | 83.3% | 4.5% |
| mage\|defense-ring | 6 | 33.3% | 9.7%-70.0% | 57.1% | 66.7% | 27.3% |
| mage\|layered-rings | 6 | 50.0% | 18.8%-81.2% | 67.7% | 50.0% | 33.3% |
| mage\|resource-shield | 6 | 16.7% | 3.0%-56.4% | 40.3% | 83.3% | 3.0% |
| mage\|southern-funnel | 6 | 33.3% | 9.7%-70.0% | 48.7% | 66.7% | 10.6% |
| mage\|split-core | 6 | 66.7% | 30.0%-90.3% | 64.6% | 33.3% | 42.4% |
| mage\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 69.3% | 33.3% | 51.5% |
| mechanical_dragon\|asymmetric-left | 6 | 66.7% | 30.0%-90.3% | 72.5% | 33.3% | 56.1% |
| mechanical_dragon\|asymmetric-right | 6 | 50.0% | 18.8%-81.2% | 69.9% | 50.0% | 47.0% |
| mechanical_dragon\|compact-core | 6 | 33.3% | 9.7%-70.0% | 49.2% | 66.7% | 24.2% |
| mechanical_dragon\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 73.0% | 33.3% | 45.5% |
| mechanical_dragon\|layered-rings | 6 | 50.0% | 18.8%-81.2% | 67.2% | 50.0% | 48.5% |
| mechanical_dragon\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 49.5% | 66.7% | 24.2% |
| mechanical_dragon\|southern-funnel | 6 | 66.7% | 30.0%-90.3% | 66.1% | 33.3% | 57.6% |
| mechanical_dragon\|split-core | 6 | 66.7% | 30.0%-90.3% | 65.6% | 33.3% | 57.6% |
| mechanical_dragon\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 74.1% | 33.3% | 60.6% |
| mimic\|asymmetric-left | 6 | 66.7% | 30.0%-90.3% | 69.8% | 33.3% | 54.8% |
| mimic\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 67.2% | 33.3% | 59.5% |
| mimic\|compact-core | 6 | 33.3% | 9.7%-70.0% | 44.4% | 65.6% | 23.8% |
| mimic\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 72.0% | 33.3% | 64.3% |
| mimic\|layered-rings | 6 | 66.7% | 30.0%-90.3% | 69.4% | 33.3% | 61.9% |
| mimic\|resource-shield | 6 | 33.3% | 9.7%-70.0% | 46.2% | 66.7% | 28.6% |
| mimic\|southern-funnel | 6 | 66.7% | 30.0%-90.3% | 65.1% | 33.3% | 61.9% |
| mimic\|split-core | 6 | 66.7% | 30.0%-90.3% | 64.6% | 33.3% | 66.7% |
| mimic\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 75.1% | 28.2% | 61.9% |
| pea_shooter\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 64.6% | 50.0% | 31.5% |
| pea_shooter\|asymmetric-right | 6 | 66.7% | 30.0%-90.3% | 65.1% | 33.3% | 33.3% |
| pea_shooter\|compact-core | 6 | 16.7% | 3.0%-56.4% | 41.3% | 82.7% | 9.3% |
| pea_shooter\|defense-ring | 6 | 66.7% | 30.0%-90.3% | 59.8% | 33.3% | 29.6% |
| pea_shooter\|layered-rings | 6 | 66.7% | 30.0%-90.3% | 61.8% | 33.3% | 38.9% |
| pea_shooter\|resource-shield | 6 | 16.7% | 3.0%-56.4% | 33.9% | 81.7% | 1.9% |
| pea_shooter\|southern-funnel | 6 | 66.7% | 30.0%-90.3% | 61.4% | 33.3% | 35.2% |
| pea_shooter\|split-core | 6 | 66.7% | 30.0%-90.3% | 64.0% | 33.3% | 42.6% |
| pea_shooter\|wide-spread | 6 | 66.7% | 30.0%-90.3% | 70.4% | 33.3% | 44.4% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-layered-rings-006 | 7 | layered-rings | rushed-defense | 16 | 0.0% | 97.9% |
| th7-wide-spread-050 | 7 | wide-spread | rushed-defense | 16 | 0.0% | 97.2% |
| th7-compact-core-074 | 7 | compact-core | rushed-defense | 16 | 0.0% | 95.4% |
| th6-asymmetric-left-015 | 6 | asymmetric-left | rushed-defense | 15 | 0.0% | 100.0% |
| th6-rear-keep-061 | 6 | rear-keep | rushed-defense | 15 | 0.0% | 100.0% |
| th6-resource-shield-083 | 6 | resource-shield | rushed-defense | 15 | 0.0% | 98.8% |
| th6-asymmetric-right-017 | 6 | asymmetric-right | rushed-defense | 14 | 0.0% | 100.0% |
| th7-compact-core-002 | 7 | compact-core | maxed | 14 | 0.0% | 100.0% |
| th7-diamond-024 | 7 | diamond | maxed | 14 | 0.0% | 100.0% |
| th7-southern-funnel-046 | 7 | southern-funnel | maxed | 14 | 0.0% | 100.0% |
| th6-kill-corridor-035 | 6 | kill-corridor | maxed | 14 | 0.0% | 99.8% |
| th6-corner-keep-057 | 6 | corner-keep | maxed | 14 | 0.0% | 99.6% |
| th6-defense-ring-039 | 6 | defense-ring | rushed-defense | 14 | 0.0% | 99.3% |
| th6-resource-shield-011 | 6 | resource-shield | maxed | 14 | 0.0% | 98.5% |
| th6-split-core-079 | 6 | split-core | maxed | 14 | 0.0% | 97.9% |

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
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-057 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-039 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-023 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-067 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-069 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-035 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-005 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-061 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-011 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-083 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-045 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-079 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-wide-spread-049 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-015 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-017 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-073 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-070 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-006 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-062 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-012 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-084 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-046 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-080 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-050 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-016 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-018 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-002 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-074 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-058 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-040 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-024 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-left-068 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th6-corner-keep-057 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-029 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-defense-ring-039 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-defense-ring-075 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-diamond-023 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-echelon-left-067 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-echelon-right-033 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-echelon-right-069 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-035 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-layered-rings-005 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th6-layered-rings-041 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th6-layered-rings-077 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-rear-keep-061 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-011 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-resource-shield-083 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-045 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-split-core-007 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-split-core-079 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-019 has 100.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th6-wide-spread-013 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-wide-spread-049 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th6-wide-spread-085 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-015 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-asymmetric-left-051 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-017 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-asymmetric-right-053 has 100.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-cannon-screen-063 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-compact-core-001 has 0.0% attacker wins across 12 samples.
- **INFO / fragile-base:** th6-compact-core-037 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-073 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th6-corner-keep-021 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th7-echelon-right-070 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-layered-rings-006 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-layered-rings-042 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th7-rear-keep-062 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th7-resource-shield-012 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-resource-shield-084 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-southern-funnel-010 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-046 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-split-core-008 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-split-core-044 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th7-split-core-080 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-trap-lanes-020 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th7-wide-spread-050 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-086 has 100.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-016 has 0.0% attacker wins across 13 samples.
- 16 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
