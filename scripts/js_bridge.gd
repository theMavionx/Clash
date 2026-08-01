extends Node
## Autoload "Bridge" — communicates between Godot and React via JavaScriptBridge.
## Works only in web export. Silently ignored in editor/native builds.

signal react_message(action: String, data: Dictionary)

var _callbacks: Dictionary = {}
var _is_web: bool = false
var _perf_timer: float = 0.0
var _pending_agent_attack_replays: Array = []
var _seen_agent_attack_sessions: Dictionary = {}
const AGENT_REPLAY_SEEN_LIMIT: int = 30
const AGENT_REPLAY_QUEUE_LIMIT: int = 10
const PERF_INTERVAL: float = 0.25  # send perf data 4x per second
const FPS_RECOVERY_STARTUP_GRACE_MS: int = 45000
const FPS_RECOVERY_MIN_BASELINE: float = 45.0
const FPS_RECOVERY_DROP_RATIO: float = 0.55
const FPS_RECOVERY_MAX_TRIGGER_FPS: float = 30.0
const FPS_RECOVERY_LOW_SAMPLES: int = 12
const FPS_RECOVERY_PAUSE_SEC: float = 0.32
const FPS_RECOVERY_RESULT_DELAY_SEC: float = 2.0
const FPS_RECOVERY_COOLDOWN_MS: int = 45000
var _bs_cache: Array = []  # cached building_systems group
var _bridge_ready_ticks_ms: int = 0
var _fps_baseline: float = 0.0
var _fps_low_sample_count: int = 0
var _fps_recovery_in_flight: bool = false
var _fps_recovery_failures: int = 0
var _last_fps_recovery_ms: int = -FPS_RECOVERY_COOLDOWN_MS


func _refresh_cache() -> void:
	_bs_cache.clear()
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if is_instance_valid(bs):
			_bs_cache.append(bs)


func _ready() -> void:
	WebLoadLogger.report("autoload_bridge_ready_start")
	_is_web = OS.has_feature("web")
	_bridge_ready_ticks_ms = Time.get_ticks_msec()
	process_mode = Node.PROCESS_MODE_ALWAYS  # keep bridge alive during tree pause
	call_deferred("_refresh_cache")
	if not _is_web:
		return

	var cb: JavaScriptObject = JavaScriptBridge.create_callback(_on_react_call)
	_callbacks["_on_react_call"] = cb
	JavaScriptBridge.get_interface("window").set("godotBridge", cb)
	var visibility_cb: JavaScriptObject = JavaScriptBridge.create_callback(_on_visibility_resume)
	_callbacks["_on_visibility_resume"] = visibility_cb
	JavaScriptBridge.get_interface("window").set("_godotFpsVisibilityCb", visibility_cb)
	JavaScriptBridge.eval("""
		(function() {
			if (window.__clashFpsVisibilityHandler) {
				document.removeEventListener('visibilitychange', window.__clashFpsVisibilityHandler);
			}
			window.__clashFpsVisibilityHandler = function() {
				if (!document.hidden && window._godotFpsVisibilityCb) {
					window._godotFpsVisibilityCb(1);
				}
			};
			document.addEventListener('visibilitychange', window.__clashFpsVisibilityHandler);
		})();
	""")
	WebLoadLogger.report("autoload_bridge_ready_done")

	await get_tree().create_timer(0.5).timeout
	_send_initial_state()


func _exit_tree() -> void:
	set_process(false)
	if not _is_web:
		return
	JavaScriptBridge.eval("""
		(function() {
			try {
				if (window.__clashFpsVisibilityHandler) {
					document.removeEventListener('visibilitychange', window.__clashFpsVisibilityHandler);
					window.__clashFpsVisibilityHandler = null;
				}
				window._godotFpsVisibilityCb = null;
				window.godotBridge = null;
			} catch (e) {}
		})();
	""", true)
	_callbacks.clear()


func _process(delta: float) -> void:
	if not _is_web:
		return
	_flush_pending_agent_attack_replay()
	_perf_timer += delta
	if _perf_timer < PERF_INTERVAL:
		return
	_perf_timer = 0.0
	_send_perf_data()


func _on_visibility_resume(_args: Array) -> void:
	call_deferred("request_fps_recovery", "visibility_resume", true)


