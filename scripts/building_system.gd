extends Node3D

## Grid-based building system (Clash of Clans style)
## Grid is aligned to the gridPlane node in the scene

# ── Grid Settings ─────────────────────────────────────────────
@export var grid_width: int = 27
@export var grid_height: int = 27
@export var grid_plane_path: NodePath = "../gridPlane"
@export var create_ui: bool = true
@export var always_show_grid: bool = false
@export var allowed_buildings: PackedStringArray = []  # Empty = all allowed
@export var blocked_buildings: PackedStringArray = []  # These are never allowed

# ── Building Definitions ──────────────────────────────────────
var building_defs: Dictionary = {
	"mine": {
		"name": "Mine",
		"cells": Vector2i(3, 3),
		"color": Color(0.55, 0.45, 0.2, 0.5),
		"height": 0.3,
		"scene": "res://Model/Mine/1.gltf",
		"model_scale": 0.25,
		"hp_levels": [1200, 2200, 3800],
		"cost": {"gold": 400, "wood": 150},
	},
	"barn": {
		"name": "Barn",
		"cells": Vector2i(4, 3),
		"color": Color(0.6, 0.25, 0.2, 0.5),
		"height": 0.4,
		"scene": "res://Model/Barn/1.glb",
		"scenes": ["res://Model/Barn/1.glb", "res://Model/Barn/2.glb", "res://Model/Barn/3.glb"],
		"model_scale": 0.25,
		"hp_levels": [2000, 3500, 6000],
		"cost": {"gold": 200, "wood": 200, "ore": 100},
	},
	"port": {
		"name": "Port",
		"cells": Vector2i(4, 3),
		"color": Color(0.2, 0.45, 0.7, 0.5),
		"height": 0.3,
		"scene": "res://Model/Port/1.glb",
		"scenes": ["res://Model/Port/1.glb", "res://Model/Port/2.glb", "res://Model/Port/3.glb"],
		"model_scale": 0.25,
		"hp_levels": [1800, 3200, 5500],
		"cost": {"gold": 800, "wood": 300, "ore": 200},
	},
	"sawmill": {
		"name": "Sawmill",
		"cells": Vector2i(3, 3),
		"color": Color(0.45, 0.65, 0.25, 0.5),
		"height": 0.35,
		"scene": "res://Model/Sawmill/1.glb",
		"model_scale": 0.1,
		"hp_levels": [1200, 2200, 3800],
		"cost": {"gold": 300},
	},
	"barracks": {
		"name": "Barracks",
		"cells": Vector2i(3, 3),
		"color": Color(0.6, 0.35, 0.15, 0.5),
		"height": 0.4,
		"scene": "res://Model/Barn/1.glb",
		"scenes": ["res://Model/Barn/1.glb", "res://Model/Barn/2.glb", "res://Model/Barn/3.glb"],
		"model_scale": 0.25,
		"hp_levels": [1500, 2800, 4500],
		"cost": {"gold": 500, "wood": 300},
	},
	"town_hall": {
		"name": "Town Hall",
		"cells": Vector2i(4, 4),
		"color": Color(0.7, 0.55, 0.2, 0.5),
		"height": 0.5,
		"scene": "res://Model/Town_Hall/1.gltf",
		"scenes": ["res://Model/Town_Hall/1.gltf", "res://Model/Town_Hall/2.gltf", "res://Model/Town_Hall/3.gltf"],
		"model_scale": 0.25,
		"hp_levels": [3500, 6000, 10000],
		"is_main": true,
		"max_count": 1,
		"cost": {},
	},
	"turret": {
		"name": "Turret",
		"cells": Vector2i(2, 2),
		"color": Color(0.5, 0.5, 0.55, 0.5),
		"height": 0.45,
		"scene": "res://Model/Turret/scene.gltf",
		"model_scale": 0.25,
		"hp_levels": [900, 1600, 2800],
		"cost": {"gold": 600, "wood": 350, "ore": 200},
	},
}

# ── Resources ─────────────────────────────────────────────────
var resources: Dictionary = {
	"wood": 10000,
	"gold": 10000,
	"ore": 10000,
}

# ── Calculated from gridPlane ─────────────────────────────────
var cell_size: float = 0.0
var grid_center: Vector3 = Vector3.ZERO
var grid_y: float = 0.0
var grid_rotation: float = 0.0
var grid_extent_x: float = 0.0
var grid_extent_z: float = 0.0

# ── Grid State ────────────────────────────────────────────────
var grid: Array[bool] = []
var placed_buildings: Array[Dictionary] = []

# ── Range Indicator ───────────────────────────────────────────
var _range_indicator: MeshInstance3D = null

# ── Move State ────────────────────────────────────────────────
var _move_arrows: Node3D = null
var _is_moving: bool = false
var _move_source_gp: Vector2i = Vector2i.ZERO
var _move_source_pos: Vector3 = Vector3.ZERO
var _move_indicator: MeshInstance3D = null

# ── Placement State ───────────────────────────────────────────
var is_placing: bool = false
var current_building_id: String = ""
var ghost: Node3D = null
var ghost_material: StandardMaterial3D = null
var current_grid_pos: Vector2i = Vector2i.ZERO
var grid_visual: MeshInstance3D = null

# ── Selection State ───────────────────────────────────────────
var selected_building: Dictionary = {}
var _outline_material: ShaderMaterial
var _cel_shader: Shader

# ── Outline Shader ───────────────────────────────────────────
const OUTLINE_SHADER_CODE = """
shader_type spatial;
render_mode cull_front, unshaded;

uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width = 1.0;

void vertex() {
	vec4 clip_position = PROJECTION_MATRIX * (MODELVIEW_MATRIX * vec4(VERTEX, 1.0));
	vec3 clip_normal = mat3(PROJECTION_MATRIX) * (mat3(MODELVIEW_MATRIX) * NORMAL);
	vec2 offset = normalize(clip_normal.xy) / VIEWPORT_SIZE * clip_position.w * outline_width * 2.0;
	clip_position.xy += offset;
	POSITION = clip_position;
}

void fragment() {
	ALBEDO = outline_color.rgb;
	if (outline_color.a < 1.0) {
		ALPHA = outline_color.a;
	}
}
"""

# ── UI ────────────────────────────────────────────────────────
var canvas: CanvasLayer
var build_button: Button
var attack_button: Button
var _search_tween: Tween
var _is_searching: bool = false
var shop_panel: PanelContainer
var is_shop_open: bool = false
var wood_label: Label
var gold_label: Label
var _fps_lbl: Label
var ore_label: Label

var building_panel: PanelContainer
var building_panel_title: Label
var building_panel_hp: Label
var building_panel_hp_bar: ProgressBar
var building_panel_cost: Label
var building_panel_upgrade_btn: Button

# ── Registration UI ──────────────────────────────────────────
var register_panel: PanelContainer
var register_name_input: LineEdit
var register_status_label: Label
var player_name_label: Label
var trophy_label: Label

# ── Enemy attack state ───────────────────────────────────────
var is_viewing_enemy: bool = false
var _server_busy: bool = false
var home_buildings_backup: Array[Dictionary] = []
var home_grid_backup: Array[bool] = []
var enemy_info: Dictionary = {}
var return_button: Button
var enemy_label: Label
var find_button: Button

# ── Port / Ships ─────────────────────────────────────────────
var port_panel: PanelContainer
var port_ship_count_label: Label
var owned_ships: int = 0
const SHIP_COST_WOOD: int = 500
const SHIP_MODEL_PATH: String = "res://Model/Ship/Sail Ship.glb"
const SHIP_DISPLAY_SCALE: float = 0.1

# ── Barracks ──────────────────────────────────────────────────
var barracks_panel: PanelContainer
var barracks_vbox: VBoxContainer
var troop_levels: Dictionary = {
	"Knight": 1, "Mage": 1, "Barbarian": 1, "Archer": 1, "Ranger": 1,
}
var troop_defs: Dictionary = {
	"Knight": {
		"display": "Knight (Tank)",
		"costs": {
			1: {"gold": 150, "ore": 80},
			2: {"gold": 400, "ore": 250},
			3: {"gold": 900, "ore": 600},
		}
	},
	"Mage": {
		"display": "Wizard (Burst Mage)",
		"costs": {
			1: {"gold": 250, "ore": 150},
			2: {"gold": 600, "ore": 400},
			3: {"gold": 1400, "ore": 900},
		}
	},
	"Barbarian": {
		"display": "Berserker (Fast Brawler)",
		"costs": {
			1: {"gold": 200, "ore": 120},
			2: {"gold": 500, "ore": 350},
			3: {"gold": 1100, "ore": 750},
		}
	},
	"Archer": {
		"display": "Archer (Sniper)",
		"costs": {
			1: {"gold": 180, "wood": 100},
			2: {"gold": 450, "wood": 300},
			3: {"gold": 1000, "wood": 700},
		}
	},
	"Ranger": {
		"display": "Ranger (Balanced DPS)",
		"costs": {
			1: {"gold": 120, "wood": 60},
			2: {"gold": 350, "wood": 200},
			3: {"gold": 800, "wood": 500},
		}
	},
}


func _ready() -> void:
	add_to_group("building_systems")
	grid.resize(grid_width * grid_height)
	grid.fill(false)
	_setup_from_grid_plane()
	# Auto-configure grid restrictions based on grid plane
	var plane_name = ""
	var plane = get_node_or_null(grid_plane_path)
	if plane:
		plane_name = plane.name
	if plane_name == "gridPlane2":
		# Grid 2: only port allowed
		allowed_buildings = PackedStringArray(["port"])
	elif plane_name == "gridPlane":
		# Grid 1: everything except port
		blocked_buildings = PackedStringArray(["port"])
	if create_ui:
		_create_ui()
		_create_building_panel()
		_create_barracks_panel()
		_create_port_panel()
		_create_fps_label()
		# In web builds — hide Godot UI, React renders its own
		if OS.has_feature("web") and canvas:
			canvas.visible = false
	else:
		# Non-UI grid (e.g. port grid) — borrow canvas from main BuildingSystem
		for bs in get_tree().get_nodes_in_group("building_systems"):
			if bs != self and bs.canvas:
				canvas = bs.canvas
				_create_port_panel()
				break
	if always_show_grid:
		_show_grid()
	# Listen for server auth to load buildings (works for all grids)
	var net = get_node_or_null("/root/Net")
	if net:
		net.auth_ok.connect(_on_server_auth_ok)
	# Auto-login (always, not just when UI is created)
	if net and net.has_token():
		_auto_login()


func _process(_delta: float) -> void:
	if _fps_lbl:
		_fps_lbl.text = "FPS: %d" % Engine.get_frames_per_second()
	if selected_building.size() > 0 and building_panel and building_panel.visible:
		var hp = selected_building.get("hp", 0)
		var max_hp = selected_building.get("max_hp", 1)
		if building_panel_hp:
			building_panel_hp.text = "HP: %d / %d" % [hp, max_hp]
		if building_panel_hp_bar:
			building_panel_hp_bar.max_value = max_hp
			building_panel_hp_bar.value = hp
	_update_building_hp_bars()


