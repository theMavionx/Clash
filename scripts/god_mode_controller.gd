extends Node
## Production-safe God Mode Studio controller.
##
## This node owns only local sandbox state. The inherited BuildingSystems run
## with test_mode=true, which nulls their network client and bypasses economy,
## unlock, Town Hall, upgrade, and count gates. No normal account mutation is
## issued from this controller.

const STATE_EVENT := "clash-god-mode-state"
const STATE_INTERVAL_SEC := 0.25
const LARGE_ARMY_WARNING := 1000
const SETUP_MUTATION_COMMANDS: Array[String] = [
	"place_building",
	"upgrade_selected",
	"duplicate_selected",
	"delete_selected",
	"clear_base",
	"build_showcase",
	"set_army",
	"army_preset",
	"start_self_attack",
]

const TROOP_ORDER: Array[String] = [
	"Knight",
	"Mage",
	"Archer",
	"PeaShooter",
	"Mimic",
	"Necromancer",
	"Horror",
	"MechanicalDragon",
	"IceGolem",
	"WindMage",
	"DemonKing",
	"FireDragon",
]

const CAMERA_PRESETS: Array[Dictionary] = [
	{
		"name": "Current Wide",
		"projection": "perspective",
		"pitch": 55.0,
		"fov": 58.0,
		"zoom": 7.3,
		"focus": Vector3.ZERO,
	},
	{
		"name": "CoC Balanced",
		"projection": "perspective",
		"pitch": 58.0,
		"fov": 42.0,
		"zoom": 8.0,
		"focus": Vector3.ZERO,
	},
	{
		"name": "CoC Close",
		"projection": "perspective",
		"pitch": 60.0,
		"fov": 38.0,
		"zoom": 8.7,
		"focus": Vector3(0.0, 0.0, -0.10),
	},
	{
		"name": "CoC Overview",
		"projection": "perspective",
		"pitch": 64.0,
		"fov": 46.0,
		"zoom": 8.5,
		"focus": Vector3.ZERO,
	},
	{
		"name": "Boom Tactical",
		"projection": "perspective",
		"pitch": 51.0,
		"fov": 38.0,
		"zoom": 7.8,
		"focus": Vector3(0.30, 0.0, 0.35),
	},
	{
		"name": "Boom Wide",
		"projection": "perspective",
		"pitch": 49.0,
		"fov": 44.0,
		"zoom": 7.0,
		"focus": Vector3(0.35, 0.0, 0.45),
	},
	{
		"name": "Classic Ortho",
		"projection": "orthogonal",
		"pitch": 56.0,
		"size": 6.7,
		"zoom": 8.0,
		"focus": Vector3.ZERO,
	},
	{
		"name": "Close Ortho",
		"projection": "orthogonal",
		"pitch": 60.0,
		"size": 5.9,
		"zoom": 8.0,
		"focus": Vector3(0.0, 0.0, -0.10),
	},
	{
		"name": "Cinematic Low",
		"projection": "perspective",
		"pitch": 44.0,
		"fov": 34.0,
		"zoom": 7.5,
		"focus": Vector3(0.25, 0.0, 0.35),
	},
	{
		"name": "Dense Island",
		"projection": "perspective",
		"pitch": 57.0,
		"fov": 32.0,
		"zoom": 8.8,
		"focus": Vector3.ZERO,
	},
]

var _bridge: Node = null
var _main_bs: Node = null
var _attack: Node = null
var _status := "Studio ready. Build a set, load an army, then attack this base."
var _phase := "build"
var _state_elapsed := STATE_INTERVAL_SEC
var _state_dirty := true
var _army_counts: Dictionary = {}
var _army_levels: Dictionary = {}
var _snapshot: Array[Dictionary] = []
var _snapshot_available := false
var _pending_placement: Dictionary = {}
var _camera_index := 1
var _speed := 1.0
var _speed_before_pause := 1.0
var _paused := false
var _clean_frame := false
var _safe_frame := false
var _operation_busy := false
var _battle_active := false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	if not _is_authorized_runtime():
		push_error("GodModeController rejected a runtime without the authorized page marker")
		get_tree().change_scene_to_file("res://scenes/Main.tscn")
		return
	_bridge = get_node_or_null("/root/Bridge")
	if _bridge and _bridge.has_signal("react_message"):
		_bridge.react_message.connect(_on_react_message)
	call_deferred("_finish_setup")


