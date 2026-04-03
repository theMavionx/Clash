extends Node3D
## Home troop — wanders the island in IDLE/WALKING cycle.
## Avoids other home troops and buildings. Uses per-frame movement, not tweens.
## Attach via set_script() after instantiating the troop model.

enum WanderState { IDLE, WALKING, BOARDING }

# ── Config ────────────────────────────────────────────────────
@export var move_speed: float = 0.35
@export var wander_radius_min: float = 0.15
@export var wander_radius_max: float = 0.5
@export var idle_time_min: float = 1.5
@export var idle_time_max: float = 4.0
@export var separation_radius: float = 0.15
@export var separation_force: float = 0.6
@export var building_avoid_radius: float = 0.2

# ── Weapon paths — same as combat troops ──────────────────────
const WEAPON_PATHS: Dictionary = {
	"Knight":    "res://Model/Characters/Assets/sword_1handed.gltf",
	"Barbarian": "res://Model/Characters/Assets/axe_1handed.gltf",
	"Mage":      "res://Model/Characters/Assets/staff.gltf",
	"Archer":    "res://Model/Characters/Assets/bow_withString.gltf",
	"Ranger":    "res://Model/Characters/Assets/crossbow_1handed.gltf",
}
const WEAPON_BONES: Dictionary = {
	"Knight": "handslot.r",
	"Barbarian": "handslot.r",
	"Mage": "handslot.r",
	"Archer": "handslot.l",
	"Ranger": "handslot.r",
}
const WEAPON_ROTATIONS: Dictionary = {
	"Knight": Vector3.ZERO,
	"Barbarian": Vector3(0, 180, 0),
	"Mage": Vector3.ZERO,
	"Archer": Vector3(-90, 180, 0),
	"Ranger": Vector3(0, 90, 0),
}

signal boarded  # emitted when troop reaches port and disappears

# ── State ─────────────────────────────────────────────────────
var state: WanderState = WanderState.IDLE
var _target_pos: Vector3 = Vector3.ZERO
var _idle_timer: float = 0.0
var _board_target: Vector3 = Vector3.ZERO
var _anim_player: AnimationPlayer = null
var _grid_center: Vector3 = Vector3.ZERO
var _grid_half_x: float = 1.0
var _grid_half_z: float = 1.0
var _grid_y: float = 0.0
var _troop_type: String = ""  # "Knight", "Mage", etc.
var level: int = 1

# ── Animation files — same paths as BaseTroop.MEDIUM_RIG_ANIM_FILES ──
const ANIM_FILES: Array[String] = [
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatRanged.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]


func _ready() -> void:
	_setup_animations()
	_setup_weapon()
	_cache_grid_bounds()
	# Start in idle with random delay
	state = WanderState.IDLE
	_idle_timer = randf_range(0.0, idle_time_max)
	visible = true


## Call after instantiation to set troop type and level
func init_troop(troop_type: String, lvl: int) -> void:
	_troop_type = troop_type
	level = lvl


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	match state:
		WanderState.IDLE:
			_idle_timer -= delta
			if _idle_timer <= 0:
				_pick_wander_target()
				state = WanderState.WALKING
				_play_anim("Running_A")
		WanderState.WALKING:
			_move_toward_target(delta)
		WanderState.BOARDING:
			_move_to_board(delta)


## Call to make the troop walk toward a port and board the ship
func board_ship(port_pos: Vector3) -> void:
	_board_target = port_pos
	_board_target.y = _grid_y
	state = WanderState.BOARDING
	_play_anim("Running_A")
	# Face the port
	var dir = _board_target - global_position
	dir.y = 0
	if dir.length_squared() > 0.001:
		look_at(global_position - dir, Vector3.UP)


func _move_to_board(delta: float) -> void:
	var diff = _board_target - global_position
	diff.y = 0
	# Arrived at port — board the ship
	if diff.length_squared() < 0.04 * 0.04:
		visible = false
		set_process(false)
		boarded.emit()
		return
	var dir = diff.normalized()
	var board_speed = move_speed * 1.5  # run faster to port
	global_position += dir * board_speed * delta
	global_position.y = _grid_y
	# Face direction
	if dir.length_squared() > 0.001:
		look_at(global_position - dir, Vector3.UP)


