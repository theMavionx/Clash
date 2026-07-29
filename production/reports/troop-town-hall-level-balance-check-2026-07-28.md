# Balance Check: Troop Level Cap and TH1-TH7 Win Rate

## Data Sources Analyzed

- `server/db.js`
- `server/combat_defs.js`
- `server/combat_session.js`
- `scripts/building_system.gd`
- `scripts/base_troop.gd`
- `web/src/components/BarnPanel.jsx`
- `tools/pvp-balance/run.js`
- `production/reports/troop-th1-th7-balance-lab-seed42-2026-07-28.json`
- `production/reports/troop-th1-th7-balance-lab-seed1337-2026-07-28.json`

## Health Summary: HEALTHY WITH COMPOSITION OUTLIERS

The runtime now enforces `effective troop level <= Town Hall level` across
server reads, upgrades, combat, matchmaking power, Godot, and React. The main
1,400-battle same-TH/maxed sample met every requested per-tier band with zero
invalid replays.

| Tier | Target | Seed 42 result |
| --- | ---: | ---: |
| TH1 | 60-70% | 67.0% |
| TH2 | 60-70% | 62.1% |
| TH3 | 60-70% | 65.7% |
| TH4 | 60-70% | 69.5% |
| TH5 | 45-55% | 51.7% |
| TH6 | 45-55% | 49.5% |
| TH7 | 45-55% | 53.7% |

## Outliers Detected

| Item | Expected | Actual | Assessment |
| --- | ---: | ---: | --- |
| Invalid replays | 0 | 0 / 1,400 and 0 / 700 | Pass |
| Pure Mage army | Useful stress case | 23.5% across 51 battles | Weak composition |
| Pure Mimic army | Useful stress case | 28.0% across 25 battles | Weak composition |
| Balanced army | Strong, not guaranteed | 73.2% across 127 battles | Strong but counterable |
| Maxed defense profile | Hard | 25.9% attacker wins | Expected hard endpoint |
| Rushed-economy profile | Easy | 96.4% attacker wins | Expected fragile endpoint |

## Degenerate Strategies Found

- No single tested army reached a 100% win rate.
- Pure Mage and Pure Mimic are poor general-purpose strategies. This is not a
  global stat emergency because mixed ranged/support armies perform well and
  those pure templates intentionally remove frontline or complementary roles.
- Rushed-economy bases are nearly free wins, while maxed and rushed-defense
  bases are severe. Matchmaking must continue mixing or selecting difficulty
  profiles instead of treating all same-TH bases as equivalent.

## Progression Analysis

- Effective troop levels now advance one-for-one with Town Hall levels.
- Every primary troop retains monotonic HP and damage after the shared power
  curve.
- TH4-to-TH5 changes the target from onboarding-favored 60-70% to an
  approximately even battle; seed 42 records 69.5% at TH4 and 51.7% at TH5.
- TH7 offense now counters the full defense package without reducing the
  Cannon below same-level Archer Tower parity.
- Stored over-levelled legacy rows are compatibility data only and no longer
  create early combat power.

## Recommendations

| Priority | Issue | Suggested follow-up | Impact |
| --- | --- | --- | --- |
| Medium | Pure Mage/Mimic compositions are weak | Improve army-builder guidance, not global stats | Reduces player traps without creating dominant mixed armies |
| Medium | Base profiles span 25.9-96.4% | Preserve matchmaking difficulty routing and telemetry | Keeps the global win rate stable |
| Low | Seed 1337 has wider per-tier variance at ~100 samples | Use at least 200 same-TH samples per tier for sign-off | Avoids tuning to sample noise |

## Values That Need Attention

No immediate numeric change is required for the requested TH-level cap or
same-tier target. The next balance pass should use live composition and base
profile telemetry before changing the shared troop curve.
