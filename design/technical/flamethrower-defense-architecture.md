# Flamethrower Defense — Technical Architecture

Status: implementation-ready architecture for the approved Phase 2 design. This document does not authorize production implementation by itself.

Design source: `design/gdd/flamethrower-defense.md` (canonical Phase 1 GDD; reviewed from its SHA-verified recovery copy while concurrent branch work had removed the repository copy).

Engine/runtime: Godot 4.6.1, GDScript client, Node.js + SQLite authoritative backend, 60 Hz deterministic combat verifier.

## 1. Locked decisions and boundaries

The implementation must preserve these approved choices without reinterpretation:

- Canonical building key: `flamethrower`.
- Fixed 3x3 square footprint. Rotation never changes occupied cells, collision, or pathing.
- Ground-only defense. It never damages buildings, allies, skeleton guards, air units, dead units, or units that are not currently defense-targetable.
- Fixed saved facing: 24 steps, 15 degrees per step, step 0 at world `-Z`, increasing clockwise. The whole building root rotates; there is no tracking barrel or combat-time yaw.
- Inclusive 50-degree cone (25-degree half-angle), center-to-center geometry, no line of sight, no target-radius inflation, no target cap.
- 60 Hz cadence: scan every 9 ticks, prime for 18 ticks, stream for 45 ticks, damage at offsets 0/15/30, next stream ready at start + 90 ticks.
- TH8 unlock; one copy through TH9 and two at TH10. Maximum levels: L8 at TH8, L9 at TH9, L10 at TH10.
- Level values are exactly those in the GDD. Levels change HP, damage, range, cost, and model only; cadence and cone never scale.
- `AirBombBase.rar` and every asset inside it are outside this feature and must not be imported, copied, referenced, or modified.

This feature does not add burn, slow, stun, knockback, falloff, obstruction, target locking, autonomous rotation, per-target beams, or networking authority to Godot. Any such change is a new design/replay version and requires owner approval.

## 2. Architecture decision

Use one versioned, data-driven rules document; persist facing and layout revision in SQLite; capture an immutable server-authored combat snapshot when a target is reserved; implement the same pure cone/state rules in Node and Godot; make Node replay verification the only reward authority.

The important split is:

| Layer | Owns | Must not own |
|---|---|---|
| Shared config | Version, 24 vectors, cadence, cone constant, levels, progression gates | Runtime state |
| SQLite/home server | Existence, ownership, level, grid, facing, layout revision | Client preview angle |
| Battle-session snapshot | Immutable defender buildings, facing, ward, rules version | Later home edits |
| Node combat verifier | Eligibility, state transitions, tick membership, damage, deaths, result | Client hit reports/VFX |
| Godot combat mirror | Responsive local HP prediction, timing, presentation hooks | Accepted rewards or angle authoring during battle |
| React/Godot editor | Preview and requested step | Canonical persistence before acknowledgement |

This is slightly more work than adding another tower directly to `building_system.gd`, but it prevents the three high-risk failure modes in the current architecture: server/client tuning drift, combat result verification against a defender's later live layout, and visual rotation accidentally becoming combat authority.

## 3. Canonical data contract

### 3.1 Single designer-owned file

Add `shared/gameplay/flamethrower-defense.v1.json` as the only hand-edited source for all Flamethrower numeric gameplay values. Both runtimes load and validate it once at startup:

- Node: `server/flamethrower_config.js` loads the JSON, validates it, freezes the exported objects, and exposes adapters used by `db.js`, `combat_defs.js`, and `combat_session.js`.
- Godot: `scripts/flamethrower_config.gd` loads the same JSON with `FileAccess`/`JSON`, validates all required fields and types, caches typed values/vectors, and fails feature registration with an explicit diagnostic if invalid.
- `export_presets.cfg` explicitly includes this one JSON path in web/native exports. `scenes/export_manifest.tscn` additionally references the scripts/scenes/materials used by the feature.
- `server/test-client-server-combat-parity.js` verifies the file hash/rules version and the values exposed by both adapters. No second hand-maintained level table is permitted.

Minimum top-level shape:

```json
{
  "schema_version": 1,
  "combat_rules_version": "flamethrower-v1",
  "facing_table_version": 1,
  "building": {
    "id": "flamethrower",
    "footprint": [3, 3],
    "unlock_th": 8,
    "max_count_by_th": [0, 0, 0, 0, 0, 0, 0, 1, 1, 2],
    "max_level_by_th": [1, 1, 1, 1, 1, 1, 1, 8, 9, 10]
  },
  "combat": {
    "tick_rate": 60,
    "scan_ticks": 9,
    "prime_ticks": 18,
    "stream_ticks": 45,
    "damage_offsets": [0, 15, 30],
    "cycle_ticks": 90,
    "full_cone_degrees": 50,
    "half_angle_cos_sq": 0.821393805,
    "center_epsilon": 0.000001
  },
  "facing_vectors_xz": [
    [0.0, -1.0], [0.258819045, -0.965925826], [0.5, -0.866025404],
    [0.707106781, -0.707106781], [0.866025404, -0.5], [0.965925826, -0.258819045],
    [1.0, 0.0], [0.965925826, 0.258819045], [0.866025404, 0.5],
    [0.707106781, 0.707106781], [0.5, 0.866025404], [0.258819045, 0.965925826],
    [0.0, 1.0], [-0.258819045, 0.965925826], [-0.5, 0.866025404],
    [-0.707106781, 0.707106781], [-0.866025404, 0.5], [-0.965925826, 0.258819045],
    [-1.0, 0.0], [-0.965925826, -0.258819045], [-0.866025404, -0.5],
    [-0.707106781, -0.707106781], [-0.5, -0.866025404], [-0.258819045, -0.965925826]
  ]
}
```

