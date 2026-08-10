extends Node3D
## Turret — defensive building that shoots at enemy troops within range.
## Uses object pooling to avoid per-shot allocations and first-fire lag.

const LEVEL_STATS = {
	1: {"damage": 35, "fire_rate": 0.70, "detect_range": 0.95},
	2: {"damage": 74, "fire_rate": 0.70, "detect_range": 0.97},
	3: {"damage": 188, "fire_rate": 0.70, "detect_range": 0.99},
	4: {"damage": 308, "fire_rate": 0.70, "detect_range": 1.01},
	5: {"damage": 318, "fire_rate": 0.70, "detect_range": 1.10},
	6: {"damage": 364, "fire_rate": 0.70, "detect_range": 1.18},
	7: {"damage": 453, "fire_rate": 0.70, "detect_range": 1.26},
	8: {"damage": 515, "fire_rate": 0.70, "detect_range": 1.34},
	9: {"damage": 585, "fire_rate": 0.70, "detect_range": 1.42},
	10: {"damage": 660, "fire_rate": 0.70, "detect_range": 1.50},
}

const MUZZLE_FLASH_FRAMES: Array[String] = [
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_000.png",
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_001.png",
]
const FLASH_DURATION: float = 0.1   # total flash time
const FLASH_SCALE: float   = 0.15  # world-space size of flash sprite

const TRAIL_LENGTH: float   = 0.18
const TRAIL_RADIUS: float   = 0.004
const TRAIL_COLOR: Color    = Color(1.0, 0.88, 0.15, 1.0)
const TRAIL_EMISSION: float = 6.0
const POOL_SIZE: int        = 6
const POOL_BATCH: int       = 2   # build this many per frame to avoid spike
const ATTACK_SFX_PATHS: Array[String] = [
	"res://Musik/sound_effects/Turret/Turret_Attack1.mp3",
	"res://Musik/sound_effects/Turret/Turret_Attack2.mp3",
]
const ATTACK_SFX_VOLUME_DB: float = -1.0
const ATTACK_SFX_PITCH_JITTER: float = 0.04
const CAN_TARGET_GROUND: bool = true
const CAN_TARGET_AIR: bool = false

@export var detect_range: float = 0.95
@export var bullet_speed: float = 4.0

var level: int = 1
var damage: int = 80
var ward_bonus_pct: int = 0
var fire_rate: float = 1.0
var _fire_timer: float = 0.0
var _freeze_remaining: float = 0.0
var _target: Node3D = null
var _anim_player: AnimationPlayer = null
var _is_attacking: bool = false
var _model: Node3D = null
var _aim_node: Node3D = null
var _stand: Node3D = null
var _stand_base_rot_y: float = 0.0
var _barrel: Node3D = null
var _target_search_timer: float = 0.0
var _attack_sfx_player: AudioStreamPlayer = null
const TARGET_SEARCH_INTERVAL: float = 0.15
const AIM_VISUAL_INTERVAL: float = 1.0 / 30.0

## Shared materials — one for all turrets
static var _shared_trail_mat: StandardMaterial3D = null
static var _flash_textures: Array[Texture2D] = []  # loaded Texture2D frames
static var _flash_textures_preloaded: bool = false
static var _attack_sfx_streams: Array[AudioStream] = []
static var _attack_sfx_preloaded: bool = false

## Loads muzzle-flash textures once. Called at class-level cheap enough to run
## from every turret `_ready()`; the flag guards against re-loading.
static func _preload_flash_textures() -> void:
	if _flash_textures_preloaded:
		return
	_flash_textures_preloaded = true
	for path in MUZZLE_FLASH_FRAMES:
		var tex = load(path)
		if tex:
			_flash_textures.append(tex)


static func _preload_attack_sfx() -> void:
	if _attack_sfx_preloaded:
		return
	_attack_sfx_preloaded = true
	for path in ATTACK_SFX_PATHS:
		var stream: AudioStream = ResourceLoader.load(path) as AudioStream
		if stream:
			_attack_sfx_streams.append(stream)
		else:
			push_warning("Turret: missing attack sound '%s'" % path)

## Per-turret flash material — shared by all 6 pool slots of THIS turret only.
## (Cannot be global-static: concurrent turrets animate their fades independently.)
var _flash_mat: StandardMaterial3D = null

## Object pool
var _bullet_pool: Array[Dictionary] = []   # pre-created {node, trail, flash} dicts
var _active_bullets: Array[Dictionary] = [] # currently flying
var _pool_ready: bool = false
var _pool_built: int = 0       # how many pool entries created so far
var _aim_visual_timer: float = AIM_VISUAL_INTERVAL


