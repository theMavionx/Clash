class_name IceFreezeVFX
extends Node3D
## Battle-owned, WebGL-safe Ice Golem death burst and building frost overlay.

const SNOWFLAKE_TEXTURE: Texture2D = preload(
	"res://Model/Characters/IceGolem/Textures/ice_snowflake.png"
)
const FROST_PADDING: Vector3 = Vector3(0.035, 0.035, 0.035)
const BURST_DURATION: float = 0.68
const MAX_FROSTED_BUILDINGS: int = 24
const SHARDS_PER_BUILDING: int = 4
const THAW_WINDOW_SEC: float = 0.35
const THAW_REFRESH_INTERVAL_SEC: float = 1.0 / 20.0

var _active_frost: Dictionary = {}
var _frost_layout_dirty := false
var _thaw_refresh_elapsed := 0.0
var _frost_multimesh: MultiMesh
var _frost_instances: MultiMeshInstance3D
var _frost_material: StandardMaterial3D
var _shard_multimesh: MultiMesh
var _shard_instances: MultiMeshInstance3D
var _shard_material: StandardMaterial3D


static func get_or_create(scene_root: Node) -> IceFreezeVFX:
	if scene_root == null:
		return null
	var tree := scene_root.get_tree()
	if tree:
		var existing := tree.get_first_node_in_group("ice_freeze_vfx")
		if existing is IceFreezeVFX:
			return existing as IceFreezeVFX
	var service := IceFreezeVFX.new()
	service.name = "IceFreezeVFX"
	scene_root.add_child(service)
	return service


func _ready() -> void:
	add_to_group("ice_freeze_vfx")
	add_to_group("combat_ephemeral_vfx")
	_build_frost_renderer()
	set_process(false)


func show_freeze(origin: Vector3, radius: float, duration: float, affected: Array[Dictionary]) -> void:
	_spawn_radial_burst(origin, radius)
	var now_msec := Time.get_ticks_msec()
	var expires_msec := now_msec + roundi(maxf(0.0, duration) * 1000.0)
	for entry in affected:
		if not bool(entry.get("show_overlay", true)):
			continue
		var target: Node3D = entry.get("node", null)
		if not is_instance_valid(target):
			continue
		var key := _frost_key(entry, target)
		var current: Dictionary = _active_frost.get(key, {})
		current["node"] = weakref(target)
		current["expires_msec"] = maxi(int(current.get("expires_msec", 0)), expires_msec)
		current["bounds"] = _visual_bounds(target)
		current["target_global_transform"] = target.global_transform
		_active_frost[key] = current
	_frost_layout_dirty = true
	_flush_frost_layout(now_msec)
	if not _active_frost.is_empty():
		set_process(true)


func clear_all() -> void:
	_active_frost.clear()
	_frost_layout_dirty = false
	_thaw_refresh_elapsed = 0.0
	set_process(false)
	if _frost_multimesh:
		_frost_multimesh.instance_count = 0
	if _shard_multimesh:
		_shard_multimesh.instance_count = 0
	for child in get_children():
		if child != _frost_instances and child.is_in_group("ice_freeze_burst"):
			child.queue_free()


func _process(delta: float) -> void:
	if _active_frost.is_empty():
		set_process(false)
		return
	_thaw_refresh_elapsed += delta
	var refresh_thaw_colors := _thaw_refresh_elapsed >= THAW_REFRESH_INTERVAL_SEC
	if refresh_thaw_colors:
		_thaw_refresh_elapsed = fmod(_thaw_refresh_elapsed, THAW_REFRESH_INTERVAL_SEC)
	var now_msec := Time.get_ticks_msec()
	var has_thawing_frost := false
	for key in _active_frost.keys():
		var entry: Dictionary = _active_frost[key]
		var target_ref: WeakRef = entry.get("node", null)
		var target := target_ref.get_ref() as Node3D if target_ref else null
		if not is_instance_valid(target) or now_msec >= int(entry.get("expires_msec", 0)):
			_active_frost.erase(key)
			_frost_layout_dirty = true
			continue
		var current_transform := target.global_transform
		var previous_transform: Transform3D = entry.get(
			"target_global_transform",
			current_transform
		)
		if not current_transform.is_equal_approx(previous_transform):
			entry["target_global_transform"] = current_transform
			entry["bounds"] = _visual_bounds(target)
			_active_frost[key] = entry
			_frost_layout_dirty = true
		if int(entry.get("expires_msec", 0)) - now_msec <= roundi(THAW_WINDOW_SEC * 1000.0):
			has_thawing_frost = true
	if _frost_layout_dirty:
		_flush_frost_layout(now_msec)
	elif refresh_thaw_colors and has_thawing_frost:
		_refresh_frost_colors(now_msec)
	if _active_frost.is_empty():
		set_process(false)


