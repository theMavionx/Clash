extends Node3D
## Rendered frame-by-frame verification of the single TH10 roof Cannon.

const CONTROLLER_SCRIPT: Script = preload("res://scripts/town_hall_cannon.gd")
const TH10_MODEL: PackedScene = preload("res://Model/Town_Hall/Town Hall Level 10.glb")
const OUTPUT_DIR := "res://.codex-artifacts/town-hall-cannon-frames"
const LAST_TICK: int = 240
const FRAME_DT: float = 1.0 / 60.0


class VisualTroop extends Node3D:
	var hp: int = 12000
	var unit_target_type: String = BaseTroop.UNIT_TARGET_GROUND
	var _is_dead: bool = false
	var hp_label: Label3D = null

	func take_damage(amount: int) -> void:
		hp = maxi(0, hp - amount)
		_is_dead = hp <= 0
		if hp_label != null:
			hp_label.text = "GROUND TARGET\nHP %d" % hp

	func is_targetable_by_defenses() -> bool:
		return not _is_dead and hp > 0

	func _get_troop_name() -> String:
		return "visual_ground_probe"


var _town_hall: Node3D = null
var _target: VisualTroop = null
var _status: Label = null
var _shot_index: int = 0
var _previous_presentation_active := false
var _captured_images: Array[Image] = []
var _captured_labels: Array[String] = []
var _failures: Array[String] = []
var _shot_barrels: Array[int] = []
var _shot_recoil_seen: Array[bool] = []
var _max_down_pitch: float = 0.0


func _ready() -> void:
	get_window().size = Vector2i(960, 540)
	_build_stage()
	_build_combat_fixture()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT_DIR))
	_clear_previous_frames()
	await get_tree().process_frame
	await get_tree().process_frame
	BaseTroop.invalidate_combat_lists()
	_town_hall.call("set_spawn_facing_global", Vector3(-0.8, 0.0, 0.8))
	await get_tree().process_frame
	_refresh_status(0, "IDLE / TRACKING")
	await _capture_named_frame("00_spawn_facing", true)

	for tick in range(1, LAST_TICK + 1):
		_town_hall.call("_physics_process", FRAME_DT)
		var snapshot: Dictionary = _town_hall.call("get_debug_snapshot")
		var pitches: Array = snapshot.get("barrel_pitches", [])
		if not pitches.is_empty():
			_max_down_pitch = maxf(_max_down_pitch, float(pitches[0]))
		var presentation_active := bool(snapshot.presentation_active)
		if presentation_active and not _previous_presentation_active:
			_shot_index += 1
			_shot_barrels.append(int(snapshot.presentation_barrel_index))
			_shot_recoil_seen.append(false)
		_refresh_status(tick, _state_text(snapshot))
		await get_tree().process_frame
		RenderingServer.force_draw(false)
		if tick in [5, 10, 15, 20]:
			await _capture_named_frame("tracking_yaw_tick_%03d" % tick, true)
		if presentation_active and _shot_index <= 2:
			var elapsed := float(snapshot.presentation_elapsed)
			var frame_number := roundi(elapsed / FRAME_DT)
			await _capture_named_frame(
				"shot_%02d_barrel_%d_frame_%02d" % [
					_shot_index,
					int(snapshot.presentation_barrel_index) + 1,
					frame_number,
				],
				_is_contact_keyframe(elapsed),
			)
			if elapsed >= 0.13 and elapsed <= 0.18:
				_shot_recoil_seen[_shot_index - 1] = true
		_previous_presentation_active = presentation_active

	_validate_result()
	_save_contact_sheet()
	_write_report()
	_town_hall.call("cleanup_defense_visuals")
	await get_tree().process_frame
	if _failures.is_empty():
		print(
			"TOWN_HALL_CANNON_VISUAL_TEST_PASS shots=%d frames=%d hp=%d"
			% [_shot_index, _count_saved_frames(), _target.hp]
		)
		get_tree().quit(0)
	else:
		for failure in _failures:
			push_error("TOWN_HALL_CANNON_VISUAL_TEST_FAIL: " + failure)
		get_tree().quit(1)


