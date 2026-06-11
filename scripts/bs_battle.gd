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

var _had_troops: bool = false
var _skeleton_respawn_timer: float = 0.0
var _victory_declared: bool = false
var _find_in_progress: bool = false

const RAID_ATTACK_COST_GOLD: int = 150

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


func _battle_elapsed_sec() -> float:
	if _battle_start_time <= 0.0:
		return maxf(0.0, _battle_timer)
	return maxf(0.0, (Time.get_ticks_msec() / 1000.0) - _battle_start_time)


func _reset_troop_death_reports() -> void:
	_pending_troop_death_keys.clear()
	_pending_troop_death_counts.clear()
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


func _paid_casualty_counts(casualties: Dictionary = {}, use_pending_if_empty: bool = false) -> Dictionary:
	var source: Dictionary = casualties
	if use_pending_if_empty and source.is_empty():
		source = _pending_troop_death_counts
	var counts: Dictionary = {}
	for raw_name in source:
		var name: String = str(raw_name).split(":")[0]
		if name == "" or name == "DemonKing" or name == "FireDragon":
			continue
		var count: int = int(source.get(raw_name, 0))
		if count <= 0:
			continue
		counts[name] = int(counts.get(name, 0)) + count
	return counts


func _flush_troop_deaths_once(casualties: Dictionary = {}, use_pending_if_empty: bool = false) -> void:
	if _troop_deaths_flushed:
		return
	_troop_deaths_flushed = true
	# Casualties are reported once through battle_result.casualties after the
	# server verifies the replay. Emitting per-troop UI events here made the
	# React casualty counter vulnerable to duplicate visual counts.


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
	if not bs or not bs._bridge:
		return
	_reconcile_replay_destroyed_building_telemetry()
	var info: Dictionary = _replay_info()
	info.attacker_name = _replay_attacker_name
	info.replay_label = _replay_label
	info.actual_elapsed = snappedf(_replay_elapsed, 0.01)
	info.actual_wall_elapsed = snappedf(_replay_wall_elapsed_sec(), 0.01)
	bs._bridge.send_to_react("replay_telemetry", {
		"replay": info,
		"summary": _replay_telemetry_summary(),
		"events": _replay_telemetry,
	})


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


func _stop_defensive_combat_after_town_hall_destroyed() -> void:
	if not is_instance_valid(bs):
		return
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			var bid: String = str(b.get("id", ""))
			if not (bid in ["turret", "archer_tower", "tombstone"]):
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
	# Free saved ship transforms for port ships that sailed away. KEEP the
	# MainShipBase entry — we need it to restore the dock position after
	# _return_home, since MainShipBase survives the attack cycle and is
	# just hidden/shown rather than freed/recreated.
	var kept_transforms: Array = []
	for data in bs._saved_ship_transforms:
		var ship = data.get("node")
		if not is_instance_valid(ship):
			continue
		if ship == bs._ship_attack_node or ship == bs._ship_base_node:
			kept_transforms.append(data)
			continue
		ship.queue_free()
	bs._saved_ship_transforms = kept_transforms


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

func _start_hidden_combat_warmup() -> Node:
	var script: Script = load("res://scripts/warmup.gd")
	if script == null:
		return null
	return script.start_combat_warmup(bs)


func _await_hidden_combat_warmup(warmup: Node) -> void:
	if warmup != null and is_instance_valid(warmup):
		await warmup.finished

