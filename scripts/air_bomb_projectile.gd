class_name AirBombProjectile
extends Node3D

## Standalone fixed-tick Air Bomb projectile. It deliberately lives outside the
## defense node so a shot committed before the building is destroyed can finish.

signal completed(reason: String, impacted: bool)

const FIXED_DELTA: float = 1.0 / 60.0
const MAX_FIXED_STEPS_PER_FRAME: int = 8
const RISE_TICKS: int = 21
const MAX_HOMING_TICKS: int = 144
const PROJECTILE_SPEED: float = 1.19
const TURN_RADIANS_PER_TICK: float = deg_to_rad(4.0)
const HIT_RADIUS: float = 0.10
const TARGET_TIE_EPSILON: float = 0.000000001
const SPLASH_BOUNDARY_EPSILON: float = 0.000001
const RISE_HEIGHT: float = 0.34
const IMPACT_FX_LIFETIME_SECONDS: float = 0.24
const IMPACT_DEBRIS_COUNT: int = 5

const IMPACT_SFX_PATH: String = "res://Musik/sound_effects/Mortar/mortar_impact.mp3"
const IMPACT_CAMERA_TRAUMA: float = 0.35

var _target: Node3D = null
var _target_instance: int = 0
var _target_replay_order: int = -1
var _target_troop_name: String = ""
var _heading: Vector2 = Vector2.RIGHT
var _fixed_accumulator: float = 0.0
var _age_ticks: int = 0
var _damage: int = 1
var _splash_radius: float = 0.31
var _retarget_range: float = 0.0
var _building_server_id: int = -1
var _building_order: int = -1
var _building_level: int = 1
var _ammo_side: int = 0
var _launch_tick: int = -1
var _target_lost: bool = false
var _retarget_count: int = 0
var _finished: bool = false
var _visual_base_y: float = 0.0
var _last_splash_hits: Array[Dictionary] = []


func initialize(
	start_position: Vector3,
	target: Node3D,
	damage: int,
	splash_radius: float,
	retarget_range: float,
	building_server_id: int,
	building_order: int,
	building_level: int,
	ammo_side: int,
	launch_tick: int = -1
) -> void:
	global_position = start_position
	_visual_base_y = start_position.y
	_capture_target_identity(target)
	_damage = maxi(1, damage)
	_splash_radius = maxf(0.01, splash_radius)
	_retarget_range = maxf(0.0, retarget_range)
	_building_server_id = building_server_id
	_building_order = building_order
	_building_level = building_level
	_ammo_side = posmod(ammo_side, 2)
	_launch_tick = launch_tick
	if is_instance_valid(target):
		var delta := Vector2(
			target.global_position.x - start_position.x,
			target.global_position.z - start_position.z
		)
		if delta.length_squared() > TARGET_TIE_EPSILON:
			_heading = delta.normalized()
	_ensure_fallback_visual()
	set_physics_process(true)


func _physics_process(delta: float) -> void:
	if _finished:
		return
	var combat_delta := BaseTroop.combat_delta(delta)
	_fixed_accumulator = minf(
		_fixed_accumulator + combat_delta,
		FIXED_DELTA * float(MAX_FIXED_STEPS_PER_FRAME)
	)
	var steps := 0
	while _fixed_accumulator + 0.0000001 >= FIXED_DELTA and steps < MAX_FIXED_STEPS_PER_FRAME:
		_fixed_accumulator -= FIXED_DELTA
		_simulation_step()
		steps += 1
		if _finished:
			break


