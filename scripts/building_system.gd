class_name BuildingSystem
extends Node3D

## Grid-based building system (Clash of Clans style)
## Grid is aligned to the gridPlane node in the scene

const ALTAR_MODEL_SCENE_PATH: String = "res://Model/Altar/Models/Stylized_Altar_web.tscn"
const ALTAR_MODEL_SCENE = preload(ALTAR_MODEL_SCENE_PATH)
const TOWN_HALL_LEVEL_6_SCENE_PATH: String = "res://Model/Town_Hall/Town Hall Level 6.glb"
const TOWN_HALL_LEVEL_6_SCENE: PackedScene = preload(TOWN_HALL_LEVEL_6_SCENE_PATH)
const TOWN_HALL_LEVEL_7_SCENE_PATH: String = "res://Model/Town_Hall/Town Hall Level 7.glb"
const TOWN_HALL_LEVEL_7_SCENE: PackedScene = preload(TOWN_HALL_LEVEL_7_SCENE_PATH)
const SHIP_COST_GOLD: int = 250
const MAX_PORT_SHIP_LEVEL: int = 3
const MAX_PLAYER_SHIP_LEVEL: int = 10
const BUILDING_CAMERA_FACING_YAW_DEGREES: float = 90.0
const PLAYER_SHIP_LEVELS: Dictionary = {
	1: {"capacity": 3, "energy": 4, "cannon_damage": 500, "cannon_base_cost": 1, "town_hall": 1, "cost": {}},
	2: {"capacity": 12, "energy": 6, "cannon_damage": 700, "cannon_base_cost": 1, "town_hall": 2, "cost": {"gold": 2000, "wood": 4000, "ore": 3400}},
	3: {"capacity": 27, "energy": 8, "cannon_damage": 1100, "cannon_base_cost": 2, "town_hall": 3, "cost": {"gold": 3600, "wood": 7200, "ore": 6200}},
	4: {"capacity": 36, "energy": 10, "cannon_damage": 1450, "cannon_base_cost": 2, "town_hall": 4, "cost": {"gold": 4800, "wood": 9600, "ore": 8200}},
	5: {"capacity": 45, "energy": 12, "cannon_damage": 1800, "cannon_base_cost": 3, "town_hall": 5, "cost": {"gold": 6500, "wood": 12800, "ore": 11000}},
	6: {"capacity": 45, "energy": 14, "cannon_damage": 2250, "cannon_base_cost": 3, "town_hall": 6, "medkit_unlocked": true, "unlocks": ["Healing Field"], "cost": {"gold": 9000, "wood": 18000, "ore": 15500}},
	7: {"capacity": 45, "energy": 16, "cannon_damage": 2800, "cannon_base_cost": 4, "town_hall": 7, "medkit_unlocked": true, "freeze_unlocked": true, "unlocks": ["Freeze Orb"], "cost": {"gold": 12000, "wood": 24000, "ore": 21000}},
	8: {"capacity": 45, "energy": 18, "cannon_damage": 3400, "cannon_base_cost": 4, "town_hall": 7, "medkit_unlocked": true, "freeze_unlocked": true, "rage_unlocked": true, "unlocks": ["Rage Field"], "cost": {"gold": 16000, "wood": 32000, "ore": 28000}},
	9: {"capacity": 45, "energy": 20, "cannon_damage": 4100, "cannon_base_cost": 5, "town_hall": 7, "medkit_unlocked": true, "freeze_unlocked": true, "rage_unlocked": true, "tactical_reserve_unlocked": true, "unlocks": ["Tactical Reserve (+2 energy)"], "cost": {"gold": 21000, "wood": 42000, "ore": 36000}},
	10: {"capacity": 45, "energy": 22, "cannon_damage": 4900, "cannon_base_cost": 5, "town_hall": 7, "medkit_unlocked": true, "freeze_unlocked": true, "rage_unlocked": true, "tactical_reserve_unlocked": true, "skeleton_barrel_unlocked": true, "unlocks": ["Skeleton Barrel"], "cost": {"gold": 27000, "wood": 54000, "ore": 46000}},
}

func _main_ship_energy_for_level(level: int) -> int:
	var normalized_level: int = clampi(level, 1, MAX_PLAYER_SHIP_LEVEL)
	return int(PLAYER_SHIP_LEVELS.get(normalized_level, {}).get("energy", 4))


func _main_ship_cannon_damage_for_level(level: int) -> int:
	var normalized_level: int = clampi(level, 1, MAX_PLAYER_SHIP_LEVEL)
	return int(PLAYER_SHIP_LEVELS.get(normalized_level, {}).get("cannon_damage", 500))


func _main_ship_cannon_base_cost_for_level(level: int) -> int:
	var normalized_level: int = clampi(level, 1, MAX_PLAYER_SHIP_LEVEL)
	return int(PLAYER_SHIP_LEVELS.get(normalized_level, {}).get("cannon_base_cost", 1))


func _main_ship_ability_labels(level: int) -> Array[String]:
	var config: Dictionary = PLAYER_SHIP_LEVELS.get(clampi(level, 1, MAX_PLAYER_SHIP_LEVEL), {})
	var labels: Array[String] = []
	if bool(config.get("medkit_unlocked", false)):
		labels.append("Healing Field")
	if bool(config.get("freeze_unlocked", false)):
		labels.append("Freeze Orb")
	if bool(config.get("rage_unlocked", false)):
		labels.append("Rage Field")
	if bool(config.get("skeleton_barrel_unlocked", false)):
		labels.append("Skeleton Barrel")
	return labels


# ── Grid Settings ─────────────────────────────────────────────
@export var grid_width: int = 27
@export var grid_height: int = 27
@export var grid_plane_path: NodePath = "../gridPlane"
@export var create_ui: bool = true
@export var always_show_grid: bool = false
@export var allowed_buildings: PackedStringArray = []  # Empty = all allowed
@export var blocked_buildings: PackedStringArray = []  # These are never allowed
@export var test_mode: bool = false  # Sandbox: infinite resources, no unlocks, no max counts, no server sync

