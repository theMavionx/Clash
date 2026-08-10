extends Node3D
## Rendered fixed-tick evidence for L1/L5/L10 Hidden Tesla reveal and attack.

const TOWER_SCRIPT: Script = preload("res://scripts/tower_hidden_tesla.gd")
const OUTPUT_DIR := "res://artifacts/hidden-tesla-combat-frames"
const LAST_CAPTURE_TICK: int = 80
const PREVIEW_SIZE := Vector2i(320, 180)
const REPRESENTATIVE_LEVELS: Array[int] = [1, 5, 10]
const REVEAL_APPROACH_PER_TICK: float = 0.20 / 30.0


class VisualTroop extends Node3D:
	var hp: int = 10000
	var unit_target_type: String = BaseTroop.UNIT_TARGET_GROUND
	var _is_dead: bool = false
	var hp_label: Label3D = null

	func take_damage(amount: int) -> void:
		hp = maxi(0, hp - amount)
		_is_dead = hp <= 0
		if is_instance_valid(hp_label):
			hp_label.text = "HP %d" % hp

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0

	func _get_troop_name() -> String:
		return name


var _towers: Array[Node3D] = []
var _targets: Array[VisualTroop] = []
var _events: Array[Dictionary] = []
var _failures: Array[String] = []
var _status_label: Label = null
var _capture_available: bool = true
var _capture_unavailable_reported: bool = false


func _ready() -> void:
	get_window().size = Vector2i(1280, 720)
	_build_stage()
	for index in range(REPRESENTATIVE_LEVELS.size()):
		_build_lane(index, REPRESENTATIVE_LEVELS[index])
	await get_tree().process_frame
	await get_tree().process_frame
	BaseTroop.invalidate_combat_lists()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT_DIR))
	_clear_previous_evidence()
	_refresh_overlay(-1)
	await get_tree().process_frame
	RenderingServer.force_draw(false)
	_capture_frame(-1, "hidden")
	for tick in range(LAST_CAPTURE_TICK + 1):
		_advance_targets_for_reveal(tick)
		for tower in _towers:
			tower.call("_simulation_step")
		_refresh_overlay(tick)
		await get_tree().process_frame
		RenderingServer.force_draw(false)
		_capture_frame(tick, _state_slug())
	_validate_result()
	_write_report()
	_write_keyframe_strip()
	_shutdown_test_audio()
	await get_tree().process_frame
	await get_tree().process_frame
	if _failures.is_empty():
		print("HIDDEN_TESLA_VISUAL_TEST_PASS frames=%d" % (LAST_CAPTURE_TICK + 2))
		get_tree().quit(0)
	else:
		for failure in _failures:
			push_error("HIDDEN_TESLA_VISUAL_TEST_FAIL: " + failure)
		get_tree().quit(1)


func _shutdown_test_audio() -> void:
	var audio_manager := get_node_or_null("/root/AudioManager")
	if not is_instance_valid(audio_manager):
		return
	for child in audio_manager.get_children():
		if child is AudioStreamPlayer:
			child.stop()
			child.stream = null
	audio_manager.free()


func _build_stage() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("122033")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("d6e8f4")
	environment.ambient_light_energy = 0.72
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.glow_enabled = true
	world_environment.environment = environment
	add_child(world_environment)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-55.0, -32.0, 0.0)
	key_light.light_color = Color("ffe0b5")
	key_light.light_energy = 1.25
	key_light.shadow_enabled = true
	add_child(key_light)
	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-34.0, 140.0, 0.0)
	fill_light.light_color = Color("70bfff")
	fill_light.light_energy = 0.44
	add_child(fill_light)
	var ground := MeshInstance3D.new()
	var ground_mesh := PlaneMesh.new()
	ground_mesh.size = Vector2(7.4, 4.4)
	ground.mesh = ground_mesh
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color("315342")
	ground_material.roughness = 0.9
	ground.material_override = ground_material
	add_child(ground)
	var camera := Camera3D.new()
	camera.position = Vector3(4.3, 3.2, 5.1)
	camera.fov = 38.0
	add_child(camera)
	camera.look_at(Vector3(0.0, 0.30, -0.50), Vector3.UP)
	camera.current = true
	_status_label = Label.new()
	_status_label.position = Vector2(24.0, 20.0)
	_status_label.add_theme_font_size_override("font_size", 24)
	_status_label.add_theme_color_override("font_color", Color("f4f8ff"))
	add_child(_status_label)
	var legend := Label.new()
	legend.text = "TH10 Hidden Tesla • L1 / authored L5 / L10 • reveal 1.20 • damage 1.05"
	legend.position = Vector2(24.0, 680.0)
	legend.add_theme_font_size_override("font_size", 16)
	legend.add_theme_color_override("font_color", Color("b7d8ef"))
	add_child(legend)


