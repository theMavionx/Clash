extends Node3D


const PEA_SHOOTER_SCENE: PackedScene = preload(
	"res://Model/Characters/PeaShooter/PeaShooter.fbx"
)
const PEA_SHOOTER_SCRIPT: Script = preload("res://scripts/pea_shooter.gd")
const FRAME_SIZE := Vector2i(320, 320)
const SOURCE_FRAME_SIZE := Vector2i(640, 360)
const FRAMES_PER_ANIMATION := 8
const OUTPUT_PATH := "res://.tmp/pea_shooter_all_animations.png"
const ANIMATIONS: Array[Dictionary] = [
	{"name": "Idle_A", "label": "IDLE"},
	{"name": "Running_A", "label": "RUN"},
	{"name": "Pea_Combo", "label": "ATTACK"},
	{"name": "GetHit", "label": "HIT"},
	{"name": "Death_A", "label": "DEATH"},
]

var _phase_label: Label


func _ready() -> void:
	call_deferred("_capture")


func _capture() -> void:
	_add_stage()
	var actor := PEA_SHOOTER_SCENE.instantiate() as Node3D
	if actor == null:
		_fail("model could not be instantiated")
		return
	actor.name = "PeaShooterAnimationProbeActor"
	actor.set_script(PEA_SHOOTER_SCRIPT)
	actor.set("_spawn_scale", 0.72)
	actor.scale = Vector3.ONE * 0.72
	add_child(actor)
	for _frame in 12:
		await get_tree().process_frame
	actor.set_physics_process(false)

	var player := actor.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	if player == null:
		_fail("TroopAnimPlayer is unavailable")
		return
	player.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	player.speed_scale = 0.0

	var images: Array[Image] = []
	var animation_lengths: Dictionary = {}
	for animation_spec in ANIMATIONS:
		var animation_name := str(animation_spec.name)
		var animation_label := str(animation_spec.label)
		if not player.has_animation(animation_name):
			_fail("missing game animation alias %s" % animation_name)
			return
		var animation := player.get_animation(animation_name)
		if animation == null or animation.length <= 0.0:
			_fail("invalid game animation %s" % animation_name)
			return
		animation_lengths[animation_name] = snappedf(animation.length, 0.0001)
		player.stop()
		player.play(animation_name)
		for frame_index in FRAMES_PER_ANIMATION:
			var phase := float(frame_index) / float(FRAMES_PER_ANIMATION - 1)
			player.seek(animation.length * phase, true)
			_phase_label.text = "%s  %d%%" % [animation_label, roundi(phase * 100.0)]
			for _settle in 2:
				await get_tree().process_frame
			await RenderingServer.frame_post_draw
			var frame := get_viewport().get_texture().get_image()
			frame.convert(Image.FORMAT_RGBA8)
			frame.resize(
				FRAME_SIZE.x,
				FRAME_SIZE.y,
				Image.INTERPOLATE_LANCZOS
			)
			images.append(frame)

	var sheet := Image.create_empty(
		FRAME_SIZE.x * FRAMES_PER_ANIMATION,
		FRAME_SIZE.y * ANIMATIONS.size(),
		false,
		Image.FORMAT_RGBA8
	)
	sheet.fill(Color("#101820"))
	for animation_index in ANIMATIONS.size():
		for frame_index in FRAMES_PER_ANIMATION:
			var image_index := (
				animation_index * FRAMES_PER_ANIMATION + frame_index
			)
			sheet.blit_rect(
				images[image_index],
				Rect2i(Vector2i.ZERO, FRAME_SIZE),
				Vector2i(
					frame_index * FRAME_SIZE.x,
					animation_index * FRAME_SIZE.y
				)
			)

	var output_path := ProjectSettings.globalize_path(OUTPUT_PATH)
	DirAccess.make_dir_recursive_absolute(output_path.get_base_dir())
	var save_error := sheet.save_png(output_path)
	if save_error != OK:
		_fail("save failed: %s" % error_string(save_error))
		return
	print(
		"[PEA_SHOOTER_ANIMATIONS] PASS aliases=%s frames=%d output=%s"
		% [str(animation_lengths), images.size(), output_path]
	)
	get_tree().quit()


func _add_stage() -> void:
	var environment_node := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#36aee6")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#d8f3dc")
	environment.ambient_light_energy = 0.48
	environment_node.environment = environment
	add_child(environment_node)

	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-38.0, -32.0, 0.0)
	key_light.light_color = Color("#fff2cf")
	key_light.light_energy = 1.05
	add_child(key_light)

	var ground_plane := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(4.0, 4.0)
	ground_plane.mesh = plane
	var floor_material := StandardMaterial3D.new()
	floor_material.albedo_color = Color("#d9f2a5")
	ground_plane.material_override = floor_material
	add_child(ground_plane)

	var camera := Camera3D.new()
	camera.fov = 28.0
	camera.current = true
	camera.position = Vector3(0.0, 0.52, 2.55)
	add_child(camera)
	camera.look_at(Vector3(0.0, 0.48, 0.0), Vector3.UP)

	var canvas := CanvasLayer.new()
	add_child(canvas)
	_phase_label = Label.new()
	_phase_label.position = Vector2(18.0, 14.0)
	_phase_label.add_theme_font_size_override("font_size", 25)
	_phase_label.add_theme_color_override("font_color", Color.WHITE)
	_phase_label.add_theme_color_override(
		"font_shadow_color",
		Color(0.0, 0.0, 0.0, 0.85)
	)
	_phase_label.add_theme_constant_override("shadow_offset_x", 2)
	_phase_label.add_theme_constant_override("shadow_offset_y", 2)
	canvas.add_child(_phase_label)


func _fail(message: String) -> void:
	push_error("[PEA_SHOOTER_ANIMATIONS] FAIL %s" % message)
	get_tree().quit(1)
