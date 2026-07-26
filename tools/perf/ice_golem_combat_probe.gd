extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}
	var cell_size: float = 0.10
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({"kind": kind, "payload": payload.duplicate(true)})

	func record_troop_death_once(
		_troop_name: String,
		_troop_instance: int,
		_replay_order: int
	) -> bool:
		return true


const GOLEM_SCENE: PackedScene = preload(
	"res://Model/Characters/IceGolem/IceGolem.fbx"
)
const GOLEM_SCRIPT: Script = preload("res://scripts/ice_golem.gd")
const TURRET_SCRIPT: Script = preload("res://scripts/turret.gd")
const ARCHER_TOWER_SCRIPT: Script = preload("res://scripts/tower_archer.gd")

var _building_system: ProbeBuildingSystem


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	_add_environment()
	_build_ground()
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)

	var storage := _add_building(
		"storage",
		10,
		Vector3(-0.40, 0.10, 0.02),
		Color("#bd8b52")
	)
	var turret := _add_defense(
		"turret",
		20,
		Vector3(0.06, 0.10, -0.08),
		Color("#4688bd"),
		TURRET_SCRIPT
	)
	var archer_tower := _add_defense(
		"archer_tower",
		30,
		Vector3(1.04, 0.10, 0.20),
		Color("#6653ac"),
		ARCHER_TOWER_SCRIPT
	)

	var golem := GOLEM_SCENE.instantiate() as Node3D
	golem.set_script(GOLEM_SCRIPT)
	golem.position = Vector3(-0.82, 0.10, 0.08)
	golem.scale = Vector3.ONE * AttackSystem._scale_for_troop("IceGolem", 0.1)
	add_child(golem)
	golem.set_physics_process(false)
	var player := golem.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player != null and player.has_animation("Idle_A"):
		player.play("Idle_A")
		player.advance(0.0)
	for _frame in 12:
		await get_tree().process_frame
	turret.node.set_physics_process(false)
	archer_tower.node.set_physics_process(false)

	if player == null or not player.has_animation("Smash_Attack"):
		_fail("Smash_Attack animation is unavailable")
		return
	var skeleton := golem.find_child("Skeleton3D", true, false) as Skeleton3D
	if skeleton == null:
		_fail("Ice Golem skeleton is unavailable")
		return
	var left_arm_index := skeleton.find_bone(&"RigLArm1")
	var right_arm_index := skeleton.find_bone(&"RigRArm1")
	var left_forearm_index := skeleton.find_bone(&"RigLArm2")
	var right_forearm_index := skeleton.find_bone(&"RigRArm2")
	if (
		left_arm_index < 0
		or right_arm_index < 0
		or left_forearm_index < 0
		or right_forearm_index < 0
	):
		_fail("Ice Golem shoulder bones are unavailable")
		return
	var left_shoulder := skeleton.get_bone_global_pose(left_arm_index).origin
	var right_shoulder := skeleton.get_bone_global_pose(right_arm_index).origin
	var shoulder_span := absf(left_shoulder.x - right_shoulder.x)
	if shoulder_span < 0.95 or shoulder_span > 1.20:
		_fail("Ice Golem idle shoulder span is invalid: %.3f" % shoulder_span)
		return
	var left_upper_arm_length := skeleton.get_bone_rest(left_forearm_index).origin.x
	var right_upper_arm_length := skeleton.get_bone_rest(right_forearm_index).origin.x
	if (
		left_upper_arm_length < 0.44
		or left_upper_arm_length > 0.47
		or right_upper_arm_length < 0.44
		or right_upper_arm_length > 0.47
	):
		_fail(
			"Ice Golem upper-arm chain length is invalid: left=%.3f right=%.3f"
			% [left_upper_arm_length, right_upper_arm_length]
		)
		return
	var camera := get_viewport().get_camera_3d()
	var camera_transform := camera.global_transform
	var camera_fov := camera.fov
	camera.fov = 38.0
	camera.look_at_from_position(
		Vector3(-0.82, 0.76, 1.52),
		Vector3(-0.82, 0.22, 0.08),
		Vector3.UP
	)
	await RenderingServer.frame_post_draw
	var idle_capture := _capture_path("_idle.png")
	var idle_error := get_viewport().get_texture().get_image().save_png(idle_capture)
	if idle_error != OK:
		_fail("idle capture failed: %s" % error_string(idle_error))
		return
	camera.global_transform = camera_transform
	camera.fov = camera_fov

	BaseTroop.invalidate_combat_lists()
	golem.target_building = {}
	golem.target_bs = null
	golem._find_next_target()
	if int(golem.target_building.get("server_id", -1)) != 20:
		_fail(
			"expected farther turret over closer storage, got %s"
			% str(golem.target_building.get("id", "none"))
		)
		return

	_add_target_line(golem.global_position, turret.node.global_position)
	golem.global_position = turret.node.global_position + Vector3(-0.27, 0.0, 0.03)
	golem.target_building = turret
	golem.target_bs = _building_system
	golem.state = BaseTroop.State.ATTACKING
	golem.attack_timer = 0.0
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	golem._on_enter_attack_state()
	player.play("Smash_Attack")

	var frame_step := 1.0 / 60.0
	var elapsed := 0.0
	var hp_before := int(turret.hp)
	var strike_phase := -1.0
	while elapsed < float(golem.atk_speed):
		player.advance(frame_step)
		golem._do_attack(frame_step)
		elapsed += frame_step
		if int(turret.hp) < hp_before:
			strike_phase = (
				player.current_animation_position
				/ maxf(player.current_animation_length, 0.0001)
			)
			break
		await get_tree().process_frame
	var actual_damage := hp_before - int(turret.hp)
	if actual_damage != int(golem.damage):
		_fail(
			"level-1 smash damage mismatch actual=%d expected=%d"
			% [actual_damage, int(golem.damage)]
		)
		return
	if absf(strike_phase - 0.56) > 0.04:
		_fail("smash phase mismatch: %.3f" % strike_phase)
		return

	await RenderingServer.frame_post_draw
	var priority_capture := _capture_path("_priority.png")
	var priority_error := get_viewport().get_texture().get_image().save_png(priority_capture)
	if priority_error != OK:
		_fail("priority capture failed: %s" % error_string(priority_error))
		return

	var dummy_troop := Node3D.new()
	dummy_troop.name = "FreezeTimerProbeTroop"
	dummy_troop.add_to_group("troops")
	add_child(dummy_troop)
	BaseTroop.invalidate_combat_lists()
	golem.global_position = Vector3(0.20, 0.10, 0.08)
	golem.take_damage(int(golem.hp))
	for _frame in 3:
		await get_tree().process_frame

	var turret_freeze := float(turret.node.get("_freeze_remaining"))
	var archer_freeze := float(archer_tower.node.get("_freeze_remaining"))
	if turret_freeze < 6.75 or archer_freeze < 6.75:
		_fail(
			"defense freeze was not applied: turret=%.3f archer=%.3f"
			% [turret_freeze, archer_freeze]
		)
		return
	if storage.node.has_method("freeze_for"):
		_fail("economy building unexpectedly exposes freeze_for")
		return

	var vfx_nodes := get_tree().get_nodes_in_group("ice_freeze_vfx")
	var burst_nodes := get_tree().get_nodes_in_group("ice_freeze_burst")
	if vfx_nodes.size() != 1 or burst_nodes.size() != 1:
		_fail(
			"freeze VFX mismatch: services=%d bursts=%d"
			% [vfx_nodes.size(), burst_nodes.size()]
		)
		return
	var frost_renderer := vfx_nodes[0].get_node_or_null("FrozenDefenseCages") as MultiMeshInstance3D
	if (
		frost_renderer == null
		or frost_renderer.multimesh == null
		or frost_renderer.multimesh.instance_count != 2
	):
		_fail("expected frost overlays on exactly two defenses")
		return

	await RenderingServer.frame_post_draw
	var freeze_capture := _capture_path("_freeze.png")
	var freeze_error := get_viewport().get_texture().get_image().save_png(freeze_capture)
	if freeze_error != OK:
		_fail("freeze capture failed: %s" % error_string(freeze_error))
		return

	turret.node.set("_fire_timer", 0.21)
	archer_tower.node.set("_fire_timer", 0.17)
	for _step in 35:
		turret.node._physics_process(0.10)
		archer_tower.node._physics_process(0.10)
	if (
		absf(float(turret.node.get("_fire_timer")) - 0.21) > 0.0001
		or absf(float(archer_tower.node.get("_fire_timer")) - 0.17) > 0.0001
	):
		_fail("a frozen defense advanced its fire timer")
		return
	for _step in 36:
		turret.node._physics_process(0.10)
		archer_tower.node._physics_process(0.10)
	if (
		float(turret.node.get("_freeze_remaining")) > 0.0001
		or float(archer_tower.node.get("_freeze_remaining")) > 0.0001
	):
		_fail("freeze did not expire after seven simulated seconds")
		return

	var freeze_events := _building_system.telemetry.filter(
		func(entry: Dictionary) -> bool:
			return str(entry.get("kind", "")) == "ice_golem_freeze"
	)
	if freeze_events.size() != 1:
		_fail("expected one ice_golem_freeze telemetry event")
		return
	var payload: Dictionary = freeze_events[0].get("payload", {})
	if (
		int(payload.get("affected_count", 0)) != 2
		or absf(float(payload.get("duration", 0.0)) - 7.0) > 0.0001
		or absf(float(payload.get("radius", 0.0)) - 0.90) > 0.0001
	):
		_fail("freeze telemetry payload mismatch: %s" % str(payload))
		return

	print(
		"[ICE_GOLEM_COMBAT] PASS target=turret damage=",
		actual_damage,
		" strike_phase=",
		snappedf(strike_phase, 0.001),
		" shoulder_span=", snappedf(shoulder_span, 0.001),
		" upper_arm_length=", snappedf(left_upper_arm_length, 0.001),
		" frozen_ids=", payload.get("affected_server_ids", []),
		" idle_capture=", idle_capture,
		" priority_capture=", priority_capture,
		" freeze_capture=", freeze_capture
	)
	vfx_nodes[0].clear_all()
	vfx_nodes[0].queue_free()
	dummy_troop.queue_free()
	for _frame in 2:
		await get_tree().process_frame
	get_tree().quit()


