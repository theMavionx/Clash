extends Node
## Singleton (autoload) — communicates with the Node.js server.
## Add to Project > Autoload as "Net"

signal connected
signal disconnected
signal auth_ok(player_data: Dictionary)
signal auth_failed(reason: String)
signal resources_updated(res: Dictionary)
signal state_updated(state: Dictionary)
signal building_placed(data: Dictionary)
signal building_upgraded(data: Dictionary)
signal building_removed(data: Dictionary)

# API base URL. Resolved at boot — see `_resolve_server_url()`. In web builds
# we read the current page's origin so dev (`http://localhost:5176`) hits the
# local backend (via the Vite proxy on `/api/*` → `localhost:4000`) instead
# of pounding the production server. Native builds (no `window`) fall back
# to the prod URL or the `CLASH_API_URL` env override.
var SERVER_URL := "https://clashofperps.fun/api"

var token: String = ""
var player_id: String = ""
var display_name: String = ""
var trophies: int = 0
var wallet: String = ""

const WEB_AUTH_STORAGE_KEY = "clash_game_auth_v1"

func _ready() -> void:
	WebLoadLogger.report("autoload_net_ready_start")
	process_mode = Node.PROCESS_MODE_ALWAYS  # keep network alive during tree pause
	SERVER_URL = _resolve_server_url()
	var cfg = ConfigFile.new()
	if cfg.load("user://auth.cfg") == OK:
		token = cfg.get_value("auth", "token", "")
		display_name = cfg.get_value("auth", "name", "")
		player_id = cfg.get_value("auth", "player_id", "")
		wallet = cfg.get_value("auth", "wallet", "")
		trophies = int(cfg.get_value("auth", "trophies", 0))
	if token == "":
		_load_web_auth_fallback()
	if _should_clear_local_guest_for_dex_entry():
		_clear_saved_auth()
		WebLoadLogger.report("autoload_net_local_guest_cleared_for_dex_entry")
	elif token != "" and OS.has_feature("web"):
		_save_web_auth_fallback()
	WebLoadLogger.report("autoload_net_ready_done", {"has_token": token != ""})

# Returns the API base URL appropriate for the current runtime.
#   • Web build (browser): use `window.location.origin + "/api"`. Vite dev
#     proxies `/api/*` → `localhost:4000` automatically; nginx in prod does
#     the same. So one expression covers both environments cleanly.
#   • Native build / fallback: respect `CLASH_API_URL` env var so a desktop
#     dev session can point at any backend; otherwise default to the prod
#     URL so the binary works out-of-the-box for end-users.
func _resolve_server_url() -> String:
	if OS.has_feature("web"):
		var origin = JavaScriptBridge.eval("window.location.origin", true)
		if origin != null:
			var s = String(origin).strip_edges()
			if not s.is_empty() and s.begins_with("http"):
				return s + "/api"
	var env_override := OS.get_environment("CLASH_API_URL")
	if env_override != "":
		return env_override
	return "https://clashofperps.fun/api"

func _save_token() -> void:
	var cfg = ConfigFile.new()
	cfg.set_value("auth", "token", token)
	cfg.set_value("auth", "name", display_name)
	cfg.set_value("auth", "player_id", player_id)
	cfg.set_value("auth", "wallet", wallet)
	cfg.set_value("auth", "trophies", trophies)
	cfg.save("user://auth.cfg")
	_save_web_auth_fallback()

func _clear_saved_auth() -> void:
	token = ""
	player_id = ""
	display_name = ""
	trophies = 0
	wallet = ""
	var cfg = ConfigFile.new()
	cfg.save("user://auth.cfg")
	_clear_web_auth_fallback()

func _is_local_web_host() -> bool:
	if not OS.has_feature("web"):
		return false
	var host_value = JavaScriptBridge.eval("window.location.hostname", true)
	var host: String = String(host_value).strip_edges().to_lower()
	return host == "localhost" or host == "127.0.0.1" or host == "::1" or host == "[::1]"

