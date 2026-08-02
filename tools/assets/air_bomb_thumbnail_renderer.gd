extends SceneTree
## Renders the production Air Bomb building as a transparent UI icon.
##
## Its camera follows the authored balloon flag projection axis so the owner
## emblem is readable in the shop instead of being presented edge-on.

const VISUAL: PackedScene = preload("res://Model/air_bomb/air_bomb.tscn")
const FLAG_TEXTURE_PATH := "res://Model/Town_Hall/Town Hall Level 1_FlagTexture2.png"
const OUTPUT_PATHS: PackedStringArray = [
	"res://web/src/assets/buildings/air_bomb.png",
	"res://Model/air_bomb/air_bomb_thumbnail.png",
]
const ICON_SIZE := Vector2i(512, 512)
const VIEW_DIRECTION := Vector3(1.575, 0.756, 0.665)
const FRAME_PADDING := 1.14


func _initialize() -> void:
	_render.call_deferred()


func _render() -> void:
	root.size = ICON_SIZE
	root.transparent_bg = true
	root.msaa_3d = Viewport.MSAA_4X

	var stage := Node3D.new()
	stage.name = "AirBombUIIconWorld"
	root.add_child(stage)
	current_scene = stage
	_add_environment(stage)
	_add_lights(stage)

	var visual := VISUAL.instantiate() as Node3D
	visual.name = "AirBombUIIcon"
	stage.add_child(visual)
	await process_frame
	await process_frame
	var flag_texture := _load_source_texture(FLAG_TEXTURE_PATH)
	if flag_texture == null:
		_fail("failed to load the current default flag source")
		return
	visual.call("apply_player_flag_texture", flag_texture)
	await process_frame

	var bounds := _combined_global_aabb(visual)
	if bounds.size == Vector3.ZERO:
		_fail("production visual has no visible mesh bounds")
		return
	var target := bounds.get_center()
	var view_direction := VIEW_DIRECTION.normalized()
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.position = target + view_direction * 10.0
	stage.add_child(camera)
	camera.look_at(target, Vector3.UP)
	camera.size = _orthographic_size(bounds, view_direction)
	camera.current = true

	for _frame: int in range(5):
		await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if image == null or image.is_empty():
		_fail("viewport capture returned an empty image; use the native renderer")
		return
	image.convert(Image.FORMAT_RGBA8)
	for output_path: String in OUTPUT_PATHS:
		var save_error := image.save_png(ProjectSettings.globalize_path(output_path))
		if save_error != OK:
			_fail("failed to save %s: %s" % [output_path, error_string(save_error)])
			return
	print(
		"AIR_BOMB_THUMBNAIL_PASS path=%s size=%dx%d alpha=%s"
		% [OUTPUT_PATHS[0], image.get_width(), image.get_height(), str(image.detect_alpha())]
	)
	quit(0)


func _load_source_texture(resource_path: String) -> Texture2D:
	# Thumbnail generation must use the current source PNG instead of a possibly
	# stale editor import cache. This keeps the UI portrait synchronized with a
	# newly replaced default flag before the next full export/reimport.
	var image := Image.new()
	var load_error := image.load(ProjectSettings.globalize_path(resource_path))
	if load_error != OK or image.is_empty():
		return null
	return ImageTexture.create_from_image(image)


func _add_environment(stage: Node3D) -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.0, 0.0, 0.0, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("d9e6ea")
	environment.ambient_light_energy = 0.68
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment_node.environment = environment
	stage.add_child(environment_node)


func _add_lights(stage: Node3D) -> void:
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -36.0, 0.0)
	key_light.light_color = Color("ffdbb0")
	key_light.light_energy = 1.15
	key_light.shadow_enabled = false
	stage.add_child(key_light)
	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-24.0, 142.0, 0.0)
	fill_light.light_color = Color("83bdff")
	fill_light.light_energy = 0.48
	fill_light.shadow_enabled = false
	stage.add_child(fill_light)


func _combined_global_aabb(root_node: Node3D) -> AABB:
	var result := AABB()
	var has_bounds := false
	for child in root_node.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null or not mesh_instance.visible:
			continue
		var global_aabb := mesh_instance.global_transform * mesh_instance.get_aabb()
		result = global_aabb if not has_bounds else result.merge(global_aabb)
		has_bounds = true
	return result


func _orthographic_size(bounds: AABB, view_direction: Vector3) -> float:
	var camera_forward := -view_direction.normalized()
	var camera_right := camera_forward.cross(Vector3.UP).normalized()
	var camera_up := camera_right.cross(camera_forward).normalized()
	var min_projection := Vector2(INF, INF)
	var max_projection := Vector2(-INF, -INF)
	for x_index: int in range(2):
		for y_index: int in range(2):
			for z_index: int in range(2):
				var corner := bounds.position + Vector3(
					bounds.size.x * x_index,
					bounds.size.y * y_index,
					bounds.size.z * z_index,
				)
				var projected := Vector2(corner.dot(camera_right), corner.dot(camera_up))
				min_projection = min_projection.min(projected)
				max_projection = max_projection.max(projected)
	var projected_size := max_projection - min_projection
	return maxf(projected_size.x, projected_size.y) * FRAME_PADDING


func _fail(message: String) -> void:
	push_error("Air Bomb UI icon: " + message)
	quit(1)
