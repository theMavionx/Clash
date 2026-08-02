extends Node3D
## Ground-only Cannon defense for Town Hall 7, levels 1 through 7.
##
## The authored base is never animated. Barrel yaw and firing presentation are
## recomposed every frame from captured rest transforms so repeated shots cannot
## accumulate scale, rotation, or recoil offsets.

const LEVEL_STATS := {
	1: {"damage": 40, "fire_rate": 1.60, "detect_range": 1.35},
	2: {"damage": 109, "fire_rate": 1.60, "detect_range": 1.45},
	3: {"damage": 259, "fire_rate": 1.60, "detect_range": 1.55},
	4: {"damage": 431, "fire_rate": 1.60, "detect_range": 1.65},
	5: {"damage": 510, "fire_rate": 1.60, "detect_range": 1.75},
	6: {"damage": 577, "fire_rate": 1.60, "detect_range": 1.85},
	7: {"damage": 620, "fire_rate": 1.60, "detect_range": 2.00},
	8: {"damage": 690, "fire_rate": 1.60, "detect_range": 2.08},
	9: {"damage": 760, "fire_rate": 1.60, "detect_range": 2.16},
}

const PROJECTILE_SPEED: float = 3.2
const PROJECTILE_HIT_RADIUS: float = 0.05
const TARGET_SEARCH_INTERVAL: float = 0.15
const BARREL_YAW_SPEED: float = deg_to_rad(240.0)
const FIRE_YAW_TOLERANCE: float = deg_to_rad(5.0)
const CAN_TARGET_GROUND: bool = true
const CAN_TARGET_AIR: bool = false

const ANTICIPATION_END: float = 0.08
const FIRE_MOMENT: float = 0.10
const RECOIL_PEAK_MOMENT: float = 0.14
const PRESENTATION_END: float = 0.32
const RECOIL_DISTANCE: float = 0.18
const RECOVERY_OVERSHOOT: float = 0.018
const ANTICIPATION_SCALE := Vector3(1.03, 0.94, 1.03)
const RECOIL_SCALE := Vector3(1.02, 0.98, 0.96)

const POOL_SIZE: int = 6
const BALL_RADIUS: float = 0.032
const BALL_HIGHLIGHT_RADIUS: float = 0.011
const BALL_HIGHLIGHT_OFFSET := Vector3(0.017, 0.017, 0.017)
const TRAIL_LENGTH: float = 0.10
const TRAIL_RADIUS: float = 0.005
const FLASH_DURATION: float = 0.07
const FLASH_SCALE: float = 0.13
const MUZZLE_FLASH_FRAMES: Array[String] = [
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_000.png",
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_001.png",
]
const ATTACK_SFX_PATHS: Array[String] = [
	"res://Musik/sound_effects/Turret/Turret_Attack1.mp3",
	"res://Musik/sound_effects/Turret/Turret_Attack2.mp3",
]
const ATTACK_SFX_VOLUME_DB: float = -2.0
const ATTACK_SFX_PITCH_JITTER: float = 0.035

@export var detect_range: float = 1.35
@export var bullet_speed: float = PROJECTILE_SPEED
@export var attack_sfx_enabled: bool = true

var level: int = 1
var damage: int = 40
var fire_rate: float = 1.60
var ward_bonus_pct: int = 0

var _target: Node3D = null
var _target_search_timer: float = 0.0
var _fire_timer: float = 0.0
var _freeze_remaining: float = 0.0

var _base: Node3D = null
var _barrel: Node3D = null
var _muzzle: Marker3D = null
var _base_rest_transform := Transform3D.IDENTITY
var _barrel_rest_transform := Transform3D.IDENTITY
var _barrel_forward_local := Vector3.FORWARD
var _barrel_yaw: float = 0.0
var _barrel_yaw_error: float = INF
var _visuals_ready: bool = false
var _missing_nodes_warned: bool = false
var _spawn_facing_global: Vector3 = Vector3.ZERO
var _has_spawn_facing: bool = false
var _spawn_facing_apply_pending: bool = false

var _presentation_active: bool = false
var _presentation_elapsed: float = 0.0
var _presentation_fired: bool = false