func _finish_setup() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	_main_bs = _find_main_building_system()
	_attack = get_node_or_null("../AttackSystem")
	_configure_isolated_building_systems()
	_initialize_army()
	_apply_camera_preset(_camera_index, false)
	_set_status("Studio ready. This sandbox never changes your live account.")
	if OS.get_cmdline_user_args().has("--verify-god-mode"):
		call_deferred("_verify_god_mode_flow")


func _exit_tree() -> void:
	if _bridge and _bridge.has_signal("react_message") and _bridge.react_message.is_connected(_on_react_message):
		_bridge.react_message.disconnect(_on_react_message)
	if _paused:
		get_tree().paused = false
	Engine.time_scale = 1.0


func _is_authorized_runtime() -> bool:
	if not OS.has_feature("web"):
		return true
	return bool(JavaScriptBridge.eval("Boolean(window.__CLASH_GOD_MODE_GRANTED__ === true)", true))


func _process(delta: float) -> void:
	_check_pending_placement_level()
	_state_elapsed += delta
	if _state_dirty or _state_elapsed >= STATE_INTERVAL_SEC:
		_state_elapsed = 0.0
		_state_dirty = false
		_dispatch_state()


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventKey):
		return
	var key := event as InputEventKey
	if not key.pressed or key.echo:
		return
	match key.keycode:
		KEY_F1:
			if OS.has_feature("web"):
				return
			_set_clean_frame(not _clean_frame)
			get_viewport().set_input_as_handled()
		KEY_D:
			if key.ctrl_pressed:
				if _setup_mutation_allowed():
					_duplicate_selected()
				get_viewport().set_input_as_handled()
		KEY_DELETE:
			if _setup_mutation_allowed():
				_delete_selected()
			get_viewport().set_input_as_handled()
		KEY_ESCAPE:
			if _clean_frame:
				_set_clean_frame(false)
			else:
				_cancel_placement()
			get_viewport().set_input_as_handled()


func _on_react_message(action: String, data: Dictionary) -> void:
	if action != "god_mode_command":
		return
	var command := str(data.get("command", ""))
	if command in SETUP_MUTATION_COMMANDS and not _setup_mutation_allowed():
		return
	match command:
		"place_building":
			_start_building_placement(
				str(data.get("building_id", "")),
				int(data.get("level", 1))
			)
		"upgrade_selected":
			_upgrade_selected()
		"duplicate_selected":
			_duplicate_selected()
		"delete_selected":
			_delete_selected()
		"clear_base":
			_clear_sandbox(true)
		"build_showcase":
			_build_showcase()
		"set_army":
			_set_army_entry(
				str(data.get("troop", "")),
				int(data.get("count", 0)),
				int(data.get("level", 1))
			)
		"army_preset":
			_apply_army_preset(str(data.get("preset", "")))
		"start_self_attack":
			_start_self_attack()
		"restore_take":
			_restore_take()
		"select_troop_group":
			_select_troop_group(int(data.get("index", 0)))
		"set_camera":
			_apply_camera_preset(int(data.get("index", 0)))
		"set_speed":
			_set_speed(float(data.get("speed", 1.0)))
		"toggle_pause":
			_set_paused(not _paused)
		"set_clean_frame":
			_set_clean_frame(bool(data.get("enabled", false)))
		"set_safe_frame":
			_safe_frame = bool(data.get("enabled", false))
			_state_dirty = true


func _setup_mutation_allowed() -> bool:
	if _operation_busy:
		_set_status("Studio is preparing the current take. Please wait.")
		return false
	if _battle_active:
		_set_status("Restore the current take before changing the base or army.")
		return false
	return true


func _configure_isolated_building_systems() -> void:
	for bs in _building_systems():
		bs.set("test_mode", true)
		bs.set("_net", null)
		if bool(bs.get("create_ui")):
			bs.set("allowed_buildings", PackedStringArray())
			bs.set("blocked_buildings", PackedStringArray(["flag"]))
		else:
			bs.set("allowed_buildings", PackedStringArray(["flag"]))
			bs.set("blocked_buildings", PackedStringArray())
		var native_canvas = bs.get("canvas")
		if native_canvas is CanvasLayer:
			(native_canvas as CanvasLayer).visible = false


func _building_systems() -> Array:
	return get_tree().get_nodes_in_group("building_systems")


func _find_main_building_system() -> Node:
	for bs in _building_systems():
		if bool(bs.get("create_ui")):
			return bs
	return null


