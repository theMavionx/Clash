extends CanvasLayer
## World-map HUD — Boom Beach style.
## Attach to the UI CanvasLayer; builds every widget in _ready().

# ── node refs (filled in _ready) ──
var _name_lbl: Label
var _level_lbl: Label
var _trophy_lbl: Label
var _res_labels := {}          # "gold" → Label, etc.

# ══════════════════════════════════════
#  LIFECYCLE
# ══════════════════════════════════════

func _ready() -> void:
	_build_hud()
	# demo / placeholder data
	set_player("Player", 33)
	set_resources(55242, 37630)
	set_trophies(232)

# ══════════════════════════════════════
#  PUBLIC API
# ══════════════════════════════════════

func set_player(pname: String, level: int) -> void:
	if _name_lbl:
		_name_lbl.text = pname
	if _level_lbl:
		_level_lbl.text = str(level)

func set_resources(gold: int, wood: int) -> void:
	_set_res("gold", gold)
	_set_res("wood", wood)

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
	panel.add_theme_stylebox_override("panel", _make_style(Color(0, 0, 0, 0.5), 16))
	parent.add_child(panel)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 10)
	panel.add_child(hbox)

	# ── Avatar circle ──
	var avatar := Panel.new()
	avatar.custom_minimum_size = Vector2(56, 56)
	var asb := StyleBoxFlat.new()
	asb.bg_color = Color(0.12, 0.22, 0.42, 0.95)
	asb.border_color = Color(0.85, 0.68, 0.15, 1.0)
	asb.set_border_width_all(3)
	asb.set_corner_radius_all(28)
	avatar.add_theme_stylebox_override("panel", asb)
	hbox.add_child(avatar)

	_level_lbl = Label.new()
	_level_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_level_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_level_lbl.set_anchors_preset(Control.PRESET_FULL_RECT)
	_level_lbl.add_theme_font_size_override("font_size", 24)
	_level_lbl.add_theme_color_override("font_color", Color.WHITE)
	_level_lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	_level_lbl.add_theme_constant_override("shadow_offset_x", 1)
	_level_lbl.add_theme_constant_override("shadow_offset_y", 1)
	avatar.add_child(_level_lbl)

	# ── Name + trophies column ──
	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 2)
	hbox.add_child(vbox)

	_name_lbl = _make_label("Player", 20, Color.WHITE)
	vbox.add_child(_name_lbl)

	var trophy_row := HBoxContainer.new()
	trophy_row.add_theme_constant_override("separation", 4)
	vbox.add_child(trophy_row)

	trophy_row.add_child(_make_label("!", 17, Color(1.0, 0.25, 0.25)))

	_trophy_lbl = _make_label("0", 17, Color(1.0, 0.85, 0.3))
	trophy_row.add_child(_trophy_lbl)

# ── Resources Panel ──────────────────

func _build_resources_panel(parent: Control) -> void:
	var panel := PanelContainer.new()
	panel.add_theme_stylebox_override("panel", _make_style(Color(0, 0, 0, 0.5), 14))
	parent.add_child(panel)

	var hbox := HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 6)
	panel.add_child(hbox)

	_add_res(hbox, "gold",  Color(1.0, 0.85, 0.1))
	_add_res(hbox, "wood",  Color(0.55, 0.36, 0.16))

func _add_res(parent: Control, key: String, icon_col: Color) -> void:
	var item := PanelContainer.new()
	var sb := _make_style(Color(0, 0, 0, 0.25), 8)
	sb.content_margin_left = 7
	sb.content_margin_right = 9
	sb.content_margin_top = 4
	sb.content_margin_bottom = 4
	item.add_theme_stylebox_override("panel", sb)
	parent.add_child(item)

	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 5)
	item.add_child(h)

	# colored dot as icon placeholder
	h.add_child(_make_label("\u25CF", 18, icon_col))  # ●

	var val := _make_label("0", 17, Color.WHITE)
	val.custom_minimum_size.x = 50
	h.add_child(val)

	_res_labels[key] = val

# ── Menu Button (left side) ──────────

func _build_menu_btn(parent: Control) -> void:
	var btn := Button.new()
	btn.name = "MenuBtn"
	btn.text = "\u2261"   # ≡
	btn.position = Vector2(14, 82)
	btn.custom_minimum_size = Vector2(48, 48)
	btn.add_theme_font_size_override("font_size", 30)
	btn.add_theme_color_override("font_color", Color.WHITE)
	btn.add_theme_stylebox_override("normal",  _make_style(Color(0, 0, 0, 0.5), 12))
	btn.add_theme_stylebox_override("hover",   _make_style(Color(0.15, 0.15, 0.15, 0.6), 12))
	btn.add_theme_stylebox_override("pressed", _make_style(Color(0.1, 0.1, 0.1, 0.7), 12))
	btn.add_theme_stylebox_override("focus",   StyleBoxEmpty.new())
	parent.add_child(btn)

# ── Home Button (bottom-right) ───────

func _build_home_btn(parent: Control) -> void:
	var btn := Button.new()
	btn.name = "HomeBtn"
	btn.text = "Home"
	btn.custom_minimum_size = Vector2(100, 44)
	btn.add_theme_font_size_override("font_size", 18)
	btn.add_theme_color_override("font_color", Color.WHITE)
	btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn.offset_left = -114
	btn.offset_top = -54
	btn.offset_right = -14
	btn.offset_bottom = -10
	btn.add_theme_stylebox_override("normal",  _make_style(Color(0, 0, 0, 0.5), 12))
	btn.add_theme_stylebox_override("hover",   _make_style(Color(0.15, 0.15, 0.15, 0.6), 12))
	btn.add_theme_stylebox_override("pressed", _make_style(Color(0.1, 0.1, 0.1, 0.7), 12))
	btn.add_theme_stylebox_override("focus",   StyleBoxEmpty.new())
	parent.add_child(btn)

# ══════════════════════════════════════
#  HELPERS
# ══════════════════════════════════════

func _make_style(color: Color, radius: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.content_margin_left = 10
	sb.content_margin_right = 10
	sb.content_margin_top = 6
	sb.content_margin_bottom = 6
	return sb

func _make_label(text: String, size: int, color: Color) -> Label:
	var lbl := Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", size)
	lbl.add_theme_color_override("font_color", color)
	lbl.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	lbl.add_theme_constant_override("shadow_offset_x", 1)
	lbl.add_theme_constant_override("shadow_offset_y", 1)
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
