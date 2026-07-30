## Main Ship level 6 healing field. The ability shares energy with the other
## ship actions and gets one energy more expensive after each use.
class_name BSMedkit
extends RefCounted

const MEDKIT_UNLOCK_SHIP_LEVEL: int = 6
const MEDKIT_ENERGY_COST: int = 6
const MEDKIT_ENERGY_COST_INCREMENT: int = 1
const MEDKIT_DURATION_SEC: float = 8.0
const MEDKIT_RADIUS: float = 0.72
const MEDKIT_TICK_SEC: float = 0.25
const MEDKIT_HEAL_PER_TICK: int = 12
const MEDKIT_FLIGHT_SEC: float = 0.60
const MEDKIT_COLOR: Color = Color(0.18, 0.92, 0.42, 1.0)
const MEDKIT_DISK_ALPHA_MIN: float = 0.32
const MEDKIT_DISK_ALPHA_MAX: float = 0.44

var bs: Node3D
var _ship_level: int = 1
var _medkit_mode: bool = false
var _medkit_uses: int = 0
var _medkit_paused_attack: bool = false
var _medkit_label: Label = null
var _projectiles: Array[Dictionary] = []
var _active_zones: Array[Dictionary] = []
var _simulation_time: float = 0.0
var _last_heal_at_by_troop: Dictionary = {}


func init(building_system: Node3D) -> BSMedkit:
	bs = building_system
	return self


func reset(ship_level: int = 1) -> void:
	_ship_level = clampi(ship_level, 1, 10)
	_medkit_uses = 0
	_simulation_time = 0.0
	_last_heal_at_by_troop.clear()
	_exit_medkit_mode()
	_clear_projectiles()
	_clear_zones()


func is_unlocked() -> bool:
	return _ship_level >= MEDKIT_UNLOCK_SHIP_LEVEL


func energy_cost() -> int:
	return MEDKIT_ENERGY_COST + _medkit_uses * MEDKIT_ENERGY_COST_INCREMENT


func process(delta: float) -> void:
	_simulation_time += delta
	_process_projectiles(delta)
	var heal_events: Array[Dictionary] = []
	for index in range(_active_zones.size() - 1, -1, -1):
		var zone: Dictionary = _active_zones[index]
		var root: Node3D = zone.get("root", null)
		if not is_instance_valid(root):
			_active_zones.remove_at(index)
			continue
		var age: float = float(zone.get("age", 0.0)) + delta
		var tick_accum: float = float(zone.get("tick_accum", 0.0)) + delta
		zone["age"] = age
		while tick_accum + 0.000001 >= MEDKIT_TICK_SEC:
			tick_accum -= MEDKIT_TICK_SEC
			var tick_age := age - tick_accum
			if tick_age <= MEDKIT_DURATION_SEC + 0.000001:
				heal_events.append({
					"time": _simulation_time - tick_accum,
					"center": root.global_position,
				})
		zone["tick_accum"] = tick_accum
		_pulse_zone(zone, age)
		if age >= MEDKIT_DURATION_SEC:
			_remove_zone(index)
	heal_events.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a.get("time", 0.0)) < float(b.get("time", 0.0))
	)
	for event in heal_events:
		_heal_troops(
			event.get("center", Vector3.ZERO),
			float(event.get("time", _simulation_time))
		)