func _send_perf_data() -> void:
	var fps: float = Engine.get_frames_per_second()
	_update_fps_recovery_watchdog(fps)

	var troop_list: Array = BaseTroop._get_troops_cached()
	var troops: int = troop_list.size()
	var guards: int = BaseTroop._get_guards_list_cached().size()

	# Count projectiles from cached troop list (no extra group query)
	var troop_projectiles: int = 0
	for troop in troop_list:
		if "_active" in troop:
			troop_projectiles += troop._active.size()

	# Buildings count from cached data
	var buildings: int = BaseTroop._get_buildings_cached().size()

	# Turret bullets — count from turret nodes directly
	var turrets: int = 0
	var active_bullets: int = 0
	for bs in _bs_cache:
		if not is_instance_valid(bs):
			continue
		for b in bs.placed_buildings:
			if b.get("id", "") == "turret" and is_instance_valid(b.get("node")):
				if "_active_bullets" in b.node:
					turrets += 1
					active_bullets += b.node._active_bullets.size()

	var ships: int = 0
	var deployed_types: Dictionary = {}
	var current_scene: Node = get_tree().current_scene
	var attack_sys: Node = current_scene.get_node_or_null("AttackSystem") if current_scene != null else null
	if attack_sys and "_deployed_types" in attack_sys:
		ships = attack_sys._total_ships_launched
		deployed_types = attack_sys._deployed_types

	# Count live troops per script basename
	var troop_counts: Dictionary = {}
	for troop in troop_list:
		if is_instance_valid(troop) and troop.get_script():
			var sname: String = troop.get_script().resource_path.get_file().get_basename()
			troop_counts[sname] = troop_counts.get(sname, 0) + 1

	var state: String = "idle"
	if troops > 0:
		state = "combat"
	elif ships > 0:
		state = "deploying"

	var payload: String = JSON.stringify({
		"action": "perf",
		"data": {
			"fps": fps,
			"troops": troops,
			"guards": guards,
			"turrets": turrets,
			"bullets": active_bullets,
			"projectiles": troop_projectiles,
			"buildings": buildings,
			"ships": ships,
			"deployed_types": deployed_types,
			"troop_counts": troop_counts,
			"state": state,
			"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
			"objects": Performance.get_monitor(Performance.RENDER_TOTAL_OBJECTS_IN_FRAME),
			"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
			"process_ms": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
			"physics_ms": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
			"navigation_ms": Performance.get_monitor(Performance.TIME_NAVIGATION_PROCESS) * 1000.0,
		}
	})
	JavaScriptBridge.eval("window.onGodotMessage && window.onGodotMessage(%s)" % payload)


func _update_fps_recovery_watchdog(fps: float) -> void:
	if fps <= 0.0:
		return
	if not _fps_recovery_in_flight and not get_tree().paused:
		_fps_baseline = maxf(_fps_baseline, fps)
	if Time.get_ticks_msec() - _bridge_ready_ticks_ms < FPS_RECOVERY_STARTUP_GRACE_MS:
		_fps_low_sample_count = 0
		return
	if (
		_fps_baseline < FPS_RECOVERY_MIN_BASELINE
		or _fps_recovery_in_flight
		or _ui_overlay_pause_requested
		or get_tree().paused
		or _is_combat_runtime_active()
	):
		_fps_low_sample_count = 0
		return

	var trigger_fps: float = minf(
		FPS_RECOVERY_MAX_TRIGGER_FPS,
		_fps_baseline * FPS_RECOVERY_DROP_RATIO
	)
	if fps > trigger_fps:
		_fps_low_sample_count = 0
		return

	_fps_low_sample_count += 1
	if _fps_low_sample_count < FPS_RECOVERY_LOW_SAMPLES:
		return
	_fps_low_sample_count = 0
	call_deferred("request_fps_recovery", "sustained_low_fps", false)


func _is_combat_runtime_active() -> bool:
	var current_scene: Node = get_tree().current_scene
	var attack_sys: Node = current_scene.get_node_or_null("AttackSystem") if current_scene else null
	if attack_sys and "is_attack_mode" in attack_sys and bool(attack_sys.is_attack_mode):
		return true

	for bs in _bs_cache:
		if not is_instance_valid(bs):
			continue
		if "is_viewing_enemy" in bs and bool(bs.is_viewing_enemy):
			return true
		if "_replay_active" in bs and bool(bs._replay_active):
			return true
		if "_battle" not in bs:
			continue
		var battle = bs._battle
		if (
			is_instance_valid(battle)
			and "_battle_timer_active" in battle
			and bool(battle._battle_timer_active)
			and ("_victory_declared" not in battle or not bool(battle._victory_declared))
		):
			return true
	return false


func request_fps_recovery(reason: String = "manual", force: bool = false) -> void:
	if (
		_fps_recovery_in_flight
		or _ui_overlay_pause_requested
		or get_tree().paused
		or _is_combat_runtime_active()
	):
		return

	var now_ms: int = Time.get_ticks_msec()
	var cooldown_multiplier: int = clampi(_fps_recovery_failures + 1, 1, 4)
	var cooldown_ms: int = FPS_RECOVERY_COOLDOWN_MS * cooldown_multiplier
	if now_ms - _last_fps_recovery_ms < cooldown_ms:
		return
	if not force and now_ms - _bridge_ready_ticks_ms < FPS_RECOVERY_STARTUP_GRACE_MS:
		return

	_fps_recovery_in_flight = true
	_last_fps_recovery_ms = now_ms
	_fps_low_sample_count = 0
	var fps_before: float = Engine.get_frames_per_second()
	WebLoadLogger.report("fps_recovery_start", {
		"reason": reason,
		"fps": fps_before,
		"baseline_fps": _fps_baseline,
		"failed_attempts": _fps_recovery_failures,
		"nodes": Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
		"draw_calls": Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
	})

	_fps_recovery_pause_requested = true
	_apply_island_pause_state()
	await get_tree().create_timer(
		FPS_RECOVERY_PAUSE_SEC,
		true,
		false,
		true
	).timeout
	_fps_recovery_pause_requested = false
	_apply_island_pause_state()

	await get_tree().create_timer(
		FPS_RECOVERY_RESULT_DELAY_SEC,
		true,
		false,
		true
	).timeout
	var fps_after: float = Engine.get_frames_per_second()
	var recovered: bool = (
		fps_after >= fps_before * 1.25
		or (
			_fps_baseline >= FPS_RECOVERY_MIN_BASELINE
			and fps_after >= _fps_baseline * 0.75
		)
	)
	if recovered:
		_fps_recovery_failures = 0
	else:
		_fps_recovery_failures = mini(_fps_recovery_failures + 1, 3)
	WebLoadLogger.report("fps_recovery_finish", {
		"reason": reason,
		"fps_before": fps_before,
		"fps_after": fps_after,
		"baseline_fps": _fps_baseline,
		"recovered": recovered,
		"failed_attempts": _fps_recovery_failures,
	})
	_fps_recovery_in_flight = false


