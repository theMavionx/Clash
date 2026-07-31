# Harpoon Defense — Phase 5 QA Report

- **Date:** 2026-07-31
- **Build:** `86b831766782e2b18773671cfcec77258e131577` (`86b83176 fix: settle battle casualties once and add harpoon prototype`), plus uncommitted Harpoon Phase 5 worktree changes
- **Platform:** Windows, Godot `4.6.stable.official.89cea1439`; rendered scene used AMD Radeon Graphics / OpenGL 3.3 Compatibility
- **Scope:** Harpoon combat, TH6/TH7 progression, client/server parity, Freeze and regressions, client contract, rendered presentation, Fire Dragon presentation regression, performance, web bundle, and audio lifecycle.

## Verdict

**PASS — gameplay, progression, deployment-zone spawn facing, persistent last-target heading, visual presentation, performance, web bundle, and Harpoon audio lifecycle checks pass.**

BUG-HARPOON-001 was fixed and revalidated against the current `scripts/tower_harpoon.gd`: `_exit_tree()` now suppresses audio before cleanup, and playback is guarded by both tower and player scene-tree state. The only remaining Godot shutdown warning is a pre-existing `AudioManager` resource reference, not Harpoon.

BUG-HARPOON-002 (zero-scale construction spawn) was also fixed and revalidated. The visual wrapper now binds its imported hierarchy in Harpoon-local space, avoiding inversion of the zero-scale construction parent transform.

BUG-HARPOON-003 (outward/default spawn facing) was reworked after owner follow-up. Each Harpoon now resolves the real `AttackSystem/shipPlane` troop deployment center, waits through a zero-scale construction spawn until aiming is transform-safe, yields to a valid air target, and preserves the last combat heading after tracking instead of returning home.

## Owner Facing Follow-up

The earlier inward-idle-return contract in this report is superseded by the owner's later
direction. Spawn yaw now resolves the actual `AttackSystem/shipPlane` troop deployment center,
waits until the zero-scale construction transform becomes invertible, and applies once. After a
valid air target owns yaw, target loss, retract, reload, ready, Freeze recovery, and upgrades
preserve the latest combat heading; targetless tracking no longer rotates the upper assembly
back to a home angle. The focused client probe covers zero-scale recovery and 90 targetless
simulation ticks with no heading drift.

## Executed Checks

