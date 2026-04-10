extends Node3D
## Camera rig for Clash of Clans / Boom Beach style isometric view.
## The rig is a Node3D that moves in the XZ plane.
## Angled at ~45° looking down at the island.
## Pan with left mouse button drag, zoom with scroll wheel.
## Movement and zoom are clamped to prevent going out of bounds.

# ── Camera Settings ──────────────────────────────────────────────
## How fast the camera pans when dragging (scaled by zoom level)
@export var pan_speed: float = 0.010
## Touch pan speed (slower — fingers naturally produce larger relative deltas)
@export var touch_pan_speed: float = 0.006
## How fast the camera moves with WASD keys
@export var key_pan_speed: float = 3.0
## How fast the camera zooms with scroll wheel
@export var zoom_speed: float = 1.0
## Minimum distance from pivot (closest zoom)
@export var min_zoom: float = 0.5
## Maximum distance from pivot (farthest zoom)
@export var max_zoom: float = 5
## Pinch zoom speed multiplier (touch)
@export var pinch_zoom_speed: float = 0.025
## Pixels of movement before a touch is treated as a drag (not a tap)
@export var tap_threshold: float = 12.0
## Edge-pan speed when dragging building near screen edge (world units/sec)
@export var edge_pan_speed: float = 4.0
## Percentage of screen edge that triggers edge-pan (0.12 = 12%)
@export var edge_zone_pct: float = 0.12
## Smooth interpolation factor (higher = snappier)
@export var smoothing: float = 6.0

## Boundary limits for panning (world units from center)
@export var pan_limit_min: Vector3 = Vector3(-15.0, 0.0, -15.0)
@export var pan_limit_max: Vector3 = Vector3(15.0, 0.0, 15.0)

## Camera pitch angle in degrees (45 = standard Clash-style)
@export_range(20.0, 80.0) var camera_pitch: float = 45.0

# ── Internal State ───────────────────────────────────────────────
var _pitch_pivot: Node3D     # Rotates around X (pitch / tilt)
var _camera: Camera3D

var _current_zoom: float = 15.0
var _target_zoom: float = 15.0
var _target_position: Vector3 = Vector3.ZERO

var _is_panning: bool = false
var zoom_blocked: bool = false

# ── Touch state ──────────────────────────────────────────────────
var _touch_points: Dictionary = {}      # touch_index -> Vector2 current position
var _touch_start: Dictionary = {}        # touch_index -> Vector2 start position
var _is_dragging_touch: bool = false     # exceeded tap_threshold this gesture
var _last_pinch_distance: float = 0.0

var _shake_trauma: float = 0.0
const SHAKE_MAX_OFFSET: float = 0.035
const SHAKE_DECAY: float = 2.8