## Kicks off the enemy search flow: boards home troops, sails ships, closes
## the cloud transition, fetches an enemy from the server, then switches to
## the enemy island. Called when the Find Enemy button is pressed.
func _on_find_pressed() -> void:
	if is_viewing_enemy or _find_in_progress:
		return
	var net: Node = bs._net
	if not net or not net.has_token():
		print("Not logged in")
		return
	var latest_resources = await net.get_resources()
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
	var combat_warmup: Node = _start_hidden_combat_warmup()
	await _await_hidden_combat_warmup(combat_warmup)
	if bs.find_button:
		bs.find_button.text = "Searching..."
	var result: Dictionary = await net.find_enemy()
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
	_victory_declared = false
	_reset_troop_death_reports()
	if _saved_fleet.is_empty():
		_saved_fleet = await bs._build_fleet()
	_battle_replay.clear()
	_battle_start_time = Time.get_ticks_msec() / 1000.0
	_battle_timer = 0.0
	_battle_timer_active = true
	bs._cannon.reset()
	if bs._rally:
		bs._rally.reset()
	_battle_replay.append({
		"type": "battle_start",
		"battle_session_id": str(enemy_info.get("battle_session_id", "")),
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
		# Deselect any home-side building before flipping to enemy view —
		# otherwise leftover UI (move arrows, range indicator, building panel)
		# stays parented to the BS and reappears overlaid on the enemy island
		# at the local coordinates of the previously selected home building.
		bsys._deselect_building()
		bsys._battle.is_viewing_enemy = true
		bsys._battle._find_in_progress = false
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
			"attack_cost_gold": enemy_info.get("attack_cost_gold", 0),
		})
	var bridge2 = bs._bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
	var combat_warmup: Node = _start_hidden_combat_warmup()
	await _await_hidden_combat_warmup(combat_warmup)
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
	_victory_declared = false
	_reset_troop_death_reports()
	_battle_replay.clear()
	_battle_start_time = Time.get_ticks_msec() / 1000.0
	_battle_timer = 0.0
	_battle_timer_active = true
	bs._cannon.reset()
	if bs._rally:
		bs._rally.reset()
	_battle_replay.append({
		"type": "battle_start",
		"battle_session_id": str(enemy_info.get("battle_session_id", "")),
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
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = true
	# Free home troops and port ships immediately — they are consumed by the attack
	_free_home_troops_and_ships()
	for bsys in bs.get_tree().get_nodes_in_group("building_systems"):
		bsys._production._hide_all_collect_icons()
		# Deselect any home-side building before flipping to enemy view —
		# otherwise leftover UI (move arrows, range indicator, building panel)
		# stays parented to the BS and reappears overlaid on the enemy island
		# at the local coordinates of the previously selected home building.
		bsys._deselect_building()
		bsys._battle.is_viewing_enemy = true
		bsys._battle._find_in_progress = false
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
			"attack_cost_gold": enemy_info.get("attack_cost_gold", 0),
		})
	bs._cannon._preload_explosion_textures()
	var combat_warmup: Node = _start_hidden_combat_warmup()
	await _await_hidden_combat_warmup(combat_warmup)
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
	var _r2 = bs.get_tree().root
	if not bs._ship_attack_node or not is_instance_valid(bs._ship_attack_node):
		bs._ship_attack_node = _r2.find_child("MainShipAttack", true, false)
	if not bs._ship_base_node or not is_instance_valid(bs._ship_base_node):
		bs._ship_base_node = _r2.find_child("MainShipBase", true, false)
	if bs._ship_attack_node:
		bs._ship_attack_node.visible = false
	# Restore MainShipBase (and any other saved-transform ship) to its pre-
	# sail-away dock position. Without this the ship re-appears at the
	# `_sail_ships_away` target (original + forward * 4) and looks teleported
	# out into open water after victory.
	for data in bs._saved_ship_transforms:
		var restore_ship: Node3D = data.get("node")
		if is_instance_valid(restore_ship):
			restore_ship.global_position = data.pos
			restore_ship.rotation.y = data.rot_y
	bs._saved_ship_transforms.clear()
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
	_freeze_combat_runtime_nodes()
	await bs.get_tree().process_frame
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": true})
	var cloud = bs._get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
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
	_returning_home = false


