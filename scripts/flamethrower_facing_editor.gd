class_name FlamethrowerFacingEditor
extends Node3D

signal preview_changed(step: int)
signal confirmed(step: int)
signal cancelled(step: int)

const SEGMENTS := 18
const RANGE_FILL_COLOR := Color(1.0, 1.0, 1.0, 0.28)
const RANGE_EDGE_COLOR := Color(1.0, 1.0, 1.0, 1.0)
const DIRECTION_ARROW_COLOR := Color(1.0, 1.0, 1.0, 0.92)

var persisted_step := 0
var preview_step := 0
var attack_range := 1.2
var target_root: Node3D = null

var _sector: MeshInstance3D = null
var _sector_edge: MeshInstance3D = null
var _arrow: MeshInstance3D = null


func _ready() -> void:
	_create_visuals()
	visible = false


func begin(root: Node3D, saved_step: int, range_value: float) -> void:
	target_root = root
	persisted_step = FlamethrowerConfig.normalize_preview_step(saved_step)
	preview_step = persisted_step
	attack_range = maxf(0.05, range_value)
	_rebuild_sector()
	visible = is_instance_valid(target_root)
	_apply_preview(false)


func step_left() -> void:
	set_preview_step(preview_step - 1)


func step_right() -> void:
	set_preview_step(preview_step + 1)


func set_preview_step(value: int) -> void:
	preview_step = FlamethrowerConfig.normalize_preview_step(value)
	_apply_preview(true)


func reset_toward(world_target: Vector3) -> void:
	if not is_instance_valid(target_root):
		return
	set_preview_step(FlamethrowerConfig.nearest_step_toward(target_root.global_position, world_target))


func confirm() -> int:
	persisted_step = preview_step
	confirmed.emit(preview_step)
	visible = false
	return preview_step


func cancel() -> int:
	preview_step = persisted_step
	_apply_preview(false)
	cancelled.emit(persisted_step)
	visible = false
	return persisted_step


func dispose() -> void:
	if visible:
		cancel()
	target_root = null
	queue_free()


func snapshot() -> Dictionary:
	return {
		"active": visible and is_instance_valid(target_root),
		"persisted_step": persisted_step,
		"preview_step": preview_step,
		"range": attack_range,
		"yaw": rotation.y,
	}


func _process(_delta: float) -> void:
	if not visible or not is_instance_valid(target_root):
		return
	global_position = target_root.global_position + Vector3(0.0, 0.025, 0.0)
	# Keep the planning sector, but hide its centerline during a live stream so
	# the Fire Dragon plume is never mistaken for the facing gizmo.
	var is_firing := false
	if target_root.has_method("get_debug_snapshot"):
		var combat_snapshot: Dictionary = target_root.call("get_debug_snapshot")
		is_firing = str(combat_snapshot.get("state", "")) == "FIRING"
	if is_instance_valid(_arrow):
		_arrow.visible = not is_firing


func _apply_preview(should_emit: bool) -> void:
	if not is_instance_valid(target_root):
		return
	var yaw := FlamethrowerConfig.global_yaw_for_step(preview_step)
	FlamethrowerConfig.apply_global_yaw(target_root, yaw)
	global_position = target_root.global_position + Vector3(0.0, 0.025, 0.0)
	FlamethrowerConfig.apply_global_yaw(self, yaw)
	if should_emit:
		preview_changed.emit(preview_step)


func _create_visuals() -> void:
	_sector = MeshInstance3D.new()
	_sector.name = "AttackSector"
	_sector.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_sector)
	_sector_edge = MeshInstance3D.new()
	_sector_edge.name = "AttackSectorEdge"
	_sector_edge.position.y = 0.001
	_sector_edge.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_sector_edge)
	_arrow = MeshInstance3D.new()
	_arrow.name = "FacingArrow"
	_arrow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_arrow)
	_rebuild_sector()


func _rebuild_sector() -> void:
	if not is_instance_valid(_sector) or not is_instance_valid(_sector_edge) or not is_instance_valid(_arrow):
		return
	var full_angle := float(FlamethrowerConfig.combat().get("full_cone_degrees", 50.0))
	var half_angle := deg_to_rad(full_angle * 0.5)
	var vertices := PackedVector3Array()
	var colors := PackedColorArray()
	var indices := PackedInt32Array()
	vertices.append(Vector3.ZERO)
	colors.append(RANGE_FILL_COLOR)
	for index in range(SEGMENTS + 1):
		var angle := lerpf(-half_angle, half_angle, float(index) / float(SEGMENTS))
		vertices.append(Vector3(sin(angle) * attack_range, 0.0, -cos(angle) * attack_range))
		colors.append(RANGE_FILL_COLOR)
	for index in range(SEGMENTS):
		indices.append(0)
		indices.append(index + 1)
		indices.append(index + 2)
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var material := StandardMaterial3D.new()
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.vertex_color_use_as_albedo = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.no_depth_test = false
	material.render_priority = 4
	mesh.surface_set_material(0, material)
	_sector.mesh = mesh

	var edge_vertices := PackedVector3Array([Vector3.ZERO])
	for index in range(SEGMENTS + 1):
		var angle := lerpf(-half_angle, half_angle, float(index) / float(SEGMENTS))
		edge_vertices.append(Vector3(sin(angle) * attack_range, 0.0, -cos(angle) * attack_range))
	edge_vertices.append(Vector3.ZERO)
	var edge_arrays := []
	edge_arrays.resize(Mesh.ARRAY_MAX)
	edge_arrays[Mesh.ARRAY_VERTEX] = edge_vertices
	var edge_mesh := ArrayMesh.new()
	edge_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_LINE_STRIP, edge_arrays)
	var edge_material := StandardMaterial3D.new()
	edge_material.albedo_color = RANGE_EDGE_COLOR
	edge_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	edge_material.render_priority = 5
	edge_mesh.surface_set_material(0, edge_material)
	_sector_edge.mesh = edge_mesh

	var arrow_mesh := CylinderMesh.new()
	arrow_mesh.top_radius = 0.018
	arrow_mesh.bottom_radius = 0.045
	arrow_mesh.height = attack_range * 0.72
	arrow_mesh.radial_segments = 6
	var arrow_material := StandardMaterial3D.new()
	arrow_material.albedo_color = DIRECTION_ARROW_COLOR
	arrow_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	arrow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	arrow_material.render_priority = 5
	arrow_mesh.material = arrow_material
	_arrow.mesh = arrow_mesh
	_arrow.rotation_degrees.x = 90.0
	_arrow.position = Vector3(0.0, 0.018, -attack_range * 0.36)
