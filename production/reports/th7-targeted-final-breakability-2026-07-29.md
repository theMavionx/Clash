# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:30:41.828Z
**Seed:** 58007
**Town Halls:** TH7
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 900
**Unbeaten non-adaptive bases (n >= 12):** 32
**Breakability probe:** 800 battles; 37/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1.15x
**Lab late-tier troop scales:** knight=0.95x, mage=2.2x, necromancer=1.7x, archer=1.1x, pea_shooter=1.05x, mimic=1.05x, mechanical_dragon=0.95x, demon_king=0.85x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 55.2s

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
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH7=100/100
- Bases exercised: 100/100

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 835 | 55.7% | 0 | 24.1s | 54.8% | 41.9% | 37.7% |

## Base Breakability Gate

Each generated base was attacked by up to 8 top same-TH policies selected with the Wilson-score ranking. These holdout probe battles do not affect the reported balance win rate.

- Battles: 800
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 37

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th7-asymmetric-left-008 | 7 | asymmetric-left | rushed-defense | 8 |
| th7-asymmetric-left-062 | 7 | asymmetric-left | maxed | 8 |
| th7-asymmetric-left-098 | 7 | asymmetric-left | rushed-defense | 8 |
| th7-asymmetric-right-009 | 7 | asymmetric-right | rushed-defense | 8 |
| th7-asymmetric-right-063 | 7 | asymmetric-right | maxed | 8 |
| th7-asymmetric-right-099 | 7 | asymmetric-right | rushed-defense | 8 |
| th7-cannon-screen-014 | 7 | cannon-screen | rushed-defense | 8 |
| th7-cannon-screen-068 | 7 | cannon-screen | maxed | 8 |
| th7-compact-core-001 | 7 | compact-core | maxed | 8 |
| th7-compact-core-037 | 7 | compact-core | rushed-defense | 8 |
| th7-compact-core-091 | 7 | compact-core | maxed | 8 |
| th7-corner-keep-029 | 7 | corner-keep | maxed | 8 |
| th7-corner-keep-065 | 7 | corner-keep | rushed-defense | 8 |
| th7-crossfire-051 | 7 | crossfire | maxed | 8 |
| th7-crossfire-087 | 7 | crossfire | rushed-defense | 8 |
| th7-defense-ring-020 | 7 | defense-ring | rushed-defense | 8 |
| th7-defense-ring-074 | 7 | defense-ring | maxed | 8 |
| th7-diamond-012 | 7 | diamond | maxed | 8 |
| th7-diamond-048 | 7 | diamond | rushed-defense | 8 |
| th7-echelon-left-034 | 7 | echelon-left | maxed | 8 |
| th7-echelon-left-070 | 7 | echelon-left | rushed-defense | 8 |
| th7-echelon-right-035 | 7 | echelon-right | maxed | 8 |
| th7-layered-rings-003 | 7 | layered-rings | rushed-defense | 8 |
| th7-layered-rings-057 | 7 | layered-rings | maxed | 8 |
| th7-layered-rings-093 | 7 | layered-rings | rushed-defense | 8 |
| th7-rear-keep-031 | 7 | rear-keep | rushed-defense | 8 |
| th7-rear-keep-085 | 7 | rear-keep | maxed | 8 |
| th7-resource-shield-006 | 7 | resource-shield | maxed | 8 |
| th7-resource-shield-042 | 7 | resource-shield | rushed-defense | 8 |
| th7-resource-shield-096 | 7 | resource-shield | maxed | 8 |
| th7-southern-funnel-023 | 7 | southern-funnel | maxed | 8 |
| th7-southern-funnel-059 | 7 | southern-funnel | rushed-defense | 8 |
| th7-split-core-040 | 7 | split-core | maxed | 8 |
| th7-split-core-076 | 7 | split-core | rushed-defense | 8 |
| th7-trap-lanes-046 | 7 | trap-lanes | maxed | 8 |
| th7-wide-spread-025 | 7 | wide-spread | rushed-defense | 8 |
| th7-wide-spread-079 | 7 | wide-spread | maxed | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 1500 | 835 | 55.7% | 0 | 24.1s | 54.8% | 41.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield | 92 | 40 | 43.5% | 0 | 23.4s | 49.2% | 53.4% |
| asymmetric-left | 91 | 42 | 46.2% | 0 | 24.1s | 53.0% | 51.4% |
| split-core | 91 | 58 | 63.7% | 0 | 22.3s | 56.8% | 36.0% |
| wide-spread | 91 | 54 | 59.3% | 0 | 25.9s | 56.4% | 39.9% |
| asymmetric-right | 90 | 40 | 44.4% | 0 | 22.9s | 52.5% | 52.3% |
| defense-ring | 90 | 49 | 54.4% | 0 | 25.3s | 56.6% | 39.9% |
| layered-rings | 90 | 35 | 38.9% | 0 | 23.6s | 46.7% | 55.0% |
| southern-funnel | 90 | 56 | 62.2% | 0 | 23.2s | 57.6% | 35.7% |
| trap-lanes | 90 | 62 | 68.9% | 0 | 24.4s | 58.1% | 28.9% |
| compact-core | 88 | 44 | 50.0% | 0 | 23.1s | 52.0% | 48.8% |
| corner-keep | 76 | 45 | 59.2% | 0 | 24.5s | 56.0% | 40.1% |
| crossfire | 75 | 42 | 56.0% | 0 | 23.3s | 57.1% | 43.0% |
| echelon-right | 75 | 43 | 57.3% | 0 | 24.1s | 56.7% | 36.8% |
| rear-keep | 75 | 45 | 60.0% | 0 | 23.5s | 54.4% | 36.9% |
| cannon-screen | 74 | 47 | 63.5% | 0 | 25.3s | 50.3% | 34.5% |
| diamond | 74 | 39 | 52.7% | 0 | 24.6s | 58.3% | 44.5% |
| echelon-left | 74 | 45 | 60.8% | 0 | 25.3s | 57.9% | 39.1% |
| kill-corridor | 74 | 49 | 66.2% | 0 | 25.7s | 59.0% | 33.5% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| resource-shield\|TH7 | 92 | 40 | 43.5% | 0 | 23.4s | 49.2% | 53.4% |
| asymmetric-left\|TH7 | 91 | 42 | 46.2% | 0 | 24.1s | 53.0% | 51.4% |
| split-core\|TH7 | 91 | 58 | 63.7% | 0 | 22.3s | 56.8% | 36.0% |
| wide-spread\|TH7 | 91 | 54 | 59.3% | 0 | 25.9s | 56.4% | 39.9% |
| asymmetric-right\|TH7 | 90 | 40 | 44.4% | 0 | 22.9s | 52.5% | 52.3% |
| defense-ring\|TH7 | 90 | 49 | 54.4% | 0 | 25.3s | 56.6% | 39.9% |
| layered-rings\|TH7 | 90 | 35 | 38.9% | 0 | 23.6s | 46.7% | 55.0% |
| southern-funnel\|TH7 | 90 | 56 | 62.2% | 0 | 23.2s | 57.6% | 35.7% |
| trap-lanes\|TH7 | 90 | 62 | 68.9% | 0 | 24.4s | 58.1% | 28.9% |
| compact-core\|TH7 | 88 | 44 | 50.0% | 0 | 23.1s | 52.0% | 48.8% |
| corner-keep\|TH7 | 76 | 45 | 59.2% | 0 | 24.5s | 56.0% | 40.1% |
| crossfire\|TH7 | 75 | 42 | 56.0% | 0 | 23.3s | 57.1% | 43.0% |
| echelon-right\|TH7 | 75 | 43 | 57.3% | 0 | 24.1s | 56.7% | 36.8% |
| rear-keep\|TH7 | 75 | 45 | 60.0% | 0 | 23.5s | 54.4% | 36.9% |
| cannon-screen\|TH7 | 74 | 47 | 63.5% | 0 | 25.3s | 50.3% | 34.5% |
| diamond\|TH7 | 74 | 39 | 52.7% | 0 | 24.6s | 58.3% | 44.5% |
| echelon-left\|TH7 | 74 | 45 | 60.8% | 0 | 25.3s | 57.9% | 39.1% |
| kill-corridor\|TH7 | 74 | 49 | 66.2% | 0 | 25.7s | 59.0% | 33.5% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 311 | 9 | 2.9% | 0 | 18.0s | 31.0% | 92.4% |
| rushed-economy | 311 | 311 | 100.0% | 0 | 27.6s | 76.6% | 0.0% |
| mid | 302 | 252 | 83.4% | 0 | 29.6s | 70.4% | 12.5% |
| maxed | 293 | 7 | 2.4% | 0 | 19.0s | 21.4% | 97.2% |
| mixed | 283 | 256 | 90.5% | 0 | 26.4s | 75.0% | 6.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 900 | 496 | 55.1% | 0 | 26.4s | 61.7% | 43.5% |
| policy-exploration | 600 | 339 | 56.5% | 0 | 20.7s | 44.5% | 39.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 900 | 496 | 55.1% | 0 | 26.4s | 61.7% | 43.5% |
| policy-exploration\|TH7 | 600 | 339 | 56.5% | 0 | 20.7s | 44.5% | 39.5% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 900 | 496 | 55.1% | 0 | 26.4s | 61.7% | 43.5% |
| policy-exploration\|cannon-rally | 70 | 42 | 60.0% | 0 | 14.6s | 6.1% | 29.0% |
| policy-exploration\|rage-entry | 70 | 41 | 58.6% | 0 | 23.5s | 63.0% | 41.3% |
| policy-exploration\|rally-rage | 70 | 41 | 58.6% | 0 | 14.1s | 7.8% | 30.1% |
| policy-exploration\|freeze-rage | 63 | 39 | 61.9% | 0 | 24.4s | 70.2% | 34.5% |
| policy-exploration\|freeze-barrel | 54 | 36 | 66.7% | 0 | 26.5s | 68.5% | 33.3% |
| policy-exploration\|medkit-entry | 53 | 33 | 62.3% | 0 | 24.4s | 65.7% | 35.8% |
| policy-exploration\|rally-core | 53 | 27 | 50.9% | 0 | 13.4s | 5.9% | 41.3% |
| policy-exploration\|none | 50 | 29 | 58.0% | 0 | 23.8s | 61.0% | 42.0% |
| policy-exploration\|cannon-focus | 30 | 14 | 46.7% | 0 | 20.8s | 54.8% | 53.2% |
| policy-exploration\|cannon-medkit | 30 | 12 | 40.0% | 0 | 23.8s | 54.8% | 57.0% |
| policy-exploration\|skeleton-barrel | 30 | 14 | 46.7% | 0 | 21.7s | 54.2% | 53.3% |
| policy-exploration\|freeze-defense | 27 | 11 | 40.7% | 0 | 23.7s | 53.3% | 59.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 90 | 53 | 58.9% | 0 | 27.1s | 62.6% | 40.2% |
| pure-unit-matrix\|diamond | 90 | 47 | 52.2% | 0 | 25.2s | 60.2% | 47.8% |
| pure-unit-matrix\|dual-flank | 90 | 47 | 52.2% | 0 | 25.1s | 62.2% | 45.4% |
| pure-unit-matrix\|edge-sweep | 90 | 53 | 58.9% | 0 | 25.8s | 66.3% | 40.0% |
| pure-unit-matrix\|inverted-wedge | 90 | 43 | 47.8% | 0 | 27.1s | 56.7% | 49.0% |
| pure-unit-matrix\|left-flank | 90 | 50 | 55.6% | 0 | 28.0s | 59.1% | 43.0% |
| pure-unit-matrix\|right-flank | 90 | 53 | 58.9% | 0 | 27.5s | 60.5% | 39.7% |
| pure-unit-matrix\|three-lane | 90 | 51 | 56.7% | 0 | 25.0s | 65.0% | 41.6% |
| pure-unit-matrix\|vanguard-wedge | 90 | 49 | 54.4% | 0 | 27.8s | 60.9% | 44.7% |
| pure-unit-matrix\|wide-line | 90 | 50 | 55.6% | 0 | 25.0s | 63.4% | 44.1% |
| policy-exploration\|wide-line | 64 | 31 | 48.4% | 0 | 18.0s | 34.9% | 47.5% |
| policy-exploration\|dual-flank | 63 | 26 | 41.3% | 0 | 21.0s | 35.8% | 49.5% |
| policy-exploration\|center-column | 60 | 29 | 48.3% | 0 | 19.8s | 40.2% | 47.8% |
| policy-exploration\|edge-sweep | 60 | 46 | 76.7% | 0 | 24.8s | 62.8% | 20.3% |
| policy-exploration\|right-flank | 60 | 49 | 81.7% | 0 | 23.2s | 56.9% | 15.2% |
| policy-exploration\|three-lane | 60 | 40 | 66.7% | 0 | 21.9s | 51.3% | 30.6% |
| policy-exploration\|vanguard-wedge | 60 | 25 | 41.7% | 0 | 20.5s | 41.9% | 54.0% |
| policy-exploration\|inverted-wedge | 59 | 36 | 61.0% | 0 | 18.3s | 34.5% | 36.1% |
| policy-exploration\|diamond | 57 | 25 | 43.9% | 0 | 19.6s | 37.9% | 51.4% |
| policy-exploration\|left-flank | 57 | 32 | 56.1% | 0 | 20.4s | 49.7% | 42.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 180 | 109 | 60.6% | 0 | 26.5s | 64.7% | 37.8% |
| pure-unit-matrix\|drip | 180 | 98 | 54.4% | 0 | 27.0s | 61.2% | 44.7% |
| pure-unit-matrix\|rapid | 180 | 90 | 50.0% | 0 | 26.2s | 60.2% | 47.9% |
| pure-unit-matrix\|three-waves | 180 | 93 | 51.7% | 0 | 25.8s | 58.7% | 47.7% |
| pure-unit-matrix\|two-waves | 180 | 106 | 58.9% | 0 | 26.3s | 63.7% | 39.6% |
| policy-exploration\|burst | 120 | 72 | 60.0% | 0 | 20.5s | 46.5% | 35.6% |
| policy-exploration\|drip | 120 | 74 | 61.7% | 0 | 21.8s | 45.6% | 34.2% |
| policy-exploration\|rapid | 120 | 69 | 57.5% | 0 | 20.1s | 43.5% | 40.9% |
| policy-exploration\|three-waves | 120 | 63 | 52.5% | 0 | 21.0s | 43.2% | 44.2% |
| policy-exploration\|two-waves | 120 | 61 | 50.8% | 0 | 20.3s | 43.7% | 42.6% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 450 | 247 | 54.9% | 0 | 26.5s | 62.1% | 42.9% |
| pure-unit-matrix\|tank-front-support-rear | 450 | 249 | 55.3% | 0 | 26.2s | 61.3% | 44.2% |
| policy-exploration\|roster-order | 300 | 176 | 58.7% | 0 | 20.4s | 47.1% | 38.5% |
| policy-exploration\|tank-front-support-rear | 300 | 163 | 54.3% | 0 | 21.0s | 41.9% | 40.5% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 134 | 78 | 58.2% | 0 | 23.6s | 57.4% | 37.5% |
| pure-fire_dragon | 134 | 79 | 59.0% | 0 | 18.9s | 66.8% | 39.4% |
| pure-mage | 134 | 72 | 53.7% | 0 | 21.6s | 55.0% | 45.5% |
| pure-mechanical_dragon | 134 | 81 | 60.4% | 0 | 23.5s | 64.2% | 39.0% |
| pure-mimic | 134 | 70 | 52.2% | 0 | 29.5s | 52.0% | 42.9% |
| pure-pea_shooter | 134 | 60 | 44.8% | 0 | 23.6s | 50.0% | 52.1% |
| pure-archer | 117 | 59 | 50.4% | 0 | 29.3s | 59.7% | 48.5% |
| pure-knight | 117 | 66 | 56.4% | 0 | 27.4s | 58.4% | 40.4% |
| pure-necromancer | 117 | 57 | 48.7% | 0 | 30.8s | 53.7% | 50.0% |
| balanced | 34 | 30 | 88.2% | 0 | 22.9s | 80.4% | 11.3% |
| melee-pressure | 34 | 18 | 52.9% | 0 | 20.3s | 31.5% | 43.6% |
| ranged-pressure | 33 | 18 | 54.5% | 0 | 22.4s | 50.2% | 43.6% |
| support-mix | 29 | 14 | 48.3% | 0 | 22.7s | 55.4% | 51.7% |
| random-2 | 26 | 14 | 53.8% | 0 | 20.1s | 46.7% | 41.0% |
| random-3 | 26 | 22 | 84.6% | 0 | 22.2s | 53.3% | 14.5% |
| random-5 | 26 | 12 | 46.2% | 0 | 22.7s | 56.0% | 53.8% |
| random-6 | 26 | 21 | 80.8% | 0 | 18.9s | 30.8% | 13.6% |
| trap-runner-mix | 26 | 16 | 61.5% | 0 | 17.5s | 17.1% | 34.5% |
| hero-necro-dragon-mages | 20 | 11 | 55.0% | 0 | 24.0s | 67.1% | 45.0% |
| random-1 | 19 | 10 | 52.6% | 0 | 19.0s | 45.9% | 47.2% |
| frontline-ranged | 17 | 11 | 64.7% | 0 | 19.1s | 43.9% | 24.6% |
| air-pressure | 16 | 7 | 43.8% | 0 | 12.9s | 18.5% | 53.2% |
| random-4 | 13 | 9 | 69.2% | 0 | 15.6s | 17.9% | 22.9% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.3s | 49.6% | 40.6% |
| center-column__drip__roster-order | 16 | 14 | 87.5% | 0 | 28.7s | 81.9% | 12.5% |
| center-column__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.4s | 41.5% | 61.7% |
| center-column__rapid__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 22.1s | 30.1% | 80.7% |
| center-column__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 18.1s | 34.7% | 55.1% |
| center-column__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 29.2s | 72.5% | 30.0% |
| diamond__burst__roster-order | 16 | 6 | 37.5% | 0 | 19.1s | 40.3% | 62.3% |
| diamond__drip__roster-order | 16 | 11 | 68.8% | 0 | 23.8s | 54.3% | 31.3% |
| diamond__rapid__roster-order | 16 | 9 | 56.3% | 0 | 22.2s | 61.4% | 43.8% |
| diamond__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.9s | 48.1% | 55.5% |
| diamond__two-waves__roster-order | 16 | 3 | 18.8% | 0 | 19.1s | 35.0% | 71.6% |
| diamond__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 24.2s | 63.0% | 12.5% |
| dual-flank__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.6s | 43.1% | 51.2% |
| dual-flank__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 26.4s | 42.2% | 54.4% |
| dual-flank__rapid__roster-order | 16 | 5 | 31.3% | 0 | 22.1s | 52.8% | 68.8% |
| dual-flank__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 29.0s | 78.6% | 19.2% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 20.4s | 41.1% | 55.3% |
| dual-flank__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 19.5s | 41.9% | 39.4% |
| edge-sweep__burst__roster-order | 16 | 14 | 87.5% | 0 | 28.2s | 81.5% | 12.5% |
| edge-sweep__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 22.3s | 62.1% | 25.0% |
| edge-sweep__drip__roster-order | 16 | 7 | 43.8% | 0 | 24.9s | 58.9% | 51.6% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 23.3s | 57.9% | 25.2% |
| edge-sweep__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 23.8s | 43.3% | 50.0% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.4s | 68.3% | 32.2% |
| inverted-wedge__burst__roster-order | 16 | 14 | 87.5% | 0 | 21.9s | 40.6% | 12.8% |
| inverted-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 23.2s | 34.3% | 37.7% |
| inverted-wedge__rapid__roster-order | 16 | 5 | 31.3% | 0 | 23.6s | 52.7% | 64.9% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 22.7s | 53.5% | 37.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.2s | 48.9% | 37.5% |
| left-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 20.7s | 49.4% | 31.3% |
| left-flank__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 23.2s | 49.5% | 40.7% |
| left-flank__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 21.8s | 52.7% | 58.1% |
| left-flank__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 27.8s | 56.9% | 53.2% |
| left-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.5s | 68.7% | 25.0% |
| left-flank__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 23.4s | 56.9% | 29.6% |
| right-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 29.6s | 63.0% | 36.8% |
| right-flank__drip__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 27.5s | 62.2% | 12.1% |
| right-flank__rapid__roster-order | 16 | 10 | 62.5% | 0 | 22.4s | 49.8% | 33.7% |
| right-flank__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 21.2s | 46.7% | 37.0% |
| right-flank__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.6s | 47.9% | 26.1% |
| right-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 22.4s | 56.4% | 37.5% |
| three-lane__burst__roster-order | 16 | 12 | 75.0% | 0 | 26.2s | 76.0% | 24.2% |
| three-lane__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 25.6s | 81.3% | 18.8% |
| three-lane__rapid__roster-order | 16 | 10 | 62.5% | 0 | 21.6s | 43.7% | 29.7% |
| three-lane__three-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 19.2s | 32.9% | 75.0% |
| three-lane__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.5s | 61.8% | 38.5% |
| three-lane__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.7s | 44.8% | 49.8% |
| vanguard-wedge__burst__roster-order | 16 | 3 | 18.8% | 0 | 21.9s | 41.1% | 81.3% |
| vanguard-wedge__drip__roster-order | 16 | 13 | 81.3% | 0 | 28.8s | 74.9% | 18.8% |
| vanguard-wedge__rapid__roster-order | 16 | 6 | 37.5% | 0 | 24.3s | 41.5% | 56.1% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 21.3s | 41.0% | 67.9% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 23.4s | 42.6% | 43.8% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 24.3s | 46.1% | 50.3% |
| wide-line__burst__roster-order | 16 | 10 | 62.5% | 0 | 19.3s | 51.0% | 37.5% |
| wide-line__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.4s | 49.8% | 49.0% |
| wide-line__drip__roster-order | 16 | 8 | 50.0% | 0 | 21.0s | 39.6% | 38.7% |
| wide-line__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 22.2s | 46.2% | 37.5% |
| wide-line__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 23.1s | 59.5% | 31.3% |
| wide-line__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 24.1s | 74.5% | 25.0% |
| wide-line__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.0s | 55.4% | 37.7% |
| center-column__rapid__roster-order | 15 | 15 | 100.0% | 0 | 25.7s | 71.1% | 0.0% |
| center-column__three-waves__tank-front-support-rear | 15 | 4 | 26.7% | 0 | 22.7s | 37.9% | 65.3% |
| diamond__rapid__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 26.0s | 46.3% | 60.0% |
| dual-flank__burst__roster-order | 15 | 9 | 60.0% | 0 | 21.7s | 54.1% | 29.0% |
| dual-flank__drip__roster-order | 15 | 5 | 33.3% | 0 | 23.5s | 47.0% | 64.2% |
| dual-flank__two-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 22.7s | 47.8% | 46.7% |
| edge-sweep__drip__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 29.3s | 77.6% | 20.0% |
| edge-sweep__two-waves__roster-order | 15 | 9 | 60.0% | 0 | 23.5s | 62.5% | 40.0% |
| inverted-wedge__burst__tank-front-support-rear | 15 | 7 | 46.7% | 0 | 22.4s | 44.6% | 46.2% |
| inverted-wedge__drip__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 21.8s | 36.8% | 55.6% |
| inverted-wedge__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 26.1s | 67.9% | 33.0% |
| left-flank__rapid__roster-order | 15 | 6 | 40.0% | 0 | 28.9s | 47.1% | 60.0% |
| right-flank__burst__roster-order | 15 | 12 | 80.0% | 0 | 27.9s | 75.7% | 16.7% |
| right-flank__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 26.8s | 65.7% | 33.3% |
| three-lane__drip__roster-order | 15 | 10 | 66.7% | 0 | 26.2s | 69.4% | 33.3% |
| three-lane__rapid__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 22.2s | 61.3% | 20.0% |
| vanguard-wedge__burst__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 31.7s | 79.1% | 18.8% |
| vanguard-wedge__three-waves__roster-order | 15 | 6 | 40.0% | 0 | 21.8s | 49.1% | 59.8% |
| wide-line__three-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 21.3s | 47.2% | 66.7% |
| wide-line__two-waves__roster-order | 15 | 4 | 26.7% | 0 | 19.7s | 42.6% | 73.3% |
| center-column__burst__roster-order | 12 | 5 | 41.7% | 0 | 24.7s | 54.0% | 51.7% |
| center-column__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 25.6s | 66.8% | 33.3% |
| diamond__burst__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 27.4s | 74.1% | 25.0% |
| diamond__drip__tank-front-support-rear | 12 | 3 | 25.0% | 0 | 24.7s | 45.9% | 75.0% |
| diamond__three-waves__roster-order | 12 | 5 | 41.7% | 0 | 21.6s | 51.3% | 58.3% |
| dual-flank__rapid__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 28.5s | 68.8% | 41.2% |
| edge-sweep__rapid__roster-order | 12 | 8 | 66.7% | 0 | 23.2s | 69.8% | 31.4% |
| edge-sweep__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 28.6s | 70.7% | 33.3% |
| inverted-wedge__three-waves__tank-front-support-rear | 12 | 4 | 33.3% | 0 | 25.0s | 47.1% | 66.7% |
| inverted-wedge__two-waves__roster-order | 12 | 4 | 33.3% | 0 | 24.8s | 54.0% | 55.5% |
| left-flank__burst__roster-order | 12 | 8 | 66.7% | 0 | 29.2s | 70.0% | 30.1% |
| left-flank__drip__roster-order | 12 | 5 | 41.7% | 0 | 25.3s | 48.7% | 57.9% |
| left-flank__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 23.7s | 56.4% | 41.7% |
| right-flank__drip__roster-order | 12 | 6 | 50.0% | 0 | 27.3s | 53.8% | 50.0% |
| right-flank__rapid__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 29.2s | 73.0% | 16.6% |
| three-lane__burst__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 21.9s | 57.5% | 58.3% |
| three-lane__three-waves__roster-order | 12 | 9 | 75.0% | 0 | 29.5s | 69.6% | 25.0% |
| vanguard-wedge__drip__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 24.1s | 48.9% | 58.3% |
| vanguard-wedge__two-waves__roster-order | 12 | 9 | 75.0% | 0 | 28.0s | 73.6% | 25.0% |
| wide-line__rapid__roster-order | 12 | 4 | 33.3% | 0 | 24.0s | 47.9% | 66.7% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 154 | 81 | 52.6% | 0 | 22.1s | 51.5% | 45.5% |
| dual-flank | 153 | 73 | 47.7% | 0 | 23.4s | 51.4% | 47.1% |
| center-column | 150 | 82 | 54.7% | 0 | 24.2s | 53.6% | 43.3% |
| edge-sweep | 150 | 99 | 66.0% | 0 | 25.4s | 64.9% | 32.1% |
| right-flank | 150 | 102 | 68.0% | 0 | 25.8s | 59.1% | 29.9% |
| three-lane | 150 | 91 | 60.7% | 0 | 23.8s | 59.6% | 37.2% |
| vanguard-wedge | 150 | 74 | 49.3% | 0 | 24.9s | 53.3% | 48.5% |
| inverted-wedge | 149 | 79 | 53.0% | 0 | 23.6s | 47.9% | 43.9% |
| diamond | 147 | 72 | 49.0% | 0 | 23.1s | 51.6% | 49.2% |
| left-flank | 147 | 82 | 55.8% | 0 | 25.0s | 55.5% | 42.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 181 | 60.3% | 0 | 24.1s | 57.4% | 36.9% |
| drip | 300 | 172 | 57.3% | 0 | 24.9s | 55.0% | 40.5% |
| rapid | 300 | 159 | 53.0% | 0 | 23.8s | 53.5% | 45.1% |
| three-waves | 300 | 156 | 52.0% | 0 | 23.9s | 52.5% | 46.3% |
| two-waves | 300 | 167 | 55.7% | 0 | 23.9s | 55.7% | 40.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 423 | 56.4% | 0 | 24.1s | 56.1% | 41.1% |
| tank-front-support-rear | 750 | 412 | 54.9% | 0 | 24.2s | 53.5% | 42.7% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 950 | 525 | 55.3% | 0 | 26.2s | 61.7% | 43.5% |
| cannon-rally | 70 | 42 | 60.0% | 0 | 14.6s | 6.1% | 29.0% |
| rage-entry | 70 | 41 | 58.6% | 0 | 23.5s | 63.0% | 41.3% |
| rally-rage | 70 | 41 | 58.6% | 0 | 14.1s | 7.8% | 30.1% |
| freeze-rage | 63 | 39 | 61.9% | 0 | 24.4s | 70.2% | 34.5% |
| freeze-barrel | 54 | 36 | 66.7% | 0 | 26.5s | 68.5% | 33.3% |
| medkit-entry | 53 | 33 | 62.3% | 0 | 24.4s | 65.7% | 35.8% |
| rally-core | 53 | 27 | 50.9% | 0 | 13.4s | 5.9% | 41.3% |
| cannon-focus | 30 | 14 | 46.7% | 0 | 20.8s | 54.8% | 53.2% |
| cannon-medkit | 30 | 12 | 40.0% | 0 | 23.8s | 54.8% | 57.0% |
| skeleton-barrel | 30 | 14 | 46.7% | 0 | 21.7s | 54.2% | 53.3% |
| freeze-defense | 27 | 11 | 40.7% | 0 | 23.7s | 53.3% | 59.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 1048 | 561 | 53.5% | 0 | 25.6s | 58.8% | 44.3% |
| epic | 152 | 64 | 42.1% | 0 | 20.0s | 37.4% | 53.4% |
| unrevealed | 152 | 101 | 66.4% | 0 | 20.8s | 48.6% | 30.2% |
| legendary | 148 | 109 | 73.6% | 0 | 21.4s | 51.0% | 25.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1020 | 569 | 55.8% | 0 | 25.7s | 59.7% | 42.6% |
| ward-1 | 180 | 98 | 54.4% | 0 | 20.6s | 44.3% | 41.3% |
| ward-3 | 180 | 99 | 55.0% | 0 | 20.7s | 45.1% | 40.9% |
| ward-2 | 120 | 69 | 57.5% | 0 | 21.3s | 43.5% | 38.5% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 835 | 55.7% | 0 | 24.1s | 54.8% | 41.9% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 445 | 274 | 61.6% | 0 | 20.1s | 53.3% | 36.1% |
| mage | 429 | 260 | 60.6% | 0 | 21.2s | 51.0% | 37.4% |
| demon_king | 404 | 244 | 60.4% | 0 | 21.6s | 50.0% | 36.2% |
| archer | 366 | 214 | 58.5% | 0 | 23.4s | 51.2% | 39.1% |
| mimic | 365 | 225 | 61.6% | 0 | 23.7s | 47.1% | 34.3% |
| knight | 361 | 219 | 60.7% | 0 | 23.1s | 51.8% | 36.8% |
| necromancer | 335 | 188 | 56.1% | 0 | 24.5s | 50.3% | 42.0% |
| mechanical_dragon | 306 | 185 | 60.5% | 0 | 21.7s | 53.2% | 38.0% |
| pea_shooter | 238 | 122 | 51.3% | 0 | 22.8s | 50.7% | 46.6% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 51.0% | 41.3%-60.6% | 59.2% | 47.8% | 30.0% |
| demon_king | 100 | 62.0% | 52.2%-70.9% | 67.5% | 36.7% | 52.8% |
| fire_dragon | 100 | 61.0% | 51.2%-70.0% | 68.3% | 37.3% | 53.3% |
| knight | 100 | 59.0% | 49.2%-68.1% | 62.5% | 40.5% | 41.6% |
| mage | 100 | 56.0% | 46.2%-65.3% | 61.4% | 43.1% | 34.7% |
| mechanical_dragon | 100 | 59.0% | 49.2%-68.1% | 68.3% | 40.3% | 47.6% |
| mimic | 100 | 48.0% | 38.5%-57.7% | 56.3% | 48.7% | 41.7% |
| necromancer | 100 | 48.0% | 38.5%-57.7% | 52.9% | 50.5% | 35.7% |
| pea_shooter | 100 | 52.0% | 42.3%-61.5% | 58.8% | 46.9% | 33.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 100 | 51.0% | 41.3%-60.6% | 59.2% | 47.8% | 30.0% |
| demon_king\|TH7 | 100 | 62.0% | 52.2%-70.9% | 67.5% | 36.7% | 52.8% |
| fire_dragon\|TH7 | 100 | 61.0% | 51.2%-70.0% | 68.3% | 37.3% | 53.3% |
| knight\|TH7 | 100 | 59.0% | 49.2%-68.1% | 62.5% | 40.5% | 41.6% |
| mage\|TH7 | 100 | 56.0% | 46.2%-65.3% | 61.4% | 43.1% | 34.7% |
| mechanical_dragon\|TH7 | 100 | 59.0% | 49.2%-68.1% | 68.3% | 40.3% | 47.6% |
| mimic\|TH7 | 100 | 48.0% | 38.5%-57.7% | 56.3% | 48.7% | 41.7% |
| necromancer\|TH7 | 100 | 48.0% | 38.5%-57.7% | 52.9% | 50.5% | 35.7% |
| pea_shooter\|TH7 | 100 | 52.0% | 42.3%-61.5% | 58.8% | 46.9% | 33.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-left-062 | 7 | asymmetric-left | maxed | 16 | 0.0% | 100.0% |
| th7-crossfire-051 | 7 | crossfire | maxed | 16 | 0.0% | 100.0% |
| th7-wide-spread-079 | 7 | wide-spread | maxed | 16 | 0.0% | 99.8% |
| th7-resource-shield-096 | 7 | resource-shield | maxed | 16 | 0.0% | 98.4% |
| th7-asymmetric-right-009 | 7 | asymmetric-right | rushed-defense | 16 | 0.0% | 97.0% |
| th7-asymmetric-left-098 | 7 | asymmetric-left | rushed-defense | 16 | 0.0% | 95.9% |
| th7-southern-funnel-023 | 7 | southern-funnel | maxed | 15 | 0.0% | 99.8% |
| th7-resource-shield-006 | 7 | resource-shield | maxed | 15 | 0.0% | 99.7% |
| th7-southern-funnel-059 | 7 | southern-funnel | rushed-defense | 15 | 0.0% | 99.6% |
| th7-split-core-076 | 7 | split-core | rushed-defense | 15 | 0.0% | 99.2% |
| th7-split-core-040 | 7 | split-core | maxed | 15 | 0.0% | 99.0% |
| th7-resource-shield-042 | 7 | resource-shield | rushed-defense | 15 | 0.0% | 98.4% |
| th7-crossfire-087 | 7 | crossfire | rushed-defense | 15 | 0.0% | 96.6% |
| th7-wide-spread-025 | 7 | wide-spread | rushed-defense | 15 | 0.0% | 96.2% |
| th7-layered-rings-093 | 7 | layered-rings | rushed-defense | 15 | 0.0% | 95.6% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 10,474 | 7,842.86 | 2,618.5 | 1,960.71 |  |
| necromancer | 7 | 15 | 44,105 | 13,467.9 | 2,940.33 | 897.86 |  |
| fire_dragon | 7 | 10 | 17,480 | 7,802.86 | 1,748 | 780.29 |  |
| archer | 7 | 1 | 2,125 | 733.87 | 2,125 | 733.87 |  |
| demon_king | 7 | 5 | 22,287 | 2,411.11 | 4,457.4 | 482.22 |  |
| mechanical_dragon | 7 | 4 | 6,555 | 1,858.25 | 1,638.75 | 464.56 | chain x3 |
| knight | 7 | 1 | 4,151 | 448.89 | 4,151 | 448.89 |  |
| horror | 7 | 20 | 44,926 | 4,822.58 | 2,246.3 | 241.13 |  |
| mimic | 7 | 6 | 18,837 | 1,394.34 | 3,139.5 | 232.39 | trap immune |
| pea_shooter | 7 | 5 | 13,283 | 938.29 | 2,656.6 | 187.66 |  |
| ice_golem | 7 | 10 | 48,300 | 1,871.13 | 4,830 | 187.11 | defense priority |
| wind_mage | 7 | 15 | 21,620 | 2,237.27 | 1,441.33 | 149.15 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 37/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-progression:** demon_king HP decreases from L4 to L5.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 4.29x median.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-southern-funnel-059 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-trap-lanes-046 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-025 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-wide-spread-079 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-098 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-009 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-063 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-099 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-001 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-091 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-029 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-065 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-051 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-crossfire-087 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-074 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-012 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-048 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-echelon-right-035 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-057 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-rear-keep-031 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-042 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-southern-funnel-059 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-southern-funnel-077 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-southern-funnel-095 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-022 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-split-core-094 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-trap-lanes-028 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-trap-lanes-046 has 0.0% attacker wins across 13 samples.
- **INFO / fragile-base:** th7-trap-lanes-100 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-wide-spread-025 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-wide-spread-043 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-wide-spread-079 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-left-026 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-left-044 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-098 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-009 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-asymmetric-right-045 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-063 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-099 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-compact-core-001 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-compact-core-055 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-compact-core-073 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-compact-core-091 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-corner-keep-029 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-corner-keep-065 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th7-corner-keep-083 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th7-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-crossfire-051 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-crossfire-087 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th7-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th7-defense-ring-074 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th7-diamond-012 has 0.0% attacker wins across 14 samples.
- 21 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
