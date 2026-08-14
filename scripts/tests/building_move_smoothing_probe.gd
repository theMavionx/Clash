extends SceneTree

const BuildingSystemScript := preload("res://scripts/building_system.gd")
const TEST_FPS: Array[int] = [10, 20, 30, 60, 120]
const CELL_SIZE := 0.25
const EPSILON := 0.00001

var _failures: Array[String] = []


func _initialize() -> void:
	_run_smoothing_checks()
	_run_touch_state_checks()
	_run_grid_source_checks()
	_run_art_contract_checks()
	if _failures.is_empty():
		print("BUILDING_MOVE_SMOOTHING_PROBE_PASS")
		quit(0)
		return
	for failure in _failures:
		push_error("BUILDING_MOVE_SMOOTHING_PROBE_FAIL: %s" % failure)
	quit(1)


func _run_smoothing_checks() -> void:
	var start := Vector3.ZERO
	var target := Vector3(1.5, 0.0, 2.0) # Exactly ten test cells away.
	var settled_targets: Array[Vector3] = []
	for fps in TEST_FPS:
		var delta := 1.0 / float(fps)
		var current := start
		var previous_distance := current.distance_to(target)
		for _frame in range(fps * 3):
			var next: Vector3 = BuildingSystemScript.move_visual_step(
				current,
				target,
				delta,
				CELL_SIZE
			)
			var next_distance := next.distance_to(target)
			_expect(
				next_distance <= previous_distance + EPSILON,
				"%d FPS follow was not monotonic" % fps
			)
			_expect(
				current.distance_to(next) <= CELL_SIZE * 10.0 * delta + EPSILON,
				"%d FPS follow exceeded the ten-cell-per-second cap" % fps
			)
			_expect(
				(next - start).dot(target - start) <= (target - start).length_squared() + EPSILON,
				"%d FPS follow overshot its target" % fps
			)
			current = next
			previous_distance = next_distance
		settled_targets.append(current)
		_expect(current == target, "%d FPS follow did not settle exactly" % fps)
	for settled in settled_targets:
		_expect(settled == target, "frame-rate variants did not resolve to the identical target")

	var long_frame: Vector3 = BuildingSystemScript.move_visual_step(
		Vector3.ZERO,
		Vector3(100.0, 0.0, 0.0),
		1.0,
		CELL_SIZE
	)
	_expect(
		long_frame.length() <= CELL_SIZE + EPSILON,
		"long-frame safety clamp allowed more than 0.1 seconds of movement"
	)


func _run_grid_source_checks() -> void:
	var building_system = BuildingSystemScript.new()
	building_system.grid_width = 7
	building_system.grid_height = 5
	building_system.cell_size = CELL_SIZE
	building_system.grid_extent_x = 1.75
	building_system.grid_extent_z = 1.60
	building_system.grid.resize(35)
	building_system.grid.fill(false)

	_expect(
		building_system.grid_logical_extents().is_equal_approx(Vector2(1.75, 1.25)),
		"grid visual extents were not derived from width/height times cell size"
	)
	_expect(
		building_system._grid_to_local(Vector2i.ZERO).is_equal_approx(Vector3(-0.875, 0.0, -0.8)),
		"logical grid origin shifted away from the saved-coordinate source"
	)
	var grid_mesh: QuadMesh = building_system._build_grid_visual_mesh()
	var grid_bounds := grid_mesh.get_aabb()
	_expect(grid_mesh.get_surface_count() == 1, "grid was not cached as one mesh surface/draw")
	_expect(
		grid_mesh.size.is_equal_approx(Vector2(1.75, 1.25))
		and is_equal_approx(grid_bounds.size.x, 1.75)
		and is_equal_approx(grid_bounds.size.y, 1.25),
		"grid quad footprint did not match logical width/height extents"
	)
	var target_gp := Vector2i(4, 2)
	var footprint := Vector2i(3, 3)
	var expected_target := Vector3(0.5, 0.0, 0.075)
	_expect(
		building_system.move_local_for_grid(target_gp, footprint).is_equal_approx(expected_target),
		"logical move target did not use the same saved-coordinate origin"
	)

	var source_gp := Vector2i(1, 1)
	var source_pos := building_system.move_local_for_grid(source_gp, footprint)
	var node := Node3D.new()
	node.position = building_system.move_local_for_grid(target_gp, footprint)
	var building := {"id": "mine", "node": node, "grid_pos": source_gp}
	building_system.selected_building = building
	building_system._move_source_gp = source_gp
	building_system._move_source_pos = source_pos
	building_system._is_moving = true
	building_system.current_grid_pos = target_gp
	building_system._move_target_local = source_pos
	building_system._move_commit_pending = true
	var pending_position: Vector3 = node.position
	building_system._deselect_building()
	_expect(
		building_system.selected_building == building,
		"commit pending allowed bridge deselection to clear the rollback building"
	)
	var replacement_node := Node3D.new()
	building_system._select_building({"id": "mine", "node": replacement_node, "grid_pos": Vector2i.ZERO})
	_expect(
		building_system.selected_building == building,
		"commit pending allowed selection switching to replace the rollback building"
	)
	replacement_node.free()
	building_system._process_move_visual(0.1)
	building_system._cancel_move(false)
	_expect(node.position == pending_position, "commit pending did not freeze presentation movement")
	_expect(building_system._is_moving, "commit pending allowed cancel to end the move")
	building_system._move_commit_pending = false
	# Simulate a hostile external selection mutation and source-field drift after
	# the await. Failure rollback must still use the captured building/source.
	building_system.selected_building = {}
	building_system._move_source_gp = Vector2i(0, 0)
	building_system._move_source_pos = Vector3(99.0, 0.0, 99.0)
	building_system._cancel_move(false, building, source_gp, source_pos)
	_expect(node.position == source_pos, "cancel did not restore the exact source position")
	for x in range(building_system.grid_width):
		for z in range(building_system.grid_height):
			var should_be_occupied := (
				x >= source_gp.x and x < source_gp.x + footprint.x
				and z >= source_gp.y and z < source_gp.y + footprint.y
			)
			_expect(
				building_system.grid[z * building_system.grid_width + x] == should_be_occupied,
				"cancel changed the source reservation invariant at (%d, %d)" % [x, z]
			)
	node.free()
	building_system.free()


