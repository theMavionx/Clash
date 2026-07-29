# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:38:35.748Z
**Seed:** 83004
**Town Halls:** TH7
**Unique loaded bases:** 2
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** th7-asymmetric-left-186, th7-asymmetric-right-189
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 18
**Unbeaten non-adaptive bases (n >= 6):** 2
**Breakability probe:** 3040 calibration + gate + focused + adaptive rescue battles; 0/2 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.95x
**Lab late-tier troop scales:** mimic=1.2x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 40
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 83.1s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`; imported base and building IDs must be non-empty and unique.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
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
- Spawn-mechanic coverage: 37/100
- Spawn coverage by Town Hall: TH7=37/100
- Bases exercised: 2/2

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 40 | 0 | 0.0% | 0 | 22.0s | 19.4% | 94.5% | 0.0% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining sampled same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected up to 3 closest distinct ordered army templates and crossed each with every legal spawn mechanic and tactic, stopping at the first valid win. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. Final unbeaten bases exhausted every adaptive combination selected by this method. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 3000
- Full-catalog gate battles: 40
- Focused rescue battles: 0
- Adaptive counter-search battles: 0
- Without a valid win after elite gate: 0
- Resolved by remaining sampled policies: 0
- Resolved by adaptive counter-search: 0
- Total breakability battles: 3040
- Invalid: 0
- Tested bases: 2/2
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 40 | 0 | 0.0% | 0 | 22.0s | 19.4% | 94.5% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 20 | 0 | 0.0% | 0 | 19.5s | 18.7% | 94.7% |
| asymmetric-right | 20 | 0 | 0.0% | 0 | 24.5s | 20.2% | 94.4% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 20 | 0 | 0.0% | 0 | 19.5s | 18.7% | 94.7% |
| asymmetric-right\|TH7 | 20 | 0 | 0.0% | 0 | 24.5s | 20.2% | 94.4% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 40 | 0 | 0.0% | 0 | 22.0s | 19.4% | 94.5% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 22 | 0 | 0.0% | 0 | 20.8s | 17.7% | 90.1% |
| pure-unit-matrix | 18 | 0 | 0.0% | 0 | 23.5s | 21.5% | 100.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH7 | 22 | 0 | 0.0% | 0 | 20.8s | 17.7% | 90.1% |
| pure-unit-matrix\|TH7 | 18 | 0 | 0.0% | 0 | 23.5s | 21.5% | 100.0% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 13 | 0 | 0.0% | 0 | 20.5s | 18.1% | 91.8% |
| policy-exploration\|archer | 10 | 0 | 0.0% | 0 | 20.6s | 17.7% | 89.4% |
| policy-exploration\|fire_dragon | 10 | 0 | 0.0% | 0 | 18.8s | 15.8% | 85.9% |
| policy-exploration\|mage | 10 | 0 | 0.0% | 0 | 20.3s | 19.7% | 94.8% |
| policy-exploration\|demon_king | 9 | 0 | 0.0% | 0 | 17.6s | 16.5% | 94.2% |
| policy-exploration\|mimic | 8 | 0 | 0.0% | 0 | 17.8s | 13.7% | 83.8% |
| policy-exploration\|mechanical_dragon | 7 | 0 | 0.0% | 0 | 20.6s | 18.4% | 87.6% |
| policy-exploration\|pea_shooter | 6 | 0 | 0.0% | 0 | 21.1s | 17.7% | 91.3% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH7 | 13 | 0 | 0.0% | 0 | 20.5s | 18.1% | 91.8% |
| policy-exploration\|archer\|TH7 | 10 | 0 | 0.0% | 0 | 20.6s | 17.7% | 89.4% |
| policy-exploration\|fire_dragon\|TH7 | 10 | 0 | 0.0% | 0 | 18.8s | 15.8% | 85.9% |
| policy-exploration\|mage\|TH7 | 10 | 0 | 0.0% | 0 | 20.3s | 19.7% | 94.8% |
| policy-exploration\|demon_king\|TH7 | 9 | 0 | 0.0% | 0 | 17.6s | 16.5% | 94.2% |
| policy-exploration\|mimic\|TH7 | 8 | 0 | 0.0% | 0 | 17.8s | 13.7% | 83.8% |
| policy-exploration\|mechanical_dragon\|TH7 | 7 | 0 | 0.0% | 0 | 20.6s | 18.4% | 87.6% |
| policy-exploration\|pea_shooter\|TH7 | 6 | 0 | 0.0% | 0 | 21.1s | 17.7% | 91.3% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 18 | 0 | 0.0% | 0 | 23.5s | 21.5% | 100.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|wide-line | 10 | 0 | 0.0% | 0 | 25.0s | 24.2% | 100.0% |
| pure-unit-matrix\|center-column | 8 | 0 | 0.0% | 0 | 21.6s | 18.1% | 100.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 11 | 0 | 0.0% | 0 | 17.8s | 16.1% | 90.3% |
| policy-exploration\|tank-front-support-rear | 11 | 0 | 0.0% | 0 | 23.8s | 19.4% | 89.8% |
| pure-unit-matrix\|roster-order | 9 | 0 | 0.0% | 0 | 24.8s | 22.9% | 100.0% |
| pure-unit-matrix\|tank-front-support-rear | 9 | 0 | 0.0% | 0 | 22.2s | 20.1% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 13 | 0 | 0.0% | 0 | 25.9s | 25.3% | 100.0% |
| center-column | 10 | 0 | 0.0% | 0 | 21.0s | 17.7% | 100.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 9 | 0 | 0.0% | 0 | 23.7s | 22.2% | 93.9% |
| rapid | 8 | 0 | 0.0% | 0 | 19.9s | 12.9% | 88.2% |
| three-waves | 8 | 0 | 0.0% | 0 | 23.5s | 22.2% | 100.0% |
| two-waves | 8 | 0 | 0.0% | 0 | 20.7s | 19.0% | 95.6% |
| drip | 7 | 0 | 0.0% | 0 | 22.0s | 20.7% | 95.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 20 | 0 | 0.0% | 0 | 20.9s | 19.2% | 94.7% |
| tank-front-support-rear | 20 | 0 | 0.0% | 0 | 23.1s | 19.7% | 94.4% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 19 | 0 | 0.0% | 0 | 23.3s | 21.6% | 100.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 9 | 0 | 0.0% | 0 | 17.2s | 20.4% | 100.0% |
| legendary | 7 | 0 | 0.0% | 0 | 18.5s | 17.5% | 95.2% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 29 | 0 | 0.0% | 0 | 21.8s | 19.9% | 96.1% |
| ward-2 | 11 | 0 | 0.0% | 0 | 22.7s | 18.2% | 90.3% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 40 | 0 | 0.0% | 0 | 22.0s | 19.4% | 94.5% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 15 | 0 | 0.0% | 0 | 21.9s | 18.7% | 92.9% |
| archer | 12 | 0 | 0.0% | 0 | 23.3s | 19.4% | 91.1% |
| fire_dragon | 12 | 0 | 0.0% | 0 | 18.3s | 17.7% | 88.2% |
| mage | 12 | 0 | 0.0% | 0 | 20.3s | 20.4% | 95.7% |
| demon_king | 11 | 0 | 0.0% | 0 | 18.3s | 17.0% | 95.3% |
| mimic | 10 | 0 | 0.0% | 0 | 19.3s | 13.2% | 87.1% |
| mechanical_dragon | 9 | 0 | 0.0% | 0 | 21.0s | 20.8% | 90.4% |
| pea_shooter | 8 | 0 | 0.0% | 0 | 20.6s | 17.7% | 93.5% |
| necromancer | 6 | 0 | 0.0% | 0 | 21.9s | 17.7% | 100.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 20 | 0.0% | 94.7% |
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 20 | 0.0% | 94.4% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,177 | 6,121.43 | 2,044.25 | 1,530.36 |  |
| necromancer | 7 | 15 | 37,167 | 11,349.38 | 2,477.8 | 756.63 |  |
| archer | 7 | 1 | 2,090 | 724.19 | 2,090 | 724.19 |  |
| fire_dragon | 7 | 10 | 15,693 | 7,007.14 | 1,569.3 | 700.71 |  |
| mechanical_dragon | 7 | 4 | 5,885 | 1,668.93 | 1,471.25 | 417.23 | chain x3 |
| demon_king | 7 | 5 | 19,212 | 2,075.56 | 3,842.4 | 415.11 |  |
| knight | 7 | 1 | 3,728 | 403.33 | 3,728 | 403.33 |  |
| mimic | 7 | 6 | 19,391 | 1,422.64 | 3,231.83 | 237.11 | trap immune |
| horror | 7 | 20 | 39,285 | 4,216.94 | 1,964.25 | 210.85 |  |
| pea_shooter | 7 | 5 | 12,030 | 846.29 | 2,406 | 169.26 |  |
| wind_mage | 7 | 15 | 21,546 | 2,448.64 | 1,436.4 | 163.24 |  |
| ice_golem | 7 | 10 | 39,214 | 1,517.61 | 3,921.4 | 151.76 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / coverage:** Missing content coverage. Buildings: altar; troops: none.
- **CRITICAL / spawn-coverage:** Missing 63/100 spawn mechanics in simulated coverage.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 0.0% attacker wins across 22 samples; authored target is 47.0%-63.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 0.0% is outside 55.0% +/- 8.0% across 22 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-right-189 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-asymmetric-left-186 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-asymmetric-right-189 has 0.0% attacker wins across 20 samples.
- **INFO / unbeaten-base:** th7-asymmetric-left-186 has 0.0% attacker wins across 20 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
