## BSBattle — Enemy attack, battle, and replay subsystem extracted from BuildingSystem.
## Implements the find-enemy flow, island switching, return-home, town-hall-destroyed
## victory/defeat handling, and replay playback.
##
## Usage:
##   var _battle := BSBattle.new().init(self)
##   # call from _process every frame:
##   _battle.check_defeat(delta)
##   _battle.check_skeleton_respawn(delta)

class_name BSBattle extends RefCounted

# ---------------------------------------------------------------------------
# Back-reference to the owning BuildingSystem node (set via init).
# ---------------------------------------------------------------------------

## The Node3D that owns this helper (a BuildingSystem instance).
var bs: Node3D

## Initialise with the owning BuildingSystem node.
## Returns self so the caller can chain: BSBattle.new().init(self)
func init(building_system: Node3D) -> BSBattle:
	bs = building_system
	return self

# ---------------------------------------------------------------------------
# State
# ---------------------------------------------------------------------------

var is_viewing_enemy: bool = false
var home_buildings_backup: Array[Dictionary] = []
var home_grid_backup: Array[bool] = []
var enemy_info: Dictionary = {}
var _battle_replay: Array = []
var _battle_start_time: float = 0.0
var return_button: Button
var enemy_label: Label

var _saved_fleet: Array = []  # fleet snapshot taken before home buildings are destroyed

const BATTLE_TIME_LIMIT: float = 180.0  ## 3 minutes max battle duration
var _battle_timer: float = 0.0
var _battle_timer_active: bool = false

var _replay_active: bool = false
var _replay_actions: Array = []
var _replay_buildings_snapshot: Array = []

var _had_troops: bool = false
var _skeleton_respawn_timer: float = 0.0

# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------

## Frees all home troops and port ships immediately — called when switching
## to enemy island so they don't linger in the background.
## MainShipBase and MainShipAttack are never touched.
func _free_home_troops_and_ships() -> void:
	# Free home troops
	for ht in bs._home_troops:
		var troop = ht.get("node")
		if is_instance_valid(troop):
			troop.queue_free()
	bs._home_troops.clear()
	# Free port ship nodes (not MainShipBase/MainShipAttack)
	for data in bs._saved_port_ships:
		var bsys = data.get("bs")
		var gp = data.get("grid_pos")
		if not bsys or not is_instance_valid(bsys):
			continue
		for b2 in bsys.placed_buildings:
			if b2.get("id") == "port" and b2.grid_pos == gp:
				var pnode = b2.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
					var ship = pnode.get_meta("ship_node")
					if is_instance_valid(ship):
						ship.queue_free()
				break
	# Free saved ship transforms (port ships that sailed away)
	for data in bs._saved_ship_transforms:
		var ship = data.get("node")
		if is_instance_valid(ship) and ship != bs._ship_attack_node and ship != bs._ship_base_node:
			ship.queue_free()
	bs._saved_ship_transforms.clear()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

## Kicks off the enemy search flow: boards home troops, sails ships, closes
## the cloud transition, fetches an enemy from the server, then switches to
## the enemy island. Called when the Find Enemy button is pressed.
func _on_find_pressed() -> void:
	if is_viewing_enemy:
		return
	var net: Node = bs._net
	if not net or not net.has_token():
		print("Not logged in")
		return
	# Snapshot the fleet BEFORE anything is freed or destroyed
	_saved_fleet = await bs._build_fleet()
	if bs.find_button:
		bs.find_button.disabled = true
		bs.find_button.text = "Boarding..."
	var pending_count: int = 0
	for ht in bs._home_troops:
		var troop = ht.get("node")
		if not is_instance_valid(troop) or not troop.visible:
			continue
		var port_pos = bs._find_nearest_port_with_ship(troop.global_position)
		if port_pos == Vector3.INF:
			troop.visible = false
			continue
		if troop.has_method("board_ship"):
			pending_count += 1
			troop.board_ship(port_pos)
			troop.boarded.connect(func():
				pending_count -= 1
			, CONNECT_ONE_SHOT)
		else:
			troop.visible = false
	var wait_timer: float = 0.0
	while pending_count > 0 and wait_timer < 6.0:
		await bs.get_tree().process_frame
		wait_timer += bs.get_process_delta_time()
	for ht in bs._home_troops:
		var troop = ht.get("node")
		if is_instance_valid(troop):
			troop.visible = false
	if bs.find_button:
		bs.find_button.text = "Sailing..."
	await _sail_ships_away()
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
	if bs.find_button:
		bs.find_button.text = "Searching..."
	var result: Dictionary = await net.find_enemy()
	if bs.find_button:
		bs.find_button.disabled = false
		bs.find_button.text = "Find Enemy"
	if result.has("error"):
		print("No enemy found: ", result.error)
		cloud.reveal()
		await cloud.reveal_finished
		if bridge2:
			bridge2.send_to_react("cloud_transition", {"visible": false})
		_restore_ships_and_troops()
		return
	enemy_info = result
	_switch_to_enemy_island_after_sail()


