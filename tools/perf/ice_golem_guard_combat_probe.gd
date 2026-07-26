extends Node3D

class ProbeBuildingSystem:
	extends Node3D

	var placed_buildings: Array = []
	var building_defs: Dictionary = {
		"turret": {
			"non_targetable": false,
			"cells": Vector2i(2, 2),
		},
	}
	var cell_size: float = 0.10
	var grid_center: Vector3 = Vector3.ZERO
	var grid_extent_x: float = 4.0
	var grid_extent_z: float = 4.0
	var grid_rotation: float = 0.0
	var telemetry: Array[Dictionary] = []

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		telemetry.append({"kind": kind, "payload": payload.duplicate(true)})

	func _get_grid_index() -> int:
		return 0


const GOLEM_SCENE: PackedScene = preload(
	"res://Model/Characters/IceGolem/IceGolem.fbx"
)
const GOLEM_SCRIPT: Script = preload("res://scripts/ice_golem.gd")
const GUARD_SCENE: PackedScene = preload(
	"res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb"
)
const GUARD_SCRIPT: Script = preload("res://scripts/skeleton_guard.gd")
const GROUP_SIZE: int = 4
const STEP: float = 1.0 / 60.0
const MAX_STEPS: int = 60 * 16

var _building_system: ProbeBuildingSystem
var _golems: Array[Node3D] = []
var _guards: Array[Node3D] = []


func _ready() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	_add_defense_target()
	_spawn_guards()
	_spawn_golems()
	await get_tree().process_frame

	for guard in _guards:
		if is_instance_valid(guard):
			guard.set_physics_process(false)
	for golem in _golems:
		if is_instance_valid(golem):
			golem.set_physics_process(false)

	var direct_golem: Node3D = _golems[0]
	var direct_guard: Node3D = _guards[0]
	var direct_hp_before: int = int(direct_guard.get("hp"))
	direct_golem.set("target_guard", direct_guard)
	direct_golem.set("target_building", {})
	direct_golem.set("target_bs", null)
	direct_golem.set("state", BaseTroop.State.ATTACKING)
	direct_golem.set("attack_timer", 0.0)
	direct_golem.call("_on_enter_attack_state")
	for _step in 120:
		direct_golem.call("_do_attack", STEP)
	if int(direct_guard.get("hp")) >= direct_hp_before:
		_fail(
			"direct stationary guard test did not receive damage; timer=%.3f hit=%s"
			% [
				float(direct_golem.get("attack_timer")),
				str(direct_golem.get("_hit_this_swing")),
			]
		)
		return
	direct_guard.set("hp", direct_guard.get("max_hp"))
	direct_golem.set("state", BaseTroop.State.RUNNING)
	direct_golem.set("target_guard", null)
	direct_golem.call("_find_next_target")

	var initial_guard_hp: int = _living_guard_hp()
	var first_hit_step: int = -1
	var final_step: int = 0
	var previous_states: Array[int] = []
	var attack_entries: Array[int] = []
	var max_attack_timers: Array[float] = []
	for golem in _golems:
		previous_states.append(int(golem.get("state")))
		attack_entries.append(0)
		max_attack_timers.append(0.0)
	for step_index in MAX_STEPS:
		final_step = step_index
		for guard in _guards:
			if is_instance_valid(guard):
				guard._physics_process(STEP)
		for golem_index in _golems.size():
			var golem: Node3D = _golems[golem_index]
			if is_instance_valid(golem):
				golem._physics_process(STEP)
				var current_state: int = int(golem.get("state"))
				if (
					current_state == BaseTroop.State.ATTACKING
					and previous_states[golem_index] != BaseTroop.State.ATTACKING
				):
					attack_entries[golem_index] += 1
				previous_states[golem_index] = current_state
				max_attack_timers[golem_index] = maxf(
					max_attack_timers[golem_index],
					float(golem.get("attack_timer"))
				)
		if first_hit_step < 0 and _living_guard_hp() < initial_guard_hp:
			first_hit_step = step_index
		if _living_guard_count() == 0:
			break
		await get_tree().process_frame

	var hits: Array = _building_system.telemetry.filter(
		func(entry: Dictionary) -> bool:
			return (
				str(entry.get("kind", "")) == "troop_melee_hit"
				and str(entry.get("payload", {}).get("target_kind", "")) == "guard"
			)
	)
	if first_hit_step < 0:
		_fail(
			"no Ice Golem hit reached a guard; states=%s distances=%s entries=%s max_timers=%s"
			% [
				_golem_states(),
				_nearest_guard_distances(),
				attack_entries,
				max_attack_timers,
			]
		)
		return
	if _living_guard_count() != 0:
		_fail(
			"guards survived after %.2fs: alive=%d hp=%d hits=%d states=%s distances=%s"
			% [
				float(final_step + 1) * STEP,
				_living_guard_count(),
				_living_guard_hp(),
				hits.size(),
				_golem_states(),
				_nearest_guard_distances(),
			]
		)
		return

	print(
		"[ICE_GOLEM_GUARD_COMBAT] PASS golems=", GROUP_SIZE,
		" guards=", GROUP_SIZE,
		" first_hit_sec=", snappedf(float(first_hit_step + 1) * STEP, 0.001),
		" clear_sec=", snappedf(float(final_step + 1) * STEP, 0.001),
		" hits=", hits.size()
	)
	get_tree().quit()


