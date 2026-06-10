extends BaseTroop
## FireDragon - temporary flying heavy unit.
## Uses DemonKing-like test stats while keeping the normal troop pipeline.


enum DragonSkin { RED, BLACK, PURPLE }

const LEVEL_STATS: Dictionary = {
	1: {"hp": 1080, "damage": 140, "atk_speed": 1.25},
	2: {"hp": 1170, "damage": 139, "atk_speed": 1.15},
	3: {"hp": 1260, "damage": 137, "atk_speed": 1.05},
}

const ANIMATION_PATHS: Dictionary = {
	"bite_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_bite_attack.fbx",
	"die": "res://Model/Characters/FireDragon/Animations/fire_dragon_die.fbx",
	"fire_breath_attack": "res://Model/Characters/FireDragon/Animations/fire_dragon_fire_breath_attack.fbx",
	"fly_bite_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_bite_attack_low.fbx",
	"fly_die": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_die.fbx",
	"fly_fire_breath_attack_low": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_fire_breath_attack_low.fbx",
	"fly_forward": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_forward.fbx",
	"fly_idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_idle.fbx",
	"fly_take_damage": "res://Model/Characters/FireDragon/Animations/fire_dragon_fly_take_damage.fbx",
	"idle": "res://Model/Characters/FireDragon/Animations/fire_dragon_idle.fbx",
}

const RED_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_red.tga")
const BLACK_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_black.tga")
const PURPLE_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fire_dragon_purple.tga")
const FIRE_BREATH_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_fire_breath.tga")
const FIRE_SPARKS_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_sparks.tga")
const FIRE_BREATH_DURATION: float = 0.58
const FIRE_BREATH_WIDTH: float = 0.28
const FIRE_BREATH_MOUTH_FORWARD_OFFSET: float = 0.08
const FIRE_BREATH_TARGET_Y_OFFSET: float = 0.13
const FIRE_BREATH_MIN_LENGTH: float = 0.12
const FIRE_BREATH_RIBBON_LAYERS: int = 4
const FIRE_BREATH_GLOW_LAYERS: int = 2
const FIRE_BREATH_PUFF_COUNT: int = 20
const FIRE_BREATH_EMBER_COUNT: int = 16
const FIRE_BREATH_FLAME_PARTICLES: int = 56
const FIRE_BREATH_LIGHT_ENERGY: float = 1.7
const FIRE_BREATH_ATTACK_RANGE: float = 0.72
const FIRE_BREATH_MIN_STANDOFF: float = 0.54
const FIRE_BREATH_BUILDING_STANDOFF_PADDING: float = 0.18
const FIRE_BREATH_STANDOFF_CORRECTION_SPEED: float = 0.52
const FIRE_BREATH_VISUAL_OVERSHOOT: float = 0.09

@export var skin: DragonSkin = DragonSkin.RED
@export var flight_height: float = 0.34
@export var flight_bob_height: float = 0.035
@export var flight_bob_speed: float = 2.2
@export var hit_anim_threshold: float = 0.4

var _current_dragon_animation: String = ""
var _current_animation_length: float = 0.0
var _ground_y: float = 0.0
var _flight_time: float = 0.0
var _hit_this_swing: bool = false


func _init_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var stats: Dictionary = LEVEL_STATS[level]
	unit_target_type = BaseTroop.UNIT_TARGET_AIR
	move_speed = 0.38
	attack_range = FIRE_BREATH_ATTACK_RANGE
	separation_radius = 0.18
	separation_force = 0.6
	hp = int(stats.hp)
	damage = int(stats.damage)
	atk_speed = float(stats.atk_speed)
	attack_anim = "fly_fire_breath_attack_low"
	attack_sfx_path = "res://Musik/sound_effects/DemonKingAttack.mp3"
	anim_files = []


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "FireDragonAnimProxy"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)


func _setup_weapons() -> void:
	pass


func _ready() -> void:
	_ground_y = global_position.y
	super._ready()
	_apply_skin()
	_play_dragon_animation("fly_idle")
	_apply_flight_height()


func activate() -> void:
	_ground_y = global_position.y
	super.activate()
	_sync_visual_state()
	_apply_flight_height()


func play_boarding_animation() -> void:
	_ground_y = global_position.y
	_play_dragon_animation("fly_forward")
	_apply_flight_height()


