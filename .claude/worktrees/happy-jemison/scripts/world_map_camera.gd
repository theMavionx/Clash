extends Camera2D
## Camera for the 2D world map.
## Pan with left mouse button drag, zoom with scroll wheel.
## Smooth interpolation on all movements. Clamped to map boundaries.

# ── Camera Settings ──────────────────────────────────────────────
## How fast the camera pans when dragging (scaled by zoom level)
@export var pan_speed: float = 1.0
## How fast the camera zooms with scroll wheel
@export var zoom_speed: float = 0.1
## Minimum zoom (most zoomed in)
@export var min_zoom: float = 0.4
## Maximum zoom (most zoomed out)
@export var max_zoom: float = 2.0
## Smooth interpolation factor (higher = snappier)
@export var smoothing: float = 6.0
## Map size in world pixels
@export var map_size: Vector2 = Vector2(4000.0, 3000.0)

# ── Internal State ───────────────────────────────────────────────
var _target_position: Vector2 = Vector2.ZERO
var _target_zoom: float = 1.0
var _current_zoom: float = 1.0
var _is_panning: bool = false


func _ready() -> void:
	_target_position = global_position
	_target_zoom = zoom.x
	_current_zoom = _target_zoom


func _unhandled_input(event: InputEvent) -> void:
	# ── Mouse Button Events ──────────────────────────────────────
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton

		# Left click → start/stop panning
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_is_panning = mb.pressed

		# Scroll wheel → zoom in/out
		if mb.pressed:
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
				_target_zoom = minf(_target_zoom + zoom_speed, max_zoom)
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_target_zoom = maxf(_target_zoom - zoom_speed, min_zoom)

	# ── Mouse Motion → Pan ───────────────────────────────────────
	if event is InputEventMouseMotion and _is_panning:
		var motion := event as InputEventMouseMotion
		var delta := motion.relative

		# Scale pan by inverse zoom so drag distance feels consistent
		var zoom_factor := 1.0 / _current_zoom
		_target_position -= delta * pan_speed * zoom_factor

		# Clamp to map boundaries (account for viewport size / zoom)
		_clamp_position()


func _process(delta: float) -> void:
	# Smoothly interpolate position (pan)
	global_position = global_position.lerp(_target_position, smoothing * delta)

	# Smoothly interpolate zoom
	_current_zoom = lerpf(_current_zoom, _target_zoom, smoothing * delta)
	zoom = Vector2(_current_zoom, _current_zoom)


func _clamp_position() -> void:
	var vp_size := get_viewport_rect().size * 0.5 / _current_zoom
	_target_position.x = clampf(_target_position.x, vp_size.x, map_size.x - vp_size.x)
	_target_position.y = clampf(_target_position.y, vp_size.y, map_size.y - vp_size.y)
