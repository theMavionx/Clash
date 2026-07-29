# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:32:43.998Z
**Seed:** 83004
**Town Halls:** TH7
**Unique loaded bases:** 1
**Base report source:** `production/reports/all-unit-role-balance-final-v2-seed83004-2026-07-29.json`
**Selected base IDs:** th7-defense-ring-222
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 9
**Unbeaten non-adaptive bases (n >= 6):** 1
**Breakability probe:** 1520 calibration + gate + focused + adaptive rescue battles; 0/1 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.98x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 20
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 50.6s

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
- Spawn-mechanic coverage: 19/100
- Spawn coverage by Town Hall: TH7=19/100
- Bases exercised: 1/1

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 20 | 0 | 0.0% | 0 | 19.5s | 16.5% | 98.6% | 0.0% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining sampled same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected up to 3 closest distinct ordered army templates and crossed each with every legal spawn mechanic and tactic, stopping at the first valid win. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. Final unbeaten bases exhausted every adaptive combination selected by this method. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 1500
- Full-catalog gate battles: 20
- Focused rescue battles: 0
- Adaptive counter-search battles: 0
- Without a valid win after elite gate: 0
- Resolved by remaining sampled policies: 0
- Resolved by adaptive counter-search: 0
- Total breakability battles: 1520
- Invalid: 0
- Tested bases: 1/1
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 20 | 0 | 0.0% | 0 | 19.5s | 16.5% | 98.6% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| defense-ring | 20 | 0 | 0.0% | 0 | 19.5s | 16.5% | 98.6% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| defense-ring\|TH7 | 20 | 0 | 0.0% | 0 | 19.5s | 16.5% | 98.6% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 20 | 0 | 0.0% | 0 | 19.5s | 16.5% | 98.6% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 11 | 0 | 0.0% | 0 | 20.5s | 17.0% | 97.5% |
| pure-unit-matrix | 9 | 0 | 0.0% | 0 | 18.3s | 15.8% | 100.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH7 | 11 | 0 | 0.0% | 0 | 20.5s | 17.0% | 97.5% |
| pure-unit-matrix\|TH7 | 9 | 0 | 0.0% | 0 | 18.3s | 15.8% | 100.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 9 | 0 | 0.0% | 0 | 18.3s | 15.8% | 100.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|wide-line | 9 | 0 | 0.0% | 0 | 18.3s | 15.8% | 100.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|tank-front-support-rear | 6 | 0 | 0.0% | 0 | 24.0s | 19.4% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 11 | 0 | 0.0% | 0 | 18.6s | 16.4% | 100.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 10 | 0 | 0.0% | 0 | 16.8s | 14.5% | 97.3% |
| tank-front-support-rear | 10 | 0 | 0.0% | 0 | 22.3s | 18.4% | 100.0% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 9 | 0 | 0.0% | 0 | 18.3s | 15.8% | 100.0% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 12 | 0 | 0.0% | 0 | 20.1s | 17.2% | 100.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 20 | 0 | 0.0% | 0 | 19.5s | 16.5% | 98.6% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 6 | 0 | 0.0% | 0 | 21.0s | 16.1% | 97.9% |
| fire_dragon | 6 | 0 | 0.0% | 0 | 17.7s | 14.5% | 95.5% |
| knight | 6 | 0 | 0.0% | 0 | 19.4s | 15.6% | 97.9% |
| mage | 6 | 0 | 0.0% | 0 | 18.6s | 15.1% | 97.9% |
| mechanical_dragon | 6 | 0 | 0.0% | 0 | 18.4s | 15.1% | 95.5% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-defense-ring-222 | 7 | defense-ring | maxed | 20 | 0.0% | 98.6% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 8,435 | 6,315.71 | 2,108.75 | 1,578.93 |  |
| necromancer | 7 | 15 | 38,341 | 11,707.41 | 2,556.07 | 780.49 |  |
| archer | 7 | 1 | 2,156 | 748.39 | 2,156 | 748.39 |  |
| fire_dragon | 7 | 10 | 16,189 | 7,228.57 | 1,618.9 | 722.86 |  |
| mechanical_dragon | 7 | 4 | 6,071 | 1,721.36 | 1,517.75 | 430.34 | chain x3 |
| demon_king | 7 | 5 | 19,819 | 2,141.11 | 3,963.8 | 428.22 |  |
| knight | 7 | 1 | 3,846 | 415.56 | 3,846 | 415.56 |  |
| horror | 7 | 20 | 40,526 | 4,350 | 2,026.3 | 217.5 |  |
| mimic | 7 | 6 | 16,670 | 1,223.58 | 2,778.33 | 203.93 | trap immune |
| pea_shooter | 7 | 5 | 12,410 | 873.14 | 2,482 | 174.63 |  |
| wind_mage | 7 | 15 | 22,226 | 2,525.91 | 1,481.73 | 168.39 |  |
| ice_golem | 7 | 10 | 40,452 | 1,565.49 | 4,045.2 | 156.55 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / coverage:** Missing content coverage. Buildings: altar; troops: none.
- **CRITICAL / spawn-coverage:** Missing 81/100 spawn mechanics in simulated coverage.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH7 has 0.0% attacker wins across 11 samples; authored target is 47.0%-63.0%.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 0.0% is outside 55.0% +/- 8.0% across 11 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th7-defense-ring-222 has 0 attacker wins across 20 controlled/policy-exploration samples.
- **INFO / unbeaten-base:** th7-defense-ring-222 has 0.0% attacker wins across 20 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
