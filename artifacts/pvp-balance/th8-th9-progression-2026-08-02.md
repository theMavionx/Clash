# Clash Full-Game Balance Lab

**Generated:** 2026-08-02T18:51:28.986Z
**Seed:** 8029
**Town Halls:** TH8, TH9
**Unique generated bases:** 120
**Unique attack policies:** 240
**Capacity-filled core army templates:** 40
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 1250
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
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45, TH8=45, TH9=45, TH10=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 54.2s

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
- Spawn coverage by Town Hall: TH8=100/100, TH9=100/100
- Bases exercised: 120/120

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 829 | 55.3% | 0 | 26.9s | 59.4% | 42.4% | 36.1% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH8->TH8 | 825 | 457 | 55.4% | 0 | 25.9s | 60.5% | 42.1% |
| TH9->TH9 | 675 | 372 | 55.1% | 0 | 28.1s | 58.0% | 42.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 112 | 60 | 53.6% | 0 | 26.8s | 56.2% | 43.9% |
| wide-spread | 105 | 69 | 65.7% | 0 | 28.6s | 68.0% | 31.7% |
| rear-keep | 104 | 75 | 72.1% | 0 | 29.6s | 68.0% | 26.6% |
| echelon-right | 102 | 56 | 54.9% | 0 | 25.9s | 57.8% | 44.2% |
| echelon-left | 100 | 51 | 51.0% | 0 | 29.7s | 58.0% | 46.7% |
| resource-shield | 99 | 53 | 53.5% | 0 | 29.5s | 58.5% | 44.2% |
| diamond | 95 | 50 | 52.6% | 0 | 27.6s | 60.6% | 44.6% |
| asymmetric-right | 89 | 44 | 49.4% | 0 | 24.9s | 55.7% | 49.8% |
| asymmetric-left | 87 | 42 | 48.3% | 0 | 23.9s | 55.5% | 50.2% |
| crossfire | 87 | 60 | 69.0% | 0 | 28.5s | 67.2% | 28.4% |
| kill-corridor | 85 | 46 | 54.1% | 0 | 27.9s | 58.6% | 44.9% |
| defense-ring | 84 | 51 | 60.7% | 0 | 25.9s | 60.6% | 38.2% |
| southern-funnel | 62 | 24 | 38.7% | 0 | 24.1s | 49.3% | 56.2% |
| split-core | 62 | 30 | 48.4% | 0 | 23.6s | 53.9% | 46.6% |
| corner-keep | 61 | 25 | 41.0% | 0 | 22.6s | 50.6% | 55.5% |
| layered-rings | 60 | 26 | 43.3% | 0 | 24.7s | 52.2% | 54.7% |
| trap-lanes | 59 | 40 | 67.8% | 0 | 28.7s | 68.3% | 28.7% |
| cannon-screen | 47 | 27 | 57.4% | 0 | 28.0s | 61.8% | 37.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH9 | 64 | 33 | 51.6% | 0 | 26.7s | 51.4% | 45.5% |
| wide-spread\|TH9 | 59 | 39 | 66.1% | 0 | 30.2s | 67.1% | 32.8% |
| echelon-right\|TH9 | 58 | 30 | 51.7% | 0 | 25.9s | 53.6% | 47.4% |
| rear-keep\|TH9 | 58 | 43 | 74.1% | 0 | 31.7s | 65.5% | 24.3% |
| defense-ring\|TH8 | 57 | 35 | 61.4% | 0 | 26.1s | 63.9% | 37.8% |
| echelon-left\|TH8 | 50 | 25 | 50.0% | 0 | 27.9s | 57.3% | 47.0% |
| echelon-left\|TH9 | 50 | 26 | 52.0% | 0 | 31.4s | 58.6% | 46.4% |
| kill-corridor\|TH8 | 50 | 29 | 58.0% | 0 | 26.4s | 58.2% | 41.4% |
| resource-shield\|TH8 | 50 | 24 | 48.0% | 0 | 27.2s | 55.4% | 51.8% |
| asymmetric-left\|TH8 | 49 | 25 | 51.0% | 0 | 23.0s | 57.7% | 47.3% |
| diamond\|TH9 | 49 | 28 | 57.1% | 0 | 29.2s | 61.6% | 40.5% |
| resource-shield\|TH9 | 49 | 29 | 59.2% | 0 | 31.8s | 61.5% | 36.5% |
| compact-core\|TH8 | 48 | 27 | 56.3% | 0 | 26.9s | 62.9% | 41.6% |
| trap-lanes\|TH8 | 48 | 31 | 64.6% | 0 | 28.2s | 66.8% | 32.4% |
| asymmetric-right\|TH8 | 46 | 25 | 54.3% | 0 | 25.6s | 59.6% | 45.6% |
| corner-keep\|TH8 | 46 | 20 | 43.5% | 0 | 23.4s | 52.9% | 51.9% |
| diamond\|TH8 | 46 | 22 | 47.8% | 0 | 26.0s | 59.4% | 48.8% |
| rear-keep\|TH8 | 46 | 32 | 69.6% | 0 | 26.9s | 71.4% | 29.5% |
| southern-funnel\|TH8 | 46 | 22 | 47.8% | 0 | 24.3s | 54.5% | 46.3% |
| wide-spread\|TH8 | 46 | 30 | 65.2% | 0 | 26.5s | 69.2% | 30.3% |
| crossfire\|TH8 | 44 | 32 | 72.7% | 0 | 29.4s | 70.3% | 24.5% |
| echelon-right\|TH8 | 44 | 26 | 59.1% | 0 | 25.9s | 64.0% | 39.9% |
| asymmetric-right\|TH9 | 43 | 19 | 44.2% | 0 | 24.2s | 51.9% | 54.3% |
| crossfire\|TH9 | 43 | 28 | 65.1% | 0 | 27.5s | 64.4% | 32.5% |
| asymmetric-left\|TH9 | 38 | 17 | 44.7% | 0 | 25.1s | 52.9% | 54.0% |
| layered-rings\|TH8 | 37 | 14 | 37.8% | 0 | 21.0s | 49.9% | 59.1% |
| cannon-screen\|TH8 | 36 | 18 | 50.0% | 0 | 27.7s | 56.3% | 42.8% |
| split-core\|TH8 | 36 | 20 | 55.6% | 0 | 22.3s | 56.4% | 43.3% |
| kill-corridor\|TH9 | 35 | 17 | 48.6% | 0 | 29.9s | 59.2% | 50.0% |
| defense-ring\|TH9 | 27 | 16 | 59.3% | 0 | 25.3s | 54.5% | 39.0% |
| split-core\|TH9 | 26 | 10 | 38.5% | 0 | 25.4s | 50.7% | 51.1% |
| layered-rings\|TH9 | 23 | 12 | 52.2% | 0 | 30.5s | 55.7% | 47.8% |
| southern-funnel\|TH9 | 16 | 2 | 12.5% | 0 | 23.3s | 35.9% | 84.6% |
| corner-keep\|TH9 | 15 | 5 | 33.3% | 0 | 20.2s | 44.3% | 66.7% |
| cannon-screen\|TH9 | 11 | 9 | 81.8% | 0 | 28.9s | 78.1% | 18.2% |
| trap-lanes\|TH9 | 11 | 9 | 81.8% | 0 | 30.9s | 74.5% | 12.6% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 372 | 56 | 15.1% | 0 | 23.3s | 35.6% | 81.5% |
| mixed | 343 | 301 | 87.8% | 0 | 28.0s | 77.2% | 10.8% |
| rushed-defense | 337 | 90 | 26.7% | 0 | 22.7s | 46.5% | 70.2% |
| mid | 277 | 220 | 79.4% | 0 | 31.4s | 72.5% | 18.1% |
| rushed-economy | 171 | 162 | 94.7% | 0 | 33.8s | 79.4% | 5.2% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 1250 | 743 | 59.4% | 0 | 27.7s | 64.7% | 38.5% |
| policy-exploration | 250 | 86 | 34.4% | 0 | 22.7s | 33.1% | 61.6% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH8 | 700 | 421 | 60.1% | 0 | 26.7s | 65.8% | 37.7% |
| pure-unit-matrix\|TH9 | 550 | 322 | 58.5% | 0 | 29.0s | 63.3% | 39.6% |
| policy-exploration\|TH8 | 125 | 36 | 28.8% | 0 | 21.3s | 31.4% | 67.0% |
| policy-exploration\|TH9 | 125 | 50 | 40.0% | 0 | 24.2s | 34.6% | 56.2% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 153 | 59 | 38.6% | 0 | 23.5s | 34.7% | 56.3% |
| policy-exploration\|archer | 144 | 54 | 37.5% | 0 | 22.2s | 35.7% | 58.1% |
| pure-unit-matrix\|archer | 120 | 69 | 57.5% | 0 | 24.4s | 65.3% | 41.4% |
| pure-unit-matrix\|demon_king | 120 | 103 | 85.8% | 0 | 27.7s | 78.5% | 12.8% |
| pure-unit-matrix\|fire_dragon | 120 | 120 | 100.0% | 0 | 14.7s | 87.8% | 0.0% |
| pure-unit-matrix\|knight | 120 | 67 | 55.8% | 0 | 29.6s | 60.1% | 41.1% |
| pure-unit-matrix\|mage | 120 | 70 | 58.3% | 0 | 19.4s | 69.2% | 37.9% |
| pure-unit-matrix\|mechanical_dragon | 120 | 72 | 60.0% | 0 | 27.2s | 70.1% | 38.3% |
| pure-unit-matrix\|mimic | 120 | 82 | 68.3% | 0 | 35.4s | 69.0% | 27.4% |
| pure-unit-matrix\|necromancer | 120 | 56 | 46.7% | 0 | 28.6s | 54.9% | 52.1% |
| pure-unit-matrix\|pea_shooter | 120 | 63 | 52.5% | 0 | 30.3s | 62.0% | 46.7% |
| pure-unit-matrix\|wind_mage | 120 | 28 | 23.3% | 0 | 29.0s | 42.4% | 73.2% |
| policy-exploration\|fire_dragon | 87 | 37 | 42.5% | 0 | 19.9s | 38.3% | 52.9% |
| policy-exploration\|demon_king | 77 | 35 | 45.5% | 0 | 24.9s | 38.2% | 48.8% |
| policy-exploration\|mimic | 76 | 32 | 42.1% | 0 | 24.6s | 35.8% | 50.4% |
| policy-exploration\|mechanical_dragon | 74 | 28 | 37.8% | 0 | 23.6s | 37.3% | 60.1% |
| policy-exploration\|necromancer | 65 | 24 | 36.9% | 0 | 21.5s | 35.8% | 59.2% |
| policy-exploration\|mage | 63 | 18 | 28.6% | 0 | 18.1s | 32.7% | 67.5% |
| policy-exploration\|pea_shooter | 53 | 18 | 34.0% | 0 | 23.0s | 30.2% | 63.1% |
| pure-unit-matrix\|ice_golem | 50 | 13 | 26.0% | 0 | 54.8s | 35.3% | 73.7% |
| policy-exploration\|wind_mage | 43 | 9 | 20.9% | 0 | 19.9s | 22.8% | 76.9% |
| policy-exploration\|ice_golem | 40 | 20 | 50.0% | 0 | 30.4s | 38.9% | 47.4% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH8 | 78 | 26 | 33.3% | 0 | 22.1s | 33.8% | 60.9% |
| policy-exploration\|archer\|TH9 | 75 | 32 | 42.7% | 0 | 23.8s | 37.3% | 53.2% |
| policy-exploration\|knight\|TH9 | 75 | 33 | 44.0% | 0 | 24.9s | 35.5% | 51.6% |
| pure-unit-matrix\|archer\|TH8 | 70 | 41 | 58.6% | 0 | 25.0s | 66.1% | 41.1% |
| pure-unit-matrix\|demon_king\|TH8 | 70 | 55 | 78.6% | 0 | 27.2s | 75.7% | 19.8% |
| pure-unit-matrix\|fire_dragon\|TH8 | 70 | 70 | 100.0% | 0 | 15.3s | 88.8% | 0.0% |
| pure-unit-matrix\|knight\|TH8 | 70 | 36 | 51.4% | 0 | 28.7s | 55.5% | 45.9% |
| pure-unit-matrix\|mage\|TH8 | 70 | 41 | 58.6% | 0 | 20.2s | 70.2% | 35.9% |
| pure-unit-matrix\|mechanical_dragon\|TH8 | 70 | 43 | 61.4% | 0 | 28.2s | 72.2% | 36.7% |
| pure-unit-matrix\|mimic\|TH8 | 70 | 44 | 62.9% | 0 | 34.8s | 65.8% | 32.7% |
| pure-unit-matrix\|necromancer\|TH8 | 70 | 37 | 52.9% | 0 | 28.2s | 57.4% | 47.1% |
| pure-unit-matrix\|pea_shooter\|TH8 | 70 | 37 | 52.9% | 0 | 29.4s | 60.8% | 46.4% |
| pure-unit-matrix\|wind_mage\|TH8 | 70 | 17 | 24.3% | 0 | 30.4s | 45.1% | 71.5% |
| policy-exploration\|archer\|TH8 | 69 | 22 | 31.9% | 0 | 20.5s | 33.9% | 63.5% |
| pure-unit-matrix\|archer\|TH9 | 50 | 28 | 56.0% | 0 | 23.5s | 64.2% | 41.9% |
| pure-unit-matrix\|demon_king\|TH9 | 50 | 48 | 96.0% | 0 | 28.4s | 82.3% | 2.9% |
| pure-unit-matrix\|fire_dragon\|TH9 | 50 | 50 | 100.0% | 0 | 13.8s | 86.5% | 0.0% |
| pure-unit-matrix\|ice_golem\|TH9 | 50 | 13 | 26.0% | 0 | 54.8s | 35.3% | 73.7% |
| pure-unit-matrix\|knight\|TH9 | 50 | 31 | 62.0% | 0 | 31.0s | 66.1% | 34.3% |
| pure-unit-matrix\|mage\|TH9 | 50 | 29 | 58.0% | 0 | 18.3s | 67.8% | 40.5% |
| pure-unit-matrix\|mechanical_dragon\|TH9 | 50 | 29 | 58.0% | 0 | 25.9s | 67.4% | 40.6% |
| pure-unit-matrix\|mimic\|TH9 | 50 | 38 | 76.0% | 0 | 36.2s | 73.2% | 20.0% |
| pure-unit-matrix\|necromancer\|TH9 | 50 | 19 | 38.0% | 0 | 29.2s | 51.7% | 59.1% |
| pure-unit-matrix\|pea_shooter\|TH9 | 50 | 26 | 52.0% | 0 | 31.4s | 63.6% | 47.2% |
| pure-unit-matrix\|wind_mage\|TH9 | 50 | 11 | 22.0% | 0 | 26.9s | 38.8% | 75.5% |
| policy-exploration\|mimic\|TH8 | 48 | 18 | 37.5% | 0 | 20.9s | 34.8% | 55.4% |
| policy-exploration\|fire_dragon\|TH9 | 47 | 24 | 51.1% | 0 | 22.1s | 41.0% | 45.1% |
| policy-exploration\|fire_dragon\|TH8 | 40 | 13 | 32.5% | 0 | 17.3s | 34.9% | 62.1% |
| policy-exploration\|ice_golem\|TH9 | 40 | 20 | 50.0% | 0 | 30.4s | 38.9% | 47.4% |
| policy-exploration\|necromancer\|TH8 | 40 | 14 | 35.0% | 0 | 20.3s | 34.2% | 60.2% |
| policy-exploration\|demon_king\|TH8 | 39 | 18 | 46.2% | 0 | 24.8s | 40.5% | 45.6% |
| policy-exploration\|mechanical_dragon\|TH8 | 39 | 14 | 35.9% | 0 | 22.8s | 37.7% | 61.0% |
| policy-exploration\|demon_king\|TH9 | 38 | 17 | 44.7% | 0 | 25.1s | 36.1% | 52.1% |
| policy-exploration\|mage\|TH9 | 35 | 11 | 31.4% | 0 | 21.6s | 31.4% | 64.3% |
| policy-exploration\|mechanical_dragon\|TH9 | 35 | 14 | 40.0% | 0 | 24.6s | 36.9% | 59.0% |
| policy-exploration\|mage\|TH8 | 28 | 7 | 25.0% | 0 | 13.8s | 34.4% | 71.6% |
| policy-exploration\|mimic\|TH9 | 28 | 14 | 50.0% | 0 | 30.9s | 37.5% | 41.8% |
| policy-exploration\|pea_shooter\|TH9 | 28 | 11 | 39.3% | 0 | 24.8s | 35.7% | 59.8% |
| policy-exploration\|necromancer\|TH9 | 25 | 10 | 40.0% | 0 | 23.3s | 38.2% | 57.7% |
| policy-exploration\|pea_shooter\|TH8 | 25 | 7 | 28.0% | 0 | 20.9s | 23.6% | 66.8% |
| policy-exploration\|wind_mage\|TH8 | 23 | 3 | 13.0% | 0 | 18.2s | 19.0% | 84.3% |
| policy-exploration\|wind_mage\|TH9 | 20 | 6 | 30.0% | 0 | 21.8s | 26.8% | 68.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 1250 | 743 | 59.4% | 0 | 27.7s | 64.7% | 38.5% |
| policy-exploration\|rage-entry | 28 | 14 | 50.0% | 0 | 24.7s | 51.7% | 50.0% |
| policy-exploration\|none | 27 | 11 | 40.7% | 0 | 27.4s | 45.7% | 57.9% |
| policy-exploration\|freeze-defense | 26 | 8 | 30.8% | 0 | 23.1s | 42.0% | 69.2% |
| policy-exploration\|freeze-rage | 26 | 11 | 42.3% | 0 | 26.8s | 44.7% | 55.2% |
| policy-exploration\|rally-core | 25 | 4 | 16.0% | 0 | 14.9s | 5.9% | 68.1% |
| policy-exploration\|cannon-medkit | 24 | 7 | 29.2% | 0 | 22.8s | 35.0% | 66.4% |
| policy-exploration\|cannon-rally | 24 | 8 | 33.3% | 0 | 13.6s | 5.7% | 62.7% |
| policy-exploration\|medkit-entry | 24 | 7 | 29.2% | 0 | 24.0s | 35.7% | 70.3% |
| policy-exploration\|rally-rage | 24 | 5 | 20.8% | 0 | 13.5s | 9.4% | 67.1% |
| policy-exploration\|cannon-focus | 22 | 11 | 50.0% | 0 | 36.7s | 51.0% | 50.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 130 | 75 | 57.7% | 0 | 26.7s | 64.7% | 39.7% |
| pure-unit-matrix\|dual-flank | 130 | 73 | 56.2% | 0 | 24.8s | 63.9% | 43.4% |
| pure-unit-matrix\|left-flank | 130 | 77 | 59.2% | 0 | 27.9s | 61.3% | 36.9% |
| pure-unit-matrix\|right-flank | 130 | 72 | 55.4% | 0 | 27.3s | 62.3% | 39.1% |
| pure-unit-matrix\|wide-line | 130 | 82 | 63.1% | 0 | 23.6s | 68.7% | 36.6% |
| pure-unit-matrix\|diamond | 120 | 72 | 60.0% | 0 | 29.8s | 66.6% | 38.2% |
| pure-unit-matrix\|edge-sweep | 120 | 78 | 65.0% | 0 | 30.2s | 69.2% | 34.3% |
| pure-unit-matrix\|inverted-wedge | 120 | 72 | 60.0% | 0 | 29.5s | 62.6% | 39.1% |
| pure-unit-matrix\|three-lane | 120 | 74 | 61.7% | 0 | 29.2s | 65.9% | 35.3% |
| pure-unit-matrix\|vanguard-wedge | 120 | 68 | 56.7% | 0 | 29.3s | 61.6% | 42.6% |
| policy-exploration\|three-lane | 29 | 11 | 37.9% | 0 | 22.9s | 38.5% | 58.1% |
| policy-exploration\|center-column | 28 | 9 | 32.1% | 0 | 23.8s | 26.9% | 64.6% |
| policy-exploration\|dual-flank | 26 | 10 | 38.5% | 0 | 21.8s | 31.2% | 54.6% |
| policy-exploration\|inverted-wedge | 26 | 9 | 34.6% | 0 | 22.2s | 29.6% | 64.6% |
| policy-exploration\|edge-sweep | 25 | 6 | 24.0% | 0 | 22.0s | 31.2% | 71.4% |
| policy-exploration\|left-flank | 25 | 10 | 40.0% | 0 | 27.2s | 37.4% | 54.1% |
| policy-exploration\|diamond | 24 | 9 | 37.5% | 0 | 20.0s | 28.6% | 61.8% |
| policy-exploration\|vanguard-wedge | 23 | 6 | 26.1% | 0 | 19.2s | 32.8% | 70.8% |
| policy-exploration\|wide-line | 23 | 8 | 34.8% | 0 | 21.4s | 39.7% | 62.4% |
| policy-exploration\|right-flank | 21 | 8 | 38.1% | 0 | 27.0s | 35.5% | 53.3% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 250 | 157 | 62.8% | 0 | 27.0s | 65.0% | 35.4% |
| pure-unit-matrix\|drip | 250 | 139 | 55.6% | 0 | 28.3s | 62.6% | 42.8% |
| pure-unit-matrix\|rapid | 250 | 151 | 60.4% | 0 | 27.5s | 65.8% | 37.6% |
| pure-unit-matrix\|three-waves | 250 | 158 | 63.2% | 0 | 28.6s | 67.3% | 34.0% |
| pure-unit-matrix\|two-waves | 250 | 138 | 55.2% | 0 | 27.3s | 62.6% | 42.9% |
| policy-exploration\|rapid | 51 | 16 | 31.4% | 0 | 23.3s | 29.3% | 65.5% |
| policy-exploration\|burst | 50 | 22 | 44.0% | 0 | 28.8s | 42.1% | 52.8% |
| policy-exploration\|three-waves | 50 | 22 | 44.0% | 0 | 21.7s | 43.0% | 51.3% |
| policy-exploration\|two-waves | 50 | 14 | 28.0% | 0 | 17.7s | 18.3% | 68.1% |
| policy-exploration\|drip | 49 | 12 | 24.5% | 0 | 22.1s | 32.7% | 70.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 625 | 371 | 59.4% | 0 | 27.2s | 64.4% | 38.6% |
| pure-unit-matrix\|tank-front-support-rear | 625 | 372 | 59.5% | 0 | 28.3s | 64.9% | 38.5% |
| policy-exploration\|tank-front-support-rear | 126 | 46 | 36.5% | 0 | 24.7s | 32.5% | 60.5% |
| policy-exploration\|roster-order | 124 | 40 | 32.3% | 0 | 20.7s | 33.6% | 62.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 134 | 65 | 48.5% | 0 | 29.6s | 57.9% | 50.8% |
| pure-archer | 132 | 70 | 53.0% | 0 | 23.3s | 60.9% | 46.0% |
| pure-demon_king | 131 | 111 | 84.7% | 0 | 28.2s | 76.4% | 14.0% |
| pure-fire_dragon | 128 | 123 | 96.1% | 0 | 14.6s | 84.5% | 3.3% |
| pure-mechanical_dragon | 127 | 74 | 58.3% | 0 | 26.9s | 68.2% | 40.1% |
| pure-wind_mage | 127 | 28 | 22.0% | 0 | 28.0s | 40.6% | 74.7% |
| pure-knight | 126 | 72 | 57.1% | 0 | 29.6s | 59.3% | 39.9% |
| pure-necromancer | 126 | 56 | 44.4% | 0 | 27.9s | 53.1% | 54.4% |
| pure-mage | 125 | 70 | 56.0% | 0 | 18.9s | 66.9% | 40.3% |
| pure-mimic | 125 | 85 | 68.0% | 0 | 35.4s | 68.7% | 27.4% |
| pure-ice_golem | 51 | 14 | 27.5% | 0 | 56.7s | 36.2% | 72.2% |
| core-mage-filled | 11 | 1 | 9.1% | 0 | 12.5s | 26.0% | 82.8% |
| random-2 | 11 | 4 | 36.4% | 0 | 17.0s | 21.2% | 52.8% |
| random-4 | 11 | 4 | 36.4% | 0 | 18.5s | 37.9% | 63.2% |
| ranged-pressure | 11 | 3 | 27.3% | 0 | 16.0s | 36.1% | 71.0% |
| balanced | 10 | 7 | 70.0% | 0 | 24.9s | 52.2% | 28.9% |
| core-necromancer-filled | 10 | 5 | 50.0% | 0 | 32.8s | 55.7% | 49.9% |
| random-5 | 10 | 7 | 70.0% | 0 | 24.6s | 57.3% | 30.0% |
| core-mimic-filled | 9 | 4 | 44.4% | 0 | 31.7s | 36.4% | 38.7% |
| melee-pressure | 9 | 3 | 33.3% | 0 | 32.6s | 26.6% | 61.5% |
| random-1 | 9 | 3 | 33.3% | 0 | 26.1s | 26.8% | 64.3% |
| trap-runner-mix | 8 | 3 | 37.5% | 0 | 26.8s | 34.5% | 45.0% |
| core-fire_dragon-filled | 7 | 3 | 42.9% | 0 | 16.5s | 34.5% | 50.6% |
| core-wind_mage-filled | 7 | 1 | 14.3% | 0 | 24.9s | 24.4% | 84.7% |
| support-mix | 7 | 4 | 57.1% | 0 | 21.4s | 29.8% | 38.3% |
| frontline-ranged | 6 | 3 | 50.0% | 0 | 16.8s | 59.4% | 50.0% |
| random-3 | 6 | 1 | 16.7% | 0 | 20.8s | 24.5% | 80.9% |
| random-6 | 6 | 2 | 33.3% | 0 | 27.5s | 32.1% | 65.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__tank-front-support-rear | 18 | 9 | 50.0% | 0 | 28.7s | 49.6% | 50.0% |
| center-column__rapid__roster-order | 18 | 9 | 50.0% | 0 | 26.8s | 54.3% | 47.7% |
| dual-flank__burst__roster-order | 17 | 9 | 52.9% | 0 | 22.8s | 59.9% | 47.1% |
| dual-flank__burst__tank-front-support-rear | 17 | 11 | 64.7% | 0 | 29.2s | 62.8% | 33.9% |
| wide-line__three-waves__roster-order | 17 | 12 | 70.6% | 0 | 22.8s | 64.7% | 29.2% |
| center-column__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.2s | 58.6% | 35.1% |
| center-column__three-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 27.3s | 54.1% | 50.4% |
| diamond__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.8s | 51.3% | 49.8% |
| dual-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 23.6s | 60.8% | 42.5% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.5s | 60.7% | 33.1% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.4s | 64.2% | 32.1% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.5s | 53.9% | 43.3% |
| left-flank__drip__roster-order | 16 | 6 | 37.5% | 0 | 26.0s | 50.2% | 57.3% |
| left-flank__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 30.0s | 62.0% | 16.1% |
| left-flank__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 32.8s | 71.3% | 18.1% |
| left-flank__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 29.9s | 54.7% | 56.0% |
| left-flank__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.4s | 65.1% | 30.7% |
| right-flank__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 27.8s | 59.5% | 52.7% |
| three-lane__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 28.2s | 64.4% | 29.7% |
| three-lane__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 29.2s | 54.3% | 53.5% |
| three-lane__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 29.4s | 61.2% | 36.2% |
| vanguard-wedge__burst__roster-order | 16 | 6 | 37.5% | 0 | 21.7s | 45.5% | 59.7% |
| wide-line__burst__roster-order | 16 | 10 | 62.5% | 0 | 20.5s | 64.6% | 35.2% |
| center-column__burst__roster-order | 15 | 10 | 66.7% | 0 | 24.8s | 70.3% | 27.3% |
| center-column__drip__roster-order | 15 | 5 | 33.3% | 0 | 22.9s | 52.7% | 66.7% |
| center-column__drip__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 29.8s | 61.2% | 40.0% |
| center-column__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 26.7s | 72.3% | 23.1% |
| center-column__two-waves__roster-order | 15 | 9 | 60.0% | 0 | 23.3s | 59.5% | 39.7% |
| center-column__two-waves__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 23.4s | 49.7% | 59.7% |
| diamond__drip__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 29.1s | 60.4% | 46.7% |
| diamond__two-waves__roster-order | 15 | 6 | 40.0% | 0 | 22.9s | 48.9% | 59.3% |
| dual-flank__drip__roster-order | 15 | 7 | 46.7% | 0 | 28.4s | 55.0% | 47.7% |
| dual-flank__drip__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 23.8s | 50.8% | 64.8% |
| dual-flank__rapid__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 21.9s | 56.6% | 46.3% |
| dual-flank__three-waves__roster-order | 15 | 8 | 53.3% | 0 | 22.9s | 60.3% | 46.7% |
| dual-flank__two-waves__roster-order | 15 | 7 | 46.7% | 0 | 22.9s | 56.9% | 52.4% |
| dual-flank__two-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 22.5s | 60.1% | 40.0% |
| edge-sweep__drip__roster-order | 15 | 7 | 46.7% | 0 | 22.6s | 56.2% | 53.3% |
| edge-sweep__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 27.8s | 58.5% | 49.5% |
| edge-sweep__two-waves__roster-order | 15 | 6 | 40.0% | 0 | 27.6s | 56.0% | 58.3% |
| inverted-wedge__drip__roster-order | 15 | 4 | 26.7% | 0 | 23.4s | 42.7% | 71.5% |
| inverted-wedge__rapid__roster-order | 15 | 7 | 46.7% | 0 | 26.3s | 54.2% | 53.3% |
| inverted-wedge__two-waves__roster-order | 15 | 6 | 40.0% | 0 | 22.0s | 45.8% | 55.9% |
| inverted-wedge__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 27.0s | 54.8% | 31.5% |
| left-flank__burst__roster-order | 15 | 12 | 80.0% | 0 | 27.5s | 65.6% | 19.2% |
| left-flank__burst__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 26.4s | 56.8% | 39.7% |
| left-flank__rapid__roster-order | 15 | 5 | 33.3% | 0 | 22.4s | 49.2% | 63.6% |
| left-flank__two-waves__roster-order | 15 | 7 | 46.7% | 0 | 30.7s | 51.6% | 39.4% |
| left-flank__two-waves__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 22.7s | 46.1% | 57.9% |
| right-flank__burst__roster-order | 15 | 11 | 73.3% | 0 | 29.1s | 61.6% | 23.6% |
| right-flank__burst__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 28.5s | 49.2% | 53.6% |
| right-flank__drip__roster-order | 15 | 9 | 60.0% | 0 | 31.6s | 59.8% | 40.0% |
| right-flank__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 26.4s | 58.1% | 51.0% |
| right-flank__rapid__roster-order | 15 | 8 | 53.3% | 0 | 23.9s | 58.2% | 32.4% |
| right-flank__rapid__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 27.6s | 62.5% | 34.8% |
| right-flank__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 27.7s | 68.9% | 25.1% |
| right-flank__three-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 25.2s | 49.2% | 60.0% |
| right-flank__two-waves__roster-order | 15 | 9 | 60.0% | 0 | 24.7s | 58.6% | 37.1% |
| three-lane__drip__roster-order | 15 | 6 | 40.0% | 0 | 23.3s | 50.2% | 55.7% |
| three-lane__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 29.7s | 69.1% | 32.8% |
| three-lane__two-waves__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 27.2s | 49.3% | 49.6% |
| vanguard-wedge__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 27.1s | 67.0% | 33.3% |
| wide-line__burst__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 25.2s | 65.4% | 39.4% |
| wide-line__drip__roster-order | 15 | 10 | 66.7% | 0 | 24.4s | 71.9% | 33.3% |
| wide-line__drip__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 23.1s | 62.9% | 46.7% |
| wide-line__rapid__roster-order | 15 | 5 | 33.3% | 0 | 20.0s | 54.0% | 65.7% |
| wide-line__rapid__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 28.0s | 76.8% | 24.3% |
| wide-line__three-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 26.4s | 61.4% | 46.7% |
| wide-line__two-waves__roster-order | 15 | 7 | 46.7% | 0 | 19.9s | 59.8% | 52.7% |
| wide-line__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 22.2s | 61.3% | 33.3% |
| diamond__burst__roster-order | 14 | 9 | 64.3% | 0 | 26.0s | 65.3% | 35.7% |
| diamond__burst__tank-front-support-rear | 14 | 7 | 50.0% | 0 | 24.4s | 54.5% | 50.0% |
| diamond__drip__roster-order | 14 | 8 | 57.1% | 0 | 30.3s | 58.6% | 42.9% |
| diamond__rapid__roster-order | 14 | 8 | 57.1% | 0 | 28.8s | 58.5% | 38.8% |
| diamond__rapid__tank-front-support-rear | 14 | 9 | 64.3% | 0 | 34.2s | 71.5% | 35.2% |
| diamond__three-waves__roster-order | 14 | 10 | 71.4% | 0 | 34.1s | 70.5% | 18.3% |
| diamond__three-waves__tank-front-support-rear | 14 | 8 | 57.1% | 0 | 25.6s | 64.7% | 42.3% |
| edge-sweep__burst__roster-order | 14 | 8 | 57.1% | 0 | 25.3s | 60.8% | 42.9% |
| edge-sweep__burst__tank-front-support-rear | 14 | 10 | 71.4% | 0 | 34.1s | 76.6% | 28.6% |
| edge-sweep__rapid__roster-order | 14 | 9 | 64.3% | 0 | 26.9s | 59.1% | 35.1% |
| edge-sweep__rapid__tank-front-support-rear | 14 | 9 | 64.3% | 0 | 34.5s | 61.1% | 35.7% |
| edge-sweep__three-waves__roster-order | 14 | 10 | 71.4% | 0 | 30.3s | 72.1% | 28.2% |
| edge-sweep__two-waves__tank-front-support-rear | 14 | 8 | 57.1% | 0 | 34.2s | 63.1% | 41.7% |
| inverted-wedge__burst__roster-order | 14 | 12 | 85.7% | 0 | 42.5s | 78.9% | 14.1% |
| inverted-wedge__burst__tank-front-support-rear | 14 | 6 | 42.9% | 0 | 25.4s | 48.1% | 57.1% |
| inverted-wedge__drip__tank-front-support-rear | 14 | 9 | 64.3% | 0 | 37.8s | 67.9% | 35.7% |
| inverted-wedge__three-waves__roster-order | 14 | 7 | 50.0% | 0 | 26.2s | 54.8% | 50.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 14 | 11 | 78.6% | 0 | 28.3s | 68.6% | 21.4% |
| three-lane__burst__roster-order | 14 | 11 | 78.6% | 0 | 31.2s | 73.5% | 19.2% |
| three-lane__burst__tank-front-support-rear | 14 | 7 | 50.0% | 0 | 25.8s | 54.0% | 50.0% |
| three-lane__rapid__roster-order | 14 | 8 | 57.1% | 0 | 24.8s | 64.1% | 42.9% |
| three-lane__three-waves__tank-front-support-rear | 14 | 10 | 71.4% | 0 | 30.5s | 66.6% | 25.9% |
| vanguard-wedge__burst__tank-front-support-rear | 14 | 9 | 64.3% | 0 | 29.5s | 64.7% | 35.6% |
| vanguard-wedge__drip__roster-order | 14 | 8 | 57.1% | 0 | 26.6s | 55.4% | 42.3% |
| vanguard-wedge__drip__tank-front-support-rear | 14 | 6 | 42.9% | 0 | 31.1s | 54.4% | 57.1% |
| vanguard-wedge__rapid__roster-order | 14 | 6 | 42.9% | 0 | 23.1s | 48.6% | 57.1% |
| vanguard-wedge__rapid__tank-front-support-rear | 14 | 8 | 57.1% | 0 | 30.3s | 66.4% | 40.7% |
| vanguard-wedge__three-waves__tank-front-support-rear | 14 | 7 | 50.0% | 0 | 30.7s | 56.9% | 50.0% |
| vanguard-wedge__two-waves__roster-order | 14 | 9 | 64.3% | 0 | 31.0s | 58.2% | 32.4% |
| vanguard-wedge__two-waves__tank-front-support-rear | 14 | 5 | 35.7% | 0 | 26.5s | 52.7% | 62.1% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 158 | 84 | 53.2% | 0 | 26.2s | 58.0% | 44.2% |
| dual-flank | 156 | 83 | 53.2% | 0 | 24.3s | 58.5% | 45.2% |
| left-flank | 155 | 87 | 56.1% | 0 | 27.7s | 57.4% | 39.7% |
| wide-line | 153 | 90 | 58.8% | 0 | 23.2s | 64.3% | 40.5% |
| right-flank | 151 | 80 | 53.0% | 0 | 27.3s | 58.6% | 41.1% |
| three-lane | 149 | 85 | 57.0% | 0 | 27.9s | 60.5% | 39.7% |
| inverted-wedge | 146 | 81 | 55.5% | 0 | 28.2s | 56.7% | 43.7% |
| edge-sweep | 145 | 84 | 57.9% | 0 | 28.8s | 62.7% | 40.7% |
| diamond | 144 | 81 | 56.3% | 0 | 28.2s | 60.2% | 42.2% |
| vanguard-wedge | 143 | 74 | 51.7% | 0 | 27.7s | 56.9% | 47.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rapid | 301 | 167 | 55.5% | 0 | 26.8s | 59.6% | 42.3% |
| burst | 300 | 179 | 59.7% | 0 | 27.3s | 61.1% | 38.3% |
| three-waves | 300 | 180 | 60.0% | 0 | 27.4s | 63.2% | 36.9% |
| two-waves | 300 | 152 | 50.7% | 0 | 25.7s | 55.2% | 47.1% |
| drip | 299 | 151 | 50.5% | 0 | 27.3s | 57.7% | 47.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| tank-front-support-rear | 751 | 418 | 55.7% | 0 | 27.7s | 59.4% | 42.2% |
| roster-order | 749 | 411 | 54.9% | 0 | 26.1s | 59.3% | 42.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 1277 | 754 | 59.0% | 0 | 27.7s | 64.3% | 39.0% |
| rage-entry | 28 | 14 | 50.0% | 0 | 24.7s | 51.7% | 50.0% |
| freeze-defense | 26 | 8 | 30.8% | 0 | 23.1s | 42.0% | 69.2% |
| freeze-rage | 26 | 11 | 42.3% | 0 | 26.8s | 44.7% | 55.2% |
| rally-core | 25 | 4 | 16.0% | 0 | 14.9s | 5.9% | 68.1% |
| cannon-medkit | 24 | 7 | 29.2% | 0 | 22.8s | 35.0% | 66.4% |
| cannon-rally | 24 | 8 | 33.3% | 0 | 13.6s | 5.7% | 62.7% |
| medkit-entry | 24 | 7 | 29.2% | 0 | 24.0s | 35.7% | 70.3% |
| rally-rage | 24 | 5 | 20.8% | 0 | 13.5s | 9.4% | 67.1% |
| cannon-focus | 22 | 11 | 50.0% | 0 | 36.7s | 51.0% | 50.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 282 | 239 | 84.8% | 0 | 21.1s | 75.3% | 13.9% |
| unrevealed | 43 | 21 | 48.8% | 0 | 25.6s | 42.6% | 47.3% |
| legendary | 41 | 19 | 46.3% | 0 | 19.4s | 42.3% | 49.4% |
| epic | 38 | 16 | 42.1% | 0 | 23.1s | 37.1% | 50.2% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon\|common | 143 | 128 | 89.5% | 0 | 15.6s | 78.8% | 9.8% |
| demon_king\|common | 139 | 111 | 79.9% | 0 | 26.8s | 71.7% | 18.2% |
| fire_dragon\|legendary | 23 | 9 | 39.1% | 0 | 17.8s | 38.4% | 58.6% |
| demon_king\|unrevealed | 22 | 10 | 45.5% | 0 | 29.4s | 41.7% | 50.7% |
| fire_dragon\|unrevealed | 21 | 11 | 52.4% | 0 | 21.5s | 43.5% | 43.7% |
| fire_dragon\|epic | 20 | 9 | 45.0% | 0 | 19.8s | 39.4% | 47.2% |
| demon_king\|epic | 18 | 7 | 38.9% | 0 | 26.6s | 34.6% | 53.7% |
| demon_king\|legendary | 18 | 10 | 55.6% | 0 | 21.5s | 47.2% | 37.8% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1373 | 791 | 57.6% | 0 | 27.4s | 62.3% | 40.2% |
| ward-2 | 127 | 38 | 29.9% | 0 | 21.5s | 27.6% | 66.5% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1304 | 778 | 59.7% | 0 | 27.6s | 64.2% | 38.1% |
| low | 75 | 27 | 36.0% | 0 | 27.1s | 35.5% | 60.2% |
| mixed | 66 | 14 | 21.2% | 0 | 17.9s | 19.7% | 77.9% |
| mid | 55 | 10 | 18.2% | 0 | 21.3s | 24.7% | 76.1% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 273 | 126 | 46.2% | 0 | 26.2s | 45.8% | 49.6% |
| archer | 264 | 123 | 46.6% | 0 | 23.2s | 49.1% | 50.5% |
| fire_dragon | 207 | 157 | 75.8% | 0 | 16.9s | 66.9% | 22.2% |
| demon_king | 197 | 138 | 70.1% | 0 | 26.6s | 62.7% | 26.9% |
| mimic | 196 | 114 | 58.2% | 0 | 31.2s | 56.2% | 36.3% |
| mechanical_dragon | 194 | 100 | 51.5% | 0 | 25.8s | 57.5% | 46.6% |
| necromancer | 185 | 80 | 43.2% | 0 | 26.1s | 48.2% | 54.6% |
| mage | 183 | 88 | 48.1% | 0 | 18.9s | 56.5% | 48.1% |
| pea_shooter | 173 | 81 | 46.8% | 0 | 28.0s | 52.2% | 51.7% |
| wind_mage | 163 | 37 | 22.7% | 0 | 26.6s | 37.2% | 74.2% |
| ice_golem | 90 | 33 | 36.7% | 0 | 43.9s | 36.9% | 62.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 120 | 57.5% | 48.6%-66.0% | 65.3% | 41.4% | 35.1% |
| demon_king | 120 | 85.8% | 78.5%-91.0% | 78.5% | 12.8% | 69.4% |
| fire_dragon | 120 | 100.0% | 96.9%-100.0% | 87.8% | 0.0% | 96.9% |
| ice_golem | 50 | 26.0% | 15.9%-39.6% | 35.3% | 73.7% | 12.0% |
| knight | 120 | 55.8% | 46.9%-64.4% | 60.1% | 41.1% | 33.3% |
| mage | 120 | 58.3% | 49.4%-66.8% | 69.2% | 37.9% | 34.6% |
| mechanical_dragon | 120 | 60.0% | 51.1%-68.3% | 70.1% | 38.3% | 46.4% |
| mimic | 120 | 68.3% | 59.6%-76.0% | 69.0% | 27.4% | 57.8% |
| necromancer | 120 | 46.7% | 38.0%-55.6% | 54.9% | 52.1% | 39.2% |
| pea_shooter | 120 | 52.5% | 43.6%-61.2% | 62.0% | 46.7% | 29.3% |
| wind_mage | 120 | 23.3% | 16.7%-31.7% | 42.4% | 73.2% | 16.7% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH8 | 70 | 58.6% | 46.9%-69.4% | 66.1% | 41.1% | 34.0% |
| archer\|TH9 | 50 | 56.0% | 42.3%-68.8% | 64.2% | 41.9% | 36.6% |
| demon_king\|TH8 | 70 | 78.6% | 67.6%-86.6% | 75.7% | 19.8% | 63.7% |
| demon_king\|TH9 | 50 | 96.0% | 86.5%-98.9% | 82.3% | 2.9% | 77.4% |
| fire_dragon\|TH8 | 70 | 100.0% | 94.8%-100.0% | 88.8% | 0.0% | 96.4% |
| fire_dragon\|TH9 | 50 | 100.0% | 92.9%-100.0% | 86.5% | 0.0% | 97.5% |
| ice_golem\|TH9 | 50 | 26.0% | 15.9%-39.6% | 35.3% | 73.7% | 12.0% |
| knight\|TH8 | 70 | 51.4% | 40.0%-62.8% | 55.5% | 45.9% | 29.0% |
| knight\|TH9 | 50 | 62.0% | 48.2%-74.1% | 66.1% | 34.3% | 39.2% |
| mage\|TH8 | 70 | 58.6% | 46.9%-69.4% | 70.2% | 35.9% | 33.7% |
| mage\|TH9 | 50 | 58.0% | 44.2%-70.6% | 67.8% | 40.5% | 36.0% |
| mechanical_dragon\|TH8 | 70 | 61.4% | 49.7%-72.0% | 72.2% | 36.7% | 47.3% |
| mechanical_dragon\|TH9 | 50 | 58.0% | 44.2%-70.6% | 67.4% | 40.6% | 45.1% |
| mimic\|TH8 | 70 | 62.9% | 51.1%-73.2% | 65.8% | 32.7% | 52.3% |
| mimic\|TH9 | 50 | 76.0% | 62.6%-85.7% | 73.2% | 20.0% | 65.6% |
| necromancer\|TH8 | 70 | 52.9% | 41.3%-64.1% | 57.4% | 47.1% | 45.7% |
| necromancer\|TH9 | 50 | 38.0% | 25.9%-51.8% | 51.7% | 59.1% | 30.0% |
| pea_shooter\|TH8 | 70 | 52.9% | 41.3%-64.1% | 60.8% | 46.4% | 30.0% |
| pea_shooter\|TH9 | 50 | 52.0% | 38.5%-65.2% | 63.6% | 47.2% | 28.2% |
| wind_mage\|TH8 | 70 | 24.3% | 15.8%-35.5% | 45.1% | 71.5% | 19.3% |
| wind_mage\|TH9 | 50 | 22.0% | 12.8%-35.2% | 38.8% | 75.5% | 13.0% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 7 | 42.9% | 15.8%-75.0% | 57.6% | 57.1% | 27.0% |
| archer\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 60.4% | 56.8% | 32.7% |
| archer\|compact-core | 8 | 50.0% | 21.5%-78.5% | 62.5% | 50.0% | 31.7% |
| archer\|crossfire | 7 | 71.4% | 35.9%-91.8% | 63.6% | 28.6% | 33.3% |
| archer\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 68.6% | 42.9% | 38.7% |
| archer\|diamond | 8 | 50.0% | 21.5%-78.5% | 60.4% | 43.5% | 35.6% |
| archer\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 61.3% | 34.3% | 29.2% |
| archer\|echelon-right | 8 | 75.0% | 40.9%-92.9% | 62.2% | 25.0% | 26.4% |
| archer\|kill-corridor | 7 | 57.1% | 25.0%-84.2% | 62.9% | 41.0% | 30.5% |
| archer\|rear-keep | 8 | 75.0% | 40.9%-92.9% | 77.2% | 25.0% | 53.1% |
| archer\|resource-shield | 8 | 50.0% | 21.5%-78.5% | 68.0% | 50.0% | 37.2% |
| archer\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 81.3% | 21.6% | 54.4% |
| demon_king\|asymmetric-left | 7 | 85.7% | 48.7%-97.4% | 82.0% | 14.3% | 69.4% |
| demon_king\|asymmetric-right | 7 | 85.7% | 48.7%-97.4% | 80.0% | 14.3% | 67.3% |
| demon_king\|compact-core | 8 | 87.5% | 52.9%-97.8% | 77.8% | 12.5% | 64.3% |
| demon_king\|crossfire | 7 | 85.7% | 48.7%-97.4% | 77.5% | 14.3% | 77.6% |
| demon_king\|defense-ring | 7 | 85.7% | 48.7%-97.4% | 75.9% | 14.3% | 63.3% |
| demon_king\|diamond | 8 | 87.5% | 52.9%-97.8% | 77.8% | 12.5% | 66.1% |
| demon_king\|echelon-left | 8 | 87.5% | 52.9%-97.8% | 79.1% | 12.5% | 60.7% |
| demon_king\|echelon-right | 8 | 87.5% | 52.9%-97.8% | 81.3% | 8.7% | 67.9% |
| demon_king\|kill-corridor | 7 | 100.0% | 64.6%-100.0% | 88.4% | 0.0% | 89.8% |
| demon_king\|rear-keep | 8 | 100.0% | 67.6%-100.0% | 88.1% | 0.0% | 85.7% |
| demon_king\|resource-shield | 8 | 75.0% | 40.9%-92.9% | 73.7% | 25.0% | 58.9% |
| demon_king\|wide-spread | 8 | 100.0% | 67.6%-100.0% | 82.2% | 0.0% | 91.1% |
| fire_dragon\|asymmetric-left | 7 | 100.0% | 64.6%-100.0% | 88.5% | 0.0% | 100.0% |
| fire_dragon\|asymmetric-right | 7 | 100.0% | 64.6%-100.0% | 88.0% | 0.0% | 96.4% |
| fire_dragon\|compact-core | 8 | 100.0% | 67.6%-100.0% | 88.4% | 0.0% | 93.8% |
| fire_dragon\|crossfire | 7 | 100.0% | 64.6%-100.0% | 86.2% | 0.0% | 100.0% |
| fire_dragon\|defense-ring | 7 | 100.0% | 64.6%-100.0% | 87.2% | 0.0% | 89.3% |
| fire_dragon\|diamond | 8 | 100.0% | 67.6%-100.0% | 85.4% | 0.0% | 96.9% |
| fire_dragon\|echelon-left | 8 | 100.0% | 67.6%-100.0% | 85.9% | 0.0% | 93.8% |
| fire_dragon\|echelon-right | 8 | 100.0% | 67.6%-100.0% | 88.1% | 0.0% | 100.0% |
| fire_dragon\|kill-corridor | 7 | 100.0% | 64.6%-100.0% | 88.4% | 0.0% | 100.0% |
| fire_dragon\|rear-keep | 8 | 100.0% | 67.6%-100.0% | 88.8% | 0.0% | 100.0% |
| fire_dragon\|resource-shield | 8 | 100.0% | 67.6%-100.0% | 86.1% | 0.0% | 96.9% |
| fire_dragon\|wide-spread | 8 | 100.0% | 67.6%-100.0% | 88.8% | 0.0% | 100.0% |
| knight\|asymmetric-left | 7 | 57.1% | 25.0%-84.2% | 62.6% | 42.9% | 32.1% |
| knight\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 50.5% | 53.6% | 30.5% |
| knight\|compact-core | 8 | 50.0% | 21.5%-78.5% | 63.1% | 48.2% | 25.8% |
| knight\|crossfire | 7 | 71.4% | 35.9%-91.8% | 70.2% | 28.6% | 44.1% |
| knight\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 58.8% | 42.9% | 35.9% |
| knight\|diamond | 8 | 50.0% | 21.5%-78.5% | 60.1% | 46.8% | 31.9% |
| knight\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 56.9% | 50.5% | 26.7% |
| knight\|echelon-right | 8 | 75.0% | 40.9%-92.9% | 63.7% | 25.0% | 33.3% |
| knight\|kill-corridor | 7 | 42.9% | 15.8%-75.0% | 55.3% | 55.0% | 29.5% |
| knight\|rear-keep | 8 | 87.5% | 52.9%-97.8% | 78.8% | 12.5% | 55.3% |
| knight\|resource-shield | 8 | 50.0% | 21.5%-78.5% | 57.9% | 38.1% | 30.0% |
| knight\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 77.8% | 23.0% | 53.1% |
| mage\|asymmetric-left | 7 | 57.1% | 25.0%-84.2% | 68.7% | 29.0% | 40.8% |
| mage\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 60.4% | 57.1% | 26.5% |
| mage\|compact-core | 8 | 50.0% | 21.5%-78.5% | 65.3% | 38.4% | 35.7% |
| mage\|crossfire | 7 | 100.0% | 64.6%-100.0% | 87.6% | 0.0% | 67.3% |
| mage\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 66.4% | 42.9% | 30.6% |
| mage\|diamond | 8 | 50.0% | 21.5%-78.5% | 71.5% | 46.4% | 32.1% |
| mage\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 63.7% | 50.0% | 26.8% |
| mage\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 64.4% | 37.5% | 25.0% |
| mage\|kill-corridor | 7 | 57.1% | 25.0%-84.2% | 62.5% | 42.9% | 28.6% |
| mage\|rear-keep | 8 | 75.0% | 40.9%-92.9% | 76.9% | 25.0% | 50.0% |
| mage\|resource-shield | 8 | 50.0% | 21.5%-78.5% | 72.2% | 50.0% | 30.4% |
| mage\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 82.8% | 13.4% | 46.4% |
| mechanical_dragon\|asymmetric-left | 7 | 42.9% | 15.8%-75.0% | 55.4% | 57.1% | 34.9% |
| mechanical_dragon\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 54.2% | 57.1% | 38.1% |
| mechanical_dragon\|compact-core | 8 | 50.0% | 21.5%-78.5% | 62.8% | 50.0% | 38.9% |
| mechanical_dragon\|crossfire | 7 | 85.7% | 48.7%-97.4% | 85.8% | 10.0% | 76.2% |
| mechanical_dragon\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 69.3% | 41.6% | 46.0% |
| mechanical_dragon\|diamond | 8 | 50.0% | 21.5%-78.5% | 70.3% | 50.0% | 43.1% |
| mechanical_dragon\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 71.9% | 36.0% | 43.1% |
| mechanical_dragon\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 77.8% | 37.5% | 43.1% |
| mechanical_dragon\|kill-corridor | 7 | 57.1% | 25.0%-84.2% | 72.4% | 39.6% | 42.9% |
| mechanical_dragon\|rear-keep | 8 | 87.5% | 52.9%-97.8% | 83.1% | 11.0% | 69.4% |
| mechanical_dragon\|resource-shield | 8 | 50.0% | 21.5%-78.5% | 62.0% | 49.2% | 41.7% |
| mechanical_dragon\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 83.8% | 22.8% | 61.1% |
| mimic\|asymmetric-left | 7 | 57.1% | 25.0%-84.2% | 61.9% | 39.0% | 51.4% |
| mimic\|asymmetric-right | 7 | 57.1% | 25.0%-84.2% | 64.7% | 42.9% | 54.3% |
| mimic\|compact-core | 8 | 75.0% | 40.9%-92.9% | 63.4% | 25.1% | 57.5% |
| mimic\|crossfire | 7 | 71.4% | 35.9%-91.8% | 74.2% | 17.1% | 71.4% |
| mimic\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 65.7% | 31.3% | 45.7% |
| mimic\|diamond | 8 | 62.5% | 30.6%-86.3% | 66.8% | 37.5% | 50.0% |
| mimic\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 68.8% | 33.7% | 47.5% |
| mimic\|echelon-right | 8 | 75.0% | 40.9%-92.9% | 71.3% | 25.0% | 70.0% |
| mimic\|kill-corridor | 7 | 85.7% | 48.7%-97.4% | 79.3% | 12.1% | 71.4% |
| mimic\|rear-keep | 8 | 87.5% | 52.9%-97.8% | 80.0% | 11.5% | 70.0% |
| mimic\|resource-shield | 8 | 75.0% | 40.9%-92.9% | 66.1% | 17.6% | 60.0% |
| mimic\|wide-spread | 8 | 87.5% | 52.9%-97.8% | 80.0% | 12.5% | 77.5% |
| necromancer\|asymmetric-left | 7 | 42.9% | 15.8%-75.0% | 50.7% | 57.1% | 35.7% |
| necromancer\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 48.7% | 57.1% | 42.9% |
| necromancer\|compact-core | 8 | 50.0% | 21.5%-78.5% | 59.7% | 50.0% | 50.0% |
| necromancer\|crossfire | 7 | 71.4% | 35.9%-91.8% | 65.8% | 28.6% | 64.3% |
| necromancer\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 60.2% | 42.9% | 57.1% |
| necromancer\|diamond | 8 | 50.0% | 21.5%-78.5% | 56.3% | 50.0% | 43.8% |
| necromancer\|echelon-left | 8 | 37.5% | 13.7%-69.4% | 50.6% | 62.5% | 31.3% |
| necromancer\|echelon-right | 8 | 37.5% | 13.7%-69.4% | 46.3% | 62.5% | 18.8% |
| necromancer\|kill-corridor | 7 | 28.6% | 8.2%-64.1% | 46.9% | 71.4% | 28.6% |
| necromancer\|rear-keep | 8 | 50.0% | 21.5%-78.5% | 64.1% | 42.6% | 43.8% |
| necromancer\|resource-shield | 8 | 37.5% | 13.7%-69.4% | 47.8% | 62.5% | 25.0% |
| necromancer\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 72.5% | 25.0% | 50.0% |
| pea_shooter\|asymmetric-left | 7 | 42.9% | 15.8%-75.0% | 51.1% | 57.1% | 19.0% |
| pea_shooter\|asymmetric-right | 7 | 42.9% | 15.8%-75.0% | 59.3% | 57.1% | 22.2% |
| pea_shooter\|compact-core | 8 | 50.0% | 21.5%-78.5% | 61.6% | 50.0% | 27.8% |
| pea_shooter\|crossfire | 7 | 71.4% | 35.9%-91.8% | 66.9% | 28.6% | 50.8% |
| pea_shooter\|defense-ring | 7 | 57.1% | 25.0%-84.2% | 57.7% | 42.9% | 34.9% |
| pea_shooter\|diamond | 8 | 50.0% | 21.5%-78.5% | 64.6% | 43.6% | 33.3% |
| pea_shooter\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 67.5% | 45.8% | 30.6% |
| pea_shooter\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 69.4% | 37.5% | 27.8% |
| pea_shooter\|kill-corridor | 7 | 28.6% | 8.2%-64.1% | 49.1% | 71.4% | 23.8% |
| pea_shooter\|rear-keep | 8 | 50.0% | 21.5%-78.5% | 64.7% | 50.0% | 30.6% |
| pea_shooter\|resource-shield | 8 | 37.5% | 13.7%-69.4% | 55.1% | 62.2% | 25.0% |
| pea_shooter\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 82.2% | 23.9% | 38.9% |
| wind_mage\|asymmetric-left | 7 | 14.3% | 2.6%-51.3% | 39.9% | 85.7% | 14.3% |
| wind_mage\|asymmetric-right | 7 | 14.3% | 2.6%-51.3% | 34.5% | 85.7% | 14.3% |
| wind_mage\|compact-core | 8 | 37.5% | 13.7%-69.4% | 41.9% | 62.5% | 18.8% |
| wind_mage\|crossfire | 7 | 42.9% | 15.8%-75.0% | 62.9% | 44.0% | 35.7% |
| wind_mage\|defense-ring | 7 | 28.6% | 8.2%-64.1% | 41.6% | 71.4% | 28.6% |
| wind_mage\|diamond | 8 | 25.0% | 7.1%-59.1% | 45.3% | 64.1% | 18.8% |
| wind_mage\|echelon-left | 8 | 12.5% | 2.2%-47.1% | 41.3% | 87.5% | 6.3% |
| wind_mage\|echelon-right | 8 | 0.0% | 0.0%-32.4% | 34.4% | 98.5% | 0.0% |
| wind_mage\|kill-corridor | 7 | 14.3% | 2.6%-51.3% | 32.4% | 85.7% | 7.1% |
| wind_mage\|rear-keep | 8 | 37.5% | 13.7%-69.4% | 43.8% | 62.5% | 25.0% |
| wind_mage\|resource-shield | 8 | 25.0% | 7.1%-59.1% | 38.9% | 68.7% | 12.5% |
| wind_mage\|wide-spread | 8 | 37.5% | 13.7%-69.4% | 57.5% | 54.3% | 25.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th9-split-core-062 | 9 | split-core | maxed | 15 | 6.7% | 79.1% |
| th8-resource-shield-006 | 8 | resource-shield | maxed | 14 | 7.1% | 92.9% |
| th8-split-core-061 | 8 | split-core | maxed | 14 | 7.1% | 90.3% |
| th8-compact-core-001 | 8 | compact-core | maxed | 14 | 7.1% | 86.2% |
| th8-layered-rings-090 | 8 | layered-rings | maxed | 13 | 7.7% | 89.1% |
| th8-diamond-016 | 8 | diamond | maxed | 13 | 7.7% | 88.3% |
| th8-corner-keep-043 | 8 | corner-keep | maxed | 13 | 7.7% | 87.9% |
| th8-southern-funnel-033 | 8 | southern-funnel | maxed | 13 | 7.7% | 85.3% |
| th9-southern-funnel-034 | 9 | southern-funnel | maxed | 16 | 12.5% | 84.6% |
| th9-compact-core-002 | 9 | compact-core | maxed | 16 | 12.5% | 83.2% |
| th8-asymmetric-left-098 | 8 | asymmetric-left | maxed | 11 | 9.1% | 90.9% |
| th9-resource-shield-007 | 9 | resource-shield | maxed | 11 | 9.1% | 80.2% |
| th8-trap-lanes-072 | 8 | trap-lanes | maxed | 14 | 14.3% | 85.4% |
| th8-asymmetric-left-010 | 8 | asymmetric-left | rushed-defense | 14 | 14.3% | 80.0% |
| th8-defense-ring-119 | 8 | defense-ring | maxed | 10 | 10.0% | 90.0% |

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