func _add_defense_target() -> void:
	_building_system = ProbeBuildingSystem.new()
	_building_system.name = "ProbeBuildingSystem"
	_building_system.add_to_group("building_systems")
	add_child(_building_system)

	var turret := Node3D.new()
	turret.name = "PriorityTurret"
	turret.position = Vector3(0.0, 0.0, -1.45)
	_building_system.add_child(turret)
	_building_system.placed_buildings.append({
		"id": "turret",
		"server_id": 1,
		"grid_pos": Vector2i(0, 0),
		"hp": 100000,
		"node": turret,
	})


func _spawn_guards() -> void:
	const POSITIONS: Array[Vector3] = [
		Vector3(-0.15, 0.0, -0.02),
		Vector3(0.15, 0.0, -0.02),
		Vector3(-0.05, 0.0, 0.16),
		Vector3(0.05, 0.0, 0.16),
	]
	for index in GROUP_SIZE:
		var guard := GUARD_SCENE.instantiate() as Node3D
		guard.set_script(GUARD_SCRIPT)
		guard.name = "ProbeGuard_%d" % index
		guard.set("tombstone_pos", Vector3.ZERO)
		guard.position = POSITIONS[index]
		add_child(guard)
		guard.call("set_level", 5)
		_guards.append(guard)


func _spawn_golems() -> void:
	const POSITIONS: Array[Vector3] = [
		Vector3(-0.22, 0.0, 0.42),
		Vector3(-0.07, 0.0, 0.46),
		Vector3(0.08, 0.0, 0.46),
		Vector3(0.23, 0.0, 0.42),
	]
	for index in GROUP_SIZE:
		var golem := GOLEM_SCENE.instantiate() as Node3D
		golem.set_script(GOLEM_SCRIPT)
		golem.name = "ProbeIceGolem_%d" % index
		golem.set("level", 1)
		golem.position = POSITIONS[index]
		golem.scale = Vector3.ONE * AttackSystem._scale_for_troop("IceGolem", 0.1)
		add_child(golem)
		golem.call("activate")
		_golems.append(golem)


func _living_guard_count() -> int:
	var count: int = 0
	for guard in _guards:
		if (
			is_instance_valid(guard)
			and guard.is_inside_tree()
			and int(guard.get("hp")) > 0
		):
			count += 1
	return count


func _living_guard_hp() -> int:
	var total: int = 0
	for guard in _guards:
		if is_instance_valid(guard) and guard.is_inside_tree():
			total += maxi(0, int(guard.get("hp")))
	return total


func _golem_states() -> Array:
	var states: Array = []
	for golem in _golems:
		if not is_instance_valid(golem):
			states.append("freed")
			continue
		states.append({
			"state": int(golem.get("state")),
			"hp": int(golem.get("hp")),
			"target_guard": (
				int(golem.get("target_guard").get_instance_id())
				if is_instance_valid(golem.get("target_guard"))
				else -1
			),
			"attack_timer": snappedf(float(golem.get("attack_timer")), 0.001),
		})
	return states


func _nearest_guard_distances() -> Array:
	var distances: Array = []
	for golem in _golems:
		if not is_instance_valid(golem):
			distances.append(-1.0)
			continue
		var nearest: float = INF
		for guard in _guards:
			if is_instance_valid(guard) and guard.is_inside_tree():
				var delta: Vector3 = guard.global_position - golem.global_position
				delta.y = 0.0
				nearest = minf(nearest, delta.length())
		distances.append(snappedf(nearest, 0.001) if nearest != INF else -1.0)
	return distances


func _fail(message: String) -> void:
	push_error("[ICE_GOLEM_GUARD_COMBAT] FAIL %s" % message)
	get_tree().quit(1)
