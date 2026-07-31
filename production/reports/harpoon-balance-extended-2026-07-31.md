# Clash Full-Game Balance Lab

**Generated:** 2026-07-31T13:56:05.025Z
**Seed:** 731
**Town Halls:** TH1, TH2, TH3, TH4, TH5, TH6, TH7
**Unique loaded bases:** 300
**Base report source:** `production/reports/harpoon-balance-2026-07-31.json`
**Selected base IDs:** all matching profile
**Unique attack policies:** 500
**Capacity-filled core army templates:** 19
**Spawn mechanics:** 100 (10 formations x 5 timings x 2 role orders)
**Controlled pure-unit battles:** 1000
**Unbeaten non-adaptive bases (n >= 6):** 46
**Breakability probe:** 0 calibration + gate + focused + adaptive rescue battles; 0/0 valid-tested bases unbeaten; 0 untested; 0 invalid-only
**Adaptive breakability army breadth:** up to 3 closest distinct ordered army templates per unresolved base
**Base-counter response matrix:** 10000 battles; 300 bases x 15 selected same-TH compositions x 2 paired discovery contexts, plus locked holdouts
**Equal-slot unit utility probe:** 0 battles
**Paired NFT rarity probe:** 0 battles
**Lab offense scales:** L5=1x, L6=1x, L7=1x
**Lab late-tier troop scales:** none
**Lab defense damage scale:** 1x
**Lab L5+ defense/guard scale:** 1x
**Lab TH7 defense/guard scale:** 1x
**Lab Mimic concealment ends on first attack:** no
**Lab Mimic trap damage scale while immune:** 0x
**Balance replay simulations:** 1000
**Ship capacity used:** 45 slots
**Ship capacity by Town Hall:** TH1=3, TH2=12, TH3=27, TH4=36, TH5=45, TH6=45, TH7=45
**Matchmaking mode:** same Town Hall only
**Elapsed:** 273.0s

## Method

- Uses the production `server/combat_session.js` replay simulator.
- Reads current building, Town Hall, troop, level, slot, defense, and grid definitions.
- Uses a temporary SQLite database and never reads or writes production player data.
- Replays the exact validated base catalog from `production/reports/harpoon-balance-2026-07-31.json`; imported base and building IDs must be non-empty and unique.
- Samples exactly 100 deterministic spawn mechanics, 12 tactical plans, troop levels, NFT rarity boosts, and defender Ward levels.
- The controlled pure-unit matrix fixes tactics to none, rarity to common, Ward to 0, and troop level to the attacker Town Hall cap across all represented base archetypes.
- The base-counter response matrix fixes common rarity, Ward 0, maxed same-TH levels, and paired deployment contexts across 15 capacity-filled representative pure/mixed compositions per base. It ranks compositions by win, destruction, Town Hall damage, and survival, then replays the locked top-two and the strongest universal family on guaranteed distinct contexts. These battles are excluded from population win rate and do not replace the broader adaptive breakability search.
- The equal-slot utility probe replaces roughly 15-20 starter slots with each candidate role package on identical TH7 reference bases, spawn plans, levels, tactics, rarity, and Ward. TH8-TH10 troops are explicitly projections against the current TH7 defense ceiling.
- The NFT rarity probe changes only common/epic/legendary rarity on the same pure-NFT army, base, spawn, troop levels, tactics, and Ward.
- The remaining policy population explores mixed armies, boosts, abilities, formations, timing, and role ordering; adversarial rounds then mutate the strongest attacks and defenses.
- Elite attack policies require at least 3 exploration samples; each child mutates one policy dimension, and training uses balanced Latin-square attack/base pairing.
- Reusing the same seed makes before/after balance comparisons reproducible.

## Content Discovery

- Buildings: altar, archer_tower, barn, cannon, harpoon, mage_tower, mine, mortar, sawmill, shark_trap, storage, tombstone, town_hall, turret
- Active troops: archer, demon_king, fire_dragon, horror, ice_golem, knight, mage, mechanical_dragon, mimic, necromancer, pea_shooter, wind_mage
- Building coverage: 14/14
- Troop simulation coverage: 7/8
- Spawn-mechanic coverage: 100/100
- Spawn coverage by Town Hall: TH6=100/100
- Bases exercised: 150/300

## Overall Health

| Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left | Troop Survival |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% | 36.4% |

## Base-Counter Response Matrix

The probe compares 15 selected capacity-filled compositions per Town Hall under identical discovery contexts. Selection coverage: TH6=15/26, TH7=15/27. Near-best compositions within 0.03 utility share counter credit, so ties do not manufacture a single winner.

- Discovery matrix: 9000 battles
- Locked top-two counter holdout: 600 battles
- Universal-family holdout: 300 battles
- Hard-layout confirmation: 100 battles
- Invalid battles: 0
- Bases with no discovery-matrix win: 55/300
- Bases with no observed win in any probe phase: 29/300
- Bases where neither locked top-two counter won its holdout: 92/300
- Bases with at least two / three winning compositions: 71.3% / 67.3%
- Bases with winning counters from at least two recipe families: 71.3%
- Bases losing to at least 12/15 compositions in both discovery contexts: 48.3%
- Top-1 / top-3 near-best counter share: 18.9% / 39.4%
- Counter-family effective count (inverse HHI / Shannon): 11.17 / 13.31
- Strongest universal family: core-mimic-filled — 76.0% discovery coverage, 73.0% unseen-context win rate
- Layouts forcing the universal family to lose while another composition wins: 5.7%; mean universal regret 0.05

| Defense Level Profile | Bases | Discovery WR | Discovery Zero-Counter | Total Zero-Counter | 2+ Counters | 3+ Counters | Multi-Family | Robust 12+/15 Losses |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| maxed | 60 | 3.3% | 35 | 18 | 18.3% | 10.0% | 18.3% | 0.0% |
| mid | 60 | 89.0% | 0 | 0 | 100.0% | 100.0% | 100.0% | 70.0% |
| mixed | 60 | 86.3% | 1 | 0 | 98.3% | 98.3% | 98.3% | 71.7% |
| rushed-defense | 60 | 7.0% | 19 | 11 | 40.0% | 28.3% | 40.0% | 0.0% |
| rushed-economy | 60 | 100.0% | 0 | 0 | 100.0% | 100.0% | 100.0% | 100.0% |

| Town Hall | Credited Bases | Counter Families | Top Counter | Top-1 Share | Top-3 Share | Effective Families |
|---|---:|---:|---|---:|---:|---:|
| TH6 | 127 | 15 | core-mimic-filled | 21.0% | 42.3% | 10.15 |
| TH7 | 118 | 15 | core-mimic-filled | 16.5% | 40.1% | 11.02 |

