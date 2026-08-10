# Wind Mage

## Role And Fantasy

Wind Mage is a Town Hall 8 support attacker that controls a long, widening lane.
Each cast damages buildings in the lane and calls temporary Windlings into that
same space. It rewards deployment angles and clustered defenses rather than raw
single-target damage.

## Army Economy

- Unlock: Town Hall 8
- Ship capacity: 10 slots
- Training cost: 1,000 gold (100 gold per occupied slot)
- Upgrade levels: 1-9
- Windlings do not occupy ship slots and are not paid casualties.

## Wind Mage Stats

| Level | HP | Primary damage | Attack interval |
| --- | ---: | ---: | ---: |
| 1 | 1,100 | 215 | 2.20 s |
| 2 | 1,450 | 280 | 2.20 s |
| 3 | 1,900 | 370 | 2.20 s |
| 4 | 2,450 | 490 | 2.20 s |
| 5 | 3,100 | 640 | 2.20 s |
| 6 | 3,850 | 830 | 2.20 s |
| 7 | 6,000 | 1,500 | 2.20 s |
| 8 | 6,000 | 1,500 | 2.20 s |
| 9 | 6,000 | 1,500 | 2.20 s |

The strike lands at 52% of the attack animation. The primary target receives
full damage. Up to four other buildings inside the wind corridor receive 50%
damage. Skeleton guards and other units are not valid wave targets.

The table stores authored pre-curve values. The level-7 primary root resolves
to 10,440 HP and 2,610 primary damage after the shared `1.74x` same-TH curve.

## Wind Corridor

- Length: 1.65 world units beyond the primary target direction
- Near half-width: 0.24 world units
- Far half-width: 0.45 world units
- Secondary target cap: 4
- Secondary damage: 50%

The corridor origin and orientation are derived from the caster and primary
target. Server simulation uses the same deterministic geometry as the client.

## Windlings

Each completed Wind Mage cast creates two or three Windlings at deterministic
positions inside the corridor.

| Level | HP | Damage | Attack interval |
| --- | ---: | ---: | ---: |
| 1 | 50 | 11 | 0.90 s |
| 2 | 67 | 14 | 0.90 s |
| 3 | 86 | 19 | 0.90 s |
| 4 | 111 | 24 | 0.90 s |
| 5 | 139 | 32 | 0.90 s |
| 6 | 172 | 41 | 0.90 s |
| 7 | 250 | 61 | 0.90 s |
| 8 | 283 | 69 | 0.90 s |
| 9 | 319 | 78 | 0.90 s |

- Lifetime: 8 seconds
- Per-owner cap: 6 active Windlings
- Targeting: buildings only
- Movement class: flying
- Windlings disappear when their owning Wind Mage dies.
- Windling deaths are excluded from paid casualties and reinforcement cost.

## Tuning Guardrails

- Keep the 2.20 second attack interval fixed. Faster casts make summon buildup
  visually noisy and produce a dominant lane-clear strategy.
- Secondary damage should remain between 35% and 50%.
- Active Windling cap should remain between 4 and 6.
- Windling lifetime should remain between 6 and 9 seconds.
- Wind Mage should remain weaker than an equal-slot pure damage composition
  against isolated defenses, but stronger against aligned building clusters.

## Acceptance Criteria

- Client and authoritative server use identical stats and corridor geometry.
- The strike is synchronized to the visible wind slash.
- Targets outside the corridor take no wave damage.
- A cast creates two or three Windlings and never exceeds six per caster.
- Windlings cannot attack guards and do not become casualties.
- The unit is available from Town Hall 8 for 10 ship slots in every ship,
  upgrade, casualty, replay, and mobile attack UI.
- The mobile attack roster scrolls horizontally without covering battle HUD
  controls.
