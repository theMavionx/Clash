extends SceneTree

const OUTPUT_DIR := "res://generated/performance"
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
	"archer",
	"crystal",
	"projectile",
	"minecart",
]
const BAKE_CONFIGS: Array[Dictionary] = [
	{
		"source": "res://Model/Island/pirate_island.glb",
		"output": "res://generated/performance/pirate_island_static_batch.res",
		"variant_level": 0,
		"include_name_parts": ["barrel", "chest"],
	},
	{
		"source": "res://Model/Archer_towers/tower_1.glb",
		"output": "res://generated/performance/archer_tower_level_1_static_batch.res",
		"variant_level": 1,
	},
	{
		"source": "res://Model/Archer_towers/towerplus_2.fbx",
		"output": "res://generated/performance/archer_tower_level_2_static_batch.res",
		"variant_level": 2,
	},
	{
		"source": "res://Model/Archer_towers/3,4,5.glb",
		"output": "res://generated/performance/archer_tower_level_3_static_batch.res",
		"variant_level": 3,
	},
	{
		"source": "res://Model/Archer_towers/3,4,5.glb",
		"output": "res://generated/performance/archer_tower_level_4_static_batch.res",
		"variant_level": 4,
	},
	{
		"source": "res://Model/Archer_towers/3,4,5.glb",
		"output": "res://generated/performance/archer_tower_level_5_static_batch.res",
		"variant_level": 5,
	},
	{
		"source": "res://Model/Mine/1.glb",
		"output": "res://generated/performance/mine_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Barn/1.glb",
		"output": "res://generated/performance/barn_level_1_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Barn/2.glb",
		"output": "res://generated/performance/barn_level_2_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Barn/3.glb",
		"output": "res://generated/performance/barn_level_3_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Sawmill/1.glb",
		"output": "res://generated/performance/sawmill_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Storage/Storage shed_1.glb",
		"output": "res://generated/performance/storage_level_1_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Storage/Storage House_2.glb",
		"output": "res://generated/performance/storage_level_2_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Storage/Business Building_3.glb",
		"output": "res://generated/performance/storage_level_3_static_batch.res",
		"variant_level": 0,
		"vertex_color_batch": true,
	},
	{
		"source": "res://Model/Town_Hall/Town Hall Level 1.glb",
		"output": "res://generated/performance/town_hall_level_1_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Town_Hall/Town Hall Level 2.glb",
		"output": "res://generated/performance/town_hall_level_2_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Town_Hall/Town Hall Level 3.glb",
		"output": "res://generated/performance/town_hall_level_3_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Town_Hall/Town Hall Level 4.glb",
		"output": "res://generated/performance/town_hall_level_4_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Town_Hall/Town Hall Level 5.glb",
		"output": "res://generated/performance/town_hall_level_5_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Town_Hall/Town Hall Level 6.glb",
		"output": "res://generated/performance/town_hall_level_6_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Turret/scene.gltf",
		"output": "res://generated/performance/turret_static_batch.res",
		"variant_level": 0,
		"include_name_parts": ["stand"],
	},
	{
		"source": "res://Model/Altar/Models/Stylized_Altar_web.tscn",
		"output": "res://generated/performance/altar_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/MageTower/1.fbx",
		"output": "res://generated/performance/mage_tower_level_1_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/MageTower/2.fbx",
		"output": "res://generated/performance/mage_tower_level_2_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/MageTower/3.fbx",
		"output": "res://generated/performance/mage_tower_level_3_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Mortar/mortar_lvl1.fbx",
		"output": "res://generated/performance/mortar_level_1_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Mortar/mortar_lvl2.fbx",
		"output": "res://generated/performance/mortar_level_2_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Mortar/mortar_lvl3.fbx",
		"output": "res://generated/performance/mortar_level_3_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Mortar/mortar_lvl4.fbx",
		"output": "res://generated/performance/mortar_level_4_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Tombstone/GLB format/2.glb",
		"output": "res://generated/performance/tombstone_level_2_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Tombstone/GLB format/3.glb",
		"output": "res://generated/performance/tombstone_level_3_static_batch.res",
		"variant_level": 0,
	},
	{
		"source": "res://Model/Tombstone/GLB format/4.glb",
		"output": "res://generated/performance/tombstone_level_4_static_batch.res",
		"variant_level": 0,
	},
]


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(OUTPUT_DIR))
	var failed := false
	for config in BAKE_CONFIGS:
		if not _bake(config):
			failed = true
	quit(1 if failed else 0)


