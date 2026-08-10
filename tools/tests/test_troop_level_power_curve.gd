extends SceneTree

const KNIGHT_SCRIPT := preload("res://scripts/knight.gd")
const ARCHER_SCRIPT := preload("res://scripts/archer.gd")
const MIMIC_SCRIPT := preload("res://scripts/mimic.gd")
const NECROMANCER_SKELETON_SCRIPT := preload("res://scripts/necromancer_skeleton.gd")
const HORROR_SCRIPT := preload("res://scripts/horror_evolution.gd")
const BUILDING_SYSTEM_SCRIPT := preload("res://scripts/building_system.gd")

const EXPECTED_KNIGHT_HP: Array[int] = [369, 492, 936, 1850, 2097, 2763, 3612]
const EXPECTED_KNIGHT_DAMAGE: Array[int] = [31, 44, 92, 202, 255, 374, 546]


func _init() -> void:
	for troop_level in range(1, 8):
		var knight = KNIGHT_SCRIPT.new()
		knight.level = troop_level
		knight._init_stats()
		knight._apply_troop_level_power_curve()
		assert(
			knight.hp == EXPECTED_KNIGHT_HP[troop_level - 1],
			"Knight Lv%d HP power curve mismatch: %d" % [troop_level, knight.hp],
		)
		assert(
			knight.damage == EXPECTED_KNIGHT_DAMAGE[troop_level - 1],
			"Knight Lv%d damage power curve mismatch: %d" % [troop_level, knight.damage],
		)
		knight.free()

	var archer = ARCHER_SCRIPT.new()
	archer.level = 7
	archer._init_stats()
	archer._apply_troop_level_power_curve()
	assert(archer.hp == 2025, "Level-7 Archer HP balance regression")
	assert(archer.damage == 736, "Level-7 Archer damage balance regression")
	archer.free()

	var mimic = MIMIC_SCRIPT.new()
	mimic.level = 7
	mimic._init_stats()
	mimic._apply_troop_level_power_curve()
	assert(mimic.hp == 19488, "Level-7 Mimic HP balance regression")
	assert(mimic.damage == 2142, "Level-7 Mimic damage balance regression")
	mimic.free()

	var summon = NECROMANCER_SKELETON_SCRIPT.new()
	summon.level = 7
	summon._init_stats()
	var summon_hp_before: int = summon.hp
	var summon_damage_before: int = summon.damage
	summon._apply_troop_level_power_curve()
	assert(summon.hp == summon_hp_before, "Summoned skeleton HP must use its authored curve")
	assert(
		summon.damage == summon_damage_before,
		"Summoned skeleton damage must use its authored curve",
	)
	summon.free()

	var horror_child = HORROR_SCRIPT.new()
	horror_child.level = 7
	horror_child.evolution_stage = 1
	horror_child.is_evolution_child = true
	horror_child._init_stats()
	horror_child._apply_troop_level_power_curve()
	assert(horror_child.hp == 5585, "Horror descendants must scale with their root troop")
	assert(horror_child.damage == 891, "Horror descendant damage curve mismatch")
	horror_child.free()

	assert(
		is_equal_approx(BUILDING_SYSTEM_SCRIPT.player_ship_troop_power_multiplier(9), 1.0),
		"TH9 must not receive the TH10 primary troop bonus",
	)
	assert(
		is_equal_approx(BUILDING_SYSTEM_SCRIPT.player_ship_troop_power_multiplier(10), 1.394136),
		"TH10 primary troop bonus must remain at the calibrated 1.394136x value",
	)
	assert(
		is_equal_approx(
			BUILDING_SYSTEM_SCRIPT.player_ship_troop_power_multiplier(10, 9, "fire_dragon"),
			0.7667748,
		),
		"TH10 Fire Dragon role correction mismatch",
	)
	assert(
		is_equal_approx(
			BUILDING_SYSTEM_SCRIPT.player_ship_troop_power_multiplier(10, 9, "wind_mage"),
			2.6488584,
		),
		"TH10 Wind Mage role correction mismatch",
	)
	var th10_knight = KNIGHT_SCRIPT.new()
	th10_knight.level = 7
	th10_knight.primary_troop_power_multiplier = (
		BUILDING_SYSTEM_SCRIPT.player_ship_troop_power_multiplier(10, 7, "knight")
	)
	th10_knight._init_stats()
	th10_knight._apply_troop_level_power_curve()
	th10_knight._apply_primary_troop_power_multiplier()
	assert(th10_knight.hp == 10449, "TH10 Knight HP multiplier mismatch")
	assert(th10_knight.damage == 1579, "TH10 Knight damage multiplier mismatch")
	th10_knight.free()

	print(
		"TROOP_LEVEL_POWER_CURVE_OK "
		+ "th1=%d th4=%d th5=%d th6=%d th7=%d"
		% [
			EXPECTED_KNIGHT_HP[0],
			EXPECTED_KNIGHT_HP[3],
			EXPECTED_KNIGHT_HP[4],
			EXPECTED_KNIGHT_HP[5],
			EXPECTED_KNIGHT_HP[6],
		],
	)
	quit(0)