The file also contains the ten exact level rows:

| L | TH | HP | Damage/tick | Range | Gold | Wood | Ore |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 8 | 2,600 | 58 | 1.20 | 18,000 | 40,000 | 34,000 |
| 2 | 8 | 3,350 | 78 | 1.28 | 26,000 | 54,000 | 45,000 |
| 3 | 8 | 4,250 | 105 | 1.36 | 36,000 | 70,000 | 58,000 |
| 4 | 8 | 5,300 | 137 | 1.44 | 48,000 | 86,000 | 72,000 |
| 5 | 8 | 6,500 | 172 | 1.52 | 63,000 | 104,000 | 87,000 |
| 6 | 8 | 7,850 | 210 | 1.60 | 80,000 | 120,000 | 101,000 |
| 7 | 8 | 9,300 | 250 | 1.68 | 98,000 | 134,000 | 115,000 |
| 8 | 8 | 10,900 | 295 | 1.78 | 118,000 | 142,000 | 126,000 |
| 9 | 9 | 12,650 | 345 | 1.86 | 142,000 | 170,000 | 150,000 |
| 10 | 10 | 14,600 | 400 | 1.95 | 170,000 | 202,000 | 180,000 |

L1 is the construction price; later rows are the cost to enter that level. The config validator requires exactly 10 rows, monotonically increasing levels, 24 finite unit vectors, legal tick offsets, and the approved progression arrays. Startup must not silently substitute fallback combat numbers.

### 3.2 Pure shared concepts

The two runtime adapters expose equivalent operations, tested with common fixtures:

- `is_valid_facing_step(value)` — integer and `0 <= value < 24`; never clamps external input.
- `forward_for_step(step)` — table lookup only, never runtime trigonometry.
- `nearest_step_toward(building_center, approach_center)` — deterministic dot-product maximum; ties choose the lowest step.
- `is_point_in_cone(center, forward, range, target_center)` — the exact squared comparison below.
- `level_stats(level)` — validated row lookup.

Cone membership in XZ is:

```text
V = target_center - building_center
d2 = dot(V, V)
inside if d2 <= epsilon^2
outside if d2 > range^2
q = dot(V, forward)
outside if q <= 0
inside if q*q >= d2*0.821393805
```

Both radial and angular boundaries are inclusive. The center case is resolved before checking `q`, so zero-length normalization never occurs.

## 4. Persistence and layout concurrency

### 4.1 Safe SQLite migration

Extend the existing idempotent migration section in `server/db.js`:

```sql
ALTER TABLE buildings
  ADD COLUMN facing_step INTEGER
  CHECK (facing_step IS NULL OR (facing_step >= 0 AND facing_step < 24));

ALTER TABLE players
  ADD COLUMN layout_revision INTEGER NOT NULL DEFAULT 0;

ALTER TABLE battle_sessions ADD COLUMN combat_snapshot_json TEXT;
ALTER TABLE battle_sessions ADD COLUMN combat_snapshot_version INTEGER;
ALTER TABLE battle_sessions ADD COLUMN layout_revision INTEGER;
ALTER TABLE battle_sessions ADD COLUMN combat_rules_version TEXT;
```

Existing non-Flamethrower rows keep `NULL`. Every newly placed or migrated Flamethrower must have a valid integer. Application validation remains mandatory because SQLite typing/coercion alone is not a sufficient API boundary.

`layout_revision` is the monotonic version of all attack-relevant home layout state. Place, move, remove, upgrade completion, and facing confirmation update the building and increment the player revision in one transaction. Collection, repair, resource changes, and purely cosmetic state do not increment it. A route returns the new revision with the changed building.

### 4.2 Default and legacy facing

- New placement may omit `facing_step`; only then the server computes the nearest step toward the authoritative attack-approach center for that grid and records source `default`.
- A placement-supplied or edit-supplied step must be an integer in range. Invalid input is HTTP 400, not normalized.
- A new-format Flamethrower row/snapshot with missing facing is invalid and is not matchable/verifiable.
- A versioned legacy Flamethrower row may be migrated once by the server toward the approach center inside a transaction, incrementing layout revision and emitting `flamethrower_legacy_facing_defaulted`. There is no general `NULL -> 0` fallback.
- Upgrade/model replacement copies the exact integer. It never recomputes the default.

### 4.3 Home API

Preserve current routes and add a narrow orientation command:

| Endpoint | Request change | Response/validation |
|---|---|---|
| `GET /buildings` | none | Top-level `layout_revision`; every Flame includes `facing_step` and `facing_table_version` |
| `POST /buildings/place` | add optional `facing_step`, required `expected_layout_revision` once the client has revision support | Echo canonical `facing_step`, `facing_source`, and new `layout_revision` |
| `POST /buildings/:id/move` | add `expected_layout_revision` | Position changes, facing stays exact, new revision returned |
| `POST /buildings/:id/upgrade` | add `expected_layout_revision` | Upgrade preserves facing and returns new revision |
| `DELETE /buildings/:id` | accept expected revision through an `If-Match`/body-compatible adapter | New revision returned |
| `POST /buildings/:id/facing` | `{facing_step, expected_layout_revision, method}` | Ownership/type/edit-state/step/revision validated; echo old/new and revision |

