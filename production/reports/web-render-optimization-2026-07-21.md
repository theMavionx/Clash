# Web Render Optimization Report - 2026-07-21

## Scope

- Target: preserve the island presentation and reach a stable browser frame rate on a fully built TH5 base.
- Preserved: all 3D animations, tentacle idle motion, ship motion and turning, turret/defense behavior, troop visuals, custom flags, and animated water.
- Excluded from batching: skeletons, animated tracks, ships, sails, flags, tentacles, turrets, cannons, barrels, archers, mages, mortars, projectiles, and the minecart.
- Not changed: attack API, replay payload, deployment validation, damage formulas, targeting, server battle resolution, and UI icons.

## Measurements

Controlled Web run: one browser game tab, TH5 fixture with 27 buildings, `godot_pixel_ratio=1`, 1280x720 capture viewport.

| Metric | Baseline | Optimized |
| --- | ---: | ---: |
| Steady FPS | about 4 | 59-60 |
| Draw calls | about 1,392 | 308-312 |
| Home warmup | about 24 s | 2.8 s |
| Physics time | not instrumented | 0.5-0.6 ms |
| Navigation time | not instrumented | 0.1 ms |

The final ten browser samples remained at 59-60 FPS. Results apply to the controlled viewport; a separate device matrix is still required before making a universal 1080p/4K guarantee.

## Implementation

- Added a Web-only render profile. Native/editor rendering remains unchanged.
- Replaced the expensive Web water material with a lightweight animated shader and capped the Web water plane to 24x24 subdivisions.
- Disabled Web shadows, glow, SSAO, and SSIL.
- Converted compatible materials to vertex lighting in the Web profile.
- Baked static island and building geometry while retaining dynamic child nodes.
- Combined repeated baked building meshes with `MultiMeshInstance3D`; transforms and visibility remain synchronized with their original gameplay roots.
- Limited visual `AnimationPlayer` sampling to 20 Hz while advancing by real elapsed time. Animation duration, loops, method-track timing, and `animation_finished` behavior remain time-correct and independent of render FPS.
- Added hidden browser performance telemetry and local-only controls for repeatable profiling.

## Geometry Audit

- Island: 114 meshes / 205 surfaces -> 11 surfaces, 50,234 triangles preserved.
- Archer tower L1: 33 -> 9 surfaces, 2,816 triangles preserved.
- Archer tower L2: 39 -> 10 surfaces, 3,204 triangles preserved.
- Archer tower L3: 55 -> 12 surfaces, 3,808 triangles preserved.
- Archer tower L4: 58 -> 15 surfaces, 4,160 triangles preserved.
- Archer tower L5: 60 -> 17 surfaces, 4,264 triangles preserved.
- Town Halls, Mine, Barn, Sawmill, and Storage received static batches; flags and minecart remain separate.
- Full inventory: 40 model scenes, 347 meshes, 540 surfaces, 149 animations, 8 animated meshes, 51 named dynamic meshes, 290 static candidates.

## Verification

- `npm --prefix web run build`: passed.
- Web export: passed; 296 resource references packaged.
- `animation_budget_smoke.gd`: passed at simulated 15, 30, 60, and 120 render FPS; one-shot completion signal fired exactly once in every run.
- `static_multimesh_smoke.gd`: passed; grouped instances survived transform, visibility, and deletion changes.
- Archer tower combat: 25 damage at both fixed 15 FPS and fixed 120 FPS; result and state matched.
- Single-ship rendered flow: home, approach, broadside arrival, and all five troop deployments captured successfully.
- Browser runtime: no `SCRIPT ERROR`, freed-instance, signature, or runtime errors in the final run.
- Final runtime logs confirmed three animated island tentacles, 20 Hz animation budget, lightweight water, static batches, and four MultiMesh groups with 14 instances.

## Captures

- `%APPDATA%/Godot/app_userdata/Clash of Perps/single_ship_combat/01-home.png`
- `%APPDATA%/Godot/app_userdata/Clash of Perps/single_ship_combat/02-approach.png`
- `%APPDATA%/Godot/app_userdata/Clash of Perps/single_ship_combat/03-ready.png`
- `%APPDATA%/Godot/app_userdata/Clash of Perps/single_ship_combat/04-deployed.png`

## Remaining Risk

- Web 3D animation is visually sampled at 20 Hz. Animation time and gameplay callbacks are preserved, but very fast purely visual motion can appear less fluid than native 60 Hz sampling.
- Headless test processes report the project's pre-existing loading audio resource warning during shutdown; the Godot process exits successfully and the warning does not occur as a runtime gameplay error.
- Existing duplicate UID warnings under `relaunch/public` and `relaunch/dist` remain unrelated to this change.