## Add trauma (0–1) to trigger screen shake. Values accumulate, capped at 1.
func add_trauma(amount: float) -> void:
	_shake_trauma = minf(_shake_trauma + amount, 1.0)


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
	var bs_busy: bool = _is_building_system_busy()

	# ── Mouse Button Events ──────────────────────────────────────
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton

		# Left click → start/stop panning (disabled while placing/moving a building)
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if bs_busy:
				_is_panning = false
			else:
				_is_panning = mb.pressed

		# Scroll wheel → zoom in/out (always allowed)
		if mb.pressed and not zoom_blocked:
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
				_target_zoom = maxf(_target_zoom - zoom_speed, min_zoom)
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_target_zoom = minf(_target_zoom + zoom_speed, max_zoom)

	# ── Mouse Motion → Pan ───────────────────────────────────────
	# Block mouse pan completely while placing/moving — also blocks emulated-from-touch.
	# Also block when touch is active — touch handler does its own pan.
	if event is InputEventMouseMotion and _is_panning and not bs_busy and _touch_points.is_empty():
		var motion := event as InputEventMouseMotion
		var delta := motion.relative

		# Pan along world X and Z axes
		var right := Vector3(1.0, 0.0, 0.0)
		var forward := Vector3(0.0, 0.0, 1.0)

		# Scale pan by zoom level so it feels natural at any distance
		var zoom_factor := _current_zoom * 0.2
		_target_position -= right * delta.x * pan_speed * zoom_factor
		_target_position -= forward * delta.y * pan_speed * zoom_factor

		_target_position.y = 0.0

	# ── Touch tracking (always — needed for edge-pan + pinch) ────
	if event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			_touch_points[st.index] = st.position
			_touch_start[st.index] = st.position
		else:
			_touch_points.erase(st.index)
			_touch_start.erase(st.index)
			if _touch_points.is_empty():
				_is_dragging_touch = false
				_last_pinch_distance = 0.0
			elif _touch_points.size() < 2:
				_last_pinch_distance = 0.0

	if event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		_touch_points[sd.index] = sd.position

		# Pinch-to-zoom — always works, even during placement so player can zoom out.
		# Zooms toward the pinch midpoint (not screen center) so it feels natural.
		if _touch_points.size() >= 2 and not zoom_blocked:
			_is_dragging_touch = true
			var points := _touch_points.values()
			var p0: Vector2 = points[0]
			var p1: Vector2 = points[1]
			var dist: float = p0.distance_to(p1)
			if _last_pinch_distance > 0.0:
				var diff: float = _last_pinch_distance - dist
				var old_zoom: float = _target_zoom
				_target_zoom = clampf(_target_zoom + diff * pinch_zoom_speed, min_zoom, max_zoom)
				# Zoom toward pinch midpoint by shifting target position
				var actual_zoom_change: float = _target_zoom - old_zoom
				if absf(actual_zoom_change) > 0.001:
					var midpoint: Vector2 = (p0 + p1) * 0.5
					var world_at_mid := _screen_to_world_xz(midpoint)
					if world_at_mid != Vector3.INF:
						# Move target so the world point under the midpoint stays put
						# Negative because zooming OUT (positive change) should move LESS toward point
						var pull_factor: float = -actual_zoom_change / max(_target_zoom, 0.1) * 0.5
						_target_position += (world_at_mid - global_position) * pull_factor
						_target_position.y = 0.0
			_last_pinch_distance = dist
			get_viewport().set_input_as_handled()
			return

		# Single finger drag → pan (only when NOT placing/moving and NOT pinching)
		if _touch_points.size() == 1 and not bs_busy:
			# Tap threshold — short taps shouldn't start panning
			if not _is_dragging_touch:
				var start_pos: Vector2 = _touch_start.get(sd.index, sd.position)
				if start_pos.distance_to(sd.position) > tap_threshold:
					_is_dragging_touch = true
			if _is_dragging_touch:
				var right := Vector3(1.0, 0.0, 0.0)
				var forward := Vector3(0.0, 0.0, 1.0)
				var zoom_factor := _current_zoom * 0.2
				_target_position -= right * sd.relative.x * touch_pan_speed * zoom_factor
				_target_position -= forward * sd.relative.y * touch_pan_speed * zoom_factor
				_target_position.y = 0.0
				get_viewport().set_input_as_handled()


## Project a screen-space point onto the XZ ground plane (y=0).
## Returns Vector3.INF if the ray doesn't hit the plane.
func _screen_to_world_xz(screen_pos: Vector2) -> Vector3:
	if not _camera:
		return Vector3.INF
	var origin: Vector3 = _camera.project_ray_origin(screen_pos)
	var dir: Vector3 = _camera.project_ray_normal(screen_pos)
	if absf(dir.y) < 0.0001:
		return Vector3.INF
	var t: float = -origin.y / dir.y
	if t < 0.0:
		return Vector3.INF
	return origin + dir * t


