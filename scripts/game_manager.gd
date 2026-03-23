extends Node
## Root game manager — switches between Island view and World Map view.
## Uses shared CloudTransition for smooth Boom Beach-style transitions.

enum View { ISLAND, WORLD_MAP }

var current_view := View.ISLAND
var _transitioning := false

# ── Node refs ──
@onready var island_view: Node3D = $IslandView
@onready var world_map_view: Node2D = $WorldMapView
@onready var cloud: CanvasLayer = $CloudTransition

# ── Map button overlay (shown on island) ──
var _map_btn_layer: CanvasLayer


func _ready() -> void:
	# Start on island, world map hidden
	_show_island_immediate()

	# Build the "Map" button overlay for island view
	_build_map_button()

	# Connect Home button from world map HUD
	_connect_home_button()

	# Cloud reveal to start
	cloud._set_clouds_covering()
	await get_tree().process_frame
	cloud.reveal()


func _connect_home_button() -> void:
	# The HUD is at WorldMapView/UI and emits home_pressed
	var hud = world_map_view.get_node_or_null("UI")
	if hud and hud.has_signal("home_pressed"):
		hud.home_pressed.connect(switch_to_island)


# ══════════════════════════════════════
#  VIEW SWITCHING
# ══════════════════════════════════════

func switch_to_map() -> void:
	if current_view == View.WORLD_MAP or _transitioning:
		return
	_transitioning = true
	cloud.close()
	await cloud.close_finished
	_show_map_immediate()
	cloud.reveal()
	await cloud.reveal_finished
	_transitioning = false


func switch_to_island() -> void:
	if current_view == View.ISLAND or _transitioning:
		return
	_transitioning = true
	cloud.close()
	await cloud.close_finished
	_show_island_immediate()
	cloud.reveal()
	await cloud.reveal_finished
	_transitioning = false


func _show_island_immediate() -> void:
	current_view = View.ISLAND
	island_view.visible = true
	island_view.process_mode = Node.PROCESS_MODE_INHERIT
	# Show all island CanvasLayers (building UI etc.)
	_set_canvas_layers_visible(island_view, true)
	world_map_view.visible = false
	world_map_view.process_mode = Node.PROCESS_MODE_DISABLED
	# Hide world map CanvasLayers (HUD)
	_set_canvas_layers_visible(world_map_view, false)
	if _map_btn_layer:
		_map_btn_layer.visible = true


func _show_map_immediate() -> void:
	current_view = View.WORLD_MAP
	island_view.visible = false
	island_view.process_mode = Node.PROCESS_MODE_DISABLED
	# Hide all island CanvasLayers (building UI etc.)
	_set_canvas_layers_visible(island_view, false)
	world_map_view.visible = true
	world_map_view.process_mode = Node.PROCESS_MODE_INHERIT
	# Show world map CanvasLayers (HUD)
	_set_canvas_layers_visible(world_map_view, true)
	if _map_btn_layer:
		_map_btn_layer.visible = false


## Recursively find all CanvasLayer nodes in a subtree and set visibility.
## This is needed because CanvasLayers render independently of parent visibility.
func _set_canvas_layers_visible(root: Node, vis: bool) -> void:
	for child in root.get_children():
		if child is CanvasLayer:
			child.visible = vis
		_set_canvas_layers_visible(child, vis)


# ══════════════════════════════════════
#  MAP BUTTON (island overlay)
# ══════════════════════════════════════

func _build_map_button() -> void:
	_map_btn_layer = CanvasLayer.new()
	_map_btn_layer.name = "MapBtnOverlay"
	_map_btn_layer.layer = 50
	add_child(_map_btn_layer)

	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_map_btn_layer.add_child(root)

	var btn := Button.new()
	btn.name = "MapBtn"
	btn.text = "Map"
	btn.custom_minimum_size = Vector2(112, 48)
	btn.add_theme_font_size_override("font_size", 19)
	btn.add_theme_color_override("font_color", Color.WHITE)
	btn.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	btn.offset_left = -126
	btn.offset_top = -58
	btn.offset_right = -14
	btn.offset_bottom = -10

	# Blue-teal button style (distinct from green Home)
	btn.add_theme_stylebox_override("normal", _btn_style(
		Color(0.10, 0.28, 0.42, 0.92), Color(0.06, 0.18, 0.30, 1.0)))
	btn.add_theme_stylebox_override("hover", _btn_style(
		Color(0.14, 0.36, 0.52, 0.95), Color(0.08, 0.24, 0.38, 1.0)))
	btn.add_theme_stylebox_override("pressed", _btn_style(
		Color(0.06, 0.20, 0.32, 0.95), Color(0.04, 0.14, 0.24, 1.0)))
	btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	btn.pressed.connect(switch_to_map)
	root.add_child(btn)


func _btn_style(bg: Color, border: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(2)
	sb.set_corner_radius_all(22)
	sb.content_margin_left = 12
	sb.content_margin_right = 12
	sb.content_margin_top = 8
	sb.content_margin_bottom = 8
	return sb
