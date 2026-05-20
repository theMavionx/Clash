extends Node3D
## Mage Tower — defensive building that casts magic orbs at enemy troops.
## Attached directly to the building node (like turret.gd, not via a separate
## tower unit). Fires pooled magic_orb projectiles at the nearest troop within
## detect_range. Attack radius matches the turret/cannon (1.0).

const LEVEL_STATS := {
	1: {"damage": 70,  "fire_rate": 1.5},   # slower than archer, bigger single hit
	2: {"damage": 110, "fire_rate": 1.3},
	3: {"damage": 160, "fire_rate": 1.1},
}

@export var detect_range: float = 1.0   # same radius as turret/cannon
@export var orb_speed: float = 1.6

const ORB_COLOR: Color = Color(0.65, 0.1, 1.0)   # purple — matches the tower
const POOL_SIZE: int = 6
const HIT_DIST_SQ: float = 0.05 * 0.05
const TARGET_SEARCH_INTERVAL: float = 0.15
const ORB_SPAWN_Y: float = 0.35

var level: int = 1
var damage: int = 70
var fire_rate: float = 1.5
var _fire_timer: float = 0.0
var _target: Node3D = null
var _target_search_timer: float = 0.0

## Shared orb resources — one set across every mage tower.
static var _shared_shader: Shader = null
static var _shared_mat: ShaderMaterial = null
static var _shared_mesh: SphereMesh = null

var _pool: Array[Dictionary] = []     # {node: MeshInstance3D, active: bool, target: Node3D}
var _active: Array[Dictionary] = []
var _pool_ready: bool = false


func _ready() -> void:
	_apply_stats()
	call_deferred("_build_pool")


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()


func _apply_stats() -> void:
	var s: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = s.damage
	fire_rate = s.fire_rate


static func _create_noise(seed_val: int, freq: float) -> NoiseTexture2D:
	var tex := NoiseTexture2D.new()
	tex.width = 32
	tex.height = 32
	tex.seamless = true
	tex.generate_mipmaps = false
	var n := FastNoiseLite.new()
	n.seed = seed_val
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = freq
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 2
	n.fractal_lacunarity = 2.0
	n.fractal_gain = 0.5
	tex.noise = n
	return tex


func _build_pool() -> void:
	if _pool_ready:
		return
	_pool_ready = true
	if _shared_shader == null:
		_shared_shader = load("res://shaders/magic_orb.gdshader")
	if _shared_mat == null:
		_shared_mat = ShaderMaterial.new()
		_shared_mat.shader = _shared_shader
		_shared_mat.set_shader_parameter("tint", Vector3(ORB_COLOR.r, ORB_COLOR.g, ORB_COLOR.b))
		_shared_mat.set_shader_parameter("intensity", 2.0)
		_shared_mat.set_shader_parameter("noise1", _create_noise(17, 0.04))
		_shared_mat.set_shader_parameter("noise2", _create_noise(53, 0.06))
	if _shared_mesh == null:
		_shared_mesh = SphereMesh.new()
		_shared_mesh.radius = 0.05   # slightly larger than the Mage troop's orb
		_shared_mesh.height = 0.10
		_shared_mesh.radial_segments = 8
		_shared_mesh.rings = 4
	var scene_root: Node = get_tree().current_scene
	for i in POOL_SIZE:
		var mesh_inst := MeshInstance3D.new()
		mesh_inst.mesh = _shared_mesh
		mesh_inst.material_override = _shared_mat
		mesh_inst.visible = false
		scene_root.add_child(mesh_inst)
		_pool.append({"node": mesh_inst, "active": false, "target": null})


func _get_pooled() -> Dictionary:
	for b in _pool:
		if not b.active:
			return b
	return {}


func _return_to_pool(b: Dictionary) -> void:
	b.active = false
	b.target = null
	if is_instance_valid(b.node):
		b.node.visible = false


func _exit_tree() -> void:
	for b in _pool:
		if is_instance_valid(b.node):
			b.node.queue_free()
	_pool.clear()
	_active.clear()


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)
	if not _pool_ready:
		return

	# Advance in-flight orbs every frame so they keep travelling/hitting even
	# while no new target exists.
	_update_orbs(delta)

	# Idle fast-path: no troops on the field and nothing in flight.
	if BaseTroop._get_troops_cached().size() == 0 and _active.size() == 0:
		_target = null
		return

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and BaseTroop.is_live_troop(_target):
		_fire_timer += delta
		if _fire_timer >= fire_rate:
			_fire_timer -= fire_rate
			_spawn_orb(_target)
	else:
		_fire_timer = fire_rate   # ready to fire the instant a target appears


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	# Keep the current target if it's still alive and in range.
	if _target and BaseTroop.is_live_troop(_target):
		var dx0: float = global_position.x - _target.global_position.x
		var dz0: float = global_position.z - _target.global_position.z
		if dx0 * dx0 + dz0 * dz0 <= detect_sq:
			return
	_target = null
	var nearest_sq: float = detect_sq
	var my_pos: Vector3 = global_position
	for troop in BaseTroop._get_troops_cached():
		if not BaseTroop.is_live_troop(troop):
			continue
		var dx: float = my_pos.x - troop.global_position.x
		var dz: float = my_pos.z - troop.global_position.z
		var d_sq: float = dx * dx + dz * dz
		if d_sq < nearest_sq:
			nearest_sq = d_sq
			_target = troop


func _spawn_orb(target: Node3D) -> void:
	if not BaseTroop.is_live_troop(target):
		return
	var b: Dictionary = _get_pooled()
	if b.is_empty():
		return
	b.active = true
	b.target = target
	b.node.global_position = global_position + Vector3(0, ORB_SPAWN_Y, 0)
	b.node.visible = true
	_active.append(b)


func _update_orbs(delta: float) -> void:
	var i: int = _active.size() - 1
	while i >= 0:
		var p: Dictionary = _active[i]
		if not is_instance_valid(p.node):
			_active.remove_at(i)
			i -= 1
			continue
		var target: Node3D = p.target
		if not BaseTroop.is_live_troop(target):
			_return_to_pool(p)
			_active.remove_at(i)
			i -= 1
			continue
		var target_pos: Vector3 = target.global_position + Vector3(0, BaseTroop.TARGET_AIM_Y, 0)
		p.node.global_position = p.node.global_position.move_toward(target_pos, orb_speed * delta)
		var dx: float = p.node.global_position.x - target_pos.x
		var dy: float = p.node.global_position.y - target_pos.y
		var dz: float = p.node.global_position.z - target_pos.z
		if dx * dx + dy * dy + dz * dz < HIT_DIST_SQ:
			if target.has_method("take_damage"):
				target.take_damage(damage)
			_return_to_pool(p)
			_active.remove_at(i)
		i -= 1
