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
		"detect_range": 1.05,
	},
	2: {
		"base_damage": 11,
		"max_damage": 51,
		"tick_rate": 0.25,
		"ramp_time": 3.0,
		"detect_range": 1.15,
	},
	3: {
		"base_damage": 21,
		"max_damage": 113,
		"tick_rate": 0.25,
		"ramp_time": 2.5,
		"detect_range": 1.25,
	},
	4: {
		"base_damage": 35,
		"max_damage": 191,
		"tick_rate": 0.25,
		"ramp_time": 2.2,
		"detect_range": 1.35,
	},
	5: {
		"base_damage": 38,
		"max_damage": 202,
		"tick_rate": 0.25,
		"ramp_time": 2.0,
		"detect_range": 1.45,
	},
	6: {
		"base_damage": 44,
		"max_damage": 237,
		"tick_rate": 0.25,
		"ramp_time": 1.9,
		"detect_range": 1.55,
	},
	7: {
		"base_damage": 57,
		"max_damage": 303,
		"tick_rate": 0.25,
		"ramp_time": 1.8,
		"detect_range": 1.65,
	},
	8: {
		"base_damage": 64,
		"max_damage": 340,
		"tick_rate": 0.25,
		"ramp_time": 1.8,
		"detect_range": 1.73,
	},
	9: {
		"base_damage": 72,
		"max_damage": 382,
		"tick_rate": 0.25,
		"ramp_time": 1.8,
		"detect_range": 1.80,
	},
}

@export var detect_range: float = 1.05
## When true the crystal sinks/shrinks away while no enemy is in range. Off by
## default so the crystal stays visible in the base view, where there are never
## enemy troops.
@export var retract_when_idle: bool = false

const TARGET_SEARCH_INTERVAL: float = 0.15
const VISUAL_UPDATE_INTERVAL: float = 1.0 / 30.0
const CAN_TARGET_GROUND: bool = true
const CAN_TARGET_AIR: bool = true
const BEAM_START_Y: float = 0.36
const BEAM_RADIUS_MIN: float = 0.006
const BEAM_RADIUS_MAX: float = 0.012
const BEAM_GLOW_RADIUS_MIN: float = 0.012
const BEAM_GLOW_RADIUS_MAX: float = 0.025
const IMPACT_RADIUS_MIN: float = 0.035
const IMPACT_RADIUS_MAX: float = 0.065
const BEAM_MESH_HEIGHT: float = 1.0
const BEAM_MESH_RADIUS: float = 1.0
const IMPACT_MESH_RADIUS: float = 1.0
const ATTACK_SFX_PATH := "res://Musik/base/MagikTowerAttack.mp3"
const ATTACK_SFX_VOLUME_DB := -1.0
const ATTACK_SFX_PITCH_JITTER := 0.04
static var _attack_sfx_stream: AudioStream = null
static var _attack_sfx_loaded: bool = false

var level: int = 1
var base_damage: int = 4
var max_damage: int = 18
var ward_bonus_pct: int = 0
var tick_rate: float = 0.25
var ramp_time: float = 4.0

var _target: Node3D = null
var _target_search_timer: float = 0.0
var _damage_tick: float = 0.0
var _freeze_remaining: float = 0.0
var _charge: float = 0.0
var _beam_ready: bool = false
var _visual_update_timer: float = VISUAL_UPDATE_INTERVAL

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
var _attack_sfx_player: AudioStreamPlayer = null


func _ready() -> void:
	_apply_stats()
	_setup_attack_sfx()
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
	var multiplier: float = 1.0 + float(ward_bonus_pct) / 100.0
	base_damage = ceili(float(s.base_damage) * multiplier)
	max_damage = ceili(float(s.max_damage) * multiplier)
	tick_rate = float(s.tick_rate)
	ramp_time = float(s.ramp_time)
	detect_range = float(s.detect_range)


