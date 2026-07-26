extends SceneTree

const TROOP_MODELS: Dictionary = {
	"Knight": "res://Model/Characters/pirate_knight/pirate_knight.tscn",
	"Mage": "res://Model/Characters/pirate_mage/pirate_mage.tscn",
	"Archer": "res://Model/Characters/pirate_archer/pirate_archer.tscn",
	"PeaShooter": "res://Model/Characters/PeaShooter/PeaShooter.fbx",
	"Mimic": "res://Model/Characters/MimicBarrel/MimicBarrel.fbx",
	"Necromancer": "res://Model/Characters/Necromancer/Necromancer.fbx",
	"NecromancerSkeleton": "res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb",
	"Horror": "res://Model/Characters/HorrorEvolution/horror.fbx",
	"MechanicalDragon": "res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx",
	"IceGolem": "res://Model/Characters/IceGolem/IceGolem.fbx",
	"WindMage": "res://Model/Characters/WindMage/WindMage.fbx",
	"Windling": "res://Model/Characters/Windling/Windling.fbx",
	"DemonKing": "res://Model/Characters/Model/DemonKing_Body.fbx",
	"FireDragon": "res://Model/Characters/FireDragon/FireDragon.tscn",
}


func _init() -> void:
	for troop_name: String in TROOP_MODELS:
		await _audit_troop(troop_name, str(TROOP_MODELS[troop_name]))
	quit()


func _audit_troop(troop_name: String, scene_path: String) -> void:
	var resource := load(scene_path) as PackedScene
	if resource == null:
		push_error("[TROOP_ASSET_AUDIT] missing troop=%s path=%s" % [troop_name, scene_path])
		return
	var instance := resource.instantiate()
	root.add_child(instance)
	await process_frame
	await process_frame

	var mesh_count := 0
	var visible_mesh_count := 0
	var surface_count := 0
	var visible_surface_count := 0
	var visible_vertex_count := 0
	var skinned_mesh_count := 0
	var skeleton_count := 0
	var animation_player_count := 0
	var bone_count := 0
	var descendants := _descendants_including_root(instance)
	for node in descendants:
		if troop_name == "Archer":
			print(
				"[TROOP_ASSET_TREE] troop=Archer path=%s type=%s visible=%s"
				% [
					instance.get_path_to(node),
					node.get_class(),
					str(node.is_visible_in_tree()) if node is Node3D else "n/a",
				]
			)
			if node is AnimationPlayer:
				var player := node as AnimationPlayer
				for animation_name in player.get_animation_list():
					var animation := player.get_animation(animation_name)
					for track_index in range(animation.get_track_count()):
						print(
							"[TROOP_ANIMATION_TRACK] path=%s animation=%s track=%s type=%s"
							% [
								instance.get_path_to(player),
								animation_name,
								animation.track_get_path(track_index),
								animation.track_get_type(track_index),
							]
						)
		if node is MeshInstance3D:
			var mesh_instance := node as MeshInstance3D
			mesh_count += 1
			if mesh_instance.skin != null:
				skinned_mesh_count += 1
			if mesh_instance.mesh != null:
				var surfaces := mesh_instance.mesh.get_surface_count()
				surface_count += surfaces
				if mesh_instance.is_visible_in_tree():
					visible_mesh_count += 1
					visible_surface_count += surfaces
					if (
						troop_name == "Mage"
						or troop_name == "Archer"
						or troop_name == "NecromancerSkeleton"
					):
						print(
							(
								"[TROOP_ASSET_AUDIT] troop=%s visible_path=%s "
								+ "vertices=%d skin_binds=%d"
							)
							% [
								troop_name,
								instance.get_path_to(mesh_instance),
								_surface_vertex_count(mesh_instance.mesh),
								mesh_instance.skin.get_bind_count()
								if mesh_instance.skin != null
								else 0,
							]
						)
					for surface_index in range(surfaces):
						var arrays := mesh_instance.mesh.surface_get_arrays(surface_index)
						var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
						visible_vertex_count += vertices.size()
		elif node is Skeleton3D:
			skeleton_count += 1
			bone_count += (node as Skeleton3D).get_bone_count()
		elif node is AnimationPlayer:
			animation_player_count += 1

	var message := (
		(
			"[TROOP_ASSET_AUDIT] troop=%s meshes=%d visible_meshes=%d surfaces=%d "
			+ "visible_surfaces=%d visible_vertices=%d skinned_meshes=%d "
			+ "skeletons=%d bones=%d animation_players=%d nodes=%d"
		)
		% [
			troop_name,
			mesh_count,
			visible_mesh_count,
			surface_count,
			visible_surface_count,
			visible_vertex_count,
			skinned_mesh_count,
			skeleton_count,
			bone_count,
			animation_player_count,
			descendants.size(),
		]
	)
	print(message)
	instance.queue_free()
	await process_frame


func _surface_vertex_count(mesh: Mesh) -> int:
	var count := 0
	for surface_index in range(mesh.get_surface_count()):
		var arrays := mesh.surface_get_arrays(surface_index)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		count += vertices.size()
	return count


func _descendants_including_root(node: Node) -> Array[Node]:
	var nodes: Array[Node] = [node]
	var cursor := 0
	while cursor < nodes.size():
		var current := nodes[cursor]
		cursor += 1
		for child in current.get_children():
			nodes.append(child)
	return nodes
