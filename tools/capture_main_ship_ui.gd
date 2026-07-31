extends SceneTree

const ISLAND_SCENE: PackedScene = preload("res://Model/Island/pirate_island.glb")
const MAIN_SHIP_CONTROLLER_SCRIPT: Script = preload("res://scripts/main_ship_controller.gd")
const OUTPUT_SIZE := Vector2i(512, 512)


func _initialize() -> void:
	call_deferred("_render_portrait")


func _render_portrait() -> void:
	print("[MAIN_SHIP_UI] render_start")
	var viewport := SubViewport.new()
	viewport.size = OUTPUT_SIZE
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	var camera := _add_lighting(stage)

	var island_visual := ISLAND_SCENE.instantiate() as Node3D
	island_visual.name = "IslandVisual"
	stage.add_child(island_visual)

	var controller := Node3D.new()
	controller.name = "MainShipController"
	controller.set_script(MAIN_SHIP_CONTROLLER_SCRIPT)
	controller.set("island_visual_path", NodePath("../IslandVisual"))
	controller.set("water_path", NodePath())
	controller.set("visual_scale_multiplier", 1.3)
	stage.add_child(controller)
	controller.call("_attach_island_ship")
	print("[MAIN_SHIP_UI] ship_attach_requested")

	var ship := controller.get("ship_visual") as Node3D
	if ship == null:
		push_error("Main Ship UI portrait failed: Ship_Large was not attached.")
		quit(1)
		return
	controller.set_process(false)
	island_visual.visible = false
	print("[MAIN_SHIP_UI] ship_ready type=", ship.get_class(), " children=", ship.get_child_count())

	for _frame in 10:
		await process_frame
	print("[MAIN_SHIP_UI] framing_start")
	_frame_camera(ship, camera)
	print("[MAIN_SHIP_UI] framing_done")
	for _frame in 3:
		await process_frame

	print("[MAIN_SHIP_UI] image_read_start")
	var image := _fit_portrait(viewport.get_texture().get_image())
	print("[MAIN_SHIP_UI] image_read_done")
	var output_path := _output_path()
	var error := image.save_png(output_path)
	if error != OK:
		push_error("Main Ship UI portrait failed: %s" % error_string(error))
		quit(1)
		return

	var used_rect := image.get_used_rect()
	if used_rect.size.x < 220 or used_rect.size.y < 180:
		push_error("Main Ship UI portrait failed: rendered ship is unexpectedly small.")
		quit(1)
		return
	if image.get_pixel(0, 0).a > 0.01:
		push_error("Main Ship UI portrait failed: transparent background was lost.")
		quit(1)
		return
	print(
		"[MAIN_SHIP_UI] PASS path=", output_path,
		" size=", image.get_width(), "x", image.get_height(),
		" used_rect=", used_rect
	)
	viewport.free()
	await process_frame
	quit()


func _add_lighting(stage: Node3D) -> Camera3D:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color.TRANSPARENT
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d7ecff")
	environment.ambient_light_energy = 0.38
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48, -36, 0)
	key_light.light_color = Color("#fff1cf")
	key_light.light_energy = 0.78
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-24, 144, 0)
	fill_light.light_color = Color("#8fd9ff")
	fill_light.light_energy = 0.28
	stage.add_child(fill_light)

	var camera := Camera3D.new()
	camera.fov = 34.0
	camera.current = true
	stage.add_child(camera)
	return camera


func _frame_camera(ship: Node3D, camera: Camera3D) -> void:
	var bounds_data := {"bounds": AABB(), "has_bounds": false}
	_merge_visible_mesh_bounds(ship, bounds_data)
	var has_bounds := bool(bounds_data.has_bounds)
	if not has_bounds:
		push_error("Main Ship UI portrait failed: Ship_Large has no visible meshes.")
		quit(1)
		return

	var bounds: AABB = bounds_data.bounds
	var center := bounds.get_center()
	var view_direction := Vector3(0.74, 0.58, 1.0).normalized()
	var extent := maxf(maxf(bounds.size.x, bounds.size.z), bounds.size.y * 0.8)
	camera.position = center + view_direction * maxf(extent * 1.85, 0.1)
	camera.look_at(center + Vector3.UP * bounds.size.y * 0.04, Vector3.UP)


func _merge_visible_mesh_bounds(node: Node, bounds_data: Dictionary) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh != null and mesh_instance.visible:
			var mesh_bounds: AABB = mesh_instance.global_transform * mesh_instance.get_aabb()
			if bool(bounds_data.has_bounds):
				bounds_data.bounds = (bounds_data.bounds as AABB).merge(mesh_bounds)
			else:
				bounds_data.bounds = mesh_bounds
				bounds_data.has_bounds = true
	for child in node.get_children():
		_merge_visible_mesh_bounds(child, bounds_data)


func _fit_portrait(source: Image) -> Image:
	source.convert(Image.FORMAT_RGBA8)
	var used_rect := source.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return source
	const PADDING: int = 18
	var crop_rect := used_rect.grow(PADDING).intersection(Rect2i(Vector2i.ZERO, source.get_size()))
	var cropped := source.get_region(crop_rect)
	const TARGET_EXTENT: int = 464
	var scale_factor := minf(
		float(TARGET_EXTENT) / float(cropped.get_width()),
		float(TARGET_EXTENT) / float(cropped.get_height())
	)
	var fitted_size := Vector2i(
		maxi(1, roundi(cropped.get_width() * scale_factor)),
		maxi(1, roundi(cropped.get_height() * scale_factor))
	)
	cropped.resize(fitted_size.x, fitted_size.y, Image.INTERPOLATE_LANCZOS)
	var output := Image.create_empty(OUTPUT_SIZE.x, OUTPUT_SIZE.y, false, Image.FORMAT_RGBA8)
	output.fill(Color.TRANSPARENT)
	var destination := Vector2i(
		floori(float(OUTPUT_SIZE.x - fitted_size.x) / 2.0),
		floori(float(OUTPUT_SIZE.y - fitted_size.y) / 2.0)
	)
	output.blit_rect(cropped, Rect2i(Vector2i.ZERO, fitted_size), destination)
	return output


func _output_path() -> String:
	var path := ProjectSettings.globalize_path(
		"res://web/src/assets/buildings/main_ship.png"
	)
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-out="):
			path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path
