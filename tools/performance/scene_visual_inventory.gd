extends SceneTree

const ROOT_DIRS: Array[String] = [
	"res://Model/Island",
	"res://Model/Town_Hall",
	"res://Model/Barn",
	"res://Model/Mine",
	"res://Model/Sawmill",
	"res://Model/Storage",
	"res://Model/Turret",
	"res://Model/Archer_towers",
	"res://Model/Mage_tower",
	"res://Model/Mortar",
	"res://Model/Tombstone",
]

const DYNAMIC_NAME_PARTS: Array[String] = [
	"anim",
	"armature",
	"skeleton",
	"ship",
	"sail",
	"flag",
	"tentacle",
	"turret",
	"cannon",
	"barrel",
	"stand",
	"archer",
	"mage",
	"mortar",
	"projectile",
	"minecart",
]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var paths: Array[String] = []
	for root_dir in ROOT_DIRS:
		_collect_scene_paths(root_dir, paths)
	paths.sort()

	var totals := {
		"scenes": 0,
		"meshes": 0,
		"surfaces": 0,
		"animation_players": 0,
		"animations": 0,
		"animated_meshes": 0,
		"skeleton_meshes": 0,
		"named_dynamic_meshes": 0,
		"static_candidates": 0,
	}
	for path in paths:
		var report := _inspect_scene(path)
		if report.is_empty():
			continue
		for key in totals.keys():
			if key == "scenes":
				continue
			totals[key] += int(report.get(key, 0))
		totals.scenes += 1
		print("[VISUAL_INVENTORY] scene=", JSON.stringify(report))
	print("[VISUAL_INVENTORY] totals=", JSON.stringify(totals))
	quit()


func _collect_scene_paths(root_dir: String, paths: Array[String]) -> void:
	var dir := DirAccess.open(root_dir)
	if dir == null:
		return
	dir.list_dir_begin()
	while true:
		var entry := dir.get_next()
		if entry.is_empty():
			break
		if entry.begins_with("."):
			continue
		var path := root_dir.path_join(entry)
		if dir.current_is_dir():
			_collect_scene_paths(path, paths)
		elif entry.get_extension().to_lower() in ["glb", "gltf", "fbx"]:
			paths.append(path)
	dir.list_dir_end()


func _inspect_scene(path: String) -> Dictionary:
	var resource := load(path)
	if not resource is PackedScene:
		return {}
	var scene_root := (resource as PackedScene).instantiate()
	if scene_root == null:
		return {}

	var animated_roots: Array[Node] = []
	var animation_players := scene_root.find_children("*", "AnimationPlayer", true, false)
	var animation_count := 0
	for raw_player in animation_players:
		var player := raw_player as AnimationPlayer
		if player == null:
			continue
		var animation_root := player.get_node_or_null(player.root_node)
		if animation_root == null:
			animation_root = player
		for library_name in player.get_animation_library_list():
			var library := player.get_animation_library(library_name)
			if library == null:
				continue
			for animation_name in library.get_animation_list():
				var animation := library.get_animation(animation_name)
				if animation == null:
					continue
				animation_count += 1
				for track_index in range(animation.get_track_count()):
					var track_path_text := String(animation.track_get_path(track_index))
					var node_path_text := track_path_text.get_slice(":", 0)
					if node_path_text.is_empty():
						continue
					var target := animation_root.get_node_or_null(NodePath(node_path_text))
					if target != null and not animated_roots.has(target):
						animated_roots.append(target)

	var mesh_nodes := scene_root.find_children("*", "MeshInstance3D", true, false)
	var surfaces := 0
	var animated_meshes := 0
	var skeleton_meshes := 0
	var named_dynamic_meshes := 0
	var static_candidates := 0
	var dynamic_examples: Array[String] = []
	var static_examples: Array[String] = []
	for raw_mesh in mesh_nodes:
		var mesh_instance := raw_mesh as MeshInstance3D
		if mesh_instance == null:
			continue
		if mesh_instance.mesh != null:
			surfaces += mesh_instance.mesh.get_surface_count()
		var animated := _is_node_animated(mesh_instance, animated_roots)
		var skeleton_bound := not mesh_instance.skeleton.is_empty() or _has_skeleton_ancestor(mesh_instance)
		var named_dynamic := _has_dynamic_name(mesh_instance)
		if animated:
			animated_meshes += 1
		if skeleton_bound:
			skeleton_meshes += 1
		if named_dynamic:
			named_dynamic_meshes += 1
		if animated or skeleton_bound or named_dynamic:
			if dynamic_examples.size() < 8:
				dynamic_examples.append(String(scene_root.get_path_to(mesh_instance)))
		else:
			static_candidates += 1
			if static_examples.size() < 8:
				static_examples.append(String(scene_root.get_path_to(mesh_instance)))

	var report := {
		"path": path,
		"meshes": mesh_nodes.size(),
		"surfaces": surfaces,
		"animation_players": animation_players.size(),
		"animations": animation_count,
		"animated_meshes": animated_meshes,
		"skeleton_meshes": skeleton_meshes,
		"named_dynamic_meshes": named_dynamic_meshes,
		"static_candidates": static_candidates,
		"dynamic_examples": dynamic_examples,
		"static_examples": static_examples,
	}
	scene_root.free()
	return report


func _is_node_animated(node: Node, animated_roots: Array[Node]) -> bool:
	for animated_root in animated_roots:
		if animated_root == node or animated_root.is_ancestor_of(node):
			return true
	return false


func _has_skeleton_ancestor(node: Node) -> bool:
	var current := node.get_parent()
	while current != null:
		if current is Skeleton3D:
			return true
		current = current.get_parent()
	return false


func _has_dynamic_name(node: Node) -> bool:
	var current: Node = node
	while current != null:
		var lower_name := String(current.name).to_lower()
		for part in DYNAMIC_NAME_PARTS:
			if lower_name.contains(part):
				return true
		current = current.get_parent()
	return false