## Animates all active ships sailing off-screen and saves their transforms
## so they can be restored later by _restore_ships_and_troops().
func _sail_ships_away() -> void:
	var _r = bs.get_tree().root
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = _r.find_child("MainShipAttack", true, false)
	if not bs._ship_base_node or not is_instance_valid(bs._ship_base_node):
		bs._ship_base_node = _r.find_child("MainShipBase", true, false)
	var sailing_ships: Array = []
	if bs._ship_base_node and is_instance_valid(bs._ship_base_node):
		sailing_ships.append(bs._ship_base_node)
	sailing_ships.append_array(bs._get_all_port_ships())
	bs._saved_ship_transforms.clear()
	for ship in sailing_ships:
		if is_instance_valid(ship):
			bs._saved_ship_transforms.append({"node": ship, "pos": ship.global_position, "rot_y": ship.rotation.y})
	bs._saved_port_ships.clear()
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		for b in bsys.placed_buildings:
			if b.get("id") == "port":
				var pnode = b.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("has_ship"):
					bs._saved_port_ships.append({
						"grid_pos": b.grid_pos,
						"bs": bsys,
						"ship_level": pnode.get_meta("ship_level", 1),
						"ship_troops": pnode.get_meta("ship_troops", []),
					})
	if sailing_ships.size() > 0:
		var sail_tween = bs.create_tween().set_parallel(true)
		for ship in sailing_ships:
			if not is_instance_valid(ship):
				continue
			var forward: Vector3 = Vector3(1, 0, -1).normalized()
			var target_pos = ship.global_position + forward * 4.0
			target_pos.y = ship.global_position.y
			sail_tween.tween_property(ship, "global_position", target_pos, 2.0).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
		await sail_tween.finished
	for ship in sailing_ships:
		if is_instance_valid(ship):
			ship.visible = false


## Restores ships to their saved transforms and makes home troops visible again.
## Called when enemy search fails or after returning home.
func _restore_ships_and_troops() -> void:
	for data in bs._saved_ship_transforms:
		var ship = data.get("node")
		if is_instance_valid(ship):
			ship.global_position = data.pos
			ship.rotation.y = data.rot_y
			ship.visible = true
	bs._saved_ship_transforms.clear()
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = false
	if bs._ship_base_node:
		bs._ship_base_node.visible = true
	for ht in bs._home_troops:
		var troop = ht.get("node")
		if is_instance_valid(troop):
			troop.visible = true
			troop.set_process(true)
			if "state" in troop:
				troop.state = 0


