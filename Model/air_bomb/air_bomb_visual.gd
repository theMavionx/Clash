extends Node3D

## Presentation-only controller for the Air Bomb defense model.
## Combat code owns targeting, projectile motion, impact, and reload timing.
## The authored payload is one assembly: both balloons, suspension bridle, and barrel.

const RELOAD_PAYLOAD_DROP_MODEL_UNITS: float = 0.32
# Production keeps a fixed yaw around the island. Projecting the owner flag onto
# this model-space plane presents one complete, readable emblem instead of
# wrapping it around the authored spherical UV seam. Back-facing vertices flip U
# so the reverse side remains readable as well.
const BALLOON_FLAG_VIEW_AXIS_MODEL: Vector3 = Vector3(0.921, 0.0, 0.389)
const BALLOON_FLAG_HORIZONTAL_AXIS_MODEL: Vector3 = Vector3(0.389, 0.0, -0.921)
const BALLOON_FLAG_UV_PADDING: float = 0.045
const MATTE_ROUGHNESS: float = 0.82

const BASE_MATERIAL_SOURCE: StandardMaterial3D = preload(
	"res://Model/air_bomb/air_bomb_base_material.tres"
)
const AMMO_MATERIAL_SOURCE: StandardMaterial3D = preload(
	"res://Model/air_bomb/air_bomb_ammo_material.tres"
)

@onready var model_root: Node3D = $ModelRoot
@onready var base_root: Node3D = $ModelRoot/Base
@onready var payload_assembly: Node3D = $ModelRoot/PayloadAssembly
@onready var payload_muzzle: Marker3D = $ModelRoot/PayloadMuzzle
@onready var model_source: Node3D = $ModelRoot/ModelSource

var _base_material: StandardMaterial3D
var _ammo_material: StandardMaterial3D
var _static_base_mesh: MeshInstance3D
var _payload_meshes: Array[MeshInstance3D] = []
var _balloon_meshes: Array[MeshInstance3D] = []
var _payload_mesh_rest_transforms: Array[Transform3D] = []
var _payload_rest_transform: Transform3D = Transform3D.IDENTITY
var _payload_visual_center: Vector3 = Vector3.ZERO
var _payload_loaded: bool = true
var _reload_progress: float = 1.0
var _pending_flag_texture: Texture2D
var _model_bound: bool = false


func _ready() -> void:
	_bind_imported_model()
	_prepare_balloon_flag_meshes()
	_prepare_materials()
	_payload_rest_transform = payload_assembly.transform
	reset_visual_state()
	if _pending_flag_texture != null:
		_apply_flag_texture(_pending_flag_texture)
		_pending_flag_texture = null


## Applies an already-resolved owner flag texture to the two balloon meshes only.
## The caller owns URL/cache/fallback resolution; this method performs no network work.
func apply_player_flag_texture(texture: Texture2D) -> void:
	if texture == null:
		return
	if not _model_bound:
		_pending_flag_texture = texture
		return
	_apply_flag_texture(texture)


## Returns one detached, production-scaled projectile containing the complete
## authored payload: Circle barrel/harness, Cube_024 bridle, and both balloons.
## [param ammo_side] remains for tower compatibility; both values select this same payload.
func create_projectile_visual(ammo_side: int) -> Node3D:
	if not _validate_compatibility_side(ammo_side) or not _model_bound:
		return null
	var projectile := Node3D.new()
	projectile.name = "AirBombPayloadVisual"
	projectile.transform = Transform3D(model_root.transform.basis, Vector3.ZERO)
	projectile.set_meta("air_bomb_payload", true)
	projectile.set_meta("air_bomb_compatibility_side", ammo_side)

	for mesh_index in _payload_meshes.size():
		var mesh_copy := _payload_meshes[mesh_index].duplicate() as MeshInstance3D
		if mesh_copy == null:
			projectile.free()
			push_error("AirBombVisual: failed to duplicate complete payload")
			return null
		projectile.add_child(mesh_copy)
		var centered_transform := _payload_mesh_rest_transforms[mesh_index]
		centered_transform.origin -= _payload_visual_center
		mesh_copy.transform = centered_transform
		mesh_copy.visible = true
	return projectile


## Shows or hides the complete four-mesh payload. Both legacy side values are
## compatibility aliases and can never expose only one balloon.
func set_ammo_loaded(ammo_side: int, loaded: bool) -> void:
	if not _validate_compatibility_side(ammo_side) or not _model_bound:
		return
	_payload_loaded = loaded
	_set_reload_progress_internal(1.0 if loaded else 0.0)
	payload_assembly.visible = loaded


## Applies deterministic presentation progress without deciding when reload completes.
## The hidden complete payload rises toward its loaded rest pose; authoritative code
## exposes it only at the reload-ready edge through [method set_ammo_loaded].
func set_reload_progress(ammo_side: int, progress: float) -> void:
	if not _validate_compatibility_side(ammo_side) or not _model_bound:
		return
	_set_reload_progress_internal(clampf(progress, 0.0, 1.0))


