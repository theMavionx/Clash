# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T16:36:44.653Z
**Seed:** 84002
**Town Halls:** TH5, TH6, TH7
**Unique generated bases:** 3
**Unique attack policies:** 30
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 24
**Unbeaten non-adaptive bases (n >= 6):** 3
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 100 battles; 3 bases x 15 selected same-TH compositions x 2 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Balance replay simulations:** 30
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 3.6s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Generates deterministic layouts across 18 logical base archetypes and 5 progression profiles.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The base-counter response matrix fixes common rarity, Ward 0, maxed same-TH levels, and paired deployment contexts across 15 capacity-filled representative pure/mixed compositions per base. It ranks compositions by win, destruction, Town Hall damage, and survival, then replays the locked top-two and the strongest universal family on guaranteed distinct contexts. These battles are excluded from population win rate and do not replace the broader adaptive breakability search.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 13/13
- Troop simulation coverage: 9/9
- Spawn-mechanic coverage: 29/100
- Spawn coverage by Town Hall: TH5=9/100, TH6=10/100, TH7=10/100
- Bases exercised: 3/3

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 30 | 0 | 0.0% | 0 | 23.2s | 29.3% | 100.0% | 0.0% |

## Base-Counter Response Matrix

The probe compares 15 selected capacity-filled compositions per Town Hall under identical discovery contexts. Selection coverage: TH5=15/23, TH6=15/26, TH7=15/27. Near-best compositions within 0.03 utility share counter credit, so ties do not manufacture a single winner.

- Discovery matrix: 90 battles
- Locked top-two counter holdout: 6 battles
- Universal-family holdout: 3 battles
- Hard-layout confirmation: 1 battles
- Invalid battles: 0
- Bases with no discovery-matrix win: 2/3
- Bases with no observed win in any probe phase: 2/3
- Bases where neither locked top-two counter won its holdout: 2/3
- Bases with at least two / three winning compositions: 0.0% / 0.0%
- Bases with winning counters from at least two recipe families: 0.0%
- Bases losing to at least 12/15 compositions in both discovery contexts: 0.0%
- Top-1 / top-3 near-best counter share: 100.0% / 100.0%
- Counter-family effective count (inverse HHI / Shannon): 1 / 1
- Strongest universal family: core-mimic-filled — 33.3% discovery coverage, 0.0% unseen-context win rate
- Layouts forcing the universal family to lose while another composition wins: 0.0%; mean universal regret 0.01

| Defense Level Profile | Bases | Discovery WR | Discovery Zero-Counter | Total Zero-Counter | 2+ Counters | 3+ Counters | Multi-Family | Robust 12+/15 Losses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| maxed | 3 | 1.1% | 2 | 2 | 0.0% | 0.0% | 0.0% | 0.0% |

| Town Hall | Credited Bases | Counter Families | Top Counter | Top-1 Share | Top-3 Share | Effective Families |
|---|---:|---:|---|---:|---:|---:|
| TH6 | 1 | 1 | core-mimic-filled | 100.0% | 100.0% | 1 |

| Composition | Recipe Family | TH Coverage | Discovery Base Coverage | Discovery WR | Top-Counter Share | Locked Holdout | Universal Holdout |
|---|---|---|---:|---:|---:|---:|---:|
| core-mimic-filled | core-mimic | TH5, TH6, TH7 | 33.3% | 16.7% | 33.3% | 1/2 (50.0%) | 0/3 (0.0%) |
| balanced | mixed | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | 0/1 (0.0%) | N/A |
| core-fire_dragon-filled | core-fire_dragon | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| core-mage-filled | core-mage | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| core-mechanical_dragon-filled | core-mechanical_dragon | TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| frontline-ranged | ranged | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| hero-necro-dragon-mages | support | TH5, TH6 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| melee-pressure | frontline | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| pure-archer | pure-archer | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| pure-demon_king | pure-demon_king | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | 0/1 (0.0%) | N/A |
| pure-knight | pure-knight | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | 0/2 (0.0%) | N/A |
| pure-necromancer | pure-necromancer | TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| pure-pea_shooter | pure-pea_shooter | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| random-1 | mixed | TH5 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| ranged-pressure | ranged | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| support-mix | support | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| trap-runner-mix | utility | TH5, TH6, TH7 | 0.0% | 0.0% | 0.0% | N/A | N/A |

