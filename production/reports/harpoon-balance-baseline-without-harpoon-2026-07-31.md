# Clash Full-Game Balance Lab

**Generated:** 2026-07-31T13:42:25.856Z
**Seed:** 731
**Town Halls:** TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `../../../AppData/Local/Temp/harpoon-baseline-input.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 500
**Unbeaten non-adaptive bases (n >= 6):** 0
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
**Balance replay simulations:** 500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 12.7s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `../../../AppData/Local/Temp/harpoon-baseline-input.json`; imported base and building IDs must be non-empty and unique.
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
- Building coverage: 13/14
- Troop simulation coverage: 4/8
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100
- Bases exercised: 150/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% | 34.2% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 36 | 19 | 52.8% | 0 | 29.4s | 59.4% | 43.6% |
| southern-funnel | 36 | 21 | 58.3% | 0 | 32.8s | 61.6% | 40.4% |
| split-core | 36 | 21 | 58.3% | 0 | 27.2s | 60.6% | 41.7% |
| trap-lanes | 32 | 19 | 59.4% | 0 | 27.7s | 61.8% | 40.5% |
| wide-spread | 32 | 22 | 68.8% | 0 | 33.8s | 74.7% | 29.0% |
| asymmetric-left | 30 | 18 | 60.0% | 0 | 30.1s | 65.5% | 39.0% |
| compact-core | 27 | 15 | 55.6% | 0 | 28.4s | 64.0% | 44.2% |
| defense-ring | 27 | 16 | 59.3% | 0 | 28.6s | 70.5% | 40.5% |
| layered-rings | 27 | 13 | 48.1% | 0 | 30.7s | 62.5% | 51.6% |
| rear-keep | 25 | 15 | 60.0% | 0 | 30.9s | 64.9% | 39.4% |
| asymmetric-right | 24 | 14 | 58.3% | 0 | 29.7s | 65.2% | 41.6% |
| cannon-screen | 24 | 18 | 75.0% | 0 | 31.1s | 69.4% | 25.0% |
| corner-keep | 24 | 14 | 58.3% | 0 | 28.8s | 64.1% | 40.4% |
| crossfire | 24 | 16 | 66.7% | 0 | 26.6s | 61.9% | 33.3% |
| diamond | 24 | 12 | 50.0% | 0 | 31.0s | 61.2% | 49.7% |
| echelon-left | 24 | 15 | 62.5% | 0 | 31.3s | 64.7% | 34.4% |
| echelon-right | 24 | 16 | 66.7% | 0 | 34.5s | 62.4% | 31.8% |
| kill-corridor | 24 | 13 | 54.2% | 0 | 29.1s | 61.8% | 40.7% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield\|TH6 | 36 | 19 | 52.8% | 0 | 29.4s | 59.4% | 43.6% |
| southern-funnel\|TH6 | 36 | 21 | 58.3% | 0 | 32.8s | 61.6% | 40.4% |
| split-core\|TH6 | 36 | 21 | 58.3% | 0 | 27.2s | 60.6% | 41.7% |
| trap-lanes\|TH6 | 32 | 19 | 59.4% | 0 | 27.7s | 61.8% | 40.5% |
| wide-spread\|TH6 | 32 | 22 | 68.8% | 0 | 33.8s | 74.7% | 29.0% |
| asymmetric-left\|TH6 | 30 | 18 | 60.0% | 0 | 30.1s | 65.5% | 39.0% |
| compact-core\|TH6 | 27 | 15 | 55.6% | 0 | 28.4s | 64.0% | 44.2% |
| defense-ring\|TH6 | 27 | 16 | 59.3% | 0 | 28.6s | 70.5% | 40.5% |
| layered-rings\|TH6 | 27 | 13 | 48.1% | 0 | 30.7s | 62.5% | 51.6% |
| rear-keep\|TH6 | 25 | 15 | 60.0% | 0 | 30.9s | 64.9% | 39.4% |
| asymmetric-right\|TH6 | 24 | 14 | 58.3% | 0 | 29.7s | 65.2% | 41.6% |
| cannon-screen\|TH6 | 24 | 18 | 75.0% | 0 | 31.1s | 69.4% | 25.0% |
| corner-keep\|TH6 | 24 | 14 | 58.3% | 0 | 28.8s | 64.1% | 40.4% |
| crossfire\|TH6 | 24 | 16 | 66.7% | 0 | 26.6s | 61.9% | 33.3% |
| diamond\|TH6 | 24 | 12 | 50.0% | 0 | 31.0s | 61.2% | 49.7% |
| echelon-left\|TH6 | 24 | 15 | 62.5% | 0 | 31.3s | 64.7% | 34.4% |
| echelon-right\|TH6 | 24 | 16 | 66.7% | 0 | 34.5s | 62.4% | 31.8% |
| kill-corridor\|TH6 | 24 | 13 | 54.2% | 0 | 29.1s | 61.8% | 40.7% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 101 | 101 | 100.0% | 0 | 32.0s | 85.6% | 0.0% |
| maxed | 100 | 0 | 0.0% | 0 | 24.0s | 26.5% | 98.8% |
| mid | 100 | 92 | 92.0% | 0 | 37.7s | 82.8% | 7.7% |
| rushed-defense | 100 | 13 | 13.0% | 0 | 25.0s | 43.0% | 82.7% |
| mixed | 99 | 91 | 91.9% | 0 | 31.6s | 82.6% | 8.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer | 150 | 76 | 50.7% | 0 | 39.0s | 57.2% | 49.1% |
| pure-unit-matrix\|demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 69.9% | 31.5% |
| pure-unit-matrix\|fire_dragon | 150 | 92 | 61.3% | 0 | 21.4s | 65.5% | 37.5% |
| pure-unit-matrix\|knight | 50 | 30 | 60.0% | 0 | 31.0s | 63.9% | 39.9% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer\|TH6 | 150 | 76 | 50.7% | 0 | 39.0s | 57.2% | 49.1% |
| pure-unit-matrix\|demon_king\|TH6 | 150 | 99 | 66.0% | 0 | 29.5s | 69.9% | 31.5% |
| pure-unit-matrix\|fire_dragon\|TH6 | 150 | 92 | 61.3% | 0 | 21.4s | 65.5% | 37.5% |
| pure-unit-matrix\|knight\|TH6 | 50 | 30 | 60.0% | 0 | 31.0s | 63.9% | 39.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 50 | 29 | 58.0% | 0 | 29.8s | 59.7% | 41.4% |
| pure-unit-matrix\|diamond | 50 | 31 | 62.0% | 0 | 30.6s | 64.5% | 37.9% |
| pure-unit-matrix\|dual-flank | 50 | 30 | 60.0% | 0 | 30.7s | 64.9% | 39.9% |
| pure-unit-matrix\|edge-sweep | 50 | 30 | 60.0% | 0 | 31.3s | 66.4% | 39.1% |
| pure-unit-matrix\|inverted-wedge | 50 | 29 | 58.0% | 0 | 30.8s | 64.3% | 41.4% |
| pure-unit-matrix\|left-flank | 50 | 31 | 62.0% | 0 | 30.3s | 65.9% | 34.7% |
| pure-unit-matrix\|right-flank | 50 | 29 | 58.0% | 0 | 29.2s | 61.1% | 40.3% |
| pure-unit-matrix\|three-lane | 50 | 31 | 62.0% | 0 | 27.6s | 66.9% | 36.8% |
| pure-unit-matrix\|vanguard-wedge | 50 | 32 | 64.0% | 0 | 32.5s | 63.9% | 35.3% |
| pure-unit-matrix\|wide-line | 50 | 25 | 50.0% | 0 | 27.8s | 63.8% | 47.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 100 | 58 | 58.0% | 0 | 27.6s | 62.8% | 40.2% |
| pure-unit-matrix\|drip | 100 | 58 | 58.0% | 0 | 30.2s | 64.9% | 40.6% |
| pure-unit-matrix\|rapid | 100 | 56 | 56.0% | 0 | 29.0s | 62.8% | 42.9% |
| pure-unit-matrix\|three-waves | 100 | 57 | 57.0% | 0 | 31.7s | 62.4% | 42.0% |
| pure-unit-matrix\|two-waves | 100 | 68 | 68.0% | 0 | 31.7s | 67.9% | 31.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 250 | 141 | 56.4% | 0 | 29.0s | 62.7% | 42.4% |
| pure-unit-matrix\|tank-front-support-rear | 250 | 156 | 62.4% | 0 | 31.2s | 65.6% | 36.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 150 | 76 | 50.7% | 0 | 39.0s | 57.2% | 49.1% |
| pure-demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 69.9% | 31.5% |
| pure-fire_dragon | 150 | 92 | 61.3% | 0 | 21.4s | 65.5% | 37.5% |
| pure-knight | 50 | 30 | 60.0% | 0 | 31.0s | 63.9% | 39.9% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 50 | 29 | 58.0% | 0 | 29.8s | 59.7% | 41.4% |
| diamond | 50 | 31 | 62.0% | 0 | 30.6s | 64.5% | 37.9% |
| dual-flank | 50 | 30 | 60.0% | 0 | 30.7s | 64.9% | 39.9% |
| edge-sweep | 50 | 30 | 60.0% | 0 | 31.3s | 66.4% | 39.1% |
| inverted-wedge | 50 | 29 | 58.0% | 0 | 30.8s | 64.3% | 41.4% |
| left-flank | 50 | 31 | 62.0% | 0 | 30.3s | 65.9% | 34.7% |
| right-flank | 50 | 29 | 58.0% | 0 | 29.2s | 61.1% | 40.3% |
| three-lane | 50 | 31 | 62.0% | 0 | 27.6s | 66.9% | 36.8% |
| vanguard-wedge | 50 | 32 | 64.0% | 0 | 32.5s | 63.9% | 35.3% |
| wide-line | 50 | 25 | 50.0% | 0 | 27.8s | 63.8% | 47.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 100 | 58 | 58.0% | 0 | 27.6s | 62.8% | 40.2% |
| drip | 100 | 58 | 58.0% | 0 | 30.2s | 64.9% | 40.6% |
| rapid | 100 | 56 | 56.0% | 0 | 29.0s | 62.8% | 42.9% |
| three-waves | 100 | 57 | 57.0% | 0 | 31.7s | 62.4% | 42.0% |
| two-waves | 100 | 68 | 68.0% | 0 | 31.7s | 67.9% | 31.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 250 | 141 | 56.4% | 0 | 29.0s | 62.7% | 42.4% |
| tank-front-support-rear | 250 | 156 | 62.4% | 0 | 31.2s | 65.6% | 36.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 300 | 191 | 63.7% | 0 | 25.4s | 67.7% | 34.5% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 150 | 99 | 66.0% | 0 | 29.5s | 69.9% | 31.5% |
| fire_dragon\|common | 150 | 92 | 61.3% | 0 | 21.4s | 65.5% | 37.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 500 | 297 | 59.4% | 0 | 30.1s | 64.1% | 39.4% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 150 | 76 | 50.7% | 0 | 39.0s | 57.2% | 49.1% |
| demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 69.9% | 31.5% |
| fire_dragon | 150 | 92 | 61.3% | 0 | 21.4s | 65.5% | 37.5% |
| knight | 50 | 30 | 60.0% | 0 | 31.0s | 63.9% | 39.9% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 150 | 50.7% | 42.7%-58.6% | 57.2% | 49.1% | 25.3% |
| demon_king | 150 | 66.0% | 58.1%-73.1% | 69.9% | 31.5% | 55.6% |
| fire_dragon | 150 | 61.3% | 53.3%-68.8% | 65.5% | 37.5% | 52.5% |
| knight | 50 | 60.0% | 46.2%-72.4% | 63.9% | 39.9% | 43.0% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 150 | 50.7% | 42.7%-58.6% | 57.2% | 49.1% | 25.3% |
| demon_king\|TH6 | 150 | 66.0% | 58.1%-73.1% | 69.9% | 31.5% | 55.6% |
| fire_dragon\|TH6 | 150 | 61.3% | 53.3%-68.8% | 65.5% | 37.5% | 52.5% |
| knight\|TH6 | 50 | 60.0% | 46.2%-72.4% | 63.9% | 39.9% | 43.0% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 65.9% | 37.5% | 36.9% |
| archer\|asymmetric-right | 8 | 50.0% | 21.5%-78.5% | 61.2% | 50.0% | 28.9% |
| archer\|cannon-screen | 8 | 62.5% | 30.6%-86.3% | 59.9% | 37.5% | 37.5% |
| archer\|compact-core | 9 | 55.6% | 26.7%-81.1% | 63.0% | 44.4% | 31.4% |
| archer\|corner-keep | 8 | 50.0% | 21.5%-78.5% | 61.2% | 46.1% | 25.0% |
| archer\|crossfire | 8 | 62.5% | 30.6%-86.3% | 55.2% | 37.5% | 31.9% |
| archer\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 65.5% | 44.4% | 28.9% |
| archer\|diamond | 8 | 37.5% | 13.7%-69.4% | 56.9% | 62.5% | 13.9% |
| archer\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 55.8% | 50.0% | 23.3% |
| archer\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 53.0% | 37.8% | 18.6% |
| archer\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 53.0% | 50.0% | 23.3% |
| archer\|layered-rings | 9 | 44.4% | 18.9%-73.3% | 59.4% | 55.0% | 23.2% |
| archer\|rear-keep | 8 | 50.0% | 21.5%-78.5% | 52.9% | 50.0% | 26.9% |
| archer\|resource-shield | 9 | 44.4% | 18.9%-73.3% | 55.6% | 55.3% | 18.0% |
| archer\|southern-funnel | 9 | 33.3% | 12.1%-64.6% | 48.3% | 66.7% | 10.6% |
| archer\|split-core | 9 | 33.3% | 12.1%-64.6% | 53.3% | 66.7% | 21.5% |
| archer\|trap-lanes | 8 | 50.0% | 21.5%-78.5% | 50.8% | 50.0% | 28.9% |
| archer\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 58.8% | 37.5% | 29.4% |
| demon_king\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 65.5% | 33.9% | 50.0% |
| demon_king\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 69.4% | 37.2% | 51.4% |
| demon_king\|cannon-screen | 8 | 87.5% | 52.9%-97.8% | 79.7% | 12.5% | 66.7% |
| demon_king\|compact-core | 9 | 55.6% | 26.7%-81.1% | 70.0% | 43.9% | 49.4% |
| demon_king\|corner-keep | 8 | 62.5% | 30.6%-86.3% | 67.7% | 37.5% | 58.3% |
| demon_king\|crossfire | 8 | 75.0% | 40.9%-92.9% | 66.4% | 25.0% | 61.1% |
| demon_king\|defense-ring | 9 | 66.7% | 35.4%-87.9% | 73.9% | 33.3% | 59.3% |
| demon_king\|diamond | 8 | 62.5% | 30.6%-86.3% | 67.7% | 36.5% | 43.1% |
| demon_king\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 68.3% | 35.9% | 52.8% |
| demon_king\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 69.4% | 32.6% | 56.9% |
| demon_king\|kill-corridor | 8 | 62.5% | 30.6%-86.3% | 71.6% | 22.0% | 50.0% |
| demon_king\|layered-rings | 9 | 55.6% | 26.7%-81.1% | 64.0% | 44.2% | 46.9% |
| demon_king\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 73.3% | 35.5% | 58.3% |
| demon_king\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 59.0% | 30.1% | 53.1% |
| demon_king\|southern-funnel | 9 | 77.8% | 45.3%-93.7% | 72.8% | 21.9% | 59.3% |
| demon_king\|split-core | 9 | 66.7% | 35.4%-87.9% | 69.6% | 33.3% | 60.5% |
| demon_king\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 67.5% | 37.5% | 54.2% |
| demon_king\|wide-spread | 8 | 87.5% | 52.9%-97.8% | 82.5% | 11.8% | 69.4% |
| fire_dragon\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 67.2% | 37.5% | 53.1% |
| fire_dragon\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 65.1% | 37.5% | 40.6% |
| fire_dragon\|cannon-screen | 8 | 75.0% | 40.9%-92.9% | 68.5% | 25.0% | 65.6% |
| fire_dragon\|compact-core | 9 | 55.6% | 26.7%-81.1% | 58.9% | 44.4% | 44.4% |
| fire_dragon\|corner-keep | 8 | 62.5% | 30.6%-86.3% | 63.4% | 37.5% | 53.1% |
| fire_dragon\|crossfire | 8 | 62.5% | 30.6%-86.3% | 64.2% | 37.5% | 59.4% |
| fire_dragon\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 72.0% | 43.8% | 52.8% |
| fire_dragon\|diamond | 8 | 50.0% | 21.5%-78.5% | 59.1% | 50.0% | 37.5% |
| fire_dragon\|echelon-left | 8 | 75.0% | 40.9%-92.9% | 70.0% | 17.4% | 59.4% |
| fire_dragon\|echelon-right | 8 | 75.0% | 40.9%-92.9% | 64.7% | 25.0% | 53.1% |
| fire_dragon\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 60.8% | 50.0% | 46.9% |
| fire_dragon\|layered-rings | 9 | 44.4% | 18.9%-73.3% | 64.0% | 55.6% | 44.4% |
| fire_dragon\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 67.1% | 37.5% | 62.5% |
| fire_dragon\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 57.9% | 44.4% | 50.0% |
| fire_dragon\|southern-funnel | 9 | 66.7% | 35.4%-87.9% | 69.3% | 28.6% | 55.6% |
| fire_dragon\|split-core | 9 | 66.7% | 35.4%-87.9% | 61.5% | 33.3% | 52.8% |
| fire_dragon\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 64.2% | 37.5% | 53.1% |
| fire_dragon\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 81.3% | 29.3% | 62.5% |
| knight\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 62.6% | 50.0% | 34.8% |
| knight\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 65.1% | 44.4% | 41.5% |
| knight\|southern-funnel | 9 | 55.6% | 26.7%-81.1% | 55.9% | 44.4% | 36.3% |
| knight\|split-core | 9 | 66.7% | 35.4%-87.9% | 58.1% | 33.3% | 43.0% |
| knight\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 64.6% | 36.9% | 47.2% |
| knight\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 76.3% | 37.4% | 48.9% |

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

- **CRITICAL / coverage:** Missing content coverage. Buildings: harpoon; troops: mage, mechanical_dragon, mimic, pea_shooter.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **INFO / fragile-base:** th6-compact-core-109 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-compact-core-145 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-compact-core-181 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-compact-core-217 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-compact-core-253 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-compact-core-289 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-corner-keep-021 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-corner-keep-057 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-corner-keep-093 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-corner-keep-129 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-corner-keep-165 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-corner-keep-201 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-corner-keep-237 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-crossfire-029 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-crossfire-065 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-crossfire-101 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-crossfire-137 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-crossfire-209 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-crossfire-245 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-crossfire-281 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-defense-ring-003 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-defense-ring-039 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-defense-ring-075 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-defense-ring-147 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-defense-ring-183 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-defense-ring-219 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-defense-ring-255 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-defense-ring-291 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-diamond-023 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-diamond-131 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-diamond-167 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-diamond-203 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-diamond-239 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-diamond-275 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-left-067 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-103 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-175 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-211 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-left-247 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-283 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-033 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-right-069 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-105 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-177 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-213 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-right-249 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-285 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-035 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-kill-corridor-071 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-kill-corridor-143 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-kill-corridor-179 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-215 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-kill-corridor-251 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-287 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-layered-rings-005 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-layered-rings-041 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-layered-rings-077 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-layered-rings-113 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-layered-rings-149 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-layered-rings-185 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-layered-rings-221 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-layered-rings-293 has 0.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-rear-keep-061 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-rear-keep-097 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-rear-keep-133 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-rear-keep-169 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-rear-keep-205 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-rear-keep-241 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-rear-keep-277 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-resource-shield-011 has 0.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-resource-shield-083 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-resource-shield-119 has 100.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-resource-shield-155 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-resource-shield-191 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-resource-shield-227 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-resource-shield-263 has 0.0% attacker wins across 4 samples.
- **INFO / fragile-base:** th6-resource-shield-299 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-045 has 0.0% attacker wins across 4 samples.
- 47 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
