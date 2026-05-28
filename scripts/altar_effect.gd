class_name AltarEffect
extends Node3D

@export var pulse_speed: float = 4.0
@export var glitch_speed: float = 6.2
@export var stretch_amount: float = 0.025
@export var bend_amount: float = 0.012
@export var burst_amount: float = 0.55
@export var streak_count: int = 6

var _sparks: Array[Dictionary] = []
var _streaks: Array[Dictionary] = []
var _ring: MeshInstance3D = null
var _ring_mat: StandardMaterial3D = null
var _time: float = 0.0
var _effect_span: float = 1.0

const SPARK_GLITCH_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled;

uniform vec4 glow_color : source_color = vec4(0.14, 0.86, 1.0, 0.55);
uniform float phase = 0.0;
uniform float glitch = 0.0;
uniform float stretch = 0.0;
uniform float bend = 0.0;
uniform float burst = 0.0;

varying float scan_mask;

void vertex() {
	float t = TIME * 5.4 + phase;
	float stripe = step(0.58, fract((VERTEX.y * 24.0 + VERTEX.x * 7.0 + t) * 0.42));
	float slice = step(0.76, fract(VERTEX.y * 41.0 + t * 1.7));
	vec3 radial = normalize(vec3(VERTEX.x + 0.0001, VERTEX.y * 0.18 + 0.0001, VERTEX.z + 0.0001));
	VERTEX += radial * (stripe * stretch * glitch + burst * stretch * 0.95);
	VERTEX += NORMAL * sin(t * 2.4 + VERTEX.y * 32.0 + VERTEX.x * 11.0) * bend * (glitch + burst);
	VERTEX.x += sin(t * 8.0 + VERTEX.y * 43.0) * bend * 1.3 * (glitch + slice * burst);
	VERTEX.z += cos(t * 6.0 + VERTEX.x * 37.0) * bend * 0.9 * slice * burst;
	scan_mask = max(stripe, slice);
}

