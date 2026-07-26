extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}
	var cell_size: float = 0.10
	var grid_center: Vector3 = Vector3.ZERO
	var grid_extent_x: float = 3.2
	var grid_extent_z: float = 1.9
	var grid_rotation: float = 0.0
	var telemetry: Array[Dictionary] = []
	var casualties: Array[Dictionary] = []

	func _get_grid_index() -> int:
		return 0

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({"kind": kind, "payload": payload.duplicate(true)})

	func record_troop_death_once(
		troop_name: String,
		troop_instance: int,
		replay_order: int
	) -> bool:
		casualties.append({
			"troop": troop_name,
			"instance": troop_instance,
			"replay_order": replay_order,
		})
		return true


const HORROR_SCENE: PackedScene = preload(
	"res://Model/Characters/HorrorEvolution/horror.fbx"
)
const HORROR_SCRIPT: Script = preload("res://scripts/horror_evolution.gd")
const EXPECTED_STAGE_DAMAGE: Array[int] = [453, 160, 60]
const EXPECTED_STAGE_COUNTS: Array[int] = [1, 2, 4]
const REQUIRED_ANIMATIONS: Array[String] = [
	"Idle_A",
	"Running_A",
	"Bite_Attack",
	"GetHit",
	"Death_A",
	"Spawn_A",
]

var _building_system: ProbeBuildingSystem
var _target_building: Dictionary


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	_add_environment()
	_build_ground()
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)
	_target_building = _add_building(
		"town_hall",
		10,
		Vector3(0.44, 0.10, -0.03),
		Color("#7f4d38")
	)

	var root_horror := HORROR_SCENE.instantiate() as Node3D
	if root_horror == null:
		_fail("failed to instantiate the root Horror")
		return
	root_horror.set_script(HORROR_SCRIPT)
	root_horror.name = "HorrorRoot"
	root_horror.set("level", 1)
	root_horror.set_meta("replay_order", 7)
	root_horror.position = Vector3(-0.18, 0.10, 0.0)
	var horror_scale := AttackSystem._scale_for_troop("Horror", 0.1)
	root_horror.set("_spawn_scale", horror_scale)
	root_horror.scale = Vector3.ONE * horror_scale
	add_child(root_horror)
	root_horror.activate()
	for _frame in 12:
		await get_tree().process_frame
	root_horror.set_physics_process(false)

	if not _verify_stage_animations(root_horror, 0):
		return
	if not await _verify_bite_contact(root_horror, 0):
		return
	if not await _capture_generation("root_1", [root_horror]):
		return

	root_horror.take_damage(int(root_horror.get("hp")))
	var medium_generation := _live_stage_nodes(1)
	if medium_generation.size() != EXPECTED_STAGE_COUNTS[1]:
		_fail("root death created %d medium forms instead of 2" % medium_generation.size())
		return
	_pause_nodes(medium_generation)
	if not _verify_generation(medium_generation, 1):
		return
	if not await _capture_generation("medium_2", medium_generation):
		return
	if not await _verify_bite_contact(medium_generation[0], 1):
		return

	for medium in medium_generation:
		medium.take_damage(int(medium.get("hp")))
	var small_generation := _live_stage_nodes(2)
	if small_generation.size() != EXPECTED_STAGE_COUNTS[2]:
		_fail("two medium deaths created %d small forms instead of 4" % small_generation.size())
		return
	_pause_nodes(small_generation)
	if not _verify_generation(small_generation, 2):
		return
	if not await _capture_generation("small_4", small_generation):
		return
	if not await _verify_bite_contact(small_generation[0], 2):
		return

	var split_event_count := _building_system.telemetry.filter(
		func(entry: Dictionary) -> bool:
			return str(entry.get("kind", "")) == "troop_split_spawn"
	).size()
	if split_event_count != 6:
		_fail("expected six split telemetry events, got %d" % split_event_count)
		return
	if _building_system.casualties.size() != 1:
		_fail(
			"temporary descendants changed persistent casualties: %s"
			% str(_building_system.casualties)
		)
		return
	if str(_building_system.casualties[0].get("troop", "")) != "Horror":
		_fail("root casualty was not recorded as Horror")
		return

	var terminal := small_generation[0]
	terminal.take_damage(int(terminal.get("hp")))
	if _live_stage_nodes(2).size() != 3:
		_fail("final-stage death unexpectedly spawned another generation")
		return

	var split_projection: Array = []
	for entry in _building_system.telemetry:
		if str(entry.get("kind", "")) != "troop_split_spawn":
			continue
		var payload: Dictionary = entry.get("payload", {})
		split_projection.append({
			"parent_stage": int(payload.get("parent_stage", -1)),
			"child_stage": int(payload.get("child_stage", -1)),
			"lineage": int(payload.get("child_lineage", -1)),
			"order": int(payload.get("child_replay_order", -1)),
		})
	print(
		"[HORROR_EVOLUTION_COMBAT] PASS split=1->2->4",
		" slots=3 casualties=", _building_system.casualties,
		" split_projection=", split_projection,
		" captures=", _capture_base()
	)
	for _frame in 3:
		await get_tree().process_frame
	get_tree().quit()


