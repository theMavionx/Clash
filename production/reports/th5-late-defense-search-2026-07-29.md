# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:40:12.239Z
**Seed:** 62005
**Town Halls:** TH5
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 700
**Unbeaten non-adaptive bases (n >= 12):** 18
**Breakability probe:** 1700 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.95x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 80.0s

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
| 1500 | 849 | 56.6% | 0 | 27.1s | 49.0% | 38.0% | 37.1% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases. Each generated base was then attacked by up to 8 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Hard-base calibration battles: 900
- Full-catalog gate battles: 800
- Total breakability battles: 1700
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 1500 | 849 | 56.6% | 0 | 27.1s | 49.0% | 38.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 91 | 41 | 45.1% | 0 | 26.9s | 49.1% | 48.6% |
| asymmetric-right | 91 | 44 | 48.4% | 0 | 27.1s | 49.2% | 48.4% |
| trap-lanes | 91 | 66 | 72.5% | 0 | 28.5s | 54.5% | 24.7% |
| resource-shield | 90 | 39 | 43.3% | 0 | 26.8s | 48.6% | 47.2% |
| southern-funnel | 90 | 61 | 67.8% | 0 | 23.7s | 46.9% | 29.8% |
| wide-spread | 90 | 58 | 64.4% | 0 | 29.4s | 53.3% | 31.4% |
| compact-core | 89 | 40 | 44.9% | 0 | 25.7s | 46.3% | 49.3% |
| defense-ring | 89 | 45 | 50.6% | 0 | 26.6s | 47.4% | 41.3% |
| layered-rings | 89 | 41 | 46.1% | 0 | 27.4s | 48.4% | 42.3% |
| split-core | 89 | 52 | 58.4% | 0 | 23.1s | 49.4% | 36.6% |
| corner-keep | 76 | 42 | 55.3% | 0 | 28.0s | 52.2% | 39.2% |
| diamond | 76 | 35 | 46.1% | 0 | 29.8s | 47.4% | 45.1% |
| rear-keep | 76 | 40 | 52.6% | 0 | 25.1s | 45.2% | 42.2% |
| cannon-screen | 75 | 58 | 77.3% | 0 | 29.4s | 51.0% | 20.7% |
| crossfire | 75 | 46 | 61.3% | 0 | 25.5s | 45.6% | 36.5% |
| echelon-left | 75 | 50 | 66.7% | 0 | 27.4s | 49.4% | 31.1% |
| echelon-right | 74 | 45 | 60.8% | 0 | 26.8s | 43.9% | 36.5% |
| kill-corridor | 74 | 46 | 62.2% | 0 | 32.1s | 52.3% | 28.9% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH5 | 91 | 41 | 45.1% | 0 | 26.9s | 49.1% | 48.6% |
| asymmetric-right\|TH5 | 91 | 44 | 48.4% | 0 | 27.1s | 49.2% | 48.4% |
| trap-lanes\|TH5 | 91 | 66 | 72.5% | 0 | 28.5s | 54.5% | 24.7% |
| resource-shield\|TH5 | 90 | 39 | 43.3% | 0 | 26.8s | 48.6% | 47.2% |
| southern-funnel\|TH5 | 90 | 61 | 67.8% | 0 | 23.7s | 46.9% | 29.8% |
| wide-spread\|TH5 | 90 | 58 | 64.4% | 0 | 29.4s | 53.3% | 31.4% |
| compact-core\|TH5 | 89 | 40 | 44.9% | 0 | 25.7s | 46.3% | 49.3% |
| defense-ring\|TH5 | 89 | 45 | 50.6% | 0 | 26.6s | 47.4% | 41.3% |
| layered-rings\|TH5 | 89 | 41 | 46.1% | 0 | 27.4s | 48.4% | 42.3% |
| split-core\|TH5 | 89 | 52 | 58.4% | 0 | 23.1s | 49.4% | 36.6% |
| corner-keep\|TH5 | 76 | 42 | 55.3% | 0 | 28.0s | 52.2% | 39.2% |
| diamond\|TH5 | 76 | 35 | 46.1% | 0 | 29.8s | 47.4% | 45.1% |
| rear-keep\|TH5 | 76 | 40 | 52.6% | 0 | 25.1s | 45.2% | 42.2% |
| cannon-screen\|TH5 | 75 | 58 | 77.3% | 0 | 29.4s | 51.0% | 20.7% |
| crossfire\|TH5 | 75 | 46 | 61.3% | 0 | 25.5s | 45.6% | 36.5% |
| echelon-left\|TH5 | 75 | 50 | 66.7% | 0 | 27.4s | 49.4% | 31.1% |
| echelon-right\|TH5 | 74 | 45 | 60.8% | 0 | 26.8s | 43.9% | 36.5% |
| kill-corridor\|TH5 | 74 | 46 | 62.2% | 0 | 32.1s | 52.3% | 28.9% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 316 | 37 | 11.7% | 0 | 22.3s | 35.6% | 79.0% |
| mid | 305 | 235 | 77.0% | 0 | 34.9s | 57.1% | 17.1% |
| maxed | 303 | 20 | 6.6% | 0 | 23.9s | 21.7% | 84.6% |
| rushed-economy | 300 | 300 | 100.0% | 0 | 27.3s | 67.9% | 0.0% |
| mixed | 276 | 257 | 93.1% | 0 | 27.4s | 64.4% | 4.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 800 | 453 | 56.6% | 0 | 23.2s | 34.9% | 34.3% |
| pure-unit-matrix | 700 | 396 | 56.6% | 0 | 31.6s | 65.0% | 42.2% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH5 | 800 | 453 | 56.6% | 0 | 23.2s | 34.9% | 34.3% |
| pure-unit-matrix\|TH5 | 700 | 396 | 56.6% | 0 | 31.6s | 65.0% | 42.2% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 700 | 396 | 56.6% | 0 | 31.6s | 65.0% | 42.2% |
| policy-exploration\|cannon-focus | 201 | 105 | 52.2% | 0 | 30.7s | 65.0% | 46.3% |
| policy-exploration\|cannon-rally | 200 | 130 | 65.0% | 0 | 15.7s | 5.0% | 20.8% |
| policy-exploration\|rally-core | 200 | 110 | 55.0% | 0 | 16.1s | 5.8% | 26.4% |
| policy-exploration\|none | 199 | 108 | 54.3% | 0 | 30.4s | 63.9% | 43.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|inverted-wedge | 85 | 40 | 47.1% | 0 | 26.9s | 35.5% | 44.1% |
| policy-exploration\|vanguard-wedge | 85 | 55 | 64.7% | 0 | 23.9s | 33.7% | 23.4% |
| policy-exploration\|diamond | 80 | 52 | 65.0% | 0 | 22.8s | 42.2% | 29.5% |
| policy-exploration\|dual-flank | 80 | 38 | 47.5% | 0 | 20.0s | 27.2% | 41.4% |
| policy-exploration\|edge-sweep | 80 | 40 | 50.0% | 0 | 22.1s | 32.2% | 44.4% |
| policy-exploration\|left-flank | 80 | 55 | 68.8% | 0 | 24.1s | 32.2% | 22.6% |
| policy-exploration\|right-flank | 80 | 49 | 61.3% | 0 | 24.6s | 34.1% | 31.8% |
| policy-exploration\|three-lane | 80 | 40 | 50.0% | 0 | 19.7s | 38.3% | 40.9% |
| policy-exploration\|center-column | 75 | 45 | 60.0% | 0 | 24.5s | 38.2% | 31.1% |
| policy-exploration\|wide-line | 75 | 39 | 52.0% | 0 | 23.3s | 36.1% | 34.2% |
| pure-unit-matrix\|center-column | 70 | 33 | 47.1% | 0 | 30.6s | 60.4% | 51.9% |
| pure-unit-matrix\|diamond | 70 | 38 | 54.3% | 0 | 29.6s | 65.0% | 45.5% |
| pure-unit-matrix\|dual-flank | 70 | 40 | 57.1% | 0 | 29.4s | 65.8% | 42.6% |
| pure-unit-matrix\|edge-sweep | 70 | 41 | 58.6% | 0 | 30.8s | 67.3% | 40.5% |
| pure-unit-matrix\|inverted-wedge | 70 | 33 | 47.1% | 0 | 30.8s | 59.5% | 51.3% |
| pure-unit-matrix\|left-flank | 70 | 46 | 65.7% | 0 | 33.8s | 62.5% | 32.9% |
| pure-unit-matrix\|right-flank | 70 | 42 | 60.0% | 0 | 36.7s | 65.6% | 36.0% |
| pure-unit-matrix\|three-lane | 70 | 41 | 58.6% | 0 | 29.1s | 68.3% | 40.5% |
| pure-unit-matrix\|vanguard-wedge | 70 | 41 | 58.6% | 0 | 33.7s | 67.4% | 39.9% |
| pure-unit-matrix\|wide-line | 70 | 41 | 58.6% | 0 | 31.2s | 68.1% | 40.8% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 160 | 95 | 59.4% | 0 | 21.6s | 36.7% | 31.6% |
| policy-exploration\|drip | 160 | 91 | 56.9% | 0 | 25.3s | 31.9% | 35.4% |
| policy-exploration\|rapid | 160 | 88 | 55.0% | 0 | 22.6s | 33.7% | 35.4% |
| policy-exploration\|three-waves | 160 | 90 | 56.3% | 0 | 23.3s | 37.2% | 33.9% |
| policy-exploration\|two-waves | 160 | 89 | 55.6% | 0 | 23.3s | 35.1% | 35.4% |
| pure-unit-matrix\|burst | 140 | 70 | 50.0% | 0 | 31.1s | 64.4% | 47.4% |
| pure-unit-matrix\|drip | 140 | 83 | 59.3% | 0 | 31.8s | 65.8% | 40.0% |
| pure-unit-matrix\|rapid | 140 | 76 | 54.3% | 0 | 31.5s | 63.4% | 43.5% |
| pure-unit-matrix\|three-waves | 140 | 75 | 53.6% | 0 | 32.6s | 61.9% | 46.2% |
| pure-unit-matrix\|two-waves | 140 | 92 | 65.7% | 0 | 30.8s | 69.3% | 34.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 400 | 224 | 56.0% | 0 | 23.2s | 35.8% | 34.0% |
| policy-exploration\|tank-front-support-rear | 400 | 229 | 57.3% | 0 | 23.3s | 34.1% | 34.7% |
| pure-unit-matrix\|roster-order | 350 | 196 | 56.0% | 0 | 30.5s | 64.9% | 42.3% |
| pure-unit-matrix\|tank-front-support-rear | 350 | 200 | 57.1% | 0 | 32.7s | 65.0% | 42.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mimic | 189 | 104 | 55.0% | 0 | 31.2s | 45.3% | 39.0% |
| pure-knight | 188 | 118 | 62.8% | 0 | 30.3s | 50.1% | 32.8% |
| pure-archer | 185 | 93 | 50.3% | 0 | 33.8s | 48.7% | 46.9% |
| pure-demon_king | 104 | 81 | 77.9% | 0 | 32.9s | 77.0% | 20.4% |
| pure-fire_dragon | 100 | 62 | 62.0% | 0 | 21.8s | 69.6% | 37.5% |
| pure-mage | 100 | 41 | 41.0% | 0 | 24.7s | 57.6% | 57.2% |
| pure-pea_shooter | 100 | 54 | 54.0% | 0 | 29.3s | 63.8% | 45.8% |
| balanced | 89 | 57 | 64.0% | 0 | 20.2s | 40.9% | 30.4% |
| melee-pressure | 89 | 53 | 59.6% | 0 | 25.2s | 35.0% | 27.7% |
| random-1 | 89 | 43 | 48.3% | 0 | 22.5s | 33.7% | 40.7% |
| random-3 | 89 | 49 | 55.1% | 0 | 21.0s | 34.2% | 37.5% |
| random-5 | 89 | 47 | 52.8% | 0 | 22.8s | 36.2% | 36.7% |
| trap-runner-mix | 49 | 26 | 53.1% | 0 | 21.4s | 36.7% | 31.8% |
| support-mix | 40 | 21 | 52.5% | 0 | 21.0s | 37.5% | 41.5% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 12 | 75.0% | 0 | 29.5s | 77.8% | 21.3% |
| center-column__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 20.1s | 25.6% | 37.1% |
| center-column__drip__roster-order | 16 | 6 | 37.5% | 0 | 32.8s | 55.9% | 55.4% |
| center-column__drip__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 32.3s | 49.9% | 35.9% |
| center-column__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 18.7s | 21.9% | 44.5% |
| center-column__three-waves__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 25.1s | 37.8% | 73.3% |
| center-column__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 26.4s | 49.4% | 42.9% |
| diamond__burst__roster-order | 16 | 12 | 75.0% | 0 | 27.1s | 78.6% | 25.0% |
| diamond__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.9s | 54.2% | 41.6% |
| diamond__rapid__roster-order | 16 | 12 | 75.0% | 0 | 19.5s | 31.3% | 25.0% |
| diamond__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.0s | 50.7% | 26.8% |
| diamond__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 21.3s | 32.3% | 35.9% |
| diamond__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.2s | 37.6% | 56.8% |
| diamond__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 28.0s | 80.3% | 24.1% |
| diamond__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 31.7s | 56.2% | 23.7% |
| dual-flank__burst__roster-order | 16 | 13 | 81.3% | 0 | 23.0s | 61.7% | 17.8% |
| dual-flank__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 19.6s | 23.7% | 46.7% |
| dual-flank__drip__roster-order | 16 | 9 | 56.3% | 0 | 29.0s | 64.9% | 43.8% |
| dual-flank__drip__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 21.3s | 33.0% | 12.5% |
| dual-flank__rapid__roster-order | 16 | 5 | 31.3% | 0 | 24.4s | 36.1% | 58.4% |
| dual-flank__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 23.2s | 52.4% | 75.0% |
| dual-flank__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 25.5s | 42.6% | 42.5% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 20.1s | 30.8% | 39.0% |
| edge-sweep__drip__roster-order | 16 | 6 | 37.5% | 0 | 30.1s | 49.3% | 59.5% |
| edge-sweep__drip__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 21.0s | 33.3% | 12.5% |
| edge-sweep__rapid__roster-order | 16 | 8 | 50.0% | 0 | 34.7s | 43.4% | 43.9% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 29.2s | 68.6% | 43.8% |
| edge-sweep__three-waves__roster-order | 16 | 5 | 31.3% | 0 | 20.6s | 38.5% | 62.5% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 33.4s | 76.6% | 18.8% |
| edge-sweep__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 22.3s | 45.2% | 59.8% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 21.2s | 33.5% | 41.1% |
| inverted-wedge__burst__tank-front-support-rear | 16 | 2 | 12.5% | 0 | 27.9s | 41.3% | 87.5% |
| inverted-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 31.1s | 62.1% | 42.3% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 40.3s | 60.3% | 56.2% |
| inverted-wedge__rapid__roster-order | 16 | 6 | 37.5% | 0 | 21.8s | 28.6% | 44.3% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 20.7s | 26.1% | 51.6% |
| inverted-wedge__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 21.6s | 33.1% | 17.2% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.4s | 29.1% | 31.9% |
| inverted-wedge__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 28.4s | 66.7% | 37.5% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 42.0s | 61.8% | 52.8% |
| left-flank__burst__roster-order | 16 | 11 | 68.8% | 0 | 25.1s | 34.5% | 18.4% |
| left-flank__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 24.5s | 45.3% | 30.1% |
| left-flank__drip__roster-order | 16 | 10 | 62.5% | 0 | 24.3s | 30.7% | 26.0% |
| left-flank__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 23.5s | 30.7% | 19.3% |
| left-flank__rapid__roster-order | 16 | 5 | 31.3% | 0 | 30.2s | 43.4% | 68.5% |
| left-flank__rapid__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 28.9s | 61.5% | 12.4% |
| left-flank__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 33.6s | 56.8% | 33.6% |
| left-flank__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 42.1s | 73.2% | 18.3% |
| right-flank__burst__roster-order | 16 | 5 | 31.3% | 0 | 35.0s | 54.6% | 64.8% |
| right-flank__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 30.8s | 46.3% | 68.1% |
| right-flank__drip__roster-order | 16 | 12 | 75.0% | 0 | 34.6s | 49.7% | 20.0% |
| right-flank__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 37.0s | 71.5% | 16.6% |
| right-flank__rapid__roster-order | 16 | 12 | 75.0% | 0 | 21.3s | 33.2% | 18.7% |
| right-flank__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 28.4s | 32.9% | 17.0% |
| right-flank__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 27.6s | 32.9% | 24.4% |
| right-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 31.1s | 72.3% | 24.1% |
| three-lane__burst__roster-order | 16 | 10 | 62.5% | 0 | 23.0s | 32.0% | 28.8% |
| three-lane__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 31.3s | 81.2% | 20.9% |
| three-lane__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 24.8s | 45.6% | 51.2% |
| three-lane__rapid__roster-order | 16 | 11 | 68.8% | 0 | 26.4s | 75.9% | 30.0% |
| three-lane__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 20.5s | 36.8% | 23.1% |
| three-lane__three-waves__roster-order | 16 | 3 | 18.8% | 0 | 22.2s | 54.4% | 76.1% |
| three-lane__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 22.1s | 39.2% | 34.8% |
| three-lane__two-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 23.2s | 59.0% | 50.0% |
| vanguard-wedge__burst__roster-order | 16 | 8 | 50.0% | 0 | 22.7s | 37.5% | 29.3% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 24.7s | 25.1% | 47.2% |
| vanguard-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 23.8s | 33.5% | 30.1% |
| vanguard-wedge__rapid__roster-order | 16 | 6 | 37.5% | 0 | 35.2s | 57.9% | 52.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 31.2s | 75.6% | 25.0% |
| vanguard-wedge__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 38.8s | 68.4% | 42.2% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 30.3s | 75.4% | 25.0% |
| vanguard-wedge__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 25.2s | 35.3% | 14.3% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 24.6s | 31.8% | 18.8% |
| wide-line__burst__roster-order | 16 | 9 | 56.3% | 0 | 25.8s | 53.4% | 32.9% |
| wide-line__drip__roster-order | 16 | 12 | 75.0% | 0 | 24.8s | 36.0% | 18.9% |
| wide-line__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 31.5s | 48.7% | 62.5% |
| wide-line__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 26.2s | 68.7% | 50.0% |
| wide-line__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.7s | 34.2% | 21.8% |
| wide-line__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 23.5s | 37.8% | 28.1% |
| wide-line__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 28.8s | 71.4% | 31.3% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| inverted-wedge | 155 | 73 | 47.1% | 0 | 28.7s | 46.3% | 47.4% |
| vanguard-wedge | 155 | 96 | 61.9% | 0 | 28.3s | 48.9% | 30.8% |
| diamond | 150 | 90 | 60.0% | 0 | 26.0s | 52.9% | 37.0% |
| dual-flank | 150 | 78 | 52.0% | 0 | 24.4s | 45.2% | 42.0% |
| edge-sweep | 150 | 81 | 54.0% | 0 | 26.2s | 48.6% | 42.6% |
| left-flank | 150 | 101 | 67.3% | 0 | 28.6s | 46.3% | 27.4% |
| right-flank | 150 | 91 | 60.7% | 0 | 30.2s | 48.8% | 33.7% |
| three-lane | 150 | 81 | 54.0% | 0 | 24.1s | 52.3% | 40.7% |
| center-column | 145 | 78 | 53.8% | 0 | 27.4s | 48.9% | 41.1% |
| wide-line | 145 | 80 | 55.2% | 0 | 27.1s | 51.5% | 37.4% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 165 | 55.0% | 0 | 26.0s | 49.6% | 39.0% |
| drip | 300 | 174 | 58.0% | 0 | 28.4s | 47.7% | 37.5% |
| rapid | 300 | 164 | 54.7% | 0 | 26.8s | 47.6% | 39.1% |
| three-waves | 300 | 165 | 55.0% | 0 | 27.6s | 48.7% | 39.6% |
| two-waves | 300 | 181 | 60.3% | 0 | 26.8s | 51.1% | 34.7% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 420 | 56.0% | 0 | 26.6s | 49.4% | 37.9% |
| tank-front-support-rear | 750 | 429 | 57.2% | 0 | 27.6s | 48.5% | 38.1% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 899 | 504 | 56.1% | 0 | 31.3s | 64.8% | 42.6% |
| cannon-focus | 201 | 105 | 52.2% | 0 | 30.7s | 65.0% | 46.3% |
| cannon-rally | 200 | 130 | 65.0% | 0 | 15.7s | 5.0% | 20.8% |
| rally-core | 200 | 110 | 55.0% | 0 | 16.1s | 5.8% | 26.4% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 905 | 508 | 56.1% | 0 | 29.9s | 58.6% | 40.7% |
| epic | 201 | 110 | 54.7% | 0 | 22.0s | 31.4% | 36.2% |
| unrevealed | 200 | 117 | 58.5% | 0 | 24.0s | 38.1% | 33.9% |
| legendary | 194 | 114 | 58.8% | 0 | 22.6s | 33.5% | 31.8% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 880 | 505 | 57.4% | 0 | 29.8s | 59.0% | 40.2% |
| ward-1 | 220 | 125 | 56.8% | 0 | 23.0s | 34.2% | 33.3% |
| ward-3 | 220 | 113 | 51.4% | 0 | 23.6s | 34.6% | 38.1% |
| ward-2 | 180 | 106 | 58.9% | 0 | 23.3s | 35.6% | 32.7% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 849 | 56.6% | 0 | 27.1s | 49.0% | 38.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mimic | 723 | 400 | 55.3% | 0 | 24.5s | 38.6% | 35.9% |
| knight | 722 | 414 | 57.3% | 0 | 24.3s | 39.8% | 34.3% |
| demon_king | 638 | 377 | 59.1% | 0 | 23.9s | 42.8% | 32.5% |
| archer | 630 | 336 | 53.3% | 0 | 25.1s | 40.0% | 39.4% |
| fire_dragon | 545 | 305 | 56.0% | 0 | 21.6s | 42.5% | 36.5% |
| mage | 545 | 284 | 52.1% | 0 | 22.1s | 40.3% | 40.1% |
| pea_shooter | 367 | 193 | 52.6% | 0 | 24.1s | 42.6% | 40.3% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 53.0% | 43.3%-62.5% | 64.4% | 46.2% | 31.4% |
| demon_king | 100 | 78.0% | 68.9%-85.0% | 76.7% | 20.2% | 57.7% |
| fire_dragon | 100 | 62.0% | 52.2%-70.9% | 69.6% | 37.5% | 49.0% |
| knight | 100 | 59.0% | 49.2%-68.1% | 64.7% | 39.4% | 38.4% |
| mage | 100 | 41.0% | 31.9%-50.8% | 57.6% | 57.2% | 27.5% |
| mimic | 100 | 49.0% | 39.4%-58.7% | 58.1% | 49.0% | 41.7% |
| pea_shooter | 100 | 54.0% | 44.3%-63.4% | 63.8% | 45.8% | 34.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 53.0% | 43.3%-62.5% | 64.4% | 46.2% | 31.4% |
| demon_king\|TH5 | 100 | 78.0% | 68.9%-85.0% | 76.7% | 20.2% | 57.7% |
| fire_dragon\|TH5 | 100 | 62.0% | 52.2%-70.9% | 69.6% | 37.5% | 49.0% |
| knight\|TH5 | 100 | 59.0% | 49.2%-68.1% | 64.7% | 39.4% | 38.4% |
| mage\|TH5 | 100 | 41.0% | 31.9%-50.8% | 57.6% | 57.2% | 27.5% |
| mimic\|TH5 | 100 | 49.0% | 39.4%-58.7% | 58.1% | 49.0% | 41.7% |
| pea_shooter\|TH5 | 100 | 54.0% | 44.3%-63.4% | 63.8% | 45.8% | 34.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 16 | 0.0% | 92.8% |
| th5-asymmetric-left-098 | 5 | asymmetric-left | rushed-defense | 16 | 0.0% | 92.2% |
| th5-resource-shield-096 | 5 | resource-shield | maxed | 16 | 0.0% | 88.5% |
| th5-rear-keep-085 | 5 | rear-keep | maxed | 15 | 0.0% | 99.0% |
| th5-defense-ring-074 | 5 | defense-ring | maxed | 15 | 0.0% | 98.2% |
| th5-diamond-012 | 5 | diamond | maxed | 15 | 0.0% | 98.0% |
| th5-asymmetric-right-063 | 5 | asymmetric-right | maxed | 15 | 0.0% | 97.7% |
| th5-compact-core-037 | 5 | compact-core | rushed-defense | 15 | 0.0% | 96.3% |
| th5-asymmetric-right-099 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 96.2% |
| th5-compact-core-001 | 5 | compact-core | maxed | 15 | 0.0% | 92.2% |
| th5-split-core-076 | 5 | split-core | rushed-defense | 15 | 0.0% | 90.3% |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 15 | 0.0% | 88.7% |
| th5-diamond-048 | 5 | diamond | rushed-defense | 15 | 0.0% | 87.3% |
| th5-split-core-040 | 5 | split-core | maxed | 15 | 0.0% | 86.9% |
| th5-corner-keep-029 | 5 | corner-keep | maxed | 15 | 0.0% | 84.1% |

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

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.04x median.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 78.0% attacker wins across 100 samples (reference 56.6%).
- **WARNING / pure-troop-outlier:** pure-troop mage has 41.0% attacker wins across 100 samples (reference 56.6%).
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-029 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-074 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-048 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-kill-corridor-018 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-093 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-042 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-076 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-098 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-063 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-099 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th5-corner-keep-029 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-083 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-074 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-048 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-066 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-089 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-kill-corridor-018 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-kill-corridor-072 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-layered-rings-093 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-resource-shield-042 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-078 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-095 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-022 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-split-core-076 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-100 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-044 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-098 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-045 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-063 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-099 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-055 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-corner-keep-011 has 100.0% attacker wins across 15 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
