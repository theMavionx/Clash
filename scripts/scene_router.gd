extends Node
## Routes the Web runtime to the isolated God Mode scene only after the
## server-gated React entrypoint has set its in-page authorization marker.

const MAIN_SCENE := "res://scenes/Main.tscn"
const GOD_MODE_SCENE := "res://scenes/GodMode.tscn"


func _ready() -> void:
	call_deferred("_route_initial_scene")


func _route_initial_scene() -> void:
	var destination := MAIN_SCENE
	if _god_mode_page_authorized():
		destination = GOD_MODE_SCENE
	print("[SCENE_ROUTER] destination=%s" % destination)
	var error := get_tree().change_scene_to_file(destination)
	if error != OK:
		push_error("SceneRouter failed to load %s: %s" % [destination, error_string(error)])


func _god_mode_page_authorized() -> bool:
	if not OS.has_feature("web"):
		return OS.get_cmdline_user_args().has("--god-mode")
	var allowed = JavaScriptBridge.eval("Boolean(window.__CLASH_GOD_MODE_GRANTED__ === true)", true)
	return bool(allowed)