func _bake(config: Dictionary) -> bool:
	var source_path := str(config.get("source", ""))
	var output_path := str(config.get("output", ""))
	var variant_level := int(config.get("variant_level", 0))
	var include_name_parts: Array = config.get("include_name_parts", [])
	var vertex_color_batch := bool(config.get("vertex_color_batch", false))
	var packed_scene := load(source_path) as PackedScene
	if packed_scene == null:
		push_error("[STATIC_BATCH] source failed to load: %s" % source_path)
		return false
	var root := packed_scene.instantiate() as Node3D
	if root == null:
		push_error("[STATIC_BATCH] source failed to instantiate: %s" % source_path)
		return false
	get_root().add_child(root)
	if variant_level > 0:
		_apply_archer_tower_level_visuals(root, variant_level)

	var animated_roots := _collect_animated_roots(root)
	var surface_tools: Dictionary = {}
	var materials: Dictionary = {}
	var source_meshes := 0
	var source_surfaces := 0
	var source_triangles := 0
	var source_aabb := AABB()
	var has_source_aabb := false
	for raw_mesh in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := raw_mesh as MeshInstance3D
		if (
			not _matches_explicit_static_include(mesh_instance, include_name_parts, root)
			and not _is_static_candidate(mesh_instance, animated_roots, root)
		):
			continue
		if not _is_effectively_visible(mesh_instance, root):
			continue
		var mesh := mesh_instance.mesh
		if mesh == null:
			continue
		source_meshes += 1
		var local_transform := root.global_transform.affine_inverse() * mesh_instance.global_transform
		var transformed_aabb: AABB = local_transform * mesh.get_aabb()
		if has_source_aabb:
			source_aabb = source_aabb.merge(transformed_aabb)
		else:
			source_aabb = transformed_aabb
			has_source_aabb = true
		for surface_index in range(mesh.get_surface_count()):
			if mesh.surface_get_primitive_type(surface_index) != Mesh.PRIMITIVE_TRIANGLES:
				continue
			var material := mesh_instance.get_surface_override_material(surface_index)
			if material == null:
				material = mesh.surface_get_material(surface_index)
			var material_key: Variant = (
				"vertex_color_flat"
				if vertex_color_batch
				else (0 if material == null else material.get_instance_id())
			)
			var surface_tool := surface_tools.get(material_key) as SurfaceTool
			if surface_tool == null:
				surface_tool = SurfaceTool.new()
				surface_tools[material_key] = surface_tool
				materials[material_key] = (
					_vertex_color_material(material)
					if vertex_color_batch
					else material
				)
			if vertex_color_batch:
				if not _append_with_baked_albedo(
					surface_tool,
					mesh,
					surface_index,
					local_transform,
					material
				):
					push_error(
						"[STATIC_BATCH] vertex-color append failed source=%s surface=%d"
						% [source_path, surface_index]
					)
					root.queue_free()
					return false
			else:
				surface_tool.append_from(mesh, surface_index, local_transform)
			source_surfaces += 1
			var indices := mesh.surface_get_arrays(surface_index)[Mesh.ARRAY_INDEX] as PackedInt32Array
			if indices != null and not indices.is_empty():
				source_triangles += indices.size() / 3

	var batch_mesh := ArrayMesh.new()
	for material_key in surface_tools.keys():
		var surface_tool := surface_tools[material_key] as SurfaceTool
		if surface_tool == null:
			continue
		var material := materials.get(material_key) as Material
		if material != null:
			surface_tool.set_material(material)
		surface_tool.commit(batch_mesh)
	if batch_mesh.get_surface_count() == 0:
		push_error("[STATIC_BATCH] no surfaces generated for %s" % source_path)
		root.queue_free()
		return false
	var batch_aabb := batch_mesh.get_aabb()
	var batch_triangles := _count_triangles(batch_mesh)
	if batch_triangles != source_triangles:
		push_error(
			"[STATIC_BATCH] triangle mismatch source=%s source_triangles=%d batch_triangles=%d"
			% [source_path, source_triangles, batch_triangles]
		)
		root.queue_free()
		return false
	var save_error := ResourceSaver.save(batch_mesh, output_path)
	root.queue_free()
	if save_error != OK:
		push_error("[STATIC_BATCH] failed to save %s: %s" % [output_path, error_string(save_error)])
		return false
	print(
		"[STATIC_BATCH] source=%s level=%d meshes=%d surfaces=%d batch_surfaces=%d triangles=%d source_aabb=%s batch_aabb=%s output=%s"
		% [
			source_path,
			variant_level,
			source_meshes,
			source_surfaces,
			batch_mesh.get_surface_count(),
			source_triangles,
			source_aabb,
			batch_aabb,
			output_path,
		]
	)
	return true


func _append_with_baked_albedo(
	target: SurfaceTool,
	mesh: Mesh,
	surface_index: int,
	local_transform: Transform3D,
	material: Material
) -> bool:
	if not material is BaseMaterial3D:
		return false
	var base := material as BaseMaterial3D
	if (
		base.albedo_texture != null
		or base.normal_texture != null
		or base.emission_enabled
		or base.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED
	):
		return false
	var transformed := SurfaceTool.new()
	transformed.append_from(mesh, surface_index, local_transform)
	var arrays := transformed.commit_to_arrays()
	var vertices := arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array
	if vertices == null or vertices.is_empty():
		return false
	var raw_colors: Variant = arrays[Mesh.ARRAY_COLOR]
	var colors := (
		raw_colors as PackedColorArray
		if raw_colors is PackedColorArray
		else PackedColorArray()
	)
	if colors.size() != vertices.size():
		colors = PackedColorArray()
		colors.resize(vertices.size())
		colors.fill(Color.WHITE)
	for vertex_index in range(colors.size()):
		colors[vertex_index] *= base.albedo_color
	arrays[Mesh.ARRAY_COLOR] = colors
	var colored_mesh := ArrayMesh.new()
	colored_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	target.append_from(colored_mesh, 0, Transform3D.IDENTITY)
	return true


