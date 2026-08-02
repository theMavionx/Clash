class_name FlamethrowerFacingControls
extends CanvasLayer

## Native touch/mouse controls for Flamethrower direction editing.
## This presentation node only emits intent; BuildingSystem owns all editor state.

signal step_requested(delta: int, method: String)
signal reset_requested
signal cancel_requested
signal confirm_requested

const MAX_DOCK_WIDTH := 430.0
const SCREEN_MARGIN := 12.0
const MOBILE_BREAKPOINT := 600.0
const MOBILE_BOTTOM_MARGIN := 12.0
const DESKTOP_BOTTOM_MARGIN := 18.0
const MIN_DOCK_HEIGHT := 180.0
const ACTIVATION_DEDUP_MSEC := 140

var _root: Control
var _panel: PanelContainer
var _title_label: Label
var _direction_label: Label
var _left_button: Button
var _reset_button: Button
var _right_button: Button
var _cancel_button: Button
var _confirm_button: Button
var _last_activation_msec := -ACTIVATION_DEDUP_MSEC
var _last_action := ""
var _reserved_bottom_space := 0.0


func _ready() -> void:
	layer = 95
	_build_controls()
	get_viewport().size_changed.connect(_layout_dock)
	_layout_dock()
	set_editor_state({"active": false})


func set_editor_state(state: Dictionary) -> void:
	if not is_instance_valid(_panel):
		return
	var active := bool(state.get("active", false))
	_panel.visible = active
	if not active:
		return

	var mode := str(state.get("mode", "placement"))
	var edit_mode := mode == "edit"
	var pending := bool(state.get("pending", false))
	var cell_locked := edit_mode or bool(state.get("cell_locked", false))
	var step := posmod(int(state.get("step", 0)), 24)
	var degrees := int(state.get("degrees", step * 15))

	if pending:
		_title_label.text = tr("Saving direction…") if edit_mode else tr("Placing…")
	elif edit_mode:
		_title_label.text = tr("Edit attack direction")
	elif cell_locked:
		_title_label.text = tr("Aim before placing")
	else:
		_title_label.text = tr("Choose a tile")
	_direction_label.text = tr("%d/24 · %d°") % [step + 1, degrees]
	if pending:
		_confirm_button.text = tr("Saving…") if edit_mode else tr("Placing…")
	else:
		_confirm_button.text = tr("Save direction") if edit_mode else tr("Place here")
	_apply_confirm_pending_style(pending)

	_left_button.disabled = pending
	_reset_button.disabled = pending
	_right_button.disabled = pending
	_cancel_button.disabled = pending
	_confirm_button.disabled = pending or not cell_locked


func set_reserved_bottom_space(pixels: float) -> void:
	_reserved_bottom_space = maxf(0.0, pixels)
	_layout_dock()


