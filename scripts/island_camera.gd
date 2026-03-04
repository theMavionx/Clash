extends Node3D

# ============================================================
#  Island Camera — Clash of Clans / Boom Beach style
#  Attach this script to a Node3D named "CameraRig" in your scene.
#  The Node3D contains a Camera3D as a child.
# ============================================================

# --- Zoom ---
@export var zoom_min: float = 80.0       # closest (Camera Y height)
@export var zoom_max: float = 400.0      # farthest
@export var zoom_speed: float = 25.0
@export var zoom_smooth: float = 8.0

# --- Pan ---
@export var pan_speed: float = 1.8       # mouse-drag sensitivity
@export var keyboard_pan_speed: float = 500.0
@export var pan_smooth: float = 10.0

# --- Limits (world units) ---
@export var pan_limit_x: float = 350.0
@export var pan_limit_z: float = 350.0

# --- Camera angle (CoC style: ~50° from horizontal) ---
@export var camera_pitch_deg: float = 52.0   # tilt angle
@export var camera_distance: float = 1.0     # multiplier for offset

# ============================================================
var _target_zoom: float = 200.0
var _current_zoom: float = 200.0

# --- Default / reset values ---
const DEFAULT_POS := Vector3(50, 0, 60)
const DEFAULT_ZOOM := 200.0

var _target_pos: Vector3 = Vector3.ZERO
var _current_pos: Vector3 = Vector3.ZERO

var _dragging: bool = false
var _last_mouse_pos: Vector2 = Vector2.ZERO

@onready var camera: Camera3D = $Camera3D


func _ready() -> void:
	# Position camera rig at island center
	_target_pos = Vector3(50, 0, 60)   # rough island center
	_current_pos = _target_pos
	global_position = _current_pos
	
	_target_zoom = 200.0
	_current_zoom = _target_zoom
	
	_apply_camera_transform()


func _is_build_mode() -> bool:
	var ui = get_tree().current_scene.find_child("BuildUI", true, false)
	if ui:
		return ui.get("_placing") == true
	return false

func _unhandled_input(event: InputEvent) -> void:
	# --- Scroll wheel to zoom (always works) ---
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed:
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP:
				_target_zoom -= zoom_speed * (_current_zoom / zoom_max * 2.5 + 0.5)
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
				_target_zoom += zoom_speed * (_current_zoom / zoom_max * 2.5 + 0.5)
			_target_zoom = clamp(_target_zoom, zoom_min, zoom_max)

		# --- Start/stop drag (skip LEFT click when placing buildings) ---
		if mb.button_index == MOUSE_BUTTON_LEFT or mb.button_index == MOUSE_BUTTON_MIDDLE:
			if mb.button_index == MOUSE_BUTTON_LEFT and _is_build_mode():
				_dragging = false
			else:
				if mb.pressed:
					_dragging = true
					_last_mouse_pos = mb.position
				else:
					_dragging = false

	# --- Pan on mouse motion while dragging ---
	if event is InputEventMouseMotion and _dragging:
		var delta := (event as InputEventMouseMotion).relative
		var pan_scale := _current_zoom / zoom_max
		_target_pos.x -= delta.x * pan_speed * pan_scale
		_target_pos.z -= delta.y * pan_speed * pan_scale * 0.5
		_clamp_position()


func _process(delta: float) -> void:
	# --- Keyboard pan (WASD / Arrow keys) ---
	var kb_dir := Vector3.ZERO
	if Input.is_action_pressed("ui_left") or Input.is_key_pressed(KEY_A):
		kb_dir.x -= 1
	if Input.is_action_pressed("ui_right") or Input.is_key_pressed(KEY_D):
		kb_dir.x += 1
	if Input.is_action_pressed("ui_up") or Input.is_key_pressed(KEY_W):
		kb_dir.z -= 1
	if Input.is_action_pressed("ui_down") or Input.is_key_pressed(KEY_S):
		kb_dir.z += 1

	if kb_dir != Vector3.ZERO:
		var speed_scale := _current_zoom / zoom_max
		_target_pos += kb_dir.normalized() * keyboard_pan_speed * speed_scale * delta
		_clamp_position()

	# --- Zoom keyboard (+/-) ---
	if Input.is_key_pressed(KEY_EQUAL) or Input.is_key_pressed(KEY_KP_ADD):
		_target_zoom -= zoom_speed * 3.0 * delta * 60
		_target_zoom = clamp(_target_zoom, zoom_min, zoom_max)
	if Input.is_key_pressed(KEY_MINUS) or Input.is_key_pressed(KEY_KP_SUBTRACT):
		_target_zoom += zoom_speed * 3.0 * delta * 60
		_target_zoom = clamp(_target_zoom, zoom_min, zoom_max)

	# --- C: reset camera to default position & zoom ---
	if Input.is_key_pressed(KEY_C):
		_target_pos = DEFAULT_POS
		_target_zoom = DEFAULT_ZOOM

	# --- Smooth interpolation ---
	_current_zoom = lerp(_current_zoom, _target_zoom, zoom_smooth * delta)
	_current_pos = _current_pos.lerp(_target_pos, pan_smooth * delta)
	global_position = _current_pos

	_apply_camera_transform()


func _apply_camera_transform() -> void:
	if not camera:
		return
	var pitch_rad := deg_to_rad(camera_pitch_deg)
	# Place camera above and behind, looking at rig origin
	var offset := Vector3(0, sin(pitch_rad), cos(pitch_rad)) * _current_zoom
	camera.position = offset
	camera.look_at(global_position, Vector3.UP)


func _clamp_position() -> void:
	_target_pos.x = clamp(_target_pos.x, -pan_limit_x, pan_limit_x)
	_target_pos.z = clamp(_target_pos.z, -pan_limit_z, pan_limit_z)
