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
		"footprint_extra": 0.8,
		"color": Color(0.55, 0.45, 0.2, 0.5),
		"height": 0.3,
		"scene": "res://Model/Mine/1.gltf",
		"model_scale": 0.25,
		"model_rotation_y": 270.0,
		"hp_levels": [1200, 2200, 3800],
		"cost": {"gold": 400, "wood": 150},
		"produces": "ore",
		"produce_rate": [10, 18, 30],   # per minute per level
		"produce_max": [200, 400, 800],  # max stored before collection
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
		"model_rotation_y": 0.0,
		"hp_levels": [1800, 3200, 5500],
		"cost": {"gold": 800, "wood": 300, "ore": 200},
		"no_outline": true,
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
		"produces": "wood",
		"produce_rate": [12, 22, 35],
		"produce_max": [250, 500, 1000],
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
		"footprint_extra": 0.3,
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
		"footprint_extra": 1.0,
		"color": Color(0.5, 0.5, 0.55, 0.5),
		"height": 0.45,
		"scene": "res://Model/Turret/scene.gltf",
		"model_scale": 0.25,
		"hp_levels": [900, 1600, 2800],
		"cost": {"gold": 600, "wood": 350, "ore": 200},
		"outline_aabb_include": ["Stand"],  # Only count Stand mesh for outline, ignore barrel
	},
	"storage": {
		"name": "Storage",
		"cells": Vector2i(4, 5),
		"color": Color(0.5, 0.4, 0.3, 0.5),
		"height": 0.35,
		"scene": "res://Model/Storage/Storage shed_1.glb",
		"scenes": ["res://Model/Storage/Storage shed_1.glb", "res://Model/Storage/Storage House_2.glb", "res://Model/Storage/Business Building_3.glb"],
		"model_scale": 0.3,
		"model_offset": Vector3(0, 0, -0.04),
		"hp_levels": [1400, 2500, 4200],
		"cost": {"gold": 350, "wood": 200},
	},
	"archer_tower": {
		"name": "Archer Tower",
		"cells": Vector2i(3, 3),
		"color": Color(0.5, 0.45, 0.55, 0.5),
		"height": 0.45,
		"scene": "res://Model/Archer_towers/tower_1.glb",
		"scenes": ["res://Model/Archer_towers/tower_1.glb", "res://Model/Archer_towers/towerplus_2.fbx", "res://Model/Archer_towers/tower2plus_3.glb"],
		"model_scale": 0.03,
		"model_offset": Vector3(0.11, 0, -0.02),
		"model_offsets": [Vector3(0.11, 0, -0.02), Vector3(0.11, 0, -0.02), Vector3(0, 0, 0)],
		"hp_levels": [800, 1500, 2500],
		"cost": {"gold": 500, "wood": 400},
		"hp_bar_height": 0.5,
		"tower_unit": {
			"model": "res://Model/Characters/Model/Ranger.glb",
			"scale": 0.07,
			"offset_y": 0.3,
		},
	},
	"tombstone": {
		"name": "Tombstone",
		"cells": Vector2i(3, 3),
		"color": Color(0.4, 0.4, 0.45, 0.5),
		"height": 0.3,
		"scene": "res://Model/Tombstone/GLB format/1.glb",
		"scenes": ["res://Model/Tombstone/GLB format/1.glb", "res://Model/Tombstone/GLB format/2.glb", "res://Model/Tombstone/GLB format/3.glb"],
		"model_scale": 0.3,
		"hp_levels": [1000, 1500, 2000],
		"cost": {"gold": 100},
	},
	"flag": {
		"name": "Flag",
		"cells": Vector2i(2, 2),
		"color": Color(0.3, 0.3, 0.3, 0.5),
		"height": 0.4,
		"scene": "res://Model/flag/pirate_flag_animated.glb",
		"model_scale": 0.15,
		"hp_levels": [500, 800, 1200],
		"cost": {"gold": 50},
	},
}

# ── Resources ─────────────────────────────────────────────────
var resources: Dictionary = {
	"wood": 10000,
	"gold": 10000,
	"ore": 10000,
}

const BUILDING_BASE_SHADER = """
shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_opaque, cull_disabled;

uniform vec4 base_color : source_color = vec4(0.25, 0.45, 0.15, 0.35);
uniform vec4 line_color : source_color = vec4(0.5, 1.0, 0.5, 1.0);
uniform float radius : hint_range(0.0, 0.5) = 0.22;
uniform float blur : hint_range(0.0, 0.4) = 0.12;
uniform float dash_count : hint_range(1.0, 100.0) = 28.0;
uniform float dash_ratio : hint_range(0.0, 1.0) = 0.35;
uniform float aspect_ratio : hint_range(0.1, 5.0) = 1.0;

float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
}

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	// Correct for aspect ratio so rounded corners stay circular
	vec2 corrected = p;
	if (aspect_ratio > 1.0) {
		corrected.x *= aspect_ratio;
	} else {
		corrected.y /= aspect_ratio;
	}
	// Adjust box half-extents to match corrected space
	vec2 box_half = vec2(0.88);
	if (aspect_ratio > 1.0) {
		box_half.x = 0.88 * aspect_ratio;
	} else {
		box_half.y = 0.88 / aspect_ratio;
	}
	float sdf = sdRoundedBox(corrected, box_half, radius);

	// 1. Soft Footing: Outer fade-out bleed
	float bleed = smoothstep(blur, -blur, sdf);

	// 2. Inner Vignette: Highlight the border area and fade toward center
	// This creates a "glow RING" rather than a solid "stain".
	float vignette = smoothstep(-0.65, 0.0, sdf);
	float footing = bleed * vignette;

	vec4 col = base_color;
	col.a *= footing;

	// 3. Sharp high-fidelity dotted border
	float border_width = 0.022;
	float border_line = smoothstep(border_width, 0.0, abs(sdf + border_width * 0.5));

	if (border_line > 0.0) {
		vec2 d = abs(corrected);
		float p_pos = (d.x > d.y) ? corrected.y * sign(corrected.x) : -corrected.x * sign(corrected.y);
		if (fract(p_pos * dash_count) < dash_ratio) {
			col = mix(col, line_color, border_line);
		}
	}

	ALBEDO = col.rgb;
	ALPHA = col.a;
}
"""

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
var _cel_shader: Shader

# ── Scene / Script preload cache ─────────────────────────────
## Preloaded PackedScene resources keyed by path — populated once on first
## BuildingSystem _ready(), shared across all instances. Eliminates per-building
## load() calls at transition time.
static var _scene_res_cache: Dictionary = {}
static var _turret_script_res: Script = null

# ── Ship node cache ───────────────────────────────────────────
var _ship_attack_node: Node3D = null
var _ship_base_node: Node3D = null
var _water_y: float = 0.0
var _initial_load_done: bool = false

# ── AABB Cache for precise outlines ──────────────────────────
var _building_aabb_cache: Dictionary = {}  # {building_id: {size: Vector2, center: Vector2}}

# ── UI ────────────────────────────────────────────────────────
var canvas: CanvasLayer
var world_ui_canvas: CanvasLayer
var _react_resource_positions: Dictionary = {}  # {gold: {x, y}, wood: {x, y}, ore: {x, y}}
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

# ── Ship cannon ───────────────────────────────────────────────
var _ship_cannon_mode: bool = false
var _ship_cannon_label: Label = null
var _cannon_paused_attack: bool = false  # was attack mode active when cannon was entered
var _ship_cannonballs: Array = []  # Array of {node, target_bdata, target_pos}
const SHIP_CANNON_DAMAGE: int = 500
const SHIP_CANNON_SPEED: float = 1.0
const SHIP_CANNON_HIT_SQ: float = 0.03 * 0.03
const SHIP_CANNON_RELOAD: float = 1.0
const SHIP_FLASH_SCALE: float = 0.25
const SHIP_FLASH_DURATION: float = 0.12
const SHIP_FLASH_FRAMES: Array[String] = [
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_000.png",
	"res://Model/Turret/splash/FootageCrate-Muzzle_Flash_6_Point_70_Degrees_2-LQ_001.png",
]
const SHIP_EXPLOSION_SCALE: float = 1.65
const SHIP_EXPLOSION_DURATION: float = 0.9
const SHIP_EXPLOSION_FRAME_COUNT: int = 86
const SHIP_EXPLOSION_FRAME_DIR: String = "res://Model/Ship/FootageCrate-Particle_Explosion_Small/FootageCrate-Particle_Explosion_Small-%05d.png"
var _ship_cannon_cooldown: float = 0.0
var _attack_ship_wave_tweens: Array = []
var _ship_flash: MeshInstance3D = null
var _ship_flash_timer: float = 0.0
var _ship_explosion: MeshInstance3D = null
var _ship_explosion_timer: float = 0.0
var _ship_explosion_textures: Array = []
var _ship_flash_textures: Array = []

# ── Port / Ships ─────────────────────────────────────────────
var port_panel: PanelContainer
var port_vbox: VBoxContainer
var port_ship_count_label: Label
var owned_ships: int = 0
const SHIP_COST_GOLD: int = 500
const SHIP_MODELS: Array[String] = [
	"res://Model/Ship/Ships/ship-pirate-small_1.glb",
	"res://Model/Ship/Ships/ship-pirate-medium_2.glb",
	"res://Model/Ship/Ships/ship-pirate-large_3.glb",
]
const SHIP_DISPLAY_SCALE: float = 0.05

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


# ── Node Cache ────────────────────────────────────────────────
var _net: Node = null
var _bridge: Node = null
var _building_systems: Array = []


func _refresh_bs_cache() -> void:
	_building_systems = get_tree().get_nodes_in_group("building_systems")