func _build_controls() -> void:
	_root = Control.new()
	_root.name = "Root"
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_root)

	_panel = PanelContainer.new()
	_panel.name = "Dock"
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.gui_input.connect(_consume_panel_input)
	_panel.add_theme_stylebox_override("panel", _panel_style())
	_root.add_child(_panel)

	var content := VBoxContainer.new()
	content.name = "Content"
	content.mouse_filter = Control.MOUSE_FILTER_STOP
	content.add_theme_constant_override("separation", 8)
	_panel.add_child(content)

	var header := HBoxContainer.new()
	header.name = "Header"
	header.mouse_filter = Control.MOUSE_FILTER_STOP
	header.add_theme_constant_override("separation", 8)
	content.add_child(header)

	_title_label = Label.new()
	_title_label.name = "Title"
	_title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_title_label.add_theme_font_size_override("font_size", 16)
	_title_label.add_theme_color_override("font_color", Color("fff3d3"))
	header.add_child(_title_label)

	_direction_label = Label.new()
	_direction_label.name = "Direction"
	_direction_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_direction_label.add_theme_font_size_override("font_size", 14)
	_direction_label.add_theme_color_override("font_color", Color("ffc16b"))
	header.add_child(_direction_label)

	var aim_row := HBoxContainer.new()
	aim_row.name = "AimButtons"
	aim_row.mouse_filter = Control.MOUSE_FILTER_STOP
	aim_row.add_theme_constant_override("separation", 8)
	content.add_child(aim_row)

	_left_button = _make_button(
		"LeftButton",
		tr("↶ 15°"),
		tr("Rotate Flamethrower left by 15 degrees"),
		Color("ffb340"),
		Vector2(72, 64)
	)
	_left_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_left_button.pressed.connect(_request_step.bind(-1, "step_left"))
	aim_row.add_child(_left_button)

	_reset_button = _make_button(
		"FaceLandingButton",
		tr("Face landing"),
		tr("Point Flamethrower toward the troop landing area"),
		Color("f6d69e"),
		Vector2(112, 56)
	)
	_reset_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_reset_button.pressed.connect(_request_reset)
	aim_row.add_child(_reset_button)

	_right_button = _make_button(
		"RightButton",
		tr("15° ↷"),
		tr("Rotate Flamethrower right by 15 degrees"),
		Color("ffb340"),
		Vector2(72, 64)
	)
	_right_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_right_button.pressed.connect(_request_step.bind(1, "step_right"))
	aim_row.add_child(_right_button)

	var action_row := HBoxContainer.new()
	action_row.name = "ActionButtons"
	action_row.mouse_filter = Control.MOUSE_FILTER_STOP
	action_row.add_theme_constant_override("separation", 8)
	content.add_child(action_row)

	_cancel_button = _make_button(
		"CancelButton",
		tr("Cancel"),
		tr("Cancel direction editing"),
		Color("d7c5a8"),
		Vector2(0, 56)
	)
	_cancel_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_cancel_button.pressed.connect(_request_cancel)
	action_row.add_child(_cancel_button)

	_confirm_button = _make_button(
		"ConfirmButton",
		tr("Place here"),
		tr("Confirm Flamethrower direction"),
		Color("73d758"),
		Vector2(0, 56)
	)
	_confirm_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_confirm_button.size_flags_stretch_ratio = 1.6
	_confirm_button.pressed.connect(_request_confirm)
	action_row.add_child(_confirm_button)


func _make_button(
	button_name: String,
	button_text: String,
	accessible_hint: String,
	color: Color,
	minimum_size: Vector2
) -> Button:
	var button := Button.new()
	button.name = button_name
	button.text = button_text
	button.tooltip_text = accessible_hint
	button.custom_minimum_size = minimum_size
	button.focus_mode = Control.FOCUS_ALL
	button.mouse_filter = Control.MOUSE_FILTER_STOP
	button.add_theme_font_size_override("font_size", 15)
	button.add_theme_color_override("font_color", Color("2a1608"))
	button.add_theme_color_override("font_hover_color", Color("2a1608"))
	button.add_theme_color_override("font_pressed_color", Color("2a1608"))
	button.add_theme_color_override("font_focus_color", Color("2a1608"))
	button.add_theme_color_override("font_disabled_color", Color("d8cfc4"))
	button.add_theme_stylebox_override("normal", _button_style(color))
	button.add_theme_stylebox_override("hover", _button_style(color.lightened(0.08)))
	button.add_theme_stylebox_override("pressed", _button_style(color.darkened(0.12)))
	button.add_theme_stylebox_override("focus", _button_style(color, Color("fff3d3"), 3))
	button.add_theme_stylebox_override("disabled", _button_style(Color("59483b"), Color("40342c")))
	return button


