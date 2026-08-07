class_name BaseTroop
extends Node3D

const TROOP_HEALTH_BAR_BATCH := preload("res://scripts/troop_health_bar_batch.gd")
const TROOP_CROWD_BATCH := preload("res://scripts/troop_crowd_batch.gd")
const TROOP_STATUS_BATCH := preload("res://scripts/troop_status_batch.gd")
## Base class for all troops with combat AI.
## Subclasses override _init_stats() and _setup_weapons().

@export var move_speed: float = 0.5
@export var attack_range: float = 0.15
@export var separation_radius: float = 0.14
@export var separation_force: float = 0.6
@export var can_pass_through_friendly_units: bool = false
@export var can_target_guards: bool = true
@export var attack_sfx_path: String = ""
@export_enum("ground", "air") var unit_target_type: String = "ground"

const UNIT_TARGET_GROUND: String = "ground"
const UNIT_TARGET_AIR: String = "air"

var level: int = 1
var hp: int = 100
var max_hp: int = 100
var damage: int = 10
var atk_speed: float = 1.0
var _tactical_boost_active: bool = false
var _tactical_boost_remaining: float = 0.0
var _tactical_boost_base_damage: int = 0
var _tactical_boost_base_atk_speed: float = 0.0
var _tactical_boost_base_move_speed: float = 0.0

# Mirrors server/combat_defs.js. The curve applies only to primary deployed
# troops; summoned helper units keep their own separately balanced stats.
const TROOP_LEVEL_POWER_MULTIPLIERS: Array[float] = [
	0.82,
	0.82,
	1.20,
	1.85,
	1.68,
	1.61,
	1.74,
	1.96,
	2.60,
]

enum State { INACTIVE, IDLE, RUNNING, ATTACKING, VICTORY }
var state: State = State.INACTIVE
var target_building: Dictionary = {}
var target_bs: Node = null
var target_guard: Node3D = null
var attack_timer: float = 0.0

# Harpoon control is combat-ephemeral. Stable authored order keys arbitrate
# same-tick reservations; instance IDs are deliberately never used here.
const HARPOON_OWNER_NONE: int = 2147483647
var _harpoon_reservation_owner: int = HARPOON_OWNER_NONE
var _harpoon_reservation_committed: bool = false
var _harpoon_pull_owner: int = HARPOON_OWNER_NONE
var _harpoon_immunity_ticks: int = 0
var _harpoon_immunity_started_frame: int = -1

var anim_player: AnimationPlayer
var anim_files: Array = []
var anim_file_aliases: Dictionary = {}
var attack_anim: String = ""
var _hp_bar: Node3D
var _hp_fill: MeshInstance3D
const TROOP_MESH_CULL_MARGIN: float = 0.75
const TROOP_MESH_LOD_BIAS: float = 4.0
const DENSE_TROOP_LOD_INDEX: int = 0
const SWARM_TROOP_THRESHOLD: int = 40
const SWARM_TROOP_LOD_INDEX: int = 1
const MASS_TROOP_THRESHOLD: int = 70
const MASS_TROOP_LOD_INDEX: int = 2
const ATTACK_SFX_VOLUME_DB: float = -8.0
const ATTACK_SFX_PITCH_JITTER: float = 0.06
const ATTACK_SFX_POOL_SIZE: int = 6
const DENSE_RANGED_SLOT_MIN_RANGE: float = 0.55
const DENSE_RANGED_GOLDEN_ANGLE: float = 2.399963229728653
const DENSE_SPATIAL_CELL_SIZE: float = 0.22

## Cached troop list — shared across all BaseTroop instances via static
static var _cached_troops: Array = []
static var _troops_cache_frame: int = -1
static var _troops_cache_valid: bool = false
static var _cached_troop_positions := PackedVector3Array()
static var _troop_positions_cache_frame: int = -1
static var _troop_spatial_cache_frame: int = -1
static var _troop_spatial_buckets: Dictionary = {}
static var _slot_angle_cache_frame: int = -1
static var _slot_angle_groups: Dictionary = {}
static var _attack_sfx_cache: Dictionary = {}
static var _attack_sfx_missing: Dictionary = {}
static var _attack_sfx_pools: Dictionary = {}
static var _attack_sfx_pool_cursors: Dictionary = {}
static var _render_diag_emitted: Dictionary = {}
static var _dense_render_tier_active: int = 0
static var _dense_render_mode_initialized: bool = false
static var profile_dense_separation_interval: int = 0
static var profile_dense_slot_interval_sec: float = 0.0
const RENDER_DIAG_MAX_EVENTS: int = 24
const RENDER_DIAG_MAX_MESHES: int = 10
const RENDER_DIAG_MAX_PARTICLES: int = 8
const TROOP_BODY_TEXTURES: Dictionary = {
	"archer": "res://Model/Characters/pirate_archer/textures/palette_albedo.png",
	"barbarian": "res://Model/Characters/Model/Barbarian_barbarian_texture.png",
	"knight": "res://Model/Characters/Model/Knight_knight_texture.png",
	"mage": "res://Model/Characters/Model/Mage_mage_texture.png",
	"ranger": "res://Model/Characters/Model/Ranger_ranger_texture.png",
	"rogue": "res://Model/Characters/Model/Rogue_rogue_texture.png",
}
const TROOP_BODY_MESH_PREFIXES: Dictionary = {
	"archer": ["Body02", "Head02_Female", "Hair08", "Eye07", "Mouth02", "AC07_PiratePatch", "AC09_Ribbon", "Bow01", "Arrow01"],
	"barbarian": ["Barbarian_"],
	"knight": ["Knight_"],
	"mage": ["Mage_"],
	"ranger": ["Ranger_"],
	"rogue": ["Rogue_"],
}
static var _troop_body_material_cache: Dictionary = {}

## Rally pointer — set by BSRally when the player drops a marker. The visual
## marker expires quickly, but the command target stays sticky until that
## building/guard dies, the player drops a new marker, or battle state resets.
## Static because it's a single shared "battle command" — every troop reads
## the same focus, including troops that spawn after the marker faded.
static var _rally_active: bool = false
static var _rally_pos: Vector3 = Vector3.ZERO
static var _rally_expire_physics_frame: int = 0
static var _rally_target_building: Dictionary = {}
static var _rally_target_bs: Node = null
static var _rally_target_guard: Node3D = null

static func set_rally(pos: Vector3, duration_sec: float) -> Dictionary:
	_rally_active = true
	_rally_pos = pos
	var duration_frames := ceili(
		maxf(0.0, duration_sec) * float(Engine.physics_ticks_per_second)
	)
	_rally_expire_physics_frame = Engine.get_physics_frames() + duration_frames
	_resolve_rally_target(pos)
	_apply_rally_to_active_troops()
	return get_rally_debug_payload(pos)

static func clear_rally() -> void:
	_rally_active = false
	_rally_expire_physics_frame = 0
	_rally_target_building = {}
	_rally_target_bs = null
	_rally_target_guard = null

static func _is_rally_live() -> bool:
	return (
		_rally_active
		and Engine.get_physics_frames() < _rally_expire_physics_frame
	)

static func _resolve_rally_target(pos: Vector3) -> void:
	_rally_target_building = {}
	_rally_target_bs = null
	_rally_target_guard = null
	var nearest_dist_sq: float = INF

	for entry in _get_buildings_cached():
		var b: Dictionary = entry.b
		if b.get("hp", 0) <= 0 or not is_instance_valid(b.get("node")):
			continue
		var dx: float = pos.x - entry.pos.x
		var dz: float = pos.z - entry.pos.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_rally_target_building = b
			_rally_target_bs = entry.bs
			_rally_target_guard = null

	for guard in _get_guards_list_cached():
		if not is_instance_valid(guard) or not guard.is_inside_tree():
			continue
		if guard.hp <= 0:
			continue
		var dx: float = pos.x - guard.global_position.x
		var dz: float = pos.z - guard.global_position.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_rally_target_building = {}
			_rally_target_bs = null
			_rally_target_guard = guard

	if nearest_dist_sq == INF:
		clear_rally()

static func _has_valid_rally_target() -> bool:
	if not _rally_active:
		return false
	if _rally_target_guard != null:
		return is_instance_valid(_rally_target_guard) and _rally_target_guard.is_inside_tree() and _rally_target_guard.hp > 0
	if _rally_target_building.size() > 0:
		return _rally_target_building.get("hp", 0) > 0 and is_instance_valid(_rally_target_building.get("node"))
	return false

static func _apply_rally_to_active_troops() -> void:
	if not _has_valid_rally_target():
		return
	for troop in _get_troops_cached():
		if is_instance_valid(troop) and troop is BaseTroop and troop.state != State.INACTIVE and troop.state != State.VICTORY:
			troop._apply_rally_target()

static func get_rally_debug_payload(pos: Vector3) -> Dictionary:
	var payload: Dictionary = {
		"x": snappedf(pos.x, 0.001),
		"z": snappedf(pos.z, 0.001),
		"target_kind": "none",
		"target_candidates": _rally_candidates_payload(pos),
	}
	if _rally_target_guard != null and is_instance_valid(_rally_target_guard):
		payload["target_kind"] = "guard"
		payload["target_instance"] = int(_rally_target_guard.get_instance_id())
		payload["target_hp"] = int(_rally_target_guard.get("hp")) if _rally_target_guard.get("hp") != null else 0
		payload["target_x"] = snappedf(_rally_target_guard.global_position.x, 0.001)
		payload["target_z"] = snappedf(_rally_target_guard.global_position.z, 0.001)
	elif _rally_target_building.size() > 0:
		var node: Node3D = _rally_target_building.get("node", null)
		payload["target_kind"] = "building"
		payload["target_server_id"] = int(_rally_target_building.get("server_id", -1))
		payload["target_type"] = str(_rally_target_building.get("id", ""))
		payload["target_hp"] = int(_rally_target_building.get("hp", 0))
		if is_instance_valid(node):
			payload["target_x"] = snappedf(node.global_position.x, 0.001)
			payload["target_z"] = snappedf(node.global_position.z, 0.001)
	return payload


static func _rally_candidates_payload(pos: Vector3, limit: int = 8) -> Array:
	var candidates: Array = []
	for entry in _get_buildings_cached():
		var b: Dictionary = entry.get("b", {})
		if int(b.get("hp", 0)) <= 0:
			continue
		var bpos: Vector3 = entry.get("pos", Vector3.ZERO)
		var dx: float = pos.x - bpos.x
		var dz: float = pos.z - bpos.z
		candidates.append({
			"kind": "building",
			"server_id": int(b.get("server_id", -1)),
			"type": str(b.get("id", "")),
			"hp": int(b.get("hp", 0)),
			"x": snappedf(bpos.x, 0.001),
			"z": snappedf(bpos.z, 0.001),
			"dist": snappedf(sqrt(dx * dx + dz * dz), 0.001),
		})
	for guard in _get_guards_list_cached():
		if not is_instance_valid(guard) or not guard.is_inside_tree():
			continue
		if guard.get("hp") == null or int(guard.get("hp")) <= 0:
			continue
		var gpos: Vector3 = guard.global_position
		var gdx: float = pos.x - gpos.x
		var gdz: float = pos.z - gpos.z
		candidates.append({
			"kind": "guard",
			"instance": int(guard.get_instance_id()),
			"hp": int(guard.get("hp")),
			"x": snappedf(gpos.x, 0.001),
			"z": snappedf(gpos.z, 0.001),
			"dist": snappedf(sqrt(gdx * gdx + gdz * gdz), 0.001),
		})
	candidates.sort_custom(func(a, b): return float(a.get("dist", INF)) < float(b.get("dist", INF)))
	var result: Array = []
	var count: int = mini(limit, candidates.size())
	for i in range(count):
		result.append(candidates[i])
	return result


## Cached camera ref — refreshed once per frame globally
static var _cached_camera: Camera3D = null
static var _camera_cache_frame: int = -1

## Throttle separation — not every troop needs it every frame
var _sep_counter: int = 0
var _move_sep_counter: int = 0
var _last_move_separation: Vector3 = Vector3.ZERO
var _slot_eval_timer: float = 0.0
var _last_separation: Vector3 = Vector3.ZERO
var _hp_bar_frame: int = 0  # throttle HP bar billboard rotation
var _last_hp_ratio: float = -1.0  # cache to skip redundant shader updates
var _last_hp_band: int = -1  # cache to skip redundant color updates

## Target re-evaluation — staggered across troops
var _retarget_timer: float = 0.0
## Guard threat radius multiplier — guards within this * attack_range trigger immediate switch
const GUARD_THREAT_MULT: float = 1.5
const ATTACK_MAX_RANGE_MULT: float = 2.0
const TARGET_SWITCH_MIN_ADVANTAGE: float = 0.08
const RETARGET_INTERVAL_SEC: float = 10.0 / 60.0
const SLOT_EVAL_INTERVAL_SEC: float = 6.0 / 60.0
const REPLAY_COMBAT_DELTA: float = 1.0 / 60.0
const HIGH_DENSITY_TROOP_THRESHOLD: int = 24
# Dense crowds keep applying the cached steering vector every physics tick;
# only the spatial-hash refresh runs at 10 Hz. The 45-knight TH6 profile
# reduced physics cost and p95 frame time without changing combat damage,
# which the server does not derive from client-side allied push-apart.
const HIGH_DENSITY_SEPARATION_INTERVAL: int = 6
const HIGH_DENSITY_ATTACK_SEPARATION_INTERVAL: int = 12
const NORMAL_TROOP_ANIMATION_HZ: float = 30.0
const DENSE_TROOP_ANIMATION_HZ: float = 10.0

static var _replay_combat_cache_frame: int = -1
static var _replay_combat_locked: bool = false
static var _replay_telemetry_sink_cache_frame: int = -1
static var _replay_telemetry_sink_active: bool = false

## Pre-allocated HP bar colors — avoids Color allocation every frame
static var _HP_COLORS: Array = [
	Color(0.9, 0.1, 0.1, 0.9),   # 0 = red (ratio <= 0.25)
	Color(0.9, 0.8, 0.1, 0.9),   # 1 = yellow (ratio <= 0.5)
	Color(0.1, 0.85, 0.1, 0.9),  # 2 = green (ratio > 0.5)
]

## Stuck detection — if troop barely moves for too long, orbit around target
var _stuck_timer: float = 0.0
var _last_pos: Vector3 = Vector3.ZERO
var _orbit_angle: float = 0.0  # radians offset to orbit around blocked target
var _last_face_direction: Vector3 = Vector3.ZERO
const FACE_DIRECTION_DOT_THRESHOLD: float = 0.9997

## Shared animation libraries — one per anim_files key, reused by all troops of same type
static var _anim_lib_cache: Dictionary = {}  # key(String) -> AnimationLibrary

## Cached building data — refreshed once per frame, used by _find_next_target and avoidance
static var _cached_building_list: Array = []  # [{dict, bs, pos}]
static var _buildings_cache_frame: int = -1
static var _buildings_cache_valid: bool = false
static var _building_entry_pool: Array = []  # reusable Dict pool to avoid per-frame allocation
static var _building_entry_pool_idx: int = 0

## Per-frame cache of "building_systems" group nodes — avoids repeated
## get_nodes_in_group scans during troop deaths and other event-driven calls.
static var _cached_bs_nodes: Array = []
static var _bs_nodes_cache_frame: int = -1

static func combat_cache_key() -> int:
	var frame: int = Engine.get_physics_frames() if Engine.is_in_physics_frame() else Engine.get_process_frames()
	return frame * 2 + (0 if Engine.is_in_physics_frame() else 1)


static func _get_building_systems_cached() -> Array:
	var frame: int = combat_cache_key()
	if frame != _bs_nodes_cache_frame:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_bs_nodes = tree.get_nodes_in_group("building_systems")
		_bs_nodes_cache_frame = frame
	return _cached_bs_nodes


static func invalidate_replay_telemetry_sink_cache() -> void:
	_replay_telemetry_sink_cache_frame = -1
	_replay_telemetry_sink_active = false


