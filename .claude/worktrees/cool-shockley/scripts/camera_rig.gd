extends Node3D
## Camera rig for Clash of Clans / Boom Beach style isometric view.
## The rig is a Node3D that moves in the XZ plane.
## Angled at ~45° looking down at the island.
## Pan with left mouse button drag, zoom with scroll wheel.
## Movement and zoom are clamped to prevent going out of bounds.

# ── Camera Settings ──────────────────────────────────────────────
## How fast the camera pans when dragging (scaled by zoom level)
@export var pan_speed: float = 0.010
## How fast the camera zooms with scroll wheel
@export var zoom_speed: float = 1.0
## Minimum distance from pivot (closest zoom)
@export var min_zoom: float = 1.5
## Maximum distance from pivot (farthest zoom)
@export var max_zoom: float = 5
## Smooth interpolation factor (higher = snappier)
@export var smoothing: float = 6.0

## Boundary limits for panning (world units from center)
@export var pan_limit_min: Vector3 = Vector3(-15.0, 0.0, -15.0)
@export var pan_limit_max: Vector3 = Vector3(15.0, 0.0, 15.0)

## Camera pitch angle in degrees (45 = standard Clash-style)
@export_range(20.0, 80.0) var camera_pitch: float = 35.0

# ── Internal State ───────────────────────────────────────────────
var _pitch_pivot: Node3D     # Rotates around X (pitch / tilt)
var _camera: Camera3D

var _current_zoom: float = 15.0
var _target_zoom: float = 15.0
var _target_position: Vector3 = Vector3.ZERO

var _is_panning: bool = false


func _ready() -> void:
	_pitch_pivot = $PitchPivot
	_camera = $PitchPivot/Camera3D

	_target_position = global_position

	# Apply initial pitch angle
	_pitch_pivot.rotation_degrees.x = -camera_pitch

	# Set initial zoom
	_target_zoom = _camera.position.z
	if _target_zoom < min_zoom or _target_zoom > max_zoom:
		_target_zoom = (min_zoom + max_zoom) / 2.0
	_current_zoom = _target_zoom
	_camera.position.z = _current_zoom


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
				_target_zoom = maxf(_target_zoom - zoom_speed, min_zoom)
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_target_zoom = minf(_target_zoom + zoom_speed, max_zoom)

	# ── Mouse Motion → Pan ───────────────────────────────────────
	if event is InputEventMouseMotion and _is_panning:
		var motion := event as InputEventMouseMotion
		var delta := motion.relative

		# Pan along world X and Z axes
		var right := Vector3(1.0, 0.0, 0.0)
		var forward := Vector3(0.0, 0.0, 1.0)

		# Scale pan by zoom level so it feels natural at any distance
		var zoom_factor := _current_zoom * 0.2
		_target_position -= right * delta.x * pan_speed * zoom_factor
		_target_position -= forward * delta.y * pan_speed * zoom_factor

		# Clamp to boundaries
		_target_position.x = clampf(_target_position.x, pan_limit_min.x, pan_limit_max.x)
		_target_position.y = 0.0
		_target_position.z = clampf(_target_position.z, pan_limit_min.z, pan_limit_max.z)


func _process(delta: float) -> void:
	# Smoothly interpolate position (pan)
	global_position = global_position.lerp(_target_position, smoothing * delta)

	# Smoothly interpolate zoom
	_current_zoom = lerpf(_current_zoom, _target_zoom, smoothing * delta)
	_camera.position.z = _current_zoom

	# Apply pitch angle
	_pitch_pivot.rotation_degrees.x = -camera_pitch