func _run_touch_state_checks() -> void:
	var building_system = BuildingSystemScript.new()

	# The touch which entered move mode is already active, but is deliberately
	# not a pending confirmation. Releasing it must only finish that gesture.
	building_system._move_touch_owner_index = 3
	building_system._move_active_touch_indices[3] = true
	building_system._move_touch_confirm_pending = false
	_expect(
		not building_system._move_touch_released(3),
		"starting move touch release confirmed the move"
	)

	_expect(building_system._move_touch_pressed(4), "clean single touch did not begin a pending tap")
	_expect(building_system._move_touch_confirm_pending, "single touch confirmed on press instead of waiting for release")
	_expect(building_system._move_touch_released(4), "clean single-tap release did not confirm")

	_expect(building_system._move_touch_pressed(5), "drag test did not begin as a clean tap")
	building_system._move_touch_dragged(5)
	_expect(not building_system._move_touch_released(5), "ScreenDrag did not cancel pending confirmation")

	_expect(building_system._move_touch_pressed(6), "multitouch test did not begin as a clean tap")
	_expect(not building_system._move_touch_pressed(7), "second finger was treated as a confirming touch")
	_expect(not building_system._move_touch_released(7), "second finger release confirmed the move")
	_expect(not building_system._move_touch_released(6), "pinch owner release confirmed the move")
	_expect(building_system._move_active_touch_indices.is_empty(), "multitouch state did not clear after all releases")

	building_system._move_commit_pending = true
	_expect(not building_system._move_touch_pressed(8), "commit pending accepted new move input")
	_expect(building_system._move_active_touch_indices.is_empty(), "commit pending mutated touch ownership")
	building_system.free()


