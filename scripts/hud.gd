extends CanvasLayer
## World-map HUD — Boom Beach / Clash style.
## Attach to the UI CanvasLayer; builds every widget in _ready().

signal home_pressed

# ── node refs (filled in _ready) ──
var _name_lbl: Label
var _level_lbl: Label
var _trophy_lbl: Label
var _res_labels := {}          # "gold" → Label, etc.

# ── color palette ──
const C_PANEL_BG     := Color(0.06, 0.06, 0.06, 0.80)
const C_PANEL_BORDER := Color(0.2, 0.2, 0.2, 0.6)
const C_GOLD_ACCENT  := Color(0.83, 0.63, 0.09, 1.0)
const C_GOLD_LIGHT   := Color(1.0, 0.85, 0.3, 1.0)
const C_TEXT_WARM     := Color(1.0, 0.97, 0.91, 1.0)
const C_GREEN_BTN    := Color(0.16, 0.42, 0.10, 0.92)
const C_GREEN_BORDER := Color(0.10, 0.29, 0.04, 1.0)
const C_GREEN_HI     := Color(0.29, 0.60, 0.22, 0.7)

# ══════════════════════════════════════
#  LIFECYCLE
# ══════════════════════════════════════

func _ready() -> void:
	_build_hud()
	# demo / placeholder data
	set_player("Player", 33)
	set_resources(55242, 37630, 15000)
	set_trophies(232)

# ══════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════

func set_player(pname: String, level: int) -> void:
	if _name_lbl:
		_name_lbl.text = pname
	if _level_lbl:
		_level_lbl.text = str(level)

func set_resources(gold: int, wood: int, metal: int = 0) -> void:
	_set_res("gold", gold)
	_set_res("wood", wood)
	_set_res("metal", metal)

func set_trophies(count: int) -> void:
	if _trophy_lbl:
		_trophy_lbl.text = str(count)

# ══════════════════════════════════════
#  BUILD
# ══════════════════════════════════════

func _build_hud() -> void:
	var root := Control.new()
	root.name = "HUDRoot"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_build_top_bar(root)
	_build_menu_btn(root)
	_build_home_btn(root)

# ── Top Bar ──────────────────────────

func _build_top_bar(parent: Control) -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_TOP_WIDE)
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_top", 10)
	margin.add_theme_constant_override("margin_right", 14)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(margin)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 12)
	hbox.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(hbox)

	# Left — player info
	_build_player_panel(hbox)

	# Spacer
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hbox.add_child(spacer)

	# Right — resources
	_build_resources_panel(hbox)

# ── Player Panel ─────────────────────

func _build_player_panel(parent: Control) -> void:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _game_style(
		C_PANEL_BG, C_PANEL_BORDER, 20, 2))
	parent.add_child(panel)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 10)
	panel.add_child(hbox)

	# ── Avatar circle (gold ring) ──
	var avatar := Panel.new()
	avatar.custom_minimum_size = Vector2(64, 64)
	var asb := StyleBoxFlat.new()
	asb.bg_color = Color(0.10, 0.22, 0.42, 0.95)
	asb.border_color = C_GOLD_ACCENT
	asb.set_border_width_all(4)
	asb.set_corner_radius_all(32)
	asb.content_margin_left = 0
	asb.content_margin_right = 0
	asb.content_margin_top = 0
	asb.content_margin_bottom = 0
	avatar.add_theme_stylebox_override("panel", asb)
	hbox.add_child(avatar)

	_level_lbl = Label.new()
	_level_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_level_lbl.set_anchors_preset(Control.PRESET_FULL_RECT)
	_level_lbl.add_theme_font_size_override("font_size", 28)
	_level_lbl.add_theme_color_override("font_color", Color.WHITE)
	_level_lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	_level_lbl.add_theme_constant_override("shadow_offset_x", 2)
	_level_lbl.add_theme_constant_override("shadow_offset_y", 2)
	avatar.add_child(_level_lbl)

	# ── Name + trophies column ──
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 3)
	hbox.add_child(vbox)

	_name_lbl = _make_label("Player", 22, C_TEXT_WARM)
	vbox.add_child(_name_lbl)

	var trophy_row := HBoxContainer.new()
	trophy_row.add_theme_constant_override("separation", 5)
	vbox.add_child(trophy_row)

	# Star icon for trophies
	trophy_row.add_child(_make_label("\u2605", 19, C_GOLD_LIGHT))

	_trophy_lbl = _make_label("0", 18, C_GOLD_LIGHT)
	trophy_row.add_child(_trophy_lbl)

# ── Resources Panel ──────────────────