func apply_boarding_flight(delta: float) -> void:
	_flight_time += minf(delta, 0.1)
	_apply_flight_height()


func _physics_process(delta: float) -> void:
	if _is_dead or state == State.INACTIVE:
		return
	_flight_time += BaseTroop.combat_delta(delta)
	super._physics_process(delta)
	_apply_flight_height()
	_sync_visual_state()


func _initial_attack_timer() -> float:
	return atk_speed * hit_anim_threshold


func _on_enter_attack_state() -> void:
	_hit_this_swing = false
	_play_dragon_animation("fly_fire_breath_attack_low", true)


func _do_attack(delta: float) -> void:
	if _resume_chase_if_target_far():
		_hit_this_swing = false
		_play_dragon_animation("fly_forward")
		return

	_face_current_target()
	var repositioning := _maintain_fire_breath_standoff(delta)
	if not repositioning:
		_apply_attack_separation(delta)
	attack_timer += delta
	if attack_timer >= atk_speed:
		attack_timer -= atk_speed
		_hit_this_swing = false
		_play_dragon_animation("fly_fire_breath_attack_low", true)

	if not _hit_this_swing and attack_timer >= atk_speed * hit_anim_threshold:
		if repositioning and _target_flat_distance() < _desired_fire_breath_standoff() * 0.88:
			return
		_hit_this_swing = true
		_spawn_fire_breath_vfx()
		_play_attack_sfx()
		_deal_target_damage()


func _play_victory() -> void:
	super._play_victory()
	_play_dragon_animation("fly_idle")
	_apply_flight_height()


func take_damage(dmg: int) -> void:
	if _is_dead:
		return
	hp -= dmg
	if hp > 0:
		return
	_is_dead = true
	_record_replay_telemetry("troop_death", {"damage": dmg})
	if is_in_group("troops"):
		remove_from_group("troops")
	invalidate_combat_lists()
	_report_death()
	if _hp_bar and is_instance_valid(_hp_bar):
		_hp_bar.visible = false
	var duration: float = _play_dragon_animation("fly_die", true)
	if duration <= 0.0:
		duration = 0.8
	await get_tree().create_timer(duration).timeout
	queue_free()


func _apply_attack_separation(delta: float) -> void:
	if separation_force <= 0.0:
		return
	var sep: Vector3 = _get_separation()
	if sep.length() <= 0.001:
		return
	var target_pos: Vector3 = _get_target_position()
	var new_pos: Vector3 = global_position + sep * separation_force * delta * 0.3
	var flat_target := Vector3(target_pos.x, 0.0, target_pos.z)
	var flat_new := Vector3(new_pos.x, 0.0, new_pos.z)
	if flat_target.distance_to(flat_new) < attack_range * 1.2:
		global_position = _clamp_to_island(new_pos)


func _desired_fire_breath_standoff() -> float:
	var desired := FIRE_BREATH_MIN_STANDOFF
	if target_building.size() > 0 and is_instance_valid(target_building.get("node")):
		desired = maxf(
			desired,
			_building_avoid_radius(target_building, target_bs, 0.10) + FIRE_BREATH_BUILDING_STANDOFF_PADDING
		)
	return minf(desired, attack_range * 0.94)


func _maintain_fire_breath_standoff(delta: float) -> bool:
	if not _has_valid_target():
		return false
	var target_pos := _get_target_position()
	var away := global_position - target_pos
	away.y = 0.0
	var dist := away.length()
	var desired := _desired_fire_breath_standoff()
	if dist >= desired:
		return false
	if away.length_squared() < 0.0001:
		away = global_transform.basis.z
		away.y = 0.0
		if away.length_squared() < 0.0001:
			away = Vector3.BACK
	away = away.normalized()
	var step := minf(desired - dist, FIRE_BREATH_STANDOFF_CORRECTION_SPEED * delta)
	global_position = _clamp_to_island(global_position + away * step)
	return true


func prewarm_fire_breath_vfx() -> void:
	if not is_inside_tree():
		return
	var root_parent: Node = get_tree().current_scene
	if root_parent == null:
		root_parent = get_tree().root
	var mouth_pos: Vector3 = global_position + Vector3(0.0, 0.12, 0.0)
	var target_pos: Vector3 = mouth_pos + Vector3(0.64, 0.0, -0.06)
	_spawn_fire_breath_vfx_between(root_parent, mouth_pos, target_pos, "FireDragonBreathVFXWarmup")


