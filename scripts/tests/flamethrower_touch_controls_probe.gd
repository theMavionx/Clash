extends SceneTree

const FlamethrowerFacingControlsScript = preload("res://scripts/flamethrower_facing_controls.gd")

var _failures: Array[String] = []
var _steps: Array[Dictionary] = []
var _reset_count := 0
var _cancel_count := 0
var _confirm_count := 0


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	root.size = Vector2i(320, 640)
	var controls: CanvasLayer = FlamethrowerFacingControlsScript.new()
	root.add_child(controls)
	await process_frame

	controls.step_requested.connect(_on_step)
	controls.reset_requested.connect(func() -> void: _reset_count += 1)
	controls.cancel_requested.connect(func() -> void: _cancel_count += 1)
	controls.confirm_requested.connect(func() -> void: _confirm_count += 1)

	var dock := controls.get_node("Root/Dock") as PanelContainer
	var left := controls.get_node("Root/Dock/Content/AimButtons/LeftButton") as Button
	var face_landing := controls.get_node("Root/Dock/Content/AimButtons/FaceLandingButton") as Button
	var right := controls.get_node("Root/Dock/Content/AimButtons/RightButton") as Button
	var cancel := controls.get_node("Root/Dock/Content/ActionButtons/CancelButton") as Button
	var confirm := controls.get_node("Root/Dock/Content/ActionButtons/ConfirmButton") as Button
	var title := controls.get_node("Root/Dock/Content/Header/Title") as Label
	var direction := controls.get_node("Root/Dock/Content/Header/Direction") as Label

	_check(dock.mouse_filter == Control.MOUSE_FILTER_STOP, "dock consumes world pointer input")
	_check(dock.size.x <= 296.0 and dock.position.x >= 12.0, "dock fits a 320px viewport without horizontal overflow")
	_check(left.custom_minimum_size == Vector2(72, 64), "left tap target is at least 72x64")
	_check(face_landing.custom_minimum_size.x >= 112 and face_landing.custom_minimum_size.y >= 56, "Face landing tap target is at least 112x56")
	_check(right.custom_minimum_size == Vector2(72, 64), "right tap target is at least 72x64")
	_check(cancel.custom_minimum_size.y >= 56 and confirm.custom_minimum_size.y >= 56, "action tap targets are at least 56px high")
	controls.set_reserved_bottom_space(106.0)
	await process_frame
	_check(
		dock.get_global_rect().end.y <= float(root.size.y) - 106.0 - 11.0,
		"dock stays above an external bottom HUD reserve"
	)
	controls.set_reserved_bottom_space(0.0)
	await process_frame

	controls.set_editor_state({
		"active": true,
		"mode": "placement",
		"step": 3,
		"degrees": 45,
		"cell_locked": false,
		"pending": false,
	})
	_check(dock.visible, "dock is visible while editor is active")
	_check(confirm.disabled, "placement confirm stays disabled before tile lock")
	_check(not left.disabled and not right.disabled and not face_landing.disabled, "rotation remains available before tile lock")
	_check(title.text == "Choose a tile", "unlocked placement title is clear")
	_check(direction.text == "4/24 · 45°", "compact direction readout reflects the preview step")

	left.pressed.emit()
	left.pressed.emit()
	await process_frame
	right.pressed.emit()
	face_landing.pressed.emit()
	face_landing.pressed.emit()
	cancel.pressed.emit()
	cancel.pressed.emit()
	_check(_steps.size() == 2, "each button press emits exactly one 15-degree step")
	if _steps.size() == 2:
		_check(_steps[0] == {"delta": -1, "method": "step_left"}, "left button emits the server-valid left command")
		_check(_steps[1] == {"delta": 1, "method": "step_right"}, "right button emits the server-valid right command")
	_check(_reset_count == 1, "Face landing deduplicates a synthesized second activation")
	_check(_cancel_count == 1, "Cancel deduplicates a synthesized second activation")

	controls.set_editor_state({
		"active": true,
		"mode": "placement",
		"step": 3,
		"degrees": 45,
		"cell_locked": true,
		"pending": false,
	})
	_check(not confirm.disabled, "placement confirm enables after tile lock")
	await _capture_visual_frames(controls)
	confirm.pressed.emit()
	confirm.pressed.emit()
	_check(_confirm_count == 1, "Place here deduplicates a synthesized second activation")

	controls.set_editor_state({
		"active": true,
		"mode": "edit",
		"step": 3,
		"degrees": 45,
		"pending": false,
	})
	_check(confirm.text == "Save direction", "edit mode uses Save direction")
	controls.set_editor_state({
		"active": true,
		"mode": "edit",
		"step": 3,
		"degrees": 45,
		"pending": true,
	})
	_check(
		left.disabled and right.disabled and face_landing.disabled and cancel.disabled and confirm.disabled,
		"pending state disables every action"
	)
	_check(title.text == "Saving direction…", "edit pending state names the save operation")
	_check(confirm.text == "Saving…", "pending confirm shows a clear save label")
	var pending_style := confirm.get_theme_stylebox("disabled") as StyleBoxFlat
	_check(
		pending_style != null and pending_style.bg_color.is_equal_approx(Color("b58a44")),
		"pending confirm uses the dedicated amber state"
	)

	controls.set_editor_state({"active": false})
	_check(not dock.visible, "dock hides when editor closes")

	controls.queue_free()
	if _failures.is_empty():
		print("FLAMETHROWER_TOUCH_CONTROLS_PROBE_PASS")
		quit(0)
	else:
		for failure in _failures:
			push_error("FLAMETHROWER_TOUCH_CONTROLS_PROBE_FAIL: %s" % failure)
		quit(1)


func _on_step(delta: int, method: String) -> void:
	_steps.append({"delta": delta, "method": method})


func _capture_visual_frames(controls: CanvasLayer) -> void:
	var capture_dir := OS.get_environment("FLAMETHROWER_TOUCH_CAPTURE_DIR")
	if capture_dir.is_empty() or DisplayServer.get_name() == "headless":
		return
	DirAccess.make_dir_recursive_absolute(capture_dir)
	RenderingServer.set_default_clear_color(Color("91b84b"))
	for _frame in range(3):
		await process_frame
	var mobile_image := root.get_texture().get_image()
	mobile_image.save_png(capture_dir.path_join("mobile_320_locked.png"))

	root.size = Vector2i(900, 700)
	controls.set_editor_state({
		"active": true,
		"mode": "edit",
		"step": 15,
		"degrees": 225,
		"pending": false,
	})
	for _frame in range(3):
		await process_frame
	var desktop_image := root.get_texture().get_image()
	desktop_image.save_png(capture_dir.path_join("desktop_900_edit.png"))

	root.size = Vector2i(320, 640)
	controls.set_editor_state({
		"active": true,
		"mode": "placement",
		"step": 3,
		"degrees": 45,
		"cell_locked": true,
		"pending": false,
	})
	await process_frame


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)
