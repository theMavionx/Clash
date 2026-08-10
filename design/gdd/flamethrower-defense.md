# Flamethrower Defense — Implemented Baseline

Status: implemented and automatically verified
Updated: 2026-08-02
Rules version: `flamethrower-v1`

## Role

The Flamethrower is a Town Hall 8 directional area-defense building. It does not rotate or track targets. The player chooses its facing during placement and may edit that facing later. It damages every ground unit inside its fixed cone, making placement and approach direction the core tactical decision.

The authoritative machine-readable configuration is `shared/gameplay/flamethrower-defense.v1.json`. Client previews and server combat must use that configuration or its generated adapter rather than duplicate balance constants.

## Unlocks and Progression

- Footprint: 3x3 cells.
- First building unlocks at TH8.
- Second building unlocks at TH10.
- Maximum counts by TH8/TH9/TH10: 1/1/2.
- Maximum levels by TH8/TH9/TH10: 8/9/10.
- Playable progression now reaches TH9. The first Flamethrower is acquired at TH8 and upgrades to L9 at TH9; TH10/L10 remains data-ready behind the live cap.

| Level | TH | HP | Damage per tick | Range | Gold | Wood | Ore |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 2600 | 58 | 0.80 | 18000 | 40000 | 34000 |
| 2 | 8 | 3350 | 78 | 0.85 | 26000 | 54000 | 45000 |
| 3 | 8 | 4250 | 105 | 0.90 | 36000 | 70000 | 58000 |
| 4 | 8 | 5300 | 137 | 0.95 | 48000 | 86000 | 72000 |
| 5 | 8 | 6500 | 172 | 1.05 | 63000 | 104000 | 87000 |
| 6 | 8 | 7850 | 210 | 1.15 | 80000 | 120000 | 101000 |
| 7 | 8 | 9300 | 250 | 1.25 | 98000 | 134000 | 115000 |
| 8 | 8 | 10900 | 295 | 1.35 | 118000 | 142000 | 126000 |
| 9 | 9 | 12650 | 345 | 1.45 | 142000 | 170000 | 150000 |
| 10 | 10 | 14600 | 400 | 1.55 | 170000 | 202000 | 180000 |

## Facing and Placement

- Facing has 24 persistent steps of 15 degrees.
- Step 0 points along world negative Z; subsequent steps turn clockwise.
- The firing cone is 50 degrees inclusive, or plus/minus 25 degrees from the chosen forward vector.
- Exact cone-boundary comparisons use `half_angle_cos_sq = 0.8213938048432696` and `cone_boundary_epsilon = 0.000000001`.
- Placement is a two-stage flow: first lock a valid 3x3 cell, then rotate and confirm.
- Editing uses compare-and-swap persistence. A stale revision reloads the canonical server state instead of silently overwriting it.
- Rotation controls are Q/E/R and touch buttons. Mouse-wheel rotation is available only during placement.

## Combat Timeline

Combat is deterministic at 60 ticks per second:

| Phase | Duration/offset |
|---|---:|
| Scan | 9 ticks |
| Prime | 18 ticks |
| Stream | 60 ticks (1.0 second) |
| Damage pulses | stream offsets 0, 15, 30 |
| Full cycle | 90 ticks |

Each damage pulse hits all living ground targets whose centers are within the current level range and the fixed inclusive cone. Air targets are never eligible. The building does not rotate toward a selected target after placement.

Ward mitigation is applied to each pulse using ceiling rounding. Freeze immediately cancels future pulses from the active stream; cooldown timing remains absolute and is not restarted by a cancelled stream. Destruction also cancels the remaining stream, presentation, and audio.

## Presentation and Assets

