# Clash Full-Game Balance Lab

**Generated:** 2026-07-29T16:52:32.527Z
**Seed:** 84002
**Town Halls:** TH6
**Unique loaded bases:** 41
**Base report source:** `production/reports/base-counter-meta-10000-final-seed84001-2026-07-29.json`
**Selected base IDs:** th6-compact-core-002, th6-layered-rings-008, th6-resource-shield-017, th6-asymmetric-left-023, th6-asymmetric-right-026, th6-diamond-035, th6-cannon-screen-041, th6-kill-corridor-053, th6-defense-ring-059, th6-southern-funnel-068, th6-wide-spread-074, th6-corner-keep-086, th6-rear-keep-092, th6-echelon-left-101, th6-echelon-right-104, th6-compact-core-110, th6-split-core-119, th6-resource-shield-125, th6-trap-lanes-137, th6-diamond-143, th6-crossfire-152, th6-kill-corridor-161, th6-layered-rings-170, th6-southern-funnel-176, th6-asymmetric-left-185, th6-asymmetric-right-188, th6-corner-keep-194, th6-cannon-screen-203, th6-echelon-left-209, th6-echelon-right-212, th6-defense-ring-221, th6-split-core-227, th6-wide-spread-236, th6-trap-lanes-245, th6-rear-keep-254, th6-crossfire-260, th6-compact-core-272, th6-layered-rings-278, th6-resource-shield-287, th6-asymmetric-left-293, th6-asymmetric-right-296
**Unique attack policies:** 100
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 328
**Unbeaten non-adaptive bases (n >= 6):** 28
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 2000 battles; 41 bases x 15 selected same-TH compositions x 2 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Lab Mimic concealment ends on first attack:** no
**Lab Mimic trap damage scale while immune:** 1x
**Balance replay simulations:** 500
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 30.5s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/base-counter-meta-10000-final-seed84001-2026-07-29.json`; imported base and building IDs must be non-empty and unique.
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
- Building coverage: 11/12
- Troop simulation coverage: 8/8
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100
- Bases exercised: 41/41

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 500 | 16 | 3.2% | 0 | 22.0s | 29.0% | 93.2% | 0.7% |

## Base-Counter Response Matrix

The probe compares 15 selected capacity-filled compositions per Town Hall under identical discovery contexts. Selection coverage: TH6=15/26. Near-best compositions within 0.03 utility share counter credit, so ties do not manufacture a single winner.

- Discovery matrix: 1230 battles
- Locked top-two counter holdout: 82 battles
- Universal-family holdout: 41 battles
- Hard-layout confirmation: 647 battles
- Invalid battles: 0
- Bases with no discovery-matrix win: 11/41
- Bases with no observed win in any probe phase: 2/41
- Bases where neither locked top-two counter won its holdout: 28/41
- Bases with at least two / three winning compositions: 36.6% / 22.0%
- Bases with winning counters from at least two recipe families: 36.6%
- Bases losing to at least 12/15 compositions in both discovery contexts: 0.0%
- Top-1 / top-3 near-best counter share: 59.3% / 85.6%
- Counter-family effective count (inverse HHI / Shannon): 2.52 / 3.75
- Strongest universal family: core-mimic-filled — 61.0% discovery coverage, 26.8% unseen-context win rate
- Layouts forcing the universal family to lose while another composition wins: 12.2%; mean universal regret 0.06

| Defense Level Profile | Bases | Discovery WR | Discovery Zero-Counter | Total Zero-Counter | 2+ Counters | 3+ Counters | Multi-Family | Robust 12+/15 Losses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| maxed | 20 | 8.3% | 5 | 2 | 40.0% | 20.0% | 40.0% | 0.0% |
| rushed-defense | 21 | 6.7% | 6 | 0 | 33.3% | 23.8% | 33.3% | 0.0% |

| Town Hall | Credited Bases | Counter Families | Top Counter | Top-1 Share | Top-3 Share | Effective Families |
|---|---:|---:|---|---:|---:|---:|
| TH6 | 30 | 9 | core-mimic-filled | 59.3% | 85.6% | 2.52 |

| Composition | Recipe Family | TH Coverage | Discovery Base Coverage | Discovery WR | Near-Best Share (Credited Bases) | Locked Holdout | Universal Holdout |
|---|---|---|---:|---:|---:|---:|---:|
| core-mimic-filled | core-mimic | TH6 | 61.0% | 41.5% | 59.3% | 12/29 (41.4%) | 11/41 (26.8%) |
| pure-demon_king | pure-demon_king | TH6 | 34.1% | 23.2% | 18.7% | 3/28 (10.7%) | N/A |
| pure-knight | pure-knight | TH6 | 24.4% | 17.1% | 7.6% | 0/8 (0.0%) | N/A |
| trap-runner-mix | utility | TH6 | 14.6% | 8.5% | 5.1% | 0/2 (0.0%) | N/A |
| frontline-ranged | ranged | TH6 | 2.4% | 1.2% | 3.3% | 0/1 (0.0%) | N/A |
| core-mechanical_dragon-filled | core-mechanical_dragon | TH6 | 4.9% | 2.4% | 2.8% | 0/4 (0.0%) | N/A |
| melee-pressure | frontline | TH6 | 9.8% | 8.5% | 2.1% | 0/1 (0.0%) | N/A |
| balanced | mixed | TH6 | 7.3% | 4.9% | 0.6% | 0/3 (0.0%) | N/A |
| core-fire_dragon-filled | core-fire_dragon | TH6 | 2.4% | 2.4% | 0.6% | 0/4 (0.0%) | N/A |
| support-mix | support | TH6 | 4.9% | 2.4% | 0.0% | 0/1 (0.0%) | N/A |
| core-mage-filled | core-mage | TH6 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| hero-necro-dragon-mages | support | TH6 | 0.0% | 0.0% | 0.0% | 0/1 (0.0%) | N/A |
| pure-archer | pure-archer | TH6 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| pure-pea_shooter | pure-pea_shooter | TH6 | 0.0% | 0.0% | 0.0% | N/A | N/A |
| ranged-pressure | ranged | TH6 | 0.0% | 0.0% | 0.0% | N/A | N/A |

| Hard Base | TH | Layout | Winners (All Probe Phases) | Discovery Recipe Families | Locked Top-Two Holdout | Best / Runner-up |
|---|---:|---|---:|---:|---|---|
| th6-compact-core-272 | 6 | compact-core / maxed | 0 | 0 | loss | hero-necro-dragon-mages / core-mechanical_dragon-filled |
| th6-defense-ring-221 | 6 | defense-ring / maxed | 0 | 0 | loss | support-mix / core-mechanical_dragon-filled |
| th6-asymmetric-left-293 | 6 | asymmetric-left / rushed-defense | 1 | 1 | loss | trap-runner-mix / pure-demon_king |
| th6-compact-core-110 | 6 | compact-core / rushed-defense | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th6-corner-keep-194 | 6 | corner-keep / rushed-defense | 1 | 0 | loss | core-fire_dragon-filled / pure-demon_king |
| th6-defense-ring-059 | 6 | defense-ring / rushed-defense | 1 | 0 | loss | core-mimic-filled / pure-demon_king |
| th6-diamond-035 | 6 | diamond / maxed | 1 | 0 | loss | core-mimic-filled / core-fire_dragon-filled |
| th6-layered-rings-008 | 6 | layered-rings / rushed-defense | 1 | 1 | loss | core-mimic-filled / pure-demon_king |
| th6-rear-keep-254 | 6 | rear-keep / maxed | 1 | 1 | loss | core-mimic-filled / pure-demon_king |
| th6-resource-shield-017 | 6 | resource-shield / maxed | 1 | 0 | loss | core-mechanical_dragon-filled / balanced |
| th6-resource-shield-125 | 6 | resource-shield / rushed-defense | 1 | 0 | loss | core-mimic-filled / pure-demon_king |
| th6-resource-shield-287 | 6 | resource-shield / maxed | 1 | 1 | loss | core-mimic-filled / pure-demon_king |
| th6-southern-funnel-068 | 6 | southern-funnel / maxed | 1 | 1 | loss | frontline-ranged / balanced |
| th6-southern-funnel-176 | 6 | southern-funnel / rushed-defense | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th6-split-core-119 | 6 | split-core / maxed | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th6-trap-lanes-245 | 6 | trap-lanes / rushed-defense | 1 | 1 | loss | pure-demon_king / core-fire_dragon-filled |
| th6-asymmetric-right-026 | 6 | asymmetric-right / rushed-defense | 2 | 0 | loss | pure-demon_king / pure-knight |
| th6-corner-keep-086 | 6 | corner-keep / maxed | 2 | 2 | loss | core-mimic-filled / pure-knight |
| th6-crossfire-152 | 6 | crossfire / maxed | 2 | 2 | loss | core-mimic-filled / pure-demon_king |
| th6-echelon-left-101 | 6 | echelon-left / maxed | 2 | 2 | loss | core-mimic-filled / pure-knight |
| th6-echelon-right-104 | 6 | echelon-right / maxed | 2 | 2 | loss | core-mimic-filled / pure-demon_king |
| th6-kill-corridor-053 | 6 | kill-corridor / maxed | 2 | 1 | loss | pure-demon_king / core-fire_dragon-filled |
| th6-layered-rings-278 | 6 | layered-rings / rushed-defense | 2 | 0 | loss | pure-demon_king / balanced |
| th6-diamond-143 | 6 | diamond / rushed-defense | 3 | 3 | loss | pure-demon_king / core-mimic-filled |
| th6-echelon-left-209 | 6 | echelon-left / rushed-defense | 5 | 4 | loss | pure-demon_king / trap-runner-mix |
| th6-trap-lanes-137 | 6 | trap-lanes / maxed | 5 | 5 | loss | core-mimic-filled / pure-demon_king |
| th6-cannon-screen-203 | 6 | cannon-screen / maxed | 6 | 6 | loss | core-mechanical_dragon-filled / pure-demon_king |
| th6-wide-spread-236 | 6 | wide-spread / maxed | 8 | 8 | loss | core-mimic-filled / pure-demon_king |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 500 | 16 | 3.2% | 0 | 22.0s | 29.0% | 93.2% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right | 37 | 1 | 2.7% | 0 | 25.0s | 31.3% | 94.9% |
| compact-core | 37 | 0 | 0.0% | 0 | 21.7s | 30.6% | 97.2% |
| layered-rings | 36 | 0 | 0.0% | 0 | 20.1s | 33.8% | 95.0% |
| resource-shield | 36 | 0 | 0.0% | 0 | 20.4s | 25.3% | 98.1% |
| asymmetric-left | 35 | 0 | 0.0% | 0 | 25.0s | 35.1% | 94.9% |
| diamond | 26 | 2 | 7.7% | 0 | 20.3s | 24.3% | 89.6% |
| southern-funnel | 26 | 0 | 0.0% | 0 | 18.4s | 24.0% | 97.0% |
| corner-keep | 25 | 0 | 0.0% | 0 | 22.0s | 30.3% | 95.2% |
| defense-ring | 25 | 1 | 4.0% | 0 | 21.8s | 32.8% | 94.3% |
| echelon-right | 25 | 2 | 8.0% | 0 | 21.2s | 25.1% | 87.7% |
| split-core | 25 | 0 | 0.0% | 0 | 17.8s | 23.4% | 97.5% |
| trap-lanes | 25 | 0 | 0.0% | 0 | 19.5s | 28.6% | 95.8% |
| cannon-screen | 24 | 5 | 20.8% | 0 | 27.6s | 23.0% | 77.6% |
| echelon-left | 24 | 1 | 4.2% | 0 | 26.1s | 28.6% | 91.5% |
| rear-keep | 24 | 0 | 0.0% | 0 | 16.5s | 23.1% | 99.2% |
| wide-spread | 24 | 2 | 8.3% | 0 | 27.8s | 43.8% | 86.8% |
| crossfire | 23 | 0 | 0.0% | 0 | 19.2s | 24.1% | 91.5% |
| kill-corridor | 23 | 2 | 8.7% | 0 | 25.8s | 30.6% | 86.1% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| asymmetric-right\|TH6 | 37 | 1 | 2.7% | 0 | 25.0s | 31.3% | 94.9% |
| compact-core\|TH6 | 37 | 0 | 0.0% | 0 | 21.7s | 30.6% | 97.2% |
| layered-rings\|TH6 | 36 | 0 | 0.0% | 0 | 20.1s | 33.8% | 95.0% |
| resource-shield\|TH6 | 36 | 0 | 0.0% | 0 | 20.4s | 25.3% | 98.1% |
| asymmetric-left\|TH6 | 35 | 0 | 0.0% | 0 | 25.0s | 35.1% | 94.9% |
| diamond\|TH6 | 26 | 2 | 7.7% | 0 | 20.3s | 24.3% | 89.6% |
| southern-funnel\|TH6 | 26 | 0 | 0.0% | 0 | 18.4s | 24.0% | 97.0% |
| corner-keep\|TH6 | 25 | 0 | 0.0% | 0 | 22.0s | 30.3% | 95.2% |
| defense-ring\|TH6 | 25 | 1 | 4.0% | 0 | 21.8s | 32.8% | 94.3% |
| echelon-right\|TH6 | 25 | 2 | 8.0% | 0 | 21.2s | 25.1% | 87.7% |
| split-core\|TH6 | 25 | 0 | 0.0% | 0 | 17.8s | 23.4% | 97.5% |
| trap-lanes\|TH6 | 25 | 0 | 0.0% | 0 | 19.5s | 28.6% | 95.8% |
| cannon-screen\|TH6 | 24 | 5 | 20.8% | 0 | 27.6s | 23.0% | 77.6% |
| echelon-left\|TH6 | 24 | 1 | 4.2% | 0 | 26.1s | 28.6% | 91.5% |
| rear-keep\|TH6 | 24 | 0 | 0.0% | 0 | 16.5s | 23.1% | 99.2% |
| wide-spread\|TH6 | 24 | 2 | 8.3% | 0 | 27.8s | 43.8% | 86.8% |
| crossfire\|TH6 | 23 | 0 | 0.0% | 0 | 19.2s | 24.1% | 91.5% |
| kill-corridor\|TH6 | 23 | 2 | 8.7% | 0 | 25.8s | 30.6% | 86.1% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 259 | 9 | 3.5% | 0 | 21.0s | 35.3% | 91.2% |
| maxed | 241 | 7 | 2.9% | 0 | 23.1s | 22.3% | 95.4% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 328 | 8 | 2.4% | 0 | 23.3s | 32.7% | 96.2% |
| policy-exploration | 172 | 8 | 4.7% | 0 | 19.6s | 22.0% | 87.5% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 328 | 8 | 2.4% | 0 | 23.3s | 32.7% | 96.2% |
| policy-exploration\|TH6 | 172 | 8 | 4.7% | 0 | 19.6s | 22.0% | 87.5% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight | 112 | 6 | 5.4% | 0 | 21.1s | 22.1% | 85.5% |
| policy-exploration\|fire_dragon | 99 | 1 | 1.0% | 0 | 18.3s | 22.8% | 91.7% |
| policy-exploration\|archer | 94 | 4 | 4.3% | 0 | 20.1s | 22.2% | 88.0% |
| policy-exploration\|mage | 92 | 1 | 1.1% | 0 | 18.5s | 20.4% | 92.2% |
| policy-exploration\|mimic | 88 | 6 | 6.8% | 0 | 21.2s | 20.8% | 82.5% |
| policy-exploration\|demon_king | 84 | 1 | 1.2% | 0 | 19.9s | 20.9% | 85.3% |
| policy-exploration\|mechanical_dragon | 73 | 1 | 1.4% | 0 | 18.5s | 20.9% | 94.4% |
| policy-exploration\|pea_shooter | 59 | 1 | 1.7% | 0 | 19.6s | 21.6% | 93.8% |
| pure-unit-matrix\|archer | 41 | 0 | 0.0% | 0 | 25.5s | 26.6% | 100.0% |
| pure-unit-matrix\|demon_king | 41 | 6 | 14.6% | 0 | 30.4s | 46.8% | 83.7% |
| pure-unit-matrix\|fire_dragon | 41 | 0 | 0.0% | 0 | 14.3s | 30.4% | 100.0% |
| pure-unit-matrix\|knight | 41 | 0 | 0.0% | 0 | 30.5s | 35.4% | 95.7% |
| pure-unit-matrix\|mage | 41 | 0 | 0.0% | 0 | 16.8s | 23.8% | 100.0% |
| pure-unit-matrix\|mechanical_dragon | 41 | 1 | 2.4% | 0 | 23.0s | 37.4% | 97.1% |
| pure-unit-matrix\|mimic | 41 | 1 | 2.4% | 0 | 27.6s | 36.5% | 93.3% |
| pure-unit-matrix\|pea_shooter | 41 | 0 | 0.0% | 0 | 18.4s | 24.8% | 100.0% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| policy-exploration\|knight\|TH6 | 112 | 6 | 5.4% | 0 | 21.1s | 22.1% | 85.5% |
| policy-exploration\|fire_dragon\|TH6 | 99 | 1 | 1.0% | 0 | 18.3s | 22.8% | 91.7% |
| policy-exploration\|archer\|TH6 | 94 | 4 | 4.3% | 0 | 20.1s | 22.2% | 88.0% |
| policy-exploration\|mage\|TH6 | 92 | 1 | 1.1% | 0 | 18.5s | 20.4% | 92.2% |
| policy-exploration\|mimic\|TH6 | 88 | 6 | 6.8% | 0 | 21.2s | 20.8% | 82.5% |
| policy-exploration\|demon_king\|TH6 | 84 | 1 | 1.2% | 0 | 19.9s | 20.9% | 85.3% |
| policy-exploration\|mechanical_dragon\|TH6 | 73 | 1 | 1.4% | 0 | 18.5s | 20.9% | 94.4% |
| policy-exploration\|pea_shooter\|TH6 | 59 | 1 | 1.7% | 0 | 19.6s | 21.6% | 93.8% |
| pure-unit-matrix\|archer\|TH6 | 41 | 0 | 0.0% | 0 | 25.5s | 26.6% | 100.0% |
| pure-unit-matrix\|demon_king\|TH6 | 41 | 6 | 14.6% | 0 | 30.4s | 46.8% | 83.7% |
| pure-unit-matrix\|fire_dragon\|TH6 | 41 | 0 | 0.0% | 0 | 14.3s | 30.4% | 100.0% |
| pure-unit-matrix\|knight\|TH6 | 41 | 0 | 0.0% | 0 | 30.5s | 35.4% | 95.7% |
| pure-unit-matrix\|mage\|TH6 | 41 | 0 | 0.0% | 0 | 16.8s | 23.8% | 100.0% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 41 | 1 | 2.4% | 0 | 23.0s | 37.4% | 97.1% |
| pure-unit-matrix\|mimic\|TH6 | 41 | 1 | 2.4% | 0 | 27.6s | 36.5% | 93.3% |
| pure-unit-matrix\|pea_shooter\|TH6 | 41 | 0 | 0.0% | 0 | 18.4s | 24.8% | 100.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 328 | 8 | 2.4% | 0 | 23.3s | 32.7% | 96.2% |
| policy-exploration\|cannon-medkit | 31 | 1 | 3.2% | 0 | 24.1s | 35.0% | 96.6% |
| policy-exploration\|cannon-focus | 30 | 0 | 0.0% | 0 | 19.5s | 28.9% | 100.0% |
| policy-exploration\|cannon-rally | 30 | 3 | 10.0% | 0 | 13.8s | 4.1% | 69.1% |
| policy-exploration\|medkit-entry | 29 | 0 | 0.0% | 0 | 22.6s | 29.8% | 99.9% |
| policy-exploration\|rally-core | 27 | 4 | 14.8% | 0 | 16.8s | 3.1% | 60.4% |
| policy-exploration\|none | 25 | 0 | 0.0% | 0 | 20.5s | 30.2% | 97.8% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 40 | 0 | 0.0% | 0 | 20.6s | 30.5% | 100.0% |
| pure-unit-matrix\|wide-line | 40 | 0 | 0.0% | 0 | 16.6s | 27.6% | 100.0% |
| pure-unit-matrix\|left-flank | 38 | 0 | 0.0% | 0 | 24.1s | 30.8% | 97.3% |
| pure-unit-matrix\|diamond | 30 | 2 | 6.7% | 0 | 27.3s | 41.4% | 88.4% |
| pure-unit-matrix\|dual-flank | 30 | 2 | 6.7% | 0 | 30.2s | 37.5% | 93.3% |
| pure-unit-matrix\|edge-sweep | 30 | 0 | 0.0% | 0 | 15.7s | 25.7% | 100.0% |
| pure-unit-matrix\|inverted-wedge | 30 | 0 | 0.0% | 0 | 21.4s | 33.0% | 98.2% |
| pure-unit-matrix\|right-flank | 30 | 0 | 0.0% | 0 | 26.8s | 33.4% | 97.5% |
| pure-unit-matrix\|three-lane | 30 | 3 | 10.0% | 0 | 27.2s | 37.0% | 88.6% |
| pure-unit-matrix\|vanguard-wedge | 30 | 1 | 3.3% | 0 | 26.0s | 33.2% | 96.1% |
| policy-exploration\|diamond | 20 | 2 | 10.0% | 0 | 22.7s | 26.6% | 82.3% |
| policy-exploration\|edge-sweep | 20 | 1 | 5.0% | 0 | 16.3s | 19.3% | 82.9% |
| policy-exploration\|inverted-wedge | 20 | 1 | 5.0% | 0 | 21.7s | 22.4% | 85.7% |
| policy-exploration\|three-lane | 20 | 0 | 0.0% | 0 | 16.7s | 21.4% | 90.0% |
| policy-exploration\|vanguard-wedge | 20 | 2 | 10.0% | 0 | 16.8s | 15.5% | 81.3% |
| policy-exploration\|wide-line | 20 | 0 | 0.0% | 0 | 21.1s | 29.5% | 98.8% |
| policy-exploration\|center-column | 16 | 0 | 0.0% | 0 | 22.2s | 20.0% | 89.9% |
| policy-exploration\|dual-flank | 16 | 0 | 0.0% | 0 | 16.8s | 24.6% | 95.0% |
| policy-exploration\|left-flank | 10 | 2 | 20.0% | 0 | 26.2s | 17.6% | 72.5% |
| policy-exploration\|right-flank | 10 | 0 | 0.0% | 0 | 17.1s | 19.7% | 93.8% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 66 | 2 | 3.0% | 0 | 23.7s | 33.3% | 95.9% |
| pure-unit-matrix\|rapid | 66 | 2 | 3.0% | 0 | 25.2s | 32.5% | 96.4% |
| pure-unit-matrix\|three-waves | 66 | 1 | 1.5% | 0 | 22.5s | 33.0% | 96.6% |
| pure-unit-matrix\|two-waves | 66 | 2 | 3.0% | 0 | 22.8s | 34.1% | 94.5% |
| pure-unit-matrix\|drip | 64 | 1 | 1.6% | 0 | 22.2s | 30.6% | 97.8% |
| policy-exploration\|two-waves | 36 | 1 | 2.8% | 0 | 24.6s | 22.2% | 87.7% |
| policy-exploration\|burst | 34 | 1 | 2.9% | 0 | 19.1s | 25.3% | 92.0% |
| policy-exploration\|drip | 34 | 1 | 2.9% | 0 | 18.5s | 20.8% | 86.7% |
| policy-exploration\|rapid | 34 | 4 | 11.8% | 0 | 18.0s | 21.5% | 80.2% |
| policy-exploration\|three-waves | 34 | 1 | 2.9% | 0 | 17.3s | 20.1% | 90.7% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 164 | 5 | 3.0% | 0 | 23.5s | 33.7% | 95.2% |
| pure-unit-matrix\|tank-front-support-rear | 164 | 3 | 1.8% | 0 | 23.1s | 31.7% | 97.3% |
| policy-exploration\|roster-order | 86 | 4 | 4.7% | 0 | 20.5s | 22.8% | 88.6% |
| policy-exploration\|tank-front-support-rear | 86 | 4 | 4.7% | 0 | 18.7s | 21.2% | 86.3% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-mage | 50 | 0 | 0.0% | 0 | 16.3s | 21.8% | 100.0% |
| pure-archer | 48 | 0 | 0.0% | 0 | 24.4s | 25.9% | 99.8% |
| pure-fire_dragon | 48 | 0 | 0.0% | 0 | 14.1s | 30.4% | 99.5% |
| pure-knight | 48 | 2 | 4.2% | 0 | 31.2s | 35.0% | 92.1% |
| pure-mechanical_dragon | 48 | 1 | 2.1% | 0 | 22.1s | 34.6% | 97.2% |
| pure-mimic | 48 | 3 | 6.3% | 0 | 26.9s | 33.8% | 90.1% |
| pure-demon_king | 46 | 6 | 13.0% | 0 | 29.4s | 43.9% | 80.0% |
| pure-pea_shooter | 46 | 0 | 0.0% | 0 | 18.5s | 24.9% | 100.0% |
| core-mimic-filled | 9 | 3 | 33.3% | 0 | 29.7s | 24.9% | 55.7% |
| random-5 | 9 | 0 | 0.0% | 0 | 16.0s | 16.9% | 95.4% |
| support-mix | 9 | 0 | 0.0% | 0 | 17.1s | 16.9% | 91.1% |
| air-pressure | 7 | 0 | 0.0% | 0 | 13.1s | 22.2% | 96.0% |
| balanced | 7 | 0 | 0.0% | 0 | 16.0s | 28.1% | 91.3% |
| core-fire_dragon-filled | 7 | 0 | 0.0% | 0 | 17.9s | 28.1% | 93.2% |
| hero-necro-dragon-mages | 7 | 0 | 0.0% | 0 | 18.7s | 25.6% | 93.4% |
| melee-pressure | 7 | 0 | 0.0% | 0 | 22.2s | 23.6% | 62.8% |
| random-2 | 7 | 0 | 0.0% | 0 | 30.7s | 21.7% | 98.7% |
| random-4 | 7 | 0 | 0.0% | 0 | 21.1s | 28.6% | 92.4% |
| random-3 | 6 | 0 | 0.0% | 0 | 15.6s | 10.9% | 90.1% |
| ranged-pressure | 6 | 0 | 0.0% | 0 | 14.8s | 32.8% | 100.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 6 | 0 | 0.0% | 0 | 16.6s | 23.6% | 91.6% |
| center-column__burst__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 18.3s | 23.0% | 100.0% |
| center-column__rapid__roster-order | 6 | 0 | 0.0% | 0 | 19.9s | 23.6% | 93.0% |
| center-column__rapid__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 19.1s | 26.4% | 100.0% |
| center-column__two-waves__roster-order | 6 | 0 | 0.0% | 0 | 32.0s | 33.9% | 99.3% |
| center-column__two-waves__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 16.5s | 18.4% | 92.1% |
| wide-line__burst__roster-order | 6 | 0 | 0.0% | 0 | 17.7s | 26.4% | 100.0% |
| wide-line__burst__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 19.8s | 29.3% | 100.0% |
| wide-line__drip__roster-order | 6 | 0 | 0.0% | 0 | 16.3s | 25.9% | 100.0% |
| wide-line__drip__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 20.6s | 35.6% | 100.0% |
| wide-line__rapid__roster-order | 6 | 0 | 0.0% | 0 | 13.8s | 18.4% | 98.4% |
| wide-line__rapid__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 18.3s | 25.3% | 100.0% |
| wide-line__three-waves__roster-order | 6 | 0 | 0.0% | 0 | 20.1s | 37.4% | 100.0% |
| wide-line__three-waves__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 16.8s | 16.7% | 97.7% |
| wide-line__two-waves__roster-order | 6 | 0 | 0.0% | 0 | 15.0s | 36.2% | 100.0% |
| wide-line__two-waves__tank-front-support-rear | 6 | 0 | 0.0% | 0 | 22.5s | 31.0% | 100.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| wide-line | 60 | 0 | 0.0% | 0 | 18.1s | 28.2% | 99.6% |
| center-column | 56 | 0 | 0.0% | 0 | 21.0s | 27.5% | 97.1% |
| diamond | 50 | 4 | 8.0% | 0 | 25.5s | 35.4% | 86.0% |
| edge-sweep | 50 | 1 | 2.0% | 0 | 15.9s | 23.2% | 93.1% |
| inverted-wedge | 50 | 1 | 2.0% | 0 | 21.5s | 28.8% | 93.2% |
| three-lane | 50 | 3 | 6.0% | 0 | 23.0s | 30.8% | 89.2% |
| vanguard-wedge | 50 | 3 | 6.0% | 0 | 22.4s | 26.1% | 90.2% |
| left-flank | 48 | 2 | 4.2% | 0 | 24.5s | 28.0% | 92.1% |
| dual-flank | 46 | 2 | 4.3% | 0 | 25.5s | 33.0% | 93.9% |
| right-flank | 40 | 0 | 0.0% | 0 | 24.4s | 30.0% | 96.6% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| two-waves | 102 | 3 | 2.9% | 0 | 23.5s | 29.9% | 92.1% |
| burst | 100 | 3 | 3.0% | 0 | 22.1s | 30.6% | 94.6% |
| rapid | 100 | 6 | 6.0% | 0 | 22.8s | 28.8% | 90.9% |
| three-waves | 100 | 2 | 2.0% | 0 | 20.7s | 28.6% | 94.6% |
| drip | 98 | 2 | 2.0% | 0 | 20.9s | 27.2% | 93.9% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 250 | 9 | 3.6% | 0 | 22.5s | 29.9% | 92.9% |
| tank-front-support-rear | 250 | 7 | 2.8% | 0 | 21.6s | 28.1% | 93.5% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 353 | 8 | 2.3% | 0 | 23.1s | 32.5% | 96.3% |
| cannon-medkit | 31 | 1 | 3.2% | 0 | 24.1s | 35.0% | 96.6% |
| cannon-focus | 30 | 0 | 0.0% | 0 | 19.5s | 28.9% | 100.0% |
| cannon-rally | 30 | 3 | 10.0% | 0 | 13.8s | 4.1% | 69.1% |
| medkit-entry | 29 | 0 | 0.0% | 0 | 22.6s | 29.8% | 99.9% |
| rally-core | 27 | 4 | 14.8% | 0 | 16.8s | 3.1% | 60.4% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 131 | 6 | 4.6% | 0 | 20.2s | 31.2% | 89.1% |
| legendary | 48 | 2 | 4.2% | 0 | 21.1s | 26.1% | 89.7% |
| unrevealed | 46 | 0 | 0.0% | 0 | 20.0s | 22.2% | 89.2% |
| epic | 40 | 0 | 0.0% | 0 | 18.3s | 20.6% | 92.4% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 67 | 6 | 9.0% | 0 | 25.3s | 34.3% | 80.7% |
| fire_dragon\|common | 64 | 0 | 0.0% | 0 | 15.0s | 27.9% | 97.9% |
| fire_dragon\|unrevealed | 30 | 0 | 0.0% | 0 | 18.5s | 22.0% | 90.1% |
| fire_dragon\|legendary | 25 | 1 | 4.0% | 0 | 21.0s | 25.4% | 90.5% |
| demon_king\|legendary | 23 | 1 | 4.3% | 0 | 21.3s | 27.0% | 88.9% |
| fire_dragon\|epic | 21 | 0 | 0.0% | 0 | 17.2s | 20.4% | 92.7% |
| demon_king\|epic | 19 | 0 | 0.0% | 0 | 19.4s | 20.9% | 92.0% |
| demon_king\|unrevealed | 16 | 0 | 0.0% | 0 | 22.8s | 22.6% | 87.6% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 373 | 9 | 2.4% | 0 | 22.7s | 31.1% | 95.1% |
| ward-2 | 44 | 2 | 4.5% | 0 | 20.5s | 24.3% | 87.9% |
| ward-1 | 43 | 5 | 11.6% | 0 | 20.6s | 25.3% | 84.5% |
| ward-3 | 40 | 0 | 0.0% | 0 | 18.5s | 18.4% | 90.6% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 500 | 16 | 3.2% | 0 | 22.0s | 29.0% | 93.2% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| knight | 153 | 6 | 3.9% | 0 | 23.6s | 25.6% | 88.2% |
| fire_dragon | 140 | 1 | 0.7% | 0 | 17.1s | 25.0% | 94.1% |
| archer | 135 | 4 | 3.0% | 0 | 21.7s | 23.6% | 91.6% |
| mage | 133 | 1 | 0.8% | 0 | 18.0s | 21.4% | 94.6% |
| mimic | 129 | 7 | 5.4% | 0 | 23.2s | 25.8% | 86.0% |
| demon_king | 125 | 7 | 5.6% | 0 | 23.4s | 29.4% | 84.8% |
| mechanical_dragon | 114 | 2 | 1.8% | 0 | 20.1s | 26.8% | 95.4% |
| pea_shooter | 100 | 1 | 1.0% | 0 | 19.1s | 22.9% | 96.3% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 41 | 0.0% | 0.0%-8.6% | 26.6% | 100.0% | 0.0% |
| demon_king | 41 | 14.6% | 6.9%-28.4% | 46.8% | 83.7% | 4.3% |
| fire_dragon | 41 | 0.0% | 0.0%-8.6% | 30.4% | 100.0% | 0.0% |
| knight | 41 | 0.0% | 0.0%-8.6% | 35.4% | 95.7% | 0.0% |
| mage | 41 | 0.0% | 0.0%-8.6% | 23.8% | 100.0% | 0.0% |
| mechanical_dragon | 41 | 2.4% | 0.4%-12.6% | 37.4% | 97.1% | 0.2% |
| mimic | 41 | 2.4% | 0.4%-12.6% | 36.5% | 93.3% | 0.3% |
| pea_shooter | 41 | 0.0% | 0.0%-8.6% | 24.8% | 100.0% | 0.0% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 41 | 0.0% | 0.0%-8.6% | 26.6% | 100.0% | 0.0% |
| demon_king\|TH6 | 41 | 14.6% | 6.9%-28.4% | 46.8% | 83.7% | 4.3% |
| fire_dragon\|TH6 | 41 | 0.0% | 0.0%-8.6% | 30.4% | 100.0% | 0.0% |
| knight\|TH6 | 41 | 0.0% | 0.0%-8.6% | 35.4% | 95.7% | 0.0% |
| mage\|TH6 | 41 | 0.0% | 0.0%-8.6% | 23.8% | 100.0% | 0.0% |
| mechanical_dragon\|TH6 | 41 | 2.4% | 0.4%-12.6% | 37.4% | 97.1% | 0.2% |
| mimic\|TH6 | 41 | 2.4% | 0.4%-12.6% | 36.5% | 93.3% | 0.3% |
| pea_shooter\|TH6 | 41 | 0.0% | 0.0%-8.6% | 24.8% | 100.0% | 0.0% |

## Strongest Defensive Bases

| Base | TH | Formation | Progression | Battles | Attacker Win Rate | TH HP Left |
|---|---:|---|---|---:|---:|---:|
| th6-resource-shield-017 | 6 | resource-shield | maxed | 13 | 0.0% | 99.5% |
| th6-southern-funnel-068 | 6 | southern-funnel | maxed | 13 | 0.0% | 98.6% |
| th6-split-core-119 | 6 | split-core | maxed | 13 | 0.0% | 98.5% |
| th6-rear-keep-092 | 6 | rear-keep | rushed-defense | 13 | 0.0% | 98.5% |
| th6-asymmetric-right-296 | 6 | asymmetric-right | rushed-defense | 13 | 0.0% | 97.0% |
| th6-compact-core-110 | 6 | compact-core | rushed-defense | 13 | 0.0% | 97.0% |
| th6-compact-core-272 | 6 | compact-core | maxed | 13 | 0.0% | 96.9% |
| th6-southern-funnel-176 | 6 | southern-funnel | rushed-defense | 13 | 0.0% | 95.4% |
| th6-layered-rings-170 | 6 | layered-rings | maxed | 13 | 0.0% | 94.6% |
| th6-trap-lanes-245 | 6 | trap-lanes | rushed-defense | 13 | 0.0% | 92.5% |
| th6-corner-keep-194 | 6 | corner-keep | rushed-defense | 13 | 0.0% | 92.2% |
| th6-asymmetric-left-293 | 6 | asymmetric-left | rushed-defense | 13 | 0.0% | 88.2% |
| th6-resource-shield-287 | 6 | resource-shield | maxed | 12 | 0.0% | 100.0% |
| th6-trap-lanes-137 | 6 | trap-lanes | maxed | 12 | 0.0% | 99.4% |
| th6-corner-keep-086 | 6 | corner-keep | maxed | 12 | 0.0% | 98.4% |

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

- **CRITICAL / coverage:** Missing content coverage. Buildings: altar; troops: none.
- **CRITICAL / town-hall-target-band:** policy-exploration|TH6 has 4.7% attacker wins across 172 samples; authored target is 53.0%-57.0%.
- **CRITICAL / base-counter-meta-concentration:** Counter concentration is excessive: top-1 59.3%, top-3 85.6%, inverse-HHI effective families 2.52.
- **CRITICAL / base-counter-town-hall-concentration:** TH6 top counter core-mimic-filled owns 59.3% of near-best credit across only 9 families.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / policy-exploration-win-rate:** Policy-exploration attacker win rate 4.7% is outside 55.0% +/- 2.0% across 172 samples. Adaptive training and controlled pure-unit battles are excluded.
- **WARNING / underpowered-pure-army:** Pure archer armies have 0.0% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure demon_king armies have 14.6% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure fire_dragon armies have 0.0% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure knight armies have 0.0% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure mage armies have 0.0% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure mechanical_dragon armies have 2.4% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure mimic armies have 2.4% attacker wins across 41 isolated samples.
- **WARNING / underpowered-pure-army:** Pure pea_shooter armies have 0.0% attacker wins across 41 isolated samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-092 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-254 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-017 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-125 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-287 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-068 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-176 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-119 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-227 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-137 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-245 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-023 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-185 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-293 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-026 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-296 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-002 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-110 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-272 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-086 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-194 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-152 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-260 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-221 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-101 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-008 has 0 attacker wins across 12 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-170 has 0 attacker wins across 13 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-278 has 0 attacker wins across 11 controlled/policy-exploration samples.
- **WARNING / base-counter-probe-no-win:** 2/41 layouts have no observed win among the 15 selected compositions and their probe contexts; the separate adaptive breakability gate remains authoritative for counter existence.
- **WARNING / base-counter-discovery-no-win:** 11/41 layouts have no win in the paired discovery matrix before any locked holdout.
- **WARNING / base-counter-holdout-failure:** 28/41 layouts had neither locked top-two counter win on the unseen holdout deployment.
- **WARNING / base-counter-breadth:** Only 36.6% of layouts have at least two distinct winning compositions; target is 95%.
- **WARNING / base-counter-strong-breadth:** 22.0% of layouts have three winning compositions and 36.6% have counters from two recipe families; both targets are 80%.
- **WARNING / base-counter-scouting-value:** Only 12.2% of layouts force the universal army to lose while another wins; mean base-specific regret is 0.06.
- **INFO / unbeaten-base:** th6-rear-keep-092 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-rear-keep-254 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-resource-shield-017 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-resource-shield-125 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-resource-shield-287 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-068 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-southern-funnel-176 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-split-core-119 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-split-core-227 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-137 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-trap-lanes-245 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-023 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-185 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-asymmetric-left-293 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-026 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-asymmetric-right-296 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-compact-core-002 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-compact-core-110 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-compact-core-272 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-corner-keep-086 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-corner-keep-194 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-crossfire-152 has 0.0% attacker wins across 11 samples.
- **INFO / unbeaten-base:** th6-crossfire-260 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-defense-ring-221 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-echelon-left-101 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-layered-rings-008 has 0.0% attacker wins across 12 samples.
- **INFO / unbeaten-base:** th6-layered-rings-170 has 0.0% attacker wins across 13 samples.
- **INFO / unbeaten-base:** th6-layered-rings-278 has 0.0% attacker wins across 11 samples.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