func _spawn_fire_breath_vfx() -> void:
	if not is_inside_tree():
		return
	var root_parent: Node = get_tree().current_scene
	if root_parent == null:
		root_parent = get_tree().root
	var target_pos: Vector3 = _get_fire_breath_target_position()
	var target_dir: Vector3 = target_pos - global_position
	target_dir.y = 0.0
	if target_dir.length_squared() < 0.0001:
		target_dir = -global_transform.basis.z
	target_dir = target_dir.normalized()
	var mouth_pos: Vector3 = _get_mouth_position(target_dir)
	_spawn_fire_breath_vfx_between(root_parent, mouth_pos, target_pos, "FireDragonBreathVFX")


func _spawn_fire_breath_vfx_between(root_parent: Node, mouth_pos: Vector3, target_pos: Vector3, holder_name: String) -> void:
	if root_parent == null:
		return
	var to_target: Vector3 = target_pos - mouth_pos
	if to_target.length_squared() < FIRE_BREATH_MIN_LENGTH * FIRE_BREATH_MIN_LENGTH:
		var fallback_dir := -global_transform.basis.z
		fallback_dir.y = 0.0
		if fallback_dir.length_squared() < 0.0001:
			fallback_dir = Vector3.FORWARD
		to_target = fallback_dir.normalized() * FIRE_BREATH_MIN_LENGTH
		target_pos = mouth_pos + to_target
	var dir: Vector3 = to_target.normalized()
	var length: float = to_target.length()
	var side: Vector3 = Vector3.UP.cross(dir)
	if side.length_squared() < 0.0001:
		side = global_transform.basis.x
	side = side.normalized()
	var normal: Vector3 = side.cross(dir).normalized()
	length += minf(FIRE_BREATH_VISUAL_OVERSHOOT, maxf(0.02, length * 0.16))
	target_pos = mouth_pos + dir * length

	var holder := Node3D.new()
	holder.name = holder_name
	holder.top_level = true
	root_parent.add_child(holder)

	var beam_width: float = clampf(length * 0.42, FIRE_BREATH_WIDTH * 0.72, FIRE_BREATH_WIDTH * 1.55)
	_spawn_fire_particle_cone(holder, mouth_pos, dir, side, normal, length, beam_width)
	_spawn_breath_lights(holder, mouth_pos, target_pos, length)

	_spawn_fire_puffs(holder, mouth_pos, dir, side, normal, length, beam_width)
	_spawn_fire_embers(holder, mouth_pos, dir, side, normal, length)

	var cleanup := holder.create_tween()
	cleanup.tween_interval(FIRE_BREATH_DURATION + 0.04)
	cleanup.tween_callback(func():
		if is_instance_valid(holder):
			holder.queue_free()
	)


