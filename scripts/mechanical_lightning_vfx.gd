extends Node3D
## Batched, short-lived chain-lightning arc used by Mechanical Dragon.
## Each visual layer is one ArrayMesh, so the richer bolt remains practical
## in the WebGL compatibility renderer.

const LIFETIME: float = 0.22
const MAIN_SEGMENTS: int = 8
const BRANCH_SEGMENTS: int = 3
const PATH_VARIANTS: int = 2
const FLICKER_INTERVAL: float = 0.045

static var _outer_material: StandardMaterial3D = null
static var _bolt_material: StandardMaterial3D = null
static var _core_material: StandardMaterial3D = null
static var _impact_glow_mesh: SphereMesh = null
static var _impact_core_mesh: SphereMesh = null
static var _impact_ring_mesh: TorusMesh = null
static var _spark_mesh: SphereMesh = null

var _elapsed: float = 0.0
var _current_variant: int = -1
var _variant_meshes: Array[ArrayMesh] = []
var _outer: MeshInstance3D = null
var _bolt: MeshInstance3D = null
var _core: MeshInstance3D = null
var _impact_glow: MeshInstance3D = null
var _impact_core: MeshInstance3D = null
var _impact_ring: MeshInstance3D = null


func setup(
	world_start: Vector3,
	world_finish: Vector3,
	jump_index: int,
	lifetime_override: float = LIFETIME
) -> void:
	add_to_group("mechanical_lightning_vfx")
	add_to_group("combat_ephemeral_vfx")
	global_position = world_start
	var local_finish: Vector3 = to_local(world_finish)
	if local_finish.length_squared() <= 0.000001:
		local_finish = Vector3(0.08, 0.01, 0.0)

	for variant_index in range(PATH_VARIANTS):
		var paths: Array[PackedVector3Array] = _build_paths(
			local_finish,
			jump_index,
			variant_index
		)
		_variant_meshes.append_array([
			_build_ribbon_mesh(paths, 0.026),
			_build_ribbon_mesh(paths, 0.012),
			_build_ribbon_mesh(paths, 0.004),
		])

	_outer = _add_layer("LightningOuterGlow", _outer_material_ref())
	_bolt = _add_layer("LightningBolt", _bolt_material_ref())
	_core = _add_layer("LightningCore", _core_material_ref())
	_add_impact(local_finish)
	_add_sparks(local_finish)
	_set_variant(0)
	set_meta("lifetime", maxf(lifetime_override, 0.06))
	set_process(true)


func _process(delta: float) -> void:
	_elapsed += minf(delta, 0.05)
	var lifetime: float = float(get_meta("lifetime", LIFETIME))
	var ratio: float = clampf(_elapsed / lifetime, 0.0, 1.0)
	var variant_index: int = mini(
		int(floor(_elapsed / FLICKER_INTERVAL)) % PATH_VARIANTS,
		PATH_VARIANTS - 1
	)
	_set_variant(variant_index)

	var fade: float = clampf((ratio - 0.62) / 0.38, 0.0, 1.0)
	for layer in [_outer, _bolt, _core]:
		if is_instance_valid(layer):
			layer.transparency = fade

	if is_instance_valid(_impact_glow):
		var glow_scale: float = lerpf(0.72, 1.34, ratio)
		_impact_glow.scale = Vector3.ONE * glow_scale
		_impact_glow.transparency = fade
	if is_instance_valid(_impact_core):
		var pulse: float = 0.92 + sin(ratio * PI * 5.0) * 0.12
		_impact_core.scale = Vector3.ONE * pulse
		_impact_core.transparency = fade
	if is_instance_valid(_impact_ring):
		var ring_scale: float = lerpf(0.38, 1.82, ratio)
		_impact_ring.scale = Vector3.ONE * ring_scale
		_impact_ring.rotation.y = ratio * 0.8
		_impact_ring.transparency = clampf((ratio - 0.38) / 0.62, 0.0, 1.0)

	if _elapsed >= lifetime:
		queue_free()


