extends Node3D

const TOWER_SCRIPT: Script = preload("res://scripts/tower_flamethrower.gd")
const LEVEL_08_VISUAL: PackedScene = preload("res://Model/Flamethrower/level_08/FlamethrowerL08.tscn")
const OUTPUT_DIR := "res://artifacts/flamethrower-combat-frames"
const LAST_CAPTURE_TICK := 63


class VisualTroop extends Node3D:
	var hp := 4000
	var unit_target_type := BaseTroop.UNIT_TARGET_GROUND
	var _is_dead := false
	var hp_label: Label3D = null

	func take_damage(amount: int) -> void:
		hp = maxi(0, hp - amount)
		_is_dead = hp <= 0
		refresh_label()

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0

	func refresh_label() -> void:
		if is_instance_valid(hp_label):
			hp_label.text = "%s\nHP %d" % [name, hp]


var _tower: Node3D = null
var _status_label: Label = null
var _event_label: Label = null
var _event_rows: Array[Dictionary] = []
var _ground_targets: Array[VisualTroop] = []
var _air_target: VisualTroop = null
var _failures: Array[String] = []


func _ready() -> void:
	get_window().size = Vector2i(1280, 720)
	_build_stage()
	_build_tower_and_targets()
	await get_tree().process_frame
	await get_tree().process_frame
	_tower.set_physics_process(false)
	_tower.process_mode = Node.PROCESS_MODE_INHERIT
	_tower.call("set_level", 8)
	_tower.call("set_facing_step", 0)
	var facing_visual := FlamethrowerFacingEditor.new()
	facing_visual.name = "TestFacingSector"
	add_child(facing_visual)
	await get_tree().process_frame
	facing_visual.begin(_tower, 0, float(_tower.get("detect_range")))
	BaseTroop.invalidate_combat_lists()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT_DIR))
	_clear_previous_evidence()
	for _index: int in range(LAST_CAPTURE_TICK + 1):
		_tower.call("_simulation_step")
		_refresh_overlay()
		await get_tree().process_frame
		RenderingServer.force_draw(false)
		_capture_tick(_index)
	_validate_result()
	_write_report()
	_write_keyframe_strip()
	if _failures.is_empty():
		print("FLAMETHROWER_VISUAL_TEST_PASS frames=%d" % (LAST_CAPTURE_TICK + 1))
		get_tree().quit(0)
	else:
		for failure: String in _failures:
			push_error("FLAMETHROWER_VISUAL_TEST_FAIL: " + failure)
		get_tree().quit(1)


func _build_stage() -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("162431")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("dbe8ee")
	environment.ambient_light_energy = 0.58
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.glow_enabled = true
	environment_node.environment = environment
	add_child(environment_node)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-54.0, -28.0, 0.0)
	key_light.light_color = Color("ffd7a3")
	key_light.light_energy = 1.15
	key_light.shadow_enabled = true
	add_child(key_light)
	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-31.0, 145.0, 0.0)
	fill_light.light_color = Color("79bfff")
	fill_light.light_energy = 0.32
	add_child(fill_light)
	var ground := MeshInstance3D.new()
	var ground_mesh := PlaneMesh.new()
	ground_mesh.size = Vector2(4.5, 4.5)
	ground.mesh = ground_mesh
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color("263d37")
	ground_material.roughness = 0.88
	ground.material_override = ground_material
	add_child(ground)
	var camera := Camera3D.new()
	camera.position = Vector3(2.45, 2.15, 3.15)
	camera.fov = 37.0
	add_child(camera)
	camera.look_at(Vector3(0.0, 0.16, -0.82), Vector3.UP)
	camera.current = true
	_status_label = Label.new()
	_status_label.position = Vector2(26.0, 22.0)
	_status_label.add_theme_font_size_override("font_size", 25)
	_status_label.add_theme_color_override("font_color", Color("fff1cf"))
	add_child(_status_label)
	_event_label = Label.new()
	_event_label.position = Vector2(26.0, 116.0)
	_event_label.add_theme_font_size_override("font_size", 18)
	_event_label.add_theme_color_override("font_color", Color("ffc178"))
	add_child(_event_label)
	var legend := Label.new()
	legend.text = "TH8 MAX • L8 • fixed 50° ground cone • local -Z • blue airborne target must remain unharmed"
	legend.position = Vector2(26.0, 674.0)
	legend.add_theme_font_size_override("font_size", 16)
	legend.add_theme_color_override("font_color", Color("b9cad4"))
	add_child(legend)