## Switches to the enemy island with a full cloud-close transition.
## Used when jumping to an enemy without having sailed first (e.g. direct
## attack from the main menu).
func _switch_to_enemy_island() -> void:
	if _saved_fleet.is_empty():
		_saved_fleet = await bs._build_fleet()
	_battle_replay.clear()
	_battle_start_time = Time.get_ticks_msec() / 1000.0
	_battle_timer = 0.0
	_battle_timer_active = true
	bs._cannon.reset()
	_battle_replay.append({
		"type": "battle_start",
		"grid_config": {
			"grid_width": bs.grid_width,
			"grid_height": bs.grid_height,
			"cell_size": bs.cell_size,
			"grid_extent_x": bs.grid_extent_x,
			"grid_extent_z": bs.grid_extent_z,
			"grid_center_x": bs.grid_center.x,
			"grid_center_z": bs.grid_center.z,
			"grid_rotation": bs.grid_rotation,
		}
	})
	var _r = bs.get_tree().root
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = _r.find_child("MainShipAttack", true, false)
	if not bs._ship_base_node or not is_instance_valid(bs._ship_base_node):
		bs._ship_base_node = _r.find_child("MainShipBase", true, false)
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = true
	if bs._ship_base_node:
		bs._ship_base_node.visible = false
	# Free home troops and port ships immediately — consumed by the attack
	_free_home_troops_and_ships()
	for bsys in bs._building_systems:
		bsys._production._hide_all_collect_icons()
		bsys._battle.is_viewing_enemy = true
	var bridge = bs._bridge
	if bridge:
		var enemy_res: Dictionary = enemy_info.get("resources", {})
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": enemy_info.get("name", "???"),
			"trophies": enemy_info.get("trophies", 0),
			"gold": enemy_res.get("gold", 0),
			"wood": enemy_res.get("wood", 0),
			"ore": enemy_res.get("ore", 0),
		})
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
	bs._cannon._preload_explosion_textures()
	for bsys in bs._building_systems:
		bsys._destroy_all_buildings()
	if enemy_info.has("buildings") and enemy_info.buildings is Array:
		for bsys in bs._building_systems:
			bsys._load_buildings_from_server(enemy_info.buildings)
	if bs.build_button:
		bs.build_button.visible = false
	if bs.find_button:
		bs.find_button.visible = false
	if bs.shop_panel:
		bs.shop_panel.visible = false
	bs._deselect_building()
	if bs.canvas:
		enemy_label = Label.new()
		enemy_label.text = "Attacking: %s  [%d trophies]" % [enemy_info.get("name", "???"), enemy_info.get("trophies", 0)]
		enemy_label.anchor_left = 0.5
		enemy_label.anchor_right = 0.5
		enemy_label.anchor_top = 1.0
		enemy_label.anchor_bottom = 1.0
		enemy_label.offset_left = -200
		enemy_label.offset_right = 200
		enemy_label.offset_top = -50
		enemy_label.offset_bottom = -20
		enemy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		enemy_label.add_theme_font_size_override("font_size", 22)
		enemy_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		bs.canvas.add_child(enemy_label)
		return_button = Button.new()
		return_button.text = "Return Home"
		return_button.custom_minimum_size = Vector2(300, 120)
		return_button.anchor_left = 1.0
		return_button.anchor_right = 1.0
		return_button.anchor_top = 1.0
		return_button.anchor_bottom = 1.0
		return_button.offset_left = -320
		return_button.offset_right = -20
		return_button.offset_top = -140
		return_button.offset_bottom = -20
		bs._style_button(return_button, Color(0.5, 0.35, 0.1), Color(0.6, 0.45, 0.15))
		return_button.pressed.connect(_return_home)
		bs.canvas.add_child(return_button)
	cloud.reveal()
	await cloud.reveal_finished
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode(_saved_fleet)


## Switches to the enemy island assuming ships have already sailed away.
## Skips the cloud-close step; the caller is responsible for closing the
## cloud before calling this function.
func _switch_to_enemy_island_after_sail() -> void:
	_battle_replay.clear()
	_battle_start_time = Time.get_ticks_msec() / 1000.0
	_battle_timer = 0.0
	_battle_timer_active = true
	bs._cannon.reset()
	_battle_replay.append({
		"type": "battle_start",
		"grid_config": {
			"grid_width": bs.grid_width,
			"grid_height": bs.grid_height,
			"cell_size": bs.cell_size,
			"grid_extent_x": bs.grid_extent_x,
			"grid_extent_z": bs.grid_extent_z,
			"grid_center_x": bs.grid_center.x,
			"grid_center_z": bs.grid_center.z,
			"grid_rotation": bs.grid_rotation,
		}
	})
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = true
	# Free home troops and port ships immediately — they are consumed by the attack
	_free_home_troops_and_ships()
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		bsys._production._hide_all_collect_icons()
		bsys._battle.is_viewing_enemy = true
	var bridge = bs._bridge
	if bridge:
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": enemy_info.get("name", "???"),
			"trophies": enemy_info.get("trophies", 0),
		})
	bs._cannon._preload_explosion_textures()
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		bsys._destroy_all_buildings()
	if enemy_info.has("buildings") and enemy_info.buildings is Array:
		for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
			bsys._load_buildings_from_server(enemy_info.buildings)
	if bs.build_button:
		bs.build_button.visible = false
	if bs.find_button:
		bs.find_button.visible = false
	if bs.shop_panel:
		bs.shop_panel.visible = false
	bs._deselect_building()
	if bs.canvas:
		enemy_label = Label.new()
		enemy_label.text = "Attacking: %s  [%d trophies]" % [enemy_info.get("name", "???"), enemy_info.get("trophies", 0)]
		enemy_label.anchor_left = 0.5
		enemy_label.anchor_right = 0.5
		enemy_label.anchor_top = 1.0
		enemy_label.anchor_bottom = 1.0
		enemy_label.offset_left = -200
		enemy_label.offset_right = 200
		enemy_label.offset_top = -50
		enemy_label.offset_bottom = -20
		enemy_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		enemy_label.add_theme_font_size_override("font_size", 22)
		enemy_label.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
		bs.canvas.add_child(enemy_label)
		return_button = Button.new()
		return_button.text = "Return Home"
		return_button.custom_minimum_size = Vector2(300, 120)
		return_button.anchor_left = 1.0
		return_button.anchor_right = 1.0
		return_button.anchor_top = 1.0
		return_button.anchor_bottom = 1.0
		return_button.offset_left = -320
		return_button.offset_right = -20
		return_button.offset_top = -140
		return_button.offset_bottom = -20
		bs._style_button(return_button, Color(0.5, 0.35, 0.1), Color(0.6, 0.45, 0.15))
		return_button.pressed.connect(_return_home)
		bs.canvas.add_child(return_button)
	var cloud = bs._get_or_create_cloud()
	cloud.reveal()
	await cloud.reveal_finished
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": false})
	if bs._ship_attack_node and is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node.visible = true
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode(_saved_fleet)