func _spawn_fire_ribbon_layers(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	for i in FIRE_BREATH_GLOW_LAYERS:
		var angle: float = (TAU / float(FIRE_BREATH_GLOW_LAYERS)) * float(i) + PI * 0.25
		var layer_side: Vector3 = side.rotated(dir, angle).normalized()
		var layer_normal: Vector3 = normal.rotated(dir, angle).normalized()
		var layer_basis := Basis(layer_side, dir, layer_normal).orthonormalized()
		var glow := _make_fire_ribbon(FIRE_BREATH_TEXTURE, length, width * 1.8, Color(1.05, 0.78, 0.12, 0.26), angle)
		holder.add_child(glow)
		glow.global_transform = Transform3D(layer_basis, mouth_pos)
		_animate_fire_node(glow, FIRE_BREATH_DURATION, 1.32)

	for i in FIRE_BREATH_RIBBON_LAYERS:
		var angle: float = (TAU / float(FIRE_BREATH_RIBBON_LAYERS)) * float(i)
		var layer_side: Vector3 = side.rotated(dir, angle).normalized()
		var layer_normal: Vector3 = normal.rotated(dir, angle).normalized()
		var layer_basis := Basis(layer_side, dir, layer_normal).orthonormalized()
		var alpha: float = 0.84 if i % 2 == 0 else 0.66
		var ribbon := _make_fire_ribbon(FIRE_BREATH_TEXTURE, length, width * randf_range(0.82, 1.08), Color(1.18, 0.82, 0.16, alpha * 0.82), angle + randf_range(-0.4, 0.4))
		holder.add_child(ribbon)
		ribbon.global_transform = Transform3D(layer_basis, mouth_pos)
		_animate_fire_node(ribbon, FIRE_BREATH_DURATION * randf_range(0.86, 1.08), randf_range(1.12, 1.38))


func _spawn_fire_particle_cone(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	var particles := GPUParticles3D.new()
	particles.name = "FireDragonFlameParticles"
	particles.amount = FIRE_BREATH_FLAME_PARTICLES
	particles.lifetime = FIRE_BREATH_DURATION * 0.96
	particles.one_shot = true
	particles.explosiveness = 0.82
	particles.randomness = 0.72
	particles.fixed_fps = 30
	particles.interpolate = true
	particles.local_coords = true
	particles.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	particles.visibility_aabb = AABB(Vector3(-length, -length, -length), Vector3(length * 2.0, length * 2.0, length * 2.0))

	var mesh := QuadMesh.new()
	mesh.size = Vector2(width * 0.70, width * 0.86)
	mesh.material = _make_fire_particle_material(FIRE_BREATH_TEXTURE, Color(1.18, 0.82, 0.12, 0.76), true)
	particles.draw_passes = 1
	particles.set_draw_pass_mesh(0, mesh)

	var process := ParticleProcessMaterial.new()
	process.direction = Vector3(0.0, 1.0, 0.0)
	process.spread = 9.0
	process.gravity = Vector3.ZERO
	process.initial_velocity_min = maxf(0.65, length / maxf(FIRE_BREATH_DURATION, 0.1) * 0.92)
	process.initial_velocity_max = maxf(0.9, length / maxf(FIRE_BREATH_DURATION, 0.1) * 1.24)
	process.lifetime_randomness = 0.22
	process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
	process.emission_sphere_radius = width * 0.12
	process.scale_min = 0.50
	process.scale_max = 1.55
	process.angle_min = -90.0
	process.angle_max = 90.0
	process.angular_velocity_min = -130.0
	process.angular_velocity_max = 130.0
	process.radial_accel_min = -0.02
	process.radial_accel_max = 0.10
	process.tangential_accel_min = -0.12
	process.tangential_accel_max = 0.12
	process.damping_min = 0.05
	process.damping_max = 0.16
	particles.process_material = process

	holder.add_child(particles)
	particles.global_transform = Transform3D(Basis(side, dir, normal).orthonormalized(), mouth_pos)
	particles.restart()


func _animate_fire_node(node: MeshInstance3D, duration: float, x_scale: float) -> void:
	var mat := node.material_override as StandardMaterial3D
	var tw := node.create_tween()
	tw.set_parallel(true)
	tw.tween_property(node, "scale:x", x_scale, duration * 0.55).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(node, "scale:z", randf_range(0.92, 1.2), duration * 0.45).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(mat, "albedo_color:a", 0.0, duration).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)


func _make_fire_ribbon(texture: Texture2D, length: float, width: float, color: Color, wave_phase: float) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mesh := ArrayMesh.new()
	var vertices := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var segment_count: int = 8
	for i in range(segment_count + 1):
		var t: float = float(i) / float(segment_count)
		var half_width: float = lerpf(width * 0.12, width * 0.58, minf(1.0, t * 1.4))
		half_width *= 1.0 + sin(t * PI) * 0.22
		var wave_z: float = sin(t * TAU * 1.45 + wave_phase) * width * 0.14 * sin(t * PI)
		var y: float = length * t
		vertices.append(Vector3(-half_width, y, wave_z))
		vertices.append(Vector3(half_width, y, -wave_z * 0.7))
		uvs.append(Vector2(0.0, t))
		uvs.append(Vector2(1.0, t))
	for i in range(segment_count):
		var base: int = i * 2
		indices.append_array(PackedInt32Array([base, base + 1, base + 2, base + 1, base + 3, base + 2]))
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	node.mesh = mesh
	node.material_override = _make_fire_material(texture, color, false)
	return node


func _make_fire_billboard(texture: Texture2D, color: Color) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.material_override = _make_fire_material(texture, color, true)
	return node


func _make_fire_material(texture: Texture2D, color: Color, billboard: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED if billboard else BaseMaterial3D.BILLBOARD_DISABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.albedo_texture = texture
	mat.albedo_color = color
	return mat


func _make_fire_particle_material(texture: Texture2D, color: Color, additive: bool) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD if additive else BaseMaterial3D.BLEND_MODE_MIX
	mat.no_depth_test = additive
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.vertex_color_use_as_albedo = true
	mat.albedo_texture = texture
	mat.albedo_color = color
	return mat


func _spawn_breath_lights(holder: Node3D, mouth_pos: Vector3, target_pos: Vector3, length: float) -> void:
	var mouth_light := OmniLight3D.new()
	mouth_light.name = "FireDragonMouthLight"
	mouth_light.light_color = Color(1.0, 0.76, 0.12)
	mouth_light.light_energy = FIRE_BREATH_LIGHT_ENERGY
	mouth_light.omni_range = clampf(length * 1.15, 0.35, 0.95)
	holder.add_child(mouth_light)
	mouth_light.global_position = mouth_pos

	var impact_light := OmniLight3D.new()
	impact_light.name = "FireDragonImpactLight"
	impact_light.light_color = Color(1.0, 0.68, 0.08)
	impact_light.light_energy = FIRE_BREATH_LIGHT_ENERGY * 0.72
	impact_light.omni_range = clampf(length * 0.78, 0.25, 0.7)
	holder.add_child(impact_light)
	impact_light.global_position = target_pos + Vector3(0.0, 0.05, 0.0)

	var tw := holder.create_tween()
	tw.set_parallel(true)
	tw.tween_property(mouth_light, "light_energy", 0.0, FIRE_BREATH_DURATION * 0.82).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(impact_light, "light_energy", 0.0, FIRE_BREATH_DURATION * 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)


func _spawn_fire_puffs(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	for i in range(FIRE_BREATH_PUFF_COUNT):
		var puff := _make_fire_billboard(FIRE_BREATH_TEXTURE, Color(randf_range(1.02, 1.18), randf_range(0.68, 0.88), randf_range(0.08, 0.18), randf_range(0.36, 0.60)))
		var mesh := QuadMesh.new()
		var t: float = (float(i) + randf_range(-0.18, 0.18)) / maxf(1.0, float(FIRE_BREATH_PUFF_COUNT - 1))
		t = clampf(t, 0.02, 1.0)
		var flame_shape: float = sin(t * PI)
		var size: float = lerpf(width * 0.34, width * 1.18, flame_shape) * randf_range(0.86, 1.24)
		mesh.size = Vector2(size * randf_range(0.88, 1.20), size * randf_range(0.78, 1.16))
		puff.mesh = mesh
		holder.add_child(puff)
		var radius: float = lerpf(width * 0.05, width * 0.31, flame_shape)
		var angle: float = randf_range(0.0, TAU)
		var offset: Vector3 = side * cos(angle) * radius + normal * sin(angle) * radius
		var start_pos: Vector3 = mouth_pos + dir * (length * t) + offset
		puff.global_position = start_pos
		var mat := puff.material_override as StandardMaterial3D
		var tw := puff.create_tween()
		tw.set_parallel(true)
		tw.tween_property(puff, "global_position", start_pos + dir * randf_range(0.06, 0.13) + offset * 0.28, FIRE_BREATH_DURATION)
		tw.tween_property(puff, "scale", Vector3.ONE * randf_range(1.22, 1.78), FIRE_BREATH_DURATION * 0.82)
		tw.tween_property(mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * randf_range(0.82, 1.06))


func _spawn_fire_embers(holder: Node3D, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float) -> void:
	for i in range(FIRE_BREATH_EMBER_COUNT):
		var ember := _make_fire_billboard(FIRE_SPARKS_TEXTURE, Color(1.20, 0.86, 0.16, 0.52))
		var mesh := QuadMesh.new()
		mesh.size = Vector2(randf_range(0.035, 0.085), randf_range(0.035, 0.085))
		ember.mesh = mesh
		holder.add_child(ember)
		var t: float = randf_range(0.12, 0.88)
		var offset: Vector3 = side * randf_range(-0.075, 0.075) + normal * randf_range(-0.055, 0.055)
		var start_pos: Vector3 = mouth_pos + dir * (length * t) + offset
		ember.global_position = start_pos
		var ember_mat := ember.material_override as StandardMaterial3D
		var tw := ember.create_tween()
		tw.set_parallel(true)
		tw.tween_property(ember, "global_position", start_pos + dir * randf_range(0.035, 0.08) + offset * 0.4, FIRE_BREATH_DURATION)
		tw.tween_property(ember, "scale", Vector3.ONE * randf_range(0.55, 0.9), FIRE_BREATH_DURATION)
		tw.tween_property(ember_mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * randf_range(0.7, 1.0))


func _spawn_impact_flame_burst(holder: Node3D, target_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, width: float) -> void:
	var burst := _make_fire_billboard(FIRE_BREATH_TEXTURE, Color(1.18, 0.78, 0.12, 0.60))
	var burst_mesh := QuadMesh.new()
	burst_mesh.size = Vector2(width * 1.35, width * 1.08)
	burst.mesh = burst_mesh
	holder.add_child(burst)
	burst.global_position = target_pos + Vector3(0.0, 0.08, 0.0)
	var burst_basis := Basis(side, Vector3.UP, -dir).orthonormalized()
	burst.global_basis = burst_basis
	var burst_mat := burst.material_override as StandardMaterial3D
	var burst_tw := burst.create_tween()
	burst_tw.set_parallel(true)
	burst_tw.tween_property(burst, "scale", Vector3.ONE * 1.85, FIRE_BREATH_DURATION * 0.62).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	burst_tw.tween_property(burst_mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * 0.74).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)

	for i in range(6):
		var spark := _make_fire_billboard(FIRE_SPARKS_TEXTURE, Color(1.20, 0.88, 0.18, 0.54))
		var mesh := QuadMesh.new()
		mesh.size = Vector2(randf_range(0.035, 0.065), randf_range(0.035, 0.075))
		spark.mesh = mesh
		holder.add_child(spark)
		var radial: Vector3 = (side * randf_range(-1.0, 1.0) + normal * randf_range(-1.0, 1.0) + Vector3.UP * randf_range(0.2, 0.7)).normalized()
		var start_pos := target_pos + radial * width * 0.16 + Vector3(0.0, 0.04, 0.0)
		spark.global_position = start_pos
		var spark_mat := spark.material_override as StandardMaterial3D
		var tw := spark.create_tween()
		tw.set_parallel(true)
		tw.tween_property(spark, "global_position", start_pos + radial * width * randf_range(0.7, 1.25), FIRE_BREATH_DURATION * 0.78)
		tw.tween_property(spark_mat, "albedo_color:a", 0.0, FIRE_BREATH_DURATION * 0.78)


func _get_fire_breath_target_position() -> Vector3:
	if target_guard != null and is_instance_valid(target_guard):
		return target_guard.global_position + Vector3(0.0, 0.08, 0.0)
	if target_building.size() > 0:
		var node: Node3D = target_building.get("node", null)
		if is_instance_valid(node):
			return node.global_position + Vector3(0.0, FIRE_BREATH_TARGET_Y_OFFSET, 0.0)
	return _get_target_position() + Vector3(0.0, FIRE_BREATH_TARGET_Y_OFFSET, 0.0)


func _get_mouth_position(fallback_dir: Vector3) -> Vector3:
	var skeleton: Skeleton3D = _find_skeleton(self)
	if skeleton != null:
		var head_idx: int = _find_head_bone_index(skeleton)
		if head_idx >= 0:
			var head_pose: Transform3D = skeleton.get_bone_global_pose(head_idx)
			return skeleton.global_transform * head_pose.origin + fallback_dir.normalized() * FIRE_BREATH_MOUTH_FORWARD_OFFSET
	return global_position + Vector3(0.0, 0.08, 0.0) + fallback_dir.normalized() * 0.18


func _find_head_bone_index(skeleton: Skeleton3D) -> int:
	var direct_idx: int = skeleton.find_bone("RigHead")
	if direct_idx >= 0:
		return direct_idx
	for i in skeleton.get_bone_count():
		if skeleton.get_bone_name(i).to_lower().find("head") != -1:
			return i
	return -1


func _find_skeleton(node: Node) -> Skeleton3D:
	if node is Skeleton3D:
		return node as Skeleton3D
	for child in node.get_children():
		var found := _find_skeleton(child)
		if found:
			return found
	return null


func _sync_visual_state() -> void:
	if _is_dead:
		return
	match state:
		State.RUNNING:
			_play_dragon_animation("fly_forward")
		State.IDLE:
			_play_dragon_animation("fly_idle")
		State.VICTORY:
			_play_dragon_animation("fly_idle")


func _apply_flight_height() -> void:
	var bob: float = sin(_flight_time * flight_bob_speed) * flight_bob_height
	global_position.y = _ground_y + flight_height + bob
	if _hp_bar and is_instance_valid(_hp_bar):
		_hp_bar.global_position = global_position + Vector3(0.0, 0.25, 0.0)


func _play_dragon_animation(animation_name: String, force_restart: bool = false) -> float:
	var scene_path: String = str(ANIMATION_PATHS.get(animation_name, ""))
	if scene_path == "":
		push_warning("FireDragon: unknown animation '%s'" % animation_name)
		return 0.0

	if _current_dragon_animation == animation_name and is_instance_valid(anim_player):
		return _play_first_imported_clip(anim_player, animation_name, force_restart)

	var res: Resource = ResourceLoader.load(scene_path, "PackedScene")
	if res == null:
		push_warning("FireDragon: missing animation scene '%s'" % scene_path)
		return 0.0

	var old_model: Node = get_node_or_null("Model")
	if old_model:
		old_model.name = "ModelOld"
		if old_model is Node3D:
			(old_model as Node3D).visible = false
		old_model.queue_free()

	var animated_model: Node = (res as PackedScene).instantiate()
	animated_model.name = "Model"
	add_child(animated_model)
	move_child(animated_model, 0)

	_current_dragon_animation = animation_name
	_apply_skin()
	_stabilize_render_meshes()
	anim_player = _find_animation_player(animated_model)
	if anim_player:
		_current_animation_length = _play_first_imported_clip(anim_player, animation_name, true)
		return _current_animation_length
	return 0.0


func _play_first_imported_clip(player: AnimationPlayer, animation_name: String, force_restart: bool) -> float:
	for clip_name in player.get_animation_list():
		var clip_text: String = str(clip_name)
		if clip_text == "RESET" or clip_text == "T-Pose":
			continue
		var animation: Animation = player.get_animation(clip_name)
		if animation:
			animation.loop_mode = _loop_mode_for(animation_name)
			_current_animation_length = animation.length
		if force_restart or str(player.current_animation) != clip_text or not player.is_playing():
			player.stop()
			player.play(clip_name)
		return _current_animation_length
	return 0.0


func _apply_skin() -> void:
	var body_material := StandardMaterial3D.new()
	body_material.albedo_texture = _texture_for_skin(skin)
	body_material.roughness = 0.8
	body_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_assign_material_recursive(self, body_material)


func _texture_for_skin(skin_value: DragonSkin) -> Texture2D:
	match skin_value:
		DragonSkin.BLACK:
			return BLACK_TEXTURE
		DragonSkin.PURPLE:
			return PURPLE_TEXTURE
		_:
			return RED_TEXTURE


func _assign_material_recursive(node: Node, material: Material) -> void:
	if node is MeshInstance3D:
		var mesh_instance := node as MeshInstance3D
		var surface_count: int = mesh_instance.mesh.get_surface_count() if mesh_instance.mesh else 0
		for surface_index in surface_count:
			mesh_instance.set_surface_override_material(surface_index, material)
	for child in node.get_children():
		_assign_material_recursive(child, material)


func _find_animation_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node as AnimationPlayer
	for child in node.get_children():
		var found := _find_animation_player(child)
		if found:
			return found
	return null


func _loop_mode_for(animation_name: String) -> int:
	var lower_name: String = animation_name.to_lower()
	if lower_name.findn("idle") != -1 \
			or lower_name.findn("run") != -1 \
			or lower_name.findn("walk") != -1 \
			or lower_name.findn("fly_forward") != -1:
		return Animation.LOOP_LINEAR
	return Animation.LOOP_NONE
