extends Node2D

# ============================================================
#  WORLD MAP v2 — animated water, organic islands, drag-to-pan
# ============================================================

const MAP_W    : float = 3200.0
const MAP_H    : float = 2400.0
const HALF_VPW : float = 600.0   # approx half viewport width (updated in _ready)
const HALF_VPH : float = 350.0   # approx half viewport height

# Islands: pos is absolute on the large map
const ISLANDS: Array = [
	{"name": "You",           "type": "player",   "size": 200, "pos": Vector2(1600, 1200), "level": 33, "seed": 1.0},
	{"name": "Resource Base", "type": "resource",  "size": 150, "pos": Vector2( 700,  600), "level": 12, "seed": 2.5},
	{"name": "Resource Base", "type": "resource",  "size": 140, "pos": Vector2(2300,  700), "level":  8, "seed": 5.1},
	{"name": "Resource Base", "type": "resource",  "size": 130, "pos": Vector2( 800, 1700), "level": 15, "seed": 8.3},
	{"name": "Resource Base", "type": "resource",  "size": 145, "pos": Vector2(2500, 1600), "level":  9, "seed": 3.7},
	{"name": "Alex's Base",   "type": "enemy",    "size": 165, "pos": Vector2( 350, 1150), "level": 22, "seed": 6.2},
	{"name": "Maria's Base",  "type": "enemy",    "size": 155, "pos": Vector2(2850, 1100), "level": 30, "seed": 9.4},
	{"name": "Tom's Base",    "type": "enemy",    "size": 148, "pos": Vector2(1550,  380), "level": 18, "seed": 4.8},
	{"name": "Sara's Base",   "type": "enemy",    "size": 140, "pos": Vector2(1650, 2000), "level": 25, "seed": 7.1},
	{"name": "",              "type": "deco",     "size":  75, "pos": Vector2(1050,  330), "level":  0, "seed": 1.5},
	{"name": "",              "type": "deco",     "size":  65, "pos": Vector2(2150,  350), "level":  0, "seed": 2.8},
	{"name": "",              "type": "deco",     "size":  80, "pos": Vector2( 430,  500), "level":  0, "seed": 5.5},
	{"name": "",              "type": "deco",     "size":  60, "pos": Vector2(2750,  450), "level":  0, "seed": 3.3},
	{"name": "",              "type": "deco",     "size":  70, "pos": Vector2( 550, 2100), "level":  0, "seed": 8.8},
	{"name": "",              "type": "deco",     "size":  68, "pos": Vector2(2700, 2050), "level":  0, "seed": 6.6},
	{"name": "",              "type": "deco",     "size":  55, "pos": Vector2(1200, 2200), "level":  0, "seed": 4.1},
	{"name": "",              "type": "deco",     "size":  58, "pos": Vector2(2000, 2250), "level":  0, "seed": 7.7},
]

var _camera       : Camera2D
var _dragging     : bool    = false
var _drag_start   : Vector2
var _cam_start    : Vector2
var _water_mat    : ShaderMaterial
var _time         : float   = 0.0
var _fade_overlay : ColorRect
var _half_w       : float
var _half_h       : float


func _ready() -> void:
	var vp := get_viewport_rect().size
	_half_w = vp.x * 0.5
	_half_h = vp.y * 0.5

	_setup_camera()
	_build_water()
	_build_islands()
	_build_ui()
	_fade_in()


func _process(delta: float) -> void:
	_time += delta
	if _water_mat:
		_water_mat.set_shader_parameter("time_val", _time)


func _input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		if event.button_index == MOUSE_BUTTON_LEFT:
			_dragging = event.pressed
			if _dragging:
				_drag_start = event.position
				_cam_start  = _camera.global_position
		# Mouse wheel zoom
		elif event.button_index == MOUSE_BUTTON_WHEEL_UP:
			_camera.zoom = (_camera.zoom + Vector2(0.08, 0.08)).clamp(Vector2(0.5,0.5), Vector2(2.0,2.0))
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_camera.zoom = (_camera.zoom - Vector2(0.08, 0.08)).clamp(Vector2(0.5,0.5), Vector2(2.0,2.0))
	elif event is InputEventMouseMotion and _dragging:
		var delta_pos: Vector2 = event.position - _drag_start
		var new_pos := _cam_start - delta_pos
		_camera.global_position = Vector2(
			clamp(new_pos.x, _half_w, MAP_W - _half_w),
			clamp(new_pos.y, _half_h, MAP_H - _half_h)
		)