func _apply_outline(b: Dictionary) -> void:
	var node = b.get("node", null)
	if not is_instance_valid(node):
		return
	if _outline_material == null:
		var shader = Shader.new()
		shader.code = OUTLINE_SHADER_CODE
		_outline_material = ShaderMaterial.new()
		_outline_material.shader = shader
		_outline_material.set_shader_parameter("outline_color", Color(1.0, 1.0, 1.0, 1.0))
		_outline_material.set_shader_parameter("outline_width", 3.0)
	# Apply outline via surface_override with unique material copies
	for mesh in _get_all_mesh_instances(node):
		var surface_count = mesh.mesh.get_surface_count() if mesh.mesh else 0
		for s in surface_count:
			var mat = mesh.get_active_material(s)
			if mat:
				# Duplicate so we don't affect other buildings sharing same material
				var unique_mat = mat.duplicate()
				unique_mat.next_pass = _outline_material
				mesh.set_surface_override_material(s, unique_mat)
			else:
				var base_mat = StandardMaterial3D.new()
				base_mat.next_pass = _outline_material
				mesh.set_surface_override_material(s, base_mat)


func _remove_outline(node: Node3D = null) -> void:
	if node == null:
		node = selected_building.get("node", null)
	if not is_instance_valid(node):
		return
	for mesh in _get_all_mesh_instances(node):
		var surface_count = mesh.mesh.get_surface_count() if mesh.mesh else 0
		for s in surface_count:
			# Clear the override to restore original shared material
			mesh.set_surface_override_material(s, null)


## Remove outline from ALL buildings across all building systems
static func _remove_all_outlines() -> void:
	for bs in Engine.get_main_loop().root.get_tree().get_nodes_in_group("building_systems"):
		var old_node = bs.selected_building.get("node", null)
		if is_instance_valid(old_node):
			bs._remove_outline(old_node)


func _get_all_mesh_instances(node: Node) -> Array:
	var result := []
	if node is MeshInstance3D:
		result.append(node)
	for child in node.get_children():
		result.append_array(_get_all_mesh_instances(child))
	return result


func _apply_cel_shader(node: Node) -> void:
	if _cel_shader == null:
		_cel_shader = load("res://shaders/cel.gdshader")
	if _cel_shader == null:
		return
	for mesh in _get_all_mesh_instances(node):
		var surface_count = mesh.mesh.get_surface_count() if mesh.mesh else 0
		for s in surface_count:
			var mat = mesh.get_active_material(s)
			var tex: Texture2D = null
			var albedo := Color(1, 1, 1, 1)
			if mat is StandardMaterial3D:
				tex = mat.albedo_texture
				albedo = mat.albedo_color
			var cel_mat = ShaderMaterial.new()
			cel_mat.shader = _cel_shader
			cel_mat.set_shader_parameter("color", albedo)
			if tex:
				cel_mat.set_shader_parameter("base_texture", tex)
			mesh.set_surface_override_material(s, cel_mat)


func _create_fps_label() -> void:
	if not canvas:
		return
	_fps_lbl = Label.new()
	_fps_lbl.text = "FPS: 0"
	_fps_lbl.add_theme_font_size_override("font_size", 28)
	_fps_lbl.add_theme_color_override("font_color", Color(0.0, 0.0, 0.0, 1.0))
	_fps_lbl.add_theme_color_override("font_shadow_color", Color(1, 1, 1, 0.5))
	_fps_lbl.add_theme_constant_override("shadow_offset_x", 1)
	_fps_lbl.add_theme_constant_override("shadow_offset_y", 1)
	_fps_lbl.set_anchors_preset(Control.PRESET_CENTER_LEFT)
	_fps_lbl.offset_left = 14
	canvas.add_child(_fps_lbl)


func _setup_from_grid_plane() -> void:
	var plane = get_node_or_null(grid_plane_path)
	if plane == null:
		push_warning("BuildingSystem: gridPlane not found!")
		return

	plane.visible = false
	grid_center = plane.global_position
	grid_y = grid_center.y + 0.05
	grid_rotation = plane.global_rotation.y
	grid_extent_x = plane.global_transform.basis.x.length()
	grid_extent_z = plane.global_transform.basis.z.length()
	cell_size = grid_extent_x / float(grid_width)

	global_position = Vector3(grid_center.x, grid_y, grid_center.z)
	global_rotation.y = grid_rotation


