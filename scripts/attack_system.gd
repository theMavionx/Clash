class_name AttackSystem
extends Node3D
## Attack system: press Attack → click on shipPlane → ship sails to that point.
## Implements: design/gdd/attack_system.md

@export var grid_plane_path: NodePath = "../Island/shipPlane"
@export var sail_duration: float = 3.0
@export var spawn_distance: float = 4.0
@export var water_node_path: NodePath = "../Water"
@export var max_ships: int = 5
@export var troop_spawn_delay: float = 0.2
@export var troop_scale: float = 0.1
@export var main_ship_controller_path: NodePath = NodePath("../MainShipController")
@export_range(0.05, 1.0, 0.01) var hold_deploy_initial_delay: float = 0.24
@export_range(0.05, 0.5, 0.01) var hold_deploy_repeat_interval: float = 0.10

# ---------------------------------------------------------------------------
# Ship rocking / bobbing animation constants
# ---------------------------------------------------------------------------
const SHIP_ROCK_ANGLE_POS: float = 3.0   ## Roll right (degrees)
const SHIP_ROCK_ANGLE_NEG: float = -3.0  ## Roll left  (degrees)
const SHIP_BOB_AMPLITUDE: float  = 0.05  ## Vertical bob distance (metres)
const SHIP_PITCH_ANGLE_POS: float = 2.0  ## Pitch forward (degrees)
const SHIP_PITCH_ANGLE_NEG: float = -1.0 ## Pitch back    (degrees)

# ---------------------------------------------------------------------------
# Flag marker constants
# ---------------------------------------------------------------------------
const FLAG_SCALE: float    = 0.000625 ## Uniform scale applied to flag GLB
const FLAG_Y_OFFSET: float = -0.08    ## Vertical offset so flag sits on water

# ---------------------------------------------------------------------------
# Separation constants
# ---------------------------------------------------------------------------
## Minimum lateral distance between ship landing positions (world units)
const SHIP_MIN_SEPARATION: float = 0.09
## Radius within which ships push each other apart while sailing
const SHIP_PUSH_RADIUS: float = 0.12

# ---------------------------------------------------------------------------
# Preloaded resources — loaded once at startup, never at runtime
# ---------------------------------------------------------------------------
var _flag_scene_res: Resource = null

## Ship models by level (1-indexed: level 1 = small, 2 = medium, 3 = large)
const SHIP_MODELS: Array[String] = [
	"res://Model/Ship/Ships/ship-pirate-small_1.glb",
	"res://Model/Ship/Ships/ship-pirate-medium_2.glb",
	"res://Model/Ship/Ships/ship-pirate-large_3.glb",
]
const SHIP_SCALES: Array[float] = [0.05, 0.05, 0.05]
## Modular Tiny Hero meshes are authored smaller than the legacy combat rigs.
## FireDragon already matches the combat scale and must keep the base scale.
const TROOP_SCALE_MULTIPLIERS: Dictionary = {
	"Knight": 1.7,
	"Mage": 1.7,
	"Archer": 1.7,
	"Mimic": 1.45,
	"PeaShooter": 1.75,
	"Necromancer": 1.55,
	"Horror": 1.25,
	"IceGolem": 2.0,
	"WindMage": 1.1,
}

## Troop name → {model, script} for spawning combat troops
const TROOP_DEFS: Dictionary = {
	"Knight":    {"model": "res://Model/Characters/pirate_knight/pirate_knight.tscn", "script": "res://scripts/knight.gd"},
	"Mage":      {"model": "res://Model/Characters/pirate_mage/pirate_mage.tscn", "script": "res://scripts/mage.gd"},
	"Barbarian": {"model": "res://Model/Characters/Model/Barbarian.glb",   "script": "res://scripts/barbarian.gd"},
	"Archer":    {"model": "res://Model/Characters/pirate_archer/pirate_archer.tscn", "script": "res://scripts/archer.gd"},
	"PeaShooter": {
		"model": "res://Model/Characters/PeaShooter/PeaShooter.fbx",
		"script": "res://scripts/pea_shooter.gd",
	},
	"Ranger":    {"model": "res://Model/Characters/Model/Rogue_Hooded.glb","script": "res://scripts/ranger.gd"},
	"Mimic":     {"model": "res://Model/Characters/MimicBarrel/MimicBarrel.fbx", "script": "res://scripts/mimic.gd"},
	"Necromancer": {
		"model": "res://Model/Characters/Necromancer/Necromancer.fbx",
		"script": "res://scripts/necromancer.gd",
	},
	"Horror": {
		"model": "res://Model/Characters/HorrorEvolution/horror.fbx",
		"script": "res://scripts/horror_evolution.gd",
	},
	"MechanicalDragon": {
		"model": "res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx",
		"script": "res://scripts/mechanical_dragon.gd",
	},
	"IceGolem": {
		"model": "res://Model/Characters/IceGolem/IceGolem.fbx",
		"script": "res://scripts/ice_golem.gd",
	},
	"WindMage": {
		"model": "res://Model/Characters/WindMage/WindMage.fbx",
		"script": "res://scripts/wind_mage.gd",
	},
	"DemonKing": {"model": "res://Model/Characters/Model/DemonKing_Body.fbx",   "script": "res://scripts/demon_king.gd"},
	"FireDragon": {"model": "res://Model/Characters/FireDragon/FireDragon.tscn", "script": "res://scripts/fire_dragon.gd"},
}
const ACTIVE_PRELOAD_TROOPS: Array[String] = [
	"Knight", "Mage", "Archer", "PeaShooter", "Mimic", "Necromancer", "Horror",
	"MechanicalDragon", "IceGolem", "WindMage", "DemonKing", "FireDragon",
]

## Legacy constant kept for replay compatibility
const SHIP_TROOPS = [
	{"model": "res://Model/Characters/pirate_knight/pirate_knight.tscn", "script": "res://scripts/knight.gd"},
	{"model": "res://Model/Characters/pirate_mage/pirate_mage.tscn", "script": "res://scripts/mage.gd"},
	{"model": "res://Model/Characters/Model/Barbarian.glb",   "script": "res://scripts/barbarian.gd"},
	{"model": "res://Model/Characters/pirate_archer/pirate_archer.tscn", "script": "res://scripts/archer.gd"},
	{"model": "res://Model/Characters/Model/Rogue_Hooded.glb","script": "res://scripts/ranger.gd"},
]

# ---------------------------------------------------------------------------
# Combat resource cache — loaded once at boot, never during combat.
# Eliminates the first-ship-spawn / first-troop-deploy frame hitch on web
# (WASM `load()` blocks the main thread while GLB decompresses).
# ---------------------------------------------------------------------------
static var _ship_model_cache: Array[Resource] = []
static var _troop_res_cache: Dictionary = {}  # troop_name → {model, script}
static var _combat_preload_done: bool = false


static func _load_packed_scene_resource(path: String) -> PackedScene:
	if path == "":
		return null
	if not ResourceLoader.exists(path, "PackedScene"):
		return null
	return ResourceLoader.load(path, "PackedScene") as PackedScene


static func _load_script_resource(path: String) -> Script:
	if path == "":
		return null
	if not ResourceLoader.exists(path, "Script"):
		return null
	return ResourceLoader.load(path, "Script") as Script

## Preloads every ship model and troop (model + script) used in combat.
## Safe to call multiple times; used by the hidden combat warmup and as a
## defensive fallback when entering attack/replay mode.
static func _preload_combat_resources() -> void:
	if _combat_preload_done:
		print("[COMBAT_PRELOAD] cache_hit ships=", _ship_model_cache.size(), " troops=", _troop_res_cache.size())
		return
	var preload_started := Time.get_ticks_msec()
	print("[COMBAT_PRELOAD] start")
	_combat_preload_done = true
	_preload_ship_resources()
	for troop_name in ACTIVE_PRELOAD_TROOPS:
		_get_or_load_troop_resources(troop_name)
	print(
		"[COMBAT_PRELOAD] finish total_ms=", Time.get_ticks_msec() - preload_started,
		" ships=", _ship_model_cache.size(),
		" troops=", _troop_res_cache.size()
	)