func _build_frost_renderer() -> void:
	_frost_material = StandardMaterial3D.new()
	_frost_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_frost_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_frost_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_frost_material.vertex_color_use_as_albedo = true
	_frost_material.albedo_color = Color(0.58, 0.90, 1.0, 0.42)
	_frost_material.emission_enabled = true
	_frost_material.emission = Color(0.20, 0.72, 1.0, 1.0)
	_frost_material.emission_energy_multiplier = 1.15

	var cage_mesh := BoxMesh.new()
	cage_mesh.size = Vector3.ONE
	_frost_multimesh = MultiMesh.new()
	_frost_multimesh.transform_format = (
		MultiMesh.TRANSFORM_3D as MultiMesh.TransformFormat
	)
	_frost_multimesh.use_colors = true
	_frost_multimesh.mesh = cage_mesh
	_frost_multimesh.instance_count = 0
	_frost_instances = MultiMeshInstance3D.new()
	_frost_instances.name = "FrozenDefenseCages"
	_frost_instances.multimesh = _frost_multimesh
	_frost_instances.material_override = _frost_material
	_frost_instances.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_frost_instances)

	_shard_material = StandardMaterial3D.new()
	_shard_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_shard_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_shard_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_shard_material.vertex_color_use_as_albedo = true
	_shard_material.albedo_color = Color(0.46, 0.88, 1.0, 0.72)
	_shard_material.emission_enabled = true
	_shard_material.emission = Color(0.18, 0.72, 1.0, 1.0)
	_shard_material.emission_energy_multiplier = 1.55

	var shard_mesh := CylinderMesh.new()
	shard_mesh.top_radius = 0.0
	shard_mesh.bottom_radius = 0.045
	shard_mesh.height = 0.24
	shard_mesh.radial_segments = 4
	shard_mesh.rings = 1
	_shard_multimesh = MultiMesh.new()
	_shard_multimesh.transform_format = (
		MultiMesh.TRANSFORM_3D as MultiMesh.TransformFormat
	)
	_shard_multimesh.use_colors = true
	_shard_multimesh.mesh = shard_mesh
	_shard_multimesh.instance_count = 0
	_shard_instances = MultiMeshInstance3D.new()
	_shard_instances.name = "FrozenDefenseShards"
	_shard_instances.multimesh = _shard_multimesh
	_shard_instances.material_override = _shard_material
	_shard_instances.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_shard_instances)


func _rebuild_frost_instances(now_msec: int) -> void:
	if _frost_multimesh == null:
		return
	var keys := _active_frost.keys()
	keys.sort()
	var count := mini(keys.size(), MAX_FROSTED_BUILDINGS)
	_frost_multimesh.instance_count = count
	_shard_multimesh.instance_count = count * SHARDS_PER_BUILDING
	for index in range(count):
		var entry: Dictionary = _active_frost[keys[index]]
		var bounds: AABB = entry.get("bounds", AABB())
		var size := bounds.size + FROST_PADDING
		size.x = maxf(size.x, 0.12)
		size.y = maxf(size.y, 0.14)
		size.z = maxf(size.z, 0.12)
		var center := bounds.get_center()
		var frost_transform := Transform3D(Basis.from_scale(size), center)
		var thaw_alpha := _thaw_alpha(entry, now_msec)
		_frost_multimesh.set_instance_transform(index, frost_transform)
		_frost_multimesh.set_instance_color(index, Color(0.52, 0.88, 1.0, 0.22 + thaw_alpha * 0.24))
		_set_building_shards(index, bounds, size, thaw_alpha)


func _flush_frost_layout(now_msec: int) -> void:
	_rebuild_frost_instances(now_msec)
	_frost_layout_dirty = false
	_thaw_refresh_elapsed = 0.0


func _refresh_frost_colors(now_msec: int) -> void:
	if _frost_multimesh == null:
		return
	var keys := _active_frost.keys()
	keys.sort()
	var count := mini(keys.size(), MAX_FROSTED_BUILDINGS)
	for index in range(count):
		var entry: Dictionary = _active_frost[keys[index]]
		var thaw_alpha := _thaw_alpha(entry, now_msec)
		_frost_multimesh.set_instance_color(
			index,
			Color(0.52, 0.88, 1.0, 0.22 + thaw_alpha * 0.24)
		)
		_set_building_shard_colors(index, thaw_alpha)


func _thaw_alpha(entry: Dictionary, now_msec: int) -> float:
	var remaining := maxf(
		0.0,
		float(int(entry.get("expires_msec", now_msec)) - now_msec) / 1000.0
	)
	return clampf(remaining / THAW_WINDOW_SEC, 0.0, 1.0)