func _create_ui() -> void:
	canvas = CanvasLayer.new()
	add_child(canvas)

	# ── Resource bar (top center) ──────────────────────────────
	var res_wrapper = PanelContainer.new()
	res_wrapper.anchor_left = 0.5
	res_wrapper.anchor_right = 0.5
	res_wrapper.anchor_top = 0.0
	res_wrapper.anchor_bottom = 0.0
	res_wrapper.offset_left = -420
	res_wrapper.offset_right = 420
	res_wrapper.offset_top = 10
	res_wrapper.offset_bottom = 95
	var wrapper_style = StyleBoxFlat.new()
	wrapper_style.bg_color = Color(0.05, 0.06, 0.1, 0.85)
	wrapper_style.corner_radius_top_left = 16
	wrapper_style.corner_radius_top_right = 16
	wrapper_style.corner_radius_bottom_left = 16
	wrapper_style.corner_radius_bottom_right = 16
	wrapper_style.border_width_left = 2
	wrapper_style.border_width_right = 2
	wrapper_style.border_width_top = 2
	wrapper_style.border_width_bottom = 2
	wrapper_style.border_color = Color(0.3, 0.32, 0.4, 0.6)
	wrapper_style.shadow_color = Color(0, 0, 0, 0.5)
	wrapper_style.shadow_size = 6
	wrapper_style.content_margin_left = 16
	wrapper_style.content_margin_right = 16
	wrapper_style.content_margin_top = 8
	wrapper_style.content_margin_bottom = 8
	res_wrapper.add_theme_stylebox_override("panel", wrapper_style)
	canvas.add_child(res_wrapper)

	var res_bar = HBoxContainer.new()
	res_bar.add_theme_constant_override("separation", 40)
	res_bar.alignment = BoxContainer.ALIGNMENT_CENTER
	res_wrapper.add_child(res_bar)

	gold_label = _create_resource_label(res_bar, "Gold", resources.gold, Color(0.9, 0.75, 0.2))
	wood_label = _create_resource_label(res_bar, "Wood", resources.wood, Color(0.45, 0.7, 0.3))
	ore_label = _create_resource_label(res_bar, "Ore", resources.ore, Color(0.6, 0.65, 0.7))

	# ── Player name label (top left) ────────────────────────
	player_name_label = Label.new()
	player_name_label.anchor_left = 0.0
	player_name_label.anchor_top = 0.0
	player_name_label.offset_left = 20
	player_name_label.offset_top = 20
	player_name_label.add_theme_font_size_override("font_size", 20)
	player_name_label.add_theme_color_override("font_color", Color(0.9, 0.85, 0.5))
	canvas.add_child(player_name_label)

	# ── Trophy label (below player name) ────────────────────
	trophy_label = Label.new()
	trophy_label.anchor_left = 0.0
	trophy_label.anchor_top = 0.0
	trophy_label.offset_left = 20
	trophy_label.offset_top = 48
	trophy_label.add_theme_font_size_override("font_size", 16)
	trophy_label.add_theme_color_override("font_color", Color(0.85, 0.7, 0.2))
	trophy_label.text = ""
	canvas.add_child(trophy_label)

	_update_player_name_label()

	# ── Registration panel ──────────────────────────────────
	_create_register_panel()

	# ── Find button (bottom right, above Attack) ─────────────────
	find_button = Button.new()
	find_button.text = "Find Enemy"
	find_button.custom_minimum_size = Vector2(300, 120)
	find_button.anchor_left = 1.0
	find_button.anchor_right = 1.0
	find_button.anchor_top = 1.0
	find_button.anchor_bottom = 1.0
	find_button.offset_left = -320
	find_button.offset_right = -20
	find_button.offset_top = -420
	find_button.offset_bottom = -300
	_style_button(find_button, Color(0.2, 0.4, 0.6), Color(0.25, 0.5, 0.7))
	find_button.pressed.connect(_on_find_pressed)
	canvas.add_child(find_button)

	# ── Attack button (bottom right, above Build) ───────────────
	attack_button = Button.new()
	attack_button.text = "Attack"
	attack_button.custom_minimum_size = Vector2(300, 120)
	attack_button.anchor_left = 1.0
	attack_button.anchor_right = 1.0
	attack_button.anchor_top = 1.0
	attack_button.anchor_bottom = 1.0
	attack_button.offset_left = -320
	attack_button.offset_right = -20
	attack_button.offset_top = -280
	attack_button.offset_bottom = -160
	_style_button(attack_button, Color(0.6, 0.2, 0.2), Color(0.7, 0.25, 0.25))
	attack_button.pressed.connect(_on_attack_pressed)
	canvas.add_child(attack_button)

	# ── Build button (bottom right) ────────────────────────────
	build_button = Button.new()
	build_button.text = "Build"
	build_button.custom_minimum_size = Vector2(300, 120)
	build_button.anchor_left = 1.0
	build_button.anchor_right = 1.0
	build_button.anchor_top = 1.0
	build_button.anchor_bottom = 1.0
	build_button.offset_left = -320
	build_button.offset_right = -20
	build_button.offset_top = -140
	build_button.offset_bottom = -20
	_style_button(build_button, Color(0.2, 0.45, 0.75), Color(0.25, 0.5, 0.8))
	build_button.pressed.connect(_toggle_shop)
	canvas.add_child(build_button)


	# ── Shop panel (center) ────────────────────────────────────
	shop_panel = PanelContainer.new()
	shop_panel.visible = false
	shop_panel.custom_minimum_size = Vector2(500, 700)
	var panel_style = StyleBoxFlat.new()
	panel_style.bg_color = Color(0.12, 0.14, 0.2, 1.0)
	panel_style.corner_radius_top_left = 12
	panel_style.corner_radius_top_right = 12
	panel_style.corner_radius_bottom_left = 12
	panel_style.corner_radius_bottom_right = 12
	panel_style.border_width_left = 2
	panel_style.border_width_right = 2
	panel_style.border_width_top = 2
	panel_style.border_width_bottom = 2
	panel_style.border_color = Color(0.3, 0.35, 0.5, 1.0)
	shop_panel.add_theme_stylebox_override("panel", panel_style)
	shop_panel.anchor_left = 0.5
	shop_panel.anchor_right = 0.5
	shop_panel.anchor_top = 0.5
	shop_panel.anchor_bottom = 0.5
	shop_panel.offset_left = -250
	shop_panel.offset_right = 250
	shop_panel.offset_top = -350
	shop_panel.offset_bottom = 350
	canvas.add_child(shop_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	shop_panel.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	margin.add_child(vbox)

	var title = Label.new()
	title.text = "Buildings"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	vbox.add_child(title)

	var sep = HSeparator.new()
	vbox.add_child(sep)

	for id in building_defs:
		var def = building_defs[id]
		var cost = def.get("cost", {})
		var cost_parts: Array = []
		if cost.has("gold"):
			cost_parts.append("Gold: %d" % cost.gold)
		if cost.has("wood"):
			cost_parts.append("Wood: %d" % cost.wood)
		if cost.has("ore"):
			cost_parts.append("Ore: %d" % cost.ore)
		var cost_text = "  ".join(cost_parts) if cost_parts.size() > 0 else "Free"
		var btn = Button.new()
		btn.text = "%s (%dx%d)\n%s" % [def.name, def.cells.x, def.cells.y, cost_text]
		btn.custom_minimum_size = Vector2(0, 100)
		_style_button(btn, Color(0.18, 0.22, 0.35), Color(0.25, 0.3, 0.45))
		var building_id = id
		btn.pressed.connect(func(): _start_placement(building_id))
		vbox.add_child(btn)

	var close_btn = Button.new()
	close_btn.text = "Close"
	close_btn.custom_minimum_size = Vector2(0, 80)
	_style_button(close_btn, Color(0.5, 0.2, 0.2), Color(0.6, 0.25, 0.25))
	close_btn.pressed.connect(_toggle_shop)
	vbox.add_child(close_btn)


func _create_building_panel() -> void:
	if building_panel:
		return
	if not canvas:
		canvas = CanvasLayer.new()
		add_child(canvas)

	building_panel = PanelContainer.new()
	building_panel.visible = false
	building_panel.custom_minimum_size = Vector2(400, 280)
	var bp_style = StyleBoxFlat.new()
	bp_style.bg_color = Color(0.12, 0.14, 0.2, 1.0)
	bp_style.corner_radius_top_left = 12
	bp_style.corner_radius_top_right = 12
	bp_style.corner_radius_bottom_left = 12
	bp_style.corner_radius_bottom_right = 12
	bp_style.border_width_left = 2
	bp_style.border_width_right = 2
	bp_style.border_width_top = 2
	bp_style.border_width_bottom = 2
	bp_style.border_color = Color(0.3, 0.35, 0.5, 1.0)
	building_panel.add_theme_stylebox_override("panel", bp_style)
	building_panel.anchor_left = 0.5
	building_panel.anchor_right = 0.5
	building_panel.anchor_top = 1.0
	building_panel.anchor_bottom = 1.0
	building_panel.offset_left = -200
	building_panel.offset_right = 200
	building_panel.offset_top = -300
	building_panel.offset_bottom = -20
	canvas.add_child(building_panel)

	var bp_margin = MarginContainer.new()
	bp_margin.add_theme_constant_override("margin_left", 16)
	bp_margin.add_theme_constant_override("margin_right", 16)
	bp_margin.add_theme_constant_override("margin_top", 12)
	bp_margin.add_theme_constant_override("margin_bottom", 12)
	building_panel.add_child(bp_margin)

	var bp_vbox = VBoxContainer.new()
	bp_vbox.add_theme_constant_override("separation", 10)
	bp_margin.add_child(bp_vbox)

	building_panel_title = Label.new()
	building_panel_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	building_panel_title.add_theme_color_override("font_color", Color.WHITE)
	bp_vbox.add_child(building_panel_title)

	# HP bar
	building_panel_hp_bar = ProgressBar.new()
	building_panel_hp_bar.custom_minimum_size = Vector2(0, 24)
	building_panel_hp_bar.max_value = 100
	building_panel_hp_bar.value = 100
	var bar_bg = StyleBoxFlat.new()
	bar_bg.bg_color = Color(0.15, 0.15, 0.15, 1.0)
	bar_bg.set_corner_radius_all(4)
	building_panel_hp_bar.add_theme_stylebox_override("background", bar_bg)
	var bar_fill = StyleBoxFlat.new()
	bar_fill.bg_color = Color(0.2, 0.75, 0.2, 1.0)
	bar_fill.set_corner_radius_all(4)
	building_panel_hp_bar.add_theme_stylebox_override("fill", bar_fill)
	building_panel_hp_bar.show_percentage = false
	bp_vbox.add_child(building_panel_hp_bar)

	# HP label
	building_panel_hp = Label.new()
	building_panel_hp.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	building_panel_hp.add_theme_color_override("font_color", Color(0.7, 0.9, 0.7))
	bp_vbox.add_child(building_panel_hp)

	# Upgrade cost label
	building_panel_cost = Label.new()
	building_panel_cost.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	building_panel_cost.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
	building_panel_cost.add_theme_font_size_override("font_size", 13)
	bp_vbox.add_child(building_panel_cost)

	building_panel_upgrade_btn = Button.new()
	building_panel_upgrade_btn.text = "Upgrade"
	building_panel_upgrade_btn.custom_minimum_size = Vector2(0, 80)
	_style_button(building_panel_upgrade_btn, Color(0.2, 0.5, 0.3), Color(0.25, 0.6, 0.35))
	building_panel_upgrade_btn.pressed.connect(_upgrade_selected)
	bp_vbox.add_child(building_panel_upgrade_btn)


func _style_button(btn: Button, normal_color: Color, hover_color: Color) -> void:
	var normal = StyleBoxFlat.new()
	normal.bg_color = normal_color
	normal.corner_radius_top_left = 8
	normal.corner_radius_top_right = 8
	normal.corner_radius_bottom_left = 8
	normal.corner_radius_bottom_right = 8
	btn.add_theme_stylebox_override("normal", normal)

	var hover = StyleBoxFlat.new()
	hover.bg_color = hover_color
	hover.corner_radius_top_left = 8
	hover.corner_radius_top_right = 8
	hover.corner_radius_bottom_left = 8
	hover.corner_radius_bottom_right = 8
	btn.add_theme_stylebox_override("hover", hover)

	var pressed = StyleBoxFlat.new()
	pressed.bg_color = normal_color.darkened(0.2)
	pressed.corner_radius_top_left = 8
	pressed.corner_radius_top_right = 8
	pressed.corner_radius_bottom_left = 8
	pressed.corner_radius_bottom_right = 8
	btn.add_theme_stylebox_override("pressed", pressed)

	btn.add_theme_color_override("font_color", Color.WHITE)
	btn.add_theme_color_override("font_hover_color", Color.WHITE)
	btn.add_theme_color_override("font_pressed_color", Color(0.8, 0.8, 0.8))


func _create_resource_label(parent: Control, res_name: String, amount: int, color: Color) -> Label:
	var hbox = HBoxContainer.new()
	hbox.add_theme_constant_override("separation", 4)
	hbox.alignment = BoxContainer.ALIGNMENT_CENTER
	parent.add_child(hbox)

	var panel = PanelContainer.new()
	panel.custom_minimum_size = Vector2(160, 60)
	var pstyle = StyleBoxFlat.new()
	pstyle.bg_color = Color(0.15, 0.16, 0.22, 0.95)
	pstyle.border_width_left = 2
	pstyle.border_width_right = 2
	pstyle.border_width_top = 2
	pstyle.border_width_bottom = 2
	pstyle.border_color = Color(0.35, 0.37, 0.45, 0.8)
	pstyle.corner_radius_top_left = 10
	pstyle.corner_radius_top_right = 10
	pstyle.corner_radius_bottom_left = 10
	pstyle.corner_radius_bottom_right = 10
	pstyle.content_margin_left = 8
	pstyle.content_margin_right = 8
	pstyle.content_margin_top = 4
	pstyle.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", pstyle)
	hbox.add_child(panel)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 0)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	panel.add_child(vbox)

	var name_lbl = Label.new()
	name_lbl.text = res_name.to_upper()
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.add_theme_color_override("font_color", color.darkened(0.1))
	name_lbl.add_theme_font_size_override("font_size", 13)
	vbox.add_child(name_lbl)

	var amount_lbl = Label.new()
	amount_lbl.text = str(amount)
	amount_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	amount_lbl.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	amount_lbl.add_theme_color_override("font_color", Color.WHITE)
	amount_lbl.add_theme_font_size_override("font_size", 28)
	vbox.add_child(amount_lbl)

	# ── "+" Button ──
	var plus_btn = Button.new()
	plus_btn.text = "+"
	plus_btn.custom_minimum_size = Vector2(40, 40)
	plus_btn.add_theme_font_size_override("font_size", 22)
	var btn_style = StyleBoxFlat.new()
	btn_style.bg_color = color.darkened(0.3)
	btn_style.set_border_width_all(2)
	btn_style.border_color = color.darkened(0.1)
	btn_style.set_corner_radius_all(8)
	btn_style.content_margin_left = 4
	btn_style.content_margin_right = 4
	btn_style.content_margin_top = 2
	btn_style.content_margin_bottom = 2
	plus_btn.add_theme_stylebox_override("normal", btn_style)
	var btn_hover = btn_style.duplicate()
	btn_hover.bg_color = color.darkened(0.15)
	plus_btn.add_theme_stylebox_override("hover", btn_hover)
	var btn_pressed = btn_style.duplicate()
	btn_pressed.bg_color = color.darkened(0.45)
	plus_btn.add_theme_stylebox_override("pressed", btn_pressed)
	plus_btn.add_theme_color_override("font_color", Color.WHITE)
	plus_btn.pressed.connect(_on_add_resource.bind(res_name.to_lower()))
	hbox.add_child(plus_btn)

	return amount_lbl


func _apply_resources_from_server(res: Dictionary) -> void:
	if res.has("gold"):
		resources.gold = res.gold
	if res.has("wood"):
		resources.wood = res.wood
	if res.has("ore"):
		resources.ore = res.ore
	_update_resource_ui()


func _update_resource_ui() -> void:
	if wood_label:
		wood_label.text = str(resources.wood)
	if gold_label:
		gold_label.text = str(resources.gold)
	if ore_label:
		ore_label.text = str(resources.ore)
	# Send to React
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("resources", {
			"gold": resources.gold, "wood": resources.wood, "ore": resources.ore,
		})


func _on_add_resource(res_name: String) -> void:
	var net = get_node_or_null("/root/Net")
	if net and net.has_token():
		var args = {"gold": 0, "wood": 0, "ore": 0}
		args[res_name] = 1000
		var result = await net.add_resources(args.gold, args.wood, args.ore)
		if not result.has("error"):
			_apply_resources_from_server(result)
	else:
		resources[res_name] += 1000
		_update_resource_ui()


func _update_player_name_label() -> void:
	if not player_name_label:
		return
	var net = get_node_or_null("/root/Net")
	if net and net.display_name != "":
		if player_name_label:
			player_name_label.text = net.display_name
		if trophy_label:
			trophy_label.text = "Trophies: %d" % net.trophies
		var bridge = get_node_or_null("/root/Bridge")
		if bridge:
			bridge.send_to_react("state", {
				"player_name": net.display_name,
				"trophies": net.trophies,
				"player_id": net.player_id,
			})
	else:
		if player_name_label:
			player_name_label.text = ""
		if trophy_label:
			trophy_label.text = ""


