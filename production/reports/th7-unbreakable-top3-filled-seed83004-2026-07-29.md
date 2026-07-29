# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:03:22.428Z
**Seed:** 83004
**Town Halls:** TH7
**Unique generated bases:** 6
**Unique attack policies:** 500
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 54
**Unbeaten non-adaptive bases (n >= 6):** 6
**Breakability probe:** 14046 calibration + gate + focused + adaptive rescue battles; 1/6 valid-tested bases unbeaten; 0 untested; 0 invalid-only
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
**Elapsed:** 399.0s

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
- Spawn-mechanic coverage: 74/100
- Spawn coverage by Town Hall: TH7=74/100
- Bases exercised: 6/6

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 0 | 0.0% | 0 | 17.9s | 23.5% | 97.1% | 0.0% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each generated base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining distinct same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected the 3 closest distinct army compositions and systematically crossed each with every legal spawn mechanic and tactic. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 7500
- Full-catalog gate battles: 120
- Focused rescue battles: 2973
- Adaptive counter-search battles: 3453
- Initially unbeaten after elite gate: 3
- Resolved by remaining-policy search: 2
- Total breakability battles: 14046
- Invalid: 0
- Tested bases: 6/6
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 1

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-compact-core-111 | 7 | compact-core | rushed-defense | policy-0266 | candidate-rescue | 13 |
| th7-compact-core-272 | 7 | compact-core | maxed | adaptive-th7-compact-core-272-0023 | adaptive-counter-search | 20 |

