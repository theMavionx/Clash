class_name BaseTroop
extends Node3D
## Base class for all troops with combat AI.
## Subclasses override _init_stats() and _setup_weapons().

@export var move_speed: float = 0.5
@export var attack_range: float = 0.15
@export var separation_radius: float = 0.14
@export var separation_force: float = 0.6
@export var can_pass_through_friendly_units: bool = false
@export var attack_sfx_path: String = ""
@export_enum("ground", "air") var unit_target_type: String = "ground"

const UNIT_TARGET_GROUND: String = "ground"
const UNIT_TARGET_AIR: String = "air"

var level: int = 1
var hp: int = 100
var max_hp: int = 100
var damage: int = 10
var atk_speed: float = 1.0

enum State { INACTIVE, IDLE, RUNNING, ATTACKING, VICTORY }
var state: State = State.INACTIVE
var target_building: Dictionary = {}
var target_bs: Node = null
var target_guard: Node3D = null
var attack_timer: float = 0.0

var anim_player: AnimationPlayer
var anim_files: Array = []
var attack_anim: String = ""
var _hp_bar: Node3D
var _hp_fill: MeshInstance3D
var _attack_sfx_player: AudioStreamPlayer = null
const TROOP_MESH_CULL_MARGIN: float = 0.75
const TROOP_MESH_LOD_BIAS: float = 4.0
const ATTACK_SFX_VOLUME_DB: float = -8.0
const ATTACK_SFX_PITCH_JITTER: float = 0.06