func _create_register_panel() -> void:
	var net = get_node_or_null("/root/Net")
	if net and net.has_token():
		# Already registered — try to login and load state
		_auto_login()
		return

	register_panel = PanelContainer.new()
	register_panel.custom_minimum_size = Vector2(420, 220)
	register_panel.anchor_left = 0.5
	register_panel.anchor_right = 0.5
	register_panel.anchor_top = 0.5
	register_panel.anchor_bottom = 0.5
	register_panel.offset_left = -210
	register_panel.offset_right = 210
	register_panel.offset_top = -110
	register_panel.offset_bottom = 110

	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.09, 0.14, 0.95)
	style.set_border_width_all(2)
	style.border_color = Color(0.4, 0.45, 0.6, 0.8)
	style.set_corner_radius_all(14)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 16
	style.content_margin_bottom = 16
	register_panel.add_theme_stylebox_override("panel", style)
	canvas.add_child(register_panel)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	vbox.alignment = BoxContainer.ALIGNMENT_CENTER
	register_panel.add_child(vbox)

	var title = Label.new()
	title.text = "ENTER YOUR NAME"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 24)
	title.add_theme_color_override("font_color", Color(0.9, 0.85, 0.5))
	vbox.add_child(title)

	register_name_input = LineEdit.new()
	register_name_input.placeholder_text = "Player name..."
	register_name_input.custom_minimum_size = Vector2(0, 45)
	register_name_input.add_theme_font_size_override("font_size", 20)
	register_name_input.alignment = HORIZONTAL_ALIGNMENT_CENTER
	register_name_input.max_length = 20
	vbox.add_child(register_name_input)

	var btn = Button.new()
	btn.text = "PLAY"
	btn.custom_minimum_size = Vector2(0, 50)
	btn.add_theme_font_size_override("font_size", 22)
	var btn_style = StyleBoxFlat.new()
	btn_style.bg_color = Color(0.15, 0.45, 0.25, 0.95)
	btn_style.set_border_width_all(2)
	btn_style.border_color = Color(0.2, 0.6, 0.3)
	btn_style.set_corner_radius_all(10)
	btn.add_theme_stylebox_override("normal", btn_style)
	var btn_hover = btn_style.duplicate()
	btn_hover.bg_color = Color(0.2, 0.55, 0.3, 0.95)
	btn.add_theme_stylebox_override("hover", btn_hover)
	btn.add_theme_color_override("font_color", Color.WHITE)
	btn.pressed.connect(_on_register_pressed)
	vbox.add_child(btn)

	register_status_label = Label.new()
	register_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	register_status_label.add_theme_font_size_override("font_size", 14)
	register_status_label.add_theme_color_override("font_color", Color(0.9, 0.3, 0.3))
	vbox.add_child(register_status_label)

	# Also connect Enter key
	register_name_input.text_submitted.connect(func(_t): _on_register_pressed())


func _on_register_pressed() -> void:
	var net = get_node_or_null("/root/Net")
	if not net:
		register_status_label.text = "Network not available (add Net autoload)"
		return
	var player_input_name = register_name_input.text.strip_edges()
	if player_input_name.length() < 2:
		register_status_label.text = "Name must be at least 2 characters"
		return
	register_status_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
	register_status_label.text = "Connecting..."
	var result = await net.register(player_input_name)
	if result.has("error"):
		register_status_label.add_theme_color_override("font_color", Color(0.9, 0.3, 0.3))
		register_status_label.text = str(result.error)
		return
	# Success — hide panel (state loaded via auth_ok signal)
	register_panel.queue_free()
	register_panel = null


func _auto_login() -> void:
	var net = get_node_or_null("/root/Net")
	if not net:
		return
	var result = await net.login()
	if not result.has("id"):
		# Token invalid
		net.token = ""
		if create_ui:
			_create_register_panel()
		var bridge = get_node_or_null("/root/Bridge")
		if bridge:
			bridge.send_to_react("show_register", {})


func _apply_server_state(state: Dictionary) -> void:
	_apply_resources_from_server(state)
	var net = get_node_or_null("/root/Net")
	if net and state.has("trophies"):
		net.trophies = state.trophies
	_update_player_name_label()
	# Load buildings from server
	if state.has("buildings") and state.buildings is Array:
		_load_buildings_from_server(state.buildings)
	# Load troop levels from server
	if state.has("troop_levels") and state.troop_levels is Array:
		_load_troop_levels_from_server(state.troop_levels)


func _load_buildings_from_server(server_buildings: Array) -> void:
	var my_grid_index = _get_grid_index()
	# Filter buildings for this grid
	var my_buildings: Array = []
	for b in server_buildings:
		if b.get("grid_index", 0) == my_grid_index:
			my_buildings.append(b)
	# Always clear existing buildings first (even if no new ones to load)
	_destroy_all_buildings()
	if my_buildings.is_empty():
		return
	for b in my_buildings:
		var building_type: String = b["type"]
		if not building_defs.has(building_type):
			continue
		if not _can_build_here(building_type):
			continue
		var def = building_defs[building_type]
		var level: int = b.get("level", 1)
		var hp: int = b.get("hp", _get_hp_for(def, level))
		var max_hp: int = b.get("max_hp", hp)
		var gp = Vector2i(b["grid_x"], b["grid_z"])
		var server_id: int = b.get("id", -1)

		# Mark grid cells as occupied
		for x in range(def.cells.x):
			for z in range(def.cells.y):
				var cell_idx = (gp.y + z) * grid_width + (gp.x + x)
				if cell_idx >= 0 and cell_idx < grid.size():
					grid[cell_idx] = true

		# Determine which scene to load (level-specific model)
		var scene_path: String = def.get("scene", "")
		if def.has("scenes"):
			var scene_idx = clampi(level - 1, 0, def.scenes.size() - 1)
			scene_path = def.scenes[scene_idx]

		# Create the building node
		var node = Node3D.new()
		if building_type == "turret":
			var turret_script = load("res://scripts/turret.gd")
			if turret_script:
				node.set_script(turret_script)
		if scene_path != "":
			var scene_res = load(scene_path)
			if scene_res:
				var model = scene_res.instantiate()
				var s = def.get("model_scale", 0.2)
				model.scale = Vector3(s, s, s)
				node.add_child(model)
				_apply_cel_shader(model)

		# Position on grid
		var sx = def.cells.x * cell_size
		var sz = def.cells.y * cell_size
		var local_pos = _grid_to_local(gp)
		local_pos.x += sx / 2.0
		local_pos.z += sz / 2.0
		local_pos.y = 0
		node.position = local_pos
		add_child(node)

		# HP bar
		var hp_bar_data = _create_building_hp_bar(node, def)

		placed_buildings.append({
			"id": building_type,
			"grid_pos": gp,
			"node": node,
			"level": level,
			"hp": hp,
			"max_hp": max_hp,
			"hp_bar": hp_bar_data.bar,
			"hp_fill": hp_bar_data.fill,
			"server_id": server_id,
		})
	print("Loaded %d buildings from server (grid %d)" % [my_buildings.size(), my_grid_index])


func _load_troop_levels_from_server(server_troops: Array) -> void:
	for t in server_troops:
		var troop_type: String = t.get("troop_type", "")
		var level: int = t.get("level", 1)
		# Match server lowercase to local capitalized keys
		var local_name = troop_type.capitalize()
		if troop_levels.has(local_name):
			troop_levels[local_name] = level
			# Apply to troop node
			var troop = get_tree().current_scene.find_child(local_name, true, false)
			if troop and troop.has_method("upgrade_to"):
				troop.upgrade_to(level)


func _on_server_auth_ok(player_data: Dictionary) -> void:
	# Apply full state from server (resources, buildings, troops)
	if player_data.has("gold"):
		resources.gold = player_data.gold
	if player_data.has("wood"):
		resources.wood = player_data.wood
	if player_data.has("ore"):
		resources.ore = player_data.ore
	_update_resource_ui()
	if player_data.has("buildings") and player_data.buildings is Array:
		_load_buildings_from_server(player_data.buildings)
	if player_data.has("troop_levels") and player_data.troop_levels is Array:
		_load_troop_levels_from_server(player_data.troop_levels)
	_update_player_name_label()


func _show_error(msg: String) -> void:
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("error", {"message": msg})
	if not canvas:
		return
	var lbl = Label.new()
	lbl.text = msg
	lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lbl.anchor_left = 0.5
	lbl.anchor_right = 0.5
	lbl.anchor_top = 0.0
	lbl.offset_left = -250
	lbl.offset_right = 250
	lbl.offset_top = 110
	lbl.add_theme_font_size_override("font_size", 20)
	lbl.add_theme_color_override("font_color", Color(1.0, 0.3, 0.3))
	canvas.add_child(lbl)
	# Fade out and remove after 2s
	var tw = create_tween()
	tw.tween_interval(1.5)
	tw.tween_property(lbl, "modulate:a", 0.0, 0.5)
	tw.tween_callback(lbl.queue_free)


func _get_grid_index() -> int:
	var plane = get_node_or_null(grid_plane_path)
	if plane and plane.name == "gridPlane2":
		return 1
	return 0


func _sync_remove_building(building_data: Dictionary) -> void:
	var net = get_node_or_null("/root/Net")
	if not net or not net.has_token():
		return
	var sid = building_data.get("server_id", -1)
	if sid < 0:
		return
	var result = await net.remove_building(sid)
	if result.has("trophies"):
		net.trophies = result["trophies"]
		_update_player_name_label()




func _toggle_shop() -> void:
	if not shop_panel:
		return
	is_shop_open = !is_shop_open
	shop_panel.visible = is_shop_open


func _start_placement(building_id: String) -> void:
	is_shop_open = false
	if shop_panel:
		shop_panel.visible = false
	# Start placement on all building systems
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs._begin_placement(building_id)


func _can_build_here(building_id: String) -> bool:
	if allowed_buildings.size() > 0 and building_id not in allowed_buildings:
		return false
	if building_id in blocked_buildings:
		return false
	return true


func _begin_placement(building_id: String) -> void:
	if not _can_build_here(building_id):
		return
	is_placing = true
	current_building_id = building_id
	if build_button:
		build_button.visible = false
	_create_ghost()
	_show_grid()


func _create_ghost() -> void:
	var def = building_defs[current_building_id]

	ghost_material = StandardMaterial3D.new()
	ghost_material.albedo_color = Color(0, 0.8, 0, 0.4)
	ghost_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ghost_material.no_depth_test = true

	ghost = _create_box_placeholder(def)
	# Add model inside ghost
	if def.has("scene"):
		var scene_res = load(def.scene)
		if scene_res:
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			ghost.add_child(model)
			_apply_cel_shader(model)
	add_child(ghost)


func _create_box_placeholder(def: Dictionary) -> Node3D:
	var node = Node3D.new()
	var mesh_inst = MeshInstance3D.new()
	var box = BoxMesh.new()
	var sx = def.cells.x * cell_size
	var sz = def.cells.y * cell_size
	box.size = Vector3(sx, def.height, sz)
	mesh_inst.mesh = box
	mesh_inst.position.y = def.height / 2.0
	mesh_inst.material_override = ghost_material
	node.add_child(mesh_inst)
	return node


func _create_placed_building(def: Dictionary) -> Node3D:
	var node = Node3D.new()
	# Attach turret AI script BEFORE adding children so _process registers
	if current_building_id == "turret":
		var turret_script = load("res://scripts/turret.gd")
		if turret_script:
			node.set_script(turret_script)
	if def.has("scene"):
		var scene_res = load(def.scene)
		if scene_res:
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			node.add_child(model)
			_apply_cel_shader(model)
			return node
	# Fallback: cube if no model
	var mesh_inst = MeshInstance3D.new()
	var box = BoxMesh.new()
	var sx = def.cells.x * cell_size
	var sz = def.cells.y * cell_size
	box.size = Vector3(sx, def.height, sz)
	mesh_inst.mesh = box
	mesh_inst.position.y = def.height / 2.0
	var mat = StandardMaterial3D.new()
	mat.albedo_color = def.color
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mesh_inst.material_override = mat
	node.add_child(mesh_inst)
	return node