func _enter_medkit_mode() -> void:
	if not is_unlocked() or not bs._cannon:
		return
	if bs._cannon._cannon_energy < energy_cost():
		return
	if bs._cannon._ship_cannon_mode:
		bs._cannon._exit_ship_cannon_mode()
	if bs._rally and bs._rally._rally_mode:
		bs._rally._exit_rally_mode()
	if bs._freeze and bs._freeze._freeze_mode:
		bs._freeze._exit_freeze_mode()
	if bs._rage and bs._rage._rage_mode:
		bs._rage._exit_rage_mode()
	if bs._skeleton_barrel and bs._skeleton_barrel._barrel_mode:
		bs._skeleton_barrel._exit_barrel_mode()
	_medkit_mode = true
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("medkit_mode", {"active": true})
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_medkit_paused_attack = bool(attack_system.is_attack_mode)
		attack_system._pause_attack_mode()
	else:
		_medkit_paused_attack = false
	if bs.canvas and not _medkit_label:
		_medkit_label = Label.new()
		_medkit_label.text = "Medkit mode - place the healing field"
		_medkit_label.anchor_left = 0.5
		_medkit_label.anchor_right = 0.5
		_medkit_label.offset_left = -280
		_medkit_label.offset_right = 280
		_medkit_label.offset_top = 20
		_medkit_label.offset_bottom = 55
		_medkit_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_medkit_label.add_theme_font_size_override("font_size", 20)
		_medkit_label.add_theme_color_override("font_color", MEDKIT_COLOR)
		bs.canvas.add_child(_medkit_label)


func _exit_medkit_mode() -> void:
	_medkit_mode = false
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("medkit_mode", {"active": false})
	if is_instance_valid(_medkit_label):
		_medkit_label.queue_free()
	_medkit_label = null
	if _medkit_paused_attack:
		_medkit_paused_attack = false
		var attack_system: Node = bs.get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


func _drop_medkit(world_pos: Vector3) -> bool:
	if not is_unlocked() or not bs._cannon:
		return false
	var cost := energy_cost()
	if bs._cannon._cannon_energy < cost:
		return false
	bs._cannon._cannon_energy -= cost
	_medkit_uses += 1
	var clamped_pos: Vector3 = BaseTroop._clamp_to_island(world_pos)
	var pos := Vector3(clamped_pos.x, bs.grid_y + 0.012, clamped_pos.z)
	_launch_or_activate(pos, "manual")
	if bs.is_viewing_enemy:
		var elapsed: float = Time.get_ticks_msec() / 1000.0 - bs._battle_start_time
		bs._battle_replay.append({
			"t": elapsed,
			"type": "medkit_drop",
			"x": pos.x,
			"z": pos.z,
			"flight_time": MEDKIT_FLIGHT_SEC,
		})
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("medkit_fire", {
			"x": snappedf(pos.x, 0.001),
			"z": snappedf(pos.z, 0.001),
			"flight_time": MEDKIT_FLIGHT_SEC,
			"duration": MEDKIT_DURATION_SEC,
			"source": "manual",
		})
	bs._cannon._update_cannon_energy_ui()
	return true


func replay_drop_medkit(world_pos: Vector3) -> void:
	_medkit_uses += 1
	var clamped_pos: Vector3 = BaseTroop._clamp_to_island(world_pos)
	var pos := Vector3(clamped_pos.x, bs.grid_y + 0.012, clamped_pos.z)
	_launch_or_activate(pos, "replay")
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("medkit_fire", {
			"x": snappedf(pos.x, 0.001),
			"z": snappedf(pos.z, 0.001),
			"flight_time": MEDKIT_FLIGHT_SEC,
			"duration": MEDKIT_DURATION_SEC,
			"source": "replay",
		})


func _launch_or_activate(target: Vector3, source: String) -> void:
	var ship: Node3D = bs._cannon._get_attack_ship() if bs._cannon else null
	if not is_instance_valid(ship):
		_activate_zone(target)
		return
	var scene_root := bs.get_tree().current_scene
	if scene_root == null:
		_activate_zone(target)
		return
	var root := _create_payload_visual()
	scene_root.add_child(root)
	var start := ship.global_position + Vector3(0.0, 0.19, 0.0)
	root.global_position = start
	_projectiles.append({
		"root": root,
		"start": start,
		"target": target,
		"age": 0.0,
		"source": source,
	})