static func _preload_combat_resources_for_troops(troop_names: Array) -> void:
	_preload_ship_resources()
	for raw_name in troop_names:
		var troop_name := str(raw_name).split(":", false, 1)[0].strip_edges()
		if troop_name == "" or troop_name.begins_with("_"):
			continue
		_get_or_load_troop_resources(troop_name)
	_finalize_incremental_combat_preload()


static func _finalize_incremental_combat_preload() -> void:
	var ships_ready := _ship_model_cache.size() >= SHIP_MODELS.size()
	if ships_ready:
		for ship_res in _ship_model_cache:
			if ship_res == null:
				ships_ready = false
				break
	var troops_ready := true
	for troop_name in ACTIVE_PRELOAD_TROOPS:
		var entry: Dictionary = _troop_res_cache.get(troop_name, {})
		if entry.get("model", null) == null or entry.get("script", null) == null:
			troops_ready = false
			break
	_combat_preload_done = ships_ready and troops_ready
	print(
		"[COMBAT_PRELOAD] incremental_finish done=", _combat_preload_done,
		" ships=", _ship_model_cache.size(),
		" troops=", _troop_res_cache.size()
	)


static func _get_or_load_troop_resources(troop_name: String) -> Dictionary:
	if _troop_res_cache.has(troop_name):
		return _troop_res_cache[troop_name]
	var tdef: Dictionary = TROOP_DEFS.get(troop_name, {})
	if tdef.is_empty():
		return {}
	var troop_started := Time.get_ticks_msec()
	var entry := {
		"model": _load_packed_scene_resource(tdef.model),
		"script": _load_script_resource(tdef.script),
	}
	_troop_res_cache[troop_name] = entry
	print(
		"[COMBAT_PRELOAD] troop_done troop=", troop_name,
		" step_ms=", Time.get_ticks_msec() - troop_started,
		" model_ok=", entry.get("model") != null,
		" script_ok=", entry.get("script") != null
	)
	return entry


static func _get_ship_model_resource(model_idx: int) -> Resource:
	if model_idx < 0 or model_idx >= SHIP_MODELS.size():
		return null
	while _ship_model_cache.size() < SHIP_MODELS.size():
		_ship_model_cache.append(null)
	var cached: Resource = _ship_model_cache[model_idx]
	if cached == null:
		var load_started := Time.get_ticks_msec()
		cached = _load_packed_scene_resource(SHIP_MODELS[model_idx])
		_ship_model_cache[model_idx] = cached
		print(
			"[COMBAT_PRELOAD] ship_done level=", model_idx + 1,
			" step_ms=", Time.get_ticks_msec() - load_started,
			" model_ok=", cached != null
		)
	return cached


static func _preload_ship_resources() -> void:
	for i in range(SHIP_MODELS.size()):
		_get_ship_model_resource(i)


func ensure_combat_resources_loaded(troop_names: Array = []) -> void:
	if _flag_scene_res == null:
		_flag_scene_res = _load_packed_scene_resource("res://Model/flag/pirate_flag_animated.glb")
	if troop_names.is_empty():
		_preload_combat_resources()
	else:
		_preload_combat_resources_for_troops(troop_names)


func prewarm_flag_marker() -> Node3D:
	ensure_combat_resources_loaded()
	if _flag_scene_res == null:
		return null
	_refresh_placement_bounds()
	var warm_pos := Vector3.ZERO
	warm_pos.y = water_y
	var flag := _create_x_marker(warm_pos)
	flag.name = "WarmupPirateFlagMarker"
	return flag

# ---------------------------------------------------------------------------
# Per-frame ships group cache — matches BaseTroop caching pattern
# ---------------------------------------------------------------------------
static var _cached_ships: Array = []
static var _ships_cache_frame: int = -1

## Returns the "ships" group, refreshed at most once per process frame.
static func _get_ships_cached() -> Array:
	var frame: int = BaseTroop.combat_cache_key()
	if frame != _ships_cache_frame:
		var tree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_ships = tree.get_nodes_in_group("ships")
		_ships_cache_frame = frame
	return _cached_ships


static func reset_runtime_cache() -> void:
	_cached_ships.clear()
	_ships_cache_frame = -1


# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var is_attack_mode: bool = false
var _ships_placed: int = 0
var _total_ships_launched: int = 0  # never reset mid-attack; used by React HUD
## Fleet data: array of {level: int, troops: [String], model_path: String}
## Populated by enter_attack_mode() from the player's actual port ships.
var _fleet: Array = []
var _active_ship_tweens: Array = []  # track tweens to kill on cancel
var _next_troop_idx: int = 0  # kept for replay compatibility
var ship_plane: MeshInstance3D
var plane_y: float = 0.0
var water_y: float = 0.0
var plane_center: Vector3 = Vector3.ZERO
var plane_extent_x: float = 0.0
var plane_extent_z: float = 0.0
var _click_extent_x: float = 0.0
var _click_extent_z: float = 0.0
## Tracks stop positions of ships currently sailing / waiting to depart
var _ship_stop_positions: Array = []
## X marker nodes shown at each ship's landing spot
var _ship_markers: Array = []
## Incremented whenever combat placement/replay is cancelled. Delayed spawn
## timers capture this value so they cannot spawn troops after return_home.
var _combat_generation: int = 0
var _manual_deployment_mode: bool = false
var _main_ship_ready_for_deployment: bool = false
var _army_entries: Array[String] = []
var _army_groups: Array[Dictionary] = []
var _selected_group_idx: int = 0
var _manual_deploy_index: int = 0
var _main_ship_controller: Node = null
var _hold_deploy_active: bool = false
var _hold_deploy_elapsed: float = 0.0
var _hold_deploy_next_delay: float = 0.0
var _hold_deploy_hit: Vector3 = Vector3.INF
var _hold_deploy_group_key: String = ""


func _cancel_pending_combat_spawns() -> void:
	_combat_generation += 1


func _wait_combat_delay(seconds: float, spawn_generation: int) -> bool:
	var ticks: int = maxi(0, int(round(maxf(0.0, seconds) / BaseTroop.REPLAY_COMBAT_DELTA)))
	for _i in ticks:
		if spawn_generation != _combat_generation or not is_inside_tree():
			return false
		await get_tree().physics_frame
	return spawn_generation == _combat_generation and is_inside_tree()


func _ready() -> void:
	WebLoadLogger.report("attack_system_ready_start")
	ship_plane = get_node_or_null(grid_plane_path)
	if ship_plane == null:
		push_warning("AttackSystem: shipPlane not found")
		WebLoadLogger.report("attack_system_ready_missing_plane")
		return
	ship_plane.visible = false
	_refresh_placement_bounds()
	_main_ship_controller = get_node_or_null(main_ship_controller_path)
	WebLoadLogger.report("attack_system_ready_done")


func _refresh_placement_bounds() -> void:
	if ship_plane == null:
		ship_plane = get_node_or_null(grid_plane_path)
	if ship_plane == null:
		return
	plane_center = ship_plane.global_position
	plane_y = plane_center.y
	# Full basis length for ship positioning math
	plane_extent_x = ship_plane.global_transform.basis.x.length()
	plane_extent_z = ship_plane.global_transform.basis.z.length()
	# Half extent = actual visual bounds of the BoxMesh (default 1x1x1, verts from -0.5 to 0.5)
	_click_extent_x = plane_extent_x * 0.5
	_click_extent_z = plane_extent_z * 0.5
	var water: Node3D = get_node_or_null(water_node_path)
	if water:
		water_y = water.global_position.y


func _physics_process(delta: float) -> void:
	delta = minf(delta, 0.1)
	if _manual_deployment_mode:
		_update_hold_deployment(delta)
	else:
		_separate_ships(delta)


