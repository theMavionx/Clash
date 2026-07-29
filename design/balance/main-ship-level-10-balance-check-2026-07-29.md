# Balance Check: Main Ship Levels 6-10

### Data Sources Analyzed

- `server/combat_defs.js`
- `server/db.js`
- `design/balance/main-ship-progression-2026-07-25.md`
- `design/balance/main-ship-tactical-abilities-2026-07-26.md`
- `design/gdd/economy-balance.md`

### Health Summary: HEALTHY

The progression adds tactical breadth without raising the 45-slot army ceiling.
Every upgrade adds exactly 2 starting energy, active abilities arrive one at a
time, and every individual upgrade cost fits within the TH7 resource caps.

### Outliers Detected

| Item/Value | Expected Range | Actual | Issue |
|---|---:|---:|---|
| Capacity after level 5 | 45 | 45 | None |
| Energy gain per level | 2 | 2 | None |
| Active unlock spacing | 1-2 levels | L6, L7, L8, L10 | L9 is intentionally a reserve level |
| Largest single resource cost | Below TH7 cap | 54,000 wood | None |

### Degenerate Strategies Found

- No army-size power creep exists after level 5.
- A level-10 ship cannot cast all four tactical abilities from starting energy:
  the total cost is 26 versus 22 starting energy.
- Destroyed-building energy remains relevant for full ability combinations and
  repeated cannon or rally use.

### Progression Analysis

| Level | Capacity | Energy | New tactical value |
|---:|---:|---:|---|
| 5 | 45 | 12 | Maximum army size |
| 6 | 45 | 14 | Healing Field |
| 7 | 45 | 16 | Freeze Orb |
| 8 | 45 | 18 | Rage Field |
| 9 | 45 | 20 | Tactical Reserve |
| 10 | 45 | 22 | Skeleton Barrel |

The full level 1-10 ship sink is 101,900 gold, 203,600 wood, and 175,300 ore.
Because this is paid across nine upgrades, it does not require a player to hold
the cumulative amount at once.

### Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| P2 | L9 has no new button | Keep the explicit `Tactical Reserve (+2 energy)` UI label | Prevents the upgrade from feeling empty |
| P3 | Late-game ability combinations need live data | Track cast rate and unused ending energy by ship level | Supports later tuning without guesswork |

### Values That Need Attention

No immediate numeric change is required. Revisit the L9 cost only if telemetry
shows a materially lower upgrade conversion rate than L8 and L10.
