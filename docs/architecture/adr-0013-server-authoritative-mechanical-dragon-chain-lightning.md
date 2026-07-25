# ADR-0013: Server-authoritative Mechanical Dragon chain lightning

## Status
Accepted

## Date
2026-07-24

## Context

### Problem Statement
The Mechanical Dragon needs a visually distinct lightning attack that damages a
primary building and jumps to nearby buildings. The browser client must render
the attack immediately, while the replay verifier remains authoritative for
damage, target order, trophies, and rewards.

### Constraints
- Godot and Node.js must resolve the same targets and integer damage values.
- Replays must remain deterministic across devices and frame rates.
- The unit must fit the existing troop, ship-capacity, upgrade, and TH gates.
- Chain VFX must not create server state or affect target selection.

### Requirements
- One primary hit and at most two building-only jumps.
- Each jump selects the nearest living, previously unhit building.
- Equal-distance targets use a stable building identifier as a tie-break.
- Damage uses integer basis-point falloff.
- The server rejects outcomes that disagree with authoritative simulation.

## Decision
Mechanical Dragon combat is defined in the shared client/server balance data as
a four-slot flying troop unlocked at Town Hall 6. A hit deals full damage to
the primary target, then searches from the last hit position for up to two
additional buildings within the configured radius. Each jump applies the
configured basis-point falloff to the previous hit.

Both runtimes sort candidates by squared planar distance and then by stable
building identifier. Godot renders segmented lightning and impact flashes only
after resolving the same path. Node.js independently reconstructs the path
during replay verification and owns the accepted result.

The authored `Lightning_Attack` clip is scaled to a fixed 1.03-second attack
cooldown at every troop level. Progression increases HP and per-strike damage
instead of accelerating the large model. Damage and lightning are emitted at
50% of that cycle, matching the charged mid-clip pose. The server uses the same
normalized hit delay, while the client anchors the first arc to the animated
`RigJaw` bone. This keeps visual contact and authoritative damage synchronized
without twitchy high-level animation.

The imported body material keeps the source albedo palette with a mild cool
darkening and restrained metallic response, then uses the authored emission map
at low intensity. This preserves the dark metal, gold, red, and cyan palette
without flattening the model into gray or overexposing the emissive surfaces.

Each lightning arc is rendered as three batched crossed-ribbon meshes: a wide
additive glow, a cyan bolt, and a narrow white core. Two deterministic path
variants flicker during the 220 ms lifetime. Short side branches, an expanding
impact ring, a pulsing impact core, and a ten-spark CPU burst add depth while
keeping the effect compatible with WebGL. The real model, animation library,
materials, ArrayMesh paths, and particle variant are drawn during the existing
hidden combat warmup before the loading cover is removed.

### Architecture Diagram
```text
player deploys Mechanical Dragon
        |
        +--> Godot resolves path --> immediate animation and lightning VFX
        |            |
        |            +--> combat telemetry records target IDs and damage
        |
        +--> replay actions --> Node verifier resolves the same path
                                  |
                                  +--> accepted HP, result, trophies, rewards
```

### Key Interfaces
- `TROOP_STATS.mechanical_dragon`: HP, damage, speed, range, jump count,
  radius, and falloff.
- `MechanicalDragon._resolve_chain_path()`: client target selection.
- `MechanicalDragon._sync_attack_animation_speed()`: fits the attack clip to
  the authoritative cooldown and emits the strike at the shared 50% phase.
- `applyChainLightningHit()`: server target selection and damage.
- `troop_chain_lightning_hit`: client telemetry for diagnostics.

## Alternatives Considered

### Client-authoritative chain results
- **Description**: Trust the targets and damage reported by Godot.
- **Pros**: Minimal server work.
- **Cons**: Frame-rate divergence and trivial combat-result manipulation.
- **Rejection Reason**: Incompatible with authoritative rewards.

### Area-of-effect damage
- **Description**: Damage every building in a radius around the primary target.
- **Pros**: Simple and visually clear.
- **Cons**: Unbounded value in dense bases and less distinctive targeting.
- **Rejection Reason**: Harder to balance and not the requested chain behavior.

### Random chain targets
- **Description**: Randomly choose nearby buildings.
- **Pros**: More chaotic visuals.
- **Cons**: Requires synchronized RNG and makes replays harder to audit.
- **Rejection Reason**: Deterministic nearest-target chaining is clearer.

## Consequences

### Positive
- Client and server produce identical, auditable damage.
- The unit rewards clustered-base awareness without replacing single-target DPS.
- VFX can evolve independently from authoritative combat.

### Negative
- Chain logic is implemented in both GDScript and JavaScript.
- Changes to radius, falloff, or tie-breaking require parity tests.

### Risks
- **Parity drift**: covered by focused `106 -> 69 -> 45` client/server tests.
- **Dense-base dominance**: capped at two jumps and balanced by four ship slots.
- **VFX buildup**: batched arcs and impact particles self-remove after a fixed
  220 ms lifetime.

## Performance Implications
- **CPU**: at most two nearest-building scans per attack cycle.
- **Memory**: six prebuilt path meshes per short-lived arc, with only three
  active ribbon draw layers per arc.
- **Load Time**: one model, six animation clips, and two runtime textures.
- **Network**: no extra combat endpoint; replay telemetry uses existing flow.

## Migration Plan
No database migration is required. Existing troop level JSON accepts the new
canonical key and aliases. New purchases are gated by Town Hall 6.

## Validation Criteria
- Godot and Node tests produce damage `[106, 69, 45, 0]`.
- The first strike occurs at `attack cooldown * 0.50`, within one rendered
  60 Hz frame, and the animation is at normalized phase `0.50`.
- Every level uses the same 1.03-second cooldown; HP and damage own progression.
- The first lightning arc originates from the animated jaw rather than the
  troop root.
- Every hit creates exactly three chained VFX roots, each containing glow,
  bolt, core, impact-ring, and spark layers.
- Main-scene warmup logs the `mechanical_dragon` step and draws the real effect
  for the existing six combat warmup frames.
- No guard is used as a secondary chain target.
- Eleven level-7 Mechanical Dragons plus one standard troop fit the 45-slot level-5 ship.
- Ideal three-target DPS per slot remains below level-7 Mage DPS.
- TestMain can deploy the unit and play all imported animations.

## Related Decisions
- `docs/architecture/adr-0011-server-bot-bases-and-recovery-matchmaking.md`