func _unhandled_input(event: InputEvent) -> void:
	# Move mode
	if _is_moving:
		if event is InputEventMouseMotion:
			_update_move_building()
		if event is InputEventMouseButton and event.pressed:
			if event.button_index == MOUSE_BUTTON_LEFT:
				_confirm_move()
				get_viewport().set_input_as_handled()
			elif event.button_index == MOUSE_BUTTON_RIGHT:
				_cancel_move()
				get_viewport().set_input_as_handled()
		return

	if is_placing:
		if event is InputEventMouseMotion:
			_update_ghost()

		if event is InputEventMouseButton and event.pressed:
			if event.button_index == MOUSE_BUTTON_LEFT:
				if _try_place_building():
					get_viewport().set_input_as_handled()
					_cancel_all_placement()
			elif event.button_index == MOUSE_BUTTON_RIGHT:
				_cancel_all_placement()
				get_viewport().set_input_as_handled()
		return

	# Click on placed building
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var local_hit = _get_mouse_local()
		if local_hit != Vector3.INF:
			var gp = _local_to_grid(local_hit)
			var found = _find_building_at(gp)
			if found.size() > 0:
				for bs in get_tree().get_nodes_in_group("building_systems"):
					if bs != self:
						bs._deselect_building()
				# Second click on already-selected building → start move
				if selected_building.size() > 0 and found.get("node") == selected_building.get("node") and not is_viewing_enemy:
					_start_move(selected_building)
				else:
					_select_building(found)
				get_viewport().set_input_as_handled()
			else:
				_deselect_building()
		else:
			_deselect_building()


func _get_mouse_local() -> Vector3:
	var camera = get_viewport().get_camera_3d()
	if camera == null:
		return Vector3.INF
	var mouse = get_viewport().get_mouse_position()
	var from = camera.project_ray_origin(mouse)
	var dir = camera.project_ray_normal(mouse)

	if abs(dir.y) < 0.001:
		return Vector3.INF

	var t = (grid_y - from.y) / dir.y
	if t < 0:
		return Vector3.INF

	var world_hit = from + dir * t
	return to_local(world_hit)


func _local_to_grid(local_pos: Vector3) -> Vector2i:
	var half_x = grid_extent_x / 2.0
	var half_z = grid_extent_z / 2.0
	var lx = (local_pos.x + half_x) / cell_size
	var lz = (local_pos.z + half_z) / cell_size
	return Vector2i(int(floor(lx)), int(floor(lz)))


func _grid_to_local(grid_pos: Vector2i) -> Vector3:
	var half_x = grid_extent_x / 2.0
	var half_z = grid_extent_z / 2.0
	return Vector3(
		-half_x + grid_pos.x * cell_size,
		0,
		-half_z + grid_pos.y * cell_size
	)


func _is_in_grid(local_pos: Vector3) -> bool:
	var half_x = grid_extent_x / 2.0
	var half_z = grid_extent_z / 2.0
	return local_pos.x >= -half_x and local_pos.x <= half_x and local_pos.z >= -half_z and local_pos.z <= half_z


func _update_ghost() -> void:
	if ghost == null:
		return

	var local_hit = _get_mouse_local()
	if local_hit == Vector3.INF:
		ghost.visible = false
		return

	if not _is_in_grid(local_hit):
		ghost.visible = false
		return

	ghost.visible = true
	var gp = _local_to_grid(local_hit)
	var def = building_defs[current_building_id]

	gp.x = clampi(gp.x, 0, grid_width - def.cells.x)
	gp.y = clampi(gp.y, 0, grid_height - def.cells.y)
	current_grid_pos = gp

	var local_pos = _grid_to_local(gp)
	local_pos.x += (def.cells.x * cell_size) / 2.0
	local_pos.z += (def.cells.y * cell_size) / 2.0
	local_pos.y = 0
	ghost.position = local_pos

	if _can_place(gp, def.cells):
		ghost_material.albedo_color = Color(0, 0.8, 0, 0.4)
	else:
		ghost_material.albedo_color = Color(0.8, 0, 0, 0.4)


func _can_place(pos: Vector2i, size: Vector2i) -> bool:
	for x in range(size.x):
		for z in range(size.y):
			var cx = pos.x + x
			var cz = pos.y + z
			if cx < 0 or cx >= grid_width or cz < 0 or cz >= grid_height:
				return false
			if grid[cz * grid_width + cx]:
				return false
	return true


func _try_place_building() -> bool:
	if not ghost or not ghost.visible:
		return false
	var def = building_defs[current_building_id]

	if not _can_place(current_grid_pos, def.cells):
		return false

	# Check max_count limit (e.g. Town Hall = 1)
	if def.has("max_count"):
		var count = 0
		for b in placed_buildings:
			if b.id == current_building_id:
				count += 1
		if count >= def.max_count:
			print("Max %s limit reached (%d)" % [def.name, def.max_count])
			return false

	# Save placement params before async call
	var place_id = current_building_id
	var place_pos = current_grid_pos
	var place_def = def

	# Ask server first
	_request_place_building(place_id, place_pos, place_def)
	return true


func _request_place_building(building_id: String, grid_pos: Vector2i, def: Dictionary) -> void:
	var net = get_node_or_null("/root/Net")
	if not net or not net.has_token():
		_spawn_building_locally(building_id, grid_pos, def, -1)
		return

	_server_busy = true
	var result = await net.place_building(building_id, grid_pos.x, grid_pos.y, _get_grid_index())
	_server_busy = false
	if result.has("error"):
		_show_error(str(result.error))
		return

	# Server OK — place locally
	var server_id: int = result.get("id", -1)
	_spawn_building_locally(building_id, grid_pos, def, server_id)

	if result.has("trophies"):
		net.trophies = result["trophies"]
		_update_player_name_label()
	if result.has("resources"):
		_apply_resources_from_server(result["resources"])


func _spawn_building_locally(building_id: String, grid_pos: Vector2i, def: Dictionary, server_id: int) -> void:
	# Mark grid
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var idx = (grid_pos.y + z) * grid_width + (grid_pos.x + x)
			grid[idx] = true

	# Save current_building_id temporarily for _create_placed_building
	var prev_id = current_building_id
	current_building_id = building_id
	var building = _create_placed_building(def)
	current_building_id = prev_id

	var sx = def.cells.x * cell_size
	var sz = def.cells.y * cell_size
	var local_pos = _grid_to_local(grid_pos)
	local_pos.x += sx / 2.0
	local_pos.z += sz / 2.0
	local_pos.y = 0
	building.position = local_pos

	add_child(building)
	var max_hp = _get_hp_for(def, 1)
	var hp_bar_data = _create_building_hp_bar(building, def)
	placed_buildings.append({
		"id": building_id,
		"grid_pos": grid_pos,
		"node": building,
		"level": 1,
		"hp": max_hp,
		"max_hp": max_hp,
		"hp_bar": hp_bar_data.bar,
		"hp_fill": hp_bar_data.fill,
		"server_id": server_id,
	})


func _cancel_all_placement() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs._cancel_placement()


func _cancel_placement() -> void:
	if _is_moving:
		_cancel_move(false)
	is_placing = false
	current_building_id = ""
	if build_button:
		build_button.visible = true
	if not always_show_grid:
		_hide_grid()
	if ghost:
		ghost.queue_free()
		ghost = null


func _destroy_all_buildings() -> void:
	for b in placed_buildings:
		if b.node and is_instance_valid(b.node):
			b.node.queue_free()
	placed_buildings.clear()
	grid.fill(false)


func _show_grid() -> void:
	if grid_visual != null:
		return

	var im = ImmediateMesh.new()
	grid_visual = MeshInstance3D.new()
	grid_visual.mesh = im

	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0, 0, 0, 0.25)
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.no_depth_test = false
	grid_visual.material_override = mat

	var half_x = grid_extent_x / 2.0
	var half_z = grid_extent_z / 2.0
	var line_w = cell_size * 0.03  # Line thickness

	im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	# Lines along X (for each Z row)
	for i in range(grid_height + 1):
		var z = -half_z + i * cell_size
		var a = Vector3(-half_x, 0.01, z - line_w)
		var b = Vector3( half_x, 0.01, z - line_w)
		var c = Vector3( half_x, 0.01, z + line_w)
		var d = Vector3(-half_x, 0.01, z + line_w)
		im.surface_add_vertex(a); im.surface_add_vertex(b); im.surface_add_vertex(c)
		im.surface_add_vertex(a); im.surface_add_vertex(c); im.surface_add_vertex(d)
	# Lines along Z (for each X column)
	for i in range(grid_width + 1):
		var x = -half_x + i * cell_size
		var a = Vector3(x - line_w, 0.01, -half_z)
		var b = Vector3(x + line_w, 0.01, -half_z)
		var c = Vector3(x + line_w, 0.01,  half_z)
		var d = Vector3(x - line_w, 0.01,  half_z)
		im.surface_add_vertex(a); im.surface_add_vertex(b); im.surface_add_vertex(c)
		im.surface_add_vertex(a); im.surface_add_vertex(c); im.surface_add_vertex(d)
	im.surface_end()

	add_child(grid_visual)


func _hide_grid() -> void:
	if grid_visual != null:
		grid_visual.queue_free()
		grid_visual = null


func _find_building_at(gp: Vector2i) -> Dictionary:
	for b in placed_buildings:
		var def = building_defs[b.id]
		var bp = b.grid_pos as Vector2i
		if gp.x >= bp.x and gp.x < bp.x + def.cells.x and gp.y >= bp.y and gp.y < bp.y + def.cells.y:
			return b
	return {}


func _select_building(b: Dictionary) -> void:
	# Remove outline from ALL buildings (across all grids)
	for bs in get_tree().get_nodes_in_group("building_systems"):
		var old_node = bs.selected_building.get("node", null)
		if is_instance_valid(old_node):
			bs._remove_outline(old_node)
	selected_building = b
	# Add outline to new selection
	_apply_outline(b)
	var def = building_defs[b.id]
	var level = b.get("level", 1)
	var hp = b.get("hp", _get_hp_for(def, level))
	var max_hp = b.get("max_hp", hp)
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	# Send to React
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		var cost = def.get("cost", {})
		var multiplier = level + 1
		var upgrade_cost := {}
		if level < max_level:
			for res_name in cost:
				upgrade_cost[res_name] = cost[res_name] * multiplier
		bridge.send_to_react("building_selected", {
			"id": b.id, "name": def.name, "level": level,
			"hp": hp, "max_hp": max_hp, "max_level": max_level,
			"upgrade_cost": upgrade_cost,
			"is_enemy": is_viewing_enemy,
			"is_barracks": b.id == "barracks",
		})

	# Range indicator for turrets
	_hide_range_indicator()
	if b.id == "turret" and is_instance_valid(b.get("node", null)):
		var turret_node = b["node"]
		var r: float = 1.0
		if turret_node.get_script() and turret_node.get("detect_range") != null:
			r = turret_node.detect_range
		_show_range_indicator(turret_node.global_position, r)

	# Move arrows (own island only)
	if not is_viewing_enemy:
		_show_move_arrows(b)
	else:
		_hide_move_arrows()

	# When viewing enemy — only show HP info, no upgrade/barracks
	if is_viewing_enemy:
		if building_panel_title:
			building_panel_title.text = "%s (Lv. %d)" % [def.name, level]
		if building_panel_hp:
			building_panel_hp.text = "HP: %d / %d" % [hp, max_hp]
		if building_panel_hp_bar:
			building_panel_hp_bar.max_value = max_hp
			building_panel_hp_bar.value = hp
		if building_panel_cost:
			building_panel_cost.visible = false
		if building_panel_upgrade_btn:
			building_panel_upgrade_btn.visible = false
		if building_panel:
			building_panel.visible = true
		return

	# Port = ship purchase panel
	if b.id == "port" and port_panel and not is_viewing_enemy:
		_refresh_port_panel()
		port_panel.visible = true
		if building_panel:
			building_panel.visible = false
		var cam = get_node_or_null("/root/IslandScene/CameraRig")
		if cam:
			cam.zoom_blocked = true
		return

	# Barracks = troop upgrade panel
	if b.id == "barracks" and barracks_panel:
		_refresh_barracks_panel()
		barracks_panel.visible = true
		if building_panel:
			building_panel.visible = false
		var cam = get_node_or_null("/root/IslandScene/CameraRig")
		if cam:
			cam.zoom_blocked = true
		return

	if building_panel_title:
		building_panel_title.text = "%s (Lv. %d)" % [def.name, level]
	if building_panel_hp:
		building_panel_hp.text = "HP: %d / %d" % [hp, max_hp]
	if building_panel_hp_bar:
		building_panel_hp_bar.max_value = max_hp
		building_panel_hp_bar.value = hp
	if building_panel_cost:
		building_panel_cost.visible = true
	if building_panel_upgrade_btn:
		building_panel_upgrade_btn.visible = true
	_update_upgrade_cost_label(def, level)
	if building_panel:
		building_panel.visible = true