func _building_catalog() -> Array[Dictionary]:
	var catalog: Array[Dictionary] = []
	if not is_instance_valid(_main_bs):
		return catalog
	var defs: Dictionary = _main_bs.get("building_defs")
	for raw_id in defs.keys():
		var building_id := str(raw_id)
		var definition: Dictionary = defs.get(building_id, {})
		# Port is hidden from the normal shop because it is normally server-owned,
		# but it is a real combat building and belongs in this unrestricted kit.
		# Ruins and the ship flag are presentation helpers, not configurable base
		# structures, so keep only those two out of the Studio catalog.
		if building_id in ["flag", "ruins"]:
			continue
		catalog.append({
			"id": building_id,
			"name": str(definition.get("name", building_id.capitalize())),
			"max_level": _max_level_for_definition(definition),
		})
	catalog.sort_custom(func(left: Dictionary, right: Dictionary) -> bool:
		if str(left.id) == "town_hall":
			return str(right.id) != "town_hall"
		if str(right.id) == "town_hall":
			return false
		return str(left.name).naturalnocasecmp_to(str(right.name)) < 0
	)
	return catalog


func _start_building_placement(building_id: String, requested_level: int) -> void:
	if not is_instance_valid(_main_bs):
		_set_status("Building system is still loading.")
		return
	var defs: Dictionary = _main_bs.get("building_defs")
	if not defs.has(building_id) or building_id == "flag":
		_set_status("Unknown building: %s" % building_id)
		return
	var definition: Dictionary = defs[building_id]
	var target_level := clampi(requested_level, 1, _max_level_for_definition(definition))
	_pending_placement = {
		"building_id": building_id,
		"level": target_level,
		"known_nodes": _building_node_ids(building_id),
	}
	_main_bs.call("_start_placement", building_id)
	_phase = "build"
	_set_status("Place %s Lv.%d on the island." % [definition.get("name", building_id), target_level])


func _building_node_ids(building_id: String) -> Dictionary:
	var ids := {}
	for bs in _building_systems():
		for building in bs.get("placed_buildings"):
			if str(building.get("id", "")) != building_id:
				continue
			var node: Node = building.get("node", null)
			if is_instance_valid(node):
				ids[node.get_instance_id()] = true
	return ids


func _check_pending_placement_level() -> void:
	if _pending_placement.is_empty():
		return
	var building_id := str(_pending_placement.get("building_id", ""))
	var known_nodes: Dictionary = _pending_placement.get("known_nodes", {})
	for bs in _building_systems():
		for building in bs.get("placed_buildings"):
			if str(building.get("id", "")) != building_id:
				continue
			var node: Node = building.get("node", null)
			if not is_instance_valid(node) or known_nodes.has(node.get_instance_id()):
				continue
			_set_building_level_immediate(bs, building, int(_pending_placement.get("level", 1)))
			_pending_placement.clear()
			_set_status("%s placed. Select it to duplicate, upgrade, or delete." % _building_name(building_id))
			_state_dirty = true
			return


func _selected_context() -> Dictionary:
	for bs in _building_systems():
		var selected = bs.get("selected_building")
		if selected is Dictionary and not (selected as Dictionary).is_empty():
			return {"bs": bs, "building": selected}
	return {}


func _upgrade_selected() -> void:
	var context := _selected_context()
	if context.is_empty():
		_set_status("Select a building first.")
		return
	var bs: Node = context.bs
	var building: Dictionary = context.building
	var definition: Dictionary = bs.get("building_defs").get(str(building.get("id", "")), {})
	var level := int(building.get("level", 1))
	if level >= _max_level_for_definition(definition):
		_set_status("%s is already at its maximum level." % _building_name(str(building.get("id", ""))))
		return
	bs.call("_upgrade_selected")
	_set_status("Upgrading %s to Lv.%d." % [_building_name(str(building.get("id", ""))), level + 1])
	_state_dirty = true


func _duplicate_selected() -> void:
	var context := _selected_context()
	if context.is_empty():
		_set_status("Select a building to duplicate.")
		return
	var bs: Node = context.bs
	var source: Dictionary = context.building
	var building_id := str(source.get("id", ""))
	var definition: Dictionary = bs.get("building_defs").get(building_id, {})
	var free_position := _find_free_grid_position(bs, definition, source.get("grid_pos", Vector2i.ZERO))
	if free_position.x < 0:
		_set_status("No free area remains for another %s." % _building_name(building_id))
		return
	bs.call(
		"_spawn_building_locally",
		building_id,
		free_position,
		definition,
		-1,
		int(source.get("facing_step", -1))
	)
	var clone := _last_building_at(bs, building_id, free_position)
	if not clone.is_empty():
		_set_building_level_immediate(bs, clone, int(source.get("level", 1)))
		bs.call("_select_building", clone)
	_set_status("Duplicated %s. God Mode has no per-building count limit." % _building_name(building_id))
	_state_dirty = true


