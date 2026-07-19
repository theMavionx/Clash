class_name MainShipController
extends Node3D

signal combat_arrived
signal departure_finished
signal home_arrived

@export var island_visual_path: NodePath = NodePath("../Island/Visual")
@export var attack_grid_path: NodePath = NodePath("../Island/shipPlane")
@export var combat_anchor_path: NodePath = NodePath("../MainShipShoreAnchor")
@export var water_path: NodePath = NodePath("../Water")
@export var ship_node_name: StringName = &"Ship_Large"
@export_range(0.5, 2.0, 0.05) var visual_scale_multiplier: float = 1.3
@export var departure_distance: float = 4.0
@export var combat_spawn_distance: float = 4.2
@export_range(0.0, 0.2, 0.01) var combat_shore_overlap: float = 0.06
@export var sail_duration: float = 2.4
@export_range(0.5, 2.5, 0.05) var combat_turn_distance: float = 1.35
@export_range(0.1, 1.2, 0.05) var combat_turn_control_distance: float = 0.55
@export var return_duration: float = 2.1
@export var bob_amplitude: float = 0.012
@export var bob_speed: float = 0.42
@export var roll_degrees: float = 0.45

const DEFAULT_PLAYER_FLAG_TEXTURE: Texture2D = preload("res://Model/Town_Hall/Town Hall Level 1_FlagTexture2.png")
const SHIP_SAIL_MATERIAL_KEY: String = "shipsail"
const FLAG_UV_MIN_AXIS_SPAN: float = 0.0001
const FLAG_UV_GROUP_GAP_RATIO: float = 0.25
const COMBAT_CURVE_ARC_SAMPLES: int = 48

var ship_visual: Node3D = null
var _visual_rest_transform: Transform3D = Transform3D.IDENTITY
var _home_transform: Transform3D = Transform3D.IDENTITY
var _motion_tween: Tween = null
var _state: StringName = &"uninitialized"
var _motion_phase: StringName = &"idle"
var _motion_time: float = 0.0
var _waterline_root_offset: float = 0.0
var _ship_rest_bounds: AABB = AABB()
var _player_flag_url: String = ""
var _player_flag_texture: Texture2D = DEFAULT_PLAYER_FLAG_TEXTURE


func _ready() -> void:
	call_deferred("_attach_island_ship")


func _process(delta: float) -> void:
	if not is_instance_valid(ship_visual):
		return
	_motion_time += minf(delta, 0.1)
	var bob: float = sin(_motion_time * bob_speed * TAU) * bob_amplitude
	var roll: float = deg_to_rad(sin(_motion_time * bob_speed * TAU * 0.73) * roll_degrees)
	ship_visual.transform = Transform3D(
		Basis(Vector3.FORWARD, roll) * _visual_rest_transform.basis,
		_visual_rest_transform.origin + Vector3.UP * bob
	)
func _attach_island_ship() -> void:
	if is_instance_valid(ship_visual):
		return
	var visual_root: Node = get_node_or_null(island_visual_path)
	if visual_root == null:
		push_error("MainShipController: island visual is missing")
		return
	ship_visual = _find_named_node3d(visual_root, ship_node_name)
	if ship_visual == null:
		push_error("MainShipController: %s was not found in island GLB" % String(ship_node_name))
		return
	var ship_global: Transform3D = ship_visual.global_transform
	global_transform = Transform3D(Basis.IDENTITY, ship_global.origin)
	_home_transform = global_transform
	ship_visual.reparent(self, true)
	ship_visual.scale *= visual_scale_multiplier
	_visual_rest_transform = ship_visual.transform
	var water: Node3D = get_node_or_null(water_path)
	_waterline_root_offset = _home_transform.origin.y - (water.global_position.y if water else 0.0)
	_ship_rest_bounds = _calculate_ship_rest_bounds()
	_stop_imported_ship_animation(visual_root)
	_prepare_ship_flag_uvs()
	_apply_ship_flag_texture(_player_flag_texture)
	_state = &"home"
	print(
		"[MAIN_SHIP] attached node=", ship_visual.name,
		" home=", _home_transform.origin,
		" visual_scale=", visual_scale_multiplier
	)


