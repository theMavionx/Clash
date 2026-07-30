class_name BSFreezeSpell
extends RefCounted
## Main Ship level 7 freeze orb. The projectile lands on the selected ground
## point and disables defenses and armed traps inside its radius.

const UNLOCK_SHIP_LEVEL: int = 7
const ENERGY_COST: int = 5
const ENERGY_COST_INCREMENT: int = 1
const RADIUS: float = 0.80
const DURATION_SEC: float = 4.0
const FLIGHT_SEC: float = 0.6
const ORB_COLOR: Color = Color(0.26, 0.84, 1.0, 1.0)

var bs: Node3D
var _ship_level: int = 1
var _freeze_mode: bool = false
var _freeze_uses: int = 0
var _freeze_paused_attack: bool = false
var _freeze_label: Label = null
var _projectiles: Array[Dictionary] = []


func init(building_system: Node3D) -> BSFreezeSpell:
	bs = building_system
	return self


func reset(ship_level: int = 1) -> void:
	_ship_level = clampi(ship_level, 1, 10)
	_freeze_uses = 0
	_exit_freeze_mode()
	_clear_projectiles()


func is_unlocked() -> bool:
	return _ship_level >= UNLOCK_SHIP_LEVEL


func energy_cost() -> int:
	return ENERGY_COST + _freeze_uses * ENERGY_COST_INCREMENT


func process(delta: float) -> void:
	for index in range(_projectiles.size() - 1, -1, -1):
		var projectile: Dictionary = _projectiles[index]
		var root: Node3D = projectile.get("root", null)
		if not is_instance_valid(root):
			_projectiles.remove_at(index)
			continue
		var age: float = float(projectile.get("age", 0.0)) + delta
		projectile["age"] = age
		var progress := clampf(age / FLIGHT_SEC, 0.0, 1.0)
		var start: Vector3 = projectile.get("start", Vector3.ZERO)
		var target: Vector3 = projectile.get("target", Vector3.ZERO)
		var flat := start.lerp(target, progress)
		var arc_height := maxf(0.42, start.distance_to(target) * 0.22)
		root.global_position = flat + Vector3(
			0.0,
			4.0 * arc_height * progress * (1.0 - progress),
			0.0
		)
		root.rotate_x(delta * 4.8)
		root.rotate_z(delta * 3.1)
		if progress >= 1.0:
			_apply_freeze(target, str(projectile.get("source", "manual")))
			root.queue_free()
			_projectiles.remove_at(index)


func _enter_freeze_mode() -> void:
	if (
		not is_unlocked()
		or not bs._cannon
		or bs._cannon._cannon_energy < energy_cost()
	):
		return
	_cancel_other_modes()
	_freeze_mode = true
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("freeze_mode", {"active": true})
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_freeze_paused_attack = bool(attack_system.is_attack_mode)
		attack_system._pause_attack_mode()
	else:
		_freeze_paused_attack = false
	if bs.canvas and not _freeze_label:
		_freeze_label = Label.new()
		_freeze_label.text = "Freeze Orb - select an area of defenses"
		_freeze_label.anchor_left = 0.5
		_freeze_label.anchor_right = 0.5
		_freeze_label.offset_left = -300
		_freeze_label.offset_right = 300
		_freeze_label.offset_top = 20
		_freeze_label.offset_bottom = 55
		_freeze_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_freeze_label.add_theme_font_size_override("font_size", 20)
		_freeze_label.add_theme_color_override("font_color", ORB_COLOR)
		bs.canvas.add_child(_freeze_label)


func _exit_freeze_mode() -> void:
	_freeze_mode = false
	var bridge: Node = bs.get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("freeze_mode", {"active": false})
	if is_instance_valid(_freeze_label):
		_freeze_label.queue_free()
	_freeze_label = null
	if _freeze_paused_attack:
		_freeze_paused_attack = false
		var attack_system: Node = bs.get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


func _drop_freeze(world_pos: Vector3) -> bool:
	if (
		not is_unlocked()
		or not bs._cannon
		or bs._cannon._cannon_energy < energy_cost()
	):
		return false
	var cost := energy_cost()
	var clamped := BaseTroop._clamp_to_island(world_pos)
	var target := Vector3(clamped.x, bs.grid_y + 0.025, clamped.z)
	bs._cannon._cannon_energy -= cost
	_freeze_uses += 1
	_launch_or_apply(target, "manual")
	_record_action(target)
	bs._cannon._update_cannon_energy_ui()
	return true