## Idempotent cleanup for scene reuse, upgrade swaps, destruction, and replay resets.
func reset_visual_state() -> void:
	if not _model_bound:
		return
	_payload_loaded = true
	_reload_progress = 1.0
	payload_assembly.transform = _payload_rest_transform
	payload_assembly.visible = true


## Both legacy side values resolve to the center of the same complete payload.
func get_muzzle_global_position(ammo_side: int) -> Vector3:
	if not _validate_compatibility_side(ammo_side) or not _model_bound:
		return global_position
	return payload_muzzle.global_position


func _bind_imported_model() -> void:
	var imported_base := model_source.find_child("AirBombBase", true, false) as MeshInstance3D
	var imported_barrel := model_source.find_child("Circle", true, false) as MeshInstance3D
	var imported_bridle := model_source.find_child("Cube_024", true, false) as MeshInstance3D
	var imported_balloon_a := model_source.find_child("Bombs_001", true, false) as MeshInstance3D
	var imported_balloon_b := model_source.find_child("Bombs_002", true, false) as MeshInstance3D
	assert(imported_base != null, "Air Bomb import lost AirBombBase")
	assert(imported_barrel != null, "Air Bomb import lost Circle carried barrel")
	assert(imported_bridle != null, "Air Bomb import lost Cube_024 suspension bridle")
	assert(imported_balloon_a != null, "Air Bomb import lost Bombs_001")
	assert(imported_balloon_b != null, "Air Bomb import lost Bombs_002")

	_static_base_mesh = imported_base
	_payload_meshes = [
		imported_barrel,
		imported_bridle,
		imported_balloon_a,
		imported_balloon_b,
	]
	_balloon_meshes = [imported_balloon_a, imported_balloon_b]
	var base_transform := _transform_relative_to_model_root(imported_base)
	_payload_mesh_rest_transforms.clear()
	for payload_mesh in _payload_meshes:
		_payload_mesh_rest_transforms.append(_transform_relative_to_model_root(payload_mesh))

	imported_base.reparent(base_root, false)
	imported_base.transform = base_transform
	for mesh_index in _payload_meshes.size():
		var payload_mesh := _payload_meshes[mesh_index]
		payload_mesh.reparent(payload_assembly, false)
		payload_mesh.transform = _payload_mesh_rest_transforms[mesh_index]

	_payload_visual_center = _calculate_payload_bounds().get_center()
	payload_muzzle.position = _payload_visual_center
	model_source.free()
	_model_bound = true


func _prepare_materials() -> void:
	_base_material = BASE_MATERIAL_SOURCE.duplicate(true) as StandardMaterial3D
	_ammo_material = AMMO_MATERIAL_SOURCE.duplicate(true) as StandardMaterial3D
	assert(_base_material != null, "Air Bomb base PBR material failed to duplicate")
	assert(_ammo_material != null, "Air Bomb balloon PBR material failed to duplicate")
	_base_material.resource_local_to_scene = true
	_ammo_material.resource_local_to_scene = true
	# Match the early cannon's painted, matte presentation. The source metallic
	# maps made the entire defense mirror-black under the island lights and also
	# destroyed the black/orange flag contrast.
	for material in [_base_material, _ammo_material]:
		material.metallic = 0.0
		material.metallic_texture = null
		material.roughness = MATTE_ROUGHNESS
		material.roughness_texture = null
		material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		material.texture_repeat = false
		material.uv1_scale = Vector3.ONE
		material.uv1_offset = Vector3.ZERO
	_static_base_mesh.material_override = _base_material
	# Circle is the carried barrel/harness and Cube_024 is its bridle. They retain
	# the supplied base PBR maps even though they travel with the balloon payload.
	_payload_meshes[0].material_override = _base_material
	_payload_meshes[1].material_override = _base_material
	for balloon_mesh in _balloon_meshes:
		balloon_mesh.material_override = _ammo_material


func _apply_flag_texture(texture: Texture2D) -> void:
	_ammo_material.albedo_color = Color.WHITE
	# Ship sails use the uploaded texture directly. The planar balloon UVs now do
	# the fitting, so allocating and downscaling a 30% intermediate canvas would
	# only blur the logo and waste per-building texture memory.
	_ammo_material.albedo_texture = texture
	for balloon_mesh in _balloon_meshes:
		balloon_mesh.material_override = _ammo_material


func _prepare_balloon_flag_meshes() -> void:
	for balloon_mesh in _balloon_meshes:
		var source_mesh := balloon_mesh.mesh as ArrayMesh
		assert(source_mesh != null, "Air Bomb balloon mesh must remain an ArrayMesh")
		assert(
			source_mesh.get_blend_shape_count() == 0,
			"Air Bomb planar flag projection does not support blend shapes"
		)
		var mesh_to_model := _transform_relative_to_model_root(balloon_mesh)
		balloon_mesh.mesh = _rebuild_balloon_mesh_with_planar_uv(source_mesh, mesh_to_model)