func send_to_react(action: String, data: Dictionary) -> void:
	if not _is_web:
		return
	var payload = JSON.stringify({"action": action, "data": data})
	JavaScriptBridge.eval("window.onGodotMessage && window.onGodotMessage(%s)" % payload)


func _is_local_web_host() -> bool:
	if not _is_web:
		return false
	var host_value = JavaScriptBridge.eval("window.location.hostname", true)
	var host: String = String(host_value).strip_edges().to_lower()
	return host == "localhost" or host == "127.0.0.1" or host == "::1" or host == "[::1]"


func _local_guest_mode_enabled() -> bool:
	if not _is_local_web_host():
		return false
	var href_value = JavaScriptBridge.eval("window.location.href", true)
	var href: String = String(href_value)
	return href.contains("?guest=1") or href.contains("&guest=1") or href.contains("?guest=true") or href.contains("&guest=true") or href.contains("?guest=new") or href.contains("&guest=new")


func _get_local_guest_id() -> String:
	if not _local_guest_mode_enabled():
		return ""
	var guest_id_value = JavaScriptBridge.eval("(function(){try{var u=new URL(window.location.href);var g=(u.searchParams.get('guest')||'').toLowerCase();if(g!=='1'&&g!=='true'&&g!=='new')return '';var id=u.searchParams.get('guest_id')||'';try{if(!id)id=window.localStorage.getItem('clash.localGuest')||'';}catch(e){}if(!id){id='g_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);}if(g!=='1'||u.searchParams.get('guest_id')!==id){u.searchParams.set('guest','1');u.searchParams.set('guest_id',id);window.history.replaceState(null,'',u.toString());}try{window.localStorage.removeItem('clash_game_auth_v1');window.localStorage.setItem('clash.localGuest',id);}catch(e){}return id;}catch(e){return '';}})()", true)
	var guest_id: String = String(guest_id_value).strip_edges()
	return guest_id


func _get_local_guest_wallet(guest_id: String) -> String:
	if guest_id == "":
		return ""
	return "local_guest_%s" % guest_id


func _get_local_guest_name(guest_id: String) -> String:
	var suffix := guest_id.replace("g_", "").replace("_", "").replace("-", "")
	if suffix.length() > 12:
		suffix = suffix.substr(0, 12)
	if suffix == "":
		suffix = str(Time.get_unix_time_from_system())
	return "Guest_%s" % suffix


func _clear_local_web_auth(net: Node) -> void:
	if not _is_local_web_host() or not _local_guest_mode_enabled():
		return
	if not net:
		return
	net.token = ""
	net.player_id = ""
	net.display_name = ""
	net.trophies = 0
	net.wallet = ""
	if "layout_revision" in net:
		net.layout_revision = 0
	var cfg = ConfigFile.new()
	cfg.save("user://auth.cfg")
	if net.has_method("_clear_web_auth_fallback"):
		net._clear_web_auth_fallback()
	JavaScriptBridge.eval("window.localStorage && window.localStorage.removeItem('clash.localGuest')", true)


func _send_initial_state() -> void:
	send_to_react("godot_ready", {})
	# Send building/troop definitions so React can render shop & barn panel
	var bs = _get_building_system()
	if bs:
		var defs := {}
		var th_lvl: int = bs._get_th_level()
		for key in bs.building_defs:
			var d = bs.building_defs[key]
			var th_max: Array = bs.TH_MAX_COUNT.get(key, [])
			var effective_max: int = th_max[clampi(th_lvl - 1, 0, th_max.size() - 1)] if th_max.size() > 0 else d.get("max_count", 0)
			defs[key] = {
				"name": d.name,
				"cells": [d.cells.x, d.cells.y],
				"cost": d.get("cost", {}),
				"hp_levels": d.get("hp_levels", []),
				"max_count": effective_max,
				"no_shop": d.get("no_shop", false),
				"requires_purchase": d.get("requires_purchase", false),
				"shop_sku": d.get("shop_sku", ""),
			}
		var troop_defs := {}
		for key in bs.troop_defs:
			var td = bs.troop_defs[key]
			troop_defs[key] = {
				"display": td.display,
				"costs": {},
				"max_level": int(td.get("max_level", 1)),
				"min_town_hall_level": int(td.get("min_town_hall_level", 1)),
				"slot_cost": int(td.get("slot_cost", 1)),
				"buy_cost": int(td.get("buy_cost", bs.BUY_TROOP_COST)),
			}
			for lvl in td.costs:
				troop_defs[key].costs[str(lvl)] = td.costs[lvl]
		# Count how many of each type are already placed
		var placed_counts := {}
		for b in bs.placed_buildings:
			var bid = b.get("id", "")
			placed_counts[bid] = placed_counts.get(bid, 0) + 1
		send_to_react("building_defs", {
			"buildings": defs,
			"troops": troop_defs,
			"placed_counts": placed_counts,
			"town_hall_level": th_lvl,
		})
		send_to_react("resources", {
			"gold": bs.resources.gold,
			"wood": bs.resources.wood,
			"ore": bs.resources.ore,
		})
		send_to_react("troop_levels", bs.troop_levels)
		# Send TH info at startup
		bs._sync_react_buildings()
	# Check if need to register
	var net = get_node_or_null("/root/Net")
	if net:
		_clear_local_web_auth(net)
	if net and not net.has_token():
		var guest_id: String = _get_local_guest_id()
		var guest_wallet: String = _get_local_guest_wallet(guest_id)
		if guest_wallet != "":
			call_deferred("_do_register", _get_local_guest_name(guest_id), guest_wallet, "pacifica", 0)
		else:
			send_to_react("show_register", {})
	elif net:
		send_to_react("state", {
			"player_name": net.display_name,
			"trophies": net.trophies,
			"player_id": net.player_id,
			"token": net.token,
			"wallet": net.wallet,
		})


