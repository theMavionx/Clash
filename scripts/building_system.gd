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
		"model_scale": 0.2,
		"hp_levels": [1200, 2200, 3800],
		"cost": {"gold": 400, "wood": 150},
	},
	"barn": {
		"name": "Barn",
		"cells": Vector2i(2, 3),
		"color": Color(0.6, 0.25, 0.2, 0.5),
		"height": 0.4,
		"scene": "res://Model/Barn/1.glb",
		"scenes": ["res://Model/Barn/1.glb", "res://Model/Barn/2.glb", "res://Model/Barn/3.glb"],
		"model_scale": 0.2,
		"hp_levels": [2000, 3500, 6000],
		"cost": {"gold": 200, "wood": 200, "ore": 100},
	},
	"port": {
		"name": "Port",
		"cells": Vector2i(3, 3),
		"color": Color(0.2, 0.45, 0.7, 0.5),
		"height": 0.3,
		"scene": "res://Model/Port/1.glb",
		"scenes": ["res://Model/Port/1.glb", "res://Model/Port/2.glb", "res://Model/Port/3.glb"],
		"model_scale": 0.2,
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
	"town_hall": {
		"name": "Town Hall",
		"cells": Vector2i(4, 4),
		"color": Color(0.7, 0.55, 0.2, 0.5),
		"height": 0.5,
		"scene": "res://Model/Town_Hall/1.gltf",
		"scenes": ["res://Model/Town_Hall/1.gltf", "res://Model/Town_Hall/2.gltf", "res://Model/Town_Hall/3.gltf"],
		"model_scale": 0.2,
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
		"model_scale": 0.2,
		"hp_levels": [900, 1600, 2800],
		"cost": {"gold": 600, "wood": 350, "ore": 200},
	},
}

