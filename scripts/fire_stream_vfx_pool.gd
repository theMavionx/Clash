class_name FireStreamVfxPool
extends Node3D

## Persistent Flamethrower presentation using the Fire Dragon's visible breath
## profile. One emitter fills the tower's 50-degree ground damage sector: its
## centers stay inside a 17.5-degree half-angle, while the widened Dragon cards
## fill the remaining edge margin. No secondary layer or material is required.

const FIRE_BREATH_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_fire_breath.tga")
const STREAM_CORE_SHADER: Shader = preload("res://shaders/flamethrower_stream_core.gdshader")
const DRAGON_BREATH_DURATION := 0.74
const DRAGON_BREATH_WIDTH := 0.28
const DRAGON_VISUAL_WIDTH_SCALE := 0.65
const TOWER_VISUAL_WIDTH_SCALE := DRAGON_VISUAL_WIDTH_SCALE * 1.65
const TOWER_FLAME_CENTER_SPREAD_DEGREES := 17.5
const TOWER_FLAME_FLATNESS := 1.0
const TOWER_FLAME_LIFETIME_RANDOMNESS := 0.0
const TOWER_MIN_TRAVEL_SCALE := 1.0
const TOWER_MAX_TRAVEL_SCALE := 1.0
const TOWER_EMISSION_RADIUS_SCALE := 0.006
const TOWER_TAPER_START_SCALE := 0.001
const TOWER_TAPER_QUARTER_SCALE := 0.016
const TOWER_TAPER_HALF_SCALE := 0.125
const TOWER_TAPER_THREE_QUARTER_SCALE := 0.422
const TOWER_TAPER_END_SCALE := 1.0
const TOWER_FLAME_ANGLE_DEGREES := 12.0
const TOWER_FLAME_ANGULAR_VELOCITY := 22.0
const TOWER_STREAM_EXPLOSIVENESS := 0.0
const TOWER_STREAM_EMISSION_RANDOMNESS := 0.0
const TOWER_FLAME_PARTICLES := 96
const TOWER_FLAME_MIN_SCALE := 0.72
const TOWER_FLAME_MAX_SCALE := 1.0
const TOWER_CORE_RADIAL_SEGMENTS := 12
const TOWER_CORE_ANGLE_SEGMENTS := 12
const TOWER_CORE_HALF_ANGLE_DEGREES := 17.5
const TOWER_CORE_DRAIN_CUTOFF := 0.84
const TOWER_PARTICLE_DETAIL_END_FRACTION := 0.94
const DRAGON_WEB_PARTICLE_SCALE := 0.55
const DRAGON_WEB_LIFETIME_SCALE := 0.82
const DRAGON_FLAME_LIFETIME_SCALE := 0.96

var _flame_entry: Dictionary = {}
var _stream_core: MeshInstance3D = null
var _stream_core_material: ShaderMaterial = null
var _active := false
var _draining := false
var _drain_remaining := 0.0
var _drain_duration := 0.0
var _configured_travel_duration := 0.0
var _visual_length := 1.0


func _ready() -> void:
	_build_stream_core()
	_flame_entry = _make_particle_entry(
		"FireDragonFlameParticles",
		Color(1.0, 0.94, 0.24, 0.70)
	)
	_configure_particle_entries()
	_deactivate_visuals()


func configure_length(value: float) -> void:
	_visual_length = maxf(0.05, value)
	_rebuild_stream_core_mesh()
	_configure_particle_entries()


func set_stream_active(value: bool) -> void:
	if value:
		if _active:
			return
		_active = true
		_draining = false
		_drain_remaining = 0.0
		_configure_particle_entries()
		_set_stream_core_window(0.0, 1.0)
		_set_stream_core_visible(true)
		_start_or_resume_particle_entry(_flame_entry)
		return
	finish_stream()


func finish_stream() -> void:
	if not _active:
		return
	_active = false
	_draining = true
	_drain_remaining = _drain_duration
	_stop_particle_entry_emission(_flame_entry)


func interrupt(_reason: String = "") -> void:
	_active = false
	_draining = false
	_drain_remaining = 0.0
	_deactivate_visuals()


