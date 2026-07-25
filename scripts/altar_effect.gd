class_name AltarEffect
extends Node3D

@export var particle_prefix: String = "Stylized_Altar_"
@export var main_mesh_name: String = "Stylized_Altar"
@export var pulse_speed: float = 4.0
@export var glitch_speed: float = 6.2
@export var float_amplitude: float = 0.018
@export var burst_amount: float = 0.55
@export var glow_alpha_multiplier: float = 2.0

var _sparks: Array[Dictionary] = []
var _ring: MeshInstance3D = null
var _ring_mat: StandardMaterial3D = null
var _time: float = 0.0
var _effect_span: float = 1.0
var _setup_attempts: int = 0

const SPARK_GLITCH_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, depth_test_disabled;

uniform vec4 glow_color : source_color = vec4(0.14, 0.86, 1.0, 0.55);
uniform float effect_time = 0.0;
uniform float phase = 0.0;
uniform float glitch = 0.0;
uniform float burst = 0.0;

varying float scan_mask;

void vertex() {
	float t = effect_time * 5.4 + phase;
	float stripe = step(0.58, fract((VERTEX.y * 24.0 + VERTEX.x * 7.0 + t) * 0.42));
	float slice = step(0.76, fract(VERTEX.y * 41.0 + t * 1.7));
	scan_mask = max(stripe, slice);
}