func _delete_selected() -> void:
	var context := _selected_context()
	if context.is_empty():
		_set_status("Select a building to delete.")
		return
	var bs: Node = context.bs
	var building: Dictionary = context.building
	var name := _building_name(str(building.get("id", "")))
	bs.call("remove_building", building)
	_set_status("Deleted %s from this local set." % name)
	_state_dirty = true


func _cancel_placement() -> void:
	_pending_placement.clear()
	for bs in _building_systems():
		if bs.has_method("_cancel_placement"):
			bs.call("_cancel_placement")
	_set_status("Placement cancelled.")


func _clear_sandbox(clear_snapshot: bool) -> void:
	_battle_active = false
	if _paused:
		_paused = false
		get_tree().paused = false
	Engine.time_scale = _speed
	if is_instance_valid(_attack):
		if _attack.has_method("exit_attack_mode"):
			_attack.call("exit_attack_mode")
		if _attack.has_method("cleanup_combat_nodes"):
			_attack.call("cleanup_combat_nodes")
	for bs in _building_systems():
		var battle = bs.get("_battle")
		if battle and battle.has_method("reset"):
			battle.reset()
		bs.set("is_viewing_enemy", false)
		if bs.has_method("_destroy_all_buildings"):
			bs.call("_destroy_all_buildings")
	if clear_snapshot:
		_snapshot.clear()
		_snapshot_available = false
	_pending_placement.clear()
	_phase = "build"
	_set_status("Sandbox cleared. Your live village was not touched.")


func _build_showcase() -> void:
	_clear_sandbox(true)
	if not is_instance_valid(_main_bs):
		return
	var placed := 0
	var defs: Dictionary = _main_bs.get("building_defs")
	for row in _building_catalog():
		var building_id := str(row.id)
		var definition: Dictionary = defs.get(building_id, {})
		var position := _find_free_grid_position(_main_bs, definition, Vector2i(14, 14))
		if position.x < 0:
			continue
		_main_bs.call("_spawn_building_locally", building_id, position, definition, -1)
		var building := _last_building_at(_main_bs, building_id, position)
		if not building.is_empty():
			_set_building_level_immediate(_main_bs, building, _max_level_for_definition(definition))
			placed += 1
	_set_status("Cinematic showcase ready: %d max-level buildings." % placed)
	_state_dirty = true


func _find_free_grid_position(bs: Node, definition: Dictionary, origin: Vector2i) -> Vector2i:
	if not is_instance_valid(bs) or definition.is_empty():
		return Vector2i(-1, -1)
	var cells: Vector2i = definition.get("cells", Vector2i.ONE)
	var max_x := int(bs.get("grid_width")) - cells.x
	var max_z := int(bs.get("grid_height")) - cells.y
	if max_x < 0 or max_z < 0:
		return Vector2i(-1, -1)
	var candidates: Array[Vector2i] = []
	for z in range(max_z + 1):
		for x in range(max_x + 1):
			candidates.append(Vector2i(x, z))
	candidates.sort_custom(func(left: Vector2i, right: Vector2i) -> bool:
		return left.distance_squared_to(origin) < right.distance_squared_to(origin)
	)
	for candidate in candidates:
		if bool(bs.call("_can_place", candidate, cells)):
			return candidate
	return Vector2i(-1, -1)


func _last_building_at(bs: Node, building_id: String, grid_position: Vector2i) -> Dictionary:
	var buildings: Array = bs.get("placed_buildings")
	for index in range(buildings.size() - 1, -1, -1):
		var building: Dictionary = buildings[index]
		if str(building.get("id", "")) == building_id and building.get("grid_pos", Vector2i.ZERO) == grid_position:
			return building
	return {}


func _set_building_level_immediate(bs: Node, building: Dictionary, target_level: int) -> void:
	var building_id := str(building.get("id", ""))
	var definition: Dictionary = bs.get("building_defs").get(building_id, {})
	var level := clampi(target_level, 1, _max_level_for_definition(definition))
	building["level"] = level
	building["max_hp"] = int(bs.call("_get_hp_for", definition, level))
	building["hp"] = building["max_hp"]
	var node: Node = building.get("node", null)
	if is_instance_valid(node):
		node.set_meta("building_level", level)
	if bs.has_method("_apply_building_runtime_level"):
		bs.call("_apply_building_runtime_level", building)


