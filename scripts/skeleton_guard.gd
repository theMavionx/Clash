class_name SkeletonGuard
extends Node3D
## Defensive skeleton spawned by Tombstone buildings.
## Patrols around tombstone; chases and attacks enemy troops in detection range.

## Emitted just before this guard is freed when its HP reaches zero.
signal died(guard: Node3D)

const BLADE_SCENE = "res://Model/Characters/Skelet/assets/gltf/Skeleton_Blade.gltf"
const HIT_ANIM_THRESHOLD = 0.4
const HIT_DISTANCE = 0.2
const ATTACK_ANIM = "Melee_1H_Attack_Chop"

const ANIM_FILES = [
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]

var detection_radius: float = 1.0
var patrol_radius: float = 0.35
var patrol_inner_radius: float = 0.18  ## min distance from tombstone center (outside building body)
var move_speed: float = 0.45
var attack_range: float = 0.15
var separation_radius: float = 0.15
var separation_force: float = 0.4
var building_push_radius: float = 0.18  ## push-away zone around any building center
var tombstone_avoid_radius: float = 0.14  ## hard avoidance radius for own tombstone

var hp: int = 350
var max_hp: int = 350
var damage: int = 45
var atk_speed: float = 0.8

var tombstone_pos: Vector3 = Vector3.ZERO

enum State { IDLE, PATROL, CHASE, ATTACK, VICTORY, RELOCATE }
var state: State = State.IDLE

var _patrol_target: Vector3 = Vector3.ZERO
var _idle_timer: float = 0.0
var _idle_duration: float = 0.0
var _attack_timer: float = 0.0
var _target_troop: Node3D = null
var _hit_this_swing: bool = false

var _sep_counter: int = 0
var _last_separation: Vector3 = Vector3.ZERO

var anim_player: AnimationPlayer
var _blade_attachment: BoneAttachment3D
var _hp_bar: Node3D
var _hp_fill: MeshInstance3D
var _last_hp_ratio: float = -1.0
var _last_hp_band: int = -1

## Cached group lookups — refreshed once per frame globally
static var _cached_guards: Array = []
static var _guards_cache_frame: int = -1
static var _cached_buildings_pos: Array = []  # [Vector3] — positions only
static var _buildings_pos_cache_frame: int = -1

static func _get_guards_cached() -> Array:
	var frame: int = Engine.get_process_frames()
	if frame != _guards_cache_frame:
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			_cached_guards = tree.get_nodes_in_group("skeleton_guards")
		_guards_cache_frame = frame
	return _cached_guards

static func _get_buildings_cached() -> Array:
	## Derives building positions from BaseTroop's cached data — no duplicate group query
	var frame: int = Engine.get_process_frames()
	if frame != _buildings_pos_cache_frame:
		_cached_buildings_pos.clear()
		for entry in BaseTroop._get_buildings_cached():
			_cached_buildings_pos.append(entry.pos)
		_buildings_pos_cache_frame = frame
	return _cached_buildings_pos

const HP_BAR_W = 0.12
const HP_BAR_H = 0.012


func _ready() -> void:
	add_to_group("skeleton_guards")
	_setup_animations()
	_setup_weapon()
	_create_hp_bar()
	_pick_idle_wait()


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	_update_hp_bar()
	match state:
		State.IDLE:
			_do_idle(delta)
		State.PATROL:
			_do_patrol(delta)
		State.CHASE:
			_do_chase(delta)
		State.ATTACK:
			_do_attack(delta)
		State.VICTORY:
			pass
		State.RELOCATE:
			_do_relocate(delta)


# ── Idle: stand for a bit, then pick patrol target ────────────

func _pick_idle_wait() -> void:
	_idle_timer = 0.0
	_idle_duration = randf_range(1.5, 4.0)
	state = State.IDLE
	if anim_player and anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func _do_idle(delta: float) -> void:
	_idle_timer += delta
	# Check for enemies even while idle
	var enemy: Node3D = _find_nearest_enemy()
	if enemy:
		_target_troop = enemy
		state = State.CHASE
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return
	# Idle duration elapsed — transition to patrol for livelier behavior
	if _idle_timer >= _idle_duration:
		_pick_patrol_target()


# ── Relocate: run to new tombstone position ───────────────────

## Called when the tombstone is moved. The skeleton will run to
## the new position instead of teleporting.
func relocate_to(new_tombstone_pos: Vector3) -> void:
	tombstone_pos = new_tombstone_pos
	state = State.RELOCATE
	if anim_player and anim_player.has_animation("Running_A"):
		anim_player.play("Running_A")


