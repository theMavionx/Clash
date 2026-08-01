# Flamethrower Defense — Implemented Baseline

Status: implemented and automatically verified
Updated: 2026-08-01
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
- Normal project progression currently ends at TH7. The TH8–10 rules are data-ready and tested through fixtures; live acquisition becomes available when TH8 progression is enabled.

| Level | TH | HP | Damage per tick | Range | Gold | Wood | Ore |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 2600 | 58 | 1.20 | 18000 | 40000 | 34000 |
| 2 | 8 | 3350 | 78 | 1.28 | 26000 | 54000 | 45000 |
| 3 | 8 | 4250 | 105 | 1.36 | 36000 | 70000 | 58000 |
| 4 | 8 | 5300 | 137 | 1.44 | 48000 | 86000 | 72000 |
| 5 | 8 | 6500 | 172 | 1.52 | 63000 | 104000 | 87000 |
| 6 | 8 | 7850 | 210 | 1.60 | 80000 | 120000 | 101000 |
| 7 | 8 | 9300 | 250 | 1.68 | 98000 | 134000 | 115000 |
| 8 | 8 | 10900 | 295 | 1.78 | 118000 | 142000 | 126000 |
| 9 | 9 | 12650 | 345 | 1.86 | 142000 | 170000 | 150000 |
| 10 | 10 | 14600 | 400 | 1.95 | 170000 | 202000 | 180000 |

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
| Stream | 45 ticks |
| Damage pulses | stream offsets 0, 15, 30 |
| Full cycle | 90 ticks |

Each damage pulse hits all living ground targets whose centers are within the current level range and the fixed inclusive cone. Air targets are never eligible. The building does not rotate toward a selected target after placement.

Ward mitigation is applied to each pulse using ceiling rounding. Freeze immediately cancels future pulses from the active stream; cooldown timing remains absolute and is not restarted by a cancelled stream. Destruction also cancels the remaining stream, presentation, and audio.

## Presentation and Assets

- Ten model wrappers exist at `Model/Flamethrower/level_01` through `level_10`.
- Every wrapper exposes `SourceModel`, `MuzzleSocket`, and `FacingArrowSocket` with local negative Z as forward. The raw art's positive-Z barrel is normalized by a 180-degree rotation on `SourceModel` only; the wrapper root and sockets remain canonical.
- Fire presentation uses two persistent particle nodes: the Fire Dragon-profile plume and its pooled secondary trail. Dynamic attack lights and the full-range geometric core are disabled, so the attack never illuminates the ground. The stream uses the Dragon texture, additive billboard material, width, velocity, lifetime, particle density, and fade profile without allocating nodes per shot. The plume emits continuously only for the 45-tick Flamethrower stream.
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

Automated verification covers all conditions above. Remaining release checks are manual observation at multiple frame rates, browser/touch interaction, concurrent TH10 buildings, live L1-to-L10 model swaps, and normal TH8 progression once that progression exists.