| Hard Base | TH | Layout | Winners (All Probe Phases) | Discovery Recipe Families | Locked Top-Two Holdout | Best / Runner-up |
|---|---:|---|---:|---:|---|---|
| th5-compact-core-001 | 5 | compact-core / maxed | 0 | 0 | loss | pure-demon_king / pure-knight |
| th7-compact-core-003 | 7 | compact-core / maxed | 0 | 0 | loss | core-mimic-filled / balanced |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH7->TH7 | 11 | 0 | 0.0% | 0 | 21.6s | 27.6% | 100.0% |
| TH6->TH6 | 10 | 0 | 0.0% | 0 | 21.3s | 26.6% | 100.0% |
| TH5->TH5 | 9 | 0 | 0.0% | 0 | 27.4s | 34.9% | 100.0% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core | 30 | 0 | 0.0% | 0 | 23.2s | 29.3% | 100.0% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| compact-core\|TH7 | 11 | 0 | 0.0% | 0 | 21.6s | 27.6% | 100.0% |
| compact-core\|TH6 | 10 | 0 | 0.0% | 0 | 21.3s | 26.6% | 100.0% |
| compact-core\|TH5 | 9 | 0 | 0.0% | 0 | 27.4s | 34.9% | 100.0% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 30 | 0 | 0.0% | 0 | 23.2s | 29.3% | 100.0% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 24 | 0 | 0.0% | 0 | 24.2s | 29.7% | 100.0% |
| policy-exploration | 6 | 0 | 0.0% | 0 | 19.4s | 27.8% | 100.0% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH7 | 9 | 0 | 0.0% | 0 | 21.6s | 25.1% | 100.0% |
| pure-unit-matrix\|TH6 | 8 | 0 | 0.0% | 0 | 22.8s | 29.3% | 100.0% |
| pure-unit-matrix\|TH5 | 7 | 0 | 0.0% | 0 | 29.2s | 36.7% | 100.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 24 | 0 | 0.0% | 0 | 24.2s | 29.7% | 100.0% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 10 | 0 | 0.0% | 0 | 22.2s | 27.0% | 100.0% |
| pure-unit-matrix\|wide-line | 10 | 0 | 0.0% | 0 | 27.3s | 35.0% | 100.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 6 | 0 | 0.0% | 0 | 29.1s | 35.8% | 100.0% |
| pure-unit-matrix\|rapid | 6 | 0 | 0.0% | 0 | 21.6s | 25.6% | 100.0% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 12 | 0 | 0.0% | 0 | 24.4s | 31.3% | 100.0% |
| pure-unit-matrix\|tank-front-support-rear | 12 | 0 | 0.0% | 0 | 24.0s | 28.2% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 10 | 0 | 0.0% | 0 | 22.2s | 27.0% | 100.0% |
| wide-line | 10 | 0 | 0.0% | 0 | 27.3s | 35.0% | 100.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 8 | 0 | 0.0% | 0 | 26.6s | 36.6% | 100.0% |
| rapid | 7 | 0 | 0.0% | 0 | 22.1s | 25.6% | 100.0% |
| two-waves | 7 | 0 | 0.0% | 0 | 22.5s | 24.8% | 100.0% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 15 | 0 | 0.0% | 0 | 22.9s | 31.1% | 100.0% |
| tank-front-support-rear | 15 | 0 | 0.0% | 0 | 23.6s | 27.5% | 100.0% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 27 | 0 | 0.0% | 0 | 24.0s | 29.5% | 100.0% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 8 | 0 | 0.0% | 0 | 18.1s | 36.1% | 100.0% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 26 | 0 | 0.0% | 0 | 24.1s | 29.6% | 100.0% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 30 | 0 | 0.0% | 0 | 23.2s | 29.3% | 100.0% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 8 | 0 | 0.0% | 0 | 24.0s | 29.8% | 100.0% |
| mage | 8 | 0 | 0.0% | 0 | 19.5s | 31.3% | 100.0% |
| demon_king | 7 | 0 | 0.0% | 0 | 20.8s | 32.8% | 100.0% |
| fire_dragon | 7 | 0 | 0.0% | 0 | 17.8s | 31.9% | 100.0% |
| archer | 6 | 0 | 0.0% | 0 | 29.2s | 35.8% | 100.0% |
| mimic | 6 | 0 | 0.0% | 0 | 23.3s | 26.7% | 100.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th7-compact-core-003 | 7 | compact-core | maxed | 11 | 0.0% | 100.0% |
| th6-compact-core-002 | 6 | compact-core | maxed | 10 | 0.0% | 100.0% |