func set_ward_bonus_pct(pct: int) -> void:
	ward_bonus_pct = maxi(0, pct)
	_apply_stats()


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

	_beam_glow = _make_beam_cylinder(_beam_glow_mat)
	_beam_core = _make_beam_cylinder(_beam_core_mat)
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


func _make_beam_cylinder(mat: StandardMaterial3D) -> MeshInstance3D:
	var mesh := CylinderMesh.new()
	mesh.height = BEAM_MESH_HEIGHT
	# Keep a unit-radius source mesh. _set_cylinder_between applies the
	# world-space beam radius once when it builds the final basis.
	mesh.top_radius = BEAM_MESH_RADIUS
	mesh.bottom_radius = BEAM_MESH_RADIUS
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
	mesh.radius = IMPACT_MESH_RADIUS
	mesh.height = IMPACT_MESH_RADIUS * 2.0
	mesh.radial_segments = 12
	mesh.rings = 6
	var node := MeshInstance3D.new()
	node.mesh = mesh
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	node.visible = false
	return node


func _exit_tree() -> void:
	cleanup_defense_visuals()


func cleanup_defense_visuals() -> void:
	_drop_target()
	_stop_attack_sfx()
	if is_instance_valid(_beam_core):
		_beam_core.queue_free()
	if is_instance_valid(_beam_glow):
		_beam_glow.queue_free()
	if is_instance_valid(_impact):
		_impact.queue_free()
	_beam_core = null
	_beam_glow = null
	_impact = null
	_beam_ready = false


func _physics_process(delta: float) -> void:
	delta = BaseTroop.combat_delta(delta)
	_visual_update_timer += delta
	var update_visuals := _visual_update_timer >= VISUAL_UPDATE_INTERVAL
	var visual_delta := 0.0
	if update_visuals:
		visual_delta = _visual_update_timer
		_visual_update_timer = fmod(_visual_update_timer, VISUAL_UPDATE_INTERVAL)
	if not _beam_ready:
		return
	if _freeze_remaining > 0.0:
		_freeze_remaining = maxf(0.0, _freeze_remaining - delta)
		_stop_attack_sfx()
		_hide_beam()
		return

	if BaseTroop._get_troops_cached().size() == 0:
		_drop_target()
		if update_visuals:
			_animate_crystal(visual_delta)
		_hide_beam()
		return

	_target_search_timer += delta
	if _target_search_timer >= TARGET_SEARCH_INTERVAL:
		_target_search_timer = 0.0
		_find_target()

	if _target and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		_start_attack_sfx()
		_process_beam_damage(delta)
		if update_visuals:
			_update_beam_visuals()
	else:
		_drop_target()
		_hide_beam()

	if update_visuals:
		_animate_crystal(visual_delta)


func freeze_for(duration: float) -> void:
	_freeze_remaining = maxf(_freeze_remaining, maxf(0.0, duration))


func _process_beam_damage(delta: float) -> void:
	_charge = minf(1.0, _charge + delta / maxf(ramp_time, 0.001))
	_damage_tick += delta
	while _damage_tick >= tick_rate:
		_damage_tick -= tick_rate
		if not BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			_drop_target()
			return
		if _target.has_method("take_damage"):
			_target.take_damage(_current_damage())
			_attack_t = 0.0
		if not BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
			_drop_target()
			return


func _setup_attack_sfx() -> void:
	if _attack_sfx_player == null:
		_attack_sfx_player = AudioStreamPlayer.new()
		_attack_sfx_player.name = "MageTowerAttackSFX"
		_attack_sfx_player.bus = "Master"
		_attack_sfx_player.volume_db = ATTACK_SFX_VOLUME_DB
		add_child(_attack_sfx_player)
	if not _attack_sfx_loaded:
		_attack_sfx_loaded = true
		_attack_sfx_stream = ResourceLoader.load(ATTACK_SFX_PATH) as AudioStream
		if _attack_sfx_stream == null:
			push_warning("MageTower: missing attack sound '%s'" % ATTACK_SFX_PATH)
	if _attack_sfx_stream != null:
		_set_stream_loop(_attack_sfx_stream, true)
		_attack_sfx_player.stream = _attack_sfx_stream


