class_name TowerAirBomb
extends Node3D

## TH9 air-only splash defense. One homing projectile can be committed at a
## time; launches and reloads are fixed-tick and independent of render FPS.

signal air_bomb_event(kind: String, payload: Dictionary)

const LEVEL_STATS: Dictionary = {
	1: {"damage": 140, "detect_range": 2.25},
	2: {"damage": 220, "detect_range": 2.30},
	3: {"damage": 330, "detect_range": 2.35},
	4: {"damage": 480, "detect_range": 2.40},
	5: {"damage": 680, "detect_range": 2.45},
	6: {"damage": 920, "detect_range": 2.50},
	7: {"damage": 1200, "detect_range": 2.55},
	8: {"damage": 1520, "detect_range": 2.60},
	9: {"damage": 1880, "detect_range": 2.65},
}

const FIXED_DELTA: float = 1.0 / 60.0
const MAX_FIXED_STEPS_PER_FRAME: int = 8
const TARGET_SCAN_TICKS: int = 9
const RELOAD_TICKS: int = 270
const SPLASH_RADIUS: float = 0.31
const TARGET_TIE_EPSILON: float = 0.000000001
const LAUNCH_SFX_PATH: String = "res://Musik/sound_effects/Mortar/mortar_launch.mp3"
const PROJECTILE_SCRIPT: Script = preload("res://scripts/air_bomb_projectile.gd")

var level: int = 1
var damage: int = 140
var ward_bonus_pct: int = 0
var detect_range: float = 2.25

var _sim_tick: int = -1
var _next_scan_tick: int = 0
var _reload_ready_tick: int = 0
var _reload_ready_emitted: bool = true
var _last_fire_tick: int = -1
var _fixed_accumulator: float = 0.0
var _freeze_remaining_ticks: int = 0
var _freeze_started_frame: int = -1
var _permanently_disabled: bool = false
var _target: Node3D = null
var _target_instance: int = 0
var _target_replay_order: int = -1
var _target_troop_name: String = ""
var _owner_order: int = 0
var _next_ammo_side: int = 0 # compatibility key; the single assembly is always side 0
var _active_projectile: WeakRef = null
var _visual_controller: Node = null
var _launch_sfx_player: AudioStreamPlayer3D = null
var _spawn_facing_global: Vector3 = Vector3.ZERO
var _has_spawn_facing: bool = false
var _last_spawn_facing_origin: Vector3 = Vector3.ZERO
var _has_last_spawn_facing_origin: bool = false
var _spawn_facing_refresh_queued: bool = false


func _ready() -> void:
	set_notify_transform(true)
	process_physics_priority = -10
	_owner_order = _stable_owner_order()
	_apply_stats()
	_setup_launch_sfx()
	call_deferred("_bind_visual_controller")


func _notification(what: int) -> void:
	if (
		what != NOTIFICATION_TRANSFORM_CHANGED
		or not _has_spawn_facing
		or _spawn_facing_refresh_queued
		or not is_inside_tree()
	):
		return
	_spawn_facing_refresh_queued = true
	call_deferred("_refresh_spawn_facing_after_transform")


func set_level(value: int) -> void:
	level = clampi(value, 1, LEVEL_STATS.size())
	_apply_stats()
	call_deferred("_bind_visual_controller")


func set_ward_bonus_pct(value: int) -> void:
	ward_bonus_pct = maxi(0, value)
	_apply_stats()


func freeze_for(duration: float) -> void:
	var requested_ticks := ceili(maxf(0.0, duration) / FIXED_DELTA)
	_freeze_remaining_ticks = maxi(_freeze_remaining_ticks, requested_ticks)
	_freeze_started_frame = Engine.get_physics_frames()


func set_range_visuals_visible(_should_be_visible: bool) -> void:
	# BuildingSystem draws the shared selection ring from `detect_range`.
	pass


## BuildingSystem supplies the real shipPlane center for every defense. Air Bomb
## keeps its launcher fixed and uses this heading only to present the owner logo.
func set_spawn_facing_global(target_global_position: Vector3) -> void:
	if not target_global_position.is_finite():
		return
	_spawn_facing_global = target_global_position
	_has_spawn_facing = true
	_has_last_spawn_facing_origin = false
	_apply_spawn_facing_to_visual()


func _play_victory() -> void:
	_target = null
	_cancel_active_projectile("victory")
	if is_instance_valid(_launch_sfx_player):
		_launch_sfx_player.stop()


