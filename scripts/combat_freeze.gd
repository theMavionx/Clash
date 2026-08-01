class_name CombatFreeze
extends RefCounted
## Shared client contract for Ice Golem targeting and death-freeze behavior.

const TARGETABLE_DEFENSE_IDS: Dictionary = {
	"turret": true,
	"archer_tower": true,
	"mage_tower": true,
	"tombstone": true,
	"mortar": true,
	"harpoon": true,
	"air_bomb": true,
	"flamethrower": true,
}
const FREEZABLE_DEFENSE_IDS: Dictionary = {
	"turret": true,
	"archer_tower": true,
	"mage_tower": true,
	"tombstone": true,
	"mortar": true,
	"harpoon": true,
	"air_bomb": true,
	"flamethrower": true,
	"shark_trap": true,
}


static func canonical_building_id(raw_id: Variant) -> String:
	var compact := str(raw_id).strip_edges().to_lower().replace("-", "_").replace(" ", "_")
	if compact == "archertower" or compact == "archtower":
		return "archer_tower"
	return compact


static func is_priority_defense(raw_id: Variant) -> bool:
	return TARGETABLE_DEFENSE_IDS.has(canonical_building_id(raw_id))


static func is_freezable_defense(raw_id: Variant) -> bool:
	return FREEZABLE_DEFENSE_IDS.has(canonical_building_id(raw_id))


static func apply_radial(
	origin: Vector3,
	radius: float,
	duration: float,
	include_spawned_guards: bool = true
) -> Array[Dictionary]:
	var affected: Array[Dictionary] = []
	var radius_sq := maxf(0.0, radius) * maxf(0.0, radius)
	for bs_node in BaseTroop._get_building_systems_cached():
		if not is_instance_valid(bs_node) or not "placed_buildings" in bs_node:
			continue
		for building_value: Variant in bs_node.placed_buildings:
			var building: Dictionary = building_value
			var building_id := canonical_building_id(building.get("id", ""))
			if not FREEZABLE_DEFENSE_IDS.has(building_id):
				continue
			if int(building.get("hp", 0)) <= 0:
				continue
			var building_node: Node3D = building.get("node", null)
			if not is_instance_valid(building_node):
				continue
			var dx := building_node.global_position.x - origin.x
			var dz := building_node.global_position.z - origin.z
			if dx * dx + dz * dz > radius_sq:
				continue
			_freeze_building_actors(
				building,
				building_node,
				duration,
				include_spawned_guards
			)
			affected.append({
				"building": building,
				"node": building_node,
				"id": building_id,
				"server_id": int(building.get("server_id", building_node.get_meta("server_id", -1))),
				"show_overlay": building_id != "shark_trap",
			})
	return affected


static func _freeze_building_actors(
	building: Dictionary,
	building_node: Node3D,
	duration: float,
	include_spawned_guards: bool
) -> void:
	_freeze_actor(building_node, duration)
	var tower_unit: Variant = building.get("tower_unit_node", null)
	if is_instance_valid(tower_unit):
		_freeze_actor(tower_unit, duration)
	if not include_spawned_guards:
		return
	var skeletons: Variant = building.get("skeletons", [])
	if skeletons is Array:
		for skeleton in skeletons:
			if is_instance_valid(skeleton):
				_freeze_actor(skeleton, duration)


static func _freeze_actor(actor: Variant, duration: float) -> void:
	if is_instance_valid(actor) and actor.has_method("freeze_for"):
		actor.call("freeze_for", duration)