func _process(delta: float) -> void:
	if not _draining or _active:
		return
	_drain_remaining = maxf(0.0, _drain_remaining - delta)
	var drain_progress := 1.0
	if _drain_duration > 0.0:
		drain_progress = clampf(1.0 - _drain_remaining / _drain_duration, 0.0, 1.0)
	if drain_progress < TOWER_CORE_DRAIN_CUTOFF and _drain_remaining > 0.0:
		_set_stream_core_window(drain_progress, 1.0)
		return
	_draining = false
	_deactivate_visuals()


func get_pool_metrics() -> Dictionary:
	return {
		"active": _active,
		"draining": _draining,
		"emitting": _particle_emitting(_flame_entry),
		"tail_visible": _particle_visible(_flame_entry),
		"tail_duration": _drain_duration,
		"full_range_travel_duration": _configured_travel_duration,
		"particle_capacity": _particle_amount(_flame_entry),
		"persistent_nodes": get_child_count(),
		"visual_length": _visual_length,
		"fire_dragon_profile": true,
		"visual_spread_degrees": TOWER_FLAME_CENTER_SPREAD_DEGREES,
		"visual_width_scale": TOWER_VISUAL_WIDTH_SCALE,
		"visual_flatness": TOWER_FLAME_FLATNESS,
		"emission_explosiveness": TOWER_STREAM_EXPLOSIVENESS,
		"emission_randomness": TOWER_STREAM_EMISSION_RANDOMNESS,
		"lifetime_randomness": TOWER_FLAME_LIFETIME_RANDOMNESS,
		"minimum_terminal_range_fraction": TOWER_MIN_TRAVEL_SCALE * (1.0 - TOWER_FLAME_LIFETIME_RANDOMNESS),
		"velocity_aligned": true,
		"flame_particle_capacity": _particle_amount(_flame_entry),
		"minimum_particle_scale": TOWER_FLAME_MIN_SCALE,
		"outer_flame_particle_capacity": 0,
		"visible_flame_layers": 2,
		"dragon_material_profile": true,
		"attack_sector_half_angle": 25.0,
		"taper_start_scale": TOWER_TAPER_START_SCALE,
		"taper_quarter_scale": TOWER_TAPER_QUARTER_SCALE,
		"taper_half_scale": TOWER_TAPER_HALF_SCALE,
		"taper_three_quarter_scale": TOWER_TAPER_THREE_QUARTER_SCALE,
		"taper_end_scale": TOWER_TAPER_END_SCALE,
		"emission_radius_scale": TOWER_EMISSION_RADIUS_SCALE,
		"color_ramp_points": 5,
		"neutral_process_tint": true,
		"geometric_stream_core": true,
		"cohesive_stream_core": true,
		"core_half_angle_degrees": TOWER_CORE_HALF_ANGLE_DEGREES,
		"core_drain_cutoff": TOWER_CORE_DRAIN_CUTOFF,
		"particle_detail_end_fraction": TOWER_PARTICLE_DETAIL_END_FRACTION,
		"dynamic_lights": 0,
	}


func _build_stream_core() -> void:
	_stream_core = MeshInstance3D.new()
	_stream_core.name = "CohesiveFlameCore"
	_stream_core.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_stream_core.position.y = -0.035
	_stream_core_material = ShaderMaterial.new()
	_stream_core_material.shader = STREAM_CORE_SHADER
	_stream_core_material.render_priority = 1
	_stream_core.material_override = _stream_core_material
	add_child(_stream_core)
	_rebuild_stream_core_mesh()
	_set_stream_core_visible(false)