## Returns the player to their home island: tears down enemy state, reloads
## home buildings from the server, restores ships and troops, and cleans up
## all battle UI elements.
func _return_home() -> void:
	if not is_viewing_enemy:
		return
	_replay_active = false
	_battle_timer_active = false
	_battle_timer = 0.0
	Engine.time_scale = 1.0
	bs._cannon._exit_ship_cannon_mode()
	var _r2 = bs.get_tree().root
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = _r2.find_child("MainShipAttack", true, false)
	if not bs._ship_base_node or not is_instance_valid(bs._ship_base_node):
		bs._ship_base_node = _r2.find_child("MainShipBase", true, false)
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = false
	if bs._ship_base_node:
		bs._ship_base_node.visible = true
	for ht in bs._home_troops:
		if is_instance_valid(ht.get("node")):
			ht.node.visible = true
	for bsys in bs._building_systems:
		bsys._battle.is_viewing_enemy = false
	var bridge = bs._bridge
	if bridge:
		bridge.send_to_react("enemy_mode", {"active": false})
	for c in bs._cannon._ship_cannonballs:
		if is_instance_valid(c.get("node")):
			c.node.queue_free()
	bs._cannon._ship_cannonballs.clear()
	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop):
			troop.remove_from_group("troops")
			troop.set_process(false)
			troop.queue_free()
	for guard in bs.get_tree().get_nodes_in_group("skeleton_guards"):
		if is_instance_valid(guard):
			guard.remove_from_group("skeleton_guards")
			guard.set_process(false)
			guard.queue_free()
	for ship in bs.get_tree().get_nodes_in_group("ships"):
		if is_instance_valid(ship):
			ship.queue_free()
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("exit_attack_mode"):
		attack_system.exit_attack_mode()
	await bs.get_tree().process_frame
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": true})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
	for bsys in bs._building_systems:
		bsys._destroy_all_buildings()
	var net: Node = bs._net
	if net and net.has_token():
		await net.login()
		bs._update_player_name_label()
	if bs.build_button:
		bs.build_button.visible = true
	if bs.find_button:
		bs.find_button.visible = true
	if bs.attack_button:
		bs.attack_button.visible = true
	if enemy_label and is_instance_valid(enemy_label):
		enemy_label.queue_free()
		enemy_label = null
	if return_button and is_instance_valid(return_button):
		return_button.queue_free()
		return_button = null
	enemy_info = {}
	cloud.reveal()
	await cloud.reveal_finished
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})
	# Ships and troops were already freed in _free_home_troops_and_ships
	# when we switched to enemy island. Just clean up remaining state.
	bs._saved_ship_transforms.clear()
	bs._saved_port_ships.clear()
	bs._port.owned_ships = 0
	bs._home_troops.clear()
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = false
	if bs._ship_base_node:
		bs._ship_base_node.visible = true


