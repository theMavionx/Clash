extends SceneTree
## Runs deterministic production replay actions through the real Godot combat
## scene and compares the outcome with server/combat_session.js fixtures.

const TEST_SCENE_PATH: String = "res://scenes/TestMain.tscn"
const MAX_SIMULATION_FRAMES: int = 12000
const RESULT_POLL_FRAMES: int = 2
const TOWN_HALL_HP_TOLERANCE: float = 0.08
const DESTROYED_BUILDING_TOLERANCE: int = 2
const DURATION_TOLERANCE_SEC: float = 12.0

var _test_scene: Node


func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	var options := _parse_options(OS.get_cmdline_user_args())
	var fixture_path: String = str(options.get("fixtures", "")).strip_edges()
	var output_path: String = str(options.get("out", "")).strip_edges()
	var run_label: String = str(options.get("run-label", "")).strip_edges()
	var requested_render_fps: int = maxi(0, int(options.get("render-fps", 0)))
	if fixture_path.is_empty():
		push_error("[SERVER_GODOT_PARITY] Missing --fixtures=<absolute JSON path>.")
		quit(1)
		return
	if output_path.is_empty():
		output_path = fixture_path.get_basename() + "-godot.json"

	var fixture_data := _read_json_file(fixture_path)
	var scenarios: Array = fixture_data.get("scenarios", [])
	if scenarios.is_empty():
		push_error("[SERVER_GODOT_PARITY] Fixture file has no scenarios: %s" % fixture_path)
		quit(1)
		return

	var packed_scene: PackedScene = load(TEST_SCENE_PATH)
	if packed_scene == null:
		push_error("[SERVER_GODOT_PARITY] Could not load %s." % TEST_SCENE_PATH)
		quit(1)
		return

	var results: Array[Dictionary] = []
	for scenario_index in scenarios.size():
		var raw_scenario: Variant = scenarios[scenario_index]
		if not raw_scenario is Dictionary:
			continue
		_test_scene = packed_scene.instantiate()
		var warmup: Node = _test_scene.get_node_or_null("Warmup")
		if warmup != null:
			warmup.free()
		var test_harness: Node = _test_scene.get_node_or_null("TestSceneHarness")
		if test_harness != null:
			test_harness.free()
		root.add_child(_test_scene)
		current_scene = _test_scene
		for _frame in 4:
			await process_frame

		var main_building_system: Node = _test_scene.get_node_or_null(
			"BuildingSystem"
		)
		var attack_system: Node = _test_scene.get_node_or_null("AttackSystem")
		if main_building_system == null or attack_system == null:
			results.append(
				_failed_case(raw_scenario, "TestMain combat systems are missing.")
			)
			await _destroy_test_scene()
			continue
		var result: Dictionary = await _run_case(
			raw_scenario,
			main_building_system,
			attack_system
		)
		results.append(result)
		print(
			(
				"[SERVER_GODOT_PARITY] case=%d/%d id=%s server=%s godot=%s "
				+ "th_error=%.3f destroyed_error=%d duration_error=%.2f"
			) % [
				scenario_index + 1,
				scenarios.size(),
				str(result.get("id", "")),
				str(result.get("serverResult", "")),
				str(result.get("godotResult", "")),
				float(result.get("townHallHpAbsError", 0.0)),
				int(result.get("destroyedBuildingsAbsError", 0)),
				float(result.get("durationAbsErrorSec", 0.0)),
			]
		)
		await _destroy_test_scene()

	var summary := _summarize(results)
	var output := {
		"generatedAt": Time.get_datetime_string_from_system(true),
		"fixturePath": fixture_path,
		"runLabel": run_label,
		"requestedRenderFps": requested_render_fps,
		"combatPhysicsTicksPerSecond": BSBattle.REPLAY_SYNC_FPS,
		"engineVersion": Engine.get_version_info(),
		"thresholds": {
			"townHallHpTolerance": TOWN_HALL_HP_TOLERANCE,
			"destroyedBuildingTolerance": DESTROYED_BUILDING_TOLERANCE,
			"durationToleranceSec": DURATION_TOLERANCE_SEC,
		},
		"summary": summary,
		"results": results,
	}
	var write_error := _write_json_file(output_path, output)
	if write_error != OK:
		push_error(
			"[SERVER_GODOT_PARITY] Could not write %s: %s"
			% [output_path, error_string(write_error)]
		)
		quit(1)
		return

	print(
		(
			"[SERVER_GODOT_PARITY] COMPLETE cases=%d outcome_agreement=%.1f%% "
			+ "strict_agreement=%.1f%% th_mae=%.3f destroyed_mae=%.3f "
			+ "duration_mae=%.2fs output=%s"
		) % [
			int(summary.get("cases", 0)),
			float(summary.get("outcomeAgreement", 0.0)) * 100.0,
			float(summary.get("strictAgreement", 0.0)) * 100.0,
			float(summary.get("townHallHpMae", 0.0)),
			float(summary.get("destroyedBuildingsMae", 0.0)),
			float(summary.get("durationMaeSec", 0.0)),
			output_path,
		]
	)
	quit(0)


