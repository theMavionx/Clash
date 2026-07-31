# Clash Full-Game Balance Lab

**Generated:** 2026-07-31T13:41:45.314Z
**Seed:** 731
**Town Halls:** TH6, TH7
**Unique generated bases:** 300
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
**Elapsed:** 15.6s

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
- Troop simulation coverage: 4/8
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100
- Bases exercised: 150/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% | 33.6% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 36 | 19 | 52.8% | 0 | 29.6s | 59.7% | 44.9% |
| southern-funnel | 36 | 20 | 55.6% | 0 | 32.0s | 61.4% | 43.3% |
| split-core | 36 | 21 | 58.3% | 0 | 27.9s | 61.2% | 41.7% |
| trap-lanes | 32 | 19 | 59.4% | 0 | 28.9s | 62.5% | 40.6% |
| wide-spread | 32 | 24 | 75.0% | 0 | 33.7s | 75.7% | 24.3% |
| asymmetric-left | 30 | 18 | 60.0% | 0 | 30.4s | 65.4% | 39.0% |
| compact-core | 27 | 15 | 55.6% | 0 | 27.9s | 63.0% | 44.4% |
| defense-ring | 27 | 16 | 59.3% | 0 | 28.8s | 70.2% | 40.7% |
| layered-rings | 27 | 12 | 44.4% | 0 | 26.1s | 61.2% | 55.0% |
| rear-keep | 25 | 15 | 60.0% | 0 | 32.4s | 65.2% | 39.4% |
| asymmetric-right | 24 | 14 | 58.3% | 0 | 29.6s | 65.1% | 41.4% |
| cannon-screen | 24 | 18 | 75.0% | 0 | 32.7s | 70.4% | 23.3% |
| corner-keep | 24 | 13 | 54.2% | 0 | 29.6s | 63.5% | 40.8% |
| crossfire | 24 | 16 | 66.7% | 0 | 28.2s | 62.4% | 33.3% |
| diamond | 24 | 11 | 45.8% | 0 | 28.9s | 60.8% | 53.8% |
| echelon-left | 24 | 16 | 66.7% | 0 | 32.7s | 65.2% | 32.9% |
| echelon-right | 24 | 15 | 62.5% | 0 | 34.1s | 63.2% | 32.1% |
| kill-corridor | 24 | 14 | 58.3% | 0 | 29.4s | 62.8% | 40.8% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield\|TH6 | 36 | 19 | 52.8% | 0 | 29.6s | 59.7% | 44.9% |
| southern-funnel\|TH6 | 36 | 20 | 55.6% | 0 | 32.0s | 61.4% | 43.3% |
| split-core\|TH6 | 36 | 21 | 58.3% | 0 | 27.9s | 61.2% | 41.7% |
| trap-lanes\|TH6 | 32 | 19 | 59.4% | 0 | 28.9s | 62.5% | 40.6% |
| wide-spread\|TH6 | 32 | 24 | 75.0% | 0 | 33.7s | 75.7% | 24.3% |
| asymmetric-left\|TH6 | 30 | 18 | 60.0% | 0 | 30.4s | 65.4% | 39.0% |
| compact-core\|TH6 | 27 | 15 | 55.6% | 0 | 27.9s | 63.0% | 44.4% |
| defense-ring\|TH6 | 27 | 16 | 59.3% | 0 | 28.8s | 70.2% | 40.7% |
| layered-rings\|TH6 | 27 | 12 | 44.4% | 0 | 26.1s | 61.2% | 55.0% |
| rear-keep\|TH6 | 25 | 15 | 60.0% | 0 | 32.4s | 65.2% | 39.4% |
| asymmetric-right\|TH6 | 24 | 14 | 58.3% | 0 | 29.6s | 65.1% | 41.4% |
| cannon-screen\|TH6 | 24 | 18 | 75.0% | 0 | 32.7s | 70.4% | 23.3% |
| corner-keep\|TH6 | 24 | 13 | 54.2% | 0 | 29.6s | 63.5% | 40.8% |
| crossfire\|TH6 | 24 | 16 | 66.7% | 0 | 28.2s | 62.4% | 33.3% |
| diamond\|TH6 | 24 | 11 | 45.8% | 0 | 28.9s | 60.8% | 53.8% |
| echelon-left\|TH6 | 24 | 16 | 66.7% | 0 | 32.7s | 65.2% | 32.9% |
| echelon-right\|TH6 | 24 | 15 | 62.5% | 0 | 34.1s | 63.2% | 32.1% |
| kill-corridor\|TH6 | 24 | 14 | 58.3% | 0 | 29.4s | 62.8% | 40.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-economy | 101 | 101 | 100.0% | 0 | 32.4s | 86.2% | 0.0% |
| maxed | 100 | 3 | 3.0% | 0 | 24.6s | 26.3% | 96.7% |
| mid | 100 | 90 | 90.0% | 0 | 38.0s | 83.0% | 8.8% |
| rushed-defense | 100 | 12 | 12.0% | 0 | 24.6s | 42.6% | 84.3% |
| mixed | 99 | 90 | 90.9% | 0 | 31.1s | 83.5% | 8.9% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| pure-unit-matrix\|demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| pure-unit-matrix\|fire_dragon | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| pure-unit-matrix\|knight | 50 | 30 | 60.0% | 0 | 31.9s | 64.7% | 39.7% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer\|TH6 | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| pure-unit-matrix\|demon_king\|TH6 | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| pure-unit-matrix\|fire_dragon\|TH6 | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| pure-unit-matrix\|knight\|TH6 | 50 | 30 | 60.0% | 0 | 31.9s | 64.7% | 39.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 50 | 29 | 58.0% | 0 | 30.2s | 59.4% | 41.4% |
| pure-unit-matrix\|diamond | 50 | 30 | 60.0% | 0 | 28.3s | 64.8% | 39.9% |
| pure-unit-matrix\|dual-flank | 50 | 31 | 62.0% | 0 | 31.6s | 65.5% | 38.1% |
| pure-unit-matrix\|edge-sweep | 50 | 29 | 58.0% | 0 | 31.4s | 66.8% | 40.4% |
| pure-unit-matrix\|inverted-wedge | 50 | 28 | 56.0% | 0 | 31.2s | 63.8% | 41.7% |
| pure-unit-matrix\|left-flank | 50 | 32 | 64.0% | 0 | 31.3s | 66.6% | 35.1% |
| pure-unit-matrix\|right-flank | 50 | 28 | 56.0% | 0 | 28.7s | 61.4% | 40.8% |
| pure-unit-matrix\|three-lane | 50 | 32 | 64.0% | 0 | 27.9s | 67.5% | 36.0% |
| pure-unit-matrix\|vanguard-wedge | 50 | 31 | 62.0% | 0 | 32.7s | 64.2% | 36.5% |
| pure-unit-matrix\|wide-line | 50 | 26 | 52.0% | 0 | 27.9s | 63.2% | 47.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 100 | 59 | 59.0% | 0 | 28.8s | 62.7% | 39.9% |
| pure-unit-matrix\|drip | 100 | 58 | 58.0% | 0 | 30.5s | 64.9% | 41.0% |
| pure-unit-matrix\|rapid | 100 | 57 | 57.0% | 0 | 30.0s | 63.8% | 41.7% |
| pure-unit-matrix\|three-waves | 100 | 56 | 56.0% | 0 | 31.3s | 62.0% | 43.1% |
| pure-unit-matrix\|two-waves | 100 | 66 | 66.0% | 0 | 30.1s | 68.2% | 32.9% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 250 | 140 | 56.0% | 0 | 29.1s | 62.8% | 42.5% |
| pure-unit-matrix\|tank-front-support-rear | 250 | 156 | 62.4% | 0 | 31.2s | 65.9% | 36.9% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| pure-demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| pure-fire_dragon | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| pure-knight | 50 | 30 | 60.0% | 0 | 31.9s | 64.7% | 39.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 50 | 29 | 58.0% | 0 | 30.2s | 59.4% | 41.4% |
| diamond | 50 | 30 | 60.0% | 0 | 28.3s | 64.8% | 39.9% |
| dual-flank | 50 | 31 | 62.0% | 0 | 31.6s | 65.5% | 38.1% |
| edge-sweep | 50 | 29 | 58.0% | 0 | 31.4s | 66.8% | 40.4% |
| inverted-wedge | 50 | 28 | 56.0% | 0 | 31.2s | 63.8% | 41.7% |
| left-flank | 50 | 32 | 64.0% | 0 | 31.3s | 66.6% | 35.1% |
| right-flank | 50 | 28 | 56.0% | 0 | 28.7s | 61.4% | 40.8% |
| three-lane | 50 | 32 | 64.0% | 0 | 27.9s | 67.5% | 36.0% |
| vanguard-wedge | 50 | 31 | 62.0% | 0 | 32.7s | 64.2% | 36.5% |
| wide-line | 50 | 26 | 52.0% | 0 | 27.9s | 63.2% | 47.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 100 | 59 | 59.0% | 0 | 28.8s | 62.7% | 39.9% |
| drip | 100 | 58 | 58.0% | 0 | 30.5s | 64.9% | 41.0% |
| rapid | 100 | 57 | 57.0% | 0 | 30.0s | 63.8% | 41.7% |
| three-waves | 100 | 56 | 56.0% | 0 | 31.3s | 62.0% | 43.1% |
| two-waves | 100 | 66 | 66.0% | 0 | 30.1s | 68.2% | 32.9% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 250 | 140 | 56.0% | 0 | 29.1s | 62.8% | 42.5% |
| tank-front-support-rear | 250 | 156 | 62.4% | 0 | 31.2s | 65.9% | 36.9% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 300 | 192 | 64.0% | 0 | 25.5s | 67.7% | 34.4% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| fire_dragon\|common | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 500 | 296 | 59.2% | 0 | 30.1s | 64.3% | 39.7% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| fire_dragon | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| knight | 50 | 30 | 60.0% | 0 | 31.9s | 64.7% | 39.7% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 150 | 49.3% | 41.4%-57.3% | 57.3% | 50.4% | 24.7% |
| demon_king | 150 | 66.0% | 58.1%-73.1% | 70.0% | 32.4% | 55.3% |
| fire_dragon | 150 | 62.0% | 54.0%-69.4% | 65.5% | 36.4% | 51.7% |
| knight | 50 | 60.0% | 46.2%-72.4% | 64.7% | 39.7% | 42.6% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 150 | 49.3% | 41.4%-57.3% | 57.3% | 50.4% | 24.7% |
| demon_king\|TH6 | 150 | 66.0% | 58.1%-73.1% | 70.0% | 32.4% | 55.3% |
| fire_dragon\|TH6 | 150 | 62.0% | 54.0%-69.4% | 65.5% | 36.4% | 51.7% |
| knight\|TH6 | 50 | 60.0% | 46.2%-72.4% | 64.7% | 39.7% | 42.6% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 65.8% | 37.5% | 35.6% |
| archer\|asymmetric-right | 8 | 50.0% | 21.5%-78.5% | 60.0% | 50.0% | 28.3% |
| archer\|cannon-screen | 8 | 62.5% | 30.6%-86.3% | 60.4% | 37.5% | 37.2% |
| archer\|compact-core | 9 | 55.6% | 26.7%-81.1% | 61.6% | 44.4% | 30.9% |
| archer\|corner-keep | 8 | 50.0% | 21.5%-78.5% | 60.4% | 46.1% | 23.1% |
| archer\|crossfire | 8 | 62.5% | 30.6%-86.3% | 56.7% | 37.5% | 31.1% |
| archer\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 65.9% | 44.4% | 27.9% |
| archer\|diamond | 8 | 37.5% | 13.7%-69.4% | 58.3% | 62.4% | 15.0% |
| archer\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 56.0% | 50.0% | 22.5% |
| archer\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 55.0% | 38.0% | 19.2% |
| archer\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 53.3% | 50.0% | 20.8% |
| archer\|layered-rings | 9 | 33.3% | 12.1%-64.6% | 58.5% | 66.1% | 22.5% |
| archer\|rear-keep | 8 | 50.0% | 21.5%-78.5% | 53.2% | 50.0% | 26.4% |
| archer\|resource-shield | 9 | 44.4% | 18.9%-73.3% | 55.2% | 55.6% | 18.0% |
| archer\|southern-funnel | 9 | 22.2% | 6.3%-54.7% | 47.4% | 76.6% | 10.1% |
| archer\|split-core | 9 | 33.3% | 12.1%-64.6% | 53.4% | 66.7% | 21.0% |
| archer\|trap-lanes | 8 | 50.0% | 21.5%-78.5% | 50.8% | 50.0% | 28.6% |
| archer\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 60.1% | 37.5% | 29.2% |
| demon_king\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 65.8% | 33.9% | 50.0% |
| demon_king\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 69.6% | 36.8% | 48.6% |
| demon_king\|cannon-screen | 8 | 87.5% | 52.9%-97.8% | 81.7% | 12.5% | 65.3% |
| demon_king\|compact-core | 9 | 55.6% | 26.7%-81.1% | 69.2% | 44.4% | 49.4% |
| demon_king\|corner-keep | 8 | 62.5% | 30.6%-86.3% | 67.5% | 37.5% | 58.3% |
| demon_king\|crossfire | 8 | 75.0% | 40.9%-92.9% | 66.3% | 25.0% | 61.1% |
| demon_king\|defense-ring | 9 | 66.7% | 35.4%-87.9% | 73.3% | 33.3% | 58.0% |
| demon_king\|diamond | 8 | 50.0% | 21.5%-78.5% | 67.1% | 49.0% | 43.1% |
| demon_king\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 67.7% | 36.2% | 52.8% |
| demon_king\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 69.2% | 30.6% | 58.3% |
| demon_king\|kill-corridor | 8 | 75.0% | 40.9%-92.9% | 72.5% | 22.4% | 52.8% |
| demon_king\|layered-rings | 9 | 55.6% | 26.7%-81.1% | 63.3% | 44.2% | 45.7% |
| demon_king\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 74.2% | 35.5% | 58.3% |
| demon_king\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 61.9% | 35.1% | 53.1% |
| demon_king\|southern-funnel | 9 | 77.8% | 45.3%-93.7% | 72.2% | 22.2% | 58.0% |
| demon_king\|split-core | 9 | 66.7% | 35.4%-87.9% | 69.9% | 33.3% | 59.3% |
| demon_king\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 67.7% | 37.5% | 52.8% |
| demon_king\|wide-spread | 8 | 87.5% | 52.9%-97.8% | 82.7% | 11.8% | 70.8% |
| fire_dragon\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 68.3% | 37.5% | 53.1% |
| fire_dragon\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 65.8% | 37.5% | 43.8% |
| fire_dragon\|cannon-screen | 8 | 75.0% | 40.9%-92.9% | 69.2% | 19.8% | 62.5% |
| fire_dragon\|compact-core | 9 | 55.6% | 26.7%-81.1% | 58.1% | 44.4% | 47.2% |
| fire_dragon\|corner-keep | 8 | 50.0% | 21.5%-78.5% | 62.5% | 38.9% | 43.8% |
| fire_dragon\|crossfire | 8 | 62.5% | 30.6%-86.3% | 64.2% | 37.5% | 59.4% |
| fire_dragon\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 71.5% | 44.4% | 50.0% |
| fire_dragon\|diamond | 8 | 50.0% | 21.5%-78.5% | 57.1% | 50.0% | 37.5% |
| fire_dragon\|echelon-left | 8 | 87.5% | 52.9%-97.8% | 71.8% | 12.5% | 62.5% |
| fire_dragon\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 65.4% | 27.8% | 50.0% |
| fire_dragon\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 62.5% | 50.0% | 43.8% |
| fire_dragon\|layered-rings | 9 | 44.4% | 18.9%-73.3% | 61.9% | 54.9% | 41.7% |
| fire_dragon\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 65.7% | 37.5% | 62.5% |
| fire_dragon\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 57.0% | 44.4% | 44.4% |
| fire_dragon\|southern-funnel | 9 | 66.7% | 35.4%-87.9% | 68.5% | 29.9% | 52.8% |
| fire_dragon\|split-core | 9 | 66.7% | 35.4%-87.9% | 61.3% | 33.3% | 50.0% |
| fire_dragon\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 66.5% | 37.5% | 59.4% |
| fire_dragon\|wide-spread | 8 | 87.5% | 52.9%-97.8% | 82.3% | 12.5% | 68.8% |
| knight\|asymmetric-left | 6 | 50.0% | 18.8%-81.2% | 60.6% | 50.0% | 34.1% |
| knight\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 64.8% | 44.4% | 40.7% |
| knight\|southern-funnel | 9 | 55.6% | 26.7%-81.1% | 57.4% | 44.4% | 37.0% |
| knight\|split-core | 9 | 66.7% | 35.4%-87.9% | 60.2% | 33.3% | 42.0% |
| knight\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 64.9% | 37.5% | 46.1% |
| knight\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 77.8% | 35.3% | 48.3% |

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

