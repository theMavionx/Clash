# ADR-0015: Server-authoritative Horror evolution splitting

## Status
Accepted

## Date
2026-07-24

## Context

### Problem Statement
Horror must enter battle as one large troop, split into two Creepers on death,
and let each Creeper split into two Lurkers. The local battle needs immediate
death and spawn animation feedback, while replay verification must reproduce
the same `1 -> 2 -> 4` family without granting free ship inventory or counting
temporary descendants as persistent casualties.

### Constraints
- Split count, positions, stats, and activation times must be deterministic.
- Only the player-loaded Horror consumes ship capacity and can be reinforced.
- Descendants must remain targetable during their short spawn animation.
- A terminal Lurker death must never split again.
- Client and server must agree on the bite impact frame for all three forms.

## Decision
Horror is a three-slot Town Hall 6 attrition troop. One persistent root troop
uses the large Horror model. Lethal damage creates two temporary stage-one
Creepers; lethal damage to each Creeper creates two temporary stage-two
Lurkers. Stage two is terminal.

The split direction is derived from the root replay order and generation, while
child lineage determines a stable replay order. Children inherit the root
level, but use generation-specific HP, damage, cadence, movement, range, and
size. A short activation lock plays the spawn clip without making the child
invulnerable.

Godot creates the visible descendants at the lethal event. The Node verifier
independently creates the same descendants and remains authoritative for
damage, deaths, trophies, and rewards. Only a dead root contributes to the
casualty map. The server records every child in `troop_split_spawn` telemetry.

### Architecture Diagram
```text
Loaded Horror (3 ship slots)
          |
          | lethal damage
          v
  2 temporary Creepers
       |           |
       | lethal    | lethal
       v           v
  2 Lurkers     2 Lurkers
       \___________/
       terminal deaths
```

### Key Interfaces
- `HORROR_EVOLUTION`: shared server generation count, timing, offsets, and stats.
- `HorrorEvolution._spawn_next_generation()`: client visual split.
- `spawnHorrorEvolutionChildren()`: authoritative server split.
- `evolutionLineage` and `evolutionRootOrder`: deterministic identity.
- `troop_split_spawn`: compact replay diagnostic event.

## Alternatives Considered

### Recording every child as a replay action
- **Description**: Client sends six additional deploy actions.
- **Pros**: Simple use of the existing deploy path.
- **Cons**: Trusts the client, inflates ship use, and permits forged descendants.
- **Rejection Reason**: Evolution is a combat consequence, not player input.

### One actor that changes mesh and HP
- **Description**: Keep one simulation entity and visually show extra models.
- **Pros**: Small server implementation.
- **Cons**: Cannot create real target pressure or independent child deaths.
- **Rejection Reason**: The defining mechanic is multiple independently targetable bodies.

### Random child positions
- **Description**: Scatter descendants around the parent.
- **Pros**: More organic visuals.
- **Cons**: Replay divergence across runtimes and frame rates.
- **Rejection Reason**: Split outcomes must be reproducible.

## Consequences

### Positive
- The family creates genuine overkill resistance and target pressure.
- Ship capacity and reinforcement economy remain auditable.
- Animation tuning does not control authoritative split timing.
- Replays expose exact generation and lineage for debugging.

### Negative
- One deployed unit can create seven simultaneous historical entities.
- Three models and eighteen animation clips must be warmed before combat.
- Client and server maintain matching generation tables.

### Risks
- **Entity spikes**: bounded to six temporary descendants per loaded Horror.
- **Balance dominance**: three-slot cost and lower phase DPS offset effective HP.
- **Parity drift**: covered by stat-parity and deterministic split tests.

## Performance Implications
- **CPU**: at most six additional targetable entities per deployed root.
- **Memory**: three small skinned models and their animation libraries.
- **Load Time**: all forms are prewarmed behind the loading cover.
- **Network**: no new endpoint; split telemetry is stored in existing replay data.

## Migration Plan
No schema migration is required. Troop-level and ship JSON accept the new
`horror` key. Client progression, server progression, combat definitions, and
UI must ship together.

## Validation Criteria
- One lethal root event creates exactly two stage-one children.
- Two stage-one deaths create exactly four stage-two children.
- Stage-two deaths create no descendants.
- Descendants are targetable during spawn lock and act only after it expires.
- One family consumes three ship slots and reports at most one casualty.
- Two simulations produce identical child lineage, order, and positions.
- Bite damage occurs at 42% of each authored `0.833 s` attack clip.
- Total effective family HP and phase DPS remain below raw three-Knight output.

## Related Decisions
- `docs/architecture/adr-0013-server-authoritative-mechanical-dragon-chain-lightning.md`
- `docs/architecture/adr-0014-server-authoritative-ice-golem-freeze.md`