func set_player_flag_url(raw_url: String) -> void:
	var url := raw_url.strip_edges()
	if _player_flag_url == url and is_instance_valid(ship_visual):
		return
	_player_flag_url = url
	_player_flag_texture = DEFAULT_PLAYER_FLAG_TEXTURE
	_attach_island_ship()
	# Never retain another account's or replay's custom flag while the new
	# texture is loading. The canonical custom texture replaces this fallback.
	_apply_ship_flag_texture(DEFAULT_PLAYER_FLAG_TEXTURE)


func apply_player_flag_texture(raw_url: String, texture: Texture2D) -> void:
	var url := raw_url.strip_edges()
	if url != _player_flag_url or texture == null:
		return
	_player_flag_texture = texture
	_attach_island_ship()
	_apply_ship_flag_texture(texture)


func get_player_flag_url() -> String:
	return _player_flag_url


func _apply_ship_flag_texture(texture: Texture2D) -> void:
	if not is_instance_valid(ship_visual) or texture == null:
		return
	var changed_surfaces := _apply_ship_flag_texture_recursive(ship_visual, texture)
	if changed_surfaces == 0:
		push_warning("MainShipController: ShipSail surface was not found")
		return
	print("[MAIN_SHIP] player_flag_applied url=", _player_flag_url, " surfaces=", changed_surfaces)


func _apply_ship_flag_texture_recursive(node: Node, texture: Texture2D) -> int:
	var changed_surfaces := 0
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var mesh: Mesh = mesh_instance.mesh
		var surface_count: int = mesh.get_surface_count() if mesh else 0
		for surface_index in surface_count:
			var source_material: Material = mesh_instance.get_surface_override_material(surface_index)
			if source_material == null:
				source_material = mesh.surface_get_material(surface_index)
			if source_material == null:
				continue
			var material_name := _material_key(source_material)
			if material_name != SHIP_SAIL_MATERIAL_KEY:
				continue
			var material: StandardMaterial3D = null
			if source_material is StandardMaterial3D:
				material = (source_material as StandardMaterial3D).duplicate(true) as StandardMaterial3D
			if material == null:
				material = StandardMaterial3D.new()
			material.resource_local_to_scene = true
			material.albedo_color = Color.WHITE
			material.albedo_texture = texture
			material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
			mesh_instance.set_surface_override_material(surface_index, material)
			changed_surfaces += 1
	for child in node.get_children():
		changed_surfaces += _apply_ship_flag_texture_recursive(child, texture)
	return changed_surfaces


func _prepare_ship_flag_uvs() -> void:
	if not is_instance_valid(ship_visual):
		return
	var changed_surfaces := _prepare_ship_flag_uvs_recursive(ship_visual)
	if changed_surfaces == 0:
		push_warning("MainShipController: no ShipSail UV surface was prepared")
		return
	print("[MAIN_SHIP] flag_uv_prepared surfaces=", changed_surfaces)


func _prepare_ship_flag_uvs_recursive(node: Node) -> int:
	var changed_surfaces := 0
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var source_mesh := mesh_instance.mesh as ArrayMesh
		if source_mesh != null:
			var sail_surface_indices: Array[int] = []
			for surface_index in source_mesh.get_surface_count():
				var material := source_mesh.surface_get_material(surface_index)
				if material != null and _material_key(material) == SHIP_SAIL_MATERIAL_KEY:
					sail_surface_indices.append(surface_index)
			if not sail_surface_indices.is_empty():
				changed_surfaces += _rebuild_mesh_flag_uvs(mesh_instance, source_mesh, sail_surface_indices)
	for child in node.get_children():
		changed_surfaces += _prepare_ship_flag_uvs_recursive(child)
	return changed_surfaces