func _set_building_shards(building_index: int, bounds: AABB, size: Vector3, thaw_alpha: float) -> void:
	var center := bounds.get_center()
	var base_y := bounds.position.y
	var x_offset := maxf(0.055, size.x * 0.44)
	var z_offset := maxf(0.055, size.z * 0.44)
	var height_scale := clampf(size.y * 1.25, 0.72, 2.25)
	var width_scale := clampf(minf(size.x, size.z) * 1.15, 0.72, 1.65)
	var offsets: Array[Vector2] = [
		Vector2(-x_offset, -z_offset),
		Vector2(x_offset, -z_offset),
		Vector2(x_offset, z_offset),
		Vector2(-x_offset, z_offset),
	]
	for shard_index in range(SHARDS_PER_BUILDING):
		var angle := PI * (0.17 + float(shard_index) * 0.43)
		var shard_basis := Basis(Vector3.UP, angle).scaled(
			Vector3(width_scale, height_scale, width_scale)
		)
		var shard_position := Vector3(
			center.x + offsets[shard_index].x,
			base_y + 0.12 * height_scale,
			center.z + offsets[shard_index].y
		)
		var instance_index := building_index * SHARDS_PER_BUILDING + shard_index
		_shard_multimesh.set_instance_transform(
			instance_index,
			Transform3D(shard_basis, shard_position)
		)
	_set_building_shard_colors(building_index, thaw_alpha)


func _set_building_shard_colors(building_index: int, thaw_alpha: float) -> void:
	for shard_index in range(SHARDS_PER_BUILDING):
		var instance_index := building_index * SHARDS_PER_BUILDING + shard_index
		_shard_multimesh.set_instance_color(
			instance_index,
			Color(0.60, 0.94, 1.0, 0.38 + thaw_alpha * 0.48)
		)


func _visual_bounds(root: Node3D) -> AABB:
	var has_bounds := false
	var minimum := Vector3(INF, INF, INF)
	var maximum := Vector3(-INF, -INF, -INF)
	for mesh_value in root.find_children("*", "MeshInstance3D", true, false):
		var mesh_instance := mesh_value as MeshInstance3D
		if mesh_instance == null or mesh_instance.mesh == null or not mesh_instance.visible:
			continue
		var local_aabb := mesh_instance.get_aabb()
		for corner_index in range(8):
			var corner := Vector3(
				local_aabb.position.x + local_aabb.size.x * float(corner_index & 1),
				local_aabb.position.y + local_aabb.size.y * float((corner_index >> 1) & 1),
				local_aabb.position.z + local_aabb.size.z * float((corner_index >> 2) & 1)
			)
			var point := to_local(mesh_instance.to_global(corner))
			minimum = minimum.min(point)
			maximum = maximum.max(point)
			has_bounds = true
	if has_bounds:
		return AABB(minimum, maximum - minimum)
	var center := to_local(root.global_position)
	return AABB(center - Vector3(0.10, 0.02, 0.10), Vector3(0.20, 0.24, 0.20))


func _spawn_radial_burst(origin: Vector3, radius: float) -> void:
	var burst := Node3D.new()
	burst.name = "IceGolemDeathBurst"
	burst.add_to_group("ice_freeze_burst")
	add_child(burst)
	burst.global_position = origin + Vector3(0.0, 0.018, 0.0)

	var ring := MeshInstance3D.new()
	var ring_mesh := CylinderMesh.new()
	ring_mesh.top_radius = 1.0
	ring_mesh.bottom_radius = 1.0
	ring_mesh.height = 0.008
	ring_mesh.radial_segments = 48
	ring.mesh = ring_mesh
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var ring_material := StandardMaterial3D.new()
	ring_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_material.albedo_color = Color(0.28, 0.82, 1.0, 0.62)
	ring_material.emission_enabled = true
	ring_material.emission = Color(0.18, 0.72, 1.0, 1.0)
	ring_material.emission_energy_multiplier = 2.1
	ring.material_override = ring_material
	burst.add_child(ring)

	var particles := CPUParticles3D.new()
	particles.amount = 16
	particles.lifetime = 0.62
	particles.one_shot = true
	particles.explosiveness = 0.96
	particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	particles.emission_sphere_radius = maxf(0.08, radius * 0.45)
	particles.direction = Vector3.UP
	particles.spread = 72.0
	particles.initial_velocity_min = 0.18
	particles.initial_velocity_max = 0.42
	particles.gravity = Vector3(0.0, -0.46, 0.0)
	particles.scale_amount_min = 0.035
	particles.scale_amount_max = 0.075
	var flake_mesh := QuadMesh.new()
	flake_mesh.size = Vector2(0.10, 0.10)
	var flake_material := StandardMaterial3D.new()
	flake_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	flake_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	flake_material.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	flake_material.albedo_texture = SNOWFLAKE_TEXTURE
	flake_material.albedo_color = Color(0.72, 0.95, 1.0, 0.92)
	flake_mesh.material = flake_material
	particles.mesh = flake_mesh
	particles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	burst.add_child(particles)
	particles.emitting = true

	burst.scale = Vector3(0.12, 0.12, 0.12)
	var tween := burst.create_tween().set_parallel(true)
	tween.tween_property(burst, "scale", Vector3.ONE * maxf(0.1, radius), BURST_DURATION).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.tween_property(ring_material, "albedo_color", Color(0.28, 0.82, 1.0, 0.0), BURST_DURATION)
	tween.chain().tween_callback(burst.queue_free)


func _frost_key(entry: Dictionary, target: Node3D) -> String:
	var server_id := int(entry.get("server_id", -1))
	return "server:%d" % server_id if server_id >= 0 else "instance:%d" % target.get_instance_id()