func _do_relocate(delta: float) -> void:
	# Navigate to a point BESIDE the tombstone, not its center
	var to_tomb: Vector3 = tombstone_pos - global_position
	to_tomb.y = 0
	var dist: float = to_tomb.length()
	# Arrived near the tombstone area — switch to idle / patrol
	if dist < patrol_inner_radius + 0.04:
		_pick_idle_wait()
		return
	var dir: Vector3 = to_tomb.normalized()
	# Stop if another skeleton is directly ahead
	if _is_skeleton_ahead(dir):
		if anim_player and anim_player.current_animation != "Idle_A" and anim_player.has_animation("Idle_A"):
			anim_player.play("Idle_A")
		return
	# Steer around obstacles (tombstone, buildings)
	var avoid: Vector3 = _steer_around_obstacles(dir)
	var final_dir: Vector3 = (dir + avoid).normalized() if (dir + avoid).length() > 0.001 else dir
	look_at(global_position + final_dir, Vector3.UP)
	rotate_y(PI)
	if anim_player and anim_player.current_animation != "Running_A" and anim_player.has_animation("Running_A"):
		anim_player.play("Running_A")
	var move_vec: Vector3 = final_dir * move_speed * delta
	move_vec += _compute_separation(final_dir, delta)
	move_vec += _compute_building_avoidance(delta)
	global_position += move_vec


# ── Patrol: walk to random point on a ring around tombstone ───

func _pick_patrol_target() -> void:
	var angle = randf() * TAU
	# Pick distance on a ring OUTSIDE the building body
	var dist = randf_range(patrol_inner_radius, patrol_radius)
	_patrol_target = tombstone_pos + Vector3(cos(angle) * dist, 0, sin(angle) * dist)
	_patrol_target.y = global_position.y
	state = State.PATROL
	if anim_player and anim_player.has_animation("Walking_A"):
		anim_player.play("Walking_A")


func _do_patrol(delta: float) -> void:
	# Check for enemies
	var enemy: Node3D = _find_nearest_enemy()
	if enemy:
		_target_troop = enemy
		state = State.CHASE
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return

	var diff: Vector3 = _patrol_target - global_position
	diff.y = 0
	var dist: float = diff.length()
	if dist < 0.02:
		_pick_idle_wait()
		return

	var dir: Vector3 = diff.normalized()
	# Stop if another skeleton is directly ahead
	if _is_skeleton_ahead(dir):
		if anim_player and anim_player.current_animation != "Idle_A" and anim_player.has_animation("Idle_A"):
			anim_player.play("Idle_A")
		return
	# Steer around obstacles (tombstone, buildings)
	var avoid: Vector3 = _steer_around_obstacles(dir)
	var final_dir: Vector3 = (dir + avoid).normalized() if (dir + avoid).length() > 0.001 else dir
	look_at(global_position + final_dir, Vector3.UP)
	rotate_y(PI)
	if anim_player and anim_player.current_animation != "Walking_A" and anim_player.has_animation("Walking_A"):
		anim_player.play("Walking_A")
	var move_vec: Vector3 = final_dir * move_speed * 0.5 * delta
	move_vec += _compute_separation(final_dir, delta)
	move_vec += _compute_building_avoidance(delta)
	global_position += move_vec


# ── Chase: run toward enemy troop ─────────────────────────────

func _do_chase(delta: float) -> void:
	if not is_instance_valid(_target_troop) or not _target_troop.is_inside_tree():
		_target_troop = null
		if _are_all_troops_dead():
			_trigger_victory_all()
			return
		_pick_idle_wait()
		return

	# If target troop moved too far from tombstone, give up and return
	var troop_dist_to_tomb = _target_troop.global_position.distance_to(tombstone_pos)
	if troop_dist_to_tomb > detection_radius * 2.0:
		_target_troop = null
		_pick_idle_wait()
		return

	var diff: Vector3 = _target_troop.global_position - global_position
	diff.y = 0
	var dist: float = diff.length()

	if dist > 0.01:
		var dir: Vector3 = diff.normalized()
		look_at(global_position + dir, Vector3.UP)
		rotate_y(PI)
		var move_vec: Vector3 = dir * move_speed * delta
		move_vec += _compute_separation(dir, delta)
		move_vec += _compute_building_avoidance(delta)
		global_position += move_vec

	if dist <= attack_range:
		state = State.ATTACK
		_attack_timer = 0.0
		_hit_this_swing = false
		if anim_player.has_animation(ATTACK_ANIM):
			anim_player.play(ATTACK_ANIM)