func replay_drop_freeze(world_pos: Vector3) -> void:
	_freeze_uses += 1
	var clamped := BaseTroop._clamp_to_island(world_pos)
	var target := Vector3(clamped.x, bs.grid_y + 0.025, clamped.z)
	_launch_or_apply(target, "replay")


func _launch_or_apply(target: Vector3, source: String) -> void:
	var ship: Node3D = bs._cannon._get_attack_ship() if bs._cannon else null
	if not is_instance_valid(ship):
		_apply_freeze(target, source)
		return
	var root := _create_orb()
	bs.get_tree().current_scene.add_child(root)
	var start := ship.global_position + Vector3(0.0, 0.18, 0.0)
	root.global_position = start
	_projectiles.append({
		"root": root,
		"start": start,
		"target": target,
		"age": 0.0,
		"source": source,
	})


func _apply_freeze(target: Vector3, source: String) -> void:
	var affected := CombatFreeze.apply_radial(
		target,
		RADIUS,
		DURATION_SEC,
		false
	)
	var vfx := IceFreezeVFX.get_or_create(bs.get_tree().current_scene)
	if vfx:
		vfx.show_freeze(target, RADIUS, DURATION_SEC, affected)
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("freeze_impact", {
			"x": snappedf(target.x, 0.001),
			"z": snappedf(target.z, 0.001),
			"radius": RADIUS,
			"duration": DURATION_SEC,
			"affected": affected.size(),
			"source": source,
		})


func _record_action(target: Vector3) -> void:
	if bs.is_viewing_enemy:
		var elapsed: float = (
			float(Time.get_ticks_msec()) / 1000.0
			- float(bs._battle_start_time)
		)
		bs._battle_replay.append({
			"t": elapsed,
			"type": "freeze_drop",
			"x": target.x,
			"z": target.z,
			"flight_time": FLIGHT_SEC,
		})
	if bs.has_method("record_replay_telemetry"):
		bs.record_replay_telemetry("freeze_drop", {
			"x": snappedf(target.x, 0.001),
			"z": snappedf(target.z, 0.001),
			"flight_time": FLIGHT_SEC,
			"source": "manual",
		})


func _create_orb() -> Node3D:
	var root := Node3D.new()
	root.name = "MainShipFreezeOrb"
	var sphere := MeshInstance3D.new()
	var sphere_mesh := SphereMesh.new()
	sphere_mesh.radius = 0.075
	sphere_mesh.height = 0.15
	sphere_mesh.radial_segments = 16
	sphere_mesh.rings = 8
	sphere.mesh = sphere_mesh
	var sphere_mat := StandardMaterial3D.new()
	sphere_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	sphere_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	sphere_mat.albedo_color = Color(0.42, 0.92, 1.0, 0.94)
	sphere_mat.emission_enabled = true
	sphere_mat.emission = ORB_COLOR
	sphere_mat.emission_energy_multiplier = 2.2
	sphere.material_override = sphere_mat
	sphere.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(sphere)
	var halo := MeshInstance3D.new()
	var halo_mesh := TorusMesh.new()
	halo_mesh.inner_radius = 0.010
	halo_mesh.outer_radius = 0.112
	halo_mesh.rings = 20
	halo_mesh.ring_segments = 8
	halo.mesh = halo_mesh
	halo.rotation_degrees.x = 90.0
	halo.material_override = sphere_mat
	halo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(halo)
	return root


func _cancel_other_modes() -> void:
	if bs._cannon and bs._cannon._ship_cannon_mode:
		bs._cannon._exit_ship_cannon_mode()
	if bs._rally and bs._rally._rally_mode:
		bs._rally._exit_rally_mode()
	if bs._medkit and bs._medkit._medkit_mode:
		bs._medkit._exit_medkit_mode()
	if bs._rage and bs._rage._rage_mode:
		bs._rage._exit_rage_mode()
	if bs._skeleton_barrel and bs._skeleton_barrel._barrel_mode:
		bs._skeleton_barrel._exit_barrel_mode()


func _clear_projectiles() -> void:
	for projectile in _projectiles:
		var root: Node = projectile.get("root", null)
		if is_instance_valid(root):
			root.queue_free()
	_projectiles.clear()