# ── Building Definitions ──────────────────────────────────────
var building_defs: Dictionary = {
	"mine": {
		"name": "Mine",
		"cells": Vector2i(3, 3),
		"footprint_extra": 0.8,
		"color": Color(0.55, 0.45, 0.2, 0.5),
		"height": 0.3,
		"scene": "res://Model/Mine/1.glb",
		"model_scale": 0.25,
		"model_rotation_y": 270.0,
		"hp_levels": [1200, 2200, 3800, 6000, 7712, 10302, 12798],
		"cost": {"gold": 180, "wood": 500},
		"upgrade_base_cost": {"gold": 220, "wood": 550},
		"produces": "ore",
		"produce_rate": [18, 33, 54, 81, 120, 170, 225],    # per minute per level
		"produce_max": [200, 400, 800, 1600, 3000, 5000, 7500],  # max stored before collection
	},
	"barn": {
		"name": "Barn",
		"cells": Vector2i(4, 3),
		"color": Color(0.6, 0.25, 0.2, 0.5),
		"height": 0.4,
		"scene": "res://Model/Barn/1.glb",
		"scenes": ["res://Model/Barn/1.glb", "res://Model/Barn/2.glb", "res://Model/Barn/3.glb", "res://Model/Barn/3.glb", "res://Model/Barn/3.glb", "res://Model/Barn/3.glb", "res://Model/Barn/3.glb"],
		"model_scale": 0.25,
		"hp_levels": [2000, 3500, 6000, 9500, 12132, 16094, 19908],
		"cost": {"gold": 350, "wood": 900, "ore": 750},
		"upgrade_base_cost": {"gold": 450, "wood": 1050, "ore": 900},
		"max_count": 1,
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
		"cost": {"gold": 240, "wood": 560, "ore": 480},
		"ship_cost": {"gold": SHIP_COST_GOLD},
		"no_outline": true,
		"no_shop": true,
	},
	"sawmill": {
		"name": "Sawmill",
		"cells": Vector2i(3, 3),
		"color": Color(0.45, 0.65, 0.25, 0.5),
		"height": 0.35,
		"scene": "res://Model/Sawmill/1.glb",
		"model_scale": 0.1,
		"hp_levels": [1200, 2200, 3800, 6000, 7712, 10302, 12798],
		"cost": {"gold": 180, "ore": 500},
		"upgrade_base_cost": {"gold": 220, "ore": 550},
		"produces": "wood",
		"produce_rate": [24, 45, 72, 108, 160, 230, 300],
		"produce_max": [250, 500, 1000, 2000, 3750, 6000, 9000],
	},
	"town_hall": {
		"name": "Town Hall",
		"cells": Vector2i(4, 4),
		"footprint_extra": 0.3,
		"color": Color(0.7, 0.55, 0.2, 0.5),
		"height": 0.5,
		"scene": "res://Model/Town_Hall/Town Hall Level 1.glb",
		"scenes": ["res://Model/Town_Hall/Town Hall Level 1.glb", "res://Model/Town_Hall/Town Hall Level 2.glb", "res://Model/Town_Hall/Town Hall Level 3.glb", "res://Model/Town_Hall/Town Hall Level 4.glb", "res://Model/Town_Hall/Town Hall Level 5.glb", "res://Model/Town_Hall/Town Hall Level 6.glb", "res://Model/Town_Hall/Town Hall Level 7.glb"],
		"model_scale": 0.05,
		"hp_levels": [3500, 8000, 16000, 24000, 30848, 41200, 51193],
		"is_main": true,
		"max_count": 1,
		"cost": {},
		"upgrade_cost": {2: {"gold": 1200, "wood": 4200, "ore": 3500}, 3: {"gold": 4000, "wood": 8500, "ore": 7500}, 4: {"gold": 12000, "wood": 22000, "ore": 19000}, 5: {"gold": 30000, "wood": 54000, "ore": 48000}, 6: {"gold": 55000, "wood": 75000, "ore": 68000}, 7: {"gold": 85000, "wood": 106000, "ore": 98000}},
	},
	"turret": {
		"name": "Turret",
		"cells": Vector2i(2, 2),
		"footprint_extra": 1.0,
		"color": Color(0.5, 0.5, 0.55, 0.5),
		"height": 0.45,
		"scene": "res://Model/Turret/scene.gltf",
		"model_scale": 0.25,
		"model_scales": [0.2, 0.225, 0.25, 0.275, 0.3, 0.3, 0.3],
		"hp_levels": [900, 1600, 2800, 4500, 5558, 7137, 8532],
		"cost": {"gold": 800, "wood": 2400, "ore": 2000},
		"upgrade_base_cost": {"gold": 750, "wood": 2500, "ore": 2100},
		"altar_ward_bonus": true,
		"outline_aabb_include": ["Stand"],  # Only count Stand mesh for outline, ignore barrel
	},
	"cannon": {
		"name": "Cannon",
		"cells": Vector2i(3, 3),
		"footprint_extra": 0.35,
		"color": Color(0.48, 0.38, 0.22, 0.5),
		"height": 0.42,
		"scene": "res://Model/cannons/level_01/cannon_level_01.tscn",
		"scenes": [
			"res://Model/cannons/level_01/cannon_level_01.tscn",
			"res://Model/cannons/level_02/cannon_level_02.tscn",
			"res://Model/cannons/level_03/cannon_level_03.tscn",
			"res://Model/cannons/level_04/cannon_level_04.tscn",
			"res://Model/cannons/level_05/cannon_level_05.tscn",
			"res://Model/cannons/level_06/cannon_level_06.tscn",
			"res://Model/cannons/level_07/cannon_level_07.tscn",
		],
		"model_scale": 0.125,
		"model_scales": [0.125, 0.12, 0.125, 0.105, 0.105, 0.10, 0.10],
		"model_rotation_y": 270.0,
		"hp_levels": [3200, 3900, 4700, 5600, 6148, 6742, 7141],
		"damage_levels": [40, 109, 259, 431, 510, 577, 620],
		"cost": {"gold": 16000, "wood": 36000, "ore": 30000},
		"upgrade_cost": {
			2: {"gold": 24000, "wood": 52000, "ore": 44000},
			3: {"gold": 35000, "wood": 70000, "ore": 60000},
			4: {"gold": 48000, "wood": 90000, "ore": 76000},
			5: {"gold": 65000, "wood": 110000, "ore": 92000},
			6: {"gold": 83000, "wood": 128000, "ore": 108000},
			7: {"gold": 105000, "wood": 142000, "ore": 125000},
		},
		"max_count": 2,
		"altar_ward_bonus": true,
		"hp_bar_height": 0.42,
		"outline_aabb_include": [
			"Cannon1Base",
			"Cannon2Base",
			"Cannon3Base",
			"Cannon4Base",
			"Cannon5Base",
			"Cannon6Base",
			"Cannon7Base",
		],
	},
	"altar": {
		"name": "Altar",
		"cells": Vector2i(3, 3),
		"color": Color(0.45, 0.25, 0.55, 0.5),
		"height": 0.35,
		"scene": ALTAR_MODEL_SCENE_PATH,
		"model_scale": 0.21,
		"model_offset": Vector3(0, -0.04, 0),
		"model_rotation_y": 0.0,
		"hp_levels": [900],
		"cost": {},
		"max_count": 1,
		"requires_purchase": true,
		"shop_sku": "altar",
		"hp_bar_height": 0.45,
		"albedo_texture": "res://Model/Altar/Textures/UnityHD/Stylized_Altar_MAT_BaseMap.png",
		"emission_texture": "res://Model/Altar/Textures/UnityHD/Stylized_Altar_MAT_Emissive.png",
	},
	"storage": {
		"name": "Storage",
		"cells": Vector2i(4, 5),
		"color": Color(0.5, 0.4, 0.3, 0.5),
		"height": 0.35,
		"scene": "res://Model/Storage/Storage shed_1.glb",
		"scenes": ["res://Model/Storage/Storage shed_1.glb", "res://Model/Storage/Storage House_2.glb", "res://Model/Storage/Business Building_3.glb", "res://Model/Storage/Business Building_3.glb", "res://Model/Storage/Business Building_3.glb", "res://Model/Storage/Business Building_3.glb", "res://Model/Storage/Business Building_3.glb"],
		"model_scale": 0.3,
		"model_offset": Vector3(0, 0, -0.04),
		"hp_levels": [1400, 2500, 4200, 6500, 8136, 10575, 12798],
		"cost": {"gold": 400, "wood": 1400},
		"upgrade_base_cost": {"gold": 500, "wood": 1500},
	},
	"archer_tower": {
		"name": "Archer Tower",
		"cells": Vector2i(3, 3),
		"color": Color(0.5, 0.45, 0.55, 0.5),
		"height": 0.45,
		"scene": "res://Model/Archer_towers/tower_1.glb",
		"scenes": ["res://Model/Archer_towers/tower_1.glb", "res://Model/Archer_towers/towerplus_2.fbx", "res://Model/Archer_towers/3,4,5.glb", "res://Model/Archer_towers/3,4,5.glb", "res://Model/Archer_towers/3,4,5.glb", "res://Model/Archer_towers/3,4,5.glb", "res://Model/Archer_towers/3,4,5.glb"],
		"model_scale": 0.03,
		"model_offset": Vector3(0.11, 0, -0.02),
		"model_offsets": [Vector3(0.11, 0, -0.02), Vector3(0.11, 0, -0.02), Vector3(0, 0, 0), Vector3(0, 0, 0), Vector3(0, 0, 0), Vector3(0, 0, 0), Vector3(0, 0, 0)],
		"hp_levels": [800, 1500, 2500, 3800, 4703, 6051, 7252],
		"cost": {"gold": 500, "wood": 1600},
		"upgrade_base_cost": {"gold": 550, "wood": 1700},
		"altar_ward_bonus": true,
		"hp_bar_height": 0.5,
		"tower_unit": {
			"model": "res://Model/Characters/pirate_archer/pirate_archer.tscn",
			"scale": 0.11,
			"offset_y": 0.3,
			"align_to_model_center": true,
			"rotation_y": -90.0,
			"inherit_building_yaw": true,
		},
	},
	"mage_tower": {
		"name": "Mage Tower",
		"cells": Vector2i(3, 3),
		"color": Color(0.55, 0.3, 0.7, 0.5),  # purple magic theme
		"height": 0.5,
		"scene": "res://Model/MageTower/1.fbx",
		"scenes": ["res://Model/MageTower/1.fbx", "res://Model/MageTower/2.fbx", "res://Model/MageTower/3.fbx", "res://Model/MageTower/3.fbx", "res://Model/MageTower/3.fbx", "res://Model/MageTower/3.fbx", "res://Model/MageTower/3.fbx"],
		"model_scale": 0.039,  # TARBO FBX scale (0.02 base +50%, then +30% size)
		"model_rotation_y": 0.0,
		"hp_levels": [700, 1200, 2000, 3100, 3837, 4939, 5901],
		"cost": {"gold": 2800, "ore": 5200},
		"upgrade_base_cost": {"gold": 1600, "ore": 3000},
		"max_count": 2,
		"altar_ward_bonus": true,
		"hp_bar_height": 0.5,
		# FBX ships no embedded texture (Unity .mat stripped) — applied at runtime
		# via _apply_building_albedo. Violet palette + emission glow for the
		# magic look (matches the DemonKing purple).
		"albedo_texture": "res://Model/MageTower/mage_tower_albedo.png",
		"emission_texture": "res://Model/MageTower/mage_tower_emit.png",
		# Combat: tower_mage.gd is attached to the building node (like turret),
		# casting magic orbs at troops within its balanced defense range.
	},
	"mortar": {
		"name": "Mortar",
		"cells": Vector2i(2, 2),
		"footprint_extra": 0.45,
		"color": Color(0.6, 0.36, 0.18, 0.5),
		"height": 0.45,
		"scene": "res://Model/Mortar/mortar_lvl1.fbx",
		"scenes": [
			"res://Model/Mortar/mortar_lvl1.fbx",
			"res://Model/Mortar/mortar_lvl2.fbx",
			"res://Model/Mortar/mortar_lvl3.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
		],
		"model_scale": 0.032,
		"model_rotation_y": 0.0,
		"hp_levels": [1700, 2400, 3200, 4100, 4580, 5324, 6019],
		"damage_levels": [95, 108, 158, 227, 233, 240, 294],
		"range_levels": [1.433, 1.600, 1.767, 1.933, 2.100, 2.250, 2.400],
		"min_range_levels": [0.70, 0.75, 0.80, 0.82, 0.82, 0.80, 0.78],
		"splash_radius_levels": [0.30, 0.34, 0.38, 0.42, 0.45, 0.49, 0.52],
		"reload_levels": [2.40, 2.40, 2.40, 2.40, 2.40, 2.40, 2.40],
		"cost": {"gold": 8000, "wood": 12000, "ore": 10000},
		"upgrade_cost": {
			2: {"gold": 14000, "wood": 22000, "ore": 18000},
			3: {"gold": 24000, "wood": 36000, "ore": 30000},
			4: {"gold": 38000, "wood": 54000, "ore": 46000},
			5: {"gold": 52000, "wood": 72000, "ore": 62000},
			6: {"gold": 68000, "wood": 96000, "ore": 82000},
			7: {"gold": 92000, "wood": 132000, "ore": 112000},
		},
		"max_count": 2,
		"altar_ward_bonus": true,
		"hp_bar_height": 0.6,
		"albedo_texture": "res://Model/Mortar/mortar_albedo.png",
		"emission_texture": "res://Model/Mortar/mortar_emit.png",
		"construction_scenes": [
			"res://Model/Mortar/mortar_lvl1_construction.fbx",
			"res://Model/Mortar/mortar_lvl2_construction.fbx",
			"res://Model/Mortar/mortar_lvl3_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
		],
		"projectile_scenes": [
			"res://Model/Mortar/mortar_lvl1_projectile.fbx",
			"res://Model/Mortar/mortar_lvl2_projectile.fbx",
			"res://Model/Mortar/mortar_lvl3_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
		],
		"test_damage": 294,
		"test_damage_levels": [95, 108, 158, 227, 233, 240, 294],
		"test_range": 2.40,
		"test_reload_sec": 2.40,
	},
	"harpoon": {
		"name": "Harpoon",
		"cells": Vector2i(2, 2),
		"footprint_extra": 0.35,
		"color": Color(0.20, 0.42, 0.48, 0.5),
		"height": 0.50,
		"scene": "res://Model/Harpoon/HarpoonDefense.tscn",
		"model_scale": 0.0625,
		"hp_levels": [1800, 2400, 3200, 4300, 5600, 6756, 10201, 12000],
		"damage_levels": [45, 55, 65, 75, 77, 82, 98, 100],
		"range_levels": [1.20, 1.27, 1.45, 1.64, 1.82, 1.95, 2.08, 2.20],
		"pull_speed_levels": [0.85, 0.92, 0.99, 1.06, 1.13, 1.20, 1.40, 1.48],
		"reload_sec": 7.00,
		"pull_duration_sec": 0.80,
		"stop_distance": 0.60,
		"target_type": "air",
		"cost": {"gold": 12000, "wood": 22000, "ore": 18000},
		"upgrade_cost": {
			2: {"gold": 20000, "wood": 42000, "ore": 35000},
			3: {"gold": 30000, "wood": 56000, "ore": 47000},
			4: {"gold": 41000, "wood": 70000, "ore": 59000},
			5: {"gold": 54000, "wood": 84000, "ore": 71000},
			6: {"gold": 68000, "wood": 98000, "ore": 83000},
			7: {"gold": 86000, "wood": 122000, "ore": 104000},
			8: {"gold": 108000, "wood": 142000, "ore": 124000},
		},
		"max_count": 2,
		"altar_ward_bonus": true,
		"hp_bar_height": 0.55,
	},
	"shark_trap": {
		"name": "Shark Trap",
		"cells": Vector2i(2, 2),
		"color": Color(0.08, 0.46, 0.62, 0.5),
		"height": 0.08,
		"scene": "res://Model/Shark/Shark.glb",
		"model_scale": 0.055,
		"model_offset": Vector3(0, -0.05, 0),
		"model_rotation_y": 0.0,
		"hp_levels": [1, 1, 1, 1, 1, 1, 1],
		"damage_levels": [500, 750, 1050, 1450, 2000, 2400, 2900],
		"cost": {"gold": 1800, "wood": 4800, "ore": 4000},
		"upgrade_base_cost": {"gold": 1000, "wood": 2600, "ore": 2200},
		"max_count": 3,
		"no_outline": true,
		"no_hp_bar": true,
		"non_targetable": true,
	},
	"tombstone": {
		"name": "Tombstone",
		"cells": Vector2i(3, 3),
		"color": Color(0.4, 0.4, 0.45, 0.5),
		"height": 0.3,
		"scene": "res://Model/Tombstone/GLB format/1.glb",
		"scenes": ["res://Model/Tombstone/GLB format/1.glb", "res://Model/Tombstone/GLB format/2.glb", "res://Model/Tombstone/GLB format/3.glb", "res://Model/Tombstone/GLB format/4.glb", "res://Model/Tombstone/GLB format/4.glb", "res://Model/Tombstone/GLB format/4.glb"],
		"model_scale": 0.3,
		"model_scales": [0.3, 0.3, 0.3, 0.1, 0.1, 0.1],
		"hp_levels": [1000, 1500, 2000, 2700, 2956, 3418],
		"cost": {"gold": 600, "ore": 2200},
		"upgrade_base_cost": {"gold": 650, "ore": 2400},
		"altar_ward_bonus": true,
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
	"ruins": {
		"name": "Ruins",
		"cells": Vector2i(2, 2),
		"color": Color(0.35, 0.3, 0.25, 0.5),
		"height": 0.2,
		"scene": "res://Model/BrokenModel/BrokenModel.glb",
		"model_scale": 0.15,
		"hp_levels": [300, 500, 800],
		"cost": {},
		"no_shop": true,
	},
}

const BUILDING_UPGRADE_COST_MULTIPLIERS: Dictionary = {
	2: 2,
	3: 4,
	4: 8,
	5: 15,
	6: 27,
	7: 45,
}

# ── Resources ─────────────────────────────────────────────────
var resources: Dictionary = {
	"wood": 10000,
	"gold": 10000,
	"ore": 10000,
}

# ── Storage Capacity (mirrors server/db.js) ───────────────────
# MUST match server/db.js TH_BASE_CAPACITY / STORAGE_CAPACITY exactly —
# Godot computes caps locally and pushes them to the React HUD, while the
# server uses its own constants to cap rewards. If the two drift, the HUD
# shows one number while the server silently caps claim-gold/task rewards
# to a different one. Previously TH1 read 5K here vs 10K server-side, and
# the TH2 upgrade required 6K wood — impossible to accumulate because the
# Godot-reported cap was 5K AND Storage unlocks only after TH2, creating a
# dead-end where a new player could never upgrade Town Hall.
const TH_BASE_CAPACITY: Dictionary = {
	1: {"gold": 6000, "wood": 6000, "ore": 6000},
	2: {"gold": 6000, "wood": 6000, "ore": 6000},
	3: {"gold": 9000, "wood": 9000, "ore": 9000},
	4: {"gold": 12000, "wood": 12000, "ore": 12000},
	5: {"gold": 18000, "wood": 18000, "ore": 18000},
	6: {"gold": 25000, "wood": 25000, "ore": 25000},
	7: {"gold": 35000, "wood": 35000, "ore": 35000},
}
const STORAGE_CAPACITY: Dictionary = {
	1: {"gold": 2000, "wood": 2000, "ore": 2000},
	2: {"gold": 3000, "wood": 3000, "ore": 3000},
	3: {"gold": 6500, "wood": 6500, "ore": 6500},
	4: {"gold": 14000, "wood": 14000, "ore": 14000},
	5: {"gold": 19000, "wood": 19000, "ore": 19000},
	6: {"gold": 27000, "wood": 27000, "ore": 27000},
	7: {"gold": 36000, "wood": 36000, "ore": 36000},
}

func _get_resource_caps() -> Dictionary:
	var th_level: int = 1
	# Check ALL building systems for town hall
	for bs in _building_systems:
		for b in bs.placed_buildings:
			if b.get("id", "") == "town_hall":
				th_level = maxi(th_level, b.get("level", 1))
	var base: Dictionary = TH_BASE_CAPACITY.get(mini(th_level, 7), TH_BASE_CAPACITY[1])
	var max_gold: int = base.gold
	var max_wood: int = base.wood
	var max_ore: int = base.ore
	for bs in _building_systems:
		for b in bs.placed_buildings:
			if b.get("id", "") == "storage":
				var cap: Dictionary = STORAGE_CAPACITY.get(b.get("level", 1), STORAGE_CAPACITY[1])
				max_gold += cap.gold
				max_wood += cap.wood
				max_ore += cap.ore
	return {"gold": max_gold, "wood": max_wood, "ore": max_ore}

func _send_resource_caps() -> void:
	var caps: Dictionary = _get_resource_caps()
	var bridge: Node = _bridge
	if bridge:
		bridge.send_to_react("resource_caps", caps)

# ── Town Hall Progression (mirrors server/db.js) ─────────────
const TH_UNLOCK: Dictionary = {
	"storage": 2,
	"tombstone": 2,
	"turret": 3,
	"shark_trap": 3,
	"mage_tower": 4,
	"mortar": 5,
	"harpoon": 6,
	"cannon": 7,
}

# Max count per building per TH level. Individual tables may include future
# Town Hall gates beyond the current playable TH7 and clamp to their last entry.
const TH_MAX_COUNT: Dictionary = {
	"mine": [1, 2, 3, 3, 4, 4, 4],
	"sawmill": [1, 2, 3, 3, 4, 4, 4],
	"barn": [1, 1, 1, 1, 1, 1, 1],
	"altar": [1, 1, 1, 1, 1, 1, 1],
	"archer_tower": [1, 2, 3, 3, 3, 3, 3],
	"tombstone": [0, 1, 3, 3, 3, 3, 3],
	"turret": [0, 0, 3, 3, 3, 3, 3],
	"shark_trap": [0, 0, 1, 1, 2, 3, 3],
	"storage": [0, 1, 2, 3, 3, 3, 3],
	"mage_tower": [0, 0, 0, 2, 2, 2, 2],
	"mortar": [0, 0, 0, 0, 1, 2, 2],
	"harpoon": [0, 0, 0, 0, 0, 1, 1, 2], # one at TH6-TH7, second at TH8
	"cannon": [0, 0, 0, 0, 0, 0, 2],
	"town_hall": [1, 1, 1, 1, 1, 1, 1],
}

const TH_MAX_LEVEL: Dictionary = {
	"town_hall": [1, 2, 3, 4, 5, 6, 7],
	"mine": [1, 2, 3, 4, 5, 6, 7],
	"sawmill": [1, 2, 3, 4, 5, 6, 7],
	"barn": [1, 2, 3, 4, 5, 6, 7],
	"storage": [1, 2, 3, 4, 5, 6, 7],
	"archer_tower": [1, 2, 3, 4, 5, 6, 7],
	"turret": [1, 2, 3, 4, 5, 6, 7],
	"mage_tower": [1, 2, 3, 4, 5, 6, 7],
	"tombstone": [1, 2, 3, 4, 4, 5, 6],
	"mortar": [1, 1, 1, 1, 5, 6, 7],
	"harpoon": [1, 1, 1, 1, 1, 6, 7, 8],
	"shark_trap": [1, 2, 3, 4, 5, 6, 7],
	"cannon": [1, 1, 1, 1, 1, 1, 7],
	"port": [1, 2, 3, 3, 3, 3, 3],
	"altar": [1, 1, 1, 1, 1, 1, 1],
}

func _get_building_max_level_for_th(building_id: String, th_level: int) -> int:
	var def: Dictionary = building_defs.get(building_id, {})
	var hp_levels: Array = def.get("hp_levels", [])
	var definition_max: int = maxi(1, hp_levels.size())
	var levels: Array = TH_MAX_LEVEL.get(building_id, [])
	if levels.is_empty():
		return mini(definition_max, maxi(1, th_level))
	var index: int = clampi(th_level - 1, 0, levels.size() - 1)
	return clampi(int(levels[index]), 1, definition_max)


func _get_th_upgrade_requirements(th_level: int) -> Array:
	## Derive the gate from the same tables used for placement and level caps.
	## Optional paid buildings are intentionally excluded from core progression.
	var requirements: Array = []
	for building_id_value in TH_MAX_COUNT:
		var building_id: String = str(building_id_value)
		if building_id == "town_hall" or not building_defs.has(building_id):
			continue
		var def: Dictionary = building_defs.get(building_id, {})
		if bool(def.get("requires_purchase", false)):
			continue
		var limits: Array = TH_MAX_COUNT.get(building_id, [])
		if limits.is_empty():
			continue
		var index: int = clampi(th_level - 1, 0, limits.size() - 1)
		var required_count: int = maxi(0, int(limits[index]))
		if required_count <= 0:
			continue
		requirements.append({
			"type": building_id,
			"count": required_count,
			"level": _get_building_max_level_for_th(building_id, th_level),
		})
	return requirements

func _get_th_level() -> int:
	for bs in _building_systems:
		for b in bs.placed_buildings:
			if b.get("id", "") == "town_hall":
				return b.get("level", 1)
	return 1

func _get_barn_level() -> int:
	var level: int = 0
	for bs in _building_systems:
		for b in bs.placed_buildings:
			if b.get("id", "") == "barn":
				level = maxi(level, int(b.get("level", 0)))
	return level

func _has_town_hall() -> bool:
	for bs in _building_systems:
		for b in bs.placed_buildings:
			if b.get("id", "") == "town_hall":
				return true
	return false

func _is_building_unlocked(building_id: String) -> bool:
	if test_mode:
		return true
	if building_id != "town_hall" and not _has_town_hall():
		return false
	if not TH_UNLOCK.has(building_id):
		return true
	return _get_th_level() >= TH_UNLOCK[building_id]


func _set_shop_unlocks(data: Dictionary) -> void:
	var next_unlocks: Dictionary = {}
	var building_unlock_data: Variant = data.get("building_unlocks", {})
	if building_unlock_data is Dictionary:
		var building_unlocks: Dictionary = building_unlock_data
		for key in building_unlocks.keys():
			next_unlocks[str(key)] = bool(building_unlocks.get(key, false))
	var shop_entitlement_data: Variant = data.get("shop_entitlements", {})
	if shop_entitlement_data is Dictionary:
		var shop_entitlements: Dictionary = shop_entitlement_data
		for key in shop_entitlements.keys():
			next_unlocks[str(key)] = bool(shop_entitlements.get(key, false))
	var altar_data: Variant = data.get("altar", null)
	if altar_data is Dictionary:
		var altar_unlock: Dictionary = altar_data
		if bool(altar_unlock.get("active", false)):
			next_unlocks["altar"] = true
	elif altar_data is bool and altar_data == true:
		next_unlocks["altar"] = true
	shop_unlocks = next_unlocks


func _has_required_purchase(building_id: String) -> bool:
	if test_mode:
		return true
	var def: Dictionary = building_defs.get(building_id, {})
	if not bool(def.get("requires_purchase", false)):
		return true
	var sku: String = str(def.get("shop_sku", building_id))
	return bool(shop_unlocks.get(building_id, false)) or bool(shop_unlocks.get(sku, false))

func _can_upgrade_th() -> Dictionary:
	## Every available building slot must exist at the current Town Hall cap.
	if test_mode:
		return {"can": true, "missing": [], "blockers": []}
	var th_level: int = _get_th_level()
	var missing: Array = []
	var blockers: Array = []
	for requirement_value in _get_th_upgrade_requirements(th_level):
		var requirement: Dictionary = requirement_value
		var req_type: String = str(requirement.get("type", ""))
		var required_count: int = int(requirement.get("count", 0))
		var required_level: int = int(requirement.get("level", 1))
		var owned_count: int = 0
		var maxed_count: int = 0
		for bs in _building_systems:
			for b in bs.placed_buildings:
				if b.get("id", "") != req_type:
					continue
				owned_count += 1
				if int(b.get("level", 1)) >= required_level:
					maxed_count += 1
		if maxed_count >= required_count:
			continue
		var def: Dictionary = building_defs.get(req_type, {})
		var display_name: String = str(def.get("name", req_type.capitalize()))
		missing.append("%s %d/%d at Lv.%d" % [
			display_name,
			mini(maxed_count, required_count),
			required_count,
			required_level,
		])
		blockers.append({
			"type": req_type,
			"count": required_count,
			"level": required_level,
			"owned_count": mini(owned_count, required_count),
			"maxed_count": mini(maxed_count, required_count),
			"missing_count": maxi(0, required_count - owned_count),
			"underleveled_count": maxi(0, mini(owned_count, required_count) - maxed_count),
		})
	return {"can": missing.is_empty(), "missing": missing, "blockers": blockers}

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
var _move_last_grid_step_gp: Vector2i = Vector2i(-9999, -9999)
var _move_indicator: MeshInstance3D = null

# ── Placement State ───────────────────────────────────────────
var is_placing: bool = false
var current_building_id: String = ""
var ghost: Node3D = null
var ghost_material: StandardMaterial3D = null
var current_grid_pos: Vector2i = Vector2i.ZERO
var grid_visual: MeshInstance3D = null
var shop_unlocks: Dictionary = {}

# ── Selection State ───────────────────────────────────────────
var selected_building: Dictionary = {}
var _home_player_flag_url: String = ""

# ── Scene / Script preload cache ─────────────────────────────
## Preloaded PackedScene resources keyed by path — populated once on first
## BuildingSystem _ready(), shared across all instances. Eliminates per-building
## load() calls at transition time.
static var _scene_res_cache: Dictionary = {}
static var _turret_script_res: Script = null
static var _cannon_script_res: Script = null
static var _mage_tower_script_res: Script = null
static var _mortar_script_res: Script = null
static var _harpoon_script_res: Script = null
static var _shark_trap_script_res: Script = null
static var _altar_effect_script_res: Script = null
static var _town_hall_flag_texture_cache: Dictionary = {}
static var _town_hall_flag_pending_models: Dictionary = {}
static var _town_hall_flag_pending_ship_controllers: Dictionary = {}
static var _town_hall_flag_pending_requests: Dictionary = {}
static var _town_hall_flag_retry_counts: Dictionary = {}
const DEFAULT_TOWN_HALL_FLAG_TEXTURE: Texture2D = preload(
	"res://Model/Town_Hall/Town Hall Level 1_FlagTexture2.png"
)
const TOWN_HALL_FLAG_MAX_RETRIES := 2
const TOWN_HALL_FLAG_RETRY_DELAY_SECONDS := 0.75


static func _load_packed_scene_resource(path: String) -> PackedScene:
	if path == "":
		return null
	if path == TOWN_HALL_LEVEL_6_SCENE_PATH:
		return TOWN_HALL_LEVEL_6_SCENE
	if path == TOWN_HALL_LEVEL_7_SCENE_PATH:
		return TOWN_HALL_LEVEL_7_SCENE
	if path == ALTAR_MODEL_SCENE_PATH:
		return ALTAR_MODEL_SCENE as PackedScene
	if not ResourceLoader.exists(path, "PackedScene"):
		return null
	return ResourceLoader.load(path, "PackedScene") as PackedScene


static func _get_packed_scene_resource(path: String) -> PackedScene:
	if path == "":
		return null
	var cached: Resource = _scene_res_cache.get(path, null)
	if cached != null:
		return cached as PackedScene
	var res := _load_packed_scene_resource(path)
	if res != null:
		_scene_res_cache[path] = res
	return res


static func _load_script_resource(path: String) -> Script:
	if path == "":
		return null
	if not ResourceLoader.exists(path, "Script"):
		return null
	return ResourceLoader.load(path, "Script") as Script


func _attach_altar_effect(model: Node) -> void:
	if model == null or not (model is Node3D):
		return
	if _altar_effect_script_res == null:
		_altar_effect_script_res = _load_script_resource("res://scripts/altar_effect.gd")
	if _altar_effect_script_res != null:
		(model as Node3D).set_script(_altar_effect_script_res)


func _attach_building_defense_script(node: Node3D, building_type: String) -> void:
	if node == null:
		return
	if building_type == "turret":
		if _turret_script_res == null:
			_turret_script_res = _load_script_resource("res://scripts/turret.gd")
		if _turret_script_res:
			node.set_script(_turret_script_res)
	elif building_type == "cannon":
		if _cannon_script_res == null:
			_cannon_script_res = _load_script_resource("res://scripts/cannon.gd")
		if _cannon_script_res:
			node.set_script(_cannon_script_res)
	elif building_type == "mage_tower":
		if _mage_tower_script_res == null:
			_mage_tower_script_res = _load_script_resource("res://scripts/tower_mage.gd")
		if _mage_tower_script_res:
			node.set_script(_mage_tower_script_res)
	elif building_type == "mortar":
		if _mortar_script_res == null:
			_mortar_script_res = _load_script_resource("res://scripts/tower_mortar.gd")
		if _mortar_script_res:
			node.set_script(_mortar_script_res)
	elif building_type == "harpoon":
		if _harpoon_script_res == null:
			_harpoon_script_res = _load_script_resource("res://scripts/tower_harpoon.gd")
		if _harpoon_script_res:
			node.set_script(_harpoon_script_res)
	elif building_type == "shark_trap":
		if _shark_trap_script_res == null:
			_shark_trap_script_res = _load_script_resource("res://scripts/shark_trap.gd")
		if _shark_trap_script_res:
			node.set_script(_shark_trap_script_res)

# ── Ship node cache ───────────────────────────────────────────
@warning_ignore("unused_private_class_variable")
var _water_y: float = 0.0
@warning_ignore("unused_private_class_variable")
var _saved_ship_transforms: Array = []
@warning_ignore("unused_private_class_variable")
var _saved_port_ships: Array = []
@warning_ignore("unused_private_class_variable")
var _home_troops: Array = []
var _initial_load_done: bool = false
var _idle_combat_warmup_request_started: bool = false
var _idle_combat_warmup_loadout_fetch_in_flight: bool = false
var _idle_combat_warmup_completed: bool = false
var _idle_combat_warmup_fetch_attempt: int = 0
var _has_applied_buildings_state: bool = false
var _last_applied_buildings_signature: String = ""
var _last_applied_buildings_ticks: int = 0
const DUPLICATE_BUILDING_STATE_SKIP_MS: int = 2500

# ── AABB Cache for precise outlines ──────────────────────────
var _building_aabb_cache: Dictionary = {}  # {building_id: {size: Vector2, center: Vector2}}
static var _shared_building_aabb_cache: Dictionary = {}
static var _building_aabb_precompute_done: bool = false

# ── UI ────────────────────────────────────────────────────────
var canvas: CanvasLayer
var world_ui_canvas: CanvasLayer
@warning_ignore("unused_private_class_variable")
var _react_resource_positions: Dictionary = {}  # {gold: {x, y}, wood: {x, y}, ore: {x, y}}
var build_button: Button
var attack_button: Button
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
var building_panel_altar_skills: VBoxContainer

# Lv3 costs stay under the TH5 75K storage cap; see design/gdd/economy-balance.md section 5.3.
const ALTAR_SKILL_DEFS: Dictionary = {
	"prosperity": {
		"name": "Prosperity",
		"title": "Resource Blessing",
		"bonus_label": "gold, wood, and ore gains",
		"bonuses": [10, 20, 30],
		"costs": [
			{"wood": 10000, "ore": 10000, "gold": 2500},
			{"wood": 30000, "ore": 30000, "gold": 7500},
			{"wood": 70000, "ore": 70000, "gold": 20000},
		],
	},
	"ward": {
		"name": "Ward",
		"title": "Stone Ward",
		"bonus_label": "defense HP and damage",
		"bonuses": [5, 10, 15],
		"costs": [
			{"wood": 15000, "ore": 8000, "gold": 2500},
			{"wood": 45000, "ore": 25000, "gold": 7500},
			{"wood": 70000, "ore": 60000, "gold": 20000},
		],
	},
	"glory": {
		"name": "Glory",
		"title": "Cup Offering",
		"bonus_label": "bonus trophies on attack win",
		"bonus_format": "flat",
		"bonuses": [5, 7, 10],
		"costs": [
			{"wood": 12000, "ore": 12000, "gold": 3000},
			{"wood": 36000, "ore": 36000, "gold": 9000},
			{"wood": 70000, "ore": 70000, "gold": 24000},
		],
	},
}
const ALTAR_SKILL_ORDER: Array[String] = ["prosperity", "ward", "glory"]
var altar_skill_levels: Dictionary = {"prosperity": 0, "ward": 0, "glory": 0}

# ── Registration UI ──────────────────────────────────────────
var register_panel: PanelContainer
var register_name_input: LineEdit
var register_status_label: Label
var player_name_label: Label
var trophy_label: Label

# ── Enemy attack state (proxied to _battle helper) ──────────
var is_viewing_enemy: bool:
	get: return _battle.is_viewing_enemy if _battle else false
	set(v):
		if _battle: _battle.is_viewing_enemy = v
var _server_busy: bool = false
var enemy_info: Dictionary:
	get: return _battle.enemy_info if _battle else {}
	set(v):
		if _battle: _battle.enemy_info = v
@warning_ignore("unused_private_class_variable")
var _battle_replay: Array:
	get: return _battle._battle_replay if _battle else []
	set(v):
		if _battle: _battle._battle_replay = v
@warning_ignore("unused_private_class_variable")
var _battle_start_time: float:
	get: return _battle._battle_start_time if _battle else 0.0
	set(v):
		if _battle: _battle._battle_start_time = v
var find_button: Button


func get_battle_elapsed_sec() -> float:
	return _battle._battle_elapsed_sec() if _battle else 0.0

# ── Replay playback (proxied to _battle helper) ──────────────
var _replay_active: bool:
	get: return _battle._replay_active if _battle else false
	set(v):
		if _battle:
			_battle._replay_active = v
		BaseTroop.invalidate_replay_telemetry_sink_cache()


func has_active_replay_telemetry_sink() -> bool:
	return _battle != null and _battle._replay_active

func record_replay_telemetry(kind: String, data: Dictionary = {}) -> void:
	if _battle and _battle._replay_active:
		_battle.record_replay_telemetry(kind, data)
		return
	var systems: Array = _building_systems
	if systems.is_empty() and is_inside_tree():
		systems = get_tree().get_nodes_in_group("building_systems")
	for bs_node in systems:
		if not is_instance_valid(bs_node) or bs_node == self:
			continue
		var battle_helper: BSBattle = bs_node.get("_battle")
		if battle_helper and battle_helper._replay_active:
			battle_helper.record_replay_telemetry(kind, data)
			return


func _authoritative_live_battle_helper() -> BSBattle:
	var systems: Array = _building_systems
	if systems.is_empty() and is_inside_tree():
		systems = get_tree().get_nodes_in_group("building_systems")
	var fallback: BSBattle = null
	for bs_node in systems:
		if not is_instance_valid(bs_node):
			continue
		var battle_helper: BSBattle = bs_node.get("_battle")
		if battle_helper == null or battle_helper._replay_active or not battle_helper.is_viewing_enemy:
			continue
		if fallback == null:
			fallback = battle_helper
		# Only the UI/main grid owns the live match lifecycle and final
		# /attack/result submission. Routing every death to this one helper
		# prevents separate island-grid ledgers from diverging.
		if bool(bs_node.get("create_ui")):
			return battle_helper
	return fallback


func record_troop_death_once(troop_name: String, troop_instance: int = 0, replay_order: int = -1) -> bool:
	var battle_helper: BSBattle = _authoritative_live_battle_helper()
	if battle_helper == null:
		return false
	return battle_helper.record_troop_death_once(troop_name, troop_instance, replay_order)

# ── Ship cannon (proxied to _cannon helper) ──────────────────
var _ship_cannon_mode: bool:
	get: return _cannon._ship_cannon_mode if _cannon else false
	set(v):
		if _cannon: _cannon._ship_cannon_mode = v

# ── Ship rally pointer (proxied to _rally helper) ────────────
var _ship_rally_mode: bool:
	get: return _rally._rally_mode if _rally else false
	set(v):
		if _rally: _rally._rally_mode = v

# Main Ship healing field (proxied to _medkit helper).
var _ship_medkit_mode: bool:
	get: return _medkit._medkit_mode if _medkit else false
	set(v):
		if _medkit: _medkit._medkit_mode = v

var _ship_freeze_mode: bool:
	get: return _freeze._freeze_mode if _freeze else false
	set(v):
		if _freeze: _freeze._freeze_mode = v

var _ship_rage_mode: bool:
	get: return _rage._rage_mode if _rage else false
	set(v):
		if _rage: _rage._rage_mode = v

var _ship_skeleton_barrel_mode: bool:
	get: return _skeleton_barrel._barrel_mode if _skeleton_barrel else false
	set(v):
		if _skeleton_barrel: _skeleton_barrel._barrel_mode = v

# ── Port / Ships ─────────────────────────────────────────────
var port_panel: PanelContainer
var port_vbox: VBoxContainer
var port_ship_count_label: Label
var owned_ships: int = 0
const SHIP_MODELS: Array[String] = [
	"res://Model/Ship/Ships/ship-pirate-small_1.glb",
	"res://Model/Ship/Ships/ship-pirate-medium_2.glb",
	"res://Model/Ship/Ships/ship-pirate-large_3.glb",
]
const SHIP_DISPLAY_SCALE: float = 0.05

# ── Barn troop panel ──────────────────────────────────────────
var barn_panel: PanelContainer
var barn_vbox: VBoxContainer
var troop_levels: Dictionary = {
	"Knight": 1, "Mage": 1, "Archer": 1, "PeaShooter": 1, "Mimic": 1, "Necromancer": 1,
	"Horror": 1, "MechanicalDragon": 1, "IceGolem": 1, "WindMage": 1,
	"DemonKing": 1, "FireDragon": 1,
}
var troop_defs: Dictionary = {
	"Knight": {
		"display": "Knight (Tank)",
		"model": "res://Model/Characters/pirate_knight/pirate_knight.tscn",
		"script": "res://scripts/knight.gd",
		"slot_cost": 1,
		"buy_cost": 100,
		"max_level": 7,
		"costs": {
			1: {"gold": 150, "ore": 125},
			2: {"gold": 300, "ore": 250},
			3: {"gold": 600, "ore": 500},
			4: {"gold": 1200, "ore": 1000},
			5: {"gold": 2200, "ore": 1800},
			6: {"gold": 3800, "ore": 3200},
		}
	},
	"Mage": {
		"display": "Wizard (Burst Mage)",
		"model": "res://Model/Characters/pirate_mage/pirate_mage.tscn",
		"script": "res://scripts/mage.gd",
		"min_town_hall_level": 3,
		"slot_cost": 6,
		"buy_cost": 600,
		"max_level": 7,
		"costs": {
			1: {"gold": 250, "ore": 250},
			2: {"gold": 500, "ore": 500},
			3: {"gold": 1000, "ore": 1000},
			4: {"gold": 2000, "ore": 2000},
			5: {"gold": 3600, "ore": 3600},
			6: {"gold": 6000, "ore": 6000},
		}
	},
	"Archer": {
		"display": "Archer (Sniper)",
		"model": "res://Model/Characters/pirate_archer/pirate_archer.tscn",
		"script": "res://scripts/archer.gd",
		"slot_cost": 1,
		"buy_cost": 100,
		"max_level": 7,
		"costs": {
			1: {"gold": 175, "wood": 175},
			2: {"gold": 350, "wood": 350},
			3: {"gold": 700, "wood": 700},
			4: {"gold": 1400, "wood": 1400},
			5: {"gold": 2600, "wood": 2600},
			6: {"gold": 4400, "wood": 4400},
		}
	},
	"PeaShooter": {
		"display": "Pea Shooter (Burst)",
		"model": "res://Model/Characters/PeaShooter/PeaShooter.fbx",
		"script": "res://scripts/pea_shooter.gd",
		"min_town_hall_level": 4,
		"slot_cost": 5,
		"buy_cost": 500,
		"max_level": 7,
		"costs": {
			1: {"gold": 300, "wood": 300},
			2: {"gold": 600, "wood": 600},
			3: {"gold": 1200, "wood": 1200},
			4: {"gold": 2400, "wood": 2400},
			5: {"gold": 4200, "wood": 4200},
			6: {"gold": 7000, "wood": 7000},
		}
	},
	"Mimic": {
		"display": "Barrel",
		"model": "res://Model/Characters/MimicBarrel/MimicBarrel.fbx",
		"script": "res://scripts/mimic.gd",
		"min_town_hall_level": 5,
		"slot_cost": 8,
		"buy_cost": 800,
		"max_level": 7,
		"costs": {
			1: {"gold": 175, "wood": 175},
			2: {"gold": 350, "wood": 350},
			3: {"gold": 700, "wood": 700},
			4: {"gold": 1400, "wood": 1400},
			5: {"gold": 2600, "wood": 2600},
			6: {"gold": 4400, "wood": 4400},
		}
	},
	"Necromancer": {
		"display": "Necromancer (Grave Caller)",
		"model": "res://Model/Characters/Necromancer/Necromancer.fbx",
		"script": "res://scripts/necromancer.gd",
		"min_town_hall_level": 7,
		"slot_cost": 18,
		"buy_cost": 1800,
		"max_level": 7,
		"costs": {
			1: {"gold": 250, "ore": 250},
			2: {"gold": 500, "ore": 500},
			3: {"gold": 1000, "ore": 1000},
			4: {"gold": 2000, "ore": 2000},
			5: {"gold": 3600, "ore": 3600},
			6: {"gold": 6000, "ore": 6000},
		}
	},
	"Horror": {
		"display": "Horror (Splits 1-2-4)",
		"model": "res://Model/Characters/HorrorEvolution/horror.fbx",
		"script": "res://scripts/horror_evolution.gd",
		"min_town_hall_level": 10,
		"slot_cost": 22,
		"buy_cost": 2200,
		"max_level": 7,
		"costs": {
			1: {"gold": 375, "ore": 375},
			2: {"gold": 750, "ore": 750},
			3: {"gold": 1500, "ore": 1500},
			4: {"gold": 3000, "ore": 3000},
			5: {"gold": 5400, "ore": 5400},
			6: {"gold": 9000, "ore": 9000},
		}
	},
	"MechanicalDragon": {
		"display": "Mechanical Dragon (Chain Siege)",
		"model": "res://Model/Characters/MechanicalDragon/MechanicalDragon.fbx",
		"script": "res://scripts/mechanical_dragon.gd",
		"min_town_hall_level": 6,
		"slot_cost": 5,
		"buy_cost": 500,
		"max_level": 7,
		"costs": {
			1: {"gold": 500, "ore": 500},
			2: {"gold": 1000, "ore": 1000},
			3: {"gold": 2000, "ore": 2000},
			4: {"gold": 4000, "ore": 4000},
			5: {"gold": 7200, "ore": 7200},
			6: {"gold": 12000, "ore": 12000},
		}
	},
	"IceGolem": {
		"display": "Ice Golem (Defense Breaker)",
		"model": "res://Model/Characters/IceGolem/IceGolem.fbx",
		"script": "res://scripts/ice_golem.gd",
		"min_town_hall_level": 9,
		"slot_cost": 11,
		"buy_cost": 1100,
		"max_level": 7,
		"costs": {
			1: {"gold": 500, "ore": 500},
			2: {"gold": 1000, "ore": 1000},
			3: {"gold": 2000, "ore": 2000},
			4: {"gold": 4000, "ore": 4000},
			5: {"gold": 7200, "ore": 7200},
			6: {"gold": 12000, "ore": 12000},
		}
	},
	"WindMage": {
		"display": "Wind Mage (Gale Caller)",
		"model": "res://Model/Characters/WindMage/WindMage.fbx",
		"script": "res://scripts/wind_mage.gd",
		"min_town_hall_level": 8,
		"slot_cost": 18,
		"buy_cost": 1800,
		"max_level": 7,
		"costs": {
			1: {"gold": 250, "ore": 250},
			2: {"gold": 500, "ore": 500},
			3: {"gold": 1000, "ore": 1000},
			4: {"gold": 2000, "ore": 2000},
			5: {"gold": 3600, "ore": 3600},
			6: {"gold": 6000, "ore": 6000},
		}
	},
	"DemonKing": {
		"display": "Demon King (Heavy Boss)",
		"model": "res://Model/Characters/Model/DemonKing_Body.fbx",
		"script": "res://scripts/demon_king.gd",
		"slot_cost": 6,
		"buy_cost": 0,                 # NFT-backed; loading is free and reusable
		"max_level": 7,
		"costs": {
			1: {"gold": 150, "ore": 125},
			2: {"gold": 300, "ore": 250},
			3: {"gold": 600, "ore": 500},
			4: {"gold": 1200, "ore": 1000},
			5: {"gold": 2200, "ore": 1800},
			6: {"gold": 3800, "ore": 3200},
		}
	},
	"FireDragon": {
		"display": "Fire Dragon (Flying Boss)",
		"model": "res://Model/Characters/FireDragon/FireDragon.tscn",
		"script": "res://scripts/fire_dragon.gd",
		"slot_cost": 11,
		"buy_cost": 0,
		"max_level": 7,
		"costs": {
			1: {"gold": 250, "ore": 250},
			2: {"gold": 500, "ore": 500},
			3: {"gold": 1000, "ore": 1000},
			4: {"gold": 2000, "ore": 2000},
			5: {"gold": 3600, "ore": 3600},
			6: {"gold": 6000, "ore": 6000},
		}
	},
}
const BUY_TROOP_COST: int = 100


# ── Node Cache ────────────────────────────────────────────────
var _net: Node = null
var _bridge: Node = null
var _building_systems: Array = []
var _cannon: BSCannon
var _rally: BSRally
var _medkit: BSMedkit
var _freeze: BSFreezeSpell
var _rage: BSRageSpell
var _skeleton_barrel: BSSkeletonBarrel
var _battle: BSBattle
var _port: BSPort
var _production: BSProduction


func _refresh_bs_cache() -> void:
	_building_systems = get_tree().get_nodes_in_group("building_systems")


func _register_test_only_buildings() -> void:
	if building_defs.has("mortar"):
		return
	building_defs["mortar"] = {
		"name": "Mortar",
		"cells": Vector2i(2, 2),
		"footprint_extra": 0.45,
		"color": Color(0.6, 0.36, 0.18, 0.5),
		"height": 0.45,
		"scene": "res://Model/Mortar/mortar_lvl1.fbx",
		"scenes": [
			"res://Model/Mortar/mortar_lvl1.fbx",
			"res://Model/Mortar/mortar_lvl2.fbx",
			"res://Model/Mortar/mortar_lvl3.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
			"res://Model/Mortar/mortar_lvl4.fbx",
		],
		"model_scale": 0.032,
		"model_rotation_y": 0.0,
		"hp_levels": [1700, 2400, 3200, 4100, 4580, 5324, 6019],
		"damage_levels": [95, 108, 158, 227, 233, 240, 294],
		"range_levels": [1.433, 1.600, 1.767, 1.933, 2.100, 2.250, 2.400],
		"min_range_levels": [0.70, 0.75, 0.80, 0.82, 0.82, 0.80, 0.78],
		"splash_radius_levels": [0.30, 0.34, 0.38, 0.42, 0.45, 0.49, 0.52],
		"reload_levels": [2.40, 2.40, 2.40, 2.40, 2.40, 2.40, 2.40],
		"cost": {"gold": 600, "wood": 900, "ore": 700},
		"altar_ward_bonus": true,
		"test_only": true,
		"hp_bar_height": 0.6,
		"albedo_texture": "res://Model/Mortar/mortar_albedo.png",
		"emission_texture": "res://Model/Mortar/mortar_emit.png",
		"construction_scenes": [
			"res://Model/Mortar/mortar_lvl1_construction.fbx",
			"res://Model/Mortar/mortar_lvl2_construction.fbx",
			"res://Model/Mortar/mortar_lvl3_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
			"res://Model/Mortar/mortar_lvl4_construction.fbx",
		],
		"projectile_scenes": [
			"res://Model/Mortar/mortar_lvl1_projectile.fbx",
			"res://Model/Mortar/mortar_lvl2_projectile.fbx",
			"res://Model/Mortar/mortar_lvl3_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
			"res://Model/Mortar/mortar_lvl4_projectile.fbx",
		],
		"test_damage": 294,
		"test_damage_levels": [95, 108, 158, 227, 233, 240, 294],
		"test_range": 2.40,
		"test_reload_sec": 2.40,
	}


func _exit_tree() -> void:
	if _cannon:
		_cannon.dispose()
	if _skeleton_barrel:
		_skeleton_barrel.dispose()


func _ready() -> void:
	WebLoadLogger.report("building_system_ready_start", {"node": name, "create_ui": create_ui})
	add_to_group("building_systems")
	_net = get_node_or_null("/root/Net")
	_bridge = get_node_or_null("/root/Bridge")
	if test_mode:
		_net = null  # Local-only: bypass all server gating
		resources = {"wood": 9_999_999, "gold": 9_999_999, "ore": 9_999_999}
		_register_test_only_buildings()
	_cannon = BSCannon.new().init(self)
	_rally = BSRally.new().init(self)
	_medkit = BSMedkit.new().init(self)
	_freeze = BSFreezeSpell.new().init(self)
	_rage = BSRageSpell.new().init(self)
	_skeleton_barrel = BSSkeletonBarrel.new().init(self)
	_battle = BSBattle.new().init(self)
	_port = BSPort.new().init(self)
	_production = BSProduction.new().init(self)
	WebLoadLogger.report("building_system_helpers_ready", {"node": name, "create_ui": create_ui})
	call_deferred("_refresh_bs_cache")
	grid.resize(grid_width * grid_height)
	grid.fill(false)
	_setup_from_grid_plane()
	WebLoadLogger.report("building_system_grid_ready", {"node": name, "create_ui": create_ui})
	_report_web_loading_progress(73, "building_system_ready")
	# Precise outline AABBs are expensive on Web because they instantiate many
	# GLB/FBX resources. Build them lazily when an outline is actually needed so
	# first paint is not blocked by every possible building level.
	# Cover the main UI grid before first render; secondary grids reuse the
	# same scene state and must not create duplicate loading phases.
	if create_ui:
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
		_create_barn_panel()
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
	if create_ui:
		call_deferred("_request_idle_combat_warmup")
	# Only the main UI grid owns auto-login. Secondary grids listen to the same
	# auth_ok state and load their own grid slice without issuing duplicate
	# /state requests.
	if create_ui and net and net.has_token():
		_auto_login()
	elif create_ui:
		# No login will happen — reveal cloud cover so the island is visible
		call_deferred("_reveal_initial_cover")


var _bs_frame: int = 0
var _produce_timer: float = 0.0
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
	# Defensive: on some script-reload / hot-reload paths the RefCounted
	# helpers can be freed before `_process` stops firing, producing
	# "Nonexistent function on Nil" errors. A single-frame bail is cheaper
	# than wrapping every call site.
	if _cannon == null or _battle == null or _production == null:
		return
	# Resource production tick
	if not is_viewing_enemy:
		_produce_timer += delta
		if _produce_timer >= PRODUCE_TICK:
			_produce_timer -= PRODUCE_TICK
			_production._tick_production()
		_production._update_collect_icons()


func _physics_process(delta: float) -> void:
	if _cannon == null or _battle == null:
		return
	# Both live attacks and deterministic replay playback advance combat on
	# fixed physics ticks. UI, resource production, and cosmetic animation
	# remain in `_process`, but no result-affecting timer depends on render FPS.
	var combat_step: float = (
		BaseTroop.combat_delta(delta)
		if _replay_active
		else delta
	)
	_cannon.process(combat_step)
	if _rally:
		_rally.process(combat_step)
	if _medkit:
		_medkit.process(combat_step)
	if _freeze:
		_freeze.process(combat_step)
	if _rage:
		_rage.process(combat_step)
	if _skeleton_barrel:
		_skeleton_barrel.process(combat_step)
	_battle.check_defeat(combat_step)
	_battle.check_skeleton_respawn(combat_step)


func _tick_production() -> void:
	_production._tick_production()


func _update_collect_icons() -> void:
	_production._update_collect_icons()


const COLLECT_ICON_TEXTURES = {
	"ore": "res://Model/Resources/stone_bar.png",
	"wood": "res://Model/Resources/wood_bar.png",
	"gold": "res://Model/Resources/gold_bar.png",
}

func _create_collect_icon(b: Dictionary, building_node: Node3D, def: Dictionary) -> Control:
	return _production._create_collect_icon(b, building_node, def)


func _click_collect_icon(btn: Control, b: Dictionary, res_type: String) -> void:
	_production._click_collect_icon(btn, b, res_type)

func _spawn_collection_flying_icon(start_pos: Vector2, res_type: String) -> void:
	_production._spawn_collection_flying_icon(start_pos, res_type)


func _collect_and_animate(b: Dictionary, res_type: String) -> void:
	_production._collect_and_animate(b, res_type)


func _find_building_by_server_id(server_id: int) -> Dictionary:
	for b in placed_buildings:
		if int(b.get("server_id", -1)) == server_id:
			return b
	return {}


func _collect_building_resource(server_id: int) -> void:
	var b: Dictionary = _find_building_by_server_id(server_id)
	if b.is_empty():
		return
	var def: Dictionary = building_defs.get(b.get("id", ""), {})
	if not def.has("produces"):
		return
	var icon: Control = b.get("_collect_icon")
	if is_instance_valid(icon):
		_production._click_collect_icon(icon, b, str(def.get("produces", "gold")))
	else:
		_production._collect_and_animate(b, str(def.get("produces", "gold")))


func _apply_agent_place_building(payload: Dictionary) -> void:
	var building: Dictionary = payload.get("building", payload)
	if int(building.get("grid_index", 0)) != _get_grid_index():
		return
	var sid: int = int(building.get("id", -1))
	if sid >= 0 and not _find_building_by_server_id(sid).is_empty():
		if payload.has("resources"):
			_apply_resources_from_server(payload.resources)
		return
	var building_id: String = str(building.get("type", ""))
	if not building_defs.has(building_id):
		return
	var gp := Vector2i(int(building.get("grid_x", 0)), int(building.get("grid_z", 0)))
	_spawn_building_locally(building_id, gp, building_defs[building_id], sid)
	var b: Dictionary = _find_building_by_server_id(sid)
	if not b.is_empty():
		b["level"] = int(building.get("level", b.get("level", 1)))
		b["hp"] = int(building.get("hp", b.get("hp", 1)))
		b["max_hp"] = int(building.get("max_hp", b.get("max_hp", b.get("hp", 1))))
		if building_id == "port" and int(building.get("has_ship", 0)) == 1:
			var pnode: Node3D = b.get("node", null)
			if is_instance_valid(pnode):
				pnode.set_meta("has_ship", true)
				pnode.set_meta("ship_level", clampi(int(b.get("level", 1)), 1, MAX_PORT_SHIP_LEVEL))
				pnode.set_meta("ship_troops", building.get("ship_troops", []))
				_port._spawn_port_ship(b)
	if payload.has("resources"):
		_apply_resources_from_server(payload.resources)
	_sync_react_buildings()


func _apply_agent_upgrade_building(payload: Dictionary) -> void:
	var sid: int = int(payload.get("building_id", payload.get("id", -1)))
	var b: Dictionary = _find_building_by_server_id(sid)
	if b.is_empty() or not building_defs.has(b.get("id", "")):
		return
	if payload.has("resources"):
		_apply_resources_from_server(payload.resources)
	var target_level: int = int(payload.get("level", b.get("level", 1) + 1))
	if int(b.get("level", 1)) >= target_level:
		return
	b["is_upgrading"] = true
	_run_upgrade_sequence(b, building_defs[b.id], target_level)


func _apply_agent_collect_resources(payload: Dictionary) -> void:
	if payload.has("results") and payload.results is Array:
		for row in payload.results:
			if row is Dictionary:
				_apply_agent_collect_resources(row)
		return
	var sid: int = int(payload.get("building_id", payload.get("id", -1)))
	var result: Dictionary = payload.get("result", payload)
	if result.has("error"):
		return
	var b: Dictionary = _find_building_by_server_id(sid)
	if b.is_empty():
		return
	_production._animate_agent_collection(b, result)


func _apply_agent_buy_ship(payload: Dictionary) -> void:
	var sid: int = int(payload.get("port_id", payload.get("building_id", -1)))
	var b: Dictionary = _find_building_by_server_id(sid)
	if b.is_empty() or b.get("id") != "port":
		return
	if payload.has("resources"):
		_apply_resources_from_server(payload.resources)
	var pnode: Node3D = b.get("node", null)
	if not is_instance_valid(pnode):
		return
	if not pnode.has_meta("has_ship"):
		pnode.set_meta("has_ship", true)
		pnode.set_meta("ship_level", clampi(int(b.get("level", 1)), 1, MAX_PORT_SHIP_LEVEL))
		pnode.set_meta("ship_troops", payload.get("ship_troops", []))
		owned_ships += 1
		if _port:
			_port.owned_ships += 1
		_port._spawn_port_ship(b)
	_refresh_port_panel()
	_emit_ship_update(b)


func _apply_agent_ship_troops(payload: Dictionary) -> void:
	var sid: int = int(payload.get("port_id", payload.get("building_id", payload.get("id", -1))))
	var b: Dictionary = _find_building_by_server_id(sid)
	if b.is_empty() or b.get("id") != "port":
		return
	if payload.has("resources"):
		_apply_resources_from_server(payload.resources)
	var pnode: Node3D = b.get("node", null)
	if not is_instance_valid(pnode):
		return
	if payload.has("ship_troops"):
		pnode.set_meta("ship_troops", payload.ship_troops)
	if payload.has("ship_level"):
		pnode.set_meta("ship_level", clampi(int(payload.ship_level), 1, MAX_PORT_SHIP_LEVEL))
	elif not pnode.has_meta("ship_level"):
		pnode.set_meta("ship_level", clampi(int(b.get("level", 1)), 1, MAX_PORT_SHIP_LEVEL))
	if not pnode.has_meta("has_ship"):
		pnode.set_meta("has_ship", true)
		_port._spawn_port_ship(b)
	_refresh_port_panel()
	_emit_ship_update(b)


func _apply_agent_reinforce_ships(payload: Dictionary) -> void:
	if payload.has("resources"):
		_apply_resources_from_server(payload.resources)
	if not payload.has("ships") or not (payload.ships is Array):
		return
	for ship_data in payload.ships:
		if ship_data is Dictionary:
			_apply_agent_ship_troops(ship_data)
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("reinforced", {"cost": payload.get("cost", 0), "restored": payload.get("restored", 0)})


func _apply_agent_upgrade_troop(payload: Dictionary) -> void:
	var raw_type: String = str(payload.get("troop_type", ""))
	if raw_type == "":
		return
	var local_name: String = raw_type.capitalize()
	for troop_name in troop_levels.keys():
		if str(troop_name).to_lower() == raw_type.to_lower():
			local_name = str(troop_name)
			break
	troop_levels[local_name] = int(payload.get("level", troop_levels.get(local_name, 1)))
	if payload.has("resources"):
		_apply_resources_from_server(payload.resources)
	_refresh_barn_panel()
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("troop_levels", troop_levels)


func _apply_agent_move_building(payload: Dictionary) -> void:
	var sid: int = int(payload.get("building_id", payload.get("id", -1)))
	var b: Dictionary = _find_building_by_server_id(sid)
	if b.is_empty() or int(payload.get("grid_index", _get_grid_index())) != _get_grid_index():
		return
	var def: Dictionary = building_defs.get(b.get("id", ""), {})
	if def.is_empty() or not is_instance_valid(b.get("node", null)):
		return
	var old_gp: Vector2i = b.get("grid_pos", Vector2i.ZERO)
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var old_idx: int = (old_gp.y + z) * grid_width + (old_gp.x + x)
			if old_idx >= 0 and old_idx < grid.size():
				grid[old_idx] = false
	var new_gp := Vector2i(int(payload.get("grid_x", old_gp.x)), int(payload.get("grid_z", old_gp.y)))
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var idx: int = (new_gp.y + z) * grid_width + (new_gp.x + x)
			if idx >= 0 and idx < grid.size():
				grid[idx] = true
	b["grid_pos"] = new_gp
	var sx = def.cells.x * cell_size
	var sz = def.cells.y * cell_size
	var local_pos = _grid_to_local(new_gp)
	local_pos.x += sx / 2.0
	local_pos.z += sz / 2.0
	local_pos.y = 0
	create_tween().tween_property(b.node, "position", local_pos, 0.35).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	_sync_react_buildings()
	if selected_building == b:
		_select_building(b)


func _apply_agent_remove_building(payload: Dictionary) -> void:
	var sid: int = int(payload.get("building_id", payload.get("removed", -1)))
	var b: Dictionary = _find_building_by_server_id(sid)
	if b.is_empty():
		return
	_remove_building_local_only(b)


func _remove_building_local_only(b: Dictionary) -> void:
	var idx: int = placed_buildings.find(b)
	if idx < 0:
		return
	var def: Dictionary = building_defs.get(b.get("id", ""), {})
	var gp: Vector2i = b.get("grid_pos", Vector2i.ZERO)
	if not def.is_empty():
		for x in range(def.cells.x):
			for z in range(def.cells.y):
				var cell_idx: int = (gp.y + z) * grid_width + (gp.x + x)
				if cell_idx >= 0 and cell_idx < grid.size():
					grid[cell_idx] = false
	if b.get("id") == "tombstone":
		_remove_tombstone_skeletons(b)
	if b.get("id") == "port":
		var pnode: Node3D = b.get("node", null)
		if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
			var ship: Node3D = pnode.get_meta("ship_node")
			if is_instance_valid(ship):
				_sink_ship(ship)
	if b.has("hp_bar") and is_instance_valid(b.hp_bar):
		b.hp_bar.queue_free()
	var icon: Control = b.get("_collect_icon")
	if is_instance_valid(icon):
		icon.queue_free()
	if is_instance_valid(b.get("node", null)):
		explode_building_with_swell(b.node, b.get("id", ""))
	placed_buildings.remove_at(idx)
	if selected_building == b:
		_deselect_building()
	_sync_react_buildings()


func _emit_ship_update(b: Dictionary) -> void:
	var pnode: Node3D = b.get("node", null)
	if not is_instance_valid(pnode):
		return
	var ship_level: int = clampi(int(pnode.get_meta("ship_level", b.get("level", 1))), 1, MAX_PORT_SHIP_LEVEL)
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("ship_updated", {
			"ship_level": ship_level,
			"ship_troops": pnode.get_meta("ship_troops", []),
			"ship_capacity": ship_level * 3,
		})



func _get_all_mesh_instances(node: Node) -> Array:
	var result := []
	if node is MeshInstance3D:
		result.append(node)
	for child in node.get_children():
		result.append_array(_get_all_mesh_instances(child))
	return result


func _apply_cel_shader(_node: Node) -> void:
	# Disabled to prevent unwanted white/red highlights
	# from the cel shader on the original textures.
	return


## Applies a StandardMaterial3D albedo (+ optional emission) to every
## MeshInstance3D in [param model] when [param def] declares "albedo_texture".
## Used for FBX models that ship without embedded textures (e.g. the TARBO
## MageTower). No-op for GLB buildings whose textures are baked in.
func _apply_building_albedo(model: Node, def: Dictionary) -> void:
	var albedo_path: String = def.get("albedo_texture", "")
	if albedo_path == "" or model == null:
		return
	var albedo_tex: Texture2D = load(albedo_path)
	if albedo_tex == null:
		return
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = albedo_tex
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST  # polyart palette look
	var emit_path: String = def.get("emission_texture", "")
	if emit_path != "":
		var emit_tex: Texture2D = load(emit_path)
		if emit_tex:
			mat.emission_enabled = true
			mat.emission_texture = emit_tex
			mat.emission_energy_multiplier = 1.2
	_assign_albedo_recursive(model, mat)


func _apply_archer_tower_level_visuals(model: Node, level: int) -> void:
	if model == null:
		return
	var show_mannequin: bool = level >= 5
	var show_target: bool = level >= 4
	_set_archer_tower_extra_visible(model, show_mannequin, ["RootNode", "Dummy.002"], ["Leather"])
	_set_archer_tower_extra_visible(model, show_target, ["RootNode.001", "Cylinder.003"], ["White", "Celing"])


func _set_archer_tower_extra_visible(root: Node, should_be_visible: bool, node_names: Array[String], material_markers: Array[String]) -> void:
	if root == null:
		return
	if root is Node3D:
		var node_3d := root as Node3D
		if node_names.has(str(root.name)) or _mesh_uses_material_marker(root, material_markers):
			node_3d.visible = should_be_visible
	for child in root.get_children():
		_set_archer_tower_extra_visible(child, should_be_visible, node_names, material_markers)


func _mesh_uses_material_marker(node: Node, markers: Array[String]) -> bool:
	if markers.is_empty() or not (node is MeshInstance3D):
		return false
	var mesh_inst := node as MeshInstance3D
	var mesh: Mesh = mesh_inst.mesh
	if mesh == null:
		return false
	for surface_idx in mesh.get_surface_count():
		var mat: Material = mesh_inst.get_surface_override_material(surface_idx)
		if mat == null:
			mat = mesh.surface_get_material(surface_idx)
		if mat == null:
			continue
		var mat_name := str(mat.resource_name)
		for marker in markers:
			if mat_name.findn(marker) != -1:
				return true
	return false


func _assign_albedo_recursive(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		var mi: MeshInstance3D = node as MeshInstance3D
		var count: int = mi.mesh.get_surface_count() if mi.mesh else 0
		for i in count:
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_assign_albedo_recursive(child, mat)


func _town_hall_flag_absolute_url(raw_url: String) -> String:
	var url := raw_url.strip_edges()
	if url == "":
		return ""
	if url.begins_with("http://") or url.begins_with("https://"):
		return url
	if url.begins_with("/") and ClassDB.class_exists("JavaScriptBridge"):
		var origin = JavaScriptBridge.eval("window.location.origin", true)
		if origin != null and str(origin) != "":
			return str(origin) + url
	return url


func _is_town_hall_flag_surface(mesh_inst: MeshInstance3D, surface_idx: int) -> bool:
	if mesh_inst == null:
		return false
	if str(mesh_inst.name).findn("flag") != -1:
		return true
	var mesh: Mesh = mesh_inst.mesh
	if mesh == null:
		return false
	var mat: Material = mesh_inst.get_surface_override_material(surface_idx)
	if mat == null:
		mat = mesh.surface_get_material(surface_idx)
	if mat == null:
		return false
	if str(mat.resource_name).findn("flag") != -1:
		return true
	if mat is StandardMaterial3D:
		var tex: Texture2D = (mat as StandardMaterial3D).albedo_texture
		if tex != null and str(tex.resource_path).findn("flag") != -1:
			return true
	return false


func _apply_town_hall_flag_material_recursive(node: Node, texture: Texture2D) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var mesh: Mesh = mi.mesh
		var count: int = mesh.get_surface_count() if mesh else 0
		for i in count:
			if not _is_town_hall_flag_surface(mi, i):
				continue
			var src_mat: Material = mi.get_surface_override_material(i)
			if src_mat == null:
				src_mat = mesh.surface_get_material(i)
			var mat: StandardMaterial3D = null
			if src_mat is StandardMaterial3D:
				mat = (src_mat as StandardMaterial3D).duplicate(true) as StandardMaterial3D
			if mat == null:
				mat = StandardMaterial3D.new()
			mat.resource_local_to_scene = true
			mat.albedo_color = Color.WHITE
			mat.albedo_texture = texture
			mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS
			mi.set_surface_override_material(i, mat)
	for child in node.get_children():
		_apply_town_hall_flag_material_recursive(child, texture)


func _clear_town_hall_flag_material_recursive(node: Node) -> void:
	if node is MeshInstance3D:
		var mi := node as MeshInstance3D
		var mesh: Mesh = mi.mesh
		var count: int = mesh.get_surface_count() if mesh else 0
		for i in count:
			if _is_town_hall_flag_surface(mi, i):
				mi.set_surface_override_material(i, null)
	for child in node.get_children():
		_clear_town_hall_flag_material_recursive(child)


func _decode_town_hall_flag_texture(body: PackedByteArray, url: String) -> Texture2D:
	var image := Image.new()
	var err := image.load_png_from_buffer(body)
	if err != OK:
		err = image.load_jpg_from_buffer(body)
	if err != OK:
		err = image.load_webp_from_buffer(body)
	if err != OK:
		push_warning("Town Hall flag image decode failed for %s" % url)
		return null
	var texture := ImageTexture.create_from_image(image)
	return texture


func _finish_town_hall_flag_request(url: String, texture: Texture2D) -> void:
	_town_hall_flag_pending_requests.erase(url)
	if texture != null:
		_town_hall_flag_texture_cache[url] = texture
	var models: Array = _town_hall_flag_pending_models.get(url, [])
	_town_hall_flag_pending_models.erase(url)
	var ship_controllers: Array = _town_hall_flag_pending_ship_controllers.get(url, [])
	_town_hall_flag_pending_ship_controllers.erase(url)
	if texture == null:
		return
	for model in models:
		if is_instance_valid(model):
			_apply_town_hall_flag_material_recursive(model, texture)
	for controller in ship_controllers:
		if is_instance_valid(controller) and controller.has_method("apply_player_flag_texture"):
			controller.apply_player_flag_texture(url, texture)


func _request_town_hall_flag_texture(url: String) -> void:
	if _town_hall_flag_pending_requests.has(url):
		return
	_town_hall_flag_pending_requests[url] = true
	var http := HTTPRequest.new()
	http.timeout = 8.0
	add_child(http)
	var request_url := _town_hall_flag_absolute_url(url)
	http.request_completed.connect(func(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
		if is_instance_valid(http):
			http.queue_free()
		if result != HTTPRequest.RESULT_SUCCESS or response_code < 200 or response_code >= 300:
			_schedule_town_hall_flag_retry(url, request_url, result, response_code)
			return
		_town_hall_flag_retry_counts.erase(url)
		_finish_town_hall_flag_request(url, _decode_town_hall_flag_texture(body, request_url))
	)
	var err := http.request(request_url)
	if err != OK:
		http.queue_free()
		_schedule_town_hall_flag_retry(url, request_url, HTTPRequest.RESULT_REQUEST_FAILED, err)


func _schedule_town_hall_flag_retry(url: String, request_url: String, result: int, response_code: int) -> void:
	var retry_count := int(_town_hall_flag_retry_counts.get(url, 0))
	if retry_count >= TOWN_HALL_FLAG_MAX_RETRIES:
		_town_hall_flag_retry_counts.erase(url)
		push_warning("Town Hall flag request failed %s result=%s status=%s attempts=%s" % [
			request_url,
			result,
			response_code,
			retry_count + 1,
		])
		_finish_town_hall_flag_request(url, null)
		return
	_town_hall_flag_retry_counts[url] = retry_count + 1
	_town_hall_flag_pending_requests.erase(url)
	var delay_seconds := TOWN_HALL_FLAG_RETRY_DELAY_SECONDS * float(retry_count + 1)
	get_tree().create_timer(delay_seconds).timeout.connect(func() -> void:
		var has_pending_targets := (
			_town_hall_flag_pending_models.has(url)
			or _town_hall_flag_pending_ship_controllers.has(url)
		)
		if has_pending_targets and not _town_hall_flag_pending_requests.has(url):
			_request_town_hall_flag_texture(url)
	)


func _apply_town_hall_flag_url(model: Node, raw_url: String) -> void:
	var url := str(raw_url).strip_edges()
	if model == null:
		return
	if url == "":
		# Imported Town Hall models use a white placeholder for the flag.
		# Standard means the same Clash flag shown on the main ship.
		_apply_town_hall_flag_material_recursive(model, DEFAULT_TOWN_HALL_FLAG_TEXTURE)
		return
	var cached: Texture2D = _town_hall_flag_texture_cache.get(url, null)
	if cached != null:
		_apply_town_hall_flag_material_recursive(model, cached)
		return
	var models: Array = _town_hall_flag_pending_models.get(url, [])
	models.append(model)
	_town_hall_flag_pending_models[url] = models
	_request_town_hall_flag_texture(url)


func _apply_town_hall_flag_to_building_data(building: Dictionary) -> void:
	if building.get("id", "") != "town_hall":
		return
	var node: Node3D = building.get("node", null)
	if not is_instance_valid(node):
		return
	var has_explicit_flag_key := building.has("town_hall_flag_url") or building.has("flag_url")
	var url := str(building.get("town_hall_flag_url", building.get("flag_url", ""))).strip_edges()
	if url == "" and not has_explicit_flag_key and node.has_meta("town_hall_flag_url"):
		url = str(node.get_meta("town_hall_flag_url", ""))
	var model := _get_building_visual_model(node)
	if is_instance_valid(model):
		_apply_town_hall_flag_url(model, url)


func _player_flag_url_from_server_state(state: Dictionary) -> String:
	var flag_value: Variant = state.get("town_hall_flag", null)
	if flag_value is Dictionary:
		return str((flag_value as Dictionary).get("image_url", "")).strip_edges()
	var buildings_value: Variant = state.get("buildings", [])
	if buildings_value is Array:
		for building_value in buildings_value:
			if not (building_value is Dictionary):
				continue
			var building := building_value as Dictionary
			if str(building.get("id", building.get("type", ""))) != "town_hall":
				continue
			return str(building.get("town_hall_flag_url", building.get("flag_url", ""))).strip_edges()
	return ""


func _apply_main_ship_flag_url(raw_url: String, remember_as_home: bool = false) -> void:
	var url := raw_url.strip_edges()
	if remember_as_home:
		_home_player_flag_url = url
	var controller: Node = get_node_or_null("../MainShipController")
	if not is_instance_valid(controller) or not controller.has_method("set_player_flag_url"):
		return
	controller.set_player_flag_url(url)
	if url == "":
		return
	var cached: Texture2D = _town_hall_flag_texture_cache.get(url, null)
	if cached != null:
		controller.apply_player_flag_texture(url, cached)
		return
	var controllers: Array = _town_hall_flag_pending_ship_controllers.get(url, [])
	if not controllers.has(controller):
		controllers.append(controller)
	_town_hall_flag_pending_ship_controllers[url] = controllers
	_request_town_hall_flag_texture(url)


func _restore_home_player_flag() -> void:
	_apply_main_ship_flag_url(_home_player_flag_url, false)


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
	if test_mode:
		_fps_lbl.set_anchors_preset(Control.PRESET_TOP_RIGHT)
		_fps_lbl.offset_left = -170
		_fps_lbl.offset_right = -14
		_fps_lbl.offset_top = 14
		_fps_lbl.offset_bottom = 54
		_fps_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	else:
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
		if def.get("no_shop", false):
			continue
		# test_only buildings (e.g. Mage Tower) appear in the shop only on the
		# sandbox scene where test_mode is enabled.
		if def.get("test_only", false) and not test_mode:
			continue
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

	building_panel_altar_skills = VBoxContainer.new()
	building_panel_altar_skills.visible = false
	building_panel_altar_skills.add_theme_constant_override("separation", 8)
	building_panel_altar_skills.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bp_vbox.add_child(building_panel_altar_skills)


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
	if not btn.pressed.is_connected(_play_ui_click_sfx):
		btn.pressed.connect(_play_ui_click_sfx)


func _play_ui_click_sfx() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_ui_click"):
		audio.play_ui_click()


func _play_troop_level_up_sfx() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_troop_level_up"):
		audio.play_troop_level_up()


func _play_building_level_up_sfx() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_building_level_up"):
		audio.play_building_level_up()


func _play_building_destruction_sfx() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_building_destruction"):
		audio.play_building_destruction()


func _play_building_move_sfx() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_building_move"):
		audio.play_building_move()


func _play_building_grid_step_sfx() -> void:
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_building_grid_step"):
		audio.play_building_grid_step()


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


func _block_without_server(action_label: String = "this action") -> bool:
	if test_mode:
		return false
	var net = _net
	if net and net.has_token():
		return false
	var message := "Login is still loading. Try again in a moment before trying to %s." % action_label
	_show_error(message)
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("error", {"message": message})
	return true


func _update_resource_ui() -> void:
	if is_instance_valid(wood_label):
		wood_label.text = str(resources.wood)
	if is_instance_valid(gold_label):
		gold_label.text = str(resources.gold)
	if is_instance_valid(ore_label):
		ore_label.text = str(resources.ore)
	# Send to React
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("resources", {
			"gold": resources.gold, "wood": resources.wood, "ore": resources.ore,
		})


func _on_add_resource(res_name: String) -> void:
	var net = _net
	if test_mode:
		resources[res_name] += 1000
		_update_resource_ui()
	elif net and net.has_token():
		var bridge = _bridge
		if bridge:
			bridge.send_to_react("shop_toggled", {"open": true, "reason": "resource_topup"})
			bridge.send_to_react("resource_topup_required", {"resource": res_name})
		return
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
	if test_mode:
		return  # Sandbox: no login required
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
		# Token invalid — reveal clouds and show register screen.
		# Also persist the cleared state so we don't retry the same bad token
		# on every page reload (otherwise a deleted account's token permanently
		# yields /state 401 → looks like the game is broken).
		net.token = ""
		net.player_id = ""
		net.display_name = ""
		net.wallet = ""
		net._save_token()
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
func _report_web_loading_progress(progress: int, phase: String, meta: Dictionary = {}) -> void:
	if not OS.has_feature("web"):
		return
	if not create_ui:
		return
	var payload := meta.duplicate()
	payload["node"] = name
	payload["grid_index"] = _get_grid_index()
	payload["create_ui"] = create_ui
	payload["ticks_ms"] = Time.get_ticks_msec()
	JavaScriptBridge.eval(
		"if(window.godotLoadingProgress) window.godotLoadingProgress(%d, %s, %s);" %
		[progress, JSON.stringify(phase), JSON.stringify(payload)]
	)


func _initial_cover() -> void:
	_report_web_loading_progress(74, "scene_init_start")
	_get_or_create_cloud()
	_report_web_loading_progress(75, "scene_init_cloud_ready")


## Tell the HTML page to hide its loading screen — safe to call multiple times.
## On web: keeps the native loading screen visible until buildings are placed.
func _reveal_initial_cover() -> void:
	if not create_ui or _initial_load_done:
		return
	_initial_load_done = true
	var audio = get_node_or_null("/root/AudioManager")
	if audio and audio.has_method("play_base"):
		audio.play_base()
	if OS.has_feature("web"):
		_report_web_loading_progress(100, "ready")
		JavaScriptBridge.eval("if(window.godotBuildingsLoaded) window.godotBuildingsLoaded();")


func _request_idle_combat_warmup() -> void:
	if _idle_combat_warmup_completed or _idle_combat_warmup_loadout_fetch_in_flight:
		return
	var warmup_script: Script = load("res://scripts/warmup.gd")
	if not _idle_combat_warmup_request_started:
		_idle_combat_warmup_request_started = true
		if warmup_script != null and warmup_script.has_method("begin_combat_idle_warmup_request"):
			warmup_script.begin_combat_idle_warmup_request(self)
	var ship: Dictionary = {}
	if test_mode:
		ship = _test_player_ship_snapshot()
	else:
		var net: Node = _net
		if net == null or not net.has_token():
			WebLoadLogger.report("combat_idle_warmup_waiting_for_session")
			return
		_idle_combat_warmup_loadout_fetch_in_flight = true
		var result: Dictionary = await net.get_player_ship()
		if not is_instance_valid(self):
			return
		_idle_combat_warmup_loadout_fetch_in_flight = false
		if result.has("error"):
			_idle_combat_warmup_fetch_attempt += 1
			var error_text := str(result.get("error", "unknown error"))
			if _idle_combat_warmup_fetch_attempt >= 5:
				push_warning(
					"Combat idle warmup loadout unavailable after retries; "
					+ "continuing with generic effects: %s" % error_text
				)
				_finish_idle_combat_warmup_request(warmup_script, {})
				return
			WebLoadLogger.report("combat_idle_warmup_loadout_retry", {
				"attempt": _idle_combat_warmup_fetch_attempt,
				"error": error_text,
			})
			await get_tree().create_timer(1.5).timeout
			if is_instance_valid(self):
				call_deferred("_request_idle_combat_warmup")
			return
		var ship_value: Variant = result.get("ship", result)
		if ship_value is Dictionary:
			ship = ship_value
	_idle_combat_warmup_fetch_attempt = 0
	_finish_idle_combat_warmup_request(warmup_script, ship)


func _finish_idle_combat_warmup_request(warmup_script: Script, ship: Dictionary) -> void:
	if _idle_combat_warmup_completed:
		return
	_idle_combat_warmup_completed = true
	if not is_instance_valid(self):
		return
	var troop_names: Array = []
	if not ship.is_empty():
		_apply_main_ship_state_from_server(ship)
		if _skeleton_barrel:
			_skeleton_barrel.prepare_pool(
				clampi(int(ship.get("level", ship.get("ship_level", 1))), 1, MAX_PLAYER_SHIP_LEVEL)
			)
		var troops_value: Variant = ship.get("troops", ship.get("ship_troops", []))
		if troops_value is Array:
			troop_names = troops_value
	if warmup_script != null and warmup_script.has_method("request_combat_idle_warmup"):
		warmup_script.request_combat_idle_warmup(self, troop_names)


func _apply_server_state(state: Dictionary) -> void:
	_set_shop_unlocks(state)
	_apply_resources_from_server(state)
	_apply_main_ship_flag_url(_player_flag_url_from_server_state(state), true)
	if state.has("altar_skills") and state.altar_skills is Dictionary:
		_load_altar_skill_levels_from_server(state.altar_skills)
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


func _server_buildings_signature(server_buildings: Array) -> String:
	var net = _net
	var player_key := ""
	if net:
		player_key = "%s:%s" % [str(net.player_id), str(net.wallet)]
	var my_grid_index = _get_grid_index()
	var parts: Array = []
	for b in server_buildings:
		if int(b.get("grid_index", 0)) != my_grid_index:
			continue
		parts.append("%s:%s:%s:%s:%s:%s:%s:%s:%s:%s:%s:%s" % [
			str(b.get("id", "")),
			str(b.get("type", "")),
			str(b.get("level", 1)),
			str(b.get("grid_x", 0)),
			str(b.get("grid_z", 0)),
			str(b.get("hp", "")),
			str(b.get("max_hp", "")),
			str(b.get("stored", "")),
			str(b.get("has_ship", "")),
			str(b.get("ship_troops", "")),
			str(b.get("grid_index", 0)),
			str(b.get("town_hall_flag_url", b.get("flag_url", ""))),
		])
	parts.sort()
	return "%s|%s" % [player_key, "|".join(PackedStringArray(parts))]


func _load_buildings_from_server(server_buildings: Array) -> void:
	var state_signature := _server_buildings_signature(server_buildings)
	var now := Time.get_ticks_msec()
	if _has_applied_buildings_state \
			and state_signature == _last_applied_buildings_signature \
			and now - _last_applied_buildings_ticks < DUPLICATE_BUILDING_STATE_SKIP_MS:
		return
	_has_applied_buildings_state = true
	_last_applied_buildings_signature = state_signature
	_last_applied_buildings_ticks = now
	# Signal React: server responded, now placing buildings (loading stage 94%)
	_report_web_loading_progress(92, "home_scene_apply", {"server_buildings": server_buildings.size()})
	var my_grid_index = _get_grid_index()
	# Filter buildings for this grid
	var my_buildings: Array = []
	for b in server_buildings:
		if b.get("grid_index", 0) == my_grid_index:
			my_buildings.append(b)
	_report_web_loading_progress(93, "home_scene_filtered", {"grid_buildings": my_buildings.size()})
	# Reset the ships counter before walking the new account's buildings.
	# Without this, logging out of Alice (3 ports with ships → owned_ships=3)
	# and back in as Bob (1 port with ship) would leave owned_ships=4 because
	# the loop INCREMENTS rather than rebuilding the count.
	owned_ships = 0
	if _port:
		_port.owned_ships = 0
	# Always clear existing buildings first (even if no new ones to load)
	_destroy_all_buildings()
	if my_buildings.is_empty():
		BaseTroop.invalidate_combat_lists()
		# Push the empty state to React so `placed_counts` resets to {}.
		# Without this, an account switch (logout → login as a new user with
		# 0 buildings) would leave React holding the PREVIOUS account's
		# placed_counts, and the shop UI would falsely show "1/1 Max built"
		# for Mine/Sawmill/TownHall on a brand-new empty island because the
		# early return below skipped the sync. Only the main grid needs to
		# push — BS2/BS3 share React state via the same send_to_react.
		if create_ui:
			_sync_react_buildings()
			_report_web_loading_progress(97, "home_ready", {"grid_buildings": 0})
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
		if building_type == "port":
			level = clampi(level, 1, MAX_PORT_SHIP_LEVEL)
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
		node.set_meta("building_type", building_type)
		node.set_meta("server_id", server_id)
		
		# Add base shadow/outline (using precise AABB) — skip for no_outline buildings
		if not def.get("no_outline", false):
			var cache_key = _aabb_cache_key(building_type, level)
			var base = _create_building_base(def, cache_key)
			node.add_child(base)
		
		_attach_building_defense_script(node, building_type)
		if scene_path != "":
			var scene_res = _scene_res_cache.get(scene_path, null)
			if scene_res == null:
				scene_res = _get_packed_scene_resource(scene_path)
			if scene_res:
				var model = scene_res.instantiate()
				var s = _get_model_scale(def, level)
				model.scale = Vector3(s, s, s)
				model.set_meta("building_visual_model", true)
				model.rotation_degrees.y = _get_model_rotation_y(def)
				var offsets = def.get("model_offsets", [])
				if offsets.size() >= level:
					model.position = offsets[level - 1]
				else:
					model.position = def.get("model_offset", Vector3.ZERO)
				# Mine cart loop — only the mine has minecart/iron/reyki nodes.
				# Other buildings reuse the same instantiation block, so gate
				# on building_type to avoid attaching the script everywhere.
				if building_type == "mine":
					var mine_cart_script := _load_script_resource("res://scripts/mine_cart.gd")
					if mine_cart_script != null:
						model.set_script(mine_cart_script)
				elif building_type == "altar":
					_attach_altar_effect(model)
				node.add_child(model)
				_apply_cel_shader(model)
				_apply_building_albedo(model, def)
				if building_type == "town_hall":
					_apply_town_hall_flag_url(model, str(b.get("town_hall_flag_url", b.get("flag_url", ""))))
				if building_type == "archer_tower":
					_apply_archer_tower_level_visuals(model, level)
				_apply_web_render_profile(model, scene_path, level)

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
		var stored: float = 0.0
		if b.has("stored"):
			stored = maxf(0.0, float(b.get("stored", 0.0)))

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
			"stored": stored,
			"town_hall_flag_url": str(b.get("town_hall_flag_url", b.get("flag_url", ""))),
		}
		if node and b_data.town_hall_flag_url != "":
			node.set_meta("town_hall_flag_url", b_data.town_hall_flag_url)
		placed_buildings.append(b_data)
		_apply_building_runtime_level(b_data)
		# Spawn tower unit (archer on top)
		if def.has("tower_unit"):
			_spawn_tower_unit(b_data, def)
		# Tombstone → spawn skeleton guards
		if building_type == "tombstone":
			_spawn_tombstone_skeletons(b_data, level)
		# Port with ship → restore docked ship and loaded troops
		if building_type == "port" and b.get("has_ship", 0) == 1:
			_spawn_port_ship(b_data)
			owned_ships += 1
			# Restore ship_troops from server — unconditional so empty arrays
			# correctly clear stale meta from previous sessions.
			var server_troops = b.get("ship_troops", [])
			if server_troops is String:
				var json = JSON.new()
				if json.parse(server_troops) == OK and json.data is Array:
					server_troops = json.data
				else:
					server_troops = []
			if is_instance_valid(b_data.get("node")):
				b_data.node.set_meta("ship_troops", server_troops)
	BaseTroop.invalidate_combat_lists()
	_sync_react_buildings()
	_report_web_loading_progress(95, "home_scene_models_done", {"grid_buildings": my_buildings.size()})
	_report_web_loading_progress(97, "home_ready", {"grid_buildings": my_buildings.size()})
	# Reveal cloud cover now that buildings are placed — first load only
	_reveal_initial_cover()


func _sync_react_buildings() -> void:
	_refresh_port_number_labels()
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
					"server_id": b.get("server_id", ""),
					"town_hall_flag_url": b.get("town_hall_flag_url", "")
				})
				counts[bid] = counts.get(bid, 0) + 1
		bridge.send_to_react("state", {"buildings": arr})
		bridge.send_to_react("placed_counts", counts)
		_send_resource_caps()
		# Send TH progression info
		var th_lvl: int = _get_th_level()
		var max_counts: Dictionary = {}
		for key in TH_MAX_COUNT:
			var limits: Array = TH_MAX_COUNT[key]
			var idx: int = clampi(th_lvl - 1, 0, limits.size() - 1)
			max_counts[key] = limits[idx]
		# Calculate TH upgrade progress from the exact same complete-village
		# requirements as the upgrade button. Each required slot and level is a step.
		var total_req: int = 0
		var done_req: int = 0
		for requirement_value in _get_th_upgrade_requirements(th_lvl):
			var requirement: Dictionary = requirement_value
			var btype: String = str(requirement.get("type", ""))
			var max_at_th: int = int(requirement.get("count", 0))
			var max_level_for_type: int = int(requirement.get("level", 1))
			# Each slot × each reachable level = steps. Some TH4 unlocks, like
			# Mage Tower, intentionally do not upgrade to TH4.
			for slot_i in max_at_th:
				for lvl_i in range(1, max_level_for_type + 1):
					total_req += 1
			# Count what player actually has
			var placed_of_type: Array = []
			for bs2 in _building_systems:
				for b2 in bs2.placed_buildings:
					if b2.get("id", "") == btype:
						placed_of_type.append(b2.get("level", 1))
			placed_of_type.sort()
			placed_of_type.reverse()
			for slot_i in max_at_th:
				var blvl: int = placed_of_type[slot_i] if slot_i < placed_of_type.size() else 0
				for lvl_i in range(1, max_level_for_type + 1):
					if blvl >= lvl_i:
						done_req += 1
		bridge.send_to_react("th_info", {"level": th_lvl, "unlock": TH_UNLOCK, "max_counts": max_counts, "progress": done_req, "progress_total": total_req})


