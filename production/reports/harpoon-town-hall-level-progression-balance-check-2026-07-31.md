# Harpoon Town Hall Level Progression Balance Check

**Date:** 2026-07-31

**Scope:** Harpoon L1-L8 progression, TH6=L6 / TH7=L7 / TH8=L8 caps
**Verdict:** CONCERNS overall; HEALTHY for the playable TH6-TH7 range

## Data Sources Analyzed

- `scripts/tower_harpoon.gd`, `scripts/building_system.gd`
- `server/combat_defs.js`, `server/combat_session.js`, `server/db.js`
- `server/matchmaking_defs.js`, `web/src/components/BuildingInfoPanel.jsx`
- `design/gdd/harpoon-defense.md`
- `design/balance/building-cost-progression-2026-07-29.md`
- Before-change deterministic holdout:
  `C:/Users/Admin/AppData/Local/Temp/clash-harpoon-l8-baseline-20260731/full-game-balance-2026-07-31T19-40-45-010Z.json`
- After-change deterministic holdout:
  `production/reports/harpoon-level-progression-holdout-2026-07-31.json`
- Focused server progression, cost, parity, bot-pool, and combat tests plus Godot
  progression, client combat, animation, and performance probes.

## Health Summary: CONCERNS

The currently playable TH6-TH7 progression is healthy. L6 and L7 preserve the
previously validated combat endpoints exactly, while L1-L5 provide a monotonic
upgrade path and L8 adds only a small per-building increase. The same-seed
1,200-battle holdout moved attacker win rate from 52.58% to 53.00%, a change of
only +0.42 percentage points, with zero invalid battles.

The overall verdict remains CONCERNS because TH8 is not playable. The future
TH8 tier unlocks both L8 and a second Harpoon, so its two-building control
pressure cannot be responsibly called balanced until the TH8 army, economy,
base layouts, and two-Harpoon battle population exist.

| Holdout | Before | After | Delta |
|---|---:|---:|---:|
| Overall attacker win rate | 52.58% (631/1,200) | 53.00% (636/1,200) | +0.42 pp |
| TH6 vs TH6 | 55.36% (320/578) | 55.71% (322/578) | +0.35 pp |
| TH7 vs TH7 | 50.00% (311/622) | 50.48% (314/622) | +0.48 pp |
| Invalid battles | 0 | 0 | 0 |
| Maxed-defense cohort wins | 1/238 | 1/238 | unchanged |

## Outliers Detected

1. **L6 to L7 is the largest single-building step.** HP rises 38.46%, impact
   damage 40.00%, range 9.68%, and pull speed 16.67%. This is intentional: L6
   and L7 retain the already tested old TH6 and TH7 endpoints. Reducing the jump
   would silently weaken TH7; increasing L6 would silently strengthen TH6.
2. **TH8 count is the meaningful power spike.** One L7 Harpoon has 20 nominal
   impact DPS and at most 11.43% control uptime. Two L8 Harpoons have 47.14
   combined nominal impact DPS and at most 22.86% combined control uptime, but
   only across distinct eligible targets because reservations and immunity
   prevent same-target chaining.
3. **No price exceeds a reachable authored ceiling.** L2-L6 fit the 106,000
   TH6 per-resource ceiling; L7-L8 fit the established 143,000 late-game
   ceiling. The actual TH8 storage contract still needs launch-time validation.

## Degenerate Strategies Found

None in the playable TH6-TH7 range.

- Multiple Harpoons cannot reserve the same air unit.
- A successfully affected target receives 1.50 seconds of global Harpoon
  immunity, preventing reload desynchronization from pinning one unit.
- Ground armies can destroy Harpoon without being targeted by it.
- The 7.00-second reload and 0.80-second pull cap remain fixed at every level.
- Impact damage remains low: L6 removes 2.53% of a same-level Mechanical Dragon
  and 0.96% of a same-level Fire Dragon; L7 removes 2.45% and 0.92%.