# ── Attack: melee hit enemy troop ─────────────────────────────

func _do_attack(delta: float) -> void:
	if not is_instance_valid(_target_troop) or not _target_troop.is_inside_tree():
		_target_troop = null
		if _are_all_troops_dead():
			_trigger_victory_all()
			return
		_pick_idle_wait()
		return

	# Face target
	var diff: Vector3 = _target_troop.global_position - global_position
	diff.y = 0
	if diff.length() > 0.01:
		var dir: Vector3 = diff.normalized()
		look_at(global_position + dir, Vector3.UP)
		rotate_y(PI)

	# Separation while attacking
	var sep: Vector3 = _compute_separation(diff.normalized() if diff.length() > 0.01 else Vector3.FORWARD, delta)
	sep += _compute_building_avoidance(delta)
	if sep.length() > 0.001:
		global_position += sep

	# If target moved out of range, chase again
	if diff.length() > attack_range * 1.5:
		state = State.CHASE
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return

	_attack_timer += delta
	if _attack_timer >= atk_speed:
		_attack_timer -= atk_speed
		_hit_this_swing = false
		if anim_player.has_animation(ATTACK_ANIM):
			anim_player.stop()
			anim_player.play(ATTACK_ANIM)

	# Hit check at animation threshold
	if not _hit_this_swing and _blade_attachment and is_instance_valid(_target_troop):
		if anim_player.is_playing() and anim_player.current_animation == ATTACK_ANIM:
			var anim_len: float = anim_player.current_animation_length
			if anim_len > 0 and anim_player.current_animation_position / anim_len >= HIT_ANIM_THRESHOLD:
				var blade_pos: Vector3 = _blade_attachment.global_position
				var troop_pos: Vector3 = _target_troop.global_position
				if blade_pos.distance_to(troop_pos) <= HIT_DISTANCE:
					_hit_this_swing = true
					if _target_troop.has_method("take_damage"):
						_target_troop.take_damage(damage)
					if not is_instance_valid(_target_troop) or not _target_troop.is_inside_tree():
						_target_troop = null
						if _are_all_troops_dead():
							_trigger_victory_all()
						else:
							_pick_idle_wait()


## Applies [param dmg] hit points of damage to this guard.
## Emits [signal died] and frees the node when HP reaches zero.
func take_damage(dmg: int) -> void:
	hp -= dmg
	if hp <= 0:
		if is_in_group("skeleton_guards"):
			remove_from_group("skeleton_guards")
		died.emit(self)
		queue_free()


# ── Victory ───────────────────────────────────────────────────

## Returns true if no living troops remain in the scene.
func _are_all_troops_dead() -> bool:
	for troop in BaseTroop._get_troops_cached():
		if is_instance_valid(troop) and troop.is_inside_tree():
			return false
	return true


## Triggers victory animation for all living skeleton guards.
func _trigger_victory_all() -> void:
	for guard in _get_guards_cached():
		if is_instance_valid(guard) and guard.state != State.VICTORY:
			guard._play_victory()


## Plays cheering animation and enters VICTORY state.
func _play_victory() -> void:
	state = State.VICTORY
	_target_troop = null
	if anim_player and anim_player.has_animation("Cheering"):
		anim_player.play("Cheering")
	elif anim_player and anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


# ── Enemy detection ───────────────────────────────────────────

## Returns the nearest active troop within [member detection_radius] of the
## tombstone position, or [code]null[/code] if none is in range.
func _find_nearest_enemy() -> Node3D:
	var nearest: Node3D = null
	var nearest_dist: float = detection_radius
	for troop in BaseTroop._get_troops_cached():
		if not is_instance_valid(troop):
			continue
		var d = troop.global_position.distance_to(tombstone_pos)
		if d < nearest_dist:
			nearest_dist = d
			nearest = troop
	return nearest


# ── Separation & building avoidance (same logic as BaseTroop) ─

func _compute_separation(move_dir: Vector3, delta: float) -> Vector3:
	_sep_counter += 1
	if _sep_counter % 3 != 0:
		return _last_separation

	var sep: Vector3 = Vector3.ZERO
	var steer: Vector3 = Vector3.ZERO

	# Also push away from enemy troops so they don't overlap
	for other in BaseTroop._get_troops_cached():
		if not is_instance_valid(other):
			continue
		var to_other: Vector3 = other.global_position - global_position
		to_other.y = 0
		var d: float = to_other.length()
		if d < separation_radius and d > 0.001:
			sep += (global_position - other.global_position).normalized() * (separation_radius - d) / separation_radius

	_last_separation = sep * separation_force * delta * 3.0 + steer
	return _last_separation


