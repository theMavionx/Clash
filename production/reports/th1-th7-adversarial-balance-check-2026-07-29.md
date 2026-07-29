# TH1-TH7 Adversarial Balance Check

**Date:** 2026-07-29
**Status:** HEALTHY TARGET CURVE, WITH META AND TOPOLOGY OUTLIERS
**Seed:** `290729`

## Sources Analyzed

- `server/combat_defs.js`
- `server/combat_session.js`
- `server/db.js`
- `scripts/base_troop.gd`
- `scripts/building_system.gd`
- `tools/pvp-balance/run.js`
- `tools/codex/local-test-balance.ps1`
- `production/reports/th1-th7-maxed-baseline-balance-lab-2026-07-29.json`
- `production/reports/th1-th7-adversarial-maxed-balance-lab-2026-07-29.json`
- `production/reports/server-godot-combat-parity-fps60-50-2026-07-29.json`

## Coverage and Validation

| Item | Result |
| --- | ---: |
| Initial organized bases | 300 |
| Initial attack policies | 500 |
| Baseline battles | 3,500 |
| Adversarial rounds | 3 × 500 |
| Total maxed-offense battles | 5,000 |
| Evolved bases / policies | 405 / 605 |
| Eligible TH1-TH7 troop coverage | 9 / 9 |
| Building coverage | 13 / 13 |
| Invalid battles | 0 |
| Unique initial layouts | 300 / 300 |
| Unique evolved layouts | 405 / 405 |
| Buildings behind Town Hall | 0 |
| Defenses not fully in front of Town Hall | 0 |

The 500-policy population covers six spawn plans, twelve ability/tactical
plans, all eligible unit compositions, maxed same-TH troop levels, NFT rarity
variants, and Ward 0-3 defenders. TH8-TH10 troops are intentionally excluded
from a TH1-TH7 same-tier run.

## Final TH1-TH7 Win Rate

Target is 60-70% during TH1-TH4 onboarding and 45-55% from TH5 onward.

| Tier | Battles | Attacker wins | Win rate | 95% Wilson interval | Target | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| TH1 | 504 | 352 | 69.8% | 65.7-73.7% | 60-70% | Pass |
| TH2 | 504 | 311 | 61.7% | 57.4-65.8% | 60-70% | Pass |
| TH3 | 504 | 313 | 62.1% | 57.8-66.2% | 60-70% | Pass |
| TH4 | 497 | 299 | 60.2% | 55.8-64.4% | 60-70% | Pass |
| TH5 | 497 | 243 | 48.9% | 44.5-53.3% | 45-55% | Pass |
| TH6 | 497 | 237 | 47.7% | 43.3-52.1% | 45-55% | Pass |
| TH7 | 497 | 239 | 48.1% | 43.7-52.5% | 45-55% | Pass |

Overall baseline: **1,994 / 3,500 = 57.0%**, with zero invalid replays.

The final shared primary-troop power multipliers are:
`0.82, 0.82, 1.20, 1.85, 1.70, 1.65, 2.00`.
Only levels 4-6 changed in this iteration; Cannon and Archer Tower parity was
not weakened.

## Strongest Broad Attack Signals

| Group | Battles | Win rate |
| --- | ---: | ---: |
| Pure Demon King | 203 | 76.8% |
| Balanced | 196 | 69.4% |
| random-2 | 105 | 67.6% |
| hero-necro-dragon-mages | 175 | 66.3% |
| cannon-focus tactic | 735 | 64.6% |
| rally-core tactic | 714 | 58.8% |
| no ability tactic | 616 | 57.8% |

Best exact policy candidates per tier are exploration leads, not final meta
claims, because every exact policy received seven baseline fights:

| Tier | Policy | Composition | Spawn / tactic | Result |
| --- | --- | --- | --- | ---: |
| TH1 | `policy-0029` | 3 Archers | left-flank / rally-core | 7/7 |
| TH2 | `policy-0387` | 2 Demon Kings, 2 Knights | dual-flank / cannon-focus | 7/7 |
| TH3 | `policy-0010` | Demon King, Fire Dragon, 2 Mages, 4 Knights | left-flank / cannon-focus | 7/7 |
| TH4 | `policy-0004` | 7 Demon Kings | staggered-waves / none | 7/7 |
| TH5 | `policy-0103` | mixed random-2 | dual-flank / cannon-rally | 7/7 |
| TH6 | `policy-0076` | 45 Knights | right-flank / cannon-focus | 7/7 |
| TH7 | `policy-0105` | 4 Fire Dragons | wide-line / rage-entry | 6/7 |

## Strongest Defense Candidates

Each listed layout allowed zero attacker wins in its 12-13 baseline samples:

| Tier | Base | Archetype | Upgrade profile |
| --- | --- | --- | --- |
| TH1 | `th1-asymmetric-right-183` | asymmetric-right | mid |
| TH2 | `th2-asymmetric-right-184` | asymmetric-right | mid |
| TH3 | `th3-asymmetric-left-052` | asymmetric-left | rushed-defense |
| TH4 | `th4-asymmetric-left-179` | asymmetric-left | maxed |
| TH5 | `th5-asymmetric-left-054` | asymmetric-left | rushed-defense |
| TH6 | `th6-asymmetric-left-055` | asymmetric-left | rushed-defense |
| TH7 | `th7-asymmetric-left-056` | asymmetric-left | rushed-defense |

## Adversarial Shield-vs-Sword Iteration

Every round selected five elite attacks and five elite bases per TH, generated
35 attack mutations and 35 base mutations, then ran 500 hard-frontier fights.

| Round | Battles | Attacker win rate |
| ---: | ---: | ---: |
| 1 | 500 | 14.2% |
| 2 | 500 | 8.4% |
| 3 | 500 | 15.0% |

The combined baseline + hard-frontier rate is 43.6%. This number is not the
normal matchmaking target: the adversarial rounds deliberately pair selected
elite defenses with elite and mutated attacks. It demonstrates that the search
continues to find highly defensive layouts rather than converging to a trivial
always-win offense.

## Outliers and Degenerate Strategies

| Outlier | Result | Assessment |
| --- | ---: | --- |
| Pure Necromancer | 23.8% / 21 | Weak pure composition |
| Pure Mage | 25.6% / 168 | Weak without frontline |
| Pure Demon King | 76.8% / 203 | Strong meta candidate |
| Medkit-entry tactic | 39.7% / 63 | Poor timing/targeting policy |
| Asymmetric-left bases | 5.5% attacker wins / 165 | Extremely strong topology |
| Cannon-screen bases | 94.3% attacker wins / 158 | Extremely weak topology |
| Maxed bases | 18.7% attacker wins / 726 | Expected hard endpoint |
| Rushed-economy bases | 95.1% attacker wins / 628 | Expected fragile endpoint |

The 88.8 percentage-point archetype spread is the primary remaining balance
risk. Server ↔ Godot outcome agreement is 94%, but strict parity is 44%, so
future global stat tuning must not be driven by an extreme topology alone.

## Recommendations

1. Confirm mirrored asymmetric-left/right and cannon-screen samples in Godot
before changing global unit or defense stats again.
2. Keep the final TH curve; every requested tier is inside its target band.
3. Add army-builder guidance against pure Mage/Necromancer traps and monitor
Pure Demon King usage rather than immediately flattening role identity.
4. Add per-policy replication above seven fights for any candidate promoted to
a player-facing “best army” recommendation.
5. Preserve separate baseline and adversarial metrics; blending them obscures
normal matchmaking health.

## Final Working-Tree Note

After the reports and replay matrices completed, an unrelated in-progress
change to `server/db.js` moved the ranked-raid schema path into a state where a
fresh temporary database prepares `battle_sessions.tournament_id` before that
column exists. This currently blocks the two clean-DB Node progression tests
and a new balance-lab invocation. The failure is outside the balance/FPS files
and was not folded into this change set. The corresponding Godot level-cap and
unlock-progression tests pass, and all results above were generated before
that external working-tree change appeared.
