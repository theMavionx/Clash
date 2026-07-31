extends SceneTree

const FIRE_DRAGON_SCENE: PackedScene = preload(
	"res://Model/Characters/FireDragon/FireDragon.tscn"
)
const FIRE_DRAGON_SCRIPT: Script = preload("res://scripts/fire_dragon.gd")
const OUTPUT_SIZE := Vector2i(512, 512)
const RENDER_SIZE := Vector2i(960, 720)
const DRAGON_POSITION := Vector3(-0.38, 0.0, 0.02)
const POSE_TARGET_POSITION := Vector3(0.64, 0.15, -0.08)


func _initialize() -> void:
	call_deferred("_render_captures")


func _render_captures() -> void:
	print("[FIRE_DRAGON_UI] render_start")
	var viewport := SubViewport.new()
	viewport.size = RENDER_SIZE
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	viewport.msaa_3d = Viewport.MSAA_4X
	root.add_child(viewport)

	var stage := Node3D.new()
	viewport.add_child(stage)
	var camera := _add_lighting(stage)
	var dragon := FIRE_DRAGON_SCENE.instantiate() as Node3D
	dragon.set_script(FIRE_DRAGON_SCRIPT)
	dragon.position = DRAGON_POSITION
	stage.add_child(dragon)
	print("[FIRE_DRAGON_UI] runtime_dragon_instantiated")

	for _frame in 12:
		await process_frame
	dragon.set_physics_process(false)
	var face_target := POSE_TARGET_POSITION
	face_target.y = dragon.global_position.y
	dragon.look_at(face_target, Vector3.UP)
	dragon.rotate_y(PI)
	dragon.call("_play_dragon_animation", "fly_fire_breath_attack_low", true)
	for _frame in 5:
		await process_frame
	print("[FIRE_DRAGON_UI] attack_scene_ready")

	var player := dragon.get("anim_player") as AnimationPlayer
	if player == null or player.current_animation_length <= 0.0:
		_fail("runtime attack animation is unavailable")
		return
	player.pause()
	player.seek(player.current_animation_length * 0.53, true)
	_hide_runtime_overlays(dragon)
	_frame_camera(dragon, camera)

	for _frame in 3:
		await process_frame
	await RenderingServer.frame_post_draw

	var viewport_texture := viewport.get_texture()
	if viewport_texture == null:
		_fail("viewport texture is unavailable; run with a rendering display driver")
		return
	var portrait_source := viewport_texture.get_image()
	if portrait_source == null or portrait_source.is_empty():
		_fail("portrait frame is empty; run with a rendering display driver")
		return
	print("[FIRE_DRAGON_UI] portrait_frame_ready")
	var portrait := _fit_portrait(portrait_source)
	var portrait_path := _portrait_output_path()
	var portrait_error := portrait.save_png(portrait_path)
	if portrait_error != OK:
		_fail("portrait save failed: %s" % error_string(portrait_error))
		return

	var used_rect := portrait.get_used_rect()
	if used_rect.size.x < 260 or used_rect.size.y < 180:
		_fail("portrait subject is unexpectedly small: %s" % used_rect)
		return
	if portrait.get_pixel(0, 0).a > 0.001:
		_fail("portrait background is not transparent")
		return

	print(
		"[FIRE_DRAGON_UI] PASS portrait=", portrait_path,
		" animation=", player.current_animation,
		" phase=", snappedf(
			player.current_animation_position / player.current_animation_length,
			0.001
		),
		" used_rect=", used_rect
	)
	viewport.free()
	await process_frame
	quit()


func _add_lighting(stage: Node3D) -> Camera3D:
	var world_environment := WorldEnvironment.new()
	world_environment.name = "WorldEnvironment"
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.0, 0.0, 0.0, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d8efff")
	environment.ambient_light_energy = 0.46
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48, -34, 0)
	key_light.light_color = Color("#fff0cb")
	key_light.light_energy = 0.82
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-22, 142, 0)
	fill_light.light_color = Color("#77cfff")
	fill_light.light_energy = 0.30
	stage.add_child(fill_light)

	var camera := Camera3D.new()
	camera.fov = 37.0
	camera.current = true
	stage.add_child(camera)
	return camera


func _frame_camera(dragon: Node3D, camera: Camera3D) -> void:
	var bounds := _mesh_bounds(dragon)
	if bounds.size == Vector3.ZERO:
		_fail("runtime dragon has no rendered mesh")
		return
	var center := bounds.get_center()
	var view_direction := Vector3(0.58, 0.28, 1.0).normalized()
	var distance := maxf(bounds.size.x, bounds.size.z) * 2.02
	camera.position = center + view_direction * distance
	camera.look_at(center + Vector3(0.0, bounds.size.y * 0.03, 0.0), Vector3.UP)


func _mesh_bounds(node: Node3D) -> AABB:
	var bounds := AABB()
	var has_bounds := false
	for mesh_node in node.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_node as MeshInstance3D
		if mesh_instance.mesh == null or not mesh_instance.visible:
			continue
		var mesh_bounds := mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = mesh_bounds if not has_bounds else bounds.merge(mesh_bounds)
		has_bounds = true
	return bounds if has_bounds else AABB()


func _hide_runtime_overlays(dragon: Node) -> void:
	for child in dragon.find_children("*", "Sprite3D", true, false):
		(child as Sprite3D).visible = false
	for child in dragon.find_children("*", "Label3D", true, false):
		(child as Label3D).visible = false


func _fit_portrait(source: Image) -> Image:
	source.convert(Image.FORMAT_RGBA8)
	var used_rect := source.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return source
	const SOURCE_PADDING: int = 12
	const TARGET_PADDING: int = 22
	var crop_rect := used_rect.grow(SOURCE_PADDING).intersection(
		Rect2i(Vector2i.ZERO, source.get_size())
	)
	var cropped := source.get_region(crop_rect)
	var target_extent := OUTPUT_SIZE.x - TARGET_PADDING * 2
	var scale_factor := minf(
		float(target_extent) / float(cropped.get_width()),
		float(target_extent) / float(cropped.get_height())
	)
	var fitted_size := Vector2i(
		maxi(1, roundi(cropped.get_width() * scale_factor)),
		maxi(1, roundi(cropped.get_height() * scale_factor))
	)
	cropped.resize(
		fitted_size.x,
		fitted_size.y,
		Image.INTERPOLATE_LANCZOS
	)
	var output := Image.create_empty(
		OUTPUT_SIZE.x,
		OUTPUT_SIZE.y,
		false,
		Image.FORMAT_RGBA8
	)
	output.fill(Color.TRANSPARENT)
	var destination := Vector2i(
		floori(float(OUTPUT_SIZE.x - fitted_size.x) / 2.0),
		floori(float(OUTPUT_SIZE.y - fitted_size.y) / 2.0)
	)
	output.blit_rect(
		cropped,
		Rect2i(Vector2i.ZERO, fitted_size),
		destination
	)
	return output


func _portrait_output_path() -> String:
	var path := ProjectSettings.globalize_path(
		"res://web/src/assets/units/fire_dragon.png"
	)
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--portrait-out="):
			path = text.get_slice("=", 1)
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path


func _fail(message: String) -> void:
	push_error("[FIRE_DRAGON_UI] FAIL %s" % message)
	quit(1)
