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
var target_bs = null
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

## Stuck detection — if troop barely moves for too long, orbit around target
var _stuck_timer: float = 0.0
var _last_pos: Vector3 = Vector3.ZERO
var _orbit_angle: float = 0.0  # radians offset to orbit around blocked target

## Shared animation libraries — one per anim_files key, reused by all troops of same type
static var _anim_lib_cache: Dictionary = {}  # key(String) -> AnimationLibrary

## Cached building data — refreshed once per frame, used by _find_next_target and avoidance
static var _cached_building_list: Array = []  # [{dict, bs, pos}]
static var _buildings_cache_frame: int = -1

## Cached island bounds — center, extents, rotation (from main BuildingSystem)
static var _island_center: Vector3 = Vector3.ZERO
static var _island_extent_x: float = 10.0
static var _island_extent_z: float = 10.0
static var _island_rot: float = 0.0
static var _island_bounds_ready: bool = false

static func _ensure_island_bounds() -> void:
	if _island_bounds_ready:
		return
	var tree = Engine.get_main_loop() as SceneTree
	if not tree:
		return
	# Use main grid (largest) with slight padding for walking around edges
	var best_area: float = 0.0
	for bs in tree.get_nodes_in_group("building_systems"):
		var area = bs.grid_extent_x * bs.grid_extent_z
		if area > best_area:
			best_area = area
			_island_center = bs.grid_center
			_island_extent_x = bs.grid_extent_x * 1.05
			_island_extent_z = bs.grid_extent_z * 1.05
			_island_rot = bs.grid_rotation
	if best_area > 0.01:
		_island_bounds_ready = true


static func _clamp_to_island(pos: Vector3) -> Vector3:
	if not _island_bounds_ready:
		_ensure_island_bounds()
	# Transform to local island space (rotated grid)
	var dx = pos.x - _island_center.x
	var dz = pos.z - _island_center.z
	var cos_r = cos(-_island_rot)
	var sin_r = sin(-_island_rot)
	var local_x = dx * cos_r - dz * sin_r
	var local_z = dx * sin_r + dz * cos_r
	# Clamp to island extents
	local_x = clampf(local_x, -_island_extent_x * 0.5, _island_extent_x * 0.5)
	local_z = clampf(local_z, -_island_extent_z * 0.5, _island_extent_z * 0.5)
	# Transform back to world space
	var cos_r2 = cos(_island_rot)
	var sin_r2 = sin(_island_rot)
	pos.x = _island_center.x + local_x * cos_r2 - local_z * sin_r2
	pos.z = _island_center.z + local_x * sin_r2 + local_z * cos_r2
	return pos


static func _get_buildings_cached() -> Array:
	var frame = Engine.get_process_frames()
	if frame != _buildings_cache_frame:
		_cached_building_list.clear()
		var tree = Engine.get_main_loop() as SceneTree
		if tree:
			for bs in tree.get_nodes_in_group("building_systems"):
				for b in bs.placed_buildings:
					if b.get("hp", 0) > 0 and is_instance_valid(b.get("node")):
						_cached_building_list.append({"b": b, "bs": bs, "pos": b.node.global_position})
		_buildings_cache_frame = frame
	return _cached_building_list


static var _cached_guards_list: Array = []
static var _guards_list_cache_frame: int = -1

static func _get_guards_list_cached() -> Array:
	var frame = Engine.get_process_frames()
	if frame != _guards_list_cache_frame:
		var tree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_guards_list = tree.get_nodes_in_group("skeleton_guards")
		_guards_list_cache_frame = frame
	return _cached_guards_list


static func _get_troops_cached() -> Array:
	var frame = Engine.get_process_frames()
	if frame != _troops_cache_frame:
		var tree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_troops = tree.get_nodes_in_group("troops")
		_troops_cache_frame = frame
	return _cached_troops


static func _get_camera_cached() -> Camera3D:
	var frame = Engine.get_process_frames()
	if frame != _camera_cache_frame:
		var tree = Engine.get_main_loop() as SceneTree
		if tree and tree.root:
			var vp = tree.root.get_viewport()
			if vp:
				_cached_camera = vp.get_camera_3d()
		_camera_cache_frame = frame
	return _cached_camera