func _build_tower_and_targets() -> void:
	_tower = Node3D.new()
	_tower.name = "FlamethrowerL08Runtime"
	_tower.set_meta("server_id", 8001)
	_tower.set_meta("facing_step", 0)
	_tower.set_script(TOWER_SCRIPT)
	# Disable autonomous physics before the node enters the tree. This keeps
	# screenshot filenames aligned one-to-one with the manually advanced tick.
	_tower.process_mode = Node.PROCESS_MODE_DISABLED
	_tower.set_physics_process(false)
	_tower.call("set_level", 8)
	var visual := LEVEL_08_VISUAL.instantiate() as Node3D
	var building_system := BuildingSystem.new()
	var flamethrower_def: Dictionary = building_system.building_defs.get("flamethrower", {})
	visual.rotation_degrees.y = building_system._get_model_rotation_y(flamethrower_def)
	building_system.free()
	_tower.add_child(visual)
	add_child(_tower)
	_tower.connect("flamethrower_event", Callable(self, "_on_flamethrower_event"))
	_ground_targets.append(_make_target("Ground A", Vector3(0.0, 0.13, -1.06), Color("de553b"), false, 1))
	_ground_targets.append(_make_target("Ground B", Vector3(-0.36, 0.13, -1.20), Color("f0953f"), false, 2))
	_ground_targets.append(_make_target("Ground C", Vector3(0.39, 0.13, -1.28), Color("d9b448"), false, 3))
	_air_target = _make_target("Air immune", Vector3(0.13, 0.61, -1.02), Color("49bfe8"), true, 4)


func _make_target(
	target_name: String,
	world_location: Vector3,
	color: Color,
	is_air: bool,
	replay_order: int
) -> VisualTroop:
	var target := VisualTroop.new()
	target.name = target_name
	target.position = world_location
	target.unit_target_type = BaseTroop.UNIT_TARGET_AIR if is_air else BaseTroop.UNIT_TARGET_GROUND
	target.set_meta("replay_order", replay_order)
	target.add_to_group("troops")
	var body := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.085
	capsule.height = 0.27
	capsule.radial_segments = 12
	capsule.rings = 6
	body.mesh = capsule
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.46
	material.emission_enabled = is_air
	material.emission = color
	material.emission_energy_multiplier = 0.65 if is_air else 0.0
	body.material_override = material
	target.add_child(body)
	var hp_label := Label3D.new()
	hp_label.position = Vector3(0.0, 0.22, 0.0)
	hp_label.font_size = 38
	hp_label.pixel_size = 0.0017
	hp_label.outline_size = 6
	hp_label.modulate = Color("f7f2e8")
	hp_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	hp_label.no_depth_test = true
	target.add_child(hp_label)
	target.hp_label = hp_label
	target.refresh_label()
	add_child(target)
	return target


func _on_flamethrower_event(kind: String, payload: Dictionary) -> void:
	_event_rows.append({"kind": kind, "payload": payload.duplicate(true)})
	_event_label.text = "Last event: %s" % kind.trim_prefix("flamethrower_").replace("_", " ")


func _refresh_overlay() -> void:
	var snapshot: Dictionary = _tower.call("get_debug_snapshot")
	_status_label.text = "FLAMETHROWER COMBAT TEST\nTick %03d  •  %s  •  facing %02d × 15°\nDamage/tick %d  •  Range %.2f" % [
		int(snapshot.get("tick", -1)),
		str(snapshot.get("state", "UNKNOWN")),
		int(snapshot.get("facing_step", -1)),
		int(snapshot.get("damage", 0)),
		float(snapshot.get("detect_range", 0.0)),
	]


func _capture_tick(tick: int) -> void:
	var snapshot: Dictionary = _tower.call("get_debug_snapshot")
	var state_slug := str(snapshot.get("state", "unknown")).to_lower()
	var resource_path := "%s/frame_%03d_%s.png" % [OUTPUT_DIR, tick, state_slug]
	var frame_image := get_viewport().get_texture().get_image()
	var save_error := frame_image.save_png(ProjectSettings.globalize_path(resource_path))
	if save_error != OK:
		_failures.append("could not save tick %d: %s" % [tick, error_string(save_error)])


