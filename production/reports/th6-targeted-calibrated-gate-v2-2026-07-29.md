# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:36:54.133Z
**Seed:** 61006
**Town Halls:** TH6
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 800
**Unbeaten non-adaptive bases (n >= 12):** 31
**Breakability probe:** 1700 calibration + gate battles; 21/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1.15x, L7=1x
**Lab late-tier troop scales:** knight=0.95x, mage=1.8x, archer=1.05x, mimic=1.1x, mechanical_dragon=0.95x, demon_king=0.9x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 71.1s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all 18 base archetypes.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 12/12
- Troop simulation coverage: 8/8
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100
- Bases exercised: 100/100

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 871 | 58.1% | 0 | 25.4s | 55.0% | 40.3% | 37.4% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 21

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th6-asymmetric-left-062 | 6 | asymmetric-left | maxed | 8 |
| th6-asymmetric-left-098 | 6 | asymmetric-left | rushed-defense | 8 |
| th6-asymmetric-right-009 | 6 | asymmetric-right | rushed-defense | 8 |
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 8 |
| th6-compact-core-001 | 6 | compact-core | maxed | 8 |
| th6-compact-core-037 | 6 | compact-core | rushed-defense | 8 |
| th6-compact-core-091 | 6 | compact-core | maxed | 8 |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 8 |
| th6-crossfire-087 | 6 | crossfire | rushed-defense | 8 |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 8 |
| th6-diamond-048 | 6 | diamond | rushed-defense | 8 |
| th6-layered-rings-003 | 6 | layered-rings | rushed-defense | 8 |
| th6-layered-rings-057 | 6 | layered-rings | maxed | 8 |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 8 |
| th6-rear-keep-031 | 6 | rear-keep | rushed-defense | 8 |
| th6-resource-shield-006 | 6 | resource-shield | maxed | 8 |
| th6-resource-shield-096 | 6 | resource-shield | maxed | 8 |
| th6-southern-funnel-023 | 6 | southern-funnel | maxed | 8 |
| th6-split-core-040 | 6 | split-core | maxed | 8 |
| th6-split-core-076 | 6 | split-core | rushed-defense | 8 |
| th6-trap-lanes-046 | 6 | trap-lanes | maxed | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 1500 | 871 | 58.1% | 0 | 25.4s | 55.0% | 40.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 92 | 59 | 64.1% | 0 | 25.4s | 57.8% | 35.6% |
| layered-rings | 91 | 45 | 49.5% | 0 | 25.4s | 51.5% | 49.3% |
| resource-shield | 91 | 41 | 45.1% | 0 | 24.8s | 46.8% | 53.4% |
| wide-spread | 91 | 69 | 75.8% | 0 | 29.0s | 63.6% | 21.1% |
| asymmetric-left | 90 | 47 | 52.2% | 0 | 25.6s | 55.7% | 44.6% |
| asymmetric-right | 90 | 42 | 46.7% | 0 | 24.8s | 53.6% | 50.1% |
| compact-core | 90 | 44 | 48.9% | 0 | 24.8s | 48.6% | 50.1% |
| defense-ring | 90 | 55 | 61.1% | 0 | 26.0s | 57.0% | 36.2% |
| split-core | 90 | 59 | 65.6% | 0 | 22.8s | 56.6% | 33.2% |
| trap-lanes | 90 | 60 | 66.7% | 0 | 26.1s | 60.1% | 32.7% |
| cannon-screen | 75 | 49 | 65.3% | 0 | 27.5s | 56.6% | 33.7% |
| diamond | 75 | 33 | 44.0% | 0 | 22.8s | 47.4% | 55.3% |
| echelon-left | 75 | 52 | 69.3% | 0 | 27.9s | 60.3% | 29.0% |
| corner-keep | 74 | 39 | 52.7% | 0 | 26.3s | 51.2% | 44.8% |
| crossfire | 74 | 44 | 59.5% | 0 | 25.5s | 55.2% | 38.4% |
| echelon-right | 74 | 45 | 60.8% | 0 | 25.2s | 56.8% | 37.6% |
| kill-corridor | 74 | 45 | 60.8% | 0 | 22.8s | 57.0% | 39.0% |
| rear-keep | 74 | 43 | 58.1% | 0 | 25.0s | 54.1% | 41.1% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel\|TH6 | 92 | 59 | 64.1% | 0 | 25.4s | 57.8% | 35.6% |
| layered-rings\|TH6 | 91 | 45 | 49.5% | 0 | 25.4s | 51.5% | 49.3% |
| resource-shield\|TH6 | 91 | 41 | 45.1% | 0 | 24.8s | 46.8% | 53.4% |
| wide-spread\|TH6 | 91 | 69 | 75.8% | 0 | 29.0s | 63.6% | 21.1% |
| asymmetric-left\|TH6 | 90 | 47 | 52.2% | 0 | 25.6s | 55.7% | 44.6% |
| asymmetric-right\|TH6 | 90 | 42 | 46.7% | 0 | 24.8s | 53.6% | 50.1% |
| compact-core\|TH6 | 90 | 44 | 48.9% | 0 | 24.8s | 48.6% | 50.1% |
| defense-ring\|TH6 | 90 | 55 | 61.1% | 0 | 26.0s | 57.0% | 36.2% |
| split-core\|TH6 | 90 | 59 | 65.6% | 0 | 22.8s | 56.6% | 33.2% |
| trap-lanes\|TH6 | 90 | 60 | 66.7% | 0 | 26.1s | 60.1% | 32.7% |
| cannon-screen\|TH6 | 75 | 49 | 65.3% | 0 | 27.5s | 56.6% | 33.7% |
| diamond\|TH6 | 75 | 33 | 44.0% | 0 | 22.8s | 47.4% | 55.3% |
| echelon-left\|TH6 | 75 | 52 | 69.3% | 0 | 27.9s | 60.3% | 29.0% |
| corner-keep\|TH6 | 74 | 39 | 52.7% | 0 | 26.3s | 51.2% | 44.8% |
| crossfire\|TH6 | 74 | 44 | 59.5% | 0 | 25.5s | 55.2% | 38.4% |
| echelon-right\|TH6 | 74 | 45 | 60.8% | 0 | 25.2s | 56.8% | 37.6% |
| kill-corridor\|TH6 | 74 | 45 | 60.8% | 0 | 22.8s | 57.0% | 39.0% |
| rear-keep\|TH6 | 74 | 43 | 58.1% | 0 | 25.0s | 54.1% | 41.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 326 | 14 | 4.3% | 0 | 18.8s | 29.8% | 90.8% |
| maxed | 298 | 8 | 2.7% | 0 | 20.8s | 21.1% | 95.8% |
| mid | 297 | 293 | 98.7% | 0 | 31.0s | 75.4% | 1.0% |
| rushed-economy | 295 | 295 | 100.0% | 0 | 28.9s | 77.7% | 0.0% |
| mixed | 284 | 261 | 91.9% | 0 | 28.5s | 74.6% | 7.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 800 | 468 | 58.5% | 0 | 28.2s | 61.9% | 40.6% |
| policy-exploration | 700 | 403 | 57.6% | 0 | 22.3s | 47.2% | 40.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 800 | 468 | 58.5% | 0 | 28.2s | 61.9% | 40.6% |
| policy-exploration\|TH6 | 700 | 403 | 57.6% | 0 | 22.3s | 47.2% | 40.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 800 | 468 | 58.5% | 0 | 28.2s | 61.9% | 40.6% |
| policy-exploration\|cannon-rally | 63 | 38 | 60.3% | 0 | 14.6s | 6.8% | 31.0% |
| policy-exploration\|rally-rage | 63 | 33 | 52.4% | 0 | 14.4s | 4.9% | 38.9% |
| policy-exploration\|freeze-rage | 62 | 40 | 64.5% | 0 | 23.1s | 63.2% | 35.5% |
| policy-exploration\|rage-entry | 62 | 40 | 64.5% | 0 | 26.4s | 66.9% | 35.5% |
| policy-exploration\|freeze-barrel | 61 | 35 | 57.4% | 0 | 23.6s | 61.3% | 42.6% |
| policy-exploration\|rally-core | 61 | 28 | 45.9% | 0 | 13.9s | 5.3% | 46.4% |
| policy-exploration\|none | 60 | 30 | 50.0% | 0 | 24.6s | 55.9% | 50.0% |
| policy-exploration\|medkit-entry | 57 | 30 | 52.6% | 0 | 23.4s | 57.9% | 46.4% |
| policy-exploration\|freeze-defense | 55 | 37 | 67.3% | 0 | 27.2s | 65.2% | 32.4% |
| policy-exploration\|cannon-focus | 52 | 35 | 67.3% | 0 | 27.7s | 66.6% | 32.6% |
| policy-exploration\|cannon-medkit | 52 | 31 | 59.6% | 0 | 27.6s | 65.2% | 39.8% |
| policy-exploration\|skeleton-barrel | 52 | 26 | 50.0% | 0 | 24.3s | 58.8% | 49.1% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 80 | 43 | 53.8% | 0 | 30.0s | 60.8% | 45.3% |
| pure-unit-matrix\|diamond | 80 | 48 | 60.0% | 0 | 26.5s | 64.0% | 39.9% |
| pure-unit-matrix\|dual-flank | 80 | 46 | 57.5% | 0 | 27.3s | 63.5% | 41.6% |
| pure-unit-matrix\|edge-sweep | 80 | 45 | 56.3% | 0 | 25.6s | 63.8% | 43.6% |
| pure-unit-matrix\|inverted-wedge | 80 | 50 | 62.5% | 0 | 29.1s | 60.6% | 36.7% |
| pure-unit-matrix\|left-flank | 80 | 50 | 62.5% | 0 | 28.3s | 62.0% | 36.6% |
| pure-unit-matrix\|right-flank | 80 | 47 | 58.8% | 0 | 28.8s | 58.4% | 38.8% |
| pure-unit-matrix\|three-lane | 80 | 46 | 57.5% | 0 | 29.7s | 62.2% | 41.6% |
| pure-unit-matrix\|vanguard-wedge | 80 | 47 | 58.8% | 0 | 28.6s | 60.5% | 40.7% |
| pure-unit-matrix\|wide-line | 80 | 46 | 57.5% | 0 | 27.7s | 63.4% | 41.5% |
| policy-exploration\|left-flank | 73 | 50 | 68.5% | 0 | 28.3s | 53.3% | 29.1% |
| policy-exploration\|three-lane | 73 | 38 | 52.1% | 0 | 22.2s | 50.1% | 44.9% |
| policy-exploration\|diamond | 71 | 47 | 66.2% | 0 | 21.4s | 51.0% | 33.2% |
| policy-exploration\|edge-sweep | 71 | 30 | 42.3% | 0 | 20.0s | 34.8% | 53.3% |
| policy-exploration\|dual-flank | 70 | 45 | 64.3% | 0 | 22.7s | 48.0% | 34.3% |
| policy-exploration\|right-flank | 70 | 36 | 51.4% | 0 | 21.6s | 44.0% | 43.9% |
| policy-exploration\|vanguard-wedge | 70 | 33 | 47.1% | 0 | 21.0s | 41.0% | 48.3% |
| policy-exploration\|wide-line | 70 | 41 | 58.6% | 0 | 22.4s | 50.5% | 40.3% |
| policy-exploration\|center-column | 66 | 39 | 59.1% | 0 | 22.2s | 56.7% | 39.4% |
| policy-exploration\|inverted-wedge | 66 | 44 | 66.7% | 0 | 21.0s | 42.3% | 32.7% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 160 | 97 | 60.6% | 0 | 28.1s | 63.5% | 38.3% |
| pure-unit-matrix\|drip | 160 | 94 | 58.8% | 0 | 29.3s | 61.9% | 40.7% |
| pure-unit-matrix\|rapid | 160 | 88 | 55.0% | 0 | 27.9s | 59.5% | 44.3% |
| pure-unit-matrix\|three-waves | 160 | 100 | 62.5% | 0 | 28.3s | 64.1% | 36.5% |
| pure-unit-matrix\|two-waves | 160 | 89 | 55.6% | 0 | 27.3s | 60.6% | 43.3% |
| policy-exploration\|burst | 140 | 80 | 57.1% | 0 | 21.7s | 48.8% | 41.5% |
| policy-exploration\|drip | 140 | 80 | 57.1% | 0 | 23.3s | 44.8% | 41.4% |
| policy-exploration\|rapid | 140 | 78 | 55.7% | 0 | 22.2s | 44.9% | 39.8% |
| policy-exploration\|three-waves | 140 | 81 | 57.9% | 0 | 22.1s | 47.1% | 39.1% |
| policy-exploration\|two-waves | 140 | 84 | 60.0% | 0 | 22.2s | 50.2% | 38.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 400 | 236 | 59.0% | 0 | 28.2s | 62.7% | 39.9% |
| pure-unit-matrix\|tank-front-support-rear | 400 | 232 | 58.0% | 0 | 28.2s | 61.2% | 41.4% |
| policy-exploration\|roster-order | 350 | 204 | 58.3% | 0 | 21.7s | 47.2% | 38.9% |
| policy-exploration\|tank-front-support-rear | 350 | 199 | 56.9% | 0 | 23.0s | 47.1% | 41.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 139 | 87 | 62.6% | 0 | 27.0s | 65.7% | 33.4% |
| pure-knight | 136 | 78 | 57.4% | 0 | 29.3s | 54.6% | 39.2% |
| pure-mage | 135 | 79 | 58.5% | 0 | 24.3s | 56.7% | 41.0% |
| pure-mimic | 132 | 70 | 53.0% | 0 | 31.5s | 49.5% | 45.8% |
| pure-archer | 131 | 75 | 57.3% | 0 | 35.3s | 57.6% | 42.0% |
| pure-mechanical_dragon | 131 | 78 | 59.5% | 0 | 24.4s | 64.3% | 39.7% |
| pure-pea_shooter | 131 | 74 | 56.5% | 0 | 26.7s | 54.8% | 43.0% |
| pure-fire_dragon | 127 | 74 | 58.3% | 0 | 19.3s | 61.2% | 40.6% |
| random-6 | 34 | 15 | 44.1% | 0 | 18.9s | 38.1% | 53.9% |
| balanced | 32 | 23 | 71.9% | 0 | 22.1s | 66.4% | 27.2% |
| melee-pressure | 32 | 20 | 62.5% | 0 | 24.7s | 49.4% | 34.2% |
| random-5 | 32 | 19 | 59.4% | 0 | 22.0s | 49.4% | 39.1% |
| support-mix | 32 | 23 | 71.9% | 0 | 20.9s | 54.2% | 26.9% |
| frontline-ranged | 31 | 13 | 41.9% | 0 | 18.6s | 38.5% | 54.0% |
| hero-necro-dragon-mages | 31 | 20 | 64.5% | 0 | 21.0s | 59.7% | 35.5% |
| random-1 | 31 | 18 | 58.1% | 0 | 19.3s | 35.9% | 40.2% |
| random-2 | 31 | 19 | 61.3% | 0 | 22.5s | 53.2% | 37.3% |
| random-3 | 31 | 19 | 61.3% | 0 | 20.7s | 40.0% | 37.4% |
| ranged-pressure | 31 | 15 | 48.4% | 0 | 17.2s | 33.6% | 51.3% |
| air-pressure | 30 | 17 | 56.7% | 0 | 19.4s | 54.4% | 41.8% |
| random-4 | 30 | 21 | 70.0% | 0 | 25.8s | 62.1% | 29.6% |
| trap-runner-mix | 30 | 14 | 46.7% | 0 | 21.3s | 32.8% | 48.1% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__drip__roster-order | 16 | 7 | 43.8% | 0 | 26.3s | 55.4% | 51.7% |
| center-column__rapid__roster-order | 16 | 13 | 81.3% | 0 | 31.2s | 75.3% | 18.8% |
| center-column__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 20.0s | 35.7% | 58.2% |
| center-column__two-waves__roster-order | 16 | 15 | 93.8% | 0 | 28.9s | 84.2% | 6.3% |
| center-column__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 26.9s | 50.1% | 35.7% |
| diamond__burst__roster-order | 16 | 13 | 81.3% | 0 | 22.8s | 60.0% | 18.8% |
| diamond__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.7s | 58.1% | 43.4% |
| diamond__drip__roster-order | 16 | 11 | 68.8% | 0 | 22.5s | 54.5% | 31.3% |
| diamond__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 30.0s | 70.8% | 25.0% |
| diamond__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 20.0s | 49.1% | 62.5% |
| diamond__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 21.8s | 54.0% | 56.3% |
| diamond__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 20.9s | 48.0% | 41.2% |
| dual-flank__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.2s | 73.6% | 25.0% |
| dual-flank__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 31.0s | 60.5% | 43.8% |
| dual-flank__rapid__roster-order | 16 | 13 | 81.3% | 0 | 22.3s | 59.1% | 18.8% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 26.6s | 53.2% | 59.3% |
| dual-flank__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 20.7s | 39.5% | 29.1% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 23.5s | 49.5% | 67.3% |
| edge-sweep__burst__roster-order | 16 | 6 | 37.5% | 0 | 21.3s | 57.1% | 62.5% |
| edge-sweep__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 19.9s | 36.0% | 54.1% |
| edge-sweep__drip__roster-order | 16 | 4 | 25.0% | 0 | 25.9s | 37.3% | 74.3% |
| edge-sweep__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.1s | 39.7% | 34.0% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 22.8s | 42.4% | 62.0% |
| edge-sweep__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 28.4s | 75.1% | 18.8% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 22.3s | 43.9% | 53.6% |
| inverted-wedge__burst__roster-order | 16 | 9 | 56.3% | 0 | 25.8s | 57.7% | 43.8% |
| inverted-wedge__drip__roster-order | 16 | 6 | 37.5% | 0 | 25.0s | 50.0% | 62.3% |
| inverted-wedge__rapid__roster-order | 16 | 11 | 68.8% | 0 | 30.6s | 71.3% | 27.5% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 24.2s | 54.8% | 12.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 23.0s | 42.4% | 42.1% |
| left-flank__burst__roster-order | 16 | 7 | 43.8% | 0 | 28.0s | 47.4% | 55.8% |
| left-flank__drip__roster-order | 16 | 14 | 87.5% | 0 | 24.8s | 59.0% | 12.5% |
| left-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 27.1s | 59.4% | 42.6% |
| left-flank__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.3s | 47.2% | 26.7% |
| left-flank__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 30.7s | 66.7% | 30.8% |
| left-flank__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.7s | 44.2% | 42.1% |
| right-flank__burst__roster-order | 16 | 9 | 56.3% | 0 | 23.2s | 40.0% | 41.5% |
| right-flank__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.4s | 57.6% | 46.7% |
| right-flank__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.7s | 49.9% | 56.3% |
| right-flank__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 31.7s | 68.9% | 19.0% |
| right-flank__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 23.6s | 38.0% | 51.1% |
| right-flank__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 21.6s | 43.0% | 48.2% |
| three-lane__burst__roster-order | 16 | 7 | 43.8% | 0 | 27.6s | 46.9% | 54.3% |
| three-lane__drip__roster-order | 16 | 9 | 56.3% | 0 | 32.3s | 59.2% | 43.8% |
| three-lane__rapid__roster-order | 16 | 5 | 31.3% | 0 | 21.1s | 33.5% | 56.7% |
| three-lane__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.1s | 66.4% | 36.3% |
| three-lane__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 24.2s | 48.6% | 67.3% |
| three-lane__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 30.2s | 67.7% | 31.3% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 33.1s | 66.4% | 31.3% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 23.3s | 40.6% | 68.8% |
| vanguard-wedge__rapid__roster-order | 16 | 3 | 18.8% | 0 | 22.2s | 32.7% | 66.6% |
| vanguard-wedge__three-waves__roster-order | 16 | 14 | 87.5% | 0 | 26.5s | 62.5% | 12.5% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 1 | 6.3% | 0 | 16.7s | 20.0% | 91.6% |
| vanguard-wedge__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 24.8s | 72.8% | 28.3% |
| wide-line__burst__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 22.8s | 59.7% | 12.5% |
| wide-line__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.4s | 41.8% | 49.5% |
| wide-line__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.8s | 47.4% | 40.4% |
| wide-line__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 29.6s | 72.8% | 27.2% |
| wide-line__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.7s | 44.7% | 48.8% |
| wide-line__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 21.7s | 54.2% | 68.8% |
| center-column__burst__roster-order | 15 | 11 | 73.3% | 0 | 26.4s | 73.1% | 26.5% |
| center-column__rapid__tank-front-support-rear | 15 | 3 | 20.0% | 0 | 21.4s | 45.9% | 80.0% |
| diamond__three-waves__tank-front-support-rear | 15 | 14 | 93.3% | 0 | 32.7s | 84.6% | 6.7% |
| dual-flank__burst__roster-order | 15 | 8 | 53.3% | 0 | 22.4s | 55.9% | 42.5% |
| dual-flank__drip__roster-order | 15 | 9 | 60.0% | 0 | 24.3s | 50.7% | 40.0% |
| edge-sweep__two-waves__roster-order | 15 | 10 | 66.7% | 0 | 23.6s | 70.5% | 33.3% |
| inverted-wedge__rapid__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 25.5s | 28.4% | 26.7% |
| inverted-wedge__three-waves__roster-order | 15 | 9 | 60.0% | 0 | 23.2s | 64.9% | 39.8% |
| left-flank__burst__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 29.9s | 62.4% | 29.3% |
| left-flank__drip__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 35.1s | 68.3% | 26.7% |
| left-flank__two-waves__roster-order | 15 | 10 | 66.7% | 0 | 28.3s | 61.3% | 33.3% |
| right-flank__rapid__roster-order | 15 | 7 | 46.7% | 0 | 24.8s | 47.2% | 47.4% |
| right-flank__three-waves__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 26.3s | 69.2% | 26.7% |
| three-lane__burst__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 25.3s | 77.7% | 20.0% |
| three-lane__drip__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 23.7s | 56.5% | 53.3% |
| three-lane__three-waves__roster-order | 15 | 13 | 86.7% | 0 | 26.2s | 61.7% | 13.3% |
| vanguard-wedge__drip__roster-order | 15 | 14 | 93.3% | 0 | 27.1s | 59.7% | 6.7% |
| vanguard-wedge__two-waves__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 28.8s | 52.8% | 53.3% |
| wide-line__rapid__roster-order | 15 | 7 | 46.7% | 0 | 25.5s | 53.7% | 53.3% |
| wide-line__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 26.1s | 71.2% | 32.2% |
| center-column__burst__tank-front-support-rear | 12 | 4 | 33.3% | 0 | 23.7s | 47.7% | 66.7% |
| center-column__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 27.7s | 67.1% | 41.2% |
| center-column__three-waves__roster-order | 12 | 6 | 50.0% | 0 | 33.0s | 52.3% | 50.0% |
| diamond__rapid__roster-order | 12 | 6 | 50.0% | 0 | 22.6s | 29.5% | 50.2% |
| diamond__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 25.6s | 67.1% | 33.3% |
| dual-flank__rapid__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 26.6s | 61.3% | 50.0% |
| dual-flank__three-waves__roster-order | 12 | 12 | 100.0% | 0 | 26.1s | 61.2% | 0.0% |
| edge-sweep__rapid__roster-order | 12 | 7 | 58.3% | 0 | 22.1s | 61.3% | 41.7% |
| edge-sweep__three-waves__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 20.3s | 39.9% | 43.6% |
| inverted-wedge__burst__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 25.7s | 49.6% | 24.0% |
| inverted-wedge__drip__tank-front-support-rear | 12 | 11 | 91.7% | 0 | 29.1s | 59.5% | 8.3% |
| inverted-wedge__two-waves__roster-order | 12 | 5 | 41.7% | 0 | 22.7s | 43.2% | 58.3% |
| left-flank__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.8s | 65.7% | 28.6% |
| right-flank__drip__roster-order | 12 | 6 | 50.0% | 0 | 21.8s | 36.9% | 46.7% |
| right-flank__two-waves__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 29.5s | 66.8% | 25.0% |
| three-lane__two-waves__roster-order | 12 | 5 | 41.7% | 0 | 22.8s | 44.9% | 55.6% |
| vanguard-wedge__burst__roster-order | 12 | 4 | 33.3% | 0 | 20.1s | 32.5% | 62.6% |
| vanguard-wedge__rapid__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 28.2s | 75.9% | 16.7% |
| wide-line__burst__roster-order | 12 | 7 | 58.3% | 0 | 27.6s | 68.8% | 41.7% |
| wide-line__drip__roster-order | 12 | 8 | 66.7% | 0 | 25.8s | 64.9% | 33.3% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| left-flank | 153 | 100 | 65.4% | 0 | 28.3s | 57.8% | 33.0% |
| three-lane | 153 | 84 | 54.9% | 0 | 26.2s | 56.4% | 43.1% |
| diamond | 151 | 95 | 62.9% | 0 | 24.1s | 57.9% | 36.8% |
| edge-sweep | 151 | 75 | 49.7% | 0 | 23.0s | 50.2% | 48.1% |
| dual-flank | 150 | 91 | 60.7% | 0 | 25.1s | 56.2% | 38.2% |
| right-flank | 150 | 83 | 55.3% | 0 | 25.5s | 51.6% | 41.2% |
| vanguard-wedge | 150 | 80 | 53.3% | 0 | 25.1s | 51.4% | 44.2% |
| wide-line | 150 | 87 | 58.0% | 0 | 25.2s | 57.4% | 40.9% |
| center-column | 146 | 82 | 56.2% | 0 | 26.4s | 58.9% | 42.6% |
| inverted-wedge | 146 | 94 | 64.4% | 0 | 25.5s | 52.3% | 34.9% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 177 | 59.0% | 0 | 25.1s | 56.6% | 39.8% |
| drip | 300 | 174 | 58.0% | 0 | 26.5s | 53.9% | 41.0% |
| rapid | 300 | 166 | 55.3% | 0 | 25.2s | 52.7% | 42.2% |
| three-waves | 300 | 181 | 60.3% | 0 | 25.4s | 56.2% | 37.7% |
| two-waves | 300 | 173 | 57.7% | 0 | 24.9s | 55.8% | 40.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 440 | 58.7% | 0 | 25.2s | 55.5% | 39.4% |
| tank-front-support-rear | 750 | 431 | 57.5% | 0 | 25.7s | 54.6% | 41.2% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 860 | 498 | 57.9% | 0 | 27.9s | 61.5% | 41.3% |
| cannon-rally | 63 | 38 | 60.3% | 0 | 14.6s | 6.8% | 31.0% |
| rally-rage | 63 | 33 | 52.4% | 0 | 14.4s | 4.9% | 38.9% |
| freeze-rage | 62 | 40 | 64.5% | 0 | 23.1s | 63.2% | 35.5% |
| rage-entry | 62 | 40 | 64.5% | 0 | 26.4s | 66.9% | 35.5% |
| freeze-barrel | 61 | 35 | 57.4% | 0 | 23.6s | 61.3% | 42.6% |
| rally-core | 61 | 28 | 45.9% | 0 | 13.9s | 5.3% | 46.4% |
| medkit-entry | 57 | 30 | 52.6% | 0 | 23.4s | 57.9% | 46.4% |
| freeze-defense | 55 | 37 | 67.3% | 0 | 27.2s | 65.2% | 32.4% |
| cannon-focus | 52 | 35 | 67.3% | 0 | 27.7s | 66.6% | 32.6% |
| cannon-medkit | 52 | 31 | 59.6% | 0 | 27.6s | 65.2% | 39.8% |
| skeleton-barrel | 52 | 26 | 50.0% | 0 | 24.3s | 58.8% | 49.1% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 964 | 573 | 59.4% | 0 | 27.5s | 60.6% | 39.2% |
| epic | 184 | 104 | 56.5% | 0 | 21.9s | 43.4% | 39.8% |
| legendary | 177 | 106 | 59.9% | 0 | 22.4s | 48.3% | 38.3% |
| unrevealed | 175 | 88 | 50.3% | 0 | 21.0s | 43.4% | 48.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 980 | 572 | 58.4% | 0 | 27.1s | 59.3% | 40.3% |
| ward-2 | 180 | 107 | 59.4% | 0 | 22.4s | 47.8% | 38.1% |
| ward-1 | 170 | 98 | 57.6% | 0 | 22.3s | 47.0% | 40.1% |
| ward-3 | 170 | 94 | 55.3% | 0 | 22.3s | 46.1% | 42.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 871 | 58.1% | 0 | 25.4s | 55.0% | 40.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 533 | 310 | 58.2% | 0 | 20.4s | 50.8% | 40.3% |
| demon_king | 516 | 311 | 60.3% | 0 | 23.0s | 53.0% | 37.3% |
| knight | 513 | 302 | 58.9% | 0 | 23.5s | 50.0% | 38.8% |
| mage | 511 | 298 | 58.3% | 0 | 21.7s | 49.6% | 40.3% |
| mimic | 478 | 274 | 57.3% | 0 | 24.3s | 47.9% | 40.8% |
| archer | 476 | 274 | 57.6% | 0 | 24.8s | 49.1% | 40.9% |
| mechanical_dragon | 381 | 221 | 58.0% | 0 | 22.0s | 52.1% | 40.9% |
| pea_shooter | 351 | 200 | 57.0% | 0 | 23.0s | 48.3% | 42.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 56.0% | 46.2%-65.3% | 60.0% | 43.2% | 29.5% |
| demon_king | 100 | 63.0% | 53.2%-71.8% | 70.2% | 33.5% | 56.4% |
| fire_dragon | 100 | 60.0% | 50.2%-69.1% | 64.5% | 38.8% | 53.5% |
| knight | 100 | 62.0% | 52.2%-70.9% | 60.7% | 38.0% | 41.1% |
| mage | 100 | 55.0% | 45.2%-64.4% | 59.2% | 44.4% | 32.9% |
| mechanical_dragon | 100 | 59.0% | 49.2%-68.1% | 66.3% | 40.9% | 48.8% |
| mimic | 100 | 56.0% | 46.2%-65.3% | 55.6% | 43.1% | 49.1% |
| pea_shooter | 100 | 57.0% | 47.2%-66.3% | 58.9% | 42.9% | 36.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 100 | 56.0% | 46.2%-65.3% | 60.0% | 43.2% | 29.5% |
| demon_king\|TH6 | 100 | 63.0% | 53.2%-71.8% | 70.2% | 33.5% | 56.4% |
| fire_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.5% | 38.8% | 53.5% |
| knight\|TH6 | 100 | 62.0% | 52.2%-70.9% | 60.7% | 38.0% | 41.1% |
| mage\|TH6 | 100 | 55.0% | 45.2%-64.4% | 59.2% | 44.4% | 32.9% |
| mechanical_dragon\|TH6 | 100 | 59.0% | 49.2%-68.1% | 66.3% | 40.9% | 48.8% |
| mimic\|TH6 | 100 | 56.0% | 46.2%-65.3% | 55.6% | 43.1% | 49.1% |
| pea_shooter\|TH6 | 100 | 57.0% | 47.2%-66.3% | 58.9% | 42.9% | 36.1% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 16 | 0.0% | 100.0% |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 16 | 0.0% | 100.0% |
| th6-diamond-012 | 6 | diamond | maxed | 16 | 0.0% | 100.0% |
| th6-diamond-048 | 6 | diamond | rushed-defense | 16 | 0.0% | 100.0% |
| th6-southern-funnel-059 | 6 | southern-funnel | rushed-defense | 16 | 0.0% | 98.8% |
| th6-compact-core-091 | 6 | compact-core | maxed | 16 | 0.0% | 98.3% |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 16 | 0.0% | 98.3% |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 16 | 0.0% | 97.0% |
| th6-split-core-076 | 6 | split-core | rushed-defense | 16 | 0.0% | 96.7% |
| th6-rear-keep-031 | 6 | rear-keep | rushed-defense | 16 | 0.0% | 96.3% |
| th6-resource-shield-042 | 6 | resource-shield | rushed-defense | 16 | 0.0% | 96.3% |
| th6-corner-keep-065 | 6 | corner-keep | rushed-defense | 16 | 0.0% | 96.1% |
| th6-asymmetric-left-008 | 6 | asymmetric-left | rushed-defense | 16 | 0.0% | 93.0% |
| th6-asymmetric-right-099 | 6 | asymmetric-right | rushed-defense | 16 | 0.0% | 92.9% |
| th6-compact-core-001 | 6 | compact-core | maxed | 15 | 0.0% | 100.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,452 | 5,580 | 1,863 | 1,395 |  |
| fire_dragon | 7 | 10 | 15,200 | 6,785.71 | 1,520 | 678.57 |  |
| archer | 7 | 1 | 1,764 | 609.68 | 1,764 | 609.68 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| demon_king | 7 | 5 | 20,520 | 2,220 | 4,104 | 444 |  |
| mechanical_dragon | 7 | 4 | 5,700 | 1,615.53 | 1,425 | 403.88 | chain x3 |
| knight | 7 | 1 | 3,610 | 391.11 | 3,610 | 391.11 |  |
| mimic | 7 | 6 | 17,160 | 1,269.81 | 2,860 | 211.64 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 21/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.51x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.6% is outside 55.0% +/- 2.0% across 700 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH6 has 57.6% attacker wins across 700 samples; authored target is 53.0%-57.0%.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-063 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-099 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-091 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-029 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-065 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-051 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-087 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-074 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-012 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-048 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-035 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-018 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-093 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-031 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-042 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-096 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-059 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-076 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-062 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-098 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th6-asymmetric-right-027 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-right-045 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-063 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-099 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-cannon-screen-032 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-cannon-screen-050 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-cannon-screen-086 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-compact-core-019 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-compact-core-055 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-compact-core-073 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-compact-core-091 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-corner-keep-029 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-corner-keep-065 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-corner-keep-083 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-015 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-crossfire-051 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-069 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-crossfire-087 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-defense-ring-002 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-074 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-defense-ring-092 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-diamond-012 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-diamond-030 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-diamond-048 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-diamond-066 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-left-016 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-echelon-left-052 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-right-017 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-echelon-right-035 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-right-053 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-right-089 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-kill-corridor-018 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-036 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-090 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-039 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-075 has 100.0% attacker wins across 15 samples.
- 36 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