func _run_art_contract_checks() -> void:
	var building_system = BuildingSystemScript.new()
	building_system.grid_width = 7
	building_system.grid_height = 5
	building_system.cell_size = CELL_SIZE
	building_system.grid_extent_x = 1.75
	building_system.grid_extent_z = 1.60
	building_system._show_grid()
	_expect(
		building_system.grid_visual.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF,
		"grid shadow casting was not disabled"
	)
	_expect(
		building_system._grid_visual_mesh is QuadMesh
		and building_system._grid_visual_mesh.get_surface_count() == 1,
		"grid renderer was not exactly one logical QuadMesh draw"
	)
	_expect(
		building_system.grid_visual.position.is_equal_approx(Vector3(0.0, 0.01, -0.175))
		and is_equal_approx(building_system.grid_visual.rotation.x, -PI * 0.5),
		"procedural quad shifted the saved-coordinate grid footprint"
	)
	var grid_material := building_system.grid_visual.material_override as ShaderMaterial
	_expect(grid_material != null, "grid did not use one procedural ShaderMaterial")
	var minor_body_color := Color("14515b")
	minor_body_color.a = 0.42
	var minor_core_color := Color("c7f5ff")
	minor_core_color.a = 0.30
	var boundary_body_color := Color("082f3b")
	boundary_body_color.a = 0.88
	var boundary_core_color := Color("e8fbff")
	boundary_core_color.a = 0.78
	_expect(
		(grid_material.get_shader_parameter("grid_dimensions") as Vector2).is_equal_approx(Vector2(7.0, 5.0)),
		"grid dimension uniforms did not match logical columns/rows"
	)
	_expect(
		(grid_material.get_shader_parameter("minor_body_color") as Color).is_equal_approx(minor_body_color)
		and is_equal_approx(float(grid_material.get_shader_parameter("minor_body_width_px")), 1.65)
		and is_equal_approx(float(grid_material.get_shader_parameter("minor_body_feather_px")), 0.65)
		and (grid_material.get_shader_parameter("minor_core_color") as Color).is_equal_approx(minor_core_color)
		and is_equal_approx(float(grid_material.get_shader_parameter("minor_core_width_px")), 0.65)
		and is_equal_approx(float(grid_material.get_shader_parameter("minor_core_feather_px")), 0.35),
		"minor etched body/core shader contract is incorrect"
	)
	_expect(
		(grid_material.get_shader_parameter("boundary_body_color") as Color).is_equal_approx(boundary_body_color)
		and is_equal_approx(float(grid_material.get_shader_parameter("boundary_body_width_px")), 4.25)
		and is_equal_approx(float(grid_material.get_shader_parameter("boundary_body_feather_px")), 0.75)
		and (grid_material.get_shader_parameter("boundary_core_color") as Color).is_equal_approx(boundary_core_color)
		and is_equal_approx(float(grid_material.get_shader_parameter("boundary_core_width_px")), 1.25)
		and is_equal_approx(float(grid_material.get_shader_parameter("boundary_core_feather_px")), 0.40),
		"boundary etched body/core shader contract is incorrect"
	)
	var shader_source: String = grid_material.shader.code
	_expect(
		"fwidth(grid_coord)" in shader_source
		and "return max(axis_coverage.x, axis_coverage.y)" in shader_source,
		"grid shader did not use screen-space derivatives and max crossing coverage"
	)
	var minor_body_composite := shader_source.find("premultiplied_color = minor_body_color.rgb")
	var minor_core_composite := shader_source.find("premultiplied_color = minor_core_color.rgb")
	var boundary_body_composite := shader_source.find("premultiplied_color = boundary_body_color.rgb")
	var boundary_core_composite := shader_source.find("premultiplied_color = boundary_core_color.rgb")
	_expect(
		minor_body_composite >= 0
		and minor_body_composite < minor_core_composite
		and minor_core_composite < boundary_body_composite
		and boundary_body_composite < boundary_core_composite
		and "ALPHA = composite_alpha" in shader_source,
		"grid shader did not alpha-over body/core layers in the required order"
	)
	_expect(
		"depth_draw_never" in shader_source
		and not "depth_test_disabled" in shader_source
		and not "sampler2D" in shader_source
		and not "TIME" in shader_source,
		"grid shader violated depth-test/write, texture, or per-frame uniform constraints"
	)
	_expect(
		building_system._get_configured_grid_material() == grid_material,
		"grid material was recreated instead of cached"
	)
	var building_source := FileAccess.get_file_as_string("res://scripts/building_system.gd")
	var ghost_source_start := building_source.find("func _update_ghost(")
	var ghost_source_end := building_source.find("func _can_place(", ghost_source_start)
	var ghost_source := building_source.substr(ghost_source_start, ghost_source_end - ghost_source_start)
	var placement_indicator_start := building_source.find("func _update_placement_footprint_indicator(")
	var placement_indicator_end := building_source.find("func _can_place(", placement_indicator_start)
	var placement_indicator_source := building_source.substr(
		placement_indicator_start,
		placement_indicator_end - placement_indicator_start
	)
	var cancel_placement_start := building_source.find("func _cancel_placement(")
	var cancel_placement_end := building_source.find("func _begin_flamethrower_editor(", cancel_placement_start)
	var cancel_placement_source := building_source.substr(
		cancel_placement_start,
		cancel_placement_end - cancel_placement_start
	)
	_expect(
		ghost_source_start >= 0
		and ghost_source_end > ghost_source_start
		and "_update_placement_footprint_indicator(local_pos, def.cells, valid)" in ghost_source
		and "_hide_footprint_indicator()" in ghost_source
		and placement_indicator_start >= 0
		and placement_indicator_end > placement_indicator_start
		and "_update_move_indicator(" in placement_indicator_source,
		"placement ghost updates were not routed through the shared move footprint renderer"
	)
	_expect(
		cancel_placement_start >= 0
		and cancel_placement_end > cancel_placement_start
		and "_clear_footprint_indicator()" in cancel_placement_source,
		"placement teardown did not retain shared footprint cleanup"
	)

	building_system._update_move_indicator(Vector3.ZERO, 0.75, 0.75, true)
	var valid_fill := Color("36d978")
	valid_fill.a = 0.24
	var valid_outline := Color("d9ffea")
	valid_outline.a = 0.92
	_expect(
		(building_system._move_indicator.material_override as StandardMaterial3D).albedo_color.is_equal_approx(valid_fill),
		"valid indicator fill color/alpha drifted from the art contract"
	)
	_expect(
		building_system._move_indicator.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		and building_system._move_indicator_detail.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF,
		"indicator shadow casting was not disabled"
	)
	var valid_arrays: Array = (building_system._move_indicator_detail.mesh as ImmediateMesh).surface_get_arrays(0)
	var valid_vertices := valid_arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array
	_expect(
		(building_system._move_indicator_detail.material_override as StandardMaterial3D).albedo_color.is_equal_approx(valid_outline),
		"valid indicator outline color/alpha is incorrect"
	)
	_expect(
		is_equal_approx(valid_vertices[2].y - valid_vertices[1].y, CELL_SIZE * 0.075),
		"valid outline was not exactly 0.075 cell wide"
	)

	building_system._update_move_indicator(Vector3.ZERO, 0.75, 0.75, false)
	var invalid_fill := Color("ff5a52")
	invalid_fill.a = 0.28
	var invalid_outline := Color("fff0ed")
	invalid_outline.a = 0.96
	_expect(
		(building_system._move_indicator.material_override as StandardMaterial3D).albedo_color.is_equal_approx(invalid_fill),
		"invalid indicator fill color/alpha drifted from the art contract"
	)
	var invalid_arrays: Array = (building_system._move_indicator_detail.mesh as ImmediateMesh).surface_get_arrays(0)
	var invalid_vertices := invalid_arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array
	_expect(
		(building_system._move_indicator_detail.material_override as StandardMaterial3D).albedo_color.is_equal_approx(invalid_outline),
		"invalid indicator outline color/alpha is incorrect"
	)
	_expect(
		is_equal_approx(invalid_vertices[2].y - invalid_vertices[1].y, CELL_SIZE * 0.085),
		"invalid outline was not exactly 0.085 cell wide"
	)
	_expect(invalid_vertices.size() > 36, "invalid indicator used an X instead of repeated hatch stripes")
	if invalid_vertices.size() >= 42:
		_expect(
			is_equal_approx(invalid_vertices[25].distance_to(invalid_vertices[26]), CELL_SIZE * 0.055),
			"invalid hatch stripe was not exactly 0.055 cell wide"
		)
		var center_a := (invalid_vertices[24] + invalid_vertices[25] + invalid_vertices[26] + invalid_vertices[29]) * 0.25
		var center_b := (invalid_vertices[30] + invalid_vertices[31] + invalid_vertices[32] + invalid_vertices[35]) * 0.25
		var measured_period := absf((center_b.y - center_b.x) - (center_a.y - center_a.x)) / sqrt(2.0)
		_expect(
			is_equal_approx(measured_period, CELL_SIZE * 0.32),
			"invalid hatch period was not exactly 0.32 cell"
		)

	var shared_indicator: MeshInstance3D = building_system._move_indicator
	var placement_center := Vector3(0.25, 0.0, -0.25)
	building_system._update_placement_footprint_indicator(
		placement_center,
		Vector2i(3, 3),
		false
	)
	var cached_placement_mesh: Mesh = building_system._move_indicator_detail.mesh
	_expect(
		building_system._move_indicator == shared_indicator
		and building_system._move_indicator.position.is_equal_approx(
			placement_center + Vector3(0.0, 0.03, 0.0)
		)
		and (building_system._move_indicator.mesh as QuadMesh).size.is_equal_approx(Vector2(0.75, 0.75)),
		"placement did not reuse the move footprint indicator at its snapped center/size"
	)
	building_system._update_placement_footprint_indicator(
		placement_center,
		Vector2i(3, 3),
		false
	)
	_expect(
		building_system._move_indicator_detail.mesh == cached_placement_mesh,
		"unchanged placement validity rebuilt cached footprint detail geometry"
	)
	building_system._hide_footprint_indicator()
	_expect(not building_system._move_indicator.visible, "hidden placement ghost left its footprint visible")
	building_system._update_placement_footprint_indicator(
		placement_center,
		Vector2i(3, 3),
		true
	)
	_expect(building_system._move_indicator.visible, "placement footprint did not reappear on a valid target update")
	building_system.is_placing = true
	building_system._cancel_placement()
	_expect(
		building_system._move_indicator == null
		and building_system._move_indicator_detail == null
		and building_system._move_indicator_visual_key == Vector3(-1.0, -1.0, -1.0),
		"placement teardown did not clear the shared footprint indicator/cache"
	)
	building_system.free()


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