| Base | TH | Archetype | Progression | Valid Attacks | Closest Policy | TH HP Left | Destruction |
|---|---:|---|---|---:|---|---:|---:|
| th7-defense-ring-222 | 7 | defense-ring | maxed | 4933 | adaptive-th7-defense-ring-222-1137 | 12.5% | 0.0% |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 100 | 0 | 0.0% | 0 | 17.9s | 23.5% | 97.1% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 50 | 0 | 0.0% | 0 | 17.4s | 25.4% | 96.0% |
| asymmetric-right | 17 | 0 | 0.0% | 0 | 16.7s | 32.3% | 99.2% |
| defense-ring | 17 | 0 | 0.0% | 0 | 17.9s | 15.0% | 96.5% |
| asymmetric-left | 16 | 0 | 0.0% | 0 | 20.8s | 17.7% | 98.6% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH7 | 50 | 0 | 0.0% | 0 | 17.4s | 25.4% | 96.0% |
| asymmetric-right\|TH7 | 17 | 0 | 0.0% | 0 | 16.7s | 32.3% | 99.2% |
| defense-ring\|TH7 | 17 | 0 | 0.0% | 0 | 17.9s | 15.0% | 96.5% |
| asymmetric-left\|TH7 | 16 | 0 | 0.0% | 0 | 20.8s | 17.7% | 98.6% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 67 | 0 | 0.0% | 0 | 18.7s | 18.5% | 96.5% |
| rushed-defense | 33 | 0 | 0.0% | 0 | 16.2s | 33.7% | 98.1% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 54 | 0 | 0.0% | 0 | 19.1s | 25.6% | 99.7% |
| policy-exploration | 46 | 0 | 0.0% | 0 | 16.5s | 21.2% | 93.9% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 54 | 0 | 0.0% | 0 | 19.1s | 25.6% | 99.7% |
| policy-exploration\|TH7 | 46 | 0 | 0.0% | 0 | 16.5s | 21.2% | 93.9% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 27 | 0 | 0.0% | 0 | 16.2s | 20.3% | 96.3% |
| policy-exploration\|fire_dragon | 22 | 0 | 0.0% | 0 | 14.1s | 19.4% | 92.5% |
| policy-exploration\|demon_king | 21 | 0 | 0.0% | 0 | 15.3s | 22.9% | 97.9% |
| policy-exploration\|archer | 20 | 0 | 0.0% | 0 | 15.1s | 21.6% | 95.1% |
| policy-exploration\|mage | 19 | 0 | 0.0% | 0 | 15.3s | 22.9% | 97.7% |
| policy-exploration\|mimic | 17 | 0 | 0.0% | 0 | 15.3s | 18.4% | 90.6% |
| policy-exploration\|mechanical_dragon | 16 | 0 | 0.0% | 0 | 15.0s | 22.2% | 93.1% |
| policy-exploration\|pea_shooter | 13 | 0 | 0.0% | 0 | 14.5s | 23.6% | 96.6% |
| policy-exploration\|necromancer | 8 | 0 | 0.0% | 0 | 16.7s | 23.4% | 100.0% |
| pure-unit-matrix\|archer | 6 | 0 | 0.0% | 0 | 20.0s | 22.6% | 100.0% |
| pure-unit-matrix\|demon_king | 6 | 0 | 0.0% | 0 | 17.8s | 26.3% | 100.0% |
| pure-unit-matrix\|fire_dragon | 6 | 0 | 0.0% | 0 | 13.2s | 31.7% | 100.0% |
| pure-unit-matrix\|knight | 6 | 0 | 0.0% | 0 | 25.4s | 27.4% | 100.0% |
| pure-unit-matrix\|mage | 6 | 0 | 0.0% | 0 | 17.7s | 21.5% | 100.0% |
| pure-unit-matrix\|mechanical_dragon | 6 | 0 | 0.0% | 0 | 19.8s | 34.4% | 97.7% |
| pure-unit-matrix\|mimic | 6 | 0 | 0.0% | 0 | 18.3s | 15.6% | 100.0% |
| pure-unit-matrix\|necromancer | 6 | 0 | 0.0% | 0 | 23.3s | 25.8% | 100.0% |
| pure-unit-matrix\|pea_shooter | 6 | 0 | 0.0% | 0 | 16.5s | 24.7% | 100.0% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH7 | 27 | 0 | 0.0% | 0 | 16.2s | 20.3% | 96.3% |
| policy-exploration\|fire_dragon\|TH7 | 22 | 0 | 0.0% | 0 | 14.1s | 19.4% | 92.5% |
| policy-exploration\|demon_king\|TH7 | 21 | 0 | 0.0% | 0 | 15.3s | 22.9% | 97.9% |
| policy-exploration\|archer\|TH7 | 20 | 0 | 0.0% | 0 | 15.1s | 21.6% | 95.1% |
| policy-exploration\|mage\|TH7 | 19 | 0 | 0.0% | 0 | 15.3s | 22.9% | 97.7% |
| policy-exploration\|mimic\|TH7 | 17 | 0 | 0.0% | 0 | 15.3s | 18.4% | 90.6% |
| policy-exploration\|mechanical_dragon\|TH7 | 16 | 0 | 0.0% | 0 | 15.0s | 22.2% | 93.1% |
| policy-exploration\|pea_shooter\|TH7 | 13 | 0 | 0.0% | 0 | 14.5s | 23.6% | 96.6% |
| policy-exploration\|necromancer\|TH7 | 8 | 0 | 0.0% | 0 | 16.7s | 23.4% | 100.0% |
| pure-unit-matrix\|archer\|TH7 | 6 | 0 | 0.0% | 0 | 20.0s | 22.6% | 100.0% |
| pure-unit-matrix\|demon_king\|TH7 | 6 | 0 | 0.0% | 0 | 17.8s | 26.3% | 100.0% |
| pure-unit-matrix\|fire_dragon\|TH7 | 6 | 0 | 0.0% | 0 | 13.2s | 31.7% | 100.0% |
| pure-unit-matrix\|knight\|TH7 | 6 | 0 | 0.0% | 0 | 25.4s | 27.4% | 100.0% |
| pure-unit-matrix\|mage\|TH7 | 6 | 0 | 0.0% | 0 | 17.7s | 21.5% | 100.0% |
| pure-unit-matrix\|mechanical_dragon\|TH7 | 6 | 0 | 0.0% | 0 | 19.8s | 34.4% | 97.7% |
| pure-unit-matrix\|mimic\|TH7 | 6 | 0 | 0.0% | 0 | 18.3s | 15.6% | 100.0% |
| pure-unit-matrix\|necromancer\|TH7 | 6 | 0 | 0.0% | 0 | 23.3s | 25.8% | 100.0% |
| pure-unit-matrix\|pea_shooter\|TH7 | 6 | 0 | 0.0% | 0 | 16.5s | 24.7% | 100.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 54 | 0 | 0.0% | 0 | 19.1s | 25.6% | 99.7% |
| policy-exploration\|rally-rage | 6 | 0 | 0.0% | 0 | 11.9s | 5.9% | 83.6% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 10 | 0 | 0.0% | 0 | 17.1s | 27.4% | 100.0% |
| pure-unit-matrix\|dual-flank | 10 | 0 | 0.0% | 0 | 20.1s | 24.5% | 100.0% |
| pure-unit-matrix\|left-flank | 10 | 0 | 0.0% | 0 | 20.5s | 26.1% | 100.0% |
| pure-unit-matrix\|right-flank | 10 | 0 | 0.0% | 0 | 19.7s | 26.8% | 98.6% |
| pure-unit-matrix\|wide-line | 10 | 0 | 0.0% | 0 | 19.0s | 24.2% | 100.0% |
| policy-exploration\|wide-line | 6 | 0 | 0.0% | 0 | 16.3s | 23.1% | 97.7% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 12 | 0 | 0.0% | 0 | 19.8s | 25.5% | 98.9% |
| pure-unit-matrix\|rapid | 12 | 0 | 0.0% | 0 | 19.0s | 29.3% | 100.0% |
| policy-exploration\|burst | 10 | 0 | 0.0% | 0 | 16.2s | 19.7% | 92.8% |
| policy-exploration\|rapid | 10 | 0 | 0.0% | 0 | 17.1s | 20.0% | 92.5% |
| pure-unit-matrix\|drip | 10 | 0 | 0.0% | 0 | 20.0s | 18.1% | 100.0% |
| pure-unit-matrix\|three-waves | 10 | 0 | 0.0% | 0 | 17.2s | 28.4% | 100.0% |
| pure-unit-matrix\|two-waves | 10 | 0 | 0.0% | 0 | 19.5s | 25.8% | 100.0% |
| policy-exploration\|drip | 9 | 0 | 0.0% | 0 | 16.6s | 20.4% | 93.2% |
| policy-exploration\|two-waves | 9 | 0 | 0.0% | 0 | 16.5s | 26.2% | 95.3% |
| policy-exploration\|three-waves | 8 | 0 | 0.0% | 0 | 15.8s | 19.8% | 96.1% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 27 | 0 | 0.0% | 0 | 18.4s | 25.2% | 100.0% |
| pure-unit-matrix\|tank-front-support-rear | 27 | 0 | 0.0% | 0 | 19.9s | 25.9% | 99.5% |
| policy-exploration\|roster-order | 23 | 0 | 0.0% | 0 | 15.5s | 21.3% | 92.7% |
| policy-exploration\|tank-front-support-rear | 23 | 0 | 0.0% | 0 | 17.4s | 21.0% | 95.1% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-demon_king | 9 | 0 | 0.0% | 0 | 17.7s | 27.6% | 100.0% |
| pure-necromancer | 9 | 0 | 0.0% | 0 | 22.2s | 23.7% | 100.0% |
| pure-pea_shooter | 9 | 0 | 0.0% | 0 | 15.8s | 25.4% | 100.0% |
| pure-archer | 8 | 0 | 0.0% | 0 | 20.5s | 24.2% | 100.0% |
| pure-knight | 8 | 0 | 0.0% | 0 | 26.0s | 25.4% | 100.0% |
| pure-mechanical_dragon | 8 | 0 | 0.0% | 0 | 18.9s | 34.7% | 98.3% |
| pure-mimic | 8 | 0 | 0.0% | 0 | 17.7s | 11.7% | 85.6% |
| pure-fire_dragon | 6 | 0 | 0.0% | 0 | 13.2s | 31.7% | 100.0% |
| pure-mage | 6 | 0 | 0.0% | 0 | 17.7s | 21.5% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 16 | 0 | 0.0% | 0 | 18.0s | 23.8% | 99.1% |
| center-column | 14 | 0 | 0.0% | 0 | 16.4s | 23.0% | 97.8% |
| dual-flank | 14 | 0 | 0.0% | 0 | 18.7s | 23.7% | 99.4% |
| left-flank | 14 | 0 | 0.0% | 0 | 20.1s | 25.1% | 98.3% |
| right-flank | 14 | 0 | 0.0% | 0 | 18.8s | 23.5% | 95.0% |
| three-lane | 8 | 0 | 0.0% | 0 | 16.8s | 19.0% | 93.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 22 | 0 | 0.0% | 0 | 18.1s | 22.9% | 96.1% |
| rapid | 22 | 0 | 0.0% | 0 | 18.1s | 25.1% | 96.6% |
| drip | 19 | 0 | 0.0% | 0 | 18.4s | 19.2% | 96.8% |
| two-waves | 19 | 0 | 0.0% | 0 | 18.0s | 26.0% | 97.8% |
| three-waves | 18 | 0 | 0.0% | 0 | 16.6s | 24.6% | 98.3% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 50 | 0 | 0.0% | 0 | 17.1s | 23.4% | 96.7% |
| tank-front-support-rear | 50 | 0 | 0.0% | 0 | 18.7s | 23.7% | 97.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 56 | 0 | 0.0% | 0 | 18.9s | 26.0% | 99.8% |
| rally-rage | 6 | 0 | 0.0% | 0 | 11.9s | 5.9% | 83.6% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 24 | 0 | 0.0% | 0 | 14.7s | 24.2% | 98.3% |
| legendary | 12 | 0 | 0.0% | 0 | 15.5s | 23.1% | 98.3% |
| unrevealed | 11 | 0 | 0.0% | 0 | 14.8s | 21.1% | 90.4% |
| epic | 8 | 0 | 0.0% | 0 | 14.2s | 20.6% | 94.7% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 12 | 0 | 0.0% | 0 | 16.1s | 23.9% | 99.1% |
| fire_dragon\|common | 12 | 0 | 0.0% | 0 | 13.4s | 24.5% | 97.4% |
| demon_king\|legendary | 7 | 0 | 0.0% | 0 | 16.1s | 24.0% | 98.8% |
| fire_dragon\|unrevealed | 6 | 0 | 0.0% | 0 | 14.2s | 19.9% | 86.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 66 | 0 | 0.0% | 0 | 18.9s | 25.2% | 98.6% |
| ward-2 | 12 | 0 | 0.0% | 0 | 14.9s | 17.2% | 94.2% |
| ward-1 | 11 | 0 | 0.0% | 0 | 16.2s | 22.9% | 96.3% |
| ward-3 | 11 | 0 | 0.0% | 0 | 16.6s | 21.1% | 91.8% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 100 | 0 | 0.0% | 0 | 17.9s | 23.5% | 97.1% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 33 | 0 | 0.0% | 0 | 17.9s | 21.6% | 97.0% |
| fire_dragon | 28 | 0 | 0.0% | 0 | 13.9s | 22.0% | 94.1% |
| demon_king | 27 | 0 | 0.0% | 0 | 15.8s | 23.7% | 98.4% |
| archer | 26 | 0 | 0.0% | 0 | 16.2s | 21.8% | 96.2% |
| mage | 25 | 0 | 0.0% | 0 | 15.9s | 22.6% | 98.3% |
| mimic | 23 | 0 | 0.0% | 0 | 16.0s | 17.7% | 93.1% |
| mechanical_dragon | 22 | 0 | 0.0% | 0 | 16.3s | 25.5% | 94.4% |
| pea_shooter | 19 | 0 | 0.0% | 0 | 15.1s | 23.9% | 97.7% |
| necromancer | 14 | 0 | 0.0% | 0 | 19.5s | 24.4% | 100.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 6 | 0.0% | 0.0%-39.0% | 22.6% | 100.0% | 0.0% |
| demon_king | 6 | 0.0% | 0.0%-39.0% | 26.3% | 100.0% | 0.0% |
| fire_dragon | 6 | 0.0% | 0.0%-39.0% | 31.7% | 100.0% | 0.0% |
| knight | 6 | 0.0% | 0.0%-39.0% | 27.4% | 100.0% | 0.0% |
| mage | 6 | 0.0% | 0.0%-39.0% | 21.5% | 100.0% | 0.0% |
| mechanical_dragon | 6 | 0.0% | 0.0%-39.0% | 34.4% | 97.7% | 0.0% |
| mimic | 6 | 0.0% | 0.0%-39.0% | 15.6% | 100.0% | 0.0% |
| necromancer | 6 | 0.0% | 0.0%-39.0% | 25.8% | 100.0% | 0.0% |
| pea_shooter | 6 | 0.0% | 0.0%-39.0% | 24.7% | 100.0% | 0.0% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH7 | 6 | 0.0% | 0.0%-39.0% | 22.6% | 100.0% | 0.0% |
| demon_king\|TH7 | 6 | 0.0% | 0.0%-39.0% | 26.3% | 100.0% | 0.0% |
| fire_dragon\|TH7 | 6 | 0.0% | 0.0%-39.0% | 31.7% | 100.0% | 0.0% |
| knight\|TH7 | 6 | 0.0% | 0.0%-39.0% | 27.4% | 100.0% | 0.0% |
| mage\|TH7 | 6 | 0.0% | 0.0%-39.0% | 21.5% | 100.0% | 0.0% |
| mechanical_dragon\|TH7 | 6 | 0.0% | 0.0%-39.0% | 34.4% | 97.7% | 0.0% |
| mimic\|TH7 | 6 | 0.0% | 0.0%-39.0% | 15.6% | 100.0% | 0.0% |
| necromancer\|TH7 | 6 | 0.0% | 0.0%-39.0% | 25.8% | 100.0% | 0.0% |
| pea_shooter\|TH7 | 6 | 0.0% | 0.0%-39.0% | 24.7% | 100.0% | 0.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-027 | 7 | asymmetric-right | rushed-defense | 17 | 0.0% | 99.2% |
| th7-defense-ring-222 | 7 | defense-ring | maxed | 17 | 0.0% | 96.5% |
| th7-compact-core-003 | 7 | compact-core | maxed | 17 | 0.0% | 96.5% |
| th7-compact-core-272 | 7 | compact-core | maxed | 17 | 0.0% | 94.7% |
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 16 | 0.0% | 98.6% |
| th7-compact-core-111 | 7 | compact-core | rushed-defense | 16 | 0.0% | 97.0% |

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
- **CRITICAL / spawn-coverage:** Missing 26/100 spawn mechanics in simulated coverage.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 0.0% attacker wins across 46 samples; authored target is 47.0%-63.0%.
- **CRITICAL / unbreakable-base-probe:** 1/6 bases survived the elite gate and every remaining distinct same-TH attack policy at common rarity.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 0.0% is outside 55.0% +/- 8.0% across 46 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-027 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-111 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-272 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 17 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 16 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-027 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th7-compact-core-003 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th7-compact-core-111 has 0.0% attacker wins across 16 samples.
- **INFO / unbeaten-base:** th7-compact-core-272 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th7-defense-ring-222 has 0.0% attacker wins across 17 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-186 has 0.0% attacker wins across 16 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