func _local_guest_mode_enabled() -> bool:
	if not _is_local_web_host():
		return false
	var enabled_value = JavaScriptBridge.eval("(function(){try{var g=(new URL(window.location.href).searchParams.get('guest')||'').toLowerCase();return g==='1'||g==='true'||g==='new';}catch(e){return false;}})()", true)
	return bool(enabled_value)

func _web_local_guest_auth_marker() -> String:
	if not OS.has_feature("web"):
		return ""
	var marker_value = JavaScriptBridge.eval("(function(){try{var raw=window.localStorage.getItem('clash_game_auth_v1')||'';if(raw){var parsed=JSON.parse(raw);var wallet=String(parsed&&parsed.wallet||'');var name=String(parsed&&parsed.name||'');if(wallet.indexOf('local_guest_')===0)return 'guest-wallet';if(name.indexOf('Guest_')===0)return 'guest-name';}var guest=window.localStorage.getItem('clash.localGuest')||'';return guest?'guest-id':'';}catch(e){return '';}})()", true)
	return String(marker_value).strip_edges()

func _should_clear_local_guest_for_dex_entry() -> bool:
	if token == "" or not _is_local_web_host() or _local_guest_mode_enabled():
		return false
	if wallet.begins_with("local_guest_") or display_name.begins_with("Guest_"):
		return true
	var marker := _web_local_guest_auth_marker()
	return marker == "guest-wallet" or marker == "guest-name" or (marker == "guest-id" and wallet == "" and display_name == "")

func _load_web_auth_fallback() -> void:
	if not OS.has_feature("web"):
		return
	var raw_value = JavaScriptBridge.eval("(function(){try{return window.localStorage.getItem('%s')||'';}catch(e){return '';}})()" % WEB_AUTH_STORAGE_KEY, true)
	var raw := String(raw_value).strip_edges()
	if raw == "":
		return
	var parsed = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return
	var saved_token := _safe_str(parsed.get("token", ""))
	if saved_token == "":
		return
	token = saved_token
	display_name = _safe_str(parsed.get("name", ""))
	player_id = _safe_str(parsed.get("player_id", ""))
	wallet = _safe_str(parsed.get("wallet", ""))

func _save_web_auth_fallback() -> void:
	if not OS.has_feature("web"):
		return
	if token == "":
		_clear_web_auth_fallback()
		return
	var record := JSON.stringify({
		"token": token,
		"name": display_name,
		"player_id": player_id,
		"wallet": wallet,
		"saved_at": Time.get_datetime_string_from_system(true),
	})
	JavaScriptBridge.eval("(function(){try{window.localStorage.setItem('%s', %s);}catch(e){}})()" % [WEB_AUTH_STORAGE_KEY, JSON.stringify(record)], true)

func _clear_web_auth_fallback() -> void:
	if not OS.has_feature("web"):
		return
	JavaScriptBridge.eval("(function(){try{window.localStorage.removeItem('%s');}catch(e){}})()" % WEB_AUTH_STORAGE_KEY, true)

func _response_matches_requested_dex(response: Dictionary, requested_dex: String) -> bool:
	if requested_dex == "":
		return true
	return String(response.get("dex", "")).to_lower() == requested_dex.to_lower()

func _safe_str(value, fallback: String = "") -> String:
	return fallback if value == null else String(value)

func _safe_int(value, fallback: int = 0) -> int:
	return fallback if value == null else int(value)

func has_token() -> bool:
	return token != ""

# ── Registration ──────────────────────────────────────────────