func cleanup_defense_visuals() -> void:
	if is_instance_valid(_launch_sfx_player):
		_launch_sfx_player.queue_free()
	_launch_sfx_player = null


func _exit_tree() -> void:
	# Do not cancel a detached committed projectile when this defense is destroyed.
	cleanup_defense_visuals()


func _apply_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = maxi(1, ceili(float(stats.damage) * (1.0 + float(ward_bonus_pct) / 100.0)))
	detect_range = float(stats.detect_range)


func _physics_process(delta: float) -> void:
	if _permanently_disabled:
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


func _simulation_step() -> void:
	_sim_tick += 1
	var frozen_now := _freeze_remaining_ticks > 0
	if _sim_tick >= _next_scan_tick:
		_next_scan_tick = _sim_tick + TARGET_SCAN_TICKS
		# Match the server's absolute scan edges: Freeze consumes the edge but
		# deliberately retains the last acquired target until it can be validated.
		if not frozen_now:
			_scan_for_target()
	elif not _is_tracking_target_valid(_target):
		_clear_target_identity()

	if (
		_last_fire_tick >= 0
		and not _reload_ready_emitted
		and _sim_tick >= _reload_ready_tick
	):
		_reload_ready_emitted = true
		_record_event("air_bomb_reload_ready", {
			"launch_tick": _last_fire_tick,
			"launchTick": _last_fire_tick,
			"reload_ready_tick": _reload_ready_tick,
			"reloadReadyTick": _reload_ready_tick,
			"ammo_side": _next_ammo_side,
			"ammoSide": 0,
		})

	if frozen_now:
		if Engine.get_physics_frames() > _freeze_started_frame:
			_freeze_remaining_ticks -= 1
		_update_reload_visual()
		return

	_update_reload_visual()
	if _sim_tick < _reload_ready_tick or _has_active_projectile():
		return
	if not _is_tracking_target_valid(_target):
		return
	_fire_at_target(_target)


func _scan_for_target() -> void:
	var best: Node3D = null
	var best_distance_sq := detect_range * detect_range
	var best_order := 2147483647
	var best_instance := 2147483647
	var origin := global_position
	var troops: Array = BaseTroop._get_troops_cached()
	var positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	var snapshot_size := mini(troops.size(), positions.size())
	for index in snapshot_size:
		var candidate: Variant = troops[index]
		if not BaseTroop.can_defense_target_troop(candidate, false, true):
			continue
		var position: Vector3 = positions[index]
		var dx := origin.x - position.x
		var dz := origin.z - position.z
		var distance_sq := dx * dx + dz * dz
		if distance_sq > detect_range * detect_range + TARGET_TIE_EPSILON:
			continue
		var order := BaseTroop._troop_order_key(candidate)
		var instance_id := int(candidate.get_instance_id()) if is_instance_valid(candidate) else 0
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
		_clear_target_identity()
		return
	_capture_target_identity(best)


func _is_tracking_target_valid(candidate: Variant) -> bool:
	if not is_instance_valid(candidate) or not (candidate is Node3D):
		return false
	if not BaseTroop.can_defense_target_troop(candidate, false, true):
		return false
	var dx: float = global_position.x - float(candidate.global_position.x)
	var dz: float = global_position.z - float(candidate.global_position.z)
	return dx * dx + dz * dz <= detect_range * detect_range + TARGET_TIE_EPSILON


