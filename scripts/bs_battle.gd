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

## Stored result of the latest in-flight `submit_battle_result` call.
## Written by `_run_submit_bg`, read by `_on_town_hall_destroyed` after the
## chain-destroy + admire delay. Because the server response almost always
## arrives BEFORE we `await` here, a signal-based approach would race (the
## signal would emit with no listener and the later `await` would hang).
## The bool flag + polled process_frame loop avoids that race entirely.
var _submit_result: Dictionary = {}
var _submit_complete: bool = false
var _pending_troop_death_keys: Dictionary = {}
var _pending_troop_death_counts: Dictionary = {}
var _final_troop_death_counts: Dictionary = {}
var _troop_deaths_flushed: bool = false

# ---------------------------------------------------------------------------
# Back-reference to the owning BuildingSystem node (set via init).
# ---------------------------------------------------------------------------

## The Node3D that owns this helper (a BuildingSystem instance).
var bs: Node3D

const MAX_REPLAY_SHIPS: int = 6

## Initialise with the owning BuildingSystem node.
## Returns self so the caller can chain: BSBattle.new().init(self)
func init(building_system: Node3D) -> BSBattle:
	bs = building_system
	return self


func _grid_config_for(bsys: Node) -> Dictionary:
	return {
		"grid_width": bsys.grid_width,
		"grid_height": bsys.grid_height,
		"cell_size": bsys.cell_size,
		"grid_extent_x": bsys.grid_extent_x,
		"grid_extent_z": bsys.grid_extent_z,
		"grid_center_x": bsys.grid_center.x,
		"grid_center_z": bsys.grid_center.z,
		"grid_rotation": bsys.grid_rotation,
	}


func _battle_grid_configs() -> Dictionary:
	var configs: Dictionary = {}
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		if not bsys.has_method("_get_grid_index"):
			continue
		configs[str(bsys._get_grid_index())] = _grid_config_for(bsys)
	if configs.is_empty():
		configs["0"] = _grid_config_for(bs)
	return configs

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
var _replay_duration: float = 0.0
var _replay_elapsed: float = 0.0
var _replay_timer_last_remaining: int = -1
var _replay_telemetry: Array = []
var _replay_telemetry_seq: int = 0
var _replay_telemetry_dropped: int = 0
var _replay_loaded_buildings: Dictionary = {}
var _replay_attacker_name: String = ""
var _replay_label: String = ""
var _replay_result_payload: Dictionary = {}
var _replay_wall_start_msec: int = 0
var _replay_chain_destroying: bool = false
var _replay_prev_max_fps: int = -1
var _replay_prev_physics_ticks: int = -1
var _replay_prev_max_physics_steps: int = -1
var _replay_prev_physics_jitter_fix: float = -1.0
var _returning_home: bool = false
const REPLAY_TELEMETRY_MAX_EVENTS: int = 2500
const REPLAY_SYNC_FPS: int = 60
const REPLAY_SYNC_MAX_PHYSICS_STEPS: int = 16
const COMBAT_WARMUP_MAX_WAIT_SEC: float = 4.0
const COMBAT_WARMUP_COVERED_MAX_WAIT_SEC: float = 30.0

var _had_troops: bool = false
var _skeleton_respawn_timer: float = 0.0
var _victory_declared: bool = false
var _find_in_progress: bool = false
var _battle_entry_switch_seq: int = 0

const RAID_ATTACK_COST_GOLD: int = 300

func _get_attack_cost_gold() -> int:
	return RAID_ATTACK_COST_GOLD

# ---------------------------------------------------------------------------
# Cleanup helpers
# ---------------------------------------------------------------------------

## Resets all per-account battle state to its initial values. Called from
## BuildingSystem._on_server_auth_ok so a logout-then-login-as-different-
## account sequence cannot leave the new user in a mid-battle state or
## viewing a prior account's enemy. Without this, `is_viewing_enemy` or a
## stale `enemy_info` dict could make the game think the new player is
## still raiding someone else's island.
func reset() -> void:
	is_viewing_enemy = false
	home_buildings_backup.clear()
	home_grid_backup.clear()
	enemy_info.clear()
	_battle_replay.clear()
	_battle_start_time = 0.0
	_saved_fleet.clear()
	_battle_timer = 0.0
	_battle_timer_active = false
	_replay_active = false
	_replay_actions.clear()
	_replay_buildings_snapshot.clear()
	_replay_duration = 0.0
	_replay_elapsed = 0.0
	_replay_timer_last_remaining = -1
	_replay_telemetry.clear()
	_replay_telemetry_seq = 0
	_replay_telemetry_dropped = 0
	_replay_attacker_name = ""
	_replay_label = ""
	_replay_result_payload.clear()
	_replay_wall_start_msec = 0
	_restore_replay_clock()
	_returning_home = false
	_had_troops = false
	_skeleton_respawn_timer = 0.0
	_victory_declared = false
	_find_in_progress = false
	_submit_result = {}
	_submit_complete = false
	_reset_troop_death_reports()


func _ship_level_from_fleet(fleet: Array, fallback: int = 1) -> int:
	for ship_value in fleet:
		if ship_value is Dictionary:
			return clampi(int(ship_value.get("level", fallback)), 1, 10)
	return clampi(fallback, 1, 10)


func _enemy_town_hall_level(info: Dictionary) -> int:
	var building_level: int = 0
	var buildings_value: Variant = info.get("buildings", [])
	if buildings_value is Array:
		for building_value in buildings_value:
			if not building_value is Dictionary:
				continue
			if str(building_value.get("type", "")).to_lower() != "town_hall":
				continue
			building_level = maxi(building_level, int(building_value.get("level", 0)))
	if building_level > 0:
		return clampi(building_level, 1, 20)
	var payload_level: int = int(info.get("town_hall_level", info.get("level", 1)))
	return clampi(payload_level, 1, 20)


func _battle_elapsed_sec() -> float:
	# This is the authoritative live-combat clock. It advances only from
	# BuildingSystem._physics_process and remains readable after the active flag
	# is cleared so battle_end receives the exact final simulation timestamp.
	return maxf(0.0, _battle_timer)


func _reset_troop_death_reports() -> void:
	_pending_troop_death_keys.clear()
	_pending_troop_death_counts.clear()
	_final_troop_death_counts.clear()
	_troop_deaths_flushed = false


func record_troop_death_once(troop_name: String, troop_instance: int = 0, replay_order: int = -1) -> bool:
	if _replay_active or not is_viewing_enemy or _troop_deaths_flushed:
		return false
	var clean_name: String = str(troop_name).strip_edges()
	if clean_name == "":
		return false
	var identity: String = str(troop_instance)
	if replay_order >= 0:
		identity = "replay:%d" % replay_order
	var key: String = "%s:%s" % [clean_name, identity]
	if _pending_troop_death_keys.has(key):
		return true
	_pending_troop_death_keys[key] = true
	_pending_troop_death_counts[clean_name] = int(_pending_troop_death_counts.get(clean_name, 0)) + 1
	return true


func _paid_casualty_counts(casualties: Dictionary = {}) -> Dictionary:
	var counts: Dictionary = {}
	for raw_name in casualties:
		var troop_name: String = str(raw_name).split(":")[0]
		if troop_name == "" or troop_name == "DemonKing" or troop_name == "FireDragon":
			continue
		var count: int = int(casualties.get(raw_name, 0))
		if count <= 0:
			continue
		counts[troop_name] = int(counts.get(troop_name, 0)) + count
	return counts


## Freezes the one authoritative client-side death ledger at match end.
## Every terminal path submits this exact dictionary once through
## /attack/result; no per-death network or React event participates.
func _seal_troop_death_report() -> Dictionary:
	if not _troop_deaths_flushed:
		_final_troop_death_counts = _paid_casualty_counts(_pending_troop_death_counts)
		_troop_deaths_flushed = true
	return _final_troop_death_counts.duplicate(true)


func _replay_wall_elapsed_sec() -> float:
	if _replay_wall_start_msec <= 0:
		return 0.0
	return maxf(0.0, float(Time.get_ticks_msec() - _replay_wall_start_msec) / 1000.0)


func _replay_sim_step_from_frames(start_frame: int, fallback_step: float) -> float:
	var frame_delta: int = maxi(0, Engine.get_process_frames() - start_frame)
	var sim_step: float = float(frame_delta) * BaseTroop.REPLAY_COMBAT_DELTA
	if sim_step <= 0.0:
		return fallback_step
	return sim_step


func _lock_replay_clock() -> void:
	if _replay_prev_max_fps < 0:
		_replay_prev_max_fps = Engine.max_fps
		_replay_prev_physics_ticks = Engine.physics_ticks_per_second
		_replay_prev_max_physics_steps = Engine.max_physics_steps_per_frame
		_replay_prev_physics_jitter_fix = Engine.physics_jitter_fix
	Engine.time_scale = 1.0
	Engine.physics_ticks_per_second = REPLAY_SYNC_FPS
	Engine.max_physics_steps_per_frame = maxi(Engine.max_physics_steps_per_frame, REPLAY_SYNC_MAX_PHYSICS_STEPS)
	Engine.physics_jitter_fix = 0.0


func _restore_replay_clock() -> void:
	Engine.time_scale = 1.0
	if _replay_prev_max_fps < 0:
		return
	Engine.max_fps = _replay_prev_max_fps
	Engine.physics_ticks_per_second = _replay_prev_physics_ticks
	Engine.max_physics_steps_per_frame = _replay_prev_max_physics_steps
	Engine.physics_jitter_fix = _replay_prev_physics_jitter_fix
	_replay_prev_max_fps = -1
	_replay_prev_physics_ticks = -1
	_replay_prev_max_physics_steps = -1
	_replay_prev_physics_jitter_fix = -1.0


func _cleanup_combat_runtime_nodes() -> void:
	if bs and bs._cannon:
		bs._cannon._exit_ship_cannon_mode()
		for c in bs._cannon._ship_cannonballs:
			if is_instance_valid(c.get("node")):
				c.node.queue_free()
		bs._cannon._ship_cannonballs.clear()
	if bs and bs._freeze:
		bs._freeze.reset()
	if bs and bs._rage:
		bs._rage.reset()
	if bs and bs._skeleton_barrel:
		bs._skeleton_barrel.reset()
	if bs and bs._medkit:
		bs._medkit.reset()
	var attack_system: Node = bs.get_node_or_null("../AttackSystem") if bs else null
	if attack_system and attack_system.has_method("cleanup_combat_nodes"):
		attack_system.cleanup_combat_nodes()
	else:
		var tree: SceneTree = bs.get_tree() if bs else null
		if tree:
			for group_name in ["troops", "skeleton_guards", "ships", "deployed_ships"]:
				for node in tree.get_nodes_in_group(group_name):
					if is_instance_valid(node):
						if node.has_method("_clear_owned_projectiles"):
							node.call("_clear_owned_projectiles")
						if node.has_method("set_process"):
							node.set_process(false)
						if node.has_method("set_physics_process"):
							node.set_physics_process(false)
						if node.is_in_group(group_name):
							node.remove_from_group(group_name)
						node.queue_free()
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()