func _on_react_call(args: Array) -> void:
	if args.size() == 0:
		return
	var json: JSON = JSON.new()
	if json.parse(str(args[0])) != OK:
		return
	var msg: Variant = json.data
	if msg is Dictionary and msg.has("action"):
		react_message.emit(msg.action, msg.get("data", {}))
		_handle_react_action(msg.action, msg.get("data", {}))


func _handle_react_action(action: String, data: Dictionary) -> void:
	var bs: Node = _get_building_system()
	# During replay, only allow return_home, replay_speed, get_state, and queued agent events.
	if bs and bs._replay_active and action not in ["return_home", "get_state", "replay_speed", "agent_action"]:
		return
	match action:
		"get_state":
			_send_full_state()
		"add_resources":
			if bs:
				bs._on_add_resource(data.get("resource", "gold"))
		"resources_add":
			if bs and data is Dictionary:
				var next: Dictionary = {
					"gold": int(bs.resources.get("gold", 0)) + int(data.get("gold", 0)),
					"wood": int(bs.resources.get("wood", 0)) + int(data.get("wood", 0)),
					"ore": int(bs.resources.get("ore", 0)) + int(data.get("ore", 0)),
				}
				bs._apply_resources_from_server(next)
		"set_resources":
			# Server-of-truth totals (after a shop purchase, attack reward, etc.)
			# pushed in from React. Without this, Godot's local resource counters
			# would drift from the DB and a subsequent _update_resource_ui() call
			# would broadcast the stale Godot value back to React, undoing the
			# purchase visually.
			if bs and data is Dictionary:
				bs._apply_resources_from_server(data)
		"set_altar_skills":
			if bs and data is Dictionary and bs.has_method("_load_altar_skill_levels_from_server"):
				bs._load_altar_skill_levels_from_server(data)
		"set_shop_unlocks":
			for bsys in _bs_cache:
				if is_instance_valid(bsys) and bsys.has_method("_set_shop_unlocks"):
					bsys._set_shop_unlocks(data)
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
		"start_flamethrower_facing_edit":
			var active_flamethrower_bs = _get_active_flamethrower_building_system()
			if active_flamethrower_bs and active_flamethrower_bs.has_method("_start_flamethrower_facing_edit"):
				active_flamethrower_bs._start_flamethrower_facing_edit()
		"flamethrower_facing_step":
			var facing_bs = _get_active_flamethrower_building_system()
			if facing_bs and facing_bs.has_method("_flamethrower_preview_step"):
				var direction := int(data.get("direction", 0))
				if direction != 0:
					facing_bs._flamethrower_preview_step(
						-1 if direction < 0 else 1,
						"step_left" if direction < 0 else "step_right"
					)
		"flamethrower_facing_reset":
			var reset_bs = _get_active_flamethrower_building_system()
			if reset_bs and reset_bs.has_method("_reset_flamethrower_facing_preview"):
				reset_bs._reset_flamethrower_facing_preview()
		"flamethrower_facing_confirm":
			var confirm_bs = _get_active_flamethrower_building_system()
			if confirm_bs and confirm_bs.has_method("_confirm_flamethrower_facing"):
				confirm_bs._confirm_flamethrower_facing()
		"flamethrower_facing_cancel":
			var cancel_bs = _get_active_flamethrower_building_system()
			if cancel_bs and cancel_bs.has_method("_cancel_flamethrower_facing"):
				cancel_bs._cancel_flamethrower_facing()
		"find_enemy":
			if bs:
				var tournament_id: int = int(data.get("tournament_id", 0)) if data is Dictionary else 0
				bs._on_find_pressed(tournament_id)
		"revenge_attack":
			if bs and bs._battle and bs._battle.has_method("_on_revenge_pressed"):
				bs._battle._on_revenge_pressed(int(data.get("battle_id", 0)))
		"attack":
			if bs:
				bs._on_attack_pressed()
		"return_home":
			if bs:
				bs._return_home()
		"ship_cannon_mode":
			if bs:
				if bs._ship_cannon_mode:
					bs._exit_ship_cannon_mode()
				else:
					bs._enter_ship_cannon_mode()
		"ship_rally_mode":
			if bs:
				if bs._ship_rally_mode:
					bs._exit_ship_rally_mode()
				else:
					bs._enter_ship_rally_mode()
		"ship_medkit_mode":
			if bs:
				if bs._ship_medkit_mode:
					bs._exit_ship_medkit_mode()
				else:
					bs._enter_ship_medkit_mode()
		"ship_freeze_mode":
			if bs:
				if bs._ship_freeze_mode:
					bs._exit_ship_freeze_mode()
				else:
					bs._enter_ship_freeze_mode()
		"ship_rage_mode":
			if bs:
				if bs._ship_rage_mode:
					bs._exit_ship_rage_mode()
				else:
					bs._enter_ship_rage_mode()
		"ship_skeleton_barrel_mode":
			if bs:
				if bs._ship_skeleton_barrel_mode:
					bs._exit_ship_skeleton_barrel_mode()
				else:
					bs._enter_ship_skeleton_barrel_mode()
		"select_troop":
			var asys: Node = get_tree().current_scene.get_node_or_null("AttackSystem")
			if asys:
				var selected_idx: int = int(data.get("idx", 0))
				if asys.has_method("select_troop_group"):
					selected_idx = int(asys.select_troop_group(selected_idx))
				else:
					asys._next_troop_idx = clampi(selected_idx, 0, asys.SHIP_TROOPS.size() - 1)
					selected_idx = asys._next_troop_idx
				send_to_react("troop_idx_changed", {"idx": selected_idx})
		"upgrade_building":
			var active = _get_active_building_system()
			if active:
				active._upgrade_selected()
		"set_town_hall_flag":
			var active = _get_active_building_system()
			if active and active.has_method("_set_player_town_hall_flag"):
				active._set_player_town_hall_flag(data.get("url", data.get("town_hall_flag_url", "")))
		"refresh_troops":
			if bs:
				bs._refresh_troop_levels_from_server()
		"upgrade_troop":
			if bs:
				var tn = data.get("troop_name", "")
				var expected_level := int(data.get("expected_level", data.get("current_level", -1)))
				bs._upgrade_troop(tn, expected_level)
		"register":
			var auth_proof := _auth_proof_from_payload(data)
			var referral_code := String(data.get("referralCode", data.get("ref", data.get("invite", "")))).strip_edges()
			_do_register(data.get("name", ""), data.get("wallet", ""), data.get("dex", ""), int(data.get("fid", 0)), auth_proof, referral_code)
		"set_player_name_client":
			var net = get_node_or_null("/root/Net")
			var next_name := String(data.get("name", "")).strip_edges()
			if net and next_name != "":
				net.display_name = next_name
				if net.has_method("_save_token"):
					net._save_token()
				send_to_react("state", {"player_name": next_name})
		"wallet_connected":
			var auth_proof := _auth_proof_from_payload(data)
			_try_wallet_login(data.get("wallet", ""), data.get("dex", ""), auth_proof)
		"logout":
			_do_logout()
		"deselect_building":
			var active = _get_active_building_system()
			if active:
				active._deselect_building()
		"collect_resource":
			var sid = data.get("server_id", -1)
			for bsys in _bs_cache:
				if is_instance_valid(bsys):
					bsys._collect_building_resource(sid)
		"buy_ship":
			var active = _get_active_building_system()
			if active:
				active._buy_ship()
		"upgrade_main_ship":
			var active_ship = _get_active_building_system()
			if active_ship and active_ship.has_method("_upgrade_main_ship"):
				active_ship._upgrade_main_ship()
		"buy_troop":
			var active_bt = _get_active_building_system()
			if active_bt:
				active_bt._buy_troop(data.get("troop_name", ""))
		"load_troop":
			var active_lt = _get_active_building_system()
			if active_lt:
				active_lt._load_troop_to_ship(data.get("troop_name", ""), data)
		"reinforce":
			var active_rf = _get_active_building_system()
			if active_rf:
				active_rf._reinforce_troops()
		"swap_troop":
			var active_st = _get_active_building_system()
			if active_st:
				active_st._swap_troop_on_ship(int(data.get("slot", 0)), data.get("troop_name", ""), data)
		"remove_troop":
			var active_rt = _get_active_building_system()
			if active_rt:
				active_rt._remove_troop_from_ship(int(data.get("slot", 0)))
		"remove_troop_group":
			var active_rtg = _get_active_building_system()
			if active_rtg:
				active_rtg._remove_troop_group_from_ship(int(data.get("slot", 0)))
		"set_sound_enabled":
			var audio = get_node_or_null("/root/AudioManager")
			if audio and audio.has_method("set_sound_enabled"):
				audio.set_sound_enabled(bool(data.get("enabled", true)))
				if audio.has_method("is_sound_enabled"):
					send_to_react("sound_settings", {"enabled": audio.is_sound_enabled()})
		"resource_bar_positions":
			# React sends icon centers: {gold: {x, y}, wood: {x, y}, ore: {x, y}}
			for bsys in _bs_cache:
				if is_instance_valid(bsys):
					bsys._react_resource_positions = data
		"ui_overlay":
			_set_island_paused(data.get("active", false))
		"replay_speed":
			if bs and bs._replay_active:
				# Combat replay is part of server/client sync validation.
				# Keep the simulation fixed at 1x; changing Engine.time_scale
				# changes _process(delta) integration and can alter targets/deaths.
				Engine.time_scale = 1.0
		"watch_replay":
			if bs:
				var replay_data: Array = data.get("replay_data", [])
				var buildings_snapshot: Array = data.get("buildings_snapshot", [])
				var attacker_name: String = data.get("attacker_name", "Unknown")
				var base_owner_name: String = String(data.get("base_owner_name", data.get("defender_name", data.get("opponent_name", ""))))
				var duration: float = float(data.get("duration", 0.0))
				var replay_label: String = String(data.get("replay_label", ""))
				var replay_result: Dictionary = {}
				if data.get("replay_result", {}) is Dictionary:
					replay_result = data.get("replay_result", {})
				bs._start_replay(replay_data, buildings_snapshot, attacker_name, duration, replay_label, base_owner_name, replay_result)
		"agent_action":
			_handle_agent_action(data)


