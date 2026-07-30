extends SceneTree

const WebRenderProfile := preload("res://scripts/web_render_profile.gd")
const MageTowerScript := preload("res://scripts/tower_mage.gd")

const TOWER_SCENES: Array[String] = [
	"res://Model/MageTower/1.fbx",
	"res://Model/MageTower/2.fbx",
	"res://Model/MageTower/3.fbx",
]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	for scene_path in TOWER_SCENES:
		_probe_scene(scene_path)
	await _probe_runtime_lifecycle(TOWER_SCENES[0])
	await _render_visual_regression(TOWER_SCENES[0])
	quit()


func _probe_scene(scene_path: String) -> void:
	var packed := load(scene_path) as PackedScene
	if packed == null:
		push_error("[MAGE_TOWER_PROBE] load_failed path=%s" % scene_path)
		return
	var root := packed.instantiate() as Node3D
	if root == null:
		push_error("[MAGE_TOWER_PROBE] instantiate_failed path=%s" % scene_path)
		return
	get_root().add_child(root)
	print("[MAGE_TOWER_PROBE] before path=%s" % scene_path)
	_print_visual_tree(root, root)
	var applied := WebRenderProfile.apply_static_batch_for_web(root, scene_path)
	print("[MAGE_TOWER_PROBE] after path=%s applied=%s" % [scene_path, applied])
	_print_visual_tree(root, root)
	root.free()


func _probe_runtime_lifecycle(scene_path: String) -> void:
	var packed := load(scene_path) as PackedScene
	var scene_root := Node3D.new()
	scene_root.name = "MageTowerRuntimeProbe"
	get_root().add_child(scene_root)
	current_scene = scene_root
	var tower := Node3D.new()
	tower.name = "MageTower"
	tower.set_script(MageTowerScript)
	var model := packed.instantiate() as Node3D
	model.scale = Vector3.ONE * 0.039
	model.set_meta("building_visual_model", true)
	tower.add_child(model)
	WebRenderProfile.apply_static_batch_for_web(model, scene_path)
	scene_root.add_child(tower)
	tower.call("set_level", 1)
	for _frame in range(30):
		await process_frame
	var crystal := tower.get("_crystal") as Node3D
	print(
		"[MAGE_TOWER_RUNTIME] found=%s ready=%s raise=%.3f visible=%s tree=%s position=%s scale=%s"
		% [
			crystal != null,
			tower.get("_beam_ready"),
			float(tower.get("_raise")),
			crystal.visible if crystal != null else false,
			crystal.is_visible_in_tree() if crystal != null else false,
			crystal.global_position if crystal != null else Vector3.ZERO,
			crystal.scale if crystal != null else Vector3.ZERO,
		]
	)
	if crystal == null or not crystal.is_visible_in_tree():
		push_error("[MAGE_TOWER_RUNTIME] crystal_not_visible")
	scene_root.free()
	current_scene = null
	await process_frame


func _render_visual_regression(scene_path: String) -> void:
	if DisplayServer.get_name() == "headless":
		print("[MAGE_TOWER_SCREENSHOT] skipped=headless")
		return
	var viewport := SubViewport.new()
	viewport.size = Vector2i(900, 650)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	get_root().add_child(viewport)

	var scene_root := Node3D.new()
	scene_root.name = "MageTowerVisualRegression"
	viewport.add_child(scene_root)

	var environment := WorldEnvironment.new()
	var environment_resource := Environment.new()
	environment_resource.background_mode = Environment.BG_COLOR
	environment_resource.background_color = Color(0.34, 0.68, 0.86)
	environment_resource.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment_resource.ambient_light_color = Color(0.72, 0.78, 0.88)
	environment_resource.ambient_light_energy = 0.75
	environment.environment = environment_resource
	scene_root.add_child(environment)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-52.0, -28.0, 0.0)
	light.light_energy = 1.15
	light.shadow_enabled = true
	scene_root.add_child(light)

	var ground := MeshInstance3D.new()
	var ground_mesh := PlaneMesh.new()
	ground_mesh.size = Vector2(2.4, 2.4)
	ground.mesh = ground_mesh
	var ground_material := StandardMaterial3D.new()
	ground_material.albedo_color = Color(0.66, 0.84, 0.33)
	ground.material_override = ground_material
	scene_root.add_child(ground)

	var camera := Camera3D.new()
	camera.fov = 58.0
	camera.position = Vector3(0.82, 0.74, 1.10)
	scene_root.add_child(camera)
	camera.look_at(Vector3(0.0, 0.17, 0.0))
	camera.current = true

	var packed := load(scene_path) as PackedScene
	var model := packed.instantiate() as Node3D
	model.scale = Vector3.ONE * 0.039
	model.set_meta("building_visual_model", true)
	_apply_runtime_material(model)
	scene_root.add_child(model)
	WebRenderProfile.apply_static_batch_for_web(model, scene_path)

	for _frame in range(3):
		await process_frame
	var crystal := model.find_child("*Crystal*", true, false) as Node3D
	if crystal == null or not crystal.is_visible_in_tree():
		push_error("[MAGE_TOWER_SCREENSHOT] crystal_not_visible")
		viewport.free()
		return
	var beam_glow := _make_beam_cylinder(
		_make_beam_material(Color(0.15, 0.65, 1.0, 0.30), 2.0)
	)
	var beam_core := _make_beam_cylinder(
		_make_beam_material(Color(0.45, 0.90, 1.0, 0.95), 4.0)
	)
	var impact := _make_impact_sphere(
		_make_beam_material(Color(0.55, 0.85, 1.0, 0.85), 5.0)
	)
	scene_root.add_child(beam_glow)
	scene_root.add_child(beam_core)
	scene_root.add_child(impact)
	var target_position := Vector3(0.63, 0.09, 0.08)
	_set_cylinder_between(beam_glow, crystal.global_position, target_position, 0.025)
	_set_cylinder_between(beam_core, crystal.global_position, target_position, 0.012)
	impact.scale = Vector3.ONE * 0.065
	impact.global_position = target_position
	impact.visible = true
	await RenderingServer.frame_post_draw
	var image := viewport.get_texture().get_image()
	var screenshot_path := OS.get_temp_dir().path_join("mage_tower_visual_after.png")
	var save_error := image.save_png(screenshot_path)
	print("[MAGE_TOWER_SCREENSHOT] path=%s error=%d" % [screenshot_path, save_error])
	viewport.free()