Use the existing POST command style for `/facing` rather than introducing one isolated PATCH convention. `method` is an allowlisted telemetry label (`step_left`, `step_right`, `drag_snap`, `reset`, `admin`, `migration`), never a behavior switch.

Stale expected revision returns HTTP 409 with `{code: "layout_revision_conflict", layout_revision, buildings}` so the client can discard its preview and reload canonical state. Editing is rejected while that home layout is locked by an incompatible operation. Client optimistic rotation is preview-only until the acknowledgement arrives.

DB methods in `server/db.js` become transactional commands rather than unrelated statement calls:

- `placeBuilding(playerId, type, gridX, gridZ, gridIndex, facingStep, expectedRevision)`
- `moveBuilding(playerId, buildingId, gridX, gridZ, gridIndex, expectedRevision)`
- `upgradeBuilding(playerId, buildingId, expectedRevision)`
- `removeBuilding(playerId, buildingId, expectedRevision)`
- `setBuildingFacing(playerId, buildingId, facingStep, expectedRevision, method)`

The transaction re-reads player revision and target row, performs existing cost/footprint/count/unlock checks, mutates, increments revision, and returns a complete canonical row. No websocket/admin/MCP path may update `buildings.facing_step` directly; they call the same command.

## 5. Immutable battle snapshot and replay authority

### 5.1 Current gap being corrected

The current `/attack/result` path reloads `db.getPlayerBuildings(defender_id)` and current Altar levels at submission time. That is insufficient for directional defenses: a defender can rotate, move, or upgrade after matchmaking, changing verification of an already-started attack.

Introduce `server/combat_snapshot.js` and a single `createCombatSnapshot(defenderId)` boundary. All target-acquisition paths — `findEnemy`, `findRankedEnemy`, `findEnemyByName`, and `startRevengeBattle` — must capture and store the same immutable snapshot used in the match response. Session creation and snapshot persistence occur in one DB transaction after reservation checks.

Snapshot schema:

```json
{
  "schema_version": 2,
  "defender_id": "...",
  "created_at": "...",
  "layout_revision": 42,
  "combat_rules_version": "flamethrower-v1",
  "facing_table_version": 1,
  "altar_levels": {"ward": 0},
  "buildings": [
    {
      "id": 123,
      "type": "flamethrower",
      "level": 8,
      "grid_x": 4,
      "grid_z": 7,
      "grid_index": 0,
      "hp": 10900,
      "max_hp": 10900,
      "facing_step": 5
    }
  ]
}
```

Buildings are sorted by existing stable building order/id before serialization. Only combat-relevant fields are included. The server derives all stats from the snapshot's rules version and building level; it never accepts client-provided range, damage, vectors, or ward.

Match responses expose `session_id`, `combat_snapshot_version`, `combat_rules_version`, `layout_revision`, and the snapshot building list. `/attack/result` loads `battle_sessions.combat_snapshot_json`, validates its schema/version/hash, and passes its buildings and stored Altar levels to `verifyReplay`. It must not re-read the live defender base for new sessions.

After verification, `battle_replays.buildings_snapshot` stores the exact session building list and `sim_debug` stores the rules/snapshot versions. Replays therefore remain stable after home edits. Old sessions/replays without Flamethrower continue through the existing legacy verifier. A legacy path may never accept a snapshot containing `flamethrower`; missing/unknown new snapshot data is a deterministic rejection, not a live-data fallback.

Snapshot creation should be reusable by bot and tournament matchmaking. Tests must assert every target acquisition route stores a snapshot and that rotating/upgrading/removing the live Flame after reservation cannot alter verification.

## 6. Authoritative combat implementation

### 6.1 Server object and phase order

`server/combat_session.js` creates a sorted `flamethrowers` array from active snapshot buildings. Each entry contains immutable identity/geometry and explicit state:

```text
buildingId, buildingOrder, level, centerXZ, facingStep, forwardXZ,
range, baseTickDamage, state,
nextScanTick, primeStartTick, primeReadyTick,
streamStartTick, streamEndTick, nextStreamReadyTick,
resolvedDamageMask, uniqueTargets, streamDamage, streamKills,
frozenUntilTick, permanentlyDisabled
```

Run `updateFlamethrowerDefenses(combatTick, aliveTroops)` once per fixed tick after trap/mortar/Air Bomb resolution and before ordinary projectile/generic-defense firing. This gives it a named deterministic slot and preserves the current rule that damage already resolved earlier in a tick stands if troops destroy the building later in that tick. If the Town Hall victory guard has ended combat, this phase is never entered.

Add `flamethrower` to the server and Godot Ice Golem/Freeze defense allowlists. Convert a Freeze end time to an absolute Flame `frozenUntilTick` once; cadence is never accumulated from render delta.

### 6.2 Explicit transition table

The implementation uses an enum and a checked transition function; direct state assignment outside initialization/transition is disallowed.