func _ready() -> void:
	add_to_group("building_systems")
	_net = get_node_or_null("/root/Net")
	_bridge = get_node_or_null("/root/Bridge")
	call_deferred("_refresh_bs_cache")
	grid.resize(grid_width * grid_height)
	grid.fill(false)
	_setup_from_grid_plane()
	_precompute_building_aabbs()
	_preload_building_scenes()
	# Cover with clouds before first render — revealed once buildings are placed.
	# Non-UI grids still pre-warm the cloud for transition performance.
	call_deferred("_initial_cover")
	# Auto-configure grid restrictions based on grid plane
	var plane_name = ""
	var plane = get_node_or_null(grid_plane_path)
	if plane:
		plane_name = plane.name
	if plane_name == "gridPlane2":
		# Grid 2: only port allowed
		allowed_buildings = PackedStringArray(["port"])
	elif plane_name == "gridPlane":
		# Grid 1: everything except port and flag
		blocked_buildings = PackedStringArray(["port", "flag"])
	elif plane_name == "shipPlane":
		# Ship plane: only flags allowed
		allowed_buildings = PackedStringArray(["flag"])
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
		# Use get_nodes_in_group directly because _building_systems cache isn't ready yet
		for bs in get_tree().get_nodes_in_group("building_systems"):
			if bs != self and bs.canvas:
				canvas = bs.canvas
				world_ui_canvas = bs.world_ui_canvas
				_create_port_panel()
				break
	if always_show_grid:
		_show_grid()
	# Animate MainShip with wave rocking/bobbing
	if create_ui:
		_animate_main_ship()
	# Listen for server auth to load buildings (works for all grids)
	var net = _net
	if net:
		net.auth_ok.connect(_on_server_auth_ok)
	# Auto-login (always, not just when UI is created)
	if net and net.has_token():
		_auto_login()
	else:
		# No login will happen — reveal cloud cover so the island is visible
		call_deferred("_reveal_initial_cover")


var _bs_frame: int = 0
var _produce_timer: float = 0.0
var _had_troops: bool = false
var _skeleton_respawn_timer: float = 0.0
const PRODUCE_TICK: float = 1.0  # update production every second

func _process(delta: float) -> void:
	_bs_frame += 1
	# FPS label — update every 15th frame to avoid string alloc every frame
	if _fps_lbl and _bs_frame % 15 == 0:
		_fps_lbl.text = "FPS: %d" % Engine.get_frames_per_second()
	# Selected building panel — only update when visible
	if selected_building.size() > 0 and building_panel and building_panel.visible:
		if _bs_frame % 5 == 0:
			var bhp = selected_building.get("hp", 0)
			var bmax = selected_building.get("max_hp", 1)
			if building_panel_hp:
				building_panel_hp.text = "HP: %d / %d" % [bhp, bmax]
			if building_panel_hp_bar:
				building_panel_hp_bar.max_value = bmax
				building_panel_hp_bar.value = bhp
	_update_building_hp_bars()
	if _ship_cannon_cooldown > 0:
		_ship_cannon_cooldown -= delta
	if _ship_flash_timer > 0:
		_update_ship_flash(delta)
	if _ship_explosion_timer > 0:
		_update_ship_explosion(delta)
	if _ship_cannonballs.size() > 0:
		_update_ship_cannonballs(delta)

	# Respawn dead tombstone skeletons after battle ends
	if not is_viewing_enemy and create_ui:
		var troops_alive = not BaseTroop._get_troops_cached().is_empty()
		if troops_alive:
			_had_troops = true
			_skeleton_respawn_timer = 0.0
		elif _had_troops:
			# Troops just died — wait 2 sec then respawn skeletons
			_skeleton_respawn_timer += delta
			if _skeleton_respawn_timer >= 2.0:
				_had_troops = false
				_skeleton_respawn_timer = 0.0
				for bs in _building_systems:
					for b in bs.placed_buildings:
						if b.get("id", "") == "tombstone" and is_instance_valid(b.get("node")):
							bs._spawn_tombstone_skeletons(b, b.get("level", 1))

	# Resource production tick
	if not is_viewing_enemy:
		_produce_timer += delta
		if _produce_timer >= PRODUCE_TICK:
			_produce_timer -= PRODUCE_TICK
			_tick_production()
		# Update collect icons above production buildings
		_update_collect_icons()


func _tick_production() -> void:
	var any_ready = false
	for b in placed_buildings:
		var def = building_defs.get(b.id, {})
		if not def.has("produces"):
			continue
		var lvl = b.get("level", 1)
		var rate_arr = def.get("produce_rate", [0])
		var max_arr = def.get("produce_max", [100])
		var rate_idx = clampi(lvl - 1, 0, rate_arr.size() - 1)
		var max_idx = clampi(lvl - 1, 0, max_arr.size() - 1)
		var rate_per_sec = rate_arr[rate_idx] / 60.0
		var max_stored = max_arr[max_idx]
		var stored = b.get("stored", 0.0)
		stored = minf(stored + rate_per_sec, max_stored)
		b["stored"] = stored
		if stored >= 1.0:
			any_ready = true
	# positions updated in _process every 3rd frame


func _update_collect_icons() -> void:
	var cam = BaseTroop._get_camera_cached()
	if not cam:
		return
		
	for b in placed_buildings:
		var def = building_defs.get(b.id, {})
		if not def.has("produces"):
			continue
		var stored = b.get("stored", 0.0)
		var node = b.get("node")
		if not is_instance_valid(node):
			continue
		var icon = b.get("_collect_icon") as Control
		if stored >= 1.0:
			if not icon:
				icon = _create_collect_icon(b, node, def)
				b["_collect_icon"] = icon
			icon.visible = true
			
			# Project to 2D
			var base_pos = node.global_position
			var def_height = def.get("height", 0.4)
			var target_3d = base_pos + Vector3(0, def_height + 0.1, 0)
			
			if cam.is_position_behind(target_3d):
				icon.visible = false
			else:
				var pos2d = cam.unproject_position(target_3d)
				
				var anim_scale = icon.get_meta("anim_scale", 1.0)
				icon.scale = Vector2.ONE * anim_scale
				
				var scaled_size = icon.size * icon.scale
				icon.position = pos2d - scaled_size / 2.0
		else:
			if icon and is_instance_valid(icon):
				icon.visible = false


const COLLECT_ICON_TEXTURES = {
	"ore": "res://web/src/assets/resources/stone_bar.png",
	"wood": "res://web/src/assets/resources/wood_bar.png",
	"gold": "res://web/src/assets/resources/gold_bar.png",
}

func _create_collect_icon(b: Dictionary, building_node: Node3D, def: Dictionary) -> Control:
	var btn = TextureButton.new()
	btn.custom_minimum_size = Vector2(56, 56)
	btn.size = Vector2(56, 56)
	
	var bg = Panel.new()
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style = StyleBoxFlat.new()
	style.bg_color = Color(1.0, 1.0, 1.0, 0.95)
	style.corner_radius_top_left = 28
	style.corner_radius_top_right = 28
	style.corner_radius_bottom_left = 28
	style.corner_radius_bottom_right = 28
	style.border_width_left = 3
	style.border_width_top = 3
	style.border_width_right = 3
	style.border_width_bottom = 3
	
	# Determine border color based on resource type
	var res_type = def.get("produces", "gold")
	if res_type == "gold":
		style.border_color = Color(0.9, 0.75, 0.2)
	elif res_type == "wood":
		style.border_color = Color(0.45, 0.7, 0.3)
	elif res_type == "ore":
		style.border_color = Color(0.6, 0.65, 0.7)
	else:
		style.border_color = Color(0.5, 0.5, 0.5)
		
	style.shadow_color = Color(0, 0, 0, 0.2)
	style.shadow_size = 4
	style.shadow_offset = Vector2(0, 3)
	bg.add_theme_stylebox_override("panel", style)
	btn.add_child(bg)
	
	# Resource Icon inside
	var tex_rect = TextureRect.new()
	tex_rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	tex_rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	tex_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	tex_rect.offset_left = 10
	tex_rect.offset_top = 10
	tex_rect.offset_right = -10
	tex_rect.offset_bottom = -10
	tex_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	
	var tex_path = COLLECT_ICON_TEXTURES.get(res_type, COLLECT_ICON_TEXTURES["gold"])
	var tex = load(tex_path)
	if tex:
		tex_rect.texture = tex
	btn.add_child(tex_rect)
	
	btn.pressed.connect(func(): _click_collect_icon(btn, b, res_type))
	
	if world_ui_canvas:
		world_ui_canvas.add_child(btn)
	else:
		push_warning("world_ui_canvas not valid")
		
	# Spawn pop-up animation
	btn.pivot_offset = Vector2(28, 28)
	btn.set_meta("anim_scale", 0.0)
	var tw = btn.create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_method(func(v): btn.set_meta("anim_scale", v), 0.0, 1.0, 0.4)
	
	return btn


func _click_collect_icon(btn: Control, b: Dictionary, res_type: String) -> void:
	var start_pos = btn.global_position + btn.size / 2.0
	btn.visible = false
	btn.set_meta("anim_scale", 0.0) # Hide completely until refilled
	
	_spawn_collection_flying_icon(start_pos, res_type)
	_collect_and_animate(b, res_type)

