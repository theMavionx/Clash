extends SceneTree

const BATCH_DIR := "res://generated/performance"


func _initialize() -> void:
	for file_name in DirAccess.get_files_at(BATCH_DIR):
		if not file_name.ends_with("_static_batch.res"):
			continue
		var mesh := load("%s/%s" % [BATCH_DIR, file_name]) as ArrayMesh
		if mesh == null:
			continue
		var material_groups: Dictionary = {}
		var vertex_count := 0
		for surface_index in range(mesh.get_surface_count()):
			var arrays := mesh.surface_get_arrays(surface_index)
			var vertices := arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array
			vertex_count += vertices.size() if vertices != null else 0
			var material := mesh.surface_get_material(surface_index)
			var signature := _material_signature(material)
			material_groups[signature] = int(material_groups.get(signature, 0)) + 1
			print(
				"[STATIC_MATERIAL] file=%s surface=%d signature=%s"
				% [file_name, surface_index, signature]
			)
		print(
			"[STATIC_BATCH_AUDIT] file=%s surfaces=%d merge_groups=%d vertices=%d"
			% [file_name, mesh.get_surface_count(), material_groups.size(), vertex_count]
		)
	quit()


func _material_signature(material: Material) -> String:
	if material == null:
		return "none"
	if not material is BaseMaterial3D:
		return "%s:%s" % [material.get_class(), material.resource_path]
	var base := material as BaseMaterial3D
	return (
		"class=%s albedo_tex=%s normal_tex=%s emission_tex=%s emission_enabled=%s "
		+ "metallic=%.3f roughness=%.3f transparency=%d shading=%d cull=%d"
	) % [
		base.get_class(),
		base.albedo_texture.resource_path if base.albedo_texture != null else "",
		base.normal_texture.resource_path if base.normal_texture != null else "",
		base.emission_texture.resource_path if base.emission_texture != null else "",
		base.emission_enabled,
		base.metallic,
		base.roughness,
		base.transparency,
		base.shading_mode,
		base.cull_mode,
	]
