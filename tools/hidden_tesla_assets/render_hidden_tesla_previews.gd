extends SceneTree

const IMAGE_SIZE := Vector2i(512, 512)
const HATCH_OPEN_PORTION := 0.45
const TOWER_RISE_START_PORTION := HATCH_OPEN_PORTION
const TOWER_RISE_END_PORTION := 0.86
const HATCH_SETTLE_START_PORTION := 0.88


func _initialize() -> void:
	# The normal desktop renderer loads project autoloads. The preview harness
	# does not need music, and explicitly freeing AudioManager prevents its MP3
	# playback object from surviving the short-lived render process.
	var audio_manager := root.get_node_or_null("AudioManager")
	if audio_manager != null:
		root.remove_child(audio_manager)
		audio_manager.free()
	call_deferred("_render_requested_levels")


func _render_requested_levels() -> void:
	var output_dir := "res://Model/HiddenTesla/preview"
	var levels: Array[int] = [10]
	var view := "full"
	var reveal_progress := 1.0
	var contact_sheet_path := ""
	for argument: String in OS.get_cmdline_user_args():
		if argument.begins_with("--output-dir="):
			output_dir = argument.trim_prefix("--output-dir=")
		elif argument.begins_with("--levels="):
			levels.clear()
			for value: String in argument.trim_prefix("--levels=").split(",", false):
				levels.append(clampi(value.to_int(), 1, 10))
		elif argument.begins_with("--view="):
			view = argument.trim_prefix("--view=")
		elif argument.begins_with("--reveal-progress="):
			reveal_progress = clampf(
				argument.trim_prefix("--reveal-progress=").to_float(),
				0.0,
				1.0
			)
		elif argument.begins_with("--contact-sheet="):
			contact_sheet_path = argument.trim_prefix("--contact-sheet=")
	if view not in ["full", "base"]:
		push_error("Unsupported Hidden Tesla preview view: %s" % view)
		quit(1)
		return

	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_dir))
	for level: int in levels:
		var file_name := "hidden_tesla.png" if level == 10 and levels.size() == 1 else "hidden_tesla_l%02d.png" % level
		var output_path := output_dir.path_join(file_name)
		var error := await _render_level(level, output_path, view, reveal_progress)
		if error != OK:
			push_error("Failed to render L%02d: %s" % [level, error_string(error)])
			quit(1)
			return
		print("Rendered L%02d to %s" % [level, output_path])
	if contact_sheet_path != "":
		var sheet_error := _write_contact_sheet(output_dir, levels, contact_sheet_path)
		if sheet_error != OK:
			push_error("Failed to write Hidden Tesla contact sheet: %s" % error_string(sheet_error))
			quit(1)
			return
		print("Rendered contact sheet to %s" % contact_sheet_path)
	quit()