# ============================================================
#  CAMERA
# ============================================================
func _setup_camera() -> void:
	_camera = Camera2D.new()
	_camera.global_position = Vector2(MAP_W * 0.5, MAP_H * 0.5)
	_camera.limit_left   = 0
	_camera.limit_right  = int(MAP_W)
	_camera.limit_top    = 0
	_camera.limit_bottom = int(MAP_H)
	add_child(_camera)


# ============================================================
#  ANIMATED WATER
# ============================================================
func _build_water() -> void:
	var water := ColorRect.new()
	water.position = Vector2.ZERO
	water.size     = Vector2(MAP_W, MAP_H)

	_water_mat = ShaderMaterial.new()
	_water_mat.shader = _water_shader()
	water.material = _water_mat
	add_child(water)


func _water_shader() -> Shader:
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform float time_val = 0.0;

void fragment() {
	vec2 uv = UV;

	// Multi-layer wave ripple
	float w1 = sin(uv.x * 12.0 + time_val * 1.1 + uv.y * 3.0) * 0.5 + 0.5;
	float w2 = cos(uv.y * 10.0 + time_val * 0.8 - uv.x * 2.5) * 0.5 + 0.5;
	float w3 = sin((uv.x + uv.y) * 8.0 + time_val * 0.6)       * 0.5 + 0.5;
	float wave = w1 * 0.4 + w2 * 0.35 + w3 * 0.25;

	// Foam sparkle dots
	float foam = pow(w1 * w2, 5.0) * 0.6;

	vec3 deep    = vec3(0.06, 0.24, 0.52);
	vec3 mid     = vec3(0.12, 0.42, 0.72);
	vec3 shallow = vec3(0.22, 0.62, 0.88);
	vec3 white   = vec3(0.85, 0.95, 1.00);

	vec3 col = mix(deep, mid, wave * 0.7);
	col = mix(col, shallow, w3 * 0.3);
	col = mix(col, white, foam);

	// Subtle top-to-bottom darkening
	col = mix(col, col * 0.75, uv.y * 0.35);

	COLOR = vec4(col, 1.0);
}
"""
	return sh


# ============================================================
#  ORGANIC ISLAND SHADER
# ============================================================
func _island_shader() -> Shader:
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
uniform float seed       : hint_range(0.0, 20.0) = 1.0;
uniform vec3  grass_col  : source_color = vec3(0.25, 0.62, 0.22);
uniform float is_player  : hint_range(0.0, 1.0)  = 0.0;

void fragment() {
	vec2 uv = UV - vec2(0.5);

	float a = atan(uv.y, uv.x);
	float s = seed;

	// Organic radius: several sine harmonics give a natural blob
	float r =  0.36
			+ 0.065 * sin(a * 2.0 + s * 1.30)
			+ 0.055 * cos(a * 3.0 + s * 2.70)
			+ 0.040 * sin(a * 4.0 + s * 1.85)
			+ 0.030 * cos(a * 5.0 + s * 3.20)
			+ 0.020 * sin(a * 7.0 + s * 2.10);

	float d = length(uv);

	// Layers
	float island = smoothstep(r + 0.025, r - 0.005, d);   // sand + grass
	float grass  = smoothstep(r - 0.045, r - 0.085, d);   // grass only

	// Beach sand colour
	vec3 sand     = mix(vec3(0.92,0.84,0.60), vec3(0.78,0.68,0.45), d / r);
	// Grass shading: lighter in center, darker at edges
	vec3 g_light  = grass_col * 1.15;
	vec3 g_dark   = grass_col * 0.72;
	vec3 green    = mix(g_dark, g_light, 1.0 - (d / max(r, 0.001)));

	vec3 col = mix(sand, green, grass);

	// Tree blobs  (2-3 per island using seed-derived offsets)
	float sf = fract(s * 0.31830);   // 1/pi
	float sg = fract(s * 0.15915);
	float sh2 = fract(s * 0.47749);

	vec2 t1 = uv - vec2(sf * 0.18 - 0.09, sg  * 0.16 - 0.08);
	vec2 t2 = uv - vec2(-sg * 0.14 + 0.05, sh2 * 0.14 - 0.06);
	vec2 t3 = uv - vec2(sh2 * 0.10 - 0.04, -sf * 0.12 + 0.04);

	float trees = smoothstep(0.10, 0.065, length(t1))
	            + smoothstep(0.09, 0.060, length(t2))
	            + smoothstep(0.07, 0.050, length(t3));
	trees = clamp(trees, 0.0, 1.0);

	vec3 tree_col = grass_col * 0.58;
	col = mix(col, tree_col, trees * grass);

	// Player island: golden shimmer on border
	if (is_player > 0.5) {
		float border = smoothstep(r - 0.005, r + 0.005, d) * smoothstep(r + 0.03, r + 0.01, d);
		col = mix(col, vec3(1.0, 0.88, 0.20), border * 0.7);
	}

	// Top-left highlight (sun)
	float hl = clamp((0.35 - d * 3.0) - uv.x * 2.0 - uv.y * 1.5, 0.0, 1.0) * grass * 0.25;
	col += hl;

	COLOR = vec4(col, island);
}
"""
	return sh


