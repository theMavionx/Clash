extends SceneTree

const KNIGHT_SCENE := preload("res://Model/Characters/pirate_knight/pirate_knight.tscn")


func _init() -> void:
	var knight := KNIGHT_SCENE.instantiate() as Node3D
	root.add_child(knight)
	await process_frame
	var skeleton := knight.get_node_or_null("Skeleton3D") as Skeleton3D
	var body := knight.get_node_or_null("Skeleton3D/Body17") as MeshInstance3D
	print(
		"[KNIGHT_INSPECT] combined_meta=", knight.get_meta("clash_combined_knight_mesh", false),
		" combined_node=", knight.get_node_or_null("Skeleton3D/CombinedKnightMesh"),
		" body_skin=", body.skin if body != null else null,
		" head_bone=", skeleton.find_bone("head") if skeleton != null else -1,
		" weapon_bone=", skeleton.find_bone("weapon_r") if skeleton != null else -1,
		" head=", skeleton.get_node_or_null("HeadAttachment/HeadPose/HeadMale/Head01_Male") if skeleton != null else null,
		" helmet=", skeleton.get_node_or_null("HeadAttachment/HeadPose/OpenHelmet/Hat14") if skeleton != null else null,
		" eye=", skeleton.get_node_or_null("HeadAttachment/HeadPose/Eye/Eye05") if skeleton != null else null,
		" mouth=", skeleton.get_node_or_null("HeadAttachment/HeadPose/Mouth/Mouth07") if skeleton != null else null,
		" sword=", skeleton.get_node_or_null("SwordAttachment/SwordPose/Sword/OHS07_Sword_R") if skeleton != null else null,
	)
	if skeleton != null and body != null and body.skin != null:
		for bind_index in range(body.skin.get_bind_count()):
			if bind_index < 5 or str(body.skin.get_bind_name(bind_index)) in ["head", "weapon_r"]:
				print(
					"[KNIGHT_INSPECT] bind index=", bind_index,
					" bone=", body.skin.get_bind_bone(bind_index),
					" bind_name=", body.skin.get_bind_name(bind_index),
					" bind_pose=", body.skin.get_bind_pose(bind_index),
					" rest=", skeleton.get_bone_global_rest(
						skeleton.find_bone(str(body.skin.get_bind_name(bind_index)))
					),
					" rest_bind=", skeleton.get_bone_global_rest(
						skeleton.find_bone(str(body.skin.get_bind_name(bind_index)))
					) * body.skin.get_bind_pose(bind_index),
				)
	_print_nodes(knight, knight)
	knight.queue_free()
	await process_frame
	quit()


func _print_nodes(node: Node, knight_root: Node3D) -> void:
	if node is Skeleton3D:
		var skeleton := node as Skeleton3D
		print("[KNIGHT_INSPECT] skeleton path=", knight_root.get_path_to(skeleton), " bones=", skeleton.get_bone_count())
	elif node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var mesh := mesh_instance.mesh
		var surface_count: int = mesh.get_surface_count() if mesh != null else 0
		var skeleton_path: NodePath = mesh_instance.skeleton
		var skin_bones: int = mesh_instance.skin.get_bind_count() if mesh_instance.skin != null else 0
		print(
			"[KNIGHT_INSPECT] mesh path=", knight_root.get_path_to(mesh_instance),
			" visible=", mesh_instance.visible,
			" surfaces=", surface_count,
			" skeleton_path=", skeleton_path,
			" skin_binds=", skin_bones,
			" global=", mesh_instance.global_transform,
		)
		if mesh_instance.visible:
			var importer := ImporterMesh.from_mesh(mesh)
			if importer != null:
				importer.generate_lods(25.0, 60.0, [])
				var lod_index_counts: Array[int] = []
				for lod_index in range(importer.get_surface_lod_count(0)):
					lod_index_counts.append(
						importer.get_surface_lod_indices(0, lod_index).size()
					)
				print(
					"[KNIGHT_INSPECT] generated_lod_indices=",
					lod_index_counts,
				)
			for surface_index in range(surface_count):
				var arrays: Array = mesh.surface_get_arrays(surface_index)
				var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var bones: Variant = arrays[Mesh.ARRAY_BONES]
				var indices: Variant = arrays[Mesh.ARRAY_INDEX]
				var normals: Variant = arrays[Mesh.ARRAY_NORMAL]
				var tangents: Variant = arrays[Mesh.ARRAY_TANGENT]
				var uvs: Variant = arrays[Mesh.ARRAY_TEX_UV]
				print(
					"[KNIGHT_INSPECT] surface=", surface_index,
					" vertices=", vertices.size(),
					" bone_entries=", bones.size() if bones != null else 0,
					" indices=", indices.size() if indices != null else 0,
					" normals=", normals.size() if normals != null else 0,
					" tangents=", tangents.size() if tangents != null else 0,
					" uvs=", uvs.size() if uvs != null else 0,
					" material=", mesh.surface_get_material(surface_index),
				)
	for child in node.get_children():
		_print_nodes(child, knight_root)
