extends SceneTree

const STANDARD_FLAG: Texture2D = preload(
	"res://Model/Town_Hall/Town Hall Level 1_FlagTexture2.png"
)


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var building_system := BuildingSystem.new()
	var custom_image := Image.create(8, 8, false, Image.FORMAT_RGBA8)
	custom_image.fill(Color(0.1, 0.7, 0.3, 1.0))
	var custom_flag := ImageTexture.create_from_image(custom_image)

	var synthetic_root := Node3D.new()
	var synthetic_flag := MeshInstance3D.new()
	synthetic_flag.name = "FlagImage"
	var synthetic_mesh := QuadMesh.new()
	var source_material := StandardMaterial3D.new()
	source_material.resource_name = "FlagImage"
	synthetic_mesh.material = source_material
	synthetic_flag.mesh = synthetic_mesh
	synthetic_root.add_child(synthetic_flag)

	building_system._apply_town_hall_flag_url(synthetic_root, "")
	_assert_flag_texture(synthetic_flag, STANDARD_FLAG, "initial standard")
	building_system._apply_town_hall_flag_material_recursive(synthetic_root, custom_flag)
	_assert_flag_texture(synthetic_flag, custom_flag, "custom")
	building_system._apply_town_hall_flag_url(synthetic_root, "")
	_assert_flag_texture(synthetic_flag, STANDARD_FLAG, "restored standard")
	synthetic_flag.set_surface_override_material(0, null)
	synthetic_root.free()

	for level in range(1, 8):
		var scene_path := "res://Model/Town_Hall/Town Hall Level %d.glb" % level
		var packed := load(scene_path) as PackedScene
		if packed == null:
			_fail("Town Hall level %d scene is missing" % level)
			return
		var model := packed.instantiate()
		if _flag_surface_count(building_system, model) <= 0:
			model.free()
			_fail("Town Hall level %d has no detectable flag surface" % level)
			return
		model.free()

	building_system.free()
	print("[TOWN_HALL_FLAG_FALLBACK] PASS levels=1-7 detectable=true custom_to_standard=true")
	call_deferred("_finish")


func _assert_flag_texture(mesh_instance: MeshInstance3D, expected: Texture2D, stage: String) -> void:
	var material := mesh_instance.get_surface_override_material(0) as StandardMaterial3D
	if material == null or material.albedo_texture != expected:
		_fail("%s flag texture mismatch" % stage)


func _flag_surface_count(building_system: BuildingSystem, node: Node) -> int:
	var count := 0
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var mesh := mesh_instance.mesh
		if mesh != null:
			for surface_idx in mesh.get_surface_count():
				if building_system._is_town_hall_flag_surface(mesh_instance, surface_idx):
					count += 1
	for child in node.get_children():
		count += _flag_surface_count(building_system, child)
	return count


func _fail(message: String) -> void:
	push_error("[TOWN_HALL_FLAG_FALLBACK] FAIL %s" % message)
	quit(1)


func _finish() -> void:
	await process_frame
	quit(0)