## Cached troop list — shared across all BaseTroop instances via static
static var _cached_troops: Array = []
static var _troops_cache_frame: int = -1
static var _attack_sfx_cache: Dictionary = {}
static var _attack_sfx_missing: Dictionary = {}
static var _render_diag_emitted: Dictionary = {}
const RENDER_DIAG_MAX_EVENTS: int = 24
const RENDER_DIAG_MAX_MESHES: int = 10
const RENDER_DIAG_MAX_PARTICLES: int = 8
const TROOP_BODY_TEXTURES: Dictionary = {
	"archer": "res://Model/Characters/Model/Ranger_ranger_texture.png",
	"barbarian": "res://Model/Characters/Model/Barbarian_barbarian_texture.png",
	"knight": "res://Model/Characters/Model/Knight_knight_texture.png",
	"mage": "res://Model/Characters/Model/Mage_mage_texture.png",
	"ranger": "res://Model/Characters/Model/Ranger_ranger_texture.png",
	"rogue": "res://Model/Characters/Model/Rogue_rogue_texture.png",
}
const TROOP_BODY_MESH_PREFIXES: Dictionary = {
	"archer": ["Ranger_"],
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
static var _rally_expire_msec: int = 0
static var _rally_target_building: Dictionary = {}
static var _rally_target_bs: Node = null
static var _rally_target_guard: Node3D = null

static func set_rally(pos: Vector3, duration_sec: float) -> Dictionary:
	_rally_active = true
	_rally_pos = pos
	_rally_expire_msec = Time.get_ticks_msec() + int(duration_sec * 1000.0)
	_resolve_rally_target(pos)
	_apply_rally_to_active_troops()
	return get_rally_debug_payload(pos)

static func clear_rally() -> void:
	_rally_active = false
	_rally_expire_msec = 0
	_rally_target_building = {}
	_rally_target_bs = null
	_rally_target_guard = null

static func _is_rally_live() -> bool:
	return _rally_active and Time.get_ticks_msec() < _rally_expire_msec

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

static var _replay_combat_cache_frame: int = -1
static var _replay_combat_locked: bool = false

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

## Shared animation libraries — one per anim_files key, reused by all troops of same type
static var _anim_lib_cache: Dictionary = {}  # key(String) -> AnimationLibrary

## Cached building data — refreshed once per frame, used by _find_next_target and avoidance
static var _cached_building_list: Array = []  # [{dict, bs, pos}]
static var _buildings_cache_frame: int = -1
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

## Cached island bounds — center, extents, rotation (from main BuildingSystem)
static var _island_center: Vector3 = Vector3.ZERO
static var _island_extent_x: float = 10.0
static var _island_extent_z: float = 10.0
static var _island_rot: float = 0.0
static var _island_bounds_ready: bool = false

static func reset_island_bounds_cache() -> void:
	_island_bounds_ready = false
	_island_center = Vector3.ZERO
	_island_extent_x = 10.0
	_island_extent_z = 10.0
	_island_rot = 0.0


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
	_cached_troops.clear()
	_troops_cache_frame = -1
	_cached_building_list.clear()
	_buildings_cache_frame = -1
	_building_entry_pool_idx = 0
	_cached_guards_list.clear()
	_guards_list_cache_frame = -1


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


func is_air_unit() -> bool:
	return unit_target_type == UNIT_TARGET_AIR


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
	# Use main grid (largest) with slight padding for walking around edges
	var best_area: float = 0.0
	for bs in tree.get_nodes_in_group("building_systems"):
		var area: float = bs.grid_extent_x * bs.grid_extent_z
		if area > best_area:
			best_area = area
			_island_center = bs.grid_center
			_island_extent_x = bs.grid_extent_x * 1.05
			_island_extent_z = bs.grid_extent_z * 1.05
			_island_rot = bs.grid_rotation
	if best_area > 0.01:
		_island_bounds_ready = true


## Clamps `pos` to the rotated bounding box of the main island grid so troops
## cannot walk off the edge of the map.
static func _clamp_to_island(pos: Vector3) -> Vector3:
	if not _island_bounds_ready:
		_ensure_island_bounds()
	# Transform to local island space (rotated grid)
	var dx: float = pos.x - _island_center.x
	var dz: float = pos.z - _island_center.z
	var cos_r: float = cos(-_island_rot)
	var sin_r: float = sin(-_island_rot)
	var local_x: float = dx * cos_r - dz * sin_r
	var local_z: float = dx * sin_r + dz * cos_r
	# Clamp to island extents
	local_x = clampf(local_x, -_island_extent_x * 0.5, _island_extent_x * 0.5)
	local_z = clampf(local_z, -_island_extent_z * 0.5, _island_extent_z * 0.5)
	# Transform back to world space
	var cos_r2: float = cos(_island_rot)
	var sin_r2: float = sin(_island_rot)
	pos.x = _island_center.x + local_x * cos_r2 - local_z * sin_r2
	pos.z = _island_center.z + local_x * sin_r2 + local_z * cos_r2
	return pos


## Returns the avoidance radius for a building based on its cell footprint.
static func _building_avoid_radius(b: Dictionary, bs_node: Node, padding: float = 0.06) -> float:
	if bs_node and "building_defs" in bs_node and "cell_size" in bs_node:
		var bdef: Dictionary = bs_node.building_defs.get(b.get("id", ""), {})
		var cells: Vector2i = bdef.get("cells", Vector2i(2, 2))
		return maxf(cells.x, cells.y) * bs_node.cell_size * 0.5 + padding
	return 0.18


static func _get_buildings_cached() -> Array:
	var frame: int = combat_cache_key()
	if frame != _buildings_cache_frame:
		_cached_building_list.clear()
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			for bs in tree.get_nodes_in_group("building_systems"):
				for b in bs.placed_buildings:
					if b.get("hp", 0) > 0 and is_instance_valid(b.get("node")):
						# Reuse pooled entries to avoid Dictionary allocation every frame
						var entry: Dictionary
						if _building_entry_pool_idx < _building_entry_pool.size():
							entry = _building_entry_pool[_building_entry_pool_idx]
							entry["b"] = b
							entry["bs"] = bs
							entry["pos"] = b.node.global_position
						else:
							entry = {"b": b, "bs": bs, "pos": b.node.global_position}
							_building_entry_pool.append(entry)
						_building_entry_pool_idx += 1
						_cached_building_list.append(entry)
			_cached_building_list.sort_custom(func(a, b): return _building_order_key(a.get("b", {})) < _building_order_key(b.get("b", {})))
		_building_entry_pool_idx = 0
		_buildings_cache_frame = frame
	return _cached_building_list


static var _cached_guards_list: Array = []
static var _guards_list_cache_frame: int = -1

static func _get_guards_list_cached() -> Array:
	var frame: int = combat_cache_key()
	if frame != _guards_list_cache_frame:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_guards_list = tree.get_nodes_in_group("skeleton_guards")
		_guards_list_cache_frame = frame
	return _cached_guards_list


static func _get_troops_cached() -> Array:
	var frame: int = combat_cache_key()
	if frame != _troops_cache_frame:
		_cached_troops.clear()
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			for troop in tree.get_nodes_in_group("troops"):
				if is_live_troop(troop):
					_cached_troops.append(troop)
			_cached_troops.sort_custom(func(a, b): return _troop_order_key(a) < _troop_order_key(b))
		_troops_cache_frame = frame
	return _cached_troops


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
	max_hp = hp
	_setup_attack_sfx()
	_setup_animations()
	_setup_weapons()
	_apply_web_body_material_fallback()
	_stabilize_render_meshes()
	_report_troop_render_diagnostic("ready")
	# Keep combat replay deterministic and aligned with the server simulator.
	_sep_counter = 0
	_slot_eval_timer = 0.0
	_retarget_timer = 0.0


## Override to set hp, damage, atk_speed, move_speed, attack_range, attack_anim, anim_files
func _init_stats() -> void:
	pass


## Applies level `lvl` to this troop by re-running `_init_stats()`.
## Call after spawning when the player's stored troop level is known.
func upgrade_to(lvl: int) -> void:
	level = lvl
	_init_stats()
	max_hp = hp
	_setup_attack_sfx()


## Override to attach weapons via _attach_to_bone()
func _setup_weapons() -> void:
	pass


func _setup_attack_sfx() -> void:
	if attack_sfx_path == "":
		return
	if _attack_sfx_player == null:
		_attack_sfx_player = AudioStreamPlayer.new()
		_attack_sfx_player.name = "AttackSFX"
		_attack_sfx_player.volume_db = ATTACK_SFX_VOLUME_DB
		add_child(_attack_sfx_player)
	if not _attack_sfx_cache.has(attack_sfx_path) and not _attack_sfx_missing.has(attack_sfx_path):
		var stream: AudioStream = ResourceLoader.load(attack_sfx_path) as AudioStream
		if stream:
			_attack_sfx_cache[attack_sfx_path] = stream
		else:
			_attack_sfx_missing[attack_sfx_path] = true
			push_warning("%s: missing attack sound '%s'" % [name, attack_sfx_path])
	if _attack_sfx_cache.has(attack_sfx_path):
		_attack_sfx_player.stream = _attack_sfx_cache[attack_sfx_path]


func _play_attack_sfx() -> void:
	if attack_sfx_path == "":
		return
	if _attack_sfx_player == null or _attack_sfx_player.stream == null:
		_setup_attack_sfx()
	if _attack_sfx_player == null or _attack_sfx_player.stream == null:
		return
	_attack_sfx_player.pitch_scale = randf_range(1.0 - ATTACK_SFX_PITCH_JITTER, 1.0 + ATTACK_SFX_PITCH_JITTER)
	_attack_sfx_player.play()


## Transitions the troop from INACTIVE to IDLE, makes it visible, registers it
## in the "troops" group, creates its HP bar, and immediately searches for a target.
## Call this after placing the troop in the scene via the attack system.
func activate() -> void:
	if state != State.INACTIVE:
		return
	visible = true
	_apply_web_body_material_fallback()
	_stabilize_render_meshes()
	_report_troop_render_diagnostic("activate")
	state = State.IDLE
	add_to_group("troops")
	_create_hp_bar()
	_record_replay_telemetry("troop_spawn", {})
	_find_next_target()


var _spawn_scale: float = 0.1

func _physics_process(delta: float) -> void:
	if _is_dead or state == State.INACTIVE or state == State.VICTORY:
		return
	delta = combat_delta(delta)
	# Force scale every frame — GLB animations override it otherwise
	scale = Vector3(_spawn_scale, _spawn_scale, _spawn_scale)
	_update_hp_bar()
	# Periodic retargeting uses replay time, not rendered frame count. Browser
	# FPS can dip below 60; frame-count timers made replays drift from the
	# server's fixed 60 Hz simulation.
	_retarget_timer += delta
	if _retarget_timer >= RETARGET_INTERVAL_SEC:
		_retarget_timer = fmod(_retarget_timer, RETARGET_INTERVAL_SEC)
		_find_next_target()
	# Immediate guard threat check — suppressed while a rally focus is locked.
	_check_guard_threat()
	match state:
		State.RUNNING:
			_move_to_target(delta)
		State.ATTACKING:
			_do_attack(delta)


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "TroopAnimPlayer"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)

	# Build cache key from sorted anim_files paths
	var cache_key: String = ",".join(anim_files)
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
					if anim and not lib.has_animation(anim_name):
						var dup: Animation = anim.duplicate()
						if anim_name.begins_with("Running") or anim_name.begins_with("Walking") or anim_name.begins_with("Idle") or anim_name == "Cheering":
							dup.loop_mode = Animation.LOOP_LINEAR
						# Strip ALL scale and position tracks — they override spawn scale
						for ti in range(dup.get_track_count() - 1, -1, -1):
							var path: String = str(dup.track_get_path(ti))
							if ":scale" in path or ":position" in path:
								dup.remove_track(ti)
						lib.add_animation(anim_name, dup)
			instance.free()
		_anim_lib_cache[cache_key] = lib

	anim_player.add_animation_library("", lib)

	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