func _ready() -> void:
	set_process(true)
	_apply_stats()
	# Preload muzzle-flash textures before the pool builder runs — moves the
	# I/O off the first-fire frame.
	_preload_flash_textures()
	_preload_attack_sfx()
	_setup_attack_sfx_player()
	# Find actual turret model (has "RootNode"), skip base outline
	for child in get_children():
		if child is Node3D and not (child is AnimationPlayer):
			if _find_node_by_name(child, "RootNode"):
				_model = child
				break
	if not _model:
		for child in get_children():
			if child is Node3D and not (child is AnimationPlayer):
				_model = child
				break
	if _model:
		_aim_node = _find_node_by_name(_model, "RootNode")
		_stand    = _find_node_by_name(_model, "Stand")
		_barrel   = _find_node_by_name(_model, "Turret")
		if _stand:
			_stand_base_rot_y = _stand.rotation.y
	_anim_player = _find_anim_player(self)
	if _anim_player:
		if _anim_player.has_animation("idle"):
			var idle_anim: Animation = _anim_player.get_animation("idle")
			idle_anim.loop_mode = Animation.LOOP_LINEAR
			_anim_player.play("idle")

	if _shared_trail_mat == null:
		_shared_trail_mat = StandardMaterial3D.new()
		_shared_trail_mat.albedo_color               = TRAIL_COLOR
		_shared_trail_mat.emission_enabled           = true
		_shared_trail_mat.emission                   = TRAIL_COLOR
		_shared_trail_mat.emission_energy_multiplier = TRAIL_EMISSION
		_shared_trail_mat.shading_mode               = BaseMaterial3D.SHADING_MODE_UNSHADED
		_shared_trail_mat.cull_mode                  = BaseMaterial3D.CULL_DISABLED
		_shared_trail_mat.no_depth_test              = false
	# Build pool eagerly — runs in the next frame after _ready so the scene root
	# is stable. Builds all POOL_SIZE entries at once; startup cost is negligible
	# compared to the spike that previously hit on the first enemy troop appearance.
	call_deferred("_build_pool_full")


func _setup_attack_sfx_player() -> void:
	if _attack_sfx_player != null:
		return
	_attack_sfx_player = AudioStreamPlayer.new()
	_attack_sfx_player.name = "AttackSFX"
	_attack_sfx_player.volume_db = ATTACK_SFX_VOLUME_DB
	add_child(_attack_sfx_player)


func _play_attack_sfx() -> void:
	if _attack_sfx_streams.is_empty():
		_preload_attack_sfx()
	if _attack_sfx_streams.is_empty():
		return
	if _attack_sfx_player == null:
		_setup_attack_sfx_player()
	_attack_sfx_player.stream = _attack_sfx_streams.pick_random()
	_attack_sfx_player.pitch_scale = randf_range(1.0 - ATTACK_SFX_PITCH_JITTER, 1.0 + ATTACK_SFX_PITCH_JITTER)
	_attack_sfx_player.play()