# ============================================================
#  ISLANDS
# ============================================================
var _shared_island_shader: Shader

func _build_islands() -> void:
	_shared_island_shader = _island_shader()
	for data in ISLANDS:
		_spawn_island(data)


func _spawn_island(data: Dictionary) -> void:
	var pos  : Vector2 = data["pos"]
	var size : float   = data["size"]
	var typ  : String  = data["type"]
	var nm   : String  = data["name"]
	var lvl  : int     = data["level"]
	var sd   : float   = data["seed"]
	var is_pl: bool    = typ == "player"

	# ---- Organic island blob (ColorRect + shader) ----
	var blob := ColorRect.new()
	blob.size     = Vector2(size * 2.2, size * 2.2)
	blob.position = pos - blob.size * 0.5

	var mat := ShaderMaterial.new()
	mat.shader = _shared_island_shader

	# Grass colour varies slightly by type
	var gc: Color
	match typ:
		"player":   gc = Color(0.22, 0.68, 0.22)
		"resource": gc = Color(0.28, 0.62, 0.22)
		"enemy":    gc = Color(0.30, 0.58, 0.24)
		_:          gc = Color(0.27, 0.60, 0.22)

	mat.set_shader_parameter("seed",      sd)
	mat.set_shader_parameter("grass_col", gc)
	mat.set_shader_parameter("is_player", 1.0 if is_pl else 0.0)
	blob.material = mat
	add_child(blob)

	# ---- Pulse ring for player island ----
	if is_pl:
		_add_pulse_ring(pos, size)

	# ---- Level badge ----
	if lvl > 0 and typ != "deco":
		var badge := _make_badge(lvl, typ)
		badge.position = pos - Vector2(14, size * 1.05)
		add_child(badge)

	# ---- Name label ----
	if nm != "":
		var nlbl := Label.new()
		nlbl.text = "⭐  You" if is_pl else nm
		nlbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		nlbl.custom_minimum_size  = Vector2(160, 0)
		nlbl.position = pos + Vector2(-80, size * 1.10)
		nlbl.add_theme_font_size_override("font_size", 18 if is_pl else 14)
		var col := Color(1, 1, 0.45) if is_pl else \
		           (Color(0.94, 0.88, 0.50) if typ == "resource" else Color(1.0, 0.62, 0.62))
		nlbl.add_theme_color_override("font_color", col)
		nlbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
		nlbl.add_theme_constant_override("shadow_offset_x", 2)
		nlbl.add_theme_constant_override("shadow_offset_y", 2)
		add_child(nlbl)


