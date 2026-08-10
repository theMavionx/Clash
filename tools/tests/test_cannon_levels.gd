extends SceneTree

const CANNON_SCRIPT := preload("res://scripts/cannon.gd")
const BUILDING_SYSTEM_SCRIPT := preload("res://scripts/building_system.gd")
const COMBAT_GRID_CONFIG_PATH := "res://server/combat_grid.generated.json"
const MAX_ATTACK_ZONE_FACING_ERROR_DEGREES: float = 1.0
const EXPECTED_BUILDING_SCALES: Array[float] = [
	0.125,
	0.12,
	0.125,
	0.105,
	0.105,
	0.10,
	0.10,
]
const EXPECTED_STATS: Dictionary = {
	1: {"damage": 40, "fire_rate": 1.60, "detect_range": 1.00},
	2: {"damage": 109, "fire_rate": 1.60, "detect_range": 1.04},
	3: {"damage": 259, "fire_rate": 1.60, "detect_range": 1.08},
	4: {"damage": 431, "fire_rate": 1.60, "detect_range": 1.12},
	5: {"damage": 510, "fire_rate": 1.60, "detect_range": 1.20},
	6: {"damage": 577, "fire_rate": 1.60, "detect_range": 1.28},
	7: {"damage": 620, "fire_rate": 1.60, "detect_range": 1.36},
}

