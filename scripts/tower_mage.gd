extends Node3D
## Mage Tower - single-target inferno-style beam defense.
##
## The tower locks one troop in range, keeps a continuous beam on it, and ramps
## damage while the lock is maintained. Keep LEVEL_STATS in sync with
## server/combat_defs.js DEFENSE_STATS.mage_tower.

const LEVEL_STATS := {
	1: {
		"base_damage": 4,
		"max_damage": 18,
		"tick_rate": 0.25,
		"ramp_time": 4.0,
	},
	2: {
		"base_damage": 6,
		"max_damage": 26,
		"tick_rate": 0.25,
		"ramp_time": 3.8,
	},
	3: {
		"base_damage": 8,
		"max_damage": 36,
		"tick_rate": 0.22,
		"ramp_time": 3.6,
	},
}

@export var detect_range: float = 1.0
## When true the crystal sinks/shrinks away while no enemy is in range. Off by
## default so the crystal stays visible in the base view, where there are never
## enemy troops.
@export var retract_when_idle: bool = false

const TARGET_SEARCH_INTERVAL: float = 0.15
const BEAM_START_Y: float = 0.36
const BEAM_RADIUS_MIN: float = 0.010
const BEAM_RADIUS_MAX: float = 0.030
const BEAM_GLOW_RADIUS_MIN: float = 0.030
const BEAM_GLOW_RADIUS_MAX: float = 0.075
const IMPACT_RADIUS_MIN: float = 0.045
const IMPACT_RADIUS_MAX: float = 0.100

var level: int = 1
var base_damage: int = 4
var max_damage: int = 18
var tick_rate: float = 0.25
var ramp_time: float = 4.0

var _target: Node3D = null
var _target_search_timer: float = 0.0
var _damage_tick: float = 0.0
var _charge: float = 0.0
var _beam_ready: bool = false

# Crystal animation (idle bob + spin, retract when no target, charge pulse).
const CRYSTAL_BOB_FREQ: float = 0.8
const CRYSTAL_BOB_AMP: float = 0.10
const CRYSTAL_SPIN_SPEED: float = 1.2
const CRYSTAL_RETRACT_DEPTH: float = 1.3
const CRYSTAL_RAISE_LERP: float = 6.0
const CRYSTAL_ATTACK_DUR: float = 0.18
const CRYSTAL_ATTACK_THRUST: float = 0.045
const CRYSTAL_ATTACK_SPIN_BOOST: float = 0.35
const CRYSTAL_ATTACK_SCALE_BOOST: float = 0.035
const CRYSTAL_MAX_FIND_RETRIES: int = 120

var _crystal: Node3D = null
var _crystal_rest_pos: Vector3 = Vector3.ZERO
var _crystal_rest_scale: Vector3 = Vector3.ONE
var _crystal_size_y: float = 1.0
var _crystal_find_done: bool = false
var _crystal_find_retries: int = 0
var _anim_time: float = 0.0
var _raise: float = 0.0
var _attack_pulse: float = 0.0
var _attack_t: float = -1.0

var _beam_core: MeshInstance3D = null
var _beam_glow: MeshInstance3D = null
var _impact: MeshInstance3D = null
var _beam_core_mat: StandardMaterial3D = null
var _beam_glow_mat: StandardMaterial3D = null
var _impact_mat: StandardMaterial3D = null


func _ready() -> void:
	_apply_stats()
	call_deferred("_build_beam_visuals")
	# Model is added as a child after set_script(), so defer the crystal lookup.
	call_deferred("_find_crystal")


func set_level(lvl: int) -> void:
	level = clampi(lvl, 1, LEVEL_STATS.size())
	_apply_stats()
	# A new level may swap in a different FBX -> re-find its crystal node.
	_crystal = null
	_crystal_find_done = false
	_crystal_find_retries = 0
	call_deferred("_find_crystal")


func _apply_stats() -> void:
	level = clampi(level, 1, LEVEL_STATS.size())
	var s: Dictionary = LEVEL_STATS.get(level, LEVEL_STATS[1])
	base_damage = int(s.base_damage)
	max_damage = int(s.max_damage)
	tick_rate = float(s.tick_rate)
	ramp_time = float(s.ramp_time)


func _find_crystal() -> void:
	if _crystal_find_done:
		return
	var c: Node = find_child("*Crystal*", true, false)
	if c == null or not (c is Node3D):
		# Model may not be attached yet - retry on the next physics frames.
		_crystal_find_retries += 1
		return
	_crystal = c as Node3D
	_crystal_rest_pos = _crystal.position
	_crystal_rest_scale = _crystal.scale
	_crystal_size_y = 1.0
	if _crystal is VisualInstance3D:
		var aabb: AABB = (_crystal as VisualInstance3D).get_aabb()
		if aabb.size.y > 0.0:
			_crystal_size_y = aabb.size.y * maxf(_crystal_rest_scale.y, 0.0001)
	_crystal_find_done = true


