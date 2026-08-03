extends "res://scripts/tower_archer.gd"
## Test-only Archer Tower shell that keeps real combat/projectile behavior while
## omitting character visuals that are not present in the headless fixture.


func _ready() -> void:
	_apply_stats()
	_idle_rotation_y = rotation_degrees.y
	call_deferred("_build_pool")
