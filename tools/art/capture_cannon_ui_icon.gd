extends SceneTree
## Renders the authored level-1 Cannon into the React building asset folder.
##
## Run with the native renderer (not --headless):
## Godot --path . --script res://tools/art/capture_cannon_ui_icon.gd

const CANNON_SCENE := preload(
	"res://Model/cannons/level_01/cannon_level_01.tscn"
)
const OUTPUT_PATH := "res://web/src/assets/buildings/cannon.png"
const ICON_SIZE := Vector2i(512, 512)


func _init() -> void:
	call_deferred("_capture")


func _capture() -> void:
	root.size = ICON_SIZE
	root.transparent_bg = true
	root.msaa_3d = Viewport.MSAA_4X

	var world := Node3D.new()
	world.name = "CannonUIIconWorld"
	root.add_child(world)
	current_scene = world

	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color(0.0, 0.0, 0.0, 0.0)
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color(0.72, 0.76, 0.82, 1.0)
	environment.ambient_light_energy = 0.78
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment_node.environment = environment
	world.add_child(environment_node)

	var cannon := CANNON_SCENE.instantiate() as Node3D
	cannon.name = "CannonLevel01UIIcon"
	world.add_child(cannon)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	key_light.light_color = Color(1.0, 0.91, 0.76, 1.0)
	key_light.light_energy = 1.35
	key_light.shadow_enabled = false
	world.add_child(key_light)

	var fill_light := DirectionalLight3D.new()
	fill_light.rotation_degrees = Vector3(-30.0, 148.0, 0.0)
	fill_light.light_color = Color(0.58, 0.72, 1.0, 1.0)
	fill_light.light_energy = 0.55
	fill_light.shadow_enabled = false
	world.add_child(fill_light)

	await process_frame
	await process_frame

	var bounds := _combined_global_aabb(cannon)
	if bounds.size == Vector3.ZERO:
		push_error("Cannon UI icon: authored model has no visible mesh bounds.")
		quit(1)
		return

	var target := bounds.get_center()
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = _orthographic_size(bounds)
	var view_direction := Vector3(1.15, 0.82, 1.35).normalized()
	camera.position = target + view_direction * 10.0
	world.add_child(camera)
	camera.look_at(target, Vector3.UP)
	camera.current = true

	await process_frame
	await process_frame
	await process_frame

	var texture := root.get_texture()
	if texture == null:
		push_error("Cannon UI icon: viewport texture is unavailable; use the native renderer.")
		quit(1)
		return
	var image := texture.get_image()
	if image == null or image.is_empty():
		push_error("Cannon UI icon: viewport capture returned an empty image.")
		quit(1)
		return
	image.convert(Image.FORMAT_RGBA8)
	var save_error := image.save_png(ProjectSettings.globalize_path(OUTPUT_PATH))
	if save_error != OK:
		push_error("Cannon UI icon: failed to save PNG, error %d." % save_error)
		quit(1)
		return

	print(
		"CANNON_UI_ICON_OK path=%s size=%dx%d alpha=%s"
		% [
			ProjectSettings.globalize_path(OUTPUT_PATH),
			image.get_width(),
			image.get_height(),
			str(image.detect_alpha()),
		]
	)
	world.queue_free()
	call_deferred("_finish_success")


func _finish_success() -> void:
	await process_frame
	await process_frame
	quit(0)


func _combined_global_aabb(root_node: Node3D) -> AABB:
	var result := AABB()
	var has_bounds := false
	for child in root_node.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := child as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null or not mesh_instance.visible:
			continue
		var local_aabb := mesh_instance.get_aabb()
		var global_aabb := mesh_instance.global_transform * local_aabb
		if not has_bounds:
			result = global_aabb
			has_bounds = true
		else:
			result = result.merge(global_aabb)
	return result


func _orthographic_size(bounds: AABB) -> float:
	var horizontal_span := (bounds.size.x + bounds.size.z) * 0.72
	var vertical_span := bounds.size.y + (bounds.size.x + bounds.size.z) * 0.28
	return maxf(horizontal_span, vertical_span) * 1.20