func _set_player_town_hall_flag(raw_url: String) -> void:
	var url := str(raw_url).strip_edges()
	_apply_main_ship_flag_url(url, true)
	var changed := false
	for bs in _building_systems:
		if not is_instance_valid(bs):
			continue
		for b in bs.placed_buildings:
			if b.get("id", "") != "town_hall":
				continue
			b["town_hall_flag_url"] = url
			b["flag_url"] = url
			var node: Node3D = b.get("node", null)
			if is_instance_valid(node):
				if url == "":
					if node.has_meta("town_hall_flag_url"):
						node.remove_meta("town_hall_flag_url")
				else:
					node.set_meta("town_hall_flag_url", url)
			bs._apply_town_hall_flag_to_building_data(b)
			changed = true
	if changed:
		_sync_react_buildings()
		if selected_building.get("id", "") == "town_hall":
			selected_building["town_hall_flag_url"] = url
			_select_building(selected_building)

func _port_number_sort(a: Dictionary, b: Dictionary) -> bool:
	var ai: int = int(a.get("grid_index", 0))
	var bi: int = int(b.get("grid_index", 0))
	if ai != bi:
		return ai < bi
	var agp: Vector2i = a.get("grid_pos", Vector2i.ZERO)
	var bgp: Vector2i = b.get("grid_pos", Vector2i.ZERO)
	if agp.x != bgp.x:
		return agp.x < bgp.x
	if agp.y != bgp.y:
		return agp.y < bgp.y
	return int(a.get("server_id", -1)) < int(b.get("server_id", -1))