func _rebuild_mesh_flag_uvs(
	mesh_instance: MeshInstance3D,
	source_mesh: ArrayMesh,
	sail_surface_indices: Array[int]
) -> int:
	# Imported ShipSail UVs collapse every sail into a two-pixel-high strip of
	# the island atlas. Rebuild only the local mesh copy so a square player flag
	# is projected independently onto each physical sail.
	if source_mesh.get_blend_shape_count() > 0:
		push_warning("MainShipController: flag UV rebuild skipped for a blend-shape mesh")
		return 0
	var rebuilt := ArrayMesh.new()
	rebuilt.resource_local_to_scene = true
	var changed_surfaces := 0
	for surface_index in source_mesh.get_surface_count():
		var arrays := source_mesh.surface_get_arrays(surface_index)
		if sail_surface_indices.has(surface_index):
			var vertices_value: Variant = arrays[Mesh.ARRAY_VERTEX]
			if vertices_value is PackedVector3Array:
				var remapped_uvs := _build_sail_flag_uvs(vertices_value as PackedVector3Array)
				if remapped_uvs.size() == (vertices_value as PackedVector3Array).size():
					arrays[Mesh.ARRAY_TEX_UV] = remapped_uvs
					changed_surfaces += 1
		var rebuilt_index := rebuilt.get_surface_count()
		rebuilt.add_surface_from_arrays(
			source_mesh.surface_get_primitive_type(surface_index),
			arrays,
			[],
			{}
		)
		rebuilt.surface_set_name(rebuilt_index, source_mesh.surface_get_name(surface_index))
		rebuilt.surface_set_material(rebuilt_index, source_mesh.surface_get_material(surface_index))
	if changed_surfaces > 0:
		mesh_instance.mesh = rebuilt
	return changed_surfaces


func _build_sail_flag_uvs(vertices: PackedVector3Array) -> PackedVector2Array:
	var result := PackedVector2Array()
	if vertices.is_empty():
		return result
	result.resize(vertices.size())

	# Ship_Large has two sails separated along local X. Detect the largest X
	# gap instead of baking model coordinates, then normalize Y/Z per sail.
	var sorted_x: Array[float] = []
	for vertex in vertices:
		sorted_x.append(vertex.x)
	sorted_x.sort()
	var largest_gap := 0.0
	var split_x := INF
	for index in range(1, sorted_x.size()):
		var gap := sorted_x[index] - sorted_x[index - 1]
		if gap > largest_gap:
			largest_gap = gap
			split_x = (sorted_x[index] + sorted_x[index - 1]) * 0.5
	var x_span := sorted_x[sorted_x.size() - 1] - sorted_x[0]
	var has_two_sails := (
		x_span > FLAG_UV_MIN_AXIS_SPAN
		and largest_gap >= x_span * FLAG_UV_GROUP_GAP_RATIO
	)
	var bounds: Array[Dictionary] = [
		{"min_y": INF, "max_y": -INF, "min_z": INF, "max_z": -INF},
		{"min_y": INF, "max_y": -INF, "min_z": INF, "max_z": -INF},
	]
	for vertex in vertices:
		var group_index := 1 if has_two_sails and vertex.x > split_x else 0
		var group := bounds[group_index]
		group.min_y = minf(float(group.min_y), vertex.y)
		group.max_y = maxf(float(group.max_y), vertex.y)
		group.min_z = minf(float(group.min_z), vertex.z)
		group.max_z = maxf(float(group.max_z), vertex.z)
		bounds[group_index] = group

	for vertex_index in vertices.size():
		var vertex := vertices[vertex_index]
		var group_index := 1 if has_two_sails and vertex.x > split_x else 0
		var group := bounds[group_index]
		var z_span := maxf(float(group.max_z) - float(group.min_z), FLAG_UV_MIN_AXIS_SPAN)
		var y_span := maxf(float(group.max_y) - float(group.min_y), FLAG_UV_MIN_AXIS_SPAN)
		# ShipSail's physical vertical axis is local Z and its horizontal axis is
		# local Y. Mapping them as Y/Z rotates every uploaded flag by 90 degrees.
		var u := clampf(1.0 - ((vertex.y - float(group.min_y)) / y_span), 0.0, 1.0)
		var v := clampf((vertex.z - float(group.min_z)) / z_span, 0.0, 1.0)
		result[vertex_index] = Vector2(u, v)
	return result


func get_flag_uv_layout_summary() -> Dictionary:
	var summary := {"surface_count": 0, "surfaces": []}
	if not is_instance_valid(ship_visual):
		return summary
	_collect_flag_uv_layout(ship_visual, summary)
	return summary


func _collect_flag_uv_layout(node: Node, summary: Dictionary) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var mesh := mesh_instance.mesh
		if mesh != null:
			for surface_index in mesh.get_surface_count():
				var material := mesh.surface_get_material(surface_index)
				if material == null or _material_key(material) != SHIP_SAIL_MATERIAL_KEY:
					continue
				var arrays := mesh.surface_get_arrays(surface_index)
				var uvs_value: Variant = arrays[Mesh.ARRAY_TEX_UV]
				if not (uvs_value is PackedVector2Array):
					continue
				var uv_min := Vector2(INF, INF)
				var uv_max := Vector2(-INF, -INF)
				for uv in uvs_value as PackedVector2Array:
					uv_min = uv_min.min(uv)
					uv_max = uv_max.max(uv)
				summary.surface_count = int(summary.surface_count) + 1
				(summary.surfaces as Array).append({"min": uv_min, "max": uv_max})
	for child in node.get_children():
		_collect_flag_uv_layout(child, summary)


