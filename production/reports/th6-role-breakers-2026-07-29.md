# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:44:57.249Z
**Seed:** 64006
**Town Halls:** TH6
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 800
**Unbeaten non-adaptive bases (n >= 12):** 10
**Breakability probe:** 1700 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=1.1x, mage=1.7x, archer=1.05x, mimic=1.5x, demon_king=1.15x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.85x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 46.8s

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
| 1500 | 869 | 57.9% | 0 | 27.0s | 55.8% | 39.3% | 36.4% |

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
| TH6->TH6 | 1500 | 869 | 57.9% | 0 | 27.0s | 55.8% | 39.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 92 | 61 | 66.3% | 0 | 25.9s | 58.5% | 31.2% |
| layered-rings | 91 | 42 | 46.2% | 0 | 24.8s | 52.1% | 50.6% |
| resource-shield | 91 | 40 | 44.0% | 0 | 27.9s | 48.7% | 51.5% |
| wide-spread | 91 | 63 | 69.2% | 0 | 29.6s | 64.4% | 28.5% |
| asymmetric-left | 90 | 50 | 55.6% | 0 | 25.3s | 58.2% | 43.1% |
| asymmetric-right | 90 | 42 | 46.7% | 0 | 25.8s | 52.7% | 50.3% |
| compact-core | 90 | 42 | 46.7% | 0 | 27.0s | 50.9% | 49.3% |
| defense-ring | 90 | 52 | 57.8% | 0 | 27.3s | 58.6% | 38.0% |
| split-core | 90 | 58 | 64.4% | 0 | 24.9s | 56.0% | 33.0% |
| trap-lanes | 90 | 59 | 65.6% | 0 | 26.5s | 58.5% | 31.6% |
| cannon-screen | 75 | 56 | 74.7% | 0 | 32.8s | 56.6% | 25.0% |
| diamond | 75 | 35 | 46.7% | 0 | 24.7s | 53.3% | 50.7% |
| echelon-left | 75 | 48 | 64.0% | 0 | 26.6s | 56.9% | 34.8% |
| corner-keep | 74 | 39 | 52.7% | 0 | 28.5s | 53.7% | 45.0% |
| crossfire | 74 | 44 | 59.5% | 0 | 26.3s | 55.1% | 36.8% |
| echelon-right | 74 | 50 | 67.6% | 0 | 29.3s | 57.5% | 31.4% |
| kill-corridor | 74 | 48 | 64.9% | 0 | 28.2s | 60.5% | 32.1% |
| rear-keep | 74 | 40 | 54.1% | 0 | 24.7s | 52.2% | 42.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel\|TH6 | 92 | 61 | 66.3% | 0 | 25.9s | 58.5% | 31.2% |
| layered-rings\|TH6 | 91 | 42 | 46.2% | 0 | 24.8s | 52.1% | 50.6% |
| resource-shield\|TH6 | 91 | 40 | 44.0% | 0 | 27.9s | 48.7% | 51.5% |
| wide-spread\|TH6 | 91 | 63 | 69.2% | 0 | 29.6s | 64.4% | 28.5% |
| asymmetric-left\|TH6 | 90 | 50 | 55.6% | 0 | 25.3s | 58.2% | 43.1% |
| asymmetric-right\|TH6 | 90 | 42 | 46.7% | 0 | 25.8s | 52.7% | 50.3% |
| compact-core\|TH6 | 90 | 42 | 46.7% | 0 | 27.0s | 50.9% | 49.3% |
| defense-ring\|TH6 | 90 | 52 | 57.8% | 0 | 27.3s | 58.6% | 38.0% |
| split-core\|TH6 | 90 | 58 | 64.4% | 0 | 24.9s | 56.0% | 33.0% |
| trap-lanes\|TH6 | 90 | 59 | 65.6% | 0 | 26.5s | 58.5% | 31.6% |
| cannon-screen\|TH6 | 75 | 56 | 74.7% | 0 | 32.8s | 56.6% | 25.0% |
| diamond\|TH6 | 75 | 35 | 46.7% | 0 | 24.7s | 53.3% | 50.7% |
| echelon-left\|TH6 | 75 | 48 | 64.0% | 0 | 26.6s | 56.9% | 34.8% |
| corner-keep\|TH6 | 74 | 39 | 52.7% | 0 | 28.5s | 53.7% | 45.0% |
| crossfire\|TH6 | 74 | 44 | 59.5% | 0 | 26.3s | 55.1% | 36.8% |
| echelon-right\|TH6 | 74 | 50 | 67.6% | 0 | 29.3s | 57.5% | 31.4% |
| kill-corridor\|TH6 | 74 | 48 | 64.9% | 0 | 28.2s | 60.5% | 32.1% |
| rear-keep\|TH6 | 74 | 40 | 54.1% | 0 | 24.7s | 52.2% | 42.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 326 | 41 | 12.6% | 0 | 21.6s | 37.1% | 82.8% |
| maxed | 298 | 23 | 7.7% | 0 | 24.3s | 24.1% | 88.3% |
| mid | 297 | 263 | 88.6% | 0 | 31.2s | 73.0% | 8.5% |
| rushed-economy | 295 | 295 | 100.0% | 0 | 29.7s | 75.2% | 0.0% |
| mixed | 284 | 247 | 87.0% | 0 | 28.6s | 72.5% | 11.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 800 | 471 | 58.9% | 0 | 29.9s | 63.8% | 39.8% |
| policy-exploration | 700 | 398 | 56.9% | 0 | 23.6s | 46.8% | 38.8% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 800 | 471 | 58.9% | 0 | 29.9s | 63.8% | 39.8% |
| policy-exploration\|TH6 | 700 | 398 | 56.9% | 0 | 23.6s | 46.8% | 38.8% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 800 | 471 | 58.9% | 0 | 29.9s | 63.8% | 39.8% |
| policy-exploration\|cannon-rally | 101 | 56 | 55.4% | 0 | 14.7s | 7.1% | 28.9% |
| policy-exploration\|freeze-barrel | 101 | 61 | 60.4% | 0 | 29.2s | 64.1% | 38.9% |
| policy-exploration\|none | 101 | 62 | 61.4% | 0 | 26.5s | 64.1% | 38.5% |
| policy-exploration\|rally-rage | 101 | 58 | 57.4% | 0 | 14.9s | 5.4% | 31.5% |
| policy-exploration\|skeleton-barrel | 98 | 54 | 55.1% | 0 | 25.5s | 64.6% | 44.0% |
| policy-exploration\|freeze-defense | 97 | 50 | 51.5% | 0 | 29.3s | 61.1% | 46.7% |
| policy-exploration\|rage-entry | 92 | 50 | 54.3% | 0 | 24.3s | 61.0% | 45.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 80 | 47 | 58.8% | 0 | 32.3s | 61.7% | 39.0% |
| pure-unit-matrix\|diamond | 80 | 44 | 55.0% | 0 | 29.7s | 64.1% | 44.2% |
| pure-unit-matrix\|dual-flank | 80 | 48 | 60.0% | 0 | 28.9s | 67.0% | 39.4% |
| pure-unit-matrix\|edge-sweep | 80 | 47 | 58.8% | 0 | 29.2s | 67.5% | 38.3% |
| pure-unit-matrix\|inverted-wedge | 80 | 51 | 63.7% | 0 | 33.4s | 63.8% | 35.3% |
| pure-unit-matrix\|left-flank | 80 | 49 | 61.3% | 0 | 29.3s | 61.5% | 37.4% |
| pure-unit-matrix\|right-flank | 80 | 48 | 60.0% | 0 | 30.2s | 61.9% | 37.1% |
| pure-unit-matrix\|three-lane | 80 | 47 | 58.8% | 0 | 28.5s | 65.2% | 41.0% |
| pure-unit-matrix\|vanguard-wedge | 80 | 46 | 57.5% | 0 | 29.5s | 60.8% | 41.9% |
| pure-unit-matrix\|wide-line | 80 | 44 | 55.0% | 0 | 27.7s | 64.0% | 44.2% |
| policy-exploration\|dual-flank | 73 | 36 | 49.3% | 0 | 22.2s | 45.2% | 45.5% |
| policy-exploration\|diamond | 71 | 37 | 52.1% | 0 | 22.6s | 46.7% | 44.8% |
| policy-exploration\|center-column | 70 | 43 | 61.4% | 0 | 23.2s | 46.0% | 32.0% |
| policy-exploration\|edge-sweep | 70 | 49 | 70.0% | 0 | 25.3s | 56.3% | 24.8% |
| policy-exploration\|inverted-wedge | 70 | 26 | 37.1% | 0 | 22.1s | 36.7% | 59.9% |
| policy-exploration\|right-flank | 70 | 38 | 54.3% | 0 | 26.6s | 44.2% | 39.5% |
| policy-exploration\|three-lane | 70 | 49 | 70.0% | 0 | 24.7s | 56.1% | 27.1% |
| policy-exploration\|vanguard-wedge | 70 | 42 | 60.0% | 0 | 23.1s | 43.8% | 35.7% |
| policy-exploration\|wide-line | 70 | 37 | 52.9% | 0 | 21.6s | 48.8% | 43.8% |
| policy-exploration\|left-flank | 66 | 41 | 62.1% | 0 | 25.0s | 43.9% | 34.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 160 | 89 | 55.6% | 0 | 28.9s | 61.9% | 43.4% |
| pure-unit-matrix\|drip | 160 | 85 | 53.1% | 0 | 31.4s | 60.9% | 44.7% |
| pure-unit-matrix\|rapid | 160 | 97 | 60.6% | 0 | 29.4s | 65.3% | 38.1% |
| pure-unit-matrix\|three-waves | 160 | 99 | 61.9% | 0 | 30.1s | 65.1% | 37.1% |
| pure-unit-matrix\|two-waves | 160 | 101 | 63.1% | 0 | 29.7s | 65.6% | 35.6% |
| policy-exploration\|burst | 140 | 85 | 60.7% | 0 | 25.4s | 50.6% | 34.9% |
| policy-exploration\|drip | 140 | 73 | 52.1% | 0 | 22.6s | 41.5% | 46.0% |
| policy-exploration\|rapid | 140 | 76 | 54.3% | 0 | 22.3s | 43.6% | 41.3% |
| policy-exploration\|three-waves | 140 | 77 | 55.0% | 0 | 24.5s | 50.3% | 38.3% |
| policy-exploration\|two-waves | 140 | 87 | 62.1% | 0 | 23.3s | 47.9% | 33.5% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 400 | 232 | 58.0% | 0 | 29.4s | 63.4% | 40.9% |
| pure-unit-matrix\|tank-front-support-rear | 400 | 239 | 59.8% | 0 | 30.3s | 64.1% | 38.7% |
| policy-exploration\|roster-order | 350 | 199 | 56.9% | 0 | 23.0s | 47.4% | 39.6% |
| policy-exploration\|tank-front-support-rear | 350 | 199 | 56.9% | 0 | 24.2s | 46.1% | 38.0% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 137 | 63 | 46.0% | 0 | 33.9s | 46.8% | 50.2% |
| pure-knight | 133 | 77 | 57.9% | 0 | 31.0s | 58.7% | 36.7% |
| pure-mimic | 133 | 83 | 62.4% | 0 | 35.0s | 66.1% | 34.8% |
| pure-fire_dragon | 132 | 76 | 57.6% | 0 | 18.8s | 51.1% | 40.4% |
| pure-mage | 132 | 61 | 46.2% | 0 | 25.4s | 55.4% | 52.8% |
| pure-mechanical_dragon | 132 | 76 | 57.6% | 0 | 28.2s | 66.1% | 41.8% |
| pure-pea_shooter | 132 | 68 | 51.5% | 0 | 30.6s | 57.9% | 47.8% |
| pure-demon_king | 128 | 114 | 89.1% | 0 | 25.9s | 62.7% | 9.1% |
| frontline-ranged | 37 | 19 | 51.4% | 0 | 18.4s | 37.0% | 46.1% |
| random-4 | 35 | 18 | 51.4% | 0 | 24.9s | 61.6% | 48.6% |
| hero-necro-dragon-mages | 34 | 17 | 50.0% | 0 | 21.3s | 61.8% | 50.0% |
| air-pressure | 33 | 19 | 57.6% | 0 | 16.4s | 24.1% | 33.9% |
| random-2 | 32 | 25 | 78.1% | 0 | 28.1s | 74.5% | 21.6% |
| random-5 | 32 | 18 | 56.3% | 0 | 23.5s | 60.8% | 43.8% |
| ranged-pressure | 32 | 16 | 50.0% | 0 | 14.6s | 6.8% | 36.8% |
| support-mix | 32 | 18 | 56.3% | 0 | 24.3s | 65.9% | 43.8% |
| trap-runner-mix | 32 | 18 | 56.3% | 0 | 30.4s | 63.5% | 43.0% |
| random-3 | 30 | 17 | 56.7% | 0 | 26.9s | 60.8% | 43.3% |
| balanced | 28 | 19 | 67.9% | 0 | 26.0s | 67.8% | 31.3% |
| melee-pressure | 28 | 17 | 60.7% | 0 | 16.2s | 5.8% | 9.2% |
| random-1 | 28 | 15 | 53.6% | 0 | 26.4s | 58.6% | 46.4% |
| random-6 | 28 | 15 | 53.6% | 0 | 23.9s | 59.2% | 46.4% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 11 | 68.8% | 0 | 28.4s | 51.3% | 29.9% |
| center-column__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 35.6s | 55.4% | 43.3% |
| center-column__rapid__roster-order | 16 | 8 | 50.0% | 0 | 23.2s | 46.1% | 36.6% |
| center-column__three-waves__tank-front-support-rear | 16 | 15 | 93.8% | 0 | 31.6s | 81.2% | 6.3% |
| center-column__two-waves__roster-order | 16 | 14 | 87.5% | 0 | 27.4s | 56.6% | 12.5% |
| center-column__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 25.6s | 57.7% | 43.8% |
| diamond__burst__roster-order | 16 | 10 | 62.5% | 0 | 24.0s | 56.3% | 36.1% |
| diamond__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 30.9s | 70.5% | 37.1% |
| diamond__drip__roster-order | 16 | 4 | 25.0% | 0 | 23.3s | 35.3% | 71.7% |
| diamond__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 25.2s | 55.2% | 62.5% |
| diamond__rapid__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 29.9s | 66.3% | 37.4% |
| diamond__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 21.0s | 48.7% | 60.6% |
| diamond__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.8s | 49.8% | 38.0% |
| dual-flank__burst__roster-order | 16 | 6 | 37.5% | 0 | 19.8s | 49.7% | 60.2% |
| dual-flank__drip__roster-order | 16 | 10 | 62.5% | 0 | 30.1s | 63.9% | 37.5% |
| dual-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 25.2s | 53.6% | 49.0% |
| dual-flank__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 24.2s | 52.4% | 62.5% |
| dual-flank__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 26.1s | 48.7% | 43.3% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 24.2s | 50.2% | 48.2% |
| edge-sweep__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 31.9s | 76.8% | 19.2% |
| edge-sweep__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.7s | 51.0% | 46.3% |
| edge-sweep__rapid__roster-order | 16 | 6 | 37.5% | 0 | 20.3s | 41.5% | 57.9% |
| edge-sweep__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 26.6s | 78.2% | 18.8% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 32.2s | 46.4% | 40.8% |
| edge-sweep__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 26.2s | 56.1% | 33.9% |
| inverted-wedge__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 34.1s | 47.6% | 54.7% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 29.8s | 48.7% | 62.2% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 22.2s | 48.0% | 56.3% |
| inverted-wedge__three-waves__roster-order | 16 | 2 | 12.5% | 0 | 24.2s | 26.3% | 83.3% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 27.1s | 66.0% | 37.5% |
| inverted-wedge__two-waves__roster-order | 16 | 4 | 25.0% | 0 | 22.1s | 36.5% | 73.9% |
| left-flank__burst__roster-order | 16 | 11 | 68.8% | 0 | 24.3s | 50.5% | 30.9% |
| left-flank__drip__roster-order | 16 | 4 | 25.0% | 0 | 22.7s | 46.2% | 74.3% |
| left-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 25.4s | 61.1% | 43.8% |
| left-flank__three-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 28.3s | 44.3% | 39.2% |
| left-flank__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.2s | 44.9% | 34.1% |
| right-flank__burst__roster-order | 16 | 8 | 50.0% | 0 | 32.4s | 51.6% | 47.4% |
| right-flank__drip__roster-order | 16 | 14 | 87.5% | 0 | 28.5s | 61.2% | 12.5% |
| right-flank__rapid__roster-order | 16 | 14 | 87.5% | 0 | 28.1s | 58.4% | 9.6% |
| right-flank__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 23.9s | 32.3% | 68.8% |
| right-flank__three-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 31.8s | 62.4% | 43.3% |
| right-flank__two-waves__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 31.4s | 76.3% | 12.3% |
| three-lane__burst__roster-order | 16 | 10 | 62.5% | 0 | 28.0s | 69.9% | 36.5% |
| three-lane__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 21.7s | 55.5% | 19.7% |
| three-lane__drip__roster-order | 16 | 8 | 50.0% | 0 | 24.2s | 44.1% | 50.0% |
| three-lane__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.5s | 50.1% | 48.9% |
| three-lane__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 29.1s | 60.3% | 49.7% |
| three-lane__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 31.6s | 55.8% | 18.8% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 23.9s | 31.6% | 78.3% |
| vanguard-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 29.0s | 59.0% | 43.8% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 23.0s | 51.5% | 25.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 28.7s | 50.5% | 25.0% |
| vanguard-wedge__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 27.5s | 72.6% | 18.8% |
| vanguard-wedge__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 31.3s | 56.3% | 49.0% |
| wide-line__burst__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.2s | 54.1% | 30.6% |
| wide-line__drip__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 24.2s | 49.6% | 59.7% |
| wide-line__rapid__roster-order | 16 | 7 | 43.8% | 0 | 22.3s | 58.0% | 56.3% |
| wide-line__three-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.8s | 60.4% | 30.4% |
| wide-line__two-waves__roster-order | 16 | 13 | 81.3% | 0 | 26.1s | 81.3% | 18.8% |
| wide-line__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 18.8s | 32.9% | 57.5% |
| center-column__drip__roster-order | 15 | 6 | 40.0% | 0 | 25.0s | 38.6% | 54.8% |
| center-column__rapid__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 32.3s | 68.0% | 30.5% |
| diamond__three-waves__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 30.8s | 74.3% | 20.0% |
| dual-flank__burst__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 26.8s | 67.5% | 32.7% |
| dual-flank__drip__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 27.7s | 53.3% | 31.5% |
| dual-flank__two-waves__roster-order | 15 | 12 | 80.0% | 0 | 26.0s | 61.0% | 20.0% |
| edge-sweep__burst__roster-order | 15 | 10 | 66.7% | 0 | 22.2s | 53.9% | 28.8% |
| edge-sweep__two-waves__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 27.4s | 69.8% | 33.3% |
| inverted-wedge__rapid__roster-order | 15 | 14 | 93.3% | 0 | 33.4s | 85.1% | 2.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 15 | 13 | 86.7% | 0 | 30.1s | 60.4% | 13.3% |
| left-flank__rapid__tank-front-support-rear | 15 | 12 | 80.0% | 0 | 25.2s | 51.9% | 20.0% |
| left-flank__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 30.2s | 68.7% | 32.5% |
| right-flank__burst__tank-front-support-rear | 15 | 4 | 26.7% | 0 | 22.9s | 35.5% | 62.3% |
| right-flank__three-waves__roster-order | 15 | 9 | 60.0% | 0 | 27.1s | 41.6% | 39.1% |
| three-lane__drip__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 27.7s | 53.2% | 40.7% |
| three-lane__two-waves__roster-order | 15 | 10 | 66.7% | 0 | 27.0s | 73.9% | 33.0% |
| vanguard-wedge__rapid__roster-order | 15 | 7 | 46.7% | 0 | 25.7s | 50.7% | 53.1% |
| vanguard-wedge__three-waves__tank-front-support-rear | 15 | 6 | 40.0% | 0 | 22.4s | 40.3% | 43.3% |
| wide-line__burst__roster-order | 15 | 10 | 66.7% | 0 | 27.2s | 72.1% | 33.3% |
| wide-line__drip__roster-order | 15 | 7 | 46.7% | 0 | 28.1s | 57.4% | 53.3% |
| center-column__burst__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 25.8s | 51.3% | 58.3% |
| center-column__three-waves__roster-order | 12 | 4 | 33.3% | 0 | 24.0s | 30.7% | 52.0% |
| diamond__rapid__roster-order | 12 | 8 | 66.7% | 0 | 29.0s | 43.5% | 26.6% |
| diamond__two-waves__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 25.5s | 58.0% | 50.0% |
| dual-flank__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.6s | 69.6% | 33.3% |
| edge-sweep__drip__roster-order | 12 | 9 | 75.0% | 0 | 31.1s | 75.3% | 25.0% |
| edge-sweep__rapid__tank-front-support-rear | 12 | 11 | 91.7% | 0 | 30.7s | 82.2% | 8.3% |
| inverted-wedge__burst__roster-order | 12 | 7 | 58.3% | 0 | 31.9s | 56.9% | 40.9% |
| inverted-wedge__drip__roster-order | 12 | 8 | 66.7% | 0 | 27.3s | 37.6% | 33.3% |
| left-flank__burst__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 37.6s | 64.0% | 24.1% |
| left-flank__drip__tank-front-support-rear | 12 | 10 | 83.3% | 0 | 28.6s | 47.0% | 14.6% |
| left-flank__two-waves__roster-order | 12 | 7 | 58.3% | 0 | 30.8s | 60.2% | 38.0% |
| right-flank__drip__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 29.8s | 54.8% | 50.0% |
| right-flank__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 29.7s | 63.6% | 42.3% |
| three-lane__rapid__roster-order | 12 | 8 | 66.7% | 0 | 27.6s | 72.1% | 32.6% |
| three-lane__three-waves__tank-front-support-rear | 12 | 11 | 91.7% | 0 | 29.0s | 83.5% | 8.3% |
| vanguard-wedge__burst__roster-order | 12 | 9 | 75.0% | 0 | 28.5s | 70.5% | 25.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 24.7s | 47.7% | 22.6% |
| wide-line__rapid__tank-front-support-rear | 12 | 5 | 41.7% | 0 | 25.1s | 37.5% | 54.1% |
| wide-line__three-waves__roster-order | 12 | 6 | 50.0% | 0 | 25.4s | 63.2% | 50.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank | 153 | 84 | 54.9% | 0 | 25.7s | 56.6% | 42.3% |
| diamond | 151 | 81 | 53.6% | 0 | 26.4s | 55.9% | 44.5% |
| center-column | 150 | 90 | 60.0% | 0 | 28.0s | 54.4% | 35.7% |
| edge-sweep | 150 | 96 | 64.0% | 0 | 27.4s | 62.3% | 32.0% |
| inverted-wedge | 150 | 77 | 51.3% | 0 | 28.1s | 51.2% | 46.8% |
| right-flank | 150 | 86 | 57.3% | 0 | 28.5s | 53.7% | 38.2% |
| three-lane | 150 | 96 | 64.0% | 0 | 26.8s | 61.0% | 34.5% |
| vanguard-wedge | 150 | 88 | 58.7% | 0 | 26.5s | 52.9% | 39.0% |
| wide-line | 150 | 81 | 54.0% | 0 | 24.9s | 56.9% | 44.0% |
| left-flank | 146 | 90 | 61.6% | 0 | 27.3s | 53.5% | 36.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 174 | 58.0% | 0 | 27.2s | 56.6% | 39.4% |
| drip | 300 | 158 | 52.7% | 0 | 27.3s | 51.8% | 45.3% |
| rapid | 300 | 173 | 57.7% | 0 | 26.1s | 55.2% | 39.6% |
| three-waves | 300 | 176 | 58.7% | 0 | 27.5s | 58.2% | 37.7% |
| two-waves | 300 | 188 | 62.7% | 0 | 26.7s | 57.3% | 34.6% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 431 | 57.5% | 0 | 26.5s | 56.0% | 40.3% |
| tank-front-support-rear | 750 | 438 | 58.4% | 0 | 27.5s | 55.7% | 38.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 901 | 533 | 59.2% | 0 | 29.5s | 63.8% | 39.6% |
| cannon-rally | 101 | 56 | 55.4% | 0 | 14.7s | 7.1% | 28.9% |
| freeze-barrel | 101 | 61 | 60.4% | 0 | 29.2s | 64.1% | 38.9% |
| rally-rage | 101 | 58 | 57.4% | 0 | 14.9s | 5.4% | 31.5% |
| skeleton-barrel | 98 | 54 | 55.1% | 0 | 25.5s | 64.6% | 44.0% |
| freeze-defense | 97 | 50 | 51.5% | 0 | 29.3s | 61.1% | 46.7% |
| rage-entry | 92 | 50 | 54.3% | 0 | 24.3s | 61.0% | 45.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 975 | 582 | 59.7% | 0 | 28.7s | 61.6% | 38.8% |
| unrevealed | 176 | 102 | 58.0% | 0 | 24.2s | 50.2% | 36.2% |
| epic | 175 | 97 | 55.4% | 0 | 23.4s | 44.2% | 40.1% |
| legendary | 174 | 88 | 50.6% | 0 | 23.6s | 40.8% | 44.9% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 980 | 583 | 59.5% | 0 | 28.8s | 60.9% | 38.9% |
| ward-2 | 180 | 103 | 57.2% | 0 | 22.8s | 45.7% | 38.2% |
| ward-1 | 170 | 97 | 57.1% | 0 | 24.5s | 48.5% | 38.4% |
| ward-3 | 170 | 86 | 50.6% | 0 | 23.0s | 44.6% | 43.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 869 | 57.9% | 0 | 27.0s | 55.8% | 39.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 545 | 310 | 56.9% | 0 | 22.2s | 53.0% | 41.1% |
| mage | 512 | 276 | 53.9% | 0 | 24.3s | 55.9% | 44.7% |
| knight | 509 | 293 | 57.6% | 0 | 25.9s | 57.1% | 39.1% |
| demon_king | 504 | 330 | 65.5% | 0 | 24.6s | 58.2% | 32.1% |
| archer | 483 | 261 | 54.0% | 0 | 26.9s | 53.1% | 43.7% |
| mimic | 475 | 282 | 59.4% | 0 | 27.4s | 58.9% | 37.8% |
| mechanical_dragon | 382 | 219 | 57.3% | 0 | 24.8s | 55.9% | 40.6% |
| pea_shooter | 349 | 192 | 55.0% | 0 | 26.5s | 55.8% | 43.5% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 48.0% | 38.5%-57.7% | 56.9% | 50.5% | 24.4% |
| demon_king | 100 | 87.0% | 79.0%-92.2% | 78.7% | 11.5% | 69.4% |
| fire_dragon | 100 | 60.0% | 50.2%-69.1% | 64.6% | 39.8% | 52.5% |
| knight | 100 | 59.0% | 49.2%-68.1% | 64.9% | 39.4% | 43.9% |
| mage | 100 | 48.0% | 38.5%-57.7% | 56.0% | 50.8% | 26.4% |
| mechanical_dragon | 100 | 58.0% | 48.2%-67.2% | 67.0% | 41.2% | 46.1% |
| mimic | 100 | 62.0% | 52.2%-70.9% | 65.5% | 34.9% | 57.4% |
| pea_shooter | 100 | 49.0% | 39.4%-58.7% | 56.5% | 50.1% | 28.9% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 100 | 48.0% | 38.5%-57.7% | 56.9% | 50.5% | 24.4% |
| demon_king\|TH6 | 100 | 87.0% | 79.0%-92.2% | 78.7% | 11.5% | 69.4% |
| fire_dragon\|TH6 | 100 | 60.0% | 50.2%-69.1% | 64.6% | 39.8% | 52.5% |
| knight\|TH6 | 100 | 59.0% | 49.2%-68.1% | 64.9% | 39.4% | 43.9% |
| mage\|TH6 | 100 | 48.0% | 38.5%-57.7% | 56.0% | 50.8% | 26.4% |
| mechanical_dragon\|TH6 | 100 | 58.0% | 48.2%-67.2% | 67.0% | 41.2% | 46.1% |
| mimic\|TH6 | 100 | 62.0% | 52.2%-70.9% | 65.5% | 34.9% | 57.4% |
| pea_shooter\|TH6 | 100 | 49.0% | 39.4%-58.7% | 56.5% | 50.1% | 28.9% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 16 | 0.0% | 97.7% |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 16 | 0.0% | 94.2% |
| th6-compact-core-091 | 6 | compact-core | maxed | 16 | 0.0% | 94.1% |
| th6-diamond-012 | 6 | diamond | maxed | 16 | 0.0% | 92.4% |
| th6-resource-shield-006 | 6 | resource-shield | maxed | 15 | 0.0% | 99.6% |
| th6-rear-keep-085 | 6 | rear-keep | maxed | 15 | 0.0% | 97.9% |
| th6-layered-rings-057 | 6 | layered-rings | maxed | 15 | 0.0% | 96.6% |
| th6-compact-core-001 | 6 | compact-core | maxed | 15 | 0.0% | 91.9% |
| th6-crossfire-051 | 6 | crossfire | maxed | 14 | 0.0% | 93.9% |
| th6-resource-shield-096 | 6 | resource-shield | maxed | 14 | 0.0% | 89.0% |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 16 | 6.3% | 92.4% |
| th6-wide-spread-025 | 6 | wide-spread | rushed-defense | 16 | 6.3% | 89.2% |
| th6-resource-shield-042 | 6 | resource-shield | rushed-defense | 16 | 6.3% | 88.3% |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 16 | 6.3% | 87.6% |
| th6-asymmetric-right-099 | 6 | asymmetric-right | rushed-defense | 16 | 6.3% | 87.5% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,038 | 5,270 | 1,759.5 | 1,317.5 |  |
| fire_dragon | 7 | 10 | 16,000 | 7,142.86 | 1,600 | 714.29 |  |
| archer | 7 | 1 | 1,764 | 609.68 | 1,764 | 609.68 |  |
| demon_king | 7 | 5 | 26,220 | 2,836.67 | 5,244 | 567.33 |  |
| necromancer | 7 | 15 | 22,560 | 6,888.89 | 1,504 | 459.26 |  |
| knight | 7 | 1 | 4,180 | 452.22 | 4,180 | 452.22 |  |
| mechanical_dragon | 7 | 4 | 6,000 | 1,700.97 | 1,500 | 425.24 | chain x3 |
| mimic | 7 | 6 | 23,400 | 1,732.08 | 3,900 | 288.68 | trap immune |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| pea_shooter | 7 | 5 | 11,000 | 777.14 | 2,200 | 155.43 |  |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-hp-outlier:** demon_king HP/slot is 2.82x median.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3x median.
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 87.0% attacker wins across 100 samples (reference 58.9%).
- **WARNING / degenerate-pure-army:** Pure demon_king armies have 87.0% attacker wins across 100 isolated samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-012 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-096 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-063 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-091 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-029 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-051 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **INFO / fragile-base:** th6-defense-ring-092 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-diamond-012 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-diamond-030 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-diamond-066 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-left-016 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-echelon-right-017 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-right-089 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-090 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-rear-keep-049 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-rear-keep-067 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-rear-keep-085 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-resource-shield-096 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-022 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-split-core-094 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-010 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-028 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-100 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-wide-spread-097 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-asymmetric-left-044 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-right-027 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-right-045 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-063 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-cannon-screen-032 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-cannon-screen-050 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-compact-core-055 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-091 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-corner-keep-029 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-corner-keep-083 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-015 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-crossfire-051 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-defense-ring-038 has 100.0% attacker wins across 15 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
