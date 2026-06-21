class_name SkeletonGuard
extends Node3D
## Defensive skeleton spawned by Tombstone buildings.
## Patrols around tombstone; chases and attacks enemy troops in detection range.

## Emitted just before this guard is freed when its HP reaches zero.
signal died(guard: Node3D)

const BLADE_SCENE = "res://Model/Characters/Skelet/assets/gltf/Skeleton_Blade.gltf"
const BODY_TEXTURE = "res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion_skeleton_texture.png"
const BODY_MESH_PREFIX = "Skeleton_Minion_"
const HIT_DELAY_RATIO = 0.4
const ATTACK_ANIM = "Melee_1H_Attack_Chop"
const CAN_TARGET_GROUND: bool = true
const CAN_TARGET_AIR: bool = false

const ANIM_FILES = [
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_General.glb",
	"res://Model/Characters/Skelet/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_CombatMelee.glb",
	"res://Model/Characters/Animations/Rig_Medium/Rig_Medium_Simulation.glb",
]

## Shared blade scene — cached so every skeleton after the first doesn't re-load.
static var _blade_scene_res: Resource = null
static var _web_body_material: StandardMaterial3D = null

const LEVEL_STATS: Dictionary = {
	1: {"hp": 360, "damage": 38, "atk_speed": 0.86, "move_speed": 0.46, "detection_radius": 0.95},
	2: {"hp": 520, "damage": 60, "atk_speed": 0.74, "move_speed": 0.52, "detection_radius": 1.10},
	3: {"hp": 620, "damage": 72, "atk_speed": 0.70, "move_speed": 0.54, "detection_radius": 1.25},
	4: {"hp": 820, "damage": 96, "atk_speed": 0.64, "move_speed": 0.58, "detection_radius": 1.40},
}

var level: int = 2
var detection_radius: float = 1.10
var patrol_radius: float = 0.35
var patrol_inner_radius: float = 0.18  ## min distance from tombstone center (outside building body)
var move_speed: float = 0.52
var attack_range: float = 0.15
var separation_radius: float = 0.15
var separation_force: float = 0.4
var building_push_radius: float = 0.18  ## push-away zone around any building center
var tombstone_avoid_radius: float = 0.14  ## hard avoidance radius for own tombstone

var hp: int = 520
var max_hp: int = 520
var damage: int = 60
var base_damage: int = 60
var ward_bonus_pct: int = 0
var atk_speed: float = 0.74


