class_name SkinnedMeshCombiner
extends RefCounted
## Bakes modular rigid attachments into a character's skinned body surface.
##
## The body keeps its authored skin weights. Rigid parts such as heads, hair,
## helmets, and weapons are converted to a 100% weight on their attachment
## bone. This reduces draw calls without removing visible parts or animations.

static var _dense_lod_cache: Dictionary = {}
const MIN_DENSE_LOD_AXIS_COVERAGE: float = 0.80
const SIGNIFICANT_AXIS_RATIO: float = 0.02


static func bake(
	skeleton: Skeleton3D,
	body: MeshInstance3D,
	rigid_parts: Array[Dictionary],
	material: Material,
	resource_name: String
) -> ArrayMesh:
	if skeleton == null or body == null or body.mesh == null or body.skin == null:
		return null
	if not _is_transform_invertible(skeleton.global_transform):
		return null
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var tangents := PackedFloat32Array()
	var uvs := PackedVector2Array()
	var bones := PackedInt32Array()
	var weights := PackedFloat32Array()
	var indices := PackedInt32Array()
	var skeleton_inverse := skeleton.global_transform.affine_inverse()

	if not _append_mesh_arrays(
		body.mesh,
		skeleton_inverse * body.global_transform,
		-1,
		vertices,
		normals,
		tangents,
		uvs,
		bones,
		weights,
		indices
	):
		return null

	for part_data: Dictionary in rigid_parts:
		var part := part_data.get("mesh_instance") as MeshInstance3D
		var skeleton_bone := skeleton.find_bone(str(part_data.get("bone", "")))
		var skin_bind := _skin_bind_for_bone(body.skin, skeleton, skeleton_bone)
		if part == null or part.mesh == null or skeleton_bone < 0 or skin_bind < 0:
			return null
		var attachment := _find_bone_attachment(part, skeleton)
		if attachment == null:
			return null
		if not _is_transform_invertible(attachment.global_transform):
			return null
		var part_from_attachment := (
			attachment.global_transform.affine_inverse() * part.global_transform
		)
		var part_rest_transform := (
			body.skin.get_bind_pose(skin_bind).affine_inverse()
			* part_from_attachment
		)
		if not _append_mesh_arrays(
			part.mesh,
			part_rest_transform,
			skin_bind,
			vertices,
			normals,
			tangents,
			uvs,
			bones,
			weights,
			indices
		):
			return null

	var surface_arrays: Array = []
	surface_arrays.resize(Mesh.ARRAY_MAX)
	surface_arrays[Mesh.ARRAY_VERTEX] = vertices
	surface_arrays[Mesh.ARRAY_NORMAL] = normals
	surface_arrays[Mesh.ARRAY_TANGENT] = tangents
	surface_arrays[Mesh.ARRAY_TEX_UV] = uvs
	surface_arrays[Mesh.ARRAY_BONES] = bones
	surface_arrays[Mesh.ARRAY_WEIGHTS] = weights
	surface_arrays[Mesh.ARRAY_INDEX] = indices
	var result := ArrayMesh.new()
	result.resource_name = resource_name
	result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, surface_arrays)
	result.surface_set_material(0, material)
	return result


static func bake_skinned_parts(
	skeleton: Skeleton3D,
	parts: Array[MeshInstance3D],
	material: Material,
	resource_name: String
) -> ArrayMesh:
	if skeleton == null or parts.is_empty():
		return null
	if not _is_transform_invertible(skeleton.global_transform):
		return null
	var reference_skin: Skin = parts[0].skin
	if reference_skin == null:
		return null

	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var tangents := PackedFloat32Array()
	var uvs := PackedVector2Array()
	var bones := PackedInt32Array()
	var weights := PackedFloat32Array()
	var indices := PackedInt32Array()
	var skeleton_inverse := skeleton.global_transform.affine_inverse()
	for part in parts:
		if (
			part == null
			or part.mesh == null
			or part.skin == null
			or not _skins_are_compatible(reference_skin, part.skin)
		):
			return null
		if not _append_mesh_arrays(
			part.mesh,
			skeleton_inverse * part.global_transform,
			-1,
			vertices,
			normals,
			tangents,
			uvs,
			bones,
			weights,
			indices
		):
			return null

	var surface_arrays: Array = []
	surface_arrays.resize(Mesh.ARRAY_MAX)
	surface_arrays[Mesh.ARRAY_VERTEX] = vertices
	surface_arrays[Mesh.ARRAY_NORMAL] = normals
	surface_arrays[Mesh.ARRAY_TANGENT] = tangents
	surface_arrays[Mesh.ARRAY_TEX_UV] = uvs
	surface_arrays[Mesh.ARRAY_BONES] = bones
	surface_arrays[Mesh.ARRAY_WEIGHTS] = weights
	surface_arrays[Mesh.ARRAY_INDEX] = indices
	var result := ArrayMesh.new()
	result.resource_name = resource_name
	result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, surface_arrays)
	result.surface_set_material(0, material)
	return result