func _collect_port_number_entries() -> Array:
	var entries: Array = []
	for bs_node in _building_systems:
		for b in bs_node.placed_buildings:
			if b.get("id", "") != "port":
				continue
			var pnode: Node3D = b.get("node", null)
			if not is_instance_valid(pnode):
				continue
			entries.append({
				"building": b,
				"node": pnode,
				"grid_index": int(bs_node._get_grid_index()),
				"grid_pos": b.get("grid_pos", Vector2i.ZERO),
				"server_id": int(b.get("server_id", -1)),
			})
	entries.sort_custom(Callable(self, "_port_number_sort"))
	return entries


func _clear_port_number_labels() -> void:
	for bs_node in _building_systems:
		for b in bs_node.placed_buildings:
			if b.get("id", "") != "port":
				continue
			var pnode: Node3D = b.get("node", null)
			if not is_instance_valid(pnode):
				continue
			var label: Label3D = pnode.get_node_or_null("PortNumberLabel") as Label3D
			if label != null:
				label.queue_free()
			if pnode.has_meta("port_number"):
				pnode.remove_meta("port_number")


func _refresh_port_number_labels() -> void:
	if is_viewing_enemy:
		_clear_port_number_labels()
		return
	var entries: Array = _collect_port_number_entries()
	for i in entries.size():
		var entry: Dictionary = entries[i]
		var node: Node3D = entry.get("node", null)
		if not is_instance_valid(node):
			continue
		var port_number: int = i + 1
		node.set_meta("port_number", port_number)
		var label: Label3D = node.get_node_or_null("PortNumberLabel") as Label3D
		if label == null:
			label = Label3D.new()
			label.name = "PortNumberLabel"
			label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			label.no_depth_test = true
			label.render_priority = 12
			label.outline_modulate = Color(0.08, 0.04, 0.02, 1.0)
			label.modulate = Color(1.0, 0.92, 0.35, 1.0)
			node.add_child(label)
		label.outline_size = 3
		label.font_size = 14
		label.position = Vector3(0.0, 0.42, 0.0)
		label.text = "P%d" % port_number


func _port_display_number_for_building(target: Dictionary) -> int:
	var target_node: Node3D = target.get("node", null)
	if not is_instance_valid(target_node):
		return 0
	var entries: Array = _collect_port_number_entries()
	for i in entries.size():
		if entries[i].get("node", null) == target_node:
			return i + 1
	return int(target_node.get_meta("port_number", 0))

func _local_troop_name_from_server(troop_type: String) -> String:
	match troop_type:
		"barbarian":
			return "Barbarian"
		"ranger":
			return "Ranger"
		"demon_king", "demonking":
			return "DemonKing"
		"fire_dragon", "firedragon":
			return "FireDragon"
		"mechanical_dragon", "mechanicaldragon", "mechdragon":
			return "MechanicalDragon"
		"ice_golem", "icegolem":
			return "IceGolem"
		"wind_mage", "windmage":
			return "WindMage"
		"pea_shooter", "peashooter", "pea-shooter":
			return "PeaShooter"
		"necromancer", "skeleton_mage", "skeletonmage":
			return "Necromancer"
		"horror", "horror_evolution", "horrorevolution":
			return "Horror"
	return troop_type.capitalize()


func _troop_entry_base_name(troop_name: String) -> String:
	var base: String = str(troop_name).split(":")[0]
	match base.to_lower():
		"demon_king", "demonking":
			return "DemonKing"
		"fire_dragon", "firedragon":
			return "FireDragon"
		"mechanical_dragon", "mechanicaldragon", "mechdragon":
			return "MechanicalDragon"
		"ice_golem", "icegolem":
			return "IceGolem"
		"wind_mage", "windmage":
			return "WindMage"
		"pea_shooter", "peashooter", "pea-shooter":
			return "PeaShooter"
		"necromancer", "skeleton_mage", "skeletonmage":
			return "Necromancer"
		"horror", "horror_evolution", "horrorevolution":
			return "Horror"
		"knight":
			return "Knight"
		"mage":
			return "Mage"
		"barbarian":
			return "Barbarian"
		"archer":
			return "Archer"
		"ranger":
			return "Ranger"
	return base


func _load_troop_levels_from_server(server_troops: Array) -> void:
	# Reset every known troop to level 1 BEFORE applying server values. This
	# partial-update loop only overwrites keys present in the server payload —
	# on account switch any troop type the new account hasn't interacted with
	# would otherwise keep the previous account's level (e.g. Alice had
	# Knight=3, Bob fresh has Knight=1 but server omits row → stays at 3).
	for key in troop_levels.keys():
		troop_levels[key] = 1
	for t in server_troops:
		var troop_type: String = t.get("troop_type", "")
		var level: int = t.get("level", 1)
		var local_name = _local_troop_name_from_server(troop_type)
		if troop_levels.has(local_name):
			troop_levels[local_name] = level
			# Apply to troop node
			var troop = get_tree().current_scene.find_child(local_name, true, false)
			if troop and troop.has_method("upgrade_to"):
				troop.upgrade_to(level)


func _on_server_auth_ok(player_data: Dictionary) -> void:
	# Reset per-account battle/cannon state BEFORE loading new buildings so
	# an account switch (logout → login as different user) can't leave the
	# new player mid-battle, viewing a stale enemy, or with an exhausted
	# cannon from the previous session. Guard the helpers in case the node
	# is still mid-construction when auth races in.
	if _cannon and _cannon.has_method("reset"):
		_cannon.reset()
	if _rally and _rally.has_method("reset"):
		_rally.reset()
	if _medkit and _medkit.has_method("reset"):
		_medkit.reset()
	if _freeze and _freeze.has_method("reset"):
		_freeze.reset()
	if _rage and _rage.has_method("reset"):
		_rage.reset()
	if _skeleton_barrel and _skeleton_barrel.has_method("reset"):
		_skeleton_barrel.reset()
	if _battle and _battle.has_method("reset"):
		_battle.reset()
	# Apply full state from server (resources, buildings, troops)
	_set_shop_unlocks(player_data)
	if player_data.has("gold"):
		resources.gold = player_data.gold
	if player_data.has("wood"):
		resources.wood = player_data.wood
	if player_data.has("ore"):
		resources.ore = player_data.ore
	_update_resource_ui()
	_apply_main_ship_flag_url(_player_flag_url_from_server_state(player_data), true)
	if player_data.has("altar_skills") and player_data.altar_skills is Dictionary:
		_load_altar_skill_levels_from_server(player_data.altar_skills)
	if player_data.has("buildings") and player_data.buildings is Array:
		_load_buildings_from_server(player_data.buildings)
	if player_data.has("troop_levels") and player_data.troop_levels is Array:
		_load_troop_levels_from_server(player_data.troop_levels)
	_update_player_name_label()
	if create_ui and _idle_combat_warmup_request_started and not _idle_combat_warmup_completed:
		call_deferred("_request_idle_combat_warmup")


func _load_altar_skill_levels_from_server(levels: Dictionary) -> void:
	for skill_id in ALTAR_SKILL_ORDER:
		altar_skill_levels[skill_id] = clampi(int(levels.get(skill_id, 0)), 0, 3)
	_apply_altar_bonuses_to_buildings()


func _get_altar_skill_bonus_pct(skill_id: String) -> int:
	var def: Dictionary = ALTAR_SKILL_DEFS.get(skill_id, {})
	var level: int = clampi(int(altar_skill_levels.get(skill_id, 0)), 0, int(def.get("bonuses", []).size()))
	if level <= 0:
		return 0
	return int(def.get("bonuses", [])[level - 1])


func _apply_altar_bonuses_to_buildings() -> void:
	for b in placed_buildings:
		var def: Dictionary = building_defs.get(b.get("id", ""), {})
		if not bool(def.get("altar_ward_bonus", false)):
			continue
		var old_max: int = maxi(1, int(b.get("max_hp", _get_hp_for(def, int(b.get("level", 1))))))
		var old_hp: int = maxi(0, int(b.get("hp", old_max)))
		var new_max: int = _get_hp_for(def, int(b.get("level", 1)))
		var ratio: float = 1.0 if old_hp >= old_max else clampf(float(old_hp) / float(old_max), 0.0, 1.0)
		b["max_hp"] = new_max
		b["hp"] = new_max if ratio >= 0.999 else maxi(1, roundi(float(new_max) * ratio))
		_apply_building_runtime_level(b)


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
	if plane and plane.name == "shipPlane":
		return 2
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
	if not test_mode and building_id != "town_hall" and not _has_town_hall():
		_show_error("Build Town Hall first!")
		return
	if not _is_building_unlocked(building_id):
		var unlock_at: int = int(TH_UNLOCK.get(building_id, 1))
		_show_error("%s unlocks at Town Hall level %d" % [building_defs.get(building_id, {}).get("name", building_id), unlock_at])
		return
	if not _has_required_purchase(building_id):
		_show_error("%s requires an on-chain purchase first" % [building_defs.get(building_id, {}).get("name", building_id)])
		return
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


## Shared ghost material — one StandardMaterial3D instance across every
## placement preview. Previously re-allocated per ghost (which meant first
## placement compiled its pipeline variant cold on WASM).
static var _shared_ghost_material: StandardMaterial3D = null
static var _shared_grid_material: StandardMaterial3D = null

static func _get_ghost_material() -> StandardMaterial3D:
	if _shared_ghost_material == null:
		_shared_ghost_material = StandardMaterial3D.new()
		_shared_ghost_material.albedo_color = Color(0, 0.8, 0, 0.4)
		_shared_ghost_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_shared_ghost_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_shared_ghost_material.no_depth_test = true
	return _shared_ghost_material


static func _get_grid_material() -> StandardMaterial3D:
	if _shared_grid_material == null:
		_shared_grid_material = StandardMaterial3D.new()
		_shared_grid_material.albedo_color = Color(0, 0, 0, 0.25)
		_shared_grid_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_shared_grid_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_shared_grid_material.no_depth_test = false
	return _shared_grid_material


## Shared upgrade outline shader + material. `material_overlay` on a mesh
## triggers a SECOND render pass with a distinct pipeline variant — caching
## the whole thing means the compile happens once (warmup) not per upgrade.
static var _upgrade_outline_shader: Shader = null
static var _upgrade_outline_material: ShaderMaterial = null

static func _get_upgrade_outline_material() -> ShaderMaterial:
	if _upgrade_outline_material != null:
		return _upgrade_outline_material
	if _upgrade_outline_shader == null:
		_upgrade_outline_shader = load("res://shaders/upgrade_outline.gdshader")
	if _upgrade_outline_shader == null:
		return null
	_upgrade_outline_material = ShaderMaterial.new()
	_upgrade_outline_material.shader = _upgrade_outline_shader
	_upgrade_outline_material.set_shader_parameter("outline_color", Color(0.1, 0.6, 1.0, 1.0))
	_upgrade_outline_material.set_shader_parameter("outline_width", 0.035)
	return _upgrade_outline_material


func _create_ghost() -> void:
	var def = building_defs[current_building_id]

	ghost_material = _get_ghost_material()

	ghost = _create_box_placeholder(def)
	# Add base outline to ghost (using precise AABB) — skip for no_outline buildings
	if not def.get("no_outline", false):
		var ghost_base = _create_building_base(def, current_building_id)
		ghost_base.material_override = ghost_material
		ghost.add_child(ghost_base)

	# Add model inside ghost — prefer preloaded scene cache over a fresh load.
	if def.has("scene"):
		var scene_res: Resource = _scene_res_cache.get(def.scene, null)
		if scene_res == null:
			scene_res = _get_packed_scene_resource(def.scene)
		if scene_res:
			var model = scene_res.instantiate()
			var s = def.get("model_scale", 0.2)
			model.scale = Vector3(s, s, s)
			model.rotation_degrees.y = _get_model_rotation_y(def)
			ghost.add_child(model)
			_apply_cel_shader(model)
			_apply_building_albedo(model, def)
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

	var scene_res = _scene_res_cache.get(scene_path, null)
	if scene_res == null:
		scene_res = _get_packed_scene_resource(scene_path)
	if not scene_res:
		var sx = def.cells.x * cell_size
		var sz = def.cells.y * cell_size
		return {"size": Vector2(sx, sz), "center": Vector2.ZERO}

	var model = scene_res.instantiate()
	var s = _get_model_scale(def, level)
	model.scale = Vector3(s, s, s)
	model.rotation_degrees.y = _get_model_rotation_y(def)
	var offsets = def.get("model_offsets", [])
	if offsets.size() >= level:
		model.position = offsets[level - 1]
	else:
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
	if _building_aabb_precompute_done:
		_building_aabb_cache = _shared_building_aabb_cache
		return

	for id in building_defs:
		var def = building_defs[id]
		# Level 1
		_building_aabb_cache[id] = _compute_model_aabb(def, 1)
		var max_lvl: int = def.get("hp_levels", [1]).size()
		# Higher levels
		if def.has("scenes"):
			for lvl in range(2, def.scenes.size() + 1):
				var key = _aabb_cache_key(id, lvl)
				_building_aabb_cache[key] = _compute_model_aabb(def, lvl)
		# Buildings with per-level scale need per-level AABBs even if they
		# reuse the same scene. Otherwise outlines keep the level-1 footprint.
		if def.has("model_scales"):
			for lvl in range(2, max_lvl + 1):
				var key = _aabb_cache_key(id, lvl)
				_building_aabb_cache[key] = _compute_model_aabb(def, lvl)
		# Buildings without scenes or per-level scale reuse level 1 AABB.
		for lvl in range(2, max_lvl + 1):
			var key = _aabb_cache_key(id, lvl)
			if not _building_aabb_cache.has(key):
				_building_aabb_cache[key] = _building_aabb_cache[id]

	_shared_building_aabb_cache = _building_aabb_cache
	_building_aabb_precompute_done = true


## Pre-load every building scene into _scene_res_cache so that
## _load_buildings_from_server() never calls load() at transition time.
func _preload_building_scenes() -> void:
	for id in building_defs:
		var def = building_defs[id]
		if def.has("scenes"):
			for path in def.scenes:
				if path != "" and not _scene_res_cache.has(path):
					var res = _get_packed_scene_resource(path)
					if res:
						_scene_res_cache[path] = res
		elif def.has("scene"):
			var path: String = def.scene
			if path != "" and not _scene_res_cache.has(path):
				var res = _get_packed_scene_resource(path)
				if res:
					_scene_res_cache[path] = res
	# Pre-load turret script so set_script() at transition time is instant
	if _turret_script_res == null:
		_turret_script_res = _load_script_resource("res://scripts/turret.gd")
	if _cannon_script_res == null:
		_cannon_script_res = _load_script_resource("res://scripts/cannon.gd")
	if _mage_tower_script_res == null:
		_mage_tower_script_res = _load_script_resource("res://scripts/tower_mage.gd")
	if _mortar_script_res == null:
		_mortar_script_res = _load_script_resource("res://scripts/tower_mortar.gd")
	if _harpoon_script_res == null:
		_harpoon_script_res = _load_script_resource("res://scripts/tower_harpoon.gd")


## Build cache key for a building type at a specific level.
func _aabb_cache_key(building_id: String, level: int) -> String:
	if level <= 1:
		return building_id
	return building_id + "_lv" + str(level)


## Get cached AABB for a building type. Falls back to grid-based if not cached.
func _get_cached_aabb(building_id: String) -> Dictionary:
	if _building_aabb_cache.has(building_id):
		return _building_aabb_cache[building_id]

	var base_id: String = building_id
	var level: int = 1
	var level_marker := "_lv"
	var level_idx := building_id.rfind(level_marker)
	if level_idx > 0:
		base_id = building_id.substr(0, level_idx)
		level = int(building_id.substr(level_idx + level_marker.length()))

	var def = building_defs.get(base_id, {})
	if not def.is_empty():
		var computed := _compute_model_aabb(def, level)
		_building_aabb_cache[building_id] = computed
		_shared_building_aabb_cache[building_id] = computed
		return computed

	var sx = def.get("cells", Vector2i(2, 2)).x * cell_size
	var sz = def.get("cells", Vector2i(2, 2)).y * cell_size
	return {"size": Vector2(sx, sz), "center": Vector2.ZERO}


func _create_building_base(def: Dictionary, building_id: String = "") -> MeshInstance3D:
	var mesh_inst = MeshInstance3D.new()
	mesh_inst.name = "BuildingBase"
	mesh_inst.set_meta("building_base", true)
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
	_attach_building_defense_script(node, current_building_id)
	if def.has("scene"):
		var _scene_path: String = def.scene
		var scene_res = _scene_res_cache.get(_scene_path, null)
		if scene_res == null:
			scene_res = _get_packed_scene_resource(_scene_path)
		if scene_res:
			var model = scene_res.instantiate()
			var s = _get_model_scale(def, 1)
			model.scale = Vector3(s, s, s)
			model.set_meta("building_visual_model", true)
			model.rotation_degrees.y = _get_model_rotation_y(def)
			model.position = def.get("model_offset", Vector3.ZERO)
			if current_building_id == "altar":
				_attach_altar_effect(model)
			node.add_child(model)
			_apply_cel_shader(model)
			_apply_building_albedo(model, def)
			if current_building_id == "archer_tower":
				_apply_archer_tower_level_visuals(model, 1)
			_apply_web_render_profile(model, _scene_path, 1)
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
	# Block all input during replay — view only
	if _replay_active:
		return
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
	if is_viewing_enemy and event is InputEventScreenTouch and event.pressed:
		var touch := event as InputEventScreenTouch
		if _ship_freeze_mode:
			if _drop_tactical_ground_from_screen(touch.position, "freeze"):
				_exit_ship_freeze_mode()
			get_viewport().set_input_as_handled()
			return
		elif _ship_rage_mode:
			if _drop_tactical_ground_from_screen(touch.position, "rage"):
				_exit_ship_rage_mode()
			get_viewport().set_input_as_handled()
			return
		elif _ship_skeleton_barrel_mode:
			var barrel_target: Dictionary = _find_ship_barrel_target_from_screen(
				touch.position
			)
			if (
				not barrel_target.is_empty()
				and _skeleton_barrel
				and _skeleton_barrel.fire_at_target(
					barrel_target.get("building", {}),
					barrel_target.get("position", Vector3.INF)
				)
			):
				_exit_ship_skeleton_barrel_mode()
			get_viewport().set_input_as_handled()
			return
		elif _ship_medkit_mode:
			for medkit_bs in _building_systems:
				var medkit_local_hit: Vector3 = medkit_bs._get_screen_local(touch.position)
				if medkit_local_hit != Vector3.INF:
					var medkit_world_hit: Vector3 = medkit_bs.to_global(medkit_local_hit)
					if _medkit and _medkit._drop_medkit(medkit_world_hit):
						_exit_ship_medkit_mode()
					get_viewport().set_input_as_handled()
					return
			_exit_ship_medkit_mode()
			get_viewport().set_input_as_handled()
			return
		elif _ship_cannon_mode:
			var touch_bdata: Dictionary = _find_ship_cannon_target_from_screen(touch.position)
			if touch_bdata.size() > 0:
				_fire_ship_cannon(touch_bdata)
				get_viewport().set_input_as_handled()
				return
			_exit_ship_cannon_mode()
			get_viewport().set_input_as_handled()
			return
		elif _check_ship_cannon_click(touch.position):
			_enter_ship_cannon_mode()
			get_viewport().set_input_as_handled()
			return

	if is_viewing_enemy and event is InputEventMouseButton and event.pressed:
		if _ship_freeze_mode:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_exit_ship_freeze_mode()
			elif event.button_index == MOUSE_BUTTON_LEFT:
				if _drop_tactical_ground_from_screen(event.position, "freeze"):
					_exit_ship_freeze_mode()
			get_viewport().set_input_as_handled()
			return

		if _ship_rage_mode:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_exit_ship_rage_mode()
			elif event.button_index == MOUSE_BUTTON_LEFT:
				if _drop_tactical_ground_from_screen(event.position, "rage"):
					_exit_ship_rage_mode()
			get_viewport().set_input_as_handled()
			return

		if _ship_skeleton_barrel_mode:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_exit_ship_skeleton_barrel_mode()
			elif event.button_index == MOUSE_BUTTON_LEFT:
				var barrel_target: Dictionary = (
					_find_ship_barrel_target_from_screen(event.position)
				)
				if (
					not barrel_target.is_empty()
					and _skeleton_barrel
					and _skeleton_barrel.fire_at_target(
						barrel_target.get("building", {}),
						barrel_target.get("position", Vector3.INF)
					)
				):
					_exit_ship_skeleton_barrel_mode()
			get_viewport().set_input_as_handled()
			return

		# Medkit placement consumes any ground click before troop deployment.
		if _ship_medkit_mode:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_exit_ship_medkit_mode()
				get_viewport().set_input_as_handled()
				return
			if event.button_index == MOUSE_BUTTON_LEFT:
				for medkit_bs in _building_systems:
					var medkit_local_hit: Vector3 = medkit_bs._get_screen_local(event.position)
					if medkit_local_hit != Vector3.INF:
						var medkit_world_hit: Vector3 = medkit_bs.to_global(medkit_local_hit)
						if _medkit and _medkit._drop_medkit(medkit_world_hit):
							_exit_ship_medkit_mode()
						get_viewport().set_input_as_handled()
						return
				_exit_ship_medkit_mode()
				get_viewport().set_input_as_handled()
				return

		if event.button_index == MOUSE_BUTTON_LEFT:
			if _ship_cannon_mode:
				# Already in cannon mode — try to fire at a building first
				var bdata: Dictionary = _find_ship_cannon_target_from_mouse()
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
			var right_bdata: Dictionary = _find_ship_cannon_target_from_mouse()
			if right_bdata.size() > 0:
				_fire_ship_cannon(right_bdata)
				get_viewport().set_input_as_handled()
				return
			get_viewport().set_input_as_handled()
			return

		# Ship rally mode (enemy island only). Mirrors cannon-mode flow:
		# LMB on the ground drops a rally marker, RMB cancels.
		if is_viewing_enemy and _ship_rally_mode and event is InputEventMouseButton and event.pressed:
			if event.button_index == MOUSE_BUTTON_RIGHT:
				_exit_ship_rally_mode()
				get_viewport().set_input_as_handled()
				return
			if event.button_index == MOUSE_BUTTON_LEFT:
				for bs in _building_systems:
					var local_hit = bs._get_mouse_local()
					if local_hit != Vector3.INF:
						var world_hit: Vector3 = bs.to_global(local_hit)
						# `_drop_rally` returns false if energy < cost — keep mode
						# active so the disabled button reflects state without an
						# accidental exit.
						if _rally and _rally._drop_rally(world_hit):
							_exit_ship_rally_mode()
						get_viewport().set_input_as_handled()
						return
				# No ground hit (clicked off-island) — exit cleanly.
				_exit_ship_rally_mode()
				get_viewport().set_input_as_handled()
				return

	# Click on placed building — disabled during attack mode to prevent misclicks
	if is_viewing_enemy:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# Check ship click FIRST (before buildings) — ship is near port and can overlap
		if not is_viewing_enemy:
			var ship_port = _find_ship_at_click(event.position)
			if ship_port.size() > 0:
				_show_ship_panel(ship_port)
				get_viewport().set_input_as_handled()
				return
		var local_hit = _get_mouse_local()
		if local_hit != Vector3.INF:
			var gp = _local_to_grid(local_hit)
			var found = _find_building_at(gp)
			if found.size() > 0:
				for bs in _building_systems:
					if bs != self:
						bs._deselect_building()
				if selected_building.size() > 0 and found.get("node") == selected_building.get("node") and not is_viewing_enemy:
					_start_move(selected_building)
				else:
					_select_building(found)
				get_viewport().set_input_as_handled()
			else:
				_deselect_building()
				_hide_ship_panel()
		else:
			_deselect_building()
			_hide_ship_panel()


