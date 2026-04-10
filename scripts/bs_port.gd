## BSPort — Port/ship management helper extracted from building_system.gd.
## Implements the port and ship mechanics defined in the building system design.
class_name BSPort extends RefCounted

const SHIP_COST_GOLD: int = 500
const SHIP_MODELS: Array[String] = [
	"res://Model/Ship/Ships/ship-pirate-small_1.glb",
	"res://Model/Ship/Ships/ship-pirate-medium_2.glb",
	"res://Model/Ship/Ships/ship-pirate-large_3.glb",
]
const SHIP_DISPLAY_SCALE: float = 0.05

var bs: Node3D

var owned_ships: int = 0

## Initialises the helper with a reference to the BuildingSystem node.
## Returns self to allow chaining: BSPort.new().init(building_system)
func init(building_system: Node3D) -> BSPort:
	bs = building_system
	return self

# ---------------------------------------------------------------------------
# Ship purchasing
# ---------------------------------------------------------------------------

## Buys a ship at the level of the currently selected building.
func _buy_ship() -> void:
	var lvl: int = bs.selected_building.get("level", 1)
	_buy_ship_level(lvl)

## Buys a ship at the given level for the currently selected port, deducting
## SHIP_COST_GOLD from the player's gold and spawning the ship model.
func _buy_ship_level(ship_lvl: int) -> void:
	if bs.resources.get("gold", 0) < SHIP_COST_GOLD:
		return
	var port_node: Node3D = bs.selected_building.get("node", null)
	if not is_instance_valid(port_node):
		return
	if port_node.has_meta("has_ship"):
		return
	var sid: int = bs.selected_building.get("server_id", -1)
	# Ask server first
	var net: Node = bs._net
	if net and net.has_token() and sid >= 0:
		var result: Dictionary = await net.buy_ship(sid)
		if result.has("error"):
			bs._show_error(str(result.error))
			return
		if result.has("resources"):
			bs.resources.gold = result.resources.gold
			bs.resources.wood = result.resources.wood
			bs.resources.ore = result.resources.ore
			bs._update_resource_ui()
	else:
		# Offline fallback — deduct locally
		bs.resources["gold"] -= SHIP_COST_GOLD
		bs._update_resource_ui()
	port_node.set_meta("has_ship", true)
	port_node.set_meta("ship_level", ship_lvl)
	port_node.set_meta("ship_troops", [])
	owned_ships += 1
	var old_level = bs.selected_building.get("level", 1)
	bs.selected_building["level"] = ship_lvl
	_spawn_port_ship()
	bs.selected_building["level"] = old_level
	bs._refresh_port_panel()
	var bridge: Node = bs._bridge
	if bridge:
		bridge.send_to_react("resources", {
			"gold": bs.resources.get("gold", 0),
			"wood": bs.resources.get("wood", 0),
			"ore": bs.resources.get("ore", 0),
		})

# ---------------------------------------------------------------------------
# Troop loading
# ---------------------------------------------------------------------------

## Loads a named troop into the ship docked at the currently selected port.
## The capacity check is deferred to the server — local meta may be stale
## (e.g. post-battle casualties not yet synced), so we always round-trip.
func _load_troop_to_ship(troop_name: String) -> void:
	var port_node: Node3D = bs.selected_building.get("node", null)
	if not is_instance_valid(port_node) or not port_node.has_meta("has_ship"):
		return
	var ship_level: int = port_node.get_meta("ship_level", 1)
	var ship_troops: Array = port_node.get_meta("ship_troops", [])
	# Ask server first — server is authoritative on capacity.
	var sid: int = bs.selected_building.get("server_id", -1)
	var net: Node = bs._net
	if net and net.has_token() and sid >= 0:
		var result: Dictionary = await net.load_troop(sid, troop_name)
		if not is_instance_valid(port_node): return
		if result.has("error"):
			bs._show_error(str(result.error))
			return
		var new_troops: Array = result.get("ship_troops", [])
		port_node.set_meta("ship_troops", new_troops)
		if result.has("resources"):
			bs._apply_resources_from_server(result.resources)
	else:
		# Offline fallback only — keep the local capacity check.
		if ship_troops.size() >= ship_level:
			return
		ship_troops.append(troop_name)
		port_node.set_meta("ship_troops", ship_troops)
	bs._refresh_port_panel()
	var updated_troops: Array = port_node.get_meta("ship_troops", [])
	var bridge: Node = bs._bridge
	if bridge:
		bridge.send_to_react("ship_updated", {
			"ship_level": ship_level,
			"ship_troops": updated_troops,
			"ship_capacity": ship_level,
		})

func _swap_troop_on_ship(slot: int, troop_name: String) -> void:
	var port_node: Node3D = bs.selected_building.get("node", null)
	if not is_instance_valid(port_node) or not port_node.has_meta("has_ship"):
		return
	var ship_troops: Array = port_node.get_meta("ship_troops", [])
	if slot < 0 or slot >= ship_troops.size():
		return
	var ship_level: int = port_node.get_meta("ship_level", 1)
	# Ask server
	var sid: int = bs.selected_building.get("server_id", -1)
	var net: Node = bs._net
	if net and net.has_token() and sid >= 0:
		var result: Dictionary = await net.swap_troop(sid, slot, troop_name)
		if not is_instance_valid(port_node): return
		if result.has("error"):
			bs._show_error(str(result.error))
			return
		var new_troops: Array = result.get("ship_troops", [])
		port_node.set_meta("ship_troops", new_troops)
		if result.has("resources"):
			bs._apply_resources_from_server(result.resources)
	else:
		ship_troops[slot] = troop_name
		port_node.set_meta("ship_troops", ship_troops)
	if not is_instance_valid(port_node): return
	bs._refresh_port_panel()
	var updated_troops: Array = port_node.get_meta("ship_troops", [])
	var bridge: Node = bs._bridge
	if bridge:
		bridge.send_to_react("ship_updated", {
			"ship_level": ship_level,
			"ship_troops": updated_troops,
			"ship_capacity": ship_level,
		})

