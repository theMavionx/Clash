# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:40:09.990Z
**Seed:** 62006
**Town Halls:** TH6
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 800
**Unbeaten non-adaptive bases (n >= 12):** 23
**Breakability probe:** 1700 calibration + gate battles; 2/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1.15x, L7=1x
**Lab late-tier troop scales:** knight=0.95x, mage=1.8x, archer=1.05x, mimic=1.1x, mechanical_dragon=0.95x, demon_king=0.9x, fire_dragon=0.95x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.85x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 77.7s

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
| 1500 | 886 | 59.1% | 0 | 26.5s | 57.6% | 38.2% | 38.4% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 2

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th6-rear-keep-085 | 6 | rear-keep | maxed | 8 |
| th6-resource-shield-006 | 6 | resource-shield | maxed | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 1500 | 886 | 59.1% | 0 | 26.5s | 57.6% | 38.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 92 | 64 | 69.6% | 0 | 25.3s | 59.3% | 28.6% |
| layered-rings | 91 | 43 | 47.3% | 0 | 25.6s | 56.7% | 50.5% |
| resource-shield | 91 | 46 | 50.5% | 0 | 24.4s | 53.4% | 46.8% |
| wide-spread | 91 | 66 | 72.5% | 0 | 28.4s | 65.4% | 23.6% |
| asymmetric-left | 90 | 47 | 52.2% | 0 | 26.5s | 58.0% | 46.4% |
| asymmetric-right | 90 | 41 | 45.6% | 0 | 26.6s | 54.0% | 51.2% |
| compact-core | 90 | 44 | 48.9% | 0 | 26.1s | 52.7% | 47.4% |
| defense-ring | 90 | 52 | 57.8% | 0 | 27.0s | 61.1% | 36.8% |
| split-core | 90 | 59 | 65.6% | 0 | 23.7s | 57.5% | 32.6% |
| trap-lanes | 90 | 58 | 64.4% | 0 | 26.4s | 60.6% | 34.2% |
| cannon-screen | 75 | 53 | 70.7% | 0 | 30.7s | 58.8% | 27.4% |
| diamond | 75 | 40 | 53.3% | 0 | 26.6s | 57.0% | 41.7% |
| echelon-left | 75 | 47 | 62.7% | 0 | 28.4s | 57.6% | 33.0% |
| corner-keep | 74 | 41 | 55.4% | 0 | 26.0s | 53.5% | 41.4% |
| crossfire | 74 | 47 | 63.5% | 0 | 28.2s | 56.5% | 36.0% |
| echelon-right | 74 | 49 | 66.2% | 0 | 29.0s | 58.0% | 30.0% |
| kill-corridor | 74 | 46 | 62.2% | 0 | 25.3s | 59.6% | 35.8% |
| rear-keep | 74 | 43 | 58.1% | 0 | 24.8s | 56.8% | 40.9% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel\|TH6 | 92 | 64 | 69.6% | 0 | 25.3s | 59.3% | 28.6% |
| layered-rings\|TH6 | 91 | 43 | 47.3% | 0 | 25.6s | 56.7% | 50.5% |
| resource-shield\|TH6 | 91 | 46 | 50.5% | 0 | 24.4s | 53.4% | 46.8% |
| wide-spread\|TH6 | 91 | 66 | 72.5% | 0 | 28.4s | 65.4% | 23.6% |
| asymmetric-left\|TH6 | 90 | 47 | 52.2% | 0 | 26.5s | 58.0% | 46.4% |
| asymmetric-right\|TH6 | 90 | 41 | 45.6% | 0 | 26.6s | 54.0% | 51.2% |
| compact-core\|TH6 | 90 | 44 | 48.9% | 0 | 26.1s | 52.7% | 47.4% |
| defense-ring\|TH6 | 90 | 52 | 57.8% | 0 | 27.0s | 61.1% | 36.8% |
| split-core\|TH6 | 90 | 59 | 65.6% | 0 | 23.7s | 57.5% | 32.6% |
| trap-lanes\|TH6 | 90 | 58 | 64.4% | 0 | 26.4s | 60.6% | 34.2% |
| cannon-screen\|TH6 | 75 | 53 | 70.7% | 0 | 30.7s | 58.8% | 27.4% |
| diamond\|TH6 | 75 | 40 | 53.3% | 0 | 26.6s | 57.0% | 41.7% |
| echelon-left\|TH6 | 75 | 47 | 62.7% | 0 | 28.4s | 57.6% | 33.0% |
| corner-keep\|TH6 | 74 | 41 | 55.4% | 0 | 26.0s | 53.5% | 41.4% |
| crossfire\|TH6 | 74 | 47 | 63.5% | 0 | 28.2s | 56.5% | 36.0% |
| echelon-right\|TH6 | 74 | 49 | 66.2% | 0 | 29.0s | 58.0% | 30.0% |
| kill-corridor\|TH6 | 74 | 46 | 62.2% | 0 | 25.3s | 59.6% | 35.8% |
| rear-keep\|TH6 | 74 | 43 | 58.1% | 0 | 24.8s | 56.8% | 40.9% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 326 | 26 | 8.0% | 0 | 22.0s | 38.3% | 85.8% |
| maxed | 298 | 8 | 2.7% | 0 | 23.2s | 24.9% | 93.5% |
| mid | 297 | 290 | 97.6% | 0 | 30.7s | 75.4% | 1.4% |
| rushed-economy | 295 | 295 | 100.0% | 0 | 29.5s | 77.4% | 0.0% |
| mixed | 284 | 267 | 94.0% | 0 | 27.9s | 74.9% | 3.6% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 800 | 481 | 60.1% | 0 | 29.6s | 65.2% | 38.4% |
| policy-exploration | 700 | 405 | 57.9% | 0 | 23.1s | 48.9% | 38.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 800 | 481 | 60.1% | 0 | 29.6s | 65.2% | 38.4% |
| policy-exploration\|TH6 | 700 | 405 | 57.9% | 0 | 23.1s | 48.9% | 38.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 800 | 481 | 60.1% | 0 | 29.6s | 65.2% | 38.4% |
| policy-exploration\|freeze-defense | 62 | 40 | 64.5% | 0 | 27.3s | 67.7% | 33.9% |
| policy-exploration\|none | 62 | 35 | 56.5% | 0 | 25.7s | 62.5% | 39.8% |
| policy-exploration\|rally-core | 62 | 38 | 61.3% | 0 | 14.9s | 6.4% | 26.9% |
| policy-exploration\|medkit-entry | 59 | 30 | 50.8% | 0 | 24.6s | 61.2% | 49.1% |
| policy-exploration\|rage-entry | 59 | 32 | 54.2% | 0 | 23.3s | 58.2% | 44.7% |
| policy-exploration\|cannon-focus | 58 | 30 | 51.7% | 0 | 25.5s | 61.4% | 47.5% |
| policy-exploration\|cannon-rally | 58 | 32 | 55.2% | 0 | 15.1s | 6.3% | 29.9% |
| policy-exploration\|rally-rage | 58 | 33 | 56.9% | 0 | 15.4s | 6.5% | 30.8% |
| policy-exploration\|skeleton-barrel | 58 | 33 | 56.9% | 0 | 26.7s | 63.3% | 43.0% |
| policy-exploration\|freeze-barrel | 55 | 34 | 61.8% | 0 | 25.4s | 67.3% | 37.0% |
| policy-exploration\|freeze-rage | 55 | 32 | 58.2% | 0 | 26.8s | 64.2% | 40.5% |
| policy-exploration\|cannon-medkit | 54 | 36 | 66.7% | 0 | 27.2s | 65.6% | 33.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 80 | 46 | 57.5% | 0 | 30.6s | 64.4% | 41.5% |
| pure-unit-matrix\|diamond | 80 | 45 | 56.3% | 0 | 28.8s | 65.4% | 42.2% |
| pure-unit-matrix\|dual-flank | 80 | 49 | 61.3% | 0 | 28.0s | 66.9% | 37.6% |
| pure-unit-matrix\|edge-sweep | 80 | 51 | 63.7% | 0 | 28.2s | 68.3% | 35.6% |
| pure-unit-matrix\|inverted-wedge | 80 | 49 | 61.3% | 0 | 28.5s | 64.1% | 36.9% |
| pure-unit-matrix\|left-flank | 80 | 49 | 61.3% | 0 | 30.3s | 62.3% | 37.6% |
| pure-unit-matrix\|right-flank | 80 | 46 | 57.5% | 0 | 30.6s | 63.8% | 38.0% |
| pure-unit-matrix\|three-lane | 80 | 45 | 56.3% | 0 | 29.9s | 66.0% | 41.2% |
| pure-unit-matrix\|vanguard-wedge | 80 | 49 | 61.3% | 0 | 31.7s | 61.7% | 38.2% |
| pure-unit-matrix\|wide-line | 80 | 52 | 65.0% | 0 | 29.0s | 69.2% | 34.7% |
| policy-exploration\|diamond | 74 | 38 | 51.4% | 0 | 23.6s | 46.1% | 44.7% |
| policy-exploration\|dual-flank | 74 | 41 | 55.4% | 0 | 23.1s | 50.1% | 40.0% |
| policy-exploration\|vanguard-wedge | 74 | 46 | 62.2% | 0 | 22.6s | 52.0% | 32.2% |
| policy-exploration\|edge-sweep | 73 | 36 | 49.3% | 0 | 23.0s | 44.3% | 49.1% |
| policy-exploration\|right-flank | 71 | 48 | 67.6% | 0 | 24.0s | 49.4% | 28.3% |
| policy-exploration\|wide-line | 71 | 40 | 56.3% | 0 | 22.3s | 45.9% | 37.3% |
| policy-exploration\|left-flank | 68 | 49 | 72.1% | 0 | 25.3s | 58.1% | 26.6% |
| policy-exploration\|center-column | 67 | 40 | 59.7% | 0 | 21.6s | 51.3% | 36.5% |
| policy-exploration\|three-lane | 65 | 40 | 61.5% | 0 | 22.7s | 47.2% | 33.0% |
| policy-exploration\|inverted-wedge | 63 | 27 | 42.9% | 0 | 22.9s | 45.0% | 52.3% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 160 | 96 | 60.0% | 0 | 29.2s | 66.7% | 37.8% |
| pure-unit-matrix\|drip | 160 | 101 | 63.1% | 0 | 31.8s | 65.8% | 35.6% |
| pure-unit-matrix\|rapid | 160 | 88 | 55.0% | 0 | 28.3s | 62.3% | 43.8% |
| pure-unit-matrix\|three-waves | 160 | 87 | 54.4% | 0 | 28.5s | 61.7% | 43.8% |
| pure-unit-matrix\|two-waves | 160 | 109 | 68.1% | 0 | 30.0s | 69.5% | 30.7% |
| policy-exploration\|burst | 140 | 85 | 60.7% | 0 | 21.9s | 48.1% | 35.1% |
| policy-exploration\|drip | 140 | 83 | 59.3% | 0 | 24.3s | 49.4% | 35.8% |
| policy-exploration\|rapid | 140 | 83 | 59.3% | 0 | 22.4s | 51.6% | 38.5% |
| policy-exploration\|three-waves | 140 | 84 | 60.0% | 0 | 23.3s | 51.6% | 36.9% |
| policy-exploration\|two-waves | 140 | 70 | 50.0% | 0 | 23.6s | 44.1% | 43.8% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 400 | 242 | 60.5% | 0 | 29.3s | 65.1% | 38.1% |
| pure-unit-matrix\|tank-front-support-rear | 400 | 239 | 59.8% | 0 | 29.8s | 65.3% | 38.6% |
| policy-exploration\|roster-order | 350 | 203 | 58.0% | 0 | 23.2s | 49.7% | 38.7% |
| policy-exploration\|tank-front-support-rear | 350 | 202 | 57.7% | 0 | 23.0s | 48.2% | 37.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-knight | 135 | 80 | 59.3% | 0 | 32.0s | 62.2% | 38.2% |
| pure-mimic | 134 | 77 | 57.5% | 0 | 33.7s | 55.7% | 39.1% |
| pure-mechanical_dragon | 132 | 72 | 54.5% | 0 | 25.3s | 60.4% | 43.8% |
| pure-demon_king | 131 | 95 | 72.5% | 0 | 29.8s | 70.4% | 22.8% |
| pure-fire_dragon | 131 | 78 | 59.5% | 0 | 19.7s | 62.5% | 37.7% |
| pure-archer | 128 | 71 | 55.5% | 0 | 34.4s | 54.7% | 43.0% |
| pure-pea_shooter | 128 | 72 | 56.3% | 0 | 27.5s | 55.7% | 42.3% |
| pure-mage | 127 | 71 | 55.9% | 0 | 24.6s | 58.7% | 42.4% |
| melee-pressure | 38 | 29 | 76.3% | 0 | 26.2s | 54.8% | 16.5% |
| random-2 | 38 | 24 | 63.2% | 0 | 21.0s | 52.3% | 36.6% |
| random-6 | 38 | 19 | 50.0% | 0 | 20.7s | 45.5% | 46.8% |
| trap-runner-mix | 36 | 19 | 52.8% | 0 | 22.3s | 38.9% | 42.7% |
| air-pressure | 35 | 23 | 65.7% | 0 | 19.2s | 58.4% | 30.6% |
| balanced | 34 | 16 | 47.1% | 0 | 23.6s | 58.2% | 44.0% |
| hero-necro-dragon-mages | 34 | 21 | 61.8% | 0 | 20.4s | 53.0% | 37.1% |
| random-3 | 32 | 17 | 53.1% | 0 | 22.8s | 52.4% | 44.1% |
| support-mix | 31 | 21 | 67.7% | 0 | 22.6s | 57.5% | 30.8% |
| random-4 | 30 | 19 | 63.3% | 0 | 20.3s | 41.6% | 34.3% |
| frontline-ranged | 28 | 16 | 57.1% | 0 | 20.8s | 47.2% | 40.1% |
| random-1 | 28 | 18 | 64.3% | 0 | 25.9s | 58.4% | 31.1% |
| random-5 | 28 | 18 | 64.3% | 0 | 25.8s | 64.3% | 33.2% |
| ranged-pressure | 24 | 10 | 41.7% | 0 | 20.5s | 46.3% | 57.8% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 11 | 68.8% | 0 | 25.7s | 71.7% | 31.3% |
| center-column__drip__roster-order | 16 | 9 | 56.3% | 0 | 25.8s | 42.9% | 41.3% |
| center-column__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 30.4s | 77.8% | 23.9% |
| center-column__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.6s | 46.9% | 62.5% |
| center-column__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 25.1s | 51.8% | 44.7% |
| center-column__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 28.5s | 70.6% | 33.8% |
| diamond__burst__roster-order | 16 | 6 | 37.5% | 0 | 24.2s | 49.6% | 55.4% |
| diamond__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 23.4s | 57.6% | 25.0% |
| diamond__drip__roster-order | 16 | 10 | 62.5% | 0 | 33.9s | 66.6% | 37.5% |
| diamond__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 25.3s | 55.9% | 65.2% |
| diamond__rapid__roster-order | 16 | 4 | 25.0% | 0 | 18.9s | 36.3% | 70.5% |
| diamond__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.3s | 71.3% | 25.0% |
| diamond__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 30.2s | 66.7% | 36.6% |
| dual-flank__burst__roster-order | 16 | 5 | 31.3% | 0 | 25.6s | 49.6% | 64.1% |
| dual-flank__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.6s | 65.5% | 42.3% |
| dual-flank__drip__roster-order | 16 | 10 | 62.5% | 0 | 25.6s | 66.6% | 37.5% |
| dual-flank__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 23.4s | 47.9% | 43.0% |
| dual-flank__three-waves__roster-order | 16 | 3 | 18.8% | 0 | 22.3s | 48.5% | 79.5% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 32.8s | 79.7% | 12.5% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.2s | 62.9% | 7.3% |
| edge-sweep__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.7s | 47.9% | 49.5% |
| edge-sweep__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.3s | 52.8% | 62.5% |
| edge-sweep__rapid__roster-order | 16 | 8 | 50.0% | 0 | 26.3s | 60.3% | 50.0% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 28.7s | 75.5% | 18.8% |
| edge-sweep__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 23.8s | 43.8% | 68.8% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 23.3s | 52.6% | 30.8% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.5s | 48.0% | 46.1% |
| inverted-wedge__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 21.2s | 52.9% | 56.3% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 26.1s | 57.1% | 60.6% |
| inverted-wedge__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 28.7s | 54.6% | 27.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.4s | 53.5% | 50.0% |
| left-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 25.1s | 52.4% | 55.8% |
| left-flank__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.3s | 62.0% | 43.8% |
| left-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 25.6s | 54.0% | 24.0% |
| left-flank__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.4s | 52.3% | 25.0% |
| right-flank__burst__roster-order | 16 | 12 | 75.0% | 0 | 25.7s | 56.8% | 23.3% |
| right-flank__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 23.7s | 42.3% | 58.0% |
| right-flank__drip__roster-order | 16 | 15 | 93.8% | 0 | 27.8s | 59.4% | 6.3% |
| right-flank__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.9s | 59.4% | 41.4% |
| right-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 25.3s | 61.5% | 53.2% |
| right-flank__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.6s | 66.0% | 28.3% |
| right-flank__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 27.3s | 44.3% | 45.6% |
| three-lane__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 27.2s | 54.4% | 58.3% |
| three-lane__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 22.9s | 57.4% | 24.1% |
| three-lane__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 23.5s | 46.9% | 45.2% |
| three-lane__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.2s | 40.7% | 47.6% |
| vanguard-wedge__burst__roster-order | 16 | 16 | 100.0% | 0 | 30.5s | 83.7% | 0.0% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 30.4s | 30.8% | 54.2% |
| vanguard-wedge__drip__roster-order | 16 | 6 | 37.5% | 0 | 25.1s | 45.9% | 59.6% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.1s | 66.2% | 25.0% |
| vanguard-wedge__rapid__roster-order | 16 | 12 | 75.0% | 0 | 24.8s | 53.9% | 23.0% |
| vanguard-wedge__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 27.2s | 51.7% | 50.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.1s | 52.9% | 26.9% |
| wide-line__burst__roster-order | 16 | 11 | 68.8% | 0 | 25.8s | 72.9% | 31.3% |
| wide-line__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 20.5s | 47.6% | 47.1% |
| wide-line__drip__roster-order | 16 | 6 | 37.5% | 0 | 26.2s | 42.2% | 49.1% |
| wide-line__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.9s | 58.5% | 23.1% |
| wide-line__rapid__roster-order | 16 | 13 | 81.3% | 0 | 23.8s | 58.8% | 18.8% |
| wide-line__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 26.4s | 72.9% | 25.0% |
| wide-line__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.6s | 51.4% | 29.6% |
| center-column__rapid__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 23.4s | 48.6% | 38.5% |
| diamond__three-waves__roster-order | 15 | 12 | 80.0% | 0 | 22.7s | 54.7% | 20.0% |
| diamond__three-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 23.1s | 41.3% | 61.1% |
| dual-flank__rapid__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 24.2s | 62.1% | 20.0% |
| dual-flank__two-waves__roster-order | 15 | 7 | 46.7% | 0 | 25.8s | 52.8% | 47.7% |
| edge-sweep__burst__roster-order | 15 | 10 | 66.7% | 0 | 22.5s | 62.5% | 31.6% |
| edge-sweep__drip__roster-order | 15 | 14 | 93.3% | 0 | 31.2s | 69.0% | 5.1% |
| edge-sweep__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 27.1s | 47.8% | 39.5% |
| inverted-wedge__rapid__roster-order | 15 | 7 | 46.7% | 0 | 26.0s | 55.3% | 53.3% |
| left-flank__burst__roster-order | 15 | 10 | 66.7% | 0 | 23.8s | 50.7% | 30.2% |
| left-flank__burst__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 32.6s | 72.2% | 16.2% |
| left-flank__drip__roster-order | 15 | 8 | 53.3% | 0 | 28.2s | 60.0% | 45.3% |
| left-flank__drip__tank-front-support-rear | 15 | 14 | 93.3% | 0 | 34.3s | 77.1% | 6.7% |
| right-flank__three-waves__roster-order | 15 | 12 | 80.0% | 0 | 30.1s | 56.1% | 14.1% |
| three-lane__burst__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 27.0s | 58.0% | 35.0% |
| three-lane__drip__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 30.7s | 71.1% | 26.7% |
| three-lane__rapid__roster-order | 15 | 11 | 73.3% | 0 | 26.3s | 70.7% | 26.7% |
| vanguard-wedge__two-waves__roster-order | 15 | 8 | 53.3% | 0 | 26.5s | 58.3% | 40.5% |
| vanguard-wedge__two-waves__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 28.1s | 76.9% | 19.7% |
| wide-line__two-waves__tank-front-support-rear | 15 | 4 | 26.7% | 0 | 23.9s | 54.9% | 72.8% |
| center-column__burst__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 27.2s | 73.2% | 25.0% |
| center-column__drip__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 22.8s | 41.5% | 32.7% |
| center-column__rapid__roster-order | 12 | 5 | 41.7% | 0 | 30.3s | 58.1% | 58.2% |
| diamond__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 34.7s | 61.3% | 35.6% |
| dual-flank__rapid__roster-order | 12 | 8 | 66.7% | 0 | 24.1s | 50.6% | 31.7% |
| edge-sweep__three-waves__roster-order | 12 | 4 | 33.3% | 0 | 21.3s | 57.3% | 66.7% |
| inverted-wedge__burst__roster-order | 12 | 6 | 50.0% | 0 | 25.3s | 55.3% | 50.0% |
| inverted-wedge__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.5s | 67.0% | 33.3% |
| inverted-wedge__drip__roster-order | 12 | 9 | 75.0% | 0 | 33.9s | 71.6% | 18.9% |
| inverted-wedge__drip__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 25.6s | 46.2% | 30.9% |
| left-flank__three-waves__roster-order | 12 | 5 | 41.7% | 0 | 25.9s | 52.0% | 58.3% |
| left-flank__three-waves__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 30.2s | 73.0% | 21.7% |
| right-flank__two-waves__roster-order | 12 | 9 | 75.0% | 0 | 34.7s | 66.3% | 22.3% |
| right-flank__two-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 27.5s | 61.5% | 39.4% |
| three-lane__burst__roster-order | 12 | 9 | 75.0% | 0 | 22.8s | 49.6% | 22.3% |
| three-lane__drip__roster-order | 12 | 6 | 50.0% | 0 | 40.3s | 62.2% | 49.5% |
| three-lane__three-waves__tank-front-support-rear | 12 | 7 | 58.3% | 0 | 27.9s | 68.0% | 37.9% |
| vanguard-wedge__rapid__tank-front-support-rear | 12 | 4 | 33.3% | 0 | 28.9s | 49.4% | 60.0% |
| wide-line__rapid__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 22.1s | 44.2% | 54.6% |
| wide-line__two-waves__roster-order | 12 | 11 | 91.7% | 0 | 34.4s | 81.6% | 8.3% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 154 | 83 | 53.9% | 0 | 26.3s | 56.1% | 43.4% |
| dual-flank | 154 | 90 | 58.4% | 0 | 25.6s | 58.8% | 38.8% |
| vanguard-wedge | 154 | 95 | 61.7% | 0 | 27.3s | 57.0% | 35.3% |
| edge-sweep | 153 | 87 | 56.9% | 0 | 25.7s | 56.9% | 42.0% |
| right-flank | 151 | 94 | 62.3% | 0 | 27.5s | 57.0% | 33.4% |
| wide-line | 151 | 92 | 60.9% | 0 | 25.9s | 58.3% | 36.0% |
| left-flank | 148 | 98 | 66.2% | 0 | 28.0s | 60.4% | 32.5% |
| center-column | 147 | 86 | 58.5% | 0 | 26.5s | 58.4% | 39.2% |
| three-lane | 145 | 85 | 58.6% | 0 | 26.7s | 57.5% | 37.6% |
| inverted-wedge | 143 | 76 | 53.1% | 0 | 26.0s | 55.7% | 43.7% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 181 | 60.3% | 0 | 25.8s | 58.0% | 36.5% |
| drip | 300 | 184 | 61.3% | 0 | 28.3s | 58.1% | 35.7% |
| rapid | 300 | 171 | 57.0% | 0 | 25.5s | 57.3% | 41.3% |
| three-waves | 300 | 171 | 57.0% | 0 | 26.1s | 57.0% | 40.6% |
| two-waves | 300 | 179 | 59.7% | 0 | 27.0s | 57.7% | 36.8% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 445 | 59.3% | 0 | 26.5s | 58.0% | 38.3% |
| tank-front-support-rear | 750 | 441 | 58.8% | 0 | 26.6s | 57.3% | 38.0% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 862 | 516 | 59.9% | 0 | 29.3s | 65.0% | 38.5% |
| freeze-defense | 62 | 40 | 64.5% | 0 | 27.3s | 67.7% | 33.9% |
| rally-core | 62 | 38 | 61.3% | 0 | 14.9s | 6.4% | 26.9% |
| medkit-entry | 59 | 30 | 50.8% | 0 | 24.6s | 61.2% | 49.1% |
| rage-entry | 59 | 32 | 54.2% | 0 | 23.3s | 58.2% | 44.7% |
| cannon-focus | 58 | 30 | 51.7% | 0 | 25.5s | 61.4% | 47.5% |
| cannon-rally | 58 | 32 | 55.2% | 0 | 15.1s | 6.3% | 29.9% |
| rally-rage | 58 | 33 | 56.9% | 0 | 15.4s | 6.5% | 30.8% |
| skeleton-barrel | 58 | 33 | 56.9% | 0 | 26.7s | 63.3% | 43.0% |
| freeze-barrel | 55 | 34 | 61.8% | 0 | 25.4s | 67.3% | 37.0% |
| freeze-rage | 55 | 32 | 58.2% | 0 | 26.8s | 64.2% | 40.5% |
| cannon-medkit | 54 | 36 | 66.7% | 0 | 27.2s | 65.6% | 33.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 975 | 585 | 60.0% | 0 | 28.4s | 61.8% | 38.2% |
| epic | 179 | 106 | 59.2% | 0 | 24.3s | 49.4% | 36.0% |
| unrevealed | 176 | 100 | 56.8% | 0 | 22.3s | 50.4% | 39.7% |
| legendary | 170 | 95 | 55.9% | 0 | 22.4s | 49.8% | 38.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 980 | 585 | 59.7% | 0 | 28.4s | 62.4% | 38.3% |
| ward-2 | 180 | 107 | 59.4% | 0 | 22.9s | 48.8% | 36.9% |
| ward-1 | 170 | 100 | 58.8% | 0 | 23.3s | 49.8% | 37.7% |
| ward-3 | 170 | 94 | 55.3% | 0 | 23.0s | 47.3% | 39.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 886 | 59.1% | 0 | 26.5s | 57.6% | 38.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 547 | 319 | 58.3% | 0 | 21.4s | 54.3% | 38.7% |
| knight | 530 | 317 | 59.8% | 0 | 25.0s | 54.4% | 36.9% |
| demon_king | 526 | 332 | 63.1% | 0 | 24.5s | 56.4% | 33.1% |
| mage | 508 | 289 | 56.9% | 0 | 22.8s | 53.0% | 40.5% |
| mimic | 495 | 293 | 59.2% | 0 | 25.8s | 52.7% | 37.1% |
| archer | 475 | 268 | 56.4% | 0 | 25.6s | 51.9% | 40.9% |
| mechanical_dragon | 385 | 220 | 57.1% | 0 | 23.1s | 55.1% | 40.7% |
| pea_shooter | 346 | 197 | 56.9% | 0 | 24.2s | 52.9% | 41.1% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 57.0% | 47.2%-66.3% | 61.7% | 42.2% | 29.6% |
| demon_king | 100 | 72.0% | 62.5%-79.9% | 73.9% | 24.1% | 59.0% |
| fire_dragon | 100 | 64.0% | 54.2%-72.7% | 68.8% | 33.9% | 57.3% |
| knight | 100 | 60.0% | 50.2%-69.1% | 66.0% | 38.8% | 43.3% |
| mage | 100 | 55.0% | 45.2%-64.4% | 62.0% | 44.2% | 34.4% |
| mechanical_dragon | 100 | 60.0% | 50.2%-69.1% | 68.2% | 39.4% | 49.5% |
| mimic | 100 | 57.0% | 47.2%-66.3% | 59.5% | 41.0% | 50.0% |
| pea_shooter | 100 | 56.0% | 46.2%-65.3% | 61.7% | 43.2% | 34.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 100 | 57.0% | 47.2%-66.3% | 61.7% | 42.2% | 29.6% |
| demon_king\|TH6 | 100 | 72.0% | 62.5%-79.9% | 73.9% | 24.1% | 59.0% |
| fire_dragon\|TH6 | 100 | 64.0% | 54.2%-72.7% | 68.8% | 33.9% | 57.3% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 66.0% | 38.8% | 43.3% |
| mage\|TH6 | 100 | 55.0% | 45.2%-64.4% | 62.0% | 44.2% | 34.4% |
| mechanical_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 68.2% | 39.4% | 49.5% |
| mimic\|TH6 | 100 | 57.0% | 47.2%-66.3% | 59.5% | 41.0% | 50.0% |
| pea_shooter\|TH6 | 100 | 56.0% | 46.2%-65.3% | 61.7% | 43.2% | 34.1% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-asymmetric-right-099 | 6 | asymmetric-right | rushed-defense | 16 | 0.0% | 98.5% |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 16 | 0.0% | 97.5% |
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 16 | 0.0% | 97.3% |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 16 | 0.0% | 96.4% |
| th6-trap-lanes-082 | 6 | trap-lanes | rushed-defense | 16 | 0.0% | 96.2% |
| th6-trap-lanes-046 | 6 | trap-lanes | maxed | 16 | 0.0% | 96.1% |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 16 | 0.0% | 95.3% |
| th6-compact-core-091 | 6 | compact-core | maxed | 16 | 0.0% | 92.8% |
| th6-split-core-076 | 6 | split-core | rushed-defense | 16 | 0.0% | 91.1% |
| th6-split-core-040 | 6 | split-core | maxed | 15 | 0.0% | 98.3% |
| th6-resource-shield-006 | 6 | resource-shield | maxed | 15 | 0.0% | 97.2% |
| th6-layered-rings-057 | 6 | layered-rings | maxed | 15 | 0.0% | 97.2% |
| th6-layered-rings-003 | 6 | layered-rings | rushed-defense | 15 | 0.0% | 97.1% |
| th6-rear-keep-085 | 6 | rear-keep | maxed | 15 | 0.0% | 96.6% |
| th6-compact-core-001 | 6 | compact-core | maxed | 15 | 0.0% | 95.8% |

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

- **CRITICAL / unbreakable-base-probe:** 2/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.51x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 57.9% is outside 55.0% +/- 2.0% across 700 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / town-hall-target-band:** policy-exploration|TH6 has 57.9% attacker wins across 700 samples; authored target is 53.0%-57.0%.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-096 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-076 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-046 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-082 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-062 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-098 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-063 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-099 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-091 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-029 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-051 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-074 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-034 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-093 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th6-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-096 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-041 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-095 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-022 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-058 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-split-core-076 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-split-core-094 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-010 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-028 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-046 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-064 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-082 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-100 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-wide-spread-097 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-asymmetric-left-044 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-062 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-098 has 0.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-009 has 0.0% attacker wins across 15 samples.
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
- **INFO / fragile-base:** th6-corner-keep-083 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-015 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-033 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-crossfire-051 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-069 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-074 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-defense-ring-092 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-diamond-030 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-diamond-066 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-left-016 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-echelon-left-034 has 0.0% attacker wins across 14 samples.
- 17 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