const SLOT_OFFSETS: Array = [-0.0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]


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
static func prewarm_anim_library(anim_files_list: Array) -> void:
	if anim_files_list.is_empty():
		return
	var cache_key: String = ",".join(anim_files_list)
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
				if anim and not lib.has_animation(anim_name):
					var dup: Animation = anim.duplicate()
					if anim_name.begins_with("Running") or anim_name.begins_with("Walking") or anim_name.begins_with("Idle") or anim_name == "Cheering":
						dup.loop_mode = Animation.LOOP_LINEAR
					for ti in range(dup.get_track_count() - 1, -1, -1):
						var path: String = str(dup.track_get_path(ti))
						if ":scale" in path or ":position" in path:
							dup.remove_track(ti)
					lib.add_animation(anim_name, dup)
		# Free the detached instance; no queue_free needed since it's not in tree.
		inst.free()
	_anim_lib_cache[cache_key] = lib


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
## Subclasses that use this rig should assign `anim_files = MEDIUM_RIG_ANIM_FILES` in `_init_stats()`.
const MEDIUM_RIG_ANIM_FILES: Array = [
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]
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
	if not _hp_bar or not _hp_fill:
		return
	if hp >= max_hp:
		if _hp_bar.visible:
			_hp_bar.visible = false
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