## Handles town hall destruction: destroys all remaining enemy buildings with
## explosion effects, sets all living troops to VICTORY state, submits the
## battle result to the server, and sends the result to the React HUD.
func _on_town_hall_destroyed() -> void:
	for bsys in bs._building_systems:
		var to_destroy: Array = bsys.placed_buildings.duplicate()
		for b in to_destroy:
			if b.id == "tombstone":
				bsys._remove_tombstone_skeletons(b)
			# Port → sink its ship before destroying the port
			if b.id == "port":
				var pnode: Node3D = b.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
					var ship: Node3D = pnode.get_meta("ship_node")
					if is_instance_valid(ship):
						bs._sink_ship(ship)
			if b.has("hp_bar") and is_instance_valid(b.hp_bar):
				b.hp_bar.queue_free()
			var icon: Control = b.get("_collect_icon")
			if is_instance_valid(icon):
				icon.queue_free()
			if is_instance_valid(b.node):
				bs._cannon._spawn_ship_explosion(b.node.global_position)
				b.node.queue_free()
		bsys.placed_buildings.clear()
		bsys.grid.fill(false)
	# Count casualties: compare deployed fleet vs surviving troops
	var deployed_troops: Dictionary = {}  # {name: count}
	for ship in _saved_fleet:
		for t_name in ship.get("troops", []):
			deployed_troops[t_name] = deployed_troops.get(t_name, 0) + 1
	var surviving_troops: Dictionary = {}
	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop) and "state" in troop:
			troop.state = troop.State.VICTORY
			# Get troop type name from script path
			var t_key: String = _troop_script_to_name(troop)
			if t_key != "":
				surviving_troops[t_key] = surviving_troops.get(t_key, 0) + 1
	var casualties: Dictionary = {}
	for t_name in deployed_troops:
		var lost: int = deployed_troops[t_name] - surviving_troops.get(t_name, 0)
		if lost > 0:
			casualties[t_name] = lost
	var net_node: Node = bs._net
	var defender_id: String = enemy_info.get("id", "")
	if net_node and net_node.has_token() and defender_id != "":
		var result: Dictionary = await net_node.submit_battle_result(defender_id, _battle_replay, "victory", casualties)
		if not is_instance_valid(bs): return
		var bridge: Node = bs._bridge
		if result.has("error"):
			if bridge:
				bridge.send_to_react("battle_result", {
					"type": "victory", "loot": {}, "casualties": casualties,
					"error": result.get("error", "") + " " + result.get("reason", ""),
				})
			return
		var loot: Dictionary = result.get("loot", {})
		if bridge:
			if loot.get("gold", 0) > 0 or loot.get("wood", 0) > 0 or loot.get("ore", 0) > 0:
				bridge.send_to_react("resources_add", {
					"gold": loot.get("gold", 0),
					"wood": loot.get("wood", 0),
					"ore": loot.get("ore", 0),
				})
			bridge.send_to_react("battle_result", {
				"type": "victory", "loot": loot, "casualties": casualties,
			})
		return
	var bridge2: Node = bs._bridge
	if bridge2:
		bridge2.send_to_react("battle_result", {"type": "victory", "loot": {}, "casualties": casualties})


## Starts a replay of a recorded attack. Loads the buildings snapshot, enters
## enemy-view mode, then hands off to _replay_playback() for timed action
## playback.
func _start_replay(replay_data: Array, buildings_snapshot: Array, attacker_name: String) -> void:
	bs.get_tree().paused = false
	_replay_active = true
	_replay_actions = replay_data
	_replay_buildings_snapshot = buildings_snapshot
	enemy_info = {"name": attacker_name, "trophies": 0, "buildings": buildings_snapshot}
	for bsys in bs._building_systems:
		bsys._production._hide_all_collect_icons()
		bsys._battle.is_viewing_enemy = true
	var bridge = bs._bridge
	if bridge:
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": "Replay: " + attacker_name,
			"trophies": 0,
			"is_replay": true,
		})
		bridge.send_to_react("cloud_transition", {"visible": true})
	var _r = bs.get_tree().root
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = _r.find_child("MainShipAttack", true, false)
	if not bs._ship_base_node or not is_instance_valid(bs._ship_base_node):
		bs._ship_base_node = _r.find_child("MainShipBase", true, false)
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = true
	if bs._ship_base_node:
		bs._ship_base_node.visible = false
	for ht in bs._home_troops:
		if is_instance_valid(ht.get("node")):
			ht.node.visible = false
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
	bs._cannon._preload_explosion_textures()
	for bsys in bs._building_systems:
		bsys._destroy_all_buildings()
	for bsys in bs._building_systems:
		bsys._load_buildings_from_server(buildings_snapshot)
	if bs.build_button:
		bs.build_button.visible = false
	if bs.find_button:
		bs.find_button.visible = false
	if bs.shop_panel:
		bs.shop_panel.visible = false
	bs._deselect_building()
	cloud.reveal()
	await cloud.reveal_finished
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})
	bs._cannon.reset()
	Engine.time_scale = 1.0
	_replay_playback()