func _make_badge(lvl: int, typ: String) -> Label:
	var lbl := Label.new()
	lbl.text = str(lvl)
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.vertical_alignment   = VERTICAL_ALIGNMENT_CENTER
	lbl.custom_minimum_size  = Vector2(30, 30)
	lbl.add_theme_font_size_override("font_size", 12)
	lbl.add_theme_color_override("font_color", Color.WHITE)
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.12, 0.55, 0.85) if typ != "enemy" else Color(0.72, 0.18, 0.18)
	s.set_corner_radius_all(15)
	s.set_border_width_all(2)
	s.border_color = Color(1, 1, 1, 0.75)
	lbl.add_theme_stylebox_override("normal", s)
	return lbl


func _add_pulse_ring(pos: Vector2, size: float) -> void:
	var ring := ColorRect.new()
	ring.size     = Vector2(size * 3.0, size * 3.0)
	ring.position = pos - ring.size * 0.5
	var mat := ShaderMaterial.new()
	mat.shader = _ring_shader()
	ring.material = mat
	add_child(ring)
	var tw := create_tween().set_loops()
	tw.tween_property(ring, "modulate:a", 1.0, 0.90)
	tw.tween_property(ring, "modulate:a", 0.2, 0.90)


func _ring_shader() -> Shader:
	var sh := Shader.new()
	sh.code = """
shader_type canvas_item;
void fragment() {
	vec2 c = UV - vec2(0.5);
	float d = length(c) * 2.0;
	float ring = smoothstep(0.86,0.90,d) * (1.0 - smoothstep(0.96,1.0,d));
	COLOR = vec4(1.0, 1.0, 0.25, ring * COLOR.a);
}
"""
	return sh


# ============================================================
#  UI — only Home button + drag hint
# ============================================================
func _build_ui() -> void:
	var ui := CanvasLayer.new()
	add_child(ui)

	# Drag hint (top centre)
	var hint := Label.new()
	hint.text = "🖱 Drag to explore   •   Scroll to zoom"
	hint.set_anchors_preset(Control.PRESET_CENTER_TOP)
	hint.offset_top  = 12
	hint.offset_left = -200
	hint.offset_right = 200
	hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hint.add_theme_font_size_override("font_size", 14)
	hint.add_theme_color_override("font_color", Color(0.85, 0.92, 1.0, 0.80))
	hint.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	hint.add_theme_constant_override("shadow_offset_x", 1)
	hint.add_theme_constant_override("shadow_offset_y", 1)
	ui.add_child(hint)

	# Home button — bottom right
	var home := _game_btn("🏠  Home", Color(0.95, 0.70, 0.15), Color(0.10, 0.06, 0.02))
	home.custom_minimum_size = Vector2(162, 58)
	home.anchor_left   = 1.0; home.anchor_right  = 1.0
	home.anchor_top    = 1.0; home.anchor_bottom = 1.0
	home.offset_left   = -180; home.offset_right  = -14
	home.offset_top    = -78;  home.offset_bottom = -14
	home.pressed.connect(_go_home)
	ui.add_child(home)

	# Fade overlay
	_fade_overlay = ColorRect.new()
	_fade_overlay.color = Color(0, 0, 0, 1)
	_fade_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fade_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	ui.add_child(_fade_overlay)


func _game_btn(txt: String, bg: Color, fg: Color) -> Button:
	var btn := Button.new()
	btn.text = txt
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(14)
	s.set_content_margin_all(14)
	btn.add_theme_stylebox_override("normal", s)
	var hov := s.duplicate() as StyleBoxFlat
	hov.bg_color = bg.lightened(0.18)
	btn.add_theme_stylebox_override("hover", hov)
	var pr := s.duplicate() as StyleBoxFlat
	pr.bg_color = bg.darkened(0.18)
	btn.add_theme_stylebox_override("pressed", pr)
	btn.add_theme_color_override("font_color", fg)
	btn.add_theme_font_size_override("font_size", 18)
	return btn


# ============================================================
#  TRANSITIONS
# ============================================================
func _fade_in() -> void:
	if _fade_overlay:
		var tw := create_tween()
		tw.tween_property(_fade_overlay, "color:a", 0.0, 0.55)


func _go_home() -> void:
	if _fade_overlay:
		_fade_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	var tw := create_tween()
	tw.tween_property(_fade_overlay, "color:a", 1.0, 0.45)
	await tw.finished
	get_tree().change_scene_to_file("res://island.tscn")
