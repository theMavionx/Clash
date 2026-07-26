extends BaseTroop
## FireDragon - NFT-backed flying 10-slot troop.
## The player upgrades one shared Dragon troop level; each owned NFT then
## applies its rarity multiplier over the canonical common Dragon stats.


enum DragonSkin { BLACK }

const COMMON_LEVEL_STATS: Dictionary = {
	1: {"hp": 1750, "damage": 470, "atk_speed": 1.25},
	2: {"hp": 2320, "damage": 600, "atk_speed": 1.12},
	3: {"hp": 3080, "damage": 840, "atk_speed": 1.0},
	4: {"hp": 4000, "damage": 1115, "atk_speed": 0.90},
	5: {"hp": 5100, "damage": 1470, "atk_speed": 0.82},
	6: {"hp": 6440, "damage": 1920, "atk_speed": 0.76},
	7: {"hp": 8000, "damage": 2500, "atk_speed": 0.70},
}

const NFT_RARITY_MULTIPLIERS: Dictionary = {
	"common": 1.2,
	"epic": 1.3,
	"legendary": 1.5,
	"unrevealed": 1.2,
}
const MAX_TROOP_LEVEL: int = 7

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

const SKIN_TEXTURE_PATH: String = "res://Model/Characters/FireDragon/Textures/fire_dragon_black.tga"
const FIRE_BREATH_TEXTURE: Texture2D = preload("res://Model/Characters/FireDragon/Textures/fx_fire_breath.tga")
const FIRE_BREATH_DURATION: float = 0.74
const FIRE_BREATH_WIDTH: float = 0.28
const FIRE_BREATH_VISUAL_WIDTH_SCALE: float = 0.65
const FIRE_BREATH_MOUTH_FORWARD_OFFSET: float = 0.08
const FIRE_BREATH_MOUTH_Y_OFFSET: float = -0.055
const FIRE_BREATH_TARGET_Y_OFFSET: float = 0.13
const FIRE_BREATH_MIN_LENGTH: float = 0.12
const FIRE_BREATH_FLAME_PARTICLES: int = 46
const FIRE_BREATH_TRAIL_PARTICLES: int = 16
const FIRE_BREATH_POOL_SIZE: int = 4
const FIRE_BREATH_WEB_PARTICLE_SCALE: float = 0.55
const FIRE_BREATH_WEB_LIFETIME_SCALE: float = 0.82
const FIRE_BREATH_LIGHT_ENERGY: float = 1.7
const FIRE_BREATH_FLAME_LIFETIME_SCALE: float = 0.96
const FIRE_BREATH_TRAIL_LIFETIME_SCALE: float = 0.56
const FIRE_BREATH_SLOT_RELEASE_SCALE: float = 0.84
const FIRE_BREATH_ATTACK_RANGE: float = 0.72
const FIRE_BREATH_MIN_STANDOFF: float = 0.54
const FIRE_BREATH_BUILDING_STANDOFF_PADDING: float = 0.18
const FIRE_BREATH_STANDOFF_CORRECTION_SPEED: float = 0.52
const FIRE_BREATH_VISUAL_OVERSHOOT: float = 0.18
const DRAGON_SPAWN_SCALE: float = 0.015

@export var skin: DragonSkin = DragonSkin.BLACK
@export var flight_height: float = 0.34
@export var flight_bob_height: float = 0.035
@export var flight_bob_speed: float = 2.2
@export var hit_anim_threshold: float = 0.4

var _current_dragon_animation: String = ""
var _current_animation_length: float = 0.0
var _ground_y: float = 0.0
var _flight_time: float = 0.0
var _hit_this_swing: bool = false
var _breath_vfx_pool: Array = []
var _breath_vfx_pool_ready: bool = false
var _breath_vfx_pool_exhausted_warned: bool = false
var _cached_fire_skeleton: Skeleton3D = null
var _cached_fire_head_bone_idx: int = -2
var player_troop_levels: Dictionary = {}
var nft_rarity: String = "common"
static var _shared_body_materials: Dictionary = {}
static var _shared_fire_color_ramps: Dictionary = {}
static var _shared_fire_color_ramp_textures: Dictionary = {}
static var _shared_fire_particle_materials: Dictionary = {}
static var _shared_skin_texture: Texture2D = null