func _spawn_collection_flying_icon(start_pos: Vector2, res_type: String) -> void:
	var tex_path = COLLECT_ICON_TEXTURES.get(res_type, COLLECT_ICON_TEXTURES["gold"])
	var tex = load(tex_path)
	if not tex: return

	var screen_w = get_viewport().get_visible_rect().size.x
	var target_pos = Vector2(screen_w - 360.0, 40.0)
	if res_type == "wood":
		target_pos = Vector2(screen_w - 220.0, 40.0)
	elif res_type == "ore":
		target_pos = Vector2(screen_w - 80.0, 40.0)
	if not OS.has_feature("web") and is_instance_valid(gold_label) and gold_label.is_visible_in_tree():
		if res_type == "gold" and is_instance_valid(gold_label): target_pos = gold_label.get_global_rect().get_center()
		elif res_type == "wood" and is_instance_valid(wood_label): target_pos = wood_label.get_global_rect().get_center()
		elif res_type == "ore" and is_instance_valid(ore_label): target_pos = ore_label.get_global_rect().get_center()

	var amount = 10
	for i in range(amount):
		var flying = TextureRect.new()
		flying.texture = tex
		flying.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		flying.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		flying.size = Vector2(56, 56)
		flying.pivot_offset = Vector2(28, 28)
		flying.global_position = start_pos - flying.size / 2.0
		flying.scale = Vector2.ZERO # Hide initially
		
		# Prevent interactions
		flying.mouse_filter = Control.MOUSE_FILTER_IGNORE
		
		if world_ui_canvas:
			world_ui_canvas.add_child(flying)
		else:
			add_child(flying)
			
		var tw = flying.create_tween()
		var delay = i * 0.04 # 40ms stagger between each icon
		
		# Stage 1: Burst outwards
		var random_offset = Vector2(randf_range(-90, 90), randf_range(-50, -110))
		var peak_pos = start_pos + random_offset
		var pop_dur = 0.25 + randf() * 0.1
		
		tw.parallel().tween_property(flying, "global_position", peak_pos, pop_dur).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT).set_delay(delay)
		tw.parallel().tween_property(flying, "scale", Vector2(1.5, 1.5), pop_dur * 0.5).set_delay(delay)
		tw.parallel().tween_property(flying, "scale", Vector2(1.0, 1.0), pop_dur * 0.5).set_delay(delay + pop_dur * 0.5)
		
		# Stage 2: Fly to target
		var fly_dur = 0.5 + randf() * 0.2
		tw.chain().parallel().tween_property(flying, "global_position", target_pos, fly_dur).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		tw.parallel().tween_property(flying, "scale", Vector2(1.0, 1.0), fly_dur)
		tw.parallel().tween_property(flying, "modulate:a", 0.0, fly_dur * 0.2).set_delay(fly_dur * 0.8)
		
		tw.chain().tween_callback(flying.queue_free)


func _collect_and_animate(b: Dictionary, res_type: String) -> void:
	var server_id = b.get("server_id", -1)
	var local_amount = int(b.get("stored", 0.0))
	if local_amount <= 0: return # Already zero
	b["stored"] = 0.0 # reset locally immediately
	
	var old_val = int(resources.get(res_type, 0))
	var target_val = old_val + local_amount
	var net = _net
	
	# Fetch exact value from server
	if net and net.has_token():
		var result = await net.collect_resources(server_id)
		if result.has("error"): return
		if result.has("resources"):
			target_val = int(result.resources.get(res_type, target_val))
			# Instantly sync other resources to avoid bugs
			for k in ["gold", "wood", "ore"]:
				if k != res_type and result.resources.has(k):
					resources[k] = result.resources[k]
	else:
		# Offline fallback
		target_val = old_val + local_amount
		
	# Tween the visual resource value over 1.2s to match the flight duration of all 10 items
	var tw = create_tween().set_trans(Tween.TRANS_LINEAR).set_ease(Tween.EASE_IN_OUT)
	tw.tween_method(func(v: int):
		resources[res_type] = v
		_update_resource_ui()
		var bridge = _bridge
		if bridge: bridge.send_to_react("resources", resources)
	, old_val, target_val, 1.2)



func _get_all_mesh_instances(node: Node) -> Array:
	var result := []
	if node is MeshInstance3D:
		result.append(node)
	for child in node.get_children():
		result.append_array(_get_all_mesh_instances(child))
	return result


func _apply_cel_shader(node: Node) -> void:
	# Disabled to prevent unwanted white/red highlights
	# from the cel shader on the original textures.
	return


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

	world_ui_canvas = CanvasLayer.new()
	add_child(world_ui_canvas)

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
	shop_panel.custom_minimum_size = Vector2(400, 550)
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
	shop_panel.offset_left = -200
	shop_panel.offset_right = 200
	shop_panel.offset_top = -275
	shop_panel.offset_bottom = 275
	canvas.add_child(shop_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 16)
	margin.add_theme_constant_override("margin_bottom", 16)
	shop_panel.add_child(margin)

	var scroll = ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	margin.add_child(scroll)

	var vbox = VBoxContainer.new()
	vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	vbox.add_theme_constant_override("separation", 14)
	scroll.add_child(vbox)

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
		btn.custom_minimum_size = Vector2(0, 80)
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
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("resources", {
			"gold": resources.gold, "wood": resources.wood, "ore": resources.ore,
		})


func _on_add_resource(res_name: String) -> void:
	var net = _net
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
	var net = _net
	if net and net.display_name != "":
		if player_name_label:
			player_name_label.text = net.display_name
		if trophy_label:
			trophy_label.text = "Trophies: %d" % net.trophies
		var bridge = _bridge
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
	var net = _net
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
	var net = _net
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
	var net = _net
	if not net:
		return
	var result = await net.login()
	if not result.has("id"):
		# Token invalid — reveal clouds and show register screen
		net.token = ""
		_reveal_initial_cover()
		if create_ui:
			_create_register_panel()
		var bridge = _bridge
		if bridge:
			bridge.send_to_react("show_register", {})


## Pre-warm cloud and (for the main UI grid) instantly cover the screen.
## Called deferred from _ready() so the viewport size is stable.
## Pre-warm cloud for island-transition performance.
## Also signals React that Godot scene + preload is done (loading stage 88%).
func _initial_cover() -> void:
	_get_or_create_cloud()
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.godotLoadingProgress) window.godotLoadingProgress(88);")


## Tell the HTML page to hide its loading screen — safe to call multiple times.
## On web: keeps the native loading screen visible until buildings are placed.
func _reveal_initial_cover() -> void:
	if not create_ui or _initial_load_done:
		return
	_initial_load_done = true
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.godotBuildingsLoaded) window.godotBuildingsLoaded();")


func _apply_server_state(state: Dictionary) -> void:
	_apply_resources_from_server(state)
	var net = _net
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
	# Signal React: server responded, now placing buildings (loading stage 94%)
	if OS.has_feature("web"):
		JavaScriptBridge.eval("if(window.godotLoadingProgress) window.godotLoadingProgress(94);")
	var my_grid_index = _get_grid_index()
	# Filter buildings for this grid
	var my_buildings: Array = []
	for b in server_buildings:
		if b.get("grid_index", 0) == my_grid_index:
			my_buildings.append(b)
	# Always clear existing buildings first (even if no new ones to load)
	_destroy_all_buildings()
	if my_buildings.is_empty():
		_reveal_initial_cover()
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
		
		# Add base shadow/outline (using precise AABB) — skip for no_outline buildings
		if not def.get("no_outline", false):
			var cache_key = _aabb_cache_key(building_type, level)
			var base = _create_building_base(def, cache_key)
			node.add_child(base)
		
		if building_type == "turret":
			var turret_script = _turret_script_res if _turret_script_res else load("res://scripts/turret.gd")
			if turret_script:
				node.set_script(turret_script)
		if scene_path != "":
			var scene_res = _scene_res_cache.get(scene_path, null)
			if scene_res == null:
				scene_res = load(scene_path)
			if scene_res:
				var model = scene_res.instantiate()
				var s = def.get("model_scale", 0.2)
				model.scale = Vector3(s, s, s)
				model.rotation_degrees.y = def.get("model_rotation_y", 270.0)
				var offsets = def.get("model_offsets", [])
				if offsets.size() >= level:
					model.position = offsets[level - 1]
				else:
					model.position = def.get("model_offset", Vector3.ZERO)
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

		var b_data := {
			"id": building_type,
			"grid_pos": gp,
			"node": node,
			"level": level,
			"hp": hp,
			"max_hp": max_hp,
			"hp_bar": hp_bar_data.bar,
			"hp_fill": hp_bar_data.fill,
			"server_id": server_id,
		}
		placed_buildings.append(b_data)
		# Spawn tower unit (archer on top)
		if def.has("tower_unit"):
			_spawn_tower_unit(b_data, def)
		# Tombstone → spawn skeleton guards
		if building_type == "tombstone":
			_spawn_tombstone_skeletons(b_data, level)
	print("Loaded %d buildings from server (grid %d)" % [my_buildings.size(), my_grid_index])
	_sync_react_buildings()
	# Reveal cloud cover now that buildings are placed — first load only
	_reveal_initial_cover()


func _sync_react_buildings() -> void:
	var bridge = _bridge
	if bridge and bridge.has_method("send_to_react"):
		var arr = []
		var counts := {}
		# Count from ALL building systems so town_hall etc. are tracked globally
		for bs in _building_systems:
			for b in bs.placed_buildings:
				var bid = b.get("id", "")
				arr.append({
					"id": bid,
					"level": b.get("level", 1),
					"server_id": b.get("server_id", "")
				})
				counts[bid] = counts.get(bid, 0) + 1
		bridge.send_to_react("state", {"buildings": arr})
		bridge.send_to_react("placed_counts", counts)
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
	var bridge = _bridge
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
	var net = _net
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
	for bs in _building_systems:
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
	# Add base outline to ghost (using precise AABB) — skip for no_outline buildings
	if not def.get("no_outline", false):
		var ghost_base = _create_building_base(def, current_building_id)
		ghost_base.material_override = ghost_material
		ghost.add_child(ghost_base)
	
	# Add model inside ghost
	if def.has("scene"):
		var scene_res = load(def.scene)
		if scene_res:
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			model.rotation_degrees.y = def.get("model_rotation_y", 270.0)
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


