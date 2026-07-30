class_name BSRageSpell
extends RefCounted
## Main Ship level 8 tactical field. Paid deployed troops inside the radius deal
## double damage and move/attack 25% faster. Summons and split descendants are
## deliberately excluded so the field cannot multiply free army capacity.

const UNLOCK_SHIP_LEVEL: int = 8
const ENERGY_COST: int = 7
const ENERGY_COST_INCREMENT: int = 1
const RADIUS: float = 0.82
const DURATION_SEC: float = 9.0
const APPLY_TICK_SEC: float = 0.20
const BOOST_GRACE_SEC: float = 0.25
const DAMAGE_MULTIPLIER: float = 2.0
const SPEED_MULTIPLIER: float = 1.25
const FIELD_COLOR: Color = Color(1.0, 0.48, 0.10, 1.0)
const FIELD_ACCENT: Color = Color(0.72, 0.18, 1.0, 1.0)
const FIELD_GROUND_OFFSET: float = 0.075
const FIELD_DISK_ALPHA_MIN: float = 0.35
const FIELD_DISK_ALPHA_MAX: float = 0.45
const FIELD_SEGMENTS: int = 64

var bs: Node3D
var _ship_level: int = 1
var _rage_mode: bool = false
var _rage_uses: int = 0
var _rage_paused_attack: bool = false
var _rage_label: Label = null
var _active_zones: Array[Dictionary] = []


func init(building_system: Node3D) -> BSRageSpell:
	bs = building_system
	return self


func reset(ship_level: int = 1) -> void:
	_ship_level = clampi(ship_level, 1, 10)
	_rage_uses = 0
	_exit_rage_mode()
	_clear_zones()


func is_unlocked() -> bool:
	return _ship_level >= UNLOCK_SHIP_LEVEL


func energy_cost() -> int:
	return ENERGY_COST + _rage_uses * ENERGY_COST_INCREMENT


func process(delta: float) -> void:
	for index in range(_active_zones.size() - 1, -1, -1):
		var zone: Dictionary = _active_zones[index]
		var root: Node3D = zone.get("root", null)
		if not is_instance_valid(root):
			_active_zones.remove_at(index)
			continue
		var age: float = float(zone.get("age", 0.0)) + delta
		var tick_accum: float = float(zone.get("tick_accum", 0.0)) + delta
		zone["age"] = age
		while tick_accum + 0.000001 >= APPLY_TICK_SEC:
			tick_accum -= APPLY_TICK_SEC
			_boost_troops(root.global_position, zone)
		zone["tick_accum"] = tick_accum
		_pulse_zone(zone, age)
		if age >= DURATION_SEC:
			_remove_zone(index)


func _enter_rage_mode() -> void:
	if (
		not is_unlocked()
		or not bs._cannon
		or bs._cannon._cannon_energy < energy_cost()
	):
		return
	_cancel_other_modes()
	_rage_mode = true
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("rage_mode", {"active": true})
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_rage_paused_attack = bool(attack_system.is_attack_mode)
		attack_system._pause_attack_mode()
	else:
		_rage_paused_attack = false
	if bs.canvas and not _rage_label:
		_rage_label = Label.new()
		_rage_label.text = "Rage Field - boost troops inside the area"
		_rage_label.anchor_left = 0.5
		_rage_label.anchor_right = 0.5
		_rage_label.offset_left = -300
		_rage_label.offset_right = 300
		_rage_label.offset_top = 20
		_rage_label.offset_bottom = 55
		_rage_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_rage_label.add_theme_font_size_override("font_size", 20)
		_rage_label.add_theme_color_override("font_color", FIELD_COLOR)
		bs.canvas.add_child(_rage_label)


func _exit_rage_mode() -> void:
	_rage_mode = false
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("rage_mode", {"active": false})
	if is_instance_valid(_rage_label):
		_rage_label.queue_free()
	_rage_label = null
	if _rage_paused_attack:
		_rage_paused_attack = false
		var attack_system: Node = bs.get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


