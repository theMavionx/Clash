class_name FireStreamVfxPool
extends Node3D

## Persistent Flamethrower presentation using the same particle profile as the
## Fire Dragon breath. The tower owns one instance for its whole lifetime; a
## stream only restarts pooled particle nodes and never allocates shot nodes.

const FIRE_BREATH_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_fire_breath.tga")
const DRAGON_BREATH_DURATION := 0.74
const DRAGON_BREATH_WIDTH := 0.28
const DRAGON_VISUAL_WIDTH_SCALE := 0.65
const DRAGON_FLAME_PARTICLES := 46
const DRAGON_TRAIL_PARTICLES := 16
const DRAGON_WEB_PARTICLE_SCALE := 0.55
const DRAGON_WEB_LIFETIME_SCALE := 0.82
const DRAGON_FLAME_LIFETIME_SCALE := 0.96
const DRAGON_TRAIL_LIFETIME_SCALE := 0.56

var _flame_entry: Dictionary = {}
var _trail_entry: Dictionary = {}
var _active := false
var _visual_length := 1.0


func _ready() -> void:
	_flame_entry = _make_particle_entry(
		"FireDragonFlameParticles",
		Color(1.0, 0.94, 0.24, 0.70)
	)
	_trail_entry = _make_particle_entry(
		"FireDragonTrailParticles",
		Color(1.0, 0.82, 0.14, 0.46)
	)
	_configure_particle_entries()
	_deactivate_visuals()


func configure_length(value: float) -> void:
	_visual_length = maxf(0.05, value)
	_configure_particle_entries()


func set_stream_active(value: bool) -> void:
	if value:
		if _active:
			return
		_active = true
		_configure_particle_entries()
		_restart_particle_entry(_flame_entry)
		# Fire Dragon currently keeps its secondary trail pooled but hidden. Keep
		# that exact presentation profile instead of adding a different tail.
		_hide_particle_entry(_trail_entry)
		return
	_active = false
	_deactivate_visuals()


func interrupt(_reason: String = "") -> void:
	set_stream_active(false)


func get_pool_metrics() -> Dictionary:
	return {
		"active": _active,
		"particle_capacity": _particle_amount(_flame_entry) + _particle_amount(_trail_entry),
		"persistent_nodes": get_child_count(),
		"visual_length": _visual_length,
		"fire_dragon_profile": true,
		"geometric_stream_core": false,
		"dynamic_lights": 0,
	}


func _make_particle_entry(node_name: String, color: Color) -> Dictionary:
	var mesh := QuadMesh.new()
	mesh.material = _make_fire_particle_material(color)
	var gradient := Gradient.new()
	gradient.set_offset(0, 0.0)
	gradient.set_color(0, Color(1.0, 0.92, 0.22, 0.84))
	gradient.set_offset(1, 1.0)
	gradient.set_color(1, Color(1.0, 0.92, 0.22, 0.0))
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
	return {
		"node": gpu_particles,
		"mesh": mesh,
		"process": process,
		"backend": "gpu",
		"gradient": gradient,
		"ramp_texture": ramp_texture,
	}