func _start_attack_sfx() -> void:
	if _attack_sfx_player == null or _attack_sfx_player.stream == null:
		_setup_attack_sfx()
	if _attack_sfx_player == null or _attack_sfx_player.stream == null:
		return
	if _attack_sfx_player.playing:
		return
	_attack_sfx_player.pitch_scale = randf_range(1.0 - ATTACK_SFX_PITCH_JITTER, 1.0 + ATTACK_SFX_PITCH_JITTER)
	_attack_sfx_player.play()


func _stop_attack_sfx() -> void:
	if _attack_sfx_player and _attack_sfx_player.playing:
		_attack_sfx_player.stop()


func _set_stream_loop(stream: AudioStream, loop: bool) -> void:
	if stream is AudioStreamMP3:
		stream.loop = loop
	elif stream is AudioStreamOggVorbis:
		stream.loop = loop
	elif stream is AudioStreamWAV:
		stream.loop_mode = AudioStreamWAV.LOOP_FORWARD if loop else AudioStreamWAV.LOOP_DISABLED


func _current_damage() -> int:
	return maxi(1, roundi(lerpf(float(base_damage), float(max_damage), _charge)))


func _find_target() -> void:
	var detect_sq: float = detect_range * detect_range
	# Keep the current target if it is still alive and in range. This preserves
	# charge like an inferno beam; switching targets always resets the ramp.
	if _target and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		var dx0: float = global_position.x - _target.global_position.x
		var dz0: float = global_position.z - _target.global_position.z
		if dx0 * dx0 + dz0 * dz0 <= detect_sq:
			return
	_drop_target()

	var nearest_sq: float = detect_sq
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
		if d_sq < nearest_sq:
			nearest_sq = d_sq
			_target = troop


func _drop_target() -> void:
	_target = null
	_charge = 0.0
	_damage_tick = 0.0
	_stop_attack_sfx()


func _beam_start_position() -> Vector3:
	if is_instance_valid(_crystal) and _crystal.is_inside_tree():
		return _crystal.global_position
	return global_position + Vector3(0, BEAM_START_Y, 0)


func _target_aim_position() -> Vector3:
	if BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
		return _target.global_position + Vector3(0, BaseTroop.TARGET_AIM_Y, 0)
	return global_position + Vector3(0, BEAM_START_Y, 0)


func _update_beam_visuals() -> void:
	if not BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR):
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

	var impact_radius: float = lerpf(IMPACT_RADIUS_MIN, IMPACT_RADIUS_MAX, _charge) * (0.92 + pulse * 0.16)
	_impact.scale = Vector3.ONE * (impact_radius / IMPACT_MESH_RADIUS)
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

	var y_axis: Vector3 = segment / length
	var x_axis: Vector3 = y_axis.cross(Vector3.UP)
	if x_axis.length_squared() < 0.0001:
		x_axis = y_axis.cross(Vector3.RIGHT)
	x_axis = x_axis.normalized()
	var z_axis: Vector3 = x_axis.cross(y_axis).normalized()
	var radius_scale := radius / BEAM_MESH_RADIUS
	var beam_basis := Basis(
		x_axis * radius_scale,
		y_axis * (length / BEAM_MESH_HEIGHT),
		z_axis * radius_scale
	)
	node.global_transform = Transform3D(beam_basis, from_pos + segment * 0.5)
	node.visible = true


func _animate_crystal(delta: float) -> void:
	if not _crystal_find_done:
		if _crystal_find_retries < CRYSTAL_MAX_FIND_RETRIES:
			_find_crystal()
		return
	if not is_instance_valid(_crystal):
		return

	var has_target: bool = _target != null and BaseTroop.can_defense_target_troop(_target, CAN_TARGET_GROUND, CAN_TARGET_AIR)
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