# ---------------------------------------------------------------------------
# Main ship animation
# ---------------------------------------------------------------------------

## Positions and shows/hides the main attack and base ship nodes relative to
## the water plane.
func _animate_main_ship() -> void:
	var water = bs.get_tree().root.find_child("Water", true, false)
	if water:
		bs._water_y = water.global_position.y
	var _root = bs.get_tree().root
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = _root.find_child("MainShipAttack", true, false)
	if not bs._ship_base_node or not is_instance_valid(bs._ship_base_node):
		bs._ship_base_node = _root.find_child("MainShipBase", true, false)
	var attack_ship = bs._ship_attack_node
	var base_ship = bs._ship_base_node
	if attack_ship:
		attack_ship.visible = false
		attack_ship.global_position.y = bs._water_y + 0.12 - 0.03
	if base_ship:
		base_ship.visible = true
		base_ship.global_position.y = bs._water_y + 0.09
		base_ship.rotation.y = deg_to_rad(-135.8)

# ---------------------------------------------------------------------------
# Ship spawning
# ---------------------------------------------------------------------------

## Instantiates and positions the ship model for a port building.
## Uses bs.selected_building when b_override is empty.
func _spawn_port_ship(b_override: Dictionary = {}) -> void:
	var b: Dictionary = b_override if b_override.size() > 0 else bs.selected_building
	if b.size() == 0:
		return
	var port_node: Node3D = b.get("node", null)
	if not is_instance_valid(port_node):
		return
	var port_level: int = b.get("level", 1)
	var model_idx = clampi(port_level - 1, 0, SHIP_MODELS.size() - 1)
	var ship_res = load(SHIP_MODELS[model_idx])
	if ship_res == null:
		return
	var ship = ship_res.instantiate()
	var s = SHIP_DISPLAY_SCALE
	ship.scale = Vector3(s, s, s)
	bs.get_tree().current_scene.add_child(ship)
	port_node.set_meta("has_ship", true)
	port_node.set_meta("ship_level", port_level)
	if not port_node.has_meta("ship_troops"):
		port_node.set_meta("ship_troops", [])
	var port_pos = port_node.global_position
	var port_rot_y = port_node.global_rotation.y
	var forward = Vector3(sin(port_rot_y), 0, cos(port_rot_y))
	var ship_dist = [0.35, 0.35, 0.4, 0.57][clampi(port_level, 0, 3)]
	ship.global_position = port_pos + forward * ship_dist
	ship.global_position.y = bs._water_y - 0.03
	ship.global_rotation.y = port_rot_y + PI * 0.5
	port_node.set_meta("ship_node", ship)

# ---------------------------------------------------------------------------
# Ship queries
# ---------------------------------------------------------------------------

## Returns all valid ship nodes docked at ports across all building systems.
func _get_all_port_ships() -> Array:
	var ships: Array = []
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		for b in bsys.placed_buildings:
			if b.get("id") == "port":
				var pnode = b.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
					var ship = pnode.get_meta("ship_node")
					if is_instance_valid(ship):
						ships.append(ship)
	return ships

## Returns {pos: Vector3, port_node: Node3D} of the nearest port whose ship has
## free troop slots. Returns {} if none found.
func _find_port_with_free_slot(from_pos: Vector3) -> Dictionary:
	var best: Dictionary = {}
	var best_dist: float = INF
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		for b in bsys.placed_buildings:
			if b.get("id") == "port":
				var pnode = b.get("node", null)
				if not is_instance_valid(pnode) or not pnode.has_meta("has_ship"):
					continue
				var ship_level: int = pnode.get_meta("ship_level", 1)
				var ship_troops: Array = pnode.get_meta("ship_troops", [])
				if ship_troops.size() >= ship_level:
					continue  # full
				var d: float = from_pos.distance_to(pnode.global_position)
				if d < best_dist:
					best_dist = d
					best = {"pos": pnode.global_position, "port_node": pnode}
	return best


## Returns the number of free troop slots across all ships.
func _get_free_ship_slots() -> int:
	var free: int = 0
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		for b in bsys.placed_buildings:
			if b.get("id") == "port":
				var pnode = b.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("has_ship"):
					var ship_level: int = pnode.get_meta("ship_level", 1)
					var ship_troops: Array = pnode.get_meta("ship_troops", [])
					free += ship_level - ship_troops.size()
	return free


## Returns the global position of the nearest port that has a ship, measured
## from from_pos. Returns Vector3.INF if no port with a ship is found.
func _find_nearest_port_with_ship(from_pos: Vector3) -> Vector3:
	var best_pos = Vector3.INF
	var best_dist = INF
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		for b in bsys.placed_buildings:
			if b.get("id") == "port":
				var pnode = b.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("has_ship"):
					var d = from_pos.distance_to(pnode.global_position)
					if d < best_dist:
						best_dist = d
						best_pos = pnode.global_position
	return best_pos

## Returns the sum of ship levels across all ports with a ship, representing
## the total troop capacity available for deployment.
func _get_total_ship_capacity() -> int:
	var total: int = 0
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		for b in bsys.placed_buildings:
			if b.get("id") == "port":
				var pnode = b.get("node", null)
				if is_instance_valid(pnode) and pnode.has_meta("has_ship"):
					total += pnode.get_meta("ship_level", 1)
	return total
