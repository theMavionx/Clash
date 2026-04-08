class_name BaseTroop
extends Node3D
## Base class for all troops with combat AI.
## Subclasses override _init_stats() and _setup_weapons().

@export var move_speed: float = 0.5
@export var attack_range: float = 0.15
@export var separation_radius: float = 0.18
@export var separation_force: float = 0.5

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

## Cached troop list — shared across all BaseTroop instances via static
static var _cached_troops: Array = []
static var _troops_cache_frame: int = -1

## Cached camera ref — refreshed once per frame globally
static var _cached_camera: Camera3D = null
static var _camera_cache_frame: int = -1

## Throttle separation — not every troop needs it every frame
var _sep_counter: int = 0
var _last_separation: Vector3 = Vector3.ZERO
var _hp_bar_frame: int = 0  # throttle HP bar billboard rotation
var _last_hp_ratio: float = -1.0  # cache to skip redundant shader updates
var _last_hp_band: int = -1  # cache to skip redundant color updates

## Target re-evaluation — staggered across troops
var _retarget_counter: int = 0
## Guard threat radius multiplier — guards within this * attack_range trigger immediate switch
const GUARD_THREAT_MULT: float = 1.5

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

## Cached island bounds — center, extents, rotation (from main BuildingSystem)
static var _island_center: Vector3 = Vector3.ZERO
static var _island_extent_x: float = 10.0
static var _island_extent_z: float = 10.0
static var _island_rot: float = 0.0
static var _island_bounds_ready: bool = false

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
	var frame: int = Engine.get_process_frames()
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
		_building_entry_pool_idx = 0
		_buildings_cache_frame = frame
	return _cached_building_list


static var _cached_guards_list: Array = []
static var _guards_list_cache_frame: int = -1

static func _get_guards_list_cached() -> Array:
	var frame: int = Engine.get_process_frames()
	if frame != _guards_list_cache_frame:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_guards_list = tree.get_nodes_in_group("skeleton_guards")
		_guards_list_cache_frame = frame
	return _cached_guards_list


static func _get_troops_cached() -> Array:
	var frame: int = Engine.get_process_frames()
	if frame != _troops_cache_frame:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_troops = tree.get_nodes_in_group("troops")
		_troops_cache_frame = frame
	return _cached_troops


static func _get_camera_cached() -> Camera3D:
	var frame: int = Engine.get_process_frames()
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
	_setup_animations()
	_setup_weapons()
	# Stagger checks across troops to spread per-frame load
	_sep_counter = randi() % 3
	_retarget_counter = randi() % 10


## Override to set hp, damage, atk_speed, move_speed, attack_range, attack_anim, anim_files
func _init_stats() -> void:
	pass


## Applies level `lvl` to this troop by re-running `_init_stats()`.
## Call after spawning when the player's stored troop level is known.
func upgrade_to(lvl: int) -> void:
	level = lvl
	_init_stats()


## Override to attach weapons via _attach_to_bone()
func _setup_weapons() -> void:
	pass


## Transitions the troop from INACTIVE to IDLE, makes it visible, registers it
## in the "troops" group, creates its HP bar, and immediately searches for a target.
## Call this after placing the troop in the scene via the attack system.
func activate() -> void:
	if state != State.INACTIVE:
		return
	visible = true
	state = State.IDLE
	add_to_group("troops")
	_create_hp_bar()
	_find_next_target()


var _spawn_scale: float = 0.1

func _process(delta: float) -> void:
	if state == State.INACTIVE or state == State.VICTORY:
		return
	delta = minf(delta, 0.1)  # cap delta to prevent huge catch-up after tab switch
	# Force scale every frame — GLB animations override it otherwise
	scale = Vector3(_spawn_scale, _spawn_scale, _spawn_scale)
	_update_hp_bar()
	# Periodic retargeting — pick closest target every 10 frames (staggered)
	_retarget_counter += 1
	if _retarget_counter % 10 == 0:
		_find_next_target()
	# Immediate guard threat check — switch if a guard is very close
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
			var res: Resource = load(file_path)
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

## Animation file paths for the medium rig — shared by Knight, Mage, Barbarian.
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
const HP_BAR_SHADER_CODE: String = "shader_type spatial;
render_mode unshaded, blend_mix, depth_test_disabled, cull_disabled;
uniform vec4 albedo : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec2 bar_size = vec2(0.12, 0.012);
void fragment() {
	vec2 pos = (UV - 0.5) * bar_size;
	float r = bar_size.y * 0.45;
	vec2 q = abs(pos) - bar_size * 0.5 + r;
	float d = length(max(q, 0.0)) - r;
	float aa = fwidth(d);
	ALBEDO = albedo.rgb;
	ALPHA = albedo.a * (1.0 - smoothstep(-aa, aa, d));
}"

## Shared shader — compiled once on GPU, reused by all HP bars
static var _hp_shader: Shader = null

static func _get_hp_shader() -> Shader:
	if _hp_shader == null:
		_hp_shader = Shader.new()
		_hp_shader.code = HP_BAR_SHADER_CODE
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


func _find_alternative_target() -> void:
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
		target_building = second_b
		target_bs = second_bs
		target_guard = null
		_orbit_angle = 0.0
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")