## Push overlapping ships apart so they never clip through each other.
func _separate_ships(delta: float) -> void:
	var ships: Array = _get_ships_cached()
	if ships.is_empty():
		return
	for i in ships.size():
		var a: Node3D = ships[i]
		if not is_instance_valid(a):
			continue
		for j in range(i + 1, ships.size()):
			var b: Node3D = ships[j]
			if not is_instance_valid(b):
				continue
			var diff: Vector3 = a.global_position - b.global_position
			diff.y = 0
			var dist: float = diff.length()
			if dist < SHIP_PUSH_RADIUS and dist > 0.001:
				var push: Vector3 = diff.normalized() * (SHIP_PUSH_RADIUS - dist) * delta * 4.0
				a.global_position += push
				b.global_position -= push


## Activates attack mode with the player's actual fleet.
## [fleet] is an Array of {level: int, troops: Array[String]} — one entry per ship.
## If fleet is empty, falls back to legacy mode (no ships to place).
func enter_attack_mode(fleet: Array = []) -> void:
	ensure_combat_resources_loaded(_troop_names_from_fleet(fleet))
	_cancel_pending_combat_spawns()
	_refresh_placement_bounds()
	_manual_deployment_mode = true
	_main_ship_ready_for_deployment = false
	is_attack_mode = false
	_ships_placed = 0
	_total_ships_launched = 0
	_manual_deploy_index = 0
	_selected_group_idx = 0
	_fleet = fleet.duplicate(true)
	_ship_stop_positions.clear()
	_ship_markers.clear()
	_army_entries.clear()
	_army_groups.clear()
	if _fleet.is_empty():
		_manual_deployment_mode = false
		_emit_army_info()
		return
	var raw_troops: Variant = _fleet[0].get("troops", [])
	if raw_troops is Array:
		for raw_entry in raw_troops:
			var troop_entry: String = str(raw_entry).strip_edges()
			if troop_entry == "" or troop_entry == "_SLOT_FILLER_":
				continue
			_army_entries.append(troop_entry)
	_rebuild_army_groups()
	if _army_entries.is_empty():
		_manual_deployment_mode = false
		_emit_army_info()
		return
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_pre_attack"):
		audio.play_pre_attack()
	_emit_army_info()
	if ship_plane:
		ship_plane.visible = false
	_main_ship_controller = get_node_or_null(main_ship_controller_path)
	if _main_ship_controller == null or not _main_ship_controller.has_method("sail_to_combat"):
		push_error("AttackSystem: MainShipController is unavailable")
		_manual_deployment_mode = false
		return
	print("[ATTACK_DEPLOY] main_ship_sailing units=", _army_entries.size())
	await _main_ship_controller.sail_to_combat()
	if not _manual_deployment_mode or _army_entries.is_empty():
		return
	_main_ship_ready_for_deployment = true
	is_attack_mode = true
	if ship_plane:
		ship_plane.visible = true
	_emit_army_info()
	print("[ATTACK_DEPLOY] manual_deployment_ready units=", _army_entries.size())


func _rebuild_army_groups() -> void:
	var previous_key: String = ""
	if _selected_group_idx >= 0 and _selected_group_idx < _army_groups.size():
		previous_key = str(_army_groups[_selected_group_idx].get("key", ""))
	var group_map: Dictionary = {}
	var group_order: Array[String] = []
	for troop_entry in _army_entries:
		var key: String = _normalize_troop_entry(troop_entry)
		if not group_map.has(key):
			group_map[key] = {"key": key, "label": key, "count": 0, "entries": []}
			group_order.append(key)
		group_map[key]["count"] = int(group_map[key].get("count", 0)) + 1
		group_map[key]["entries"].append(troop_entry)
	_army_groups.clear()
	for key in group_order:
		_army_groups.append(group_map[key])
	_selected_group_idx = 0
	if previous_key != "":
		for i in _army_groups.size():
			if str(_army_groups[i].get("key", "")) == previous_key:
				_selected_group_idx = i
				break


func _emit_army_info() -> void:
	var bridge: Node = get_node_or_null("/root/Bridge")
	if bridge == null:
		return
	var ship_data: Dictionary = _fleet[0] if not _fleet.is_empty() else {}
	bridge.send_to_react("fleet_info", {
		"mode": "manual_troops",
		"ready": _main_ship_ready_for_deployment,
		"selected_group": _selected_group_idx,
		"remaining": _army_entries.size(),
		"ship": {
			"level": int(ship_data.get("level", 1)),
			"capacity": int(ship_data.get("capacity", _army_entries.size())),
		},
		"troop_groups": _army_groups.duplicate(true),
		# Compatibility fields keep older cached React clients functional.
		"total_ships": 1 if not ship_data.is_empty() else 0,
		"placed": 1 if _main_ship_ready_for_deployment else 0,
		"ships": [{
			"level": int(ship_data.get("level", 1)),
			"troops": _army_entries.duplicate(),
			"placed": _army_entries.is_empty(),
		}] if not ship_data.is_empty() else [],
	})


func remaining_undeployed_troops() -> int:
	if not _manual_deployment_mode:
		return 0
	return _army_entries.size()


func select_troop_group(index: int) -> int:
	_stop_hold_deployment()
	if _army_groups.is_empty():
		_selected_group_idx = 0
	else:
		_selected_group_idx = clampi(index, 0, _army_groups.size() - 1)
	_next_troop_idx = _selected_group_idx
	_emit_army_info()
	return _selected_group_idx


func get_main_ship_node() -> Node3D:
	_main_ship_controller = get_node_or_null(main_ship_controller_path)
	if _main_ship_controller and _main_ship_controller.has_method("get_active_ship_node"):
		return _main_ship_controller.get_active_ship_node()
	return null


func _troop_names_from_fleet(fleet: Array) -> Array:
	var names: Array = []
	for fleet_entry in fleet:
		if not (fleet_entry is Dictionary):
			continue
		var troops_value: Variant = fleet_entry.get("troops", [])
		if not (troops_value is Array):
			continue
		for raw_name in troops_value:
			var troop_name := str(raw_name).split(":", false, 1)[0].strip_edges()
			if troop_name == "" or troop_name.begins_with("_") or names.has(troop_name):
				continue
			names.append(troop_name)
	return names


## Replay setup: same fleet data as attack mode, but no interactive placement
## plane. Replay actions drive placement directly from recorded coordinates.
func enter_replay_mode(fleet: Array = []) -> void:
	ensure_combat_resources_loaded(_troop_names_from_fleet(fleet))
	_refresh_placement_bounds()
	exit_attack_mode()
	_manual_deployment_mode = false
	_fleet = fleet.duplicate(true)
	_ships_placed = 0
	_total_ships_launched = 0
	_ship_stop_positions.clear()
	_ship_markers.clear()
	is_attack_mode = false
	if ship_plane:
		ship_plane.visible = false


## Temporarily hides the placement plane without resetting any state.
## Used when cannon mode activates mid-placement to prevent RMB conflicts.
func _pause_attack_mode() -> void:
	_stop_hold_deployment()
	is_attack_mode = false
	if ship_plane:
		ship_plane.visible = false


## Restores the placement plane after cannon mode ends, if ships still remain.
func _resume_attack_mode() -> void:
	if _manual_deployment_mode:
		if not _main_ship_ready_for_deployment or _army_entries.is_empty():
			return
		is_attack_mode = true
		if ship_plane:
			ship_plane.visible = true
		return
	if _ships_placed >= mini(_fleet.size(), max_ships):
		return
	is_attack_mode = true
	if ship_plane:
		ship_plane.visible = true


## Called when all ships are placed — hides plane but keeps markers alive.
func _finish_attack_mode() -> void:
	_stop_hold_deployment()
	is_attack_mode = false
	_main_ship_ready_for_deployment = false
	_ship_stop_positions.clear()
	if ship_plane:
		ship_plane.visible = false


