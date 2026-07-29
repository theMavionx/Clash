extends SceneTree

const CannonScript := preload("res://scripts/cannon.gd")
const MortarScript := preload("res://scripts/tower_mortar.gd")
const PeaShooterScript := preload("res://scripts/pea_shooter.gd")


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := Node3D.new()
	root.add_child(world)
	current_scene = world

	var cannon := CannonScript.new()
	world.add_child(cannon)

	var target := Node3D.new()
	world.add_child(target)
	target.global_position = Vector3(4.0, 0.0, 0.0)

	var projectile_ball := MeshInstance3D.new()
	world.add_child(projectile_ball)
	cannon._active_projectiles.append({
		"active": true,
		"ball": projectile_ball,
		"trail": null,
		"flash": null,
		"target": target,
		"target_instance": target.get_instance_id(),
		"spawn_position": Vector3.ZERO,
		"hit_applied": false,
		"flash_timer": 0.0,
		"flash_frame": 0,
	})

	target.free()
	cannon._update_projectiles(0.1)

	if not cannon._active_projectiles.is_empty():
		push_error("Freed-target projectile was not removed")
		quit(1)
		return

	var pea_shooter := PeaShooterScript.new()
	world.add_child(pea_shooter)
	var freed_pea_projectile := Node3D.new()
	world.add_child(freed_pea_projectile)
	pea_shooter._active_projectiles.append({
		"node": freed_pea_projectile,
		"target_ref": {},
		"target_guard_ref": null,
	})
	freed_pea_projectile.free()
	pea_shooter._update_projectiles(0.1)
	if not pea_shooter._active_projectiles.is_empty():
		push_error("Freed Pea Shooter projectile was not removed")
		quit(1)
		return

	var mortar := MortarScript.new()
	world.add_child(mortar)
	var freed_mortar_projectile := Node3D.new()
	world.add_child(freed_mortar_projectile)
	mortar._active.append({
		"node": freed_mortar_projectile,
	})
	freed_mortar_projectile.free()
	mortar._update_projectiles(0.1)
	if not mortar._active.is_empty():
		push_error("Freed mortar projectile was not removed")
		quit(1)
		return

	print("PROJECTILE_FREED_TARGET_PROBE_OK")
	quit()