| From | Condition | To | Side effects |
|---|---|---|---|
| Inactive | build/upgrade completes before battle snapshot | Ready | initialize scan tick |
| Ready/Scanning | scan due and cone occupied | Priming | `primeStart=t`, `primeReady=t+18` |
| Ready/Scanning | destroyed/battle end | Disabled | cleanup |
| Cooldown/Scanning | `t >= nextReady-18`, scan due, occupied | Priming | may overlap final cooldown |
| Cooldown/Scanning | `t >= nextReady` and no prime | Ready/Scanning | scan schedule remains absolute |
| Priming | cone empty before start | Ready or Cooldown | no cycle spent |
| Priming | Freeze/destruction/end | Disabled or Ready/Cooldown | no cycle spent before stream |
| Priming | occupied and `t >= max(primeReady,nextReady)` | Firing | start stream; damage offset 0 resolves now |
| Firing | scheduled offset | Firing | snapshot eligible set and resolve one hit each |
| Firing | Freeze | Disabled/Cooldown | stop presentation/future ticks; keep next ready |
| Firing | stream end | Cooldown/Scanning or Ready | emit end summary |
| Any live | HP zero or battle end | Disabled | permanent for destruction/end |
| Freeze-disabled | thaw | Ready/Scanning or Cooldown/Scanning | fresh scan and prime required |

At battle start the defense is ready; its first scan is at the first defined Flame phase tick. A continuously occupied first scan starts an 18-tick prime, and offset 0 resolves on the exact prime-completion tick. A successful start sets `nextStreamReadyTick = streamStartTick + 90`. Pre-prime may begin only in the last 18 cooldown ticks, allowing but never beating the 90-tick start.

Priming checks occupancy every tick and is not target-locked. The original trigger can leave if another eligible unit remains. Empty prime cancellation spends no cooldown. Once firing begins, the stream lasts 45 ticks even if empty; empty scheduled ticks do nothing and never refund the cycle.

### 6.3 Eligibility and batched damage

At each scheduled offset, rebuild the eligible set from live troops:

1. Alive, hostile, active, currently defense-targetable.
2. Canonical target class is ground. Visual height/model does not matter.
3. Combat center passes the pure inclusive cone test.
4. Stable sort by `replayOrder`, then stable troop ID as a defensive tie-breaker.
5. Snapshot the full ordered set before applying any damage.
6. Apply exactly once to each snapshot member: `max(1, ceil(baseTickDamage * (1 + wardPct / 100)))`.
7. Resolve deaths in the same stable order. Any death summons enter the global troop registry only after this damage set and cannot be hit recursively on the same scheduled tick.

No physics overlap, mesh bound, muzzle transform, dictionary iteration, render frame, or client hit list participates. Mid-stream entrants can take later ticks; exits or ground-to-air transitions avoid later ticks; air-to-ground becomes eligible on the next scheduled tick.

Freeze before firing cancels prime without cooldown. Freeze after offset 0 prevents offsets 15/30, ends presentation, and preserves the already committed ready tick. Cooldown continues while frozen. Destruction before this phase prevents action; destruction after a resolved damage tick does not undo it. All cleanup hooks are idempotent.

### 6.4 Telemetry and trace

Emit the GDD event names from canonical transitions, not from particles:

- Layout: `flamethrower_placed`, `flamethrower_facing_changed`, `flamethrower_upgraded`.
- Combat: `flamethrower_prime_start`, `flamethrower_prime_cancel`, `flamethrower_stream_start`, `flamethrower_damage_tick`, `flamethrower_stream_end`.
- Migration: `flamethrower_legacy_facing_defaulted`.

Damage tick payloads contain ordered hit IDs/types, ordered kills, hit count, total damage, stream index/offset, and empty flag. Aggregate duty uptime, occupied/empty ticks, mean/max/unique targets, damage/kills by troop type, Freeze interruption, attack bearing relative to facing, and outcome. Do not log per-frame VFX/overlaps. Production sampling may reduce accepted combat-detail volume, but debug replays retain the deterministic trace needed for parity failures.

## 7. Godot gameplay mirror and scene lifecycle

### 7.1 Registration and loading

`scripts/building_system.gd` registers `flamethrower` through the config adapter with 3x3 cells, ten model scenes, HP/cost/range/tick damage, ground target type, ward support, TH gates, and maximum count 2. `_attach_building_defense_script` attaches `scripts/tower_flamethrower.gd` to the building root.

Building sync signatures and dictionaries include `facing_step` and `layout_revision`. On home/enemy/replay load:

1. Validate the step before instantiation.
2. Store it in the building dictionary/meta.
3. Rotate the complete building root to the table-defined yaw.
4. Instantiate the level wrapper below that root.
5. Pass level, ward, facing, battle lock, and replay/snapshot version to the tower script.

Model replacement during upgrade swaps only the visual wrapper. Root position/yaw and saved step are untouched. A missing `MuzzleSocket` is a content validation failure and a diagnostic VFX fallback, but combat remains center-based.

`scripts/tower_flamethrower.gd` implements a clear defense interface:

- `configure_from_building(building_data, combat_context)`
- `set_level(level)`
- `set_facing_step(step, allow_preview := false)`
- `set_ward_bonus_pct(pct)`
- `freeze_for(duration)` / `interrupt_stream(reason)`
- `disable_permanently(reason)`
- `cleanup_defense_visuals(reason)`
- `set_sector_visible(visible)`
- `get_debug_snapshot()`

It uses an enum/transition table matching Section 6 and a fixed 60 Hz accumulator with the project's existing bounded catch-up policy. Render FPS only advances presentation interpolation. In a live local raid it predicts HP/events for responsiveness, but the Node verifier reconstructs the accepted result from the immutable snapshot. Replay playback consumes recorded actions and the same rules version. Godot never sends angle, cone membership, or damage as authoritative result input.

`scripts/combat_freeze.gd` includes `flamethrower` in targetable/freezable defense IDs. `scripts/building_system.gd` calls `disable_permanently` before removing/destroying a Flame and calls cleanup on Town Hall victory, replay exit, scene exit, and model replacement.