func _verify_stage_animations(troop: Node3D, stage: int) -> bool:
	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null:
		_fail("stage %d has no TroopAnimPlayer" % stage)
		return false
	for animation_name in REQUIRED_ANIMATIONS:
		if not player.has_animation(animation_name):
			_fail("stage %d is missing %s" % [stage, animation_name])
			return false
	return true


func _verify_generation(generation: Array[Node3D], stage: int) -> bool:
	var lineages: Array[int] = []
	var replay_orders: Array[int] = []
	for troop in generation:
		if not _verify_stage_animations(troop, stage):
			return false
		if int(troop.get("evolution_stage")) != stage:
			_fail("generation contains a mismatched evolution stage")
			return false
		if int(troop.get("damage")) != EXPECTED_STAGE_DAMAGE[stage]:
			_fail(
				"stage %d damage mismatch: %s"
				% [stage, str(troop.get("damage"))]
			)
			return false
		lineages.append(int(troop.get("evolution_lineage")))
		replay_orders.append(int(troop.get_meta("replay_order", -1)))
	lineages.sort()
	replay_orders.sort()
	if stage == 1 and lineages != [1, 2]:
		_fail("medium lineage is not deterministic: %s" % str(lineages))
		return false
	if stage == 2 and lineages != [3, 4, 5, 6]:
		_fail("small lineage is not deterministic: %s" % str(lineages))
		return false
	var unique_orders: Dictionary = {}
	for order in replay_orders:
		unique_orders[order] = true
	if unique_orders.size() != generation.size():
		_fail("descendant replay orders are not unique: %s" % str(replay_orders))
		return false
	return true


func _verify_bite_contact(troop: Node3D, stage: int) -> bool:
	var player := troop.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	troop.global_position = _target_building.node.global_position + Vector3(-0.24, 0.0, 0.0)
	troop.set("target_building", _target_building)
	troop.set("target_bs", _building_system)
	troop.set("state", BaseTroop.State.ATTACKING)
	troop.set("attack_timer", 0.0)
	troop._on_enter_attack_state()
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.play("Bite_Attack")
	var hp_before := int(_target_building.hp)
	var hit_phase := -1.0
	var step := 1.0 / 120.0
	var elapsed := 0.0
	while elapsed <= float(troop.get("atk_speed")):
		player.advance(step)
		troop._do_attack(step)
		elapsed += step
		if int(_target_building.hp) < hp_before:
			hit_phase = (
				player.current_animation_position
				/ maxf(player.current_animation_length, 0.0001)
			)
			break
	if hp_before - int(_target_building.hp) != EXPECTED_STAGE_DAMAGE[stage]:
		_fail(
			"stage %d bite damage mismatch: %d"
			% [stage, hp_before - int(_target_building.hp)]
		)
		return false
	if absf(hit_phase - 0.42) > 0.055:
		_fail("stage %d bite phase mismatch: %.3f" % [stage, hit_phase])
		return false
	troop.set("target_building", {})
	troop.set("target_bs", null)
	print(
		"[HORROR_EVOLUTION_COMBAT] bite stage=", stage,
		" damage=", EXPECTED_STAGE_DAMAGE[stage],
		" contact_phase=", snappedf(hit_phase, 0.001)
	)
	return true