var _failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := Node3D.new()
	world.name = "CannonLevelsTestWorld"
	root.add_child(world)
	current_scene = world

	var combat_grids := _load_combat_grids()
	_expect(not combat_grids.is_empty(), "Generated combat grid config is unavailable")
	var home_grid: Dictionary = combat_grids.get("0", {})
	var attack_grid: Dictionary = combat_grids.get("2", {})
	_expect(not home_grid.is_empty(), "Home grid 0 is missing")
	_expect(not attack_grid.is_empty(), "Attack grid 2 is missing")
	var home_center := Vector3(
		float(home_grid.get("grid_center_x", 0.0)),
		0.0,
		float(home_grid.get("grid_center_z", 0.0)),
	)
	var attack_zone_center := Vector3(
		float(attack_grid.get("grid_center_x", 0.0)),
		0.0,
		float(attack_grid.get("grid_center_z", 1.0)),
	)
	var home_grid_rotation := float(home_grid.get("grid_rotation", 0.0))

	var definition_holder = BUILDING_SYSTEM_SCRIPT.new()
	var cannon_definition: Dictionary = definition_holder.building_defs["cannon"]
	var building_scales: Array = cannon_definition.get("model_scales", [])
	_expect(
		building_scales.size() >= 10,
		"Cannon progression must expose visual scales through L10",
	)
	for scale_index in range(mini(building_scales.size(), EXPECTED_BUILDING_SCALES.size())):
		_expect(
			is_equal_approx(
				float(building_scales[scale_index]),
				EXPECTED_BUILDING_SCALES[scale_index],
			),
			"Cannon L%d scale does not match the validated 3x3 footprint profile"
			% (scale_index + 1),
		)
	_expect(
		is_equal_approx(float(cannon_definition.get("model_rotation_y", 0.0)), 270.0),
		"Cannon default orientation must face straight toward the gameplay camera",
	)
	_expect(
		is_zero_approx(
			fposmod(float(definition_holder._get_model_rotation_y(cannon_definition)), 360.0)
		),
		"Cannon composed gameplay orientation must point along the camera-facing axis",
	)
	var visual_heights: Array[float] = []
	var max_attack_zone_facing_error: float = 0.0

	for level in range(1, 8):
		var scene_path := "res://Model/cannons/level_%02d/cannon_level_%02d.tscn" % [
			level,
			level,
		]
		var packed := load(scene_path) as PackedScene
		_expect(packed != null, "L%d scene is missing" % level)
		if packed == null:
			continue

		var cannon := Node3D.new()
		cannon.name = "CannonDefenseL%d" % level
		cannon.set_script(CANNON_SCRIPT)
		cannon.attack_sfx_enabled = false
		cannon.position = home_center
		cannon.rotation.y = home_grid_rotation
		var visual := packed.instantiate() as Node3D
		visual.scale = Vector3.ONE * float(building_scales[level - 1])
		visual.rotation_degrees.y = definition_holder._get_model_rotation_y(
			cannon_definition
		)
		cannon.add_child(visual)
		world.add_child(cannon)
		await process_frame
		cannon.set_level(level)
		await process_frame
		await process_frame
		cannon.set_spawn_facing_global(attack_zone_center)
		await process_frame
		cannon.set_physics_process(false)

		var expected: Dictionary = EXPECTED_STATS[level]
		_expect(cannon.level == level, "L%d runtime level was clamped incorrectly" % level)
		_expect(cannon.damage == expected.damage, "L%d damage mismatch" % level)
		_expect(
			is_equal_approx(cannon.fire_rate, float(expected.fire_rate)),
			"L%d fire interval mismatch" % level,
		)
		_expect(
			is_equal_approx(cannon.detect_range, float(expected.detect_range)),
			"L%d range mismatch" % level,
		)
		_expect(cannon._visuals_ready, "L%d visual hierarchy was not discovered" % level)
		if cannon._visuals_ready:
			var visual_bounds := AABB()
			var has_visual_bounds := false
			for visual_mesh in [cannon._base, cannon._barrel]:
				var mesh_instance := visual_mesh as MeshInstance3D
				if mesh_instance == null or mesh_instance.mesh == null:
					continue
				var mesh_bounds: AABB = (
					mesh_instance.global_transform * mesh_instance.get_aabb()
				)
				if has_visual_bounds:
					visual_bounds = visual_bounds.merge(mesh_bounds)
				else:
					visual_bounds = mesh_bounds
					has_visual_bounds = true
			_expect(has_visual_bounds, "L%d has no measurable visual bounds" % level)
			visual_heights.append(visual_bounds.size.y if has_visual_bounds else 0.0)
			_expect(
				str(cannon._base.name) == "Cannon%dBase" % level,
				"L%d fixed base node mismatch" % level,
			)
			_expect(
				str(cannon._barrel.name) == "Cannon%d" % level,
				"L%d rotating barrel node mismatch" % level,
			)
			_expect(
				cannon._muzzle.get_parent() == cannon._barrel,
				"L%d muzzle is not parented to the barrel" % level,
			)
			var muzzle_direction := _horizontal_direction(
				cannon._muzzle.global_transform.basis * cannon._barrel_forward_local
			)
			var attack_zone_direction := _horizontal_direction(
				attack_zone_center - cannon.global_position
			)
			var facing_error := rad_to_deg(
				muzzle_direction.angle_to(attack_zone_direction)
			)
			max_attack_zone_facing_error = maxf(
				max_attack_zone_facing_error,
				facing_error,
			)
			_expect(
				facing_error <= MAX_ATTACK_ZONE_FACING_ERROR_DEGREES,
				"L%d default muzzle misses the attack zone by %.3f degrees" % [
					level,
					facing_error,
				],
			)
			var base_mesh := cannon._base as MeshInstance3D
			var base_width: float = 0.0
			var base_top_y: float = 0.0
			if base_mesh != null and base_mesh.mesh != null:
				var base_in_cannon: Transform3D = (
					cannon.global_transform.affine_inverse()
					* base_mesh.global_transform
				)
				var base_bounds: AABB = base_in_cannon * base_mesh.get_aabb()
				var base_span := maxf(base_bounds.size.x, base_bounds.size.z)
				base_width = base_bounds.size.x
				base_top_y = base_bounds.position.y + base_bounds.size.y
				_expect(
					base_span >= 0.30 and base_span <= 0.40,
					"L%d base span %.4f is outside the validated 3x3 visual range" % [
						level,
						base_span,
					],
				)
				if level >= 2:
					_expect(
						base_mesh.mesh.get_surface_count() >= 2,
						"L%d fixed decor was not moved onto the base mesh" % level,
					)
					_expect(
						base_mesh.get_surface_override_material(1) != null,
						"L%d fixed decor lost its authored barrel material" % level,
					)
			var barrel_mesh := cannon._barrel as MeshInstance3D
			if barrel_mesh != null and barrel_mesh.mesh != null:
				var barrel_aabb := barrel_mesh.mesh.get_aabb()
				var barrel_front := barrel_aabb.position.z + barrel_aabb.size.z
				_expect(
					cannon._muzzle.position.z >= barrel_front - 0.03,
					"L%d muzzle is not at the barrel opening" % level,
				)
				if base_width > 0.0:
					var barrel_in_cannon: Transform3D = (
						cannon.global_transform.affine_inverse()
						* barrel_mesh.global_transform
					)
					var barrel_bounds: AABB = (
						barrel_in_cannon * barrel_mesh.get_aabb()
					)
					if level == 1:
						_expect(
							barrel_bounds.position.y >= base_top_y - 0.006,
							(
								"L1 barrel overlaps the fixed body by %.4f units"
							) % [base_top_y - barrel_bounds.position.y],
						)
					else:
						_expect(
							barrel_bounds.size.x <= base_width * 0.65,
							(
								"L%d rotating mesh is %.4f wide relative to fixed base %.4f;"
								+ " static decor is still attached"
							) % [level, barrel_bounds.size.x, base_width],
						)
			var base_rest: Transform3D = cannon._base.transform
			cannon._barrel_yaw = deg_to_rad(35.0)
			cannon._apply_barrel_visual(0.12, Vector3(1.02, 0.98, 0.96))
			_expect(
				cannon._base.transform.is_equal_approx(base_rest),
				"L%d base moved while barrel yaw/recoil was applied" % level,
			)

		cannon.queue_free()
		await process_frame
		await process_frame

	if visual_heights.size() == 7:
		_expect(
			visual_heights[0] <= visual_heights[6] * 1.12,
			"L1 height %.4f is oversized relative to L7 height %.4f" % [
				visual_heights[0],
				visual_heights[6],
			],
		)

	definition_holder.free()
	world.queue_free()
	await process_frame
	await process_frame
	_shutdown_test_audio()
	await process_frame
	await process_frame

	if _failures.is_empty():
		print(
			(
				"CANNON_LEVELS_TEST_OK levels=1-7 visuals=7 fixed_bases=7"
				+ " scaled_footprints=7 l1_height=%.4f l7_height=%.4f"
				+ " max_attack_zone_facing_error_deg=%.4f"
			) % [
				visual_heights[0],
				visual_heights[6],
				max_attack_zone_facing_error,
			]
		)
		quit(0)
		return
	for failure in _failures:
		push_error("Cannon levels test: " + failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _load_combat_grids() -> Dictionary:
	if not FileAccess.file_exists(COMBAT_GRID_CONFIG_PATH):
		return {}
	var parsed: Variant = JSON.parse_string(
		FileAccess.get_file_as_string(COMBAT_GRID_CONFIG_PATH)
	)
	if not parsed is Dictionary:
		return {}
	var parsed_dictionary := parsed as Dictionary
	var grids: Variant = parsed_dictionary.get("grids", {})
	return grids as Dictionary if grids is Dictionary else {}


func _horizontal_direction(direction: Vector3) -> Vector3:
	direction.y = 0.0
	if direction.length_squared() <= 0.000001:
		return Vector3.FORWARD
	return direction.normalized()


func _shutdown_test_audio() -> void:
	var audio_manager := root.get_node_or_null("AudioManager")
	if is_instance_valid(audio_manager):
		for child in audio_manager.get_children():
			if child is AudioStreamPlayer:
				child.stop()
				child.stream = null
		audio_manager.free()