- **CRITICAL / coverage:** Missing content coverage. Buildings: none; troops: mage, mechanical_dragon, mimic, pea_shooter.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **INFO / fragile-base:** th6-compact-core-109 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-compact-core-145 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-compact-core-181 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-compact-core-217 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-compact-core-253 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-compact-core-289 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-corner-keep-021 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-corner-keep-057 has 0.0% attacker wins across 3 samples.
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
- **INFO / unbeaten-base:** th6-diamond-095 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-diamond-131 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-diamond-167 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-diamond-203 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-diamond-239 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-diamond-275 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-103 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-175 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-211 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-left-247 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-left-283 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-033 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-right-069 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-echelon-right-105 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-echelon-right-141 has 0.0% attacker wins across 3 samples.
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
- **INFO / unbeaten-base:** th6-layered-rings-005 has 0.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-layered-rings-041 has 100.0% attacker wins across 3 samples.
- **INFO / fragile-base:** th6-layered-rings-077 has 100.0% attacker wins across 3 samples.
- **INFO / unbeaten-base:** th6-layered-rings-113 has 0.0% attacker wins across 3 samples.
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
- **INFO / fragile-base:** th6-southern-funnel-153 has 100.0% attacker wins across 4 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-225 has 0.0% attacker wins across 4 samples.
- 42 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
