extends SceneTree

const CHARACTER_SCENE: PackedScene = preload(
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx"
)
const GREEN_TEXTURE: Texture2D = preload(
	"res://Model/Characters/PeaShooter/Textures/pea_shooter_green.png"
)
const OUTPUT_SIZE := Vector2i(512, 512)


func _initialize() -> void:
	print("[PEA_SHOOTER_UI] initialize")
	call_deferred("_render_portrait")


func _render_portrait() -> void:
	print("[PEA_SHOOTER_UI] render_start")
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
	var character := CHARACTER_SCENE.instantiate() as Node3D
	character.scale = Vector3.ONE
	character.rotation_degrees.y = 0.0
	stage.add_child(character)
	_apply_green_material(character)

	var player := _find_first(character, "AnimationPlayer") as AnimationPlayer
	if player == null or player.get_animation_list().is_empty():
		push_error("Pea Shooter UI portrait failed: authored attack is unavailable.")
		quit(1)
		return
	var animation_name := player.get_animation_list()[0]
	player.play(animation_name)
	player.speed_scale = 0.0
	player.seek(player.get_animation(animation_name).length * 0.27, true)
	player.advance(0.0)
	_frame_camera(character, camera)
	for _frame in 3:
		await process_frame

	var image := _fit_portrait(viewport.get_texture().get_image())
	var output_path := ProjectSettings.globalize_path(
		"res://web/src/assets/units/pea_shooter.png"
	)
	DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	var error := image.save_png(output_path)
	if error != OK:
		push_error("Pea Shooter UI portrait failed: %s" % error_string(error))
		quit(1)
		return
	var used_rect := image.get_used_rect()
	if used_rect.size.x < 120 or used_rect.size.y < 120:
		push_error("Pea Shooter UI portrait failed: model is unexpectedly small.")
		quit(1)
		return
	print("[PEA_SHOOTER_UI] PASS path=", output_path, " used_rect=", used_rect)
	viewport.free()
	await process_frame
	quit()


func _add_lighting(stage: Node3D) -> Camera3D:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.0, 0.0, 0.0, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#dceecf")
	environment.ambient_light_energy = 0.34
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	stage.add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-40.0, -28.0, 0.0)
	key_light.light_color = Color("#fff5d8")
	key_light.light_energy = 0.68
	stage.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-20.0, 145.0, 0.0)
	fill_light.light_color = Color("#7ee87c")
	fill_light.light_energy = 0.20
	stage.add_child(fill_light)

	var camera := Camera3D.new()
	camera.fov = 32.0
	camera.current = true
	stage.add_child(camera)
	return camera


func _apply_green_material(character: Node3D) -> void:
	var material := StandardMaterial3D.new()
	material.albedo_texture = GREEN_TEXTURE
	material.roughness = 0.72
	for mesh_node in character.find_children("*", "MeshInstance3D", true, false):
		(mesh_node as MeshInstance3D).material_override = material


func _find_first(node: Node, class_name_to_find: String) -> Node:
	if node.is_class(class_name_to_find):
		return node
	for child in node.get_children():
		var found := _find_first(child, class_name_to_find)
		if found != null:
			return found
	return null


func _frame_camera(character: Node3D, camera: Camera3D) -> void:
	var bounds := AABB()
	var has_bounds := false
	for mesh_node in character.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_node as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var mesh_bounds: AABB = mesh_instance.global_transform * mesh_instance.get_aabb()
		bounds = mesh_bounds if not has_bounds else bounds.merge(mesh_bounds)
		has_bounds = true
	if not has_bounds:
		push_error("Pea Shooter UI portrait failed: model has no meshes.")
		quit(1)
		return
	var center := bounds.get_center()
	var view_direction := Vector3(0.34, 0.14, 1.0).normalized()
	var distance := maxf(bounds.size.x, bounds.size.z) * 2.05
	camera.position = center + view_direction * distance
	camera.look_at(center, Vector3.UP)


func _fit_portrait(source: Image) -> Image:
	source.convert(Image.FORMAT_RGBA8)
	var used_rect := source.get_used_rect()
	if used_rect.size.x <= 0 or used_rect.size.y <= 0:
		return source
	const PADDING: int = 18
	var crop_rect := used_rect.grow(PADDING).intersection(
		Rect2i(Vector2i.ZERO, source.get_size())
	)
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
	var output := Image.create_empty(
		OUTPUT_SIZE.x,
		OUTPUT_SIZE.y,
		false,
		Image.FORMAT_RGBA8
	)
	output.fill(Color.TRANSPARENT)
	output.blit_rect(
		cropped,
		Rect2i(Vector2i.ZERO, fitted_size),
		Vector2i(
			(OUTPUT_SIZE.x - fitted_size.x) / 2,
			(OUTPUT_SIZE.y - fitted_size.y) / 2
		)
	)
	return output