func _apply_runtime_material(root: Node) -> void:
	var material := StandardMaterial3D.new()
	material.albedo_texture = load("res://Model/MageTower/mage_tower_albedo.png") as Texture2D
	material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
	material.emission_enabled = true
	material.emission_texture = load("res://Model/MageTower/mage_tower_emit.png") as Texture2D
	material.emission_energy_multiplier = 1.2
	for raw_mesh in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		for surface_index in range(mesh_instance.mesh.get_surface_count()):
			mesh_instance.set_surface_override_material(surface_index, material)


func _make_beam_material(color: Color, energy: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.emission_enabled = true
	material.emission = color
	material.emission_energy_multiplier = energy
	return material


func _make_beam_cylinder(material: StandardMaterial3D) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.height = 1.0
	mesh.top_radius = 1.0
	mesh.bottom_radius = 1.0
	mesh.radial_segments = 12
	mesh.rings = 1
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


func _make_impact_sphere(material: StandardMaterial3D) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = 1.0
	mesh.height = 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


func _set_cylinder_between(
	node: MeshInstance3D,
	from_position: Vector3,
	to_position: Vector3,
	radius: float
) -> void:
	var segment := to_position - from_position
	var length := segment.length()
	if length <= 0.001:
		node.visible = false
		return
	var y_axis := segment / length
	var x_axis := y_axis.cross(Vector3.UP)
	if x_axis.length_squared() < 0.0001:
		x_axis = y_axis.cross(Vector3.RIGHT)
	x_axis = x_axis.normalized()
	var z_axis := x_axis.cross(y_axis).normalized()
	node.global_transform = Transform3D(
		Basis(x_axis * radius, y_axis * length, z_axis * radius),
		from_position + segment * 0.5
	)
	node.visible = true


func _print_visual_tree(root: Node3D, current: Node) -> void:
	if current is MeshInstance3D:
		var mesh_instance := current as MeshInstance3D
		var local_transform := _transform_relative_to_ancestor(mesh_instance, root)
		var local_aabb := local_transform * mesh_instance.get_aabb()
		print(
			"[MAGE_TOWER_VISUAL] path=%s visible=%s position=%s scale=%s aabb_pos=%s aabb_size=%s surfaces=%d"
			% [
				str(root.get_path_to(mesh_instance)),
				"%s tree=%s" % [mesh_instance.visible, mesh_instance.is_visible_in_tree()],
				mesh_instance.position,
				mesh_instance.scale,
				local_aabb.position,
				local_aabb.size,
				mesh_instance.mesh.get_surface_count() if mesh_instance.mesh != null else 0,
			]
		)
	for child in current.get_children():
		_print_visual_tree(root, child)


func _transform_relative_to_ancestor(node: Node3D, ancestor: Node) -> Transform3D:
	var result := node.transform
	var current := node.get_parent()
	while current != null and current != ancestor:
		if current is Node3D:
			result = (current as Node3D).transform * result
		current = current.get_parent()
	return result