func _build_beam_visuals() -> void:
	if _beam_ready:
		return
	_beam_ready = true

	var scene_root: Node = get_tree().current_scene
	if scene_root == null:
		scene_root = self

	_beam_glow_mat = _make_beam_material(Color(0.15, 0.65, 1.0, 0.30), 2.0)
	_beam_core_mat = _make_beam_material(Color(0.45, 0.90, 1.0, 0.95), 4.0)
	_impact_mat = _make_beam_material(Color(0.55, 0.85, 1.0, 0.85), 5.0)

	_beam_glow = _make_beam_cylinder(BEAM_GLOW_RADIUS_MIN, _beam_glow_mat)
	_beam_core = _make_beam_cylinder(BEAM_RADIUS_MIN, _beam_core_mat)
	_impact = _make_impact_sphere(_impact_mat)

	scene_root.add_child(_beam_glow)
	scene_root.add_child(_beam_core)
	scene_root.add_child(_impact)
	_hide_beam()


func _make_beam_material(color: Color, energy: float) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.emission_enabled = true
	mat.emission = color
	mat.emission_energy_multiplier = energy
	return mat


func _make_beam_cylinder(radius: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.height = 0.1
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.radial_segments = 12
	mesh.rings = 1
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.visible = false
	return node


func _make_impact_sphere(mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := SphereMesh.new()
	mesh.radius = IMPACT_RADIUS_MIN
	mesh.height = IMPACT_RADIUS_MIN * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.visible = false
	return node


func _exit_tree() -> void:
	if is_instance_valid(_beam_core):
		_beam_core.queue_free()
	if is_instance_valid(_beam_glow):
		_beam_glow.queue_free()
	if is_instance_valid(_impact):
		_impact.queue_free()


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)
	if not _beam_ready:
		return

	if BaseTroop._get_troops_cached().size() == 0:
		_drop_target()
		_animate_crystal(delta)
		_hide_beam()
		return

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and BaseTroop.is_live_troop(_target):
		_process_beam_damage(delta)
		_update_beam_visuals()
	else:
		_drop_target()
		_hide_beam()

	_animate_crystal(delta)


func _process_beam_damage(delta: float) -> void:
	_charge = minf(1.0, _charge + delta / maxf(ramp_time, 0.001))
	_damage_tick += delta
	while _damage_tick >= tick_rate:
		_damage_tick -= tick_rate
		if not BaseTroop.is_live_troop(_target):
			_drop_target()
			return
		if _target.has_method("take_damage"):
			_target.take_damage(_current_damage())
			_attack_t = 0.0
		if not BaseTroop.is_live_troop(_target):
			_drop_target()
			return


func _current_damage() -> int:
	return maxi(1, roundi(lerpf(float(base_damage), float(max_damage), _charge)))


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	# Keep the current target if it is still alive and in range. This preserves
	# charge like an inferno beam; switching targets always resets the ramp.
	if _target and BaseTroop.is_live_troop(_target):
		var dx0: float = global_position.x - _target.global_position.x
		var dz0: float = global_position.z - _target.global_position.z
		if dx0 * dx0 + dz0 * dz0 <= detect_sq:
			return
	_drop_target()

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


func _drop_target() -> void:
	_target = null
	_charge = 0.0
	_damage_tick = 0.0


func _beam_start_position() -> Vector3:
	if is_instance_valid(_crystal) and _crystal.is_inside_tree():
		return _crystal.global_position
	return global_position + Vector3(0, BEAM_START_Y, 0)


func _target_aim_position() -> Vector3:
	if BaseTroop.is_live_troop(_target):
		return _target.global_position + Vector3(0, BaseTroop.TARGET_AIM_Y, 0)
	return global_position + Vector3(0, BEAM_START_Y, 0)


func _update_beam_visuals() -> void:
	if not BaseTroop.is_live_troop(_target):
		_hide_beam()
		return

	var from_pos: Vector3 = _beam_start_position()
	var to_pos: Vector3 = _target_aim_position()
	var pulse: float = 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.018)
	var core_radius: float = lerpf(BEAM_RADIUS_MIN, BEAM_RADIUS_MAX, _charge) * (0.92 + pulse * 0.10)
	var glow_radius: float = lerpf(BEAM_GLOW_RADIUS_MIN, BEAM_GLOW_RADIUS_MAX, _charge) * (0.95 + pulse * 0.12)
	var color: Color = _charge_color()
	var glow_color: Color = Color(color.r, color.g, color.b, lerpf(0.22, 0.42, _charge))
	var energy: float = lerpf(2.4, 8.0, _charge)

	_update_material(_beam_core_mat, color, energy)
	_update_material(_beam_glow_mat, glow_color, energy * 0.45)
	_update_material(_impact_mat, Color(color.r, color.g, color.b, 0.80), energy * 0.85)

	_set_cylinder_between(_beam_core, from_pos, to_pos, core_radius)
	_set_cylinder_between(_beam_glow, from_pos, to_pos, glow_radius)

	var impact_mesh := _impact.mesh as SphereMesh
	var impact_radius: float = lerpf(IMPACT_RADIUS_MIN, IMPACT_RADIUS_MAX, _charge) * (0.92 + pulse * 0.16)
	impact_mesh.radius = impact_radius
	impact_mesh.height = impact_radius * 2.0
	_impact.global_position = to_pos
	_impact.visible = true