| Composition | Recipe Family | TH Coverage | Discovery Base Coverage | Discovery WR | Near-Best Share (Credited Bases) | Locked Holdout | Universal Holdout |
|---|---|---|---:|---:|---:|---:|---:|
| core-mimic-filled | core-mimic | TH6, TH7 | 76.0% | 70.2% | 18.9% | 65/106 (61.3%) | 219/300 (73.0%) |
| pure-demon_king | pure-demon_king | TH6, TH7 | 66.7% | 64.2% | 10.5% | 120/152 (78.9%) | N/A |
| core-fire_dragon-filled | core-fire_dragon | TH6, TH7 | 65.0% | 62.0% | 10.0% | 20/48 (41.7%) | N/A |
| pure-knight | pure-knight | TH6, TH7 | 64.7% | 61.5% | 7.3% | 17/40 (42.5%) | N/A |
| balanced | mixed | TH6, TH7 | 64.0% | 61.0% | 7.3% | 7/37 (18.9%) | N/A |
| core-mechanical_dragon-filled | core-mechanical_dragon | TH6, TH7 | 61.0% | 56.5% | 6.7% | 66/89 (74.2%) | N/A |
| melee-pressure | frontline | TH6, TH7 | 62.3% | 61.0% | 6.6% | 19/31 (61.3%) | N/A |
| trap-runner-mix | utility | TH6, TH7 | 61.0% | 59.0% | 5.7% | 22/29 (75.9%) | N/A |
| frontline-ranged | ranged | TH6, TH7 | 60.3% | 57.8% | 5.0% | 6/10 (60.0%) | N/A |
| support-mix | support | TH6, TH7 | 59.0% | 56.2% | 4.8% | 8/12 (66.7%) | N/A |
| ranged-pressure | ranged | TH6, TH7 | 56.3% | 52.5% | 4.0% | 10/11 (90.9%) | N/A |
| pure-archer | pure-archer | TH6, TH7 | 52.7% | 48.3% | 3.1% | 3/6 (50.0%) | N/A |
| pure-pea_shooter | pure-pea_shooter | TH6, TH7 | 50.7% | 46.3% | 3.0% | 5/5 (100.0%) | N/A |
| hero-necro-dragon-mages | support | TH6 | 60.7% | 59.3% | 2.9% | 6/11 (54.5%) | N/A |
| core-mage-filled | core-mage | TH6, TH7 | 52.7% | 48.0% | 2.7% | 1/1 (100.0%) | N/A |
| pure-necromancer | pure-necromancer | TH7 | 51.3% | 45.3% | 1.5% | 10/12 (83.3%) | N/A |

| Hard Base | TH | Layout | Winners (All Probe Phases) | Discovery Recipe Families | Locked Top-Two Holdout | Best / Runner-up |
|---|---:|---|---:|---:|---|---|
| th6-asymmetric-left-195 | 6 | asymmetric-left / rushed-defense | 0 | 0 | loss | pure-demon_king / core-mechanical_dragon-filled |
| th6-corner-keep-057 | 6 | corner-keep / maxed | 0 | 0 | loss | balanced / hero-necro-dragon-mages |
| th6-rear-keep-061 | 6 | rear-keep / rushed-defense | 0 | 0 | loss | balanced / pure-demon_king |
| th6-resource-shield-011 | 6 | resource-shield / maxed | 0 | 0 | loss | trap-runner-mix / hero-necro-dragon-mages |
| th6-resource-shield-263 | 6 | resource-shield / rushed-defense | 0 | 0 | loss | pure-demon_king / core-mimic-filled |
| th6-southern-funnel-045 | 6 | southern-funnel / maxed | 0 | 0 | loss | balanced / pure-demon_king |
| th6-trap-lanes-091 | 6 | trap-lanes / maxed | 0 | 0 | loss | balanced / pure-demon_king |
| th7-asymmetric-left-124 | 7 | asymmetric-left / maxed | 0 | 0 | loss | core-fire_dragon-filled / pure-archer |
| th7-asymmetric-right-018 | 7 | asymmetric-right / rushed-defense | 0 | 0 | loss | core-mimic-filled / trap-runner-mix |
| th7-asymmetric-right-198 | 7 | asymmetric-right / rushed-defense | 0 | 0 | loss | core-mimic-filled / pure-knight |
| th7-compact-core-002 | 7 | compact-core / maxed | 0 | 0 | loss | core-mimic-filled / pure-knight |
| th7-compact-core-074 | 7 | compact-core / rushed-defense | 0 | 0 | loss | core-mimic-filled / core-fire_dragon-filled |
| th7-compact-core-182 | 7 | compact-core / maxed | 0 | 0 | loss | balanced / core-mechanical_dragon-filled |
| th7-compact-core-254 | 7 | compact-core / rushed-defense | 0 | 0 | loss | balanced / core-mimic-filled |
| th7-corner-keep-058 | 7 | corner-keep / maxed | 0 | 0 | loss | core-fire_dragon-filled / core-mimic-filled |
| th7-corner-keep-130 | 7 | corner-keep / rushed-defense | 0 | 0 | loss | balanced / melee-pressure |
| th7-defense-ring-148 | 7 | defense-ring / maxed | 0 | 0 | loss | balanced / frontline-ranged |
| th7-defense-ring-220 | 7 | defense-ring / rushed-defense | 0 | 0 | loss | core-fire_dragon-filled / core-mimic-filled |
| th7-diamond-204 | 7 | diamond / maxed | 0 | 0 | loss | core-fire_dragon-filled / balanced |
| th7-kill-corridor-036 | 7 | kill-corridor / maxed | 0 | 0 | loss | core-mechanical_dragon-filled / core-fire_dragon-filled |
| th7-layered-rings-114 | 7 | layered-rings / maxed | 0 | 0 | loss | core-mimic-filled / balanced |
| th7-layered-rings-294 | 7 | layered-rings / maxed | 0 | 0 | loss | pure-archer / balanced |
| th7-rear-keep-170 | 7 | rear-keep / maxed | 0 | 0 | loss | balanced / frontline-ranged |
| th7-resource-shield-012 | 7 | resource-shield / maxed | 0 | 0 | loss | core-fire_dragon-filled / balanced |
| th7-resource-shield-192 | 7 | resource-shield / maxed | 0 | 0 | loss | core-mimic-filled / pure-demon_king |
| th7-southern-funnel-226 | 7 | southern-funnel / maxed | 0 | 0 | loss | balanced / frontline-ranged |
| th7-southern-funnel-298 | 7 | southern-funnel / rushed-defense | 0 | 0 | loss | pure-demon_king / core-mimic-filled |
| th7-split-core-080 | 7 | split-core / maxed | 0 | 0 | loss | balanced / core-fire_dragon-filled |
| th7-split-core-152 | 7 | split-core / rushed-defense | 0 | 0 | loss | core-fire_dragon-filled / balanced |
| th6-asymmetric-left-015 | 6 | asymmetric-left / rushed-defense | 1 | 1 | loss | core-mimic-filled / melee-pressure |
| th6-asymmetric-left-123 | 6 | asymmetric-left / maxed | 1 | 0 | loss | core-mechanical_dragon-filled / pure-archer |
| th6-asymmetric-right-125 | 6 | asymmetric-right / maxed | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th6-asymmetric-right-197 | 6 | asymmetric-right / rushed-defense | 1 | 1 | loss | core-mimic-filled / pure-demon_king |
| th6-corner-keep-237 | 6 | corner-keep / maxed | 1 | 0 | loss | ranged-pressure / frontline-ranged |
| th6-crossfire-101 | 6 | crossfire / maxed | 1 | 0 | loss | balanced / pure-demon_king |
| th6-defense-ring-039 | 6 | defense-ring / rushed-defense | 1 | 0 | loss | core-mechanical_dragon-filled / pure-demon_king |
| th6-defense-ring-147 | 6 | defense-ring / maxed | 1 | 0 | loss | core-fire_dragon-filled / pure-demon_king |
| th6-kill-corridor-287 | 6 | kill-corridor / rushed-defense | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th6-layered-rings-185 | 6 | layered-rings / rushed-defense | 1 | 1 | loss | core-mimic-filled / melee-pressure |
| th6-layered-rings-293 | 6 | layered-rings / maxed | 1 | 0 | loss | pure-demon_king / core-mechanical_dragon-filled |
| th6-rear-keep-169 | 6 | rear-keep / maxed | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th6-southern-funnel-225 | 6 | southern-funnel / maxed | 1 | 0 | loss | pure-demon_king / pure-knight |
| th6-split-core-079 | 6 | split-core / maxed | 1 | 0 | loss | melee-pressure / pure-knight |
| th6-split-core-259 | 6 | split-core / maxed | 1 | 0 | loss | hero-necro-dragon-mages / pure-demon_king |
| th6-trap-lanes-163 | 6 | trap-lanes / rushed-defense | 1 | 1 | loss | core-mimic-filled / melee-pressure |
| th7-asymmetric-left-016 | 7 | asymmetric-left / rushed-defense | 1 | 0 | loss | core-mechanical_dragon-filled / core-fire_dragon-filled |
| th7-asymmetric-left-196 | 7 | asymmetric-left / rushed-defense | 1 | 1 | loss | core-mimic-filled / pure-knight |
| th7-asymmetric-right-126 | 7 | asymmetric-right / maxed | 1 | 0 | loss | core-fire_dragon-filled / balanced |
| th7-crossfire-102 | 7 | crossfire / maxed | 1 | 1 | loss | core-mimic-filled / trap-runner-mix |
| th7-crossfire-282 | 7 | crossfire / maxed | 1 | 0 | loss | balanced / core-fire_dragon-filled |
| … | | 42 additional hard bases are available in JSON | | | | |