func _build_paths(
	finish: Vector3,
	jump_index: int,
	variant_index: int
) -> Array[PackedVector3Array]:
	var paths: Array[PackedVector3Array] = []
	var direction: Vector3 = finish
	var length: float = maxf(direction.length(), 0.001)
	var forward: Vector3 = direction / length
	var side: Vector3 = forward.cross(Vector3.UP)
	if side.length_squared() <= 0.0001:
		side = Vector3.RIGHT
	side = side.normalized()
	var lift: Vector3 = side.cross(forward).normalized()
	var amplitude: float = clampf(length * 0.065, 0.018, 0.062)
	var seed: float = float(jump_index * 37 + variant_index * 71 + 11)

	var main_path := PackedVector3Array()
	for point_index in range(MAIN_SEGMENTS + 1):
		var t: float = float(point_index) / float(MAIN_SEGMENTS)
		var point: Vector3 = finish * t
		if point_index > 0 and point_index < MAIN_SEGMENTS:
			var envelope: float = sin(t * PI)
			var lateral: float = (
				sin(seed + float(point_index) * 2.31)
				+ sin(seed * 0.37 + float(point_index) * 5.17) * 0.42
			)
			var vertical: float = cos(seed * 0.61 + float(point_index) * 3.73)
			point += side * lateral * amplitude * envelope
			point += lift * vertical * amplitude * 0.56 * envelope
		main_path.append(point)
	paths.append(main_path)

	for branch_index in range(2):
		var anchor_index: int = 3 + branch_index * 2
		if anchor_index >= main_path.size() - 1:
			continue
		var branch_path := PackedVector3Array()
		var branch_start: Vector3 = main_path[anchor_index]
		var branch_sign: float = -1.0 if (branch_index + variant_index) % 2 == 0 else 1.0
		var branch_length: float = length * (0.13 + float(branch_index) * 0.035)
		var branch_end: Vector3 = (
			branch_start
			+ forward * branch_length * 0.58
			+ side * branch_sign * branch_length
			+ lift * branch_length * (0.35 + float(variant_index) * 0.12)
		)
		for branch_point_index in range(BRANCH_SEGMENTS + 1):
			var branch_t: float = float(branch_point_index) / float(BRANCH_SEGMENTS)
			var branch_point: Vector3 = branch_start.lerp(branch_end, branch_t)
			if branch_point_index > 0 and branch_point_index < BRANCH_SEGMENTS:
				var branch_envelope: float = sin(branch_t * PI)
				branch_point += side * sin(
					seed + float(branch_index * 19 + branch_point_index * 13)
				) * amplitude * 0.42 * branch_envelope
				branch_point += lift * cos(
					seed + float(branch_index * 11 + branch_point_index * 7)
				) * amplitude * 0.28 * branch_envelope
			branch_path.append(branch_point)
		paths.append(branch_path)
	return paths


func _build_ribbon_mesh(paths: Array[PackedVector3Array], width: float) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for path in paths:
		for point_index in range(path.size() - 1):
			var start: Vector3 = path[point_index]
			var finish: Vector3 = path[point_index + 1]
			var direction: Vector3 = finish - start
			if direction.length_squared() <= 0.000001:
				continue
			var tangent: Vector3 = direction.normalized()
			var side: Vector3 = tangent.cross(Vector3.UP)
			if side.length_squared() <= 0.0001:
				side = Vector3.RIGHT
			side = side.normalized()
			var cross_side: Vector3 = tangent.cross(side).normalized()
			_add_ribbon_quad(surface, start, finish, side * width)
			_add_ribbon_quad(surface, start, finish, cross_side * width)
	return surface.commit()


func _add_ribbon_quad(
	surface: SurfaceTool,
	start: Vector3,
	finish: Vector3,
	offset: Vector3
) -> void:
	surface.set_normal(Vector3.UP)
	surface.add_vertex(start - offset)
	surface.set_normal(Vector3.UP)
	surface.add_vertex(finish - offset)
	surface.set_normal(Vector3.UP)
	surface.add_vertex(finish + offset)
	surface.set_normal(Vector3.UP)
	surface.add_vertex(start - offset)
	surface.set_normal(Vector3.UP)
	surface.add_vertex(finish + offset)
	surface.set_normal(Vector3.UP)
	surface.add_vertex(start + offset)


func _add_layer(layer_name: String, material: Material) -> MeshInstance3D:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = layer_name
	mesh_instance.material_override = material
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mesh_instance)
	return mesh_instance


func _set_variant(variant_index: int) -> void:
	if variant_index == _current_variant:
		return
	_current_variant = variant_index
	var offset: int = variant_index * 3
	if is_instance_valid(_outer):
		_outer.mesh = _variant_meshes[offset]
	if is_instance_valid(_bolt):
		_bolt.mesh = _variant_meshes[offset + 1]
	if is_instance_valid(_core):
		_core.mesh = _variant_meshes[offset + 2]