func _simulation_step() -> void:
	if not _is_homing_target_valid(_target):
		if not _retarget_or_finish():
			return

	_age_ticks += 1

	# One complete balloon-and-barrel assembly rises clear of the launcher before
	# horizontal homing begins. The lift is fixed-tick, not render-time authored.
	if _age_ticks <= RISE_TICKS:
		var rise_progress := float(_age_ticks) / float(RISE_TICKS)
		global_position.y = _visual_base_y + RISE_HEIGHT * smoothstep(0.0, 1.0, rise_progress)
		if _age_ticks == RISE_TICKS:
			_record_event("air_bomb_rise_complete", {
				"phase": "homing",
				"flightAgeTicks": 0,
			})
		return

	if _is_homing_target_valid(_target):
		var desired := Vector2(
			_target.global_position.x - global_position.x,
			_target.global_position.z - global_position.z
		)
		if desired.length_squared() > TARGET_TIE_EPSILON:
			var angle_delta := _heading.angle_to(desired.normalized())
			_heading = _heading.rotated(clampf(
				angle_delta,
				-TURN_RADIANS_PER_TICK,
				TURN_RADIANS_PER_TICK
			)).normalized()

	var from := Vector2(global_position.x, global_position.z)
	var to := from + _heading * (PROJECTILE_SPEED * FIXED_DELTA)
	global_position = Vector3(
		to.x,
		_visual_base_y + RISE_HEIGHT + sin(float(_age_ticks - RISE_TICKS) * 0.22) * 0.018,
		to.y
	)

	if _is_homing_target_valid(_target):
		var target_point := Vector2(_target.global_position.x, _target.global_position.z)
		if _point_segment_distance_sq(target_point, from, to) <= HIT_RADIUS * HIT_RADIUS:
			# Segment collision authors the tick; snap the blast center to the
			# intercepted target so the primary flyer receives center damage.
			global_position.x = target_point.x
			global_position.z = target_point.y
			_impact()
			return

	if _age_ticks - RISE_TICKS >= MAX_HOMING_TICKS:
		_finish("max_lifetime", false)


func cancel_without_impact(reason: String = "cancelled") -> void:
	_finish(reason, false)


func get_debug_snapshot() -> Dictionary:
	return {
		"age_ticks": _age_ticks,
		"phase": "rise" if _age_ticks <= RISE_TICKS else "homing",
		"homing_age_ticks": maxi(0, _age_ticks - RISE_TICKS),
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"target_lost": _target_lost,
		"retarget_count": _retarget_count,
		"retarget_range": _retarget_range,
		"damage": _damage,
		"splash_radius": _splash_radius,
		"heading": _heading,
		"position": global_position,
		"finished": _finished,
	}


func _is_homing_target_valid(candidate: Variant) -> bool:
	return (
		is_instance_valid(candidate)
		and candidate is Node3D
		and BaseTroop.can_defense_target_troop(candidate, false, true)
	)


func _retarget_or_finish() -> bool:
	var previous_target_instance := _target_instance
	var previous_target_replay_order := _target_replay_order
	var previous_target_troop_name := _target_troop_name
	_target_lost = true
	_record_event("air_bomb_target_lost", {
		"reason": "target_dead_or_invalid",
		"previousTargetTroopId": previous_target_instance,
		"previousTargetReplayOrder": previous_target_replay_order,
		"previousTargetTroop": previous_target_troop_name,
		"projectile_x": snappedf(global_position.x, 0.001),
		"projectile_z": snappedf(global_position.z, 0.001),
	})

	var replacement := _find_retarget_candidate()
	if replacement.is_empty():
		_finish("no_retarget_candidate", false)
		return false

	var candidate: Variant = replacement.get("target", null)
	if not (candidate is Node3D):
		_finish("no_retarget_candidate", false)
		return false
	_capture_target_identity(candidate as Node3D)
	_retarget_count += 1
	_record_event("air_bomb_retarget", {
		"reason": "target_dead_or_invalid",
		"previousTargetTroopId": previous_target_instance,
		"previousTargetReplayOrder": previous_target_replay_order,
		"previousTargetTroop": previous_target_troop_name,
		"retargetDistanceSq": snappedf(float(replacement.get("distance_sq", 0.0)), 0.000001),
	})
	return true


