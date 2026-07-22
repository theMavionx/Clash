extends SceneTree

const SHARK_SCENE := preload("res://Model/Shark/Shark.glb")
const OUTPUT_PATH := "res://web/src/assets/buildings/sharktrap.png"


func _initialize() -> void:
	call_deferred("_capture")


func _capture() -> void:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(512, 512)
	viewport.transparent_bg = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	get_root().add_child(viewport)

	var world_root := Node3D.new()
	viewport.add_child(world_root)

	var puddle := MeshInstance3D.new()
	var puddle_mesh := CylinderMesh.new()
	puddle_mesh.top_radius = 0.9
	puddle_mesh.bottom_radius = 0.9
	puddle_mesh.height = 0.06
	puddle_mesh.radial_segments = 48
	puddle.mesh = puddle_mesh
	var puddle_material := StandardMaterial3D.new()
	puddle_material.albedo_color = Color(0.025, 0.43, 0.72, 0.86)
	puddle_material.metallic = 0.05
	puddle_material.roughness = 0.22
	puddle_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	puddle.material_override = puddle_material
	world_root.add_child(puddle)

	var shark := SHARK_SCENE.instantiate() as Node3D
	if shark == null:
		push_error("[SHARK_THUMBNAIL] failed to instantiate model")
		quit(1)
		return
	world_root.add_child(shark)
	shark.scale = Vector3.ONE * 0.31
	shark.position = Vector3(0.0, 0.04, 0.02)
	shark.rotation_degrees = Vector3(-8.0, 112.0, -5.0)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	light.light_energy = 1.35
	light.shadow_enabled = true
	world_root.add_child(light)

	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(35.0, 145.0, 0.0)
	fill.light_color = Color(0.42, 0.66, 1.0)
	fill.light_energy = 0.55
	fill.shadow_enabled = false
	world_root.add_child(fill)

	var environment := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.0, 0.0, 0.0, 0.0)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.62, 0.72, 0.88)
	env.ambient_light_energy = 0.7
	environment.environment = env
	world_root.add_child(environment)

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 3.25
	camera.position = Vector3(3.1, 2.55, 4.0)
	camera.look_at_from_position(camera.position, Vector3(0.0, 0.18, 0.0), Vector3.UP)
	world_root.add_child(camera)
	camera.current = true

	await process_frame
	await process_frame
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	var err := image.save_png(OUTPUT_PATH)
	if err != OK:
		push_error("[SHARK_THUMBNAIL] save failed: %s" % error_string(err))
		quit(1)
		return
	print("[SHARK_THUMBNAIL] saved=", OUTPUT_PATH)
	quit()
