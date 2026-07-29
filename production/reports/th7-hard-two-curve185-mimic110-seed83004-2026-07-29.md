# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T15:35:35.929Z
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
**Breakability probe:** 4551 calibration + gate + focused + adaptive rescue battles; 0/2 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=0.98x
**Lab late-tier troop scales:** mimic=1.1x
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 40
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 96.7s

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
| 40 | 0 | 0.0% | 0 | 21.9s | 19.8% | 94.3% | 0.0% |

## Base Breakability Gate

Attack policies were first calibrated against the strongest same-TH bases at common NFT rarity. Each base was then attacked by up to 20 best hard-base policies. Bases with no valid elite-gate win were tested against the remaining sampled same-TH policies until the first valid win or exhaustion of the candidate set. If a base still had no win, the lab selected up to 3 closest distinct ordered army templates and crossed each with every legal spawn mechanic and tactic, stopping at the first valid win. A rescue result proves existence of one deterministic legal counter-policy; it does not estimate that policy's population win probability. Final unbeaten bases exhausted every adaptive combination selected by this method. These probe battles do not affect the reported balance win rate.

- Distinct candidate policies after rarity deduplication: 1500
- Hard-base calibration battles: 3000
- Full-catalog gate battles: 40
- Focused rescue battles: 1480
- Adaptive counter-search battles: 31
- Without a valid win after elite gate: 1
- Resolved by remaining sampled policies: 0
- Resolved by adaptive counter-search: 1
- Total breakability battles: 4551
- Invalid: 0
- Tested bases: 2/2
- Untested bases: 0
- Invalid-only bases: 0
- Bases with zero successful attacks after full candidate search: 0

