# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:36:52.263Z
**Seed:** 61005
**Town Halls:** TH5
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 700
**Unbeaten non-adaptive bases (n >= 12):** 24
**Breakability probe:** 1700 calibration + gate battles; 1/100 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 69.2s

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
- Troop simulation coverage: 7/7
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH5=100/100
- Bases exercised: 100/100

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1500 | 817 | 54.5% | 0 | 26.1s | 48.1% | 40.2% | 34.9% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 1

| Base | TH | Archetype | Progression | Elite Attacks |
|---|---:|---|---|---:|
| th5-layered-rings-093 | 5 | layered-rings | rushed-defense | 8 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 1500 | 817 | 54.5% | 0 | 26.1s | 48.1% | 40.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 91 | 39 | 42.9% | 0 | 24.5s | 47.7% | 51.9% |
| asymmetric-right | 91 | 41 | 45.1% | 0 | 26.2s | 49.1% | 48.0% |
| trap-lanes | 91 | 61 | 67.0% | 0 | 26.2s | 51.3% | 30.4% |
| resource-shield | 90 | 38 | 42.2% | 0 | 26.5s | 44.2% | 49.3% |
| southern-funnel | 90 | 56 | 62.2% | 0 | 22.6s | 47.0% | 36.1% |
| wide-spread | 90 | 65 | 72.2% | 0 | 29.2s | 55.2% | 24.1% |
| compact-core | 89 | 37 | 41.6% | 0 | 26.6s | 45.1% | 51.5% |
| defense-ring | 89 | 45 | 50.6% | 0 | 28.0s | 51.0% | 41.4% |
| layered-rings | 89 | 39 | 43.8% | 0 | 23.7s | 46.1% | 50.4% |
| split-core | 89 | 52 | 58.4% | 0 | 22.8s | 48.2% | 36.7% |
| corner-keep | 76 | 37 | 48.7% | 0 | 26.1s | 48.1% | 42.5% |
| diamond | 76 | 27 | 35.5% | 0 | 24.6s | 44.9% | 56.1% |
| rear-keep | 76 | 44 | 57.9% | 0 | 27.4s | 46.1% | 37.6% |
| cannon-screen | 75 | 54 | 72.0% | 0 | 31.2s | 50.9% | 26.8% |
| crossfire | 75 | 43 | 57.3% | 0 | 23.5s | 44.1% | 39.9% |
| echelon-left | 75 | 44 | 58.7% | 0 | 27.3s | 48.8% | 35.4% |
| echelon-right | 74 | 47 | 63.5% | 0 | 28.8s | 48.8% | 30.8% |
| kill-corridor | 74 | 48 | 64.9% | 0 | 25.9s | 49.2% | 31.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH5 | 91 | 39 | 42.9% | 0 | 24.5s | 47.7% | 51.9% |
| asymmetric-right\|TH5 | 91 | 41 | 45.1% | 0 | 26.2s | 49.1% | 48.0% |
| trap-lanes\|TH5 | 91 | 61 | 67.0% | 0 | 26.2s | 51.3% | 30.4% |
| resource-shield\|TH5 | 90 | 38 | 42.2% | 0 | 26.5s | 44.2% | 49.3% |
| southern-funnel\|TH5 | 90 | 56 | 62.2% | 0 | 22.6s | 47.0% | 36.1% |
| wide-spread\|TH5 | 90 | 65 | 72.2% | 0 | 29.2s | 55.2% | 24.1% |
| compact-core\|TH5 | 89 | 37 | 41.6% | 0 | 26.6s | 45.1% | 51.5% |
| defense-ring\|TH5 | 89 | 45 | 50.6% | 0 | 28.0s | 51.0% | 41.4% |
| layered-rings\|TH5 | 89 | 39 | 43.8% | 0 | 23.7s | 46.1% | 50.4% |
| split-core\|TH5 | 89 | 52 | 58.4% | 0 | 22.8s | 48.2% | 36.7% |
| corner-keep\|TH5 | 76 | 37 | 48.7% | 0 | 26.1s | 48.1% | 42.5% |
| diamond\|TH5 | 76 | 27 | 35.5% | 0 | 24.6s | 44.9% | 56.1% |
| rear-keep\|TH5 | 76 | 44 | 57.9% | 0 | 27.4s | 46.1% | 37.6% |
| cannon-screen\|TH5 | 75 | 54 | 72.0% | 0 | 31.2s | 50.9% | 26.8% |
| crossfire\|TH5 | 75 | 43 | 57.3% | 0 | 23.5s | 44.1% | 39.9% |
| echelon-left\|TH5 | 75 | 44 | 58.7% | 0 | 27.3s | 48.8% | 35.4% |
| echelon-right\|TH5 | 74 | 47 | 63.5% | 0 | 28.8s | 48.8% | 30.8% |
| kill-corridor\|TH5 | 74 | 48 | 64.9% | 0 | 25.9s | 49.2% | 31.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 316 | 28 | 8.9% | 0 | 21.0s | 32.6% | 83.3% |
| mid | 305 | 214 | 70.2% | 0 | 34.3s | 54.7% | 20.4% |
| maxed | 303 | 16 | 5.3% | 0 | 23.3s | 21.1% | 87.9% |
| rushed-economy | 300 | 300 | 100.0% | 0 | 26.2s | 68.4% | 0.0% |
| mixed | 276 | 259 | 93.8% | 0 | 26.0s | 66.3% | 4.2% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 800 | 428 | 53.5% | 0 | 22.4s | 34.4% | 37.9% |
| pure-unit-matrix | 700 | 389 | 55.6% | 0 | 30.3s | 63.9% | 42.9% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH5 | 800 | 428 | 53.5% | 0 | 22.4s | 34.4% | 37.9% |
| pure-unit-matrix\|TH5 | 700 | 389 | 55.6% | 0 | 30.3s | 63.9% | 42.9% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 700 | 389 | 55.6% | 0 | 30.3s | 63.9% | 42.9% |
| policy-exploration\|rally-core | 221 | 128 | 57.9% | 0 | 15.6s | 5.6% | 26.4% |
| policy-exploration\|cannon-focus | 213 | 116 | 54.5% | 0 | 30.0s | 63.8% | 43.7% |
| policy-exploration\|cannon-rally | 188 | 85 | 45.2% | 0 | 14.8s | 6.0% | 40.6% |
| policy-exploration\|none | 178 | 99 | 55.6% | 0 | 30.0s | 64.8% | 42.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|diamond | 90 | 28 | 31.1% | 0 | 18.5s | 34.6% | 62.1% |
| policy-exploration\|inverted-wedge | 90 | 21 | 23.3% | 0 | 23.7s | 20.4% | 63.7% |
| policy-exploration\|vanguard-wedge | 90 | 43 | 47.8% | 0 | 27.3s | 35.9% | 38.7% |
| policy-exploration\|edge-sweep | 80 | 47 | 58.8% | 0 | 21.0s | 34.7% | 36.4% |
| policy-exploration\|three-lane | 80 | 74 | 92.5% | 0 | 20.0s | 41.2% | 6.6% |
| policy-exploration\|center-column | 75 | 31 | 41.3% | 0 | 19.1s | 30.9% | 47.7% |
| policy-exploration\|dual-flank | 75 | 45 | 60.0% | 0 | 19.7s | 36.9% | 31.5% |
| policy-exploration\|right-flank | 75 | 28 | 37.3% | 0 | 30.5s | 30.5% | 48.6% |
| policy-exploration\|wide-line | 75 | 68 | 90.7% | 0 | 20.6s | 49.6% | 9.0% |
| policy-exploration\|left-flank | 70 | 43 | 61.4% | 0 | 24.2s | 30.6% | 25.8% |
| pure-unit-matrix\|center-column | 70 | 48 | 68.6% | 0 | 30.4s | 71.0% | 30.8% |
| pure-unit-matrix\|diamond | 70 | 38 | 54.3% | 0 | 29.6s | 63.3% | 44.0% |
| pure-unit-matrix\|dual-flank | 70 | 32 | 45.7% | 0 | 29.8s | 62.1% | 52.0% |
| pure-unit-matrix\|edge-sweep | 70 | 43 | 61.4% | 0 | 28.4s | 67.1% | 38.2% |
| pure-unit-matrix\|inverted-wedge | 70 | 34 | 48.6% | 0 | 29.1s | 55.9% | 50.3% |
| pure-unit-matrix\|left-flank | 70 | 40 | 57.1% | 0 | 32.5s | 63.5% | 38.6% |
| pure-unit-matrix\|right-flank | 70 | 42 | 60.0% | 0 | 32.2s | 66.2% | 38.1% |
| pure-unit-matrix\|three-lane | 70 | 39 | 55.7% | 0 | 29.6s | 65.3% | 43.9% |
| pure-unit-matrix\|vanguard-wedge | 70 | 39 | 55.7% | 0 | 34.5s | 63.1% | 43.9% |
| pure-unit-matrix\|wide-line | 70 | 34 | 48.6% | 0 | 27.2s | 61.3% | 49.2% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 160 | 83 | 51.9% | 0 | 22.6s | 35.1% | 37.8% |
| policy-exploration\|drip | 160 | 75 | 46.9% | 0 | 21.6s | 31.4% | 46.5% |
| policy-exploration\|rapid | 160 | 88 | 55.0% | 0 | 24.1s | 36.2% | 35.9% |
| policy-exploration\|three-waves | 160 | 88 | 55.0% | 0 | 21.6s | 33.7% | 37.1% |
| policy-exploration\|two-waves | 160 | 94 | 58.8% | 0 | 22.2s | 35.4% | 32.2% |
| pure-unit-matrix\|burst | 140 | 82 | 58.6% | 0 | 30.2s | 66.8% | 39.1% |
| pure-unit-matrix\|drip | 140 | 78 | 55.7% | 0 | 30.8s | 64.7% | 43.3% |
| pure-unit-matrix\|rapid | 140 | 71 | 50.7% | 0 | 29.1s | 61.6% | 47.0% |
| pure-unit-matrix\|three-waves | 140 | 70 | 50.0% | 0 | 29.7s | 60.0% | 48.7% |
| pure-unit-matrix\|two-waves | 140 | 88 | 62.9% | 0 | 31.8s | 66.4% | 36.4% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 400 | 216 | 54.0% | 0 | 22.5s | 38.6% | 39.3% |
| policy-exploration\|tank-front-support-rear | 400 | 212 | 53.0% | 0 | 22.4s | 30.1% | 36.4% |
| pure-unit-matrix\|roster-order | 350 | 194 | 55.4% | 0 | 30.1s | 64.4% | 43.1% |
| pure-unit-matrix\|tank-front-support-rear | 350 | 195 | 55.7% | 0 | 30.6s | 63.4% | 42.7% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 140 | 61 | 43.6% | 0 | 31.5s | 50.4% | 51.9% |
| pure-demon_king | 140 | 99 | 70.7% | 0 | 30.0s | 67.5% | 24.4% |
| pure-fire_dragon | 140 | 79 | 56.4% | 0 | 20.0s | 57.7% | 39.8% |
| pure-knight | 140 | 88 | 62.9% | 0 | 34.7s | 57.6% | 35.1% |
| pure-mimic | 140 | 70 | 50.0% | 0 | 31.9s | 48.0% | 46.1% |
| pure-pea_shooter | 140 | 73 | 52.1% | 0 | 26.7s | 53.8% | 43.5% |
| pure-mage | 136 | 55 | 40.4% | 0 | 23.0s | 49.3% | 57.4% |
| random-5 | 45 | 27 | 60.0% | 0 | 25.1s | 52.3% | 37.2% |
| random-2 | 44 | 28 | 63.6% | 0 | 21.3s | 24.1% | 24.0% |
| random-3 | 44 | 26 | 59.1% | 0 | 30.7s | 45.9% | 38.5% |
| random-4 | 44 | 27 | 61.4% | 0 | 19.8s | 25.2% | 26.7% |
| random-6 | 41 | 15 | 36.6% | 0 | 17.1s | 12.1% | 39.1% |
| frontline-ranged | 40 | 20 | 50.0% | 0 | 19.1s | 41.4% | 46.7% |
| melee-pressure | 40 | 24 | 60.0% | 0 | 23.5s | 30.9% | 25.6% |
| random-1 | 40 | 24 | 60.0% | 0 | 25.6s | 57.6% | 35.3% |
| support-mix | 40 | 20 | 50.0% | 0 | 18.7s | 26.8% | 41.6% |
| trap-runner-mix | 40 | 27 | 67.5% | 0 | 27.5s | 49.2% | 27.2% |
| ranged-pressure | 36 | 17 | 47.2% | 0 | 20.2s | 45.6% | 45.4% |
| balanced | 35 | 17 | 48.6% | 0 | 21.4s | 31.8% | 45.4% |
| hero-necro-dragon-mages | 35 | 20 | 57.1% | 0 | 14.7s | 16.6% | 38.6% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 14 | 87.5% | 0 | 26.5s | 62.6% | 9.5% |
| center-column__drip__roster-order | 16 | 5 | 31.3% | 0 | 21.1s | 45.6% | 63.5% |
| center-column__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 29.2s | 52.2% | 38.5% |
| center-column__rapid__roster-order | 16 | 10 | 62.5% | 0 | 27.3s | 53.2% | 28.5% |
| center-column__rapid__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 25.9s | 66.1% | 17.4% |
| center-column__three-waves__roster-order | 16 | 3 | 18.8% | 0 | 20.5s | 35.2% | 76.4% |
| center-column__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.6s | 42.5% | 44.2% |
| diamond__burst__roster-order | 16 | 8 | 50.0% | 0 | 24.9s | 61.5% | 50.0% |
| diamond__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 27.3s | 70.9% | 25.0% |
| diamond__drip__roster-order | 16 | 4 | 25.0% | 0 | 21.8s | 46.3% | 68.1% |
| diamond__drip__tank-front-support-rear | 16 | 2 | 12.5% | 0 | 17.0s | 20.9% | 81.4% |
| diamond__rapid__roster-order | 16 | 6 | 37.5% | 0 | 23.4s | 41.4% | 60.7% |
| diamond__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 20.5s | 29.7% | 43.5% |
| diamond__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 26.8s | 69.6% | 43.6% |
| diamond__three-waves__tank-front-support-rear | 16 | 2 | 12.5% | 0 | 23.7s | 45.3% | 83.0% |
| diamond__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 19.2s | 35.9% | 29.3% |
| diamond__two-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 29.0s | 49.7% | 56.9% |
| dual-flank__burst__roster-order | 16 | 6 | 37.5% | 0 | 20.1s | 33.3% | 57.8% |
| dual-flank__drip__roster-order | 16 | 10 | 62.5% | 0 | 33.4s | 72.9% | 33.8% |
| dual-flank__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 26.4s | 69.3% | 32.8% |
| dual-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 21.3s | 46.1% | 49.2% |
| dual-flank__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 26.2s | 55.1% | 62.7% |
| dual-flank__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 22.1s | 34.5% | 27.8% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 19.9s | 34.4% | 15.4% |
| edge-sweep__burst__roster-order | 16 | 8 | 50.0% | 0 | 24.3s | 59.6% | 50.0% |
| edge-sweep__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.9s | 50.2% | 48.2% |
| edge-sweep__drip__roster-order | 16 | 13 | 81.3% | 0 | 26.7s | 56.5% | 14.8% |
| edge-sweep__rapid__roster-order | 16 | 6 | 37.5% | 0 | 21.9s | 42.9% | 60.0% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 20.3s | 28.7% | 35.9% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 28.3s | 57.3% | 11.5% |
| edge-sweep__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.1s | 45.7% | 42.1% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.7s | 51.5% | 30.9% |
| inverted-wedge__burst__roster-order | 16 | 6 | 37.5% | 0 | 29.4s | 39.2% | 46.1% |
| inverted-wedge__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 26.5s | 25.7% | 42.3% |
| inverted-wedge__drip__roster-order | 16 | 5 | 31.3% | 0 | 24.1s | 33.6% | 68.8% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 2 | 12.5% | 0 | 22.1s | 32.4% | 81.8% |
| inverted-wedge__rapid__roster-order | 16 | 7 | 43.8% | 0 | 27.1s | 42.5% | 46.8% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 30.1s | 42.5% | 57.4% |
| inverted-wedge__three-waves__roster-order | 16 | 2 | 12.5% | 0 | 21.6s | 22.6% | 81.4% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 19.8s | 25.4% | 51.4% |
| inverted-wedge__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 35.8s | 48.2% | 62.2% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.1s | 46.9% | 40.3% |
| left-flank__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 36.6s | 46.0% | 31.9% |
| left-flank__drip__roster-order | 16 | 7 | 43.8% | 0 | 28.0s | 29.8% | 48.7% |
| left-flank__rapid__roster-order | 16 | 8 | 50.0% | 0 | 22.8s | 38.3% | 41.1% |
| left-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 29.8s | 45.4% | 15.2% |
| left-flank__two-waves__roster-order | 16 | 14 | 87.5% | 0 | 28.5s | 57.0% | 12.5% |
| left-flank__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.9s | 56.8% | 17.9% |
| right-flank__burst__roster-order | 16 | 10 | 62.5% | 0 | 30.1s | 49.9% | 32.6% |
| right-flank__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 33.5s | 67.0% | 34.0% |
| right-flank__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 26.5s | 41.2% | 37.3% |
| right-flank__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 39.1s | 42.2% | 38.7% |
| right-flank__three-waves__roster-order | 16 | 7 | 43.8% | 0 | 33.9s | 41.6% | 48.1% |
| right-flank__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 34.2s | 50.7% | 66.9% |
| right-flank__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 26.3s | 34.0% | 30.8% |
| three-lane__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 21.6s | 39.0% | 18.1% |
| three-lane__drip__roster-order | 16 | 11 | 68.8% | 0 | 20.2s | 37.5% | 31.3% |
| three-lane__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 20.7s | 35.2% | 22.4% |
| three-lane__rapid__roster-order | 16 | 12 | 75.0% | 0 | 17.4s | 32.6% | 25.0% |
| three-lane__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 24.4s | 71.3% | 31.3% |
| three-lane__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 21.5s | 33.3% | 29.1% |
| three-lane__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 31.1s | 69.5% | 36.6% |
| three-lane__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 32.8s | 83.4% | 12.5% |
| vanguard-wedge__burst__roster-order | 16 | 8 | 50.0% | 0 | 22.8s | 33.6% | 39.2% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 28.2s | 40.5% | 63.3% |
| vanguard-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 36.7s | 66.3% | 40.6% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 36.3s | 47.8% | 41.4% |
| vanguard-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 35.8s | 69.2% | 33.6% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 34.4s | 65.4% | 48.6% |
| vanguard-wedge__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 23.7s | 32.0% | 22.3% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 30.1s | 42.4% | 45.3% |
| vanguard-wedge__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 36.1s | 51.0% | 37.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 20.1s | 29.6% | 38.3% |
| wide-line__burst__roster-order | 16 | 15 | 93.8% | 0 | 23.7s | 63.4% | 6.3% |
| wide-line__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.0s | 45.2% | 43.8% |
| wide-line__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 19.8s | 33.0% | 61.3% |
| wide-line__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.0s | 50.1% | 28.1% |
| wide-line__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 21.4s | 57.4% | 30.7% |
| wide-line__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 22.5s | 46.8% | 31.3% |
| wide-line__two-waves__roster-order | 16 | 15 | 93.8% | 0 | 24.6s | 62.2% | 6.3% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 160 | 66 | 41.3% | 0 | 23.3s | 47.1% | 54.2% |
| inverted-wedge | 160 | 55 | 34.4% | 0 | 26.1s | 35.9% | 57.8% |
| vanguard-wedge | 160 | 82 | 51.2% | 0 | 30.4s | 47.8% | 41.0% |
| edge-sweep | 150 | 90 | 60.0% | 0 | 24.4s | 49.8% | 37.2% |
| three-lane | 150 | 113 | 75.3% | 0 | 24.5s | 52.5% | 24.0% |
| center-column | 145 | 79 | 54.5% | 0 | 24.6s | 50.3% | 39.6% |
| dual-flank | 145 | 77 | 53.1% | 0 | 24.6s | 49.1% | 41.4% |
| right-flank | 145 | 70 | 48.3% | 0 | 31.3s | 47.7% | 43.5% |
| wide-line | 145 | 102 | 70.3% | 0 | 23.7s | 55.3% | 28.4% |
| left-flank | 140 | 83 | 59.3% | 0 | 28.3s | 47.2% | 32.2% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 165 | 55.0% | 0 | 26.2s | 49.9% | 38.4% |
| drip | 300 | 153 | 51.0% | 0 | 25.9s | 46.9% | 45.0% |
| rapid | 300 | 159 | 53.0% | 0 | 26.5s | 48.0% | 41.1% |
| three-waves | 300 | 158 | 52.7% | 0 | 25.4s | 46.0% | 42.5% |
| two-waves | 300 | 182 | 60.7% | 0 | 26.6s | 49.9% | 34.1% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 410 | 54.7% | 0 | 26.0s | 50.6% | 41.1% |
| tank-front-support-rear | 750 | 407 | 54.3% | 0 | 26.2s | 45.6% | 39.3% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 878 | 488 | 55.6% | 0 | 30.3s | 64.1% | 42.8% |
| rally-core | 221 | 128 | 57.9% | 0 | 15.6s | 5.6% | 26.4% |
| cannon-focus | 213 | 116 | 54.5% | 0 | 30.0s | 63.8% | 43.7% |
| cannon-rally | 188 | 85 | 45.2% | 0 | 14.8s | 6.0% | 40.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 904 | 487 | 53.9% | 0 | 28.7s | 56.4% | 43.0% |
| epic | 206 | 110 | 53.4% | 0 | 21.8s | 34.8% | 36.1% |
| unrevealed | 204 | 107 | 52.5% | 0 | 22.3s | 37.5% | 39.3% |
| legendary | 186 | 113 | 60.8% | 0 | 22.5s | 34.3% | 32.2% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 880 | 495 | 56.3% | 0 | 28.7s | 57.9% | 40.8% |
| ward-1 | 220 | 123 | 55.9% | 0 | 22.4s | 34.1% | 37.3% |
| ward-3 | 220 | 107 | 48.6% | 0 | 22.2s | 32.6% | 43.3% |
| ward-2 | 180 | 92 | 51.1% | 0 | 22.9s | 36.4% | 37.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 817 | 54.5% | 0 | 26.1s | 48.1% | 40.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king | 628 | 374 | 59.6% | 0 | 23.9s | 42.1% | 32.8% |
| knight | 628 | 363 | 57.8% | 0 | 25.0s | 39.9% | 35.2% |
| fire_dragon | 624 | 347 | 55.6% | 0 | 21.5s | 40.8% | 37.5% |
| mage | 620 | 323 | 52.1% | 0 | 22.2s | 38.8% | 41.3% |
| mimic | 593 | 325 | 54.8% | 0 | 24.9s | 39.0% | 37.6% |
| archer | 589 | 309 | 52.5% | 0 | 24.6s | 40.5% | 40.3% |
| pea_shooter | 434 | 237 | 54.6% | 0 | 24.1s | 42.7% | 37.6% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 48.0% | 38.5%-57.7% | 62.1% | 50.6% | 31.8% |
| demon_king | 100 | 70.0% | 60.4%-78.1% | 75.2% | 26.1% | 56.6% |
| fire_dragon | 100 | 60.0% | 50.2%-69.1% | 68.8% | 37.9% | 50.5% |
| knight | 100 | 62.0% | 52.2%-70.9% | 64.3% | 37.6% | 38.7% |
| mage | 100 | 46.0% | 36.6%-55.7% | 58.6% | 53.2% | 29.5% |
| mimic | 100 | 49.0% | 39.4%-58.7% | 55.9% | 50.2% | 39.7% |
| pea_shooter | 100 | 54.0% | 44.3%-63.4% | 62.4% | 44.6% | 33.2% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 48.0% | 38.5%-57.7% | 62.1% | 50.6% | 31.8% |
| demon_king\|TH5 | 100 | 70.0% | 60.4%-78.1% | 75.2% | 26.1% | 56.6% |
| fire_dragon\|TH5 | 100 | 60.0% | 50.2%-69.1% | 68.8% | 37.9% | 50.5% |
| knight\|TH5 | 100 | 62.0% | 52.2%-70.9% | 64.3% | 37.6% | 38.7% |
| mage\|TH5 | 100 | 46.0% | 36.6%-55.7% | 58.6% | 53.2% | 29.5% |
| mimic\|TH5 | 100 | 49.0% | 39.4%-58.7% | 55.9% | 50.2% | 39.7% |
| pea_shooter\|TH5 | 100 | 54.0% | 44.3%-63.4% | 62.4% | 44.6% | 33.2% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 16 | 0.0% | 92.5% |
| th5-asymmetric-left-098 | 5 | asymmetric-left | rushed-defense | 16 | 0.0% | 91.4% |
| th5-resource-shield-096 | 5 | resource-shield | maxed | 16 | 0.0% | 83.6% |
| th5-southern-funnel-023 | 5 | southern-funnel | maxed | 15 | 0.0% | 98.9% |
| th5-crossfire-051 | 5 | crossfire | maxed | 15 | 0.0% | 98.9% |
| th5-layered-rings-057 | 5 | layered-rings | maxed | 15 | 0.0% | 98.0% |
| th5-asymmetric-left-008 | 5 | asymmetric-left | rushed-defense | 15 | 0.0% | 96.0% |
| th5-asymmetric-right-009 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 95.4% |
| th5-defense-ring-020 | 5 | defense-ring | rushed-defense | 15 | 0.0% | 94.3% |
| th5-corner-keep-029 | 5 | corner-keep | maxed | 15 | 0.0% | 93.9% |
| th5-compact-core-091 | 5 | compact-core | maxed | 15 | 0.0% | 93.0% |
| th5-split-core-076 | 5 | split-core | rushed-defense | 15 | 0.0% | 92.7% |
| th5-split-core-040 | 5 | split-core | maxed | 15 | 0.0% | 91.7% |
| th5-asymmetric-right-099 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 91.5% |
| th5-echelon-left-034 | 5 | echelon-left | maxed | 15 | 0.0% | 91.4% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 6,417 | 4,805.71 | 1,604.25 | 1,201.43 |  |
| fire_dragon | 7 | 10 | 14,400 | 6,428.57 | 1,440 | 642.86 |  |
| archer | 7 | 1 | 1,764 | 609.68 | 1,764 | 609.68 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| mechanical_dragon | 7 | 4 | 6,000 | 1,700.97 | 1,500 | 425.24 | chain x3 |
| demon_king | 7 | 5 | 19,380 | 2,096.67 | 3,876 | 419.33 |  |
| knight | 7 | 1 | 3,420 | 370 | 3,420 | 370 |  |
| mimic | 7 | 6 | 17,160 | 1,269.81 | 2,860 | 211.64 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / unbreakable-base-probe:** 1/100 bases survived every one of 8 elite same-TH attack policies.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.04x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-098 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-063 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-099 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-029 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-065 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-051 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-074 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-048 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-034 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-044 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-098 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-009 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-045 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-063 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-099 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-055 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-compact-core-073 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-091 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-029 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-065 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-083 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-crossfire-051 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-074 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-048 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-066 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-echelon-left-034 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-089 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-072 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-039 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-093 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-095 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-022 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- 4 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