func _build_lane(index: int, level: int) -> void:
	var lane_x := -1.7 + float(index) * 1.7
	var tower := Node3D.new()
	tower.name = "HiddenTeslaL%02dRuntime" % level
	tower.position = Vector3(lane_x, 0.0, 0.35)
	tower.set_meta("server_id", 9000 + level)
	tower.set_script(TOWER_SCRIPT)
	tower.process_mode = Node.PROCESS_MODE_DISABLED
	var visual_path := "res://Model/HiddenTesla/level_%02d/HiddenTeslaL%02d.tscn" % [level, level]
	var visual := (load(visual_path) as PackedScene).instantiate()
	visual.scale = Vector3.ONE * 0.65
	tower.add_child(visual)
	add_child(tower)
	tower.call("set_level", level)
	tower.call("rebind_visuals")
	tower.connect("hidden_tesla_event", Callable(self, "_on_tesla_event"))
	_towers.append(tower)

	var target := VisualTroop.new()
	target.name = "Target L%d" % level
	# Starts exactly on the reveal boundary: tower Z 0.35 minus target Z -0.85
	# is 1.20 units. It then advances at 0.4 units/s during the 30-tick reveal.
	target.position = Vector3(lane_x, 0.14, -0.85)
	target.set_meta("replay_order", index + 1)
	target.add_to_group("troops")
	var body := MeshInstance3D.new()
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.105
	body_mesh.height = 0.32
	body_mesh.radial_segments = 12
	body_mesh.rings = 6
	body.mesh = body_mesh
	var body_material := StandardMaterial3D.new()
	body_material.albedo_color = Color("d9673d")
	body_material.roughness = 0.46
	body.material_override = body_material
	target.add_child(body)
	var hp_label := Label3D.new()
	hp_label.text = "HP 10000"
	hp_label.position = Vector3(0.0, 0.26, 0.0)
	hp_label.font_size = 38
	hp_label.pixel_size = 0.0018
	hp_label.outline_size = 6
	hp_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	hp_label.no_depth_test = true
	target.add_child(hp_label)
	target.hp_label = hp_label
	add_child(target)
	_targets.append(target)
	var lane_label := Label3D.new()
	lane_label.text = "LEVEL %d" % level
	lane_label.position = Vector3(lane_x, 0.04, 0.86)
	lane_label.font_size = 42
	lane_label.pixel_size = 0.0020
	lane_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lane_label.no_depth_test = true
	add_child(lane_label)


func _on_tesla_event(kind: String, payload: Dictionary) -> void:
	_events.append({"kind": kind, "payload": payload.duplicate(true)})


func _advance_targets_for_reveal(tick: int) -> void:
	if tick < 1 or tick > 30:
		return
	for target in _targets:
		target.position.z += REVEAL_APPROACH_PER_TICK
	BaseTroop.invalidate_troops_cache()


func _refresh_overlay(tick: int) -> void:
	var states: Array[String] = []
	for tower in _towers:
		states.append(str((tower.call("get_debug_snapshot") as Dictionary).get("state", "UNKNOWN")))
	_status_label.text = "HIDDEN TESLA COMBAT VISUAL PROBE\nTick %03d • %s\nLate warning: reveal 1.20 • damage 1.05 • no early hit" % [tick, " / ".join(states)]


func _state_slug() -> String:
	if _towers.is_empty():
		return "unknown"
	return str((_towers[0].call("get_debug_snapshot") as Dictionary).get("state", "unknown")).to_lower()


func _capture_frame(tick: int, state_slug: String) -> void:
	var tick_slug := "hidden_idle" if tick < 0 else "%03d" % tick
	var path := "%s/frame_%s_%s.png" % [OUTPUT_DIR, tick_slug, state_slug]
	if DisplayServer.get_name() == "headless":
		_capture_available = false
		if not _capture_unavailable_reported:
			_capture_unavailable_reported = true
			print("HIDDEN_TESLA_CAPTURE_SKIPPED: dummy headless renderer has no viewport texture")
		return
	var viewport_texture := get_viewport().get_texture()
	if viewport_texture == null:
		_capture_available = false
		if not _capture_unavailable_reported:
			_capture_unavailable_reported = true
			print("HIDDEN_TESLA_CAPTURE_SKIPPED: dummy headless renderer has no viewport texture")
		return
	var image := viewport_texture.get_image()
	if image == null or image.is_empty():
		_capture_available = false
		return
	var error := image.save_png(ProjectSettings.globalize_path(path))
	if error != OK:
		_failures.append("could not save tick %d: %s" % [tick, error_string(error)])