func _init_stats() -> void:
	level = clampi(level, 1, MAX_TROOP_LEVEL)
	var stats: Dictionary = _compute_dynamic_stats(level, player_troop_levels, nft_rarity)
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


func set_player_troop_levels(levels: Dictionary) -> void:
	player_troop_levels = levels.duplicate(true) if levels != null else {}


func set_nft_rarity(value: String) -> void:
	nft_rarity = _normalize_rarity(value)


static func _normalize_rarity(value: String) -> String:
	var key: String = str(value).strip_edges().to_lower()
	return key if NFT_RARITY_MULTIPLIERS.has(key) else "common"


static func _troop_level_from_map(levels: Dictionary, troop_type: String) -> int:
	var aliases: Array[String] = [
		troop_type,
		troop_type.capitalize(),
		troop_type.replace("_", ""),
	]
	if troop_type == "fire_dragon":
		aliases.append("FireDragon")
	for key in aliases:
		if levels.has(key):
			return clampi(int(levels[key]), 1, MAX_TROOP_LEVEL)
	return 1


static func _compute_dynamic_stats(dragon_level: int, levels: Dictionary, rarity: String = "common") -> Dictionary:
	var clamped_level: int = clampi(dragon_level, 1, MAX_TROOP_LEVEL)
	var troop_level: int = _troop_level_from_map(levels, "fire_dragon")
	if not levels.has("fire_dragon") and not levels.has("FireDragon"):
		troop_level = clamped_level
	var stat: Dictionary = COMMON_LEVEL_STATS.get(troop_level, COMMON_LEVEL_STATS[1])
	var rarity_mult: float = float(NFT_RARITY_MULTIPLIERS.get(_normalize_rarity(rarity), 1.2))
	var rarity_scale: float = rarity_mult / float(NFT_RARITY_MULTIPLIERS.common)
	return {
		"hp": int(ceil(float(stat.hp) * rarity_scale)),
		"damage": int(ceil(float(stat.damage) * rarity_scale)),
		"atk_speed": float(stat.atk_speed),
	}


func _setup_animations() -> void:
	anim_player = AnimationPlayer.new()
	anim_player.name = "FireDragonAnimProxy"
	add_child(anim_player)
	anim_player.root_node = anim_player.get_path_to(self)


func _setup_weapons() -> void:
	pass


func _ready() -> void:
	_spawn_scale = DRAGON_SPAWN_SCALE
	scale = Vector3(DRAGON_SPAWN_SCALE, DRAGON_SPAWN_SCALE, DRAGON_SPAWN_SCALE)
	_ground_y = global_position.y
	super._ready()
	_apply_skin()
	_play_dragon_animation("fly_idle")
	_apply_flight_height()
	BaseTroop.report_render_diagnostic(self, "troop.fire_dragon.ready_after_fly_idle", {
		"skin": int(skin),
		"rarity": nft_rarity,
		"level": level,
		"spawn_scale": DRAGON_SPAWN_SCALE,
	})
	call_deferred("_build_fire_breath_vfx_pool")


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
	_build_fire_breath_vfx_pool()
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

	var beam_width: float = clampf(length * 0.42, FIRE_BREATH_WIDTH * 0.72, FIRE_BREATH_WIDTH * 1.55) * FIRE_BREATH_VISUAL_WIDTH_SCALE
	var pooled_slot := _get_fire_breath_vfx_slot(root_parent)
	if not pooled_slot.is_empty():
		_activate_fire_breath_vfx_slot(pooled_slot, holder_name, mouth_pos, target_pos, dir, side, normal, length, beam_width)
		return


