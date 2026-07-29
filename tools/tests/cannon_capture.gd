extends SceneTree

const CANNON_SCRIPT := preload("res://scripts/cannon.gd")
const CANNON_SCENE := preload("res://Model/cannons/level_01/cannon_level_01.tscn")
const OUTPUT_DIR := "res://.codex-artifacts/cannon_capture"

var _failures: Array[String] = []


class CaptureTarget:
	extends Node3D

	var hp: int = 1000
	var level: int = 1
	var unit_target_type: String = "ground"

	func take_damage(amount: int) -> void:
		hp -= amount

	func is_targetable_by_defenses() -> bool:
		return hp > 0


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(768, 512)
	var world := Node3D.new()
	root.add_child(world)
	current_scene = world

	var environment := WorldEnvironment.new()
	var environment_resource := Environment.new()
	environment_resource.background_mode = Environment.BG_COLOR
	environment_resource.background_color = Color(0.055, 0.075, 0.09)
	environment_resource.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment_resource.ambient_light_color = Color(0.54, 0.62, 0.72)
	environment_resource.ambient_light_energy = 0.65
	environment.environment = environment_resource
	world.add_child(environment)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-52.0, -35.0, 0.0)
	sun.light_energy = 1.35
	sun.shadow_enabled = true
	world.add_child(sun)

	var ground_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(8.0, 8.0)
	ground_mesh.mesh = plane
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color(0.16, 0.24, 0.18)
	ground_material.roughness = 0.9
	ground_mesh.material_override = ground_material
	world.add_child(ground_mesh)

	var cannon := Node3D.new()
	cannon.name = "CannonCapture"
	cannon.set_script(CANNON_SCRIPT)
	cannon.add_child(CANNON_SCENE.instantiate())
	world.add_child(cannon)

	var target := CaptureTarget.new()
	target.name = "GroundTarget"
	target.position = Vector3(1.45, 0.0, 0.0)
	target.add_to_group("troops")
	var target_mesh := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.13
	capsule.height = 0.5
	target_mesh.mesh = capsule
	target_mesh.position.y = 0.25
	var target_material := StandardMaterial3D.new()
	target_material.albedo_color = Color(0.48, 0.16, 0.12)
	target_mesh.material_override = target_material
	target.add_child(target_mesh)
	world.add_child(target)

	var camera := Camera3D.new()
	camera.position = Vector3(4.2, 3.25, 4.8)
	camera.look_at_from_position(camera.position, Vector3(0.0, 1.0, 0.0))
	camera.fov = 38.0
	world.add_child(camera)
	camera.current = true

	await process_frame
	await process_frame
	cannon.set_physics_process(false)
	cannon._target = target
	cannon._rotate_barrel_toward_target(1.0)

	var output_absolute := ProjectSettings.globalize_path(OUTPUT_DIR)
	DirAccess.make_dir_recursive_absolute(output_absolute)

	cannon._start_attack_presentation()
	cannon._update_attack_presentation(cannon.ANTICIPATION_END)
	await _capture("01_anticipation.png")

	cannon._update_attack_presentation(cannon.FIRE_MOMENT - cannon.ANTICIPATION_END)
	await _capture("02_fire.png")

	cannon._update_attack_presentation(cannon.RECOIL_PEAK_MOMENT - cannon.FIRE_MOMENT)
	await _capture("03_recoil_peak.png")

	cannon._update_attack_presentation(0.10)
	await _capture("04_recovery.png")

	var flight_projectile: Dictionary = cannon._active_projectiles[0]
	var flight_spawn: Vector3 = flight_projectile.spawn_position
	var flight_target: Vector3 = target.global_position + Vector3(0.0, 0.20, 0.0)
	var flight_distance: float = flight_spawn.distance_to(flight_target)
	for step in range(100):
		if cannon._active_projectiles.is_empty():
			break
		var ball := flight_projectile.ball as MeshInstance3D
		var flight_progress: float = ball.global_position.distance_to(flight_spawn) / flight_distance
		if flight_progress >= 0.42:
			break
		cannon._update_projectiles(0.016)
	_expect(
		not cannon._active_projectiles.is_empty(),
		"projectile impacted before the mid-flight capture",
	)
	if not cannon._active_projectiles.is_empty():
		_expect(
			(flight_projectile.ball as MeshInstance3D).visible
			and (flight_projectile.highlight as MeshInstance3D).visible
			and (flight_projectile.trail as MeshInstance3D).visible,
			"mid-flight cannonball, highlight, or trail is not visible",
		)
	await _capture("05_projectile_flight.png")

	for step in range(100):
		if cannon._active_projectiles.is_empty():
			break
		cannon._update_projectiles(0.016)
	_expect(cannon._active_projectiles.is_empty(), "projectile did not reach the capture target")
	for pooled_projectile in cannon._projectile_pool:
		_expect(
			not bool(pooled_projectile.active)
			and not (pooled_projectile.ball as MeshInstance3D).visible
			and not (pooled_projectile.trail as MeshInstance3D).visible
			and not (pooled_projectile.flash as MeshInstance3D).visible,
			"projectile visual remained on the field after the hit",
		)
	await _capture("06_after_hit.png")

	if _failures.is_empty():
		print("CAPTURED: ", output_absolute)
	else:
		for failure in _failures:
			push_error("Cannon capture: " + failure)
	world.queue_free()
	await process_frame
	await process_frame
	quit(0 if _failures.is_empty() else 1)


func _capture(file_name: String) -> void:
	await process_frame
	await process_frame
	var image := root.get_texture().get_image()
	var output_path := OUTPUT_DIR.path_join(file_name)
	var error := image.save_png(output_path)
	if error != OK:
		_failures.append("failed to save %s: %s" % [output_path, error_string(error)])


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