func _build_resources_panel(parent: Control) -> void:
	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 12)
	parent.add_child(hbox)

	# Minimalist pill-shaped resource counters
	_add_res(hbox, "gold",
		Color(0.06, 0.06, 0.06, 0.75),   # Dark, slightly transparent bg
		Color(1.0, 0.85, 0.1, 0.8),      # Subtle gold border
		Color(1.0, 0.82, 0.1, 1.0),      # Bright gold icon
		Color(1.0, 0.9, 0.3, 0.2),       # Gold highlight glow
		"\u25CF" )                       # Circle icon
	_add_res(hbox, "wood",
		Color(0.06, 0.06, 0.06, 0.75),
		Color(0.65, 0.40, 0.15, 0.8),
		Color(0.72, 0.45, 0.14, 1.0),
		Color(0.8, 0.5, 0.2, 0.2),
		"\u25A0" )                       # Square/log icon
	_add_res(hbox, "metal",
		Color(0.06, 0.06, 0.06, 0.75),
		Color(0.6, 0.65, 0.7, 0.8),      # Steel/silver border
		Color(0.7, 0.75, 0.85, 1.0),     # Silver icon
		Color(0.8, 0.85, 1.0, 0.2),
		"\u2B22" )                       # Hexagon icon for Metal

func _add_res(parent: Control, key: String, bg: Color, border: Color,
		icon_col: Color, highlight: Color, icon_char: String) -> void:
	var item := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(1)       # Thinner, minimal border
	sb.set_corner_radius_all(16)     # Pill shape (more rounded)
	sb.content_margin_left = 12
	sb.content_margin_right = 16
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	# Optional subtle shadow
	sb.shadow_color = Color(0, 0, 0, 0.3)
	sb.shadow_size = 2
	sb.shadow_offset = Vector2(0, 2)
	item.add_theme_stylebox_override("panel", sb)
	parent.add_child(item)

	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 8)
	item.add_child(h)

	var icon_lbl := _make_label(icon_char, 20, icon_col)
	icon_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	# A bit of glow for the icon
	icon_lbl.add_theme_color_override("font_shadow_color", highlight)
	icon_lbl.add_theme_constant_override("shadow_offset_x", 0)
	icon_lbl.add_theme_constant_override("shadow_offset_y", 0)
	icon_lbl.add_theme_constant_override("shadow_outline_size", 4)
	h.add_child(icon_lbl)

	var val := _make_label("0", 18, Color(1.0, 1.0, 1.0, 0.95)) # Clean white text
	val.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	val.custom_minimum_size.x = 60
	h.add_child(val)

	_res_labels[key] = val

# ── Menu Button (left side) ──────────

func _build_menu_btn(parent: Control) -> void:
	var btn := Button.new()
	btn.name = "MenuBtn"
	btn.text = "\u2261"
	btn.position = Vector2(14, 90)
	btn.custom_minimum_size = Vector2(52, 52)
	btn.add_theme_font_size_override("font_size", 32)
	btn.add_theme_color_override("font_color", C_TEXT_WARM)
	btn.add_theme_stylebox_override("normal",
		_game_style(Color(0.08, 0.12, 0.06, 0.85), Color(0.54, 0.48, 0.23, 0.8), 14, 2))
	btn.add_theme_stylebox_override("hover",
		_game_style(Color(0.12, 0.16, 0.08, 0.90), Color(0.64, 0.55, 0.28, 0.9), 14, 2))
	btn.add_theme_stylebox_override("pressed",
		_game_style(Color(0.05, 0.08, 0.03, 0.92), Color(0.44, 0.38, 0.18, 0.9), 14, 2))
	btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	parent.add_child(btn)

# ── Home Button (bottom-right) ───────

func _build_home_btn(parent: Control) -> void:
	var btn := Button.new()
	btn.name = "HomeBtn"
	btn.text = "Home"
	btn.custom_minimum_size = Vector2(112, 48)
	btn.add_theme_font_size_override("font_size", 19)
	btn.add_theme_color_override("font_color", Color.WHITE)
	btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn.offset_left = -126
	btn.offset_top = -58
	btn.offset_right = -14
	btn.offset_bottom = -10
	btn.add_theme_stylebox_override("normal",
		_game_style(C_GREEN_BTN, C_GREEN_BORDER, 22, 2))
	btn.add_theme_stylebox_override("hover",
		_game_style(Color(0.20, 0.50, 0.14, 0.95), Color(0.12, 0.34, 0.06, 1.0), 22, 2))
	btn.add_theme_stylebox_override("pressed",
		_game_style(Color(0.10, 0.32, 0.06, 0.95), Color(0.08, 0.22, 0.03, 1.0), 22, 2))
	btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	btn.pressed.connect(func():
		home_pressed.emit()
		get_tree().change_scene_to_file("res://scenes/Main.tscn")
	)
	parent.add_child(btn)

# ══════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════

func _game_style(bg: Color, border_col: Color, radius: int,
		border_w: int = 2) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border_col
	sb.set_border_width_all(border_w)
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb

func _make_label(text: String, size: int, color: Color) -> Label:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", size)
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	lbl.add_theme_constant_override("shadow_offset_x", 2)
	lbl.add_theme_constant_override("shadow_offset_y", 2)
	return lbl

func _set_res(key: String, value: int) -> void:
	if _res_labels.has(key):
		_res_labels[key].text = _fmt(value)

func _fmt(n: int) -> String:
	var s := str(n)
	var result := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		if count > 0 and count % 3 == 0:
			result = " " + result
		result = s[i] + result
		count += 1
	return result