func _build_fire_breath_vfx_pool() -> void:
	if _breath_vfx_pool_ready or not is_inside_tree():
		return
	var root_parent: Node = get_tree().current_scene
	if root_parent == null:
		root_parent = get_tree().root
	if root_parent == null:
		return
	_breath_vfx_pool_ready = true
	for i in range(FIRE_BREATH_POOL_SIZE):
		_breath_vfx_pool.append(_make_fire_breath_vfx_slot(root_parent))


func _make_fire_breath_vfx_slot(root_parent: Node) -> Dictionary:
	var holder := Node3D.new()
	holder.name = "FireDragonBreathVFXPool"
	holder.top_level = true
	holder.visible = false
	root_parent.add_child(holder)

	var use_cpu_particles := _use_cpu_fire_particles()
	var flame_entry := _make_fire_particle_entry(
		holder,
		"FireDragonFlameParticles",
		FIRE_BREATH_TEXTURE,
		Color(1.0, 0.94, 0.24, 0.70),
		use_cpu_particles
	)
	var trail_entry := _make_fire_particle_entry(
		holder,
		"FireDragonTrailParticles",
		FIRE_BREATH_TEXTURE,
		Color(1.0, 0.82, 0.14, 0.46),
		use_cpu_particles
	)

	var mouth_light: OmniLight3D = null
	var impact_light: OmniLight3D = null
	if _use_fire_breath_lights():
		mouth_light = OmniLight3D.new()
		mouth_light.name = "FireDragonMouthLight"
		mouth_light.light_color = Color(1.0, 0.84, 0.18)
		mouth_light.light_energy = 0.0
		holder.add_child(mouth_light)

		impact_light = OmniLight3D.new()
		impact_light.name = "FireDragonImpactLight"
		impact_light.light_color = Color(1.0, 0.78, 0.12)
		impact_light.light_energy = 0.0
		holder.add_child(impact_light)

	var slot := {
		"holder": holder,
		"flame": flame_entry,
		"trail": trail_entry,
		"mouth_light": mouth_light,
		"impact_light": impact_light,
		"cleanup_tween": null,
		"light_tween": null,
		"active": false,
	}
	_return_fire_breath_vfx_slot(slot)
	return slot


func _get_fire_breath_vfx_slot(root_parent: Node) -> Dictionary:
	if not _breath_vfx_pool_ready:
		_build_fire_breath_vfx_pool()
	for slot in _breath_vfx_pool:
		if slot is Dictionary and not bool(slot.get("active", false)):
			var holder := slot.get("holder") as Node3D
			if is_instance_valid(holder) and root_parent != null and holder.get_parent() != root_parent:
				var old_parent := holder.get_parent()
				if old_parent != null:
					old_parent.remove_child(holder)
				root_parent.add_child(holder)
			_breath_vfx_pool_exhausted_warned = false
			return slot
	if not _breath_vfx_pool_exhausted_warned:
		_breath_vfx_pool_exhausted_warned = true
		push_warning("FireDragon: breath VFX pool exhausted (POOL_SIZE=%d); expanding one slot." % FIRE_BREATH_POOL_SIZE)
	if root_parent != null:
		var slot := _make_fire_breath_vfx_slot(root_parent)
		_breath_vfx_pool.append(slot)
		return slot
	return {}


func _activate_fire_breath_vfx_slot(slot: Dictionary, holder_name: String, mouth_pos: Vector3, target_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, beam_width: float) -> void:
	var holder := slot.get("holder") as Node3D
	if not is_instance_valid(holder):
		return
	_kill_fire_breath_slot_tweens(slot)
	slot["active"] = true
	holder.name = holder_name
	holder.visible = true
	_configure_flame_particle_entry(slot.get("flame") as Dictionary, mouth_pos, dir, side, normal, length, beam_width)
	_hide_fire_particle_entry(slot.get("trail") as Dictionary)
	_configure_breath_lights_for_slot(slot, mouth_pos, target_pos, length)

	var cleanup := holder.create_tween()
	cleanup.tween_interval(FIRE_BREATH_DURATION * FIRE_BREATH_SLOT_RELEASE_SCALE)
	cleanup.tween_callback(func():
		_return_fire_breath_vfx_slot(slot)
	)
	slot["cleanup_tween"] = cleanup