var _projectile_pool: Array[Dictionary] = []
var _active_projectiles: Array[Dictionary] = []
var _pool_ready: bool = false
var _projectile_host: Node = null

var _flash_material: StandardMaterial3D = null
var _attack_sfx_player: AudioStreamPlayer = null

static var _shared_ball_mesh: SphereMesh = null
static var _shared_ball_material: StandardMaterial3D = null
static var _shared_ball_highlight_mesh: SphereMesh = null
static var _shared_ball_highlight_material: StandardMaterial3D = null
static var _shared_trail_mesh: CylinderMesh = null
static var _shared_trail_material: StandardMaterial3D = null
static var _flash_textures: Array[Texture2D] = []
static var _flash_textures_loaded: bool = false
static var _attack_sfx_streams: Array[AudioStream] = []
static var _attack_sfx_loaded: bool = false


func _ready() -> void:
	_apply_stats()
	_discover_visual_nodes()
	_prepare_shared_resources()
	if attack_sfx_enabled:
		_setup_audio()
	call_deferred("_build_projectile_pool")


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)
	_update_projectiles(delta)

	if not _visuals_ready:
		return

	if _freeze_remaining > 0.0:
		_freeze_remaining = maxf(0.0, _freeze_remaining - delta)
		_cancel_presentation()
		return

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = fmod(_target_search_timer, TARGET_SEARCH_INTERVAL)
		_find_target()

	if not BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		_target = null
		_barrel_yaw_error = INF
		_fire_timer = 0.0
		_cancel_presentation()
		return

	_rotate_barrel_toward_target(delta)
	_fire_timer += delta
	var presentation_started: bool = false
	if (
		not _presentation_active
		and _fire_timer >= fire_rate - FIRE_MOMENT
		and _barrel_yaw_error <= FIRE_YAW_TOLERANCE
	):
		_start_attack_presentation()
		presentation_started = true
	if _presentation_active and not presentation_started:
		_update_attack_presentation(delta)


func set_level(lvl: int) -> void:
	var next_level := clampi(lvl, 1, LEVEL_STATS.size())
	var level_changed := next_level != level
	level = next_level
	_apply_stats()
	if level_changed and is_inside_tree():
		call_deferred("_discover_visual_nodes")


func set_ward_bonus_pct(pct: int) -> void:
	ward_bonus_pct = maxi(0, pct)
	_apply_stats()


## Gives the idle barrel a deterministic spawn heading toward the actual troop
## deployment zone. Combat yaw remains relative to the authored rest transform
## and retains the last tracked target after acquisition begins.
func set_spawn_facing_global(target_global_position: Vector3) -> void:
	_spawn_facing_global = target_global_position
	_has_spawn_facing = true
	if not _apply_spawn_facing_if_ready():
		_queue_spawn_facing_apply()


func freeze_for(duration: float) -> void:
	_freeze_remaining = maxf(_freeze_remaining, maxf(0.0, duration))
	if _freeze_remaining > 0.0:
		_cancel_presentation()


func _apply_stats() -> void:
	var stats: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = ceili(float(stats.damage) * (1.0 + float(ward_bonus_pct) / 100.0))
	fire_rate = float(stats.fire_rate)
	detect_range = float(stats.detect_range)
	bullet_speed = PROJECTILE_SPEED