| Area | Command / check | Result | Evidence |
|---|---|---|---|
| Server Harpoon combat | `node server/test-harpoon-combat.js` | PASS | L1 pull 45 ticks, L2 pull 48 ticks, cadence 420 ticks, Ward L2 damage 161; Freeze release at tick 99. Ground-only, reservation/tie, inside-ring, forged-event, destroy, and legacy-snapshot cases passed. |
| TH6 progression | `node server/test-th6-progression.js` | PASS | Exactly one L1 Harpoon at TH6; no unrelated progression break. |
| TH7 progression | `node server/test-th7-progression.js` | PASS | Harpoon reaches L2; reported TH7 capacity 143,000 and authored cost validation passed. |
| Client/server parity | `node server/test-client-server-combat-parity.js` | PASS | Harpoon levels 1–2 stats and constants match server contract. |
| Freeze regression | `node server/test-ice-golem-combat.js` | PASS | Harpoon participates in Freeze allowlist and releases active control correctly. |
| Related progression/bot regressions | `node server/test-building-cost-progression.js`; `node server/test-raid-bot-pool.js` | PASS | Cost curve and TH6/TH7 raid layouts, including one Harpoon where required, passed. |
| Godot client contract | `Godot_v4.6-stable_win64_console.exe --headless --path . -s res://scripts/tests/harpoon_client_probe.gd` | PASS | `HARPOON_CLIENT_PROBE_PASS fires=[28, 448] air_hp=720 distance=0.600`; assertions cover zero-scale spawn facing, air-target override, 90 targetless ticks with zero heading drift, upgrade/ready heading retention, and clean audio teardown. |
| Audio teardown revalidation | `Godot_v4.6-stable_win64_console.exe --headless --verbose --path . -s res://scripts/tests/harpoon_client_probe.gd` | PASS | No `Playback can only happen when a node is inside the scene tree` or Harpoon `get_global_transform` error. The sole remaining resource warning identifies `res://Musik/base/loading_the_game.mp3 (AudioStreamMP3)`, loaded by autoloaded `AudioManager`. |
| Harpoon performance | `Godot_v4.6-stable_win64_console.exe --headless --path . -s res://tools/perf/harpoon_defense_probe.gd` | PASS | 85 nodes, 8,814 authored / 9,486 visible triangles, one persistent projectile + rope, 0 physics bodies/areas/joints, 0 endpoint/base drift, 78.14 us/frame (under 500 us budget). |
| Zero-scale spawn regression | `Godot_v4.6-stable_win64_console.exe --headless --path . -s res://tools/perf/harpoon_defense_probe.gd` | PASS | `ready_aabb_size` and `zero_scale_spawn_aabb_size` are identical: `(0.377334, 0.307656, 0.257221)`. No zero-determinant transform error occurred. |
| TestMain progression + spawn facing | `Godot_v4.6-stable_win64_console.exe --headless --path . res://scenes/TestMain.tscn -- --verify-harpoon-main-scene` | PASS | Real max-village construction reports TH6 L1 and TH7 L2, each with static-mesh span `0.202` and inward-facing error `0.000°`; TH7 explicitly resets to L1 then runs the L1→L2 upgrade sequence. |
| Retract presentation regression | `Godot_v4.6-stable_win64_console.exe --headless --path . res://scenes/tests/HarpoonCombatTest.tscn -- --automated` | PASS | Full sequence still observes aim, launch, flight, hook, pull, ring, retract, reload, and ready; retract occurs at `2.1833 s`, final dragon distance remains `0.600`. |
| Rendered Harpoon + Fire Dragon scene | `Godot_v4.6-stable_win64_console.exe --path . res://scenes/tests/HarpoonCombatTest.tscn -- --automated --capture` | PASS | OpenGL renderer captured aim, launch, flight, hook, pull, ring, retract, reload, ready. Final dragon distance `0.600`; ground control static; ready at `7.5333 s`. |
| Fire Dragon model regression | `Godot_v4.6-stable_win64_console.exe --headless --path . -s res://tools/perf/fire_dragon_persistent_model_probe.gd` | PASS | Persistent model and 72-bone skeleton retained across idle, movement, attack, damage, and death clips. |
| Web production build | `npm run build` from `web/` | PASS | Vite build completed; bundled `harpoon-BnqKg1rA.png` at 101.95 kB. Pre-existing large-chunk advisory remains, unrelated to Harpoon. |

## Visual Inspection

Inspected rendered Phase 5 captures in `artifacts/harpoon-defense-frames/` (aim, hook, pull, stop-ring, retract) against the GDD.

- The turret base remains static while the upper assembly aims.
- The projectile/rope is readable through hook and pull; the dragon moves inward without moving the ground control target.
- The stop ring remains visible and final separation is exactly 0.600, matching the contract.
- Retract removes the rope and returns the projectile visual without an observed visual artifact.
- Inspected `artifacts/harpoon-main-scene/harpoon_th6_l1.png` and `harpoon_th7_l2.png`: both real TestMain captures show a fully rendered Harpoon at its expected level, with no collapsed/zero-scale geometry.
- Inspected `artifacts/harpoon-main-scene/harpoon_spawn_facing_attack_zone.png`: the edge-spawned Harpoon visibly faces away from the island rim and into the open attack/combat area. The capture is consistent with the verifier's `0.000°` measured error.

## Bug Report

