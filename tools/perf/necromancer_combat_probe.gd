extends Node3D

class ProbeBuildingSystem:
	extends Node

	var placed_buildings: Array = []
	var building_defs: Dictionary = {}
	var cell_size: float = 0.10
	var grid_center: Vector3 = Vector3.ZERO
	var grid_extent_x: float = 2.4
	var grid_extent_z: float = 1.4
	var grid_rotation: float = 0.0
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({"kind": kind, "payload": payload.duplicate(true)})

	func record_troop_death_once(
		_troop_name: String,
		_troop_instance: int,
		_replay_order: int
	) -> bool:
		return true

	func remove_building(building: Dictionary) -> void:
		placed_buildings.erase(building)

	func _get_grid_index() -> int:
		return 0


const NECROMANCER_SCENE: PackedScene = preload(
	"res://Model/Characters/Necromancer/Necromancer.fbx"
)
const NECROMANCER_SCRIPT: Script = preload("res://scripts/necromancer.gd")

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

	var target := _add_building("town_hall", 91, Vector3(0.42, 0.10, 0.0))
	var necromancer := NECROMANCER_SCENE.instantiate() as Node3D
	necromancer.name = "NecromancerProbe"
	necromancer.set_script(NECROMANCER_SCRIPT)
	necromancer.position = Vector3(-0.34, 0.10, 0.0)
	necromancer.scale = Vector3.ONE * AttackSystem._scale_for_troop("Necromancer", 0.1)
	add_child(necromancer)
	for _frame in 12:
		await get_tree().process_frame
	necromancer.set_physics_process(false)
	necromancer.target_building = target
	necromancer.target_bs = _building_system
	necromancer.target_guard = null
	necromancer.state = BaseTroop.State.ATTACKING
	necromancer._build_pool()

	var hp_before_projectile := int(target.hp)
	necromancer.attack_timer = float(necromancer.atk_speed)
	necromancer._do_attack(1.0 / 60.0)
	if not necromancer._active.is_empty():
		_fail("green projectile appeared before the staff release frame")
		return
	await get_tree().create_timer(
		Necromancer.ATTACK_RELEASE_DELAY - 0.04
	).timeout
	if not necromancer._active.is_empty():
		_fail("green projectile appeared before attack frame %d" % Necromancer.ATTACK_RELEASE_FRAME)
		return
	await get_tree().create_timer(0.06).timeout
	if necromancer._active.size() != 1:
		_fail(
			"staff release frame did not create exactly one projectile: frame=%d delay=%.3f"
			% [Necromancer.ATTACK_RELEASE_FRAME, Necromancer.ATTACK_RELEASE_DELAY]
		)
		return
	var projectile := necromancer._active[0].node as MeshInstance3D
	if projectile == null or not projectile.visible:
		_fail("green projectile is not visible")
		return
	var projectile_material := projectile.material_override as ShaderMaterial
	var tint: Vector3 = projectile_material.get_shader_parameter("tint")
	if tint.distance_to(Vector3(0.22, 1.0, 0.34)) > 0.001:
		_fail("projectile tint is not green: %s" % str(tint))
		return

	for _step in 12:
		necromancer._update_projectiles(1.0 / 60.0)
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var projectile_capture := _capture_path("_projectile.png")
	var projectile_error := get_viewport().get_texture().get_image().save_png(
		projectile_capture
	)
	if projectile_error != OK:
		_fail("projectile capture failed: %s" % error_string(projectile_error))
		return
	for _step in 45:
		necromancer._update_projectiles(1.0 / 60.0)
		if necromancer._active.is_empty():
			break
		await get_tree().process_frame
	if int(target.hp) != hp_before_projectile - int(necromancer.damage):
		_fail(
			"projectile damage mismatch: expected=%d actual=%d"
			% [int(necromancer.damage), hp_before_projectile - int(target.hp)]
		)
		return

	necromancer._begin_summon()
	await get_tree().create_timer(
		Necromancer.SUMMON_CAST_RELEASE_DELAY * 0.55
	).timeout
	if not necromancer._summons.is_empty():
		_fail("skeleton appeared before the staff impact")
		return
	await get_tree().create_timer(
		Necromancer.SUMMON_CAST_RELEASE_DELAY * 0.65
	).timeout
	if necromancer._summons.size() != Necromancer.SUMMON_BATCH_SIZE:
		_fail(
			"staff impact did not release a full skeleton batch: expected=%d actual=%d"
			% [Necromancer.SUMMON_BATCH_SIZE, necromancer._summons.size()]
		)
		return
	var skeleton := necromancer._summons[1] as Node3D
	if skeleton == null or not is_instance_valid(skeleton):
		_fail("summoned skeleton is invalid")
		return
	if skeleton.global_position.y >= 0.095:
		_fail("skeleton did not begin below the ground plane")
		return
	var summon_vfx := get_tree().get_first_node_in_group("necromancer_summon_vfx")
	if summon_vfx == null:
		_fail("summon ground VFX is missing")
		return
	var lateral_positions: Array[float] = []
	var average_forward_offset := 0.0
	for summon in necromancer._summons:
		var offset: Vector3 = summon.global_position - necromancer.global_position
		average_forward_offset += offset.x
		lateral_positions.append(snappedf(offset.z, 0.001))
	average_forward_offset /= float(necromancer._summons.size())
	lateral_positions.sort()
	if average_forward_offset <= 0.12:
		_fail("skeleton batch was not placed in front of the Necromancer")
		return
	if (
		lateral_positions.size() != 3
		or absf(lateral_positions[0] + Necromancer.SUMMON_LATERAL_SPACING) > 0.015
		or absf(lateral_positions[1]) > 0.015
		or absf(lateral_positions[2] - Necromancer.SUMMON_LATERAL_SPACING) > 0.015
	):
		_fail("skeleton batch lateral formation is invalid: %s" % str(lateral_positions))
		return

	await RenderingServer.frame_post_draw
	var summon_capture := _capture_path("_summon.png")
	var summon_error := get_viewport().get_texture().get_image().save_png(
		summon_capture
	)
	if summon_error != OK:
		_fail("summon capture failed: %s" % error_string(summon_error))
		return
	await get_tree().create_timer(Necromancer.SUMMON_RISE_DURATION + 0.10).timeout
	if skeleton.state == BaseTroop.State.INACTIVE:
		_fail("skeleton stayed inactive after its rise animation")
		return

	var hp_before_skeleton := int(target.hp)
	var skeleton_hit := false
	for _step in 240:
		await get_tree().physics_frame
		if int(target.hp) < hp_before_skeleton:
			skeleton_hit = true
			break
	if not skeleton_hit:
		_fail("summoned skeleton did not damage the building")
		return
	if hp_before_skeleton - int(target.hp) != int(skeleton.damage):
		_fail(
			"skeleton damage mismatch: expected=%d actual=%d"
			% [int(skeleton.damage), hp_before_skeleton - int(target.hp)]
		)
		return
	var skeleton_damage := int(skeleton.damage)
	var necromancer_damage := int(necromancer.damage)

	if necromancer._summons.size() != Necromancer.MAX_ACTIVE_SUMMONS:
		_fail("expected three active skeletons, got %d" % necromancer._summons.size())
		return
	necromancer._release_summon()
	if necromancer._summons.size() != Necromancer.MAX_ACTIVE_SUMMONS:
		_fail("summon cap allowed an extra skeleton")
		return

	for summon in necromancer._summons:
		summon.take_damage(int(summon.hp))
	necromancer._prune_summons()
	if not necromancer._summons.is_empty():
		_fail("dead skeletons remained in the active summon batch")
		return
	necromancer._update_summon_batches(0.0)
	if absf(necromancer._summon_respawn_timer - Necromancer.SUMMON_RESPAWN_DELAY) > 0.001:
		_fail("replacement batch delay did not start at %.2fs" % Necromancer.SUMMON_RESPAWN_DELAY)
		return
	necromancer._update_summon_batches(Necromancer.SUMMON_RESPAWN_DELAY - 0.10)
	if necromancer._summon_cast_tween != null:
		_fail("replacement summon cast started before the respawn delay")
		return
	necromancer._update_summon_batches(0.11)
	if necromancer._summon_cast_tween == null:
		_fail("replacement summon cast did not start after the respawn delay")
		return
	await get_tree().create_timer(Necromancer.SUMMON_CAST_RELEASE_DELAY + 0.04).timeout
	if necromancer._summons.size() != Necromancer.SUMMON_BATCH_SIZE:
		_fail("replacement summon did not create a complete batch")
		return

	var summon_events := _building_system.telemetry.filter(
		func(entry: Dictionary) -> bool:
			return str(entry.get("kind", "")) == "necromancer_summon"
	)
	if summon_events.size() != Necromancer.SUMMON_BATCH_SIZE * 2:
		_fail("summon telemetry count mismatch: %d" % summon_events.size())
		return

	var summon_refs: Array[WeakRef] = []
	for summon in necromancer._summons:
		summon_refs.append(weakref(summon))
	necromancer.take_damage(int(necromancer.hp))
	await get_tree().create_timer(0.28).timeout
	for summon_ref in summon_refs:
		if is_instance_valid(summon_ref.get_ref()):
			_fail("owner death left a summoned skeleton in combat")
			return

	print(
		"[NECROMANCER_COMBAT] PASS projectile_damage=", necromancer_damage,
		" skeleton_damage=", skeleton_damage,
		" summon_batches=", floori(
			float(summon_events.size()) / float(Necromancer.SUMMON_BATCH_SIZE)
		),
		" summon_count=", summon_events.size(),
		" respawn_delay=", Necromancer.SUMMON_RESPAWN_DELAY,
		" attack_release_frame=", Necromancer.ATTACK_RELEASE_FRAME,
		" attack_release_delay=", Necromancer.ATTACK_RELEASE_DELAY,
		" cast_release=", Necromancer.SUMMON_CAST_RELEASE_DELAY,
		" projectile_capture=", projectile_capture,
		" summon_capture=", summon_capture
	)
	get_tree().quit()