func register(player_name: String, wallet: String = "", dex: String = "", fid: int = 0) -> Dictionary:
	var http = HTTPRequest.new()
	add_child(http)
	var headers = ["Content-Type: application/json"]
	var data = {"name": player_name}
	if wallet != "":
		data["wallet"] = wallet
	if dex != "":
		data["dex"] = dex
	# Farcaster ID lets the server adopt a prior fc_<fid> placeholder row so
	# tutorial/gold/buildings don't reset when the user moves from auto-login
	# to an explicit Avantis/Pacifica wallet.
	if fid > 0:
		data["fid"] = fid
	var body = JSON.stringify(data)
	http.request(SERVER_URL + "/players/register", headers, HTTPClient.METHOD_POST, body)
	var result = await http.request_completed
	http.queue_free()
	var response = _parse_response(result)
	if response.has("token"):
		if not _response_matches_requested_dex(response, dex):
			return {
				"error": "DEX mismatch: requested %s but server returned %s" % [dex, String(response.get("dex", ""))],
				"requested_dex": dex,
				"actual_dex": String(response.get("dex", "")),
			}
		token = _safe_str(response.get("token"))
		player_id = _safe_str(response.get("id"))
		display_name = _safe_str(response.get("name"))
		trophies = _safe_int(response.get("trophies"))
		self.wallet = _safe_str(response.get("wallet"))
		_save_token()
		auth_ok.emit(response)
	return response

# ── Login (get state with existing token) ─────────────────────

func login() -> Dictionary:
	var response = await _http_get("/state")
	if response.has("id"):
		player_id = _safe_str(response.get("id"))
		display_name = _safe_str(response.get("name"))
		trophies = _safe_int(response.get("trophies"))
		wallet = _safe_str(response.get("wallet"))
		_save_token()
		auth_ok.emit(response)
	return response

# ── Login by wallet (recover account after cache clear) ───────

func login_by_wallet(wallet: String, dex: String = "") -> Dictionary:
	var http = HTTPRequest.new()
	add_child(http)
	var headers = ["Content-Type: application/json"]
	# Per-DEX accounts: each (wallet, dex) is its own player row, so the
	# server needs `dex` to return the right account. Empty `dex` falls
	# back to the legacy wallet-only lookup (highest-trophy account on
	# any DEX) for back-compat with old clients during the deploy window.
	var payload = {"wallet": wallet}
	if dex != "":
		payload["dex"] = dex
	var body = JSON.stringify(payload)
	http.request(SERVER_URL + "/players/login-wallet", headers, HTTPClient.METHOD_POST, body)
	var result = await http.request_completed
	http.queue_free()
	var response = _parse_response(result)
	if response.has("token"):
		if not _response_matches_requested_dex(response, dex):
			return {
				"error": "DEX mismatch: requested %s but server returned %s" % [dex, String(response.get("dex", ""))],
				"requested_dex": dex,
				"actual_dex": String(response.get("dex", "")),
			}
		token = _safe_str(response.get("token"))
		player_id = _safe_str(response.get("id"))
		display_name = _safe_str(response.get("name"))
		trophies = _safe_int(response.get("trophies"))
		self.wallet = _safe_str(response.get("wallet"))
		_save_token()
		auth_ok.emit(response)
	return response

# DEPRECATED: DEX is now part of player identity (per-DEX accounts).
# Kept as a no-op call for back-compat — the server endpoint also no-ops
# and just returns the player's existing dex. Switching DEX is now done
# by clearing the session token and re-running login_by_wallet with the
# new dex; the React side (DexContext + useAuthFlow.pickDex) drives that.
func set_dex(dex: String) -> Dictionary:
	return await _http_post("/players/set-dex", {"dex": dex})

# ── Resources ─────────────────────────────────────────────────

func get_resources() -> Dictionary:
	return await _http_get("/resources")

func add_resources(gold: int = 0, wood: int = 0, ore: int = 0) -> Dictionary:
	var response = await _http_post("/resources/add", {"gold": gold, "wood": wood, "ore": ore})
	if not response.has("error"):
		resources_updated.emit(response)
	return response

func subtract_resources(gold: int = 0, wood: int = 0, ore: int = 0) -> Dictionary:
	var response = await _http_post("/resources/subtract", {"gold": gold, "wood": wood, "ore": ore})
	if not response.has("error"):
		resources_updated.emit(response)
	return response