## Handles town hall destruction: sets troops to VICTORY, then destroys
## remaining buildings one-by-one with staggered explosions. Victory screen
## shows only after the last building is gone.
const CHAIN_DESTROY_DELAY: float = 0.6  ## seconds between each building explosion (puff + crumple takes ~0.4s, so 0.6 leaves a natural beat)
const VICTORY_ADMIRE_DELAY: float = 2.5  ## seconds to hold on the ruined island before opening the victory modal
const REPLAY_OUTCOME_POLL_INTERVAL: float = 0.1

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

	# 1. Set all troops to VICTORY after cleanup (they stop fighting)
	var deployed_troops: Dictionary = {}
	var attack_sys: Node = bs.get_node_or_null("../AttackSystem")
	var fleet_ref: Array = attack_sys._fleet if attack_sys else _saved_fleet
	for ship in fleet_ref:
		if not ship.get("_placed", false):
			continue
		for t_name in ship.get("troops", []):
			if str(t_name) == "_SLOT_FILLER_":
				continue
			deployed_troops[t_name] = deployed_troops.get(t_name, 0) + 1
	var surviving_troops: Dictionary = {}
	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop) and "state" in troop:
			if troop.has_method("_play_victory"):
				if troop.state != troop.State.VICTORY:
					troop._play_victory()
			else:
				troop.state = troop.State.VICTORY
			var t_key: String = _troop_script_to_name(troop)
			if t_key != "":
				surviving_troops[t_key] = surviving_troops.get(t_key, 0) + 1

	# 2. Collect remaining ALIVE buildings (skip TH and already-destroyed ones)
	var remaining: Array = []
	for bsys in bs._building_systems:
		for b in bsys.placed_buildings:
			if b.get("id", "") == "town_hall":
				continue
			if not is_instance_valid(b.get("node")):
				continue
			if b.get("hp", 0) <= 0:
				continue
			remaining.append({"b": b, "bsys": bsys})
	# Shuffle for random destruction order
	remaining.shuffle()

	# Count casualties NOW (troop counts are stable after the VICTORY trigger
	# above — no new troops will spawn, and _play_victory stops them fighting).
	# Doing it here means we can kick off the server submit in parallel with
	# the chain-destroy animation.
	var casualties_early: Dictionary = {}
	for t_name in deployed_troops:
		var lost_early: int = deployed_troops[t_name] - surviving_troops.get(t_name, 0)
		if lost_early > 0:
			casualties_early[t_name] = lost_early

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
			_flush_troop_deaths_once(server_casualties)
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
		_flush_troop_deaths_once(casualties_early)
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
			if b.get("id", "") == "town_hall":
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
	var raw_troops = action.get("troops", [])
	if raw_troops is Array:
		for troop in raw_troops:
			var name: String = str(troop).strip_edges()
			if name != "":
				result.append(name)
	elif action.has("troopType"):
		var legacy_name: String = str(action.get("troopType", "")).strip_edges()
		if legacy_name != "":
			result.append(legacy_name.capitalize())
	return result