func _hide_beam() -> void:
	if is_instance_valid(_beam_core):
		_beam_core.visible = false
	if is_instance_valid(_beam_glow):
		_beam_glow.visible = false
	if is_instance_valid(_impact):
		_impact.visible = false


func _charge_color() -> Color:
	if _charge < 0.45:
		return Color(0.25, 0.78, 1.0, 0.95).lerp(Color(0.72, 0.25, 1.0, 0.95), _charge / 0.45)
	return Color(0.72, 0.25, 1.0, 0.95).lerp(Color(1.0, 0.48, 0.08, 0.95), (_charge - 0.45) / 0.55)


func _update_material(mat: StandardMaterial3D, color: Color, energy: float) -> void:
	if mat == null:
		return
	mat.albedo_color = color
	mat.emission = color
	mat.emission_energy_multiplier = energy


func _set_cylinder_between(node: MeshInstance3D, from_pos: Vector3, to_pos: Vector3, radius: float) -> void:
	if not is_instance_valid(node):
		return
	var segment: Vector3 = to_pos - from_pos
	var length: float = segment.length()
	if length <= 0.001:
		node.visible = false
		return

	var mesh := node.mesh as CylinderMesh
	mesh.height = length
	mesh.top_radius = radius
	mesh.bottom_radius = radius

	var y_axis: Vector3 = segment / length
	var x_axis: Vector3 = y_axis.cross(Vector3.UP)
	if x_axis.length_squared() < 0.0001:
		x_axis = y_axis.cross(Vector3.RIGHT)
	x_axis = x_axis.normalized()
	var z_axis: Vector3 = x_axis.cross(y_axis).normalized()
	node.global_transform = Transform3D(Basis(x_axis, y_axis, z_axis), from_pos + segment * 0.5)
	node.visible = true


func _animate_crystal(delta: float) -> void:
	if not _crystal_find_done:
		if _crystal_find_retries < CRYSTAL_MAX_FIND_RETRIES:
			_find_crystal()
		return
	if not is_instance_valid(_crystal):
		return

	var has_target: bool = _target != null and BaseTroop.is_live_troop(_target)
	var target_raise: float = 1.0 if (has_target or not retract_when_idle) else 0.0
	_raise = move_toward(_raise, target_raise, CRYSTAL_RAISE_LERP * delta)
	_anim_time += delta

	if _attack_t >= 0.0:
		_attack_t += delta
		if _attack_t >= CRYSTAL_ATTACK_DUR:
			_attack_t = -1.0
			_attack_pulse = 0.0
		else:
			_attack_pulse = sin(PI * _attack_t / CRYSTAL_ATTACK_DUR)

	var heat_spin: float = 1.0 + _charge * 3.0 + _attack_pulse * CRYSTAL_ATTACK_SPIN_BOOST
	_crystal.rotation.y += CRYSTAL_SPIN_SPEED * heat_spin * _raise * delta

	var bob: float = sin(_anim_time * TAU * CRYSTAL_BOB_FREQ) * (_crystal_size_y * CRYSTAL_BOB_AMP) * _raise
	var retract: float = (1.0 - _raise) * (_crystal_size_y * CRYSTAL_RETRACT_DEPTH)
	var thrust: float = _attack_pulse * (_crystal_size_y * CRYSTAL_ATTACK_THRUST)
	_crystal.position.y = _crystal_rest_pos.y + bob - retract + thrust

	var heat_scale: float = 1.0 + _charge * 0.16 + _attack_pulse * CRYSTAL_ATTACK_SCALE_BOOST
	_crystal.scale = _crystal_rest_scale * (_raise * heat_scale)
	_crystal.visible = _raise > 0.02