- **CRITICAL / town-hall-target-band:** policy-exploration|TH8 has 28.8% attacker wins across 125 samples; authored target is 47.0%-63.0%.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH9 has 40.0% attacker wins across 125 samples; authored target is 47.0%-63.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 34.4% is outside 55.0% +/- 8.0% across 250 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 85.8% attacker wins across 120 samples (reference 59.4%).
- **WARNING / pure-troop-outlier:** pure-troop fire_dragon has 100.0% attacker wins across 120 samples (reference 59.4%).
- **WARNING / pure-troop-outlier:** pure-troop wind_mage has 23.3% attacker wins across 120 samples (reference 59.4%).
- **WARNING / pure-troop-outlier:** pure-troop ice_golem has 26.0% attacker wins across 50 samples (reference 59.4%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 85.8% attacker wins across 120 isolated samples.
- **WARNING / degenerate-pure-army:** Pure fire_dragon armies have 100.0% attacker wins across 120 isolated samples.
- **INFO / fragile-base:** th8-compact-core-117 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th8-crossfire-021 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-crossfire-048 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-defense-ring-003 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-diamond-105 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-kill-corridor-116 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-layered-rings-059 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-rear-keep-076 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-resource-shield-094 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th8-southern-funnel-005 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-wide-spread-066 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th8-asymmetric-right-070 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th9-diamond-106 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th9-resource-shield-095 has 100.0% attacker wins across 16 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.