func _fire_at_target(target: Node3D) -> void:
	if not _is_tracking_target_valid(target):
		return
	var ammo_side := 0
	var visual_muzzle_position := _muzzle_global_position(ammo_side, target.global_position)
	# Authoritative XZ begins at the defense center on both Godot and server.
	# The child visual starts at the authored muzzle and eases onto that route.
	var start_position := Vector3(global_position.x, visual_muzzle_position.y, global_position.z)
	var projectile := Node3D.new()
	projectile.name = "AirBombProjectile"
	projectile.set_script(PROJECTILE_SCRIPT)
	var scene_root := get_tree().current_scene
	if scene_root == null:
		scene_root = self
	scene_root.add_child(projectile)
	var projectile_visual := _create_projectile_visual(ammo_side)
	if is_instance_valid(projectile_visual):
		if projectile_visual.get_parent() != null:
			projectile_visual.reparent(projectile, true)
		else:
			projectile.add_child(projectile_visual)
		projectile_visual.position = Vector3.ZERO
	projectile.call(
		"initialize",
		start_position,
		target,
		damage,
		SPLASH_RADIUS,
		detect_range,
		int(get_meta("server_id", -1)),
		_owner_order,
		level,
		ammo_side,
		_sim_tick
	)
	if is_instance_valid(projectile_visual):
		projectile_visual.global_position = visual_muzzle_position
		var launch_tween := projectile.create_tween()
		launch_tween.tween_property(
			projectile_visual,
			"position",
			Vector3.ZERO,
			0.12
		).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	projectile.connect("completed", Callable(self, "_on_projectile_completed"))
	_active_projectile = weakref(projectile)
	_last_fire_tick = _sim_tick
	_reload_ready_tick = _sim_tick + RELOAD_TICKS
	_reload_ready_emitted = false
	_set_ammo_loaded(ammo_side, false)
	_next_ammo_side = 0
	_play_launch_sfx()
	_record_event("air_bomb_fire", {
		"fire_tick": _sim_tick,
		"launchTick": _sim_tick,
		"reload_ready_tick": _reload_ready_tick,
		"reloadReadyTick": _reload_ready_tick,
		"damage": damage,
		"detect_range": snappedf(detect_range, 0.001),
		"range": snappedf(detect_range, 0.001),
		"splash_radius": SPLASH_RADIUS,
		"splashRadius": SPLASH_RADIUS,
		"projectile_x": snappedf(start_position.x, 0.001),
		"projectile_z": snappedf(start_position.z, 0.001),
		"ammo_side": ammo_side,
		"ammoSide": 0,
		"phase": "rise",
		"riseTicks": PROJECTILE_SCRIPT.RISE_TICKS,
		"ageTicks": 0,
		"flightAgeTicks": 0,
	})


func _on_projectile_completed(_reason: String, _impacted: bool) -> void:
	_active_projectile = null
	_next_scan_tick = mini(_next_scan_tick, _sim_tick)


func _has_active_projectile() -> bool:
	return _active_projectile != null and is_instance_valid(_active_projectile.get_ref())


func _cancel_active_projectile(reason: String) -> void:
	if not _has_active_projectile():
		_active_projectile = null
		return
	var projectile: Node = _active_projectile.get_ref()
	if projectile.has_method("cancel_without_impact"):
		projectile.call("cancel_without_impact", reason)
	_active_projectile = null


func _capture_target_identity(candidate: Node3D) -> void:
	_target = candidate
	_target_instance = int(candidate.get_instance_id())
	_target_replay_order = BaseTroop._troop_order_key(candidate)
	_target_troop_name = ""
	if candidate.has_method("_get_troop_name"):
		_target_troop_name = str(candidate.call("_get_troop_name"))


func _clear_target_identity() -> void:
	_target = null
	_target_instance = 0
	_target_replay_order = -1
	_target_troop_name = ""


func _stable_owner_order() -> int:
	var server_id := int(get_meta("server_id", -1))
	if server_id >= 0:
		return server_id
	if has_meta("defender_order"):
		return int(get_meta("defender_order"))
	var x_key := roundi(global_position.x * 1000.0) + 100000
	var z_key := roundi(global_position.z * 1000.0) + 100000
	return z_key * 200001 + x_key


func _record_event(kind: String, extra: Dictionary = {}) -> void:
	var payload := {
		"defense_type": "air_bomb",
		"defenseType": "air_bomb",
		"server_id": int(get_meta("server_id", -1)),
		"buildingId": int(get_meta("server_id", -1)),
		"building_order": _owner_order,
		"buildingOrder": _owner_order,
		"building_level": level,
		"level": level,
		"tick": _sim_tick,
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"targetReplayOrder": _target_replay_order,
		"replayOrder": _target_replay_order,
		"target_troop": _target_troop_name,
		"targetTroop": _target_troop_name,
	}
	for key in extra:
		payload[key] = extra[key]
	air_bomb_event.emit(kind, payload)
	for building_system in BaseTroop._get_building_systems_cached():
		if is_instance_valid(building_system) and building_system.has_method("record_replay_telemetry"):
			building_system.call("record_replay_telemetry", kind, payload)
			break


func _bind_visual_controller() -> void:
	_visual_controller = _find_visual_controller(self)
	if is_instance_valid(_visual_controller):
		_apply_spawn_facing_to_visual()
		if _visual_controller.has_method("reset_visual_state"):
			_visual_controller.call("reset_visual_state")
		_set_ammo_loaded(0, _sim_tick >= _reload_ready_tick)