func _discover_visual_nodes() -> void:
	_visuals_ready = false
	_base = _find_node_by_name(self, "Cannon%dBase" % level)
	if _base == null:
		for candidate_level in range(1, 11):
			_base = _find_node_by_name(self, "Cannon%dBase" % candidate_level)
			if _base != null:
				break
	_barrel = null
	if _base != null:
		var barrel_name := str(_base.name).trim_suffix("Base")
		_barrel = _find_node_by_name(_base, barrel_name)
	# During a level swap the previous model can remain queued for deletion
	# until the end of the frame. Searching from `self` could then pair the new
	# barrel with the old model's muzzle. Constrain the lookup to the selected
	# barrel so all three visual nodes always belong to one authored hierarchy.
	_muzzle = null
	if _barrel != null:
		_muzzle = _find_node_by_name(_barrel, "CannonMuzzle") as Marker3D
	if _base == null or _barrel == null or _muzzle == null:
		if not _missing_nodes_warned:
			_missing_nodes_warned = true
			push_warning(
				"Cannon: required visual nodes are missing "
				+ "(CannonNBase, CannonN, CannonMuzzle); firing disabled."
			)
		return
	if _barrel.get_parent() != _base or _muzzle.get_parent() != _barrel:
		if not _missing_nodes_warned:
			_missing_nodes_warned = true
			push_warning(
				"Cannon: barrel must be below its fixed base and CannonMuzzle below barrel; "
				+ "firing disabled."
			)
		return

	_base_rest_transform = _base.transform
	_barrel_rest_transform = _barrel.transform
	_barrel_forward_local = _muzzle.position.normalized()
	if _barrel_forward_local.length_squared() < 0.0001:
		if not _missing_nodes_warned:
			_missing_nodes_warned = true
			push_warning("Cannon: CannonMuzzle has no local offset; firing disabled.")
		return
	_missing_nodes_warned = false
	_visuals_ready = true
	_apply_barrel_visual(0.0, Vector3.ONE)
	if _has_spawn_facing:
		_queue_spawn_facing_apply()


func _queue_spawn_facing_apply() -> void:
	if _spawn_facing_apply_pending or not is_inside_tree() or not _has_spawn_facing:
		return
	_spawn_facing_apply_pending = true
	call_deferred("_apply_spawn_facing_when_ready")


func _apply_spawn_facing_when_ready() -> void:
	# Level swaps and construction tweens can briefly leave the new barrel or
	# its inherited basis unavailable. Retry for a few rendered frames instead
	# of baking a world yaw that can drift when the island/grid transform moves.
	for _attempt in range(6):
		if _apply_spawn_facing_if_ready():
			break
		if not is_inside_tree():
			break
		await get_tree().process_frame
	_spawn_facing_apply_pending = false


