extends SceneTree

const CANNON_SCRIPT := preload("res://scripts/cannon.gd")
const OUTPUT_DIR := "res://.codex-artifacts/cannon_alignment_capture"
const TARGET_POSITION := Vector3(2.45, 0.0, 2.05)
const BUILDING_SCALES: Array[float] = [0.125, 0.12, 0.125, 0.105, 0.105, 0.10, 0.10]

var _failures: Array[String] = []
var _max_aim_error_degrees: float = 0.0
var _max_flight_error_degrees: float = 0.0
var _max_spawn_offset: float = 0.0


class AlignmentTarget:
	extends Node3D

	var hp: int = 100000
	var level: int = 7
	var unit_target_type: String = "ground"

	func take_damage(amount: int) -> void:
		hp -= amount

	func is_targetable_by_defenses() -> bool:
		return hp > 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(900, 640)
	var world := Node3D.new()
	world.name = "CannonAlignmentCaptureWorld"
	root.add_child(world)
	current_scene = world
	_build_lighting(world)

	var target := _build_target()
	world.add_child(target)
	var camera := Camera3D.new()
	camera.position = Vector3(1.25, 0.85, 1.45)
	camera.look_at_from_position(camera.position, Vector3(0.12, 0.15, 0.10))
	camera.fov = 42.0
	world.add_child(camera)
	camera.current = true

	var output_absolute := ProjectSettings.globalize_path(OUTPUT_DIR)
	DirAccess.make_dir_recursive_absolute(output_absolute)

	for level in range(1, 8):
		var cannon := await _build_cannon(world, level)
		if cannon == null:
			continue
		var base_rest: Transform3D = cannon._base.transform
		cannon._target = target
		cannon._rotate_barrel_toward_target(1.0)
		_expect(
			cannon._base.transform.is_equal_approx(base_rest),
			"L%d base moved while aiming" % level,
		)

		var muzzle_direction := _horizontal_direction(
			cannon._muzzle.global_transform.basis * cannon._barrel_forward_local
		)
		var target_direction := _horizontal_direction(
			target.global_position - cannon._muzzle.global_position
		)
		var aim_error := rad_to_deg(muzzle_direction.angle_to(target_direction))
		_max_aim_error_degrees = maxf(_max_aim_error_degrees, aim_error)
		_expect(aim_error <= 0.35, "L%d aim error is %.3f degrees" % [level, aim_error])

		cannon._start_attack_presentation()
		cannon._update_attack_presentation(cannon.FIRE_MOMENT)
		_expect(
			cannon._active_projectiles.size() == 1,
			"L%d did not spawn exactly one projectile at the fire moment" % level,
		)
		if cannon._active_projectiles.size() == 1:
			var projectile: Dictionary = cannon._active_projectiles[0]
			var spawn_position: Vector3 = projectile.spawn_position
			var muzzle_position: Vector3 = cannon._muzzle.global_position
			var spawn_offset := spawn_position.distance_to(muzzle_position)
			_max_spawn_offset = maxf(_max_spawn_offset, spawn_offset)
			_expect(
				spawn_offset <= 0.0001,
				"L%d projectile started %.6f units away from the muzzle" % [
					level,
					spawn_offset,
				],
			)

			var ball := projectile.ball as MeshInstance3D
			var ball_start: Vector3 = ball.global_position
			cannon._update_projectiles(0.08)
			var flight_direction := _horizontal_direction(ball.global_position - ball_start)
			var travel_distance: float = ball.global_position.distance_to(spawn_position)
			var trail := projectile.trail as MeshInstance3D
			var expected_trail_length: float = minf(travel_distance, cannon.TRAIL_LENGTH)
			var actual_trail_length: float = trail.global_transform.basis.y.length()
			var trail_direction: Vector3 = trail.global_transform.basis.y.normalized()
			_expect(
				is_equal_approx(actual_trail_length, expected_trail_length),
				"L%d trail length %.6f does not match %.6f" % [
					level,
					actual_trail_length,
					expected_trail_length,
				],
			)
			_expect(
				rad_to_deg(trail_direction.angle_to(
					(ball.global_position - spawn_position).normalized()
				)) <= 0.10,
				"L%d trail does not align with projectile flight" % level,
			)
			var expected_flight_direction := _horizontal_direction(
				target.global_position + Vector3(0.0, 0.20, 0.0) - ball_start
			)
			var flight_error := rad_to_deg(
				flight_direction.angle_to(expected_flight_direction)
			)
			_max_flight_error_degrees = maxf(
				_max_flight_error_degrees,
				flight_error,
			)
			_expect(
				flight_error <= 0.10,
				"L%d initial projectile direction error is %.3f degrees" % [
					level,
					flight_error,
				],
			)
			_expect(
				cannon._base.transform.is_equal_approx(base_rest),
				"L%d base moved during firing/recoil" % level,
			)

		await _capture("level_%02d_flight.png" % level)
		cannon.queue_free()
		await process_frame
		await process_frame

	world.queue_free()
	await process_frame
	await process_frame
	_shutdown_test_audio()
	await process_frame
	await process_frame

	if _failures.is_empty():
		print(
			(
				"CANNON_ALIGNMENT_CAPTURE_OK levels=7 max_aim_error_deg=%.4f"
				+ " max_flight_error_deg=%.4f max_spawn_offset=%.6f output=%s"
			) % [
				_max_aim_error_degrees,
				_max_flight_error_degrees,
				_max_spawn_offset,
				output_absolute,
			]
		)
		quit(0)
		return
	for failure in _failures:
		push_error("Cannon alignment capture: " + failure)
	quit(1)