func _apply_rally_target() -> bool:
	if not _rally_active:
		return false
	if not _has_valid_rally_target():
		clear_rally()
		return false

	if _rally_target_guard != null:
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
		var dx = my_pos.x - entry.pos.x
		var dz = my_pos.z - entry.pos.z
		var d_sq = dx * dx + dz * dz
		if d_sq < second_dist_sq:
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
	var nearest_dist_sq: float = INF
	var nearest_b: Dictionary = {}
	var nearest_bs_ref = null
	var nearest_guard: Node3D = null
	var my_pos = global_position
	var search_pos: Vector3 = _rally_pos if _is_rally_live() else my_pos

	for entry in _get_buildings_cached():
		var b = entry.b
		if b.get("hp", 0) <= 0 or not is_instance_valid(b.get("node")):
			continue
		var dx = search_pos.x - entry.pos.x
		var dz = search_pos.z - entry.pos.z
		var d_sq = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			nearest_b = b
			nearest_bs_ref = entry.bs
			nearest_guard = null

	for guard in _get_guards_list_cached():
		if not is_instance_valid(guard) or not guard.is_inside_tree():
			continue
		if guard.hp <= 0:
			continue
		var dx = search_pos.x - guard.global_position.x
		var dz = search_pos.z - guard.global_position.z
		var d_sq = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
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
		_trigger_victory_all()