func _max_level_for_definition(definition: Dictionary) -> int:
	var hp_levels: Array = definition.get("hp_levels", [])
	return maxi(1, hp_levels.size() if not hp_levels.is_empty() else int(definition.get("max_level", 1)))


func _building_name(building_id: String) -> String:
	if is_instance_valid(_main_bs):
		var definition: Dictionary = _main_bs.get("building_defs").get(building_id, {})
		return str(definition.get("name", building_id.capitalize()))
	return building_id.capitalize()


func _initialize_army() -> void:
	for row in _troop_catalog():
		var troop := str(row.id)
		_army_counts[troop] = int(_army_counts.get(troop, 0))
		_army_levels[troop] = int(_army_levels.get(troop, row.max_level))


func _troop_catalog() -> Array[Dictionary]:
	var catalog: Array[Dictionary] = []
	if not is_instance_valid(_main_bs):
		return catalog
	var defs: Dictionary = _main_bs.get("troop_defs")
	var available: Array[String] = []
	for raw_name in defs.keys():
		var troop := str(raw_name)
		if AttackSystem.TROOP_DEFS.has(troop):
			available.append(troop)
	var ordered: Array[String] = []
	for troop in TROOP_ORDER:
		if available.has(troop):
			ordered.append(troop)
			available.erase(troop)
	available.sort()
	ordered.append_array(available)
	for troop in ordered:
		var definition: Dictionary = defs.get(troop, {})
		catalog.append({
			"id": troop,
			"name": str(definition.get("display", troop)),
			"max_level": maxi(1, int(definition.get("max_level", 1))),
			"count": maxi(0, int(_army_counts.get(troop, 0))),
			"level": clampi(
				int(_army_levels.get(troop, definition.get("max_level", 1))),
				1,
				maxi(1, int(definition.get("max_level", 1)))
			),
		})
	return catalog


func _set_army_entry(troop: String, count: int, level: int) -> void:
	var definition := _troop_definition(troop)
	if definition.is_empty():
		_set_status("Unknown unit: %s" % troop)
		return
	_army_counts[troop] = maxi(0, count)
	_army_levels[troop] = clampi(level, 1, maxi(1, int(definition.get("max_level", 1))))
	_phase = "army"
	var total := _army_total()
	if total >= LARGE_ARMY_WARNING:
		_set_status("%s units loaded. Very large armies keep their full quantity but may lower FPS." % _format_integer(total))
	else:
		_set_status("Army updated: %s units across %d types." % [_format_integer(total), _army_type_count()])
	_state_dirty = true


func _apply_army_preset(preset: String) -> void:
	var ground_swarm_units: Array[String] = [
		"Knight", "Mage", "Archer", "PeaShooter", "Mimic", "Necromancer",
		"Horror", "IceGolem", "WindMage", "DemonKing",
	]
	var air_raid_units: Array[String] = ["MechanicalDragon", "FireDragon"]
	for row in _troop_catalog():
		var troop := str(row.id)
		match preset:
			"one_each":
				_army_counts[troop] = 1
				_army_levels[troop] = int(row.max_level)
			"cinematic":
				_army_counts[troop] = 12 if troop in ["Knight", "Mage", "Archer", "PeaShooter"] else 4
				_army_levels[troop] = int(row.max_level)
			"ground_swarm":
				_army_counts[troop] = 30 if troop in ground_swarm_units else 0
				_army_levels[troop] = int(row.max_level)
			"air_raid":
				_army_counts[troop] = 24 if troop in air_raid_units else 0
				_army_levels[troop] = int(row.max_level)
			_:
				_army_counts[troop] = 0
	_phase = "army"
	_set_status("Army preset applied: %s." % ("clear" if preset == "clear" else preset.replace("_", " ")))
	_state_dirty = true


func _troop_definition(troop: String) -> Dictionary:
	if not is_instance_valid(_main_bs):
		return {}
	return _main_bs.get("troop_defs").get(troop, {})


func _army_total() -> int:
	var total := 0
	for count in _army_counts.values():
		total += maxi(0, int(count))
	return total


func _army_type_count() -> int:
	var total := 0
	for count in _army_counts.values():
		if int(count) > 0:
			total += 1
	return total