func _agent_replay_can_start(bs: Node) -> bool:
	if not bs:
		return false
	if bs._battle and "_returning_home" in bs._battle and bs._battle._returning_home:
		return false
	if bs._replay_active:
		return false
	if bs.is_viewing_enemy and bs._battle and bs._battle._battle_timer_active and not bs._battle._victory_declared:
		return false
	return true


func _agent_attack_session_id_from_payload(payload: Dictionary) -> String:
	var replay_data: Array = payload.get("replay_data", [])
	for replay_action in replay_data:
		if replay_action is Dictionary and String(replay_action.get("type", "")) == "battle_start":
			return String(replay_action.get("battle_session_id", ""))
	return String(payload.get("battle_session_id", ""))


func _agent_attack_result_payload(payload: Dictionary, duration: float, base_owner_name: String) -> Dictionary:
	var result_type: String = String(payload.get("result", "defeat")).to_lower()
	if result_type != "victory" and result_type != "defeat":
		result_type = "defeat"
	var battle_payload: Dictionary = {}
	if payload.get("battle", {}) is Dictionary:
		battle_payload = payload.get("battle", {})
	var verification_payload: Dictionary = {}
	if payload.get("verification", {}) is Dictionary:
		verification_payload = payload.get("verification", {})
	var casualties: Dictionary = {}
	if verification_payload.get("casualties", {}) is Dictionary:
		casualties = verification_payload.get("casualties", {})
	var result: Dictionary = {
		"type": result_type,
		"ai_online_battle": true,
		"opponent_name": base_owner_name,
		"duration": duration,
		"casualties": casualties,
	}
	if result_type == "victory":
		if battle_payload.get("loot", {}) is Dictionary:
			result.loot = battle_payload.get("loot", {})
	elif verification_payload.has("reason"):
		result.reason = String(verification_payload.get("reason", ""))
	for key in ["trophies", "attackerTrophies", "defenderTrophies"]:
		if battle_payload.has(key):
			result[key] = battle_payload[key]
	return result