### 7.2 Facing editor

Add `scripts/flamethrower_facing_editor.gd` as a presentation/controller component owned by `BuildingSystem`; it does not mutate persistence or combat state directly.

State flow:

```text
Idle
  -> PlacementCellLocked or ExistingBuildingSelected
  -> EditingPreview (step/drag/reset only changes preview root + sector)
  -> ConfirmPending (server request with expected revision)
  -> Acknowledged (apply canonical step) or Conflict (reload/restore canonical)
  -> Idle
```

For other building types, the existing click-to-place flow is unchanged. For Flamethrower, a valid grid click locks the 3x3 cell and enters orientation preview; it does not call `/buildings/place` until confirm. Cancel returns to the shop/placement state without spending resources. Existing-building cancel restores the persisted step exactly.

Input actions added to `project.godot` are rebindable: `flamethrower_rotate_left`, `flamethrower_rotate_right`, `flamethrower_facing_reset`, `flamethrower_facing_confirm`, and `flamethrower_facing_cancel`. Pointer/touch drag computes a preview bearing and snaps on release to the vector with the maximum dot product. Left/right wrap modulo 24. Reset recomputes the authoritative-grid approach default locally for preview; the server still validates/echoes the chosen step.

The editor draws one reusable sector mesh with exact range, 50-degree angle, radial edge, and centerline plus a facing arrow. The sector is selection/edit-only; the cool-blue arrow is hidden during an active stream so it cannot be confused with the warm flame plume. Geometry is generated once per level/range change, not every frame, and never provides combat membership.

### 7.3 React bridge and UI

Extend `scripts/js_bridge.gd` with typed commands/events:

- React -> Godot: `edit_flamethrower_facing`, `flamethrower_facing_step`, `flamethrower_facing_reset`, `flamethrower_facing_confirm`, `flamethrower_facing_cancel`.
- Godot -> React: `flamethrower_facing_editor` containing `{open, mode, building_id, preview_step, persisted_step, expected_layout_revision, pending, error}`.

Add this editor state to `web/src/hooks/useGodot.js` and mount `web/src/components/FlamethrowerFacingControls.jsx` from `GameUI.jsx`. The compact responsive control exposes left/right, reset, confirm, cancel and text such as `75° / step 5 of 24`; mouse/touch world dragging remains in Godot. Disable confirm while pending and surface 409 conflict without leaving a misleading angle on screen.

`BuildingInfoPanel.jsx` adds Ground, 50° cone, range, three ticks/0.75 s, 1.50 s cycle, current facing, and an owned-home-only **Edit Facing** action. Enemy/replay panels show facing but cannot edit. `ShopPanel.jsx` adds the defense card/thumbnail/unlock/3x3/cost information. `usePreloadPanelAssets.js` preloads the thumbnail. All values come from the server `building_defs` payload rather than duplicated UI constants.

`scripts/network_client.gd` extends existing placement/move/upgrade/remove calls with expected revision and adds `set_building_facing`. It updates cached revision only from successful canonical responses and triggers a full building reload on conflict.

## 8. Asset ingestion and visual wrappers

Import only the ten supplied Flamethrower GLBs and their legitimate maps from `C:\Users\Admin\Downloads\Flamethrowers (1).rar`. Nested archive mapping is intentional:

- `1-2.rar`: L1 and L2 GLBs; both share L1 base-color/roughness/metallic maps.
- `3.rar`, `4.rar`, `5.rar`: one GLB and base-color/roughness/metallic maps per level.
- `6.rar` through `10.rar`: one GLB and base-color/roughness maps; set metallic scalar to 0.0, do not fabricate missing metallic textures.
- `AirBombBase.rar`: excluded in full.

Normalize names under `Model/Flamethrower/level_01` through `level_10`, for example:

```text
Model/Flamethrower/level_01/flamethrower_l01.glb
Model/Flamethrower/level_01/flamethrower_l01_base_color.png
Model/Flamethrower/level_01/flamethrower_l01_roughness.png
Model/Flamethrower/level_01/flamethrower_l01_metallic.png
Model/Flamethrower/level_01/flamethrower_l01_material.tres
Model/Flamethrower/level_01/FlamethrowerL01.tscn
```

Each wrapper has a common contract:

```text
FlamethrowerVisual (Node3D; local gameplay forward = -Z)
├── SourceModel (GLB instance; uniform scale/offset plus art-only 180° yaw)
├── MuzzleSocket (Marker3D)
└── FacingArrowSocket (Marker3D, optional presentation anchor)
```

The wrapper is responsible for source-model normalization and socket location, never gameplay range/collision. Raw assets use visible barrel `+Z`, so every `SourceModel` applies an art-only 180-degree Y rotation while the wrapper root, `MuzzleSocket`, and `FacingArrowSocket` preserve gameplay `-Z`. The building root above it owns saved yaw, and `BuildingSystem` explicitly omits its legacy camera-facing yaw for this directional wrapper. Godot-generated `.import` metadata is committed after controlled import; no collision, physics body, navigation mesh, animation, or runtime mesh copy is generated. Each audited source remains one mesh and approximately 2,412–4,112 triangles with 512px maps. Add `web/src/assets/buildings/flamethrower.png` as a separately rendered thumbnail.

