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
var _anim_player: AnimationPlayer
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
static var _flash_textures: Array = []  # loaded Texture2D frames

## Object pool
var _bullet_pool: Array = []   # pre-created {node, trail, flash} dicts
var _active_bullets: Array = [] # currently flying
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
			var idle_anim = _anim_player.get_animation("idle")
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


func _build_pool() -> void:
	if _pool_ready:
		return
	# Load flash textures once
	if _flash_textures.is_empty():
		for path in MUZZLE_FLASH_FRAMES:
			var tex = load(path)
			if tex:
				_flash_textures.append(tex)

	# Build POOL_BATCH entries per frame to spread load
	var scene_root = get_tree().current_scene
	var built_this_frame = 0
	while _pool_built < POOL_SIZE and built_this_frame < POOL_BATCH:
		var bullet = Node3D.new()
		bullet.visible = false
		scene_root.add_child(bullet)

		var trail_mesh = CylinderMesh.new()
		trail_mesh.top_radius    = TRAIL_RADIUS
		trail_mesh.bottom_radius = TRAIL_RADIUS
		trail_mesh.height        = 1.0
		var trail = MeshInstance3D.new()
		trail.mesh              = trail_mesh
		trail.material_override = _shared_trail_mat
		trail.visible           = false
		scene_root.add_child(trail)

		# Muzzle flash — QuadMesh with ADD blend (black bg becomes invisible)
		var flash = MeshInstance3D.new()
		var quad = QuadMesh.new()
		quad.size = Vector2(FLASH_SCALE, FLASH_SCALE)
		# Flash in PNG is off-center (left side) — shift quad so flash aligns with muzzle
		quad.center_offset = Vector3(FLASH_SCALE * 0.2, 0.0, 0.0)
		flash.mesh = quad
		var flash_mat = StandardMaterial3D.new()
		flash_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		flash_mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		flash_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		flash_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		flash_mat.no_depth_test = true
		flash_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		if _flash_textures.size() > 0:
			flash_mat.albedo_texture = _flash_textures[0]
		flash_mat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
		flash.material_override = flash_mat
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


func _get_pooled_bullet() -> Dictionary:
	for b in _bullet_pool:
		if not b.active:
			return b
	# Pool exhausted — skip this shot
	return {}


func _apply_stats() -> void:
	var s = LEVEL_STATS.get(level, LEVEL_STATS[1])
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
				var idle_anim = _anim_player.get_animation("idle")
				idle_anim.loop_mode = Animation.LOOP_LINEAR
				_anim_player.play("idle")
		return

	# Build pool on first frame with barrel ready
	if not _pool_ready:
		_build_pool()

	_update_bullets(delta)

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and is_instance_valid(_target):
		if _aim_node:
			var diff = _target.global_position - global_position
			diff.y = 0
			if diff.length() > 0.01:
				var parent_basis_inv = _aim_node.get_parent().global_transform.basis.inverse()
				var local_dir = parent_basis_inv * diff.normalized()
				var y_angle = atan2(local_dir.x, local_dir.z)
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
	if _target and is_instance_valid(_target):
		if global_position.distance_to(_target.global_position) <= detect_range:
			return
	_target = null
	var nearest_dist = detect_range
	var troops = BaseTroop._get_troops_cached()
	for troop in troops:
		if not is_instance_valid(troop):
			continue
		var d = global_position.distance_to(troop.global_position)
		if d < nearest_dist:
			nearest_dist = d
			_target = troop


func _get_muzzle_pos() -> Vector3:
	if _barrel and _aim_node:
		var barrel_dir: Vector3 = _aim_node.global_transform.basis.z
		return _barrel.global_position + Vector3(0, 0.05, 0) + barrel_dir * 205.0
	return global_position + Vector3(0, 0.18, 0)


func _spawn_bullet() -> void:
	if not _target or not is_instance_valid(_target):
		return

	var b = _get_pooled_bullet()
	if b.is_empty():
		return

	var spawn_pos = _get_muzzle_pos()

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
	var fmat = b.flash.material_override as StandardMaterial3D
	fmat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
	if _flash_textures.size() > 0:
		fmat.albedo_texture = _flash_textures[0]

	_active_bullets.append(b)


func _update_bullets(delta: float) -> void:
	var i = _active_bullets.size() - 1
	while i >= 0:
		var b = _active_bullets[i]

		# Animate muzzle flash — swap frames then fade out
		if b.flash_timer > 0:
			b.flash_timer -= delta
			var progress = 1.0 - clampf(b.flash_timer / FLASH_DURATION, 0.0, 1.0)
			# Switch texture frame based on progress
			var frame_idx = int(progress * _flash_textures.size())
			frame_idx = clampi(frame_idx, 0, _flash_textures.size() - 1)
			if frame_idx != b.flash_frame and frame_idx < _flash_textures.size():
				var fmat = b.flash.material_override as StandardMaterial3D
				fmat.albedo_texture = _flash_textures[frame_idx]
				b.flash_frame = frame_idx
			# Fade out in last 40%
			if progress > 0.6:
				var fmat = b.flash.material_override as StandardMaterial3D
				var fade = (1.0 - progress) / 0.4
				fmat.albedo_color = Color(1.5 * fade, 1.2 * fade, 0.8 * fade, fade)
			if b.flash_timer <= 0:
				b.flash.visible = false

		# Target died — return to pool
		if not is_instance_valid(b.target):
			_return_to_pool(b)
			_active_bullets.remove_at(i)
			i -= 1
			continue

		var target_pos = b.target.global_position + Vector3(0, 0.2, 0)
		var dir = target_pos - b.node.global_position
		if dir.length() > 0.001:
			b.node.look_at(target_pos, Vector3.UP)
		b.node.global_position = b.node.global_position.move_toward(target_pos, bullet_speed * delta)

		# Update tracer trail
		var trail = b.trail
		var cur  = b.node.global_position
		var from = b.spawn_pos
		var full_dir = cur - from
		var full_len = full_dir.length()
		if full_len > 0.002:
			var unit = full_dir / full_len
			var tail = cur - unit * min(full_len, TRAIL_LENGTH)
			var dist = tail.distance_to(cur)
			var mid  = (tail + cur) * 0.5
			trail.visible = true
			trail.global_position = mid
			var look_dir = cur - trail.global_position
			if look_dir.length() > 0.001:
				if abs(look_dir.normalized().dot(Vector3.UP)) < 0.99:
					trail.look_at(cur, Vector3.UP)
				else:
					trail.look_at(cur, Vector3.RIGHT)
				trail.rotate_object_local(Vector3.RIGHT, PI * 0.5)
			trail.scale = Vector3(1.0, dist, 1.0)
		else:
			trail.visible = false

		# Hit detection
		if b.node.global_position.distance_to(target_pos) < 0.03:
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
		var result = _find_node_by_name(child, target_name)
		if result:
			return result
	return null


func _find_anim_player(node: Node) -> AnimationPlayer:
	if node is AnimationPlayer:
		return node
	for child in node.get_children():
		var result = _find_anim_player(child)
		if result:
			return result
	return null