func _destroy_test_scene() -> void:
	if is_instance_valid(_test_scene):
		_test_scene.queue_free()
	_test_scene = null
	current_scene = null
	for _frame in 4:
		await process_frame
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()


func _run_case(
	scenario: Dictionary,
	main_building_system: Node,
	attack_system: Node
) -> Dictionary:
	attack_system.call("cleanup_combat_nodes")
	for _frame in 3:
		await process_frame

	var battle: Variant = main_building_system.get("_battle")
	if battle == null:
		return _failed_case(scenario, "Main BSBattle is missing.")
	battle.call("reset")
	battle.call("_lock_replay_clock")

	var altar_levels: Dictionary = scenario.get("defenderAltarLevels", {})
	for raw_system in get_nodes_in_group("building_systems"):
		var building_system: Node = raw_system
		if not is_instance_valid(building_system):
			continue
		var system_battle: Variant = building_system.get("_battle")
		if system_battle != null:
			system_battle.call("reset")
			system_battle.set("is_viewing_enemy", true)
		building_system.set("is_viewing_enemy", true)
		building_system.set("_has_applied_buildings_state", false)
		building_system.set("_last_applied_buildings_signature", "")
		building_system.call("_destroy_all_buildings")
		building_system.call(
			"_load_altar_skill_levels_from_server",
			{
				"prosperity": int(altar_levels.get("prosperity", 0)),
				"ward": int(altar_levels.get("ward", 0)),
				"glory": int(altar_levels.get("glory", 0)),
			}
		)
		building_system.call(
			"_load_buildings_from_server",
			scenario.get("buildings", [])
		)
		building_system.call(
			"_load_altar_skill_levels_from_server",
			{
				"prosperity": int(altar_levels.get("prosperity", 0)),
				"ward": int(altar_levels.get("ward", 0)),
				"glory": int(altar_levels.get("glory", 0)),
			}
		)

	var troop_levels: Dictionary = scenario.get("troopLevels", {})
	for raw_type in troop_levels:
		var troop_key: String = AttackSystem._normalize_troop_entry(str(raw_type))
		main_building_system.troop_levels[troop_key] = int(troop_levels[raw_type])

	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()

	var actions: Array = scenario.get("actions", [])
	var replay_fleet: Array = battle.call("_replay_fleet_from_actions", actions)
	var ship_level: int = clampi(int(scenario.get("serverShipLevel", 1)), 1, 6)
	if not replay_fleet.is_empty():
		replay_fleet[0]["level"] = ship_level
	attack_system.call("enter_replay_mode", replay_fleet)
	_reset_ship_abilities(main_building_system, ship_level)

	battle.set("_replay_active", true)
	battle.set("_victory_declared", false)
	battle.set("_replay_actions", actions)
	battle.set("_replay_duration", 180.0)
	battle.set("_replay_elapsed", 0.0)
	battle.set("_replay_timer_last_remaining", -1)
	battle.set("_replay_telemetry", [])
	battle.set("_replay_telemetry_seq", 0)
	battle.set("_replay_telemetry_dropped", 0)
	battle.set("_replay_chain_destroying", false)
	battle.set("_replay_wall_start_msec", Time.get_ticks_msec())
	battle.set(
		"enemy_info",
		{
			"name": "Parity Defender",
			"buildings": scenario.get("buildings", []),
		}
	)

	var initial_ids: Dictionary = {}
	for raw_building in scenario.get("buildings", []):
		if raw_building is Dictionary:
			initial_ids[int(raw_building.get("id", -1))] = str(
				raw_building.get("type", "")
			)

	battle.call("_replay_playback")
	var frames_elapsed := 0
	var saw_live_troops := false
	var godot_result := ""
	while frames_elapsed < MAX_SIMULATION_FRAMES:
		for _poll_frame in RESULT_POLL_FRAMES:
			await physics_frame
			frames_elapsed += 1
		var live_troops := _live_troop_count()
		saw_live_troops = saw_live_troops or live_troops > 0
		if bool(battle.get("_victory_declared")):
			godot_result = "victory"
			break
		if (
			saw_live_troops
			and live_troops == 0
			and float(battle.get("_replay_elapsed")) > _last_deploy_time(actions) + 0.5
		):
			godot_result = "defeat"
			break
		if float(battle.get("_replay_elapsed")) >= 179.99:
			godot_result = "defeat"
			break
		if not bool(battle.get("_replay_active")):
			godot_result = "victory" if not _town_hall_alive() else "defeat"
			break

	var observed := _capture_observed_result(
		initial_ids,
		float(battle.get("_replay_elapsed")),
		godot_result
	)
	observed["telemetry"] = _telemetry_summary(
		battle.get("_replay_telemetry")
	)
	if godot_result.is_empty():
		observed["error"] = "Godot combat exceeded the parity frame budget."
		observed["godotResult"] = "timeout"

	battle.set("_replay_active", false)
	battle.set("_replay_chain_destroying", false)
	battle.call("_restore_replay_clock")
	attack_system.call("cleanup_combat_nodes")
	for raw_system in get_nodes_in_group("building_systems"):
		var building_system: Node = raw_system
		if is_instance_valid(building_system):
			building_system.call("_destroy_all_buildings")
			building_system.set("is_viewing_enemy", false)
	for _frame in 3:
		await process_frame

	return _compare_case(scenario, observed)