func _process_projectiles(delta: float) -> void:
	for index in range(_projectiles.size() - 1, -1, -1):
		var projectile: Dictionary = _projectiles[index]
		var root: Node3D = projectile.get("root", null)
		if not is_instance_valid(root):
			_projectiles.remove_at(index)
			continue
		var age := float(projectile.get("age", 0.0)) + delta
		projectile["age"] = age
		var progress := clampf(age / MEDKIT_FLIGHT_SEC, 0.0, 1.0)
		var start: Vector3 = projectile.get("start", Vector3.ZERO)
		var target: Vector3 = projectile.get("target", Vector3.ZERO)
		var flat := start.lerp(target, progress)
		var arc_height := maxf(0.44, start.distance_to(target) * 0.22)
		root.global_position = flat + Vector3(
			0.0,
			4.0 * arc_height * progress * (1.0 - progress),
			0.0
		)
		root.rotate_x(delta * 4.8)
		root.rotate_z(delta * 3.8)
		if progress < 1.0:
			continue
		_activate_zone(target)
		if bs.has_method("record_replay_telemetry"):
			bs.record_replay_telemetry("medkit_impact", {
				"x": snappedf(target.x, 0.001),
				"z": snappedf(target.z, 0.001),
				"duration": MEDKIT_DURATION_SEC,
				"source": str(projectile.get("source", "manual")),
			})
		root.queue_free()
		_projectiles.remove_at(index)


func _create_payload_visual() -> Node3D:
	var root := Node3D.new()
	root.name = "MainShipMedkitPayload"
	var body := MeshInstance3D.new()
	var body_mesh := BoxMesh.new()
	body_mesh.size = Vector3(0.14, 0.10, 0.12)
	body.mesh = body_mesh
	var body_mat := StandardMaterial3D.new()
	body_mat.albedo_color = Color(0.90, 0.08, 0.06, 1.0)
	body_mat.roughness = 0.52
	body.material_override = body_mat
	body.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(body)
	var cross_mat := StandardMaterial3D.new()
	cross_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cross_mat.albedo_color = Color(1.0, 0.96, 0.86, 1.0)
	for cross_size in [Vector3(0.075, 0.012, 0.026), Vector3(0.026, 0.012, 0.075)]:
		var bar := MeshInstance3D.new()
		var bar_mesh := BoxMesh.new()
		bar_mesh.size = cross_size
		bar.mesh = bar_mesh
		bar.position.y = 0.056
		bar.material_override = cross_mat
		bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		root.add_child(bar)
	return root


func _heal_troops(center: Vector3, heal_time: float) -> void:
	var radius_sq: float = MEDKIT_RADIUS * MEDKIT_RADIUS
	for troop_value in BaseTroop._get_troops_cached():
		var troop: Node3D = troop_value as Node3D
		if not is_instance_valid(troop) or not troop.is_inside_tree():
			continue
		if troop.has_meta("summoned_unit"):
			continue
		var offset: Vector3 = troop.global_position - center
		if offset.x * offset.x + offset.z * offset.z > radius_sq:
			continue
		if troop.has_method("heal"):
			var troop_id := troop.get_instance_id()
			var last_heal_at := float(
				_last_heal_at_by_troop.get(troop_id, -MEDKIT_TICK_SEC)
			)
			if heal_time - last_heal_at < MEDKIT_TICK_SEC - 0.000001:
				continue
			var healed_amount := int(troop.call("heal", MEDKIT_HEAL_PER_TICK))
			if healed_amount > 0:
				_last_heal_at_by_troop[troop_id] = heal_time
			if (
				healed_amount > 0
				and troop.has_method("show_healing_feedback")
			):
				troop.call(
					"show_healing_feedback",
					MEDKIT_TICK_SEC * 1.7
				)