static func has_active_replay_telemetry_sink() -> bool:
	var frame: int = combat_cache_key()
	if frame == _replay_telemetry_sink_cache_frame:
		return _replay_telemetry_sink_active
	_replay_telemetry_sink_cache_frame = frame
	_replay_telemetry_sink_active = false
	for bs_node in _get_building_systems_cached():
		if not is_instance_valid(bs_node):
			continue
		if bs_node.has_method("has_active_replay_telemetry_sink"):
			if bool(bs_node.call("has_active_replay_telemetry_sink")):
				_replay_telemetry_sink_active = true
				break
		elif bs_node.has_method("record_replay_telemetry"):
			# Compatibility for focused probes and external telemetry sinks that
			# predate the explicit active-state API.
			_replay_telemetry_sink_active = true
			break
	return _replay_telemetry_sink_active


## Cached movement region. Troops may move through the main island grid and
## the shore deployment grid, but nowhere else on the map.
static var _movement_grid_bounds: Array = []
static var _island_bounds_ready: bool = false

static func reset_island_bounds_cache() -> void:
	_island_bounds_ready = false
	_movement_grid_bounds.clear()


static func reset_combat_runtime_cache() -> void:
	clear_rally()
	reset_island_bounds_cache()
	invalidate_combat_lists()
	_cached_bs_nodes.clear()
	_bs_nodes_cache_frame = -1
	_cached_camera = null
	_camera_cache_frame = -1
	_replay_combat_cache_frame = -1
	_replay_combat_locked = false
	invalidate_replay_telemetry_sink_cache()


static func is_replay_combat_locked() -> bool:
	var frame: int = combat_cache_key()
	if frame == _replay_combat_cache_frame:
		return _replay_combat_locked
	_replay_combat_cache_frame = frame
	_replay_combat_locked = false
	for bs_node in _get_building_systems_cached():
		if is_instance_valid(bs_node) and "_replay_active" in bs_node and bool(bs_node._replay_active):
			_replay_combat_locked = true
			break
	return _replay_combat_locked


static func combat_delta(delta: float) -> float:
	if is_replay_combat_locked():
		return REPLAY_COMBAT_DELTA
	return minf(delta, 0.1)


static func invalidate_combat_lists() -> void:
	invalidate_troops_cache()
	invalidate_buildings_cache()
	invalidate_guards_cache()


static func invalidate_troops_cache() -> void:
	_cached_troops.clear()
	_troops_cache_frame = -1
	_troops_cache_valid = false
	_cached_troop_positions.clear()
	_troop_positions_cache_frame = -1
	_troop_spatial_buckets.clear()
	_troop_spatial_cache_frame = -1


static func invalidate_buildings_cache() -> void:
	_cached_building_list.clear()
	_buildings_cache_frame = -1
	_buildings_cache_valid = false
	_building_entry_pool_idx = 0


static func invalidate_guards_cache() -> void:
	_cached_guards_list.clear()
	_guards_list_cache_frame = -1
	_guards_cache_valid = false
	_cached_guard_positions.clear()
	_guard_positions_cache_frame = -1


static func is_live_troop(troop: Variant) -> bool:
	if not is_instance_valid(troop):
		return false
	if not troop.is_inside_tree():
		return false
	var hp_value: Variant = troop.get("hp")
	if hp_value != null and int(hp_value) <= 0:
		return false
	var dead_value: Variant = troop.get("_is_dead")
	if dead_value != null and bool(dead_value):
		return false
	return true


static func is_air_troop(troop: Variant) -> bool:
	if not is_instance_valid(troop):
		return false
	var troop_target_type: Variant = troop.get("unit_target_type")
	return str(troop_target_type) == UNIT_TARGET_AIR


static func can_target_troop(troop: Variant, can_target_ground: bool, can_target_air: bool) -> bool:
	if not is_live_troop(troop):
		return false
	return can_target_air if is_air_troop(troop) else can_target_ground


static func can_defense_target_troop(troop: Variant, can_target_ground: bool, can_target_air: bool) -> bool:
	if not can_target_troop(troop, can_target_ground, can_target_air):
		return false
	if troop.has_method("is_targetable_by_defenses"):
		return bool(troop.call("is_targetable_by_defenses"))
	return true


func is_air_unit() -> bool:
	return unit_target_type == UNIT_TARGET_AIR


func can_be_targeted_by_harpoon(owner_order: int) -> bool:
	if not is_air_unit() or _is_dead or hp <= 0 or _harpoon_immunity_ticks > 0:
		return false
	if _harpoon_reservation_owner == HARPOON_OWNER_NONE:
		return true
	if _harpoon_reservation_owner == owner_order:
		return true
	return not _harpoon_reservation_committed and owner_order < _harpoon_reservation_owner


func try_reserve_harpoon(owner_order: int) -> bool:
	if not can_be_targeted_by_harpoon(owner_order):
		return false
	if _harpoon_reservation_owner != owner_order:
		_harpoon_reservation_owner = owner_order
		_harpoon_reservation_committed = false
		_harpoon_pull_owner = HARPOON_OWNER_NONE
	return true


func has_harpoon_reservation(owner_order: int) -> bool:
	return _harpoon_reservation_owner == owner_order


func commit_harpoon_reservation(owner_order: int) -> bool:
	if _harpoon_reservation_owner != owner_order:
		return false
	_harpoon_reservation_committed = true
	return true


func begin_harpoon_pull(owner_order: int) -> bool:
	if not commit_harpoon_reservation(owner_order):
		return false
	_harpoon_pull_owner = owner_order
	return true


func is_harpoon_pull_active() -> bool:
	return _harpoon_pull_owner != HARPOON_OWNER_NONE


func release_harpoon(owner_order: int, immunity_ticks: int = 0) -> bool:
	if _harpoon_reservation_owner != owner_order:
		return false
	_harpoon_reservation_owner = HARPOON_OWNER_NONE
	_harpoon_reservation_committed = false
	_harpoon_pull_owner = HARPOON_OWNER_NONE
	if immunity_ticks > 0 and not _is_dead and hp > 0:
		_harpoon_immunity_ticks = maxi(_harpoon_immunity_ticks, immunity_ticks)
		_harpoon_immunity_started_frame = Engine.get_physics_frames()
	return true


func get_harpoon_control_debug() -> Dictionary:
	return {
		"reservation_owner": _harpoon_reservation_owner,
		"reservation_committed": _harpoon_reservation_committed,
		"pull_owner": _harpoon_pull_owner,
		"immunity_ticks": _harpoon_immunity_ticks,
	}


## Applies one authoritative XZ-only pull step and returns actual movement.
## A negative result means the caller no longer owns the pull.
func apply_harpoon_pull_step(
	owner_order: int,
	anchor: Vector3,
	pull_speed: float,
	delta: float,
	stop_distance: float
) -> float:
	if _harpoon_pull_owner != owner_order or _harpoon_reservation_owner != owner_order:
		return -1.0
	var before := global_position
	var toward := Vector3(anchor.x - before.x, 0.0, anchor.z - before.z)
	var distance_sq := toward.length_squared()
	var safe_stop := maxf(0.0, stop_distance)
	if distance_sq <= safe_stop * safe_stop or distance_sq <= 0.00000001:
		return 0.0
	var distance := sqrt(distance_sq)
	var step := minf(maxf(0.0, pull_speed) * maxf(0.0, delta), distance - safe_stop)
	if step <= 0.0:
		return 0.0
	var next_position := before + toward * (step / distance)
	next_position = _clamp_to_island(next_position)
	next_position.y = before.y
	var moved := Vector2(next_position.x - before.x, next_position.z - before.z).length()
	if moved > 0.0000001:
		global_position = next_position
		# Later defenses in the same fixed tick must observe the pulled position.
		_cached_troop_positions.clear()
		_troop_positions_cache_frame = -1
		_troop_spatial_buckets.clear()
		_troop_spatial_cache_frame = -1
	return moved


static func _troop_order_key(troop: Node) -> int:
	if is_instance_valid(troop) and troop.has_meta("replay_order"):
		return int(troop.get_meta("replay_order"))
	return int(troop.get_instance_id()) if is_instance_valid(troop) else 2147483647


static func _building_order_key(b: Dictionary) -> int:
	var sid: int = int(b.get("server_id", -1))
	if sid >= 0:
		return sid
	var gp: Vector2i = b.get("grid_pos", Vector2i.ZERO)
	return int(gp.y) * 1000 + int(gp.x)

static func _ensure_island_bounds() -> void:
	if _island_bounds_ready:
		return
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if not tree:
		return
	_movement_grid_bounds.clear()
	var fallback_bounds: Dictionary = {}
	var fallback_area: float = 0.0
	for bs in tree.get_nodes_in_group("building_systems"):
		if not is_instance_valid(bs):
			continue
		var extent_x: float = float(bs.get("grid_extent_x"))
		var extent_z: float = float(bs.get("grid_extent_z"))
		if extent_x <= 0.01 or extent_z <= 0.01:
			continue
		var bounds: Dictionary = {
			"center": bs.get("grid_center"),
			"extent_x": extent_x * 1.05,
			"extent_z": extent_z * 1.05,
			"rotation": float(bs.get("grid_rotation")),
		}
		bounds["cos_rotation"] = cos(float(bounds["rotation"]))
		bounds["sin_rotation"] = sin(float(bounds["rotation"]))
		bounds["half_x"] = float(bounds["extent_x"]) * 0.5
		bounds["half_z"] = float(bounds["extent_z"]) * 0.5
		var area: float = extent_x * extent_z
		if area > fallback_area:
			fallback_area = area
			fallback_bounds = bounds
		var grid_index: int = int(bs.call("_get_grid_index")) if bs.has_method("_get_grid_index") else -1
		if grid_index == 0 or grid_index == 2:
			_movement_grid_bounds.append(bounds)
	if _movement_grid_bounds.is_empty() and not fallback_bounds.is_empty():
		_movement_grid_bounds.append(fallback_bounds)
	if not _movement_grid_bounds.is_empty():
		_island_bounds_ready = true


static func _clamp_to_grid_bounds(pos: Vector3, bounds: Dictionary) -> Vector3:
	var center: Vector3 = bounds.get("center", Vector3.ZERO)
	var dx: float = pos.x - center.x
	var dz: float = pos.z - center.z
	var cos_r: float = float(bounds.get("cos_rotation", 1.0))
	var sin_r: float = float(bounds.get("sin_rotation", 0.0))
	var local_x: float = dx * cos_r - dz * sin_r
	var local_z: float = dx * sin_r + dz * cos_r
	var half_x: float = float(bounds.get("half_x", 0.0))
	var half_z: float = float(bounds.get("half_z", 0.0))
	local_x = clampf(local_x, -half_x, half_x)
	local_z = clampf(local_z, -half_z, half_z)
	var clamped: Vector3 = pos
	clamped.x = center.x + local_x * cos_r + local_z * sin_r
	clamped.z = center.z - local_x * sin_r + local_z * cos_r
	return clamped


## Clamp to the exact union of the island and shore deployment grids. A point
## inside either grid is preserved, so manual deployment depth is not lost on
## the first movement tick.
static func _clamp_to_island(pos: Vector3) -> Vector3:
	if not _island_bounds_ready:
		_ensure_island_bounds()
	if _movement_grid_bounds.is_empty():
		return pos
	var nearest: Vector3 = pos
	var nearest_dist_sq: float = INF
	for bounds_value: Variant in _movement_grid_bounds:
		var bounds: Dictionary = bounds_value
		var candidate: Vector3 = _clamp_to_grid_bounds(pos, bounds)
		var dx: float = candidate.x - pos.x
		var dz: float = candidate.z - pos.z
		var dist_sq: float = dx * dx + dz * dz
		if dist_sq <= 0.000000000001:
			return pos
		if dist_sq < nearest_dist_sq:
			nearest_dist_sq = dist_sq
			nearest = candidate
	return nearest


## Returns the avoidance radius for a building based on its cell footprint.
static func _building_avoid_radius(b: Dictionary, bs_node: Node, padding: float = 0.06) -> float:
	if bs_node and "building_defs" in bs_node and "cell_size" in bs_node:
		var bdef: Dictionary = bs_node.building_defs.get(b.get("id", ""), {})
		var cells: Vector2i = bdef.get("cells", Vector2i(2, 2))
		return maxf(cells.x, cells.y) * bs_node.cell_size * 0.5 + padding
	return 0.18


static func _get_buildings_cached() -> Array:
	if not _buildings_cache_valid:
		_cached_building_list.clear()
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			for bs in tree.get_nodes_in_group("building_systems"):
				for b in bs.placed_buildings:
					var bdef: Dictionary = bs.building_defs.get(b.get("id", ""), {})
					if bool(bdef.get("non_targetable", false)):
						continue
					if b.get("hp", 0) > 0 and is_instance_valid(b.get("node")):
						# Reuse pooled entries to avoid Dictionary allocation every frame
						var entry: Dictionary
						if _building_entry_pool_idx < _building_entry_pool.size():
							entry = _building_entry_pool[_building_entry_pool_idx]
							entry["b"] = b
							entry["bs"] = bs
							entry["pos"] = b.node.global_position
							entry["avoid_radius"] = _building_avoid_radius(b, bs)
						else:
							entry = {
								"b": b,
								"bs": bs,
								"pos": b.node.global_position,
								"avoid_radius": _building_avoid_radius(b, bs),
							}
							_building_entry_pool.append(entry)
						_building_entry_pool_idx += 1
						_cached_building_list.append(entry)
			_cached_building_list.sort_custom(func(a, b): return _building_order_key(a.get("b", {})) < _building_order_key(b.get("b", {})))
		_building_entry_pool_idx = 0
		_buildings_cache_frame = combat_cache_key()
		_buildings_cache_valid = true
	return _cached_building_list


static var _cached_guards_list: Array = []
static var _guards_list_cache_frame: int = -1
static var _guards_cache_valid: bool = false
static var _cached_guard_positions := PackedVector3Array()
static var _guard_positions_cache_frame: int = -1

static func _get_guards_list_cached() -> Array:
	if not _guards_cache_valid:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_guards_list = tree.get_nodes_in_group("skeleton_guards")
		_guards_list_cache_frame = combat_cache_key()
		_guards_cache_valid = true
	return _cached_guards_list


static func _get_guard_positions_cached() -> PackedVector3Array:
	var guards: Array = _get_guards_list_cached()
	var frame: int = combat_cache_key()
	if (
		frame == _guard_positions_cache_frame
		and _cached_guard_positions.size() == guards.size()
	):
		return _cached_guard_positions
	_cached_guard_positions.resize(guards.size())
	for guard_index in range(guards.size()):
		var guard: Variant = guards[guard_index]
		_cached_guard_positions[guard_index] = (
			guard.global_position
			if is_instance_valid(guard) and guard is Node3D
			else Vector3(INF, 0.0, INF)
		)
	_guard_positions_cache_frame = frame
	return _cached_guard_positions


static func _get_troops_cached() -> Array:
	if not _troops_cache_valid:
		_cached_troops.clear()
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			for troop in tree.get_nodes_in_group("troops"):
				if is_live_troop(troop):
					_cached_troops.append(troop)
			_cached_troops.sort_custom(func(a, b): return _troop_order_key(a) < _troop_order_key(b))
		_troops_cache_frame = combat_cache_key()
		_troops_cache_valid = true
	return _cached_troops


static func _get_troop_positions_cached() -> PackedVector3Array:
	var troops: Array = _get_troops_cached()
	var frame: int = combat_cache_key()
	if (
		frame == _troop_positions_cache_frame
		and _cached_troop_positions.size() == troops.size()
	):
		return _cached_troop_positions
	_cached_troop_positions.resize(troops.size())
	for troop_index in range(troops.size()):
		var troop: Variant = troops[troop_index]
		_cached_troop_positions[troop_index] = (
			troop.global_position
			if is_instance_valid(troop) and troop is Node3D
			else Vector3(INF, 0.0, INF)
		)
	_troop_positions_cache_frame = frame
	return _cached_troop_positions