func _reset_ship_abilities(building_system: Node, ship_level: int) -> void:
	for property_name in [
		"_cannon",
		"_rally",
		"_medkit",
		"_freeze",
		"_rage",
		"_skeleton_barrel",
	]:
		var ability: Variant = building_system.get(property_name)
		if ability == null or not ability.has_method("reset"):
			continue
		if property_name in ["_cannon", "_medkit", "_freeze", "_rage", "_skeleton_barrel"]:
			ability.call("reset", ship_level)
		else:
			ability.call("reset")


func _capture_observed_result(
	initial_ids: Dictionary,
	duration_sec: float,
	godot_result: String
) -> Dictionary:
	var alive_ids: Dictionary = {}
	var town_hall_hp := 0
	var town_hall_max_hp := 1
	for raw_system in get_nodes_in_group("building_systems"):
		var building_system: Node = raw_system
		if not is_instance_valid(building_system):
			continue
		for raw_building in building_system.get("placed_buildings"):
			if not raw_building is Dictionary:
				continue
			var server_id := int(raw_building.get("server_id", -1))
			var hp := maxi(0, int(raw_building.get("hp", 0)))
			if hp > 0:
				alive_ids[server_id] = true
			if str(raw_building.get("id", "")) == "town_hall":
				town_hall_hp = hp
				town_hall_max_hp = maxi(1, int(raw_building.get("max_hp", 1)))
	var destroyed := 0
	for server_id in initial_ids:
		if not alive_ids.has(server_id):
			destroyed += 1
	return {
		"godotResult": godot_result,
		"durationSec": snappedf(duration_sec, 0.001),
		"buildingsDestroyed": destroyed,
		"townHallHpPct": snappedf(
			float(town_hall_hp) / float(town_hall_max_hp),
			0.0001
		),
		"troopsAlive": _live_troop_count(),
	}