func _vertex_color_material(source: Material) -> Material:
	if not source is BaseMaterial3D:
		return source
	var result := source.duplicate(true) as BaseMaterial3D
	result.albedo_color = Color.WHITE
	result.vertex_color_use_as_albedo = true
	return result


func _matches_explicit_static_include(
	mesh_instance: MeshInstance3D,
	include_name_parts: Array,
	model_root: Node
) -> bool:
	if include_name_parts.is_empty():
		return false
	var current: Node = mesh_instance
	while current != null and current != model_root:
		var lower_name := String(current.name).to_lower()
		for raw_part in include_name_parts:
			if lower_name.contains(str(raw_part).to_lower()):
				return true
		current = current.get_parent()
	return false


func _count_triangles(mesh: ArrayMesh) -> int:
	var triangles := 0
	for surface_index in range(mesh.get_surface_count()):
		var arrays := mesh.surface_get_arrays(surface_index)
		var indices := arrays[Mesh.ARRAY_INDEX] as PackedInt32Array
		if indices != null and not indices.is_empty():
			triangles += indices.size() / 3
		else:
			var vertices := arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array
			if vertices != null:
				triangles += vertices.size() / 3
	return triangles


func _collect_animated_roots(root: Node) -> Array[Node]:
	var result: Array[Node] = []
	for raw_player in root.find_children("*", "AnimationPlayer", true, false):
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
				for track_index in range(animation.get_track_count()):
					var path_text := String(animation.track_get_path(track_index)).get_slice(":", 0)
					if path_text.is_empty():
						continue
					var target := animation_root.get_node_or_null(NodePath(path_text))
					if target != null and not result.has(target):
						result.append(target)
	return result


func _is_static_candidate(
	mesh_instance: MeshInstance3D,
	animated_roots: Array[Node],
	model_root: Node
) -> bool:
	if mesh_instance == null or mesh_instance.mesh == null:
		return false
	if not mesh_instance.skeleton.is_empty() or _has_skeleton_ancestor(mesh_instance):
		return false
	for animated_root in animated_roots:
		if animated_root == mesh_instance or animated_root.is_ancestor_of(mesh_instance):
			return false
	var current: Node = mesh_instance
	while current != null and current != model_root:
		var lower_name := String(current.name).to_lower()
		# Imported asset container names (for example "turret.fbx") describe the
		# whole file, not a movable component. Component meshes below them still
		# pass through the dynamic-name checks.
		if lower_name.ends_with(".fbx") or lower_name.ends_with(".gltf") or lower_name.ends_with(".glb"):
			current = current.get_parent()
			continue
		for part in DYNAMIC_NAME_PARTS:
			if lower_name.contains(part):
				return false
		current = current.get_parent()
	return true


func _has_skeleton_ancestor(node: Node) -> bool:
	var current := node.get_parent()
	while current != null:
		if current is Skeleton3D:
			return true
		current = current.get_parent()
	return false


func _is_effectively_visible(node: Node3D, root: Node) -> bool:
	var current: Node = node
	while current != null:
		if current is Node3D and not (current as Node3D).visible:
			return false
		if current == root:
			break
		current = current.get_parent()
	return true


func _apply_archer_tower_level_visuals(model: Node, level: int) -> void:
	var show_mannequin := level >= 5
	var show_target := level >= 4
	_set_archer_tower_extra_visible(model, show_mannequin, ["RootNode", "Dummy.002"], ["Leather"])
	_set_archer_tower_extra_visible(model, show_target, ["RootNode.001", "Cylinder.003"], ["White", "Celing"])


func _set_archer_tower_extra_visible(root: Node, is_visible: bool, node_names: Array[String], material_markers: Array[String]) -> void:
	if root is Node3D:
		var node_3d := root as Node3D
		if node_names.has(str(root.name)) or _mesh_uses_material_marker(root, material_markers):
			node_3d.visible = is_visible
	for child in root.get_children():
		_set_archer_tower_extra_visible(child, is_visible, node_names, material_markers)


func _mesh_uses_material_marker(node: Node, markers: Array[String]) -> bool:
	if not node is MeshInstance3D:
		return false
	var mesh_instance := node as MeshInstance3D
	var mesh := mesh_instance.mesh
	if mesh == null:
		return false
	for surface_index in range(mesh.get_surface_count()):
		var material := mesh_instance.get_surface_override_material(surface_index)
		if material == null:
			material = mesh.surface_get_material(surface_index)
		if material == null:
			continue
		for marker in markers:
			if str(material.resource_name).findn(marker) != -1:
				return true
	return false