static func _troop_spatial_cell(world_position: Vector3) -> Vector2i:
	return Vector2i(
		floori(world_position.x / DENSE_SPATIAL_CELL_SIZE),
		floori(world_position.z / DENSE_SPATIAL_CELL_SIZE)
	)


static func _get_troop_spatial_buckets_cached() -> Dictionary:
	var positions: PackedVector3Array = _get_troop_positions_cached()
	var frame: int = combat_cache_key()
	if frame == _troop_spatial_cache_frame:
		return _troop_spatial_buckets
	_troop_spatial_buckets.clear()
	for troop_index in range(positions.size()):
		var cell: Vector2i = _troop_spatial_cell(positions[troop_index])
		var bucket := PackedInt32Array()
		if _troop_spatial_buckets.has(cell):
			bucket = _troop_spatial_buckets[cell]
		bucket.append(troop_index)
		_troop_spatial_buckets[cell] = bucket
	_troop_spatial_cache_frame = frame
	return _troop_spatial_buckets


static func _get_camera_cached() -> Camera3D:
	var frame: int = combat_cache_key()
	if frame != _camera_cache_frame:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree and tree.root:
			var vp: Viewport = tree.root.get_viewport()
			if vp:
				_cached_camera = vp.get_camera_3d()
		_camera_cache_frame = frame
	return _cached_camera


func _ready() -> void:
	_init_stats()
	_apply_troop_level_power_curve()
	max_hp = hp
	_setup_attack_sfx()
	_setup_animations()
	_setup_weapons()
	_apply_web_body_material_fallback()
	_stabilize_render_meshes()
	_report_troop_render_diagnostic("ready")
	# Keep combat replay deterministic and aligned with the server simulator.
	_sep_counter = 0
	_move_sep_counter = 0
	_last_move_separation = Vector3.ZERO
	_slot_eval_timer = 0.0
	_retarget_timer = 0.0
	_last_face_direction = Vector3.ZERO


## Override to set hp, damage, atk_speed, move_speed, attack_range, attack_anim, anim_files
func _init_stats() -> void:
	pass


func _uses_troop_level_power_curve() -> bool:
	return true


func _apply_troop_level_power_curve() -> void:
	if not _uses_troop_level_power_curve():
		return
	var index := clampi(level - 1, 0, TROOP_LEVEL_POWER_MULTIPLIERS.size() - 1)
	var multiplier := TROOP_LEVEL_POWER_MULTIPLIERS[index]
	hp = maxi(1, roundi(float(hp) * multiplier))
	damage = maxi(1, roundi(float(damage) * multiplier))


## Applies level `lvl` to this troop by re-running `_init_stats()`.
## Call after spawning when the player's stored troop level is known.
func upgrade_to(lvl: int) -> void:
	_clear_tactical_boost()
	level = lvl
	_init_stats()
	_apply_troop_level_power_curve()
	max_hp = hp
	_setup_attack_sfx()


## Override to attach weapons via _attach_to_bone()
func _setup_weapons() -> void:
	pass


func _setup_attack_sfx() -> void:
	if attack_sfx_path == "":
		return
	if not _attack_sfx_cache.has(attack_sfx_path) and not _attack_sfx_missing.has(attack_sfx_path):
		var stream: AudioStream = ResourceLoader.load(attack_sfx_path) as AudioStream
		if stream:
			_attack_sfx_cache[attack_sfx_path] = stream
		else:
			_attack_sfx_missing[attack_sfx_path] = true
			push_warning("%s: missing attack sound '%s'" % [name, attack_sfx_path])


func _play_attack_sfx() -> void:
	if attack_sfx_path == "":
		return
	if not _attack_sfx_cache.has(attack_sfx_path):
		_setup_attack_sfx()
	var stream := _attack_sfx_cache.get(attack_sfx_path) as AudioStream
	if stream == null:
		return
	var pool_key := _attack_sfx_pool_key(attack_sfx_path)
	var pool := _get_attack_sfx_pool(pool_key, stream)
	if pool.is_empty():
		return
	var cursor: int = int(_attack_sfx_pool_cursors.get(pool_key, 0)) % pool.size()
	var player := pool[cursor] as AudioStreamPlayer
	_attack_sfx_pool_cursors[pool_key] = (cursor + 1) % pool.size()
	player.pitch_scale = randf_range(
		1.0 - ATTACK_SFX_PITCH_JITTER,
		1.0 + ATTACK_SFX_PITCH_JITTER
	)
	player.play()


func _attack_sfx_pool_key(path: String) -> String:
	var scene := get_tree().current_scene
	var scene_id: int = int(scene.get_instance_id()) if is_instance_valid(scene) else 0
	return "%d:%s" % [scene_id, path]


func _get_attack_sfx_pool(pool_key: String, stream: AudioStream) -> Array:
	var existing: Array = _attack_sfx_pools.get(pool_key, [])
	var valid_pool: Array = []
	for player_value in existing:
		if is_instance_valid(player_value) and player_value is AudioStreamPlayer:
			valid_pool.append(player_value)
	if valid_pool.size() == ATTACK_SFX_POOL_SIZE:
		return valid_pool

	var scene := get_tree().current_scene
	if not is_instance_valid(scene):
		scene = get_tree().root
	for player_value in valid_pool:
		if is_instance_valid(player_value):
			player_value.queue_free()
	valid_pool.clear()
	for pool_index in ATTACK_SFX_POOL_SIZE:
		var player := AudioStreamPlayer.new()
		player.name = "TroopAttackSFX_%d" % pool_index
		player.volume_db = ATTACK_SFX_VOLUME_DB
		player.stream = stream
		scene.add_child(player)
		valid_pool.append(player)
	_attack_sfx_pools[pool_key] = valid_pool
	_attack_sfx_pool_cursors[pool_key] = 0
	return valid_pool


## Transitions the troop from INACTIVE to IDLE, makes it visible, registers it
## in the "troops" group and immediately searches for a target. The HP bar is
## created lazily after the first hit instead of adding three nodes per troop.
## Call this after placing the troop in the scene via the attack system.
func prepare_activation_visuals() -> void:
	if _activation_visuals_prepared:
		return
	_apply_web_body_material_fallback()
	_stabilize_render_meshes()
	_report_troop_render_diagnostic("activate")
	_activation_visuals_prepared = true


func activate(refresh_dense_rendering: bool = true) -> void:
	if state != State.INACTIVE:
		return
	visible = true
	prepare_activation_visuals()
	state = State.IDLE
	add_to_group("troops")
	invalidate_troops_cache()
	_last_face_direction = Vector3.ZERO
	_move_sep_counter = posmod(_troop_order_key(self), HIGH_DENSITY_SEPARATION_INTERVAL)
	_sep_counter = posmod(_troop_order_key(self), HIGH_DENSITY_ATTACK_SEPARATION_INTERVAL)
	_enable_animation_budget()
	if refresh_dense_rendering:
		_refresh_dense_troop_rendering()
	_record_replay_telemetry("troop_spawn", {})
	_find_next_target()


func _exit_tree() -> void:
	if _crowd_batch_registered and is_instance_valid(_crowd_batch_manager):
		_crowd_batch_manager.call("unregister_troop", self, false)
	if is_instance_valid(_status_batch_manager):
		_status_batch_manager.call("unregister_troop", self)
	_crowd_batch_registered = false
	_crowd_batch_manager = null
	_status_batch_manager = null


func _refresh_dense_troop_rendering() -> void:
	var troops: Array = get_tree().get_nodes_in_group("troops")
	var render_tier := _dense_render_tier(troops.size())
	if _dense_render_mode_initialized and render_tier == _dense_render_tier_active:
		_set_dense_render_tier(render_tier)
		return
	_dense_render_mode_initialized = true
	_dense_render_tier_active = render_tier
	for troop in troops:
		if is_instance_valid(troop) and troop is BaseTroop:
			troop._set_dense_render_tier(render_tier)


static func _dense_render_tier(troop_count: int) -> int:
	if troop_count >= MASS_TROOP_THRESHOLD:
		return 3
	if troop_count >= SWARM_TROOP_THRESHOLD:
		return 2
	if troop_count > HIGH_DENSITY_TROOP_THRESHOLD:
		return 1
	return 0


static func _dense_lod_index_for_tier(render_tier: int) -> int:
	match render_tier:
		3:
			return MASS_TROOP_LOD_INDEX
		2:
			return SWARM_TROOP_LOD_INDEX
		_:
			return DENSE_TROOP_LOD_INDEX


var _dense_render_tier_applied: int = -1
var _activation_visuals_prepared: bool = false
var _batched_hp_registered: bool = false
var _crowd_batch_manager: Node = null
var _crowd_batch_registered: bool = false
var _status_batch_manager: Node = null


func _set_dense_render_tier(render_tier: int) -> void:
	if _dense_render_tier_applied == render_tier:
		return
	_dense_render_tier_applied = render_tier
	var dense := render_tier > 0
	var lod_index := _dense_lod_index_for_tier(render_tier)
	for raw_mesh in find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if mesh_instance != null:
			var full_detail_mesh: Mesh = mesh_instance.get_meta(
				"clash_full_detail_mesh",
				mesh_instance.mesh
			) as Mesh
			if not mesh_instance.has_meta("clash_full_detail_mesh"):
				mesh_instance.set_meta("clash_full_detail_mesh", full_detail_mesh)
			if (
				dense
				and mesh_instance.skin != null
				and not bool(mesh_instance.get_meta("clash_dense_lod_ignore", false))
			):
				mesh_instance.mesh = SkinnedMeshCombiner.dense_lod_variant(
					full_detail_mesh,
					lod_index
				)
			else:
				mesh_instance.mesh = full_detail_mesh
			mesh_instance.lod_bias = TROOP_MESH_LOD_BIAS
			mesh_instance.cast_shadow = (
				GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				if dense
				else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			)
	if render_tier >= 2 and DisplayServer.get_name() != "headless":
		if not _crowd_batch_registered:
			_crowd_batch_manager = TROOP_CROWD_BATCH.get_for_scene(self)
			if _crowd_batch_manager != null:
				_crowd_batch_registered = bool(
					_crowd_batch_manager.call("register_troop", self)
				)
	elif _crowd_batch_registered:
		_crowd_batch_manager.call("unregister_troop", self, true)
		_crowd_batch_registered = false
		_crowd_batch_manager = null
	if dense:
		if is_instance_valid(_hp_bar):
			_hp_bar.queue_free()
			_hp_bar = null
			_hp_fill = null
	else:
		_unregister_batched_hp_bar()


var _spawn_scale: float = 0.1
var _animation_budget_active: bool = false
var _animation_budget_accumulator: float = 0.0
var _animation_budget_animation: StringName = &""
var _animation_budget_dense: bool = false
static var _animation_density_cache_frame: int = -1
static var _animation_density_cache_value: bool = false
static var _ai_profile_enabled: bool = OS.get_cmdline_user_args().has("--profile-troop-ai")
static var _ai_profile_last_frame: int = -1
static var _ai_profile_frame_count: int = 0
static var _ai_profile_troop_calls: int = 0
static var _ai_profile_animation_usec: int = 0
static var _ai_profile_common_usec: int = 0
static var _ai_profile_targeting_usec: int = 0
static var _ai_profile_action_usec: int = 0
static var _move_profile_last_frame: int = -1
static var _move_profile_frame_count: int = 0
static var _move_profile_calls: int = 0
static var _move_profile_target_usec: int = 0
static var _move_profile_slot_usec: int = 0
static var _move_profile_face_usec: int = 0
static var _move_profile_steering_usec: int = 0
static var _move_profile_state_usec: int = 0


func _enable_animation_budget() -> void:
	if anim_player == null:
		return
	anim_player.set_meta("clash_troop_animation_managed", true)
	anim_player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	_animation_budget_active = true
	_animation_budget_animation = anim_player.current_animation
	_reset_animation_budget_phase(_is_dense_animation_crowd())
	anim_player.advance(0.0)


func _release_animation_budget() -> void:
	if not _animation_budget_active or anim_player == null:
		return
	_animation_budget_active = false
	_animation_budget_accumulator = 0.0
	anim_player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_IDLE


func _is_dense_animation_crowd() -> bool:
	var frame: int = combat_cache_key()
	if frame != _animation_density_cache_frame:
		var tree: SceneTree = get_tree()
		_animation_density_cache_value = (
			tree != null
			and tree.get_node_count_in_group("troops") > HIGH_DENSITY_TROOP_THRESHOLD
		)
		_animation_density_cache_frame = frame
	return _animation_density_cache_value


func _advance_animation_budget(delta: float) -> void:
	if not _animation_budget_active or anim_player == null:
		return
	if (
		_crowd_batch_registered
		and is_instance_valid(_crowd_batch_manager)
		and not bool(
			_crowd_batch_manager.call("should_advance_animation", self)
		)
	):
		return
	var dense: bool = _is_dense_animation_crowd()
	if dense != _animation_budget_dense:
		_reset_animation_budget_phase(dense)
	var current_animation: StringName = anim_player.current_animation
	if current_animation != _animation_budget_animation:
		_animation_budget_animation = current_animation
		_reset_animation_budget_phase(dense)
		anim_player.advance(0.0)
	var target_hz: float = (
		DENSE_TROOP_ANIMATION_HZ
		if dense
		else NORMAL_TROOP_ANIMATION_HZ
	)
	var interval: float = 1.0 / target_hz
	_animation_budget_accumulator += delta
	if _animation_budget_accumulator < interval:
		return
	var elapsed: float = _animation_budget_accumulator
	_animation_budget_accumulator = fmod(_animation_budget_accumulator, interval)
	anim_player.advance(elapsed)


func _reset_animation_budget_phase(dense: bool) -> void:
	_animation_budget_dense = dense
	var target_hz: float = DENSE_TROOP_ANIMATION_HZ if dense else NORMAL_TROOP_ANIMATION_HZ
	var phase_slots: int = maxi(1, roundi(60.0 / target_hz))
	var phase_index: int = posmod(_troop_order_key(self), phase_slots)
	var interval: float = 1.0 / target_hz
	_animation_budget_accumulator = -interval * float(phase_index) / float(phase_slots)

func _physics_process(delta: float) -> void:
	var profile_started_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0
	_advance_animation_budget(delta)
	if (
		_harpoon_immunity_ticks > 0
		and Engine.get_physics_frames() > _harpoon_immunity_started_frame
	):
		_harpoon_immunity_ticks -= 1
	if _is_dead or state == State.INACTIVE or state == State.VICTORY:
		return
	var profile_animation_usec: int = (
		Time.get_ticks_usec() - profile_started_usec
		if _ai_profile_enabled
		else 0
	)
	delta = combat_delta(delta)
	_update_tactical_boost(delta)
	# Force scale every frame — GLB animations override it otherwise
	# Animation scale tracks are stripped in _setup_animations(). Avoid
	# dirtying every descendant transform when the scale is already correct.
	if (
		not is_equal_approx(scale.x, _spawn_scale)
		or not is_equal_approx(scale.y, _spawn_scale)
		or not is_equal_approx(scale.z, _spawn_scale)
	):
		scale = Vector3(_spawn_scale, _spawn_scale, _spawn_scale)
	_update_hp_bar()
	var profile_common_end_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0
	# Periodic retargeting uses replay time, not rendered frame count. Browser
	# FPS can dip below 60; frame-count timers made replays drift from the
	# server's fixed 60 Hz simulation.
	_retarget_timer += delta
	if _retarget_timer >= RETARGET_INTERVAL_SEC:
		_retarget_timer = fmod(_retarget_timer, RETARGET_INTERVAL_SEC)
		_find_next_target()
	# Immediate guard threat check — suppressed while a rally focus is locked.
	_check_guard_threat()
	var profile_targeting_end_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0
	match state:
		State.RUNNING:
			_move_to_target(delta)
		State.ATTACKING:
			_do_attack(delta)
	if _ai_profile_enabled:
		_record_ai_profile_sample(
			profile_animation_usec,
			profile_common_end_usec - profile_started_usec - profile_animation_usec,
			profile_targeting_end_usec - profile_common_end_usec,
			Time.get_ticks_usec() - profile_targeting_end_usec
		)