func _activate_zone(pos: Vector3, visual_parent: Node = null) -> void:
	var root := Node3D.new()
	root.name = "MedkitHealingField"
	var parent: Node = visual_parent
	if parent == null and is_instance_valid(bs) and bs.get_tree() != null:
		parent = bs.get_tree().current_scene
	if parent == null:
		return
	parent.add_child(root)
	root.global_position = pos

	var disk := MeshInstance3D.new()
	var disk_mesh := CylinderMesh.new()
	disk_mesh.top_radius = MEDKIT_RADIUS
	disk_mesh.bottom_radius = MEDKIT_RADIUS
	disk_mesh.height = 0.006
	disk_mesh.radial_segments = 48
	disk.mesh = disk_mesh
	var disk_mat := StandardMaterial3D.new()
	disk_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	disk_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	disk_mat.albedo_color = Color(
		MEDKIT_COLOR.r,
		MEDKIT_COLOR.g,
		MEDKIT_COLOR.b,
		(MEDKIT_DISK_ALPHA_MIN + MEDKIT_DISK_ALPHA_MAX) * 0.5
	)
	disk_mat.no_depth_test = false
	disk.material_override = disk_mat
	root.add_child(disk)

	var ring := MeshInstance3D.new()
	var ring_mesh := ImmediateMesh.new()
	ring_mesh.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for index in range(65):
		var angle: float = TAU * float(index) / 64.0
		ring_mesh.surface_add_vertex(Vector3(cos(angle) * MEDKIT_RADIUS, 0.008, sin(angle) * MEDKIT_RADIUS))
	ring_mesh.surface_end()
	ring.mesh = ring_mesh
	var ring_mat := StandardMaterial3D.new()
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring_mat.albedo_color = Color(MEDKIT_COLOR.r, MEDKIT_COLOR.g, MEDKIT_COLOR.b, 0.9)
	ring.material_override = ring_mat
	root.add_child(ring)

	var cross_mat := StandardMaterial3D.new()
	cross_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	cross_mat.albedo_color = Color(0.86, 1.0, 0.9, 0.95)
	for cross_size in [Vector3(0.24, 0.012, 0.075), Vector3(0.075, 0.012, 0.24)]:
		var bar := MeshInstance3D.new()
		var bar_mesh := BoxMesh.new()
		bar_mesh.size = cross_size
		bar.mesh = bar_mesh
		bar.position.y = 0.018
		bar.material_override = cross_mat
		root.add_child(bar)

	_active_zones.append({
		"root": root,
		"disk_mat": disk_mat,
		"ring_mat": ring_mat,
		"age": 0.0,
		"tick_accum": 0.0,
	})


func _pulse_zone(zone: Dictionary, age: float) -> void:
	var pulse: float = 0.5 + 0.5 * sin(age * 4.2)
	var disk_mat: StandardMaterial3D = zone.get("disk_mat", null)
	var ring_mat: StandardMaterial3D = zone.get("ring_mat", null)
	if disk_mat:
		disk_mat.albedo_color = Color(
			MEDKIT_COLOR.r,
			MEDKIT_COLOR.g,
			MEDKIT_COLOR.b,
			lerpf(MEDKIT_DISK_ALPHA_MIN, MEDKIT_DISK_ALPHA_MAX, pulse)
		)
	if ring_mat:
		ring_mat.albedo_color = Color(MEDKIT_COLOR.r, MEDKIT_COLOR.g, MEDKIT_COLOR.b, 0.62 + pulse * 0.34)


func _remove_zone(index: int) -> void:
	if index < 0 or index >= _active_zones.size():
		return
	var zone: Dictionary = _active_zones[index]
	var root: Node = zone.get("root", null)
	if is_instance_valid(root):
		root.queue_free()
	_active_zones.remove_at(index)


func _clear_zones() -> void:
	for index in range(_active_zones.size() - 1, -1, -1):
		_remove_zone(index)


func _clear_projectiles() -> void:
	for projectile in _projectiles:
		var root: Node = projectile.get("root", null)
		if is_instance_valid(root):
			root.queue_free()
	_projectiles.clear()