func _move_toward_target(delta: float) -> void:
	var diff = _target_pos - global_position
	diff.y = 0
	var dist_sq = diff.length_squared()

	# Arrived
	if dist_sq < 0.01 * 0.01:
		state = WanderState.IDLE
		_idle_timer = randf_range(idle_time_min, idle_time_max)
		_play_anim("Idle_A")
		return

	var dir = diff.normalized()

	# Separation from other home troops
	var sep = Vector3.ZERO
	for other in get_tree().get_nodes_in_group("home_troops"):
		if other == self or not is_instance_valid(other):
			continue
		var to_other = global_position - other.global_position
		to_other.y = 0
		var d = to_other.length()
		if d < separation_radius and d > 0.001:
			sep += to_other.normalized() * (separation_radius - d) / separation_radius

	# Building avoidance
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not "placed_buildings" in bs:
			continue
		for b in bs.placed_buildings:
			var bnode = b.get("node")
			if not is_instance_valid(bnode):
				continue
			var to_bldg = global_position - bnode.global_position
			to_bldg.y = 0
			var bd = to_bldg.length()
			if bd < building_avoid_radius and bd > 0.001:
				sep += to_bldg.normalized() * (building_avoid_radius - bd) / building_avoid_radius * 1.5

	var velocity = dir * move_speed + sep * separation_force
	velocity.y = 0
	var new_pos = global_position + velocity * delta
	# Clamp to grid
	new_pos.x = clampf(new_pos.x, _grid_center.x - _grid_half_x, _grid_center.x + _grid_half_x)
	new_pos.z = clampf(new_pos.z, _grid_center.z - _grid_half_z, _grid_center.z + _grid_half_z)
	new_pos.y = _grid_y
	global_position = new_pos

	# Face movement direction (model faces -Z, so look_at opposite)
	var face_dir = velocity.normalized()
	if face_dir.length_squared() > 0.001:
		look_at(global_position - face_dir, Vector3.UP)


func _pick_wander_target() -> void:
	# Try up to 5 times to find a valid point away from buildings
	for _i in range(5):
		var angle = randf_range(0, TAU)
		var dist = randf_range(wander_radius_min, wander_radius_max)
		var candidate = global_position + Vector3(cos(angle) * dist, 0, sin(angle) * dist)
		candidate.x = clampf(candidate.x, _grid_center.x - _grid_half_x, _grid_center.x + _grid_half_x)
		candidate.z = clampf(candidate.z, _grid_center.z - _grid_half_z, _grid_center.z + _grid_half_z)
		candidate.y = _grid_y
		# Check not inside a building
		if not _is_inside_building(candidate):
			_target_pos = candidate
			return
	# Fallback — just go to center area
	_target_pos = _grid_center + Vector3(randf_range(-0.3, 0.3), 0, randf_range(-0.3, 0.3))
	_target_pos.y = _grid_y


func _is_inside_building(pos: Vector3) -> bool:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if not "placed_buildings" in bs or not "building_defs" in bs:
			continue
		for b in bs.placed_buildings:
			var bnode = b.get("node")
			if not is_instance_valid(bnode):
				continue
			var d = pos.distance_to(bnode.global_position)
			if d < building_avoid_radius:
				return true
	return false


func _cache_grid_bounds() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if "grid_extent_x" in bs and "grid_extent_z" in bs and "grid_y" in bs:
			_grid_center = bs.to_global(Vector3.ZERO)
			_grid_half_x = bs.grid_extent_x * 0.42
			_grid_half_z = bs.grid_extent_z * 0.42
			_grid_y = bs.grid_y
			break


# ── Animations ────────────────────────────────────────────────

func _setup_animations() -> void:
	# Reuse BaseTroop's animation library cache for efficiency
	_anim_player = AnimationPlayer.new()
	_anim_player.name = "HomeTroopAnimPlayer"
	add_child(_anim_player)
	_anim_player.root_node = _anim_player.get_path_to(self)

	var cache_key: String = ",".join(ANIM_FILES)
	var lib: AnimationLibrary
	if BaseTroop._anim_lib_cache.has(cache_key):
		lib = BaseTroop._anim_lib_cache[cache_key]
	else:
		lib = AnimationLibrary.new()
		for file_path in ANIM_FILES:
			var res = load(file_path)
			if res == null:
				continue
			var container = Node3D.new()
			add_child(container)
			var instance = res.instantiate()
			container.add_child(instance)
			_hide_meshes(container)
			var src = _find_anim_player(instance)
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
			container.free()
		BaseTroop._anim_lib_cache[cache_key] = lib

	_anim_player.add_animation_library("", lib)
	_play_anim("Idle_A")


func _play_anim(anim_name: String) -> void:
	if not _anim_player:
		return
	if _anim_player.has_animation(anim_name) and _anim_player.current_animation != anim_name:
		_anim_player.play(anim_name)


func _hide_meshes(node: Node) -> void:
	if node is MeshInstance3D:
		node.visible = false
	for child in node.get_children():
		_hide_meshes(child)


# ── Weapons ───────────────────────────────────────────────────

func _setup_weapon() -> void:
	if not WEAPON_PATHS.has(_troop_type):
		return
	var path: String = WEAPON_PATHS[_troop_type]
	var bone: String = WEAPON_BONES.get(_troop_type, "handslot.r")
	var rot: Vector3 = WEAPON_ROTATIONS.get(_troop_type, Vector3.ZERO)
	var res = load(path)
	if res == null:
		return
	var skeleton = _find_skeleton(self)
	if not skeleton:
		return
	var bone_idx = skeleton.find_bone(bone)
	if bone_idx < 0:
		return
	var attachment = BoneAttachment3D.new()
	attachment.bone_name = bone
	attachment.bone_idx = bone_idx
	skeleton.add_child(attachment)
	var weapon = res.instantiate()
	if rot != Vector3.ZERO:
		weapon.rotation_degrees = rot
	attachment.add_child(weapon)


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var result = _find_skeleton(child)
		if result:
			return result
	return null


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_anim_player(child)
		if result:
			return result
	return null