func _deselect_building() -> void:
	if _is_moving:
		_cancel_move(false)
	_remove_outline()
	selected_building = {}
	_hide_range_indicator()
	_hide_move_arrows()
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("building_deselected", {})
	if building_panel:
		building_panel.visible = false
	if barracks_panel:
		barracks_panel.visible = false
	if port_panel:
		port_panel.visible = false
	var cam = get_node_or_null("/root/IslandScene/CameraRig")
	if cam:
		cam.zoom_blocked = false


func _upgrade_selected() -> void:
	if selected_building.size() == 0 or _server_busy:
		return
	var def = building_defs[selected_building.id]
	var level = selected_building.get("level", 1)
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if level >= max_level:
		return

	var b = selected_building
	var net = get_node_or_null("/root/Net")

	# Ask server first
	if net and net.has_token():
		var sid = b.get("server_id", -1)
		if sid < 0:
			_show_error("Building not synced to server")
			return
		_server_busy = true
		var result = await net.upgrade_building(sid)
		_server_busy = false
		if result.has("error"):
			_show_error(str(result.error))
			return
		if result.has("trophies"):
			net.trophies = result["trophies"]
			_update_player_name_label()
		if result.has("resources"):
			var res = result["resources"]
			resources.gold = res.gold
			resources.wood = res.wood
			resources.ore = res.ore
			_update_resource_ui()
		# Use level from server response
		if result.has("level"):
			level = result["level"] - 1

	# Server OK — apply locally
	b["level"] = level + 1
	var new_max_hp = _get_hp_for(def, b.level)
	b["max_hp"] = new_max_hp
	b["hp"] = new_max_hp
	if building_panel_title:
		building_panel_title.text = "%s (Lv. %d)" % [def.name, b.level]
	if building_panel_hp:
		building_panel_hp.text = "HP: %d / %d" % [new_max_hp, new_max_hp]
	if building_panel_hp_bar:
		building_panel_hp_bar.max_value = new_max_hp
		building_panel_hp_bar.value = new_max_hp
	_update_upgrade_cost_label(def, b.level)
	# Swap model if scenes array exists
	if def.has("scenes"):
		var new_level = b.level
		var scene_idx = clampi(new_level - 1, 0, def.scenes.size() - 1)
		var scene_path = def.scenes[scene_idx]
		var scene_res = load(scene_path)
		if scene_res and is_instance_valid(b.node):
			for child in b.node.get_children():
				child.queue_free()
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			b.node.add_child(model)
			_apply_cel_shader(model)
	# Notify React with updated building data
	_select_building(b)


func _update_upgrade_cost_label(def: Dictionary, current_level: int) -> void:
	if not building_panel_cost:
		return
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if current_level >= max_level:
		building_panel_cost.text = "MAX LEVEL"
		return
	var cost: Dictionary = def.get("cost", {})
	if cost.size() == 0:
		building_panel_cost.text = "Free"
		return
	var multiplier = current_level + 1
	var parts: Array = []
	if cost.has("gold"):
		parts.append("Gold: %d" % (cost.gold * multiplier))
	if cost.has("wood"):
		parts.append("Wood: %d" % (cost.wood * multiplier))
	if cost.has("ore"):
		parts.append("Ore: %d" % (cost.ore * multiplier))
	building_panel_cost.text = "Upgrade: " + "  ".join(parts)


func remove_building(b: Dictionary) -> void:
	var idx = placed_buildings.find(b)
	if idx < 0:
		return
	# Only sync removal of OWN buildings, not enemy's during attack
	if not is_viewing_enemy:
		_sync_remove_building(b)
	var def = building_defs[b.id]
	var gp = b.grid_pos as Vector2i
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var cell_idx = (gp.y + z) * grid_width + (gp.x + x)
			if cell_idx >= 0 and cell_idx < grid.size():
				grid[cell_idx] = false
	if b.has("hp_bar") and is_instance_valid(b.hp_bar):
		b.hp_bar.queue_free()
	if is_instance_valid(b.node):
		b.node.queue_free()
	placed_buildings.remove_at(idx)
	_deselect_building()


const BLDG_BAR_W = 0.18
const BLDG_BAR_H = 0.015
const BLDG_BAR_SHADER = "shader_type spatial;
render_mode unshaded, blend_mix, depth_test_disabled, cull_disabled;
uniform vec4 albedo : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform vec2 bar_size = vec2(0.18, 0.015);
void fragment() {
	vec2 pos = (UV - 0.5) * bar_size;
	float r = bar_size.y * 0.45;
	vec2 q = abs(pos) - bar_size * 0.5 + r;
	float d = length(max(q, 0.0)) - r;
	float aa = fwidth(d);
	ALBEDO = albedo.rgb;
	ALPHA = albedo.a * (1.0 - smoothstep(-aa, aa, d));
}"

func _make_bldg_hp_mat(color: Color, size: Vector2, priority: int) -> ShaderMaterial:
	var shader = Shader.new()
	shader.code = BLDG_BAR_SHADER
	var mat = ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("albedo", color)
	mat.set_shader_parameter("bar_size", size)
	mat.render_priority = priority
	return mat

func _create_building_hp_bar(building: Node3D, def: Dictionary) -> Dictionary:
	var bar = Node3D.new()
	bar.top_level = true
	building.add_child(bar)
	var bg = MeshInstance3D.new()
	var bg_mesh = QuadMesh.new()
	bg_mesh.size = Vector2(BLDG_BAR_W, BLDG_BAR_H)
	bg.mesh = bg_mesh
	bg.material_override = _make_bldg_hp_mat(Color(0.15, 0.15, 0.15, 0.75), Vector2(BLDG_BAR_W, BLDG_BAR_H), 10)
	bar.add_child(bg)
	var fill = MeshInstance3D.new()
	var fill_mesh = QuadMesh.new()
	fill_mesh.size = Vector2(BLDG_BAR_W, BLDG_BAR_H)
	fill.mesh = fill_mesh
	fill.material_override = _make_bldg_hp_mat(Color(0.1, 0.85, 0.1, 0.9), Vector2(BLDG_BAR_W, BLDG_BAR_H), 11)
	fill.position.z = -0.001
	bar.add_child(fill)
	var model_scale = def.get("model_scale", 0.2)
	var bar_height = model_scale * 1.5 + 0.05
	bar.global_position = building.global_position + Vector3(0, bar_height, 0)
	bar.visible = false
	return {"bar": bar, "fill": fill}


func _update_building_hp_bars() -> void:
	var cam = get_viewport().get_camera_3d()
	for b in placed_buildings:
		if not b.has("hp_fill") or not is_instance_valid(b.hp_fill):
			continue
		if not is_instance_valid(b.node):
			continue
		var def = building_defs.get(b.id, {})
		var model_scale = def.get("model_scale", 0.2)
		var bar_height = model_scale * 1.5 + 0.05
		b.hp_bar.global_position = b.node.global_position + Vector3(0, bar_height, 0)
		if cam:
			var cam_pos = cam.global_position
			var bar_pos = b.hp_bar.global_position
			var dir = Vector3(cam_pos.x - bar_pos.x, 0, cam_pos.z - bar_pos.z).normalized()
			b.hp_bar.global_transform.basis = Basis.looking_at(-dir, Vector3.UP)
		var ratio = clamp(float(b.hp) / float(b.max_hp), 0.0, 1.0)
		# Show HP bar only when damaged
		b.hp_bar.visible = ratio < 1.0
		if not b.hp_bar.visible:
			continue
		var fill_w = BLDG_BAR_W * ratio
		(b.hp_fill.mesh as QuadMesh).size.x = fill_w
		b.hp_fill.position.x = -(BLDG_BAR_W - fill_w) * 0.5
		var mat = b.hp_fill.material_override as ShaderMaterial
		mat.set_shader_parameter("bar_size", Vector2(fill_w, BLDG_BAR_H))
		var color: Color
		if ratio > 0.5:
			color = Color(0.1, 0.85, 0.1, 0.9)
		elif ratio > 0.25:
			color = Color(0.9, 0.8, 0.1, 0.9)
		else:
			color = Color(0.9, 0.1, 0.1, 0.9)
		mat.set_shader_parameter("albedo", color)


func _get_hp_for(def: Dictionary, level: int) -> int:
	if def.has("hp_levels"):
		var idx = clampi(level - 1, 0, def.hp_levels.size() - 1)
		return def.hp_levels[idx]
	return 1000


func _create_port_panel() -> void:
	if not canvas:
		return
	port_panel = PanelContainer.new()
	port_panel.visible = false
	port_panel.custom_minimum_size = Vector2(320, 200)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.08, 0.14, 0.22, 1.0)
	style.set_corner_radius_all(14)
	style.set_border_width_all(2)
	style.border_color = Color(0.2, 0.45, 0.7, 1.0)
	port_panel.add_theme_stylebox_override("panel", style)
	port_panel.anchor_left = 0.5
	port_panel.anchor_right = 0.5
	port_panel.anchor_top = 0.5
	port_panel.anchor_bottom = 0.5
	port_panel.offset_left = -160
	port_panel.offset_right = 160
	port_panel.offset_top = -100
	port_panel.offset_bottom = 100
	canvas.add_child(port_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	port_panel.add_child(margin)

	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 12)
	margin.add_child(vbox)

	var title = Label.new()
	title.text = "Port"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.8, 0.9, 1.0))
	vbox.add_child(title)

	port_ship_count_label = Label.new()
	port_ship_count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	port_ship_count_label.add_theme_font_size_override("font_size", 16)
	port_ship_count_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	vbox.add_child(port_ship_count_label)

	var buy_btn = Button.new()
	buy_btn.text = "Buy Ship (500 Wood)"
	buy_btn.custom_minimum_size = Vector2(0, 44)
	buy_btn.add_theme_font_size_override("font_size", 16)
	buy_btn.add_theme_color_override("font_color", Color.WHITE)
	var btn_style = StyleBoxFlat.new()
	btn_style.bg_color = Color(0.15, 0.35, 0.55, 1.0)
	btn_style.set_corner_radius_all(10)
	btn_style.set_border_width_all(1)
	btn_style.border_color = Color(0.3, 0.5, 0.7, 1.0)
	btn_style.content_margin_left = 12
	btn_style.content_margin_right = 12
	buy_btn.add_theme_stylebox_override("normal", btn_style)
	var btn_hover = btn_style.duplicate()
	btn_hover.bg_color = Color(0.2, 0.45, 0.65, 1.0)
	buy_btn.add_theme_stylebox_override("hover", btn_hover)
	var btn_pressed = btn_style.duplicate()
	btn_pressed.bg_color = Color(0.1, 0.25, 0.4, 1.0)
	buy_btn.add_theme_stylebox_override("pressed", btn_pressed)
	buy_btn.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	buy_btn.pressed.connect(_buy_ship)
	vbox.add_child(buy_btn)