## Target stickiness prevents tiny position differences from flipping troops
## between two almost-equally-close targets.
func _should_keep_current_target(search_pos: Vector3, candidate_dist_sq: float, candidate_b: Dictionary, candidate_guard: Node3D) -> bool:
	if candidate_dist_sq == INF:
		return false

	if target_guard != null and is_instance_valid(target_guard) and target_guard.is_inside_tree() and target_guard.hp > 0:
		var gdx_sticky: float = search_pos.x - target_guard.global_position.x
		var gdz_sticky: float = search_pos.z - target_guard.global_position.z
		var sticky_range: float = attack_range * maxf(GUARD_THREAT_MULT, ATTACK_MAX_RANGE_MULT)
		if gdx_sticky * gdx_sticky + gdz_sticky * gdz_sticky <= sticky_range * sticky_range:
			return true

	if candidate_guard != null and candidate_guard == target_guard:
		return false
	if candidate_guard == null and candidate_b.size() > 0 and candidate_b.get("node") == target_building.get("node"):
		return false

	var current_dist_sq: float = INF
	if target_guard != null and is_instance_valid(target_guard) and target_guard.is_inside_tree() and target_guard.hp > 0:
		var gdx: float = search_pos.x - target_guard.global_position.x
		var gdz: float = search_pos.z - target_guard.global_position.z
		current_dist_sq = gdx * gdx + gdz * gdz
	elif target_building.size() > 0 and target_building.get("hp", 0) > 0 and is_instance_valid(target_building.get("node")):
		var bpos: Vector3 = target_building.node.global_position
		var bdx: float = search_pos.x - bpos.x
		var bdz: float = search_pos.z - bpos.z
		current_dist_sq = bdx * bdx + bdz * bdz

	if current_dist_sq == INF:
		return false
	return sqrt(candidate_dist_sq) + TARGET_SWITCH_MIN_ADVANTAGE >= sqrt(current_dist_sq)


## Immediate guard threat check.
func _check_guard_threat() -> void:
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
	for guard in _get_guards_list_cached():
		if not is_instance_valid(guard) or not guard.is_inside_tree():
			continue
		if guard.hp <= 0:
			continue
		var dx = my_pos.x - guard.global_position.x
		var dz = my_pos.z - guard.global_position.z
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
		_is_dead = true
		_record_replay_telemetry("troop_death", {"damage": dmg})
		if is_in_group("troops"):
			remove_from_group("troops")
		invalidate_combat_lists()
		if has_method("_clear_owned_projectiles"):
			call("_clear_owned_projectiles")
		set_process(false)
		_report_death()
		queue_free()


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
		"ranger": return "Ranger"
		"demon_king": return "DemonKing"
		"fire_dragon": return "FireDragon"
	return ""