## Deactivates attack mode, hides the placement plane, and frees any
## pending flag markers that were not yet cleaned up by arriving ships.
func exit_attack_mode() -> void:
	_stop_hold_deployment()
	_cancel_pending_combat_spawns()
	is_attack_mode = false
	_ships_placed = 0
	_total_ships_launched = 0
	_next_troop_idx = 0
	_manual_deployment_mode = false
	_main_ship_ready_for_deployment = false
	_army_entries.clear()
	_army_groups.clear()
	_manual_deploy_index = 0
	# Kill any in-flight ship tweens to prevent orphaned troop deployment
	for tw in _active_ship_tweens:
		if tw and tw.is_valid():
			tw.kill()
	_active_ship_tweens.clear()
	# Free markers for ships that were cancelled before arriving
	for marker in _ship_markers:
		if is_instance_valid(marker):
			marker.queue_free()
	_ship_markers.clear()
	_ship_stop_positions.clear()
	if ship_plane:
		ship_plane.visible = false


func cleanup_combat_nodes() -> void:
	exit_attack_mode()
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	for group_name in ["troops", "skeleton_guards", "ships", "deployed_ships", "combat_ephemeral_vfx"]:
		for node in tree.get_nodes_in_group(group_name):
			if not is_instance_valid(node):
				continue
			if node.has_method("_clear_owned_projectiles"):
				node.call("_clear_owned_projectiles")
			if node.has_method("set_process"):
				node.set_process(false)
			if node.has_method("set_physics_process"):
				node.set_physics_process(false)
			if node.is_in_group(group_name):
				node.remove_from_group(group_name)
			node.queue_free()
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()


func _input(event: InputEvent) -> void:
	if not is_attack_mode:
		return

	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
			if _hold_deploy_active:
				_stop_hold_deployment()
				get_viewport().set_input_as_handled()
			return
		if not event.pressed:
			return
		if event.button_index == MOUSE_BUTTON_LEFT:
			var hit = _get_mouse_hit()
			if hit != Vector3.INF:
				if _manual_deployment_mode:
					var selected_key: String = _selected_troop_group_key()
					if _try_deploy_selected_troop(hit):
						_start_hold_deployment(hit, selected_key)
						get_viewport().set_input_as_handled()
				elif _try_place_ship(hit):
					get_viewport().set_input_as_handled()
					if _ships_placed >= mini(_fleet.size(), max_ships):
						_finish_attack_mode()
				else:
					get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			# RMB is easy to hit accidentally in web builds. Do not cancel ship
			# placement here; surrender/return_home are the explicit exits.
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseMotion and _hold_deploy_active:
		_hold_deploy_hit = _get_mouse_hit()
		get_viewport().set_input_as_handled()


func _selected_troop_group_key() -> String:
	if _army_groups.is_empty():
		return ""
	_selected_group_idx = clampi(_selected_group_idx, 0, _army_groups.size() - 1)
	return str(_army_groups[_selected_group_idx].get("key", ""))


func _start_hold_deployment(hit: Vector3, group_key: String) -> void:
	_hold_deploy_active = group_key != "" and hit != Vector3.INF
	_hold_deploy_elapsed = 0.0
	_hold_deploy_next_delay = maxf(0.05, hold_deploy_initial_delay)
	_hold_deploy_hit = hit
	_hold_deploy_group_key = group_key


func _stop_hold_deployment() -> void:
	_hold_deploy_active = false
	_hold_deploy_elapsed = 0.0
	_hold_deploy_next_delay = 0.0
	_hold_deploy_hit = Vector3.INF
	_hold_deploy_group_key = ""


func _update_hold_deployment(delta: float) -> void:
	if not _hold_deploy_active:
		return
	if not is_attack_mode or not _main_ship_ready_for_deployment or not Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		_stop_hold_deployment()
		return
	_hold_deploy_hit = _get_mouse_hit()
	_advance_hold_deployment(delta)


func _advance_hold_deployment(delta: float) -> void:
	if not _hold_deploy_active:
		return
	_hold_deploy_elapsed += maxf(0.0, delta)
	if _hold_deploy_elapsed < _hold_deploy_next_delay:
		return
	if _hold_deploy_hit == Vector3.INF:
		return
	var matching_group_index: int = -1
	for i in _army_groups.size():
		if str(_army_groups[i].get("key", "")) == _hold_deploy_group_key:
			matching_group_index = i
			break
	if matching_group_index < 0:
		_stop_hold_deployment()
		return
	_selected_group_idx = matching_group_index
	_next_troop_idx = matching_group_index
	if not _try_deploy_selected_troop(_hold_deploy_hit):
		_stop_hold_deployment()
		return
	_hold_deploy_elapsed = 0.0
	_hold_deploy_next_delay = maxf(0.05, hold_deploy_repeat_interval)


func _get_mouse_hit() -> Vector3:
	if ship_plane == null:
		return Vector3.INF
	var camera = get_viewport().get_camera_3d()
	if camera == null:
		return Vector3.INF
	var mouse = get_viewport().get_mouse_position()
	var from = camera.project_ray_origin(mouse)
	var dir = camera.project_ray_normal(mouse)

	if abs(dir.y) < 0.001:
		return Vector3.INF

	var t = (plane_y - from.y) / dir.y
	if t < 0:
		return Vector3.INF

	var world_hit = from + dir * t

	var offset = world_hit - plane_center
	var pb = ship_plane.global_transform.basis
	var local_x = offset.dot(pb.x.normalized())
	var local_z = offset.dot(pb.z.normalized())

	if abs(local_x) <= _click_extent_x and abs(local_z) <= _click_extent_z:
		return world_hit

	return Vector3.INF


func _try_deploy_selected_troop(hit: Vector3) -> bool:
	if not _manual_deployment_mode or not _main_ship_ready_for_deployment:
		return false
	if not _is_within_ship_plane(hit) or _army_groups.is_empty():
		return false
	_selected_group_idx = clampi(_selected_group_idx, 0, _army_groups.size() - 1)
	var selected_key: String = str(_army_groups[_selected_group_idx].get("key", ""))
	var entry_index: int = -1
	for i in _army_entries.size():
		if _normalize_troop_entry(_army_entries[i]) == selected_key:
			entry_index = i
			break
	if entry_index < 0:
		return false
	var troop_entry: String = _army_entries[entry_index]
	var bs_ref: Node = get_node_or_null("../BuildingSystem")
	var troop_key: String = _normalize_troop_entry(troop_entry)
	var fallback_level: int = 1
	if bs_ref and "troop_levels" in bs_ref:
		fallback_level = int(bs_ref.troop_levels.get(troop_key, 1))
	var troop_level: int = _troop_entry_level(troop_entry, fallback_level)
	var deploy_pos: Vector3 = hit
	if bs_ref and "grid_y" in bs_ref:
		deploy_pos.y = float(bs_ref.grid_y)
	if not _spawn_manual_troop(troop_entry, troop_level, deploy_pos, _manual_deploy_index):
		push_warning("AttackSystem: deployment failed for %s; keeping it in the roster" % troop_key)
		return false
	_army_entries.remove_at(entry_index)
	if bs_ref and bs_ref.is_viewing_enemy:
		var t: float = Time.get_ticks_msec() / 1000.0 - bs_ref._battle_start_time
		bs_ref._battle_replay.append({
			"t": t,
			"type": "deploy_troop",
			"deploy_index": _manual_deploy_index,
			"troop": troop_entry,
			"troopType": troop_key,
			"troopLevel": troop_level,
			"shipLevel": int(_fleet[0].get("level", 1)) if not _fleet.is_empty() else 1,
			"x": hit.x,
			"z": hit.z,
		})
	_manual_deploy_index += 1
	_total_ships_launched = 1
	var audio: Node = get_node_or_null("/root/AudioManager")
	if _manual_deploy_index == 1 and audio and audio.has_method("play_fight"):
		audio.play_fight()
	_rebuild_army_groups()
	if _army_entries.is_empty():
		_finish_attack_mode()
	_emit_army_info()
	print("[ATTACK_DEPLOY] troop=", troop_key, " remaining=", _army_entries.size(), " x=", hit.x, " z=", hit.z)
	return true


