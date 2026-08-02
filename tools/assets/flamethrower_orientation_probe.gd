extends SceneTree

const LEVELS: Array[int] = [1, 4, 6, 8, 10]
const OUTPUT_PATH := "res://artifacts/flamethrower-asset-audit/flamethrower_orientation_probe.png"


func _initialize() -> void:
	root.size = Vector2i(1800, 980)
	_build_stage()
	for _frame: int in range(8):
		await process_frame
	RenderingServer.force_draw(false)
	var image: Image = root.get_texture().get_image()
	var error: Error = image.save_png(ProjectSettings.globalize_path(OUTPUT_PATH))
	if error != OK:
		push_error("Could not save Flamethrower orientation evidence: %s" % error_string(error))
		quit(1)
		return
	print("FLAMETHROWER_ORIENTATION_PROBE_PASS output=%s" % OUTPUT_PATH)
	quit(0)


func _build_stage() -> void:
	var world := Node3D.new()
	root.add_child(world)
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("202a33")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("edf5ff")
	environment.ambient_light_energy = 0.7
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment_node.environment = environment
	world.add_child(environment_node)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	key_light.light_color = Color("ffe0b4")
	key_light.light_energy = 1.0
	key_light.shadow_enabled = true
	world.add_child(key_light)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.42
	camera.look_at_from_position(Vector3(0.0, 2.75, 4.4), Vector3(0.0, 0.055, 0.0), Vector3.UP)
	world.add_child(camera)
	camera.current = true

	var title := Label.new()
	title.text = "FLAMETHROWER VISUAL AXIS AUDIT  |  main-camera side (+Z)"
	title.position = Vector2(26.0, 18.0)
	title.add_theme_font_size_override("font_size", 28)
	title.add_theme_color_override("font_color", Color("f7ead2"))
	root.add_child(title)
	var legend := Label.new()
	legend.text = "LEFT: production wrapper (authored -Z nozzle preserved)    RIGHT: deliberately reversed 180-degree regression reference\nCYAN sphere = production MuzzleSocket    ORANGE = gameplay/emission -Z    MAGENTA = opposite +Z"
	legend.position = Vector2(26.0, 58.0)
	legend.add_theme_font_size_override("font_size", 18)
	legend.add_theme_color_override("font_color", Color("d8e5ec"))
	root.add_child(legend)

	for index: int in range(LEVELS.size()):
		var level: int = LEVELS[index]
		var x := (float(index) - 2.0) * 0.58
		_add_comparison(world, level, Vector3(x, 0.0, 0.22))


func _add_comparison(world: Node3D, level: int, base_position: Vector3) -> void:
	var tag := "%02d" % level
	var wrapper_path := "res://Model/Flamethrower/level_%s/FlamethrowerL%s.tscn" % [tag, tag]
	var packed := load(wrapper_path) as PackedScene
	if packed == null:
		push_error("Missing wrapper: %s" % wrapper_path)
		return
	var production := packed.instantiate() as Node3D
	production.position = base_position + Vector3(-0.135, 0.0, 0.0)
	world.add_child(production)
	_add_axis_markers(production, true)

	var reversed_reference := packed.instantiate() as Node3D
	reversed_reference.position = base_position + Vector3(0.135, 0.0, -0.47)
	var source_model := reversed_reference.get_node("SourceModel") as Node3D
	source_model.rotation = Vector3(0.0, PI, 0.0)
	world.add_child(reversed_reference)
	_add_axis_markers(reversed_reference, false)

	var label := Label3D.new()
	label.text = "L%s" % tag
	label.position = base_position + Vector3(0.0, 0.30, -0.22)
	label.font_size = 42
	label.pixel_size = 0.0015
	label.outline_size = 8
	label.modulate = Color("ffe3a5")
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	label.no_depth_test = true
	world.add_child(label)


func _add_axis_markers(wrapper: Node3D, include_socket: bool) -> void:
	var orange := _make_axis(Color("ff7b2e"))
	orange.position = Vector3(0.0, 0.185, -0.165)
	wrapper.add_child(orange)
	var magenta := _make_axis(Color("f05bff"))
	magenta.position = Vector3(0.0, 0.185, 0.165)
	wrapper.add_child(magenta)
	if not include_socket:
		return
	var socket := wrapper.get_node("MuzzleSocket") as Marker3D
	var marker := MeshInstance3D.new()
	var sphere := SphereMesh.new()
	sphere.radius = 0.013
	sphere.height = 0.026
	sphere.radial_segments = 16
	sphere.rings = 8
	marker.mesh = sphere
	marker.position = socket.position + Vector3(0.0, 0.04, 0.0)
	marker.material_override = _material(Color("45f4ff"))
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	wrapper.add_child(marker)


func _make_axis(color: Color) -> MeshInstance3D:
	var marker := MeshInstance3D.new()
	var box := BoxMesh.new()
	box.size = Vector3(0.012, 0.012, 0.22)
	marker.mesh = box
	marker.material_override = _material(color)
	marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return marker


func _material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.no_depth_test = true
	material.albedo_color = color
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = 3.0
	return material