## Town Hall Matchups

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| TH6->TH6 | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## Base Archetypes

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings | 63 | 31 | 49.2% | 0 | 27.9s | 61.5% | 50.5% |
| resource-shield | 63 | 33 | 52.4% | 0 | 29.4s | 60.2% | 45.7% |
| southern-funnel | 63 | 33 | 52.4% | 0 | 29.2s | 60.1% | 46.3% |
| split-core | 63 | 36 | 57.1% | 0 | 28.1s | 61.2% | 42.4% |
| compact-core | 60 | 32 | 53.3% | 0 | 28.2s | 62.4% | 46.2% |
| asymmetric-left | 56 | 33 | 58.9% | 0 | 30.3s | 65.3% | 38.4% |
| asymmetric-right | 56 | 32 | 57.1% | 0 | 30.7s | 64.8% | 41.9% |
| cannon-screen | 56 | 44 | 78.6% | 0 | 37.7s | 70.4% | 20.7% |
| kill-corridor | 56 | 31 | 55.4% | 0 | 33.1s | 61.4% | 44.0% |
| rear-keep | 56 | 34 | 60.7% | 0 | 30.7s | 65.1% | 38.9% |
| trap-lanes | 56 | 32 | 57.1% | 0 | 28.4s | 61.1% | 42.9% |
| wide-spread | 56 | 39 | 69.6% | 0 | 33.2s | 73.3% | 29.5% |
| defense-ring | 54 | 30 | 55.6% | 0 | 29.6s | 67.9% | 43.3% |
| echelon-right | 50 | 31 | 62.0% | 0 | 32.6s | 60.9% | 35.4% |
| corner-keep | 48 | 26 | 54.2% | 0 | 28.4s | 61.7% | 41.2% |
| crossfire | 48 | 31 | 64.6% | 0 | 28.3s | 61.7% | 35.4% |
| diamond | 48 | 22 | 45.8% | 0 | 28.6s | 60.1% | 53.9% |
| echelon-left | 48 | 30 | 62.5% | 0 | 30.0s | 64.6% | 37.2% |

## Base Archetypes by Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| layered-rings\|TH6 | 63 | 31 | 49.2% | 0 | 27.9s | 61.5% | 50.5% |
| resource-shield\|TH6 | 63 | 33 | 52.4% | 0 | 29.4s | 60.2% | 45.7% |
| southern-funnel\|TH6 | 63 | 33 | 52.4% | 0 | 29.2s | 60.1% | 46.3% |
| split-core\|TH6 | 63 | 36 | 57.1% | 0 | 28.1s | 61.2% | 42.4% |
| compact-core\|TH6 | 60 | 32 | 53.3% | 0 | 28.2s | 62.4% | 46.2% |
| asymmetric-left\|TH6 | 56 | 33 | 58.9% | 0 | 30.3s | 65.3% | 38.4% |
| asymmetric-right\|TH6 | 56 | 32 | 57.1% | 0 | 30.7s | 64.8% | 41.9% |
| cannon-screen\|TH6 | 56 | 44 | 78.6% | 0 | 37.7s | 70.4% | 20.7% |
| kill-corridor\|TH6 | 56 | 31 | 55.4% | 0 | 33.1s | 61.4% | 44.0% |
| rear-keep\|TH6 | 56 | 34 | 60.7% | 0 | 30.7s | 65.1% | 38.9% |
| trap-lanes\|TH6 | 56 | 32 | 57.1% | 0 | 28.4s | 61.1% | 42.9% |
| wide-spread\|TH6 | 56 | 39 | 69.6% | 0 | 33.2s | 73.3% | 29.5% |
| defense-ring\|TH6 | 54 | 30 | 55.6% | 0 | 29.6s | 67.9% | 43.3% |
| echelon-right\|TH6 | 50 | 31 | 62.0% | 0 | 32.6s | 60.9% | 35.4% |
| corner-keep\|TH6 | 48 | 26 | 54.2% | 0 | 28.4s | 61.7% | 41.2% |
| crossfire\|TH6 | 48 | 31 | 64.6% | 0 | 28.3s | 61.7% | 35.4% |
| diamond\|TH6 | 48 | 22 | 45.8% | 0 | 28.6s | 60.1% | 53.9% |
| echelon-left\|TH6 | 48 | 30 | 62.5% | 0 | 30.0s | 64.6% | 37.2% |

## Base Progression Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| rushed-defense | 201 | 19 | 9.5% | 0 | 25.0s | 40.6% | 87.7% |
| rushed-economy | 201 | 201 | 100.0% | 0 | 33.2s | 86.1% | 0.0% |
| maxed | 200 | 6 | 3.0% | 0 | 24.8s | 25.4% | 96.9% |
| mid | 199 | 177 | 88.9% | 0 | 36.1s | 82.8% | 9.9% |
| mixed | 199 | 177 | 88.9% | 0 | 32.1s | 82.8% | 9.8% |

## Experiment Cohorts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## Town Halls by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|TH6 | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## Troop Presence by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| pure-unit-matrix\|demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| pure-unit-matrix\|fire_dragon | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| pure-unit-matrix\|knight | 150 | 93 | 62.0% | 0 | 34.9s | 64.3% | 36.6% |
| pure-unit-matrix\|mage | 150 | 68 | 45.3% | 0 | 26.4s | 55.7% | 53.1% |
| pure-unit-matrix\|mechanical_dragon | 150 | 90 | 60.0% | 0 | 26.7s | 66.5% | 40.0% |
| pure-unit-matrix\|mimic | 100 | 63 | 63.0% | 0 | 35.6s | 66.1% | 36.0% |