func _apply_spawn_facing_to_visual() -> void:
	if (
		not _has_spawn_facing
		or not is_instance_valid(_visual_controller)
		or not _visual_controller.has_method("set_attack_zone_facing_global")
	):
		return
	_visual_controller.call("set_attack_zone_facing_global", _spawn_facing_global)
	_last_spawn_facing_origin = global_position
	_has_last_spawn_facing_origin = true


func _refresh_spawn_facing_after_transform() -> void:
	_spawn_facing_refresh_queued = false
	if not _has_spawn_facing or not is_inside_tree():
		return
	if (
		_has_last_spawn_facing_origin
		and global_position.distance_squared_to(_last_spawn_facing_origin) <= 0.00000001
	):
		return
	_apply_spawn_facing_to_visual()


func _find_visual_controller(root: Node) -> Node:
	for child in root.get_children():
		if child.has_method("create_projectile_visual") and child.has_method("set_ammo_loaded"):
			return child
		var nested := _find_visual_controller(child)
		if nested != null:
			return nested
	return null


func _create_projectile_visual(ammo_side: int) -> Node3D:
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("create_projectile_visual"):
		var visual: Variant = _visual_controller.call("create_projectile_visual", ammo_side)
		if visual is Node3D:
			return visual as Node3D
	return null


func _muzzle_global_position(ammo_side: int, target_position: Vector3) -> Vector3:
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("get_muzzle_global_position"):
		var visual_position: Variant = _visual_controller.call("get_muzzle_global_position", ammo_side)
		if visual_position is Vector3:
			return visual_position
	var direction := target_position - global_position
	direction.y = 0.0
	if direction.length_squared() <= TARGET_TIE_EPSILON:
		direction = Vector3.FORWARD
	else:
		direction = direction.normalized()
	return global_position + Vector3(0.0, 0.48, 0.0) + direction * 0.12


func _set_ammo_loaded(ammo_side: int, loaded: bool) -> void:
	if is_instance_valid(_visual_controller) and _visual_controller.has_method("set_ammo_loaded"):
		_visual_controller.call("set_ammo_loaded", ammo_side, loaded)


func _update_reload_visual() -> void:
	if not is_instance_valid(_visual_controller):
		return
	var remaining := maxi(0, _reload_ready_tick - _sim_tick)
	var progress := 1.0 - float(remaining) / float(RELOAD_TICKS)
	if _reload_ready_tick <= 0:
		progress = 1.0
	if _visual_controller.has_method("set_reload_progress"):
		_visual_controller.call("set_reload_progress", 0, clampf(progress, 0.0, 1.0))
	if remaining <= 0:
		_set_ammo_loaded(0, true)


func _setup_launch_sfx() -> void:
	if not ResourceLoader.exists(LAUNCH_SFX_PATH, "AudioStream"):
		return
	_launch_sfx_player = AudioStreamPlayer3D.new()
	_launch_sfx_player.name = "AirBombLaunchSfx"
	_launch_sfx_player.stream = load(LAUNCH_SFX_PATH) as AudioStream
	_launch_sfx_player.volume_db = -5.0
	_launch_sfx_player.max_distance = 14.0
	add_child(_launch_sfx_player)


func _play_launch_sfx() -> void:
	if not is_instance_valid(_launch_sfx_player):
		return
	_launch_sfx_player.pitch_scale = 0.96 + float(posmod(_owner_order + _last_fire_tick, 7)) * 0.01
	_launch_sfx_player.play()


func get_debug_snapshot() -> Dictionary:
	var projectile_snapshot: Dictionary = {}
	if _has_active_projectile():
		var projectile: Node = _active_projectile.get_ref()
		if projectile.has_method("get_debug_snapshot"):
			projectile_snapshot = projectile.call("get_debug_snapshot")
	return {
		"tick": _sim_tick,
		"level": level,
		"damage": damage,
		"detect_range": detect_range,
		"last_fire_tick": _last_fire_tick,
		"reload_ready_tick": _reload_ready_tick,
		"reload_remaining_ticks": maxi(0, _reload_ready_tick - _sim_tick),
		"freeze_remaining_ticks": _freeze_remaining_ticks,
		"target_instance": _target_instance,
		"target_replay_order": _target_replay_order,
		"next_ammo_side": _next_ammo_side,
		"projectile": projectile_snapshot,
	}