func _refresh_port_panel() -> void:
	if not port_ship_count_label:
		return
	var port_node = selected_building.get("node", null)
	var has_ship = is_instance_valid(port_node) and port_node.has_meta("has_ship")
	if has_ship:
		port_ship_count_label.text = "This port has a ship"
	else:
		port_ship_count_label.text = "No ship at this port"


func _buy_ship() -> void:
	if resources["wood"] < SHIP_COST_WOOD:
		return
	# Check if this port already has a ship
	var port_node = selected_building.get("node", null)
	if is_instance_valid(port_node) and port_node.has_meta("has_ship"):
		return
	resources["wood"] -= SHIP_COST_WOOD
	_update_resource_ui()
	owned_ships += 1
	_refresh_port_panel()
	_spawn_port_ship()


func _spawn_port_ship() -> void:
	if selected_building.size() == 0:
		return
	var port_node = selected_building.get("node", null)
	if not is_instance_valid(port_node):
		return
	var ship_res = load(SHIP_MODEL_PATH)
	if ship_res == null:
		return
	var ship = ship_res.instantiate()
	var s = SHIP_DISPLAY_SCALE
	ship.scale = Vector3(s, s, s)
	get_tree().current_scene.add_child(ship)
	# Mark this port as having a ship
	port_node.set_meta("has_ship", true)
	# Place ship in front of the port at shipPlane Y level
	var ship_plane = get_node_or_null("/root/IslandScene/Island/shipPlane")
	var ship_y = ship_plane.global_position.y if ship_plane else port_node.global_position.y
	var port_pos = port_node.global_position
	var port_rot_y = port_node.global_rotation.y
	var forward = Vector3(sin(port_rot_y), 0, cos(port_rot_y))
	ship.global_position = port_pos + forward * 0.35
	ship.global_position.y = ship_y
	ship.global_rotation.y = port_rot_y + PI * 0.5
	# Rock animation
	var rock = create_tween().set_loops()
	rock.tween_property(ship, "rotation:z", deg_to_rad(2.0), 0.9).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	rock.tween_property(ship, "rotation:z", deg_to_rad(-2.0), 0.9).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	var bob = create_tween().set_loops()
	bob.tween_property(ship, "position:y", ship.position.y + 0.03, 0.7).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	bob.tween_property(ship, "position:y", ship.position.y - 0.03, 0.7).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)


func _create_barracks_panel() -> void:
	if not canvas:
		return
	barracks_panel = PanelContainer.new()
	barracks_panel.visible = false
	barracks_panel.custom_minimum_size = Vector2(550, 750)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.12, 0.18, 1.0)
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_left = 14
	style.corner_radius_bottom_right = 14
	style.border_width_left = 2
	style.border_width_right = 2
	style.border_width_top = 2
	style.border_width_bottom = 2
	style.border_color = Color(0.4, 0.35, 0.2, 1.0)
	barracks_panel.add_theme_stylebox_override("panel", style)
	barracks_panel.anchor_left = 0.5
	barracks_panel.anchor_right = 0.5
	barracks_panel.anchor_top = 0.5
	barracks_panel.anchor_bottom = 0.5
	barracks_panel.offset_left = -275
	barracks_panel.offset_right = 275
	barracks_panel.offset_top = -375
	barracks_panel.offset_bottom = 375
	canvas.add_child(barracks_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	barracks_panel.add_child(margin)

	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)

	barracks_vbox = VBoxContainer.new()
	barracks_vbox.add_theme_constant_override("separation", 10)
	barracks_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(barracks_vbox)


func _refresh_barracks_panel() -> void:
	if not barracks_vbox:
		return
	for child in barracks_vbox.get_children():
		child.queue_free()

	# Building info
	var bld_level = selected_building.get("level", 1)
	var def = building_defs.get(selected_building.get("id", ""), {})
	var bhp = selected_building.get("hp", 0)
	var bmax_hp = selected_building.get("max_hp", 1)

	var title = Label.new()
	title.text = "Barracks (Lv. %d)" % bld_level
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
	barracks_vbox.add_child(title)

	var hp_label = Label.new()
	hp_label.text = "HP: %d / %d" % [bhp, bmax_hp]
	hp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hp_label.add_theme_color_override("font_color", Color(0.7, 0.9, 0.7))
	barracks_vbox.add_child(hp_label)

	var max_bld_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if bld_level < max_bld_level:
		# Upgrade cost label
		var cost: Dictionary = def.get("cost", {})
		var multiplier = bld_level + 1
		var cost_parts: Array = []
		if cost.has("gold"):
			cost_parts.append("Gold: %d" % (cost.gold * multiplier))
		if cost.has("wood"):
			cost_parts.append("Wood: %d" % (cost.wood * multiplier))
		if cost.has("ore"):
			cost_parts.append("Ore: %d" % (cost.ore * multiplier))
		var cost_lbl = Label.new()
		cost_lbl.text = "  ".join(cost_parts) if cost_parts.size() > 0 else "Free"
		cost_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cost_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
		cost_lbl.add_theme_font_size_override("font_size", 13)
		barracks_vbox.add_child(cost_lbl)

		var upgrade_bld_btn = Button.new()
		upgrade_bld_btn.text = "Upgrade Building"
		upgrade_bld_btn.custom_minimum_size = Vector2(0, 50)
		_style_button(upgrade_bld_btn, Color(0.2, 0.45, 0.6), Color(0.25, 0.5, 0.65))
		upgrade_bld_btn.pressed.connect(func():
			_upgrade_selected()
			_refresh_barracks_panel()
		)
		barracks_vbox.add_child(upgrade_bld_btn)
	elif bld_level >= max_bld_level:
		var max_lbl = Label.new()
		max_lbl.text = "MAX LEVEL"
		max_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		max_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
		barracks_vbox.add_child(max_lbl)

	var sep = HSeparator.new()
	barracks_vbox.add_child(sep)

	var troops_title = Label.new()
	troops_title.text = "Troops"
	troops_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	troops_title.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
	barracks_vbox.add_child(troops_title)

	for troop_name in ["Knight", "Mage", "Barbarian", "Archer", "Ranger"]:
		var tdef = troop_defs[troop_name]
		var lvl = troop_levels[troop_name]

		var card = PanelContainer.new()
		var card_style = StyleBoxFlat.new()
		card_style.bg_color = Color(0.15, 0.17, 0.25, 1.0)
		card_style.corner_radius_top_left = 8
		card_style.corner_radius_top_right = 8
		card_style.corner_radius_bottom_left = 8
		card_style.corner_radius_bottom_right = 8
		card.add_theme_stylebox_override("panel", card_style)
		barracks_vbox.add_child(card)

		var card_margin = MarginContainer.new()
		card_margin.add_theme_constant_override("margin_left", 10)
		card_margin.add_theme_constant_override("margin_right", 10)
		card_margin.add_theme_constant_override("margin_top", 8)
		card_margin.add_theme_constant_override("margin_bottom", 8)
		card.add_child(card_margin)

		var vb = VBoxContainer.new()
		vb.add_theme_constant_override("separation", 6)
		card_margin.add_child(vb)

		# Name + level
		var name_label = Label.new()
		name_label.text = "%s  [LVL %d]" % [tdef.display, lvl]
		name_label.add_theme_color_override("font_color", Color.WHITE)
		vb.add_child(name_label)

		if lvl >= 3:
			var max_label = Label.new()
			max_label.text = "MAX LEVEL"
			max_label.add_theme_color_override("font_color", Color(0.4, 0.8, 0.4))
			max_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			vb.add_child(max_label)
		else:
			var next_lvl = lvl + 1
			var costs = tdef.costs[next_lvl]
			var cost_text = ""
			for res_name in costs:
				var res_display = res_name.capitalize()
				if res_name == "ore":
					res_display = "Ore"
				cost_text += "%s: %d  " % [res_display, costs[res_name]]

			var cost_label = Label.new()
			cost_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
			if lvl == 0:
				cost_label.text = "Train (LVL 1): %s" % cost_text
			else:
				cost_label.text = "Upgrade to LVL %d: %s" % [next_lvl, cost_text]
			vb.add_child(cost_label)

			var can_afford = _can_afford(costs)
			var btn = Button.new()
			if lvl == 0:
				btn.text = "Train"
			else:
				btn.text = "Upgrade"
			btn.custom_minimum_size = Vector2(0, 50)
			if can_afford:
				_style_button(btn, Color(0.2, 0.5, 0.3), Color(0.25, 0.6, 0.35))
			else:
				_style_button(btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
				btn.disabled = true
			var tn = troop_name
			btn.pressed.connect(func(): _upgrade_troop(tn))
			vb.add_child(btn)

	# Close button
	var close_btn = Button.new()
	close_btn.text = "Close"
	close_btn.custom_minimum_size = Vector2(0, 60)
	_style_button(close_btn, Color(0.5, 0.2, 0.2), Color(0.6, 0.25, 0.25))
	close_btn.pressed.connect(func():
		barracks_panel.visible = false
		var cam = get_tree().current_scene.find_child("CameraRig", true, false)
		if cam:
			cam.zoom_blocked = false
	)
	barracks_vbox.add_child(close_btn)


func _can_afford(costs: Dictionary) -> bool:
	for res_name in costs:
		if resources.get(res_name, 0) < costs[res_name]:
			return false
	return true


func _upgrade_troop(troop_name: String) -> void:
	if _server_busy:
		return
	var lvl = troop_levels[troop_name]
	if lvl >= 3:
		return
	var next_lvl = lvl + 1

	# Ask server first
	var net = get_node_or_null("/root/Net")
	if net and net.has_token():
		_server_busy = true
		var result = await net.upgrade_troop(troop_name)
		_server_busy = false
		if result.has("error"):
			_show_error(str(result.error))
			return
		if result.has("trophies"):
			net.trophies = result["trophies"]
			_update_player_name_label()
		if result.has("resources"):
			var res = result["resources"]
			resources.gold = res.gold
			resources.wood = res.wood
			resources.ore = res.ore
			_update_resource_ui()

	# Server OK — apply locally
	troop_levels[troop_name] = next_lvl
	var troop = get_tree().current_scene.find_child(troop_name, true, false)
	if troop and troop.has_method("upgrade_to"):
		troop.upgrade_to(next_lvl)
	_refresh_barracks_panel()
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("troop_levels", troop_levels)


func _on_attack_pressed() -> void:
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode()


func _on_find_pressed() -> void:
	if is_viewing_enemy:
		return
	var net = get_node_or_null("/root/Net")
	if not net or not net.has_token():
		print("Not logged in")
		return

	# Disable button while searching
	if find_button:
		find_button.disabled = true
		find_button.text = "Searching..."

	var result = await net.find_enemy()

	if find_button:
		find_button.disabled = false
		find_button.text = "Find Enemy"

	if result.has("error"):
		print("No enemy found: ", result.error)
		return

	enemy_info = result
	_switch_to_enemy_island()


func _get_or_create_cloud() -> Node:
	# Reuse existing or create new CloudTransition
	var existing = get_node_or_null("/root/BattleCloudTransition")
	if existing:
		return existing
	var cloud_script = load("res://scripts/cloud_transition.gd")
	var cloud = CanvasLayer.new()
	cloud.name = "BattleCloudTransition"
	cloud.set_script(cloud_script)
	cloud.auto_reveal = false
	get_tree().root.add_child(cloud)
	return cloud


func _switch_to_enemy_island() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs.is_viewing_enemy = true
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": enemy_info.get("name", "???"),
			"trophies": enemy_info.get("trophies", 0),
		})

	# Cloud close animation
	var cloud = _get_or_create_cloud()
	cloud.close()
	await cloud.close_finished



	# Clear ALL building systems (including port grid)
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs._destroy_all_buildings()

	# Load enemy buildings on all grids
	if enemy_info.has("buildings") and enemy_info.buildings is Array:
		for bs in get_tree().get_nodes_in_group("building_systems"):
			bs._load_buildings_from_server(enemy_info.buildings)

	# Hide home UI, show enemy UI
	if build_button:
		build_button.visible = false
	if find_button:
		find_button.visible = false
	if shop_panel:
		shop_panel.visible = false
	_deselect_building()

	if canvas:
		# Show enemy name label
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
		canvas.add_child(enemy_label)

		# Show return button
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
		_style_button(return_button, Color(0.5, 0.35, 0.1), Color(0.6, 0.45, 0.15))
		return_button.pressed.connect(_return_home)
		canvas.add_child(return_button)

	# Cloud reveal animation
	cloud.reveal()
	await cloud.reveal_finished

	# Auto enter attack mode
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode()