func _drop_rage(world_pos: Vector3) -> bool:
	if (
		not is_unlocked()
		or not bs._cannon
		or bs._cannon._cannon_energy < energy_cost()
	):
		return false
	var cost := energy_cost()
	bs._cannon._cannon_energy -= cost
	_rage_uses += 1
	var clamped := BaseTroop._clamp_to_island(world_pos)
	var pos := Vector3(clamped.x, bs.grid_y + FIELD_GROUND_OFFSET, clamped.z)
	_activate_zone(pos)
	_record_action(pos)
	bs._cannon._update_cannon_energy_ui()
	return true


func replay_drop_rage(world_pos: Vector3) -> void:
	_rage_uses += 1
	var clamped := BaseTroop._clamp_to_island(world_pos)
	_activate_zone(Vector3(
		clamped.x,
		bs.grid_y + FIELD_GROUND_OFFSET,
		clamped.z
	))


func _boost_troops(center: Vector3, zone: Dictionary) -> void:
	var radius_sq := RADIUS * RADIUS
	var boosted_count := 0
	for troop_value in BaseTroop._get_troops_cached():
		var troop := troop_value as BaseTroop
		if not is_instance_valid(troop) or not troop.can_receive_tactical_boost():
			continue
		var offset := troop.global_position - center
		if offset.x * offset.x + offset.z * offset.z > radius_sq:
			continue
		if troop.apply_tactical_boost(
			BOOST_GRACE_SEC,
			DAMAGE_MULTIPLIER,
			SPEED_MULTIPLIER
		):
			boosted_count += 1
	zone["last_boosted_count"] = boosted_count


func _activate_zone(pos: Vector3, visual_parent: Node = null) -> void:
	var root := Node3D.new()
	root.name = "MainShipRageField"
	var parent: Node = visual_parent
	if parent == null and is_instance_valid(bs) and bs.get_tree() != null:
		parent = bs.get_tree().current_scene
	if parent == null:
		return
	parent.add_child(root)
	root.global_position = pos

	var disk := MeshInstance3D.new()
	var disk_mesh := CylinderMesh.new()
	disk_mesh.top_radius = RADIUS
	disk_mesh.bottom_radius = RADIUS
	disk_mesh.height = 0.008
	disk_mesh.radial_segments = FIELD_SEGMENTS
	disk.mesh = disk_mesh
	disk.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var disk_mat := StandardMaterial3D.new()
	disk_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	disk_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	disk_mat.no_depth_test = false
	disk_mat.albedo_color = Color(
		FIELD_COLOR.r,
		FIELD_COLOR.g,
		FIELD_COLOR.b,
		(FIELD_DISK_ALPHA_MIN + FIELD_DISK_ALPHA_MAX) * 0.5
	)
	disk_mat.emission_enabled = true
	disk_mat.emission = FIELD_COLOR
	disk_mat.emission_energy_multiplier = 0.45
	disk.material_override = disk_mat
	root.add_child(disk)

	var ring_mats: Array[StandardMaterial3D] = []
	var rings: Array[MeshInstance3D] = []
	for ring_index in range(3):
		var ring := MeshInstance3D.new()
		var ring_radius := RADIUS * (0.46 + float(ring_index) * 0.27)
		ring.mesh = _make_flat_ring_mesh(
			ring_radius,
			0.018,
			FIELD_SEGMENTS
		)
		ring.position.y = 0.001 + float(ring_index) * 0.0005
		ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var ring_mat := StandardMaterial3D.new()
		ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		ring_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		ring_mat.no_depth_test = false
		ring_mat.albedo_color = Color(
			FIELD_COLOR.r,
			FIELD_COLOR.g,
			FIELD_COLOR.b,
			0.58
		)
		ring_mat.emission_enabled = true
		ring_mat.emission = FIELD_COLOR
		ring_mat.emission_energy_multiplier = 0.75
		ring.material_override = ring_mat
		root.add_child(ring)
		rings.append(ring)
		ring_mats.append(ring_mat)

	_active_zones.append({
		"root": root,
		"disk_mat": disk_mat,
		"rings": rings,
		"ring_mats": ring_mats,
		"age": 0.0,
		"tick_accum": APPLY_TICK_SEC,
		"last_boosted_count": 0,
	})