func _start_self_attack() -> void:
	if _operation_busy:
		return
	if _battle_active:
		_set_status("Restore the current take before starting it again.")
		return
	if _placed_building_count() <= 0:
		_set_status("Place at least one building before starting the take.")
		return
	if _army_total() <= 0:
		_set_status("Load at least one unit before starting the take.")
		return
	if not is_instance_valid(_attack):
		_set_status("Attack system is still loading.")
		return
	_operation_busy = true
	_snapshot = _capture_layout_snapshot()
	_snapshot_available = not _snapshot.is_empty()
	var fleet: Array = await _build_attack_fleet()
	if fleet.is_empty():
		_operation_busy = false
		_set_status("The army could not be prepared.")
		return
	_apply_army_levels_to_sandbox()
	_prepare_self_attack_battle(fleet)
	_battle_active = true
	_phase = "battle"
	_set_status("Main Ship approaching with %s units. Select a unit group, then click or hold on the landing grid." % _format_integer(_army_total()))
	_state_dirty = true
	await _attack.call("enter_attack_mode", fleet)
	_operation_busy = false
	_set_status("Self-attack live. Select a unit group and click or hold to deploy.")
	_state_dirty = true


func _build_attack_fleet() -> Array:
	var troops: Array[String] = []
	var appended := 0
	for row in _troop_catalog():
		var troop := str(row.id)
		var count := maxi(0, int(_army_counts.get(troop, 0)))
		var level := clampi(int(_army_levels.get(troop, 1)), 1, int(row.max_level))
		var entry := "%s:L%d" % [troop, level]
		for _index in count:
			troops.append(entry)
			appended += 1
			if appended % 500 == 0:
				await get_tree().process_frame
	if troops.is_empty():
		return []
	var controller := get_node_or_null("../MainShipController")
	if is_instance_valid(controller):
		controller.set_meta("ship_level", _max_ship_level())
		controller.set_meta("ship_capacity", troops.size())
		controller.set_meta("ship_troops", troops.duplicate())
		controller.set_meta("ship_troops_template", troops.duplicate())
	return [{
		"id": "god_mode_main_ship",
		"level": _max_ship_level(),
		"capacity": troops.size(),
		"troops": troops,
		"god_mode": true,
	}]


func _max_ship_level() -> int:
	var level := 1
	for raw_level in BuildingSystem.PLAYER_SHIP_LEVELS.keys():
		level = maxi(level, int(raw_level))
	return level


func _apply_army_levels_to_sandbox() -> void:
	for bs in _building_systems():
		var levels: Dictionary = bs.get("troop_levels")
		for troop in _army_levels:
			levels[troop] = int(_army_levels[troop])


func _prepare_self_attack_battle(fleet: Array) -> void:
	var now_sec := Time.get_ticks_msec() / 1000.0
	for bs in _building_systems():
		if bs.has_method("prepare_enemy_attack_presentation"):
			bs.call("prepare_enemy_attack_presentation")
		else:
			bs.set("is_viewing_enemy", true)
		var battle = bs.get("_battle")
		if battle == null:
			continue
		battle.set("_replay_active", false)
		battle.set("_victory_declared", false)
		battle.set("_battle_timer", 0.0)
		battle.set("_battle_timer_active", false)
		battle.set("_battle_start_time", now_sec)
		battle.set("_saved_fleet", fleet.duplicate(true))
		battle.set("_had_troops", false)
		battle.set("enemy_info", {
			"id": "god-mode-self",
			"name": "God Mode Set",
			"battle_session_id": "god-mode-local",
		})


func _capture_layout_snapshot() -> Array[Dictionary]:
	var snapshot: Array[Dictionary] = []
	for bs in _building_systems():
		var grid_index := int(bs.call("_get_grid_index"))
		for building in bs.get("placed_buildings"):
			var grid_position: Vector2i = building.get("grid_pos", Vector2i.ZERO)
			var facing_value: Variant = building.get("facing_step", null)
			snapshot.append({
				"grid_index": grid_index,
				"id": str(building.get("id", "")),
				"level": int(building.get("level", 1)),
				"grid_x": grid_position.x,
				"grid_z": grid_position.y,
				"facing_step": -1 if facing_value == null else int(facing_value),
			})
	return snapshot


func _restore_take() -> void:
	if _snapshot.is_empty():
		_set_status("Start a self-attack first to create a take snapshot.")
		return
	var saved := _snapshot.duplicate(true)
	_clear_sandbox(false)
	for row in saved:
		var bs := _building_system_for_grid_index(int(row.get("grid_index", 0)))
		if not is_instance_valid(bs):
			continue
		var building_id := str(row.get("id", ""))
		var definition: Dictionary = bs.get("building_defs").get(building_id, {})
		if definition.is_empty():
			continue
		var grid_position := Vector2i(int(row.get("grid_x", 0)), int(row.get("grid_z", 0)))
		bs.call("_spawn_building_locally", building_id, grid_position, definition, -1, int(row.get("facing_step", -1)))
		var building := _last_building_at(bs, building_id, grid_position)
		if not building.is_empty():
			_set_building_level_immediate(bs, building, int(row.get("level", 1)))
	_snapshot = saved
	_snapshot_available = true
	_phase = "build"
	_set_status("Take restored. The same base and army are ready to record again.")
	_state_dirty = true


