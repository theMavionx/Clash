extends Node3D
## Turret — defensive building that shoots at enemy troops within range.

const LEVEL_STATS = {
	1: {"damage": 80, "fire_rate": 1.0},
	2: {"damage": 180, "fire_rate": 0.5},
	3: {"damage": 320, "fire_rate": 0.333},
}

@export var detect_range: float = 1.0  # ~3 grid cells (increased for safety)
@export var bullet_speed: float = 4.0
@export var bullet_radius: float = 0.015
@export var bullet_color: Color = Color(1.0, 0.6, 0.1)

var level: int = 1
var damage: int = 80
var fire_rate: float = 1.0
var _fire_timer: float = 0.0
var _target: Node3D = null
var _anim_player: AnimationPlayer
var _is_attacking: bool = false
var _bullets: Array = []
var _model: Node3D = null
var _aim_node: Node3D = null   # RootNode — rotate Y for aiming
var _stand: Node3D = null      # Stand — counter-rotate to keep base fixed
var _stand_base_rot_y: float = 0.0


func _ready() -> void:
	set_process(true)
	_apply_stats()
	# Find the model child (first non-AnimationPlayer child)
	for child in get_children():
		if child is Node3D and not (child is AnimationPlayer):
			_model = child
			break
	if _model:
		_aim_node = _find_node_by_name(_model, "RootNode")
		_stand = _find_node_by_name(_model, "Stand")
		if _stand:
			_stand_base_rot_y = _stand.rotation.y
	_anim_player = _find_anim_player(self)
	if _anim_player:
		if _anim_player.has_animation("idle"):
			var idle_anim = _anim_player.get_animation("idle")
			idle_anim.loop_mode = Animation.LOOP_LINEAR
			_anim_player.play("idle")


func _apply_stats() -> void:
	var s = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = s.damage
	fire_rate = s.fire_rate


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()


func _process(delta: float) -> void:
	_update_bullets(delta)
	_find_target()

	if _target and is_instance_valid(_target):
		# Rotate RootNode Y to aim, but counter-rotate Stand so base stays fixed
		if _aim_node:
			var diff = _target.global_position - global_position
			diff.y = 0
			if diff.length() > 0.01:
				var parent_basis_inv = _aim_node.get_parent().global_transform.basis.inverse()
				var local_dir = parent_basis_inv * diff.normalized()
				var y_angle = atan2(local_dir.x, local_dir.z)
				_aim_node.rotation.y = y_angle
				# Keep stand fixed by cancelling the parent rotation
				if _stand:
					_stand.rotation.y = _stand_base_rot_y - y_angle

		# Play attack animation
		if not _is_attacking:
			_is_attacking = true
			if _anim_player and _anim_player.has_animation("attack"):
				_anim_player.play("attack")

		# Fire bullets
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
	# Keep current target until it dies or leaves range
	if _target and is_instance_valid(_target):
		if global_position.distance_to(_target.global_position) <= detect_range:
			return
	# Find new nearest enemy
	_target = null
	var nearest_dist = detect_range
	for troop in get_tree().get_nodes_in_group("troops"):
		if not is_instance_valid(troop):
			continue
		var d = global_position.distance_to(troop.global_position)
		if d < nearest_dist:
			nearest_dist = d
			_target = troop


func _spawn_bullet() -> void:
	if not _target or not is_instance_valid(_target):
		return
	var bullet = Node3D.new()
	var mesh_inst = MeshInstance3D.new()
	var sphere = SphereMesh.new()
	sphere.radius = bullet_radius
	sphere.height = bullet_radius * 2
	mesh_inst.mesh = sphere
	var mat = StandardMaterial3D.new()
	mat.albedo_color = bullet_color
	mat.emission_enabled = true
	mat.emission = bullet_color
	mat.emission_energy_multiplier = 3.0
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh_inst.material_override = mat
	bullet.add_child(mesh_inst)

	get_tree().current_scene.add_child(bullet)
	bullet.global_position = global_position + Vector3(0, 0.1, 0)

	_bullets.append({
		"node": bullet,
		"target": _target,
	})


func _update_bullets(delta: float) -> void:
	var i = _bullets.size() - 1
	while i >= 0:
		var b = _bullets[i]
		if not is_instance_valid(b.node):
			_bullets.remove_at(i)
			i -= 1
			continue
		if not is_instance_valid(b.target):
			b.node.queue_free()
			_bullets.remove_at(i)
			i -= 1
			continue

		var target_pos = b.target.global_position + Vector3(0, 0.05, 0)
		b.node.global_position = b.node.global_position.move_toward(target_pos, bullet_speed * delta)

		if b.node.global_position.distance_to(target_pos) < 0.03:
			# Hit!
			if b.target.has_method("take_damage"):
				b.target.take_damage(damage)
			elif "hp" in b.target:
				b.target.hp -= damage
				if b.target.hp <= 0:
					b.target.queue_free()
			b.node.queue_free()
			_bullets.remove_at(i)
		i -= 1


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