func _find_retarget_candidate() -> Dictionary:
	var best: Node3D = null
	var best_distance_sq := INF
	var best_order := 2147483647
	var best_instance := 9223372036854775807
	var range_sq := _retarget_range * _retarget_range
	var origin := Vector2(global_position.x, global_position.z)
	var troops: Array = BaseTroop._get_troops_cached()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	var snapshot_size := mini(troops.size(), positions.size())
	for index in snapshot_size:
		var candidate: Variant = troops[index]
		if not _is_homing_target_valid(candidate):
			continue
		var candidate_position: Vector3 = positions[index]
		var dx := origin.x - candidate_position.x
		var dz := origin.y - candidate_position.z
		var distance_sq := dx * dx + dz * dz
		if distance_sq > range_sq + TARGET_TIE_EPSILON:
			continue
		var order := BaseTroop._troop_order_key(candidate)
		var instance_id := int(candidate.get_instance_id())
		if (
			distance_sq < best_distance_sq - TARGET_TIE_EPSILON
			or (
				absf(distance_sq - best_distance_sq) <= TARGET_TIE_EPSILON
				and (order < best_order or (order == best_order and instance_id < best_instance))
			)
		):
			best = candidate as Node3D
			best_distance_sq = distance_sq
			best_order = order
			best_instance = instance_id
	if best == null:
		return {}
	return {
		"target": best,
		"distance_sq": best_distance_sq,
	}


func _capture_target_identity(candidate: Node3D) -> void:
	_target = candidate
	_target_instance = int(candidate.get_instance_id()) if is_instance_valid(candidate) else 0
	_target_replay_order = BaseTroop._troop_order_key(candidate) if is_instance_valid(candidate) else -1
	_target_troop_name = ""
	if is_instance_valid(candidate) and candidate.has_method("_get_troop_name"):
		_target_troop_name = str(candidate.call("_get_troop_name"))


func _impact() -> void:
	if _finished:
		return
	var impact_position := global_position
	_last_splash_hits.clear()
	var hit_count := _apply_air_splash(impact_position)
	_record_event("air_bomb_impact", {
		"damage": _damage,
		"hit_count": hit_count,
		"hitCount": hit_count,
		"impact_x": snappedf(impact_position.x, 0.001),
		"impact_z": snappedf(impact_position.z, 0.001),
		"impactX": snappedf(impact_position.x, 0.001),
		"impactZ": snappedf(impact_position.z, 0.001),
		"splash_radius": snappedf(_splash_radius, 0.001),
		"affectedUnits": _last_splash_hits.duplicate(true),
	})
	_spawn_impact_fx(impact_position)
	_play_impact_sfx(impact_position)
	_shake_camera_on_impact()
	_finish("impact", true)


func _shake_camera_on_impact() -> void:
	var scene_tree := get_tree()
	if scene_tree == null:
		return
	var camera_rig := scene_tree.get_first_node_in_group("camera_rigs")
	if camera_rig != null and camera_rig.has_method("add_trauma"):
		camera_rig.call("add_trauma", IMPACT_CAMERA_TRAUMA)