func _build_stage() -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("76b6df")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("dcecff")
	environment.ambient_light_energy = 0.82
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment_node.environment = environment
	add_child(environment_node)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-52.0, -34.0, 0.0)
	key_light.light_color = Color("ffe2b8")
	key_light.light_energy = 1.35
	key_light.shadow_enabled = true
	add_child(key_light)
	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-35.0, 145.0, 0.0)
	fill_light.light_color = Color("8fc8ff")
	fill_light.light_energy = 0.48
	add_child(fill_light)

	var ground := MeshInstance3D.new()
	var ground_mesh := PlaneMesh.new()
	ground_mesh.size = Vector2(4.0, 4.0)
	ground.mesh = ground_mesh
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color("78aa43")
	ground_material.roughness = 0.92
	ground.material_override = ground_material
	add_child(ground)

	var camera := Camera3D.new()
	# The evidence camera intentionally frames the roof instead of the whole
	# building: barrel yaw, anticipation, muzzle flash and recoil must remain
	# readable at native screenshot resolution.
	camera.position = Vector3(0.88, 1.30, 1.22)
	camera.fov = 30.0
	add_child(camera)
	camera.look_at(Vector3(0.03, 0.88, 0.04), Vector3.UP)
	camera.current = true

	_status = Label.new()
	_status.position = Vector2(22.0, 18.0)
	_status.add_theme_font_size_override("font_size", 23)
	_status.add_theme_color_override("font_color", Color.WHITE)
	_status.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.85))
	_status.add_theme_constant_override("shadow_offset_x", 2)
	_status.add_theme_constant_override("shadow_offset_y", 2)
	add_child(_status)

	var legend := Label.new()
	legend.text = "TH10 • one roof Cannon • horizontal yaw + close-target pitch • ground only"
	legend.position = Vector2(22.0, 505.0)
	legend.add_theme_font_size_override("font_size", 17)
	legend.add_theme_color_override("font_color", Color("f8f2d0"))
	add_child(legend)


func _build_combat_fixture() -> void:
	_town_hall = Node3D.new()
	_town_hall.name = "TownHallCannonVisualRuntime"
	_town_hall.set_script(CONTROLLER_SCRIPT)
	_town_hall.process_mode = Node.PROCESS_MODE_DISABLED
	_town_hall.attack_sfx_enabled = false
	var visual := TH10_MODEL.instantiate() as Node3D
	visual.scale = Vector3.ONE * 0.14
	visual.set_meta("building_visual_model", true)
	_town_hall.add_child(visual)
	_town_hall.call("set_level", 10)
	add_child(_town_hall)

	_target = VisualTroop.new()
	_target.name = "GroundTarget"
	_target.position = Vector3(0.30, 0.15, 1.10)
	_target.set_meta("replay_order", 1)
	_target.add_to_group("troops")
	var body := MeshInstance3D.new()
	var body_mesh := CapsuleMesh.new()
	body_mesh.radius = 0.115
	body_mesh.height = 0.36
	body_mesh.radial_segments = 12
	body_mesh.rings = 6
	body.mesh = body_mesh
	var body_material := StandardMaterial3D.new()
	body_material.albedo_color = Color("c94d35")
	body_material.roughness = 0.5
	body.material_override = body_material
	_target.add_child(body)
	var hp_label := Label3D.new()
	hp_label.text = "GROUND TARGET\nHP %d" % _target.hp
	hp_label.position = Vector3(0.0, 0.34, 0.0)
	hp_label.font_size = 36
	hp_label.pixel_size = 0.0022
	hp_label.outline_size = 7
	hp_label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	hp_label.no_depth_test = true
	_target.add_child(hp_label)
	_target.hp_label = hp_label
	add_child(_target)


func _state_text(snapshot: Dictionary) -> String:
	if not bool(snapshot.presentation_active):
		return "TRACKING / RELOAD"
	var elapsed := float(snapshot.presentation_elapsed)
	if elapsed < 0.08:
		return "SHOT %d • BARREL %d • ANTICIPATION" % [_shot_index, int(snapshot.presentation_barrel_index) + 1]
	if elapsed < 0.12:
		return "SHOT %d • BARREL %d • MUZZLE FLASH" % [_shot_index, int(snapshot.presentation_barrel_index) + 1]
	if elapsed < 0.18:
		return "SHOT %d • BARREL %d • RECOIL" % [_shot_index, int(snapshot.presentation_barrel_index) + 1]
	return "SHOT %d • BARREL %d • RECOVERY" % [_shot_index, int(snapshot.presentation_barrel_index) + 1]