## Scans all live buildings and skeleton guards and picks the closest one.
## Always re-evaluates — no loyalty to old target. If the closest target
## is the same as the current one, keeps it without resetting state.
func _find_next_target() -> void:
	var nearest_dist_sq: float = INF
	var nearest_b: Dictionary = {}
	var nearest_bs_ref = null
	var nearest_guard: Node3D = null
	var my_pos = global_position

	for entry in _get_buildings_cached():
		var b = entry.b
		if b.get("hp", 0) <= 0 or not is_instance_valid(b.get("node")):
			continue
		var dx = my_pos.x - entry.pos.x
		var dz = my_pos.z - entry.pos.z
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
		var dx = my_pos.x - guard.global_position.x
		var dz = my_pos.z - guard.global_position.z
		var d_sq = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			nearest_b = {}
			nearest_bs_ref = null
			nearest_guard = guard

	if nearest_guard:
		# Only reset state if target actually changed
		if nearest_guard != target_guard:
			target_guard = nearest_guard
			target_building = {}
			target_bs = null
			_orbit_angle = 0.0
			if state != State.RUNNING:
				state = State.RUNNING
				if anim_player.has_animation("Running_A"):
					anim_player.play("Running_A")
	elif nearest_b.size() > 0:
		if nearest_b.get("node") != target_building.get("node"):
			target_building = nearest_b
			target_bs = nearest_bs_ref
			target_guard = null
			_orbit_angle = 0.0
			if state != State.RUNNING:
				state = State.RUNNING
				if anim_player.has_animation("Running_A"):
					anim_player.play("Running_A")
	else:
		target_building = {}
		target_bs = null
		target_guard = null
		_trigger_victory_all()


## Immediate guard threat — if any guard is within GUARD_THREAT_MULT * attack_range,
## switch to it right now (don't wait for retarget tick).
func _check_guard_threat() -> void:
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
		target_guard = closest_guard
		target_building = {}
		target_bs = null
		_orbit_angle = 0.0
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
func take_damage(dmg: int) -> void:
	hp -= dmg
	if hp <= 0:
		if is_in_group("troops"):
			remove_from_group("troops")
		# Notify server immediately that this troop died
		_report_death()
		queue_free()


## Reports this troop's death to the server via Bridge so casualties persist
## even if the player quits mid-battle.
func _report_death() -> void:
	var troop_name: String = _get_troop_name()
	if troop_name == "":
		return
	var bridge: Node = get_node_or_null("/root/Bridge")
	if bridge and bridge.has_method("send_to_react"):
		bridge.send_to_react("troop_died", {"troop_name": troop_name})
	# Also notify server directly
	for bs_node in get_tree().get_nodes_in_group("building_systems"):
		if bs_node.has_method("_on_troop_died"):
			bs_node._on_troop_died(troop_name)
			break


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
	return ""


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


func _deal_target_damage() -> void:
	if target_guard != null and is_instance_valid(target_guard):
		target_guard.take_damage(damage)
		if not is_instance_valid(target_guard) or not target_guard.is_inside_tree():
			target_guard = null
			_find_next_target()
	elif target_building.size() > 0:
		target_building["hp"] = target_building.get("hp", 0) - damage
		if target_building.get("hp", 0) <= 0:
			_destroy_target()
			_find_next_target()


## Calculates the world-space orbit slot position this troop should move toward.
## Every 6th frame it re-evaluates SLOT_OFFSETS to find the angle with maximum
## angular separation from all other troops attacking the same building, writing
## the result to `_orbit_angle`. Returns the slot position as a Vector3.
func _compute_attack_slot(target_pos: Vector3, my_angle: float) -> Vector3:
	_sep_counter += 1
	if _sep_counter % 6 == 0:
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
				# Only check troops targeting same building
				if other.target_building.get("node") != target_building.get("node"):
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

	# Troop-to-troop separation
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

	# Building avoidance — push out of non-target buildings using footprint radius
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
				_find_alternative_target()
				_orbit_angle = 0.0
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
	var slot_pos = _compute_attack_slot(target_pos, my_angle)
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
		state = State.ATTACKING
		attack_timer = 0.0
		# Snap rotation to face target
		look_at(global_position + dir_to_target, Vector3.UP)
		rotate_y(PI)
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.play(attack_anim)
		return

	# Stuck detection
	_check_stuck(delta, my_angle)


func _get_separation() -> Vector3:
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
		_deal_target_damage()


func _destroy_target() -> void:
	if target_bs and target_bs.has_method("remove_building"):
		target_bs.remove_building(target_building)
	target_building = {}
	target_bs = null
	target_guard = null


# ── Fire Bomb Explosion ──────────────────────────────────────
const FIRE_BOMB_FRAME_COUNT: int = 12  # frames 4..15
const FIRE_BOMB_DIR: String = "res://Model/FireBomb/Fire-bomb%d.png"
const FIRE_BOMB_SCALE: float = 1.2
const FIRE_BOMB_DURATION: float = 0.8

static var _fire_bomb_textures: Array = []

static func _preload_fire_bomb() -> void:
	if not _fire_bomb_textures.is_empty():
		return
	for i in range(4, 16):
		var tex = load(FIRE_BOMB_DIR % i)
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
	# Animate frames then free
	var frame_count: int = _fire_bomb_textures.size()
	var frame_dur: float = FIRE_BOMB_DURATION / float(frame_count)
	var tw: Tween = explosion.create_tween()
	for i in range(frame_count):
		var idx: int = i
		tw.tween_callback(func():
			if is_instance_valid(explosion):
				(explosion.material_override as StandardMaterial3D).albedo_texture = _fire_bomb_textures[idx]
		).set_delay(frame_dur if i > 0 else 0.0)
	# Fade out in last 30%
	var fade_start: float = FIRE_BOMB_DURATION * 0.7
	tw.parallel().tween_property(mat, "albedo_color:a", 0.0, FIRE_BOMB_DURATION * 0.3).set_delay(fade_start)
	tw.chain().tween_callback(explosion.queue_free)


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
	var scene_res = load(scene_path)
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


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_anim_player(child)
		if result:
			return result
	return null