## Compute the actual AABB of a building model for precise outline sizing.
## Returns {size: Vector2(xz_width, xz_depth), center: Vector2(cx, cz)}.
func _compute_model_aabb(def: Dictionary, level: int = 1) -> Dictionary:
	var scene_path: String = def.get("scene", "")
	if def.has("scenes"):
		var idx = clampi(level - 1, 0, def.scenes.size() - 1)
		scene_path = def.scenes[idx]
	if scene_path == "":
		# Fallback to grid-based sizing
		var sx = def.cells.x * cell_size
		var sz = def.cells.y * cell_size
		return {"size": Vector2(sx, sz), "center": Vector2.ZERO}

	var scene_res = load(scene_path)
	if not scene_res:
		var sx = def.cells.x * cell_size
		var sz = def.cells.y * cell_size
		return {"size": Vector2(sx, sz), "center": Vector2.ZERO}

	var model = scene_res.instantiate()
	var s = def.get("model_scale", 0.2)
	model.scale = Vector3(s, s, s)
	model.rotation_degrees.y = def.get("model_rotation_y", 270.0)
	model.position = def.get("model_offset", Vector3.ZERO)

	# Need to add to tree briefly for global transforms to resolve
	add_child(model)

	var include_filter: Array = def.get("outline_aabb_include", [])
	var merged_aabb := AABB()
	var first := true
	for mi in _get_all_mesh_instances(model):
		# If filter is set, only include meshes whose ancestor matches one of the names
		if include_filter.size() > 0:
			var dominated := false
			var parent = mi
			while parent and parent != model:
				for f in include_filter:
					if f in parent.name:
						dominated = true
						break
				if dominated:
					break
				parent = parent.get_parent()
			if not dominated:
				continue
		var mesh_aabb = mi.get_aabb()
		# Transform mesh AABB corners into BuildingSystem local space
		# (includes model scale + rotation, giving correct world-size AABB)
		var xf = global_transform.affine_inverse() * mi.global_transform
		var corners: Array[Vector3] = []
		for ix in range(2):
			for iy in range(2):
				for iz in range(2):
					var corner = mesh_aabb.position + mesh_aabb.size * Vector3(ix, iy, iz)
					corners.append(xf * corner)
		for c in corners:
			if first:
				merged_aabb = AABB(c, Vector3.ZERO)
				first = false
			else:
				merged_aabb = merged_aabb.expand(c)

	model.queue_free()

	if first:
		# No meshes found — fallback
		var sx = def.cells.x * cell_size
		var sz = def.cells.y * cell_size
		return {"size": Vector2(sx, sz), "center": Vector2.ZERO}

	var center_xz = Vector2(merged_aabb.get_center().x, merged_aabb.get_center().z)
	var size_xz = Vector2(merged_aabb.size.x, merged_aabb.size.z)
	return {"size": size_xz, "center": center_xz}


## Pre-compute and cache AABBs for all building types at startup (all levels).
func _precompute_building_aabbs() -> void:
	for id in building_defs:
		var def = building_defs[id]
		# Level 1
		_building_aabb_cache[id] = _compute_model_aabb(def, 1)
		# Higher levels (if scenes array exists)
		if def.has("scenes"):
			for lvl in range(2, def.scenes.size() + 1):
				var key = _aabb_cache_key(id, lvl)
				_building_aabb_cache[key] = _compute_model_aabb(def, lvl)


## Pre-load every building scene into _scene_res_cache so that
## _load_buildings_from_server() never calls load() at transition time.
func _preload_building_scenes() -> void:
	for id in building_defs:
		var def = building_defs[id]
		if def.has("scenes"):
			for path in def.scenes:
				if path != "" and not _scene_res_cache.has(path):
					var res = load(path)
					if res:
						_scene_res_cache[path] = res
		elif def.has("scene"):
			var path: String = def.scene
			if path != "" and not _scene_res_cache.has(path):
				var res = load(path)
				if res:
					_scene_res_cache[path] = res
	# Pre-load turret script so set_script() at transition time is instant
	if _turret_script_res == null:
		_turret_script_res = load("res://scripts/turret.gd")


## Build cache key for a building type at a specific level.
func _aabb_cache_key(building_id: String, level: int) -> String:
	if level <= 1:
		return building_id
	return building_id + "_lv" + str(level)


## Get cached AABB for a building type. Falls back to grid-based if not cached.
func _get_cached_aabb(building_id: String) -> Dictionary:
	if _building_aabb_cache.has(building_id):
		return _building_aabb_cache[building_id]
	# Fallback
	var def = building_defs.get(building_id, {})
	var sx = def.get("cells", Vector2i(2, 2)).x * cell_size
	var sz = def.get("cells", Vector2i(2, 2)).y * cell_size
	return {"size": Vector2(sx, sz), "center": Vector2.ZERO}


func _create_building_base(def: Dictionary, building_id: String = "") -> MeshInstance3D:
	var mesh_inst = MeshInstance3D.new()
	var quad = QuadMesh.new()

	var sx: float
	var sz: float
	var offset_x: float = 0.0
	var offset_z: float = 0.0

	# Use precise AABB if available
	var aabb_data = _get_cached_aabb(building_id) if building_id != "" else {}
	if aabb_data.size() > 0 and aabb_data.get("size", Vector2.ZERO) != Vector2.ZERO:
		var padding = def.get("outline_padding", 0.08)
		sx = aabb_data.size.x + padding * 2.0
		sz = aabb_data.size.y + padding * 2.0
		offset_x = aabb_data.center.x
		offset_z = aabb_data.center.y  # Vector2.y maps to world Z
	else:
		# Fallback to grid-based sizing
		var fp_offset = def.get("footprint_offset", Vector2.ZERO)
		offset_x = fp_offset.x
		offset_z = fp_offset.y
		var world_extra = def.get("footprint_extra", 0.6) * cell_size
		sx = def.cells.x * cell_size + world_extra
		sz = def.cells.y * cell_size + world_extra

	quad.size = Vector2(sx, sz)
	mesh_inst.mesh = quad
	mesh_inst.rotation_degrees.x = -90
	mesh_inst.position = Vector3(offset_x, 0.02, offset_z)

	if _building_base_shader == null:
		_building_base_shader = Shader.new()
		_building_base_shader.code = BUILDING_BASE_SHADER
	var mat = ShaderMaterial.new()
	mat.shader = _building_base_shader

	# Pass aspect ratio so rounded corners stay circular on non-square quads
	var ar = sx / maxf(sz, 0.001)
	mat.set_shader_parameter("aspect_ratio", ar)

	# Tuning: denser dots for small buildings, thinner for big ones
	var perimeter_world = 2.0 * (sx + sz)
	mat.set_shader_parameter("dash_count", perimeter_world * 6.0)

	mesh_inst.material_override = mat
	return mesh_inst


func _create_placed_building(def: Dictionary) -> Node3D:
	var node = Node3D.new()
	
	# Add base shadow/outline (using precise AABB) — skip for no_outline buildings
	if not def.get("no_outline", false):
		var base = _create_building_base(def, current_building_id)
		node.add_child(base)
	
	# Attach turret AI script BEFORE adding children so _process registers
	if current_building_id == "turret":
		var turret_script = _turret_script_res if _turret_script_res else load("res://scripts/turret.gd")
		if turret_script:
			node.set_script(turret_script)
	if def.has("scene"):
		var _scene_path: String = def.scene
		var scene_res = _scene_res_cache.get(_scene_path, null)
		if scene_res == null:
			scene_res = load(_scene_path)
		if scene_res:
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			model.rotation_degrees.y = def.get("model_rotation_y", 270.0)
			model.position = def.get("model_offset", Vector3.ZERO)
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
	# In enemy mode, only the main UI grid handles all input
	if is_viewing_enemy and not create_ui:
		return

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

	# Ship cannon mode (enemy island only)
	if is_viewing_enemy and event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_LEFT:
			if _ship_cannon_mode:
				# Already in cannon mode — try to fire at a building first
				for bs in _building_systems:
					var local_hit = bs._get_mouse_local()
					if local_hit != Vector3.INF:
						var gp = bs._local_to_grid(local_hit)
						var bdata = bs._find_building_at(gp)
						if bdata.size() > 0:
							_fire_ship_cannon(bdata)
							get_viewport().set_input_as_handled()
							return
				# No building hit — exit cannon mode
				_exit_ship_cannon_mode()
				get_viewport().set_input_as_handled()
				return
			elif _check_ship_cannon_click(event.position):
				# Not in cannon mode — click on ship to enter
				_enter_ship_cannon_mode()
				get_viewport().set_input_as_handled()
				return
		if event.button_index == MOUSE_BUTTON_RIGHT and _ship_cannon_mode:
			# Right click — fire at building (search ALL building systems)
			for bs in _building_systems:
				var local_hit = bs._get_mouse_local()
				if local_hit != Vector3.INF:
					var gp = bs._local_to_grid(local_hit)
					var bdata = bs._find_building_at(gp)
					if bdata.size() > 0:
						_fire_ship_cannon(bdata)
						get_viewport().set_input_as_handled()
						return
			get_viewport().set_input_as_handled()
			return

	# Click on placed building
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var local_hit = _get_mouse_local()
		if local_hit != Vector3.INF:
			var gp = _local_to_grid(local_hit)
			var found = _find_building_at(gp)
			if found.size() > 0:
				for bs in _building_systems:
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
	var camera = BaseTroop._get_camera_cached()
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
	var net = _net
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
	
	# --- Build Animation ---
	building.scale = Vector3.ZERO
	var tw = create_tween()
	tw.set_trans(Tween.TRANS_BACK)
	tw.set_ease(Tween.EASE_OUT)
	tw.tween_property(building, "scale", Vector3.ONE, 0.4)
	# -----------------------

	add_child(building)
	var max_hp = _get_hp_for(def, 1)
	var hp_bar_data = _create_building_hp_bar(building, def)
	var b_data := {
		"id": building_id,
		"grid_pos": grid_pos,
		"node": building,
		"level": 1,
		"hp": max_hp,
		"max_hp": max_hp,
		"hp_bar": hp_bar_data.bar,
		"hp_fill": hp_bar_data.fill,
		"server_id": server_id,
	}
	placed_buildings.append(b_data)
	_sync_react_buildings()

	# Spawn tower unit (archer on top)
	if def.has("tower_unit"):
		_spawn_tower_unit(b_data, def)
	# Tombstone → spawn skeleton guards
	if building_id == "tombstone":
		_spawn_tombstone_skeletons(b_data, 1)