func _return_home() -> void:
	if not is_viewing_enemy:
		return
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs.is_viewing_enemy = false
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("enemy_mode", {"active": false})

	# Kill all spawned troops and ships
	for troop in get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop):
			troop.queue_free()
	for ship in get_tree().get_nodes_in_group("ships"):
		if is_instance_valid(ship):
			ship.queue_free()

	# Exit attack mode
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("exit_attack_mode"):
		attack_system.exit_attack_mode()

	# Cloud close animation
	var cloud = _get_or_create_cloud()
	cloud.close()
	await cloud.close_finished

	# Clear ALL building systems
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs._destroy_all_buildings()

	# Restore home buildings from server on all grids
	var net = get_node_or_null("/root/Net")
	if net and net.has_token():
		var state = await net.login()
		if state.has("buildings") and state.buildings is Array:
			for bs in get_tree().get_nodes_in_group("building_systems"):
				bs._load_buildings_from_server(state.buildings)
		_apply_resources_from_server(state)
		if state.has("trophies"):
			net.trophies = state.trophies
		_update_player_name_label()

	# Restore home UI
	if build_button:
		build_button.visible = true
	if find_button:
		find_button.visible = true
	if attack_button:
		attack_button.visible = true

	# Clean up enemy UI
	if enemy_label and is_instance_valid(enemy_label):
		enemy_label.queue_free()
		enemy_label = null
	if return_button and is_instance_valid(return_button):
		return_button.queue_free()
		return_button = null

	enemy_info = {}

	# Cloud reveal animation
	cloud.reveal()
	await cloud.reveal_finished


func _show_move_arrows(b: Dictionary) -> void:
	_hide_move_arrows()
	var node = b.get("node")
	if not is_instance_valid(node):
		return
	var def = building_defs[b.id]
	var hx = def.cells.x * cell_size * 0.5
	var hz = def.cells.y * cell_size * 0.5
	var pad = cell_size * maxf(def.cells.x, def.cells.y) * 0.45
	var y = 0.06

	# Child of BuildingSystem so it inherits grid_rotation automatically
	_move_arrows = Node3D.new()
	_move_arrows.position = node.position  # local to BuildingSystem
	add_child(_move_arrows)

	var arrow_mesh = _make_arrow_mesh()
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.1, 0.95, 0.2, 1.0)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED

	# Port can only move along the shore (X axis only)
	var all_configs = [
		[Vector3(0, y, -(hz + pad)), 0.0],        # North
		[Vector3(0, y,  (hz + pad)), PI],           # South
		[Vector3( (hx + pad), y, 0), -PI * 0.5],   # East
		[Vector3(-(hx + pad), y, 0),  PI * 0.5],   # West
	]
	var configs = all_configs.slice(2, 4) if b.id == "port" else all_configs

	for cfg in configs:
		var inst = MeshInstance3D.new()
		inst.mesh = arrow_mesh
		inst.material_override = mat
		inst.position = cfg[0]
		inst.rotation.y = cfg[1]
		_move_arrows.add_child(inst)


func _hide_move_arrows() -> void:
	if _move_arrows and is_instance_valid(_move_arrows):
		_move_arrows.queue_free()
	_move_arrows = null


func _make_arrow_mesh() -> ImmediateMesh:
	var im = ImmediateMesh.new()
	var sw: float = 0.022   # shaft half-width
	var sl: float = 0.055   # shaft length
	var hw: float = 0.052   # head half-width
	var hl: float = 0.045   # head length
	im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	# Shaft (rectangle = 2 triangles), points toward -Z
	im.surface_add_vertex(Vector3(-sw, 0,  0))
	im.surface_add_vertex(Vector3( sw, 0,  0))
	im.surface_add_vertex(Vector3(-sw, 0, -sl))
	im.surface_add_vertex(Vector3( sw, 0,  0))
	im.surface_add_vertex(Vector3( sw, 0, -sl))
	im.surface_add_vertex(Vector3(-sw, 0, -sl))
	# Head triangle
	im.surface_add_vertex(Vector3(-hw, 0, -sl))
	im.surface_add_vertex(Vector3( hw, 0, -sl))
	im.surface_add_vertex(Vector3(  0, 0, -sl - hl))
	im.surface_end()
	return im


func _start_move(b: Dictionary) -> void:
	if is_viewing_enemy or _server_busy or _is_moving:
		return
	# Cancel any ongoing move on other building systems
	for bs in get_tree().get_nodes_in_group("building_systems"):
		if bs != self and bs._is_moving:
			bs._cancel_move(false)
	_is_moving = true
	_move_source_gp = b.grid_pos
	_move_source_pos = b["node"].position
	var def = building_defs[b.id]
	# Free grid cells temporarily so validity check works while dragging
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var idx = (b.grid_pos.y + z) * grid_width + (b.grid_pos.x + x)
			grid[idx] = false
	_hide_move_arrows()
	_hide_range_indicator()
	current_building_id = b.id
	_show_grid()
	_update_move_building()


func _update_move_building() -> void:
	var b = selected_building
	if b.size() == 0 or not is_instance_valid(b.get("node", null)):
		return
	var def = building_defs[b.id]
	var local_hit = _get_mouse_local()
	if local_hit == Vector3.INF:
		return
	var gp = _local_to_grid(local_hit)
	gp.x = clampi(gp.x, 0, grid_width - def.cells.x)
	gp.y = clampi(gp.y, 0, grid_height - def.cells.y)
	current_grid_pos = gp
	var sx = def.cells.x * cell_size
	var sz = def.cells.y * cell_size
	var local_pos = _grid_to_local(gp)
	local_pos.x += sx / 2.0
	local_pos.z += sz / 2.0
	local_pos.y = 0
	b["node"].position = local_pos
	# Validity indicator under the building
	var valid = _can_place(gp, def.cells)
	_update_move_indicator(local_pos, sx, sz, valid)


func _update_move_indicator(center: Vector3, sx: float, sz: float, valid: bool) -> void:
	if not _move_indicator or not is_instance_valid(_move_indicator):
		var qm = QuadMesh.new()
		_move_indicator = MeshInstance3D.new()
		_move_indicator.mesh = qm
		var mat = StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.render_priority = 3
		_move_indicator.material_override = mat
		add_child(_move_indicator)
	(_move_indicator.mesh as QuadMesh).size = Vector2(sx, sz)
	_move_indicator.rotation.x = -PI * 0.5
	_move_indicator.position = center + Vector3(0, 0.03, 0)
	var mat = _move_indicator.material_override as StandardMaterial3D
	mat.albedo_color = Color(0.1, 0.9, 0.1, 0.35) if valid else Color(0.9, 0.1, 0.1, 0.35)


func _confirm_move() -> void:
	var b = selected_building
	if b.size() == 0:
		return
	var def = building_defs[b.id]
	if not _can_place(current_grid_pos, def.cells):
		return
	# Occupy new grid cells
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var idx = (current_grid_pos.y + z) * grid_width + (current_grid_pos.x + x)
			grid[idx] = true
	b["grid_pos"] = current_grid_pos
	# b.node is already at the new position (moved by _update_move_building)
	# Sync with server
	var net = get_node_or_null("/root/Net")
	if net and net.has_token() and b.get("server_id", -1) >= 0:
		net.move_building(b.server_id, current_grid_pos.x, current_grid_pos.y)
	_end_move()
	_select_building(b)


func _cancel_move(reselect: bool = true) -> void:
	var b = selected_building
	if b.size() > 0:
		# Restore original grid cells
		var def = building_defs[b.id]
		for x in range(def.cells.x):
			for z in range(def.cells.y):
				var idx = (_move_source_gp.y + z) * grid_width + (_move_source_gp.x + x)
				grid[idx] = true
		# Move building back to original position
		if is_instance_valid(b.get("node", null)):
			b["node"].position = _move_source_pos
	_end_move()
	if reselect and b.size() > 0:
		_select_building(b)


func _end_move() -> void:
	_is_moving = false
	current_building_id = ""
	if not always_show_grid:
		_hide_grid()
	if _move_indicator and is_instance_valid(_move_indicator):
		_move_indicator.queue_free()
	_move_indicator = null


func _show_range_indicator(center: Vector3, radius: float) -> void:
	_hide_range_indicator()
	var y = center.y + 0.025
	var segments: int = 80
	var im = ImmediateMesh.new()

	# Surface 0 — filled disc (triangle fan)
	im.surface_begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in range(segments):
		var a0 = (float(i) / float(segments)) * TAU
		var a1 = (float(i + 1) / float(segments)) * TAU
		im.surface_add_vertex(Vector3(center.x, y, center.z))
		im.surface_add_vertex(Vector3(center.x + cos(a0) * radius, y, center.z + sin(a0) * radius))
		im.surface_add_vertex(Vector3(center.x + cos(a1) * radius, y, center.z + sin(a1) * radius))
	im.surface_end()

	# Surface 1 — edge ring (line strip)
	im.surface_begin(Mesh.PRIMITIVE_LINE_STRIP)
	for i in range(segments + 1):
		var a = (float(i) / float(segments)) * TAU
		im.surface_add_vertex(Vector3(center.x + cos(a) * radius, y, center.z + sin(a) * radius))
	im.surface_end()

	var fill_mat = StandardMaterial3D.new()
	fill_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.28)
	fill_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	fill_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	fill_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	fill_mat.render_priority = 4

	var ring_mat = StandardMaterial3D.new()
	ring_mat.albedo_color = Color(1.0, 1.0, 1.0, 1.0)
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mat.render_priority = 5

	_range_indicator = MeshInstance3D.new()
	_range_indicator.mesh = im
	_range_indicator.set_surface_override_material(0, fill_mat)
	_range_indicator.set_surface_override_material(1, ring_mat)
	get_tree().current_scene.add_child(_range_indicator)


func _hide_range_indicator() -> void:
	if _range_indicator and is_instance_valid(_range_indicator):
		_range_indicator.queue_free()
	_range_indicator = null