func _remember_agent_attack_session(session_id: String) -> void:
	if session_id == "":
		return
	_seen_agent_attack_sessions[session_id] = Time.get_ticks_msec()
	if _seen_agent_attack_sessions.size() <= AGENT_REPLAY_SEEN_LIMIT:
		return
	var oldest_key: String = ""
	var oldest_time: int = 9223372036854775807
	for key in _seen_agent_attack_sessions.keys():
		var t: int = int(_seen_agent_attack_sessions[key])
		if t < oldest_time:
			oldest_time = t
			oldest_key = String(key)
	if oldest_key != "":
		_seen_agent_attack_sessions.erase(oldest_key)


func _start_agent_attack_replay(payload: Dictionary) -> bool:
	var bs: Node = _get_building_system()
	if not _agent_replay_can_start(bs):
		return false
	var replay_data: Array = payload.get("replay_data", [])
	var buildings_snapshot: Array = payload.get("buildings_snapshot", [])
	var attacker_name: String = String(payload.get("attacker_name", "AI Agent"))
	var duration: float = float(payload.get("duration", 0.0))
	var replay_label: String = String(payload.get("replay_label", "AI ONLINE BATTLE"))
	var enemy_payload: Dictionary = payload.get("enemy", {})
	var base_owner_name: String = String(payload.get("base_owner_name", enemy_payload.get("name", "")))
	var session_id: String = _agent_attack_session_id_from_payload(payload)
	if session_id != "" and _seen_agent_attack_sessions.has(session_id):
		print("[agent_action] ignored duplicate ai_attack_replay session=%s" % session_id)
		return true
	_remember_agent_attack_session(session_id)
	print("[agent_action] starting ai_attack_replay session=%s duration=%.2f" % [session_id, duration])
	var replay_result: Dictionary = _agent_attack_result_payload(payload, duration, base_owner_name)
	bs._start_replay(replay_data, buildings_snapshot, attacker_name, duration, replay_label, base_owner_name, replay_result)
	return true


func _queue_agent_attack_replay(payload: Dictionary, reason: String) -> void:
	var session_id: String = _agent_attack_session_id_from_payload(payload)
	if session_id != "":
		if _seen_agent_attack_sessions.has(session_id):
			print("[agent_action] ignored duplicate queued ai_attack_replay session=%s" % session_id)
			return
		for queued in _pending_agent_attack_replays:
			if queued is Dictionary and _agent_attack_session_id_from_payload(queued) == session_id:
				print("[agent_action] ignored already queued ai_attack_replay session=%s" % session_id)
				return
	_pending_agent_attack_replays.append(payload.duplicate(true))
	while _pending_agent_attack_replays.size() > AGENT_REPLAY_QUEUE_LIMIT:
		_pending_agent_attack_replays.pop_front()
	print("[agent_action] queued ai_attack_replay session=%s reason=%s queue=%d" % [session_id, reason, _pending_agent_attack_replays.size()])


