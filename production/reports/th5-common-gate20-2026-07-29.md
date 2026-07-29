# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:50:10.081Z
**Seed:** 65005
**Town Halls:** TH5
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 700
**Unbeaten non-adaptive bases (n >= 12):** 19
**Breakability probe:** 3800 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1.1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=0.9x, mage=1.55x, archer=1.05x, mimic=1.1x, demon_king=0.85x, fire_dragon=0.9x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.95x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 56.3s

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
| 1500 | 828 | 55.2% | 0 | 26.1s | 49.2% | 39.2% | 36.6% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 180
- Hard-base calibration battles: 1800
- Full-catalog gate battles: 2000
- Total breakability battles: 3800
- Invalid: 0
- Tested bases: 100
- Bases with zero successful elite attacks: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH5->TH5 | 1500 | 828 | 55.2% | 0 | 26.1s | 49.2% | 39.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 91 | 39 | 42.9% | 0 | 26.7s | 50.9% | 46.9% |
| asymmetric-right | 91 | 42 | 46.2% | 0 | 26.4s | 49.7% | 46.8% |
| trap-lanes | 91 | 62 | 68.1% | 0 | 25.4s | 52.3% | 29.5% |
| resource-shield | 90 | 36 | 40.0% | 0 | 24.5s | 42.7% | 49.3% |
| southern-funnel | 90 | 60 | 66.7% | 0 | 23.6s | 51.2% | 31.9% |
| wide-spread | 90 | 51 | 56.7% | 0 | 28.7s | 53.1% | 35.3% |
| compact-core | 89 | 37 | 41.6% | 0 | 26.1s | 47.8% | 54.6% |
| defense-ring | 89 | 52 | 58.4% | 0 | 27.7s | 47.2% | 32.1% |
| layered-rings | 89 | 35 | 39.3% | 0 | 25.2s | 47.5% | 51.1% |
| split-core | 89 | 58 | 65.2% | 0 | 23.7s | 51.4% | 31.5% |
| corner-keep | 76 | 39 | 51.3% | 0 | 25.5s | 51.9% | 42.1% |
| diamond | 76 | 39 | 51.3% | 0 | 28.4s | 48.8% | 45.5% |
| rear-keep | 76 | 42 | 55.3% | 0 | 24.6s | 46.3% | 38.4% |
| cannon-screen | 75 | 51 | 68.0% | 0 | 26.2s | 48.6% | 29.5% |
| crossfire | 75 | 48 | 64.0% | 0 | 27.8s | 52.6% | 34.7% |
| echelon-left | 75 | 47 | 62.7% | 0 | 26.1s | 47.6% | 33.1% |
| echelon-right | 74 | 43 | 58.1% | 0 | 26.0s | 46.5% | 37.4% |
| kill-corridor | 74 | 47 | 63.5% | 0 | 27.3s | 49.7% | 32.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH5 | 91 | 39 | 42.9% | 0 | 26.7s | 50.9% | 46.9% |
| asymmetric-right\|TH5 | 91 | 42 | 46.2% | 0 | 26.4s | 49.7% | 46.8% |
| trap-lanes\|TH5 | 91 | 62 | 68.1% | 0 | 25.4s | 52.3% | 29.5% |
| resource-shield\|TH5 | 90 | 36 | 40.0% | 0 | 24.5s | 42.7% | 49.3% |
| southern-funnel\|TH5 | 90 | 60 | 66.7% | 0 | 23.6s | 51.2% | 31.9% |
| wide-spread\|TH5 | 90 | 51 | 56.7% | 0 | 28.7s | 53.1% | 35.3% |
| compact-core\|TH5 | 89 | 37 | 41.6% | 0 | 26.1s | 47.8% | 54.6% |
| defense-ring\|TH5 | 89 | 52 | 58.4% | 0 | 27.7s | 47.2% | 32.1% |
| layered-rings\|TH5 | 89 | 35 | 39.3% | 0 | 25.2s | 47.5% | 51.1% |
| split-core\|TH5 | 89 | 58 | 65.2% | 0 | 23.7s | 51.4% | 31.5% |
| corner-keep\|TH5 | 76 | 39 | 51.3% | 0 | 25.5s | 51.9% | 42.1% |
| diamond\|TH5 | 76 | 39 | 51.3% | 0 | 28.4s | 48.8% | 45.5% |
| rear-keep\|TH5 | 76 | 42 | 55.3% | 0 | 24.6s | 46.3% | 38.4% |
| cannon-screen\|TH5 | 75 | 51 | 68.0% | 0 | 26.2s | 48.6% | 29.5% |
| crossfire\|TH5 | 75 | 48 | 64.0% | 0 | 27.8s | 52.6% | 34.7% |
| echelon-left\|TH5 | 75 | 47 | 62.7% | 0 | 26.1s | 47.6% | 33.1% |
| echelon-right\|TH5 | 74 | 43 | 58.1% | 0 | 26.0s | 46.5% | 37.4% |
| kill-corridor\|TH5 | 74 | 47 | 63.5% | 0 | 27.3s | 49.7% | 32.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 316 | 28 | 8.9% | 0 | 21.0s | 33.9% | 79.7% |
| mid | 305 | 222 | 72.8% | 0 | 34.4s | 57.3% | 20.5% |
| maxed | 303 | 14 | 4.6% | 0 | 22.6s | 21.0% | 86.8% |
| rushed-economy | 300 | 300 | 100.0% | 0 | 26.4s | 67.4% | 0.0% |
| mixed | 276 | 264 | 95.7% | 0 | 26.1s | 69.2% | 3.7% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 800 | 443 | 55.4% | 0 | 21.9s | 35.7% | 35.4% |
| pure-unit-matrix | 700 | 385 | 55.0% | 0 | 30.9s | 64.7% | 43.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH5 | 800 | 443 | 55.4% | 0 | 21.9s | 35.7% | 35.4% |
| pure-unit-matrix\|TH5 | 700 | 385 | 55.0% | 0 | 30.9s | 64.7% | 43.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 700 | 385 | 55.0% | 0 | 30.9s | 64.7% | 43.4% |
| policy-exploration\|none | 205 | 122 | 59.5% | 0 | 27.5s | 67.2% | 38.8% |
| policy-exploration\|rally-core | 205 | 101 | 49.3% | 0 | 15.1s | 5.6% | 32.0% |
| policy-exploration\|cannon-rally | 196 | 114 | 58.2% | 0 | 15.3s | 5.8% | 27.3% |
| policy-exploration\|cannon-focus | 194 | 106 | 54.6% | 0 | 29.8s | 64.7% | 43.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|right-flank | 85 | 59 | 69.4% | 0 | 23.1s | 34.4% | 22.8% |
| policy-exploration\|center-column | 80 | 45 | 56.3% | 0 | 24.2s | 42.1% | 35.2% |
| policy-exploration\|diamond | 80 | 45 | 56.3% | 0 | 23.1s | 47.9% | 41.0% |
| policy-exploration\|dual-flank | 80 | 48 | 60.0% | 0 | 25.1s | 48.1% | 32.1% |
| policy-exploration\|inverted-wedge | 80 | 48 | 60.0% | 0 | 22.3s | 42.8% | 31.7% |
| policy-exploration\|left-flank | 80 | 44 | 55.0% | 0 | 21.0s | 29.8% | 33.2% |
| policy-exploration\|three-lane | 80 | 42 | 52.5% | 0 | 17.5s | 21.3% | 38.8% |
| policy-exploration\|vanguard-wedge | 80 | 32 | 40.0% | 0 | 20.1s | 22.6% | 43.6% |
| policy-exploration\|wide-line | 80 | 45 | 56.3% | 0 | 18.3s | 28.3% | 31.3% |
| policy-exploration\|edge-sweep | 75 | 35 | 46.7% | 0 | 24.1s | 40.5% | 46.0% |
| pure-unit-matrix\|center-column | 70 | 36 | 51.4% | 0 | 31.3s | 63.3% | 47.8% |
| pure-unit-matrix\|diamond | 70 | 31 | 44.3% | 0 | 28.8s | 62.5% | 53.1% |
| pure-unit-matrix\|dual-flank | 70 | 35 | 50.0% | 0 | 29.8s | 65.1% | 49.2% |
| pure-unit-matrix\|edge-sweep | 70 | 36 | 51.4% | 0 | 31.1s | 67.0% | 45.6% |
| pure-unit-matrix\|inverted-wedge | 70 | 39 | 55.7% | 0 | 32.4s | 60.8% | 44.2% |
| pure-unit-matrix\|left-flank | 70 | 41 | 58.6% | 0 | 32.2s | 62.2% | 37.7% |
| pure-unit-matrix\|right-flank | 70 | 44 | 62.9% | 0 | 31.9s | 65.2% | 35.0% |
| pure-unit-matrix\|three-lane | 70 | 40 | 57.1% | 0 | 30.1s | 68.0% | 42.2% |
| pure-unit-matrix\|vanguard-wedge | 70 | 45 | 64.3% | 0 | 31.0s | 66.2% | 34.5% |
| pure-unit-matrix\|wide-line | 70 | 38 | 54.3% | 0 | 30.3s | 66.7% | 45.3% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|burst | 160 | 92 | 57.5% | 0 | 21.9s | 37.7% | 32.9% |
| policy-exploration\|drip | 160 | 86 | 53.8% | 0 | 21.4s | 35.3% | 39.0% |
| policy-exploration\|rapid | 160 | 95 | 59.4% | 0 | 21.1s | 35.5% | 33.0% |
| policy-exploration\|three-waves | 160 | 87 | 54.4% | 0 | 22.4s | 33.3% | 35.7% |
| policy-exploration\|two-waves | 160 | 83 | 51.9% | 0 | 22.5s | 37.1% | 36.7% |
| pure-unit-matrix\|burst | 140 | 77 | 55.0% | 0 | 29.8s | 64.4% | 42.9% |
| pure-unit-matrix\|drip | 140 | 70 | 50.0% | 0 | 30.6s | 60.4% | 48.2% |
| pure-unit-matrix\|rapid | 140 | 80 | 57.1% | 0 | 31.5s | 66.2% | 41.1% |
| pure-unit-matrix\|three-waves | 140 | 88 | 62.9% | 0 | 32.2s | 69.6% | 36.2% |
| pure-unit-matrix\|two-waves | 140 | 70 | 50.0% | 0 | 30.4s | 62.9% | 48.9% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 400 | 228 | 57.0% | 0 | 21.8s | 37.7% | 34.7% |
| policy-exploration\|tank-front-support-rear | 400 | 215 | 53.8% | 0 | 21.9s | 33.8% | 36.2% |
| pure-unit-matrix\|roster-order | 350 | 193 | 55.1% | 0 | 29.8s | 65.4% | 43.8% |
| pure-unit-matrix\|tank-front-support-rear | 350 | 192 | 54.9% | 0 | 32.0s | 64.0% | 43.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 145 | 71 | 49.0% | 0 | 33.7s | 54.3% | 46.6% |
| pure-mimic | 141 | 73 | 51.8% | 0 | 34.1s | 52.0% | 42.3% |
| pure-fire_dragon | 140 | 87 | 62.1% | 0 | 20.8s | 60.8% | 36.7% |
| pure-knight | 140 | 88 | 62.9% | 0 | 32.9s | 56.6% | 33.7% |
| pure-mage | 139 | 61 | 43.9% | 0 | 23.1s | 50.5% | 54.4% |
| pure-demon_king | 135 | 99 | 73.3% | 0 | 28.7s | 64.1% | 20.3% |
| pure-pea_shooter | 135 | 70 | 51.9% | 0 | 27.6s | 56.4% | 45.6% |
| random-1 | 46 | 19 | 41.3% | 0 | 21.4s | 29.4% | 49.9% |
| random-3 | 45 | 27 | 60.0% | 0 | 22.6s | 45.1% | 32.2% |
| support-mix | 45 | 19 | 42.2% | 0 | 20.1s | 27.5% | 48.3% |
| balanced | 44 | 22 | 50.0% | 0 | 19.3s | 38.5% | 37.2% |
| melee-pressure | 44 | 25 | 56.8% | 0 | 24.5s | 34.4% | 28.1% |
| random-5 | 44 | 26 | 59.1% | 0 | 19.3s | 36.5% | 34.2% |
| trap-runner-mix | 40 | 22 | 55.0% | 0 | 21.4s | 27.6% | 35.3% |
| hero-necro-dragon-mages | 39 | 24 | 61.5% | 0 | 19.5s | 40.9% | 32.7% |
| frontline-ranged | 36 | 20 | 55.6% | 0 | 21.3s | 43.3% | 42.1% |
| random-4 | 36 | 16 | 44.4% | 0 | 22.2s | 41.7% | 41.3% |
| random-6 | 36 | 21 | 58.3% | 0 | 23.2s | 42.9% | 28.2% |
| random-2 | 35 | 21 | 60.0% | 0 | 23.1s | 37.8% | 33.6% |
| ranged-pressure | 35 | 17 | 48.6% | 0 | 16.9s | 24.9% | 44.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 9 | 56.3% | 0 | 30.1s | 57.4% | 27.8% |
| center-column__drip__roster-order | 16 | 10 | 62.5% | 0 | 28.5s | 46.9% | 34.5% |
| center-column__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.5s | 50.2% | 27.9% |
| center-column__rapid__roster-order | 16 | 5 | 31.3% | 0 | 23.8s | 46.1% | 60.6% |
| center-column__rapid__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 27.5s | 30.8% | 68.9% |
| center-column__three-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 27.6s | 56.7% | 18.3% |
| center-column__two-waves__roster-order | 16 | 11 | 68.8% | 0 | 30.8s | 79.5% | 29.8% |
| center-column__two-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 24.1s | 35.3% | 61.3% |
| diamond__burst__roster-order | 16 | 6 | 37.5% | 0 | 25.8s | 43.1% | 56.9% |
| diamond__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 25.6s | 53.0% | 33.2% |
| diamond__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 26.6s | 55.6% | 18.8% |
| diamond__rapid__roster-order | 16 | 9 | 56.3% | 0 | 26.4s | 70.4% | 41.9% |
| diamond__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 26.2s | 55.6% | 53.2% |
| diamond__three-waves__roster-order | 16 | 6 | 37.5% | 0 | 21.2s | 41.8% | 62.2% |
| diamond__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 20.3s | 39.5% | 57.5% |
| diamond__two-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 29.0s | 59.8% | 59.9% |
| dual-flank__burst__roster-order | 16 | 9 | 56.3% | 0 | 22.9s | 52.1% | 42.0% |
| dual-flank__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 21.3s | 49.3% | 56.3% |
| dual-flank__drip__roster-order | 16 | 12 | 75.0% | 0 | 25.1s | 74.8% | 25.0% |
| dual-flank__drip__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.8s | 39.5% | 53.5% |
| dual-flank__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 22.9s | 52.5% | 31.3% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 45.2s | 59.2% | 15.5% |
| dual-flank__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 29.2s | 59.3% | 28.0% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 29.4s | 68.3% | 43.8% |
| edge-sweep__burst__tank-front-support-rear | 16 | 2 | 12.5% | 0 | 18.1s | 29.2% | 75.3% |
| edge-sweep__drip__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 27.7s | 47.6% | 79.2% |
| edge-sweep__rapid__roster-order | 16 | 10 | 62.5% | 0 | 24.8s | 54.1% | 32.9% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 25.0s | 56.6% | 22.6% |
| edge-sweep__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 28.0s | 58.9% | 22.7% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 36.4s | 65.6% | 44.0% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 25.4s | 41.0% | 64.3% |
| inverted-wedge__burst__roster-order | 16 | 8 | 50.0% | 0 | 25.1s | 62.6% | 48.1% |
| inverted-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 24.3s | 33.2% | 40.4% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.9s | 37.8% | 48.5% |
| inverted-wedge__rapid__roster-order | 16 | 10 | 62.5% | 0 | 29.1s | 65.3% | 37.5% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 29.2s | 49.3% | 22.5% |
| inverted-wedge__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 25.5s | 45.9% | 30.7% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 24.3s | 39.2% | 57.1% |
| inverted-wedge__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 25.9s | 44.5% | 37.1% |
| left-flank__burst__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 28.5s | 31.5% | 55.8% |
| left-flank__drip__roster-order | 16 | 5 | 31.3% | 0 | 26.3s | 54.0% | 58.9% |
| left-flank__rapid__roster-order | 16 | 13 | 81.3% | 0 | 19.8s | 36.2% | 18.8% |
| left-flank__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 26.6s | 52.3% | 22.3% |
| left-flank__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 26.2s | 49.2% | 30.3% |
| left-flank__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 30.3s | 51.3% | 24.1% |
| left-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 29.1s | 51.4% | 19.6% |
| left-flank__two-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 22.8s | 33.4% | 26.6% |
| right-flank__burst__roster-order | 16 | 13 | 81.3% | 0 | 24.4s | 57.3% | 18.8% |
| right-flank__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 35.0s | 73.1% | 16.3% |
| right-flank__drip__roster-order | 16 | 10 | 62.5% | 0 | 25.5s | 47.8% | 32.6% |
| right-flank__drip__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 24.1s | 31.5% | 12.2% |
| right-flank__rapid__roster-order | 16 | 13 | 81.3% | 0 | 26.3s | 58.7% | 17.5% |
| right-flank__three-waves__roster-order | 16 | 11 | 68.8% | 0 | 25.9s | 42.9% | 26.6% |
| right-flank__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 23.2s | 34.7% | 38.1% |
| right-flank__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 30.5s | 38.5% | 47.5% |
| right-flank__two-waves__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 29.3s | 49.8% | 17.1% |
| three-lane__burst__roster-order | 16 | 8 | 50.0% | 0 | 23.1s | 43.9% | 45.0% |
| three-lane__burst__tank-front-support-rear | 16 | 13 | 81.3% | 0 | 31.4s | 52.6% | 18.8% |
| three-lane__drip__roster-order | 16 | 4 | 25.0% | 0 | 22.2s | 34.4% | 71.9% |
| three-lane__rapid__roster-order | 16 | 8 | 50.0% | 0 | 24.6s | 46.7% | 44.9% |
| three-lane__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.7s | 46.9% | 41.4% |
| three-lane__three-waves__roster-order | 16 | 16 | 100.0% | 0 | 21.3s | 49.2% | 0.0% |
| three-lane__three-waves__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 22.6s | 35.9% | 36.6% |
| three-lane__two-waves__roster-order | 16 | 7 | 43.8% | 0 | 19.1s | 39.5% | 49.5% |
| vanguard-wedge__burst__roster-order | 16 | 8 | 50.0% | 0 | 26.4s | 48.7% | 34.4% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 22.9s | 31.4% | 32.5% |
| vanguard-wedge__drip__roster-order | 16 | 9 | 56.3% | 0 | 23.7s | 46.3% | 42.4% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 27.6s | 38.8% | 48.2% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 20.8s | 24.8% | 39.8% |
| vanguard-wedge__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 31.2s | 48.0% | 45.8% |
| vanguard-wedge__two-waves__roster-order | 16 | 5 | 31.3% | 0 | 20.0s | 22.8% | 61.7% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.6s | 52.0% | 40.3% |
| wide-line__burst__roster-order | 16 | 8 | 50.0% | 0 | 22.1s | 41.8% | 44.8% |
| wide-line__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 20.6s | 53.3% | 22.9% |
| wide-line__drip__roster-order | 16 | 3 | 18.8% | 0 | 20.3s | 25.9% | 69.3% |
| wide-line__drip__tank-front-support-rear | 16 | 14 | 87.5% | 0 | 26.2s | 61.1% | 12.5% |
| wide-line__rapid__roster-order | 16 | 8 | 50.0% | 0 | 23.7s | 42.5% | 45.7% |
| wide-line__three-waves__roster-order | 16 | 12 | 75.0% | 0 | 23.0s | 63.1% | 22.9% |
| wide-line__two-waves__roster-order | 16 | 9 | 56.3% | 0 | 21.5s | 46.2% | 40.4% |
| wide-line__two-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 22.0s | 29.0% | 50.8% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank | 155 | 103 | 66.5% | 0 | 27.1s | 48.3% | 28.3% |
| center-column | 150 | 81 | 54.0% | 0 | 27.5s | 52.0% | 41.1% |
| diamond | 150 | 76 | 50.7% | 0 | 25.8s | 54.7% | 46.7% |
| dual-flank | 150 | 83 | 55.3% | 0 | 27.3s | 56.0% | 40.1% |
| inverted-wedge | 150 | 87 | 58.0% | 0 | 27.0s | 51.2% | 37.5% |
| left-flank | 150 | 85 | 56.7% | 0 | 26.2s | 44.9% | 35.3% |
| three-lane | 150 | 82 | 54.7% | 0 | 23.4s | 43.1% | 40.4% |
| vanguard-wedge | 150 | 77 | 51.3% | 0 | 25.2s | 42.9% | 39.4% |
| wide-line | 150 | 83 | 55.3% | 0 | 23.9s | 46.1% | 37.8% |
| edge-sweep | 145 | 71 | 49.0% | 0 | 27.5s | 53.3% | 45.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 169 | 56.3% | 0 | 25.6s | 50.1% | 37.6% |
| drip | 300 | 156 | 52.0% | 0 | 25.7s | 47.0% | 43.3% |
| rapid | 300 | 175 | 58.3% | 0 | 25.9s | 49.8% | 36.8% |
| three-waves | 300 | 175 | 58.3% | 0 | 26.9s | 50.2% | 35.9% |
| two-waves | 300 | 153 | 51.0% | 0 | 26.2s | 49.1% | 42.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 421 | 56.1% | 0 | 25.5s | 50.6% | 39.0% |
| tank-front-support-rear | 750 | 407 | 54.3% | 0 | 26.6s | 47.9% | 39.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 905 | 507 | 56.0% | 0 | 30.1s | 65.2% | 42.4% |
| rally-core | 205 | 101 | 49.3% | 0 | 15.1s | 5.6% | 32.0% |
| cannon-rally | 196 | 114 | 58.2% | 0 | 15.3s | 5.8% | 27.3% |
| cannon-focus | 194 | 106 | 54.6% | 0 | 29.8s | 64.7% | 43.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 899 | 489 | 54.4% | 0 | 28.8s | 58.2% | 42.3% |
| legendary | 205 | 107 | 52.2% | 0 | 21.8s | 34.5% | 36.6% |
| epic | 200 | 114 | 57.0% | 0 | 22.7s | 37.7% | 35.0% |
| unrevealed | 196 | 118 | 60.2% | 0 | 21.4s | 35.4% | 31.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 880 | 492 | 55.9% | 0 | 29.2s | 59.1% | 41.0% |
| ward-1 | 220 | 122 | 55.5% | 0 | 21.4s | 36.1% | 34.0% |
| ward-3 | 220 | 114 | 51.8% | 0 | 21.5s | 34.4% | 39.8% |
| ward-2 | 180 | 100 | 55.6% | 0 | 21.9s | 35.2% | 36.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 828 | 55.2% | 0 | 26.1s | 49.2% | 39.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 630 | 350 | 55.6% | 0 | 24.0s | 41.3% | 36.3% |
| demon_king | 625 | 361 | 57.8% | 0 | 23.0s | 42.7% | 33.5% |
| fire_dragon | 621 | 341 | 54.9% | 0 | 20.8s | 41.8% | 38.1% |
| mage | 620 | 315 | 50.8% | 0 | 21.3s | 39.4% | 42.0% |
| mimic | 592 | 311 | 52.5% | 0 | 24.6s | 40.2% | 38.6% |
| archer | 587 | 301 | 51.3% | 0 | 24.1s | 40.4% | 40.9% |
| pea_shooter | 412 | 217 | 52.7% | 0 | 23.3s | 43.3% | 40.4% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 51.0% | 41.3%-60.6% | 64.1% | 48.9% | 32.0% |
| demon_king | 100 | 72.0% | 62.5%-79.9% | 75.3% | 24.7% | 55.8% |
| fire_dragon | 100 | 61.0% | 51.2%-70.0% | 68.3% | 38.2% | 47.0% |
| knight | 100 | 59.0% | 49.2%-68.1% | 66.5% | 39.6% | 39.1% |
| mage | 100 | 44.0% | 34.7%-53.8% | 57.9% | 55.3% | 29.9% |
| mimic | 100 | 48.0% | 38.5%-57.7% | 57.9% | 49.2% | 39.9% |
| pea_shooter | 100 | 50.0% | 40.4%-59.6% | 62.8% | 48.3% | 36.0% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 100 | 51.0% | 41.3%-60.6% | 64.1% | 48.9% | 32.0% |
| demon_king\|TH5 | 100 | 72.0% | 62.5%-79.9% | 75.3% | 24.7% | 55.8% |
| fire_dragon\|TH5 | 100 | 61.0% | 51.2%-70.0% | 68.3% | 38.2% | 47.0% |
| knight\|TH5 | 100 | 59.0% | 49.2%-68.1% | 66.5% | 39.6% | 39.1% |
| mage\|TH5 | 100 | 44.0% | 34.7%-53.8% | 57.9% | 55.3% | 29.9% |
| mimic\|TH5 | 100 | 48.0% | 38.5%-57.7% | 57.9% | 49.2% | 39.9% |
| pea_shooter\|TH5 | 100 | 50.0% | 40.4%-59.6% | 62.8% | 48.3% | 36.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th5-asymmetric-left-062 | 5 | asymmetric-left | maxed | 16 | 0.0% | 95.6% |
| th5-resource-shield-096 | 5 | resource-shield | maxed | 16 | 0.0% | 80.1% |
| th5-crossfire-051 | 5 | crossfire | maxed | 15 | 0.0% | 97.5% |
| th5-echelon-right-035 | 5 | echelon-right | maxed | 15 | 0.0% | 95.8% |
| th5-compact-core-001 | 5 | compact-core | maxed | 15 | 0.0% | 94.4% |
| th5-corner-keep-065 | 5 | corner-keep | rushed-defense | 15 | 0.0% | 94.1% |
| th5-diamond-012 | 5 | diamond | maxed | 15 | 0.0% | 93.8% |
| th5-southern-funnel-023 | 5 | southern-funnel | maxed | 15 | 0.0% | 93.0% |
| th5-split-core-040 | 5 | split-core | maxed | 15 | 0.0% | 91.8% |
| th5-compact-core-091 | 5 | compact-core | maxed | 15 | 0.0% | 91.5% |
| th5-layered-rings-057 | 5 | layered-rings | maxed | 15 | 0.0% | 89.4% |
| th5-asymmetric-right-099 | 5 | asymmetric-right | rushed-defense | 15 | 0.0% | 88.5% |
| th5-echelon-left-034 | 5 | echelon-left | maxed | 15 | 0.0% | 88.2% |
| th5-defense-ring-074 | 5 | defense-ring | maxed | 15 | 0.0% | 86.7% |
| th5-resource-shield-006 | 5 | resource-shield | maxed | 15 | 0.0% | 85.5% |

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
- **WARNING / pure-troop-outlier:** pure-troop demon_king has 72.0% attacker wins across 100 samples (reference 55.0%).
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-096 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-southern-funnel-023 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-wide-spread-025 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-008 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-left-062 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-099 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-091 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-corner-keep-065 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-crossfire-051 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-020 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-defense-ring-074 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-diamond-012 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-left-034 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-echelon-right-035 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-echelon-right-089 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-072 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-kill-corridor-090 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-layered-rings-039 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-rear-keep-049 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-rear-keep-067 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-resource-shield-006 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-060 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-resource-shield-078 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-resource-shield-096 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-southern-funnel-005 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-southern-funnel-023 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-077 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-southern-funnel-095 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-004 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-022 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-split-core-094 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-010 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-trap-lanes-100 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-wide-spread-025 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-008 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-left-044 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-asymmetric-left-062 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-009 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-027 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-asymmetric-right-045 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-099 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-cannon-screen-032 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-cannon-screen-050 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-cannon-screen-086 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-compact-core-055 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th5-compact-core-073 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-compact-core-091 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-corner-keep-065 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-corner-keep-083 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-crossfire-015 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th5-crossfire-033 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-crossfire-051 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-defense-ring-020 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-defense-ring-056 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th5-defense-ring-074 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-diamond-012 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-diamond-066 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-016 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-echelon-left-034 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-left-088 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th5-echelon-right-017 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th5-echelon-right-035 has 0.0% attacker wins across 15 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