func _add_building(
	building_id: String,
	server_id: int,
	building_position: Vector3,
	color: Color
) -> Dictionary:
	var root := Node3D.new()
	root.name = "%s_%d" % [building_id, server_id]
	root.position = building_position
	add_child(root)
	_add_building_mesh(root, color, Vector3(0.23, 0.19, 0.23))
	var building: Dictionary = {
		"id": building_id,
		"server_id": server_id,
		"grid_pos": Vector2i(server_id, 0),
		"hp": 1000,
		"node": root,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {
		"non_targetable": false,
		"cells": Vector2i(2, 2),
	}
	return building


func _add_defense(
	building_id: String,
	server_id: int,
	building_position: Vector3,
	color: Color,
	defense_script: Script
) -> Dictionary:
	var root := Node3D.new()
	root.name = "%s_%d" % [building_id, server_id]
	root.set_script(defense_script)
	root.position = building_position
	_add_building_mesh(root, color, Vector3(0.24, 0.27, 0.24))
	var crown := MeshInstance3D.new()
	var crown_mesh := CylinderMesh.new()
	crown_mesh.top_radius = 0.085
	crown_mesh.bottom_radius = 0.11
	crown_mesh.height = 0.10
	crown_mesh.radial_segments = 8
	crown.mesh = crown_mesh
	var crown_material := StandardMaterial3D.new()
	crown_material.albedo_color = color.lightened(0.24)
	crown_material.roughness = 0.72
	crown.material_override = crown_material
	crown.position.y = 0.18
	root.add_child(crown)
	add_child(root)
	var building: Dictionary = {
		"id": building_id,
		"server_id": server_id,
		"grid_pos": Vector2i(server_id, 0),
		"hp": 1000,
		"node": root,
		"tower_unit_node": root,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {
		"non_targetable": false,
		"cells": Vector2i(2, 2),
	}
	return building


func _add_building_mesh(root: Node3D, color: Color, size: Vector3) -> void:
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.name = "BuildingBody"
	var box := BoxMesh.new()
	box.size = size
	mesh_instance.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	mesh_instance.material_override = material
	mesh_instance.position.y = size.y * 0.5
	root.add_child(mesh_instance)


func _add_target_line(from: Vector3, to: Vector3) -> void:
	var line := MeshInstance3D.new()
	line.name = "DefensePriorityLine"
	var mesh := ImmediateMesh.new()
	mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	mesh.surface_set_color(Color("#9deaff"))
	mesh.surface_add_vertex(from + Vector3.UP * 0.20)
	mesh.surface_add_vertex(to + Vector3.UP * 0.20)
	mesh.surface_end()
	line.mesh = mesh
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.vertex_color_use_as_albedo = true
	material.no_depth_test = true
	line.material_override = material
	add_child(line)


func _add_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#328bc0")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d5f3ff")
	environment.ambient_light_energy = 0.32
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48, -34, 0)
	key_light.light_color = Color("#fff0cf")
	key_light.light_energy = 0.68
	key_light.shadow_enabled = true
	add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(0.14, 1.82, 2.55)
	camera.fov = 42.0
	camera.look_at_from_position(
		camera.position,
		Vector3(0.0, 0.13, 0.05),
		Vector3.UP
	)
	add_child(camera)
	camera.current = true


func _build_ground() -> void:
	var mesh_instance := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3.2, 1.8)
	mesh_instance.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#aadd58")
	material.roughness = 0.92
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _capture_path(suffix: String) -> String:
	var base := ProjectSettings.globalize_path("user://ice_golem_combat")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-base="):
			base = text.get_slice("=", 1)
	var path := base + suffix
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path


func _fail(message: String) -> void:
	push_error("[ICE_GOLEM_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