func _ready() -> void:
	_init_stats()
	max_hp = hp
	_setup_animations()
	_setup_weapons()
	# Stagger separation checks across troops to spread load
	_sep_counter = randi() % 3


## Override to set hp, damage, atk_speed, move_speed, attack_range, attack_anim, anim_files
func _init_stats() -> void:
	pass


func upgrade_to(lvl: int) -> void:
	level = lvl
	_init_stats()


## Override to attach weapons via _attach_to_bone()
func _setup_weapons() -> void:
	pass


func activate() -> void:
	if state != State.INACTIVE:
		return
	visible = true
	state = State.IDLE
	add_to_group("troops")
	_create_hp_bar()
	_find_next_target()


func _process(delta: float) -> void:
	if state == State.INACTIVE or state == State.VICTORY:
		return
	delta = minf(delta, 0.1)  # cap delta to prevent huge catch-up after tab switch
	_update_hp_bar()
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
	var cache_key = ",".join(anim_files)
	var lib: AnimationLibrary
	if _anim_lib_cache.has(cache_key):
		lib = _anim_lib_cache[cache_key]
	else:
		lib = AnimationLibrary.new()
		for file_path in anim_files:
			var res = load(file_path)
			if res == null:
				continue
			var instance = Node3D.new()
			add_child(instance)
			var real_inst = res.instantiate()
			instance.add_child(real_inst)
			_hide_meshes(instance)
			var src = _find_anim_player(real_inst)
			if src:
				for anim_name in src.get_animation_list():
					if anim_name == "RESET" or anim_name == "T-Pose":
						continue
					var anim = src.get_animation(anim_name)
					if anim and not lib.has_animation(anim_name):
						var dup = anim.duplicate()
						if anim_name.begins_with("Running") or anim_name.begins_with("Walking") or anim_name.begins_with("Idle") or anim_name == "Cheering":
							dup.loop_mode = Animation.LOOP_LINEAR
						lib.add_animation(anim_name, dup)
			instance.free()
		_anim_lib_cache[cache_key] = lib

	anim_player.add_animation_library("", lib)

	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


const HP_BAR_W = 0.12
const HP_BAR_H = 0.012
const HP_BAR_SHADER_CODE = "shader_type spatial;
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
	var mat = ShaderMaterial.new()
	mat.shader = _get_hp_shader()
	mat.set_shader_parameter("albedo", color)
	mat.set_shader_parameter("bar_size", size)
	mat.render_priority = priority
	return mat

func _create_hp_bar() -> void:
	_hp_bar = Node3D.new()
	_hp_bar.top_level = true
	add_child(_hp_bar)
	var bg = MeshInstance3D.new()
	var bg_mesh = QuadMesh.new()
	bg_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	bg.mesh = bg_mesh
	bg.material_override = _make_hp_shader_mat(Color(0.15, 0.15, 0.15, 0.75), Vector2(HP_BAR_W, HP_BAR_H), 10)
	_hp_bar.add_child(bg)
	_hp_fill = MeshInstance3D.new()
	var fill_mesh = QuadMesh.new()
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
	var ratio = float(hp) / float(max_hp)
	var fill_w = HP_BAR_W * ratio
	(_hp_fill.mesh as QuadMesh).size.x = fill_w
	_hp_fill.position.x = -(HP_BAR_W - fill_w) * 0.5
	var mat = _hp_fill.material_override as ShaderMaterial
	mat.set_shader_parameter("bar_size", Vector2(fill_w, HP_BAR_H))
	var color: Color
	if ratio > 0.5:
		color = Color(0.1, 0.85, 0.1, 0.9)
	elif ratio > 0.25:
		color = Color(0.9, 0.8, 0.1, 0.9)
	else:
		color = Color(0.9, 0.1, 0.1, 0.9)
	mat.set_shader_parameter("albedo", color)


func _find_alternative_target() -> void:
	# Find a different building than the current one
	var second_dist_sq: float = INF
	var second_b: Dictionary = {}
	var second_bs = null
	var my_pos = global_position
	var current_node = target_building.get("node")

	for entry in _get_buildings_cached():
		var b = entry.b
		if b.get("hp", 0) <= 0 or not is_instance_valid(b.get("node")):
			continue
		if is_instance_valid(current_node) and b.node == current_node:
			continue  # skip current target
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
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")


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
		target_guard = nearest_guard
		target_building = {}
		target_bs = null
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
	elif nearest_b.size() > 0:
		target_building = nearest_b
		target_bs = nearest_bs_ref
		target_guard = null
		state = State.RUNNING
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
	else:
		target_building = {}
		target_bs = null
		target_guard = null
		_trigger_victory_all()


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


