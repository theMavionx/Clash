extends SceneTree

const MODEL_PATH := "res://Model/Flamethrower/level_04/flamethrower_l04.glb"
const MATERIAL_PATH := "res://Model/Flamethrower/level_04/flamethrower_l04_material.tres"
const BASE_COLOR_PATH := "res://Model/Flamethrower/level_04/flamethrower_l04_base_color.png"
const METALLIC_PATH := "res://Model/Flamethrower/level_04/flamethrower_l04_metallic.png"
const ROUGHNESS_PATH := "res://Model/Flamethrower/level_04/flamethrower_l04_roughness.png"


func _initialize() -> void:
	var packed := load(MODEL_PATH) as PackedScene
	assert(packed != null, "L4 GLB must import as a PackedScene")
	var model := packed.instantiate()
	assert(model != null, "L4 GLB must instantiate")

	var meshes: Array[MeshInstance3D] = []
	_collect_meshes(model, meshes)
	assert(meshes.size() == 1, "L4 must retain its audited one-mesh contract")
	assert(meshes[0].mesh != null, "L4 mesh resource must exist")

	var material := load(MATERIAL_PATH) as StandardMaterial3D
	assert(material != null, "L4 fixed material must load")
	assert(material.albedo_texture != null, "L4 Base Color must be connected")
	assert(material.metallic_texture != null, "L4 toned Metallic map must be connected")
	assert(material.roughness_texture != null, "L4 Roughness must be connected")

	for texture_path in [BASE_COLOR_PATH, METALLIC_PATH, ROUGHNESS_PATH]:
		var texture := load(texture_path) as Texture2D
		assert(texture != null, "%s must import as Texture2D" % texture_path)
		assert(texture.get_width() == 512 and texture.get_height() == 512, "%s must remain 512x512" % texture_path)

	var metallic_image := (load(METALLIC_PATH) as Texture2D).get_image()
	assert(metallic_image != null and not metallic_image.is_empty(), "L4 Metallic image must be readable")
	if metallic_image.is_compressed():
		assert(metallic_image.decompress() == OK, "L4 Metallic image must decompress for validation")
	var maximum_metallic := 0.0
	for y in range(0, metallic_image.get_height(), 16):
		for x in range(0, metallic_image.get_width(), 16):
			maximum_metallic = maxf(maximum_metallic, metallic_image.get_pixel(x, y).r)
	assert(maximum_metallic <= 0.185, "L4 Metallic mask samples must stay toned to 18%%")

	meshes[0].material_override = material
	print("FLAMETHROWER_L04_MATERIAL_PASS meshes=%d triangles=%d metallic_max=%.4f root=%s mesh=%s" % [
		meshes.size(),
		_mesh_triangle_count(meshes[0].mesh),
		maximum_metallic,
		model.name,
		meshes[0].name,
	])
	model.free()
	quit(0)


func _collect_meshes(node: Node, output: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		output.append(node as MeshInstance3D)
	for child in node.get_children():
		_collect_meshes(child, output)


func _mesh_triangle_count(mesh: Mesh) -> int:
	var triangles := 0
	for surface_index in range(mesh.get_surface_count()):
		var arrays := mesh.surface_get_arrays(surface_index)
		if arrays.is_empty():
			continue
		var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		if not indices.is_empty():
			triangles += indices.size() / 3
		else:
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			triangles += vertices.size() / 3
	return triangles