func _telemetry_summary(raw_events: Variant) -> Dictionary:
	var events: Array = raw_events if raw_events is Array else []
	var counts: Dictionary = {}
	var important_events: Array[Dictionary] = []
	for raw_event in events:
		if not raw_event is Dictionary:
			continue
		var kind := str(raw_event.get("kind", "unknown"))
		counts[kind] = int(counts.get(kind, 0)) + 1
		if kind in [
			"troop_spawn",
			"troop_death",
			"building_damage",
			"building_destroyed",
			"defense_fire",
			"defense_projectile_hit",
			"shark_trap_trigger",
			"necromancer_summon",
			"wind_mage_summon",
			"troop_split_spawn",
			"replay_outcome_detected",
		] and important_events.size() < 300:
			important_events.append(raw_event.duplicate(true))
	return {
		"eventCount": events.size(),
		"counts": counts,
		"importantEvents": important_events,
	}


func _compare_case(scenario: Dictionary, observed: Dictionary) -> Dictionary:
	var expected: Dictionary = scenario.get("expected", {})
	var server_result := str(expected.get("resolvedResult", "")).to_lower()
	var godot_result := str(observed.get("godotResult", "")).to_lower()
	var th_error := absf(
		float(expected.get("townHallHpPct", 1.0))
		- float(observed.get("townHallHpPct", 1.0))
	)
	var destroyed_error := absi(
		int(expected.get("buildingsDestroyed", 0))
		- int(observed.get("buildingsDestroyed", 0))
	)
	var duration_error := absf(
		float(expected.get("durationSec", 0.0))
		- float(observed.get("durationSec", 0.0))
	)
	var outcome_match := server_result == godot_result
	var strict_match := (
		outcome_match
		and th_error <= TOWN_HALL_HP_TOLERANCE
		and destroyed_error <= DESTROYED_BUILDING_TOLERANCE
		and duration_error <= DURATION_TOLERANCE_SEC
	)
	return {
		"id": str(scenario.get("id", "")),
		"matchup": str(scenario.get("matchup", "")),
		"baseId": str(scenario.get("baseId", "")),
		"armyId": str(scenario.get("armyId", "")),
		"spawnProfile": str(scenario.get("spawnProfile", "")),
		"tactics": str(scenario.get("tactics", "")),
		"serverResult": server_result,
		"godotResult": godot_result,
		"outcomeMatch": outcome_match,
		"strictMatch": strict_match,
		"server": expected,
		"godot": observed,
		"townHallHpAbsError": snappedf(th_error, 0.0001),
		"destroyedBuildingsAbsError": destroyed_error,
		"durationAbsErrorSec": snappedf(duration_error, 0.001),
		"error": str(observed.get("error", "")),
	}


func _failed_case(scenario: Dictionary, message: String) -> Dictionary:
	return {
		"id": str(scenario.get("id", "")),
		"matchup": str(scenario.get("matchup", "")),
		"serverResult": str(
			scenario.get("expected", {}).get("resolvedResult", "")
		).to_lower(),
		"godotResult": "error",
		"outcomeMatch": false,
		"strictMatch": false,
		"townHallHpAbsError": 1.0,
		"destroyedBuildingsAbsError": int(
			scenario.get("expected", {}).get("buildingsDestroyed", 0)
		),
		"durationAbsErrorSec": float(
			scenario.get("expected", {}).get("durationSec", 0.0)
		),
		"error": message,
	}