func set_level(lvl: int) -> void:
	var previous_max: int = max_hp
	var hp_ratio: float = 1.0
	if previous_max > 0:
		hp_ratio = clampf(float(hp) / float(previous_max), 0.0, 1.0)
	level = clampi(lvl, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	max_hp = int(stats.hp)
	hp = maxi(1, roundi(float(max_hp) * hp_ratio))
	base_damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	move_speed = float(stats.move_speed)
	detection_radius = float(stats.detection_radius)
	set_ward_bonus_pct(ward_bonus_pct)


func set_ward_bonus_pct(pct: int) -> void:
	ward_bonus_pct = maxi(0, pct)
	damage = ceili(float(base_damage) * (1.0 + float(ward_bonus_pct) / 100.0))

var tombstone_pos: Vector3 = Vector3.ZERO
var _relocate_target_pos: Vector3 = Vector3.ZERO
var _relocate_target_yaw: float = 0.0

const RELOCATE_ARRIVE_DIST: float = 0.045
const RELOCATE_SNAP_DIST: float = 0.08
const RELOCATE_SLOW_RADIUS: float = 0.18

enum State { IDLE, PATROL, CHASE, ATTACK, VICTORY, RELOCATE }
var state: State = State.IDLE

var _patrol_target: Vector3 = Vector3.ZERO
var _idle_timer: float = 0.0
var _idle_duration: float = 0.0
var _attack_timer: float = 0.0
var _target_troop: Node3D = null
var _hit_this_swing: bool = false
var _is_dead: bool = false

var _sep_counter: int = 0
var _last_separation: Vector3 = Vector3.ZERO

var anim_player: AnimationPlayer
var _blade_attachment: BoneAttachment3D
var _hp_bar: Node3D
var _hp_fill: MeshInstance3D
var _last_hp_ratio: float = -1.0
var _last_hp_band: int = -1

## Cached group lookups — refreshed once per combat tick globally
static var _cached_guards: Array = []
static var _guards_cache_frame: int = -1
static var _cached_buildings_pos: Array = []  # [Vector3] — positions only
static var _buildings_pos_cache_frame: int = -1

static func _get_guards_cached() -> Array:
	var frame: int = BaseTroop.combat_cache_key()
	if frame != _guards_cache_frame:
		_cached_guards.clear()
		var tree: SceneTree = Engine.get_main_loop() as SceneTree
		if tree:
			for guard in tree.get_nodes_in_group("skeleton_guards"):
				if is_instance_valid(guard) and guard.is_inside_tree() and guard.get("hp") != null and int(guard.get("hp")) > 0 and not bool(guard.get("_is_dead")):
					_cached_guards.append(guard)
		_guards_cache_frame = frame
	return _cached_guards

static func _get_buildings_cached() -> Array:
	## Derives building positions from BaseTroop's cached data — no duplicate group query
	var frame: int = BaseTroop.combat_cache_key()
	if frame != _buildings_pos_cache_frame:
		_cached_buildings_pos.clear()
		for entry in BaseTroop._get_buildings_cached():
			_cached_buildings_pos.append(entry.pos)
		_buildings_pos_cache_frame = frame
	return _cached_buildings_pos


static func reset_runtime_cache() -> void:
	_cached_guards.clear()
	_guards_cache_frame = -1
	_cached_buildings_pos.clear()
	_buildings_pos_cache_frame = -1

const HP_BAR_W = 0.12
const HP_BAR_H = 0.012


func _ready() -> void:
	add_to_group("skeleton_guards")
	_setup_animations()
	_setup_weapon()
	refresh_web_body_material_fallback()
	_create_hp_bar()
	BaseTroop.report_render_diagnostic(self, "guard.skeleton.ready", {
		"guard_name": name,
		"level": level,
	})
	_record_replay_telemetry("guard_spawn", {})
	_pick_idle_wait()


func _physics_process(delta: float) -> void:
	if _is_dead:
		return
	delta = BaseTroop.combat_delta(delta)
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
	# Keep guards posted at the tombstone until an enemy enters detection range.
	# Server replay simulation uses the same stationary pre-aggro behavior.
	_idle_duration = INF
	state = State.IDLE
	if anim_player and anim_player.has_animation("Idle_A"):
		anim_player.play("Idle_A")


func _do_idle(delta: float) -> void:
	_idle_timer += delta
	# Check for enemies even while idle
	var enemy: Node3D = _find_nearest_enemy()
	if enemy:
		_target_troop = enemy
		_record_replay_telemetry("guard_target_acquired", _troop_target_payload(enemy))
		state = State.CHASE
		if anim_player.has_animation("Running_A"):
			anim_player.play("Running_A")
		return
	# Idle duration elapsed — transition to patrol for livelier behavior
	if _idle_timer >= _idle_duration:
		_pick_patrol_target()


# ── Relocate: run to new tombstone position ───────────────────

## Called when the tombstone is moved. The skeleton will run to its assigned
## guard post near the new tombstone instead of teleporting.
func relocate_to(new_tombstone_pos: Vector3, guard_post_pos: Vector3 = Vector3.INF, guard_post_yaw: float = 0.0) -> void:
	tombstone_pos = new_tombstone_pos
	_relocate_target_pos = guard_post_pos if guard_post_pos != Vector3.INF else new_tombstone_pos
	_relocate_target_pos.y = global_position.y
	_relocate_target_yaw = guard_post_yaw
	state = State.RELOCATE
	if anim_player and anim_player.has_animation("Running_A"):
		anim_player.play("Running_A")


func _do_relocate(delta: float) -> void:
	# Navigate to the guard's default formation point near the tombstone.
	var to_tomb: Vector3 = _relocate_target_pos - global_position
	to_tomb.y = 0
	var dist: float = to_tomb.length()
	if dist <= RELOCATE_SNAP_DIST:
		_finish_relocate()
		return
	var dir: Vector3 = to_tomb.normalized()
	var near_finish: bool = dist <= RELOCATE_SLOW_RADIUS
	if near_finish:
		_last_separation = Vector3.ZERO
	# Steer around obstacles while travelling, then take a clean direct final
	# approach so guard-post avoidance cannot make the skeleton jitter.
	var avoid: Vector3 = Vector3.ZERO if near_finish else _steer_around_obstacles(dir, false)
	var final_dir: Vector3 = (dir + avoid).normalized() if (dir + avoid).length() > 0.001 else dir
	look_at(global_position + final_dir, Vector3.UP)
	rotate_y(PI)
	if anim_player and anim_player.current_animation != "Running_A" and anim_player.has_animation("Running_A"):
		anim_player.play("Running_A")
	var speed_factor: float = clampf(dist / RELOCATE_SLOW_RADIUS, 0.35, 1.0)
	var step_len: float = minf(move_speed * speed_factor * delta, dist)
	var move_vec: Vector3 = final_dir * step_len
	if not near_finish:
		move_vec += _compute_separation(final_dir, delta)
		move_vec += _compute_building_avoidance(delta)
	global_position += move_vec
	if _flat_distance(global_position, _relocate_target_pos) <= RELOCATE_SNAP_DIST:
		_finish_relocate()


func _finish_relocate() -> void:
	global_position = _relocate_target_pos
	global_rotation = Vector3(0, _relocate_target_yaw, 0)
	_last_separation = Vector3.ZERO
	_pick_idle_wait()


# ── Patrol: walk to random point on a ring around tombstone ───

func _pick_patrol_target() -> void:
	var from_tomb = global_position - tombstone_pos
	from_tomb.y = 0
	var base_angle = atan2(from_tomb.z, from_tomb.x) if from_tomb.length_squared() > 0.0001 else 0.0
	var angle = base_angle + TAU * 0.333
	# Pick a fixed point on the ring outside the building body.
	var dist = (patrol_inner_radius + patrol_radius) * 0.5
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
		_record_replay_telemetry("guard_target_acquired", _troop_target_payload(enemy))
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
	# Steer around obstacles and other guards instead of stopping in a traffic jam.
	var avoid: Vector3 = _steer_around_obstacles(dir, false)
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
	if not BaseTroop.can_target_troop(_target_troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		_target_troop = null
		if _are_all_troops_dead():
			_trigger_victory_all()
			return
		_pick_idle_wait()
		return

	# If target troop moved too far from tombstone, give up and return
	var troop_dist_to_tomb = _flat_distance(_target_troop.global_position, tombstone_pos)
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
		var new_pos: Vector3 = global_position + move_vec
		if _flat_distance(new_pos, _target_troop.global_position) > dist + 0.02:
			new_pos = global_position + dir * move_speed * delta
		global_position = new_pos

	if dist <= attack_range:
		state = State.ATTACK
		_attack_timer = 0.0
		_hit_this_swing = false
		if anim_player.has_animation(ATTACK_ANIM):
			anim_player.play(ATTACK_ANIM)


# ── Attack: melee hit enemy troop ─────────────────────────────

func _do_attack(delta: float) -> void:
	if not BaseTroop.can_target_troop(_target_troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
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

	# Light separation while attacking, but keep combat logic deterministic.
	# The server simulation does not use weapon-bone reach or building push here.
	var sep: Vector3 = _compute_separation(diff.normalized() if diff.length() > 0.01 else Vector3.FORWARD, delta)
	if sep.length() > 0.001:
		var new_pos: Vector3 = global_position + sep
		if _flat_distance(new_pos, _target_troop.global_position) <= attack_range * 1.2:
			global_position = new_pos

	# If target moved out of range, chase again
	if _flat_distance(global_position, _target_troop.global_position) > attack_range * 1.5:
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

	if not _hit_this_swing and _attack_timer >= atk_speed * HIT_DELAY_RATIO:
		_hit_this_swing = true
		if is_instance_valid(_target_troop) and _flat_distance(global_position, _target_troop.global_position) <= attack_range * 1.5:
			if _target_troop.has_method("take_damage"):
				var target_payload: Dictionary = _troop_target_payload(_target_troop)
				var hp_before: int = int(_target_troop.get("hp")) if _target_troop.get("hp") != null else 0
				_target_troop.take_damage(damage)
				target_payload["damage"] = damage
				target_payload["hp_before"] = hp_before
				target_payload["hp_after"] = int(_target_troop.get("hp")) if is_instance_valid(_target_troop) and _target_troop.get("hp") != null else hp_before - damage
				_record_replay_telemetry("guard_melee_hit", target_payload)
			if not is_instance_valid(_target_troop) or not _target_troop.is_inside_tree():
				_target_troop = null
				if _are_all_troops_dead():
					_trigger_victory_all()
				else:
					_pick_idle_wait()


## Applies [param dmg] hit points of damage to this guard.
## Emits [signal died] and frees the node when HP reaches zero.
func take_damage(dmg: int) -> void:
	if _is_dead:
		return
	hp -= dmg
	if hp <= 0:
		_is_dead = true
		_record_replay_telemetry("guard_death", {"damage": dmg})
		if is_in_group("skeleton_guards"):
			remove_from_group("skeleton_guards")
		BaseTroop.invalidate_combat_lists()
		reset_runtime_cache()
		set_process(false)
		died.emit(self)
		queue_free()


# ── Victory ───────────────────────────────────────────────────

## Returns true if no living troops remain in the scene.
func _are_all_troops_dead() -> bool:
	for troop in BaseTroop._get_troops_cached():
		if BaseTroop.is_live_troop(troop):
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
		if not BaseTroop.can_target_troop(troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			continue
		var d = _flat_distance(troop.global_position, tombstone_pos)
		if d < nearest_dist:
			nearest_dist = d
			nearest = troop
	return nearest


func _record_replay_telemetry(kind: String, data: Dictionary = {}) -> void:
	var payload: Dictionary = data.duplicate(true)
	payload.guard_instance = int(get_instance_id())
	payload.hp = hp
	payload.x = snappedf(global_position.x, 0.001)
	payload.z = snappedf(global_position.z, 0.001)
	payload.tomb_x = snappedf(tombstone_pos.x, 0.001)
	payload.tomb_z = snappedf(tombstone_pos.z, 0.001)
	for bs_node in BaseTroop._get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_replay_telemetry"):
			bs_node.record_replay_telemetry(kind, payload)
			return


func _troop_target_payload(troop: Node3D) -> Dictionary:
	var payload: Dictionary = {
		"target_instance": int(troop.get_instance_id()) if is_instance_valid(troop) else -1,
	}
	if is_instance_valid(troop):
		var script_res: Script = troop.get_script()
		payload.target_type = script_res.resource_path.get_file().get_basename() if script_res else ""
		payload.target_hp = int(troop.get("hp")) if troop.get("hp") != null else -1
		if troop.has_meta("replay_order"):
			payload.target_replay_order = int(troop.get_meta("replay_order"))
		payload.target_x = snappedf(troop.global_position.x, 0.001)
		payload.target_z = snappedf(troop.global_position.z, 0.001)
	return payload


func _flat_distance(a: Vector3, b: Vector3) -> float:
	var dx: float = a.x - b.x
	var dz: float = a.z - b.z
	return sqrt(dx * dx + dz * dz)


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

	if state == State.CHASE:
		for other_guard in _get_guards_cached():
			if other_guard == self or not is_instance_valid(other_guard):
				continue
			var to_guard: Vector3 = other_guard.global_position - global_position
			to_guard.y = 0
			var gd: float = to_guard.length()
			if gd < separation_radius and gd > 0.001:
				sep -= (to_guard / gd) * (separation_radius - gd) / separation_radius

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


## Lateral steering to go around nearby obstacles. On base, skeleton guards are
## non-blocking for each other; combat can opt into guard avoidance.
func _steer_around_obstacles(move_dir: Vector3, include_guards: bool = true) -> Vector3:
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

	# 3) Moving units in range
	if include_guards:
		for guard in _get_guards_cached():
			if guard == self or not is_instance_valid(guard):
				continue
			steer += _steer_point.call(guard.global_position, separation_radius * 2.2, 0.9)

	for troop in BaseTroop._get_troops_cached():
		if not is_instance_valid(troop) or troop == _target_troop:
			continue
		steer += _steer_point.call(troop.global_position, separation_radius * 2.0, 0.65)

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
	if _blade_scene_res == null:
		_blade_scene_res = load(BLADE_SCENE)
	var scene_res: Resource = _blade_scene_res
	if scene_res:
		var blade: Node = scene_res.instantiate()
		blade.name = "Blade"
		blade.rotation_degrees = Vector3(0, 180, 0)
		ba.add_child(blade)
	_blade_attachment = ba


func refresh_web_body_material_fallback() -> void:
	if not OS.has_feature("web"):
		return
	var mat: StandardMaterial3D = _get_web_body_material()
	if mat == null:
		return
	var applied_count: int = _apply_web_body_material_recursive(self, mat)
	if applied_count > 0:
		BaseTroop.report_render_diagnostic(self, "guard.skeleton.web_body_material", {
			"guard_name": name,
			"texture": BODY_TEXTURE,
			"applied_meshes": applied_count,
		})


static func _get_web_body_material() -> StandardMaterial3D:
	if _web_body_material != null:
		return _web_body_material
	var texture: Texture2D = ResourceLoader.load(BODY_TEXTURE, "Texture2D") as Texture2D
	if texture == null:
		push_warning("SkeletonGuard: missing web body texture '%s'" % BODY_TEXTURE)
		return null
	var mat := StandardMaterial3D.new()
	mat.resource_name = "WebBody_skeleton_guard"
	mat.albedo_texture = texture
	mat.transparency = BaseMaterial3D.TRANSPARENCY_DISABLED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR
	_web_body_material = mat
	return mat


static func _apply_web_body_material_recursive(node: Node, mat: StandardMaterial3D) -> int:
	var applied_count: int = 0
	if node is MeshInstance3D:
		var mesh_instance: MeshInstance3D = node as MeshInstance3D
		if str(mesh_instance.name).begins_with(BODY_MESH_PREFIX):
			var mesh: Mesh = mesh_instance.mesh
			var surface_count: int = mesh.get_surface_count() if mesh != null else 0
			if surface_count == 0:
				mesh_instance.material_override = mat
			else:
				for surface_index in range(surface_count):
					mesh_instance.set_surface_override_material(surface_index, mat)
			applied_count += 1
	for child in node.get_children():
		applied_count += _apply_web_body_material_recursive(child, mat)
	return applied_count


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