func _record_replay_telemetry(kind: String, data: Dictionary = {}) -> void:
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
	payload.x = snappedf(global_position.x, 0.001)
	payload.z = snappedf(global_position.z, 0.001)
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
	payload["projectile_x"] = snappedf(projectile_pos.x, 0.001)
	payload["projectile_y"] = snappedf(projectile_pos.y, 0.001)
	payload["projectile_z"] = snappedf(projectile_pos.z, 0.001)
	payload["attack_timer"] = snappedf(attack_timer, 0.001)
	payload["damage"] = damage
	for key in extra.keys():
		payload[key] = extra[key]
	_record_replay_telemetry(kind, payload)


func _record_projectile_telemetry(kind: String, target_ref: Dictionary, guard_ref = null, projectile_pos: Vector3 = Vector3.ZERO, extra: Dictionary = {}) -> void:
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
	if _slot_eval_timer >= SLOT_EVAL_INTERVAL_SEC:
		_slot_eval_timer = fmod(_slot_eval_timer, SLOT_EVAL_INTERVAL_SEC)
		var best_angle = my_angle
		var best_min_dist = 0.0
		for test_offset in SLOT_OFFSETS:
			var test_angle = my_angle + test_offset
			var min_other_dist = 999.0
			for other in _get_troops_cached():
				if other == self or not is_instance_valid(other):
					continue
				if not (other is BaseTroop):
					continue
				# Only spread against troops attacking the same live target.
				# For skeleton guards target_building is empty, so comparing only
				# target_building grouped every guard fight together and made
				# replay paths diverge from the server simulator.
				if target_guard != null:
					if other.target_guard != target_guard:
						continue
				elif other.target_building.get("node") != target_building.get("node"):
					continue
				var other_angle = atan2(other.global_position.x - target_pos.x, other.global_position.z - target_pos.z)
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
	var sep = Vector3.ZERO
	var sep_range_sq = separation_radius * separation_radius * 4.0
	var move_len: float = move_dir.length()
	var forward: Vector3 = move_dir / move_len if move_len > 0.0001 else Vector3.ZERO
	var lateral: Vector3 = Vector3.UP.cross(forward).normalized() if forward.length_squared() > 0.0001 else Vector3.ZERO

	# Troop-to-troop separation. Heavy pass-through units still avoid guards
	# and buildings, but allied troops should not be able to body-block them.
	if not can_pass_through_friendly_units:
		for other in _get_troops_cached():
			if other == self or not is_instance_valid(other):
				continue
			var to_other = other.global_position - global_position
			to_other.y = 0
			var d_sq = to_other.length_squared()
			if d_sq > sep_range_sq or d_sq < 0.000001:
				continue
			var d = sqrt(d_sq)
			if d < separation_radius:
				sep -= (to_other / d) * (separation_radius - d) / separation_radius

	# Guard avoidance — light push from non-target guards
	for guard in _get_guards_list_cached():
		if not is_instance_valid(guard) or guard == target_guard:
			continue
		var to_guard = guard.global_position - global_position
		to_guard.y = 0
		var gd_sq = to_guard.length_squared()
		if gd_sq < sep_range_sq and gd_sq > 0.000001:
			var gd = sqrt(gd_sq)
			if gd < separation_radius:
				sep -= (to_guard / gd) * (separation_radius - gd) / separation_radius * 0.5

			# Lateral steer prevents troops from trying to walk through guards.
			if gd < separation_radius * 2.0 and lateral.length_squared() > 0.0001:
				var guard_dir: Vector3 = to_guard / gd
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
		var to_me = global_position - entry.pos
		to_me.y = 0
		var bd = to_me.length()
		var avoid_r = _building_avoid_radius(entry.b, entry.bs)
		if bd > 0.001 and bd < avoid_r:
			var push_strength = (avoid_r - bd) / avoid_r
			sep += to_me.normalized() * push_strength * 1.5

	var combined = move_dir + sep * separation_force * delta * 3.0
	global_position += combined
	global_position = _clamp_to_island(global_position)
	global_position.y = target_pos.y
	return combined


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