func set_resources(gold: int = -1, wood: int = -1, ore: int = -1) -> Dictionary:
	var body := {}
	if gold >= 0: body["gold"] = gold
	if wood >= 0: body["wood"] = wood
	if ore >= 0: body["ore"] = ore
	var response = await _http_post("/resources/set", body)
	if not response.has("error"):
		resources_updated.emit(response)
	return response

# ── Buildings ─────────────────────────────────────────────────

func get_buildings() -> Array:
	var response = await _http_get("/buildings")
	if response is Array:
		return response
	return []

func place_building(type: String, grid_x: int, grid_z: int, grid_index: int = 0) -> Dictionary:
	var response = await _http_post("/buildings/place", {
		"type": type, "grid_x": grid_x, "grid_z": grid_z, "grid_index": grid_index
	})
	if not response.has("error"):
		building_placed.emit(response)
	return response

func collect_resources(building_id: int) -> Dictionary:
	return await _http_post("/buildings/%d/collect" % building_id, {})

func get_production_status() -> Variant:
	return await _http_get("/buildings/production")

func upgrade_building(building_id: int) -> Dictionary:
	var response = await _http_post("/buildings/%d/upgrade" % building_id, {})
	if not response.has("error"):
		building_upgraded.emit(response)
	return response

func buy_troop(troop_name: String) -> Dictionary:
	return await _http_post("/troops/buy", {"troop_name": troop_name})

func load_troop(building_id: int, troop_name: String, extra: Dictionary = {}) -> Dictionary:
	var payload: Dictionary = {"troop_name": troop_name}
	if extra.has("nft_owner"):
		payload["nft_owner"] = str(extra.get("nft_owner", ""))
	if extra.has("owner"):
		payload["owner"] = str(extra.get("owner", ""))
	return await _http_post("/buildings/%d/load-troop" % building_id, payload)

func swap_troop(building_id: int, slot: int, troop_name: String, extra: Dictionary = {}) -> Dictionary:
	var payload: Dictionary = {"slot": slot, "troop_name": troop_name}
	if extra.has("nft_owner"):
		payload["nft_owner"] = str(extra.get("nft_owner", ""))
	if extra.has("owner"):
		payload["owner"] = str(extra.get("owner", ""))
	return await _http_post("/buildings/%d/swap-troop" % building_id, payload)

func remove_troop(building_id: int, slot: int, extra: Dictionary = {}) -> Dictionary:
	var payload: Dictionary = {"slot": slot}
	for key in ["ship_troops", "port_number", "grid_index", "grid_x", "grid_z"]:
		if extra.has(key):
			payload[key] = extra.get(key)
	return await _http_post("/buildings/%d/remove-troop" % building_id, payload)

func reinforce() -> Dictionary:
	return await _http_post("/reinforce", {})

func report_troop_death(troop_name: String) -> Dictionary:
	return await _http_post("/troop-died", {"troop_name": troop_name})

func get_ships() -> Dictionary:
	return await _http_get("/ships")

func link_wallet(w: String) -> void:
	if token == "" or w == "":
		return
	var response = await _http_post("/players/link-wallet", {"wallet": w})
	# Server may tell us the wallet already belongs to another account and
	# hand us that account's canonical token. Switch our session to it so
	# desktop and Farcaster players share the same progress.
	if response.get("switched_account", false) and response.has("token"):
		token = _safe_str(response.get("token"), token)
		player_id = _safe_str(response.get("id"), player_id)
		display_name = _safe_str(response.get("name"), display_name)
		trophies = _safe_int(response.get("trophies"), trophies)
		wallet = _safe_str(response.get("wallet"), w)
		_save_token()
		auth_ok.emit(response)
	elif response.get("success", false):
		wallet = w

func move_building(building_id: int, grid_x: int, grid_z: int) -> Dictionary:
	return await _http_post("/buildings/%d/move" % building_id, {"grid_x": grid_x, "grid_z": grid_z})