func _apply_air_splash(impact_position: Vector3) -> int:
	var candidates: Array[Dictionary] = []
	var troops: Array = BaseTroop._get_troops_cached().duplicate()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached().duplicate()
	var snapshot_size := mini(troops.size(), positions.size())
	for index in snapshot_size:
		var troop: Variant = troops[index]
		if not BaseTroop.is_live_troop(troop) or not BaseTroop.is_air_troop(troop):
			continue
		var troop_position: Vector3 = positions[index]
		var dx := impact_position.x - troop_position.x
		var dz := impact_position.z - troop_position.z
		var distance_sq := dx * dx + dz * dz
		# Match the server's linear-radius tolerance exactly before squaring.
		# Adding epsilon to radius squared would create a slightly wider client edge.
		var splash_boundary := _splash_radius + SPLASH_BOUNDARY_EPSILON
		if distance_sq > splash_boundary * splash_boundary:
			continue
		candidates.append({
			"troop": troop,
			"position": troop_position,
			"distance_sq": distance_sq,
			"order": BaseTroop._troop_order_key(troop),
			"instance": int(troop.get_instance_id()) if is_instance_valid(troop) else 0,
		})
	candidates.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		var left_order := int(left.get("order", 0))
		var right_order := int(right.get("order", 0))
		if left_order != right_order:
			return left_order < right_order
		return int(left.get("instance", 0)) < int(right.get("instance", 0))
	)

	var hit_count := 0
	for candidate in candidates:
		var troop: Variant = candidate.get("troop", null)
		# Acquisition respects untargetable states, but an explosion affects every
		# canonically flying live troop in the radius, matching server authority.
		if not BaseTroop.is_live_troop(troop) or not BaseTroop.is_air_troop(troop):
			continue
		var distance := sqrt(float(candidate.get("distance_sq", 0.0)))
		var distance_ratio := clampf(distance / _splash_radius, 0.0, 1.0)
		var multiplier := 1.0 - 0.5 * distance_ratio
		var hit_damage := maxi(1, ceili(float(_damage) * multiplier - 0.000000001))
		var hp_before := int(troop.get("hp")) if troop.get("hp") != null else 0
		if troop.has_method("take_damage"):
			troop.call("take_damage", hit_damage)
		var hp_after := hp_before - hit_damage
		if is_instance_valid(troop) and troop.get("hp") != null:
			hp_after = int(troop.get("hp"))
		hit_count += 1
		var hit_payload := {
			"hit_target_instance": int(candidate.get("instance", 0)),
			"hit_target_replay_order": int(candidate.get("order", -1)),
			"targetTroopId": int(candidate.get("instance", 0)),
			"replayOrder": int(candidate.get("order", -1)),
			"targetReplayOrder": int(candidate.get("order", -1)),
			"damage": hit_damage,
			"appliedDamage": hit_damage,
			"hp_before": hp_before,
			"hp_after": hp_after,
			"hpBefore": hp_before,
			"hpAfter": hp_after,
			"distance": snappedf(distance, 0.001),
			"multiplier": snappedf(multiplier, 0.001),
			"impact_x": snappedf(impact_position.x, 0.001),
			"impact_z": snappedf(impact_position.z, 0.001),
			"impactX": snappedf(impact_position.x, 0.001),
			"impactZ": snappedf(impact_position.z, 0.001),
			"x": snappedf((candidate.get("position", Vector3.ZERO) as Vector3).x, 0.001),
			"z": snappedf((candidate.get("position", Vector3.ZERO) as Vector3).z, 0.001),
		}
		_last_splash_hits.append(hit_payload.duplicate(true))
		_record_event("air_bomb_splash_hit", hit_payload)
	return hit_count


func _finish(reason: String, impacted: bool) -> void:
	if _finished:
		return
	_finished = true
	set_physics_process(false)
	_record_event("air_bomb_cleanup", {
		"reason": reason,
		"impacted": impacted,
		"targetLost": _target_lost,
		"retargetCount": _retarget_count,
		"retargetRange": snappedf(_retarget_range, 0.001),
		"age_ticks": _age_ticks,
		"projectile_x": snappedf(global_position.x, 0.001),
		"projectile_z": snappedf(global_position.z, 0.001),
	})
	completed.emit(reason, impacted)
	queue_free()