func _summarize(results: Array[Dictionary]) -> Dictionary:
	var cases := results.size()
	var outcome_matches := 0
	var strict_matches := 0
	var town_hall_error_sum := 0.0
	var destroyed_error_sum := 0.0
	var duration_error_sum := 0.0
	var by_matchup: Dictionary = {}
	for result in results:
		if bool(result.get("outcomeMatch", false)):
			outcome_matches += 1
		if bool(result.get("strictMatch", false)):
			strict_matches += 1
		town_hall_error_sum += float(result.get("townHallHpAbsError", 0.0))
		destroyed_error_sum += float(result.get("destroyedBuildingsAbsError", 0.0))
		duration_error_sum += float(result.get("durationAbsErrorSec", 0.0))
		var matchup := str(result.get("matchup", "unknown"))
		var bucket: Dictionary = by_matchup.get(
			matchup,
			{"cases": 0, "outcomeMatches": 0, "strictMatches": 0}
		)
		bucket["cases"] = int(bucket.get("cases", 0)) + 1
		bucket["outcomeMatches"] = int(bucket.get("outcomeMatches", 0)) + int(
			bool(result.get("outcomeMatch", false))
		)
		bucket["strictMatches"] = int(bucket.get("strictMatches", 0)) + int(
			bool(result.get("strictMatch", false))
		)
		by_matchup[matchup] = bucket
	for matchup in by_matchup:
		var bucket: Dictionary = by_matchup[matchup]
		var bucket_cases := maxi(1, int(bucket.get("cases", 0)))
		bucket["outcomeAgreement"] = (
			float(bucket.get("outcomeMatches", 0)) / float(bucket_cases)
		)
		bucket["strictAgreement"] = (
			float(bucket.get("strictMatches", 0)) / float(bucket_cases)
		)
	return {
		"cases": cases,
		"outcomeMatches": outcome_matches,
		"strictMatches": strict_matches,
		"outcomeAgreement": (
			float(outcome_matches) / float(cases) if cases > 0 else 0.0
		),
		"strictAgreement": (
			float(strict_matches) / float(cases) if cases > 0 else 0.0
		),
		"townHallHpMae": town_hall_error_sum / float(cases) if cases > 0 else 0.0,
		"destroyedBuildingsMae": (
			destroyed_error_sum / float(cases) if cases > 0 else 0.0
		),
		"durationMaeSec": duration_error_sum / float(cases) if cases > 0 else 0.0,
		"byMatchup": by_matchup,
	}


func _live_troop_count() -> int:
	var count := 0
	for troop in get_nodes_in_group("troops"):
		if BaseTroop.is_live_troop(troop):
			count += 1
	return count


func _town_hall_alive() -> bool:
	for raw_system in get_nodes_in_group("building_systems"):
		var building_system: Node = raw_system
		if not is_instance_valid(building_system):
			continue
		for raw_building in building_system.get("placed_buildings"):
			if (
				raw_building is Dictionary
				and str(raw_building.get("id", "")) == "town_hall"
				and int(raw_building.get("hp", 0)) > 0
			):
				return true
	return false


func _last_deploy_time(actions: Array) -> float:
	var last_time := 0.0
	for raw_action in actions:
		if (
			raw_action is Dictionary
			and str(raw_action.get("type", "")) in ["deploy_troop", "place_ship"]
		):
			last_time = maxf(last_time, float(raw_action.get("t", 0.0)))
	return last_time


func _parse_options(arguments: PackedStringArray) -> Dictionary:
	var options: Dictionary = {}
	for argument in arguments:
		var text := str(argument)
		if text.begins_with("--fixtures="):
			options["fixtures"] = text.trim_prefix("--fixtures=")
		elif text.begins_with("--out="):
			options["out"] = text.trim_prefix("--out=")
		elif text.begins_with("--run-label="):
			options["run-label"] = text.trim_prefix("--run-label=")
		elif text.begins_with("--render-fps="):
			options["render-fps"] = text.trim_prefix("--render-fps=")
	return options


func _read_json_file(file_path: String) -> Dictionary:
	var file := FileAccess.open(file_path, FileAccess.READ)
	if file == null:
		return {}
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	return parsed if parsed is Dictionary else {}


func _write_json_file(file_path: String, data: Dictionary) -> Error:
	var file := FileAccess.open(file_path, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_string(JSON.stringify(data, "\t") + "\n")
	return OK
