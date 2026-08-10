extends SceneTree

const TowerScript: Script = preload("res://scripts/tower_flamethrower.gd")
const VisualScene: PackedScene = preload("res://Model/Flamethrower/level_01/FlamethrowerL01.tscn")


class ProbeTroop extends Node3D:
	var hp := 10000
	var unit_target_type := BaseTroop.UNIT_TARGET_GROUND
	var _is_dead := false

	func take_damage(amount: int) -> void:
		hp -= amount
		_is_dead = hp <= 0

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0


class ProbeAttackSystem extends Node3D:
	var grid_plane_path: NodePath = NodePath("../Island/shipPlane")


class ProbeFacingOwner extends Node:
	var editor_active := true
	var is_placing := false
	var _is_moving := false

	func is_flamethrower_facing_editor_active() -> bool:
		return editor_active


class ProbePlacementNet extends Node:
	signal resolve_requested
	var placement_calls := 0

	func has_token() -> bool:
		return true

	func place_building(
		_building_id: String,
		_x: int,
		_y: int,
		_grid_index: int,
		_facing_step: Variant
	) -> Dictionary:
		placement_calls += 1
		await resolve_requested
		return {"error": "injected placement failure"}


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	var failures: Array[String] = []
	_probe_shared_config(failures)
	_probe_all_level_orientations(failures)
	await _probe_cone_and_cadence(failures)
	await _probe_freeze_commit(failures)
	await _probe_facing_editor(failures)
	await _probe_placement_facing_lifecycle(failures)
	await _probe_nullable_server_facing(failures)
	await _probe_native_edit_entry(failures)
	await _probe_placement_retry_lifecycle(failures)
	await _probe_camera_input_ownership(failures)
	_probe_building_integration(failures)
	BaseTroop.invalidate_combat_lists()
	if failures.is_empty():
		print("FLAMETHROWER_COMBAT_PROBE_PASS")
		quit(0)
	else:
		for failure in failures:
			push_error("FLAMETHROWER_COMBAT_PROBE_FAIL: " + failure)
		quit(1)


func _probe_shared_config(failures: Array[String]) -> void:
	_expect(FlamethrowerConfig.ensure_loaded(), "shared JSON loads and validates", failures)
	var combat_rules := FlamethrowerConfig.combat()
	_expect(int(combat_rules.get("stream_ticks", 0)) == 60, "stream remains active for the approved 1.0 seconds", failures)
	var configured_offsets: Array = combat_rules.get("damage_offsets", [])
	_expect(
		configured_offsets.size() == 3
			and int(configured_offsets[0]) == 0
			and int(configured_offsets[1]) == 15
			and int(configured_offsets[2]) == 30,
		"longer stream keeps exactly three damage ticks",
		failures
	)
	_expect(int(combat_rules.get("cycle_ticks", 0)) == 90, "longer stream keeps the 1.5 second attack cycle", failures)
	var level_8 := FlamethrowerConfig.level_stats(8)
	_expect(int(level_8.get("hp", 0)) == 10900, "L8 HP is shared-config authoritative", failures)
	_expect(int(level_8.get("damage_per_tick", 0)) == 295, "L8 tick damage is adapted from tick_damage", failures)
	_expect(int(level_8.get("wood", 0)) == 142000, "nested L8 costs are adapted for Godot", failures)
	_expect(FlamethrowerConfig.forward_for_step(0).is_equal_approx(Vector2(0.0, -1.0)), "step 0 is world -Z", failures)
	_expect(FlamethrowerConfig.forward_for_step(6).is_equal_approx(Vector2(1.0, 0.0)), "step 6 is world +X", failures)


