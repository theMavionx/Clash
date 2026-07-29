# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T11:47:43.459Z
**Seed:** 65006
**Town Halls:** TH6
**Unique generated bases:** 100
**Unique attack policies:** 180
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 800
**Unbeaten non-adaptive bases (n >= 12):** 23
**Breakability probe:** 3800 calibration + gate battles; 0/100 tested bases unbeaten
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** knight=1.1x, mage=1.7x, archer=1.05x, mimic=1.5x, demon_king=1.05x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 0.85x
**Balance replay simulations:** 1500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 81.3s

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
| 1500 | 867 | 57.8% | 0 | 27.8s | 55.2% | 39.3% | 36.2% |

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
| TH6->TH6 | 1500 | 867 | 57.8% | 0 | 27.8s | 55.2% | 39.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel | 92 | 60 | 65.2% | 0 | 27.2s | 58.0% | 32.9% |
| layered-rings | 91 | 44 | 48.4% | 0 | 25.8s | 52.3% | 47.9% |
| resource-shield | 91 | 39 | 42.9% | 0 | 26.9s | 49.6% | 54.1% |
| wide-spread | 91 | 67 | 73.6% | 0 | 32.0s | 65.7% | 24.5% |
| asymmetric-left | 90 | 45 | 50.0% | 0 | 27.5s | 55.7% | 46.8% |
| asymmetric-right | 90 | 43 | 47.8% | 0 | 25.3s | 51.5% | 48.2% |
| compact-core | 90 | 43 | 47.8% | 0 | 26.1s | 50.8% | 49.8% |
| defense-ring | 90 | 53 | 58.9% | 0 | 27.7s | 58.2% | 36.4% |
| split-core | 90 | 57 | 63.3% | 0 | 24.7s | 55.2% | 34.7% |
| trap-lanes | 90 | 60 | 66.7% | 0 | 26.3s | 57.3% | 32.7% |
| cannon-screen | 75 | 55 | 73.3% | 0 | 31.9s | 56.6% | 24.7% |
| diamond | 75 | 33 | 44.0% | 0 | 25.8s | 51.3% | 51.8% |
| echelon-left | 75 | 49 | 65.3% | 0 | 28.4s | 54.4% | 34.2% |
| corner-keep | 74 | 35 | 47.3% | 0 | 30.3s | 54.3% | 48.9% |
| crossfire | 74 | 44 | 59.5% | 0 | 31.2s | 53.9% | 34.3% |
| echelon-right | 74 | 46 | 62.2% | 0 | 29.8s | 53.9% | 33.9% |
| kill-corridor | 74 | 52 | 70.3% | 0 | 30.2s | 60.4% | 28.4% |
| rear-keep | 74 | 42 | 56.8% | 0 | 25.6s | 53.0% | 39.8% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| southern-funnel\|TH6 | 92 | 60 | 65.2% | 0 | 27.2s | 58.0% | 32.9% |
| layered-rings\|TH6 | 91 | 44 | 48.4% | 0 | 25.8s | 52.3% | 47.9% |
| resource-shield\|TH6 | 91 | 39 | 42.9% | 0 | 26.9s | 49.6% | 54.1% |
| wide-spread\|TH6 | 91 | 67 | 73.6% | 0 | 32.0s | 65.7% | 24.5% |
| asymmetric-left\|TH6 | 90 | 45 | 50.0% | 0 | 27.5s | 55.7% | 46.8% |
| asymmetric-right\|TH6 | 90 | 43 | 47.8% | 0 | 25.3s | 51.5% | 48.2% |
| compact-core\|TH6 | 90 | 43 | 47.8% | 0 | 26.1s | 50.8% | 49.8% |
| defense-ring\|TH6 | 90 | 53 | 58.9% | 0 | 27.7s | 58.2% | 36.4% |
| split-core\|TH6 | 90 | 57 | 63.3% | 0 | 24.7s | 55.2% | 34.7% |
| trap-lanes\|TH6 | 90 | 60 | 66.7% | 0 | 26.3s | 57.3% | 32.7% |
| cannon-screen\|TH6 | 75 | 55 | 73.3% | 0 | 31.9s | 56.6% | 24.7% |
| diamond\|TH6 | 75 | 33 | 44.0% | 0 | 25.8s | 51.3% | 51.8% |
| echelon-left\|TH6 | 75 | 49 | 65.3% | 0 | 28.4s | 54.4% | 34.2% |
| corner-keep\|TH6 | 74 | 35 | 47.3% | 0 | 30.3s | 54.3% | 48.9% |
| crossfire\|TH6 | 74 | 44 | 59.5% | 0 | 31.2s | 53.9% | 34.3% |
| echelon-right\|TH6 | 74 | 46 | 62.2% | 0 | 29.8s | 53.9% | 33.9% |
| kill-corridor\|TH6 | 74 | 52 | 70.3% | 0 | 30.2s | 60.4% | 28.4% |
| rear-keep\|TH6 | 74 | 42 | 56.8% | 0 | 25.6s | 53.0% | 39.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 326 | 34 | 10.4% | 0 | 23.1s | 35.3% | 81.9% |
| maxed | 298 | 10 | 3.4% | 0 | 24.6s | 24.5% | 94.6% |
| mid | 297 | 273 | 91.9% | 0 | 32.3s | 75.0% | 6.0% |
| rushed-economy | 295 | 295 | 100.0% | 0 | 30.0s | 72.7% | 0.0% |
| mixed | 284 | 255 | 89.8% | 0 | 29.7s | 71.2% | 8.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 800 | 473 | 59.1% | 0 | 30.9s | 64.1% | 39.2% |
| policy-exploration | 700 | 394 | 56.3% | 0 | 24.3s | 45.0% | 39.4% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 800 | 473 | 59.1% | 0 | 30.9s | 64.1% | 39.2% |
| policy-exploration\|TH6 | 700 | 394 | 56.3% | 0 | 24.3s | 45.0% | 39.4% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 800 | 473 | 59.1% | 0 | 30.9s | 64.1% | 39.2% |
| policy-exploration\|freeze-rage | 89 | 54 | 60.7% | 0 | 34.2s | 67.0% | 38.4% |
| policy-exploration\|rage-entry | 89 | 48 | 53.9% | 0 | 25.2s | 60.9% | 46.1% |
| policy-exploration\|cannon-rally | 86 | 46 | 53.5% | 0 | 15.8s | 5.5% | 28.3% |
| policy-exploration\|rally-rage | 86 | 52 | 60.5% | 0 | 14.1s | 7.5% | 33.2% |
| policy-exploration\|cannon-focus | 46 | 26 | 56.5% | 0 | 33.5s | 58.8% | 42.0% |
| policy-exploration\|rally-core | 46 | 19 | 41.3% | 0 | 14.0s | 3.9% | 46.8% |
| policy-exploration\|cannon-medkit | 43 | 23 | 53.5% | 0 | 28.1s | 54.4% | 46.5% |
| policy-exploration\|freeze-barrel | 43 | 23 | 53.5% | 0 | 23.3s | 62.1% | 45.4% |
| policy-exploration\|freeze-defense | 43 | 29 | 67.4% | 0 | 31.9s | 67.7% | 31.9% |
| policy-exploration\|medkit-entry | 43 | 32 | 74.4% | 0 | 25.5s | 74.1% | 25.5% |
| policy-exploration\|none | 43 | 21 | 48.8% | 0 | 21.2s | 55.0% | 51.2% |
| policy-exploration\|skeleton-barrel | 43 | 21 | 48.8% | 0 | 32.2s | 61.1% | 47.6% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 80 | 46 | 57.5% | 0 | 32.9s | 64.7% | 40.7% |
| pure-unit-matrix\|diamond | 80 | 47 | 58.8% | 0 | 31.1s | 63.3% | 40.3% |
| pure-unit-matrix\|dual-flank | 80 | 46 | 57.5% | 0 | 32.6s | 67.2% | 40.5% |
| pure-unit-matrix\|edge-sweep | 80 | 47 | 58.8% | 0 | 29.2s | 64.4% | 41.0% |
| pure-unit-matrix\|inverted-wedge | 80 | 47 | 58.8% | 0 | 32.5s | 61.7% | 39.3% |
| pure-unit-matrix\|left-flank | 80 | 47 | 58.8% | 0 | 30.7s | 62.0% | 39.1% |
| pure-unit-matrix\|right-flank | 80 | 52 | 65.0% | 0 | 31.3s | 62.8% | 32.1% |
| pure-unit-matrix\|three-lane | 80 | 42 | 52.5% | 0 | 26.8s | 62.7% | 47.2% |
| pure-unit-matrix\|vanguard-wedge | 80 | 50 | 62.5% | 0 | 32.0s | 64.7% | 34.6% |
| pure-unit-matrix\|wide-line | 80 | 49 | 61.3% | 0 | 30.0s | 67.3% | 37.4% |
| policy-exploration\|dual-flank | 76 | 35 | 46.1% | 0 | 25.4s | 44.6% | 45.9% |
| policy-exploration\|edge-sweep | 76 | 26 | 34.2% | 0 | 22.6s | 43.6% | 58.6% |
| policy-exploration\|three-lane | 76 | 42 | 55.3% | 0 | 22.4s | 45.1% | 41.1% |
| policy-exploration\|wide-line | 76 | 50 | 65.8% | 0 | 23.5s | 46.1% | 33.5% |
| policy-exploration\|center-column | 75 | 50 | 66.7% | 0 | 22.4s | 46.5% | 29.8% |
| policy-exploration\|diamond | 75 | 42 | 56.0% | 0 | 25.3s | 44.5% | 39.9% |
| policy-exploration\|left-flank | 63 | 40 | 63.5% | 0 | 28.7s | 54.0% | 33.0% |
| policy-exploration\|vanguard-wedge | 63 | 33 | 52.4% | 0 | 26.3s | 44.2% | 46.0% |
| policy-exploration\|inverted-wedge | 60 | 39 | 65.0% | 0 | 23.0s | 38.8% | 31.0% |
| policy-exploration\|right-flank | 60 | 37 | 61.7% | 0 | 24.3s | 41.9% | 31.4% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 160 | 91 | 56.9% | 0 | 29.6s | 63.1% | 41.1% |
| pure-unit-matrix\|drip | 160 | 95 | 59.4% | 0 | 31.4s | 63.4% | 39.5% |
| pure-unit-matrix\|rapid | 160 | 107 | 66.9% | 0 | 31.2s | 67.4% | 32.1% |
| pure-unit-matrix\|three-waves | 160 | 92 | 57.5% | 0 | 31.8s | 63.2% | 40.3% |
| pure-unit-matrix\|two-waves | 160 | 88 | 55.0% | 0 | 30.5s | 63.3% | 43.1% |
| policy-exploration\|burst | 140 | 89 | 63.6% | 0 | 25.6s | 50.2% | 32.3% |
| policy-exploration\|drip | 140 | 74 | 52.9% | 0 | 23.2s | 41.5% | 44.3% |
| policy-exploration\|rapid | 140 | 78 | 55.7% | 0 | 23.7s | 41.1% | 40.5% |
| policy-exploration\|three-waves | 140 | 77 | 55.0% | 0 | 23.7s | 45.2% | 40.3% |
| policy-exploration\|two-waves | 140 | 76 | 54.3% | 0 | 25.3s | 46.9% | 39.5% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 400 | 237 | 59.3% | 0 | 31.7s | 64.6% | 38.6% |
| pure-unit-matrix\|tank-front-support-rear | 400 | 236 | 59.0% | 0 | 30.1s | 63.6% | 39.9% |
| policy-exploration\|roster-order | 350 | 195 | 55.7% | 0 | 26.2s | 48.5% | 40.0% |
| policy-exploration\|tank-front-support-rear | 350 | 199 | 56.9% | 0 | 22.4s | 41.4% | 38.8% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 200 | 143 | 71.5% | 0 | 26.0s | 55.5% | 22.7% |
| pure-mimic | 200 | 127 | 63.5% | 0 | 34.4s | 65.1% | 35.0% |
| pure-pea_shooter | 167 | 85 | 50.9% | 0 | 30.0s | 56.4% | 48.0% |
| pure-archer | 156 | 73 | 46.8% | 0 | 36.7s | 48.4% | 51.2% |
| pure-fire_dragon | 119 | 73 | 61.3% | 0 | 20.0s | 60.8% | 37.5% |
| pure-mechanical_dragon | 108 | 65 | 60.2% | 0 | 27.7s | 66.1% | 39.6% |
| air-pressure | 100 | 56 | 56.0% | 0 | 20.9s | 48.9% | 40.2% |
| pure-knight | 100 | 60 | 60.0% | 0 | 35.9s | 66.7% | 37.0% |
| pure-mage | 100 | 50 | 50.0% | 0 | 26.6s | 58.1% | 49.3% |
| random-2 | 100 | 54 | 54.0% | 0 | 20.4s | 32.7% | 40.3% |
| random-3 | 67 | 39 | 58.2% | 0 | 22.0s | 42.0% | 32.6% |
| ranged-pressure | 60 | 28 | 46.7% | 0 | 21.0s | 48.1% | 49.6% |
| support-mix | 15 | 11 | 73.3% | 0 | 20.2s | 41.7% | 26.7% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 16 | 10 | 62.5% | 0 | 36.1s | 49.4% | 31.5% |
| center-column__drip__roster-order | 16 | 12 | 75.0% | 0 | 24.5s | 58.0% | 24.6% |
| center-column__rapid__roster-order | 16 | 9 | 56.3% | 0 | 30.4s | 57.8% | 43.8% |
| center-column__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 28.8s | 60.2% | 50.0% |
| center-column__two-waves__roster-order | 16 | 3 | 18.8% | 0 | 23.8s | 26.5% | 65.9% |
| diamond__burst__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 39.5s | 65.2% | 43.8% |
| diamond__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.1s | 29.9% | 38.8% |
| diamond__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 22.9s | 60.4% | 43.8% |
| diamond__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 30.0s | 62.8% | 37.5% |
| diamond__two-waves__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 24.4s | 33.5% | 61.3% |
| dual-flank__burst__roster-order | 16 | 5 | 31.3% | 0 | 26.5s | 46.2% | 68.3% |
| dual-flank__drip__roster-order | 16 | 7 | 43.8% | 0 | 28.4s | 57.2% | 56.3% |
| dual-flank__drip__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 27.5s | 55.8% | 26.9% |
| dual-flank__rapid__roster-order | 16 | 7 | 43.8% | 0 | 25.0s | 47.6% | 47.6% |
| dual-flank__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.6s | 53.3% | 38.9% |
| dual-flank__three-waves__roster-order | 16 | 5 | 31.3% | 0 | 31.5s | 31.0% | 53.3% |
| dual-flank__three-waves__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 26.4s | 66.5% | 37.5% |
| dual-flank__two-waves__roster-order | 16 | 8 | 50.0% | 0 | 32.8s | 59.2% | 42.0% |
| dual-flank__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 35.4s | 77.2% | 25.0% |
| edge-sweep__burst__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 25.0s | 49.3% | 48.7% |
| edge-sweep__drip__roster-order | 16 | 6 | 37.5% | 0 | 21.5s | 39.4% | 53.9% |
| edge-sweep__drip__tank-front-support-rear | 16 | 4 | 25.0% | 0 | 21.4s | 44.3% | 75.0% |
| edge-sweep__rapid__roster-order | 16 | 7 | 43.8% | 0 | 24.7s | 54.5% | 56.3% |
| edge-sweep__rapid__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 34.5s | 59.4% | 56.3% |
| edge-sweep__three-waves__roster-order | 16 | 10 | 62.5% | 0 | 35.5s | 65.2% | 37.5% |
| edge-sweep__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 23.2s | 40.0% | 52.4% |
| edge-sweep__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 24.4s | 60.7% | 28.5% |
| edge-sweep__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.5s | 73.7% | 31.1% |
| inverted-wedge__burst__tank-front-support-rear | 16 | 6 | 37.5% | 0 | 24.8s | 37.8% | 51.9% |
| inverted-wedge__drip__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 30.3s | 45.1% | 42.1% |
| inverted-wedge__rapid__tank-front-support-rear | 16 | 9 | 56.3% | 0 | 24.8s | 54.7% | 43.8% |
| inverted-wedge__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 29.4s | 53.1% | 19.8% |
| inverted-wedge__two-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 25.6s | 35.0% | 21.7% |
| left-flank__burst__roster-order | 16 | 12 | 75.0% | 0 | 33.1s | 68.2% | 24.8% |
| left-flank__drip__roster-order | 16 | 12 | 75.0% | 0 | 30.5s | 71.2% | 25.0% |
| left-flank__rapid__roster-order | 16 | 10 | 62.5% | 0 | 32.0s | 64.1% | 36.7% |
| left-flank__three-waves__roster-order | 16 | 9 | 56.3% | 0 | 24.7s | 51.5% | 36.2% |
| left-flank__two-waves__roster-order | 16 | 6 | 37.5% | 0 | 32.7s | 46.0% | 58.3% |
| right-flank__burst__roster-order | 16 | 10 | 62.5% | 0 | 24.6s | 39.4% | 26.0% |
| right-flank__drip__roster-order | 16 | 11 | 68.8% | 0 | 31.6s | 68.2% | 24.3% |
| right-flank__rapid__roster-order | 16 | 9 | 56.3% | 0 | 28.5s | 59.4% | 38.8% |
| right-flank__three-waves__roster-order | 16 | 13 | 81.3% | 0 | 39.8s | 69.4% | 14.2% |
| right-flank__two-waves__roster-order | 16 | 12 | 75.0% | 0 | 30.2s | 56.4% | 23.2% |
| three-lane__burst__roster-order | 16 | 6 | 37.5% | 0 | 20.5s | 44.2% | 60.5% |
| three-lane__burst__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 26.3s | 75.2% | 25.0% |
| three-lane__drip__tank-front-support-rear | 16 | 3 | 18.8% | 0 | 22.9s | 30.8% | 79.7% |
| three-lane__rapid__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 21.0s | 38.9% | 23.2% |
| three-lane__three-waves__tank-front-support-rear | 16 | 5 | 31.3% | 0 | 22.8s | 39.4% | 67.8% |
| three-lane__two-waves__tank-front-support-rear | 16 | 11 | 68.8% | 0 | 26.7s | 61.3% | 21.0% |
| vanguard-wedge__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 24.7s | 49.1% | 32.5% |
| vanguard-wedge__drip__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 30.3s | 57.7% | 50.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 16 | 8 | 50.0% | 0 | 28.1s | 46.7% | 48.9% |
| vanguard-wedge__three-waves__tank-front-support-rear | 16 | 12 | 75.0% | 0 | 32.6s | 70.2% | 25.0% |
| vanguard-wedge__two-waves__tank-front-support-rear | 16 | 7 | 43.8% | 0 | 20.9s | 43.7% | 56.3% |
| wide-line__burst__roster-order | 16 | 15 | 93.8% | 0 | 34.1s | 86.2% | 6.3% |
| wide-line__burst__tank-front-support-rear | 16 | 10 | 62.5% | 0 | 18.2s | 34.5% | 36.7% |
| wide-line__drip__roster-order | 16 | 5 | 31.3% | 0 | 25.8s | 42.7% | 68.8% |
| wide-line__rapid__roster-order | 16 | 13 | 81.3% | 0 | 35.3s | 60.0% | 12.9% |
| wide-line__three-waves__roster-order | 16 | 8 | 50.0% | 0 | 24.3s | 54.4% | 50.0% |
| wide-line__two-waves__roster-order | 16 | 10 | 62.5% | 0 | 32.0s | 70.9% | 36.7% |
| center-column__burst__tank-front-support-rear | 15 | 13 | 86.7% | 0 | 26.9s | 77.1% | 13.3% |
| center-column__drip__tank-front-support-rear | 15 | 13 | 86.7% | 0 | 32.2s | 61.8% | 13.3% |
| center-column__rapid__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 24.7s | 65.0% | 25.9% |
| center-column__three-waves__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 23.3s | 40.6% | 36.7% |
| center-column__two-waves__tank-front-support-rear | 15 | 8 | 53.3% | 0 | 27.1s | 64.8% | 46.7% |
| diamond__burst__roster-order | 15 | 9 | 60.0% | 0 | 28.1s | 60.0% | 40.0% |
| diamond__drip__roster-order | 15 | 10 | 66.7% | 0 | 33.9s | 69.8% | 29.0% |
| diamond__rapid__roster-order | 15 | 12 | 80.0% | 0 | 24.3s | 41.7% | 20.0% |
| diamond__three-waves__roster-order | 15 | 10 | 66.7% | 0 | 29.0s | 58.6% | 32.3% |
| diamond__two-waves__roster-order | 15 | 7 | 46.7% | 0 | 26.7s | 61.1% | 52.9% |
| left-flank__burst__tank-front-support-rear | 15 | 10 | 66.7% | 0 | 25.1s | 50.7% | 28.3% |
| three-lane__drip__roster-order | 15 | 6 | 40.0% | 0 | 24.0s | 49.0% | 58.5% |
| three-lane__rapid__roster-order | 15 | 11 | 73.3% | 0 | 31.0s | 72.3% | 26.7% |
| three-lane__three-waves__roster-order | 15 | 8 | 53.3% | 0 | 24.6s | 62.0% | 46.7% |
| three-lane__two-waves__roster-order | 15 | 10 | 66.7% | 0 | 27.2s | 70.6% | 32.3% |
| vanguard-wedge__burst__roster-order | 15 | 13 | 86.7% | 0 | 32.2s | 78.5% | 10.2% |
| wide-line__drip__tank-front-support-rear | 15 | 9 | 60.0% | 0 | 26.8s | 66.7% | 39.6% |
| wide-line__rapid__tank-front-support-rear | 15 | 13 | 86.7% | 0 | 25.1s | 62.6% | 13.3% |
| wide-line__three-waves__tank-front-support-rear | 15 | 5 | 33.3% | 0 | 21.6s | 41.3% | 64.3% |
| wide-line__two-waves__tank-front-support-rear | 15 | 11 | 73.3% | 0 | 24.5s | 50.5% | 26.7% |
| dual-flank__burst__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 32.4s | 72.1% | 33.3% |
| edge-sweep__burst__roster-order | 12 | 5 | 41.7% | 0 | 21.7s | 56.7% | 58.3% |
| inverted-wedge__burst__roster-order | 12 | 8 | 66.7% | 0 | 27.9s | 65.8% | 33.3% |
| inverted-wedge__drip__roster-order | 12 | 8 | 66.7% | 0 | 29.5s | 61.4% | 33.3% |
| inverted-wedge__rapid__roster-order | 12 | 7 | 58.3% | 0 | 34.6s | 43.8% | 39.0% |
| inverted-wedge__three-waves__roster-order | 12 | 9 | 75.0% | 0 | 28.3s | 71.8% | 25.0% |
| inverted-wedge__two-waves__roster-order | 12 | 6 | 50.0% | 0 | 31.6s | 61.5% | 47.6% |
| left-flank__drip__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 34.8s | 63.6% | 33.3% |
| left-flank__rapid__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 27.2s | 46.9% | 42.4% |
| left-flank__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 29.6s | 65.7% | 33.3% |
| left-flank__two-waves__tank-front-support-rear | 12 | 6 | 50.0% | 0 | 28.2s | 55.7% | 48.5% |
| right-flank__burst__tank-front-support-rear | 12 | 1 | 8.3% | 0 | 25.9s | 40.6% | 76.9% |
| right-flank__drip__tank-front-support-rear | 12 | 9 | 75.0% | 0 | 25.2s | 49.6% | 25.0% |
| right-flank__rapid__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 22.6s | 40.1% | 33.3% |
| right-flank__three-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 22.9s | 39.5% | 33.3% |
| right-flank__two-waves__tank-front-support-rear | 12 | 8 | 66.7% | 0 | 27.3s | 68.2% | 33.3% |
| vanguard-wedge__drip__roster-order | 12 | 9 | 75.0% | 0 | 28.6s | 46.2% | 22.6% |
| vanguard-wedge__rapid__roster-order | 12 | 9 | 75.0% | 0 | 33.9s | 69.4% | 24.6% |
| vanguard-wedge__three-waves__roster-order | 12 | 5 | 41.7% | 0 | 30.9s | 54.8% | 49.3% |
| vanguard-wedge__two-waves__roster-order | 12 | 2 | 16.7% | 0 | 36.2s | 38.2% | 79.6% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| dual-flank | 156 | 81 | 51.9% | 0 | 29.1s | 56.2% | 43.2% |
| edge-sweep | 156 | 73 | 46.8% | 0 | 26.0s | 54.2% | 49.6% |
| three-lane | 156 | 84 | 53.8% | 0 | 24.7s | 54.1% | 44.2% |
| wide-line | 156 | 99 | 63.5% | 0 | 26.8s | 57.0% | 35.5% |
| center-column | 155 | 96 | 61.9% | 0 | 27.8s | 55.9% | 35.4% |
| diamond | 155 | 89 | 57.4% | 0 | 28.3s | 54.2% | 40.1% |
| left-flank | 143 | 87 | 60.8% | 0 | 29.8s | 58.5% | 36.4% |
| vanguard-wedge | 143 | 83 | 58.0% | 0 | 29.5s | 55.7% | 39.6% |
| inverted-wedge | 140 | 86 | 61.4% | 0 | 28.4s | 51.9% | 35.8% |
| right-flank | 140 | 89 | 63.6% | 0 | 28.3s | 53.8% | 31.8% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 300 | 180 | 60.0% | 0 | 27.7s | 57.1% | 37.0% |
| drip | 300 | 169 | 56.3% | 0 | 27.6s | 53.2% | 41.7% |
| rapid | 300 | 185 | 61.7% | 0 | 27.7s | 55.1% | 36.0% |
| three-waves | 300 | 169 | 56.3% | 0 | 28.0s | 54.8% | 40.3% |
| two-waves | 300 | 164 | 54.7% | 0 | 28.1s | 55.7% | 41.4% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 750 | 432 | 57.6% | 0 | 29.1s | 57.1% | 39.2% |
| tank-front-support-rear | 750 | 435 | 58.0% | 0 | 26.5s | 53.2% | 39.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 843 | 494 | 58.6% | 0 | 30.4s | 63.6% | 39.8% |
| freeze-rage | 89 | 54 | 60.7% | 0 | 34.2s | 67.0% | 38.4% |
| rage-entry | 89 | 48 | 53.9% | 0 | 25.2s | 60.9% | 46.1% |
| cannon-rally | 86 | 46 | 53.5% | 0 | 15.8s | 5.5% | 28.3% |
| rally-rage | 86 | 52 | 60.5% | 0 | 14.1s | 7.5% | 33.2% |
| cannon-focus | 46 | 26 | 56.5% | 0 | 33.5s | 58.8% | 42.0% |
| rally-core | 46 | 19 | 41.3% | 0 | 14.0s | 3.9% | 46.8% |
| cannon-medkit | 43 | 23 | 53.5% | 0 | 28.1s | 54.4% | 46.5% |
| freeze-barrel | 43 | 23 | 53.5% | 0 | 23.3s | 62.1% | 45.4% |
| freeze-defense | 43 | 29 | 67.4% | 0 | 31.9s | 67.7% | 31.9% |
| medkit-entry | 43 | 32 | 74.4% | 0 | 25.5s | 74.1% | 25.5% |
| skeleton-barrel | 43 | 21 | 48.8% | 0 | 32.2s | 61.1% | 47.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 971 | 568 | 58.5% | 0 | 29.7s | 60.5% | 39.4% |
| legendary | 179 | 104 | 58.1% | 0 | 25.2s | 45.9% | 36.5% |
| unrevealed | 176 | 102 | 58.0% | 0 | 23.2s | 44.0% | 38.1% |
| epic | 174 | 93 | 53.4% | 0 | 24.9s | 46.1% | 42.7% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 980 | 582 | 59.4% | 0 | 29.6s | 60.9% | 38.8% |
| ward-2 | 180 | 100 | 55.6% | 0 | 25.0s | 45.0% | 39.0% |
| ward-1 | 170 | 100 | 58.8% | 0 | 24.7s | 44.8% | 37.9% |
| ward-3 | 170 | 85 | 50.0% | 0 | 23.4s | 43.0% | 44.1% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1500 | 867 | 57.8% | 0 | 27.8s | 55.2% | 39.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 469 | 264 | 56.3% | 0 | 20.7s | 47.0% | 39.4% |
| mechanical_dragon | 443 | 245 | 55.3% | 0 | 22.6s | 48.1% | 40.4% |
| archer | 406 | 208 | 51.2% | 0 | 27.0s | 43.0% | 44.3% |
| pea_shooter | 402 | 209 | 52.0% | 0 | 24.7s | 46.5% | 43.8% |
| demon_king | 390 | 250 | 64.1% | 0 | 23.5s | 46.5% | 29.7% |
| mimic | 390 | 234 | 60.0% | 0 | 27.8s | 51.4% | 36.0% |
| mage | 350 | 185 | 52.9% | 0 | 22.5s | 44.9% | 42.7% |
| knight | 290 | 167 | 57.6% | 0 | 26.0s | 47.2% | 37.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 100 | 53.0% | 43.3%-62.5% | 58.6% | 45.4% | 25.2% |
| demon_king | 100 | 71.0% | 61.5%-79.0% | 74.3% | 24.6% | 61.2% |
| fire_dragon | 100 | 61.0% | 51.2%-70.0% | 64.9% | 38.0% | 55.3% |
| knight | 100 | 60.0% | 50.2%-69.1% | 66.7% | 37.0% | 43.5% |
| mage | 100 | 50.0% | 40.4%-59.6% | 58.1% | 49.3% | 28.1% |
| mechanical_dragon | 100 | 61.0% | 51.2%-70.0% | 66.4% | 38.8% | 46.0% |
| mimic | 100 | 64.0% | 54.2%-72.7% | 66.8% | 34.3% | 57.7% |
| pea_shooter | 100 | 53.0% | 43.3%-62.5% | 56.8% | 46.4% | 31.3% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 100 | 53.0% | 43.3%-62.5% | 58.6% | 45.4% | 25.2% |
| demon_king\|TH6 | 100 | 71.0% | 61.5%-79.0% | 74.3% | 24.6% | 61.2% |
| fire_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 64.9% | 38.0% | 55.3% |
| knight\|TH6 | 100 | 60.0% | 50.2%-69.1% | 66.7% | 37.0% | 43.5% |
| mage\|TH6 | 100 | 50.0% | 40.4%-59.6% | 58.1% | 49.3% | 28.1% |
| mechanical_dragon\|TH6 | 100 | 61.0% | 51.2%-70.0% | 66.4% | 38.8% | 46.0% |
| mimic\|TH6 | 100 | 64.0% | 54.2%-72.7% | 66.8% | 34.3% | 57.7% |
| pea_shooter\|TH6 | 100 | 53.0% | 43.3%-62.5% | 56.8% | 46.4% | 31.3% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-diamond-012 | 6 | diamond | maxed | 16 | 0.0% | 99.4% |
| th6-trap-lanes-046 | 6 | trap-lanes | maxed | 16 | 0.0% | 99.3% |
| th6-asymmetric-left-008 | 6 | asymmetric-left | rushed-defense | 16 | 0.0% | 98.7% |
| th6-defense-ring-074 | 6 | defense-ring | maxed | 16 | 0.0% | 97.6% |
| th6-corner-keep-029 | 6 | corner-keep | maxed | 16 | 0.0% | 97.3% |
| th6-compact-core-091 | 6 | compact-core | maxed | 16 | 0.0% | 97.3% |
| th6-asymmetric-right-063 | 6 | asymmetric-right | maxed | 16 | 0.0% | 95.4% |
| th6-corner-keep-065 | 6 | corner-keep | rushed-defense | 16 | 0.0% | 92.1% |
| th6-split-core-076 | 6 | split-core | rushed-defense | 16 | 0.0% | 90.4% |
| th6-rear-keep-031 | 6 | rear-keep | rushed-defense | 16 | 0.0% | 89.9% |
| th6-layered-rings-093 | 6 | layered-rings | rushed-defense | 16 | 0.0% | 89.3% |
| th6-resource-shield-006 | 6 | resource-shield | maxed | 15 | 0.0% | 99.2% |
| th6-compact-core-001 | 6 | compact-core | maxed | 15 | 0.0% | 99.1% |
| th6-split-core-040 | 6 | split-core | maxed | 15 | 0.0% | 98.5% |
| th6-layered-rings-057 | 6 | layered-rings | maxed | 15 | 0.0% | 97.5% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,038 | 5,270 | 1,759.5 | 1,317.5 |  |
| fire_dragon | 7 | 10 | 16,000 | 7,142.86 | 1,600 | 714.29 |  |
| archer | 7 | 1 | 1,764 | 609.68 | 1,764 | 609.68 |  |
| demon_king | 7 | 5 | 23,940 | 2,590 | 4,788 | 518 |  |
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