## Troop Presence by Cohort and Town Hall

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|archer\|TH6 | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| pure-unit-matrix\|demon_king\|TH6 | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| pure-unit-matrix\|fire_dragon\|TH6 | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| pure-unit-matrix\|knight\|TH6 | 150 | 93 | 62.0% | 0 | 34.9s | 64.3% | 36.6% |
| pure-unit-matrix\|mage\|TH6 | 150 | 68 | 45.3% | 0 | 26.4s | 55.7% | 53.1% |
| pure-unit-matrix\|mechanical_dragon\|TH6 | 150 | 90 | 60.0% | 0 | 26.7s | 66.5% | 40.0% |
| pure-unit-matrix\|mimic\|TH6 | 100 | 63 | 63.0% | 0 | 35.6s | 66.1% | 36.0% |

## Tactics by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|none | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## Spawn Formations by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|center-column | 100 | 57 | 57.0% | 0 | 31.7s | 59.2% | 42.6% |
| pure-unit-matrix\|diamond | 100 | 58 | 58.0% | 0 | 29.3s | 63.6% | 41.1% |
| pure-unit-matrix\|dual-flank | 100 | 59 | 59.0% | 0 | 29.5s | 64.4% | 40.4% |
| pure-unit-matrix\|edge-sweep | 100 | 58 | 58.0% | 0 | 29.5s | 64.6% | 41.2% |
| pure-unit-matrix\|inverted-wedge | 100 | 57 | 57.0% | 0 | 33.1s | 64.0% | 41.6% |
| pure-unit-matrix\|left-flank | 100 | 58 | 58.0% | 0 | 31.0s | 63.8% | 39.9% |
| pure-unit-matrix\|right-flank | 100 | 58 | 58.0% | 0 | 29.9s | 61.6% | 39.2% |
| pure-unit-matrix\|three-lane | 100 | 63 | 63.0% | 0 | 28.6s | 67.9% | 37.0% |
| pure-unit-matrix\|vanguard-wedge | 100 | 59 | 59.0% | 0 | 31.7s | 63.5% | 40.2% |
| pure-unit-matrix\|wide-line | 100 | 53 | 53.0% | 0 | 27.8s | 62.6% | 46.0% |

## Spawn Timings by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|burst | 200 | 121 | 60.5% | 0 | 30.2s | 64.1% | 38.5% |
| pure-unit-matrix\|drip | 200 | 112 | 56.0% | 0 | 30.3s | 62.6% | 42.7% |
| pure-unit-matrix\|rapid | 200 | 113 | 56.5% | 0 | 30.2s | 62.7% | 42.4% |
| pure-unit-matrix\|three-waves | 200 | 110 | 55.0% | 0 | 30.4s | 61.7% | 43.8% |
| pure-unit-matrix\|two-waves | 200 | 124 | 62.0% | 0 | 29.9s | 66.5% | 37.2% |

## Deployment Orders by Experiment Cohort

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-unit-matrix\|roster-order | 500 | 281 | 56.2% | 0 | 29.3s | 62.9% | 42.3% |
| pure-unit-matrix\|tank-front-support-rear | 500 | 299 | 59.8% | 0 | 31.1s | 64.1% | 39.6% |

## Army Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| pure-archer | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| pure-demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| pure-fire_dragon | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| pure-knight | 150 | 93 | 62.0% | 0 | 34.9s | 64.3% | 36.6% |
| pure-mage | 150 | 68 | 45.3% | 0 | 26.4s | 55.7% | 53.1% |
| pure-mechanical_dragon | 150 | 90 | 60.0% | 0 | 26.7s | 66.5% | 40.0% |
| pure-mimic | 100 | 63 | 63.0% | 0 | 35.6s | 66.1% | 36.0% |