func _record_event(kind: String, extra: Dictionary = {}) -> void:
	var heading_radians := atan2(_heading.y, _heading.x)
	var payload := {
		"defense_type": "air_bomb",
		"defenseType": "air_bomb",
		"server_id": _building_server_id,
		"buildingId": _building_server_id,
		"building_order": _building_order,
		"buildingOrder": _building_order,
		"building_level": _building_level,
		"level": _building_level,
		"projectile_age_ticks": _age_ticks,
		"ageTicks": _age_ticks,
		"flightAgeTicks": maxi(0, _age_ticks - RISE_TICKS),
		"riseTicks": RISE_TICKS,
		"phase": "rise" if _age_ticks < RISE_TICKS else "homing",
		"projectileX": snappedf(global_position.x, 0.001),
		"projectileZ": snappedf(global_position.z, 0.001),
		"heading": snappedf(heading_radians, 0.000001),
		"target_instance": _target_instance,
		"targetTroopId": _target_instance,
		"target_replay_order": _target_replay_order,
		"targetReplayOrder": _target_replay_order,
		"replayOrder": _target_replay_order,
		"target_troop": _target_troop_name,
		"targetTroop": _target_troop_name,
		"retarget_count": _retarget_count,
		"retargetCount": _retarget_count,
		"retarget_range": snappedf(_retarget_range, 0.001),
		"retargetRange": snappedf(_retarget_range, 0.001),
		"ammo_side": _ammo_side,
		"ammoSide": 0,
		"launchTick": _launch_tick,
		"tick": _launch_tick + _age_ticks if _launch_tick >= 0 else _age_ticks,
		"damage": _damage,
		"splashRadius": _splash_radius,
	}
	for key in extra:
		payload[key] = extra[key]
	for building_system in BaseTroop._get_building_systems_cached():
		if is_instance_valid(building_system) and building_system.has_method("record_replay_telemetry"):
			building_system.call("record_replay_telemetry", kind, payload)
			break


func _point_segment_distance_sq(point: Vector2, segment_start: Vector2, segment_end: Vector2) -> float:
	var segment := segment_end - segment_start
	var length_sq := segment.length_squared()
	if length_sq <= TARGET_TIE_EPSILON:
		return point.distance_squared_to(segment_start)
	var ratio := clampf((point - segment_start).dot(segment) / length_sq, 0.0, 1.0)
	return point.distance_squared_to(segment_start + segment * ratio)


