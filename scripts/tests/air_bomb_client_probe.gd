extends SceneTree
## Focused deterministic client contract for the TH9 Air Bomb defense.

const TowerScript: Script = preload("res://scripts/tower_air_bomb.gd")
const ProjectileScript: Script = preload("res://scripts/air_bomb_projectile.gd")
const VisualScene: PackedScene = preload("res://Model/air_bomb/air_bomb.tscn")


class ProbeTroop extends BaseTroop:
	var probe_name: String = "probe"

	func _init_stats() -> void:
		hp = 10000
		damage = 1
		atk_speed = 1.0
		move_speed = 0.5
		attack_range = 0.2

	func _get_troop_name() -> String:
		return probe_name


class ProbeCameraRig extends Node:
	var trauma_calls: int = 0
	var last_trauma: float = 0.0

	func add_trauma(amount: float) -> void:
		trauma_calls += 1
		last_trauma = amount


func _probe_camera_shake_runtime(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombCameraShakeProbe")
	var rig: Variant = Node3D.new()
	rig.name = "CameraRig"
	rig.set_script(load("res://scripts/camera_rig.gd"))
	var pitch_pivot := Node3D.new()
	pitch_pivot.name = "PitchPivot"
	var camera := Camera3D.new()
	camera.name = "Camera3D"
	camera.position.z = 4.0
	pitch_pivot.add_child(camera)
	rig.add_child(pitch_pivot)
	fixture.add_child(rig)
	await process_frame

	var projectile: Variant = Node3D.new()
	projectile.set_script(ProjectileScript)
	fixture.add_child(projectile)
	projectile._shake_camera_on_impact()
	_expect(
		is_equal_approx(float(rig._shake_trauma), projectile.IMPACT_CAMERA_TRAUMA),
		"impact gives the production CameraRig the configured trauma",
		failures
	)
	rig._process(1.0 / 60.0)
	var shake_offset := Vector2(camera.position.x, camera.position.y)
	_expect(
		shake_offset.length_squared() > 0.0,
		"production CameraRig applies a visible local-XY shake offset",
		failures
	)
	for _frame in range(30):
		rig._process(1.0 / 60.0)
	_expect(
		is_zero_approx(float(rig._shake_trauma))
		and Vector2(camera.position.x, camera.position.y).is_zero_approx(),
		"Air Bomb shake fully decays without leaving a camera offset",
		failures
	)
	projectile.free()
	await _free_fixture(fixture)


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	await _probe_targeting_reload_and_committed_shot(failures)
	await _probe_splash_falloff(failures)
	await _probe_homing_and_target_loss(failures)
	await _probe_freeze_and_level_curve(failures)
	_probe_building_integration(failures)
	await _probe_visual_contract(failures)
	await _probe_tower_payload_flow(failures)
	await _probe_camera_shake_runtime(failures)

	BaseTroop.invalidate_combat_lists()
	# Flush deferred frees at very low fixed FPS before SceneTree shutdown so
	# the probe distinguishes real leaks from end-of-process cleanup timing.
	await process_frame
	await process_frame
	await process_frame
	if failures.is_empty():
		print("AIR_BOMB_CLIENT_PROBE_PASS")
		quit(0)
	else:
		for failure in failures:
			push_error("AIR_BOMB_CLIENT_PROBE_FAIL: " + failure)
		quit(1)


func _probe_targeting_reload_and_committed_shot(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombTargetingProbe")
	var ground := _make_troop("ground", BaseTroop.UNIT_TARGET_GROUND, Vector3(0.35, 0.0, 0.0), 1)
	var air := _make_troop("air", BaseTroop.UNIT_TARGET_AIR, Vector3(1.15, 0.45, 0.0), 2)
	fixture.add_child(ground)
	fixture.add_child(air)
	var tower: Variant = _make_tower(Vector3.ZERO, 100)
	fixture.add_child(tower)
	BaseTroop.invalidate_combat_lists()

	var fire_ticks: Array[int] = []
	tower.connect("air_bomb_event", func(kind: String, payload: Dictionary) -> void:
		if kind == "air_bomb_fire":
			fire_ticks.append(int(payload.get("fire_tick", -1)))
	)
	var ground_hp := ground.hp
	var air_hp := air.hp
	for _tick in range(271):
		_step_active_projectile(tower)
		tower._simulation_step()
	_expect(fire_ticks == [0, 270], "launch-to-launch cadence is exactly 270 ticks", failures)
	_expect(ground.hp == ground_hp, "nearest ground troop is never acquired or damaged", failures)
	_expect(air.hp == air_hp - 140, "nearest air troop receives exactly one L1 impact before reload", failures)

	# A shot already committed must survive removal of its owner building.
	ground.remove_from_group("troops")
	air.remove_from_group("troops")
	var committed_target := _make_troop("committed", BaseTroop.UNIT_TARGET_AIR, Vector3(3.0, 0.4, 0.0), 3)
	fixture.add_child(committed_target)
	var committed_hp := committed_target.hp
	var committed_tower: Variant = _make_tower(Vector3(2.0, 0.0, 0.0), 101)
	fixture.add_child(committed_tower)
	BaseTroop.invalidate_combat_lists()
	committed_tower._simulation_step()
	var committed_projectile: Variant = _active_projectile(committed_tower)
	_expect(is_instance_valid(committed_projectile), "owner-death fixture launches a projectile", failures)
	committed_tower.free()
	for _tick in range(80):
		if not is_instance_valid(committed_projectile) or bool(committed_projectile.get_debug_snapshot().finished):
			break
		committed_projectile._simulation_step()
	_expect(committed_target.hp == committed_hp - 140, "committed projectile impacts after owner destruction", failures)

	await _free_fixture(fixture)


func _probe_splash_falloff(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombSplashProbe")
	var center := _make_troop("center", BaseTroop.UNIT_TARGET_AIR, Vector3(0.0, 0.4, 0.0), 10)
	var half := _make_troop("half", BaseTroop.UNIT_TARGET_AIR, Vector3(0.155, 0.4, 0.0), 11)
	var edge := _make_troop("edge", BaseTroop.UNIT_TARGET_AIR, Vector3(0.31, 0.4, 0.0), 12)
	var outside := _make_troop("outside", BaseTroop.UNIT_TARGET_AIR, Vector3(0.311, 0.4, 0.0), 13)
	var ground := _make_troop("ground_center", BaseTroop.UNIT_TARGET_GROUND, Vector3.ZERO, 14)
	for troop in [center, half, edge, outside, ground]:
		fixture.add_child(troop)
	var projectile: Variant = Node3D.new()
	projectile.set_script(ProjectileScript)
	fixture.add_child(projectile)
	projectile.initialize(Vector3.ZERO, center, 140, 0.31, 2.25, 150, 150, 1, 0)
	BaseTroop.invalidate_combat_lists()
	var initial_hp := center.hp
	var hit_count: int = projectile._apply_air_splash(Vector3.ZERO)
	_expect(hit_count == 3, "splash includes center/half/edge air targets only", failures)
	_expect(center.hp == initial_hp - 140, "center takes 100 percent damage", failures)
	_expect(half.hp == initial_hp - 105, "half radius takes ceil 75 percent damage", failures)
	_expect(edge.hp == initial_hp - 70, "outer edge takes 50 percent damage", failures)
	_expect(outside.hp == initial_hp, "outside radius takes zero damage", failures)
	_expect(ground.hp == initial_hp, "co-located ground target takes zero splash", failures)
	await _free_fixture(fixture)


func _probe_homing_and_target_loss(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombHomingProbe")
	var static_target := _make_troop("static", BaseTroop.UNIT_TARGET_AIR, Vector3(1.5, 0.4, 0.0), 19)
	fixture.add_child(static_target)
	var static_projectile: Variant = _make_projectile(fixture, Vector3.ZERO, static_target, 140, 199)
	for _tick in range(static_projectile.RISE_TICKS + static_projectile.MAX_HOMING_TICKS):
		if bool(static_projectile.get_debug_snapshot().finished):
			break
		static_projectile._simulation_step()
	var static_snapshot: Dictionary = static_projectile.get_debug_snapshot()
	_expect(int(static_snapshot.age_ticks) == 92, "1.5-unit static target impacts at exact age tick 92", failures)
	_expect(int(static_snapshot.homing_age_ticks) == 71, "1.5-unit static target uses exactly 71 homing ticks", failures)
	static_target.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()
	var far_target := _make_troop("far_static", BaseTroop.UNIT_TARGET_AIR, Vector3(2.65, 0.4, 0.0), 18)
	fixture.add_child(far_target)
	var far_hp := far_target.hp
	var far_projectile: Variant = _make_projectile(fixture, Vector3.ZERO, far_target, 140, 198)
	for _tick in range(far_projectile.RISE_TICKS + far_projectile.MAX_HOMING_TICKS):
		if bool(far_projectile.get_debug_snapshot().finished):
			break
		far_projectile._simulation_step()
	var far_snapshot: Dictionary = far_projectile.get_debug_snapshot()
	_expect(bool(far_snapshot.finished) and int(far_snapshot.homing_age_ticks) < far_projectile.MAX_HOMING_TICKS, "static target at L9 max range remains reachable at the reduced speed", failures)
	_expect(far_target.hp == far_hp - 140, "max-range static target receives the committed impact", failures)
	far_target.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()

	var moving := _make_troop("moving", BaseTroop.UNIT_TARGET_AIR, Vector3(1.0, 0.4, 0.55), 20)
	fixture.add_child(moving)
	var moving_hp := moving.hp
	var projectile: Variant = _make_projectile(fixture, Vector3.ZERO, moving, 140, 200)
	var completion := {"reason": "", "impacted": false}
	projectile.connect("completed", func(reason: String, impacted: bool) -> void:
		completion.reason = reason
		completion.impacted = impacted
	)
	for _rise_tick in range(projectile.RISE_TICKS):
		moving.position.z += 0.0025
		BaseTroop.invalidate_combat_lists()
		projectile._simulation_step()
	var rise_snapshot: Dictionary = projectile.get_debug_snapshot()
	_expect(
		is_zero_approx(float(rise_snapshot.position.x)) and is_zero_approx(float(rise_snapshot.position.z)),
		"complete balloon assembly rises vertically before homing",
		failures
	)
	_expect(float(rise_snapshot.position.y) >= 0.33, "rise phase clears the launcher", failures)
	for _tick in range(projectile.MAX_HOMING_TICKS):
		if bool(projectile.get_debug_snapshot().finished):
			break
		moving.position.z += 0.0025
		BaseTroop.invalidate_combat_lists()
		projectile._simulation_step()
	_expect(bool(completion.impacted), "limited homing reaches a moving air target", failures)
	_expect(moving.hp == moving_hp - 140, "moving target receives one impact", failures)
	moving.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()

	# Target loss is resolved before the tick advances. Equal-distance candidates
	# use replay order and then instance ID, and a second loss may retarget again
	# without restarting the rise or changing the launch heading.
	var rise_initial := _make_troop("rise_initial", BaseTroop.UNIT_TARGET_AIR, Vector3(2.0, 0.4, 0.0), 21)
	var rise_high_order := _make_troop("rise_high_order", BaseTroop.UNIT_TARGET_AIR, Vector3(0.0, 0.4, 1.5), 24)
	var rise_low_old := _make_troop("rise_low_old", BaseTroop.UNIT_TARGET_AIR, Vector3(0.0, 0.4, -1.5), 22)
	var rise_low_new := _make_troop("rise_low_new", BaseTroop.UNIT_TARGET_AIR, Vector3(-1.5, 0.4, 0.0), 22)
	for troop in [rise_initial, rise_high_order, rise_low_old, rise_low_new]:
		fixture.add_child(troop)
	var rise_projectile: Variant = _make_projectile(fixture, Vector3.ZERO, rise_initial, 140, 201)
	var launch_heading: Vector2 = rise_projectile.get_debug_snapshot().heading
	rise_initial.take_damage(rise_initial.hp)
	BaseTroop.invalidate_combat_lists()
	rise_projectile._simulation_step()
	var first_retarget: Dictionary = rise_projectile.get_debug_snapshot()
	_expect(int(first_retarget.target_replay_order) == 22, "rise retarget prefers lower replay order at equal distance", failures)
	_expect(int(first_retarget.target_instance) == int(rise_low_old.get_instance_id()), "rise retarget uses instance ID after an equal replay-order tie", failures)
	_expect(int(first_retarget.retarget_count) == 1 and int(first_retarget.age_ticks) == 1, "rise retarget advances the original age instead of restarting it", failures)
	_expect((first_retarget.heading as Vector2).is_equal_approx(launch_heading), "rise retarget preserves the launch heading", failures)
	_expect(Vector2(first_retarget.position.x, first_retarget.position.z).is_zero_approx(), "rise retarget does not add horizontal movement", failures)
	rise_low_old.take_damage(rise_low_old.hp)
	BaseTroop.invalidate_combat_lists()
	rise_projectile._simulation_step()
	var second_retarget: Dictionary = rise_projectile.get_debug_snapshot()
	_expect(int(second_retarget.target_instance) == int(rise_low_new.get_instance_id()), "a committed projectile may retarget repeatedly", failures)
	_expect(int(second_retarget.retarget_count) == 2 and int(second_retarget.age_ticks) == 2, "repeated retarget keeps the same rise and lifetime counters", failures)
	_expect((second_retarget.heading as Vector2).is_equal_approx(launch_heading), "repeated rise retarget never resets heading", failures)
	rise_projectile.cancel_without_impact("probe_complete")
	for troop in [rise_high_order, rise_low_new]:
		troop.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()

	# Once homing has started, replacement selection still uses projectile XZ.
	# The replacement is acquired and steered toward on the same tick, but the
	# turn remains capped at four degrees and the 144-tick lifetime is unchanged.
	var homing_initial := _make_troop("homing_initial", BaseTroop.UNIT_TARGET_AIR, Vector3(2.0, 0.4, 0.0), 30)
	var homing_replacement := _make_troop("homing_replacement", BaseTroop.UNIT_TARGET_AIR, Vector3(0.25, 0.4, 1.2), 31)
	fixture.add_child(homing_initial)
	fixture.add_child(homing_replacement)
	var homing_projectile: Variant = _make_projectile(fixture, Vector3.ZERO, homing_initial, 140, 202)
	var homing_completion := {"reason": "", "impacted": true}
	homing_projectile.connect("completed", func(reason: String, impacted: bool) -> void:
		homing_completion.reason = reason
		homing_completion.impacted = impacted
	)
	for _tick in range(homing_projectile.RISE_TICKS + 8):
		homing_projectile._simulation_step()
	var before_homing_retarget: Dictionary = homing_projectile.get_debug_snapshot()
	homing_initial.take_damage(homing_initial.hp)
	BaseTroop.invalidate_combat_lists()
	homing_projectile._simulation_step()
	var after_homing_retarget: Dictionary = homing_projectile.get_debug_snapshot()
	var heading_change := absf((before_homing_retarget.heading as Vector2).angle_to(after_homing_retarget.heading as Vector2))
	_expect(int(after_homing_retarget.target_instance) == int(homing_replacement.get_instance_id()), "homing retarget selects a live target from projectile-centered range", failures)
	_expect(int(after_homing_retarget.homing_age_ticks) == int(before_homing_retarget.homing_age_ticks) + 1, "homing retarget does not reset flight age", failures)
	_expect(heading_change > 0.0 and heading_change <= homing_projectile.TURN_RADIANS_PER_TICK + 0.000001, "homing retarget turns from the existing heading by at most four degrees", failures)
	_expect(float(after_homing_retarget.position.z) > float(before_homing_retarget.position.z), "homing retarget steers on the same tick instead of continuing stale straight flight", failures)
	_expect(int(after_homing_retarget.retarget_count) == 1 and is_equal_approx(float(after_homing_retarget.retarget_range), 2.25), "homing debug state exposes immutable range and retarget count", failures)
	while not bool(homing_projectile.get_debug_snapshot().finished):
		homing_replacement.global_position = homing_projectile.global_position + Vector3(8.0, 0.0, 8.0)
		homing_projectile._simulation_step()
	var lifetime_snapshot: Dictionary = homing_projectile.get_debug_snapshot()
	_expect(int(lifetime_snapshot.age_ticks) == homing_projectile.RISE_TICKS + homing_projectile.MAX_HOMING_TICKS, "retarget keeps the original 144-tick homing lifetime", failures)
	_expect(homing_completion.reason == "max_lifetime" and not bool(homing_completion.impacted), "retargeted projectile expires normally without resetting lifetime", failures)
	homing_replacement.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()

	# With no valid target inside the snapshotted range, cleanup is immediate:
	# no age advance, straight-flight step, impact, or splash damage is allowed.
	var orphan := _make_troop("orphan", BaseTroop.UNIT_TARGET_AIR, Vector3(1.0, 0.4, 0.0), 40)
	var outside_candidate := _make_troop("outside_candidate", BaseTroop.UNIT_TARGET_AIR, Vector3(0.1, 0.4, 0.0), 41)
	fixture.add_child(orphan)
	fixture.add_child(outside_candidate)
	var outside_hp := outside_candidate.hp
	var orphan_projectile: Variant = _make_projectile(fixture, Vector3.ZERO, orphan, 140, 203, 0.05)
	var orphan_completion := {"reason": "", "impacted": true}
	orphan_projectile.connect("completed", func(reason: String, impacted: bool) -> void:
		orphan_completion.reason = reason
		orphan_completion.impacted = impacted
	)
	var orphan_before: Dictionary = orphan_projectile.get_debug_snapshot()
	orphan.take_damage(orphan.hp)
	BaseTroop.invalidate_combat_lists()
	orphan_projectile._simulation_step()
	var orphan_after: Dictionary = orphan_projectile.get_debug_snapshot()
	_expect(orphan_completion.reason == "no_retarget_candidate" and not bool(orphan_completion.impacted), "missing replacement cleans up immediately without impact", failures)
	_expect(int(orphan_after.age_ticks) == int(orphan_before.age_ticks), "no-candidate cleanup does not consume a rise or homing tick", failures)
	_expect((orphan_after.position as Vector3).is_equal_approx(orphan_before.position as Vector3), "no-candidate cleanup does not continue on a stale heading", failures)
	_expect(outside_candidate.hp == outside_hp, "no-candidate cleanup applies no splash damage", failures)
	await _free_fixture(fixture)


func _probe_freeze_and_level_curve(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombFreezeProbe")
	var air := _make_troop("freeze_air", BaseTroop.UNIT_TARGET_AIR, Vector3(1.0, 0.4, 0.0), 30)
	fixture.add_child(air)
	var tower: Variant = _make_tower(Vector3.ZERO, 300)
	fixture.add_child(tower)
	BaseTroop.invalidate_combat_lists()
	tower.freeze_for(0.5)
	tower._freeze_started_frame = -1
	for _tick in range(30):
		tower._simulation_step()
	_expect(int(tower.get_debug_snapshot().last_fire_tick) == -1, "Freeze blocks all acquisition and launch ticks", failures)
	for _tick in range(7):
		tower._simulation_step()
	_expect(int(tower.get_debug_snapshot().last_fire_tick) == 36, "defense resumes on the next absolute scan edge after Freeze", failures)
	_expect(int(tower.get_debug_snapshot().reload_ready_tick) == 306, "reload deadline is an absolute 270 ticks after launch", failures)
	tower.set_level(9)
	tower.set_ward_bonus_pct(15)
	_expect(tower.damage == 2162, "L9 Ward damage uses ceiling rounding", failures)
	_expect(is_equal_approx(tower.detect_range, 2.65), "L9 search range is 2.65", failures)
	_expect(tower.RELOAD_TICKS == 270, "reload never scales with level", failures)
	_expect(is_equal_approx(tower.SPLASH_RADIUS, 0.31), "tower uses the owner-approved half-size splash radius", failures)
	_expect(is_equal_approx(ProjectileScript.PROJECTILE_SPEED, 1.19), "projectile uses the owner-approved 30-percent slower flight speed", failures)
	_expect(is_equal_approx(ProjectileScript.RISE_HEIGHT, 0.34), "projectile keeps the canonical 0.34 rise height", failures)
	_expect(is_equal_approx(ProjectileScript.IMPACT_FX_LIFETIME_SECONDS, 0.24), "impact VFX keeps its compact 0.24-second lifetime", failures)
	await _free_fixture(fixture)


func _probe_visual_contract(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombVisualProbe")
	var visual := VisualScene.instantiate()
	fixture.add_child(visual)
	await process_frame
	await process_frame
	var payload_assembly := visual.get_node_or_null("ModelRoot/PayloadAssembly") as Node3D
	var left_mesh := visual.find_child("Bombs_001", true, false) as MeshInstance3D
	var right_mesh := visual.find_child("Bombs_002", true, false) as MeshInstance3D
	var carried_barrel := visual.find_child("Circle", true, false) as MeshInstance3D
	var carried_bridle := visual.find_child("Cube_024", true, false) as MeshInstance3D
	var static_base := visual.find_child("AirBombBase", true, false) as MeshInstance3D
	var model_root := visual.get_node_or_null("ModelRoot") as Node3D
	_expect(payload_assembly != null, "visual exposes one complete payload assembly", failures)
	_expect(left_mesh != null and right_mesh != null, "visual binds both authored balloon meshes", failures)
	_expect(carried_barrel != null and carried_bridle != null, "payload includes carried barrel and suspension bridle", failures)
	_expect(static_base != null, "visual binds the authored static launcher", failures)
	_expect(model_root != null and is_equal_approx(model_root.rotation_degrees.y, 90.0), "authored launcher and barrel keep their +90-degree presentation yaw", failures)
	var initial_left_mesh := left_mesh.mesh
	var initial_left_basis := left_mesh.transform.basis
	visual.set_attack_zone_facing_global(visual.global_position + Vector3.BACK * 3.0)
	var resolved_facing: Vector3 = visual.get_flag_facing_global()
	_expect(resolved_facing.dot(Vector3.BACK) >= 0.999, "balloon logos face the supplied attack-zone direction", failures)
	_expect(left_mesh.mesh == initial_left_mesh, "attack-zone facing reuses the prepared scene-local balloon mesh", failures)
	_expect(not left_mesh.transform.basis.is_equal_approx(initial_left_basis), "attack-zone facing rotates the balloon presentation basis", failures)
	var left_uv_summary := _mesh_uv_summary(left_mesh.mesh)
	var right_uv_summary := _mesh_uv_summary(right_mesh.mesh)
	_expect(bool(left_uv_summary.get("finite", false)), "left planar balloon UVs are finite", failures)
	_expect(bool(right_uv_summary.get("finite", false)), "right planar balloon UVs are finite", failures)
	_expect((left_uv_summary.get("span", Vector2.ZERO) as Vector2).x >= 0.75, "left planar flag uses most of the balloon width", failures)
	_expect((left_uv_summary.get("span", Vector2.ZERO) as Vector2).y >= 0.75, "left planar flag uses most of the balloon height", failures)
	_expect((right_uv_summary.get("span", Vector2.ZERO) as Vector2).x >= 0.75, "right planar flag uses most of the balloon width", failures)
	_expect((right_uv_summary.get("span", Vector2.ZERO) as Vector2).y >= 0.75, "right planar flag uses most of the balloon height", failures)
	_expect(int(left_uv_summary.get("surface_count", 0)) == 1, "left planar UV rebuild keeps one draw surface", failures)
	_expect(int(right_uv_summary.get("surface_count", 0)) == 1, "right planar UV rebuild keeps one draw surface", failures)
	var base_material := static_base.material_override as StandardMaterial3D
	var carried_bomb_material := carried_barrel.material_override as StandardMaterial3D
	var bridle_material := carried_bridle.material_override as StandardMaterial3D
	var balloon_material := left_mesh.material_override as StandardMaterial3D
	_expect(base_material != null and base_material.albedo_color.is_equal_approx(Color(0.85, 0.85, 0.85, 1.0)), "Air Bomb preserves its authored off-white/wood base palette", failures)
	_expect(base_material != null and is_zero_approx(base_material.metallic), "Air Bomb launcher is non-metallic like the cannon", failures)
	_expect(base_material != null and is_equal_approx(base_material.roughness, 0.82), "Air Bomb launcher matches cannon matte roughness", failures)
	_expect(base_material != null and base_material.metallic_texture == null and base_material.roughness_texture == null, "launcher does not sample glossy PBR maps", failures)
	_expect(balloon_material != null and is_zero_approx(balloon_material.metallic), "balloons are non-metallic", failures)
	_expect(balloon_material != null and is_equal_approx(balloon_material.roughness, 0.82), "balloons use matte cannon-like roughness", failures)
	_expect(balloon_material != null and balloon_material.metallic_texture == null and balloon_material.roughness_texture == null, "balloons do not sample glossy PBR maps", failures)
	_expect(carried_bomb_material != null and carried_bomb_material != base_material, "orange carried bomb has an isolated material", failures)
	_expect(carried_bomb_material != null and carried_bomb_material.albedo_texture != null, "orange carried bomb keeps the supplied bomb texture", failures)
	_expect(carried_bomb_material != null and carried_bomb_material.albedo_texture != base_material.albedo_texture, "carried bomb no longer samples the gray launcher texture", failures)
	_expect(carried_bomb_material != null and is_zero_approx(carried_bomb_material.metallic) and is_equal_approx(carried_bomb_material.roughness, 0.82), "carried bomb uses the matte reference treatment", failures)
	_expect(bridle_material == base_material, "pale suspension bridle shares the launcher material", failures)
	var flag_image := Image.create(2, 2, false, Image.FORMAT_RGBA8)
	flag_image.fill(Color(0.2, 0.7, 1.0, 1.0))
	var flag_texture := ImageTexture.create_from_image(flag_image)
	visual.apply_player_flag_texture(flag_texture)
	var applied_flag := (left_mesh.material_override as StandardMaterial3D).albedo_texture
	_expect(applied_flag == flag_texture, "left balloon uses the original sharp player flag texture", failures)
	_expect((right_mesh.material_override as StandardMaterial3D).albedo_texture == flag_texture, "right balloon shares the original player flag texture", failures)
	_expect((carried_barrel.material_override as StandardMaterial3D).albedo_texture != flag_texture, "player flag does not overwrite the orange carried bomb", failures)
	_expect((left_mesh.material_override as StandardMaterial3D).uv1_scale.is_equal_approx(Vector3(1.4, 1.4, 1.0)), "centered overscan reduces the balloon logo footprint", failures)
	_expect((left_mesh.material_override as StandardMaterial3D).uv1_offset.is_equal_approx(Vector3(-0.2, -0.2, 0.0)), "balloon flag overscan remains centered", failures)
	_expect(not (left_mesh.material_override as StandardMaterial3D).texture_repeat, "planar flag clamps instead of wrapping across a sphere seam", failures)
	_expect((left_mesh.material_override as StandardMaterial3D).texture_filter == BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS, "planar flag uses the same mipmapped filtering as ship sails", failures)
	var flag_service: Variant = Node3D.new()
	flag_service.set_script(load("res://scripts/building_system.gd"))
	var cached_flag_image := Image.create(2, 2, false, Image.FORMAT_RGBA8)
	cached_flag_image.fill(Color(0.9, 0.15, 0.35, 1.0))
	var cached_flag_texture := ImageTexture.create_from_image(cached_flag_image)
	flag_service._town_hall_flag_texture_cache["probe://owner-flag"] = cached_flag_texture
	flag_service._apply_town_hall_flag_url(visual, "probe://owner-flag")
	var applied_cached_flag := (left_mesh.material_override as StandardMaterial3D).albedo_texture
	_expect(applied_cached_flag == cached_flag_texture, "Air Bomb reuses the cached Town Hall flag without resampling", failures)
	_expect((right_mesh.material_override as StandardMaterial3D).albedo_texture == cached_flag_texture, "cached owner flag reaches both balloons", failures)
	flag_service.free()
	visual.set_ammo_loaded(0, false)
	_expect(not payload_assembly.visible, "launch hides the complete two-balloon payload", failures)
	visual.set_reload_progress(0, 0.5)
	var visual_projectile: Node3D = visual.create_projectile_visual(0)
	_expect(visual_projectile != null, "visual creates a detached complete-payload copy", failures)
	if visual_projectile != null:
		_expect(visual_projectile.get_parent() == null, "projectile visual has no model-owner parent", failures)
		_expect(visual_projectile.find_child("Bombs_001", true, false) != null, "projectile carries first balloon", failures)
		_expect(visual_projectile.find_child("Bombs_002", true, false) != null, "projectile carries second balloon", failures)
		_expect(visual_projectile.find_child("Circle", true, false) != null, "projectile carries barrel bomb", failures)
		_expect(visual_projectile.find_child("Cube_024", true, false) != null, "projectile carries suspension bridle", failures)
		var projectile_left := visual_projectile.find_child("Bombs_001", true, false) as MeshInstance3D
		var projectile_right := visual_projectile.find_child("Bombs_002", true, false) as MeshInstance3D
		var projectile_barrel := visual_projectile.find_child("Circle", true, false) as MeshInstance3D
		_expect(projectile_left.mesh == left_mesh.mesh, "flying payload reuses the prepared left planar mesh", failures)
		_expect(projectile_right.mesh == right_mesh.mesh, "flying payload reuses the prepared right planar mesh", failures)
		_expect(projectile_left.material_override == left_mesh.material_override, "flying payload reuses the matte flag material", failures)
		_expect(projectile_barrel != null and projectile_barrel.material_override == carried_barrel.material_override, "flying payload preserves the separate orange bomb material", failures)
		visual_projectile.free()
	visual.reset_visual_state()
	_expect(payload_assembly.visible, "visual reset restores the complete payload", failures)
	var left_muzzle: Vector3 = visual.get_muzzle_global_position(0)
	var right_muzzle: Vector3 = visual.get_muzzle_global_position(1)
	_expect(left_muzzle.is_finite() and right_muzzle.is_finite(), "muzzle transforms are finite", failures)
	_expect(left_muzzle.is_equal_approx(right_muzzle), "legacy ammo sides resolve to one payload muzzle", failures)
	await _free_fixture(fixture)


func _probe_building_integration(failures: Array[String]) -> void:
	var building_system: Variant = Node3D.new()
	building_system.set_script(load("res://scripts/building_system.gd"))
	var definition: Dictionary = building_system.building_defs.get("air_bomb", {})
	_expect(definition.get("scene", "") == "res://Model/air_bomb/air_bomb.tscn", "BuildingSystem uses the production Air Bomb scene", failures)
	_expect(definition.get("max_count", 0) == 2, "Air Bomb definition caps at two", failures)
	_expect(building_system.TH_UNLOCK.get("air_bomb", 0) == 9, "Air Bomb unlock is Town Hall 9", failures)
	_expect(building_system.TH_MAX_COUNT.get("air_bomb", []) == [0, 0, 0, 0, 0, 0, 0, 0, 2], "client TH count gate mirrors server", failures)
	_expect(building_system.TH_MAX_LEVEL.get("air_bomb", []) == [1, 1, 1, 1, 1, 1, 1, 1, 9], "client TH level gate mirrors server", failures)
	var defense_node := Node3D.new()
	building_system._attach_building_defense_script(defense_node, "air_bomb")
	_expect(defense_node.get_script() == TowerScript, "BuildingSystem attaches TowerAirBomb runtime", failures)
	_expect(defense_node.has_method("set_spawn_facing_global"), "Air Bomb accepts BuildingSystem shipPlane facing", failures)
	defense_node.free()
	building_system.free()


func _probe_tower_payload_flow(failures: Array[String]) -> void:
	var fixture := _new_fixture("AirBombTowerPayloadProbe")
	var camera_rig := ProbeCameraRig.new()
	camera_rig.name = "CameraRig"
	camera_rig.add_to_group("camera_rigs")
	fixture.add_child(camera_rig)
	var target := _make_troop("payload_target", BaseTroop.UNIT_TARGET_AIR, Vector3(1.0, 0.4, 0.0), 40)
	fixture.add_child(target)
	target.state = BaseTroop.State.INACTIVE
	var target_hp := target.hp
	var tower: Variant = _make_tower(Vector3.ZERO, 400)
	var visual := VisualScene.instantiate()
	tower.add_child(visual)
	fixture.add_child(tower)
	tower.set_physics_process(false)
	await process_frame
	await process_frame
	tower._bind_visual_controller()
	tower.scale = Vector3.ZERO
	tower.set_spawn_facing_global(Vector3.BACK * 3.0)
	tower.scale = Vector3.ONE
	await process_frame
	var delegated_facing: Vector3 = visual.get_flag_facing_global()
	_expect(delegated_facing.dot(Vector3.BACK) >= 0.999, "tower forwards shipPlane facing after the scale-from-zero spawn", failures)
	tower.position = Vector3(1.0, 0.0, 0.0)
	await process_frame
	var moved_expected: Vector3 = (
		Vector3.BACK * 3.0 - (tower as Node3D).global_position
	).normalized()
	var moved_facing: Vector3 = visual.get_flag_facing_global()
	_expect(moved_facing.dot(moved_expected) >= 0.999, "moving Air Bomb refreshes its logo toward the same shipPlane", failures)
	tower.position = Vector3.ZERO
	await process_frame
	BaseTroop.invalidate_combat_lists()
	var reload_events: Array[int] = [0]
	tower.connect("air_bomb_event", func(kind: String, _payload: Dictionary) -> void:
		if kind == "air_bomb_reload_ready":
			reload_events[0] += 1
	)
	tower._simulation_step()
	var projectile: Variant = _active_projectile(tower)
	var loaded_payload := visual.get_node("ModelRoot/PayloadAssembly") as Node3D
	_expect(is_instance_valid(projectile), "tower launches one detached payload projectile", failures)
	_expect(not loaded_payload.visible, "tower launch empties the full payload mount", failures)
	if is_instance_valid(projectile):
		_expect(projectile.MAX_HOMING_TICKS == 144, "projectile keeps the approved 144-tick homing lifetime", failures)
		_expect(projectile.find_child("Bombs_001", true, false) != null, "live projectile includes balloon A", failures)
		_expect(projectile.find_child("Bombs_002", true, false) != null, "live projectile includes balloon B", failures)
		_expect(projectile.find_child("Circle", true, false) != null, "live projectile includes barrel bomb", failures)
		_expect(projectile.find_child("Cube_024", true, false) != null, "live projectile includes suspension rig", failures)
		var launch_xz := Vector2(projectile.global_position.x, projectile.global_position.z)
		var launch_y: float = projectile.global_position.y
		for _rise_tick in range(projectile.RISE_TICKS):
			projectile._simulation_step()
			tower._simulation_step()
		var raised_xz := Vector2(projectile.global_position.x, projectile.global_position.z)
		_expect(raised_xz.is_equal_approx(launch_xz), "integrated payload has no XZ drift during rise", failures)
		_expect(projectile.global_position.y >= launch_y + 0.339, "integrated payload rises the canonical 0.34 units", failures)
		for _homing_tick in range(projectile.MAX_HOMING_TICKS):
			if bool(projectile.get_debug_snapshot().finished):
				break
			projectile._simulation_step()
			tower._simulation_step()
		var impact_snapshot: Dictionary = projectile.get_debug_snapshot()
		_expect(
			int(impact_snapshot.age_ticks) == 67,
			"integrated static target impacts on deterministic age tick 67 (actual %d)" % int(impact_snapshot.age_ticks),
			failures
		)
	_expect(target.hp == target_hp - 140, "integrated full payload reaches and damages its air target", failures)
	_expect(camera_rig.trauma_calls == 1, "impact emits exactly one camera shake", failures)
	_expect(
		is_equal_approx(camera_rig.last_trauma, projectile.IMPACT_CAMERA_TRAUMA),
		"impact uses the authored Air Bomb trauma amount",
		failures
	)
	var impact_fx := fixture.get_node_or_null("AirBombImpactFx") as Node3D
	_expect(impact_fx != null, "impact spawns the compact air-pressure VFX", failures)
	if impact_fx != null:
		_expect(impact_fx.get_meta("air_bomb_effect_profile", "") == "air_pressure", "impact VFX identifies the air-pressure profile", failures)
		_expect(impact_fx.get_meta("impact_color_profile", "") == "yellow_energy", "impact VFX identifies the yellow-energy palette", failures)
		_expect(is_equal_approx(float(impact_fx.get_meta("impact_radius", 0.0)), 0.31), "impact VFX records the authoritative 0.31 radius", failures)
		_expect(int(impact_fx.get_meta("debris_count", 0)) == 5, "impact VFX uses five deterministic debris pieces", failures)
		var pressure_ring := impact_fx.get_node_or_null("AirPressureRing") as MeshInstance3D
		var pressure_flash := impact_fx.get_node_or_null("AirPressureFlash") as MeshInstance3D
		_expect(pressure_ring != null and pressure_ring.mesh is TorusMesh, "impact VFX uses a thin pressure ring", failures)
		_expect(pressure_flash != null and pressure_flash.mesh is SphereMesh, "impact VFX uses a compact yellow flash", failures)
		if pressure_ring != null and pressure_ring.mesh is TorusMesh:
			var pressure_ring_mesh := pressure_ring.mesh as TorusMesh
			_expect(
				pressure_ring_mesh.outer_radius <= 0.31 + projectile.SPLASH_BOUNDARY_EPSILON,
				"pressure ring never exceeds the authoritative radius beyond float precision",
				failures
			)
			var pressure_material := pressure_ring.material_override as StandardMaterial3D
			_expect(_is_yellow_impact_color(pressure_material.albedo_color), "pressure ring uses the yellow impact palette", failures)
		if pressure_flash != null:
			var flash_material := pressure_flash.material_override as StandardMaterial3D
			_expect(flash_material != null and _is_yellow_impact_color(flash_material.albedo_color), "impact flash is yellow instead of white", failures)
	target.remove_from_group("troops")
	BaseTroop.invalidate_combat_lists()
	while int(tower.get_debug_snapshot().tick) < 270:
		tower._simulation_step()
	_expect(reload_events[0] == 1, "tower emits one reload-ready edge", failures)
	_expect(loaded_payload.visible, "complete two-balloon payload returns after reload", failures)
	_expect(tower.get_node_or_null("AirBombLaunchSfx") != null, "launch audio is configured", failures)
	_expect(ResourceLoader.exists(projectile.IMPACT_SFX_PATH, "AudioStream"), "impact audio resource is configured", failures)
	# Tween callbacks are observed on the next processed frame. Allow one
	# 10-FPS frame plus a small scheduling margin without changing the authored
	# 0.24-second VFX lifetime itself.
	await create_timer(projectile.IMPACT_FX_LIFETIME_SECONDS + 0.15).timeout
	_expect(fixture.get_node_or_null("AirBombImpactFx") == null, "impact VFX self-cleans after its deterministic lifetime", failures)
	await _free_fixture(fixture)


func _new_fixture(fixture_name: String) -> Node3D:
	var fixture := Node3D.new()
	fixture.name = fixture_name
	root.add_child(fixture)
	current_scene = fixture
	return fixture


func _make_tower(spawn_position: Vector3, server_id: int) -> Variant:
	var tower: Variant = Node3D.new()
	tower.position = spawn_position
	tower.set_meta("server_id", server_id)
	tower.set_script(TowerScript)
	return tower


func _make_troop(probe_name: String, target_type: String, spawn_position: Vector3, replay_order: int) -> ProbeTroop:
	var troop := ProbeTroop.new()
	troop.probe_name = probe_name
	troop.unit_target_type = target_type
	troop.position = spawn_position
	troop.set_meta("replay_order", replay_order)
	troop.add_to_group("troops")
	troop.state = BaseTroop.State.RUNNING
	troop.hp = 10000
	return troop


func _make_projectile(
	fixture: Node3D,
	start: Vector3,
	target: Node3D,
	damage: int,
	server_id: int,
	retarget_range: float = 2.25,
) -> Variant:
	var projectile: Variant = Node3D.new()
	projectile.set_script(ProjectileScript)
	fixture.add_child(projectile)
	projectile.initialize(
		start,
		target,
		damage,
		TowerScript.SPLASH_RADIUS,
		retarget_range,
		server_id,
		server_id,
		1,
		0
	)
	return projectile


func _active_projectile(tower: Variant) -> Variant:
	var active_ref: WeakRef = tower._active_projectile
	return active_ref.get_ref() if active_ref != null else null


func _step_active_projectile(tower: Variant) -> void:
	var projectile: Variant = _active_projectile(tower)
	if is_instance_valid(projectile) and not bool(projectile.get_debug_snapshot().finished):
		projectile._simulation_step()


func _free_fixture(fixture: Node) -> void:
	if is_instance_valid(fixture):
		fixture.queue_free()
	await process_frame
	await process_frame
	BaseTroop.invalidate_combat_lists()


func _mesh_uv_summary(mesh: Mesh) -> Dictionary:
	var summary := {
		"finite": true,
		"min": Vector2(INF, INF),
		"max": Vector2(-INF, -INF),
		"span": Vector2.ZERO,
		"surface_count": 0,
	}
	if mesh == null:
		summary.finite = false
		return summary
	for surface_index in mesh.get_surface_count():
		var arrays := mesh.surface_get_arrays(surface_index)
		var uvs_value: Variant = arrays[Mesh.ARRAY_TEX_UV]
		if not (uvs_value is PackedVector2Array):
			summary.finite = false
			continue
		summary.surface_count = int(summary.surface_count) + 1
		for uv in uvs_value as PackedVector2Array:
			if not uv.is_finite():
				summary.finite = false
				continue
			summary.min = (summary.min as Vector2).min(uv)
			summary.max = (summary.max as Vector2).max(uv)
	if int(summary.surface_count) > 0:
		summary.span = (summary.max as Vector2) - (summary.min as Vector2)
	return summary


func _is_yellow_impact_color(color: Color) -> bool:
	return color.r >= 0.90 and color.g >= 0.68 and color.b <= 0.45


func _expect(condition: bool, label: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(label)