func _add_building(
	building_id: String,
	server_id: int,
	building_position: Vector3
) -> Dictionary:
	var root := Node3D.new()
	root.name = "%s_%d" % [building_id, server_id]
	root.position = building_position
	add_child(root)

	var body := MeshInstance3D.new()
	body.name = "BuildingBody"
	var body_mesh := BoxMesh.new()
	body_mesh.size = Vector3(0.25, 0.24, 0.25)
	body.mesh = body_mesh
	var body_material := StandardMaterial3D.new()
	body_material.albedo_color = Color("#8a654b")
	body_material.roughness = 0.88
	body.material_override = body_material
	body.position.y = 0.12
	root.add_child(body)

	var roof := MeshInstance3D.new()
	roof.name = "BuildingRoof"
	var roof_mesh := CylinderMesh.new()
	roof_mesh.top_radius = 0.03
	roof_mesh.bottom_radius = 0.19
	roof_mesh.height = 0.11
	roof_mesh.radial_segments = 4
	roof.mesh = roof_mesh
	var roof_material := StandardMaterial3D.new()
	roof_material.albedo_color = Color("#623456")
	roof_material.roughness = 0.82
	roof.material_override = roof_material
	roof.position.y = 0.295
	roof.rotation_degrees.y = 45.0
	root.add_child(roof)

	var building: Dictionary = {
		"id": building_id,
		"server_id": server_id,
		"grid_pos": Vector2i(server_id, 0),
		"hp": 4000,
		"node": root,
	}
	_building_system.placed_buildings.append(building)
	_building_system.building_defs[building_id] = {
		"non_targetable": false,
		"cells": Vector2i(2, 2),
	}
	return building


func _add_environment() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#318bbd")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#bed6df")
	environment.ambient_light_energy = 0.10
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	world_environment.environment = environment
	add_child(world_environment)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-48.0, -36.0, 0.0)
	key_light.light_color = Color("#ffeac9")
	key_light.light_energy = 0.22
	key_light.shadow_enabled = true
	add_child(key_light)

	var camera := Camera3D.new()
	camera.position = Vector3(0.08, 1.65, 2.30)
	camera.fov = 34.0
	camera.look_at_from_position(camera.position, Vector3(0.02, 0.14, 0.0), Vector3.UP)
	add_child(camera)
	camera.current = true


func _build_ground() -> void:
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(2.6, 1.55)
	ground.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#96c84c")
	material.roughness = 0.94
	ground.material_override = material
	add_child(ground)


func _capture_path(suffix: String) -> String:
	var base := ProjectSettings.globalize_path("user://necromancer_combat")
	for arg in OS.get_cmdline_user_args():
		var text := String(arg)
		if text.begins_with("--capture-base="):
			base = text.get_slice("=", 1)
	var path := base + suffix
	DirAccess.make_dir_recursive_absolute(path.get_base_dir())
	return path


func _fail(message: String) -> void:
	push_error("[NECROMANCER_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