func _material_key(material: Material) -> String:
	return str(material.resource_name).to_lower().replace("_", "").replace(" ", "")


func _find_named_node3d(root: Node, wanted: StringName) -> Node3D:
	if root is Node3D and root.name == wanted:
		return root
	for child in root.get_children():
		var found: Node3D = _find_named_node3d(child, wanted)
		if found != null:
			return found
	return null


func _stop_imported_ship_animation(root: Node) -> void:
	for player in _collect_animation_players(root):
		for animation_name in player.get_animation_list():
			var animation: Animation = player.get_animation(animation_name)
			if animation == null:
				continue
			for track_index in range(animation.get_track_count() - 1, -1, -1):
				if String(animation.track_get_path(track_index)).contains(String(ship_node_name)):
					animation.track_set_enabled(track_index, false)


func _collect_animation_players(root: Node) -> Array[AnimationPlayer]:
	var players: Array[AnimationPlayer] = []
	if root is AnimationPlayer:
		players.append(root)
	for child in root.get_children():
		players.append_array(_collect_animation_players(child))
	return players


func get_active_ship_node() -> Node3D:
	return self if is_instance_valid(ship_visual) and visible else null


## The ship is an imported mesh whose sails and hull extend far beyond this
## controller's origin. Project its live mesh bounds so every visible part is
## clickable at any camera zoom instead of relying on an arbitrary radius.
func get_screen_hit_rect(camera: Camera3D, padding_px: float = 16.0) -> Rect2:
	if camera == null or not is_instance_valid(ship_visual) or not ship_visual.visible:
		return Rect2()
	if not (ship_visual is MeshInstance3D):
		return Rect2()
	var mesh_node := ship_visual as MeshInstance3D
	if mesh_node.mesh == null:
		return Rect2()
	var mesh_bounds := mesh_node.get_aabb()
	var minimum := Vector2(INF, INF)
	var maximum := Vector2(-INF, -INF)
	var projected_points := 0
	for x in [0.0, 1.0]:
		for y in [0.0, 1.0]:
			for z in [0.0, 1.0]:
				var local_corner := mesh_bounds.position + mesh_bounds.size * Vector3(x, y, z)
				var world_corner := mesh_node.global_transform * local_corner
				if camera.is_position_behind(world_corner):
					continue
				var screen_corner := camera.unproject_position(world_corner)
				minimum = minimum.min(screen_corner)
				maximum = maximum.max(screen_corner)
				projected_points += 1
	if projected_points == 0:
		return Rect2()
	return Rect2(minimum, maximum - minimum).grow(maxf(0.0, padding_px))


func is_screen_point_over_ship(camera: Camera3D, screen_point: Vector2, padding_px: float = 16.0) -> bool:
	var hit_rect := get_screen_hit_rect(camera, padding_px)
	return hit_rect.has_area() and hit_rect.has_point(screen_point)


func is_ready() -> bool:
	return is_instance_valid(ship_visual)


