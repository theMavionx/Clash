extends Node3D
## Attack system: press Attack → click on shipPlane → ship sails to that point.
## Implements: design/gdd/attack_system.md

@export var grid_plane_path: NodePath = "../Island/shipPlane"
@export var ship_scale: float = 0.15
@export var sail_duration: float = 3.0
@export var spawn_distance: float = 4.0
@export var water_node_path: NodePath = "../Water"
@export var max_ships: int = 5
@export var troops_per_ship: int = 3
@export var troop_spawn_delay: float = 0.2
@export var troop_scale: float = 0.1

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
const SHIP_MIN_SEPARATION: float = 0.252
## Radius within which ships push each other apart while sailing
const SHIP_PUSH_RADIUS: float = 0.4

# ---------------------------------------------------------------------------
# Preloaded resources — loaded once at startup, never at runtime
# ---------------------------------------------------------------------------
var _ship_scene_res   = load("res://Model/Ship/Sail Ship.glb")
var _flag_scene_res   = load("res://Model/flag/pirate_flag_animated.glb")

## Preloaded troop model PackedScenes, indexed to match SHIP_TROOPS
var _troop_model_res: Array = [
	load("res://Model/Characters/Model/Knight.glb"),
	load("res://Model/Characters/Model/Mage.glb"),
	load("res://Model/Characters/Model/Barbarian.glb"),
	load("res://Model/Characters/Model/Ranger.glb"),
	load("res://Model/Characters/Model/Rogue_Hooded.glb"),
]

## Preloaded troop GDScripts, indexed to match SHIP_TROOPS
var _troop_script_res: Array = [
	load("res://scripts/knight.gd"),
	load("res://scripts/mage.gd"),
	load("res://scripts/barbarian.gd"),
	load("res://scripts/archer.gd"),
	load("res://scripts/ranger.gd"),
]

const SHIP_TROOPS = [
	{"model": "res://Model/Characters/Model/Knight.glb",      "script": "res://scripts/knight.gd"},
	{"model": "res://Model/Characters/Model/Mage.glb",        "script": "res://scripts/mage.gd"},
	{"model": "res://Model/Characters/Model/Barbarian.glb",   "script": "res://scripts/barbarian.gd"},
	{"model": "res://Model/Characters/Model/Ranger.glb",      "script": "res://scripts/archer.gd"},
	{"model": "res://Model/Characters/Model/Rogue_Hooded.glb","script": "res://scripts/ranger.gd"},
]

# ---------------------------------------------------------------------------
# Per-frame ships group cache — matches BaseTroop caching pattern
# ---------------------------------------------------------------------------
static var _cached_ships: Array = []
static var _ships_cache_frame: int = -1

## Returns the "ships" group, refreshed at most once per process frame.
static func _get_ships_cached() -> Array:
	var frame = Engine.get_process_frames()
	if frame != _ships_cache_frame:
		var tree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_ships = tree.get_nodes_in_group("ships")
		_ships_cache_frame = frame
	return _cached_ships

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------
var is_attack_mode: bool = false
var _ships_placed: int = 0
var _total_ships_launched: int = 0  # never reset mid-attack; used by React HUD
var _next_troop_idx: int = 0
var _ship_troop_map: Dictionary = {}   # ship_idx → troop_idx chosen at placement
var _deployed_types: Dictionary = {}   # script basename → true; which troop types were sent
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


func _ready() -> void:
	ship_plane = get_node_or_null(grid_plane_path)
	if ship_plane == null:
		push_warning("AttackSystem: shipPlane not found")
		return
	ship_plane.visible = false
	plane_center = ship_plane.global_position
	plane_y = plane_center.y
	# Full basis length for ship positioning math
	plane_extent_x = ship_plane.global_transform.basis.x.length()
	plane_extent_z = ship_plane.global_transform.basis.z.length()
	# Half extent = actual visual bounds of the BoxMesh (default 1x1x1, verts from -0.5 to 0.5)
	_click_extent_x = plane_extent_x * 0.5
	_click_extent_z = plane_extent_z * 0.5
	var water = get_node_or_null(water_node_path)
	if water:
		water_y = water.global_position.y
	print("AttackSystem ready. center: ", plane_center, " extent_x: ", plane_extent_x, " extent_z: ", plane_extent_z)


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	_separate_ships(delta)