func _get_mouse_local() -> Vector3:
	return _get_screen_local(get_viewport().get_mouse_position())


func _get_screen_local(screen_pos: Vector2) -> Vector3:
	var camera = BaseTroop._get_camera_cached()
	if camera == null:
		return Vector3.INF
	var from = camera.project_ray_origin(screen_pos)
	var dir = camera.project_ray_normal(screen_pos)

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


func _set_grid_occupied(gp: Vector2i, size: Vector2i, occupied: bool) -> void:
	for x in range(size.x):
		for z in range(size.y):
			var cx: int = gp.x + x
			var cz: int = gp.y + z
			if cx < 0 or cx >= grid_width or cz < 0 or cz >= grid_height:
				continue
			var idx: int = cz * grid_width + cx
			if idx >= 0 and idx < grid.size():
				grid[idx] = occupied


func _try_place_building() -> bool:
	if not ghost or not ghost.visible:
		return false
	var def = building_defs[current_building_id]

	if not test_mode and current_building_id != "town_hall" and not _has_town_hall():
		_show_error("Build Town Hall first!")
		return false

	if not _can_place(current_grid_pos, def.cells):
		return false

	# Check max_count limit (e.g. Town Hall = 1) — bypassed in test_mode
	if not test_mode:
		var max_count: int = -1
		if TH_MAX_COUNT.has(current_building_id):
			var limits: Array = TH_MAX_COUNT[current_building_id]
			max_count = int(limits[clampi(_get_th_level() - 1, 0, limits.size() - 1)])
		elif def.has("max_count"):
			max_count = int(def.max_count)
		if max_count >= 0:
			var count: int = 0
			for bs in _building_systems:
				for b in bs.placed_buildings:
					if b.get("id", "") == current_building_id:
						count += 1
			if count >= max_count:
				print("Max %s limit reached (%d)" % [def.name, max_count])
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
		if test_mode:
			_spawn_building_locally(building_id, grid_pos, def, -1)
		else:
			_block_without_server("build")
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
	_set_grid_occupied(grid_pos, def.cells, true)

	# Save current_building_id temporarily for _create_placed_building
	var prev_id = current_building_id
	current_building_id = building_id
	var building = _create_placed_building(def)
	current_building_id = prev_id
	building.set_meta("building_type", building_id)
	building.set_meta("server_id", server_id)

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
		"stored": 0.0,
	}
	placed_buildings.append(b_data)
	_apply_building_runtime_level(b_data)
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
		# Free skeleton guards attached to tombstones
		if b.get("id", "") == "tombstone":
			_remove_tombstone_skeletons(b)
		# Free tower archer units
		if b.has("tower_unit_node") and is_instance_valid(b.get("tower_unit_node")):
			b.tower_unit_node.queue_free()
		# Free port ship nodes (they are separate scene children, not port children)
		if b.get("id") == "port":
			var pnode = b.get("node")
			if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
				var ship = pnode.get_meta("ship_node")
				if is_instance_valid(ship):
					ship.queue_free()
				pnode.remove_meta("ship_node")
		var icon: Control = b.get("_collect_icon")
		if is_instance_valid(icon):
			icon.queue_free()
		if b.has("hp_bar") and is_instance_valid(b.get("hp_bar")):
			b.hp_bar.queue_free()
		if b.node and is_instance_valid(b.node):
			b.node.queue_free()
	placed_buildings.clear()
	grid.fill(false)
	BaseTroop.invalidate_combat_lists()
	# Remove any ruins left over from destroyed buildings
	for child in get_children():
		if child is Node3D and child.has_meta("is_ruins"):
			child.queue_free()


func _show_grid() -> void:
	if grid_visual != null:
		return

	var im = ImmediateMesh.new()
	grid_visual = MeshInstance3D.new()
	grid_visual.mesh = im

	grid_visual.material_override = _get_grid_material()

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


func _is_local_inside_grid(local_pos: Vector3) -> bool:
	return local_pos.x >= -grid_extent_x * 0.5 \
		and local_pos.x <= grid_extent_x * 0.5 \
		and local_pos.z >= -grid_extent_z * 0.5 \
		and local_pos.z <= grid_extent_z * 0.5


func _find_nearest_building_to_local(local_pos: Vector3) -> Dictionary:
	var nearest: Dictionary = {}
	var nearest_dist_sq: float = INF
	for b in placed_buildings:
		if int(b.get("hp", 0)) <= 0:
			continue
		var node: Node3D = b.get("node", null) as Node3D
		if not is_instance_valid(node):
			continue
		var node_local: Vector3 = to_local(node.global_position)
		var dx: float = node_local.x - local_pos.x
		var dz: float = node_local.z - local_pos.z
		var dist_sq: float = dx * dx + dz * dz
		if dist_sq < nearest_dist_sq:
			nearest_dist_sq = dist_sq
			nearest = b
	return nearest


func _find_ship_cannon_target_from_mouse() -> Dictionary:
	return _find_ship_cannon_target_from_screen(get_viewport().get_mouse_position())


func _drop_tactical_ground_from_screen(
	screen_pos: Vector2,
	ability: String
) -> bool:
	for building_system in _building_systems:
		if not is_instance_valid(building_system):
			continue
		var local_hit: Vector3 = building_system._get_screen_local(screen_pos)
		if local_hit == Vector3.INF:
			continue
		var world_hit: Vector3 = building_system.to_global(local_hit)
		match ability:
			"freeze":
				return _freeze != null and _freeze._drop_freeze(world_hit)
			"rage":
				return _rage != null and _rage._drop_rage(world_hit)
	return false


func _find_ship_cannon_target_from_screen(screen_pos: Vector2) -> Dictionary:
	var nearest: Dictionary = {}
	var nearest_dist_sq: float = INF
	for bs_node in _building_systems:
		if not is_instance_valid(bs_node):
			continue
		var local_hit: Vector3 = bs_node._get_screen_local(screen_pos)
		if local_hit == Vector3.INF or not bs_node._is_local_inside_grid(local_hit):
			continue
		var gp: Vector2i = bs_node._local_to_grid(local_hit)
		var direct: Dictionary = bs_node._find_building_at(gp)
		if direct.size() > 0:
			return direct
		var candidate: Dictionary = bs_node._find_nearest_building_to_local(local_hit)
		if candidate.size() == 0:
			continue
		var candidate_node: Node3D = candidate.get("node", null) as Node3D
		if not is_instance_valid(candidate_node):
			continue
		var candidate_local: Vector3 = bs_node.to_local(candidate_node.global_position)
		var dx: float = candidate_local.x - local_hit.x
		var dz: float = candidate_local.z - local_hit.z
		var dist_sq: float = dx * dx + dz * dz
		if dist_sq < nearest_dist_sq:
			nearest_dist_sq = dist_sq
			nearest = candidate
	return nearest


func _find_ship_barrel_target_from_screen(screen_pos: Vector2) -> Dictionary:
	const SNAP_RADIUS_CELLS: float = 1.25
	for bs_node in _building_systems:
		if not is_instance_valid(bs_node):
			continue
		var local_hit: Vector3 = bs_node._get_screen_local(screen_pos)
		if local_hit == Vector3.INF or not bs_node._is_local_inside_grid(local_hit):
			continue
		var world_hit: Vector3 = bs_node.to_global(local_hit)
		var gp: Vector2i = bs_node._local_to_grid(local_hit)
		var direct: Dictionary = bs_node._find_building_at(gp)
		if not direct.is_empty():
			var direct_node := direct.get("node", null) as Node3D
			return {
				"building": direct,
				"position": (
					direct_node.global_position
					if is_instance_valid(direct_node)
					else world_hit
				),
			}

		var candidate: Dictionary = bs_node._find_nearest_building_to_local(local_hit)
		if candidate.is_empty():
			return {"building": {}, "position": world_hit}
		var candidate_node := candidate.get("node", null) as Node3D
		if not is_instance_valid(candidate_node):
			return {"building": {}, "position": world_hit}

		var candidate_local: Vector3 = bs_node.to_local(candidate_node.global_position)
		var candidate_def: Dictionary = bs_node.building_defs.get(
			str(candidate.get("id", "")),
			{}
		)
		var footprint: Vector2i = candidate_def.get("cells", Vector2i.ONE)
		var half_x: float = float(footprint.x) * bs_node.cell_size * 0.5
		var half_z: float = float(footprint.y) * bs_node.cell_size * 0.5
		var edge_dx: float = maxf(absf(candidate_local.x - local_hit.x) - half_x, 0.0)
		var edge_dz: float = maxf(absf(candidate_local.z - local_hit.z) - half_z, 0.0)
		var snap_radius: float = bs_node.cell_size * SNAP_RADIUS_CELLS
		if edge_dx * edge_dx + edge_dz * edge_dz <= snap_radius * snap_radius:
			return {
				"building": candidate,
				"position": candidate_node.global_position,
			}
		return {"building": {}, "position": world_hit}
	return {}

func _select_building(b: Dictionary) -> void:
	_set_mortar_range_visuals_for_selected(false)
	selected_building = b
	var def = building_defs[b.id]
	var level = b.get("level", 1)
	var hp = b.get("hp", _get_hp_for(def, level))
	var max_hp = b.get("max_hp", hp)
	var max_level = def.hp_levels.size() if def.has("hp_levels") else 3
	# Send to React
	var bridge = _bridge
	if bridge:
		var upgrade_cost := {}
		if level < max_level:
			upgrade_cost = _get_upgrade_cost(def, level + 1)
		# HP at next level
		var next_hp: int = max_hp
		if def.has("hp_levels") and level < def.hp_levels.size():
			next_hp = def.hp_levels[level]  # level is 1-based, array is 0-based, so [level] = next
		var damage_levels: Array = def.get("damage_levels", [])
		var current_damage: int = int(damage_levels[clampi(level - 1, 0, damage_levels.size() - 1)]) if not damage_levels.is_empty() else 0
		var next_damage: int = int(damage_levels[clampi(level, 0, damage_levels.size() - 1)]) if not damage_levels.is_empty() else current_damage
		var range_levels: Array = def.get("range_levels", [])
		var current_range: float = float(range_levels[clampi(level - 1, 0, range_levels.size() - 1)]) if not range_levels.is_empty() else 0.0
		var next_range: float = float(range_levels[clampi(level, 0, range_levels.size() - 1)]) if not range_levels.is_empty() else current_range
		var min_range_levels: Array = def.get("min_range_levels", [])
		var current_min_range: float = float(min_range_levels[clampi(level - 1, 0, min_range_levels.size() - 1)]) if not min_range_levels.is_empty() else 0.0
		var next_min_range: float = float(min_range_levels[clampi(level, 0, min_range_levels.size() - 1)]) if not min_range_levels.is_empty() else current_min_range
		var splash_radius_levels: Array = def.get("splash_radius_levels", [])
		var current_splash_radius: float = float(splash_radius_levels[clampi(level - 1, 0, splash_radius_levels.size() - 1)]) if not splash_radius_levels.is_empty() else 0.0
		var next_splash_radius: float = float(splash_radius_levels[clampi(level, 0, splash_radius_levels.size() - 1)]) if not splash_radius_levels.is_empty() else current_splash_radius
		var reload_levels: Array = def.get("reload_levels", [])
		var current_reload: float = float(reload_levels[clampi(level - 1, 0, reload_levels.size() - 1)]) if not reload_levels.is_empty() else float(def.get("reload_sec", 0.0))
		var next_reload: float = float(reload_levels[clampi(level, 0, reload_levels.size() - 1)]) if not reload_levels.is_empty() else current_reload
		var pull_speed_levels: Array = def.get("pull_speed_levels", [])
		var current_pull_speed: float = float(pull_speed_levels[clampi(level - 1, 0, pull_speed_levels.size() - 1)]) if not pull_speed_levels.is_empty() else 0.0
		var next_pull_speed: float = float(pull_speed_levels[clampi(level, 0, pull_speed_levels.size() - 1)]) if not pull_speed_levels.is_empty() else current_pull_speed
		var bs_has_ship = false
		var bs_ship_level: int = 0
		var bs_ship_troops: Array = []
		var bs_port_number: int = 0
		if b.has("node") and is_instance_valid(b["node"]) and b["node"].has_meta("has_ship"):
			bs_has_ship = true
			bs_ship_level = clampi(int(b["node"].get_meta("ship_level", 1)), 1, MAX_PORT_SHIP_LEVEL)
			bs_ship_troops = b["node"].get_meta("ship_troops", [])
		if b.id == "port":
			bs_port_number = _port_display_number_for_building(b)

		bridge.send_to_react("building_selected", {
			"id": b.id, "name": def.name, "level": level,
			"hp": hp, "max_hp": max_hp, "max_level": max_level,
			"next_hp": next_hp,
			"damage": current_damage,
			"next_damage": next_damage,
			"detect_range": current_range,
			"range": current_range,
			"next_range": next_range,
			"next_detect_range": next_range,
			"min_range": current_min_range,
			"next_min_range": next_min_range,
			"splash_radius": current_splash_radius,
			"next_splash_radius": next_splash_radius,
			"reload_sec": current_reload,
			"next_reload_sec": next_reload,
			"pull_speed": current_pull_speed,
			"next_pull_speed": next_pull_speed,
			"pull_duration_sec": float(def.get("pull_duration_sec", 0.0)),
			"stop_distance": float(def.get("stop_distance", 0.0)),
			"target_type": str(def.get("target_type", "")),
			"upgrade_cost": upgrade_cost,
			"is_enemy": is_viewing_enemy,
			"is_barn": b.id == "barn",
			"is_upgrading": b.get("is_upgrading", false),
			"has_ship": bs_has_ship,
			"ship_level": bs_ship_level,
			"ship_troops": bs_ship_troops,
			"ship_capacity": bs_ship_level * 3,
			"ship_cost": def.get("ship_cost", {}),
			"port_number": bs_port_number,
			"troop_levels": troop_levels,
			"altar_skills": altar_skill_levels,
			"town_hall_flag_url": b.get("town_hall_flag_url", ""),
			"flag_url": b.get("town_hall_flag_url", ""),
		})

	# Range indicator for defense buildings
	_hide_range_indicator()
	var defense_ids = ["turret", "cannon", "tombstone", "archtower", "archer_tower", "archertower", "mage_tower", "harpoon"]
	if b.id in defense_ids and is_instance_valid(b.get("node", null)):
		var bnode = b["node"]
		var r: float = 1.0
		if bnode.get_script() and bnode.get("detect_range") != null:
			r = bnode.detect_range
		_show_range_indicator(bnode.global_position, r)
	elif b.id == "mortar":
		_set_mortar_range_visuals_for_building(b, true)

	# Move arrows (own island only)
	if not is_viewing_enemy:
		_show_move_arrows(b)
	else:
		_hide_move_arrows()

	# When viewing enemy — only show HP info, no upgrade/troop panel
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
		if building_panel_altar_skills:
			building_panel_altar_skills.visible = false
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

	# Barn = troop upgrade panel
	if b.id == "barn" and barn_panel:
		_refresh_barn_panel()
		barn_panel.visible = true
		if building_panel:
			building_panel.visible = false
		var cam = get_node_or_null("/root/IslandScene/CameraRig")
		if cam:
			cam.zoom_blocked = true
		return

	if building_panel:
		if b.id == "altar":
			building_panel.custom_minimum_size = Vector2(640, 500)
			building_panel.offset_left = -320
			building_panel.offset_right = 320
			building_panel.offset_top = -540
			building_panel.offset_bottom = -20
		else:
			building_panel.custom_minimum_size = Vector2(400, 280)
			building_panel.offset_left = -200
			building_panel.offset_right = 200
			building_panel.offset_top = -300
			building_panel.offset_bottom = -20

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
	if building_panel_altar_skills:
		building_panel_altar_skills.visible = false
	if b.id == "altar":
		_refresh_altar_skills_panel(level, hp, max_hp)
	if building_panel:
		building_panel.visible = true


func _deselect_building() -> void:
	if _is_moving:
		_cancel_move(false)
	_set_mortar_range_visuals_for_selected(false)
	selected_building = {}
	_hide_range_indicator()
	_hide_move_arrows()
	var bridge = _bridge
	if bridge:
		bridge.send_to_react("building_deselected", {})
	if building_panel:
		building_panel.visible = false
	if barn_panel:
		barn_panel.visible = false
	if port_panel:
		port_panel.visible = false
	var cam = get_node_or_null("/root/IslandScene/CameraRig")
	if cam:
		cam.zoom_blocked = false


func _set_mortar_range_visuals_for_selected(should_be_visible: bool) -> void:
	if selected_building.size() == 0:
		return
	_set_mortar_range_visuals_for_building(selected_building, should_be_visible)


func _set_mortar_range_visuals_for_building(b: Dictionary, should_be_visible: bool) -> void:
	if b.get("id", "") != "mortar":
		return
	var bnode: Node = b.get("node", null)
	if is_instance_valid(bnode) and bnode.has_method("set_range_visuals_visible"):
		bnode.call("set_range_visuals_visible", should_be_visible)


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
	var bid: String = selected_building.get("id", "")
	var th_level: int = _get_th_level()
	# TH upgrade — check required buildings (bypassed in test_mode)
	if not test_mode:
		if bid == "town_hall":
			var check: Dictionary = _can_upgrade_th()
			if not check.can:
				var missing_str: String = ", ".join(check.missing)
				_show_error("Upgrade all buildings first: " + missing_str)
				return
		else:
			var max_level_for_th: int = _get_building_max_level_for_th(bid, th_level)
			if level + 1 > max_level_for_th:
				var required_th: int = th_level + 1
				for candidate_th in range(1, building_defs["town_hall"].get("hp_levels", []).size() + 1):
					if _get_building_max_level_for_th(bid, candidate_th) >= level + 1:
						required_th = candidate_th
						break
				_show_error("Upgrade Town Hall to level %d first" % required_th)
				return

	var b = selected_building
	var net = _net

	# Ask server first
	if not test_mode:
		if _block_without_server("upgrade"):
			return
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
			_apply_resources_from_server(result["resources"])
		# Use level from server response
		if result.has("level"):
			level = result["level"] - 1

	# Server OK — start upgrade sequence
	b["is_upgrading"] = true
	var target_level = level + 1
	_run_upgrade_sequence(b, def, target_level)


func _apply_authoritative_upgrade_state(b: Dictionary, def: Dictionary, server_new_level: int) -> void:
	# The server has already committed the upgrade. Apply that state before any
	# presentation awaits so an interrupted animation cannot leave progression
	# checks reading the previous building level.
	var hp_levels: Array = def.get("hp_levels", [])
	var applied_level: int = maxi(1, server_new_level)
	if not hp_levels.is_empty():
		applied_level = mini(applied_level, hp_levels.size())
	var new_max_hp: int = _get_hp_for(def, applied_level)
	b["level"] = applied_level
	b["max_hp"] = new_max_hp
	b["hp"] = new_max_hp