## Spawn Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column__burst__roster-order | 10 | 5 | 50.0% | 0 | 35.0s | 51.5% | 50.0% |
| center-column__burst__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 25.1s | 55.4% | 40.0% |
| center-column__drip__roster-order | 10 | 5 | 50.0% | 0 | 26.1s | 59.7% | 50.0% |
| center-column__drip__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 27.8s | 64.8% | 40.0% |
| center-column__rapid__roster-order | 10 | 6 | 60.0% | 0 | 31.9s | 60.7% | 40.0% |
| center-column__rapid__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 46.1s | 55.8% | 46.9% |
| center-column__three-waves__roster-order | 10 | 6 | 60.0% | 0 | 27.8s | 65.0% | 39.1% |
| center-column__three-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 31.3s | 54.1% | 50.0% |
| center-column__two-waves__roster-order | 10 | 6 | 60.0% | 0 | 26.5s | 63.0% | 40.0% |
| center-column__two-waves__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 39.5s | 61.7% | 30.0% |
| diamond__burst__roster-order | 10 | 6 | 60.0% | 0 | 26.6s | 60.5% | 40.0% |
| diamond__burst__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 26.8s | 57.6% | 50.0% |
| diamond__drip__roster-order | 10 | 6 | 60.0% | 0 | 29.5s | 60.6% | 40.0% |
| diamond__drip__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 27.1s | 59.6% | 50.0% |
| diamond__rapid__roster-order | 10 | 6 | 60.0% | 0 | 28.6s | 67.1% | 33.9% |
| diamond__rapid__tank-front-support-rear | 10 | 4 | 40.0% | 0 | 29.5s | 60.9% | 58.1% |
| diamond__three-waves__roster-order | 10 | 5 | 50.0% | 0 | 28.3s | 56.8% | 50.0% |
| diamond__three-waves__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 35.2s | 66.0% | 40.0% |
| diamond__two-waves__roster-order | 10 | 8 | 80.0% | 0 | 33.4s | 74.9% | 20.0% |
| diamond__two-waves__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 28.3s | 71.9% | 29.5% |
| dual-flank__burst__roster-order | 10 | 6 | 60.0% | 0 | 26.4s | 69.2% | 39.6% |
| dual-flank__burst__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 29.5s | 68.5% | 30.0% |
| dual-flank__drip__roster-order | 10 | 5 | 50.0% | 0 | 24.5s | 57.7% | 50.0% |
| dual-flank__drip__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 44.8s | 69.0% | 30.4% |
| dual-flank__rapid__roster-order | 10 | 4 | 40.0% | 0 | 23.8s | 53.0% | 60.0% |
| dual-flank__rapid__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 28.8s | 69.5% | 30.0% |
| dual-flank__three-waves__roster-order | 10 | 5 | 50.0% | 0 | 35.3s | 63.2% | 44.1% |
| dual-flank__three-waves__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 31.4s | 60.9% | 40.0% |
| dual-flank__two-waves__roster-order | 10 | 5 | 50.0% | 0 | 24.8s | 62.0% | 50.0% |
| dual-flank__two-waves__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 26.1s | 70.7% | 30.0% |
| edge-sweep__burst__roster-order | 10 | 6 | 60.0% | 0 | 29.5s | 68.3% | 40.0% |
| edge-sweep__burst__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 38.2s | 68.6% | 50.0% |
| edge-sweep__drip__roster-order | 10 | 6 | 60.0% | 0 | 29.7s | 59.7% | 40.0% |
| edge-sweep__drip__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 26.6s | 56.4% | 50.0% |
| edge-sweep__rapid__roster-order | 10 | 6 | 60.0% | 0 | 28.9s | 65.7% | 38.5% |
| edge-sweep__rapid__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 27.8s | 70.1% | 30.0% |
| edge-sweep__three-waves__roster-order | 10 | 5 | 50.0% | 0 | 28.6s | 60.9% | 44.5% |
| edge-sweep__three-waves__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 28.5s | 66.9% | 30.0% |
| edge-sweep__two-waves__roster-order | 10 | 4 | 40.0% | 0 | 30.5s | 57.6% | 58.9% |
| edge-sweep__two-waves__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 27.0s | 72.0% | 30.0% |
| inverted-wedge__burst__roster-order | 10 | 7 | 70.0% | 0 | 29.5s | 66.0% | 30.0% |
| inverted-wedge__burst__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 40.9s | 61.7% | 50.0% |
| inverted-wedge__drip__roster-order | 10 | 5 | 50.0% | 0 | 35.9s | 69.5% | 39.6% |
| inverted-wedge__drip__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 33.4s | 55.6% | 50.0% |
| inverted-wedge__rapid__roster-order | 10 | 4 | 40.0% | 0 | 28.7s | 55.4% | 59.5% |
| inverted-wedge__rapid__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 33.9s | 78.9% | 28.5% |
| inverted-wedge__three-waves__roster-order | 10 | 7 | 70.0% | 0 | 35.4s | 66.3% | 30.0% |
| inverted-wedge__three-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 28.8s | 59.7% | 49.8% |
| inverted-wedge__two-waves__roster-order | 10 | 4 | 40.0% | 0 | 29.2s | 53.1% | 58.6% |
| inverted-wedge__two-waves__tank-front-support-rear | 10 | 8 | 80.0% | 0 | 34.7s | 74.0% | 20.0% |
| left-flank__burst__roster-order | 10 | 6 | 60.0% | 0 | 33.2s | 63.8% | 36.5% |
| left-flank__burst__tank-front-support-rear | 10 | 8 | 80.0% | 0 | 32.6s | 69.1% | 20.0% |
| left-flank__drip__roster-order | 10 | 4 | 40.0% | 0 | 29.4s | 57.1% | 53.0% |
| left-flank__drip__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 29.1s | 63.7% | 40.0% |
| left-flank__rapid__roster-order | 10 | 6 | 60.0% | 0 | 34.4s | 58.3% | 40.5% |
| left-flank__rapid__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 29.8s | 64.2% | 40.0% |
| left-flank__three-waves__roster-order | 10 | 6 | 60.0% | 0 | 33.3s | 68.9% | 34.7% |
| left-flank__three-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 29.5s | 59.9% | 46.4% |
| left-flank__two-waves__roster-order | 10 | 6 | 60.0% | 0 | 28.0s | 68.3% | 38.3% |
| left-flank__two-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 30.9s | 64.7% | 50.0% |
| right-flank__burst__roster-order | 10 | 7 | 70.0% | 0 | 30.5s | 71.6% | 18.0% |
| right-flank__burst__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 27.9s | 57.1% | 49.7% |
| right-flank__drip__roster-order | 10 | 7 | 70.0% | 0 | 29.5s | 66.1% | 30.0% |
| right-flank__drip__tank-front-support-rear | 10 | 4 | 40.0% | 0 | 27.4s | 50.7% | 56.0% |
| right-flank__rapid__roster-order | 10 | 6 | 60.0% | 0 | 30.4s | 64.1% | 40.0% |
| right-flank__rapid__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 29.7s | 59.5% | 41.8% |
| right-flank__three-waves__roster-order | 10 | 5 | 50.0% | 0 | 27.7s | 56.8% | 50.0% |
| right-flank__three-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 31.2s | 60.5% | 50.0% |
| right-flank__two-waves__roster-order | 10 | 7 | 70.0% | 0 | 31.3s | 64.1% | 26.0% |
| right-flank__two-waves__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 33.2s | 65.1% | 30.0% |
| three-lane__burst__roster-order | 10 | 6 | 60.0% | 0 | 27.4s | 68.1% | 40.0% |
| three-lane__burst__tank-front-support-rear | 10 | 8 | 80.0% | 0 | 30.5s | 73.5% | 20.0% |
| three-lane__drip__roster-order | 10 | 4 | 40.0% | 0 | 27.1s | 56.1% | 60.0% |
| three-lane__drip__tank-front-support-rear | 10 | 9 | 90.0% | 0 | 35.0s | 83.2% | 10.0% |
| three-lane__rapid__roster-order | 10 | 7 | 70.0% | 0 | 28.6s | 72.5% | 30.0% |
| three-lane__rapid__tank-front-support-rear | 10 | 4 | 40.0% | 0 | 25.6s | 52.3% | 60.0% |
| three-lane__three-waves__roster-order | 10 | 6 | 60.0% | 0 | 28.4s | 64.5% | 40.0% |
| three-lane__three-waves__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 25.5s | 65.0% | 40.0% |
| three-lane__two-waves__roster-order | 10 | 8 | 80.0% | 0 | 32.2s | 83.9% | 20.0% |
| three-lane__two-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 25.8s | 60.2% | 50.0% |
| vanguard-wedge__burst__roster-order | 10 | 6 | 60.0% | 0 | 30.0s | 68.1% | 39.5% |
| vanguard-wedge__burst__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 35.4s | 63.5% | 30.0% |
| vanguard-wedge__drip__roster-order | 10 | 6 | 60.0% | 0 | 29.3s | 65.7% | 40.0% |
| vanguard-wedge__drip__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 29.3s | 63.4% | 50.0% |
| vanguard-wedge__rapid__roster-order | 10 | 6 | 60.0% | 0 | 31.4s | 59.6% | 40.0% |
| vanguard-wedge__rapid__tank-front-support-rear | 10 | 7 | 70.0% | 0 | 29.6s | 65.6% | 30.0% |
| vanguard-wedge__three-waves__roster-order | 10 | 4 | 40.0% | 0 | 24.8s | 52.3% | 60.0% |
| vanguard-wedge__three-waves__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 43.6s | 61.7% | 40.0% |
| vanguard-wedge__two-waves__roster-order | 10 | 3 | 30.0% | 0 | 30.0s | 53.0% | 62.9% |
| vanguard-wedge__two-waves__tank-front-support-rear | 10 | 9 | 90.0% | 0 | 33.5s | 82.1% | 10.0% |
| wide-line__burst__roster-order | 10 | 6 | 60.0% | 0 | 24.3s | 66.0% | 39.4% |
| wide-line__burst__tank-front-support-rear | 10 | 4 | 40.0% | 0 | 25.5s | 54.1% | 57.9% |
| wide-line__drip__roster-order | 10 | 6 | 60.0% | 0 | 30.0s | 62.8% | 40.0% |
| wide-line__drip__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 33.5s | 69.7% | 35.1% |
| wide-line__rapid__roster-order | 10 | 5 | 50.0% | 0 | 28.0s | 63.8% | 50.0% |
| wide-line__rapid__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 29.2s | 57.9% | 50.0% |
| wide-line__three-waves__roster-order | 10 | 4 | 40.0% | 0 | 25.4s | 53.6% | 60.0% |
| wide-line__three-waves__tank-front-support-rear | 10 | 6 | 60.0% | 0 | 28.9s | 70.1% | 37.4% |
| wide-line__two-waves__roster-order | 10 | 6 | 60.0% | 0 | 25.3s | 69.1% | 40.0% |
| wide-line__two-waves__tank-front-support-rear | 10 | 5 | 50.0% | 0 | 27.6s | 58.6% | 50.0% |