func _configure_particle_entries() -> void:
	if _flame_entry.is_empty() or _trail_entry.is_empty():
		return
	var beam_width := clampf(
		_visual_length * 0.42,
		DRAGON_BREATH_WIDTH * 0.72,
		DRAGON_BREATH_WIDTH * 1.55
	) * DRAGON_VISUAL_WIDTH_SCALE
	var velocity_min := maxf(0.62, _visual_length / DRAGON_BREATH_DURATION * 0.82)
	var velocity_max := maxf(0.95, _visual_length / DRAGON_BREATH_DURATION * 1.12)
	_configure_particle_entry(
		_flame_entry,
		_effective_particle_amount(DRAGON_FLAME_PARTICLES),
		_effective_lifetime(DRAGON_BREATH_DURATION * DRAGON_FLAME_LIFETIME_SCALE),
		false,
		Color(1.0, 0.92, 0.22, 0.84),
		5.2,
		velocity_min,
		velocity_max,
		beam_width * 0.045,
		Vector3.ZERO,
		0.32,
		1.00,
		Vector3.ZERO,
		Vector2(beam_width * 0.76, beam_width * 0.96)
	)
	_configure_particle_entry(
		_trail_entry,
		_effective_particle_amount(DRAGON_TRAIL_PARTICLES),
		_effective_lifetime(DRAGON_BREATH_DURATION * DRAGON_TRAIL_LIFETIME_SCALE),
		true,
		Color(1.0, 0.84, 0.14, 0.40),
		10.0,
		0.26,
		0.50,
		0.0,
		Vector3(beam_width * 0.14, beam_width * 0.10, _visual_length * 0.34),
		0.24,
		0.70,
		Vector3(0.0, 0.0, -_visual_length * 0.64),
		Vector2(beam_width * 0.58, beam_width * 0.54)
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
		cpu.explosiveness = 0.48
		cpu.randomness = 0.62
		cpu.local_coords = true
		cpu.direction = Vector3(0.0, 0.0, -1.0)
		cpu.color = color
		cpu.color_ramp = entry.get("gradient") as Gradient
		cpu.spread = spread
		cpu.gravity = Vector3.ZERO
		cpu.initial_velocity_min = velocity_min
		cpu.initial_velocity_max = velocity_max
		cpu.lifetime_randomness = 0.28
		if box_extents.length_squared() > 0.0:
			cpu.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
			cpu.emission_box_extents = box_extents
		else:
			cpu.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
			cpu.emission_sphere_radius = sphere_radius
		cpu.scale_amount_min = scale_min
		cpu.scale_amount_max = scale_max
		cpu.angle_min = -100.0
		cpu.angle_max = 100.0
		cpu.angular_velocity_min = -110.0
		cpu.angular_velocity_max = 110.0
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
	gpu.explosiveness = 0.48
	gpu.randomness = 0.62
	gpu.fixed_fps = 24
	gpu.fract_delta = true
	gpu.interpolate = true
	gpu.local_coords = true
	gpu.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	gpu.visibility_aabb = AABB(
		Vector3(-_visual_length, -_visual_length, -_visual_length),
		Vector3(_visual_length * 2.0, _visual_length * 2.0, _visual_length * 2.0)
	)
	process.direction = Vector3(0.0, 0.0, -1.0)
	process.color = color
	process.color_ramp = entry.get("ramp_texture") as GradientTexture1D
	process.spread = spread
	process.gravity = Vector3.ZERO
	process.initial_velocity_min = velocity_min
	process.initial_velocity_max = velocity_max
	process.lifetime_randomness = 0.28
	if box_extents.length_squared() > 0.0:
		process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		process.emission_box_extents = box_extents
	else:
		process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
		process.emission_sphere_radius = sphere_radius
	process.scale_min = scale_min
	process.scale_max = scale_max
	process.angle_min = -100.0
	process.angle_max = 100.0
	process.angular_velocity_min = -110.0
	process.angular_velocity_max = 110.0
	process.radial_accel_min = -0.02
	process.radial_accel_max = 0.10
	process.tangential_accel_min = -0.10
	process.tangential_accel_max = 0.10
	process.damping_min = 0.05
	process.damping_max = 0.16


func _restart_particle_entry(entry: Dictionary) -> void:
	var particles := entry.get("node") as Node3D
	if not is_instance_valid(particles):
		return
	particles.visible = true
	particles.set("emitting", false)
	particles.call("restart")
	# Explicitly arm one-shot emission after restart. This is required for the
	# persistent child emitter path used by buildings (unlike Dragon's top-level
	# holder, it can otherwise remain in a stopped state after the first bind).
	particles.set("emitting", true)


func _hide_particle_entry(entry: Dictionary) -> void:
	var particles := entry.get("node") as Node3D
	if not is_instance_valid(particles):
		return
	particles.set("emitting", false)
	particles.visible = false


func _deactivate_visuals() -> void:
	_hide_particle_entry(_flame_entry)
	_hide_particle_entry(_trail_entry)


func _particle_amount(entry: Dictionary) -> int:
	var particles := entry.get("node") as Node
	if not is_instance_valid(particles):
		return 0
	return int(particles.get("amount"))


func _effective_particle_amount(base_amount: int) -> int:
	if OS.has_feature("web"):
		return maxi(8, int(ceil(float(base_amount) * DRAGON_WEB_PARTICLE_SCALE)))
	return base_amount


func _effective_lifetime(base_lifetime: float) -> float:
	if OS.has_feature("web"):
		return base_lifetime * DRAGON_WEB_LIFETIME_SCALE
	return base_lifetime


func _make_fire_particle_material(color: Color) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	material.no_depth_test = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	material.vertex_color_use_as_albedo = true
	material.albedo_texture = FIRE_BREATH_TEXTURE
	material.albedo_color = color
	return material
