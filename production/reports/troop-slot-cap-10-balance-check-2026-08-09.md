# Balance Check: Ten-slot troop cap

**Date:** 2026-08-09
**Scope:** Wind Mage, Necromancer, Horror, Ice Golem, Fire Dragon
**Health summary:** HEALTHY WITH EXISTING ROSTER OBSERVATIONS

## Data sources analyzed

- `server/combat_defs.js` — authoritative troop, summon and Main Ship stats.
- `server/combat_session.js` — production deterministic replay simulator.
- `scripts/wind_mage.gd`, `scripts/necromancer.gd`,
  `scripts/necromancer_skeleton.gd`, `scripts/horror_evolution.gd` — Godot
  combat mirrors.
- `server/db.js`, `scripts/building_system.gd` and React reinforcement/result
  components — slots, loading cost and persistence migration.
- `.codex-artifacts/th10-town-hall-cannon-baseline.json` — fixed 120-base TH10
  comparison catalog.
- Pre-change reference reports
  `.codex-artifacts/th10-production-balanced-final-seed8102026.json` and
  `seed8102027.json`.

## Final transformation

| Troop package | Old slots | New slots | Final HP/damage scale vs old | Reason |
|---|---:|---:|---:|---|
| Wind Mage root | 18 | 10 | 0.50x | four new roots replace two old roots in a 45-slot heavy roster |
| Windlings | summon | summon | 10/18 | bounded contribution was not the pure-army outlier |
| Necromancer root + skeletons | 18 | 10 | 0.50x | preserve the complete four-root summon package |
| Horror root + both child stages | 22 | 10 | 0.50x | restore two-old-root vs four-new-root family power |
| Ice Golem | 11 | 10 | 10/11 | initial proportional conversion already landed near target |
| Fire Dragon | 11 | 10 | 10/11 | initial proportional conversion already landed near target |

Attack cadence, range, movement, targeting, summon count/lifetime, Horror split
count, Ice Golem freeze and NFT rarity behavior did not change. The TH10 Main
Ship multiplier remains `1.394136`; the final solution does not globally nerf
unrelated troops.

## Win-rate regression and correction

The canonical gate uses policy-exploration battles, not the synthetic overall
rate that mixes in the controlled pure-unit matrix. Each seed uses the same 120
fixed TH10 bases, 240 attack policies, 1,560 policy battles and 1,440 controlled
pure-unit battles.

| State | Seed 8102026 | Seed 8102027 | Combined policy WR | Invalid |
|---|---:|---:|---:|---:|
| Pre-cap reference | 53.65% | 56.54% | 55.10% | 0 |
| Initial proportional slot cap | 56.03% | 57.18% | 56.60% | 0 |
| Final structural correction | 55.77% | 56.22% | **55.99%** | **0** |

Final combined result: 1,747 attacker wins in 3,120 valid policy battles. This
passes the authored `55% +/- 2%` gate without an all-troop or defense adjustment.

## Outliers detected

| Item | Pre-cap | Initial cap | Final | Assessment |
|---|---:|---:|---:|---|
| Pure Wind Mage | 61.67% | 70.42% | 55.42% | corrected |
| Pure Necromancer | 47.92% | 67.92% | 57.92% | corrected |
| Pure Horror | 50.00% | 37.92% | 48.75% | corrected |
| Pure Fire Dragon | 65.00% | 52.92% | 54.17% | healthy after requested nerf |
| Pure Ice Golem | 65.00% | 57.50% | 58.33% | healthy tank result |

The final pure-unit matrix is 58.58% overall. Existing non-slot-cap observations
remain: Demon King, Mechanical Dragon and Mimic pure armies are above the roster
median, and static Mage direct DPS per slot remains roughly 3x the median. They
did not cause the slot-cap regression and were not changed in this focused pass.

## Degenerate strategies found

- No new degenerate heavy-root strategy remains after the structural correction.
- No invalid replay, over-cap army, deleted migrated heavy root or summon parity
  mismatch was observed.
- Some generated layouts remain either fragile or unbeaten for one seed. They
  are layout-distribution findings rather than a shared troop-stat failure and
  should be handled in a separate base-layout diversity pass.

## Progression and capacity analysis

- Canonical maximum occupied slots per root: `10`; entries above ten: `0`.
- Four ten-slot heavy roots plus five one-slot troops form a legal 45-slot army.
- Slot migration v4 contracts the legacy Wind/Necro/Horror/Ice example from 69
  old slots to 40 new slots without deleting or refunding a root.
- Non-NFT load cost remains 100 gold per occupied slot; every changed regular
  heavy troop costs 1,000 gold. Fire Dragon remains NFT-backed and free to load.
- Level-7 Horror lifetime HP is 3,695.8 per slot, only 2.3% above Knight, while
  its highest phase DPS is 52.4% of Knight DPS per slot.
- Level-7 Necromancer body plus three skeletons is 555.1 DPS per slot, below
  Archer's 701 DPS per slot.

## Verification

- Client/server combat parity: PASS for all thirteen registered troop forms.
- Wind Mage, Necromancer and Horror focused server combat tests: PASS.
- Capacity invariants and role bounds: PASS.
- Player-ship v4 migration and idempotency: PASS.
- Main Ship tactical abilities: PASS.
- Godot troop-level power-curve script: PASS.
- React production build: PASS from the slot-cap implementation pass.
- `git diff --check`: PASS.

## Recommendations

| Priority | Issue | Suggested action | Expected impact |
|---|---|---|---|
| P1 | Release validation | Keep the final structural values and monitor real TH10 mixed-army WR | preserve ~55% target |
| P2 | Existing pure Demon/Mechanical/Mimic strength | Analyze production pick/survival cohorts before changing stats | avoid artificial pure-matrix overfitting |
| P2 | Fragile/unbeaten generated layouts | Run a separate fixed-layout diversity and counter-policy pass | improve opponent variety without global troop buffs |

## Evidence

- `%TEMP%/slotcap-th10-structural-seed8102026.md` and `.json`
- `%TEMP%/slotcap-th10-structural-seed8102027.md` and `.json`
- `design/balance/troop-capacity-rebalance-2026-07-25.md`

No production data was mutated and these changes were not committed, pushed or
deployed as part of this request.