func _cancel_all_placement() -> void:
	for bs in _building_systems:
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
	selected_building = b
	var def = building_defs[b.id]
	var level = b.get("level", 1)
	var hp = b.get("hp", _get_hp_for(def, level))
	var max_hp = b.get("max_hp", hp)
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	# Send to React
	var bridge = _bridge
	if bridge:
		var cost = def.get("cost", {})
		var multiplier = level + 1
		var upgrade_cost := {}
		if level < max_level:
			for res_name in cost:
				upgrade_cost[res_name] = cost[res_name] * multiplier
		var bs_has_ship = false
		if b.has("node") and is_instance_valid(b["node"]) and b["node"].has_meta("has_ship"):
			bs_has_ship = true
			
		bridge.send_to_react("building_selected", {
			"id": b.id, "name": def.name, "level": level,
			"hp": hp, "max_hp": max_hp, "max_level": max_level,
			"upgrade_cost": upgrade_cost,
			"is_enemy": is_viewing_enemy,
			"is_barracks": b.id in ["barracks", "barn"],
			"is_upgrading": b.get("is_upgrading", false),
			"has_ship": bs_has_ship
		})

	# Range indicator for defense buildings
	_hide_range_indicator()
	var defense_ids = ["turret", "tombstone", "archtower", "archer_tower", "archertower"]
	if b.id in defense_ids and is_instance_valid(b.get("node", null)):
		var bnode = b["node"]
		var r: float = 1.0
		if bnode.get_script() and bnode.get("detect_range") != null:
			r = bnode.detect_range
		_show_range_indicator(bnode.global_position, r)

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

	# Barracks / Barn = troop upgrade panel
	if b.id in ["barracks", "barn"] and barracks_panel:
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
	selected_building = {}
	_hide_range_indicator()
	_hide_move_arrows()
	var bridge = _bridge
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
	if selected_building.get("is_upgrading", false):
		return
	var def = building_defs[selected_building.id]
	var level = selected_building.get("level", 1)
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if level >= max_level:
		return

	var b = selected_building
	var net = _net

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

	# Server OK — start upgrade sequence
	b["is_upgrading"] = true
	var target_level = level + 1
	_run_upgrade_sequence(b, def, target_level)