func prepare_departure() -> void:
	_attach_island_ship()
	if not is_instance_valid(ship_visual):
		return
	_kill_motion()
	visible = true
	_state = &"departing"
	_motion_phase = &"departing"
	var direction := Vector3(1.0, 0.0, -1.0).normalized()
	var target: Vector3 = global_position + direction * departure_distance
	target.y = global_position.y
	_face_bow(direction)
	_motion_tween = create_tween().set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	_motion_tween.tween_property(self, "global_position", target, sail_duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
	await _motion_tween.finished
	if _state != &"departing":
		return
	visible = false
	_state = &"away"
	_motion_phase = &"away"
	departure_finished.emit()


func hide_for_battle_transition() -> void:
	_attach_island_ship()
	_kill_motion()
	visible = false
	_state = &"away"
	_motion_phase = &"away"


func sail_to_combat() -> void:
	_attach_island_ship()
	if not is_instance_valid(ship_visual):
		return
	_kill_motion()
	var combat_pose: Dictionary = _get_combat_pose()
	if combat_pose.is_empty():
		return
	var lateral: Vector3 = combat_pose.lateral
	var shore_normal: Vector3 = combat_pose.shore_normal
	var stop_pos: Vector3 = combat_pose.stop_pos
	var spawn_pos: Vector3 = combat_pose.spawn_pos
	var approach_direction: Vector3 = stop_pos - spawn_pos
	approach_direction.y = 0.0
	if approach_direction.length_squared() <= 0.0001:
		push_error("MainShipController: combat approach path is too short")
		return
	approach_direction = approach_direction.normalized()
	var turn_distance := minf(
		maxf(combat_turn_distance, 0.1),
		maxf(0.1, combat_spawn_distance * 0.72)
	)
	var turn_pos := stop_pos + shore_normal * turn_distance
	turn_pos.y = stop_pos.y
	var final_basis := _broadside_basis(lateral, shore_normal)
	var final_bow_direction := -final_basis.x.normalized()
	var control_distance := minf(
		maxf(combat_turn_control_distance, 0.05),
		turn_distance * 0.72
	)
	var first_control := turn_pos + approach_direction * control_distance
	var second_control := stop_pos - final_bow_direction * control_distance
	var straight_length := spawn_pos.distance_to(turn_pos)
	var curve_arc_lengths := _build_cubic_arc_lengths(
		turn_pos,
		first_control,
		second_control,
		stop_pos,
		COMBAT_CURVE_ARC_SAMPLES
	)
	global_position = spawn_pos
	_face_bow(approach_direction)
	visible = true
	_state = &"approaching"
	_motion_phase = &"straight"
	print(
		"[MAIN_SHIP] combat_approach_start spawn=", spawn_pos,
		" turn=", turn_pos,
		" stop=", stop_pos,
		" bow=", get_bow_direction()
	)
	_motion_tween = create_tween().set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	_motion_tween.tween_method(
		Callable(self, "_apply_combat_approach").bind(
			spawn_pos,
			turn_pos,
			first_control,
			second_control,
			stop_pos,
			approach_direction,
			straight_length,
			curve_arc_lengths
		),
		0.0,
		1.0,
		maxf(0.3, sail_duration)
	).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	await _motion_tween.finished
	if _state != &"approaching":
		return
	global_position = stop_pos
	global_basis = final_basis
	_state = &"combat"
	_motion_phase = &"combat"
	combat_arrived.emit()
	print("[MAIN_SHIP] combat_arrived pos=", global_position, " bow=", get_bow_direction())


func force_combat() -> void:
	_attach_island_ship()
	if not is_instance_valid(ship_visual):
		return
	var combat_pose: Dictionary = _get_combat_pose()
	if combat_pose.is_empty():
		return
	_kill_motion()
	global_position = combat_pose.stop_pos
	_face_broadside(combat_pose.lateral, combat_pose.shore_normal)
	visible = true
	_state = &"combat"
	_motion_phase = &"combat"


func _get_combat_pose() -> Dictionary:
	var anchor: Node3D = get_node_or_null(combat_anchor_path)
	var grid: MeshInstance3D = get_node_or_null(attack_grid_path)
	if anchor == null and grid == null:
		push_error("MainShipController: combat anchor and attack grid are missing")
		return {}
	var water: Node3D = get_node_or_null(water_path)
	var reference: Node3D = anchor if anchor != null else grid
	var water_y: float = water.global_position.y if water else reference.global_position.y
	var lateral: Vector3 = reference.global_transform.basis.x.normalized()
	lateral.y = 0.0
	lateral = lateral.normalized()
	var shore_normal: Vector3 = reference.global_transform.basis.z.normalized()
	shore_normal.y = 0.0
	shore_normal = shore_normal.normalized()
	var hull_shore_offset: float = _combat_hull_shore_offset()
	var shoreline_pos: Vector3
	if anchor != null:
		shoreline_pos = anchor.global_position
	else:
		var island_center: Vector3 = grid.get_parent_node_3d().global_position
		if shore_normal.dot(grid.global_position - island_center) < 0.0:
			shore_normal = -shore_normal
		var half_depth: float = grid.global_transform.basis.z.length() * 0.5
		shoreline_pos = grid.global_position + shore_normal * half_depth
	var stop_pos: Vector3 = shoreline_pos + shore_normal * hull_shore_offset
	stop_pos.y = water_y + _waterline_root_offset
	var spawn_pos: Vector3 = stop_pos + shore_normal * combat_spawn_distance
	spawn_pos.y = stop_pos.y
	return {
		"lateral": lateral,
		"shore_normal": shore_normal,
		"hull_shore_offset": hull_shore_offset,
		"stop_pos": stop_pos,
		"spawn_pos": spawn_pos,
	}


func return_home(animate: bool = true) -> void:
	_attach_island_ship()
	if not is_instance_valid(ship_visual):
		return
	_kill_motion()
	visible = true
	_state = &"returning"
	_motion_phase = &"returning"
	var direction: Vector3 = _home_transform.origin - global_position
	direction.y = 0.0
	if direction.length_squared() > 0.0001:
		_face_bow(direction.normalized())
	if animate:
		_motion_tween = create_tween().set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
		_motion_tween.tween_property(self, "global_position", _home_transform.origin, return_duration).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		await _motion_tween.finished
	global_transform = _home_transform
	_state = &"home"
	_motion_phase = &"home"
	home_arrived.emit()
	print("[MAIN_SHIP] home_arrived pos=", global_position)


func force_home() -> void:
	_attach_island_ship()
	if not is_instance_valid(ship_visual):
		return
	_kill_motion()
	visible = true
	global_transform = _home_transform
	_state = &"home"
	_motion_phase = &"home"


func _face_bow(direction: Vector3) -> void:
	if direction.length_squared() <= 0.0001:
		return
	# Ship_Large's bow points along local -X, not Godot's conventional +Z.
	_set_ship_long_axis(-direction.normalized())


func _face_broadside(lateral: Vector3, shore_normal: Vector3) -> void:
	global_basis = _broadside_basis(lateral, shore_normal)


func _broadside_basis(lateral: Vector3, shore_normal: Vector3) -> Basis:
	if lateral.length_squared() <= 0.0001 or shore_normal.length_squared() <= 0.0001:
		return global_basis
	var long_axis := lateral.normalized()
	var outward_axis := long_axis.cross(Vector3.UP).normalized()
	if outward_axis.dot(shore_normal) < 0.0:
		long_axis = -long_axis
		outward_axis = -outward_axis
	return Basis(long_axis, Vector3.UP, outward_axis).orthonormalized()


func _apply_combat_approach(
	progress: float,
	spawn_pos: Vector3,
	turn_pos: Vector3,
	first_control: Vector3,
	second_control: Vector3,
	stop_pos: Vector3,
	approach_direction: Vector3,
	straight_length: float,
	curve_arc_lengths: PackedFloat32Array
) -> void:
	var curve_length := curve_arc_lengths[curve_arc_lengths.size() - 1] if not curve_arc_lengths.is_empty() else 0.0
	var total_length := straight_length + curve_length
	if total_length <= 0.0001:
		global_position = stop_pos
		return
	var travelled := clampf(progress, 0.0, 1.0) * total_length
	if travelled <= straight_length or curve_length <= 0.0001:
		var straight_progress := clampf(travelled / maxf(straight_length, 0.0001), 0.0, 1.0)
		global_position = spawn_pos.lerp(turn_pos, straight_progress)
		_face_bow(approach_direction)
		return
	if _motion_phase != &"turning":
		_motion_phase = &"turning"
		print("[MAIN_SHIP] combat_turn_start pos=", global_position, " bow=", get_bow_direction())
	var curve_distance := minf(travelled - straight_length, curve_length)
	var upper_index := 1
	while upper_index < curve_arc_lengths.size() and curve_arc_lengths[upper_index] < curve_distance:
		upper_index += 1
	upper_index = mini(upper_index, curve_arc_lengths.size() - 1)
	var lower_index := maxi(0, upper_index - 1)
	var lower_distance := curve_arc_lengths[lower_index]
	var upper_distance := curve_arc_lengths[upper_index]
	var sample_blend := 0.0
	if upper_distance - lower_distance > 0.000001:
		sample_blend = (curve_distance - lower_distance) / (upper_distance - lower_distance)
	var curve_t := (float(lower_index) + sample_blend) / float(curve_arc_lengths.size() - 1)
	global_position = _sample_cubic_curve(turn_pos, first_control, second_control, stop_pos, curve_t)
	var tangent := _sample_cubic_tangent(turn_pos, first_control, second_control, stop_pos, curve_t)
	tangent.y = 0.0
	if tangent.length_squared() > 0.000001:
		_face_bow(tangent.normalized())


func _build_cubic_arc_lengths(
	start_pos: Vector3,
	first_control: Vector3,
	second_control: Vector3,
	end_pos: Vector3,
	sample_count: int
) -> PackedFloat32Array:
	var count := maxi(2, sample_count)
	var distances := PackedFloat32Array()
	distances.resize(count + 1)
	var previous := start_pos
	for sample_index in range(1, count + 1):
		var t := float(sample_index) / float(count)
		var point := _sample_cubic_curve(start_pos, first_control, second_control, end_pos, t)
		distances[sample_index] = distances[sample_index - 1] + previous.distance_to(point)
		previous = point
	return distances


func _sample_cubic_curve(
	start_pos: Vector3,
	first_control: Vector3,
	second_control: Vector3,
	end_pos: Vector3,
	t: float
) -> Vector3:
	var clamped_t := clampf(t, 0.0, 1.0)
	var inverse := 1.0 - clamped_t
	return (
		start_pos * inverse * inverse * inverse
		+ first_control * 3.0 * inverse * inverse * clamped_t
		+ second_control * 3.0 * inverse * clamped_t * clamped_t
		+ end_pos * clamped_t * clamped_t * clamped_t
	)


func _sample_cubic_tangent(
	start_pos: Vector3,
	first_control: Vector3,
	second_control: Vector3,
	end_pos: Vector3,
	t: float
) -> Vector3:
	var clamped_t := clampf(t, 0.0, 1.0)
	var inverse := 1.0 - clamped_t
	return (
		(first_control - start_pos) * 3.0 * inverse * inverse
		+ (second_control - first_control) * 6.0 * inverse * clamped_t
		+ (end_pos - second_control) * 3.0 * clamped_t * clamped_t
	)


func get_bow_direction() -> Vector3:
	# Ship_Large's bow points opposite its local +X long axis.
	return -global_basis.x.normalized()


func get_combat_motion_debug() -> Dictionary:
	var pose := _get_combat_pose()
	return {
		"state": String(_state),
		"phase": String(_motion_phase),
		"position": global_position,
		"bow_direction": get_bow_direction(),
		"long_axis": global_basis.x.normalized(),
		"outward_axis": global_basis.z.normalized(),
		"stop_pos": pose.get("stop_pos", global_position),
		"spawn_pos": pose.get("spawn_pos", global_position),
		"lateral": pose.get("lateral", Vector3.RIGHT),
		"shore_normal": pose.get("shore_normal", Vector3.FORWARD),
	}


func _set_ship_long_axis(long_axis: Vector3) -> void:
	var axis_x := long_axis.normalized()
	var axis_z := axis_x.cross(Vector3.UP).normalized()
	global_basis = Basis(axis_x, Vector3.UP, axis_z).orthonormalized()


func _calculate_ship_rest_bounds() -> AABB:
	if not (ship_visual is MeshInstance3D):
		return AABB()
	var mesh_node := ship_visual as MeshInstance3D
	if mesh_node.mesh == null:
		return AABB()
	var mesh_bounds := mesh_node.get_aabb()
	var minimum := Vector3(INF, INF, INF)
	var maximum := Vector3(-INF, -INF, -INF)
	for x in [0.0, 1.0]:
		for y in [0.0, 1.0]:
			for z in [0.0, 1.0]:
				var point := _visual_rest_transform * (mesh_bounds.position + mesh_bounds.size * Vector3(x, y, z))
				minimum = minimum.min(point)
				maximum = maximum.max(point)
	return AABB(minimum, maximum - minimum)


func _combat_hull_shore_offset() -> float:
	if _ship_rest_bounds.size == Vector3.ZERO:
		return 0.18
	# With the ship broadside, local +Z faces water and -Z faces the island.
	# Place the root so the inner hull overlaps the shoreline only slightly.
	var inward_extent := maxf(0.0, -_ship_rest_bounds.position.z)
	return maxf(0.02, inward_extent - combat_shore_overlap)


func _kill_motion() -> void:
	if _motion_tween != null and _motion_tween.is_valid():
		_motion_tween.kill()
	_motion_tween = null