func _apply_confirm_pending_style(pending: bool) -> void:
	if pending:
		_confirm_button.add_theme_color_override("font_disabled_color", Color("2a1608"))
		_confirm_button.add_theme_stylebox_override(
			"disabled",
			_button_style(Color("b58a44"), Color("4b2b16"))
		)
	else:
		_confirm_button.add_theme_color_override("font_disabled_color", Color("d8cfc4"))
		_confirm_button.add_theme_stylebox_override(
			"disabled",
			_button_style(Color("59483b"), Color("40342c"))
		)


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color("3e2723")
	style.border_color = Color("b74b19")
	style.set_border_width_all(3)
	style.set_corner_radius_all(16)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 10
	style.content_margin_bottom = 10
	return style


func _button_style(
	color: Color,
	border_color: Color = Color("4b2b16"),
	border_width: int = 2
) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = border_color
	style.set_border_width_all(border_width)
	style.set_corner_radius_all(10)
	style.content_margin_left = 6
	style.content_margin_right = 6
	return style


func _layout_dock() -> void:
	if not is_instance_valid(_panel):
		return
	var viewport_size := get_viewport().get_visible_rect().size
	var safe_insets := _safe_area_insets(viewport_size)
	var left_inset := maxf(SCREEN_MARGIN, safe_insets.x)
	var right_inset := maxf(SCREEN_MARGIN, safe_insets.z)
	var available_width := maxf(0.0, viewport_size.x - left_inset - right_inset)
	var dock_width := minf(MAX_DOCK_WIDTH, available_width)
	var dock_left := left_inset + (available_width - dock_width) * 0.5
	var bottom_margin := MOBILE_BOTTOM_MARGIN if viewport_size.x < MOBILE_BREAKPOINT else DESKTOP_BOTTOM_MARGIN
	var dock_height := maxf(MIN_DOCK_HEIGHT, _panel.get_combined_minimum_size().y)
	_panel.anchor_left = 0.0
	_panel.anchor_right = 0.0
	_panel.anchor_top = 1.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = dock_left
	_panel.offset_right = dock_left + dock_width
	var reserved_bottom := bottom_margin + safe_insets.w + _reserved_bottom_space
	_panel.offset_top = -(dock_height + reserved_bottom)
	_panel.offset_bottom = -reserved_bottom


func _safe_area_insets(viewport_size: Vector2) -> Vector4:
	var screen_size := DisplayServer.screen_get_size()
	if screen_size.x <= 0 or screen_size.y <= 0:
		return Vector4.ZERO
	var safe_area := DisplayServer.get_display_safe_area()
	var scale_x := viewport_size.x / float(screen_size.x)
	var scale_y := viewport_size.y / float(screen_size.y)
	var safe_left_pixels := maxi(0, safe_area.position.x)
	var safe_top_pixels := maxi(0, safe_area.position.y)
	var safe_right_pixels := maxi(0, screen_size.x - (safe_area.position.x + safe_area.size.x))
	var safe_bottom_pixels := maxi(0, screen_size.y - (safe_area.position.y + safe_area.size.y))
	return Vector4(
		float(safe_left_pixels) * scale_x,
		float(safe_top_pixels) * scale_y,
		float(safe_right_pixels) * scale_x,
		float(safe_bottom_pixels) * scale_y
	)


func _consume_panel_input(_event: InputEvent) -> void:
	get_viewport().set_input_as_handled()


func _request_step(delta: int, method: String) -> void:
	var action := "step_left" if delta < 0 else "step_right"
	if _is_duplicate_activation(action):
		return
	step_requested.emit(delta, method)


func _request_reset() -> void:
	if _is_duplicate_activation("reset"):
		return
	reset_requested.emit()


func _request_cancel() -> void:
	if _is_duplicate_activation("cancel"):
		return
	cancel_requested.emit()


func _request_confirm() -> void:
	if _is_duplicate_activation("confirm"):
		return
	confirm_requested.emit()


func _is_duplicate_activation(action: String) -> bool:
	var now := Time.get_ticks_msec()
	if action == _last_action and now - _last_activation_msec < ACTIVATION_DEDUP_MSEC:
		return true
	_last_action = action
	_last_activation_msec = now
	return false
