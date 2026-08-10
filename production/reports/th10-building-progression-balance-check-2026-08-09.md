# Balance Check: TH10 Building Progression

> Date: 2026-08-09
> Health: HEALTHY

## Data sources analyzed

- `scripts/building_system.gd`
- `scripts/skeleton_guard.gd`
- `server/db.js`
- `server/combat_defs.js`
- `server/matchmaking_defs.js`
- `design/gdd/tombstone-defense.md`

## Progression contract

All standard ten-level buildings cap at L9 on TH9 and unlock exactly one new
level, L10, after the Town Hall reaches L10. Hidden Tesla is the deliberate
late-unlock exception: it is unavailable through TH9 and permits L1-L10 at
TH10. Port (L3) and the purchased Altar (L1) retain their authored caps.

| Item | TH9 | TH10 | Result |
|---|---:|---:|---|
| Standard ten-level buildings | L9 | L10 | One-level upgrade unlocked |
| Hidden Tesla | Locked | L1-L10 | Late-unlock contract preserved |
| Port | L3 | L3 | Intentional special cap |
| Altar | L1 | L1 | Intentional purchased-building cap |

## Tombstone L10 balance

Tombstone was the only standard building still capped below L10. Its L10 row
reuses the established final visual but adds a real, bounded gameplay step.

| Value | L9 | L10 | Change |
|---|---:|---:|---:|
| Building HP | 6,000 | 7,000 | +16.7% |
| Guard count | 5 | 5 | 0% |
| HP per guard | 3,150 | 3,650 | +15.9% |
| Damage per guard | 400 | 450 | +12.5% |
| Total guard DPS | 2,325.6 | 2,616.3 | +12.5% |
| Trophy weight | 295 | 375 | +27.1% |

Attack interval, movement speed, detection radius, formation size, and target
rules remain unchanged. The upgrade therefore increases durability and damage
without adding physics agents or increasing scan frequency.

The L10 upgrade costs 84,500 gold and 312,000 ore through the standard x130
curve. Each resource remains within the fully developed TH10 per-resource cap
of 324,000.

## Outliers detected

None after calibration. An initial 4,000 HP / 500 damage guard proposal would
have produced a 25-27% combat spike and was rejected before final verification.

## Degenerate strategies

None introduced. The five-guard cap is unchanged, guards remain ground-only,
and post-L5 movement/detection do not scale.

## Verification gates

- Server TH6, TH7, TH8-TH10, Hidden Tesla, and building-cost progression tests.
- Client/server combat parity through Tombstone guard L10.
- Server and Godot five-body Tombstone probes through L10.
- Competitive bot templates and maximum-level validation through TH10.
- Production React/Vite build with the new Hidden Tesla UI thumbnail.
