@tool
extends EditorScenePostImport

const MATERIAL_TEXTURES := {
	"res://Model/Dragon/Fire Dragon.FBX": "res://Model/Dragon/Fire Dragon-Red.tga",
	"res://Model/Witch/Succubus.FBX": "res://Model/Witch/Textures/Succubus-Purple.tga",
	"res://Model/Characters/Model/Beholder.fbx": "res://Model/Characters/Model/Beholder_albedo.png",
}


func _post_import(scene: Node) -> Object:
	var source_file := get_source_file()
	var texture_path := String(MATERIAL_TEXTURES.get(source_file, ""))
	if texture_path.is_empty():
		return scene

	var texture := load(texture_path) as Texture2D
	if texture == null:
		push_warning("Character import texture not found: %s" % texture_path)
		return scene

	var material := StandardMaterial3D.new()
	material.resource_name = "%s Material" % scene.name
	material.albedo_texture = texture
	material.roughness = 0.65

	_apply_material(scene, material)
	return scene


func _apply_material(node: Node, material: Material) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		mesh_instance.material_override = material

		if mesh_instance.mesh != null:
			for surface_index in range(mesh_instance.mesh.get_surface_count()):
				mesh_instance.set_surface_override_material(surface_index, material)

	for child: Node in node.get_children():
		_apply_material(child, material)
