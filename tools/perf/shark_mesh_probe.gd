extends SceneTree

const SHARK_SCENE := preload("res://Model/Shark/Shark.glb")


func _initialize() -> void:
	var root := SHARK_SCENE.instantiate()
	get_root().add_child(root)
	var rows: Array[Dictionary] = []
	for raw_mesh in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var surfaces: Array[Dictionary] = []
		for surface_index in mesh_instance.mesh.get_surface_count():
			var arrays := mesh_instance.mesh.surface_get_arrays(surface_index)
			var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
			var material := mesh_instance.get_active_material(surface_index)
			surfaces.append({
				"surface": surface_index,
				"vertices": vertices.size(),
				"indices": indices.size(),
				"material": (
					material.resource_name
					if material != null
					else ""
				),
				"material_class": (
					material.get_class()
					if material != null
					else ""
				),
			})
		rows.append({
			"name": str(mesh_instance.name),
			"surfaces": surfaces,
			"skin_binds": (
				mesh_instance.skin.get_bind_count()
				if mesh_instance.skin != null
				else 0
			),
			"skeleton": str(mesh_instance.skeleton),
		})
	var parts: Array[MeshInstance3D] = []
	for raw_mesh in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if mesh_instance != null and mesh_instance.skin != null:
			parts.append(mesh_instance)
	var bake_result: ArrayMesh = null
	var same_material := false
	var skeleton_found := false
	if parts.size() == 2:
		var skeleton := parts[0].get_node_or_null(
			parts[0].skeleton
		) as Skeleton3D
		skeleton_found = skeleton != null
		var material_a := parts[0].get_active_material(0)
		var material_b := parts[1].get_active_material(0)
		same_material = material_a == material_b
		if skeleton != null:
			bake_result = SkinnedMeshCombiner.bake_skinned_parts(
				skeleton,
				parts,
				material_a,
				"ProbeCombinedShark"
			)
	print("[SHARK_MESH_PROBE] ", JSON.stringify({
		"meshes": rows,
		"same_material": same_material,
		"skeleton_found": skeleton_found,
		"bake_success": bake_result != null,
		"baked_surfaces": (
			bake_result.get_surface_count()
			if bake_result != null
			else 0
		),
	}))
	quit()