func _building_system_for_grid_index(grid_index: int) -> Node:
	for bs in _building_systems():
		if int(bs.call("_get_grid_index")) == grid_index:
			return bs
	return null


func _select_troop_group(index: int) -> void:
	if not is_instance_valid(_attack) or not _attack.has_method("select_troop_group"):
		return
	_attack.call("select_troop_group", index)
	_state_dirty = true


func _apply_camera_preset(index: int, report_status: bool = true) -> void:
	var scene := get_tree().current_scene
	var rig: Node3D = scene.get_node_or_null("CameraRig") as Node3D if scene else null
	var pivot: Node3D = rig.get_node_or_null("PitchPivot") as Node3D if rig else null
	var camera: Camera3D = pivot.get_node_or_null("Camera3D") as Camera3D if pivot else null
	if not is_instance_valid(rig) or not is_instance_valid(pivot) or not is_instance_valid(camera):
		if report_status:
			_set_status("Camera is still loading.")
		return
	_camera_index = clampi(index, 0, CAMERA_PRESETS.size() - 1)
	var preset: Dictionary = CAMERA_PRESETS[_camera_index]
	var pitch := float(preset.get("pitch", 55.0))
	var zoom := float(preset.get("zoom", 7.3))
	var focus: Vector3 = preset.get("focus", Vector3.ZERO)
	rig.set("camera_pitch", pitch)
	rig.set("max_zoom", maxf(float(rig.get("max_zoom")), zoom + 0.5))
	rig.global_position = focus
	rig.set("_target_position", focus)
	rig.set("_target_zoom", zoom)
	rig.set("_current_zoom", zoom)
	rig.call("_apply_zoom_distance")
	rig.rotation_degrees.y = 0.0
	pivot.rotation_degrees.x = -pitch
	if str(preset.get("projection", "perspective")) == "orthogonal":
		camera.projection = Camera3D.PROJECTION_ORTHOGONAL
		camera.size = float(preset.get("size", 6.7))
	else:
		camera.projection = Camera3D.PROJECTION_PERSPECTIVE
		camera.fov = float(preset.get("fov", 58.0))
	camera.current = true
	if not _battle_active:
		_phase = "camera"
	if report_status:
		_set_status("Camera: %s." % str(preset.get("name", "Preset")))
	_state_dirty = true


func _set_speed(next_speed: float) -> void:
	_speed = clampf(next_speed, 0.25, 8.0)
	if not _paused:
		Engine.time_scale = _speed
	_set_status("Playback speed: %s." % _format_speed(_speed))
	_state_dirty = true


func _set_paused(enabled: bool) -> void:
	_paused = enabled
	if enabled:
		_speed_before_pause = _speed
		get_tree().paused = true
		_set_status("Take paused. Studio controls remain active.")
	else:
		get_tree().paused = false
		_speed = _speed_before_pause
		Engine.time_scale = _speed
		_set_status("Take resumed at %s." % _format_speed(_speed))
	_state_dirty = true


func _set_clean_frame(enabled: bool) -> void:
	_clean_frame = enabled
	var context := _selected_context()
	if enabled and not context.is_empty():
		(context.bs as Node).call("_deselect_building")
	if is_instance_valid(_attack):
		var plane = _attack.get("ship_plane")
		if plane is MeshInstance3D:
			(plane as MeshInstance3D).visible = (not enabled) and bool(_attack.get("is_attack_mode"))
	_state_dirty = true
	_dispatch_state()


func _set_status(message: String) -> void:
	_status = message
	_state_dirty = true