func _probe_all_level_orientations(failures: Array[String]) -> void:
	var building_system := BuildingSystem.new()
	var flamethrower_def: Dictionary = building_system.building_defs.get("flamethrower", {})
	var production_model_yaw := deg_to_rad(building_system._get_model_rotation_y(flamethrower_def))
	building_system.free()
	for level: int in range(1, 11):
		var tag := "%02d" % level
		var scene_path := "res://Model/Flamethrower/level_%s/FlamethrowerL%s.tscn" % [tag, tag]
		var packed := load(scene_path) as PackedScene
		if packed == null:
			failures.append("L%s orientation scene failed to load" % tag)
			continue
		for step: int in range(FlamethrowerConfig.FACING_COUNT):
			var root_node := Node3D.new()
			root_node.rotation.y = FlamethrowerConfig.global_yaw_for_step(step)
			var wrapper := packed.instantiate() as Node3D
			wrapper.rotation.y = production_model_yaw
			root_node.add_child(wrapper)
			root.add_child(root_node)
			var source_model := wrapper.get_node_or_null("SourceModel") as Node3D
			var muzzle := wrapper.get_node_or_null("MuzzleSocket") as Node3D
			var expected := FlamethrowerConfig.forward_for_step(step)
			var wrapper_forward_3d := -wrapper.global_transform.basis.z
			var wrapper_forward := Vector2(wrapper_forward_3d.x, wrapper_forward_3d.z).normalized()
			if not wrapper_forward.is_equal_approx(expected):
				failures.append("L%s step %d wrapper forward %s, expected %s" % [tag, step, wrapper_forward, expected])
			if not is_instance_valid(source_model):
				failures.append("L%s step %d missing SourceModel" % [tag, step])
			else:
				# Raw GLBs already author the visible nozzle along local -Z. The
				# wrapper must preserve that axis instead of rotating the art backward.
				var art_forward_3d := source_model.global_transform.basis * Vector3.FORWARD
				var art_forward := Vector2(art_forward_3d.x, art_forward_3d.z).normalized()
				if not art_forward.is_equal_approx(expected):
					failures.append("L%s step %d visible barrel forward %s, expected %s" % [tag, step, art_forward, expected])
			if not is_instance_valid(muzzle):
				failures.append("L%s step %d missing MuzzleSocket" % [tag, step])
			else:
				var muzzle_forward_3d := -muzzle.global_transform.basis.z
				var muzzle_forward := Vector2(muzzle_forward_3d.x, muzzle_forward_3d.z).normalized()
				if not muzzle_forward.is_equal_approx(expected):
					failures.append("L%s step %d muzzle forward %s, expected %s" % [tag, step, muzzle_forward, expected])
				var muzzle_offset_3d := muzzle.global_position - root_node.global_position
				var muzzle_offset := Vector2(muzzle_offset_3d.x, muzzle_offset_3d.z)
				if muzzle_offset.dot(expected) <= 0.05:
					failures.append("L%s step %d MuzzleSocket is not on the attack-facing half-plane: %s" % [tag, step, muzzle_offset])
			root_node.free()