## Movement each frame: seek target, avoid obstacles, flow around buildings.
func _move_to_target(delta: float) -> void:
	if not _has_valid_target():
		_find_next_target()
		return

	var target_pos = _get_target_position()
	var diff = Vector3(target_pos.x - global_position.x, 0, target_pos.z - global_position.z)
	var dist_sq = diff.length_squared()
	if dist_sq < 0.0001:
		return
	var dist = sqrt(dist_sq)
	var dir_to_target = diff / dist

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

	# Face target directly (model faces -Z so rotate 180)
	var face_target = global_position + dir_to_target
	face_target.y = global_position.y
	look_at(face_target, Vector3.UP)
	rotate_y(PI)

	# Steering: seek + separation + building avoidance
	_apply_separation_steering(dir * move_speed * delta, target_pos, delta)

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
		look_at(global_position + dir_to_target, Vector3.UP)
		rotate_y(PI)
		return

	# Stuck detection
	_check_stuck(delta, my_angle)


func _get_separation() -> Vector3:
	if can_pass_through_friendly_units:
		_last_separation = Vector3.ZERO
		return Vector3.ZERO

	# Use cached result from move (updated every 3rd frame)
	_sep_counter += 1
	if _sep_counter % 3 != 0:
		return _last_separation

	var push = Vector3.ZERO
	var sep_sq = separation_radius * separation_radius
	var troops = _get_troops_cached()
	for other in troops:
		if other == self or not is_instance_valid(other):
			continue
		var to_me = global_position - other.global_position
		to_me.y = 0
		var d_sq = to_me.length_squared()
		if d_sq > sep_sq or d_sq < 0.000001:
			continue
		var d = sqrt(d_sq)
		push += (to_me / d) * (separation_radius - d) / separation_radius
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
	if dist_to_target > attack_range * 2.0:
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return

	# Face the target each frame
	var face_dir = to_target.normalized()
	if face_dir.length_squared() > 0.001:
		look_at(global_position + face_dir, Vector3.UP)
		rotate_y(PI)

	# Light separation while attacking — but never push beyond attack range
	if separation_force > 0.0:
		var sep = _get_separation()
		if sep.length() > 0.001:
			var new_pos = global_position + sep * separation_force * delta * 0.3
			var new_dist = (target_pos - new_pos).length()
			if new_dist < attack_range * 1.2:
				global_position = new_pos
				global_position = _clamp_to_island(global_position)

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
		mesh_instance.visible = true
		mesh_instance.extra_cull_margin = maxf(mesh_instance.extra_cull_margin, TROOP_MESH_CULL_MARGIN)
		mesh_instance.ignore_occlusion_culling = true
		mesh_instance.lod_bias = maxf(mesh_instance.lod_bias, TROOP_MESH_LOD_BIAS)
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
	var payload: Dictionary = {
		"tag": tag,
		"root_name": str(root.name),
		"root_class": root.get_class(),
		"root_path": str(root.get_path()) if root.is_inside_tree() else "",
		"root_visible": bool(root.get("visible")) if _object_has_property(root, "visible") else null,
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
			particles.append({
				"name": str(node.name),
				"path": str(node.get_path()) if node.is_inside_tree() else "",
				"class": node.get_class(),
				"visible": bool(node.get("visible")) if _object_has_property(node, "visible") else null,
				"emitting": bool(node.get("emitting")) if _object_has_property(node, "emitting") else null,
				"amount": int(node.get("amount")) if _object_has_property(node, "amount") else null,
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
    if (window.__clashReportClientEvent) {
	  window.__clashReportClientEvent('godot.render_diagnostic', payload, {
		source: 'godot.render',
		level: 'warn',
        flush: true
      });
    } else {
	  console.warn('[godot.render_diagnostic]', payload);
      if (window.__clashLogBreadcrumb) {
		window.__clashLogBreadcrumb('godot.render_diagnostic', payload, 'warn');
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
