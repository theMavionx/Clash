# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:03:08.080Z
**Seed:** 83003
**Town Halls:** TH7
**Unique generated bases:** 10
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 90
**Unbeaten non-adaptive bases (n >= 6):** 10
**Breakability probe:** 13261 calibration + gate + focused + adaptive rescue battles; 0/10 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 100
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 384.6s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all 18 base archetypes.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 12/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 94/100
- Spawn coverage by Town Hall: TH7=94/100
- Bases exercised: 10/10

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0 | 0.0% | 0 | 20.2s | 23.6% | 97.3% | 0.0% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected the 3 closest distinct army compositions and systematically crossed each with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 7500
- Full-catalog gate battles: 200
- Focused rescue battles: 4440
- Adaptive counter-search battles: 1121
- Initially unbeaten after elite gate: 3
- Resolved by remaining-policy search: 3
- Total breakability battles: 13261
- Invalid: 0
- Tested bases: 10/10
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | adaptive-th7-asymmetric-right-027-0028 | adaptive-counter-search | 26 |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | adaptive-th7-asymmetric-right-189-0026 | adaptive-counter-search | 24 |
| th7-corner-keep-195 | 7 | corner-keep | rushed-defense | adaptive-th7-corner-keep-195-1123 | adaptive-counter-search | 1071 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 100 | 0 | 0.0% | 0 | 20.2s | 23.6% | 97.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right | 30 | 0 | 0.0% | 0 | 18.5s | 26.3% | 97.8% |
| compact-core | 20 | 0 | 0.0% | 0 | 21.1s | 19.4% | 98.4% |
| asymmetric-left | 10 | 0 | 0.0% | 0 | 23.7s | 21.6% | 98.0% |
| corner-keep | 10 | 0 | 0.0% | 0 | 16.5s | 29.0% | 95.3% |
| diamond | 10 | 0 | 0.0% | 0 | 17.7s | 20.3% | 98.8% |
| layered-rings | 10 | 0 | 0.0% | 0 | 23.9s | 23.5% | 93.7% |
| resource-shield | 10 | 0 | 0.0% | 0 | 22.5s | 23.9% | 96.9% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right\|TH7 | 30 | 0 | 0.0% | 0 | 18.5s | 26.3% | 97.8% |
| compact-core\|TH7 | 20 | 0 | 0.0% | 0 | 21.1s | 19.4% | 98.4% |
| asymmetric-left\|TH7 | 10 | 0 | 0.0% | 0 | 23.7s | 21.6% | 98.0% |
| corner-keep\|TH7 | 10 | 0 | 0.0% | 0 | 16.5s | 29.0% | 95.3% |
| diamond\|TH7 | 10 | 0 | 0.0% | 0 | 17.7s | 20.3% | 98.8% |
| layered-rings\|TH7 | 10 | 0 | 0.0% | 0 | 23.9s | 23.5% | 93.7% |
| resource-shield\|TH7 | 10 | 0 | 0.0% | 0 | 22.5s | 23.9% | 96.9% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 70 | 0 | 0.0% | 0 | 21.0s | 20.7% | 97.7% |
| rushed-defense | 30 | 0 | 0.0% | 0 | 18.4s | 30.4% | 96.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 90 | 0 | 0.0% | 0 | 20.9s | 26.0% | 99.6% |
| policy-exploration | 10 | 0 | 0.0% | 0 | 13.9s | 1.9% | 76.3% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 90 | 0 | 0.0% | 0 | 20.9s | 26.0% | 99.6% |
| policy-exploration\|TH7 | 10 | 0 | 0.0% | 0 | 13.9s | 1.9% | 76.3% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer | 10 | 0 | 0.0% | 0 | 29.6s | 24.8% | 100.0% |
| pure-unit-matrix\|demon_king | 10 | 0 | 0.0% | 0 | 19.8s | 25.5% | 100.0% |
| pure-unit-matrix\|fire_dragon | 10 | 0 | 0.0% | 0 | 15.2s | 35.2% | 98.6% |
| pure-unit-matrix\|knight | 10 | 0 | 0.0% | 0 | 27.2s | 31.3% | 98.3% |
| pure-unit-matrix\|mage | 10 | 0 | 0.0% | 0 | 16.9s | 29.0% | 100.0% |
| pure-unit-matrix\|mechanical_dragon | 10 | 0 | 0.0% | 0 | 17.8s | 39.0% | 99.9% |
| pure-unit-matrix\|mimic | 10 | 0 | 0.0% | 0 | 17.7s | 12.6% | 100.0% |
| pure-unit-matrix\|necromancer | 10 | 0 | 0.0% | 0 | 24.6s | 17.1% | 100.0% |
| pure-unit-matrix\|pea_shooter | 10 | 0 | 0.0% | 0 | 19.2s | 19.7% | 100.0% |
| policy-exploration\|mimic | 7 | 0 | 0.0% | 0 | 13.8s | 0.5% | 71.0% |
| policy-exploration\|knight | 6 | 0 | 0.0% | 0 | 13.2s | 0.5% | 76.7% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer\|TH7 | 10 | 0 | 0.0% | 0 | 29.6s | 24.8% | 100.0% |
| pure-unit-matrix\|demon_king\|TH7 | 10 | 0 | 0.0% | 0 | 19.8s | 25.5% | 100.0% |
| pure-unit-matrix\|fire_dragon\|TH7 | 10 | 0 | 0.0% | 0 | 15.2s | 35.2% | 98.6% |
| pure-unit-matrix\|knight\|TH7 | 10 | 0 | 0.0% | 0 | 27.2s | 31.3% | 98.3% |
| pure-unit-matrix\|mage\|TH7 | 10 | 0 | 0.0% | 0 | 16.9s | 29.0% | 100.0% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 10 | 0 | 0.0% | 0 | 17.8s | 39.0% | 99.9% |
| pure-unit-matrix\|mimic\|TH7 | 10 | 0 | 0.0% | 0 | 17.7s | 12.6% | 100.0% |
| pure-unit-matrix\|necromancer\|TH7 | 10 | 0 | 0.0% | 0 | 24.6s | 17.1% | 100.0% |
| pure-unit-matrix\|pea_shooter\|TH7 | 10 | 0 | 0.0% | 0 | 19.2s | 19.7% | 100.0% |
| policy-exploration\|mimic\|TH7 | 7 | 0 | 0.0% | 0 | 13.8s | 0.5% | 71.0% |
| policy-exploration\|knight\|TH7 | 6 | 0 | 0.0% | 0 | 13.2s | 0.5% | 76.7% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 90 | 0 | 0.0% | 0 | 20.9s | 26.0% | 99.6% |
| policy-exploration\|rally-core | 10 | 0 | 0.0% | 0 | 13.9s | 1.9% | 76.3% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 10 | 0 | 0.0% | 0 | 19.8s | 25.5% | 100.0% |
| pure-unit-matrix\|diamond | 10 | 0 | 0.0% | 0 | 17.7s | 12.6% | 100.0% |
| pure-unit-matrix\|dual-flank | 10 | 0 | 0.0% | 0 | 16.9s | 29.0% | 100.0% |
| pure-unit-matrix\|inverted-wedge | 10 | 0 | 0.0% | 0 | 19.2s | 19.7% | 100.0% |
| pure-unit-matrix\|left-flank | 10 | 0 | 0.0% | 0 | 15.2s | 35.2% | 98.6% |
| pure-unit-matrix\|right-flank | 10 | 0 | 0.0% | 0 | 27.2s | 31.3% | 98.3% |
| pure-unit-matrix\|three-lane | 10 | 0 | 0.0% | 0 | 17.8s | 39.0% | 99.9% |
| pure-unit-matrix\|vanguard-wedge | 10 | 0 | 0.0% | 0 | 24.6s | 17.1% | 100.0% |
| pure-unit-matrix\|wide-line | 10 | 0 | 0.0% | 0 | 29.6s | 24.8% | 100.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 18 | 0 | 0.0% | 0 | 21.0s | 28.7% | 99.2% |
| pure-unit-matrix\|drip | 18 | 0 | 0.0% | 0 | 20.0s | 24.9% | 100.0% |
| pure-unit-matrix\|rapid | 18 | 0 | 0.0% | 0 | 21.2s | 26.0% | 99.9% |
| pure-unit-matrix\|three-waves | 18 | 0 | 0.0% | 0 | 20.3s | 25.1% | 99.0% |
| pure-unit-matrix\|two-waves | 18 | 0 | 0.0% | 0 | 21.9s | 25.4% | 100.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 45 | 0 | 0.0% | 0 | 19.8s | 25.7% | 99.7% |
| pure-unit-matrix\|tank-front-support-rear | 45 | 0 | 0.0% | 0 | 22.0s | 26.3% | 99.6% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mechanical_dragon | 11 | 0 | 0.0% | 0 | 17.5s | 35.8% | 99.5% |
| pure-mimic | 11 | 0 | 0.0% | 0 | 17.7s | 11.4% | 94.3% |
| pure-necromancer | 11 | 0 | 0.0% | 0 | 23.6s | 15.8% | 100.0% |
| pure-archer | 10 | 0 | 0.0% | 0 | 29.6s | 24.8% | 100.0% |
| pure-demon_king | 10 | 0 | 0.0% | 0 | 19.8s | 25.5% | 100.0% |
| pure-fire_dragon | 10 | 0 | 0.0% | 0 | 15.2s | 35.2% | 98.6% |
| pure-knight | 10 | 0 | 0.0% | 0 | 27.2s | 31.3% | 98.3% |
| pure-mage | 10 | 0 | 0.0% | 0 | 16.9s | 29.0% | 100.0% |
| pure-pea_shooter | 10 | 0 | 0.0% | 0 | 19.2s | 19.7% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| diamond | 13 | 0 | 0.0% | 0 | 16.6s | 9.9% | 94.6% |
| left-flank | 13 | 0 | 0.0% | 0 | 15.1s | 27.8% | 90.9% |
| center-column | 10 | 0 | 0.0% | 0 | 19.8s | 25.5% | 100.0% |
| dual-flank | 10 | 0 | 0.0% | 0 | 16.9s | 29.0% | 100.0% |
| inverted-wedge | 10 | 0 | 0.0% | 0 | 19.2s | 19.7% | 100.0% |
| right-flank | 10 | 0 | 0.0% | 0 | 27.2s | 31.3% | 98.3% |
| three-lane | 10 | 0 | 0.0% | 0 | 17.8s | 39.0% | 99.9% |
| vanguard-wedge | 10 | 0 | 0.0% | 0 | 24.6s | 17.1% | 100.0% |
| wide-line | 10 | 0 | 0.0% | 0 | 29.6s | 24.8% | 100.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 20 | 0 | 0.0% | 0 | 20.1s | 25.8% | 98.1% |
| drip | 20 | 0 | 0.0% | 0 | 19.5s | 22.4% | 96.2% |
| rapid | 20 | 0 | 0.0% | 0 | 20.6s | 23.5% | 96.3% |
| three-waves | 20 | 0 | 0.0% | 0 | 19.7s | 23.2% | 97.4% |
| two-waves | 20 | 0 | 0.0% | 0 | 21.1s | 23.1% | 98.5% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 50 | 0 | 0.0% | 0 | 19.2s | 23.3% | 97.4% |
| tank-front-support-rear | 50 | 0 | 0.0% | 0 | 21.2s | 23.9% | 97.2% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 90 | 0 | 0.0% | 0 | 20.9s | 26.0% | 99.6% |
| rally-core | 10 | 0 | 0.0% | 0 | 13.9s | 1.9% | 76.3% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 20 | 0 | 0.0% | 0 | 17.5s | 30.3% | 99.3% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 10 | 0 | 0.0% | 0 | 19.8s | 25.5% | 100.0% |
| fire_dragon\|common | 10 | 0 | 0.0% | 0 | 15.2s | 35.2% | 98.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 94 | 0 | 0.0% | 0 | 20.6s | 24.9% | 98.5% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 100 | 0 | 0.0% | 0 | 20.2s | 23.6% | 97.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| mimic | 17 | 0 | 0.0% | 0 | 16.1s | 7.6% | 88.1% |
| knight | 16 | 0 | 0.0% | 0 | 21.9s | 19.8% | 90.2% |
| archer | 15 | 0 | 0.0% | 0 | 24.0s | 16.8% | 92.7% |
| demon_king | 15 | 0 | 0.0% | 0 | 17.4s | 17.0% | 93.8% |
| fire_dragon | 14 | 0 | 0.0% | 0 | 14.5s | 25.8% | 93.9% |
| mage | 13 | 0 | 0.0% | 0 | 15.7s | 22.3% | 96.8% |
| mechanical_dragon | 12 | 0 | 0.0% | 0 | 17.3s | 33.6% | 97.0% |
| necromancer | 12 | 0 | 0.0% | 0 | 22.7s | 14.5% | 98.3% |
| pea_shooter | 10 | 0 | 0.0% | 0 | 19.2s | 19.7% | 100.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 10 | 0.0% | 0.0%-27.8% | 24.8% | 100.0% | 0.0% |
| demon_king | 10 | 0.0% | 0.0%-27.8% | 25.5% | 100.0% | 0.0% |
| fire_dragon | 10 | 0.0% | 0.0%-27.8% | 35.2% | 98.6% | 0.0% |
| knight | 10 | 0.0% | 0.0%-27.8% | 31.3% | 98.3% | 0.0% |
| mage | 10 | 0.0% | 0.0%-27.8% | 29.0% | 100.0% | 0.0% |
| mechanical_dragon | 10 | 0.0% | 0.0%-27.8% | 39.0% | 99.9% | 0.0% |
| mimic | 10 | 0.0% | 0.0%-27.8% | 12.6% | 100.0% | 0.0% |
| necromancer | 10 | 0.0% | 0.0%-27.8% | 17.1% | 100.0% | 0.0% |
| pea_shooter | 10 | 0.0% | 0.0%-27.8% | 19.7% | 100.0% | 0.0% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 10 | 0.0% | 0.0%-27.8% | 24.8% | 100.0% | 0.0% |
| demon_king\|TH7 | 10 | 0.0% | 0.0%-27.8% | 25.5% | 100.0% | 0.0% |
| fire_dragon\|TH7 | 10 | 0.0% | 0.0%-27.8% | 35.2% | 98.6% | 0.0% |
| knight\|TH7 | 10 | 0.0% | 0.0%-27.8% | 31.3% | 98.3% | 0.0% |
| mage\|TH7 | 10 | 0.0% | 0.0%-27.8% | 29.0% | 100.0% | 0.0% |
| mechanical_dragon\|TH7 | 10 | 0.0% | 0.0%-27.8% | 39.0% | 99.9% | 0.0% |
| mimic\|TH7 | 10 | 0.0% | 0.0%-27.8% | 12.6% | 100.0% | 0.0% |
| necromancer\|TH7 | 10 | 0.0% | 0.0%-27.8% | 17.1% | 100.0% | 0.0% |
| pea_shooter\|TH7 | 10 | 0.0% | 0.0%-27.8% | 19.7% | 100.0% | 0.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 10 | 0.0% | 99.6% |
| th7-compact-core-003 | 7 | compact-core | maxed | 10 | 0.0% | 99.5% |
| th7-diamond-036 | 7 | diamond | maxed | 10 | 0.0% | 98.8% |
| th7-asymmetric-right-296 | 7 | asymmetric-right | rushed-defense | 10 | 0.0% | 98.2% |
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 10 | 0.0% | 98.0% |
| th7-compact-core-273 | 7 | compact-core | maxed | 10 | 0.0% | 97.4% |
| th7-resource-shield-287 | 7 | resource-shield | maxed | 10 | 0.0% | 96.9% |
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 10 | 0.0% | 95.7% |
| th7-corner-keep-195 | 7 | corner-keep | rushed-defense | 10 | 0.0% | 95.3% |
| th7-layered-rings-171 | 7 | layered-rings | maxed | 10 | 0.0% | 93.7% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,197 | 6,138.57 | 2,049.25 | 1,534.64 |  |
| necromancer | 7 | 15 | 37,260 | 11,377.78 | 2,484 | 758.52 |  |
| fire_dragon | 7 | 10 | 15,732 | 7,025.71 | 1,573.2 | 702.57 |  |
| archer | 7 | 1 | 1,746 | 603.23 | 1,746 | 603.23 |  |
| mechanical_dragon | 7 | 4 | 5,900 | 1,672.82 | 1,475 | 418.2 | chain x3 |
| demon_king | 7 | 5 | 19,260 | 2,080 | 3,852 | 416 |  |
| knight | 7 | 1 | 3,737 | 404.44 | 3,737 | 404.44 |  |
| horror | 7 | 20 | 39,384 | 4,227.42 | 1,969.2 | 211.37 |  |
| mimic | 7 | 6 | 16,200 | 1,188.68 | 2,700 | 198.11 | trap immune |
| pea_shooter | 7 | 5 | 12,060 | 848.57 | 2,412 | 169.71 |  |
| wind_mage | 7 | 15 | 21,600 | 2,454.55 | 1,440 | 163.64 |  |
| ice_golem | 7 | 10 | 39,312 | 1,521.13 | 3,931.2 | 152.11 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / coverage:** Missing content coverage. Buildings: altar; troops: none.
- **CRITICAL / spawn-coverage:** Missing 6/100 spawn mechanics in simulated coverage.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 0.0% attacker wins across 10 samples; authored target is 47.0%-63.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 0.0% is outside 55.0% +/- 8.0% across 10 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-273 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-corner-keep-195 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-diamond-036 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-layered-rings-171 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-resource-shield-287 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-296 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-compact-core-273 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-corner-keep-195 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-diamond-036 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-layered-rings-171 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-resource-shield-287 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-186 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-027 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-189 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-296 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-compact-core-003 has 0.0% attacker wins across 10 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