static func _record_ai_profile_sample(
	animation_usec: int,
	common_usec: int,
	targeting_usec: int,
	action_usec: int
) -> void:
	var frame := Engine.get_physics_frames()
	if frame != _ai_profile_last_frame:
		_ai_profile_last_frame = frame
		_ai_profile_frame_count += 1
	_ai_profile_troop_calls += 1
	_ai_profile_animation_usec += animation_usec
	_ai_profile_common_usec += common_usec
	_ai_profile_targeting_usec += targeting_usec
	_ai_profile_action_usec += action_usec
	if _ai_profile_frame_count < 20:
		return
	var frame_count := maxf(float(_ai_profile_frame_count), 1.0)
	print(
		(
			"[TROOP_AI_PROFILE] frames=%d calls=%d "
			+ "animation_ms_per_frame=%.3f common_ms_per_frame=%.3f "
			+ "targeting_ms_per_frame=%.3f action_ms_per_frame=%.3f "
			+ "total_ms_per_frame=%.3f"
		)
		% [
			_ai_profile_frame_count,
			_ai_profile_troop_calls,
			float(_ai_profile_animation_usec) / frame_count / 1000.0,
			float(_ai_profile_common_usec) / frame_count / 1000.0,
			float(_ai_profile_targeting_usec) / frame_count / 1000.0,
			float(_ai_profile_action_usec) / frame_count / 1000.0,
			float(
				_ai_profile_animation_usec
				+ _ai_profile_common_usec
				+ _ai_profile_targeting_usec
				+ _ai_profile_action_usec
			) / frame_count / 1000.0,
		]
	)
	_ai_profile_frame_count = 0
	_ai_profile_troop_calls = 0
	_ai_profile_animation_usec = 0
	_ai_profile_common_usec = 0
	_ai_profile_targeting_usec = 0
	_ai_profile_action_usec = 0


static func _record_move_profile_sample(
	target_usec: int,
	slot_usec: int,
	face_usec: int,
	steering_usec: int,
	state_usec: int
) -> void:
	var frame := Engine.get_physics_frames()
	if frame != _move_profile_last_frame:
		_move_profile_last_frame = frame
		_move_profile_frame_count += 1
	_move_profile_calls += 1
	_move_profile_target_usec += target_usec
	_move_profile_slot_usec += slot_usec
	_move_profile_face_usec += face_usec
	_move_profile_steering_usec += steering_usec
	_move_profile_state_usec += state_usec
	if _move_profile_frame_count < 20:
		return
	var frame_count := maxf(float(_move_profile_frame_count), 1.0)
	print(
		(
			"[TROOP_MOVE_PROFILE] frames=%d calls=%d "
			+ "target_ms_per_frame=%.3f slot_ms_per_frame=%.3f "
			+ "face_ms_per_frame=%.3f steering_ms_per_frame=%.3f "
			+ "state_ms_per_frame=%.3f total_ms_per_frame=%.3f"
		)
		% [
			_move_profile_frame_count,
			_move_profile_calls,
			float(_move_profile_target_usec) / frame_count / 1000.0,
			float(_move_profile_slot_usec) / frame_count / 1000.0,
			float(_move_profile_face_usec) / frame_count / 1000.0,
			float(_move_profile_steering_usec) / frame_count / 1000.0,
			float(_move_profile_state_usec) / frame_count / 1000.0,
			float(
				_move_profile_target_usec
				+ _move_profile_slot_usec
				+ _move_profile_face_usec
				+ _move_profile_steering_usec
				+ _move_profile_state_usec
			) / frame_count / 1000.0,
		]
	)
	_move_profile_frame_count = 0
	_move_profile_calls = 0
	_move_profile_target_usec = 0
	_move_profile_slot_usec = 0
	_move_profile_face_usec = 0
	_move_profile_steering_usec = 0
	_move_profile_state_usec = 0


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "TroopAnimPlayer"
	anim_player.set_meta("clash_troop_animation_managed", true)
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)

	# Build cache key from sorted anim_files paths
	var cache_key: String = _animation_cache_key(anim_files, anim_file_aliases)
	var lib: AnimationLibrary
	if _anim_lib_cache.has(cache_key):
		lib = _anim_lib_cache[cache_key]
	else:
		lib = AnimationLibrary.new()
		for file_path in anim_files:
			var res: Resource = ResourceLoader.load(file_path, "PackedScene")
			if res == null:
				continue
			var instance: Node3D = Node3D.new()
			add_child(instance)
			var real_inst: Node = res.instantiate()
			instance.add_child(real_inst)
			_hide_meshes(instance)
			var src: AnimationPlayer = _find_anim_player(real_inst)
			if src:
				for anim_name in src.get_animation_list():
					if anim_name == "RESET" or anim_name == "T-Pose":
						continue
					var anim: Animation = src.get_animation(anim_name)
					var target_name: String = str(anim_file_aliases.get(file_path, anim_name))
					if anim and not lib.has_animation(target_name):
						var dup: Animation = anim.duplicate()
						if target_name.begins_with("Running") or target_name.begins_with("Walking") or target_name.begins_with("Idle") or target_name == "Cheering":
							dup.loop_mode = Animation.LOOP_LINEAR
						# Strip ALL scale and position tracks — they override spawn scale
						for ti in range(dup.get_track_count() - 1, -1, -1):
							var path: String = str(dup.track_get_path(ti))
							if ":scale" in path or ":position" in path:
								dup.remove_track(ti)
						lib.add_animation(target_name, dup)
			instance.free()
		_anim_lib_cache[cache_key] = lib

	anim_player.add_animation_library("", lib)

	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


const SLOT_OFFSETS: Array = [-0.0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]


func _slot_target_cache_key() -> String:
	if target_guard != null and is_instance_valid(target_guard):
		return "guard:%d" % int(target_guard.get_instance_id())
	var target_node: Node = target_building.get("node", null)
	return "building:%d" % int(target_node.get_instance_id()) if is_instance_valid(target_node) else "building:missing"


func _get_slot_angle_group(_target_pos: Vector3) -> Dictionary:
	var frame: int = combat_cache_key()
	if frame != _slot_angle_cache_frame:
		_slot_angle_groups.clear()
		_slot_angle_cache_frame = frame
	var target_key: String = _slot_target_cache_key()
	if _slot_angle_groups.has(target_key):
		return _slot_angle_groups[target_key]

	var matching_troops: Array = []
	var troop_indices: Dictionary = {}
	for other in _get_troops_cached():
		if not is_instance_valid(other) or not (other is BaseTroop):
			continue
		if target_guard != null:
			if other.target_guard != target_guard:
				continue
		elif other.target_building.get("node") != target_building.get("node"):
			continue
		troop_indices[int(other.get_instance_id())] = matching_troops.size()
		matching_troops.append(other)
	var group: Dictionary = {
		"troops": matching_troops,
		"indices": troop_indices,
	}
	_slot_angle_groups[target_key] = group
	return group


## Static version of the _setup_animations cache-build path. Populates
## `_anim_lib_cache[cache_key]` WITHOUT needing a real troop instance — call
## from warmup/boot so the FIRST troop deployed at attack time pulls a
## pre-built library instead of decoding 5 GLBs + duplicating every track.
##
## IMPORTANT: called from warmup._ready(), which runs while the parent scene
## is still wiring its children. `add_child()` on the SceneTree root during
## that window raises "Parent node is busy setting up children". The
## instantiated GLB nodes are kept OUT of the tree — AnimationPlayer's
## `get_animation_list()` and `get_animation()` both work on detached nodes,
## they don't require tree presence.
static func prewarm_anim_library(anim_files_list: Array, file_aliases: Dictionary = {}) -> void:
	if anim_files_list.is_empty():
		return
	var cache_key: String = _animation_cache_key(anim_files_list, file_aliases)
	if _anim_lib_cache.has(cache_key):
		return
	var lib := AnimationLibrary.new()
	for file_path in anim_files_list:
		var res: Resource = ResourceLoader.load(file_path, "PackedScene")
		if res == null:
			continue
		var inst: Node = res.instantiate()
		var src: AnimationPlayer = _find_anim_player_recursive(inst)
		if src:
			for anim_name in src.get_animation_list():
				if anim_name == "RESET" or anim_name == "T-Pose":
					continue
				var anim: Animation = src.get_animation(anim_name)
				var target_name: String = str(file_aliases.get(file_path, anim_name))
				if anim and not lib.has_animation(target_name):
					var dup: Animation = anim.duplicate()
					if target_name.begins_with("Running") or target_name.begins_with("Walking") or target_name.begins_with("Idle") or target_name == "Cheering":
						dup.loop_mode = Animation.LOOP_LINEAR
					for ti in range(dup.get_track_count() - 1, -1, -1):
						var path: String = str(dup.track_get_path(ti))
						if ":scale" in path or ":position" in path:
							dup.remove_track(ti)
					lib.add_animation(target_name, dup)
		# Free the detached instance; no queue_free needed since it's not in tree.
		inst.free()
	_anim_lib_cache[cache_key] = lib


static func _animation_cache_key(anim_files_list: Array, file_aliases: Dictionary = {}) -> String:
	var key_parts: PackedStringArray = []
	for file_path in anim_files_list:
		var path := str(file_path)
		key_parts.append("%s=>%s" % [path, str(file_aliases.get(path, ""))])
	return "|".join(key_parts)


## Recursive AnimationPlayer search — unlike `_find_anim_player` (instance
## method), this is static so it can run during boot warmup.
static func _find_anim_player_recursive(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var found := _find_anim_player_recursive(child)
		if found:
			return found
	return null


## Animation file paths for the medium rig — shared by Knight, Mage, and Archer.
## Legacy modular troops that use this rig should assign
## `anim_files = MEDIUM_RIG_ANIM_FILES` in `_init_stats()`.
const MEDIUM_RIG_ANIM_FILES: Array = [
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]
const PIRATE_ARCHER_ANIM_FILES: Array = [
	"res://Model/Characters/pirate_archer/animations/idle_battle.fbx",
	"res://Model/Characters/pirate_archer/animations/run_battle_in_place.fbx",
	"res://Model/Characters/pirate_archer/animations/attack_01.fbx",
	"res://Model/Characters/pirate_archer/animations/get_hit_01.fbx",
	"res://Model/Characters/pirate_archer/animations/victory.fbx",
]
const PIRATE_ARCHER_ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/pirate_archer/animations/idle_battle.fbx": "Idle_A",
	"res://Model/Characters/pirate_archer/animations/run_battle_in_place.fbx": "Running_A",
	"res://Model/Characters/pirate_archer/animations/attack_01.fbx": "Ranged_Bow_Release",
	"res://Model/Characters/pirate_archer/animations/get_hit_01.fbx": "GetHit",
	"res://Model/Characters/pirate_archer/animations/victory.fbx": "Cheering",
}
const PIRATE_MAGE_ANIM_FILES: Array = [
	"res://Model/Characters/pirate_mage/animations/idle_battle.fbx",
	"res://Model/Characters/pirate_mage/animations/run_battle_in_place.fbx",
	"res://Model/Characters/pirate_mage/animations/attack_01.fbx",
	"res://Model/Characters/pirate_mage/animations/get_hit_01.fbx",
	"res://Model/Characters/pirate_mage/animations/victory.fbx",
]
const PIRATE_MAGE_ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/pirate_mage/animations/idle_battle.fbx": "Idle_A",
	"res://Model/Characters/pirate_mage/animations/run_battle_in_place.fbx": "Running_A",
	"res://Model/Characters/pirate_mage/animations/attack_01.fbx": "Ranged_Magic_Spellcasting",
	"res://Model/Characters/pirate_mage/animations/get_hit_01.fbx": "GetHit",
	"res://Model/Characters/pirate_mage/animations/victory.fbx": "Cheering",
}
const PIRATE_KNIGHT_ANIM_FILES: Array = [
	"res://Model/Characters/pirate_knight/animations/idle_battle.fbx",
	"res://Model/Characters/pirate_knight/animations/run_battle_in_place.fbx",
	"res://Model/Characters/pirate_knight/animations/attack_01.fbx",
	"res://Model/Characters/pirate_knight/animations/get_hit_01.fbx",
	"res://Model/Characters/pirate_knight/animations/victory.fbx",
]
const PIRATE_KNIGHT_ANIM_ALIASES: Dictionary = {
	"res://Model/Characters/pirate_knight/animations/idle_battle.fbx": "Idle_A",
	"res://Model/Characters/pirate_knight/animations/run_battle_in_place.fbx": "Running_A",
	"res://Model/Characters/pirate_knight/animations/attack_01.fbx": "Melee_1H_Attack_Chop",
	"res://Model/Characters/pirate_knight/animations/get_hit_01.fbx": "GetHit",
	"res://Model/Characters/pirate_knight/animations/victory.fbx": "Cheering",
}
## Y offset for spawning projectiles from the troop's hand/weapon bone.
const PROJECTILE_SPAWN_Y: float = 0.08
## Y offset applied to the aim target position so projectiles arc toward the building's centre.
const TARGET_AIM_Y: float = 0.05

const HP_BAR_W: float = 0.12
const HP_BAR_H: float = 0.012
## Shared .gdshader file — one pipeline variant for BOTH troop and building bars.
## Previously two inline string shaders (base_troop + building_system) caused two
## separate WebGL2 compiles on first use.
const HP_BAR_SHADER_PATH: String = "res://shaders/hp_bar.gdshader"

## Shared shader — compiled once on GPU, reused by all HP bars (troop + building).
static var _hp_shader: Shader = null

static func _get_hp_shader() -> Shader:
	if _hp_shader == null:
		_hp_shader = load(HP_BAR_SHADER_PATH)
	return _hp_shader

static func _make_hp_shader_mat(color: Color, size: Vector2, priority: int) -> ShaderMaterial:
	var mat: ShaderMaterial = ShaderMaterial.new()
	mat.shader = _get_hp_shader()
	mat.set_shader_parameter("albedo", color)
	mat.set_shader_parameter("bar_size", size)
	mat.render_priority = priority
	return mat

func _create_hp_bar() -> void:
	_hp_bar = Node3D.new()
	_hp_bar.top_level = true
	add_child(_hp_bar)
	var bg: MeshInstance3D = MeshInstance3D.new()
	var bg_mesh: QuadMesh = QuadMesh.new()
	bg_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	bg.mesh = bg_mesh
	bg.material_override = _make_hp_shader_mat(Color(0.15, 0.15, 0.15, 0.75), Vector2(HP_BAR_W, HP_BAR_H), 10)
	_hp_bar.add_child(bg)
	_hp_fill = MeshInstance3D.new()
	var fill_mesh: QuadMesh = QuadMesh.new()
	fill_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	_hp_fill.mesh = fill_mesh
	_hp_fill.material_override = _make_hp_shader_mat(Color(0.1, 0.85, 0.1, 0.9), Vector2(HP_BAR_W, HP_BAR_H), 11)
	_hp_fill.position.z = -0.001
	_hp_bar.add_child(_hp_fill)
	_hp_bar.visible = false