func _build_cannon(world: Node3D, level: int) -> Node3D:
	var scene_path := "res://Model/cannons/level_%02d/cannon_level_%02d.tscn" % [
		level,
		level,
	]
	var packed := load(scene_path) as PackedScene
	_expect(packed != null, "L%d scene is missing" % level)
	if packed == null:
		return null
	var cannon := Node3D.new()
	cannon.name = "CannonAlignmentL%d" % level
	cannon.set_script(CANNON_SCRIPT)
	cannon.attack_sfx_enabled = false
	var visual := packed.instantiate() as Node3D
	visual.scale = Vector3.ONE * BUILDING_SCALES[level - 1]
	cannon.add_child(visual)
	world.add_child(cannon)
	await process_frame
	cannon.set_level(level)
	await process_frame
	await process_frame
	cannon.set_physics_process(false)
	_expect(cannon._visuals_ready, "L%d visual hierarchy was not discovered" % level)
	return cannon


func _build_lighting(world: Node3D) -> void:
	var environment := WorldEnvironment.new()
	var environment_resource := Environment.new()
	environment_resource.background_mode = Environment.BG_COLOR
	environment_resource.background_color = Color(0.055, 0.07, 0.09)
	environment_resource.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment_resource.ambient_light_color = Color(0.62, 0.67, 0.74)
	environment_resource.ambient_light_energy = 0.78
	environment.environment = environment_resource
	world.add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-54.0, -38.0, 0.0)
	sun.light_energy = 1.5
	sun.shadow_enabled = true
	world.add_child(sun)

	var ground_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(10.0, 10.0)
	ground_mesh.mesh = plane
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color(0.14, 0.22, 0.17)
	ground_material.roughness = 0.92
	ground_mesh.material_override = ground_material
	world.add_child(ground_mesh)


func _build_target() -> AlignmentTarget:
	var target := AlignmentTarget.new()
	target.name = "AngledGroundTarget"
	target.position = TARGET_POSITION
	target.add_to_group("troops")
	var target_mesh := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.16
	capsule.height = 0.72
	target_mesh.mesh = capsule
	target_mesh.position.y = 0.36
	var target_material := StandardMaterial3D.new()
	target_material.albedo_color = Color(0.64, 0.12, 0.09)
	target_material.emission_enabled = true
	target_material.emission = Color(0.16, 0.015, 0.005)
	target_mesh.material_override = target_material
	target.add_child(target_mesh)
	return target


func _horizontal_direction(direction: Vector3) -> Vector3:
	var horizontal := direction
	horizontal.y = 0.0
	if horizontal.length_squared() <= 0.000001:
		return Vector3.FORWARD
	return horizontal.normalized()


func _capture(file_name: String) -> void:
	await process_frame
	await process_frame
	var image := root.get_texture().get_image()
	var output_path := OUTPUT_DIR.path_join(file_name)
	var error := image.save_png(output_path)
	if error != OK:
		_failures.append("failed to save %s: %s" % [output_path, error_string(error)])


func _shutdown_test_audio() -> void:
	var audio_manager := root.get_node_or_null("AudioManager")
	if is_instance_valid(audio_manager):
		for child in audio_manager.get_children():
			if child is AudioStreamPlayer:
				child.stop()
				child.stream = null
		audio_manager.free()


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