func _rebuild_stream_core_mesh() -> void:
	if not is_instance_valid(_stream_core):
		return
	var vertices := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var half_angle := deg_to_rad(TOWER_CORE_HALF_ANGLE_DEGREES)
	for radial_index in range(TOWER_CORE_RADIAL_SEGMENTS + 1):
		var distance_fraction := float(radial_index) / float(TOWER_CORE_RADIAL_SEGMENTS)
		var distance := _visual_length * distance_fraction
		for angle_index in range(TOWER_CORE_ANGLE_SEGMENTS + 1):
			var angle_fraction := float(angle_index) / float(TOWER_CORE_ANGLE_SEGMENTS)
			var angle := lerpf(-half_angle, half_angle, angle_fraction)
			vertices.append(Vector3(sin(angle) * distance, 0.0, -cos(angle) * distance))
			uvs.append(Vector2(angle_fraction, distance_fraction))
	for radial_index in range(TOWER_CORE_RADIAL_SEGMENTS):
		for angle_index in range(TOWER_CORE_ANGLE_SEGMENTS):
			var row_width := TOWER_CORE_ANGLE_SEGMENTS + 1
			var current := radial_index * row_width + angle_index
			var next_row := current + row_width
			indices.append_array(PackedInt32Array([
				current,
				next_row,
				current + 1,
				current + 1,
				next_row,
				next_row + 1,
			]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	_stream_core.mesh = mesh


func _set_stream_core_window(start_fraction: float, end_fraction: float) -> void:
	if not is_instance_valid(_stream_core_material):
		return
	_stream_core_material.set_shader_parameter("stream_start", clampf(start_fraction, 0.0, 1.0))
	_stream_core_material.set_shader_parameter("stream_end", clampf(end_fraction, 0.0, 1.0))


func _set_stream_core_visible(value: bool) -> void:
	if is_instance_valid(_stream_core):
		_stream_core.visible = value


func _make_particle_entry(node_name: String, material_color: Color) -> Dictionary:
	var mesh := QuadMesh.new()
	mesh.material = _make_fire_particle_material(material_color)
	var gradient := Gradient.new()
	gradient.set_offset(0, 0.0)
	gradient.set_color(0, Color(1.0, 0.78, 0.26, 0.82))
	gradient.set_offset(1, TOWER_PARTICLE_DETAIL_END_FRACTION)
	gradient.set_color(1, Color(0.60, 0.03, 0.0, 0.0))
	gradient.add_point(0.38, Color(1.0, 0.48, 0.06, 0.72))
	gradient.add_point(0.75, Color(0.95, 0.22, 0.015, 0.62))
	gradient.add_point(0.84, Color(0.82, 0.09, 0.005, 0.34))
	var size_curve := Curve.new()
	size_curve.min_value = 0.0
	size_curve.max_value = 1.0
	size_curve.add_point(Vector2(0.0, TOWER_TAPER_START_SCALE))
	size_curve.add_point(Vector2(0.25, TOWER_TAPER_QUARTER_SCALE))
	size_curve.add_point(Vector2(0.50, TOWER_TAPER_HALF_SCALE))
	size_curve.add_point(Vector2(0.75, TOWER_TAPER_THREE_QUARTER_SCALE))
	size_curve.add_point(Vector2(1.0, TOWER_TAPER_END_SCALE))
	for point_index in range(size_curve.get_point_count()):
		size_curve.set_point_left_mode(point_index, Curve.TANGENT_LINEAR)
		size_curve.set_point_right_mode(point_index, Curve.TANGENT_LINEAR)
	if OS.has_feature("web"):
		var cpu_particles := CPUParticles3D.new()
		cpu_particles.name = node_name
		cpu_particles.mesh = mesh
		cpu_particles.emitting = false
		add_child(cpu_particles)
		return {
			"node": cpu_particles,
			"mesh": mesh,
			"backend": "cpu",
			"gradient": gradient,
			"size_curve": size_curve,
		}
	var gpu_particles := GPUParticles3D.new()
	gpu_particles.name = node_name
	gpu_particles.draw_passes = 1
	gpu_particles.set_draw_pass_mesh(0, mesh)
	var process := ParticleProcessMaterial.new()
	gpu_particles.process_material = process
	gpu_particles.emitting = false
	add_child(gpu_particles)
	var ramp_texture := GradientTexture1D.new()
	ramp_texture.gradient = gradient
	var size_curve_texture := CurveTexture.new()
	size_curve_texture.curve = size_curve
	return {
		"node": gpu_particles,
		"mesh": mesh,
		"process": process,
		"backend": "gpu",
		"gradient": gradient,
		"ramp_texture": ramp_texture,
		"size_curve": size_curve,
		"size_curve_texture": size_curve_texture,
	}


func _configure_particle_entries() -> void:
	if _flame_entry.is_empty():
		return
	var beam_width := clampf(
		_visual_length * 0.42,
		DRAGON_BREATH_WIDTH * 0.72,
		DRAGON_BREATH_WIDTH * 1.55
	) * TOWER_VISUAL_WIDTH_SCALE
	var flame_lifetime := _effective_lifetime(DRAGON_BREATH_DURATION * DRAGON_FLAME_LIFETIME_SCALE)
	_drain_duration = flame_lifetime
	var velocity_min := maxf(0.62, _visual_length / flame_lifetime * TOWER_MIN_TRAVEL_SCALE)
	var velocity_max := maxf(0.95, _visual_length / flame_lifetime * TOWER_MAX_TRAVEL_SCALE)
	_configured_travel_duration = _visual_length / velocity_max
	_configure_particle_entry(
		_flame_entry,
		_effective_particle_amount(TOWER_FLAME_PARTICLES),
		flame_lifetime,
		false,
		Color.WHITE,
		TOWER_FLAME_CENTER_SPREAD_DEGREES,
		velocity_min,
		velocity_max,
		beam_width * TOWER_EMISSION_RADIUS_SCALE,
		Vector3.ZERO,
		TOWER_FLAME_MIN_SCALE,
		TOWER_FLAME_MAX_SCALE,
		Vector3.ZERO,
		Vector2(beam_width * 0.76, beam_width * 0.96)
	)


func _configure_particle_entry(
	entry: Dictionary,
	amount: int,
	lifetime: float,
	one_shot: bool,
	color: Color,
	spread: float,
	velocity_min: float,
	velocity_max: float,
	sphere_radius: float,
	box_extents: Vector3,
	scale_min: float,
	scale_max: float,
	origin: Vector3,
	mesh_size: Vector2
) -> void:
	var mesh := entry.get("mesh") as QuadMesh
	if mesh == null:
		return
	mesh.size = mesh_size
	if str(entry.get("backend", "")) == "cpu":
		var cpu := entry.get("node") as CPUParticles3D
		if cpu == null:
			return
		cpu.position = origin
		cpu.amount = amount
		cpu.lifetime = lifetime
		cpu.one_shot = one_shot
		cpu.explosiveness = TOWER_STREAM_EXPLOSIVENESS
		cpu.randomness = TOWER_STREAM_EMISSION_RANDOMNESS
		cpu.local_coords = true
		cpu.particle_flag_align_y = true
		cpu.direction = Vector3(0.0, 0.0, -1.0)
		cpu.color = color
		cpu.color_ramp = entry.get("gradient") as Gradient
		cpu.spread = spread
		cpu.flatness = TOWER_FLAME_FLATNESS
		cpu.gravity = Vector3.ZERO
		cpu.initial_velocity_min = velocity_min
		cpu.initial_velocity_max = velocity_max
		cpu.lifetime_randomness = TOWER_FLAME_LIFETIME_RANDOMNESS
		if box_extents.length_squared() > 0.0:
			cpu.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
			cpu.emission_box_extents = box_extents
		else:
			cpu.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
			cpu.emission_sphere_radius = sphere_radius
		cpu.scale_amount_min = scale_min
		cpu.scale_amount_max = scale_max
		cpu.scale_amount_curve = entry.get("size_curve") as Curve
		cpu.angle_min = -TOWER_FLAME_ANGLE_DEGREES
		cpu.angle_max = TOWER_FLAME_ANGLE_DEGREES
		cpu.angular_velocity_min = -TOWER_FLAME_ANGULAR_VELOCITY
		cpu.angular_velocity_max = TOWER_FLAME_ANGULAR_VELOCITY
		cpu.radial_accel_min = -0.02
		cpu.radial_accel_max = 0.10
		cpu.tangential_accel_min = -0.10
		cpu.tangential_accel_max = 0.10
		cpu.damping_min = 0.05
		cpu.damping_max = 0.16
		return
	var gpu := entry.get("node") as GPUParticles3D
	var process := entry.get("process") as ParticleProcessMaterial
	if gpu == null or process == null:
		return
	gpu.position = origin
	gpu.amount = amount
	gpu.lifetime = lifetime
	gpu.one_shot = one_shot
	gpu.explosiveness = TOWER_STREAM_EXPLOSIVENESS
	gpu.randomness = TOWER_STREAM_EMISSION_RANDOMNESS
	gpu.fixed_fps = 24
	gpu.interpolate = true
	gpu.local_coords = true
	gpu.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	gpu.visibility_aabb = AABB(
		Vector3(-_visual_length, -_visual_length, -_visual_length),
		Vector3(_visual_length * 2.0, _visual_length * 2.0, _visual_length * 2.0)
	)
	process.direction = Vector3(0.0, 0.0, -1.0)
	process.particle_flag_align_y = true
	process.color = color
	process.color_ramp = entry.get("ramp_texture") as GradientTexture1D
	process.spread = spread
	process.flatness = TOWER_FLAME_FLATNESS
	process.gravity = Vector3.ZERO
	process.initial_velocity_min = velocity_min
	process.initial_velocity_max = velocity_max
	process.lifetime_randomness = TOWER_FLAME_LIFETIME_RANDOMNESS
	if box_extents.length_squared() > 0.0:
		process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		process.emission_box_extents = box_extents
	else:
		process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		process.emission_sphere_radius = sphere_radius
	process.scale_min = scale_min
	process.scale_max = scale_max
	process.scale_curve = entry.get("size_curve_texture") as CurveTexture
	process.angle_min = -TOWER_FLAME_ANGLE_DEGREES
	process.angle_max = TOWER_FLAME_ANGLE_DEGREES
	process.angular_velocity_min = -TOWER_FLAME_ANGULAR_VELOCITY
	process.angular_velocity_max = TOWER_FLAME_ANGULAR_VELOCITY
	process.radial_accel_min = -0.02
	process.radial_accel_max = 0.10
	process.tangential_accel_min = -0.10
	process.tangential_accel_max = 0.10
	process.damping_min = 0.05
	process.damping_max = 0.16


func _start_or_resume_particle_entry(entry: Dictionary) -> void:
	var particles := entry.get("node") as Node3D
	if not is_instance_valid(particles):
		return
	if particles.visible:
		# A new combat stream may begin while the previous plume is still
		# draining. Resume the same emitter without restart so those old
		# particles can finish their flight instead of being cleared.
		particles.set("emitting", true)
		return
	particles.visible = true
	particles.set("emitting", false)
	particles.call("restart")
	# Explicitly arm one-shot emission after restart. This is required for the
	# persistent child emitter path used by buildings (unlike Dragon's top-level
	# holder, it can otherwise remain in a stopped state after the first bind).
	particles.set("emitting", true)


func _stop_particle_entry_emission(entry: Dictionary) -> void:
	var particles := entry.get("node") as Node3D
	if not is_instance_valid(particles):
		return
	particles.set("emitting", false)


func _hide_particle_entry(entry: Dictionary) -> void:
	var particles := entry.get("node") as Node3D
	if not is_instance_valid(particles):
		return
	particles.set("emitting", false)
	particles.visible = false


func _deactivate_visuals() -> void:
	_hide_particle_entry(_flame_entry)
	_set_stream_core_visible(false)


func _particle_amount(entry: Dictionary) -> int:
	var particles := entry.get("node") as Node
	if not is_instance_valid(particles):
		return 0
	return int(particles.get("amount"))


func _particle_emitting(entry: Dictionary) -> bool:
	var particles := entry.get("node") as Node
	return is_instance_valid(particles) and bool(particles.get("emitting"))


func _particle_visible(entry: Dictionary) -> bool:
	var particles := entry.get("node") as Node3D
	return is_instance_valid(particles) and particles.visible


func _effective_particle_amount(base_amount: int) -> int:
	if OS.has_feature("web"):
		return maxi(8, int(ceil(float(base_amount) * DRAGON_WEB_PARTICLE_SCALE)))
	return base_amount


func _effective_lifetime(base_lifetime: float) -> float:
	if OS.has_feature("web"):
		return base_lifetime * DRAGON_WEB_LIFETIME_SCALE
	return base_lifetime


func _make_fire_particle_material(material_color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.no_depth_test = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.vertex_color_use_as_albedo = true
	material.albedo_texture = FIRE_BREATH_TEXTURE
	material.albedo_color = material_color
	return material