func _live_stage_nodes(stage: int) -> Array[Node3D]:
	var result: Array[Node3D] = []
	for child in get_children():
		if not is_instance_valid(child) or not (child is Node3D):
			continue
		if child.get_script() != HORROR_SCRIPT:
			continue
		if bool(child.get("_is_dead")):
			continue
		if int(child.get("evolution_stage")) == stage:
			result.append(child as Node3D)
	result.sort_custom(
		func(a: Node3D, b: Node3D) -> bool:
			return int(a.get("evolution_lineage")) < int(b.get("evolution_lineage"))
	)
	return result


func _pause_nodes(nodes: Array[Node3D]) -> void:
	for node in nodes:
		node.set_process(false)
		node.set_physics_process(false)


func _capture_generation(label: String, generation: Array[Node3D]) -> bool:
	for troop in _all_horror_nodes():
		troop.visible = troop in generation
	_layout_generation_for_capture(generation)
	await RenderingServer.frame_post_draw
	var capture_path := "%s_%s.png" % [_capture_base(), label]
	DirAccess.make_dir_recursive_absolute(capture_path.get_base_dir())
	var error := get_viewport().get_texture().get_image().save_png(capture_path)
	if error != OK:
		_fail("capture %s failed: %s" % [label, error_string(error)])
		return false
	print("[HORROR_EVOLUTION_COMBAT] capture=", capture_path)
	return true


func _layout_generation_for_capture(generation: Array[Node3D]) -> void:
	var spacing := 0.30
	if generation.size() >= 4:
		spacing = 0.18
	var row_width := spacing * float(maxi(0, generation.size() - 1))
	for index in range(generation.size()):
		var troop := generation[index]
		troop.global_position = Vector3(
			-0.42 - row_width * 0.5 + float(index) * spacing,
			0.10,
			-0.04
		)
		troop.rotation_degrees = Vector3.ZERO


func _all_horror_nodes() -> Array[Node3D]:
	var result: Array[Node3D] = []
	for child in get_children():
		if is_instance_valid(child) and child is Node3D and child.get_script() == HORROR_SCRIPT:
			result.append(child as Node3D)
	return result


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
	var body := MeshInstance3D.new()
	body.name = "BuildingBody"
	var box := BoxMesh.new()
	box.size = Vector3(0.30, 0.32, 0.30)
	body.mesh = box
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.82
	body.material_override = material
	body.position.y = 0.16
	root.add_child(body)
	var roof := MeshInstance3D.new()
	var roof_mesh := PrismMesh.new()
	roof_mesh.size = Vector3(0.38, 0.16, 0.38)
	roof.mesh = roof_mesh
	roof.material_override = material
	roof.position.y = 0.38
	root.add_child(roof)
	var building: Dictionary = {
		"id": building_id,
		"server_id": server_id,
		"grid_pos": Vector2i(server_id, 0),
		"hp": 10_000,
		"node": root,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {
		"non_targetable": false,
		"cells": Vector2i(4, 4),
	}
	return building


func _add_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#3aa7dc")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d9f1ff")
	environment.ambient_light_energy = 0.42
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48, -34, 0)
	key_light.light_color = Color("#fff0cf")
	key_light.light_energy = 0.82
	key_light.shadow_enabled = true
	add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(0.08, 1.42, 2.08)
	camera.fov = 37.0
	camera.look_at_from_position(camera.position, Vector3(0.08, 0.14, 0.0), Vector3.UP)
	add_child(camera)
	camera.current = true


func _build_ground() -> void:
	var mesh_instance := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3.2, 1.9)
	mesh_instance.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#b2dd5b")
	material.roughness = 0.92
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _capture_base() -> String:
	var base := ProjectSettings.globalize_path("user://horror_evolution_combat")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-base="):
			base = text.get_slice("=", 1)
	return base


func _fail(message: String) -> void:
	push_error("[HORROR_EVOLUTION_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