func _replay_fleet_from_actions(actions: Array) -> Array:
	var fleet: Array = []
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
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": display_name_for_base,
			"trophies": 0,
			"is_replay": true,
			"live_agent_battle": live_agent_battle,
			"replay_label": replay_label,
			"duration": _replay_duration,
		})
		_send_replay_timer(true)
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
	var combat_warmup: Node = _start_hidden_combat_warmup()
	await _await_hidden_combat_warmup(combat_warmup)
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
	bs._cannon.reset()
	if bs._rally:
		bs._rally.reset()
	var attack_system: Node = bs.get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_replay_mode"):
		attack_system.enter_replay_mode(_replay_fleet_from_actions(_replay_actions))
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
		if a.get("type", "") in ["place_ship", "cannon_fire", "rally_drop"]:
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
			"cannon_fire":
				_replay_cannon_fire(action)
			"rally_drop":
				_replay_rally_drop(action)
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

	var troops_alive: bool = not BaseTroop._get_troops_cached().is_empty()
	# Ships still sailing count as "alive" — they haven't deployed yet
	var ships_still_sailing: bool = false
	if attack_system:
		for ship_node in attack_system._get_ships_cached():
			if is_instance_valid(ship_node):
				ships_still_sailing = true
				break

	if troops_alive or ships_still_sailing:
		if troops_alive:
			_had_troops = true
		_skeleton_respawn_timer = 0.0
		return

	# No troops alive and no ships sailing — check if all ships have been placed
	if not _had_troops:
		return  # battle hasn't started yet

	var fleet_size: int = mini(_saved_fleet.size(), MAX_REPLAY_SHIPS)
	var total_launched: int = 0
	if attack_system:
		total_launched = attack_system._total_ships_launched
	# Still has unlaunched ships — player can still send more, don't defeat yet
	if total_launched < fleet_size:
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
		if not ship.get("_placed", false):
			continue  # skip ships that were never deployed
		for t_name in ship.get("troops", []):
			if str(t_name) == "_SLOT_FILLER_":
				continue
			defeat_casualties[t_name] = defeat_casualties.get(t_name, 0) + 1
	if net_def and net_def.has_token() and def_id != "" and not _victory_declared:
		_victory_declared = true  # prevent double-submission
		_record_battle_end("defeat")
		var defeat_session_id: String = str(enemy_info.get("battle_session_id", ""))
		var defeat_result: Dictionary = await net_def.submit_battle_result(def_id, _battle_replay, "defeat", defeat_casualties, defeat_session_id)
		if not is_instance_valid(bs): return
		# Apply authoritative post-casualty ship state from server
		if defeat_result is Dictionary and defeat_result.has("ships"):
			bs._apply_ships_from_server(defeat_result.get("ships", []))
		if defeat_result is Dictionary and defeat_result.has("casualties"):
			defeat_casualties = defeat_result.get("casualties", defeat_casualties)
	if not is_instance_valid(bs): return
	var audio = bs.get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_result"):
		audio.play_result()
	var bridge_def: Node = bs._bridge
	if bridge_def:
		_flush_troop_deaths_once(defeat_casualties)
		bridge_def.send_to_react("battle_result", {"type": "defeat", "reason": "All troops lost", "casualties": defeat_casualties})


## Forces a defeat — used when battle timer expires.
## Only already-dead troops count as casualties. Survivors stay alive.
func _force_defeat(reason: String) -> void:
	if _victory_declared:
		return
	_had_troops = false
	_skeleton_respawn_timer = 0.0
	_victory_declared = true  # prevent check_defeat from firing again
	_record_battle_end("defeat")
	var audio = bs.get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_result"):
		audio.play_result()
	var deployed_troops: Dictionary = {}
	for ship in _saved_fleet:
		if not ship.get("_placed", false):
			continue
		for t_name in ship.get("troops", []):
			if str(t_name) == "_SLOT_FILLER_":
				continue
			deployed_troops[t_name] = deployed_troops.get(t_name, 0) + 1
	var surviving_troops: Dictionary = {}
	for troop in bs.get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop) and "state" in troop:
			var t_key: String = _troop_script_to_name(troop)
			if t_key != "":
				surviving_troops[t_key] = surviving_troops.get(t_key, 0) + 1
	var defeat_casualties: Dictionary = {}
	for t_name in deployed_troops:
		var lost_count: int = deployed_troops[t_name] - surviving_troops.get(t_name, 0)
		if lost_count > 0:
			defeat_casualties[t_name] = lost_count

	var net_def: Node = bs._net
	var def_id: String = enemy_info.get("id", "")
	if net_def and net_def.has_token() and def_id != "":
		var defeat_session_id: String = str(enemy_info.get("battle_session_id", ""))
		net_def.submit_battle_result(def_id, _battle_replay, "defeat", defeat_casualties, defeat_session_id)
	var bridge_def: Node = bs._bridge
	if bridge_def:
		_flush_troop_deaths_once(defeat_casualties)
		bridge_def.send_to_react("battle_result", {"type": "defeat", "reason": reason, "casualties": defeat_casualties})


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