func _run_upgrade_sequence(b: Dictionary, def: Dictionary, server_new_level: int) -> void:
	if not is_instance_valid(b.get("node")):
		b["is_upgrading"] = false
		return
		
	var model = b.node
	
	if typeof(selected_building) == TYPE_DICTIONARY and selected_building == b:
		_select_building(b)
	
	# Spawn Upgrading text
	var up_lbl = Label3D.new()
	up_lbl.text = "Upgrading..."
	up_lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	up_lbl.no_depth_test = true
	up_lbl.render_priority = 10
	up_lbl.outline_modulate = Color(0, 0, 0, 1)
	up_lbl.outline_size = 4
	up_lbl.font_size = 17
	up_lbl.position = Vector3(0, 0.2, 0)
	model.add_child(up_lbl)

	# Start Glow on CURRENT model
	var outline_shader = load("res://shaders/upgrade_outline.gdshader")
	var mat: ShaderMaterial = null
	var meshes: Array[MeshInstance3D] = []
	if outline_shader:
		mat = ShaderMaterial.new()
		mat.shader = outline_shader
		mat.set_shader_parameter("outline_color", Color(0.1, 0.6, 1.0, 1.0))
		mat.set_shader_parameter("outline_width", 0.035)
		_get_all_meshes(model, meshes)
		for m in meshes:
			if is_instance_valid(m):
				m.material_overlay = mat

	# Wait for the "glow upgrade" phase (3 seconds)
	await get_tree().create_timer(3.0).timeout
	
	if not is_instance_valid(model):
		return # building destroyed while waiting
		
	# Remove glow and text
	for m in meshes:
		if is_instance_valid(m):
			m.material_overlay = null
	if is_instance_valid(up_lbl):
		up_lbl.queue_free()

	# Bounce DOWN (squash)
	var tw_down = create_tween()
	tw_down.tween_property(model, "scale", Vector3.ZERO, 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	await tw_down.finished

	# --- UPGRADE APPLIED ---
	b["level"] = server_new_level
	var new_max_hp = _get_hp_for(def, b.level)
	b["max_hp"] = new_max_hp
	b["hp"] = new_max_hp
	
	# Update UI if this building is still selected
	if current_building_id == b.id and building_panel and building_panel.visible:
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
		var scene_idx = clampi(b.level - 1, 0, def.scenes.size() - 1)
		var scene_path = def.scenes[scene_idx]
		var scene_res = load(scene_path)
		if scene_res:
			for child in model.get_children():
				child.queue_free()
			# Recreate building base outline for the new level's model
			var cache_key = _aabb_cache_key(b.id, b.level)
			if not _building_aabb_cache.has(cache_key):
				_building_aabb_cache[cache_key] = _compute_model_aabb(def, b.level)
			if not def.get("no_outline", false):
				var new_base = _create_building_base(def, cache_key)
				model.add_child(new_base)
			# Add the new model
			var new_model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			new_model.scale = Vector3(s, s, s)
			new_model.rotation_degrees.y = def.get("model_rotation_y", 270.0)
			var offsets = def.get("model_offsets", [])
			if offsets.size() >= b.level:
				new_model.position = offsets[b.level - 1]
			else:
				new_model.position = def.get("model_offset", Vector3.ZERO)
			model.add_child(new_model)
			# Recreate HP bar (old one was freed with model children)
			var hp_bar_data = _create_building_hp_bar(model, def)
			b["hp_bar"] = hp_bar_data.bar
			b["hp_fill"] = hp_bar_data.fill

	# Respawn tower unit after model swap
	if def.has("tower_unit"):
		_spawn_tower_unit(b, def)

	# Bounce UP (reveal)
	var tw_up = create_tween()
	tw_up.tween_property(model, "scale", Vector3.ONE, 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	# Tombstone → update skeletons
	if b.id == "tombstone":
		_spawn_tombstone_skeletons(b, b.level)

	# Mark upgrade complete before refreshing UI
	b["is_upgrading"] = false

	# Update React UI globally
	if typeof(selected_building) == TYPE_DICTIONARY and selected_building == b:
		_select_building(b)

	# Show leveled up text
	var lbl = Label3D.new()
	lbl.text = "Your " + def.name + "\nleveled up!"
	lbl.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	lbl.no_depth_test = true
	lbl.render_priority = 10
	lbl.outline_modulate = Color(0, 0, 0, 1)
	lbl.outline_size = 4
	lbl.modulate = Color(0.1, 0.9, 1.0, 0.0)
	lbl.font_size = 20
	lbl.position = Vector3(0, 0.12, 0)
	model.add_child(lbl)
	
	var tw_pos = create_tween()
	tw_pos.set_parallel(true)
	tw_pos.tween_property(lbl, "position", Vector3(0, 0.24, 0), 2.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw_pos.tween_property(lbl, "modulate:a", 1.0, 0.5)
	
	var tw_fade = create_tween()
	tw_fade.tween_interval(1.0)
	tw_fade.tween_property(lbl, "modulate:a", 0.0, 1.0)
	tw_fade.tween_callback(lbl.queue_free)


func _get_all_meshes(node: Node, arr: Array[MeshInstance3D]) -> void:
	if node is MeshInstance3D:
		arr.append(node as MeshInstance3D)
	for c in node.get_children():
		_get_all_meshes(c, arr)

func _get_upgrade_cost(def: Dictionary, next_level: int) -> Dictionary:
	var cost: Dictionary = def.get("cost", {})
	var result := {}
	for res_name in cost:
		result[res_name] = cost[res_name] * next_level
	return result


func _auto_center_model(model: Node3D) -> void:
	# Find the first MeshInstance3D and use its local AABB center to offset
	var queue: Array = [model]
	var combined_aabb := AABB()
	var first := true
	while queue.size() > 0:
		var node = queue.pop_front()
		if node is MeshInstance3D:
			var m_aabb = node.get_aabb()
			# Account for node's local position relative to model root
			var local_center = node.position + m_aabb.get_center()
			if first:
				combined_aabb = AABB(local_center, Vector3.ZERO)
				first = false
			else:
				combined_aabb = combined_aabb.expand(local_center)
		for c in node.get_children():
			queue.push_back(c)
	if first:
		return
	# Shift model so the mesh center aligns with (0, model.y, 0)
	var center = combined_aabb.get_center()
	model.position.x -= center.x * model.scale.x
	model.position.z -= center.z * model.scale.z


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
	# Tombstone → kill all its skeleton guards
	if b.id == "tombstone":
		_remove_tombstone_skeletons(b)
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


# ── Tombstone Skeleton Guards ─────────────────────────────────

const SKELETON_MODEL = "res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb"
const SKELETON_SCRIPT = "res://scripts/skeleton_guard.gd"
const SKELETON_SCALE = 0.1

func _spawn_tower_unit(b: Dictionary, def: Dictionary) -> void:
	# Remove existing tower unit if any
	if b.has("tower_unit_node") and is_instance_valid(b.get("tower_unit_node")):
		b["tower_unit_node"].queue_free()
		b["tower_unit_node"] = null
	var tu = def.get("tower_unit", {})
	var model_path = tu.get("model", "")
	var unit_scale = tu.get("scale", 0.07)
	var offset_y = tu.get("offset_y", 0.3)
	var model_res = load(model_path)
	if not model_res:
		return
	var unit = model_res.instantiate()
	# Attach tower_archer script for combat behavior
	var archer_script = load("res://scripts/tower_archer.gd")
	if archer_script:
		unit.set_script(archer_script)
	var s = unit_scale
	unit.scale = Vector3(s, s, s)
	b.get("node").add_child(unit)
	unit.position = Vector3(0, offset_y, 0)
	unit.rotation_degrees.y = -90.0
	_apply_cel_shader(unit)
	# Set level to match building level
	if unit.has_method("set_level"):
		unit.set_level(b.get("level", 1))
	b["tower_unit_node"] = unit


func _spawn_tombstone_skeletons(b: Dictionary, target_count: int) -> void:
	# Keep alive skeletons, remove invalid references
	var alive: Array = []
	for skel in b.get("skeletons", []):
		if is_instance_valid(skel):
			alive.append(skel)
	# Remove excess
	while alive.size() > target_count:
		var skel = alive.pop_back()
		if is_instance_valid(skel):
			skel.queue_free()
	# Spawn missing
	var tomb_pos = b.node.global_position
	var script_res = load(SKELETON_SCRIPT)
	var model_res = load(SKELETON_MODEL)
	if not model_res or not script_res:
		b["skeletons"] = alive
		return
	while alive.size() < target_count:
		var skel = model_res.instantiate()
		skel.set_script(script_res)
		skel.scale = Vector3(SKELETON_SCALE, SKELETON_SCALE, SKELETON_SCALE)
		var angle = randf() * TAU
		var offset = Vector3(cos(angle) * 0.18, 0, sin(angle) * 0.18)
		get_tree().current_scene.add_child(skel)
		skel.global_position = tomb_pos + offset
		skel.tombstone_pos = tomb_pos
		_apply_cel_shader(skel)
		alive.append(skel)
	b["skeletons"] = alive


func _remove_tombstone_skeletons(b: Dictionary) -> void:
	var skeletons = b.get("skeletons", []) as Array
	for skel in skeletons:
		if is_instance_valid(skel):
			skel.queue_free()
	b["skeletons"] = []


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

## Shared shader for building HP bars — compiled once on GPU
static var _bldg_hp_shader: Shader = null
## Shared shader for building base outlines — compiled once on GPU, not per building
static var _building_base_shader: Shader = null

func _make_bldg_hp_mat(color: Color, size: Vector2, priority: int) -> ShaderMaterial:
	if _bldg_hp_shader == null:
		_bldg_hp_shader = Shader.new()
		_bldg_hp_shader.code = BLDG_BAR_SHADER
	var mat = ShaderMaterial.new()
	mat.shader = _bldg_hp_shader
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
	var bar_height = def.get("hp_bar_height", model_scale * 1.5 + 0.05)
	bar.global_position = building.global_position + Vector3(0, bar_height, 0)
	bar.visible = false
	return {"bar": bar, "fill": fill}


var _bldg_hp_frame: int = 0

func _update_building_hp_bars() -> void:
	_bldg_hp_frame += 1
	var update_billboard = (_bldg_hp_frame % 4 == 0)
	var cam: Camera3D = null
	if update_billboard:
		cam = BaseTroop._get_camera_cached()
	for b in placed_buildings:
		if not b.has("hp_fill") or not is_instance_valid(b.hp_fill):
			continue
		# Early exit — undamaged buildings skip everything
		if b.hp >= b.max_hp:
			if b.hp_bar.visible:
				b.hp_bar.visible = false
			continue
		if not is_instance_valid(b.node):
			continue
		b.hp_bar.visible = true
		var def = building_defs.get(b.id, {})
		var model_scale = def.get("model_scale", 0.2)
		var bar_height = def.get("hp_bar_height", model_scale * 1.5 + 0.05)
		b.hp_bar.global_position = b.node.global_position + Vector3(0, bar_height, 0)
		if update_billboard and cam:
			var dir = cam.global_position - b.hp_bar.global_position
			dir.y = 0
			if dir.length_squared() > 0.001:
				b.hp_bar.global_transform.basis = Basis.looking_at(-dir.normalized(), Vector3.UP)
		var ratio = float(b.hp) / float(b.max_hp)
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
	port_panel.custom_minimum_size = Vector2(340, 280)
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
	port_panel.offset_left = -170
	port_panel.offset_right = 170
	port_panel.offset_top = -140
	port_panel.offset_bottom = 140
	canvas.add_child(port_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	port_panel.add_child(margin)

	port_vbox = VBoxContainer.new()
	port_vbox.add_theme_constant_override("separation", 10)
	margin.add_child(port_vbox)


func _refresh_port_panel() -> void:
	if not port_vbox:
		return
	for child in port_vbox.get_children():
		child.queue_free()

	var b = selected_building
	var def = building_defs.get(b.get("id", ""), {})
	var level = b.get("level", 1)
	var bhp = b.get("hp", 0)
	var bmax_hp = b.get("max_hp", 1)

	# Title with level
	var title = Label.new()
	title.text = "Port (Lv. %d)" % level
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 22)
	title.add_theme_color_override("font_color", Color(0.8, 0.9, 1.0))
	port_vbox.add_child(title)

	# HP
	var hp_label = Label.new()
	hp_label.text = "HP: %d / %d" % [bhp, bmax_hp]
	hp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hp_label.add_theme_color_override("font_color", Color(0.7, 0.9, 0.7))
	port_vbox.add_child(hp_label)

	# Upgrade building button
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if level < max_level:
		var upgrade_cost = _get_upgrade_cost(def, level + 1)
		var cost_parts: Array = []
		if upgrade_cost.get("gold", 0) > 0:
			cost_parts.append("%d Gold" % upgrade_cost.gold)
		if upgrade_cost.get("wood", 0) > 0:
			cost_parts.append("%d Wood" % upgrade_cost.wood)
		if upgrade_cost.get("ore", 0) > 0:
			cost_parts.append("%d Ore" % upgrade_cost.ore)

		var upgrade_btn = Button.new()
		upgrade_btn.text = "Upgrade to Lv. %d (%s)" % [level + 1, ", ".join(cost_parts)]
		upgrade_btn.custom_minimum_size = Vector2(0, 44)
		if not _can_afford(upgrade_cost):
			_style_button(upgrade_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
		else:
			_style_button(upgrade_btn, Color(0.2, 0.45, 0.6), Color(0.25, 0.5, 0.65))
		upgrade_btn.pressed.connect(func():
			_upgrade_selected()
			_refresh_port_panel()
		)
		port_vbox.add_child(upgrade_btn)
	else:
		var max_lbl = Label.new()
		max_lbl.text = "MAX LEVEL"
		max_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		max_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
		port_vbox.add_child(max_lbl)

	var sep = HSeparator.new()
	port_vbox.add_child(sep)

	# Ship status
	port_ship_count_label = Label.new()
	port_ship_count_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	port_ship_count_label.add_theme_font_size_override("font_size", 16)
	port_ship_count_label.add_theme_color_override("font_color", Color(0.7, 0.8, 0.9))
	var port_node = b.get("node", null)
	var has_ship = is_instance_valid(port_node) and port_node.has_meta("has_ship")
	port_ship_count_label.text = "This port has a ship" if has_ship else "No ship at this port"
	port_vbox.add_child(port_ship_count_label)

	# Buy ship button
	var buy_btn = Button.new()
	buy_btn.custom_minimum_size = Vector2(0, 44)
	if has_ship:
		buy_btn.text = "Ship already docked"
		_style_button(buy_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
		buy_btn.disabled = true
	elif resources.get("gold", 0) < SHIP_COST_GOLD:
		buy_btn.text = "Buy Ship (%d Gold)" % SHIP_COST_GOLD
		_style_button(buy_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
		buy_btn.disabled = true
	else:
		buy_btn.text = "Buy Ship (%d Gold)" % SHIP_COST_GOLD
		_style_button(buy_btn, Color(0.15, 0.35, 0.55), Color(0.2, 0.45, 0.65))
	buy_btn.pressed.connect(_buy_ship)
	port_vbox.add_child(buy_btn)

	# Close button
	var close_btn = Button.new()
	close_btn.text = "Close"
	close_btn.custom_minimum_size = Vector2(0, 40)
	_style_button(close_btn, Color(0.5, 0.2, 0.2), Color(0.6, 0.25, 0.25))
	close_btn.pressed.connect(func():
		port_panel.visible = false
		var cam = get_tree().current_scene.find_child("CameraRig", true, false)
		if cam:
			cam.zoom_blocked = false
	)
	port_vbox.add_child(close_btn)


func _buy_ship() -> void:
	if resources["gold"] < SHIP_COST_GOLD:
		return
	# Check if this port already has a ship
	var port_node = selected_building.get("node", null)
	if is_instance_valid(port_node) and port_node.has_meta("has_ship"):
		return
	resources["gold"] -= SHIP_COST_GOLD
	_update_resource_ui()
	owned_ships += 1
	_refresh_port_panel()
	_spawn_port_ship()
	
	if typeof(selected_building) == TYPE_DICTIONARY and selected_building.size() > 0:
		_select_building(selected_building)
	
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("resources", {
			"gold": resources.get("gold", 0),
			"wood": resources.get("wood", 0),
			"ore": resources.get("ore", 0),
		})

func _animate_main_ship() -> void:
	# Determine water level
	var water = get_tree().root.find_child("Water", true, false)
	if water:
		_water_y = water.global_position.y
	var _root = get_tree().root
	if not _ship_attack_node or not is_instance_valid(_ship_attack_node):
		_ship_attack_node = _root.find_child("MainShipAttack", true, false)
	if not _ship_base_node or not is_instance_valid(_ship_base_node):
		_ship_base_node = _root.find_child("MainShipBase", true, false)
	var attack_ship = _ship_attack_node
	var base_ship = _ship_base_node
	# Set ships to water level
	if attack_ship:
		attack_ship.visible = false
		attack_ship.global_position.y = _water_y + 0.12 - 0.03
	if base_ship:
		base_ship.visible = true
		base_ship.global_position.y = _water_y + 0.12 - 0.03


func _spawn_port_ship() -> void:
	if selected_building.size() == 0:
		return
	var port_node = selected_building.get("node", null)
	if not is_instance_valid(port_node):
		return
	var port_level = selected_building.get("level", 1)
	var model_idx = clampi(port_level - 1, 0, SHIP_MODELS.size() - 1)
	var ship_res = load(SHIP_MODELS[model_idx])
	if ship_res == null:
		return
	var ship = ship_res.instantiate()
	var s = SHIP_DISPLAY_SCALE
	ship.scale = Vector3(s, s, s)
	get_tree().current_scene.add_child(ship)
	# Mark this port as having a ship
	port_node.set_meta("has_ship", true)
	# Place ship in front of the port at water level
	var port_pos = port_node.global_position
	var port_rot_y = port_node.global_rotation.y
	var forward = Vector3(sin(port_rot_y), 0, cos(port_rot_y))
	var ship_dist = [0.35, 0.35, 0.4, 0.57][clampi(port_level, 0, 3)]
	ship.global_position = port_pos + forward * ship_dist
	ship.global_position.y = _water_y - 0.03
	ship.global_rotation.y = port_rot_y + PI * 0.5


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


func _refresh_troop_levels_from_server() -> void:
	var net = _net
	if not net or not net.has_token():
		# No server — just send local levels
		var bridge = _bridge
		if bridge:
			bridge.send_to_react("troop_levels", troop_levels)
		return
	var server_troops = await net.get_troops()
	if server_troops is Array:
		for t in server_troops:
			var troop_type = str(t.get("troop_type", ""))
			var level = int(t.get("level", 1))
			var local_name = troop_type.capitalize()
			if troop_levels.has(local_name):
				troop_levels[local_name] = level
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("troop_levels", troop_levels)
		# Also refresh resources to stay in sync
		if net:
			var res = await net.get_resources()
			if not res.has("error"):
				resources.gold = res.gold
				resources.wood = res.wood
				resources.ore = res.ore
				_update_resource_ui()
				bridge.send_to_react("resources", {
					"gold": resources.gold,
					"wood": resources.wood,
					"ore": resources.ore,
				})


func _upgrade_troop(troop_name: String) -> void:
	if _server_busy:
		return
	var lvl = troop_levels[troop_name]
	if lvl >= 3:
		return
	var next_lvl = lvl + 1

	# Ask server first
	var net = _net
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

	# Server OK — apply locally and refetch to stay in sync
	troop_levels[troop_name] = next_lvl
	var troop = get_tree().current_scene.find_child(troop_name, true, false)
	if troop and troop.has_method("upgrade_to"):
		troop.upgrade_to(next_lvl)
	_refresh_barracks_panel()
	# Refetch from server to ensure React shows authoritative data
	_refresh_troop_levels_from_server()


func _on_attack_pressed() -> void:
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode()


func _on_find_pressed() -> void:
	if is_viewing_enemy:
		return
	var net = _net
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


func _hide_all_collect_icons() -> void:
	for b in placed_buildings:
		var icon = b.get("_collect_icon")
		if icon and is_instance_valid(icon):
			icon.visible = false
			icon.queue_free()
		b["_collect_icon"] = null


func _switch_to_enemy_island() -> void:
	# Instantly switch ships when button pressed
	var _r = get_tree().root
	if not _ship_attack_node or not is_instance_valid(_ship_attack_node):
		_ship_attack_node = _r.find_child("MainShipAttack", true, false)
	if not _ship_base_node or not is_instance_valid(_ship_base_node):
		_ship_base_node = _r.find_child("MainShipBase", true, false)
	if _ship_attack_node:
		_ship_attack_node.visible = true
	if _ship_base_node:
		_ship_base_node.visible = false

	# Hide collect icons before switching
	for bs in _building_systems:
		bs._hide_all_collect_icons()
		bs.is_viewing_enemy = true
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("enemy_mode", {
			"active": true,
			"name": enemy_info.get("name", "???"),
			"trophies": enemy_info.get("trophies", 0),
		})

	# Cloud close animation — hide React UI during transition
	var bridge2 = _bridge
	if bridge2:
		bridge2.send_to_react("cloud_transition", {"visible": true})
	var cloud = _get_or_create_cloud()
	cloud.close()
	await cloud.close_finished
	_preload_explosion_textures()

	# Clear ALL building systems (including port grid)
	for bs in _building_systems:
		bs._destroy_all_buildings()

	# Load enemy buildings on all grids
	if enemy_info.has("buildings") and enemy_info.buildings is Array:
		for bs in _building_systems:
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
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})

	# Auto enter attack mode
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode()


func _start_attack_ship_waves(ship: Node3D) -> void:
	_stop_attack_ship_waves()
	var rock = create_tween().set_loops()
	rock.tween_property(ship, "rotation:z", deg_to_rad(3.0), 1.0).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	rock.tween_property(ship, "rotation:z", deg_to_rad(-3.0), 1.0).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	var pitch = create_tween().set_loops()
	pitch.tween_property(ship, "rotation:x", deg_to_rad(0.8), 1.2).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	pitch.tween_property(ship, "rotation:x", deg_to_rad(-0.6), 1.2).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
	_attack_ship_wave_tweens = [rock, pitch]


func _stop_attack_ship_waves() -> void:
	for tw in _attack_ship_wave_tweens:
		if tw and tw.is_valid():
			tw.kill()
	_attack_ship_wave_tweens.clear()


func _spawn_ship_flash(pos: Vector3) -> void:
	# Load textures once
	if _ship_flash_textures.is_empty():
		for path in SHIP_FLASH_FRAMES:
			var tex = load(path)
			if tex:
				_ship_flash_textures.append(tex)
	# Create or reuse flash quad
	if not _ship_flash or not is_instance_valid(_ship_flash):
		_ship_flash = MeshInstance3D.new()
		var quad = QuadMesh.new()
		quad.size = Vector2(SHIP_FLASH_SCALE, SHIP_FLASH_SCALE)
		quad.center_offset = Vector3(SHIP_FLASH_SCALE * 0.2, 0.0, 0.0)
		_ship_flash.mesh = quad
		var mat = StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mat.no_depth_test = true
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		if _ship_flash_textures.size() > 0:
			mat.albedo_texture = _ship_flash_textures[0]
		mat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
		_ship_flash.material_override = mat
		get_tree().root.add_child(_ship_flash)
	_ship_flash.global_position = pos
	_ship_flash.visible = true
	_ship_flash_timer = SHIP_FLASH_DURATION
	var fmat = _ship_flash.material_override as StandardMaterial3D
	fmat.albedo_color = Color(1.5, 1.2, 0.8, 1.0)
	if _ship_flash_textures.size() > 0:
		fmat.albedo_texture = _ship_flash_textures[0]


func _update_ship_flash(delta: float) -> void:
	_ship_flash_timer -= delta
	if _ship_flash_timer <= 0:
		if _ship_flash and is_instance_valid(_ship_flash):
			_ship_flash.visible = false
		return
	if not _ship_flash or not is_instance_valid(_ship_flash):
		_ship_flash_timer = 0
		return
	var progress = 1.0 - clampf(_ship_flash_timer / SHIP_FLASH_DURATION, 0.0, 1.0)
	# Swap texture frame
	var frame_idx = clampi(int(progress * _ship_flash_textures.size()), 0, _ship_flash_textures.size() - 1)
	var fmat = _ship_flash.material_override as StandardMaterial3D
	if frame_idx < _ship_flash_textures.size():
		fmat.albedo_texture = _ship_flash_textures[frame_idx]
	# Fade out in last 40%
	if progress > 0.6:
		var fade = (1.0 - progress) / 0.4
		fmat.albedo_color = Color(1.5 * fade, 1.2 * fade, 0.8 * fade, fade)


func _preload_explosion_textures() -> void:
	if not _ship_explosion_textures.is_empty():
		return
	for i in range(1, SHIP_EXPLOSION_FRAME_COUNT + 1):
		var tex = load(SHIP_EXPLOSION_FRAME_DIR % i)
		if tex:
			_ship_explosion_textures.append(tex)


func _spawn_ship_explosion(pos: Vector3) -> void:
	_preload_explosion_textures()
	if _ship_explosion_textures.is_empty():
		return
	# Create or reuse explosion quad
	if not _ship_explosion or not is_instance_valid(_ship_explosion):
		_ship_explosion = MeshInstance3D.new()
		var quad = QuadMesh.new()
		quad.size = Vector2(SHIP_EXPLOSION_SCALE, SHIP_EXPLOSION_SCALE)
		quad.center_offset = Vector3(0, SHIP_EXPLOSION_SCALE * 0.28, 0)
		_ship_explosion.mesh = quad
		var mat = StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
		mat.no_depth_test = true
		mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		mat.albedo_texture = _ship_explosion_textures[0]
		mat.albedo_color = Color(1.4, 1.1, 0.7, 1.0)
		_ship_explosion.material_override = mat
		get_tree().root.add_child(_ship_explosion)
	_ship_explosion.global_position = pos
	_ship_explosion.visible = true
	_ship_explosion_timer = SHIP_EXPLOSION_DURATION
	var emat = _ship_explosion.material_override as StandardMaterial3D
	emat.albedo_texture = _ship_explosion_textures[0]
	emat.albedo_color = Color(1.4, 1.1, 0.7, 1.0)


func _update_ship_explosion(delta: float) -> void:
	_ship_explosion_timer -= delta
	if _ship_explosion_timer <= 0:
		if _ship_explosion and is_instance_valid(_ship_explosion):
			_ship_explosion.visible = false
		return
	if not _ship_explosion or not is_instance_valid(_ship_explosion):
		_ship_explosion_timer = 0
		return
	var progress = 1.0 - clampf(_ship_explosion_timer / SHIP_EXPLOSION_DURATION, 0.0, 1.0)
	var frame_idx = clampi(int(progress * _ship_explosion_textures.size()), 0, _ship_explosion_textures.size() - 1)
	var emat = _ship_explosion.material_override as StandardMaterial3D
	if frame_idx < _ship_explosion_textures.size():
		emat.albedo_texture = _ship_explosion_textures[frame_idx]
	# Fade out in last 25%
	if progress > 0.75:
		var fade = (1.0 - progress) / 0.25
		emat.albedo_color = Color(1.4 * fade, 1.1 * fade, 0.7 * fade, fade)



func _spawn_target_ring(pos: Vector3, b_def: Dictionary) -> void:
	# Ring size based on building AABB — extends 40% beyond footprint
	var half_x = b_def.get("cells", Vector2i(2, 2)).x * cell_size * 0.5
	var half_z = b_def.get("cells", Vector2i(2, 2)).y * cell_size * 0.5
	var radius = maxf(half_x, half_z) * 1.4
	var ring = MeshInstance3D.new()
	var torus = TorusMesh.new()
	torus.inner_radius = radius * 0.06
	torus.outer_radius = radius
	torus.rings = 24
	torus.ring_segments = 12
	ring.mesh = torus
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 1.0, 1.0, 0.85)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	ring.material_override = mat
	get_tree().root.add_child(ring)
	ring.global_position = Vector3(pos.x, grid_y + 0.005, pos.z)
	ring.scale = Vector3(0.15, 0.15, 0.15)
	var final_s = Vector3(1.0, 1.0, 1.0)
	var tw = create_tween().set_parallel(true)
	tw.tween_property(ring, "scale", final_s, 0.4).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(mat, "albedo_color:a", 0.0, 0.5).set_delay(0.1).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	tw.chain().tween_callback(func(): if is_instance_valid(ring): ring.queue_free())


func _check_ship_cannon_click(mouse_pos: Vector2) -> bool:
	var camera = BaseTroop._get_camera_cached()
	if not camera:
		return false
	if not _ship_attack_node or not is_instance_valid(_ship_attack_node):
		_ship_attack_node = get_tree().root.find_child("MainShipAttack", true, false)
	if not _ship_attack_node or not _ship_attack_node.visible:
		return false
	var screen_pos = camera.unproject_position(_ship_attack_node.global_position)
	return mouse_pos.distance_to(screen_pos) < 80.0


func _enter_ship_cannon_mode() -> void:
	_ship_cannon_mode = true
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("cannon_mode", {"active": true})
	# Pause (not exit) attack mode so RMB doesn't cancel placement
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("_pause_attack_mode"):
		_cannon_paused_attack = attack_system.is_attack_mode
		attack_system._pause_attack_mode()
	else:
		_cannon_paused_attack = false
	if canvas and not _ship_cannon_label:
		_ship_cannon_label = Label.new()
		_ship_cannon_label.text = "Cannon mode — Click building to fire  |  Click sea to cancel"
		_ship_cannon_label.anchor_left = 0.5
		_ship_cannon_label.anchor_right = 0.5
		_ship_cannon_label.anchor_top = 0.0
		_ship_cannon_label.anchor_bottom = 0.0
		_ship_cannon_label.offset_left = -300
		_ship_cannon_label.offset_right = 300
		_ship_cannon_label.offset_top = 20
		_ship_cannon_label.offset_bottom = 55
		_ship_cannon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		_ship_cannon_label.add_theme_font_size_override("font_size", 20)
		_ship_cannon_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2))
		canvas.add_child(_ship_cannon_label)


func _exit_ship_cannon_mode() -> void:
	_ship_cannon_mode = false
	var bridge = get_node_or_null("/root/Bridge")
	if bridge:
		bridge.send_to_react("cannon_mode", {"active": false})
	if _ship_cannon_label and is_instance_valid(_ship_cannon_label):
		_ship_cannon_label.queue_free()
		_ship_cannon_label = null
	# Restore attack placement mode if it was active before cannon
	if _cannon_paused_attack:
		_cannon_paused_attack = false
		var attack_system = get_node_or_null("../AttackSystem")
		if attack_system and attack_system.has_method("_resume_attack_mode"):
			attack_system._resume_attack_mode()


func _fire_ship_cannon(bdata: Dictionary) -> void:
	if _ship_cannon_cooldown > 0:
		return
	if not _ship_attack_node or not is_instance_valid(_ship_attack_node):
		_ship_attack_node = get_tree().root.find_child("MainShipAttack", true, false)
	if not _ship_attack_node:
		return
	var ship = _ship_attack_node
	var bnode = bdata.get("node", null) as Node3D
	if not bnode or not is_instance_valid(bnode):
		return
	_ship_cannon_cooldown = SHIP_CANNON_RELOAD
	var ball = MeshInstance3D.new()
	var sphere = SphereMesh.new()
	sphere.radius = 0.03
	sphere.height = 0.06
	ball.mesh = sphere
	var mat = StandardMaterial3D.new()
	mat.albedo_color = Color(0.05, 0.05, 0.05)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ball.material_override = mat
	# Add to root so global_position works correctly
	get_tree().root.add_child(ball)
	var start_pos = ship.global_position + Vector3(0, 0.15, 0)
	ball.global_position = start_pos
	# Target at front edge of building (ship-facing side) at ground level
	var b_center = bnode.global_position
	var dir_to_ship = (ship.global_position - b_center)
	dir_to_ship.y = 0
	dir_to_ship = dir_to_ship.normalized()
	# Building half-extent from def cells
	var b_def = building_defs.get(bdata.get("id", ""), {})
	var half_x = b_def.get("cells", Vector2i(2, 2)).x * cell_size * 0.5
	var half_z = b_def.get("cells", Vector2i(2, 2)).y * cell_size * 0.5
	var edge_offset = absf(dir_to_ship.x) * half_x + absf(dir_to_ship.z) * half_z
	var tp: Vector3 = Vector3(b_center.x + dir_to_ship.x * edge_offset, grid_y, b_center.z + dir_to_ship.z * edge_offset)
	var dist = start_pos.distance_to(tp)
	var flight_time = maxf(dist / SHIP_CANNON_SPEED, 1.5)
	_ship_cannonballs.append({"node": ball, "bdata": bdata, "target_pos": tp, "start_pos": start_pos, "elapsed": 0.0, "flight_time": flight_time})
	# Target ring centered on building (sized to its footprint)
	_spawn_target_ring(b_center, b_def)
	# Muzzle flash slightly toward target
	var flash_dir = (tp - ball.global_position).normalized()
	_spawn_ship_flash(ball.global_position + flash_dir * 0.225)
	# Recoil — tiny kickback only
	var recoil_dir = (ship.global_position - tp).normalized()
	recoil_dir.y = 0
	var orig_pos = ship.position
	var recoil_pos = orig_pos + recoil_dir * 0.025
	var tw = create_tween()
	tw.tween_property(ship, "position", recoil_pos, 0.12).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_SINE)
	tw.tween_property(ship, "position", orig_pos, 0.4).set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)


