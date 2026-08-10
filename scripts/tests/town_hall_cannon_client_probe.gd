extends SceneTree
## Deterministic contract for the TH10 alternating Cannon controller.

const CONTROLLER_SCRIPT: Script = preload("res://scripts/town_hall_cannon.gd")
const TH10_MODEL: PackedScene = preload("res://Model/Town_Hall/Town Hall Level 10.glb")


class ProbeTroop extends Node3D:
	var hp: int = 20000
	var unit_target_type: String = BaseTroop.UNIT_TARGET_GROUND
	var _is_dead: bool = false

	func take_damage(amount: int) -> void:
		hp = maxi(0, hp - amount)
		_is_dead = hp <= 0

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0

	func _get_troop_name() -> String:
		return str(name)


class ProbeBuildingSystem extends Node:
	var events: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		events.append({"kind": kind, "payload": payload.duplicate(true)})


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	_probe_building_system_attachment(failures)
	await _probe_inactive_before_th10(failures)
	await _probe_tracking_recoil_alternation_and_damage(failures)
	BaseTroop.reset_combat_runtime_cache()
	await process_frame
	await process_frame
	if failures.is_empty():
		print("TOWN_HALL_CANNON_CLIENT_PROBE_PASS")
		quit(0)
	else:
		for failure in failures:
			push_error("TOWN_HALL_CANNON_CLIENT_PROBE_FAIL: " + failure)
		quit(1)


func _probe_building_system_attachment(failures: Array[String]) -> void:
	var building_system := BuildingSystem.new()
	var town_hall := Node3D.new()
	building_system.call("_attach_building_defense_script", town_hall, "town_hall")
	_expect(
		town_hall.get_script() == CONTROLLER_SCRIPT,
		"BuildingSystem attaches the TH10 Cannon controller to Town Hall roots",
		failures,
	)
	_expect(
		CombatFreeze.is_priority_defense("town_hall", 10)
		and CombatFreeze.is_freezable_defense("town_hall", 10),
		"Ice Golem recognizes TH10 as a normal defense",
		failures,
	)
	_expect(
		not CombatFreeze.is_priority_defense("town_hall", 9)
		and not CombatFreeze.is_freezable_defense("town_hall", 9),
		"Ice Golem does not treat pre-TH10 Town Halls as defenses",
		failures,
	)
	town_hall.free()
	building_system.free()


func _probe_inactive_before_th10(failures: Array[String]) -> void:
	var fixture := Node3D.new()
	root.add_child(fixture)
	var town_hall := _make_town_hall(9)
	fixture.add_child(town_hall)
	await process_frame
	var snapshot: Dictionary = town_hall.call("get_debug_snapshot")
	_expect(not bool(snapshot.active), "Town Hall L9 cannon remains inactive", failures)
	_expect(int(snapshot.barrel_count) == 0, "Town Hall L9 does not bind TH10 barrels", failures)
	fixture.free()
	await process_frame


