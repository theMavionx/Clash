extends Node3D

## Presentation-only controller for the Air Bomb defense model.
## Combat code owns targeting, projectile motion, impact, and reload timing.
## The authored payload is one assembly: both balloons, suspension bridle, and barrel.

const RELOAD_PAYLOAD_DROP_MODEL_UNITS: float = 0.32
# Standalone previews use the historical camera-facing projection. Production
# replaces it with the per-building direction toward the troop deployment zone,
# presenting one readable emblem instead of wrapping it around the spherical UV
# seam. Back-facing vertices flip U so the reverse side remains readable as well.
# ModelRoot presents the supplied launcher with a +90-degree authored yaw. These
# inverse-rotated fallback axes keep standalone previews on the historical view;
# production still rebuilds them independently toward the real attack zone.
const DEFAULT_BALLOON_FLAG_VIEW_AXIS_MODEL: Vector3 = Vector3(-0.389, 0.0, 0.921)
const DEFAULT_BALLOON_FLAG_HORIZONTAL_AXIS_MODEL: Vector3 = Vector3(0.921, 0.0, 0.389)
const BALLOON_FLAG_UV_PADDING: float = 0.045
# Overscan keeps the complete flag centered while reducing the logo footprint on
# the curved balloon. With clamped sampling the area outside the flag extends its
# edge colors instead of wrapping or allocating a downscaled texture copy.
const BALLOON_FLAG_TEXTURE_SCALE: float = 1.4
const BALLOON_FLAG_TEXTURE_OFFSET: float = (1.0 - BALLOON_FLAG_TEXTURE_SCALE) * 0.5
const BASE_ALBEDO_TINT: Color = Color(0.85, 0.85, 0.85, 1.0)
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
var _carried_bomb_material: StandardMaterial3D
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
var _pending_attack_zone_global: Vector3 = Vector3.ZERO
var _has_pending_attack_zone: bool = false
var _model_bound: bool = false
var _balloon_flag_view_axis_model: Vector3 = DEFAULT_BALLOON_FLAG_VIEW_AXIS_MODEL
var _balloon_flag_horizontal_axis_model: Vector3 = DEFAULT_BALLOON_FLAG_HORIZONTAL_AXIS_MODEL
var _balloon_source_meshes: Array[ArrayMesh] = []


func _ready() -> void:
	set_process(false)
	_bind_imported_model()
	_prepare_balloon_flag_meshes()
	_prepare_materials()
	_payload_rest_transform = payload_assembly.transform
	reset_visual_state()
	if _pending_flag_texture != null:
		_apply_flag_texture(_pending_flag_texture)
		_pending_flag_texture = null
	_apply_pending_attack_zone_facing()


func _process(_delta: float) -> void:
	# Building placement begins at scale zero. Wait only until the build tween has
	# produced an invertible transform, then rebuild the two scene-local UV meshes
	# once and return to a process-free presentation node.
	_apply_pending_attack_zone_facing()


## Applies an already-resolved owner flag texture to the two balloon meshes only.
## The caller owns URL/cache/fallback resolution; this method performs no network work.
func apply_player_flag_texture(texture: Texture2D) -> void:
	if texture == null:
		return
	if not _model_bound:
		_pending_flag_texture = texture
		return
	_apply_flag_texture(texture)


## Faces the balloon emblems toward the real troop deployment zone while the
## launcher itself stays fixed. Safe to call during the scale-from-zero build tween.
func set_attack_zone_facing_global(target_global_position: Vector3) -> void:
	if not target_global_position.is_finite():
		return
	_pending_attack_zone_global = target_global_position
	_has_pending_attack_zone = true
	_apply_pending_attack_zone_facing()


## Exposes the resolved world-space emblem direction for focused integration tests.
func get_flag_facing_global() -> Vector3:
	if not _model_bound or not is_inside_tree():
		return Vector3.ZERO
	var facing := model_root.global_transform.basis * _balloon_flag_view_axis_model
	facing.y = 0.0
	return facing.normalized() if facing.length_squared() > 0.0000001 else Vector3.ZERO


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
		# Balloon emblems are oriented by rotating their prepared low-poly mesh,
		# so the detached projectile must inherit the current presentation basis.
		# Convert from PayloadAssembly-local back into ModelRoot-local space before
		# centering the complete payload around the projectile root.
		var centered_transform := (
			_payload_rest_transform * _payload_meshes[mesh_index].transform
		)
		centered_transform.origin -= _payload_visual_center
		mesh_copy.transform = centered_transform
		mesh_copy.visible = true
	return projectile


