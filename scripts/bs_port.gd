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


func _troop_entry_base_name(troop_name: String) -> String:
	var base: String = str(troop_name).split(":")[0]
	match base.to_lower():
		"demonking", "demon_king":
			return "DemonKing"
		"knight":
			return "Knight"
		"mage":
			return "Mage"
		"barbarian":
			return "Barbarian"
		"archer":
			return "Archer"
		"ranger":
			return "Ranger"
	return base


func _is_slot_filler(troop_name: Variant) -> bool:
	return str(troop_name) == "_SLOT_FILLER_"


func _troop_unit_span_at(ship_troops: Array, index: int) -> Dictionary:
	if index < 0 or index >= ship_troops.size():
		return {}
	var start: int = index
	if _is_slot_filler(ship_troops[start]):
		while start > 0 and _is_slot_filler(ship_troops[start]):
			start -= 1
		if _is_slot_filler(ship_troops[start]):
			return {}
	var end: int = start + 1
	while end < ship_troops.size() and _is_slot_filler(ship_troops[end]):
		end += 1
	return {"start": start, "end": end}


func _swap_span_for_replacement(ship_troops: Array, slot: int, replacement_name: String, capacity: int) -> Dictionary:
	if slot < 0 or slot >= ship_troops.size():
		return {}
	if _is_slot_filler(ship_troops[slot]):
		return {}
	var selected: Dictionary = _troop_unit_span_at(ship_troops, slot)
	if selected.is_empty():
		return {}
	var start: int = int(selected.start)
	var end: int = int(selected.end)
	var replacement_base: String = _troop_entry_base_name(replacement_name)
	var replacement_slots: int = int(bs.troop_defs.get(replacement_base, {}).get("slot_cost", 1))
	var avoid_implicit_demon_king_removal: bool = replacement_base == "DemonKing"
	while ship_troops.size() - (end - start) + replacement_slots > capacity:
		var right: Dictionary = _troop_unit_span_at(ship_troops, end)
		if not right.is_empty() and int(right.start) == end:
			var right_base: String = _troop_entry_base_name(str(ship_troops[int(right.start)]))
			if not (avoid_implicit_demon_king_removal and right_base == "DemonKing"):
				end = int(right.end)
				continue
		var left: Dictionary = _troop_unit_span_at(ship_troops, start - 1)
		if not left.is_empty() and int(left.end) == start:
			var left_base: String = _troop_entry_base_name(str(ship_troops[int(left.start)]))
			if not (avoid_implicit_demon_king_removal and left_base == "DemonKing"):
				start = int(left.start)
				continue
		return {}
	return {"start": start, "end": end}

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
func _load_troop_to_ship(troop_name: String, extra: Dictionary = {}) -> void:
	var port_node: Node3D = bs.selected_building.get("node", null)
	if not is_instance_valid(port_node) or not port_node.has_meta("has_ship"):
		return
	var ship_level: int = port_node.get_meta("ship_level", 1)
	var ship_troops: Array = port_node.get_meta("ship_troops", [])
	var troop_base_name: String = _troop_entry_base_name(troop_name)
	var tdef: Dictionary = bs.troop_defs.get(troop_base_name, {})
	var slot_cost: int = int(tdef.get("slot_cost", 1))
	# Ask server first — server is authoritative on capacity.
	var sid: int = bs.selected_building.get("server_id", -1)
	var net: Node = bs._net
	if net and net.has_token() and sid >= 0:
		var result: Dictionary = await net.load_troop(sid, troop_name, extra)
		if not is_instance_valid(port_node): return
		if result.has("error"):
			bs._show_error(str(result.error))
			return
		var new_troops: Array = result.get("ship_troops", [])
		port_node.set_meta("ship_troops", new_troops)
		if result.has("resources"):
			bs._apply_resources_from_server(result.resources)
	else:
		# Offline fallback. Capacity = ship_level * 3 (was `>= ship_level` before,
		# a pre-existing bug that capped offline ships to 1/2/3 troops total).
		if ship_troops.size() + slot_cost > ship_level * 3:
			return
		ship_troops.append(troop_name)
		for _i in range(slot_cost - 1):
			ship_troops.append("_SLOT_FILLER_")
		port_node.set_meta("ship_troops", ship_troops)
	bs._refresh_port_panel()
	var updated_troops: Array = port_node.get_meta("ship_troops", [])
	var bridge: Node = bs._bridge
	if bridge:
		bridge.send_to_react("ship_updated", {
			"ship_level": ship_level,
			"ship_troops": updated_troops,
			"ship_capacity": ship_level * 3,
		})