func _update_ship_cannonballs(delta: float) -> void:
	var i = _ship_cannonballs.size() - 1
	while i >= 0:
		var c = _ship_cannonballs[i]
		if not is_instance_valid(c.node):
			_ship_cannonballs.remove_at(i)
			i -= 1
			continue
		c.elapsed += delta
		var t = clampf(c.elapsed / c.flight_time, 0.0, 1.0)
		# Lerp XZ, parabolic arc on Y
		var flat_pos = c.start_pos.lerp(c.target_pos, t)
		var arc_height = c.start_pos.distance_to(c.target_pos) * 0.35
		var arc_y = 4.0 * arc_height * t * (1.0 - t)
		c.node.global_position = Vector3(flat_pos.x, flat_pos.y + arc_y, flat_pos.z)
		if t >= 1.0:
			var bdata: Dictionary = c.bdata
			bdata["hp"] = max(0, bdata.get("hp", 0) - SHIP_CANNON_DAMAGE)
			if bdata["hp"] <= 0:
				for bs in _building_systems:
					if bdata in bs.placed_buildings:
						bs.remove_building(bdata)
						break
			c.node.queue_free()
			_spawn_ship_explosion(c.target_pos)
			var cam_rig = get_tree().current_scene.find_child("CameraRig", true, false)
			if cam_rig and cam_rig.has_method("add_trauma"):
				cam_rig.add_trauma(0.4)
			_ship_cannonballs.remove_at(i)
		i -= 1


