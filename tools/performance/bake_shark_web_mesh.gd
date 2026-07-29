extends SceneTree

const SHARK_SCENE := preload("res://Model/Shark/Shark.glb")
const OUTPUT_PATH := "res://generated/performance/shark_combined_web.res"

var _root: Node3D = null


func _initialize() -> void:
	call_deferred("_bake")


func _bake() -> void:
	_root = SHARK_SCENE.instantiate() as Node3D
	if _root == null:
		push_error("Shark web mesh bake failed: scene did not instantiate.")
		quit(1)
		return
	get_root().add_child(_root)
	await process_frame

	var parts: Array[MeshInstance3D] = []
	for raw_mesh in _root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if (
			mesh_instance != null
			and mesh_instance.mesh != null
			and mesh_instance.skin != null
		):
			parts.append(mesh_instance)
	if parts.size() != 2:
		push_error(
			"Shark web mesh bake failed: expected 2 skinned parts, got %d."
			% parts.size()
		)
		quit(1)
		return
	var skeleton := parts[0].get_node_or_null(
		parts[0].skeleton
	) as Skeleton3D
	var material := parts[0].get_active_material(0)
	if skeleton == null or material == null:
		push_error("Shark web mesh bake failed: skeleton or material is missing.")
		quit(1)
		return
	var combined := SkinnedMeshCombiner.bake_skinned_parts(
		skeleton,
		parts,
		material,
		"CombinedWebShark"
	)
	if combined == null:
		push_error("Shark web mesh bake failed: mesh combiner rejected input.")
		quit(1)
		return
	var error := ResourceSaver.save(combined, OUTPUT_PATH)
	if error != OK:
		push_error(
			"Shark web mesh bake failed: %s"
			% error_string(error)
		)
		quit(1)
		return
	print(
		"[SHARK_WEB_MESH_BAKE] PASS path=",
		OUTPUT_PATH,
		" surfaces=",
		combined.get_surface_count()
	)
	quit()