func _swap_troop_on_ship(slot: int, troop_name: String, extra: Dictionary = {}) -> void:
	var port_node: Node3D = bs.selected_building.get("node", null)
	if not is_instance_valid(port_node) or not port_node.has_meta("has_ship"):
		return
	var ship_troops: Array = port_node.get_meta("ship_troops", [])
	if slot < 0 or slot >= ship_troops.size():
		return
	var troop_base_name: String = _troop_entry_base_name(troop_name)
	var slot_cost: int = int(bs.troop_defs.get(troop_base_name, {}).get("slot_cost", 1))
	var ship_level: int = port_node.get_meta("ship_level", 1)
	# Ask server
	var sid: int = bs.selected_building.get("server_id", -1)
	var net: Node = bs._net
	if net and net.has_token() and sid >= 0:
		var result: Dictionary = await net.swap_troop(sid, slot, troop_name, extra)
		if not is_instance_valid(port_node): return
		if result.has("error"):
			bs._show_error(str(result.error))
			return
		var new_troops: Array = result.get("ship_troops", [])
		port_node.set_meta("ship_troops", new_troops)
		if result.has("resources"):
			bs._apply_resources_from_server(result.resources)
	else:
		var span: Dictionary = _swap_span_for_replacement(ship_troops, slot, troop_name, ship_level * 3)
		if span.is_empty():
			return
		var start: int = int(span.start)
		var remove_count: int = int(span.end) - start
		for _i in range(remove_count):
			ship_troops.remove_at(start)
		ship_troops.insert(start, troop_name)
		for _i in range(slot_cost - 1):
			ship_troops.insert(start + 1 + _i, "_SLOT_FILLER_")
		port_node.set_meta("ship_troops", ship_troops)
	if not is_instance_valid(port_node): return
	bs._refresh_port_panel()
	var updated_troops: Array = port_node.get_meta("ship_troops", [])
	var bridge: Node = bs._bridge
	if bridge:
		bridge.send_to_react("ship_updated", {
			"ship_level": ship_level,
			"ship_troops": updated_troops,
			"ship_capacity": ship_level * 3,
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

func _get_port_dock_yaw(port_node: Node3D) -> float:
	var parent_node: Node = port_node.get_parent()
	if parent_node is Node3D:
		return (parent_node as Node3D).global_rotation.y + port_node.rotation.y
	return port_node.rotation.y


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
	# Share AttackSystem's already-populated cache (same paths). Avoids a second
	# synchronous GLB decode on first port-ship spawn.
	if AttackSystem._ship_model_cache.is_empty():
		AttackSystem._preload_combat_resources()
	var ship_res: Resource = null
	if model_idx < AttackSystem._ship_model_cache.size():
		ship_res = AttackSystem._ship_model_cache[model_idx]
	if ship_res == null:
		ship_res = load(SHIP_MODELS[model_idx])  # fallback
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
	# During port upgrades the port node is briefly scaled to zero for the
	# squash animation. Reading global_rotation from a zero-scale transform can
	# return an unstable yaw, so derive the dock yaw from the stable grid parent.
	var dock_yaw: float = _get_port_dock_yaw(port_node)
	var forward = Vector3(sin(dock_yaw), 0, cos(dock_yaw))
	var ship_dist = [0.35, 0.35, 0.4, 0.57][clampi(port_level, 0, 3)]
	ship.global_position = port_pos + forward * ship_dist
	ship.global_position.y = bs._water_y - 0.03
	ship.global_rotation = Vector3(0.0, dock_yaw + PI * 0.5, 0.0)
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
func _find_port_with_free_slot(from_pos: Vector3, needed_slots: int = 1) -> Dictionary:
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
				var capacity: int = ship_level * 3
				if capacity - ship_troops.size() < needed_slots:
					continue  # not enough room on this ship
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
					free += ship_level * 3 - ship_troops.size()
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
					total += pnode.get_meta("ship_level", 1) * 3
	return total
