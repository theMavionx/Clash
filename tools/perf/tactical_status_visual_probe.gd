extends Node3D

const KNIGHT_SCENE := preload(
	"res://Model/Characters/pirate_knight/pirate_knight.tscn"
)
const KNIGHT_SCRIPT := preload("res://scripts/knight.gd")
const OUTPUT_PATH := "res://.codex-artifacts/tactical-status-feedback.png"


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	_build_stage()
	var rage_knight := await _spawn_knight(
		"RageKnight",
		Vector3(-0.34, 0.02, 0.0)
	)
	var heal_knight := await _spawn_knight(
		"HealKnight",
		Vector3(0.34, 0.02, 0.0)
	)
	if rage_knight == null or heal_knight == null:
		_fail("could not instantiate test knights")
		return

	var base_damage := rage_knight.damage
	if not rage_knight.apply_tactical_boost(1.2, 2.0, 1.25):
		_fail("rage boost was rejected")
		return
	if rage_knight.damage != base_damage * 2:
		_fail("rage damage multiplier was not applied")
		return

	heal_knight.hp = maxi(1, heal_knight.max_hp - 40)
	BaseTroop.invalidate_troops_cache()
	var medkit := BSMedkit.new()
	medkit._heal_troops(heal_knight.global_position, 0.0)
	if heal_knight.hp <= heal_knight.max_hp - 40:
		_fail("medkit did not restore HP")
		return

	for _frame in 4:
		await get_tree().process_frame
	var batch := TroopStatusBatch.get_for_scene(self)
	if batch.active_count(TroopStatusBatch.EFFECT_RAGE) != 1:
		_fail("rage status was not registered")
		return
	if batch.active_count(TroopStatusBatch.EFFECT_HEAL) != 1:
		_fail("healing status was not registered")
		return
	if batch.visual_mesh_count(TroopStatusBatch.EFFECT_RAGE) == 0:
		_fail("rage coating was not applied to troop meshes")
		return
	if batch.visual_mesh_count(TroopStatusBatch.EFFECT_HEAL) == 0:
		_fail("healing coating was not applied to troop meshes")
		return

	var capture_result := OUTPUT_PATH
	if DisplayServer.get_name() == "headless":
		capture_result = "skipped(headless)"
	else:
		await RenderingServer.frame_post_draw
		DirAccess.make_dir_recursive_absolute(
			ProjectSettings.globalize_path("res://.codex-artifacts")
		)
		var image := get_viewport().get_texture().get_image()
		var error := image.save_png(OUTPUT_PATH)
		if error != OK:
			_fail("capture failed: %s" % error_string(error))
			return
	print(
		"[TACTICAL_STATUS_VISUAL] PASS rage=%d heal=%d capture=%s"
		% [
			batch.active_count(TroopStatusBatch.EFFECT_RAGE),
			batch.active_count(TroopStatusBatch.EFFECT_HEAL),
			capture_result,
		]
	)

	await get_tree().create_timer(1.35).timeout
	await get_tree().process_frame
	if batch.active_count(TroopStatusBatch.EFFECT_RAGE) != 0:
		_fail("rage status did not expire")
		return
	if batch.active_count(TroopStatusBatch.EFFECT_HEAL) != 0:
		_fail("healing status did not expire")
		return
	if (
		batch.visual_mesh_count(TroopStatusBatch.EFFECT_RAGE) != 0
		or batch.visual_mesh_count(TroopStatusBatch.EFFECT_HEAL) != 0
	):
		_fail("status coating remained after expiry")
		return
	print("[TACTICAL_STATUS_VISUAL] PASS overlays restored after expiry")
	get_tree().quit()


func _spawn_knight(
	node_name: String,
	position_value: Vector3
) -> BaseTroop:
	var troop := KNIGHT_SCENE.instantiate() as Node3D
	if troop == null:
		return null
	troop.name = node_name
	troop.set_script(KNIGHT_SCRIPT)
	troop.position = position_value
	troop.scale = Vector3.ONE * AttackSystem._scale_for_troop("Knight", 0.1)
	add_child(troop)
	for _frame in 8:
		await get_tree().process_frame
	if not troop is BaseTroop:
		return null
	var combatant := troop as BaseTroop
	combatant.state = BaseTroop.State.IDLE
	combatant.add_to_group("troops")
	combatant.set_physics_process(false)
	return combatant


func _build_stage() -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#69baf0")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d8edff")
	environment.ambient_light_energy = 1.0
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment_node.environment = environment
	add_child(environment_node)

	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48.0, -32.0, 0.0)
	light.light_color = Color("#fff2d2")
	light.light_energy = 1.35
	light.shadow_enabled = false
	add_child(light)

	var ground_plane := MeshInstance3D.new()
	var floor_mesh := PlaneMesh.new()
	floor_mesh.size = Vector2(2.2, 1.4)
	ground_plane.mesh = floor_mesh
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#91c94c")
	ground_plane.material_override = floor_material
	add_child(ground_plane)

	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 1.28
	camera.position = Vector3(1.25, 1.12, 1.65)
	camera.look_at_from_position(camera.position, Vector3(0.0, 0.12, 0.0))
	camera.current = true
	add_child(camera)

	var canvas := CanvasLayer.new()
	add_child(canvas)
	var label := Label.new()
	label.text = "RAGE BOOST                         HEALING"
	label.position = Vector2(330, 575)
	label.add_theme_font_size_override("font_size", 24)
	label.add_theme_color_override("font_color", Color.WHITE)
	label.add_theme_color_override("font_shadow_color", Color(0.0, 0.0, 0.0, 0.9))
	label.add_theme_constant_override("shadow_offset_x", 2)
	label.add_theme_constant_override("shadow_offset_y", 2)
	canvas.add_child(label)


func _fail(message: String) -> void:
	push_error("[TACTICAL_STATUS_VISUAL] %s" % message)
	get_tree().quit(1)
