extends SceneTree

const PROJECTILE_SCENE: PackedScene = preload(
	"res://Model/Mortar/mortar_lvl2_projectile.fbx"
)


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var projectile := PROJECTILE_SCENE.instantiate() as Node3D
	root.add_child(projectile)
	await process_frame
	for raw_mesh in projectile.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null:
			continue
		var relative_transform := (
			projectile.global_transform.affine_inverse()
			* mesh_instance.global_transform
		)
		var projectile_aabb := relative_transform * mesh_instance.mesh.get_aabb()
		print(
			"[MORTAR_PROJECTILE_GEOMETRY] path=",
			projectile.get_path_to(mesh_instance),
			" skin=",
			mesh_instance.skin != null,
			" scale=",
			relative_transform.basis.get_scale(),
			" aabb=",
			projectile_aabb,
			" max_extent=",
			maxf(
				projectile_aabb.size.x,
				maxf(projectile_aabb.size.y, projectile_aabb.size.z)
			)
		)
	projectile.queue_free()
	await process_frame
	quit()
