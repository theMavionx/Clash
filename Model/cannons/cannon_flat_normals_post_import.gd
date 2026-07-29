@tool
extends EditorScenePostImport

## Rebuilds every imported cannon surface with one normal per triangle.
## The source models are intentionally low-poly; smooth vertex normals wash
## out their authored planes and were rejected in the art review.
##
## Cannon 2-10 also ship with low platform rings and decorative boards merged
## into the barrel mesh. Those connected components must stay with the fixed
## base instead of yawing and recoiling with the barrel.

const STATIC_DECOR_MAX_Y: float = 0.75
const POSITION_WELD_SCALE: float = 10000.0

func _post_import(scene: Node) -> Object:
	_split_static_barrel_decor(scene)
	_apply_flat_normals(scene)
	return scene


func _split_static_barrel_decor(scene: Node) -> void:
	for level in range(2, 11):
		var base := _find_node_by_name(scene, "Cannon%dBase" % level) as MeshInstance3D
		var barrel := _find_node_by_name(scene, "Cannon%d" % level) as MeshInstance3D
		if base == null or barrel == null:
			continue
		if not base.mesh is ArrayMesh or not barrel.mesh is ArrayMesh:
			continue

		var split := _split_barrel_mesh(barrel.mesh as ArrayMesh)
		if split.is_empty():
			continue
		base.mesh = _append_mesh_surfaces(
			base.mesh as ArrayMesh,
			split.fixed as ArrayMesh,
		)
		barrel.mesh = split.rotating as ArrayMesh


func _split_barrel_mesh(source: ArrayMesh) -> Dictionary:
	var rotating_mesh := ArrayMesh.new()
	var fixed_mesh := ArrayMesh.new()
	rotating_mesh.resource_name = source.resource_name
	fixed_mesh.resource_name = source.resource_name + "_StaticDecor"
	var fixed_triangle_count: int = 0

	for surface_index in source.get_surface_count():
		if source.surface_get_primitive_type(surface_index) != Mesh.PRIMITIVE_TRIANGLES:
			push_warning(
				"Cannon import: barrel surface %d is not triangles; it was not split."
				% surface_index
			)
			_copy_surface(source, surface_index, rotating_mesh)
			continue

		var arrays := source.surface_get_arrays(surface_index)
		var split_arrays := _split_surface_arrays_by_component(arrays)
		var rotating_arrays: Array = split_arrays.rotating
		var fixed_arrays: Array = split_arrays.fixed
		var material := source.surface_get_material(surface_index)
		var surface_name := source.surface_get_name(surface_index)

		if _surface_vertex_count(rotating_arrays) > 0:
			rotating_mesh.add_surface_from_arrays(
				Mesh.PRIMITIVE_TRIANGLES,
				rotating_arrays,
			)
			var rotating_index := rotating_mesh.get_surface_count() - 1
			rotating_mesh.surface_set_material(rotating_index, material)
			rotating_mesh.surface_set_name(rotating_index, surface_name)

		var fixed_vertices := _surface_vertex_count(fixed_arrays)
		if fixed_vertices > 0:
			fixed_triangle_count += floori(float(fixed_vertices) / 3.0)
			fixed_mesh.add_surface_from_arrays(
				Mesh.PRIMITIVE_TRIANGLES,
				fixed_arrays,
			)
			var fixed_index := fixed_mesh.get_surface_count() - 1
			fixed_mesh.surface_set_material(fixed_index, material)
			fixed_mesh.surface_set_name(
				fixed_index,
				surface_name + "_StaticDecor",
			)

	if fixed_triangle_count == 0 or rotating_mesh.get_surface_count() == 0:
		return {}
	return {
		"rotating": rotating_mesh,
		"fixed": fixed_mesh,
		"fixed_triangle_count": fixed_triangle_count,
	}


func _split_surface_arrays_by_component(source_arrays: Array) -> Dictionary:
	var vertices: PackedVector3Array = source_arrays[Mesh.ARRAY_VERTEX]
	var indices: PackedInt32Array = source_arrays[Mesh.ARRAY_INDEX]
	var index_count := indices.size() if not indices.is_empty() else vertices.size()
	var triangle_count := floori(float(index_count) / 3.0)
	var parents: Array[int] = []
	parents.resize(triangle_count)
	for triangle_index in triangle_count:
		parents[triangle_index] = triangle_index

	var point_owner: Dictionary = {}
	for triangle_index in triangle_count:
		for corner in 3:
			var source_index := _triangle_vertex_index(
				indices,
				triangle_index,
				corner,
			)
			var position_key := _position_key(vertices[source_index])
			if point_owner.has(position_key):
				_union_components(
					parents,
					triangle_index,
					int(point_owner[position_key]),
				)
			else:
				point_owner[position_key] = triangle_index

	var component_bounds: Dictionary = {}
	for triangle_index in triangle_count:
		var root_index := _find_component_root(parents, triangle_index)
		for corner in 3:
			var source_index := _triangle_vertex_index(
				indices,
				triangle_index,
				corner,
			)
			var vertex := vertices[source_index]
			if component_bounds.has(root_index):
				var bounds: AABB = component_bounds[root_index]
				component_bounds[root_index] = bounds.expand(vertex)
			else:
				component_bounds[root_index] = AABB(vertex, Vector3.ZERO)

	var rotating_triangles: Array[int] = []
	var fixed_triangles: Array[int] = []
	for triangle_index in triangle_count:
		var root_index := _find_component_root(parents, triangle_index)
		var bounds: AABB = component_bounds[root_index]
		var component_top := bounds.position.y + bounds.size.y
		if component_top <= STATIC_DECOR_MAX_Y:
			fixed_triangles.append(triangle_index)
		else:
			rotating_triangles.append(triangle_index)

	return {
		"rotating": _build_triangle_arrays(
			source_arrays,
			indices,
			rotating_triangles,
		),
		"fixed": _build_triangle_arrays(
			source_arrays,
			indices,
			fixed_triangles,
		),
	}