func _spawn_manual_troop(troop_entry: String, troop_level: int, spawn_pos: Vector3, deploy_index: int) -> bool:
	var troop_key: String = _normalize_troop_entry(troop_entry)
	var cached: Dictionary = _get_or_load_troop_resources(troop_key)
	var model_res: Resource = cached.get("model", null)
	var script_res: Resource = cached.get("script", null)
	if model_res == null or script_res == null:
		push_warning("AttackSystem: troop resources are missing for %s" % troop_key)
		return false
	var bs_ref: Node = get_node_or_null("../BuildingSystem")
	_spawn_troop_after_delay(
		0.0,
		_combat_generation,
		model_res,
		script_res,
		"TroopDeploy_%d" % deploy_index,
		deploy_index,
		troop_level,
		spawn_pos,
		Vector3.ZERO,
		spawn_pos.y,
		bs_ref,
		troop_entry,
		true
	)
	return true


func replay_deploy_troop(action: Dictionary) -> bool:
	var troop_entry: String = str(action.get("troop", action.get("troop_entry", action.get("troopType", "")))).strip_edges()
	if troop_entry == "":
		return false
	var troop_key: String = _normalize_troop_entry(troop_entry)
	var level: int = int(action.get("troopLevel", action.get("troop_level", 1)))
	_refresh_placement_bounds()
	var spawn_pos := Vector3(float(action.get("x", 0.0)), plane_y, float(action.get("z", 0.0)))
	var bs_ref: Node = get_node_or_null("../BuildingSystem")
	if bs_ref and "grid_y" in bs_ref:
		spawn_pos.y = float(bs_ref.grid_y)
	var replay_index: int = int(action.get("deploy_index", _manual_deploy_index))
	var spawned: bool = _spawn_manual_troop(troop_entry, _troop_entry_level(troop_entry, level), spawn_pos, replay_index)
	if spawned:
		_manual_deploy_index = maxi(_manual_deploy_index, replay_index + 1)
		print("[ATTACK_REPLAY] deploy_troop troop=", troop_key, " index=", replay_index)
	return spawned


## Returns a stop position offset laterally so it doesn't overlap existing ships.
## Returns Vector3.INF if no valid position found within shipPlane bounds.
func _get_adjusted_stop_pos(desired: Vector3, lateral_dir: Vector3) -> Vector3:
	var pos: Vector3 = desired
	for attempt in range(10):
		var overlap: bool = false
		for existing in _ship_stop_positions:
			if pos.distance_to(existing) < SHIP_MIN_SEPARATION:
				overlap = true
				break
		if not overlap:
			if _is_within_ship_plane(pos):
				return pos
			return Vector3.INF
		# Alternate left / right, increasing distance each round
		var side: int = 1 if (attempt % 2 == 0) else -1
		var dist: float = ceil((attempt + 1) / 2.0) * SHIP_MIN_SEPARATION
		pos = desired + lateral_dir * dist * side
	return Vector3.INF


## Checks if a world position is within the shipPlane bounds.
func _is_within_ship_plane(pos: Vector3) -> bool:
	_refresh_placement_bounds()
	if ship_plane == null:
		return false
	var offset = pos - plane_center
	var pb = ship_plane.global_transform.basis
	var local_x = offset.dot(pb.x.normalized())
	var local_z = offset.dot(pb.z.normalized())
	return abs(local_x) <= _click_extent_x and abs(local_z) <= _click_extent_z


## Attempts to place the selected fleet ship at the clicked position. Returns true if successful.
func _try_place_ship(hit: Vector3) -> bool:
	if not _is_within_ship_plane(hit):
		return false
	var ship_limit: int = mini(_fleet.size(), max_ships)
	if _ships_placed >= ship_limit:
		return false
	# Find which ship to place — use selected index, skip already-placed ships
	var ship_idx: int = clampi(_next_troop_idx, 0, ship_limit - 1)
	if _fleet[ship_idx].get("_placed", false):
		# Selected ship already placed — find next unplaced
		ship_idx = -1
		for i in ship_limit:
			if not _fleet[i].get("_placed", false):
				ship_idx = i
				break
		if ship_idx < 0:
			return false
	for existing in _ship_stop_positions:
		if hit.distance_to(existing) < SHIP_MIN_SEPARATION:
			return false
	if not _spawn_single_ship(hit, ship_idx):
		return false
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_fight"):
		audio.play_fight()
	_fleet[ship_idx]["_placed"] = true
	_ships_placed += 1
	_total_ships_launched += 1
	# Record ship placement in battle replay
	var bs: Node = get_node_or_null("../BuildingSystem")
	var ship_data: Dictionary = _fleet[ship_idx]
	if bs and bs.is_viewing_enemy:
		var t: float = Time.get_ticks_msec() / 1000.0 - bs._battle_start_time
		# Log the ACTUAL troop spawn position (post-sail), not the raw click
		# target. The server's verifyReplay spawns troops at these coords, so
		# they need to match where the game actually places them — otherwise
		# server troops appear offshore and the TH survives in the sim.
		var stop_pos_for_log: Vector3 = _ship_stop_positions[-1]
		var spawn_pos_for_log: Vector3 = _base_troop_spawn_pos(stop_pos_for_log)
		var troop_names_for_log: Array = ship_data.get("troops", [])
		var troop_offsets_for_log: Array = []
		var troop_spawns_for_log: Array = []
		var lat_dir_for_log: Vector3 = _get_lateral_dir()
		for i in troop_names_for_log.size():
			var troop_name_for_spawn: String = str(troop_names_for_log[i])
			var troop_key_for_spawn: String = _normalize_troop_entry(troop_name_for_spawn)
			var offset_for_spawn := Vector3.ZERO
			if not TROOP_DEFS.get(troop_key_for_spawn, {}).is_empty():
				offset_for_spawn = lat_dir_for_log * (randf_range(-0.5, 0.5)) * 0.15
			troop_offsets_for_log.append(offset_for_spawn)
			var exact_spawn_for_log: Vector3 = BaseTroop._clamp_to_island(spawn_pos_for_log + offset_for_spawn)
			troop_spawns_for_log.append({"x": exact_spawn_for_log.x, "z": exact_spawn_for_log.z})
		ship_data["_precomputed_troop_offsets"] = troop_offsets_for_log
		var troop_levels_for_log: Dictionary = {}
		if "troop_levels" in bs:
			for troop_name in troop_names_for_log:
				var troop_key_for_log: String = _normalize_troop_entry(troop_name)
				var troop_level_for_log: int = _troop_entry_level(troop_name, bs.troop_levels.get(troop_key_for_log, 1))
				troop_levels_for_log[troop_name] = troop_level_for_log
				troop_levels_for_log[troop_key_for_log] = troop_level_for_log
		bs._battle_replay.append({
			"t": t, "type": "place_ship",
			"x": spawn_pos_for_log.x, "z": spawn_pos_for_log.z,
			"shipLevel": ship_data.get("level", 1),
			"port_number": ship_data.get("port_number", ship_idx + 1),
			"port_server_id": ship_data.get("port_server_id", -1),
			"troops": troop_names_for_log,
			"troop_spawns": troop_spawns_for_log,
			"troopLevels": troop_levels_for_log,
		})
	var bridge: Node = get_node_or_null("/root/Bridge")
	if bridge:
		var ships_update: Array = []
		for i in mini(_fleet.size(), max_ships):
			var s = _fleet[i]
			ships_update.append({
				"level": s.get("level", 1),
				"troops": s.get("troops", []),
				"placed": s.get("_placed", false),
				"port_number": s.get("port_number", i + 1),
				"port_server_id": s.get("port_server_id", -1),
			})
		bridge.send_to_react("fleet_info", {"total_ships": ship_limit, "placed": _ships_placed, "ships": ships_update})
	return true