func _render_level(
	level: int,
	output_path: String,
	view: String,
	reveal_progress: float
) -> Error:
	var viewport := SubViewport.new()
	viewport.size = IMAGE_SIZE
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)

	var world := World3D.new()
	viewport.world_3d = world
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.035, 0.04, 0.05, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.72, 0.78, 0.9)
	environment.ambient_light_energy = 0.82
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world.environment = environment

	var stage := Node3D.new()
	viewport.add_child(stage)
	var path := "res://Model/HiddenTesla/level_%02d/HiddenTeslaL%02d.tscn" % [level, level]
	var packed := load(path) as PackedScene
	if packed == null:
		viewport.queue_free()
		return ERR_CANT_OPEN
	var visual := packed.instantiate() as Node3D
	if visual == null:
		viewport.queue_free()
		return ERR_INVALID_DATA
	stage.add_child(visual)
	visual.scale = Vector3.ONE * 0.65
	var hatch_left := visual.get_node_or_null("Hatch/HatchL") as Node3D
	var hatch_right := visual.get_node_or_null("Hatch/HatchR") as Node3D
	var tower := visual.get_node_or_null("TeslaTower") as Node3D
	var open_pivot_x := absf(float(visual.get_meta("hatch_open_pivot_x", 0.0)))
	var clearance_pivot_x := absf(float(
		visual.get_meta("hatch_clearance_pivot_x", open_pivot_x)
	))
	var open_degrees := float(visual.get_meta("hatch_open_degrees", 160.0))
	var hatch_progress := clampf(reveal_progress / HATCH_OPEN_PORTION, 0.0, 1.0)
	var hatch_eased := _smoothstep(hatch_progress)
	var settle_progress := clampf(
		(reveal_progress - HATCH_SETTLE_START_PORTION)
		/ (1.0 - HATCH_SETTLE_START_PORTION),
		0.0,
		1.0
	)
	var settle_eased := _smoothstep(settle_progress)
	if hatch_left != null:
		var left_clearance_position := hatch_left.position
		left_clearance_position.x = clearance_pivot_x
		var left_open_position := left_clearance_position
		left_open_position.x = open_pivot_x
		hatch_left.position = hatch_left.position.lerp(
			left_clearance_position,
			hatch_eased
		).lerp(left_open_position, settle_eased)
		hatch_left.rotation_degrees.z -= open_degrees * hatch_eased
	if hatch_right != null:
		var right_clearance_position := hatch_right.position
		right_clearance_position.x = -clearance_pivot_x
		var right_open_position := right_clearance_position
		right_open_position.x = -open_pivot_x
		hatch_right.position = hatch_right.position.lerp(
			right_clearance_position,
			hatch_eased
		).lerp(right_open_position, settle_eased)
		hatch_right.rotation_degrees.z += open_degrees * hatch_eased
	if tower != null and reveal_progress < 1.0:
		var tower_progress := clampf(
			(reveal_progress - TOWER_RISE_START_PORTION)
			/ (TOWER_RISE_END_PORTION - TOWER_RISE_START_PORTION),
			0.0,
			1.0
		)
		var tower_eased := _smoothstep(tower_progress)
		var hidden_y := float(visual.get_meta("hidden_tower_y", -1.08))
		var active_y := float(visual.get_meta("active_tower_y", tower.position.y))
		tower.position.y = lerpf(hidden_y, active_y, tower_eased)
		tower.visible = tower_progress > 0.0

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	key_light.light_color = Color(1.0, 0.86, 0.68)
	key_light.light_energy = 1.45
	key_light.shadow_enabled = true
	stage.add_child(key_light)

	var rim_light := OmniLight3D.new()
	rim_light.position = Vector3(-1.1, 1.25, -1.0)
	rim_light.light_color = Color(0.32, 0.58, 1.0)
	rim_light.light_energy = 2.2
	rim_light.omni_range = 4.0
	stage.add_child(rim_light)
	var fill_light := OmniLight3D.new()
	fill_light.position = Vector3(1.4, 1.45, 1.55)
	fill_light.light_color = Color(1.0, 0.94, 0.84)
	fill_light.light_energy = 1.65
	fill_light.omni_range = 4.0
	stage.add_child(fill_light)

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	stage.add_child(camera)
	if view == "base":
		# Low, close framing exposes panel/mount/tower contact on every level.
		# The normal hero framing intentionally prioritizes the complete tower and
		# can hide interpenetration at the bottom behind the upper silhouette.
		camera.size = 0.46
		camera.position = Vector3(0.72, 0.38, 0.92)
		camera.look_at(Vector3(0.0, 0.105, 0.0), Vector3.UP)
	else:
		camera.size = 0.86
		camera.position = Vector3(1.10, 0.88, 1.24)
		camera.look_at(Vector3(0.0, 0.30, 0.0), Vector3.UP)
	camera.current = true

	for _frame: int in range(4):
		await process_frame
	var image := viewport.get_texture().get_image()
	if image == null or image.is_empty():
		root.remove_child(viewport)
		viewport.free()
		return ERR_CANT_CREATE
	var save_error := image.save_png(ProjectSettings.globalize_path(output_path))
	viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	viewport.world_3d = null
	world.environment = null
	root.remove_child(viewport)
	viewport.free()
	await process_frame
	return save_error


func _smoothstep(value: float) -> float:
	return value * value * (3.0 - 2.0 * value)


func _write_contact_sheet(output_dir: String, levels: Array[int], output_path: String) -> Error:
	const COLUMNS := 5
	var rows := ceili(float(levels.size()) / float(COLUMNS))
	var sheet := Image.create(
		IMAGE_SIZE.x * COLUMNS,
		IMAGE_SIZE.y * rows,
		false,
		Image.FORMAT_RGBA8
	)
	sheet.fill(Color(0.035, 0.04, 0.05, 1.0))
	for index: int in range(levels.size()):
		var level := levels[index]
		var file_name := (
			"hidden_tesla.png"
			if level == 10 and levels.size() == 1
			else "hidden_tesla_l%02d.png" % level
		)
		var source_path := ProjectSettings.globalize_path(output_dir.path_join(file_name))
		var tile := Image.load_from_file(source_path)
		if tile == null or tile.is_empty():
			return ERR_CANT_OPEN
		var destination := Vector2i(
			(index % COLUMNS) * IMAGE_SIZE.x,
			floori(float(index) / float(COLUMNS)) * IMAGE_SIZE.y
		)
		sheet.blit_rect(tile, Rect2i(Vector2i.ZERO, tile.get_size()), destination)
	DirAccess.make_dir_recursive_absolute(
		ProjectSettings.globalize_path(output_path.get_base_dir())
	)
	return sheet.save_png(ProjectSettings.globalize_path(output_path))
