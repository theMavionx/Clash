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

const SERVER_URL := "https://clashofperps.fun/api"

var token: String = ""
var player_id: String = ""
var display_name: String = ""
var trophies: int = 0

func _ready() -> void:
	var cfg = ConfigFile.new()
	if cfg.load("user://auth.cfg") == OK:
		token = cfg.get_value("auth", "token", "")
		display_name = cfg.get_value("auth", "name", "")

func _save_token() -> void:
	var cfg = ConfigFile.new()
	cfg.set_value("auth", "token", token)
	cfg.set_value("auth", "name", display_name)
	cfg.save("user://auth.cfg")

func has_token() -> bool:
	return token != ""

# ── Registration ──────────────────────────────────────────────

func register(player_name: String, wallet: String = "") -> Dictionary:
	var http = HTTPRequest.new()
	add_child(http)
	var headers = ["Content-Type: application/json"]
	var data = {"name": player_name}
	if wallet != "":
		data["wallet"] = wallet
	var body = JSON.stringify(data)
	http.request(SERVER_URL + "/players/register", headers, HTTPClient.METHOD_POST, body)
	var result = await http.request_completed
	http.queue_free()
	var response = _parse_response(result)
	if response.has("token"):
		token = response["token"]
		player_id = response["id"]
		display_name = response["name"]
		trophies = response.get("trophies", 0)
		_save_token()
		auth_ok.emit(response)
	return response

# ── Login (get state with existing token) ─────────────────────

func login() -> Dictionary:
	var response = await _http_get("/state")
	if response.has("id"):
		player_id = response["id"]
		display_name = response["name"]
		trophies = response.get("trophies", 0)
		auth_ok.emit(response)
	return response

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

func move_building(building_id: int, grid_x: int, grid_z: int) -> Dictionary:
	return await _http_post("/buildings/%d/move" % building_id, {"grid_x": grid_x, "grid_z": grid_z})

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

func upgrade_troop(troop_type: String) -> Dictionary:
	return await _http_post("/troops/%s/upgrade" % troop_type.to_lower(), {})

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
		trophies = response.get("trophies", trophies)
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