## Push overlapping ships apart so they never clip through each other.
func _separate_ships(delta: float) -> void:
	var ships = _get_ships_cached()
	if ships.is_empty():
		return
	for i in ships.size():
		var a = ships[i]
		if not is_instance_valid(a):
			continue
		for j in range(i + 1, ships.size()):
			var b = ships[j]
			if not is_instance_valid(b):
				continue
			var diff = a.global_position - b.global_position
			diff.y = 0
			var dist = diff.length()
			if dist < SHIP_PUSH_RADIUS and dist > 0.001:
				var push = diff.normalized() * (SHIP_PUSH_RADIUS - dist) * delta * 4.0
				a.global_position += push
				b.global_position -= push


## Activates attack mode, showing the placement plane and resetting ship counters.
## Call this when the player presses the Attack button.
func enter_attack_mode() -> void:
	is_attack_mode = true
	_ships_placed = 0
	_total_ships_launched = 0
	_next_troop_idx = 0
	_ship_troop_map.clear()
	_deployed_types.clear()
	_ship_stop_positions.clear()
	_ship_markers.clear()
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("troop_idx_changed", {"idx": 0})
	if ship_plane:
		ship_plane.visible = true
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(0.8, 0.1, 0.1, 0.35)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ship_plane.material_override = mat
	print("Attack mode ON - place up to %d ships!" % max_ships)


## Temporarily hides the placement plane without resetting any state.
## Used when cannon mode activates mid-placement to prevent RMB conflicts.
func _pause_attack_mode() -> void:
	is_attack_mode = false
	if ship_plane:
		ship_plane.visible = false


## Restores the placement plane after cannon mode ends, if ships still remain.
func _resume_attack_mode() -> void:
	if _ships_placed >= max_ships:
		return
	is_attack_mode = true
	if ship_plane:
		ship_plane.visible = true
		var mat = StandardMaterial3D.new()
		mat.albedo_color = Color(0.8, 0.1, 0.1, 0.35)
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ship_plane.material_override = mat


## Called when all ships are placed — hides plane but keeps markers alive.
func _finish_attack_mode() -> void:
	is_attack_mode = false
	_ships_placed = 0
	_ship_stop_positions.clear()
	if ship_plane:
		ship_plane.visible = false
		ship_plane.material_override = null


## Deactivates attack mode, hides the placement plane, and frees any
## pending flag markers that were not yet cleaned up by arriving ships.
func exit_attack_mode() -> void:
	is_attack_mode = false
	_ships_placed = 0
	_total_ships_launched = 0
	_next_troop_idx = 0
	_deployed_types.clear()
	# _ship_troop_map is intentionally NOT cleared here — ships still sailing
	# need it in _deploy_troops_from_ship. Cleared only in enter_attack_mode.
	# Free markers for ships that were cancelled before arriving
	for marker in _ship_markers:
		if is_instance_valid(marker):
			marker.queue_free()
	_ship_markers.clear()
	_ship_stop_positions.clear()
	if ship_plane:
		ship_plane.visible = false
		ship_plane.material_override = null


func _input(event: InputEvent) -> void:
	if not is_attack_mode:
		return

	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			var hit = _get_mouse_hit()
			if hit != Vector3.INF:
				if _try_place_ship(hit):
					get_viewport().set_input_as_handled()
					if _ships_placed >= max_ships:
						_finish_attack_mode()
				else:
					get_viewport().set_input_as_handled()
		elif event.button_index == MOUSE_BUTTON_RIGHT:
			exit_attack_mode()
			get_viewport().set_input_as_handled()


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