Add all wrappers, material resources, scripts, shared VFX resources, and the thumbnail dependency to `scenes/export_manifest.tscn`/web preload paths. The asset validator fails if a level is missing, L2 does not share L1 maps, L6–L10 reference a metallic texture, a socket is absent, the raw art `+Z` barrel is not normalized to wrapper `-Z`, or any path contains `AirBombBase`.

## 9. Reusable flame VFX and audio hooks

`scripts/fire_stream_vfx_pool.gd` implements a persistent per-tower presenter using the exact Fire Dragon breath texture and particle profile. Fire Dragon gameplay and its existing presenter remain untouched; Flamethrower copies the proven presentation constants rather than transferring Dragon targeting or damage logic.

Typed presenter API:

- `configure_length(visual_length)`
- `set_stream_active(active)`
- `interrupt(reason)`
- `get_pool_metrics()`

Each legal Flamethrower owns one two-child presenter for its full lifetime: primary plume and pooled secondary trail. Stream start restarts existing emitters; interruption hides them. No stream or damage pulse creates nodes or tweens. The 0.75-second plume begins at `MuzzleSocket`, follows fixed wrapper/root `-Z`, and uses continuous emission only to cover the fixed 45-tick stream. Exact gameplay range remains the sector edge.

Reuse the orange/yellow Fire Dragon texture, additive billboard material, beam-width formula, velocity, randomness, lifetime, and density profile: 46 desktop particles and 26 web particles. The raw geometric range cylinder and all dynamic attack lights are forbidden because they read as a laser/glow and illuminate the ground. Web uses CPU particles and desktop uses GPU particles; neither path creates lights.

The export manifest preloads all ten wrapper/material variants and the shared Fire Dragon breath texture. Hooks are separate for prime start/cancel, stream start, each damage tick, interruption, cooldown-ready, destruction, and battle end. Audio event selection/mixing remains an Audio Director/content task; gameplay code emits stable hooks and has no hardcoded clip paths.

## 10. Progression, bots, scoring, admin, and tools

- `server/db.js`: register `BUILDING_DEFS.flamethrower`, `TH_UNLOCK`, `TH_MAX_COUNT`, `TH_MAX_LEVEL`; include it in complete-village requirements so TH8->9 requires the available L8 Flame when TH8 ships.
- `scripts/building_system.gd`: expose the same progression from the shared adapter and surface it through the existing `building_defs`/TH info payloads.
- `server/combat_defs.js`: expose the adapter's defense rows and immutable cadence/rules object; do not retype numbers.
- `server/db.js::defensePowerForBuilding` and base-power/trophy scoring: add an explicit Flame contribution derived from three tick damage, 50% duty cadence, unlimited-area coefficient, range, HP, and facing coverage discount. Coefficients are tuning data and require a balance-check before release.
- `server/matchmaking_defs.js`, raid bot layout catalog/generator, max-village/admin builders, and any building catalog allowlists: preserve/provide legal `facing_step`. Bot facing must be explicit in generated data or deterministically defaulted at generation time, never randomized during a match.
- `server/mcp_server.js`/agent building tools and websocket mutations: add optional facing on placement, orientation command support, revision propagation, and call the same DB methods. Read-only catalogs expose angle/ground targeting.
- `server/routes.js` admin player/profile/base queries: include layout revision and facing. Admin placement/import validates or deterministically defaults facing; admin edits use the same command with method `admin`.
- `web/src/admin/AdminApp.jsx`: display Flame facing in the player building/base inspector and provide a 0–23 validated control only where building editing already exists. If the current admin surface remains read-only for buildings, no new mutation panel is required; correctness is provided by the shared server command/import path.
- `server/tools/combat_balance_report.js` and future TH8 balance fixtures: include directional coverage and ground/air archetype cohorts rather than treating Flame as omnidirectional DPS.

Town Hall is currently capped below TH8 in production data. Registering future L8–L10 rows must not silently make TH8 purchasable or alter current TH1–TH7 villages. Enable player availability only with the separately approved TH8 progression rollout. No TH8 bot layout should enter matchmaking before it passes legality and breakability gates.

## 11. File-level implementation plan

### New files

| File | Responsibility |
|---|---|
| `shared/gameplay/flamethrower-defense.v1.json` | Canonical tunable/progression/vector/rules data |
| `server/flamethrower_config.js` | Strict Node adapter/validator |
| `server/combat_snapshot.js` | Versioned immutable session snapshot construction/validation |
| `scripts/flamethrower_config.gd` | Strict Godot adapter/cache and pure cone helpers |
| `scripts/tower_flamethrower.gd` | Fixed-tick local mirror, explicit state machine, hooks |
| `scripts/flamethrower_facing_editor.gd` | Placement/edit preview controller and sector/arrow |
| `scripts/fire_stream_vfx_pool.gd` | Shared bounded Fire Dragon/Flamethrower presentation pool |
| `web/src/components/FlamethrowerFacingControls.jsx` | Responsive React facing controls |
| `Model/Flamethrower/level_01..level_10/*` | Normalized GLBs, maps, materials, wrappers |
| `web/src/assets/buildings/flamethrower.png` | Shop/info thumbnail |
| `server/test-flamethrower-config.js` | Schema, vectors, levels, progression |
| `server/test-flamethrower-persistence.js` | Migration, CAS, route, round-trip tests |
| `server/test-flamethrower-snapshot.js` | Match-path immutability/replay tests |
| `server/test-flamethrower-combat.js` | Fixed-tick/state/cone/damage tests |
| `scripts/tests/flamethrower_client_probe.gd` | Headless Godot parity/lifecycle probe |
| `scenes/tests/FlamethrowerCombatTest.tscn` | Visual/integration fixture |