static func bake_rigid_parts(
	root: Node3D,
	parts: Array[MeshInstance3D],
	material: Material,
	resource_name: String
) -> ArrayMesh:
	if root == null or parts.is_empty():
		return null
	if not _is_transform_invertible(root.global_transform):
		return null

	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var tangents := PackedFloat32Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var root_inverse := root.global_transform.affine_inverse()
	for part in parts:
		if part == null or part.mesh == null:
			return null
		if not _append_rigid_mesh_arrays(
			part.mesh,
			root_inverse * part.global_transform,
			vertices,
			normals,
			tangents,
			uvs,
			indices
		):
			return null

	var surface_arrays: Array = []
	surface_arrays.resize(Mesh.ARRAY_MAX)
	surface_arrays[Mesh.ARRAY_VERTEX] = vertices
	surface_arrays[Mesh.ARRAY_NORMAL] = normals
	surface_arrays[Mesh.ARRAY_TANGENT] = tangents
	surface_arrays[Mesh.ARRAY_TEX_UV] = uvs
	surface_arrays[Mesh.ARRAY_INDEX] = indices
	var result := ArrayMesh.new()
	result.resource_name = resource_name
	result.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, surface_arrays)
	result.surface_set_material(0, material)
	return result


static func prune_modular_sources(
	skeleton: Skeleton3D,
	keep_nodes: Array[Node]
) -> void:
	if skeleton == null:
		return
	for child in skeleton.get_children():
		if keep_nodes.has(child):
			continue
		if child is MeshInstance3D or child is BoneAttachment3D:
			skeleton.remove_child(child)
			child.queue_free()


static func prune_mesh_sources(parts: Array[MeshInstance3D]) -> void:
	for part in parts:
		if part == null or not is_instance_valid(part):
			continue
		var parent := part.get_parent()
		if parent != null:
			parent.remove_child(part)
		part.queue_free()


static func prune_mesh_variants(
	root: Node,
	keep_meshes: Array[MeshInstance3D]
) -> void:
	if root == null:
		return
	for child in root.get_children():
		if child is MeshInstance3D and not keep_meshes.has(child):
			root.remove_child(child)
			child.queue_free()
			continue
		prune_mesh_variants(child, keep_meshes)


static func dense_lod_variant(source: Mesh, lod_index: int = 0) -> Mesh:
	if source == null or not source is ArrayMesh:
		return source
	lod_index = maxi(lod_index, 0)
	var source_id: int = source.get_instance_id()
	var cache_key := "%d:%d" % [source_id, lod_index]
	if _dense_lod_cache.has(cache_key):
		return _dense_lod_cache[cache_key] as Mesh
	if source.get_blend_shape_count() > 0:
		_dense_lod_cache[cache_key] = source
		return source

	var importer := ImporterMesh.from_mesh(source as ArrayMesh)
	if importer == null:
		_dense_lod_cache[cache_key] = source
		return source
	importer.generate_lods(25.0, 60.0, [])

	var dense_surfaces: Array[Dictionary] = []
	for surface_index in range(source.get_surface_count()):
		var lod_count: int = importer.get_surface_lod_count(surface_index)
		if lod_count <= lod_index:
			return _cache_dense_lod_fallback(
				cache_key,
				source,
				lod_index
			)
		var dense_indices: PackedInt32Array = importer.get_surface_lod_indices(
			surface_index,
			lod_index
		)
		var arrays: Array = source.surface_get_arrays(surface_index)
		var primitive_type := (
			source.surface_get_primitive_type(surface_index)
			as Mesh.PrimitiveType
		)
		if not _dense_lod_indices_are_safe(
			arrays,
			dense_indices,
			primitive_type
		):
			return _cache_dense_lod_fallback(
				cache_key,
				source,
				lod_index
			)
		dense_surfaces.append({
			"arrays": arrays,
			"indices": dense_indices,
			"material": source.surface_get_material(surface_index),
			"primitive": primitive_type,
		})

	var dense_mesh := ArrayMesh.new()
	dense_mesh.resource_name = "%s Dense" % source.resource_name
	for surface_index in range(dense_surfaces.size()):
		var surface: Dictionary = dense_surfaces[surface_index]
		var arrays: Array = surface.arrays
		arrays[Mesh.ARRAY_INDEX] = surface.indices
		dense_mesh.add_surface_from_arrays(
			int(surface.primitive) as Mesh.PrimitiveType,
			arrays
		)
		dense_mesh.surface_set_material(surface_index, surface.material)
	_dense_lod_cache[cache_key] = dense_mesh
	return dense_mesh