func take_damage(dmg: int) -> void:
	hp -= dmg
	if hp <= 0:
		if is_in_group("troops"):
			remove_from_group("troops")
		queue_free()


func _has_valid_target() -> bool:
	if target_guard != null and is_instance_valid(target_guard) and target_guard.is_inside_tree():
		return true
	return target_building.size() > 0 and is_instance_valid(target_building.get("node"))


func _get_target_position() -> Vector3:
	if target_guard != null and is_instance_valid(target_guard):
		return target_guard.global_position
	if target_building.size() > 0 and is_instance_valid(target_building.get("node")):
		return target_building.node.global_position
	return global_position


func _deal_target_damage() -> void:
	if target_guard != null and is_instance_valid(target_guard):
		target_guard.take_damage(damage)
		if not is_instance_valid(target_guard) or not target_guard.is_inside_tree():
			target_guard = null
			_find_next_target()
	elif target_building.size() > 0:
		target_building["hp"] = target_building.hp - damage
		if target_building.hp <= 0:
			_destroy_target()
			_find_next_target()


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

	# ── Find attack slot around building (like CoC) ──
	# Each troop picks a point on a circle around the building at attack_range distance
	# Slot is based on angle from building to troop — keeps current angle, avoids taken slots
	var my_angle = atan2(global_position.x - target_pos.x, global_position.z - target_pos.z)
	# Adjust angle to avoid other troops attacking same building
	_sep_counter += 1
	if _sep_counter % 6 == 0:
		var best_angle = my_angle
		var best_min_dist = 0.0
		for test_offset in [-0.0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2]:
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

	# Move toward slot position on circle around building
	var slot_pos = target_pos + Vector3(sin(_orbit_angle), 0, cos(_orbit_angle)) * attack_range * 0.95
	var to_slot = slot_pos - global_position
	to_slot.y = 0
	var slot_dist = to_slot.length()
	var dir: Vector3
	if slot_dist > 0.01:
		dir = to_slot / slot_dist
	else:
		dir = dir_to_target

	look_at(global_position + dir_to_target, Vector3.UP)
	rotate_y(PI)

	var move_vec = dir * move_speed * delta

	# ── Separation: smooth push away from nearby troops ──
	var sep = Vector3.ZERO
	var sep_range_sq = separation_radius * separation_radius * 4.0
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

	move_vec += sep * separation_force * delta * 3.0
	global_position += move_vec

	# Push out of non-target buildings
	var target_node = target_building.get("node")
	for entry in _get_buildings_cached():
		if entry.b.get("node") == target_node:
			continue
		var to_me = global_position - entry.pos
		to_me.y = 0
		var bd = to_me.length()
		if bd > 0.001 and bd < 0.12:
			global_position += (to_me / bd) * (0.12 - bd)

	global_position = _clamp_to_island(global_position)
	global_position.y = target_pos.y

	# ── Enter attack when close to slot or close to building ──
	if slot_dist < 0.05 or dist <= attack_range:
		state = State.ATTACKING
		attack_timer = 0.0
		look_at(global_position + dir_to_target, Vector3.UP)
		rotate_y(PI)
		if attack_anim != "" and anim_player.has_animation(attack_anim):
			anim_player.play(attack_anim)
		return

	# ── Stuck detection — retarget if not moving for 3s ──
	_stuck_timer += delta
	if _stuck_timer >= 1.0:
		var moved = global_position.distance_to(_last_pos)
		if moved < move_speed * 0.03:
			_orbit_angle += 1.5  # try different slot
			if _orbit_angle > my_angle + PI:
				_find_alternative_target()
				_orbit_angle = 0.0
		_last_pos = global_position
		_stuck_timer = 0.0


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

	# Keep pushing apart even while attacking
	var sep = _get_separation()
	if sep.length() > 0.001:
		global_position += sep * separation_force * delta
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