- Ten model wrappers exist at `Model/Flamethrower/level_01` through `level_10`.
- Every wrapper exposes `SourceModel`, `MuzzleSocket`, and `FacingArrowSocket` with local negative Z as forward. The raw art already places its visible nozzle along negative Z, so `SourceModel` preserves its authored rotation; the wrapper root and sockets remain canonical.
- Fire presentation combines one visible emitter using the Fire Dragon's additive texture/material with a very low-opacity procedural sector core. The core is an animated dark-orange flame surface rather than a solid beam: it occupies only the inner `17.5`-degree half-angle, is clipped by the same tapered sector geometry, and exists solely to keep the terminal plume connected beneath the Dragon detail cards. The Flamethrower uses 96 particles and `1.65x` Dragon billboard width. The cards fill the reserved edge margin so the combined plume visually occupies, but does not intentionally exceed, the `25`-degree damage half-cone. The emitter birth radius is only `0.006x` beam width. Its linearly interpolated, cubic-style size profile grows from `0.001` at the nozzle through `0.016`, `0.125`, and `0.422` at normalized ages `0.25`, `0.50`, and `0.75`, reaching `1.0` only at the far end. This strongly suppresses card width near the cone apex while preserving full width at range, and linear tangent modes prevent interpolation overshoot. The visual origin starts `0.14` units forward of `MuzzleSocket`; VFX length subtracts both the wrapper's root-to-muzzle forward offset and this start offset from combat range. This compensates for the screen-space parallax between the elevated nozzle and the ground-sector edge, keeps the first visible card inside the cone, and leaves the last card at the damage-sector range instead of beyond it. Unlike the Dragon's freely rotating burst cards, the sustained tower cards align their long axis to velocity and use only `±12` degrees of angle plus `±22` degrees/second angular motion. Tower velocity and lifetime are deterministic at the terminal boundary, so every card reaches the complete visual range together instead of producing early fragments. Random card scale is constrained to `0.72x–1.0x`, while the taper curve still makes the nozzle narrow. Dragon cards fade out by `94%` of travel; the procedural flame surface carries only the final `6%` to the range boundary, eliminating isolated terminal sprites without reading as a filled attack-sector sheet. The process tint is neutral so the ramp is not multiplied by a second yellow tint and washed out. Because the tower sustains the emitter for a 60-tick stream instead of playing one short Dragon burst, emission explosiveness and timing randomness are both `0.0`, producing even overlap without a warmup burst. Normal completion stops new particle emission and advances the core's rear edge with the draining plume; the final `16%` sliver is removed as one mass instead of degenerating into isolated dots. Dynamic attack lights remain disabled. Freeze, destruction, and cleanup still interrupt immediately.
- Audio uses three persistent 3D players and existing project sounds for prime, loop, and impact events.
- Level 4 uses the corrected deterministic material set.
- The source archive contains no metallic, normal, or AO maps for levels 6–10. Those levels keep the real base/roughness sources and receive deterministic steel-blue material tinting; missing maps are not fabricated.

## Server and Persistence

- Building `facing_step` and revision are stored server-side.
- Placement, upgrades, count caps, TH gates, and facing edits are validated authoritatively.
- Battle setup creates an immutable snapshot containing building level, facing, combat stats, and rules version.
- Combat targeting and damage run on the server. Client VFX, audio, selection sector, and placement preview are presentation only.

## Acceptance and Verification

The implemented baseline is accepted when:

1. All ten assets import and the export manifest includes every wrapper plus the shared configuration.
2. Exact plus/minus 25-degree targets are hit for every facing, while plus/minus 25.001-degree targets are rejected.
3. Ground targets receive three pulses and air targets receive none.
4. Placement cannot be submitted before facing confirmation and duplicate facing saves are blocked.
5. A CAS conflict refreshes the client with canonical server state.
6. Freeze, Ward, destruction cleanup, and cooldown behavior match the deterministic timeline.
7. Web production build, Godot headless probes, server persistence/snapshot/combat tests, and client-server parity tests pass.

Automated verification covers all conditions above, including normal TH8 progression and TH8–TH9 server-authoritative combat. Remaining release checks are manual browser/touch observation and concurrent TH10/L10 behavior when TH10 is promoted.
