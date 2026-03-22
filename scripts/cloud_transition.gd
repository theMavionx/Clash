extends CanvasLayer
## Boom Beach-style cloud fly-through effect.
## Uses pre-generated NoiseTexture2D for each cloud — organic shapes,
## minimal per-frame shader cost (1 texture sample + radial fade).

signal reveal_finished
signal close_finished

# ── Config ───────────────────────────────────────────────────────
@export var reveal_duration := 1.2
@export var close_duration := 1.0
@export var auto_reveal := true

const CLOUD_COUNT := 6

const CLOUD_CONFIGS = [
	{"dir": Vector2(-1.0, -0.6), "scale": 1.4, "delay": 0.0, "z": 5, "seed": 7},
	{"dir": Vector2(1.0, -0.6),  "scale": 1.4, "delay": 0.0, "z": 5, "seed": 23},
	{"dir": Vector2(-1.0, 0.0),  "scale": 1.15, "delay": 0.08, "z": 3, "seed": 41},
	{"dir": Vector2(1.0, 0.0),   "scale": 1.15, "delay": 0.08, "z": 3, "seed": 59},
	{"dir": Vector2(-1.0, 0.6),  "scale": 1.4, "delay": 0.15, "z": 1, "seed": 73},
	{"dir": Vector2(1.0, 0.6),   "scale": 1.4, "delay": 0.15, "z": 1, "seed": 89},
]

# ── Internal ─────────────────────────────────────────────────────
var _clouds: Array[Sprite2D] = []
var _white_overlay: ColorRect
var _cloud_shader: Shader


func _ready() -> void:
	layer = 100
	_cloud_shader = load("res://shaders/cloud.gdshader")
	_build_clouds()
	if auto_reveal:
		_set_clouds_covering()
		await get_tree().process_frame
		reveal()


func _create_cloud_noise(seed_val: int) -> NoiseTexture2D:
	var tex := NoiseTexture2D.new()
	tex.width = 512
	tex.height = 512
	tex.generate_mipmaps = false
	tex.seamless = false

	var n := FastNoiseLite.new()
	n.seed = seed_val
	n.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	n.frequency = 0.005
	n.fractal_type = FastNoiseLite.FRACTAL_FBM
	n.fractal_octaves = 5
	n.fractal_lacunarity = 2.0
	n.fractal_gain = 0.5

	tex.noise = n
	return tex


func _build_clouds() -> void:
	# White overlay
	_white_overlay = ColorRect.new()
	_white_overlay.color = Color.WHITE
	_white_overlay.z_index = 10
	_white_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_white_overlay)

	# Cloud sprites — each with unique noise texture
	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr := Sprite2D.new()
		spr.texture = _create_cloud_noise(cfg["seed"])
		spr.z_index = cfg["z"]

		var mat := ShaderMaterial.new()
		mat.shader = _cloud_shader
		mat.set_shader_parameter("progress", 1.0)
		mat.set_shader_parameter("softness", 0.35)
		spr.material = mat

		add_child(spr)
		_clouds.append(spr)


func _get_vp_size() -> Vector2:
	return get_viewport().get_visible_rect().size


func _base_scale() -> float:
	var vp := _get_vp_size()
	return maxf(vp.x, vp.y) / 512.0 * 1.8


# Place all clouds so they fully cover the screen
func _set_clouds_covering() -> void:
	var vp := _get_vp_size()
	_white_overlay.size = vp
	_white_overlay.modulate.a = 1.0
	var center := vp * 0.5

	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr: Sprite2D = _clouds[i]
		var s: float = _base_scale() * cfg["scale"]
		spr.position = center
		spr.scale = Vector2(s, s)
		spr.visible = true
		(spr.material as ShaderMaterial).set_shader_parameter("progress", 1.0)


# ── Public API ───────────────────────────────────────────────────

## Clouds fly away revealing the scene beneath.
func reveal() -> void:
	var vp := _get_vp_size()
	var center := vp * 0.5
	_white_overlay.size = vp
	var bs := _base_scale()

	# Ensure clouds start covering
	_set_clouds_covering()

	var tw := create_tween()
	tw.set_parallel(true)

	# White overlay fades out first
	tw.tween_property(_white_overlay, "modulate:a", 0.0, 0.35) \
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)

	for i in range(CLOUD_COUNT):
		var cfg: Dictionary = CLOUD_CONFIGS[i]
		var spr: Sprite2D = _clouds[i]
		var mat: ShaderMaterial = spr.material
		var scale_mult: float = cfg["scale"]
		var dir: Vector2 = cfg["dir"].normalized()
		var delay: float = cfg["delay"]

		var end_pos := center + dir * vp.length() * 0.6
		var end_scale := bs * scale_mult * 2.0

		tw.tween_property(spr, "position", end_pos, reveal_duration) \
			.set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

		tw.tween_property(spr, "scale", Vector2(end_scale, end_scale), reveal_duration) \
			.set_delay(delay).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

		tw.tween_method(
			func(val: float) -> void: mat.set_shader_parameter("progress", val),
			1.0, 0.0, reveal_duration * 0.6
		).set_delay(delay + reveal_duration * 0.35)

	tw.chain().tween_callback(func() -> void:
		for spr2 in _clouds:
			spr2.visible = false
		reveal_finished.emit()
	)


## Clouds fly in covering the screen.
func close() -> void:
	var vp := _get_vp_size()
	var center := vp * 0.5
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
		var dir: Vector2 = cfg["dir"].normalized()
		var delay: float = cfg["delay"]

		var start_pos := center + dir * vp.length() * 0.6
		var start_scale := bs * scale_mult * 2.0
		var end_pos := center
		var end_scale := bs * scale_mult

		spr.visible = true
		spr.position = start_pos
		spr.scale = Vector2(start_scale, start_scale)
		mat.set_shader_parameter("progress", 0.0)

		tw.tween_property(spr, "position", end_pos, close_duration) \
			.set_delay(delay).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_QUAD)

		tw.tween_property(spr, "scale", Vector2(end_scale, end_scale), close_duration) \
			.set_delay(delay).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_QUAD)

		tw.tween_method(
			func(val: float) -> void: mat.set_shader_parameter("progress", val),
			0.0, 1.0, close_duration * 0.7
		).set_delay(delay)

	tw.tween_property(_white_overlay, "modulate:a", 1.0, 0.25) \
		.set_delay(close_duration - 0.25) \
		.set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)

	tw.chain().tween_callback(func() -> void:
		close_finished.emit()
	)