func _validate_result() -> void:
	var reveal_started := 0
	var reveal_complete := 0
	var fire_events := 0
	var damage_events := 0
	for row in _events:
		match str(row.get("kind", "")):
			"hidden_tesla_reveal_started": reveal_started += 1
			"hidden_tesla_reveal_complete": reveal_complete += 1
			"hidden_tesla_fire": fire_events += 1
			"hidden_tesla_damage": damage_events += 1
	if reveal_started != 3 or reveal_complete != 3:
		_failures.append("expected three reveal start/complete events, got %d/%d" % [reveal_started, reveal_complete])
	if fire_events != 6 or damage_events != 6:
		_failures.append("expected two direct shots per tower, got %d fire / %d damage" % [fire_events, damage_events])
	var expected_hp: Array[int] = [10000 - 40 * 2, 10000 - 343 * 2, 10000 - 707 * 2]
	for index in range(_targets.size()):
		if _targets[index].hp != expected_hp[index]:
			_failures.append("L%d target HP %d, expected %d" % [REPRESENTATIVE_LEVELS[index], _targets[index].hp, expected_hp[index]])
	for tower in _towers:
		var snapshot: Dictionary = tower.call("get_debug_snapshot")
		if str(snapshot.get("state", "")) != "ACTIVE":
			_failures.append("%s did not remain ACTIVE" % tower.name)
		if int(snapshot.get("last_fire_tick", -1)) != 69:
			_failures.append("%s second fire tick was not 69" % tower.name)


func _write_report() -> void:
	var report := {
		"status": "PASS" if _failures.is_empty() else "FAIL",
		"levels": REPRESENTATIVE_LEVELS,
		"frames": LAST_CAPTURE_TICK + 2,
		"reveal_ticks": 30,
		"reload_ticks": 39,
		"target_hp": [_targets[0].hp, _targets[1].hp, _targets[2].hp],
		"events": _events,
		"capture_available": _capture_available,
		"failures": _failures,
	}
	var file := FileAccess.open("%s/report.json" % OUTPUT_DIR, FileAccess.WRITE)
	if file == null:
		_failures.append("could not write visual report")
		return
	file.store_string(JSON.stringify(report, "\t") + "\n")


func _write_keyframe_strip() -> void:
	if not _capture_available:
		return
	var files: Array[String] = [
		"frame_hidden_idle_hidden.png",
		"frame_000_revealing.png",
		"frame_008_revealing.png",
		"frame_015_revealing.png",
		"frame_023_revealing.png",
		"frame_030_active.png",
		"frame_031_active.png",
		"frame_069_active.png",
		"frame_080_active.png",
	]
	var images: Array[Image] = []
	for file_name in files:
		var image := Image.new()
		var error := image.load(ProjectSettings.globalize_path("%s/%s" % [OUTPUT_DIR, file_name]))
		if error != OK:
			_failures.append("could not load keyframe %s" % file_name)
			return
		image.resize(PREVIEW_SIZE.x, PREVIEW_SIZE.y, Image.INTERPOLATE_LANCZOS)
		images.append(image)
	var strip := Image.create(PREVIEW_SIZE.x * images.size(), PREVIEW_SIZE.y, false, images[0].get_format())
	for index in range(images.size()):
		strip.blit_rect(images[index], Rect2i(Vector2i.ZERO, images[index].get_size()), Vector2i(PREVIEW_SIZE.x * index, 0))
	var error := strip.save_png(ProjectSettings.globalize_path("%s/hidden_tesla_keyframes.png" % OUTPUT_DIR))
	if error != OK:
		_failures.append("could not save keyframe strip")


func _clear_previous_evidence() -> void:
	var directory := DirAccess.open(OUTPUT_DIR)
	if directory == null:
		return
	for file_name in directory.get_files():
		if file_name.ends_with(".png") or file_name == "report.json":
			directory.remove(file_name)