### Existing files to modify

| File/module | Exact change |
|---|---|
| `server/db.js` | Migrations, definitions/progression adapters, CAS transactions, facing persistence, snapshot columns/session creation, scoring, bot/max-village preservation |
| `server/routes.js` | Facing endpoint/payloads, revisions, immutable result snapshot, admin/profile fields |
| `server/combat_defs.js` | Export validated Flame rows/rules from config |
| `server/combat_session.js` | Sorted Flame runtime, deterministic phase/state/damage/Freeze/telemetry |
| `server/matchmaking_defs.js` and bot generators/data | Legal count/level/facing, snapshot use, future TH8 fixtures |
| `server/mcp_server.js`, `server/websocket.js` | Revision-safe placement/edit integration; no direct DB bypass |
| `server/tools/combat_balance_report.js` | TH8 directional fixtures/cohort reporting |
| `scripts/building_system.gd` | Registry, TH tables via adapter, load/save yaw, two-stage placement, selection sector, lifecycle |
| `scripts/network_client.gd` | Facing/revision request-response API |
| `scripts/js_bridge.gd` | Facing UI commands/events and payload fields |
| `scripts/combat_freeze.gd` | Canonical freezable defense ID |
| `scripts/fire_dragon.gd` | Delegate presentation to shared pool without behavior change |
| `scripts/warmup.gd` | Preload wrappers/materials and pool fallback |
| `project.godot` | Rebindable facing actions |
| `export_presets.cfg` | Include the canonical JSON without broadening unrelated export scope |
| `scenes/export_manifest.tscn` | Explicit scripts/scenes/material dependencies |
| `web/src/hooks/useGodot.js` | Facing editor state/event reducer/context |
| `web/src/components/GameUI.jsx` | Mount editor overlay |
| `web/src/components/BuildingInfoPanel.jsx` | Stats/current facing/Edit Facing |
| `web/src/components/ShopPanel.jsx` | Catalog card/thumbnail |
| `web/src/hooks/usePreloadPanelAssets.js` | Thumbnail preload |
| `web/src/admin/AdminApp.jsx` | Facing display/edit only within existing building tooling |
| `server/test-client-server-combat-parity.js` | Config/version/value/vector parity |
| Existing progression/replay/bot/freeze regression tests | Future gates and compatibility assertions |

Asset import should be isolated on `codex/building-assets`; pure combat/economy tuning belongs on `codex/balance`; integration code should be staged separately to avoid mixing the currently concurrent Air Bomb work. `AirBombBase` remains untouched across all branches.

## 12. Migration and rollout sequence

1. Add/validate the canonical JSON and pure Node/Godot geometry fixtures. No registration yet.
2. Ship nullable facing/session columns and player layout revision. Backfill nothing except explicitly versioned legacy Flame rows.
3. Convert home mutations to transactional revision-aware commands; keep existing clients compatible during a short transition by returning revisions before requiring them.
4. Add immutable combat-session snapshots to every matchmaking/revenge route and switch `/attack/result` to stored snapshot authority. Prove old non-Flame sessions/replays still verify.
5. Register Flame progression/data behind TH8 availability; add persistence and API paths.
6. Implement authoritative Node state machine and focused deterministic tests.
7. Implement Godot mirror, root-facing load lifecycle, Freeze/destruction/end cleanup, and parity probe.
8. Add two-stage placement/editing, React controls, selection sector, and conflict recovery.
9. Import normalized assets/wrappers/materials/thumbnail on the building-assets branch; run content validation before wiring all levels.
10. Extract/prewarm shared flame VFX and verify Fire Dragon presentation regression.
11. Update export/admin/MCP/websocket/bot/scoring/balance tooling.
12. Run unit, integration, replay, headless/render-rate, local playtest, asset, web build, and performance gates before enabling TH8 availability.

The transitional API must be time-bounded: once the bundled client sends expected revisions, all player layout mutations require them. New Flame facing commands require them from day one. A server feature gate may keep purchase/matchmaking registration disabled during staged deployment, but it may not change combat behavior or silently omit Flame from a snapshot once enabled.

## 13. Verification plan and release gates

### Data/progression/persistence

- Fresh and upgraded SQLite DBs migrate idempotently; existing buildings remain valid.
- All ten exact HP/damage/range/cost rows and TH arrays match the canonical JSON.
- L1 placement and L2–L10 upgrades charge the correct row and preserve facing.
- One copy at TH8/9, two at TH10; L8/L9/L10 caps; existing TH1–TH7 requirements unchanged.
- Every grid location accepts all 24 steps without footprint/collision changes.
- Place, confirm, reload, reconnect, move, upgrade, enemy load, admin/import, bot load, snapshot, and replay preserve the exact integer.
- Invalid type/range/non-integer/missing-new-data and stale revision are rejected. Two concurrent editors cannot lose an update.

### Snapshot/replay/security

- Normal, ranked, named, revenge, bot, and tournament target acquisition persist a v2 snapshot.
- Rotate/move/upgrade/remove/ward-change after reservation does not change result verification.
- Client-forged facing, range, hit list, damage, and ward are ignored/rejected.
- New Flame session with missing/unknown version fails closed; old non-Flame replay remains valid.
- Same snapshot/actions produce identical ordered trace, HP, deaths, result, and telemetry.

### Combat fixtures