## Max-Level Troop Efficiency

| Troop | Level | Slots | HP | Direct DPS | HP / Slot | Direct DPS / Slot | Notes |
|---|---:|---:|---:|---:|---:|---:|---|
| mage | 7 | 4 | 7,924 | 5,932.86 | 1,981 | 1,483.21 |  |
| necromancer | 7 | 15 | 36,018 | 10,998.77 | 2,401.2 | 733.25 |  |
| archer | 7 | 1 | 2,025 | 701.61 | 2,025 | 701.61 |  |
| fire_dragon | 7 | 10 | 15,208 | 6,791.43 | 1,520.8 | 679.14 |  |
| mechanical_dragon | 7 | 4 | 5,704 | 1,616.5 | 1,426 | 404.13 | chain x3 |
| demon_king | 7 | 5 | 18,618 | 2,011.11 | 3,723.6 | 402.22 |  |
| knight | 7 | 1 | 3,612 | 390 | 3,612 | 390 |  |
| mimic | 7 | 6 | 19,488 | 1,428.3 | 3,248 | 238.05 | trap immune |
| horror | 7 | 20 | 38,071 | 4,086.29 | 1,903.55 | 204.31 |  |
| pea_shooter | 7 | 5 | 11,658 | 820.57 | 2,331.6 | 164.11 |  |
| wind_mage | 7 | 15 | 20,880 | 2,372.73 | 1,392 | 158.18 |  |
| ice_golem | 7 | 10 | 38,002 | 1,470.42 | 3,800.2 | 147.04 | defense priority |

Direct DPS does not include summons, chain damage, freeze control, splitting, target priority, or trap immunity. Use it as an outlier signal, not a final power score.

## Findings

- **CRITICAL / spawn-coverage:** Missing 71/100 spawn mechanics in simulated coverage.
- **CRITICAL / base-counter-meta-concentration:** Counter concentration is excessive: top-1 100.0%, top-3 100.0%, inverse-HHI effective families 1.
- **CRITICAL / base-counter-town-hall-concentration:** TH6 top counter core-mimic-filled owns 100.0% of near-best credit across only 1 families.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 0.0% is outside 55.0% +/- 8.0% across 6 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / unbeaten-non-adaptive-base:** th5-compact-core-001 has 0 attacker wins across 9 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 10 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th7-compact-core-003 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / base-counter-probe-no-win:** 2/3 layouts have no observed win among the 15 selected compositions and their probe contexts; the separate adaptive breakability gate remains authoritative for counter existence.
- **WARNING / base-counter-discovery-no-win:** 2/3 layouts have no win in the paired discovery matrix before any locked holdout.
- **WARNING / base-counter-holdout-failure:** 2/3 layouts had neither locked top-two counter win on the unseen holdout deployment.
- **WARNING / base-counter-breadth:** Only 0.0% of layouts have at least two distinct winning compositions; target is 95%.
- **WARNING / base-counter-strong-breadth:** 0.0% of layouts have three winning compositions and 0.0% have counters from two recipe families; both targets are 80%.
- **WARNING / base-counter-scouting-value:** Only 0.0% of layouts force the universal army to lose while another wins; mean base-specific regret is 0.01.
- **INFO / unbeaten-base:** th5-compact-core-001 has 0.0% attacker wins across 9 samples.
- **INFO / unbeaten-base:** th6-compact-core-002 has 0.0% attacker wins across 10 samples.
- **INFO / unbeaten-base:** th7-compact-core-003 has 0.0% attacker wins across 11 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