func _ensure_fallback_visual() -> void:
	if get_child_count() > 0:
		return
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "FallbackBalloonBomb"
	var mesh := SphereMesh.new()
	mesh.radius = 0.055
	mesh.height = 0.11
	mesh.radial_segments = 12
	mesh.rings = 6
	mesh_instance.mesh = mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.84, 0.28, 0.12, 1.0)
	material.roughness = 0.72
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _spawn_impact_fx(position: Vector3) -> void:
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	var fx := Node3D.new()
	fx.name = "AirBombImpactFx"
	fx.set_meta("air_bomb_effect_profile", "air_pressure")
	fx.set_meta("impact_color_profile", "yellow_energy")
	fx.set_meta("impact_radius", _splash_radius)
	fx.set_meta("lifetime_seconds", IMPACT_FX_LIFETIME_SECONDS)
	fx.set_meta("debris_count", IMPACT_DEBRIS_COUNT)
	scene_root.add_child(fx)
	fx.global_position = position

	var ring := MeshInstance3D.new()
	ring.name = "AirPressureRing"
	var ring_mesh := TorusMesh.new()
	var ring_width := minf(0.018, _splash_radius * 0.12)
	ring_mesh.inner_radius = maxf(0.001, _splash_radius - ring_width)
	ring_mesh.outer_radius = _splash_radius
	ring_mesh.rings = 32
	ring_mesh.ring_segments = 6
	ring.mesh = ring_mesh
	ring.material_override = _create_impact_material(
		Color(1.0, 0.86, 0.18, 0.72),
		Color(1.0, 0.72, 0.08, 1.0),
		1.8
	)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ring.position.y = 0.004
	ring.scale = Vector3.ONE * 0.22
	fx.add_child(ring)

	var flash := MeshInstance3D.new()
	flash.name = "AirPressureFlash"
	var flash_mesh := SphereMesh.new()
	flash_mesh.radius = minf(0.066, _splash_radius * 0.22)
	flash_mesh.height = flash_mesh.radius * 2.0
	flash_mesh.radial_segments = 12
	flash_mesh.rings = 6
	flash.mesh = flash_mesh
	flash.material_override = _create_impact_material(
		Color(1.0, 0.95, 0.42, 0.82),
		Color(1.0, 0.80, 0.12, 1.0),
		2.2
	)
	flash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	flash.scale = Vector3.ONE * 0.30
	fx.add_child(flash)

	var debris_mesh := BoxMesh.new()
	debris_mesh.size = Vector3(0.022, 0.012, 0.038)
	var debris_material := _create_impact_material(
		Color(0.96, 0.76, 0.14, 0.82),
		Color(0.88, 0.58, 0.05, 1.0),
		0.65
	)
	var debris_nodes: Array[MeshInstance3D] = []
	var debris_end_positions: Array[Vector3] = []
	for debris_index in range(IMPACT_DEBRIS_COUNT):
		var angle := TAU * float(debris_index) / float(IMPACT_DEBRIS_COUNT) + 0.21
		var direction := Vector3(cos(angle), 0.0, sin(angle))
		var travel_distance := _splash_radius * (0.35 + float(debris_index) * 0.035)
		var debris := MeshInstance3D.new()
		debris.name = "AirPressureDebris%02d" % debris_index
		debris.mesh = debris_mesh
		debris.material_override = debris_material
		debris.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		debris.position = Vector3.UP * 0.008
		debris.rotation = Vector3(0.18 * float(debris_index), -angle, 0.12)
		fx.add_child(debris)
		debris_nodes.append(debris)
		debris_end_positions.append(
			direction * travel_distance
			+ Vector3.UP * (0.032 + 0.006 * float(debris_index % 3))
		)

	var ring_tween := fx.create_tween().set_parallel(true)
	ring_tween.tween_property(ring, "scale", Vector3.ONE, 0.20).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	ring_tween.tween_property(ring, "transparency", 1.0, 0.19).set_delay(0.05)

	var flash_tween := fx.create_tween()
	flash_tween.tween_property(flash, "scale", Vector3.ONE, 0.055).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	flash_tween.parallel().tween_property(flash, "transparency", 0.12, 0.055)
	flash_tween.tween_property(flash, "scale", Vector3.ONE * 0.18, 0.095).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	flash_tween.parallel().tween_property(flash, "transparency", 1.0, 0.095)

	var debris_tween := fx.create_tween().set_parallel(true)
	for debris_index in range(debris_nodes.size()):
		var debris := debris_nodes[debris_index]
		debris_tween.tween_property(
			debris,
			"position",
			debris_end_positions[debris_index],
			0.20
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		debris_tween.tween_property(debris, "transparency", 1.0, 0.16).set_delay(0.06)

	var cleanup_tween := fx.create_tween()
	cleanup_tween.tween_interval(IMPACT_FX_LIFETIME_SECONDS)
	cleanup_tween.tween_callback(Callable(fx, "queue_free"))


func _create_impact_material(
	albedo: Color,
	emission: Color,
	emission_energy: float,
) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = albedo
	material.emission_enabled = true
	material.emission = emission
	material.emission_energy_multiplier = emission_energy
	return material


func _play_impact_sfx(position: Vector3) -> void:
	if not ResourceLoader.exists(IMPACT_SFX_PATH, "AudioStream"):
		return
	var scene_root := get_tree().current_scene
	if scene_root == null:
		return
	var player := AudioStreamPlayer3D.new()
	player.stream = load(IMPACT_SFX_PATH) as AudioStream
	player.volume_db = -2.0
	player.max_distance = 14.0
	scene_root.add_child(player)
	player.global_position = position
	player.finished.connect(Callable(player, "queue_free"))
	player.play()