## Returns true if building system is currently placing or moving a building.
## When busy, camera should NOT pan/zoom — let the placement system own touches.
func _is_building_system_busy() -> bool:
	var bs = get_node_or_null("/root/Main/BuildingSystem")
	if not bs:
		# Try alternative paths — building system might be a child node
		var roots = get_tree().root.get_children()
		for r in roots:
			var found = r.find_child("BuildingSystem", true, false)
			if found:
				bs = found
				break
	if not bs:
		return false
	if "is_placing" in bs and bs.is_placing:
		return true
	if "_is_moving" in bs and bs._is_moving:
		return true
	return false


func _process(delta_raw: float) -> void:
	var delta = minf(delta_raw, 0.1)
	# ── WASD movement ────────────────────────────────────────────
	var move_dir := Vector3.ZERO
	if Input.is_key_pressed(KEY_W):
		move_dir.z -= 1.0
	if Input.is_key_pressed(KEY_S):
		move_dir.z += 1.0
	if Input.is_key_pressed(KEY_A):
		move_dir.x -= 1.0
	if Input.is_key_pressed(KEY_D):
		move_dir.x += 1.0
	if move_dir != Vector3.ZERO:
		var speed = key_pan_speed * _current_zoom * 0.2 * delta
		_target_position += move_dir.normalized() * speed
		_target_position.y = 0.0

	# ── Edge-pan when dragging building near screen edge ─────────
	if _is_building_system_busy() and _touch_points.size() == 1:
		var screen_size: Vector2 = get_viewport().get_visible_rect().size
		var finger_pos: Vector2 = _touch_points.values()[0]
		var edge_x: float = screen_size.x * edge_zone_pct
		var edge_y: float = screen_size.y * edge_zone_pct
		var edge_dir := Vector3.ZERO
		# Horizontal edges
		if finger_pos.x < edge_x:
			edge_dir.x = -((edge_x - finger_pos.x) / edge_x)  # 0 at boundary, -1 at screen edge
		elif finger_pos.x > screen_size.x - edge_x:
			edge_dir.x = ((finger_pos.x - (screen_size.x - edge_x)) / edge_x)
		# Vertical edges
		if finger_pos.y < edge_y:
			edge_dir.z = -((edge_y - finger_pos.y) / edge_y)
		elif finger_pos.y > screen_size.y - edge_y:
			edge_dir.z = ((finger_pos.y - (screen_size.y - edge_y)) / edge_y)
		if edge_dir != Vector3.ZERO:
			var zoom_factor: float = _current_zoom * 0.2
			_target_position += edge_dir * edge_pan_speed * zoom_factor * delta
			_target_position.y = 0.0

	# ── Q/E zoom ─────────────────────────────────────────────────
	if Input.is_key_pressed(KEY_E):
		_target_zoom = maxf(_target_zoom - zoom_speed * delta * 3.0, min_zoom)
	if Input.is_key_pressed(KEY_Q):
		_target_zoom = minf(_target_zoom + zoom_speed * delta * 3.0, max_zoom)

	# ── C = center camera on island ──────────────────────────────
	if Input.is_key_pressed(KEY_C):
		_target_position = Vector3.ZERO
		_target_zoom = max_zoom

	var t = 1.0 - exp(-smoothing * delta)

	# Smoothly interpolate position (pan)
	global_position = global_position.lerp(_target_position, t)

	# Smoothly interpolate zoom
	_current_zoom = lerpf(_current_zoom, _target_zoom, t)
	_camera.position.z = _current_zoom

	# Apply pitch angle
	_pitch_pivot.rotation_degrees.x = -camera_pitch

	# Screen shake — offset camera in camera-local XY, decays each frame
	if _shake_trauma > 0.0:
		_shake_trauma = maxf(_shake_trauma - SHAKE_DECAY * delta, 0.0)
		var intensity = _shake_trauma * _shake_trauma
		_camera.position.x = randf_range(-1.0, 1.0) * SHAKE_MAX_OFFSET * intensity
		_camera.position.y = randf_range(-1.0, 1.0) * SHAKE_MAX_OFFSET * intensity
	else:
		_camera.position.x = 0.0
		_camera.position.y = 0.0