| Rescued Base | TH | Archetype | Progression | Counter Policy | Phase | Rescue Attempt |
|---|---:|---|---|---|---|---:|
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | adaptive-th7-asymmetric-right-189-0034 | adaptive-counter-search | 31 |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 40 | 0 | 0.0% | 0 | 21.9s | 19.8% | 94.3% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left | 20 | 0 | 0.0% | 0 | 19.6s | 19.5% | 93.9% |
| asymmetric-right | 20 | 0 | 0.0% | 0 | 24.2s | 20.2% | 94.8% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-left\|TH7 | 20 | 0 | 0.0% | 0 | 19.6s | 19.5% | 93.9% |
| asymmetric-right\|TH7 | 20 | 0 | 0.0% | 0 | 24.2s | 20.2% | 94.8% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 40 | 0 | 0.0% | 0 | 21.9s | 19.8% | 94.3% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration | 22 | 0 | 0.0% | 0 | 21.4s | 18.2% | 89.7% |
| pure-unit-matrix | 18 | 0 | 0.0% | 0 | 22.4s | 21.9% | 100.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|TH7 | 22 | 0 | 0.0% | 0 | 21.4s | 18.2% | 89.7% |
| pure-unit-matrix\|TH7 | 18 | 0 | 0.0% | 0 | 22.4s | 21.9% | 100.0% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 13 | 0 | 0.0% | 0 | 21.7s | 19.1% | 91.2% |
| policy-exploration\|archer | 10 | 0 | 0.0% | 0 | 20.2s | 18.1% | 88.6% |
| policy-exploration\|fire_dragon | 10 | 0 | 0.0% | 0 | 18.6s | 16.8% | 84.3% |
| policy-exploration\|mage | 10 | 0 | 0.0% | 0 | 20.0s | 21.0% | 94.9% |
| policy-exploration\|demon_king | 9 | 0 | 0.0% | 0 | 17.6s | 17.6% | 94.4% |
| policy-exploration\|mimic | 8 | 0 | 0.0% | 0 | 17.6s | 14.5% | 85.0% |
| policy-exploration\|mechanical_dragon | 7 | 0 | 0.0% | 0 | 20.4s | 19.4% | 86.6% |
| policy-exploration\|pea_shooter | 6 | 0 | 0.0% | 0 | 20.8s | 18.8% | 91.6% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH7 | 13 | 0 | 0.0% | 0 | 21.7s | 19.1% | 91.2% |
| policy-exploration\|archer\|TH7 | 10 | 0 | 0.0% | 0 | 20.2s | 18.1% | 88.6% |
| policy-exploration\|fire_dragon\|TH7 | 10 | 0 | 0.0% | 0 | 18.6s | 16.8% | 84.3% |
| policy-exploration\|mage\|TH7 | 10 | 0 | 0.0% | 0 | 20.0s | 21.0% | 94.9% |
| policy-exploration\|demon_king\|TH7 | 9 | 0 | 0.0% | 0 | 17.6s | 17.6% | 94.4% |
| policy-exploration\|mimic\|TH7 | 8 | 0 | 0.0% | 0 | 17.6s | 14.5% | 85.0% |
| policy-exploration\|mechanical_dragon\|TH7 | 7 | 0 | 0.0% | 0 | 20.4s | 19.4% | 86.6% |
| policy-exploration\|pea_shooter\|TH7 | 6 | 0 | 0.0% | 0 | 20.8s | 18.8% | 91.6% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 18 | 0 | 0.0% | 0 | 22.4s | 21.9% | 100.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|wide-line | 10 | 0 | 0.0% | 0 | 22.9s | 24.5% | 100.0% |
| pure-unit-matrix\|center-column | 8 | 0 | 0.0% | 0 | 21.9s | 18.5% | 100.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|roster-order | 11 | 0 | 0.0% | 0 | 17.8s | 17.0% | 88.9% |
| policy-exploration\|tank-front-support-rear | 11 | 0 | 0.0% | 0 | 25.1s | 19.4% | 90.5% |
| pure-unit-matrix\|roster-order | 9 | 0 | 0.0% | 0 | 22.5s | 22.2% | 100.0% |
| pure-unit-matrix\|tank-front-support-rear | 9 | 0 | 0.0% | 0 | 22.3s | 21.5% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 13 | 0 | 0.0% | 0 | 24.2s | 25.6% | 100.0% |
| center-column | 10 | 0 | 0.0% | 0 | 21.3s | 18.1% | 100.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 9 | 0 | 0.0% | 0 | 20.8s | 21.9% | 93.0% |
| rapid | 8 | 0 | 0.0% | 0 | 20.0s | 13.7% | 89.4% |
| three-waves | 8 | 0 | 0.0% | 0 | 23.3s | 22.6% | 100.0% |
| two-waves | 8 | 0 | 0.0% | 0 | 23.4s | 19.8% | 94.6% |
| drip | 7 | 0 | 0.0% | 0 | 22.1s | 21.2% | 95.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 20 | 0 | 0.0% | 0 | 19.9s | 19.4% | 93.9% |
| tank-front-support-rear | 20 | 0 | 0.0% | 0 | 23.9s | 20.3% | 94.8% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 19 | 0 | 0.0% | 0 | 22.3s | 21.9% | 100.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 9 | 0 | 0.0% | 0 | 17.5s | 21.9% | 100.0% |
| legendary | 7 | 0 | 0.0% | 0 | 18.2s | 19.4% | 95.5% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 29 | 0 | 0.0% | 0 | 21.1s | 20.4% | 96.1% |
| ward-2 | 11 | 0 | 0.0% | 0 | 24.0s | 18.5% | 89.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 40 | 0 | 0.0% | 0 | 21.9s | 19.8% | 94.3% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 15 | 0 | 0.0% | 0 | 23.0s | 19.6% | 92.4% |
| archer | 12 | 0 | 0.0% | 0 | 21.0s | 19.1% | 90.5% |
| fire_dragon | 12 | 0 | 0.0% | 0 | 18.2s | 18.8% | 86.9% |
| mage | 12 | 0 | 0.0% | 0 | 20.1s | 21.8% | 95.8% |
| demon_king | 11 | 0 | 0.0% | 0 | 18.3s | 18.2% | 95.4% |
| mimic | 10 | 0 | 0.0% | 0 | 19.2s | 13.5% | 88.0% |
| mechanical_dragon | 9 | 0 | 0.0% | 0 | 20.8s | 21.9% | 89.6% |
| pea_shooter | 8 | 0 | 0.0% | 0 | 20.2s | 19.0% | 93.7% |
| necromancer | 6 | 0 | 0.0% | 0 | 22.1s | 18.3% | 100.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-asymmetric-right-189 | 7 | asymmetric-right | maxed | 20 | 0.0% | 94.8% |
| th7-asymmetric-left-186 | 7 | asymmetric-left | maxed | 20 | 0.0% | 93.9% |

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
| mimic | 7 | 6 | 18,337 | 1,345.28 | 3,056.17 | 224.21 | trap immune |
| horror | 7 | 20 | 40,526 | 4,350 | 2,026.3 | 217.5 |  |
| pea_shooter | 7 | 5 | 12,410 | 873.14 | 2,482 | 174.63 |  |
| wind_mage | 7 | 15 | 22,226 | 2,525.91 | 1,481.73 | 168.39 |  |
| ice_golem | 7 | 10 | 40,452 | 1,565.49 | 4,045.2 | 156.55 | defense priority |

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
