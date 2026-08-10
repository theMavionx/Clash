# Balance Check: Hidden Tesla Late Warning

**Date:** 2026-08-09
**Health summary:** HEALTHY for this change; broader TH-specific progression
still has known outliers.

## Data Sources Analyzed

- `scripts/tower_hidden_tesla.gd`
- `scripts/building_system.gd`
- `server/combat_defs.js`
- `server/combat_session.js`
- `design/gdd/hidden-tesla-town-hall-10.md`
- `production/reports/defense-range-rebalance-2026-08-09.md`
- `tools/pvp-balance/reports/full-game-balance-2026-08-09T15-09-53-787Z.md`

## Final Timing Contract

- Reveal trigger: `1.20` world units.
- Damage/acquisition range: unchanged at `1.05`.
- Warning band: `0.15` world units, with zero damage permitted in the band.
- Reveal duration: unchanged at 30 fixed ticks / 0.50 seconds.
- Trigger scan: unchanged at every 3 ticks / 20 Hz.
- Reload: unchanged at 39 ticks / 0.65 seconds.

Typical deployed troop movement is 0.34-0.77 world units per second. A troop
moving directly toward the Tesla crosses the warning band in 0.195-0.441
seconds, so the hatch becomes visible shortly before the troop reaches damage
range, while the full 0.50-second reveal still prevents an early hit.

## Outliers Detected

| Item/value | Expected range | Actual | Issue |
|---|---:|---:|---|
| Mixed policy attacker win rate | 53-57% | 54.46% (886/1,627) | None |
| Invalid deterministic battles | 0 | 0/3,000 | None |
| Warning band | 0.10-0.25 | 0.15 | None |
| Damage outside 1.05 | 0 hits | 0 hits | None |
| TH10 policy attacker win rate | 53-57% | 70.37% (114/162) | Existing TH-specific progression/layout outlier; not caused solely by this warning change |

## Combat Progression Analysis

Damage, HP, cadence, maximum count, and targeting did not change.

| Level | HP | Damage/shot | Sustained DPS | Shots vs 10,000 HP | TTK after trigger |
|---:|---:|---:|---:|---:|---:|
| 1 | 1,800 | 40 | 61.5 | 250 | 162.35 s |
| 2 | 2,500 | 78 | 120.0 | 129 | 83.70 s |
| 3 | 3,300 | 172 | 264.6 | 59 | 38.20 s |
| 4 | 4,300 | 281 | 432.3 | 36 | 23.25 s |
| 5 | 5,400 | 343 | 527.7 | 30 | 19.35 s |
| 6 | 6,700 | 406 | 624.6 | 25 | 16.10 s |
| 7 | 8,200 | 473 | 727.7 | 22 | 14.15 s |
| 8 | 9,900 | 546 | 840.0 | 19 | 12.20 s |
| 9 | 11,800 | 624 | 960.0 | 17 | 10.90 s |
| 10 | 13,900 | 707 | 1,087.7 | 15 | 9.60 s |

TTK includes the 0.50-second reveal and assumes the target remains within the
1.05 firing radius. No level dominates another at equal cost because level
availability, upgrade cost, and TH progression remain unchanged.

## Degenerate Strategies Found

- A stationary ranged troop inside 1.20 but outside 1.05 can reveal the Tesla
  without being hit immediately. This is intentional warning behavior, and the
  narrow 0.15 band prevents it from becoming island-wide free scouting.
- No hidden targetability, chain-lightning, early-fire, Freeze-reset, or
  destruction-after-fire exploit was found.

## Recommendations

| Priority | Issue | Suggested fix | Impact |
|---|---|---|---|
| Keep | Late warning reads correctly | Retain 1.20 reveal / 1.05 damage | Clearer trap without extra reach |
| Monitor | TH10 policy cohort is offense-heavy | Tune TH10 armies/layouts in a separate progression pass | Avoid distorting all Tesla levels |
| Telemetry | Real approach angles are unknown | Compare reveal-to-first-hit timing in live battle telemetry | Validate the 0.15 warning band |

## Verification

- Server deterministic combat: PASS at exact 1.20 ground/air boundary; no hit
  outside 1.05; reveal 30 ticks; reload 39 ticks.
- Godot client contract: PASS, including exact decimal boundary behavior.
- Rendered visual probe: PASS, 82 frames with targets moving from 1.20 to 1.00.
- TestMain flow: PASS for Attack concealment, nearby reveal, damage, and re-entry.
- Performance: two Teslas / 45 troops, hidden scan 1.584 microseconds, active
  scan 1.510 microseconds, 12,000 samples, zero persistent-node growth.
- Full balance lab: 3,000 battles, 0 invalid; policy population 54.46% attacker wins.

## Values That Need Attention

No Tesla damage, HP, cadence, range, or cost value needs compensation for this
change. The only follow-up is the already-known TH10 army/layout win-rate outlier.