func _refresh_status(tick: int, state: String) -> void:
	_status.text = "TOWN HALL 10 CANNON — YAW/PITCH FRAME TEST\nTick %03d • %s\nTarget HP %d • pitch %.1f° • cadence 1.60 s" % [
		tick,
		state,
		_target.hp if _target != null else 0,
		rad_to_deg(_max_down_pitch),
	]


func _is_contact_keyframe(elapsed: float) -> bool:
	for key_time in [0.0, 0.067, 0.10, 0.15, 0.25, 0.317]:
		if absf(elapsed - key_time) <= FRAME_DT * 0.55:
			return true
	return false


func _capture_named_frame(file_stem: String, keep_for_contact: bool) -> void:
	if DisplayServer.get_name() == "headless":
		_failures.append("visual test requires a rendered display")
		return
	var image := get_viewport().get_texture().get_image()
	image.save_png(OUTPUT_DIR + "/" + file_stem + ".png")
	if keep_for_contact and _captured_images.size() < 12:
		_captured_images.append(image.duplicate())
		_captured_labels.append(file_stem)


func _clear_previous_frames() -> void:
	var directory := DirAccess.open(OUTPUT_DIR)
	if directory == null:
		return
	for file_name in directory.get_files():
		if file_name.ends_with(".png") or file_name.ends_with(".md"):
			directory.remove(file_name)


func _validate_result() -> void:
	if _shot_index < 2:
		_failures.append("fewer than two firing presentations completed")
	if _shot_barrels.size() < 2 or _shot_barrels.slice(0, 2) != [0, 0]:
		_failures.append("a firing presentation used the removed second barrel")
	if _shot_recoil_seen.size() < 2 or not _shot_recoil_seen[0] or not _shot_recoil_seen[1]:
		_failures.append("one or both barrels missed the recoil keyframe")
	if _target.hp > 12000 - 1680:
		_failures.append("two rendered projectiles did not apply two 840-damage hits")
	if _max_down_pitch < deg_to_rad(12.0):
		_failures.append("barrel never pitched down far enough for the close target")
	if _count_saved_frames() < 35:
		_failures.append("frame-by-frame evidence set is incomplete")


func _count_saved_frames() -> int:
	var directory := DirAccess.open(OUTPUT_DIR)
	if directory == null:
		return 0
	var count := 0
	for file_name in directory.get_files():
		if file_name.ends_with(".png") and file_name != "contact_sheet.png":
			count += 1
	return count


func _save_contact_sheet() -> void:
	if _captured_images.is_empty():
		return
	var tile_size := Vector2i(240, 135)
	var columns := 4
	var rows := ceili(float(_captured_images.size()) / float(columns))
	var sheet := Image.create(tile_size.x * columns, tile_size.y * rows, false, Image.FORMAT_RGBA8)
	sheet.fill(Color("172234"))
	for index in range(_captured_images.size()):
		var tile := _captured_images[index]
		tile.resize(tile_size.x, tile_size.y, Image.INTERPOLATE_LANCZOS)
		var destination := Vector2i((index % columns) * tile_size.x, (index / columns) * tile_size.y)
		sheet.blit_rect(tile, Rect2i(Vector2i.ZERO, tile_size), destination)
	sheet.save_png(OUTPUT_DIR + "/contact_sheet.png")


func _write_report() -> void:
	var report := FileAccess.open(OUTPUT_DIR + "/report.md", FileAccess.WRITE)
	if report == null:
		return
	report.store_string("# Town Hall 10 Cannon visual verification\n\n")
	report.store_string("- Result: `%s`\n" % ("PASS" if _failures.is_empty() else "FAIL"))
	report.store_string("- Captured firing frames: `%d`\n" % _count_saved_frames())
	report.store_string("- Completed presentations: `%d`\n" % _shot_index)
	report.store_string("- First barrel order: `%s`\n" % str(_shot_barrels))
	report.store_string("- Recoil keyframes observed: `%s`\n" % str(_shot_recoil_seen))
	report.store_string("- Maximum close-target downward pitch: `%.2f degrees`\n" % rad_to_deg(_max_down_pitch))
	report.store_string("- Target HP after test: `%d`\n" % _target.hp)
	if not _failures.is_empty():
		report.store_string("- Failures: `%s`\n" % "; ".join(_failures))
	report.close()
