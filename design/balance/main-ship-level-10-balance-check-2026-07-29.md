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
| Healing duration | 6-10 seconds | 8 seconds | Reduced from 14 seconds |
| Repeat cost growth | Positive escalation | +1 energy per use | Matches Cannon and Rally |

### Degenerate Strategies Found

- No army-size power creep exists after level 5.
- A level-10 ship cannot cast all four tactical abilities from starting energy:
  the total cost is 26 versus 22 starting energy.
- Repeated casts are bounded by the shared energy pool: from 22 starting energy,
  Healing Field and Freeze Orb allow three casts, while Rage Field and Skeleton
  Barrel allow two.
- Overlapping Healing Fields cannot multiply healing tick frequency.
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

### Cannon Progression

| Ship level | First shot cost | Damage | Max starting-energy damage |
|---:|---:|---:|---:|
| 1 | 1 | 500 | 1,000 |
| 2 | 1 | 700 | 2,100 |
| 3 | 2 | 1,100 | 2,200 |
| 4 | 2 | 1,450 | 4,350 |
| 5 | 3 | 1,800 | 5,400 |
| 6 | 3 | 2,250 | 6,750 |
| 7 | 4 | 2,800 | 8,400 |
| 8 | 4 | 3,400 | 10,200 |
| 9 | 5 | 4,100 | 12,300 |
| 10 | 5 | 4,900 | 14,700 |

Each repeat shot costs one more energy. The ceiling uses starting energy only
and excludes energy refunded by destroyed buildings. At level 7, one cannon
hit removes roughly 23-34% of a maximum-level defensive building, so it is
useful without becoming a one-shot substitute for troops.

### Repeat-Cast Curve At Level 10

| Ability | First costs | Maximum casts from 22 starting energy |
|---|---|---:|
| Healing Field | 6, 7, 8 | 3 |
| Freeze Orb | 5, 6, 7 | 3 |
| Rage Field | 7, 8 | 2 |
| Skeleton Barrel | 8, 9 | 2 |

The full level 1-10 ship sink is 101,900 gold, 203,600 wood, and 175,300 ore.
Because this is paid across nine upgrades, it does not require a player to hold
the cumulative amount at once.

### Recommendations

| Priority | Issue | Suggested Fix | Impact |
|---|---|---|---|
| P2 | L9 has no new button | Keep the explicit `Tactical Reserve (+2 energy)` UI label | Prevents the upgrade from feeling empty |
| P3 | Late-game ability combinations need live data | Track cast rate and unused ending energy by ship level | Supports later tuning without guesswork |

### Values That Need Attention

The cannon now scales with ship progression, while Freeze was reduced from
6 seconds and 0.95 radius to 4 seconds and 0.80 radius. Revisit the L9 cost only
if telemetry shows a materially lower upgrade conversion rate than L8 and L10.