## Creates a pirate flag marker at the ship's landing position.
func _create_x_marker(pos: Vector3) -> Node3D:
	if _flag_scene_res == null:
		push_warning("AttackSystem: flag model not found")
		return Node3D.new()

	var flag = _flag_scene_res.instantiate()
	flag.scale = Vector3(FLAG_SCALE, FLAG_SCALE, FLAG_SCALE)
	get_tree().current_scene.add_child(flag)
	flag.global_position = pos + Vector3(0, FLAG_Y_OFFSET, 0)

	# Play the waving animation on loop
	var anim_player = _find_child_anim_player(flag)
	if anim_player and anim_player.has_animation("flag|Action"):
		anim_player.get_animation("flag|Action").loop_mode = Animation.LOOP_LINEAR
		anim_player.speed_scale = 0.4
		anim_player.play("flag|Action")

	BaseTroop.report_render_diagnostic(flag, "asset.pirate_flag_marker", {
		"asset": "res://Model/flag/pirate_flag_animated.glb",
		"scale": FLAG_SCALE,
		"animation": "flag|Action" if anim_player else "",
	})
	return flag


func _find_child_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_child_anim_player(child)
		if result:
			return result
	return null


func _get_sail_dir() -> Vector3:
	_refresh_placement_bounds()
	if ship_plane == null:
		return Vector3(0, 0, 1)
	var sail_dir: Vector3 = ship_plane.global_transform.basis.z.normalized()
	sail_dir.y = 0
	sail_dir = sail_dir.normalized()
	var to_plane: Vector3 = (plane_center - ship_plane.get_parent().global_position).normalized()
	if sail_dir.dot(to_plane) < 0:
		sail_dir = -sail_dir
	return sail_dir


func _get_lateral_dir() -> Vector3:
	_refresh_placement_bounds()
	if ship_plane == null:
		return Vector3(1, 0, 0)
	var lateral_dir: Vector3 = ship_plane.global_transform.basis.x.normalized()
	lateral_dir.y = 0
	return lateral_dir.normalized()


func _stop_pos_from_troop_spawn_pos(spawn_pos: Vector3) -> Vector3:
	_refresh_placement_bounds()
	if ship_plane == null:
		return spawn_pos
	var lat_dir: Vector3 = _get_lateral_dir()
	var sail_dir: Vector3 = _get_sail_dir()
	var stop_pos: Vector3 = spawn_pos + sail_dir * (plane_extent_z * 0.5) + lat_dir * 0.2
	stop_pos.y = water_y
	if _is_within_ship_plane(stop_pos):
		return stop_pos
	var offset: Vector3 = stop_pos - plane_center
	var lateral: float = clampf(offset.dot(lat_dir), -_click_extent_x, _click_extent_x)
	stop_pos = plane_center + lat_dir * lateral - sail_dir * (_click_extent_z - 0.05)
	stop_pos.y = water_y
	return stop_pos


## Spawns a fleet ship at the edge of the placement zone and sails it to [target].
## [ship_idx] specifies which fleet entry to use.
func _spawn_single_ship(target: Vector3, ship_idx: int = -1, target_is_stop_pos: bool = false, deploy_on_arrival: bool = true) -> bool:
	_refresh_placement_bounds()
	if ship_plane == null:
		return false
	if ship_idx < 0:
		ship_idx = _ships_placed
	if ship_idx >= _fleet.size():
		return false
	var ship_data: Dictionary = _fleet[ship_idx]
	var ship_level: int = ship_data.get("level", 1)
	var model_idx: int = clampi(ship_level - 1, 0, SHIP_MODELS.size() - 1)
	# Use preloaded cache — no synchronous `load()` in the combat hot path.
	var ship_res: Resource = _ship_model_cache[model_idx] if model_idx < _ship_model_cache.size() else null
	if ship_res == null:
		push_warning("AttackSystem: ship model not found for level %d" % ship_level)
		return false
	var ship: Node3D = ship_res.instantiate()
	var ship_scale: float = SHIP_SCALES[model_idx]
	ship.scale = Vector3(ship_scale, ship_scale, ship_scale)

	# Sailing direction — perpendicular to shipPlane, pointing outward
	var sail_dir: Vector3 = _get_sail_dir()

	# Ship stops at inner edge of ShipPlane (closest to buildings)
	var lateral_dir: Vector3 = _get_lateral_dir()
	var stop_pos: Vector3
	if target_is_stop_pos:
		stop_pos = target
		stop_pos.y = water_y
		if not _is_within_ship_plane(stop_pos):
			var explicit_offset: Vector3 = stop_pos - plane_center
			var explicit_lateral: float = clampf(explicit_offset.dot(lateral_dir), -_click_extent_x, _click_extent_x)
			stop_pos = plane_center + lateral_dir * explicit_lateral - sail_dir * (_click_extent_z - 0.05)
	else:
		var offset: Vector3 = target - plane_center
		var lateral: float = offset.dot(lateral_dir)
		lateral = clampf(lateral, -_click_extent_x, _click_extent_x)
		stop_pos = plane_center + lateral_dir * lateral - sail_dir * (_click_extent_z - 0.05)
	stop_pos.y = water_y

	if not target_is_stop_pos:
		# Offset laterally so this ship doesn't land on top of an existing one
		stop_pos = _get_adjusted_stop_pos(stop_pos, lateral_dir)
		if stop_pos == Vector3.INF:
			return false
	_ship_stop_positions.append(stop_pos)

	var spawn_pos: Vector3 = stop_pos + sail_dir * spawn_distance
	spawn_pos.y = water_y

	# Flag marker at the landing spot
	var marker: Node3D = _create_x_marker(stop_pos)
	_ship_markers.append(marker)

	# Wrap ship in a pivot so we can rock independently of movement
	var pivot: Node3D = Node3D.new()
	pivot.add_to_group("ships")
	get_tree().current_scene.add_child(pivot)
	pivot.global_position = spawn_pos
	ship.position = Vector3.ZERO
	pivot.add_child(ship)
	pivot.look_at(stop_pos, Vector3.UP)
	pivot.rotate_y(PI)

	# Main movement
	var tween: Tween = create_tween()
	tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	_active_ship_tweens.append(tween)
	tween.tween_property(pivot, "global_position", stop_pos, sail_duration).set_trans(Tween.TRANS_LINEAR)

	# When ship arrives → remove flag marker, free stop slot, deploy troops
	var arrived_pos: Vector3 = stop_pos
	var s_dir: Vector3 = sail_dir
	var _deploy_idx: int = ship_idx
	var arrive_generation: int = _combat_generation
	tween.finished.connect(func():
		if arrive_generation != _combat_generation:
			return
		if not is_instance_valid(pivot):
			return
		if is_instance_valid(ship):
			ship.rotation = Vector3.ZERO
		if is_instance_valid(marker):
			marker.queue_free()
		_ship_markers.erase(marker)
		if deploy_on_arrival:
			_deploy_troops_from_ship(arrived_pos, s_dir, _deploy_idx)
		# Move from "ships" (sailing) to "deployed_ships" (arrived) so check_defeat
		# knows sailing is done, but return_home can still free them.
		if is_instance_valid(pivot):
			pivot.remove_from_group("ships")
			pivot.add_to_group("deployed_ships")
	)
	print("Ship %d/%d sailing to: %s" % [_ships_placed + 1, max_ships, stop_pos])
	return true