func _flush_pending_agent_attack_replay() -> void:
	if _pending_agent_attack_replays.is_empty():
		return
	var payload: Dictionary = _pending_agent_attack_replays[0]
	if _start_agent_attack_replay(payload):
		_pending_agent_attack_replays.pop_front()


func _handle_agent_action(event: Dictionary) -> void:
	_refresh_cache()
	var action: String = String(event.get("action", ""))
	var payload: Dictionary = event.get("payload", {})
	if action == "":
		return
	if action == "ai_attack_replay":
		var session_id: String = _agent_attack_session_id_from_payload(payload)
		if session_id != "" and _seen_agent_attack_sessions.has(session_id):
			print("[agent_action] ignored duplicate ai_attack_replay session=%s" % session_id)
			return
		var bs_agent: Node = _get_building_system()
		if not bs_agent:
			_queue_agent_attack_replay(payload, "no_building_system")
			return
		if not _agent_replay_can_start(bs_agent):
			_queue_agent_attack_replay(payload, "busy")
			return
		_start_agent_attack_replay(payload)
		return
	for bsys in _bs_cache:
		if not is_instance_valid(bsys):
			continue
		if bsys.is_viewing_enemy or bsys._replay_active:
			continue
		match action:
			"place_building":
				if bsys.has_method("_apply_agent_place_building"):
					bsys._apply_agent_place_building(payload)
			"upgrade_building":
				if bsys.has_method("_apply_agent_upgrade_building"):
					bsys._apply_agent_upgrade_building(payload)
			"collect_resources":
				if bsys.has_method("_apply_agent_collect_resources"):
					bsys._apply_agent_collect_resources(payload)
			"buy_ship":
				if bsys.has_method("_apply_agent_buy_ship"):
					bsys._apply_agent_buy_ship(payload)
			"load_ship_troop":
				if bsys.has_method("_apply_agent_ship_troops"):
					bsys._apply_agent_ship_troops(payload)
			"swap_ship_troop":
				if bsys.has_method("_apply_agent_ship_troops"):
					bsys._apply_agent_ship_troops(payload)
			"unload_ship_troops":
				if bsys.has_method("_apply_agent_ship_troops"):
					bsys._apply_agent_ship_troops(payload)
			"reinforce_ships":
				if bsys.has_method("_apply_agent_reinforce_ships"):
					bsys._apply_agent_reinforce_ships(payload)
			"upgrade_troop":
				if bsys.has_method("_apply_agent_upgrade_troop"):
					bsys._apply_agent_upgrade_troop(payload)
			"move_building":
				if bsys.has_method("_apply_agent_move_building"):
					bsys._apply_agent_move_building(payload)
			"remove_building":
				if bsys.has_method("_apply_agent_remove_building"):
					bsys._apply_agent_remove_building(payload)


func _auth_proof_from_payload(data: Dictionary) -> Dictionary:
	var auth_proof = data.get("authProof", data.get("auth_proof", {}))
	if not (auth_proof is Dictionary):
		return {}
	return auth_proof


func _do_register(player_name: String, wallet: String = "", dex: String = "", fid: int = 0, auth_proof: Dictionary = {}, referral_code: String = "") -> void:
	var net = get_node_or_null("/root/Net")
	if not net:
		send_to_react("error", {"message": "Network not available"})
		return
	# Detect auto-derived names the client sends as placeholders (e.g. when a
	# returning user reconnects and we have no real input). Server treats these
	# as "no rename requested" so we don't clobber the user's real saved name.
	var is_auto_derived: bool = (
		player_name.begins_with("player_")
		or player_name.begins_with("fc_")
	)
	# If caller supplied a REAL name AND a wallet, skip the login_by_wallet
	# shortcut and go straight to /register — the server's register handler
	# updates the name on existing accounts when a non-auto-derived name is
	# provided. Cheaper than two HTTP calls and enables the rename path.
	var wants_rename: bool = wallet != "" and player_name.length() >= 2 and not is_auto_derived
	if wallet != "" and not wants_rename and referral_code == "":
		# Per-DEX accounts: pass `dex` so the server returns the row that
		# belongs to (wallet, this dex). If no row exists for this dex,
		# login returns 404 and we fall through to /register below — that
		# branch creates a NEW row for the new (wallet, dex) pair, which
		# is exactly the desired "switching DEX → fresh per-DEX account"
		# behaviour the client now relies on. set_dex is no longer needed
		# (it's a server-side no-op now).
		var wallet_result = await net.login_by_wallet(wallet, dex, auth_proof)
		if wallet_result.has("token"):
			send_to_react("registered", {"success": true})
			send_to_react("state", {
				"player_name": net.display_name,
				"trophies": net.trophies,
				"player_id": net.player_id,
				"token": net.token,
				"dex": wallet_result.get("dex", dex),
			})
			return
	if player_name.length() < 2:
		send_to_react("auth_error", {"message": "Name must be at least 2 characters", "stage": "register"})
		send_to_react("error", {"message": "Name must be at least 2 characters"})
		return
	var result = await net.register(player_name, wallet, dex, fid, auth_proof, referral_code)
	if result.has("error"):
		var message := str(result.error)
		send_to_react("auth_error", {"message": message, "stage": "register"})
		send_to_react("error", {"message": message})
		return
	send_to_react("registered", {"success": true})
	send_to_react("state", {
		"player_name": net.display_name,
		"trophies": net.trophies,
		"player_id": net.player_id,
		"token": net.token,
		"dex": result.get("dex", dex),
	})