func _update_hp_bar() -> void:
	if _dense_render_tier_applied > 0:
		if hp < max_hp and hp > 0:
			if not _batched_hp_registered:
				var batch := TROOP_HEALTH_BAR_BATCH.ensure_for(self)
				if batch != null:
					batch.register_troop(self)
					_batched_hp_registered = true
		else:
			_unregister_batched_hp_bar()
		return
	if hp >= max_hp:
		if is_instance_valid(_hp_bar) and _hp_bar.visible:
			_hp_bar.visible = false
		return
	if not is_instance_valid(_hp_bar) or not is_instance_valid(_hp_fill):
		_create_hp_bar()
	if not is_instance_valid(_hp_bar) or not is_instance_valid(_hp_fill):
		return
	_hp_bar.visible = true
	_hp_bar.global_position = global_position + Vector3(0, 0.25, 0)
	# Billboard rotation — only every 4th frame (camera barely moves)
	_hp_bar_frame += 1
	if _hp_bar_frame % 4 == 0:
		var cam = _get_camera_cached()
		if cam:
			var dir = cam.global_position - _hp_bar.global_position
			dir.y = 0
			if dir.length_squared() > 0.001:
				_hp_bar.global_transform.basis = Basis.looking_at(-dir.normalized(), Vector3.UP)
	var ratio: float = float(hp) / float(max_hp)
	# Skip shader updates when ratio hasn't meaningfully changed
	if absf(ratio - _last_hp_ratio) < 0.005 and _last_hp_ratio >= 0.0:
		return
	_last_hp_ratio = ratio
	var fill_w: float = HP_BAR_W * ratio
	(_hp_fill.mesh as QuadMesh).size.x = fill_w
	_hp_fill.position.x = -(HP_BAR_W - fill_w) * 0.5
	var mat: ShaderMaterial = _hp_fill.material_override as ShaderMaterial
	mat.set_shader_parameter("bar_size", Vector2(fill_w, HP_BAR_H))
	# Use pre-allocated static Colors to avoid per-frame allocation
	var band: int = 2 if ratio > 0.5 else (1 if ratio > 0.25 else 0)
	if band != _last_hp_band:
		_last_hp_band = band
		mat.set_shader_parameter("albedo", _HP_COLORS[band])


func _unregister_batched_hp_bar() -> void:
	if not _batched_hp_registered:
		return
	var batch := TROOP_HEALTH_BAR_BATCH.ensure_for(self)
	if batch != null:
		batch.unregister_troop(self)
	_batched_hp_registered = false


func _apply_rally_target() -> bool:
	if not _rally_active:
		return false
	if not _has_valid_rally_target():
		clear_rally()
		return false

	if _rally_target_guard != null:
		if not can_target_guards:
			return false
		if target_guard != _rally_target_guard:
			var rally_guard_payload: Dictionary = _merge_target_switch_context(_guard_target_payload(_rally_target_guard), INF)
			target_guard = _rally_target_guard
			target_building = {}
			target_bs = null
			_orbit_angle = 0.0
			_record_replay_telemetry("target_switch", rally_guard_payload)
			if state != State.RUNNING:
				state = State.RUNNING
				if anim_player.has_animation("Running_A"):
					anim_player.play("Running_A")
		elif state == State.IDLE:
			state = State.RUNNING
			if anim_player.has_animation("Running_A"):
				anim_player.play("Running_A")
		return true

	if _rally_target_building.size() > 0:
		if _rally_target_building.get("node") != target_building.get("node"):
			var rally_building_payload: Dictionary = _merge_target_switch_context(_building_target_payload(_rally_target_building), INF)
			target_building = _rally_target_building
			target_bs = _rally_target_bs
			target_guard = null
			_orbit_angle = 0.0
			_record_replay_telemetry("target_switch", rally_building_payload)
			if state != State.RUNNING:
				state = State.RUNNING
				if anim_player.has_animation("Running_A"):
					anim_player.play("Running_A")
		elif state == State.IDLE:
			state = State.RUNNING
			if anim_player.has_animation("Running_A"):
				anim_player.play("Running_A")
		return true

	return false


func _find_alternative_target() -> void:
	if _apply_rally_target():
		return
	var second_priority: int = 2147483647
	var second_dist_sq: float = INF
	var second_b: Dictionary = {}
	var second_bs = null
	var my_pos = global_position
	var current_node = target_building.get("node")
	for entry in _get_buildings_cached():
		var b = entry.b
		if b.get("hp", 0) <= 0 or not is_instance_valid(b.get("node")):
			continue
		if is_instance_valid(current_node) and b.get("node") == current_node:
			continue
		var priority: int = _building_target_priority(b)
		var dx = my_pos.x - entry.pos.x
		var dz = my_pos.z - entry.pos.z
		var d_sq = dx * dx + dz * dz
		if priority < second_priority or (priority == second_priority and d_sq < second_dist_sq):
			second_priority = priority
			second_dist_sq = d_sq
			second_b = b
			second_bs = entry.bs
	if second_b.size() > 0:
		var alternative_payload: Dictionary = _merge_target_switch_context(_building_target_payload(second_b), second_dist_sq)
		target_building = second_b
		target_bs = second_bs
		target_guard = null
		_orbit_angle = 0.0
		_record_replay_telemetry("target_switch", alternative_payload)
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")


## Scans all live buildings and skeleton guards and picks the closest one.
## Re-evaluates target unless a rally command has a live focus. If the current
## target is still the rally target, keep it even after the marker visual fades.
##
## Rally focus is resolved once when the marker lands. That avoids the old
## behavior where troops followed the marker for a few seconds, then snapped
## back to whatever was closest to each individual troop.
func _find_next_target() -> void:
	if _apply_rally_target():
		return
	var nearest_priority: int = 2147483647
	var nearest_dist_sq: float = INF
	var nearest_b: Dictionary = {}
	var nearest_bs_ref = null
	var nearest_guard: Node3D = null
	var my_pos = global_position
	var rally_focus_compatible: bool = can_target_guards or _rally_target_guard == null
	var search_pos: Vector3 = _rally_pos if _is_rally_live() and rally_focus_compatible else my_pos

	for entry in _get_buildings_cached():
		var b = entry.b
		if b.get("hp", 0) <= 0 or not is_instance_valid(b.get("node")):
			continue
		var priority: int = _building_target_priority(b)
		var dx = search_pos.x - entry.pos.x
		var dz = search_pos.z - entry.pos.z
		var d_sq = dx * dx + dz * dz
		if priority < nearest_priority or (priority == nearest_priority and d_sq < nearest_dist_sq):
			nearest_priority = priority
			nearest_dist_sq = d_sq
			nearest_b = b
			nearest_bs_ref = entry.bs
			nearest_guard = null

	if can_target_guards:
		var guards: Array = _get_guards_list_cached()
		var guard_positions: PackedVector3Array = _get_guard_positions_cached()
		for guard_index in range(guards.size()):
			var guard: Variant = guards[guard_index]
			if not is_instance_valid(guard) or not guard.is_inside_tree():
				continue
			if guard.hp <= 0:
				continue
			var priority: int = _guard_target_priority(guard)
			var guard_pos: Vector3 = guard_positions[guard_index]
			var dx = search_pos.x - guard_pos.x
			var dz = search_pos.z - guard_pos.z
			var d_sq = dx * dx + dz * dz
			if priority < nearest_priority or (priority == nearest_priority and d_sq < nearest_dist_sq):
				nearest_priority = priority
				nearest_dist_sq = d_sq
				nearest_b = {}
				nearest_bs_ref = null
				nearest_guard = guard

	if _should_keep_current_target(search_pos, nearest_dist_sq, nearest_b, nearest_guard):
		return

	if nearest_guard:
		# Only reset state if target actually changed
		if nearest_guard != target_guard:
			var nearest_guard_payload: Dictionary = _merge_target_switch_context(_guard_target_payload(nearest_guard), nearest_dist_sq)
			target_guard = nearest_guard
			target_building = {}
			target_bs = null
			_orbit_angle = 0.0
			_record_replay_telemetry("target_switch", nearest_guard_payload)
			if state != State.RUNNING:
				state = State.RUNNING
				if anim_player.has_animation("Running_A"):
					anim_player.play("Running_A")
	elif nearest_b.size() > 0:
		if nearest_b.get("node") != target_building.get("node"):
			var nearest_building_payload: Dictionary = _merge_target_switch_context(_building_target_payload(nearest_b), nearest_dist_sq)
			target_building = nearest_b
			target_bs = nearest_bs_ref
			target_guard = null
			_orbit_angle = 0.0
			_record_replay_telemetry("target_switch", nearest_building_payload)
			if state != State.RUNNING:
				state = State.RUNNING
				if anim_player.has_animation("Running_A"):
					anim_player.play("Running_A")
	else:
		target_building = {}
		target_bs = null
		target_guard = null
		# A target list can be briefly empty while an enemy island is being
		# replaced or its building cache is invalidated. Victory is owned by
		# BSBattle after the Town Hall is actually destroyed; treating an empty
		# scan as victory leaves every troop permanently cheering.
		if state != State.IDLE:
			state = State.IDLE
			if anim_player.has_animation("Idle_A"):
				anim_player.play("Idle_A")


## Target stickiness prevents tiny position differences from flipping troops
## between two almost-equally-close targets.
func _should_keep_current_target(search_pos: Vector3, candidate_dist_sq: float, candidate_b: Dictionary, candidate_guard: Node3D) -> bool:
	if candidate_dist_sq == INF:
		return false
	var candidate_priority: int = (
		_guard_target_priority(candidate_guard)
		if candidate_guard != null
		else _building_target_priority(candidate_b)
	)

	if target_guard != null and is_instance_valid(target_guard) and target_guard.is_inside_tree() and target_guard.hp > 0:
		# Keep an engaged guard through periodic priority searches; switching
		# away and back in one tick resets the melee wind-up indefinitely.
		var gdx_sticky: float = search_pos.x - target_guard.global_position.x
		var gdz_sticky: float = search_pos.z - target_guard.global_position.z
		var sticky_range: float = attack_range * maxf(GUARD_THREAT_MULT, ATTACK_MAX_RANGE_MULT)
		if gdx_sticky * gdx_sticky + gdz_sticky * gdz_sticky <= sticky_range * sticky_range:
			return true
		if _guard_target_priority(target_guard) != candidate_priority:
			return false

	if candidate_guard != null and candidate_guard == target_guard:
		return false
	if candidate_guard == null and candidate_b.size() > 0 and candidate_b.get("node") == target_building.get("node"):
		return false

	var current_dist_sq: float = INF
	if target_guard != null and is_instance_valid(target_guard) and target_guard.is_inside_tree() and target_guard.hp > 0:
		if _guard_target_priority(target_guard) != candidate_priority:
			return false
		var gdx: float = search_pos.x - target_guard.global_position.x
		var gdz: float = search_pos.z - target_guard.global_position.z
		current_dist_sq = gdx * gdx + gdz * gdz
	elif target_building.size() > 0 and target_building.get("hp", 0) > 0 and is_instance_valid(target_building.get("node")):
		if _building_target_priority(target_building) != candidate_priority:
			return false
		var bpos: Vector3 = target_building.node.global_position
		var bdx: float = search_pos.x - bpos.x
		var bdz: float = search_pos.z - bpos.z
		current_dist_sq = bdx * bdx + bdz * bdz

	if current_dist_sq == INF:
		return false
	return sqrt(candidate_dist_sq) + TARGET_SWITCH_MIN_ADVANTAGE >= sqrt(current_dist_sq)


## Target-priority hooks. Lower values are selected first, then distance and
## the existing stable target ordering decide ties. Most troops keep the
## legacy unified nearest-target behavior.
func _building_target_priority(_building: Dictionary) -> int:
	return 0


func _guard_target_priority(_guard: Node3D) -> int:
	return 0


## Immediate guard threat check.
func _check_guard_threat() -> void:
	if not can_target_guards:
		return
	if _rally_active:
		if _has_valid_rally_target():
			return
		clear_rally()
	if target_guard != null:
		return  # already fighting a guard
	var threat_sq: float = (attack_range * GUARD_THREAT_MULT) * (attack_range * GUARD_THREAT_MULT)
	var my_pos = global_position
	var closest_guard: Node3D = null
	var closest_d_sq: float = threat_sq
	var guards: Array = _get_guards_list_cached()
	var guard_positions: PackedVector3Array = _get_guard_positions_cached()
	for guard_index in range(guards.size()):
		var guard: Variant = guards[guard_index]
		if not is_instance_valid(guard) or not guard.is_inside_tree():
			continue
		if guard.hp <= 0:
			continue
		var guard_pos: Vector3 = guard_positions[guard_index]
		var dx = my_pos.x - guard_pos.x
		var dz = my_pos.z - guard_pos.z
		var d_sq = dx * dx + dz * dz
		if d_sq < closest_d_sq:
			closest_d_sq = d_sq
			closest_guard = guard
	if closest_guard:
		var guard_threat_payload: Dictionary = _merge_target_switch_context(_guard_target_payload(closest_guard), closest_d_sq)
		target_guard = closest_guard
		target_building = {}
		target_bs = null
		_orbit_angle = 0.0
		_record_replay_telemetry("target_switch", guard_threat_payload)
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")


func _trigger_victory_all() -> void:
	for troop in _get_troops_cached():
		if is_instance_valid(troop) and troop.state != State.VICTORY:
			troop._play_victory()


func _play_victory() -> void:
	state = State.VICTORY
	target_building = {}
	target_bs = null
	target_guard = null
	_release_animation_budget()
	if anim_player.has_animation("Cheering"):
		anim_player.play("Cheering")
	elif anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


## Applies `dmg` points of damage to this troop. If HP reaches zero the troop
## removes itself from the "troops" group and frees itself from the scene tree.
var _is_dead: bool = false

func take_damage(dmg: int) -> void:
	if _is_dead:
		return
	hp -= dmg
	if hp <= 0:
		_begin_lethal_damage(dmg, "damage")


func heal(amount: int) -> int:
	if _is_dead or amount <= 0 or hp <= 0 or hp >= max_hp:
		return 0
	var before: int = hp
	hp = mini(max_hp, hp + amount)
	_update_hp_bar()
	return hp - before


func show_healing_feedback(duration: float = 0.42) -> void:
	if _is_dead or hp <= 0:
		return
	var status_batch := _get_troop_status_batch()
	if status_batch != null:
		status_batch.show_status(
			self,
			TroopStatusBatch.EFFECT_HEAL,
			duration
		)


func can_receive_tactical_boost() -> bool:
	return (
		not _is_dead
		and state != State.INACTIVE
		and state != State.VICTORY
		and not has_meta("summoned_unit")
		and not has_meta("evolution_child")
	)


func apply_tactical_boost(
	duration: float,
	damage_multiplier: float,
	speed_multiplier: float
) -> bool:
	if not can_receive_tactical_boost():
		return false
	var safe_duration := maxf(0.0, duration)
	var safe_damage_multiplier := maxf(1.0, damage_multiplier)
	var safe_speed_multiplier := maxf(1.0, speed_multiplier)
	if not _tactical_boost_active:
		_tactical_boost_active = true
		_tactical_boost_base_damage = damage
		_tactical_boost_base_atk_speed = atk_speed
		_tactical_boost_base_move_speed = move_speed
	damage = maxi(1, roundi(float(_tactical_boost_base_damage) * safe_damage_multiplier))
	atk_speed = maxf(0.05, _tactical_boost_base_atk_speed / safe_speed_multiplier)
	move_speed = _tactical_boost_base_move_speed * safe_speed_multiplier
	_tactical_boost_remaining = maxf(_tactical_boost_remaining, safe_duration)
	var status_batch := _get_troop_status_batch()
	if status_batch != null:
		status_batch.show_status(
			self,
			TroopStatusBatch.EFFECT_RAGE,
			safe_duration
		)
	return true


func _update_tactical_boost(delta: float) -> void:
	if not _tactical_boost_active:
		return
	_tactical_boost_remaining -= delta
	if _tactical_boost_remaining <= 0.0:
		_clear_tactical_boost()


func _clear_tactical_boost() -> void:
	if not _tactical_boost_active:
		return
	damage = _tactical_boost_base_damage
	atk_speed = _tactical_boost_base_atk_speed
	move_speed = _tactical_boost_base_move_speed
	_tactical_boost_active = false
	_tactical_boost_remaining = 0.0
	_tactical_boost_base_damage = 0
	_tactical_boost_base_atk_speed = 0.0
	_tactical_boost_base_move_speed = 0.0


func _get_troop_status_batch() -> TroopStatusBatch:
	if is_instance_valid(_status_batch_manager):
		return _status_batch_manager as TroopStatusBatch
	_status_batch_manager = TROOP_STATUS_BATCH.get_for_scene(self)
	return _status_batch_manager as TroopStatusBatch


