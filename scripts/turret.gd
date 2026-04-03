extends Node3D
## Turret — defensive building that shoots at enemy troops within range.
## Uses object pooling to avoid per-shot allocations and first-fire lag.

const LEVEL_STATS = {
	1: {"damage": 80, "fire_rate": 0.5},
	2: {"damage": 180, "fire_rate": 0.25},
	3: {"damage": 320, "fire_rate": 0.166},
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

@export var detect_range: float = 1.0
@export var bullet_speed: float = 4.0

var level: int = 1
var damage: int = 80
var fire_rate: float = 1.0
var _fire_timer: float = 0.0
var _target: Node3D = null
var _anim_player: AnimationPlayer = null
var _is_attacking: bool = false
var _model: Node3D = null
var _aim_node: Node3D = null
var _stand: Node3D = null
var _stand_base_rot_y: float = 0.0
var _barrel: Node3D = null
var _target_search_timer: float = 0.0
const TARGET_SEARCH_INTERVAL: float = 0.15

## Shared materials — one for all turrets
static var _shared_trail_mat: StandardMaterial3D = null
static var _flash_textures: Array[Texture2D] = []  # loaded Texture2D frames

## Per-turret flash material — shared by all 6 pool slots of THIS turret only.
## (Cannot be global-static: concurrent turrets animate their fades independently.)
var _flash_mat: StandardMaterial3D = null

## Object pool
var _bullet_pool: Array[Dictionary] = []   # pre-created {node, trail, flash} dicts
var _active_bullets: Array[Dictionary] = [] # currently flying
var _pool_ready: bool = false
var _pool_built: int = 0       # how many pool entries created so far


func _ready() -> void:
	set_process(true)
	_apply_stats()
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


func _build_pool() -> void:
	if _pool_ready:
		return
	# Load flash textures once
	if _flash_textures.is_empty():
		for path in MUZZLE_FLASH_FRAMES:
			var tex = load(path)
			if tex:
				_flash_textures.append(tex)

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
	damage   = s.damage
	fire_rate = s.fire_rate


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()


func _process(delta: float) -> void:
	delta = minf(delta, 0.1)
	# Lazy init barrel
	if not _barrel:
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

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and is_instance_valid(_target):
		if _aim_node:
			var diff: Vector3 = _target.global_position - global_position
			diff.y = 0
			var d_sq: float = diff.length_squared()
			if d_sq > 0.0001:
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


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	if _target and is_instance_valid(_target):
		var dx = global_position.x - _target.global_position.x
		var dz = global_position.z - _target.global_position.z
		if dx * dx + dz * dz <= detect_sq:
			return
	_target = null
	var nearest_dist_sq: float = detect_sq
	var my_pos: Vector3 = global_position
	for troop in BaseTroop._get_troops_cached():
		if not is_instance_valid(troop):
			continue
		var dx: float = my_pos.x - troop.global_position.x
		var dz: float = my_pos.z - troop.global_position.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq < nearest_dist_sq:
			nearest_dist_sq = d_sq
			_target = troop


func _get_muzzle_pos() -> Vector3:
	if _barrel and _aim_node:
		var barrel_dir: Vector3 = _aim_node.global_transform.basis.z
		return _barrel.global_position + Vector3(0, 0.05, 0) + barrel_dir * 205.0
	return global_position + Vector3(0, 0.18, 0)


func _spawn_bullet() -> void:
	if not _target or not is_instance_valid(_target):
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
		if not is_instance_valid(b.target):
			_return_to_pool(b)
			_active_bullets.remove_at(i)
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
			if b.target.has_method("take_damage"):
				b.target.take_damage(damage)
			elif "hp" in b.target:
				b.target.hp -= damage
				if b.target.hp <= 0:
					b.target.queue_free()
			_return_to_pool(b)
			_active_bullets.remove_at(i)
		i -= 1


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
