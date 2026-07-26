extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_mage/pirate_mage.tscn")
const MAGE_SCRIPT: Script = preload("res://scripts/mage.gd")


class DummyBuildingSystem:
	extends Node3D
	var placed_buildings: Array = []
	var building_defs: Dictionary = {
		"test_target": {
			"cells": Vector2i(2, 2),
		},
	}
	var cell_size: float = 0.1
	var grid_extent_x: float = 5.0
	var grid_extent_z: float = 5.0
	var grid_center: Vector3 = Vector3.ZERO
	var grid_rotation: float = 0.0

	func remove_building(_building: Dictionary) -> void:
		pass

	func _get_grid_index() -> int:
		return 0


func _initialize() -> void:
	call_deferred("_run_test")


func _run_test() -> void:
	var stage := Node3D.new()
	root.add_child(stage)
	current_scene = stage

	var target_node := Node3D.new()
	target_node.name = "MageCombatTarget"
	target_node.position = Vector3(0.0, 0.0, -0.72)
	stage.add_child(target_node)

	var building := {
		"id": "test_target",
		"server_id": 91001,
		"hp": 1000,
		"max_hp": 1000,
		"node": target_node,
	}
	var building_system := DummyBuildingSystem.new()
	building_system.placed_buildings.append(building)
	building_system.add_to_group("building_systems")
	stage.add_child(building_system)

	var mage := CHARACTER_SCENE.instantiate() as Node3D
	mage.name = "PirateMageCombatTest"
	mage.set_script(MAGE_SCRIPT)
	mage.position = Vector3.ZERO
	mage.set("_spawn_scale", 0.17)
	stage.add_child(mage)

	await process_frame
	await physics_frame
	mage.call("activate")

	var hp_before := int(building.hp)
	var saw_projectile := false
	for _tick in 180:
		await physics_frame
		var active_projectiles: Array = mage.get("_active")
		if not active_projectiles.is_empty():
			saw_projectile = true
		if int(building.hp) < hp_before:
			break

	var hp_after := int(building.hp)
	var animation_player := mage.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	var has_attack_animation := (
		animation_player != null
		and animation_player.has_animation("Ranged_Magic_Spellcasting")
	)
	var projectile_pool_ready := bool(mage.get("_pool_ready"))

	if hp_after >= hp_before:
		push_error("Pirate mage combat failed: projectile did not damage the target.")
		quit(1)
		return
	if not saw_projectile or not projectile_pool_ready:
		push_error("Pirate mage combat failed: projectile pool did not activate.")
		quit(1)
		return
	if not has_attack_animation:
		push_error("Pirate mage combat failed: attack animation is unavailable.")
		quit(1)
		return

	print(
		"[PIRATE_MAGE_COMBAT] PASS hp_before=", hp_before,
		" hp_after=", hp_after,
		" damage=", hp_before - hp_after,
		" projectile_seen=", saw_projectile,
		" attack_animation=", has_attack_animation
	)
	stage.queue_free()
	await process_frame
	quit()
