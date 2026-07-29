extends SceneTree

const BUILDING_SYSTEM_SCRIPT: Script = preload("res://scripts/building_system.gd")


class ExplicitTelemetrySink:
	extends Node

	var active: bool = false
	var events: Array[Dictionary] = []

	func has_active_replay_telemetry_sink() -> bool:
		return active

	func record_replay_telemetry(kind: String, payload: Dictionary) -> void:
		events.append({"kind": kind, "payload": payload})


class CandidateProbeTroop:
	extends BaseTroop

	var candidate_scan_count: int = 0

	func _target_candidates_payload(_limit: int = 5) -> Array:
		candidate_scan_count += 1
		return [{"kind": "probe"}]


class SummonProbe:
	extends Node3D

	var _is_dead: bool = false
	var _despawning: bool = false


func _initialize() -> void:
	call_deferred("_run_probe")


func _run_probe() -> void:
	if not BUILDING_SYSTEM_SCRIPT.can_instantiate():
		_fail("building_system.gd did not parse as an instantiable script")
		return
	var sink := ExplicitTelemetrySink.new()
	root.add_child(sink)
	sink.add_to_group("building_systems")

	var troop := CandidateProbeTroop.new()
	BaseTroop.reset_combat_runtime_cache()
	var inactive_context := troop._merge_target_switch_context(
		{"target_kind": "probe"},
		4.0
	)
	troop._record_replay_telemetry("inactive_probe", {"nested": {"value": 7}})
	if troop.candidate_scan_count != 0:
		_fail("inactive telemetry performed a target-candidate scan")
		return
	if not sink.events.is_empty():
		_fail("inactive telemetry reached the sink")
		return
	if inactive_context.has("target_candidates"):
		_fail("inactive target context contains candidate payload")
		return

	sink.active = true
	BaseTroop.invalidate_replay_telemetry_sink_cache()
	var active_context := troop._merge_target_switch_context(
		{"target_kind": "probe"},
		4.0
	)
	var source_payload: Dictionary = {"nested": {"value": 7}}
	troop._record_replay_telemetry("active_probe", source_payload)
	(source_payload["nested"] as Dictionary)["value"] = 99
	if troop.candidate_scan_count != 1:
		_fail("active telemetry did not perform exactly one candidate scan")
		return
	if not active_context.has("target_candidates"):
		_fail("active target context lost candidate telemetry")
		return
	if sink.events.size() != 1:
		_fail("active telemetry event count changed")
		return
	var recorded_payload: Dictionary = sink.events[0].get("payload", {})
	var recorded_nested: Dictionary = recorded_payload.get("nested", {})
	if int(recorded_nested.get("value", -1)) != 7:
		_fail("active telemetry no longer deep-duplicates payloads")
		return

	if not _verify_stable_prune(Necromancer.new(), "_summons", "_prune_summons"):
		return
	if not _verify_stable_prune(WindMage.new(), "_windlings", "_prune_windlings"):
		return
	if not _verify_dense_spatial_separation():
		return

	troop.free()
	sink.free()
	print("[CPU_OPTIMIZATION_PROBE] PASS")
	quit()


func _verify_stable_prune(owner: Node, array_property: String, method: String) -> bool:
	var first := SummonProbe.new()
	var dead := SummonProbe.new()
	var second := SummonProbe.new()
	var despawning := SummonProbe.new()
	var third := SummonProbe.new()
	dead._is_dead = true
	despawning._despawning = true
	var summons: Array[Node3D] = [first, dead, second, despawning, third]
	owner.set(array_property, summons)
	owner.call(method)
	var survivors: Array = owner.get(array_property)
	var order_is_stable: bool = (
		survivors.size() == 3
		and survivors[0] == first
		and survivors[1] == second
		and survivors[2] == third
	)
	owner.free()
	first.free()
	dead.free()
	second.free()
	despawning.free()
	third.free()
	if not order_is_stable:
		_fail("%s changed survivor order" % method)
		return false
	return true


func _verify_dense_spatial_separation() -> bool:
	var troops: Array[CandidateProbeTroop] = []
	for troop_index in range(BaseTroop.HIGH_DENSITY_TROOP_THRESHOLD + 2):
		var troop := CandidateProbeTroop.new()
		root.add_child(troop)
		troop.hp = 100
		troop.max_hp = 100
		troop.global_position = (
			Vector3.ZERO
			if troop_index < 2
			else Vector3(2.0 + float(troop_index), 0.0, 2.0)
		)
		troop.add_to_group("troops")
		troops.append(troop)
	BaseTroop.invalidate_troops_cache()
	var cached_troops: Array = BaseTroop._get_troops_cached()
	var first_push: Vector3 = troops[0]._compute_dense_troop_separation(
		troops[0].global_position,
		cached_troops
	)
	var second_push: Vector3 = troops[1]._compute_dense_troop_separation(
		troops[1].global_position,
		cached_troops
	)
	var pair_separates: bool = (
		first_push.length_squared() > 0.01
		and second_push.length_squared() > 0.01
		and first_push.dot(second_push) < -0.99
	)
	for troop in troops:
		troop.free()
	BaseTroop.invalidate_troops_cache()
	if not pair_separates:
		_fail("dense spatial hash did not separate exact overlaps symmetrically")
		return false
	return true


func _fail(message: String) -> void:
	push_error("[CPU_OPTIMIZATION_PROBE] FAIL %s" % message)
	quit(1)