func _freeze_combat_runtime_nodes() -> void:
	if bs and bs._cannon:
		bs._cannon._exit_ship_cannon_mode()
	if bs and bs._rally:
		bs._rally._exit_rally_mode()
	if bs and bs._freeze:
		bs._freeze._exit_freeze_mode()
	if bs and bs._rage:
		bs._rage._exit_rage_mode()
	if bs and bs._skeleton_barrel:
		bs._skeleton_barrel._exit_barrel_mode()
	if bs and bs._medkit:
		bs._medkit._exit_medkit_mode()
	var attack_system: Node = bs.get_node_or_null("../AttackSystem") if bs else null
	if attack_system:
		if attack_system.has_method("_cancel_pending_combat_spawns"):
			attack_system.call("_cancel_pending_combat_spawns")
		if "is_attack_mode" in attack_system:
			attack_system.is_attack_mode = false
		if "ship_plane" in attack_system:
			var plane = attack_system.get("ship_plane")
			if is_instance_valid(plane):
				plane.visible = false
	if not bs:
		return
	for group_name in ["troops", "skeleton_guards", "ships", "deployed_ships"]:
		for node in bs.get_tree().get_nodes_in_group(group_name):
			if not is_instance_valid(node):
				continue
			node.set_process(false)
			node.set_physics_process(false)


func _stop_attacker_combat_after_town_hall_destroyed(play_victory: bool = true) -> void:
	if not is_instance_valid(bs):
		return
	if bs._cannon:
		bs._cannon._exit_ship_cannon_mode()
		for c in bs._cannon._ship_cannonballs:
			if is_instance_valid(c.get("node")):
				c.node.queue_free()
		bs._cannon._ship_cannonballs.clear()
	if bs._rally:
		bs._rally._exit_rally_mode()
	if bs._freeze:
		bs._freeze._exit_freeze_mode()
	if bs._rage:
		bs._rage._exit_rage_mode()
	if bs._skeleton_barrel:
		bs._skeleton_barrel._exit_barrel_mode()
	if bs._medkit:
		bs._medkit._exit_medkit_mode()
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system:
		if attack_system.has_method("_cancel_pending_combat_spawns"):
			attack_system.call("_cancel_pending_combat_spawns")
		if "is_attack_mode" in attack_system:
			attack_system.is_attack_mode = false
		if "ship_plane" in attack_system:
			var plane = attack_system.get("ship_plane")
			if is_instance_valid(plane):
				plane.visible = false
	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if not is_instance_valid(troop):
			continue
		# Seal result-affecting AI on the lethal Town Hall physics tick. At low
		# render FPS several physics steps can run before the coroutine resumes
		# after its process_frame await; state/animation presentation happens
		# later, but no troop may land another hit in that window.
		troop.set_physics_process(false)
		if play_victory:
			if troop.has_method("_play_victory"):
				troop.call("_play_victory")
			elif "state" in troop:
				troop.state = troop.State.VICTORY
		if troop.has_method("_clear_owned_projectiles"):
			troop.call("_clear_owned_projectiles")


func _replay_info() -> Dictionary:
	var info: Dictionary = {
		"battle_session_id": "",
		"expected_result": "",
		"expected_duration": _replay_duration,
	}
	for action in _replay_actions:
		if not (action is Dictionary):
			continue
		var action_type: String = str(action.get("type", ""))
		if action_type == "battle_start":
			info.battle_session_id = str(action.get("battle_session_id", ""))
		elif action_type == "battle_end":
			info.expected_result = str(action.get("result", ""))
			info.expected_duration = float(action.get("t", _replay_duration))
	return info


func _replay_attacker_flag_url() -> String:
	for action in _replay_actions:
		if action is Dictionary and str(action.get("type", "")) == "battle_start":
			return str(action.get("attacker_flag_url", "")).strip_edges()
	return ""


func _replay_result_for_overlay() -> Dictionary:
	var payload: Dictionary = {}
	if not _replay_result_payload.is_empty():
		payload = _replay_result_payload.duplicate(true)
	else:
		var info: Dictionary = _replay_info()
		var expected_result: String = str(info.get("expected_result", "")).to_lower()
		if expected_result == "victory" or expected_result == "defeat":
			payload = {"type": expected_result}
		else:
			payload = {"type": "replay_end", "reason": "Replay finished"}
	if not payload.has("duration"):
		payload.duration = snappedf(_replay_elapsed, 0.01)
	if not payload.has("opponent_name"):
		payload.opponent_name = str(enemy_info.get("name", ""))
	if not payload.has("casualties"):
		payload.casualties = {}
	return payload


func record_replay_telemetry(kind: String, data: Dictionary = {}) -> void:
	if not _replay_active:
		return
	_replay_telemetry_seq += 1
	if _replay_telemetry.size() >= REPLAY_TELEMETRY_MAX_EVENTS:
		_replay_telemetry_dropped += 1
		return
	var event: Dictionary = {
		"seq": _replay_telemetry_seq,
		"t": snappedf(_replay_elapsed, 0.01),
		"wall_t": snappedf(_replay_wall_elapsed_sec(), 0.01),
		"kind": kind,
	}
	for key in data:
		event[key] = data[key]
	_replay_telemetry.append(event)


func _replay_telemetry_summary() -> Dictionary:
	var counts: Dictionary = {}
	for event in _replay_telemetry:
		var kind: String = str(event.get("kind", "unknown"))
		counts[kind] = counts.get(kind, 0) + 1
	var buildings_alive: Array = []
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			buildings_alive.append({
				"type": str(b.get("id", "")),
				"server_id": int(b.get("server_id", -1)),
				"hp": int(b.get("hp", 0)),
			})
	var troops_alive_detail: Array = []
	for troop in BaseTroop._get_troops_cached():
		if not is_instance_valid(troop):
			continue
		var troop_name: String = ""
		if troop.has_method("_get_troop_name"):
			troop_name = str(troop.call("_get_troop_name"))
		var target_payload: Dictionary = {}
		if troop.has_method("_current_target_telemetry_payload"):
			target_payload = troop.call("_current_target_telemetry_payload")
		troops_alive_detail.append({
			"troop": troop_name,
			"instance": int(troop.get_instance_id()),
			"hp": int(troop.get("hp")) if troop.get("hp") != null else 0,
			"level": int(troop.get("level")) if troop.get("level") != null else 1,
			"state": int(troop.get("state")) if troop.get("state") != null else -1,
			"x": snappedf(troop.global_position.x, 0.001),
			"z": snappedf(troop.global_position.z, 0.001),
			"target": target_payload,
		})
	return {
		"counts": counts,
		"events_recorded": _replay_telemetry.size(),
		"events_dropped": _replay_telemetry_dropped,
		"troops_alive": BaseTroop._get_troops_cached().size(),
		"troops_alive_detail": troops_alive_detail,
		"guards_alive": BaseTroop._get_guards_list_cached().size(),
		"buildings_alive": buildings_alive,
	}


func _capture_replay_loaded_buildings() -> void:
	_replay_loaded_buildings.clear()
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			var sid: int = int(b.get("server_id", -1))
			if sid < 0:
				continue
			var gp: Vector2i = b.get("grid_pos", Vector2i.ZERO)
			_replay_loaded_buildings[str(sid)] = {
				"type": str(b.get("id", "")),
				"server_id": sid,
				"grid_x": int(gp.x),
				"grid_z": int(gp.y),
				"hp": int(b.get("hp", 0)),
			}


func _reconcile_replay_destroyed_building_telemetry() -> void:
	if _replay_loaded_buildings.is_empty():
		return
	var alive_ids: Dictionary = {}
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			var sid: int = int(b.get("server_id", -1))
			if sid >= 0 and b.get("hp", 0) > 0 and is_instance_valid(b.get("node", null)):
				alive_ids[str(sid)] = true
	var destroyed_ids: Dictionary = {}
	for event in _replay_telemetry:
		if str(event.get("kind", "")) != "building_destroyed":
			continue
		var sid: int = int(event.get("server_id", -1))
		if sid >= 0:
			destroyed_ids[str(sid)] = true
	var added: int = 0
	for sid_key in _replay_loaded_buildings.keys():
		if alive_ids.has(sid_key) or destroyed_ids.has(sid_key):
			continue
		var payload: Dictionary = _replay_loaded_buildings[sid_key].duplicate()
		payload["hp"] = 0
		payload["reason"] = "reconcile_missing"
		payload["reconciled"] = true
		record_replay_telemetry("building_destroyed", payload)
		added += 1
	if added > 0:
		record_replay_telemetry("building_destroy_reconcile", {"added": added})


func _send_replay_telemetry() -> void:
	# Replay telemetry upload is disabled for now to keep local/mobile sessions
	# light. Keep the recorder helpers intact so we can re-enable diagnostics
	# later without touching combat logic.
	return


func _queue_free_once(value) -> void:
	if not (value is Object):
		return
	if is_instance_valid(value) and not value.is_queued_for_deletion():
		value.queue_free()


func _clear_node_projectile_pool(owner: Object, property_name: String) -> void:
	if not (property_name in owner):
		return
	var items = owner.get(property_name)
	if not (items is Array):
		return
	for item in items:
		if item is Dictionary:
			for node_key in ["node", "trail", "flash"]:
				var projectile_node = item.get(node_key)
				_queue_free_once(projectile_node)
			item["active"] = false
			item["target"] = null
		elif is_instance_valid(item):
			_queue_free_once(item)
	items.clear()
	owner.set(property_name, items)


func _stop_combat_node(node: Node) -> void:
	if not is_instance_valid(node):
		return
	if node.has_method("_play_victory"):
		node.call("_play_victory")
	if "_target" in node:
		node.set("_target", null)
	if "_fire_timer" in node:
		node.set("_fire_timer", 0.0)
	if "_target_search_timer" in node:
		node.set("_target_search_timer", 0.0)
	if "_is_attacking" in node:
		node.set("_is_attacking", false)
	_clear_node_projectile_pool(node, "_active_bullets")
	_clear_node_projectile_pool(node, "_bullet_pool")
	_clear_node_projectile_pool(node, "_active")
	_clear_node_projectile_pool(node, "_active_arrows")
	_clear_node_projectile_pool(node, "_pool")
	node.set_process(false)
	node.set_physics_process(false)
	for child in node.get_children():
		_stop_combat_node(child)


func _neutralize_shark_trap_after_town_hall_destroyed(b: Dictionary) -> void:
	var trap_node: Node = b.get("node", null)
	if is_instance_valid(trap_node):
		if trap_node.has_method("deactivate_after_battle_end"):
			trap_node.call("deactivate_after_battle_end")
		else:
			_stop_combat_node(trap_node)
		# Traps are concealed in attacker view. Remove the neutralized runtime
		# node silently so clearing placed_buildings cannot orphan it, but never
		# route it through the explosion/ruins pipeline.
		_queue_free_once(trap_node)
	var hp_bar: Variant = b.get("hp_bar", null)
	_queue_free_once(hp_bar)
	var icon: Variant = b.get("_collect_icon", null)
	_queue_free_once(icon)