## Spawn Formations

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| center-column | 100 | 57 | 57.0% | 0 | 31.7s | 59.2% | 42.6% |
| diamond | 100 | 58 | 58.0% | 0 | 29.3s | 63.6% | 41.1% |
| dual-flank | 100 | 59 | 59.0% | 0 | 29.5s | 64.4% | 40.4% |
| edge-sweep | 100 | 58 | 58.0% | 0 | 29.5s | 64.6% | 41.2% |
| inverted-wedge | 100 | 57 | 57.0% | 0 | 33.1s | 64.0% | 41.6% |
| left-flank | 100 | 58 | 58.0% | 0 | 31.0s | 63.8% | 39.9% |
| right-flank | 100 | 58 | 58.0% | 0 | 29.9s | 61.6% | 39.2% |
| three-lane | 100 | 63 | 63.0% | 0 | 28.6s | 67.9% | 37.0% |
| vanguard-wedge | 100 | 59 | 59.0% | 0 | 31.7s | 63.5% | 40.2% |
| wide-line | 100 | 53 | 53.0% | 0 | 27.8s | 62.6% | 46.0% |

## Spawn Timings

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| burst | 200 | 121 | 60.5% | 0 | 30.2s | 64.1% | 38.5% |
| drip | 200 | 112 | 56.0% | 0 | 30.3s | 62.6% | 42.7% |
| rapid | 200 | 113 | 56.5% | 0 | 30.2s | 62.7% | 42.4% |
| three-waves | 200 | 110 | 55.0% | 0 | 30.4s | 61.7% | 43.8% |
| two-waves | 200 | 124 | 62.0% | 0 | 29.9s | 66.5% | 37.2% |

## Deployment Role Orders

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| roster-order | 500 | 281 | 56.2% | 0 | 29.3s | 62.9% | 42.3% |
| tank-front-support-rear | 500 | 299 | 59.8% | 0 | 31.1s | 64.1% | 39.6% |

## Tactical Ability Policies

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| none | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## NFT Rarity Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| common | 300 | 192 | 64.0% | 0 | 25.5s | 67.7% | 34.4% |

## NFT Troops by Rarity

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| demon_king\|common | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| fire_dragon\|common | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |

## Defender Ward Boosts

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| ward-0 | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## Attack Level Profiles

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| maxed | 1000 | 580 | 58.0% | 0 | 30.2s | 63.5% | 40.9% |

## Troop Presence

| Group | Battles | Wins | Win Rate | Invalid | Avg Duration | Avg Destruction | Avg TH HP Left |
|---|---:|---:|---:|---:|---:|---:|---:|
| archer | 150 | 74 | 49.3% | 0 | 38.7s | 57.3% | 50.4% |
| demon_king | 150 | 99 | 66.0% | 0 | 29.5s | 70.0% | 32.4% |
| fire_dragon | 150 | 93 | 62.0% | 0 | 21.5s | 65.5% | 36.4% |
| knight | 150 | 93 | 62.0% | 0 | 34.9s | 64.3% | 36.6% |
| mage | 150 | 68 | 45.3% | 0 | 26.4s | 55.7% | 53.1% |
| mechanical_dragon | 150 | 90 | 60.0% | 0 | 26.7s | 66.5% | 40.0% |
| mimic | 100 | 63 | 63.0% | 0 | 35.6s | 66.1% | 36.0% |

## Controlled Pure-Unit Performance

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer | 150 | 49.3% | 41.4%-57.3% | 57.3% | 50.4% | 24.7% |
| demon_king | 150 | 66.0% | 58.1%-73.1% | 70.0% | 32.4% | 55.3% |
| fire_dragon | 150 | 62.0% | 54.0%-69.4% | 65.5% | 36.4% | 51.7% |
| knight | 150 | 62.0% | 54.0%-69.4% | 64.3% | 36.6% | 41.3% |
| mage | 150 | 45.3% | 37.6%-53.3% | 55.7% | 53.1% | 24.5% |
| mechanical_dragon | 150 | 60.0% | 52.0%-67.5% | 66.5% | 40.0% | 46.8% |
| mimic | 100 | 63.0% | 53.2%-71.8% | 66.1% | 36.0% | 56.7% |

## Controlled Pure-Unit Performance by Town Hall

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|TH6 | 150 | 49.3% | 41.4%-57.3% | 57.3% | 50.4% | 24.7% |
| demon_king\|TH6 | 150 | 66.0% | 58.1%-73.1% | 70.0% | 32.4% | 55.3% |
| fire_dragon\|TH6 | 150 | 62.0% | 54.0%-69.4% | 65.5% | 36.4% | 51.7% |
| knight\|TH6 | 150 | 62.0% | 54.0%-69.4% | 64.3% | 36.6% | 41.3% |
| mage\|TH6 | 150 | 45.3% | 37.6%-53.3% | 55.7% | 53.1% | 24.5% |
| mechanical_dragon\|TH6 | 150 | 60.0% | 52.0%-67.5% | 66.5% | 40.0% | 46.8% |
| mimic\|TH6 | 100 | 63.0% | 53.2%-71.8% | 66.1% | 36.0% | 56.7% |

## Controlled Pure Units vs Base Archetypes