func _run_upgrade_sequence(b: Dictionary, def: Dictionary, server_new_level: int) -> void:
	_apply_authoritative_upgrade_state(b, def, server_new_level)
	var new_max_hp: int = int(b.get("max_hp", _get_hp_for(def, server_new_level)))

	if not is_instance_valid(b.get("node")):
		b["is_upgrading"] = false
		_sync_react_buildings()
		if typeof(selected_building) == TYPE_DICTIONARY and selected_building == b:
			_select_building(b)
		return

	# Progression and React state are authoritative immediately. The animation
	# below may finish later, but it no longer controls the building level.
	_sync_react_buildings()
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

	# Start Glow on CURRENT model — reuse one shared ShaderMaterial across
	# every upgrade so Godot compiles the overlay pipeline variant exactly
	# once (during warmup), not on every upgrade click.
	var mat: ShaderMaterial = _get_upgrade_outline_material()
	var meshes: Array[MeshInstance3D] = []
	if mat:
		_get_all_meshes(model, meshes)
		for m in meshes:
			if is_instance_valid(m):
				m.material_overlay = mat

	# Wait for the "glow upgrade" phase (3 seconds; instant in test_mode)
	await get_tree().create_timer(0.05 if test_mode else 3.0).timeout

	if not is_instance_valid(self) or not is_instance_valid(model):
		return # node or building destroyed while waiting
		
	# Remove glow and text
	for m in meshes:
		if is_instance_valid(m):
			m.material_overlay = null
	if is_instance_valid(up_lbl):
		up_lbl.queue_free()

	# Bounce DOWN (squash)
	var tw_down = create_tween()
	tw_down.tween_property(model, "scale", Vector3.ZERO, 0.05 if test_mode else 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	await tw_down.finished

	if not is_instance_valid(self) or not is_instance_valid(model):
		return

	# --- UPGRADE VISUAL APPLIED ---
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
		var scene_res = _get_packed_scene_resource(scene_path)
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
			var s = _get_model_scale(def, b.level)
			new_model.scale = Vector3(s, s, s)
			new_model.set_meta("building_visual_model", true)
			new_model.rotation_degrees.y = _get_model_rotation_y(def)
			var offsets = def.get("model_offsets", [])
			if offsets.size() >= b.level:
				new_model.position = offsets[b.level - 1]
			else:
				new_model.position = def.get("model_offset", Vector3.ZERO)
			model.add_child(new_model)
			_apply_building_albedo(new_model, def)
			if b.id == "town_hall":
				_apply_town_hall_flag_url(new_model, str(b.get("town_hall_flag_url", "")))
			if b.id == "archer_tower":
				_apply_archer_tower_level_visuals(new_model, b.level)
			_apply_web_render_profile(new_model, scene_path, b.level)
			# Recreate HP bar (old one was freed with model children)
			var hp_bar_data = _create_building_hp_bar(model, def)
			b["hp_bar"] = hp_bar_data.bar
			b["hp_fill"] = hp_bar_data.fill
	elif def.has("model_scales"):
		var visual_model := _get_building_visual_model(model)
		if is_instance_valid(visual_model):
			var s = _get_model_scale(def, b.level)
			visual_model.scale = Vector3(s, s, s)
		_refresh_building_base_for_level(model, def, b.id, b.level)

	# Respawn tower unit after model swap
	if def.has("tower_unit"):
		_spawn_tower_unit(b, def)
	_apply_building_runtime_level(b)

	# Bounce UP (reveal)
	var tw_up = create_tween()
	tw_up.tween_property(model, "scale", Vector3.ONE, 0.05 if test_mode else 0.4).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

	# Tombstone → update skeletons
	if b.id == "tombstone":
		_spawn_tombstone_skeletons(b, b.level)

	# Port → upgrade ship level and respawn ship model
	if b.id == "port" and is_instance_valid(b.get("node")):
		var pnode: Node3D = b.node
		if pnode.has_meta("has_ship"):
			var old_ship_node = pnode.get_meta("ship_node", null)
			if is_instance_valid(old_ship_node):
				old_ship_node.get_parent().remove_child(old_ship_node)
				old_ship_node.queue_free()
			pnode.remove_meta("ship_node")
			pnode.set_meta("ship_level", clampi(int(b.level), 1, MAX_PORT_SHIP_LEVEL))
			_port._spawn_port_ship(b)
		_refresh_port_number_labels()

	# Mark upgrade complete before refreshing UI
	b["is_upgrading"] = false

	# Update resource caps (storage/town_hall upgrade changes limits)
	_send_resource_caps()

	# Update React UI globally
	if typeof(selected_building) == TYPE_DICTIONARY and selected_building == b:
		_select_building(b)

	# Show leveled up text
	_play_building_level_up_sfx()
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
	if def.has("upgrade_cost"):
		var special_costs: Dictionary = def.get("upgrade_cost", {})
		if special_costs.has(next_level):
			return special_costs[next_level].duplicate()
	var cost: Dictionary = def.get("upgrade_base_cost", def.get("cost", {}))
	var result := {}
	var multiplier: int = int(BUILDING_UPGRADE_COST_MULTIPLIERS.get(next_level, next_level))
	for res_name in cost:
		result[res_name] = cost[res_name] * multiplier
	return result


## Returns scale for [param level]. Per-level override via "model_scales" array,
## otherwise falls back to scalar "model_scale".
func _get_model_scale(def: Dictionary, level: int = 1) -> float:
	var scales: Array = def.get("model_scales", [])
	if level >= 1 and scales.size() >= level:
		return float(scales[level - 1])
	return float(def.get("model_scale", 0.2))


func _get_model_rotation_y(def: Dictionary) -> float:
	return float(def.get("model_rotation_y", 270.0)) + BUILDING_CAMERA_FACING_YAW_DEGREES


func _apply_web_render_profile(model: Node, scene_path: String, level: int) -> void:
	if model == null or not WebRenderProfile.is_enabled():
		return
	WebRenderProfile.apply_static_batch_for_web(model, scene_path, level)
	WebRenderProfile.optimize_visual_for_web(model)


func _get_building_visual_model(building_node: Node3D) -> Node3D:
	for child in building_node.get_children():
		if child is Node3D and child.has_meta("building_visual_model"):
			return child
	for child in building_node.get_children():
		if child is Node3D and not child.has_meta("building_base") and child.name != "BuildingHpBar":
			if child is OmniLight3D or child is AnimationPlayer:
				continue
			return child
	return null


func _refresh_building_base_for_level(building_node: Node3D, def: Dictionary, building_id: String, level: int) -> void:
	for child in building_node.get_children():
		if child.has_meta("building_base"):
			child.queue_free()
	var cache_key = _aabb_cache_key(building_id, level)
	if not _building_aabb_cache.has(cache_key):
		_building_aabb_cache[cache_key] = _compute_model_aabb(def, level)
	if not def.get("no_outline", false):
		building_node.add_child(_create_building_base(def, cache_key))


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
	var upgrade_cost: Dictionary = _get_upgrade_cost(def, current_level + 1)
	if upgrade_cost.size() == 0:
		building_panel_cost.text = "Free"
		return
	var parts: Array = []
	if upgrade_cost.has("gold"):
		parts.append("Gold: %d" % upgrade_cost.gold)
	if upgrade_cost.has("wood"):
		parts.append("Wood: %d" % upgrade_cost.wood)
	if upgrade_cost.has("ore"):
		parts.append("Ore: %d" % upgrade_cost.ore)
	building_panel_cost.text = "Upgrade: " + "  ".join(parts)


func _refresh_altar_skills_panel(_level: int, hp: int, max_hp: int) -> void:
	if not building_panel_altar_skills:
		return
	if building_panel_upgrade_btn:
		building_panel_upgrade_btn.visible = false
	if building_panel_cost:
		building_panel_cost.visible = false
	if building_panel_hp:
		building_panel_hp.text = "HP: %d / %d" % [hp, max_hp]
	if building_panel_hp_bar:
		building_panel_hp_bar.max_value = max_hp
		building_panel_hp_bar.value = hp
	if building_panel:
		building_panel.custom_minimum_size = Vector2(640, 500)
		building_panel.offset_left = -320
		building_panel.offset_right = 320
		building_panel.offset_top = -540
		building_panel.offset_bottom = -20

	for child in building_panel_altar_skills.get_children():
		child.queue_free()
	building_panel_altar_skills.visible = true

	var summary = Label.new()
	summary.text = "Choose an altar branch to upgrade. Each branch has 3 levels."
	summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	summary.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	summary.add_theme_font_size_override("font_size", 13)
	summary.add_theme_color_override("font_color", Color(0.78, 0.84, 0.92))
	building_panel_altar_skills.add_child(summary)

	var tabs = TabContainer.new()
	tabs.custom_minimum_size = Vector2(0, 310)
	tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tabs.size_flags_vertical = Control.SIZE_EXPAND_FILL
	building_panel_altar_skills.add_child(tabs)

	for skill_id in ALTAR_SKILL_ORDER:
		tabs.add_child(_create_altar_skill_tab(skill_id))


func _create_altar_skill_tab(skill_id: String) -> Control:
	var def: Dictionary = ALTAR_SKILL_DEFS.get(skill_id, {})
	var current_level: int = int(altar_skill_levels.get(skill_id, 0))
	var tab = VBoxContainer.new()
	tab.name = str(def.get("name", skill_id))
	tab.add_theme_constant_override("separation", 8)

	var header = Label.new()
	header.text = "%s - Lv.%d / 3" % [str(def.get("title", skill_id)), current_level]
	header.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	header.add_theme_font_size_override("font_size", 18)
	header.add_theme_color_override("font_color", Color(0.95, 0.88, 0.55))
	tab.add_child(header)

	var skill_grid = GridContainer.new()
	skill_grid.columns = 3
	skill_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	skill_grid.add_theme_constant_override("h_separation", 8)
	skill_grid.add_theme_constant_override("v_separation", 8)
	tab.add_child(skill_grid)

	for i in range(3):
		skill_grid.add_child(_create_altar_level_card(skill_id, i + 1))

	var next_level: int = current_level + 1
	var upgrade_btn = Button.new()
	upgrade_btn.custom_minimum_size = Vector2(0, 52)
	if current_level >= 3:
		upgrade_btn.text = "MAX LEVEL"
		upgrade_btn.disabled = true
		_style_button(upgrade_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
	else:
		var cost: Dictionary = _get_altar_skill_cost(skill_id, next_level)
		upgrade_btn.text = "Upgrade to Lv.%d - %s" % [next_level, _format_altar_cost(cost)]
		upgrade_btn.disabled = not _can_afford(cost)
		if upgrade_btn.disabled:
			_style_button(upgrade_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
		else:
			_style_button(upgrade_btn, Color(0.18, 0.44, 0.58), Color(0.24, 0.54, 0.7))
		upgrade_btn.pressed.connect(func(): _upgrade_altar_skill(skill_id))
	tab.add_child(upgrade_btn)
	return tab


func _create_altar_level_card(skill_id: String, level: int) -> Control:
	var def: Dictionary = ALTAR_SKILL_DEFS.get(skill_id, {})
	var current_level: int = int(altar_skill_levels.get(skill_id, 0))
	var card = PanelContainer.new()
	card.custom_minimum_size = Vector2(190, 150)
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.16, 0.18, 0.25, 0.96)
	style.set_corner_radius_all(8)
	style.set_border_width_all(2)
	style.border_color = Color(0.35, 0.62, 0.76, 1.0) if level <= current_level else Color(0.28, 0.31, 0.42, 1.0)
	card.add_theme_stylebox_override("panel", style)

	var box = VBoxContainer.new()
	box.add_theme_constant_override("separation", 5)
	box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	card.add_child(box)

	var title = Label.new()
	title.text = "Lv%d%s" % [level, " ACTIVE" if level <= current_level else ""]
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 15)
	title.add_theme_color_override("font_color", Color(0.62, 0.9, 0.72) if level <= current_level else Color.WHITE)
	box.add_child(title)

	var bonus = Label.new()
	bonus.text = _format_altar_skill_bonus(def, level)
	bonus.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	bonus.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	bonus.add_theme_font_size_override("font_size", 13)
	bonus.add_theme_color_override("font_color", Color(0.82, 0.9, 1.0))
	box.add_child(bonus)

	var cost = Label.new()
	cost.text = _format_altar_cost(_get_altar_skill_cost(skill_id, level))
	cost.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	cost.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cost.add_theme_font_size_override("font_size", 12)
	cost.add_theme_color_override("font_color", Color(0.95, 0.82, 0.48))
	box.add_child(cost)
	return card


func _get_altar_skill_cost(skill_id: String, level: int) -> Dictionary:
	var def: Dictionary = ALTAR_SKILL_DEFS.get(skill_id, {})
	var costs: Array = def.get("costs", [])
	if level < 1 or level > costs.size():
		return {}
	return (costs[level - 1] as Dictionary).duplicate()


func _format_altar_skill_bonus(def: Dictionary, level: int) -> String:
	var bonuses: Array = def.get("bonuses", [])
	if level < 1 or level > bonuses.size():
		return "No bonus"
	var label: String = str(def.get("bonus_label", ""))
	if str(def.get("bonus_format", "")) == "range":
		var min_bonus: int = int(def.get("min_bonus", 1))
		var max_bonus: int = int(bonuses[level - 1])
		return "+%d-%d %s" % [min_bonus, max_bonus, label]
	if str(def.get("bonus_format", "")) == "flat":
		return "+%d %s" % [int(bonuses[level - 1]), label]
	return "+%d%% %s" % [int(bonuses[level - 1]), label]


func _format_altar_cost(cost: Dictionary) -> String:
	var parts: Array[String] = []
	if int(cost.get("wood", 0)) > 0:
		parts.append("%s wood" % _format_int(int(cost.get("wood", 0))))
	if int(cost.get("ore", 0)) > 0:
		parts.append("%s ore" % _format_int(int(cost.get("ore", 0))))
	if int(cost.get("gold", 0)) > 0:
		parts.append("%s gold" % _format_int(int(cost.get("gold", 0))))
	return " / ".join(parts)


func _format_int(value: int) -> String:
	var s := str(value)
	var out := ""
	var count := 0
	for i in range(s.length() - 1, -1, -1):
		if count > 0 and count % 3 == 0:
			out = "," + out
		out = s.substr(i, 1) + out
		count += 1
	return out


func _upgrade_altar_skill(skill_id: String) -> void:
	if _server_busy:
		return
	var current_level: int = int(altar_skill_levels.get(skill_id, 0))
	if current_level >= 3:
		return
	var cost: Dictionary = _get_altar_skill_cost(skill_id, current_level + 1)
	if not _can_afford(cost):
		_show_error("Not enough resources")
		return
	_server_busy = true
	var net = _net
	var result: Dictionary = {}
	if test_mode:
		for res_name in cost:
			resources[res_name] = int(resources.get(res_name, 0)) - int(cost[res_name])
		altar_skill_levels[skill_id] = current_level + 1
		result = {"success": true}
	else:
		if _block_without_server("upgrade altar skill"):
			_server_busy = false
			return
		result = await net.upgrade_altar_skill(skill_id)
		if result.has("resources"):
			_apply_resources_from_server(result.resources)
		if result.has("altar_skills") and result.altar_skills is Dictionary:
			_load_altar_skill_levels_from_server(result.altar_skills)
		elif result.has("skill_id") and result.has("level"):
			altar_skill_levels[str(result.skill_id)] = int(result.level)
	_server_busy = false
	if result.has("error"):
		_show_error(str(result.error))
		return
	_update_resource_ui()
	_play_building_level_up_sfx()
	if selected_building.get("id", "") == "altar":
		_refresh_altar_skills_panel(
			int(selected_building.get("level", 1)),
			int(selected_building.get("hp", 0)),
			int(selected_building.get("max_hp", 1))
		)


func _find_building_index_for_remove(b: Dictionary) -> int:
	var idx: int = placed_buildings.find(b)
	if idx >= 0:
		return idx
	var sid: int = int(b.get("server_id", -1))
	if sid >= 0:
		for i in placed_buildings.size():
			if int(placed_buildings[i].get("server_id", -2)) == sid:
				return i
	var node: Node = b.get("node", null)
	if is_instance_valid(node):
		for i in placed_buildings.size():
			if placed_buildings[i].get("node", null) == node:
				return i
	var bid: String = str(b.get("id", ""))
	var gp: Vector2i = b.get("grid_pos", Vector2i(-9999, -9999))
	if bid != "" and gp != Vector2i(-9999, -9999):
		for i in placed_buildings.size():
			if str(placed_buildings[i].get("id", "")) == bid and placed_buildings[i].get("grid_pos", Vector2i.ZERO) == gp:
				return i
	return -1


func remove_building(b: Dictionary) -> void:
	var idx: int = _find_building_index_for_remove(b)
	if idx < 0:
		if _replay_active:
			record_replay_telemetry("building_destroy_missing", {
				"type": str(b.get("id", "")),
				"server_id": int(b.get("server_id", -1)),
				"hp": int(b.get("hp", 0)),
			})
		return
	b = placed_buildings[idx]
	var server_removed := false
	if not is_viewing_enemy and not _replay_active and not test_mode:
		if _block_without_server("remove building"):
			return
		var sid := int(b.get("server_id", -1))
		if sid < 0:
			_show_error("Building not synced to server")
			return
		_server_busy = true
		var net = _net
		var result = await net.remove_building(sid)
		_server_busy = false
		if not is_instance_valid(self):
			return
		if result.has("error"):
			_show_error(str(result.error))
			return
		if result.has("trophies"):
			net.trophies = result["trophies"]
			_update_player_name_label()
		server_removed = true
	if _replay_active and not bool(b.get("_destroy_telemetry_recorded", false)):
		b["_destroy_telemetry_recorded"] = true
		record_replay_telemetry("building_destroyed", {
			"type": str(b.get("id", "")),
			"server_id": int(b.get("server_id", -1)),
			"grid_x": int(b.get("grid_pos", Vector2i.ZERO).x),
			"grid_z": int(b.get("grid_pos", Vector2i.ZERO).y),
			"hp": int(b.get("hp", 0)),
		})
	# Town Hall destroyed during attack/replay -> explode TH first, then
	# chain-destroy remaining buildings.
	if b.id == "town_hall" and is_viewing_enemy:
		if b.has("hp_bar") and is_instance_valid(b.hp_bar):
			b.hp_bar.queue_free()
		var th_icon: Control = b.get("_collect_icon")
		if is_instance_valid(th_icon):
			th_icon.queue_free()
		# TH gets the same puff-up + explosion + ruins sequence as any other
		# building, so the defeat beat starts with a satisfying pop.
		if is_instance_valid(b.node):
			explode_building_with_swell(b.node, "town_hall")
		placed_buildings.remove_at(idx)
		BaseTroop.invalidate_combat_lists()
		# Then chain-destroy remaining buildings with delay
		if _replay_active:
			if _battle and _battle.has_method("_on_replay_town_hall_destroyed"):
				_battle._on_replay_town_hall_destroyed()
		else:
			_on_town_hall_destroyed()
		return
	# Tombstone → kill all its skeleton guards
	if b.id == "tombstone":
		_remove_tombstone_skeletons(b)
	# Only sync removal of OWN buildings, not enemy's during attack
	if is_viewing_enemy:
		# Enemy building destroyed — grant cannon energy
		_on_building_destroyed_energy()
	elif not server_removed:
		_sync_remove_building(b)
	var def: Dictionary = building_defs[b.id]
	var gp: Vector2i = b.grid_pos as Vector2i
	for x in range(def.cells.x):
		for z in range(def.cells.y):
			var cell_idx: int = (gp.y + z) * grid_width + (gp.x + x)
			if cell_idx >= 0 and cell_idx < grid.size():
				grid[cell_idx] = false
	# Port destroyed → sink its docked ship
	if b.id == "port":
		var pnode: Node3D = b.get("node", null)
		if is_instance_valid(pnode) and pnode.has_meta("ship_node"):
			var ship: Node3D = pnode.get_meta("ship_node")
			if is_instance_valid(ship):
				_sink_ship(ship)
	if b.has("hp_bar") and is_instance_valid(b.hp_bar):
		b.hp_bar.queue_free()
	var icon: Control = b.get("_collect_icon")
	if is_instance_valid(icon):
		icon.queue_free()
	if is_instance_valid(b.node):
		# A destroyed defense must stop on the lethal physics tick. The
		# 0.2-second swell below is cosmetic; allowing its combat script or an
		# owned projectile pool to advance until the idle tween finishes makes
		# the final shot count depend on render cadence.
		b.node.set_process(false)
		b.node.set_physics_process(false)
		var tower_unit: Node = b.get("tower_unit_node", null)
		if is_instance_valid(tower_unit):
			tower_unit.set_process(false)
			tower_unit.set_physics_process(false)
		explode_building_with_swell(b.node, b.get("id", ""))
	placed_buildings.remove_at(idx)
	BaseTroop.invalidate_combat_lists()
	_deselect_building()


## Plays the "puff up → explode + vanish" sequence for a single building.
## Extracted so town-hall chain-destruction and normal troop-killed removal
## share the same visual beat.
##
## Dramaturgy: the building inflates (0.2 s). At the peak of the inflate the
## explosion spawns AND the building is replaced with ruins on the same frame
## — the explosion cloud covers the swap so the player reads it as "it blew
## up, gone". No crumple/shrink phase between puff and explosion (that felt
## like "deflate then boom later").
func explode_building_with_swell(bnode: Node3D, building_id: String) -> void:
	if not is_instance_valid(bnode):
		return
	# Find the GLB model child to swell — skip HP bar ShaderMaterial meshes,
	# lights, and AnimationPlayers.
	var model_child: Node3D = null
	for child in bnode.get_children():
		if child is Node3D and not (child is MeshInstance3D and child.material_override is ShaderMaterial) and not (child is OmniLight3D) and not (child is AnimationPlayer):
			model_child = child
			break
	var bnode_ref: WeakRef = weakref(bnode)
	var tw: Tween = create_tween()
	if model_child and is_instance_valid(model_child):
		var puff_scale: Vector3 = model_child.scale * 1.2
		# Single inflate — TRANS_BACK + EASE_OUT gives a cartoon "pop" feel.
		tw.tween_property(model_child, "scale", puff_scale, 0.2).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	else:
		# No model child → still time the explosion for ~0.2s after call.
		tw.tween_interval(0.2)
	# At the peak of the puff: boom + vanish happen on the same frame.
	tw.tween_callback(func():
		var target_node: Node3D = bnode_ref.get_ref() as Node3D
		if not is_instance_valid(target_node):
			return
		_play_building_destruction_sfx()
		_spawn_fire_bomb_explosion(target_node)
		if building_id == "port":
			target_node.queue_free()
		else:
			_replace_with_ruins(target_node)
	)


## Standalone fire-bomb explosion spawner (extracted from remove_building).
## Uses BaseTroop's preloaded texture cache and the shared additive-billboard
## material factory so every building death draws from the same pool.
func _spawn_fire_bomb_explosion(at_node: Node3D) -> void:
	if not is_instance_valid(at_node):
		return
	var tree := get_tree()
	if tree == null or not is_instance_valid(tree.current_scene):
		# A delayed destruction tween can finish while a replay/test scene is
		# being torn down. VFX must not outlive its owning scene.
		return
	BaseTroop._preload_fire_bomb()
	if BaseTroop._fire_bomb_textures.is_empty():
		return
	var explosion: MeshInstance3D = MeshInstance3D.new()
	var quad: QuadMesh = QuadMesh.new()
	quad.size = Vector2(BaseTroop.FIRE_BOMB_SCALE, BaseTroop.FIRE_BOMB_SCALE)
	explosion.mesh = quad
	var mat: StandardMaterial3D = StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.no_depth_test = true
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.albedo_texture = BaseTroop._fire_bomb_textures[0]
	explosion.material_override = mat
	tree.current_scene.add_child(explosion)
	explosion.global_position = at_node.global_position + Vector3(0, 0.35, 0)
	var explosion_ref: WeakRef = weakref(explosion)
	var frames: Array = BaseTroop._fire_bomb_textures
	var frame_dur: float = BaseTroop.FIRE_BOMB_DURATION / float(frames.size())
	var tw: Tween = create_tween()
	for fi in range(frames.size()):
		var idx2: int = fi
		tw.tween_callback(func():
			var explosion_node: MeshInstance3D = explosion_ref.get_ref() as MeshInstance3D
			if is_instance_valid(explosion_node):
				(explosion_node.material_override as StandardMaterial3D).albedo_texture = frames[idx2]
		).set_delay(frame_dur if fi > 0 else 0.0)
	tw.parallel().tween_property(mat, "albedo_color:a", 0.0, BaseTroop.FIRE_BOMB_DURATION * 0.3).set_delay(BaseTroop.FIRE_BOMB_DURATION * 0.7)
	tw.chain().tween_callback(func():
		var explosion_node: MeshInstance3D = explosion_ref.get_ref() as MeshInstance3D
		if is_instance_valid(explosion_node):
			explosion_node.queue_free()
	)


# ── Tombstone Skeleton Guards ─────────────────────────────────

## Animates a ship sinking: tilts, submerges, then frees the node.
func _sink_ship(ship: Node3D) -> void:
	# Detach from any port meta so it's not referenced after sinking
	ship.set_meta("sinking", true)
	var start_y: float = ship.global_position.y
	var sink_depth: float = 0.4
	var tw: Tween = create_tween().set_parallel(true)
	# Tilt to one side as it sinks
	tw.tween_property(ship, "rotation:z", deg_to_rad(25.0), 3.0).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	tw.tween_property(ship, "rotation:x", deg_to_rad(10.0), 3.0).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	# Sink below the water
	tw.tween_property(ship, "global_position:y", start_y - sink_depth, 3.0).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_SINE)
	# Fade out (scale down) in the last second
	tw.tween_property(ship, "scale", Vector3.ZERO, 1.0).set_delay(2.0).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
	tw.chain().tween_callback(ship.queue_free)


const SKELETON_MODEL = "res://Model/Characters/Skelet/characters/gltf/Skeleton_Minion.glb"
const SKELETON_SCRIPT = "res://scripts/skeleton_guard.gd"
const SKELETON_SCALE = 0.1
const TOWER_ARCHER_SCRIPT_PATH = "res://scripts/tower_archer.gd"

func _apply_building_runtime_level(b: Dictionary) -> void:
	var lvl: int = int(b.get("level", 1))
	var ward_pct: int = _get_altar_skill_bonus_pct("ward")
	var node: Node = b.get("node", null)
	if is_instance_valid(node) and node.has_method("set_level"):
		node.set_level(lvl)
	if is_instance_valid(node) and node.has_method("set_ward_bonus_pct"):
		node.set_ward_bonus_pct(ward_pct)
	if is_instance_valid(node) and node.has_method("set_spawn_facing_global"):
		# Face the real troop deployment zone (AttackSystem/shipPlane), not the
		# defended building-grid center. This is a one-time spawn heading; combat
		# retains the last tracked yaw afterward.
		node.set_spawn_facing_global(_get_defense_spawn_facing_global())
	var tower_unit: Node = b.get("tower_unit_node", null)
	if is_instance_valid(tower_unit) and tower_unit.has_method("set_level"):
		tower_unit.set_level(lvl)
	if is_instance_valid(tower_unit) and tower_unit.has_method("set_ward_bonus_pct"):
		tower_unit.set_ward_bonus_pct(ward_pct)
	for skel in b.get("skeletons", []):
		if is_instance_valid(skel) and skel.has_method("set_ward_bonus_pct"):
			skel.set_ward_bonus_pct(ward_pct)


func _get_defense_spawn_facing_global() -> Vector3:
	var attack_system := get_node_or_null("../AttackSystem") as Node3D
	if attack_system != null:
		var attack_plane_path: NodePath = attack_system.get("grid_plane_path") as NodePath
		if not attack_plane_path.is_empty():
			var attack_plane := attack_system.get_node_or_null(attack_plane_path) as Node3D
			if attack_plane != null:
				return attack_plane.global_position
	# Non-combat tooling may instantiate BuildingSystem without AttackSystem.
	# Its own grid center is the deterministic fallback, never a fixed world yaw.
	return to_global(Vector3.ZERO)


func _apply_building_level_visuals_for_test(b: Dictionary, def: Dictionary) -> void:
	if not test_mode:
		return
	var lvl: int = int(b.get("level", 1))
	var building_id := str(b.get("id", ""))
	var node: Node3D = b.get("node", null)
	if not is_instance_valid(node):
		return

	if def.has("scenes"):
		var scene_idx := clampi(lvl - 1, 0, def.scenes.size() - 1)
		var scene_path: String = def.scenes[scene_idx]
		var scene_res := _load_packed_scene_resource(scene_path)
		if scene_res:
			for child in node.get_children():
				child.queue_free()
			var cache_key = _aabb_cache_key(building_id, lvl)
			if not _building_aabb_cache.has(cache_key):
				_building_aabb_cache[cache_key] = _compute_model_aabb(def, lvl)
			if not def.get("no_outline", false):
				node.add_child(_create_building_base(def, cache_key))

			var model: Node3D = scene_res.instantiate()
			var s := _get_model_scale(def, lvl)
			model.scale = Vector3(s, s, s)
			model.set_meta("building_visual_model", true)
			model.rotation_degrees.y = _get_model_rotation_y(def)
			var offsets: Array = def.get("model_offsets", [])
			if offsets.size() >= lvl:
				model.position = offsets[lvl - 1]
			else:
				model.position = def.get("model_offset", Vector3.ZERO)
			if building_id == "mine":
				var mine_cart_script := _load_script_resource("res://scripts/mine_cart.gd")
				if mine_cart_script != null:
					model.set_script(mine_cart_script)
			node.add_child(model)
			_apply_cel_shader(model)
			_apply_building_albedo(model, def)
			if building_id == "town_hall":
				_apply_town_hall_flag_url(model, str(b.get("town_hall_flag_url", "")))
			if building_id == "archer_tower":
				_apply_archer_tower_level_visuals(model, lvl)
			_apply_web_render_profile(model, scene_path, lvl)

			var hp_bar_data = _create_building_hp_bar(node, def)
			b["hp_bar"] = hp_bar_data.bar
			b["hp_fill"] = hp_bar_data.fill
	elif def.has("model_scales"):
		var visual_model := _get_building_visual_model(node)
		if is_instance_valid(visual_model):
			var s := _get_model_scale(def, lvl)
			visual_model.scale = Vector3(s, s, s)
		_refresh_building_base_for_level(node, def, building_id, lvl)

	if def.has("tower_unit"):
		_spawn_tower_unit(b, def)
	_apply_building_runtime_level(b)

# ---------------------------------------------------------------------------
# Defense unit resource cache — loaded once at boot so the first skeleton
# spawn or first archer-tower load never triggers a synchronous `load()`
# in the middle of gameplay. Previously each call to _spawn_tombstone_skeletons
# or _spawn_tower_unit ran load() on the main thread (WASM hitch).
# ---------------------------------------------------------------------------
static var _skeleton_model_res: Resource = null
static var _skeleton_script_res: Resource = null
static var _tower_archer_script_res: Resource = null
static var _tower_unit_model_cache: Dictionary = {}  # model_path → Resource
static var _defense_preload_done: bool = false

static func _preload_defense_resources() -> void:
	if _defense_preload_done:
		return
	_defense_preload_done = true
	_skeleton_model_res = _load_packed_scene_resource(SKELETON_MODEL)
	_skeleton_script_res = _load_script_resource(SKELETON_SCRIPT)
	_tower_archer_script_res = _load_script_resource(TOWER_ARCHER_SCRIPT_PATH)

func _spawn_tower_unit(b: Dictionary, def: Dictionary) -> void:
	# Remove existing tower unit if any
	if b.has("tower_unit_node") and is_instance_valid(b.get("tower_unit_node")):
		b["tower_unit_node"].queue_free()
		b["tower_unit_node"] = null
	var tu = def.get("tower_unit", {})
	var model_path = tu.get("model", "")
	var unit_scale = tu.get("scale", 0.07)
	var offset_y = tu.get("offset_y", 0.3)
	# Cache tower-unit GLBs per unique path. The first visible tower pays the
	# model load; combat-only defense scripts are warmed behind the attack clouds.
	var model_res: Resource = _tower_unit_model_cache.get(model_path, null)
	if model_res == null:
		model_res = _load_packed_scene_resource(model_path)
		if model_res:
			_tower_unit_model_cache[model_path] = model_res
	if not model_res:
		return
	var unit = model_res.instantiate()
	unit.set_meta("building_type", b.get("id", ""))
	unit.set_meta("server_id", int(b.get("server_id", -1)))
	unit.set_meta("clash_tower_archer", true)
	# Attach tower_archer script for combat behavior
	if _tower_archer_script_res == null:
		_preload_defense_resources()
	if _tower_archer_script_res:
		unit.set_script(_tower_archer_script_res)
	var s = unit_scale
	unit.scale = Vector3(s, s, s)
	b.get("node").add_child(unit)
	var anchor_xz := Vector2.ZERO
	if bool(tu.get("align_to_model_center", false)):
		var building_id := str(b.get("id", ""))
		var level := clampi(int(b.get("level", 1)), 1, int(def.get("hp_levels", [1]).size()))
		var aabb_data := _get_cached_aabb(_aabb_cache_key(building_id, level))
		anchor_xz = aabb_data.get("center", Vector2.ZERO)
	unit.position = Vector3(anchor_xz.x, offset_y, anchor_xz.y)
	var unit_rotation_y := float(tu.get("rotation_y", -90.0))
	if bool(tu.get("inherit_building_yaw", false)):
		unit_rotation_y += BUILDING_CAMERA_FACING_YAW_DEGREES
	unit.rotation_degrees.y = unit_rotation_y
	_apply_cel_shader(unit)
	# Set level to match building level
	if unit.has_method("set_level"):
		unit.set_level(b.get("level", 1))
	b["tower_unit_node"] = unit


func _tombstone_skeleton_offset(index: int, target_count: int) -> Vector3:
	if target_count == 4:
		const DIAMOND_POINTS: Array[Vector3] = [
			Vector3(0, 0,  0.21),
			Vector3( 0.21, 0, 0),
			Vector3(0, 0, -0.21),
			Vector3(-0.21, 0, 0),
		]
		return DIAMOND_POINTS[index]
	var angle := (TAU * float(index)) / maxf(float(target_count), 1.0)
	var radius: float = maxf(0.18, 0.04 * float(target_count))
	return Vector3(cos(angle) * radius, 0, sin(angle) * radius)


func _spawn_tombstone_skeletons(b: Dictionary, target_count: int, reposition_existing: bool = true) -> void:
	var tomb_node: Node3D = b.get("node", null)
	if not is_instance_valid(tomb_node):
		b["skeletons"] = []
		return
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
	var existing_count := alive.size()
	# Spawn missing
	var tomb_pos: Vector3 = tomb_node.global_position
	# Combat warmup preloads this before attacks; home tombstones lazy-load it
	# only when they actually exist on the island.
	if _skeleton_model_res == null or _skeleton_script_res == null:
		_preload_defense_resources()
	var script_res: Resource = _skeleton_script_res
	var model_res: Resource = _skeleton_model_res
	if not model_res or not script_res:
		b["skeletons"] = alive
		return
	while alive.size() < target_count:
		var spawn_index := alive.size()
		var skel = model_res.instantiate()
		skel.set_script(script_res)
		skel.scale = Vector3(SKELETON_SCALE, SKELETON_SCALE, SKELETON_SCALE)
		get_tree().current_scene.add_child(skel)
		skel.tombstone_pos = tomb_pos
		skel.global_position = tomb_pos + _tombstone_skeleton_offset(spawn_index, target_count)
		skel.global_rotation = Vector3.ZERO
		_apply_cel_shader(skel)
		if skel.has_method("refresh_web_body_material_fallback"):
			skel.refresh_web_body_material_fallback()
		alive.append(skel)
	# Reposition every guard to the current target_count layout so that an
	# upgrade (e.g. L3 circle → L4 diamond) re-anchors existing skeletons
	# instead of dropping the new one onto a stale spot.
	for i in range(alive.size()):
		if is_instance_valid(alive[i]):
			if alive[i].has_method("set_level"):
				alive[i].set_level(target_count)
			if alive[i].has_method("set_ward_bonus_pct"):
				alive[i].set_ward_bonus_pct(_get_altar_skill_bonus_pct("ward"))
			alive[i].tombstone_pos = tomb_pos
			if reposition_existing or i >= existing_count:
				alive[i].global_position = tomb_pos + _tombstone_skeleton_offset(i, target_count)
				alive[i].global_rotation = Vector3.ZERO
	b["skeletons"] = alive


func _remove_tombstone_skeletons(b: Dictionary) -> void:
	var skeletons = b.get("skeletons", []) as Array
	for skel in skeletons:
		if is_instance_valid(skel):
			skel.queue_free()
	b["skeletons"] = []


const BLDG_BAR_W = 0.18
const BLDG_BAR_H = 0.015

## Shared shader for building base outlines — compiled once on GPU, not per building
static var _building_base_shader: Shader = null

func _make_bldg_hp_mat(color: Color, size: Vector2, priority: int) -> ShaderMaterial:
	# Reuse BaseTroop's shared hp_bar.gdshader — identical shader, different
	# default uniforms. One pipeline variant instead of two on WebGL2.
	var mat = ShaderMaterial.new()
	mat.shader = BaseTroop._get_hp_shader()
	mat.set_shader_parameter("albedo", color)
	mat.set_shader_parameter("bar_size", size)
	mat.render_priority = priority
	return mat

func _create_building_hp_bar(building: Node3D, def: Dictionary) -> Dictionary:
	if bool(def.get("no_hp_bar", false)):
		return {"bar": null, "fill": null}
	var bar = Node3D.new()
	bar.name = "BuildingHpBar"
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
		var model_scale = _get_model_scale(def, int(b.get("level", 1)))
		var bar_height = def.get("hp_bar_height", model_scale * 1.5 + 0.05)
		b.hp_bar.global_position = b.node.global_position + Vector3(0, bar_height, 0)
		if update_billboard and cam:
			var dir = cam.global_position - b.hp_bar.global_position
			dir.y = 0
			if dir.length_squared() > 0.001:
				b.hp_bar.global_transform.basis = Basis.looking_at(-dir.normalized(), Vector3.UP)
		var ratio: float = float(b.hp) / float(b.max_hp)
		var last_ratio: float = b.get("_last_hp_ratio", -1.0)
		# Flash building when it takes damage
		if ratio < 1.0 and (last_ratio < 0.0 or ratio < last_ratio - 0.004) and not b.get("_flashing", false):
			_flash_building_hit(b)
		if absf(ratio - last_ratio) < 0.005 and last_ratio >= 0.0:
			continue
		b["_last_hp_ratio"] = ratio
		var fill_w: float = BLDG_BAR_W * ratio
		(b.hp_fill.mesh as QuadMesh).size.x = fill_w
		b.hp_fill.position.x = -(BLDG_BAR_W - fill_w) * 0.5
		var mat: ShaderMaterial = b.hp_fill.material_override as ShaderMaterial
		mat.set_shader_parameter("bar_size", Vector2(fill_w, BLDG_BAR_H))
		var band: int = 2 if ratio > 0.5 else (1 if ratio > 0.25 else 0)
		var last_band: int = b.get("_last_hp_band", -1)
		if band != last_band:
			b["_last_hp_band"] = band
			mat.set_shader_parameter("albedo", BaseTroop._HP_COLORS[band])


## Preloaded ruins model — appears where a destroyed building stood.
const RUINS_MODEL: String = "res://Model/BrokenModel/BrokenModel.glb"
const RUINS_SCALE: float = 0.15
const RUINS_Y_OFFSET: float = 0.05  ## Adjust if ruins float or sink
static var _ruins_res: Resource = null