func _return_home() -> void:
	if not is_viewing_enemy:
		return
	_exit_ship_cannon_mode()
	# Hide attack ship, show base ship when returning home
	var _r2 = get_tree().root
	if not _ship_attack_node or not is_instance_valid(_ship_attack_node):
		_ship_attack_node = _r2.find_child("MainShipAttack", true, false)
	if not _ship_base_node or not is_instance_valid(_ship_base_node):
		_ship_base_node = _r2.find_child("MainShipBase", true, false)
	if _ship_attack_node:
		_ship_attack_node.visible = false
	if _ship_base_node:
		_ship_base_node.visible = true
	for bs in _building_systems:
		bs.is_viewing_enemy = false
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("enemy_mode", {"active": false})

	# Free any in-flight cannonballs
	for c in _ship_cannonballs:
		if is_instance_valid(c.get("node")):
			c.node.queue_free()
	_ship_cannonballs.clear()

	# Kill all spawned troops, ships, and skeleton guards immediately
	for troop in get_tree().get_nodes_in_group("troops"):
		if is_instance_valid(troop):
			troop.remove_from_group("troops")
			troop.set_process(false)
			troop.queue_free()
	for guard in get_tree().get_nodes_in_group("skeleton_guards"):
		if is_instance_valid(guard):
			guard.remove_from_group("skeleton_guards")
			guard.set_process(false)
			guard.queue_free()
	for ship in get_tree().get_nodes_in_group("ships"):
		if is_instance_valid(ship):
			ship.queue_free()

	# Exit attack mode
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("exit_attack_mode"):
		attack_system.exit_attack_mode()

	# Wait one frame so queue_free takes effect before loading home buildings
	await get_tree().process_frame

	# Cloud close animation — hide React UI
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": true})
	var cloud = _get_or_create_cloud()
	cloud.close()
	await cloud.close_finished

	# Clear ALL building systems
	for bs in _building_systems:
		bs._destroy_all_buildings()

	# Restore home buildings from server on all grids
	var net = _net
	if net and net.has_token():
		var state = await net.login()
		if state.has("buildings") and state.buildings is Array:
			for bs in _building_systems:
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
	if bridge:
		bridge.send_to_react("cloud_transition", {"visible": false})


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
	# Port with a docked ship cannot be moved
	if b.get("id") == "port":
		var pnode = b.get("node", null)
		if is_instance_valid(pnode) and pnode.has_meta("has_ship"):
			return
	# Cancel any ongoing move on other building systems
	for bs in _building_systems:
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
	# Tombstone: skeletons stay at old position during drag.
	# They will run to the new position only after _confirm_move().
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
	# Tombstone: respawn dead skeletons and relocate alive ones
	if b.id == "tombstone":
		_spawn_tombstone_skeletons(b, b.get("level", 1))
		var tomb_world = b["node"].global_position
		for skel in b.get("skeletons", []):
			if is_instance_valid(skel) and skel.has_method("relocate_to"):
				skel.relocate_to(tomb_world)
	# Sync with server
	var net = _net
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
			# Tombstone: restore skeletons' tombstone_pos (they stay where they are)
			if b.id == "tombstone" and b.has("skeletons"):
				var tomb_world = b["node"].global_position
				for skel in b["skeletons"]:
					if is_instance_valid(skel):
						skel.tombstone_pos = tomb_world
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