# ── Resources ─────────────────────────────────────────────────
var resources: Dictionary = {
	"wood": 1000,
	"gold": 1000,
	"ore": 1000,
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

# ── Placement State ───────────────────────────────────────────
var is_placing: bool = false
var current_building_id: String = ""
var ghost: Node3D = null
var ghost_material: StandardMaterial3D = null
var current_grid_pos: Vector2i = Vector2i.ZERO
var grid_visual: MeshInstance3D = null

# ── Selection State ───────────────────────────────────────────
var selected_building: Dictionary = {}

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
var ore_label: Label

var building_panel: PanelContainer
var building_panel_title: Label
var building_panel_hp: Label
var building_panel_hp_bar: ProgressBar
var building_panel_cost: Label

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
	if create_ui:
		_create_ui()
	_create_building_panel()
	if create_ui:
		_create_barracks_panel()
	if always_show_grid:
		_show_grid()


func _process(_delta: float) -> void:
	if selected_building.size() > 0 and building_panel and building_panel.visible:
		var hp = selected_building.get("hp", 0)
		var max_hp = selected_building.get("max_hp", 1)
		if building_panel_hp:
			building_panel_hp.text = "HP: %d / %d" % [hp, max_hp]
		if building_panel_hp_bar:
			building_panel_hp_bar.max_value = max_hp
			building_panel_hp_bar.value = hp


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
	res_wrapper.offset_left = -350
	res_wrapper.offset_right = 350
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

	wood_label = _create_resource_label(res_bar, "Wood", resources.wood, Color(0.45, 0.7, 0.3))
	gold_label = _create_resource_label(res_bar, "Gold", resources.gold, Color(0.9, 0.75, 0.2))
	ore_label = _create_resource_label(res_bar, "Ore", resources.ore, Color(0.6, 0.65, 0.7))

	# ── Find button (bottom right, above Attack) ─────────────────
	var find_button = Button.new()
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

	var upgrade_btn = Button.new()
	upgrade_btn.text = "Upgrade"
	upgrade_btn.custom_minimum_size = Vector2(0, 80)
	_style_button(upgrade_btn, Color(0.2, 0.5, 0.3), Color(0.25, 0.6, 0.35))
	upgrade_btn.pressed.connect(_upgrade_selected)
	bp_vbox.add_child(upgrade_btn)


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
	parent.add_child(panel)

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

	return amount_lbl


func _update_resource_ui() -> void:
	if wood_label:
		wood_label.text = str(resources.wood)
	if gold_label:
		gold_label.text = str(resources.gold)
	if ore_label:
		ore_label.text = str(resources.ore)


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
				_select_building(found)
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

	# Check and deduct building cost
	var cost: Dictionary = def.get("cost", {})
	print("Placing %s, cost: %s, resources before: %s" % [def.name, cost, resources])
	for res_name in cost:
		if resources.get(res_name, 0) < cost[res_name]:
			print("Not enough %s! Need %d, have %d" % [res_name, cost[res_name], resources.get(res_name, 0)])
			return false
	for res_name in cost:
		resources[res_name] -= cost[res_name]
	print("Resources after: %s" % [resources])
	_update_resource_ui()

	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var idx = (current_grid_pos.y + z) * grid_width + (current_grid_pos.x + x)
			grid[idx] = true

	var building = _create_placed_building(def)

	var sx = def.cells.x * cell_size
	var sz = def.cells.y * cell_size
	var local_pos = _grid_to_local(current_grid_pos)
	local_pos.x += sx / 2.0
	local_pos.z += sz / 2.0
	local_pos.y = 0
	building.position = local_pos

	add_child(building)
	var max_hp = _get_hp_for(def, 1)
	placed_buildings.append({
		"id": current_building_id,
		"grid_pos": current_grid_pos,
		"node": building,
		"level": 1,
		"hp": max_hp,
		"max_hp": max_hp,
	})

	return true


func _cancel_all_placement() -> void:
	for bs in get_tree().get_nodes_in_group("building_systems"):
		bs._cancel_placement()


func _cancel_placement() -> void:
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

	im.surface_begin(Mesh.PRIMITIVE_LINES)
	# Lines along X (for each Z row)
	for i in range(grid_height + 1):
		var offset = -half_z + i * cell_size
		im.surface_add_vertex(Vector3(-half_x, 0.01, offset))
		im.surface_add_vertex(Vector3(half_x, 0.01, offset))
	# Lines along Z (for each X column)
	for i in range(grid_width + 1):
		var offset = -half_x + i * cell_size
		im.surface_add_vertex(Vector3(offset, 0.01, -half_z))
		im.surface_add_vertex(Vector3(offset, 0.01, half_z))
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
	selected_building = b
	var def = building_defs[b.id]

	# Sawmill = barracks
	if b.id == "sawmill" and barracks_panel:
		_refresh_barracks_panel()
		barracks_panel.visible = true
		if building_panel:
			building_panel.visible = false
		var cam = get_node_or_null("/root/IslandScene/CameraRig")
		if cam:
			cam.zoom_blocked = true
		return

	var level = b.get("level", 1)
	var hp = b.get("hp", _get_hp_for(def, level))
	var max_hp = b.get("max_hp", hp)
	if building_panel_title:
		building_panel_title.text = "%s (Lv. %d)" % [def.name, level]
	if building_panel_hp:
		building_panel_hp.text = "HP: %d / %d" % [hp, max_hp]
	if building_panel_hp_bar:
		building_panel_hp_bar.max_value = max_hp
		building_panel_hp_bar.value = hp
	_update_upgrade_cost_label(def, level)
	if building_panel:
		building_panel.visible = true


func _deselect_building() -> void:
	selected_building = {}
	if building_panel:
		building_panel.visible = false
	if barracks_panel:
		barracks_panel.visible = false
	var cam = get_node_or_null("/root/IslandScene/CameraRig")
	if cam:
		cam.zoom_blocked = false


func _upgrade_selected() -> void:
	if selected_building.size() == 0:
		return
	var def = building_defs[selected_building.id]
	var level = selected_building.get("level", 1)
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if level >= max_level:
		return
	# Check and deduct upgrade cost (same as build cost per level)
	var cost: Dictionary = def.get("cost", {})
	var multiplier = level + 1
	for res_name in cost:
		var needed = cost[res_name] * multiplier
		if resources.get(res_name, 0) < needed:
			print("Not enough %s for upgrade! Need %d, have %d" % [res_name, needed, resources.get(res_name, 0)])
			return
	for res_name in cost:
		resources[res_name] -= cost[res_name] * multiplier
	_update_resource_ui()
	selected_building["level"] = level + 1
	var new_max_hp = _get_hp_for(def, selected_building.level)
	selected_building["max_hp"] = new_max_hp
	selected_building["hp"] = new_max_hp
	if building_panel_title:
		building_panel_title.text = "%s (Lv. %d)" % [def.name, selected_building.level]
	if building_panel_hp:
		building_panel_hp.text = "HP: %d / %d" % [new_max_hp, new_max_hp]
	if building_panel_hp_bar:
		building_panel_hp_bar.max_value = new_max_hp
		building_panel_hp_bar.value = new_max_hp
	_update_upgrade_cost_label(def, selected_building.level)
	# Swap model if scenes array exists
	if def.has("scenes"):
		var new_level = selected_building.level
		var scene_idx = clampi(new_level - 1, 0, def.scenes.size() - 1)
		var scene_path = def.scenes[scene_idx]
		var scene_res = load(scene_path)
		if scene_res and is_instance_valid(selected_building.node):
			# Remove old model
			for child in selected_building.node.get_children():
				child.queue_free()
			# Add new model
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			selected_building.node.add_child(model)


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
	var def = building_defs[b.id]
	var gp = b.grid_pos as Vector2i
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var cell_idx = (gp.y + z) * grid_width + (gp.x + x)
			if cell_idx >= 0 and cell_idx < grid.size():
				grid[cell_idx] = false
	if is_instance_valid(b.node):
		b.node.queue_free()
	placed_buildings.remove_at(idx)
	_deselect_building()


func _get_hp_for(def: Dictionary, level: int) -> int:
	if def.has("hp_levels"):
		var idx = clampi(level - 1, 0, def.hp_levels.size() - 1)
		return def.hp_levels[idx]
	return 1000


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
	var lvl = troop_levels[troop_name]
	if lvl >= 3:
		return
	var next_lvl = lvl + 1
	var costs = troop_defs[troop_name].costs[next_lvl]
	if not _can_afford(costs):
		return
	# Deduct resources
	for res_name in costs:
		resources[res_name] -= costs[res_name]
	troop_levels[troop_name] = next_lvl
	# Apply to troop node
	var troop = get_tree().current_scene.find_child(troop_name, true, false)
	if troop and troop.has_method("upgrade_to"):
		troop.upgrade_to(next_lvl)
	_update_resource_ui()
	_refresh_barracks_panel()


func _on_attack_pressed() -> void:
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode()


func _on_find_pressed() -> void:
	print("Find pressed")
