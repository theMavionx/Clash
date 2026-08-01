extends SceneTree

const SHARK_TRAP_SCRIPT := preload("res://scripts/shark_trap.gd")
const BATTLE_SCRIPT := preload("res://scripts/bs_battle.gd")

var _failures: Array[String] = []


class TestBuildingSystem:
	extends Node3D

	var is_viewing_enemy: bool = false
	var building_defs: Dictionary = {}
	var cell_size: float = 0.1
	var _building_systems: Array = []
	var placed_buildings: Array = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var world := TestBuildingSystem.new()
	root.add_child(world)
	current_scene = world

	var trap := Node3D.new()
	trap.set_script(SHARK_TRAP_SCRIPT)
	world.add_child(trap)
	await process_frame

	trap.set_process(true)
	trap.set_physics_process(true)
	world._building_systems = [world]
	world.placed_buildings = [{"id": "shark_trap", "node": trap, "hp": 1}]
	var battle = BATTLE_SCRIPT.new().init(world)
	battle._stop_defensive_combat_after_town_hall_destroyed()

	_expect(bool(trap.get("_battle_ended")), "victory cleanup did not seal the trap")
	_expect(not trap.is_processing(), "neutralized trap still runs visual processing")
	_expect(not trap.is_physics_processing(), "neutralized trap still scans for troops")
	_expect(trap.is_queued_for_deletion(), "neutralized runtime trap was left orphaned")
	_expect(not bool(trap.get_meta("trap_spent", false)), "victory cleanup incorrectly consumed the trap")
	_expect(
		bool(trap.get_meta("trap_neutralized_after_battle_end", false)),
		"victory cleanup marker is missing",
	)
	_expect(
		not BATTLE_SCRIPT._should_chain_destroy_building("shark_trap"),
		"Shark Trap still participates in the victory explosion cascade",
	)
	_expect(
		not BATTLE_SCRIPT._should_chain_destroy_building("town_hall"),
		"Town Hall must not be collected twice by its own victory cascade",
	)
	_expect(
		BATTLE_SCRIPT._should_chain_destroy_building("mage_tower"),
		"ordinary surviving defenses must retain the victory cascade",
	)

	world.queue_free()
	await process_frame
	_shutdown_test_audio()
	await process_frame

	if _failures.is_empty():
		print("PASS: Shark Trap is silently neutralized and excluded from Town Hall victory cascade")
		quit(0)
		return
	for failure in _failures:
		push_error("Shark Trap victory cleanup: " + failure)
	quit(1)


func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _shutdown_test_audio() -> void:
	var audio_manager := root.get_node_or_null("AudioManager")
	if is_instance_valid(audio_manager):
		for child in audio_manager.get_children():
			if child is AudioStreamPlayer:
				child.stop()
				child.stream = null
		audio_manager.free()