func _use_cpu_fire_particles() -> bool:
	return OS.has_feature("web")


func _use_fire_breath_lights() -> bool:
	return not OS.has_feature("web")


func _make_fire_particle_entry(holder: Node3D, node_name: String, texture: Texture2D, color: Color, use_cpu_particles: bool) -> Dictionary:
	var mesh := QuadMesh.new()
	mesh.material = _get_fire_particle_material(texture, color)
	if use_cpu_particles:
		var cpu_particles := CPUParticles3D.new()
		cpu_particles.name = node_name
		cpu_particles.mesh = mesh
		cpu_particles.emitting = false
		holder.add_child(cpu_particles)
		return {
			"node": cpu_particles,
			"mesh": mesh,
			"backend": "cpu",
		}
	var gpu_particles := GPUParticles3D.new()
	gpu_particles.name = node_name
	gpu_particles.draw_passes = 1
	gpu_particles.set_draw_pass_mesh(0, mesh)
	gpu_particles.process_material = ParticleProcessMaterial.new()
	gpu_particles.emitting = false
	holder.add_child(gpu_particles)
	return {
		"node": gpu_particles,
		"mesh": mesh,
		"process": gpu_particles.process_material,
		"backend": "gpu",
	}


func _configure_flame_particle_entry(entry: Dictionary, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	if entry.is_empty():
		return
	var mesh := entry.get("mesh") as QuadMesh
	if mesh == null:
		return
	mesh.size = Vector2(width * 0.76, width * 0.96)
	var velocity_min: float = maxf(0.62, length / maxf(FIRE_BREATH_DURATION, 0.1) * 0.82)
	var velocity_max: float = maxf(0.95, length / maxf(FIRE_BREATH_DURATION, 0.1) * 1.12)
	var particle_transform := Transform3D(Basis(side, dir, normal).orthonormalized(), mouth_pos)
	var amount := _effective_fire_particle_amount(FIRE_BREATH_FLAME_PARTICLES)
	var lifetime := _effective_fire_particle_lifetime(FIRE_BREATH_DURATION * FIRE_BREATH_FLAME_LIFETIME_SCALE)
	if str(entry.get("backend", "")) == "cpu":
		var cpu := entry.get("node") as CPUParticles3D
		_configure_cpu_fire_particles(cpu, amount, lifetime, particle_transform, Color(1.0, 0.92, 0.22, 0.84), 5.2, velocity_min, velocity_max, width * 0.045, Vector3.ZERO, 0.32, 1.00)
		return
	_configure_gpu_fire_particles(entry, amount, lifetime, particle_transform, length, Color(1.0, 0.92, 0.22, 0.84), 5.2, velocity_min, velocity_max, width * 0.045, Vector3.ZERO, 0.32, 1.00)


func _hide_fire_particle_entry(entry: Dictionary) -> void:
	if entry.is_empty():
		return
	var particles := entry.get("node") as Node3D
	if is_instance_valid(particles):
		particles.set("emitting", false)
		particles.visible = false


func _configure_trail_particle_entry(entry: Dictionary, mouth_pos: Vector3, dir: Vector3, side: Vector3, normal: Vector3, length: float, width: float) -> void:
	if entry.is_empty():
		return
	var mesh := entry.get("mesh") as QuadMesh
	if mesh == null:
		return
	mesh.size = Vector2(width * 0.58, width * 0.54)
	var origin := mouth_pos + dir * (length * 0.64)
	var particle_transform := Transform3D(Basis(side, dir, normal).orthonormalized(), origin)
	var box_extents := Vector3(width * 0.14, length * 0.34, width * 0.10)
	var amount := _effective_fire_particle_amount(FIRE_BREATH_TRAIL_PARTICLES)
	var lifetime := _effective_fire_particle_lifetime(FIRE_BREATH_DURATION * FIRE_BREATH_TRAIL_LIFETIME_SCALE)
	if str(entry.get("backend", "")) == "cpu":
		var cpu := entry.get("node") as CPUParticles3D
		_configure_cpu_fire_particles(cpu, amount, lifetime, particle_transform, Color(1.0, 0.84, 0.14, 0.40), 10.0, 0.26, 0.50, 0.0, box_extents, 0.24, 0.70)
		return
	_configure_gpu_fire_particles(entry, amount, lifetime, particle_transform, length, Color(1.0, 0.84, 0.14, 0.40), 10.0, 0.26, 0.50, 0.0, box_extents, 0.24, 0.70)


func _effective_fire_particle_amount(base_amount: int) -> int:
	if OS.has_feature("web"):
		return maxi(8, int(ceil(float(base_amount) * FIRE_BREATH_WEB_PARTICLE_SCALE)))
	return base_amount


func _effective_fire_particle_lifetime(base_lifetime: float) -> float:
	if OS.has_feature("web"):
		return base_lifetime * FIRE_BREATH_WEB_LIFETIME_SCALE
	return base_lifetime


func _configure_gpu_fire_particles(entry: Dictionary, amount: int, lifetime: float, particle_transform: Transform3D, length: float, color: Color, spread: float, velocity_min: float, velocity_max: float, sphere_radius: float, box_extents: Vector3, scale_min: float, scale_max: float) -> void:
	var particles := entry.get("node") as GPUParticles3D
	var process := entry.get("process") as ParticleProcessMaterial
	if particles == null or process == null:
		return
	particles.visible = true
	particles.emitting = false
	particles.amount = amount
	particles.lifetime = lifetime
	particles.one_shot = true
	particles.explosiveness = 0.48
	particles.randomness = 0.62
	particles.fixed_fps = 24
	particles.interpolate = true
	particles.local_coords = true
	particles.draw_order = GPUParticles3D.DRAW_ORDER_REVERSE_LIFETIME
	particles.visibility_aabb = AABB(Vector3(-length, -length, -length), Vector3(length * 2.0, length * 2.0, length * 2.0))
	process.direction = Vector3(0.0, 1.0, 0.0)
	process.color = color
	process.color_ramp = _get_fire_color_ramp_texture(color)
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
	particles.global_transform = particle_transform
	particles.restart()


func _configure_cpu_fire_particles(particles: CPUParticles3D, amount: int, lifetime: float, particle_transform: Transform3D, color: Color, spread: float, velocity_min: float, velocity_max: float, sphere_radius: float, box_extents: Vector3, scale_min: float, scale_max: float) -> void:
	if particles == null:
		return
	particles.visible = true
	particles.emitting = false
	particles.amount = amount
	particles.lifetime = lifetime
	particles.one_shot = true
	particles.explosiveness = 0.48
	particles.randomness = 0.62
	particles.local_coords = true
	particles.direction = Vector3(0.0, 1.0, 0.0)
	particles.color = color
	particles.color_ramp = _get_fire_color_ramp(color)
	particles.spread = spread
	particles.gravity = Vector3.ZERO
	particles.initial_velocity_min = velocity_min
	particles.initial_velocity_max = velocity_max
	particles.lifetime_randomness = 0.28
	if box_extents.length_squared() > 0.0:
		particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_BOX
		particles.emission_box_extents = box_extents
	else:
		particles.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
		particles.emission_sphere_radius = sphere_radius
	particles.scale_amount_min = scale_min
	particles.scale_amount_max = scale_max
	particles.angle_min = -100.0
	particles.angle_max = 100.0
	particles.angular_velocity_min = -110.0
	particles.angular_velocity_max = 110.0
	particles.radial_accel_min = -0.02
	particles.radial_accel_max = 0.10
	particles.tangential_accel_min = -0.10
	particles.tangential_accel_max = 0.10
	particles.damping_min = 0.05
	particles.damping_max = 0.16
	particles.global_transform = particle_transform
	particles.restart()


func _configure_breath_lights_for_slot(slot: Dictionary, mouth_pos: Vector3, target_pos: Vector3, length: float) -> void:
	if not _use_fire_breath_lights():
		return
	var mouth_light := slot.get("mouth_light") as OmniLight3D
	var impact_light := slot.get("impact_light") as OmniLight3D
	if not is_instance_valid(mouth_light) or not is_instance_valid(impact_light):
		return
	mouth_light.light_color = Color(1.0, 0.84, 0.18)
	mouth_light.light_energy = FIRE_BREATH_LIGHT_ENERGY
	mouth_light.omni_range = clampf(length * 1.15, 0.35, 0.95)
	mouth_light.global_position = mouth_pos
	impact_light.light_color = Color(1.0, 0.78, 0.12)
	impact_light.light_energy = FIRE_BREATH_LIGHT_ENERGY * 0.72
	impact_light.omni_range = clampf(length * 0.78, 0.25, 0.7)
	impact_light.global_position = target_pos + Vector3(0.0, 0.05, 0.0)
	var tw := mouth_light.create_tween()
	tw.set_parallel(true)
	tw.tween_property(mouth_light, "light_energy", 0.0, FIRE_BREATH_DURATION * 0.82).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_property(impact_light, "light_energy", 0.0, FIRE_BREATH_DURATION * 0.9).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	slot["light_tween"] = tw


func _return_fire_breath_vfx_slot(slot: Dictionary) -> void:
	var holder := slot.get("holder") as Node3D
	if is_instance_valid(holder):
		holder.name = "FireDragonBreathVFXPool"
		holder.visible = false
	for key in ["flame", "trail"]:
		var entry := slot.get(key) as Dictionary
		if entry.is_empty():
			continue
		var particles := entry.get("node") as Node3D
		if is_instance_valid(particles):
			particles.set("emitting", false)
			particles.visible = false
	for key in ["mouth_light", "impact_light"]:
		var light := slot.get(key) as Light3D
		if is_instance_valid(light):
			light.light_energy = 0.0
	slot["active"] = false


func _kill_fire_breath_slot_tweens(slot: Dictionary) -> void:
	for key in ["cleanup_tween", "light_tween"]:
		var tw := slot.get(key) as Tween
		if tw != null and tw.is_valid():
			tw.kill()
		slot[key] = null


func _exit_tree() -> void:
	for slot in _breath_vfx_pool:
		if slot is Dictionary:
			_kill_fire_breath_slot_tweens(slot)
			var holder := slot.get("holder") as Node3D
			if is_instance_valid(holder):
				holder.queue_free()
	_breath_vfx_pool.clear()


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


func _make_fire_color_key(color: Color) -> String:
	return "%.3f|%.3f|%.3f|%.3f" % [color.r, color.g, color.b, color.a]


func _create_fire_color_ramp(color: Color) -> Gradient:
	var gradient := Gradient.new()
	gradient.set_offset(0, 0.0)
	gradient.set_color(0, color)
	gradient.set_offset(1, 1.0)
	gradient.set_color(1, Color(color.r, color.g, color.b, 0.0))
	return gradient


func _get_fire_color_ramp(color: Color) -> Gradient:
	var key := _make_fire_color_key(color)
	if not _shared_fire_color_ramps.has(key):
		_shared_fire_color_ramps[key] = _create_fire_color_ramp(color)
	return _shared_fire_color_ramps[key] as Gradient


func _get_fire_color_ramp_texture(color: Color) -> GradientTexture1D:
	var key := _make_fire_color_key(color)
	if _shared_fire_color_ramp_textures.has(key):
		return _shared_fire_color_ramp_textures[key] as GradientTexture1D
	var texture := GradientTexture1D.new()
	texture.gradient = _get_fire_color_ramp(color)
	_shared_fire_color_ramp_textures[key] = texture
	return texture


func _get_fire_particle_material(texture: Texture2D, color: Color) -> StandardMaterial3D:
	var texture_key := texture.resource_path if texture != null else ""
	var key := "%s|%.3f|%.3f|%.3f|%.3f" % [texture_key, color.r, color.g, color.b, color.a]
	if not _shared_fire_particle_materials.has(key):
		_shared_fire_particle_materials[key] = _make_fire_particle_material(texture, color, true)
	return _shared_fire_particle_materials[key] as StandardMaterial3D


func _get_fire_breath_target_position() -> Vector3:
	if target_guard != null and is_instance_valid(target_guard):
		return target_guard.global_position + Vector3(0.0, 0.08, 0.0)
	if target_building.size() > 0:
		var node: Node3D = target_building.get("node", null)
		if is_instance_valid(node):
			return node.global_position + Vector3(0.0, FIRE_BREATH_TARGET_Y_OFFSET, 0.0)
	return _get_target_position() + Vector3(0.0, FIRE_BREATH_TARGET_Y_OFFSET, 0.0)


func _get_mouth_position(fallback_dir: Vector3) -> Vector3:
	var skeleton: Skeleton3D = _get_cached_fire_skeleton()
	if skeleton != null:
		var head_idx: int = _get_cached_head_bone_index(skeleton)
		if head_idx >= 0:
			var head_pose: Transform3D = skeleton.get_bone_global_pose(head_idx)
			return skeleton.global_transform * head_pose.origin + Vector3(0.0, FIRE_BREATH_MOUTH_Y_OFFSET, 0.0) + fallback_dir.normalized() * FIRE_BREATH_MOUTH_FORWARD_OFFSET
	return global_position + Vector3(0.0, 0.08 + FIRE_BREATH_MOUTH_Y_OFFSET, 0.0) + fallback_dir.normalized() * 0.18


func _get_cached_fire_skeleton() -> Skeleton3D:
	if is_instance_valid(_cached_fire_skeleton):
		return _cached_fire_skeleton
	var model := get_node_or_null("Model")
	_cached_fire_skeleton = _find_skeleton(model if model != null else self)
	_cached_fire_head_bone_idx = -2
	return _cached_fire_skeleton


func _get_cached_head_bone_index(skeleton: Skeleton3D) -> int:
	if _cached_fire_head_bone_idx != -2:
		return _cached_fire_head_bone_idx
	_cached_fire_head_bone_idx = _find_head_bone_index(skeleton)
	return _cached_fire_head_bone_idx


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
	_cached_fire_skeleton = null
	_cached_fire_head_bone_idx = -2

	_current_dragon_animation = animation_name
	_apply_skin()
	_stabilize_render_meshes()
	anim_player = _find_animation_player(animated_model)
	if anim_player:
		_current_animation_length = _play_first_imported_clip(anim_player, animation_name, true)
		BaseTroop.report_render_diagnostic(self, "troop.fire_dragon.animation.%s" % animation_name, {
			"animation": animation_name,
			"force_restart": force_restart,
			"length": snappedf(_current_animation_length, 0.001),
			"skin": int(skin),
			"rarity": nft_rarity,
		})
		return _current_animation_length
	BaseTroop.report_render_diagnostic(self, "troop.fire_dragon.animation_missing_player.%s" % animation_name, {
		"animation": animation_name,
		"skin": int(skin),
		"rarity": nft_rarity,
	})
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
	_assign_material_recursive(self, _get_body_material_for_skin(skin))


func _get_body_material_for_skin(_skin_value: DragonSkin) -> StandardMaterial3D:
	const KEY := "black"
	if _shared_body_materials.has(KEY):
		return _shared_body_materials[KEY] as StandardMaterial3D
	var body_material := StandardMaterial3D.new()
	body_material.albedo_texture = _get_skin_texture()
	body_material.roughness = 0.8
	body_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_shared_body_materials[KEY] = body_material
	return body_material


func _get_skin_texture() -> Texture2D:
	if _shared_skin_texture == null:
		_shared_skin_texture = ResourceLoader.load(SKIN_TEXTURE_PATH, "Texture2D") as Texture2D
	return _shared_skin_texture


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