void fragment() {
	float flicker = 0.45 + 0.55 * sin(TIME * 15.0 + phase);
	float scan = mix(0.55, 1.45, scan_mask);
	ALBEDO = glow_color.rgb;
	ALPHA = glow_color.a * (0.18 + glitch * 0.34 + burst * 0.22) * flicker * scan;
	EMISSION = glow_color.rgb * (1.2 + glitch * 2.2 + burst * 2.4) * scan;
}
"""

static var _spark_glitch_shader: Shader = null


func _ready() -> void:
	set_process(false)
	call_deferred("_setup")


func _setup() -> void:
	if not is_instance_valid(self):
		return
	_sparks.clear()
	_streaks.clear()
	var bounds := _compute_bounds(self)
	_effect_span = maxf(0.001, maxf(bounds.size.x, bounds.size.z))

	_collect_named_sparks(self, bounds)
	if _sparks.is_empty():
		_collect_small_spark_meshes(self, bounds)

	_apply_spark_overlays()
	_create_magic_ring(bounds)
	_create_glitch_streaks(bounds)
	set_process(not _sparks.is_empty() or not _streaks.is_empty() or is_instance_valid(_ring))


func _process(delta: float) -> void:
	_time += delta
	for i in range(_sparks.size()):
		var item: Dictionary = _sparks[i]
		var node: Node3D = item.get("node", null)
		if not is_instance_valid(node):
			continue
		var phase: float = float(item.get("phase", 0.0))
		var pulse: float = 0.5 + 0.5 * sin(_time * pulse_speed + phase)
		var snap: float = pow(maxf(0.0, sin(_time * glitch_speed + phase)), 6.0)
		var burst: float = pow(maxf(0.0, sin(_time * (glitch_speed * 0.47) + phase * 1.9)), 14.0) * burst_amount
		var base_pos: Vector3 = item.get("base_pos", Vector3.ZERO)
		var base_rot: Vector3 = item.get("base_rot", Vector3.ZERO)
		var base_scale: Vector3 = item.get("base_scale", Vector3.ONE)

		node.position = base_pos
		node.rotation = base_rot
		node.scale = base_scale

		var mat: ShaderMaterial = item.get("material", null)
		if mat != null:
			var glitch := clampf(0.18 + pulse * 0.24 + snap * 0.45 + burst * 0.25, 0.0, 0.95)
			mat.set_shader_parameter("glitch", glitch)
			mat.set_shader_parameter("stretch", _effect_span * stretch_amount * (0.45 + snap + burst * 0.65))
			mat.set_shader_parameter("bend", _effect_span * bend_amount * (0.55 + pulse + burst * 0.55))
			mat.set_shader_parameter("burst", burst)
			mat.set_shader_parameter("glow_color", Color(0.08, 0.72 + snap * 0.18, 1.0, 0.22 + pulse * 0.16 + snap * 0.12 + burst * 0.08))

	if is_instance_valid(_ring) and _ring_mat != null:
		var ring_pulse := 0.5 + 0.5 * sin(_time * 2.25)
		var ring_burst := pow(maxf(0.0, sin(_time * 3.0)), 10.0)
		_ring.scale = Vector3.ONE * (1.0 + ring_pulse * 0.045 + ring_burst * 0.12)
		_ring_mat.albedo_color = Color(0.12, 0.78, 1.0, 0.14 + ring_pulse * 0.14 + ring_burst * 0.18)
		_ring_mat.emission_energy_multiplier = 1.0 + ring_pulse * 1.4 + ring_burst * 1.8

	for i in range(_streaks.size()):
		var streak: Dictionary = _streaks[i]
		var node: MeshInstance3D = streak.get("node", null)
		var mat: StandardMaterial3D = streak.get("material", null)
		if not is_instance_valid(node) or mat == null:
			continue
		var phase: float = float(streak.get("phase", 0.0))
		var burst := pow(maxf(0.0, sin(_time * 4.4 + phase)), 12.0)
		var flicker := 0.35 + 0.65 * maxf(0.0, sin(_time * 17.0 + phase * 2.0))
		node.scale = Vector3.ONE * (0.92 + burst * 0.24)
		mat.albedo_color = Color(0.1, 0.84, 1.0, (0.035 + burst * 0.34) * flicker)
		mat.emission_energy_multiplier = 1.2 + burst * 2.8


func _collect_named_sparks(root: Node, bounds: AABB) -> void:
	var max_span := maxf(0.001, maxf(bounds.size.x, bounds.size.z))
	for child in root.get_children():
		if child is Node3D:
			var node := child as Node3D
			var node_name := String(node.name)
			if node_name.begins_with("Stylized_Altar.") and _contains_mesh(node) and _node_span(node) <= max_span * 0.42:
				_add_spark(node)
				continue
		_collect_named_sparks(child, bounds)


func _collect_small_spark_meshes(root: Node, bounds: AABB) -> void:
	var max_span := maxf(0.001, maxf(bounds.size.x, bounds.size.z))
	var upper_y := bounds.position.y + bounds.size.y * 0.42
	for mesh_instance in _get_mesh_instances(root):
		var local_aabb := _aabb_to_self(mesh_instance, mesh_instance.get_aabb())
		var span := maxf(local_aabb.size.x, maxf(local_aabb.size.y, local_aabb.size.z))
		var center := local_aabb.get_center()
		if center.y >= upper_y and span <= max_span * 0.11 and _mesh_vertex_count(mesh_instance.mesh) <= 96:
			_add_spark(mesh_instance)


func _add_spark(node: Node3D) -> void:
	for item in _sparks:
		if item.get("node", null) == node:
			return
	var idx := _sparks.size()
	var phase := float(idx) * 1.173
	_sparks.append({
		"node": node,
		"base_pos": node.position,
		"base_rot": node.rotation,
		"base_scale": node.scale,
		"phase": phase,
	})


func _apply_spark_overlays() -> void:
	for i in range(_sparks.size()):
		var item: Dictionary = _sparks[i]
		var node: Node3D = item.get("node", null)
		if not is_instance_valid(node):
			continue
		var mat := _make_spark_material()
		mat.set_shader_parameter("phase", float(item.get("phase", 0.0)))
		for mesh_instance in _get_mesh_instances(node):
			mesh_instance.material_overlay = mat
		item["material"] = mat
		_sparks[i] = item


func _make_spark_material() -> ShaderMaterial:
	if _spark_glitch_shader == null:
		_spark_glitch_shader = Shader.new()
		_spark_glitch_shader.code = SPARK_GLITCH_SHADER
	var mat := ShaderMaterial.new()
	mat.shader = _spark_glitch_shader
	mat.set_shader_parameter("glow_color", Color(0.12, 0.86, 1.0, 0.46))
	mat.set_shader_parameter("phase", 0.0)
	mat.set_shader_parameter("glitch", 0.4)
	mat.set_shader_parameter("stretch", _effect_span * stretch_amount)
	mat.set_shader_parameter("bend", _effect_span * bend_amount)
	mat.set_shader_parameter("burst", 0.0)
	return mat


func _create_magic_ring(bounds: AABB) -> void:
	if bounds.size == Vector3.ZERO:
		return
	var radius := maxf(bounds.size.x, bounds.size.z) * 0.58
	if radius <= 0.001:
		return
	var center := bounds.get_center()
	var y := bounds.position.y + bounds.size.y * 0.055
	_ring = MeshInstance3D.new()
	_ring.name = "AltarMagicRing"
	_ring.mesh = _make_dashed_ring_mesh(Vector3(center.x, y, center.z), radius, maxf(radius * 0.035, 0.01), 48)
	_ring_mat = _make_ring_material()
	_ring_mat.albedo_color = Color(0.18, 0.85, 1.0, 0.24)
	_ring.material_override = _ring_mat
	add_child(_ring)


func _create_glitch_streaks(bounds: AABB) -> void:
	if bounds.size == Vector3.ZERO:
		return
	var center := bounds.get_center()
	var radius := maxf(bounds.size.x, bounds.size.z) * 0.55
	var y := bounds.position.y + bounds.size.y * 0.58
	var count := maxi(0, streak_count)
	for i in range(count):
		var angle := TAU * float(i) / float(maxi(1, count)) + (0.24 if i % 2 == 0 else -0.18)
		var length := radius * (0.45 + float(i % 3) * 0.12)
		var width := maxf(radius * 0.025, 0.008)
		var offset := radius * (0.55 + float(i % 4) * 0.075)
		var streak := MeshInstance3D.new()
		streak.name = "AltarGlitchStreak%02d" % i
		streak.mesh = _make_streak_mesh(Vector3(center.x, y + sin(float(i)) * bounds.size.y * 0.16, center.z), angle, offset, length, width)
		var mat := _make_streak_material()
		streak.material_override = mat
		streak.visible = true
		add_child(streak)
		_streaks.append({
			"node": streak,
			"material": mat,
			"phase": float(i) * 0.91,
		})


func _make_streak_mesh(center: Vector3, angle: float, offset: float, length: float, width: float) -> ImmediateMesh:
	var dir := Vector3(cos(angle), 0.0, sin(angle))
	var side := Vector3(-dir.z, 0.0, dir.x)
	var mid := center + dir * offset
	var p0 := mid - dir * length * 0.5 - side * width
	var p1 := mid + dir * length * 0.5 - side * width * 0.35
	var p2 := mid + dir * length * 0.5 + side * width * 0.35
	var p3 := mid - dir * length * 0.5 + side * width
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	mesh.surface_add_vertex(p0)
	mesh.surface_add_vertex(p1)
	mesh.surface_add_vertex(p2)
	mesh.surface_add_vertex(p0)
	mesh.surface_add_vertex(p2)
	mesh.surface_add_vertex(p3)
	mesh.surface_end()
	return mesh


func _make_streak_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.albedo_color = Color(0.1, 0.84, 1.0, 0.2)
	mat.emission_enabled = true
	mat.emission = Color(0.1, 0.82, 1.0)
	mat.emission_energy_multiplier = 2.0
	mat.render_priority = 4
	return mat


func _make_ring_material() -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.albedo_color = Color(0.18, 0.85, 1.0, 0.24)
	mat.emission_enabled = true
	mat.emission = Color(0.18, 0.8, 1.0)
	mat.emission_energy_multiplier = 1.4
	mat.render_priority = 3
	return mat


func _make_dashed_ring_mesh(center: Vector3, radius: float, width: float, segments: int) -> ImmediateMesh:
	var mesh := ImmediateMesh.new()
	var inner := maxf(0.001, radius - width)
	var outer := radius + width
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(segments):
		if i % 3 == 2:
			continue
		var a0 := TAU * float(i) / float(segments)
		var a1 := TAU * float(i + 1) / float(segments)
		var p0 := center + Vector3(cos(a0) * inner, 0.0, sin(a0) * inner)
		var p1 := center + Vector3(cos(a0) * outer, 0.0, sin(a0) * outer)
		var p2 := center + Vector3(cos(a1) * outer, 0.0, sin(a1) * outer)
		var p3 := center + Vector3(cos(a1) * inner, 0.0, sin(a1) * inner)
		mesh.surface_add_vertex(p0)
		mesh.surface_add_vertex(p1)
		mesh.surface_add_vertex(p2)
		mesh.surface_add_vertex(p0)
		mesh.surface_add_vertex(p2)
		mesh.surface_add_vertex(p3)
	mesh.surface_end()
	return mesh


func _contains_mesh(node: Node) -> bool:
	if node is MeshInstance3D:
		return true
	for child in node.get_children():
		if _contains_mesh(child):
			return true
	return false


func _node_span(node: Node3D) -> float:
	var first := true
	var bounds := AABB()
	for mesh_instance in _get_mesh_instances(node):
		var local_aabb := _aabb_to_self(mesh_instance, mesh_instance.get_aabb())
		if first:
			bounds = local_aabb
			first = false
		else:
			bounds = bounds.merge(local_aabb)
	return maxf(bounds.size.x, maxf(bounds.size.y, bounds.size.z))


func _get_mesh_instances(node: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if node is MeshInstance3D:
		result.append(node as MeshInstance3D)
	for child in node.get_children():
		result.append_array(_get_mesh_instances(child))
	return result


func _compute_bounds(root: Node) -> AABB:
	var first := true
	var bounds := AABB()
	for mesh_instance in _get_mesh_instances(root):
		var local_aabb := _aabb_to_self(mesh_instance, mesh_instance.get_aabb())
		if first:
			bounds = local_aabb
			first = false
		else:
			bounds = bounds.merge(local_aabb)
	return bounds


func _aabb_to_self(node: Node3D, aabb: AABB) -> AABB:
	var xform := global_transform.affine_inverse() * node.global_transform
	var first := true
	var out := AABB()
	for i in range(8):
		var point := xform * aabb.get_endpoint(i)
		if first:
			out = AABB(point, Vector3.ZERO)
			first = false
		else:
			out = out.expand(point)
	return out


func _mesh_vertex_count(mesh: Mesh) -> int:
	if mesh == null:
		return 0
	if not (mesh is ArrayMesh):
		return mesh.get_faces().size()
	var total := 0
	var array_mesh := mesh as ArrayMesh
	for i in range(mesh.get_surface_count()):
		var arrays := array_mesh.surface_get_arrays(i)
		var vertices: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		total += vertices.size()
	return total