- **ID:** BUG-HARPOON-001
- **Title:** Harpoon teardown plays interruption audio after its node leaves the scene tree
- **Severity:** S3
- **Frequency:** Always in the focused client teardown fixture while the Harpoon has active control
- **Build:** `86b83176` plus current Harpoon Phase 5 worktree changes
- **Platform:** Windows / Godot 4.6.1
- **Status:** Resolved and revalidated on 2026-07-31

### Steps to Reproduce

1. From the repository root, run: `Godot_v4.6-stable_win64_console.exe --headless --path . -s res://scripts/tests/harpoon_client_probe.gd`.
2. Allow the probe to complete its active-control scenarios and free its fixture.
3. Inspect the Godot console output during `_exit_tree()` / `cleanup_defense_visuals()`.

### Expected Behavior

Scene exit and defense cleanup stop every Harpoon voice, clear audio state, and emit no teardown sound. This is required by `design/audio/harpoon-defense-audio.md` acceptance check 10 and its explicit cleanup contract.

### Original Actual Behavior

The probe prints `HARPOON_CLIENT_PROBE_PASS`, but cleanup routes through `_interrupt_active_control("building_disabled")` and `_play_interruption_sfx()` after the tower has left the scene tree. Godot emits:

```text
ERROR: Condition "!is_inside_tree()" is true. Returning: Transform3D()
  at: get_global_transform
  _configure_and_play_sfx (res://scripts/tower_harpoon.gd:611)
ERROR: Playback can only happen when a node is inside the scene tree
  at: play_basic
  _configure_and_play_sfx (res://scripts/tower_harpoon.gd:612)
```

The same original run also reported one resource still in use and ObjectDB leak warnings at Godot shutdown.

### Additional Context

The original affected path was `scripts/tower_harpoon.gd`, specifically `cleanup_defense_visuals()` / `_exit_tree()` → `_interrupt_active_control()` → `_play_interruption_sfx()` → `_configure_and_play_sfx()`. The current implementation sets `_suppress_audio` before exit cleanup and returns early from `_configure_and_play_sfx()` unless both the tower and player are inside the scene tree.

### Revalidation Evidence

The focused client probe now exits with code 0 and prints only `HARPOON_CLIENT_PROBE_PASS fires=[28, 448] air_hp=720 distance=0.600`; neither original Harpoon engine error recurs. A verbose rerun attributes the remaining shutdown reference exactly to `res://Musik/base/loading_the_game.mp3 (AudioStreamMP3)`, which is the `AudioManager` loading track declared in `scripts/audio_manager.gd`, rather than a Harpoon audio stream.

## Bug Report

- **ID:** BUG-HARPOON-002
- **Title:** Harpoon visual hierarchy fails to spawn under a zero-scale construction parent
- **Severity:** S2
- **Frequency:** Always under the construction scale-zero spawn path before the fix
- **Build:** Current Harpoon Phase 5 worktree
- **Platform:** Windows / Godot 4.6.1
- **Status:** Resolved and revalidated on 2026-07-31

### Steps to Reproduce

1. Spawn a Harpoon through TestMain's normal building construction path, where the building root begins at zero scale.
2. Allow `Model/Harpoon/harpoon_defense_visual.gd` to bind/reparent its imported visual hierarchy.
3. Observe the Godot error at the previous global-transform-preserving reparent operation.

### Expected Behavior

The Harpoon visual hierarchy should bind successfully while its construction parent is zero scale, then render at the normal authored footprint. A real TH6 spawn must be L1; a TH7 spawn must support the normal L1→L2 upgrade sequence.

### Original Actual Behavior

Godot reported `harpoon_defense_visual.gd:278 Condition det == 0`, caused by a global-transform-preserving hierarchy operation attempting to invert the zero-scale construction ancestor. The visual could fail to appear correctly in TestMain.

### Revalidation Evidence