## Returns a stop position offset laterally so it doesn't overlap existing ships.
## Returns Vector3.INF if no valid position found within shipPlane bounds.
func _get_adjusted_stop_pos(desired: Vector3, lateral_dir: Vector3) -> Vector3:
	var pos = desired
	for attempt in range(10):
		var overlap = false
		for existing in _ship_stop_positions:
			if pos.distance_to(existing) < SHIP_MIN_SEPARATION:
				overlap = true
				break
		if not overlap:
			if _is_within_ship_plane(pos):
				return pos
			return Vector3.INF
		# Alternate left / right, increasing distance each round
		var side = 1 if (attempt % 2 == 0) else -1
		var dist = ceil((attempt + 1) / 2.0) * SHIP_MIN_SEPARATION
		pos = desired + lateral_dir * dist * side
	return Vector3.INF


## Checks if a world position is within the shipPlane bounds.
func _is_within_ship_plane(pos: Vector3) -> bool:
	var offset = pos - plane_center
	var pb = ship_plane.global_transform.basis
	var local_x = offset.dot(pb.x.normalized())
	var local_z = offset.dot(pb.z.normalized())
	return abs(local_x) <= _click_extent_x and abs(local_z) <= _click_extent_z


## Attempts to place a ship at the clicked position. Returns true if successful.
func _try_place_ship(hit: Vector3) -> bool:
	# Check the hit is on shipPlane
	if not _is_within_ship_plane(hit):
		return false
	# Check too close to existing ship
	for existing in _ship_stop_positions:
		if hit.distance_to(existing) < SHIP_MIN_SEPARATION:
			return false
	_ship_troop_map[_ships_placed] = _next_troop_idx
	if not _spawn_single_ship(hit):
		_ship_troop_map.erase(_ships_placed)
		return false
	# Record which troop type was deployed (by script basename, matches React key)
	var script_path: String = SHIP_TROOPS[_next_troop_idx].script
	_deployed_types[script_path.get_file().get_basename()] = true
	_ships_placed += 1
	_total_ships_launched += 1
	# Auto-advance to next undeployed troop type
	for offset in range(1, SHIP_TROOPS.size() + 1):
		var candidate = (_next_troop_idx + offset) % SHIP_TROOPS.size()
		var candidate_key = SHIP_TROOPS[candidate].script.get_file().get_basename()
		if not _deployed_types.has(candidate_key):
			_next_troop_idx = candidate
			break
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("troop_idx_changed", {"idx": _next_troop_idx})
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

	return flag


func _find_child_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_child_anim_player(child)
		if result:
			return result
	return null


## Spawns a single ship at the edge of the placement zone and sails it to [target].
## Attaches rocking/bobbing tweens, places a flag marker, and schedules troop
## deployment when the ship arrives.
func _spawn_single_ship(target: Vector3) -> bool:
	if _ship_scene_res == null:
		push_warning("AttackSystem: ship scene resource is null")
		return false

	var ship = _ship_scene_res.instantiate()
	ship.scale = Vector3(ship_scale, ship_scale, ship_scale)

	# Sailing direction — perpendicular to shipPlane, pointing outward
	var sail_dir = ship_plane.global_transform.basis.z.normalized()
	sail_dir.y = 0
	sail_dir = sail_dir.normalized()
	var to_plane = (plane_center - ship_plane.get_parent().global_position).normalized()
	if sail_dir.dot(to_plane) < 0:
		sail_dir = -sail_dir

	# Ship stops at inner edge of ShipPlane matching player's lateral click
	var pb = ship_plane.global_transform.basis
	var lateral_dir = pb.x.normalized()
	var offset = target - plane_center
	var lateral = offset.dot(lateral_dir)
	lateral = clampf(lateral, -_click_extent_x, _click_extent_x)
	var stop_pos = plane_center + lateral_dir * lateral + sail_dir * (plane_extent_z - 0.5)
	stop_pos.y = water_y

	# Offset laterally so this ship doesn't land on top of an existing one
	stop_pos = _get_adjusted_stop_pos(stop_pos, lateral_dir)
	if stop_pos == Vector3.INF:
		return false
	_ship_stop_positions.append(stop_pos)

	var spawn_pos = stop_pos + sail_dir * spawn_distance
	spawn_pos.y = water_y

	# Flag marker at the landing spot
	var marker = _create_x_marker(stop_pos)
	_ship_markers.append(marker)

	# Wrap ship in a pivot so we can rock independently of movement
	var pivot = Node3D.new()
	pivot.add_to_group("ships")
	get_tree().current_scene.add_child(pivot)
	pivot.global_position = spawn_pos
	ship.position = Vector3.ZERO
	pivot.add_child(ship)
	pivot.look_at(stop_pos, Vector3.UP)
	pivot.rotate_y(PI)

	# Main movement
	var tween = create_tween()
	tween.tween_property(pivot, "global_position", stop_pos, sail_duration).set_trans(Tween.TRANS_LINEAR)

	# When ship arrives → remove flag marker, free stop slot, deploy troops
	var arrived_pos = stop_pos
	var s_dir = sail_dir
	var ship_idx = _ships_placed
	tween.finished.connect(func():
		ship.rotation = Vector3.ZERO
		if is_instance_valid(marker):
			marker.queue_free()
		_ship_markers.erase(marker)
		_deploy_troops_from_ship(arrived_pos, s_dir, ship_idx)
	)
	print("Ship %d/%d sailing to: %s" % [_ships_placed + 1, max_ships, stop_pos])
	return true