func _compute_building_avoidance(delta: float) -> Vector3:
	var push: Vector3 = Vector3.ZERO
	for bpos in _get_buildings_cached():
		var to_me: Vector3 = global_position - bpos
		to_me.y = 0
		var d: float = to_me.length()
		if d > 0.001 and d < building_push_radius:
			var strength: float = (building_push_radius - d) / building_push_radius
			push += to_me.normalized() * strength * strength  # quadratic falloff for stronger close push
	# Extra strong push from own tombstone
	var to_me_tomb: Vector3 = global_position - tombstone_pos
	to_me_tomb.y = 0
	var dt: float = to_me_tomb.length()
	if dt > 0.001 and dt < tombstone_avoid_radius:
		var strength: float = (tombstone_avoid_radius - dt) / tombstone_avoid_radius
		push += to_me_tomb.normalized() * strength * 2.0
	return push * separation_force * delta * 4.0


## Lateral steering to go around nearby obstacles (tombstone, buildings, other skeletons).
func _steer_around_obstacles(move_dir: Vector3) -> Vector3:
	var steer: Vector3 = Vector3.ZERO
	var lateral: Vector3 = Vector3.UP.cross(move_dir)
	if lateral.length() < 0.001:
		return Vector3.ZERO
	lateral = lateral.normalized()

	# Helper: steer around a single point obstacle
	# avoid_radius — how far away we start steering
	var _steer_point: Callable = func(obstacle_pos: Vector3, avoid_radius: float, weight: float) -> Vector3:
		var to_obs: Vector3 = obstacle_pos - global_position
		to_obs.y = 0
		var d: float = to_obs.length()
		if d < 0.001 or d > avoid_radius:
			return Vector3.ZERO
		var dot: float = to_obs.normalized().dot(move_dir)
		# Only steer if we're heading toward the obstacle
		if dot < 0.15:
			return Vector3.ZERO
		var side: float = to_obs.normalized().dot(lateral)
		var strength: float = dot * (1.0 - d / avoid_radius) * weight
		if side >= 0:
			return -lateral * strength
		else:
			return lateral * strength

	# 1) Own tombstone — strongest avoidance
	steer += _steer_point.call(tombstone_pos, tombstone_avoid_radius * 2.5, 1.8)

	# 2) Other buildings in range
	for bpos in _get_buildings_cached():
		steer += _steer_point.call(bpos, building_push_radius * 2.0, 1.2)

	return steer


## Returns true if another skeleton guard is directly ahead within stop distance.
func _is_skeleton_ahead(move_dir: Vector3) -> bool:
	const AHEAD_DIST = 0.12  # how close before we stop
	const AHEAD_DOT = 0.5    # how "in front" they need to be (cos of ~60°)
	for other in _get_guards_cached():
		if other == self or not is_instance_valid(other):
			continue
		var to_other: Vector3 = other.global_position - global_position
		to_other.y = 0
		var d: float = to_other.length()
		if d < 0.001 or d > AHEAD_DIST:
			continue
		# Check if the other skeleton is in our movement direction
		if to_other.normalized().dot(move_dir) > AHEAD_DOT:
			return true
	return false


# ── Animations ────────────────────────────────────────────────

func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "SkeletonAnimPlayer"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)

	# Reuse BaseTroop's shared animation library cache to avoid rebuilding per skeleton
	var cache_key: String = ",".join(ANIM_FILES)
	var lib: AnimationLibrary
	if BaseTroop._anim_lib_cache.has(cache_key):
		lib = BaseTroop._anim_lib_cache[cache_key]
	else:
		lib = AnimationLibrary.new()
		for file_path in ANIM_FILES:
			var res: Resource = load(file_path)
			if res == null:
				continue
			var instance: Node = res.instantiate()
			add_child(instance)
			_hide_meshes(instance)
			var src: AnimationPlayer = _find_anim_player(instance)
			if src:
				for anim_name in src.get_animation_list():
					if anim_name == "RESET" or anim_name == "T-Pose":
						continue
					var anim: Animation = src.get_animation(anim_name)
					if anim and not lib.has_animation(anim_name):
						var dup: Animation = anim.duplicate()
						if anim_name.begins_with("Running") or anim_name.begins_with("Walking") or anim_name.begins_with("Idle"):
							dup.loop_mode = Animation.LOOP_LINEAR
						lib.add_animation(anim_name, dup)
			instance.free()
		BaseTroop._anim_lib_cache[cache_key] = lib

	anim_player.add_animation_library("", lib)
	if anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


