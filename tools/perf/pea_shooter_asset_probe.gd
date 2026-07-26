extends SceneTree


const ASSETS := [
	"res://Model/Characters/PeaShooter/PeaShooter.fbx",
	"res://Model/Characters/PeaShooter/PeaProjectile.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_idle.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_move.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_hit.fbx",
	"res://Model/Characters/PeaShooter/Animations/pea_shooter_die.fbx",
]


func _initialize() -> void:
	var pea_shooter_script := load("res://scripts/pea_shooter.gd") as Script
	assert(pea_shooter_script != null)
	for asset_path in ASSETS:
		_probe_asset(asset_path)
	_probe_attack_head_motion()
	pea_shooter_script = null
	quit()


func _probe_asset(asset_path: String) -> void:
	var packed := load(asset_path) as PackedScene
	if packed == null:
		push_error("PEA_ASSET_PROBE load_failed path=%s" % asset_path)
		return
	var root := packed.instantiate()
	print("PEA_ASSET_PROBE asset=%s root=%s" % [asset_path, root.name])
	_probe_node(root, 0)
	root.free()


func _probe_node(node: Node, depth: int) -> void:
	var indent := "  ".repeat(depth)
	if node is MeshInstance3D:
		var mesh_node := node as MeshInstance3D
		var aabb := mesh_node.get_aabb()
		print(
			"%smesh name=%s position=%s size=%s surfaces=%d"
			% [
				indent,
				mesh_node.name,
				str(aabb.position),
				str(aabb.size),
				mesh_node.mesh.get_surface_count() if mesh_node.mesh != null else 0,
			]
		)
		if mesh_node.mesh != null:
			for surface_index in mesh_node.mesh.get_surface_count():
				var material := mesh_node.mesh.surface_get_material(surface_index)
				print(
					"%s  material surface=%d name=%s class=%s"
					% [
						indent,
						surface_index,
						material.resource_name if material != null else "<none>",
						material.get_class() if material != null else "<none>",
					]
				)
	elif node is Skeleton3D:
		var skeleton := node as Skeleton3D
		print("%sskeleton name=%s bones=%d" % [indent, skeleton.name, skeleton.get_bone_count()])
		for bone_index in skeleton.get_bone_count():
			var bone_name := skeleton.get_bone_name(bone_index)
			if (
				"head" in bone_name.to_lower()
				or "hand" in bone_name.to_lower()
				or "weapon" in bone_name.to_lower()
				or "mouth" in bone_name.to_lower()
			):
				print("%s  bone index=%d name=%s" % [indent, bone_index, bone_name])
	elif node is AnimationPlayer:
		var player := node as AnimationPlayer
		for library_name in player.get_animation_library_list():
			var library := player.get_animation_library(library_name)
			for animation_name in library.get_animation_list():
				var animation := library.get_animation(animation_name)
				print(
					"%sanimation player=%s library=%s name=%s length=%.4f tracks=%d"
					% [
						indent,
						player.name,
						library_name,
						animation_name,
						animation.length,
						animation.get_track_count(),
					]
				)
	for child in node.get_children():
		_probe_node(child, depth + 1)


func _probe_attack_head_motion() -> void:
	var attack_scene := load(
		"res://Model/Characters/PeaShooter/Animations/pea_shooter_attack.fbx"
	) as PackedScene
	var actor := attack_scene.instantiate()
	root.add_child(actor)
	var player := _find_first(actor, "AnimationPlayer") as AnimationPlayer
	var skeleton := _find_first(actor, "Skeleton3D") as Skeleton3D
	if player == null or skeleton == null:
		push_error("PEA_ASSET_PROBE attack motion nodes missing")
		actor.free()
		return
	var animation_names := player.get_animation_list()
	if animation_names.is_empty():
		push_error("PEA_ASSET_PROBE attack animation missing")
		actor.free()
		return
	var animation_name := animation_names[0]
	var animation := player.get_animation(animation_name)
	var animation_length := animation.length
	var head_bone := skeleton.find_bone("RigHead")
	for track_index in animation.get_track_count():
		var track_path := str(animation.track_get_path(track_index))
		if "RigHead" in track_path:
			print(
				"PEA_ATTACK_TRACK index=%d type=%d path=%s keys=%d"
				% [
					track_index,
					int(animation.track_get_type(track_index)),
					track_path,
					animation.track_get_key_count(track_index),
				]
			)
	player.play(animation_name)
	player.speed_scale = 0.0
	for sample_index in 21:
		var phase := float(sample_index) / 20.0
		player.seek(animation_length * phase, true)
		var head_origin := skeleton.get_bone_global_pose(head_bone).origin
		print(
			"PEA_ATTACK_HEAD phase=%.2f x=%.4f y=%.4f z=%.4f"
			% [phase, head_origin.x, head_origin.y, head_origin.z]
		)
	actor.free()


func _find_first(node: Node, class_name_to_find: String) -> Node:
	if node.is_class(class_name_to_find):
		return node
	for child in node.get_children():
		var found := _find_first(child, class_name_to_find)
		if found != null:
			return found
	return null