func _stop_defensive_combat_after_town_hall_destroyed() -> void:
	if not is_instance_valid(bs):
		return
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			var bid: String = str(b.get("id", ""))
			if bid == "shark_trap":
				_neutralize_shark_trap_after_town_hall_destroyed(b)
				continue
			if not (bid in ["turret", "archer_tower", "tombstone", "mage_tower", "mortar"]):
				continue
			var bnode: Node = b.get("node", null)
			if is_instance_valid(bnode):
				_stop_combat_node(bnode)
	for guard in bs.get_tree().get_nodes_in_group("skeleton_guards"):
		if is_instance_valid(guard):
			_stop_combat_node(guard)


func _record_battle_end(result: String) -> void:
	for action in _battle_replay:
		if action is Dictionary and str(action.get("type", "")) == "battle_end":
			return
	_battle_replay.append({
		"type": "battle_end",
		"t": _battle_elapsed_sec(),
		"result": result,
	})

## Frees home troops and any legacy port visuals when switching to the enemy.
## The persistent Ship_Large is owned exclusively by MainShipController.
func _free_home_troops_and_ships() -> void:
	# Free home troops
	for ht in bs._home_troops:
		var troop = ht.get("node")
		if is_instance_valid(troop):
			troop.queue_free()
	bs._home_troops.clear()
	# Legacy port rows remain available for migration, but their old visuals do
	# not participate in the single-ship battle scene.
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
	# Ship_Large is persistent and never enters this legacy transform list.
	for data in bs._saved_ship_transforms:
		var ship = data.get("node")
		if is_instance_valid(ship):
			ship.queue_free()
	bs._saved_ship_transforms.clear()


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

func _start_hidden_combat_warmup() -> Node:
	var script: Script = load("res://scripts/warmup.gd")
	if script == null:
		return null
	return script.start_combat_warmup(bs)


func _await_hidden_combat_warmup(warmup: Variant, max_wait_sec: float = COMBAT_WARMUP_MAX_WAIT_SEC) -> bool:
	# Combat warmup queues itself for deletion after its last render frame. An
	# async fleet/network step can therefore leave this Variant holding a freed
	# Object. Keep the boundary untyped so validity is checked before assigning
	# it to a Node-typed local; a `Node` argument would reject it before entering.
	var safe_warmup: Node = null
	# `is` also errors on a freed instance, so validity must be the left side of
	# this short-circuit expression.
	if is_instance_valid(warmup) and warmup is Node:
		safe_warmup = warmup
	if safe_warmup == null:
		return true
	var waited: float = 0.0
	while is_instance_valid(safe_warmup) and not bool(safe_warmup.get("_finished_emitted")) and waited < max_wait_sec:
		await bs.get_tree().process_frame
		waited += bs.get_process_delta_time()
	if is_instance_valid(safe_warmup) and not bool(safe_warmup.get("_finished_emitted")):
		print("[BATTLE_ENTRY] combat_warmup_continue_in_background wait_ms=", int(waited * 1000.0))
		return false
	else:
		print("[BATTLE_ENTRY] combat_warmup_done wait_ms=", int(waited * 1000.0))
		return true


func _is_hidden_combat_warmup_ready() -> bool:
	var script: Script = load("res://scripts/warmup.gd")
	if script == null or not script.has_method("is_combat_warmup_ready"):
		return false
	return bool(script.call("is_combat_warmup_ready"))


func _finish_hidden_combat_warmup_under_cloud(
	warmup: Variant,
	log_label: String,
	started_ticks: int
) -> bool:
	if _is_hidden_combat_warmup_ready():
		print(
			"[BATTLE_ENTRY] ", log_label,
			"_warmup_barrier_ready elapsed_ms=",
			Time.get_ticks_msec() - started_ticks
		)
		return true
	var safe_warmup: Node = null
	if is_instance_valid(warmup) and warmup is Node:
		safe_warmup = warmup
	if safe_warmup == null:
		safe_warmup = _start_hidden_combat_warmup()
	if safe_warmup == null:
		var ready_without_node := _is_hidden_combat_warmup_ready()
		if not ready_without_node:
			push_warning("Combat warmup barrier could not start a hidden warmup node")
		return ready_without_node
	var bridge: Node = bs._bridge if bs else null
	if bridge:
		bridge.send_to_react(
			"cloud_transition",
			{"visible": true, "message": "Preparing battle..."}
		)
	print(
		"[BATTLE_ENTRY] ", log_label,
		"_warmup_barrier_start elapsed_ms=",
		Time.get_ticks_msec() - started_ticks
	)
	var completed := await _await_hidden_combat_warmup(
		safe_warmup,
		COMBAT_WARMUP_COVERED_MAX_WAIT_SEC
	)
	completed = completed or _is_hidden_combat_warmup_ready()
	if completed:
		print(
			"[BATTLE_ENTRY] ", log_label,
			"_warmup_barrier_done elapsed_ms=",
			Time.get_ticks_msec() - started_ticks
		)
	else:
		push_warning(
			"Combat warmup did not finish under cloud cover after %.1f seconds"
			% COMBAT_WARMUP_COVERED_MAX_WAIT_SEC
		)
	return completed


func _await_signal_or_timeout(source: Object, signal_name: String, timeout_sec: float, log_label: String) -> bool:
	if source == null or not is_instance_valid(source) or not source.has_signal(signal_name):
		print("[BATTLE_ENTRY] ", log_label, "_missing_signal")
		return false
	var completion_state := {"done": false}
	var on_done := func() -> void:
		completion_state.done = true
	source.connect(signal_name, on_done, CONNECT_ONE_SHOT)
	var waited: float = 0.0
	while not bool(completion_state.done) and waited < timeout_sec:
		await bs.get_tree().process_frame
		waited += bs.get_process_delta_time()
	if bool(completion_state.done):
		print("[BATTLE_ENTRY] ", log_label, "_done wait_ms=", int(waited * 1000.0))
		return true
	if is_instance_valid(source) and source.is_connected(signal_name, on_done):
		source.disconnect(signal_name, on_done)
	print("[BATTLE_ENTRY] ", log_label, "_timeout wait_ms=", int(waited * 1000.0))
	return false


func _await_cloud_cover_presented(cloud: Node, log_label: String, started_ticks: int) -> void:
	var closed: bool = await _await_signal_or_timeout(cloud, "close_finished", 2.5, log_label)
	if not closed and cloud.has_method("cover_instant"):
		cloud.cover_instant()
		print("[BATTLE_ENTRY] ", log_label, "_forced_cover elapsed_ms=", Time.get_ticks_msec() - started_ticks)
	# `close_finished` is emitted during frame processing. Wait until that fully
	# covered frame has actually reached the browser before doing synchronous
	# resource setup or shader compilation.
	await RenderingServer.frame_post_draw
	print("[BATTLE_ENTRY] ", log_label, "_presented elapsed_ms=", Time.get_ticks_msec() - started_ticks)


func _start_cloud_covered_combat_warmup(log_label: String, started_ticks: int) -> Node:
	print("[BATTLE_ENTRY] combat_warmup_start cover=presented label=", log_label, " elapsed_ms=", Time.get_ticks_msec() - started_ticks)
	return _start_hidden_combat_warmup()


func _clear_battle_entry_overlay(reason: String) -> void:
	var bridge: Node = bs._bridge if bs else null
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false, "reason": reason})


func _watch_battle_entry_switch(seq: int, started_ticks: int, label: String) -> void:
	await bs.get_tree().create_timer(6.0).timeout
	if seq != _battle_entry_switch_seq:
		return
	if is_viewing_enemy:
		print("[BATTLE_ENTRY] ", label, "_watch_ok elapsed_ms=", Time.get_ticks_msec() - started_ticks)
		return
	if not _find_in_progress:
		print("[BATTLE_ENTRY] ", label, "_watch_not_in_progress elapsed_ms=", Time.get_ticks_msec() - started_ticks)
		return
	print("[BATTLE_ENTRY] ", label, "_watch_stuck elapsed_ms=", Time.get_ticks_msec() - started_ticks, " forcing_reveal=true")
	_find_in_progress = false
	var cloud: Node = bs._get_or_create_cloud()
	if cloud and cloud.has_method("hide_now"):
		cloud.hide_now()
	elif cloud:
		cloud.reveal()
	_clear_battle_entry_overlay("%s_watchdog" % label)
	if bs.find_button:
		bs.find_button.disabled = false
		bs.find_button.visible = true
		bs.find_button.text = "Find Enemy"


func _run_battle_entry_switch(combat_warmup: Variant, warmup_already_waited: bool, seq: int, started_ticks: int, label: String) -> void:
	var safe_warmup: Node = null
	if is_instance_valid(combat_warmup) and combat_warmup is Node:
		safe_warmup = combat_warmup
	print("[BATTLE_ENTRY] ", label, "_runner_start seq=", seq, " elapsed_ms=", Time.get_ticks_msec() - started_ticks, " warmup_valid=", safe_warmup != null, " enemy_has_buildings=", enemy_info.has("buildings"))
	await _switch_to_enemy_island_covered(safe_warmup, warmup_already_waited)
	print("[BATTLE_ENTRY] ", label, "_runner_done seq=", seq, " elapsed_ms=", Time.get_ticks_msec() - started_ticks, " viewing=", is_viewing_enemy, " in_progress=", _find_in_progress)


func _dispatch_battle_entry_switch(combat_warmup: Variant, warmup_already_waited: bool, started_ticks: int, label: String) -> void:
	_battle_entry_switch_seq += 1
	var seq: int = _battle_entry_switch_seq
	print("[BATTLE_ENTRY] ", label, "_dispatch seq=", seq, " elapsed_ms=", Time.get_ticks_msec() - started_ticks, " warmup_already_waited=", warmup_already_waited, " warmup_valid=", is_instance_valid(combat_warmup) and combat_warmup is Node)
	_run_battle_entry_switch(combat_warmup, warmup_already_waited, seq, started_ticks, label)
	_watch_battle_entry_switch(seq, started_ticks, label)

