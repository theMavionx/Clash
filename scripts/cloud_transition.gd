extends CanvasLayer
## Boom Beach-style cloud fly-through effect.
## Add to a scene — clouds auto-reveal on _ready().
## Call close() to cover the screen with clouds before leaving.

signal reveal_finished
signal close_finished

# ── Config ───────────────────────────────────────────────────────
@export var reveal_duration := 1.2
@export var close_duration := 1.0
@export var auto_reveal := true

const CLOUD_COUNT := 6

const CLOUD_CONFIGS = [
	# Foreground (fast, large, leave first on reveal)
	{"dir": Vector2(-1.2, -0.8), "scale": 1.3, "delay": 0.0, "z": 5, "seed": 7.0},
	{"dir": Vector2(1.2, -0.7),  "scale": 1.25, "delay": 0.05, "z": 5, "seed": 23.0},
	# Midground
	{"dir": Vector2(-1.3, 0.2),  "scale": 1.0, "delay": 0.12, "z": 3, "seed": 41.0},
	{"dir": Vector2(1.3, 0.1),   "scale": 1.05, "delay": 0.15, "z": 3, "seed": 59.0},
	# Background (slow, smaller, leave last on reveal)
	{"dir": Vector2(-0.8, 0.9),  "scale": 0.85, "delay": 0.25, "z": 1, "seed": 73.0},
	{"dir": Vector2(0.9, 0.8),   "scale": 0.8, "delay": 0.28, "z": 1, "seed": 89.0},
]

# ── Internal ─────────────────────────────────────────────────────
var _clouds: Array[Sprite2D] = []
var _white_overlay: ColorRect
var _white_tex: ImageTexture
var _cloud_shader: Shader


func _ready() -> void:
	layer = 100
	_create_base_texture()
	_cloud_shader = load("res://shaders/cloud.gdshader")
	_build_clouds()
	if auto_reveal:
		_set_clouds_covering()
		# Small delay so the scene has time to render first frame
		await get_tree().process_frame
		reveal()


func _create_base_texture() -> void:
	var img := Image.create(256, 256, false, Image.FORMAT_RGBA8)
	img.fill(Color.WHITE)
	_white_tex = ImageTexture.create_from_image(img)


func _build_clouds() -> void:
	# White overlay
	_white_overlay = ColorRect.new()
	_white_overlay.color = Color.WHITE
	_white_overlay.z_index = 10
	_white_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_white_overlay)

	# Cloud sprites
	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr := Sprite2D.new()
		spr.texture = _white_tex
		spr.z_index = cfg["z"]

		var mat := ShaderMaterial.new()
		mat.shader = _cloud_shader
		mat.set_shader_parameter("seed_val", cfg["seed"])
		mat.set_shader_parameter("progress", 1.0)
		mat.set_shader_parameter("softness", 0.4)
		spr.material = mat

		add_child(spr)
		_clouds.append(spr)


func _get_vp_size() -> Vector2:
	return get_viewport().get_visible_rect().size


func _base_scale() -> float:
	return _get_vp_size().x / 256.0 * 0.7


# Place all clouds so they fully cover the screen
func _set_clouds_covering() -> void:
	var vp := _get_vp_size()
	_white_overlay.size = vp
	_white_overlay.modulate.a = 1.0

	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr: Sprite2D = _clouds[i]
		var s: float = _base_scale() * cfg["scale"]
		spr.position = vp * 0.5 + cfg["dir"].normalized() * vp.x * 0.03
		spr.scale = Vector2(s, s)
		spr.visible = true
		(spr.material as ShaderMaterial).set_shader_parameter("progress", 1.0)


# ── Public API ───────────────────────────────────────────────────

## Clouds fly away revealing the scene beneath.
func reveal() -> void:
	var vp := _get_vp_size()
	_white_overlay.size = vp
	var bs := _base_scale()

	var tw := create_tween()
	tw.set_parallel(true)

	# White overlay fades out first
	tw.tween_property(_white_overlay, "modulate:a", 0.0, 0.4) \
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)

	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr: Sprite2D = _clouds[i]
		var mat: ShaderMaterial = spr.material
		var scale_mult: float = cfg["scale"]
		var dir: Vector2 = cfg["dir"]

		# Background clouds leave first, foreground last (reversed parallax)
		var delay: float = 0.28 - cfg["delay"]

		# Fly out in their original direction
		var end_pos := vp * 0.5 + dir * vp * 0.7
		var end_scale := bs * scale_mult * 2.5

		tw.tween_property(spr, "position", end_pos, reveal_duration) \
			.set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

		tw.tween_property(spr, "scale", Vector2(end_scale, end_scale), reveal_duration) \
			.set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

		tw.tween_method(
			func(val: float) -> void: mat.set_shader_parameter("progress", val),
			1.0, 0.0, reveal_duration * 0.7
		).set_delay(delay + reveal_duration * 0.3)

	tw.chain().tween_callback(func() -> void:
		for spr in _clouds:
			spr.visible = false
		reveal_finished.emit()
	)


## Clouds fly in covering the screen. Connect to close_finished to change scene.
func close() -> void:
	var vp := _get_vp_size()
	_white_overlay.size = vp
	_white_overlay.modulate.a = 0.0
	var bs := _base_scale()

	var tw := create_tween()
	tw.set_parallel(true)

	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr: Sprite2D = _clouds[i]
		var mat: ShaderMaterial = spr.material
		var scale_mult: float = cfg["scale"]
		var dir: Vector2 = cfg["dir"]
		var delay: float = cfg["delay"]

		# Start off-screen
		var start_pos := vp * 0.5 + dir * vp * 0.6
		var start_scale := bs * scale_mult * 2.5
		var end_pos := vp * 0.5 + dir.normalized() * vp.x * 0.03
		var end_scale := bs * scale_mult

		spr.visible = true
		spr.position = start_pos
		spr.scale = Vector2(start_scale, start_scale)
		mat.set_shader_parameter("progress", 0.0)

		tw.tween_property(spr, "position", end_pos, close_duration) \
			.set_delay(delay).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)

		tw.tween_property(spr, "scale", Vector2(end_scale, end_scale), close_duration) \
			.set_delay(delay).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)

		tw.tween_method(
			func(val: float) -> void: mat.set_shader_parameter("progress", val),
			0.0, 1.0, close_duration * 0.7
		).set_delay(delay)

	# White overlay at the end
	tw.tween_property(_white_overlay, "modulate:a", 1.0, 0.3) \
		.set_delay(close_duration - 0.3) \
		.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)

	tw.chain().tween_callback(func() -> void:
		close_finished.emit()
	)