func _build_triangle_arrays(
	source_arrays: Array,
	indices: PackedInt32Array,
	triangle_indices: Array[int],
) -> Array:
	var vertices: PackedVector3Array = source_arrays[Mesh.ARRAY_VERTEX]
	var result: Array = []
	result.resize(Mesh.ARRAY_MAX)
	result[Mesh.ARRAY_INDEX] = null

	for array_slot in Mesh.ARRAY_INDEX:
		var source_values: Variant = source_arrays[array_slot]
		if source_values == null:
			continue
		var source_size: int = source_values.size()
		if source_size == 0:
			result[array_slot] = source_values
			continue
		var values_per_vertex: int = source_size / vertices.size()
		var output_values: Variant = source_values.duplicate()
		output_values.resize(0)
		for triangle_index in triangle_indices:
			for corner in 3:
				var source_vertex := _triangle_vertex_index(
					indices,
					triangle_index,
					corner,
				)
				var source_offset := source_vertex * values_per_vertex
				for value_index in values_per_vertex:
					output_values.append(source_values[source_offset + value_index])
		result[array_slot] = output_values
	return result


func _triangle_vertex_index(
	indices: PackedInt32Array,
	triangle_index: int,
	corner: int,
) -> int:
	var flat_index := triangle_index * 3 + corner
	return indices[flat_index] if not indices.is_empty() else flat_index


func _position_key(vertex: Vector3) -> Vector3i:
	return Vector3i(
		roundi(vertex.x * POSITION_WELD_SCALE),
		roundi(vertex.y * POSITION_WELD_SCALE),
		roundi(vertex.z * POSITION_WELD_SCALE),
	)


func _find_component_root(parents: Array[int], index: int) -> int:
	var root := index
	while parents[root] != root:
		root = parents[root]
	while parents[index] != index:
		var next := parents[index]
		parents[index] = root
		index = next
	return root


func _union_components(parents: Array[int], first: int, second: int) -> void:
	var first_root := _find_component_root(parents, first)
	var second_root := _find_component_root(parents, second)
	if first_root != second_root:
		parents[second_root] = first_root


func _append_mesh_surfaces(base_mesh: ArrayMesh, extra_mesh: ArrayMesh) -> ArrayMesh:
	var result := ArrayMesh.new()
	result.resource_name = base_mesh.resource_name
	for surface_index in base_mesh.get_surface_count():
		_copy_surface(base_mesh, surface_index, result)
	for surface_index in extra_mesh.get_surface_count():
		_copy_surface(extra_mesh, surface_index, result)
	return result


func _copy_surface(source: ArrayMesh, surface_index: int, target: ArrayMesh) -> void:
	target.add_surface_from_arrays(
		source.surface_get_primitive_type(surface_index),
		source.surface_get_arrays(surface_index),
	)
	var target_index := target.get_surface_count() - 1
	target.surface_set_material(target_index, source.surface_get_material(surface_index))
	target.surface_set_name(target_index, source.surface_get_name(surface_index))


func _surface_vertex_count(arrays: Array) -> int:
	if arrays.is_empty() or arrays[Mesh.ARRAY_VERTEX] == null:
		return 0
	return arrays[Mesh.ARRAY_VERTEX].size()


func _find_node_by_name(node: Node, target_name: String) -> Node:
	if str(node.name) == target_name:
		return node
	for child in node.get_children():
		var found := _find_node_by_name(child, target_name)
		if found != null:
			return found
	return null


func _apply_flat_normals(node: Node) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		if mesh_instance.mesh is ArrayMesh:
			mesh_instance.mesh = _make_flat_mesh(mesh_instance.mesh as ArrayMesh)
	for child in node.get_children():
		_apply_flat_normals(child)


func _make_flat_mesh(source: ArrayMesh) -> ArrayMesh:
	var result := ArrayMesh.new()
	result.resource_name = source.resource_name
	result.custom_aabb = source.custom_aabb
	for surface_index in source.get_surface_count():
		if source.surface_get_primitive_type(surface_index) != Mesh.PRIMITIVE_TRIANGLES:
			push_warning("Cannon import: surface %d is not triangles; keeping original arrays." % surface_index)
			result.add_surface_from_arrays(
				source.surface_get_primitive_type(surface_index),
				source.surface_get_arrays(surface_index)
			)
			result.surface_set_material(
				result.get_surface_count() - 1,
				source.surface_get_material(surface_index)
			)
			continue

		var surface_tool := SurfaceTool.new()
		surface_tool.create_from(source, surface_index)
		surface_tool.deindex()
		var arrays := surface_tool.commit_to_arrays()
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var normals := PackedVector3Array()
		normals.resize(vertices.size())
		for vertex_index in range(0, vertices.size(), 3):
			var face_normal := (
				(vertices[vertex_index + 2] - vertices[vertex_index])
				.cross(vertices[vertex_index + 1] - vertices[vertex_index])
				.normalized()
			)
			normals[vertex_index] = face_normal
			normals[vertex_index + 1] = face_normal
			normals[vertex_index + 2] = face_normal
		arrays[Mesh.ARRAY_NORMAL] = normals
		arrays[Mesh.ARRAY_TANGENT] = null
		result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		var new_surface_index := result.get_surface_count() - 1
		result.surface_set_material(new_surface_index, source.surface_get_material(surface_index))
		result.surface_set_name(new_surface_index, source.surface_get_name(surface_index))
	return result
