extends SceneTree

const CHARACTER_SCENE: PackedScene = preload("res://Model/Characters/pirate_knight/pirate_knight.tscn")
const KNIGHT_SCRIPT: Script = preload("res://scripts/knight.gd")


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
	target_node.name = "KnightCombatTarget"
	target_node.position = Vector3(0.0, 0.0, -0.55)
	stage.add_child(target_node)

	var building := {
		"id": "test_target",
		"server_id": 91002,
		"hp": 1000,
		"max_hp": 1000,
		"node": target_node,
	}
	var building_system := DummyBuildingSystem.new()
	building_system.placed_buildings.append(building)
	building_system.add_to_group("building_systems")
	stage.add_child(building_system)

	var knight := CHARACTER_SCENE.instantiate() as Node3D
	knight.name = "PirateKnightCombatTest"
	knight.set_script(KNIGHT_SCRIPT)
	knight.position = Vector3.ZERO
	knight.set("_spawn_scale", 0.17)
	stage.add_child(knight)

	await process_frame
	await physics_frame
	knight.call("activate")

	var hp_before := int(building.hp)
	var saw_attack_animation := false
	for _tick in 360:
		await physics_frame
		var player := knight.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
		if player != null and player.current_animation == "Melee_1H_Attack_Chop":
			saw_attack_animation = true
		if int(building.hp) < hp_before:
			break

	var hp_after := int(building.hp)
	var animation_player := knight.get_node_or_null("TroopAnimPlayer") as AnimationPlayer
	var has_attack_animation := (
		animation_player != null
		and animation_player.has_animation("Melee_1H_Attack_Chop")
	)
	var sword_count := knight.find_children("OHS07_Sword_R", "MeshInstance3D", true, false).size()

	if hp_after >= hp_before:
		push_error("Pirate knight combat failed: melee attack did not damage the target.")
		quit(1)
		return
	if not saw_attack_animation or not has_attack_animation:
		push_error("Pirate knight combat failed: attack animation did not play.")
		quit(1)
		return
	if sword_count != 1:
		push_error("Pirate knight combat failed: expected one modular sword, found %d." % sword_count)
		quit(1)
		return

	print(
		"[PIRATE_KNIGHT_COMBAT] PASS hp_before=", hp_before,
		" hp_after=", hp_after,
		" damage=", hp_before - hp_after,
		" attack_animation=", saw_attack_animation,
		" sword_count=", sword_count
	)
	stage.queue_free()
	await process_frame
	quit()
