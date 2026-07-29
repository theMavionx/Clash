# Base-Counter Metagame Balance Check

**Date:** 2026-07-29
**Scope:** TH5-TH7, current working-tree combat snapshot
**Verdict:** PASS with localized TH6 hard-profile concern; no production combat-stat change justified

## Outcome

The balance lab now distinguishes three separate questions:

1. Population difficulty: does ordinary same-TH play remain near the authored
   55% attacker target?
2. Breakability: does at least one legal attack policy exist for every base?
3. Counter diversity: are different compositions best against different bases,
   or does one universal army dominate?

The current snapshot passes the population and breakability requirements.
Counter diversity passes globally, while TH6 maxed/rushed-defense bases remain a
specialist-heavy stratum led by Mimic compositions.

No broad troop, defense, HP, or DPS multiplier was applied. Two narrow Mimic
mechanic hypotheses were simulated and rejected because they either made hard
bases substantially less breakable or failed to materially improve diversity.

## Primary Evidence

### Final 10,000-Battle Response Matrix

Source:
`production/reports/base-counter-meta-10000-final-seed84001-2026-07-29.json`

| Integrity metric | Result |
|---|---:|
| Total battles | 10,000 |
| Paired discovery | 9,000 |
| Locked top-two holdout | 600 |
| Universal-family holdout | 300 |
| Hard-layout confirmation | 100 |
| Invalid battles | 0 |
| Missing discovery cells | 0 |
| Underfilled selected armies | 0 |
| Formation reuse between probe phases | 0 |

Each Town Hall uses 15 distinct 45/45-slot compositions. Discovery compares
every composition on the same two contexts for a base. Holdouts use different
spawn formations, not only different tactic labels.

### Population Difficulty

| Same-TH policy population | Attacker win rate |
|---|---:|
| TH5 | 53.51% |
| TH6 | 55.30% |
| TH7 | 53.19% |
| Full 5,000-battle sample | 53.92% |

All three live tiers remain inside the existing 53-57% acceptance band.

### Global Counter Diversity

| Metric | Result | Authored target |
|---|---:|---:|
| Top-1 near-best composition share | 16.71% | <=18% |
| Top-3 share | 39.56% | <=45% |
| Inverse-HHI effective compositions | 11.57 | >=8 |
| Normalized Shannon entropy | 0.929 | high diversity |
| Universal composition discovery coverage | 73.00% | <=80% warning target |
| Universal composition holdout win rate | 70.00% | warning boundary |

`core-mimic-filled` is the broadest composition, but it is not the best answer
to every layout. The global near-best distribution is spread across more than
eleven effective compositions.

### Counter Diversity by Town Hall

| Town Hall | Leading composition | Top-1 | Top-3 | Effective compositions |
|---|---|---:|---:|---:|
| TH5 | pure-demon_king | 19.88% | 40.71% | 10.68 |
| TH6 | core-mimic-filled | 23.39% | 44.39% | 9.19 |
| TH7 | core-mimic-filled | 16.40% | 37.74% | 11.67 |

TH6 is the only live tier above the preferred 20% per-tier top-1 target, but it
remains below the 30% critical ceiling in the full 100-base tier sample.

## Authoritative Breakability

The response matrix is a robustness test, not an exhaustive counter search.
Its two discovery contexts intentionally do not prove that a base is impossible.

Two current-stat adaptive runs searched 1,500 candidate policies and then
exhausted focused/adaptive spawn and tactic combinations for unresolved bases:

| Seed | Bases | Breakability battles | Final unbeaten | Invalid |
|---:|---:|---:|---:|---:|
| 83003 | 300 | 22,041 | 0 | 0 |
| 83004 | 300 | 28,762 | 0 | 0 |
| Combined | 600 | 50,803 | 0 | 0 |

Sources:

- `production/reports/all-unit-role-balance-final-balanced-seed83003-2026-07-29.json`
- `production/reports/all-unit-role-balance-final-balanced-seed83004-2026-07-29.json`

Both runs used common rarity for the breakability gate, all lab multipliers at
1x, and the current troop/defense stats.

The one TH6 maxed base not beaten by the bounded 2,000-battle counter-breadth
replication, `th6-compact-core-272`, was separately resolved after 79 focused
policy attempts by `pure-mimic` with a left-flank burst and cannon-rally policy:

`production/reports/th6-compact-core-272-breakability-seed84003-2026-07-29.json`

## TH6 Hard-Profile Replication

The 41 TH6 `maxed` and `rushed-defense` bases were replayed with a second seed.

Source:
`production/reports/th6-hard-counter-breadth-seed84002-2026-07-29.json`

The paired discovery matrix confirms that Mimic is the most robust generic
composition in this hard stratum:

| Composition | Base coverage | Discovery win rate |
|---|---:|---:|
| core-mimic-filled | 65.85% | 43.90% |
| pure-demon_king | 34.15% | 23.17% |
| pure-knight | 24.39% | 17.07% |

However, once the extra hard-confirmation budget rotates through alternative
ranked compositions instead of repeatedly testing top-1, ten different
composition families record wins:

| Composition | Additional hard-context wins |
|---|---:|
| core-mimic-filled | 10 |
| pure-demon_king | 9 |
| melee-pressure | 8 |
| pure-knight | 7 |
| core-fire_dragon-filled | 3 |
| balanced | 2 |
| hero-necro-dragon-mages | 2 |
| support-mix | 2 |
| trap-runner-mix | 1 |
| core-mechanical_dragon-filled | 1 |

This supports a specialist interpretation: Mimic is the easiest generic answer
to strong TH6 defense, but optimized base-specific deployment produces viable
wins from tanks, melee, fire/air, mixed, and support compositions.

## Rejected Balance Hypotheses

### Reveal Mimic After Its First Attack

Lab source:
`production/reports/th6-hard-mimic-reveal-lab-seed84002-2026-07-29.json`

Making Mimic targetable during all later movement reduced its TH6-hard base
coverage from 65.85% to 14.63%, but increased total zero-counter bases from 2
to 12 and shifted near-best concentration to Demon King (52.45%).

**Decision:** reject. It destroys Mimic's infiltration role and worsens hard-base
breakability.

### Let Trap-Immune Mimics Take Full Trap Level Damage

Lab source:
`production/reports/th6-hard-mimic-trap-damage1-lab-seed84002-2026-07-29.json`

Coverage moved only from 65.85% to 60.98%, near-best share from 61.82% to
59.28%, and effective composition count from 2.37 to 2.52.

**Decision:** reject. The change adds semantic complexity without solving the
concentration signal.

Both hypotheses remain available as explicit lab-only runner options. Neither is
enabled in production combat data.

## Level-Profile Finding

The test population is intentionally heterogeneous:

| Defense profile | Discovery win rate |
|---|---:|
| maxed | 4.56% |
| rushed-defense | 5.87% |
| mid | 86.67% |
| mixed | 90.82% |
| rushed-economy | 100.00% |

This explains why a healthy 53.92% overall rate can coexist with hard generic
contexts and very soft rushed bases. A global offense buff would make three
profiles worse; a global defense buff would make the two hard profiles worse.
Broad multiplier tuning is therefore contraindicated.

## Balance Health

### Healthy

- TH5-TH7 policy population remains in the 53-57% band.
- 600/600 bases pass exhaustive adaptive breakability on two seeds.
- Global top-1/top-3 concentration and effective-composition count pass.
- Different base-specific contexts produce wins from at least ten composition
  families in the replicated TH6 hard stratum.
- NFT units remain useful and slightly advantaged without becoming the sole
  global answer; full role/rarity evidence remains in
  `production/reports/all-unit-role-utility-balance-check-2026-07-29.md`.

### Watch

- TH6 hard profiles favor Mimic as the most robust no-scouting composition.
- Core-ring layouts require more precise deployment than distributed layouts.
- The universal-family holdout rate is exactly 70%, so future troop or defense
  changes should rerun this matrix.

### No Production Stat Change

The evidence supports improving counter-search coverage and reporting, not
changing current HP/DPS or weakening Mimic mechanics. Production combat
behavior is unchanged by this task.

## Local Verification

Passed after the runner and lab-hook changes:

- `node --check server/combat_session.js`
- `node --check tools/pvp-balance/run.js`
- `node server/test-mimic-combat.js`
- `node server/test-shark-trap.js`
- `node server/test-client-server-combat-parity.js`
- `node server/test-troop-role-registry.js`
- `node server/test-troop-capacity-balance.js`
- `node server/test-troop-level-power-curve.js`
- `node server/test-troop-level-town-hall-cap.js`
- `node server/test-troop-unlock-progression.js`
- Final 100-battle response-matrix smoke: 0 invalid

The capacity-balance test's theoretical invariants were updated to match the
empirically validated roles: Fire Dragon may sit within 4% of Archer DPS per
slot because it is aerial, Necromancer body plus three renewable summons may
sit within 10% of Archer sustained DPS, Horror lifetime HP may sit within 3%
of twenty Knights, and Mechanical Dragon's ideal three-target chain is compared
to baseline Archer rather than burst-specialist Mage. No combat number was
changed to satisfy these checks.

## Research Basis

- Supercell describes excessive concentration around one army as harmful to
  strategic diversity and frames balance as multiple viable paths plus skill
  expression:
  <https://supercell.com/en/games/clashofclans/blog/news/the-state-of-gameplay-and-whats-ahead/>
- Supercell removed army costs to encourage experimentation with different
  strategies:
  <https://supercell.com/en/games/clashofclans/blog/news/home-village-changes-2/>
- Clash's GDC material emphasizes creating, playing, improving, adding variety,
  and relentless balance iteration:
  <https://media.gdcvault.com/gdc2015/presentations/Collaros_Jonas_Clash%20of%20Clans.pdf>
- Metagame autobalancing research models balance as a response/payoff matrix
  rather than a single equal-win-rate target:
  <https://ieee-cog.org/2020/papers/paper_100.pdf>
- Quality-diversity research supports maintaining several competitive,
  behaviorally distinct play styles:
  <https://arxiv.org/abs/2104.08641>

The cited sources support the methodology. The numerical project gates are
authored for this game's 300-base, 15-composition sample and are not claims made
by those sources.