## Spawns ruins on the grid at the given local position (child of BuildingSystem).
## Ruins are non-selectable — they have a "is_ruins" meta tag.
## Swaps the 3D model inside a building node with BrokenModel.
## The base outline (MeshInstance3D with ShaderMaterial) stays untouched.
func _replace_with_ruins(node: Node3D) -> void:
	if _ruins_res == null:
		_ruins_res = _load_packed_scene_resource(RUINS_MODEL)
	if _ruins_res == null:
		return
	# Stop defense scripts (turret/archer tower) so they don't keep firing
	if node.has_method("cleanup_defense_visuals"):
		node.cleanup_defense_visuals()
	node.set_process(false)
	node.set_physics_process(false)
	# Clean up active bullets/projectiles/flashes from turrets and archer towers
	if "_active_bullets" in node:
		for bullet_data in node._active_bullets:
			if is_instance_valid(bullet_data.get("node")):
				bullet_data.node.queue_free()
			if is_instance_valid(bullet_data.get("trail")):
				bullet_data.trail.queue_free()
			if is_instance_valid(bullet_data.get("flash")):
				bullet_data.flash.queue_free()
		node._active_bullets.clear()
	# Also clean entire bullet pool (includes inactive bullets with visible flashes)
	if "_bullet_pool" in node:
		for b in node._bullet_pool:
			if is_instance_valid(b.get("node")):
				b.node.queue_free()
			if is_instance_valid(b.get("trail")):
				b.trail.queue_free()
			if is_instance_valid(b.get("flash")):
				b.flash.queue_free()
		node._bullet_pool.clear()
	if "_active_arrows" in node:
		for arrow_data in node._active_arrows:
			if is_instance_valid(arrow_data.get("node")):
				arrow_data.node.queue_free()
		node._active_arrows.clear()
	# Mage Tower pools orbs as dicts {node, active, target} (not bare nodes) in
	# `_pool`, with in-flight orbs also referenced in `_active`. Free the orb
	# nodes so a destroyed tower's projectiles vanish instead of freezing —
	# physics_process was just turned off, so they can no longer move themselves.
	if "_pool" in node:
		for p in node._pool:
			if p is Dictionary:
				if is_instance_valid(p.get("node")):
					p.node.queue_free()
			elif is_instance_valid(p):
				p.queue_free()
		node._pool.clear()
	if "_active" in node:
		node._active.clear()
	# Free all children EXCEPT the base outline (MeshInstance3D with ShaderMaterial)
	for child in node.get_children():
		if child is MeshInstance3D and child.material_override is ShaderMaterial:
			continue
		child.queue_free()
	# Add BrokenModel in place of the old model
	var ruins_model: Node3D = _ruins_res.instantiate()
	var s: float = RUINS_SCALE
	ruins_model.scale = Vector3(s, s, s)
	ruins_model.position.y = 0.07
	node.add_child(ruins_model)
	node.set_meta("is_ruins", true)
	# Pop-in animation
	ruins_model.scale = Vector3.ZERO
	var tw: Tween = create_tween()
	tw.tween_property(ruins_model, "scale", Vector3(s, s, s), 0.3).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


## Spawns a brief OmniLight3D inside the building to brighten it on hit.
func _flash_building_hit(b: Dictionary) -> void:
	var node: Node3D = b.get("node")
	if not is_instance_valid(node):
		return
	b["_flashing"] = true
	# Wobble — push away from nearest attacker then snap back
	var push_dir: Vector3 = Vector3.ZERO
	var bpos: Vector3 = node.global_position
	var nearest_d: float = INF
	for troop in BaseTroop._get_troops_cached():
		if not is_instance_valid(troop):
			continue
		var diff: Vector3 = bpos - troop.global_position
		diff.y = 0
		var d: float = diff.length()
		if d > 0.001 and d < nearest_d:
			nearest_d = d
			push_dir = diff.normalized()
	if push_dir == Vector3.ZERO:
		push_dir = Vector3(randf_range(-1, 1), 0, randf_range(-1, 1)).normalized()
	# Wobble only the GLB model, not the outline
	var model_node: Node3D = null
	for child in node.get_children():
		if child is Node3D and not (child is MeshInstance3D and child.material_override is ShaderMaterial) and not (child is OmniLight3D) and not (child is AnimationPlayer):
			model_node = child
			break
	var tw: Tween = create_tween()
	if model_node and is_instance_valid(model_node):
		var original_pos: Vector3 = model_node.position
		var wobble_pos: Vector3 = original_pos + Vector3(push_dir.x * 0.006, 0, push_dir.z * 0.006)
		tw.tween_property(model_node, "position", wobble_pos, 0.04).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		tw.tween_property(model_node, "position", original_pos, 0.08).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_callback(func():
		b["_flashing"] = false
	)


func _get_hp_for(def: Dictionary, level: int) -> int:
	var hp: int = 1000
	if def.has("hp_levels"):
		var idx = clampi(level - 1, 0, def.hp_levels.size() - 1)
		hp = int(def.hp_levels[idx])
	if bool(def.get("altar_ward_bonus", false)):
		var ward_pct: int = _get_altar_skill_bonus_pct("ward")
		if ward_pct > 0:
			hp = ceili(float(hp) * (1.0 + float(ward_pct) / 100.0))
	return hp


func _create_port_panel() -> void:
	if not canvas:
		return
	port_panel = PanelContainer.new()
	port_panel.visible = false
	port_panel.custom_minimum_size = Vector2(380, 500)
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
	port_panel.offset_left = -190
	port_panel.offset_right = 190
	port_panel.offset_top = -250
	port_panel.offset_bottom = 250
	canvas.add_child(port_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	port_panel.add_child(margin)

	var port_scroll = ScrollContainer.new()
	port_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(port_scroll)

	port_vbox = VBoxContainer.new()
	port_vbox.add_theme_constant_override("separation", 10)
	port_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	port_scroll.add_child(port_vbox)


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

	var port_node = b.get("node", null)
	var has_ship = is_instance_valid(port_node) and port_node.has_meta("has_ship")
	var ship_level: int = clampi(int(port_node.get_meta("ship_level", 0)), 0, MAX_PORT_SHIP_LEVEL) if has_ship and is_instance_valid(port_node) else 0
	var ship_capacity: int = ship_level * 3  # Lv1=3, Lv2=6, Lv3=9
	var ship_troops: Array = port_node.get_meta("ship_troops", []) if has_ship and is_instance_valid(port_node) else []

	if has_ship:
		# Ship info
		var ship_name = ["", "Small Ship", "Medium Ship", "Large Ship"][clampi(ship_level, 0, 3)]
		var info_lbl = Label.new()
		info_lbl.text = "%s (Lv.%d) — Crew: %d / %d" % [ship_name, ship_level, ship_troops.size(), ship_capacity]
		info_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		info_lbl.add_theme_color_override("font_color", Color(0.7, 0.9, 1.0))
		port_vbox.add_child(info_lbl)

		# Show loaded troops (aggregate filler sentinels into the preceding troop)
		if ship_troops.size() > 0:
			var display_idx: int = 0
			for i in range(ship_troops.size()):
				var troop_name: String = ship_troops[i]
				if troop_name == "_SLOT_FILLER_":
					continue  # extra capacity used by a multi-slot troop above
				display_idx += 1
				var troop_base_name: String = _troop_entry_base_name(troop_name)
				var tlvl = troop_levels.get(troop_base_name, 1)
				var tdef_d: Dictionary = troop_defs.get(troop_base_name, {})
				var slots_d: int = int(tdef_d.get("slot_cost", 1))
				var slots_suffix: String = "" if slots_d == 1 else " [%d slots]" % slots_d
				var slot_lbl = Label.new()
				slot_lbl.text = "  %d. %s (Lv.%d)%s" % [display_idx, troop_base_name, tlvl, slots_suffix]
				slot_lbl.add_theme_color_override("font_color", Color(0.6, 0.8, 0.6))
				slot_lbl.add_theme_font_size_override("font_size", 14)
				port_vbox.add_child(slot_lbl)

		# Load troop buttons (if ship has space)
		if ship_troops.size() < ship_capacity:
			var load_title = Label.new()
			load_title.text = "Load troop onto ship:"
			load_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			load_title.add_theme_color_override("font_color", Color(0.8, 0.8, 0.6))
			load_title.add_theme_font_size_override("font_size", 14)
			port_vbox.add_child(load_title)
			var ship_free: int = ship_capacity - ship_troops.size()
			for troop_name in troop_defs.keys():
				if troop_name == "DemonKing" or troop_name == "FireDragon":
					continue
				var tlvl = troop_levels.get(troop_name, 0)
				if tlvl < 1:
					continue
				var tdef_l: Dictionary = troop_defs[troop_name]
				var slot_cost_l: int = int(tdef_l.get("slot_cost", 1))
				var slot_suffix_l: String = "" if slot_cost_l == 1 else " · %d slots" % slot_cost_l
				var load_btn = Button.new()
				load_btn.text = "Load %s (Lv.%d)%s" % [troop_name, tlvl, slot_suffix_l]
				load_btn.custom_minimum_size = Vector2(0, 36)
				if ship_free >= slot_cost_l:
					_style_button(load_btn, Color(0.2, 0.4, 0.3), Color(0.25, 0.5, 0.35))
				else:
					_style_button(load_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
					load_btn.disabled = true
				var tn = troop_name
				load_btn.pressed.connect(func(): _load_troop_to_ship(tn))
				port_vbox.add_child(load_btn)
		else:
			var full_lbl = Label.new()
			full_lbl.text = "Ship is full!"
			full_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			full_lbl.add_theme_color_override("font_color", Color(0.9, 0.6, 0.3))
			port_vbox.add_child(full_lbl)
	else:
		# No ship — buy buttons for each available level
		var no_ship_lbl = Label.new()
		no_ship_lbl.text = "No ship docked"
		no_ship_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		no_ship_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
		port_vbox.add_child(no_ship_lbl)

		for slvl in range(1, level + 1):
			var ship_names = ["", "Small Ship (1 slot)", "Medium Ship (2 slots)", "Large Ship (3 slots)"]
			var buy_btn = Button.new()
			buy_btn.text = "Buy %s (%d Gold)" % [ship_names[slvl], SHIP_COST_GOLD]
			buy_btn.custom_minimum_size = Vector2(0, 44)
			if resources.get("gold", 0) >= SHIP_COST_GOLD:
				_style_button(buy_btn, Color(0.15, 0.35, 0.55), Color(0.2, 0.45, 0.65))
			else:
				_style_button(buy_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
				buy_btn.disabled = true
			var sl = slvl
			buy_btn.pressed.connect(func(): _buy_ship_level(sl))
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


# ── Ship Info Panel (click on ship model) ────────────────────
var ship_info_panel: PanelContainer
var ship_info_vbox: VBoxContainer


## Detects if the mouse click is near a port ship in screen space.
## Returns {"port_node": Node3D} if found, {} otherwise.
func _find_ship_at_click(mouse_pos: Vector2) -> Dictionary:
	var camera = BaseTroop._get_camera_cached()
	if not camera:
		return {}
	var main_ship_controller: Node3D = get_node_or_null("../MainShipController")
	if is_instance_valid(main_ship_controller) and main_ship_controller.visible:
		var main_ship_hit := false
		if main_ship_controller.has_method("is_screen_point_over_ship"):
			main_ship_hit = bool(main_ship_controller.call("is_screen_point_over_ship", camera, mouse_pos, 18.0))
		else:
			var main_ship_screen: Vector2 = camera.unproject_position(main_ship_controller.global_position)
			main_ship_hit = mouse_pos.distance_to(main_ship_screen) < 90.0
		if main_ship_hit:
			return {"main_ship": true, "ship_node": main_ship_controller}
	for bs_node in _building_systems:
		for b in bs_node.placed_buildings:
			if b.get("id") != "port":
				continue
			var pnode = b.get("node", null)
			if not is_instance_valid(pnode) or not pnode.has_meta("ship_node"):
				continue
			var ship = pnode.get_meta("ship_node")
			if not is_instance_valid(ship):
				continue
			var screen_pos = camera.unproject_position(ship.global_position)
			if mouse_pos.distance_to(screen_pos) < 60.0:
				return {"port_node": pnode}
	return {}


## Shows the React load-troops modal for a port ship.
func _show_ship_panel(ship_data: Dictionary) -> void:
	if bool(ship_data.get("main_ship", false)):
		await _show_main_ship_panel()
		return
	var pnode: Node3D = ship_data.get("port_node")
	if not is_instance_valid(pnode):
		return
	_hide_ship_panel()

	var ship_level: int = clampi(int(pnode.get_meta("ship_level", 1)), 1, MAX_PORT_SHIP_LEVEL)
	var ship_troops: Array = pnode.get_meta("ship_troops", [])

	# Find the port building dict that owns this node (search all building systems)
	var port_building: Dictionary = {}
	for bsys in _building_systems:
		for b in bsys.placed_buildings:
			if b.get("node") == pnode:
				port_building = b
				break
		if not port_building.is_empty():
			break
	if port_building.is_empty():
		return

	# Set selected_building so swap/load can find server_id
	selected_building = port_building

	var fleet_ship_troops: Array = []
	for bsys in _building_systems:
		for b in bsys.placed_buildings:
			if b.get("id") != "port":
				continue
			var fleet_port: Node3D = b.get("node", null)
			if not is_instance_valid(fleet_port) or not fleet_port.get_meta("has_ship", false):
				continue
			fleet_ship_troops.append({
				"server_id": b.get("server_id", -1),
				"ship_troops": fleet_port.get_meta("ship_troops", []),
			})

	# Send to React as a building_selected with LOAD_TROOPS view hint
	var bridge = _bridge
	if bridge:
		var def = building_defs.get("port", {})
		bridge.send_to_react("building_selected", {
			"id": "port",
			"name": def.get("name", "Port"),
			"level": port_building.get("level", 1),
			"hp": port_building.get("hp", 500),
			"max_hp": port_building.get("max_hp", 500),
			"max_level": def.get("hp_levels", []).size(),
			"next_hp": 600,
			"upgrade_cost": {},
			"is_enemy": is_viewing_enemy,
			"is_barn": false,
			"is_upgrading": false,
			"has_ship": true,
			"ship_level": ship_level,
			"ship_troops": ship_troops,
			"fleet_ship_troops": fleet_ship_troops,
			"ship_capacity": ship_level * 3,
			"ship_cost": def.get("ship_cost", {}),
			"troop_levels": troop_levels,
			"server_id": port_building.get("server_id", -1),
			"open_load_troops": true,
		})


func _show_main_ship_panel() -> void:
	var ship: Dictionary
	if test_mode:
		ship = _test_player_ship_snapshot()
	else:
		if _block_without_server("open main ship"):
			return
		var net: Node = _net
		if net == null or not net.has_method("get_player_ship"):
			_show_error("Main ship service is not ready yet")
			return
		var result: Dictionary = await net.get_player_ship()
		if not is_instance_valid(self):
			return
		if result.has("error"):
			_show_error(str(result.get("error", "Unable to load main ship")))
			return
		var ship_value: Variant = result.get("ship", result)
		if not (ship_value is Dictionary):
			_show_error("Main ship service returned invalid data")
			return
		ship = ship_value
	selected_building = {"id": "main_ship", "server_id": "main_ship", "node": get_node_or_null("../MainShipController")}
	_send_main_ship_panel(ship)


func _test_player_ship_snapshot() -> Dictionary:
	var controller: Node = get_node_or_null("../MainShipController")
	var level: int = 3
	var troops: Array = [
		"Knight:l2",
		"Knight:l2",
		"Mage:l2",
		"Archer:l2",
		"DemonKing:rEpic:nft_test",
		"_SLOT_FILLER_",
		"FireDragon:rCommon:nft_test_dragon",
		"_SLOT_FILLER_",
	]
	if is_instance_valid(controller):
		level = clampi(int(controller.get_meta("ship_level", level)), 1, MAX_PLAYER_SHIP_LEVEL)
		var troops_value: Variant = controller.get_meta("ship_troops", troops)
		if troops_value is Array:
			troops = troops_value.duplicate(true)
	var capacity: int = int(PLAYER_SHIP_LEVELS.get(level, {}).get("capacity", troops.size()))
	if is_instance_valid(controller):
		capacity = int(controller.get_meta("ship_capacity", capacity))
	return {
		"id": "test_main_ship",
		"level": level,
		"capacity": maxi(capacity, troops.size()),
		"troops": troops,
	}


func _send_main_ship_panel(ship: Dictionary) -> void:
	var bridge: Node = _bridge
	if bridge == null:
		return
	var level: int = clampi(int(ship.get("level", ship.get("ship_level", 1))), 1, MAX_PLAYER_SHIP_LEVEL)
	var troops_value: Variant = ship.get("troops", ship.get("ship_troops", []))
	var troops: Array = troops_value.duplicate(true) if troops_value is Array else []
	var current_config: Dictionary = PLAYER_SHIP_LEVELS.get(level, {})
	var next_config: Dictionary = PLAYER_SHIP_LEVELS.get(level + 1, {}) if level < MAX_PLAYER_SHIP_LEVEL else {}
	var next_cost: Dictionary = next_config.get("cost", {})
	var next_capacity: int = int(next_config.get("capacity", current_config.get("capacity", 45)))
	var energy: int = int(ship.get("energy", PLAYER_SHIP_LEVELS.get(level, {}).get("energy", 4)))
	var next_energy: int = int(next_config.get("energy", energy))
	var cannon_damage: int = int(ship.get("cannon_damage", current_config.get("cannon_damage", 500)))
	var cannon_base_cost: int = int(ship.get("cannon_base_cost", current_config.get("cannon_base_cost", 1)))
	var medkit_unlocked: bool = bool(ship.get("medkit_unlocked", current_config.get("medkit_unlocked", false)))
	var freeze_unlocked: bool = bool(ship.get("freeze_unlocked", current_config.get("freeze_unlocked", false)))
	var rage_unlocked: bool = bool(ship.get("rage_unlocked", current_config.get("rage_unlocked", false)))
	var skeleton_barrel_unlocked: bool = bool(ship.get("skeleton_barrel_unlocked", current_config.get("skeleton_barrel_unlocked", false)))
	bridge.send_to_react("building_selected", {
		"id": "main_ship",
		"name": "Main Ship",
		"level": level,
		"max_level": MAX_PLAYER_SHIP_LEVEL,
		"is_enemy": false,
		"has_ship": true,
		"ship_level": level,
		"ship_troops": troops,
		"fleet_ship_troops": [{"server_id": "main_ship", "ship_troops": troops}],
		"ship_capacity": int(ship.get("capacity", PLAYER_SHIP_LEVELS.get(level, {}).get("capacity", troops.size()))),
		"ship_next_capacity": next_capacity,
		"ship_energy": energy,
		"ship_next_energy": next_energy,
		"ship_cannon_damage": cannon_damage,
		"ship_next_cannon_damage": int(next_config.get("cannon_damage", cannon_damage)),
		"ship_cannon_base_cost": cannon_base_cost,
		"ship_next_cannon_base_cost": int(next_config.get("cannon_base_cost", cannon_base_cost)),
		"ship_medkit_unlocked": medkit_unlocked,
		"ship_freeze_unlocked": freeze_unlocked,
		"ship_rage_unlocked": rage_unlocked,
		"ship_skeleton_barrel_unlocked": skeleton_barrel_unlocked,
		"ship_unlocked_abilities": _main_ship_ability_labels(level),
		"ship_next_unlocks": next_config.get("unlocks", []),
		"ship_next_town_hall": int(next_config.get("town_hall", current_config.get("town_hall", 1))),
		"ship_upgrade_cost": next_cost,
		"troop_levels": troop_levels,
		"server_id": "main_ship",
		"open_load_troops": false,
	})


## Hides and frees the ship info panel.
func _hide_ship_panel() -> void:
	if ship_info_panel and is_instance_valid(ship_info_panel):
		ship_info_panel.queue_free()
	ship_info_panel = null
	ship_info_vbox = null


func _buy_ship() -> void:
	_port._buy_ship()

func _buy_ship_level(ship_lvl: int) -> void:
	_port._buy_ship_level(ship_lvl)


func _load_troop_to_ship(troop_name: String, extra: Dictionary = {}) -> void:
	if selected_building.get("id") == "main_ship":
		var result: Dictionary = await _net.load_troop_to_player_ship(troop_name, extra)
		_apply_main_ship_action_result(result)
		return
	_port._load_troop_to_ship(troop_name, extra)


func _upgrade_main_ship() -> void:
	if _block_without_server("upgrade main ship"):
		return
	var result: Dictionary = await _net.upgrade_player_ship()
	_apply_main_ship_action_result(result)


func _apply_main_ship_action_result(result: Dictionary) -> void:
	if not is_instance_valid(self):
		return
	if result.has("error"):
		_show_error(str(result.get("error", "Main ship update failed")))
		return
	if result.has("resources"):
		_apply_resources_from_server(result.resources)
	var ship_value: Variant = result.get("ship", result)
	if not (ship_value is Dictionary):
		_show_error("Main ship update returned invalid data")
		return
	var ship: Dictionary = ship_value
	_send_main_ship_panel(ship)
	_apply_main_ship_state_from_server(ship)

func _reinforce_troops() -> void:
	# Refill all ships with troops that were lost in battle
	var net: Node = _net
	if _block_without_server("reinforce troops"):
		return
	if net and net.has_token():
		var result: Dictionary = await net.reinforce()
		if not is_instance_valid(self): return
		if result.has("error"):
			_show_error(str(result.error))
			return
		# Reload ship troops from server response
		if result.has("ships"):
			var ships_value: Variant = result.get("ships", [])
			if ships_value is Array:
				_apply_ships_from_server(ships_value)
		if result.has("resources"):
			_apply_resources_from_server(result.resources)
		_refresh_port_panel()
		var bridge: Node = _bridge
		if bridge:
			bridge.send_to_react("reinforced", {"cost": result.get("cost", 0), "restored": result.get("restored", 0)})
			# Update React with refreshed ship data for any open panel
			if selected_building.get("id") == "port":
				var pnode = selected_building.get("node")
				if is_instance_valid(pnode) and pnode.has_meta("ship_troops"):
					var ship_level: int = clampi(int(pnode.get_meta("ship_level", 1)), 1, MAX_PORT_SHIP_LEVEL)
					bridge.send_to_react("ship_updated", {
						"ship_troops": pnode.get_meta("ship_troops", []),
						"ship_level": ship_level,
						"ship_capacity": ship_level * 3,
					})

## Legacy live-death hook. Casualties are applied once from /attack/result.
func _on_troop_died(_troop_name: String) -> void:
	return


func _apply_main_ship_state_from_server(ship_data: Dictionary) -> void:
	var troops_value: Variant = ship_data.get("troops", ship_data.get("ship_troops", []))
	var server_troops: Array = troops_value.duplicate(true) if troops_value is Array else []
	var server_level: int = clampi(int(ship_data.get("level", ship_data.get("ship_level", 1))), 1, MAX_PLAYER_SHIP_LEVEL)
	var server_capacity: int = maxi(
		server_troops.size(),
		int(ship_data.get("capacity", ship_data.get("ship_capacity", PLAYER_SHIP_LEVELS.get(server_level, {}).get("capacity", 3))))
	)
	var main_ship_controller: Node = get_node_or_null("../MainShipController")
	if is_instance_valid(main_ship_controller):
		main_ship_controller.set_meta("ship_troops", server_troops)
		main_ship_controller.set_meta("ship_level", server_level)
		main_ship_controller.set_meta("ship_capacity", server_capacity)
	var bridge: Node = _bridge
	if bridge:
		var current_config: Dictionary = PLAYER_SHIP_LEVELS.get(server_level, {})
		var next_config: Dictionary = PLAYER_SHIP_LEVELS.get(server_level + 1, {}) if server_level < MAX_PLAYER_SHIP_LEVEL else {}
		var server_energy: int = int(ship_data.get("energy", current_config.get("energy", 4)))
		var server_cannon_damage: int = int(ship_data.get("cannon_damage", current_config.get("cannon_damage", 500)))
		var server_cannon_base_cost: int = int(ship_data.get("cannon_base_cost", current_config.get("cannon_base_cost", 1)))
		bridge.send_to_react("ship_updated", {
			"ship_troops": server_troops,
			"ship_level": server_level,
			"ship_capacity": server_capacity,
			"ship_energy": server_energy,
			"ship_next_energy": int(next_config.get("energy", server_energy)),
			"ship_cannon_damage": server_cannon_damage,
			"ship_next_cannon_damage": int(next_config.get("cannon_damage", server_cannon_damage)),
			"ship_cannon_base_cost": server_cannon_base_cost,
			"ship_next_cannon_base_cost": int(next_config.get("cannon_base_cost", server_cannon_base_cost)),
			"ship_medkit_unlocked": bool(ship_data.get("medkit_unlocked", current_config.get("medkit_unlocked", false))),
			"ship_freeze_unlocked": bool(ship_data.get("freeze_unlocked", current_config.get("freeze_unlocked", false))),
			"ship_rage_unlocked": bool(ship_data.get("rage_unlocked", current_config.get("rage_unlocked", false))),
			"ship_skeleton_barrel_unlocked": bool(ship_data.get("skeleton_barrel_unlocked", current_config.get("skeleton_barrel_unlocked", false))),
			"ship_unlocked_abilities": _main_ship_ability_labels(server_level),
			"ship_next_unlocks": next_config.get("unlocks", []),
			"ship_next_town_hall": int(next_config.get("town_hall", current_config.get("town_hall", 1))),
			"ship_upgrade_cost": next_config.get("cost", {}),
		})


## Applies authoritative ship data returned by the server after battle or
## reinforcement. Supports the current string main_ship id and legacy numeric
## port ids while clients migrate to the single-ship model.
func _apply_ships_from_server(ships: Array) -> void:
	if ships == null or ships.is_empty():
		return
	for ship_value in ships:
		if not (ship_value is Dictionary):
			continue
		var ship_data: Dictionary = ship_value
		var ship_id_value: Variant = ship_data.get("id", -1)
		if str(ship_id_value).strip_edges() == "main_ship":
			_apply_main_ship_state_from_server(ship_data)
			continue
		var ship_id_text: String = str(ship_id_value).strip_edges()
		if not ship_id_text.is_valid_int():
			push_warning("Ignoring ship payload with invalid id: %s" % ship_id_text)
			continue
		var sid: int = int(ship_id_text)
		var troops_value: Variant = ship_data.get("ship_troops", ship_data.get("troops", []))
		var server_troops: Array = troops_value.duplicate(true) if troops_value is Array else []
		var server_level: int = clampi(int(ship_data.get("level", 1)), 1, MAX_PORT_SHIP_LEVEL)
		for bs_node in _building_systems:
			for b in bs_node.placed_buildings:
				if b.get("server_id") == sid and b.get("id") == "port":
					var pnode = b.get("node")
					if is_instance_valid(pnode):
						pnode.set_meta("ship_troops", server_troops)
						pnode.set_meta("ship_level", server_level)

func _swap_troop_on_ship(slot: int, troop_name: String, extra: Dictionary = {}) -> void:
	if selected_building.get("id") == "main_ship":
		var result: Dictionary = await _net.swap_troop_on_player_ship(slot, troop_name, extra)
		_apply_main_ship_action_result(result)
		return
	_port._swap_troop_on_ship(slot, troop_name, extra)

func _remove_troop_from_ship(slot: int) -> void:
	if selected_building.get("id") == "main_ship":
		var result: Dictionary = await _net.remove_troop_from_player_ship(slot)
		_apply_main_ship_action_result(result)
		return
	_port._remove_troop_from_ship(slot)

func _remove_troop_group_from_ship(slot: int) -> void:
	if selected_building.get("id") == "main_ship":
		var result: Dictionary = await _net.remove_troop_group_from_player_ship(slot)
		_apply_main_ship_action_result(result)
		return
	_port._remove_troop_group_from_ship(slot)

func _animate_main_ship() -> void:
	_port._animate_main_ship()


func _spawn_port_ship(b_override: Dictionary = {}) -> void:
	_port._spawn_port_ship(b_override)


func _create_barn_panel() -> void:
	if not canvas:
		return
	barn_panel = PanelContainer.new()
	barn_panel.visible = false
	barn_panel.custom_minimum_size = Vector2(550, 750)
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
	barn_panel.add_theme_stylebox_override("panel", style)
	barn_panel.anchor_left = 0.5
	barn_panel.anchor_right = 0.5
	barn_panel.anchor_top = 0.5
	barn_panel.anchor_bottom = 0.5
	barn_panel.offset_left = -275
	barn_panel.offset_right = 275
	barn_panel.offset_top = -375
	barn_panel.offset_bottom = 375
	canvas.add_child(barn_panel)

	var margin = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 14)
	margin.add_theme_constant_override("margin_right", 14)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_bottom", 14)
	barn_panel.add_child(margin)

	var scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)

	barn_vbox = VBoxContainer.new()
	barn_vbox.add_theme_constant_override("separation", 10)
	barn_vbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(barn_vbox)


func _refresh_barn_panel() -> void:
	if not barn_vbox:
		return
	for child in barn_vbox.get_children():
		child.queue_free()

	# Building info
	var bld_level = selected_building.get("level", 1)
	var def = building_defs.get(selected_building.get("id", ""), {})
	var bhp = selected_building.get("hp", 0)
	var bmax_hp = selected_building.get("max_hp", 1)

	var title = Label.new()
	title.text = "Barn (Lv. %d)" % bld_level
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
	barn_vbox.add_child(title)

	var hp_label = Label.new()
	hp_label.text = "HP: %d / %d" % [bhp, bmax_hp]
	hp_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hp_label.add_theme_color_override("font_color", Color(0.7, 0.9, 0.7))
	barn_vbox.add_child(hp_label)

	var max_bld_level = def.hp_levels.size() if def.has("hp_levels") else 3
	if bld_level < max_bld_level:
		# Upgrade cost label
		var upgrade_cost: Dictionary = _get_upgrade_cost(def, bld_level + 1)
		var cost_parts: Array = []
		if upgrade_cost.has("gold"):
			cost_parts.append("Gold: %d" % upgrade_cost.gold)
		if upgrade_cost.has("wood"):
			cost_parts.append("Wood: %d" % upgrade_cost.wood)
		if upgrade_cost.has("ore"):
			cost_parts.append("Ore: %d" % upgrade_cost.ore)
		var cost_lbl = Label.new()
		cost_lbl.text = "  ".join(cost_parts) if cost_parts.size() > 0 else "Free"
		cost_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		cost_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
		cost_lbl.add_theme_font_size_override("font_size", 13)
		barn_vbox.add_child(cost_lbl)

		var upgrade_bld_btn = Button.new()
		upgrade_bld_btn.text = "Upgrade Building"
		upgrade_bld_btn.custom_minimum_size = Vector2(0, 50)
		_style_button(upgrade_bld_btn, Color(0.2, 0.45, 0.6), Color(0.25, 0.5, 0.65))
		upgrade_bld_btn.pressed.connect(func():
			_upgrade_selected()
			_refresh_barn_panel()
		)
		barn_vbox.add_child(upgrade_bld_btn)
	elif bld_level >= max_bld_level:
		var max_lbl = Label.new()
		max_lbl.text = "MAX LEVEL"
		max_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		max_lbl.add_theme_color_override("font_color", Color(0.9, 0.8, 0.4))
		barn_vbox.add_child(max_lbl)

	var sep = HSeparator.new()
	barn_vbox.add_child(sep)

	var troops_title = Label.new()
	troops_title.text = "Troops"
	troops_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	troops_title.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8))
	barn_vbox.add_child(troops_title)

	for troop_name in troop_defs.keys():
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
		barn_vbox.add_child(card)

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

		var troop_max_level: int = _get_troop_max_level(troop_name)
		var troop_level_cap: int = _get_troop_level_cap(troop_name)
		if lvl >= troop_max_level:
			var max_label = Label.new()
			max_label.text = "MAX LEVEL"
			max_label.add_theme_color_override("font_color", Color(0.4, 0.8, 0.4))
			max_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			vb.add_child(max_label)
		else:
			var next_lvl = lvl + 1
			var required_barn_level: int = _required_barn_level_for_troop_level(next_lvl)
			var barn_ready: bool = bld_level >= required_barn_level
			var town_hall_ready: bool = next_lvl <= troop_level_cap
			var costs = tdef.costs.get(lvl, tdef.costs.get(next_lvl, {}))
			var cost_text = ""
			for res_name in costs:
				if int(costs[res_name]) <= 0:
					continue
				var res_display = res_name.capitalize()
				if res_name == "ore":
					res_display = "Ore"
				cost_text += "%s: %d  " % [res_display, costs[res_name]]

			var cost_label = Label.new()
			cost_label.add_theme_color_override("font_color", Color(0.7, 0.7, 0.7))
			if lvl == 0:
				cost_label.text = "Train (LVL 1): %s" % cost_text
			elif not town_hall_ready:
				cost_label.text = "Town Hall Lv.%d unlocks LVL %d" % [next_lvl, next_lvl]
			elif not barn_ready:
				cost_label.text = "Barn Lv.%d unlocks LVL %d" % [required_barn_level, next_lvl]
			else:
				cost_label.text = "Upgrade to LVL %d: %s" % [next_lvl, cost_text]
			vb.add_child(cost_label)

			var can_afford = town_hall_ready and barn_ready and _can_afford(costs)
			var btn = Button.new()
			if lvl == 0:
				btn.text = "Train"
			elif not town_hall_ready:
				btn.text = "Upgrade Town Hall First"
			elif not barn_ready:
				btn.text = "Upgrade Barn First"
			else:
				btn.text = "Upgrade"
			btn.custom_minimum_size = Vector2(0, 50)
			if can_afford:
				_style_button(btn, Color(0.2, 0.5, 0.3), Color(0.25, 0.6, 0.35))
			else:
				_style_button(btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
				btn.disabled = true
			var tn = troop_name
			var expected_lvl: int = int(lvl)
			btn.pressed.connect(func(): _upgrade_troop(tn, expected_lvl))
			vb.add_child(btn)

	# ── Buy Troops section ──
	var sep2 = HSeparator.new()
	barn_vbox.add_child(sep2)

	var total_capacity = _get_total_ship_capacity()
	var slots_free = _port._get_free_ship_slots()
	var total_troops = total_capacity - slots_free

	var buy_title = Label.new()
	buy_title.text = "Buy Troops — %d / %d slots" % [total_troops, total_capacity]
	buy_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	buy_title.add_theme_color_override("font_color", Color(0.9, 0.75, 0.3))
	barn_vbox.add_child(buy_title)

	var buy_note = Label.new()
	buy_note.text = "Non-NFT troops cost 100 Gold per occupied ship slot."
	buy_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	buy_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	buy_note.add_theme_color_override("font_color", Color(0.72, 0.64, 0.48))
	buy_note.add_theme_font_size_override("font_size", 12)
	barn_vbox.add_child(buy_note)

	if total_capacity <= 0:
		var no_ship_lbl = Label.new()
		no_ship_lbl.text = "Buy a ship at Port first!"
		no_ship_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		no_ship_lbl.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6))
		barn_vbox.add_child(no_ship_lbl)
	else:
		for troop_name in troop_defs.keys():
			if troop_name == "DemonKing" or troop_name == "FireDragon":
				continue
			var lvl2 = troop_levels[troop_name]
			if lvl2 < 1:
				continue
			var tdef_buy: Dictionary = troop_defs[troop_name]
			var buy_cost: int = int(tdef_buy.get("buy_cost", BUY_TROOP_COST))
			var slot_cost: int = int(tdef_buy.get("slot_cost", 1))
			var buy_btn = Button.new()
			var slot_label: String = "slot" if slot_cost == 1 else "slots"
			buy_btn.text = "Buy %s (Lv.%d) - %d %s" % [troop_name, lvl2, slot_cost, slot_label]
			buy_btn.custom_minimum_size = Vector2(0, 44)
			if slots_free >= slot_cost and resources.get("gold", 0) >= buy_cost:
				_style_button(buy_btn, Color(0.4, 0.35, 0.15), Color(0.5, 0.45, 0.2))
			else:
				_style_button(buy_btn, Color(0.3, 0.3, 0.3), Color(0.35, 0.35, 0.35))
				buy_btn.disabled = true
			var tn2 = troop_name
			buy_btn.pressed.connect(func(): _buy_troop(tn2))
			barn_vbox.add_child(buy_btn)
		if slots_free <= 0 and total_capacity > 0:
			var full_lbl = Label.new()
			full_lbl.text = "All ship slots full!"
			full_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			full_lbl.add_theme_color_override("font_color", Color(0.9, 0.5, 0.3))
			barn_vbox.add_child(full_lbl)

	# Close button
	var close_btn = Button.new()
	close_btn.text = "Close"
	close_btn.custom_minimum_size = Vector2(0, 60)
	_style_button(close_btn, Color(0.5, 0.2, 0.2), Color(0.6, 0.25, 0.25))
	close_btn.pressed.connect(func():
		barn_panel.visible = false
		var cam = get_tree().current_scene.find_child("CameraRig", true, false)
		if cam:
			cam.zoom_blocked = false
	)
	barn_vbox.add_child(close_btn)


