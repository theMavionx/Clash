extends SceneTree
## Focused headless contract check for scripts/tower_harpoon.gd.

const HarpoonScript := preload("res://scripts/tower_harpoon.gd")
const DT: float = 1.0 / 60.0


class ProbeTroop extends BaseTroop:
	var probe_name: String = "probe"

	func _init_stats() -> void:
		hp = 1000
		damage = 1
		atk_speed = 1.0
		move_speed = 0.5
		attack_range = 0.2

	func _get_troop_name() -> String:
		return probe_name


class ProbeAttackSystem extends Node3D:
	var grid_plane_path: NodePath = NodePath("../Island/shipPlane")


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	var fixture := Node3D.new()
	fixture.name = "HarpoonClientProbe"
	root.add_child(fixture)

	var ground := _make_troop("ground_probe", BaseTroop.UNIT_TARGET_GROUND, Vector3(0.8, 0.0, 0.0), 1)
	var air := _make_troop("air_probe", BaseTroop.UNIT_TARGET_AIR, Vector3(1.5, 0.42, 0.0), 2)
	fixture.add_child(ground)
	fixture.add_child(air)
	ground.state = BaseTroop.State.RUNNING
	air.state = BaseTroop.State.RUNNING

	var tower: Variant = Node3D.new()
	tower.name = "HarpoonProbeTower"
	tower.set_meta("server_id", 100)
	tower.set_script(HarpoonScript)
	fixture.add_child(tower)
	tower.set_level(6)
	BaseTroop.invalidate_combat_lists()
	var ground_initial_hp := ground.hp

	var lock_ticks: Array[int] = []
	var fire_ticks: Array[int] = []
	var impact_targets: Array[int] = []
	tower.connect("harpoon_event", func(kind: String, payload: Dictionary) -> void:
		if kind == "harpoon_lock":
			lock_ticks.append(int(payload.get("lock_tick", -1)))
		elif kind == "harpoon_fire":
			fire_ticks.append(int(payload.get("fire_tick", -1)))
		elif kind == "harpoon_impact":
			impact_targets.append(int(payload.get("target_replay_order", -1)))
	)

	var initial_y := air.global_position.y
	var first_pull_duration := -1
	var probe_immunity_clock_active := false
	for _tick in range(520):
		if probe_immunity_clock_active and air._harpoon_immunity_ticks > 0:
			air._harpoon_immunity_ticks -= 1
		tower._simulation_step()
		if first_pull_duration < 0:
			var snapshot: Dictionary = tower.get_debug_snapshot()
			if snapshot.state == "TRACKING" and int(snapshot.last_fire_tick) >= 0 and air.get_harpoon_control_debug().immunity_ticks > 0:
				first_pull_duration = int(snapshot.pull_elapsed_ticks)
				# The direct probe advances all authored ticks inside one Engine frame;
				# emulate the troop's per-physics-tick immunity countdown explicitly.
				probe_immunity_clock_active = true
		if fire_ticks.size() >= 2:
			break

	_expect(impact_targets.size() >= 1 and impact_targets[0] == 2, "air-only target selection", failures)
	_expect(ground.hp == ground_initial_hp, "ground target remains undamaged", failures)
	_expect(air.hp <= 900, "L6 impact applies 100 damage", failures)
	_expect(is_equal_approx(air.global_position.y, initial_y), "pull preserves target Y", failures)
	_expect(absf(Vector2(air.global_position.x, air.global_position.z).length() - 0.60) <= 0.00001, "pull stops at 0.60", failures)
	_expect(first_pull_duration == 45, "L6 pull from 1.50 completes in 45 ticks", failures)
	_expect(
		lock_ticks.size() >= 1 and fire_ticks.size() >= 1 and fire_ticks[0] - lock_ticks[0] == tower.WINDUP_TICKS,
		"first launch completes the full 27-tick wind-up",
		failures
	)
	_expect(fire_ticks.size() >= 2 and fire_ticks[1] - fire_ticks[0] == 420, "launch cadence is exactly 420 ticks", failures)
	if (
		lock_ticks.size() < 1
		or fire_ticks.size() < 2
		or fire_ticks[0] - lock_ticks[0] != tower.WINDUP_TICKS
		or fire_ticks[1] - fire_ticks[0] != 420
	):
		print("HARPOON_CLIENT_PROBE_TIMING_DEBUG locks=%s fires=%s snapshot=%s control=%s" % [lock_ticks, fire_ticks, tower.get_debug_snapshot(), air.get_harpoon_control_debug()])

	var reservation_probe := ProbeTroop.new()
	reservation_probe.unit_target_type = BaseTroop.UNIT_TARGET_AIR
	fixture.add_child(reservation_probe)
	reservation_probe.state = BaseTroop.State.RUNNING
	_expect(reservation_probe.try_reserve_harpoon(20), "initial reservation succeeds", failures)
	_expect(reservation_probe.try_reserve_harpoon(10), "lower stable order preempts uncommitted lock", failures)
	_expect(reservation_probe.has_harpoon_reservation(10), "preempted reservation has deterministic owner", failures)
	_expect(reservation_probe.commit_harpoon_reservation(10), "reservation commit succeeds", failures)
	_expect(not reservation_probe.try_reserve_harpoon(5), "committed projectile reservation cannot be stolen", failures)
	reservation_probe.release_harpoon(10, 90)
	_expect(reservation_probe.get_harpoon_control_debug().immunity_ticks == 90, "release grants 90 immunity ticks", failures)

	var freeze_air := _make_troop("freeze_air_probe", BaseTroop.UNIT_TARGET_AIR, Vector3(4.2, 0.73, 0.0), 3)
	fixture.add_child(freeze_air)
	freeze_air.state = BaseTroop.State.RUNNING
	var freeze_tower: Variant = Node3D.new()
	freeze_tower.position = Vector3(3.0, 0.0, 0.0)
	freeze_tower.set_meta("server_id", 300)
	freeze_tower.set_script(HarpoonScript)
	fixture.add_child(freeze_tower)
	freeze_tower.set_level(6)
	BaseTroop.invalidate_combat_lists()
	for _freeze_setup_tick in range(120):
		freeze_tower._simulation_step()
		if freeze_tower.get_debug_snapshot().state == "PULL":
			break
	_expect(freeze_tower.get_debug_snapshot().state == "PULL", "freeze fixture reaches active pull", failures)
	var freeze_fire_tick := int(freeze_tower.get_debug_snapshot().last_fire_tick)
	var freeze_reload_tick := int(freeze_tower.get_debug_snapshot().reload_ready_tick)
	freeze_tower.freeze_for(0.50)
	_expect(freeze_tower.get_debug_snapshot().state == "DISABLED", "freeze disables active Harpoon", failures)
	_expect(not freeze_air.is_harpoon_pull_active(), "freeze releases active pull", failures)
	_expect(freeze_air.get_harpoon_control_debug().immunity_ticks == 90, "freeze after impact grants immunity", failures)
	_expect(freeze_reload_tick - freeze_fire_tick == 420, "freeze preserves committed reload deadline", failures)
	freeze_tower._freeze_started_frame = -1
	for _freeze_tick in range(30):
		freeze_tower._simulation_step()
	_expect(freeze_tower.get_debug_snapshot().state == "TRACKING", "Harpoon resumes tracking after Freeze", failures)
	_expect(is_equal_approx(freeze_air.global_position.y, 0.73), "interrupted pull preserves flight Y", failures)

	tower.set_level(7)
	tower.set_ward_bonus_pct(15)
	_expect(tower.damage == 161, "L7 ward damage uses ceiling rounding", failures)
	_expect(is_equal_approx(tower.detect_range, 1.70), "L7 range is 1.70", failures)
	_expect(is_equal_approx(tower.pull_speed, 1.40), "L7 pull speed is 1.40", failures)
	tower.set_level(8)
	_expect(tower.damage == 190, "L8 Ward damage uses ceiling rounding", failures)
	_expect(is_equal_approx(tower.detect_range, 1.78), "L8 range is 1.78", failures)
	_expect(is_equal_approx(tower.pull_speed, 1.48), "L8 pull speed is 1.48", failures)

	var wrapper_scene := load("res://Model/Harpoon/HarpoonDefense.tscn") as PackedScene
	var visual_tower: Variant = Node3D.new()
	visual_tower.set_meta("server_id", 200)
	visual_tower.set_script(HarpoonScript)
	visual_tower.add_child(wrapper_scene.instantiate())
	fixture.add_child(visual_tower)
	visual_tower._bind_visual_wrapper()
	_expect(visual_tower.find_child("TurretYawPivot", true, false) != null, "visual wrapper exposes yaw pivot", failures)
	_expect(visual_tower.find_child("MuzzleSocket", true, false) != null, "visual wrapper exposes muzzle socket", failures)
	_expect(visual_tower.find_child("RopeMesh", true, false) != null, "visual wrapper exposes rope mesh", failures)
	var idle_target := Vector3(-1.0, 0.0, 0.8)
	visual_tower.set_spawn_facing_global(idle_target)
	visual_tower._snap_spawn_facing_if_available()
	_expect(
		_facing_error_degrees(visual_tower, idle_target) <= 2.0,
		"spawn facing points toward the configured deployment target",
		failures
	)
	var visual_aimed := false
	for _aim_tick in range(90):
		if float(visual_tower._advance_yaw(air, DT)) <= visual_tower.YAW_FIRE_TOLERANCE_RADIANS:
			visual_aimed = true
			break
	_expect(visual_aimed, "production wrapper reaches authoritative aim tolerance", failures)
	_expect(
		_facing_error_degrees(visual_tower, air.global_position) <= 2.0,
		"air target overrides spawn facing",
		failures
	)
	var retained_forward: Vector3 = visual_tower.find_child(
		"HarpoonDefense", true, false
	).call("get_aim_forward_global") as Vector3
	air.state = BaseTroop.State.VICTORY
	air.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()
	for _idle_hold_tick in range(90):
		visual_tower._simulation_step()
	var held_forward: Vector3 = visual_tower.find_child(
		"HarpoonDefense", true, false
	).call("get_aim_forward_global") as Vector3
	if retained_forward.angle_to(held_forward) > deg_to_rad(0.01):
		print(
			"HARPOON_HEADING_HOLD_DEBUG before=%s after=%s snapshot=%s"
			% [str(retained_forward), str(held_forward), str(visual_tower.get_debug_snapshot())]
		)
	_expect(
		retained_forward.angle_to(held_forward) <= deg_to_rad(0.01),
		"idle tracking preserves the last combat heading",
		failures
	)
	visual_tower.set_level(2)
	await process_frame
	await process_frame
	var upgraded_forward: Vector3 = visual_tower.find_child(
		"HarpoonDefense", true, false
	).call("get_aim_forward_global") as Vector3
	_expect(
		held_forward.angle_to(upgraded_forward) <= deg_to_rad(0.01),
		"level upgrade preserves the last combat heading",
		failures
	)
	visual_tower.find_child("HarpoonDefense", true, false).call("reset_ready")
	var ready_forward: Vector3 = visual_tower.find_child(
		"HarpoonDefense", true, false
	).call("get_aim_forward_global") as Vector3
	_expect(
		upgraded_forward.angle_to(ready_forward) <= deg_to_rad(0.01),
		"ready reset preserves the last combat heading",
		failures
	)

	# Production placement starts at zero scale. Spawn facing must wait for an
	# invertible transform instead of silently giving up after one frame.
	var construction_tower: Variant = Node3D.new()
	construction_tower.name = "HarpoonZeroScaleSpawnProbe"
	construction_tower.position = Vector3(0.0, 0.0, -1.0)
	construction_tower.scale = Vector3.ZERO
	construction_tower.set_meta("server_id", 201)
	construction_tower.set_script(HarpoonScript)
	construction_tower.add_child(wrapper_scene.instantiate())
	fixture.add_child(construction_tower)
	var spawn_facing_target := Vector3(0.0, 0.0, 1.0)
	construction_tower.set_spawn_facing_global(spawn_facing_target)
	await process_frame
	_expect(
		not bool(construction_tower._spawn_facing_applied),
		"spawn facing waits while construction scale is singular",
		failures
	)
	construction_tower.scale = Vector3.ONE
	for _spawn_ready_frame in range(3):
		await process_frame
	_expect(
		bool(construction_tower._spawn_facing_applied),
		"spawn facing applies after construction scale becomes valid",
		failures
	)
	_expect(
		_facing_error_degrees(construction_tower, spawn_facing_target) <= 2.0,
		"zero-scale production spawn points toward the combat zone",
		failures
	)

	# Minimal in-tree BuildingSystem integration: production must resolve the
	# AttackSystem plane, not its own building-grid origin.
	var integration_root := Node3D.new()
	integration_root.name = "HarpoonFacingIntegrationProbe"
	var island := Node3D.new()
	island.name = "Island"
	var attack_plane := Node3D.new()
	attack_plane.name = "shipPlane"
	attack_plane.position = Vector3(-1.8, 0.02, 2.65)
	island.add_child(attack_plane)
	integration_root.add_child(island)
	var grid_plane := MeshInstance3D.new()
	grid_plane.name = "gridPlane"
	grid_plane.scale = Vector3(4.0, 0.1, 4.0)
	grid_plane.mesh = BoxMesh.new()
	integration_root.add_child(grid_plane)
	var attack_system := ProbeAttackSystem.new()
	attack_system.name = "AttackSystem"
	integration_root.add_child(attack_system)
	var building_system: Variant = Node3D.new()
	building_system.name = "BuildingSystem"
	building_system.set_script(load("res://scripts/building_system.gd"))
	building_system.create_ui = false
	building_system.test_mode = true
	building_system.grid_plane_path = NodePath("../gridPlane")
	integration_root.add_child(building_system)
	root.add_child(integration_root)
	await process_frame
	var resolved_attack_zone: Vector3 = building_system._get_defense_spawn_facing_global()
	_expect(
		resolved_attack_zone.is_equal_approx(attack_plane.global_position),
		"BuildingSystem spawn facing resolves AttackSystem shipPlane",
		failures
	)
	integration_root.queue_free()
	await process_frame

	var result_air_hp := air.hp
	var result_distance := Vector2(air.global_position.x, air.global_position.z).length()
	fixture.queue_free()
	await process_frame
	await process_frame
	HarpoonScript.release_shared_sfx_for_tests()
	await create_timer(0.20).timeout
	BaseTroop.invalidate_combat_lists()

	if failures.is_empty():
		print("HARPOON_CLIENT_PROBE_PASS locks=%s fires=%s air_hp=%d distance=%.3f" % [lock_ticks, fire_ticks, result_air_hp, result_distance])
		quit(0)
	else:
		for failure in failures:
			push_error("HARPOON_CLIENT_PROBE_FAIL: " + failure)
		quit(1)


func _make_troop(probe_name: String, target_type: String, spawn_position: Vector3, replay_order: int) -> ProbeTroop:
	var troop := ProbeTroop.new()
	troop.probe_name = probe_name
	troop.unit_target_type = target_type
	troop.position = spawn_position
	troop.set_meta("replay_order", replay_order)
	troop.add_to_group("troops")
	return troop


func _expect(condition: bool, label: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(label)


func _facing_error_degrees(tower: Node3D, target_global: Vector3) -> float:
	var controller := tower.find_child("HarpoonDefense", true, false)
	if controller == null or not controller.has_method("get_aim_forward_global"):
		return 180.0
	var forward: Vector3 = controller.call("get_aim_forward_global") as Vector3
	var direction := target_global - tower.global_position
	direction.y = 0.0
	if forward.length_squared() <= 0.0000001 or direction.length_squared() <= 0.0000001:
		return 180.0
	return rad_to_deg(forward.normalized().angle_to(direction.normalized()))