func tactical_status_radius() -> float:
	var base_radius := maxf(0.16, separation_radius * 1.12)
	match _get_troop_name():
		"FireDragon":
			return maxf(base_radius, 0.34)
		"MechanicalDragon":
			return maxf(base_radius, 0.31)
		"DemonKing":
			return maxf(base_radius, 0.30)
		"IceGolem":
			return maxf(base_radius, 0.28)
		"Horror":
			return maxf(base_radius, 0.25)
		"Necromancer", "WindMage":
			return maxf(base_radius, 0.22)
		_:
			return base_radius


## Applies the same level-based shark trap damage as the server replay. A
## surviving heavy troop stays active; a lethal hit keeps a short visual shell
## so the bite and disappearance remain readable.
func damage_by_shark_trap(trap_damage: int, visual_duration: float = 0.68) -> bool:
	if _is_dead:
		return false
	var applied_damage := maxi(1, trap_damage)
	var hp_before := hp
	hp = maxi(0, hp - applied_damage)
	_record_replay_telemetry("shark_trap_damage", {
		"damage": applied_damage,
		"hp_before": hp_before,
		"hp_after": hp,
	})
	_update_hp_bar()
	if hp > 0:
		if anim_player != null and anim_player.has_animation("GetHit"):
			anim_player.play("GetHit", 0.05, 1.15)
		return false
	_begin_lethal_damage(applied_damage, "shark_trap", visual_duration, true)
	return true


func _begin_lethal_damage(damage_taken: int, source: String, visual_duration: float = 0.0, shrink_at_end: bool = false) -> void:
	if _is_dead:
		return
	_is_dead = true
	if _crowd_batch_registered and is_instance_valid(_crowd_batch_manager):
		_crowd_batch_manager.call("unregister_troop", self, true)
		_crowd_batch_registered = false
		_crowd_batch_manager = null
	if is_instance_valid(_status_batch_manager):
		_status_batch_manager.call("unregister_troop", self)
	var death_payload: Dictionary = {"damage": damage_taken}
	if source != "damage":
		death_payload["source"] = source
	_record_replay_telemetry("troop_death", death_payload)
	_on_lethal_damage(source)
	if is_in_group("troops"):
		remove_from_group("troops")
	invalidate_troops_cache()
	_refresh_dense_troop_rendering()
	if has_method("_clear_owned_projectiles"):
		call("_clear_owned_projectiles")
	set_process(false)
	set_physics_process(false)
	_report_death()
	var total_visual_duration: float = maxf(visual_duration, _death_visual_duration(source))
	if total_visual_duration <= 0.0:
		queue_free()
		return
	_release_animation_budget()
	if anim_player != null and anim_player.has_animation("Death_A"):
		anim_player.speed_scale = 1.0
		anim_player.play("Death_A", 0.05)
	var disappear_time := minf(0.18, total_visual_duration)
	var tween := create_tween()
	tween.tween_interval(maxf(0.0, total_visual_duration - disappear_time))
	if shrink_at_end or disappear_time > 0.0:
		tween.tween_property(self, "scale", Vector3.ZERO, disappear_time).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	tween.tween_callback(queue_free)


## Subclasses may trigger deterministic effects at the exact lethal event.
## The effect must not depend on how long the authored death animation lasts.
func _on_lethal_damage(_source: String) -> void:
	pass


func _death_visual_duration(_source: String) -> float:
	return 0.0


## Compatibility wrapper for older replay/client call sites.
func eliminate_by_shark_trap(visual_duration: float = 0.68) -> void:
	damage_by_shark_trap(maxi(1, hp), visual_duration)


## Records this troop's death for a single end-of-battle UI report. Persistent
## casualties are applied once from the final battle result so troops are not
## removed twice by live death telemetry and replay verification.
func _report_death() -> void:
	var troop_name: String = _get_troop_name()
	if troop_name == "":
		return
	for bs_node in _get_building_systems_cached():
		if is_instance_valid(bs_node) and "_replay_active" in bs_node and bs_node._replay_active:
			return
	var replay_order: int = -1
	if has_meta("replay_order"):
		replay_order = int(get_meta("replay_order"))
	var troop_instance: int = int(get_instance_id())
	for bs_node in _get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_troop_death_once"):
			if bs_node.record_troop_death_once(troop_name, troop_instance, replay_order):
				return


## Returns the canonical troop name from this script's path.
func _get_troop_name() -> String:
	var script_res = get_script()
	if script_res == null:
		return ""
	var file: String = script_res.resource_path.get_file().get_basename()
	match file:
		"knight": return "Knight"
		"mage": return "Mage"
		"barbarian": return "Barbarian"
		"archer": return "Archer"
		"pea_shooter": return "PeaShooter"
		"ranger": return "Ranger"
		"mimic": return "Mimic"
		"necromancer": return "Necromancer"
		"necromancer_skeleton": return "NecromancerSkeleton"
		"horror_evolution": return "Horror"
		"mechanical_dragon": return "MechanicalDragon"
		"ice_golem": return "IceGolem"
		"wind_mage": return "WindMage"
		"windling": return "Windling"
		"demon_king": return "DemonKing"
		"fire_dragon": return "FireDragon"
	return ""


func _record_replay_telemetry(kind: String, data: Dictionary = {}) -> void:
	if not has_active_replay_telemetry_sink():
		return
	var payload: Dictionary = data.duplicate(true)
	payload.troop_instance = int(get_instance_id())
	if has_meta("replay_order"):
		payload.replay_order = int(get_meta("replay_order"))
	payload.troop = _get_troop_name()
	payload.level = level
	payload.hp = hp
	payload.state = int(state)
	payload.attack_timer = snappedf(attack_timer, 0.001)
	payload.orbit_angle = snappedf(_orbit_angle, 0.001)
	var telemetry_position: Vector3 = global_position if is_inside_tree() else position
	payload.x = snappedf(telemetry_position.x, 0.001)
	payload.z = snappedf(telemetry_position.z, 0.001)
	for bs_node in _get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_replay_telemetry"):
			bs_node.record_replay_telemetry(kind, payload)
			return


## `guard_ref` is intentionally untyped: callers may pass a Node3D that was
## freed earlier this frame (e.g. when a SkeletonGuard dies under our attack
## and combat telemetry runs in the same frame). A typed `Node3D` parameter
## would reject the freed instance at the argument-binding stage before the
## `is_instance_valid` guard below ever runs.
func _target_payload_from_refs(target_ref: Dictionary = {}, guard_ref = null) -> Dictionary:
	var payload: Dictionary = {}
	if guard_ref != null and is_instance_valid(guard_ref):
		payload["target_kind"] = "guard"
		payload["target_instance"] = int(guard_ref.get_instance_id())
		payload["target_hp"] = int(guard_ref.get("hp")) if guard_ref.get("hp") != null else -1
		payload["target_x"] = snappedf(guard_ref.global_position.x, 0.001)
		payload["target_z"] = snappedf(guard_ref.global_position.z, 0.001)
		return payload
	if target_ref.size() > 0:
		payload["target_kind"] = "building"
		payload["target_type"] = str(target_ref.get("id", ""))
		payload["target_server_id"] = int(target_ref.get("server_id", -1))
		payload["target_hp"] = int(target_ref.get("hp", 0))
		var node: Node3D = target_ref.get("node", null)
		if is_instance_valid(node):
			payload["target_x"] = snappedf(node.global_position.x, 0.001)
			payload["target_z"] = snappedf(node.global_position.z, 0.001)
		return payload
	payload["target_kind"] = "none"
	return payload


func _current_target_telemetry_payload() -> Dictionary:
	return _target_payload_from_refs(target_building, target_guard)


func _previous_target_payload() -> Dictionary:
	var prev: Dictionary = _current_target_telemetry_payload()
	var payload: Dictionary = {}
	for key in prev.keys():
		payload["previous_" + str(key)] = prev[key]
	return payload


func _merge_target_switch_context(payload: Dictionary, dist_sq: float) -> Dictionary:
	if not has_active_replay_telemetry_sink():
		return payload
	var previous_payload: Dictionary = _previous_target_payload()
	for key in previous_payload.keys():
		payload[key] = previous_payload[key]
	if dist_sq != INF:
		payload["target_dist"] = snappedf(sqrt(dist_sq), 0.001)
	payload["target_candidates"] = _target_candidates_payload(5)
	return payload


func _target_candidates_payload(limit: int = 5) -> Array:
	var candidates: Array = []
	for entry in _get_buildings_cached():
		var b: Dictionary = entry.get("b", {})
		if int(b.get("hp", 0)) <= 0:
			continue
		var pos: Vector3 = entry.get("pos", Vector3.ZERO)
		var dx: float = global_position.x - pos.x
		var dz: float = global_position.z - pos.z
		candidates.append({
			"kind": "building",
			"type": str(b.get("id", "")),
			"server_id": int(b.get("server_id", -1)),
			"hp": int(b.get("hp", 0)),
			"dist": snappedf(sqrt(dx * dx + dz * dz), 0.001),
			"x": snappedf(pos.x, 0.001),
			"z": snappedf(pos.z, 0.001),
		})
	for guard in _get_guards_list_cached():
		if not is_instance_valid(guard):
			continue
		var guard_hp: Variant = guard.get("hp")
		if guard_hp != null and int(guard_hp) <= 0:
			continue
		var gdx: float = global_position.x - guard.global_position.x
		var gdz: float = global_position.z - guard.global_position.z
		candidates.append({
			"kind": "guard",
			"type": "guard",
			"instance": int(guard.get_instance_id()),
			"hp": int(guard_hp) if guard_hp != null else -1,
			"dist": snappedf(sqrt(gdx * gdx + gdz * gdz), 0.001),
			"x": snappedf(guard.global_position.x, 0.001),
			"z": snappedf(guard.global_position.z, 0.001),
		})
	candidates.sort_custom(func(a, b): return float(a.get("dist", 0.0)) < float(b.get("dist", 0.0)))
	if candidates.size() > limit:
		return candidates.slice(0, limit)
	return candidates


func _record_projectile_payload(kind: String, payload: Dictionary, projectile_pos: Vector3, extra: Dictionary = {}) -> void:
	if not has_active_replay_telemetry_sink():
		return
	payload["projectile_x"] = snappedf(projectile_pos.x, 0.001)
	payload["projectile_y"] = snappedf(projectile_pos.y, 0.001)
	payload["projectile_z"] = snappedf(projectile_pos.z, 0.001)
	payload["attack_timer"] = snappedf(attack_timer, 0.001)
	payload["damage"] = damage
	for key in extra.keys():
		payload[key] = extra[key]
	_record_replay_telemetry(kind, payload)


func _record_projectile_telemetry(kind: String, target_ref: Dictionary, guard_ref = null, projectile_pos: Vector3 = Vector3.ZERO, extra: Dictionary = {}) -> void:
	if not has_active_replay_telemetry_sink():
		return
	_record_projectile_payload(kind, _target_payload_from_refs(target_ref, guard_ref), projectile_pos, extra)


func _record_building_destroyed_once(target_ref: Dictionary, bs_ref = null, reason: String = "") -> void:
	if target_ref.is_empty():
		return
	if bool(target_ref.get("_destroy_telemetry_recorded", false)):
		return
	target_ref["_destroy_telemetry_recorded"] = true
	var gp: Vector2i = target_ref.get("grid_pos", Vector2i.ZERO)
	var payload: Dictionary = {
		"type": str(target_ref.get("id", "")),
		"server_id": int(target_ref.get("server_id", -1)),
		"grid_x": int(gp.x),
		"grid_z": int(gp.y),
		"hp": int(target_ref.get("hp", 0)),
	}
	if reason != "":
		payload["reason"] = reason
	if bs_ref != null and is_instance_valid(bs_ref) and bs_ref.has_method("record_replay_telemetry"):
		bs_ref.record_replay_telemetry("building_destroyed", payload)
		return
	for bs_node in _get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_replay_telemetry"):
			bs_node.record_replay_telemetry("building_destroyed", payload)
			return


func _building_target_payload(b: Dictionary) -> Dictionary:
	var payload := {
		"target_kind": "building",
		"target_type": str(b.get("id", "")),
		"target_server_id": int(b.get("server_id", -1)),
		"target_hp": int(b.get("hp", 0)),
	}
	var node: Node3D = b.get("node", null)
	if is_instance_valid(node):
		payload["target_x"] = snappedf(node.global_position.x, 0.001)
		payload["target_z"] = snappedf(node.global_position.z, 0.001)
	return payload


func _guard_target_payload(guard: Node3D) -> Dictionary:
	var target_payload: Dictionary = {
		"target_kind": "guard",
		"target_instance": int(guard.get_instance_id()) if is_instance_valid(guard) else -1,
	}
	if is_instance_valid(guard):
		var guard_hp: Variant = guard.get("hp")
		target_payload.target_hp = int(guard_hp) if guard_hp != null else -1
		target_payload.target_x = snappedf(guard.global_position.x, 0.001)
		target_payload.target_z = snappedf(guard.global_position.z, 0.001)
	return target_payload


func _has_valid_target() -> bool:
	if target_guard != null and is_instance_valid(target_guard) and target_guard.is_inside_tree():
		return true
	return target_building.size() > 0 and is_instance_valid(target_building.get("node"))


func _get_target_position() -> Vector3:
	if target_guard != null and is_instance_valid(target_guard):
		return target_guard.global_position
	if target_building.size() > 0 and is_instance_valid(target_building.get("node")):
		return target_building.get("node").global_position
	return global_position


func _target_flat_distance() -> float:
	var target_pos: Vector3 = _get_target_position()
	var dx: float = target_pos.x - global_position.x
	var dz: float = target_pos.z - global_position.z
	return sqrt(dx * dx + dz * dz)


func _resume_chase_if_target_far() -> bool:
	if not _has_valid_target():
		_find_next_target()
		return true
	if _target_flat_distance() > attack_range * ATTACK_MAX_RANGE_MULT:
		state = State.RUNNING
		if anim_player and anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return true
	return false


func _face_current_target() -> void:
	var target_pos: Vector3 = _get_target_position()
	var to_target: Vector3 = target_pos - global_position
	to_target.y = 0
	if to_target.length_squared() > 0.001:
		var face_dir: Vector3 = to_target.normalized()
		look_at(global_position + face_dir, Vector3.UP)
		rotate_y(PI)


func _deal_target_damage() -> void:
	if target_guard != null and is_instance_valid(target_guard):
		var guard_payload: Dictionary = _target_payload_from_refs({}, target_guard)
		var guard_hp_before: int = int(target_guard.get("hp")) if target_guard.get("hp") != null else 0
		target_guard.take_damage(damage)
		guard_payload["damage"] = damage
		guard_payload["hp_before"] = guard_hp_before
		guard_payload["hp_after"] = int(target_guard.get("hp")) if is_instance_valid(target_guard) and target_guard.get("hp") != null else guard_hp_before - damage
		_record_replay_telemetry("troop_melee_hit", guard_payload)
		if not is_instance_valid(target_guard) or not target_guard.is_inside_tree():
			target_guard = null
			_find_next_target()
	elif target_building.size() > 0:
		var building_payload: Dictionary = _target_payload_from_refs(target_building, null)
		var building_hp_before: int = int(target_building.get("hp", 0))
		target_building["hp"] = building_hp_before - damage
		building_payload["damage"] = damage
		building_payload["hp_before"] = building_hp_before
		building_payload["hp_after"] = int(target_building.get("hp", 0))
		_record_replay_telemetry("troop_melee_hit", building_payload)
		if target_building.get("hp", 0) <= 0:
			_destroy_target()
			_find_next_target()