# ── Weapon ────────────────────────────────────────────────────

func _setup_weapon() -> void:
	var sk: Skeleton3D = _find_skeleton(self)
	if sk == null:
		return
	var bone_idx: int = sk.find_bone("handslot.r")
	if bone_idx < 0:
		return
	var ba: BoneAttachment3D = BoneAttachment3D.new()
	ba.name = "BladeAttachment"
	ba.bone_name = "handslot.r"
	ba.bone_idx = bone_idx
	sk.add_child(ba)
	var scene_res: Resource = load(BLADE_SCENE)
	if scene_res:
		var blade: Node = scene_res.instantiate()
		blade.name = "Blade"
		blade.rotation_degrees = Vector3(0, 180, 0)
		ba.add_child(blade)
	_blade_attachment = ba


# ── HP Bar ────────────────────────────────────────────────────

func _create_hp_bar() -> void:
	_hp_bar = Node3D.new()
	_hp_bar.top_level = true
	add_child(_hp_bar)
	var bg: MeshInstance3D = MeshInstance3D.new()
	var bg_mesh: QuadMesh = QuadMesh.new()
	bg_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	bg.mesh = bg_mesh
	bg.material_override = _make_hp_mat(Color(0.15, 0.15, 0.15, 0.75), Vector2(HP_BAR_W, HP_BAR_H), 10)
	_hp_bar.add_child(bg)
	_hp_fill = MeshInstance3D.new()
	var fill_mesh: QuadMesh = QuadMesh.new()
	fill_mesh.size = Vector2(HP_BAR_W, HP_BAR_H)
	_hp_fill.mesh = fill_mesh
	_hp_fill.material_override = _make_hp_mat(Color(0.1, 0.85, 0.1, 0.9), Vector2(HP_BAR_W, HP_BAR_H), 11)
	_hp_fill.position.z = -0.001
	_hp_bar.add_child(_hp_fill)
	_hp_bar.visible = false


func _make_hp_mat(color: Color, size: Vector2, priority: int) -> ShaderMaterial:
	var mat = ShaderMaterial.new()
	mat.shader = BaseTroop._get_hp_shader()
	mat.set_shader_parameter("albedo", color)
	mat.set_shader_parameter("bar_size", size)
	mat.render_priority = priority
	return mat


func _update_hp_bar() -> void:
	if not _hp_bar or not _hp_fill:
		return
	if hp >= max_hp:
		if _hp_bar.visible:
			_hp_bar.visible = false
		return
	var ratio: float = clamp(float(hp) / float(max_hp), 0.0, 1.0)
	_hp_bar.visible = true
	_hp_bar.global_position = global_position + Vector3(0, 0.25, 0)
	var cam: Camera3D = BaseTroop._get_camera_cached()
	if cam:
		var cam_pos: Vector3 = cam.global_position
		var bar_pos: Vector3 = _hp_bar.global_position
		var dir: Vector3 = Vector3(cam_pos.x - bar_pos.x, 0, cam_pos.z - bar_pos.z).normalized()
		if dir.length_squared() > 0.001:
			_hp_bar.global_transform.basis = Basis.looking_at(-dir, Vector3.UP)
	# Skip shader updates when ratio hasn't meaningfully changed
	if absf(ratio - _last_hp_ratio) < 0.005 and _last_hp_ratio >= 0.0:
		return
	_last_hp_ratio = ratio
	var fill_w: float = HP_BAR_W * ratio
	(_hp_fill.mesh as QuadMesh).size.x = fill_w
	_hp_fill.position.x = -(HP_BAR_W - fill_w) * 0.5
	var mat: ShaderMaterial = _hp_fill.material_override as ShaderMaterial
	mat.set_shader_parameter("bar_size", Vector2(fill_w, HP_BAR_H))
	var band: int = 2 if ratio > 0.5 else (1 if ratio > 0.25 else 0)
	if band != _last_hp_band:
		_last_hp_band = band
		mat.set_shader_parameter("albedo", BaseTroop._HP_COLORS[band])


# ── Helpers ───────────────────────────────────────────────────
# NOTE: _find_skeleton, _hide_meshes, and _find_anim_player duplicate instance
# methods of the same name in BaseTroop. They cannot be shared because those
# methods are non-static and SkeletonGuard extends Node3D, not BaseTroop.
# If BaseTroop ever exposes static versions, replace these with those calls.

func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node
	for child in node.get_children():
		var result: Skeleton3D = _find_skeleton(child)
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
		var result: AnimationPlayer = _find_anim_player(child)
		if result:
			return result
	return null