func _build_pool() -> void:
	if _pool_ready:
		return
	# Textures are preloaded in `_ready` via _preload_flash_textures(); safety net
	# if someone calls _build_pool out of order.
	if _flash_textures.is_empty():
		_preload_flash_textures()

	# Create the per-turret flash material once (shared by all pool slots of this turret).
	# Per-turret (not static) because concurrent turrets animate their fades independently.
	if _flash_mat == null:
		_flash_mat = StandardMaterial3D.new()
		_flash_mat.shading_mode  = BaseMaterial3D.SHADING_MODE_UNSHADED
		_flash_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		_flash_mat.transparency  = BaseMaterial3D.TRANSPARENCY_ALPHA
		_flash_mat.blend_mode    = BaseMaterial3D.BLEND_MODE_ADD
		_flash_mat.no_depth_test = true
		_flash_mat.cull_mode     = BaseMaterial3D.CULL_DISABLED
		if _flash_textures.size() > 0:
			_flash_mat.albedo_texture = _flash_textures[0]
		_flash_mat.albedo_color  = Color(1.5, 1.2, 0.8, 1.0)

	# Build POOL_BATCH entries per frame to spread load
	var scene_root: Node = get_tree().current_scene
	var built_this_frame: int = 0
	while _pool_built < POOL_SIZE and built_this_frame < POOL_BATCH:
		var bullet: Node3D = Node3D.new()
		bullet.visible = false
		scene_root.add_child(bullet)

		var trail_mesh: CylinderMesh = CylinderMesh.new()
		trail_mesh.top_radius    = TRAIL_RADIUS
		trail_mesh.bottom_radius = TRAIL_RADIUS
		trail_mesh.height        = 1.0
		var trail: MeshInstance3D = MeshInstance3D.new()
		trail.mesh              = trail_mesh
		trail.material_override = _shared_trail_mat
		trail.visible           = false
		scene_root.add_child(trail)

		# Muzzle flash — QuadMesh with ADD blend (black bg becomes invisible)
		var flash: MeshInstance3D = MeshInstance3D.new()
		var quad: QuadMesh = QuadMesh.new()
		quad.size = Vector2(FLASH_SCALE, FLASH_SCALE)
		# Flash in PNG is off-center (left side) — shift quad so flash aligns with muzzle
		quad.center_offset = Vector3(FLASH_SCALE * 0.2, 0.0, 0.0)
		flash.mesh = quad
		flash.material_override = _flash_mat  # shared — one GPU resource per turret
		flash.visible = false
		scene_root.add_child(flash)

		_bullet_pool.append({
			"node": bullet,
			"trail": trail,
			"flash": flash,
			"active": false,
			"target": null,
			"spawn_pos": Vector3.ZERO,
			"flash_timer": 0.0,
			"flash_frame": 0,
		})
		_pool_built += 1
		built_this_frame += 1

	if _pool_built >= POOL_SIZE:
		_pool_ready = true


## Builds the complete pool in a single frame — called once from _ready via call_deferred.
## Safe at startup because there is no combat yet, so the one-time allocation cost is free.
func _build_pool_full() -> void:
	while not _pool_ready:
		_build_pool()


func _get_pooled_bullet() -> Dictionary:
	for b in _bullet_pool:
		if not b.active:
			return b
	# Pool exhausted — skip this shot
	return {}


func _apply_stats() -> void:
	var s: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = ceili(float(s.damage) * (1.0 + float(ward_bonus_pct) / 100.0))
	fire_rate = s.fire_rate
	detect_range = s.detect_range


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()


func set_ward_bonus_pct(pct: int) -> void:
	ward_bonus_pct = maxi(0, pct)
	_apply_stats()


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)
	# Lazy init model/barrel (runs once)
	if not _model:
		# Find the actual turret model (has "RootNode" child), skip base outline
		for child in get_children():
			if child is Node3D and not (child is AnimationPlayer):
				if _find_node_by_name(child, "RootNode"):
					_model = child
					break
		# Fallback: first Node3D child
		if not _model:
			for child in get_children():
				if child is Node3D and not (child is AnimationPlayer):
					_model = child
					break
		if _model:
			_aim_node = _find_node_by_name(_model, "RootNode")
			_stand    = _find_node_by_name(_model, "Stand")
			_barrel   = _find_node_by_name(_model, "Turret")
			if _stand:
				_stand_base_rot_y = _stand.rotation.y
			_anim_player = _find_anim_player(self)
			if _anim_player and _anim_player.has_animation("idle"):
				var idle_anim: Animation = _anim_player.get_animation("idle")
				idle_anim.loop_mode = Animation.LOOP_LINEAR
				_anim_player.play("idle")
		return

	# Ensure pool is built
	if not _pool_ready:
		_build_pool_full()
		if not _pool_ready:
			return

	# Skip everything if no enemies exist (saves CPU in idle)
	var troops_exist: bool = BaseTroop._get_troops_cached().size() > 0
	if not troops_exist and _active_bullets.size() == 0:
		if _is_attacking:
			_is_attacking = false
			_target = null
			if _anim_player and _anim_player.has_animation("idle"):
				_anim_player.play("idle")
		return

	_update_bullets(delta)
	if _freeze_remaining > 0.0:
		_freeze_remaining = maxf(0.0, _freeze_remaining - delta)
		if _anim_player and _anim_player.has_animation("idle") and _anim_player.current_animation != "idle":
			_anim_player.play("idle")
		return

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		var diff: Vector3 = _target.global_position - global_position
		diff.y = 0
		var d_sq: float = diff.length_squared()
		_aim_visual_timer += delta
		if d_sq > 0.0001 and _aim_visual_timer >= AIM_VISUAL_INTERVAL:
			_aim_visual_timer = fmod(_aim_visual_timer, AIM_VISUAL_INTERVAL)
			if _aim_node:
				var parent_basis_inv: Basis = _aim_node.get_parent().global_transform.basis.inverse()
				var local_dir: Vector3 = parent_basis_inv * (diff / sqrt(d_sq))
				var y_angle: float = atan2(local_dir.x, local_dir.z)
				_aim_node.rotation.y = y_angle
				if _stand:
					_stand.rotation.y = _stand_base_rot_y - y_angle

		if not _is_attacking:
			_is_attacking = true
			_fire_timer = fire_rate

		_fire_timer += delta
		if _fire_timer >= fire_rate:
			_fire_timer -= fire_rate
			if _anim_player and _anim_player.has_animation("attack"):
				_anim_player.stop()
				_anim_player.play("attack")
			_spawn_bullet()
	else:
		if _is_attacking:
			_is_attacking = false
			_fire_timer = 0.0
			if _anim_player and _anim_player.has_animation("idle"):
				_anim_player.play("idle")