- Co-located ground/air: only canonical ground loses HP; every canonical air troop remains immune.
- L8 unwarded stationary ground loses exactly 885 in three 295 ticks at offsets 0/15/30; continuous next stream begins exactly 90 ticks after the first.
- Entry after offset 15/before 30 takes only offset 30; exit or ground-to-air avoids later hits; air-to-ground becomes eligible later.
- Exact radial/angular boundary hits; epsilon outside misses; exact center hits safely.
- 45 eligible ground units each take one hit per scheduled tick with no cap, duplicate, or ordering miss.
- Empty prime cancels without cooldown; committed empty stream spends the cycle; later entry can take remaining ticks.
- Freeze before fire cancels prime; Freeze after first tick prevents later ticks and preserves ready time; cooldown runs while frozen.
- Destruction before the Flame phase blocks action; destruction after a resolved tick does not undo it; Town Hall victory permits no later events.
- Ward uses `max(1, ceil(base * multiplier))`; no burn/status/displacement/building/guard/friendly damage.
- Death summons are not included recursively on the same tick.

### Client/assets/experience

- Headless/local runs at 10/20/30/60/120 render FPS match server start ticks, hit sets, HP, deaths, and cleanup.
- Root yaw is bit-stable through 180 seconds of idle/combat/Freeze/model changes; no tower tracking.
- Preview sector matches server fixtures at all 24 steps; cancel restores persisted step; 409 restores server state.
- Ten GLBs map one-to-one, remain one mesh within audited triangle range, use correct maps, have valid `MuzzleSocket`/`-Z`, and fit the unchanged 3x3 wrapper contract.
- L2 shares L1 textures; L6–L10 use scalar metallic 0; repository/export search finds no `AirBombBase` reference.
- Shop/info/admin/mobile/desktop UI show correct values and no edit controls to attackers/replays.
- Fire Dragon comparison capture shows no behavioral/presentation regression after VFX extraction.

### Performance/balance

- One Flame simulation + VFX costs no more than 0.25 ms/frame; two no more than 0.50 ms/frame.
- Zero persistent node growth over 3,600 frames; no per-tick physics query or runtime mesh copy.
- Chrome mixed fixture loses no more than 2 median FPS and adds no more than 2 ms p95; no attributable warmup stall over 250 ms.
- Server replay wall time grows less than 5% on representative TH8 fixtures.
- At least 300 legal TH8 layouts and 1,500 attack policies have zero invalid replays and every reference layout is breakable by at least one legal policy.
- Release cohorts target 55–57% attacker wins; Flame delta is ground/swarm -4 to -10 pp, mixed -2 to -6 pp, all-air no more than -1 pp. Ground delta beyond -12 pp blocks release and goes through balance review.
- Existing Turret, Archer Tower, Mage Tower, Mortar, Harpoon, Cannon, Freeze, targeting, upgrade, old replay, and Town Hall victory regressions pass.

Use the closest real checks available: Node unit/integration suites, Godot headless probes, a local server + client attack, replay reconstruction, browser UI flow, and the project's local balance runner. Static syntax checks alone are not sufficient for completion.

## 14. Consequences and open risks

### Positive consequences

- Facing becomes a durable, concurrency-safe layout property rather than presentation state.
- Active battles/replays are insulated from later defender edits.
- One designer-owned rules file prevents silent Node/Godot/UI numeric drift.
- Pure squared cone math and ordered snapshots are deterministic and cheap.
- Fixed root/wrapper/socket boundaries let ten heterogeneous source models share one gameplay implementation.
- A bounded shared flame pool improves reuse without coupling Fire Dragon and Flame damage rules.

### Costs and mitigations

- Layout revision touches all building mutations, not only Flame. Stage it compatibly and add conflict tests before making it mandatory.
- Session snapshots add DB storage. Store compact combat-only JSON, index only session metadata, and retain it under existing replay/session retention policy.
- Extracting Fire Dragon VFX can regress a working troop. Land it separately with visual/performance comparison and retain Fire Dragon's existing pool behavior.
- JSON float parsing differs internally between runtimes. Never recompute vectors/trig; use serialized decimals and squared comparisons with the specified epsilon, backed by cross-runtime fixtures.
- The ten models need per-level authored normalization/socket validation. Combat fallback remains center-based, but missing sockets block content release.

### Open implementation risks (do not change approved design)

1. The canonical attack-approach center must be identified for every existing `grid_index`; server and editor need one named helper and tie-break fixture before default facing is implemented.
2. Current production progression stops below TH8. TH8 capacity, Town Hall rows, and legal bot/reference layouts are separate prerequisites for player availability, not reasons to alter Flame's approved L1–L8 plan.
3. Current `/attack/result` live-base reload is a broader replay-integrity weakness. The snapshot migration must cover every match path before Flame can enter matches.
4. Existing building mutations do not use layout CAS. Compatibility sequencing must avoid breaking older bundled clients while preventing new facing lost updates.
5. The admin UI appears primarily account/tool oriented rather than a full base editor. Server/import correctness is mandatory; a new full admin layout editor is not required solely for this feature.
6. Audio clips/mix parameters are not supplied. Gameplay should expose hooks; content selection remains a separate approved asset task.
7. TH8/TH9/TH10 defense-power coefficients and bot layouts need balance evidence. They must be tuned without changing cone, cadence, targeting, or copy caps outside owner approval.

No risk above reopens the approved pulse cadence, 50-degree cone, 24-step facing, TH copy limits, level table, or `AirBombBase` exclusion.
