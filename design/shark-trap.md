# Shark Trap

## Purpose

The Shark Trap is a hidden, single-use ground defense. It eliminates the first ordinary enemy ground troop that enters its footprint; Demon King instead takes level-scaled damage. Combat resolution is server-authoritative; the vertical shark-head bite only presents the server-reproducible result.

## Progression

- Footprint: 2x2 main-island grid cells.
- Unlock: Town Hall 3.
- Limit: one trap at Town Hall 3-4, two traps at Town Hall 5.
- Initial cost: 300 gold, 800 wood, 650 ore.
- Levels: 1-5, with upgrades capped by the current Town Hall level.
- Generic building upgrade cost multipliers apply: 2x, 3x, 5x, and 8x of the initial cost.

| Level | Damage |
| --- | ---: |
| 1 | 500 |
| 2 | 750 |
| 3 | 1,050 |
| 4 | 1,450 |
| 5 | 2,000 |

This curve eliminates a same-progression regular troop, including the Knight, while dealing roughly 46-66% of a same-level common Demon King's HP.

## Combat Rules

- Hidden from the attacker until triggered.
- Triggers on the first living ground troop inside its exact rotated 2x2 footprint.
- Ignores every flying troop.
- Triggers once per battle and immediately eliminates an ordinary ground troop regardless of remaining HP.
- Demon King takes the trap's current level damage and remains active if HP stays above zero.
- Cannot be selected as an attack, cannon, or rally target.
- Does not count as a destroyed building.
- Replay verification derives the trigger and damage from the defender snapshot and troop movement; the client cannot submit a forged trap hit.

## Presentation

- The owner sees the shark standing vertically below the trap, with only its head above the water marker.
- The attacker sees no trap until it triggers. The head rises, bites, and sinks back below the surface.
- A separate ambient shark swims around the island only when the viewed base owns at least one Shark Trap. It is a visual warning and has no collision or combat authority.

## Acceptance Criteria

- Client and server choose the same ground troop and damage for the same replay.
- A flying Fire Dragon never triggers the trap.
- Each placed trap damages at most one troop per battle.
- A level 1 trap eliminates even a higher-level ordinary ground troop.
- A level 5 trap deals 2,000 damage to, but does not eliminate, a level 5 common Demon King.
- Upgrade level never exceeds the current Town Hall level.
- The ambient shark is absent from bases without a trap and visible on bases with one.
- Replay, live combat, and low-FPS execution produce the same HP and casualties.
