extends SceneTree
## Renders the production level-1 Flamethrower wrapper as a transparent UI icon.
##
## The camera deliberately stays in the gameplay-forward (-Z) hemisphere so the
## visible nozzle, MuzzleSocket, and server-authoritative firing direction agree.

const VISUAL: PackedScene = preload(
	"res://Model/Flamethrower/level_01/FlamethrowerL01.tscn"
)
const OUTPUT_PATHS: PackedStringArray = [
	"res://web/src/assets/buildings/flamethrower.png",
	"res://Model/Flamethrower/flamethrower_thumbnail.png",
]
const ICON_SIZE := Vector2i(512, 512)
const GAMEPLAY_FORWARD := Vector3.FORWARD
const VIEW_DIRECTION := Vector3(1.12, 0.78, -1.42)
const FRAME_PADDING := 1.16


func _initialize() -> void:
	_render.call_deferred()


func _render() -> void:
	root.size = ICON_SIZE
	root.transparent_bg = true
	root.msaa_3d = Viewport.MSAA_4X

	var stage := Node3D.new()
	stage.name = "FlamethrowerUIIconWorld"
	root.add_child(stage)
	current_scene = stage
	_add_environment(stage)
	_add_lights(stage)

	var visual := VISUAL.instantiate() as Node3D
	visual.name = "FlamethrowerLevel01UIIcon"
	stage.add_child(visual)
	await process_frame
	await process_frame

	var bounds := _combined_global_aabb(visual)
	if bounds.size == Vector3.ZERO:
		_fail("production visual has no visible mesh bounds")
		return
	if not _validate_forward_contract(visual, bounds):
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
		"FLAMETHROWER_THUMBNAIL_PASS path=%s size=%dx%d forward=-Z alpha=%s"
		% [OUTPUT_PATHS[0], image.get_width(), image.get_height(), str(image.detect_alpha())]
	)
	quit(0)


func _add_environment(stage: Node3D) -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.0, 0.0, 0.0, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("e7edf0")
	environment.ambient_light_energy = 1.62
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	environment_node.environment = environment
	stage.add_child(environment_node)


func _add_lights(stage: Node3D) -> void:
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-49.0, -31.0, 0.0)
	key_light.light_color = Color("ffd6a1")
	key_light.light_energy = 2.20
	key_light.shadow_enabled = false
	stage.add_child(key_light)
	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-24.0, 142.0, 0.0)
	fill_light.light_color = Color("76c5ff")
	fill_light.light_energy = 1.08
	fill_light.shadow_enabled = false
	stage.add_child(fill_light)
	var rim_light := DirectionalLight3D.new()
	rim_light.rotation_degrees = Vector3(-18.0, 224.0, 0.0)
	rim_light.light_color = Color("ff944f")
	rim_light.light_energy = 0.62
	rim_light.shadow_enabled = false
	stage.add_child(rim_light)


func _validate_forward_contract(visual: Node3D, bounds: AABB) -> bool:
	var declared_forward: Variant = visual.get_meta("gameplay_forward", null)
	if declared_forward != GAMEPLAY_FORWARD:
		_fail("gameplay_forward is not local -Z")
		return false
	var source_model := visual.get_node_or_null("SourceModel") as Node3D
	var muzzle := visual.get_node_or_null("MuzzleSocket") as Marker3D
	if source_model == null or muzzle == null:
		_fail("SourceModel or MuzzleSocket is missing")
		return false
	var art_forward := (source_model.transform.basis * Vector3.FORWARD).normalized()
	if not art_forward.is_equal_approx(GAMEPLAY_FORWARD):
		_fail("visible model is reversed relative to gameplay -Z")
		return false
	if not muzzle.transform.basis.is_equal_approx(Basis.IDENTITY):
		_fail("MuzzleSocket basis is not aligned with wrapper -Z")
		return false
	if muzzle.position.z >= bounds.get_center().z:
		_fail("MuzzleSocket is not on the visible -Z front of the model")
		return false
	if VIEW_DIRECTION.normalized().dot(GAMEPLAY_FORWARD) <= 0.55:
		_fail("UI camera is not in the gameplay-forward hemisphere")
		return false
	return true


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
	push_error("Flamethrower UI icon: " + message)
	quit(1)