## Kicks off the enemy search flow. The cloud closes immediately; fleet
## snapshotting and scene preparation happen while the home island is covered.
func _on_find_pressed(tournament_id: int = 0) -> void:
	if is_viewing_enemy or _find_in_progress:
		return
	var entry_started_ticks: int = Time.get_ticks_msec()
	var net: Node = bs._net
	if not net or not net.has_token():
		print("Not logged in")
		return
	var latest_resources: Variant = await net.get_resources()
	if latest_resources is Dictionary and not latest_resources.has("error"):
		bs._apply_resources_from_server(latest_resources)
	var attack_cost: int = _get_attack_cost_gold()
	if int(bs.resources.get("gold", 0)) < attack_cost:
		var bridge0 = bs._bridge
		if bridge0:
			bridge0.send_to_react("error", {"message": "Need %d gold to attack" % attack_cost})
		return
	var audio = bs.get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_pre_attack"):
		audio.play_pre_attack()
	_find_in_progress = true
	if bs.find_button:
		bs.find_button.disabled = true
		bs.find_button.text = "Finding..."
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true, "message": "Finding opponent..."})
	var cloud: Node = bs._get_or_create_cloud()
	cloud.close()
	await _await_cloud_cover_presented(cloud, "cloud_close", entry_started_ticks)
	print("[BATTLE_ENTRY] cloud_closed elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks)
	var combat_warmup: Node = _start_cloud_covered_combat_warmup("find_enemy", entry_started_ticks)
	# Snapshot before hiding/freeing any home units. This work is now concealed
	# by the cloud instead of being presented as boarding/sailing animation.
	_saved_fleet = await bs._build_fleet()
	_hide_home_fleet_for_transition()
	print("[BATTLE_ENTRY] fleet_hidden elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks, " ships=", _saved_fleet.size())
	await _await_hidden_combat_warmup(combat_warmup)
	if bs.find_button:
		bs.find_button.text = "Searching..."
	var result: Dictionary = await net.find_enemy(tournament_id)
	print("[BATTLE_ENTRY] find_enemy_done elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks)
	if bs.find_button:
		bs.find_button.disabled = false
		bs.find_button.text = "Find Enemy"
	if result.has("error"):
		print("Find enemy error: ", result.error)
		_find_in_progress = false
		if audio and audio.has_method("play_base"):
			audio.play_base()
		cloud.reveal()
		await cloud.reveal_finished
		if bridge2:
			bridge2.send_to_react("cloud_transition", {"visible": false})
			bridge2.send_to_react("error", {"message": result.error})
		_restore_ships_and_troops()
		return
	if result.has("attacker_resources") and result.attacker_resources is Dictionary:
		bs._apply_resources_from_server(result.attacker_resources)
	enemy_info = result
	print("[BATTLE_ENTRY] switch_call elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks, " dispatch_next=true")
	# The hidden warmup node queues itself for deletion as soon as it finishes.
	# Passing that stale Node into the next typed call can abort before the
	# switch function prints anything. We only need the fact that warmup already
	# ran, so intentionally drop the node reference here.
	_dispatch_battle_entry_switch(null, true, entry_started_ticks, "switch")

func _on_revenge_pressed(source_battle_id: int) -> void:
	if is_viewing_enemy or _find_in_progress:
		return
	if source_battle_id <= 0:
		return
	var entry_started_ticks: int = Time.get_ticks_msec()
	var net: Node = bs._net
	if not net or not net.has_token():
		print("Not logged in")
		return
	var latest_resources: Variant = await net.get_resources()
	if latest_resources is Dictionary and not latest_resources.has("error"):
		bs._apply_resources_from_server(latest_resources)
	var attack_cost: int = _get_attack_cost_gold()
	if int(bs.resources.get("gold", 0)) < attack_cost:
		var bridge0: Node = bs._bridge
		if bridge0:
			bridge0.send_to_react("error", {"message": "Need %d gold to revenge" % attack_cost})
		return
	var audio: Node = bs.get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_pre_attack"):
		audio.play_pre_attack()
	_find_in_progress = true
	if bs.find_button:
		bs.find_button.disabled = true
		bs.find_button.text = "Finding..."
	var bridge2: Node = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true, "message": "Finding opponent..."})
	var cloud: Node = bs._get_or_create_cloud()
	cloud.close()
	await _await_cloud_cover_presented(cloud, "revenge_cloud_close", entry_started_ticks)
	print("[BATTLE_ENTRY] revenge_cloud_closed elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks)
	var combat_warmup: Node = _start_cloud_covered_combat_warmup("revenge", entry_started_ticks)
	_saved_fleet = await bs._build_fleet()
	_hide_home_fleet_for_transition()
	print("[BATTLE_ENTRY] revenge_fleet_hidden elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks, " ships=", _saved_fleet.size())
	await _await_hidden_combat_warmup(combat_warmup)
	if bs.find_button:
		bs.find_button.text = "Revenge..."
	var result: Dictionary = await net.start_revenge(source_battle_id)
	print("[BATTLE_ENTRY] revenge_done elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks)
	if bs.find_button:
		bs.find_button.disabled = false
		bs.find_button.text = "Find Enemy"
	if result.has("error"):
		print("Revenge error: ", result.error)
		_find_in_progress = false
		if audio and audio.has_method("play_base"):
			audio.play_base()
		cloud.reveal()
		await cloud.reveal_finished
		if bridge2:
			bridge2.send_to_react("cloud_transition", {"visible": false})
			bridge2.send_to_react("error", {"message": result.error})
		_restore_ships_and_troops()
		return
	if result.has("attacker_resources") and result.attacker_resources is Dictionary:
		bs._apply_resources_from_server(result.attacker_resources)
	enemy_info = result
	print("[BATTLE_ENTRY] revenge_switch_call elapsed_ms=", Time.get_ticks_msec() - entry_started_ticks, " dispatch_next=true")
	# The warmup node self-frees after completion; do not pass the stale Node
	# reference into the island switch path.
	_dispatch_battle_entry_switch(null, true, entry_started_ticks, "revenge_switch")


## Hides the persistent home fleet only after the cloud is fully covering the
## island. Search failures restore these nodes through the existing recovery.
func _hide_home_fleet_for_transition() -> void:
	bs._saved_ship_transforms.clear()
	bs._saved_port_ships.clear()
	var main_ship_controller: Node = bs.get_node_or_null("../MainShipController")
	if main_ship_controller and main_ship_controller.has_method("hide_for_battle_transition"):
		main_ship_controller.hide_for_battle_transition()
	else:
		push_error("BattleSystem: MainShipController is unavailable")
	for ht in bs._home_troops:
		var troop: Node = ht.get("node")
		if is_instance_valid(troop):
			troop.visible = false


## Restores ships to their saved transforms and makes home troops visible again.
## Called when enemy search fails or after returning home.
func _restore_ships_and_troops() -> void:
	if bs and bs.has_method("_restore_home_player_flag"):
		bs._restore_home_player_flag()
	var main_ship_controller: Node = bs.get_node_or_null("../MainShipController")
	if main_ship_controller and main_ship_controller.has_method("force_home"):
		main_ship_controller.force_home()
	for data in bs._saved_ship_transforms:
		var ship = data.get("node")
		if is_instance_valid(ship):
			ship.global_position = data.pos
			ship.rotation.y = data.rot_y
			ship.visible = true
	bs._saved_ship_transforms.clear()
	for ht in bs._home_troops:
		var troop: Node = ht.get("node")
		if is_instance_valid(troop):
			troop.visible = true
			troop.set_process(true)
			if "state" in troop:
				troop.state = BaseTroop.State.RUNNING


## Switches to the enemy island with a full cloud-close transition.
## Used when jumping to an enemy without having sailed first (e.g. direct
## attack from the main menu).
func _switch_to_enemy_island() -> void:
	var switch_started_ticks: int = Time.get_ticks_msec()
	_victory_declared = false
	_reset_troop_death_reports()
	if _saved_fleet.is_empty():
		_saved_fleet = await bs._build_fleet()
	_battle_replay.clear()
	_battle_start_time = Time.get_ticks_msec() / 1000.0
	_battle_timer = 0.0
	_battle_timer_active = true
	if bs._cannon and bs._cannon.has_method("reset"):
		bs._cannon.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._rally:
		bs._rally.reset()
	if bs._medkit:
		bs._medkit.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._freeze:
		bs._freeze.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._rage:
		bs._rage.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._skeleton_barrel:
		bs._skeleton_barrel.reset(_ship_level_from_fleet(_saved_fleet))
	_battle_replay.append({
		"type": "battle_start",
		"battle_session_id": str(enemy_info.get("battle_session_id", "")),
		"combat_grid_version": str(enemy_info.get("combat_grid_version", "")),
		"grid_configs": _battle_grid_configs(),
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
	# Free home troops and port ships immediately — consumed by the attack
	_free_home_troops_and_ships()
	for bsys in bs._building_systems:
		bsys._production._hide_all_collect_icons()
		# Deselect any home-side building before flipping to enemy view —
		# otherwise leftover UI (move arrows, range indicator, building panel)
		# stays parented to the BS and reappears overlaid on the enemy island
		# at the local coordinates of the previously selected home building.
		if bsys.has_method("_deselect_building"):
			bsys._deselect_building()
		if "_battle" in bsys and bsys._battle:
			bsys._battle.is_viewing_enemy = true
			bsys._battle._find_in_progress = false
	print("[BATTLE_ENTRY] switch_enemy_mode_set elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
	var bridge = bs._bridge
	if bridge:
		var enemy_res: Dictionary = enemy_info.get("resources", {})
		var loot_preview_value: Variant = enemy_info.get("loot_preview", {})
		var loot_preview: Dictionary = loot_preview_value if loot_preview_value is Dictionary else {}
		var enemy_town_hall_level: int = _enemy_town_hall_level(enemy_info)
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": enemy_info.get("name", "???"),
			"level": enemy_town_hall_level,
			"town_hall_level": enemy_town_hall_level,
			"trophies": enemy_info.get("trophies", 0),
			"gold": enemy_res.get("gold", 0),
			"wood": enemy_res.get("wood", 0),
			"ore": enemy_res.get("ore", 0),
			"loot_preview": loot_preview,
			"attack_cost_gold": enemy_info.get("attack_cost_gold", 0),
		})
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true, "message": "Loading opponent..."})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await _await_cloud_cover_presented(cloud, "direct_switch_cloud_close", switch_started_ticks)
	var combat_warmup: Node = _start_cloud_covered_combat_warmup("direct_switch", switch_started_ticks)
	await _finish_hidden_combat_warmup_under_cloud(
		combat_warmup,
		"direct_switch",
		switch_started_ticks
	)
	if bs._cannon and bs._cannon.has_method("_preload_explosion_textures"):
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
	var revealed: bool = await _await_signal_or_timeout(cloud, "reveal_finished", 2.5, "direct_switch_cloud_reveal")
	if not revealed and cloud.has_method("hide_now"):
		cloud.hide_now()
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode(_saved_fleet)


## Switches to the enemy island after the caller has covered the home scene
## and hidden its fleet. This path intentionally contains no departure sail.
func _switch_to_enemy_island_covered(combat_warmup: Variant = null, warmup_already_waited: bool = false) -> void:
	var switch_started_ticks: int = Time.get_ticks_msec()
	var safe_warmup: Node = null
	if is_instance_valid(combat_warmup) and combat_warmup is Node:
		safe_warmup = combat_warmup
	if not warmup_already_waited or not _is_hidden_combat_warmup_ready():
		await _finish_hidden_combat_warmup_under_cloud(
			safe_warmup,
			"covered_switch",
			switch_started_ticks
		)
	var enemy_buildings_value: Variant = enemy_info.get("buildings", [])
	var enemy_building_count: int = enemy_buildings_value.size() if enemy_buildings_value is Array else 0
	print("[BATTLE_ENTRY] switch_start enemy=", str(enemy_info.get("name", "???")), " buildings=", enemy_building_count)
	_victory_declared = false
	_reset_troop_death_reports()
	_battle_replay.clear()
	_battle_start_time = Time.get_ticks_msec() / 1000.0
	_battle_timer = 0.0
	_battle_timer_active = true
	if bs._cannon and bs._cannon.has_method("reset"):
		bs._cannon.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._rally:
		bs._rally.reset()
	if bs._medkit:
		bs._medkit.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._freeze:
		bs._freeze.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._rage:
		bs._rage.reset(_ship_level_from_fleet(_saved_fleet))
	if bs._skeleton_barrel:
		bs._skeleton_barrel.reset(_ship_level_from_fleet(_saved_fleet))
	_battle_replay.append({
		"type": "battle_start",
		"battle_session_id": str(enemy_info.get("battle_session_id", "")),
		"combat_grid_version": str(enemy_info.get("combat_grid_version", "")),
		"grid_configs": _battle_grid_configs(),
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
	# Free home troops and port ships immediately — they are consumed by the attack
	_free_home_troops_and_ships()
	print("[BATTLE_ENTRY] switch_freed_home elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		if "_production" in bsys and bsys._production:
			bsys._production._hide_all_collect_icons()
		# Deselect any home-side building before flipping to enemy view —
		# otherwise leftover UI (move arrows, range indicator, building panel)
		# stays parented to the BS and reappears overlaid on the enemy island
		# at the local coordinates of the previously selected home building.
		if bsys.has_method("_deselect_building"):
			bsys._deselect_building()
		if "_battle" in bsys and bsys._battle:
			bsys._battle.is_viewing_enemy = true
			bsys._battle._find_in_progress = false
	print("[BATTLE_ENTRY] switch_enemy_mode_set elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
	var bridge = bs._bridge
	if bridge:
		var enemy_res: Dictionary = enemy_info.get("resources", {})
		var loot_preview_value: Variant = enemy_info.get("loot_preview", {})
		var loot_preview: Dictionary = loot_preview_value if loot_preview_value is Dictionary else {}
		var enemy_town_hall_level: int = _enemy_town_hall_level(enemy_info)
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": enemy_info.get("name", "???"),
			"level": enemy_town_hall_level,
			"town_hall_level": enemy_town_hall_level,
			"trophies": enemy_info.get("trophies", 0),
			"gold": enemy_res.get("gold", 0),
			"wood": enemy_res.get("wood", 0),
			"ore": enemy_res.get("ore", 0),
			"loot_preview": loot_preview,
			"attack_cost_gold": enemy_info.get("attack_cost_gold", 0),
		})
	if bs._cannon and bs._cannon.has_method("_preload_explosion_textures"):
		bs._cannon._preload_explosion_textures()
	print("[BATTLE_ENTRY] switch_preload_done elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		if bsys.has_method("_destroy_all_buildings"):
			bsys._destroy_all_buildings()
	print("[BATTLE_ENTRY] switch_destroyed_home_buildings elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
	if enemy_info.has("buildings") and enemy_info.buildings is Array:
		for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
			if bsys.has_method("_load_buildings_from_server"):
				bsys._load_buildings_from_server(enemy_info.buildings)
	print("[BATTLE_ENTRY] switch_loaded_enemy_buildings elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
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
	var revealed: bool = await _await_signal_or_timeout(cloud, "reveal_finished", 2.5, "cloud_reveal")
	if not revealed and cloud.has_method("hide_now"):
		cloud.hide_now()
		print("[BATTLE_ENTRY] cloud_reveal_forced elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": false})
	var attack_system = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode(_saved_fleet)
		print("[BATTLE_ENTRY] attack_mode_entered elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks, " fleet=", _saved_fleet.size())
	else:
		print("[BATTLE_ENTRY] attack_mode_missing elapsed_ms=", Time.get_ticks_msec() - switch_started_ticks)
		if bridge2:
			bridge2.send_to_react("error", {"message": "Attack system failed to start. Please reload and try again."})


## Returns the player to their home island: tears down enemy state, reloads
## home buildings from the server, restores ships and troops, and cleans up
## all battle UI elements.
func _return_home() -> void:
	var audio = bs.get_node_or_null("/root/AudioManager") if bs else null
	if audio and audio.has_method("play_base"):
		audio.play_base()
	if not is_viewing_enemy:
		_cleanup_combat_runtime_nodes()
		return
	if _returning_home:
		return
	_returning_home = true
	# Surrender — record it so the matchmaker's 24h personal cooldown excludes
	# this defender from the next Find Enemy. We deliberately DON'T submit a
	# full battle_replays row (no replay payload, no trophy/loot transfer);
	# the server's lightweight /battle/surrender endpoint just stamps the
	# battle_session row. Skipped on victory return-home or replay playback.
	if not _replay_active and not _victory_declared:
		var net_surrender: Node = bs._net
		var def_id_surrender: String = enemy_info.get("id", "")
		var sid_surrender: String = str(enemy_info.get("battle_session_id", ""))
		if net_surrender and net_surrender.has_token() and def_id_surrender != "" and net_surrender.has_method("submit_surrender"):
			_victory_declared = true  # block _force_defeat / check_defeat from firing
			_record_battle_end("surrendered")
			# Fire-and-forget: don't block return-home animation on the round-trip.
			net_surrender.submit_surrender(def_id_surrender, sid_surrender)
	_replay_active = false
	_battle_timer_active = false
	_battle_timer = 0.0
	_replay_duration = 0.0
	_replay_elapsed = 0.0
	_clear_replay_timer()
	_restore_replay_clock()
	bs._cannon._exit_ship_cannon_mode()
	if bs._rally:
		bs._rally._exit_rally_mode()
		bs._rally.reset()
	if bs._medkit:
		bs._medkit._exit_medkit_mode()
		bs._medkit.reset()
	if bs._freeze:
		bs._freeze.reset()
	if bs._rage:
		bs._rage.reset()
	if bs._skeleton_barrel:
		bs._skeleton_barrel.reset()
	# Legacy local sessions may still have a cached port ship transform.
	for data in bs._saved_ship_transforms:
		var restore_ship: Node3D = data.get("node")
		if is_instance_valid(restore_ship):
			restore_ship.global_position = data.pos
			restore_ship.rotation.y = data.rot_y
	bs._saved_ship_transforms.clear()
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
	_freeze_combat_runtime_nodes()
	await bs.get_tree().process_frame
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": true})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await _await_signal_or_timeout(cloud, "close_finished", 2.5, "return_home_cloud_close")
	_cleanup_combat_runtime_nodes()
	for bsys in bs._building_systems:
		bsys._destroy_all_buildings()
	var net: Node = bs._net
	if net and net.has_token():
		var login_result: Dictionary = await net.login()
		if not is_instance_valid(bs):
			_returning_home = false
			return
		# Apply full server state (resources, buildings, troop_levels) so
		# loot earned during the attack is reflected in Godot immediately.
		if login_result.has("id"):
			bs._on_server_auth_ok(login_result)
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
	_victory_declared = false
	if bs.has_method("_restore_home_player_flag"):
		bs._restore_home_player_flag()
	var main_ship_controller: Node = bs.get_node_or_null("../MainShipController")
	if main_ship_controller and main_ship_controller.has_method("force_home"):
		main_ship_controller.force_home()
	cloud.reveal()
	var revealed: bool = await _await_signal_or_timeout(cloud, "reveal_finished", 2.5, "return_home_cloud_reveal")
	if not revealed and cloud.has_method("hide_now"):
		cloud.hide_now()
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})
	# Ships and troops were already freed in _free_home_troops_and_ships
	# when we switched to enemy island. Just clean up remaining state.
	bs._saved_ship_transforms.clear()
	bs._saved_port_ships.clear()
	bs._port.owned_ships = 0
	bs._home_troops.clear()
	_returning_home = false


## Handles town hall destruction: sets troops to VICTORY, then destroys
## remaining buildings one-by-one with staggered explosions. Victory screen
## shows only after the last building is gone.
const CHAIN_DESTROY_DELAY: float = 0.6  ## seconds between each building explosion (puff + crumple takes ~0.4s, so 0.6 leaves a natural beat)
const VICTORY_ADMIRE_DELAY: float = 2.5  ## seconds to hold on the ruined island before opening the victory modal
const REPLAY_OUTCOME_POLL_INTERVAL: float = 0.1


static func _should_chain_destroy_building(building_id: String) -> bool:
	return building_id != "town_hall" and building_id != "shark_trap"

func _on_town_hall_destroyed() -> void:
	if _victory_declared:
		return
	_battle_timer_active = false
	_victory_declared = true
	var audio = bs.get_node_or_null("/root/AudioManager") if bs else null
	if audio and audio.has_method("play_result"):
		audio.play_result()
	if not _replay_active:
		_record_battle_end("victory")
	_stop_defensive_combat_after_town_hall_destroyed()
	_stop_attacker_combat_after_town_hall_destroyed(false)
	if is_instance_valid(bs):
		await bs.get_tree().process_frame

	# 1. Set all spawned troops to VICTORY after cleanup (they stop fighting).
	# Very fast TH kills can happen while ship troops are still in delayed spawn,
	# so casualties come from actual death reports, not deployed-minus-survivors.
	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop) and "state" in troop:
			if troop.has_method("_play_victory"):
				if troop.state != troop.State.VICTORY:
					troop._play_victory()
			else:
				troop.state = troop.State.VICTORY

	# 2. Collect remaining ALIVE buildings. Town Hall is already gone; Shark
	# Traps were silently neutralized above and never join the explosion cascade.
	var remaining: Array = []
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			if not _should_chain_destroy_building(str(b.get("id", ""))):
				continue
			if not is_instance_valid(b.get("node")):
				continue
			if b.get("hp", 0) <= 0:
				continue
			remaining.append({"b": b, "bsys": bsys})
	# Shuffle for random destruction order
	remaining.shuffle()

	# Count casualties from troops that actually died before victory.
	# Doing it here means we can kick off the server submit in parallel with
	# the chain-destroy animation. Only actual death reports are submitted;
	# delayed-spawn troops are not counted as lost.
	var casualties_early: Dictionary = _seal_troop_death_report()

	# Fire the server submit in the background so its round-trip (1-3 s)
	# overlaps with the chain-destroy animation + admire delay instead of
	# adding on top. GDScript won't let us capture a coroutine's return
	# without `await`, so `_run_submit_bg` is a fire-and-forget wrapper that
	# stores the result in `_submit_result` + sets `_submit_complete` when
	# done. The consumer below polls that flag.
	_submit_complete = false
	_submit_result = {}
	var submit_pending: bool = false
	var net_node_early: Node = bs._net
	var defender_id_early: String = enemy_info.get("id", "")
	if net_node_early and net_node_early.has_token() and defender_id_early != "":
		submit_pending = true
		_run_submit_bg(net_node_early, defender_id_early, casualties_early)

	# 3. Destroy buildings one by one with delay
	for entry in remaining:
		if not is_instance_valid(bs):
			return
		await bs.get_tree().create_timer(CHAIN_DESTROY_DELAY).timeout
		if not is_instance_valid(bs):
			return
		# Force any late-spawned troops into VICTORY (they may have spawned during the delay)
		for troop in bs.get_tree().get_nodes_in_group("troops"):
			if is_instance_valid(troop) and "state" in troop and troop.state != troop.State.VICTORY:
				if troop.has_method("_play_victory"):
					troop._play_victory()
		var b: Dictionary = entry.b
		var bsys: Node = entry.bsys
		if not is_instance_valid(b.get("node")):
			continue
		# Skip already-destroyed buildings (troops may have killed it during the delay)
		if b.get("hp", 0) <= 0:
			continue
		# Tombstone → remove skeletons
		if b.id == "tombstone":
			bsys._remove_tombstone_skeletons(b)
		# Port → sink ship
		if b.id == "port":
			var pnode: Node3D = b.get("node", null)
			if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
				var ship: Node3D = pnode.get_meta("ship_node")
				if is_instance_valid(ship):
					bs._sink_ship(ship)
		# HP bar cleanup
		if b.has("hp_bar") and is_instance_valid(b.hp_bar):
			b.hp_bar.queue_free()
		var icon: Control = b.get("_collect_icon")
		if is_instance_valid(icon):
			icon.queue_free()
		# Puff-up swell + fire-bomb explosion + ruins — same sequence used for
		# normal troop-killed buildings, routed through BuildingSystem so both
		# paths produce identical visuals.
		if is_instance_valid(b.node):
			var bnode_ref: Node3D = b.node
			bnode_ref.set_process(false)
			bnode_ref.set_physics_process(false)
			bsys.explode_building_with_swell(bnode_ref, b.get("id", ""))

	# 4. Clear all building arrays
	for bsys in bs._building_systems:
		bsys.placed_buildings.clear()
		bsys.grid.fill(false)

	# 4b. Savour the destruction — let the player admire the ruined island for
	# a beat before the victory modal covers it. Runs AFTER the cascade so
	# every explosion is visible + settled.
	if not is_instance_valid(bs): return
	await bs.get_tree().create_timer(VICTORY_ADMIRE_DELAY).timeout
	if not is_instance_valid(bs): return

	# 5. Harvest the in-flight server submit. Because we kicked it off BEFORE
	# the chain-destroy loop AND the admire delay, the round-trip almost
	# always completes in the background — so awaiting here is typically
	# instant. If the server IS slower than chain + admire, we eat the
	# remaining wait here instead of showing an empty victory screen.
	var bridge: Node = bs._bridge
	if submit_pending:
		# Poll until the background submit finishes — usually already done
		# by the time we get here (server ~1-3s vs chain + admire ~6s).
		while not _submit_complete:
			if not is_instance_valid(bs): return
			await bs.get_tree().process_frame
		var result: Dictionary = _submit_result
		if not is_instance_valid(bs): return
		if result.has("error"):
			var error_message: String = str(result.get("error", "Battle result was not recorded.")).strip_edges()
			var reason_message: String = str(result.get("reason", "")).strip_edges()
			if reason_message != "":
				error_message = ("%s %s" % [error_message, reason_message]).strip_edges()
			if bridge:
				bridge.send_to_react("battle_result", {
					"type": "error",
					"title": "Battle not recorded",
					"message": error_message,
					"reason": error_message,
				})
			return
		if result.has("ships"):
			bs._apply_ships_from_server(result.get("ships", []))
		if result.has("trophies"):
			var net_after_result: Node = bs._net
			if net_after_result:
				net_after_result.trophies = int(result.get("trophies", net_after_result.trophies))
			if bs.has_method("_update_resource_ui"):
				bs._update_resource_ui()
		var loot: Dictionary = result.get("loot", {})
		var server_casualties: Dictionary = result.get("casualties", casualties_early)
		if bridge:
			if loot.get("gold", 0) > 0 or loot.get("wood", 0) > 0 or loot.get("ore", 0) > 0:
				bridge.send_to_react("resources_add", {
					"gold": loot.get("gold", 0),
					"wood": loot.get("wood", 0),
					"ore": loot.get("ore", 0),
				})
			bridge.send_to_react("battle_result", {
				"type": "victory",
				"loot": loot,
				"casualties": server_casualties,
				"trophy_base": result.get("trophy_base", 0),
				"trophy_bonus": result.get("trophy_bonus", 0),
				"trophy_bonus_level": result.get("trophy_bonus_level", 0),
				"trophy_bonus_range": result.get("trophy_bonus_range", {}),
				"trophy_delta": result.get("trophy_delta", 0),
				"trophies": result.get("trophies", 0),
			})
		return
	if bridge:
		bridge.send_to_react("battle_result", {"type": "victory", "loot": {}, "casualties": casualties_early})


## Replay-only version of the Town Hall victory cascade. It mirrors the live
## visual logic, but skips result submission and modal dispatch because the
## replay was already settled on the server.
func _on_replay_town_hall_destroyed() -> void:
	if _replay_chain_destroying:
		return
	_replay_chain_destroying = true
	_victory_declared = true
	var audio = bs.get_node_or_null("/root/AudioManager") if bs else null
	if audio and audio.has_method("play_result"):
		audio.play_result()
	record_replay_telemetry("chain_destroy_start", {"reason": "town_hall_destroyed"})
	_stop_defensive_combat_after_town_hall_destroyed()
	_stop_attacker_combat_after_town_hall_destroyed(false)
	if is_instance_valid(bs):
		await bs.get_tree().process_frame

	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop) and "state" in troop:
			if troop.has_method("_play_victory"):
				if troop.state != troop.State.VICTORY:
					troop._play_victory()
			else:
				troop.state = troop.State.VICTORY

	var remaining: Array = []
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			if not _should_chain_destroy_building(str(b.get("id", ""))):
				continue
			if not is_instance_valid(b.get("node")):
				continue
			if b.get("hp", 0) <= 0:
				continue
			remaining.append({"b": b, "bsys": bsys})
	remaining.shuffle()

	for entry in remaining:
		if not _replay_active or not is_instance_valid(bs):
			_replay_chain_destroying = false
			return
		await bs.get_tree().create_timer(CHAIN_DESTROY_DELAY).timeout
		if not _replay_active or not is_instance_valid(bs):
			_replay_chain_destroying = false
			return
		for troop in bs.get_tree().get_nodes_in_group("troops"):
			if is_instance_valid(troop) and "state" in troop and troop.state != troop.State.VICTORY:
				if troop.has_method("_play_victory"):
					troop._play_victory()

		var b: Dictionary = entry.b
		var bsys: Node = entry.bsys
		if not is_instance_valid(b.get("node")):
			continue
		if b.get("hp", 0) <= 0:
			continue
		b["hp"] = 0
		record_replay_telemetry("building_destroyed", {
			"type": str(b.get("id", "")),
			"server_id": int(b.get("server_id", -1)),
			"grid_x": int(b.get("grid_pos", Vector2i.ZERO).x),
			"grid_z": int(b.get("grid_pos", Vector2i.ZERO).y),
			"hp": 0,
			"chain_destroy": true,
		})
		if b.id == "tombstone":
			bsys._remove_tombstone_skeletons(b)
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
			var bnode_ref: Node3D = b.node
			bnode_ref.set_process(false)
			bnode_ref.set_physics_process(false)
			bsys.explode_building_with_swell(bnode_ref, b.get("id", ""))

	for bsys in bs._building_systems:
		bsys.placed_buildings.clear()
		bsys.grid.fill(false)
	record_replay_telemetry("chain_destroy_end", {"destroyed": remaining.size()})
	_replay_chain_destroying = false


## Fire-and-forget wrapper around submit_battle_result. Void return lets the
## caller invoke without `await` (GDScript allows calling void coroutines
## bare). Result is stashed on the instance for the caller to pick up after
## the chain-destroy + admire delay.
func _run_submit_bg(net_node: Node, defender_id: String, casualties: Dictionary) -> void:
	var battle_session_id: String = str(enemy_info.get("battle_session_id", ""))
	var result: Dictionary = await net_node.submit_battle_result(defender_id, _battle_replay, "victory", casualties, battle_session_id)
	_submit_result = result
	_submit_complete = true


## Starts a replay of a recorded attack. Loads the buildings snapshot, enters
## enemy-view mode, then hands off to _replay_playback() for timed action
## playback.
func _replay_troops_for_action(action: Dictionary) -> Array:
	var result: Array = []
	if str(action.get("type", "")) == "deploy_troop":
		var troop_entry: String = str(action.get("troop", action.get("troop_entry", action.get("troopType", "")))).strip_edges()
		if troop_entry != "":
			result.append(troop_entry)
		return result
	var raw_troops = action.get("troops", [])
	if raw_troops is Array:
		for troop in raw_troops:
			var troop_name: String = str(troop).strip_edges()
			if troop_name != "":
				result.append(troop_name)
	elif action.has("troopType"):
		var legacy_name: String = str(action.get("troopType", "")).strip_edges()
		if legacy_name != "":
			result.append(legacy_name.capitalize())
	return result


func _replay_fleet_from_actions(actions: Array) -> Array:
	var fleet: Array = []
	var manual_troops: Array = []
	for action in actions:
		if str(action.get("type", "")) == "deploy_troop":
			manual_troops.append_array(_replay_troops_for_action(action))
	if not manual_troops.is_empty():
		var replay_ship_level: int = 1
		for action in actions:
			if str(action.get("type", "")) == "deploy_troop":
				replay_ship_level = clampi(int(action.get("shipLevel", 1)), 1, 10)
				break
		return [{"id": "replay_main_ship", "level": replay_ship_level, "capacity": manual_troops.size(), "troops": manual_troops}]
	for action in actions:
		if action.get("type", "") != "place_ship":
			continue
		var troops: Array = _replay_troops_for_action(action)
		if troops.is_empty():
			continue
		var recorded_levels: Dictionary = {}
		var raw_levels = action.get("troopLevels", action.get("troop_levels", {}))
		if raw_levels is Dictionary:
			recorded_levels = raw_levels
		fleet.append({
			"level": int(action.get("shipLevel", 1)),
			"troops": troops,
			"troop_levels": recorded_levels,
		})
		if fleet.size() >= MAX_REPLAY_SHIPS:
			break
	return fleet


func _replay_duration_from_actions(actions: Array) -> float:
	var max_t: float = 0.0
	for action in actions:
		if action is Dictionary:
			max_t = maxf(max_t, float(action.get("t", 0.0)))
	return max_t


func _resolve_replay_duration(explicit_duration: float, actions: Array) -> float:
	var action_duration: float = _replay_duration_from_actions(actions)
	var resolved: float = maxf(float(explicit_duration), action_duration)
	if resolved <= 0.0:
		return BATTLE_TIME_LIMIT
	return clampf(resolved, 1.0, BATTLE_TIME_LIMIT)


func _send_replay_timer(force: bool = false) -> void:
	if not bs or not bs._bridge:
		return
	if _replay_duration <= 0.0:
		bs._bridge.send_to_react("battle_timer", {"remaining": null})
		return
	var remaining: int = maxi(0, ceili(_replay_duration - _replay_elapsed))
	if not force and remaining == _replay_timer_last_remaining:
		return
	_replay_timer_last_remaining = remaining
	bs._bridge.send_to_react("battle_timer", {"remaining": remaining, "mode": "replay"})


func _clear_replay_timer() -> void:
	_replay_timer_last_remaining = -1
	if bs and bs._bridge:
		bs._bridge.send_to_react("battle_timer", {"remaining": null, "mode": "replay"})


func _replay_wait(seconds: float, stop_on_victory: bool = false) -> bool:
	var target_elapsed: float = _replay_elapsed + maxf(0.0, seconds)
	var tick: float = BaseTroop.REPLAY_COMBAT_DELTA
	while _replay_elapsed + tick * 0.5 < target_elapsed and _replay_active and is_instance_valid(bs):
		await bs.get_tree().physics_frame
		_replay_elapsed = snappedf(_replay_elapsed + tick, 0.000001)
		_send_replay_timer()
		if stop_on_victory and _victory_declared:
			break
	return _replay_active and is_instance_valid(bs)


func _replay_wall_wait(seconds: float) -> bool:
	var left: float = maxf(0.0, seconds)
	while left > 0.0 and _replay_active and is_instance_valid(bs):
		var step: float = minf(0.25, left)
		await bs.get_tree().create_timer(step).timeout
		left -= step
	return _replay_active and is_instance_valid(bs)


func _start_replay(replay_data: Array, buildings_snapshot: Array, attacker_name: String, duration: float = 0.0, replay_label: String = "", base_owner_name: String = "", replay_result: Dictionary = {}) -> void:
	bs.get_tree().paused = false
	_lock_replay_clock()
	_cleanup_combat_runtime_nodes()
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()
	_replay_active = true
	_victory_declared = false
	_replay_actions = replay_data
	_replay_buildings_snapshot = buildings_snapshot
	_replay_duration = _resolve_replay_duration(duration, _replay_actions)
	_replay_elapsed = 0.0
	_replay_timer_last_remaining = -1
	_replay_telemetry.clear()
	_replay_telemetry_seq = 0
	_replay_telemetry_dropped = 0
	_replay_loaded_buildings.clear()
	_replay_chain_destroying = false
	_replay_attacker_name = attacker_name
	_replay_label = replay_label
	_replay_result_payload = replay_result.duplicate(true)
	_replay_wall_start_msec = 0
	var display_name_for_base: String = base_owner_name.strip_edges()
	if display_name_for_base == "":
		display_name_for_base = attacker_name.strip_edges()
	if display_name_for_base == "":
		display_name_for_base = "Unknown"
	enemy_info = {"name": display_name_for_base, "trophies": 0, "buildings": buildings_snapshot}
	record_replay_telemetry("replay_start", {
		"attacker_name": attacker_name,
		"base_owner_name": display_name_for_base,
		"replay_label": replay_label,
		"duration": _replay_duration,
	})
	for bsys in bs._building_systems:
		bsys._production._hide_all_collect_icons()
		# Deselect any home-side building before flipping to enemy view —
		# otherwise leftover UI (move arrows, range indicator, building panel)
		# stays parented to the BS and reappears overlaid on the enemy island
		# at the local coordinates of the previously selected home building.
		bsys._deselect_building()
		bsys._battle.is_viewing_enemy = true
	var bridge = bs._bridge
	if bridge:
		var live_agent_battle: bool = replay_label.to_upper() == "AI ONLINE BATTLE"
		var replay_town_hall_level: int = _enemy_town_hall_level(enemy_info)
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": display_name_for_base,
			"level": replay_town_hall_level,
			"town_hall_level": replay_town_hall_level,
			"trophies": 0,
			"is_replay": true,
			"live_agent_battle": live_agent_battle,
			"replay_label": replay_label,
			"duration": _replay_duration,
		})
		_send_replay_timer(true)
		bridge.send_to_react("cloud_transition", {"visible": true})
	if bs.has_method("_apply_main_ship_flag_url"):
		bs._apply_main_ship_flag_url(_replay_attacker_flag_url(), false)
	var main_ship_controller: Node = bs.get_node_or_null("../MainShipController")
	if main_ship_controller and main_ship_controller.has_method("force_combat"):
		main_ship_controller.force_combat()
	for ht in bs._home_troops:
		if is_instance_valid(ht.get("node")):
			ht.node.visible = false
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	var replay_started_ticks: int = Time.get_ticks_msec()
	await _await_cloud_cover_presented(cloud, "replay_cloud_close", replay_started_ticks)
	var combat_warmup: Node = _start_cloud_covered_combat_warmup("replay", replay_started_ticks)
	await _finish_hidden_combat_warmup_under_cloud(
		combat_warmup,
		"replay",
		replay_started_ticks
	)
	bs._cannon._preload_explosion_textures()
	for bsys in bs._building_systems:
		bsys._destroy_all_buildings()
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()
	for bsys in bs._building_systems:
		bsys._load_buildings_from_server(buildings_snapshot)
	_capture_replay_loaded_buildings()
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()
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
	var replay_fleet: Array = _replay_fleet_from_actions(_replay_actions)
	bs._cannon.reset(_ship_level_from_fleet(replay_fleet))
	if bs._rally:
		bs._rally.reset()
	if bs._medkit:
		bs._medkit.reset(_ship_level_from_fleet(replay_fleet))
	if bs._freeze:
		bs._freeze.reset(_ship_level_from_fleet(replay_fleet))
	if bs._rage:
		bs._rage.reset(_ship_level_from_fleet(replay_fleet))
	if bs._skeleton_barrel:
		bs._skeleton_barrel.reset(_ship_level_from_fleet(replay_fleet))
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_replay_mode"):
		attack_system.enter_replay_mode(replay_fleet)
	Engine.time_scale = 1.0
	BaseTroop.reset_combat_runtime_cache()
	SkeletonGuard.reset_runtime_cache()
	AttackSystem.reset_runtime_cache()
	_replay_wall_start_msec = Time.get_ticks_msec()
	record_replay_telemetry("replay_ready", {"phase": "playback_start"})
	_send_replay_timer(true)
	_replay_playback()


## Plays back recorded battle actions in real time. Waits for each action's
## timestamp, dispatches place_ship and cannon_fire events, then waits for
## the battle to naturally conclude before signalling replay_end to the HUD.
func _replay_playback() -> void:
	var actions: Array = []
	for a in _replay_actions:
		if a.get("type", "") in [
			"place_ship",
			"deploy_troop",
			"cannon_fire",
			"rally_drop",
			"medkit_drop",
			"freeze_drop",
			"rage_drop",
			"skeleton_barrel_fire",
		]:
			actions.append(a)
	actions.sort_custom(func(a, b): return float(a.get("t", 0.0)) < float(b.get("t", 0.0)))
	if actions.is_empty():
		_replay_active = false
		_clear_replay_timer()
		return
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	var prev_t: float = 0.0
	var replay_seen_troops: bool = false
	var replay_outcome_reason: String = ""
	for i in actions.size():
		if not _replay_active or not is_instance_valid(bs):
			return
		if _victory_declared:
			replay_outcome_reason = "town_hall_destroyed"
			record_replay_telemetry("replay_actions_stopped", {
				"reason": "victory_declared",
				"next_action": str(actions[i].get("type", "")),
				"next_t": float(actions[i].get("t", 0.0)),
			})
			break
		var action: Dictionary = actions[i]
		var t: float = action.get("t", 0.0)
		var delay: float = t - prev_t
		if delay > 0:
			var action_wait_ok: bool = await _replay_wait(delay, true)
			if not action_wait_ok:
				return
		if not _replay_active or not is_instance_valid(bs):
			return
		if _victory_declared:
			replay_outcome_reason = "town_hall_destroyed"
			record_replay_telemetry("replay_actions_stopped", {
				"reason": "victory_declared",
				"next_action": str(action.get("type", "")),
				"next_t": t,
			})
			break
		prev_t = t
		match action.get("type", ""):
			"place_ship":
				_replay_place_ship(action, attack_system)
			"deploy_troop":
				_replay_deploy_troop(action, attack_system)
			"cannon_fire":
				_replay_cannon_fire(action)
			"rally_drop":
				_replay_rally_drop(action)
			"medkit_drop":
				_replay_medkit_drop(action)
			"freeze_drop":
				_replay_freeze_drop(action)
			"rage_drop":
				_replay_rage_drop(action)
			"skeleton_barrel_fire":
				_replay_skeleton_barrel_fire(action)
	while replay_outcome_reason == "" and _replay_active and is_instance_valid(bs):
		var settle_wait_ok: bool = await _replay_wait(REPLAY_OUTCOME_POLL_INTERVAL)
		if not settle_wait_ok:
			return
		if not _replay_active:
			return
		var th_alive: bool = false
		for bsys in bs._building_systems:
			for b in bsys.placed_buildings:
				if b.get("id", "") == "town_hall" and b.get("hp", 0) > 0:
					th_alive = true
					break
		if not th_alive:
			replay_outcome_reason = "town_hall_destroyed"
			record_replay_telemetry("replay_outcome_detected", {"reason": replay_outcome_reason})
			break
		var troops_alive: int = BaseTroop._get_troops_cached().size()
		var guards_alive: int = 0
		for guard in BaseTroop._get_guards_list_cached():
			if is_instance_valid(guard) and guard.is_inside_tree() and guard.get("hp") != null and int(guard.get("hp")) > 0:
				guards_alive += 1
		if troops_alive > 0:
			replay_seen_troops = true
		if replay_seen_troops and troops_alive == 0:
			replay_outcome_reason = "troops_destroyed"
			record_replay_telemetry("replay_outcome_detected", {"reason": replay_outcome_reason})
			break
		var expected_result: String = str(_replay_info().get("expected_result", ""))
		if expected_result == "defeat" and _replay_elapsed + 0.0001 >= BATTLE_TIME_LIMIT:
			replay_outcome_reason = "time_expired"
			record_replay_telemetry("replay_outcome_detected", {
				"reason": replay_outcome_reason,
				"expected_result": expected_result,
				"elapsed": snappedf(_replay_elapsed, 0.01),
				"duration": snappedf(_replay_duration, 0.01),
				"troops_alive": troops_alive,
				"guards_alive": guards_alive,
			})
			_freeze_combat_runtime_nodes()
			break
	if _replay_active and replay_outcome_reason == "" and _replay_elapsed < _replay_duration:
		var finish_wait_ok: bool = await _replay_wait(_replay_duration - _replay_elapsed)
		if not finish_wait_ok:
			return
	while _replay_active and _replay_chain_destroying and is_instance_valid(bs):
		var chain_wait_ok: bool = await _replay_wall_wait(0.1)
		if not chain_wait_ok:
			return
	if _replay_active and replay_outcome_reason == "town_hall_destroyed":
		record_replay_telemetry("replay_victory_cascade_done", {"elapsed": snappedf(_replay_elapsed, 0.01)})
		var admire_wait_ok: bool = await _replay_wall_wait(VICTORY_ADMIRE_DELAY)
		if not admire_wait_ok:
			return
		record_replay_telemetry("replay_return_ready", {"reason": replay_outcome_reason})
	_restore_replay_clock()
	_clear_replay_timer()
	if _replay_active and bs._bridge:
		record_replay_telemetry("replay_end", {"elapsed": snappedf(_replay_elapsed, 0.01)})
		_send_replay_telemetry()
	if _replay_active and bs._bridge:
		bs._bridge.send_to_react("battle_result", _replay_result_for_overlay())
	_replay_active = false


## Replays a single place_ship action by locating the matching troop type in
## the AttackSystem, temporarily overriding the troop level, and calling
## _try_place_ship at the recorded world position.
func _replay_place_ship(action: Dictionary, attack_system: Node) -> void:
	if not attack_system:
		return
	if action.has("troops") and attack_system.has_method("replay_place_ship_from_spawn"):
		if attack_system.replay_place_ship_from_spawn(action):
			return
	if action.has("troops") and attack_system.has_method("replay_deploy_troops_at_spawn"):
		if attack_system.replay_deploy_troops_at_spawn(action):
			return
	var troop_type: String = str(action.get("troopType", "knight")).to_lower()
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


func _replay_deploy_troop(action: Dictionary, attack_system: Node) -> void:
	if attack_system and attack_system.has_method("replay_deploy_troop"):
		attack_system.replay_deploy_troop(action)


func _replay_building_pos(server_id: int) -> Vector3:
	if server_id <= 0:
		return Vector3.INF
	for building_sys in BaseTroop._get_building_systems_cached():
		if not is_instance_valid(building_sys) or not ("placed_buildings" in building_sys):
			continue
		for building in building_sys.placed_buildings:
			if int(building.get("server_id", -1)) != server_id:
				continue
			var node: Node3D = building.get("node", null)
			if is_instance_valid(node):
				return node.global_position
	return Vector3.INF


func _replay_rally_drop(action: Dictionary) -> void:
	if not bs._rally or not bs._rally.has_method("replay_drop_rally"):
		return
	var building_id: int = int(action.get("buildingId", action.get("building_id", -1)))
	var pos: Vector3 = _replay_building_pos(building_id)
	var point_source: String = "building" if pos != Vector3.INF else "point"
	if pos == Vector3.INF:
		pos = Vector3(float(action.get("x", 0.0)), bs.grid_y, float(action.get("z", 0.0)))
	else:
		pos.y = bs.grid_y
	record_replay_telemetry("rally_action", {
		"building_id": building_id,
		"point_source": point_source,
		"x": snappedf(pos.x, 0.001),
		"z": snappedf(pos.z, 0.001),
		"action_x": snappedf(float(action.get("x", 0.0)), 0.001),
		"action_z": snappedf(float(action.get("z", 0.0)), 0.001),
		"flight_time": snappedf(float(action.get("flight_time", -1.0)), 0.001),
	})
	bs._rally.replay_drop_rally(pos, float(action.get("flight_time", -1.0)))


func _replay_medkit_drop(action: Dictionary) -> void:
	if not bs._medkit or not bs._medkit.has_method("replay_drop_medkit"):
		return
	var pos := Vector3(
		float(action.get("x", 0.0)),
		bs.grid_y,
		float(action.get("z", 0.0))
	)
	record_replay_telemetry("medkit_action", {
		"x": snappedf(pos.x, 0.001),
		"z": snappedf(pos.z, 0.001),
	})
	bs._medkit.replay_drop_medkit(pos)


func _replay_freeze_drop(action: Dictionary) -> void:
	if not bs._freeze or not bs._freeze.has_method("replay_drop_freeze"):
		return
	var pos := Vector3(
		float(action.get("x", 0.0)),
		bs.grid_y,
		float(action.get("z", 0.0))
	)
	record_replay_telemetry("freeze_action", {
		"x": snappedf(pos.x, 0.001),
		"z": snappedf(pos.z, 0.001),
	})
	bs._freeze.replay_drop_freeze(pos)


func _replay_rage_drop(action: Dictionary) -> void:
	if not bs._rage or not bs._rage.has_method("replay_drop_rage"):
		return
	var pos := Vector3(
		float(action.get("x", 0.0)),
		bs.grid_y,
		float(action.get("z", 0.0))
	)
	record_replay_telemetry("rage_action", {
		"x": snappedf(pos.x, 0.001),
		"z": snappedf(pos.z, 0.001),
	})
	bs._rage.replay_drop_rage(pos)


func _replay_skeleton_barrel_fire(action: Dictionary) -> void:
	if not bs._skeleton_barrel or not bs._skeleton_barrel.has_method("replay_fire_at_building"):
		return
	var building_id: int = int(action.get("buildingId", action.get("building_id", -1)))
	var fallback := Vector3(
		float(action.get("x", 0.0)),
		bs.grid_y,
		float(action.get("z", 0.0))
	)
	var target: Dictionary = {}
	for building_sys in bs._building_systems:
		for building in building_sys.placed_buildings:
			if int(building.get("server_id", -1)) == building_id:
				target = building
				break
		if not target.is_empty():
			break
	record_replay_telemetry("skeleton_barrel_action", {
		"building_id": building_id,
		"target_found": not target.is_empty(),
		"x": snappedf(fallback.x, 0.001),
		"z": snappedf(fallback.z, 0.001),
	})
	bs._skeleton_barrel.replay_fire_at_building(target, fallback)


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
## Detects when all attacking troops have been lost and no deployable reserve
## remains, then submits a defeat result after a grace period.
func check_defeat(delta: float) -> void:
	if not is_viewing_enemy or _replay_active or _victory_declared:
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
	var undeployed_troops: int = 0
	if attack_system and attack_system.has_method("remaining_undeployed_troops"):
		undeployed_troops = int(attack_system.call("remaining_undeployed_troops"))

	var troops_alive: bool = not BaseTroop._get_troops_cached().is_empty()
	# Ships still sailing count as "alive" — they haven't deployed yet
	var ships_still_sailing: bool = false
	if attack_system:
		for ship_node in attack_system._get_ships_cached():
			if is_instance_valid(ship_node):
				ships_still_sailing = true
				break

	if troops_alive or ships_still_sailing or undeployed_troops > 0:
		if troops_alive:
			_had_troops = true
		# The current single-ship flow keeps undeployed troops in AttackSystem's
		# roster. Losing the last live unit is not a defeat while that reserve
		# still contains deployable units.
		_skeleton_respawn_timer = 0.0
		return

	# No troops alive and no ships sailing — check if all ships have been placed
	var fleet_size: int = mini(_saved_fleet.size(), MAX_REPLAY_SHIPS)
	var total_launched: int = 0
	if attack_system:
		total_launched = attack_system._total_ships_launched
	# Still has unlaunched ships — player can still send more, don't defeat yet
	if total_launched < fleet_size:
		_skeleton_respawn_timer = 0.0
		return

	# Grace period before declaring defeat. Also prevents a soft-lock when
	# every ship was launched but no troop node ever spawned.
	_skeleton_respawn_timer += delta
	if _skeleton_respawn_timer < 3.0:
		return

	var had_any_troops: bool = _had_troops
	_had_troops = false
	_skeleton_respawn_timer = 0.0
	var defeat_reason: String = "All troops lost" if had_any_troops else "No troops deployed"
	await _finish_live_defeat(defeat_reason)


## Forces a defeat — used when battle timer expires.
## Only already-dead troops count as casualties. Survivors stay alive.
func _force_defeat(reason: String) -> void:
	if _victory_declared:
		return
	_had_troops = false
	_skeleton_respawn_timer = 0.0
	await _finish_live_defeat(reason)


## One terminal path for every live defeat. The final casualty dictionary is
## sealed before cleanup, sent once with the replay, then replaced only by the
## server's response to that same report.
func _finish_live_defeat(reason: String) -> void:
	if _victory_declared:
		return
	var defeat_casualties: Dictionary = _seal_troop_death_report()
	_begin_live_defeat()
	var audio = bs.get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_result"):
		audio.play_result()

	var net_def: Node = bs._net
	var def_id: String = enemy_info.get("id", "")
	if net_def and net_def.has_token() and def_id != "":
		var defeat_session_id: String = str(enemy_info.get("battle_session_id", ""))
		var defeat_result: Dictionary = await net_def.submit_battle_result(
			def_id,
			_battle_replay,
			"defeat",
			defeat_casualties,
			defeat_session_id
		)
		if not is_instance_valid(bs):
			return
		if defeat_result.has("error"):
			var bridge_error: Node = bs._bridge
			if bridge_error:
				var error_message: String = str(defeat_result.get("error", "Battle result was not recorded.")).strip_edges()
				var error_reason: String = str(defeat_result.get("reason", "")).strip_edges()
				if error_reason != "":
					error_message = ("%s %s" % [error_message, error_reason]).strip_edges()
				bridge_error.send_to_react("battle_result", {
					"type": "error",
					"title": "Battle not recorded",
					"message": error_message,
					"reason": error_message,
				})
			return
		if defeat_result.has("ships"):
			bs._apply_ships_from_server(defeat_result.get("ships", []))
		if defeat_result.has("casualties") and defeat_result.get("casualties") is Dictionary:
			defeat_casualties = defeat_result.get("casualties", defeat_casualties)
	var bridge_def: Node = bs._bridge
	if bridge_def:
		bridge_def.send_to_react("battle_result", {"type": "defeat", "reason": reason, "casualties": defeat_casualties})


func _begin_live_defeat() -> void:
	if _victory_declared:
		return
	_battle_timer_active = false
	_victory_declared = true
	_record_battle_end("defeat")
	_cleanup_combat_runtime_nodes()
	if bs and bs._bridge:
		bs._bridge.send_to_react("battle_timer", {"remaining": null})


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
						bsys._spawn_tombstone_skeletons(b, b.get("level", 1), false)


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
		"fire_dragon": return "FireDragon"
	return ""
