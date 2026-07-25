# ADR-0014: Server-authoritative Ice Golem defense freeze

## Status
Accepted

## Date
2026-07-24

## Context

### Problem Statement
Ice Golem must attack defensive buildings before economy buildings and freeze
nearby defenses for three seconds when it dies. The browser needs an immediate,
readable ice effect, while replay verification must own targeting, freeze
timing, damage, trophies, and rewards.

### Constraints
- Godot and Node.js must use the same defense classification and freeze radius.
- Replays must remain deterministic across devices and frame rates.
- Existing projectiles may finish, but frozen defenses must not begin new attacks.
- Hidden traps must not be revealed by the visual frost overlay.
- Repeated freezes must refresh duration without stacking separate AI states.

### Requirements
- Target the nearest living defense while any targetable defense remains.
- Fall back to the normal building search after all defenses are destroyed.
- Freeze nearby defense actors for exactly three seconds at the lethal event.
- Pause turret, archer, mage, mortar, skeleton, and shark-trap AI consistently.
- Keep gameplay timing independent from particles, tweens, and animation length.

## Decision
Ice Golem is a four-slot ground siege troop unlocked at Town Hall 6. Its target
priority is a deterministic tier applied before distance: turret, archer tower,
mage tower, tombstone, and mortar are tier zero; all other buildings are tier
one. A nearby skeleton guard may still interrupt as an immediate combat threat.

The authoritative Node verifier applies the radial freeze when lethal damage is
resolved. Every affected defense receives one `frozenUntil` timestamp. A later
freeze replaces it only when the new expiry is later. Existing projectiles keep
their resolved trajectory, while defense targeting, firing, beam ticks,
skeleton AI, and hidden shark-trap scans pause until the timestamp expires.

Godot mirrors the same target tiers and seven-second freeze for responsive local
combat. The client emits one freeze telemetry event, draws a radial ice pulse,
snow particles, and translucent frost cages around visible affected buildings.
The VFX service owns all temporary geometry and never mutates building
materials. Shark traps receive the gameplay freeze but no overlay.

### Architecture Diagram
```text
Ice Golem receives lethal damage
        |
        +--> Godot: freeze local defense actors + render ice VFX
        |                         |
        |                         +--> replay telemetry
        |
        +--> Node verifier: resolve radius + set frozenUntil
                                      |
                                      +--> authoritative battle result
```

### Key Interfaces
- `TROOP_STATS.ice_golem`: HP, damage, cadence, freeze radius, and duration.
- `CombatFreeze`: shared client defense classification and radial application.
- `freeze_for(duration)`: client defense-actor pause contract.
- `handleTroopDeath()` and `applyIceGolemDeathFreeze()`: authoritative death
  and freeze resolution.
- `IceFreezeVFX`: WebGL-safe visual pulse, particles, and frost overlays.

## Alternatives Considered

### Animation-timed freeze
- **Description**: Apply the freeze when the death animation reaches its impact frame.
- **Pros**: Direct visual synchronization.
- **Cons**: Result varies with animation playback, node lifetime, and frame rate.
- **Rejection Reason**: The battle result must be deterministic.

### Mutating every building material
- **Description**: Replace or modify materials on each frozen building.
- **Pros**: Ice follows every mesh precisely.
- **Cons**: Expensive, difficult to restore safely, and can corrupt shared materials.
- **Rejection Reason**: VFX-owned frost geometry is safer and cheaper in WebGL.

### Freezing only visible projectile timers
- **Description**: Pause turret cooldowns but leave guards, beams, and traps active.
- **Pros**: Small implementation.
- **Cons**: Inconsistent mechanic and unclear player expectations.
- **Rejection Reason**: All defensive AI in the radius should obey one rule.

## Consequences

### Positive
- Targeting and freeze outcomes are auditable and frame-rate independent.
- Ice visuals can be tuned without changing combat.
- Hidden traps remain hidden while still respecting the freeze.
- One timestamp handles refreshes without stacking timers.

### Negative
- Defense classification and pause hooks exist in both GDScript and JavaScript.
- New defense types must explicitly join the targeting and freeze sets.

### Risks
- **Client/server parity drift**: covered by focused target and freeze tests.
- **Overpowered disruption**: limited by four ship slots, low DPS per slot, and
  a fixed 0.90-unit radius.
- **Overlay cost in dense bases**: frost rendering is capped at 24 batched boxes.

## Performance Implications
- **CPU**: one bounded defense scan when an Ice Golem dies.
- **Memory**: one shared MultiMesh plus a short-lived 16-particle burst.
- **Load Time**: one model, seven animation clips, and three small textures.
- **Network**: no new endpoint; diagnostics use existing replay telemetry.

## Migration Plan
No schema migration is required. Existing troop-level JSON accepts the
`IceGolem` canonical name and aliases. Server and client balance definitions
must be deployed together.

## Validation Criteria
- A farther defense is selected before a closer storage building.
- A level-1 smash deals 78 damage at 56% of the authored attack cycle.
- Only freezable defenses inside 0.90 units receive a seven-second freeze.
- Frozen turret and archer fire timers do not advance during the freeze.
- Storage buildings receive no freeze state or overlay.
- One lethal event emits exactly one freeze telemetry event.
- The server verifier independently reproduces the target and freeze result.
- Level-7 primary DPS per slot remains below a level-7 Knight.

## Related Decisions
- `docs/architecture/adr-0013-server-authoritative-mechanical-dragon-chain-lightning.md`