## Calculates the world-space orbit slot position this troop should move toward.
## Every 6/60s it re-evaluates SLOT_OFFSETS to find the angle with maximum
## angular separation from all other troops attacking the same building, writing
## the result to `_orbit_angle`. Returns the slot position as a Vector3.
func _compute_attack_slot(target_pos: Vector3, my_angle: float, delta: float) -> Vector3:
	_slot_eval_timer += delta
	var slot_interval := (
		profile_dense_slot_interval_sec
		if profile_dense_slot_interval_sec > 0.0
		else SLOT_EVAL_INTERVAL_SEC
	)
	if _slot_eval_timer >= slot_interval:
		_slot_eval_timer = fmod(_slot_eval_timer, slot_interval)
		var best_angle = my_angle
		var best_min_dist = 0.0
		var angle_group: Dictionary = _get_slot_angle_group(target_pos)
		var matching_troops: Array = angle_group.get("troops", [])
		if target_guard == null and matching_troops.size() > HIGH_DENSITY_TROOP_THRESHOLD:
			var troop_indices: Dictionary = angle_group.get("indices", {})
			var dense_index: int = int(troop_indices.get(int(get_instance_id()), -1))
			if dense_index >= 0:
				var dense_count: int = matching_troops.size()
				if attack_range >= DENSE_RANGED_SLOT_MIN_RANGE:
					# A single ring cannot fit 40+ ranged troops without their
					# bodies and weapons overlapping. A deterministic annular
					# sunflower layout keeps them readable without restoring
					# the old O(n²) pairwise separation pass.
					var max_radius: float = attack_range * 0.92
					var min_radius: float = maxf(
						separation_radius * 1.65,
						max_radius * 0.50
					)
					var radial_t: float = sqrt(
						(float(dense_index) + 0.5) / float(dense_count)
					)
					var slot_radius: float = lerpf(
						min_radius,
						max_radius,
						radial_t
					)
					_orbit_angle = fmod(
						float(dense_index) * DENSE_RANGED_GOLDEN_ANGLE,
						TAU
					)
					return target_pos + Vector3(
						sin(_orbit_angle),
						0,
						cos(_orbit_angle)
					) * slot_radius
				_orbit_angle = TAU * float(dense_index) / float(dense_count)
				return target_pos + Vector3(
					sin(_orbit_angle),
					0,
					cos(_orbit_angle)
				) * attack_range * 0.95
		# Keep the original live-position behavior for normal-sized fights.
		# Dense swarms only need stable membership, count, and index; avoiding
		# discarded atan2 calculations here materially reduces crowded battles.
		matching_troops.clear()
		var other_angles := PackedFloat64Array()
		for other in _get_troops_cached():
			if not is_instance_valid(other) or not (other is BaseTroop):
				continue
			if target_guard != null:
				if other.target_guard != target_guard:
					continue
			elif other.target_building.get("node") != target_building.get("node"):
				continue
			var other_pos: Vector3 = other.global_position
			matching_troops.append(other)
			other_angles.append(atan2(other_pos.x - target_pos.x, other_pos.z - target_pos.z))
		for test_offset in SLOT_OFFSETS:
			var test_angle = my_angle + test_offset
			var min_other_dist = 999.0
			for angle_index in range(other_angles.size()):
				if matching_troops[angle_index] == self:
					continue
				var other_angle: float = other_angles[angle_index]
				var angle_diff = absf(fmod(test_angle - other_angle + PI, TAU) - PI)
				min_other_dist = minf(min_other_dist, angle_diff)
			if min_other_dist > best_min_dist:
				best_min_dist = min_other_dist
				best_angle = test_angle
		_orbit_angle = best_angle
	return target_pos + Vector3(sin(_orbit_angle), 0, cos(_orbit_angle)) * attack_range * 0.95


## Combined steering: troop separation + guard avoidance + building avoidance.
## Applies movement, clamps to island, restores Y.
func _apply_separation_steering(move_dir: Vector3, target_pos: Vector3, delta: float) -> Vector3:
	var self_pos: Vector3 = global_position
	var troops: Array = _get_troops_cached()
	var sep: Vector3
	if troops.size() > HIGH_DENSITY_TROOP_THRESHOLD:
		var dense_interval := (
			profile_dense_separation_interval
			if profile_dense_separation_interval > 0
			else HIGH_DENSITY_SEPARATION_INTERVAL
		)
		_move_sep_counter = (_move_sep_counter + 1) % dense_interval
		if _move_sep_counter == 0:
			_last_move_separation = _compute_movement_separation(move_dir, self_pos, troops)
		sep = _last_move_separation
	else:
		sep = _compute_movement_separation(move_dir, self_pos, troops)
		_last_move_separation = sep

	var combined := move_dir + sep * separation_force * delta * 3.0
	var next_position := _clamp_to_island(self_pos + combined)
	next_position.y = _resolve_movement_y(target_pos.y)
	# One transform write is important for skinned troops: every write dirties
	# the full Skeleton3D hierarchy, attachments, and weapon transforms.
	global_position = next_position
	return combined


## Flying troops override this so horizontal movement and flight height are
## committed through the same transform write.
func _resolve_movement_y(base_y: float) -> float:
	return base_y


func _compute_movement_separation(move_dir: Vector3, self_pos: Vector3, troops: Array) -> Vector3:
	var sep := Vector3.ZERO
	var sep_range_sq: float = separation_radius * separation_radius * 4.0
	var move_len: float = move_dir.length()
	var forward: Vector3 = move_dir / move_len if move_len > 0.0001 else Vector3.ZERO
	var lateral: Vector3 = Vector3.UP.cross(forward).normalized() if forward.length_squared() > 0.0001 else Vector3.ZERO

	# Dense crowds use a shared spatial hash instead of dropping separation.
	# Each troop checks only adjacent cells, keeping this near O(n) while
	# preventing bodies and weapon attachments from occupying the same space.
	if not can_pass_through_friendly_units:
		if troops.size() > HIGH_DENSITY_TROOP_THRESHOLD:
			sep += _compute_dense_troop_separation(self_pos, troops)
		else:
			for other in troops:
				if other == self or not is_instance_valid(other):
					continue
				var other_pos: Vector3 = other.global_position
				var dx: float = other_pos.x - self_pos.x
				var dz: float = other_pos.z - self_pos.z
				var d_sq: float = dx * dx + dz * dz
				if d_sq > sep_range_sq or d_sq < 0.000001:
					continue
				var d: float = sqrt(d_sq)
				if d < separation_radius:
					var weight: float = (separation_radius - d) / (separation_radius * d)
					sep.x -= dx * weight
					sep.z -= dz * weight

	# Guard avoidance — light push from non-target guards
	var guards: Array = _get_guards_list_cached()
	var guard_positions: PackedVector3Array = _get_guard_positions_cached()
	for guard_index in range(guards.size()):
		var guard: Variant = guards[guard_index]
		if not is_instance_valid(guard) or guard == target_guard:
			continue
		var guard_pos: Vector3 = guard_positions[guard_index]
		var guard_dx: float = guard_pos.x - self_pos.x
		var guard_dz: float = guard_pos.z - self_pos.z
		var gd_sq: float = guard_dx * guard_dx + guard_dz * guard_dz
		if gd_sq < sep_range_sq and gd_sq > 0.000001:
			var gd: float = sqrt(gd_sq)
			if gd < separation_radius:
				var guard_weight: float = (separation_radius - gd) / (separation_radius * gd) * 0.5
				sep.x -= guard_dx * guard_weight
				sep.z -= guard_dz * guard_weight

			# Lateral steer prevents troops from trying to walk through guards.
			if gd < separation_radius * 2.0 and lateral.length_squared() > 0.0001:
				var guard_dir := Vector3(guard_dx / gd, 0.0, guard_dz / gd)
				var ahead: float = guard_dir.dot(forward)
				if ahead > 0.15:
					var side: float = guard_dir.dot(lateral)
					var steer_strength: float = ahead * (1.0 - gd / (separation_radius * 2.0)) * 0.65
					sep += (-lateral if side >= 0.0 else lateral) * steer_strength

	# Building avoidance: push out of non-target buildings using footprint radius.
	var target_node = target_building.get("node")
	for entry in _get_buildings_cached():
		if entry.b.get("node") == target_node:
			continue
		var bnode = entry.b.get("node")
		if not is_instance_valid(bnode):
			continue
		var building_pos: Vector3 = entry.pos
		var building_dx: float = self_pos.x - building_pos.x
		var building_dz: float = self_pos.z - building_pos.z
		var bd_sq: float = building_dx * building_dx + building_dz * building_dz
		var avoid_r: float = float(entry.get("avoid_radius", 0.18))
		if bd_sq <= 0.000001 or bd_sq >= avoid_r * avoid_r:
			continue
		var bd: float = sqrt(bd_sq)
		if bd > 0.001:
			var building_weight: float = (avoid_r - bd) / (avoid_r * bd) * 1.5
			sep.x += building_dx * building_weight
			sep.z += building_dz * building_weight
	return sep


func _compute_dense_troop_separation(self_pos: Vector3, troops: Array) -> Vector3:
	var push := Vector3.ZERO
	var positions: PackedVector3Array = _get_troop_positions_cached()
	var buckets: Dictionary = _get_troop_spatial_buckets_cached()
	var center_cell: Vector2i = _troop_spatial_cell(self_pos)
	var cell_radius: int = maxi(
		1,
		ceili(separation_radius / DENSE_SPATIAL_CELL_SIZE)
	)
	var sep_sq: float = separation_radius * separation_radius
	for cell_z in range(center_cell.y - cell_radius, center_cell.y + cell_radius + 1):
		for cell_x in range(center_cell.x - cell_radius, center_cell.x + cell_radius + 1):
			var cell := Vector2i(cell_x, cell_z)
			if not buckets.has(cell):
				continue
			var bucket: PackedInt32Array = buckets[cell]
			for troop_index in bucket:
				if troop_index < 0 or troop_index >= troops.size():
					continue
				var other: Variant = troops[troop_index]
				if other == self or not is_instance_valid(other):
					continue
				var other_pos: Vector3 = positions[troop_index]
				var dx: float = self_pos.x - other_pos.x
				var dz: float = self_pos.z - other_pos.z
				var d_sq: float = dx * dx + dz * dz
				if d_sq > sep_sq:
					continue
				if d_sq < 0.000001:
					# Held spawn can put several troops at the exact same point.
					# Give each pair an opposite deterministic escape direction.
					var own_order: int = _troop_order_key(self)
					var other_order: int = _troop_order_key(other)
					var low_order: int = mini(own_order, other_order)
					var high_order: int = maxi(own_order, other_order)
					var pair_seed: int = posmod(
						low_order * 93 + high_order * 193,
						3600
					)
					var pair_angle: float = float(pair_seed) * TAU / 3600.0
					var pair_sign: float = 1.0 if own_order < other_order else -1.0
					push.x += cos(pair_angle) * pair_sign
					push.z += sin(pair_angle) * pair_sign
					continue
				var distance: float = sqrt(d_sq)
				var weight: float = (
					(separation_radius - distance)
					/ (separation_radius * distance)
				)
				push.x += dx * weight
				push.z += dz * weight
	return push


## Stuck detection: every 0.6s checks if troop barely moved.
## Rotates orbit angle in small steps; after full rotation, switches target.
func _check_stuck(delta: float, my_angle: float) -> void:
	_stuck_timer += delta
	if _stuck_timer >= 0.6:
		var moved = global_position.distance_to(_last_pos)
		if moved < move_speed * 0.02:
			_orbit_angle += 0.8
			if _orbit_angle > my_angle + TAU:
				_orbit_angle = my_angle
		else:
			_orbit_angle = lerpf(_orbit_angle, my_angle, 0.3)
		_last_pos = global_position
		_stuck_timer = 0.0


func _face_move_direction(direction: Vector3) -> void:
	var flat_direction := Vector3(direction.x, 0.0, direction.z)
	var length_sq: float = flat_direction.length_squared()
	if length_sq <= 0.000001:
		return
	flat_direction /= sqrt(length_sq)
	if (
		_last_face_direction.length_squared() > 0.5
		and _last_face_direction.dot(flat_direction) >= FACE_DIRECTION_DOT_THRESHOLD
	):
		return
	look_at(global_position + flat_direction, Vector3.UP)
	rotate_y(PI)
	_last_face_direction = flat_direction


## Movement each frame: seek target, avoid obstacles, flow around buildings.
func _move_to_target(delta: float) -> void:
	var profile_target_start_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0
	if not _has_valid_target():
		_find_next_target()
		return
	# Forced Harpoon movement is applied by the defense at fixed 60 Hz. Keep
	# targeting/attack state alive but suppress voluntary movement, separation,
	# orbit and standoff correction until the rope releases.
	if is_harpoon_pull_active():
		return

	var target_pos = _get_target_position()
	var diff = Vector3(target_pos.x - global_position.x, 0, target_pos.z - global_position.z)
	var dist_sq = diff.length_squared()
	if dist_sq < 0.0001:
		return
	var dist = sqrt(dist_sq)
	var dir_to_target = diff / dist
	var profile_target_end_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0

	# Orbit slot around buildings (spread troops evenly)
	var my_angle = atan2(global_position.x - target_pos.x, global_position.z - target_pos.z)
	var slot_pos = _compute_attack_slot(target_pos, my_angle, delta)
	var to_slot = slot_pos - global_position
	to_slot.y = 0
	var slot_dist = to_slot.length()
	var dir: Vector3
	if slot_dist > 0.01:
		dir = to_slot / slot_dist
	else:
		dir = dir_to_target
	var profile_slot_end_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0

	# Face target directly (model faces -Z so rotate 180)
	_face_move_direction(dir_to_target)
	var profile_face_end_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0

	# Steering: seek + separation + building avoidance
	_apply_separation_steering(dir * move_speed * delta, target_pos, delta)
	var profile_steering_end_usec: int = Time.get_ticks_usec() if _ai_profile_enabled else 0

	# Enter attack when close to slot or within attack range
	if slot_dist < 0.05 or dist <= attack_range:
		if state != State.ATTACKING:
			# Prime the first attack so a troop that already reached range lands
			# its opening hit instead of waiting a full cooldown cycle.
			attack_timer = _initial_attack_timer()
			_on_enter_attack_state()
			if attack_anim != "" and anim_player.has_animation(attack_anim):
				anim_player.play(attack_anim)
		state = State.ATTACKING
		_face_move_direction(dir_to_target)
		if _ai_profile_enabled:
			_record_move_profile_sample(
				profile_target_end_usec - profile_target_start_usec,
				profile_slot_end_usec - profile_target_end_usec,
				profile_face_end_usec - profile_slot_end_usec,
				profile_steering_end_usec - profile_face_end_usec,
				Time.get_ticks_usec() - profile_steering_end_usec
			)
		return

	# Stuck detection
	_check_stuck(delta, my_angle)
	if _ai_profile_enabled:
		_record_move_profile_sample(
			profile_target_end_usec - profile_target_start_usec,
			profile_slot_end_usec - profile_target_end_usec,
			profile_face_end_usec - profile_slot_end_usec,
			profile_steering_end_usec - profile_face_end_usec,
			Time.get_ticks_usec() - profile_steering_end_usec
		)


func _get_separation() -> Vector3:
	if can_pass_through_friendly_units:
		_last_separation = Vector3.ZERO
		return Vector3.ZERO

	# Dense swarms reuse the same short-range push for a few extra fixed ticks.
	# The authoritative simulator mirrors this bounded attack separation profile;
	# keep the client movement deterministic so replay damage stays comparable.
	var troops = _get_troops_cached()
	var separation_interval: int = (
		HIGH_DENSITY_ATTACK_SEPARATION_INTERVAL
		if troops.size() > HIGH_DENSITY_TROOP_THRESHOLD
		else 3
	)
	_sep_counter += 1
	if _sep_counter % separation_interval != 0:
		return _last_separation

	if troops.size() > HIGH_DENSITY_TROOP_THRESHOLD:
		_last_separation = _compute_dense_troop_separation(global_position, troops)
		return _last_separation

	var push = Vector3.ZERO
	var sep_sq = separation_radius * separation_radius
	var self_pos: Vector3 = global_position
	for other in troops:
		if other == self or not is_instance_valid(other):
			continue
		var other_pos: Vector3 = other.global_position
		var dx: float = self_pos.x - other_pos.x
		var dz: float = self_pos.z - other_pos.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq > sep_sq or d_sq < 0.000001:
			continue
		var d: float = sqrt(d_sq)
		var weight: float = (separation_radius - d) / (separation_radius * d)
		push.x += dx * weight
		push.z += dz * weight
	_last_separation = push
	return push


