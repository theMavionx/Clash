# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T12:38:13.634Z
**Seed:** 71001
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 30
**Unique attack policies:** 300
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 240
**Unbeaten non-adaptive bases (n >= 6):** 12
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Balance replay simulations:** 300
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 9.1s

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
- Spawn coverage by Town Hall: TH5=77/100, TH6=84/100, TH7=92/100
- Bases exercised: 30/30

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 300 | 135 | 45.0% | 0 | 25.7s | 55.3% | 52.6% | 30.0% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 110 | 47 | 42.7% | 0 | 24.0s | 53.1% | 54.9% |
| TH6->TH6 | 100 | 44 | 44.0% | 0 | 25.9s | 54.0% | 55.0% |
| TH5->TH5 | 90 | 44 | 48.9% | 0 | 27.5s | 59.8% | 47.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 30 | 1 | 3.3% | 0 | 20.3s | 40.7% | 95.1% |
| asymmetric-right | 30 | 1 | 3.3% | 0 | 21.5s | 38.7% | 89.3% |
| compact-core | 30 | 0 | 0.0% | 0 | 22.6s | 24.5% | 100.0% |
| defense-ring | 30 | 23 | 76.7% | 0 | 32.3s | 78.3% | 18.1% |
| layered-rings | 30 | 1 | 3.3% | 0 | 19.3s | 37.4% | 93.8% |
| resource-shield | 30 | 0 | 0.0% | 0 | 20.3s | 22.4% | 98.1% |
| southern-funnel | 30 | 19 | 63.3% | 0 | 28.0s | 66.8% | 31.8% |
| split-core | 30 | 30 | 100.0% | 0 | 29.2s | 82.6% | 0.0% |
| trap-lanes | 30 | 30 | 100.0% | 0 | 31.3s | 81.9% | 0.0% |
| wide-spread | 30 | 30 | 100.0% | 0 | 31.8s | 80.1% | 0.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 11 | 0 | 0.0% | 0 | 16.5s | 30.2% | 99.2% |
| asymmetric-right\|TH7 | 11 | 0 | 0.0% | 0 | 18.1s | 33.4% | 100.0% |
| compact-core\|TH7 | 11 | 0 | 0.0% | 0 | 19.4s | 22.3% | 100.0% |
| defense-ring\|TH7 | 11 | 8 | 72.7% | 0 | 29.9s | 80.4% | 18.3% |
| layered-rings\|TH7 | 11 | 0 | 0.0% | 0 | 16.4s | 25.8% | 95.8% |
| resource-shield\|TH7 | 11 | 0 | 0.0% | 0 | 19.0s | 22.9% | 100.0% |
| southern-funnel\|TH7 | 11 | 6 | 54.5% | 0 | 28.2s | 66.0% | 35.6% |
| split-core\|TH7 | 11 | 11 | 100.0% | 0 | 30.6s | 87.7% | 0.0% |
| trap-lanes\|TH7 | 11 | 11 | 100.0% | 0 | 30.4s | 78.6% | 0.0% |
| wide-spread\|TH7 | 11 | 11 | 100.0% | 0 | 31.2s | 84.2% | 0.0% |
| asymmetric-left\|TH6 | 10 | 0 | 0.0% | 0 | 21.3s | 43.8% | 98.6% |
| asymmetric-right\|TH6 | 10 | 1 | 10.0% | 0 | 22.0s | 39.7% | 88.6% |
| compact-core\|TH6 | 10 | 0 | 0.0% | 0 | 22.1s | 22.8% | 100.0% |
| defense-ring\|TH6 | 10 | 8 | 80.0% | 0 | 30.0s | 84.1% | 20.0% |
| layered-rings\|TH6 | 10 | 1 | 10.0% | 0 | 21.3s | 41.0% | 89.5% |
| resource-shield\|TH6 | 10 | 0 | 0.0% | 0 | 21.2s | 23.4% | 96.6% |
| southern-funnel\|TH6 | 10 | 4 | 40.0% | 0 | 29.1s | 45.9% | 56.2% |
| split-core\|TH6 | 10 | 10 | 100.0% | 0 | 28.3s | 76.9% | 0.0% |
| trap-lanes\|TH6 | 10 | 10 | 100.0% | 0 | 33.1s | 86.2% | 0.0% |
| wide-spread\|TH6 | 10 | 10 | 100.0% | 0 | 30.4s | 76.6% | 0.0% |
| asymmetric-left\|TH5 | 9 | 1 | 11.1% | 0 | 23.9s | 51.2% | 86.2% |
| asymmetric-right\|TH5 | 9 | 0 | 0.0% | 0 | 25.3s | 44.8% | 77.0% |
| compact-core\|TH5 | 9 | 0 | 0.0% | 0 | 27.2s | 29.4% | 100.0% |
| defense-ring\|TH5 | 9 | 7 | 77.8% | 0 | 37.8s | 68.7% | 15.9% |
| layered-rings\|TH5 | 9 | 0 | 0.0% | 0 | 20.6s | 48.8% | 96.2% |
| resource-shield\|TH5 | 9 | 0 | 0.0% | 0 | 21.0s | 20.6% | 97.4% |
| southern-funnel\|TH5 | 9 | 9 | 100.0% | 0 | 26.6s | 92.1% | 0.0% |
| split-core\|TH5 | 9 | 9 | 100.0% | 0 | 28.6s | 82.1% | 0.0% |
| trap-lanes\|TH5 | 9 | 9 | 100.0% | 0 | 30.2s | 81.3% | 0.0% |
| wide-spread\|TH5 | 9 | 9 | 100.0% | 0 | 34.2s | 78.6% | 0.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 90 | 3 | 3.3% | 0 | 20.4s | 38.9% | 92.8% |
| maxed | 60 | 0 | 0.0% | 0 | 21.5s | 23.4% | 99.0% |
| mid | 60 | 53 | 88.3% | 0 | 32.1s | 79.2% | 9.1% |
| rushed-economy | 60 | 60 | 100.0% | 0 | 30.3s | 82.2% | 0.0% |
| mixed | 30 | 19 | 63.3% | 0 | 28.0s | 66.8% | 31.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 240 | 109 | 45.4% | 0 | 27.0s | 58.4% | 53.2% |
| policy-exploration | 60 | 26 | 43.3% | 0 | 20.4s | 42.8% | 50.2% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 90 | 39 | 43.3% | 0 | 24.8s | 54.4% | 55.4% |
| pure-unit-matrix\|TH6 | 80 | 36 | 45.0% | 0 | 27.4s | 56.6% | 54.2% |
| pure-unit-matrix\|TH5 | 70 | 34 | 48.6% | 0 | 29.4s | 66.4% | 49.4% |
| policy-exploration\|TH5 | 20 | 10 | 50.0% | 0 | 20.9s | 36.6% | 39.9% |
| policy-exploration\|TH6 | 20 | 8 | 40.0% | 0 | 19.8s | 43.6% | 58.1% |
| policy-exploration\|TH7 | 20 | 8 | 40.0% | 0 | 20.5s | 47.6% | 52.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 240 | 109 | 45.4% | 0 | 27.0s | 58.4% | 53.2% |
| policy-exploration\|cannon-focus | 11 | 7 | 63.6% | 0 | 23.4s | 67.0% | 36.4% |
| policy-exploration\|none | 10 | 3 | 30.0% | 0 | 24.8s | 47.4% | 70.0% |
| policy-exploration\|rally-core | 9 | 5 | 55.6% | 0 | 14.6s | 9.7% | 29.7% |
| policy-exploration\|cannon-rally | 8 | 2 | 25.0% | 0 | 15.0s | 4.8% | 44.2% |
| policy-exploration\|medkit-entry | 6 | 2 | 33.3% | 0 | 19.4s | 49.4% | 66.7% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 30 | 12 | 40.0% | 0 | 27.6s | 55.5% | 56.4% |
| pure-unit-matrix\|left-flank | 30 | 15 | 50.0% | 0 | 27.2s | 58.0% | 50.0% |
| pure-unit-matrix\|right-flank | 30 | 13 | 43.3% | 0 | 30.5s | 56.0% | 53.2% |
| pure-unit-matrix\|wide-line | 30 | 14 | 46.7% | 0 | 27.2s | 64.8% | 53.1% |
| pure-unit-matrix\|diamond | 20 | 9 | 45.0% | 0 | 26.6s | 63.1% | 53.3% |
| pure-unit-matrix\|dual-flank | 20 | 9 | 45.0% | 0 | 25.6s | 59.6% | 55.0% |
| pure-unit-matrix\|edge-sweep | 20 | 10 | 50.0% | 0 | 19.6s | 58.3% | 50.0% |
| pure-unit-matrix\|inverted-wedge | 20 | 12 | 60.0% | 0 | 28.7s | 61.0% | 40.0% |
| pure-unit-matrix\|three-lane | 20 | 7 | 35.0% | 0 | 30.7s | 53.6% | 61.3% |
| pure-unit-matrix\|vanguard-wedge | 20 | 8 | 40.0% | 0 | 24.0s | 54.5% | 60.0% |
| policy-exploration\|vanguard-wedge | 8 | 3 | 37.5% | 0 | 20.9s | 50.9% | 56.3% |
| policy-exploration\|diamond | 7 | 3 | 42.9% | 0 | 19.8s | 22.7% | 45.5% |
| policy-exploration\|dual-flank | 7 | 2 | 28.6% | 0 | 19.3s | 46.8% | 69.3% |
| policy-exploration\|edge-sweep | 6 | 4 | 66.7% | 0 | 23.0s | 63.7% | 33.3% |
| policy-exploration\|right-flank | 6 | 0 | 0.0% | 0 | 16.5s | 17.0% | 84.2% |
| policy-exploration\|wide-line | 6 | 2 | 33.3% | 0 | 16.7s | 40.3% | 57.3% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 48 | 26 | 54.2% | 0 | 27.4s | 63.9% | 43.7% |
| pure-unit-matrix\|drip | 48 | 14 | 29.2% | 0 | 26.5s | 50.6% | 67.7% |
| pure-unit-matrix\|rapid | 48 | 22 | 45.8% | 0 | 26.8s | 57.5% | 54.2% |
| pure-unit-matrix\|three-waves | 48 | 20 | 41.7% | 0 | 26.0s | 55.8% | 58.1% |
| pure-unit-matrix\|two-waves | 48 | 27 | 56.3% | 0 | 28.3s | 64.4% | 42.5% |
| policy-exploration\|burst | 12 | 2 | 16.7% | 0 | 20.0s | 33.2% | 63.7% |
| policy-exploration\|drip | 12 | 8 | 66.7% | 0 | 22.1s | 50.0% | 28.9% |
| policy-exploration\|rapid | 12 | 6 | 50.0% | 0 | 21.2s | 47.4% | 47.2% |
| policy-exploration\|three-waves | 12 | 4 | 33.3% | 0 | 20.1s | 34.7% | 62.0% |
| policy-exploration\|two-waves | 12 | 6 | 50.0% | 0 | 18.4s | 48.6% | 49.3% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 120 | 54 | 45.0% | 0 | 27.0s | 59.1% | 53.2% |
| pure-unit-matrix\|tank-front-support-rear | 120 | 55 | 45.8% | 0 | 27.0s | 57.8% | 53.3% |
| policy-exploration\|roster-order | 30 | 16 | 53.3% | 0 | 20.5s | 48.9% | 41.0% |
| policy-exploration\|tank-front-support-rear | 30 | 10 | 33.3% | 0 | 20.3s | 36.7% | 59.4% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-pea_shooter | 36 | 12 | 33.3% | 0 | 24.8s | 47.8% | 63.8% |
| pure-mimic | 35 | 14 | 40.0% | 0 | 30.1s | 47.8% | 53.3% |
| pure-fire_dragon | 34 | 18 | 52.9% | 0 | 18.9s | 61.6% | 47.1% |
| pure-demon_king | 33 | 20 | 60.6% | 0 | 28.3s | 68.7% | 36.8% |
| pure-archer | 32 | 11 | 34.4% | 0 | 29.1s | 53.1% | 62.2% |
| pure-knight | 32 | 14 | 43.8% | 0 | 30.4s | 60.6% | 56.1% |
| pure-mage | 30 | 13 | 43.3% | 0 | 23.0s | 57.0% | 56.7% |
| pure-mechanical_dragon | 21 | 11 | 52.4% | 0 | 24.9s | 62.6% | 47.6% |
| pure-necromancer | 11 | 6 | 54.5% | 0 | 32.7s | 51.6% | 45.5% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| right-flank | 36 | 13 | 36.1% | 0 | 28.1s | 49.5% | 58.4% |
| wide-line | 36 | 16 | 44.4% | 0 | 25.4s | 60.7% | 53.8% |
| center-column | 35 | 15 | 42.9% | 0 | 27.0s | 55.9% | 54.1% |
| left-flank | 35 | 18 | 51.4% | 0 | 26.8s | 57.7% | 46.0% |
| vanguard-wedge | 28 | 11 | 39.3% | 0 | 23.1s | 53.5% | 59.0% |
| diamond | 27 | 12 | 44.4% | 0 | 24.9s | 52.6% | 51.3% |
| dual-flank | 27 | 11 | 40.7% | 0 | 24.0s | 56.3% | 58.7% |
| edge-sweep | 26 | 14 | 53.8% | 0 | 20.4s | 59.6% | 46.2% |
| inverted-wedge | 25 | 15 | 60.0% | 0 | 27.0s | 53.7% | 40.0% |
| three-lane | 25 | 10 | 40.0% | 0 | 28.8s | 53.0% | 57.1% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 60 | 28 | 46.7% | 0 | 25.9s | 57.8% | 47.7% |
| drip | 60 | 22 | 36.7% | 0 | 25.6s | 50.5% | 59.9% |
| rapid | 60 | 28 | 46.7% | 0 | 25.7s | 55.5% | 52.8% |
| three-waves | 60 | 24 | 40.0% | 0 | 24.8s | 51.6% | 58.8% |
| two-waves | 60 | 33 | 55.0% | 0 | 26.3s | 61.3% | 43.9% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 150 | 70 | 46.7% | 0 | 25.7s | 57.1% | 50.8% |
| tank-front-support-rear | 150 | 65 | 43.3% | 0 | 25.6s | 53.6% | 54.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 250 | 112 | 44.8% | 0 | 26.9s | 58.0% | 53.9% |
| cannon-focus | 11 | 7 | 63.6% | 0 | 23.4s | 67.0% | 36.4% |
| rally-core | 9 | 5 | 55.6% | 0 | 14.6s | 9.7% | 29.7% |
| cannon-rally | 8 | 2 | 25.0% | 0 | 15.0s | 4.8% | 44.2% |
| medkit-entry | 6 | 2 | 33.3% | 0 | 19.4s | 49.4% | 66.7% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 255 | 117 | 45.9% | 0 | 26.7s | 57.4% | 52.5% |
| epic | 16 | 6 | 37.5% | 0 | 19.1s | 47.2% | 60.5% |
| legendary | 15 | 5 | 33.3% | 0 | 20.7s | 37.0% | 56.6% |
| unrevealed | 14 | 7 | 50.0% | 0 | 20.6s | 46.7% | 41.2% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 240 | 109 | 45.4% | 0 | 27.0s | 58.4% | 53.2% |
| ward-1 | 30 | 13 | 43.3% | 0 | 21.8s | 46.3% | 49.2% |
| ward-3 | 30 | 13 | 43.3% | 0 | 18.9s | 39.3% | 51.2% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 300 | 135 | 45.0% | 0 | 25.7s | 55.3% | 52.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| fire_dragon | 67 | 31 | 46.3% | 0 | 18.9s | 52.9% | 51.2% |
| demon_king | 63 | 33 | 52.4% | 0 | 24.4s | 55.9% | 43.5% |
| knight | 62 | 27 | 43.5% | 0 | 25.3s | 51.5% | 53.6% |
| mimic | 61 | 25 | 41.0% | 0 | 25.6s | 43.9% | 52.4% |
| archer | 59 | 20 | 33.9% | 0 | 24.3s | 46.1% | 61.4% |
| mage | 58 | 23 | 39.7% | 0 | 21.1s | 48.7% | 57.4% |
| pea_shooter | 49 | 16 | 32.7% | 0 | 23.0s | 44.7% | 64.7% |
| mechanical_dragon | 35 | 16 | 45.7% | 0 | 22.2s | 56.8% | 54.3% |
| necromancer | 18 | 9 | 50.0% | 0 | 28.2s | 51.4% | 49.5% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 30 | 36.7% | 21.9%-54.5% | 56.4% | 61.7% | 23.9% |
| demon_king | 30 | 60.0% | 42.3%-75.4% | 68.6% | 37.1% | 47.8% |
| fire_dragon | 30 | 50.0% | 33.2%-66.8% | 62.3% | 50.0% | 44.2% |
| knight | 30 | 46.7% | 30.2%-63.9% | 61.7% | 53.1% | 33.7% |
| mage | 30 | 43.3% | 27.4%-60.8% | 57.0% | 56.7% | 27.0% |
| mechanical_dragon | 20 | 50.0% | 29.9%-70.1% | 61.2% | 50.0% | 38.6% |
| mimic | 30 | 40.0% | 24.6%-57.7% | 51.8% | 56.6% | 34.8% |
| necromancer | 10 | 50.0% | 23.7%-76.3% | 47.7% | 50.0% | 36.7% |
| pea_shooter | 30 | 36.7% | 21.9%-54.5% | 53.2% | 60.7% | 24.1% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH5 | 10 | 50.0% | 23.7%-76.3% | 69.6% | 50.0% | 32.2% |
| archer\|TH6 | 10 | 30.0% | 10.8%-60.3% | 49.3% | 70.0% | 18.9% |
| archer\|TH7 | 10 | 30.0% | 10.8%-60.3% | 51.0% | 65.0% | 20.4% |
| demon_king\|TH5 | 10 | 60.0% | 31.3%-83.2% | 75.4% | 31.4% | 48.9% |
| demon_king\|TH6 | 10 | 70.0% | 39.7%-89.2% | 66.2% | 30.0% | 46.7% |
| demon_king\|TH7 | 10 | 50.0% | 23.7%-76.3% | 64.8% | 50.0% | 47.8% |
| fire_dragon\|TH5 | 10 | 50.0% | 23.7%-76.3% | 68.2% | 50.0% | 45.0% |
| fire_dragon\|TH6 | 10 | 50.0% | 23.7%-76.3% | 59.7% | 50.0% | 42.5% |
| fire_dragon\|TH7 | 10 | 50.0% | 23.7%-76.3% | 59.4% | 50.0% | 45.0% |
| knight\|TH5 | 10 | 50.0% | 23.7%-76.3% | 67.9% | 50.0% | 32.4% |
| knight\|TH6 | 10 | 40.0% | 16.8%-68.7% | 61.7% | 59.4% | 33.1% |
| knight\|TH7 | 10 | 50.0% | 23.7%-76.3% | 56.1% | 50.0% | 35.6% |
| mage\|TH5 | 10 | 50.0% | 23.7%-76.3% | 66.1% | 50.0% | 30.9% |
| mage\|TH6 | 10 | 30.0% | 10.8%-60.3% | 48.3% | 70.0% | 19.1% |
| mage\|TH7 | 10 | 50.0% | 23.7%-76.3% | 57.1% | 50.0% | 30.9% |
| mechanical_dragon\|TH6 | 10 | 50.0% | 23.7%-76.3% | 59.0% | 50.0% | 34.5% |
| mechanical_dragon\|TH7 | 10 | 50.0% | 23.7%-76.3% | 63.2% | 50.0% | 42.7% |
| mimic\|TH5 | 10 | 40.0% | 16.8%-68.7% | 56.4% | 57.7% | 37.1% |
| mimic\|TH6 | 10 | 50.0% | 23.7%-76.3% | 55.5% | 44.1% | 42.9% |
| mimic\|TH7 | 10 | 30.0% | 10.8%-60.3% | 44.2% | 67.9% | 24.3% |
| necromancer\|TH7 | 10 | 50.0% | 23.7%-76.3% | 47.7% | 50.0% | 36.7% |
| pea_shooter\|TH5 | 10 | 40.0% | 16.8%-68.7% | 61.1% | 56.6% | 25.6% |
| pea_shooter\|TH6 | 10 | 40.0% | 16.8%-68.7% | 53.4% | 60.0% | 26.7% |
| pea_shooter\|TH7 | 10 | 30.0% | 10.8%-60.3% | 45.8% | 65.4% | 20.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 11 | 0.0% | 100.0% |
| th7-compact-core-003 | 7 | compact-core | maxed | 11 | 0.0% | 100.0% |
| th7-resource-shield-018 | 7 | resource-shield | maxed | 11 | 0.0% | 100.0% |
| th7-asymmetric-left-024 | 7 | asymmetric-left | rushed-defense | 11 | 0.0% | 99.2% |
| th7-layered-rings-009 | 7 | layered-rings | rushed-defense | 11 | 0.0% | 95.8% |
| th6-compact-core-002 | 6 | compact-core | maxed | 10 | 0.0% | 100.0% |
| th6-asymmetric-left-023 | 6 | asymmetric-left | rushed-defense | 10 | 0.0% | 98.6% |
| th6-resource-shield-017 | 6 | resource-shield | maxed | 10 | 0.0% | 96.6% |
| th6-layered-rings-008 | 6 | layered-rings | rushed-defense | 10 | 10.0% | 89.5% |
| th6-asymmetric-right-026 | 6 | asymmetric-right | rushed-defense | 10 | 10.0% | 88.6% |
| th6-southern-funnel-014 | 6 | southern-funnel | mixed | 10 | 40.0% | 56.2% |
| th7-southern-funnel-015 | 7 | southern-funnel | mixed | 11 | 54.5% | 35.6% |
| th7-defense-ring-006 | 7 | defense-ring | mid | 11 | 72.7% | 18.3% |
| th6-defense-ring-005 | 6 | defense-ring | mid | 10 | 80.0% | 20.0% |
| th6-split-core-011 | 6 | split-core | rushed-economy | 10 | 100.0% | 0.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 9,108 | 6,820 | 2,277 | 1,705 |  |
| necromancer | 7 | 15 | 38,352 | 11,711.11 | 2,556.8 | 780.74 |  |
| fire_dragon | 7 | 10 | 17,480 | 7,805.71 | 1,748 | 780.57 |  |
| archer | 7 | 1 | 1,848 | 638.71 | 1,848 | 638.71 |  |
| demon_king | 7 | 5 | 22,284 | 2,413.33 | 4,456.8 | 482.67 |  |
| mechanical_dragon | 7 | 4 | 6,556 | 1,858.25 | 1,639 | 464.56 | chain x3 |
| knight | 7 | 1 | 4,152 | 448.89 | 4,152 | 448.89 |  |
| horror | 7 | 20 | 39,066 | 4,193.55 | 1,953.3 | 209.68 |  |
| mimic | 7 | 6 | 16,380 | 1,213.21 | 2,730 | 202.2 | trap immune |
| pea_shooter | 7 | 5 | 11,550 | 816 | 2,310 | 163.2 |  |
| ice_golem | 7 | 10 | 42,000 | 1,626.76 | 4,200 | 162.68 | defense priority |
| wind_mage | 7 | 15 | 18,800 | 1,945.45 | 1,253.33 | 129.7 |  |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.73x median.
- **WARNING / unbeaten-non-adaptive-base:** th5-asymmetric-right-025 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-layered-rings-007 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th5-resource-shield-016 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-009 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-018 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-024 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **INFO / fragile-base:** th5-trap-lanes-028 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-wide-spread-019 has 100.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-asymmetric-right-025 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-layered-rings-007 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th5-resource-shield-016 has 0.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-southern-funnel-013 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th5-split-core-010 has 100.0% attacker wins across 9 samples.
- **INFO / fragile-base:** th6-split-core-011 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th6-trap-lanes-029 has 100.0% attacker wins across 10 samples.
- **INFO / fragile-base:** th6-wide-spread-020 has 100.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-023 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-compact-core-002 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th6-resource-shield-017 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-layered-rings-009 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-resource-shield-018 has 0.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-split-core-012 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-trap-lanes-030 has 100.0% attacker wins across 11 samples.
- **INFO / fragile-base:** th7-wide-spread-021 has 100.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-024 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-027 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th7-compact-core-003 has 0.0% attacker wins across 11 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