func _rebuild_balloon_mesh_with_planar_uv(
	source_mesh: ArrayMesh,
	mesh_to_model: Transform3D,
) -> ArrayMesh:
	var rebuilt := ArrayMesh.new()
	rebuilt.resource_local_to_scene = true
	for surface_index in source_mesh.get_surface_count():
		var arrays := source_mesh.surface_get_arrays(surface_index)
		var vertices_value: Variant = arrays[Mesh.ARRAY_VERTEX]
		var normals_value: Variant = arrays[Mesh.ARRAY_NORMAL]
		assert(vertices_value is PackedVector3Array, "Air Bomb balloon vertices are missing")
		assert(normals_value is PackedVector3Array, "Air Bomb balloon normals are missing")
		var vertices := vertices_value as PackedVector3Array
		var normals := normals_value as PackedVector3Array
		var planar_uvs := _build_balloon_planar_uvs(vertices, normals, mesh_to_model)
		assert(planar_uvs.size() == vertices.size(), "Air Bomb planar UV count mismatch")
		arrays[Mesh.ARRAY_TEX_UV] = planar_uvs
		var rebuilt_index := rebuilt.get_surface_count()
		rebuilt.add_surface_from_arrays(
			source_mesh.surface_get_primitive_type(surface_index),
			arrays,
			[],
			{},
		)
		rebuilt.surface_set_name(rebuilt_index, source_mesh.surface_get_name(surface_index))
		rebuilt.surface_set_material(rebuilt_index, source_mesh.surface_get_material(surface_index))
	return rebuilt


func _build_balloon_planar_uvs(
	vertices: PackedVector3Array,
	normals: PackedVector3Array,
	mesh_to_model: Transform3D,
) -> PackedVector2Array:
	var result := PackedVector2Array()
	if vertices.is_empty() or vertices.size() != normals.size():
		return result
	result.resize(vertices.size())

	var projected := PackedVector2Array()
	projected.resize(vertices.size())
	var projection_min := Vector2(INF, INF)
	var projection_max := Vector2(-INF, -INF)
	for vertex_index in vertices.size():
		var model_vertex := mesh_to_model * vertices[vertex_index]
		var point := Vector2(
			model_vertex.dot(BALLOON_FLAG_HORIZONTAL_AXIS_MODEL),
			model_vertex.y,
		)
		projected[vertex_index] = point
		projection_min = projection_min.min(point)
		projection_max = projection_max.max(point)

	var projection_center := (projection_min + projection_max) * 0.5
	var projection_size := projection_max - projection_min
	var square_span := maxf(projection_size.x, projection_size.y)
	assert(square_span > 0.00001, "Air Bomb balloon projection collapsed")
	var usable_scale := 1.0 - BALLOON_FLAG_UV_PADDING * 2.0
	var normal_to_model := mesh_to_model.basis.inverse().transposed()
	for vertex_index in vertices.size():
		var centered := (projected[vertex_index] - projection_center) / square_span
		var uv := Vector2(
			0.5 + centered.x * usable_scale,
			0.5 - centered.y * usable_scale,
		)
		var model_normal := (normal_to_model * normals[vertex_index]).normalized()
		if model_normal.dot(BALLOON_FLAG_VIEW_AXIS_MODEL) < 0.0:
			uv.x = 1.0 - uv.x
		result[vertex_index] = uv.clamp(Vector2.ZERO, Vector2.ONE)
	return result


func _set_reload_progress_internal(progress: float) -> void:
	_reload_progress = progress
	var eased_progress := smoothstep(0.0, 1.0, progress)
	var payload_transform := _payload_rest_transform
	payload_transform.origin.y -= RELOAD_PAYLOAD_DROP_MODEL_UNITS * (1.0 - eased_progress)
	payload_assembly.transform = payload_transform


func _calculate_payload_bounds() -> AABB:
	var bounds := AABB()
	var has_bounds := false
	for mesh_index in _payload_meshes.size():
		var mesh_bounds := (
			_payload_mesh_rest_transforms[mesh_index]
			* _payload_meshes[mesh_index].get_aabb()
		)
		if has_bounds:
			bounds = bounds.merge(mesh_bounds)
		else:
			bounds = mesh_bounds
			has_bounds = true
	return bounds


func _transform_relative_to_model_root(node: Node3D) -> Transform3D:
	var relative := node.transform
	var parent := node.get_parent()
	while parent != model_root:
		assert(parent is Node3D, "Air Bomb imported hierarchy must remain Node3D-only")
		relative = (parent as Node3D).transform * relative
		parent = parent.get_parent()
	assert(parent == model_root, "Air Bomb imported node must descend from ModelRoot")
	return relative


func _validate_compatibility_side(ammo_side: int) -> bool:
	if ammo_side == 0 or ammo_side == 1:
		return true
	push_error("AirBombVisual: compatibility ammo_side must be 0 or 1, got %d" % ammo_side)
	return false