static func _cache_dense_lod_fallback(
	cache_key: String,
	source: Mesh,
	lod_index: int
) -> Mesh:
	var fallback := source
	if lod_index > 0:
		fallback = dense_lod_variant(source, lod_index - 1)
	_dense_lod_cache[cache_key] = fallback
	return fallback


static func _dense_lod_indices_are_safe(
	source_arrays: Array,
	dense_indices: PackedInt32Array,
	primitive_type: Mesh.PrimitiveType
) -> bool:
	var vertices: PackedVector3Array = source_arrays[Mesh.ARRAY_VERTEX]
	var source_indices: PackedInt32Array = source_arrays[Mesh.ARRAY_INDEX]
	if vertices.is_empty() or source_indices.is_empty() or dense_indices.is_empty():
		return false
	if primitive_type == Mesh.PRIMITIVE_TRIANGLES and dense_indices.size() % 3 != 0:
		return false
	for vertex_index in dense_indices:
		if vertex_index < 0 or vertex_index >= vertices.size():
			return false

	var source_bounds := _indexed_bounds(vertices, source_indices)
	var dense_bounds := _indexed_bounds(vertices, dense_indices)
	var source_diagonal := source_bounds.size.length()
	if source_diagonal <= 0.000001:
		return false
	for axis in range(3):
		var source_extent := source_bounds.size[axis]
		if source_extent <= source_diagonal * SIGNIFICANT_AXIS_RATIO:
			continue
		if (
			dense_bounds.size[axis] / source_extent
			< MIN_DENSE_LOD_AXIS_COVERAGE
		):
			return false
	return true


static func _indexed_bounds(
	vertices: PackedVector3Array,
	indices: PackedInt32Array
) -> AABB:
	var initialized := false
	var bounds := AABB()
	for vertex_index in indices:
		if vertex_index < 0 or vertex_index >= vertices.size():
			continue
		var vertex := vertices[vertex_index]
		if not initialized:
			bounds = AABB(vertex, Vector3.ZERO)
			initialized = true
		else:
			bounds = bounds.expand(vertex)
	return bounds


static func _find_bone_attachment(
	part: Node,
	skeleton: Skeleton3D
) -> BoneAttachment3D:
	var current := part.get_parent()
	while current != null and current != skeleton:
		if current is BoneAttachment3D:
			return current as BoneAttachment3D
		current = current.get_parent()
	return null


static func _append_mesh_arrays(
	source_mesh: Mesh,
	source_to_skeleton: Transform3D,
	rigid_bind_index: int,
	vertices: PackedVector3Array,
	normals: PackedVector3Array,
	tangents: PackedFloat32Array,
	uvs: PackedVector2Array,
	bones: PackedInt32Array,
	weights: PackedFloat32Array,
	indices: PackedInt32Array
) -> bool:
	if source_mesh.get_surface_count() != 1:
		return false
	if not _is_transform_invertible(source_to_skeleton):
		return false
	var source: Array = source_mesh.surface_get_arrays(0)
	var source_vertices: PackedVector3Array = source[Mesh.ARRAY_VERTEX]
	var source_normals: PackedVector3Array = source[Mesh.ARRAY_NORMAL]
	var source_tangents: PackedFloat32Array = source[Mesh.ARRAY_TANGENT]
	var source_uvs: PackedVector2Array = source[Mesh.ARRAY_TEX_UV]
	var source_indices: PackedInt32Array = source[Mesh.ARRAY_INDEX]
	var source_bones: Variant = source[Mesh.ARRAY_BONES]
	var source_weights: Variant = source[Mesh.ARRAY_WEIGHTS]
	if (
		source_vertices.is_empty()
		or source_normals.size() != source_vertices.size()
		or source_tangents.size() != source_vertices.size() * 4
		or source_uvs.size() != source_vertices.size()
		or source_indices.is_empty()
	):
		return false
	if rigid_bind_index < 0 and (
		source_bones == null
		or source_weights == null
		or source_bones.size() != source_vertices.size() * 4
		or source_weights.size() != source_vertices.size() * 4
	):
		return false

	var vertex_offset := vertices.size()
	var normal_basis := source_to_skeleton.basis.inverse().transposed()
	for vertex_index in range(source_vertices.size()):
		vertices.append(source_to_skeleton * source_vertices[vertex_index])
		normals.append((normal_basis * source_normals[vertex_index]).normalized())
		var tangent_offset := vertex_index * 4
		var tangent_direction := Vector3(
			source_tangents[tangent_offset],
			source_tangents[tangent_offset + 1],
			source_tangents[tangent_offset + 2]
		)
		tangent_direction = (normal_basis * tangent_direction).normalized()
		tangents.append(tangent_direction.x)
		tangents.append(tangent_direction.y)
		tangents.append(tangent_direction.z)
		tangents.append(source_tangents[tangent_offset + 3])
		uvs.append(source_uvs[vertex_index])
		if rigid_bind_index >= 0:
			bones.append(rigid_bind_index)
			bones.append(0)
			bones.append(0)
			bones.append(0)
			weights.append(1.0)
			weights.append(0.0)
			weights.append(0.0)
			weights.append(0.0)
		else:
			for influence in range(4):
				bones.append(int(source_bones[tangent_offset + influence]))
				weights.append(float(source_weights[tangent_offset + influence]))
	for source_index in source_indices:
		indices.append(vertex_offset + int(source_index))
	return true