The only untested possible degenerate strategy is a future TH8 layout using two
L8 Harpoons to split-control two flyers inside overlapping damage zones. That
requires a dedicated TH8 counter matrix, not speculative tuning now.

## Progression Analysis

| L | HP | Impact | DPS | Range | Pull/s | Full-range pull | Total price | Price growth |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1,800 | 45 | 6.43 | 1.20 | 0.85 | 0.706 s | 52,000 | placement |
| 2 | 2,300 | 55 | 7.86 | 1.27 | 0.92 | 0.728 s | 97,000 | +86.5% |
| 3 | 2,900 | 65 | 9.29 | 1.34 | 0.99 | 0.747 s | 133,000 | +37.1% |
| 4 | 3,600 | 75 | 10.71 | 1.41 | 1.06 | 0.764 s | 170,000 | +27.8% |
| 5 | 4,400 | 88 | 12.57 | 1.48 | 1.13 | 0.779 s | 209,000 | +22.9% |
| 6 | 5,200 | 100 | 14.29 | 1.55 | 1.20 | 0.792 s | 249,000 | +19.1% |
| 7 | 7,200 | 140 | 20.00 | 1.70 | 1.40 | 0.786 s | 312,000 | +25.3% |
| 8 | 8,800 | 165 | 23.57 | 1.78 | 1.48 | 0.797 s | 374,000 | +19.9% |

All levels can pull a target from their exact range boundary to the 0.60 stop
ring within the 0.80-second cap. Reload is 7.00 seconds at every level, so the
curve improves reliability and durability without eroding the owner's cadence
rule. Trophy weights are monotonic at 20/35/55/80/110/145/190/240.

## Recommendations

1. Keep the authored L1-L8 curve and the TH6=L6 / TH7=L7 / TH8=L8 caps.
2. Keep one Harpoon at TH6-TH7 and two at TH8; do not grant the second early.
3. Treat a two-L8-Harpoon TH8 battle matrix as a hard TH8 launch gate.
4. When TH8 economy is authored, confirm 142,000 wood for L8 fits the intended
   fully developed TH8 capacity and pacing, then adjust price only if required.
5. Monitor L6-to-L7 completion time and all-air win rate in production; do not
   change combat endpoints without evidence because the current holdout is
   stable and valid.

## Values That Need Attention

- **L7 step:** deliberately large but validated; watch upgrade value perception.
- **TH8 second Harpoon:** unvalidated combined control; mandatory future test.
- **L8 price:** capacity-safe against the current 143,000 ceiling, but TH8
  economy is not yet authored.
- **Full TestMain headless startup:** the isolated Godot contracts pass, but the
  full TestMain process did not reach its Harpoon harness within 10 minutes;
  `godot.log` stopped after startup warmup. This is an integration verification
  risk, not evidence of a Harpoon balance failure.

## Verification Evidence

- `server/test-harpoon-combat.js`: PASS; L6 pull 45 ticks, L7/L8 pull 48 ticks,
  L8 impact 165, cadence 420 ticks, Ward and Freeze behavior intact.
- `server/test-th6-progression.js`: PASS; one Harpoon upgrades through L6.
- `server/test-th7-progression.js`: PASS; L7 gate and synthetic L8/count gate.
- `server/test-building-cost-progression.js`: PASS; monotonic and affordable.
- `server/test-client-server-combat-parity.js`: PASS; all eight combat rows.
- `server/test-raid-bot-pool.js`: PASS; TH6 bots cap L6, TH7 bots cap L7.
- Godot `test_th7_progression.gd`: PASS.
- Godot `harpoon_client_probe.gd`: PASS; fire ticks 28/448, final distance 0.600.
- Godot `HarpoonCombatTest.tscn --automated`: PASS; all nine animation phases.
- Godot performance probe: PASS; 8,386 authored triangles, 77 nodes, 0 physics
  bodies/areas/joints, 76.42 microseconds per manual frame.
- Web production build: PASS.