The performance probe reports matching normal and zero-scale-spawn AABBs, both `(0.377334, 0.307656, 0.257221)`. The TestMain verifier exits successfully with:

```text
[HARPOON_MAIN_SCENE] TH6 L1 span=0.202 node_scale=(1.0, 1.0, 1.0)
[HARPOON_MAIN_SCENE] TH7 L2 span=0.202 node_scale=(1.0, 1.0, 1.0)
[HARPOON_MAIN_SCENE] PASS th6=L1 th7=L2 zero_scale_spawn=visible
```

The resolution uses Harpoon-local transform capture/rebuild, avoiding any inverse of the zero-scale ancestor. The TestMain run emitted unrelated Cannon hierarchy warnings and generic shutdown resource warnings, but neither causes this Harpoon verifier to fail.

## Bug Report

- **ID:** BUG-HARPOON-003
- **Title:** Harpoon initially faces away from the attack area instead of inward
- **Severity:** S3
- **Frequency:** Always for affected edge placements before the correction
- **Build:** Current Harpoon Phase 5 worktree
- **Platform:** Windows / Godot 4.6.1
- **Status:** Resolved and revalidated on 2026-07-31

### Steps to Reproduce

1. Spawn a Harpoon near the outer edge of the main grid through the normal zero-scale construction path.
2. Wait for the construction scale tween to make the model visible without providing an air target.
3. Observe the upper assembly's initial/idle direction, then introduce and remove a valid air target.

### Expected Behavior

At spawn, the Harpoon faces the real troop deployment center (`AttackSystem/shipPlane`) within 2°. A valid air target overrides that one-time heading. After the target/control sequence ends, the assembly keeps its latest combat angle through retract, reload, and ready.

### Original Actual Behavior

The visual used its imported/default yaw at spawn, so edge-placed Harpoons could face outward, away from the attack area, until combat targeting rotated them.

### Revalidation Evidence

The focused client probe passes explicit assertions for construction-scale spawn facing, air-target override, and persistent heading after 90 targetless simulation ticks. The real TestMain progression verifier's facing assertion now compares against `shipPlane` rather than the defended building-grid center.

```text
[HARPOON_MAIN_SCENE] TH6 L1 span=0.202 facing_error_deg=0.000 node_scale=(1.0, 1.0, 1.0)
[HARPOON_MAIN_SCENE] TH7 L2 span=0.202 facing_error_deg=0.000 node_scale=(1.0, 1.0, 1.0)
[HARPOON_MAIN_SCENE] PASS th6=L1 th7=L2 zero_scale_spawn=visible
```

The zero-scale performance probe still produces identical normal/spawn AABBs and no determinant error. Targetless runtime no longer writes yaw at all; the automated combat scene independently observes the full retract state and reaches reload/ready with its targeting angle preserved.

## Remaining Risk / Unrun Checks

- No full local player-vs-player session was run; the highest practical coverage here is deterministic server replay plus the Godot client, rendered-scene, real TestMain construction/upgrade flow, and performance probes.
- Perceptual audio mix/readability (spatial attenuation, masking against live Fire Dragon attacks, and Freeze-ready deferral) still needs a human listening pass on a full local battle, but no automated Harpoon audio lifecycle blocker remains.
- The web build emitted existing >500 kB chunk advisories; build succeeds and this is not introduced by the Harpoon asset.

## Files Reviewed

- `design/gdd/harpoon-defense.md`
- `design/audio/harpoon-defense-audio.md`
- `scripts/tower_harpoon.gd`, `scripts/base_troop.gd`, `scripts/combat_freeze.gd`
- `Model/Harpoon/`, `scenes/tests/HarpoonCombatTest.tscn`, `scripts/tests/harpoon_client_probe.gd`, `tools/tests/harpoon_combat_probe.gd`, `tools/perf/harpoon_defense_probe.gd`
- Server combat, progression, parity, bot-layout integrations; building-system and web Harpoon integrations.