func buy_ship(building_id: int) -> Dictionary:
	return await _http_post("/buildings/%d/buy-ship" % building_id, {})

func submit_battle_result(defender_id: String, actions: Array, result: String, casualties: Dictionary = {}, battle_session_id: String = "") -> Dictionary:
	var payload: Dictionary = {
		"defender_id": defender_id,
		"actions": actions,
		"result": result,
		"casualties": casualties,
	}
	if battle_session_id != "":
		payload["battle_session_id"] = battle_session_id
	return await _http_post("/attack/result", payload)


## Lightweight surrender — no replay, no trophy/loot transfer; just stamps the
## battle_session so the server's matchmaker excludes this defender from this
## attacker's Find Enemy pool for the next 24 hours.
func submit_surrender(defender_id: String, battle_session_id: String = "") -> Dictionary:
	var payload: Dictionary = {"defender_id": defender_id}
	if battle_session_id != "":
		payload["battle_session_id"] = battle_session_id
	return await _http_post("/battle/surrender", payload)


func remove_building(building_id: int) -> Dictionary:
	var http = HTTPRequest.new()
	add_child(http)
	var headers = ["Content-Type: application/json", "x-token: " + token]
	http.request(SERVER_URL + "/buildings/%d" % building_id, headers, HTTPClient.METHOD_DELETE)
	var result = await http.request_completed
	http.queue_free()
	var response = _parse_response(result)
	if not response.has("error"):
		building_removed.emit(response)
	return response

# ── Troops ────────────────────────────────────────────────────

func get_troops() -> Array:
	var response = await _http_get("/troops")
	if response is Array:
		return response
	return []

func _server_troop_type(troop_type: String) -> String:
	match troop_type:
		"DemonKing":
			return "demon_king"
		"FireDragon":
			return "fire_dragon"
	return troop_type.to_lower()

func upgrade_troop(troop_type: String) -> Dictionary:
	return await _http_post("/troops/%s/upgrade" % _server_troop_type(troop_type), {})

func upgrade_altar_skill(skill_id: String) -> Dictionary:
	return await _http_post("/altar/skills/%s/upgrade" % skill_id, {})

# ── Matchmaking ───────────────────────────────────────────────

func find_enemy() -> Dictionary:
	return await _http_get("/find-enemy")

# ── Trophies ──────────────────────────────────────────────────

func get_trophies() -> Dictionary:
	var response = await _http_get("/trophies")
	return response

func recalculate_trophies() -> Dictionary:
	var response = await _http_post("/trophies/recalculate", {})
	if not response.has("error"):
		trophies = _safe_int(response.get("trophies"), trophies)
	return response

# ── HTTP Helpers ──────────────────────────────────────────────

func _http_get(endpoint: String) -> Variant:
	var http = HTTPRequest.new()
	add_child(http)
	var headers = ["x-token: " + token]
	http.request(SERVER_URL + endpoint, headers, HTTPClient.METHOD_GET)
	var result = await http.request_completed
	http.queue_free()
	return _parse_response(result)

func _http_post(endpoint: String, body: Dictionary) -> Dictionary:
	var http = HTTPRequest.new()
	add_child(http)
	var headers = ["Content-Type: application/json", "x-token: " + token]
	http.request(SERVER_URL + endpoint, headers, HTTPClient.METHOD_POST, JSON.stringify(body))
	var result = await http.request_completed
	http.queue_free()
	return _parse_response(result)

func _parse_response(result: Array) -> Variant:
	var result_code = result[0]
	var response_code = result[1]
	var resp_headers = result[2]
	var body_bytes: PackedByteArray = result[3]
	if body_bytes.size() == 0:
		return {"error": "Empty response", "code": response_code}
	var text = body_bytes.get_string_from_utf8()
	var json = JSON.new()
	if json.parse(text) != OK:
		return {"error": "Invalid JSON", "raw": text}
	return json.data