func _probe_cone_and_cadence(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerConeProbe")
	var center := _make_troop("center", BaseTroop.UNIT_TARGET_GROUND, Vector3(0.0, 0.0, -1.0), 1)
	var edge_angle := deg_to_rad(25.0)
	var edge := _make_troop("edge", BaseTroop.UNIT_TARGET_GROUND, Vector3(sin(edge_angle) * 1.2, 0.0, -cos(edge_angle) * 1.2), 2)
	var outside_angle := deg_to_rad(25.2)
	var outside := _make_troop("outside", BaseTroop.UNIT_TARGET_GROUND, Vector3(sin(outside_angle), 0.0, -cos(outside_angle)), 3)
	var air := _make_troop("air", BaseTroop.UNIT_TARGET_AIR, Vector3(0.0, 0.35, -0.9), 4)
	for troop in [center, edge, outside, air]:
		fixture.add_child(troop)
	var tower: Variant = _make_tower(100, 0)
	fixture.add_child(tower)
	tower.set_physics_process(false)
	await process_frame
	BaseTroop.invalidate_combat_lists()
	var events: Array[Dictionary] = []
	tower.connect("flamethrower_event", func(kind: String, payload: Dictionary) -> void:
		events.append({"kind": kind, "payload": payload.duplicate(true)})
	)
	var combat_rules := FlamethrowerConfig.combat()
	var first_stream_end_tick := int(combat_rules.get("prime_ticks", 18)) + int(combat_rules.get("stream_ticks", 60))
	for _tick in range(first_stream_end_tick + 1):
		tower._simulation_step()
	var damage_events := events.filter(func(row: Dictionary) -> bool: return row.kind == "flamethrower_damage_tick")
	var offsets: Array[int] = []
	for row in damage_events:
		offsets.append(int(row.payload.get("offset_ticks", -1)))
	_expect(offsets == [0, 15, 30], "damage resolves at exact offsets 0/15/30", failures)
	_expect(center.hp == 10000 - 58 * 3, "center ground target receives three L1 ticks", failures)
	_expect(edge.hp == 10000 - 58 * 3, "inclusive 25 degree/range edge receives damage", failures)
	_expect(outside.hp == 10000, "target outside 50 degree cone receives no damage", failures)
	_expect(air.hp == 10000, "air target inside cone is ignored", failures)
	var snapshot: Dictionary = tower.get_debug_snapshot()
	_expect(int(snapshot.get("stream_start_tick", -2)) == -1, "first stream is closed at tick %d" % first_stream_end_tick, failures)
	var expected_next_stream_tick := int(combat_rules.get("prime_ticks", 18)) + int(combat_rules.get("cycle_ticks", 90))
	_expect(int(snapshot.get("next_stream_ready_tick", -1)) == expected_next_stream_tick, "cycle commits next start at tick %d" % expected_next_stream_tick, failures)
	var vfx: Dictionary = snapshot.get("vfx", {})
	_expect(not bool(vfx.get("active", true)), "completed stream stops producing new flame particles", failures)
	_expect(bool(vfx.get("draining", false)), "completed stream preserves already emitted flame particles", failures)
	_expect(not bool(vfx.get("emitting", true)), "tail drains without new particle emission", failures)
	_expect(bool(vfx.get("tail_visible", false)), "draining flame remains visible after combat stream end", failures)
	_expect(
		float(vfx.get("full_range_travel_duration", 99.0)) < float(combat_rules.get("stream_ticks", 60)) / float(combat_rules.get("tick_rate", 60)),
		"flame front reaches full range before the combat stream closes",
		failures
	)
	_expect(int(vfx.get("persistent_nodes", 0)) == 2, "VFX keeps one Dragon emitter plus one cohesive sector core", failures)
	_expect(int(vfx.get("particle_capacity", 0)) == 96, "single emitter stays within the cohesive 96-particle tower budget", failures)
	_expect(int(vfx.get("flame_particle_capacity", 0)) == 96, "visible emitter has enough density to fill the attack sector", failures)
	_expect(int(vfx.get("outer_flame_particle_capacity", -1)) == 0, "tower-specific outer layer is removed", failures)
	_expect(int(vfx.get("visible_flame_layers", 0)) == 2, "Dragon detail stays connected by one procedural flame core", failures)
	_expect(bool(vfx.get("dragon_material_profile", false)), "tower keeps the Dragon texture and material profile", failures)
	_expect(is_zero_approx(float(vfx.get("emission_explosiveness", -1.0))), "sustained stream emits continuously instead of in separated Dragon bursts", failures)
	_expect(is_zero_approx(float(vfx.get("emission_randomness", 1.0))), "continuous sector stream spaces adjacent Dragon cards evenly", failures)
	_expect(is_zero_approx(float(vfx.get("lifetime_randomness", 1.0))), "all flame cards terminate on one range boundary", failures)
	_expect(float(vfx.get("minimum_terminal_range_fraction", 0.0)) >= 1.0, "every flame card reaches the complete sector range", failures)
	_expect(float(vfx.get("minimum_particle_scale", 0.0)) >= 0.72, "terminal flame cards cannot collapse into small dots", failures)
	_expect(bool(vfx.get("velocity_aligned", false)), "flame cards keep their long axis inside the attack cone", failures)
	_expect(bool(vfx.get("fire_dragon_profile", false)), "VFX uses the Fire Dragon breath profile", failures)
	_expect(
		is_equal_approx(float(vfx.get("visual_spread_degrees", 0.0)), 17.5),
		"particle centers leave enough margin for their cards to remain inside the 25 degree half-cone",
		failures
	)
	_expect(
		is_equal_approx(float(vfx.get("visual_width_scale", 0.0)), 0.65 * 1.65),
		"tower widens the cohesive Dragon plume without widening its spread",
		failures
	)
	_expect(
		is_equal_approx(float(vfx.get("visual_flatness", 0.0)), 1.0),
		"flame directions remain on the ground attack plane",
		failures
	)
	_expect(
		float(vfx.get("taper_start_scale", 1.0)) <= 0.001
			and float(vfx.get("taper_quarter_scale", 1.0)) <= 0.016
			and float(vfx.get("taper_half_scale", 1.0)) <= 0.125
			and float(vfx.get("taper_three_quarter_scale", 1.0)) <= 0.422
			and is_equal_approx(float(vfx.get("taper_end_scale", 0.0)), 1.0),
		"flame stays tightly tapered near the nozzle and reaches full width only at the sector edge",
		failures
	)
	_expect(
		float(vfx.get("emission_radius_scale", 1.0)) <= 0.006,
		"particle birth radius cannot cross the narrow sector apex",
		failures
	)
	_expect(
		int(vfx.get("color_ramp_points", 0)) == 5
			and bool(vfx.get("neutral_process_tint", false)),
		"single flame layer keeps a visible terminal orange/red band before final fade",
		failures
	)
	_expect(
		bool(vfx.get("geometric_stream_core", false))
			and bool(vfx.get("cohesive_stream_core", false))
			and float(vfx.get("core_half_angle_degrees", 99.0)) <= 17.5
			and float(vfx.get("core_drain_cutoff", 1.0)) <= 0.84
			and float(vfx.get("particle_detail_end_fraction", 1.0)) <= 0.94,
		"animated sector core connects the plume without crossing the damage cone or shrinking into a final dot",
		failures
	)
	_expect(int(vfx.get("dynamic_lights", -1)) == 0, "VFX creates no attack lights or ground glow", failures)
	_expect(tower.get_node_or_null("FlamethrowerAudioPresenter") != null, "three-channel audio presenter is persistent on root", failures)
	var vfx_node: Node = tower.find_child("FlamethrowerVfxPool", true, false) as Node
	var pooled_child_ids: Array[int] = []
	if is_instance_valid(vfx_node):
		for child: Node in vfx_node.get_children():
			pooled_child_ids.append(child.get_instance_id())
	for _tick in range(109):
		tower._simulation_step()
	var repeated_child_ids: Array[int] = []
	if is_instance_valid(vfx_node):
		for child: Node in vfx_node.get_children():
			repeated_child_ids.append(child.get_instance_id())
	_expect(pooled_child_ids.size() == 2 and repeated_child_ids == pooled_child_ids, "repeated streams reuse the same Dragon-detail and cohesive-core nodes", failures)
	await _free_fixture(fixture)


func _probe_freeze_commit(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerFreezeProbe")
	var target := _make_troop("freeze_target", BaseTroop.UNIT_TARGET_GROUND, Vector3(0.0, 0.0, -0.8), 10)
	fixture.add_child(target)
	var tower: Variant = _make_tower(101, 0)
	fixture.add_child(tower)
	tower.set_physics_process(false)
	await process_frame
	BaseTroop.invalidate_combat_lists()
	var damage_offsets: Array[int] = []
	var counters := {"interrupts": 0}
	tower.connect("flamethrower_event", func(kind: String, payload: Dictionary) -> void:
		if kind == "flamethrower_damage_tick":
			damage_offsets.append(int(payload.get("offset_ticks", -1)))
		elif kind == "flamethrower_interrupted":
			counters.interrupts += 1
	)
	for _tick in range(19):
		tower._simulation_step()
	_expect(target.hp == 10000 - 58, "offset 0 applies before Freeze", failures)
	tower.freeze_for(0.5)
	# Manual fixed-tick probe runs inside one engine frame. Move the guard behind
	# the current frame so each explicit simulation step consumes one freeze tick.
	tower._freeze_started_frame = -999
	for _tick in range(89):
		tower._simulation_step()
	_expect(damage_offsets == [0], "Freeze cancels the two future committed damage ticks", failures)
	_expect(target.hp == 10000 - 58, "Freeze never refunds or duplicates offset 0", failures)
	_expect(int(counters.interrupts) == 1, "Freeze emits one presentation interruption", failures)
	var snapshot: Dictionary = tower.get_debug_snapshot()
	_expect(int(snapshot.get("next_stream_ready_tick", -1)) == 108, "Freeze preserves absolute cooldown tick", failures)
	_expect(int(snapshot.get("stream_start_tick", -2)) == -1, "interrupted stream is cleaned", failures)
	await _free_fixture(fixture)


func _probe_facing_editor(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerFacingProbe")
	var root_node := Node3D.new()
	fixture.add_child(root_node)
	var editor := FlamethrowerFacingEditor.new()
	fixture.add_child(editor)
	editor.begin(root_node, 0, 1.2)
	var sector := editor.get_node_or_null("AttackSector") as MeshInstance3D
	var sector_edge := editor.get_node_or_null("AttackSectorEdge") as MeshInstance3D
	var direction_arrow := editor.get_node_or_null("FacingArrow") as MeshInstance3D
	_expect(is_instance_valid(sector), "editor creates the attack-sector fill", failures)
	_expect(is_instance_valid(sector_edge), "editor creates the white attack-sector boundary", failures)
	_expect(is_instance_valid(direction_arrow), "editor creates the direction arrow", failures)
	if is_instance_valid(sector) and sector.mesh != null:
		var sector_colors: PackedColorArray = sector.mesh.surface_get_arrays(0)[Mesh.ARRAY_COLOR]
		_expect(not sector_colors.is_empty(), "sector has explicit vertex colors", failures)
		if not sector_colors.is_empty():
			var stored_fill := sector_colors[0]
			var expected_fill := FlamethrowerFacingEditor.RANGE_FILL_COLOR
			_expect(
				is_equal_approx(stored_fill.r, expected_fill.r)
				and is_equal_approx(stored_fill.g, expected_fill.g)
				and is_equal_approx(stored_fill.b, expected_fill.b)
				and absf(stored_fill.a - expected_fill.a) <= (1.0 / 255.0),
				"sector uses the shared white range-fill style",
				failures
			)
	if is_instance_valid(sector_edge) and sector_edge.mesh != null:
		var edge_material := sector_edge.mesh.surface_get_material(0) as StandardMaterial3D
		_expect(edge_material != null and edge_material.albedo_color.is_equal_approx(FlamethrowerFacingEditor.RANGE_EDGE_COLOR), "sector boundary is white", failures)
	if is_instance_valid(direction_arrow) and direction_arrow.mesh is PrimitiveMesh:
		var arrow_material := (direction_arrow.mesh as PrimitiveMesh).material as StandardMaterial3D
		_expect(arrow_material != null and arrow_material.albedo_color.is_equal_approx(FlamethrowerFacingEditor.DIRECTION_ARROW_COLOR), "direction arrow is white without blue emission", failures)
	editor.step_right()
	_expect(editor.preview_step == 1, "editor advances in one 15 degree step", failures)
	_expect(is_equal_approx(root_node.global_rotation.y, -TAU / 24.0), "preview rotates stable root clockwise", failures)
	editor.cancel()
	_expect(is_zero_approx(root_node.global_rotation.y), "cancel restores persisted facing", failures)
	editor.begin(root_node, 0, 1.2)
	editor.step_left()
	var confirmed := editor.confirm()
	_expect(confirmed == 23, "left rotation wraps from step 0 to step 23", failures)
	_expect(is_equal_approx(root_node.global_rotation.y, TAU / 24.0), "confirmed wrapped yaw remains on root", failures)

	# TestMain upgrades briefly scale the building root to zero. The direction
	# must still be stored relative to the rotated island grid at that instant.
	var rotated_grid := Node3D.new()
	rotated_grid.rotation.y = -0.0828
	fixture.add_child(rotated_grid)
	var zero_scale_root := Node3D.new()
	zero_scale_root.scale = Vector3.ZERO
	rotated_grid.add_child(zero_scale_root)
	var zero_scale_editor := FlamethrowerFacingEditor.new()
	rotated_grid.add_child(zero_scale_editor)
	zero_scale_editor.begin(zero_scale_root, 12, 1.2)
	zero_scale_root.scale = Vector3.ONE
	var zero_scale_forward_3d := -zero_scale_root.global_transform.basis.z
	var zero_scale_forward := Vector2(zero_scale_forward_3d.x, zero_scale_forward_3d.z).normalized()
	_expect(
		zero_scale_forward.is_equal_approx(FlamethrowerConfig.forward_for_step(12)),
		"zero-scale editor preview survives the rotated island grid",
		failures
	)
	var zero_scale_tower: Variant = _make_tower(102, 0)
	zero_scale_tower.scale = Vector3.ZERO
	rotated_grid.add_child(zero_scale_tower)
	zero_scale_tower.set_physics_process(false)
	zero_scale_tower.set_facing_step(12)
	zero_scale_tower.scale = Vector3.ONE
	var tower_forward_3d: Vector3 = -zero_scale_tower.global_transform.basis.z
	var tower_forward := Vector2(tower_forward_3d.x, tower_forward_3d.z).normalized()
	_expect(
		tower_forward.is_equal_approx(FlamethrowerConfig.forward_for_step(12)),
		"zero-scale tower facing survives the rotated island grid",
		failures
	)
	await _free_fixture(fixture)


func _probe_placement_facing_lifecycle(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerPlacementFacingProbe")
	var island := Node3D.new()
	island.name = "Island"
	var attack_plane := Node3D.new()
	attack_plane.name = "shipPlane"
	attack_plane.position = Vector3(-1.85, 0.02, 2.65)
	island.add_child(attack_plane)
	fixture.add_child(island)
	var grid_plane := MeshInstance3D.new()
	grid_plane.name = "gridPlane"
	grid_plane.scale = Vector3(4.0, 0.1, 4.0)
	grid_plane.mesh = BoxMesh.new()
	fixture.add_child(grid_plane)
	var attack_system := ProbeAttackSystem.new()
	attack_system.name = "AttackSystem"
	fixture.add_child(attack_system)
	var building_system := BuildingSystem.new()
	building_system.name = "BuildingSystem"
	building_system.create_ui = false
	building_system.test_mode = true
	building_system.grid_plane_path = NodePath("../gridPlane")
	fixture.add_child(building_system)
	await process_frame
	await process_frame

	var placement_root := Node3D.new()
	placement_root.name = "NoMotionGhost"
	placement_root.position = Vector3(0.75, 0.0, -0.90)
	building_system.add_child(placement_root)
	building_system.ghost = placement_root
	building_system.current_building_id = "flamethrower"
	building_system.current_grid_pos = Vector2i(10, 10)
	building_system.is_placing = true
	building_system._flamethrower_placement_cell_locked = false
	building_system._flamethrower_placement_user_rotated = false
	building_system._begin_flamethrower_editor(placement_root, 0, 1.2, {})
	var expected_step := FlamethrowerConfig.nearest_step_toward(
		placement_root.global_position,
		attack_plane.global_position
	)
	_expect(
		building_system._get_defense_spawn_facing_global().is_equal_approx(attack_plane.global_position),
		"Flamethrower and Harpoon resolve the same shipPlane target",
		failures
	)
	_expect(
		building_system._lock_flamethrower_placement_cell(),
		"tap/click can lock a valid Flamethrower cell without prior motion",
		failures
	)
	_expect(
		building_system._flamethrower_facing_step == expected_step,
		"no-motion placement faces the ship landing instead of temporary step 0",
		failures
	)
	var approach_delta := Vector2(
		attack_plane.global_position.x - placement_root.global_position.x,
		attack_plane.global_position.z - placement_root.global_position.z
	).normalized()
	var snapped_forward := FlamethrowerConfig.forward_for_step(expected_step)
	var quantization_error := rad_to_deg(acos(clampf(snapped_forward.dot(approach_delta), -1.0, 1.0)))
	_expect(quantization_error <= 7.5001, "landing heading stays within one half-step", failures)

	# Rotation is available before locking. A deliberate angle must survive the
	# lock, while Reset restores automatic landing-facing for a moving ghost.
	building_system._flamethrower_placement_cell_locked = false
	building_system._flamethrower_preview_step(1, "step_right")
	var manual_step: int = building_system._flamethrower_facing_step
	_expect(
		manual_step == FlamethrowerConfig.normalize_preview_step(expected_step + 1),
		"pre-lock Q/E rotation advances exactly one 15-degree step",
		failures
	)
	building_system._lock_flamethrower_placement_cell()
	_expect(
		building_system._flamethrower_facing_step == manual_step,
		"locking preserves a deliberate manual heading",
		failures
	)
	building_system._flamethrower_placement_cell_locked = false
	building_system._reset_flamethrower_facing_preview()
	_expect(
		building_system._flamethrower_facing_step == expected_step
		and not building_system._flamethrower_placement_user_rotated,
		"Reset restores automatic ship-landing facing",
		failures
	)
	await _free_fixture(fixture)


func _probe_camera_input_ownership(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerCameraOwnershipProbe")
	var facing_owner := ProbeFacingOwner.new()
	facing_owner.name = "FacingOwner"
	facing_owner.add_to_group("building_systems")
	fixture.add_child(facing_owner)
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
	var wheel := InputEventMouseButton.new()
	wheel.button_index = MOUSE_BUTTON_WHEEL_UP
	wheel.pressed = true
	var zoom_before: float = rig._target_zoom
	rig._unhandled_input(wheel)
	_expect(
		is_equal_approx(float(rig._target_zoom), zoom_before),
		"wheel does not zoom the camera while it rotates Flamethrower",
		failures
	)
	facing_owner.editor_active = false
	rig._unhandled_input(wheel)
	_expect(
		float(rig._target_zoom) < zoom_before,
		"wheel zoom returns after the facing editor closes",
		failures
	)
	await _free_fixture(fixture)


func _probe_native_edit_entry(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerNativeEditEntryProbe")
	var grid_plane := MeshInstance3D.new()
	grid_plane.name = "gridPlane"
	grid_plane.scale = Vector3(4.0, 0.1, 4.0)
	grid_plane.mesh = BoxMesh.new()
	fixture.add_child(grid_plane)
	var building_system := BuildingSystem.new()
	building_system.name = "BuildingSystem"
	building_system.create_ui = false
	building_system.test_mode = true
	building_system.grid_plane_path = NodePath("../gridPlane")
	fixture.add_child(building_system)
	await process_frame
	await process_frame
	building_system._create_building_panel()
	var tower_root := Node3D.new()
	tower_root.name = "PlacedFlamethrower"
	building_system.add_child(tower_root)
	building_system.selected_building = {
		"id": "flamethrower",
		"node": tower_root,
		"level": 1,
		"facing_step": 4,
	}
	building_system.building_panel.visible = true
	building_system.building_panel_facing_btn.visible = true
	building_system.building_panel_facing_btn.pressed.emit()
	await process_frame
	_expect(
		building_system.is_flamethrower_facing_editor_active(),
		"native building panel opens the facing editor without React",
		failures
	)
	_expect(
		not building_system.building_panel.visible,
		"native building panel yields the screen to the touch facing dock",
		failures
	)
	_expect(
		building_system.building_panel_facing_btn.custom_minimum_size.y >= 56.0,
		"native edit-direction entry point is a touch-sized button",
		failures
	)
	await _free_fixture(fixture)


func _probe_placement_retry_lifecycle(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerPlacementRetryProbe")
	var grid_plane := MeshInstance3D.new()
	grid_plane.name = "gridPlane"
	grid_plane.scale = Vector3(4.0, 0.1, 4.0)
	grid_plane.mesh = BoxMesh.new()
	fixture.add_child(grid_plane)
	var building_system := BuildingSystem.new()
	building_system.name = "BuildingSystem"
	building_system.create_ui = false
	building_system.test_mode = true
	building_system.grid_plane_path = NodePath("../gridPlane")
	fixture.add_child(building_system)
	var net := ProbePlacementNet.new()
	fixture.add_child(net)
	await process_frame
	await process_frame
	building_system._net = net

	var placement_root := Node3D.new()
	placement_root.name = "RetryGhost"
	building_system.add_child(placement_root)
	building_system.ghost = placement_root
	building_system.current_building_id = "flamethrower"
	building_system.current_grid_pos = Vector2i(10, 10)
	building_system.is_placing = true
	building_system._flamethrower_placement_cell_locked = true
	building_system._begin_flamethrower_editor(placement_root, 7, 1.2, {})
	building_system._confirm_flamethrower_facing()
	await process_frame
	_expect(net.placement_calls == 1, "Place here sends one server request", failures)
	_expect(
		building_system._flamethrower_facing_request_pending,
		"placement stays visibly pending while the server request is unresolved",
		failures
	)
	_expect(
		is_instance_valid(building_system.ghost)
		and building_system.is_flamethrower_facing_editor_active(),
		"pending placement preserves the ghost and direction editor",
		failures
	)
	net.resolve_requested.emit()
	await process_frame
	await process_frame
	_expect(
		not building_system._flamethrower_facing_request_pending,
		"failed placement leaves pending state",
		failures
	)
	_expect(
		is_instance_valid(building_system.ghost)
		and building_system.is_flamethrower_facing_editor_active()
		and building_system._flamethrower_placement_cell_locked,
		"failed placement keeps the locked tile and direction available for retry",
		failures
	)
	await _free_fixture(fixture)


func _probe_nullable_server_facing(failures: Array[String]) -> void:
	var fixture := _new_fixture("FlamethrowerNullableServerFacingProbe")
	var grid_plane := MeshInstance3D.new()
	grid_plane.name = "gridPlane"
	grid_plane.scale = Vector3(4.0, 0.1, 4.0)
	grid_plane.mesh = BoxMesh.new()
	fixture.add_child(grid_plane)
	var building_system := BuildingSystem.new()
	building_system.name = "BuildingSystem"
	building_system.create_ui = false
	building_system.test_mode = true
	building_system.grid_plane_path = NodePath("../gridPlane")
	fixture.add_child(building_system)
	await process_frame
	await process_frame
	var flamethrower_def: Dictionary = building_system.building_defs.get("flamethrower", {})
	var level := 8
	var hp := building_system._get_hp_for(flamethrower_def, level)
	building_system._load_buildings_from_server([{
		"id": 98001,
		"type": "flamethrower",
		"level": level,
		"hp": hp,
		"max_hp": hp,
		"grid_x": 10,
		"grid_z": 10,
		"grid_index": 0,
		"facing_step": null,
	}])
	_expect(building_system.placed_buildings.size() == 1, "server state with null facing still spawns the Flamethrower", failures)
	if building_system.placed_buildings.size() == 1:
		var loaded: Dictionary = building_system.placed_buildings[0]
		_expect(int(loaded.get("facing_step", -1)) == 0, "null server facing normalizes to canonical step zero", failures)
		var loaded_node: Node3D = loaded.get("node") as Node3D
		_expect(
			is_instance_valid(loaded_node) and int(loaded_node.get_meta("facing_step", -1)) == 0,
			"spawned Flamethrower receives the normalized facing step",
			failures
		)
	await _free_fixture(fixture)


func _probe_building_integration(failures: Array[String]) -> void:
	var file := FileAccess.open("res://scripts/building_system.gd", FileAccess.READ)
	var source := file.get_as_text() if file != null else ""
	_expect(source.contains("\"flamethrower\": {"), "BuildingSystem registers Flamethrower definition", failures)
	_expect(source.contains("\"flamethrower\": 8"), "BuildingSystem unlocks Flamethrower at TH8", failures)
	_expect(source.contains("[0, 0, 0, 0, 0, 0, 0, 1, 1, 2]"), "count curve is one at TH8/9 and two at TH10", failures)
	_expect(source.contains("[1, 1, 1, 1, 1, 1, 1, 8, 9, 10]"), "level caps are L8/L9/L10 by Town Hall", failures)
	_expect(source.contains("set_building_facing"), "client persists facing through the server endpoint", failures)
	_expect(source.contains("and not OS.has_feature(\"web\")"), "web keyboard has one facing-input owner", failures)
	var network_file := FileAccess.open("res://scripts/network_client.gd", FileAccess.READ)
	var network_source := network_file.get_as_text() if network_file != null else ""
	for auth_function in ["register", "login", "login_by_wallet"]:
		_expect(
			_function_contains(network_source, auth_function, "_update_layout_revision(response)"),
			"%s hydrates layout revision before the first facing edit" % auth_function,
			failures
		)
	var building_system := BuildingSystem.new()
	var flamethrower_def: Dictionary = building_system.building_defs.get("flamethrower", {})
	_expect(flamethrower_def.get("hp_levels", []).size() == 10, "future L10 remains available to authoring and combat config", failures)
	_expect(
		building_system._get_live_building_max_level("flamethrower") == 10,
		"player-facing Flamethrower upgrades reach live TH10",
		failures
	)
	_expect(not bool(flamethrower_def.get("apply_camera_facing_yaw", true)), "directional wrapper opts out of camera-facing yaw", failures)
	_expect(is_zero_approx(building_system._get_model_rotation_y(flamethrower_def)), "wrapper local -Z stays aligned with canonical root -Z", failures)
	_expect(
		building_system._parse_flamethrower_facing_step(null) == 0,
		"nullable server facing falls back without calling int(null)",
		failures
	)
	_expect(
		building_system._parse_flamethrower_facing_step("7") == 7,
		"numeric server facing strings normalize to an integer step",
		failures
	)
	_expect(
		building_system._flamethrower_facing_payload("cannon", 3) == null,
		"non-directional building payloads retain a null facing value",
		failures
	)
	building_system.free()


func _function_contains(source: String, function_name: String, needle: String) -> bool:
	var start := source.find("func %s(" % function_name)
	if start < 0:
		return false
	var finish := source.find("\nfunc ", start + 1)
	if finish < 0:
		finish = source.length()
	return source.substr(start, finish - start).contains(needle)


func _new_fixture(fixture_name: String) -> Node3D:
	var fixture := Node3D.new()
	fixture.name = fixture_name
	root.add_child(fixture)
	current_scene = fixture
	return fixture


func _make_tower(server_id: int, facing_step: int) -> Variant:
	var tower: Variant = Node3D.new()
	tower.set_meta("server_id", server_id)
	tower.set_meta("facing_step", facing_step)
	tower.set_script(TowerScript)
	tower.add_child(VisualScene.instantiate())
	return tower


func _make_troop(
	troop_name: String,
	target_type: String,
	spawn_position: Vector3,
	replay_order: int
) -> ProbeTroop:
	var troop := ProbeTroop.new()
	troop.name = troop_name
	troop.unit_target_type = target_type
	troop.position = spawn_position
	troop.set_meta("replay_order", replay_order)
	troop.add_to_group("troops")
	return troop


func _free_fixture(fixture: Node) -> void:
	if is_instance_valid(fixture):
		fixture.queue_free()
	await process_frame
	await process_frame
	BaseTroop.invalidate_combat_lists()


func _expect(condition: bool, label: String, failures: Array[String]) -> void:
	if not condition:
		failures.append(label)