func _do_logout() -> void:
	var net = get_node_or_null("/root/Net")
	if not net:
		return
	# Clear server session on the client side.
	net.token = ""
	net.player_id = ""
	net.display_name = ""
	net.trophies = 0
	net.wallet = ""
	var cfg = ConfigFile.new()
	cfg.save("user://auth.cfg")  # overwrites any saved token
	if net.has_method("_clear_web_auth_fallback"):
		net._clear_web_auth_fallback()
	# Destroy all placed buildings so next login starts from a clean scene.
	for bsys in _bs_cache:
		if is_instance_valid(bsys) and bsys.has_method("_destroy_all_buildings"):
			bsys._destroy_all_buildings()
	# Reset React-side UI
	send_to_react("state", {
		"player_name": "",
		"trophies": 0,
		"player_id": "",
		"token": "",
		"wallet": "",
	})
	send_to_react("show_register", {})


func _try_wallet_login(wallet: String, dex: String = "", auth_proof: Dictionary = {}) -> void:
	if wallet == "":
		return
	var net = get_node_or_null("/root/Net")
	if not net:
		return
	# If already logged in (e.g. via Farcaster), just link the wallet to account
	if net.has_token():
		net.link_wallet(wallet)
		return
	var result = await net.login_by_wallet(wallet, dex, auth_proof)
	if result.has("token"):
		send_to_react("registered", {"success": true})
		send_to_react("state", {
			"player_name": net.display_name,
			"trophies": net.trophies,
			"player_id": net.player_id,
			"token": net.token,
			"wallet": net.wallet,
		})


func _send_full_state() -> void:
	var net = get_node_or_null("/root/Net")
	if net and net.display_name != "":
		send_to_react("state", {
			"player_name": net.display_name,
			"trophies": net.trophies,
			"player_id": net.player_id,
			"token": net.token,
			"wallet": net.wallet,
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
	var systems = _bs_cache
	if systems.is_empty():
		_refresh_cache()
		systems = _bs_cache
	# Find the main grid (not the port grid)
	for s in systems:
		if is_instance_valid(s) and s.name == "BuildingSystem":
			return s
	# Fallback: return first with blocked_buildings (main grid blocks port)
	for s in systems:
		if is_instance_valid(s) and "blocked_buildings" in s and s.blocked_buildings.size() > 0:
			return s
	if systems.size() > 0:
		for s in systems:
			if is_instance_valid(s):
				return s
	_refresh_cache()
	for s in _bs_cache:
		if is_instance_valid(s):
			return s
	return null


func _get_active_building_system() -> Node:
	# Return whichever system currently has a building selected
	var systems = _bs_cache
	for s in systems:
		if is_instance_valid(s) and "selected_building" in s and s.selected_building.size() > 0:
			return s
	return _get_building_system()


func _get_active_flamethrower_building_system() -> Node:
	# Placement can be active without a selected building. Prefer that exact
	# grid so React's 15-degree controls never rotate a different grid's ghost.
	var systems = _bs_cache
	if systems.is_empty():
		_refresh_cache()
		systems = _bs_cache
	for system in systems:
		if (
			is_instance_valid(system)
			and "is_placing" in system
			and bool(system.is_placing)
			and "current_building_id" in system
			and str(system.current_building_id) == "flamethrower"
		):
			return system
	return _get_active_building_system()


var _island_paused := false
var _ui_overlay_pause_requested := false
var _fps_recovery_pause_requested := false
var _water_mats: Array[ShaderMaterial] = []  # cached ShaderMaterial refs for water/foam

func _set_island_paused(paused: bool) -> void:
	_ui_overlay_pause_requested = paused
	_apply_island_pause_state()


func _apply_island_pause_state() -> void:
	var should_pause: bool = _ui_overlay_pause_requested or _fps_recovery_pause_requested
	if should_pause == _island_paused:
		return
	_island_paused = should_pause
	get_tree().paused = should_pause
	_set_water_paused(should_pause)


func _set_water_paused(pause: bool) -> void:
	if _water_mats.is_empty():
		_cache_water_materials()
	var frozen_t: float = float(Time.get_ticks_msec()) / 1000.0 if pause else 0.0
	for mat in _water_mats:
		if is_instance_valid(mat):
			mat.set_shader_parameter("paused", pause)
			if pause:
				mat.set_shader_parameter("frozen_time", frozen_t)


func _cache_water_materials() -> void:
	var root := get_tree().current_scene
	if not root:
		return
	# Scan all nodes for ShaderMaterials that have a "paused" uniform
	_collect_shader_mats(root)


func _collect_shader_mats(node: Node) -> void:
	if node is MeshInstance3D:
		var mat = node.material_override
		if mat is ShaderMaterial and _has_paused_uniform(mat):
			_water_mats.append(mat)
	if node is CanvasItem and node.material is ShaderMaterial:
		if _has_paused_uniform(node.material):
			_water_mats.append(node.material)
	for child in node.get_children():
		_collect_shader_mats(child)


func _has_paused_uniform(mat: ShaderMaterial) -> bool:
	if not mat.shader:
		return false
	# Check if shader has our "paused" uniform
	for param in mat.shader.get_shader_uniform_list():
		if param.name == "paused":
			return true
	return false