static func _append_rigid_mesh_arrays(
	source_mesh: Mesh,
	source_to_root: Transform3D,
	vertices: PackedVector3Array,
	normals: PackedVector3Array,
	tangents: PackedFloat32Array,
	uvs: PackedVector2Array,
	indices: PackedInt32Array
) -> bool:
	if source_mesh.get_surface_count() != 1:
		return false
	if not _is_transform_invertible(source_to_root):
		return false
	var source: Array = source_mesh.surface_get_arrays(0)
	var source_vertices: PackedVector3Array = source[Mesh.ARRAY_VERTEX]
	var source_normals: PackedVector3Array = source[Mesh.ARRAY_NORMAL]
	var source_tangents: PackedFloat32Array = source[Mesh.ARRAY_TANGENT]
	var source_uvs: PackedVector2Array = source[Mesh.ARRAY_TEX_UV]
	var source_indices: PackedInt32Array = source[Mesh.ARRAY_INDEX]
	if (
		source_vertices.is_empty()
		or source_normals.size() != source_vertices.size()
		or source_tangents.size() != source_vertices.size() * 4
		or source_uvs.size() != source_vertices.size()
		or source_indices.is_empty()
	):
		return false

	var vertex_offset := vertices.size()
	var normal_basis := source_to_root.basis.inverse().transposed()
	for vertex_index in range(source_vertices.size()):
		vertices.append(source_to_root * source_vertices[vertex_index])
		normals.append((normal_basis * source_normals[vertex_index]).normalized())
		var tangent_offset := vertex_index * 4
		var tangent_direction := Vector3(
			source_tangents[tangent_offset],
			source_tangents[tangent_offset + 1],
			source_tangents[tangent_offset + 2]
		)
		tangent_direction = (normal_basis * tangent_direction).normalized()
		tangents.append(tangent_direction.x)
		tangents.append(tangent_direction.y)
		tangents.append(tangent_direction.z)
		tangents.append(source_tangents[tangent_offset + 3])
		uvs.append(source_uvs[vertex_index])
	for source_index in source_indices:
		indices.append(vertex_offset + int(source_index))
	return true


static func _is_transform_invertible(value: Transform3D) -> bool:
	var determinant := value.basis.determinant()
	return (
		not is_nan(determinant)
		and not is_inf(determinant)
		and absf(determinant) > 0.000001
	)


static func _skin_bind_for_bone(
	skin: Skin,
	skeleton: Skeleton3D,
	skeleton_bone: int
) -> int:
	if skin == null or skeleton_bone < 0:
		return -1
	var bone_name := skeleton.get_bone_name(skeleton_bone)
	for bind_index in range(skin.get_bind_count()):
		if (
			skin.get_bind_bone(bind_index) == skeleton_bone
			or skin.get_bind_name(bind_index) == bone_name
		):
			return bind_index
	return -1


static func _skins_are_compatible(reference: Skin, candidate: Skin) -> bool:
	if reference == null or candidate == null:
		return false
	if reference.get_bind_count() != candidate.get_bind_count():
		return false
	for bind_index in range(reference.get_bind_count()):
		if (
			reference.get_bind_bone(bind_index) != candidate.get_bind_bone(bind_index)
			or reference.get_bind_name(bind_index) != candidate.get_bind_name(bind_index)
			or not reference.get_bind_pose(bind_index).is_equal_approx(
				candidate.get_bind_pose(bind_index)
			)
		):
			return false
	return true