func _add_impact(impact_position: Vector3) -> void:
	_impact_glow = MeshInstance3D.new()
	_impact_glow.name = "LightningImpactGlow"
	_impact_glow.mesh = _impact_glow_mesh_ref()
	_impact_glow.material_override = _outer_material_ref()
	_impact_glow.position = impact_position
	_impact_glow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_impact_glow)

	_impact_core = MeshInstance3D.new()
	_impact_core.name = "LightningImpactCore"
	_impact_core.mesh = _impact_core_mesh_ref()
	_impact_core.material_override = _core_material_ref()
	_impact_core.position = impact_position
	_impact_core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_impact_core)

	_impact_ring = MeshInstance3D.new()
	_impact_ring.name = "LightningImpactRing"
	_impact_ring.mesh = _impact_ring_mesh_ref()
	_impact_ring.material_override = _bolt_material_ref()
	_impact_ring.position = impact_position
	_impact_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(_impact_ring)


func _add_sparks(impact_position: Vector3) -> void:
	var sparks := CPUParticles3D.new()
	sparks.name = "LightningImpactSparks"
	sparks.amount = 10
	sparks.lifetime = 0.18
	sparks.one_shot = true
	sparks.explosiveness = 1.0
	sparks.randomness = 0.62
	sparks.local_coords = true
	sparks.direction = Vector3.UP
	sparks.spread = 180.0
	sparks.gravity = Vector3(0.0, -0.16, 0.0)
	sparks.initial_velocity_min = 0.12
	sparks.initial_velocity_max = 0.28
	sparks.scale_amount_min = 0.45
	sparks.scale_amount_max = 1.0
	sparks.position = impact_position
	sparks.mesh = _spark_mesh_ref()
	add_child(sparks)
	sparks.restart()


static func _impact_glow_mesh_ref() -> SphereMesh:
	if _impact_glow_mesh == null:
		_impact_glow_mesh = SphereMesh.new()
		_impact_glow_mesh.radius = 0.055
		_impact_glow_mesh.height = 0.11
		_impact_glow_mesh.radial_segments = 10
		_impact_glow_mesh.rings = 5
	return _impact_glow_mesh


static func _impact_core_mesh_ref() -> SphereMesh:
	if _impact_core_mesh == null:
		_impact_core_mesh = SphereMesh.new()
		_impact_core_mesh.radius = 0.026
		_impact_core_mesh.height = 0.052
		_impact_core_mesh.radial_segments = 8
		_impact_core_mesh.rings = 4
	return _impact_core_mesh


static func _impact_ring_mesh_ref() -> TorusMesh:
	if _impact_ring_mesh == null:
		_impact_ring_mesh = TorusMesh.new()
		_impact_ring_mesh.inner_radius = 0.030
		_impact_ring_mesh.outer_radius = 0.044
		_impact_ring_mesh.rings = 12
		_impact_ring_mesh.ring_segments = 6
	return _impact_ring_mesh


static func _spark_mesh_ref() -> SphereMesh:
	if _spark_mesh == null:
		_spark_mesh = SphereMesh.new()
		_spark_mesh.radius = 0.006
		_spark_mesh.height = 0.018
		_spark_mesh.radial_segments = 5
		_spark_mesh.rings = 2
		_spark_mesh.material = _core_material_ref()
	return _spark_mesh


static func _outer_material_ref() -> StandardMaterial3D:
	if _outer_material == null:
		_outer_material = _make_material(
			Color(0.04, 0.42, 1.0, 0.17),
			Color(0.02, 0.36, 1.0),
			1.8
		)
	return _outer_material


static func _bolt_material_ref() -> StandardMaterial3D:
	if _bolt_material == null:
		_bolt_material = _make_material(
			Color(0.10, 0.74, 1.0, 0.58),
			Color(0.05, 0.68, 1.0),
			2.8
		)
	return _bolt_material


static func _core_material_ref() -> StandardMaterial3D:
	if _core_material == null:
		_core_material = _make_material(
			Color(0.80, 0.98, 1.0, 0.84),
			Color(0.62, 0.94, 1.0),
			4.2
		)
	return _core_material


static func _make_material(
	albedo: Color,
	emission_color: Color,
	emission_energy: float
) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.no_depth_test = false
	material.albedo_color = albedo
	material.emission_enabled = true
	material.emission = emission_color
	material.emission_energy_multiplier = emission_energy
	return material