func _do_attack(delta: float) -> void:
	if not _has_valid_target():
		_find_next_target()
		return

	# Check if target moved far out of range (e.g. skeleton guard walked away)
	var target_pos = _get_target_position()
	var to_target = target_pos - global_position
	to_target.y = 0
	var dist_to_target = to_target.length()
	if dist_to_target > attack_range * 2.0 and not is_harpoon_pull_active():
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return

	# Face the target each frame
	var face_dir = to_target.normalized()
	if face_dir.length_squared() > 0.001:
		_face_move_direction(face_dir)

	# Light separation while attacking — but never push beyond attack range
	if separation_force > 0.0 and not is_harpoon_pull_active():
		var sep = _get_separation()
		if sep.length() > 0.001:
			var new_pos = global_position + sep * separation_force * delta * 0.3
			var new_dist = (target_pos - new_pos).length()
			if new_dist < attack_range * 1.2:
				global_position = _clamp_to_island(new_pos)

	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.stop()
			anim_player.play(attack_anim)
		_play_attack_sfx()
		_deal_target_damage()


func _initial_attack_timer() -> float:
	return atk_speed


func _on_enter_attack_state() -> void:
	pass


func _destroy_target() -> void:
	if target_bs and target_bs.has_method("remove_building"):
		target_bs.remove_building(target_building)
	target_building = {}
	target_bs = null
	target_guard = null


# ── Fire Bomb Explosion ──────────────────────────────────────
const FIRE_BOMB_FRAMES: Array[String] = [
	"res://Model/effeckt/boom/4833049_2540505.png",
	"res://Model/effeckt/boom/4833049_2540505 (1).png",
	"res://Model/effeckt/boom/4833049_2540505 (2).png",
	"res://Model/effeckt/boom/4833049_2540505 (3).png",
	"res://Model/effeckt/boom/4833049_2540505 (4).png",
	"res://Model/effeckt/boom/4833049_2540505 (5).png",
]
const FIRE_BOMB_SCALE: float = 1.8
const FIRE_BOMB_DURATION: float = 0.8

static var _fire_bomb_textures: Array = []

static func _preload_fire_bomb() -> void:
	if not _fire_bomb_textures.is_empty():
		return
	for path in FIRE_BOMB_FRAMES:
		var tex = load(path)
		if tex:
			_fire_bomb_textures.append(tex)


func _spawn_fire_explosion(pos: Vector3) -> void:
	_preload_fire_bomb()
	if _fire_bomb_textures.is_empty():
		return
	var explosion: MeshInstance3D = MeshInstance3D.new()
	var quad: QuadMesh = QuadMesh.new()
	quad.size = Vector2(FIRE_BOMB_SCALE, FIRE_BOMB_SCALE)
	explosion.mesh = quad
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.albedo_texture = _fire_bomb_textures[0]
	mat.albedo_color = Color(1.0, 1.0, 1.0, 1.0)
	explosion.material_override = mat
	get_tree().current_scene.add_child(explosion)
	explosion.global_position = pos + Vector3(0, 0.15, 0)
	var explosion_ref: WeakRef = weakref(explosion)
	# Animate frames then free
	var frame_count: int = _fire_bomb_textures.size()
	var frame_dur: float = FIRE_BOMB_DURATION / float(frame_count)
	var tw: Tween = explosion.create_tween()
	for i in range(frame_count):
		var idx: int = i
		tw.tween_callback(func():
			var explosion_node: MeshInstance3D = explosion_ref.get_ref() as MeshInstance3D
			if is_instance_valid(explosion_node):
				(explosion_node.material_override as StandardMaterial3D).albedo_texture = _fire_bomb_textures[idx]
		).set_delay(frame_dur if i > 0 else 0.0)
	# Fade out in last 30%
	var fade_start: float = FIRE_BOMB_DURATION * 0.7
	tw.parallel().tween_property(mat, "albedo_color:a", 0.0, FIRE_BOMB_DURATION * 0.3).set_delay(fade_start)
	tw.chain().tween_callback(func():
		var explosion_node: MeshInstance3D = explosion_ref.get_ref() as MeshInstance3D
		if is_instance_valid(explosion_node):
			explosion_node.queue_free()
	)


func _attach_to_bone(bone_name: String, attachment_name: String, scene_path: String, node_name: String, rot_deg: Vector3 = Vector3.ZERO) -> BoneAttachment3D:
	var sk = _find_skeleton(self)
	if sk == null:
		return null
	var bone_idx = sk.find_bone(bone_name)
	if bone_idx < 0:
		return null
	var ba = BoneAttachment3D.new()
	ba.name = attachment_name
	ba.bone_name = bone_name
	ba.bone_idx = bone_idx
	sk.add_child(ba)
	var scene_res = ResourceLoader.load(scene_path, "PackedScene")
	if scene_res:
		var instance = scene_res.instantiate()
		instance.name = node_name
		if rot_deg != Vector3.ZERO:
			instance.rotation_degrees = rot_deg
		ba.add_child(instance)
	return ba


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var result = _find_skeleton(child)
		if result:
			return result
	return null


func _hide_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		node.visible = false
	for child in node.get_children():
		_hide_meshes(child)


func _stabilize_render_meshes() -> void:
	_stabilize_render_meshes_recursive(self)


func _apply_web_body_material_fallback() -> void:
	if not OS.has_feature("web"):
		return
	var troop_key: String = _troop_script_key()
	if not TROOP_BODY_TEXTURES.has(troop_key):
		return
	var texture_path: String = str(TROOP_BODY_TEXTURES.get(troop_key, ""))
	var mat: StandardMaterial3D = _get_web_body_material(troop_key, texture_path)
	if mat == null:
		return
	var prefixes: Array = TROOP_BODY_MESH_PREFIXES.get(troop_key, [])
	var applied_count: int = _apply_web_body_material_recursive(self, prefixes, mat)
	if applied_count > 0 and not _render_diag_emitted.has("troop.%s.web_body_material" % troop_key):
		report_render_diagnostic(self, "troop.%s.web_body_material" % troop_key, {
			"troop_name": name,
			"script": _troop_script_path(),
			"texture": texture_path,
			"applied_meshes": applied_count,
		})


func _troop_script_key() -> String:
	var script_path: String = _troop_script_path()
	if script_path == "":
		return ""
	return script_path.get_file().get_basename().to_lower()


func _troop_script_path() -> String:
	var script_ref: Script = get_script() as Script
	if script_ref != null and script_ref.resource_path != "":
		return script_ref.resource_path
	return ""


static func _get_web_body_material(troop_key: String, texture_path: String) -> StandardMaterial3D:
	if _troop_body_material_cache.has(troop_key):
		return _troop_body_material_cache[troop_key] as StandardMaterial3D
	var texture: Texture2D = ResourceLoader.load(texture_path, "Texture2D") as Texture2D
	if texture == null:
		push_warning("BaseTroop: missing web body texture '%s' for %s" % [texture_path, troop_key])
		return null
	var mat := StandardMaterial3D.new()
	mat.resource_name = "WebBody_%s" % troop_key
	mat.albedo_texture = texture
	mat.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR
	_troop_body_material_cache[troop_key] = mat
	return mat


static func _apply_web_body_material_recursive(node: Node, prefixes: Array, mat: StandardMaterial3D) -> int:
	var applied_count: int = 0
	if node is MeshInstance3D:
		var mesh_instance: MeshInstance3D = node as MeshInstance3D
		if _mesh_name_matches_prefix(str(mesh_instance.name), prefixes):
			var mesh: Mesh = mesh_instance.mesh
			var surface_count: int = mesh.get_surface_count() if mesh != null else 0
			if surface_count == 0:
				mesh_instance.material_override = mat
				applied_count += 1
			else:
				for surface_index in range(surface_count):
					mesh_instance.set_surface_override_material(surface_index, mat)
				applied_count += 1
	for child in node.get_children():
		applied_count += _apply_web_body_material_recursive(child, prefixes, mat)
	return applied_count


static func _mesh_name_matches_prefix(mesh_name: String, prefixes: Array) -> bool:
	for prefix_value in prefixes:
		var prefix: String = str(prefix_value)
		if prefix != "" and mesh_name.begins_with(prefix):
			return true
	return false


func _stabilize_render_meshes_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_instance: MeshInstance3D = node as MeshInstance3D
		if not bool(mesh_instance.get_meta("clash_keep_hidden", false)):
			mesh_instance.visible = true
		mesh_instance.extra_cull_margin = maxf(mesh_instance.extra_cull_margin, TROOP_MESH_CULL_MARGIN)
		mesh_instance.ignore_occlusion_culling = true
		mesh_instance.lod_bias = maxf(mesh_instance.lod_bias, TROOP_MESH_LOD_BIAS)
		if mesh_instance.skin != null:
			SkinnedMeshCombiner.dense_lod_variant(
				mesh_instance.mesh,
				DENSE_TROOP_LOD_INDEX
			)
	for child in node.get_children():
		_stabilize_render_meshes_recursive(child)


func _report_troop_render_diagnostic(stage: String) -> void:
	var script_path: String = _troop_script_path()
	var troop_key: String = name
	if script_path != "":
		troop_key = script_path.get_file().get_basename()
	report_render_diagnostic(self, "troop.%s.%s" % [troop_key, stage], {
		"troop_name": name,
		"script": script_path,
		"level": level,
		"state": int(state),
	})


static func report_render_diagnostic(root: Node, tag: String, extra: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		return
	if root == null or not is_instance_valid(root):
		return
	var key: String = str(tag)
	if _render_diag_emitted.has(key):
		return
	if _render_diag_emitted.size() >= RENDER_DIAG_MAX_EVENTS:
		return
	_render_diag_emitted[key] = true
	var payload: Dictionary = _render_diag_payload(root, key, extra)
	_emit_web_render_diagnostic(payload)


static func _render_diag_payload(root: Node, tag: String, extra: Dictionary) -> Dictionary:
	var root_visible: Variant = null
	if _object_has_property(root, "visible"):
		root_visible = bool(root.get("visible"))
	var payload: Dictionary = {
		"tag": tag,
		"root_name": str(root.name),
		"root_class": root.get_class(),
		"root_path": str(root.get_path()) if root.is_inside_tree() else "",
		"root_visible": root_visible,
		"child_count": root.get_child_count(),
		"mesh_count": 0,
		"visible_mesh_count": 0,
		"particle_count": 0,
		"visible_particle_count": 0,
		"meshes": [],
		"particles": [],
		"extra": extra,
	}
	_collect_render_diag_recursive(root, payload)
	return payload


static func _collect_render_diag_recursive(node: Node, payload: Dictionary) -> void:
	if node is MeshInstance3D:
		payload["mesh_count"] = int(payload.get("mesh_count", 0)) + 1
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.visible:
			payload["visible_mesh_count"] = int(payload.get("visible_mesh_count", 0)) + 1
		var meshes: Array = payload.get("meshes", [])
		if meshes.size() < RENDER_DIAG_MAX_MESHES:
			meshes.append(_mesh_render_diag(mesh_instance))
			payload["meshes"] = meshes
	elif node is GPUParticles3D or node is CPUParticles3D:
		payload["particle_count"] = int(payload.get("particle_count", 0)) + 1
		if _object_has_property(node, "visible") and bool(node.get("visible")):
			payload["visible_particle_count"] = int(payload.get("visible_particle_count", 0)) + 1
		var particles: Array = payload.get("particles", [])
		if particles.size() < RENDER_DIAG_MAX_PARTICLES:
			var particle_visible: Variant = null
			var particle_emitting: Variant = null
			var particle_amount: Variant = null
			if _object_has_property(node, "visible"):
				particle_visible = bool(node.get("visible"))
			if _object_has_property(node, "emitting"):
				particle_emitting = bool(node.get("emitting"))
			if _object_has_property(node, "amount"):
				particle_amount = int(node.get("amount"))
			particles.append({
				"name": str(node.name),
				"path": str(node.get_path()) if node.is_inside_tree() else "",
				"class": node.get_class(),
				"visible": particle_visible,
				"emitting": particle_emitting,
				"amount": particle_amount,
			})
			payload["particles"] = particles
	for child in node.get_children():
		_collect_render_diag_recursive(child, payload)


static func _mesh_render_diag(mesh_instance: MeshInstance3D) -> Dictionary:
	var mesh: Mesh = mesh_instance.mesh
	var surface_count: int = mesh.get_surface_count() if mesh != null else 0
	var aabb := mesh_instance.get_aabb()
	var out: Dictionary = {
		"name": str(mesh_instance.name),
		"path": str(mesh_instance.get_path()) if mesh_instance.is_inside_tree() else "",
		"visible": mesh_instance.visible,
		"mesh_class": mesh.get_class() if mesh != null else "",
		"surface_count": surface_count,
		"aabb_size": _vector3_diag(aabb.size),
		"extra_cull_margin": snappedf(mesh_instance.extra_cull_margin, 0.001),
		"lod_bias": snappedf(mesh_instance.lod_bias, 0.001),
		"ignore_occlusion_culling": mesh_instance.ignore_occlusion_culling,
		"materials": [],
	}
	var materials: Array = []
	if mesh_instance.material_override != null:
		materials.append(_material_render_diag(mesh_instance.material_override, "material_override"))
	for surface_index in range(mini(surface_count, 4)):
		var mat: Material = mesh_instance.get_surface_override_material(surface_index)
		var source := "surface_override_%d" % surface_index
		if mat == null and mesh != null:
			mat = mesh.surface_get_material(surface_index)
			source = "mesh_surface_%d" % surface_index
		if mat != null:
			materials.append(_material_render_diag(mat, source))
	out["materials"] = materials
	return out


static func _material_render_diag(material: Material, source: String) -> Dictionary:
	var out: Dictionary = {
		"source": source,
		"class": material.get_class(),
		"path": material.resource_path,
	}
	if material is StandardMaterial3D:
		var std := material as StandardMaterial3D
		out["transparency"] = int(std.transparency)
		out["cull_mode"] = int(std.cull_mode)
		out["shading_mode"] = int(std.shading_mode)
		out["albedo_texture"] = _texture_render_diag(std.albedo_texture)
		out["emission_texture"] = _texture_render_diag(std.emission_texture)
	elif material is ShaderMaterial:
		var shader_mat := material as ShaderMaterial
		out["shader"] = shader_mat.shader.resource_path if shader_mat.shader else ""
	return out


static func _texture_render_diag(texture: Texture2D) -> Dictionary:
	if texture == null:
		return {}
	return {
		"class": texture.get_class(),
		"path": texture.resource_path,
		"width": texture.get_width(),
		"height": texture.get_height(),
	}


static func _vector3_diag(value: Vector3) -> Dictionary:
	return {
		"x": snappedf(value.x, 0.001),
		"y": snappedf(value.y, 0.001),
		"z": snappedf(value.z, 0.001),
	}


static func _object_has_property(obj: Object, property_name: String) -> bool:
	if obj == null:
		return false
	for property_info in obj.get_property_list():
		if str(property_info.get("name", "")) == property_name:
			return true
	return false


static func _emit_web_render_diagnostic(payload: Dictionary) -> void:
	if not ClassDB.class_exists("JavaScriptBridge"):
		return
	var json: String = JSON.stringify(payload)
	var js := """
(function(){
  try {
    var payload = %s;
	var level = Number(payload.mesh_count || 0) > 0 && Number(payload.visible_mesh_count || 0) === 0 ? 'warn' : 'info';
    if (window.__clashReportClientEvent) {
	  window.__clashReportClientEvent('godot.render_diagnostic', payload, {
		source: 'godot.render',
		level: level,
		flush: level === 'warn'
      });
    } else {
	  (level === 'warn' ? console.warn : console.info)('[godot.render_diagnostic]', payload);
      if (window.__clashLogBreadcrumb) {
		window.__clashLogBreadcrumb('godot.render_diagnostic', payload, level);
      }
    }
  } catch (e) {
	console.warn('[godot.render_diagnostic.failed]', String(e && e.message || e));
  }
})()
""" % json
	JavaScriptBridge.eval(js, true)


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_anim_player(child)
		if result:
			return result
	return null
