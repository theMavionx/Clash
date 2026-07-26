# Wind Mage

## Role And Fantasy

Wind Mage is a Town Hall 6 support attacker that controls a long, widening lane.
Each cast damages buildings in the lane and calls temporary Windlings into that
same space. It rewards deployment angles and clustered defenses rather than raw
single-target damage.

## Army Economy

- Unlock: Town Hall 6
- Ship capacity: 15 slots
- Training cost: 1,500 gold (100 gold per occupied slot)
- Upgrade levels: 1-7
- Windlings do not occupy ship slots and are not paid casualties.

## Wind Mage Stats

| Level | HP | Primary damage | Attack interval |
| --- | ---: | ---: | ---: |
| 1 | 2,200 | 430 | 2.20 s |
| 2 | 2,900 | 560 | 2.20 s |
| 3 | 3,800 | 740 | 2.20 s |
| 4 | 4,900 | 980 | 2.20 s |
| 5 | 6,200 | 1,280 | 2.20 s |
| 6 | 7,700 | 1,660 | 2.20 s |
| 7 | 9,400 | 2,140 | 2.20 s |

The strike lands at 52% of the attack animation. The primary target receives
full damage. Up to four other buildings inside the wind corridor receive 45%
damage. Skeleton guards and other units are not valid wave targets.

## Wind Corridor

- Length: 1.65 world units beyond the primary target direction
- Near half-width: 0.24 world units
- Far half-width: 0.45 world units
- Secondary target cap: 4
- Secondary damage: 45%

The corridor origin and orientation are derived from the caster and primary
target. Server simulation uses the same deterministic geometry as the client.

## Windlings

Each completed Wind Mage cast creates two or three Windlings at deterministic
positions inside the corridor.

| Level | HP | Damage | Attack interval |
| --- | ---: | ---: | ---: |
| 1 | 90 | 20 | 0.90 s |
| 2 | 120 | 26 | 0.90 s |
| 3 | 155 | 34 | 0.90 s |
| 4 | 200 | 44 | 0.90 s |
| 5 | 250 | 57 | 0.90 s |
| 6 | 310 | 73 | 0.90 s |
| 7 | 380 | 93 | 0.90 s |

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
- The unit is available from Town Hall 6 for 15 ship slots in every ship,
  upgrade, casualty, replay, and mobile attack UI.
- The mobile attack roster scrolls horizontally without covering battle HUD
  controls.