- **WARNING / troop-hp-outlier:** demon_king HP/slot is 2.58x median.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3x median.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-003 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-057 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-093 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-031 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-085 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-006 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-096 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-040 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-076 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-046 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-008 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-062 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-009 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-063 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-037 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-091 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-029 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-065 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-051 has 0 attacker wins across 14 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-074 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-012 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-035 has 0 attacker wins across 15 controlled/policy-exploration samples.
- **INFO / fragile-base:** th6-kill-corridor-036 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-072 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-kill-corridor-090 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-layered-rings-003 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-021 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-layered-rings-039 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-layered-rings-057 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-layered-rings-093 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-rear-keep-031 has 0.0% attacker wins across 16 samples.
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
- **INFO / unbeaten-base:** th6-split-core-040 has 0.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-split-core-076 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-split-core-094 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-010 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-028 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-046 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-trap-lanes-064 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-trap-lanes-100 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-wide-spread-007 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-wide-spread-043 has 100.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-wide-spread-097 has 100.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-008 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-left-026 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-062 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-009 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-asymmetric-right-027 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-asymmetric-right-045 has 100.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-063 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-cannon-screen-032 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-cannon-screen-050 has 100.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-cannon-screen-086 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-001 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-compact-core-019 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-037 has 0.0% attacker wins across 15 samples.
- **INFO / fragile-base:** th6-compact-core-055 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-compact-core-091 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-corner-keep-029 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-corner-keep-065 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-corner-keep-083 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-crossfire-015 has 100.0% attacker wins across 14 samples.
- **INFO / unbeaten-base:** th6-crossfire-051 has 0.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-defense-ring-038 has 100.0% attacker wins across 15 samples.
- **INFO / unbeaten-base:** th6-defense-ring-074 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th6-diamond-012 has 0.0% attacker wins across 16 samples.
- **INFO / fragile-base:** th6-diamond-066 has 100.0% attacker wins across 14 samples.
- **INFO / fragile-base:** th6-echelon-left-016 has 100.0% attacker wins across 16 samples.
- 4 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