func _pulse_zone(zone: Dictionary, age: float) -> void:
	var pulse := 0.5 + 0.5 * sin(age * 5.2)
	var disk_mat: StandardMaterial3D = zone.get("disk_mat", null)
	if disk_mat:
		disk_mat.albedo_color = Color(
			FIELD_COLOR.r,
			FIELD_COLOR.g,
			FIELD_COLOR.b,
			lerpf(FIELD_DISK_ALPHA_MIN, FIELD_DISK_ALPHA_MAX, pulse)
		)
	var rings: Array = zone.get("rings", [])
	var ring_mats: Array = zone.get("ring_mats", [])
	for index in range(mini(rings.size(), ring_mats.size())):
		var ring: MeshInstance3D = rings[index]
		var ring_mat: StandardMaterial3D = ring_mats[index]
		if is_instance_valid(ring):
			var scale_pulse := 1.0 + 0.035 * sin(age * 4.4 + float(index))
			ring.scale = Vector3(scale_pulse, 1.0, scale_pulse)
		if ring_mat:
			ring_mat.albedo_color = Color(
				FIELD_COLOR.r,
				FIELD_COLOR.g,
				FIELD_COLOR.b,
				0.40 + pulse * 0.24
			)


func _make_flat_disc_mesh(radius: float, segments: int) -> ImmediateMesh:
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(segments):
		var angle_a := TAU * float(index) / float(segments)
		var angle_b := TAU * float(index + 1) / float(segments)
		mesh.surface_add_vertex(Vector3.ZERO)
		mesh.surface_add_vertex(Vector3(
			cos(angle_b) * radius,
			0.0,
			sin(angle_b) * radius
		))
		mesh.surface_add_vertex(Vector3(
			cos(angle_a) * radius,
			0.0,
			sin(angle_a) * radius
		))
	mesh.surface_end()
	return mesh


func _make_flat_ring_mesh(
	radius: float,
	width: float,
	segments: int
) -> ImmediateMesh:
	var mesh := ImmediateMesh.new()
	var inner_radius := maxf(0.001, radius - width * 0.5)
	var outer_radius := radius + width * 0.5
	mesh.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(segments):
		var angle_a := TAU * float(index) / float(segments)
		var angle_b := TAU * float(index + 1) / float(segments)
		var inner_a := Vector3(
			cos(angle_a) * inner_radius,
			0.0,
			sin(angle_a) * inner_radius
		)
		var inner_b := Vector3(
			cos(angle_b) * inner_radius,
			0.0,
			sin(angle_b) * inner_radius
		)
		var outer_a := Vector3(
			cos(angle_a) * outer_radius,
			0.0,
			sin(angle_a) * outer_radius
		)
		var outer_b := Vector3(
			cos(angle_b) * outer_radius,
			0.0,
			sin(angle_b) * outer_radius
		)
		mesh.surface_add_vertex(inner_a)
		mesh.surface_add_vertex(outer_b)
		mesh.surface_add_vertex(outer_a)
		mesh.surface_add_vertex(inner_a)
		mesh.surface_add_vertex(inner_b)
		mesh.surface_add_vertex(outer_b)
	mesh.surface_end()
	return mesh


func _record_action(pos: Vector3) -> void:
	if bs.is_viewing_enemy:
		var elapsed: float = (
			float(Time.get_ticks_msec()) / 1000.0
			- float(bs._battle_start_time)
		)
		bs._battle_replay.append({
			"t": elapsed,
			"type": "rage_drop",
			"x": pos.x,
			"z": pos.z,
		})
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("rage_drop", {
			"x": snappedf(pos.x, 0.001),
			"z": snappedf(pos.z, 0.001),
			"radius": RADIUS,
			"duration": DURATION_SEC,
			"source": "manual",
		})


func _cancel_other_modes() -> void:
	if bs._cannon and bs._cannon._ship_cannon_mode:
		bs._cannon._exit_ship_cannon_mode()
	if bs._rally and bs._rally._rally_mode:
		bs._rally._exit_rally_mode()
	if bs._medkit and bs._medkit._medkit_mode:
		bs._medkit._exit_medkit_mode()
	if bs._freeze and bs._freeze._freeze_mode:
		bs._freeze._exit_freeze_mode()
	if bs._skeleton_barrel and bs._skeleton_barrel._barrel_mode:
		bs._skeleton_barrel._exit_barrel_mode()


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