func freeze_for(duration: float) -> void:
	_freeze_remaining = maxf(_freeze_remaining, maxf(0.0, duration))


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	if _target and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		var dx = global_position.x - _target.global_position.x
		var dz = global_position.z - _target.global_position.z
		if dx * dx + dz * dz <= detect_sq:
			return
	_target = null
	var nearest_dist_sq: float = detect_sq
	var my_pos: Vector3 = global_position
	var troops: Array = BaseTroop._get_troops_cached()
	var troop_positions: PackedVector3Array = BaseTroop._get_troop_positions_cached()
	for troop_index in range(troops.size()):
		var troop: Variant = troops[troop_index]
		if not BaseTroop.can_defense_target_troop(troop, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			continue
		var troop_pos: Vector3 = troop_positions[troop_index]
		var dx: float = my_pos.x - troop_pos.x
		var dz: float = my_pos.z - troop_pos.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_target = troop


func _get_muzzle_pos() -> Vector3:
	if _barrel and _aim_node:
		var barrel_dir: Vector3 = _aim_node.global_transform.basis.z
		return _barrel.global_position + Vector3(0, 0.05, 0) + barrel_dir * 205.0
	return global_position + Vector3(0, 0.18, 0)


func _record_defense_telemetry(kind: String, target: Node3D, extra: Dictionary = {}) -> void:
	if not is_instance_valid(target):
		return
	var payload := {
		"defense_type": "turret",
		"server_id": int(get_meta("server_id", -1)),
		"target_instance": int(target.get_instance_id()),
		"target_x": snappedf(target.global_position.x, 0.001),
		"target_z": snappedf(target.global_position.z, 0.001),
	}
	var target_hp: Variant = target.get("hp")
	if target_hp != null:
		payload["target_hp"] = int(target_hp)
	var target_level: Variant = target.get("level")
	if target_level != null:
		payload["target_level"] = int(target_level)
	var target_name := ""
	if target.has_method("_get_troop_name"):
		target_name = str(target.call("_get_troop_name"))
	if target_name != "":
		payload["target_troop"] = target_name
	for key in extra.keys():
		payload[key] = extra[key]
	for bs_node in BaseTroop._get_building_systems_cached():
		if is_instance_valid(bs_node) and bs_node.has_method("record_replay_telemetry"):
			bs_node.record_replay_telemetry(kind, payload)
			return


func _spawn_bullet() -> void:
	if not BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		return

	var b: Dictionary = _get_pooled_bullet()
	if b.is_empty():
		return

	var spawn_pos: Vector3 = _get_muzzle_pos()

	b.active = true
	b.target = _target
	b.spawn_pos = spawn_pos
	b.flash_timer = FLASH_DURATION

	# Activate bullet node
	b.node.global_position = spawn_pos
	b.node.visible = true

	# Reset trail
	b.trail.visible = false

	# Muzzle flash quad
	b.flash.global_position = spawn_pos
	b.flash.visible = true
	b.flash_frame = 0
	_flash_mat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
	if _flash_textures.size() > 0:
		_flash_mat.albedo_texture = _flash_textures[0]

	_active_bullets.append(b)
	_play_attack_sfx()
	_record_defense_telemetry("defense_fire", _target, {
		"damage": damage,
		"projectile_x": snappedf(spawn_pos.x, 0.001),
		"projectile_y": snappedf(spawn_pos.y, 0.001),
		"projectile_z": snappedf(spawn_pos.z, 0.001),
		"pool_active": _active_bullets.size(),
	})


func _update_bullets(delta: float) -> void:
	var i: int = _active_bullets.size() - 1
	while i >= 0:
		var b: Dictionary = _active_bullets[i]

		# Animate muzzle flash — swap frames then fade out
		if b.flash_timer > 0:
			b.flash_timer -= delta
			var progress: float = 1.0 - clampf(b.flash_timer / FLASH_DURATION, 0.0, 1.0)
			# Switch texture frame based on progress
			var frame_idx: int = int(progress * _flash_textures.size())
			frame_idx = clampi(frame_idx, 0, _flash_textures.size() - 1)
			if frame_idx != b.flash_frame and frame_idx < _flash_textures.size():
				_flash_mat.albedo_texture = _flash_textures[frame_idx]
				b.flash_frame = frame_idx
			# Fade out in last 40%
			if progress > 0.6:
				var fade: float = (1.0 - progress) / 0.4
				_flash_mat.albedo_color = Color(1.5 * fade, 1.2 * fade, 0.8 * fade, fade)
			if b.flash_timer <= 0:
				b.flash.visible = false

		# Target died — return to pool
		if not BaseTroop.can_defense_target_troop(b.target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			_return_to_pool(b)
			_remove_active_bullet_at(i)
			i -= 1
			continue

		var target_pos: Vector3 = b.target.global_position + Vector3(0, 0.2, 0)
		b.node.global_position = b.node.global_position.move_toward(target_pos, bullet_speed * delta)

		# Update tracer trail
		var cur: Vector3 = b.node.global_position
		var full_dir: Vector3 = cur - b.spawn_pos
		var full_len_sq: float = full_dir.length_squared()
		if full_len_sq > 0.000004:  # 0.002²
			var full_len: float = sqrt(full_len_sq)
			var unit: Vector3 = full_dir / full_len
			var trail_len: float = minf(full_len, TRAIL_LENGTH)
			var tail: Vector3 = cur - unit * trail_len
			var mid: Vector3 = (tail + cur) * 0.5
			var trail: MeshInstance3D = b.trail
			trail.visible = true
			trail.global_position = mid
			# Orient cylinder along bullet direction
			if absf(unit.y) < 0.99:
				trail.look_at(cur, Vector3.UP)
			else:
				trail.look_at(cur, Vector3.RIGHT)
			trail.rotate_object_local(Vector3.RIGHT, PI * 0.5)
			trail.scale = Vector3(1.0, trail_len, 1.0)
		else:
			b.trail.visible = false

		# Hit detection
		var hit_diff: Vector3 = b.node.global_position - target_pos
		if hit_diff.length_squared() < 0.0009:  # 0.03²
			var hp_before: int = int(b.target.get("hp")) if b.target.get("hp") != null else 0
			if b.target.has_method("take_damage"):
				b.target.take_damage(damage)
			elif "hp" in b.target:
				b.target.hp -= damage
				if b.target.hp <= 0:
					b.target.queue_free()
			var hp_after: int = int(b.target.get("hp")) if is_instance_valid(b.target) and b.target.get("hp") != null else hp_before - damage
			_record_defense_telemetry("defense_projectile_hit", b.target, {
				"damage": damage,
				"hp_before": hp_before,
				"hp_after": hp_after,
				"projectile_x": snappedf(b.node.global_position.x, 0.001),
				"projectile_y": snappedf(b.node.global_position.y, 0.001),
				"projectile_z": snappedf(b.node.global_position.z, 0.001),
				"hit_dist_sq": snappedf(hit_diff.length_squared(), 0.0001),
			})
			_return_to_pool(b)
			_remove_active_bullet_at(i)
		i -= 1


func _remove_active_bullet_at(index: int) -> void:
	if index >= 0 and index < _active_bullets.size():
		_active_bullets.remove_at(index)


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target = null
	b.node.visible = false
	b.trail.visible = false
	b.flash.visible = false


func _exit_tree() -> void:
	for b in _bullet_pool:
		if is_instance_valid(b.node):
			b.node.queue_free()
		if is_instance_valid(b.trail):
			b.trail.queue_free()
		if is_instance_valid(b.flash):
			b.flash.queue_free()
	_bullet_pool.clear()
	_active_bullets.clear()


func _find_node_by_name(node: Node, target_name: String) -> Node3D:
	if node.name == target_name and node is Node3D:
		return node
	for child in node.get_children():
		var result: Node3D = _find_node_by_name(child, target_name)
		if result:
			return result
	return null


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result: AnimationPlayer = _find_anim_player(child)
		if result:
			return result
	return null