func replay_place_ship_from_spawn(action: Dictionary) -> bool:
	if _fleet.is_empty():
		return replay_deploy_troops_at_spawn(action)
	var ship_limit: int = mini(_fleet.size(), max_ships)
	if _ships_placed >= ship_limit:
		return false
	var ship_idx: int = _ships_placed
	for i in ship_limit:
		if not _fleet[i].get("_placed", false):
			ship_idx = i
			break
	_refresh_placement_bounds()
	var spawn_pos: Vector3 = Vector3(float(action.get("x", 0.0)), water_y, float(action.get("z", 0.0)))
	var has_explicit_stop: bool = action.has("stop_x") and action.has("stop_z")
	var stop_pos: Vector3
	if has_explicit_stop:
		stop_pos = Vector3(float(action.get("stop_x", 0.0)), water_y, float(action.get("stop_z", 0.0)))
	else:
		stop_pos = _stop_pos_from_troop_spawn_pos(spawn_pos)
	if not _spawn_single_ship(stop_pos, ship_idx, true, false):
		return replay_deploy_troops_at_spawn(action)
	if has_explicit_stop and (action.has("troop_x") or action.has("x")):
		var replay_spawn := Vector3(
			float(action.get("troop_x", action.get("x", 0.0))),
			water_y,
			float(action.get("troop_z", action.get("z", 0.0)))
		)
		_fleet[ship_idx]["_replay_troop_spawn"] = replay_spawn
		_fleet[ship_idx]["_replay_exact_spawn"] = true
	var raw_spawns = action.get("troop_spawns", [])
	if raw_spawns is Array and not raw_spawns.is_empty():
		var exact_spawns: Array = []
		for raw in raw_spawns:
			if raw is Dictionary:
				exact_spawns.append(Vector3(float(raw.get("x", action.get("x", 0.0))), water_y, float(raw.get("z", action.get("z", 0.0)))))
		if not exact_spawns.is_empty():
			_fleet[ship_idx]["_replay_troop_spawns"] = exact_spawns
			_fleet[ship_idx]["_replay_exact_spawn"] = true
	_fleet[ship_idx]["_placed"] = true
	_ships_placed += 1
	_total_ships_launched += 1
	_deploy_troops_from_ship_after_delay(stop_pos, _get_sail_dir(), ship_idx, sail_duration, _combat_generation)
	return true


func replay_deploy_troops_at_spawn(action: Dictionary) -> bool:
	var troop_names: Array = []
	var raw_troops = action.get("troops", [])
	if raw_troops is Array:
		for troop in raw_troops:
			var troop_name: String = str(troop).strip_edges()
			if troop_name != "":
				troop_names.append(troop_name)
	elif action.has("troopType"):
		var legacy_name: String = str(action.get("troopType", "")).strip_edges()
		if legacy_name != "":
			troop_names.append(legacy_name.capitalize())
	if troop_names.is_empty():
		return false
	if not _fleet.is_empty() and _ships_placed >= mini(_fleet.size(), max_ships):
		return false
	var recorded_levels: Dictionary = {}
	var raw_levels = action.get("troopLevels", action.get("troop_levels", {}))
	if raw_levels is Dictionary:
		recorded_levels = raw_levels
	_refresh_placement_bounds()
	var spawn_pos: Vector3 = Vector3(float(action.get("x", 0.0)), water_y, float(action.get("z", 0.0)))
	_spawn_troops_at_pos(troop_names, recorded_levels, spawn_pos)
	if not _fleet.is_empty():
		var ship_limit: int = mini(_fleet.size(), max_ships)
		var ship_idx: int = clampi(_ships_placed, 0, ship_limit - 1)
		for i in ship_limit:
			if not _fleet[i].get("_placed", false):
				ship_idx = i
				break
		_fleet[ship_idx]["_placed"] = true
	_total_ships_launched += 1
	if _ships_placed < max_ships:
		_ships_placed += 1
	return true


func _deploy_troops_from_ship_after_delay(ship_pos: Vector3, sail_dir: Vector3, ship_idx: int, delay: float, spawn_generation: int) -> void:
	var ok: bool = await _wait_combat_delay(delay, spawn_generation)
	if not ok:
		return
	_deploy_troops_from_ship(ship_pos, sail_dir, ship_idx)


func _spawn_troop_after_delay(
	delay: float,
	spawn_generation: int,
	model_res: Resource,
	script_res: Resource,
	troop_node_name: String,
	replay_order: int,
	lvl: int,
	troop_spawn_pos: Vector3,
	offset: Vector3,
	building_y: float,
	bs_ref: Node,
	troop_entry: String = "",
	exact_position: bool = false
) -> void:
	var ok: bool = await _wait_combat_delay(delay, spawn_generation)
	if not ok:
		return
	var troop = model_res.instantiate()
	troop.set_script(script_res)
	troop.name = troop_node_name
	troop.set_meta("replay_order", replay_order)
	if troop.has_method("set_player_troop_levels"):
		var player_levels: Dictionary = bs_ref.troop_levels if bs_ref and "troop_levels" in bs_ref else {}
		troop.set_player_troop_levels(player_levels)
	if troop.has_method("set_nft_rarity"):
		troop.set_nft_rarity(_troop_entry_rarity(troop_entry))
	get_tree().current_scene.add_child(troop)
	var troop_scale_key := _normalize_troop_entry(troop_entry)
	if not TROOP_DEFS.has(troop_scale_key) and script_res != null:
		troop_scale_key = _script_to_troop_key(script_res.resource_path)
	var final_troop_scale := _scale_for_troop(troop_scale_key, troop_scale)
	troop._spawn_scale = final_troop_scale
	troop.scale = Vector3(final_troop_scale, final_troop_scale, final_troop_scale)
	var spawn_position: Vector3 = (
		troop_spawn_pos + offset
		if exact_position
		else BaseTroop._clamp_to_island(troop_spawn_pos + offset)
	)
	spawn_position.y = building_y
	troop.global_position = spawn_position
	if offset == Vector3.ZERO:
		troop._sep_counter = 0
		troop._retarget_timer = 0.0
		troop._orbit_angle = 0.0
		troop._last_pos = troop.global_position
	troop.visible = true
	if lvl > 1 and troop.has_method("upgrade_to"):
		troop.upgrade_to(lvl)
	var battle_ref = bs_ref._battle if bs_ref and "_battle" in bs_ref else null
	if battle_ref and "_victory_declared" in battle_ref and battle_ref._victory_declared:
		if troop.has_method("_play_victory"):
			troop._play_victory()
	elif troop.has_method("activate"):
		troop.activate()


static func _scale_for_troop(troop_name: String, base_scale: float) -> float:
	return base_scale * float(TROOP_SCALE_MULTIPLIERS.get(troop_name, 1.0))


## Returns the deterministic troop spawn position derived from a ship's
## landing (stop) position. The troop deploy offset must match between
## client and server so the replay verifier spawns troops at the same
## place as the real game — previously we logged the raw click point
## (`hit.x, hit.z`) which left server troops stranded offshore while
## client troops actually appeared on the beach.
func _base_troop_spawn_pos(stop_pos: Vector3) -> Vector3:
	_refresh_placement_bounds()
	if ship_plane == null:
		return stop_pos
	var lat_dir: Vector3 = _get_lateral_dir()
	var sail_dir: Vector3 = _get_sail_dir()
	var p: Vector3 = stop_pos - sail_dir * (plane_extent_z * 0.5) - lat_dir * 0.2
	p.y = stop_pos.y
	return p


