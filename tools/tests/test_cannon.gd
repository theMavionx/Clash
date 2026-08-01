extends SceneTree

const CANNON_SCRIPT := preload("res://scripts/cannon.gd")
const CANNON_SCENE := preload("res://Model/cannons/level_01/cannon_level_01.tscn")

var _failures: Array[String] = []


class TestTroop:
	extends Node3D

	var hp: int = 1000
	var level: int = 1
	var unit_target_type: String = "ground"
	var hit_count: int = 0

	func take_damage(amount: int) -> void:
		hit_count += 1
		hp -= amount

	func is_targetable_by_defenses() -> bool:
		return hp > 0

	func _get_troop_name() -> String:
		return "test_troop"


class TelemetryRecorder:
	extends Node

	var events: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		events.append({"kind": kind, "payload": payload.duplicate(true)})


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := Node3D.new()
	world.name = "CannonTestWorld"
	root.add_child(world)
	current_scene = world

	var telemetry := TelemetryRecorder.new()
	telemetry.add_to_group("building_systems")
	world.add_child(telemetry)

	var cannon := Node3D.new()
	cannon.name = "CannonDefense"
	cannon.set_script(CANNON_SCRIPT)
	cannon.attack_sfx_enabled = false
	cannon.add_child(CANNON_SCENE.instantiate())
	world.add_child(cannon)
	await process_frame
	await process_frame
	cannon.set_physics_process(false)

	_expect(cannon._visuals_ready, "required Cannon visual nodes were not discovered")
	_expect(cannon._pool_ready, "projectile pool did not build eagerly")
	_expect(cannon.damage == 40, "L1 Cannon damage is not 40")
	_expect(is_equal_approx(cannon.fire_rate, 1.60), "L1 Cannon fire interval is not 1.60")
	_expect(is_equal_approx(cannon.detect_range, 1.35), "L1 Cannon range is not 1.35")
	_expect(is_equal_approx(cannon.bullet_speed, 3.2), "Cannon projectile speed is not 3.2")

	var base: Node3D = cannon._base
	var barrel: Node3D = cannon._barrel
	var base_rest: Transform3D = base.transform
	var barrel_rest: Transform3D = cannon._barrel_rest_transform

	var air := TestTroop.new()
	air.name = "NearestAirTroop"
	air.unit_target_type = "air"
	air.position = Vector3(0.0, 0.0, 0.35)
	air.add_to_group("troops")
	world.add_child(air)

	var ground := TestTroop.new()
	ground.name = "GroundTroop"
	ground.position = Vector3(1.25, 0.0, 0.0)
	ground.add_to_group("troops")
	world.add_child(ground)
	BaseTroop.invalidate_troops_cache()

	# Force the deterministic scan boundary explicitly. BaseTroop.combat_delta()
	# clamps manual steps to 0.1 seconds, so relying on the prior frame remainder
	# would make target acquisition timing-dependent.
	# A ready cooldown must still wait until the remaining error is <= 5 degrees.
	cannon._fire_timer = cannon.fire_rate
	cannon._target_search_timer = cannon.TARGET_SEARCH_INTERVAL
	cannon._physics_process(0.1)
	_expect(cannon._target == ground, "nearest air troop was not ignored")
	_expect(absf(cannon._barrel_yaw) > 0.01, "barrel did not yaw toward the ground target")
	_expect(
		not cannon._presentation_active,
		"Cannon began firing while the barrel yaw error exceeded 5 degrees",
	)
	_expect(
		cannon._barrel_yaw_error > cannon.FIRE_YAW_TOLERANCE,
		"test target did not leave enough yaw error to exercise the fire gate",
	)
	_expect_transform(base.transform, base_rest, "authored base changed while aiming")

	for step in range(8):
		cannon._physics_process(0.05)
		if cannon._presentation_active:
			break
	_expect(
		cannon._barrel_yaw_error <= cannon.FIRE_YAW_TOLERANCE,
		"barrel did not converge inside the 5-degree fire tolerance",
	)
	_expect(cannon._presentation_active, "ready shot did not begin immediately after alignment")
	cannon._cancel_presentation()
	cannon._fire_timer = 0.0

	# Advance at fixed simulation steps and prove the projectile does not fire
	# before the configured cadence. Presentation starts FIRE_MOMENT earlier,
	# but projectile activation remains aligned with the combat interval.
	var elapsed_to_fire: float = 0.0
	while cannon._active_projectiles.is_empty() and elapsed_to_fire < cannon.fire_rate + 0.15:
		cannon._physics_process(0.05)
		elapsed_to_fire += 0.05
	_expect(
		elapsed_to_fire >= cannon.fire_rate - 0.001,
		"Cannon projectile activated before the configured cadence",
	)
	_expect(
		cannon._active_projectiles.size() == 1,
		"Cannon projectile did not activate on the configured cadence",
	)
	_expect(
		elapsed_to_fire <= cannon.fire_rate + 0.10,
		"Cannon projectile activated too late for the configured cadence",
	)
	for projectile in cannon._active_projectiles.duplicate():
		cannon._return_projectile(projectile)
	cannon._active_projectiles.clear()
	cannon._cancel_presentation()
	cannon._fire_timer = 0.0

	# Exercise the phase-driven presentation directly so its documented moments
	# can be asserted without relying on wall-clock timing.
	cannon._start_attack_presentation()
	cannon._update_attack_presentation(cannon.ANTICIPATION_END)
	var anticipation_scale: Vector3 = barrel.transform.basis.get_scale()
	var anticipation_profile: Vector3 = cannon.ANTICIPATION_SCALE
	var expected_anticipation_scale: Vector3 = (
		barrel_rest.basis.get_scale() * anticipation_profile
	)
	_expect(
		anticipation_scale.is_equal_approx(expected_anticipation_scale),
		"anticipation did not reach the specified squash/stretch scale",
	)
	_expect_transform(base.transform, base_rest, "authored base changed during anticipation")

	cannon._update_attack_presentation(
		cannon.RECOIL_PEAK_MOMENT - cannon.ANTICIPATION_END
	)
	var recoil_distance: float = barrel.transform.origin.distance_to(barrel_rest.origin)
	_expect(
		is_equal_approx(recoil_distance, cannon.RECOIL_DISTANCE),
		"barrel did not reach the 0.18-unit recoil peak",
	)
	_expect(cannon._active_projectiles.size() == 1, "fire phase did not spawn one projectile")
	var visual_projectile: Dictionary = cannon._active_projectiles[0]
	var ball_mesh := (visual_projectile.ball as MeshInstance3D).mesh as SphereMesh
	var ball_material := (
		(visual_projectile.ball as MeshInstance3D).material_override
		as StandardMaterial3D
	)
	_expect(
		(
			ball_mesh != null
			and is_equal_approx(ball_mesh.radius, cannon.BALL_RADIUS)
			and ball_mesh.radius >= 0.03
		),
		"pooled cannonball is outside the normalized game-scale visual profile",
	)
	_expect(
		(
			ball_material != null
			and ball_material.albedo_color.is_equal_approx(Color(0.05, 0.05, 0.05, 1.0))
			and ball_material.shading_mode == BaseMaterial3D.SHADING_MODE_UNSHADED
		),
		"Cannon projectile does not match the Main Ship matte-black material",
	)
	_expect(
		(visual_projectile.highlight as MeshInstance3D).visible,
		"cannonball readability highlight is not active during flight",
	)
	_expect_transform(base.transform, base_rest, "authored base changed during recoil")

	cannon._update_attack_presentation(
		cannon.PRESENTATION_END - cannon.RECOIL_PEAK_MOMENT
	)
	_expect(not cannon._presentation_active, "presentation did not finish at 0.32 seconds")
	_expect(
		barrel.transform.origin.is_equal_approx(barrel_rest.origin),
		"recovery did not restore the captured barrel rest position",
	)
	_expect(
		barrel.transform.basis.get_scale().is_equal_approx(barrel_rest.basis.get_scale()),
		"recovery did not restore the captured barrel rest scale",
	)
	_expect_transform(base.transform, base_rest, "authored base changed after recovery")

	var projectile_steps: int = 0
	var saw_readable_mid_flight: bool = false
	while not cannon._active_projectiles.is_empty() and projectile_steps < 100:
		cannon._update_projectiles(0.025)
		projectile_steps += 1
		if not cannon._active_projectiles.is_empty():
			var flying: Dictionary = cannon._active_projectiles[0]
			var flying_ball := flying.ball as MeshInstance3D
			var total_distance: float = (
				ground.global_position
				+ Vector3(0.0, 0.20, 0.0)
				- (flying.spawn_position as Vector3)
			).length()
			var travelled: float = flying_ball.global_position.distance_to(
				flying.spawn_position as Vector3
			)
			var flight_progress: float = travelled / maxf(total_distance, 0.001)
			if flight_progress >= 0.25 and flight_progress <= 0.75:
				saw_readable_mid_flight = (
					flying_ball.visible
					and (flying.highlight as MeshInstance3D).visible
					and (flying.trail as MeshInstance3D).visible
				)
	_expect(saw_readable_mid_flight, "readable cannonball/trail was not active mid-flight")
	_expect(cannon._active_projectiles.is_empty(), "projectile did not impact or return to pool")
	for pooled_projectile in cannon._projectile_pool:
		_expect(
			not bool(pooled_projectile.active),
			"projectile slot remained active after hitting the troop",
		)
		_expect(
			not (pooled_projectile.ball as MeshInstance3D).visible,
			"cannonball remained visible on the field after hitting the troop",
		)
		_expect(
			not (pooled_projectile.trail as MeshInstance3D).visible,
			"projectile trail remained visible on the field after hitting the troop",
		)
		_expect(
			not (pooled_projectile.flash as MeshInstance3D).visible,
			"muzzle flash remained visible on the field after hitting the troop",
		)
		_expect(
			not pooled_projectile.has("impact")
			and not pooled_projectile.has("impact_core"),
			"removed impact visuals are still allocated in the projectile pool",
		)
	_expect(ground.hp == 960, "projectile did not apply exactly 40 damage")
	_expect(ground.hit_count == 1, "projectile applied damage more than once")
	for step in range(5):
		cannon._update_projectiles(0.05)
	_expect(ground.hp == 960 and ground.hit_count == 1, "pooled projectile damaged twice")

	_expect(
		_has_telemetry_event(telemetry.events, "defense_fire"),
		"Cannon fire telemetry was not recorded",
	)
	_expect(
		_has_telemetry_event(telemetry.events, "defense_projectile_hit"),
		"Cannon hit telemetry was not recorded",
	)
	_expect(
		_all_telemetry_is_cannon(telemetry.events),
		"Cannon telemetry used the wrong defense_type",
	)

	var timer_before_freeze: float = 0.4
	cannon._fire_timer = timer_before_freeze
	cannon.freeze_for(0.3)
	cannon._physics_process(0.1)
	_expect(
		is_equal_approx(cannon._fire_timer, timer_before_freeze),
		"freeze advanced the Cannon firing cooldown",
	)

	cannon.set_ward_bonus_pct(25)
	_expect(cannon.damage == 50, "ward bonus was not applied to Cannon damage")
	cannon.set_ward_bonus_pct(0)
	_expect(cannon.damage == 40, "clearing ward bonus did not restore L1 damage")
	cannon.set_level(7)
	_expect(cannon.damage == 1080, "L7 Cannon damage is not 1080")
	_expect(is_equal_approx(cannon.fire_rate, 1.60), "L7 Cannon fire interval is not the fixed 1.60 seconds")
	_expect(is_equal_approx(cannon.detect_range, 2.00), "L7 Cannon range is not 2.00")

	if cannon._attack_sfx_player != null:
		cannon._attack_sfx_player.stop()
		cannon._attack_sfx_player.stream = null
	cannon._attack_sfx_streams.clear()
	BaseTroop.invalidate_troops_cache()
	world.queue_free()
	await process_frame
	await process_frame
	await process_frame
	_shutdown_test_audio()
	await process_frame
	await process_frame

	if _failures.is_empty():
		print(
			"PASS: Cannon base/yaw gate/ground targeting/projectile/recoil/freeze/ward/telemetry"
		)
		quit(0)
		return
	for failure in _failures:
		push_error("Cannon test: " + failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _expect_transform(actual: Transform3D, expected: Transform3D, message: String) -> void:
	if not actual.is_equal_approx(expected):
		_failures.append(message)


func _has_telemetry_event(events: Array[Dictionary], kind: String) -> bool:
	for event in events:
		if str(event.get("kind", "")) == kind:
			return true
	return false


func _all_telemetry_is_cannon(events: Array[Dictionary]) -> bool:
	if events.is_empty():
		return false
	for event in events:
		var payload: Dictionary = event.get("payload", {})
		if str(payload.get("defense_type", "")) != "cannon":
			return false
	return true


func _shutdown_test_audio() -> void:
	var audio_manager := root.get_node_or_null("AudioManager")
	if is_instance_valid(audio_manager):
		for child in audio_manager.get_children():
			if child is AudioStreamPlayer:
				child.stop()
				child.stream = null
		audio_manager.free()