## Shows or hides the complete four-mesh payload. Both legacy side values are
## compatibility aliases and can never expose only one balloon.
func set_ammo_loaded(ammo_side: int, loaded: bool) -> void:
	if not _validate_compatibility_side(ammo_side) or not _model_bound:
		return
	# The tower asks again on every fixed simulation tick after reload. Avoid
	# invalidating the complete four-mesh payload subtree when the loaded state
	# has not changed; two TH9 defenses otherwise turn an idle presentation
	# update into sustained render-thread work.
	if _payload_loaded == loaded and payload_assembly.visible == loaded:
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
	# The source GLB has no embedded material slots. Circle is the orange bomb/barrel
	# from the supplied reference, while the two balloon meshes only share its
	# source map until an owner flag replaces their albedo at runtime.
	_carried_bomb_material = AMMO_MATERIAL_SOURCE.duplicate(true) as StandardMaterial3D
	_ammo_material = AMMO_MATERIAL_SOURCE.duplicate(true) as StandardMaterial3D
	assert(_base_material != null, "Air Bomb base material failed to duplicate")
	assert(_carried_bomb_material != null, "Air Bomb carried-bomb material failed to duplicate")
	assert(_ammo_material != null, "Air Bomb balloon material failed to duplicate")
	_base_material.resource_local_to_scene = true
	_carried_bomb_material.resource_local_to_scene = true
	_ammo_material.resource_local_to_scene = true
	# Match the early cannon's painted, matte presentation. The source metallic
	# maps made the entire defense mirror-black under the island lights and also
	# destroyed the black/orange flag contrast.
	for material in [_base_material, _carried_bomb_material, _ammo_material]:
		material.metallic = 0.0
		material.metallic_texture = null
		material.roughness = MATTE_ROUGHNESS
		material.roughness_texture = null
		material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
		material.texture_repeat = false
		material.uv1_scale = Vector3.ONE
		material.uv1_offset = Vector3.ZERO
	# Retain the authored off-white frame and brown wood without restoring the
	# source metallic glare. The slight neutral factor preserves face contrast in
	# the island's bright key light while staying close to the supplied render.
	_base_material.albedo_color = BASE_ALBEDO_TINT
	_ammo_material.uv1_scale = Vector3(
		BALLOON_FLAG_TEXTURE_SCALE,
		BALLOON_FLAG_TEXTURE_SCALE,
		1.0,
	)
	_ammo_material.uv1_offset = Vector3(
		BALLOON_FLAG_TEXTURE_OFFSET,
		BALLOON_FLAG_TEXTURE_OFFSET,
		0.0,
	)
	_static_base_mesh.material_override = _base_material
	# Circle is the orange bomb/barrel. Cube_024 is the pale suspension bridle and
	# therefore remains on the launcher material from the supplied reference.
	_payload_meshes[0].material_override = _carried_bomb_material
	_payload_meshes[1].material_override = _base_material
	for balloon_mesh in _balloon_meshes:
		balloon_mesh.material_override = _ammo_material


func _apply_flag_texture(texture: Texture2D) -> void:
	_ammo_material.albedo_color = Color.WHITE
	# Ship sails use the uploaded texture directly. Centered material overscan
	# reduces the logo footprint without resampling the source, so the balloon
	# keeps the sharp cached texture and adds no per-building allocation.
	_ammo_material.albedo_texture = texture
	for balloon_mesh in _balloon_meshes:
		balloon_mesh.material_override = _ammo_material


func _prepare_balloon_flag_meshes() -> void:
	if _balloon_source_meshes.is_empty():
		for balloon_mesh in _balloon_meshes:
			var source_mesh := balloon_mesh.mesh as ArrayMesh
			assert(source_mesh != null, "Air Bomb balloon mesh must remain an ArrayMesh")
			_balloon_source_meshes.append(source_mesh)
	assert(
		_balloon_source_meshes.size() == _balloon_meshes.size(),
		"Air Bomb balloon source-mesh cache lost parity",
	)
	for balloon_index in _balloon_meshes.size():
		var balloon_mesh := _balloon_meshes[balloon_index]
		var source_mesh := _balloon_source_meshes[balloon_index]
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
			model_vertex.dot(_balloon_flag_horizontal_axis_model),
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
		if model_normal.dot(_balloon_flag_view_axis_model) < 0.0:
			uv.x = 1.0 - uv.x
		result[vertex_index] = uv.clamp(Vector2.ZERO, Vector2.ONE)
	return result


func _apply_pending_attack_zone_facing() -> void:
	if not _has_pending_attack_zone or not _model_bound or not is_inside_tree():
		set_process(false)
		return
	var model_basis := model_root.global_transform.basis
	if absf(model_basis.determinant()) <= 0.000000001:
		set_process(true)
		return
	var global_direction := _pending_attack_zone_global - model_root.global_position
	global_direction.y = 0.0
	if global_direction.length_squared() <= 0.0000001:
		_has_pending_attack_zone = false
		set_process(false)
		return
	var model_direction := model_basis.inverse() * global_direction
	model_direction.y = 0.0
	if model_direction.length_squared() <= 0.0000001:
		set_process(true)
		return
	model_direction = model_direction.normalized()
	var direction_changed := _balloon_flag_view_axis_model.dot(model_direction) < 0.999999
	_balloon_flag_view_axis_model = model_direction
	_balloon_flag_horizontal_axis_model = Vector3(
		model_direction.z,
		0.0,
		-model_direction.x,
	).normalized()
	_has_pending_attack_zone = false
	set_process(false)
	if direction_changed:
		_rotate_balloon_logos_to_direction(model_direction)


## The planar UVs are authored once from the stable default projection. Turning
## the two nearly spherical balloon meshes then presents that projection toward
## the attack zone without rebuilding ArrayMesh vertex buffers for every placed
## defense. Besides avoiding duplicate GPU resources, this prevents edge-facing
## projections from taking an anomalously expensive browser render path.
func _rotate_balloon_logos_to_direction(model_direction: Vector3) -> void:
	var yaw_delta := DEFAULT_BALLOON_FLAG_VIEW_AXIS_MODEL.signed_angle_to(
		model_direction,
		Vector3.UP,
	)
	var yaw_basis := Basis(Vector3.UP, yaw_delta)
	var payload_rest_inverse := _payload_rest_transform.affine_inverse()
	for balloon_mesh in _balloon_meshes:
		var payload_index := _payload_meshes.find(balloon_mesh)
		if payload_index < 0 or payload_index >= _payload_mesh_rest_transforms.size():
			continue
		var desired_model_transform := _payload_mesh_rest_transforms[payload_index]
		desired_model_transform.basis = yaw_basis * desired_model_transform.basis
		balloon_mesh.transform = payload_rest_inverse * desired_model_transform


func _set_reload_progress_internal(progress: float) -> void:
	if is_equal_approx(_reload_progress, progress):
		return
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