void fragment() {
	float flicker = 0.45 + 0.55 * sin(effect_time * 15.0 + phase);
	float scan = mix(0.3, 2.2, scan_mask);
	ALBEDO = glow_color.rgb;
	ALPHA = glow_color.a * (0.08 + glitch * 0.42 + burst * 0.32) * flicker * scan;
	EMISSION = glow_color.rgb * (1.6 + glitch * 3.1 + burst * 3.2) * scan;
}
"""

static var _spark_glitch_shader: Shader = null


func _ready() -> void:
	set_process(false)
	call_deferred("_setup")


func _setup() -> void:
	if not is_instance_valid(self):
		return
	if absf(global_transform.basis.determinant()) <= 0.000001:
		_setup_attempts += 1
		if _setup_attempts <= 3:
			call_deferred("_setup")
		return
	_setup_attempts = 0
	_sparks.clear()
	_clear_runtime_effect_nodes()

	var bounds := _compute_bounds(self)
	_effect_span = maxf(0.001, maxf(bounds.size.x, bounds.size.z))
	_collect_altar_particles()
	_create_spark_shells()
	set_process(not _sparks.is_empty() or is_instance_valid(_ring))


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
		var float_wave := sin(_time * 1.45 + phase * 1.37)
		var base_pos: Vector3 = item.get("base_pos", Vector3.ZERO)
		var base_rot: Vector3 = item.get("base_rot", Vector3.ZERO)
		var base_scale: Vector3 = item.get("base_scale", Vector3.ONE)

		node.position = base_pos + Vector3(0.0, float_wave * float_amplitude, 0.0)
		node.rotation = base_rot
		node.scale = base_scale

		var mat: ShaderMaterial = item.get("material", null)
		if mat != null:
			var shell: MeshInstance3D = item.get("shell", null)
			if is_instance_valid(shell):
				shell.transform = Transform3D.IDENTITY
			var glitch := clampf(0.18 + pulse * 0.24 + snap * 0.45 + burst * 0.25, 0.0, 0.95)
			mat.set_shader_parameter("effect_time", _time)
			mat.set_shader_parameter("glitch", glitch)
			mat.set_shader_parameter("burst", burst)
			var glow_alpha := clampf((0.22 + pulse * 0.16 + snap * 0.12 + burst * 0.08) * glow_alpha_multiplier, 0.0, 0.95)
			mat.set_shader_parameter("glow_color", Color(0.08, 0.72 + snap * 0.18, 1.0, glow_alpha))

	if is_instance_valid(_ring) and _ring_mat != null:
		var ring_pulse := 0.5 + 0.5 * sin(_time * 2.25)
		var ring_burst := pow(maxf(0.0, sin(_time * 3.0)), 10.0)
		_ring.scale = Vector3.ONE * (1.0 + ring_pulse * 0.045 + ring_burst * 0.12)
		var ring_alpha := clampf((0.14 + ring_pulse * 0.14 + ring_burst * 0.18) * glow_alpha_multiplier, 0.0, 0.75)
		_ring_mat.albedo_color = Color(0.12, 0.78, 1.0, ring_alpha)
		_ring_mat.emission_energy_multiplier = 1.0 + ring_pulse * 1.4 + ring_burst * 1.8

func _collect_altar_particles() -> void:
	for mesh_instance in _get_mesh_instances(self):
		var node_name := String(mesh_instance.name)
		if node_name == main_mesh_name:
			continue
		if node_name.begins_with(particle_prefix):
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


func _create_spark_shells() -> void:
	for i in range(_sparks.size()):
		var item: Dictionary = _sparks[i]
		var node := item.get("node", null) as MeshInstance3D
		if not is_instance_valid(node) or node.mesh == null:
			continue
		var mat := _make_spark_material()
		mat.set_shader_parameter("phase", float(item.get("phase", 0.0)))
		mat.set_shader_parameter("effect_time", _time)
		node.material_overlay = null

		var shell := MeshInstance3D.new()
		shell.name = "AltarGlitchShell_%s" % String(node.name)
		shell.mesh = node.mesh
		shell.transform = Transform3D.IDENTITY
		shell.material_override = mat
		shell.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		shell.extra_cull_margin = maxf(0.1, _effect_span * 0.2)
		shell.ignore_occlusion_culling = true
		node.add_child(shell)

		item["material"] = mat
		item["shell"] = shell
		_sparks[i] = item


func _make_spark_material() -> ShaderMaterial:
	if _spark_glitch_shader == null:
		_spark_glitch_shader = Shader.new()
		_spark_glitch_shader.code = SPARK_GLITCH_SHADER
	var mat := ShaderMaterial.new()
	mat.resource_local_to_scene = true
	mat.shader = _spark_glitch_shader
	mat.set_shader_parameter("glow_color", Color(0.12, 0.86, 1.0, 0.46))
	mat.set_shader_parameter("effect_time", _time)
	mat.set_shader_parameter("phase", 0.0)
	mat.set_shader_parameter("glitch", 0.4)
	mat.set_shader_parameter("burst", 0.0)
	mat.render_priority = 4
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


func _get_mesh_instances(node: Node) -> Array[MeshInstance3D]:
	var result: Array[MeshInstance3D] = []
	if node is MeshInstance3D:
		result.append(node as MeshInstance3D)
	for child in node.get_children():
		result.append_array(_get_mesh_instances(child))
	return result


func _compute_bounds(root_node: Node) -> AABB:
	var first := true
	var bounds := AABB()
	for mesh_instance in _get_mesh_instances(root_node):
		var node_name := String(mesh_instance.name)
		if _is_runtime_effect_node_name(node_name):
			continue
		var local_aabb := _aabb_to_self(mesh_instance, mesh_instance.get_aabb())
		if first:
			bounds = local_aabb
			first = false
		else:
			bounds = bounds.merge(local_aabb)
	return bounds


func _aabb_to_self(node: Node3D, aabb: AABB) -> AABB:
	if absf(global_transform.basis.determinant()) <= 0.000001:
		return AABB()
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


func _clear_runtime_effect_nodes() -> void:
	_clear_runtime_effect_nodes_recursive(self)
	_ring = null
	_ring_mat = null


func _clear_runtime_effect_nodes_recursive(node: Node) -> void:
	for child in node.get_children():
		var node_name := String(child.name)
		if _is_runtime_effect_node_name(node_name):
			child.queue_free()
		else:
			if child is MeshInstance3D:
				(child as MeshInstance3D).material_overlay = null
			_clear_runtime_effect_nodes_recursive(child)


func _is_runtime_effect_node_name(node_name: String) -> bool:
	return node_name.begins_with("AltarMagicRing") or node_name.begins_with("AltarGlitchStreak") or node_name.begins_with("AltarGlitchShell")