func _apply_spawn_facing_if_ready() -> bool:
	if not _has_spawn_facing or not _visuals_ready or not is_instance_valid(_barrel):
		return false
	var parent := _barrel.get_parent_node_3d()
	if parent == null:
		return false
	var parent_basis := parent.global_transform.basis
	if absf(parent_basis.determinant()) <= 0.000001:
		return false
	var world_direction := _spawn_facing_global - _barrel.global_position
	world_direction.y = 0.0
	if world_direction.length_squared() <= 0.000001:
		return false
	var local_direction := parent_basis.inverse() * world_direction.normalized()
	local_direction.y = 0.0
	if local_direction.length_squared() <= 0.000001:
		return false
	local_direction = local_direction.normalized()

	var rest_forward_parent: Vector3 = _barrel_rest_transform.basis * _barrel_forward_local
	rest_forward_parent.y = 0.0
	if rest_forward_parent.length_squared() <= 0.000001:
		return false
	rest_forward_parent = rest_forward_parent.normalized()
	var rest_angle := atan2(rest_forward_parent.x, rest_forward_parent.z)
	var desired_angle := atan2(local_direction.x, local_direction.z)
	_barrel_yaw = wrapf(desired_angle - rest_angle, -PI, PI)
	_barrel_yaw_error = 0.0
	_apply_current_presentation_pose()
	return true


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	if BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		var current_offset: Vector3 = _target.global_position - global_position
		current_offset.y = 0.0
		if current_offset.length_squared() <= detect_sq:
			return

	_target = null
	var nearest_dist_sq: float = detect_sq
	var my_position: Vector3 = global_position
	var troops: Array = BaseTroop._get_troops_cached()
	var troop_positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	for troop_index in range(troops.size()):
		var troop: Variant = troops[troop_index]
		if not BaseTroop.can_defense_target_troop(troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			continue
		var offset: Vector3 = troop_positions[troop_index] - my_position
		offset.y = 0.0
		var distance_sq: float = offset.length_squared()
		# Cached troops are already in stable replay order, so strict comparison
		# preserves deterministic ordering for equal-distance candidates.
		if distance_sq < nearest_dist_sq:
			nearest_dist_sq = distance_sq
			_target = troop as Node3D


func _rotate_barrel_toward_target(delta: float) -> void:
	if _barrel == null or not is_instance_valid(_target):
		return
	var parent := _barrel.get_parent_node_3d()
	if parent == null:
		return
	var world_direction: Vector3 = _target.global_position - _barrel.global_position
	world_direction.y = 0.0
	if world_direction.length_squared() < 0.0001:
		_barrel_yaw_error = 0.0
		return
	var local_direction: Vector3 = parent.global_transform.basis.inverse() * world_direction.normalized()
	local_direction.y = 0.0
	local_direction = local_direction.normalized()

	var rest_forward_parent: Vector3 = _barrel_rest_transform.basis * _barrel_forward_local
	rest_forward_parent.y = 0.0
	rest_forward_parent = rest_forward_parent.normalized()
	var rest_angle: float = atan2(rest_forward_parent.x, rest_forward_parent.z)
	var desired_angle: float = atan2(local_direction.x, local_direction.z)
	var desired_yaw: float = wrapf(desired_angle - rest_angle, -PI, PI)
	_barrel_yaw = rotate_toward(_barrel_yaw, desired_yaw, BARREL_YAW_SPEED * delta)
	_barrel_yaw_error = absf(angle_difference(_barrel_yaw, desired_yaw))
	_apply_current_presentation_pose()


func _start_attack_presentation() -> void:
	_presentation_active = true
	_presentation_elapsed = 0.0
	_presentation_fired = false
	_apply_barrel_visual(0.0, Vector3.ONE)


func _update_attack_presentation(delta: float) -> void:
	if not _presentation_active:
		return
	var previous_time: float = _presentation_elapsed
	_presentation_elapsed = minf(PRESENTATION_END, _presentation_elapsed + delta)
	var should_fire := (
		not _presentation_fired
		and previous_time < FIRE_MOMENT
		and _presentation_elapsed >= FIRE_MOMENT
	)
	# Compose the authored barrel pose before reading CannonMuzzle. Otherwise
	# squash/stretch moves the visible muzzle after projectile spawn and makes
	# the cannonball appear to start beside or inside the barrel.
	_apply_current_presentation_pose()
	if should_fire:
		_presentation_fired = true
		_fire_timer = maxf(0.0, _fire_timer - fire_rate)
		_spawn_projectile()
	if _presentation_elapsed >= PRESENTATION_END:
		_presentation_active = false
		_presentation_elapsed = 0.0
		_presentation_fired = false
		_apply_barrel_visual(0.0, Vector3.ONE)


func _cancel_presentation() -> void:
	if not _presentation_active:
		return
	_presentation_active = false
	_presentation_elapsed = 0.0
	_presentation_fired = false
	_apply_barrel_visual(0.0, Vector3.ONE)


func _apply_current_presentation_pose() -> void:
	if not _presentation_active:
		_apply_barrel_visual(0.0, Vector3.ONE)
		return
	var recoil: float = 0.0
	var visual_scale := Vector3.ONE
	var time := _presentation_elapsed
	if time <= ANTICIPATION_END:
		var anticipation_t: float = _ease_out_cubic(time / ANTICIPATION_END)
		visual_scale = Vector3.ONE.lerp(ANTICIPATION_SCALE, anticipation_t)
	elif time < FIRE_MOMENT:
		visual_scale = ANTICIPATION_SCALE
	elif time <= RECOIL_PEAK_MOMENT:
		var recoil_t: float = _ease_out_cubic(
			(time - FIRE_MOMENT) / (RECOIL_PEAK_MOMENT - FIRE_MOMENT)
		)
		recoil = lerpf(0.0, RECOIL_DISTANCE, recoil_t)
		visual_scale = ANTICIPATION_SCALE.lerp(RECOIL_SCALE, recoil_t)
	else:
		var recovery_t: float = clampf(
			(time - RECOIL_PEAK_MOMENT) / (PRESENTATION_END - RECOIL_PEAK_MOMENT),
			0.0,
			1.0,
		)
		if recovery_t < 0.72:
			var settle_t: float = _ease_out_cubic(recovery_t / 0.72)
			recoil = lerpf(RECOIL_DISTANCE, -RECOVERY_OVERSHOOT, settle_t)
			visual_scale = RECOIL_SCALE.lerp(Vector3(0.995, 1.008, 1.01), settle_t)
		else:
			var overshoot_t: float = _smoothstep((recovery_t - 0.72) / 0.28)
			recoil = lerpf(-RECOVERY_OVERSHOOT, 0.0, overshoot_t)
			visual_scale = Vector3(0.995, 1.008, 1.01).lerp(Vector3.ONE, overshoot_t)
	_apply_barrel_visual(recoil, visual_scale)


func _apply_barrel_visual(recoil: float, visual_scale: Vector3) -> void:
	if _barrel == null:
		return
	var yaw_basis := Basis(Vector3.UP, _barrel_yaw)
	var oriented_basis: Basis = _barrel_rest_transform.basis * yaw_basis
	var local_recoil: Vector3 = -_barrel_forward_local * recoil
	var recoil_parent: Vector3 = (
		_barrel_rest_transform.basis.orthonormalized() * yaw_basis * local_recoil
	)
	_barrel.transform = Transform3D(
		oriented_basis * Basis.from_scale(visual_scale),
		_barrel_rest_transform.origin + recoil_parent,
	)


func _spawn_projectile() -> void:
	if not BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		return
	if not _pool_ready:
		_build_projectile_pool()
	var projectile: Dictionary = _get_pooled_projectile()
	if projectile.is_empty():
		return

	var spawn_transform: Transform3D = _muzzle.global_transform
	var spawn_position: Vector3 = spawn_transform.origin
	projectile.active = true
	projectile.target = _target
	projectile.target_instance = int(_target.get_instance_id())
	projectile.spawn_position = spawn_position
	projectile.hit_applied = false
	projectile.flash_timer = FLASH_DURATION
	projectile.flash_frame = 0

	var ball := projectile.ball as MeshInstance3D
	ball.global_position = spawn_position
	ball.visible = true
	(projectile.trail as MeshInstance3D).visible = false
	var flash := projectile.flash as MeshInstance3D
	flash.global_transform = spawn_transform
	flash.visible = true
	if _flash_material != null:
		_flash_material.albedo_color = Color(1.5, 1.15, 0.65, 1.0)
		if not _flash_textures.is_empty():
			_flash_material.albedo_texture = _flash_textures[0]

	_active_projectiles.append(projectile)
	_play_attack_sfx()
	_record_defense_telemetry("defense_fire", _target, {
		"damage": damage,
		"projectile_x": snappedf(spawn_position.x, 0.001),
		"projectile_y": snappedf(spawn_position.y, 0.001),
		"projectile_z": snappedf(spawn_position.z, 0.001),
	})


func _update_projectiles(delta: float) -> void:
	for projectile_index in range(_active_projectiles.size() - 1, -1, -1):
		var projectile: Dictionary = _active_projectiles[projectile_index]
		_update_projectile_flash(projectile, delta)
		var raw_target: Variant = projectile.get("target", null)
		var target: Node3D = null
		if is_instance_valid(raw_target):
			target = raw_target as Node3D
		var raw_ball: Variant = projectile.get("ball", null)
		var projectile_ball: MeshInstance3D = null
		if is_instance_valid(raw_ball):
			projectile_ball = raw_ball as MeshInstance3D
		if projectile_ball == null:
			_return_projectile(projectile)
			_active_projectiles.remove_at(projectile_index)
			continue
		if not BaseTroop.can_defense_target_troop(target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			_record_defense_telemetry("defense_projectile_lost_target", target, {
				"target_instance": int(projectile.target_instance),
				"projectile_x": snappedf(projectile_ball.global_position.x, 0.001),
				"projectile_y": snappedf(projectile_ball.global_position.y, 0.001),
				"projectile_z": snappedf(projectile_ball.global_position.z, 0.001),
			})
			_return_projectile(projectile)
			_active_projectiles.remove_at(projectile_index)
			continue

		var target_position: Vector3 = target.global_position + Vector3(0.0, 0.20, 0.0)
		projectile_ball.global_position = projectile_ball.global_position.move_toward(
			target_position,
			bullet_speed * delta
		)
		_update_trail(projectile)
		var hit_offset: Vector3 = projectile_ball.global_position - target_position
		if (
			not bool(projectile.hit_applied)
			and hit_offset.length_squared() <= PROJECTILE_HIT_RADIUS * PROJECTILE_HIT_RADIUS
		):
			projectile.hit_applied = true
			var hp_before: int = int(target.get("hp")) if target.get("hp") != null else 0
			if target.has_method("take_damage"):
				target.call("take_damage", damage)
			else:
				var hp_value: Variant = target.get("hp")
				if hp_value != null:
					target.set("hp", int(hp_value) - damage)
			var hp_after: int = (
				int(target.get("hp"))
				if is_instance_valid(target) and target.get("hp") != null
				else hp_before - damage
			)
			_record_defense_telemetry("defense_projectile_hit", target, {
				"damage": damage,
				"hp_before": hp_before,
				"hp_after": hp_after,
				"projectile_x": snappedf(projectile_ball.global_position.x, 0.001),
				"projectile_y": snappedf(projectile_ball.global_position.y, 0.001),
				"projectile_z": snappedf(projectile_ball.global_position.z, 0.001),
			})
			_return_projectile(projectile)
			_active_projectiles.remove_at(projectile_index)


func _update_projectile_flash(projectile: Dictionary, delta: float) -> void:
	var flash_timer: float = maxf(0.0, float(projectile.flash_timer) - delta)
	projectile.flash_timer = flash_timer
	var raw_flash: Variant = projectile.get("flash", null)
	var flash: MeshInstance3D = null
	if is_instance_valid(raw_flash):
		flash = raw_flash as MeshInstance3D
	if flash == null:
		return
	if flash_timer <= 0.0:
		flash.visible = false
		return
	if _flash_material == null:
		return
	var progress: float = 1.0 - flash_timer / FLASH_DURATION
	if not _flash_textures.is_empty():
		var frame_index: int = mini(int(progress * _flash_textures.size()), _flash_textures.size() - 1)
		if frame_index != int(projectile.flash_frame):
			projectile.flash_frame = frame_index
			_flash_material.albedo_texture = _flash_textures[frame_index]
	var alpha: float = 1.0 if progress < 0.55 else (1.0 - progress) / 0.45
	_flash_material.albedo_color = Color(1.5 * alpha, 1.15 * alpha, 0.65 * alpha, alpha)


func _update_trail(projectile: Dictionary) -> void:
	var raw_ball: Variant = projectile.get("ball", null)
	var raw_trail: Variant = projectile.get("trail", null)
	if not is_instance_valid(raw_ball) or not is_instance_valid(raw_trail):
		return
	var ball := raw_ball as MeshInstance3D
	var trail := raw_trail as MeshInstance3D
	if ball == null or trail == null:
		return
	var travel: Vector3 = ball.global_position - (projectile.spawn_position as Vector3)
	if travel.length_squared() < 0.000004:
		trail.visible = false
		return
	var direction: Vector3 = travel.normalized()
	var trail_length: float = minf(travel.length(), TRAIL_LENGTH)
	var tail: Vector3 = ball.global_position - direction * trail_length
	var reference_axis := Vector3.UP if absf(direction.dot(Vector3.UP)) < 0.99 else Vector3.RIGHT
	var trail_x: Vector3 = reference_axis.cross(direction).normalized()
	var trail_z: Vector3 = trail_x.cross(direction).normalized()
	trail.global_transform = Transform3D(
		Basis(trail_x, direction * trail_length, trail_z),
		(tail + ball.global_position) * 0.5,
	)
	trail.visible = true


func _get_pooled_projectile() -> Dictionary:
	for projectile in _projectile_pool:
		if not bool(projectile.active):
			return projectile
	return {}


func _return_projectile(projectile: Dictionary) -> void:
	projectile.active = false
	projectile.target = null
	projectile.target_instance = 0
	projectile.hit_applied = false
	for visual_key: String in ["ball", "trail", "flash"]:
		var raw_visual: Variant = projectile.get(visual_key, null)
		if not is_instance_valid(raw_visual):
			continue
		var visual := raw_visual as MeshInstance3D
		if visual != null:
			visual.visible = false


func _build_projectile_pool() -> void:
	if _pool_ready or not is_inside_tree():
		return
	_prepare_shared_resources()
	_projectile_host = get_tree().current_scene
	if _projectile_host == null:
		_projectile_host = get_tree().root
	for pool_index in range(POOL_SIZE):
		var ball := MeshInstance3D.new()
		ball.name = "Cannonball_%d" % pool_index
		ball.mesh = _shared_ball_mesh
		ball.material_override = _shared_ball_material
		ball.visible = false
		_projectile_host.add_child(ball)

		var highlight := MeshInstance3D.new()
		highlight.name = "WarmHighlight"
		highlight.mesh = _shared_ball_highlight_mesh
		highlight.material_override = _shared_ball_highlight_material
		highlight.position = BALL_HIGHLIGHT_OFFSET
		highlight.visible = true
		ball.add_child(highlight)

		var trail := MeshInstance3D.new()
		trail.name = "CannonTrail_%d" % pool_index
		trail.mesh = _shared_trail_mesh
		trail.material_override = _shared_trail_material
		trail.visible = false
		_projectile_host.add_child(trail)

		var flash := MeshInstance3D.new()
		flash.name = "CannonMuzzleFlash_%d" % pool_index
		var flash_quad := QuadMesh.new()
		flash_quad.size = Vector2(FLASH_SCALE, FLASH_SCALE)
		flash.mesh = flash_quad
		flash.material_override = _flash_material
		flash.visible = false
		_projectile_host.add_child(flash)

		_projectile_pool.append({
			"active": false,
			"target": null,
			"target_instance": 0,
			"spawn_position": Vector3.ZERO,
			"hit_applied": false,
			"flash_timer": 0.0,
			"flash_frame": 0,
			"ball": ball,
			"highlight": highlight,
			"trail": trail,
			"flash": flash,
		})
	_pool_ready = true


func _prepare_shared_resources() -> void:
	if _shared_ball_mesh == null:
		_shared_ball_mesh = SphereMesh.new()
		_shared_ball_mesh.radius = BALL_RADIUS
		_shared_ball_mesh.height = BALL_RADIUS * 2.0
		_shared_ball_mesh.radial_segments = 8
		_shared_ball_mesh.rings = 4
	if _shared_ball_material == null:
		_shared_ball_material = StandardMaterial3D.new()
		# Match the Main Ship cannonball exactly: a clean, readable matte-black
		# silhouette without a brown or emissive tint.
		_shared_ball_material.albedo_color = Color(0.05, 0.05, 0.05, 1.0)
		_shared_ball_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if _shared_ball_highlight_mesh == null:
		_shared_ball_highlight_mesh = SphereMesh.new()
		_shared_ball_highlight_mesh.radius = BALL_HIGHLIGHT_RADIUS
		_shared_ball_highlight_mesh.height = BALL_HIGHLIGHT_RADIUS * 2.0
		_shared_ball_highlight_mesh.radial_segments = 6
		_shared_ball_highlight_mesh.rings = 3
	if _shared_ball_highlight_material == null:
		_shared_ball_highlight_material = StandardMaterial3D.new()
		_shared_ball_highlight_material.albedo_color = Color(0.16, 0.16, 0.16, 1.0)
		_shared_ball_highlight_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if _shared_trail_mesh == null:
		_shared_trail_mesh = CylinderMesh.new()
		_shared_trail_mesh.top_radius = TRAIL_RADIUS
		_shared_trail_mesh.bottom_radius = TRAIL_RADIUS
		_shared_trail_mesh.height = 1.0
		_shared_trail_mesh.radial_segments = 6
	if _shared_trail_material == null:
		_shared_trail_material = StandardMaterial3D.new()
		_shared_trail_material.albedo_color = Color(1.0, 0.47, 0.08, 0.82)
		_shared_trail_material.emission_enabled = true
		_shared_trail_material.emission = Color(1.0, 0.21, 0.025, 1.0)
		_shared_trail_material.emission_energy_multiplier = 2.6
		_shared_trail_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_shared_trail_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_shared_trail_material.cull_mode = BaseMaterial3D.CULL_DISABLED

	if not _flash_textures_loaded:
		_flash_textures_loaded = true
		for texture_path in MUZZLE_FLASH_FRAMES:
			var texture := load(texture_path) as Texture2D
			if texture != null:
				_flash_textures.append(texture)
	if _flash_material == null:
		_flash_material = StandardMaterial3D.new()
		_flash_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_flash_material.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		_flash_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_flash_material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		_flash_material.no_depth_test = true
		_flash_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		_flash_material.albedo_color = Color(1.5, 1.15, 0.65, 1.0)
		if not _flash_textures.is_empty():
			_flash_material.albedo_texture = _flash_textures[0]


func _get_warmup_visual_resources() -> Dictionary:
	_prepare_shared_resources()
	return {
		"ball_mesh": _shared_ball_mesh,
		"ball_material": _shared_ball_material,
		"highlight_mesh": _shared_ball_highlight_mesh,
		"highlight_material": _shared_ball_highlight_material,
		"trail_mesh": _shared_trail_mesh,
		"trail_material": _shared_trail_material,
		"flash_material": _flash_material,
		"flash_scale": FLASH_SCALE,
	}


func _setup_audio() -> void:
	if not _attack_sfx_loaded:
		_attack_sfx_loaded = true
		for sfx_path in ATTACK_SFX_PATHS:
			var stream := ResourceLoader.load(sfx_path) as AudioStream
			if stream != null:
				_attack_sfx_streams.append(stream)
	if _attack_sfx_player == null:
		_attack_sfx_player = AudioStreamPlayer.new()
		_attack_sfx_player.name = "CannonAttackSFX"
		_attack_sfx_player.volume_db = ATTACK_SFX_VOLUME_DB
		add_child(_attack_sfx_player)


func _play_attack_sfx() -> void:
	if not attack_sfx_enabled or _attack_sfx_player == null or _attack_sfx_streams.is_empty():
		return
	_attack_sfx_player.stop()
	_attack_sfx_player.stream = null
	_attack_sfx_player.stream = _attack_sfx_streams.pick_random()
	_attack_sfx_player.pitch_scale = randf_range(
		1.0 - ATTACK_SFX_PITCH_JITTER,
		1.0 + ATTACK_SFX_PITCH_JITTER,
	)
	_attack_sfx_player.play()


func _record_defense_telemetry(
	kind: String,
	target: Node3D,
	extra: Dictionary = {},
) -> void:
	var payload := {
		"defense_type": "cannon",
		"server_id": int(get_meta("server_id", -1)),
	}
	if is_instance_valid(target):
		payload["target_instance"] = int(target.get_instance_id())
		payload["target_x"] = snappedf(target.global_position.x, 0.001)
		payload["target_z"] = snappedf(target.global_position.z, 0.001)
		var target_hp: Variant = target.get("hp")
		if target_hp != null:
			payload["target_hp"] = int(target_hp)
		var target_level: Variant = target.get("level")
		if target_level != null:
			payload["target_level"] = int(target_level)
		if target.has_method("_get_troop_name"):
			var troop_name := str(target.call("_get_troop_name"))
			if troop_name != "":
				payload["target_troop"] = troop_name
	for key in extra:
		payload[key] = extra[key]
	for building_system in BaseTroop._get_building_systems_cached():
		if (
			is_instance_valid(building_system)
			and building_system.has_method("record_replay_telemetry")
		):
			building_system.call("record_replay_telemetry", kind, payload)
			return


func _exit_tree() -> void:
	if _attack_sfx_player != null:
		_attack_sfx_player.stop()
		_attack_sfx_player.stream = null
	for projectile in _projectile_pool:
		for node_key in ["ball", "trail", "flash"]:
			var pooled_node: Node = projectile.get(node_key, null)
			if is_instance_valid(pooled_node):
				pooled_node.queue_free()
	_projectile_pool.clear()
	_active_projectiles.clear()


func _find_node_by_name(node: Node, target_name: String) -> Node3D:
	if node.name == target_name and node is Node3D:
		return node as Node3D
	for child in node.get_children():
		var result := _find_node_by_name(child, target_name)
		if result != null:
			return result
	return null


func _ease_out_cubic(value: float) -> float:
	var inverse := 1.0 - clampf(value, 0.0, 1.0)
	return 1.0 - inverse * inverse * inverse


func _smoothstep(value: float) -> float:
	value = clampf(value, 0.0, 1.0)
	return value * value * (3.0 - 2.0 * value)