## Plays back recorded battle actions in real time. Waits for each action's
## timestamp, dispatches place_ship and cannon_fire events, then waits for
## the battle to naturally conclude before signalling replay_end to the HUD.
func _replay_playback() -> void:
	var actions: Array = []
	for a in _replay_actions:
		if a.get("type", "") in ["place_ship", "cannon_fire"]:
			actions.append(a)
	if actions.is_empty():
		_replay_active = false
		return
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	var prev_t: float = 0.0
	for i in actions.size():
		if not _replay_active or not is_instance_valid(bs):
			return
		var action: Dictionary = actions[i]
		var t: float = action.get("t", 0.0)
		var delay: float = t - prev_t
		if delay > 0:
			await bs.get_tree().create_timer(delay).timeout
		if not _replay_active or not is_instance_valid(bs):
			return
		prev_t = t
		match action.get("type", ""):
			"place_ship":
				_replay_place_ship(action, attack_system)
			"cannon_fire":
				_replay_cannon_fire(action)
	while _replay_active and is_instance_valid(bs):
		await bs.get_tree().create_timer(0.5).timeout
		if not _replay_active:
			return
		var th_alive: bool = false
		for bsys in bs._building_systems:
			for b in bsys.placed_buildings:
				if b.get("id", "") == "town_hall" and b.get("hp", 0) > 0:
					th_alive = true
					break
		if not th_alive:
			break
		var troops_alive: int = BaseTroop._get_troops_cached().size()
		if troops_alive == 0:
			break
	if _replay_active:
		await bs.get_tree().create_timer(2.0).timeout
	Engine.time_scale = 1.0
	if _replay_active and bs._bridge:
		bs._bridge.send_to_react("battle_result", {"type": "replay_end", "reason": "Replay finished"})
	_replay_active = false


## Replays a single place_ship action by locating the matching troop type in
## the AttackSystem, temporarily overriding the troop level, and calling
## _try_place_ship at the recorded world position.
func _replay_place_ship(action: Dictionary, attack_system: Node) -> void:
	if not attack_system:
		return
	var troop_type: String = action.get("troopType", "knight")
	var troop_level: int = action.get("troopLevel", 1)
	var troop_idx: int = 0
	for i in attack_system.SHIP_TROOPS.size():
		var script_name: String = attack_system.SHIP_TROOPS[i].script.get_file().get_basename()
		if script_name == troop_type:
			troop_idx = i
			break
	attack_system._next_troop_idx = troop_idx
	var level_key: String = attack_system._script_to_troop_key(attack_system.SHIP_TROOPS[troop_idx].script)
	var original_level: int = bs.troop_levels.get(level_key, 1)
	bs.troop_levels[level_key] = troop_level
	var hit: Vector3 = Vector3(action.get("x", 0.0), bs.grid_y, action.get("z", 0.0))
	attack_system._try_place_ship(hit)
	bs.troop_levels[level_key] = original_level


## Replays a single cannon_fire action by looking up the target building by
## its server_id and delegating to BSCannon._fire_ship_cannon().
func _replay_cannon_fire(action: Dictionary) -> void:
	var server_id: int = action.get("buildingId", -1)
	if server_id < 0:
		return
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			if b.get("server_id", -1) == server_id:
				bs._cannon._fire_ship_cannon(b)
				return


