@tool
extends CSGPolygon3D

@export var width: float = 10.0:
	set(value):
		width = value
		_update_polygon()

@export var depth: float = 8.0:
	set(value):
		depth = value
		_update_polygon()

@export var corner_radius: float = 2.0:
	set(value):
		corner_radius = value
		_update_polygon()

@export var corner_resolution: int = 8:
	set(value):
		corner_resolution = value
		_update_polygon()

func _ready():
	_update_polygon()

func _update_polygon():
	var pts:= PackedVector2Array()
	var w = width / 2.0
	var d = depth / 2.0
	
	# Clamp radius to be max half the width or depth
	var r = min(corner_radius, min(w, d))
	
	# Top Right Corner
	_add_arc(pts, Vector2(w - r, d - r), r, 0, PI/2, corner_resolution)
	# Top Left Corner
	_add_arc(pts, Vector2(-w + r, d - r), r, PI/2, PI, corner_resolution)
	# Bottom Left Corner
	_add_arc(pts, Vector2(-w + r, -d + r), r, PI, PI * 1.5, corner_resolution)
	# Bottom Right Corner
	_add_arc(pts, Vector2(w - r, -d + r), r, PI * 1.5, PI * 2.0, corner_resolution)
	
	polygon = pts

func _add_arc(pts: PackedVector2Array, center: Vector2, radius: float, start_angle: float, end_angle: float, resolution: int):
	for i in range(resolution + 1):
		var t = float(i) / float(resolution)
		var angle = lerpf(start_angle, end_angle, t)
		pts.append(center + Vector2(cos(angle), sin(angle)) * radius)