| Group | Battles | Win Rate | 95% CI | Avg Destruction | Avg TH HP Left | Troop Survival |
|---|---:|---:|---:|---:|---:|---:|
| archer\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 65.8% | 37.5% | 35.6% |
| archer\|asymmetric-right | 8 | 50.0% | 21.5%-78.5% | 60.0% | 50.0% | 28.3% |
| archer\|cannon-screen | 8 | 62.5% | 30.6%-86.3% | 60.4% | 37.5% | 37.2% |
| archer\|compact-core | 9 | 55.6% | 26.7%-81.1% | 61.6% | 44.4% | 30.9% |
| archer\|corner-keep | 8 | 50.0% | 21.5%-78.5% | 60.4% | 46.1% | 23.1% |
| archer\|crossfire | 8 | 62.5% | 30.6%-86.3% | 56.7% | 37.5% | 31.1% |
| archer\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 65.9% | 44.4% | 27.9% |
| archer\|diamond | 8 | 37.5% | 13.7%-69.4% | 58.3% | 62.4% | 15.0% |
| archer\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 56.0% | 50.0% | 22.5% |
| archer\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 55.0% | 38.0% | 19.2% |
| archer\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 53.3% | 50.0% | 20.8% |
| archer\|layered-rings | 9 | 33.3% | 12.1%-64.6% | 58.5% | 66.1% | 22.5% |
| archer\|rear-keep | 8 | 50.0% | 21.5%-78.5% | 53.2% | 50.0% | 26.4% |
| archer\|resource-shield | 9 | 44.4% | 18.9%-73.3% | 55.2% | 55.6% | 18.0% |
| archer\|southern-funnel | 9 | 22.2% | 6.3%-54.7% | 47.4% | 76.6% | 10.1% |
| archer\|split-core | 9 | 33.3% | 12.1%-64.6% | 53.4% | 66.7% | 21.0% |
| archer\|trap-lanes | 8 | 50.0% | 21.5%-78.5% | 50.8% | 50.0% | 28.6% |
| archer\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 60.1% | 37.5% | 29.2% |
| demon_king\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 65.8% | 33.9% | 50.0% |
| demon_king\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 69.6% | 36.8% | 48.6% |
| demon_king\|cannon-screen | 8 | 87.5% | 52.9%-97.8% | 81.7% | 12.5% | 65.3% |
| demon_king\|compact-core | 9 | 55.6% | 26.7%-81.1% | 69.2% | 44.4% | 49.4% |
| demon_king\|corner-keep | 8 | 62.5% | 30.6%-86.3% | 67.5% | 37.5% | 58.3% |
| demon_king\|crossfire | 8 | 75.0% | 40.9%-92.9% | 66.3% | 25.0% | 61.1% |
| demon_king\|defense-ring | 9 | 66.7% | 35.4%-87.9% | 73.3% | 33.3% | 58.0% |
| demon_king\|diamond | 8 | 50.0% | 21.5%-78.5% | 67.1% | 49.0% | 43.1% |
| demon_king\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 67.7% | 36.2% | 52.8% |
| demon_king\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 69.2% | 30.6% | 58.3% |
| demon_king\|kill-corridor | 8 | 75.0% | 40.9%-92.9% | 72.5% | 22.4% | 52.8% |
| demon_king\|layered-rings | 9 | 55.6% | 26.7%-81.1% | 63.3% | 44.2% | 45.7% |
| demon_king\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 74.2% | 35.5% | 58.3% |
| demon_king\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 61.9% | 35.1% | 53.1% |
| demon_king\|southern-funnel | 9 | 77.8% | 45.3%-93.7% | 72.2% | 22.2% | 58.0% |
| demon_king\|split-core | 9 | 66.7% | 35.4%-87.9% | 69.9% | 33.3% | 59.3% |
| demon_king\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 67.7% | 37.5% | 52.8% |
| demon_king\|wide-spread | 8 | 87.5% | 52.9%-97.8% | 82.7% | 11.8% | 70.8% |
| fire_dragon\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 68.3% | 37.5% | 53.1% |
| fire_dragon\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 65.8% | 37.5% | 43.8% |
| fire_dragon\|cannon-screen | 8 | 75.0% | 40.9%-92.9% | 69.2% | 19.8% | 62.5% |
| fire_dragon\|compact-core | 9 | 55.6% | 26.7%-81.1% | 58.1% | 44.4% | 47.2% |
| fire_dragon\|corner-keep | 8 | 50.0% | 21.5%-78.5% | 62.5% | 38.9% | 43.8% |
| fire_dragon\|crossfire | 8 | 62.5% | 30.6%-86.3% | 64.2% | 37.5% | 59.4% |
| fire_dragon\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 71.5% | 44.4% | 50.0% |
| fire_dragon\|diamond | 8 | 50.0% | 21.5%-78.5% | 57.1% | 50.0% | 37.5% |
| fire_dragon\|echelon-left | 8 | 87.5% | 52.9%-97.8% | 71.8% | 12.5% | 62.5% |
| fire_dragon\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 65.4% | 27.8% | 50.0% |
| fire_dragon\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 62.5% | 50.0% | 43.8% |
| fire_dragon\|layered-rings | 9 | 44.4% | 18.9%-73.3% | 61.9% | 54.9% | 41.7% |
| fire_dragon\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 65.7% | 37.5% | 62.5% |
| fire_dragon\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 57.0% | 44.4% | 44.4% |
| fire_dragon\|southern-funnel | 9 | 66.7% | 35.4%-87.9% | 68.5% | 29.9% | 52.8% |
| fire_dragon\|split-core | 9 | 66.7% | 35.4%-87.9% | 61.3% | 33.3% | 50.0% |
| fire_dragon\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 66.5% | 37.5% | 59.4% |
| fire_dragon\|wide-spread | 8 | 87.5% | 52.9%-97.8% | 82.3% | 12.5% | 68.8% |
| knight\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 67.5% | 37.5% | 48.6% |
| knight\|asymmetric-right | 8 | 50.0% | 21.5%-78.5% | 67.5% | 44.2% | 35.0% |
| knight\|cannon-screen | 8 | 100.0% | 67.6%-100.0% | 69.2% | 0.0% | 50.6% |
| knight\|compact-core | 9 | 55.6% | 26.7%-81.1% | 62.0% | 41.3% | 35.8% |
| knight\|corner-keep | 8 | 62.5% | 30.6%-86.3% | 55.0% | 32.2% | 42.5% |
| knight\|crossfire | 8 | 75.0% | 40.9%-92.9% | 64.6% | 25.0% | 47.8% |
| knight\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 67.4% | 37.9% | 37.8% |
| knight\|diamond | 8 | 50.0% | 21.5%-78.5% | 62.5% | 50.0% | 32.5% |
| knight\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 67.7% | 37.1% | 45.0% |
| knight\|echelon-right | 8 | 75.0% | 40.9%-92.9% | 64.6% | 25.0% | 42.2% |
| knight\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 60.4% | 48.4% | 35.0% |
| knight\|layered-rings | 9 | 55.6% | 26.7%-81.1% | 63.7% | 43.7% | 37.0% |
| knight\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 61.7% | 37.5% | 41.9% |
| knight\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 64.8% | 44.4% | 40.7% |
| knight\|southern-funnel | 9 | 55.6% | 26.7%-81.1% | 57.4% | 44.4% | 37.0% |
| knight\|split-core | 9 | 66.7% | 35.4%-87.9% | 60.2% | 33.3% | 42.0% |
| knight\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 64.9% | 37.5% | 46.1% |
| knight\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 77.8% | 35.3% | 48.3% |
| mage\|asymmetric-left | 8 | 37.5% | 13.7%-69.4% | 58.8% | 47.2% | 27.3% |
| mage\|asymmetric-right | 8 | 50.0% | 21.5%-78.5% | 55.4% | 50.0% | 25.0% |
| mage\|cannon-screen | 8 | 62.5% | 30.6%-86.3% | 62.1% | 37.5% | 40.9% |
| mage\|compact-core | 9 | 44.4% | 18.9%-73.3% | 60.6% | 55.6% | 25.3% |
| mage\|corner-keep | 8 | 37.5% | 13.7%-69.4% | 56.7% | 54.8% | 25.0% |
| mage\|crossfire | 8 | 50.0% | 21.5%-78.5% | 53.3% | 50.0% | 27.3% |
| mage\|defense-ring | 9 | 44.4% | 18.9%-73.3% | 57.4% | 55.6% | 19.2% |
| mage\|diamond | 8 | 37.5% | 13.7%-69.4% | 53.3% | 62.0% | 15.9% |
| mage\|echelon-left | 8 | 50.0% | 21.5%-78.5% | 56.0% | 50.0% | 25.0% |
| mage\|echelon-right | 8 | 50.0% | 21.5%-78.5% | 49.2% | 50.0% | 14.8% |
| mage\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 53.3% | 50.0% | 18.2% |
| mage\|layered-rings | 9 | 44.4% | 18.9%-73.3% | 54.4% | 55.6% | 28.3% |
| mage\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 66.1% | 37.5% | 40.9% |
| mage\|resource-shield | 9 | 44.4% | 18.9%-73.3% | 50.0% | 55.6% | 16.2% |
| mage\|southern-funnel | 9 | 33.3% | 12.1%-64.6% | 51.1% | 66.2% | 14.1% |
| mage\|split-core | 9 | 33.3% | 12.1%-64.6% | 54.8% | 63.7% | 21.2% |
| mage\|trap-lanes | 8 | 37.5% | 13.7%-69.4% | 47.2% | 62.5% | 25.0% |
| mage\|wide-spread | 8 | 50.0% | 21.5%-78.5% | 62.9% | 48.9% | 35.2% |
| mechanical_dragon\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 68.3% | 37.5% | 46.6% |
| mechanical_dragon\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 69.6% | 37.5% | 46.6% |
| mechanical_dragon\|cannon-screen | 8 | 75.0% | 40.9%-92.9% | 76.7% | 25.0% | 65.9% |
| mechanical_dragon\|compact-core | 9 | 55.6% | 26.7%-81.1% | 66.7% | 44.4% | 43.4% |
| mechanical_dragon\|corner-keep | 8 | 62.5% | 30.6%-86.3% | 67.9% | 37.5% | 47.7% |
| mechanical_dragon\|crossfire | 8 | 62.5% | 30.6%-86.3% | 65.0% | 37.5% | 52.3% |
| mechanical_dragon\|defense-ring | 9 | 55.6% | 26.7%-81.1% | 71.9% | 44.2% | 46.5% |
| mechanical_dragon\|diamond | 8 | 50.0% | 21.5%-78.5% | 62.1% | 50.0% | 35.2% |
| mechanical_dragon\|echelon-left | 8 | 62.5% | 30.6%-86.3% | 68.1% | 37.5% | 51.1% |
| mechanical_dragon\|echelon-right | 8 | 62.5% | 30.6%-86.3% | 63.7% | 37.5% | 38.6% |
| mechanical_dragon\|kill-corridor | 8 | 50.0% | 21.5%-78.5% | 62.1% | 50.0% | 34.1% |
| mechanical_dragon\|layered-rings | 9 | 55.6% | 26.7%-81.1% | 64.8% | 44.4% | 39.4% |
| mechanical_dragon\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 66.5% | 37.5% | 53.4% |
| mechanical_dragon\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 65.2% | 44.4% | 48.5% |
| mechanical_dragon\|southern-funnel | 9 | 55.6% | 26.7%-81.1% | 60.4% | 44.4% | 47.5% |
| mechanical_dragon\|split-core | 9 | 66.7% | 35.4%-87.9% | 63.8% | 33.3% | 45.5% |
| mechanical_dragon\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 66.1% | 37.5% | 46.6% |
| mechanical_dragon\|wide-spread | 8 | 62.5% | 30.6%-86.3% | 69.4% | 37.3% | 55.7% |
| mimic\|asymmetric-left | 8 | 62.5% | 30.6%-86.3% | 62.5% | 37.5% | 55.4% |
| mimic\|asymmetric-right | 8 | 62.5% | 30.6%-86.3% | 65.8% | 37.5% | 55.4% |
| mimic\|cannon-screen | 8 | 87.5% | 52.9%-97.8% | 73.8% | 12.5% | 66.1% |
| mimic\|compact-core | 6 | 50.0% | 18.8%-81.2% | 56.5% | 50.0% | 50.0% |
| mimic\|kill-corridor | 8 | 62.5% | 30.6%-86.3% | 65.4% | 37.5% | 53.6% |
| mimic\|layered-rings | 9 | 55.6% | 26.7%-81.1% | 64.1% | 44.4% | 50.8% |
| mimic\|rear-keep | 8 | 62.5% | 30.6%-86.3% | 68.5% | 36.7% | 60.7% |
| mimic\|resource-shield | 9 | 55.6% | 26.7%-81.1% | 67.0% | 40.0% | 52.4% |
| mimic\|southern-funnel | 9 | 55.6% | 26.7%-81.1% | 63.3% | 40.0% | 54.0% |
| mimic\|split-core | 9 | 66.7% | 35.4%-87.9% | 65.2% | 33.3% | 57.1% |
| mimic\|trap-lanes | 8 | 62.5% | 30.6%-86.3% | 64.5% | 37.5% | 60.7% |
| mimic\|wide-spread | 8 | 75.0% | 40.9%-92.9% | 77.8% | 23.1% | 66.1% |

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