## Called every frame from BuildingSystem._process while in enemy-view mode.
## Detects when all attacking troops have been lost and ALL ships have been
## deployed (placed + sailed), then submits a defeat result after a grace period.
func check_defeat(delta: float) -> void:
	if not is_viewing_enemy or _replay_active:
		return
	if not bs.create_ui or bs.name != "BuildingSystem":
		return

	# Battle timer — auto-defeat after 3 minutes
	if _battle_timer_active:
		_battle_timer += delta
		var remaining: int = ceili(BATTLE_TIME_LIMIT - _battle_timer)
		# Send timer to React every second
		if remaining >= 0 and int(_battle_timer) != int(_battle_timer - delta):
			var bridge_t: Node = bs._bridge
			if bridge_t:
				bridge_t.send_to_react("battle_timer", {"remaining": remaining})
		if _battle_timer >= BATTLE_TIME_LIMIT:
			_battle_timer_active = false
			# Force defeat — time's up
			_force_defeat("Time's up!")
			return

	var attack_system: Node = bs.get_node_or_null("../AttackSystem")

	var troops_alive: bool = not BaseTroop._get_troops_cached().is_empty()

	if troops_alive:
		_had_troops = true
		_skeleton_respawn_timer = 0.0
		return

	# No troops alive and no ships sailing — check if all ships have been placed
	if not _had_troops:
		return  # battle hasn't started yet

	var fleet_size: int = _saved_fleet.size()
	var ships_placed: int = 0
	if attack_system:
		ships_placed = attack_system._ships_placed
	# Still has unplaced ships — player can still send more, don't defeat yet
	if ships_placed < fleet_size and attack_system and attack_system.is_attack_mode:
		_skeleton_respawn_timer = 0.0
		return

	# Grace period before declaring defeat (gives time for last troops to spawn)
	_skeleton_respawn_timer += delta
	if _skeleton_respawn_timer < 3.0:
		return

	_had_troops = false
	_skeleton_respawn_timer = 0.0

	# Submit defeat
	var net_def: Node = bs._net
	var def_id: String = enemy_info.get("id", "")
	var defeat_casualties: Dictionary = {}
	for ship in _saved_fleet:
		for t_name in ship.get("troops", []):
			defeat_casualties[t_name] = defeat_casualties.get(t_name, 0) + 1
	if net_def and net_def.has_token() and def_id != "":
		await net_def.submit_battle_result(def_id, _battle_replay, "defeat", defeat_casualties)
	if not is_instance_valid(bs): return
	var bridge_def: Node = bs._bridge
	if bridge_def:
		bridge_def.send_to_react("battle_result", {"type": "defeat", "reason": "All troops lost", "casualties": defeat_casualties})


## Forces a defeat — used when battle timer expires.
## Only already-dead troops count as casualties. Survivors stay alive.
func _force_defeat(reason: String) -> void:
	_had_troops = false
	_skeleton_respawn_timer = 0.0
	# Casualties already reported to server via /troop-died in real-time
	# Just send the defeat result with empty casualties (server already has the data)
	var net_def: Node = bs._net
	var def_id: String = enemy_info.get("id", "")
	if net_def and net_def.has_token() and def_id != "":
		net_def.submit_battle_result(def_id, _battle_replay, "defeat", {})
	var bridge_def: Node = bs._bridge
	if bridge_def:
		bridge_def.send_to_react("battle_result", {"type": "defeat", "reason": reason})


## Called every frame from BuildingSystem._process while on the home island.
## Detects when all skeleton guards have been defeated and respawns them from
## every Tombstone building after a short delay.
func check_skeleton_respawn(delta: float) -> void:
	if is_viewing_enemy:
		return
	if not bs.create_ui or bs.name != "BuildingSystem":
		return
	var troops_alive: bool = not BaseTroop._get_troops_cached().is_empty()
	if troops_alive:
		_had_troops = true
		_skeleton_respawn_timer = 0.0
	elif _had_troops:
		_skeleton_respawn_timer += delta
		if _skeleton_respawn_timer >= 2.0:
			_had_troops = false
			_skeleton_respawn_timer = 0.0
			for bsys in bs._building_systems:
				for b in bsys.placed_buildings:
					if b.get("id", "") == "tombstone" and is_instance_valid(b.get("node")):
						bsys._spawn_tombstone_skeletons(b, b.get("level", 1))


## Maps a troop node's script to its canonical name.
static func _troop_script_to_name(troop: Node3D) -> String:
	var script_res = troop.get_script()
	if script_res == null:
		return ""
	var path: String = script_res.resource_path.get_file().get_basename()
	match path:
		"knight": return "Knight"
		"mage": return "Mage"
		"barbarian": return "Barbarian"
		"archer": return "Archer"
		"ranger": return "Ranger"
	return ""