func _probe_tracking_recoil_alternation_and_damage(failures: Array[String]) -> void:
	BaseTroop.reset_combat_runtime_cache()
	var fixture := Node3D.new()
	root.add_child(fixture)
	var telemetry := ProbeBuildingSystem.new()
	telemetry.add_to_group("building_systems")
	fixture.add_child(telemetry)

	var town_hall := _make_town_hall(10)
	town_hall.set_meta("server_id", 1010)
	fixture.add_child(town_hall)
	var ground := ProbeTroop.new()
	ground.name = "GroundProbe"
	ground.position = Vector3(0.25, 0.0, 0.42)
	ground.set_meta("replay_order", 1)
	ground.add_to_group("troops")
	fixture.add_child(ground)
	var air := ProbeTroop.new()
	air.name = "AirProbe"
	air.unit_target_type = BaseTroop.UNIT_TARGET_AIR
	air.position = Vector3(0.0, 0.45, 0.75)
	air.set_meta("replay_order", 0)
	air.add_to_group("troops")
	fixture.add_child(air)

	await process_frame
	await process_frame
	BaseTroop.invalidate_combat_lists()
	var initial: Dictionary = town_hall.call("get_debug_snapshot")
	_expect(bool(initial.active), "Town Hall L10 cannon activates", failures)
	_expect(int(initial.barrel_count) == 1, "only the retained TH10 barrel binds", failures)
	var removed_barrel := town_hall.find_child("Cannon2_001", true, false) as Node3D
	var removed_base := town_hall.find_child("Cannon2Base_002", true, false) as Node3D
	_expect(
		removed_barrel != null and not removed_barrel.visible
		and removed_base != null and not removed_base.visible,
		"second cannon barrel and base are removed from production visuals",
		failures,
	)
	_expect(int(town_hall.damage) == 840, "TH10 cannon mirrors ordinary Cannon L10 damage", failures)
	_expect(is_equal_approx(float(town_hall.fire_rate), 1.60), "TH10 cannon mirrors ordinary cadence", failures)

	town_hall.call("set_spawn_facing_global", Vector3(-1.0, 0.0, -0.2))
	await process_frame
	var facing_snapshot: Dictionary = town_hall.call("get_debug_snapshot")
	var facing_yaws: Array = facing_snapshot.get("barrel_yaws", [])
	var facing_pitches: Array = facing_snapshot.get("barrel_pitches", [])
	_expect(facing_yaws.size() == 1, "spawn facing resolves the retained barrel yaw", failures)
	_expect(facing_pitches.size() == 1, "spawn facing resolves the retained barrel pitch", failures)
	var initial_yaw := float(facing_yaws[0]) if not facing_yaws.is_empty() else 0.0
	var initial_pitch := float(facing_pitches[0]) if not facing_pitches.is_empty() else 0.0

	var yaw_pivots: Array[Node3D] = []
	var pitch_pivots: Array[Node3D] = []
	for pivot_name in ["TownHallCannonPivot1"]:
		var pivot := town_hall.find_child(pivot_name, true, false) as Node3D
		if pivot != null:
			yaw_pivots.append(pivot)
	for pivot_name in ["TownHallCannonPitchPivot1"]:
		var pivot := town_hall.find_child(pivot_name, true, false) as Node3D
		if pivot != null:
			pitch_pivots.append(pivot)
	_expect(yaw_pivots.size() == 1, "runtime yaw pivot exists at the retained Cannon origin", failures)
	_expect(pitch_pivots.size() == 1, "runtime pitch pivot exists inside the yaw rig", failures)
	var retained_barrel := town_hall.find_child("Cannon1_001", true, false) as Node3D
	var retained_base := town_hall.find_child("Cannon1Base_001", true, false) as Node3D
	var retained_base_rest := retained_base.transform if retained_base != null else Transform3D.IDENTITY
	if not yaw_pivots.is_empty() and not pitch_pivots.is_empty():
		_expect(
			retained_base != null and yaw_pivots[0].get_parent() == retained_base,
			"horizontal yaw pivot is nested under the fixed Cannon base",
			failures,
		)
		_expect(
			retained_barrel != null and retained_barrel.get_parent() == pitch_pivots[0],
			"barrel uses the nested vertical pitch pivot",
			failures,
		)
	var saw_recoil := false
	var saw_yaw_tracking := false
	var saw_close_target_pitch := false
	var saw_aligned_aim := false
	var rest_origins: Array[Vector3] = []
	for pivot in pitch_pivots:
		rest_origins.append(pivot.position)

	for _tick in range(300):
		town_hall.call("_physics_process", 1.0 / 60.0)
		var snapshot: Dictionary = town_hall.call("get_debug_snapshot")
		var yaws: Array = snapshot.get("barrel_yaws", [])
		var pitches: Array = snapshot.get("barrel_pitches", [])
		if not yaws.is_empty():
			saw_yaw_tracking = saw_yaw_tracking or absf(angle_difference(initial_yaw, float(yaws[0]))) > deg_to_rad(10.0)
		if not pitches.is_empty():
			saw_close_target_pitch = saw_close_target_pitch or float(pitches[0]) > maxf(
				initial_pitch + deg_to_rad(3.0),
				deg_to_rad(8.0),
			)
		saw_aligned_aim = saw_aligned_aim or float(snapshot.get("aim_error", INF)) <= deg_to_rad(5.0)
		if bool(snapshot.presentation_active) and float(snapshot.presentation_elapsed) >= 0.13:
			var active_index := int(snapshot.presentation_barrel_index)
			if pitch_pivots.size() == 1:
				saw_recoil = saw_recoil or (
					pitch_pivots[active_index].position.distance_to(rest_origins[active_index]) > 0.04
				)
		await process_frame

	var fire_events := telemetry.events.filter(func(event: Dictionary) -> bool:
		return str(event.get("kind", "")) == "defense_fire"
	)
	var hit_events := telemetry.events.filter(func(event: Dictionary) -> bool:
		return str(event.get("kind", "")) == "defense_projectile_hit"
	)
	_expect(fire_events.size() >= 2, "TH10 sustains ordinary Cannon fire", failures)
	if fire_events.size() >= 2:
		_expect(
			int(fire_events[0].payload.get("barrel_index", -1)) == 0
			and int(fire_events[1].payload.get("barrel_index", -1)) == 0,
			"successive shots remain on the single retained barrel",
			failures,
		)
	_expect(hit_events.size() >= 2, "cannonballs travel and hit the ground target", failures)
	_expect(ground.hp <= 20000 - 1680, "two L10 hits apply exactly one Cannon damage each", failures)
	_expect(air.hp == 20000, "TH10 cannon ignores the nearer air target", failures)
	_expect(saw_yaw_tracking, "retained Cannon barrel turns horizontally toward the acquired target", failures)
	_expect(saw_close_target_pitch, "barrel tilts down toward a close ground target", failures)
	_expect(saw_aligned_aim, "yaw and pitch both settle inside the firing tolerance", failures)
	_expect(saw_recoil, "active barrel reaches the ordinary Cannon recoil keyframe", failures)
	_expect(
		retained_base != null and retained_base.transform.is_equal_approx(retained_base_rest),
		"fixed Cannon base never moves with yaw, pitch, or recoil",
		failures,
	)
	town_hall.call("cleanup_defense_visuals")
	var cleaned: Dictionary = town_hall.call("get_debug_snapshot")
	_expect(int(cleaned.active_projectiles) == 0, "cleanup removes in-flight cannonballs", failures)
	fixture.free()
	await process_frame
	await process_frame
	BaseTroop.reset_combat_runtime_cache()


func _make_town_hall(level: int) -> Node3D:
	var town_hall := Node3D.new()
	town_hall.name = "TownHallRuntime"
	town_hall.set_script(CONTROLLER_SCRIPT)
	town_hall.attack_sfx_enabled = false
	town_hall.process_mode = Node.PROCESS_MODE_DISABLED
	var visual := TH10_MODEL.instantiate() as Node3D
	visual.scale = Vector3.ONE * 0.05
	visual.set_meta("building_visual_model", true)
	town_hall.add_child(visual)
	town_hall.call("set_level", level)
	return town_hall


func _expect(condition: bool, message: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(message)