## Deploys the troops loaded on this fleet ship.
## Each troop is spawned by name from TROOP_DEFS, staggered by troop_spawn_delay.
func _deploy_troops_from_ship(ship_pos: Vector3, sail_dir: Vector3, ship_idx: int) -> void:
	if ship_idx >= _fleet.size():
		return
	var ship_data: Dictionary = _fleet[ship_idx]
	var troop_names: Array = ship_data.get("troops", [])
	if troop_names.is_empty():
		return
	var recorded_levels: Dictionary = {}
	var raw_recorded_levels = ship_data.get("troop_levels", ship_data.get("troopLevels", {}))
	if raw_recorded_levels is Dictionary:
		recorded_levels = raw_recorded_levels

	_refresh_placement_bounds()
	var lat_dir: Vector3 = _get_lateral_dir()
	# `sail_dir` param kept for call-site compatibility; the spawn position
	# is now computed by `_base_troop_spawn_pos` so the same formula feeds
	# both the actual troop spawn AND the replay-logged coordinate.
	var spawn_pos: Vector3 = _base_troop_spawn_pos(ship_pos)
	if ship_data.has("_replay_troop_spawn"):
		var replay_spawn = ship_data.get("_replay_troop_spawn")
		if replay_spawn is Vector3:
			spawn_pos = replay_spawn
			spawn_pos.y = ship_pos.y
	var exact_spawn: bool = ship_data.get("_replay_exact_spawn", false) == true
	var exact_spawns: Array = ship_data.get("_replay_troop_spawns", [])
	var precomputed_offsets: Array = ship_data.get("_precomputed_troop_offsets", [])

	# Get building Y and troop levels — reuse BaseTroop's per-frame cache
	# instead of a fresh scene-tree scan on every ship arrival.
	var building_y: float = spawn_pos.y
	var bs_ref: Node = null
	for building_sys in BaseTroop._get_building_systems_cached():
		if "grid_y" in building_sys:
			building_y = building_sys.grid_y
			bs_ref = building_sys
			break

	for i in troop_names.size():
		var troop_name: String = troop_names[i]
		var troop_key: String = _normalize_troop_entry(troop_name)
		var tdef: Dictionary = TROOP_DEFS.get(troop_key, {})
		if tdef.is_empty():
			continue
		# Pull from cache populated in _ready() — zero I/O in combat.
		var cached: Dictionary = _get_or_load_troop_resources(troop_key)
		var model_res: Resource = cached.get("model", null)
		var script_res: Resource = cached.get("script", null)
		if model_res == null or script_res == null:
			continue
		var troop_level: int = 1
		if bs_ref and "troop_levels" in bs_ref and bs_ref.troop_levels.has(troop_key):
			troop_level = bs_ref.troop_levels[troop_key]
		if recorded_levels.has(troop_name):
			troop_level = int(recorded_levels[troop_name])
		elif recorded_levels.has(troop_key):
			troop_level = int(recorded_levels[troop_key])
		elif recorded_levels.has(troop_name.to_lower()):
			troop_level = int(recorded_levels[troop_name.to_lower()])
		troop_level = _troop_entry_level(troop_name, troop_level)
		var lvl: int = troop_level
		var m_res: Resource = model_res
		var s_res: Resource = script_res
		var troop_spawn_pos: Vector3 = spawn_pos
		if i < exact_spawns.size() and exact_spawns[i] is Vector3:
			troop_spawn_pos = exact_spawns[i]
			troop_spawn_pos.y = spawn_pos.y
		var troop_node_name: String = "Troop_%d" % (randi() % 99999)
		if exact_spawn:
			troop_node_name = "ReplayTroop_%d_%d" % [ship_idx, i]
		var spawn_generation: int = _combat_generation
		var offset := Vector3.ZERO
		if not exact_spawn:
			if i < precomputed_offsets.size() and precomputed_offsets[i] is Vector3:
				offset = precomputed_offsets[i]
			else:
				offset = lat_dir * (randf_range(-0.5, 0.5)) * 0.15
		_spawn_troop_after_delay(troop_spawn_delay * i, spawn_generation, m_res, s_res, troop_node_name, ship_idx * 100 + i, lvl, troop_spawn_pos, offset, building_y, bs_ref, troop_name)


func _spawn_troops_at_pos(troop_names: Array, recorded_levels: Dictionary, spawn_pos: Vector3) -> void:
	if troop_names.is_empty():
		return
	_refresh_placement_bounds()
	var lat_dir: Vector3 = _get_lateral_dir()

	var building_y: float = spawn_pos.y
	var bs_ref: Node = null
	for building_sys in BaseTroop._get_building_systems_cached():
		if "grid_y" in building_sys:
			building_y = building_sys.grid_y
			bs_ref = building_sys
			break

	for i in troop_names.size():
		var troop_name: String = troop_names[i]
		var troop_key: String = _normalize_troop_entry(troop_name)
		var tdef: Dictionary = TROOP_DEFS.get(troop_key, {})
		if tdef.is_empty():
			continue
		var cached: Dictionary = _get_or_load_troop_resources(troop_key)
		var model_res: Resource = cached.get("model", null)
		var script_res: Resource = cached.get("script", null)
		if model_res == null or script_res == null:
			continue
		var troop_level: int = 1
		if bs_ref and "troop_levels" in bs_ref and bs_ref.troop_levels.has(troop_key):
			troop_level = bs_ref.troop_levels[troop_key]
		if recorded_levels.has(troop_name):
			troop_level = int(recorded_levels[troop_name])
		elif recorded_levels.has(troop_key):
			troop_level = int(recorded_levels[troop_key])
		elif recorded_levels.has(troop_name.to_lower()):
			troop_level = int(recorded_levels[troop_name.to_lower()])
		troop_level = _troop_entry_level(troop_name, troop_level)
		var lvl: int = troop_level
		var m_res: Resource = model_res
		var s_res: Resource = script_res
		var spawn_generation: int = _combat_generation
		var troop_node_name: String = "Troop_%d" % (randi() % 99999)
		var offset = lat_dir * (randf_range(-0.5, 0.5)) * 0.15
		_spawn_troop_after_delay(troop_spawn_delay * i, spawn_generation, m_res, s_res, troop_node_name, i, lvl, spawn_pos, offset, building_y, bs_ref, troop_name)


## Map script path to troop_levels dictionary key
static func _script_to_troop_key(script_path: String) -> String:
	var file: String = script_path.get_file().get_basename()
	match file:
		"knight":     return "Knight"
		"mage":       return "Mage"
		"barbarian":  return "Barbarian"
		"archer":     return "Archer"
		"pea_shooter": return "PeaShooter"
		"ranger":     return "Ranger"
		"mimic":      return "Mimic"
		"necromancer": return "Necromancer"
		"horror_evolution": return "Horror"
		"mechanical_dragon": return "MechanicalDragon"
		"ice_golem": return "IceGolem"
		"wind_mage": return "WindMage"
		"demon_king": return "DemonKing"
		"fire_dragon": return "FireDragon"
	return file.capitalize()


static func _normalize_troop_entry(troop_name: String) -> String:
	var base: String = str(troop_name).split(":")[0]
	match base.to_lower():
		"knight":
			return "Knight"
		"mage":
			return "Mage"
		"barbarian":
			return "Barbarian"
		"archer":
			return "Archer"
		"peashooter", "pea_shooter", "pea-shooter":
			return "PeaShooter"
		"ranger":
			return "Ranger"
		"mimic":
			return "Mimic"
		"necromancer", "skeletonmage", "skeleton_mage":
			return "Necromancer"
		"horror", "horrorevolution", "horror_evolution":
			return "Horror"
		"mechanicaldragon", "mechanical_dragon", "mechdragon":
			return "MechanicalDragon"
		"icegolem", "ice_golem":
			return "IceGolem"
		"windmage", "wind_mage":
			return "WindMage"
		"demonking", "demon_king":
			return "DemonKing"
		"firedragon", "fire_dragon":
			return "FireDragon"
	return base


static func _troop_entry_level(troop_name: String, fallback_level: int = 1) -> int:
	var base: String = _normalize_troop_entry(troop_name)
	if _is_nft_backed_troop_key(base):
		return fallback_level
	var parts: PackedStringArray = str(troop_name).split(":")
	for part in parts:
		var text: String = String(part).strip_edges()
		if text.length() >= 2 and text.substr(0, 1).to_lower() == "l":
			var parsed: int = int(text.substr(1))
			if parsed >= 1 and parsed <= 7:
				return parsed
	return fallback_level


static func _is_nft_backed_troop_key(troop_key: String) -> bool:
	return troop_key == "DemonKing" or troop_key == "FireDragon"


static func _troop_entry_rarity(troop_name: String) -> String:
	var parts: PackedStringArray = str(troop_name).split(":")
	for part in parts:
		var text: String = String(part).strip_edges()
		if text.length() >= 2 and text.substr(0, 1).to_lower() == "r":
			var rarity: String = text.substr(1).to_lower()
			if rarity in ["common", "epic", "legendary", "unrevealed"]:
				return rarity
	return "common"
