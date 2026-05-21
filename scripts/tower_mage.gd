extends Node3D
## Mage Tower — defensive building that casts magic orbs at enemy troops.
## Attached directly to the building node (like turret.gd, not via a separate
## tower unit). Fires pooled solid-blue orb projectiles at the nearest troop within
## detect_range. Attack radius matches the turret/cannon (1.0).

const LEVEL_STATS := {
	1: {"damage": 22, "fire_rate": 1.5},   # slow area-denier, not a burst killer
}

@export var detect_range: float = 1.0   # same radius as turret/cannon
@export var orb_speed: float = 1.6
## When true the crystal sinks/shrinks away while no enemy is in range. Off by
## default so the crystal stays visible (idle bob + spin) in the base view,
## where there are never enemy troops — otherwise it would always be hidden.
@export var retract_when_idle: bool = false

const ORB_COLOR: Color = Color(0.2, 0.6, 1.0)   # bright sky-blue magic bolts
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

# ── Crystal animation (idle bob + spin, retract when no target, attack pulse) ──
const CRYSTAL_BOB_FREQ: float = 0.8      # Hz — gentle up/down
const CRYSTAL_BOB_AMP: float = 0.10      # × crystal height
const CRYSTAL_SPIN_SPEED: float = 1.2    # rad/s around its own Y axis
const CRYSTAL_RETRACT_DEPTH: float = 1.3 # × crystal height to sink when dormant
const CRYSTAL_RAISE_LERP: float = 6.0    # how fast it powers up / puts away
const CRYSTAL_ATTACK_DUR: float = 0.45   # attack-pulse envelope length (s)
const CRYSTAL_ATTACK_THRUST: float = 0.15 # × crystal height — gentle upward kick on fire
const CRYSTAL_MAX_FIND_RETRIES: int = 120

var _crystal: Node3D = null
var _crystal_rest_pos: Vector3 = Vector3.ZERO
var _crystal_rest_scale: Vector3 = Vector3.ONE
var _crystal_size_y: float = 1.0
var _crystal_find_done: bool = false
var _crystal_find_retries: int = 0
var _anim_time: float = 0.0
var _raise: float = 0.0          # 0 = put away, 1 = fully raised/active
var _attack_pulse: float = 0.0   # smooth 0→1→0 envelope value (eased, no snap)
var _attack_t: float = -1.0      # envelope timer; <0 = not attacking

## Shared orb resources — one set across every mage tower.
static var _shared_mat: StandardMaterial3D = null
static var _shared_mesh: SphereMesh = null

var _pool: Array[Dictionary] = []     # {node: MeshInstance3D, active: bool, target: Node3D}
var _active: Array[Dictionary] = []
var _pool_ready: bool = false


func _ready() -> void:
	_apply_stats()
	call_deferred("_build_pool")
	# Model is added as a child after set_script(), so defer the crystal lookup.
	call_deferred("_find_crystal")


func set_level(lvl: int) -> void:
	level = lvl
	_apply_stats()
	# A new level may swap in a different FBX → re-find its crystal node.
	_crystal = null
	_crystal_find_done = false
	_crystal_find_retries = 0
	call_deferred("_find_crystal")


func _apply_stats() -> void:
	var s: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	damage = s.damage
	fire_rate = s.fire_rate


## Locates the crystal node inside the instanced FBX (named TB_MageTower_LvlN_Crystal)
## and caches its rest transform so the procedural animation has a baseline.
func _find_crystal() -> void:
	if _crystal_find_done:
		return
	var c: Node = find_child("*Crystal*", true, false)
	if c == null or not (c is Node3D):
		# Model may not be attached yet — retry on the next physics frames.
		_crystal_find_retries += 1
		return
	_crystal = c as Node3D
	_crystal_rest_pos = _crystal.position
	_crystal_rest_scale = _crystal.scale
	# Mesh-local height × the crystal's own scale → height in its PARENT space,
	# the same space as `position`, so bob/retract offsets stay proportional.
	_crystal_size_y = 1.0
	if _crystal is VisualInstance3D:
		var aabb: AABB = (_crystal as VisualInstance3D).get_aabb()
		if aabb.size.y > 0.0:
			_crystal_size_y = aabb.size.y * maxf(_crystal_rest_scale.y, 0.0001)
	_crystal_find_done = true


## Drives the crystal: idle = bob + spin, dormant = sink/shrink away,
## attack = upward thrust + faster spin + brief scale pop. Cheap, runs each frame.
func _animate_crystal(delta: float) -> void:
	if not _crystal_find_done:
		if _crystal_find_retries < CRYSTAL_MAX_FIND_RETRIES:
			_find_crystal()
		return
	if not is_instance_valid(_crystal):
		return

	var has_target: bool = _target != null and BaseTroop.is_live_troop(_target)
	# Stay raised (idle bob + spin) by default; only sink away when retract is
	# enabled AND there is no target — so the base view always shows the crystal.
	var target_raise: float = 1.0 if (has_target or not retract_when_idle) else 0.0
	_raise = move_toward(_raise, target_raise, CRYSTAL_RAISE_LERP * delta)
	_anim_time += delta
	# Smooth attack envelope: a sine bell (0 → 1 → 0) so the kick eases in AND
	# out instead of snapping — no sudden position jerk.
	if _attack_t >= 0.0:
		_attack_t += delta
		if _attack_t >= CRYSTAL_ATTACK_DUR:
			_attack_t = -1.0
			_attack_pulse = 0.0
		else:
			_attack_pulse = sin(PI * _attack_t / CRYSTAL_ATTACK_DUR)

	# Spin around own Y — scales with how raised it is, kicks up during attack.
	_crystal.rotation.y += CRYSTAL_SPIN_SPEED * (1.0 + _attack_pulse * 2.0) * _raise * delta

	# Vertical: gentle bob (idle) − retract (dormant) + thrust (attack).
	var bob: float = sin(_anim_time * TAU * CRYSTAL_BOB_FREQ) * (_crystal_size_y * CRYSTAL_BOB_AMP) * _raise
	var retract: float = (1.0 - _raise) * (_crystal_size_y * CRYSTAL_RETRACT_DEPTH)
	var thrust: float = _attack_pulse * (_crystal_size_y * CRYSTAL_ATTACK_THRUST)
	_crystal.position.y = _crystal_rest_pos.y + bob - retract + thrust

	# Shrink away when dormant; small pop on attack.
	_crystal.scale = _crystal_rest_scale * (_raise * (1.0 + _attack_pulse * 0.18))
	_crystal.visible = _raise > 0.02


func _build_pool() -> void:
	if _pool_ready:
		return
	_pool_ready = true
	if _shared_mat == null:
		# Solid, opaque sky-blue orb (no transparency) with emission for glow.
		_shared_mat = StandardMaterial3D.new()
		_shared_mat.albedo_color = ORB_COLOR
		_shared_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_shared_mat.emission_enabled = true
		_shared_mat.emission = ORB_COLOR
		_shared_mat.emission_energy_multiplier = 2.0
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
		_animate_crystal(delta)   # still run so the crystal retracts when dormant
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

	_animate_crystal(delta)


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
	_attack_t = 0.0   # start the smooth attack envelope (crystal eases up + spins faster)


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