func _dispatch_state() -> void:
	if not OS.has_feature("web"):
		return
	var context := _selected_context()
	var selected: Dictionary = {}
	if not context.is_empty():
		var building: Dictionary = context.building
		selected = {
			"id": str(building.get("id", "")),
			"name": _building_name(str(building.get("id", ""))),
			"level": int(building.get("level", 1)),
		}
	var groups: Array[Dictionary] = []
	if is_instance_valid(_attack):
		var raw_groups: Array = _attack.get("_army_groups")
		for index in raw_groups.size():
			var group: Dictionary = raw_groups[index]
			groups.append({
				"index": index,
				"key": str(group.get("key", "")),
				"label": str(group.get("label", group.get("key", ""))),
				"count": int(group.get("count", 0)),
				"selected": index == int(_attack.get("_selected_group_idx")),
			})
	var camera_rows: Array[Dictionary] = []
	for index in CAMERA_PRESETS.size():
		camera_rows.append({"index": index, "name": str(CAMERA_PRESETS[index].name)})
	var state := {
		"ready": is_instance_valid(_main_bs) and is_instance_valid(_attack),
		"status": _status,
		"phase": _phase,
		"buildings": _building_catalog(),
		"building_count": _placed_building_count(),
		"selected_building": selected,
		"troops": _troop_catalog(),
		"army_total": _army_total(),
		"army_types": _army_type_count(),
		"groups": groups,
		"camera_presets": camera_rows,
		"camera_index": _camera_index,
		"speed": _speed,
		"paused": _paused,
		"snapshot_available": _snapshot_available,
		"fps": roundi(Engine.get_frames_per_second()),
		"clean_frame": _clean_frame,
		"safe_frame": _safe_frame,
		"busy": _operation_busy,
		"combat_active": _battle_active,
		"isolation": "LOCAL ONLY - NO REWARDS",
	}
	var payload := JSON.stringify(state)
	JavaScriptBridge.eval(
		"window.dispatchEvent(new CustomEvent('%s',{detail:%s}))" % [STATE_EVENT, payload],
		true
	)


func _placed_building_count() -> int:
	var count := 0
	for bs in _building_systems():
		count += (bs.get("placed_buildings") as Array).size()
	return count


func _format_speed(value: float) -> String:
	if is_equal_approx(value, roundf(value)):
		return "%dx" % roundi(value)
	return "%.2fx" % value


func _format_integer(value: int) -> String:
	var text := str(value)
	var formatted := ""
	while text.length() > 3:
		formatted = "," + text.right(3) + formatted
		text = text.left(text.length() - 3)
	return text + formatted


func _verify_god_mode_flow() -> void:
	await get_tree().process_frame
	var failures: Array[String] = []
	for bs in _building_systems():
		if not bool(bs.get("test_mode")):
			failures.append("%s is not in test_mode" % bs.name)
		if bs.get("_net") != null:
			failures.append("%s still has a network client" % bs.name)
	_build_showcase()
	if _placed_building_count() < 3:
		failures.append("showcase did not create a usable defender base")
	var troops := _troop_catalog()
	if troops.size() < 3:
		failures.append("fewer than three attack unit types are available")
	else:
		for index in 3:
			var row: Dictionary = troops[index]
			_set_army_entry(str(row.id), 20, int(row.max_level))
	var fleet: Array = await _build_attack_fleet()
	var production_capacity := int(BuildingSystem.PLAYER_SHIP_LEVELS.get(_max_ship_level(), {}).get("capacity", 0))
	var staged_units := int(fleet[0].troops.size()) if not fleet.is_empty() else 0
	if staged_units <= production_capacity:
		failures.append("army did not exceed production ship capacity")
	if failures.is_empty():
		await _start_self_attack()
		if not bool(_attack.get("is_attack_mode")):
			failures.append("self-attack never reached deployment mode")
		else:
			var deployed_types := 0
			for target_index in mini(3, (_attack.get("_army_groups") as Array).size()):
				_attack.call("select_troop_group", target_index)
				var offset := Vector3(float(target_index - 1) * 0.08, 0.0, 0.0)
				if bool(_attack.call("_try_deploy_selected_troop", _attack.get("plane_center") + offset)):
					deployed_types += 1
			if deployed_types < 3:
				failures.append("mixed unit groups could not be deployed")
			await get_tree().create_timer(0.75).timeout
			if get_tree().get_nodes_in_group("troops").size() < 3:
				failures.append("deployed units did not enter the combat scene")
			if not _snapshot_available or _snapshot.is_empty():
				failures.append("self-attack did not capture a defender snapshot")
			else:
				var snapshot_count := _snapshot.size()
				_restore_take()
				await get_tree().process_frame
				if _placed_building_count() != snapshot_count:
					failures.append("take restore did not rebuild the defender snapshot")
				if _battle_active:
					failures.append("take restore did not release the combat edit lock")
	if not failures.is_empty():
		for failure in failures:
			push_error("[GOD_MODE_TEST] %s" % failure)
		get_tree().quit(1)
		return
	print("[GOD_MODE_TEST] PASS buildings=%d staged=%d production_capacity=%d mixed_deploy=true network_writes=false" % [
		_placed_building_count(),
		staged_units,
		production_capacity,
	])
	get_tree().quit()