## Deploys [troops_per_ship] troops from a ship that has arrived at [ship_pos].
## Troops are staggered by [troop_spawn_delay] seconds and placed on the island
## at building height so they immediately engage targets.
func _deploy_troops_from_ship(ship_pos: Vector3, sail_dir: Vector3, ship_idx: int) -> void:
	var troop_idx = _ship_troop_map.get(ship_idx, ship_idx % SHIP_TROOPS.size())
	var troop_def = SHIP_TROOPS[troop_idx]
	var model_res  = _troop_model_res[troop_idx]
	var script_res = _troop_script_res[troop_idx]
	if model_res == null or script_res == null:
		push_warning("AttackSystem: could not load troop: %s" % troop_def.model)
		return

	# Spawn position: right at inner edge of ShipPlane
	var pb2 = ship_plane.global_transform.basis
	var lat_dir = pb2.x.normalized()
	var spawn_pos = ship_pos - sail_dir * (plane_extent_z * 0.5) - lat_dir * 0.2
	spawn_pos.y = ship_pos.y

	# Get building Y and troop level in one pass over building_systems
	var building_y = spawn_pos.y
	var troop_level = 1
	var level_key = _script_to_troop_key(troop_def.script)
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if "grid_y" in bs:
			building_y = bs.grid_y
		if "troop_levels" in bs and bs.troop_levels.has(level_key):
			troop_level = bs.troop_levels[level_key]
		break

	for i in troops_per_ship:
		var timer = get_tree().create_timer(troop_spawn_delay * i)
		var lvl = troop_level  # capture for closure
		timer.timeout.connect(func():
			var troop = model_res.instantiate()
			troop.set_script(script_res)
			troop.name = "Troop_%d" % (randi() % 99999)
			var s = troop_scale
			troop.scale = Vector3(s, s, s)

			get_tree().current_scene.add_child(troop)

			var offset = lat_dir * (randf_range(-0.5, 0.5)) * 0.15
			troop.global_position = BaseTroop._clamp_to_island(spawn_pos + offset)
			troop.global_position.y = building_y

			troop.visible = true
			# Apply troop level before activating
			if lvl > 1 and troop.has_method("upgrade_to"):
				troop.upgrade_to(lvl)
			if troop.has_method("activate"):
				troop.activate()
		)


## Map script path to troop_levels dictionary key
static func _script_to_troop_key(script_path: String) -> String:
	var file = script_path.get_file().get_basename()
	match file:
		"knight":    return "Knight"
		"mage":      return "Mage"
		"barbarian": return "Barbarian"
		"archer":    return "Archer"
		"ranger":    return "Ranger"
	return file.capitalize()