func _can_afford(costs: Dictionary) -> bool:
	if test_mode:
		return true
	for res_name in costs:
		if resources.get(res_name, 0) < costs[res_name]:
			return false
	return true


func _get_troop_max_level(troop_name: String) -> int:
	var tdef: Dictionary = troop_defs.get(troop_name, {})
	if tdef.has("max_level"):
		return maxi(1, int(tdef.get("max_level", 1)))
	var costs: Dictionary = tdef.get("costs", {})
	var max_level: int = 1
	for key in costs.keys():
		max_level = maxi(max_level, int(key) + 1)
	return max_level


func _get_troop_level_cap(troop_name: String) -> int:
	var authored_max_level: int = _get_troop_max_level(troop_name)
	if test_mode:
		return authored_max_level
	return mini(authored_max_level, maxi(1, _get_th_level()))


func _is_troop_unlocked(troop_name: String) -> bool:
	if test_mode:
		return true
	var tdef: Dictionary = troop_defs.get(troop_name, {})
	var required_th: int = maxi(1, int(tdef.get("min_town_hall_level", 1)))
	return _get_th_level() >= required_th


func _troop_unlock_error(troop_name: String) -> String:
	var required_th: int = maxi(1, int(troop_defs.get(troop_name, {}).get("min_town_hall_level", 1)))
	return "Upgrade Town Hall to level %d to unlock %s" % [required_th, troop_name]


func _required_barn_level_for_troop_level(troop_level: int) -> int:
	if troop_level >= 5:
		return 5
	return clampi(troop_level, 1, 4)


func _refresh_troop_levels_from_server() -> void:
	var net = _net
	if not net or not net.has_token():
		# No server — just send local levels
		var local_bridge = _bridge
		if local_bridge:
			local_bridge.send_to_react("troop_levels", troop_levels)
		return
	var server_troops = await net.get_troops()
	if server_troops is Array:
		_load_troop_levels_from_server(server_troops)
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


func _upgrade_troop(troop_name: String, expected_level: int = -1) -> void:
	if _server_busy:
		return
	if not _is_troop_unlocked(troop_name):
		_show_error(_troop_unlock_error(troop_name))
		return
	var lvl = troop_levels[troop_name]
	if expected_level > 0 and expected_level != lvl:
		return
	if lvl >= _get_troop_max_level(troop_name):
		return
	var next_lvl = lvl + 1
	if not test_mode and next_lvl > _get_troop_level_cap(troop_name):
		_show_error("Upgrade Town Hall to level %d first" % next_lvl)
		return
	var required_barn_level: int = _required_barn_level_for_troop_level(next_lvl)
	if not test_mode and _get_barn_level() < required_barn_level:
		_show_error("Upgrade Barn to level %d first" % required_barn_level)
		return

	# Ask server first
	var net = _net
	if not test_mode:
		if _block_without_server("upgrade troop"):
			return
		_server_busy = true
		var result = await net.upgrade_troop(troop_name, lvl)
		_server_busy = false
		if result.has("error"):
			if str(result.get("error", "")) == "Already at max level" or str(result.get("code", "")) == "TROOP_LEVEL_CHANGED":
				await _refresh_troop_levels_from_server()
			if str(result.get("code", "")) == "NFT_TROOP_REQUIRED":
				if _bridge:
					_bridge.send_to_react("nft_troop_required", result)
				_show_error("Connect the required NFT before upgrading this troop.")
				return
			_show_error(str(result.error))
			return
		if result.has("trophies"):
			net.trophies = result["trophies"]
			_update_player_name_label()
		if result.has("resources"):
			_apply_resources_from_server(result["resources"])

	# Server OK — apply locally and refetch to stay in sync
	troop_levels[troop_name] = next_lvl
	if _bridge:
		_bridge.send_to_react("troop_levels", troop_levels)
	var troop = get_tree().current_scene.find_child(troop_name, true, false)
	if troop and troop.has_method("upgrade_to"):
		troop.upgrade_to(next_lvl)
	_play_troop_level_up_sfx()
	_refresh_barn_panel()
	# Refetch from server to ensure React shows authoritative data
	_refresh_troop_levels_from_server()


func _get_total_ship_capacity() -> int:
	return _port._get_total_ship_capacity()


func _buy_troop(troop_name: String) -> void:
	if not _is_troop_unlocked(troop_name):
		_show_error(_troop_unlock_error(troop_name))
		return
	var tdef = troop_defs.get(troop_name, {})
	var model_path: String = tdef.get("model", "")
	var script_path: String = tdef.get("script", "")
	if model_path == "" or script_path == "":
		return
	var buy_cost: int = int(tdef.get("buy_cost", BUY_TROOP_COST))
	var slot_cost: int = int(tdef.get("slot_cost", 1))
	if resources.get("gold", 0) < buy_cost:
		return
	if _port._get_free_ship_slots() < slot_cost:
		return
	# Find port with enough free slots from barn position
	var spawn_pos: Vector3 = _get_building_spawn_pos()
	var port_info: Dictionary = _port._find_port_with_free_slot(spawn_pos, slot_cost)
	if port_info.is_empty():
		return
	# Ask server first
	var net: Node = _net
	if not test_mode:
		if _block_without_server("buy troop"):
			return
		var result: Dictionary = await net.buy_troop(troop_name)
		if result.has("error"):
			_show_error(str(result.error))
			return
		if result.has("resources"):
			resources.gold = result.resources.gold
			resources.wood = result.resources.wood
			resources.ore = result.resources.ore
			_update_resource_ui()
	else:
		resources["gold"] -= buy_cost
		_update_resource_ui()
	# Reserve ship slots immediately. For multi-slot units we append the troop
	# name once and pad with "_SLOT_FILLER_" sentinels so capacity math (which
	# just calls ship_troops.size()) works without any special-casing. The
	# attack deploy loop skips unknown TROOP_DEFS keys, so fillers spawn nothing.
	var port_node: Node3D = port_info.port_node
	var ship_troops: Array = port_node.get_meta("ship_troops", [])
	ship_troops.append(troop_name)
	for _i in range(slot_cost - 1):
		ship_troops.append("_SLOT_FILLER_")
	port_node.set_meta("ship_troops", ship_troops)
	_refresh_barn_panel()
	# Spawn the actual combat troop model (same as attack troops).
	# Reuse AttackSystem's cache so recruitment never re-loads GLBs that are
	# already in memory from the attack path.
	var troop_key: String = AttackSystem._script_to_troop_key(script_path)
	var cached: Dictionary = AttackSystem._troop_res_cache.get(troop_key, {})
	var model_res: Resource = cached.get("model", null)
	var script_res: Resource = cached.get("script", null)
	if model_res == null:
		model_res = _load_packed_scene_resource(model_path)
	if script_res == null:
		script_res = _load_script_resource(script_path)
	if model_res == null or script_res == null:
		return
	var troop: Node3D = model_res.instantiate()
	troop.set_script(script_res)
	troop.name = "RecruitTroop_%d" % (randi() % 99999)
	get_tree().current_scene.add_child(troop)
	var recruit_scale := AttackSystem._scale_for_troop(troop_key, 0.1)
	troop.set("_spawn_scale", recruit_scale)
	troop.scale = Vector3(recruit_scale, recruit_scale, recruit_scale)
	troop.global_position = spawn_pos
	troop.global_position.y = grid_y
	# Don't activate for combat — just walk to the ship
	# Use a tween-based walk with building avoidance
	_walk_troop_to_ship(troop, port_info.pos)


## Walks a recruited troop from its spawn position to the port, avoiding
## buildings along the way. When it arrives, it disappears (boards the ship).
func _walk_troop_to_ship(troop: Node3D, target_pos: Vector3) -> void:
	target_pos.y = grid_y
	var walk_scale: float = troop.scale.x
	# Play run animation
	if troop.has_method("activate"):
		# BaseTroop — set to RUNNING manually without combat targeting
		troop.visible = true
		if troop.has_method("play_boarding_animation"):
			troop.play_boarding_animation()
		elif troop.anim_player and troop.anim_player.has_animation("Running_A"):
			troop.anim_player.play("Running_A")
	var move_speed: float = 0.5
	var avoid_radius: float = 0.2
	var sep_force: float = 0.6
	while is_instance_valid(troop):
		var diff: Vector3 = target_pos - troop.global_position
		diff.y = 0
		# Arrived at port
		if diff.length_squared() < 0.15 * 0.15:
			troop.queue_free()
			return
		var dir: Vector3 = diff.normalized()
		# Building avoidance
		var sep: Vector3 = Vector3.ZERO
		for bs_node in _building_systems:
			for b in bs_node.placed_buildings:
				var bnode: Node3D = b.get("node")
				if not is_instance_valid(bnode):
					continue
				var to_bldg: Vector3 = troop.global_position - bnode.global_position
				to_bldg.y = 0
				var bd: float = to_bldg.length()
				if bd < avoid_radius and bd > 0.001:
					sep += to_bldg.normalized() * (avoid_radius - bd) / avoid_radius * 2.0
		var delta: float = get_process_delta_time()
		var velocity: Vector3 = dir * move_speed + sep * sep_force
		velocity.y = 0
		troop.global_position += velocity * delta
		troop.global_position.y = grid_y
		if troop.has_method("apply_boarding_flight"):
			troop.apply_boarding_flight(delta)
		# Face movement direction (model faces -Z)
		var face_dir: Vector3 = velocity.normalized()
		if face_dir.length_squared() > 0.001:
			var face_target: Vector3 = troop.global_position + face_dir
			face_target.y = troop.global_position.y
			troop.look_at(face_target, Vector3.UP)
			troop.rotate_y(PI)
		troop.scale = Vector3(walk_scale, walk_scale, walk_scale)
		await get_tree().process_frame
	# Troop was freed externally (e.g. scene change)
	return


func _get_building_spawn_pos() -> Vector3:
	var bnode = selected_building.get("node", null)
	if is_instance_valid(bnode):
		var angle = randf_range(0, TAU)
		var offset = Vector3(cos(angle) * 0.2, 0, sin(angle) * 0.2)
		var pos = bnode.global_position + offset
		pos.y = grid_y
		return pos
	return _get_random_grid_world_pos()


func _get_random_grid_world_pos() -> Vector3:
	var half_x = grid_extent_x * 0.4
	var half_z = grid_extent_z * 0.4
	var rx = randf_range(-half_x, half_x)
	var rz = randf_range(-half_z, half_z)
	var world = to_global(Vector3(rx, 0, rz))
	world.y = grid_y
	return world




func _on_attack_pressed() -> void:
	var fleet: Array = await _build_fleet()
	var attack_system = get_node_or_null("../AttackSystem")
	if attack_system and attack_system.has_method("enter_attack_mode"):
		attack_system.enter_attack_mode(fleet)


## Refreshes ship_troops meta on all ports from the authoritative server state.
## Called before assembling the fleet so the client and server agree on loadouts.
func _refresh_player_ship_from_server() -> Dictionary:
	var net: Node = _net
	if not net or not net.has_token():
		return {}
	var result: Dictionary = await net.get_player_ship()
	if not is_instance_valid(self):
		return {}
	if result.has("error"):
		push_warning("Player ship refresh failed: %s" % str(result.get("error", "unknown error")))
		return {}
	return result.get("ship", result)


## Builds the fleet array from all port ships for the attack system.
## Returns [{level: int, troops: [String]}] — one entry per ship with troops.
## NOTE: Fleet contains ONLY purchased troops. Empty ships are excluded.
## The previous auto-fill behaviour was a desync/cheat source — see code review.
func _build_fleet() -> Array:
	var player_ship: Dictionary = await _refresh_player_ship_from_server()
	if not is_instance_valid(self):
		return []
	if not player_ship.is_empty():
		var troops_value: Variant = player_ship.get("troops", player_ship.get("ship_troops", []))
		var ship_troops: Array = troops_value.duplicate(true) if troops_value is Array else []
		if not ship_troops.is_empty():
			var template_value: Variant = player_ship.get("troop_template", ship_troops)
			return [{
				"id": str(player_ship.get("id", "main_ship")),
				"level": clampi(int(player_ship.get("level", player_ship.get("ship_level", 1))), 1, MAX_PLAYER_SHIP_LEVEL),
				"capacity": int(player_ship.get("capacity", player_ship.get("ship_capacity", ship_troops.size()))),
				"troops": ship_troops,
				"troop_template": template_value.duplicate(true) if template_value is Array else ship_troops.duplicate(true),
			}]
	# TestMain remains fully playable without a local server session.
	if test_mode:
		var test_ship := _test_player_ship_snapshot()
		return [test_ship] if not test_ship.get("troops", []).is_empty() else []
	return []


func _get_all_port_ships() -> Array:
	return _port._get_all_port_ships()


func _sail_ships_away() -> void:
	_battle._hide_home_fleet_for_transition()


func _restore_ships_and_troops() -> void:
	_battle._restore_ships_and_troops()


## Compatibility entry point: clouds are already closed and the home fleet is
## hidden without playing a departure animation.
func _switch_to_enemy_island_after_sail() -> void:
	await _battle._switch_to_enemy_island_covered()


func _find_nearest_port_with_ship(from_pos: Vector3) -> Vector3:
	return _port._find_nearest_port_with_ship(from_pos)


func _on_find_pressed(tournament_id: int = 0) -> void:
	await _battle._on_find_pressed(tournament_id)


## Cannon energy is tracked client-side in replay model.
## Starting energy comes from Main Ship level; destroyed buildings grant +2.
func _on_building_destroyed_energy() -> void:
	_cannon._on_building_destroyed_energy()

func _update_cannon_energy_ui() -> void:
	_cannon._update_cannon_energy_ui()


func _get_or_create_cloud() -> Node:
	# Reuse existing or create new CloudTransition
	var existing = get_node_or_null("/root/BattleCloudTransition")
	if existing:
		return existing
	var cloud_script = _load_script_resource("res://scripts/cloud_transition.gd")
	var cloud = CanvasLayer.new()
	cloud.name = "BattleCloudTransition"
	cloud.set_script(cloud_script)
	cloud.auto_reveal = false
	get_tree().root.add_child(cloud)
	return cloud


func _hide_all_collect_icons() -> void:
	_production._hide_all_collect_icons()


func _switch_to_enemy_island() -> void:
	await _battle._switch_to_enemy_island()


## Start replay playback — loads buildings snapshot and replays recorded actions.
func _start_replay(replay_data: Array, buildings_snapshot: Array, attacker_name: String, duration: float = 0.0, replay_label: String = "", base_owner_name: String = "", replay_result: Dictionary = {}) -> void:
	await _battle._start_replay(replay_data, buildings_snapshot, attacker_name, duration, replay_label, base_owner_name, replay_result)


## Plays back recorded actions at their original timestamps.
func _replay_playback() -> void:
	await _battle._replay_playback()


## Replay a ship placement action.
func _replay_place_ship(action: Dictionary, attack_system: Node) -> void:
	_battle._replay_place_ship(action, attack_system)


func _replay_deploy_troop(action: Dictionary, attack_system: Node) -> void:
	_battle._replay_deploy_troop(action, attack_system)


## Replay a cannon fire action.
func _replay_cannon_fire(action: Dictionary) -> void:
	_battle._replay_cannon_fire(action)


func _start_attack_ship_waves(ship: Node3D) -> void:
	_cannon._start_attack_ship_waves(ship)


func _stop_attack_ship_waves() -> void:
	_cannon._stop_attack_ship_waves()


func _spawn_ship_flash(pos: Vector3) -> void:
	_cannon._spawn_ship_flash(pos)


func _update_ship_flash(delta: float) -> void:
	_cannon._update_ship_flash(delta)


func _preload_explosion_textures() -> void:
	_cannon._preload_explosion_textures()


func _spawn_ship_explosion(pos: Vector3) -> void:
	_cannon._spawn_ship_explosion(pos)


func _update_ship_explosion(delta: float) -> void:
	_cannon._update_ship_explosion(delta)



func _spawn_target_ring(pos: Vector3, b_def: Dictionary) -> void:
	_cannon._spawn_target_ring(pos, b_def)


func _check_ship_cannon_click(mouse_pos: Vector2) -> bool:
	return _cannon._check_ship_cannon_click(mouse_pos)


func _enter_ship_cannon_mode() -> void:
	_cannon._enter_ship_cannon_mode()


func _exit_ship_cannon_mode() -> void:
	_cannon._exit_ship_cannon_mode()


# ── Rally pointer proxies ────────────────────────────────────
func _check_ship_rally_click(mouse_pos: Vector2) -> bool:
	return _rally._check_ship_rally_click(mouse_pos) if _rally else false


func _enter_ship_rally_mode() -> void:
	if _rally:
		_rally._enter_rally_mode()


func _exit_ship_rally_mode() -> void:
	if _rally:
		_rally._exit_rally_mode()


# Main Ship medkit proxies.
func _enter_ship_medkit_mode() -> void:
	if _medkit:
		_medkit._enter_medkit_mode()


func _exit_ship_medkit_mode() -> void:
	if _medkit:
		_medkit._exit_medkit_mode()


func _enter_ship_freeze_mode() -> void:
	if _freeze:
		_freeze._enter_freeze_mode()


func _exit_ship_freeze_mode() -> void:
	if _freeze:
		_freeze._exit_freeze_mode()


func _enter_ship_rage_mode() -> void:
	if _rage:
		_rage._enter_rage_mode()


func _exit_ship_rage_mode() -> void:
	if _rage:
		_rage._exit_rage_mode()


func _enter_ship_skeleton_barrel_mode() -> void:
	if _skeleton_barrel:
		_skeleton_barrel._enter_barrel_mode()


func _exit_ship_skeleton_barrel_mode() -> void:
	if _skeleton_barrel:
		_skeleton_barrel._exit_barrel_mode()


func _fire_ship_cannon(bdata: Dictionary) -> void:
	_cannon._fire_ship_cannon(bdata)


func _update_ship_cannonballs(delta: float) -> void:
	_cannon._update_ship_cannonballs(delta)


func _on_town_hall_destroyed() -> void:
	_battle._on_town_hall_destroyed()


func _return_home() -> void:
	_battle._return_home()


## Shared arrow mesh + material — built once per session instead of per click.
## Previously each building click allocated 4 arrow MeshInstances with a fresh
## mesh and material, triggering pipeline compile on the first click.
static var _move_arrow_mesh: ImmediateMesh = null
static var _move_arrow_material: StandardMaterial3D = null

static func _get_move_arrow_material() -> StandardMaterial3D:
	if _move_arrow_material == null:
		_move_arrow_material = StandardMaterial3D.new()
		_move_arrow_material.albedo_color = Color(0.1, 0.95, 0.2, 1.0)
		_move_arrow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_move_arrow_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	return _move_arrow_material


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

	# Reuse shared mesh + material across every click. Arrows geometry is
	# identical for every building; only the parent node position/rotation
	# differs.
	if _move_arrow_mesh == null:
		_move_arrow_mesh = _make_arrow_mesh()
	var arrow_mesh := _move_arrow_mesh
	var mat := _get_move_arrow_material()

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
	if not test_mode and _block_without_server("move building"):
		return
	# Cancel any ongoing move on other building systems
	for bs in _building_systems:
		if bs != self and bs._is_moving:
			bs._cancel_move(false)
	_is_moving = true
	_set_collection_icons_suppressed_for_all(true)
	_move_source_gp = b.grid_pos
	_move_last_grid_step_gp = _move_source_gp
	_move_source_pos = b["node"].position
	var def = building_defs[b.id]
	_despawn_port_ship_for_move(b)
	# Free grid cells temporarily so validity check works while dragging
	_set_grid_occupied(b.grid_pos, def.cells, false)
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
	if gp != _move_last_grid_step_gp:
		_play_building_grid_step_sfx()
		_move_last_grid_step_gp = gp
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
		var created_material = StandardMaterial3D.new()
		created_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		created_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		created_material.cull_mode = BaseMaterial3D.CULL_DISABLED
		created_material.render_priority = 3
		_move_indicator.material_override = created_material
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
	var net = _net
	if not test_mode:
		if _block_without_server("move building"):
			_cancel_move()
			return
		if b.get("server_id", -1) < 0:
			_show_error("Building not synced to server")
			_cancel_move()
			return
		_server_busy = true
		var result = await net.move_building(b.server_id, current_grid_pos.x, current_grid_pos.y)
		_server_busy = false
		if not is_instance_valid(self):
			return
		if result.has("error"):
			_show_error(str(result.error))
			_cancel_move()
			return
	# Occupy new grid cells
	_set_grid_occupied(current_grid_pos, def.cells, true)
	b["grid_pos"] = current_grid_pos
	# b.node is already at the new position (moved by _update_move_building)
	# Tombstone: respawn dead skeletons and relocate alive ones
	if b.id == "tombstone":
		var existing_skeletons: Array = []
		for skel in b.get("skeletons", []):
			if is_instance_valid(skel):
				existing_skeletons.append(skel)
		_spawn_tombstone_skeletons(b, b.get("level", 1), false)
		var tomb_world = b["node"].global_position
		var skeletons: Array = b.get("skeletons", [])
		for i in range(skeletons.size()):
			var skel = skeletons[i]
			if not is_instance_valid(skel):
				continue
			if skel in existing_skeletons and skel.has_method("relocate_to"):
				skel.relocate_to(tomb_world, tomb_world + _tombstone_skeleton_offset(i, int(b.get("level", 1))), 0.0)
			else:
				skel.tombstone_pos = tomb_world
				skel.global_rotation = Vector3.ZERO
	if b.id == "port":
		_respawn_port_ship_after_move(b)
	_play_building_move_sfx()
	_end_move()
	_select_building(b)


func _cancel_move(reselect: bool = true) -> void:
	var b = selected_building
	if b.size() > 0:
		# Restore original grid cells
		var def = building_defs[b.id]
		_set_grid_occupied(_move_source_gp, def.cells, true)
		# Move building back to original position
		if is_instance_valid(b.get("node", null)):
			b["node"].position = _move_source_pos
			# Tombstone: restore skeletons' tombstone_pos (they stay where they are)
			if b.id == "tombstone" and b.has("skeletons"):
				var tomb_world = b["node"].global_position
				for skel in b["skeletons"]:
					if is_instance_valid(skel):
						skel.tombstone_pos = tomb_world
			if b.id == "port":
				_respawn_port_ship_after_move(b)
	_end_move()
	if reselect and b.size() > 0:
		_select_building(b)


func _end_move() -> void:
	_is_moving = false
	_set_collection_icons_suppressed_for_all(false)
	current_building_id = ""
	_move_last_grid_step_gp = Vector2i(-9999, -9999)
	if not always_show_grid:
		_hide_grid()
	if _move_indicator and is_instance_valid(_move_indicator):
		_move_indicator.queue_free()
	_move_indicator = null


func _set_collection_icons_suppressed_for_all(suppressed: bool) -> void:
	var systems: Array = _building_systems
	if systems.is_empty() and is_inside_tree():
		systems = get_tree().get_nodes_in_group("building_systems")
	for system in systems:
		if not is_instance_valid(system):
			continue
		var production := system.get("_production") as BSProduction
		if production:
			production.set_collection_icons_suppressed(suppressed)


func _despawn_port_ship_for_move(b: Dictionary) -> void:
	if b.get("id", "") != "port":
		return
	var pnode: Node3D = b.get("node", null) as Node3D
	if not is_instance_valid(pnode):
		return
	_hide_ship_panel()
	if not pnode.has_meta("ship_node"):
		return
	var ship_node: Node = pnode.get_meta("ship_node", null)
	if is_instance_valid(ship_node):
		ship_node.queue_free()
	pnode.remove_meta("ship_node")


func _respawn_port_ship_after_move(b: Dictionary) -> void:
	if b.get("id", "") != "port":
		return
	var pnode: Node3D = b.get("node", null) as Node3D
	if not is_instance_valid(pnode) or not pnode.has_meta("has_ship"):
		return
	if pnode.has_meta("ship_node") and is_instance_valid(pnode.get_meta("ship_node", null)):
		return
	_spawn_port_ship(b)
	_refresh_port_number_labels()


## Shared materials for the range indicator — two distinct pipeline variants
## (fill = ALPHA + CULL_DISABLED, ring = opaque). Cached so the first
## defense-building click doesn't cold-compile them.
static var _range_fill_mat: StandardMaterial3D = null
static var _range_ring_mat: StandardMaterial3D = null

static func _get_range_fill_material() -> StandardMaterial3D:
	if _range_fill_mat == null:
		_range_fill_mat = StandardMaterial3D.new()
		_range_fill_mat.albedo_color = Color(1.0, 1.0, 1.0, 0.28)
		_range_fill_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_range_fill_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		_range_fill_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
		_range_fill_mat.render_priority = 4
	return _range_fill_mat

static func _get_range_ring_material() -> StandardMaterial3D:
	if _range_ring_mat == null:
		_range_ring_mat = StandardMaterial3D.new()
		_range_ring_mat.albedo_color = Color(1.0, 1.0, 1.0, 1.0)
		_range_ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		_range_ring_mat.render_priority = 5
	return _range_ring_mat


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

	_range_indicator = MeshInstance3D.new()
	_range_indicator.mesh = im
	# Shared cached materials — zero allocation on click, pipelines already warm.
	_range_indicator.set_surface_override_material(0, _get_range_fill_material())
	_range_indicator.set_surface_override_material(1, _get_range_ring_material())
	get_tree().current_scene.add_child(_range_indicator)


func _hide_range_indicator() -> void:
	if _range_indicator and is_instance_valid(_range_indicator):
		_range_indicator.queue_free()
	_range_indicator = null