func _validate_result() -> void:
	var damage_offsets: Array[int] = []
	var stream_start_count := 0
	var stream_end_count := 0
	for row: Dictionary in _event_rows:
		match str(row.get("kind", "")):
			"flamethrower_stream_start":
				stream_start_count += 1
			"flamethrower_stream_end":
				stream_end_count += 1
			"flamethrower_damage_tick":
				var payload: Dictionary = row.get("payload", {})
				damage_offsets.append(int(payload.get("offset_ticks", -1)))
	if damage_offsets != [0, 15, 30]:
		_failures.append("damage offsets were %s, expected [0, 15, 30]" % [damage_offsets])
	if stream_start_count != 1 or stream_end_count != 1:
		_failures.append("expected exactly one stream start/end, got %d/%d" % [stream_start_count, stream_end_count])
	var expected_ground_hp := 4000 - 295 * 3
	for target: VisualTroop in _ground_targets:
		if target.hp != expected_ground_hp:
			_failures.append("%s HP %d, expected %d" % [target.name, target.hp, expected_ground_hp])
	if _air_target.hp != 4000:
		_failures.append("air target took damage: HP %d" % _air_target.hp)
	var snapshot: Dictionary = _tower.call("get_debug_snapshot")
	if str(snapshot.get("state", "")) != "COOLDOWN":
		_failures.append("tick 63 state is not COOLDOWN")
	if int(snapshot.get("next_stream_ready_tick", -1)) != 108:
		_failures.append("absolute ready tick is not 108")
	var muzzle := _tower.find_child("MuzzleSocket", true, false) as Node3D
	if not is_instance_valid(muzzle):
		_failures.append("runtime MuzzleSocket is missing")
	else:
		var muzzle_forward := -muzzle.global_transform.basis.z
		muzzle_forward.y = 0.0
		muzzle_forward = muzzle_forward.normalized()
		if not muzzle_forward.is_equal_approx(Vector3.FORWARD):
			_failures.append("production MuzzleSocket forward drifted from world -Z: %s" % muzzle_forward)
		var vfx := muzzle.get_node_or_null("FlamethrowerVfxPool")
		if not is_instance_valid(vfx):
			_failures.append("VFX is not bound to the current production MuzzleSocket")


func _write_report() -> void:
	var report := {
		"status": "PASS" if _failures.is_empty() else "FAIL",
		"frames": LAST_CAPTURE_TICK + 1,
		"level": 8,
		"facing_step": 0,
		"expected_damage_offsets": [0, 15, 30],
		"ground_hp": [_ground_targets[0].hp, _ground_targets[1].hp, _ground_targets[2].hp],
		"air_hp": _air_target.hp,
		"events": _event_rows,
		"failures": _failures,
	}
	var report_file := FileAccess.open("%s/report.json" % OUTPUT_DIR, FileAccess.WRITE)
	if report_file == null:
		_failures.append("could not open visual report for writing")
		return
	report_file.store_string(JSON.stringify(report, "\t") + "\n")


func _write_keyframe_strip() -> void:
	var file_names: Array[String] = [
		"frame_000_priming.png",
		"frame_018_firing.png",
		"frame_033_firing.png",
		"frame_048_firing.png",
		"frame_063_cooldown.png",
	]
	var images: Array[Image] = []
	for file_name: String in file_names:
		var frame := Image.new()
		var load_error := frame.load(ProjectSettings.globalize_path("%s/%s" % [OUTPUT_DIR, file_name]))
		if load_error != OK:
			_failures.append("could not load keyframe %s: %s" % [file_name, error_string(load_error)])
			return
		images.append(frame)
	var first := images[0]
	var strip := Image.create(first.get_width() * images.size(), first.get_height(), false, first.get_format())
	for index: int in range(images.size()):
		strip.blit_rect(
			images[index],
			Rect2i(Vector2i.ZERO, images[index].get_size()),
			Vector2i(first.get_width() * index, 0)
		)
	var save_error := strip.save_png(ProjectSettings.globalize_path("%s/flamethrower_keyframes.png" % OUTPUT_DIR))
	if save_error != OK:
		_failures.append("could not save keyframe strip: %s" % error_string(save_error))


func _clear_previous_evidence() -> void:
	var output_directory := DirAccess.open(OUTPUT_DIR)
	if output_directory == null:
		return
	for file_name: String in output_directory.get_files():
		if file_name.begins_with("frame_") and file_name.ends_with(".png"):
			output_directory.remove(file_name)
		elif file_name == "report.json":
			output_directory.remove(file_name)
