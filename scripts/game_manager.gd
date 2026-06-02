extends Node
## Root game manager — manages the Island view.

var _transitioning := false
var _visibility_cb: JavaScriptObject = null

# ── Node refs ──
@onready var island_view: Node3D = $IslandView
@onready var cloud: CanvasLayer = $CloudTransition


func _ready() -> void:
	Engine.max_fps = 0
	Engine.physics_ticks_per_second = 60
	Engine.max_physics_steps_per_frame = 2

	if OS.has_feature("web"):
		_visibility_cb = JavaScriptBridge.create_callback(_on_visibility_change)
		JavaScriptBridge.eval("""
			(function() {
				if (window.__clashGodotVisibilityHandler) {
					document.removeEventListener('visibilitychange', window.__clashGodotVisibilityHandler);
				}
				window.__clashGodotVisibilityHandler = function() {
					if (!document.hidden && window._godotVisibilityCb) {
						window._godotVisibilityCb(1);
					}
				};
				document.addEventListener('visibilitychange', window.__clashGodotVisibilityHandler);
			})();
		""")
		JavaScriptBridge.get_interface("window").set("_godotVisibilityCb", _visibility_cb)

	island_view.visible = true
	island_view.process_mode = Node.PROCESS_MODE_INHERIT

	if OS.has_feature("web"):
		_boost_web_lighting.call_deferred()

	cloud._set_clouds_covering()
	await get_tree().process_frame
	cloud.reveal()


static var max_delta: float = 0.1

static func clamped_delta(delta: float) -> float:
	return minf(delta, max_delta)


func _exit_tree() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval("(function(){try{if(window.__clashGodotVisibilityHandler){document.removeEventListener('visibilitychange', window.__clashGodotVisibilityHandler);window.__clashGodotVisibilityHandler=null;}window._godotVisibilityCb=null;}catch(e){}})()", true)
	_visibility_cb = null


func _on_visibility_change(_args: Array) -> void:
	pass


func _boost_web_lighting() -> void:
	var root = get_tree().current_scene

	for node in _find_all_of_class(root, "WorldEnvironment"):
		var env = node.environment
		if env:
			env.ambient_light_energy = 1.8
			env.ambient_light_color = Color(0.85, 0.88, 0.96, 1)
			env.tonemap_exposure = 1.8
			env.tonemap_white = 12.0
			env.ssao_enabled = false
			env.ssil_enabled = false

	for node in _find_all_of_class(root, "DirectionalLight3D"):
		node.light_energy *= 3.0


func _find_all_of_class(node: Node, class_name_str: String) -> Array:
	var result: Array = []
	if node.is_class(class_name_str):
		result.append(node)
	for child in node.get_children():
		result.append_array(_find_all_of_class(child, class_name_str))
	return result
