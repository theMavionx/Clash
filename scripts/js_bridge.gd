extends Node
## Autoload "Bridge" — communicates between Godot and React via JavaScriptBridge.
## Works only in web export. Silently ignored in editor/native builds.

signal react_message(action: String, data: Dictionary)

var _callbacks: Dictionary = {}
var _is_web: bool = false
var _perf_timer: float = 0.0
const PERF_INTERVAL: float = 0.25  # send perf data 4x per second

func _ready() -> void:
	_is_web = OS.has_feature("web")
	if not _is_web:
		return

	var cb = JavaScriptBridge.create_callback(_on_react_call)
	_callbacks["_on_react_call"] = cb
	JavaScriptBridge.get_interface("window").set("godotBridge", cb)

	await get_tree().create_timer(0.5).timeout
	_send_initial_state()


func _process(delta: float) -> void:
	if not _is_web:
		return
	_perf_timer += delta
	if _perf_timer < PERF_INTERVAL:
		return
	_perf_timer = 0.0
	_send_perf_data()


func _send_perf_data() -> void:
	var troop_list = BaseTroop._get_troops_cached()
	var troops = troop_list.size()
	var guards = get_tree().get_nodes_in_group("skeleton_guards").size()

	# Count projectiles from cached troop list (no extra group query)
	var troop_projectiles = 0
	for troop in troop_list:
		if "_active" in troop:
			troop_projectiles += troop._active.size()

	# Buildings count from cached data
	var buildings = BaseTroop._get_buildings_cached().size()

	# Turret bullets — count from turret nodes directly
	var turrets = 0
	var active_bullets = 0
	for bs in get_tree().get_nodes_in_group("building_systems"):
		for b in bs.placed_buildings:
			if b.get("id", "") == "turret" and is_instance_valid(b.get("node")):
				if "_active_bullets" in b.node:
					turrets += 1
					active_bullets += b.node._active_bullets.size()

	var ships = 0
	var attack_sys = get_tree().current_scene.get_node_or_null("IslandView/AttackSystem")
	if attack_sys:
		ships = attack_sys._ships_placed

	var state = "idle"
	if troops > 0:
		state = "combat"
	elif ships > 0:
		state = "deploying"

	var payload = JSON.stringify({
		"action": "perf",
		"data": {
			"fps": Engine.get_frames_per_second(),
			"troops": troops,
			"guards": guards,
			"turrets": turrets,
			"bullets": active_bullets,
			"projectiles": troop_projectiles,
			"buildings": buildings,
			"ships": ships,
			"state": state,
			"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			"objects": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
			"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		}
	})
	JavaScriptBridge.eval("window.onGodotMessage && window.onGodotMessage(%s)" % payload)


func send_to_react(action: String, data: Dictionary) -> void:
	if not _is_web:
		return
	var payload = JSON.stringify({"action": action, "data": data})
	JavaScriptBridge.eval("window.onGodotMessage && window.onGodotMessage(%s)" % payload)


func _send_initial_state() -> void:
	send_to_react("godot_ready", {})
	# Send building/troop definitions so React can render shop & barracks
	var bs = _get_building_system()
	if bs:
		var defs := {}
		for key in bs.building_defs:
			var d = bs.building_defs[key]
			defs[key] = {
				"name": d.name,
				"cells": [d.cells.x, d.cells.y],
				"cost": d.get("cost", {}),
				"hp_levels": d.get("hp_levels", []),
				"max_count": d.get("max_count", 0),
			}
		var troop_defs := {}
		for key in bs.troop_defs:
			var td = bs.troop_defs[key]
			troop_defs[key] = {"display": td.display, "costs": {}}
			for lvl in td.costs:
				troop_defs[key].costs[str(lvl)] = td.costs[lvl]
		# Count how many of each type are already placed
		var placed_counts := {}
		for b in bs.placed_buildings:
			var bid = b.get("id", "")
			placed_counts[bid] = placed_counts.get(bid, 0) + 1
		send_to_react("building_defs", {"buildings": defs, "troops": troop_defs, "placed_counts": placed_counts})
		send_to_react("resources", {
			"gold": bs.resources.gold,
			"wood": bs.resources.wood,
			"ore": bs.resources.ore,
		})
		send_to_react("troop_levels", bs.troop_levels)
	# Check if need to register
	var net = get_node_or_null("/root/Net")
	if net and not net.has_token():
		send_to_react("show_register", {})
	elif net:
		send_to_react("state", {
			"player_name": net.display_name,
			"trophies": net.trophies,
			"player_id": net.player_id,
			"token": net.token,
		})


func _on_react_call(args: Array) -> void:
	if args.size() == 0:
		return
	var json = JSON.new()
	if json.parse(str(args[0])) != OK:
		return
	var msg = json.data
	if msg is Dictionary and msg.has("action"):
		react_message.emit(msg.action, msg.get("data", {}))
		_handle_react_action(msg.action, msg.get("data", {}))


func _handle_react_action(action: String, data: Dictionary) -> void:
	var bs = _get_building_system()
	match action:
		"get_state":
			_send_full_state()
		"add_resources":
			if bs:
				bs._on_add_resource(data.get("resource", "gold"))
		"open_shop":
			if bs:
				send_to_react("shop_toggled", {"open": true})
		"close_shop":
			send_to_react("shop_toggled", {"open": false})
		"start_placement":
			if bs:
				var bid = data.get("building_id", "")
				bs._start_placement(bid)
				send_to_react("shop_toggled", {"open": false})
				send_to_react("placement_started", {"building_id": bid})
		"find_enemy":
			if bs:
				bs._on_find_pressed()
		"attack":
			if bs:
				bs._on_attack_pressed()
		"return_home":
			if bs:
				bs._return_home()
		"upgrade_building":
			var active = _get_active_building_system()
			if active:
				active._upgrade_selected()
		"refresh_troops":
			if bs:
				bs._refresh_troop_levels_from_server()
		"upgrade_troop":
			if bs:
				var tn = data.get("troop_name", "")
				bs._upgrade_troop(tn)
		"register":
			_do_register(data.get("name", ""), data.get("wallet", ""))
		"deselect_building":
			var active = _get_active_building_system()
			if active:
				active._deselect_building()
		"collect_resource":
			var sid = data.get("server_id", -1)
			for bsys in get_tree().get_nodes_in_group("building_systems"):
				bsys._collect_building_resource(sid)
		"resource_bar_positions":
			# React sends icon centers: {gold: {x, y}, wood: {x, y}, ore: {x, y}}
			for bsys in get_tree().get_nodes_in_group("building_systems"):
				bsys._react_resource_positions = data


func _do_register(player_name: String, wallet: String = "") -> void:
	var net = get_node_or_null("/root/Net")
	if not net:
		send_to_react("error", {"message": "Network not available"})
		return
	if player_name.length() < 2:
		send_to_react("error", {"message": "Name must be at least 2 characters"})
		return
	var result = await net.register(player_name, wallet)
	if result.has("error"):
		send_to_react("error", {"message": str(result.error)})
		return
	send_to_react("registered", {"success": true})
	send_to_react("state", {
		"player_name": net.display_name,
		"trophies": net.trophies,
		"player_id": net.player_id,
		"token": net.token,
	})


func _send_full_state() -> void:
	var net = get_node_or_null("/root/Net")
	if net and net.display_name != "":
		send_to_react("state", {
			"player_name": net.display_name,
			"trophies": net.trophies,
			"player_id": net.player_id,
			"token": net.token,
		})
	var bs = _get_building_system()
	if bs:
		send_to_react("resources", {
			"gold": bs.resources.gold,
			"wood": bs.resources.wood,
			"ore": bs.resources.ore,
		})
		send_to_react("troop_levels", bs.troop_levels)


func _get_building_system() -> Node:
	var systems = get_tree().get_nodes_in_group("building_systems")
	# Find the main grid (not the port grid)
	for s in systems:
		if s.name == "BuildingSystem":
			return s
	# Fallback: return first with blocked_buildings (main grid blocks port)
	for s in systems:
		if s.blocked_buildings.size() > 0:
			return s
	if systems.size() > 0:
		return systems[0]
	return null


func _get_active_building_system() -> Node:
	# Return whichever system currently has a building selected
	var systems = get_tree().get_nodes_in_group("building_systems")
	for s in systems:
		if s.selected_building.size() > 0:
			return s
	return _get_building_system()