- **CRITICAL / coverage:** Missing content coverage. Buildings: none; troops: pea_shooter.
- **CRITICAL / base-counter-near-universal-army:** core-mimic-filled is too universal: 76.0% discovery base coverage and 73.0% unseen-context wins.
- **WARNING / troop-dps-outlier:** mage direct DPS/slot is 3.74x median.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-181 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-253 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-057 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-129 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-corner-keep-237 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-101 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-crossfire-281 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-039 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-147 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-defense-ring-219 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-023 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-095 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-203 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-diamond-275 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-left-247 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-069 has 0 attacker wins across 6 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-echelon-right-249 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-035 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-kill-corridor-215 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-005 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-113 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-185 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-layered-rings-293 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-061 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-169 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-rear-keep-241 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-011 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-083 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-191 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-resource-shield-263 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-045 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-southern-funnel-225 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-079 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-151 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-split-core-259 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-091 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-163 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-trap-lanes-271 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-015 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-123 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-left-195 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-017 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-125 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-asymmetric-right-197 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-001 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / unbeaten-non-adaptive-base:** th6-compact-core-073 has 0 attacker wins across 7 controlled/policy-exploration samples.
- **WARNING / base-counter-probe-no-win:** 29/300 layouts have no observed win among the 15 selected compositions and their probe contexts; the separate adaptive breakability gate remains authoritative for counter existence.
- **WARNING / base-counter-discovery-no-win:** 55/300 layouts have no win in the paired discovery matrix before any locked holdout.
- **WARNING / base-counter-holdout-failure:** 92/300 layouts had neither locked top-two counter win on the unseen holdout deployment.
- **WARNING / base-counter-breadth:** Only 71.3% of layouts have at least two distinct winning compositions; target is 95%.
- **WARNING / base-counter-strong-breadth:** 67.3% of layouts have three winning compositions and 71.3% have counters from two recipe families; both targets are 80%.
- **WARNING / base-counter-excessively-soft:** 48.3% of layouts lose to at least 12/15 selected compositions in both paired discovery contexts; ceiling is 10%. Review the level-profile strata before combat tuning.
- **WARNING / base-counter-meta-diversity:** Counter diversity misses the authored target: top-1 18.9%, top-3 39.4%, inverse-HHI effective families 11.17.
- **WARNING / base-counter-scouting-value:** Only 5.7% of layouts force the universal army to lose while another wins; mean base-specific regret is 0.05.
- **WARNING / base-counter-town-hall-diversity:** TH6 top-1/top-3 near-best concentration is 21.0%/42.3%.
- **INFO / fragile-base:** th6-compact-core-109 has 100.0% attacker wins across 7 samples.
- **INFO / fragile-base:** th6-compact-core-145 has 100.0% attacker wins across 7 samples.
- **INFO / unbeaten-base:** th6-compact-core-181 has 0.0% attacker wins across 7 samples.
- **INFO / unbeaten-base:** th6-compact-core-253 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-compact-core-289 has 100.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-corner-keep-021 has 100.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-corner-keep-057 has 0.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-corner-keep-129 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-corner-keep-165 has 100.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-corner-keep-237 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-crossfire-029 has 100.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-crossfire-065 has 100.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-crossfire-101 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-crossfire-209 has 100.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-crossfire-245 has 100.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-crossfire-281 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-defense-ring-003 has 100.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-defense-ring-039 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-defense-ring-075 has 100.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-defense-ring-147 has 0.0% attacker wins across 6 samples.
- **INFO / unbeaten-base:** th6-defense-ring-219 has 0.0% attacker wins across 6 samples.
- **INFO / fragile-base:** th6-defense-ring-255 has 100.0% attacker wins across 6 samples.
- 86 additional findings are available in the JSON report.

## Recommended Workflow

1. Run `npm run pvp:balance -- --catalog-only --bases 144` after adding content.
2. Run `npm run pvp:balance -- --bases 144 --matches 300 --seed 42` for normal iteration.
3. Re-run the same seed before and after tuning and compare the JSON buckets.
4. Use `--exhaustive --max-scenarios 50000` only for milestone validation.
5. Treat sampled outliers as investigation targets, then confirm them in a real Godot playtest.
